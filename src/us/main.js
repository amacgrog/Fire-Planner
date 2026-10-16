import { state, mode, assignState, assignMode } from '../shared/core/store.js';
import { assignLogScale } from '../shared/core/chart-prefs.js';
import { histTaxFactors, assignHistTaxFactors } from '../shared/core/tax-factors.js';
import { currentYear, assignCurrentYear } from './core/tax-year.js';
import { cliffPlanStore } from './core/cliff-plan-store.js';
import { optimizerState } from './core/optimizer-state.js';
import { testHooks } from './core/test-hooks.js';
import { dependentsInYear, qualifyingChildCount } from '../shared/core/lists-and-children.js';
import { defaults } from './core/defaults.js';
import { REVEAL_BY_ID } from './core/normalize-lists.js';
import { HIST } from '../shared/core/basics.js';
import { FILING, SENIOR_DEDUCTION_LAST_YEAR } from './core/federal-deductions.js';
import { hasChildAtMost } from './core/medicaid-rules.js';
import { SE_OUT } from './core/ss-wage-base.js';
import { afterTaxValue, magiCapLeft } from './core/after-tax-value.js';
import { SE_HEALTH, seHealthDeduction } from './core/se-health.js';
import { BUCKET_MODE, STANDARD_MODE } from './core/year-modes.js';
import { planCandidateBetter } from './core/plan-candidate-better.js';
import { cliffPlanSummary } from './core/cliff-plan-summary.js';
import { syncTopbarHeight } from '../shared/ui/topbar-and-undo.js';
import { syncKeyboardInset, syncPanelMaxHeight } from '../shared/ui/sync-keyboard-inset.js';
import { mcpAccepts } from './core/mcp-schema-for.js';
import { FIELDS } from './ui/clamp-profit-sharing.js';
import { mortgageSchedule } from '../shared/core/spending-and-loans.js';
import { WITHDRAWAL_MIX_CANDIDATES, accountBalances, accountStatuses, accountsClone, accountsContribute, accountsConvert, accountsDraw, accountsNew, accountsRestore, incomeRoom, penaltyStatus, rothAccountsNew, rothSlotSplit, rule55Applies, withdrawalMixWeights } from './core/withdrawal-mix-and-roth-accounts.js';
import { itemizedDeduction, saltCap, seniorDeduction } from './core/itemized-deduction.js';
import { STATE_RULES } from './core/state-rules.js';
import { magiForIrmaaLine } from './core/magi-for-irmaa-line.js';
import { SOURCES_A, SOURCES_B, SOURCES_JOINT, SOURCES_SINGLE } from './core/new-state-sources.js';
import { niitTax, singleLifeFactor } from './core/niit-and-rmd.js';
import { irmaaSsOf, returnMagis, returnStatusA } from './core/irmaa-lookback.js';
import { acaHouseholdSize, magiStats, planStats } from './core/aca-and-magi-iteration.js';
import { mortgageInterestShare } from './core/mortgage-interest-share.js';
import { freeTraditional } from './core/free-traditional.js';
import { historicalYearSource, standardYearSource } from '../shared/core/year-sources.js';
import { taxableSocialSecurity } from './core/social-security-and-child-credits.js';
import { SOLO_IN, SOLO_PLAN, STREAM_PLAN, additionalMedicareTax, allocatePlanRoom, filingStatusFor, retirementContributions, soloPlanContributions, streamPlanContributions } from './core/payroll-and-plan-limits.js';
import { newWithdrawal, yearPlanCandidates } from './core/cliff-plan-lines.js';
import { LUMP_OUT, STREAM_OUT, inheritedDraw, inheritedLedger, lumpAmountsForYear, streamAmountsForYear, streamCoverBits } from './core/income-streams-and-lumps.js';
import { ROTH_PER_YEAR_CANDIDATES, rothScheduleCost } from './core/roth-per-year.js';
import { taxIndexFactor } from '../shared/core/year-factors-2.js';
import { acaNetCost, afterTaxEndValueUS, childCredits, federalDeduction, fillTraditional, irmaaMagiOf, irmaaSurcharge, irmaaTierCeiling, lambdaEstimate, longTermGainTax, magiThresholds, ordinaryTax, payrollTax, qbiDeduction, selfEmploymentTax, solveTraditionalForNet, standardDeduction, stateIncomeTax, stateRuleFor, takeTraditional, taxFor } from './core/standard-deduction.js';
import { releaseMagiCap } from './core/release-magi-cap.js';
import { pickLiveWithdrawalOrder } from './core/pick-live-withdrawal-order.js';
import { refreshCliffPlan } from './core/refresh-cliff-plan.js';
import { runHistoricalCycles, runMonteCarlo, simulate, simulateHistorical } from '../shared/core/monte-carlo-paths-2.js';
import { optimizeMultiLever, optimizeRothLadderPerYear } from './core/optimize-multi-lever.js';
import { ensureTestPlan } from './core/ensure-test-plan.js';
import { planForState, runProjection } from './core/run-projection.js';
import { withdrawStandard } from './core/withdraw-standard.js';
import { normalizeState } from './ui/normalize-state.js';
import { wireCategoryRail } from '../shared/ui/category-rail.js';
import { snapshotForUndo } from '../shared/ui/undo.js';
import { wireInfoBubble } from '../shared/ui/info-bubble.js';
import { wireInputGestures } from '../shared/ui/input-gestures.js';
import { installSharedTestHooks } from '../shared/ui/install-test-hooks.js';
import { loadSidebarPreference, wireSidebarCollapse } from '../shared/ui/sidebar.js';
import { wireTableFocus } from '../shared/ui/table-focus.js';
import { wireWizard, wireWizardDismiss } from '../shared/ui/wizard.js';
import { addChildrenList } from './ui/dynamic-lists.js';
import { addSocialSecurityWarnings } from './ui/unusual-warnings.js';
import { wireWizardCheckboxes } from './ui/wizard.js';
import { syncContributionControls } from '../shared/ui/sync-contribution-controls.js';
import { syncControls } from './ui/sync-controls.js';
import { dismissFirstRunBanner, hadSavedState, loadSavedState, wireFirstRunBanner } from '../shared/ui/saved-plan.js';
import { computeScenarioMetrics } from '../shared/ui/scenario-comparison.js';
import { initChartHover } from '../shared/ui/chart-hover.js';
import { wireExportButtons } from '../shared/ui/export-and-print.js';
import { wireAutosave } from '../shared/ui/autosave.js';
import { wireMobileTabs } from '../shared/ui/mobile-view.js';
import { setChartView, setMode } from '../shared/ui/chart-view-mode.js';
import { wireSensitivityCard } from '../shared/ui/tornado.js';
import { wireDecisionCard, wireDecisionQuestions } from '../shared/ui/decision-questions.js';
import { wireEstimateBadges } from '../shared/ui/estimate-badges.js';
import { wireEstimateReview } from '../shared/ui/estimate-review.js';
import { wirePlanStatusBar } from '../shared/ui/plan-status-bar.js';
import { wireSankeyAge, wireSankeyCard } from '../shared/ui/sankey.js';
import { wireUnusualWarnings } from '../shared/ui/unusual-warnings.js';
import { setMcPathCount, wireChartToolbar, wireDollarModeDropdown } from '../shared/ui/chart-toolbar.js';
import { applyMultiLeverSchedule, clearAppliedMultiLeverSchedule, wireRothOptimizerControls } from './ui/roth-optimizer-controls.js';
import { wireDisclaimerLink } from '../shared/ui/disclaimer-link.js';
import { wireDynamicListEditing } from '../shared/ui/dynamic-list-editing.js';
import { wireFieldListeners } from '../shared/ui/field-listeners.js';
import { wireFieldSearch } from '../shared/ui/field-search.js';
import { wireHeadlineTiles } from '../shared/ui/headline-tiles.js';
import { wireHousingButtons } from '../shared/ui/housing-buttons.js';
import { wireLayoutListeners } from '../shared/ui/layout.js';
import { registerMcpTools } from '../shared/ui/mcp-tools.js';
import { wireScenarios } from '../shared/ui/scenarios.js';
import { wireThemeToggle } from '../shared/ui/theme.js';
import { wireUndoButton } from '../shared/ui/undo-2.js';
import { wireWizardClose } from '../shared/ui/wizard-2.js';
import { wireChartShiftButtons, wireChartViewButtons } from './ui/chart-controls.js';
import { wireContributionButtons } from './ui/contribution-buttons.js';
import { wireFilingStatusButtons } from './ui/filing-status-buttons.js';
import { wirePensionButtons } from './ui/pension-buttons.js';
import { wireSensitivityLevers } from './ui/sensitivity.js';
(() => {
  FIELDS.forEach((f) => (f.reveals || []).forEach((r) => REVEAL_BY_ID.set(r.id, r.hidden)));
  assignState(normalizeState(null));
  loadSidebarPreference();
  loadSavedState();
  wireEstimateBadges();
  wireInfoBubble();

  wireEstimateReview();
  wireUnusualWarnings();
  addSocialSecurityWarnings();
  // Tax-parameter indexing. Brackets, deductions, FPL, IRMAA tiers and the
  // FICA wage base all index by this factor. In the deterministic projection
  // it is the steady state.inflation compounded by yearIndex; inside
  // simulateHistorical() (backtest and Monte Carlo) it is the path's own
  // cumulative CPI, so a 1970s-style inflation sequence raises the brackets
  // along with spending instead of leaving them on a 2.5% schedule.


























  // ---- end withdrawal building blocks ----




  // ---- end per-year helpers ----






  // Real-CAGR sweep: temporarily overrides the nominal investment return with
  // the nominal rate equivalent to the given real CAGR compounded on top of
  // the current inflation input, then restores it. Bond/HYSA yields and
  // retirement dates are left untouched, so this isolates sensitivity to the
  // main portfolio return assumption alone.
  // "What's driving this" shortfall analysis: when the selected projection
  // shows a depletion age, first tests "structural" single-lever changes tied
  // to a specific input (LTC off, healthcare premiums off) by temporarily
  // mutating state and re-running simulate(), then restoring state exactly —
  // same mutate/simulate/restore pattern as simulateAtRealCagr(). These













  wireAutosave();

  addChildrenList();
  wireDynamicListEditing();
  wireFieldListeners();
  wireHousingButtons();
  wireExportButtons();
  wireFieldSearch();
  wireHeadlineTiles();
  wireContributionButtons();
  wirePensionButtons();
  wireFilingStatusButtons();
  wireChartViewButtons();
  wireDollarModeDropdown();
  wireDisclaimerLink();
  wireChartToolbar();
  wireChartShiftButtons();
  // @@shared:26-setChartView begin
  wireUndoButton();
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (
      !confirm(
        "Reset all inputs to the generic example data? This clears what's saved in this browser and can't be undone — export a scenario first if you want to keep what you've entered.",
      )
    )
      return;
    snapshotForUndo('Reset to example data');
    assignState({
      ...defaults,
      loans: defaults.loans.map((l) => ({ ...l })),
      spendingTiers: defaults.spendingTiers.map((t) => ({ ...t })),
      incomeSources: defaults.incomeSources.map((t) => ({ ...t })),
      oneTimeIncome: defaults.oneTimeIncome.map((t) => ({ ...t })),
      extraExpenses: defaults.extraExpenses.map((t) => ({ ...t })),
      lumpExpenses: defaults.lumpExpenses.map((t) => ({ ...t })),
      children: defaults.children.map((t) => ({ ...t })),
    });
    assignMode('real');
    assignLogScale(false);
    document.getElementById('logScaleToggle').checked = false;
    setMcPathCount(1000);
    syncControls();
    syncContributionControls();
    setMode('real');
    setChartView('3yr');
  });
  // @@shared:26-setChartView end
  wireInputGestures();
  wirePlanStatusBar();
  wireScenarios();
  wireThemeToggle();
  wireSidebarCollapse();
  wireCategoryRail();
  wireLayoutListeners();
  wireWizardCheckboxes();
  wireWizard();
  wireWizardClose();
  wireWizardDismiss();
  wireSensitivityCard();
  wireSensitivityLevers();
  wireRothOptimizerControls();
  wireSankeyCard();
  wireDecisionCard();
  wireSankeyAge();
  wireFirstRunBanner();
  wireDecisionQuestions();
  wireMobileTabs();

  if (hadSavedState) dismissFirstRunBanner();
  syncControls();
  syncContributionControls();
  setMode(mode);
  syncTopbarHeight();
  syncPanelMaxHeight();
  syncKeyboardInset();
  initChartHover();

  wireTableFocus();

  registerMcpTools();
  installSharedTestHooks();
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
  // endValue: also the ending after-tax value (afterTaxEndValueUS, priced while a path's own tax factors are still set) and
  // the ending Roth / traditional / taxable balances (tests/solver_scan.js).
  window.__test_runPlanMode = ({ planMode, plan = null, rowFn = null, planTrace = false, endValue = false }) => {
    const tr = planTrace ? [] : null;
    let sim, value, estate;
    const measure = () => {
      if (!endValue) return;
      value = afterTaxEndValueUS(sim);
      const e = sim.estate;
      estate = { roth: e.roth, traditional: e.traditional, taxable: e.taxable };
    };
    if (!rowFn) {
      sim = runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode, plan, planTrace: tr });
      measure();
    } else {
      const prev = histTaxFactors;
      assignHistTaxFactors([]);
      try {
        sim = runProjection({ mode: BUCKET_MODE, source: historicalYearSource(rowFn), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode, plan, planTrace: tr });
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
  window.__test_planForState = () => JSON.parse(JSON.stringify(planForState()));
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
  window.__test_afterTaxEndValueUS = afterTaxEndValueUS;
  window.__test_optimizeRothLadderPerYear = (...a) => (ensureTestPlan(), optimizeRothLadderPerYear(...a));
  window.__test_optimizeMultiLever = (...a) => (ensureTestPlan(), optimizeMultiLever(...a));
  window.__test_rothScheduleCost = (...a) => (ensureTestPlan(), rothScheduleCost(...a));
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
  window.__test_pickLiveWithdrawalOrder = pickLiveWithdrawalOrder;
  window.__test_getState = () => state;
  window.__test_syncControls = () => syncControls();
  window.__test_accountStatuses = accountStatuses;
  window.__test_normalizeState = normalizeState;
  window.__test_children = { dependentsInYear, qualifyingChildCount, acaHouseholdSize, hasChildAtMost };
  window.__test_accountTrace = (retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB, hist) => {
    ensureTestPlan();
    const trace = [];
    if (hist) {
      const prevTaxFactors = histTaxFactors;
      assignHistTaxFactors([]);
      try {
        runProjection({ mode: BUCKET_MODE, source: historicalYearSource(hist), retireAgeA, retireAgeB, trace });
      } finally {
        assignHistTaxFactors(prevTaxFactors);
      }
    } else runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA, retireAgeB, trace });
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
  window.__test_payrollTax = payrollTax;
  window.__test_selfEmploymentTax = (se, w, y) => ({ ...selfEmploymentTax(se, w, y, SE_OUT) });
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
      return retirementContributions(args);
    } finally {
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, saved);
    }
  };
  window.__test_penalty = { penaltyStatus, incomeRoom, rule55Applies, rothSlotSplit, accountStatuses };
  window.__test_accounts = { accountsNew, accountsContribute, accountsConvert, accountsDraw, accountsClone, accountsRestore, accountBalances };
  window.__test_FIELDS = FIELDS;
  window.__test_mcpAccepts = (key, v) => mcpAccepts(FIELDS.find((f) => f.key === key), v);
  window.__test_setCurrentYear = (y) => { assignCurrentYear(y); };
  // For tests/tax_caches.js: the compiled state rules, so a test can force the per-person inputs on for every row.
  window.__test_stateRuleFor = stateRuleFor;
  window.__test_magiStats = magiStats;
  // The plan trace: without rowFn, the standard `choose` run; with it, an `apply` run of the state's plan on that path.
  window.__test_planTrace = (rowFn) => {
    const planTrace = [];
    if (!rowFn) runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode: 'choose', planTrace });
    else {
      ensureTestPlan();
      const prev = histTaxFactors;
      assignHistTaxFactors([]);
      try {
        runProjection({ mode: BUCKET_MODE, source: historicalYearSource(rowFn), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode: 'apply', plan: cliffPlanStore.plan, planTrace });
      } finally {
        assignHistTaxFactors(prev);
      }
    }
    return planTrace;
  };
  window.__test_solver = {
    magiThresholds,
    lambdaEstimate,
    afterTaxValue,
    returnMagis,
    takeTraditional,
    releaseMagiCap,
    fillTraditional,
    freeTraditional,
    withdrawStandard,
    magiCapLeft,
    solveTraditionalForNet,
    newTestWithdrawal: (balPatch, profile) =>
      newWithdrawal({
        bal: { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0, ...balPatch },
        rothAccts: rothAccountsNew(),
        accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
        seppActive: [false, false, false, false],
        profile,
        conversionAmount: 0,
        rmd: 0,
      }),
  };
  window.__test_qbiDeduction = qbiDeduction;
  window.__test_tax = { FILING, filingStatusFor, childCredits, standardDeduction, seniorDeduction, saltCap, itemizedDeduction, federalDeduction, mortgageInterestShare, mortgageSchedule, SENIOR_DEDUCTION_LAST_YEAR, acaNetCost, additionalMedicareTax, irmaaSurcharge, irmaaTierCeiling, irmaaMagiOf, magiForIrmaaLine, returnStatusA, irmaaSsOf, ordinaryTax, longTermGainTax, niitTax, taxableSocialSecurity, stateIncomeTax, taxFor, STATE_RULES, taxIndexFactor };
  window.__test_applyMultiLeverSchedule = (opt, options) => {
    ensureTestPlan();
    optimizerState.lastMultiLeverRun = { opt, options, savings: 2 };
    applyMultiLeverSchedule();
  };
  window.__test_clearAppliedMultiLeverSchedule = clearAppliedMultiLeverSchedule;
})();
