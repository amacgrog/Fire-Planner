import { rrifMinPct } from './oas-and-rrif.js';
import { BENEFIT_RULES } from './province-rules.js';
import { pct } from '../../shared/core/basics.js';
import { state } from '../../shared/core/store.js';

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
