// US federal tax: brackets, gains, NIIT, payroll, child credits, taxFor

import { filingKey, NIIT_THRESHOLD, taxYearOf, FILING, filingRow, GAIN_BANDS, ORDINARY_BRACKETS, SS_WAGE_BASE, standardDeduction, federalDeduction } from './federal-rules.js';
import { clamp, pct } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';
import { dependentsInYear, NO_DEPENDENTS } from '../../../shared/core/inputs/lists.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';
import { SOURCES_A, SOURCES_B, SOURCES_JOINT, SOURCES_SINGLE, stateRuleFor, stateIncomeTax } from './state-tax.js';
import { returnStatusA, taxableSocialSecurity } from './social-security-tax.js';

  // E1c: the qualified business income deduction (IRC 199A), federal only, below AGI. 2026 limits from Rev. Proc. 2025-32
  // section 4.26 (threshold indexed; the phase-in width is a fixed statutory amount since OBBBA section 70105). Every
  // business is treated as a specified service business with no W-2 wages and no property (owner decision): full 20%
  // up to the threshold, 20% x ap^2 inside the range, nothing above; capped at 20% of taxable income less net capital
  // gain (which includes qualified dividends). The $400 minimum (IRC 199A(i)) applies after the cap, to a taxpayer with
  // $1,000 of QBI from qualified businesses: an SSTB counts only at the applicable percentage, and not at all above the
  // range (199A(d)(1)(A), (d)(3)).
  const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };
  export function niitTax(magi, netInvestmentIncome, filing = 'mfj') {
    return (
      0.038 *
      Math.min(
        Math.max(0, netInvestmentIncome),
        Math.max(0, magi - NIIT_THRESHOLD[filingKey(filing, 'niit')]),
      )
    );
  }
  // Annual taxable investment income on the taxable brokerage account and
  // the taxable bond reserve/cash. Dividends and interest are part of the
  // modeled total return (never added on top of it), but unlike unrealized
  // growth they are taxed in the year they are paid: non-qualified
  // dividends and interest as ordinary income, qualified dividends at
  // long-term gain rates. Computed on start-of-year balances. Reinvested
  // dividends/interest raise cost basis (see the callers) so the gain
  // realized at sale is not taxed a second time. Taxable-bond interest uses
  // the planner's bond return assumption as its yield in both engines.
  export function investmentIncome(taxableBal, bondTaxableBal, cashBal, bondRate, cashRate) {
    const divTotal = Math.max(0, taxableBal) * pct(state.dividendYield),
      qualified = divTotal * clamp(pct(state.qualifiedDivPct), 0, 1),
      bondInterest = Math.max(0, bondTaxableBal) * Math.max(0, bondRate),
      cashInterest = Math.max(0, cashBal) * Math.max(0, cashRate);
    return {
      ordinary: divTotal - qualified + bondInterest + cashInterest,
      qualified,
      divTotal,
      bondInterest,
    };
  }
  // Additional Medicare Tax (IRC 3101(b)(2)/1401(b)(2)): 0.9% of Medicare
  // wages above $250,000 (MFJ, combined) or $200,000 (single). The thresholds
  // are set by statute and are NOT inflation-indexed, so they deliberately skip
  // taxIndexFactor — bracket creep applies to them in nominal projections.
  // `filing === 'single'` covers both one person and two separate filers
  // (marry-later, before the wedding), each measured against their own $200k.
  export function additionalMedicareTax(wagesA, wagesB, filing) {
    const rate = 0.009;
    if (filingKey(filing, 'medicare') === 'mfj') return Math.max(0, wagesA + wagesB - 250000) * rate;
    return (Math.max(0, wagesA - 200000) + Math.max(0, wagesB - 200000)) * rate;
  }
  // Tax filing status for the year (a key of FILING).
  //  - Unmarried with a qualifying child that year: head of household; without: single.
  //    This covers a single person, a survivor after the window below, and an unmarried
  //    couple (the household return is then two separate filers, see taxFor, so its
  //    household status stays 'single' and Partner A, who claims the children, files HoH).
  //  - "Start single, then file MFJ" (marryLater): two single filers until Partner A reaches
  //    marriageAgeA.
  //  - Survivor, if the couple was married that year: MFJ for the year of death
  //    (IRC 6013(a)(3)); qualifying surviving spouse (MFJ brackets and deduction) for the next
  //    two tax years while a qualifying child exists that year; then as an unmarried person.
  export function filingStatusFor({ age, singlePerson, isSurvivorPeriod, year, deathYear }) {
    const married = state.marryLater ? age >= state.marriageAgeA : state.filingStatus === 'mfj';
    const hasChild = dependentsInYear(taxYearOf(year)).some((d) => d.qualifyingChild);
    const unmarried = hasChild ? 'hoh' : 'single';
    let filing;
    if (isSurvivorPeriod) {
      filing =
        !married ? unmarried : year === deathYear ? 'mfj' : year - deathYear <= 2 && hasChild ? 'qss' : unmarried;
    } else if (singlePerson) filing = unmarried;
    else if (state.marryLater) filing = age >= state.marriageAgeA ? 'mfj' : 'single';
    else filing = state.filingStatus;
    return { filing };
  }
  // E1c: self-employment tax (IRC 1401, 1402) on one person's year of self-employment profit se. Net earnings are 92.35%
  // of profit; nothing is due under $400 of net earnings. Social Security (12.4%) stops at the wage base less that person's
  // W-2 Social Security wages; Medicare is 2.9% of all net earnings. half (IRC 164(f)) is deducted from income; the 0.9%
  // Additional Medicare Tax is figured in payrollTax on wages plus ne. Pure; fills out.
  export const SE_OUT = { tax: 0, half: 0, ne: 0 };
  // Federal child credits for one return (IRC 24). 2026 amounts (Rev. Proc. 2025-32, via
  // secondary sources): the Child Tax Credit is $2,200 per child aged 16 or under at year end,
  // of which at most $1,700 is refundable (the ACTC, 15% of earned income over $2,500), both
  // indexed with the tax parameters from 2026. The Credit for Other Dependents is $500 (not
  // indexed, nonrefundable) for a qualifying child who is not CTC-eligible (17 and over: 17-18,
  // and students to 23). The two share one phase-out: $50 per $1,000 (or part) of MAGI over
  // $200,000 ($400,000 joint), thresholds that are NOT indexed. Both are limited to the federal
  // income tax (ordinary + long-term gains tax; not state tax, NIIT or payroll tax).
  // `dependents` is the `dependentsInYear` list (a missing list means none). Every child and
  // parent is assumed to have a valid Social Security number. Returns the credit pieces; taxFor
  // subtracts `nonrefundable + refundable` from the federal tax.
  // Ordering inside the combined credit (it only matters below the phase-out, where the tax limit
  // binds): the phase-out reduction comes off the CTC part first, the tax absorbs the nonrefundable
  // ODC first, and only the unused CTC can be refunded.
  export const CTC_PER_CHILD = 2200,
    CTC_REFUNDABLE_CAP = 1700,
    CTC_MAX_AGE = 16,
    ODC_PER_DEPENDENT = 500,
    CTC_PHASE_START = { mfj: 400000, single: 200000 },
    CTC_PHASE_STEP = 1000,
    CTC_PHASE_PER_STEP = 50,
    ACTC_EARNED_FLOOR = 2500,
    ACTC_RATE = 0.15;
  const NO_CHILD_CREDIT = { nonrefundable: 0, refundable: 0 };
  export function ordinaryTax(income, yearIndex, filing = 'mfj', deduction = standardDeduction(filing, yearIndex)) {
    const factor = taxIndexFactor(yearIndex);
    const baseBrackets = ORDINARY_BRACKETS[filingKey(filing, 'brackets')];
    let taxable = Math.max(0, income - deduction),
      tax = 0,
      prev = 0;
    for (const [cap, rate] of baseBrackets) {
      const ceiling = cap === Infinity ? Infinity : cap * factor;
      const slice = Math.min(taxable - prev, ceiling - prev);
      if (slice > 0) tax += slice * rate;
      if (taxable <= ceiling) break;
      prev = ceiling;
    }
    return tax;
  }
  export function longTermGainTax(gain, ordinary, yearIndex, filing = 'mfj', deduction = standardDeduction(filing, yearIndex)) {
    if (gain <= 0) return 0;
    const factor = taxIndexFactor(yearIndex),
      [zeroBase, fifteenBase] = GAIN_BANDS[filingKey(filing, 'gains')],
      zeroLimit = zeroBase * factor,
      fifteenLimit = fifteenBase * factor;
    // Any standard deduction left over after ordinary income also shelters
    // long-term gains/qualified dividends (taxable income is gains plus
    // ordinary income minus the deduction), which matters most for an early
    // retiree living mostly on dividends and realized gains.
    gain = Math.max(0, gain - Math.max(0, deduction - ordinary));
    if (gain <= 0) return 0;
    const ordinaryTaxable = Math.max(0, ordinary - deduction),
      zeroRoom = Math.max(0, zeroLimit - ordinaryTaxable),
      zeroGain = Math.min(gain, zeroRoom),
      fifteenGain = Math.min(
        Math.max(0, gain - zeroGain),
        Math.max(0, fifteenLimit - ordinaryTaxable - zeroGain),
      ),
      twentyGain = Math.max(0, gain - zeroGain - fifteenGain);
    return fifteenGain * 0.15 + twentyGain * 0.2;
  }
  export function childCredits(dependents, filing, yearIndex, magi, federalTax, earnedIncome) {
    if (!dependents || !dependents.length) return NO_CHILD_CREDIT;
    let ctcChildren = 0,
      otherDependents = 0;
    for (const d of dependents) {
      if (!d.qualifyingChild) continue;
      if (d.age <= CTC_MAX_AGE) ctcChildren++;
      else otherDependents++;
    }
    if (!ctcChildren && !otherDependents) return NO_CHILD_CREDIT;
    const factor = taxIndexFactor(yearIndex),
      excess = Math.max(0, magi - CTC_PHASE_START[filingKey(filing, 'ctc')]),
      reduction = Math.ceil(excess / CTC_PHASE_STEP - 1e-9) * CTC_PHASE_PER_STEP,
      ctcFull = CTC_PER_CHILD * factor * ctcChildren,
      ctcPart = Math.max(0, ctcFull - reduction),
      odcPart = Math.max(0, ODC_PER_DEPENDENT * otherDependents - Math.max(0, reduction - ctcFull)),
      nonrefundable = Math.min(ctcPart + odcPart, Math.max(0, federalTax)),
      refundable = Math.min(
        Math.max(0, ctcPart - Math.max(0, nonrefundable - odcPart)),
        CTC_REFUNDABLE_CAP * factor * ctcChildren,
        ACTC_RATE * Math.max(0, earnedIncome - ACTC_EARNED_FLOOR),
      );
    return { nonrefundable, refundable };
  }
  // The federal income tax liability a state may deduct: ordinary plus long-term-gain tax minus the nonrefundable child
  // credits, floored at zero, computed with a state tax of zero (the lagged pass: the federal itemizing test is the only
  // thing the real state tax could change). Not NIIT, payroll tax, Additional Medicare Tax or the refundable ACTC.
  function federalLiabilityForState(status, year, ages, ordinary, gains, propertyTax, mortgageInterest, dependents, earned, medical = 0, qbiBase = 0) {
    const deduction = federalDeduction(status, year, ages, ordinary + gains, 0, propertyTax, mortgageInterest, medical),
      // E1c: the qualified business income deduction, below AGI (0 for everyone without self-employment).
      qbi = qbiBase > 0 ? qbiDeduction(qbiBase, Math.max(0, ordinary + gains - deduction), gains, filingRow(status).joint, year) : 0,
      federal = ordinaryTax(ordinary, year, status, deduction + qbi) + longTermGainTax(gains, ordinary, year, status, deduction + qbi),
      credits = childCredits(dependents, status, year, ordinary + gains, federal, earned);
    return Math.max(0, federal - credits.nonrefundable);
  }
  export function qbiDeduction(qbi, taxable, netGain, joint, yearIndex) {
    if (!(qbi > 0)) return 0;
    const f = taxIndexFactor(yearIndex),
      threshold = (joint ? QBI_LIMITS.threshold.joint : QBI_LIMITS.threshold.other) * f,
      width = joint ? QBI_LIMITS.width.joint : QBI_LIMITS.width.other,
      ap = Math.min(1, Math.max(0, 1 - (taxable - threshold) / width)),
      d = Math.min(0.2 * qbi * ap * ap, 0.2 * Math.max(0, taxable - netGain));
    return ap * qbi >= QBI_LIMITS.minimumQbi * f ? Math.max(d, QBI_LIMITS.minimum * f) : d;
  }
  export function taxFor(profile, gains = 0, traditionalExtra = 0) {
    // Annual dividends/interest (profile.invOrd ordinary, profile.invQual
    // qualified) are household-level and taxed every year; qualified
    // dividends stack with realized gains at long-term rates and, like
    // ordinary interest, count toward provisional income and NIIT.
    const invOrd = Math.max(0, profile.invOrd || 0);
    gains += Math.max(0, profile.invQual || 0);
    const dependents = profile.dependents || NO_DEPENDENTS,
      propertyTax = profile.propertyTax || 0,
      rent = profile.rent || 0,
      // Not-earned income streams ride in their owner's slot of `other` (E1b); the state taxes them as wages.
      extraA = profile.extraA || 0,
      extraB = profile.extraB || 0,
      seOn = profile.seOn === true,
      // E1d: a year with a taxable one-time gain (buildTaxProfile; a profile built elsewhere has no flag: no lump). The
      // lump gain is added inside each branch, never here beside invQual (the two-filer branch splits `gains` 50/50).
      lumpOn = profile.lumpOn === true,
      // E1e: the profile carries an inherited account (always set in an inherited run; spec 6.3).
      inhOn = profile.inhOn === true,
      // One lookup: a state with no income tax (or an unknown code) skips building the inputs; only a row that
      // deducts federal income tax pays for the extra (lagged) federal pass.
      stateRule = stateRuleFor(state.stateTax),
      stateOn = !!stateRule && !stateRule.noTax,
      lagged = stateOn && stateRule.lagged !== null,
      perPerson = stateOn && stateRule.needsPerPerson;
    // E1c: self-employment net rides in other; the state taxes it as wages, and it is earned income for the ACTC. The fields
    // (and every term built from them below) are read only when the profile has self-employment (profile.seOn, set by
    // buildTaxProfile); every term is skipped, not added as a zero, so a household without it pays one test per call.
    let seNetA = 0, seNetB = 0, seEarnedA = 0, seEarnedB = 0,
      // the self-employed health insurance deduction (162(l)), above the line on the owner's return
      seHA = 0, seHB = 0,
      // the QBI base (profit less half the SE tax and the plan money), before 162(l)
      sePlanNetA = 0, sePlanNetB = 0;
    if (seOn) {
      seNetA = profile.seNetA || 0;
      seNetB = profile.seNetB || 0;
      seEarnedA = profile.seEarnedA || 0;
      seEarnedB = profile.seEarnedB || 0;
      seHA = profile.seHealthA || 0;
      seHB = profile.seHealthB || 0;
      sePlanNetA = profile.sePlanNetA || 0;
      sePlanNetB = profile.sePlanNetB || 0;
    }
    // Taxable brokerage gains and additional traditional distributions can
    // increase provisional income, so calculate taxable SS only after the
    // year's withdrawal amounts are known.
    if (filingRow(profile.filing).joint) {
      // E1d: the year's lump gains join the branch's gains once, so every reader below sees them.
      if (lumpOn) gains += profile.lumpGainA + profile.lumpGainB;
      // The household's other income net of the 162(l) deduction, read once (both sums below start with it).
      let otherAB = seOn ? profile.otherA + profile.otherB - (seHA + seHB) : profile.otherA + profile.otherB;
      // E1e: the last-resort inherited draws of the pass (the scheduled draw is already in otherA/B).
      if (inhOn) otherAB += profile.inhExtraA + profile.inhExtraB;
      const other = otherAB + gains + traditionalExtra + invOrd;
      const taxableSS = taxableSocialSecurity(profile.ssA + profile.ssB, other, 'mfj');
      const ordinary = otherAB + traditionalExtra + invOrd + taxableSS;
      let sources = null;
      if (stateOn) {
        sources = SOURCES_JOINT;
        sources.wages = profile.wageA + profile.wageB + invOrd + (extraA + extraB);
        if (seOn) sources.wages += seNetA - seHA + (seNetB - seHB);
        sources.pension = profile.pensionA + profile.pensionB;
        sources.retirement = profile.rmdA + profile.rmdB + traditionalExtra;
        sources.gains = gains;
        sources.taxableSS = taxableSS;
        sources.ages[0] = profile.ageA;
        sources.ages[1] = profile.ageB;
        if (perPerson) {
          // Per-person amounts: the discretionary traditional draw follows each partner's share
          // of the pool in the year (the account ledger).
          const shareA = profile.ownerShareA === undefined ? 0.5 : profile.ownerShareA;
          sources.pensionA = profile.pensionA;
          sources.pensionB = profile.pensionB;
          sources.retirementA = profile.rmdA + traditionalExtra * shareA;
          sources.retirementB = profile.rmdB + traditionalExtra * (1 - shareA);
          sources.retirement401kA = sources.retirementA * (profile.k401FracA || 0);
          sources.retirement401kB = sources.retirementB * (profile.k401FracB || 0);
          sources.ssBenefitsA = profile.ssA;
          sources.ssBenefitsB = profile.ssB;
          // Per-person Social Security: each partner's benefits, and the taxable part split in proportion.
          sources.taxableSSA = profile.ssA + profile.ssB > 0 ? (taxableSS * profile.ssA) / (profile.ssA + profile.ssB) : 0;
          sources.taxableSSB = profile.ssA + profile.ssB > 0 ? (taxableSS * profile.ssB) / (profile.ssA + profile.ssB) : 0;
        }
        sources.federalTax = !lagged ? 0 : federalLiabilityForState('mfj', profile.year, [profile.ageA, profile.ageB], ordinary, gains, profile.propertyTax || 0, profile.mortgageInterest || 0, profile.dependents, profile.wageA + profile.wageB + (seEarnedA + seEarnedB), profile.medicalExpense || 0, sePlanNetA + sePlanNetB - seHA - seHB);
        sources.ssBenefits = profile.ssA + profile.ssB;
        sources.dependents = dependents;
        sources.propertyTax = propertyTax;
        sources.rent = rent;
        // E1e: written on every call (the scratch object is reused); read only when sources.inherited > 0.
        if (inhOn) {
          sources.inheritedA = profile.inheritedA + profile.inhExtraA;
          sources.inheritedB = profile.inheritedB + profile.inhExtraB;
          sources.inherited = sources.inheritedA + sources.inheritedB;
          sources.inheritedExclA = profile.inhExclA;
          sources.inheritedExclB = profile.inhExclB;
        } else {
          sources.inherited = 0;
          sources.inheritedA = 0;
          sources.inheritedB = 0;
          sources.inheritedExclA = 0;
          sources.inheritedExclB = 0;
        }
      }
      const stateTaxPaid = stateIncomeTax(sources, 'mfj', profile.year),
        deduction = federalDeduction(
          'mfj',
          profile.year,
          [profile.ageA, profile.ageB],
          ordinary + gains,
          stateTaxPaid,
          profile.propertyTax || 0,
          profile.mortgageInterest || 0,
          profile.medicalExpense || 0,
        ),
        // E1c: the QBI deduction, one for the joint return, below the federal deduction (only with self-employment).
        deductionQ =
          seOn && sePlanNetA + sePlanNetB > 0
            ? deduction + qbiDeduction(sePlanNetA - seHA + (sePlanNetB - seHB), Math.max(0, ordinary + gains - deduction), gains, true, profile.year)
            : deduction;
      const federal =
        ordinaryTax(ordinary, profile.year, 'mfj', deductionQ) +
        longTermGainTax(gains, ordinary, profile.year, 'mfj', deductionQ);
      const credits = childCredits(profile.dependents, 'mfj', profile.year, ordinary + gains, federal, seOn ? profile.wageA + profile.wageB + (seEarnedA + seEarnedB) : profile.wageA + profile.wageB);
      return (
        federal - credits.nonrefundable - credits.refundable +
        stateTaxPaid +
        // E1d: an active-business lump gain is not net investment income: IRC 1411(c)(1)(A)(iii) (gain on property held in an active trade or business), with 1411(c)(4) for the partnership and S-corporation look-through; it stays in the MAGI.
        niitTax(ordinary + gains, lumpOn ? gains + invOrd - (profile.lumpGainNoNiitA + profile.lumpGainNoNiitB) : gains + invOrd, 'mfj')
      );
    }
    // Everyone who is not on a joint return is one person (single, head of household or a
    // qualifying surviving spouse), or, in the last branch, two separate filers.
    const status = FILING[profile.filing] && profile.filing !== 'mfj' ? profile.filing : 'single';
    if (profile.singlePerson) {
      // E1d: the year's lump gains join the branch's gains once, so every reader below sees them.
      if (lumpOn) gains += profile.lumpGainA + profile.lumpGainB;
      let otherA1 = seOn ? profile.otherA - seHA : profile.otherA;
      if (inhOn) otherA1 += profile.inhExtraA;
      const taxableSS = taxableSocialSecurity(
        profile.ssA,
        otherA1 + gains + traditionalExtra + invOrd,
        status,
      );
      const ordinary = otherA1 + traditionalExtra + invOrd + taxableSS;
      let sources = null;
      if (stateOn) {
        sources = SOURCES_SINGLE;
        sources.wages = profile.wageA + invOrd + extraA;
        if (seOn) sources.wages += seNetA - seHA;
        sources.pension = profile.pensionA;
        sources.retirement = profile.rmdA + traditionalExtra;
        sources.gains = gains;
        sources.taxableSS = taxableSS;
        sources.ages[0] = profile.ageA;
        if (perPerson) {
          sources.pensionA = profile.pensionA;
          sources.pensionB = 0;
          sources.retirementA = profile.rmdA + traditionalExtra;
          sources.retirementB = 0;
          sources.retirement401kA = sources.retirementA * (profile.k401FracA || 0);
          sources.retirement401kB = 0;
          sources.ssBenefitsA = profile.ssA;
          sources.ssBenefitsB = 0;
          sources.taxableSSA = taxableSS;
          sources.taxableSSB = 0;
        }
        sources.federalTax = !lagged ? 0 : federalLiabilityForState(status, profile.year, [profile.ageA], ordinary, gains, profile.propertyTax || 0, profile.mortgageInterest || 0, profile.dependents, profile.wageA + seEarnedA, profile.medicalExpense || 0, sePlanNetA - seHA);
        sources.ssBenefits = profile.ssA;
        sources.dependents = dependents;
        sources.propertyTax = propertyTax;
        sources.rent = rent;
        if (inhOn) {
          sources.inheritedA = profile.inheritedA + profile.inhExtraA;
          sources.inheritedB = 0;
          sources.inherited = sources.inheritedA;
          sources.inheritedExclA = profile.inhExclA;
          sources.inheritedExclB = 0;
        } else {
          sources.inherited = 0;
          sources.inheritedA = 0;
          sources.inheritedB = 0;
          sources.inheritedExclA = 0;
          sources.inheritedExclB = 0;
        }
      }
      const stateTaxPaid = stateIncomeTax(sources, status, profile.year),
        deduction = federalDeduction(
          status,
          profile.year,
          [profile.ageA],
          ordinary + gains,
          stateTaxPaid,
          profile.propertyTax || 0,
          profile.mortgageInterest || 0,
          profile.medicalExpense || 0,
        ),
        deductionQ =
          seOn && sePlanNetA > 0
            ? deduction + qbiDeduction(sePlanNetA - seHA, Math.max(0, ordinary + gains - deduction), gains, false, profile.year)
            : deduction;
      const federal =
        ordinaryTax(ordinary, profile.year, status, deductionQ) +
        longTermGainTax(gains, ordinary, profile.year, status, deductionQ);
      const credits = childCredits(profile.dependents, status, profile.year, ordinary + gains, federal, seOn ? profile.wageA + seEarnedA : profile.wageA);
      return (
        federal - credits.nonrefundable - credits.refundable +
        stateTaxPaid +
        niitTax(ordinary + gains, lumpOn ? gains + invOrd - (profile.lumpGainNoNiitA + profile.lumpGainNoNiitB) : gains + invOrd, status)
      );
    }
    // Partner A claims the children (owner decision), so A's return is head of household
    // while a qualifying child exists; B's is single.
    const statusA = returnStatusA(profile.dependents);
    const halfProperty = propertyTax / 2,
      halfRent = rent / 2;
    // The discretionary traditional draw follows each partner's share of the pool in the year (the
    // account ledger; an even split when the profile carries none), so each separate return is taxed
    // on the money that comes out of that partner's own accounts.
    const shareA = profile.ownerShareA === undefined ? 0.5 : profile.ownerShareA;
    let gainA = gains / 2,
      gainB = gains / 2;
    const tradA = traditionalExtra * shareA,
      tradB = traditionalExtra * (1 - shareA),
      invA = invOrd / 2,
      invB = invOrd / 2;
    // E1d: each owner's lump gain on their own return.
    if (lumpOn) {
      gainA += profile.lumpGainA;
      gainB += profile.lumpGainB;
    }
    let otherA2 = seOn ? profile.otherA - seHA : profile.otherA,
      otherB2 = seOn ? profile.otherB - seHB : profile.otherB;
    if (inhOn) {
      otherA2 += profile.inhExtraA;
      otherB2 += profile.inhExtraB;
    }
    const taxableSSA = taxableSocialSecurity(
      profile.ssA,
      otherA2 + gainA + tradA + invA,
      statusA,
    );
    const taxableSSB = taxableSocialSecurity(
      profile.ssB,
      otherB2 + gainB + tradB + invB,
      'single',
    );
    const ordinaryA = otherA2 + tradA + invA + taxableSSA,
      ordinaryB = otherB2 + tradB + invB + taxableSSB;
    let sourcesA = null,
      sourcesB = null;
    if (stateOn) {
      sourcesA = SOURCES_A;
      sourcesA.wages = profile.wageA + invA + extraA;
      if (seOn) sourcesA.wages += seNetA - seHA;
      sourcesA.pension = profile.pensionA;
      sourcesA.retirement = profile.rmdA + tradA;
      sourcesA.gains = gainA;
      sourcesA.taxableSS = taxableSSA;
      sourcesA.ages[0] = profile.ageA;
      if (perPerson) {
        sourcesA.pensionA = profile.pensionA;
        sourcesA.pensionB = 0;
        sourcesA.retirementA = profile.rmdA + tradA;
        sourcesA.retirementB = 0;
        sourcesA.retirement401kA = sourcesA.retirementA * (profile.k401FracA || 0);
        sourcesA.retirement401kB = 0;
        sourcesA.ssBenefitsA = profile.ssA;
        sourcesA.ssBenefitsB = 0;
        sourcesA.taxableSSA = taxableSSA;
        sourcesA.taxableSSB = 0;
      }
      sourcesA.federalTax = !lagged ? 0 : federalLiabilityForState(statusA, profile.year, [profile.ageA], ordinaryA, gainA, halfProperty, (profile.mortgageInterest || 0) / 2, profile.dependents, profile.wageA + seEarnedA, (profile.medicalExpense || 0) / 2, sePlanNetA - seHA);
      sourcesA.ssBenefits = profile.ssA;
      sourcesA.dependents = dependents;
      sourcesA.propertyTax = halfProperty;
      sourcesA.rent = halfRent;
      // E1e: each return's own draw in its slot A (as retirementA is filled for B's return).
      if (inhOn) {
        sourcesA.inheritedA = profile.inheritedA + profile.inhExtraA;
        sourcesA.inherited = sourcesA.inheritedA;
        sourcesA.inheritedExclA = profile.inhExclA;
      } else {
        sourcesA.inherited = 0;
        sourcesA.inheritedA = 0;
        sourcesA.inheritedExclA = 0;
      }
      sourcesA.inheritedB = 0;
      sourcesA.inheritedExclB = 0;
      sourcesB = SOURCES_B;
      sourcesB.wages = profile.wageB + invB + extraB;
      if (seOn) sourcesB.wages += seNetB - seHB;
      sourcesB.pension = profile.pensionB;
      sourcesB.retirement = profile.rmdB + tradB;
      sourcesB.gains = gainB;
      sourcesB.taxableSS = taxableSSB;
      sourcesB.ages[0] = profile.ageB;
      if (perPerson) {
        // Partner B's own return: the slot a one-person return reads is A.
        sourcesB.pensionA = profile.pensionB;
        sourcesB.pensionB = 0;
        sourcesB.retirementA = profile.rmdB + tradB;
        sourcesB.retirementB = 0;
        sourcesB.retirement401kA = sourcesB.retirementA * (profile.k401FracB || 0);
        sourcesB.retirement401kB = 0;
        sourcesB.ssBenefitsA = profile.ssB;
        sourcesB.ssBenefitsB = 0;
        sourcesB.taxableSSA = taxableSSB;
        sourcesB.taxableSSB = 0;
      }
      sourcesB.federalTax = !lagged ? 0 : federalLiabilityForState('single', profile.year, [profile.ageB], ordinaryB, gainB, halfProperty, (profile.mortgageInterest || 0) / 2, NO_DEPENDENTS, profile.wageB + seEarnedB, (profile.medicalExpense || 0) / 2, sePlanNetB - seHB);
      sourcesB.ssBenefits = profile.ssB;
      sourcesB.dependents = NO_DEPENDENTS;
      sourcesB.propertyTax = halfProperty;
      sourcesB.rent = halfRent;
      if (inhOn) {
        sourcesB.inheritedA = profile.inheritedB + profile.inhExtraB;
        sourcesB.inherited = sourcesB.inheritedA;
        sourcesB.inheritedExclA = profile.inhExclB;
      } else {
        sourcesB.inherited = 0;
        sourcesB.inheritedA = 0;
        sourcesB.inheritedExclA = 0;
      }
      sourcesB.inheritedB = 0;
      sourcesB.inheritedExclB = 0;
    }
    // Two separate returns: the household's property tax and deductible mortgage
    // interest are split 50/50 between them, and each return picks its own
    // standard-or-itemized deduction.
    const stateTaxA = stateIncomeTax(sourcesA, statusA, profile.year),
      stateTaxB = stateIncomeTax(sourcesB, 'single', profile.year),
      halfInterest = (profile.mortgageInterest || 0) / 2,
      halfMedical = (profile.medicalExpense || 0) / 2,
      deductionA0 = federalDeduction(statusA, profile.year, [profile.ageA], ordinaryA + gainA, stateTaxA, halfProperty, halfInterest, halfMedical),
      deductionB0 = federalDeduction('single', profile.year, [profile.ageB], ordinaryB + gainB, stateTaxB, halfProperty, halfInterest, halfMedical);
    // E1c: each return's own QBI deduction, below its federal deduction (only with self-employment).
    const deductionA =
        seOn && sePlanNetA > 0
          ? deductionA0 + qbiDeduction(sePlanNetA - seHA, Math.max(0, ordinaryA + gainA - deductionA0), gainA, false, profile.year)
          : deductionA0,
      deductionB =
        seOn && sePlanNetB > 0
          ? deductionB0 + qbiDeduction(sePlanNetB - seHB, Math.max(0, ordinaryB + gainB - deductionB0), gainB, false, profile.year)
          : deductionB0;
    // The child credits go on Partner A's return (A claims the children). Computed only when
    // there are children, and subtracted last, so the no-children sum keeps its exact order.
    let creditA = 0;
    if (profile.dependents && profile.dependents.length) {
      const federalA =
        ordinaryTax(ordinaryA, profile.year, statusA, deductionA) +
        longTermGainTax(gainA, ordinaryA, profile.year, statusA, deductionA);
      const c = childCredits(profile.dependents, statusA, profile.year, ordinaryA + gainA, federalA, seOn ? profile.wageA + seEarnedA : profile.wageA);
      creditA = c.nonrefundable + c.refundable;
    }
    return (
      ordinaryTax(ordinaryA, profile.year, statusA, deductionA) +
      ordinaryTax(ordinaryB, profile.year, 'single', deductionB) +
      longTermGainTax(gainA, ordinaryA, profile.year, statusA, deductionA) +
      longTermGainTax(gainB, ordinaryB, profile.year, 'single', deductionB) +
      stateTaxA +
      stateTaxB +
      niitTax(ordinaryA + gainA, lumpOn ? gainA + invA - profile.lumpGainNoNiitA : gainA + invA, statusA) +
      niitTax(ordinaryB + gainB, lumpOn ? gainB + invB - profile.lumpGainNoNiitB : gainB + invB, 'single') -
      creditA
    );
  }
  export function selfEmploymentTax(se, ssWages, yearIndex, out) {
    const ne = 0.9235 * se;
    if (!(ne >= 400)) {
      out.tax = 0; out.half = 0; out.ne = 0;
      return out;
    }
    out.tax = 0.124 * Math.min(ne, Math.max(0, SS_WAGE_BASE * taxIndexFactor(yearIndex) - ssWages)) + 0.029 * ne;
    out.half = out.tax / 2;
    out.ne = ne;
    return out;
  }
  function wageFica(wages, yearIndex) {
    const f = taxIndexFactor(yearIndex);
    return Math.min(wages, SS_WAGE_BASE * f) * 0.062 + wages * 0.0145;
  }
  // Employee-side payroll tax on this year's wages (Social Security + Medicare
  // per partner, wages net of pre-tax health premiums) plus the 0.9% Additional
  // Medicare Tax. Separate from taxFor(), which covers income tax.
  export function payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, filing, year, streamWagesA = 0, streamWagesB = 0, streamPremiumA = 0, streamPremiumB = 0, seTaxA = 0, seTaxB = 0, seNeA = 0, seNeB = 0 }) {
    const taxableWagesA = Math.max(0, wageA - healthPremiumA) + Math.max(0, streamWagesA - streamPremiumA),
      taxableWagesB = Math.max(0, wageB - healthPremiumB) + Math.max(0, streamWagesB - streamPremiumB);
    return (
      wageFica(taxableWagesA, year) +
      wageFica(taxableWagesB, year) +
      seTaxA +
      seTaxB +
      additionalMedicareTax(taxableWagesA + seNeA, taxableWagesB + seNeB, filing)
    );
  }
