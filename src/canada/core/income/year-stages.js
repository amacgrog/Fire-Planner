import { countKids } from '../benefit-helpers.js';
import { homeBuyerAmounts } from '../list-amounts-and-home-buyers.js';
import { dependentsInYear } from '../../../shared/core/lists-and-children.js';
import { CURRENT_YEAR } from '../../../shared/core/spending-and-loans.js';
import { state } from '../../../shared/core/store.js';
import { solvePensionSplit, payrollItems } from '../federal-tax-ca.js';
import { medicalGrowth } from '../../../shared/core/year-factors.js';

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
  export function rrifMinPct(age) {
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
