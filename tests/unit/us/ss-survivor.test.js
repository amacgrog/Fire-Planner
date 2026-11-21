// SS claiming optimizer PR 2: the survivor rules in src/us/core/income/social-security.js. A widowed single person's survivor
// benefit (`ssWidowed`, the amount at full retirement age, the optional earlier quote and the widow's limit it reveals, the
// start age, already collecting), paid as the higher of it and their own benefit; and a couple's survivor benefit with survivor
// modeling on and the deceased's amount entered at full retirement age (the deceased's base, the widow's limit, the start in the
// death year or at 60, the marriage gate). Inflation 0 throughout, so a year's benefit is the monthly figure x 12 x the factor;
// the tax year is 2026. The survivor factor is written in units of 1/1000 of 28.5% (f(60) for a survivor FRA of 67 is
// 60060 / 84000); the own-benefit factor in units of 1/3600 as in ss-claim-basis.test.js. Every figure is invented.
import { it, vi, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usCoreFilesContaining } from '../helpers/markup.js';

const NEW_COUNT = 111;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// A widowed single person of 59 in 2026 (born 1967: full retirement age and survivor full retirement age both 67), retired, own
// benefit 2,500 a month at full retirement age claimed at 70 unless a case says otherwise, survivor benefit 2,000 a month at
// full retirement age.
const WIDOWED = {
  singlePerson: true, ageA: 59, retireAgeA: 59, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, ssMonthlyA: 2500, ssStartAgeA: 70, ssBenefitBasisA: 'pia', stateTax: 'tx', acaEnabled: false, healthcare: 0,
  rothConvEnabled: false, ssWidowed: true, ssSurvivorMonthlyFra: 2000, ssSurvivorQuoteMonthly: 0, ssSurvivorQuoteAge: 60,
  ssSurvivorStartAge: null, ssSurvivorCollecting: false,
};
// The identical-partner couple of ss-claim-basis.test.js (62 in 2026, born 1964, both 2,000 a month at full retirement age),
// married, survivor modeling on, Partner A dying at 75 unless a case says otherwise.
const COUPLE = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 60000, taxable: 400000,
  tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 300000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0,
  cash: 30000, inflation: 0, dividendYield: 0, pensionCoverage: 'both', pensionYearlyA: 30000, pensionYearlyB: 30000,
  pensionStartAgeA: 62, pensionStartAgeB: 62, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75, survivorSpendingPct: 70,
  ltcEnabled: false, healthcare: 0, ssMonthlyA: 2000, ssMonthlyB: 2000, ssStartAgeA: 62, ssStartAgeB: 62, ssLateStartEnabled: false,
  ssBenefitBasisA: 'pia', ssBenefitBasisB: 'pia', stateTax: 'tx', acaEnabled: false,
};
const F60 = 60060 / 84000, F62 = 66900 / 84000, F63 = 70320 / 84000, F64 = 73740 / 84000, F65 = 77160 / 84000;
const rowsOf = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return (await engine(w)).simulateRaw().rows;
};
const ssAt = (rows, age) => rows.find((r) => r.age === age).ss;
const ssAtB = (rows, ageB) => rows.find((r) => r.ageB === ageB).ss;
const ssModule = async (patch) => {
  const w = await world();
  await w.setState(patch);
  return { w, m: await w.load('us/core/income/social-security.js'), ctx: await w.ctx() };
};

it('the survivor full retirement age by birth year (20 CFR 404.409(b))', async () => {
  const { m } = await ssModule({});
  const got = [1939, 1940, 1944, 1945, 1956, 1957, 1961, 1962, 1990].map((y) => m.ssSurvivorFraMonths(y));
  c.expect(got).toStrictEqual([780, 782, 790, 792, 792, 794, 802, 804, 804]);
});

it('the survivor factor: 71.5% at 60 rising to 1 at the survivor full retirement age', async () => {
  const { m } = await ssModule({});
  c.expect(m.ssSurvivorFactor(804, 60)).toBe(60060 / 84000);
  c.expect(m.ssSurvivorFactor(804, 60)).toBe(0.715);
  c.expect(m.ssSurvivorFactor(804, 62)).toBe(66900 / 84000);
  c.expect(m.ssSurvivorFactor(804, 67)).toBe(1);
  c.expect(m.ssSurvivorFactor(804, 70)).toBe(1);
  c.expect(m.ssSurvivorFactor(804, 59)).toBe(m.ssSurvivorFactor(804, 60));
  c.expect(m.ssSurvivorFactor(796, 60)).toBe(54340 / 76000);
  c.expect(m.ssSurvivorFactor(796, 60)).toBe(0.715);
  c.expect(m.ssSurvivorFactor(796, 66)).toBe(74860 / 76000);
});

it('the survivor start: null is the survivor full retirement age rounded up', async () => {
  let { m, ctx } = await ssModule(WIDOWED);
  c.expect(m.ssSurvivorStartResolved(ctx)).toBe(67);
  ({ m, ctx } = await ssModule({ ...WIDOWED, ssSurvivorStartAge: 63 }));
  c.expect(m.ssSurvivorStartResolved(ctx)).toBe(63);
  // Born 1958: survivor full retirement age 66 and 4 months, paid unreduced from the year of 67.
  ({ m, ctx } = await ssModule({ ...WIDOWED, ageA: 68, retireAgeA: 68 }));
  c.expect(m.ssSurvivorStartResolved(ctx)).toBe(67);
});

it('the two quotes: agree, a widow\'s limit, or disagree', async () => {
  const read = async (patch) => {
    const { m, ctx } = await ssModule({ ...WIDOWED, ...patch });
    return m.ssSurvivorQuoteRead(ctx);
  };
  c.expect(await read({})).toBe(0);
  c.expect(await read({ ssSurvivorQuoteMonthly: 1430 })).toBe(1);
  c.expect(await read({ ssSurvivorQuoteMonthly: 1429 })).toBe(1);
  c.expect(await read({ ssSurvivorQuoteMonthly: 1425 })).toBe(3);
  c.expect(await read({ ssSurvivorQuoteMonthly: 2100 })).toBe(3);
  c.expect(await read({ ssSurvivorQuoteMonthly: 1600 })).toBe(2);
  c.expect(await read({ ssSurvivorQuoteMonthly: 2000, ssSurvivorQuoteAge: 64 })).toBe(2);
  // SSA rounds both quotes down: a PIA of 2,001.90 is quoted 2,001 and 1,431 at 60, so P is 2,001.40, a little above F.
  c.expect(await read({ ssSurvivorMonthlyFra: 2001, ssSurvivorQuoteMonthly: 1431 })).toBe(1);
});

it('the widowed survivor amount, with and without the widow\'s limit', async () => {
  const yearly = async (patch) => {
    const { m, ctx } = await ssModule({ ...WIDOWED, ...patch });
    return m.widowedSurvivorYearly(ctx);
  };
  c.expect(await yearly({ ssSurvivorStartAge: 60 })).toBe(2000 * 12 * F60);
  c.expect(await yearly({ ssSurvivorStartAge: 60, ssSurvivorQuoteMonthly: 1600 })).toBe(Math.min(((1600 * 12) / F60) * F60, 2000 * 12));
  c.expect(await yearly({ ssSurvivorStartAge: 64, ssSurvivorQuoteMonthly: 1600 })).toBe(Math.min(((1600 * 12) / F60) * F64, 2000 * 12));
  c.expect(await yearly({ ssSurvivorStartAge: 67, ssSurvivorQuoteMonthly: 1600 })).toBe(Math.min(((1600 * 12) / F60) * 1, 2000 * 12));
  c.expect(await yearly({ ssSurvivorStartAge: 67, ssSurvivorQuoteMonthly: 1600 })).toBe(24000);
  // Disagreeing quotes fall back to the amount at full retirement age.
  c.expect(await yearly({ ssSurvivorStartAge: 62, ssSurvivorQuoteMonthly: 1425 })).toBe(2000 * 12 * F62);
});

it('the deceased\'s base: claimed early (the widow\'s limit), at or after full retirement age, or not yet', async () => {
  const at = async (patch, deathYear, x) => {
    const { m, ctx } = await ssModule({ ...COUPLE, ...patch });
    return m.deceasedSurvivorYearly(ctx, true, deathYear, x);
  };
  c.expect(await at({ ssStartAgeA: 62 }, 13, 75)).toBe(Math.min(24000 * 1, Math.max(24000 * 0.825, 24000 * 0.7)));
  c.expect(await at({ ssStartAgeA: 62 }, 13, 75)).toBe(24000 * 0.825);
  c.expect(await at({ ssStartAgeA: 67 }, 13, 75)).toBe(24000 * 1 * 1);
  c.expect(await at({ ssStartAgeA: 70 }, 13, 75)).toBe(24000 * (4464 / 3600) * 1);
  c.expect(await at({ ssStartAgeA: 70 }, 6, 68)).toBe(24000 * Math.max(1, 3888 / 3600) * 1);
  c.expect(await at({ ssStartAgeA: 67 }, 2, 64)).toBe(24000 * Math.max(1, 2880 / 3600) * F64);
  c.expect(await at({ ssStartAgeA: 72, ssLateStartEnabled: true }, 10, 72)).toBe(24000 * Math.max(1, 4464 / 3600) * 1);
  c.expect(await at({ ssStartAgeA: 70 }, 9, 64)).toBe(24000 * (4464 / 3600) * F64);
});

it('atClaim deceased: today\'s swap, to the bit, married or not', async () => {
  for (const filingStatus of ['mfj', 'single']) {
    const { m, ctx } = await ssModule({ ...COUPLE, filingStatus, ssBenefitBasisA: 'atClaim' });
    c.expect(m.survivorBenefitYearly(ctx, true, 13, 75, 75, 1.37, 0.78)).toBe(
      Math.max(m.ownBenefitYearly(ctx, 'A', 75, 1.37, 0.78), m.ownBenefitYearly(ctx, 'B', 75, 1.37, 0.78)),
    );
  }
});

it('paidBenefitYearly is ownBenefitYearly for anyone not widowed', async () => {
  for (const patch of [{ ...WIDOWED, ssWidowed: false }, { ...COUPLE, ssWidowed: true, ssSurvivorMonthlyFra: 2000 }]) {
    const { m, ctx } = await ssModule(patch);
    for (const a of [61, 62, 80]) c.expect(m.paidBenefitYearly(ctx, 'A', a, 1.37, 0.78)).toBe(m.ownBenefitYearly(ctx, 'A', a, 1.37, 0.78));
  }
});

it('the marriage test of the death year', async () => {
  const married = async (patch, y) => {
    const { m, ctx } = await ssModule({ ...COUPLE, ...patch });
    return m.marriedAtYear(ctx, y);
  };
  c.expect(await married({}, 13)).toBe(true);
  c.expect(await married({ filingStatus: 'single' }, 13)).toBe(false);
  c.expect(await married({ marryLater: true, marriageAgeA: 64 }, 1)).toBe(false);
  c.expect(await married({ marryLater: true, marriageAgeA: 64 }, 2)).toBe(true);
  c.expect(await married({ singlePerson: true }, 13)).toBe(false);
});

it('widowed rows: survivor at 60, then own at 70 (Review Focus 2)', async () => {
  const rows = await rowsOf({ ...WIDOWED, ssSurvivorStartAge: 60 });
  c.expect(ssAt(rows, 59)).toBe(0);
  c.expect(ssAt(rows, 60)).toBe(2000 * 12 * F60);
  c.expect(ssAt(rows, 69)).toBe(2000 * 12 * F60);
  c.expect(ssAt(rows, 70)).toBe(30000 * (4464 / 3600));
  c.expect(ssAt(rows, 85)).toBe(30000 * (4464 / 3600));
});

it('widowed rows: own at 62, then survivor at full retirement age', async () => {
  const rows = await rowsOf({ ...WIDOWED, ssStartAgeA: 62 });
  c.expect(ssAt(rows, 62)).toBe(30000 * 0.7);
  c.expect(ssAt(rows, 66)).toBe(30000 * 0.7);
  c.expect(ssAt(rows, 67)).toBe(Math.max(30000 * 0.7, 2000 * 12 * 1));
  c.expect(ssAt(rows, 67)).toBe(24000);
});

it('widowed rows: a survivor benefit that is never higher changes nothing', async () => {
  const a = await rowsOf({ ...WIDOWED, ssStartAgeA: 62, ssSurvivorMonthlyFra: 1000 }),
    b = await rowsOf({ ...WIDOWED, ssStartAgeA: 62, ssSurvivorMonthlyFra: 1000, ssWidowed: false });
  c.expect(a.map((r) => r.ss)).toStrictEqual(b.map((r) => r.ss));
});

it('widowed rows: the widow\'s limit, and disagreeing quotes', async () => {
  const lim = await rowsOf({ ...WIDOWED, ssSurvivorStartAge: 64, ssSurvivorQuoteMonthly: 1600 });
  c.expect(ssAt(lim, 64)).toBe(Math.min(((1600 * 12) / F60) * F64, 2000 * 12));
  const off = await rowsOf({ ...WIDOWED, ssSurvivorStartAge: 64, ssSurvivorQuoteMonthly: 1425 }),
    none = await rowsOf({ ...WIDOWED, ssSurvivorStartAge: 64 });
  c.expect(off).toStrictEqual(none);
  c.expect(ssAt(none, 64)).toBe(2000 * 12 * F64);
});

it('widowed rows: claims now at f = 1 past the survivor full retirement age (Review Focus 1)', async () => {
  const rows = await rowsOf({ ...WIDOWED, ageA: 69, retireAgeA: 69, ssMonthlyA: 0 });
  c.expect(ssAt(rows, 69)).toBe(2000 * 12 * 1);
});

it('widowed rows: collecting, claims now, and a collecting box with a later start (Review Focus 5)', async () => {
  const base = { ...WIDOWED, ageA: 63, retireAgeA: 63 };
  c.expect(ssAt(await rowsOf({ ...base, ssSurvivorStartAge: 60, ssSurvivorCollecting: true }), 63)).toBe(2000 * 12 * F60);
  c.expect(ssAt(await rowsOf({ ...base, ssSurvivorStartAge: 60 }), 63)).toBe(2000 * 12 * F63);
  const later = await rowsOf({ ...base, ssSurvivorStartAge: 65, ssSurvivorCollecting: true });
  c.expect(ssAt(later, 63)).toBe(0);
  c.expect(ssAt(later, 64)).toBe(0);
  c.expect(ssAt(later, 65)).toBe(2000 * 12 * F65);
});

it('widowed rows: the benefit cut applies to the survivor benefit', async () => {
  const rows = await rowsOf({ ...WIDOWED, ssSurvivorStartAge: 60, ssBenefitCutPct: 20, ssBenefitCutStartYear: 2026 });
  c.expect(ssAt(rows, 60)).toBe(2000 * 12 * F60 * 1 * 0.8);
});

it('the widowed keys change nothing for a couple (Review Focus 4)', async () => {
  const on = await rowsOf({ ...COUPLE, ssWidowed: true, ssSurvivorMonthlyFra: 2000, ssSurvivorStartAge: 60 }),
    off = await rowsOf({ ...COUPLE, ssWidowed: false });
  c.expect(on).toStrictEqual(off);
});

it('couple rows: the widow\'s limit, the unmarried couple, and atClaim', async () => {
  c.expect(ssAt(await rowsOf(COUPLE), 80)).toBe(24000 * 0.825);
  c.expect(ssAt(await rowsOf({ ...COUPLE, filingStatus: 'single' }), 80)).toBe(24000 * 0.7);
  c.expect(ssAt(await rowsOf({ ...COUPLE, ssBenefitBasisA: 'atClaim' }), 80)).toBe(Math.max(24000, 24000 * 0.7));
});

it('couple rows: a survivor under 60 at the death waits for 60 (Review Focus 3)', async () => {
  const rows = await rowsOf({
    ...COUPLE, ageB: 52, retireAgeB: 52, ssStartAgeA: 67, ssStartAgeB: 67, survivorDeathAge: 65,
  });
  for (const b of [55, 59]) c.expect(ssAtB(rows, b)).toBe(0);
  c.expect(ssAtB(rows, 60)).toBe(24000 * 1 * F60);
  c.expect(ssAtB(rows, 66)).toBe(24000 * 1 * F60);
  c.expect(ssAtB(rows, 67)).toBe(Math.max(24000, 24000 * 1 * F60));
});

it('the cliff plan reads the widowed benefit (benefitIncomeAt)', async () => {
  const w = await world();
  await w.setState({ ...WIDOWED, ssSurvivorStartAge: 60 });
  const rows = (await engine(w)).simulateRaw().rows;
  const { benefitIncomeAt } = await w.load('us/core/cliff-plan/solver.js');
  const ctx = await w.ctx();
  c.expect(benefitIncomeAt(ctx, 1, true, 1, null)).toBe(ssAt(rows, 60));
  c.expect(benefitIncomeAt(ctx, 11, true, 1, null)).toBe(ssAt(rows, 70));
});

it('the Sankey reads the same benefit', async () => {
  for (const [patch, ages] of [[{ ...WIDOWED, ssSurvivorStartAge: 60 }, [60, 70]], [COUPLE, [80]]]) {
    const w = await world();
    await w.setState(patch);
    const rows = (await engine(w)).simulateRaw().rows;
    const { sankeyColumns } = await w.load('us/core/income/sankey-columns.js');
    const ctx = await w.ctx();
    for (const age of ages) {
      const row = rows.find((r) => r.age === age),
        cols = sankeyColumns(ctx, row),
        group = cols.in.find((g) => g.key === 'retirement'),
        item = (k) => group.items.find((it) => it.key === k)?.value ?? 0;
      c.expect(item('ssA') + item('ssB')).toBe(row.ss);
      c.expect(cols.issues.filter((s) => s.startsWith('retirement'))).toStrictEqual([]);
    }
  }
});

it('one formula: only the inputs modules and social-security.js read the survivor inputs', () => {
  c.expect(usCoreFilesContaining('ssSurvivor').filter((f) => !f.startsWith('inputs/'))).toStrictEqual(['income/social-security.js']);
});

it('the earnings-test warning reads the retirement full retirement age for the survivor start', async () => {
  // Born 1958: retirement FRA 66 and 8 months (800), survivor FRA 66 and 4 months (796).
  const base = { ...WIDOWED, ageA: 68, retireAgeA: 68, incomeA: 50000, ssSurvivorStartAge: 66 };
  let { m, ctx } = await ssModule(base);
  c.expect(m.ssSurvivorBeforeRetirementCase(ctx)).toStrictEqual({ start: 66, retire: 68, fra: 800 / 12 });
  for (const patch of [{ ssWidowed: false }, { ssSurvivorMonthlyFra: 0 }, { incomeA: 0 }]) {
    ({ m, ctx } = await ssModule({ ...base, ...patch }));
    c.expect(m.ssSurvivorBeforeRetirementCase(ctx)).toBe(null);
  }
});

it('normalize: the widowed inputs', async () => {
  const s = await (await world()).setState({
    ssWidowed: 'yes', ssSurvivorCollecting: 1, ssSurvivorStartAge: '64', ssSurvivorQuoteAge: 58, ssSurvivorMonthlyFra: -5, ssSurvivorQuoteMonthly: 'x',
  });
  c.expect([s.ssWidowed, s.ssSurvivorCollecting, s.ssSurvivorStartAge, s.ssSurvivorQuoteAge, s.ssSurvivorMonthlyFra, s.ssSurvivorQuoteMonthly]).toStrictEqual([false, false, 64, 60, 0, 0]);
  const t = await (await world()).setState({ ssWidowed: true, ssSurvivorCollecting: true, ssSurvivorQuoteAge: 70 });
  c.expect([t.ssWidowed, t.ssSurvivorCollecting, t.ssSurvivorQuoteAge, t.ssSurvivorStartAge]).toStrictEqual([true, true, 67, null]);
  for (const v of [59, 71, 'x', 62.5]) c.expect((await (await world()).setState({ ssSurvivorStartAge: v })).ssSurvivorStartAge).toBe(null);
  c.expect((await (await world()).setState({ ssSurvivorStartAge: 70 })).ssSurvivorStartAge).toBe(70);
  const d = await (await world()).setState({});
  c.expect([d.ssWidowed, d.ssSurvivorMonthlyFra, d.ssSurvivorQuoteMonthly, d.ssSurvivorQuoteAge, d.ssSurvivorStartAge, d.ssSurvivorCollecting]).toStrictEqual([false, 0, 0, 60, null, false]);
});

it('the estimate badge counts the survivor benefit only for a widowed single person', async () => {
  const w = await world();
  const { ESTIMATE_GATED_GROUPS } = await w.load('us/core/inputs/field-meta.js');
  const group = ESTIMATE_GATED_GROUPS.find((g) => g.ids.includes('ssSurvivorMonthlyFra'));
  c.expect([
    group.gate({ singlePerson: true, ssWidowed: true }), group.gate({ singlePerson: true, ssWidowed: false }), group.gate({ singlePerson: false, ssWidowed: true }),
  ]).toStrictEqual([true, false, false]);
});

// The seed and the stored-plan fingerprint of ss-claim-basis.test.js's single retiree, recorded on main before SS PR 1
// (2026-11-21, at e9914619): the widowed keys at their defaults, or for a couple, must leave both as they were.
const RETIREE = {
  singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, ssMonthlyA: 2000, ssStartAgeA: 65, stateTax: 'tx', acaEnabled: false, healthcare: 0, rothConvEnabled: false,
};
it('the Monte Carlo seed and the stored-plan fingerprint do not move for the widowed keys at their defaults', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const s = await w.setState(RETIREE);
  const widowed = { ssWidowed: true, ssSurvivorMonthlyFra: 2000, ssSurvivorQuoteMonthly: 1500, ssSurvivorQuoteAge: 62, ssSurvivorStartAge: 60, ssSurvivorCollecting: true };
  c.expect(monteCarloSeed(2026, 500, s)).toBe(2315242127);
  c.expect(monteCarloSeed(2026, 500, { ...s, ...widowed })).toBe(2315242127);
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint: fp } = await w.load('us/ui/results/plan-optimizer.js');
    c.expect(fp(s)).toBe('47067756');
    c.expect(fp({ ...s, ssWidowed: false, ssSurvivorMonthlyFra: 2000, ssSurvivorStartAge: 60 })).toBe('47067756');
    const couple = { ...s, singlePerson: false, ageB: 65, retireAgeB: 65, lifeExpectancyB: 90 };
    c.expect(fp({ ...couple, ssWidowed: true, ssSurvivorMonthlyFra: 2000 })).toBe(fp(couple));
    c.expect(fp({ ...s, ssWidowed: true }) === '47067756').toBe(false);
    c.expect(fp({ ...s, ssWidowed: true, ssSurvivorStartAge: 60 }) === fp({ ...s, ssWidowed: true })).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('couple rows: a survivor older than the deceased, who had claimed early (Opus review 6)', async () => {
  // A is 72 (born 1954: FRA 66, survivor FRA 66), own 1,000 a month claimed now at the factor of 70 (48 months late, 1152
  // units); B is 66 (born 1960: FRA 67), collecting since 66 (12 months early, 240 units), and dies at 68, A then 74 (fx 1).
  const rows = await rowsOf({
    ...COUPLE, ageA: 72, ageB: 66, retireAgeA: 72, retireAgeB: 66, ssMonthlyA: 1000, ssStartAgeA: 70, ssStartAgeB: 66, ssCollectingB: true,
    survivorPartner: 'B', survivorDeathAge: 68,
  });
  c.expect(ssAt(rows, 74)).toBe(Math.max(12000 * (4752 / 3600), Math.min(24000 * 1, Math.max(24000 * 0.825, 24000 * (3360 / 3600)))));
  c.expect(ssAt(rows, 74)).toBe(24000 * (3360 / 3600));
});

it('couple rows: a death in year 0 of a deceased already collecting (Opus review 6)', async () => {
  // A is 71 (born 1955: FRA 66 and 2 months, 794), collecting since 70 (46 months late, 1104 units), dies at 71; B is 66 (born
  // 1960: survivor FRA 66 and 8 months, 800; f(66) = (80000 - 285 * 8) / 80000), own claimed now at 66 (3360 / 3600).
  const rows = await rowsOf({
    ...COUPLE, ageA: 71, ageB: 66, retireAgeA: 71, retireAgeB: 66, ssStartAgeA: 70, ssCollectingA: true, survivorDeathAge: 71,
  });
  c.expect(ssAt(rows, 71)).toBe(Math.max(24000 * (3360 / 3600), 24000 * (4704 / 3600) * (77720 / 80000)));
});

it('couple rows: the survivor in atClaim, and a death before a later wedding (Opus review 6)', async () => {
  // A claims at 67 and dies at 75 (base 24000, fx 1); B's amount is entered as paid from 62.
  c.expect(ssAt(await rowsOf({ ...COUPLE, ssStartAgeA: 67, ssBenefitBasisB: 'atClaim', ssMonthlyB: 1500 }), 80)).toBe(Math.max(18000, 24000 * 1 * 1));
  // Start single, marry at A's 80: a death at 75 is before the wedding, so B keeps their own benefit only.
  c.expect(ssAt(await rowsOf({ ...COUPLE, marryLater: true, marriageAgeA: 80 }), 80)).toBe(24000 * 0.7);
});

