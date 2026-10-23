// stateIncomeTax: the generic evaluator for STATE_RULES rows, with scratch sources

import { INH_DECEDENT, INH_EXEMPT, NO_AGES, SS_AGI_TESTED, SS_EXEMPT, SS_PHASE, SS_SHARE, SS_SUBTRACTION, SS_TIERED, STATE_RULES, SCHEDULE_FAMILIES, NO_BASE_YEARS, SS_TAXED, INH_CODE, INH_ORDINARY, INH_HEIR, INH_HEIR_ANY } from './state-rules.js';
import { taxYearOf, seniorDeduction, standardDeduction } from './federal-rules.js';
import { NO_DEPENDENTS } from '../../../shared/core/inputs/lists.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';

  export function stateRuleFor(code) {
    let rule = stateRuleCache[code];
    if (rule === undefined) rule = stateRuleCache[code] = compileStateRule(code);
    return rule;
  }
  // E1e: the compiled rule in force in a projection year (stateIncomeTax's variant selection, for the once-a-year inherited setup).
  // This and the variant loop at the top of stateIncomeTax must select the same variant: change both together. (stateIncomeTax
  // keeps its own copy because it is the hot path; do not route it through this helper.)
  export function stateRuleForYear(ctx, yearIndex) {
    const rule = stateRuleFor(ctx.inputs.stateTax);
    if (!rule || !rule.variants) return rule;
    const taxYear = taxYearOf(ctx, yearIndex);
    for (let v = rule.variants.length - 1; v >= 0; v--) if (taxYear >= rule.variants[v].fromYear) return rule.variants[v];
    return rule;
  }
  export function stateIncomeTax(ctx, sources, filing, yearIndex) {
    let rule = stateRuleFor(ctx.inputs.stateTax);
    if (!rule || rule.noTax) return 0;
    // A scheduled change: the latest variant whose tax year has arrived replaces the base row.
    if (rule.variants) {
      const taxYear = taxYearOf(ctx, yearIndex);
      for (let v = rule.variants.length - 1; v >= 0; v--)
        if (taxYear >= rule.variants[v].fromYear) {
          rule = rule.variants[v];
          break;
        }
    }
    // Each family of parameters has its own indexing flag (rule.idx): states index some and not others.
    // A scheduled family holds statutory dollars of its base year, so it indexes from there (by.x = 0: plan start).
    const base = rule.anyIndexed ? taxIndexFactor(ctx, yearIndex) : 1,
      by = rule.baseYears,
      cy = ctx.taxYear,
      fBr = rule.idx.bracketsIndexed ? (by.br > cy ? base / taxIndexFactor(ctx, by.br - cy) : base) : 1,
      fSd = rule.idx.standardDeductionIndexed ? (by.sd > cy ? base / taxIndexFactor(ctx, by.sd - cy) : base) : 1,
      fEx = rule.idx.personalExemptionIndexed ? (by.ex > cy ? base / taxIndexFactor(ctx, by.ex - cy) : base) : 1,
      fCa = rule.idx.creditAmountsIndexed ? (by.ca > cy ? base / taxIndexFactor(ctx, by.ca - cy) : base) : 1,
      fCt = rule.idx.creditThresholdsIndexed ? (by.ct > cy ? base / taxIndexFactor(ctx, by.ct - cy) : base) : 1,
      fRe = rule.idx.retirementExclusionIndexed ? (by.re > cy ? base / taxIndexFactor(ctx, by.re - cy) : base) : 1,
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
      deduction = standardDeduction(ctx, filing, yearIndex, rule.conformAge ? ages : NO_AGES);
      if (rule.conformSenior) deduction += seniorDeduction(ctx, filing, yearIndex, ages, start);
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
        let per = (typeof se.amount === 'number' ? se.amount : se.amount[colKey]) * fEx;
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
      const fa = a.indexed ? (by.ad > cy ? base / taxIndexFactor(ctx, by.ad - cy) : base) : 1; // each addition says whether its thresholds index
      if (a.kind === 'threshold')
        tax += Math.max(0, income - (typeof a.threshold === 'number' ? a.threshold : a.threshold[colKey]) * fa) * a.rate;
      else if (a.kind === 'agiStep') tax += stateStepValue(a.tables[colKey], agi, false, fa);
      else if (a.kind === 'benefitRecapture') tax = stateBenefitRecapture(a, colKey, col, agi, income, tax, fa);
    }
    if (rule.credits.length) {
      const cc = { agi, fedAgi: start, income, tax, sources, fEx, fCa, fCt, filing };
      let remaining = tax,
        refundable = 0;
      for (let i = 0; i < rule.credits.length; i++) {
        const cr = rule.credits[i],
          amount = stateCreditAmount(cr, colKey, cc);
        if (cr.refundable) refundable += amount;
        else remaining -= Math.min(amount, Math.max(0, remaining));
      }
      tax = remaining - refundable;
    }
    if (rule.localRate > 0) tax += income * rule.localRate;
    return tax;
  }
  // load-time: creates a null-prototype cache object; reads nothing
  // Each row is resolved once per state code into flat arrays (no allocation per call).
  const stateRuleCache = Object.create(null);
  function compileStateRule(code) {
    const row = STATE_RULES[code];
    if (!row) return null;
    const rule = compileRow(row);
    // Each variant builds on the one before it (a later change keeps an earlier one), and each family remembers
    // the base year of the latest variant that touched it.
    if (row.schedule.length) {
      let current = row;
      const years = { ...NO_BASE_YEARS };
      rule.variants = row.schedule.map((s) => {
        const { fromYear, baseYear, ...over } = s;
        current = { ...current, ...over, schedule: [] };
        for (const key of Object.keys(over)) for (const f of SCHEDULE_FAMILIES[key] || []) years[f] = baseYear === undefined ? fromYear : baseYear;
        const v = compileRow(current);
        v.fromYear = fromYear;
        v.baseYears = { ...years };
        return v;
      });
    }
    // taxFor builds the inputs before it knows the year, so the flag covers every variant.
    if (rule.variants && rule.variants.some((v) => v.needsPerPerson)) rule.needsPerPerson = true;
    return rule;
  }
  function compileRow(row) {
    const ik = row.inherited ? row.inherited.kind : 'ordinary';
    const cols = {};
    for (const key of ['single', 'mfj', 'hoh']) {
      if (row.standardDeduction[key] === undefined) continue;
      const brackets = row.tax.kind === 'graduated' ? row.tax.columns[key] : null;
      cols[key] = {
        standard: row.standardDeduction[key],
        exemption: row.exemption[key],
        starts: brackets && brackets.map((b) => b[0]),
        rates: brackets && brackets.map((b) => b[1]),
      };
    }
    const ss = row.base.socialSecurity,
      dep = row.dependentExemption,
      conform = row.federalConformity;
    return {
      noTax: row.tax.kind === 'none',
      idx: row.indexing,
      anyIndexed: Object.values(row.indexing).some(Boolean) || row.additions.some((a) => a.indexed),
      statusAs: row.statusAs,
      flatRate: row.tax.kind === 'flat' ? row.tax.rate : 0,
      graduated: row.tax.kind === 'graduated',
      additions: row.additions,
      ordinary: row.base.ordinary,
      gainsIncluded: row.base.gainsIncluded,
      ss:
        ss === 'taxed'
          ? SS_TAXED
          : typeof ss !== 'object'
            ? SS_EXEMPT
            : ss.kind === 'agiTested'
              ? SS_AGI_TESTED
              : ss.kind === 'ageAgiTiered'
                ? SS_TIERED
                : ss.kind === 'agiShare'
                  ? SS_SHARE
                  : ss.kind === 'agiPhaseOut'
                    ? SS_PHASE
                    : SS_SUBTRACTION,
      gainsRate: Array.isArray(row.base.gainsRate) ? null : row.base.gainsRate,
      gainsRates: Array.isArray(row.base.gainsRate) ? row.base.gainsRate : null,
      gainsDeduction: row.base.gainsDeduction,
      lagged: row.federalTaxSubtraction === 'none' ? null : row.federalTaxSubtraction,
      localRate: row.localTax === 'notModeled' ? 0 : row.localTax.rate,
      ssRule: typeof ss === 'object' ? ss : null,
      retirement: compileRetirement(row.retirementExclusion),
      inhKind: INH_CODE[ik],
      inhCap: ik === 'decedent' ? row.inherited.cap : 0,
      needsSsSplit: row.retirementExclusion.kind === 'perPerson' && row.retirementExclusion.reducedBy === 'socialSecuritySubtracted',
      // Whether the row reads the per-person inputs of the sources (pension, traditional draw, Social Security by partner).
      needsPerPerson: row.retirementExclusion.kind === 'perPerson' || (typeof ss === 'object' && ss.kind === 'ageAgiTiered'),
      exemptionPhaseOut: row.exemptionPhaseOut.kind === 'stepDown' ? row.exemptionPhaseOut : null,
      exemptionLinear: row.exemptionPhaseOut.kind === 'linear' ? row.exemptionPhaseOut : null,
      dependentExemption: typeof dep === 'number' ? dep : dep.kind === 'afterFirst' ? dep.amount : 0,
      dependentSkip: typeof dep !== 'number' && dep.kind === 'afterFirst' ? 1 : 0,
      dependentTiers: typeof dep === 'number' || dep.kind === 'afterFirst' ? null : dep.tables,
      seniorExemption: row.seniorExemption.kind === 'none' ? null : row.seniorExemption,
      stdPhase: row.standardDeductionPhase.kind === 'none' ? null : row.standardDeductionPhase,
      conformStd: conform.standardDeduction,
      conformAge: conform.ageAdditional,
      conformSenior: conform.seniorDeduction,
      credits: row.credits,
      cols,
      // Scheduled variants (see `schedule`); the base compiled row has none, and its div says nothing moves.
      variants: null,
      fromYear: 0,
      baseYears: NO_BASE_YEARS,
    };
  }
  // A per-person exclusion is flattened once (ages and caps in plain arrays, absent buckets as an age nobody reaches).
  function compileRetirement(ex) {
    if (ex.kind !== 'perPerson') return ex;
    return {
      kind: 'perPerson',
      pensionFrom: ex.applies.pension ? ex.pensionMinAge : Infinity,
      tradFrom: ex.applies.traditional ? ex.traditionalMinAge : Infinity,
      // Employer-plan (401(k)) money drawn after retirement is exempt at any age (Pennsylvania); see sources.retirement401kA/B.
      employerPlan: ex.applies.employerPlanAfterRetirement === true,
      // From the minimum age only employer-plan (401(k)) money qualifies, never an IRA (Rhode Island, PUB 2026-01); same 401(k) share.
      employerPlanOnly: ex.applies.employerPlanOnly === true,
      tierAges: ex.tiers.map((t) => t[0]),
      tierCaps: ex.tiers.map((t) => (t[1] === null ? Infinity : t[1])), // a number or { single, mfj, hoh }
      reducedBy: ex.reducedBy === 'benefitsReceived' ? 1 : ex.reducedBy === 'socialSecuritySubtracted' ? 2 : 0,
      share: ex.share,
    };
  }
  // Amount of pension and traditional-withdrawal income a state leaves out. Kinds read each filer's own pension and traditional
  // income: 'agiPhasedShare' (all of it times a share that falls with the AGI, from a step table) and 'perPerson':
  //   pensionMinAge / traditionalMinAge  the filer's age from which each bucket counts
  //   applies { pension, traditional }   which buckets the state lets in at all
  //   tiers [[minAge, cap|null], ...]    the cap is the highest tier the filer has reached (null: no
  //                                      limit); a filer under the first tier gets nothing
  //   reducedBy                          'none' | 'socialSecuritySubtracted' (the filer's own Social
  //                                      Security subtraction uses up the same cap: CO) |
  //                                      'benefitsReceived' (all the filer's benefits, taxable or not: ME)
  //   share                              null, or { inclusive, tables }: the total times a step-table
  //                                      value of the AGI (NJ-style, or ME's phase-out)
  // ssSplit is [A, B]: each filer's Social Security subtraction (the household's, in proportion to the
  // taxable benefits), or null.
  function stateRetirementExclusion(ex, sources, factor, colKey, agi, ssSplit, inhKind = INH_ORDINARY) {
    if (ex.kind === 'none') return 0;
    const ages = sources.ages || [];
    if (ex.kind === 'perPerson') {
      let total = 0;
      for (let i = 0; i < 2; i++) {
        const age = ages[i];
        if (age === null || age === undefined) continue;
        let cap = -1;
        for (let t = 0; t < ex.tierAges.length; t++)
          if (age >= ex.tierAges[t]) cap = (typeof ex.tierCaps[t] === 'number' ? ex.tierCaps[t] : ex.tierCaps[t][colKey]) * factor;
        // E1e: the inherited draw of this filer (heir kinds only); every read is behind sources.inherited > 0.
        const inhI = (inhKind === INH_HEIR || inhKind === INH_HEIR_ANY) && sources.inherited > 0 ? Math.max(0, (i === 0 ? sources.inheritedA : sources.inheritedB) || 0) : 0;
        if (cap < 0) {
          // Colorado under 55: only the inherited amount (a death benefit) is excluded, up to the first tier's cap.
          if (inhKind === INH_HEIR_ANY && inhI > 0) total += Math.min(inhI, (typeof ex.tierCaps[0] === 'number' ? ex.tierCaps[0] : ex.tierCaps[0][colKey]) * factor);
          continue;
        }
        const pension = age >= ex.pensionFrom ? Math.max(0, (i === 0 ? sources.pensionA : sources.pensionB) || 0) : 0,
          retirement = Math.max(0, (i === 0 ? sources.retirementA : sources.retirementB) || 0),
          traditional = age >= ex.tradFrom
            ? ex.employerPlanOnly ? Math.min(retirement, Math.max(0, (i === 0 ? sources.retirement401kA : sources.retirement401kB) || 0)) : retirement
            : ex.employerPlan ? Math.min(retirement, Math.max(0, (i === 0 ? sources.retirement401kA : sources.retirement401kB) || 0)) : 0;
        const traditionalAll = inhI > 0 && (inhKind === INH_HEIR_ANY || age >= ex.tradFrom) ? traditional + inhI : traditional;
        let room = cap;
        if (ex.reducedBy === 1) room = Math.max(0, cap - ((i === 0 ? sources.ssBenefitsA : sources.ssBenefitsB) || 0));
        else if (ex.reducedBy === 2) room = Math.max(0, cap - (ssSplit ? ssSplit[i] : 0));
        total += Math.min(pension + traditionalAll, room);
      }
      return ex.share ? total * stateStepValue(ex.share.tables[colKey], agi, ex.share.inclusive, factor) : total;
    }
    let retirement = Math.max(0, sources.pension + sources.retirement);
    if (inhKind === INH_HEIR && sources.inherited > 0) retirement += sources.inherited; // E1e: Connecticut's inherited IRA draw
    if (ex.kind === 'agiPhasedShare')
      return retirement * stateStepValue(ex.tables[colKey], agi, ex.inclusive, factor);
    return 0;
  }
  // What a state lets the filer deduct for the federal income tax paid: the tax, up to the cap for the column
  // (an amount, scaled with the deduction family), the cap itself scaled by an AGI step table where the state phases it out.
  function stateFederalTaxAllowance(l, colKey, agi, federalTax, fSd, fCt) {
    if (!(federalTax > 0)) return 0;
    let cap = l.cap === null ? Infinity : l.cap[colKey] * fSd;
    if (l.phase) {
      const share = stateStepValue(l.phase.tables[colKey], agi, false, fCt);
      // basis 'cap': the cap shrinks with income (Oregon); basis 'tax': only a share of the tax counts (Missouri).
      if (l.phase.basis === 'tax') return Math.min(federalTax * share, cap);
      cap *= share;
    }
    return Math.min(federalTax, cap);
  }
  // A standard deduction that steps down or phases out with the state AGI (`standardDeductionPhase`):
  // 'stepDown' loses `step` per `width` of AGI over `start` down to `floor`; 'linear' falls from the
  // full amount at `start` to `floor` at `end`. The amounts index with the deduction family, the AGI
  // bounds with the credit-threshold family.
  function statePhasedDeduction(p, colKey, amount, agi, fSd, fCt) {
    const c = p.columns[colKey],
      over = agi - c.start * fCt;
    if (!(over > 0)) return amount;
    const floor = c.floor * fSd;
    if (p.kind === 'stepDown') return Math.max(floor, amount - c.step * fSd * Math.ceil(over / (c.width * fCt)));
    return amount - (amount - floor) * Math.min(1, over / ((c.end - c.start) * fCt));
  }
  // New York's tax benefit recapture. Above `agiStart` of NY AGI the benefit of the lower
  // brackets is taken back, phased in over `phaseWidth` of AGI, until the whole taxable income
  // is taxed at the rate of its own top band; `tiers` lists [taxable band start, that band's
  // rate] (the first band covers everything below the second). The state's worksheets state the
  // same thing with constants: for taxable income in band k over band start s, rate r and the
  // previous band's rate q, tax = T(income) + (q*s - T(s)) + (r - q)*s * ratio, ratio the AGI
  // over s as a share of phaseWidth (the first band: T + (r*income - T) * ratio, ratio from
  // agiStart). Above `flatAbove` of AGI everything is taxed at `flatRate`.
  function stateBenefitRecapture(a, colKey, col, agi, income, tax, factor) {
    if (agi <= a.agiStart * factor) return tax;
    if (agi > a.flatAbove * factor) return income * a.flatRate;
    const tiers = a.tiers[colKey],
      width = a.phaseWidth * factor,
      ratioOf = (excess) => Math.round(Math.min(1, Math.max(0, excess) / width) * 10000) / 10000;
    let k = 0;
    for (let i = 1; i < tiers.length; i++) if (income > tiers[i][0] * factor) k = i;
    const rate = tiers[k][1];
    if (k === 0) return tax + (rate * income - tax) * ratioOf(agi - a.agiStart * factor);
    const s = tiers[k][0] * factor,
      prevRate = tiers[k - 1][1],
      base = prevRate * s - graduatedTax(s, col.starts, col.rates, factor);
    return tax + base + (rate - prevRate) * s * ratioOf(agi - s);
  }
  // Tax on `income` from graduated brackets; bracket i runs from starts[i] to starts[i + 1]
  // (the last is open-ended), scaled by the index factor.
  function graduatedTax(income, starts, rates, factor) {
    let tax = 0,
      prev = 0;
    const n = starts.length;
    for (let i = 0; i < n; i++) {
      const cap = i === n - 1 ? Infinity : starts[i + 1] * factor;
      tax += Math.min(Math.max(0, income - prev), cap - prev) * rates[i];
      prev = cap;
      if (income <= cap) break;
    }
    return tax;
  }
  // One credit's amount. `c` is the evaluator context: { agi (state AGI after the state's
  // own subtractions), fedAgi (before them), income (the base after deductions), tax (before
  // credits), sources, factor }. Kinds:
  //   'exemptionCredits'   personal (by column) + a senior amount per filer at or over `senior.age`
  //                        + `dependent` per qualifying child, each credit reduced by
  //                        `phaseOut.reduction` per `phaseOut.width` of federal AGI over `phaseOut.start`
  //   'renterCredit'       a flat amount by column for a renter whose state AGI is at or under a limit
  //   'childCredit'        per qualifying child by age (`tiers`: [maxAge, amount], first match), the total
  //                        reduced by `phaseOut.per` per `phaseOut.width` of federal AGI over `phaseOut.start`
  //                        (or `phaseOut.rate` per dollar; `measure`, `maxChildren`, `fixed`: see the case)
  //   'propertyTaxCredit'  min(property tax paid, max), cut by `stepPct` per `stepWidth` of state AGI
  //                        over a limit by column
  //   'taxForgiveness'     a share of the tax: all of it while the base is at or under a limit (by column
  //                        plus `perDependent` per qualifying child), then cut by `stepPct` per `stepWidth`
  //   'agiStepFraction'    a fraction of the tax from a step table of the state AGI
  function stateCreditAmount(cr, colKey, c) {
    // Three index factors: personal-exemption-type amounts (fEx), other credit amounts (fCa) and the
    // income thresholds, limits and step widths (fCt).
    const fEx = c.fEx,
      fCa = c.fCa,
      fCt = c.fCt,
      sources = c.sources,
      deps = sources.dependents || NO_DEPENDENTS;
    switch (cr.kind) {
      case 'exemptionCredits': {
        const seniors = countAtLeast(sources.ages || [], cr.senior.age),
          kids = countQualifyingChildren(deps),
          count = cr.personalCount[colKey] + seniors + kids,
          gross = (cr.personal[colKey] + seniors * cr.senior.amount + kids * cr.dependent) * fEx,
          over = c.fedAgi - cr.phaseOut.start[colKey] * fCt;
        if (!(over > 0)) return gross;
        return Math.max(0, gross - count * cr.phaseOut.reduction * fEx * Math.ceil(over / (cr.phaseOut.width * fCt)));
      }
      case 'renterCredit':
        return sources.rent > 0 && c.agi <= cr.agiLimit[colKey] * fCt ? cr.amount[colKey] * fCa : 0;
      case 'childCredit': {
        // The phase-out comes off the household's total, not off each child's amount. A status can have its own
        // threshold (a qualifying surviving spouse reads the joint column elsewhere but not here). Options (7O O4):
        // `phaseOut.measure` ('stateAgi' or 'income'; default the federal AGI), `phaseOut.rate` (a straight line, credit
        // dollars lost per dollar over the start, a percentage that never indexes; else `per` per `width`; `phaseOut.share` { width, round }: a
        // percentage of the whole credit, Oregon; `phaseOut.perChild`: the cut comes off each child, Vermont), `maxChildren` (a cap on
        // the children counted) and `fixed` (the statute does not index this credit, whatever the row's flags say).
        const ca = cr.fixed === true ? 1 : fCa,
          ct = cr.fixed === true ? 1 : fCt,
          po = cr.phaseOut,
          measure = po.measure === 'stateAgi' ? c.agi : po.measure === 'income' ? c.income : c.fedAgi,
          start = po.start[c.filing] !== undefined ? po.start[c.filing] : po.start[colKey],
          over = measure - start * ct,
          cut = po.share !== undefined ? 0 : over > 0 ? (po.rate !== undefined ? po.rate * over : Math.ceil(over / (po.width * ct)) * po.per * ca) : 0;
        let total = 0,
          counted = 0;
        for (let i = 0; i < deps.length; i++) {
          if (!deps[i].qualifyingChild) continue;
          for (let t = 0; t < cr.tiers.length; t++)
            if (deps[i].age <= cr.tiers[t][0]) {
              if (cr.maxChildren === undefined || counted < cr.maxChildren) total += po.perChild === true ? Math.max(0, cr.tiers[t][1] * ca - cut) : cr.tiers[t][1] * ca;
              counted++;
              break;
            }
        }
        if (po.share !== undefined) {
          // A percentage of the whole credit (Oregon, ORS 315.273(4)): the income over the start divided by a fixed width
          // (a divisor, not a dollar amount, so it is not indexed), rounded as the state's worksheet does, applied to the
          // capped total.
          const raw = over > 0 ? over / po.share.width : 0,
            f = po.share.round === undefined ? 0 : Math.pow(10, po.share.round);
          return total * (1 - Math.min(1, f ? Math.round(raw * f) / f : raw));
        }
        return po.perChild === true ? total : Math.max(0, total - cut);
      }
      case 'propertyTaxCredit': {
        const over = c.agi - cr.limit[colKey] * fCt,
          share = over > 0 ? Math.max(0, 1 - cr.stepPct * Math.ceil(over / (cr.stepWidth * fCt))) : 1;
        return Math.min(sources.propertyTax || 0, cr.max * fCa) * share;
      }
      case 'taxForgiveness': {
        const limit = (cr.limit[colKey] + countQualifyingChildren(deps) * cr.perDependent) * fCt,
          over = c.income - limit,
          share = over > 0 ? Math.max(0, 1 - cr.stepPct * Math.ceil(over / (cr.stepWidth * fCt))) : 1;
        return c.tax * share;
      }
      case 'agiStepFraction':
        return c.tax * stateStepValue(cr.tables[colKey], c.agi, false, fCt);
      case 'incomeTestedCredit': {
        // A flat amount per filing column, plus a senior amount per filer at or over `perSenior.age` and an amount per
        // qualifying child; none above the AGI `limit` (or cut by `taper.pct` per `taper.width` of AGI over it, or by `taper.rate` dollars per dollar).
        let gross = cr.amount[colKey];
        if (cr.perSenior) gross += countAtLeast(sources.ages || [], cr.perSenior.age) * cr.perSenior.amount;
        if (cr.perDependent) gross += countQualifyingChildren(deps) * cr.perDependent;
        gross *= fCa;
        if (cr.limit === null) return gross;
        const over = c.agi - cr.limit[colKey] * fCt;
        if (!(over > 0)) return gross;
        if (cr.taper === null) return 0;
        // A straight line (`rate` of the credit lost per dollar of AGI over the limit, in dollars) or steps (`pct` of it per `width`).
        if (cr.taper.rate !== undefined) return Math.max(0, gross - cr.taper.rate * over);
        return gross * Math.max(0, 1 - cr.taper.pct * Math.ceil(over / (cr.taper.width * fCt)));
      }
      case 'childStepCredit': {
        // An amount per qualifying child from a step table of the federal AGI (New Mexico's Child Income Tax Credit).
        // Options: `maxAge` (only children up to that age count: New Jersey's under six) and `measure` ('income': the state
        // taxable income, not the federal AGI).
        let kids = 0;
        if (cr.maxAge === undefined) kids = countQualifyingChildren(deps);
        else for (let i = 0; i < deps.length; i++) if (deps[i].qualifyingChild && deps[i].age <= cr.maxAge) kids++;
        return kids ? kids * stateStepValue(cr.tables[colKey], cr.measure === 'income' ? c.income : c.fedAgi, false, fCt) * fCa : 0;
      }
      case 'propertyTaxShareCredit':
        // A share of the property tax paid (Illinois: 5%), lost above an AGI limit by column.
        return c.agi <= cr.agiLimit[colKey] * fCt ? Math.max(0, sources.propertyTax || 0) * cr.rate : 0;
      case 'taxShareCredit':
        // A share of the tax before credits, up to a maximum, by column (Ohio's joint filing credit).
        return Math.min(cr.max[colKey] * fCa, cr.share[colKey] * c.tax);
      case 'ssCredit':
        // A credit of `rate` on the taxable Social Security benefits, reduced by `phase.rate` per dollar of AGI over `phase.start`.
        return Math.max(0, cr.rate * Math.max(0, sources.taxableSS) * fCa - (cr.phase ? cr.phase.rate * Math.max(0, c.agi - cr.phase.start[colKey] * fCt) : 0));
      default:
        return 0;
    }
  }
  function countAtLeast(ages, minAge) {
    let n = 0;
    for (let i = 0; i < ages.length; i++) if (ages[i] >= minAge) n++;
    return n;
  }
  function countQualifyingChildren(dependents) {
    let n = 0;
    for (let i = 0; i < dependents.length; i++) if (dependents[i].qualifyingChild) n++;
    return n;
  }
  // The value of a step table at `x`: the last row whose lower bound (scaled by the index
  // factor) is below x (at or below it if `inclusive`); the first row's value under all of them.
  function stateStepValue(rows, x, inclusive, factor) {
    let value = rows[0][1];
    for (let i = 1; i < rows.length; i++) {
      const from = rows[i][0] * factor;
      if (inclusive ? x >= from : x > from) value = rows[i][1];
      else break;
    }
    return value;
  }
  // The state-tax inputs of one return. taxFor refills one of these per call instead of allocating a new object (and
  // arrays) for every call: stateIncomeTax reads it and keeps nothing, and the two returns of the two-filer branch
  // use two objects because both are built before either is evaluated. The per-person fields are only written (and
  // so only valid) when the selected row reads them (rule.needsPerPerson); every row reads the others.
  function newStateSources(agesCount) {
    return {
      wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: new Array(agesCount).fill(0),
      pensionA: 0, pensionB: 0, retirementA: 0, retirementB: 0, retirement401kA: 0, retirement401kB: 0, federalTax: 0,
      ssBenefits: 0, ssBenefitsA: 0, ssBenefitsB: 0, taxableSSA: 0, taxableSSB: 0,
      dependents: NO_DEPENDENTS, propertyTax: 0, rent: 0,
      // E1e: an inherited traditional draw by partner (slot A of its own sources for a second return) and the New York decedent room.
      inherited: 0, inheritedA: 0, inheritedB: 0, inheritedExclA: 0, inheritedExclB: 0,
    };
  }
  // load-time: builds the four scratch source objects with newStateSources, a function declared in this file that reads NO_DEPENDENTS from a module outside any cycle
  export const SOURCES_JOINT = newStateSources(2),
    SOURCES_SINGLE = newStateSources(1),
    SOURCES_A = newStateSources(1),
    SOURCES_B = newStateSources(1);
