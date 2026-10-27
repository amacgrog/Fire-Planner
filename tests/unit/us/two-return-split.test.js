// The split lever (US, Batch 5 step 4d, Task 4): the split stage of the phased year. In a two-return year whose natural pass
// converted nothing and drew discretionary traditional money with both partners holding penalty-free traditional money,
// `choose` (plan.levers.split) runs A-first and B-first as converged phases and keeps one only on a strict score win (D7);
// `apply` follows plan.splits. The rows carry drawSplit, the run splitIntents. The households are
// tests/helpers/plan-households.js's SPLIT_H1, SPLIT_ML and SPLIT_CONV and rows of the scan grid (scan-grid.mjs). The lever
// is turned on by passing the plan's levers explicitly. Task 5: computeCliffPlan's keep rule (PLAN_LEVERS, D9, D10), Optimize,
// the summary clause and the Task 4 review carry-ins (where wd.splittable is evaluated; an apply split pass with no draw).
import { it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);
const { SPLIT_H1, SPLIT_ML, SPLIT_CONV } = require('../../helpers/plan-households.js');

const NEW_COUNT = 158;
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
  // couple, two single returns; age 58; 401(k) 750k A + 750k B; taxable 300k; spending 130k; elections none; conversions off
  // (V145: the free-room fix moved this case from the 250k + 250k household at 60 to this one at 62)
  const h = grid(58, 1500000, 300000, 130000, 'none');
  const { P, makePlan } = await setup(h.patch);
  const { chosen, plan } = chooseAndPlan(P, makePlan);
  const t = traceAt(chosen, 62);
  c.expect(t.order.kept).toBe(false);
  c.expect(t.split.kept).toBe(true);
  c.expect(chosen.splitIntents[62]).toBe('A');
  c.expect(Object.prototype.hasOwnProperty.call(chosen.orderIntents, 62)).toBe(false);
  const row = chosen.rows.find((r) => r.age === 62);
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
  // With the lever, at 65 (A draws first) the stay-under on A's IRMAA line meets the household line but not A's own return.
  // (Before V145's free-room fix it was B's line, with no split at 65; the plan now also keeps one intent, at 61.)
  const h = grid(58, 1500000, 2000000, 130000, 'rule55');
  const { P, makePlan, planStats } = await setup(h.patch);
  const { chosen, plan } = chooseAndPlan(P, makePlan);
  const t = traceAt(chosen, 65);
  const u = t.candidates.find((x) => x.kind === 'under');
  c.expect(u.realized <= u.magi + 1).toBe(true);
  c.expect(u.ok).toBe(false);
  c.expect(Object.prototype.hasOwnProperty.call(chosen.intents, 65)).toBe(false);
  // apply of the same plan with that intent: the trial misses A's return and falls back to the natural year (61's intent applies)
  c.expect(Object.keys(plan.intents)).toStrictEqual(['61']);
  const s0 = { ...planStats };
  const withIntent = P.runPlanMode({ planMode: 'apply', plan: { ...plan, intents: { ...plan.intents, 65: { kind: 'under', line: 'irmaa1', ret: 'A' } } } });
  const d = delta(s0, planStats);
  c.expect([d.intentYears, d.applied, d.fallback]).toStrictEqual([2, 1, 1]);
  c.expect(withIntent.rows).toStrictEqual(chosen.rows);
  c.expect('cliffChoice' in withIntent.rows.find((r) => r.age === 65)).toBe(false);
});

// ---- Task 5: the split lever in the plan (D9 keep rule, D10 PLAN_LEVERS, Optimize, the summary) ----
const late = (x) => (x === null ? Infinity : x);
const LEVER_CAND_KEYS = ['family', 'intents', 'orders', 'orderPhases', 'splits', 'depletedAge', 'homeDrawAge', 'value', 'cost'];
async function planned(patch, opts) {
  const s = await setup(patch);
  const { computeCliffPlan } = await s.w.load('us/core/projection/run-projection.js');
  const ctx = await s.w.ctx();
  return { ...s, ctx, computeCliffPlan, ...computeCliffPlan(ctx, opts) };
}

it('computeCliffPlan on SPLIT_H1 (toggle on): keeps A first at 60, levers a copy of PLAN_LEVERS, the report counts splits', async () => {
  const on = await planned(SPLIT_H1);
  const { w, P, plan, report } = on;
  const { PLAN_LEVERS } = await w.load('us/core/cliff-plan/plan-shape.js');
  c.expect(PLAN_LEVERS).toStrictEqual({ order: true, split: true });
  c.expect(Object.isFrozen(PLAN_LEVERS)).toBe(true);
  c.expect(plan.splits !== null && plan.splits[60] === 'A').toBe(true);
  c.expect(plan.levers).toStrictEqual({ order: true, split: true });
  c.expect(plan.levers === PLAN_LEVERS).toBe(false);
  // an empty map is null (I1), never {}
  c.expect(plan.orders === null || Object.keys(plan.orders).length > 0).toBe(true);
  c.expect((plan.orders === null) === (plan.orderPhases === null)).toBe(true);
  const n = Object.keys(plan.splits).length;
  c.expect(report.keptSplits).toBe(n);
  c.expect(report.candidates[report.keptIndex].splits).toBe(n);
  c.expect(report.candidates.every((x) => Object.keys(x).join() === LEVER_CAND_KEYS.join())).toBe(true);
  // the kept plan's apply run splits at 60 and is no earlier than off on either age
  const applied = P.runPlanMode({ planMode: 'apply', plan }),
    off = P.runPlanMode({ planMode: 'off' });
  c.expect(applied.rows[0].drawSplit).toBe('A');
  c.expect(late(applied.depletedAge) >= late(off.depletedAge)).toBe(true);
  c.expect(late(applied.homeDrawAge) >= late(off.homeDrawAge)).toBe(true);
});

it('computeCliffPlan on SPLIT_H1 toggle off: no split, no levers; both levers off is the call with no levers', async () => {
  const offP = await planned({ ...SPLIT_H1, withdrawalMixEnabled: false });
  c.expect([offP.plan.splits, offP.plan.levers, offP.plan.orders]).toStrictEqual([null, null, null]);
  c.expect('keptSplits' in offP.report).toBe(false);
  const leversOff = offP.computeCliffPlan(offP.ctx, { levers: { order: false, split: false } });
  c.expect(leversOff).toStrictEqual({ plan: offP.plan, report: offP.report });
});

it('stage 2 (D9): the no-splits candidate of the top is in the report when the top holds splits', async () => {
  // couple, two single returns; age 58; 401(k) 750k A + 750k B; taxable 2000k; spending 130k; elections none; conversions off
  const h = grid(58, 1500000, 2000000, 130000, 'none');
  const { report } = await planned({ ...h.patch, withdrawalMixEnabled: true });
  const cands = report.candidates;
  // the last candidate is stage 2's no-splits try: the top's family and orders, no split; the top (with its splits) is before it
  const last = cands[cands.length - 1];
  c.expect(last.splits).toBe(0);
  const top = cands.find((x, i) => i < cands.length - 1 && x.splits > 0 && x.family === last.family && x.orders === last.orders && x.intents === last.intents);
  c.expect(top !== undefined).toBe(true);
  c.expect(last.family !== 'none' || last.orders > 0).toBe(true);
});

// SPLIT_H1's split gain on the end value (about 6,200 over a 13.8 million plan) is under Optimize's rank margin (0.1 %), so its
// winner is base; this grid household's search winner holds two splits and no order (the splits-only case of Opus review I1).
// It wins on depletion (Node 24, 2026-10-27): it runs out at 85 against base's 84, both first drawing on the house at 80, so the
// end value is 0 on both (gain 0). The grid's only splits-only winner since V145's free-room fix (the previous household,
// 250k + 250k, taxable 300k, spending 60k, no elections, conversions off, now picks base); found by running Optimize over all
// 192 two-return grid households.
it('Optimize (toggle off): a splits-only winner carries the split, orders null, and, stored, passes isValidStoredPlan (I1)', async () => {
  // couple, two single returns; age 58; 401(k) 750k A + 750k B; taxable 300k; spending 130k; elections sepp; conversions on
  const h = grid(58, 1500000, 300000, 130000, 'sepp', true);
  const { w } = await setup({ ...h.patch, withdrawalMixEnabled: false });
  const { optimizePlan } = await w.load('us/core/optimizer/plan-search.js');
  const { isValidStoredPlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const r = optimizePlan(await w.ctx());
  c.expect([r.base.plan.splits, r.base.plan.levers]).toStrictEqual([null, null]);
  c.expect(r.winner).toBe('search');
  c.expect([r.measure.depletedAge, r.base.depletedAge, r.measure.homeDrawAge, r.base.homeDrawAge]).toStrictEqual([85, 84, 80, 80]);
  c.expect(r.plan.splits !== null && Object.keys(r.plan.splits).length > 0).toBe(true);
  c.expect(r.plan.levers).toStrictEqual({ order: true, split: true });
  c.expect([r.plan.orders, r.plan.orderPhases]).toStrictEqual([null, null]);
  const sp = { v: 1, plan: r.plan, objective: r.objective, mult: r.mult, madeFor: 'test', taxYear: 2026, summary: { gain: r.gain, success: { hist: [null, null], mc: [null, null] } } };
  c.expect(isValidStoredPlan(sp)).toBe(true);
  // with the empty map {} the guard would drop the plan (orderPhases null exactly when orders is)
  c.expect(isValidStoredPlan({ ...sp, plan: { ...r.plan, orders: {} } })).toBe(false);
});

it('cliffPlanSummary: the split clause, runs of consecutive ages per partner', async () => {
  const w = await world();
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  c.expect(cliffPlanSummary(makePlan({ splits: { 60: 'A', 61: 'A', 63: 'B' } }), null)).toBe("Cliff plan: draw Partner A's traditional accounts first at 60-61; draw Partner B's traditional accounts first at 63.");
  const T = 'traditional';
  c.expect(cliffPlanSummary(makePlan({ orders: { 60: T }, orderPhases: [0], splits: { 62: 'B', 64: 'A', 65: 'A', 67: 'A' } }), null)).toBe("Cliff plan: draw traditional before taxable at 60; draw Partner A's traditional accounts first at 64-65, 67; draw Partner B's traditional accounts first at 62.");
});

// Task 4 review carry-ins
it('wd.splittable is evaluated only where canSplit can read it: never in a split phase, a trial or a replay (carry-in 1)', async () => {
  // SPLIT_H1 ending at 60: two rows (60, 61). No MAGI estimate is in use (no ACA), so every phase converges on its first pass:
  // one natural pass a year, plus one pass per split phase (two in choose, one in apply).
  const short = { ...SPLIT_H1, lifeExpectancyA: 60, lifeExpectancyB: 60 };
  const { w, P, makePlan } = await setup(short);
  const hooks = (await w.load('us/core/test-hooks.js')).testHooks;
  const count = (plan, planMode = 'apply') => {
    const n0 = hooks.splitCheckCalls;
    const r = P.runPlanMode({ planMode, plan, planTrace: true });
    return { n: hooks.splitCheckCalls - n0, r };
  };
  const b = count(makePlan({ splits: { 60: 'B', 61: 'B' } }));
  const ch = count(makePlan({ levers: SPLIT_ONLY }), 'choose');
  // both years ran their split stage (apply's phase, choose's A and B phases) ...
  c.expect(b.r.rows.map((r) => r.drawSplit)).toStrictEqual(['B', 'B']);
  c.expect(b.r.trace.filter((t) => t.split).length).toBe(2);
  c.expect(ch.r.trace.filter((t) => t.split && 'scoreB' in t.split).length).toBe(2);
  // ... and the eligibility was evaluated on the two natural passes only
  c.expect(b.n).toBe(2);
  c.expect(ch.n).toBe(2);
  // a split intent at an age the run never reaches, or none: never evaluated
  c.expect(count(makePlan({ splits: { 70: 'A' } })).n).toBe(0);
  c.expect(count(makePlan({})).n).toBe(0);
});

it('apply: a split pass that draws nothing is not a split (share, label, counters, the intent lookup) (carry-in 2)', async () => {
  // SPLIT_H1 in Nevada with ACA (no enhanced credits), B's pension 62,000 from 61, spending 14,500, life 62. At 61 the natural
  // year draws (B's return just over the ACA 400% line); A first moves the draw off B's return, B's return falls under the line,
  // its premium falls by more than the draw, and the split pass draws nothing.
  const h = { ...SPLIT_H1, acaEnabled: true, acaEnhanced: false, stateTax: 'nv', pensionYearlyB: 62000, pensionStartAgeB: 61, lifeExpectancyA: 62, lifeExpectancyB: 62, spending: 14500 };
  const { P, makePlan, planStats } = await setup(h);
  const none = P.runPlanMode({ planMode: 'apply', plan: makePlan({}) });
  c.expect(none.rows[1].age).toBe(61);
  c.expect(none.rows[1].traditionalWithdrawn > 0).toBe(true);
  let s0 = { ...planStats };
  const sp = P.runPlanMode({ planMode: 'apply', plan: makePlan({ splits: { 61: 'A' } }), planTrace: true });
  c.expect(delta(s0, planStats)).toStrictEqual({ intentYears: 0, applied: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0, absent: 0, splitYears: 1, splitApplied: 0, splitSkipped: 1 });
  c.expect(sp.rows).toStrictEqual(none.rows);
  c.expect(sp.rows.some((r) => 'drawSplit' in r)).toBe(false);
  // with an intent at 61 too: the lookup runs as in the plan without the split
  const intents = { 61: { kind: 'under', line: 'aca400', ret: 'B' } };
  s0 = { ...planStats };
  const iOnly = P.runPlanMode({ planMode: 'apply', plan: makePlan({ intents, family: 'aca' }) });
  const d0 = delta(s0, planStats);
  s0 = { ...planStats };
  const both = P.runPlanMode({ planMode: 'apply', plan: makePlan({ intents, family: 'aca', splits: { 61: 'A' } }) });
  const d1 = delta(s0, planStats);
  c.expect(d0.intentYears).toBe(1);
  c.expect(d1).toStrictEqual({ ...d0, splitYears: 1, splitSkipped: 1 });
  c.expect(both.rows).toStrictEqual(iOnly.rows);
  // choose never keeps such a split (D7: ok requires a draw)
  const chosen = P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: SPLIT_ONLY }) });
  c.expect(chosen.splitIntents[61]).toBe(undefined);
});
