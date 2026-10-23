// Canada federal, provincial and payroll tax, pension splitting and taxFor

import { countKids, benefitsFor } from '../benefits/benefits.js';
import { AGE_AMOUNT, AGE_AMOUNT_REDUCTION, AGE_AMOUNT_THRESHOLD, FEDERAL_ELIGIBLE_DTC, PENSION_INCOME_AMOUNT, CPP_ENHANCED_RATE, EI_MIE, EMPLOYMENT_AMOUNT, PAY, QC_WORKERS_DEDUCTION_MAX, QC_WORKERS_DEDUCTION_RATE, FED_MEDICAL_THRESHOLD, FED_BPA_ENHANCED, FED_BPA_MIN, FED_BPA_PHASE_END, FED_BPA_PHASE_START, FED_CAPS, FED_CREDIT_RATE, FED_RATES, RRIF_PENSION_AGE, OAS_RECOVERY_THRESHOLD, OAS_RECOVERY, PROV_TAX, RAMQ_CAP } from './rules.js';
import { currentProvince } from './province-rules.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';

  // Same loop as progressiveTax, with the caps scaled by `f` in place of a scaled copy.
  function scaledProgressiveTax(income, caps, rates, f) {
    let tax = 0,
      prev = 0;
    for (let i = 0; i < caps.length; i++) {
      const cap = caps[i] * f;
      tax += Math.min(Math.max(0, income - prev), cap - prev) * rates[i];
      prev = cap;
      if (income <= cap) break;
    }
    return tax;
  }
  export function ontarioHealthPremium(taxableIncome, factor) {
    const i = Math.max(0, taxableIncome);
    if (i <= 20000 * factor) return 0;
    if (i <= 25000 * factor) return (i - 20000 * factor) * 0.06;
    if (i <= 36000 * factor) return 300 * factor;
    if (i <= 38500 * factor) return 300 * factor + (i - 36000 * factor) * 0.06;
    if (i <= 48000 * factor) return 450 * factor;
    if (i <= 48600 * factor) return 450 * factor + (i - 48000 * factor) * 0.25;
    if (i <= 72000 * factor) return 600 * factor;
    if (i <= 72600 * factor) return 600 * factor + (i - 72000 * factor) * 0.25;
    if (i <= 200000 * factor) return 750 * factor;
    if (i <= 200600 * factor) return 750 * factor + (i - 200000 * factor) * 0.25;
    return 900 * factor;
  }
  // RRSP meltdown ladder — withdraws from RRSP each year in the chosen
  // window, solving for the gross withdrawal that fills that person's
  // taxable income up to the top of the selected federal bracket. Net
  // proceeds are assumed moved to TFSA (sufficient TFSA room is assumed,
  // consistent with this planner's simplified-limits approach elsewhere).
  // Unlike a US Roth conversion, no bisection is needed: CPP/OAS are fully
  // taxable with no nonlinear provisional-income step, so income is linear
  // in the withdrawal amount.
  export function federalBracketCeilingCA(pctTarget) {
    const brackets = [
      [14, 58523],
      [20.5, 117045],
      [26, 181440],
      [29, 258482],
      [33, 258482],
    ];
    const found = brackets.find(([p]) => p === pctTarget);
    return found ? found[1] : brackets[brackets.length - 1][1];
  }
  export function federalTaxCA(ctx, income, yearIndex, extraCreditBase = 0, claimMinus = -1) {
    const factor = taxIndexFactor(ctx, yearIndex);
    const phaseStart = FED_BPA_PHASE_START * factor,
      phaseEnd = FED_BPA_PHASE_END * factor,
      bpa =
        FED_BPA_MIN * factor +
        FED_BPA_ENHANCED *
          factor *
          (income <= phaseStart ? 1 : income >= phaseEnd ? 0 : (phaseEnd - income) / (phaseEnd - phaseStart));
    return Math.max(
      0,
      scaledProgressiveTax(Math.max(0, income), FED_CAPS, FED_RATES, factor) -
        FED_CREDIT_RATE * (bpa + extraCreditBase + (claimMinus >= 0 ? Math.max(0, bpa - claimMinus) : 0)),
    );
  }
  // Quebec: a person's age amount (65+) plus retirement-income amount (the lesser of the amount and
  // 1.25 times the eligible pension or RRIF income); zero outside Quebec. The living-alone amount is
  // added by the caller (single filers only).
  export function quebecPoolAmount(ctx, age, pensionIncome, yearIndex) {
    const rule = currentProvince(ctx).rule,
      pool = rule.pooled;
    if (!pool) return 0;
    const g = rule.indexing.ageAmountIndexed ? taxIndexFactor(ctx, yearIndex) : 1;
    let amount = pensionIncome > 0 ? Math.min(pool.retirementAmount * g, pensionIncome * pool.retirementMultiplier) : 0;
    if (age >= 65) amount += pool.ageAmount * g;
    return amount;
  }
  // Provincial tax for one person: tax on the brackets, less each non-refundable credit
  // at the province's lowest rate (basic personal amount, with its phase-down where
  // there is one), floored at zero; then Ontario's surtax on that; then the eligible
  // dividend credit (against the provincial tax only, floored at zero; Ontario takes it
  // after the surtax, as form ON428 does); then Ontario's Health Premium, which is not
  // reduced by credits and is based on taxable income.
  export function provincialTaxCA(ctx, income, yearIndex, dtcBase = 0, age = 0, pensionIncome = 0, familyIncome = null, partnerPool = 0, spouseNet = -1, depKids = 0, childKids = 0, extraCredit = 0, medical = 0, redKids = 0) {
    const c = currentProvince(ctx),
      rule = c.rule,
      ix = rule.indexing,
      f = taxIndexFactor(ctx, yearIndex),
      ni = Math.max(0, income);
    const base = scaledProgressiveTax(ni, c.caps, c.rates, ix.bracketsIndexed ? f : 1);
    let bpa = rule.bpa.amount * (ix.bpaIndexed ? f : 1);
    const phase = rule.bpa.phase;
    if (phase) {
      const fp = ix.bpaIndexed ? f : 1,
        start = phase.start * fp,
        end = phase.end * fp,
        floor = phase.floor * fp;
      bpa = floor + (bpa - floor) * (ni <= start ? 1 : ni >= end ? 0 : (end - ni) / (end - start));
    }
    // Age amount (65+): reduced by 15% of net income over the threshold, plus a supplement
    // that is not reduced; pension amount: the first dollars of eligible pension income.
    let credits = bpa + extraCredit;
    if (medical > 0 && rule.medical) {
      const m = rule.medical,
        three = 0.03 * (m.familyIncome ? (familyIncome === null ? ni : familyIncome) : ni),
        floor = m.threshold === null ? three : Math.min(three, m.threshold * (ix.bpaIndexed ? f : 1));
      if (medical > floor) credits += medical - floor;
    }
    if (age >= 65 && rule.age) {
      const a = rule.age,
        fa = ix.ageAmountIndexed ? f : 1;
      credits += Math.max(0, a.amount * fa - a.rate * Math.max(0, ni - a.threshold * fa)) + a.supplement * fa;
    }
    if (pensionIncome > 0 && rule.pension) credits += Math.min(rule.pension.amount * (ix.pensionAmountIndexed ? f : 1), pensionIncome);
    // Spouse or eligible-dependant amount (CRA TD1 forms, 2026): the amount, with the spouse's (or dependant's) net income
    // free up to a threshold, so the credit amount is clamp(amount + threshold - net income, 0, amount); the amounts index
    // like the basic personal amount. depKids > 0 is a single claimant's eligible dependant (a child under 18 with no
    // income). Saskatchewan also has a child amount for each child under 18 other than the one claimed as the dependant.
    if (spouseNet >= 0 || depKids > 0 || childKids > 0) {
      const fb = ix.bpaIndexed ? f : 1,
        sp = rule.spouse,
        ch = rule.childAmount;
      if (sp && (spouseNet >= 0 || depKids > 0))
        credits += Math.min(sp.amount * fb, Math.max(0, (sp.amount + sp.threshold) * fb - (spouseNet > 0 ? spouseNet : 0)));
      if (ch) credits += ((depKids > 0 ? depKids - 1 : 0) + childKids) * ch.amount * fb;
    }
    // Quebec: age, retirement-income and living-alone amounts are one pool, reduced as a whole by
    // 18.75% of family income over the threshold (form TP-1015.3-V, Work Chart 2). For a couple the
    // two spouses' amounts are added and reduced ONCE; each spouse takes a share of what is left in
    // proportion to their own amounts (`partnerPool` is the other spouse's amount, `familyIncome`
    // both spouses' net income). `familyIncome` null means a single filer: own income, living alone.
    const pool = rule.pooled;
    if (pool) {
      const g = ix.ageAmountIndexed ? f : 1;
      let own = quebecPoolAmount(ctx, age, pensionIncome, yearIndex);
      if (familyIncome === null) own += pool.livingAlone * g;
      const total = own + partnerPool;
      if (total > 0) {
        const reduction = pool.reductionRate * Math.max(0, (familyIncome === null ? ni : familyIncome) - pool.reductionThreshold * g);
        credits += Math.max(0, total - reduction) * (own / total);
      }
    }
    let tax = Math.max(0, base - rule.creditRate * credits);
    if (rule.surtax) {
      const s = rule.surtax,
        sf = ix.surtaxIndexed ? f : 1;
      tax += Math.max(0, tax - s.first * sf) * s.firstRate + Math.max(0, tax - s.second * sf) * s.secondRate;
    }
    if (dtcBase > 0) tax = Math.max(0, tax - dtcBase * rule.dividend.eligible);
    // Low-income tax reduction (after the dividend credit, before Ontario's health premium).
    const li = rule.lowIncomeReduction;
    if (li) {
      const fb = ix.bpaIndexed ? f : 1;
      if (li.kind === 'perReturn') {
        const r = li.multiplier * (li.basic + li.child * redKids) * fb - tax;
        if (r > 0) tax = Math.max(0, tax - r);
      } else if (li.kind === 'income') {
        const r = li.basic * fb - li.rate * Math.max(0, ni - li.base * fb);
        if (r > 0) tax = Math.max(0, tax - r);
      }
      const ac = li.ageTaxCredit;
      if (ac && age >= ac.age && ni < ac.incomeBelow * fb) tax = Math.max(0, tax - ac.amount * fb);
    }
    PROV_TAX.pre = tax;
    if (rule.healthPremium) tax += ontarioHealthPremium(ni, f);
    PROV_TAX.last = tax;
    return tax;
  }
  export function oasClawback(ctx, netIncomeInclOas, oasReceived, yearIndex) {
    if (oasReceived <= 0) return 0;
    const factor = taxIndexFactor(ctx, yearIndex),
      threshold = OAS_RECOVERY_THRESHOLD * factor;
    return Math.min(oasReceived, Math.max(0, (netIncomeInclOas - threshold) * 0.15));
  }
  function ageAndPensionCreditBase(ctx, netIncome, age, pensionIncome, yearIndex) {
    let base = Math.min(PENSION_INCOME_AMOUNT, Math.max(0, pensionIncome));
    if (age >= 65) {
      const factor = taxIndexFactor(ctx, yearIndex);
      base += Math.max(
        0,
        AGE_AMOUNT * factor - AGE_AMOUNT_REDUCTION * Math.max(0, netIncome - AGE_AMOUNT_THRESHOLD * factor),
      );
    }
    return base;
  }
  export function personTaxCA(ctx, ordinaryIncome, gains, yearIndex, dtcBase = 0, age = 0, pensionIncome = 0, familyIncome = null, partnerPool = 0, oas = 0, spouseNet = -1, depKids = 0, childKids = 0, fedCredit = 0, provCredit = 0, provDeduction = 0, medical = 0, redKids = 0) {
    let taxableIncome = Math.max(0, ordinaryIncome + Math.max(0, gains) * 0.5),
      recovery = 0;
    if (oas > 0) {
      // oasClawback, inlined (hot path): 15% over the indexed threshold, up to the OAS received.
      const over = taxableIncome - OAS_RECOVERY_THRESHOLD * taxIndexFactor(ctx, yearIndex);
      if (over > 0) {
        recovery = over * 0.15 < oas ? over * 0.15 : oas;
        taxableIncome -= recovery;
      }
    }
    if (oas > 0) OAS_RECOVERY.last = recovery;
    let fedTax = federalTaxCA(
      ctx,
      taxableIncome,
      yearIndex,
      (age >= 65 || pensionIncome > 0 ? ageAndPensionCreditBase(ctx, taxableIncome, age, pensionIncome, yearIndex) : 0) +
        fedCredit +
        (medical > 0 ? Math.max(0, medical - Math.min(0.03 * taxableIncome, FED_MEDICAL_THRESHOLD * taxIndexFactor(ctx, yearIndex))) : 0),
      spouseNet >= 0 ? spouseNet : depKids > 0 ? 0 : -1,
    );
    if (dtcBase > 0) fedTax = Math.max(0, fedTax - dtcBase * FEDERAL_ELIGIBLE_DTC);
    if (ctx.inputs.province === 'qc') fedTax *= 0.835;
    const provTax = provincialTaxCA(ctx, provDeduction > 0 ? taxableIncome - provDeduction : taxableIncome, yearIndex, dtcBase, age, pensionIncome, familyIncome, partnerPool, spouseNet, depKids, childKids, provCredit, medical, redKids) + recovery;
    PROV_TAX.fed = fedTax; // with PROV_TAX.pre: a zero means the return had no tax left for a credit (the medical claim chooser)
    return fedTax + provTax;
  }
  export function incomeTaxCA(ctx, profile, gains = 0, traditionalExtra = 0) {
    // Eligible pension income for the credit: the profile's pension (and RRIF
    // income at 65+, after any split) plus, from RRIF_PENSION_AGE, the discretionary
    // RRSP/RRIF draw, which counts as RRIF income. A profile built without
    // ages or pension fields (the Roth-style literals) reads as under 65, none.
    const ageA = profile.ageA || 0,
      ageB = profile.ageB || 0,
      penA = profile.penA || 0,
      penB = profile.penB || 0;
    const oasA = profile.oasA || 0,
      oasB = profile.oasB || 0;
    // Children under 18 (the eligible-dependant and child amounts); none on the common path.
    const deps = profile.dependents,
      kids = deps && deps.length ? countKids(deps, 0, 17) : 0,
      kids18 = kids > 0 ? countKids(deps, 0, 18) : deps && deps.length ? countKids(deps, 0, 18) : 0;
    const li = currentProvince(ctx).rule.lowIncomeReduction;
    // The household's eligible medical expenses (health premium and long-term care), claimed on one return.
    let med = profile.medical || 0;
    // Quebec health contributions (7N N7): the Health Services Fund on each return's non-employment income (OAS excluded, dividends at the
    // amount received) and the drug premium of every retired adult, which is also a medical expense.
    const hc = currentProvince(ctx).rule.healthContributions;
    let health = 0;
    OAS_RECOVERY.a = OAS_RECOVERY.b = 0;
    if (profile.singlePerson) {
      if (hc) {
        const netQ = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5),
          nonEmp = Math.max(0, netQ - (profile.earnedA || 0) - oasA - (profile.dtcA || 0) * 0.2753623);
        health = quebecHsf(ctx, nonEmp, profile.year, hc.hsf);
        if (!(profile.earnedA > 0)) {
          const ramq = quebecRamq(ctx, netQ, false, kids, profile.year, hc.ramq);
          health += ramq;
          med += ramq;
        }
      }
      const single = personTaxCA(
        ctx,
        profile.otherA + traditionalExtra,
        gains,
        profile.year,
        profile.dtcA,
        ageA,
        ageA >= RRIF_PENSION_AGE ? penA + traditionalExtra : penA,
        null,
        0,
        oasA,
        -1,
        kids,
        0,
        profile.fedCreditA || 0,
        profile.provCreditA || 0,
        profile.provDedA || 0,
        med,
        kids18,
      );
      const pSingle = PROV_TAX.last;
      if (oasA > 0) OAS_RECOVERY.a = OAS_RECOVERY.last;
      if (li && li.kind === 'family') {
        const netS = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5);
        return single - lowIncomeFamilyReduction(ctx, li, ageA, 0, false, kids, kids18, netS, 0, pSingle, profile.year, currentProvince(ctx).rule.indexing.bpaIndexed);
      }
      if (med > 0 && ctx.inputs.province === 'on') {
        const net = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5);
        return single - careAtHomeCredit(ctx, med, net, net, profile.year, ageA, 0);
      }
      return single + health;
    }
    const gainA = gains / 2,
      gainB = gains / 2,
      tradA = traditionalExtra / 2,
      tradB = traditionalExtra / 2;
    // Family net income (Quebec's reductions): both spouses' income with the 50% gains inclusion.
    const netA = Math.max(0, profile.otherA + tradA + gainA * 0.5),
      netB = Math.max(0, profile.otherB + tradB + gainB * 0.5),
      family = netA + netB;
    // One spouse amount a household: the higher-income partner claims for the other (A on a tie); the children go
    // to the lower-income parent (A on a tie), as the Saskatchewan child amount requires.
    const spouseA = netA >= netB ? netB : -1,
      spouseB = netB > netA ? netA : -1,
      kidsA = netA <= netB ? kids : 0,
      kidsB = netB < netA ? kids : 0;
    const pensionA = ageA >= RRIF_PENSION_AGE ? penA + tradA : penA,
      pensionB = ageB >= RRIF_PENSION_AGE ? penB + tradB : penB;
    if (hc) {
      const nonEmpA = Math.max(0, netA - (profile.earnedA || 0) - oasA - (profile.dtcA || 0) * 0.2753623),
        nonEmpB = Math.max(0, netB - (profile.earnedB || 0) - oasB - (profile.dtcB || 0) * 0.2753623);
      health = quebecHsf(ctx, nonEmpA, profile.year, hc.hsf) + quebecHsf(ctx, nonEmpB, profile.year, hc.hsf);
      const ramq = quebecRamq(ctx, family, true, kids, profile.year, hc.ramq);
      if (!(profile.earnedA > 0)) {
        health += ramq;
        med += ramq;
      }
      if (!(profile.earnedB > 0)) {
        health += ramq;
        med += ramq;
      }
    }
    // The medical claim goes to the lower-income partner (the preferred return), but a return with no tax left to absorb it wastes the
    // credit (a 65+ partner owes nothing up to about 27,700 federally), so with expenses both claimants are priced and the cheaper kept.
    const medPrefB = med > 0 && medicalClaimToB(ctx, netA, netB, profile.year);
    // Ontario with a 70+ spouse: the claimant also sets the Seniors Care at Home credit, so both claimants are priced on tax less that credit.
    const careSwap = med > 0 && ctx.inputs.province === 'on' && (ageA >= 70 || ageB >= 70); // 70: the row's careAtHome.age
    let medToB = medPrefB,
      taxA = 0,
      taxB = 0,
      pA = 0,
      pB = 0,
      bestCost = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const toB = attempt === 0 ? medPrefB : !medPrefB;
      const tA = personTaxCA(ctx, profile.otherA + tradA, gainA, profile.year, profile.dtcA, ageA, pensionA, family, quebecPoolAmount(ctx, ageB, pensionB, profile.year), oasA, spouseA, 0, kidsA, profile.fedCreditA || 0, profile.provCreditA || 0, profile.provDedA || 0, toB ? 0 : med, netA >= netB ? kids18 : 0);
      const qA = PROV_TAX.last,
        fedA = PROV_TAX.fed,
        preA = PROV_TAX.pre;
      if (oasA > 0) OAS_RECOVERY.a = OAS_RECOVERY.last;
      const tB = personTaxCA(ctx, profile.otherB + tradB, gainB, profile.year, profile.dtcB, ageB, pensionB, family, quebecPoolAmount(ctx, ageA, pensionA, profile.year), oasB, spouseB, 0, kidsB, profile.fedCreditB || 0, profile.provCreditB || 0, profile.provDedB || 0, toB ? med : 0, netB > netA ? kids18 : 0);
      const qB = PROV_TAX.last,
        fedB = PROV_TAX.fed,
        preB = PROV_TAX.pre;
      if (oasB > 0) OAS_RECOVERY.b = OAS_RECOVERY.last;
      const cost = careSwap ? tA + tB - careAtHomeCredit(ctx, med, toB ? netB : netA, family, profile.year, ageA, ageB) : tA + tB;
      if (attempt === 0 || cost < bestCost) {
        taxA = tA;
        taxB = tB;
        pA = qA;
        pB = qB;
        medToB = toB;
        bestCost = cost;
      }
      // the other return can only do better if this one had no tax left for the credit and the other has some to reduce
      if (attempt === 0 && !(med > 0 && (careSwap || (toB ? (fedB === 0 && fedA > 0) || (preB === 0 && preA > 0) : (fedA === 0 && fedB > 0) || (preA === 0 && preB > 0))))) break;
    }
    let reduction = 0;
    if (li && li.kind === 'family') reduction = lowIncomeFamilyReduction(ctx, li, ageA, ageB, true, kids, kids18, netA, netB, pA + pB, profile.year, currentProvince(ctx).rule.indexing.bpaIndexed);
    if (med > 0 && ctx.inputs.province === 'on') return taxA + taxB - careAtHomeCredit(ctx, med, medToB ? netB : netA, family, profile.year, ageA, ageB);
    return taxA + taxB - reduction + health;
  }
  // Canada taxFor is the household's net cost of income: income tax minus the income-tested benefits it
  // triggers. The shared withdrawal solvers (drawTaxable and the Canada solvers) price a withdrawal as the change
  // in taxFor, so with this definition they see lost GIS and the other benefits as a cost of withdrawing. The
  // benefits are tax-free cash, so net cash is the same as a separate inflow; the engine reports gross tax and
  // each benefit separately (see runProjection).
  export function taxFor(ctx, profile, gains = 0, traditionalExtra = 0) {
    return incomeTaxCA(ctx, profile, gains, traditionalExtra) - benefitsFor(ctx, profile, gains, traditionalExtra);
  }
  // Pension income splitting — up to 50% of one spouse's eligible pension
  // income (RRIF/RRSP annuity from age 65, employer pension at any age; CPP,
  // OAS, and RRSP lump-sum withdrawals are not eligible) may be reallocated
  // to the other spouse's return. Solved by ternary search since combined
  // tax is convex in the amount transferred between two progressive-tax
  // filers.
  export function solvePensionSplit(ctx, otherA, otherB, eligibleA, eligibleB, yearIndex, ageA = 0, ageB = 0, oasA = 0, oasB = 0, kids = 0, pay = null) {
    const maxAtoB = 0.5 * eligibleA,
      maxBtoA = 0.5 * eligibleB;
    let lo = -maxBtoA,
      hi = maxAtoB;
    if (lo >= hi) return 0;
    // The transferred amount counts as pension income for the receiver, so the
    // pension credit and the age-amount clawback both move with it.
    const family = Math.max(0, otherA) + Math.max(0, otherB); // unchanged by the transfer
    // Same claims as incomeTaxCA: the higher-income partner claims the spouse amount, the lower-income parent the children.
    const combinedTax = (x) => {
      const nA = otherA - x,
        nB = otherB + x,
        withMed = pay && pay.med > 0,
        prefB = withMed && medicalClaimToB(ctx, nA, nB, yearIndex);
      const a1 = personTaxCA(ctx, nA, 0, yearIndex, 0, ageA, eligibleA - x, family, quebecPoolAmount(ctx, ageB, eligibleB + x, yearIndex), oasA, nA >= nB ? Math.max(0, nB) : -1, 0, nA <= nB ? kids : 0, pay ? pay.fedA : 0, pay ? pay.provA : 0, pay ? pay.dedA : 0, withMed && !prefB ? pay.med : 0, pay && nA >= nB ? pay.rk : 0),
        fedA = PROV_TAX.fed,
        preA = PROV_TAX.pre,
        b1 = personTaxCA(ctx, nB, 0, yearIndex, 0, ageB, eligibleB + x, family, quebecPoolAmount(ctx, ageA, eligibleA - x, yearIndex), oasB, nB > nA ? Math.max(0, nA) : -1, 0, nB < nA ? kids : 0, pay ? pay.fedB : 0, pay ? pay.provB : 0, pay ? pay.dedB : 0, withMed && prefB ? pay.med : 0, pay && nB > nA ? pay.rk : 0),
        fedB = PROV_TAX.fed,
        preB = PROV_TAX.pre,
        t1 = a1 + b1;
      // a claimant with no tax left wastes the credit: price the other return too and keep the cheaper
      if (!withMed || !(prefB ? (fedB === 0 && fedA > 0) || (preB === 0 && preA > 0) : (fedA === 0 && fedB > 0) || (preA === 0 && preB > 0))) return t1;
      const t2 = (personTaxCA(ctx, nA, 0, yearIndex, 0, ageA, eligibleA - x, family, quebecPoolAmount(ctx, ageB, eligibleB + x, yearIndex), oasA, nA >= nB ? Math.max(0, nB) : -1, 0, nA <= nB ? kids : 0, pay ? pay.fedA : 0, pay ? pay.provA : 0, pay ? pay.dedA : 0, withMed && !!prefB ? pay.med : 0, pay && nA >= nB ? pay.rk : 0) + personTaxCA(ctx, nB, 0, yearIndex, 0, ageB, eligibleB + x, family, quebecPoolAmount(ctx, ageA, eligibleA - x, yearIndex), oasB, nB > nA ? Math.max(0, nA) : -1, 0, nB < nA ? kids : 0, pay ? pay.fedB : 0, pay ? pay.provB : 0, pay ? pay.dedB : 0, withMed && !prefB ? pay.med : 0, pay && nB > nA ? pay.rk : 0));
      return t2 < t1 ? t2 : t1;
    };
    // The age-amount clawback makes combined tax non-convex for a 65+ filer
    // (its slope drops back where the clawback ends), so a ternary search over
    // the whole range can settle in the wrong dip. With a 65+ partner, scan a
    // coarse grid first and run the ternary search inside the best cell. Where
    // both partners are on the same marginal rate the tax is flat over a wide
    // stretch, with a narrow dip where their incomes are equal that neither the
    // grid nor the search can see, so that transfer is also a candidate.
    const search65 = ageA >= 65 || ageB >= 65,
      loAll = lo,
      hiAll = hi;
    let iterations = 40;
    if (search65) {
      iterations = 20; // refining inside one grid cell
      const cells = 48,
        step = (hi - lo) / cells;
      let bestI = 0,
        bestTax = Infinity;
      for (let i = 0; i <= cells; i++) {
        const tax = combinedTax(lo + step * i);
        if (tax < bestTax) {
          bestTax = tax;
          bestI = i;
        }
      }
      const cellLo = lo + step * Math.max(0, bestI - 1),
        cellHi = lo + step * Math.min(cells, bestI + 1);
      lo = cellLo;
      hi = cellHi;
    }
    for (let i = 0; i < iterations; i++) {
      const m1 = lo + (hi - lo) / 3,
        m2 = hi - (hi - lo) / 3;
      if (combinedTax(m1) < combinedTax(m2)) hi = m2;
      else lo = m1;
    }
    const found = (lo + hi) / 2;
    if (!search65) return found;
    const equal = Math.min(hiAll, Math.max(loAll, (otherA - otherB) / 2));
    return combinedTax(equal) < combinedTax(found) ? equal : found;
  }
  // CPP contributions (employee side): 5.95% on earnings between the basic
  // exemption and the YMPE, plus 4% (CPP2) between the YMPE and YAMPE. Quebec
  // residents pay QPP instead (6.30% on the same band, same 4% second tier) plus
  // the QPIP premium (0.430% up to $103,000), from the province row. This is the
  // contribution alone (kept for the tests); the engine's payroll cost, the EI
  // premium and the credits and deductions they give are in payrollItems below.
  export function cppContribution(ctx, wages, yearIndex) {
    const f = taxIndexFactor(ctx, yearIndex),
      ympe = 74600 * f,
      yampe = 85000 * f,
      exemption = 3500 * f;
    const payroll = currentProvince(ctx).rule.payroll,
      cpp1 = Math.max(0, Math.min(wages, ympe) - exemption) * payroll.pensionRate,
      cpp2 = Math.max(0, Math.min(wages, yampe) - ympe) * 0.04;
    return payroll.premium ? cpp1 + cpp2 + Math.min(wages, payroll.premium.max * f) * payroll.premium.rate : cpp1 + cpp2;
  }
  export function medicalClaimToB(ctx, netA, netB, yearIndex) {
    const bpa = FED_BPA_MIN * taxIndexFactor(ctx, yearIndex);
    return netA <= netB ? netA < bpa : netB >= bpa;
  }
  // Ontario Seniors Care at Home Tax Credit (refundable): a household with someone 70 or older gets 25 percent of up to 6,000 of
  // the claimable medical expenses, reduced by 5 percent of family net income over 35,000 (ontario.ca, claimed on ON479).
  function careAtHomeCredit(ctx, med, netClaimant, famNet, yearIndex, ageA, ageB) {
    const rule = currentProvince(ctx).rule,
      c = rule.careAtHome;
    if (!c || !(med > 0) || !(ageA >= c.age || ageB >= c.age)) return 0;
    const fb = rule.indexing.bpaIndexed ? taxIndexFactor(ctx, yearIndex) : 1,
      claimable = med - Math.min(0.03 * netClaimant, rule.medical.threshold * fb);
    if (!(claimable > 0)) return 0;
    return Math.max(0, c.rate * Math.min(c.maxExpenses, claimable) - c.reductionRate * Math.max(0, famNet - c.startIncome));
  }
  export function quebecHsf(ctx, income, yearIndex, h = currentProvince(ctx).rule.healthContributions.hsf) {
    const f = taxIndexFactor(ctx, yearIndex),
      t1 = h.t1 * f;
    if (!(income > t1)) return 0;
    const t2 = h.t2 * f;
    if (income <= t2) return Math.min(h.cap1, h.rate * (income - t1));
    return Math.min(h.cap2, h.cap1 + h.rate * (income - t2));
  }
  export function quebecRamq(ctx, familyIncome, couple, kids, yearIndex, r = currentProvince(ctx).rule.healthContributions.ramq) {
    const g = couple ? r.couple : r.single,
      f = taxIndexFactor(ctx, yearIndex),
      u = familyIncome / f - (g.exempt + (kids > 1 ? g.childMore : kids === 1 ? g.childOne : 0));
    if (!(u > 0)) return 0;
    let cap = RAMQ_CAP.get(g);
    if (cap === undefined) {
      const k = r.max / r.max2025;
      cap = r.step + (r.max / k - g.low * r.step) / g.high; // the income used at which the table reaches the maximum
      RAMQ_CAP.set(g, cap);
    }
    if (u >= cap) return f * r.max;
    return f * Math.min(r.max, ((g.low * Math.min(u, r.step) + g.high * Math.max(0, u - r.step)) * r.max) / r.max2025);
  }
  function lowIncomeFamilyReduction(ctx, li, ageA, ageB, couple, kidsU18, kids18, netA, netB, pTotal, yearIndex, indexed) {
    const fb = indexed ? taxIndexFactor(ctx, yearIndex) : 1,
      afi = netA + netB;
    const eligibility = li.eligibility;
    if (eligibility) {
      if (couple || kidsU18 > 0 ? !(afi < eligibility.familyBelow * fb) : !(afi < eligibility.singleBelow * fb)) return 0;
    }
    const dependant = !couple && kidsU18 > 0;
    let items = li.basic + (couple ? li.spouse : dependant ? li.dependant : 0) + li.child * (dependant ? Math.max(0, kids18 - 1) : kids18);
    if (li.age > 0) items += li.age * ((ageA >= 65 ? 1 : 0) + (couple && ageB >= 65 ? 1 : 0));
    const baseIncome = li.baseWithDependants !== null && (couple || dependant) ? li.baseWithDependants : li.base,
      r = items * fb - li.rate * Math.max(0, afi - baseIncome * fb);
    return r > 0 ? (r < pTotal ? r : pTotal) : 0;
  }
  export function payrollItems(ctx, wages, yearIndex) {
    PAY.cash = PAY.fedCredit = PAY.provCredit = PAY.deduction = PAY.provDeduction = 0;
    if (!(wages > 0)) return PAY;
    const f = taxIndexFactor(ctx, yearIndex),
      rule = currentProvince(ctx).rule,
      payroll = rule.payroll,
      band = Math.max(0, Math.min(wages, 74600 * f) - 3500 * f),
      base = band * (payroll.pensionRate - CPP_ENHANCED_RATE),
      enhanced = band * CPP_ENHANCED_RATE + Math.max(0, Math.min(wages, 85000 * f) - 74600 * f) * 0.04,
      ei = Math.min(wages, EI_MIE * f) * payroll.eiRate,
      qpip = payroll.premium ? Math.min(wages, payroll.premium.max * f) * payroll.premium.rate : 0,
      credit = base + ei + qpip;
    PAY.cash = base + enhanced + ei + qpip;
    PAY.deduction = enhanced;
    PAY.fedCredit = credit + Math.min(EMPLOYMENT_AMOUNT * f, wages);
    if (rule.pooled) PAY.provDeduction = Math.min(QC_WORKERS_DEDUCTION_RATE * wages, QC_WORKERS_DEDUCTION_MAX * f);
    else PAY.provCredit = credit;
    return PAY;
  }
  // Employee CPP/QPP, QPIP and EI contributions on this year's wages (net of pre-tax health
  // premiums), both partners. Separate from taxFor(), which covers income tax.
  export function payrollTax(ctx, { wageA, wageB, healthPremiumA, healthPremiumB, year }) {
    return (
      payrollItems(ctx, Math.max(0, wageA - healthPremiumA), year).cash +
      payrollItems(ctx, Math.max(0, wageB - healthPremiumB), year).cash
    );
  }
