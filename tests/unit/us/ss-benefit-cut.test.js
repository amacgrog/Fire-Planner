// Feedback B2: the Social Security benefit-cut what-if (ssPaidShare in src/us/core/income/social-security.js, the input rules in
// src/us/core/inputs/ss-benefit-cut.js). The cut is applied where the benefit is computed, so every reader downstream (Pub. 915,
// the MAGI the ACA and IRMAA read, the state treatment, the survivor swap) sees the cut amount. Inflation 0 throughout, so the
// factor is exactly 1 and a year's benefit is the monthly figure x 12; the tax year is 2026, so projection year y is 2026 + y.
import { it, vi, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usShellText } from '../helpers/markup.js';

const NEW_COUNT = 58;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// A single retiree at 65 (2026) with 2,000 a month of Social Security from 65: 24,000 a year; 22% off is 18,720 (24,000 x 0.78).
const SINGLE = {
  singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, ssMonthlyA: 2000, ssStartAgeA: 65, stateTax: 'tx', acaEnabled: false, healthcare: 0, rothConvEnabled: false,
};
const ssAt = (rows, age) => rows.find((r) => r.age === age).ss;
const rowsOf = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return (await engine(w)).simulateRaw().rows;
};

it('a 22% cut from 2030 pays the full benefit before 2030 and 78% from 2030 on', async () => {
  const rows = await rowsOf({ ...SINGLE, ssBenefitCutPct: 22, ssBenefitCutStartYear: 2030 });
  c.expect([65, 66, 67, 68].map((a) => ssAt(rows, a))).toStrictEqual([24000, 24000, 24000, 24000]);
  c.expect(ssAt(rows, 69)).toBe(18720);
  c.expect(ssAt(rows, 75)).toBe(18720);
  c.expect(ssAt(rows, 90)).toBe(18720);
});

it('the years before the cut are the uncut run\'s rows', async () => {
  const cut = await rowsOf({ ...SINGLE, ssBenefitCutPct: 22, ssBenefitCutStartYear: 2030 });
  const full = await rowsOf(SINGLE);
  c.expect(cut.length).toBe(full.length);
  c.expect(cut.slice(0, 4)).toStrictEqual(full.slice(0, 4));
  c.expect(cut[4].ss === full[4].ss).toBe(false);
});

// Every reader downstream of the benefit: a 22% cut from year 0 must be, row for row, the uncut run of a benefit entered at
// 1,560 a month (2,000 x 78%; 1,560 x 12 = 18,720), here with a 30,000 pension so the Pub. 915 worksheet is in its 85% range.
it('a cut from year 0 is the same projection as a lower entered benefit (taxable Social Security follows)', async () => {
  const base = { ...SINGLE, pensionCoverage: 'a', pensionYearlyA: 30000, pensionStartAgeA: 65 };
  const cut = await rowsOf({ ...base, ssBenefitCutPct: 22, ssBenefitCutStartYear: 2026 });
  const lower = await rowsOf({ ...base, ssMonthlyA: 1560 });
  const full = await rowsOf(base);
  c.expect(ssAt(cut, 65)).toBe(18720);
  c.expect(cut).toStrictEqual(lower);
  c.expect(cut[0].tax === full[0].tax).toBe(false);
});

it('the Pub. 915 worksheet on the cut benefit (hand-computed)', async () => {
  const w = await world();
  const { taxableSocialSecurity } = await w.load('us/core/tax/social-security-tax.js');
  // Single: provisional income 30,000 + 9,360 = 39,360; 85% x (39,360 - 34,000) + min(4,500, 9,360) = 4,556 + 4,500.
  c.expect(taxableSocialSecurity(18720, 30000, 'single')).toBe(9056);
  // Uncut: 30,000 + 12,000 = 42,000; 85% x 8,000 + 4,500 = 11,300 (under 85% of 24,000 = 20,400).
  c.expect(taxableSocialSecurity(24000, 30000, 'single')).toBe(11300);
});

it('a percent of 0 is no cut whatever the start year; a start year before the tax year cuts from year 0', async () => {
  const def = await rowsOf(SINGLE);
  c.expect(await rowsOf({ ...SINGLE, ssBenefitCutPct: 0, ssBenefitCutStartYear: 2026 })).toStrictEqual(def);
  c.expect(ssAt(def, 65)).toBe(24000);
  const early = await rowsOf({ ...SINGLE, ssBenefitCutPct: 25, ssBenefitCutStartYear: 2020 });
  c.expect(ssAt(early, 65)).toBe(18000);
  const all = await rowsOf({ ...SINGLE, ssBenefitCutPct: 100, ssBenefitCutStartYear: 2026 });
  c.expect(all.every((r) => r.ss === 0)).toBe(true);
});

it('the defaults are 0 and 2033 (an old save without the keys: tests/legacy_state.js)', async () => {
  const w = await world();
  const s = await w.setState({ ssMonthlyA: 2000 });
  c.expect(s.ssBenefitCutPct).toBe(0);
  c.expect(s.ssBenefitCutStartYear).toBe(2033);
});

it('normalizeState clamps the percent and rounds the year up into range', async () => {
  const w = await world();
  const cases = [
    [{ ssBenefitCutPct: 150 }, 100, 2033], [{ ssBenefitCutPct: -5 }, 0, 2033], [{ ssBenefitCutPct: 'abc' }, 0, 2033],
    [{ ssBenefitCutPct: '30' }, 30, 2033], [{ ssBenefitCutStartYear: 2035.6 }, 0, 2036], [{ ssBenefitCutStartYear: 2034.4 }, 0, 2035],
    [{ ssBenefitCutStartYear: 1990 }, 0, 2000], [{ ssBenefitCutStartYear: 0 }, 0, 2000], [{ ssBenefitCutStartYear: 2500 }, 0, 2200],
    [{ ssBenefitCutStartYear: 'x' }, 0, 2033], [{ ssBenefitCutStartYear: '' }, 0, 2033], [{ ssBenefitCutStartYear: null }, 0, 2033],
    [{ ssBenefitCutStartYear: '2040' }, 0, 2040],
  ];
  for (const [patch, pct, year] of cases) {
    const s = await w.setState(patch);
    c.expect([s.ssBenefitCutPct, s.ssBenefitCutStartYear]).toStrictEqual([pct, year]);
  }
});

it('the Trustees preset constants, and the bubble names the same figures', async () => {
  const w = await world();
  const k = await w.load('us/core/inputs/ss-benefit-cut.js');
  c.expect(k.SS_TRUSTEES_CUT_PCT).toBe(22);
  c.expect(k.SS_TRUSTEES_CUT_START_YEAR).toBe(2033);
  c.expect(k.SS_TRUSTEES_REPORT_YEAR).toBe(2026);
  const tip = /<label for="ssBenefitCutPct">[\s\S]*?data-tip="([^"]*)"/.exec(usShellText())[1];
  c.expect(tip.includes(k.SS_TRUSTEES_CUT_PCT + '% cut from ' + k.SS_TRUSTEES_CUT_START_YEAR)).toBe(true);
  c.expect(tip.includes('The ' + k.SS_TRUSTEES_REPORT_YEAR + ' Trustees Report')).toBe(true);
  c.expect(tip.includes('not a forecast')).toBe(true);
  c.expect(tip.includes('full retirement age')).toBe(true);
});

it('the cut moves neither the Monte Carlo seed nor, while it is 0, a stored plan fingerprint', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const s = await w.setState(SINGLE);
  const { ssBenefitCutPct, ssBenefitCutStartYear, ...without } = s;
  c.expect(monteCarloSeed(2026, 500, s)).toBe(monteCarloSeed(2026, 500, without));
  c.expect(monteCarloSeed(2026, 500, { ...s, ssBenefitCutPct: 22 })).toBe(monteCarloSeed(2026, 500, s));
  // plan-optimizer.js sits in the UI tree: its imports look elements up at load, so give them an empty document.
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint } = await w.load('us/ui/results/plan-optimizer.js');
    const f = storedPlanFingerprint(s);
    c.expect(storedPlanFingerprint({ ...s, ssBenefitCutStartYear: 2040 })).toBe(f);
    c.expect(storedPlanFingerprint({ ...s, ssBenefitCutPct: 22 }) === f).toBe(false);
    c.expect(storedPlanFingerprint({ ...s, ssBenefitCutPct: 22, ssBenefitCutStartYear: 2040 }) === storedPlanFingerprint({ ...s, ssBenefitCutPct: 22 })).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('the cliff plan\'s benefit estimate takes the cut from its year on', async () => {
  const w = await world();
  await w.setState({ ...SINGLE, ssBenefitCutPct: 22, ssBenefitCutStartYear: 2030 });
  const { benefitIncomeAt } = await w.load('us/core/cliff-plan/solver.js');
  const ctx = await w.ctx();
  c.expect(benefitIncomeAt(ctx, 3, true, 1, null)).toBe(24000);
  c.expect(benefitIncomeAt(ctx, 4, true, 1, null)).toBe(18720);
  c.expect(benefitIncomeAt(ctx, 10, true, 1, null)).toBe(18720);
});

// The identical-partner household of tests/survivor_symmetry.js (US), both 62 in 2026 with benefits from 67 (2031) and a 22% cut
// from 2033 (age 69): who dies at 75 must not change anything. 0 before 67; 2 x 24,000 at 67-68; 2 x 18,720 at 69-74; from 75
// the survivor keeps the greater of two equal cut benefits (18,720).
const COUPLE = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 60000, taxable: 400000,
  tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 300000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0,
  cash: 30000, inflation: 0, dividendYield: 0, pensionCoverage: 'both', pensionYearlyA: 30000, pensionYearlyB: 30000,
  pensionStartAgeA: 62, pensionStartAgeB: 62, survivorEnabled: true, survivorDeathAge: 75, survivorSpendingPct: 70,
  ltcEnabled: false, healthcare: 0, ssMonthlyA: 2000, ssMonthlyB: 2000, ssStartAgeA: 67, ssStartAgeB: 67,
  stateTax: 'tx', acaEnabled: false, ssBenefitCutPct: 22, ssBenefitCutStartYear: 2033,
};

it('survivor symmetry holds with a benefit cut', async () => {
  const rowsFor = async (survivorPartner) => {
    const w = await world();
    await w.setState({ ...COUPLE, survivorPartner });
    return (await engine(w)).simulate().rows;
  };
  const a = await rowsFor('A'),
    b = await rowsFor('B');
  c.expect(a.length).toBe(b.length);
  c.expect(a.map((r) => r.ss)).toStrictEqual(b.map((r) => r.ss));
  for (const k of ['tax', 'income', 'investable']) c.expect(a.map((r) => r[k])).toStrictEqual(b.map((r) => r[k]));
  c.expect(ssAt(a, 66)).toBe(0);
  c.expect(ssAt(a, 67)).toBe(48000);
  c.expect(ssAt(a, 68)).toBe(48000);
  c.expect(ssAt(a, 69)).toBe(37440);
  c.expect(ssAt(a, 74)).toBe(37440);
  c.expect(ssAt(a, 75)).toBe(18720);
  c.expect(ssAt(a, 80)).toBe(18720);
});
