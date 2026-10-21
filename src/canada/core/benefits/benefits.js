import { BENEFIT_RULES } from './benefit-rules.js';
import { NO_DEPENDENTS } from '../../../shared/core/lists-and-children.js';
import { state } from '../../../shared/core/store.js';
import { taxIndexFactor } from '../../../shared/core/tax-index-factor.js';

  // Income-tested benefits for one year (annual dollars). Fills the module-level scratch object BEN (read the
  // lines with getBenefits() right after the call; any later benefitsFor call overwrites them) and returns the
  // total. Allocation-free. Evaluation order: GIS and Allowance first (their results gate the provincial seniors
  // programs), then the child and sales-tax programs. Same-year income stands in for the prior-year return.
  // Children whose age is within [minAge, maxAge] (the list is dependentsInYear; allocation-free).
  export function countKids(kids, minAge, maxAge) {
    let n = 0;
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i].age;
      if (a >= minAge && a <= maxAge) n++;
    }
    return n;
  }
  // Family credit in the shape of the CGEB: an amount for the adult, for a spouse or an eligible dependant (a single parent) and for
  // each child (at most childCap), reduced over a threshold. dependantReplacesChild: the first child of a single parent counts as the
  // eligible dependant instead of as a child. Amounts and thresholds scale with the plan inflation factor when the row is indexed.
  function familyCreditCA(R, f, fam, couple, n) {
    const fx = R.indexing.amountsAndThresholds ? f : 1,
      m = n > R.childCap ? R.childCap : n;
    let a = R.adult * fx;
    if (couple) a += (R.spouse + R.child * m) * fx;
    else if (m > 0) a += (R.eligibleDependant + R.child * (R.dependantReplacesChild ? m - 1 : m)) * fx;
    return Math.max(0, a - R.reduction.rate * Math.max(0, fam - R.reduction.from * fx));
  }
  // A band table keyed by income: bands of equal width starting at `shift`; income below the first band gets the first value, income past
  // the last band gets nothing (Manitoba 55 PLUS senior component).
  function bandValue(T, x) {
    const k = Math.floor((x - T.shift) / T.width + 1e-9);
    return k < 0 ? T.values[0] : k >= T.values.length ? 0 : T.values[k];
  }
  // Provinces whose programs pay at any income (no income test), so benefitsFor must not take the high-income early exit.
  const BEN_NO_EXIT = { mb: true, pe: true };
  export const BEN = { gis: 0, allowance: 0, ccb: 0, cgeb: 0, provChild: 0, provSenior: 0, provCredit: 0, total: 0 };
  export function getBenefits() {
    return { ...BEN };
  }
  // ---- Income-tested benefit evaluators (7L) ----
  // Linear interpolation over [income, benefit] knots; zero past the last knot; a repeated income is a cliff.
  export function interpKnots(k, x) {
    if (!(x > 0)) x = 0;
    const n = k.length;
    if (x >= k[n - 1][0]) return k[n - 1][1];
    for (let i = 1; i < n; i++) {
      if (x < k[i][0]) {
        const xa = k[i - 1][0];
        return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (x - xa)) / (k[i][0] - xa);
      }
    }
    return 0;
  }
  // Annual GIS (or Allowance) for one household situation at an annual income (net income less OAS and the
  // employment exemption, combined for couples). `factor` is the plan inflation factor: amounts and income
  // cutoffs scale together.
  export function gisAnnual(situation, income, factor = 1) {
    return interpKnots(BENEFIT_RULES.gis.situations[situation], income / factor) * factor;
  }
  // GIS employment income exemption: the first 5,000 is exempt and half of the next 10,000 (per person).
  export function gisEmploymentExemption(earned) {
    const e = BENEFIT_RULES.gis.employmentExemption;
    return Math.min(earned, e.full) + 0.5 * Math.min(Math.max(earned - e.full, 0), e.halfBand);
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
