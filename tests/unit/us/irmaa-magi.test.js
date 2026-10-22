// IRMAA MAGI: Medicare's MAGI is AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), so only the TAXABLE part of
// Social Security counts; the ACA's MAGI (26 U.S.C. 36B(d)(2)(B)) counts all of it. The engine's MAGI is the ACA one;
// irmaaMagiOf converts, magiForIrmaaLine inverts. Spec: docs/superpowers/specs/2026-10-07-irmaa-magi-design.md.
// Converted from tests/irmaa_magi.js (Playwright); the old script executed 70 assert checks (the page-error check
// excluded), this file asserts the same 70. NEW_COUNT follows the row counts of the year-by-year comparisons
// (sameHealthcare checks one year per row), so it moves only if a scenario's life span does. Each it block gets its own
// world, the 2026 tax year and the default state; a run applies its patch to the state and restores it afterwards, as the
// old page did. The plan-mode hooks come from tests/unit/helpers/us-plan.js.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usPlan } from '../helpers/us-plan.js';

const NEW_COUNT = 70;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// Every failing check is reported (expect.soft) and each evaluation counts once.
const check = (ok, msg) => {
  c.tick();
  expect.soft(ok, msg).toBe(true);
};
const same = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toBe(b);
};
const sameDeep = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toStrictEqual(b);
};
const near = (a, b, tol, msg) => check(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// The engine cases run simulate() under a state patch (over a quiet base: Texas, no inflation, no investment income, no
// investments unless the case sets them) and restore the state afterwards.
const QUIET = {
  stateTax: 'tx', acaEnabled: false, inflation: 0, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0,
  bondYears: 0, taxable: 0, cash: 0, cashReserve: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0,
  roth401kA: 0, roth401kB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeA: 0, incomeB: 0, spending: 20000,
  medicareYearly: 10000, ltcEnabled: false, guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false,
  children: [], loans: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
  pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0,
};

async function setup() {
  const w = await world();
  const st = await w.setState();
  w.setTaxYear(2026);
  const e = await engine(w);
  const irmaa = await w.load('us/core/healthcare/irmaa.js');
  const sst = await w.load('us/core/tax/social-security-tax.js');
  const solver = await w.load('us/core/cliff-plan/solver.js');
  const plan = await usPlan(w);
  const sim = (patch) => {
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, { ...QUIET, ...patch });
    try {
      return JSON.parse(JSON.stringify(e.simulate().rows));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  };
  return { w, st, e, irmaa, sst, solver, plan, sim };
}

const SURCHARGE1 = 95.7 * 12;
const drawn = (r) => r.traditionalWithdrawn + r.taxableWithdrawn + r.rothWithdrawn;
const sameHealthcare = (a, b, from, msg) => {
  check(a.length > from && a.length === b.length, `${msg}: row counts ${a.length} / ${b.length}`);
  for (let i = from; i < a.length; i++) near(a[i].healthcare, b[i].healthcare, 1e-6, `${msg}, year ${i}`);
};

it('hand-computed irmaaMagiOf (SS bases: single 25,000 / 34,000 / 4,500; joint 32,000 / 44,000 / 6,000)', async () => {
  const { irmaa, sst } = await setup();
  const r = {
    // Single, benefit 30,000, no other income: provisional 15,000 <= 25,000, nothing taxable. MAGI 30,000 -> 0.
    lowSingle: irmaa.irmaaMagiOf(30000, 30000, 'single'),
    // Single, benefit 20,000, other 20,000: provisional 30,000; 50% band: min(10,000, 2,500) = 2,500 -> 22,500.
    band50: irmaa.irmaaMagiOf(40000, 20000, 'single'),
    // Single, benefit 40,000, pension 72,000 (MAGI 112,000): provisional 92,000; 85% band hits the cap 34,000 -> 106,000.
    capSingle: irmaa.irmaaMagiOf(112000, 40000, 'single'),
    // Joint, benefit 70,000, other 200,000 (MAGI 270,000): cap 59,500 -> 259,500.
    capJoint: irmaa.irmaaMagiOf(270000, 70000, 'mfj'),
    // Joint, benefit 30,000, other 40,000: provisional 55,000 > 44,000: 0.85 x 11,000 + min(6,000, 15,000) = 15,350
    // (under the cap 25,500) -> 55,350.
    band85: irmaa.irmaaMagiOf(70000, 30000, 'mfj'),
    // Head of household and qualifying surviving spouse read the single bases (FILING 'ss' family): as single.
    hoh: irmaa.irmaaMagiOf(40000, 20000, 'hoh'),
    qss: irmaa.irmaaMagiOf(40000, 20000, 'qss'),
    noBenefit: irmaa.irmaaMagiOf(123456.78, 0, 'mfj'),
    statusKid: sst.returnStatusA([{ age: 10, qualifyingChild: true }]),
    statusNone: sst.returnStatusA(undefined),
    ssJoint: sst.irmaaSsOf({ singlePerson: false, ssA: 1, ssB: 2 }),
    ssOne: sst.irmaaSsOf({ singlePerson: true, ssA: 5, ssB: 7 }),
  };
  same(r.lowSingle, 0, 'nothing taxable below the base');
  near(r.band50, 22500, 1e-9, '50% band');
  near(r.capSingle, 106000, 1e-9, '85% cap, single');
  near(r.capJoint, 259500, 1e-9, '85% cap, joint');
  near(r.band85, 55350, 1e-9, '85% band under the cap');
  near(r.hoh, 22500, 1e-9, 'hoh reads the single SS bases');
  near(r.qss, 22500, 1e-9, 'qss reads the single SS bases');
  same(r.noBenefit, 123456.78, 'no benefit: the MAGI itself, bit for bit');
  same(r.statusKid, 'hoh', 'statusKid');
  same(r.statusNone, 'single', 'statusNone');
  same(r.ssJoint, 3, 'ssJoint');
  same(r.ssOne, 5, 'ssOne');
});

it('the inverse: round trip and monotonicity over a grid (the exclusive top bound)', async () => {
  const { irmaa } = await setup();
  const bad = [];
  for (const filing of ['mfj', 'single', 'hoh', 'qss'])
    for (const ss of [0, 5000, 18000, 40000, 90000]) {
      let prev = -Infinity;
      const lines = [];
      for (let L = 0; L <= 800000; L += 7919) lines.push(L);
      lines.push(109000, 218000, 499999.99, 749999.99);
      lines.sort((a, b) => a - b);
      for (const L of lines) {
        const m = irmaa.magiForIrmaaLine(L, ss, filing);
        if (Math.abs(irmaa.irmaaMagiOf(m, ss, filing) - L) > 1e-6) bad.push({ filing, ss, L, m, back: irmaa.irmaaMagiOf(m, ss, filing) });
        if (m < prev) bad.push({ filing, ss, L, m, prev, why: 'not monotone' });
        if (m < L - 1e-9 || m > L + ss + 1e-9) bad.push({ filing, ss, L, m, why: 'outside [L, L + ss]' });
        prev = m;
      }
    }
  sameDeep(bad.slice(0, 5), [], 'round trip / monotone / bounds');
  same(irmaa.magiForIrmaaLine(Infinity, 40000, 'mfj'), Infinity, 'Infinity passes through');
  same(irmaa.magiForIrmaaLine(150000, 0, 'single'), 150000, 'no benefit: the line itself');
});

const single70 = { singlePerson: true, ageA: 70, retireAgeA: 65, lifeExpectancyA: 75, pensionCoverage: 'a', pensionYearlyA: 72000, pensionStartAgeA: 65, ssStartAgeA: 67 };

it('(a) the charge and (e) the stand-in', async () => {
  const { sim } = await setup();
  // (a) Single, 70, retired; pension 72,000 and Social Security 40,000 (3,333.34 a month: 40,000.08).
  // Engine (ACA) MAGI 112,000.08; IRMAA MAGI = 72,000 + min(0.85 x 40,000.08, 0.85 x (92,000.04 - 34,000) + 4,500) =
  // 72,000 + 34,000.07 = 106,000.07 <= 109,000: no surcharge in any year (the stand-in for years 0 and 1 is year 0's
  // IRMAA MAGI). Compared with the same household on 1,000 a month (MAGI 84,000, far under the tier).
  const aHigh = sim({ ...single70, ssMonthlyA: 3333.34 }),
    aLow = sim({ ...single70, ssMonthlyA: 1000 });
  near(aHigh[0].magiProxy, 112000.08, 1e-6, '(a) the engine MAGI stays the ACA one');
  same(aHigh.some((r) => drawn(r) > 0), false, '(a) no withdrawals');
  near(aHigh[0].healthcare, 10000, 1e-6, '(a) year 0: Medicare only, no surcharge');
  sameHealthcare(aHigh, aLow, 0, '(a) no surcharge on IRMAA MAGI 106,000');

  // (e) The stand-in (Review Focus 3): with the user's own entries, year 0 reads 115,000 (> 109,000: first tier) and
  // year 1 reads 100,000 (none); from year 2 the projection's own IRMAA MAGI (106,000.07: none).
  const eKnown = sim({ ...single70, ssMonthlyA: 3333.34, irmaaPriorKnown: true, irmaaMagiPrior2: 115000, irmaaMagiPrior1: 100000 });
  near(eKnown[0].healthcare, aLow[0].healthcare + SURCHARGE1, 1e-6, '(e) year 0 pays the entered tier');
  near(eKnown[1].healthcare, aLow[1].healthcare, 1e-6, '(e) year 1 pays none');
  sameHealthcare(eKnown, aLow, 1, '(e) from year 1');
});

it('(b) two returns, A head of household', async () => {
  const { sim } = await setup();
  // An unmarried couple, both 70, a child aged 15 at the start (a qualifying child through the plan's last year, 73). Each:
  // pension 72,000 + Social Security 40,000.08. A's return is hoh, which reads the single Social Security bases, so both
  // IRMAA MAGIs are 106,000.07, under the single first tier.
  const couple70 = {
    singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 70, ageB: 70, retireAgeA: 65, retireAgeB: 65,
    lifeExpectancyA: 73, lifeExpectancyB: 73, pensionCoverage: 'both', pensionYearlyA: 72000, pensionYearlyB: 72000,
    pensionStartAgeA: 65, pensionStartAgeB: 65, ssStartAgeA: 67, ssStartAgeB: 67, children: [{ birthYear: 2011, student: false }],
  };
  const bHigh = sim({ ...couple70, ssMonthlyA: 3333.34, ssMonthlyB: 3333.34 }),
    bLow = sim({ ...couple70, ssMonthlyA: 1000, ssMonthlyB: 1000 });
  near(bHigh[0].magiA, 112000.08, 1e-6, '(b) A keeps the ACA per-return MAGI');
  near(bHigh[0].healthcare, 10000, 1e-6, '(b) year 0: Medicare only (the household figure, half each), no surcharge');
  sameHealthcare(bHigh, bLow, 0, '(b) neither partner pays a surcharge');
});

it('(d) survivor', async () => {
  const { sim } = await setup();
  // A married couple, both 68, retired; A dies at 71 (year 3: joint that year, single after). B's pension 72,000; both
  // benefits 40,000.08, the survivor keeps 40,000.08. Year 3 (joint, MAGI 112,000.08): IRMAA MAGI 72,000 + min(34,000.07,
  // 0.85 x (92,000.04 - 44,000) + 6,000 = 46,833.73) = 106,000.07; years 4 on (single): the same 106,000.07. Both under
  // 109,000, so from year 5 (lookback year 3) on the survivor pays no surcharge, as with 1,000 a month.
  const survivor = {
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 68, ageB: 68, retireAgeA: 65, retireAgeB: 65,
    lifeExpectancyA: 80, lifeExpectancyB: 80, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 71, survivorSpendingPct: 75,
    pensionCoverage: 'b', pensionYearlyB: 72000, pensionStartAgeB: 65, ssStartAgeA: 67, ssStartAgeB: 67,
  };
  const dHigh = sim({ ...survivor, ssMonthlyA: 3333.34, ssMonthlyB: 3333.34 }),
    dLow = sim({ ...survivor, ssMonthlyA: 1000, ssMonthlyB: 1000 });
  near(dHigh[4].magiProxy, 112000.08, 1e-6, '(d) the survivor year keeps the ACA MAGI');
  near(dHigh[6].healthcare, 5000, 1e-6, '(d) survivor: half the Medicare figure, no surcharge');
  sameHealthcare(dHigh, dLow, 5, '(d) the survivor pays no surcharge');
});

it('(c) lines: the irmaa1 line is the translated edge', async () => {
  const { w, st, irmaa, solver } = await setup();
  // A single 66-year-old with a 40,000 benefit. The first tier, 109,000 of IRMAA MAGI, is at x + 34,000 = 109,000 (the 85%
  // cap binds: provisional 95,000), x = 75,000: engine MAGI 115,000. Ids and families unchanged.
  const saved = JSON.parse(JSON.stringify(st));
  Object.assign(st, { inflation: 0, children: [], acaEnhanced: false, acaEnabled: false });
  const ctx = (ssA) => ({
    year: 0, filing: 'single', twoReturns: false, profile: { ownerShareA: 1, singlePerson: true, ssA, dependents: [] }, preMagi: 0, preMagiA: 0,
    preMagiB: 0, acaEligibleA: false, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
    workingA: false, workingB: false, age: 66, ageB: null, irmaa: { filing: 'single', a: true, b: false }, irmaaGrowth: 1,
  });
  let lines;
  try {
    // The run context, built after the state patch (the state object is patched in place).
    const runCtx = await w.ctx();
    lines = {
      withSs: solver.magiThresholds(runCtx, ctx(40000)).find((l) => l.id === 'irmaa1'),
      noSs: solver.magiThresholds(runCtx, ctx(0)).find((l) => l.id === 'irmaa1'),
      inverse: irmaa.magiForIrmaaLine(109000, 40000, 'single'),
    };
  } finally {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, saved);
  }
  near(lines.inverse, 115000, 1e-6, '(c) the inverse by hand');
  near(lines.withSs.magi, lines.inverse, 1e-9, '(c) the irmaa1 line is the translated edge');
  sameDeep([lines.withSs.id, lines.withSs.family, lines.withSs.ret], ['irmaa1', 'irmaa', 'H'], '(c) id, family, ret unchanged');
  same(lines.noSs.magi, 109000, '(c) no benefit: the edge itself');
});

it('(f) conversion ceiling and (g) no benefit, no change', async () => {
  const { irmaa, sim } = await setup();
  // (f) Single, 66, retired; traditional 1,000,000, pension 50,000, Social Security 40,000.08, converting to the top of
  // the 32% bracket (so the IRMAA cap binds). At the cap, IRMAA MAGI = 50,000 + C + 34,000.07 = 109,000: C = 24,999.93
  // (engine MAGI 115,000.01). Before the fix the engine MAGI stopped at 109,000 (C = 18,999.92).
  const conv = { singlePerson: true, ageA: 66, retireAgeA: 60, lifeExpectancyA: 71, tradIraA: 1000000, pensionCoverage: 'a', pensionYearlyA: 50000, pensionStartAgeA: 60, ssStartAgeA: 62, rothConvEnabled: true, rothConvStartAge: 66, rothConvEndAge: 70, rothConvBracket: 32, spending: 60000 };
  const fRows = sim({ ...conv, ssMonthlyA: 3333.34 });
  const fIrmaa = irmaa.irmaaMagiOf(fRows[0].magiProxy, 40000.08, 'single');
  same(drawn(fRows[0]) > 0, false, '(f) no withdrawal in year 0');
  check(fIrmaa <= 109000 + 1e-6 && fIrmaa >= 109000 - 1, `(f) IRMAA MAGI at the first tier: ${fIrmaa}`);
  near(fRows[0].conversionAmount, 24999.93, 1, '(f) the conversion rises by the untaxed benefit');

  // (g) No benefit, no change: the same plan with no Social Security converts to an engine MAGI of 109,000 (C = 59,000).
  // Spending 20,000 here: at 60,000 the pension alone no longer covers the year, the draw enters the MAGI iteration and the
  // year ends within its tolerance of the edge (108,980.49, the same at CLIFF_TIP), not on it.
  const gRows = sim({ ...conv, ssMonthlyA: 0, spending: 20000 });
  same(drawn(gRows[0]), 0, '(g) no withdrawal in year 0');
  near(gRows[0].magiProxy, 109000, 1e-6, '(g) no benefit: the tier edge itself');
  near(gRows[0].conversionAmount, 59000, 1e-6, '(g) the conversion fills to the edge');
});

// --- Review follow-ups M1 / M13: lambdaEstimate prices its IRMAA step on Medicare's MAGI ---
// X has Social Security 40,000 (started) and pension P; Y has none and pension P + 34,000. With P >= 60,000 X's taxable
// benefit is at its 85% cap (34,000) at every sample, so X and Y have the same ordinary income, the same federal tax (Texas:
// no state tax) and the same Medicare MAGI: lambda must be the same. Their ENGINE MAGIs differ by the untaxed 6,000. The
// search keeps the first P (from 60,000 in 500 steps) where some sample's engine-MAGI step crosses an IRMAA tier edge
// while its Medicare-MAGI step does not, so pricing the step on the engine MAGI would make lambda differ. Samples (life
// expectancy 85, plan year 2026, RMDs from 73): ages 73, 79 and 85, Uniform Lifetime divisors 26.5, 21.1 and 16.0; real
// return 0 (return = inflation), so each sample's pool is tradPool and its traditional income the RMD.
// The search, then lambda for X and Y at the P found. X: Social Security 40,000 and pension P (each partner on two
// returns); Y: no benefit and pension P + 34,000.
async function lambdaPair(common, onePerson) {
  const { w, st, irmaa, solver } = await setup();
  const ctx = await w.ctx();
  const saved = JSON.parse(JSON.stringify(st));
  const tradPool = 500000,
    divisors = [26.5, 21.1, 16.0],
    lam = (ssMonthly, pension) => {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, JSON.parse(JSON.stringify(saved)), common, { ssMonthlyA: ssMonthly, pensionYearlyA: pension }, onePerson ? {} : { ssMonthlyB: ssMonthly, pensionYearlyB: pension });
      return solver.lambdaEstimate({ tradPool, year: 0, singlePerson: onePerson, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, ctx });
    };
  try {
    const ss = (40000 / 12) * 12;
    let found = null;
    for (let P = 60000; P <= 300000 && found === null; P += 500) {
      let atCap = true,
        crosses = false;
      for (const div of divisors) {
        const rmd = tradPool / div,
          step = Math.max(1000, 0.1 * rmd),
          // Per return: the whole RMD and step on one return; half of each on each of two returns.
          trad = onePerson ? rmd : rmd / 2,
          s = onePerson ? step : step / 2,
          eng = P + ss + trad,
          med = irmaa.irmaaMagiOf(eng, ss, 'single'),
          medUp = irmaa.irmaaMagiOf(eng + s, ss, 'single');
        if (Math.abs(med - (eng - ss + 0.85 * ss)) > 1e-6) atCap = false;
        const engCross = irmaa.irmaaSurcharge(ctx, eng + s, 'single', 0) !== irmaa.irmaaSurcharge(ctx, eng, 'single', 0),
          medCross = irmaa.irmaaSurcharge(ctx, medUp, 'single', 0) !== irmaa.irmaaSurcharge(ctx, med, 'single', 0);
        if (engCross && !medCross) crosses = true;
      }
      if (atCap && crosses) found = P;
    }
    if (found === null) return { found };
    return { found, x: lam(40000 / 12, found), y: lam(0, found + 34000) };
  } finally {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, saved);
  }
}
const LAMBDA_BASE = { returnRate: 2.5, inflation: 2.5, stateTax: 'tx', survivorEnabled: false, children: [], ssStartAgeA: 67, ssStartAgeB: 67, pensionStartAgeA: 65, pensionStartAgeB: 65 };

it('M1: lambdaEstimate, one person, 70, life expectancy 85', async () => {
  const r = await lambdaPair({ ...LAMBDA_BASE, singlePerson: true, ageA: 70, lifeExpectancyA: 85, pensionCoverage: 'a' }, true);
  check(r.found !== null, 'M1: a pension P where the engine-MAGI step crosses a tier edge and the Medicare one does not');
  check(Math.abs(r.x?.lambda - r.y?.lambda) < 1e-12, `M1 (P ${r.found}): lambda with and without the untaxed benefit: ${r.x?.lambda} vs ${r.y?.lambda}`);
});

it('M13: lambdaEstimate, an unmarried couple on two single returns, both 70', async () => {
  const r = await lambdaPair({ ...LAMBDA_BASE, singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 70, ageB: 70, lifeExpectancyA: 85, lifeExpectancyB: 85, pensionCoverage: 'both' }, false);
  check(r.found !== null, 'M13: a pension P where the per-return engine-MAGI step crosses a tier edge and the Medicare one does not');
  check(Math.abs(r.x?.lambda - r.y?.lambda) < 1e-12, `M13 (P ${r.found}): lambda with and without the untaxed benefits: ${r.x?.lambda} vs ${r.y?.lambda}`);
});

it('M14: the year loop irmaaAt on two returns prices each return Medicare MAGI', async () => {
  // An unmarried couple, both 66 and retired, Texas, no ACA, inflation 2.5%: pension P and Social Security 40,000 (started)
  // each, 300,000 in each partner's traditional IRA (the draw splits half and half), spending 2P + 60,000 (more than the
  // income after tax: year 0 draws from the traditional IRAs), cliff plan on. The search (P from 60,000 in 500 steps) keeps
  // the first P where year 0 is a withdrawal year with a line in reach (a choose-trace entry with candidates) and each
  // return's ENGINE MAGI divided by irmaaGrowth2 (1.025 squared) is over the single first tier (109,000) and its Medicare
  // MAGI divided by it is at or under: the year's IRMAA estimate must be 0, so the natural candidate's cliffCost
  // (healthcare + irmaaAt) is the row's healthcare exactly. On the engine MAGI it would add a surcharge.
  const { st, irmaa, plan } = await setup();
  const M14 = {
    ...QUIET, inflation: 2.5, tradIraA: 300000, tradIraB: 300000, singlePerson: false, filingStatus: 'single', marryLater: false,
    ageA: 66, ageB: 66, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 75, lifeExpectancyB: 75, pensionCoverage: 'both',
    pensionStartAgeA: 60, pensionStartAgeB: 60, ssStartAgeA: 62, ssStartAgeB: 62, ssMonthlyA: 40000 / 12, ssMonthlyB: 40000 / 12, cliffGuardEnabled: true,
  };
  const saved = JSON.parse(JSON.stringify(st));
  const set = (P) => {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, JSON.parse(JSON.stringify(saved)), M14, { pensionYearlyA: P, pensionYearlyB: P, spending: 2 * P + 60000 });
  };
  let r = { P: null };
  try {
    const g2 = (1 + M14.inflation / 100) * (1 + M14.inflation / 100),
      ss = (40000 / 12) * 12;
    for (let P = 60000; P <= 150000; P += 500) {
      set(P);
      const row = plan.runPlanMode({ planMode: 'choose' }).rows[0];
      if (!(row.magiA > 0 && row.magiB > 0)) continue;
      const ok = [row.magiA, row.magiB].every((m) => m / g2 > 109000 && irmaa.irmaaMagiOf(m, ss, 'single') / g2 <= 109000);
      if (!ok) continue;
      // A withdrawal year with a line in reach: the choose trace has year 0 with candidates.
      const tr = plan.planTrace().find((x) => x.year === 0);
      if (!tr || !tr.candidates) continue;
      r = { P, row: { healthcare: row.healthcare, magiA: row.magiA, magiB: row.magiB, trad: row.traditionalWithdrawn }, tr: tr || null };
      break;
    }
  } finally {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, saved);
  }
  check(r.P !== null, 'M14: a pension P where each return is over the first tier on the engine MAGI and at or under it on Medicare MAGI');
  check(r.row?.trad > 0, `M14 (P ${r.P}): year 0 draws from the traditional IRAs`);
  check(r.tr && Array.isArray(r.tr.candidates) && r.tr.candidates.length > 0, `M14 (P ${r.P}): year 0 has a trace entry with candidates: ${JSON.stringify(r.tr)}`);
  const nat = r.tr?.candidates?.find((cd) => cd.kind === 'none');
  check(!!nat, `M14 (P ${r.P}): a natural candidate`);
  same(nat?.cliffCost, r.row?.healthcare, `M14 (P ${r.P}): the natural cliffCost is the row's healthcare (no IRMAA estimate)`);
});
