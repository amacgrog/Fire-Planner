// Test hooks shared by both planners, exposed on window

import { HIST } from '../core/projection/historical-data.js';
import { runHistoricalCycles, runMonteCarlo, simulate, simulateAtRealCagr, simulateHistorical } from '../core/projection/simulate.js';
import { refillBondReserve, rotateIntoBondLadder } from '../core/withdrawals/bond-ladder.js';
import { assignMode, assignState, mode, state } from '../core/store.js';
import { assignChartView, chartView } from '../core/chart-prefs.js';
import { compactDecisionDelta, findMinimalRetirementDelay, findMinimalSpendingCut } from '../core/analysis/decisions.js';
import { UNUSUAL_RANGES, unusualAssumptionImpact } from '../core/inputs/estimates.js';
import { assignLastSensitivity, computeSensitivity, lastSensitivity, renderTornadoChart } from './charts/tornado.js';
import { renderShortfallBanner } from './results/shortfall-banner.js';
import { renderDecisionQuestionPreviews } from './results/decision-questions.js';
import { renderUnusualAssumptions } from './results/unusual-warnings.js';
import { normalizeState } from '#country/ui/seam-normalizeState';
import { DECISION_QUESTIONS } from '#country/ui/seam-DECISION_QUESTIONS';
import { computeRothOptimizer } from '#country/ui/seam-computeRothOptimizer';
import { renderDecisionCompareTable } from '#country/core/seam-renderDecisionCompareTable';
import { analyzeShortfallDrivers } from '#country/core/seam-analyzeShortfallDrivers';
import { SENSITIVITY_LEVERS } from '#country/core/seam-SENSITIVITY_LEVERS';
import { storeContext } from '#country/core/seam-storeContext';

  // The country's part of the analysis bundle, set by the country installer (assignCountryAnalysis):
  // { renderChartView, cagrSims() } and, US only, begin(), perMode() and once(opts).
  let countryAnalysis = null;
  export function assignCountryAnalysis(parts) {
    countryAnalysis = parts;
  }
  // A JSON-safe copy: Maps (entries sorted by key, so insertion order is not a difference) and Sets become arrays,
  // functions and undefined are dropped, NaN, the infinities and -0 become strings (JSON.stringify would turn them into
  // null and 0), object keys are sorted. Non-enumerable fields are not read.
  export function analysisCanon(v) {
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isFinite(v) ? v : String(v);
    if (v instanceof Map) return [...v.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(analysisCanon);
    if (v instanceof Set) return [...v].map(analysisCanon);
    if (Array.isArray(v)) return v.map(analysisCanon);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined && typeof v[k] !== 'function') o[k] = analysisCanon(v[k]);
      return o;
    }
    return v;
  }
  export function analysisHtml(id) {
    const el = document.getElementById(id);
    return el ? { html: el.innerHTML, hidden: el.hidden } : null;
  }
  const endOf = (sim) => ({ total: sim.rows.at(-1).total, depletedAge: sim.depletedAge });
  // Everything the analysis functions compute for the current state, in the store's current display mode.
  function analysisForMode() {
    const out = {};
    out.sensitivity = computeSensitivity(simulate(), SENSITIVITY_LEVERS.map((l) => l.id));
    const decisions = {};
    for (const id of Object.keys(DECISION_QUESTIONS)) {
      const q = DECISION_QUESTIONS[id];
      if (q.kind === 'compare') {
        const { rows, ...rest } = q.run();
        decisions[id] = {
          ...rest,
          rows: rows.map(({ sim, ...r }) => ({ ...r, ...endOf(sim) })),
          table: renderDecisionCompareTable(rows),
          compact: compactDecisionDelta(rows),
        };
      } else if (q.note) decisions[id] = { note: q.note() };
    }
    out.decisions = decisions;
    out.spendingCut = findMinimalSpendingCut(simulate());
    out.retirementDelay = findMinimalRetirementDelay(simulate());
    out.shortfall = analyzeShortfallDrivers(simulate());
    out.realCagr = [2, 4, 6].map((c) => endOf(simulateAtRealCagr(c)));
    out.unusual = UNUSUAL_RANGES.filter((item) => item.id && item.min !== undefined && item.max !== undefined).map((item) => ({
      id: item.id,
      impact: unusualAssumptionImpact(item, simulate()),
    }));
    out.rothOptimizer = computeRothOptimizer(simulate());
    // The UI entry points, called the way render() calls them.
    const ui = {};
    // Reset first: a render that returned early would otherwise leave the previous call's value.
    assignLastSensitivity(null);
    renderTornadoChart(simulate());
    ui.tornado = lastSensitivity;
    if (countryAnalysis) {
      const savedView = chartView;
      countryAnalysis.resetCagrSims();
      assignChartView('cagr');
      try {
        countryAnalysis.renderChartView(simulate());
      } finally {
        assignChartView(savedView);
      }
      ui.cagr = countryAnalysis.cagrSims();
    }
    renderShortfallBanner(simulate());
    ui.shortfall = analysisHtml('shortfallBanner');
    renderDecisionQuestionPreviews();
    ui.decisions = analysisHtml('decisionQuestions');
    renderUnusualAssumptions(simulate());
    const banner = document.getElementById('unusualAssumptionsBanner');
    ui.unusual = {
      list: analysisHtml('unusualAssumptionsList'),
      banner: banner ? { hidden: banner.hidden, display: banner.style.display } : null,
    };
    out.ui = ui;
    if (countryAnalysis && countryAnalysis.perMode) out.us = countryAnalysis.perMode();
    return out;
  }
  // tests/analysis_parity.js: the analysis functions' results for the current state, in both display modes. No Monte Carlo
  // (no random path). Leaves the state, the display mode and the chart view as it found them (throws if the state changed).
  function analysisBundle(opts = {}) {
    const before = JSON.stringify(state),
      stateObj = state,
      savedMode = mode;
    if (countryAnalysis && countryAnalysis.begin) countryAnalysis.begin();
    const per = {};
    let once = null;
    try {
      for (const m of ['real', 'nominal']) {
        assignMode(m);
        per[m] = analysisForMode();
      }
      assignMode('real');
      if (countryAnalysis && countryAnalysis.once) once = countryAnalysis.once(opts);
    } finally {
      assignMode(savedMode);
    }
    if (state !== stateObj || JSON.stringify(state) !== before) throw new Error('__test_analysisBundle changed the state');
    const bundle = {};
    for (const k of Object.keys(per.real)) {
      if (k === 'us') continue;
      bundle[k] = { real: per.real[k], nominal: per.nominal[k] };
    }
    if (per.real.us) {
      bundle.us = {};
      for (const k of Object.keys(per.real.us)) bundle.us[k] = { real: per.real.us[k], nominal: per.nominal.us[k] };
      Object.assign(bundle.us, once);
    }
    return analysisCanon(bundle);
  }

  export function installSharedTestHooks() {
    // Test-only exports for test_roth_optimizer_per_year.js — specifically
    // the brute-force-cross-check test, which needs to independently drive
    // the per-year override and re-score arbitrary candidate schedules to
    // verify optimizeRothLadderPerYear() actually finds the true global
    // optimum, not just "some" answer. There's no way to construct that
    // check through the DOM alone (the UI only ever sets one flat bracket
    // across a whole window), so these mirror the same
    // window.fireProjectionRows-style precedent already used above for the
    // MCP tool hooks: a deliberate, narrow exposure of internal state for
    // tooling, not an accident to clean up. Harmless in production (no
    // user data, nothing network-reachable, purely references to functions
    // that already exist in this closure).
    window.__test_simulate = simulate;
    window.__test_simulateHistorical = simulateHistorical;
    window.__test_runHistoricalCycles = runHistoricalCycles;
    window.__test_runMonteCarlo = runMonteCarlo;
    // Old signatures: a withdrawal object without a run context gets one built from the store.
    window.__test_refillBondReserve = (wd, ...a) => refillBondReserve(wd.ctx ? wd : { ...wd, ctx: storeContext({ withPlan: false }) }, ...a);
    window.__test_rotateIntoBondLadder = (...a) => rotateIntoBondLadder(storeContext({ withPlan: false }), ...a);
    window.__test_HIST = HIST;
    // Replaces state the way load / undo / reset do, without render() (the US installer redefines it the same way).
    window.__test_replaceState = (raw) => {
      assignState(normalizeState(raw));
    };
    window.__test_analysisBundle = (opts) => analysisBundle(opts);
  }
