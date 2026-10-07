"""Synthetic memecoin world: structural causal model per token, 1-minute bars.

Datasets
  A  social leads price   : narrative event -> mentions(t) -> smart wallet buys (t+2..t+5)
                            -> price/volume drift (t+5..t+15)
  C  social reactive      : price jump first -> mentions / wallet buys follow (t+1..t+4)
  G  pure noise           : driftless random walk + independent noise streams

Noise layers (all scaled by cfg.noise, 0 = clean, 1 = baseline):
  bot/wash volume bursts, spam mention bursts, fake breakouts (price pump that
  reverts, uncorrelated with latent state), missing + delayed observations,
  stale prices, bot wallet bursts.

Population: ~10% flat tokens (dead from birth), ~20% rugged tokens (price crash
then zero volume). A "survivorship-biased export" drops both.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

DRIFT_SCALE = 0.03  # log-price move per unit event strength at effect=1 (for a 0.4%/min-vol token)


@dataclass(frozen=True)
class SimConfig:
    kind: str = "A"  # 'A' | 'C' | 'G'
    n_tokens: int = 600
    n_bars: int = 720
    seed: int = 0
    effect: float = 1.0  # effect size of the latent state on price (A drift / C jump)
    noise: float = 1.0  # noise-layer multiplier
    event_rate: float = 1 / 100  # latent narrative events per bar per live token
    p_flat: float = 0.10
    p_dead: float = 0.20


@dataclass
class Dataset:
    cfg: SimConfig
    price: np.ndarray  # observed close (stale prints possible), shape (N, T)
    price_true: np.ndarray  # actual market price path (used for labels only)
    volume: np.ndarray  # observed (missing/delayed), USD per bar
    mentions: np.ndarray  # observed mention counts
    wallet: np.ndarray  # observed smart-wallet buy counts
    meta: pd.DataFrame  # per token: sigma, flat, dead, death_t
    latent: dict = field(default_factory=dict)  # simulator internals (never given to models)

    @property
    def N(self):
        return self.price.shape[0]

    @property
    def T(self):
        return self.price.shape[1]

    def subset(self, mask) -> "Dataset":
        mask = np.asarray(mask, bool)
        return Dataset(
            cfg=self.cfg,
            price=self.price[mask], price_true=self.price_true[mask],
            volume=self.volume[mask], mentions=self.mentions[mask], wallet=self.wallet[mask],
            meta=self.meta[mask].reset_index(drop=True),
            latent={k: v[mask] for k, v in self.latent.items()},
        )


# ---------------------------------------------------------------- helpers
def _prefix(x):
    return np.concatenate([np.zeros((x.shape[0], 1)), np.cumsum(x, axis=1)], axis=1)


def lagged_sum(x, lo, hi):
    """y_t = sum_{l=lo..hi} x_{t-l}  (strictly causal for lo>=1; lo=0 includes x_t)."""
    T = x.shape[1]
    S = _prefix(x)
    t = np.arange(T)
    end = np.clip(t - lo + 1, 0, T)
    start = np.clip(t - hi, 0, T)
    return S[:, end] - S[:, start]


def lagged_mean(x, lo, hi):
    return lagged_sum(x, lo, hi) / (hi - lo + 1)


def causal_conv(x, kernel):
    y = np.zeros_like(x, dtype=float)
    T = x.shape[1]
    for j, k in enumerate(kernel):
        if j == 0:
            y += k * x
        elif j < T:
            y[:, j:] += k * x[:, :-j]
    return y


def _ar1(rng, N, T, rho):
    e = rng.standard_normal((N, T))
    a = np.zeros((N, T))
    a[:, 0] = e[:, 0]
    s = np.sqrt(1 - rho ** 2)
    for t in range(1, T):
        a[:, t] = rho * a[:, t - 1] + s * e[:, t]
    return a


def _decay(e, rho):
    n = np.zeros_like(e)
    n[:, 0] = e[:, 0]
    for t in range(1, e.shape[1]):
        n[:, t] = rho * n[:, t - 1] + e[:, t]
    return n


def _observe(rng, x, p_miss, p_delay):
    """Missing (lost) and delayed (arrive 1-3 bars late) observations."""
    N, T = x.shape
    x = x.copy()
    delayed = rng.random((N, T)) < p_delay
    shift = rng.integers(1, 4, (N, T))
    moved = np.where(delayed, x, 0.0)
    x = x - moved
    rows, cols = np.nonzero(delayed)
    tgt = cols + shift[rows, cols]
    ok = tgt < T
    np.add.at(x, (rows[ok], tgt[ok]), moved[rows[ok], cols[ok]])
    x[rng.random((N, T)) < p_miss] = 0.0
    return x


# ---------------------------------------------------------------- generator
def generate(cfg: SimConfig) -> Dataset:
    rng = np.random.default_rng(cfg.seed)
    N, T, nu = cfg.n_tokens, cfg.n_bars, cfg.noise
    kind = cfg.kind
    assert kind in ("A", "C", "G")
    tgrid = np.arange(T)[None, :]

    # ---- token population
    sigma = 0.004 * np.exp(0.2 * rng.standard_normal(N))
    flat = rng.random(N) < cfg.p_flat
    dead = (~flat) & (rng.random(N) < cfg.p_dead / (1 - cfg.p_flat))
    death_t = np.where(dead, rng.integers(int(0.35 * T), int(0.9 * T), N), T + 10)
    trading = tgrid < (death_t[:, None] + 1)  # price frozen after the rug bar
    alive = tgrid < death_t[:, None]
    live = alive & ~flat[:, None]

    lam0_m = 0.3 * np.exp(0.5 * rng.standard_normal(N))[:, None]
    v0 = 300.0 * np.exp(0.8 * rng.standard_normal(N))[:, None]
    w0 = 0.05

    # ---- latent narrative / smart-money state
    ev_on = (rng.random((N, T)) < cfg.event_rate) & live
    mag = rng.lognormal(0.0, 0.4, (N, T))
    q = rng.beta(2, 2, (N, T))  # smart-money conviction of the event
    e = np.where(ev_on, mag, 0.0)
    if kind == "G":
        e = np.zeros((N, T))
    # what actually moves price; scaled by token vol so event size in sigma units is homogeneous
    strength = e * (0.4 + 0.6 * q) * (sigma[:, None] / 0.004)

    eps = rng.standard_t(5, (N, T)) * np.sqrt(3 / 5)
    base_r = sigma[:, None] * eps

    # ---- price returns + mentions + wallets per scenario
    slow = np.exp(0.3 * _ar1(rng, N, T, 0.99))
    lam_m = lam0_m * slow
    lam_w = np.full((N, T), w0)
    sgn = np.where(rng.random((N, T)) < 0.7, 1.0, -1.0)  # drawn always: keeps RNG stream aligned
    if kind == "A":
        # mentions at t -> wallet buys t+2..t+5 -> price/volume t+5..t+15
        r = base_r + cfg.effect * DRIFT_SCALE * lagged_mean(strength, 5, 15)
        lam_m = lam_m + 4.0 * _decay(e, 0.8)
        lam_w = lam_w + 1.5 * lagged_sum(e * (0.3 + q), 2, 5)
    elif kind == "C":
        # price jumps first; mentions and (copy) wallet buys react afterwards
        r = base_r + sgn * cfg.effect * DRIFT_SCALE * strength
        pos = np.maximum(r, 0.0) / 0.02
        lam_m = lam_m + 4.0 * lagged_sum(pos, 1, 4)
        lam_w = lam_w + 1.5 * lagged_sum(pos, 1, 4)
    else:
        r = base_r

    # ---- noise layers
    # fake breakouts: transient pump that reverts, independent of latent state
    fb_start = (rng.random((N, T)) < 0.004 * nu) & live
    fb_amp = rng.uniform(0.015, 0.04, (N, T))
    shape = np.array([0.3, 0.7, 1.0, 0.8, 0.5, 0.3, 0.15])
    bump = causal_conv(np.where(fb_start, fb_amp, 0.0), shape)
    fb_shape = causal_conv(fb_start.astype(float), shape)
    # spam mention bursts (half of fake breakouts come with spam)
    spam_start = ((rng.random((N, T)) < 0.006 * nu) | (fb_start & (rng.random((N, T)) < 0.5))) & ~flat[:, None]
    lam_m = lam_m + 4.0 * causal_conv(spam_start.astype(float), np.ones(4))
    # bot wallet bursts
    bw_start = (rng.random((N, T)) < 0.003 * nu) & live
    lam_w = lam_w + 1.0 * causal_conv(bw_start.astype(float), np.ones(2))
    # bot/wash volume
    wash_start = (rng.random((N, T)) < 0.01 * nu) & live
    wash = causal_conv(wash_start * rng.uniform(1, 4, (N, T)), np.ones(6))

    # rug for dead tokens, flat tokens barely move
    rug = np.zeros((N, T))
    ok = death_t < T  # single-bar rug (-78%): no in-progress crash to extrapolate
    rug[np.nonzero(ok)[0], death_t[ok]] = -1.5
    r = np.where(trading, r, 0.0) + rug
    bump = np.where(alive, bump, 0.0)
    r = np.where(flat[:, None], r * 0.05, r)
    logp = np.cumsum(r, axis=1) + bump + rng.normal(-6, 1, (N, 1))
    price_true = np.exp(logp)

    # ---- volume
    vol_mult = np.exp(0.5 * rng.standard_normal((N, T)))
    if kind in ("A", "C"):
        vol_mult = vol_mult * (1 + 0.25 * np.minimum(np.abs(r) / sigma[:, None], 6.0))
    if kind == "A":
        vol_mult = vol_mult * (1 + 3.0 * cfg.effect * lagged_mean(strength, 3, 15))
    vol_mult = vol_mult * (1 + 4.0 * fb_shape) * (1 + wash)
    volume = np.where(flat[:, None], v0 * 0.003 * vol_mult, v0 * vol_mult * alive)

    # ---- sample observed streams
    lam_m = np.where(flat[:, None], lam_m * 0.05, lam_m)
    lam_m = np.where(alive | flat[:, None], lam_m, lam_m * 0.1)
    lam_w = np.where(live, lam_w, 0.0)
    mentions = rng.poisson(lam_m).astype(float)
    wallet = rng.poisson(lam_w).astype(float)

    p_miss, p_delay, p_stale = min(0.03 * nu, 0.4), min(0.08 * nu, 0.5), min(0.03 * nu, 0.4)
    mentions = _observe(rng, mentions, p_miss, p_delay)
    wallet = _observe(rng, wallet, p_miss, p_delay)
    volume = _observe(rng, volume, p_miss, p_delay)
    stale = rng.random((N, T)) < p_stale
    stale[:, 0] = False
    idx = np.maximum.accumulate(np.where(stale, 0, np.arange(T)[None, :]), axis=1)
    price = np.take_along_axis(price_true, idx, axis=1)

    meta = pd.DataFrame({"token": np.arange(N), "sigma": sigma, "flat": flat, "dead": dead, "death_t": death_t})
    latent = {"events": e, "q": q, "fake_breakout": fb_start.astype(float), "spam": spam_start.astype(float)}
    return Dataset(cfg, price, price_true, volume, mentions, wallet, meta, latent)


# ---------------------------------------------------------------- exports
def export_full(ds: Dataset) -> Dataset:
    return ds


def export_survivors(ds: Dataset) -> Dataset:
    """Survivorship-biased export: drops dead (rugged) and flat tokens."""
    return ds.subset(~(ds.meta["dead"].values | ds.meta["flat"].values))


def to_long(ds: Dataset) -> pd.DataFrame:
    N, T = ds.N, ds.T
    return pd.DataFrame({
        "token": np.repeat(np.arange(N), T), "minute": np.tile(np.arange(T), N),
        "close": ds.price.ravel(), "volume": ds.volume.ravel(),
        "mentions": ds.mentions.ravel(), "smart_wallet_buys": ds.wallet.ravel(),
    })
