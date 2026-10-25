// runProjection: the US engine, with the cliff plan computation

import { paychecksPerYear, pct } from '../../../shared/core/format/numbers.js';
import { makeProjectedExpense } from '../../../shared/core/income/projected-expense.js';
import { planBondLadder, rotateIntoBondLadder } from '../../../shared/core/withdrawals/bond-ladder.js';
import { withdrawBucket } from '../../../shared/core/withdrawals/bucket-order.js';
import { loanPaymentForYear, baseSpendingNominal, futureHomePurchase, loanSchedules, mortgageSchedule, mortgageResultAges } from '../../../shared/core/income/spending-and-loans.js';
import { guardrailSpendingMultiplier, newGuardrails, recordGuardrailWithdrawal } from '../../../shared/core/projection/guardrails.js';
import { pensionIncome } from '../../../shared/core/income/pension-income.js';
import { sweepExcessCash } from '../../../shared/core/withdrawals/draws.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';
import { getBondYears, medicalGrowth } from '../../../shared/core/projection/year-factors.js';
import { standardYearSource } from '../../../shared/core/projection/year-sources.js';
import { MAGI_ITER_MAX, MAGI_ITER_TOL } from './engine-state.js';
import { afterTaxValue, fillEligible, fillPlanOf, lineFamily, NO_PLAN, NO_PLANS, underEligible, underPlanOf, yearPlanCandidates, planCandidateBetter, bracketCandidateBetter, bracketEvenBest, NO_THRESHOLDS, REACH_GROSS_UP, magiThresholds, lambdaEstimate } from '../cliff-plan/solver.js';
import { BRACKET_CANDIDATES, makePlan, phaseOf } from '../cliff-plan/plan-shape.js';
import { filingRow, taxYearOf } from '../tax/federal-rules.js';
import { freeTraditional, newWithdrawal, fillTraditional, incomeRoom } from '../withdrawals/draws.js';
import { growBalances, withdrawRequiredDistributions } from './balances.js';
import { COVER_CTX, listAmountsForYear, streamCoverBits } from '../income/streams-and-lumps.js';
import { irmaaAppealKind, irmaaAppealTable, returnMagis, irmaaSurcharge, irmaaMagiOf } from '../healthcare/irmaa.js';
import { investmentIncome, filingStatusFor, SE_OUT, payrollTax, selfEmploymentTax, taxFor } from '../tax/federal-tax.js';
import { retirementContributions } from '../income/contributions.js';
import { SE_HEALTH, seHealthDeduction, acaEligibility, healthcareCost, ACA_KIND } from '../healthcare/aca.js';
import { solveRothConversion, applyRothConversion, conversionMagiCeiling } from '../withdrawals/roth-conversion.js';
import { INH_DECEDENT } from '../tax/state-rules.js';
import { hasPenalizedMoney } from '../accounts/penalty-status.js';
import { withdrawBucketPenaltyAware, withdrawStandard } from '../withdrawals/strategies.js';
import { accountBalances, accountsClone, accountsContribute, accountsConvertPreview, accountsDraw, accountsDrawSlots, accountsNew, accountsOwnerShareA, accountsRestore, accountStatuses, openingAccounts, sumSlots } from '../accounts/account-ledger.js';
import { routeSurplus, STANDARD_MODE } from './year-modes.js';
import { inheritedLedger, INH_OUT, INH_CTX, inheritedYear, inheritedApply, inheritedClone, inheritedRestore } from '../income/inherited.js';
import { returnStatusA, irmaaSsOf } from '../tax/social-security-tax.js';
import { socialSecurityIncome } from '../income/social-security.js';
import { requiredDistributions } from '../income/distributions.js';
import { housingForYear, buildTaxProfile, k401Fractions, stateReadsK401 } from '../income/year-stages.js';
import { stateRuleForYear } from '../tax/state-tax.js';
import { rothAccountsNew, rothAccountsSeason, rothAccountsClone, rothAccountsRestore, rothAccountsContribute } from '../accounts/roth-ledger.js';
import { US_OBJECTIVES, objectiveById } from '../optimizer/objectives.js';

  // The year's guardrail record (and the retirement year's firstWithdrawal), decided and sized from the flow before the 162(l)
  // carry (flowOwn, spec 6.5) whichever cash branch runs: a carry can tip a year across zero, and it is not a yearly draw.
  // flowOwn < 0 records the need (as the draw branch always has); flowOwn >= 0 records only on the inherited path (a surplus the
  // scheduled draw created). Returns the recorded amount, or -1 when the year records nothing. With no carry flowOwn is the
  // flow, so the records are the same doubles.
  function recordOwnNeed(ctx, guardrails, flowOwn, lumpYear, lumpExpense, inhNeedAdj, portfolioNow, working) {
    // E1d decision 7: a year with a taxable lump records no guardrail withdrawal and no firstWithdrawal.
    if (lumpYear) return -1;
    let recorded;
    if (flowOwn < 0) recorded = inhNeedAdj !== 0 ? Math.max(0, -flowOwn - lumpExpense + inhNeedAdj) : Math.max(0, -flowOwn - lumpExpense);
    // E1e: a surplus the scheduled draw created still records the household's need as if the inheritance were not there.
    else if (inhNeedAdj > 0 && -flowOwn + inhNeedAdj > 0) recorded = Math.max(0, -flowOwn - lumpExpense + inhNeedAdj);
    else return -1;
    recordGuardrailWithdrawal(ctx, guardrails, recorded, portfolioNow, working);
    return recorded;
  }
  // B5 (spec 6.3, decision 5): the settled return's choice among its candidate deductions: the index of the lowest of
  // sums[0..n) (each candidate's tax plus premium), the lowest index on an exact tie. The candidates are listed with section
  // 5.02's first (A-major), so a tie takes 5.02's, the documented method. Pure.
  export function settleChoice(sums, n) {
    let best = 0;
    for (let i = 1; i < n; i++) if (sums[i] < sums[best]) best = i;
    return best;
  }
  // B5 (spec 6.3): the settled return's candidate combinations, in the order they are priced (A-major, 5.02's first in each
  // part), each { a, b, partsA, partsB } (the deduction pair and what each part claims). A part with a consistent deduction has
  // that one; otherwise 5.02's when it passes the legal bound, then the left end lo. One return has one part, the household's
  // pair (consA / ok502A / fixA,B / d502A,B / loA,B; partsB repeats partsA; consB and ok502B are not read). No search result
  // (found false: a step-1 deduction of 0 at the return's price) is the single pair 0, 'none'. Pure.
  export function settleCombos(found, twoReturns, consA, ok502A, fixA, d502A, loA, consB, ok502B, fixB, d502B, loB) {
    if (!found) return [{ a: 0, b: 0, partsA: 'none', partsB: 'none' }];
    if (!twoReturns) {
      if (consA) return [{ a: fixA, b: fixB, partsA: 'consistent', partsB: 'consistent' }];
      const lo = { a: loA, b: loB, partsA: 'lo', partsB: 'lo' };
      return ok502A ? [{ a: d502A, b: d502B, partsA: '502', partsB: '502' }, lo] : [lo];
    }
    const part = (cons, ok502, fix, d502, lo) => (cons ? [[fix, 'consistent']] : ok502 ? [[d502, '502'], [lo, 'lo']] : [[lo, 'lo']]);
    const la = part(consA, ok502A, fixA, d502A, loA),
      lb = part(consB, ok502B, fixB, d502B, loB),
      out = [];
    for (const [a, partsA] of la) for (const [b, partsB] of lb) out.push({ a, b, partsA, partsB });
    return out;
  }
  // The chosen combination: the only one, else the lowest of the priced sums (settleChoice: the lowest index on a tie). Pure.
  export function settleDecide(combos, sums) {
    return combos.length > 1 ? combos[settleChoice(sums, combos.length)] : combos[0];
  }
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
  // The run context `ctx` (src/shared/core/projection/run-context.js) carries the plan, the tax year, the test switches and
  // the stats sinks. Cliff plan: `ctx.planMode` is 'off' (no steering), 'choose' (the phased year: converge the natural year,
  // try each candidate plan as its own converged iteration, keep the winner and record its intent; deterministic run only,
  // refreshCliffPlan) or 'apply' (follow `ctx.plan.intents`). The engine never plans: the caller's context brings the plan
  // (storeContext plans with planForState, src/us/core/cliff-plan/planning.js).
  export function runProjection(ctx, { mode, source, retireAgeA, retireAgeB, trace = null, planTrace = null }) {
    const plan = ctx.plan,
      planMode = ctx.planMode,
      magiStats = ctx.stats.magi,
      planStats = ctx.stats.plan,
      hookStats = ctx.stats.hooks,
      testCtl = ctx.test;
    const phased = planMode === 'choose' || planMode === 'apply',
      intents = planMode === 'choose' ? {} : null;
    const inputs = ctx.inputs;
    const singlePerson = !!inputs.singlePerson;
    if (singlePerson) retireAgeB = retireAgeA;
    // Only the historical source reports a start year; it also adds cumFactor to each row.
    const isHistorical = source.startYear !== undefined;
    // Partner A's share of the pooled traditional balance (normalizeState
    // already clamps this to 0-100) — see traditionalShareA/B below.
    const opening = openingAccounts(ctx.inputs);
    const hysa = pct(inputs.hysaRate),
      wageGrowth = pct(inputs.incomeGrowth),
      homeGrowth = pct(inputs.homeGrowth);
    const futureBuy = inputs.tenure === 'rentThenBuy' ? futureHomePurchase(ctx, homeGrowth) : null;
    const bal = {
      taxable: inputs.taxable,
      taxableBasis: inputs.taxable * pct(inputs.basisRatio),
      bondTaxable: 0,
      bondTaxableBasis: 0,
      bondTraditional: 0,
      bondRoth: 0,
      traditional: sumSlots(opening.trad),
      roth: sumSlots(opening.roth),
      cash: inputs.cash,
      home: inputs.tenure === 'own' ? inputs.homeValue : 0,
      mortgage: inputs.tenure === 'own' ? inputs.mortgage : 0,
      // E1e: the open inherited accounts (sums of the ledger; always present so the shape is fixed).
      inheritedTrad: 0,
      inheritedRoth: 0,
    };
    const schedule = mortgageSchedule(ctx),
      loans = loanSchedules(ctx),
      rows = [],
      // Cliff plan (apply): the IRMAA stay-unders kept on a household return, checked after the loop (planStats).
      irmaaChecks = [],
      // IRMAA's lookback: each year's Medicare MAGI (irmaaMagiOf: only the taxable part of Social Security).
      irmaaMagiHistory = [],
      // Two-return years (an unmarried couple, or before a marry-later wedding): each partner's own MAGI (the ACA
      // definition, rows' magiA / magiB) and its Medicare MAGI, and which years had two returns, for the per-person
      // IRMAA lookback.
      magiHistoryA = [],
      magiHistoryB = [],
      irmaaMagiHistoryA = [],
      irmaaMagiHistoryB = [],
      twoReturnHistory = [],
      // E3: each year's filing status, the IRMAA lookback's tier table (spec 5.1).
      irmaaFilingHistory = [];
    // Per-account Roth contribution/conversion ledgers (see rothAccountsNew).
    const rothAccts = rothAccountsNew(ctx.inputs);
    // Per-account shares of the traditional and Roth pools (see accountsNew).
    const accts = accountsNew(ctx.inputs);
    let depletedAge = null,
      homeDrawAge = null, // the first age whose kept pass drew more than $1 from home equity (spec A4), null if never
      firstWithdrawal = 0;
    let endTax = null;
    // Last year's realized discretionary income, used only to SEED each year's
    // MAGI estimate (estTrad/estGain in the year loop): traditional withdrawals
    // (excluding the Roth conversion, which is sized separately each year) and
    // taxable-brokerage gains. The year body is re-run from a snapshot until
    // the estimate matches this year's realized amounts, so ACA/IRMAA MAGI
    // reflects this year's own withdrawals, not last year's.
    let prevDiscTraditional = 0,
      prevSeHealthA = 0,
      prevSeHealthB = 0,
      // E1e: the previous year's realized last-resort inherited draws by slot (seeds the fourth estimate).
      prevInhA = 0,
      prevInhB = 0,
      prevTaxableGainGross = 0;
    // B5 (spec 6.5): the outgoing 162(l) carry of the year just finished (a refund > 0, a balance due < 0): read and cleared at
    // the start of the next year, written once at the year end; the last year's goes to the estate's cash. Not mutated inside a
    // year body, so it needs no snapshot entry.
    let seCarry = 0;
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
    // death age onward, the household files jointly for the death year and single after it, the
    // survivor keeps the greater of the two Social Security benefits (a
    // simplified survivor-benefit swap rather than full PIA/FRA rules),
    // the deceased partner's pension/LTC/healthcare share drops out, the
    // full traditional balance consolidates under the survivor's own RMD
    // schedule (spousal rollover), household spending is cut to a
    // configurable percentage, and any "other loans" balance is paid off
    // as a lump sum in the year of death (approximating debts settled
    // through probate before the estate passes to the survivor) — the
    // mortgage is untouched since it's secured by jointly-titled real
    // estate. Only meaningful once both partners are otherwise retired.
    const deceasedIsA = inputs.survivorEnabled && !singlePerson && inputs.survivorPartner === 'A',
      deceasedIsB = inputs.survivorEnabled && !singlePerson && inputs.survivorPartner === 'B',
      deathYear = deceasedIsA
        ? inputs.survivorDeathAge - inputs.ageA
        : deceasedIsB
          ? inputs.survivorDeathAge - inputs.ageB
          : Infinity;
    // A partner who dies before their retirement age stops working at death (E1b): every rule keyed on the
    // retirement age (wages, contributions, health premiums, the both-retired year, the bond ladder) follows.
    if (deceasedIsA) retireAgeA = Math.min(retireAgeA, inputs.survivorDeathAge);
    if (deceasedIsB) retireAgeB = Math.min(retireAgeB, inputs.survivorDeathAge);
    // E3 (spec 5.1): whether the couple was married when a partner died (the lookback reads joint tiers for entered returns from
    // before the death). False without a death, in single-person mode, or for an unmarried couple.
    const marriedAtDeath = deathYear < Infinity && !singlePerson && (inputs.marryLater ? inputs.ageA + deathYear >= inputs.marriageAgeA : inputs.filingStatus === 'mfj');
    // E1e: the inherited accounts of this run (null for every state without an inherited row).
    const inh = inheritedLedger(inputs.oneTimeIncome, { ageA: inputs.ageA, ageB: inputs.ageB, single: singlePerson, taxYear: ctx.taxYear, deathYear, deceasedIsA, deceasedIsB });
    if (inh !== null) {
      for (let i = 0; i < inh.n; i++) if (inh.open[i] === 1) { if (inh.roth[i]) bal.inheritedRoth += inh.bal[i]; else bal.inheritedTrad += inh.bal[i]; }
    }
    const retirementYear = singlePerson
      ? Math.max(0, retireAgeA - inputs.ageA)
      : Math.max(0, retireAgeA - inputs.ageA, retireAgeB - inputs.ageB);
    const bondYears = getBondYears(ctx.inputs);
    // The pre-retirement ladder is sized once from the plan's assumed inflation (not the path's),
    // in both engines; it also feeds currentExpense/retirementExpense/ladderTarget.
    const projectedExpense = makeProjectedExpense(ctx, { infl: source.inflation, wageGrowth, schedule, futureBuy, singlePerson, retireAgeA, retireAgeB });
    const ladder = planBondLadder({ retirementYear, bondYears, projectedExpense });
    const projectionYears = singlePerson
      ? Math.max(0, inputs.lifeExpectancyA - inputs.ageA)
      : Math.max(0, inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB);
    // E3 (spec 5.2): the IRMAA appeal events of this run (null for most runs). Built after the death clamp of retireAgeA/B.
    const appeal = irmaaAppealTable(ctx, { singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears });
    // Cliff plan: growth of the IRMAA tiers over the two-year lookback, at the plan's assumed inflation.
    const irmaaGrowth2 = (1 + source.inflation) * (1 + source.inflation);
    for (let age = inputs.ageA, year = 0; year <= projectionYears; age++, year++) {
      const { stockReturn, bondReturn, bondYield, factor, limitFactor } = source.yearInputs(year);
      const ageB = singlePerson ? null : inputs.ageB + year,
        workingA = age < retireAgeA,
        workingB = !singlePerson && ageB < retireAgeB,
        working = workingA || workingB,
        isSurvivorPeriod = year >= deathYear;
      const incomeFactor = Math.pow(1 + wageGrowth, year);
      // E1c: a self-employed partner's main income is business profit, not wages.
      const seMainA = workingA && inputs.incomeKindA === 'self' ? inputs.incomeA * incomeFactor : 0,
        seMainB = workingB && inputs.incomeKindB === 'self' ? inputs.incomeB * incomeFactor : 0;
      const wageA = workingA && inputs.incomeKindA !== 'self' ? inputs.incomeA * incomeFactor : 0,
        wageB = workingB && inputs.incomeKindB !== 'self' ? inputs.incomeB * incomeFactor : 0;
      const { extraIncome, streams, lumps, oneTimeAmount, extraExpense, lumpExpense } = listAmountsForYear(ctx, {
        age, ageB, year, factor, incomeFactor, single: singlePerson,
        deadA: deceasedIsA && year >= deathYear, deadB: deceasedIsB && year >= deathYear,
      });
      // E1d: this year's taxable one-time income (LUMP_OUT is a scratch object; the guardrail skip and row.income read
      // these late in the year body).
      const lumpFlow = lumps.flowTotal,
        lumpYear = lumpFlow > 0,
        lumpWagesA = lumps.wagesA, lumpWagesB = lumps.wagesB,
        lumpOtherA = lumps.otherA, lumpOtherB = lumps.otherB,
        lumpGainA = lumps.gainA, lumpGainB = lumps.gainB,
        lumpNoNiitA = lumps.gainNoNiitA, lumpNoNiitB = lumps.gainNoNiitB;
      // E1e: this year's scheduled inherited draws (pre-remap slots) and Roth payout; known now, so per-year constants like the RMD.
      let inhDraw = 0, inhDrawA = 0, inhDrawB = 0, inhRothPayout = 0;
      if (inh !== null) {
        INH_CTX.collapse = singlePerson || isSurvivorPeriod;
        INH_CTX.year = year; INH_CTX.stockReturn = stockReturn; INH_CTX.deadA = deceasedIsA && year >= deathYear; INH_CTX.deadB = deceasedIsB && year >= deathYear;
        inheritedYear(inh, INH_CTX, INH_OUT);
        if (testCtl.inhForce !== null && testCtl.inhForce.year === year) {
          inh.draw[testCtl.inhForce.slot] += testCtl.inhForce.x;
          if (inh.slot[testCtl.inhForce.slot] === 0) INH_OUT.drawA += testCtl.inhForce.x;
          else INH_OUT.drawB += testCtl.inhForce.x;
        }
        inhDrawA = INH_OUT.drawA; inhDrawB = INH_OUT.drawB; inhDraw = inhDrawA + inhDrawB; inhRothPayout = INH_OUT.rothPayout;
      }
      // E1d: Social Security wages for the wage base, payroll tax and the profile (a wages lump has no premium, no
      // contribution and no coverage, so it never touches `streams`).
      const ssWagesA = lumpYear ? streams.wagesA + lumpWagesA : streams.wagesA,
        ssWagesB = lumpYear ? streams.wagesB + lumpWagesB : streams.wagesB;
      const paychecks = paychecksPerYear[inputs.payFrequency] || 26;
      const healthPremiumA = workingA && inputs.incomeKindA !== 'self' ? inputs.healthPremiumA * paychecks * factor * medicalGrowth(ctx, year) : 0,
        healthPremiumB = !singlePerson && workingB && inputs.incomeKindB !== 'self' ? inputs.healthPremiumB * paychecks * factor * medicalGrowth(ctx, year) : 0;
      // E1c: self-employment profit per person (main income plus self streams), SE tax, its deductible half and the net
      // earnings that carry the Additional Medicare Tax. Social Security wages (net of the premium) use up the wage base.
      const seA = seMainA + streams.selfA,
        seB = seMainB + streams.selfB;
      let seTaxA = 0, halfA = 0, seNeA = 0, seTaxB = 0, halfB = 0, seNeB = 0;
      if (seA > 0) {
        selfEmploymentTax(ctx, seA, Math.max(0, wageA - healthPremiumA) + Math.max(0, ssWagesA - streams.premiumA), year, SE_OUT);
        seTaxA = SE_OUT.tax; halfA = SE_OUT.half; seNeA = SE_OUT.ne;
      }
      if (seB > 0) {
        selfEmploymentTax(ctx, seB, Math.max(0, wageB - healthPremiumB) + Math.max(0, ssWagesB - streams.premiumB), year, SE_OUT);
        seTaxB = SE_OUT.tax; halfB = SE_OUT.half; seNeB = SE_OUT.ne;
      }
      // E1c: employer health coverage this year: a W-2 main job while working, or a W-2 stream with a premium. It replaces
      // "working" in every health-insurance rule (marketplace eligibility, Medicare, IRMAA); `workingX` keeps its meaning
      // for pay, contributions and account statuses.
      const employerA = (workingA && inputs.incomeKindA !== 'self') || streams.coverA,
        employerB = (workingB && inputs.incomeKindB !== 'self') || streams.coverB;
      let wages =
        wageA + wageB + extraIncome - healthPremiumA - healthPremiumB - streams.premiumA - streams.premiumB + seMainA + seMainB;
      // E1d: the taxable part of the year's one-time income enters the cash flow (appended: the old sum order is unchanged).
      if (lumpYear) wages += lumpFlow;
      const {
        traditionalContribA, traditionalContribB, traditionalContrib, rothContrib, acct: acctContrib,
        employerContrib: employerMatch, streamWageCutA, streamWageCutB, soloPlanCutA, soloPlanCutB, soloIraCutA, soloIraCutB,
      } = retirementContributions(ctx, {
        wageA, wageB, age, ageB, singlePerson, limitFactor,
        streamList: streams.contrib, streamWagesA: streams.wagesA, streamWagesB: streams.wagesB,
        seA, seB, seMainA, seMainB, halfA, halfB,
      });
      const { ssA, ssB, ss } =
        socialSecurityIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
      const { pensionA, pensionB, pension } =
        pensionIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
      const { traditionalBeforeRmd, rmdA, rmdB, rmd, sepp72A, sepp72B, seppSlots, seppActive, seppLocked } = requiredDistributions(ctx, {
        traditional: bal.traditional,
        bondTraditional: bal.bondTraditional,
        age,
        ageB,
        singlePerson,
        isSurvivorPeriod,
        deceasedIsA,
        ownerShareA: accountsOwnerShareA(accts.trad),
        accountDollars: accountBalances(accts.trad, bal.traditional + bal.bondTraditional),
        workingA,
        workingB,
        retireAgeA,
        retireAgeB,
      });
      const housingYear = housingForYear(ctx, year, factor, schedule, futureBuy);
      const housing = housingYear.housing;
      if (housingYear.mortgage !== null) bal.mortgage = housingYear.mortgage;
      if (housingYear.homeValue !== null) bal.home = housingYear.homeValue;
      const { loanPayment } = loanPaymentForYear(ctx, { year, deathYear, isSurvivorPeriod, loans });
      const { filing } = filingStatusFor(ctx, { age, singlePerson, isSurvivorPeriod, year, deathYear });
      // E1c: 162(l) is barred in a year the person has employer coverage, or could join a spouse's employer plan (an
      // unticked box means no affordable offer; an unmarried partner's employer never bars it).
      const jointYear = filingRow(filing).joint && !singlePerson && !isSurvivorPeriod,
        seAllowA = seA > 0 && !employerA && !(jointYear && employerB && inputs.employerCoversSpouseB),
        seAllowB = seB > 0 && !employerB && !(jointYear && employerA && inputs.employerCoversSpouseA);
      // Dividends and interest earned this year on start-of-year balances;
      // taxed now (via profile.invOrd/invQual) and counted in MAGI.
      const inv = investmentIncome(ctx, bal.taxable, bal.bondTaxable, bal.cash, bondYield, hysa);
      const { otherA, otherB, profile } = buildTaxProfile(ctx, {
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
        streamWagesA: ssWagesA,
        streamWagesB: ssWagesB,
        streamOtherA: lumpYear ? streams.otherA + lumpOtherA : streams.otherA,
        streamOtherB: lumpYear ? streams.otherB + lumpOtherB : streams.otherB,
        streamWageCutA,
        streamWageCutB,
        streamPremiumA: streams.premiumA,
        streamPremiumB: streams.premiumB,
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
        propertyTax: housingYear.propertyTax,
        rent: housingYear.rent,
        ownerShareA: accountsOwnerShareA(accts.trad),
        mortgageInterest: housingYear.mortgageInterest,
        tradShares: accts.trad,
        workingA,
        workingB,
        seA,
        seB,
        halfA,
        halfB,
        soloPlanCutA,
        soloPlanCutB,
        soloIraCutA,
        soloIraCutB,
        seAllowA,
        seAllowB,
        lumpOn: lumpYear,
        lumpGainA,
        lumpGainB,
        lumpNoNiitA,
        lumpNoNiitB,
        inhOn: inh !== null,
        inheritedA: inhDrawA,
        inheritedB: inhDrawB,
      });
      // E1e: New York's decedent room (spec 6.4): per post-remap slot, the sum over the traditional rows of min(the row's draw, the cap), set once a
      // year; the pass-top base the last resort (Task 6) adds to.
      let inhExclBaseA = 0, inhExclBaseB = 0;
      if (inh !== null && inhDraw > 0) {
        const yr = stateRuleForYear(ctx, year);
        if (yr && yr.inhKind === INH_DECEDENT) {
          for (let i = 0; i < inh.n; i++) {
            if (inh.roth[i] || !(inh.draw[i] > 0)) continue;
            const room = Math.min(inh.draw[i], yr.inhCap);
            if (singlePerson || isSurvivorPeriod || inh.slot[i] === 0) inhExclBaseA += room;
            else inhExclBaseB += room;
          }
          profile.inhExclA = inhExclBaseA;
          profile.inhExclB = inhExclBaseB;
        }
      }
      // Two returns this year: ACA per tax household, IRMAA per person (never in the survivor period or
      // single-person mode, whose profile is a one-person return).
      const twoReturns = !profile.singlePerson && !filingRow(filing).joint;
      irmaaFilingHistory[year] = filing; // E3: once per year, before any healthcareCost call (spec 5.1, round 1 M2)
      const [acaEligibleA, acaEligibleB] = acaEligibility(ctx, {
        age,
        ageB,
        workingA: employerA,
        workingB: employerB,
        singlePerson,
        isSurvivorPeriod,
        deceasedIsA,
        deceasedIsB,
      });
      // otherA/B (buildTaxProfile) already carry the wages and ordinary lumps (through streamWagesA/B and streamOtherA/B);
      // E1d appends the year's lump gains (skipped outside a lump year, so the old sum is unchanged).
      const magiBase0 = lumpYear
        ? otherA + otherB + ss + inv.ordinary + inv.qualified + (lumpGainA + lumpGainB)
        : otherA + otherB + ss + inv.ordinary + inv.qualified;
      // The pass's MAGI base: magiBase0 less the pass's 162(l) estimate (E1c; set at the top of each pass).
      let magiBase = magiBase0;
      // E1c: false when this year has no self-employment and no deduction carried in from last year: every 162(l) term below is
      // then an exact zero and is skipped, not added (a household without self-employment pays one test per pass).
      const seLive = profile.seOn === true || prevSeHealthA !== 0 || prevSeHealthB !== 0;
      // MAGI iteration: estTrad/estGain are the discretionary traditional
      // withdrawals / taxable gains assumed when sizing ACA, IRMAA-tier and
      // conversion headroom; estUsed records whether this year's result
      // depended on them at all (no ACA premium, no finite MAGI ceiling), in
      // which case a single pass is already exact. estSeA/estSeB are the
      // self-employed health insurance deductions (E1c) the pass's MAGI
      // assumes; they converge with the other two. If the iteration does not
      // converge in a year with a deduction allowed, the year holds the consistent
      // deduction when one exists (decision 10, a bisection), else switches to
      // Rev. Proc. 2014-41's alternative calculation (seHeld, decision 9): the
      // deduction is computed once and held, and only the draws iterate on.
      let estTrad = prevDiscTraditional,
        estGain = prevTaxableGainGross,
        estSeA = prevSeHealthA,
        estSeB = prevSeHealthB,
        // E1e: the fourth estimate: the pass's last-resort inherited draws per post-remap slot (0 without a ledger).
        estInhA = prevInhA,
        estInhB = prevInhB,
        estUsed = false;
        // Everything this year's body mutates, so the MAGI iteration below can rewind and re-run it.
        const balSnapshot = { ...bal };
        const scalarSnapshot = { depletedAge, homeDrawAge, firstWithdrawal };
        const guardrailSnapshot = { ...guardrails };
        const ledgerSnapshot = rothAccountsClone(rothAccts);
        const acctSnapshot = accountsClone(accts);
        if (inh !== null) inheritedClone(inh);
        // Passes of this year that priced the premium off an estimate: what each estimated, what it was charged and what the
        // realized MAGI would have cost (the cost steps DOWN at the Medicaid and 100%-of-FPL lines, so there may be no fixed point).
        const passLog = [];
        let forcedPass = false;
        let seHeld = false; // E1c decisions 9 and 10: the held deduction (the consistent one, else the alternative calculation's), kept for the rest of the phase
        let seKind = 0; // which one is held: 1 the consistent deduction, 2 the alternative calculation's (counted for the kept phase only, with forced / unresolved)
        // Cliff plan, phased year (choose / apply; spec 13.5-13.7 of the 3C design, 8a): the year runs in phases, all of whose
        // state lives here, outside the MAGI restore.
        // - natural: no plan (exactly the `off` year), iterated until it converges or ends in its forced pass;
        // - trials: if the natural year has a withdrawal and a line is in reach of its MAGI, each candidate plan
        //   (yearPlanCandidates: up to two stay-unders at real cliffs and a fill) is a fresh converged iteration from the
        //   year's snapshot with the plan held, seeded from the natural year's realized draw and gains, with its own
        //   MAGI_ITER_MAX budget;
        // - each is scored by afterTaxValue at the end of its year less the IRMAA it sets, and carries its cliffCost (the
        //   healthcare it charges, after the forced-pass refund, plus that IRMAA). A trial wins only if it met its plan,
        //   left no need unmet, lowers the cliffCost by more than $1 against the natural year (13.7 B: lambda alone never
        //   wins a year) and beats the natural score by more than $1 (or the best earlier such trial); if the winner is
        //   not the phase that ran last, its final pass is replayed (same plan, same estimates, so the same pass) and the
        //   row comes from it.
        // magiStats count the kept phase only. With no phases (off) phasePass is the pass index. lambda (yearLambda) is
        // computed once, on first use (choose only), and held.
        let yearPlan = NO_PLAN,
          yearLambda = null,
          yearLambdaNeed = null, // test-only: the need passed to lambdaEstimate (planTr.lambdaNeed)
          phasePass = -1,
          phaseUnresolved = false,
          replaying = false,
          naturalRec = null,
          trials = NO_PLANS,
          trialIdx = -1,
          trialRecs = null,
          planTr = null;
        const ownerShareA0 = profile.ownerShareA;
        let cover2 = 0;
        if (inputs.incomeSources.length > 0) {
          COVER_CTX.ageA = age + 2; COVER_CTX.ageB = singlePerson ? null : ageB + 2; COVER_CTX.single = singlePerson;
          COVER_CTX.deadA = deceasedIsA && year + 2 >= deathYear; COVER_CTX.deadB = deceasedIsB && year + 2 >= deathYear;
          cover2 = streamCoverBits(inputs.incomeSources, COVER_CTX);
        }
        // B5 (spec 6.5): last year's 162(l) carry, fixed for the whole year (every pass and every cliff-plan phase).
        const seCarryIn = seCarry;
        seCarry = 0;
        for (let iter = 0; ; iter++) {
          if (iter > 0) {
            Object.assign(bal, balSnapshot);
            ({ depletedAge, homeDrawAge, firstWithdrawal } = scalarSnapshot);
            Object.assign(guardrails, guardrailSnapshot);
            rothAccountsRestore(rothAccts, ledgerSnapshot);
            accountsRestore(accts, acctSnapshot);
            if (inh !== null) inheritedRestore(inh);
          }
          profile.ownerShareA = ownerShareA0;
          profile.conv = 0;
          profile.convK401FracA = 0;
          profile.convK401FracB = 0;
          profile.k401DrawFracA = profile.k401FracA;
          profile.k401DrawFracB = profile.k401FracB;
          profile.seHealthA = estSeA;
          profile.seHealthB = estSeB;
          magiBase = seLive ? magiBase0 - estSeA - estSeB : magiBase0;
          if (inh !== null) {
            // E1e: the last-resort draws are rebuilt each pass (not in the snapshot); the profile starts the pass at the scheduled-draw state.
            inh.lastResort.fill(0);
            profile.inhExtraA = 0;
            profile.inhExtraB = 0;
            // Decision 18: the Roth bracket fill sees the pass's last-resort estimate (post-remap slots, as estInhA/B).
            profile.inhEstA = estInhA;
            profile.inhEstB = estInhB;
            profile.inhExclA = inhExclBaseA;
            profile.inhExclB = inhExclBaseB;
            magiBase += estInhA + estInhB;
          }
          phasePass++;
          estUsed = false;
        rothAccountsSeason(rothAccts, year);
        let conversionAmount = 0;
        // Lifted out of the block below (rather than left as the block's own
        // const) so the withdrawal waterfall further down can also respect
        // the same safe-MAGI ceiling once conversionAmount has already
        // claimed its own share of it — see pickLiveWithdrawalOrder's use of
        // remainingMagiRoom.
        let magiSafeRoom = Infinity;
        const convertsThisYear =
          inputs.rothConvEnabled && age >= inputs.rothConvStartAge && age <= inputs.rothConvEndAge;
        // The ceiling is computed every year: it sizes a conversion and bounds the withdrawal order.
        // Uses this year's estimated discretionary income (estTrad/estGain), same
        // as magiProxy below — see the iteration note in the year loop.
        const preConvMagi = magiBase + estTrad + estGain;
        let preMagiA = 0,
          preMagiB = 0;
        if (twoReturns) [preMagiA, preMagiB] = returnMagis(profile, estTrad, estGain, estInhA, estInhB);
        const magiCeiling = conversionMagiCeiling(ctx, {
          acaEligibleA,
          acaEligibleB,
          singlePerson,
          isSurvivorPeriod,
          deceasedIsA,
          deceasedIsB,
          workingA: employerA,
          workingB: employerB,
          age,
          ageB,
          preConvMagi,
          filing,
          year,
          twoReturns,
          preMagiA,
          preMagiB,
          shareA: profile.ownerShareA,
          profile,
        });
        if (magiCeiling < Infinity) estUsed = true;
        magiSafeRoom = Math.max(0, magiCeiling - preConvMagi);
        // The healthcare arguments and costAt are built before the conversion, so a conversion chooser can price
        // candidates through costAt (Batch 5); the MAGI fields hold this pass's pre-conversion estimate until the conversion is
        // known, then the estimate including it (below, before healthcareCost runs).
        let magiProxy = preConvMagi,
          magiA = preMagiA,
          magiB = preMagiB;
        const irmaaSsH = irmaaSsOf(profile),
          irmaaStA = twoReturns ? returnStatusA(profile.dependents) : 'single';
        const hcArgs = {
          acaEligibleA,
          acaEligibleB,
          singlePerson,
          isSurvivorPeriod,
          deceasedIsA,
          deceasedIsB,
          workingA: employerA,
          workingB: employerB,
          factor,
          year,
          age,
          ageB,
          magiProxy,
          irmaaHistory: irmaaMagiHistory,
          filing,
          twoReturns,
          magiA,
          magiB,
          irmaaHistoryA: irmaaMagiHistoryA,
          irmaaHistoryB: irmaaMagiHistoryB,
          twoReturnHistory,
          irmaaFilingHistory,
          deathYear,
          marriedAtDeath,
          appeal,
          irmaaSsH,
          ssA: profile.ssA || 0,
          ssB: profile.ssB || 0,
          irmaaStA,
          // B5 (spec 6.2): the return's price. 0 in-year; the settlement captures the paid coverage kinds with -1, prices the
          // return with 1 (reconKindA: the household or A's return, reconKindB: B's), and resets it to 0.
          recon: 0,
          reconKindA: 0,
          reconKindB: 0,
        };
        // The cost at another (discretionary traditional + conversion, gains) pair and a 162(l) deduction pair (E1c; the
        // pass's estimate unless given): the forced pass prices the realized one, and 3C's solver prices its candidates.
        let lastCost = null;
        // E1c decisions 9, 10 and 12: the search for the deduction to hold (below the convergence test), built on first use in this pass, so a
        // pass that never searches allocates nothing. Results in seFixA / seFixB / seNeedAlt. B5 (spec 6.3): in settle mode it also
        // records each part's left end of the bisection (seLoA / seLoB, kept on a miss), whether the part has a consistent
        // deduction (seConsA / seConsB) and section 5.02's deduction (se502A / se502B), for the settlement, and the step-1 deduction
        // (seD1A / seD1B, for the trace).
        let seSearch = null,
          seFixA = 0,
          seFixB = 0,
          seNeedAlt = false,
          seLoA = 0,
          seLoB = 0,
          seConsA = false,
          seConsB = false,
          se502A = 0,
          se502B = 0,
          seD1A = 0,
          seD1B = 0,
          seLoLast = 0,
          // B5 (spec 6.4): year 0 without entered prior MAGIs, inside the settlement only: IRMAA's lookback stand-in is the year's own
          // MAGI, so each return pricing (costAt) first writes its MAGI to the year-0 histories.
          seStand0 = false;
        const costAt = (trad, gain, sa = estSeA, sb = estSeB, ia = estInhA, ib = estInhB) => {
          hcArgs.magiProxy = magiBase0 - sa - sb + trad + gain;
          if (inh !== null) hcArgs.magiProxy += ia + ib;
          if (twoReturns) {
            const ra = profile.seHealthA, rb = profile.seHealthB;
            profile.seHealthA = sa;
            profile.seHealthB = sb;
            [hcArgs.magiA, hcArgs.magiB] = returnMagis(profile, trad, gain, ia, ib);
            profile.seHealthA = ra;
            profile.seHealthB = rb;
          }
          if (seStand0) {
            irmaaMagiHistory[0] = irmaaMagiOf(hcArgs.magiProxy, irmaaSsH, filing);
            if (twoReturns) {
              magiHistoryA[0] = hcArgs.magiA;
              magiHistoryB[0] = hcArgs.magiB;
              irmaaMagiHistoryA[0] = irmaaMagiOf(hcArgs.magiA, profile.ssA || 0, irmaaStA);
              irmaaMagiHistoryB[0] = irmaaMagiOf(hcArgs.magiB, profile.ssB || 0, 'single');
            }
          }
          lastCost = healthcareCost(ctx, hcArgs);
          const c = lastCost.healthcare;
          hcArgs.magiProxy = magiProxy;
          hcArgs.magiA = magiA;
          hcArgs.magiB = magiB;
          return c;
        };
        // The IRMAA this year's MAGI sets is charged two years on (healthcareCost): to the partners on Medicare and alive
        // then, against that year's tiers (the filing status of this year's return, which SSA will read: E3); a two-return year is charged per person on the single tiers.
        // The solver prices its candidates on that year's tiers, estimated as this year's grown two years at the plan's
        // assumed inflation (a historical path's own future inflation is not known yet; scaling the tiers up equals scaling
        // the MAGI down). The IRMAA lines use the same estimate (magiThresholds, c.irmaaGrowth); the conversion ceiling keeps this year's edges
        // (the safe side, deliberate; Batch 5 revisits it).
        // The tier table is this year's return's filing status (E3, spec 5.1).
        const year2 = year + 2,
          survivor2 = year2 >= deathYear,
          medA = !(survivor2 && deceasedIsA) && age + 2 >= 65 && !((inputs.incomeKindA !== 'self' && age + 2 < retireAgeA) || (cover2 & 1) !== 0),
          medB = !singlePerson && !(survivor2 && deceasedIsB) && ageB + 2 >= 65 && !((inputs.incomeKindB !== 'self' && ageB + 2 < retireAgeB) || (cover2 & 2) !== 0);
        // B5 (spec 6.7): sa / sb, a 162(l) deduction pair (the pass's estimate unless given, as costAt): the phase-end block
        // prices a settled phase at its settled pair. At the estimate the expressions are the in-year ones, the same doubles.
        const irmaaAt = (trad, gain, ia = estInhA, ib = estInhB, sa = estSeA, sb = estSeB) => {
          if (!medA && !medB) return 0;
          if (twoReturns) {
            // E1c: priced on the pass's 162(l) estimate, as costAt.
            const ra = profile.seHealthA, rb = profile.seHealthB;
            profile.seHealthA = sa;
            profile.seHealthB = sb;
            const [ma, mb] = returnMagis(profile, trad, gain, ia, ib);
            profile.seHealthA = ra;
            profile.seHealthB = rb;
            return (
              (medA ? irmaaSurcharge(ctx, irmaaMagiOf(ma, profile.ssA || 0, irmaaStA) / irmaaGrowth2, 'single', year) : 0) +
              (medB ? irmaaSurcharge(ctx, irmaaMagiOf(mb, profile.ssB || 0, 'single') / irmaaGrowth2, 'single', year) : 0)
            );
          }
          let m;
          if (sa === estSeA && sb === estSeB) m = inh === null ? magiBase + trad + gain : magiBase - estInhA - estInhB + ia + ib + trad + gain;
          else {
            // the settled return's MAGI: the estimate replaced by the pair, as costAt builds it
            m = magiBase0 - sa - sb + trad + gain;
            if (inh !== null) m += ia + ib;
          }
          const s = irmaaSurcharge(ctx, irmaaMagiOf(m, irmaaSsH, filing) / irmaaGrowth2, filing, year);
          return (medA ? s : 0) + (medB ? s : 0);
        };
        // lambda for the year, from the start-of-year traditional pool; computed once (on first use) and held. Its pool
        // walk is net of the traditional share (of investable money at the start of the year) of this year's need,
        // leaving out this year's lump expenses (spec 13.1, 13.2). Only called from the withdrawal plan, after `flow` is known.
        // B5 (spec 6.5): the need is the flow before the 162(l) carry (flowOwn): the carry is not a yearly draw.
        // E1e decisions 15, 16: this pass's scheduled inherited draw net of its own tax and premium credit (0 without a draw); assigned
        // after `tax` below, read by the guardrail records and lambda.
        let inhNeedAdj = 0;
        const lambdaOf = () => {
          if (yearLambda) return yearLambda;
          const b = balSnapshot,
            tradNow = b.traditional + b.bondTraditional,
            inv = b.taxable + b.bondTaxable + tradNow + b.roth + b.bondRoth + b.cash;
          // E1d decision 12: one-time income, like a one-time expense, is not part of the yearly draw the walk assumes (it
          // overstates the need by the lump's own tax and any premium its MAGI raises, both already in `flow`)
          const lambdaNeed = inhNeedAdj !== 0
            ? Math.max(0, (lumpYear ? -flowOwn - lumpExpense + lumpFlow : -flowOwn - lumpExpense) + inhNeedAdj)
            : Math.max(0, lumpYear ? -flowOwn - lumpExpense + lumpFlow : -flowOwn - lumpExpense);
          yearLambdaNeed = lambdaNeed;
          // 4a: the plan's per-phase multiplier (choose only; this runs once a year, the result is held)
          const mult = planMode === 'choose' && plan && plan.mult ? plan.mult[phaseOf(ctx, age)] : 1;
          return (yearLambda = lambdaEstimate({ tradPool: tradNow, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor, need: lambdaNeed, tradShare: inv > 0 ? tradNow / inv : 0, mult, ctx }));
        };
        // Phased year: a stay-under plan converts nothing; a fill keeps the natural year's conversion, never more than this
        // pass's ceiling allows (spec 13.5).
        if (convertsThisYear && !(phased && yearPlan.kind === 'under')) {
          const conversionCap = Math.min(Math.max(0, traditionalBeforeRmd - rmd - seppLocked), magiSafeRoom);
          conversionAmount = solveRothConversion(ctx, profile, conversionCap, year, age);
          if (phased && yearPlan.kind === 'fill' && conversionAmount > naturalRec.conversion) conversionAmount = naturalRec.conversion;
          // The state taxes read the conversion apart from the draws (RI and PA, see taxFor).
          profile.conv = conversionAmount;
          if (conversionAmount > 0 && stateReadsK401(ctx, year)) {
            // Where the conversion comes from (IRAs first) and the 401(k) share of the draws after it, for the states that
            // read them: this pass's ledger steps below (growth, the 72(t) payments, the RMDs, applyRothConversion) replayed
            // on a copy of the shares. Keep the replay in step with those lines.
            const tGrown = bal.traditional * (1 + stockReturn),
              bGrown = bal.bondTraditional * (1 + bondReturn),
              seppPaid0 = seppSlots[0] + seppSlots[1] + seppSlots[2] + seppSlots[3],
              rmdFromTrad = Math.min(tGrown, rmd),
              cp = accountsConvertPreview(
                accts.trad,
                tGrown + bGrown,
                seppSlots,
                rmd > seppPaid0 && !singlePerson && !isSurvivorPeriod,
                rmdA - sepp72A,
                rmdB - sepp72B,
                Math.max(0, tGrown - rmdFromTrad) + Math.max(0, bGrown - (rmd - rmdFromTrad)),
                conversionAmount,
                seppActive,
              ),
              tk = cp.taken,
              all = tk[0] + tk[1] + tk[2] + tk[3];
            // One 401(k) share for the whole conversion (each partner's part of it follows ownerShareA, as the draw does), so the
            // household's converted 401(k) dollars are the ledger's.
            profile.convK401FracA = all > 0 ? (tk[1] + tk[3]) / all : 0;
            profile.convK401FracB = singlePerson || isSurvivorPeriod ? 0 : profile.convK401FracA;
            k401Fractions(ctx, cp.shares, year, singlePerson, isSurvivorPeriod, deceasedIsA, workingA, workingB, cp.drawFrac);
            profile.k401DrawFracA = cp.drawFrac[0];
            profile.k401DrawFracB = cp.drawFrac[1];
          }
        }
        magiProxy = magiBase + conversionAmount + estTrad + estGain;
        // Provisional (this pass's estimate); overwritten with the realized MAGI at
        // the end of the year. Only the plan's first-year IRMAA stand-in reads it: in a held phase
        // the settlement has rewritten it with the settled MAGI before the plan screens its
        // candidates, so a settled year is screened on its return (decision 4).
        irmaaMagiHistory[year] = irmaaMagiOf(magiProxy, irmaaSsH, filing);
        twoReturnHistory[year] = twoReturns;
        magiA = 0;
        magiB = 0;
        if (twoReturns) {
          [magiA, magiB] = returnMagis(profile, conversionAmount + estTrad, estGain, estInhA, estInhB);
          magiHistoryA[year] = magiA;
          magiHistoryB[year] = magiB;
          irmaaMagiHistoryA[year] = irmaaMagiOf(magiA, profile.ssA || 0, irmaaStA);
          irmaaMagiHistoryB[year] = irmaaMagiOf(magiB, profile.ssB || 0, 'single');
        }
        // Display-only running total: like totalTax below, this starts as the
        // pre-withdrawal MAGI proxy and is corrected after the withdrawal
        // waterfall runs to also include realized traditional withdrawals and
        // taxable-brokerage gains, so it does not understate income in years
        // funded mostly by withdrawals.
        let totalIncome = otherA + otherB + ss + inv.ordinary + inv.qualified + conversionAmount;
        if (lumpYear) totalIncome += lumpGainA + lumpGainB; // E1d: the year's lump gains (appended)
        const baseSpend =
          baseSpendingNominal(ctx, age, year, factor, incomeFactor) *
          guardrailSpendingMultiplier(ctx, guardrails, working) *
          (isSurvivorPeriod ? pct(inputs.survivorSpendingPct) : 1);
        if (lumpYear) guardrails.prevPortfolio = null; // E1d decision 11: the year after a lump year holds
        // acaEligibleA/B (computed above, before the Roth-conversion guard) say
        // which partners are on the individual market this year.
        hcArgs.magiProxy = magiProxy;
        hcArgs.magiA = magiA;
        hcArgs.magiB = magiB;
        const hcOut = healthcareCost(ctx, hcArgs);
        let healthcare = hcOut.healthcare;
        const ltc = hcOut.ltc,
          usesMagiEstimate = hcOut.usesMagiEstimate;
        if (usesMagiEstimate) estUsed = true;
        // E3 (spec 5.5, 5.6): the year's appeal result for the row (reset after a forced pass, below; never read from lastCost,
        // which the plan's probes and the 162(l) search overwrite) and the in-year flags for the plan's lines (independent of
        // the pass's MAGI).
        let appealYrA = hcOut.appealA,
          appealYrB = hcOut.appealB;
        const inYrA = hcOut.inYearA,
          inYrB = hcOut.inYearB;
        // E1c: the 162(l) deduction this pass's premiums allow (taxFor reads it); its MAGI is checked at the convergence test.
        // Once the year has switched to a held deduction (seHeld, below the convergence test: the consistent one, else Rev. Proc. 2014-41's alternative calculation) the
        // deduction is held at the estimate it computed, so the realized pair is the held pair and only the draws iterate.
        let seRealA = 0,
          seRealB = 0;
        if (seHeld) {
          seRealA = estSeA;
          seRealB = estSeB;
        } else if (profile.seAllowA || profile.seAllowB) {
          seHealthDeduction(healthcare, hcOut.premA, hcOut.premB, twoReturns, profile, SE_HEALTH);
          seRealA = SE_HEALTH[0];
          seRealB = SE_HEALTH[1];
        }
        profile.seHealthA = seRealA;
        profile.seHealthB = seRealB;
        // The pass's MAGI used estSeA/estSeB: the convergence test must check them.
        if (seLive && (estSeA !== 0 || estSeB !== 0 || seRealA !== 0 || seRealB !== 0)) estUsed = true;
        // The year's medical expenses for the itemized deduction (O2): premiums, Medicare and the care itself, less the
        // premiums deducted under 162(l). Set every pass: it follows the premium, which follows this pass's MAGI estimate.
        profile.medicalExpense = seLive ? healthcare + ltc - (seRealA + seRealB) : healthcare + ltc;
        const ficaTax = payrollTax(ctx, { wageA, wageB, healthPremiumA, healthPremiumB, filing, year, streamWagesA: ssWagesA, streamWagesB: ssWagesB, streamPremiumA: streams.premiumA, streamPremiumB: streams.premiumB, seTaxA, seTaxB, seNeA, seNeB });
        const tax = taxFor(ctx, profile, 0, conversionAmount) + ficaTax;
        // E1e decisions 15, 16 (spec 6.7): the need as if the inheritance were not there: the scheduled draw net of its own tax and of
        // the premium credit it costs this year. One taxFor and one healthcareCost per pass, only in a draw year.
        if (inhDraw > 0 && !testCtl.inhNoNeedAdj) {
          hookStats.inhNoDrawCalls++;
          const oA = profile.otherA, oB = profile.otherB, iA = profile.inheritedA, iB = profile.inheritedB,
            on = profile.inhOn, eA = profile.inhExclA, eB = profile.inhExclB, med = profile.medicalExpense;
          // the premium at the pass's MAGI less the draw (each return less its own share in a two-return year)
          hcArgs.magiProxy = magiProxy - inhDraw;
          if (twoReturns) { hcArgs.magiA = magiA - iA; hcArgs.magiB = magiB - iB; }
          const hcNoDraw = healthcareCost(ctx, hcArgs).healthcare;
          hcArgs.magiProxy = magiProxy; hcArgs.magiA = magiA; hcArgs.magiB = magiB;
          profile.otherA = oA - iA; profile.otherB = oB - iB;
          profile.inheritedA = 0; profile.inheritedB = 0; profile.inhOn = false; profile.inhExclA = 0; profile.inhExclB = 0;
          profile.medicalExpense = seLive ? hcNoDraw + ltc - (seRealA + seRealB) : hcNoDraw + ltc;
          const taxNoDraw = taxFor(ctx, profile, 0, conversionAmount) + ficaTax;
          // restore from the saved doubles, never by adding the draw back ((x - d) + d !== x)
          profile.otherA = oA; profile.otherB = oB; profile.inheritedA = iA; profile.inheritedB = iB; profile.inhOn = on;
          profile.inhExclA = eA; profile.inhExclB = eB; profile.medicalExpense = med;
          inhNeedAdj = inhDraw - (tax - taxNoDraw) - (healthcare - hcNoDraw);
        }
        // `tax` above only covers wages/SS/pension/RMD/conversion income and
        // is what the cash-flow waterfall below uses to size withdrawals.
        // Once traditional withdrawals and further taxable-brokerage gains
        // are known (after the withdrawal waterfall runs), `totalTax` is
        // corrected to include the tax those withdrawals themselves
        // generate; it's `tax` unchanged in a no-withdrawal (contributing)
        // year.
        let totalTax = tax;
        let expenses = baseSpend + healthcare + ltc + housing + loanPayment + extraExpense + lumpExpense;
      const bondTarget = mode.bucketStrategy ? (expenses - lumpExpense) * bondYears : null;
        // Cash flow after spending, tax and contributions. The two modes sum the same terms in a
        // different order. The results differ only by rounding, but the withdrawal bisection can
        // amplify that into visibly different numbers, so each keeps its own order until the
        // numerics are unified deliberately.
        let flow = mode.bucketStrategy
          ? wages + ss + pension + rmd - expenses - tax - traditionalContrib - rothContrib
          : wages +
            ss +
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
            rothContrib;
        // E1e: the scheduled inherited traditional draw is cash (appended after both strategies' sums: a legacy year is unchanged).
        if (inhDraw > 0) flow += inhDraw;
        // B5 (spec 6.5): the records read the flow before the carry (its own double, never derived by subtracting); the cash
        // mechanics (the branch, wd.need, the forced gate, the plan's gate and reach, the statistic) read the flow with it.
        // The carry is cash, not income: it never enters the MAGI.
        const flowOwn = flow;
        if (seCarryIn !== 0) flow += seCarryIn;
        growBalances(ctx, bal, { stockReturn, bondReturn, hysa, homeGrowth, inv });
        if (inh !== null) inheritedApply(inh, bal, stockReturn, factor, year);
        // A 72(t) payment comes out of its own account; each partner's RMD out of their own accounts
        // pro rata (a single person or the survivor owns everything, so that draw is pro rata and no
        // share moves).
        // (accountsConvertPreview above replays these ledger steps up to applyRothConversion: keep the two in step.)
        const seppPaid = seppSlots[0] + seppSlots[1] + seppSlots[2] + seppSlots[3];
        if (seppPaid > 0) accountsDrawSlots(accts.trad, bal.traditional + bal.bondTraditional, seppSlots);
        if (rmd > seppPaid && !singlePerson && !isSurvivorPeriod)
          accountsDraw(accts.trad, bal.traditional + bal.bondTraditional - seppPaid, [rmdA - sepp72A, rmdB - sepp72B]);
        withdrawRequiredDistributions(bal, rmd);
        applyRothConversion(bal, rothAccts, accts, conversionAmount, year, seppActive);
        bal.cash += oneTimeAmount;
        if (inhRothPayout > 0) bal.cash += inhRothPayout; // E1e: the inherited Roth payout is a transfer (no tax, no MAGI)
        const reserveTarget = inputs.cashReserve * factor;
        sweepExcessCash(bal, reserveTarget);
        // Ramp linearly over whatever time is actually available before
        // retirement, so the full target is always reached by rotationEndYear
        // (retirement itself) regardless of how large bondYears is set.
        const ladderGain = rotateIntoBondLadder(ctx, bal, { year, ...ladder }, profile, conversionAmount);
        const gpBase = bal.taxable + bal.bondTaxable + bal.traditional + bal.bondTraditional + bal.roth + bal.bondRoth + bal.cash;
        // E1e: the portfolio the rate is measured on includes the open inherited accounts and the year's draw (the portfolio before it).
        const guardrailPortfolioNow = inh === null ? gpBase : gpBase + bal.inheritedTrad + bal.inheritedRoth + inhDraw;
        const wd = newWithdrawal(ctx, { bal, rothAccts, accts, seppActive, profile, conversionAmount, rmd, inh, inhRule: inh === null ? null : stateRuleForYear(ctx, year) });
        // Gain realized by selling taxable stock for the pre-retirement ladder (a last resort).
        wd.taxableGainGross = ladderGain;
        // The bucket strategy only steers new surplus into the bond reserve in an up year.
        const surplusBondTarget = mode.bucketStrategy && stockReturn >= 0 ? bondTarget : null;
        if (flow >= 0) {
          accountsContribute(accts.trad, bal.traditional + bal.bondTraditional, acctContrib.trad);
          accountsContribute(accts.roth, bal.roth + bal.bondRoth, acctContrib.roth);
          rothAccountsContribute(rothAccts, acctContrib.roth);
          routeSurplus(bal, {
            flow,
            reserveTarget,
            bondTarget: surplusBondTarget,
            traditionalContrib,
            employerMatch,
            rothContrib,
          });
          if (ladderGain > 0) {
            totalTax = ficaTax + taxFor(ctx, profile, ladderGain, conversionAmount);
            totalIncome += ladderGain;
          }
          // The year's record, from the flow before the carry (recordOwnNeed).
          const recorded = recordOwnNeed(ctx, guardrails, flowOwn, lumpYear, lumpExpense, inhNeedAdj, guardrailPortfolioNow, working);
          if (recorded >= 0 && !working && year === retirementYear) firstWithdrawal = recorded;
        } else {
          wd.need = -flow;
          // The year's record, from the flow before the carry (recordOwnNeed).
          const recorded = recordOwnNeed(ctx, guardrails, flowOwn, lumpYear, lumpExpense, inhNeedAdj, guardrailPortfolioNow, working);
          if (recorded >= 0 && !working && year === retirementYear) firstWithdrawal = recorded;
          // Discretionary traditional / bondTraditional withdrawals (RMDs and 72(t) SEPP payments
          // are mandatory, handled above, and never penalized) owe the 10% early-withdrawal
          // penalty from an account unless its owner is 59.5+ or the account is a 401(k) covered
          // by Rule of 55; see accountStatuses.
          const statusCtx = { age, ageB, isSurvivorPeriod, deceasedIsA, workingA, workingB, retireAgeA, retireAgeB };
          wd.status = accountStatuses(ctx.inputs, statusCtx);
          wd.penaltyAware = hasPenalizedMoney(wd);
          const wopts = mode.bucketStrategy
            ? { yearReturn: stockReturn, bondTarget, refillCap: expenses - lumpExpense, age, remainingMagiRoom: incomeRoom(magiSafeRoom, conversionAmount) }
            : { age, remainingMagiRoom: incomeRoom(magiSafeRoom, conversionAmount) };
          const runWithdraw = (w) => {
            if (mode.bucketStrategy) (w.penaltyAware ? withdrawBucketPenaltyAware : withdrawBucket)(w, wopts);
            else withdrawStandard(w, wopts);
          };
          // The phased year holds its plan (set at the end of a phase, below) on every pass: the cap at the line, or the fill
          // to the floor. With no plan ('off', the natural phase) the draw runs as it is.
          if (yearPlan.kind === 'under') wd.magiCap = { limit: yearPlan.magi - magiBase, off: false };
          runWithdraw(wd);
          if (yearPlan.kind === 'fill') {
            // (E1e: read through wd.: the realized pair is destructured below)
            const m = inh === null ? magiBase + wd.traditionalGross + wd.taxableGainGross : magiBase - estInhA - estInhB + wd.inheritedGrossA + wd.inheritedGrossB + wd.traditionalGross + wd.taxableGainGross;
            if (m < yearPlan.magi) fillTraditional(wd, yearPlan.magi - m);
          }
          if (wd.need > 1 && !depletedAge) depletedAge = age;
          if (wd.homeDrawn > 1 && homeDrawAge === null) homeDrawAge = age;
          totalTax = ficaTax + taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty;
          totalIncome =
            otherA + otherB + ss + inv.ordinary + inv.qualified + wd.traditionalGross + wd.taxableGainGross;
          if (lumpYear) totalIncome += lumpGainA + lumpGainB; // E1d: the year's lump gains (appended)
          if (inh !== null) totalIncome += wd.inheritedGrossA + wd.inheritedGrossB; // E1e: the last-resort draws (appended)
          accountsContribute(accts.trad, bal.traditional + bal.bondTraditional, acctContrib.trad);
          accountsContribute(accts.roth, bal.roth + bal.bondRoth, acctContrib.roth);
          bal.traditional += traditionalContrib + employerMatch;
          bal.roth += rothContrib;
          rothAccountsContribute(rothAccts, acctContrib.roth);
        }
        // Realized totals for the MAGI convergence check, the next year's seed, and the row.
        const { traditionalGross, taxableGainGross, traditionalWithdrawn, taxableWithdrawn, rothWithdrawn, earlyPenalty } = wd;
        const resolvedMixCandidate = wd.mixCandidate;
        // E1e: the realized last-resort draws of the pass (0 when nothing was drawn).
        const inhRealA = wd.inheritedGrossA, inhRealB = wd.inheritedGrossB;
        if (inh !== null && (estInhA !== 0 || estInhB !== 0 || inhRealA !== 0 || inhRealB !== 0)) estUsed = true;
        const realizedTrad = traditionalGross - conversionAmount;
        const drift = inh === null
          ? Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain)
          : Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain) + Math.abs(inhRealA - estInhA) + Math.abs(inhRealB - estInhB);
        const unconverged = estUsed && (seLive ? drift + Math.abs(seRealA - estSeA) + Math.abs(seRealB - estSeB) : drift) > MAGI_ITER_TOL;
        // A replayed pass (phased year, below) repeats a phase's final pass exactly: no convergence decisions.
        if (usesMagiEstimate && !forcedPass && !replaying)
          passLog.push({ estTrad, estGain, estSeA, estSeB, estInhA, estInhB, charged: healthcare, realized: costAt(traditionalGross, taxableGainGross, seRealA, seRealB, inhRealA, inhRealB) });
        if (unconverged && !forcedPass && !replaying && phasePass < MAGI_ITER_MAX - 1) {
          // Damp after a few passes so a step in the subsidy schedule near the
          // 400%-FPL cliff can't make the estimate flip-flop between two values.
          const w = phasePass >= 3 ? 0.5 : 1;
          estTrad += w * (realizedTrad - estTrad);
          estGain += w * (taxableGainGross - estGain);
          estSeA += w * (seRealA - estSeA);
          estSeB += w * (seRealB - estSeB);
          if (inh !== null) {
            estInhA += w * (inhRealA - estInhA);
            estInhB += w * (inhRealB - estInhB);
          }
          continue;
        }
        // E1c decisions 9, 10 and 12: the 162(l) search is needed by an unconverged year that has not switched (a held year is not
        // re-checked). It runs at the draws it is handed (this pass's).
        // B5 (spec 6.3): a held pass builds it too, for the settlement at the phase's end (only a held year settles; a year that never
        // holds allocates nothing).
        if ((profile.seAllowA || profile.seAllowB) && seSearch === null && (seHeld ? !testCtl.seNoSettle : !forcedPass && !replaying && unconverged)) {
          seSearch = (trad, gain, settle = false) => {
            // Step 1 of either method (Rev. Proc. 2014-41 section 5): the deduction at the full premiums (priced at a MAGI above
            // every line). Nothing to hold at a $0 deduction (the Solo plan took the whole net, no premium, no cap): the year
            // goes on as it did before the switch existed.
            // B5: step 1 is the premiums paid, so it never writes the year-0 IRMAA stand-in (seStand0): at its MAGI above every
            // line the stand-in would charge the top tier. It reads the pass's provisional stand-in, as the hold does.
            const stand0 = seStand0;
            seStand0 = false;
            costAt(trad, gain, -1e12, -1e12, inhRealA, inhRealB);
            seStand0 = stand0;
            seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
            const d1A = SE_HEALTH[0],
              d1B = SE_HEALTH[1];
            seFixA = 0;
            seFixB = 0;
            seNeedAlt = false;
            if (settle) {
              seLoA = seLoB = 0;
              seConsA = seConsB = false;
              se502A = se502B = 0;
              seD1A = d1A;
              seD1B = d1B;
            }
            if (!(d1A + d1B > 0)) return false;
            // Decision 10: first the consistent deduction (D equal to the deduction the premium at D's MAGI allows, within $1), holding
            // these draws: the iterative method's own answer where it converges, and "another method that produces amounts that
            // satisfy applicable tax law" (section 5.01). The deduction the premium allows falls as D rises (D lowers the MAGI), so
            // g(D) = allowed(D) - D is decreasing and a bisection on [0, step-1 deduction] finds the one crossing. One return: one
            // search on the total (seHealthDeduction splits it, A first). Two returns: one per return (a return's premium reads only
            // its own MAGI). Where g is not monotone (below 100% of the poverty line in a non-expansion state, or with
            // medicaidWhenEligible off, the premium rises as MAGI falls) the search may miss a consistent answer and the part takes the
            // alternative calculation: legal either way. A part with no consistent answer takes section 5.02's steps 2-3: the deduction
            // at the premium after the credit the step-1 MAGIs allow.
            const capA = profile.seAllowA ? profile.sePlanNetA || 0 : 0;
            let okA = false,
              okB = false;
            // The deduction the premium at the MAGI of the pair (sa, sb) allows: the total on one return (slot -1), else a return's slot.
            const allowedAt = (sa, sb, slot) => {
              costAt(trad, gain, sa, sb, inhRealA, inhRealB);
              seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
              return slot < 0 ? SE_HEALTH[0] + SE_HEALTH[1] : SE_HEALTH[slot];
            };
            // The crossing of g on [0, top] (g(0) >= 0, g decreasing): the left end of the final bracket, or -1 when it is not within $1.
            // B5: the left end is also left in seLoLast, on a miss too (the settlement's lo candidate: allowed(lo) >= lo, so it is legal).
            const rootOf = (top, slot, otherSe) => {
              const probe = (d) => (slot < 0 ? allowedAt(Math.min(d, capA), d - Math.min(d, capA), -1) : slot === 0 ? allowedAt(d, otherSe, 0) : allowedAt(otherSe, d, 1)) - d;
              seLoLast = 0;
              if (!(top > 0)) return 0;
              if (probe(top) >= 0) return (seLoLast = top);
              let lo = 0,
                hi = top;
              for (let i = 0; i < 60 && hi - lo > 0.01; i++) {
                const mid = (lo + hi) / 2;
                if (probe(mid) >= 0) lo = mid;
                else hi = mid;
              }
              seLoLast = lo;
              return probe(lo) <= 1 ? lo : -1;
            };
            if (!twoReturns) {
              const t = rootOf(d1A + d1B, -1, 0);
              if (settle) {
                // the total's left end, split as the total is (A first, up to A's cap)
                seLoA = Math.min(seLoLast, capA);
                seLoB = seLoLast - seLoA;
              }
              if (t >= 0) {
                seFixA = Math.min(t, capA);
                seFixB = t - seFixA;
                okA = okB = true;
              } else seNeedAlt = true;
            } else {
              const ra = rootOf(d1A, 0, d1B);
              if (settle) seLoA = seLoLast;
              const rb = rootOf(d1B, 1, d1A);
              if (settle) seLoB = seLoLast;
              okA = ra >= 0;
              okB = rb >= 0;
              if (okA) seFixA = ra;
              if (okB) seFixB = rb;
              seNeedAlt = !okA || !okB;
            }
            if (seNeedAlt) {
              costAt(trad, gain, d1A, d1B, inhRealA, inhRealB);
              seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
              if (!okA) seFixA = SE_HEALTH[0];
              if (!okB) seFixB = SE_HEALTH[1];
              if (settle) {
                se502A = SE_HEALTH[0];
                se502B = SE_HEALTH[1];
              }
            }
            if (settle) {
              seConsA = okA;
              seConsB = okB;
            }
            return true;
          };
        }
        if (unconverged && !forcedPass && !replaying && !seHeld && (profile.seAllowA || profile.seAllowB)) {
          // E1c decisions 9, 10 and 12 (Rev. Proc. 2014-41 section 5): the damped iteration did not come within $1. Hold the consistent
          // deduction if there is one, else the alternative calculation's (seSearch); the year re-runs with it held, so the premium
          // charged is the one the recorded MAGI allows. Nothing is held at a $0 step-1 deduction: the pass falls through to the
          // forced pass below as it did before the switch (the step-1 costAt left lastCost changed; every reader of lastCost
          // below calls costAt first).
          if (seSearch(traditionalGross, taxableGainGross)) {
            estSeA = seFixA;
            estSeB = seFixB;
            seKind = seNeedAlt ? 2 : 1;
            estInhA = inhRealA;
            estInhB = inhRealB;
            estTrad = realizedTrad;
            estGain = taxableGainGross;
            seHeld = true;
            passLog.length = 0;
            phasePass = -1;
            continue;
          }
        }
        if (unconverged && !forcedPass && !replaying && usesMagiEstimate) {
          // No consistent answer (the cost steps down as MAGI rises past a Medicaid / 100% line): re-run the pass that overpaid the
          // least (its realized MAGI costs no more than it was charged), once. Its inputs are the logged estimate, so the pass
          // repeats exactly; the realized cost is charged below and the refund goes to cash.
          let pick = null;
          for (const p of passLog)
            if (p.realized <= p.charged + 1e-9 && (pick === null || p.charged - p.realized < pick.charged - pick.realized)) pick = p;
          if (pick !== null) {
            estTrad = pick.estTrad;
            estGain = pick.estGain;
            estSeA = pick.estSeA;
            estSeB = pick.estSeB;
            estInhA = pick.estInhA;
            estInhB = pick.estInhB;
            forcedPass = true;
            continue;
          }
          // Only a real step (the last pass charged more than 5 off its own MAGI) counts as unresolved: a smooth year that
          // ends at the cap a couple of dollars off is the old slow convergence, not a cliff.
          const last = passLog[passLog.length - 1];
          if (last && Math.abs(last.charged - last.realized) > 5) phaseUnresolved = true;
        }
        // A held deduction is not re-checked inside the year (decision 12): it is the year's working estimate, priced on the draws of
        // the pass that failed to converge, and the year runs on with it. The phase's return is settled at its final draws below
        // (B5, after realizedMagi), at the return's price, and the difference goes to next year's cash.
        let forcedRefund = 0; // the forced pass's refund (the trace reads it)
        if (forcedPass && flow < 0) {
          // Charge the cost at the realized MAGI, return the difference to cash, and re-price the tax (the medical deduction follows the
          // premium). The cash can only rise: the refund is larger than the tax the lower deduction adds (and a held 162(l)
          // deduction, below, is not re-priced at all).
          const realizedCost = costAt(traditionalGross, taxableGainGross, seRealA, seRealB, inhRealA, inhRealB),
            refund = healthcare - realizedCost;
          healthcare = realizedCost;
          forcedRefund = refund;
          appealYrA = lastCost.appealA; appealYrB = lastCost.appealB; // E3: the charge actually kept
          expenses -= refund;
          // E1c: the 162(l) deduction follows the premium actually charged (lastCost is the costAt call above), unless the
          // year holds its deduction (seHeld): its deduction is held, and only a trad/gain step is forced here.
          if (!seHeld && (profile.seAllowA || profile.seAllowB)) {
            seHealthDeduction(healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
            seRealA = SE_HEALTH[0];
            seRealB = SE_HEALTH[1];
            profile.seHealthA = seRealA;
            profile.seHealthB = seRealB;
          }
          profile.medicalExpense = healthcare + ltc - (seRealA + seRealB);
          const taxAfter = ficaTax + taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty;
          bal.cash += refund + (totalTax - taxAfter);
          totalTax = taxAfter;
          // The guardrail and the first-withdrawal figure were recorded with the premium that was charged before the refund: record the
          // need net of it (the pass restarts the guardrail's last-year figures from their start-of-year values).
          // B5 (spec 6.5): only a year whose own flow (before the carry) draws; a balance due that made the cash draw records nothing,
          // as a surplus year does, unless the inherited path recorded (below).
          if (flowOwn < 0) {
            const needNet = -flowOwn - refund;
            const recordedNet = inhNeedAdj !== 0 ? Math.max(0, needNet - lumpExpense + inhNeedAdj) : Math.max(0, needNet - lumpExpense);
            if (!lumpYear && !working && year === retirementYear) firstWithdrawal = recordedNet;
            guardrails.initialWR = guardrailSnapshot.initialWR;
            if (!lumpYear) recordGuardrailWithdrawal(ctx, guardrails, recordedNet, guardrailPortfolioNow, working); // E1d decision 7
          } else if (inhNeedAdj > 0 && -flowOwn + inhNeedAdj > 0) {
            // E1e: a balance-due carry tipped the year (flowOwn >= 0 > flow) and the inherited path recorded (recordOwnNeed's
            // test): re-record that need net of the refund, as above. Only reachable with a carry (without one flowOwn is the flow).
            const recordedNet = Math.max(0, -flowOwn - refund - lumpExpense + inhNeedAdj);
            if (!lumpYear && !working && year === retirementYear) firstWithdrawal = recordedNet;
            guardrails.initialWR = guardrailSnapshot.initialWR;
            if (!lumpYear) recordGuardrailWithdrawal(ctx, guardrails, recordedNet, guardrailPortfolioNow, working); // E1d decision 7
          }
        }
        // B5 (spec 6.4): the phase's return. healthcare is final only here (after the forced pass's refund). Outside a settled phase the
        // return is what the year paid: healthcareRet = healthcare, seSettle = 0 (the settlement below overwrites them).
        let seSettled = false,
          healthcareRet = healthcare,
          seSettle = 0,
          taxSettled = 0,
          seSettleTr = null;
        // The year's actual MAGI (all realized income, conversion and
        // withdrawals included): what the IRMAA lookback reads two years on.
        // E1c: net of the realized 162(l) deduction (also after a forced pass).
        let realizedMagi = seLive ? magiBase0 - (seRealA + seRealB) + traditionalGross + taxableGainGross : magiBase0 + traditionalGross + taxableGainGross;
        if (inh !== null) realizedMagi += inhRealA + inhRealB; // E1e: the last-resort draws (appended)
        // B5 (spec 6.1-6.4, decisions 1, 3 and 5): the settlement of a held phase. A phase whose final pass holds a 162(l) deduction
        // (forced afterwards or not; a replay recomputes it, the same doubles) files its return at its final draws: the consistent
        // deduction at those draws, else the better legal one by tax plus premium (section 5.02's, when it passes the legal bound,
        // or the search's left end), all priced at the return's price (the coverage the pass paid for, reconciled at the return's
        // MAGI). The year keeps its draws, its paid premium and its paid tax; the return's MAGI is recorded, and the difference
        // (seSettle: a refund > 0, a balance due < 0) is next year's cash (seCarry, at the year end). Runs before the phase-end block,
        // so every phase decision reads the settled return. An unheld phase never enters it.
        if (seHeld && !testCtl.seNoSettle) {
          // 1. The coverage kinds the pass paid for, from the very pricing it was charged (the forced pass: the realized cost; else
          // the pass's own estimate, which hcArgs still holds: costAt restores it). ACA_KIND is filled only on the ACA branch.
          ACA_KIND[0] = ACA_KIND[1] = 0;
          hcArgs.recon = -1;
          if (forcedPass && flow < 0) costAt(traditionalGross, taxableGainGross, seRealA, seRealB, inhRealA, inhRealB);
          else healthcareCost(ctx, hcArgs);
          hcArgs.reconKindA = ACA_KIND[0];
          hcArgs.reconKindB = ACA_KIND[1];
          // Every price below is the return's, until the reset at the end of the block.
          hcArgs.recon = 1;
          // The tax as the year's branch computed it (same arguments, same order): an unmoved deduction gives the same double.
          const taxAsPaid = () =>
            flow < 0
              ? ficaTax + taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty
              : ladderGain > 0
                ? ficaTax + taxFor(ctx, profile, ladderGain, conversionAmount)
                : taxFor(ctx, profile, 0, conversionAmount) + ficaTax;
          // Year 0 without entered prior MAGIs: IRMAA's lookback stand-in is this year's own MAGI (irmaaMagiHistory[0]), so every
          // return pricing below (the search's probes, the bound check, the candidates) prices IRMAA at its own MAGI, as the final
          // pricing does (otherwise a deduction judged at the paid stand-in can exceed the return's premium). The search's step 1
          // (the premiums paid) is not a return pricing: it reads the paid stand-in.
          seStand0 = year === 0 && !ctx.inputs.irmaaPriorKnown;
          // 2. The search at the final draws (a false return: a step-1 deduction of 0 at the return's price, e.g. Medicaid: the pair is 0).
          const found = seSearch(traditionalGross, taxableGainGross, true);
          // 3. The candidates per part: the consistent deduction alone; else section 5.02's (when it passes the legal bound: D at
          // most the deduction the return's premium at D's own MAGI allows, plus $1) and the left end lo (always legal). One return
          // has one part (the household's total, split A first); two returns one per return.
          const consA = twoReturns ? seConsA : seConsA && seConsB;
          let ok502A = false,
            ok502B = false;
          if (found && (twoReturns ? !seConsA || !seConsB : !consA)) {
            // one costAt prices both returns (a return's premium reads only its own MAGI)
            const ba = twoReturns && seConsA ? seFixA : se502A,
              bb = twoReturns && seConsB ? seFixB : se502B;
            costAt(traditionalGross, taxableGainGross, ba, bb, inhRealA, inhRealB);
            seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
            if (twoReturns) {
              ok502A = !seConsA && se502A <= SE_HEALTH[0] + 1;
              ok502B = !seConsB && se502B <= SE_HEALTH[1] + 1;
            } else ok502A = se502A + se502B <= SE_HEALTH[0] + SE_HEALTH[1] + 1;
          }
          const combos = settleCombos(found, twoReturns, consA, ok502A, seFixA, se502A, seLoA, seConsB, ok502B, seFixB, se502B, seLoB);
          let sums = null;
          if (combos.length > 1) {
            // Each combination priced as its return would be: the return's premium at its MAGI plus the tax with its own medical
            // deduction.
            sums = [];
            for (const c of combos) {
              const h = costAt(traditionalGross, taxableGainGross, c.a, c.b, inhRealA, inhRealB);
              profile.seHealthA = c.a;
              profile.seHealthB = c.b;
              profile.medicalExpense = h + ltc - (c.a + c.b);
              sums.push(h + taxAsPaid());
            }
          }
          const chosen = settleDecide(combos, sums);
          seStand0 = false;
          const sdA = chosen.a,
            sdB = chosen.b;
          // 4. The settled MAGI (the pair on the profile, so returnMagis reads it), its histories written before the final pricing
          // (year 0's IRMAA stand-in is the return's MAGI), then the return's premium and its appeal fields.
          profile.seHealthA = sdA;
          profile.seHealthB = sdB;
          realizedMagi = magiBase0 - (sdA + sdB) + traditionalGross + taxableGainGross;
          if (inh !== null) realizedMagi += inhRealA + inhRealB;
          irmaaMagiHistory[year] = irmaaMagiOf(realizedMagi, irmaaSsH, filing);
          if (twoReturns) {
            [magiHistoryA[year], magiHistoryB[year]] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB);
            irmaaMagiHistoryA[year] = irmaaMagiOf(magiHistoryA[year], profile.ssA || 0, irmaaStA);
            irmaaMagiHistoryB[year] = irmaaMagiOf(magiHistoryB[year], profile.ssB || 0, 'single');
          }
          const healthcareSettled = costAt(traditionalGross, taxableGainGross, sdA, sdB, inhRealA, inhRealB);
          appealYrA = lastCost.appealA;
          appealYrB = lastCost.appealB;
          // 5. The settled tax, with the return's medical deduction.
          profile.medicalExpense = healthcareSettled + ltc - (sdA + sdB);
          taxSettled = taxAsPaid();
          // 6. The amount, and the settled pair as the year's.
          seSettle = (healthcare - healthcareSettled) + (totalTax - taxSettled);
          if (trace)
            seSettleTr = { kindA: hcArgs.reconKindA, kindB: hcArgs.reconKindB, partsA: chosen.partsA, partsB: chosen.partsB, d1A: seD1A, d1B: seD1B, d502A: se502A, d502B: se502B, loA: seLoA, loB: seLoB, sums: sums === null ? (found ? [healthcareSettled + taxSettled] : []) : sums, hist0: irmaaMagiHistory[0] };
          seRealA = sdA;
          seRealB = sdB;
          healthcareRet = healthcareSettled;
          seSettled = true;
          hcArgs.recon = 0;
        }
        // Phased year, at the end of a phase (see the phase notes above the loop).
        if (phased && !replaying) {
          let next = -1;
          // B5 (spec 6.7, decision 4): a held phase is judged on its settled return. healthcareRet is the return's premium,
          // seSettle the settlement (owed to the household when > 0, at face value) and the pair the settled deduction; an
          // unheld phase reads what it paid (healthcareRet = healthcare) and the estimate (the in-year expressions, unchanged).
          const pairA = seSettled ? seRealA : estSeA,
            pairB = seSettled ? seRealB : estSeB;
          if (trialIdx < 0) {
            // The natural year has converged (or ended in its forced pass). Lines in reach of its MAGI: from the MAGI with no
            // discretionary draw and no conversion to the MAGI with the conversion plus REACH_GROSS_UP x the need.
            if (flow < 0) {
              if (planTrace) planTr = { year };
              const lo = magiBase + ladderGain,
                hi = lo + conversionAmount + REACH_GROSS_UP * -flow,
                convA = conversionAmount * profile.ownerShareA;
              const intent = planMode === 'apply' && plan && plan.intents ? plan.intents[age] : null;
              // apply builds the year's lines only in a year with an intent (choose always).
              const lines =
                planMode === 'choose' || intent
                  ? magiThresholds(ctx, { year, filing, twoReturns, profile, preMagi: preConvMagi + conversionAmount, preMagiA: preMagiA + convA, preMagiB: preMagiB + conversionAmount - convA, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA: employerA, workingB: employerB, age, ageB, irmaa: { filing, a: medA || inYrA, b: medB || inYrB }, irmaaGrowth: inYrA || inYrB ? 1 : irmaaGrowth2, irmaaGrowthA: inYrA ? 1 : irmaaGrowth2, irmaaGrowthB: inYrB ? 1 : irmaaGrowth2, lo, hi })
                  : NO_THRESHOLDS;
              // The converged natural year as the eligibility tests read it (underEligible / fillEligible), the same for both modes.
              const natOf = intent || (planMode === 'choose' && lines.length) ? () => ({ natMagi: realizedMagi, natConv: conversionAmount, natTrad: wd.cappableTraditional, lo, hi, canFill: freeTraditional(wd) > 0 }) : null;
              if (intent) {
                // apply (spec section 6): follow the plan literally. The intent's line is looked up by id and return among the very
                // lines choose builds (same call, same lo / hi from the converged natural year); a line that does not exist this
                // year, a natural MAGI already on the plan's side, or a plan the year cannot carry keeps the natural year.
                planStats.intentYears++;
                const t = lines.find((l) => l.id === intent.line && l.ret === intent.ret),
                  nat = t ? natOf() : null;
                let trial = null;
                if (!t) planStats.absent++;
                else if (intent.kind === 'under') {
                  if (t.magi > realizedMagi) planStats.skippedSide++;
                  else if (!underEligible(t, nat)) planStats.skippedIneligible++;
                  else trial = underPlanOf(t);
                } else {
                  if (t.magi <= realizedMagi) planStats.skippedSide++;
                  else if (!fillEligible(t, nat)) planStats.skippedIneligible++;
                  else trial = fillPlanOf(t);
                }
                if (trial) {
                  naturalRec = { plan: NO_PLAN, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seA: seRealA, seB: seRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, realizedTrad, gain: taxableGainGross, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, ok: true };
                  trials = [trial];
                  trialRecs = [];
                  next = 0;
                }
              }
              if (planMode === 'choose' && lines.length) {
                trials = yearPlanCandidates({ thresholds: lines, ...natOf(), gain: taxableGainGross, magiBase, premiumAt: costAt, irmaaAt });
                // The natural year's record: the inputs that replay its final pass, its score and what the trials start from.
                const lam = trials.length ? lambdaOf() : null;
                naturalRec = { plan: NO_PLAN, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seA: seRealA, seB: seRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, realizedTrad, gain: taxableGainGross, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, cliffCost: healthcareRet + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB), ok: true, score: lam ? (seSettled ? afterTaxValue(bal, lam.lambda, lam.tauGain) + seSettle - irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : afterTaxValue(bal, lam.lambda, lam.tauGain) - irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB)) : null };
                if (trials.length) {
                  trialRecs = [];
                  next = 0;
                } else if (planTr) planTr.candidates = [{ kind: 'none', magi: realizedMagi, realized: realizedMagi, label: '', conversion: conversionAmount, cliffCost: naturalRec.cliffCost, score: null, ok: true }];
              }
            }
          } else if (planMode === 'apply') {
            // apply: the plan's trial is done. Kept if it met its plan and left no need unmet (no lambda, no score, no healthcare
            // test: spec section 6); otherwise the natural year's final pass is replayed, as choose replays a non-last winner.
            const met = yearPlan.kind === 'under' ? realizedMagi <= yearPlan.magi + 1 : realizedMagi >= yearPlan.magi - 1;
            if (met && wd.need <= 1) {
              planStats.applied++;
              if (yearPlan.kind === 'under') planStats.rothShift += rothWithdrawn - naturalRec.roth;
              if (yearPlan.kind === 'under' && lineFamily(yearPlan.id) === 'irmaa' && yearPlan.ret === 'H')
                irmaaChecks.push({ y: year + 2, filing, nat: irmaaMagiOf(naturalRec.realized, irmaaSsH, filing), trial: irmaaMagiOf(realizedMagi, irmaaSsH, filing) });
            } else {
              planStats.fallback++;
              yearPlan = NO_PLAN;
              estTrad = naturalRec.estTrad;
              estGain = naturalRec.estGain;
              estSeA = naturalRec.estSeA;
              estSeB = naturalRec.estSeB;
              estInhA = naturalRec.estInhA;
              estInhB = naturalRec.estInhB;
              seHeld = naturalRec.seHeld;
              seKind = naturalRec.seKind;
              forcedPass = naturalRec.forced;
              phaseUnresolved = naturalRec.unresolved;
              replaying = true;
              continue;
            }
          } else {
            // A trial's iteration is done: record it. It counts only if it met its plan (a cap limits traditional draws only, so
            // gains, the bond reserve and the release can carry MAGI over the line), left no need unmet and saves more than $1
            // of premium plus IRMAA against the natural year (13.7 B: a real cliff, not a bet on this year's tax rate).
            const lam = lambdaOf(),
              met = yearPlan.kind === 'under' ? realizedMagi <= yearPlan.magi + 1 : realizedMagi >= yearPlan.magi - 1,
              cliffCost = healthcareRet + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB);
            trialRecs.push({ plan: yearPlan, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, cliffCost, ok: met && wd.need <= 1 && naturalRec.cliffCost - cliffCost > 1, score: seSettled ? afterTaxValue(bal, lam.lambda, lam.tauGain) + seSettle - irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : afterTaxValue(bal, lam.lambda, lam.tauGain) - irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB) });
            if (trialIdx + 1 < trials.length) next = trialIdx + 1;
            else {
              let best = naturalRec;
              for (const t of trialRecs) if (t.ok && t.score > best.score + (best === naturalRec ? 1 : 0)) best = t;
              if (planTr) {
                planTr.candidates = [naturalRec, ...trialRecs].map((t) => ({ kind: t.plan.kind, magi: t.plan.kind === 'none' ? t.realized : t.plan.magi, realized: t.realized, label: t.plan.label, conversion: t.conversion, cliffCost: t.cliffCost, score: t.score, ok: t.ok }));
                planTr.chosenScore = best.score;
              }
              // The winning intent, recorded once.
              if (best !== naturalRec) intents[age] = { kind: best.plan.kind, line: best.plan.id, ret: best.plan.ret };
              if (best !== trialRecs[trialRecs.length - 1]) {
                // Replay the winner's final pass from the snapshot: same plan, same estimates, same forced flag.
                yearPlan = best.plan;
                estTrad = best.estTrad;
                estGain = best.estGain;
                estSeA = best.estSeA;
                estSeB = best.estSeB;
                estInhA = best.estInhA;
                estInhB = best.estInhB;
                seHeld = best.seHeld;
                seKind = best.seKind;
                forcedPass = best.forced;
                phaseUnresolved = best.unresolved;
                replaying = true;
                continue;
              }
            }
          }
          if (next >= 0) {
            // Start a trial: a fresh iteration from the year's snapshot with the plan held, seeded from the natural year.
            trialIdx = next;
            yearPlan = trials[next];
            estTrad = naturalRec.realizedTrad;
            estGain = naturalRec.gain;
            estSeA = naturalRec.seA;
            estSeB = naturalRec.seB;
            estInhA = naturalRec.inhA;
            estInhB = naturalRec.inhB;
            seHeld = false;
            seKind = 0;
            forcedPass = false;
            phaseUnresolved = false;
            passLog.length = 0;
            phasePass = -1;
            continue;
          }
        }
        // The kept phase's statistics only.
        if (forcedPass && flow < 0) magiStats.forced++;
        if (phaseUnresolved) magiStats.unresolved++;
        if (seKind === 1) magiStats.seFixed++;
        else if (seKind === 2) magiStats.seAlternative++;
        // Next year's natural phase is seeded from this year's natural draw, as the `off` year would be.
        prevDiscTraditional = naturalRec ? naturalRec.realizedTrad : realizedTrad;
        prevTaxableGainGross = naturalRec ? naturalRec.gain : taxableGainGross;
        prevSeHealthA = naturalRec ? naturalRec.seA : seRealA;
        prevSeHealthB = naturalRec ? naturalRec.seB : seRealB;
        prevInhA = naturalRec ? naturalRec.inhA : inhRealA;
        prevInhB = naturalRec ? naturalRec.inhB : inhRealB;
        if (phased && planTr) {
          planTr.movedSample = yearLambda ? yearLambda.movedSample : false;
          planTr.lambdaNeed = yearLambda ? yearLambdaNeed : null;
          planTr.lambda = yearLambda ? yearLambda.lambda : null;
          planTr.intent = (intents && intents[age]) || null;
          planTrace.push(planTr);
        }
        irmaaMagiHistory[year] = irmaaMagiOf(realizedMagi, irmaaSsH, filing);
        if (twoReturns) {
          [magiHistoryA[year], magiHistoryB[year]] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB);
          irmaaMagiHistoryA[year] = irmaaMagiOf(magiHistoryA[year], profile.ssA || 0, irmaaStA);
          irmaaMagiHistoryB[year] = irmaaMagiOf(magiHistoryB[year], profile.ssB || 0, 'single');
        }
        bal.mortgage = Math.max(0, bal.mortgage);
        const loanBalance = loans.reduce((sum, l) => sum + (l.balances[year] || 0), 0),
          bonds = bal.bondTaxable + bal.bondTraditional + bal.bondRoth,
          investableHousehold = bal.taxable + bonds + bal.traditional + bal.roth + bal.cash,
          // E1e: the open inherited accounts are investable (appended: a legacy year is the same double).
          investable = inh === null ? investableHousehold : investableHousehold + bal.inheritedTrad + bal.inheritedRoth,
          homeEquity =
            inputs.tenure === 'own' || inputs.tenure === 'rentThenBuy'
              ? Math.max(0, bal.home - bal.mortgage)
              : 0,
          total = investable + homeEquity - loanBalance;
        const row = {
          age,
          ageB,
          year,
          taxable: bal.taxable,
          bonds,
          traditional: inh === null ? bal.traditional : bal.traditional + bal.inheritedTrad,
          roth: inh === null ? bal.roth : bal.roth + bal.inheritedRoth,
          cash: bal.cash,
          homeEquity,
          loanBalance,
          investable,
          total,
          working,
          workingA,
          workingB,
          conversionAmount,
          mixCandidate: resolvedMixCandidate,
          magiProxy: realizedMagi,
          expenses,
          tax: totalTax,
          income: totalIncome,
          wages,
          ss,
          pension,
          rmd,
          sepp72: sepp72A + sepp72B,
          earlyPenalty,
          traditionalWithdrawn,
          taxableWithdrawn,
          rothWithdrawn,
          housing,
          healthcare,
          ltc,
          loanPayment,
          extraExpense,
          lumpExpense,
          baseSpend,
        };
        // E1e: a year with an open or paid-out inherited account carries its fields; the draw is also a traditional withdrawal.
        if (inh !== null && INH_OUT.any) {
          row.inheritedTrad = bal.inheritedTrad;
          row.inheritedRoth = bal.inheritedRoth;
          row.inheritedDraw = inhDraw;
          if (inhDraw > 0) row.traditionalWithdrawn += inhDraw;
        }
        // B5 (spec 6.5): the 162(l) carry the year received (only when non-zero).
        if (seCarryIn !== 0) row.seSettlementIn = seCarryIn;
        // B5 (spec 6.4): a settled year's return (flat scalars, only in those rows): the settled pair, the return's premium and tax,
        // and the settlement (next year's carry). healthcare and tax stay as paid.
        if (seSettled) {
          row.seDeductionA = seRealA;
          row.seDeductionB = seRealB;
          row.healthcareSettled = healthcareRet;
          row.taxSettled = taxSettled;
          row.seSettlement = seSettle;
        }
        // Historical rows also carry the running inflation factor (real-dollar charts divide by it).
        if (isHistorical) row.cumFactor = factor;
        if (twoReturns) {
          row.magiA = magiHistoryA[year];
          row.magiB = magiHistoryB[year];
        }
        // E3 (spec 5.6): a year whose IRMAA charge an appeal lowered (flat scalars, only in those rows: historical_parity
        // compares non-numbers with !==).
        if (appealYrA >= 0) {
          row.irmaaAppealYearA = taxYearOf(ctx, appealYrA);
          row.irmaaAppealKindA = irmaaAppealKind(appeal.eventA, year, appealYrA);
        }
        if (appealYrB >= 0) {
          row.irmaaAppealYearB = taxYearOf(ctx, appealYrB);
          row.irmaaAppealKindB = irmaaAppealKind(appeal.eventB, year, appealYrB);
        }
        if (yearPlan.kind !== 'none') {
          // Phased year: the label says only what happened: the kept pass's realized MAGI met the plan (a missed plan is counted).
          if (yearPlan.kind === 'under' ? realizedMagi <= yearPlan.magi + 1 : realizedMagi >= yearPlan.magi - 1)
            row.cliffChoice = (yearPlan.kind === 'under' ? 'stayed under ' : 'filled to ') + yearPlan.label;
          else magiStats.planMissed++;
        }
        rows.push(row);
        if (year === projectionYears) endTax = { profile: { ...profile }, lastGain: wd.taxableGainGross, lastTrad: wd.traditionalGross };
        if (trace) {
          const tradPool = bal.traditional + bal.bondTraditional,
            rothPool = bal.roth + bal.bondRoth;
          trace.push({
            year,
            tradPool,
            rothPool,
            trad: accountBalances(accts.trad, tradPool),
            roth: accountBalances(accts.roth, rothPool),
            tradShares: accts.trad.slice(),
            rothShares: accts.roth.slice(),
            conversionAmount,
            profile: { ...profile },
            ficaTax,
            guardrails: { ...guardrails },
            firstWithdrawal,
            forcedPass,
            medA,
            medB,
            rothBasis: rothAccts.map((L) => L.basis),
            rothConv: rothAccts.map((L) => L.conv.reduce((sum, c) => sum + c.amount, 0)),
            inherited: inh === null ? null : Array.from(inh.bal),
            inhNeedAdj,
            gpBase,
            inhLastResortA: inhRealA,
            inhLastResortB: inhRealB,
            passes: iter + 1,
            taxable: bal.taxable,
            taxableBasis: bal.taxableBasis,
            flowOwn,
            forcedRefund,
            seSettle: seSettleTr,
          });
        }
        // B5 (spec 6.5): the kept phase's settlement is next year's carry (0 when the year did not settle).
        seCarry = seSettle;
        // Test only: an outgoing carry added to this year's (after the settlement's own assignment).
        if (testCtl.seCarryAt !== null && testCtl.seCarryAt.year === year) seCarry += testCtl.seCarryAt.amount;
        break;
      }
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
      ...mortgageResultAges(ctx, futureBuy, schedule),
    };
    // Cliff plan scan measure (spec 6, "Known, accepted"): a path stay-under under an IRMAA line saves nothing when the
    // path's own charged tier puts both MAGIs in the same tier.
    for (const c of irmaaChecks) {
      if (c.y > projectionYears) continue;
      planStats.irmaaStayUnders++;
      if (irmaaSurcharge(ctx, c.nat, c.filing, c.y) === irmaaSurcharge(ctx, c.trial, c.filing, c.y)) planStats.irmaaZeroSaving++;
    }
    // Cliff plan: the intents `choose` recorded, keyed by Partner A's age (not enumerable: the result's fields are unchanged).
    if (intents) Object.defineProperty(result, 'cliffIntents', { value: intents });
    // The first home-equity draw age (Batch 5 step 3a, spec A4): not enumerable, so no row and no snapshot field changes.
    Object.defineProperty(result, 'homeDrawAge', { value: homeDrawAge });
    // The final balances and the last year's tax inputs, for afterTaxEndValueUS (cliff plan, spec section 5): not
    // enumerable, so the result's own fields and every snapshot stay as they were.
    // E1e: the open inherited balances are part of the estate (two additions, skipped when both are 0).
    let estateTrad = bal.traditional + bal.bondTraditional,
      estateRoth = bal.roth + bal.bondRoth;
    if (bal.inheritedTrad > 0) estateTrad += bal.inheritedTrad;
    if (bal.inheritedRoth > 0) estateRoth += bal.inheritedRoth;
    // E3: the run's IRMAA appeal events (tests read the very table the run used); not enumerable, so the result's own
    // fields and every snapshot are unchanged.
    Object.defineProperty(result, 'irmaaAppeal', { value: appeal });
    Object.defineProperty(result, 'estate', {
      value: {
        traditional: estateTrad,
        roth: estateRoth,
        taxable: bal.taxable + bal.bondTaxable,
        cash: seCarry !== 0 ? bal.cash + seCarry : bal.cash, // B5: the last year's 162(l) carry has no next year
        homeEquity: Math.max(0, bal.home - bal.mortgage),
        profile: endTax ? endTax.profile : null,
        lastGain: endTax ? endTax.lastGain : 0,
        lastTrad: endTax ? endTax.lastTrad : 0,
      },
    });
    return result;
  }
  export { BRACKET_CANDIDATES };
  // Whether the bracket search applies (spec A2): conversions and the guard on, at least one conversion age of Partner A inside
  // the plan, no applied schedule with keys (the user's own choice), and the test switch not set (every state, RI and PA
  // included: owner decision 16). Otherwise the plan is today's, byte for byte.
  function bracketSearchApplies(ctx) {
    const inputs = ctx.inputs;
    if (!inputs.rothConvEnabled || !inputs.cliffGuardEnabled || ctx.test.bracketSearchOff) return false;
    const sched = inputs.appliedRothSchedule;
    if (sched && Object.keys(sched).length) return false;
    const years = inputs.singlePerson ? Math.max(0, inputs.lifeExpectancyA - inputs.ageA) : Math.max(0, inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB);
    return Math.max(inputs.rothConvStartAge, inputs.ageA) <= Math.min(inputs.rothConvEndAge, inputs.ageA + years);
  }
  // The plan for the context's inputs (ctx.inputs, ctx.taxYear, its overrides, sinks and test switches), touching no module
  // plan variable. Every candidate is a standard (deterministic) run with no tax factors (taxFactors: null), so planning never
  // sees a historical path's tax factors; afterTaxEndValueUS prices each candidate under the same context. The engine reads
  // only the context (no store binding), so a nested plan at the start of a historical run needs no save / restore.
  // The bracket search (Batch 5 step 3a, spec A3): when it applies (A2) and `search` is set, the whole selection below runs once
  // per flat bracket of BRACKET_CANDIDATES (the user's first, as today's plan exactly, then the others ascending, each on plans
  // carrying `{ bracket, bracketFrom }`), and bracketCandidateBetter keeps one; the report's `candidates` / `kept` are the kept
  // bracket's, `brackets` lists every bracket's best plan, and `searched` says the plan is final (also set when the search
  // does not apply, so a light refresh's plan needs no full one).
  // Batch 5 step 4a (spec 4.5): `objective` is the registry id the selection ranks by (each measure's `score`: the value for
  // endValue, minus the cost for lifetimeCost, 0 for a cost of 0, never -0); `rankEvenly` keeps the bracket by bracketEvenBest
  // over every bracket's best (ties to `tieBracket`, else the lowest bracket) instead of the strict-win chaining from the
  // user's bracket; `offMemo`, a caller-owned Map keyed by bracket, holds each bracket's `off` measure (it depends on neither
  // `mult` nor the objective's ranking) and is valid only for one working copy of the inputs. The defaults are today's plan.
  export function computeCliffPlan(ctx, { search = true, mult = null, objective = 'endValue', rankEvenly = false, tieBracket = null, offMemo = null } = {}) {
    const inputs = ctx.inputs;
    if (!inputs.cliffGuardEnabled) return { plan: null, report: null };
    const byCost = objectiveById(objective) === US_OBJECTIVES.lifetimeCost;
    const ctxFor = (planMode, plan) => newRunContext({ inputs, taxYear: ctx.taxYear, taxFactors: null, plan, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test }),
      // The standard runs' context with no plan: afterTaxEndValueUS prices each candidate's last year under it (the tax year, no
      // tax factors), as every candidate run has them.
      runCtx = ctxFor('off', null),
      run = (planMode, plan) => runProjection(ctxFor(planMode, plan), { mode: STANDARD_MODE, source: standardYearSource(inputs), retireAgeA: inputs.retireAgeA, retireAgeB: inputs.retireAgeB });
    // The cliff plan ranks and reports through the registry's endValue and lifetimeCost (priced with runCtx, as before). It names
    // endValue explicitly; step 4 passes the saved objective here.
    // cost: lifetime tax plus healthcare in today's dollars (the sum tests/solver_scan.js takes); a settled row adds its return's
    // figures (rowCost: taxSettled + healthcareSettled, B5 spec 6.7), the carry being only timing.
    const measure = (family, intents, sim) => {
      const value = US_OBJECTIVES.endValue.value(runCtx, sim),
        cost = US_OBJECTIVES.lifetimeCost.value(runCtx, sim);
      return { family, intents, n: Object.keys(intents).length, depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, value, cost, score: byCost ? (cost === 0 ? 0 : -cost) : value };
    };
    // Today's selection for one bracket: `held` is null for the user's bracket (today's runs: `choose` and `off` with no plan,
    // the family subsets through `apply` on a plan carrying the user's own bracket, which resolves to the setting, so every
    // `apply` plan has one shape), else the full plan (makePlan of `{ bracket, bracketFrom }`) every run's plan carries, so `choose`, the family subsets
    // through `apply` and `off` all convert at that bracket (an `off` run reads the plan's bracket too). Rule A (planCandidateBetter) keeps one candidate.
    const from = inputs.rothConvBracket;
    // 4a: a null or all-ones mult is today's plans; otherwise every `choose` run carries it (the user's bracket gets a plan of its own)
    const useMult = mult && !mult.every((m) => m === 1) ? mult : null;
    const select = (bracket, held) => {
      const chosen = run('choose', useMult ? makePlan({ ...(held || { bracket: from, bracketFrom: from }), mult: useMult }) : held),
        all = chosen.cliffIntents,
        pick = (fam) => Object.fromEntries(Object.entries(all).filter(([, i]) => lineFamily(i.line) === fam));
      const fams = new Set(Object.values(all).map((i) => lineFamily(i.line)));
      // A choose run that records no intent is the off run, row for row (pinned in tests/cliff_plan.js): reuse it. With an
      // offMemo, a bracket's off measure is computed once and reused.
      let off = offMemo ? offMemo.get(bracket) : undefined;
      if (off === undefined) {
        off = measure('none', {}, fams.size ? run('off', held) : chosen);
        if (offMemo) offMemo.set(bracket, off);
      }
      const cands = [off];
      if (fams.size > 1)
        for (const fam of ['aca', 'irmaa']) {
          const sub = pick(fam);
          cands.push(measure(fam, sub, run('apply', makePlan({ ...(held || { bracket: from, bracketFrom: from }), intents: sub, family: fam }))));
        }
      if (fams.size) cands.push(measure('all', all, chosen));
      let best = cands[0];
      for (const c of cands.slice(1)) if (planCandidateBetter(c, best)) best = c;
      return { best, cands };
    };
    const entry = (bracket, s) => ({ bracket, family: s.best.family, intents: s.best.n, depletedAge: s.best.depletedAge, homeDrawAge: s.best.homeDrawAge, value: s.best.value, cost: s.best.cost, score: s.best.score }),
      applies = bracketSearchApplies(ctx);
    // Candidate 0, the user's bracket, is today's plan; each other bracket replaces the running best only on a strict win
    // (with rankEvenly, bracketEvenBest picks over every bracket's best once all are in).
    let kept = { bracket: from, sel: select(from, null) };
    const brackets = [entry(from, kept.sel)],
      sels = rankEvenly ? new Map([[from, kept.sel]]) : null;
    if (applies && search)
      for (const b of BRACKET_CANDIDATES) {
        if (b === from) continue;
        const sel = select(b, makePlan({ bracket: b, bracketFrom: from }));
        brackets.push(entry(b, sel));
        if (rankEvenly) sels.set(b, sel);
        else if (bracketCandidateBetter(sel.best, kept.sel.best)) kept = { bracket: b, sel };
      }
    if (rankEvenly) {
      const b = bracketEvenBest(brackets, tieBracket).bracket;
      kept = { bracket: b, sel: sels.get(b) };
    }
    const best = kept.sel.best;
    return {
      plan: makePlan({ intents: best.intents, family: best.family, bracket: kept.bracket, bracketFrom: from, mult: useMult }),
      report: {
        candidates: kept.sel.cands.map((c) => ({ family: c.family, intents: c.n, depletedAge: c.depletedAge, value: c.value, cost: c.cost })),
        kept: best.family,
        brackets,
        keptBracket: kept.bracket,
        searched: search || !applies,
      },
    };
  }
