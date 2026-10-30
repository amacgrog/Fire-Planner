// Test hooks this planner exposes on window (US engine and plan hooks)

import { HIST } from '../../shared/core/projection/historical-data.js';
import { dependentsInYear, qualifyingChildCount } from '../../shared/core/inputs/lists.js';
import { runHistoricalCyclesFresh, runMonteCarlo, simulate, simulateFresh, simulateHistorical } from '../../shared/core/projection/simulate.js';
import { mortgageSchedule } from '../../shared/core/income/spending-and-loans.js';
import { assignState, state } from '../../shared/core/store.js';
import { taxIndexFactor } from '../../shared/core/projection/year-factors.js';
import { historicalYearSource, standardYearSource } from '../../shared/core/projection/year-sources.js';
import { computeScenarioMetrics } from '../../shared/ui/plans/scenario-comparison.js';
import { magiStats, planStats } from '../core/projection/engine-state.js';
import { afterTaxValue, yearPlanCandidates, planCandidateBetter, magiThresholds, lambdaEstimate, afterTaxEndValueUS } from '../core/cliff-plan/solver.js';
import { cliffPlanStore } from '../core/cliff-plan-store.js';
import { cliffPlanCache, cliffPlanSummary, ensureTestPlan, planForState, refreshCliffPlan } from '../core/cliff-plan/planning.js';
import { storeContext } from '../core/projection/store-context.js';
import { FILING, SENIOR_DEDUCTION_LAST_YEAR, itemizedDeduction, saltCap, seniorDeduction, mortgageInterestShare, standardDeduction, federalDeduction } from '../core/tax/federal-rules.js';
import { freeTraditional, releaseMagiCap, magiCapLeft, newWithdrawal, takeTraditional, solveTraditionalForNet, fillTraditional } from '../core/withdrawals/draws.js';
import { LUMP_OUT, lumpAmountsForYear, STREAM_OUT, streamAmountsForYear, streamCoverBits } from '../core/income/streams-and-lumps.js';
import { returnMagis, magiForIrmaaLine, irmaaSurcharge, irmaaTierCeiling, irmaaMagiOf } from '../core/healthcare/irmaa.js';
import { mcpAccepts } from '../core/inputs/field-meta.js';
import { hasChildAtMost } from '../core/healthcare/medicaid-rules.js';
import { SOURCES_A, SOURCES_B, SOURCES_JOINT, SOURCES_SINGLE, stateRuleFor, stateIncomeTax } from '../core/tax/state-tax.js';
import { singleLifeFactor } from '../core/income/distributions.js';
import { optimizerState } from '../core/optimizer-state.js';
import { allocatePlanRoom, retirementContributions, SOLO_IN, SOLO_PLAN, soloPlanContributions, STREAM_PLAN, streamPlanContributions } from '../core/income/contributions.js';
import { WITHDRAWAL_MIX_CANDIDATES, withdrawalMixWeights } from '../core/withdrawals/mix.js';
import { objectiveBreakdown, objectiveById } from '../core/optimizer/objectives.js';
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
import { syncControls } from './inputs/sync-controls.js';
import { inheritedDraw, inheritedLedger } from '../core/income/inherited.js';
import { rothAccountsNew, rothSlotSplit } from '../core/accounts/roth-ledger.js';
import { rule55Applies, penaltyStatus } from '../core/accounts/penalty-status.js';
import { assignLastCagrSims, lastCagrSims, renderChartView } from './charts/chart-view.js';
import { computeRothOptimizer } from './results/roth-optimizer.js';
import { applyStoredPlan, clearStoredPlan, planOptimizerCardState, searchPlanAndRender } from './results/plan-optimizer.js';
import { assignCountryAnalysis } from '../../shared/ui/install-test-hooks.js';

  // The US part of __test_analysisBundle (src/shared/ui/install-test-hooks.js): once per bundle, the after-tax end value on one
  // historical path. The optimizers' results (the per-year search, the multi-lever search and its card) left the bundle with
  // the old optimizer in Batch 5 step 5.
  function usAnalysisOnce() {
    const plan = planForState(state);
    const rowFn = (y) => HIST[(y + 18) % HIST.length];
    const runOn = (planMode, p) => {
      const r = window.__test_runPlanMode({ planMode, plan: p, rowFn, endValue: true });
      return { value: r.value, estate: r.estate, total: r.rows.at(-1).total, depletedAge: r.depletedAge };
    };
    const out = {
      planEndValue: { intents: plan ? Object.keys(plan.intents).length : null, apply: plan ? runOn('apply', plan) : null, off: runOn('off', null) },
    };
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
      once: usAnalysisOnce,
    });
    window.__test_simulateRaw = simulateFresh;
    window.__test_simulateHistoricalRaw = simulateHistorical;
    // Scans: run a path with no plan. The next refreshCliffPlan() re-plans (the hand-set plan is not a computed one).
    // The hand-set plan is final for its key: searched, nothing pending (ensureTestPlan keeps it).
    window.__test_setCliffPlan = (p) => { cliffPlanStore.plan = p; cliffPlanStore.key = JSON.stringify(state); cliffPlanStore.year = currentYear; cliffPlanStore.forState = state; cliffPlanStore.computed = false; cliffPlanStore.searched = true; cliffPlanStore.searchPending = false; };
    // The cliff plan's bracket search on or off (testHooks.testBracketSearchOff, default false: on). The stored plan's key, its state
    // object and the plan cache are dropped, since no key holds the switch: the next refresh or planForState re-plans.
    // Returns whether it was on before (so a test can put it back).
    window.__test_setBracketSearch = (on) => {
      const was = !testHooks.testBracketSearchOff;
      testHooks.testBracketSearchOff = !on;
      cliffPlanStore.key = null;
      cliffPlanStore.forState = null;
      cliffPlanCache.clear();
      return was;
    };
    // The cliff plan's per-year conversion sizing on or off (testHooks.testConvSizingOff, Batch 5 step 5b piece 3; default false:
    // on, as shipped since V148). As __test_setBracketSearch: the stored plan's key, its state object and the plan cache are
    // dropped, so the next refresh or planForState re-plans. Returns whether it was on before.
    window.__test_setConversionSizing = (on) => {
      const was = !testHooks.testConvSizingOff;
      testHooks.testConvSizingOff = !on;
      cliffPlanStore.key = null;
      cliffPlanStore.forState = null;
      cliffPlanCache.clear();
      return was;
    };
    // The stored plan's bracket and search status, read without refreshing.
    window.__test_cliffPlanState = () => {
      const p = cliffPlanStore.plan;
      return { bracket: p ? p.bracket : null, bracketFrom: p ? p.bracketFrom : null, searched: cliffPlanStore.searched, searchPending: cliffPlanStore.searchPending };
    };
    // The flat-bracket card's rows for the current state (computeRothOptimizer, as the open card computes them).
    window.__test_rothOptimizerCard = () => (ensureTestPlan(), computeRothOptimizer(simulate()));
    window.__test_cliffPlanComputes = () => cliffPlanStore.computes;
    window.__test_planForStateComputes = () => cliffPlanStore.stateComputes;
    window.__test_simulate = (...a) => (ensureTestPlan(), simulateFresh(...a));
    window.__test_simulateHistorical = (...a) => (ensureTestPlan(), simulateHistorical(...a));
    window.__test_runHistoricalCycles = (...a) => (ensureTestPlan(), runHistoricalCyclesFresh(...a));
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
        sim = runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, rowFn, ctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: tr });
        measure();
      }
      return { rows: sim.rows, depletedAge: sim.depletedAge, intents: sim.cliffIntents || null, orderIntents: sim.orderIntents || null, splitIntents: sim.splitIntents || null, homeDrawAge: sim.homeDrawAge, trace: tr, sim, ...(endValue ? { value, estate } : null) };
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
    // The pricing hooks (id, sim) / (sim) price a standard run with a store context without the plan. Each re-plans first.
    window.__test_objectiveScore = (id, sim) => (ensureTestPlan(), objectiveById(id).score(storeContext({ withPlan: false }), sim));
    window.__test_objectiveBreakdown = (sim) => (ensureTestPlan(), objectiveBreakdown(storeContext({ withPlan: false }), sim));
    // The two override maps (optimizerState; test-only state, nothing in the UI writes them). The plan cache's key does not hold the maps (refreshCliffPlan compares them by identity), so each setter drops
    // the stored plan's key, its state object and the plan cache, as __test_setBracketSearch does: the next refresh or planForState re-plans.
    window.__test_setRothOverride = (m) => {
      optimizerState.rothBracketByAge = m;
      cliffPlanStore.key = null;
      cliffPlanStore.forState = null;
      cliffPlanCache.clear();
    };
    window.__test_setWithdrawalMixOverride = (m) => {
      optimizerState.withdrawalMixByAge = m;
      cliffPlanStore.key = null;
      cliffPlanStore.forState = null;
      cliffPlanCache.clear();
    };
    window.__test_WITHDRAWAL_MIX_CANDIDATES = WITHDRAWAL_MIX_CANDIDATES;
    window.__test_withdrawalMixWeights = withdrawalMixWeights;
    window.__test_getState = () => state;
    window.__test_syncControls = () => syncControls();
    window.__test_accountStatuses = (c) => accountStatuses(state, c);
    window.__test_normalizeState = normalizeState;
    window.__test_children = { dependentsInYear: (y) => dependentsInYear(state, y), qualifyingChildCount: (y) => qualifyingChildCount(state, y), acaHouseholdSize: withStoreCtx(acaHouseholdSize), hasChildAtMost: (taxYear, maxAge) => hasChildAtMost(state, taxYear, maxAge) };
    window.__test_accountTrace = (retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB, hist) => {
      ensureTestPlan();
      const trace = [];
      const ctx = storeContext({ taxFactors: hist ? [] : null });
      if (hist) runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, hist, ctx.taxFactors), retireAgeA, retireAgeB, trace });
      else runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA, retireAgeB, trace });
      return trace;
    };
    window.__test_allocatePlanRoom = (room, amounts) => {
      const out = [];
      const left = allocatePlanRoom(room, amounts, out);
      return { out, left };
    };
    window.__test_streamAmountsForYear = (streams, yearCtx) => {
      const o = streamAmountsForYear(streams, yearCtx, STREAM_OUT);
      return {
        total: o.total, wagesA: o.wagesA, wagesB: o.wagesB, otherA: o.otherA, otherB: o.otherB,
        selfA: o.selfA, selfB: o.selfB, premiumA: o.premiumA, premiumB: o.premiumB, coverA: o.coverA, coverB: o.coverB,
        contrib: o.contrib.items.slice(0, o.contrib.n).map((it) => ({ owner: it.owner, pay: it.pay })),
      };
    };
    window.__test_lumpAmountsForYear = (lumps, yearCtx) => ({ ...lumpAmountsForYear(lumps, yearCtx, LUMP_OUT) });
    window.__test_inherited = { singleLifeFactor, inheritedDraw, inheritedLedger, afterTaxValue };
    window.__test_inhNoNeedAdj = (on) => { testHooks.testInhNoNeedAdj = !!on; };
    window.__test_inhForceExtra = (year, slot, x) => { testHooks.testInhForce = year === null ? null : { year, slot, x }; };
    // B5 162(l) settlement: a test-only outgoing carry added to year `year`'s settlement (year null clears it); the settlement switch.
    window.__test_seCarryAt = (year, amount) => { testHooks.testSeCarryAt = year === null ? null : { year, amount }; };
    window.__test_seNoSettle = (on) => { testHooks.testSeNoSettle = !!on; };
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
    window.__test_penalty = { penaltyStatus, rule55Applies: (...a) => rule55Applies(state, ...a), rothSlotSplit, accountStatuses: (c) => accountStatuses(state, c) };
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
        runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, rowFn, ctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace });
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
    // The plan card (Batch 5 step 4a): its search on an objective, drawn into the card (a JSON copy of the result, the rates
    // included; an optional second argument is optimizePlan's levers, e.g. { order: false, split: false }, for tests only); Apply of a result (default the card's last search; false when there is none); Clear; what the card shows.
    window.__test_optimizePlan = (objective, levers) => JSON.parse(JSON.stringify(searchPlanAndRender(objective, levers)));
    window.__test_applyStoredPlan = (result) => applyStoredPlan(result);
    window.__test_clearStoredPlan = () => clearStoredPlan();
    window.__test_planOptimizerCard = () => planOptimizerCardState();
  }
