# Memecoin Radar - research step 1: simulator + recovery test

Question answered here: if information-flow signals (mentions, smart-wallet buys) really do lead price,
can our feature/model/evaluation pipeline *recover* that, and - just as important - does it stay silent
when they do not (reactive social, pure noise) or when we cheat (look-ahead)? Nothing here touches real data.

## Layout
- `sim/generator.py` - structural causal model, 1-minute bars, seeded. Datasets:
  - **A** social leads: narrative event -> mentions(t) -> smart-wallet buys (t+2..t+5) -> price/volume drift (t+5..t+15). `effect` tunes size.
  - **C** social reactive: price jumps first, mentions and copy-wallet buys follow (t+1..t+4).
  - **G** pure noise: driftless random walk + independent noise streams.
  - Noise layers (`noise` multiplier): bot/wash volume, spam mention bursts, fake breakouts (pump that reverts, unrelated to latent state), missing + delayed observations, stale prices, bot wallet bursts.
  - Population has flat and rugged tokens; `export_survivors()` is the survivorship-biased export, `export_full()` the full population.
- `features.py` - point-in-time features (decision at t uses bars `< t` only): `price_accel, volume_accel, realized_vol, mention_accel, smart_money_accum`, plus lead/lag precedence features (expanding-window cross-correlation of mentions / wallet buys vs returns at lags -15..+15; `prec_* = mean(lead lags) - mean(lag lags)`). `audit_point_in_time()` recomputes every feature on physically truncated data and flags any that change (look-ahead detector).
- `ablation.py` - nested models (market | +social | +smart | +both) x (gradient boosting, logistic regression); token-level K-fold out-of-fold scoring (no token ever in train and test); precision/recall at top 1% / 5%, lead time (median, p25), forward-return mean / median / worst-decile, token block bootstrap (paired across models).
- `run_recovery.py` - runs everything, prints a PASS/FAIL gate table, exits 1 if any gate fails. Writes `results/`.

## Conventions worth knowing
- Label: forward 15-bar return from the close of bar t-1, `y = return > 2 sigma_15` (token sigma, so label is vol-homogeneous). Rows sampled every 5 bars, 120 bars warm-up.
- Eligibility filter is point-in-time (trailing 10-bar volume >= 20), so dead/flat tokens do not create a fake "alive vs dead" lift.
- Scores are ranked within each CV fold (fold intercept shifts otherwise create a negative-lift artefact), ties broken randomly.
- Significance of forward-return mean uses returns winsorised at +-7.5% (rug crashes are rare, unpredictable and make a bootstrapped mean unstable); raw means are still reported.
- A "false signal" on a null dataset = bootstrap p < 0.05/16 (Bonferroni over 4 sets x 2 models x 2 cut-offs) AND an economically meaningful effect (lift > 1.25, or >= +0.5% extra 15-bar return). Expect roughly a 5% chance per null dataset of one chance flag, so the gate is not seed-proof by construction.

## Run
```
cd research
python run_recovery.py            # ~70 s, 600 tokens/dataset, seed 7
python run_recovery.py --quick    # smoke test
python run_recovery.py --seed 21 --n-tokens 800
```
Needs numpy, pandas, scikit-learn only (a local venv is optional: `python -m venv .venv && .venv/Scripts/pip install numpy pandas scikit-learn`).
