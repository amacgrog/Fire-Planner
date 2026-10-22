// Test hooks this planner exposes on window (US engine and plan hooks)

import { HIST } from '../../shared/core/projection/historical-data.js';
import { dependentsInYear, qualifyingChildCount } from '../../shared/core/inputs/lists.js';
import { runHistoricalCycles, runMonteCarlo, simulate, simulateHistorical } from '../../shared/core/projection/simulate.js';
import { mortgageSchedule } from '../../shared/core/income/spending-and-loans.js';
import { assignState, mode, state } from '../../shared/core/store.js';
import { stateContextFor } from '../../shared/ui/results/state-context.js';
import { assignHistTaxFactors, histTaxFactors } from '../../shared/core/tax-factors.js';
import { taxIndexFactor } from '../../shared/core/projection/year-factors.js';
import { historicalYearSource, standardYearSource } from '../../shared/core/projection/year-sources.js';
import { computeScenarioMetrics } from '../../shared/ui/plans/scenario-comparison.js';
import { magiStats, planStats } from '../core/projection/engine-state.js';
import { afterTaxValue, yearPlanCandidates, planCandidateBetter, magiThresholds, lambdaEstimate, afterTaxEndValueUS } from '../core/cliff-plan/solver.js';
import { cliffPlanStore } from '../core/cliff-plan-store.js';
import { cliffPlanCache, cliffPlanSummary, ensureTestPlan, planForState, refreshCliffPlan } from '../core/cliff-plan/planning.js';
import { storeContext } from '../core/projection/store-context.js';
import { FILING, SENIOR_DEDUCTION_LAST_YEAR, itemizedDeduction, saltCap, seniorDeduction, mortgageInterestShare, standardDeduction, federalDeduction } from '../core/tax/federal-rules.js';
import { freeTraditional, releaseMagiCap, magiCapLeft, newWithdrawal, takeTraditional, solveTraditionalForNet, fillTraditional, incomeRoom } from '../core/withdrawals/draws.js';
import { LUMP_OUT, lumpAmountsForYear, STREAM_OUT, streamAmountsForYear, streamCoverBits } from '../core/income/streams-and-lumps.js';
import { returnMagis, magiForIrmaaLine, irmaaSurcharge, irmaaTierCeiling, irmaaMagiOf } from '../core/healthcare/irmaa.js';
import { mcpAccepts } from '../core/inputs/field-meta.js';
import { hasChildAtMost } from '../core/healthcare/medicaid-rules.js';
import { SOURCES_A, SOURCES_B, SOURCES_JOINT, SOURCES_SINGLE, stateRuleFor, stateIncomeTax } from '../core/tax/state-tax.js';
import { singleLifeFactor } from '../core/income/distributions.js';
import { optimizeMultiLever, optimizeRothLadderPerYear } from '../core/optimizer/multi-lever.js';
import { optimizerState } from '../core/optimizer-state.js';
import { allocatePlanRoom, retirementContributions, SOLO_IN, SOLO_PLAN, soloPlanContributions, STREAM_PLAN, streamPlanContributions } from '../core/income/contributions.js';
import { pickLiveWithdrawalOrder, WITHDRAWAL_MIX_CANDIDATES, withdrawalMixWeights } from '../core/withdrawals/mix.js';
import { ROTH_PER_YEAR_CANDIDATES, rothScheduleCost } from '../core/optimizer/roth-schedule.js';
import { runProjection } from '../core/projection/run-projection.js';
import { SE_HEALTH, seHealthDeduction, acaHouseholdSize, acaNetCost } from '../core/healthcare/aca.js';
import { taxableSocialSecurity, returnStatusA, irmaaSsOf } from '../core/tax/social-security-tax.js';
import { SE_OUT, niitTax, additionalMedicareTax, filingStatusFor, childCredits, longTermGainTax, ordinaryTax, payrollTax, qbiDeduction, selfEmploymentTax, taxFor } from '../core/tax/federal-tax.js';
import { STATE_RULES } from '../core/tax/state-rules.js';
import { assignCurrentYear, currentYear } from '../core/tax-year.js';
import { testHooks } from '../core/test-hooks.js';
import { withdrawStandard } from '../core/withdrawals/strategies.js';
import { accountBalances, accountsClone, accountsContribute, accountsConvert, accountsDraw, accountsNew, accountsRestore, accountStatuses } from '../core/accounts/account-ledger.js';
import { BUCKET_MODE, STANDARD_MODE } from '../core/projection/year-modes.js';
import { FIELDS } from './inputs/fields.js';
import { normalizeState } from './inputs/normalize-state.js';
import { applyMultiLeverSchedule, clearAppliedMultiLeverSchedule } from './results/roth-optimizer-controls.js';
import { syncControls } from './inputs/sync-controls.js';
import { inheritedDraw, inheritedLedger } from '../core/income/inherited.js';
import { rothAccountsNew, rothSlotSplit } from '../core/accounts/roth-ledger.js';
import { rule55Applies, penaltyStatus } from '../core/accounts/penalty-status.js';
import { assignLastCagrSims, lastCagrSims, renderChartView } from './charts/chart-view.js';
import { renderMultiLeverOptimizer, renderRothPerYearOptimizer } from './results/roth-optimizer.js';
import { analysisHtml, assignCountryAnalysis } from '../../shared/ui/install-test-hooks.js';

  // The US part of __test_analysisBundle (src/shared/ui/install-test-hooks.js): the optimizers (budget 200), the price of the
  // multi-lever result's run, the Roth optimizer card, and once per bundle the after-tax end value on one historical path.
  const ANALYSIS_LEVERS = { includeRoth: true, includeMix: true, includeSmooth: true };
  const ANALYSIS_BUDGET = 200;
  const ANALYSIS_CARD_IDS = ['rothPerYearResult', 'rothPerYearSummary', 'rothPerYearRows', 'multiLeverResult', 'multiLeverSummary', 'multiLeverHead', 'multiLeverRows', 'multiLeverApplyNote'];
  // The optimizers' search options as the UI passes them: the store's budget (so __test_setOptimizerBudget and the bundle's
  // 200 apply) and the display mode.
  const searchOptions = () => ({ budget: optimizerState.rothPerYearEvalBudget, displayMode: mode });
  // Runs fn with the optimizer budget at 200 and puts back what it found: the budget, the last multi-lever run, the
  // override maps and the state fields the optimizer card toggles.
  function withOptimizerState(fn) {
    const saved = { ...optimizerState },
      enabled = state.rothConvEnabled,
      smooth = state.smoothWithdrawals;
    optimizerState.rothPerYearEvalBudget = ANALYSIS_BUDGET;
    try {
      return fn();
    } finally {
      Object.assign(optimizerState, saved);
      state.rothConvEnabled = enabled;
      state.smoothWithdrawals = smooth;
    }
  }
  // The run the multi-lever result describes, made as the optimizer card made it before Stage 4 (in place). It is kept in
  // place on purpose: the card runs below see the state fields it leaves set (withOptimizerState puts them back), as in the
  // stage 1 tree the parity bundle is compared with.
  function multiLeverRun(opt, options) {
    if (options.includeRoth) state.rothConvEnabled = true;
    if (options.includeSmooth) state.smoothWithdrawals = opt.smoothWithdrawals;
    optimizerState.rothBracketByAge = options.includeRoth ? opt.rothSchedule : null;
    optimizerState.withdrawalMixByAge = options.includeMix ? opt.mixSchedule : null;
    return simulate();
  }
  function usAnalysisPerMode() {
    return withOptimizerState(() => {
      const perYear = optimizeRothLadderPerYear(simulate(), state, stateContextFor(), searchOptions());
      const multiLever = optimizeMultiLever(simulate(), state, stateContextFor(), ANALYSIS_LEVERS, searchOptions());
      const run = multiLeverRun(multiLever, ANALYSIS_LEVERS);
      const scheduleCost = { cost: rothScheduleCost(run, state, mode), total: run.rows.at(-1).total, depletedAge: run.depletedAge };
      optimizerState.rothBracketByAge = null;
      optimizerState.withdrawalMixByAge = null;
      // Blank what the card writes, so a card that writes nothing (no years to optimize) shows no earlier household's text.
      for (const id of ANALYSIS_CARD_IDS) if (!id.endsWith('Result')) document.getElementById(id).innerHTML = '';
      renderRothPerYearOptimizer(simulate());
      renderMultiLeverOptimizer(simulate(), ANALYSIS_LEVERS);
      const card = {};
      for (const id of ANALYSIS_CARD_IDS) card[id] = id.endsWith('Result') ? document.getElementById(id).hidden : analysisHtml(id).html;
      card.lastMultiLeverRun = optimizerState.lastMultiLeverRun;
      return { perYear, multiLever, scheduleCost, card };
    });
  }
  // The analysis hook's control (tests/analysis_parity.js, PLAN_G58_SCHED, no refresh): the multi-lever optimizer with the
  // first trial's inputs planned with the override maps null (seeded into the plan cache), instead of the trial's own maps.
  function multiLeverPlannedWithoutMaps() {
    cliffPlanCache.clear();
    try {
      return withOptimizerState(() => {
        const selected = simulate();
        // The first trial's inputs: the ladder on (includeRoth), smoothed withdrawals on (the first smooth candidate).
        state.rothConvEnabled = true;
        state.smoothWithdrawals = true;
        optimizerState.rothBracketByAge = null;
        optimizerState.withdrawalMixByAge = null;
        planForState(state);
        return optimizeMultiLever(selected, state, stateContextFor(), ANALYSIS_LEVERS, searchOptions());
      });
    } finally {
      cliffPlanCache.clear();
    }
  }
  function usAnalysisOnce(opts) {
    const plan = planForState(state);
    const rowFn = (y) => HIST[(y + 18) % HIST.length];
    const runOn = (planMode, p) => {
      const r = window.__test_runPlanMode({ planMode, plan: p, rowFn, endValue: true });
      return { value: r.value, estate: r.estate, total: r.rows.at(-1).total, depletedAge: r.depletedAge };
    };
    const out = {
      planEndValue: { intents: plan ? Object.keys(plan.intents).length : null, apply: plan ? runOn('apply', plan) : null, off: runOn('off', null) },
    };
    if (opts && opts.planningControl) out.planningControl = { multiLever: multiLeverPlannedWithoutMaps() };
    return out;
  }

  // A hook with the old signature of an engine function that now takes the run context first: the context is built from the
  // store at each call (no plan), so a test that patches the state between calls sees its patch.
  function withStoreCtx(fn) {
    return (...a) => fn(storeContext({ withPlan: false }), ...a);
  }
  export function installTestHooks() {
    assignCountryAnalysis({
      renderChartView,
      cagrSims: () => lastCagrSims,
      resetCagrSims: () => assignLastCagrSims(null),
      // Plans cached by an earlier bundle are dropped, so a bundle does not depend on what ran before it. Within a bundle
      // the cache is cleared only here: a later entry can reuse a plan an earlier entry cached (an optimizer trial reusing
      // the plan of the first trial with the same inputs). That is intended: it mirrors the UI, where the cache carries
      // over from one computation to the next, and the entries always run in the same order.
      begin: () => cliffPlanCache.clear(),
      perMode: usAnalysisPerMode,
      once: usAnalysisOnce,
    });
    window.__test_simulateRaw = simulate;
    window.__test_simulateHistoricalRaw = simulateHistorical;
    // Scans: run a path with no plan. The next refreshCliffPlan() re-plans (the hand-set plan is not a computed one).
    window.__test_setCliffPlan = (p) => { cliffPlanStore.plan = p; cliffPlanStore.key = JSON.stringify(state); cliffPlanStore.year = currentYear; cliffPlanStore.forState = state; cliffPlanStore.computed = false; };
    window.__test_cliffPlanComputes = () => cliffPlanStore.computes;
    window.__test_simulate = (...a) => (ensureTestPlan(), simulate(...a));
    window.__test_simulateHistorical = (...a) => (ensureTestPlan(), simulateHistorical(...a));
    window.__test_runHistoricalCycles = (...a) => (ensureTestPlan(), runHistoricalCycles(...a));
    window.__test_runMonteCarlo = (...a) => (ensureTestPlan(), runMonteCarlo(...a));
    // Cliff plan: one run in a given plan mode (tests and scans). rowFn: the bucket engine on that path.
    // endValue: also the ending after-tax value (afterTaxEndValueUS, priced with the run's own context: a path's own tax factors) and
    // the ending Roth / traditional / taxable balances (tests/solver_scan.js).
    window.__test_runPlanMode = ({ planMode, plan = null, rowFn = null, planTrace = false, endValue = false }) => {
      const tr = planTrace ? [] : null;
      let sim, value, estate;
      const measure = () => {
        if (!endValue) return;
        value = afterTaxEndValueUS(ctx, sim);
        const e = sim.estate;
        estate = { roth: e.roth, traditional: e.traditional, taxable: e.taxable };
      };
      // The plan options are given only with planMode (storeContext); with planMode undefined the state's plan applies.
      const ctx = storeContext({ plan, planMode, taxFactors: rowFn ? [] : null });
      if (!rowFn) {
        sim = runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: tr });
        measure();
      } else {
        const prev = histTaxFactors;
        assignHistTaxFactors(ctx.taxFactors);
        try {
          sim = runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, rowFn, ctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: tr });
          measure();
        } finally {
          assignHistTaxFactors(prev);
        }
      }
      return { rows: sim.rows, depletedAge: sim.depletedAge, intents: sim.cliffIntents || null, trace: tr, sim, ...(endValue ? { value, estate } : null) };
    };
    window.__test_yearPlanCandidates = yearPlanCandidates;
    window.__test_planStats = planStats;
    window.__test_refreshCliffPlan = () => {
      refreshCliffPlan();
      return JSON.parse(JSON.stringify({ plan: cliffPlanStore.plan, report: cliffPlanStore.report }));
    };
    window.__test_planCandidateBetter = planCandidateBetter;
    window.__test_cliffPlanSummary = (plan, report) => cliffPlanSummary(plan, report);
    window.__test_planForState = () => JSON.parse(JSON.stringify(planForState(state)));
    // Replaces state the way load / undo / reset do, without render() (the stale-plan tests).
    window.__test_replaceState = (raw) => {
      assignState(normalizeState(raw));
    };
    // The scenario comparison's own row function (defined in a shared region, in scope here).
    window.__test_scenarioMetrics = (raw) => computeScenarioMetrics(raw);
    // tests/snapshot.js's rowFnFor and mulberry32, verbatim: a year-row function for one of its SERIES entries.
    window.__test_rowFnFor = (() => {
      function mulberry32(a) {
        return function () {
          a |= 0; a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      function rowFnFor(series) {
        const wrap = (i) => HIST[((i % HIST.length) + HIST.length) % HIST.length];
        switch (series.type) {
          case 'real': {
            const i0 = series.start - HIST[0][0];
            return (y) => wrap(i0 + y);
          }
          case 'crashFirst':
            return (y) => [2000 + y, [-30, -18, -5][y] ?? 9, y < 3 ? -3 : 3, y < 3 ? 6 : 4, y < 3 ? 2 : 4.5];
          case 'sawtooth':
            return (y) => [2000 + y, y % 2 ? -15 : 25, 3, y % 2 ? 6 : 2, 4];
          case 'boom':
            return (y) => [2000 + y, 15, 2, 3, null].slice(0, 4);
          case 'flat':
            return (y) => [2000 + y, 0, 0, 0, 0];
          case 'mc': {
            const rnd = mulberry32(series.seed), B = 5, out = [];
            const maxStart = HIST.length - B;
            while (out.length < 120) {
              const s = Math.floor(rnd() * (maxStart + 1));
              for (let i = 0; i < B; i++) out.push(HIST[s + i]);
            }
            return (y) => out[y];
          }
        }
        throw new Error('unknown series ' + series.type);
      }
      return rowFnFor;
    })();
    // The standard run's end value: a store context with no tax factors (taxFactors: null), as a standard run has.
    window.__test_afterTaxEndValueUS = (sim) => afterTaxEndValueUS(storeContext({ withPlan: false }), sim);
    // The optimizer hooks keep their old signatures, (selected) / (selected, options) / (sim): the base is the store's state,
    // the context factory the UI's, the budget the store's (__test_setOptimizerBudget) and the display mode the store's.
    window.__test_optimizeRothLadderPerYear = (selected) => (ensureTestPlan(), optimizeRothLadderPerYear(selected, state, stateContextFor(), searchOptions()));
    window.__test_optimizeMultiLever = (selected, options) => (ensureTestPlan(), optimizeMultiLever(selected, state, stateContextFor(), options, searchOptions()));
    window.__test_rothScheduleCost = (sim) => (ensureTestPlan(), rothScheduleCost(sim, state, mode));
    window.__test_setOptimizerBudget = (n) => {
      optimizerState.rothPerYearEvalBudget = n;
    };
    window.__test_setRothOverride = (m) => {
      optimizerState.rothBracketByAge = m;
    };
    window.__test_setWithdrawalMixOverride = (m) => {
      optimizerState.withdrawalMixByAge = m;
    };
    window.__test_ROTH_PER_YEAR_CANDIDATES = ROTH_PER_YEAR_CANDIDATES;
    window.__test_WITHDRAWAL_MIX_CANDIDATES = WITHDRAWAL_MIX_CANDIDATES;
    window.__test_withdrawalMixWeights = withdrawalMixWeights;
    window.__test_pickLiveWithdrawalOrder = withStoreCtx(pickLiveWithdrawalOrder);
    window.__test_getState = () => state;
    window.__test_syncControls = () => syncControls();
    window.__test_accountStatuses = (c) => accountStatuses(state, c);
    window.__test_normalizeState = normalizeState;
    window.__test_children = { dependentsInYear: (y) => dependentsInYear(state, y), qualifyingChildCount: (y) => qualifyingChildCount(state, y), acaHouseholdSize: withStoreCtx(acaHouseholdSize), hasChildAtMost: (taxYear, maxAge) => hasChildAtMost(state, taxYear, maxAge) };
    window.__test_accountTrace = (retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB, hist) => {
      ensureTestPlan();
      const trace = [];
      const ctx = storeContext({ taxFactors: hist ? [] : null });
      if (hist) {
        const prevTaxFactors = histTaxFactors;
        assignHistTaxFactors(ctx.taxFactors);
        try {
          runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, hist, ctx.taxFactors), retireAgeA, retireAgeB, trace });
        } finally {
          assignHistTaxFactors(prevTaxFactors);
        }
      } else runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA, retireAgeB, trace });
      return trace;
    };
    window.__test_allocatePlanRoom = (room, amounts) => {
      const out = [];
      const left = allocatePlanRoom(room, amounts, out);
      return { out, left };
    };
    window.__test_streamAmountsForYear = (streams, ctx) => {
      const o = streamAmountsForYear(streams, ctx, STREAM_OUT);
      return {
        total: o.total, wagesA: o.wagesA, wagesB: o.wagesB, otherA: o.otherA, otherB: o.otherB,
        selfA: o.selfA, selfB: o.selfB, premiumA: o.premiumA, premiumB: o.premiumB, coverA: o.coverA, coverB: o.coverB,
        contrib: o.contrib.items.slice(0, o.contrib.n).map((it) => ({ owner: it.owner, pay: it.pay })),
      };
    };
    window.__test_lumpAmountsForYear = (lumps, ctx) => ({ ...lumpAmountsForYear(lumps, ctx, LUMP_OUT) });
    window.__test_inherited = { singleLifeFactor, inheritedDraw, inheritedLedger, afterTaxValue };
    window.__test_inhNoNeedAdj = (on) => { testHooks.testInhNoNeedAdj = !!on; };
    window.__test_inhForceExtra = (year, slot, x) => { testHooks.testInhForce = year === null ? null : { year, slot, x }; };
    window.__test_inhTakeCount = (reset) => { const n = testHooks.inhTakeCount; if (reset) testHooks.inhTakeCount = 0; return n; };
    window.__test_inhNoDrawCalls = (reset) => { const n = testHooks.inhNoDrawCalls; if (reset) testHooks.inhNoDrawCalls = 0; return n; };
    window.__test_irmaaInYearCalls = (reset) => { const n = testHooks.irmaaInYearCalls; if (reset) testHooks.irmaaInYearCalls = 0; return n; };
    window.__test_inherited.sourcesInh = () => [SOURCES_JOINT, SOURCES_SINGLE, SOURCES_A, SOURCES_B].map((s) => [s.inherited, s.inheritedA, s.inheritedB, s.inheritedExclA, s.inheritedExclB]);
    // Test-only: run fn with state patched, restoring it afterwards.
    window.__test_withState = (patch, fn) => {
      const saved = {};
      for (const k of Object.keys(patch)) saved[k] = state[k];
      Object.assign(state, patch);
      try { return fn(); } finally { Object.assign(state, saved); }
    };
    window.__test_payrollTax = withStoreCtx(payrollTax);
    window.__test_selfEmploymentTax = (se, w, y) => ({ ...selfEmploymentTax(storeContext({ withPlan: false }), se, w, y, SE_OUT) });
    window.__test_streamCoverBits = streamCoverBits;
    window.__test_seHealthDeduction = (h, a, b, two, p) => [...seHealthDeduction(h, a, b, two, p, SE_HEALTH)];
    window.__test_soloPlanContributions = (q) => {
      const P = SOLO_IN;
      for (const k of ['se', 'half', 'main', 'w2Comp', 'iraLeft']) { P[k][0] = q[k][0]; P[k][1] = q[k][1]; }
      for (let o = 0; o < 2; o++) Object.assign(P.mainPct[o], { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }, q.mainPct[o]);
      P.list = { n: q.list.length, items: q.list };
      P.rooms = JSON.parse(JSON.stringify(q.rooms));
      Object.assign(P, { annualAdditions: q.annualAdditions, compensation: q.compensation, mainRoth: !!q.mainRoth, iraPretax: !!q.iraPretax, megaOn: !!q.megaOn });
      soloPlanContributions(P, SOLO_PLAN);
      return { out: JSON.parse(JSON.stringify(SOLO_PLAN)), rooms: P.rooms };
    };
    window.__test_streamPlanContributions = (items, rooms, limits, personalPretax) => {
      const r = JSON.parse(JSON.stringify(rooms));
      streamPlanContributions({ n: items.length, items }, r, limits, personalPretax, STREAM_PLAN);
      return { out: JSON.parse(JSON.stringify(STREAM_PLAN)), rooms: r };
    };
    window.__test_retirementContributions = (patch, args) => {
      const saved = JSON.parse(JSON.stringify(state));
      try {
        Object.assign(state, patch);
        if (Array.isArray(args.streamList)) args = { ...args, streamList: { n: args.streamList.length, items: args.streamList } };
        return retirementContributions(storeContext({ withPlan: false }), args);
      } finally {
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, saved);
      }
    };
    window.__test_penalty = { penaltyStatus, incomeRoom, rule55Applies: (...a) => rule55Applies(state, ...a), rothSlotSplit, accountStatuses: (c) => accountStatuses(state, c) };
    window.__test_accounts = { accountsNew: () => accountsNew(state), accountsContribute, accountsConvert, accountsDraw, accountsClone, accountsRestore, accountBalances };
    window.__test_FIELDS = FIELDS;
    window.__test_mcpAccepts = (key, v) => mcpAccepts(FIELDS.find((f) => f.key === key), v);
    window.__test_setCurrentYear = (y) => { assignCurrentYear(y); };
    // For tests/tax_caches.js: the compiled state rules, so a test can force the per-person inputs on for every row.
    window.__test_stateRuleFor = stateRuleFor;
    window.__test_magiStats = magiStats;
    // The plan trace: without rowFn, the standard `choose` run; with it, an `apply` run of the state's plan on that path.
    window.__test_planTrace = (rowFn) => {
      const planTrace = [];
      if (!rowFn) runProjection(storeContext({ planMode: 'choose', plan: null }), { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace });
      else {
        ensureTestPlan();
        const ctx = storeContext({ planMode: 'apply', plan: cliffPlanStore.plan, taxFactors: [] });
        const prev = histTaxFactors;
        assignHistTaxFactors(ctx.taxFactors);
        try {
          runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, rowFn, ctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace });
        } finally {
          assignHistTaxFactors(prev);
        }
      }
      return planTrace;
    };
    window.__test_solver = {
      magiThresholds: (c) => magiThresholds(storeContext({ withPlan: false }), c),
      lambdaEstimate: (o) => lambdaEstimate({ ...o, ctx: storeContext({ withPlan: false }) }),
      afterTaxValue,
      returnMagis,
      takeTraditional,
      releaseMagiCap,
      fillTraditional,
      freeTraditional,
      withdrawStandard,
      magiCapLeft,
      // Raw: the tests pass it as a draw's `solver`, which the draw calls with the withdrawal's context first.
      solveTraditionalForNet,
      newTestWithdrawal: (balPatch, profile) =>
        newWithdrawal(storeContext({ withPlan: false }), {
          bal: { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0, ...balPatch },
          rothAccts: rothAccountsNew(state),
          accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
          seppActive: [false, false, false, false],
          profile,
          conversionAmount: 0,
          rmd: 0,
        }),
    };
    window.__test_qbiDeduction = withStoreCtx(qbiDeduction);
    window.__test_tax = { FILING, filingStatusFor: withStoreCtx(filingStatusFor), childCredits: withStoreCtx(childCredits), standardDeduction: withStoreCtx(standardDeduction), seniorDeduction: withStoreCtx(seniorDeduction), saltCap: withStoreCtx(saltCap), itemizedDeduction: withStoreCtx(itemizedDeduction), federalDeduction: withStoreCtx(federalDeduction), mortgageInterestShare, mortgageSchedule: withStoreCtx(mortgageSchedule), SENIOR_DEDUCTION_LAST_YEAR, acaNetCost: withStoreCtx(acaNetCost), additionalMedicareTax, irmaaSurcharge: withStoreCtx(irmaaSurcharge), irmaaTierCeiling: withStoreCtx(irmaaTierCeiling), irmaaMagiOf, magiForIrmaaLine, returnStatusA, irmaaSsOf, ordinaryTax: withStoreCtx(ordinaryTax), longTermGainTax: withStoreCtx(longTermGainTax), niitTax, taxableSocialSecurity, stateIncomeTax: withStoreCtx(stateIncomeTax), taxFor: withStoreCtx(taxFor), STATE_RULES, taxIndexFactor: (y) => taxIndexFactor(storeContext({ withPlan: false }), y) };
    window.__test_applyMultiLeverSchedule = (opt, options) => {
      ensureTestPlan();
      optimizerState.lastMultiLeverRun = { opt, options, savings: 2 };
      applyMultiLeverSchedule();
    };
    window.__test_clearAppliedMultiLeverSchedule = clearAppliedMultiLeverSchedule;
  }
