// The whole-run sizing pass in computeCliffPlan (Batch 5 step 5b piece 3, revision 2, spec B0.11.3, B0.11.7; it replaced Task 3's
// sized track): greedyAccepts by hand; on the gap households and the two-return couple at both lengths, report.sized's counts, the
// keep rule (no earlier depletion or first home draw than the unsized plan, a kept pass wins by bracketCandidateBetter) and at least
// one kept plan (NY at 75, spec B0.11.6 I-2); each kept age removed alone would not be accepted back; the run budget at the test
// seam (ctx.test.convRunBudget); a pass that is not kept (the CA couple) leaves the plan and report the unsized ones apart from
// report.sized; the light refresh (search: false) never runs it; a stored plan carrying `conv` round-trips through the guard, is the
// plan used when it ties, and loses to the automatic plan when it is worse; and the summary's conversion clause on hand-built plans.
// Engine outputs are compared between runs in one process (sizing on against sizing off). Not reached: a hand-built two-age
// shortlist (B0.11.7: the shortlist is the proposal run's own, with no seam to replace it); the per-kept-age check and greedyAccepts
// by hand stand for it.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, legacyToAccounts } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const late = (x) => (x === null ? Infinity : x);
// tests/yardstick.mjs's two-return couple (both 60, two single returns until they marry at A's 63; B's pension 60,000).
const TWO = (life) => ({
  singlePerson: false, filingStatus: 'single', marryLater: true, marriageAgeA: 63, children: [],
  ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: life, lifeExpectancyB: life,
  pensionCoverage: 'b', pensionYearlyA: 0, pensionStartAgeA: 60, pensionYearlyB: 60000, pensionStartAgeB: 60,
  taxable: 300000, cash: 0, spending: 100000, acaEnabled: true, acaEnhanced: false, stateTax: 'tx',
  rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 74, rothConvBracket: 22,
  cliffGuardEnabled: true, withdrawalMixEnabled: false, smoothWithdrawals: false,
  ...legacyToAccounts({ traditional: 1600000, roth: 100000 }, { singlePerson: false }),
});
const GAPS = [];
for (const life of [75, 100]) {
  for (const g of GAP_CASES) GAPS.push([`${g.name} ${life}`, g.patch(life, life)]);
  GAPS.push([`two-return couple (TX) ${life}`, TWO(life)]);
}
const gap = (name, life) => GAP_CASES.find((g) => g.name === name).patch(life, life);
const TX = gap('early ACA single (TX)', 75);
const NY = gap('couple 58, trad-heavy, ACA (NY)', 75);
const CAS = [75, 100].map((life) => [`CA ${life}`, gap('couple 62, IRMAA (CA)', life)]);
const SIZED_KEYS = ['proposed', 'tried', 'accepted', 'budgetHit', 'kept', 'convIntents'];
const withoutConv = (p) => Object.fromEntries(Object.entries(p).filter(([x]) => x !== 'conv'));

// A fresh world with sizing on (or off) and the state set; `plan(opts, test)` is computeCliffPlan on a context built after the state
// (`test`: fields over the context's test switches, through newRunContext); `applied(plan)` is that plan's `apply` run measured as
// computeCliffPlan measures a candidate (the endValue score is the value).
async function setup(patch, { sizingOn = true } = {}) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = !sizingOn;
  await w.setState(patch);
  const { computeCliffPlan, runProjection } = await w.load('us/core/projection/run-projection.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
  const { greedyAccepts } = await w.load('us/core/cliff-plan/solver.js');
  const plan = async (opts, test = null) => {
    const ctx = await w.ctx();
    return computeCliffPlan(test ? newRunContext({ ...ctx, test: { ...ctx.test, ...test } }) : ctx, opts);
  };
  const applied = async (p) => {
    const ctx = await w.ctx(),
      at = (planMode, pl) => newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: null, plan: pl, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
    const sim = runProjection(at('apply', p), { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
    const value = US_OBJECTIVES.endValue.value(at('off', null), sim);
    return { depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, value, score: value };
  };
  return { w, plan, applied, greedyAccepts };
}
// The report without `sized` (a copy).
const withoutSized = (report) => {
  const { sized, ...rest } = report;
  return rest;
};

it('greedyAccepts by hand: no earlier depletion or first home draw, then later on either or a score more than $1 above', async () => {
  const w = await world();
  const { greedyAccepts } = await w.load('us/core/cliff-plan/solver.js');
  const m = (depletedAge, homeDrawAge, score) => ({ depletedAge, homeDrawAge, score });
  // equal ages: exactly $1 above is not enough, $1.01 is
  c.expect(greedyAccepts(m(null, null, 101), m(null, null, 100))).toBe(false);
  c.expect(greedyAccepts(m(null, null, 101.01), m(null, null, 100))).toBe(true);
  c.expect(greedyAccepts(m(null, null, 100), m(null, null, 100))).toBe(false);
  // a later depletion or first home draw wins at a lower score; null is never, the latest
  c.expect(greedyAccepts(m(86, null, 50), m(85, null, 100))).toBe(true);
  c.expect(greedyAccepts(m(null, null, 50), m(85, null, 100))).toBe(true);
  c.expect(greedyAccepts(m(85, 80, 50), m(85, 79, 100))).toBe(true);
  c.expect(greedyAccepts(m(85, null, 50), m(85, 79, 100))).toBe(true);
  // an earlier depletion or first home draw never wins, whatever the score or the other age
  c.expect(greedyAccepts(m(84, null, 1e9), m(85, null, 100))).toBe(false);
  c.expect(greedyAccepts(m(85, null, 1e9), m(null, null, 100))).toBe(false);
  c.expect(greedyAccepts(m(null, 78, 1e9), m(85, 79, 100))).toBe(false);
  c.expect(greedyAccepts(m(90, 78, 1e9), m(85, null, 100))).toBe(false);
});

it('the pass on the gap households and the two-return couple at 75 and 100: its counts, the keep rule, and kept plans', async () => {
  const keeps = [];
  for (const [name, patch] of GAPS) {
    const off = await (await setup(patch, { sizingOn: false })).plan();
    const { plan, applied, greedyAccepts } = await setup(patch);
    const on = await plan();
    const s = on.report.sized,
      u = off.report.candidates[off.report.keptIndex],
      k = on.report.candidates[on.report.keptIndex];
    c.expect(off.report.sized, name).toBe(undefined);
    c.expect(Object.keys(s), name).toStrictEqual(SIZED_KEYS);
    c.expect(Object.keys(s.convIntents), name).toStrictEqual(['none', 'bracket', 'under', 'over']);
    // every shortlisted age is tried, up to the budget; a kept pass's ages are counted per kind (all zero when not kept)
    c.expect(s.proposed > 0, name).toBe(true);
    c.expect(s.tried, name).toBe(Math.min(s.proposed, 24));
    c.expect(s.budgetHit, name).toBe(s.proposed > 24);
    c.expect(s.accepted <= s.tried, name).toBe(true);
    c.expect(s.convIntents.none + s.convIntents.bracket + s.convIntents.under + s.convIntents.over, name).toBe(s.kept ? s.accepted : 0);
    // the shortlist never holds none
    c.expect(s.convIntents.none, name).toBe(0);
    // never an earlier depletion or first home draw than the unsized plan
    c.expect(late(k.depletedAge) >= late(u.depletedAge), name).toBe(true);
    c.expect(late(k.homeDrawAge) >= late(u.homeDrawAge), name).toBe(true);
    if (!s.kept) {
      c.expect(on.plan.conv, name).toBe(null);
      continue;
    }
    keeps.push(name);
    const better = late(k.depletedAge) > late(u.depletedAge) || late(k.homeDrawAge) > late(u.homeDrawAge) || k.value > u.value + Math.max(1, 0.001 * Math.abs(u.value));
    c.expect(better, name).toBe(true);
    c.expect(Object.keys(on.plan.conv).length, name).toBe(s.accepted);
    c.expect(k.conv, name).toBe(s.accepted);
    // the kept plan through apply is the kept candidate
    const mk = await applied(on.plan);
    c.expect([mk.depletedAge, mk.homeDrawAge, mk.value], name).toStrictEqual([k.depletedAge, k.homeDrawAge, k.value]);
    // each kept age removed alone: the pass would not accept that plan over the kept one (it lowers the score or delays nothing)
    for (const age of Object.keys(on.plan.conv)) {
      const rest = { ...on.plan.conv };
      delete rest[age];
      const mr = await applied({ ...on.plan, conv: Object.keys(rest).length ? rest : null });
      c.expect(greedyAccepts(mr, mk), `${name} without ${age}`).toBe(false);
    }
  }
  console.log(`conversion-plan: kept on ${keeps.length} of ${GAPS.length}: ${keeps.join('; ')}`);
  // at least one keeps (spec B0.11.6 I-2): NY at 75
  c.expect(keeps.length >= 1).toBe(true);
  c.expect(keeps.includes('couple 58, trad-heavy, ACA (NY) 75')).toBe(true);
});

it('a kept pass (NY at 75): appended to the candidates, keptIndex and the kept bracket entry name it, the plan carries conv', async () => {
  const off = await (await setup(NY, { sizingOn: false })).plan();
  const { w, plan } = await setup(NY);
  const on = await plan();
  const s = on.report.sized,
    u = off.report.candidates[off.report.keptIndex],
    k = on.report.candidates[on.report.keptIndex];
  c.expect(s.kept).toBe(true);
  c.expect(late(k.depletedAge) >= late(u.depletedAge)).toBe(true);
  c.expect(late(k.homeDrawAge) >= late(u.homeDrawAge)).toBe(true);
  // the unsized candidates are kept as they were, the kept sized one is appended and named; it holds the unsized best's intents
  c.expect(on.report.candidates.slice(0, -1)).toStrictEqual(off.report.candidates);
  c.expect(on.report.keptIndex).toBe(on.report.candidates.length - 1);
  c.expect(on.report.kept).toBe(off.report.kept);
  c.expect([k.family, k.intents]).toStrictEqual([u.family, u.intents]);
  c.expect(k.conv).toBe(s.accepted);
  c.expect(on.report.keptBracket).toBe(off.report.keptBracket);
  const e = on.report.brackets.find((x) => x.bracket === on.report.keptBracket);
  c.expect([e.family, e.intents, e.depletedAge, e.homeDrawAge, e.value, e.cost]).toStrictEqual([k.family, k.intents, k.depletedAge, k.homeDrawAge, k.value, k.cost]);
  // the other brackets' entries are unchanged
  c.expect(on.report.brackets.filter((x) => x.bracket !== on.report.keptBracket)).toStrictEqual(off.report.brackets.filter((x) => x.bracket !== off.report.keptBracket));
  // the plan is the unsized plan with the accepted targets
  c.expect(withoutConv(on.plan)).toStrictEqual(withoutConv(off.plan));
  c.expect(off.plan.conv).toBe(null);
  c.expect(Object.keys(on.plan.conv).length).toBe(s.accepted);
  // the summary names the sized conversions
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  c.expect(cliffPlanSummary(on.plan, on.report).endsWith(' (tax-aware sizing).')).toBe(true);
});

it('the run budget (ctx.test.convRunBudget = 1): one apply run, the budget hit, at most one target', async () => {
  const { plan } = await setup(NY);
  const full = await plan();
  const one = await plan({}, { convRunBudget: 1 });
  const s = one.report.sized;
  c.expect(full.report.sized.proposed >= 2).toBe(true);
  c.expect(s.proposed).toBe(full.report.sized.proposed);
  c.expect(s.tried).toBe(1);
  c.expect(s.budgetHit).toBe(true);
  c.expect(s.accepted <= 1).toBe(true);
  c.expect(one.plan.conv === null || Object.keys(one.plan.conv).length === 1).toBe(true);
  // the default (null) is the full budget
  c.expect(await plan({}, { convRunBudget: null })).toStrictEqual(full);
});

it("not kept (the CA couple at 75 and 100): the plan and report are the switch-off call's apart from report.sized", async () => {
  for (const [name, patch] of CAS) {
    const off = await (await setup(patch, { sizingOn: false })).plan();
    const on = await (await setup(patch)).plan();
    const s = on.report.sized;
    c.expect(Object.keys(s), name).toStrictEqual(SIZED_KEYS);
    c.expect(s.kept, name).toBe(false);
    c.expect(on.plan, name).toStrictEqual(off.plan);
    c.expect(withoutSized(on.report), name).toStrictEqual(off.report);
  }
});

it('the deferred pass: search: false never runs the pass (no report.sized, the same engine counters as the unsized call)', async () => {
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
  // no sized year ran in the light call; the full call's proposal run did size years (choose counts its sized years)
  c.expect(delta(lightOn)[0].convYears).toBe(0);
  c.expect(delta(fullOn)[0].convYears > 0).toBe(true);
  // the light plan is not final while the pass is still to run
  c.expect(lightOn.out.report.searched).toBe(false);
  c.expect(fullOn.out.report.searched).toBe(true);
});

it('a partly scheduled window still sizes (sizingApplies, C8); a fully scheduled one does not, and its light plan is final', async () => {
  // TX converts 55-74 at 75: a schedule at 55-60 leaves 61-74 to size; one at every window age leaves none
  const part = Object.fromEntries([55, 56, 57, 58, 59, 60].map((a) => [a, 22]));
  const full = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [55 + i, 22]));
  const P = await (await setup({ ...TX, appliedRothSchedule: part })).plan();
  c.expect(P.report.sized !== undefined).toBe(true);
  c.expect(P.report.sized.proposed > 0).toBe(true);
  const L = await (await setup({ ...TX, appliedRothSchedule: part })).plan({ search: false });
  c.expect(L.report.searched).toBe(false);
  const F = await (await setup({ ...TX, appliedRothSchedule: full })).plan();
  c.expect(F.report.sized).toBe(undefined);
  const FL = await (await setup({ ...TX, appliedRothSchedule: full })).plan({ search: false });
  c.expect(FL.report.searched).toBe(true);
});

it('a stored plan carrying conv: it passes the guard, survives normalizeState, is the plan used when it ties, and loses when worse', async () => {
  const { w, plan } = await setup(TX);
  const { isValidStoredPlan, makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const store = await w.load('shared/core/store.js');
  const auto = await plan();
  // the TX pass is kept (revision 2, Task R2): the automatic plan carries the accepted targets
  c.expect(auto.report.sized.kept).toBe(true);
  const conv = auto.plan.conv;
  c.expect(Object.keys(conv).length).toBe(auto.report.sized.accepted);
  const envelope = (p) => ({ v: 1, plan: p, objective: 'endValue', mult: null, madeFor: 'test', taxYear: 2026, summary: { gain: 0, success: { hist: [null, null], mc: [null, null] } } });
  const p = makePlan({ ...auto.plan });
  const sp = envelope(p);
  c.expect(isValidStoredPlan(sp)).toBe(true);
  await w.setState({ ...TX, storedPlan: sp });
  c.expect(store.state.storedPlan).toStrictEqual(sp);
  const planned = await plan();
  c.expect(planned.report.stored.depletedAge).toBe(null);
  // the automatic plan's own targets: the stored plan ties it and is the plan used, carrying them
  c.expect([planned.report.stored.used, planned.report.stored.reason]).toStrictEqual([true, 'tie']);
  c.expect(planned.plan).toBe(store.state.storedPlan.plan);
  c.expect(planned.plan.conv).toStrictEqual(conv);
  // a well-formed stored plan that converts nothing at every window age (55-74) loses on the score: the automatic plan is used
  const none = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [55 + i, 'none']));
  const worse = envelope(makePlan({ ...auto.plan, conv: none }));
  c.expect(isValidStoredPlan(worse)).toBe(true);
  await w.setState({ ...TX, storedPlan: worse });
  c.expect(store.state.storedPlan).toStrictEqual(worse);
  const lost = await plan();
  c.expect([lost.report.stored.used, lost.report.stored.reason]).toStrictEqual([false, 'score']);
  c.expect(lost.report.stored.value < auto.report.candidates[auto.report.keptIndex].value).toBe(true);
  c.expect(lost.plan).toStrictEqual(auto.plan);
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
  // report.sized's shape (the summary reads only `kept`)
  const sz = (kept) => ({ proposed: 1, tried: 1, accepted: kept ? 1 : 0, budgetHit: false, kept, convIntents: { none: 0, bracket: kept ? 1 : 0, under: 0, over: 0 } });
  const report = (sized, extra = {}) => ({ candidates: [], kept: 'all', keptIndex: 0, brackets: [{ bracket: 22 }], keptBracket: 22, searched: true, ...(sized ? { sized } : {}), ...extra });
  const SIZED = ' Conversions: the top of the 24% bracket at 62-65; just under IRMAA tier 2 at 66-70; none at 71-74 (tax-aware sizing).';
  // a plan whose only lever is sizing (the no-steering return)
  c.expect(cliffPlanSummary(makePlan({ bracket: 22, bracketFrom: 22, conv }), report(sz(true)))).toBe('Cliff plan: no steering helps this plan.' + SIZED);
  // after the cliff clauses
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22, conv }), report(sz(true)))).toBe('Cliff plan: stay under the ACA 400% line at 58-59.' + SIZED);
  // after the bracket clause (more than one bracket searched)
  c.expect(cliffPlanSummary(makePlan({ bracket: 22, bracketFrom: 22, conv }), report(null, { brackets: [{ bracket: 22 }, { bracket: 24 }] }))).toBe('Cliff plan: no steering helps this plan. Conversions: your 22% bracket (no other flat bracket does better).' + SIZED);
  // per-return targets, and a gap in the ages splits a run
  const perRet = { 60: { id: 'aca400', ret: 'A', side: 'under' }, 61: { id: 'aca400', ret: 'A', side: 'under' }, 62: { id: 'aca400', ret: 'B', side: 'under' }, 64: { id: 'acaFloor', ret: 'H', side: 'over' } };
  c.expect(cliffPlanSummary(makePlan({ conv: perRet }), null)).toBe("Cliff plan: no steering helps this plan. Conversions: just under the ACA 400% line (Partner A's return) at 60-61; just under the ACA 400% line (Partner B's return) at 62; just over the ACA credit floor at 64 (tax-aware sizing).");
  // the track ran and was not kept
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22 }), report(sz(false)))).toBe("Cliff plan: stay under the ACA 400% line at 58-59. Conversions: the plan's bracket (tax-aware sizing found nothing better).");
  // the track ran and was not kept, with a bracket clause: one merged clause
  const two = [{ bracket: 22 }, { bracket: 24 }];
  c.expect(cliffPlanSummary(makePlan({ bracket: 24, bracketFrom: 22 }), report(sz(false), { brackets: two, keptBracket: 24 }))).toBe('Cliff plan: no steering helps this plan. Conversions: the cliff plan uses the 24% bracket, not your 22%, within your conversion ages; tax-aware sizing found nothing better.');
  c.expect(cliffPlanSummary(makePlan({ bracket: 22, bracketFrom: 22 }), report(sz(false), { brackets: two }))).toBe('Cliff plan: no steering helps this plan. Conversions: your 22% bracket (no other flat bracket does better; tax-aware sizing found nothing better).');
  // conv null and no track: today's strings
  c.expect(cliffPlanSummary(makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22 }), report(null))).toBe('Cliff plan: stay under the ACA 400% line at 58-59.');
  c.expect(cliffPlanSummary(makePlan({}), null)).toBe('Cliff plan: no steering helps this plan.');
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // revision 2 (Task R2): the whole-run pass (6 of 8 gap runs keep, each kept age removed alone), the budget, CA not kept, the
  // stored plan that loses
  // the total counts the kept gap households' checks; 220 after the 5b surplus-year refill (two-return @100 no longer keeps)
  expect(c.total).toBe(220);
});
