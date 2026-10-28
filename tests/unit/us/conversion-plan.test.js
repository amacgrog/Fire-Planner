// The sized track in computeCliffPlan (Batch 5 step 5b piece 3, spec B0.3, B0.4, B8, Task 3): the keep rule on the gap households at
// both lengths (no earlier depletion or first home draw than the unsized plan, and a kept track wins by bracketCandidateBetter), a
// track that is not kept leaves the plan and report the unsized ones apart from report.sized, the light refresh (search: false)
// never runs it, a stored plan carrying `conv` round-trips through the guard and is the plan used, and the summary's conversion
// clause on hand-built plans. Engine outputs are compared between two runs in one process (sizing on against sizing off).
// No gap household keeps its sized track (0 of 6, sizing at mult ones), so the kept path is pinned on a scan-grid household (C66);
// an Optimize winner carrying `conv` is pinned in plan-search.test.js (NY at 75 on lifetimeCost).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const late = (x) => (x === null ? Infinity : x);
const GAPS = [];
for (const life of [75, 100]) for (const g of GAP_CASES) GAPS.push([`${g.name} ${life}`, g.patch(life, life)]);
const TX = GAP_CASES.find((g) => g.name === 'early ACA single (TX)').patch(75, 75);
// A scan-grid household whose sized track is kept (tests/solver_scan.js's grid, conversions on, no elections): a couple filing two
// single returns, 66, 750,000 + 750,000 traditional, 300,000 taxable, spending 130,000 (the sized plan first draws on the house a
// year later). None of the gap households keeps its track (0 of 6); 109 of the grid's 390 conversions-on households do.
const C66 = scanHouseholds({ conversions: true }).find((h) => h.g.filing === 'single-couple' && h.g.age === 66 && h.g.trad === 1500000 && h.g.taxable === 300000 && h.g.spending === 130000 && h.g.elections === 'none').patch;

// A fresh world with sizing on (or off) and the state set; `plan(opts)` is computeCliffPlan on a context built after the state.
async function setup(patch, { sizingOn = true } = {}) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = !sizingOn;
  await w.setState(patch);
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const plan = async (opts) => computeCliffPlan(await w.ctx(), opts);
  return { w, plan };
}
// The report without `sized` (a copy).
const withoutSized = (report) => {
  const { sized, ...rest } = report;
  return rest;
};

it('the keep rule: on the gap households at 75 and 100, the plan never depletes or first draws on the house earlier than the unsized plan', async () => {
  let ran = 0;
  for (const [name, patch] of GAPS) {
    const off = await (await setup(patch, { sizingOn: false })).plan();
    const on = await (await setup(patch)).plan();
    const u = off.report.candidates[off.report.keptIndex],
      k = on.report.candidates[on.report.keptIndex];
    c.expect(off.report.sized, name).toBe(undefined);
    c.expect(on.report.sized !== undefined, name).toBe(true);
    if (on.report.sized) ran++;
    c.expect(late(k.depletedAge) >= late(u.depletedAge), name).toBe(true);
    c.expect(late(k.homeDrawAge) >= late(u.homeDrawAge), name).toBe(true);
    if (on.report.sized.kept) {
      const better = late(k.depletedAge) > late(u.depletedAge) || late(k.homeDrawAge) > late(u.homeDrawAge) || k.value > u.value + Math.max(1, 0.001 * Math.abs(u.value));
      c.expect(better, name).toBe(true);
      c.expect(on.plan.conv !== null, name).toBe(true);
    } else c.expect(on.plan.conv, name).toBe(null);
  }
  c.expect(ran).toBe(6);
});

it('a kept track (the grid couple at 66): appended to the candidates, keptIndex and the kept bracket entry name it, the plan carries conv', async () => {
  const off = await (await setup(C66, { sizingOn: false })).plan();
  const { w, plan } = await setup(C66);
  const on = await plan();
  const s = on.report.sized,
    u = off.report.candidates[off.report.keptIndex],
    k = on.report.candidates[on.report.keptIndex];
  c.expect(s.kept).toBe(true);
  // a later first home draw, no earlier depletion
  c.expect(late(k.homeDrawAge) > late(u.homeDrawAge)).toBe(true);
  c.expect(late(k.depletedAge) >= late(u.depletedAge)).toBe(true);
  // the unsized candidates are kept as they were, the kept sized one is appended and named
  c.expect(on.report.candidates.slice(0, -1)).toStrictEqual(off.report.candidates);
  c.expect(on.report.keptIndex).toBe(on.report.candidates.length - 1);
  c.expect(on.report.kept).toBe(k.family);
  c.expect(k.conv > 0).toBe(true);
  // it is the best of the sized candidates (planCandidateBetter's chain), with the run's target count
  const top = s.candidates.find((x) => x.family === k.family && x.value === k.value);
  c.expect(top !== undefined && top.conv === k.conv).toBe(true);
  c.expect(on.report.keptBracket).toBe(off.report.keptBracket);
  const e = on.report.brackets.find((x) => x.bracket === on.report.keptBracket);
  c.expect([e.family, e.intents, e.depletedAge, e.homeDrawAge, e.value, e.cost]).toStrictEqual([k.family, k.intents, k.depletedAge, k.homeDrawAge, k.value, k.cost]);
  // the other brackets' entries are unchanged
  c.expect(on.report.brackets.filter((x) => x.bracket !== on.report.keptBracket)).toStrictEqual(off.report.brackets.filter((x) => x.bracket !== off.report.keptBracket));
  // the plan carries the targets (k.conv of them) and is the unsized plan's bracket
  c.expect(Object.keys(on.plan.conv).length).toBe(k.conv);
  c.expect(on.plan.bracket).toBe(off.plan.bracket);
  // apply of the kept plan reproduces the kept candidate's measure
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const ctx = await w.ctx();
  const sim = runProjection(newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: null, plan: on.plan, planMode: 'apply', overrides: ctx.overrides, stats: ctx.stats, test: ctx.test }), { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
  c.expect([sim.depletedAge, sim.homeDrawAge]).toStrictEqual([k.depletedAge, k.homeDrawAge]);
  // the summary names the sized conversions
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  c.expect(cliffPlanSummary(on.plan, on.report).endsWith(' (tax-aware sizing).')).toBe(true);
});

it('not kept: the plan and report are the switch-off call\'s apart from report.sized, whose shape is the brief\'s', async () => {
  let notKept = 0;
  for (const [name, patch] of GAPS) {
    const off = await (await setup(patch, { sizingOn: false })).plan();
    const on = await (await setup(patch)).plan();
    const s = on.report.sized;
    c.expect(Object.keys(s), name).toStrictEqual(['candidates', 'kept', 'convIntents']);
    c.expect(Object.keys(s.convIntents), name).toStrictEqual(['none', 'bracket', 'under', 'over']);
    for (const cand of s.candidates) c.expect(Object.keys(cand), name).toStrictEqual(['family', 'intents', 'conv', 'depletedAge', 'homeDrawAge', 'value', 'cost']);
    // every candidate holds the run's targets: the count per kind adds up to each candidate's conv count
    const total = s.convIntents.none + s.convIntents.bracket + s.convIntents.under + s.convIntents.over;
    c.expect(s.candidates.length > 0 && s.candidates.every((x) => x.conv === total), name).toBe(true);
    if (s.kept) continue;
    notKept++;
    c.expect(on.plan, name).toStrictEqual(off.plan);
    c.expect(withoutSized(on.report), name).toStrictEqual(off.report);
  }
  c.expect(notKept > 0).toBe(true);
});

it('the deferred pass: search: false never runs the track (no report.sized, the same engine counters as the unsized call)', async () => {
  const counters = async (sizingOn, opts) => {
    const { w, plan } = await setup(TX, { sizingOn });
    const ctx = await w.ctx();
    const before = JSON.stringify(ctx.stats.plan) + JSON.stringify(ctx.stats.magi);
    const out = await plan(opts);
    const after = JSON.stringify(ctx.stats.plan) + JSON.stringify(ctx.stats.magi);
    return { out, before: JSON.parse('[' + before.replace('}{', '},{') + ']'), after: JSON.parse('[' + after.replace('}{', '},{') + ']') };
  };
  const delta = ({ before, after }) => after.map((o, i) => Object.fromEntries(Object.keys(o).map((k) => [k, o[k] - before[i][k]])));
  const lightOn = await counters(true, { search: false }),
    lightOff = await counters(false, { search: false }),
    fullOn = await counters(true, {});
  c.expect('sized' in lightOn.out.report).toBe(false);
  c.expect(lightOn.out).toStrictEqual(lightOff.out);
  c.expect(delta(lightOn)).toStrictEqual(delta(lightOff));
  // no sized year ran in the light call; the full call's track did size years (choose counts its sized years too)
  c.expect(delta(lightOn)[0].convYears).toBe(0);
  c.expect(delta(fullOn)[0].convYears > 0).toBe(true);
  // the light plan is not final while the track is still to run
  c.expect(lightOn.out.report.searched).toBe(false);
  c.expect(fullOn.out.report.searched).toBe(true);
});

it('a partly scheduled window still sizes (sizingApplies, C8); a fully scheduled one does not, and its light plan is final', async () => {
  // TX converts 55-74 at 75: a schedule at 55-60 leaves 61-74 to size; one at every window age leaves none
  const part = Object.fromEntries([55, 56, 57, 58, 59, 60].map((a) => [a, 22]));
  const full = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [55 + i, 22]));
  const P = await (await setup({ ...TX, appliedRothSchedule: part })).plan();
  c.expect(P.report.sized !== undefined).toBe(true);
  c.expect(P.report.sized.candidates.length > 0).toBe(true);
  const L = await (await setup({ ...TX, appliedRothSchedule: part })).plan({ search: false });
  c.expect(L.report.searched).toBe(false);
  const F = await (await setup({ ...TX, appliedRothSchedule: full })).plan();
  c.expect(F.report.sized).toBe(undefined);
  const FL = await (await setup({ ...TX, appliedRothSchedule: full })).plan({ search: false });
  c.expect(FL.report.searched).toBe(true);
});

it('a stored plan carrying conv: it passes the guard, survives normalizeState, and is the plan used when it wins', async () => {
  const { w, plan } = await setup(TX);
  const { isValidStoredPlan, makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const store = await w.load('shared/core/store.js');
  const auto = await plan();
  // the sized track's own targets (the run's conv: every sized candidate holds it), on the automatic plan's other fields
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const ctx = await w.ctx();
  const sv = runProjection(newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: null, plan: { ...auto.plan, conv: {} }, planMode: 'choose', overrides: ctx.overrides, stats: ctx.stats, test: ctx.test }), { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
  const conv = sv.cliffConvIntents;
  c.expect(Object.keys(conv).length > 0).toBe(true);
  const p = makePlan({ ...auto.plan, conv });
  const sp = { v: 1, plan: p, objective: 'endValue', mult: null, madeFor: 'test', taxYear: 2026, summary: { gain: 0, success: { hist: [null, null], mc: [null, null] } } };
  c.expect(isValidStoredPlan(sp)).toBe(true);
  await w.setState({ ...TX, storedPlan: sp });
  c.expect(store.state.storedPlan).toStrictEqual(sp);
  const planned = await plan();
  c.expect(planned.report.stored.depletedAge).toBe(null);
  // the TX track is not kept (the keep rule test), and its targets stored alone score below the automatic plan: not used
  c.expect([planned.report.stored.used, planned.report.stored.reason]).toStrictEqual([false, 'score']);
  c.expect(planned.plan.conv).toBe(null);
  // a malformed conv drops the stored plan, not the state
  await w.setState({ ...TX, storedPlan: { ...sp, plan: { ...p, conv: { 60: 'b23' } } } });
  c.expect(store.state.storedPlan).toBe(null);
  c.expect(store.state.ageA).toBe(55);
});

it('the summary: the sized clause by runs of equal targets, per-return targets, the not-kept clause, a sizing-only plan', async () => {
  const w = await world();
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const conv = {};
  for (const a of [62, 63, 64, 65]) conv[a] = 'b24';
  for (const a of [66, 67, 68, 69, 70]) conv[a] = { id: 'irmaa2', ret: 'H', side: 'under' };
  for (const a of [71, 72, 73, 74]) conv[a] = 'none';
  const intents = { 58: { kind: 'under', line: 'aca400', ret: 'H' }, 59: { kind: 'under', line: 'aca400', ret: 'H' } };
  const report = (sized, extra = {}) => ({ candidates: [], kept: 'all', keptIndex: 0, brackets: [{ bracket: 22 }], keptBracket: 22, searched: true, ...(sized ? { sized } : {}), ...extra });
  const SIZED = ' Conversions: the top of the 24% bracket at 62-65; just under IRMAA tier 2 at 66-70; none at 71-74 (tax-aware sizing).';
  // a plan whose only lever is sizing (the no-steering return)
  c.expect(cliffPlanSummary(makePlan({ bracket: 22, bracketFrom: 22, conv }), report({ candidates: [], kept: true, convIntents: {} }))).toBe('Cliff plan: no steering helps this plan.' + SIZED);
  // after the cliff clauses
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22, conv }), report({ candidates: [], kept: true, convIntents: {} }))).toBe('Cliff plan: stay under the ACA 400% line at 58-59.' + SIZED);
  // after the bracket clause (more than one bracket searched)
  c.expect(cliffPlanSummary(makePlan({ bracket: 22, bracketFrom: 22, conv }), report(null, { brackets: [{ bracket: 22 }, { bracket: 24 }] }))).toBe('Cliff plan: no steering helps this plan. Conversions: your 22% bracket (no other flat bracket does better).' + SIZED);
  // per-return targets, and a gap in the ages splits a run
  const perRet = { 60: { id: 'aca400', ret: 'A', side: 'under' }, 61: { id: 'aca400', ret: 'A', side: 'under' }, 62: { id: 'aca400', ret: 'B', side: 'under' }, 64: { id: 'acaFloor', ret: 'H', side: 'over' } };
  c.expect(cliffPlanSummary(makePlan({ conv: perRet }), null)).toBe("Cliff plan: no steering helps this plan. Conversions: just under the ACA 400% line (Partner A's return) at 60-61; just under the ACA 400% line (Partner B's return) at 62; just over the ACA credit floor at 64 (tax-aware sizing).");
  // the track ran and was not kept
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22 }), report({ candidates: [], kept: false, convIntents: {} }))).toBe("Cliff plan: stay under the ACA 400% line at 58-59. Conversions: the plan's bracket (tax-aware sizing found nothing better).");
  // the track ran and was not kept, with a bracket clause: one merged clause
  const two = [{ bracket: 22 }, { bracket: 24 }];
  c.expect(cliffPlanSummary(makePlan({ bracket: 24, bracketFrom: 22 }), report({ candidates: [], kept: false, convIntents: {} }, { brackets: two, keptBracket: 24 }))).toBe('Cliff plan: no steering helps this plan. Conversions: the cliff plan uses the 24% bracket, not your 22%, within your conversion ages; tax-aware sizing found nothing better.');
  c.expect(cliffPlanSummary(makePlan({ bracket: 22, bracketFrom: 22 }), report({ candidates: [], kept: false, convIntents: {} }, { brackets: two }))).toBe('Cliff plan: no steering helps this plan. Conversions: your 22% bracket (no other flat bracket does better; tax-aware sizing found nothing better).');
  // conv null and no track: today's strings
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22 }), report(null))).toBe('Cliff plan: stay under the ACA 400% line at 58-59.');
  c.expect(cliffPlanSummary(makePlan({}), null)).toBe('Cliff plan: no steering helps this plan.');
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(112);
});
