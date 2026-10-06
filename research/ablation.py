"""Nested-model ablation with token-level cross-fitting and token block bootstrap.

Models: gradient boosting (HistGradientBoosting) and logistic regression.
Feature sets (nested): market | +social | +smart | +both.
Out-of-fold scores: tokens are split into K folds; every row is scored by a model
that never saw ANY row of its token (no cross-token leakage, no within-token
leakage from overlapping labels).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import MARKET, SMART, SOCIAL

SETS = {"market": MARKET, "+social": MARKET + SOCIAL, "+smart": MARKET + SMART, "+both": MARKET + SOCIAL + SMART}
CUTS = (0.01, 0.05)
WINSOR = 0.075  # = 5 x typical 15-bar sigma; forward returns clipped to +-this for significance tests


def make_model(kind, seed=0):
    if kind == "gb":
        return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.08, max_iter=120, min_samples_leaf=100,
                                              l2_regularization=1.0, early_stopping=False, random_state=seed)
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=500))


def token_folds(tokens, k, seed):
    rng = np.random.default_rng(seed)
    u = np.unique(tokens)
    perm = rng.permutation(u)
    fold_of = dict(zip(perm, np.arange(len(u)) % k))
    return np.array([fold_of[t] for t in tokens])


def oof_scores(df, feats, kind, n_folds=4, seed=0, fit_df=None):
    """Token-level K-fold out-of-fold probabilities for df (eligible rows)."""
    X = np.nan_to_num(df[feats].values, nan=0.0, posinf=0, neginf=0)
    y = df["y"].values
    folds = token_folds(df["token"].values, n_folds, seed)
    s = np.zeros(len(df))
    for f in range(n_folds):
        tr, te = folds != f, folds == f
        assert not set(df["token"].values[tr]) & set(df["token"].values[te])  # token-level split
        m = make_model(kind, seed).fit(X[tr], y[tr])
        p = m.predict_proba(X[te])[:, 1]
        # within-fold percentile rank: removes fold-specific intercept shifts (classic CV
        # anti-correlation artefact: a fold trained on a higher base rate scores lower)
        jitter = np.random.default_rng(seed + 17 * f).random(len(p))  # random tie-breaking
        order = np.lexsort((jitter, p))
        rk = np.empty(len(p))
        rk[order] = (np.arange(len(p)) + 0.5) / len(p)
        s[te] = rk
    return s


def fit_predict_transfer(df_train, df_test, feats, kind="gb", seed=0):
    m = make_model(kind, seed).fit(np.nan_to_num(df_train[feats].values), df_train["y"].values)
    return m.predict_proba(np.nan_to_num(df_test[feats].values))[:, 1]


# ------------------------------------------------------------ point metrics
def topk_metrics(score, df, k):
    n = len(df)
    m = max(int(round(k * n)), 1)
    idx = np.argpartition(-score, m - 1)[:m]
    y, fwd, lead = df["y"].values, df["fwd_ret"].values, df["lead_k"].values
    py = y[idx]
    base = y.mean()
    tp_lead = lead[idx][(py == 1) & ~np.isnan(lead[idx])]
    pf = np.sort(fwd[idx])
    wd = pf[: max(len(pf) // 10, 1)].mean()
    return {
        "precision": py.mean(), "recall": py.sum() / max(y.sum(), 1), "lift": py.mean() / base if base > 0 else np.nan,
        "lead_med": np.median(tp_lead) if len(tp_lead) else np.nan,
        "lead_p25": np.percentile(tp_lead, 25) if len(tp_lead) else np.nan,
        "fwd_mean": fwd[idx].mean(), "fwd_mean_w": np.clip(fwd[idx], -WINSOR, WINSOR).mean(),
        "pop_fwd_mean_w": np.clip(fwd, -WINSOR, WINSOR).mean(), "fwd_median": np.median(fwd[idx]), "fwd_worst_decile": wd,
        "pop_fwd_mean": fwd.mean(), "base_rate": base, "n_picked": m,
    }


# ------------------------------------------------------------ block bootstrap
def block_bootstrap(df, scores: dict, B=400, seed=0):
    """Resample TOKENS with replacement (block = all rows of a token). Same draws for all
    models, so differences between models are paired. Returns {(name, cut): dict of arrays}."""
    rng = np.random.default_rng(seed)
    tok = df["token"].values
    u, inv = np.unique(tok, return_inverse=True)
    # outlier-robust inference statistic: rug crashes (-78%) are rare, unpredictable and would
    # dominate / destabilise a bootstrapped mean (a picked set that happens to hold none looks 'better')
    y, fwd = df["y"].values.astype(float), np.clip(df["fwd_ret"].values, -WINSOR, WINSOR)
    orders = {k: np.argsort(-v, kind="stable") for k, v in scores.items()}
    out = {(k, c): {"lift": np.zeros(B), "precision": np.zeros(B), "excess_fwd": np.zeros(B)}
           for k in scores for c in CUTS}
    for b in range(B):
        w = np.bincount(rng.integers(0, len(u), len(u)), minlength=len(u))[inv].astype(float)
        W = w.sum()
        base = (w * y).sum() / W
        pop = (w * fwd).sum() / W
        for name, o in orders.items():
            ws = w[o]
            cw = np.cumsum(ws)
            for c in CUTS:
                j = np.searchsorted(cw, c * W) + 1
                sel = o[:j]
                wt = w[sel]
                prec = (wt * y[sel]).sum() / wt.sum()
                out[(name, c)]["precision"][b] = prec
                out[(name, c)]["lift"][b] = prec / base if base > 0 else np.nan
                out[(name, c)]["excess_fwd"][b] = (wt * fwd[sel]).sum() / wt.sum() - pop
    return out


def summarize_boot(arr, null):
    """95% CI and one-sided p (fraction of bootstrap draws <= null)."""
    a = arr[~np.isnan(arr)]
    return {"lo": np.percentile(a, 2.5), "hi": np.percentile(a, 97.5), "p": (np.sum(a <= null) + 1) / (len(a) + 1)}


# ------------------------------------------------------------ driver
def run_ablation(table, seed=0, n_folds=4, kinds=("gb", "lr"), B=400, sets=None, extra_sets=None):
    df = table[table["eligible"]].reset_index(drop=True)
    sets = dict(SETS if sets is None else sets)
    if extra_sets:
        sets.update(extra_sets)
    scores = {}
    for kind in kinds:
        for sname, feats in sets.items():
            scores[(sname, kind)] = oof_scores(df, feats, kind, n_folds, seed)
    boot = block_bootstrap(df, scores, B=B, seed=seed + 1)
    rows = []
    for (sname, kind), s in scores.items():
        for c in CUTS:
            m = topk_metrics(s, df, c)
            bl = summarize_boot(boot[((sname, kind), c)]["lift"], 1.0)
            bf = summarize_boot(boot[((sname, kind), c)]["excess_fwd"], 0.0)
            rows.append({"set": sname, "model": kind, "cut": c, **m, "lift_lo": bl["lo"], "lift_hi": bl["hi"],
                         "lift_p": bl["p"], "excess_fwd_lo": bf["lo"], "excess_fwd_hi": bf["hi"], "excess_fwd_p": bf["p"]})
    return {"df": df, "scores": scores, "boot": boot, "table": pd.DataFrame(rows)}


def paired_delta(res, a, b, cut, key="lift"):
    """Bootstrap of metric(a) - metric(b) (a, b = (set, model)); p = P(delta <= 0)."""
    d = res["boot"][(a, cut)][key] - res["boot"][(b, cut)][key]
    return {"mean": np.nanmean(d), "lo": np.nanpercentile(d, 2.5), "p": (np.sum(d <= 0) + 1) / (len(d) + 1)}
