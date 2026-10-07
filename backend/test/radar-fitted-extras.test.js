'use strict';
// "fitted + smartmoney / social": the walk-forward logistic regression may use the optional feature groups, judged on the
// SAME train/validation/test split as the plain fitted model, with the extra comparisons counted in the Bonferroni family.
// Worlds come from radar/validate.js (synthetic, KNOWN ground truth). Date.now is frozen while a world is built because
// the fit's 5-minute row stride aligns to absolute time; with a fixed clock the fit, and so these assertions, are repeatable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sqlite = require('./_sqlite');
sqlite.installBetterSqlite3Adapter();

const { buildWorld } = require('../src/radar/validate');

const FROZEN_MS = 1_800_000_123_000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-fx-'));
const OPTS = { horizons: [60], includeTpsl: false };
function world(mode, N) {
  const real = Date.now;
  Date.now = () => FROZEN_MS;
  try { return buildWorld(mode, N, path.join(dir, `${mode}.sqlite`), OPTS); } finally { Date.now = real; }
}
const row = (rep, win, model) => rep.results.find((r) => r.window === win && r.model === model && r.strategy === '60m');

test('default (no extra groups): no fitted+extra rows, comparisons unchanged', () => {
  const A = world('A', 1000);
  assert.equal(A.fit.status, 'ok');
  assert.ok(!A.results.some((r) => r.model.startsWith('fitted_lr+')));
  assert.equal(A.fitExtras, undefined);
  assert.equal(A.featureGroups, undefined);
  assert.equal(A.comparisonsBreakdown, undefined);
  const names = (w) => A.results.filter((r) => r.window === w).length;
  assert.equal(A.comparisons, names('all') + names('test'), 'Bonferroni family = every (window, model, strategy) cell, as before');
  assert.equal(A.bonferroniAlpha, 0.05 / A.comparisons);
  assert.equal(A.fit.featureGroups, undefined, 'plain fit meta carries no group info');
});

let M;
test('smart money truly leads (world L): the smartmoney variant is fitted, judged on the same test slice, and beats the plain fit', () => {
  M = world('L', 1500);
  assert.equal(M.fit.status, 'ok');
  const fx = M.fitExtras['fitted_lr+smartmoney'];
  assert.equal(fx.status, 'ok');
  assert.deepEqual(fx.featureGroups, ['smartmoney']);
  assert.ok(fx.groupWeights.some(([n]) => n === 'sm_net_usd_30m') && fx.groupWeights.some(([n]) => n === 'sm_buyers_30m'), 'group columns are in the fitted model');
  assert.equal(fx.splitTimes.testFrom, M.fit.splitTimes.testFrom, 'same walk-forward slices');
  assert.ok(!('fitted_lr+social' in M.fitExtras) && !('fitted_lr+both' in M.fitExtras), 'only variants whose groups are enabled');

  const plain = row(M, 'test', 'fitted_lr'), v = row(M, 'test', 'fitted_lr+smartmoney');
  assert.ok(plain && v, 'both fitted models are reported in the held-out window');
  assert.equal(row(M, 'all', 'fitted_lr+smartmoney'), undefined, 'fitted models are never judged on the all-window');
  assert.equal(v.label, 'fitted + smartmoney');
  const d = v.vsPlainFitted;
  assert.equal(d.plainModel, 'fitted_lr');
  assert.ok(d.meanDelta > 0, `extras should improve the fit when smart money leads (delta ${d.meanDelta})`);
  assert.ok(d.deltaCI95.lo > 0, `bootstrap CI of the improvement excludes zero (${d.deltaCI95.lo})`);
  assert.ok(v.mean > plain.mean);
});

test('Bonferroni family counts the extra comparisons explicitly', () => {
  const b = M.comparisonsBreakdown;
  const cells = (w) => M.results.filter((r) => r.window === w).length;
  assert.equal(b.fittedExtraVsRandom, 1);          // 1 variant x 1 strategy, judged vs random picks
  assert.equal(b.fittedExtraVsPlainFitted, 1);     // and once vs the plain fitted model
  assert.equal(b.base, cells('all') + cells('test') - b.fittedExtraVsRandom);
  assert.equal(M.comparisons, b.base + b.fittedExtraVsRandom + b.fittedExtraVsPlainFitted);
  assert.equal(M.bonferroniAlpha, 0.05 / M.comparisons);
  assert.ok(M.comparisons > cells('all') + cells('test'), 'the paired tests make the family strictly larger than the cell count');
  // the improvement claim must clear the CORRECTED alpha
  const v = row(M, 'test', 'fitted_lr+smartmoney');
  assert.equal(v.vsPlainFitted.significantlyBetterAfterCorrection,
    v.vsPlainFitted.meanDelta > 0 && v.vsPlainFitted.pDeltaLE0 < M.bonferroniAlpha && !!v.significantAfterCorrection);
});

test('both groups on: smartmoney, social and both variants are fitted and all counted', () => {
  const { runReport } = require('../src/radar/report');   // same module instance (and DB) that built world L
  const rep = runReport({ horizons: [60], includeTpsl: false, models: ['market_v1'], featureGroups: ['smartmoney', 'social'] });
  assert.deepEqual(Object.keys(rep.fitExtras).sort(), ['fitted_lr+both', 'fitted_lr+smartmoney', 'fitted_lr+social']);
  const variants = rep.results.filter((r) => r.window === 'test' && r.model.startsWith('fitted_lr+')).map((r) => r.model).sort();
  assert.deepEqual(variants, ['fitted_lr+both', 'fitted_lr+smartmoney', 'fitted_lr+social']);
  assert.equal(rep.comparisonsBreakdown.fittedExtraVsRandom, 3);
  assert.equal(rep.comparisonsBreakdown.fittedExtraVsPlainFitted, 3);
  assert.equal(rep.comparisons, rep.comparisonsBreakdown.base + 6);
  const both = rep.fitExtras['fitted_lr+both'];
  assert.deepEqual(both.featureGroups, ['smartmoney', 'social']);
  // without explicit groups the variants follow the configured extra source (world L configured smartmoney only)
  const auto = runReport({ horizons: [60], includeTpsl: false, models: ['market_v1'] });
  assert.deepEqual(Object.keys(auto.fitExtras), ['fitted_lr+smartmoney']);
});

test('pure noise: the same events unrelated to pumps do not improve the fit', () => {
  const Nw = world('N', 1500);
  assert.equal(Nw.fit.status, 'ok');
  assert.equal(Nw.fitExtras['fitted_lr+smartmoney'].status, 'ok');
  const v = row(Nw, 'test', 'fitted_lr+smartmoney');
  assert.ok(v, 'variant is still reported');
  const d = v.vsPlainFitted;
  assert.equal(d.significantlyBetterAfterCorrection, false);
  assert.ok(!(d.deltaCI95.lo > 0), `no improvement may be claimed from noise (CI lo ${d.deltaCI95.lo})`);
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sqlite file still locked on Windows */ } });
