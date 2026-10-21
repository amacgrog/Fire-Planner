import { dependentsInYear, qualifyingChildCount } from '../../../shared/core/lists-and-children.js';
import { state } from '../../../shared/core/store.js';
import { taxIndexFactor } from '../../../shared/core/tax-index-factor.js';
import { acaHouseholdSize, fplForHousehold } from '../healthcare/aca.js';
import { filingKey, SENIOR_DEDUCTION_LAST_YEAR, SENIOR_PHASE_START, taxYearOf, filingRow } from '../federal-deductions.js';
import { IRMAA_TIERS } from '../irmaa-tiers.js';
import { magiForIrmaaLine } from '../magi-for-irmaa-line.js';
import { MEDICAID_RULES, medicaidLimit } from '../medicaid-rules.js';
import { CTC_MAX_AGE, CTC_PHASE_START } from '../social-security-and-child-credits.js';
import { NO_THRESHOLDS, LAMBDA_MAX, SOLVER_LAMBDA_MULT, TAU_GAIN_MAX } from '../solver-lambda-mult.js';
import { returnStatusA, irmaaSsOf } from '../tax/social-security-tax.js';
import { pct } from '../../../shared/core/basics.js';
import { LAMBDA_PROFILE } from '../lambda-profile.js';
import { rmdDivisor, rmdStartAge } from '../niit-and-rmd.js';
import { irmaaSurcharge, irmaaMagiOf } from '../healthcare/irmaa.js';
import { taxFor } from '../standard-deduction.js';

  export function magiThresholds(c) {
    const out = [],
      y = c.year,
      taxYear = taxYearOf(y),
      lo = c.lo === undefined ? -Infinity : c.lo,
      hi = c.hi === undefined ? Infinity : c.hi,
      add = (magi, label, id, ret, family) => {
        if (Number.isFinite(magi) && magi > 0 && magi > lo && magi <= hi) out.push({ magi, label, id, ret, family });
      },
      toHousehold = (line, m, frac) => (frac > 0 ? c.preMagi + (line - m) / frac : NaN),
      shareA = c.profile.ownerShareA === undefined ? 0.5 : c.profile.ownerShareA,
      acaLines = (fpl, put) => {
        const mcd = medicaidLimit(state.stateTax);
        if (mcd > 0) put(fpl * mcd, 'Medicaid line', 'medicaid');
        put(fpl * MEDICAID_RULES.ptcFloor, 'ACA credit floor (100%)', 'acaFloor');
        if (!state.acaEnhanced) put(fpl * 4, 'ACA 400% line', 'aca400');
      },
      kids = qualifyingChildCount(taxYear);
    if (state.acaEnabled && (c.acaEligibleA || c.acaEligibleB)) {
      if (c.twoReturns) {
        if (c.acaEligibleA) acaLines(fplForHousehold(1 + kids, y), (line, label, id) => add(toHousehold(line, c.preMagiA, shareA), label, id, 'A', 'aca'));
        if (c.acaEligibleB) acaLines(fplForHousehold(1, y), (line, label, id) => add(toHousehold(line, c.preMagiB, 1 - shareA), label, id, 'B', 'aca'));
      } else acaLines(fplForHousehold(acaHouseholdSize(c.singlePerson, c.isSurvivorPeriod, y), y), (line, label, id) => add(line, label, id, 'H', 'aca'));
    }
    // IRMAA: the surcharge this year's MAGI sets is charged two years on, to the partners on Medicare then, on this year's
    // return's filing status (the return SSA will read, E3); a caller may pass those (c.irmaa: { filing, a, b }). The lines sit on the tiers of the year
    // the surcharge is charged, estimated as irmaaAt estimates them: this year's edge times c.irmaaGrowth (default 1;
    // the year loop passes irmaaGrowth2). That is where the charge jumps, so that is where a stay-under saves money.
    // E3: a caller may pass c.irmaaGrowthA / c.irmaaGrowthB (two returns, per return); a year with an in-year IRMAA
    // appeal candidate passes growth 1 (this year's edges).
    // (The conversion ceiling, irmaaTierCeiling, keeps this year's tiers: the safe side there; Batch 5 revisits it.)
    // The edges are Medicare's MAGI (only the taxable part of Social Security), translated into the engine's MAGI with
    // magiForIrmaaLine on this year's return (its benefit and filing status); the tier table is the charged year's.
    const ir = c.irmaa,
      irmaaA = ir ? ir.a : !c.workingA && c.age >= 63 && !(c.isSurvivorPeriod && c.deceasedIsA),
      irmaaB = ir ? ir.b : !c.singlePerson && !c.workingB && c.ageB >= 63 && !(c.isSurvivorPeriod && c.deceasedIsB);
    if (irmaaA || irmaaB) {
      const g = c.irmaaGrowth === undefined ? 1 : c.irmaaGrowth,
        p = c.profile,
        ssH = irmaaSsOf(p),
        stA = returnStatusA(p.dependents);
      if (c.twoReturns) {
        const f = taxIndexFactor(y),
          gA = c.irmaaGrowthA === undefined ? g : c.irmaaGrowthA, // E3 (spec 5.5): per return
          gB = c.irmaaGrowthB === undefined ? g : c.irmaaGrowthB;
        let k = 0;
        for (const [edge] of IRMAA_TIERS[filingKey('single', 'irmaa')]) {
          if (edge < Infinity) k++;
          if (irmaaA && edge < Infinity) add(toHousehold(magiForIrmaaLine(edge * f * gA, p.ssA || 0, stA), c.preMagiA, shareA), 'IRMAA tier', 'irmaa' + k, 'A', 'irmaa');
          if (irmaaB && edge < Infinity) add(toHousehold(magiForIrmaaLine(edge * f * gB, p.ssB || 0, 'single'), c.preMagiB, 1 - shareA), 'IRMAA tier', 'irmaa' + k, 'B', 'irmaa');
        }
      } else {
        const f = taxIndexFactor(y);
        let k = 0;
        for (const [edge] of IRMAA_TIERS[filingKey(ir ? ir.filing : c.filing, 'irmaa')]) if (edge < Infinity) add(magiForIrmaaLine(edge * f * g, ssH, c.filing), 'IRMAA tier', 'irmaa' + ++k, 'H', 'irmaa');
      }
    }
    if (taxYear <= SENIOR_DEDUCTION_LAST_YEAR && (c.age >= 65 || (!c.singlePerson && c.ageB >= 65)))
      add(SENIOR_PHASE_START[filingKey(c.twoReturns ? 'single' : c.filing, 'senior')], 'senior deduction phase-out', 'senior', 'H', 'tax');
    if (dependentsInYear(taxYear).some((d) => d.age <= CTC_MAX_AGE))
      add(CTC_PHASE_START[filingKey(c.twoReturns ? 'single' : c.filing, 'ctc')], 'child tax credit phase-out', 'ctc', 'H', 'tax');
    if (!out.length) return NO_THRESHOLDS;
    out.sort((a, b) => a.magi - b.magi);
    const deduped = [];
    // Two lines within $1 are one line. Keep the earlier one, except that a cliff line (aca or irmaa family) replaces a
    // tax-family line (senior, ctc): those are priced by taxFor and are never candidates, so an intent must not name one.
    for (const t of out) {
      const last = deduped[deduped.length - 1];
      if (!last || t.magi - last.magi > 1) deduped.push(t);
      else if (last.family === 'tax' && t.family !== 'tax') deduped[deduped.length - 1] = t;
    }
    return deduped;
  }
  export function lambdaEstimate({ tradPool, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor, need = 0, tradShare = 0 }) {
    const real = (1 + pct(state.returnRate)) / (1 + pct(state.inflation)) - 1,
      endYear = singlePerson ? state.lifeExpectancyA - state.ageA : Math.max(state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    let firstDeath = Infinity,
      aDiesFirst = false;
    if (!singlePerson && !isSurvivorPeriod) {
      if (deathYear < Infinity) {
        firstDeath = deathYear;
        aDiesFirst = deceasedIsA;
      } else {
        const dA = state.lifeExpectancyA - state.ageA,
          dB = state.lifeExpectancyB - state.ageB;
        if (dA !== dB) {
          firstDeath = Math.min(dA, dB);
          aDiesFirst = dA < dB;
        }
      }
    }
    const y1 = Math.max(year, rmdStartAge(state.ageA) - state.ageA),
      y3 = Math.max(year, firstDeath < endYear ? firstDeath + 1 : endYear);
    const samples = y1 > y3 ? [y3, y3, y3] : [y1, Math.round((y1 + y3) / 2), y3];
    const P = LAMBDA_PROFILE,
      ssOf = (p, a) => (a >= state['ssStartAge' + p] ? state['ssMonthly' + p] * 12 : 0) * factor,
      pensionOf = (p, a) =>
        (state.pensionCoverage === 'both' || state.pensionCoverage === p.toLowerCase() || (p === 'A' && singlePerson)) && a >= state['pensionStartAge' + p] ? state['pensionYearly' + p] * factor : 0;
    // Note 1 (spec 13.1): walk the pool forward in real dollars net of the traditional share of each year's need
    // (this year's dollars); Social Security and pensions that start later take over part of the need. The walk
    // uses the household's benefits even past a death (close enough for an estimate; the sample's own income
    // below uses the survivor's). 13.2: walkTo(ys0) returns [year priced, pool at the start of that year grown
    // one year, that year's draw]; if a year's draw empties the pool before ys0, that year is priced (one more
    // dollar left today would be spent there).
    const incomeAt = (y) => ssOf('A', state.ageA + y) + pensionOf('A', state.ageA + y) + (singlePerson ? 0 : ssOf('B', state.ageB + y) + pensionOf('B', state.ageB + y));
    const incomeNow = incomeAt(year),
      drawIn = (y) => tradShare * Math.max(0, need - Math.max(0, incomeAt(y) - incomeNow));
    const walkTo = (ys0) => {
      let pool = tradPool;
      for (let y = year + 1; y <= ys0; y++) {
        const before = pool * (1 + real),
          d = drawIn(y);
        if (y === ys0 || before <= d) return [y, before, d];
        pool = before - d;
      }
      return [ys0, tradPool, drawIn(year)];
    };
    let moved = false,
      rateSum = 0,
      tauSum = 0;
    for (const ys0 of samples) {
      // With need 0 or tradShare 0 this is B2's plain compounding and no draw, to the bit.
      const [ys, trad, draw] = need > 0 && tradShare > 0 ? walkTo(ys0) : [ys0, tradPool * Math.pow(1 + real, Math.max(0, ys0 - year)), 0];
      if (ys !== ys0) moved = true;
      const ageAs = state.ageA + ys,
        ageBs = state.ageB + ys,
        survivorIsB = isSurvivorPeriod ? deceasedIsA : ys > firstDeath && aDiesFirst,
        onePerson = singlePerson || isSurvivorPeriod || ys > firstDeath;
      let ownerAge, startAge;
      if (onePerson && survivorIsB) {
        ownerAge = ageBs;
        startAge = rmdStartAge(state.ageB);
        P.ssA = Math.max(ssOf('A', ageAs), ssOf('B', ageBs));
        P.pensionA = pensionOf('B', ageBs);
        P.ageA = ageBs;
      } else {
        ownerAge = ageAs;
        startAge = rmdStartAge(state.ageA);
        P.ssA = onePerson && !singlePerson ? Math.max(ssOf('A', ageAs), ssOf('B', ageBs)) : ssOf('A', ageAs);
        P.pensionA = pensionOf('A', ageAs);
        P.ageA = ageAs;
      }
      if (onePerson) {
        P.singlePerson = true;
        P.filing = 'single';
        P.ssB = 0;
        P.pensionB = 0;
        P.ageB = null;
        P.ownerShareA = 1;
      } else {
        P.singlePerson = false;
        P.filing = (state.marryLater ? ageAs >= state.marriageAgeA : state.filingStatus === 'mfj') ? 'mfj' : 'single';
        P.ssB = ssOf('B', ageBs);
        P.pensionB = pensionOf('B', ageBs);
        P.ageB = ageBs;
        P.ownerShareA = 0.5;
      }
      P.otherA = P.pensionA;
      P.otherB = P.pensionB;
      P.year = year;
      const rmd = ownerAge >= startAge ? trad / rmdDivisor(ownerAge) : 0,
        // 13.2: the traditional income the walk assumes this year (the RMD alone when there are no draws:
        // Math.max(rmd, Math.min(trad, 0)) is rmd itself).
        tradIncome = Math.max(rmd, Math.min(trad, draw)),
        step = Math.max(1000, 0.1 * tradIncome),
        t0 = taxFor(P, 0, tradIncome),
        t1 = taxFor(P, 0, tradIncome + step),
        g1 = taxFor(P, step, tradIncome);
      let irmaaStep;
      if (!onePerson && !filingRow(P.filing).joint) {
        // 13.2 item 1: two returns, IRMAA per person on their own MAGI (half the traditional income each, the
        // profile's ownerShareA 0.5) against the single tiers; the step is split half to each.
        const half = tradIncome / 2,
          hs = step / 2,
          mA = P.otherA + P.ssA + half,
          mB = P.otherB + P.ssB + half;
        irmaaStep =
          (P.ageA >= 65 ? irmaaSurcharge(irmaaMagiOf(mA + hs, P.ssA, 'single'), 'single', year) - irmaaSurcharge(irmaaMagiOf(mA, P.ssA, 'single'), 'single', year) : 0) +
          (P.ageB >= 65 ? irmaaSurcharge(irmaaMagiOf(mB + hs, P.ssB, 'single'), 'single', year) - irmaaSurcharge(irmaaMagiOf(mB, P.ssB, 'single'), 'single', year) : 0);
      } else {
        const magi = P.otherA + P.otherB + P.ssA + P.ssB + tradIncome,
          onMedicare = (P.ageA >= 65 ? 1 : 0) + (!onePerson && P.ageB >= 65 ? 1 : 0);
        irmaaStep = onMedicare * (irmaaSurcharge(irmaaMagiOf(magi + step, P.ssA + P.ssB, P.filing), P.filing, year) - irmaaSurcharge(irmaaMagiOf(magi, P.ssA + P.ssB, P.filing), P.filing, year));
      }
      rateSum += (t1 - t0 + irmaaStep) / step;
      tauSum += (g1 - t0) / step;
    }
    return {
      lambda: Math.min(LAMBDA_MAX, Math.max(0, (SOLVER_LAMBDA_MULT * rateSum) / 3)),
      tauGain: Math.min(TAU_GAIN_MAX, Math.max(0, tauSum / 3)),
      movedSample: moved,
    };
  }
  // The plan's ending value (cliff plan, spec section 5): Roth, taxable (US heirs get a stepped-up basis: no gains tax),
  // cash and home equity at face value; traditional money net of the income tax it carries, priced as ten slices of the
  // balance, each added to the last year's own return (its law, its filing status: single after a death). Not modeled:
  // heirs' own rates, the federal estate tax, state estate and inheritance taxes. Standard runs only (a historical run's
  // per-path tax factors are gone once simulateHistorical returns).
  export function afterTaxEndValueUS(sim) {
    const e = sim.estate;
    if (!e || !e.profile) return 0;
    const T = e.traditional;
    let tax = 0;
    if (T > 0) tax = 10 * (taxFor(e.profile, e.lastGain, e.lastTrad + T / 10) - taxFor(e.profile, e.lastGain, e.lastTrad));
    return e.roth + e.taxable + e.cash + e.homeEquity + T - Math.max(0, tax);
  }
