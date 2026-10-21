import { PROVINCE_RULES } from '../tax/province-rules.js';
import { itemGrowthFactor, lumpExpenseHits } from '../../../shared/core/income/spending-and-loans.js';
import { state } from '../../../shared/core/store.js';
import { countKids } from '../benefits/benefits.js';
import { dependentsInYear } from '../../../shared/core/inputs/lists.js';
import { CURRENT_YEAR, medicalGrowth } from '../../../shared/core/projection/year-factors.js';
import { solvePensionSplit, payrollItems } from '../tax/tax.js';
import { BENEFIT_RULES } from '../benefits/benefit-rules.js';
import { pct } from '../../../shared/core/format/numbers.js';

  // Home buyers' amounts for a first-time buyer in the purchase year (7N N10): the federal 10,000 and the province's own
  // (Saskatchewan 15,000 from 2025, Quebec 10,000 = the 1,400 maximum at its 14% rate), each a non-refundable credit base.
  // Statutory flat amounts, not indexed. One claim on the higher-income partner's return.
  const HOME_BUYERS_AMOUNT = 10000;
  export function homeBuyerAmounts(code) {
    const rule = PROVINCE_RULES[code];
    return [HOME_BUYERS_AMOUNT, rule && rule.homeBuyer ? rule.homeBuyer.amount : 0];
  }
  // ---- Per-year helpers shared by simulate() and simulateHistoricalCore() ----
  // This year's amounts from the add-as-you-go lists: recurring extra income
  // and extra expenses (active between their start and end age, growing with
  // inflation or their own rate), one-time income at an exact age, and lump
  // expenses (which may repeat). Ages are Partner A's.
  export function listAmountsForYear({ age, year, factor, incomeFactor }) {
    const extraIncome = state.incomeSources
      .filter((s) => age >= s.startAge && age <= s.endAge)
      .reduce((sum, s) => sum + s.amount * itemGrowthFactor(s, year, 'income', factor, incomeFactor), 0);
    const oneTimeAmount = state.oneTimeIncome
      .filter((o) => Math.round(o.age) === age)
      .reduce((sum, o) => sum + o.amount * (o.flat ? 1 : factor), 0);
    const extraExpense = state.extraExpenses
      .filter((e) => age >= e.startAge && age <= e.endAge)
      .reduce((sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor), 0);
    const lumpExpense = state.lumpExpenses
      .filter((e) => lumpExpenseHits(e, age))
      .reduce((sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor), 0);
    return { extraIncome, oneTimeAmount, extraExpense, lumpExpense };
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
  // Healthcare and long-term-care cost for the year. Provincial coverage is
  // universal at every age, so `healthcare` is the supplemental private
  // insurance once retired (flat; no age-65 change in Canada).
    // A couple is assumed to have coverage available for both partners as
    // long as either one is still working — a retired partner isn't
    // paying for private supplemental insurance solo while their spouse
    // still has a job-based plan they can be added to. So for a couple,
    // this cost doesn't apply until BOTH partners have stopped working.
    // Single-person and survivor cases are unaffected — there's no
    // spouse's plan to fall back on.
  export function healthcareCost({ workingA, workingB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, factor, year, age, ageB }) {
    const bothRetired = !workingA && !workingB;
    const healthcare = singlePerson
      ? (workingA ? 0 : state.healthcare) * factor * medicalGrowth(year)
      : isSurvivorPeriod
        ? ((deceasedIsA ? workingB : workingA) ? 0 : state.healthcare / 2) * factor * medicalGrowth(year)
        : (bothRetired ? state.healthcare : 0) * factor * medicalGrowth(year);
    const ltc = state.ltcEnabled
      ? (age >= state.ltcAgeA && !(isSurvivorPeriod && deceasedIsA) ? state.ltcYearlyA : 0) *
          factor * medicalGrowth(year) +
        (!singlePerson && ageB >= state.ltcAgeB && !(isSurvivorPeriod && deceasedIsB)
          ? state.ltcYearlyB
          : 0) *
          factor * medicalGrowth(year)
      : 0;
    return { healthcare, ltc };
  }
  // RRIF minimum withdrawal factors (CRA prescribed factors). An RRSP must be
  // converted to a RRIF by the end of the year the holder turns 71; ages
  // 65-70 use the 1/(90-age) formula for a RRIF opened voluntarily before
  // then, though this planner only applies the minimum starting at 71 to
  // match its simplified single conversion-age assumption.
  function rrifMinPct(age) {
    if (age < 71) return 0;
    const table = {
      71: 0.0528,
      72: 0.054,
      73: 0.0553,
      74: 0.0567,
      75: 0.0582,
      76: 0.0598,
      77: 0.0617,
      78: 0.0636,
      79: 0.0658,
      80: 0.0682,
      81: 0.0708,
      82: 0.0738,
      83: 0.0771,
      84: 0.0808,
      85: 0.0851,
      86: 0.0899,
      87: 0.0955,
      88: 0.1021,
      89: 0.1099,
      90: 0.1192,
      91: 0.1306,
      92: 0.1449,
      93: 0.1634,
      94: 0.1879,
    };
    return age >= 95 ? 0.2 : table[age] || 0.2;
  }
  // RRSP, TFSA and FHSA contributions for one year, from each partner's modeled
  // wage (zero once retired). RRSP room is 18% of wages up to the dollar limit;
  // the TFSA and FHSA take a percent of wages up to their annual limits (2026
  // values scaled by limitFactor). The FHSA is only open while saving for a
  // future purchase (rentThenBuy, before the buy year) and has a $40,000
  // lifetime cap, so the caller passes what each partner has already put in.
  // Returns RRSP amounts as traditionalContrib and TFSA amounts as rothContrib.
  export function retirementContributions({ wageA, wageB, year, limitFactor, futureBuy, fhsaUsedA, fhsaUsedB }) {
    const rrspRoomA = Math.min(wageA * 0.18, 33810 * limitFactor),
      rrspRoomB = Math.min(wageB * 0.18, 33810 * limitFactor);
    const rrspContribA = Math.min(wageA, rrspRoomA) * pct(state.rrspPctA),
      rrspContribB = Math.min(wageB, rrspRoomB) * pct(state.rrspPctB);
    const tfsaLimit = 7000 * limitFactor,
      tfsaContribA = Math.min(wageA * pct(state.tfsaPctA), tfsaLimit),
      tfsaContribB = Math.min(wageB * pct(state.tfsaPctB), tfsaLimit);
    const traditionalContrib = rrspContribA + rrspContribB,
      rothContrib = tfsaContribA + tfsaContribB;
    const fhsaAnnualCap = 8000 * limitFactor,
      fhsaLifetimeCap = 40000;
    const fhsaEligible = state.tenure === 'rentThenBuy' && year < futureBuy.buyYear;
    const fhsaContribA = fhsaEligible
      ? Math.max(
          0,
          Math.min(wageA * pct(state.fhsaPctA), fhsaAnnualCap, fhsaLifetimeCap - fhsaUsedA),
        )
      : 0;
    const fhsaContribB = fhsaEligible
      ? Math.max(
          0,
          Math.min(wageB * pct(state.fhsaPctB), fhsaAnnualCap, fhsaLifetimeCap - fhsaUsedB),
        )
      : 0;
    const fhsaContrib = fhsaContribA + fhsaContribB;
    return { rrspContribA, rrspContribB, fhsaContribA, fhsaContribB, fhsaContrib, traditionalContrib, rothContrib };
  }
  // CPP and OAS (gross, before the OAS recovery tax that personTaxCA charges) for the year: each partner's own
  // benefit once they reach their start age, inflated by `factor`. In the
  // survivor period the household keeps the greater CPP (a simplified survivor swap, not the full CPP survivor-benefit rules)
  // and the survivor's OWN OAS (never inherited; 7N N9).
  // OAS 75-plus step: the pension is increased 10 percent from age 75 (permanent since July 2022; the ESDC
  // maximums are 762.50 a month at 65 to 74 and 838.75 at 75 and over, a ratio of exactly 1.10). The OAS
  // input is the 65 to 74 amount in today's dollars; this factor is applied by the partner's actual age.
  // Deferral increases (0.6 percent a month, up to 36 percent at 70) are not applied: raise the input.
  export function oasAgeFactor(age) {
    const f = BENEFIT_RULES.oas.ageFactors;
    return age >= f[0].from ? f[0].factor : 1;
  }
  export function cppAndOasIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }) {
    let cppA = (age >= state.cppStartAgeA ? state.cppMonthlyA * 12 : 0) * factor,
      cppB = singlePerson
        ? 0
        : (ageB >= state.cppStartAgeB ? state.cppMonthlyB * 12 : 0) * factor;
    let oasGrossA = (age >= state.oasStartAgeA ? state.oasMonthlyA * 12 * oasAgeFactor(age) : 0) * factor,
      oasGrossB = singlePerson
        ? 0
        : (ageB >= state.oasStartAgeB ? state.oasMonthlyB * 12 * oasAgeFactor(ageB) : 0) * factor;
    if (isSurvivorPeriod) {
      // Simplified survivor-benefit swap: the survivor keeps the greater
      // of the two benefits (each computed as if both were still alive),
      // rather than modeling full CPP survivor pension / OAS allowance
      // rules.
      // OAS is never inherited (7N N9): the survivor keeps their OWN OAS, with their own start age and their own 75-plus step (none
      // before their start age; a survivor under 65 may get the Allowance for the Survivor instead, see benefitsFor). Only the CPP keeps
      // the greater-of simplification.
      const survivorCpp = Math.max(cppA, cppB);
      if (deceasedIsA) {
        cppA = 0;
        oasGrossA = 0;
        cppB = survivorCpp;
      } else {
        cppB = 0;
        oasGrossB = 0;
        cppA = survivorCpp;
      }
    }
    return { cppA, cppB, oasGrossA, oasGrossB };
  }
  // Mandatory RRIF minimum withdrawals for the year, from the pooled RRSP/RRIF
  // balance. Each partner is assumed to own half (the whole balance once only
  // one partner remains), and the deceased partner's minimum drops out in the
  // survivor period. rrifA/rrifB are ordinary income; `rmd` is capped at the balance.
  export function requiredDistributions({
    traditional,
    bondTraditional,
    age,
    ageB,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
  }) {
    const traditionalBeforeRmd = traditional + bondTraditional,
      traditionalShare =
        singlePerson || isSurvivorPeriod ? traditionalBeforeRmd : traditionalBeforeRmd / 2;
    let rrifA = rrifMinPct(age) * traditionalShare,
      rrifB = !singlePerson ? rrifMinPct(ageB) * traditionalShare : 0;
    if (isSurvivorPeriod) {
      if (deceasedIsA) rrifA = 0;
      else rrifB = 0;
    }
    const rmd = Math.min(traditionalBeforeRmd, rrifA + rrifB);
    return { traditionalBeforeRmd, rrifA, rrifB, rmd };
  }
  // Shelter cost for one year: rent, or (once a home is owned) mortgage payment
  // + maintenance + property tax and insurance, plus the one-off cash cost in
  // the year a future purchase happens. In the purchase year the FHSA balance
  // pays part of that cost first, and whatever is left rolls tax-free into the
  // TFSA (simplified; CRA also allows a tax-free RRSP rollover).
  // Also reports the balance-sheet change that comes with it: `mortgage` is the
  // loan balance when it changes this year, `homeValue` the home's value in the
  // purchase year, `fhsaToRoth` the FHSA amount moving to the TFSA (the caller
  // then empties the FHSA); each is null when nothing changes. projectedExpense()
  // reads only `.housing` and passes no FHSA balance.
  export function housingForYear(year, factor, schedule, futureBuy, fhsa = 0) {
    const ownsHome =
      state.tenure === 'own' || (state.tenure === 'rentThenBuy' && year >= futureBuy.buyYear);
    const propCosts = ownsHome
      ? state.propertyTax * Math.pow(1 + pct(state.propertyTaxGrowth), year) +
        state.homeInsurance * Math.pow(1 + pct(state.homeInsuranceGrowth), year)
      : 0;
    const rent = state.rent * 12 * Math.pow(1 + pct(state.rentGrowth), year);
    const propertyTaxPaid = ownsHome ? state.propertyTax * Math.pow(1 + pct(state.propertyTaxGrowth), year) : 0;
    if (state.tenure === 'own') {
      const annualPI = schedule.payments[year] || 0;
      return {
        housing: annualPI + state.maintenance * factor + propCosts,
        mortgage: schedule.balances[year] || 0,
        homeValue: null,
        fhsaToRoth: null,
        rentPaid: 0,
        propertyTaxPaid,
      };
    }
    if (state.tenure === 'rent' || year < futureBuy.buyYear)
      return { housing: rent, mortgage: null, homeValue: null, fhsaToRoth: null, rentPaid: rent, propertyTaxPaid: 0 };
    const buyAnnualPI = futureBuy.buySchedule.payments[year] || 0;
    let purchaseCashNet = year === futureBuy.buyYear ? futureBuy.purchaseCash : 0;
    let fhsaToRoth = null;
    if (year === futureBuy.buyYear) {
      const fromFhsa = Math.min(fhsa, purchaseCashNet);
      purchaseCashNet -= fromFhsa;
      fhsaToRoth = fhsa - fromFhsa;
    }
    return {
      housing: buyAnnualPI + state.maintenance * factor + propCosts + purchaseCashNet,
      mortgage: futureBuy.buySchedule.balances[year] || 0,
      homeValue: year === futureBuy.buyYear ? futureBuy.homeValueAtPurchase : null,
      fhsaToRoth,
      rentPaid: 0,
      propertyTaxPaid,
    };
  }
