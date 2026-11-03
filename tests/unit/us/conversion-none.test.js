// "Convert nothing" in the whole-run sizing pass (Batch 5 follow-ups S2, spec 4.2): a `choose` run with sizing records its `none`
// winners (cliffConvNone, Partner A's ages ascending, not enumerable); computeCliffPlan's pass walks them after the shortlist with
// the budget left, each a trial adding 'none' at that age, accepted only by greedyAccepts (report.sized's noneProposed and
// noneTried). The household is the snapshot's `std G two returns 62 aca smooth` (two single returns at 62, 401(k) 750k + 750k,
// taxable 300k, spending 60k, ACA, smooth, converting at the 22% fill, the guard on), where Task 5's measurement found `none`
// winners at 62-64 while the kept plan converted there. S3 Task 8e (ruling 24): after both walks, the all-none candidate (the walk's
// conv plus 'none' at every proposal `none` age it does not hold), outside the budget, accepted only by greedyAccepts
// (report.sized's allNoneTried and allNoneAges), on three scan-grid households (default mode, guard on). Engine outputs are
// compared between runs in one process.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scenarios } = require('../../snapshot_scenarios.js');
const { legacyToAccounts } = require('../../legacy_balances.js');

const NAME = 'std G two returns 62 aca smooth';
const late = (x) => (x === null ? Infinity : x);
// A default-mode scan-grid household with conversions on (as conversion-fill-draw.test.js finds one), the guard on.
const gridOf = (filing, age, trad, taxable, spending, elections) => scanHouseholds({ conversions: true }).find((x) => x.g.filing === filing
  && x.g.age === age && x.g.trad === trad && x.g.taxable === taxable && x.g.spending === spending && x.g.elections === elections).patch;

// A fresh world with the household set (`patch`: the snapshot household's by default; `sizingOn` false: testHooks.testConvSizingOff,
// the unsized planning). `plan(test)` is computeCliffPlan (the deferred pass: search on) on a context built after the state (`test`:
// fields over the context's test switches, through newRunContext); `choose(p, trace)` and `apply(p)` are single runs in that plan
// mode (usPlan's runPlanMode); `applied(p)` is p's `apply` run measured as computeCliffPlan measures a candidate (the endValue score
// is the value), with its rows.
async function setup(patch = null, { sizingOn = true } = {}) {
  const sc = scenarios(true).find((s) => s.name === NAME);
  const w = await world();
  const { testHooks } = await w.load('us/core/test-hooks.js');
  testHooks.testConvSizingOff = !sizingOn;
  await w.setState(patch ?? legacyToAccounts(sc.patch, null));
  const { computeCliffPlan, runProjection } = await w.load('us/core/projection/run-projection.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
  const { greedyAccepts } = await w.load('us/core/cliff-plan/solver.js');
  const P = await usPlan(w);
  const plan = async (test = null) => {
    const ctx = await w.ctx();
    return computeCliffPlan(test ? newRunContext({ ...ctx, test: { ...ctx.test, ...test } }) : ctx);
  };
  const choose = (p, trace = false) => P.runPlanMode({ planMode: 'choose', plan: p, planTrace: trace });
  const apply = (p) => P.runPlanMode({ planMode: 'apply', plan: p });
  const applied = async (p) => {
    const ctx = await w.ctx(),
      at = (planMode, pl) => newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: null, plan: pl, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
    const sim = runProjection(at('apply', p), { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
    const value = US_OBJECTIVES.endValue.value(at('off', null), sim);
    return { depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, value, score: value, rows: sim.rows };
  };
  return { w, plan, choose, apply, applied, makePlan, greedyAccepts, ageA: sc.patch.ageA };
}
// The sized planning (`on`, its pass report `s`, kept candidate `k`, kept plan applied `mk`), the unsized one's kept candidate (`u`,
// its plan `off`), and the pass's proposal run's `none` list (`none`: the kept bracket, no levers, conv {}; as 'cliffConvNone lists
// the ages whose winner is none' builds it).
async function planned(patch) {
  const O = await setup(patch, { sizingOn: false });
  const offOut = await O.plan();
  const S = await setup(patch);
  const on = await S.plan();
  const none = S.choose(S.makePlan({ bracket: on.plan.bracket, bracketFrom: on.plan.bracketFrom, conv: {} })).sim.cliffConvNone;
  return { ...S, on, s: on.report.sized, k: on.report.candidates[on.report.keptIndex], mk: await S.applied(on.plan), u: offOut.report.candidates[offOut.report.keptIndex], off: offOut.plan, none };
}

it('cliffConvNone lists the ages whose winner is none', async () => {
  const { choose, apply, makePlan, plan, ageA } = await setup();
  const auto = await plan();
  // the pass's proposal run: the kept bracket, no levers (the kept plan holds no orders or splits), conv: {}
  const p = makePlan({ bracket: auto.plan.bracket, bracketFrom: auto.plan.bracketFrom, conv: {} });
  const r = choose(p, true),
    none = r.sim.cliffConvNone;
  expect(Object.keys(r.sim).includes('cliffConvNone')).toBe(false);
  const expected = [];
  for (const t of r.trace) if (t.conv && t.conv.winner === 'none') expected.push(ageA + t.year);
  expect(expected.length > 0).toBe(true);
  expect(none).toStrictEqual(expected);
  // ascending, and every one also a recorded intent (choose records each winner that is not the bracket)
  for (let i = 1; i < none.length; i++) expect(none[i] > none[i - 1]).toBe(true);
  for (const a of none) expect(r.sim.cliffConvIntents[a]).toBe('none');
  // a choose run with conv null, and an apply run, record none
  expect(choose({ ...p, conv: null }).sim.cliffConvNone).toBe(undefined);
  expect(apply(auto.plan).sim.cliffConvNone).toBe(undefined);
});

it('a kept none target converts 0 at its age', async () => {
  const { plan, apply } = await setup();
  const auto = await plan();
  const s = auto.report.sized;
  expect(s.kept).toBe(true);
  expect(s.convIntents.none > 0).toBe(true);
  expect(s.noneTried > 0).toBe(true);
  expect(s.noneTried <= s.noneProposed).toBe(true);
  const noneAt = Object.keys(auto.plan.conv).filter((a) => auto.plan.conv[a] === 'none');
  expect(noneAt.length).toBe(s.convIntents.none);
  const rows = apply(auto.plan).rows;
  for (const a of noneAt) {
    const row = rows.find((x) => x.age === Number(a));
    expect(row.conversionAmount).toBe(0);
  }
  // not vacuous: the same ages convert when the plan holds no target there
  const rest = Object.fromEntries(Object.entries(auto.plan.conv).filter(([, t]) => t !== 'none'));
  const restRows = apply({ ...auto.plan, conv: rest }).rows;
  for (const a of noneAt) expect(restRows.find((x) => x.age === Number(a)).conversionAmount > 0).toBe(true);
});

it('a full budget tries no none age', async () => {
  const { plan, choose, makePlan } = await setup();
  const full = await plan();
  const n = full.report.sized.proposed;
  const capped = await plan({ convRunBudget: n });
  const s = capped.report.sized;
  expect(s.proposed).toBe(n);
  expect(s.tried).toBe(n);
  expect(s.noneTried).toBe(0);
  // the budget left the none ages untried
  expect(s.budgetHit).toBe(true);
  // S3 Task 8e: every 'none' in the plan is the all-none candidate's (the walk with the full budget still tries no none age)
  expect(Object.entries(capped.plan.conv ?? {}).filter(([, t]) => t === 'none').map(([a]) => Number(a))).toStrictEqual(s.allNoneAges);
  const sv = choose(makePlan({ bracket: capped.plan.bracket, bracketFrom: capped.plan.bracketFrom, conv: {} })).sim;
  expect(s.noneProposed).toBe(sv.cliffConvNone.length);
  expect(s.noneProposed > 0).toBe(true);
});

it("the all-none candidate turns a depleting household's over-the-line block off at once", async () => {
  // couple, MFJ; age 52; 401(k) 250k A + 250k B; taxable 2000k; spending 130k; elections none (at 9fb1163: proposed 21, noneProposed
  // 19, tried 24, accepted 0, the budget hit, plan.conv null, run-out 93 / home 87; 2fc43c7 94 / 88; planning's prototype 95 / 89)
  const { on, s, k, mk, u, off, none, applied, greedyAccepts } = await planned(gridOf('mfj', 52, 500000, 2000000, 130000, 'none'));
  // premise: the walks accept nothing on a depleting household with the budget spent, and one 'none' age alone cannot move it
  expect(s.accepted).toBe(0);
  expect(s.budgetHit).toBe(true);
  expect(u.depletedAge !== null).toBe(true);
  expect(none.length >= 3).toBe(true);
  for (const age of none.slice(0, 3)) {
    const m = await applied({ ...off, conv: { [age]: 'none' } });
    expect(greedyAccepts(m, u), `none at ${age} alone`).toBe(false);
  }
  // the candidate: every proposal none age at once (accepted 0, so every age), kept
  expect(s.allNoneTried).toBe(true);
  expect(s.allNoneAges).toStrictEqual(none);
  expect(Object.keys(on.plan.conv).map(Number)).toStrictEqual(s.allNoneAges);
  expect(Object.values(on.plan.conv).every((t) => t === 'none')).toBe(true);
  expect(s.kept).toBe(true);
  expect(late(k.depletedAge) > late(u.depletedAge)).toBe(true);
  expect(late(k.homeDrawAge) >= late(u.homeDrawAge)).toBe(true);
  expect([mk.depletedAge, mk.homeDrawAge, mk.value]).toStrictEqual([k.depletedAge, k.homeDrawAge, k.value]);
  for (const a of s.allNoneAges) expect(mk.rows.find((x) => x.age === a).conversionAmount, `age ${a}`).toBe(0);
  // outside the budget
  expect(s.tried <= 24).toBe(true);
});

it("the all-none candidate only ever replaces the walk's plan by a better one", async () => {
  // (b1) accepted after a walk that kept targets: single person, HoH (1 child b. 2016); age 52; 401(k) 500k A; taxable 2000k;
  // spending 60k; elections none
  {
    const { on, s, mk, applied, greedyAccepts } = await planned(gridOf('hoh', 52, 500000, 2000000, 60000, 'none'));
    expect(s.accepted > 0 && s.allNoneAges.length >= 2).toBe(true);
    const conv = on.plan.conv;
    expect(Object.keys(conv).length).toBe(s.accepted + s.allNoneAges.length);
    for (const a of s.allNoneAges) expect(conv[a]).toBe('none');
    // the walk's own plan: the kept conv less the candidate's ages
    const walkConv = Object.fromEntries(Object.entries(conv).filter(([a]) => !s.allNoneAges.includes(Number(a))));
    expect(Object.keys(walkConv).length).toBe(s.accepted);
    const walk = await applied({ ...on.plan, conv: walkConv });
    expect(greedyAccepts(mk, walk)).toBe(true);
    expect(greedyAccepts(walk, mk)).toBe(false);
  }
  // (b2) refused: couple, MFJ; age 52; 401(k) 250k A + 250k B; taxable 300k; spending 60k; elections none (planning's prototype:
  // the walk accepted { 57: 'b10' }, the candidate tried and refused)
  {
    const { on, s, mk, none, applied, greedyAccepts } = await planned(gridOf('mfj', 52, 500000, 300000, 60000, 'none'));
    // premise: the walk kept a target, the candidate was tried, the pass is kept (so the kept plan is the walk's cur, the plan the
    // candidate was compared with)
    expect(s.accepted > 0).toBe(true);
    expect(s.allNoneTried).toBe(true);
    expect(s.kept).toBe(true);
    expect(s.allNoneAges).toStrictEqual([]);
    expect(Object.keys(on.plan.conv).length).toBe(s.accepted);
    // the refused trial rebuilt: the kept conv plus 'none' at each proposal none age not in it
    const trial = { ...on.plan.conv };
    for (const a of none) if (!(a in trial)) trial[a] = 'none';
    expect(Object.keys(trial).length - s.accepted >= 2).toBe(true);
    const m = await applied({ ...on.plan, conv: trial });
    expect(greedyAccepts(m, mk)).toBe(false);
  }
});
