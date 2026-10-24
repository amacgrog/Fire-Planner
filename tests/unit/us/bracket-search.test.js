// The cliff plan's conversion bracket in the engine (Batch 5 step 3a, spec A4): solveRothConversion resolves the override map,
// then the applied schedule, then the plan's bracket (only when the plan was made for the user's bracket, `bracketFrom`), then
// the setting; `apply` and `choose` read it alike. And the run's first home-equity draw age (`homeDrawAge`, non-enumerable).
// Every run goes through usPlan(w).runPlanMode with an explicit plan mode (no planning, no search: the search is Task 3's).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan, usOptimizer } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES } from '../helpers/scan-grid.mjs';

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

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(21);
});
