"""Memecoin Radar step 1: simulate -> featurize -> ablate -> recovery gates.

    python run_recovery.py            # default: 600 tokens/dataset
    python run_recovery.py --quick    # 300 tokens, fewer bootstrap draws (smoke test)

Prints a PASS/FAIL table; exit code 1 if any gate fails.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

import ablation as AB
import features as F
from sim.generator import SimConfig, export_survivors, generate

pd.set_option("display.width", 220)
pd.set_option("display.max_columns", 40)

ALPHA_FAMILY = 0.05 / 16  # Bonferroni over 4 sets x 2 models x 2 cut-offs
LIFT_FLOOR = 1.25  # a "false signal" must also be economically meaningful ...
FWD_FLOOR = 0.005  # ... i.e. >= 0.5% extra 15-bar return (A at baseline noise earns ~2%)
GATES = []


def gate(name, passed, measured, bar):
    GATES.append((name, bool(passed), measured, bar))


def run(kind, seed, n, noise=1.0, effect=1.0, **kw):
    ds = generate(SimConfig(kind=kind, n_tokens=n, seed=seed, noise=noise, effect=effect))
    tb = F.build_table(ds)
    return ds, tb


def null_flags(tab):
    """Rows of an ablation table that look like a real (significant AND meaningful) signal."""
    lift_flag = (tab["lift_p"] < ALPHA_FAMILY) & (tab["lift"] > LIFT_FLOOR)
    fwd_flag = ((tab["excess_fwd_p"] < ALPHA_FAMILY) & (tab["excess_fwd_lo"] > 0)
                & ((tab["fwd_mean_w"] - tab["pop_fwd_mean_w"]) >= FWD_FLOOR))
    return tab[lift_flag | fwd_flag]


def show(title, tab):
    cols = ["set", "model", "cut", "precision", "recall", "lift", "lift_lo", "lift_hi", "lift_p", "lead_med", "lead_p25",
            "fwd_mean", "fwd_median", "fwd_worst_decile", "pop_fwd_mean", "fwd_mean_w", "pop_fwd_mean_w", "excess_fwd_p"]
    t = tab[cols].copy()
    t["cut"] = (t["cut"] * 100).astype(int).astype(str) + "%"
    print(f"\n=== {title} (base rate {tab['base_rate'].iloc[0]:.3f}) ===")
    print(t.round(3).to_string(index=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-tokens", type=int, default=600)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    n, seed, B = (300, a.seed, 300) if a.quick else (a.n_tokens, a.seed, a.boot)
    Bs = max(B // 3, 200)  # side runs
    t0 = time.time()
    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(exist_ok=True)

    # ---------------------------------------------------------------- datasets
    dsA, tbA = run("A", seed, n)
    dsC, tbC = run("C", seed + 1, n)
    dsG, tbG = run("G", seed + 2, n)
    dsG2, tbG2 = run("G", seed + 3, n)
    print(f"[{time.time()-t0:.0f}s] generated: {n} tokens x {dsA.T} one-minute bars per dataset")

    d2 = generate(SimConfig(kind="A", n_tokens=n, seed=seed))
    gate("0. Simulator reproducible (same seed -> identical data)",
         np.array_equal(d2.price, dsA.price) and np.array_equal(d2.mentions, dsA.mentions), "bit-identical", "equal")

    # ------------------------------------------------ point-in-time audit
    clean_bad = {k: F.audit_point_in_time(d) for k, d in (("A", dsA), ("C", dsC), ("G", dsG))}
    leak_bad = F.audit_point_in_time(dsG, leak=True)
    gate("0b. Point-in-time audit: production features use no future data",
         all(len(v) == 0 for v in clean_bad.values()), f"flagged={sum(len(v) for v in clean_bad.values())}", "0 flagged")

    # ---------------------------------------------------------------- ablations
    resA = AB.run_ablation(tbA, seed, B=B)
    resC = AB.run_ablation(tbC, seed, B=B)
    resG = AB.run_ablation(tbG, seed, B=B)
    resG2 = AB.run_ablation(tbG2, seed + 5, B=B)
    print(f"[{time.time()-t0:.0f}s] ablations done")
    show("A: social leads price", resA["table"])
    show("C: social reactive", resC["table"])
    show("G: pure noise (seed 1)", resG["table"])
    for nm, r in (("A", resA), ("C", resC), ("G", resG), ("G2", resG2)):
        r["table"].to_csv(out_dir / f"ablation_{nm}.csv", index=False)

    # ---------------------------------------------------------------- gate 1: A ranked predictive
    ta = resA["table"]
    best = ta[(ta["set"] == "+both") & (ta["model"] == "gb")].set_index("cut")
    ok1 = all(best.loc[c, "lift_lo"] > 1.0 and best.loc[c, "lift_p"] < 0.01 and best.loc[c, "excess_fwd_p"] < 0.01
              for c in AB.CUTS) and best.loc[0.05, "lift"] >= 2.0
    gate("1. A ranked predictive (+both GB, top1%/5%)", ok1,
         f"lift@1%={best.loc[0.01,'lift']:.1f} [{best.loc[0.01,'lift_lo']:.1f},{best.loc[0.01,'lift_hi']:.1f}], "
         f"lift@5%={best.loc[0.05,'lift']:.1f} [{best.loc[0.05,'lift_lo']:.1f},{best.loc[0.05,'lift_hi']:.1f}], "
         f"fwd p={best.loc[0.05,'excess_fwd_p']:.3f}",
         "CI lo>1, p<.01, lift@5%>=2")
    # ablation ordering on A: social and smart add information beyond market (paired bootstrap)
    d_soc = AB.paired_delta(resA, ("+social", "gb"), ("market", "gb"), 0.05)
    d_smt = AB.paired_delta(resA, ("+smart", "gb"), ("market", "gb"), 0.05)
    d_both = AB.paired_delta(resA, ("+both", "gb"), ("+social", "gb"), 0.05)
    d_both2 = AB.paired_delta(resA, ("+both", "gb"), ("+smart", "gb"), 0.05)
    gate("1b. A ablation: +social, +smart each beat market-only; +both beats each (paired, lift@5%)",
         d_soc["p"] < 0.01 and d_smt["p"] < 0.01 and d_both["p"] < 0.05 and d_both2["p"] < 0.05,
         f"d(+soc-mkt)={d_soc['mean']:.2f} p={d_soc['p']:.3f}; d(+smt-mkt)={d_smt['mean']:.2f} p={d_smt['p']:.3f}; "
         f"d(both-soc)={d_both['mean']:.2f} p={d_both['p']:.3f}; d(both-smt)={d_both2['mean']:.2f} p={d_both2['p']:.3f}",
         "all p<.01 / <.05")
    lead = ta[(ta["set"] == "+both") & (ta["model"] == "gb") & (ta["cut"] == 0.05)].iloc[0]
    mk = ta[(ta["set"] == "market") & (ta["model"] == "gb") & (ta["cut"] == 0.05)].iloc[0]
    print(f"\nLead time (bars from alert until +1 sigma_H move, true positives, top-5%): +both median "
          f"{lead['lead_med']:.0f} / p25 {lead['lead_p25']:.0f}; market-only median {mk['lead_med']:.0f} / p25 {mk['lead_p25']:.0f}")

    # ---------------------------------------------------------------- gate 2: C not predictive
    fl = null_flags(resC["table"])
    gate("2. C not predictive (social reactive)", len(fl) == 0,
         f"{len(fl)}/32 tests flagged; max lift={resC['table']['lift'].max():.2f}, "
         f"min p={resC['table']['lift_p'].min():.3f}", f"0 flagged (p<{ALPHA_FAMILY:.4f} & (lift>{LIFT_FLOOR} or excess fwd>={FWD_FLOOR:.1%}))")

    # ---------------------------------------------------------------- gate 3: G not predictive / near-zero false signals
    flg = [null_flags(r["table"]) for r in (resG, resG2)]
    topA = [r["table"] for r in (resG, resG2)]
    maxlift = max(t["lift"].max() for t in topA)
    gb_both = [t[(t["set"] == "+both") & (t["model"] == "gb") & (t["cut"] == 0.05)]["lift"].iloc[0] for t in topA]
    gate("3. G near-zero false signals (2 seeds, all 32 tests each)",
         all(len(f) == 0 for f in flg) and all(abs(x - 1) < 0.3 for x in gb_both),
         f"flagged={[len(f) for f in flg]}; +both GB lift@5%={[round(x,2) for x in gb_both]}; max lift={maxlift:.2f}",
         f"0 flagged; |lift-1|<0.3")

    # ---------------------------------------------------------------- gate 4: A vs C by timing features
    def last_tokens(tb):
        return tb[(tb["t"] == tb["t"].max()) & tb["eligible"]]
    lA, lC, lG = last_tokens(tbA), last_tokens(tbC), last_tokens(tbG)

    def auc(pos, neg, col):
        y = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
        return roc_auc_score(y, np.r_[pos[col].values, neg[col].values])
    rng = np.random.default_rng(seed)

    def auc_ci(pos, neg, col, nb=300):
        v = []
        for _ in range(nb):
            p = pos.sample(len(pos), replace=True, random_state=int(rng.integers(1e9)))
            q = neg.sample(len(neg), replace=True, random_state=int(rng.integers(1e9)))
            v.append(auc(p, q, col))
        return np.percentile(v, [2.5, 97.5])
    # combine the timing features into one score with a token-level cross-validated logistic model
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_predict
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    ac = pd.concat([lA.assign(lab=1), lC.assign(lab=0)])
    sc = cross_val_predict(make_pipeline(StandardScaler(), LogisticRegression(max_iter=500)),
                           ac[F.TIMING].values, ac["lab"].values, cv=5, method="decision_function")
    auc_comb = roc_auc_score(ac["lab"].values, sc)
    auc_pm, auc_pw = auc(lA, lC, "prec_m"), auc(lA, lC, "prec_w")
    ci_pm = auc_ci(lA, lC, "prec_m")
    ag = auc(lA, lG, "prec_m")
    gate("4. A distinguished from C by timing features (token-level AUC, A vs C)",
         max(auc_comb, auc_pm) >= 0.90 and ci_pm[0] > 0.8 and lA["prec_m"].median() > 0 > lC["prec_m"].median(),
         f"AUC prec_m={auc_pm:.3f} CI[{ci_pm[0]:.2f},{ci_pm[1]:.2f}]; prec_w={auc_pw:.3f}; CV-logit(all timing)={auc_comb:.3f}; "
         f"A-vs-G prec_m={ag:.3f}; median prec_m A={lA['prec_m'].median():+.3f} C={lC['prec_m'].median():+.3f}",
         "AUC>=.90, CI lo>.8, sign A>0>C")

    # transfer: model trained on A, applied to C rows
    dfA, dfC = resA["df"], resC["df"]
    full_feats = AB.SETS["+both"]
    naive_feats = F.MARKET + ["mention_accel", "mention_level", "smart_money_accum", "wallet_level"]
    tr = {}
    for nm, ft in (("with timing", full_feats), ("naive (no timing)", naive_feats)):
        s = AB.fit_predict_transfer(dfA, dfC, ft, "gb", seed)
        bt = AB.block_bootstrap(dfC, {nm: s}, B=Bs, seed=seed)
        tr[nm] = (AB.topk_metrics(s, dfC, 0.05), AB.summarize_boot(bt[(nm, 0.05)]["lift"], 1.0),
                  AB.summarize_boot(bt[(nm, 0.05)]["excess_fwd"], 0.0))
    w, nv = tr["with timing"], tr["naive (no timing)"]
    gate("4b. A-trained model does not hallucinate edge on C (lift@5%)",
         not (w[1]["p"] < 0.01 and w[0]["lift"] > LIFT_FLOOR),
         f"with timing: lift={w[0]['lift']:.2f} p={w[1]['p']:.3f}, fwd_mean={w[0]['fwd_mean']:+.4f}; "
         f"naive: lift={nv[0]['lift']:.2f} p={nv[1]['p']:.3f}, fwd_mean={nv[0]['fwd_mean']:+.4f} (info)",
         f"no sig. lift>{LIFT_FLOOR}")

    # ---------------------------------------------------------------- gate 5: graceful degradation
    sets2 = {"market": AB.SETS["market"], "+both": AB.SETS["+both"]}
    levels = [0.0, 0.5, 1.0, 2.0, 4.0]
    lifts, fwds = [], []
    for lv in levels:
        if lv == 1.0:
            row = ta[(ta["set"] == "+both") & (ta["model"] == "gb") & (ta["cut"] == 0.05)].iloc[0]
            lifts.append(row["lift"]); fwds.append(row["fwd_mean"])
            continue
        _, tb = run("A", seed, n, noise=lv)
        r = AB.run_ablation(tb, seed, kinds=("gb",), B=100, sets=sets2)["table"]
        row = r[(r["set"] == "+both") & (r["cut"] == 0.05)].iloc[0]
        lifts.append(row["lift"]); fwds.append(row["fwd_mean"])
    ex = np.array(lifts) - 1
    mono = all(ex[i + 1] <= ex[i] + 0.25 for i in range(len(ex) - 1))
    no_cliff = all(ex[i + 1] >= 0.4 * ex[i] for i in range(len(ex) - 1) if ex[i] > 0.3)
    still = lifts[-1] > 1.5
    _, tbG4 = run("G", seed + 2, n, noise=4.0)
    rG4 = AB.run_ablation(tbG4, seed, B=B)["table"]
    fG4 = null_flags(rG4)
    g4_res = (rG4["fwd_mean_w"] - rG4["pop_fwd_mean_w"]).max()
    print(f"\nG @ noise=4: max top-k excess winsorised fwd return over 16 models = {g4_res:+.4%} (residual: fake breakouts revert, so avoiding fresh pumps is mildly rewarded)")
    gate("5. Graceful degradation as noise grows (A, +both GB lift@5%) and G stays null at noise=4",
         mono and no_cliff and still and len(fG4) == 0,
         "lift by noise " + ", ".join(f"{lv}:{l:.2f}" for lv, l in zip(levels, lifts)) + f"; G@noise4 flagged={len(fG4)}",
         "monotone(+-.25), each step keeps >=40% of excess, noise4 lift>1.5, G null")
    print("\nA fwd-return mean of top-5% by noise:", ", ".join(f"{lv}:{f:+.4f}" for lv, f in zip(levels, fwds)))

    # ---------------------------------------------------------------- gate 6: leakage injection
    leak_sets = {"+both": AB.SETS["+both"], "+both+LEAK": AB.SETS["+both"] + [F.LEAK]}
    tbGL = F.build_table(dsG, leak=True)
    rL = AB.run_ablation(tbGL, seed, B=Bs, sets=leak_sets)["table"]
    rl = rL[(rL["set"] == "+both+LEAK") & (rL["cut"] == 0.05)]
    rn = rL[(rL["set"] == "+both") & (rL["cut"] == 0.05)]
    leak_found = (rl["lift_p"] < 0.01).all() and (rl["lift"] > 1.5).all()
    nolek = (len(null_flags(resG["table"])) == 0)
    gate("6. Leakage test: injected future-peeking feature is flagged (signal on G only when leaking)",
         leak_found and nolek and leak_bad == [F.LEAK],
         f"G+leak lift@5% gb/lr={rl['lift'].round(2).tolist()} p={rl['lift_p'].round(3).tolist()}; "
         f"G clean lift={rn['lift'].round(2).tolist()}; audit flagged={leak_bad}",
         "leak lift>1.5 & p<.01; clean G null; audit flags exactly the leak")

    # ---------------------------------------------------------------- INFO: survivorship
    dsAs = export_survivors(dsA)
    tbAs = F.build_table(dsAs)
    rAs = AB.run_ablation(tbAs, seed, kinds=("gb",), B=100, sets={"+both": AB.SETS["+both"]})["table"]
    ra = rAs[rAs["cut"] == 0.05].iloc[0]
    full_pop, surv_pop = resA["df"]["fwd_ret"].mean(), tbAs[tbAs["eligible"]]["fwd_ret"].mean()
    print(f"\nSurvivorship: {dsA.N - dsAs.N}/{dsA.N} tokens dropped (dead/flat). Population mean fwd return "
          f"full={full_pop:+.4f} vs survivors={surv_pop:+.4f}; A +both GB top-5% mean fwd full="
          f"{best.loc[0.05,'fwd_mean']:+.4f} vs survivors={ra['fwd_mean']:+.4f}; lift full={best.loc[0.05,'lift']:.2f} "
          f"vs survivors={ra['lift']:.2f}")
    gate("7. [info] Survivorship-biased export inflates apparent returns (bias is measurable)",
         surv_pop > full_pop, f"pop fwd mean full={full_pop:+.4f} surv={surv_pop:+.4f}", "surv > full")

    # ---------------------------------------------------------------- report
    print("\n" + "=" * 100)
    print(f"{'GATE':<92} RESULT")
    print("=" * 100)
    for name, ok, meas, bar in GATES:
        print(f"{name}\n    measured: {meas}\n    bar:      {bar}\n    -> {'PASS' if ok else 'FAIL'}")
    npass = sum(g[1] for g in GATES)
    print("=" * 100)
    print(f"{npass}/{len(GATES)} gates passed  ({time.time()-t0:.0f}s)")
    (out_dir / "gates.json").write_text(json.dumps(
        [{"gate": g[0], "pass": g[1], "measured": g[2], "bar": g[3]} for g in GATES], indent=2))
    sys.exit(0 if npass == len(GATES) else 1)


if __name__ == "__main__":
    main()
