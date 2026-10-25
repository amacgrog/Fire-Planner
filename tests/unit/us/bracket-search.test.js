// The cliff plan's conversion bracket in the engine (Batch 5 step 3a, spec A4): solveRothConversion resolves the override map,
// then the applied schedule, then the plan's bracket (only when the plan was made for the user's bracket, `bracketFrom`), then
// the setting; `apply` and `choose` read it alike. And the run's first home-equity draw age (`homeDrawAge`, non-enumerable).
// The engine tests run through usPlan(w).runPlanMode with an explicit plan mode (no planning). The search tests (computeCliffPlan
// over BRACKET_CANDIDATES, ranked by bracketCandidateBetter) turn the search on in a fresh world per test (it ships off).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan, usOptimizer } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const c = makeCounter();
// tests/solver_gap.js's couple 62, IRMAA (CA), converting from 62 to 74 at the 22% setting, both living to 100.
const CA = GAP_CASES.find((g) => g.name === 'couple 62, IRMAA (CA)').patch(100, 100);
// The gap table's couple 58, trad-heavy, ACA (NY), converting from 58 to 74 at 22%, both living to 100.
const NY = GAP_CASES.find((g) => g.name === 'couple 58, trad-heavy, ACA (NY)').patch(100, 100);
const PLAIN = { intents: {}, family: 'none' };
const AT24 = { intents: {}, family: 'none', bracket: 24, bracketFrom: 22 };
// A couple, both 58 and retired, filing single until A is 60, then jointly; conversions 58-64; 1,500,000 traditional (900k A, 600k B).
const MARRY = {
  singlePerson: false, filingStatus: 'single', marryLater: true, marriageAgeA: 60, ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58,
  rothConvEnabled: true, rothConvStartAge: 58, rothConvEndAge: 64, tradIraA: 0, tradIraB: 0, trad401kA: 900000, trad401kB: 600000,
};
// No money anywhere but the house (the default home, 450,000, against a 300,000 mortgage); retired at 48 with no income, so the
// spending is drawn from the first year.
const BROKE = {
  ageA: 48, ageB: 43, retireAgeA: 48, retireAgeB: 43, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0,
  trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, tenure: 'own', homeValue: 450000, mortgagePrincipal: 300000, mortgage: 300000,
};

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  return { w, P: await usPlan(w) };
}

it('plan bracket honoured: a plan carrying 24% made for 22% runs as the 24% setting', async () => {
  const { w, P } = await setup(CA);
  const plan24 = P.runPlanMode({ planMode: 'apply', plan: AT24 }).rows;
  const plain22 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  await w.setState({ ...CA, rothConvBracket: 24 });
  const plain24 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  c.expect(plan24).toStrictEqual(plain24);
  // the bracket matters for this household (the test is not vacuous)
  c.expect(plan24[0].conversionAmount > plain22[0].conversionAmount).toBe(true);
});

it('bracketFrom mismatch: a plan made for 12% is ignored at the 22% setting', async () => {
  const { P } = await setup(CA);
  const stale = P.runPlanMode({ planMode: 'apply', plan: { intents: {}, family: 'none', bracket: 24, bracketFrom: 12 } }).rows;
  const plain22 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  c.expect(stale).toStrictEqual(plain22);
});

it('override map wins over the plan bracket', async () => {
  const { w, P } = await setup(CA);
  const O = await usOptimizer(w);
  O.setRothOverride(new Map([[62, 12]]));
  const pinned = P.runPlanMode({ planMode: 'apply', plan: AT24 }).rows;
  O.setRothOverride(null);
  const plan24 = P.runPlanMode({ planMode: 'apply', plan: AT24 }).rows;
  await w.setState({ ...CA, rothConvBracket: 12 });
  const plain12 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  c.expect(pinned[0].conversionAmount).toBe(plain12[0].conversionAmount);
  c.expect(pinned[0].conversionAmount < plan24[0].conversionAmount).toBe(true);
});

it('applied schedule wins over the plan bracket', async () => {
  const { w, P } = await setup({ ...CA, appliedRothSchedule: { 62: 12 } });
  const scheduled = P.runPlanMode({ planMode: 'apply', plan: AT24 }).rows;
  await w.setState(CA);
  const plan24 = P.runPlanMode({ planMode: 'apply', plan: AT24 }).rows;
  await w.setState({ ...CA, rothConvBracket: 12 });
  const plain12 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  c.expect(scheduled[0].conversionAmount).toBe(plain12[0].conversionAmount);
  c.expect(scheduled[0].conversionAmount < plan24[0].conversionAmount).toBe(true);
});

// The CA couple records no intent at any bracket; the NY couple (two ACA stay-unders) pins it with intents.
it('apply reproduces choose with the plan bracket', async () => {
  for (const [patch, withIntents] of [[CA, false], [NY, true]]) {
    const { P } = await setup(patch);
    const chosen = P.runPlanMode({ planMode: 'choose', plan: AT24 });
    if (withIntents) c.expect(Object.keys(chosen.intents).length > 0).toBe(true);
    const applied = P.runPlanMode({ planMode: 'apply', plan: { intents: chosen.intents, family: 'all', bracket: 24, bracketFrom: 22 } });
    c.expect(applied.rows).toStrictEqual(chosen.rows);
  }
});

it('filing change: the plan bracket across a marriage equals the 24% setting', async () => {
  const { w, P } = await setup(MARRY);
  const plan24 = P.runPlanMode({ planMode: 'apply', plan: AT24 }).rows;
  const plain22 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  await w.setState({ ...MARRY, rothConvBracket: 24 });
  const plain24 = P.runPlanMode({ planMode: 'apply', plan: PLAIN }).rows;
  c.expect(plan24).toStrictEqual(plain24);
  // a single-return year (58) and a joint year (60) both convert more at 24%
  c.expect(plan24[0].conversionAmount > plain22[0].conversionAmount).toBe(true);
  c.expect(plan24[2].conversionAmount > plain22[2].conversionAmount).toBe(true);
});

it('homeDrawAge: an owner with no money draws on the house at once; a renter and a funded owner never', async () => {
  const { w, P } = await setup(BROKE);
  const owner = P.runPlanMode({ planMode: 'off' }).sim;
  c.expect(owner.homeDrawAge).toBe(48);
  c.expect(owner.depletedAge > 48).toBe(true);
  await w.setState({ ...BROKE, tenure: 'rent' });
  const renter = P.runPlanMode({ planMode: 'off' }).sim;
  c.expect(renter.homeDrawAge).toBe(null);
  c.expect(renter.depletedAge).toBe(48);
  await w.setState({ ...BROKE, taxable: 5000000 });
  const funded = P.runPlanMode({ planMode: 'off' }).sim;
  c.expect(funded.homeDrawAge).toBe(null);
  c.expect(funded.depletedAge).toBe(null);
});

it('no snapshot field: homeDrawAge is not enumerable', async () => {
  const { P } = await setup(BROKE);
  const sim = P.runPlanMode({ planMode: 'off' }).sim;
  c.expect(Object.keys(sim).includes('homeDrawAge')).toBe(false);
  c.expect(Object.prototype.hasOwnProperty.call(sim, 'homeDrawAge')).toBe(true);
});

// ---- The search (spec A2, A3) ----
// The plan and report of computeCliffPlan for `patch` in a fresh world, the search switched on unless `searchOff`.
async function plan(patch, { searchOff = false, opts } = {}) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = searchOff;
  await w.setState(patch);
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  return computeCliffPlan(await w.ctx(), opts);
}
const threshold = (v) => Math.max(1, 0.001 * Math.abs(v));
const depOf = (d) => (d === null ? Infinity : d);
const keptOf = (report) => report.brackets.find((b) => b.bracket === report.keptBracket);

it('bracketCandidateBetter: depletion, then the first home draw, then the value by more than the threshold', async () => {
  const w = await world();
  const { bracketCandidateBetter: better } = await w.load('us/core/cliff-plan/solver.js');
  const at = (depletedAge, homeDrawAge, value) => ({ depletedAge, homeDrawAge, value });
  c.expect(better(at(91, null, 0), at(90, null, 1e9))).toBe(true); // later depletion wins whatever the value
  c.expect(better(at(89, null, 2e9), at(90, null, 0))).toBe(false); // earlier depletion never wins
  c.expect(better(at(90, 85, 0), at(90, 80, 1e9))).toBe(true); // equal depletion, later home draw wins
  c.expect(better(at(90, null, 0), at(90, 80, 1e9))).toBe(true); // never drawing on the house is latest
  c.expect(better(at(95, 70, 2e6), at(90, 80, 1e6))).toBe(false); // an earlier home draw never wins, even depleting later
  c.expect(better(at(null, null, 1001000), at(null, null, 1000000))).toBe(false); // exactly 0.1%: not a win
  c.expect(better(at(null, null, 1001000.01), at(null, null, 1000000))).toBe(true); // one cent more: a win
  c.expect(better(at(null, null, 100.5), at(null, null, 100))).toBe(false); // the $1 floor
  c.expect(better(at(null, null, 101.01), at(null, null, 100))).toBe(true);
  c.expect(better(at(null, null, 0), at(90, null, 1e6))).toBe(true); // null depletion beats 90
});

it('home draw blocks: a richer candidate that draws on the house at 80 never replaces one that never does', async () => {
  const w = await world();
  const { bracketCandidateBetter } = await w.load('us/core/cliff-plan/solver.js');
  c.expect(bracketCandidateBetter({ depletedAge: null, homeDrawAge: 80, value: 2e6 }, { depletedAge: null, homeDrawAge: null, value: 1e6 })).toBe(false);
});

it('search order and report: the user bracket first, then the others ascending; the kept bracket owns the family report', async () => {
  const { plan: p, report } = await plan(CA);
  c.expect(report.brackets.map((b) => b.bracket)).toStrictEqual([22, 10, 12, 24, 32, 35]);
  c.expect(Object.keys(report.brackets[0])).toStrictEqual(['bracket', 'family', 'intents', 'depletedAge', 'homeDrawAge', 'value', 'cost']);
  c.expect(report.searched).toBe(true);
  const kept = keptOf(report);
  c.expect(p.bracket).toBe(report.keptBracket);
  c.expect(p.bracketFrom).toBe(22);
  c.expect(p.family).toBe(kept.family);
  c.expect(report.kept).toBe(kept.family);
  const fam = report.candidates.find((x) => x.family === report.kept);
  c.expect([fam.depletedAge, fam.value, fam.cost, fam.intents]).toStrictEqual([kept.depletedAge, kept.value, kept.cost, kept.intents]);
  // every bracket that depletes and first draws on the house with the kept one is worth at most the kept value plus the threshold
  const over = report.brackets.filter((b) => b.depletedAge === kept.depletedAge && b.homeDrawAge === kept.homeDrawAge && b.value > kept.value + threshold(kept.value));
  c.expect(over).toStrictEqual([]);
});

it('CA at 100 keeps a higher bracket, worth more than the 22% plan by more than the threshold', async () => {
  const { report } = await plan(CA);
  const b22 = report.brackets[0];
  c.expect(report.keptBracket !== 22).toBe(true);
  c.expect(keptOf(report).value > b22.value + threshold(b22.value)).toBe(true);
});

it('skipped: an applied schedule, conversions off, no window age in the plan, bracketSearchOff; the guard off; search: false', async () => {
  const skips = [
    [{ ...CA, appliedRothSchedule: { 62: 22 } }, {}],
    [{ ...CA, rothConvEnabled: false }, {}],
    [{ ...CA, rothConvStartAge: 50, rothConvEndAge: 55 }, {}],
    [CA, { searchOff: true }],
  ];
  for (const [patch, o] of skips) {
    const { plan: p, report } = await plan(patch, o);
    c.expect(report.brackets.length).toBe(1);
    c.expect(p.bracket === p.bracketFrom).toBe(true);
  }
  // a plan the search does not apply to is final even after search: false
  c.expect((await plan({ ...CA, rothConvEnabled: false }, { opts: { search: false } })).report.searched).toBe(true);
  c.expect(await plan({ ...CA, cliffGuardEnabled: false })).toStrictEqual({ plan: null, report: null });
  const { plan: p, report } = await plan(CA, { opts: { search: false } });
  c.expect(report.brackets.length).toBe(1);
  c.expect(report.searched).toBe(false);
  c.expect([p.bracket, p.bracketFrom, report.keptBracket]).toStrictEqual([22, 22, 22]);
});

it("never earlier: the scan grid's first 24 converting households never deplete or first draw on the house earlier", async () => {
  for (const h of scanHouseholds({ conversions: true, mode: 'default' }).slice(0, 24)) {
    const { report } = await plan(h.patch);
    const user = report.brackets[0],
      kept = keptOf(report);
    c.expect(depOf(kept.depletedAge) >= depOf(user.depletedAge)).toBe(true);
    c.expect(depOf(kept.homeDrawAge) >= depOf(user.homeDrawAge)).toBe(true);
  }
});

// ---- The optimizers against the searched plan (Task 5) ----
// The first trial context an optimizer builds with a Roth override map is its "today's flat setting" start (starts[0], the
// first trial it runs; the base context it builds before, with no maps, is not a trial): with the search on, that start must
// pin every window age to the plan's bracket (not the setting's) and so reproduce the selected plan. Budget 1: each start runs
// only its starting point.
it('optimizer start is the selected plan: the flat start of both optimizers reproduces the searched plan', async () => {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = false;
  await w.setState(CA);
  const O = await usOptimizer(w);
  const selected = O.simulate();
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  c.expect(cliffPlanStore.plan.bracket !== 22 && cliffPlanStore.plan.bracketFrom === 22).toBe(true); // the plan's bracket differs
  const store = await w.load('shared/core/store.js');
  const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
  const { optimizeMultiLever, optimizeRothLadderPerYear } = await w.load('us/core/optimizer/multi-lever.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
  const firstContext = (run) => {
    const inner = stateContextFor();
    let first = null;
    run((variant, overrides) => {
      const ctx = inner(variant, overrides);
      if (!first && overrides && overrides.rothBracketByAge) first = ctx;
      return ctx;
    });
    return first;
  };
  const search = { budget: 1, objective: 'endValue' };
  const starts = [
    firstContext((cf) => optimizeRothLadderPerYear(selected, store.state, cf, search)),
    firstContext((cf) => optimizeMultiLever(selected, store.state, cf, { includeRoth: true, includeMix: true }, search)),
  ];
  const selectedValue = US_OBJECTIVES.endValue.value(starts[0], selected);
  const pinned = [];
  for (let a = store.state.rothConvStartAge; a <= store.state.rothConvEndAge; a++) pinned.push([a, cliffPlanStore.plan.bracket]);
  for (const ctx of starts) {
    c.expect([...ctx.overrides.rothBracketByAge.entries()]).toStrictEqual(pinned);
    const sim = simulateWith(ctx);
    c.expect(sim.depletedAge).toBe(selected.depletedAge);
    c.expect(US_OBJECTIVES.endValue.value(ctx, sim)).toBe(selectedValue);
    c.expect(sim.rows).toStrictEqual(selected.rows);
  }
});

// tests/unit/us/roth-optimizer-per-year.test.js's guardrail household (retired at 50, converting 50-58 at 22%, ACA on): with
// the search on, the searched plan lasts longer than the 22% plan; the per-year optimizer's suggestion must not deplete, or
// first draw on the house, earlier than it.
it('optimizer never earlier: the per-year suggestion depletes and draws on the house no earlier than the searched plan', async () => {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = false;
  await w.setState({ rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 58, rothConvBracket: 22, acaEnabled: true, retireAgeA: 50 });
  const O = await usOptimizer(w);
  const selected = O.simulate();
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  c.expect(cliffPlanStore.plan.bracket !== 22).toBe(true); // the search kept another bracket (it is exercised)
  c.expect(selected.depletedAge !== null).toBe(true); // the guardrail binds (the test is not vacuous)
  const opt = O.optimizeRothLadderPerYear(selected, 'lifetimeCost');
  c.expect(depOf(opt.depletedAge) >= depOf(selected.depletedAge)).toBe(true);
  c.expect(depOf(opt.homeDrawAge) >= depOf(selected.homeDrawAge)).toBe(true);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(117);
});
