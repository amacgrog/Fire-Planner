import { SCENARIO_SCHEMA_VERSION } from '../shared/ui/storage.js';
import { state, mode, scenarios, compareIds, assignState, assignMode, assignScenarios } from '../shared/core/store.js';
import { logScale, chartExpanded, chartToolbarCollapsed, lastProjectionView, assignChartShiftMode, assignChartGapPartner, assignChartXAxisMode, assignLogScale, assignChartExpanded, assignChartToolbarCollapsed, assignMcPathCount } from '../shared/core/chart-prefs.js';
import { histTaxFactors, assignHistTaxFactors } from '../shared/core/tax-factors.js';
import { currentYear, assignCurrentYear } from './core/tax-year.js';
import { cliffPlanStore } from './core/cliff-plan-store.js';
import { optimizerState } from './core/optimizer-state.js';
import { testHooks } from './core/test-hooks.js';
import { LIST_MAX, dependentsInYear, qualifyingChildCount } from '../shared/core/lists-and-children.js';
import { defaults } from './core/defaults.js';
import { REVEAL_BY_ID } from './core/normalize-lists.js';
import { HIST, escapeHtml } from '../shared/core/basics.js';
import { FILING, SENIOR_DEDUCTION_LAST_YEAR } from './core/federal-deductions.js';
import { hasChildAtMost } from './core/medicaid-rules.js';
import { SE_OUT } from './core/ss-wage-base.js';
import { afterTaxValue, magiCapLeft } from './core/after-tax-value.js';
import { SE_HEALTH, seHealthDeduction } from './core/se-health.js';
import { BUCKET_MODE, STANDARD_MODE } from './core/year-modes.js';
import { planCandidateBetter } from './core/plan-candidate-better.js';
import { cliffPlanSummary } from './core/cliff-plan-summary.js';
import { updateChartXAxisButtons } from './ui/update-chart-xaxis-buttons.js';
import { updateChartGapPartnerButtons } from './ui/update-chart-gap-partner-buttons.js';
import { updateChartShiftModeButtons } from './ui/update-chart-shift-mode-buttons.js';
import { exportAllScenarios, exportScenario } from '../shared/ui/scenario-export.js';
import { isDomWired } from '../shared/core/field-wiring.js';
import { syncFieldOut } from '../shared/ui/dyn-field-html.js';
import { tryEnterLandscapeFullscreen, tryExitLandscapeFullscreen } from '../shared/ui/landscape-fullscreen.js';
import { syncTopbarHeight, undoToastBtnEl } from '../shared/ui/topbar-and-undo.js';
import { syncKeyboardInset, syncPanelMaxHeight } from '../shared/ui/sync-keyboard-inset.js';
import { wizardOverlay } from '../shared/ui/wizard-overlay.js';
import { mc } from '../shared/ui/first-run-ui.js';
import { mcpAccepts, mcpSchemaFor } from './core/mcp-schema-for.js';
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
import { cloneState } from '../shared/core/scenario-helpers.js';
import { taxableSocialSecurity } from './core/social-security-and-child-credits.js';
import { SOLO_IN, SOLO_PLAN, STREAM_PLAN, additionalMedicareTax, allocatePlanRoom, filingStatusFor, retirementContributions, soloPlanContributions, streamPlanContributions } from './core/payroll-and-plan-limits.js';
import { newWithdrawal, yearPlanCandidates } from './core/cliff-plan-lines.js';
import { LUMP_OUT, STREAM_OUT, inheritedDraw, inheritedLedger, lumpAmountsForYear, streamAmountsForYear, streamCoverBits } from './core/income-streams-and-lumps.js';
import { ROTH_PER_YEAR_CANDIDATES, rothScheduleCost } from './core/roth-per-year.js';
import { DYN } from './core/dyn.js';
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
import { activeCategory, setActiveCategory, wireCategoryRail } from '../shared/ui/category-rail.js';
import { renderMultiLeverOptimizer, renderRothPerYearOptimizer } from './ui/roth-optimizer.js';
import { hideUndoToast, snapshotForUndo, undoSnapshot } from '../shared/ui/undo.js';
import { dynApplyVisibility, renderDynList } from '../shared/ui/dynamic-lists.js';
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
import { computeScenarioMetrics, renderScenarioComparison } from '../shared/ui/scenario-comparison.js';
import { initChartHover } from '../shared/ui/chart-hover.js';
import { wireExportButtons } from '../shared/ui/export-and-print.js';
import { saveInputs, wireAutosave } from '../shared/ui/autosave.js';
import { render } from './ui/render.js';
import { setMobileView, switchToDashboardTab, wireMobileTabs } from '../shared/ui/mobile-view.js';
import { setChartView, setMode } from '../shared/ui/chart-view-mode.js';
import { renderTornadoChart, wireSensitivityCard } from '../shared/ui/tornado.js';
import { wireDecisionCard, wireDecisionQuestions } from '../shared/ui/decision-questions.js';
import { wireEstimateBadges } from '../shared/ui/estimate-badges.js';
import { wireEstimateReview } from '../shared/ui/estimate-review.js';
import { wirePlanStatusBar } from '../shared/ui/plan-status-bar.js';
import { wireSankeyAge, wireSankeyCard } from '../shared/ui/sankey.js';
import { wireUnusualWarnings } from '../shared/ui/unusual-warnings.js';
(() => {
  FIELDS.forEach((f) => (f.reveals || []).forEach((r) => REVEAL_BY_ID.set(r.id, r.hidden)));
  // @@shared:ids begin
  const syncFns = { controls: () => syncControls(), contrib: () => syncContributionControls() };
  // load-time: filters FIELDS, an imported constant; reads nothing a statement writes.
  // The update_fire_assumptions MCP tool exposes every numeric field plus each field marked
  // `mcp`, in registry order. Values of the wrong type or outside a choice's list are ignored.
  const MCP_FIELDS = FIELDS.filter((field) => field.type === 'number' || field.mcp);
  // @@shared:ids end
  assignState(normalizeState(null));
  // @@shared:02-CHART_GROUPS begin
  // load-time: reads window.matchMedia; reads nothing a statement writes.
  // Theme isn't part of state or scenarios (it's a display preference, not
  // a financial input) and, unlike state/mode below, is deliberately not
  // persisted — it just starts from the OS/browser preference each time the
  // page loads, so it always reflects whatever the person's system is set
  // to right now rather than freezing whatever it happened to be at last
  // save.
  let theme =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    render();
  }
  loadSidebarPreference();
  // @@shared:02-CHART_GROUPS end
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




  // Writes a finished optimizeMultiLever() run's schedule(s) into state so
  // simulate() (the main projection, not just this card's own re-simulation
  // above) picks them up from now on — see appliedRothSchedule/
  // appliedMixSchedule in defaults/normalizeState and the two fallback
  // reads in solveRothConversion()/the mixCandidate line. Only touches the
  // lever(s) this run actually searched; a lever left unchecked this run
  // keeps whatever was applied (or not applied) before.
  function applyMultiLeverSchedule() {
    if (!optimizerState.lastMultiLeverRun) return;
    const { opt, options } = optimizerState.lastMultiLeverRun;
    snapshotForUndo('Applied optimizer schedule');
    if (options.includeRoth) {
      state.rothConvEnabled = true;
      state.appliedRothSchedule = Object.fromEntries(opt.rothSchedule);
    }
    if (options.includeMix) {
      state.appliedMixSchedule = Object.fromEntries(opt.mixSchedule);
    }
    if (options.includeSmooth) {
      state.smoothWithdrawals = opt.smoothWithdrawals;
    }
    // Nothing left to apply from this run once it's been applied — hide
    // the button (it reappears, freshly enabled/disabled, the next time
    // Optimize produces a result) rather than leaving it sitting there
    // inviting a redundant re-click.
    document.getElementById('multiLeverApplyBtn').hidden = true;
    document.getElementById('multiLeverApplyNote').textContent = 'Applied.';
    optimizerState.lastMultiLeverRun = null;
    syncControls();
    syncContributionControls();
    render();
    saveInputs();
  }
  function clearAppliedMultiLeverSchedule(which) {
    snapshotForUndo('Cleared applied optimizer schedule');
    if (which === 'roth' || which === 'both') state.appliedRothSchedule = null;
    if (which === 'mix' || which === 'both') state.appliedMixSchedule = null;
    render();
    saveInputs();
  }









  // @@shared:21-writeStorageNow begin
  wireAutosave();

  function saveScenario() {
    const nameInput = document.getElementById('scenarioName'),
      name = (nameInput.value || '').trim() || `Scenario ${scenarios.length + 1}`;
    scenarios.push({
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      schemaVersion: SCENARIO_SCHEMA_VERSION,
      state: cloneState(state),
    });
    nameInput.value = '';
    renderScenarioList();
    renderScenarioComparison();
  }
  function loadScenario(id) {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    snapshotForUndo(`Loaded "${sc.name || 'scenario'}"`);
    assignState(normalizeState(sc.state));
    syncControls();
    syncContributionControls();
    render();
    saveInputs();
  }
  function deleteScenario(id) {
    assignScenarios(scenarios.filter((s) => s.id !== id));
    compareIds.delete(id);
    renderScenarioList();
    renderScenarioComparison();
  }
  function importScenarioFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const items = Array.isArray(parsed.scenarios) ? parsed.scenarios : [parsed];
        let added = 0;
        items.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const rawState = item.state && typeof item.state === 'object' ? item.state : item;
          scenarios.push({
            id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: item.name || 'Imported scenario',
            savedAt: item.savedAt || new Date().toISOString(),
            schemaVersion: SCENARIO_SCHEMA_VERSION,
            state: normalizeState(rawState),
          });
          added++;
        });
        if (!added) throw new Error('empty');
        renderScenarioList();
        renderScenarioComparison();
      } catch (err) {
        alert('Could not read that file as a scenario export (invalid or unrecognized JSON).');
      }
    };
    reader.readAsText(file);
  }
  function renderScenarioList() {
    const list = document.getElementById('scenarioList');
    document.getElementById('exportAllScenariosBtn').hidden = scenarios.length === 0;
    if (!scenarios.length) {
      list.innerHTML = '<p class="range-note">No saved scenarios yet.</p>';
      return;
    }
    list.innerHTML = scenarios
      .map(
        (sc) =>
          `<div style="display:flex;align-items:center;gap:6px;border-top:1px solid #edf1f5;padding:7px 0;font-size:.8rem"><label style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;cursor:pointer"><input type="checkbox" data-compare="${sc.id}" ${compareIds.has(sc.id) ? 'checked' : ''}><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(sc.name)}">${escapeHtml(sc.name)}</span></label><button type="button" class="btn-card" data-load="${sc.id}" style="padding:4px 8px">Load</button><button type="button" class="btn-card" data-export="${sc.id}" style="padding:4px 8px">Export</button><button type="button" class="btn-card" data-delete="${sc.id}" style="padding:4px 8px">Delete</button></div>`,
      )
      .join('');
    list.querySelectorAll('[data-compare]').forEach((el) =>
      el.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-compare');
        if (e.target.checked) compareIds.add(id);
        else compareIds.delete(id);
        renderScenarioComparison();
      }),
    );
    list
      .querySelectorAll('[data-load]')
      .forEach((el) =>
        el.addEventListener('click', (e) => loadScenario(e.target.getAttribute('data-load'))),
      );
    list
      .querySelectorAll('[data-export]')
      .forEach((el) =>
        el.addEventListener('click', (e) => exportScenario(e.target.getAttribute('data-export'))),
      );
    list.querySelectorAll('[data-delete]').forEach((el) =>
      el.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-delete'),
          target = scenarios.find((s) => s.id === id);
        if (
          confirm(
            `Delete scenario "${target ? target.name : 'this scenario'}"? This can't be undone (export it first if you want to keep it).`,
          )
        )
          deleteScenario(id);
      }),
    );
  }
  // @@shared:21-writeStorageNow end
  addChildrenList();
  // @@shared:23-dynFieldHtml begin
  Object.keys(DYN).forEach((name) => {
    const spec = DYN[name],
      container = document.getElementById(spec.container);
    if (!container) return;
    const apply = (el) => {
      const i = Number(el.dataset.dynI),
        f = spec.fields.find((x) => x.key === el.dataset.dynK),
        item = state[spec.key][i];
      if (!item || !f) return;
      if (f.kind === 'check') item[f.key] = el.checked;
      else if (f.kind === 'select') item[f.key] = el.value;
      else if (f.kind === 'money') item[f.key] = Number(String(el.value).replace(/[^0-9]/g, '')) || 0;
      // `blank: true`: an empty box (a number input also reports '' for partly typed invalid text) deletes the key.
      else if (f.blank && String(el.value).trim() === '') delete item[f.key];
      else {
        const n = Number(el.value) || 0;
        item[f.key] = f.int ? Math.max(0, Math.round(n)) : n;
      }
      dynApplyVisibility(name);
      render();
      saveInputs();
    };
    container.addEventListener('input', (e) => {
      if (e.target.matches('input[data-dyn-k]') && e.target.type !== 'checkbox') apply(e.target);
    });
    container.addEventListener('change', (e) => {
      if ((e.target.matches('input[data-dyn-k]') && e.target.type === 'checkbox') || e.target.matches('select[data-dyn-k]')) apply(e.target);
    });
    container.addEventListener('click', (e) => {
      const add = e.target.closest('[data-dyn-add]'),
        remove = e.target.closest('[data-dyn-remove]');
      if (add) {
        if (state[spec.key].length >= LIST_MAX) return;
        state[spec.key].push(spec.fresh());
        renderDynList(name, true);
        render();
        saveInputs();
        const rows = container.querySelectorAll('.dyn-row'),
          first = rows.length && rows[rows.length - 1].querySelector('input:not([type=checkbox])');
        if (first) first.focus();
      } else if (remove) {
        const i = Number(remove.dataset.dynRemove);
        if (!state[spec.key][i]) return;
        snapshotForUndo(`Removed ${spec.rowTitle(i).toLowerCase()}`);
        state[spec.key].splice(i, 1);
        renderDynList(name, true);
        render();
        saveInputs();
      }
    });
  });
  // @@shared:23-dynFieldHtml end
  // @@shared:24-syncContributionControls begin
  FIELDS.filter((field) => field.type === 'number').forEach((field) => {
    const id = field.key;
    document.getElementById(id).addEventListener('input', (e) => {
      state[id] = Number(
        e.target.classList.contains('money') ? e.target.value.replace(/[^0-9]/g, '') : e.target.value,
      ) || 0;
      // A real edit un-dismisses a previously-dismissed "estimated" badge,
      // regardless of what the new value is (even if it round-trips back to
      // the default) — see the "estimated field badges" note in CLAUDE.md.
      const dismissedIdx = state.dismissedEstimates.indexOf(id);
      if (dismissedIdx !== -1) state.dismissedEstimates.splice(dismissedIdx, 1);
      if (field.onInput) field.onInput();
      if (field.inlineOut) syncFieldOut(field);
      if (field.resync) syncControls();
      render();
      saveInputs();
      if (field.syncAfter === 'contrib') syncContributionControls();
    });
  });
  FIELDS.filter(isDomWired).forEach((field) => {
    document.getElementById(field.key).addEventListener('change', (e) => {
      state[field.key] =
        field.type === 'bool' ? e.target.checked : field.valueAs === 'number' ? Number(e.target.value) : e.target.value;
      field.resync.forEach((name) => syncFns[name]());
      render();
      saveInputs();
    });
  });
  document.getElementById('ownBtn').addEventListener('click', () => setTenure('own'));
  document.getElementById('rentBtn').addEventListener('click', () => setTenure('rent'));
  document.getElementById('buyLaterBtn').addEventListener('click', () => setTenure('rentThenBuy'));
  document.getElementById('buyMortgageBtn').addEventListener('click', () => {
    state.buyCash = false;
    syncControls();
    render();
    saveInputs();
  });
  document.getElementById('buyCashBtn').addEventListener('click', () => {
    state.buyCash = true;
    syncControls();
    render();
    saveInputs();
  });
  wireExportButtons();
  // Sidebar field search: highlights every field whose label matches the
  // query and force-opens whichever <details> group(s) contain it (walking
  // up through nested details, e.g. the "Spending changes" sub-group inside
  // "Household spending"). Groups opened only because of a search are
  // restored to whatever they were before, the moment the query is cleared
  // — a group already open (or one the person opened themselves mid-search)
  // is left alone either way.
  (function setupFieldSearch() {
    const input = document.getElementById('fieldSearch'),
      countEl = document.getElementById('fieldSearchCount'),
      resultsEl = document.getElementById('fieldSearchResults');
    if (!input || !resultsEl) return;
    // originalOpen is a snapshot of every <details> under .panel (top-level
    // groups and the "Spending changes" sub-group nested inside Household
    // spending) taken once, the moment a search *starts* (query goes from
    // empty to non-empty) — not incrementally per keystroke like an earlier
    // version of this did. That earlier approach only ever recorded a
    // group's state the first time a match forced it open, so a group that
    // picked up a match on an early, broader keystroke stayed force-open
    // through later, narrower keystrokes even once nothing inside it
    // mattered — group after group would accumulate open, and it read as
    // "search pops open everything." Snapshotting once up front and then
    // deriving every group's open state fresh from its match set on every
    // keystroke (below) means each keystroke's group state depends only on
    // that keystroke's matches, not on the search's history, while still
    // giving us the one true "before the search touched anything" state to
    // restore to when the box is emptied.
    let searchActive = false;
    const originalOpen = new Map();
    // Dropdown navigator state: which result (if any) is keyboard-active,
    // and the {fieldEl, label, group} entries currently rendered (every
    // match, uncapped — see runSearch() below), so click/Enter handlers can
    // resolve an index back to a real field element without re-querying
    // the DOM.
    let activeIndex = -1;
    let renderedMatches = [];
    function panelDetails() {
      return document.querySelectorAll('.panel details');
    }
    function panelFields() {
      return document.querySelectorAll('.panel .field, .panel .range-field');
    }
    // mainLabelText() pulls only a label's direct text nodes — skipping the
    // nested <small> help blurb, checkbox, and "Estimated ✓" badge child
    // elements — falling back to the full text if a field's markup doesn't
    // have a plain leading text node (shouldn't happen, but better than
    // showing nothing). This used to feed only the dropdown's display text,
    // with matching itself done separately against the full
    // label.textContent (including the <small> blurb) — deliberately broad,
    // on the theory that jargon often lives in the blurb. In practice that
    // made common words absurdly over-broad: "income" matched ~20 fields
    // because most field blurbs mention income somewhere, which defeated
    // the point of a filter meant to narrow things down. Matching now uses
    // this same direct-label text everywhere (see the isMatch line below),
    // so what's searched is exactly what's shown as a field's name — a
    // person typing "income" gets only fields actually about income, not
    // every field whose description happens to mention it in passing.
    function mainLabelText(label) {
      let text = '';
      label.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
        // A label's last word and its ⓘ button are wrapped together in a
        // no-wrap span (so the button can't wrap onto its own line) — that
        // word is still part of the field's name, the button text is not.
        else if (n.classList && n.classList.contains('info-nw'))
          n.childNodes.forEach((c) => {
            if (c.nodeType === Node.TEXT_NODE) text += c.textContent;
          });
      });
      text = text.trim();
      return text || label.textContent.trim();
    }
    // Breadcrumb = the outermost <details class="group"> a field lives
    // under (walking all the way up, not just the nearest — a field inside
    // the nested "Spending changes" sub-group should still show "Household
    // spending", not the sub-group's own plain-text summary).
    function groupBreadcrumb(fieldEl) {
      let topGroup = null,
        g = fieldEl.parentElement ? fieldEl.parentElement.closest('details.group') : null;
      while (g) {
        topGroup = g;
        g = g.parentElement ? g.parentElement.closest('details.group') : null;
      }
      if (!topGroup) return '';
      const titleEl = topGroup.querySelector(':scope > summary .group-title');
      return titleEl ? titleEl.textContent.trim() : topGroup.querySelector(':scope > summary').textContent.trim();
    }
    function hideResults() {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
      renderedMatches = [];
    }
    function setActive(idx) {
      const buttons = resultsEl.querySelectorAll('.field-search-result');
      buttons.forEach((b, i) => b.classList.toggle('active', i === idx));
      if (idx >= 0 && buttons[idx]) buttons[idx].scrollIntoView({ block: 'nearest' });
      activeIndex = idx;
    }
    // Opens every ancestor group (not just the nearest — see groupBreadcrumb
    // above), scrolls the field into the upper third of the viewport, and
    // focuses its input — the same landing spot/flash-highlight idiom
    // jumpToEstimateField() uses for the guided estimated-fields review,
    // reused here rather than re-deriving a second version of the same
    // "reveal and focus a sidebar field" logic.
    function jumpToSearchField(fieldEl) {
      // Same reset as jumpToEstimateField() — a search hit from a
      // category other than the one currently filtered would otherwise
      // be scrolled/focused inside a display:none group.
      if (typeof setActiveCategory === 'function' && activeCategory !== 'all') setActiveCategory('all');
      let g = fieldEl.parentElement ? fieldEl.parentElement.closest('details.group') : null;
      while (g) {
        if (!g.open) g.open = true;
        g = g.parentElement ? g.parentElement.closest('details.group') : null;
      }
      setMobileView('inputs');
      fieldEl.classList.add('flash-highlight');
      setTimeout(() => fieldEl.classList.remove('flash-highlight'), 2600);
      requestAnimationFrame(() => {
        const isMobile = window.matchMedia('(max-width:820px)').matches;
        const scrollEl = isMobile ? null : document.querySelector('.panel');
        const rect = fieldEl.getBoundingClientRect();
        const viewportH = isMobile ? window.innerHeight : (scrollEl ? scrollEl.clientHeight : window.innerHeight);
        const targetTop = viewportH * 0.3;
        const delta = rect.top - targetTop;
        if (isMobile || !scrollEl) window.scrollBy({ top: delta, behavior: 'smooth' });
        else scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
      });
      const focusable = fieldEl.querySelector('input,select,textarea');
      if (focusable) focusable.focus({ preventScroll: true });
    }
    // Selecting a result used to clear the search box and call endSearch()
    // — restoring every hidden field and the groups' pre-search open state
    // — before jumping to the picked field. That threw away the whole point
    // of having narrowed the list: the person picked a result specifically
    // because the filtered view made it easy to find, and a click promptly
    // put the entire unfiltered sidebar back, "negating the usefulness of
    // the search bar" (verbatim feedback). Now it only closes the dropdown
    // — the filter, the search term, and the match count all stay exactly
    // as they were, so a person can look at (or jump to) more than one
    // matching field from the same search without retyping it.
    function selectResult(fieldEl) {
      hideResults();
      jumpToSearchField(fieldEl);
    }
    function endSearch() {
      panelFields().forEach((el) => el.classList.remove('field-match', 'field-hidden'));
      if (searchActive) {
        originalOpen.forEach((wasOpen, details) => {
          details.open = wasOpen;
        });
        originalOpen.clear();
        searchActive = false;
      }
      countEl.hidden = true;
      hideResults();
    }
    // The dropdown navigator is desktop-only. On a phone it used to render
    // as a box up to 50vh tall directly over the very fields it had just
    // finished filtering down — with the on-screen keyboard open, that
    // could be most of the visible viewport, hiding the simplified list a
    // person could otherwise just scroll straight through. The filter
    // itself (field-match/field-hidden below) is the part that was already
    // great and needs no dropdown to be useful on a small screen: narrowing
    // 100+ fields down to a handful is enough on its own to scan directly.
    function isMobileSearch() {
      return window.matchMedia('(max-width:820px)').matches;
    }
    function runSearch() {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        endSearch();
        return;
      }
      if (!searchActive) {
        panelDetails().forEach((d) => {
          if (!originalOpen.has(d)) originalOpen.set(d, d.open);
        });
        searchActive = true;
      }
      // Gather each field's own name and section once, up front, so both
      // matching passes below read the same data without re-querying the
      // DOM or re-deriving text twice.
      const fieldInfo = Array.from(panelFields()).map((fieldEl) => {
        const label = fieldEl.querySelector('label');
        return {
          fieldEl,
          name: label ? mainLabelText(label) : '',
          group: groupBreadcrumb(fieldEl),
        };
      });
      // Pass 1: match against the field's own name only (not the full
      // label.textContent a field's <small> blurb and "Estimated ✓" badge
      // also live inside) — that used to make a common word like "income"
      // match every field whose *description* merely mentioned it in
      // passing (~20 fields), which defeated the point of a filter meant
      // to narrow things down to what someone is actually looking for.
      const directSet = new Set(fieldInfo.filter((info) => info.name.toLowerCase().includes(q)));
      // Pass 1.5: also union in every field whose top-level group/section
      // title *exactly* matches the query (not merely contains it) — this
      // runs unconditionally, not just when pass 1 finds nothing. A query
      // naming a whole section precisely ("assets", "other loans") should
      // pull in that entire section even when one of its fields *also*
      // happens to match by name directly, rather than only kicking in on a
      // literal zero: "other loans" without this pass would match only the
      // one field literally titled "Model other loans" and stop there,
      // missing all 25 of the actual per-loan fields (original principal,
      // remaining balance, interest rate, term, extra principal — none of
      // which say "other loans" in their own label) that are exactly what
      // someone searching "other loans" is looking for. Requiring an
      // *exact* title match (not a
      // substring) is what keeps this from reintroducing the over-broad
      // matching pass 1 exists to avoid: "income" doesn't exactly equal
      // "Retirement income & healthcare" (a compound title that's mostly
      // Social Security/pensions/healthcare, not income specifically), so
      // that section is never pulled in wholesale just because the word
      // "income" happens to appear inside its name — it only fires for a
      // section actually *named* the query, like the "Income" group itself
      // (whose few fields already match directly anyway) or "Housing".
      const exactSectionSet = new Set(fieldInfo.filter((info) => info.group.trim().toLowerCase() === q));
      let matchList = fieldInfo.filter((info) => directSet.has(info) || exactSectionSet.has(info));
      // Pass 2 (fallback, only when passes 1 and 1.5 together come back
      // empty): match against the field's own top-level group/section
      // title as a *substring* instead of requiring an exact title match.
      // Covers a section-level query that isn't quite the section's exact
      // name (plural/wording mismatch, etc.) when nothing else matched at
      // all — a looser bar than pass 1.5, but only reached once there's
      // nothing to lose by widening it.
      if (matchList.length === 0) {
        matchList = fieldInfo.filter((info) => info.group.toLowerCase().includes(q));
      }
      const matches = matchList.length;
      fieldInfo.forEach((info) => {
        const isMatch = matchList.includes(info);
        info.fieldEl.classList.toggle('field-match', isMatch);
        // Filters the sidebar down to just the matching fields (rather than
        // only opening their groups) — with 100+ fields across a couple
        // dozen groups, opening every group that has *a* match still left
        // a lot of irrelevant fields to scan past to find the one you
        // wanted.
        info.fieldEl.classList.toggle('field-hidden', !isMatch);
      });
      const firstMatch = matchList.length ? matchList[0].fieldEl : null;
      // A group's open state during search is derived fresh from whether it
      // currently contains a match — including a group that was already
      // open before searching, which now collapses too if this keystroke's
      // query no longer matches anything inside it, consistent with hiding
      // that same content everywhere else. querySelector() looks at every
      // descendant regardless of depth, so this also correctly opens an
      // outer group purely because its nested sub-group has a match.
      panelDetails().forEach((d) => {
        d.open = d.querySelector('.field-match') !== null;
      });
      countEl.hidden = false;
      countEl.textContent = matches ? `${matches} match${matches === 1 ? '' : 'es'}` : 'No matches';
      // Dropdown navigator: a settings-navigator layer on top of the
      // existing filter — lets someone jump straight to a specific matching
      // field (open its group, scroll to it, focus it) instead of having to
      // scan the filtered sidebar for it, most valuable once a query
      // matches several fields spread across different groups. Desktop
      // only — see isMobileSearch() above. Every match is rendered (no
      // arbitrary cap) — the dropdown itself scrolls (see its own
      // max-height/overflow-y CSS), and a person searching a whole section
      // ("income," "assets") has no obvious next word to type that would
      // narrow a list that's already exactly what they were looking for,
      // so there's no "+N more — keep typing" prompt any more either.
      renderedMatches = matchList.map((m) => ({ fieldEl: m.fieldEl, label: m.name, group: m.group }));
      activeIndex = -1;
      if (matchList.length === 0 || isMobileSearch()) {
        hideResults();
      } else {
        resultsEl.innerHTML = renderedMatches
          .map(
            (m, i) =>
              `<button type="button" class="field-search-result" data-idx="${i}" role="option"><span class="fsr-label">${escapeHtml(m.label)}</span>${
                m.group ? `<span class="fsr-group">${escapeHtml(m.group)}</span>` : ''
              }</button>`,
          )
          .join('');
        resultsEl.querySelectorAll('.field-search-result').forEach((btn, i) => {
          btn.addEventListener('click', () => selectResult(renderedMatches[i].fieldEl));
        });
        resultsEl.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }
      if (firstMatch) firstMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    input.addEventListener('input', runSearch);
    // Re-show the dropdown when the search box regains focus with a query
    // still in it (e.g. after picking a result, which no longer clears the
    // query — see selectResult() above) rather than leaving someone unable
    // to get back to the list of matches without retyping the whole query.
    input.addEventListener('focus', () => {
      if (input.value.trim() && !isMobileSearch()) runSearch();
    });
    input.addEventListener('keydown', (e) => {
      const buttons = resultsEl.querySelectorAll('.field-search-result');
      if (e.key === 'Escape') {
        input.value = '';
        endSearch();
        input.blur();
      } else if (e.key === 'ArrowDown' && buttons.length) {
        e.preventDefault();
        setActive(activeIndex < buttons.length - 1 ? activeIndex + 1 : 0);
      } else if (e.key === 'ArrowUp' && buttons.length) {
        e.preventDefault();
        setActive(activeIndex > 0 ? activeIndex - 1 : buttons.length - 1);
      } else if (e.key === 'Enter' && buttons.length) {
        e.preventDefault();
        buttons[activeIndex >= 0 ? activeIndex : 0].click();
      }
    });
    // Closing the dropdown on blur needs to not race a click on one of its
    // own result buttons: a mousedown on a <button> moves focus to it before
    // its click event fires, so the resulting focusout's relatedTarget is
    // that button — checking resultsEl.contains(relatedTarget) lets the
    // click complete normally instead of the dropdown disappearing out from
    // under it. Clicking anywhere else (a sidebar field, blank space) hides
    // the dropdown but leaves the filter/highlight state as-is, same as any
    // ordinary search-suggestions popover.
    input.addEventListener('focusout', (e) => {
      if (resultsEl.contains(e.relatedTarget)) return;
      hideResults();
    });
  })();
  // Stack the four headline tiles 2x2 as soon as they would get cramped (a
  // width-based check on the tiles' own row, not the window, because the
  // sidebar eats a variable share of the viewport).
  (() => {
    const row = document.querySelector('.metrics-primary');
    if (!row || !window.ResizeObserver) return;
    new ResizeObserver(() => row.classList.toggle('two-col', row.getBoundingClientRect().width < 1000)).observe(row);
  })();
  // Safe-withdrawal-rate boxes on the FI / retirement-number tiles: two inputs,
  // one state value (state.fiWithdrawalRate), kept in sync by syncControls().
  document.querySelectorAll('.swr-input').forEach((input) => {
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v) || v < 0.5 || v > 15) return;
      state.fiWithdrawalRate = v;
      document.querySelectorAll('.swr-input').forEach((o) => {
        if (o !== input) o.value = String(v);
      });
      render();
      saveInputs();
    });
    input.addEventListener('blur', () => {
      input.value = String(state.fiWithdrawalRate);
    });
  });
  function setTenure(tenure) {
    state.tenure = tenure;
    syncControls();
    render();
    saveInputs();
  }
  // @@shared:24-syncContributionControls end
  function setContributionType(key, value) {
    state[key] = value;
    syncControls();
    render();
    saveInputs();
  }
  for (const [id, key, value] of [['incomeKindAWagesBtn', 'incomeKindA', 'wages'], ['incomeKindASelfBtn', 'incomeKindA', 'self'], ['incomeKindBWagesBtn', 'incomeKindB', 'wages'], ['incomeKindBSelfBtn', 'incomeKindB', 'self']])
    document.getElementById(id).addEventListener('click', () => setContributionType(key, value));
  document
    .getElementById('k401TraditionalBtn')
    .addEventListener('click', () => setContributionType('k401Type', 'traditional'));
  document
    .getElementById('k401RothBtn')
    .addEventListener('click', () => setContributionType('k401Type', 'roth'));
  document
    .getElementById('iraTraditionalBtn')
    .addEventListener('click', () => setContributionType('iraType', 'traditional'));
  document
    .getElementById('iraRothBtn')
    .addEventListener('click', () => setContributionType('iraType', 'roth'));
  function setPensionCoverage(value) {
    state.pensionCoverage = value;
    syncControls();
    render();
    saveInputs();
  }
  document
    .getElementById('pensionNoneBtn')
    .addEventListener('click', () => setPensionCoverage('none'));
  document.getElementById('pensionABtn').addEventListener('click', () => setPensionCoverage('a'));
  document.getElementById('pensionBBtn').addEventListener('click', () => setPensionCoverage('b'));
  document
    .getElementById('pensionBothBtn')
    .addEventListener('click', () => setPensionCoverage('both'));
  function setFilingStatus(value) {
    state.filingStatus = value;
    syncControls();
    render();
    saveInputs();
  }
  document.getElementById('mfjBtn').addEventListener('click', () => setFilingStatus('mfj'));
  document.getElementById('singleBtn').addEventListener('click', () => setFilingStatus('single'));
  document.getElementById('realBtn').addEventListener('click', () => setMode('real'));
  document.getElementById('nominalBtn').addEventListener('click', () => setMode('nominal'));
  document.getElementById('chartView3Btn').addEventListener('click', () => setChartView('3yr'));
  document.getElementById('chartView1Btn').addEventListener('click', () => setChartView('1yr'));
  document.getElementById('chartViewCagrBtn').addEventListener('click', () => setChartView('cagr'));
  document.getElementById('chartGroupProjectionBtn').addEventListener('click', () => setChartView(lastProjectionView));
  document.getElementById('chartGroupHistBtn').addEventListener('click', () => setChartView('hist'));
  document.getElementById('chartGroupMcBtn').addEventListener('click', () => setChartView('mc'));
  // @@shared:25-setMcPathCount begin
  (function setupDollarModeDropdown() {
    const dd = document.getElementById('dollarModeDd'),
      btn = document.getElementById('dollarModeBtn'),
      panel = document.getElementById('dollarModePanel');
    function closePanel() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', (e) => {
      if (!dd.contains(e.target)) closePanel();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
    document.getElementById('realBtn').addEventListener('click', closePanel);
    document.getElementById('nominalBtn').addEventListener('click', closePanel);
  })();
  document.getElementById('disclaimerLinkBtn').addEventListener('click', () => {
    const card = document.getElementById('methodologyCard');
    switchToDashboardTab();
    card.open = true;
    requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const callout = document.getElementById('limitationsCallout');
      callout.classList.add('flash-highlight');
      setTimeout(() => callout.classList.remove('flash-highlight'), 2600);
    });
  });
  function setMcPathCount(n) {
    assignMcPathCount(n);
    [
      ['mcPaths500Btn', 500],
      ['mcPaths1000Btn', 1000],
      ['mcPaths2000Btn', 2000],
    ].forEach(([id, value]) => {
      const active = value === n;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    render();
  }
  document.getElementById('mcPaths500Btn').addEventListener('click', () => setMcPathCount(500));
  document.getElementById('mcPaths1000Btn').addEventListener('click', () => setMcPathCount(1000));
  document.getElementById('mcPaths2000Btn').addEventListener('click', () => setMcPathCount(2000));
  document.getElementById('logScaleToggle').addEventListener('change', (e) => {
    assignLogScale(e.target.checked);
    render();
  });
  function setChartExpanded(next) {
    assignChartExpanded(next);
    document.getElementById('mainChartCard').classList.toggle('chart-expanded', next);
    document.body.classList.toggle('chart-scroll-locked', next);
    if (next) tryEnterLandscapeFullscreen();
    else tryExitLandscapeFullscreen();
    // See chartToolbarCollapsed's declaration: never leave the toolbar
    // stuck collapsed with no visible button to bring it back once we're
    // off a context (expanded, or narrow/mobile) where that button shows.
    if (!next) setChartToolbarCollapsed(false);
    // The canvas is sized from its own bounding box on every renderChart()
    // call (see the "Mobile layout" note in CLAUDE.md on this same
    // pattern for the Dashboard tab switch), so entering/leaving the
    // overlay just needs another render() once the CSS transition has
    // actually resized the box — a microtask via requestAnimationFrame,
    // not immediately synchronously, since the class toggle above hasn't
    // been painted yet at this point in the same call stack.
    requestAnimationFrame(() => requestAnimationFrame(render));
  }
  function setChartToolbarCollapsed(next) {
    assignChartToolbarCollapsed(next);
    const btn = document.getElementById('chartToolbarToggleBtn');
    document.getElementById('mainChartCard').classList.toggle('chart-toolbar-collapsed', next);
    btn.textContent = next ? '⌄' : '⌃';
    btn.setAttribute('aria-label', next ? 'Show chart options' : 'Hide chart options');
    btn.title = next ? 'Show chart options' : 'Hide chart options';
    // Same resize reasoning as setChartExpanded() above — collapsing the
    // toolbar can grow the canvas (while expanded, chart-wrap is flex:1).
    requestAnimationFrame(() => requestAnimationFrame(render));
  }
  document.getElementById('chartExpandBtn').addEventListener('click', () => setChartExpanded(true));
  document.getElementById('chartCollapseBtn').addEventListener('click', () => setChartExpanded(false));
  document.getElementById('chartToolbarToggleBtn').addEventListener('click', () => setChartToolbarCollapsed(!chartToolbarCollapsed));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartExpanded) setChartExpanded(false);
  });
  // If the browser's real Fullscreen mode (entered opportunistically by
  // tryEnterLandscapeFullscreen above) is exited some other way — the
  // system back gesture, a hardware Escape outside this page's own
  // listener, browser chrome — bring the CSS overlay state back in sync
  // rather than leaving a "collapsed fullscreen but still expanded
  // overlay" mismatch.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && chartExpanded) setChartExpanded(false);
  });
  // @@shared:25-setMcPathCount end
  function setChartShiftMode(next) {
    assignChartShiftMode(next);
    updateChartShiftModeButtons();
    render();
  }
  document.getElementById('chartShiftTogetherBtn').addEventListener('click', () => setChartShiftMode('together'));
  document.getElementById('chartShiftGapBtn').addEventListener('click', () => {
    if (!document.getElementById('chartShiftGapBtn').disabled) setChartShiftMode('gap');
  });
  function setChartGapPartner(next) {
    assignChartGapPartner(next);
    updateChartGapPartnerButtons();
    render();
  }
  document.getElementById('chartGapPartnerABtn').addEventListener('click', () => setChartGapPartner('A'));
  document.getElementById('chartGapPartnerBBtn').addEventListener('click', () => setChartGapPartner('B'));
  function setChartXAxisMode(next) {
    assignChartXAxisMode(next);
    updateChartXAxisButtons();
    render();
  }
  document.getElementById('chartXAxisAgeABtn').addEventListener('click', () => setChartXAxisMode('ageA'));
  document.getElementById('chartXAxisAgeBBtn').addEventListener('click', () => setChartXAxisMode('ageB'));
  document.getElementById('chartXAxisYearBtn').addEventListener('click', () => setChartXAxisMode('year'));
  // @@shared:26-setChartView begin
  if (undoToastBtnEl) {
    undoToastBtnEl.addEventListener('click', () => {
      if (!undoSnapshot) return;
      assignState(undoSnapshot.state);
      assignMode(undoSnapshot.mode);
      assignLogScale(undoSnapshot.logScale);
      document.getElementById('logScaleToggle').checked = logScale;
      syncControls();
      syncContributionControls();
      setMode(mode);
      render();
      saveInputs();
      hideUndoToast();
    });
  }
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
  // @@shared:27-syncKeyboardInset begin
  wireInputGestures();
  wirePlanStatusBar();
  document.getElementById('saveScenarioBtn').addEventListener('click', saveScenario);
  document.getElementById('scenarioName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveScenario();
    }
  });
  document
    .getElementById('importScenarioBtn')
    .addEventListener('click', () => document.getElementById('importScenarioInput').click());
  document.getElementById('importScenarioInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      importScenarioFile(f);
      dismissFirstRunBanner();
    }
    e.target.value = '';
  });
  document.getElementById('exportAllScenariosBtn').addEventListener('click', exportAllScenarios);
  renderScenarioList();
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme();
  });
  applyTheme();
  wireSidebarCollapse();
  wireCategoryRail();
  // Charts measure their canvas via getBoundingClientRect(), which is only
  // correct once .workspace's grid-template-columns transition has
  // actually finished (same reasoning as the chart-expand feature's
  // double-rAF re-render) — re-render once that transition ends rather
  // than mid-animation, so the main/tornado/overlay/Sankey charts end up
  // sized to the panel's new (or restored) width, not its old one.
  document.getElementById('workspace').addEventListener('transitionend', (e) => {
    if (e.propertyName === 'grid-template-columns') {
      render();
      syncTopbarHeight();
      syncPanelMaxHeight();
    }
  });
  window.addEventListener('resize', () => {
    render();
    syncTopbarHeight();
    syncPanelMaxHeight();
    // Re-applies the current category filter against the new width's
    // isDesktop check — on mobile this always shows every group
    // (setActiveCategory's own isDesktop guard), so a filter chosen on
    // desktop can never strand a resized-down mobile view with groups
    // hidden and no rail visible to unhide them, and resizing back up
    // restores that same filter rather than silently forgetting it.
    setActiveCategory(activeCategory);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncKeyboardInset);
    window.visualViewport.addEventListener('scroll', syncKeyboardInset);
  }
  // @@shared:27-syncKeyboardInset end
  wireWizardCheckboxes();
  // @@shared:28-wizardOverlay begin
  wireWizard();
  document.getElementById('wizardCloseBtn').addEventListener('click', () => {
    wizardOverlay.classList.remove('open');
    // "What's visible after the wizard is done" should be the plan itself,
    // not the input form they just finished with — on mobile, that means
    // landing on the Dashboard tab (harmless to call on desktop too, where
    // setMobileView has no visible effect; see the CSS note above).
    setMobileView('dashboard');
  });
  wireWizardDismiss();
  wireSensitivityCard();
  // @@shared:28-wizardOverlay end
  // Which levers are checked isn't part of `state` (it's a display choice
  // for this chart, not a plan input, so it doesn't persist across reloads
  // or get saved into exported scenarios) — just re-render the tornado chart
  // directly rather than a full render().
  document.getElementById('sensLeverToggles').addEventListener('change', () => {
    if (document.getElementById('sensitivityCard').open) renderTornadoChart(simulate());
  });
  document.getElementById('rothOptimizerCard').addEventListener('toggle', (e) => {
    if (e.target.open) render();
  });
  // Deliberately not wired into render()/the toggle listener above — this
  // can take a few seconds on a wide ladder window (see
  // ROTH_PER_YEAR_MAX_WINDOW/ROTH_PER_YEAR_EVAL_BUDGET), so it only runs
  // when explicitly asked for, not on every render() pass or card-open.
  document.getElementById('rothPerYearOptimizeBtn').addEventListener('click', (e) => {
    const btn = e.target;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Optimizing…';
    // Yield one frame so the browser actually paints the disabled/
    // "Optimizing…" state before the synchronous coordinate-ascent loop
    // blocks the main thread — without this the label swap and the
    // blocking computation land in the same paint cycle and the button
    // visually never changes until it's already done.
    requestAnimationFrame(() => {
      setTimeout(() => {
        renderRothPerYearOptimizer(simulate());
        btn.disabled = false;
        btn.textContent = originalLabel;
      }, 0);
    });
  });
  document.getElementById('multiLeverOptimizeBtn').addEventListener('click', (e) => {
    const options = {
      includeRoth: document.getElementById('mlRothLever').checked,
      includeMix: document.getElementById('mlMixLever').checked,
      includeSmooth: document.getElementById('mlSmoothLever').checked,
    };
    const noteEl = document.getElementById('multiLeverNoLeversNote');
    if (!options.includeRoth && !options.includeMix && !options.includeSmooth) {
      noteEl.hidden = false;
      document.getElementById('multiLeverResult').hidden = true;
      document.getElementById('multiLeverApplyBtn').hidden = true;
      document.getElementById('multiLeverApplyNote').textContent = '';
      return;
    }
    noteEl.hidden = true;
    const btn = e.target;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Optimizing…';
    // Same paint-before-block yield as the per-year Roth optimizer above —
    // this run can cost noticeably more (up to 3 active levers × up to 5
    // structured starts × coordinate-ascent passes), so the button state
    // needs to actually be visible before the main thread blocks.
    requestAnimationFrame(() => {
      setTimeout(() => {
        renderMultiLeverOptimizer(simulate(), options);
        btn.disabled = false;
        btn.textContent = originalLabel;
      }, 0);
    });
  });
  document.getElementById('multiLeverApplyBtn').addEventListener('click', () => {
    applyMultiLeverSchedule();
  });
  document.getElementById('multiLeverAppliedStatus').addEventListener('click', (e) => {
    const which = e.target.getAttribute('data-clear-applied');
    if (which) clearAppliedMultiLeverSchedule(which);
  });
  // @@shared:29-dismissFirstRunBanner begin
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

  if (mc?.registerTool) {
    mc.registerTool({
      name: 'update_fire_assumptions',
      title: 'Update FIRE assumptions',
      description:
        'Update one or more FIRE projection assumptions and refresh the visible forecast.',
      inputSchema: {
        type: 'object',
        properties: Object.fromEntries(MCP_FIELDS.map((field) => [field.key, mcpSchemaFor(field)])),
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        for (const [k, v] of Object.entries(input || {})) {
          const field = MCP_FIELDS.find((f) => f.key === k);
          if (field && mcpAccepts(field, v)) state[k] = v;
        }
        state.retireAgeA = Math.min(70, Math.max(state.retireAgeA, state.ageA));
        state.retireAgeB = Math.min(70, Math.max(state.retireAgeB, state.ageB));
        syncControls();
        syncContributionControls();
        render();
        saveInputs();
        return window.fireProjection;
      },
    });
    mc.registerTool({
      name: 'read_fire_projection',
      title: 'Read FIRE projection',
      description: 'Read the currently displayed headline projection results.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => window.fireProjection,
    });
  }
  // @@shared:29-dismissFirstRunBanner end
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
