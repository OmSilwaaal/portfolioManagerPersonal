"""Point-in-time features + forward labels.

Convention: a decision at time t may use bars with index < t only (indices 0..t-1,
i.e. the last known close is bar t-1). The label is the forward return from the
close of bar t-1 to the close of bar t-1+H, H=15.

Every feature below is computed from prefix sums over arr[:, :t]; the audit
(`audit_point_in_time`) re-computes features on data physically truncated to
arr[:, :t] and flags any feature whose value changes -> catches future peeking.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

H = 15
WARM = 120
STEP = 5
MIN_VOL = 20.0  # eligibility: trailing 10-bar mean observed volume (point-in-time)

MARKET = ["price_accel", "price_ret_z", "volume_accel", "volume_level", "realized_vol"]
SOCIAL = ["mention_accel", "mention_level", "xc_m_lead", "xc_m_lag", "prec_m", "xc_m_peaklag"]
SMART = ["smart_money_accum", "wallet_level", "xc_w_lead", "xc_w_lag", "prec_w"]
TIMING = ["xc_m_lead", "xc_m_lag", "prec_m", "xc_m_peaklag", "xc_w_lead", "xc_w_lag", "prec_w"]
LEAK = "leak_future_ret"
LAGS = [k for k in range(-15, 16) if k != 0]


def decision_times(T):
    return np.arange(WARM, T - H + 1, STEP)


def _cs(x):
    return np.concatenate([np.zeros((x.shape[0], 1)), np.cumsum(x, axis=1)], axis=1)


def _win(S, a, b):
    return S[:, b] - S[:, a]


def _lag_corr(x, y, ts, Sx, Sy, Sxx, Syy):
    """Expanding-window Pearson corr(x_s, y_{s+k}) for all lags, evaluated at ts.
    Uses only pairs with both indices < t. Returns array (len(LAGS), N, K)."""
    N, T = x.shape
    mx = Sx[:, ts] / ts
    my = Sy[:, ts] / ts
    vx = np.maximum(Sxx[:, ts] / ts - mx ** 2, 0)
    vy = np.maximum(Syy[:, ts] / ts - my ** 2, 0)
    den = np.sqrt(vx * vy) + 1e-9
    out = np.zeros((len(LAGS), N, len(ts)))
    for i, k in enumerate(LAGS):
        j = abs(k)
        prod = np.zeros((N, T))
        if k > 0:  # x leads y: x_{u-k} * y_u
            prod[:, j:] = x[:, :-j] * y[:, j:]
        else:  # y leads x: x_u * y_{u-j}
            prod[:, j:] = x[:, j:] * y[:, :-j]
        Sk = _cs(prod)[:, ts]
        n = ts - j
        out[i] = (Sk / n - mx * my) / den
    return np.clip(out, -1, 1)


def _xc_feats(x, y, ts):
    Sx, Sy, Sxx, Syy = _cs(x), _cs(y), _cs(x * x), _cs(y * y)
    c = _lag_corr(x, y, ts, Sx, Sy, Sxx, Syy)
    lags = np.array(LAGS)
    lead = c[lags >= 2].mean(0)
    lag = c[lags <= -1].mean(0)
    peak = lags[np.argmax(c, axis=0)].astype(float)
    return lead, lag, lead - lag, peak


def compute_features(price, volume, mentions, wallet, ts, leak=False):
    """Vectorised over tokens x decision times. Inputs are (N, T) observed arrays."""
    ts = np.asarray(ts)
    N, T = price.shape
    lp = np.log(price)
    r = np.zeros_like(lp)
    r[:, 1:] = np.diff(lp, axis=1)
    Sr, Srr = _cs(r), _cs(r * r)
    Sv, Sm, Sw = _cs(volume), _cs(mentions), _cs(wallet)

    def rv(w):
        m = _win(Sr, ts - w, ts) / w
        return np.sqrt(np.maximum(_win(Srr, ts - w, ts) / w - m ** 2, 0))

    rv60, rv30 = rv(60), rv(30)
    sc = rv60 * np.sqrt(5) + 1e-4
    ret5 = lp[:, ts - 1] - lp[:, ts - 6]
    prev5 = lp[:, ts - 6] - lp[:, ts - 11]
    f = {
        "price_accel": np.clip((ret5 - prev5) / sc, -10, 10),
        "price_ret_z": np.clip(ret5 / sc, -10, 10),
        "realized_vol": rv30,
    }
    for name, S in (("volume", Sv), ("mention", Sm)):
        m5 = _win(S, ts - 5, ts) / 5
        mb = _win(S, ts - 35, ts - 5) / 30
        f[f"{name}_accel"] = np.log1p(m5) - np.log1p(mb)
        f[f"{name}_level"] = np.log1p(_win(S, ts - 30, ts) / 30)
    f["smart_money_accum"] = _win(Sw, ts - 10, ts) - 10 * _win(Sw, ts - 70, ts - 10) / 60
    f["wallet_level"] = np.log1p(_win(Sw, ts - 30, ts) / 30)
    f["xc_m_lead"], f["xc_m_lag"], f["prec_m"], f["xc_m_peaklag"] = _xc_feats(np.log1p(mentions), r, ts)
    f["xc_w_lead"], f["xc_w_lag"], f["prec_w"], _ = _xc_feats(np.log1p(wallet), r, ts)
    f["trail_vol10"] = _win(Sv, ts - 10, ts) / 10  # eligibility only, not a model input
    if leak:
        # DELIBERATE future peek: price 3 bars after the decision time
        idx = ts - 1 + 3
        v = np.full((N, len(ts)), np.nan)
        ok = idx < T
        v[:, ok] = lp[:, idx[ok]] - lp[:, ts[ok] - 1]
        f[LEAK] = v
    return f


def forward_labels(ds, ts):
    ts = np.asarray(ts)
    lpt = np.log(ds.price_true)
    p0 = lpt[:, ts - 1]
    fwd = lpt[:, ts - 1 + H] - p0
    scale = (ds.meta["sigma"].values * np.sqrt(H))[:, None]
    z = fwd / scale
    lead = np.full(fwd.shape, np.nan)
    for k in range(H, 0, -1):  # first k whose cum return reaches half the label threshold (z >= 1)
        hit = (lpt[:, ts - 1 + k] - p0) / scale >= 1.0
        lead = np.where(hit, k, lead)
    return fwd, z, lead


def build_table(ds, leak=False, ts=None):
    ts = decision_times(ds.T) if ts is None else np.asarray(ts)
    f = compute_features(ds.price, ds.volume, ds.mentions, ds.wallet, ts, leak=leak)
    fwd, z, lead = forward_labels(ds, ts)
    N, K = fwd.shape
    cols = {k: v.ravel() for k, v in f.items()}
    cols["token"] = np.repeat(np.arange(N), K)
    cols["t"] = np.tile(ts, N)
    cols["fwd_ret"] = fwd.ravel()
    cols["fwd_z"] = z.ravel()
    cols["y"] = (z.ravel() > 2.0).astype(int)
    cols["lead_k"] = lead.ravel()
    df = pd.DataFrame(cols)
    df["eligible"] = df["trail_vol10"] >= MIN_VOL  # point-in-time activity filter
    return df.drop(columns="trail_vol10")


def audit_point_in_time(ds, leak=False, times=(200, 400, 650), n_tokens=60):
    """Recompute every feature on data physically truncated to [:t]; return names that differ."""
    feats_full = compute_features(ds.price, ds.volume, ds.mentions, ds.wallet, np.array(times), leak=leak)
    bad = set()
    for i, t in enumerate(times):
        sl = slice(0, t)
        trunc = compute_features(ds.price[:n_tokens, sl], ds.volume[:n_tokens, sl],
                                 ds.mentions[:n_tokens, sl], ds.wallet[:n_tokens, sl],
                                 np.array([t]), leak=leak)
        for k, v in trunc.items():
            full = feats_full[k][:n_tokens, i]
            if not np.allclose(full, v[:, 0], rtol=1e-9, atol=1e-12, equal_nan=True):
                bad.add(k)
    return sorted(bad)
