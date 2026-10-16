import { pct } from '../../shared/core/basics.js';
import { dependentsInYear, NO_DEPENDENTS, qualifyingChildCount } from '../../shared/core/lists-and-children.js';
import { state } from '../../shared/core/store.js';
import { taxIndexFactor } from '../../shared/core/tax-index-factor.js';
import { medicalGrowth } from '../../shared/core/year-factors.js';
import { acaExpectedPct, acaHouseholdSize } from './aca-and-magi-iteration.js';
import { magiCapLeft } from './after-tax-value.js';
import { FILING, filingKey, filingRow, GAIN_BANDS, ORDINARY_BRACKETS, SENIOR_DEDUCTION_LAST_YEAR, SENIOR_PHASE_START, STD_DEDUCTION, STD_EXTRA_65, taxYearOf } from './federal-deductions.js';
import { irmaaAppealWindow } from './irmaa-appeal-table.js';
import { bracketCeilingReal, irmaaLookbackFiling, irmaaLookbackMagi, irmaaLookbackSplit, irmaaSsOf, returnStatusA } from './irmaa-lookback.js';
import { IRMAA_TIERS } from './irmaa-tiers.js';
import { itemizedDeduction, MEDICAL_FLOOR_PCT, seniorDeduction } from './itemized-deduction.js';
import { LAMBDA_PROFILE } from './lambda-profile.js';
import { magiForIrmaaLine } from './magi-for-irmaa-line.js';
import { hasChildAtMost, MEDICAID_RULES, medicaidLimit } from './medicaid-rules.js';
import { QBI_LIMITS, SOURCES_A, SOURCES_B, SOURCES_JOINT, SOURCES_SINGLE } from './new-state-sources.js';
import { niitTax, rmdDivisor, rmdStartAge } from './niit-and-rmd.js';
import { additionalMedicareTax } from './payroll-and-plan-limits.js';
import { ACTC_EARNED_FLOOR, ACTC_RATE, CTC_MAX_AGE, CTC_PER_CHILD, CTC_PHASE_PER_STEP, CTC_PHASE_START, CTC_PHASE_STEP, CTC_REFUNDABLE_CAP, NO_CHILD_CREDIT, ODC_PER_DEPENDENT, taxableSocialSecurity } from './social-security-and-child-credits.js';
import { LAMBDA_MAX, NO_THRESHOLDS, SOLVER_LAMBDA_MULT, TAU_GAIN_MAX } from './solver-lambda-mult.js';
import { SS_WAGE_BASE } from './ss-wage-base.js';
import { compileStateRule, countAtLeast, countQualifyingChildren, graduatedTax, INH_DECEDENT, INH_EXEMPT, NO_AGES, SS_AGI_TESTED, SS_EXEMPT, SS_PHASE, SS_SHARE, SS_SUBTRACTION, SS_TIERED, stateBenefitRecapture, stateCreditAmount, stateFederalTaxAllowance, statePhasedDeduction, stateRetirementExclusion, stateRuleCache, stateStepValue } from './state-rules.js';
import { currentYear } from './tax-year.js';
import { testHooks } from './test-hooks.js';
import { rothFreeCaps, tradGroup } from './trad-group.js';
import { accountsDrawGroup, accountsSetFromDollars, rothSlotApply, rothSlotSplit } from './withdrawal-mix-and-roth-accounts.js';

  export function standardDeduction(filing, yearIndex, ages = []) {
    const factor = taxIndexFactor(yearIndex);
    let deduction = STD_DEDUCTION[filingKey(filing, 'deduction')] * factor;
    const extra = STD_EXTRA_65[filingKey(filing, 'extraAge')] * factor;
    for (const a of ages) if (a >= 65) deduction += extra;
    return deduction;
  }
  // What one return deducts: the larger of the (age-adjusted) standard deduction
  // and the itemized total, plus the senior deduction on top of either. `agi` is
  // the return's income before the deduction (it stands in for MAGI).
  export function federalDeduction(filing, yearIndex, ages, agi, stateTaxPaid, propertyTax, mortgageInterest, medical = 0) {
    let deduction = standardDeduction(filing, yearIndex, ages);
    if (stateTaxPaid > 0 || propertyTax > 0 || mortgageInterest > 0 || (medical > 0 && medical > MEDICAL_FLOOR_PCT * agi))
      deduction = Math.max(
        deduction,
        itemizedDeduction(yearIndex, agi, stateTaxPaid, propertyTax, mortgageInterest, medical),
      );
    return deduction + seniorDeduction(filing, yearIndex, ages, agi);
  }
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
  export function stateRuleFor(code) {
    let rule = stateRuleCache[code];
    if (rule === undefined) rule = stateRuleCache[code] = compileStateRule(code);
    return rule;
  }
  // E1e: the compiled rule in force in a projection year (stateIncomeTax's variant selection, for the once-a-year inherited setup).
  // This and the variant loop at the top of stateIncomeTax must select the same variant: change both together. (stateIncomeTax
  // keeps its own copy because it is the hot path; do not route it through this helper.)
  export function stateRuleForYear(yearIndex) {
    const rule = stateRuleFor(state.stateTax);
    if (!rule || !rule.variants) return rule;
    const taxYear = taxYearOf(yearIndex);
    for (let v = rule.variants.length - 1; v >= 0; v--) if (taxYear >= rule.variants[v].fromYear) return rule.variants[v];
    return rule;
  }
  export function stateIncomeTax(sources, filing, yearIndex) {
    let rule = stateRuleFor(state.stateTax);
    if (!rule || rule.noTax) return 0;
    // A scheduled change: the latest variant whose tax year has arrived replaces the base row.
    if (rule.variants) {
      const taxYear = taxYearOf(yearIndex);
      for (let v = rule.variants.length - 1; v >= 0; v--)
        if (taxYear >= rule.variants[v].fromYear) {
          rule = rule.variants[v];
          break;
        }
    }
    // Each family of parameters has its own indexing flag (rule.idx): states index some and not others.
    // A scheduled family holds statutory dollars of its base year, so it indexes from there (by.x = 0: plan start).
    const base = rule.anyIndexed ? taxIndexFactor(yearIndex) : 1,
      by = rule.baseYears,
      fBr = rule.idx.bracketsIndexed ? (by.br > currentYear ? base / taxIndexFactor(by.br - currentYear) : base) : 1,
      fSd = rule.idx.standardDeductionIndexed ? (by.sd > currentYear ? base / taxIndexFactor(by.sd - currentYear) : base) : 1,
      fEx = rule.idx.personalExemptionIndexed ? (by.ex > currentYear ? base / taxIndexFactor(by.ex - currentYear) : base) : 1,
      fCa = rule.idx.creditAmountsIndexed ? (by.ca > currentYear ? base / taxIndexFactor(by.ca - currentYear) : base) : 1,
      fCt = rule.idx.creditThresholdsIndexed ? (by.ct > currentYear ? base / taxIndexFactor(by.ct - currentYear) : base) : 1,
      fRe = rule.idx.retirementExclusionIndexed ? (by.re > currentYear ? base / taxIndexFactor(by.re - currentYear) : base) : 1,
      colKey = rule.statusAs[filing] || 'single',
      col = rule.cols[colKey],
      ordinaryNonSS = Math.max(0, sources.wages + sources.pension + sources.retirement),
      gains = Math.max(0, sources.gains),
      taxableSS = Math.max(0, sources.taxableSS);
    let includedGains = gains * rule.gainsIncluded;
    if (rule.gainsDeduction > 0) includedGains = Math.max(0, includedGains - rule.gainsDeduction * fSd);
    // E1e: an inherited traditional draw (spec 6.4). Every read sits inside this gate: test sources objects may lack the
    // fields, and a legacy call computes exactly today's doubles.
    const inh = sources.inherited > 0 ? sources.inherited : 0;
    let start = rule.ordinary ? (inh > 0 ? ordinaryNonSS + inh : ordinaryNonSS) + includedGains : includedGains,
      ssSubtraction = 0,
      ssSplit = null;
    if (rule.ss !== SS_EXEMPT) {
      start += taxableSS;
      if (rule.ss === SS_SUBTRACTION) {
        const senior = countAtLeast(sources.ages || [], rule.ssRule.seniorAge) > 0;
        ssSubtraction = senior ? taxableSS : Math.min(taxableSS, rule.ssRule.belowSeniorCap * fRe);
      } else if (rule.ss === SS_AGI_TESTED) {
        // Exempt below an AGI, otherwise only a share of the benefits received is taxed.
        ssSubtraction =
          start < rule.ssRule.exemptBelow[colKey] * fRe
            ? taxableSS
            : taxableSS - Math.min(taxableSS, rule.ssRule.taxedShareOfBenefits * (sources.ssBenefits || 0));
      } else if (rule.ss === SS_SHARE) {
        // A share of the taxable benefits is subtracted, from a step table of the AGI.
        ssSubtraction = taxableSS * stateStepValue(rule.ssRule.tables[colKey], start, rule.ssRule.inclusive, fRe);
      } else if (rule.ss === SS_PHASE) {
        // All of it below `start`, none at `end`, falling in a straight line between.
        const lo = rule.ssRule.start[colKey] * fRe,
          hi = rule.ssRule.end[colKey] * fRe;
        ssSubtraction = taxableSS * Math.min(1, Math.max(0, (hi - start) / (hi - lo)));
      } else if (rule.ss === SS_TIERED) {
        // Per filer, by the filer's own age: the highest tier reached applies; within it all of the filer's taxable
        // benefits while the AGI is at or under the tier's limit (none = no limit), otherwise at most `capOverLimit`.
        const ages = sources.ages || NO_AGES,
          tiers = rule.ssRule.tiers;
        ssSplit = [0, 0];
        for (let i = 0; i < 2; i++) {
          const age = ages[i];
          if (age === null || age === undefined) continue;
          let tier = null;
          for (let t = 0; t < tiers.length; t++) if (age >= tiers[t].minAge) tier = tiers[t];
          if (!tier) continue;
          const own = Math.max(0, (i === 0 ? sources.taxableSSA : sources.taxableSSB) || 0);
          ssSplit[i] = tier.agiLimit === null || start <= tier.agiLimit[colKey] * fRe ? own : Math.min(own, tier.capOverLimit * fRe);
        }
        ssSubtraction = ssSplit[0] + ssSplit[1];
      }
    }
    // Each filer's own Social Security subtraction, for a retirement cap it shares (the household's, in
    // proportion to the taxable benefits).
    if (ssSplit === null && rule.needsSsSplit && ssSubtraction > 0 && taxableSS > 0)
      ssSplit = [(ssSubtraction * (sources.taxableSSA || 0)) / taxableSS, (ssSubtraction * (sources.taxableSSB || 0)) / taxableSS];
    // `start` stands for the federal AGI; `agi` is the state's AGI after its own subtractions.
    let agi = start - ssSubtraction - stateRetirementExclusion(rule.retirement, sources, fRe, colKey, start, ssSplit, rule.inhKind);
    // E1e: the exempt and decedent kinds subtract here; the heir kinds went through the retirement exclusion above.
    if (inh > 0 && rule.ordinary) {
      if (rule.inhKind === INH_EXEMPT) agi -= inh;
      else if (rule.inhKind === INH_DECEDENT) agi -= Math.min(inh, sources.inheritedExclA + sources.inheritedExclB);
    }
    // The federal income tax paid (one lagged pass, see taxFor), as a subtraction from the state AGI.
    let federalAllowance = 0;
    if (rule.lagged !== null) {
      federalAllowance = stateFederalTaxAllowance(rule.lagged, colKey, agi, sources.federalTax || 0, fSd, fCt);
      if (rule.lagged.placement === 'subtraction') agi -= federalAllowance;
    }
    let exemption = col.exemption * fEx;
    if (rule.exemptionPhaseOut) {
      const p = rule.exemptionPhaseOut,
        over = agi - p.start[colKey] * fCt;
      if (over > 0)
        exemption = Math.max(0, exemption - (typeof p.step === 'number' ? p.step : p.step[colKey]) * fEx * Math.ceil(over / (p.width * fCt)));
    }
    // A straight-line exemption (New Mexico): each exemption (the filers' and `dependent` per qualifying child) loses `rate` dollars per
    // dollar of federal AGI over the start, none left at `full`.
    if (rule.exemptionLinear) {
      const p = rule.exemptionLinear,
        over = start - p.start[colKey] * fCt,
        pool = exemption + countQualifyingChildren(sources.dependents || NO_DEPENDENTS) * p.dependent * fEx;
      exemption = over > 0 ? pool * Math.max(0, 1 - (p.rate[colKey] * over) / (p.full * fEx)) : pool;
    }
    // The deduction: the federal standard deduction (a conforming state), or the state's own, phased by AGI.
    let deduction;
    if (rule.conformStd) {
      const ages = sources.ages || NO_AGES;
      deduction = standardDeduction(filing, yearIndex, rule.conformAge ? ages : NO_AGES);
      if (rule.conformSenior) deduction += seniorDeduction(filing, yearIndex, ages, start);
    } else {
      deduction = col.standard * fSd;
      if (rule.stdPhase) deduction = statePhasedDeduction(rule.stdPhase, colKey, deduction, agi, fSd, fCt);
    }
    if (federalAllowance > deduction && rule.lagged.placement === 'itemized') deduction = federalAllowance;
    // Gains with their own flat rate leave the bracketed base (the ordinary deduction does not offset them).
    const separateGains = rule.gainsRate === null && rule.gainsRates === null ? 0 : Math.min(includedGains, Math.max(0, agi));
    let taxable = agi - separateGains - deduction - exemption;
    if (rule.dependentExemption)
      taxable -= Math.max(0, countQualifyingChildren(sources.dependents || NO_DEPENDENTS) - rule.dependentSkip) * rule.dependentExemption * fEx;
    else if (rule.dependentTiers) {
      const kids = countQualifyingChildren(sources.dependents || NO_DEPENDENTS);
      if (kids) taxable -= kids * stateStepValue(rule.dependentTiers[colKey], agi, false, fCt) * fEx;
    }
    if (rule.seniorExemption) {
      const se = rule.seniorExemption,
        seniors = countAtLeast(sources.ages || NO_AGES, se.age);
      if (seniors) {
        let per = se.amount * fEx;
        if (se.phaseOut) {
          const rate = typeof se.phaseOut.rate === 'number' ? se.phaseOut.rate : se.phaseOut.rate[colKey];
          per = Math.max(0, per - rate * Math.max(0, (se.phaseOut.basis === 'federal' ? start : agi) - se.phaseOut.start[colKey] * fCt));
        }
        taxable -= seniors * per;
      }
    }
    const income = Math.max(0, taxable);
    let tax = rule.graduated ? graduatedTax(income, col.starts, col.rates, fBr) : income * rule.flatRate;
    if (separateGains > 0) {
      // Flat rate, or one rate per ordinary bracket applied to the gains stacked on top of the ordinary income (Montana).
      if (rule.gainsRates !== null)
        tax += graduatedTax(income + separateGains, col.starts, rule.gainsRates, fBr) - graduatedTax(income, col.starts, rule.gainsRates, fBr);
      else tax += separateGains * rule.gainsRate;
    }
    for (let i = 0; i < rule.additions.length; i++) {
      const a = rule.additions[i];
      const fa = a.indexed ? (by.ad > currentYear ? base / taxIndexFactor(by.ad - currentYear) : base) : 1; // each addition says whether its thresholds index
      if (a.kind === 'threshold')
        tax += Math.max(0, income - (typeof a.threshold === 'number' ? a.threshold : a.threshold[colKey]) * fa) * a.rate;
      else if (a.kind === 'agiStep') tax += stateStepValue(a.tables[colKey], agi, false, fa);
      else if (a.kind === 'benefitRecapture') tax = stateBenefitRecapture(a, colKey, col, agi, income, tax, fa);
    }
    if (rule.credits.length) {
      const ctx = { agi, fedAgi: start, income, tax, sources, fEx, fCa, fCt, filing };
      let remaining = tax,
        refundable = 0;
      for (let i = 0; i < rule.credits.length; i++) {
        const cr = rule.credits[i],
          amount = stateCreditAmount(cr, colKey, ctx);
        if (cr.refundable) refundable += amount;
        else remaining -= Math.min(amount, Math.max(0, remaining));
      }
      tax = remaining - refundable;
    }
    if (rule.localRate > 0) tax += income * rule.localRate;
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
  function fplForHousehold(size, yearIndex) {
    const factor = taxIndexFactor(yearIndex);
    return (15650 + (Math.max(1, size) - 1) * 5500) * factor;
  }
  export function acaNetCost(magi, householdSize, grossPremium, yearIndex) {
    if (grossPremium <= 0) return 0;
    const ratio = magi > 0 ? magi / fplForHousehold(householdSize, yearIndex) : 0;
    // Medicaid and the credit floor (O1). An adult under 65 at or below the state's Medicaid line is
    // eligible for Medicaid and cannot take the credit: $0 when enrolled, else the full premium (which
    // is also the price of failing the 2027 work requirement, a retired adult with no child 13 or
    // younger, who is barred from the credit as well). Below 100% there is no credit in any state.
    // The same 1e-9 tolerance as the 400% line below.
    const mcdLimit = medicaidLimit(state.stateTax);
    if (mcdLimit > 0 && ratio <= mcdLimit + 1e-9) {
      const R = MEDICAID_RULES.workRequirement,
        taxYear = taxYearOf(yearIndex);
      if (state.medicaidWhenEligible && (taxYear < R.fromYear || hasChildAtMost(taxYear, R.exemptChildMaxAge))) return 0;
      return grossPremium;
    }
    if (ratio < MEDICAID_RULES.ptcFloor - 1e-9) return grossPremium;
    // A conversion is sized to land exactly on the 400% line, so the comparison needs a tolerance
    // or a last-bit rounding difference between the two engines would decide the whole premium.
    if (!state.acaEnhanced && ratio > 4 + 1e-9) return grossPremium;
    const expected = (magi * acaExpectedPct(ratio, state.acaEnhanced)) / 100;
    return Math.min(grossPremium, Math.max(0, expected));
  }
  function irmaaTiers(filing, yearIndex) {
    const factor = taxIndexFactor(yearIndex);
    // [upper bound, monthly surcharge per enrolled partner, bound inclusive?].
    // CMS: the lower tiers read "greater than X, up to and including Y", but the
    // top tier starts AT $500,000 / $750,000 ("$500,000 or above"), so the
    // second-highest tier's bound is exclusive.
    return IRMAA_TIERS[filingKey(filing, 'irmaa')].map(([cap, amt, inclusive]) => [cap === Infinity ? Infinity : cap * factor, amt, inclusive]);
  }
  export function irmaaSurcharge(magi2yr, filing, yearIndex) {
    const tiers = irmaaTiers(filing, yearIndex);
    for (const [cap, amt, inclusive] of tiers)
      if (inclusive ? magi2yr <= cap : magi2yr < cap) return amt * 12;
    return tiers[tiers.length - 1][1] * 12;
  }
  // The highest MAGI that stays within magi0's current IRMAA tier (Infinity
  // if magi0 is already in the top tier, since there's no higher tier left
  // to protect against). An exclusive bound ("under $500,000") is one cent
  // below the bound itself.
  export function irmaaTierCeiling(magi0, filing, yearIndex) {
    const tiers = irmaaTiers(filing, yearIndex);
    for (const [cap, , inclusive] of tiers)
      if (inclusive ? magi0 <= cap : magi0 < cap) return cap === Infinity ? Infinity : inclusive ? cap : cap - 0.01;
    return Infinity;
  }
  // IRMAA is assessed on Medicare's MAGI: AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), which counts only the
  // TAXABLE part of Social Security. The engine's MAGI is the ACA's (26 U.S.C. 36B(d)(2)(B): all of Social Security), so
  // IRMAA amounts convert with irmaaMagiOf and IRMAA lines and caps are translated into the engine's MAGI with its exact
  // inverse. `ss` and `filing` are the return's own benefit and filing status in the year the MAGI is earned (irmaaSsOf,
  // returnStatusA). magi - ss is all other income, the otherIncome taxFor passes to taxableSocialSecurity. Tax-exempt
  // interest is not modeled (no input).
  export function irmaaMagiOf(magi, ss, filing) {
    return ss > 0 ? magi - ss + taxableSocialSecurity(ss, magi - ss, filing) : magi;
  }
  // The highest engine MAGI that keeps a single-tier return's IRMAA MAGI inside the tier engine MAGI m puts it in.
  function irmaaRoomFor(m, ss, st, year) {
    return magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(m, ss, st), 'single', year), ss, st);
  }
  // The conversion that fills ordinary income to the top of the `bracketPct` bracket (0: none), at most
  // maxAvailable. solveRothConversion above resolves the bracket (schedule, override or setting) and calls it.
  export function solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct) {
    if (maxAvailable <= 0 || bracketPct === 0) return 0;
    const factor = taxIndexFactor(yearIndex),
      filing = FILING[profile.filing] ? profile.filing : 'single',
      joint = filingRow(filing).joint;
    // Conservative lower bound on the deduction: age-adjusted standard, or the
    // property tax (under the SALT cap) plus mortgage interest if larger. State
    // income tax and the senior deduction depend on the conversion itself, so
    // they are left out (a slightly smaller deduction converts a bit less).
    const deduction = Math.max(
        standardDeduction(filing, yearIndex, joint ? [profile.ageA, profile.ageB] : [profile.ageA]),
        itemizedDeduction(yearIndex, 0, 0, profile.propertyTax || 0, profile.mortgageInterest || 0),
      ),
      targetGrossOrdinary = bracketCeilingReal(bracketPct, filing) * factor + deduction;
    const ordinaryAt = (conv) => {
      if (joint) {
        // E1c (decision 8c): AGI is lower by the 162(l) deduction; QBI is not seen by the fill.
        let other = profile.otherA + profile.otherB - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv;
        // E1e (decision 18): the pass's last-resort estimate, appended only when non-zero.
        if (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);
        const taxableSS = taxableSocialSecurity(profile.ssA + profile.ssB, other, filing);
        return other + taxableSS;
      }
      let other = profile.otherA + (profile.otherB || 0) - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv;
      if (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);
      const taxableSS = taxableSocialSecurity(profile.ssA + (profile.ssB || 0), other, filing);
      return other + taxableSS;
    };
    if (ordinaryAt(0) >= targetGrossOrdinary) return 0;
    let lo = 0,
      hi = maxAvailable;
    if (ordinaryAt(hi) <= targetGrossOrdinary) return hi;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (ordinaryAt(mid) < targetGrossOrdinary) lo = mid;
      else hi = mid;
    }
    return lo;
  }
  // Draw `targetNet` (after the tax and penalty the draw itself triggers) from a Roth bucket
  // holding `bucketBal`, updating the per-account ledgers. The pool `pool` (roth + bondRoth) is
  // split among the four accounts by `shares`; by default a draw comes out of every account pro
  // rata, each account applying its own ledger rule and status (rothSlotSplit). With `caps` (a
  // gross room per account, see rothFreeCaps) the draw comes only from those accounts, in
  // proportion to their room, and the share ledger follows; the bucket is then `caps`' total.
  // `dry` prices the draw without applying it. The taxable-earnings part is returned as `earn`
  // so the caller can add it to traditionalGross (ordinary income, and the MAGI lag); `penalty`
  // is the 10% early-withdrawal penalty, which the caller adds to earlyPenalty; `tax` is the
  // income tax the earnings add.
  export function rothDraw(R, shares, pool, bucketBal, targetNet, taxableGainGross, traditionalGross, profile, status, caps = null, dry = false) {
    const none = { gross: 0, net: 0, penalty: 0, earn: 0, tax: 0 };
    const capSum = caps ? caps.reduce((sum, c) => sum + c, 0) : 0,
      avail = caps ? capSum : bucketBal;
    if (targetNet > 0 && avail <= 0) return none;
    // A slightly negative target (the withdrawal bisections above overshoot by a fraction of a
    // cent) is handed back to the bucket.
    if (targetNet <= 0) {
      const gross = Math.min(avail, targetNet);
      return { gross, net: gross, penalty: 0, earn: 0, tax: 0 };
    }
    const dollars = shares.map((sh) => sh * pool);
    const weight = caps ? caps.map((c) => c / capSum) : shares;
    const pieces = (g) => {
      const sp = weight.map((w, i) => rothSlotSplit(R[i], i, dollars[i], g * w, status[i]));
      let base = 0,
        earn = 0;
      for (const x of sp) {
        base += x.penaltyBase;
        earn += x.earn;
      }
      return { sp, penalty: 0.1 * base, earn };
    };
    const apply = (sp, gross) => {
      if (dry) return;
      sp.forEach((x, i) => rothSlotApply(R[i], x));
      if (caps) {
        const d = dollars.map((dl, i) => dl - gross * weight[i]);
        accountsSetFromDollars(shares, d);
      }
    };
    // Everything comes out of penalty-free, tax-free money: dollar for dollar.
    const flat = Math.min(avail, targetNet),
      c0 = pieces(flat);
    if (c0.penalty === 0 && c0.earn === 0) {
      apply(c0.sp, flat);
      return { gross: flat, net: flat, penalty: 0, earn: 0, tax: 0 };
    }
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    const cost = (gross) => {
      const c = pieces(gross),
        tax = c.earn > 0 ? taxFor(profile, taxableGainGross, traditionalGross + c.earn) - baseTax : 0;
      return { ...c, tax, net: gross - tax - c.penalty };
    };
    let lo = 0,
      hi = Math.min(avail, targetNet * 6 + 1);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (cost(mid).net < targetNet) lo = mid;
      else hi = mid;
    }
    const gross = Math.min(avail, hi),
      c = cost(gross);
    apply(c.sp, gross);
    return { gross, net: c.net, penalty: c.penalty, earn: c.earn, tax: c.tax };
  }
  // Solves for how much must come out of the traditional balance so that,
  // net of the tax (and early-withdrawal penalty, if applicable) that
  // marginal withdrawal itself triggers, `targetNet` actually lands in
  // hand — the same bisection every withdrawal branch below needs (a
  // traditional withdrawal's own tax depends on its size, so the size
  // can't be solved for directly). Pulled out as a shared helper so the
  // mix/smoothed/default branches and the live greedy picker below don't
  // each carry their own copy of this loop.
  export function solveTraditionalForNet(
    traditionalBal,
    targetNet,
    taxableGainGross,
    traditionalGross,
    profile,
    penalizedFraction,
  ) {
    if (traditionalBal <= 0 || targetNet <= 0) return { fromTrad: 0, tradNet: 0, penalty: 0 };
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    let lo = 0,
      hi = Math.min(traditionalBal, targetNet * 6 + 1);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net =
          mid -
          (taxFor(profile, taxableGainGross, traditionalGross + mid) - baseTax) -
          mid * 0.1 * penalizedFraction;
      if (net < targetNet) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      penalty = fromTrad * 0.1 * penalizedFraction,
      tradNet =
        fromTrad - (taxFor(profile, taxableGainGross, traditionalGross + fromTrad) - baseTax) - penalty;
    return { fromTrad, tradNet, penalty };
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
  // The tax profile handed to taxFor() for the year, plus each partner's
  // "other" ordinary income (wages net of pre-tax contributions and premiums,
  // pension, distributions; not-earned income streams ride in their owner's slot,
  // W-2 stream wages join the owner's wages). The survivor period remaps the surviving partner into the A slot,
  // because taxFor()'s single-person branch reads only the A fields.
  export function buildTaxProfile({
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
        yr = stateRuleForYear(year),
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
            dependents: dependentsInYear(taxYearOf(year)),
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
            dependents: dependentsInYear(taxYearOf(year)),
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
  export function healthcareCost({
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
    const inflate = (amount) => amount * factor * medicalGrowth(year);
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
    if (state.acaEnabled && (acaEligibleA || acaEligibleB)) {
      if (twoReturns) {
        // Two tax households: A's includes the children A claims; each partner's half of the premium is
        // priced on their own MAGI and poverty line.
        const kids = qualifyingChildCount(taxYearOf(year));
        const ca = acaNetCost(magiA, 1 + kids, inflate(acaEligibleA ? state.healthcare / 2 : 0), year),
          cb = acaNetCost(magiB, 1, inflate(acaEligibleB ? state.healthcare / 2 : 0), year);
        healthcare = ca + cb;
        premA = ca;
        premB = cb;
      } else {
        const householdSize = acaHouseholdSize(singlePerson, isSurvivorPeriod, year);
        const grossPremium = sharedCost(state.healthcare, acaEligibleA, acaEligibleB);
        healthcare = acaNetCost(magiProxy, householdSize, grossPremium, year);
      }
      usesMagiEstimate = true;
    } else {
      // acaEligibleA/B already require age < 65, so this flat premium (ACA
      // modeling off, or both partners past 65) stops for a partner at 65;
      // Medicare below is what covers them from then on.
      healthcare = sharedCost(state.healthcare, acaEligibleA, acaEligibleB);
      if (twoReturns) {
        premA = inflate(acaEligibleA ? state.healthcare / 2 : 0);
        premB = inflate(acaEligibleB ? state.healthcare / 2 : 0);
      }
    }
    // Medicare starts at 65 for a partner without employer coverage (workingX here is employer coverage: a W-2 job still
    // worked, or a W-2 stream with a premium): a partner still working at 65
    // is assumed to stay on the employer plan (no late-enrollment penalty,
    // which is not modeled) and to enroll the year they stop working.
    const medicareEligibleA = age >= 65 && !workingA && !(isSurvivorPeriod && deceasedIsA),
      medicareEligibleB =
        !singlePerson && ageB >= 65 && !workingB && !(isSurvivorPeriod && deceasedIsB);
    healthcare += sharedCost(state.medicareYearly, medicareEligibleA, medicareEligibleB);
    if (twoReturns) {
      premA += inflate(medicareEligibleA ? state.medicareYearly / 2 : 0);
      premB += inflate(medicareEligibleB ? state.medicareYearly / 2 : 0);
    }
    // IRMAA applies only to partners actually on Medicare (see above), using the two-year lookback of Medicare's MAGI
    // (irmaaHistory: only the taxable part of Social Security) on the tiers of the lookback return's filing status (E3 decision
    // 1). A lookback year with two returns charges each person on their own MAGI against the single tiers.
    // E3 (spec 5.3): in an appeal window (appeal.eventA/B), a partner whose normal charge is above 0 is charged the lowest of
    // it, this year's MAGI (this pass's estimate: usesMagiEstimate) and, when the event's E was last year, last year's realized
    // MAGI; a candidate is used only when strictly lower. Year 0 without entered prior MAGIs is skipped: its stand-in already
    // reads this year's MAGI.
    const split = twoReturnHistory ? irmaaLookbackSplit(irmaaHistoryA, irmaaHistoryB, twoReturnHistory, year) : null,
      lookbackMagi = split ? 0 : irmaaLookbackMagi(irmaaHistory, year),
      lbFiling = split ? 'single' : irmaaLookbackFiling(irmaaFilingHistory, year, filing, deathYear, marriedAtDeath),
      canAppeal = appeal !== null && (year > 0 || state.irmaaPriorKnown);
    let appealA = -1,
      appealB = -1,
      inYearA = false,
      inYearB = false;
    if (medicareEligibleA) {
      let ia = irmaaSurcharge(split ? split[0] : lookbackMagi, lbFiling, year);
      const w = canAppeal && ia > 0 ? irmaaAppealWindow(appeal.eventA, year) : 0;
      if (w !== 0) {
        inYearA = true;
        usesMagiEstimate = true;
        testHooks.irmaaInYearCalls++;
        let best = ia;
        if (w === 2) {
          const s = year - 1,
            last = twoReturnHistory && twoReturnHistory[s] ? irmaaSurcharge(irmaaHistoryA[s], 'single', year) : irmaaSurcharge(irmaaHistory[s], irmaaFilingHistory[s], year);
          if (last < best) (best = last), (appealA = s);
        }
        const now = twoReturns ? irmaaSurcharge(irmaaMagiOf(magiA, ssA, irmaaStA), 'single', year) : irmaaSurcharge(irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year);
        if (now < best) (best = now), (appealA = year);
        ia = best;
      }
      healthcare += ia;
      if (twoReturns) premA += ia;
    }
    if (medicareEligibleB) {
      let ib = irmaaSurcharge(split ? split[1] : lookbackMagi, lbFiling, year);
      const w = canAppeal && ib > 0 ? irmaaAppealWindow(appeal.eventB, year) : 0;
      if (w !== 0) {
        inYearB = true;
        usesMagiEstimate = true;
        testHooks.irmaaInYearCalls++;
        let best = ib;
        if (w === 2) {
          const s = year - 1,
            last = twoReturnHistory && twoReturnHistory[s] ? irmaaSurcharge(irmaaHistoryB[s], 'single', year) : irmaaSurcharge(irmaaHistory[s], irmaaFilingHistory[s], year);
          if (last < best) (best = last), (appealB = s);
        }
        const now = twoReturns ? irmaaSurcharge(irmaaMagiOf(magiB, ssB, 'single'), 'single', year) : irmaaSurcharge(irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year);
        if (now < best) (best = now), (appealB = year);
        ib = best;
      }
      healthcare += ib;
      if (twoReturns) premB += ib;
    }
    const ltc = state.ltcEnabled
      ? (age >= state.ltcAgeA && !(isSurvivorPeriod && deceasedIsA) ? state.ltcYearlyA : 0) *
          factor * medicalGrowth(year) +
        (!singlePerson && ageB >= state.ltcAgeB && !(isSurvivorPeriod && deceasedIsB)
          ? state.ltcYearlyB
          : 0) *
          factor * medicalGrowth(year)
      : 0;
    return { healthcare, ltc, usesMagiEstimate, premA, premB, appealA, appealB, inYearA, inYearB };
  }
  // Highest MAGI a Roth conversion (and, in simulate(), the withdrawal order)
  // may reach this year without a cost cliff, or Infinity if nothing binds:
  //  - the 400%-FPL ACA subsidy cliff (non-enhanced ACA, for partners on the
  //    individual market), and
  //  - the next Medicare IRMAA tier. IRMAA is assessed two years later off
  //    this year's MAGI, so it only binds once a retired partner is within two
  //    years of 65 (or on Medicare); it keeps Medicare's MAGI (irmaaMagiOf: only
  //    the taxable part of Social Security, from `profile`) inside its current
  //    tier, translated back into the engine's MAGI (magiForIrmaaLine). The ACA
  //    line is on the engine's MAGI (the ACA definition).
  // preConvMagi is MAGI before any conversion, including the iteration's
  // estimate of this year's discretionary withdrawals.
  export function conversionMagiCeiling({
    acaEligibleA,
    acaEligibleB,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    deceasedIsB,
    workingA,
    workingB,
    age,
    ageB,
    preConvMagi,
    filing,
    year,
    twoReturns = false,
    preMagiA = 0,
    preMagiB = 0,
    shareA = 0.5,
    profile,
  }) {
    if (twoReturns) {
      // Each return keeps under its own lines. A conversion lands on the returns by the traditional-pool
      // share, so return X allows (line - its MAGI) / its share of the household conversion. (Two returns
      // never occur in the survivor period or single-person mode, so the household branch's survivor
      // guards are not needed here.)
      let room = Infinity;
      const kids = qualifyingChildCount(taxYearOf(year)),
        allow = (line, m, frac) => (frac > 0 ? Math.max(0, (line - m) / frac) : Infinity);
      if (state.acaEnabled && !state.acaEnhanced) {
        if (acaEligibleA) room = Math.min(room, allow(fplForHousehold(1 + kids, year) * 4, preMagiA, shareA));
        if (acaEligibleB) room = Math.min(room, allow(fplForHousehold(1, year) * 4, preMagiB, 1 - shareA));
      }
      const p = profile;
      if (!workingA && age >= 63) room = Math.min(room, allow(irmaaRoomFor(preMagiA, p.ssA || 0, returnStatusA(p.dependents), year), preMagiA, shareA));
      if (!workingB && ageB >= 63) room = Math.min(room, allow(irmaaRoomFor(preMagiB, p.ssB || 0, 'single', year), preMagiB, 1 - shareA));
      return preConvMagi + room;
    }
      let magiCeiling = Infinity;
      // Avoid the ACA subsidy cliff: once non-enhanced-mode MAGI crosses
      // 400% of the federal poverty line, the full premium is owed with
      // no phase-out, which can cost far more than a lower future tax
      // bracket is worth.
      // Only partners actually on the individual market (see
      // acaEligibility) are exposed to the subsidy cliff.
      if (state.acaEnabled && !state.acaEnhanced && (acaEligibleA || acaEligibleB)) {
        magiCeiling = Math.min(
          magiCeiling,
          fplForHousehold(acaHouseholdSize(singlePerson, isSurvivorPeriod, year), year) * 4,
        );
      }
      // Avoid crossing into the next Medicare IRMAA tier. IRMAA is
      // assessed two years later off this year's MAGI, so this only
      // matters once a currently-retired partner is within two years of
      // 65 (or already on Medicare); it keeps this year's MAGI within
      // whichever tier it already sits in.
      if (
        (!workingA && age >= 63 && !(isSurvivorPeriod && deceasedIsA)) ||
        (!singlePerson && !workingB && ageB >= 63 && !(isSurvivorPeriod && deceasedIsB))
      ) {
        const ssH = irmaaSsOf(profile);
        magiCeiling = Math.min(magiCeiling, magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(preConvMagi, ssH, filing), filing, year), ssH, filing));
      }
    return magiCeiling;
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
  // "Fill to the line": `gross` more from penalty-free traditional money (stocks, then bonds), the after-tax
  // proceeds kept as cash. Returns the gross drawn.
  export function fillTraditional(wd, gross) {
    const { bal } = wd;
    let left = gross;
    for (const bucket of ['traditional', 'bondTraditional']) {
      if (!(left > 0)) break;
      const { slots, share } = tradGroup(wd, false),
        from = Math.min(left, bal[bucket] * share);
      if (!(from > 0)) continue;
      const before = taxFor(wd.profile, wd.taxableGainGross, wd.traditionalGross);
      accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, from);
      bal[bucket] -= from;
      wd.traditionalGross += from;
      wd.traditionalWithdrawn += from;
      bal.cash += from - (taxFor(wd.profile, wd.taxableGainGross, wd.traditionalGross) - before);
      left -= from;
    }
    return gross - left;
  }
  // `bucket` is 'traditional' | 'bondTraditional'; `solver` picks the bisection bracket (see
  // solveTraditionalForNetFromNeed). Draws the penalty-free accounts only (no 10%); the penalized
  // ones are takePenalized's job. Every account holds the same stock/bond mix, so a group's room in a
  // bucket is its share of the pool times the bucket. `uncapped` ignores a MAGI cap (the bond reserve's draw in both
  // strategies: cash and bonds keep their place, so the cliff plan never reorders the reserve).
  export function takeTraditional(wd, bucket, amount, solver = solveTraditionalForNet, penalized = false, uncapped = false) {
    const { bal } = wd;
    const { slots, share } = tradGroup(wd, penalized);
    let cap = bal[bucket] * share;
    if (!penalized && !uncapped && wd.magiCap) cap = Math.min(cap, magiCapLeft(wd));
    if (!(cap > 0)) return 0;
    const { fromTrad, tradNet, penalty } = solver(
      cap,
      amount,
      wd.taxableGainGross,
      wd.traditionalGross,
      wd.profile,
      penalized ? 1 : 0,
    );
    accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, fromTrad);
    bal[bucket] -= fromTrad;
    wd.traditionalGross += fromTrad;
    wd.traditionalWithdrawn += fromTrad;
    if (!penalized && !uncapped) wd.cappableTraditional += fromTrad;
    wd.earlyPenalty += penalty;
    return tradNet;
  }
  // `bucket` is 'roth' | 'bondRoth'. Roth earnings count as ordinary income (traditionalGross)
  // when the draw is early. While penalized money exists only penalty-free Roth money is drawn
  // here (rothFreeCaps); `caps` overrides that (takePenalized).
  export function takeRoth(wd, bucket, amount, caps = null) {
    const { bal } = wd;
    if (!caps && wd.penaltyAware) caps = rothFreeCaps(wd, bucket);
    const d = rothDraw(
      wd.rothAccts,
      wd.accts.roth,
      bal.roth + bal.bondRoth,
      bal[bucket],
      amount,
      wd.taxableGainGross,
      wd.traditionalGross,
      wd.profile,
      wd.status,
      caps,
    );
    bal[bucket] -= d.gross;
    wd.rothWithdrawn += d.gross;
    wd.traditionalGross += d.earn;
    wd.earlyPenalty += d.penalty;
    return d.net;
  }
  // The penalized tier: only when every penalty-free source above is exhausted. Repeatedly takes the
  // cheapest source per gross dollar (income tax plus the 10%), probing each at the remaining need:
  // a penalized traditional account (tax plus 10% on the whole draw), a Roth 401(k) (the earnings share
  // only, pro rata), a Roth IRA (conversions inside their 5 years, 10% only; then earnings, tax plus
  // 10%). A tie goes to traditional, which keeps Roth growing tax-free. `solverStocks` is the
  // bisection bracket for traditional stock draws (bond draws always use solveTraditionalForNetFromNeed).
  // E1e (spec 6.6): the last resort. When the household's own money cannot meet the need, the inherited accounts are drawn: Roth rows first
  // (cash only), then traditional rows, oldest receipt first. A traditional draw is taxed exactly like a scheduled draw x larger: on the
  // owner's post-remap return, the state's inherited treatment, MAGI, never penalized. The profile fields (inhExtraS, and under a decedent
  // state inhExclS) stay at the realized values for the rest of the pass, so every later taxFor sees the draw.
  export function takeInherited(wd) {
    const inh = wd.inh;
    if (inh === null) return;
    testHooks.inhTakeCount++;
    if (!(wd.need > 0)) return;
    const { bal, profile } = wd;
    for (let i = 0; i < inh.n && wd.need > 0; i++) {
      if (!inh.roth[i] || inh.open[i] !== 1 || !(inh.bal[i] > 0)) continue;
      const x = Math.min(wd.need, inh.bal[i]);
      inh.bal[i] -= x;
      inh.lastResort[i] += x;
      bal.inheritedRoth -= x;
      wd.rothWithdrawn += x;
      wd.need -= x;
    }
    const decedent = !!wd.inhRule && wd.inhRule.inhKind === INH_DECEDENT;
    for (let i = 0; i < inh.n && wd.need > 0; i++) {
      if (inh.roth[i] || inh.open[i] !== 1 || !(inh.bal[i] > 0)) continue;
      const slotA = wd.inhPost[i] === 0,
        exKey = slotA ? 'inhExtraA' : 'inhExtraB',
        exclKey = slotA ? 'inhExclA' : 'inhExclB',
        ex0 = profile[exKey],
        excl0 = profile[exclKey],
        room = decedent ? Math.max(0, wd.inhRule.inhCap - inh.draw[i] - inh.lastResort[i]) : 0;
      const baseTax = taxFor(profile, wd.taxableGainGross, wd.traditionalGross);
      const netAt = (x) => {
        profile[exKey] = ex0 + x;
        if (decedent) profile[exclKey] = excl0 + Math.min(x, room);
        return x - (taxFor(profile, wd.taxableGainGross, wd.traditionalGross) - baseTax);
      };
      let lo = 0,
        hi = Math.min(inh.bal[i], 6 * wd.need + 1);
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (netAt(mid) < wd.need) lo = mid;
        else hi = mid;
      }
      const x = hi,
        net = netAt(x);
      if (slotA) wd.inheritedGrossA += x;
      else wd.inheritedGrossB += x;
      wd.traditionalWithdrawn += x;
      inh.lastResort[i] += x;
      inh.bal[i] -= x;
      bal.inheritedTrad -= x;
      wd.need = Math.max(0, wd.need - net);
    }
  }
  // Same job as solveTraditionalForNet, but bisecting from [need, 6*need + 1]
  // instead of [0, min(balance, 6*need + 1)]. The brackets converge to slightly
  // different values (~1e-7 relative), so both are kept until the numerics are
  // unified deliberately; the bond-reserve draw and the historical engine use
  // this one.
  export function solveTraditionalForNetFromNeed(traditionalBal, need, taxableGainGross, traditionalGross, profile, penalizedFraction) {
    if (traditionalBal <= 0 || need <= 0) return { fromTrad: 0, tradNet: 0, penalty: 0 };
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    let lo = need,
      hi = need * 6 + 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net =
          mid -
          (taxFor(profile, taxableGainGross, traditionalGross + mid) - baseTax) -
          mid * 0.1 * penalizedFraction;
      if (net < need) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      penalty = fromTrad * 0.1 * penalizedFraction,
      tradNet = fromTrad - (taxFor(profile, taxableGainGross, traditionalGross + fromTrad) - baseTax) - penalty;
    return { fromTrad, tradNet, penalty };
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
