// US ACA premium credit, eligibility, household size, healthcare cost, 162(l) deduction

import { qualifyingChildCount } from '../../../shared/core/inputs/lists.js';
import { taxYearOf } from '../tax/federal-rules.js';
import { taxIndexFactor, medicalGrowth } from '../../../shared/core/projection/year-factors.js';
import { hasChildAtMost, MEDICAID_RULES, medicaidLimit } from './medicaid-rules.js';
import { irmaaAppealWindow, irmaaLookbackFiling, irmaaLookbackMagi, irmaaLookbackSplit, irmaaSurcharge, irmaaMagiOf } from './irmaa.js';

  export function acaExpectedPct(ratioFpl, enhanced) {
    if (enhanced) {
      if (ratioFpl <= 1.5) return 0;
      if (ratioFpl >= 4) return 8.5;
      return ((ratioFpl - 1.5) / (4 - 1.5)) * 8.5;
    }
    if (ratioFpl < 1.33) return 2.1;
    const pts = [
      [1.33, 3.14],
      [1.5, 4.19],
      [2.0, 6.6],
      [2.5, 8.44],
      [3.0, 9.96],
      [4.0, 9.96],
    ];
    for (let i = 1; i < pts.length; i++) {
      if (ratioFpl <= pts[i][0]) {
        const [x0, y0] = pts[i - 1],
          [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (ratioFpl - x0)) / (x1 - x0);
      }
    }
    return 9.96;
  }
  // Which partners are on the individual (ACA / COBRA / retiree) health market
  // this year: retired, under 65 (Medicare covers them from 65), and without a
  // still-working spouse's employer plan to ride on. While a spouse works,
  // their plan is assumed to cover the retired partner only when the
  // employerCoversSpouse flag for that spouse is set (the default, which makes
  // the pre-65 premium start once BOTH have stopped working); unchecked, the
  // retired partner is on the market from their own retirement date. The
  // household size and MAGI used for the subsidy are the household's on a joint
  // return; per partner with two returns (healthcareCost).
  // Single-person and survivor cases have no spouse's plan to fall back on.
  export function acaEligibility(ctx, c) {
    const { age, ageB, workingA, workingB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB } = c;
    if (singlePerson) return [!workingA && age < 65 && !(isSurvivorPeriod && deceasedIsA), false];
    if (isSurvivorPeriod)
      return [
        !deceasedIsA && !workingA && age < 65,
        !deceasedIsB && !workingB && ageB < 65,
      ];
    return [
      !workingA && age < 65 && (!workingB || !ctx.inputs.employerCoversSpouseB),
      !workingB && ageB < 65 && (!workingA || !ctx.inputs.employerCoversSpouseA),
    ];
  }
  // The ACA tax household: the filer, a spouse while both are alive, and every dependent child the
  // household claims (HealthCare.gov counts tax dependents regardless of age; the model's
  // dependents are the qualifying children of `dependentsInYear`: under 19, or under 24 if a
  // full-time student). The subsidy and the 400%-FPL conversion guard both read this, so they
  // cannot drift apart. The gross premium (`state.healthcare`) is not scaled for children: the
  // household enters the premium it actually pays.
  export function acaHouseholdSize(ctx, singlePerson, isSurvivorPeriod, yearIndex) {
    return (singlePerson || isSurvivorPeriod ? 1 : 2) + qualifyingChildCount(taxYearOf(ctx, yearIndex));
  }
  export function fplForHousehold(ctx, size, yearIndex) {
    const factor = taxIndexFactor(ctx, yearIndex);
    return (15650 + (Math.max(1, size) - 1) * 5500) * factor;
  }
  export function acaNetCost(ctx, magi, householdSize, grossPremium, yearIndex) {
    if (grossPremium <= 0) return 0;
    const ratio = magi > 0 ? magi / fplForHousehold(ctx, householdSize, yearIndex) : 0;
    // Medicaid and the credit floor (O1). An adult under 65 at or below the state's Medicaid line is
    // eligible for Medicaid and cannot take the credit: $0 when enrolled, else the full premium (which
    // is also the price of failing the 2027 work requirement, a retired adult with no child 13 or
    // younger, who is barred from the credit as well). Below 100% there is no credit in any state.
    // The same 1e-9 tolerance as the 400% line below.
    const mcdLimit = medicaidLimit(ctx.inputs.stateTax);
    if (mcdLimit > 0 && ratio <= mcdLimit + 1e-9) {
      const R = MEDICAID_RULES.workRequirement,
        taxYear = taxYearOf(ctx, yearIndex);
      if (ctx.inputs.medicaidWhenEligible && (taxYear < R.fromYear || hasChildAtMost(ctx.inputs, taxYear, R.exemptChildMaxAge))) return 0;
      return grossPremium;
    }
    if (ratio < MEDICAID_RULES.ptcFloor - 1e-9) return grossPremium;
    // A conversion is sized to land exactly on the 400% line, so the comparison needs a tolerance
    // or a last-bit rounding difference between the two engines would decide the whole premium.
    if (!ctx.inputs.acaEnhanced && ratio > 4 + 1e-9) return grossPremium;
    const expected = (magi * acaExpectedPct(ratio, ctx.inputs.acaEnhanced)) / 100;
    return Math.min(grossPremium, Math.max(0, expected));
  }
  // Healthcare and long-term-care cost for the year.
  //  - Pre-65 premium (state.healthcare): only for partners on the individual
  //    market (acaEligibleA/B, see acaEligibility). With ACA modeling on it is
  //    run through acaNetCost(), which depends on this year's MAGI estimate
  //    (usesMagiEstimate tells the caller the MAGI iteration must converge);
  //    otherwise it is the flat premium.
  //  - Medicare Part B/D + supplement (state.medicareYearly): per partner,
  //    from max(65, that partner's retirement age); independent of the spouse.
  //  - IRMAA surcharge per Medicare-eligible partner, from the two-year MAGI
  //    lookback on the tiers of the lookback return's filing status; in an
  //    event window (E3, form SSA-44) the lowest of it and this year's / last
  //    year's MAGI (appeal table, see irmaaAppealTable).
  //  - Long-term care once each partner reaches their LTC age.
  // A deceased partner's share drops out in the survivor period.
  export function healthcareCost(ctx, {
    acaEligibleA,
    acaEligibleB,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    deceasedIsB,
    workingA,
    workingB,
    factor,
    year,
    age,
    ageB,
    magiProxy,
    irmaaHistory,
    filing,
    twoReturns = false,
    magiA = 0,
    magiB = 0,
    irmaaHistoryA = null,
    irmaaHistoryB = null,
    twoReturnHistory = null,
    irmaaFilingHistory = null,
    deathYear = Infinity,
    marriedAtDeath = false,
    appeal = null,
    irmaaSsH = 0,
    ssA = 0,
    ssB = 0,
    irmaaStA = 'single',
  }) {
    const inflate = (amount) => amount * factor * medicalGrowth(ctx, year);
    // An annual `total` shared equally between the two partners (or all Partner
    // A's when single), counting only the partners flagged eligible.
    const sharedCost = (total, eligibleA, eligibleB) =>
      singlePerson
        ? inflate(eligibleA ? total : 0)
        : isSurvivorPeriod
          ? inflate((deceasedIsA ? eligibleB : eligibleA) ? total / 2 : 0)
          : inflate(eligibleA ? total / 2 : 0) + inflate(eligibleB ? total / 2 : 0);
    let usesMagiEstimate = false;
    let healthcare;
    // E1c: each person's own part of the premiums on two returns (the 162(l) deduction's base); 0 on one return.
    let premA = 0,
      premB = 0;
    if (ctx.inputs.acaEnabled && (acaEligibleA || acaEligibleB)) {
      if (twoReturns) {
        // Two tax households: A's includes the children A claims; each partner's half of the premium is
        // priced on their own MAGI and poverty line.
        const kids = qualifyingChildCount(taxYearOf(ctx, year));
        const ca = acaNetCost(ctx, magiA, 1 + kids, inflate(acaEligibleA ? ctx.inputs.healthcare / 2 : 0), year),
          cb = acaNetCost(ctx, magiB, 1, inflate(acaEligibleB ? ctx.inputs.healthcare / 2 : 0), year);
        healthcare = ca + cb;
        premA = ca;
        premB = cb;
      } else {
        const householdSize = acaHouseholdSize(ctx, singlePerson, isSurvivorPeriod, year);
        const grossPremium = sharedCost(ctx.inputs.healthcare, acaEligibleA, acaEligibleB);
        healthcare = acaNetCost(ctx, magiProxy, householdSize, grossPremium, year);
      }
      usesMagiEstimate = true;
    } else {
      // acaEligibleA/B already require age < 65, so this flat premium (ACA
      // modeling off, or both partners past 65) stops for a partner at 65;
      // Medicare below is what covers them from then on.
      healthcare = sharedCost(ctx.inputs.healthcare, acaEligibleA, acaEligibleB);
      if (twoReturns) {
        premA = inflate(acaEligibleA ? ctx.inputs.healthcare / 2 : 0);
        premB = inflate(acaEligibleB ? ctx.inputs.healthcare / 2 : 0);
      }
    }
    // Medicare starts at 65 for a partner without employer coverage (workingX here is employer coverage: a W-2 job still
    // worked, or a W-2 stream with a premium): a partner still working at 65
    // is assumed to stay on the employer plan (no late-enrollment penalty,
    // which is not modeled) and to enroll the year they stop working.
    const medicareEligibleA = age >= 65 && !workingA && !(isSurvivorPeriod && deceasedIsA),
      medicareEligibleB =
        !singlePerson && ageB >= 65 && !workingB && !(isSurvivorPeriod && deceasedIsB);
    healthcare += sharedCost(ctx.inputs.medicareYearly, medicareEligibleA, medicareEligibleB);
    if (twoReturns) {
      premA += inflate(medicareEligibleA ? ctx.inputs.medicareYearly / 2 : 0);
      premB += inflate(medicareEligibleB ? ctx.inputs.medicareYearly / 2 : 0);
    }
    // IRMAA applies only to partners actually on Medicare (see above), using the two-year lookback of Medicare's MAGI
    // (irmaaHistory: only the taxable part of Social Security) on the tiers of the lookback return's filing status (E3 decision
    // 1). A lookback year with two returns charges each person on their own MAGI against the single tiers.
    // E3 (spec 5.3): in an appeal window (appeal.eventA/B), a partner whose normal charge is above 0 is charged the lowest of
    // it, this year's MAGI (this pass's estimate: usesMagiEstimate) and, when the event's E was last year, last year's realized
    // MAGI; a candidate is used only when strictly lower. Year 0 without entered prior MAGIs is skipped: its stand-in already
    // reads this year's MAGI.
    const split = twoReturnHistory ? irmaaLookbackSplit(ctx, irmaaHistoryA, irmaaHistoryB, twoReturnHistory, year) : null,
      lookbackMagi = split ? 0 : irmaaLookbackMagi(ctx, irmaaHistory, year),
      lbFiling = split ? 'single' : irmaaLookbackFiling(ctx, irmaaFilingHistory, year, filing, deathYear, marriedAtDeath),
      canAppeal = appeal !== null && (year > 0 || ctx.inputs.irmaaPriorKnown);
    let appealA = -1,
      appealB = -1,
      inYearA = false,
      inYearB = false;
    if (medicareEligibleA) {
      let ia = irmaaSurcharge(ctx, split ? split[0] : lookbackMagi, lbFiling, year);
      const w = canAppeal && ia > 0 ? irmaaAppealWindow(appeal.eventA, year) : 0;
      if (w !== 0) {
        inYearA = true;
        usesMagiEstimate = true;
        ctx.stats.hooks.irmaaInYearCalls++;
        let best = ia;
        if (w === 2) {
          const s = year - 1,
            last = twoReturnHistory && twoReturnHistory[s] ? irmaaSurcharge(ctx, irmaaHistoryA[s], 'single', year) : irmaaSurcharge(ctx, irmaaHistory[s], irmaaFilingHistory[s], year);
          if (last < best) (best = last), (appealA = s);
        }
        const now = twoReturns ? irmaaSurcharge(ctx, irmaaMagiOf(magiA, ssA, irmaaStA), 'single', year) : irmaaSurcharge(ctx, irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year);
        if (now < best) (best = now), (appealA = year);
        ia = best;
      }
      healthcare += ia;
      if (twoReturns) premA += ia;
    }
    if (medicareEligibleB) {
      let ib = irmaaSurcharge(ctx, split ? split[1] : lookbackMagi, lbFiling, year);
      const w = canAppeal && ib > 0 ? irmaaAppealWindow(appeal.eventB, year) : 0;
      if (w !== 0) {
        inYearB = true;
        usesMagiEstimate = true;
        ctx.stats.hooks.irmaaInYearCalls++;
        let best = ib;
        if (w === 2) {
          const s = year - 1,
            last = twoReturnHistory && twoReturnHistory[s] ? irmaaSurcharge(ctx, irmaaHistoryB[s], 'single', year) : irmaaSurcharge(ctx, irmaaHistory[s], irmaaFilingHistory[s], year);
          if (last < best) (best = last), (appealB = s);
        }
        const now = twoReturns ? irmaaSurcharge(ctx, irmaaMagiOf(magiB, ssB, 'single'), 'single', year) : irmaaSurcharge(ctx, irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year);
        if (now < best) (best = now), (appealB = year);
        ib = best;
      }
      healthcare += ib;
      if (twoReturns) premB += ib;
    }
    const ltc = ctx.inputs.ltcEnabled
      ? (age >= ctx.inputs.ltcAgeA && !(isSurvivorPeriod && deceasedIsA) ? ctx.inputs.ltcYearlyA : 0) *
          factor * medicalGrowth(ctx, year) +
        (!singlePerson && ageB >= ctx.inputs.ltcAgeB && !(isSurvivorPeriod && deceasedIsB)
          ? ctx.inputs.ltcYearlyB
          : 0) *
          factor * medicalGrowth(ctx, year)
      : 0;
    return { healthcare, ltc, usesMagiEstimate, premA, premB, appealA, appealB, inYearA, inYearB };
  }
  // E1c: the self-employed health insurance deduction (IRC 162(l)) for the year's premiums (`healthcare`: marketplace after
  // the credit, the flat premium, Medicare and IRMAA; all of it is insurance for the household). A person may deduct it
  // only in a year without employer coverage of their own or through a spouse (profile.seAllowX), up to their net
  // self-employment earned income (sePlanNetX: profit less half the SE tax and the Solo 401(k) plan money, IRC 401(c)(2);
  // a traditional IRA does not reduce it). One return: the
  // household's premiums, up to both caps (either spouse may claim the family's). Two returns: each person's own part
  // (premA includes the children). Pure; fills `out`.
  export const SE_HEALTH = [0, 0];
  export function seHealthDeduction(healthcare, premA, premB, twoReturns, profile, out) {
    const capA = profile.seAllowA ? profile.sePlanNetA || 0 : 0,
      capB = profile.seAllowB ? profile.sePlanNetB || 0 : 0;
    if (twoReturns) {
      out[0] = Math.min(premA, capA);
      out[1] = Math.min(premB, capB);
    } else {
      const total = Math.min(healthcare, capA + capB);
      out[0] = Math.min(total, capA);
      out[1] = total - out[0];
    }
    return out;
  }
