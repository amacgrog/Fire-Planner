// US per-year stages: the tax profile builder and the housing cost for a year

import { pct } from '../../../shared/core/format/numbers.js';
import { mortgageInterestShare, filingRow, taxYearOf } from '../tax/federal-rules.js';
import { dependentsInYear } from '../../../shared/core/inputs/lists.js';
import { stateRuleForYear } from '../tax/state-tax.js';

  // Shelter cost for one year: rent, or (once a home is owned) mortgage payment
  // + maintenance + property tax and insurance, plus the one-off cash cost in
  // the year a future purchase happens. Also reports the balance-sheet change
  // that comes with it: `mortgage` is the loan balance when it changes this
  // year and `homeValue` the home's value in the purchase year (both null when
  // nothing changes). projectedExpense() reads only `.housing`.
  export function housingForYear(ctx, year, factor, schedule, futureBuy) {
    const ownsHome =
      ctx.inputs.tenure === 'own' || (ctx.inputs.tenure === 'rentThenBuy' && year >= futureBuy.buyYear);
    const propCosts = ownsHome
      ? ctx.inputs.propertyTax * Math.pow(1 + pct(ctx.inputs.propertyTaxGrowth), year) +
        ctx.inputs.homeInsurance * Math.pow(1 + pct(ctx.inputs.homeInsuranceGrowth), year)
      : 0;
    const rent = ctx.inputs.rent * 12 * Math.pow(1 + pct(ctx.inputs.rentGrowth), year);
    // Federal itemizing inputs: property tax and the deductible share of this
    // year's mortgage interest (limited to $750,000 of original debt).
    const propertyTax = ownsHome
      ? ctx.inputs.propertyTax * Math.pow(1 + pct(ctx.inputs.propertyTaxGrowth), year)
      : 0;
    if (ctx.inputs.tenure === 'own') {
      const annualPI = schedule.payments[year] || 0;
      return {
        housing: annualPI + ctx.inputs.maintenance * factor + propCosts,
        mortgage: schedule.balances[year] || 0,
        homeValue: null,
        propertyTax,
        rent: 0,
        mortgageInterest:
          (schedule.interest?.[year] || 0) * mortgageInterestShare(schedule.originalPrincipal || 0),
      };
    }
    if (ctx.inputs.tenure === 'rent' || year < futureBuy.buyYear)
      return { housing: rent, mortgage: null, homeValue: null, propertyTax: 0, rent, mortgageInterest: 0 };
    const buyAnnualPI = futureBuy.buySchedule.payments[year] || 0;
    return {
      propertyTax,
      rent: 0,
      mortgageInterest:
        (futureBuy.buySchedule.interest?.[year] || 0) *
        mortgageInterestShare(futureBuy.buySchedule.principal || 0),
      housing:
        buyAnnualPI +
        ctx.inputs.maintenance * factor +
        propCosts +
        (year === futureBuy.buyYear ? futureBuy.purchaseCash : 0),
      mortgage: futureBuy.buySchedule.balances[year] || 0,
      homeValue: year === futureBuy.buyYear ? futureBuy.homeValueAtPurchase : null,
    };
  }
  // The tax profile handed to taxFor() for the year, plus each partner's
  // "other" ordinary income (wages net of pre-tax contributions and premiums,
  // pension, distributions; not-earned income streams ride in their owner's slot,
  // W-2 stream wages join the owner's wages). The survivor period remaps the surviving partner into the A slot,
  // because taxFor()'s single-person branch reads only the A fields.
  export function buildTaxProfile(ctx, {
    wageA,
    wageB,
    traditionalContribA,
    traditionalContribB,
    healthPremiumA,
    healthPremiumB,
    pensionA,
    pensionB,
    rmdA,
    rmdB,
    streamWagesA = 0,
    streamWagesB = 0,
    streamOtherA = 0,
    streamOtherB = 0,
    streamWageCutA = 0,
    streamWageCutB = 0,
    streamPremiumA = 0,
    streamPremiumB = 0,
    ssA,
    ssB,
    age,
    ageB,
    year,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    filing,
    inv,
    propertyTax = 0,
    rent = 0,
    ownerShareA = 0.5,
    mortgageInterest = 0,
    tradShares = null,
    workingA = false,
    workingB = false,
    seA = 0,
    seB = 0,
    halfA = 0,
    halfB = 0,
    soloPlanCutA = 0,
    soloPlanCutB = 0,
    soloIraCutA = 0,
    soloIraCutB = 0,
    seAllowA = false,
    seAllowB = false,
    lumpOn = false,
    lumpGainA = 0,
    lumpGainB = 0,
    lumpNoNiitA = 0,
    lumpNoNiitB = 0,
    inhOn = false,
    inheritedA = 0,
    inheritedB = 0,
  }) {
    const profileWageA = Math.max(0, wageA - traditionalContribA - healthPremiumA) + Math.max(0, streamWagesA - streamWageCutA - streamPremiumA),
      profileWageB = Math.max(0, wageB - traditionalContribB - healthPremiumB) + Math.max(0, streamWagesB - streamWageCutB - streamPremiumB);
    // E1c: self-employment net of half the SE tax and the deductible Solo 401(k) and traditional IRA money (seNet: in
    // other, so AGI and MAGI, and in the state's wages); sePlanNet is net of the plan money only (IRC 401(c)(2) earned
    // income: the 162(l) cap, and the QBI base, Treas. Reg. 1.199A-3(b)(1)(vi); an IRA deduction reduces neither);
    // seEarned (net of half the SE tax only) is earned income for the ACTC.
    const sePlanNetA = seA > 0 ? Math.max(0, seA - halfA - soloPlanCutA) : 0,
      sePlanNetB = seB > 0 ? Math.max(0, seB - halfB - soloPlanCutB) : 0,
      seNetA = seA > 0 ? Math.max(0, seA - halfA - soloPlanCutA - soloIraCutA) : 0,
      seNetB = seB > 0 ? Math.max(0, seB - halfB - soloPlanCutB - soloIraCutB) : 0;
    let otherA = profileWageA + pensionA + rmdA + streamOtherA + seNetA,
      otherB = profileWageB + pensionB + rmdB + streamOtherB + seNetB;
    // E1e: the scheduled inherited traditional draw is ordinary income on the heir's return (never through the streams: the state would count it as wages).
    if (inheritedA > 0) otherA += inheritedA;
    if (inheritedB > 0) otherB += inheritedB;
    // The share of each filer's traditional draw that is employer-plan (401(k)) money: their 401(k) over their own
    // traditional accounts, pro rata as the draws are; a one-person return (a single person or the survivor) owns the
    // whole pool. Read by two state rules: Pennsylvania (employerPlanAfterRetirement: 401(k) money drawn after retirement
    // is exempt at any age), so the share is 0 while that filer still works; and Rhode Island (employerPlanOnly: from 67
    // only 401(k) money qualifies, never an IRA), which has no "stopped working" test (PUB 2026-01, Example 4), so the
    // share counts while working too.
    let k401FracA = 0,
      k401FracB = 0;
    if (tradShares) {
      const ownA = tradShares[0] + tradShares[1],
        ownB = tradShares[2] + tradShares[3],
        yr = stateRuleForYear(ctx, year),
        anyWork = !!(yr && yr.retirement && yr.retirement.employerPlanOnly);
      if (singlePerson || isSurvivorPeriod) {
        const stopped = anyWork || (isSurvivorPeriod && deceasedIsA ? !workingB : !workingA);
        k401FracA = stopped ? tradShares[1] + tradShares[3] : 0;
      } else {
        k401FracA = (anyWork || !workingA) && ownA > 0 ? tradShares[1] / ownA : 0;
        k401FracB = (anyWork || !workingB) && ownB > 0 ? tradShares[3] / ownB : 0;
      }
    }
    const profile =
      isSurvivorPeriod && deceasedIsA
        ? {
            filing,
            // Not-earned streams ride in their owner's slot; when A is the deceased the engine has already
            // moved A's streams into B's bucket (streamAmountsForYear), so B's slot is the survivor's.
            otherA: otherB,
            extraA: streamOtherB,
            extraB: 0,
            otherB: 0,
            wageA: profileWageB,
            wageB: 0,
            pensionA: pensionB,
            pensionB: 0,
            rmdA: rmdB,
            rmdB: 0,
            ssA: ssB,
            ssB: 0,
            ageA: ageB,
            // A joint return for the death year still counts the deceased's age
            // (65+ deductions); every later year is a one-person return.
            ageB: filingRow(filing).joint ? age : null,
            singlePerson: true,
            invOrd: inv.ordinary,
            invQual: inv.qualified,
            propertyTax,
            rent,
            ownerShareA: 1,
            k401FracA,
            k401FracB: 0,
            mortgageInterest,
            year,
            seOn: seA > 0 || seB > 0,
            seNetA: seNetB,
            seNetB: 0,
            sePlanNetA: sePlanNetB,
            sePlanNetB: 0,
            seEarnedA: seB > 0 ? seB - halfB : 0,
            seEarnedB: 0,
            // E1c: the 162(l) permission follows the survivor; the deduction itself is set every MAGI pass.
            seAllowA: seAllowB,
            seAllowB: false,
            seHealthA: 0,
            seHealthB: 0,
            // E1d: a dead owner's gain never reaches the profile (it is tax-free); B's moves to the survivor's slot.
            lumpOn,
            lumpGainA: lumpGainB,
            lumpGainB: 0,
            lumpGainNoNiitA: lumpNoNiitB,
            lumpGainNoNiitB: 0,
            // E1e: the survivor's slot A carries what was B's.
            inhOn,
            inheritedA: inheritedB,
            inheritedB: 0,
            inhExtraA: 0,
            inhExtraB: 0,
            inhEstA: 0,
            inhEstB: 0,
            inhExclA: 0,
            inhExclB: 0,
            // Children stay with the surviving parent.
            dependents: dependentsInYear(ctx.inputs, taxYearOf(ctx, year)),
          }
        : {
            filing,
            otherA,
            extraA: streamOtherA,
            extraB: streamOtherB,
            otherB,
            wageA: profileWageA,
            wageB: profileWageB,
            pensionA,
            pensionB,
            rmdA,
            rmdB,
            ssA,
            ssB,
            ageA: age,
            ageB,
            singlePerson: singlePerson || isSurvivorPeriod,
            invOrd: inv.ordinary,
            invQual: inv.qualified,
            propertyTax,
            rent,
            // Partner A's share of the traditional pool (the account ledger); a one-person
            // return holds everything in the A slot.
            ownerShareA: singlePerson || isSurvivorPeriod ? 1 : ownerShareA,
            k401FracA,
            k401FracB,
            mortgageInterest,
            year,
            dependents: dependentsInYear(ctx.inputs, taxYearOf(ctx, year)),
            seOn: seA > 0 || seB > 0,
            seNetA,
            seNetB,
            sePlanNetA,
            sePlanNetB,
            seEarnedA: seA > 0 ? seA - halfA : 0,
            seEarnedB: seB > 0 ? seB - halfB : 0,
            // E1c: may each person take the 162(l) deduction this year; the deduction itself is set every MAGI pass.
            seAllowA,
            seAllowB,
            seHealthA: 0,
            seHealthB: 0,
            // E1d: this year's taxable one-time gains per owner (false and zeros outside a lump year; taxFor and
            // returnMagis read them only when lumpOn is true).
            lumpOn,
            lumpGainA,
            lumpGainB,
            lumpGainNoNiitA: lumpNoNiitA,
            lumpGainNoNiitB: lumpNoNiitB,
            // E1e: the scheduled inherited draw by slot (already inside otherA/B), the last-resort draw of the pass (0 until Task 6) and
            // New York's decedent room (set once a year by the engine).
            inhOn,
            inheritedA,
            inheritedB,
            inhExtraA: 0,
            inhExtraB: 0,
            inhEstA: 0,
            inhEstB: 0,
            inhExclA: 0,
            inhExclB: 0,
          };
    return { otherA, otherB, profile };
  }
