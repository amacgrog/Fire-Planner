import { bandValue, BEN, BEN_NO_EXIT, countKids, familyCreditCA } from './benefit-helpers.js';
import { AGE_AMOUNT, AGE_AMOUNT_REDUCTION, AGE_AMOUNT_THRESHOLD, FEDERAL_ELIGIBLE_DTC, PENSION_INCOME_AMOUNT } from './credits-and-gross-up.js';
import { CPP_ENHANCED_RATE, EI_MIE, EMPLOYMENT_AMOUNT, PAY, QC_WORKERS_DEDUCTION_MAX, QC_WORKERS_DEDUCTION_RATE } from './ei-mie.js';
import { FED_MEDICAL_THRESHOLD } from './fed-medical-threshold.js';
import { federalBracketCeilingCA } from './federal-bracket-ceiling-ca.js';
import { FED_BPA_ENHANCED, FED_BPA_MIN, FED_BPA_PHASE_END, FED_BPA_PHASE_START, FED_CAPS, FED_CREDIT_RATE, FED_RATES } from './federal-tax-constants.js';
import { gisAnnual, gisEmploymentExemption, RRIF_PENSION_AGE } from './gis-and-rrif.js';
import { homeBuyerAmounts } from './list-amounts-and-home-buyers.js';
import { OAS_RECOVERY_THRESHOLD } from './oas-and-rrif.js';
import { OAS_RECOVERY } from './oas-recovery.js';
import { probateFee } from './probate-fee.js';
import { PROV_TAX } from './prov-tax.js';
import { BENEFIT_RULES, currentProvince, ontarioHealthPremium, scaledProgressiveTax } from './province-rules.js';
import { RAMQ_CAP } from './ramq-cap.js';
import { dependentsInYear, NO_DEPENDENTS } from '../../shared/core/lists-and-children.js';
import { CURRENT_YEAR } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';
import { taxIndexFactor } from '../../shared/core/tax-index-factor.js';

  export function federalTaxCA(income, yearIndex, extraCreditBase = 0, claimMinus = -1) {
    const factor = taxIndexFactor(yearIndex);
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
  export function quebecPoolAmount(age, pensionIncome, yearIndex) {
    const rule = currentProvince().rule,
      pool = rule.pooled;
    if (!pool) return 0;
    const g = rule.indexing.ageAmountIndexed ? taxIndexFactor(yearIndex) : 1;
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
  export function provincialTaxCA(income, yearIndex, dtcBase = 0, age = 0, pensionIncome = 0, familyIncome = null, partnerPool = 0, spouseNet = -1, depKids = 0, childKids = 0, extraCredit = 0, medical = 0, redKids = 0) {
    const c = currentProvince(),
      rule = c.rule,
      ix = rule.indexing,
      f = taxIndexFactor(yearIndex),
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
      let own = quebecPoolAmount(age, pensionIncome, yearIndex);
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
  export function oasClawback(netIncomeInclOas, oasReceived, yearIndex) {
    if (oasReceived <= 0) return 0;
    const factor = taxIndexFactor(yearIndex),
      threshold = OAS_RECOVERY_THRESHOLD * factor;
    return Math.min(oasReceived, Math.max(0, (netIncomeInclOas - threshold) * 0.15));
  }
  function ageAndPensionCreditBase(netIncome, age, pensionIncome, yearIndex) {
    let base = Math.min(PENSION_INCOME_AMOUNT, Math.max(0, pensionIncome));
    if (age >= 65) {
      const factor = taxIndexFactor(yearIndex);
      base += Math.max(
        0,
        AGE_AMOUNT * factor - AGE_AMOUNT_REDUCTION * Math.max(0, netIncome - AGE_AMOUNT_THRESHOLD * factor),
      );
    }
    return base;
  }
  export function personTaxCA(ordinaryIncome, gains, yearIndex, dtcBase = 0, age = 0, pensionIncome = 0, familyIncome = null, partnerPool = 0, oas = 0, spouseNet = -1, depKids = 0, childKids = 0, fedCredit = 0, provCredit = 0, provDeduction = 0, medical = 0, redKids = 0) {
    let taxableIncome = Math.max(0, ordinaryIncome + Math.max(0, gains) * 0.5),
      recovery = 0;
    if (oas > 0) {
      // oasClawback, inlined (hot path): 15% over the indexed threshold, up to the OAS received.
      const over = taxableIncome - OAS_RECOVERY_THRESHOLD * taxIndexFactor(yearIndex);
      if (over > 0) {
        recovery = over * 0.15 < oas ? over * 0.15 : oas;
        taxableIncome -= recovery;
      }
    }
    if (oas > 0) OAS_RECOVERY.last = recovery;
    let fedTax = federalTaxCA(
      taxableIncome,
      yearIndex,
      (age >= 65 || pensionIncome > 0 ? ageAndPensionCreditBase(taxableIncome, age, pensionIncome, yearIndex) : 0) +
        fedCredit +
        (medical > 0 ? Math.max(0, medical - Math.min(0.03 * taxableIncome, FED_MEDICAL_THRESHOLD * taxIndexFactor(yearIndex))) : 0),
      spouseNet >= 0 ? spouseNet : depKids > 0 ? 0 : -1,
    );
    if (dtcBase > 0) fedTax = Math.max(0, fedTax - dtcBase * FEDERAL_ELIGIBLE_DTC);
    if (state.province === 'qc') fedTax *= 0.835;
    const provTax = provincialTaxCA(provDeduction > 0 ? taxableIncome - provDeduction : taxableIncome, yearIndex, dtcBase, age, pensionIncome, familyIncome, partnerPool, spouseNet, depKids, childKids, provCredit, medical, redKids) + recovery;
    PROV_TAX.fed = fedTax; // with PROV_TAX.pre: a zero means the return had no tax left for a credit (the medical claim chooser)
    return fedTax + provTax;
  }
  export function incomeTaxCA(profile, gains = 0, traditionalExtra = 0) {
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
    const li = currentProvince().rule.lowIncomeReduction;
    // The household's eligible medical expenses (health premium and long-term care), claimed on one return.
    let med = profile.medical || 0;
    // Quebec health contributions (7N N7): the Health Services Fund on each return's non-employment income (OAS excluded, dividends at the
    // amount received) and the drug premium of every retired adult, which is also a medical expense.
    const hc = currentProvince().rule.healthContributions;
    let health = 0;
    OAS_RECOVERY.a = OAS_RECOVERY.b = 0;
    if (profile.singlePerson) {
      if (hc) {
        const netQ = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5),
          nonEmp = Math.max(0, netQ - (profile.earnedA || 0) - oasA - (profile.dtcA || 0) * 0.2753623);
        health = quebecHsf(nonEmp, profile.year, hc.hsf);
        if (!(profile.earnedA > 0)) {
          const ramq = quebecRamq(netQ, false, kids, profile.year, hc.ramq);
          health += ramq;
          med += ramq;
        }
      }
      const single = personTaxCA(
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
        return single - lowIncomeFamilyReduction(li, ageA, 0, false, kids, kids18, netS, 0, pSingle, profile.year, currentProvince().rule.indexing.bpaIndexed);
      }
      if (med > 0 && state.province === 'on') {
        const net = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5);
        return single - careAtHomeCredit(med, net, net, profile.year, ageA, 0);
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
      health = quebecHsf(nonEmpA, profile.year, hc.hsf) + quebecHsf(nonEmpB, profile.year, hc.hsf);
      const ramq = quebecRamq(family, true, kids, profile.year, hc.ramq);
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
    const medPrefB = med > 0 && medicalClaimToB(netA, netB, profile.year);
    // Ontario with a 70+ spouse: the claimant also sets the Seniors Care at Home credit, so both claimants are priced on tax less that credit.
    const careSwap = med > 0 && state.province === 'on' && (ageA >= 70 || ageB >= 70); // 70: the row's careAtHome.age
    let medToB = medPrefB,
      taxA = 0,
      taxB = 0,
      pA = 0,
      pB = 0,
      bestCost = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const toB = attempt === 0 ? medPrefB : !medPrefB;
      const tA = personTaxCA(profile.otherA + tradA, gainA, profile.year, profile.dtcA, ageA, pensionA, family, quebecPoolAmount(ageB, pensionB, profile.year), oasA, spouseA, 0, kidsA, profile.fedCreditA || 0, profile.provCreditA || 0, profile.provDedA || 0, toB ? 0 : med, netA >= netB ? kids18 : 0);
      const qA = PROV_TAX.last,
        fedA = PROV_TAX.fed,
        preA = PROV_TAX.pre;
      if (oasA > 0) OAS_RECOVERY.a = OAS_RECOVERY.last;
      const tB = personTaxCA(profile.otherB + tradB, gainB, profile.year, profile.dtcB, ageB, pensionB, family, quebecPoolAmount(ageA, pensionA, profile.year), oasB, spouseB, 0, kidsB, profile.fedCreditB || 0, profile.provCreditB || 0, profile.provDedB || 0, toB ? med : 0, netB > netA ? kids18 : 0);
      const qB = PROV_TAX.last,
        fedB = PROV_TAX.fed,
        preB = PROV_TAX.pre;
      if (oasB > 0) OAS_RECOVERY.b = OAS_RECOVERY.last;
      const cost = careSwap ? tA + tB - careAtHomeCredit(med, toB ? netB : netA, family, profile.year, ageA, ageB) : tA + tB;
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
    if (li && li.kind === 'family') reduction = lowIncomeFamilyReduction(li, ageA, ageB, true, kids, kids18, netA, netB, pA + pB, profile.year, currentProvince().rule.indexing.bpaIndexed);
    if (med > 0 && state.province === 'on') return taxA + taxB - careAtHomeCredit(med, medToB ? netB : netA, family, profile.year, ageA, ageB);
    return taxA + taxB - reduction + health;
  }
  // Canada taxFor is the household's net cost of income: income tax minus the income-tested benefits it
  // triggers. The shared withdrawal solvers (drawTaxable and the Canada solvers) price a withdrawal as the change
  // in taxFor, so with this definition they see lost GIS and the other benefits as a cost of withdrawing. The
  // benefits are tax-free cash, so net cash is the same as a separate inflow; the engine reports gross tax and
  // each benefit separately (see runProjection).
  export function taxFor(profile, gains = 0, traditionalExtra = 0) {
    return incomeTaxCA(profile, gains, traditionalExtra) - benefitsFor(profile, gains, traditionalExtra);
  }
  export function benefitsFor(profile, gains, traditionalExtra) {
    BEN.gis = BEN.allowance = BEN.ccb = BEN.cgeb = BEN.provChild = BEN.provSenior = BEN.provCredit = BEN.total = 0;
    const couple = !profile.singlePerson,
      f = taxIndexFactor(profile.year),
      trad = traditionalExtra || 0,
      g = gains || 0;
    // Family net income: each return's income plus half the extra RRSP draw and a quarter of the gains (50 percent
    // inclusion, split evenly), as taxFor does for Quebec's family income.
    const incA = Math.max(0, profile.otherA + (couple ? trad / 2 + g / 4 : trad + g * 0.5)),
      incB = couple ? Math.max(0, profile.otherB + trad / 2 + g / 4) : 0,
      fam = incA + incB;
    // Hot path: with no children, a family income above 125,000 (indexed) receives nothing from any program here (the
    // largest cutoff is the Ontario credit for a senior couple, nil at about 118,000; tests/benefits.js pins the boundary).
    // Manitoba (homeowners and renters credits) and Prince Edward Island (the Island Essentials Benefit) pay at any income, so they never take the exit.
    if (fam > 125000 * f && !(profile.dependents && profile.dependents.length) && !BEN_NO_EXIT[state.province]) return 0;
    const oasA = profile.oasA || 0,
      oasB = couple ? profile.oasB || 0 : 0,
      ageA = profile.ageA || 0,
      ageB = couple ? profile.ageB || 0 : 0;
    // GIS and the Allowances. A pensioner is 65 or older and receiving OAS this year.
    const pA = ageA >= 65 && oasA > 0,
      pB = couple && ageB >= 65 && oasB > 0;
    if (pA || pB || (!couple && profile.survivor && ageA >= 60 && ageA < 65)) {
      const exemption = gisEmploymentExemption(profile.earnedA || 0) + (couple ? gisEmploymentExemption(profile.earnedB || 0) : 0),
        gisInc = Math.max(0, fam - oasA - oasB - exemption);
      if (!couple) {
        if (pA) BEN.gis = gisAnnual('single', gisInc, f);
        else BEN.allowance = gisAnnual('survivorAllowance', gisInc, f);
      } else if (pA && pB) {
        BEN.gis = 2 * gisAnnual('spouseOas', gisInc, f);
      } else {
        const otherAge = pA ? ageB : ageA;
        // Table 4 (a spouse aged 60 to 64 on the Allowance) ends where that spouse's Allowance reaches 0; the pensioner
        // then continues on table 3 (a spouse who does not receive OAS or the Allowance), so the GIS is continuous.
        const alw = otherAge >= 60 && otherAge < 65 ? gisAnnual('coupleAllowance', gisInc, f) : 0;
        if (alw > 0) {
          BEN.gis = gisAnnual('couplePensioner', gisInc, f);
          BEN.allowance = alw;
        } else BEN.gis = gisAnnual('spouseNoOas', gisInc, f);
      }
    }
    // Canada Groceries and Essentials Benefit (ITA 122.5(3.005)): amounts and cutoffs scale with f from 2027.
    const kids = profile.dependents || NO_DEPENDENTS;
    {
      const R = BENEFIT_RULES.cgeb;
      let n = 0;
      for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.childMaxAge) n++;
      let a = R.adult * f;
      if (couple) a += (R.spouse + R.child * n) * f;
      else if (n > 0) a += (R.eligibleDependant + R.child * (n - 1) + R.singleParentExtra) * f;
      else a += Math.min(R.singleSupplement.max * f, Math.max(0, R.singleSupplement.rate * (fam - R.singleSupplement.from * f)));
      BEN.cgeb = Math.max(0, a - R.reduction.rate * Math.max(0, fam - R.reduction.from * f));
    }
    // Canada Child Benefit: per child by age band, reduced by the number of children on family net income.
    if (kids.length) {
      const R = BENEFIT_RULES.ccb;
      let n = 0,
        sum = 0;
      for (let i = 0; i < kids.length; i++) {
        const age = kids[i].age;
        if (age > R.amounts[1].maxAge) continue;
        n++;
        sum += (age <= R.amounts[0].maxAge ? R.amounts[0].amount : R.amounts[1].amount) * f;
      }
      if (n > 0) {
        const idx = Math.min(n, 4) - 1,
          RR = R.reduction,
          from1 = RR.from1 * f,
          from2 = RR.from2 * f;
        const red = fam <= from1 ? 0 : fam <= from2 ? RR.rate1[idx] * (fam - from1) : RR.base2[idx] * f + RR.rate2[idx] * (fam - from2);
        BEN.ccb = Math.max(0, sum - red);
      }
    }
    // Provincial paid benefits. The province row set is small and fixed, so dispatch is a switch on the code.
    switch (state.province) {
      case 'on': {
        // Ontario Sales Tax Credit: like the CGEB, per adult and child under 19, reduced over a threshold.
        const R = BENEFIT_RULES.ostc;
        let n = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.childMaxAge) n++;
        const people = (couple ? 2 : 1) + n,
          from = (couple || n > 0 ? R.reduction.from : R.reduction.fromSingle) * f;
        BEN.provCredit = Math.max(0, R.adult * f * people - R.reduction.rate * Math.max(0, fam - from));
        // Ontario Child Benefit: per child under 18, family total reduced over a threshold.
        const O = BENEFIT_RULES.ocb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= O.maxAge) m++;
        if (m > 0) BEN.provChild = Math.max(0, O.amountPerChild * f * m - O.reduction.rate * Math.max(0, fam - O.reduction.from * f));
        // Ontario senior homeowners property tax grant, then the Energy and Property Tax Credit (which reads it).
        // Occupancy cost is 20 percent of rent plus property tax (CRA 2026 calculation sheets, step 1).
        {
          const H = BENEFIT_RULES.oshptg,
            E = BENEFIT_RULES.oeptc,
            ptPaid = profile.propertyTaxPaid || 0,
            occ = E.rentRate * (profile.rentPaid || 0) + ptPaid,
            senior = ageA >= E.seniorAge || (couple && ageB >= E.seniorAge);
          let grant = 0;
          if (senior && ptPaid > 0 && fam < (couple ? H.coupleTo : H.singleTo)) grant = Math.max(0, H.max - H.rate * Math.max(0, fam - (couple ? H.coupleFrom : H.singleFrom)));
          if (occ > 0) {
            let childUnder18 = false;
            for (let i = 0; i < kids.length; i++) if (kids[i].age <= 17) childUnder18 = true;
            const P = senior ? E.senior : E.nonSenior,
              from = (couple ? P.fromCouple : childUnder18 ? P.fromSingleParent : P.fromSingle) * f,
              energy = Math.min(P.energyCap * f, occ),
              propertyTax = Math.min(Math.min(E.propertyTaxRate * occ, P.propertyTaxCap * f) + P.propertyTaxAdd * f, occ);
            let credit = Math.max(0, energy + propertyTax - E.reductionRate * Math.max(0, fam - from));
            // Step 5: with a grant, the credit plus the grant cannot exceed the energy component plus the occupancy cost.
            if (grant > 0) credit = Math.max(0, credit - Math.max(0, Math.max(0, grant + credit - energy) - occ));
            BEN.provCredit += credit;
          }
          BEN.provSenior += grant;
        }
        break;
      }
      case 'bc': {
        // BC Family Benefit: per child by order, a floor between the two thresholds, a second reduction above.
        const R = BENEFIT_RULES.bcfb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          let max = 0,
            floor = 0;
          for (let i = 0; i < m; i++) {
            max += R.amounts[Math.min(i, 2)];
            floor += R.floors[Math.min(i, 2)];
          }
          if (!couple) max += R.singleParentFirstChild;
          max *= f;
          floor *= f;
          const t1 = R.reduction.from1 * f,
            t2 = R.reduction.from2 * f;
          let v = max - R.reduction.rate * Math.max(0, fam - t1);
          if (fam <= t2) v = Math.max(v, floor);
          else v = Math.max(0, floor - R.reduction.rate * (fam - t2));
          BEN.provChild = Math.max(0, v);
        }
        break;
      }
      case 'ab': {
        // Alberta Child and Family Benefit: base reduced by child count over a threshold, plus a working component.
        const R = BENEFIT_RULES.acfb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const idx = Math.min(m, 4) - 1,
            earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0);
          const base = Math.max(0, R.baseMax[idx] * f - R.baseRate[idx] * Math.max(0, fam - R.baseFrom * f));
          const phaseIn = Math.min(R.workingMax[idx] * f, R.workingPhaseInRate * Math.max(0, earned - R.workingPhaseInFrom * f));
          const working = Math.max(0, phaseIn - R.workingRate[idx] * Math.max(0, fam - R.workingFrom * f));
          BEN.provChild = base + working;
        }
        // Alberta Seniors Benefit: needs a partner (or the person) receiving OAS; income is net income less OAS,
        // GIS and up to 3,600 of employment income; a couple is one benefit on combined income.
        const S = BENEFIT_RULES.absb;
        if (pA || pB) {
          const used = Math.max(0, fam - oasA - oasB - Math.min(S.employmentDeduction * f, (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0)));
          const row = couple ? S.couple : S.single;
          BEN.provSenior = Math.max(0, row.max * f - row.rate * used);
        }
        break;
      }
      case 'qc': {
        // Quebec Family Allowance: per child (plus a single-parent supplement once), linear between the reduction
        // threshold and the income where the minimum is reached.
        const R = BENEFIT_RULES.qcfa;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const from = (couple ? R.from.twoParent : R.from.oneParent) * f,
            to = R.to * f,
            share = fam <= from ? 0 : fam >= to ? 1 : (fam - from) / (to - from); // 0 = maximum, 1 = minimum
          let v = m * (R.perChild.max - (R.perChild.max - R.perChild.min) * share);
          if (!couple) v += R.singleParentSupplement.max - (R.singleParentSupplement.max - R.singleParentSupplement.min) * share;
          BEN.provChild = v * f;
        }
        // Quebec Solidarity Tax Credit (QST and housing components), Finance Quebec Table 4.
        {
          const S = BENEFIT_RULES.qcsol,
            W = BENEFIT_RULES.qcwp;
          let m = 0;
          for (let i = 0; i < kids.length; i++) if (kids[i].age <= S.childMaxAge) m++;
          const amount = (S.qst.basic + (couple ? S.qst.spouse + S.housing.couple : S.qst.livingAlone + S.housing.singleOrParent) + S.housing.child * m) * f;
          BEN.provCredit += Math.max(0, amount - S.reductionRate * Math.max(0, fam - S.reductionFrom * f));
          // Work premium: needs work income above the exclusion; maximum reached at the threshold, then reduced by family income.
          const earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0),
            exclusion = (couple ? W.exclusion.couple : W.exclusion.single) * f;
          if (earned > exclusion) {
            const sit = couple ? (m > 0 ? W.situations.coupleKids : W.situations.coupleNoKids) : m > 0 ? W.situations.singleParent : W.situations.alone,
              threshold = sit.threshold * f,
              premium = sit.rate * (Math.min(earned, threshold) - exclusion) - W.reductionRate * Math.max(0, fam - threshold);
            if (premium > 0) BEN.provCredit += premium;
          }
        }
        break;
      }
      case 'nb': {
        // Residential Property Tax Allowance: a stepped rebate by household income, never more than the property tax paid.
        const R = BENEFIT_RULES.nbpta,
          pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          let a = 0;
          for (let i = 0; i < R.tiers.length; i++)
            if (fam < R.tiers[i][0]) {
              a = R.tiers[i][1];
              break;
            }
          BEN.provCredit += Math.min(a, pt);
        }
        {
          // Child Tax Benefit, Working Income Supplement and School Supplement (gnb.ca, CRA New Brunswick page).
          const K = BENEFIT_RULES.nbctb,
            n = countKids(kids, 0, K.maxAge);
          if (n > 0) {
            BEN.provChild += Math.max(0, K.perChild * n - (n === 1 ? K.rateOne : K.rateMore) * Math.max(0, fam - K.from));
            const W = BENEFIT_RULES.nbwis,
              earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0);
            BEN.provChild += Math.max(0, Math.min(W.max, W.earnedRate * Math.max(0, earned - W.earnedFrom)) - W.incomeRate * Math.max(0, fam - W.incomeFrom));
            const Z = BENEFIT_RULES.nbss;
            if (fam <= Z.incomeMax) BEN.provChild += Z.perChild * countKids(kids, Z.minAge, Z.maxAge);
          }
          const H = BENEFIT_RULES.nbhst;
          BEN.provCredit += familyCreditCA(H, f, fam, couple, countKids(kids, 0, H.childMaxAge));
          if (BEN.gis + BEN.allowance > 0) BEN.provSenior += BENEFIT_RULES.nblisb.amount;
        }
        break;
      }
      case 'ns': {
        // Property Tax Rebate for Seniors: half of the property tax (15 to 800) for a household that receives GIS or an Allowance.
        const R = BENEFIT_RULES.nsptr,
          pt = profile.propertyTaxPaid || 0;
        if (pt > 0 && BEN.gis + BEN.allowance > 0) BEN.provSenior += Math.max(R.min, Math.min(R.max, R.share * pt));
        {
          // Child Benefit (the first child in full, later children half in the partial band) and Affordable Living Tax Credit.
          const C = BENEFIT_RULES.nsncb,
            n = countKids(kids, 0, C.maxAge);
          if (n > 0 && fam < C.zeroFrom) BEN.provChild += C.perChild * (fam < C.halfFrom ? n : 1 + (n - 1) * 0.5);
          const A = BENEFIT_RULES.nsaltc;
          BEN.provCredit += familyCreditCA(A, f, fam, couple, countKids(kids, 0, A.childMaxAge));
        }
        break;
      }
      case 'mb': {
        // Homeowners Affordability Tax Credit (school-tax proxy: the property tax) and the Seniors School Tax Rebate.
        const pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          const H = BENEFIT_RULES.mbhatc,
            S = BENEFIT_RULES.mbsstr;
          const credit = Math.min(H.max * f, pt);
          BEN.provCredit += credit;
          // The rebate is based on school taxes less the credit received: with the whole property tax as the proxy it is limited to what is left.
          if (ageA >= S.seniorAge || (couple && ageB >= S.seniorAge)) BEN.provSenior += Math.min(pt - credit, Math.max(0, S.max - S.rate * Math.max(0, fam - S.from)));
        }
        if ((profile.rentPaid || 0) > 0) {
          // Renters Affordability Tax Credit (Form MB479 lines 29 to 40): one credit per household, plus the seniors top-up
          // reduced by family income, never more than the rent paid.
          const T = BENEFIT_RULES.mbratc;
          let c = T.max * f;
          if (ageA >= T.seniorAge || (couple && ageB >= T.seniorAge)) c += Math.max(0, T.topUp * f - T.topUpRate * fam);
          BEN.provCredit += Math.min(profile.rentPaid, c);
        }
        {
          // Child Benefit: a straight line from the full amount to nil, steeper for up to three children.
          const M = BENEFIT_RULES.mbmcb,
            n = countKids(kids, 0, M.maxAge);
          if (n > 0 && fam < M.zero[n > M.zero.length ? M.zero.length - 1 : n - 1]) {
            const zero = M.zero[n > M.zero.length ? M.zero.length - 1 : n - 1];
            BEN.provChild += fam <= M.fullTo ? M.perChild * n : M.perChild * n * (1 - (fam - M.fullTo) / (zero - M.fullTo));
          }
          // 55 PLUS junior component (Regulation 64/90): each eligible person aged 55 to 64 gets the table amount at family income.
          const J = BENEFIT_RULES.mb55j,
            eA = ageA >= J.minAge && ageA <= J.maxAge,
            eB = couple && ageB >= J.minAge && ageB <= J.maxAge;
          // Regulation 64/90 s. 2(3)(a): not paid to a person eligible for OAS Act benefits, and the Allowance is one (the only
          // 55 to 64 candidate in a household that receives it is the Allowance recipient).
          if ((eA || eB) && BEN.allowance === 0) {
            const T = couple ? J.couple : J.single;
            let v = 0;
            if (fam <= T.from) v = T.max;
            else {
              const k = Math.max(1, Math.ceil((fam - T.from) / T.width - 1e-9));
              if (k <= T.values.length) v = T.values[k - 1];
            }
            BEN.provSenior += v * ((eA ? 1 : 0) + (eB ? 1 : 0));
          }
          // 55 PLUS senior component (Regulation 65/90): a pensioner (OAS recipient) gets the quarterly table amount for the household
          // type at income excluding OAS; a survivor 60 to 64 on the Allowance for the Survivor gets the survivor table.
          const Q = BENEFIT_RULES.mb55s;
          if (pA || pB) {
            const used = Math.max(0, fam - oasA - oasB);
            let T = Q.single,
              people = 1;
            if (couple) {
              if (pA && pB) {
                T = Q.bothPensioners;
                people = 2;
              } else {
                const otherAge = pA ? ageB : ageA;
                T = BEN.allowance > 0 && otherAge >= 60 && otherAge < 65 ? Q.spouseAllowance : Q.spouseNeither;
              }
            }
            BEN.provSenior += people * 4 * bandValue(T, used);
          } else if (!couple && profile.survivor && BEN.allowance > 0) BEN.provSenior += 4 * bandValue(Q.survivorAllowance, Math.max(0, fam));
        }
        break;
      }
      case 'sk': {
        // Low-Income Tax Credit and the Saskatchewan Income Plan (needs GIS; a straight line from the maximum to the nil point).
        const L = BENEFIT_RULES.sklitc;
        BEN.provCredit += familyCreditCA(L, f, fam, couple, countKids(kids, 0, L.childMaxAge));
        if (BEN.gis > 0 && (pA || pB)) {
          const S = BENEFIT_RULES.sksip,
            used = Math.max(0, fam - oasA - oasB);
          let row = S.single;
          if (couple) {
            if (pA && pB) row = S.couple;
            else {
              const otherAge = pA ? ageB : ageA;
              row = BEN.allowance > 0 && otherAge >= 60 && otherAge < 65 ? S.spouseAllowance : S.spouseUnder60;
            }
          }
          BEN.provSenior += Math.max(0, row.max * f * (1 - Math.max(0, used - row.flatTo * f) / ((row.zero - row.flatTo) * f)));
        }
        break;
      }
      case 'nl': {
        // Child Benefit (a straight line to nil), Income Supplement (basic, phase-in, spouse, children, phase-out) and Seniors Benefit.
        const C = BENEFIT_RULES.nlcb,
          I = BENEFIT_RULES.nlis,
          S = BENEFIT_RULES.nlsb,
          n = countKids(kids, 0, C.maxAge);
        if (n > 0 && fam < C.zero * f) {
          let total = 0;
          for (let i = 0; i < n; i++) total += (i < 3 ? C.monthly[i] : C.monthlyLater) * 12;
          total *= f;
          BEN.provChild += fam <= C.from * f ? total : Math.max(0, total * (1 - (fam - C.from * f) / ((C.zero - C.from) * f)));
          // Nutrition supplement: flat 150 a month for each child under five while the family is eligible for the Child Benefit.
          BEN.provChild += C.nutrition.monthly * 12 * countKids(kids, 0, C.nutrition.maxAge);
        }
        const k = countKids(kids, 0, I.childMaxAge),
          a = I.basic * f + Math.min(I.phaseInAdd * f, I.phaseInRate * Math.max(0, fam - I.phaseInFrom * f)) + (couple ? I.spouse * f : 0) + I.child * f * k;
        BEN.provCredit += Math.max(0, a - I.reduction.rate * Math.max(0, fam - I.reduction.from * f));
        if (ageA >= S.minAge || (couple && ageB >= S.minAge)) BEN.provSenior += Math.max(0, S.max * f - S.rate * Math.max(0, fam - S.from * f));
        break;
      }
      case 'pe': {
        // Child Benefit (two income steps) and the Island Essentials Benefit (flat, prorated down to a minimum, never nil).
        const C = BENEFIT_RULES.peicb,
          E = BENEFIT_RULES.peieb,
          n = countKids(kids, 0, C.maxAge);
        if (n > 0) {
          if (fam < C.lowTo) BEN.provChild += C.monthlyLow * 12 * n;
          else if (fam <= C.midTo) BEN.provChild += C.monthlyMid * 12 * n;
        }
        const big = couple || n > 0,
          max = big ? E.couple : E.single,
          zero = big ? E.coupleZero : E.singleZero;
        BEN.provCredit += fam <= E.fullTo ? max : fam >= zero ? E.min : max - ((max - E.min) * (fam - E.fullTo)) / (zero - E.fullTo);
        break;
      }
    }
    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;
    return BEN.total;
  }
  // How much more income (extra traditional draw) the household can take before GIS and the Allowances end:
  // the hook the Canada mixed-withdrawal batch (4A) reads for its income room. Zero when no GIS situation applies.
  // Not hot: bisection over benefitsFor (benefits never rise with income, so the bisection is valid, cliffs included).
  export function gisIncomeRoom(profile, gains, traditionalExtra) {
    const f = taxIndexFactor(profile.year);
    benefitsFor(profile, gains, traditionalExtra);
    if (BEN.gis + BEN.allowance <= 0) return 0;
    let lo = 0,
      hi = 200000 * f;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      benefitsFor(profile, gains, (traditionalExtra || 0) + mid);
      if (BEN.gis + BEN.allowance > 0) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  export function solveMeltdown(otherIncome, maxAvailable, yearIndex) {
    if (maxAvailable <= 0) return 0;
    const factor = taxIndexFactor(yearIndex);
    // Brackets apply to income itself (credits come off the tax), so the top of
    // the chosen bracket is the income to fill up to.
    const targetGross = federalBracketCeilingCA(state.meltdownBracket) * factor;
    if (otherIncome >= targetGross) return 0;
    return Math.min(maxAvailable, targetGross - otherIncome);
  }
  // Pension income splitting — up to 50% of one spouse's eligible pension
  // income (RRIF/RRSP annuity from age 65, employer pension at any age; CPP,
  // OAS, and RRSP lump-sum withdrawals are not eligible) may be reallocated
  // to the other spouse's return. Solved by ternary search since combined
  // tax is convex in the amount transferred between two progressive-tax
  // filers.
  export function solvePensionSplit(otherA, otherB, eligibleA, eligibleB, yearIndex, ageA = 0, ageB = 0, oasA = 0, oasB = 0, kids = 0, pay = null) {
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
        prefB = withMed && medicalClaimToB(nA, nB, yearIndex);
      const a1 = personTaxCA(nA, 0, yearIndex, 0, ageA, eligibleA - x, family, quebecPoolAmount(ageB, eligibleB + x, yearIndex), oasA, nA >= nB ? Math.max(0, nB) : -1, 0, nA <= nB ? kids : 0, pay ? pay.fedA : 0, pay ? pay.provA : 0, pay ? pay.dedA : 0, withMed && !prefB ? pay.med : 0, pay && nA >= nB ? pay.rk : 0),
        fedA = PROV_TAX.fed,
        preA = PROV_TAX.pre,
        b1 = personTaxCA(nB, 0, yearIndex, 0, ageB, eligibleB + x, family, quebecPoolAmount(ageA, eligibleA - x, yearIndex), oasB, nB > nA ? Math.max(0, nA) : -1, 0, nB < nA ? kids : 0, pay ? pay.fedB : 0, pay ? pay.provB : 0, pay ? pay.dedB : 0, withMed && prefB ? pay.med : 0, pay && nB > nA ? pay.rk : 0),
        fedB = PROV_TAX.fed,
        preB = PROV_TAX.pre,
        t1 = a1 + b1;
      // a claimant with no tax left wastes the credit: price the other return too and keep the cheaper
      if (!withMed || !(prefB ? (fedB === 0 && fedA > 0) || (preB === 0 && preA > 0) : (fedA === 0 && fedB > 0) || (preA === 0 && preB > 0))) return t1;
      const t2 = (personTaxCA(nA, 0, yearIndex, 0, ageA, eligibleA - x, family, quebecPoolAmount(ageB, eligibleB + x, yearIndex), oasA, nA >= nB ? Math.max(0, nB) : -1, 0, nA <= nB ? kids : 0, pay ? pay.fedA : 0, pay ? pay.provA : 0, pay ? pay.dedA : 0, withMed && !!prefB ? pay.med : 0, pay && nA >= nB ? pay.rk : 0) + personTaxCA(nB, 0, yearIndex, 0, ageB, eligibleB + x, family, quebecPoolAmount(ageA, eligibleA - x, yearIndex), oasB, nB > nA ? Math.max(0, nA) : -1, 0, nB < nA ? kids : 0, pay ? pay.fedB : 0, pay ? pay.provB : 0, pay ? pay.dedB : 0, withMed && !prefB ? pay.med : 0, pay && nB > nA ? pay.rk : 0));
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
  export function cppContribution(wages, yearIndex) {
    const f = taxIndexFactor(yearIndex),
      ympe = 74600 * f,
      yampe = 85000 * f,
      exemption = 3500 * f;
    const payroll = currentProvince().rule.payroll,
      cpp1 = Math.max(0, Math.min(wages, ympe) - exemption) * payroll.pensionRate,
      cpp2 = Math.max(0, Math.min(wages, yampe) - ympe) * 0.04;
    return payroll.premium ? cpp1 + cpp2 + Math.min(wages, payroll.premium.max * f) * payroll.premium.rate : cpp1 + cpp2;
  }
  export function medicalClaimToB(netA, netB, yearIndex) {
    const bpa = FED_BPA_MIN * taxIndexFactor(yearIndex);
    return netA <= netB ? netA < bpa : netB >= bpa;
  }
  // Ontario Seniors Care at Home Tax Credit (refundable): a household with someone 70 or older gets 25 percent of up to 6,000 of
  // the claimable medical expenses, reduced by 5 percent of family net income over 35,000 (ontario.ca, claimed on ON479).
  function careAtHomeCredit(med, netClaimant, famNet, yearIndex, ageA, ageB) {
    const rule = currentProvince().rule,
      c = rule.careAtHome;
    if (!c || !(med > 0) || !(ageA >= c.age || ageB >= c.age)) return 0;
    const fb = rule.indexing.bpaIndexed ? taxIndexFactor(yearIndex) : 1,
      claimable = med - Math.min(0.03 * netClaimant, rule.medical.threshold * fb);
    if (!(claimable > 0)) return 0;
    return Math.max(0, c.rate * Math.min(c.maxExpenses, claimable) - c.reductionRate * Math.max(0, famNet - c.startIncome));
  }
  export function afterTaxEstate(sim) {
    const e = sim.estate;
    if (!e || !sim.rows.length) return 0;
    const last = sim.rows[sim.rows.length - 1],
      y = last.year,
      f = taxIndexFactor(y),
      income = last.grossIncome - 0.5 * (e.lastGains || 0), // grossIncome carries the realized gains in full; net income counts half
      own = state.singlePerson || e.survivor ? income : income / 2,
      age = Math.max(last.age, last.ageB || 0),
      gains = Math.max(0, e.taxable - e.taxableBasis),
      tax = personTaxCA(own + e.traditional, gains, y, 0, age, 0) - personTaxCA(own, 0, y, 0, age, 0),
      probate = probateFee(currentProvince().rule, (e.taxable + e.cash + e.homeEquity) / f) * f;
    return last.total - Math.max(0, tax) - probate;
  }
  export function quebecHsf(income, yearIndex, h = currentProvince().rule.healthContributions.hsf) {
    const f = taxIndexFactor(yearIndex),
      t1 = h.t1 * f;
    if (!(income > t1)) return 0;
    const t2 = h.t2 * f;
    if (income <= t2) return Math.min(h.cap1, h.rate * (income - t1));
    return Math.min(h.cap2, h.cap1 + h.rate * (income - t2));
  }
  export function quebecRamq(familyIncome, couple, kids, yearIndex, r = currentProvince().rule.healthContributions.ramq) {
    const g = couple ? r.couple : r.single,
      f = taxIndexFactor(yearIndex),
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
  function lowIncomeFamilyReduction(li, ageA, ageB, couple, kidsU18, kids18, netA, netB, pTotal, yearIndex, indexed) {
    const fb = indexed ? taxIndexFactor(yearIndex) : 1,
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
  export function payrollItems(wages, yearIndex) {
    PAY.cash = PAY.fedCredit = PAY.provCredit = PAY.deduction = PAY.provDeduction = 0;
    if (!(wages > 0)) return PAY;
    const f = taxIndexFactor(yearIndex),
      rule = currentProvince().rule,
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
  // The tax profile handed to taxFor() for the year, and each partner's income. Canada taxes spouses as two individuals, so
  // `totalA`/`totalB` are each partner's own income (zero if deceased), and with
  // pension income splitting enabled up to half of eligible pension/RRIF income
  // moves between them to minimize combined tax (`splitA`/`splitB` after the
  // transfer). A deceased Partner A remaps the survivor into the A slot, because
  // taxFor()'s single-person branch reads only the A fields.
  export function buildTaxProfile({
    wageA,
    wageB,
    rrspContribA,
    rrspContribB,
    fhsaContribA,
    fhsaContribB,
    healthPremiumA,
    healthPremiumB,
    pensionA,
    pensionB,
    rrifA,
    rrifB,
    extraIncome,
    cppA,
    cppB,
    oasGrossA,
    oasGrossB,
    age,
    ageB,
    year,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    deceasedIsB,
    inv,
    rentPaid,
    propertyTaxPaid,
    homeBuyer = false,
    medical = 0,
  }) {
    // Payroll items per earner (7N N4): the enhanced CPP/QPP contribution is deducted from income, the base contribution,
    // EI and QPIP premiums and the employment amount become credit bases carried on the profile.
    const payA = { ...payrollItems(Math.max(0, wageA - healthPremiumA), year) },
      payB = { ...payrollItems(Math.max(0, wageB - healthPremiumB), year) };
    const earnedA = Math.max(0, wageA - rrspContribA - fhsaContribA - healthPremiumA),
      earnedB = Math.max(0, wageB - rrspContribB - fhsaContribB - healthPremiumB);
    const otherA =
        earnedA +
        pensionA +
        rrifA +
        extraIncome -
        payA.deduction,
      otherB =
        earnedB +
        pensionB +
        rrifB -
        payB.deduction;
    // Pension income splitting: up to 50% of eligible pension/RRIF income
    // may be reallocated between spouses to minimize combined federal +
    // provincial tax. CPP, OAS, and wages are not eligible.
    // It naturally disables once the household is effectively single
    // (either state.singlePerson, or one partner has died).
    const effectiveSingle = singlePerson || isSurvivorPeriod;
    const invToB = isSurvivorPeriod && deceasedIsA,
      shareA = effectiveSingle ? (invToB ? 0 : 1) : 0.5,
      shareB = effectiveSingle ? (invToB ? 1 : 0) : 0.5;
    // Income belongs to whoever is alive: a deceased partner's slot is zero,
    // and when Partner A is the one who died the survivor's own income
    // (wages/pension/RRIF, CPP, OAS) is Partner B's, plus the household's
    // extra-income streams, which live in Partner A's `otherA`. (Before this
    // was fixed, B's income was zeroed whenever effectiveSingle was true, so
    // a surviving Partner B owed almost no tax.)
    const aliveA = !(isSurvivorPeriod && deceasedIsA),
      aliveB = !singlePerson && !(isSurvivorPeriod && deceasedIsB);
    const totalA = aliveA ? otherA + cppA + oasGrossA + (inv.ordinary + inv.eligGrossed) * shareA : 0,
      totalB = aliveB
        ? otherB + (invToB ? extraIncome : 0) + cppB + oasGrossB + (inv.ordinary + inv.eligGrossed) * shareB
        : 0;
    // The home buyers' amount (a first-time buyer in the purchase year) goes on the higher-income partner's return.
    const hb = homeBuyer ? homeBuyerAmounts(state.province) : [0, 0],
      hbToB = !effectiveSingle && totalB > totalA;
    const splitPay = {
      fedA: payA.fedCredit + (hbToB ? 0 : hb[0]),
      provA: payA.provCredit + (hbToB ? 0 : hb[1]),
      dedA: payA.provDeduction,
      fedB: payB.fedCredit + (hbToB ? hb[0] : 0),
      provB: payB.provCredit + (hbToB ? hb[1] : 0),
      dedB: payB.provDeduction,
      med: medical,
      rk: countKids(dependentsInYear(CURRENT_YEAR + year), 0, 18),
    };
    const dtcA = inv.eligGrossed * shareA,
      dtcB = inv.eligGrossed * shareB;
    const eligibleA = pensionA + (age >= 65 ? rrifA : 0),
      eligibleBOwn = pensionB + (ageB >= 65 ? rrifB : 0),
      eligibleB = effectiveSingle ? 0 : eligibleBOwn;
    const splitTransfer =
      state.pensionSplitEnabled && !effectiveSingle
        ? solvePensionSplit(totalA, totalB, eligibleA, eligibleB, year, age, ageB, aliveA ? oasGrossA : 0, aliveB ? oasGrossB : 0, countKids(dependentsInYear(CURRENT_YEAR + year), 0, 17), splitPay)
        : 0;
    const splitA = totalA - splitTransfer,
      splitB = totalB + splitTransfer;
    const profile =
      isSurvivorPeriod && deceasedIsA
        ? { otherA: splitB, otherB: 0, dtcA: dtcB, dtcB: 0, penA: eligibleBOwn, penB: 0, ageA: ageB, ageB: null, singlePerson: true, year, oasA: oasGrossB, oasB: 0, earnedA: earnedB, earnedB: 0, survivor: true, dependents: dependentsInYear(CURRENT_YEAR + year), rentPaid, propertyTaxPaid, medical, fedCreditA: payB.fedCredit + hb[0], provCreditA: payB.provCredit + hb[1], provDedA: payB.provDeduction }
        : {
            otherA: splitA,
            otherB: splitB,
            dtcA,
            dtcB,
            penA: eligibleA - splitTransfer,
            penB: eligibleB + splitTransfer,
            ageA: age,
            ageB,
            singlePerson: effectiveSingle,
            year,
            oasA: aliveA ? oasGrossA : 0,
            oasB: aliveB ? oasGrossB : 0,
            earnedA,
            earnedB,
            survivor: isSurvivorPeriod,
            dependents: dependentsInYear(CURRENT_YEAR + year),
            rentPaid,
            propertyTaxPaid,
            medical,
            fedCreditA: splitPay.fedA,
            fedCreditB: splitPay.fedB,
            provCreditA: splitPay.provA,
            provCreditB: splitPay.provB,
            provDedA: splitPay.dedA,
            provDedB: splitPay.dedB,
          };
    return { aliveA, aliveB, totalA, totalB, splitA, splitB, profile };
  }
  // Employee CPP/QPP, QPIP and EI contributions on this year's wages (net of pre-tax health
  // premiums), both partners. Separate from taxFor(), which covers income tax.
  export function payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, year }) {
    return (
      payrollItems(Math.max(0, wageA - healthPremiumA), year).cash +
      payrollItems(Math.max(0, wageB - healthPremiumB), year).cash
    );
  }
  // How much RRSP to withdraw to net `targetNet` after tax, by bisection over
  // [0, min(balance, 3*target + 1)]. Used for the smooth-withdrawal RRSP share.
  export function solveTraditionalForNet(traditionalBal, targetNet, taxableGainGross, traditionalGross, profile) {
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    let lo = 0,
      hi = Math.min(traditionalBal, targetNet * 3 + 1);
    // Widen the bracket only when a benefit step leaves the net at its top short of the target (see drawTaxable).
    for (let w = 0; w < 12 && hi < traditionalBal && hi - (taxFor(profile, taxableGainGross, traditionalGross + hi) - baseTax) < targetNet; w++) {
      lo = hi;
      hi = Math.min(traditionalBal, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - (taxFor(profile, taxableGainGross, traditionalGross + mid) - baseTax);
      if (net < targetNet) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      tradNet = fromTrad - (taxFor(profile, taxableGainGross, traditionalGross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
  // Same job, but bisecting from [need, 6*need + 1]. The two brackets converge to
  // slightly different values (~1e-7 relative), so both are kept until the
  // numerics are unified deliberately; the default draw, the bond-reserve draw
  // and the historical engine use this one.
  export function solveTraditionalForNetFromNeed(traditionalBal, need, taxableGainGross, traditionalGross, profile) {
    if (traditionalBal <= 0 || need <= 0) return { fromTrad: 0, tradNet: 0 };
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    let lo = need,
      hi = need * 6 + 1;
    // Widen the bracket only when a benefit step leaves the net at its top short of the need (see drawTaxable).
    for (let w = 0; w < 12 && hi < traditionalBal && hi - (taxFor(profile, taxableGainGross, traditionalGross + hi) - baseTax) < need; w++) {
      lo = hi;
      hi = Math.min(traditionalBal, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - (taxFor(profile, taxableGainGross, traditionalGross + mid) - baseTax);
      if (net < need) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      tradNet = fromTrad - (taxFor(profile, taxableGainGross, traditionalGross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
