// runProjection: the US engine, with the cliff plan computation

import { paychecksPerYear, pct } from '../../../shared/core/format/numbers.js';
import { makeProjectedExpense } from '../../../shared/core/income/projected-expense.js';
import { planBondLadder, rotateIntoBondLadder, refillBondReserve, trimBondReserve } from '../../../shared/core/withdrawals/bond-ladder.js';
import { withdrawBucket } from '../../../shared/core/withdrawals/bucket-order.js';
import { loanPaymentForYear, baseSpendingNominal, futureHomePurchase, loanSchedules, mortgageSchedule, mortgageResultAges } from '../../../shared/core/income/spending-and-loans.js';
import { guardrailSpendingMultiplier, newGuardrails, recordGuardrailWithdrawal } from '../../../shared/core/projection/guardrails.js';
import { pensionIncome } from '../../../shared/core/income/pension-income.js';
import { sweepExcessCash } from '../../../shared/core/withdrawals/draws.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';
import { getBondYears, medicalGrowth } from '../../../shared/core/projection/year-factors.js';
import { standardYearSource } from '../../../shared/core/projection/year-sources.js';
import { MAGI_ITER_MAX, MAGI_ITER_TOL } from './engine-state.js';
import { afterTaxValue, fillEligible, fillPlanOf, lineFamily, NO_PLAN, NO_PLANS, planMet, underEligible, underPlanOf, yearPlanCandidates, planCandidateBetter, bracketCandidateBetter, greedyAccepts, keptBracketOf, leverPlanStands, storedPlanVerdict, NO_THRESHOLDS, REACH_GROSS_UP, magiThresholds, lambdaEstimate, bridgeNeed } from '../cliff-plan/solver.js';
import { BRACKET_CANDIDATES, PLAN_LEVERS, PLAN_LINE_IDS, lineNameOf, makePlan, orderPhasesOf, phaseOf } from '../cliff-plan/plan-shape.js';
import { filingRow, taxYearOf } from '../tax/federal-rules.js';
import { freeTraditional, newWithdrawal, fillTraditional } from '../withdrawals/draws.js';
import { growBalances, withdrawRequiredDistributions } from './balances.js';
import { COVER_CTX, listAmountsForYear, streamCoverBits } from '../income/streams-and-lumps.js';
import { irmaaAppealKind, irmaaAppealTable, returnMagis, irmaaSurcharge, irmaaMagiOf } from '../healthcare/irmaa.js';
import { investmentIncome, filingStatusFor, SE_OUT, payrollTax, selfEmploymentTax, taxFor } from '../tax/federal-tax.js';
import { retirementContributions } from '../income/contributions.js';
import { SE_HEALTH, seHealthDeduction, acaEligibility, healthcareCost, ACA_KIND } from '../healthcare/aca.js';
import { solveRothConversion, solveRothConversionTop, applyRothConversion, conversionMagiCeiling } from '../withdrawals/roth-conversion.js';
import { resolveConvTarget, convLineTargets, convScore, pickConvTarget, bridgeShort, convOffered } from '../../../shared/core/withdrawals/conversion-targets.js';
import { INH_DECEDENT } from '../tax/state-rules.js';
import { hasPenalizedMoney, penaltyFreeMoney, tradGroup } from '../accounts/penalty-status.js';
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
  // The whole-run sizing pass's run budget (Batch 5 step 5b piece 3, revision 2, spec B0.11.3): at most this many `apply` runs per
  // planning (computeCliffPlan; ctx.test.convRunBudget overrides it in Vitest).
  const CONV_RUN_BUDGET = 24;
  // Batch 5 step 5b piece 3 (spec B0.2, builder's call C8): an age whose conversion is not sized: one the yardstick's amount map
  // (ctx.overrides.rothAmountByAge, absent from the store's overrides literal) or the flat-bracket card's bracket map
  // (ctx.overrides.rothBracketByAge) sets.
  export function convExempt(ctx, age) {
    const byAge = ctx.overrides.rothBracketByAge,
      amountByAge = ctx.overrides.rothAmountByAge;
    return (byAge != null && byAge.has(age)) || (amountByAge != null && amountByAge.has(age));
  }
  // Batch 5 step 5b piece 3: a sized year's row label for its conversion target ('none', 'b10'..'b35' or a line { id, ret, side }).
  function convChoiceOf(target) {
    if (target === 'none') return 'no conversion (tax-aware)';
    if (typeof target === 'string') return `the top of the ${target.slice(1)}% bracket`;
    return `${target.side === 'under' ? 'just under' : 'just over'} ${lineNameOf(target.id)}${target.ret === 'H' ? '' : ` (Partner ${target.ret}'s return)`}`;
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
  // Cliff plan: a phase's score at its end, the after-tax value of its end balances less the IRMAA it priced (`irmaa`, the
  // caller's irmaaAt at the settled pair when the phase is settled) plus, for a settled phase (B5, spec 6.7), the settlement
  // at face value. Pure.
  function phaseScore(bal, lam, seSettled, seSettle, irmaa) {
    return seSettled ? afterTaxValue(bal, lam.lambda, lam.tauGain) + seSettle - irmaa : afterTaxValue(bal, lam.lambda, lam.tauGain) - irmaa;
  }
  // Batch 5 step 4d (D5): Partner p's penalty-free traditional dollars at the withdrawal's start (tradGroup limited to p's
  // accounts, then reset). It allocates (tradGroup), so it is read only when a split can be (the lever or a split intent).
  function freeOf(wd, p) {
    wd.onlyPartner = p;
    const share = tradGroup(wd, false).share;
    wd.onlyPartner = -1;
    return share * (wd.bal.traditional + wd.bal.bondTraditional);
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
      intents = planMode === 'choose' ? {} : null,
      // Batch 5 step 4c: the order lever (choose with `plan.levers.order`) tries a traditional-first phase in each orderable
      // year and records the kept ones (`orderIntents`, by Partner A's age); apply follows `plan.orders`.
      orderLever = planMode === 'choose' && plan !== null && plan.levers != null && plan.levers.order === true,
      orderIntents = orderLever ? {} : null,
      planOrders = planMode === 'apply' && plan !== null && plan.orders != null ? plan.orders : null,
      // Batch 5 step 4d: the split lever (choose with `plan.levers.split`) tries A-first and B-first in each splittable year and
      // records the kept split (`splitIntents`, by Partner A's age, 'A' | 'B'); apply follows `plan.splits`.
      splitLever = planMode === 'choose' && plan !== null && plan.levers != null && plan.levers.split === true,
      splitIntents = splitLever ? {} : null,
      planSplits = planMode === 'apply' && plan !== null && plan.splits != null ? plan.splits : null,
      // Batch 5 step 5b piece 3 (spec B6): apply follows `plan.conv` (the conversion targets by Partner A's age) unless the test
      // switch turns sizing off (C6: the run is then today's). Like `plan.bracket` (solveRothConversion), the targets are honoured
      // only for the bracket setting the plan was made for (`bracketFrom`): a variant at another setting (the flat-bracket card's
      // trials) is never overridden by them (spec A4, R5 I-1). choose needs no such gate: computeCliffPlan builds its plans for the
      // setting (`bracketFrom: from`).
      planConv = planMode === 'apply' && plan !== null && plan.conv != null && plan.bracketFrom === ctx.inputs.rothConvBracket && !testCtl.convSizingOff ? plan.conv : null,
      // Batch 5 step 5b piece 3 (spec B0.3, B5): choose with a non-null `plan.conv` (the sentinel `{}`) sizes each conversion year
      // at its bracket phase's end and records the targets that are not the bracket (`convIntents`, by Partner A's age), unless the
      // test switch turns sizing off.
      convChooseOn = planMode === 'choose' && plan !== null && plan.conv != null && !testCtl.convSizingOff,
      convIntents = convChooseOn ? {} : null,
      // Revision 2 (spec B0.11.2): the same runs also record each priced year's shortlist entry (`convShortlist`, by Partner A's
      // age), the proposal computeCliffPlan's whole-run pass walks.
      convShortlist = convChooseOn ? {} : null;
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
        // - order (Batch 5 step 4c; choose with the order lever, or apply with an order intent at this age): between the
        //   natural year and the trials, in a year whose natural pass is orderable (wd.orderable) and converted nothing (A15
        //   (a)), a fresh converged iteration with the draw traditional-first (yearOrder), seeded as a trial is. choose keeps it
        //   only if it drew, left no need unmet, drew no more home equity than the natural year and beats the natural score by
        //   more than $1 (A4); apply keeps it always. A kept order phase is the year's natural record (naturalRec.order
        //   'traditional'): the lines, the eligibility and the trials are built from it, and it seeds the next year (A3). A
        //   rejected one restores the natural record and its trials (or replays the natural year's final pass).
        // - split (Batch 5 step 4d; choose with the split lever, or apply with a split intent at this age): after the order
        //   phase and before the trials, in a two-return year whose starting record (the natural year, a kept order phase, or
        //   the natural year restored after a rejected order) converted nothing, drew discretionary traditional money and
        //   found both partners holding penalty-free traditional money (canSplit), a fresh converged iteration per first
        //   partner (yearSplit: A's or B's traditional accounts first, wd.splitFirst), seeded as a trial is, with its own
        //   share estimate (estShareA, D2). Each builds its own lines and (choose) trials at its realized share (R2 (a)).
        //   choose runs A then B and keeps one only on a strict score win with a draw, no unmet need and no extra home draw
        //   (D7); apply keeps its one phase. A kept split is the year's natural record (naturalRec.split).
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
          planTr = null,
          // the order phase (above): the draw order of the running phase, whether the order phase started / ended, and
          // (choose) the natural year's record and trials, saved while it runs
          yearOrder = null,
          orderRun = false,
          orderNat = null,
          // the split stage (4d; see the phase notes above the loop): the running phase's first partner (null: pro rata, 0 A,
          // 1 B), the pass's estimate of the realized share of the year's traditional income (D2), which split phase runs (0
          // none, 1 A or apply's intent partner, 2 B), the stage's starting record and trials (saved at its start) and, in
          // choose, A's record while B runs
          yearSplit = null,
          estShareA = 0,
          splitRun = 0,
          splitNat = null,
          splitRecA = null,
          // Batch 5 step 5b piece 3 (spec B6): the year's conversion target (null: not sized), set at the year's start in apply and
          // held for the year (no phase record predates it, so none restores it); whether this pass could not carry it and
          // converted the user's bracket instead (reset at each pass start); and whether choose has made the year's choice (Task 2).
          convTarget = null,
          convFell = false,
          convDone = false;
        if (planConv !== null && planConv[age] != null && inputs.rothConvEnabled && age >= inputs.rothConvStartAge && age <= inputs.rothConvEndAge && !convExempt(ctx, age))
          convTarget = planConv[age];
        // choose: the year makes the choice at its bracket phase's end (Task 2: a conversion year inside the window, not exempt).
        const convChoose = convChooseOn && inputs.rothConvEnabled && age >= inputs.rothConvStartAge && age <= inputs.rothConvEndAge && !convExempt(ctx, age);
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
          // 4d (D2): a split pass starts at its estimate of the realized share (the pass prices each return before it draws)
          profile.ownerShareA = yearSplit === null ? ownerShareA0 : estShareA;
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
          convFell = false;
        rothAccountsSeason(rothAccts, year);
        let conversionAmount = 0;
        // The safe-MAGI room left under this year's ceiling before the conversion: it bounds the
        // conversion only (the conversion cap below); the withdrawals do not read it.
        let magiSafeRoom = Infinity;
        const convertsThisYear =
          inputs.rothConvEnabled && age >= inputs.rothConvStartAge && age <= inputs.rothConvEndAge && yearSplit === null; // 4d (D3): a split phase converts nothing
        // The ceiling is computed every year: it sizes a conversion.
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
        // Batch 5 step 5b piece 3: the lines a sized conversion resolves a line target against, at a pre-conversion MAGI (household,
        // A's, B's), above it and up to `hi` (apply's lookup passes Infinity, so a line beyond the convertible balance is found and the
        // resolver caps the conversion at that balance, B6; a choice offering candidates inside the reach passes preMagi plus the
        // convertible balance). Built only in a sized year. (The guard's call at the phase end reads the in-year appeal flags, known
        // only after the conversion: these lines use the two-year growth.) choose's bracket phase builds them too, for the choice.
        const convLinesAt = convTarget === null && !convChoose ? null : (preMagi, preA, preB, hi) => magiThresholds(ctx, { year, filing, twoReturns, profile, preMagi, preMagiA: preA, preMagiB: preB, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA: employerA, workingB: employerB, age, ageB, irmaa: { filing, a: medA, b: medB }, irmaaGrowth: irmaaGrowth2, irmaaGrowthA: irmaaGrowth2, irmaaGrowthB: irmaaGrowth2, lo: preMagi, hi });
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
          // Test-only: an age the yardstick's amount map covers (ctx.overrides.rothAmountByAge, solveRothConversion) is not held
          // under the MAGI ceiling.
          const amountByAge = ctx.overrides.rothAmountByAge;
          const convertible = Math.max(0, traditionalBeforeRmd - rmd - seppLocked);
          if (convTarget !== null) {
            // Batch 5 step 5b piece 3 (spec B6): a sized year resolves its target on every pass from the pass's estimates (a line
            // target against the pass's lines); one it cannot carry converts the user's bracket under today's ceiling.
            estUsed = true;
            const amount = resolveConvTarget(convTarget, {
              lines: typeof convTarget === 'object' ? convLinesAt(preConvMagi, preMagiA, preMagiB, Infinity) : NO_THRESHOLDS,
              preMagi: preConvMagi,
              preMagiA,
              preMagiB,
              shareA: profile.ownerShareA,
              convertible,
              bracketTop: (b) => solveRothConversionTop(ctx, profile, convertible, year, b, estTrad),
            });
            if (amount < 0) {
              conversionAmount = solveRothConversion(ctx, profile, Math.min(convertible, magiSafeRoom), year, age);
              convFell = true;
            } else conversionAmount = amount;
          } else {
            const conversionCap = Math.min(convertible, amountByAge && amountByAge.has(age) ? Infinity : magiSafeRoom);
            conversionAmount = solveRothConversion(ctx, profile, conversionCap, year, age);
          }
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
        // The standard mode's maintained reserve (Batch 5 step 5b): after the ladder build, the same target, held by a trim
        // before the withdrawal, a refill after it (withdrawal years) and the surplus (surplus years). Null: no reserve to hold.
        // The year's spending it is sized on leaves out the one-off outlays: the lump expenses, as the bucket mode does, and the
        // purchase cash of a future home in its buy year (in `housing`), or the buy year's target and refill would be years of
        // the house price.
        const reserveSpend = expenses - lumpExpense - (futureBuy !== null && year === futureBuy.buyYear ? futureBuy.purchaseCash : 0);
        const stdBondTarget = !mode.bucketStrategy && bondYears > 0 && year > ladder.rotationEndYear ? reserveSpend * bondYears : null;
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
        if (stdBondTarget !== null) trimBondReserve(bal, stdBondTarget);
        // The bucket strategy trims in an up year, the mirror of its up-year refill (Batch 5 step 5b): a conversion or meltdown
        // of reserve money keeps it in bonds, so without the trim the reserve would grow past its target for good.
        else if (mode.bucketStrategy && stockReturn >= 0 && bondYears > 0 && year > ladder.rotationEndYear) trimBondReserve(bal, bondTarget);
        const gpBase = bal.taxable + bal.bondTaxable + bal.traditional + bal.bondTraditional + bal.roth + bal.bondRoth + bal.cash;
        // E1e: the portfolio the rate is measured on includes the open inherited accounts and the year's draw (the portfolio before it).
        const guardrailPortfolioNow = inh === null ? gpBase : gpBase + bal.inheritedTrad + bal.inheritedRoth + inhDraw;
        const wd = newWithdrawal(ctx, { bal, rothAccts, accts, seppActive, profile, conversionAmount, rmd, inh, inhRule: inh === null ? null : stateRuleForYear(ctx, year) });
        // The phase's draw order (the order phase, a trial or replay from it: 'traditional'; otherwise null).
        wd.taxAwareOrder = yearOrder;
        // Gain realized by selling taxable stock for the pre-retirement ladder (a last resort).
        wd.taxableGainGross = ladderGain;
        // The bucket strategy only steers new surplus into the bond reserve in an up year; the standard mode does in every
        // year it holds the reserve.
        const surplusBondTarget = mode.bucketStrategy ? (stockReturn >= 0 ? bondTarget : null) : stdBondTarget;
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
          // A surplus year that holds the reserve refills it too, after the spare cash (Batch 5 step 5b fix): stocks move to
          // bonds inside traditional, then Roth, never a taxable sale (no gain, no MAGI). So an RMD drawn from the reserve, or a
          // bond loss, no longer leaves it decaying below target. A year routeSurplus already filled moves nothing.
          if (stdBondTarget !== null) refillBondReserve(wd, stdBondTarget, { maxMove: reserveSpend, taxable: false });
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
          if (splitLever || planSplits !== null) {
            // 4d (D5): both partners hold penalty-free traditional money at the withdrawal's start, in a two-return year that
            // converts nothing. Evaluated (freeOf allocates) only on a pass whose end canSplit can read: the natural phase's
            // and an order phase's passes at an age the lever or a split intent covers, never a split phase's, a trial's or a
            // replay's. A split pass (D1) draws yearSplit's accounts first and starts its draws at the pro-rata share: the draw
            // moves the share to the realized one.
            if (yearSplit === null) {
              if (trialIdx < 0 && !replaying && (splitLever || planSplits[age] != null)) {
                hookStats.splitCheckCalls++;
                wd.splittable = twoReturns && conversionAmount === 0 && freeOf(wd, 0) > 0 && freeOf(wd, 1) > 0;
              }
            } else {
              wd.splitFirst = yearSplit;
              profile.ownerShareA = ownerShareA0;
            }
          }
          const wopts = mode.bucketStrategy
            ? { yearReturn: stockReturn, bondTarget, refillCap: expenses - lumpExpense, age }
            : { age };
          const runWithdraw = (w) => {
            if (mode.bucketStrategy) (w.penaltyAware ? withdrawBucketPenaltyAware : withdrawBucket)(w, wopts);
            else {
              withdrawStandard(w, wopts);
              // The bucket mode's refill (its own call, inside withdrawBucket), so before the plan's fill step.
              if (stdBondTarget !== null) refillBondReserve(w, stdBondTarget, { maxMove: reserveSpend });
            }
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
        let drift = inh === null
          ? Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain)
          : Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain) + Math.abs(inhRealA - estInhA) + Math.abs(inhRealB - estInhB);
        // 4d (D2): a split pass also checks Partner A's traditional dollars against its estimate (the realized share is
        // profile.ownerShareA after the draw)
        if (yearSplit !== null) drift += Math.abs(realizedTrad * profile.ownerShareA - estTrad * estShareA);
        const unconverged = estUsed && (seLive ? drift + Math.abs(seRealA - estSeA) + Math.abs(seRealB - estSeB) : drift) > MAGI_ITER_TOL;
        // A replayed pass (phased year, below) repeats a phase's final pass exactly: no convergence decisions.
        if (usesMagiEstimate && !forcedPass && !replaying)
          passLog.push({ estTrad, estGain, estSeA, estSeB, estInhA, estInhB, estShareA, charged: healthcare, realized: costAt(traditionalGross, taxableGainGross, seRealA, seRealB, inhRealA, inhRealB),
            drift: seLive ? drift + Math.abs(seRealA - estSeA) + Math.abs(seRealB - estSeB) : drift });
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
          if (yearSplit !== null) estShareA += w * (profile.ownerShareA - estShareA);
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
            if (yearSplit !== null) estShareA = profile.ownerShareA;
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
          // B0.11.10: in a sized year (convTarget !== null) an overpay tie goes to the pass with the smallest drift, not the seed pass:
          // the conversion moves against the draw there, so the seed pass is the least consistent one. Unsized years keep the first.
          let pick = null;
          for (const p of passLog)
            if (p.realized <= p.charged + 1e-9 && (pick === null || p.charged - p.realized < pick.charged - pick.realized
              || (convTarget !== null && p.charged - p.realized === pick.charged - pick.realized && p.drift < pick.drift))) pick = p;
          if (pick !== null) {
            estTrad = pick.estTrad;
            estGain = pick.estGain;
            estSeA = pick.estSeA;
            estSeB = pick.estSeB;
            estInhA = pick.estInhA;
            estInhB = pick.estInhB;
            estShareA = pick.estShareA;
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
        // Phased year, at the end of a phase (see the phase notes above the loop). A replay ends here only when it is apply's
        // return to the split stage's starting record (splitRun -1, below).
        if (phased && (!replaying || splitRun < 0)) {
          let next = -1;
          // B5 (spec 6.7, decision 4): a held phase is judged on its settled return. healthcareRet is the return's premium,
          // seSettle the settlement (owed to the household when > 0, at face value) and the pair the settled deduction; an
          // unheld phase reads what it paid (healthcareRet = healthcare) and the estimate (the in-year expressions, unchanged).
          const pairA = seSettled ? seRealA : estSeA,
            pairB = seSettled ? seRealB : estSeB;
          // The year's natural record: the inputs that replay its final pass, what the order phase and the trials start from,
          // its cliff cost and score (null when unscored) and its order (null for the natural year).
          const natRec = (cliffCost, score, order) => ({ plan: NO_PLAN, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seA: seRealA, seB: seRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, realizedTrad, gain: taxableGainGross, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, cliffCost, ok: true, score, order, homeDrawn: wd.homeDrawn, split: yearSplit, estShareA, shareA: profile.ownerShareA });
          if (trialIdx < 0 && convChoose && !convDone && !orderRun && splitRun === 0) {
            // Batch 5 step 5b piece 3 (spec B5.1-B5.4, B0.2, B0.3, B0.7): choose's conversion choice, once, at the bracket phase's end
            // (the natural year as today), before the order stage. Every target is priced at the phase's realized draws: the
            // year's return (taxFor, with its own conversion and medical deduction), the in-year premium (costAt) and the IRMAA two
            // years on (irmaaAt), scored against converting nothing. A target other than the bracket's re-runs the year as the sized
            // phase (below); the bracket's goes on as today.
            convDone = true;
            const convertible = Math.max(0, traditionalBeforeRmd - rmd - seppLocked);
            if (convertsThisYear && convertible > 0) {
              if (planTrace && planTr === null) planTr = { year };
              const drawTrad = traditionalGross - conversionAmount,
                gain = taxableGainGross,
                // the realized pre-conversion MAGI (household, then each return's)
                preM = inh === null ? magiBase + drawTrad + gain : magiBase - estInhA - estInhB + inhRealA + inhRealB + drawTrad + gain;
              let preA = 0,
                preB = 0;
              if (twoReturns) [preA, preB] = returnMagis(profile, drawTrad, gain, inhRealA, inhRealB);
              const t = {
                lines: convLinesAt(preM, preA, preB, preM + convertible),
                preMagi: preM,
                preMagiA: preA,
                preMagiB: preB,
                shareA: profile.ownerShareA,
                convertible,
                bracketTop: (b) => solveRothConversionTop(ctx, profile, convertible, year, b, drawTrad),
              };
              // Year 0 without entered prior MAGIs: each candidate's premium reads IRMAA's stand-in at its own MAGI (seStand0, as the
              // settlement prices), and the histories are restored after.
              const stand0 = year === 0 && !ctx.inputs.irmaaPriorKnown,
                h0 = irmaaMagiHistory[0],
                hA0 = magiHistoryA[0],
                hB0 = magiHistoryB[0],
                hiA0 = irmaaMagiHistoryA[0],
                hiB0 = irmaaMagiHistoryB[0],
                convSave = profile.conv,
                medSave = profile.medicalExpense;
              let pTax = 0,
                pPrem = 0,
                pIrm = 0;
              const priceConv = (c) => {
                if (stand0) seStand0 = true;
                pPrem = costAt(drawTrad + c, gain, pairA, pairB, inhRealA, inhRealB);
                if (stand0) {
                  seStand0 = false;
                  irmaaMagiHistory[0] = h0;
                  if (twoReturns) {
                    magiHistoryA[0] = hA0;
                    magiHistoryB[0] = hB0;
                    irmaaMagiHistoryA[0] = hiA0;
                    irmaaMagiHistoryB[0] = hiB0;
                  }
                }
                pIrm = irmaaAt(drawTrad + c, gain, inhRealA, inhRealB, pairA, pairB);
                profile.conv = c;
                profile.medicalExpense = seLive ? pPrem + ltc - (seRealA + seRealB) : pPrem + ltc;
                pTax = taxFor(ctx, profile, gain, drawTrad + c);
              };
              const lamConv = lambdaOf().lambda;
              priceConv(0);
              const tax0 = pTax,
                prem0 = pPrem,
                irm0 = pIrm,
                cands = [];
              // A candidate: its target (null: the bracket target), amount, score and total (tax + premium + IRMAA). The price stays in
              // pTax / pPrem / pIrm until the next priceConv. A target other than the bracket's within $1 of the bracket conversion is
              // not offered (convOffered: a near tie keeps the bracket, with no intent and no sized phase): false then, and not priced.
              const add = (target, c) => {
                if (target !== null && !convOffered(c, conversionAmount)) return false;
                priceConv(c);
                cands.push({ target, c, score: convScore(c, lamConv, pTax - tax0, pPrem - prem0, pIrm - irm0), dropped: false, total: pTax + pPrem + pIrm });
                return true;
              };
              add(null, conversionAmount);
              add('none', 0);
              // the bracket tops at distinct amounts (a top at 0 is none's; the bracket target and none are not tops)
              for (const b of BRACKET_CANDIDATES) {
                const c = resolveConvTarget('b' + b, t);
                let seen = c === 0;
                for (let i = 0; i < cands.length && !seen; i++) seen = cands[i].target !== null && cands[i].target !== 'none' && cands[i].c === c;
                if (!seen) add('b' + b, c);
              }
              for (const lt of convLineTargets(t.lines, PLAN_LINE_IDS)) {
                const c = resolveConvTarget(lt, t);
                // the premium plus IRMAA just under the line (at no conversion when the line cannot be kept under by converting)
                let costUnder = prem0 + irm0;
                if (c > 0) {
                  if (!add(lt, c)) priceConv(c);
                  costUnder = pPrem + pIrm;
                }
                if (lt.id === 'medicaid') {
                  // The Medicaid line is also a floor where crossing it lowers the premium plus IRMAA (yearPlanCandidates' reading).
                  const over = { id: lt.id, ret: lt.ret, side: 'over' },
                    co = resolveConvTarget(over, t);
                  if (co > 0) {
                    priceConv(co);
                    if (pPrem + pIrm < costUnder) add(over, co);
                  }
                }
              }
              profile.conv = convSave;
              profile.medicalExpense = medSave;
              // The scan order: by amount ascending, the bracket target first at an equal amount (a stable sort of a list it heads).
              cands.sort((a, b) => a.c - b.c);
              // The bridge (spec B0.7): while a living partner is under 59.5 next year, a candidate converting more than the bracket
              // target is dropped when the penalty-free money left after it cannot cover the next four years (bridgeShort: before the
              // conversion seasons; `late` is kept for the trace only).
              const aliveA = !(isSurvivorPeriod && deceasedIsA),
                aliveB = !singlePerson && !(isSurvivorPeriod && deceasedIsB),
                young = Math.min(aliveA ? age : Infinity, aliveB ? ageB : Infinity);
              let bridge = null;
              if (young + 1 < 59.5) {
                const status = flow >= 0 ? accountStatuses(ctx.inputs, { age, ageB, isSurvivorPeriod, deceasedIsA, workingA, workingB, retireAgeA, retireAgeB }) : wd.status,
                  need = bridgeNeed(ctx, { year, age: aliveA ? age : null, ageB: aliveB ? ageB : null, singlePerson, factor, reserveSpend, wagesTo: { retireAgeA, retireAgeB } }),
                  view = { bal, accts: wd.accts, rothAccts: wd.rothAccts, seppActive: wd.seppActive, onlyPartner: -1, status };
                bridge = { accessible: penaltyFreeMoney(wd, status), freeTradShare: tradGroup(view, false).share, early: need.early, late: need.late };
                let bracketTotal = 0;
                for (const k of cands) if (k.target === null) bracketTotal = k.total;
                for (const k of cands)
                  if (k.c > conversionAmount)
                    k.dropped = bridgeShort({ accessible: bridge.accessible, extra: k.c - conversionAmount, freeTradShare: bridge.freeTradShare, taxIncrease: k.total - bracketTotal, early: bridge.early });
              }
              const won = cands[pickConvTarget(cands)];
              // The shortlist entry (spec B0.11.2): the best-scoring candidate neither the bracket target nor none that the bridge did
              // not drop, whatever wins the year (a tie keeps the earlier in the scan order); none when there is no such candidate.
              let short = null;
              for (const k of cands) if (!k.dropped && k.target !== null && k.target !== 'none' && (short === null || k.score > short.score)) short = k;
              if (short !== null) convShortlist[age] = short.target;
              if (planTr) planTr.conv = { candidates: cands, winner: won.target, bracketConv: conversionAmount, lambda: lamConv, bridge };
              if (won.target !== null) {
                // The sized phase (spec B5.1 step 3): a fresh converged iteration from the year's snapshot with the target held, seeded
                // from the year's own start seeds, as apply's first phase is (so apply reproduces it pass for pass). Its end makes the
                // natural record and runs the order, split and trial stages as for any natural year. The year's lambda stays held.
                convTarget = won.target;
                convIntents[age] = won.target;
                estTrad = prevDiscTraditional;
                estGain = prevTaxableGainGross;
                estSeA = prevSeHealthA;
                estSeB = prevSeHealthB;
                estInhA = prevInhA;
                estInhB = prevInhB;
                estShareA = 0;
                seHeld = false;
                seKind = 0;
                forcedPass = false;
                phaseUnresolved = false;
                passLog.length = 0;
                phasePass = -1;
                continue;
              }
            }
          }
          if (trialIdx < 0) {
            // The order phase (see the phase notes above the loop). `orderYear`: this pass's record is the year's natural record
            // and is built whatever the lines (choose at the natural end of a year that tries the order; both modes at the end
            // of a kept order phase). `block`: the natural-done block below runs on this pass.
            // 4d: `startSplit`: the split stage starts at this end (`orderYear` then also says the record is built whatever the
            // lines). `canSplit` (item 3): this phase's year can carry the split, read at the end of the phase the stage starts
            // from (the natural year when no order phase starts, a kept order phase; a rejected one restores orderNat's).
            let startOrder = false,
              orderYear = false,
              block = true,
              startSplit = false;
            const canSplit = (splitLever || planSplits !== null) && twoReturns && conversionAmount === 0 && flow < 0 && wd.traditionalWithdrawn - rmd > 0 && wd.splittable && (splitLever || planSplits[age] != null);
            if (splitRun < 0) {
              // 4d, apply: the stage's starting record replayed after a split pass that drew nothing (below). The year is not a
              // split year (the share is ownerShareA0, no drawSplit): its record is built and the block runs the year's intent
              // lookup over the starting record's lines, as it would have with no split intent at this age.
              splitRun = 0;
              replaying = false;
              orderYear = true;
            } else if (splitRun > 0) {
              if (planMode === 'apply' && flow >= 0) {
                // 4d, apply: a split pass that draws nothing is not a split (choose never keeps one: D7's ok requires a draw).
                // Counted skipped; the stage's starting record's final pass is replayed, and its end (above) runs the block.
                planStats.splitSkipped++;
                const r = splitNat.naturalRec;
                yearSplit = null;
                estShareA = r.estShareA;
                yearOrder = r.order;
                estTrad = r.estTrad;
                estGain = r.estGain;
                estSeA = r.estSeA;
                estSeB = r.estSeB;
                estInhA = r.estInhA;
                estInhB = r.estInhB;
                seHeld = r.seHeld;
                seKind = r.seKind;
                forcedPass = r.forced;
                phaseUnresolved = r.unresolved;
                splitRun = -1;
                replaying = true;
                continue;
              }
              // A split phase has converged (or ended in its forced pass). Its record is built below whatever the lines, and the
              // block builds its own lines at its realized share (R2 (a)) and, in choose, its own trials (none until then); in
              // apply the block runs the year's intent lookup over them (skipped at the stage's start).
              orderYear = true;
              trials = NO_PLANS;
            } else if (!orderRun) {
              const hasOrder = planOrders !== null && planOrders[age] === 'traditional';
              startOrder = wd.orderable && conversionAmount === 0 && (orderLever || hasOrder);
              // apply (A7, A13): an intent the path's year cannot carry (no stock-step draw with taxable and penalty-free
              // traditional left, or a conversion year) keeps the natural year.
              if (hasOrder) {
                planStats.orderYears++;
                if (!startOrder) planStats.orderSkipped++;
              }
              if (startOrder) {
                if (planMode === 'choose') orderYear = true;
                else block = false;
              } else {
                // 4d: no order phase: the split stage starts from the natural year (apply: an intent the year cannot carry is
                // skipped, and the year goes on as today)
                if (planSplits !== null && planSplits[age] != null) {
                  planStats.splitYears++;
                  if (!canSplit) planStats.splitSkipped++;
                }
                if (canSplit) {
                  startSplit = true;
                  orderYear = true;
                  if (planMode === 'apply') block = false;
                }
              }
            } else {
              // The order phase has converged (or ended in its forced pass).
              let kept;
              if (planMode === 'choose') {
                // Scored as a cliff trial is; kept only on a strict win with a draw, no unmet need and no extra home draw (A4).
                const nat = orderNat.naturalRec,
                  lam = lambdaOf(),
                  score = phaseScore(bal, lam, seSettled, seSettle, seSettled ? irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB)),
                  ok = flow < 0 && wd.orderable && wd.need <= 1 && wd.homeDrawn <= nat.homeDrawn + 1;
                kept = ok && score > nat.score + 1;
                if (kept) orderIntents[age] = 'traditional';
                if (planTr) {
                  planTr.order = { natScore: nat.score, score, ok, kept };
                  planTr.orderBal = { ...bal }; // test-only: the order phase's end balances
                }
              } else {
                kept = true;
                planStats.orderApplied++;
                if (planTr) planTr.order = { kept };
              }
              if (kept) {
                orderYear = true;
                trials = NO_PLANS; // the kept phase's own trials (the block below), not the natural year's
                // 4d: the split stage starts from the kept order phase
                if (planSplits !== null && planSplits[age] != null) {
                  planStats.splitYears++;
                  if (!canSplit) planStats.splitSkipped++;
                }
                if (canSplit) {
                  startSplit = true;
                  if (planMode === 'apply') block = false;
                }
              } else {
                // choose: back to the natural year, its record and its trials; the split stage starts from it if the natural
                // pass could carry one (4d, before its trials or replay); otherwise its trials run, or with none its final pass
                // is replayed.
                block = false;
                yearOrder = null;
                naturalRec = orderNat.naturalRec;
                trials = orderNat.trials;
                if (orderNat.canSplit) startSplit = true;
                else if (trials.length) {
                  trialRecs = [];
                  next = 0;
                } else {
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
                  yearSplit = naturalRec.split;
                  estShareA = naturalRec.estShareA;
                  replaying = true;
                  continue;
                }
              }
            }
            if (orderYear) {
              // The year's natural record in an order year, whatever the lines: the inputs that replay its final pass, its score
              // (choose) and what the order phase or the trials start from (yearOrder: null for the natural year, 'traditional'
              // for a kept order phase).
              const lam = planMode === 'choose' ? lambdaOf() : null;
              naturalRec = natRec(lam ? healthcareRet + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : null, lam ? phaseScore(bal, lam, seSettled, seSettle, seSettled ? irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB)) : null, yearOrder);
            }
            if (splitRun > 0) {
              // 4d: a split phase's record. choose (D7): it counts only if it drew, left no need unmet and drew no more home
              // equity than the stage's starting record; apply keeps its phase always.
              if (planMode === 'choose') naturalRec.ok = flow < 0 && wd.need <= 1 && wd.homeDrawn <= splitNat.naturalRec.homeDrawn + 1;
              else {
                planStats.splitApplied++;
                if (planTr) {
                  planTr.split = { kept: true };
                  planTr.shareA = naturalRec.shareA;
                }
              }
            }
            // The natural year (or a kept order phase) has converged (or ended in its forced pass). Lines in reach of its MAGI:
            // from the MAGI with no discretionary draw and no conversion to the MAGI with the conversion plus REACH_GROSS_UP x
            // the need.
            if (block && flow < 0) {
              // created once a year, at the natural phase's end (a kept order phase keeps it: planTr.order)
              if (planTrace && planTr === null) planTr = { year };
              const lo = magiBase + ladderGain,
                hi = lo + conversionAmount + REACH_GROSS_UP * -flow,
                convA = conversionAmount * profile.ownerShareA;
              const intent = planMode === 'apply' && plan && plan.intents ? plan.intents[age] : null;
              // apply builds the year's lines only in a year with an intent (choose always).
              const lines =
                planMode === 'choose' || intent
                  ? magiThresholds(ctx, { year, filing, twoReturns, profile, preMagi: preConvMagi + conversionAmount, preMagiA: preMagiA + convA, preMagiB: preMagiB + conversionAmount - convA, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA: employerA, workingB: employerB, age, ageB, irmaa: { filing, a: medA || inYrA, b: medB || inYrB }, irmaaGrowth: inYrA || inYrB ? 1 : irmaaGrowth2, irmaaGrowthA: inYrA ? 1 : irmaaGrowth2, irmaaGrowthB: inYrB ? 1 : irmaaGrowth2, lo, hi })
                  : NO_THRESHOLDS;
              // test-only: each split phase's line count (R2 (a): a split phase builds its own lines)
              if (planTr && splitRun > 0) (planTr.splitLines || (planTr.splitLines = [])).push(lines.length);
              // The converged natural year as the eligibility tests read it (underEligible / fillEligible), the same for both modes.
              const natOf = intent || (planMode === 'choose' && lines.length) ? () => ({ natMagi: realizedMagi, natConv: conversionAmount, natTrad: wd.cappableTraditional, natGain: wd.cappableGain, lo, hi, canFill: freeTraditional(wd) > 0 }) : null;
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
                  if (!orderYear) naturalRec = natRec(null, null, null);
                  trials = [trial];
                  trialRecs = [];
                  next = 0;
                }
              }
              if (planMode === 'choose' && lines.length) {
                trials = yearPlanCandidates({ thresholds: lines, ...natOf(), gain: taxableGainGross, magiBase, premiumAt: costAt, irmaaAt });
                if (planTr) {
                  // test-only: what the stay-under eligibility read (underEligible)
                  planTr.natTrad = wd.cappableTraditional;
                  planTr.natGain = wd.cappableGain;
                }
                // The natural year's record: the inputs that replay its final pass, its score and what the trials start from
                // (an order year built it above).
                if (!orderYear) {
                  const lam = trials.length ? lambdaOf() : null;
                  naturalRec = natRec(healthcareRet + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB), lam ? phaseScore(bal, lam, seSettled, seSettle, seSettled ? irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB)) : null, null);
                }
                if (trials.length) {
                  trialRecs = [];
                  next = 0;
                } else if (planTr) planTr.candidates = [{ kind: 'none', magi: realizedMagi, realized: realizedMagi, label: '', conversion: conversionAmount, cliffCost: naturalRec.cliffCost, score: null, ok: true }];
              }
            }
            if (splitRun > 0 && planMode === 'choose') {
              // 4d, choose: A-first's end starts B-first (seeded as A was); B-first's end keeps one of the stage's starting record,
              // A and B (D7: pro rata wins every tie, A beats B only by more than $0). A kept split is the year's natural record
              // (its trials run, it seeds the next year); the kept record's trials run, or with none its final pass is replayed
              // unless it is B's (the pass that just ran).
              const rec = naturalRec;
              rec.trials = trials;
              next = -1;
              if (splitRun === 1) {
                splitRecA = rec;
                naturalRec = splitNat.naturalRec;
                splitRun = 2;
                yearSplit = 1;
                estShareA = 0;
                yearOrder = naturalRec.order;
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
              const nat = splitNat.naturalRec,
                recA = splitRecA;
              let best = nat;
              if (recA.ok && recA.score > best.score + 1) best = recA;
              if (rec.ok && rec.score > best.score + (best === nat ? 1 : 0)) best = rec;
              if (planTr) {
                planTr.split = { natScore: nat.score, scoreA: recA.score, scoreB: rec.score, okA: recA.ok, okB: rec.ok, kept: best !== nat };
                planTr.shareA = best.shareA;
              }
              naturalRec = best;
              trials = best === nat ? splitNat.trials : best.trials;
              if (best !== nat) splitIntents[age] = best === recA ? 'A' : 'B';
              if (trials.length) {
                trialRecs = [];
                next = 0;
              } else if (best !== rec) {
                yearSplit = best.split;
                estShareA = best.estShareA;
                yearOrder = best.order;
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
            if (startSplit) {
              // 4d: start the split stage: a fresh iteration from the year's snapshot, seeded from the starting record as a trial
              // is, its share estimate at the first partner's (1 for A, 0 for B). choose runs A first; apply its intent's
              // partner. The starting record and (choose) its trials are saved for the stage's end.
              if (planTrace && planTr === null) planTr = { year };
              splitNat = { naturalRec, trials: planMode === 'choose' ? trials : NO_PLANS };
              next = -1;
              splitRun = 1;
              yearSplit = planMode === 'choose' || planSplits[age] === 'A' ? 0 : 1;
              estShareA = yearSplit === 0 ? 1 : 0;
              yearOrder = naturalRec.order;
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
            if (startOrder) {
              // Start the order phase: a fresh iteration from the year's snapshot, the draw traditional-first, seeded from the
              // natural year as a trial is. choose saves the natural record and its trials (restored if the order is not kept).
              if (planMode === 'choose') {
                orderNat = { naturalRec, trials, canSplit };
                next = -1;
                if (planTr) planTr.natBal = { ...bal }; // test-only: the natural year's end balances
              } else if (planTrace) planTr = { year };
              orderRun = true;
              yearOrder = 'traditional';
              estTrad = realizedTrad;
              estGain = taxableGainGross;
              estSeA = seRealA;
              estSeB = seRealB;
              estInhA = inhRealA;
              estInhB = inhRealB;
              seHeld = false;
              seKind = 0;
              forcedPass = false;
              phaseUnresolved = false;
              passLog.length = 0;
              phasePass = -1;
              continue;
            }
          } else if (planMode === 'apply') {
            // apply: the plan's trial is done. Kept if it met its plan and left no need unmet (no lambda, no score, no healthcare
            // test: spec section 6); otherwise the natural year's final pass is replayed, as choose replays a non-last winner.
            // met is choose's predicate (planMet, R1 (a)): a per-return intent is judged on its own return too.
            let met;
            if (twoReturns && yearPlan.ret !== 'H') {
              const [mA, mB] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB);
              met = planMet(yearPlan, realizedMagi, mA, mB);
            } else met = planMet(yearPlan, realizedMagi, 0, 0);
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
              yearOrder = naturalRec.order;
              yearSplit = naturalRec.split;
              estShareA = naturalRec.estShareA;
              replaying = true;
              continue;
            }
          } else {
            // A trial's iteration is done: record it. It counts only if it met its plan (a cap limits penalty-free traditional draws
            // and stock-account taxable sales only, so the ladder gain, the bond reserve, the bond refill, early
            // Roth earnings and the release can carry MAGI over the line), left no need unmet and saves more than $1
            // of premium plus IRMAA against the natural year (13.7 B: a real cliff, not a bet on this year's tax rate).
            // met (R1 (a)): a per-return intent (ret A / B) is also judged on its own return's MAGI (planMet, as in apply).
            let met;
            if (twoReturns && yearPlan.ret !== 'H') {
              const [mA, mB] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB);
              met = planMet(yearPlan, realizedMagi, mA, mB);
            } else met = planMet(yearPlan, realizedMagi, 0, 0);
            const lam = lambdaOf(),
              cliffCost = healthcareRet + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB);
            trialRecs.push({ plan: yearPlan, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, cliffCost, order: yearOrder, ok: met && wd.need <= 1 && naturalRec.cliffCost - cliffCost > 1, score: phaseScore(bal, lam, seSettled, seSettle, seSettled ? irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB, pairA, pairB) : irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB)), split: yearSplit, estShareA, shareA: profile.ownerShareA });
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
                yearOrder = best.order;
                yearSplit = best.split;
                estShareA = best.estShareA;
                replaying = true;
                continue;
              }
            }
          }
          if (next >= 0) {
            // Start a trial: a fresh iteration from the year's snapshot with the plan held, seeded from the natural year.
            trialIdx = next;
            yearPlan = trials[next];
            yearOrder = naturalRec.order;
            // 4d (item 6): a trial from a kept split draws its first partner first, its share estimate at the record's realized share
            yearSplit = naturalRec.split;
            estShareA = naturalRec.shareA;
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
        // Batch 5 step 5b piece 3: a sized year, once, at its kept pass: carried, or converted the user's bracket instead.
        if (convTarget !== null) {
          planStats.convYears++;
          if (convFell) planStats.convFellBack++;
          else planStats.convApplied++;
        }
        // Next year's natural phase is seeded from this year's natural draw, as the `off` year would be; in a year whose order phase
        // was kept, the order phase is the natural record (A3).
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
          planTr.tauGain = yearLambda ? yearLambda.tauGain : null; // test-only (the order phase's score, re-checked by hand)
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
          // planMet as choose and apply judge it; the return MAGIs were written above (an A / B plan exists only in a two-return year).
          if (yearPlan.ret === 'H' ? planMet(yearPlan, realizedMagi, 0, 0) : planMet(yearPlan, realizedMagi, magiHistoryA[year], magiHistoryB[year]))
            row.cliffChoice = (yearPlan.kind === 'under' ? 'stayed under ' : 'filled to ') + yearPlan.label;
          else magiStats.planMissed++;
        }
        // Batch 5 step 5b piece 3 (review I-5): a sized year's target as the kept pass carried it (a stay-under trial that won
        // converts nothing and shows the target; cliffChoice says why), or the fallback.
        if (convTarget !== null) row.convChoice = convFell ? 'the bracket conversion (target not reachable this year)' : convChoiceOf(convTarget);
        // Batch 5 step 4c: a year whose kept pass drew traditional-first (the order phase, a trial from it, or a replay of either).
        if (yearOrder !== null) row.drawOrder = yearOrder;
        // Batch 5 step 4d: a year whose kept pass drew one partner's traditional accounts first (a split phase, a trial or replay of it).
        if (yearSplit !== null) row.drawSplit = yearSplit === 0 ? 'A' : 'B';
        rows.push(row);
        // 4d (Fable review I1): the estate's end tax splits the traditional estate by the start-of-year ownership share, never a
        // split year's realized share (outside a split year the two are the same double).
        if (year === projectionYears) endTax = { profile: { ...profile, ownerShareA: ownerShareA0 }, lastGain: wd.taxableGainGross, lastTrad: wd.traditionalGross };
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
    // The order lever's kept orders (choose with plan.levers.order only), keyed the same way and not enumerable either.
    if (orderIntents) Object.defineProperty(result, 'orderIntents', { value: orderIntents });
    // The split lever's kept splits (choose with plan.levers.split only), keyed the same way ('A' | 'B'), not enumerable either.
    if (splitIntents) Object.defineProperty(result, 'splitIntents', { value: splitIntents });
    // Batch 5 step 5b piece 3: the conversion targets choose sized to (plan.conv non-null, sizing on), keyed the same way: only the
    // years whose winner is not the bracket target; not enumerable either.
    if (convIntents) Object.defineProperty(result, 'cliffConvIntents', { value: convIntents });
    // Revision 2 (spec B0.11.2): the same run's shortlist, every priced year with an entry, keyed the same way; not enumerable.
    if (convShortlist) Object.defineProperty(result, 'cliffConvShortlist', { value: convShortlist });
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
  // the plan, and the test switch not set (every state, RI and PA
  // included: owner decision 16). Otherwise the plan is today's, byte for byte.
  function bracketSearchApplies(ctx) {
    const inputs = ctx.inputs;
    if (!inputs.cliffGuardEnabled || ctx.test.bracketSearchOff) return false;
    return conversionsInPlan(inputs);
  }
  // Whether the plan converts at all: conversions on and at least one conversion age of Partner A inside the plan (the years
  // counted as the bracket search counts them: survivor years are keyed by A's age too). The stored plan's report reads it
  // (`stored.converts`), so a bracket clause is printed only when conversions apply.
  export function conversionsInPlan(inputs) {
    if (!inputs.rothConvEnabled) return false;
    const years = inputs.singlePerson ? Math.max(0, inputs.lifeExpectancyA - inputs.ageA) : Math.max(0, inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB);
    return Math.max(inputs.rothConvStartAge, inputs.ageA) <= Math.min(inputs.rothConvEndAge, inputs.ageA + years);
  }
  // Whether the sized track applies (Batch 5 step 5b piece 3, spec B0.3, builder's call C8): the guard on, conversions in the plan,
  // the test switch not set, and at least one conversion age inside the plan that convExempt does not exempt. Its own test, not
  // bracketSearchApplies: a window the bracket map pins in part still sizes its other ages.
  function sizingApplies(ctx) {
    const inputs = ctx.inputs;
    if (!inputs.cliffGuardEnabled || ctx.test.convSizingOff || !conversionsInPlan(inputs)) return false;
    const years = inputs.singlePerson ? Math.max(0, inputs.lifeExpectancyA - inputs.ageA) : Math.max(0, inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB);
    const to = Math.min(inputs.rothConvEndAge, inputs.ageA + years);
    for (let age = Math.max(inputs.rothConvStartAge, inputs.ageA); age <= to; age++) if (!convExempt(ctx, age)) return true;
    return false;
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
  // `mult` nor the objective's ranking nor the levers) and is valid only for one working copy of the inputs. The defaults are today's plan.
  // Batch 5 step 4c (spec 7.3, A2, A11) and 4d (D9, D10): `levers` (null: the withdrawal toggle decides, PLAN_LEVERS when it is
  // on) turns on the levers when its `order` or its `split` is true; a levers option with both off is no lever at all (the plan
  // is byte-identical). With the levers, each bracket's selection is today's (stage 0, lever-free), then the lever's `choose` run
  // and its family subsets with every order and every split held (stage 1); at the kept bracket only (A11's fallback: a full
  // planning measured over 150 ms with stage 2 at every bracket), once the bracket search has ranked the stage-1 bests, the lever
  // run's best candidate (the top) with each phase's orders alone (two or more phases), with no orders (only when the top holds
  // orders) and with no splits, each try skipped when it would be `off` (stage 2). Every lever candidate replaces the running best only on
  // planCandidateBetter. A lever choose that records no order and no split adds nothing (stage 0 stands).
  // Last, the whole-plan check (A2, leverPlanStands): the lever plan's kept candidate stands only when it is toggle off's own
  // (the stage-0 bests ranked as today) or beats it by planCandidateBetter; otherwise the plan and report are toggle off's (with
  // `levers` set and the lever's report fields), so the plan never depletes or first draws on the house earlier than toggle off.
  // With both levers, the order-only floor (4d, Task 8) runs after it (below), so the plan never ends below the order lever's
  // alone.
  // The plan carries `levers` (a copy), the kept `orders`, `orderPhases` and `splits` (an empty map is null); the report's
  // `keptIndex` is the kept candidate's index in `candidates` (a family no longer names one candidate), and with the lever each
  // candidate has `orders` and `splits` (counts) and `orderPhases`, and the report `keptOrderPhases` and `keptSplits` (a count).
  // Batch 5 step 5b piece 3, revision 2 (spec B0.11.3, B0.11.4): `sizing` (default true) lets the whole-run sizing pass run (below,
  // with search set and sizingApplies); Optimize's mult trials pass false.
  export function computeCliffPlan(ctx, { search = true, mult = null, objective = 'endValue', rankEvenly = false, tieBracket = null, offMemo = null, levers = null, sizing = true } = {}) {
    const inputs = ctx.inputs;
    if (!inputs.cliffGuardEnabled) return { plan: null, report: null };
    const lev = levers && (levers.order || levers.split) ? levers : levers === null && inputs.withdrawalMixEnabled ? PLAN_LEVERS : null;
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
    // `orders` / `splits` (the levers): the candidate's held orders and splits, null for none (an empty map is null, Opus review
    // I1); `n` counts cliff intents, orders and splits alike, so on a tie the fewer-intents rule keeps the plan with fewer orders
    // and splits (a tie with the lever-free best keeps it). `conv` (Batch 5 step 5b piece 3): the sized track's conversion targets,
    // null for none; `n` counts them too (each recorded age once).
    const measure = (family, intents, sim, orders = null, splits = null, conv = null) => {
      const value = US_OBJECTIVES.endValue.value(runCtx, sim),
        cost = US_OBJECTIVES.lifetimeCost.value(runCtx, sim),
        ni = Object.keys(intents).length,
        no = orders ? Object.keys(orders).length : 0,
        ns = splits ? Object.keys(splits).length : 0,
        nc = conv ? Object.keys(conv).length : 0;
      return { family, intents, orders: no ? orders : null, orderPhases: no ? orderPhasesOf(ctx, orders) : null, splits: ns ? splits : null, conv: nc ? conv : null, ni, n: ni + no + ns + nc, depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, value, cost, score: byCost ? (cost === 0 ? 0 : -cost) : value };
    };
    // Today's selection for one bracket: `held` is null for the user's bracket (today's runs: `choose` and `off` with no plan,
    // the family subsets through `apply` on a plan carrying the user's own bracket, which resolves to the setting, so every
    // `apply` plan has one shape), else the full plan (makePlan of `{ bracket, bracketFrom }`) every run's plan carries, so `choose`, the family subsets
    // through `apply` and `off` all convert at that bracket (an `off` run reads the plan's bracket too). Rule A (planCandidateBetter) keeps one
    // candidate, never one that depletes or first draws on home equity earlier than `off` (decision 9).
    const from = inputs.rothConvBracket;
    // 4a: a null or all-ones mult is today's plans; otherwise every `choose` run carries it (the user's bracket gets a plan of its own)
    const useMult = mult && !mult.every((m) => m === 1) ? mult : null;
    // The automatic planning (everything before the stored-plan guard) for the levers `lev` (null: none), the `off` memo
    // `offMemo` (null: none) and the stage-0 memo `stage0Memo` (null: none): the kept bracket and its selection, the kept best,
    // the reported candidates and bracket entries, and whether some bracket's lever `choose` recorded a split (`split`: the
    // order-only track runs only then, Task 8).
    const automatic = (lev, offMemo, stage0Memo) => {
      let split = false;
      const select = (bracket, held) => {
        const base = held || { bracket: from, bracketFrom: from };
        // Stage 0 (lever-free): today's selection at this bracket. It reads neither `lev` nor the track, so with a stage0Memo
        // (Batch 5 step 5, Task 6: both tracks of one planning) a bracket's stage 0 runs once and the second track starts from
        // its best and a copy of its candidates (the measures are shared, never written).
        let s0 = stage0Memo ? stage0Memo.get(bracket) : undefined;
        if (s0 === undefined) {
          const chosen = run('choose', useMult ? makePlan({ ...base, mult: useMult }) : held),
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
          const c0 = [off];
          if (fams.size > 1)
            for (const fam of ['aca', 'irmaa']) {
              const sub = pick(fam);
              c0.push(measure(fam, sub, run('apply', makePlan({ ...base, intents: sub, family: fam }))));
            }
          if (fams.size) c0.push(measure('all', all, chosen));
          let b0 = c0[0];
          for (const c of c0.slice(1)) if (planCandidateBetter(c, b0)) b0 = c;
          s0 = { best: b0, cands: c0 };
          if (stage0Memo) stage0Memo.set(bracket, s0);
        }
        const cands = s0.cands.slice();
        let best = s0.best;
        if (!lev) return { best, cands };
        // The levers (4c, 4d). Stage 1: the lever's `choose` run and its family subsets, every candidate holding all its orders and
        // all its splits (null when it recorded none), chained from stage 0's best (A2); with no cliff intent, the run itself
        // (family none). A lever run that records no order and no split adds no candidate: stage 0's selection stands. `best0` /
        // `n0`: stage 0's best and candidate count (the whole-plan check).
        const best0 = best,
          n0 = cands.length,
          lv = run('choose', makePlan({ ...base, mult: useMult, levers: lev })),
          ords = lv.orderIntents && Object.keys(lv.orderIntents).length ? lv.orderIntents : null,
          spl = lv.splitIntents && Object.keys(lv.splitIntents).length ? lv.splitIntents : null;
        if (spl) split = true;
        if (!ords && !spl) return { best, cands, best0, n0 };
        const allL = lv.cliffIntents,
          famsL = new Set(Object.values(allL).map((i) => lineFamily(i.line))),
          lever = [];
        if (famsL.size > 1)
          for (const fam of ['aca', 'irmaa']) {
            const sub = Object.fromEntries(Object.entries(allL).filter(([, i]) => lineFamily(i.line) === fam));
            lever.push(measure(fam, sub, run('apply', makePlan({ ...base, intents: sub, family: fam, orders: ords, orderPhases: orderPhasesOf(ctx, ords), splits: spl })), ords, spl));
          }
        lever.push(famsL.size ? measure('all', allL, lv, ords, spl) : measure('none', {}, lv, ords, spl));
        for (const c of lever) {
          cands.push(c);
          if (planCandidateBetter(c, best)) best = c;
        }
        // Stage 2's inputs (run by stage2 at the kept bracket): the best lever candidate (whether or not it beat stage 0).
        let top = lever[0];
        for (const c of lever.slice(1)) if (planCandidateBetter(c, top)) top = c;
        return { best, cands, best0, n0, stage2: { base, top, ords } };
      };
      // Stage 2 (A11, D9) on one bracket's selection: the best lever candidate's (the top's) family and intents with each phase's
      // orders alone (two or more phases) and the top's splits, then (when the top holds orders) with no orders and the top's
      // splits, then (when the top holds splits) with the top's orders and no splits; a try that would be `off` (family none, no
      // orders, no splits) is skipped. Each replaces the selection's best only on planCandidateBetter.
      const stage2 = (sel) => {
        const { base, top, ords } = sel.stage2,
          phases = orderPhasesOf(ctx, ords),
          tries = [];
        if (phases !== null && phases.length > 1) for (const ph of phases) tries.push([Object.fromEntries(Object.entries(ords).filter(([a]) => phaseOf(ctx, Number(a)) === ph)), top.splits]);
        if ((top.family !== 'none' || top.splits) && top.orders) tries.push([null, top.splits]);
        if (top.splits && (top.family !== 'none' || top.orders)) tries.push([top.orders, null]);
        for (const [o, sp] of tries) {
          const c = measure(top.family, top.intents, run('apply', makePlan({ ...base, intents: top.intents, family: top.family, orders: o, orderPhases: orderPhasesOf(ctx, o), splits: sp })), o, sp);
          sel.cands.push(c);
          if (planCandidateBetter(c, sel.best)) sel.best = c;
        }
      };
      const entry = (bracket, s) => ({ bracket, family: s.best.family, intents: s.best.ni, depletedAge: s.best.depletedAge, homeDrawAge: s.best.homeDrawAge, value: s.best.value, cost: s.best.cost, score: s.best.score });
      // Candidate 0, the user's bracket, is today's plan; keptBracketOf keeps a bracket over every bracket's best (each other
      // bracket replacing the running best only on a strict win; with rankEvenly, bracketEvenBest once all are in).
      const sels = new Map([[from, select(from, null)]]);
      if (applies && search)
        for (const b of BRACKET_CANDIDATES) if (b !== from) sels.set(b, select(b, makePlan({ bracket: b, bracketFrom: from })));
      let brackets = [...sels].map(([b, sel]) => entry(b, sel));
      let kept = { bracket: keptBracketOf(brackets, rankEvenly, tieBracket) };
      kept.sel = sels.get(kept.bracket);
      // The levers' stage 2 at the kept bracket; its entry in `brackets` then shows the bracket's final best.
      if (kept.sel.stage2) {
        stage2(kept.sel);
        const i = brackets.findIndex((e) => e.bracket === kept.bracket);
        brackets[i] = entry(kept.bracket, kept.sel);
      }
      let best = kept.sel.best,
        cands = kept.sel.cands,
        keptLev = lev,
        off = null;
      // The whole-plan check (A2): toggle off's kept bracket and best, ranked as today over the stage-0 bests (no new run); the
      // lever plan stands only by leverPlanStands, else the plan and report are toggle off's. `off` (with the levers): toggle off's
      // kept selection (bracket, best, candidates, `brackets`), for the check after sizing (B0.11.9).
      if (lev) {
        const brackets0 = [...sels].map(([b, sel]) => entry(b, { best: sel.best0 })),
          b0 = keptBracketOf(brackets0, rankEvenly, tieBracket),
          sel0 = sels.get(b0);
        off = { bracket: b0, best: sel0.best0, cands: sel0.cands.slice(0, sel0.n0), brackets: brackets0 };
        if (!leverPlanStands(best, sel0.best0)) {
          kept = { bracket: b0, sel: sel0 };
          best = off.best;
          cands = off.cands;
          brackets = brackets0;
          keptLev = null;
        }
      }
      return { kept, best, cands, brackets, split, keptLev, entry, off };
    };
    const applies = bracketSearchApplies(ctx);
    // The order-only floor (Batch 5 step 4d, Task 8; owner, 2026-10-26): with both levers, a kept split displaces that year's
    // stay-under and changes the trajectory, so the joint planning can keep a plan below the order lever's alone. When some
    // bracket's lever choose recorded a split, the order-only track (4c's planning: its family subsets, bracket rank, stage 2
    // and A2 check) runs too, sharing the `off` measures (the caller's offMemo, else one Map for the pair), and the joint plan
    // stands only on a strict planCandidateBetter win over it (a tie, the same toggle-off candidate included, goes to the order
    // track: planCandidateBetter of a candidate against itself is false); otherwise the plan and report are the order-only
    // track's (`levers` still the caller's). `report.leverTrack` says which ('joint' | 'order'), only when both ran. No split recorded: one track, as before.
    // Both tracks share each bracket's stage 0 too (`s0memo`, this planning's own: stage 0 reads `mult` and the objective; Batch 5
    // step 5, Task 6, a pure speed-up: every plan and report identical; only the ctx.stats run counters count stage 0 once).
    const both = lev !== null && lev.order && lev.split,
      memo = both && offMemo === null ? new Map() : offMemo,
      s0memo = both ? new Map() : null;
    let auto = automatic(lev, memo, s0memo),
      track = null;
    if (both && auto.split) {
      ctx.stats.plan.orderTracks++;
      const ord = automatic({ order: true, split: false }, memo, s0memo);
      track = planCandidateBetter(auto.best, ord.best) ? 'joint' : 'order';
      if (track === 'order') auto = ord;
    }
    let keptBracket = auto.kept.bracket,
      { best, cands, brackets } = auto;
    // The whole-run sizing pass (Batch 5 step 5b piece 3, revision 2, spec B0.11.3; it replaces B0.3's sized track): after the
    // whole automatic selection, in the deferred pass only (search set), when sizing applies (sizingApplies) and the caller has not
    // turned it off (`sizing` false: Optimize's mult trials, B0.11.4). sizePass(bracket, base, pLev) is one pass (B0.11.9 step 1):
    // the proposal is one `choose` run at `bracket` with the levers `pLev` and `conv: {}`; its shortlist (cliffConvShortlist: each
    // priced year's best target other than the bracket and none) is walked by age ascending from `base` (`cur`: its guard intents,
    // family, orders and splits held throughout, conv empty). Each age adds its target to cur's conv for one `apply` run, at most
    // CONV_RUN_BUDGET runs (ctx.test.convRunBudget, a Vitest seam, when set), and the trial becomes cur only by greedyAccepts. The
    // final cur stands, when it holds a target, only by bracketCandidateBetter over `base`, so the pass never depletes or first
    // draws on the house earlier. It returns the pass's final measure (`best`: cur when kept, else `base`) and its report: the
    // shortlist's size (`proposed`), the apply runs (`tried`), the ages accepted, whether the budget left ages untried, whether
    // cur stands, and the kept conv's count per kind (zero when not kept).
    const sizePass = (bracket, base, pLev) => {
      const sv = run('choose', makePlan({ bracket, bracketFrom: from, mult: useMult, levers: pLev, conv: {} })),
        shortlist = sv.cliffConvShortlist,
        ages = Object.keys(shortlist),
        budget = ctx.test.convRunBudget == null ? CONV_RUN_BUDGET : ctx.test.convRunBudget;
      let cur = base,
        conv = {},
        tried = 0,
        accepted = 0,
        budgetHit = false;
      for (const age of ages) {
        if (tried === budget) {
          budgetHit = true;
          break;
        }
        const trialConv = { ...conv, [age]: shortlist[age] },
          m = measure(cur.family, cur.intents, run('apply', makePlan({ bracket, bracketFrom: from, mult: useMult, intents: cur.intents, family: cur.family, orders: cur.orders, orderPhases: cur.orderPhases, splits: cur.splits, conv: trialConv })), cur.orders, cur.splits, trialConv);
        tried++;
        if (greedyAccepts(m, cur)) {
          cur = m;
          conv = trialConv;
          accepted++;
        }
      }
      const report = { proposed: ages.length, tried, accepted, budgetHit, kept: false, convIntents: { none: 0, bracket: 0, under: 0, over: 0 } };
      if (!(accepted > 0 && bracketCandidateBetter(cur, base))) return { best: base, report };
      report.kept = true;
      // the kept conv's targets per kind (all zero when the pass is not kept, spec B0.11.3 step 6)
      for (const a of Object.keys(conv)) {
        const t = conv[a];
        if (t === 'none') report.convIntents.none++;
        else if (typeof t === 'string') report.convIntents.bracket++;
        else report.convIntents[t.side]++;
      }
      return { best: cur, report };
    };
    // The toggle's guarantee after sizing (B0.11.9): an order's value depends on the conversions, so the unsized whole-plan check
    // (A2) does not bound the sized plans. A kept plan with no orders and no splits proposes with no levers; one holding orders or
    // splits proposes with the kept track's levers. When the kept best is toggle off's own (auto.off.best, the same object: no
    // levers, or the unsized A2 revert), the one pass is toggle off's pass. Otherwise (with the levers, a kept best that is not
    // toggle off's: it holds orders or splits, or a different bracket, or, builder's finding, only the lever run's guard intents,
    // kept by stage 2's no-orders try; a best equal to toggle off's in value but not the same object only costs the second pass)
    // toggle off's kept selection (auto.off) gets its own pass (levers null), and the sized lever plan stands only by
    // leverPlanStands(sizedOn, sizedOff), else the plan and report are toggle off's sized ones (its bracket, candidates and
    // `brackets`; `levers` still the caller's), as the unsized A2 revert. report.sized is the kept plan's pass report, plus
    // `offPass` ({ proposed, tried, accepted, kept }, test and diagnosis only) when both passes ran (on the fallback report.sized is
    // toggle off's pass, so offPass repeats its figures). Not kept: the plan and report
    // are the base ones, with report.sized added. Kept: the pass's plan is appended to the candidates (keptIndex names it) and the
    // kept bracket's `brackets` entry shows it. The order-only floor above stays unsized (measured after sizing on the 768 grid
    // households: it never fails, docs/next-batches-plan.md).
    // computed once (Fable M-4): the pass's test and the light plan's `searched` both read it
    const sizes = sizingApplies(ctx);
    let sized = null;
    if (sizing && search && sizes) {
      let pass = sizePass(keptBracket, best, best.orders !== null || best.splits !== null ? auto.keptLev : null);
      if (auto.off !== null && best !== auto.off.best) {
        const offSized = sizePass(auto.off.bracket, auto.off.best, null),
          o = offSized.report,
          offPass = { proposed: o.proposed, tried: o.tried, accepted: o.accepted, kept: o.kept };
        if (!leverPlanStands(pass.best, offSized.best)) {
          pass = offSized;
          keptBracket = auto.off.bracket;
          best = auto.off.best;
          cands = auto.off.cands;
          brackets = auto.off.brackets;
        }
        pass.report.offPass = offPass;
      }
      sized = pass.report;
      if (sized.kept) {
        best = pass.best;
        cands = cands.concat([best]);
        brackets = brackets.slice();
        const i = brackets.findIndex((e) => e.bracket === keptBracket);
        brackets[i] = auto.entry(keptBracket, { best });
      }
    }
    const out = {
      plan: makePlan({ intents: best.intents, family: best.family, bracket: keptBracket, bracketFrom: from, mult: useMult, levers: lev ? { ...lev } : null, orders: best.orders, orderPhases: best.orderPhases, splits: best.splits, conv: best.conv }),
      report: {
        candidates: cands.map((c) => {
          const r = lev
            ? { family: c.family, intents: c.ni, orders: c.orders ? Object.keys(c.orders).length : 0, orderPhases: c.orderPhases, splits: c.splits ? Object.keys(c.splits).length : 0, depletedAge: c.depletedAge, homeDrawAge: c.homeDrawAge, value: c.value, cost: c.cost }
            : { family: c.family, intents: c.ni, depletedAge: c.depletedAge, homeDrawAge: c.homeDrawAge, value: c.value, cost: c.cost };
          if (c.conv) r.conv = Object.keys(c.conv).length;
          return r;
        }),
        kept: best.family,
        keptIndex: cands.indexOf(best),
        brackets,
        keptBracket,
        searched: search || (!applies && !sizes),
      },
    };
    if (sized !== null) out.report.sized = sized;
    if (lev) {
      out.report.keptOrderPhases = best.orderPhases;
      out.report.keptSplits = best.splits ? Object.keys(best.splits).length : 0;
      if (track !== null) out.report.leverTrack = track;
    }
    // The stored plan as a guarded candidate (Batch 5 step 4a, spec 4.3): one `apply` run of it, measured as every candidate,
    // against the automatic best, both scored on the stored plan's own objective (the automatic best's score derived from its
    // measure, no rerun). The report's other fields stay the automatic plan's; `stored.used` says which plan runs. The guard
    // (normalizeState) has validated it, so the winner is the stored plan object itself.
    const sp = inputs.storedPlan;
    if (sp) {
      const spByCost = objectiveById(sp.objective) === US_OBJECTIVES.lifetimeCost,
        scoreOf = (m) => (spByCost ? (m.cost === 0 ? 0 : -m.cost) : m.value),
        mine = measure(sp.plan.family, sp.plan.intents, run('apply', sp.plan)),
        reason = storedPlanVerdict({ depletedAge: mine.depletedAge, homeDrawAge: mine.homeDrawAge, score: scoreOf(mine) }, { depletedAge: best.depletedAge, homeDrawAge: best.homeDrawAge, score: scoreOf(best) }),
        used = reason === 'better' || reason === 'tie';
      out.report.stored = { used, reason, depletedAge: mine.depletedAge, homeDrawAge: mine.homeDrawAge, value: mine.value, cost: mine.cost, bracketHonoured: sp.plan.bracketFrom === from, converts: conversionsInPlan(inputs) };
      if (used) out.plan = sp.plan;
    }
    return out;
  }
