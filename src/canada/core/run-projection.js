import { BEN } from './benefit-helpers.js';
import { investmentIncomeCA } from './credits-and-gross-up.js';
import { payrollTax, taxFor } from './federal-tax-ca.js';
import { growBalances } from './grow-balances.js';
import { cppAndOasIncome, housingForYear, requiredDistributions, retirementContributions } from './income-and-housing-per-year.js';
import { listAmountsForYear } from './list-amounts-and-home-buyers.js';
import { OAS_RECOVERY } from './oas-recovery.js';
import { newWithdrawal } from './withdrawals/draws.js';
import { withdrawStandard } from './withdraw-standard.js';
import { routeSurplus } from './year-modes.js';
import { paychecksPerYear, pct } from '../../shared/core/basics.js';
import { makeProjectedExpense } from '../../shared/core/projected-expense.js';
import { planBondLadder } from '../../shared/core/bond-ladder.js';
import { withdrawBucket } from '../../shared/core/bucket-down-year-order.js';
import { loanPaymentForYear } from '../../shared/core/loan-payment-for-year.js';
import { guardrailSpendingMultiplier, mortgageResultAges, newGuardrails, recordGuardrailWithdrawal } from '../../shared/core/next-guardrail-multiplier.js';
import { pensionIncome } from '../../shared/core/pension-income.js';
import { baseSpendingNominal, futureHomePurchase, loanSchedules, mortgageSchedule } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';
import { rotateIntoBondLadder } from '../../shared/core/bond-ladder-rotation.js';
import { sweepExcessCash } from '../../shared/core/sweep-excess-cash.js';
import { getBondYears, medicalGrowth } from '../../shared/core/year-factors.js';
import { benefitsFor } from './benefits/benefits.js';
import { solveMeltdown, applyRrspMeltdown } from './withdrawals/rrsp-meltdown.js';
import { buildTaxProfile, healthcareCost } from './income/year-stages.js';
import { withdrawRequiredDistributions } from './projection/balances.js';

  // The projection engine, one year at a time, for both the standard projection and the
  // historical/Monte Carlo backtest. Everything that is the same lives here; the two
  // differences are injected:
  //  - `source` supplies each year's stock return, bond return, bond interest yield and
  //    inflation factor (standardYearSource: constant plan assumptions; historicalYearSource:
  //    a row of the 1928-2025 dataset or a bootstrapped path);
  //  - `mode` selects the withdrawal strategy and the explicit capability switches below
  //    (STANDARD_MODE / BUCKET_MODE).
  // Called thousands of times per render (comparison lines, each Monte Carlo path, each
  // sensitivity sweep), so it must stay cheap.
  export function runProjection({ mode, source, retireAgeA, retireAgeB }) {
    const singlePerson = !!state.singlePerson;
    if (singlePerson) retireAgeB = retireAgeA;
    // Only the historical source reports a start year; it also adds cumFactor to each row.
    const isHistorical = source.startYear !== undefined;
    const hysa = pct(state.hysaRate),
      wageGrowth = pct(state.incomeGrowth),
      homeGrowth = pct(state.homeGrowth);
    const futureBuy = state.tenure === 'rentThenBuy' ? futureHomePurchase(homeGrowth) : null;
    const bal = {
      taxable: state.taxable,
      taxableBasis: state.taxable * pct(state.basisRatio),
      bondTaxable: 0,
      bondTaxableBasis: 0,
      bondTraditional: 0,
      bondRoth: 0,
      traditional: state.traditional,
      roth: state.roth,
      cash: state.cash,
      home: state.tenure === 'own' ? state.homeValue : 0,
      mortgage: state.tenure === 'own' ? state.mortgage : 0,
      fhsa: state.fhsa,
    };
    let fhsaUsedA = 0,
      fhsaUsedB = 0;
    const schedule = mortgageSchedule(),
      loans = loanSchedules(),
      rows = [],
      magiHistory = [];
    let depletedAge = null,
      firstWithdrawal = 0;
    // Guyton-Klinger guardrails (simplified, opt-in): once the first
    // portfolio withdrawal occurs, that year's draw as a fraction of the
    // portfolio value just before it is taken becomes the "initial
    // withdrawal rate" baseline. In later withdrawal years, if the prior
    // year's rate ran materially above that baseline (capital-preservation
    // rule) or below it (prosperity rule), household discretionary spending
    // is nudged down or up by 10% (persisting until the next trigger, capped
    // to a 0.5x-1.5x band) — a lagged proxy, since this year's own
    // withdrawal need can't be known before this year's spending is set.
    const guardrails = newGuardrails();
    // Survivor modeling (simplified, opt-in): from the chosen partner's
    // death age onward, the household switches to single filing, the
    // survivor keeps the greater of the two CPP benefits (a simplified
    // survivor-benefit swap) and their own OAS (never inherited), the
    // deceased partner's pension/LTC/healthcare share drops out, the full
    // RRSP/RRIF balance consolidates under the survivor's own minimum-
    // withdrawal schedule, pension income splitting disables itself (it
    // needs two living spouses), household spending is cut to a
    // configurable percentage, and any "other loans" balance is paid off
    // as a lump sum in the year of death (approximating debts settled
    // through probate before the estate passes to the survivor) — the
    // mortgage is untouched since it's secured by jointly-titled real
    // estate. Only meaningful once both partners are otherwise retired.
    const deceasedIsA = state.survivorEnabled && !singlePerson && state.survivorPartner === 'A',
      deceasedIsB = state.survivorEnabled && !singlePerson && state.survivorPartner === 'B',
      deathYear = deceasedIsA
        ? state.survivorDeathAge - state.ageA
        : deceasedIsB
          ? state.survivorDeathAge - state.ageB
          : Infinity;
    // A partner who dies before their retirement age stops working at death (E1b): every rule keyed on the
    // retirement age (wages, contributions, health premiums, the both-retired year, the bond ladder) follows.
    if (deceasedIsA) retireAgeA = Math.min(retireAgeA, state.survivorDeathAge);
    if (deceasedIsB) retireAgeB = Math.min(retireAgeB, state.survivorDeathAge);
    const retirementYear = singlePerson
      ? Math.max(0, retireAgeA - state.ageA)
      : Math.max(0, retireAgeA - state.ageA, retireAgeB - state.ageB);
    const bondYears = getBondYears();
    // The pre-retirement ladder is sized once from the plan's assumed inflation (not the path's),
    // in both engines; it also feeds currentExpense/retirementExpense/ladderTarget.
    const projectedExpense = makeProjectedExpense({ infl: source.inflation, wageGrowth, schedule, futureBuy, singlePerson, retireAgeA, retireAgeB });
    const ladder = planBondLadder({ retirementYear, bondYears, projectedExpense });
    const projectionYears = singlePerson
      ? Math.max(0, state.lifeExpectancyA - state.ageA)
      : Math.max(0, state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    let lastGains = 0; // the last year's realized gains, for the after-tax estate
    for (let age = state.ageA, year = 0; year <= projectionYears; age++, year++) {
      const { stockReturn, bondReturn, bondYield, factor, limitFactor } = source.yearInputs(year);
      const ageB = singlePerson ? null : state.ageB + year,
        workingA = age < retireAgeA,
        workingB = !singlePerson && ageB < retireAgeB,
        working = workingA || workingB,
        isSurvivorPeriod = year >= deathYear;
      const incomeFactor = Math.pow(1 + wageGrowth, year);
      const wageA = workingA ? state.incomeA * incomeFactor : 0,
        wageB = workingB ? state.incomeB * incomeFactor : 0,
        matchA = workingA ? wageA * pct(state.matchA) : 0,
        matchB = workingB ? wageB * pct(state.matchB) : 0,
        employerMatch = matchA + matchB;
      const { extraIncome, oneTimeAmount, extraExpense, lumpExpense } = listAmountsForYear({ age, year, factor, incomeFactor });
      const paychecks = paychecksPerYear[state.payFrequency] || 26;
      const healthPremiumA = workingA ? state.healthPremiumA * paychecks * factor * medicalGrowth(year) : 0,
        healthPremiumB = !singlePerson && workingB ? state.healthPremiumB * paychecks * factor * medicalGrowth(year) : 0;
      const wages =
        wageA + wageB + extraIncome - healthPremiumA - healthPremiumB;
      const { rrspContribA, rrspContribB, fhsaContribA, fhsaContribB, fhsaContrib, traditionalContrib, rothContrib } =
        retirementContributions({ wageA, wageB, year, limitFactor, futureBuy, fhsaUsedA, fhsaUsedB });
      fhsaUsedA += fhsaContribA;
      fhsaUsedB += fhsaContribB;
      const { cppA, cppB, oasGrossA, oasGrossB } =
        cppAndOasIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
      const { pensionA, pensionB, pension } =
        pensionIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
      const { traditionalBeforeRmd, rrifA, rrifB, rmd } = requiredDistributions({
        traditional: bal.traditional,
        bondTraditional: bal.bondTraditional,
        age,
        ageB,
        singlePerson,
        isSurvivorPeriod,
        deceasedIsA,
      });
      const housingYear = housingForYear(year, factor, schedule, futureBuy, bal.fhsa);
      const housing = housingYear.housing;
      if (housingYear.mortgage !== null) bal.mortgage = housingYear.mortgage;
      if (housingYear.homeValue !== null) bal.home = housingYear.homeValue;
      if (housingYear.fhsaToRoth !== null) {
        bal.roth += housingYear.fhsaToRoth;
        bal.fhsa = 0;
      }
      const { loanPayment } = loanPaymentForYear({ year, deathYear, isSurvivorPeriod, loans });
      // Dividends/interest earned this year on start-of-year balances, taxed
      // now. A couple is assumed to hold the taxable account jointly, so the
      // income splits evenly; a household that is effectively single puts it
      // all on the surviving partner's return (the B slot when Partner A is
      // the deceased, matching how the profile below is remapped).
      const inv = investmentIncomeCA(bal.taxable, bal.bondTaxable, bal.cash, bondYield, hysa);
      // Healthcare and long-term care are worked out first: together they are the year's eligible medical expenses.
      const { healthcare, ltc } = healthcareCost({ workingA, workingB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, factor, year, age, ageB });
      const { aliveA, aliveB, totalA, totalB, splitA, splitB, profile } = buildTaxProfile({
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
        rentPaid: housingYear.rentPaid,
        propertyTaxPaid: housingYear.propertyTaxPaid,
        homeBuyer: state.tenure === 'rentThenBuy' && housingYear.homeValue !== null,
        medical: healthcare + ltc,
      });
      let meltdownAmount = 0;
      if (state.meltdownEnabled && age >= state.meltdownStartAge && age <= state.meltdownEndAge) {
        meltdownAmount = solveMeltdown(
          profile.otherA,
          Math.max(0, traditionalBeforeRmd - rmd),
          year,
        );
      }
      // The OAS recovery tax is part of `tax` (taxFor charges it on each return's full income, draws
      // included); the year's cash flow therefore starts from gross OAS.
      const baseSpend =
        baseSpendingNominal(age, year, factor, incomeFactor) *
        guardrailSpendingMultiplier(guardrails, working) *
        (isSurvivorPeriod ? pct(state.survivorSpendingPct) : 1);
      const cppTax = payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, year });
      const tax = taxFor(profile, 0, meltdownAmount) + cppTax;
      // The OAS recovery tax inside the tax just computed (taxFor leaves it in OAS_RECOVERY); each place
      // totalTax is recomputed below refreshes it, so the row reports the recovery at the final income.
      let oasRecoveryNow = OAS_RECOVERY.a + OAS_RECOVERY.b;
      // `tax` above only covers wages/CPP/OAS/pension/RRIF/meltdown income
      // and is what the cash-flow waterfall below uses to size withdrawals.
      // Once taxable-brokerage gains and RRSP withdrawals are known (after
      // the withdrawal waterfall runs), `totalTax` is corrected to include
      // the tax those withdrawals themselves generate; it's `tax` unchanged
      // in a no-withdrawal (contributing) year.
      let totalTax = tax;
      // Same idea for income: starts as the pre-withdrawal gross income and
      // is corrected after the waterfall to include realized RRSP
      // withdrawals and taxable-brokerage gains.
      let totalIncome = totalA + totalB + meltdownAmount;
      const expenses = baseSpend + healthcare + ltc + housing + loanPayment + extraExpense + lumpExpense;
      const bondTarget = mode.bucketStrategy ? (expenses - lumpExpense) * bondYears : null;
      // Cash flow after spending, tax and contributions. The two modes sum the same terms in a
      // different order. The results differ only by rounding, but the withdrawal bisection can
      // amplify that into visibly different numbers, so each keeps its own order until the
      // numerics are unified deliberately.
      const flow = mode.bucketStrategy
        ? wages + cppA + cppB + oasGrossA + oasGrossB + pension + rmd - expenses - tax - traditionalContrib - rothContrib - fhsaContrib
        : wages +
          cppA +
          cppB +
          oasGrossA +
          oasGrossB +
          pension +
          rmd -
          baseSpend -
          healthcare -
          ltc -
          housing -
          loanPayment -
          extraExpense -
          lumpExpense -
          tax -
          traditionalContrib -
          rothContrib -
          fhsaContrib;
      growBalances(bal, { stockReturn, bondReturn, hysa, homeGrowth, inv });
      withdrawRequiredDistributions(bal, rmd);
      applyRrspMeltdown(bal, meltdownAmount);
      bal.cash += oneTimeAmount;
      const reserveTarget = state.cashReserve * factor;
      sweepExcessCash(bal, reserveTarget);
      // Ramp linearly over whatever time is actually available before
      // retirement, so the full target is always reached by rotationEndYear
      // (retirement itself) regardless of how large bondYears is set.
      const ladderGain = rotateIntoBondLadder(bal, { year, ...ladder }, profile, meltdownAmount);
      const guardrailPortfolioNow =
        bal.taxable + bal.bondTaxable + bal.traditional + bal.bondTraditional + bal.roth + bal.bondRoth + bal.cash + bal.fhsa;
      const wd = newWithdrawal({ bal, profile, meltdownAmount, rmd });
      // Gain realized by selling taxable stock for the pre-retirement ladder (a last resort).
      wd.taxableGainGross = ladderGain;
      // The bucket strategy only steers new surplus into the bond reserve in an up year.
      const surplusBondTarget = mode.bucketStrategy && stockReturn >= 0 ? bondTarget : null;
      if (flow >= 0) {
        routeSurplus(bal, {
          flow,
          reserveTarget,
          bondTarget: surplusBondTarget,
          traditionalContrib,
          employerMatch,
          rothContrib,
          fhsaContrib,
        });
        if (ladderGain > 0) {
          totalTax = cppTax + taxFor(profile, ladderGain, meltdownAmount);
          oasRecoveryNow = OAS_RECOVERY.a + OAS_RECOVERY.b;
          totalIncome += ladderGain;
        }
      } else {
        wd.need = -flow;
        if (!working && year === retirementYear) firstWithdrawal = Math.max(0, wd.need - lumpExpense);
        recordGuardrailWithdrawal(guardrails, Math.max(0, wd.need - lumpExpense), guardrailPortfolioNow, working);
        if (mode.bucketStrategy) withdrawBucket(wd, { yearReturn: stockReturn, bondTarget, refillCap: expenses - lumpExpense });
        else withdrawStandard(wd);
        if (wd.need > 1 && !depletedAge) depletedAge = age;
        totalTax = cppTax + taxFor(profile, wd.taxableGainGross, wd.traditionalGross);
        oasRecoveryNow = OAS_RECOVERY.a + OAS_RECOVERY.b;
        totalIncome = totalA + totalB + wd.traditionalGross + wd.taxableGainGross;
        bal.traditional += traditionalContrib + employerMatch;
        bal.roth += rothContrib;
        bal.fhsa += fhsaContrib;
      }
      // The year's income-tested benefits, at the final withdrawal. `totalTax` (and `tax` above) is net of
      // them, so the gross tax the rows report adds them back.
      const finalGains = flow >= 0 ? (ladderGain > 0 ? ladderGain : 0) : wd.taxableGainGross,
        finalTrad = flow >= 0 ? meltdownAmount : wd.traditionalGross;
      benefitsFor(profile, finalGains, finalTrad);
      const benefitsNow = BEN.total;
      const { traditionalWithdrawn, taxableWithdrawn } = wd;
      bal.mortgage = Math.max(0, bal.mortgage);
      const loanBalance = loans.reduce((sum, l) => sum + (l.balances[year] || 0), 0),
        bonds = bal.bondTaxable + bal.bondTraditional + bal.bondRoth,
        investable = bal.taxable + bonds + bal.traditional + bal.roth + bal.cash + bal.fhsa,
        homeEquity =
          state.tenure === 'own' || state.tenure === 'rentThenBuy'
            ? Math.max(0, bal.home - bal.mortgage)
            : 0,
        total = investable + homeEquity - loanBalance;
      const row = {
        age,
        ageB,
        year,
        taxable: bal.taxable,
        bonds,
        traditional: bal.traditional,
        roth: bal.roth,
        cash: bal.cash + bal.fhsa,
        homeEquity,
        loanBalance,
        investable,
        total,
        working,
        workingA,
        workingB,
        grossIncome: totalIncome,
        expenses,
        tax: totalTax + benefitsNow - oasRecoveryNow,
        oasClawback: oasRecoveryNow,
        benefits: benefitsNow,
        benefitGis: BEN.gis,
        benefitAllowance: BEN.allowance,
        benefitCcb: BEN.ccb,
        benefitCgeb: BEN.cgeb,
        benefitProvChild: BEN.provChild,
        benefitProvSenior: BEN.provSenior,
        benefitProvCredit: BEN.provCredit,
        wages,
        ss: cppA + cppB + oasGrossA + oasGrossB - oasRecoveryNow,
        pension,
        rmd,
        traditionalWithdrawn,
        taxableWithdrawn,
        housing,
        healthcare,
        ltc,
        loanPayment,
        extraExpense,
        lumpExpense,
        baseSpend,
      };
      // Historical rows also carry the running inflation factor (real-dollar charts divide by it).
      if (isHistorical) row.cumFactor = factor;
      lastGains = wd.taxableGainGross;
      rows.push(row);
      source.endOfYear();
    }
    const result = {
      rows,
      depletedAge,
      firstWithdrawal,
      retirementYear,
      currentExpense: projectedExpense(0),
      retirementExpense: ladder.ladderTranches[0],
      ladderTarget: ladder.ladderTarget,
      ...(isHistorical ? { startYear: source.startYear } : null),
      ...mortgageResultAges(futureBuy, schedule),
    };
    // The final balances, for the after-tax estate (N8): not enumerable, so the result's own fields and every snapshot stay as they were.
    Object.defineProperty(result, 'estate', {
      value: {
        traditional: bal.traditional + bal.bondTraditional,
        taxable: bal.taxable + bal.bondTaxable,
        taxableBasis: bal.taxableBasis + bal.bondTaxableBasis,
        roth: bal.roth + bal.bondRoth,
        cash: bal.cash + bal.fhsa,
        homeEquity: Math.max(0, bal.home - bal.mortgage),
        lastGains: lastGains,
        survivor: projectionYears >= deathYear, // the last year is the survivor's alone: all of its income is one person's
      },
    });
    return result;
  }
