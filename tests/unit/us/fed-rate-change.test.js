// Feedback C2: the federal income-tax rate what-if (fedRateScale / fedGainRateScale in src/us/core/tax/federal-rules.js, applied
// in ordinaryTax and longTermGainTax; the input rules in src/us/core/inputs/fed-rate-change.js). Every bracket rate is scaled from
// the start year on, the thresholds never move. Tax year 2026, inflation 0 (the index factor is exactly 1), Texas (no state tax).
// Tax figures are hand-computed from Rev. Proc. 2025-32's 2026 tables (MFJ brackets 24,800 / 100,800 / 211,400 / ...; standard
// deduction 32,200; MFJ gain bands 98,900 / 613,700) and compared to the half cent, written out, as tax-brackets.test.js does.
import { it, vi, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usShellText } from '../helpers/markup.js';

const NEW_COUNT = 49;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const near = (actual, expected, label) => {
  c.tick();
  expect.soft(Math.abs(actual - expected) <= 0.005, `${label}: expected ${expected}, got ${actual}`).toBe(true);
};
const BASE = { inflation: 0, stateTax: 'tx' };
// A taxFor profile as tax-brackets.test.js builds them: a married couple, both 60, 150,000 of pension income on A's slot.
const prof = (o) => Object.assign({ wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 60, ageB: 60 }, o);
const COUPLE = (year) => prof({ filing: 'mfj', otherA: 150000, pensionA: 150000, year });

async function taxWorld(patch) {
  const w = await world();
  await w.setState({ ...BASE, ...patch });
  const fed = await w.load('us/core/tax/federal-tax.js');
  const ctx = await w.ctx();
  return { w, fed, ctx };
}

// Taxable ordinary income 117,800 (150,000 less 32,200). 2026 law: 2,480 (10% of 24,800) + 9,120 (12% of 76,000) + 3,740 (22% of
// 17,000) = 15,340. The 90,000 of gains sit over the 98,900 band, all at 15%: 13,500. NIIT: MAGI 240,000 is under 250,000, so 0.
// At +20%: 2,976 (12%) + 10,944 (14.4%) + 4,488 (26.4%) = 18,408, and the gains at 18%: 16,200.
it('one household at 2026 law and at +20% from 2026, with and without the gain rates', async () => {
  const law = await taxWorld({});
  near(law.fed.ordinaryTax(law.ctx, 150000, 0, 'mfj'), 15340, 'ordinary, 2026 law');
  near(law.fed.longTermGainTax(law.ctx, 90000, 150000, 0, 'mfj'), 13500, 'gains, 2026 law');
  near(law.fed.taxFor(law.ctx, COUPLE(0), 90000, 0), 28840, 'taxFor, 2026 law');
  const up = await taxWorld({ fedRateChangePct: 20, fedRateChangeYear: 2026 });
  near(up.fed.ordinaryTax(up.ctx, 150000, 0, 'mfj'), 18408, 'ordinary, +20%');
  near(up.fed.longTermGainTax(up.ctx, 90000, 150000, 0, 'mfj'), 16200, 'gains, +20%');
  near(up.fed.taxFor(up.ctx, COUPLE(0), 90000, 0), 34608, 'taxFor, +20% with gains');
  const noGains = await taxWorld({ fedRateChangePct: 20, fedRateChangeYear: 2026, fedRateChangeGains: false });
  near(noGains.fed.longTermGainTax(noGains.ctx, 90000, 150000, 0, 'mfj'), 13500, 'gains, box clear');
  near(noGains.fed.taxFor(noGains.ctx, COUPLE(0), 90000, 0), 31908, 'taxFor, +20% without gains');
  // A cut: -20% is 0.8 of each rate: 15,340 x 0.8 = 12,272.
  const down = await taxWorld({ fedRateChangePct: -20, fedRateChangeYear: 2026 });
  near(down.fed.ordinaryTax(down.ctx, 150000, 0, 'mfj'), 12272, 'ordinary, -20%');
});

it('the change starts in its year and not before', async () => {
  const { fed, ctx } = await taxWorld({ fedRateChangePct: 20, fedRateChangeYear: 2030 });
  for (const y of [0, 1, 2, 3]) near(fed.taxFor(ctx, COUPLE(y), 90000, 0), 28840, `year ${y} (${2026 + y}), before the change`);
  near(fed.taxFor(ctx, COUPLE(4), 90000, 0), 34608, 'year 4 (2030)');
  near(fed.taxFor(ctx, COUPLE(20), 90000, 0), 34608, 'year 20 (2046)');
  const early = await taxWorld({ fedRateChangePct: 20, fedRateChangeYear: 2020 });
  near(early.fed.taxFor(early.ctx, COUPLE(0), 90000, 0), 34608, 'a start year before the tax year: from year 0');
});

it('the top rate at the cap (+50) is 55.5%', async () => {
  const { fed, ctx } = await taxWorld({ fedRateChangePct: 50, fedRateChangeYear: 2026 });
  // 1,000 over the top MFJ threshold (768,700 of taxable income) at 37% x 1.5 = 55.5%: 555 more.
  near(fed.ordinaryTax(ctx, 768700 + 32200 + 1000, 0, 'mfj') - fed.ordinaryTax(ctx, 768700 + 32200, 0, 'mfj'), 555, 'top slice at +50');
});

it('the input rules: the clamps, the year and the gains box', async () => {
  const w = await world();
  const k = await w.load('us/core/inputs/fed-rate-change.js');
  const clamp = (v) => {
    const s = { fedRateChangePct: v };
    k.clampFedRateChangePct(s);
    return s.fedRateChangePct;
  };
  c.expect([clamp(150), clamp(-80), clamp('abc'), clamp(20), clamp(-20), clamp(50), clamp(-50)]).toStrictEqual([50, -50, 0, 20, -20, 50, -50]);
  c.expect([k.fedRateYear(2031.4, 2030), k.fedRateYear(1990, 2030), k.fedRateYear('', 2030), k.fedRateYear('x', 2030), k.fedRateYear(2300, 2030)]).toStrictEqual([2032, 2000, 2030, 2030, 2200]);
  const s = await w.setState({ fedRateChangePct: 150, fedRateChangeYear: 2031.4 });
  c.expect([s.fedRateChangePct, s.fedRateChangeYear, s.fedRateChangeGains]).toStrictEqual([50, 2032, true]);
  c.expect((await w.setState({ fedRateChangeGains: false })).fedRateChangeGains).toBe(false);
  c.expect((await w.setState({ fedRateChangeGains: 'no' })).fedRateChangeGains).toBe(true);
});

it('the preset and the bubble', async () => {
  const w = await world();
  const k = await w.load('us/core/inputs/fed-rate-change.js');
  c.expect([k.FED_RATE_PRESET_PCT, k.FED_RATE_PRESET_YEAR, k.FED_RATE_PCT_MIN, k.FED_RATE_PCT_MAX]).toStrictEqual([20, 2030, -50, 50]);
  const html = usShellText();
  const tip = /<label for="fedRateChangePct">[\s\S]*?data-tip="([^"]*)"/.exec(html)[1];
  c.expect(tip.includes('not a forecast')).toBe(true);
  c.expect(tip.includes('26.4%')).toBe(true);
  c.expect(tip.includes('named by today&#x27;s rate')).toBe(true);
  c.expect(tip.includes('-50% to +50%')).toBe(true);
  c.expect(/id="fedRateChangeBtn">Rates rise (\d+)% from (\d+)</.exec(html).slice(1)).toStrictEqual([String(k.FED_RATE_PRESET_PCT), String(k.FED_RATE_PRESET_YEAR)]);
});

// The default household with conversions on, so the conversion solver runs every window year.
it('0% changes nothing: the rows equal a run whose inputs lack the keys, and any year or box at 0 is the default', async () => {
  const w = await world();
  await w.setState({ rothConvEnabled: true });
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const ctx = await w.ctx();
  const { fedRateChangePct, fedRateChangeYear, fedRateChangeGains, ...rest } = ctx.inputs;
  c.expect(fedRateChangePct).toBe(0);
  const withKeys = simulateWith(ctx).rows;
  const without = simulateWith(newRunContext({ ...ctx, inputs: rest })).rows;
  c.expect(withKeys).toStrictEqual(without);
  // The cached store run with the cliff plan planned (ensureTestPlan), at the default and at 0 with another year and the box clear.
  const w2 = await world();
  await w2.setState({ rothConvEnabled: true });
  const def = (await engine(w2)).simulate().rows;
  const w3 = await world();
  await w3.setState({ rothConvEnabled: true, fedRateChangePct: 0, fedRateChangeYear: 2026, fedRateChangeGains: false });
  c.expect((await engine(w3)).simulate().rows).toStrictEqual(def);
});

// A retired couple at 62, no Social Security yet, spending paid from cash and a taxable account (no traditional draw grows to pay a
// higher tax), the ladder on to the top of the 22% bracket, the cliff plan and the ACA off.
const LADDER = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 50000, taxable: 1500000, cash: 200000,
  tradIraA: 600000, tradIraB: 600000, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  inflation: 0, dividendYield: 0, ssMonthlyA: 0, ssMonthlyB: 0, pensionCoverage: 'none', stateTax: 'tx', acaEnabled: false,
  healthcare: 0, ltcEnabled: false, survivorEnabled: false, cliffGuardEnabled: false,
  rothConvEnabled: true, rothConvBracket: 22, rothConvStartAge: 62, rothConvEndAge: 72,
};
it('the thresholds do not move: the bracket ceiling and a year-0 bracket fill are the same, the tax on it is higher', async () => {
  const rowsOf = async (patch) => {
    const w = await world();
    await w.setState({ ...LADDER, ...patch });
    return (await engine(w)).simulateRaw().rows;
  };
  const off = await rowsOf({});
  const on = await rowsOf({ fedRateChangePct: 20, fedRateChangeYear: 2026 });
  c.expect(off[0].conversionAmount > 100000).toBe(true);
  c.expect(on[0].conversionAmount).toBe(off[0].conversionAmount);
  c.expect(on[0].tax > off[0].tax).toBe(true);
  const w = await world();
  await w.setState({ ...LADDER, fedRateChangePct: 20, fedRateChangeYear: 2026 });
  const { bracketCeilingReal } = await w.load('us/core/tax/federal-rules.js');
  c.expect([bracketCeilingReal(22, 'mfj'), bracketCeilingReal(12, 'single'), bracketCeilingReal(24, 'hoh')]).toStrictEqual([211400, 50400, 201750]);
});

// The same couple with a 40,000 pension each from 62 (ordinary income over the deduction every year) and no conversions.
it('a rise from 2030 leaves the earlier rows alone and raises the tax from 2030 (conversions and the cliff plan off)', async () => {
  const rowsOf = async (patch) => {
    const w = await world();
    await w.setState({ ...LADDER, rothConvEnabled: false, pensionCoverage: 'both', pensionYearlyA: 40000, pensionYearlyB: 40000, pensionStartAgeA: 62, pensionStartAgeB: 62, ...patch });
    return (await engine(w)).simulateRaw().rows;
  };
  const off = await rowsOf({});
  const on = await rowsOf({ fedRateChangePct: 20, fedRateChangeYear: 2030 });
  c.expect(on.slice(0, 4)).toStrictEqual(off.slice(0, 4));
  c.expect(on[4].tax > off[4].tax).toBe(true);
});

// A single person at 60 with 1,000,000 of traditional money: lambda's samples are the first RMD year (73, 2039), a midpoint and the
// last year, all after 2030. From year 0 (2026), before the change, lambda must see the rise; with the change in 2200 (past every
// sample) it is the very double of no change.
const LAMBDA = {
  singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 0, cash: 0,
  tradIraA: 1000000, inflation: 0, ssMonthlyA: 2000, ssStartAgeA: 67, stateTax: 'tx', acaEnabled: false, healthcare: 0,
};
it('lambda prices each sample at its own year\'s rates', async () => {
  const lam = async (patch) => {
    const w = await world();
    await w.setState({ ...LAMBDA, ...patch });
    const { lambdaEstimate } = await w.load('us/core/cliff-plan/solver.js');
    const ctx = await w.ctx();
    return lambdaEstimate({ tradPool: 1000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, ctx });
  };
  const off = await lam({});
  const on = await lam({ fedRateChangePct: 20, fedRateChangeYear: 2030 });
  const late = await lam({ fedRateChangePct: 20, fedRateChangeYear: 2200 });
  c.expect(off.lambda > 0).toBe(true);
  c.expect(on.lambda > off.lambda).toBe(true);
  c.expect(late.lambda).toBe(off.lambda);
  c.expect(late.tauGain).toBe(off.tauGain);
});

it('the heirs\' tax on the traditional balance is priced at the scaled rates', async () => {
  const w = await world();
  await w.setState(LAMBDA);
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { endTaxUS } = await w.load('us/core/cliff-plan/solver.js');
  const ctx = await w.ctx();
  const sim = simulateWith(ctx);
  const up = newRunContext({ ...ctx, inputs: { ...ctx.inputs, fedRateChangePct: 20, fedRateChangeYear: 2030 } });
  c.expect(endTaxUS(ctx, sim) > 0).toBe(true);
  c.expect(endTaxUS(up, sim) > endTaxUS(ctx, sim)).toBe(true);
});

it('the change moves neither the Monte Carlo seed nor, while it is 0, a stored plan fingerprint', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const s = await w.setState({});
  const { fedRateChangePct, fedRateChangeYear, fedRateChangeGains, ...without } = s;
  c.expect(monteCarloSeed(2026, 500, s)).toBe(monteCarloSeed(2026, 500, without));
  c.expect(monteCarloSeed(2026, 500, { ...s, fedRateChangePct: 20, fedRateChangeGains: false })).toBe(monteCarloSeed(2026, 500, s));
  // plan-optimizer.js sits in the UI tree: its imports look elements up at load, so give them an empty document.
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint } = await w.load('us/ui/results/plan-optimizer.js');
    const f = storedPlanFingerprint(s);
    c.expect(storedPlanFingerprint(without)).toBe(f);
    c.expect(storedPlanFingerprint({ ...s, fedRateChangeYear: 2040, fedRateChangeGains: false })).toBe(f);
    c.expect(storedPlanFingerprint({ ...s, fedRateChangePct: 20 }) === f).toBe(false);
    c.expect(storedPlanFingerprint({ ...s, fedRateChangePct: 20, fedRateChangeGains: false }) === storedPlanFingerprint({ ...s, fedRateChangePct: 20 })).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
