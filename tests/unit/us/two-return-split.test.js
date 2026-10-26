// The split lever (US, Batch 5 step 4d, Task 4): the split stage of the phased year. In a two-return year whose natural pass
// converted nothing and drew discretionary traditional money with both partners holding penalty-free traditional money,
// `choose` (plan.levers.split) runs A-first and B-first as converged phases and keeps one only on a strict score win (D7);
// `apply` follows plan.splits. The rows carry drawSplit, the run splitIntents. The households are
// tests/helpers/plan-households.js's SPLIT_H1, SPLIT_ML and SPLIT_CONV and three rows of the scan grid (scan-grid.mjs). The
// lever is turned on by passing the plan's levers explicitly (computeCliffPlan's toggle levers are Task 5's).
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);
const { SPLIT_H1, SPLIT_ML, SPLIT_CONV } = require('../../helpers/plan-households.js');

const NEW_COUNT = 112;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const LEVER = { order: true, split: true };
const SPLIT_ONLY = { order: false, split: true };
const STATS = ['intentYears', 'applied', 'skippedSide', 'skippedIneligible', 'fallback', 'absent', 'splitYears', 'splitApplied', 'splitSkipped'];
const delta = (s0, s1) => Object.fromEntries(STATS.map((k) => [k, s1[k] - s0[k]]));
const nullIfEmpty = (m) => (m && Object.keys(m).length ? m : null);

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { planStats } = await w.load('us/core/projection/engine-state.js');
  const P = await usPlan(w);
  return { w, P, makePlan, planStats };
}
// choose with the levers, then the apply plan of what it recorded (its cliff intents, orders and splits)
function chooseAndPlan(P, makePlan, levers = LEVER) {
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers }), planTrace: true });
  const plan = makePlan({ intents: chosen.intents, family: 'all', orders: nullIfEmpty(chosen.orderIntents), splits: nullIfEmpty(chosen.splitIntents) });
  return { chosen, plan };
}
const ageOfYear = (rows, y) => rows.find((r) => r.year === y).age;
const traceAt = (run, age) => run.trace.find((t) => ageOfYear(run.rows, t.year) === age);
// the scan grid's two-return rows (couple filing single, ACA on, TX, life 95)
const grid = (age, trad, taxable, spending, elections, conv = false) =>
  scanHouseholds({ conversions: conv }).find((x) => x.g.filing === 'single-couple' && x.g.age === age && x.g.trad === trad && x.g.taxable === taxable && x.g.spending === spending && x.g.elections === elections);

it('SPLIT_H1: choose draws A first at 60, taking the draw off B pension-filled return', async () => {
  const { P, makePlan } = await setup(SPLIT_H1);
  const { chosen } = chooseAndPlan(P, makePlan);
  const off = P.runPlanMode({ planMode: 'off' });
  c.expect(chosen.splitIntents[60]).toBe('A');
  const r0 = chosen.rows[0];
  c.expect(r0.age).toBe(60);
  c.expect(r0.drawSplit).toBe('A');
  // B's return: the pension alone (no gains, no investment income, no traditional dollars)
  c.expect(r0.magiB).toBe(90000);
  // A's return: the whole traditional draw (A has no other income before Social Security)
  c.expect(r0.magiA).toBe(r0.traditionalWithdrawn);
  const t0 = traceAt(chosen, 60);
  c.expect(t0.shareA).toBe(1);
  c.expect(t0.split.kept).toBe(true);
  c.expect(t0.split.okA && t0.split.scoreA > t0.split.natScore + 1).toBe(true);
  // no lines in reach at 60 (TX, no ACA, IRMAA years away): the state machine's no-lines path
  c.expect(t0.splitLines).toStrictEqual([0, 0]);
  c.expect(chosen.intents).toStrictEqual({});
  // off never splits; the split year pays less tax than off's pro-rata year
  c.expect(off.rows.some((r) => 'drawSplit' in r)).toBe(false);
  c.expect(r0.tax < off.rows[0].tax).toBe(true);
  // every recorded split is labelled, and only those
  c.expect(chosen.rows.filter((r) => 'drawSplit' in r).map((r) => String(r.age))).toStrictEqual(Object.keys(chosen.splitIntents));
});

it('SPLIT_H1 under ACA at 60: both phases ran and built their own lines (whatever is kept)', async () => {
  const { P, makePlan } = await setup({ ...SPLIT_H1, acaEnabled: true });
  const { chosen, plan } = chooseAndPlan(P, makePlan);
  const t0 = traceAt(chosen, 60);
  c.expect('magiA' in chosen.rows[0]).toBe(true);
  c.expect(Number.isFinite(t0.split.natScore)).toBe(true);
  c.expect(Number.isFinite(t0.split.scoreA)).toBe(true);
  c.expect(Number.isFinite(t0.split.scoreB)).toBe(true);
  c.expect(t0.split.kept === (chosen.splitIntents[60] !== undefined)).toBe(true);
  // the lines path: each split phase built its own lines at its realized share (R2 (a)). A-first (share 1) has A's ACA lines in
  // reach; B-first (share 0) has none: A's lines cannot be moved by a B-only draw (dropped), and B's return starts at its
  // 90,000 pension, above every ACA line of a single filer.
  c.expect(t0.splitLines.length).toBe(2);
  c.expect(t0.splitLines[0] > 0).toBe(true);
  c.expect(t0.splitLines[1]).toBe(0);
  const applied = P.runPlanMode({ planMode: 'apply', plan, planTrace: true });
  c.expect(applied.rows).toStrictEqual(chosen.rows);
});

it('survivor symmetry with the lever on: identical partners filing single, A-dies equals B-dies (I6)', async () => {
  const twin = { ...SPLIT_H1, pensionCoverage: 'none', pensionYearlyB: 0, survivorEnabled: true, survivorDeathAge: 75, survivorSpendingPct: 70 };
  const runs = {};
  for (const who of ['A', 'B']) {
    const { P, makePlan } = await setup({ ...twin, survivorPartner: who });
    runs[who] = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: LEVER }), planTrace: true });
  }
  const a = runs.A.rows, b = runs.B.rows;
  c.expect(a.length).toBe(b.length);
  // tests/survivor_symmetry.js's comparison: the tax before the death, the outcome after it (a written-out cent tolerance)
  const diffs = [];
  for (let i = 0; i < a.length; i++) {
    const keys = a[i].age < 75 ? ['tax'] : ['tax', 'income', 'investable', 'ss'];
    for (const k of keys) if (!(Math.abs(a[i][k] - b[i][k]) <= 0.01)) diffs.push(`age ${a[i].age}: ${k} ${a[i][k]} vs ${b[i][k]}`);
  }
  c.expect(diffs).toStrictEqual([]);
  // an even draw is already the pro-rata draw: no split is kept, though both phases ran
  c.expect(runs.A.splitIntents).toStrictEqual({});
  c.expect(runs.B.splitIntents).toStrictEqual({});
  c.expect(runs.A.trace.some((t) => t.split && ageOfYear(a, t.year) < 75)).toBe(true);
  c.expect(a.some((r) => 'drawSplit' in r)).toBe(false);
});

it('an order phase rejected, then a split kept at the same age (C2)', async () => {
  // couple, two single returns; age 58; 401(k) 250k A + 250k B; taxable 300k; spending 130k; elections none; conversions off
  const h = grid(58, 500000, 300000, 130000, 'none');
  const { P, makePlan } = await setup(h.patch);
  const { chosen, plan } = chooseAndPlan(P, makePlan);
  const t = traceAt(chosen, 60);
  c.expect(t.order.kept).toBe(false);
  c.expect(t.split.kept).toBe(true);
  c.expect(chosen.splitIntents[60]).toBe('A');
  c.expect(Object.prototype.hasOwnProperty.call(chosen.orderIntents, 60)).toBe(false);
  const row = chosen.rows.find((r) => r.age === 60);
  c.expect(row.drawSplit).toBe('A');
  c.expect('drawOrder' in row).toBe(false);
  const applied = P.runPlanMode({ planMode: 'apply', plan });
  c.expect(applied.rows).toStrictEqual(chosen.rows);
});

it('SPLIT_CONV: a conversion year never splits', async () => {
  const { P, makePlan } = await setup(SPLIT_CONV);
  const { chosen } = chooseAndPlan(P, makePlan);
  c.expect(Object.prototype.hasOwnProperty.call(chosen.splitIntents, 60)).toBe(false);
  c.expect(Object.prototype.hasOwnProperty.call(chosen.splitIntents, 61)).toBe(false);
  const conv = chosen.rows.filter((r) => r.conversionAmount > 0);
  c.expect(conv.map((r) => r.age)).toStrictEqual([60, 61]);
  c.expect(conv.some((r) => 'drawSplit' in r)).toBe(false);
  // not vacuous: the years after the conversions split
  c.expect(chosen.splitIntents[62]).toBe('A');
});

it('SPLIT_ML: splits only before the marry-later wedding (Review Focus 4)', async () => {
  const { P, makePlan } = await setup(SPLIT_ML);
  const { chosen } = chooseAndPlan(P, makePlan);
  const ages = Object.keys(chosen.splitIntents).map(Number);
  c.expect(ages.length > 0).toBe(true);
  c.expect(ages.every((a) => a < 63)).toBe(true);
  c.expect(chosen.rows.some((r) => r.age >= 63 && 'drawSplit' in r)).toBe(false);
  // from the wedding on, no split phase runs at all (a joint return)
  c.expect(chosen.trace.some((t) => t.split && ageOfYear(chosen.rows, t.year) >= 63)).toBe(false);
});

it('SPLIT_H1 filing jointly: no split', async () => {
  const { P, makePlan } = await setup({ ...SPLIT_H1, filingStatus: 'mfj' });
  const { chosen } = chooseAndPlan(P, makePlan);
  c.expect(chosen.splitIntents).toStrictEqual({});
  c.expect(chosen.rows.some((r) => 'drawSplit' in r)).toBe(false);
  c.expect(chosen.trace.some((t) => t.split)).toBe(false);
});

it('the lever off: choose with no levers equals choose with both levers off, row for row', async () => {
  const { P, makePlan } = await setup(SPLIT_H1);
  const none = P.runPlanMode({ planMode: 'choose', plan: null });
  const off = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: { order: false, split: false } }) });
  c.expect(off.rows).toStrictEqual(none.rows);
  for (const r of [none, off]) {
    c.expect(r.splitIntents).toBe(null);
    c.expect(Object.prototype.hasOwnProperty.call(r.sim, 'splitIntents')).toBe(false);
    c.expect(r.rows.some((x) => 'drawSplit' in x)).toBe(false);
  }
});

it('replay: apply of choose reproduces choose (SPLIT_H1, SPLIT_ML, SPLIT_H1 ACA, a kept stay-under in a split year)', async () => {
  // couple, two single returns; age 58; 401(k) 750k A + 750k B; taxable 2000k; spending 130k; elections none; conversions off
  const under = grid(58, 1500000, 2000000, 130000, 'none').patch;
  for (const [name, patch, levers] of [['H1', SPLIT_H1, LEVER], ['H1 split only', SPLIT_H1, SPLIT_ONLY], ['ML', SPLIT_ML, LEVER], ['H1 ACA', { ...SPLIT_H1, acaEnabled: true }, LEVER], ['under', under, LEVER]]) {
    const { P, makePlan } = await setup(patch);
    const { chosen, plan } = chooseAndPlan(P, makePlan, levers);
    const applied = P.runPlanMode({ planMode: 'apply', plan, planTrace: true });
    c.expect(Object.keys(chosen.splitIntents).length > 0, name).toBe(true);
    c.expect(applied.rows, name).toStrictEqual(chosen.rows);
    c.expect(applied.depletedAge, name).toBe(chosen.depletedAge);
    c.expect(applied.homeDrawAge, name).toBe(chosen.homeDrawAge);
    // apply kept a split phase in every split year
    c.expect(applied.trace.filter((t) => t.split && t.split.kept).length, name).toBe(Object.keys(chosen.splitIntents).length);
    if (name === 'under') {
      // a stay-under on A's own ACA line kept in a year whose split is kept: the trial ran from the split phase (R2 (a))
      const both = Object.keys(chosen.splitIntents).filter((a) => chosen.intents[a]);
      c.expect(both.length > 0, name).toBe(true);
      const a = Number(both[0]),
        row = chosen.rows.find((r) => r.age === a);
      c.expect(chosen.intents[a].kind, name).toBe('under');
      c.expect(chosen.intents[a].ret, name).toBe('A');
      c.expect(row.drawSplit, name).toBe(chosen.splitIntents[a]);
      c.expect(row.cliffChoice.startsWith('stayed under '), name).toBe(true);
    }
  }
});

it('a partner with no penalty-free money is never split (Review Focus 1)', async () => {
  // B is 55 and retired, no Rule of 55: B's accounts are penalized until B is 59.5 (A's 65)
  const patch = { ...SPLIT_H1, ageB: 55, retireAgeB: 55, pensionStartAgeB: 60 };
  const { P, makePlan } = await setup(patch);
  const { chosen } = chooseAndPlan(P, makePlan);
  const lever0 = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: { order: true, split: false } }) });
  const early = chosen.rows.filter((r) => r.ageB < 59.5);
  c.expect(early.map((r) => r.age)).toStrictEqual([60, 61, 62, 63, 64]);
  c.expect(early.some((r) => 'drawSplit' in r)).toBe(false);
  c.expect(chosen.trace.some((t) => t.split && ageOfYear(chosen.rows, t.year) < 65)).toBe(false);
  // the natural draw is unchanged: those years are the lever-free run's
  c.expect(early).toStrictEqual(lever0.rows.slice(0, 5));
});

it('apply: a split intent the year cannot carry is skipped, the rows those of the plan without it (Review Focus 5)', async () => {
  const { P, makePlan, planStats } = await setup({ ...SPLIT_H1, trad401kA: 0 });
  const s0 = { ...planStats };
  const skipped = P.runPlanMode({ planMode: 'apply', plan: makePlan({ splits: { 60: 'A' } }) });
  c.expect(delta(s0, planStats)).toStrictEqual({ intentYears: 0, applied: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0, absent: 0, splitYears: 1, splitApplied: 0, splitSkipped: 1 });
  const without = P.runPlanMode({ planMode: 'apply', plan: makePlan({}) });
  c.expect(skipped.rows).toStrictEqual(without.rows);
  c.expect(skipped.rows.some((r) => 'drawSplit' in r)).toBe(false);
});

it('apply counters: splitYears = splitApplied + splitSkipped (D11)', async () => {
  const { P, makePlan, planStats } = await setup(SPLIT_H1);
  const { chosen, plan } = chooseAndPlan(P, makePlan);
  const n = Object.keys(chosen.splitIntents).length;
  const s0 = { ...planStats };
  P.runPlanMode({ planMode: 'apply', plan });
  const d = delta(s0, planStats);
  c.expect(d.splitYears).toBe(n);
  c.expect(d.splitYears).toBe(d.splitApplied + d.splitSkipped);
  c.expect(d.splitSkipped).toBe(0);
  // a split at an age the run never splits (a joint year after a wedding) counts as skipped
  const { P: P2, makePlan: mp2, planStats: ps2 } = await setup(SPLIT_ML);
  const s1 = { ...ps2 };
  P2.runPlanMode({ planMode: 'apply', plan: mp2({ splits: { 60: 'A', 64: 'B' } }) });
  const d2 = delta(s1, ps2);
  c.expect([d2.splitYears, d2.splitApplied, d2.splitSkipped]).toStrictEqual([2, 1, 1]);
});

it('apply follows the intent partner: B first at 60 moves the draw onto B return', async () => {
  const { P, makePlan } = await setup(SPLIT_H1);
  const b = P.runPlanMode({ planMode: 'apply', plan: makePlan({ splits: { 60: 'B' } }), planTrace: true });
  const r0 = b.rows[0];
  c.expect(r0.drawSplit).toBe('B');
  // A's return holds no income (no traditional dollars); B's the pension plus the whole draw
  c.expect(r0.magiA).toBe(0);
  c.expect(r0.magiB).toBe(90000 + r0.traditionalWithdrawn);
  c.expect(traceAt(b, 60).shareA).toBe(0);
  c.expect(traceAt(b, 60).split).toStrictEqual({ kept: true });
  c.expect(b.rows.filter((r) => 'drawSplit' in r).length).toBe(1);
});

it('the estate end tax splits the traditional estate at the start-of-year share in a last-year split (I1)', async () => {
  // SPLIT_H1 ending at 62 (both partners): the last year splits
  const { w, makePlan } = await setup({ ...SPLIT_H1, lifeExpectancyA: 62, lifeExpectancyB: 62 });
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { accountsOwnerShareA } = await w.load('us/core/accounts/account-ledger.js');
  const st = (await w.load('shared/core/store.js')).state;
  const trace = [];
  const sim = runProjection(storeContext({ plan: makePlan({ levers: LEVER }), planMode: 'choose' }), { mode: STANDARD_MODE, source: standardYearSource(st), retireAgeA: st.retireAgeA, retireAgeB: st.retireAgeB, trace });
  const last = sim.rows.at(-1);
  c.expect(last.age).toBe(62);
  c.expect(last.drawSplit).toBe('A');
  // the realized share of the last year is A's alone; the estate's profile carries the year's start-of-year ledger share
  c.expect(trace.at(-1).profile.ownerShareA).toBe(1);
  c.expect(sim.estate.profile.ownerShareA).toBe(accountsOwnerShareA(trace.at(-2).tradShares));
  c.expect(sim.estate.profile.ownerShareA < 1).toBe(true);
});

it('the per-return met guard at the trial and apply call sites (R1 (a), integration)', async () => {
  // couple, two single returns; age 58; 401(k) 750k A + 750k B; taxable 2000k; spending 130k; elections rule55; conversions off.
  // With the lever, at 65 the stay-under on B's IRMAA line meets the household line but not B's own return.
  const h = grid(58, 1500000, 2000000, 130000, 'rule55');
  const { P, makePlan, planStats } = await setup(h.patch);
  const { chosen, plan } = chooseAndPlan(P, makePlan);
  const t = traceAt(chosen, 65);
  const u = t.candidates.find((x) => x.kind === 'under');
  c.expect(u.realized <= u.magi + 1).toBe(true);
  c.expect(u.ok).toBe(false);
  c.expect(Object.prototype.hasOwnProperty.call(chosen.intents, 65)).toBe(false);
  // apply of the same plan with that intent: the trial misses B's return and falls back to the natural year
  const s0 = { ...planStats };
  const withIntent = P.runPlanMode({ planMode: 'apply', plan: { ...plan, intents: { ...plan.intents, 65: { kind: 'under', line: 'irmaa1', ret: 'B' } } } });
  const d = delta(s0, planStats);
  c.expect([d.intentYears, d.applied, d.fallback]).toStrictEqual([1, 0, 1]);
  c.expect(withIntent.rows).toStrictEqual(chosen.rows);
  c.expect('cliffChoice' in withIntent.rows.find((r) => r.age === 65)).toBe(false);
});
