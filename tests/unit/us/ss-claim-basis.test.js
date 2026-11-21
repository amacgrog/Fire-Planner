// SS claiming optimizer PR 1: the benefit basis (`ssBenefitBasisA/B`: `atClaim`, the amount paid as entered, or `pia`, the
// benefit at full retirement age adjusted for the claim age), the claim factors, "already collecting" and "claims now", and
// the one benefit formula in src/us/core/income/social-security.js that the engine, the cliff plan and the Sankey share.
// Inflation 0 throughout, so the factor is exactly 1 and a year's benefit is the monthly figure x 12 (x the claim factor in
// `pia`); the tax year is 2026. Roth conversions and ACA are off. Expected `pia` amounts are written in the code's order,
// monthly x 12 x a hand-computed factor (units of 1/3600: 20 a month for the first 36 months early, 15 beyond, 24 late).
import { it, vi, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usCoreFilesContaining } from '../helpers/markup.js';

const NEW_COUNT = 67;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// A single retiree of 62 in 2026 (born 1964, full retirement age 67), 2,000 a month entered as the benefit at full retirement age.
const SINGLE = {
  singlePerson: true, ageA: 62, retireAgeA: 62, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, ssMonthlyA: 2000, ssStartAgeA: 67, ssBenefitBasisA: 'pia', stateTax: 'tx', acaEnabled: false, healthcare: 0,
  rothConvEnabled: false,
};
const ssAt = (rows, age) => rows.find((r) => r.age === age).ss;
const rowsOf = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return (await engine(w)).simulateRaw().rows;
};
const ssModule = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return { w, m: await w.load('us/core/income/social-security.js'), ctx: await w.ctx() };
};

it('full retirement age by birth year (POMS RS 00615.003)', async () => {
  const { m } = await ssModule(SINGLE);
  const years = [1937, 1938, 1942, 1943, 1954, 1955, 1959, 1960, 1990];
  c.expect(years.map((y) => m.ssFullRetirementAgeMonths(y))).toStrictEqual([780, 782, 790, 792, 792, 794, 802, 804, 804]);
});

it('the claim factors at 62, full retirement age and 70', async () => {
  const { m } = await ssModule(SINGLE);
  const f = m.ssClaimFactor;
  // FRA 67 (804 months): 60 months early is 36 x 20 + 24 x 15 = 1080 units; 36 months late is 864.
  c.expect(f(804, 62)).toBe(0.7);
  c.expect(f(804, 67)).toBe(1);
  c.expect(f(804, 70)).toBe(1.24);
  c.expect(f(804, 65)).toBe(3120 / 3600);
  c.expect(f(804, 64)).toBe(2880 / 3600);
  // FRA 66 (792): 48 months early, 720 + 180 = 900 units; 48 months late, 1152.
  c.expect(f(792, 62)).toBe(0.75);
  c.expect(f(792, 70)).toBe(1.32);
  // FRA 66 and 6 months (798, born 1957): 54 months early, 720 + 270 = 990; 42 months late, 1008.
  c.expect(f(798, 62)).toBe(2610 / 3600);
  c.expect(f(798, 70)).toBe(4608 / 3600);
  // The claim age is clamped to 62-70.
  c.expect(f(804, 60)).toBe(0.7);
  c.expect(f(804, 75)).toBe(1.24);
});

it('the factor age: collecting reads the start age, otherwise a start age already past is a claim now', async () => {
  const at = async (patch) => {
    const { m, ctx } = await ssModule({ ...SINGLE, ageA: 65, retireAgeA: 65, ...patch });
    return m.ssFactorAge(ctx, 'A');
  };
  c.expect(await at({ ssStartAgeA: 62 })).toBe(65);
  c.expect(await at({ ssStartAgeA: 62, ssCollectingA: true })).toBe(62);
  c.expect(await at({ ssStartAgeA: 68 })).toBe(68);
  // A collecting box with a start age still ahead cannot be a benefit already being paid: read as not collecting.
  c.expect(await at({ ssStartAgeA: 68, ssCollectingA: true })).toBe(68);
});

it('the full retirement age follows the tax year (Review Focus 4)', async () => {
  const w = await world();
  await w.setState({ ...SINGLE, ageA: 66, retireAgeA: 66, ssStartAgeA: 66 });
  const m = await w.load('us/core/income/social-security.js');
  // 2026: born 1960, FRA 804, 12 months early, 240 units.
  c.expect(m.ownBenefitYearly(await w.ctx(), 'A', 66, 1, 1)).toBe(24000 * (3360 / 3600));
  // 2025: born 1959, FRA 802, 10 months early, 200 units.
  await w.setTaxYear(2025);
  const m2 = await w.load('us/core/income/social-security.js');
  c.expect(m2.ownBenefitYearly(await w.ctx(), 'A', 66, 1, 1)).toBe(24000 * (3400 / 3600));
});

it('atClaim keeps the old formula to the bit', async () => {
  const { m, ctx } = await ssModule({ singlePerson: false, ssMonthlyA: 2500, ssStartAgeA: 62 });
  for (const a of [61, 62, 80]) c.expect(m.ownBenefitYearly(ctx, 'A', a, 1.37, 0.78)).toBe((a >= 62 ? 2500 * 12 : 0) * 1.37 * 0.78);
  c.expect(m.ssOwnFactor(ctx, 'A')).toBe(1);
});

it('pia: the rows pay the factor of the start age', async () => {
  const at67 = await rowsOf(SINGLE);
  c.expect([62, 63, 66].map((a) => ssAt(at67, a))).toStrictEqual([0, 0, 0]);
  c.expect(ssAt(at67, 67)).toBe(24000);
  c.expect(ssAt(at67, 80)).toBe(24000);
  c.expect(ssAt(await rowsOf({ ...SINGLE, ssStartAgeA: 62 }), 62)).toBe(24000 * 0.7);
  const at70 = await rowsOf({ ...SINGLE, ssStartAgeA: 70 });
  c.expect(ssAt(at70, 69)).toBe(0);
  c.expect(ssAt(at70, 70)).toBe(24000 * 1.24);
  // The same state entered as the amount at the start age: paid as entered (today).
  c.expect(ssAt(await rowsOf({ ...SINGLE, ssStartAgeA: 62, ssBenefitBasisA: 'atClaim' }), 62)).toBe(24000);
});

it('pia: a start age below 62 is paid from it at the factor of 62 (Review Focus 1)', async () => {
  const rows = await rowsOf({ ...SINGLE, ageA: 58, retireAgeA: 58, ssStartAgeA: 60 });
  c.expect(ssAt(rows, 59)).toBe(0);
  c.expect(ssAt(rows, 60)).toBe(24000 * 0.7);
  c.expect(ssAt(rows, 61)).toBe(24000 * 0.7);
});

it('pia: a start age past 70 under the switch gets the factor of 70 (Review Focus 2)', async () => {
  const rows = await rowsOf({ ...SINGLE, ssLateStartEnabled: true, ssStartAgeA: 72 });
  c.expect(ssAt(rows, 71)).toBe(0);
  c.expect(ssAt(rows, 72)).toBe(24000 * 1.24);
});

it('pia: claims now, and already collecting (Review Focus 3)', async () => {
  // 72 in 2026 is born 1954: full retirement age 66, so the factor of 70 is 1.32 and of 62 is 0.75.
  const at72 = { ...SINGLE, ageA: 72, retireAgeA: 72, ssStartAgeA: 62 };
  c.expect(ssAt(await rowsOf(at72), 72)).toBe(24000 * 1.32);
  c.expect(ssAt(await rowsOf({ ...at72, ssCollectingA: true }), 72)).toBe(24000 * 0.75);
  const at65 = { ...SINGLE, ageA: 65, retireAgeA: 65, ssStartAgeA: 62 };
  c.expect(ssAt(await rowsOf(at65), 65)).toBe(24000 * (3120 / 3600));
  c.expect(ssAt(await rowsOf({ ...at65, ssCollectingA: true }), 65)).toBe(24000 * 0.7);
});

it('atClaim: the collecting box changes nothing', async () => {
  const base = { ...SINGLE, ageA: 65, retireAgeA: 65, ssStartAgeA: 62, ssBenefitBasisA: 'atClaim' };
  c.expect(await rowsOf({ ...base, ssCollectingA: true })).toStrictEqual(await rowsOf({ ...base, ssCollectingA: false }));
});

it('a state without the new keys projects as atClaim', async () => {
  const base = { ...SINGLE, ssStartAgeA: 62 };
  delete base.ssBenefitBasisA;
  const w = await world();
  const s = await w.setState(base);
  for (const k of ['ssBenefitBasisA', 'ssBenefitBasisB', 'ssCollectingA', 'ssCollectingB']) delete s[k];
  const without = (await engine(w)).simulateRaw().rows;
  c.expect(ssAt(without, 62)).toBe(24000);
  c.expect(without).toStrictEqual(await rowsOf({ ...base, ssBenefitBasisA: 'atClaim', ssBenefitBasisB: 'atClaim', ssCollectingA: false, ssCollectingB: false }));
});

// The identical-partner household of tests/unit/us/ss-late-start.test.js, both benefits in pia, one claiming at 62 and the
// other at 70, with the earlier claimer dying at 75: the survivor keeps the larger benefit (the 70 claim's), whichever
// partner it is (Review Focus 5).
const COUPLE = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 60000, taxable: 400000,
  tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 300000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0,
  cash: 30000, inflation: 0, dividendYield: 0, pensionCoverage: 'both', pensionYearlyA: 30000, pensionYearlyB: 30000,
  pensionStartAgeA: 62, pensionStartAgeB: 62, survivorEnabled: true, survivorDeathAge: 75, survivorSpendingPct: 70,
  ltcEnabled: false, healthcare: 0, ssMonthlyA: 2000, ssMonthlyB: 2000, ssLateStartEnabled: false,
  ssBenefitBasisA: 'pia', ssBenefitBasisB: 'pia', stateTax: 'tx', acaEnabled: false,
};
const A_DIES = { ...COUPLE, survivorPartner: 'A', ssStartAgeA: 62, ssStartAgeB: 70 };
const B_DIES = { ...COUPLE, survivorPartner: 'B', ssStartAgeA: 70, ssStartAgeB: 62 };

it('pia survivor: the larger factored benefit continues, and who dies does not matter', async () => {
  const a = await rowsOf(A_DIES),
    b = await rowsOf(B_DIES);
  c.expect(a.length).toBe(b.length);
  c.expect(a.map((r) => r.ss)).toStrictEqual(b.map((r) => r.ss));
  for (const k of ['tax', 'income', 'investable']) c.expect(a.map((r) => r[k])).toStrictEqual(b.map((r) => r[k]));
  c.expect(ssAt(a, 62)).toBe(24000 * 0.7);
  c.expect(ssAt(a, 69)).toBe(24000 * 0.7);
  c.expect(ssAt(a, 70)).toBe(24000 * 0.7 + 24000 * 1.24);
  c.expect(ssAt(a, 74)).toBe(24000 * 0.7 + 24000 * 1.24);
  c.expect(ssAt(a, 75)).toBe(24000 * 1.24);
  c.expect(ssAt(a, 85)).toBe(24000 * 1.24);
});

it('the cliff plan reads the same benefit (benefitIncomeAt)', async () => {
  const w = await world();
  await w.setState({ ...SINGLE, ssStartAgeA: 62 });
  const { benefitIncomeAt } = await w.load('us/core/cliff-plan/solver.js');
  const ctx = await w.ctx();
  c.expect(benefitIncomeAt(ctx, 0, true, 1, null)).toBe(24000 * 0.7);
  c.expect(benefitIncomeAt(ctx, 10, true, 1, null)).toBe(24000 * 0.7);
});

it('the Sankey reads the same benefit, before and after the death', async () => {
  const w = await world();
  await w.setState(A_DIES);
  const rows = (await engine(w)).simulateRaw().rows;
  const { sankeyColumns } = await w.load('us/core/income/sankey-columns.js');
  const ctx = await w.ctx();
  for (const age of [70, 80]) {
    const row = rows.find((r) => r.age === age),
      cols = sankeyColumns(ctx, row),
      group = cols.in.find((g) => g.key === 'retirement'),
      item = (k) => group.items.find((it) => it.key === k)?.value ?? 0;
    c.expect(item('ssA') + item('ssB')).toBe(row.ss);
    c.expect(cols.issues.filter((s) => s.startsWith('retirement'))).toStrictEqual([]);
  }
});

it('one formula: only the inputs modules and social-security.js read the entered benefit', () => {
  c.expect(usCoreFilesContaining('ssMonthly').filter((f) => !f.startsWith('inputs/'))).toStrictEqual(['income/social-security.js']);
});

it('normalize: a basis off the list is atClaim, and collecting is true only when true', async () => {
  const w = await world();
  const s = await w.setState({ ssBenefitBasisA: 'x', ssBenefitBasisB: 'pia', ssCollectingA: 'yes', ssCollectingB: true });
  c.expect([s.ssBenefitBasisA, s.ssBenefitBasisB, s.ssCollectingA, s.ssCollectingB]).toStrictEqual(['atClaim', 'pia', false, true]);
  const d = await (await world()).setState({});
  c.expect([d.ssBenefitBasisA, d.ssBenefitBasisB, d.ssCollectingA, d.ssCollectingB]).toStrictEqual(['atClaim', 'atClaim', false, false]);
});

// The seed and the stored-plan fingerprint of the ss-benefit-cut.test.js single retiree, recorded on main before this PR
// (2026-11-21, at e9914619): the new keys at their defaults must leave both as they were, so no Monte Carlo figure moves and
// no saved plan goes stale.
const RETIREE = {
  singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, ssMonthlyA: 2000, ssStartAgeA: 65, stateTax: 'tx', acaEnabled: false, healthcare: 0, rothConvEnabled: false,
};
it('the Monte Carlo seed and the stored-plan fingerprint do not move at the defaults', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const s = await w.setState(RETIREE);
  c.expect(monteCarloSeed(2026, 500, s)).toBe(2315242127);
  c.expect(monteCarloSeed(2026, 500, { ...s, ssBenefitBasisA: 'pia', ssCollectingA: true })).toBe(2315242127);
  // plan-optimizer.js sits in the UI tree: its imports look elements up at load, so give them an empty document.
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint } = await w.load('us/ui/results/plan-optimizer.js');
    c.expect(storedPlanFingerprint(s)).toBe('47067756');
    c.expect(storedPlanFingerprint({ ...s, ssBenefitBasisA: 'pia' }) === '47067756').toBe(false);
    c.expect(storedPlanFingerprint({ ...s, ssCollectingB: true }) === '47067756').toBe(false);
    c.expect(storedPlanFingerprint({ ...s, ssBenefitBasisA: 'pia' }) === storedPlanFingerprint({ ...s, ssCollectingB: true })).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
