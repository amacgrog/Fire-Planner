import { storageKey, legacyStorageKey, storage, SCENARIO_SCHEMA_VERSION } from '../shared/ui/storage.js';
import { state, mode, scenarios, compareIds, assignState, assignMode, assignScenarios } from '../shared/core/store.js';
import { chartView, chartShiftMode, chartGapPartner, logScale, chartExpanded, chartToolbarCollapsed, mcPathCount, lastProjectionView, assignChartView, assignChartShiftMode, assignChartGapPartner, assignChartXAxisMode, assignLogScale, assignChartExpanded, assignChartToolbarCollapsed, assignMcPathCount, assignLastProjectionView } from '../shared/core/chart-prefs.js';
import { histTaxFactors, assignHistTaxFactors } from '../shared/core/tax-factors.js';
import { currentYear, assignCurrentYear } from './core/tax-year.js';
import { cliffPlanStore } from './core/cliff-plan-store.js';
import { optimizerState } from './core/optimizer-state.js';
import { testHooks } from './core/test-hooks.js';
import { CHILD_BIRTH_YEAR_MAX, CHILD_BIRTH_YEAR_MIN, LIST_MAX, dependentsInYear, qualifyingChildCount } from '../shared/core/lists-and-children.js';
import { defaults } from './core/defaults.js';
import { REVEAL_BY_ID, normalizeUsLumps, normalizeUsStreams, revealHidden } from './core/normalize-lists.js';
import { compact, money } from '../shared/core/money-format.js';
import { ESTIMATE_ALWAYS_IDS, ESTIMATE_GATED_GROUPS } from './core/estimate-always-ids.js';
import { UNUSUAL_RANGES, computeUnusualAssumptions } from '../shared/core/estimates-and-warnings.js';
import { SS_EARNINGS_TEST_2026, fraText, ssBeforeRetirementCase } from './core/ss-earnings-test.js';
import { HIST, escapeHtml, paychecksPerYear, pct } from '../shared/core/basics.js';
import { FILING, SENIOR_DEDUCTION_LAST_YEAR, filingRow, taxYearOf } from './core/federal-deductions.js';
import { hasChildAtMost } from './core/medicaid-rules.js';
import { SE_OUT } from './core/ss-wage-base.js';
import { irmaaAppealKind, irmaaAppealTable } from './core/irmaa-appeal-table.js';
import { NO_THRESHOLDS, REACH_GROSS_UP } from './core/solver-lambda-mult.js';
import { hasPenalizedMoney, rothFreeCaps, tradGroup } from './core/trad-group.js';
import { afterTaxValue, magiCapLeft } from './core/after-tax-value.js';
import { takeCash, takeHomeEquity } from '../shared/core/take-cash.js';
import { SE_HEALTH, seHealthDeduction } from './core/se-health.js';
import { guardrailSpendingMultiplier, mortgageResultAges, newGuardrails, recordGuardrailWithdrawal } from '../shared/core/next-guardrail-multiplier.js';
import { loanPaymentForYear } from '../shared/core/loan-payment-for-year.js';
import { pensionIncome } from '../shared/core/pension-income.js';
import { planBondLadder } from '../shared/core/bond-ladder.js';
import { BUCKET_MODE, STANDARD_MODE, routeSurplus } from './core/year-modes.js';
import { sweepExcessCash } from '../shared/core/sweep-excess-cash.js';
import { planCandidateBetter } from './core/plan-candidate-better.js';
import { cliffPlanSummary } from './core/cliff-plan-summary.js';
import { renderMultiLeverAppliedStatus } from './ui/render-multi-lever-applied-status.js';
import { updateChartXAxisButtons } from './ui/update-chart-xaxis-buttons.js';
import { chartAxisColor, chartGridColor, chartZeroLineColor, isDarkTheme } from '../shared/ui/chart-colors.js';
import { layoutSankeyColumn, sankeyRibbonPath } from '../shared/core/sankey-layout.js';
import { cagrColors } from '../shared/core/simulate-at-real-cagr.js';
import { updateChartGapPartnerButtons } from './ui/update-chart-gap-partner-buttons.js';
import { updateChartShiftModeButtons } from './ui/update-chart-shift-mode-buttons.js';
import { chartHoverEnabled } from '../shared/core/chart-hover.js';
import { exportAllScenarios, exportScenario } from '../shared/ui/scenario-export.js';
import { isDomWired } from '../shared/core/field-wiring.js';
import { syncFieldDom } from '../shared/ui/field-wiring.js';
import { syncFieldOut } from '../shared/ui/dyn-field-html.js';
import { tryEnterLandscapeFullscreen, tryExitLandscapeFullscreen } from '../shared/ui/landscape-fullscreen.js';
import { CHART_GROUPS } from '../shared/core/chart-groups.js';
import { syncTopbarHeight, undoToastBtnEl } from '../shared/ui/topbar-and-undo.js';
import { syncKeyboardInset, syncPanelMaxHeight } from '../shared/ui/sync-keyboard-inset.js';
import { syncPlanStatusOffsets } from '../shared/ui/sync-plan-status-offsets.js';
import { wizardOverlay, wizardSteps } from '../shared/ui/wizard-overlay.js';
import { makeTableWrapsFocusable, mc } from '../shared/ui/first-run-ui.js';
import { mcpAccepts, mcpSchemaFor } from './core/mcp-schema-for.js';
import { FIELDS } from './ui/clamp-profit-sharing.js';
import { infoBubble, markUnusualFields } from '../shared/ui/estimates-and-warnings.js';
import { CURRENT_YEAR, baseSpendingNominal, displayValue, fiMultiple, futureHomePurchase, loanSchedules, mortgageSchedule, xAxisLabel } from '../shared/core/spending-and-loans.js';
import { WITHDRAWAL_MIX_CANDIDATES, accountBalances, accountStatuses, accountsClone, accountsContribute, accountsConvert, accountsDraw, accountsDrawGroup, accountsDrawSlots, accountsNew, accountsOwnerShareA, accountsRestore, incomeRoom, openingAccounts, penaltyStatus, retirementTotal, rothAccountsClone, rothAccountsContribute, rothAccountsNew, rothAccountsRestore, rothAccountsSeason, rothSlotSplit, rule55Applies, sumSlots, withdrawalMixWeights } from './core/withdrawal-mix-and-roth-accounts.js';
import { getBondYears, medicalGrowth } from '../shared/core/year-factors.js';
import { itemizedDeduction, saltCap, seniorDeduction } from './core/itemized-deduction.js';
import { INH_DECEDENT, STATE_RULES, STATE_TAX_NOT_MODELED_NOTE, stateTaxTipText } from './core/state-rules.js';
import { magiForIrmaaLine } from './core/magi-for-irmaa-line.js';
import { SOURCES_A, SOURCES_B, SOURCES_JOINT, SOURCES_SINGLE } from './core/new-state-sources.js';
import { investmentIncome, niitTax, singleLifeFactor } from './core/niit-and-rmd.js';
import { irmaaSsOf, returnMagis, returnStatusA } from './core/irmaa-lookback.js';
import { CLIFF_PLAN_CACHE_MAX, MAGI_ITER_MAX, MAGI_ITER_TOL, acaEligibility, acaHouseholdSize, cliffPlanCache, magiStats, planStats } from './core/aca-and-magi-iteration.js';
import { mortgageInterestShare } from './core/mortgage-interest-share.js';
import { freeTraditional } from './core/free-traditional.js';
import { historicalYearSource, standardYearSource } from '../shared/core/year-sources.js';
import { bootstrapReturnSeries } from '../shared/core/monte-carlo-paths.js';
import { cloneState, deltaAge, deltaMoney, overlayColors } from '../shared/core/scenario-helpers.js';
import { dynTipBtn } from '../shared/core/dyn-field-helpers.js';
import { refreshMoneyPreviews } from '../shared/ui/money-format.js';
import { decisionDeltaPhrase } from '../shared/core/decision-end-assets.js';
import { taxableSocialSecurity } from './core/social-security-and-child-credits.js';
import { SOLO_IN, SOLO_PLAN, STREAM_PLAN, additionalMedicareTax, allocatePlanRoom, filingStatusFor, housingForYear, requiredDistributions, retirementContributions, socialSecurityIncome, soloPlanContributions, streamPlanContributions } from './core/payroll-and-plan-limits.js';
import { NO_PLAN, NO_PLANS, TAXABLE_BASIS_KEY, fillEligible, fillPlanOf, lineFamily, newWithdrawal, underEligible, underPlanOf, yearPlanCandidates } from './core/cliff-plan-lines.js';
import { COVER_CTX, INH_CTX, INH_OUT, LUMP_OUT, STREAM_OUT, inheritedApply, inheritedClone, inheritedDraw, inheritedLedger, inheritedRestore, inheritedYear, listAmountsForYear, lumpAmountsForYear, streamAmountsForYear, streamCoverBits } from './core/income-streams-and-lumps.js';
import { applyRothConversion, growBalances, withdrawRequiredDistributions } from './core/grow-balances.js';
import { annotateAppealRows, annotateInheritedRows, annotateSolverRows } from './ui/annotate-solver-rows.js';
import { renderGroupSummaries } from './ui/render-group-summaries.js';
import { renderPlanHeadline } from '../shared/ui/render-plan-headline.js';
import { renderMonteCarloChart, renderTable } from '../shared/ui/chart-render.js';
import { stateTaxTreatmentNote } from './ui/state-tax-treatment-note.js';
import { compactDecisionDelta } from '../shared/core/compact-decision-delta.js';
import { ROTH_PER_YEAR_CANDIDATES, ROTH_PER_YEAR_MAX_PASSES, ROTH_PER_YEAR_MAX_WINDOW, rothScheduleCost } from './core/roth-per-year.js';
import { computeSankeyFlow } from './ui/compute-sankey-flow.js';
import { DYN } from './core/dyn.js';
import { dynFieldHtml } from '../shared/core/dyn-field-html.js';
import { renderDecisionCompareTable } from './core/render-decision-compare-table.js';
import { normalizeLists } from '../shared/core/lists-and-children-2.js';
import { taxIndexFactor } from '../shared/core/year-factors-2.js';
import { makeProjectedExpense } from '../shared/core/bond-ladder-2.js';
import { acaNetCost, afterTaxEndValueUS, buildTaxProfile, childCredits, conversionMagiCeiling, federalDeduction, fillTraditional, healthcareCost, irmaaMagiOf, irmaaSurcharge, irmaaTierCeiling, lambdaEstimate, longTermGainTax, magiThresholds, ordinaryTax, payrollTax, qbiDeduction, selfEmploymentTax, solveTraditionalForNet, solveTraditionalForNetFromNeed, standardDeduction, stateIncomeTax, stateRuleFor, stateRuleForYear, takeInherited, takeRoth, takeTraditional, taxFor } from './core/standard-deduction.js';
import { drawTaxable } from '../shared/core/draw-taxable.js';
import { releaseMagiCap } from './core/release-magi-cap.js';
import { takePenalized } from './core/take-penalized.js';
import { solveRothConversion } from './core/solve-roth-conversion.js';
(() => {
  FIELDS.forEach((f) => (f.reveals || []).forEach((r) => REVEAL_BY_ID.set(r.id, r.hidden)));
  // @@shared:ids begin
  const ids = FIELDS.filter((field) => field.type === 'number').map((field) => field.key);
  const syncFns = { controls: () => syncControls(), contrib: () => syncContributionControls() };
  // The update_fire_assumptions MCP tool exposes every numeric field plus each field marked
  // `mcp`, in registry order. Values of the wrong type or outside a choice's list are ignored.
  const MCP_FIELDS = FIELDS.filter((field) => field.type === 'number' || field.mcp);
  // @@shared:ids end
  function normalizeState(raw) {
    const s = { ...defaults, ...(raw || {}) };
    FIELDS.forEach((field) => {
      if (field.fallback !== undefined && !field.values.includes(s[field.key])) s[field.key] = field.fallback;
      if (field.trueUnlessFalse) s[field.key] = s[field.key] !== false;
    });
    s.retireAgeA = Math.max(s.ageA, Number(s.retireAgeA ?? s.retireAge ?? s.ageA));
    s.retireAgeB = Math.max(s.ageB, Number(s.retireAgeB ?? s.retireAge ?? s.ageB));
    s.lifeExpectancyA = Math.min(110, Math.max(s.lifeExpectancyA, s.ageA + 1));
    s.lifeExpectancyB = Math.min(110, Math.max(s.lifeExpectancyB, s.ageB + 1));
    s.fiWithdrawalRate = Math.min(15, Math.max(0.5, Number(s.fiWithdrawalRate) || defaults.fiWithdrawalRate));
    // Employer profit sharing, % of pay: 0 to 25 (the employer's deduction limit, and the usual ceiling for an owner).
    for (const k of ['profitSharingPctA', 'profitSharingPctB']) s[k] = Math.min(25, Math.max(0, Number(s[k]) || 0));
    normalizeLists(s, raw);
    normalizeUsStreams(s, raw);
    normalizeUsLumps(s, raw);
    s.dismissedEstimates = Array.isArray(raw?.dismissedEstimates) ? raw.dismissedEstimates : [];
    s.dismissedUnusualAssumptions = Array.isArray(raw?.dismissedUnusualAssumptions)
      ? raw.dismissedUnusualAssumptions
      : [];
    // appliedRothSchedule/appliedMixSchedule (see defaults above): plain
    // {age: value} objects written by the optimizer's "Apply this
    // schedule" button. Validated defensively — a hand-edited or stale
    // export could otherwise carry a bogus value straight into
    // simulate()'s withdrawal math. The allowed-value lists are duplicated
    // here rather than referencing ROTH_PER_YEAR_CANDIDATES/
    // WITHDRAWAL_MIX_CANDIDATES (declared later in the file) because
    // normalizeState() runs before those consts exist — keep both lists in
    // sync if the candidate menus ever change.
    {
      const sanitizeSchedule = (obj, allowedValues) => {
        if (!obj || typeof obj !== 'object') return null;
        const out = {};
        let any = false;
        for (const key of Object.keys(obj)) {
          const age = Number(key);
          if (!Number.isFinite(age) || age < 0 || age > 120) continue;
          const val = obj[key];
          if (!allowedValues.includes(val)) continue;
          out[age] = val;
          any = true;
        }
        return any ? out : null;
      };
      s.appliedRothSchedule = sanitizeSchedule(s.appliedRothSchedule, [0, 10, 12, 22, 24, 32, 35]);
      s.appliedMixSchedule = sanitizeSchedule(s.appliedMixSchedule, [
        0,
        'taxable',
        'traditional',
        'roth',
        'balanced',
        'smoothed',
        'taxTradHalf',
        'thirds',
      ]);
    }
    // Retirement accounts (see the defaults): balances and Roth IRA basis are non-negative
    // dollars, the Roth 401(k) basis is 0-100 percent. The pooled fields of older saves
    // (traditional, roth, traditionalSharePctA, rothBasisPct) are retired and not migrated
    // (owner decision, Batch 3A): they are deleted here because the spread above carries
    // unknown keys through, and an old save opens with empty retirement accounts.
    ['traditional', 'roth', 'traditionalSharePctA', 'rothBasisPct'].forEach((k) => delete s[k]);
    ['A', 'B'].forEach((p) => {
      ['tradIra', 'trad401k', 'rothIra', 'roth401k', 'rothIraBasis'].forEach((k) => {
        const v = Number(s[k + p]);
        s[k + p] = Number.isFinite(v) ? Math.max(0, v) : defaults[k + p];
      });
      const pctV = Number(s['roth401kBasisPct' + p]);
      s['roth401kBasisPct' + p] = Number.isFinite(pctV) ? Math.min(100, Math.max(0, pctV)) : defaults['roth401kBasisPct' + p];
    });
    // Rule of 55 was one household checkbox before it became a per-partner election: a ticked old box
    // ticks both partners (the engine already required each partner's own retirement age of 55 or more,
    // so the numbers do not move). Deleted because the spread above carries unknown keys through.
    if (raw && raw.ruleOf55Enabled === true && raw.ruleOf55A === undefined && raw.ruleOf55B === undefined) s.ruleOf55A = s.ruleOf55B = true;
    delete s.ruleOf55Enabled;
    // 72(t) SEPP is elected per account (sepp72tIra/K401 A/B, with a first-payment age; 0 means at the
    // owner's retirement age). The household-wide flags of older saves (sepp72tEnabled, and its A/B
    // split) are retired and not migrated (owner decision, Batch 3B): deleted here because the spread
    // above carries unknown keys through.
    ['sepp72tEnabled', 'sepp72tEnabledA', 'sepp72tEnabledB'].forEach((k) => delete s[k]);
    ['sepp72tIraAgeA', 'sepp72tK401AgeA', 'sepp72tIraAgeB', 'sepp72tK401AgeB'].forEach((k) => {
      const v = Number(s[k]);
      s[k] = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : defaults[k];
    });
    return s;
  }
  assignState(normalizeState(null));
  // @@shared:02-CHART_GROUPS begin
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
  // Collapsible inputs panel (desktop). A pure layout preference, so it
  // gets its own localStorage key rather than riding along with the
  // gated autosave blob (see writeStorageNow() — it no-ops until
  // hasPersonalizedData is true, and a layout choice should persist even
  // before that). Starts collapsed=false unless a prior choice is found.
  let sidebarCollapsed = false;
  try {
    sidebarCollapsed = localStorage.getItem('fireCouplePlanner.sidebarCollapsed.v1') === '1';
  } catch {}
  function setSidebarCollapsed(next) {
    sidebarCollapsed = next;
    document.getElementById('workspace').classList.toggle('sidebar-collapsed', next);
    const btn = document.getElementById('sidebarCollapseBtn');
    if (btn) {
      btn.textContent = next ? '»' : '«';
      btn.setAttribute('aria-label', next ? 'Expand inputs panel' : 'Collapse inputs panel');
      btn.title = next ? 'Expand inputs panel' : 'Collapse inputs panel';
      btn.setAttribute('aria-expanded', String(!next));
    }
    try {
      localStorage.setItem('fireCouplePlanner.sidebarCollapsed.v1', next ? '1' : '0');
    } catch {}
  }
  // @@shared:02-CHART_GROUPS end
  // Category rail: filters .category-fields down to a single category's
  // @@shared:activeCategory begin
  // groups at a time — available at every width (originally desktop-only;
  // the rail was hidden outright on mobile via CSS and filtering itself
  // was gated behind an `isDesktop` check below, both removed since a
  // category filter is at least as useful on a long, single-column mobile
  // inputs list as it is on desktop). Not persisted to localStorage on
  // purpose: unlike sidebarCollapsed (a standing layout choice), a
  // category filter is a transient "where am I looking right now" and
  // should reset to a known-good "All" on every fresh load rather than
  // possibly strand a returning visitor on a narrow filter they've
  // forgotten about.
  let activeCategory = 'all';
  // `scrollToRail`: only the rail's own click handler (below) passes this —
  // jumpToEstimateField()/the search-result jump/the resize-reapply
  // listener all call setActiveCategory() too (resetting to 'all' so a
  // field outside the current filter isn't left sitting in a display:none
  // group), and each of those already has its own scroll target right
  // after, so scrolling to the rail first would just add a visible
  // double-scroll in front of the scroll they actually wanted.
  function setActiveCategory(cat, { scrollToRail = false } = {}) {
    activeCategory = cat;
    const rail = document.getElementById('categoryRail');
    if (rail) {
      rail.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
      });
    }
    document.querySelectorAll('#categoryFields > details.group').forEach(group => {
      const show = cat === 'all' || group.dataset.cat === cat;
      group.style.display = show ? '' : 'none';
    });
    const isMobile = window.innerWidth <= 820;
    if (isMobile) {
      // .panel is part of normal page flow on mobile (no independent
      // scrollTop to reset — see the max-width:820px media query), and
      // the rail itself isn't sticky, so a tap after scrolling partway
      // down a long filtered list would otherwise leave the rail
      // off-screen with no way back to it except scrolling up by hand.
      // scroll-margin-top on .category-rail (set from --mobile-sticky-h +
      // --field-search-h, see syncPlanStatusOffsets()) lands it just below
      // the sticky status bar/tabs/search stack rather than underneath it.
      if (scrollToRail) rail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const panel = document.querySelector('.panel');
      if (panel) panel.scrollTop = 0;
    }
  }
  // @@shared:activeCategory end
  // @@shared:03-hadSavedState begin
  // Whether a real, previously-saved plan was found in this browser at
  // boot — used below to skip showing the first-run banner (there's
  // nothing "first-run" about a returning visitor whose numbers just
  // loaded back in).
  let hadSavedState = false;
  try {
    storage?.removeItem(legacyStorageKey);
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (saved?.state) {
      assignState(normalizeState(saved.state));
      hadSavedState = true;
    }
    if (['real', 'nominal'].includes(saved?.mode)) assignMode(saved.mode);
  } catch {}
  // Whether it's OK to actually persist `state` yet. Starts equal to
  // `hadSavedState` (a returning visitor's data is already "personalized")
  // and flips to true the moment `dismissFirstRunBanner()` runs for real —
  // i.e. the same signals that mean this isn't the generic example data
  // anymore (a real sidebar edit, opening the wizard, or importing a
  // scenario). Without this guard, `setMode(mode)` at boot would call
  // `saveInputs()` unconditionally, silently writing the untouched generic
  // example data to storage within a couple hundred milliseconds of every
  // first visit — which would then make the *next* reload look like a
  // returning visitor with "real" data, hiding the first-run banner for
  // someone who never actually entered anything.
  let hasPersonalizedData = hadSavedState;
  // The first-run banner flags the whole page as generic example data once,
  // but gives no lasting per-field cue once dismissed. This puts a small
  // amber marker (dot + "still the example value" tooltip) in front of the
  // label of every `ids`-driven field (every plain number/range input the
  // sidebar auto-wires — see the `ids` array) that still equals its
  // `defaults` value, so a partially-filled-in wizard or sidebar still shows
  // what's actually been personalized. Cheap enough to run on every
  // render() (a straight equality check per field, no simulation involved).
  function markDefaultFields() {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fieldEl = el.closest('.field, .range-field');
      if (!fieldEl) return;
      const isDefault = state[id] === defaults[id];
      fieldEl.classList.toggle('is-default', isDefault);
      fieldEl.title = isDefault ? 'Still the generic example value' : '';
    });
  }
  // @@shared:03-hadSavedState end
  // @@shared:04-isEstimateCountable begin
  function isEstimateCountable(id) {
    if (ESTIMATE_ALWAYS_IDS.includes(id)) return true;
    const group = ESTIMATE_GATED_GROUPS.find((g) => g.ids.includes(id));
    return !!group && group.gate();
  }
  // Returns the currently-counted field ids, sorted into the same order
  // they actually appear in the sidebar (top to bottom) — this is also the
  // order "Review →"/"Next →" walks them in. Deliberately NOT `ids` array
  // order: per "Sidebar group order" elsewhere in this file, a field's
  // position in that array has never been tied to its visual position —
  // fields get freely reordered/regrouped in the markup across rounds
  // without anyone needing to (or being expected to) also reorder `ids` to
  // match, since nothing else depends on that array's order. Real-world
  // bug report: the guided review "jumping around" instead of progressing
  // top-to-bottom was exactly this — it had been walking `ids`' own
  // (unrelated) declaration order the whole time. Sorted here with
  // `compareDocumentPosition` against each field's live DOM position
  // instead, so a future sidebar reorder keeps the review in sync
  // automatically, with nothing to remember to update in two places.
  function computeCountedEstimateIds() {
    return ids
      .filter(
        (id) =>
          isEstimateCountable(id) &&
          state[id] === defaults[id] &&
          !state.dismissedEstimates.includes(id),
      )
      .sort((a, b) => {
        const elA = document.getElementById(a),
          elB = document.getElementById(b);
        if (!elA || !elB) return 0;
        const pos = elA.compareDocumentPosition(elB);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
  }
  // Single source of truth for dismissing a field, used by both the
  // per-field badge's ✓ button and the guided-review "Next" flow below —
  // never duplicate the push/persist logic at a second call site.
  function dismissEstimateField(id) {
    if (id && !state.dismissedEstimates.includes(id)) {
      state.dismissedEstimates.push(id);
      dismissFirstRunBanner();
      saveInputs();
      return true;
    }
    return false;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.estimate-dismiss');
    if (!btn) return;
    // The button lives inside the field's <label for="...">, so a native
    // click here would also trigger the browser's "activate the label's
    // associated control" default action — refocusing/reselecting the very
    // field being dismissed, right after we've moved focus elsewhere (e.g.
    // during Review-mode auto-advance). Suppress that.
    e.preventDefault();
    if (dismissEstimateField(btn.dataset.field)) render();
  });
  function renderEstimateBadges(countedIds) {
    const countedSet = new Set(countedIds);
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const label = document.querySelector(`label[for="${id}"]`);
      if (!label) return;
      let badge = label.querySelector('.estimate-badge');
      if (countedSet.has(id)) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'estimate-badge';
          // The "Estimated" text itself is inert (cursor:default, see CSS) —
          // only the ✓ circle is a real button — but the two used to read as
          // one uniform tappable pill, which made people unsure whether
          // tapping the word "Estimated" itself would dismiss the field.
          // Splitting them into a plain label span plus a visually distinct,
          // larger circular button (its own tinted background/border) makes
          // the actual tap target unambiguous.
          badge.innerHTML =
            '<span class="estimate-badge-label">Estimated</span><button type="button" class="estimate-dismiss" aria-label="This looks right, stop flagging it" title="This looks right — stop flagging it">✓</button>';
          badge.querySelector('.estimate-dismiss').dataset.field = id;
          const small = label.querySelector('small');
          if (small) label.insertBefore(badge, small);
          else label.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }
  infoBubble.id = 'infoBubble';
  infoBubble.className = 'info-bubble';
  infoBubble.setAttribute('role', 'tooltip');
  infoBubble.hidden = true;
  document.body.appendChild(infoBubble);
  let infoBubbleBtn = null;
  let infoBubbleAnchor = { top: 0, left: 0 };
  function closeInfoBubble(returnFocus) {
    if (!infoBubbleBtn) return;
    const btn = infoBubbleBtn;
    infoBubbleBtn = null;
    infoBubble.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-describedby');
    if (returnFocus && btn.isConnected) btn.focus();
  }
  function placeInfoBubble() {
    if (!infoBubbleBtn || !infoBubbleBtn.isConnected) {
      closeInfoBubble(false);
      return;
    }
    const r = infoBubbleBtn.getBoundingClientRect(),
      vw = document.documentElement.clientWidth,
      vh = window.innerHeight,
      bw = infoBubble.offsetWidth,
      bh = infoBubble.offsetHeight,
      gap = 8,
      margin = 12;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - bw / 2), Math.max(margin, vw - bw - margin));
    let top = r.bottom + gap;
    if (top + bh > vh - margin && r.top - gap - bh >= margin) top = r.top - gap - bh;
    infoBubble.style.left = left + 'px';
    infoBubble.style.top = Math.max(margin, top) + 'px';
  }
  function openInfoBubble(btn) {
    closeInfoBubble(false);
    infoBubble.textContent = btn.dataset.tip || '';
    infoBubble.hidden = false;
    infoBubbleBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'infoBubble');
    placeInfoBubble();
    const ar = btn.getBoundingClientRect();
    infoBubbleAnchor = { top: ar.top, left: ar.left };
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.info-tip') : null;
    if (btn) {
      e.preventDefault();
      if (infoBubbleBtn === btn) closeInfoBubble(false);
      else openInfoBubble(btn);
      return;
    }
    if (infoBubbleBtn && !infoBubble.contains(e.target)) closeInfoBubble(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && infoBubbleBtn) closeInfoBubble(true);
  });
  // Close on scroll only once the button has actually moved — a browser can
  // fire a stray scroll event right after a tap (focus/scroll-into-view) that
  // shouldn't dismiss the bubble that tap just opened.
  document.addEventListener(
    'scroll',
    (e) => {
      if (!infoBubbleBtn || infoBubble.contains(e.target)) return;
      const r = infoBubbleBtn.getBoundingClientRect();
      if (!infoBubbleBtn.isConnected || Math.abs(r.top - infoBubbleAnchor.top) > 4 || Math.abs(r.left - infoBubbleAnchor.left) > 4)
        closeInfoBubble(false);
    },
    true,
  );
  window.addEventListener('resize', () => closeInfoBubble(false));

  // "Review →"/"Next →": which field id is currently the guided-review
  // target, so render() can tell when it stops being counted (edited away
  // from default, or dismissed) and auto-advance to whatever's next. null
  // means no review is in progress.
  let reviewingFieldId = null;
  function jumpToEstimateField(id) {
    reviewingFieldId = id;
    const el = document.getElementById(id);
    if (!el) return;
    setMobileView('inputs');
    // Reset any active category filter first — a field from a different
    // category than the one currently shown would otherwise be sitting
    // inside a display:none group, and every scroll/focus call below
    // would silently do nothing.
    if (typeof setActiveCategory === 'function' && activeCategory !== 'all') setActiveCategory('all');
    const group = el.closest('details.group');
    if (group && !group.open) group.open = true;
    const fieldEl = el.closest('.field, .range-field') || el;
    if (fieldEl) {
      fieldEl.classList.add('flash-highlight');
      // Long enough to still be visible after the smooth scroll below has
      // settled and the person has had a moment to actually look at the
      // field — 1.2s was disappearing almost as soon as it landed.
      setTimeout(() => fieldEl.classList.remove('flash-highlight'), 2600);
    }
    // Land the field in the upper third of the visible viewport, not dead
    // center — center often pushed a field's own <small> descriptor (which
    // can run several lines) past the bottom edge of the screen. Computed
    // manually (rather than scrollIntoView's block option, which only
    // offers 'start'/'center'/'end'/'nearest') after giving the group-open
    // and mobile-tab-switch layout changes above a frame to settle.
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
    el.focus({ preventScroll: true });
  }
  function renderEstimatedRollup(countedIds) {
    const banner = document.getElementById('estimatedRollupBanner');
    const textEl = document.getElementById('estimatedRollupText');
    if (banner && textEl) {
      if (countedIds.length === 0) {
        banner.hidden = true;
        if (reviewingFieldId !== null) reviewingFieldId = null;
      } else {
        banner.hidden = false;
        textEl.innerHTML = `<b>${countedIds.length}</b> of your numbers ${countedIds.length === 1 ? 'is' : 'are'} still estimated`;
        // Auto-advance: if we're mid-review and the field being reviewed
        // just stopped being counted (edited away from default, or
        // dismissed via "Next" below), jump to whatever's now first, if
        // anything remains.
        if (reviewingFieldId !== null && !countedIds.includes(reviewingFieldId)) {
          jumpToEstimateField(countedIds[0]);
        }
        // Once a review is in progress and the field it's on is still
        // counted, the button reads "Next" instead of "Review" — same
        // click target, but now dismisses the current field and advances,
        // rather than just re-jumping to the first one again.
        const btn = document.getElementById('reviewEstimatesBtn');
        if (btn) btn.textContent = reviewingFieldId !== null && countedIds.includes(reviewingFieldId) ? 'Next →' : 'Review →';
      }
    }
    syncReviewNav();
  }
  // Floating "Next →" pill (`#reviewNav`), fixed to the viewport regardless
  // of which mobile tab is active. The guided review's own trigger
  // (`#reviewEstimatesBtn`) lives inside `#estimatedRollupBanner`, which is
  // part of `.content` — the Dashboard-tab-only half of the page on mobile.
  // jumpToEstimateField() switches to the Inputs tab to show the field,
  // which is exactly what hides that trigger button, leaving no way to
  // continue the review without manually flipping back to Dashboard first.
  // This floating control mirrors the same action and stays visible on
  // both tabs (and both viewport widths) for as long as a review is
  // actually in progress.
  function syncReviewNav() {
    const nav = document.getElementById('reviewNav');
    if (!nav) return;
    const countedIds = computeCountedEstimateIds();
    if (reviewingFieldId === null || !countedIds.includes(reviewingFieldId)) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    document.getElementById('reviewNavCount').textContent =
      `${countedIds.length} ${countedIds.length === 1 ? 'field' : 'fields'} left`;
    document.getElementById('reviewNavNext').textContent = countedIds.length === 1 ? 'Done ✓' : 'Next →';
  }
  // Shared by both the rollup banner's button and the floating nav's
  // button — same action, same state, two entry points (one per mobile
  // tab) so the review flow is reachable no matter which side is showing.
  function advanceReview() {
    const countedIds = computeCountedEstimateIds();
    if (!countedIds.length) return;
    if (reviewingFieldId !== null && countedIds.includes(reviewingFieldId)) {
      // "Next" now also confirms-and-dismisses the field it's leaving —
      // render()'s own auto-advance (inside renderEstimatedRollup, above)
      // notices reviewingFieldId just dropped out of the counted set and
      // jumps to whatever's next on its own.
      dismissEstimateField(reviewingFieldId);
      render();
    } else {
      jumpToEstimateField(countedIds[0]);
      // A plain first jump doesn't itself change any state, so nothing
      // else triggers a render() to refresh the label/nav — do it directly.
      renderEstimatedRollup(computeCountedEstimateIds());
    }
  }
  document.getElementById('reviewEstimatesBtn')?.addEventListener('click', advanceReview);
  document.getElementById('reviewNavNext')?.addEventListener('click', advanceReview);
  document.getElementById('reviewNavClose')?.addEventListener('click', () => {
    reviewingFieldId = null;
    renderEstimatedRollup(computeCountedEstimateIds());
  });
  // Quantifies the impact of one flagged assumption by comparing the
  // current simulation against the same simulation with just that one
  // field nudged back to the nearer edge of its realistic range — the same
  // mutate/simulate/restore idiom SENSITIVITY_LEVERS uses, reusing the
  // "Explore a question" comparison helpers (decisionDeltaPhrase already
  // handles the depleted-portfolio/depletion-age wording) rather than
  // inventing a second delta phrasing.
  function unusualAssumptionImpact(item, currentSim) {
    const saved = state[item.id];
    state[item.id] = saved < item.min ? item.min : item.max;
    const typicalSim = simulate();
    state[item.id] = saved;
    return decisionDeltaPhrase(currentSim, typicalSim);
  }
  function dismissUnusualAssumption(id) {
    if (id && !state.dismissedUnusualAssumptions.includes(id)) {
      state.dismissedUnusualAssumptions.push(id);
      saveInputs();
      return true;
    }
    return false;
  }
  // Same landing/scroll/flash idiom as jumpToEstimateField, duplicated
  // rather than shared: it has no reviewingFieldId-style guided-review
  // state to track, and per this file's own "simulate()/simulateHistorical()
  // duplication trap" note, two independently-evolving features are safer
  // kept as separate small functions than coupled through one shared one.
  function jumpToUnusualField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    setMobileView('inputs');
    const group = el.closest('details.group');
    if (group && !group.open) group.open = true;
    const fieldEl = el.closest('.field, .range-field') || el;
    fieldEl.classList.add('flash-highlight');
    setTimeout(() => fieldEl.classList.remove('flash-highlight'), 2600);
    requestAnimationFrame(() => {
      const isMobile = window.matchMedia('(max-width:820px)').matches;
      const scrollEl = isMobile ? null : document.querySelector('.panel');
      const rect = fieldEl.getBoundingClientRect();
      const viewportH = isMobile
        ? window.innerHeight
        : scrollEl
          ? scrollEl.clientHeight
          : window.innerHeight;
      const targetTop = viewportH * 0.3;
      const delta = rect.top - targetTop;
      if (isMobile || !scrollEl) window.scrollBy({ top: delta, behavior: 'smooth' });
      else scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
    });
    el.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    const dismissBtn = e.target.closest('.unusual-dismiss');
    if (dismissBtn) {
      if (dismissUnusualAssumption(dismissBtn.dataset.field)) render();
      return;
    }
    const jumpBtn = e.target.closest('.unusual-jump');
    if (jumpBtn) jumpToUnusualField(jumpBtn.dataset.field);
  });
  // The one non-passive cue: a brief "Unusual value" note right under the
  // field, shown only once the person actually leaves it (focusout, not
  // input) — per feedback, this shouldn't interrupt while they're still
  // typing/dragging, only once they've moved on. Delegated + capture-free
  // (focusout bubbles, unlike blur) so it needs no per-field wiring.
  document.addEventListener('focusout', (e) => {
    const id = e.target && e.target.id;
    if (!id || !UNUSUAL_RANGES.some((r) => r.id === id)) return;
    if (!computeUnusualAssumptions().some((f) => f.id === id)) return;
    const fieldEl = e.target.closest('.field, .range-field');
    if (!fieldEl) return;
    let note = fieldEl.querySelector('.unusual-field-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'unusual-field-note';
      note.textContent = 'Unusual value';
      fieldEl.appendChild(note);
    }
    note.classList.add('show');
    clearTimeout(note._hideTimer);
    note._hideTimer = setTimeout(() => note.classList.remove('show'), 3000);
  });
  // Tracks which flagged ids were already showing as of the *previous*
  // render, purely in memory (not persisted — a fresh page load always
  // starts from a clean slate). `unusualToastArmed` skips the very first
  // render (page boot, or a Reset/Load that just replaced the whole
  // state) so loading a plan never pops an unsolicited toast the instant
  // the page settles — only a value that becomes newly unusual *during*
  // the session (typing, or a scenario import) does.
  let previousUnusualIds = new Set(),
    unusualToastArmed = false,
    unusualToastTimer = null;
  function syncUnusualToast(flagged) {
    const toast = document.getElementById('unusualToast');
    if (!toast) return;
    const flaggedIds = new Set(flagged.map((f) => f.id));
    // Skip a field the person is actively typing into right now — they're
    // already looking right at it, so a toast announcing it would just be
    // noise layered on top of what they can already see.
    const newlyFlagged = flagged.filter(
      (f) => !previousUnusualIds.has(f.id) && document.activeElement?.id !== f.id,
    );
    if (unusualToastArmed && newlyFlagged.length) {
      document.getElementById('unusualToastText').textContent =
        newlyFlagged.length === 1
          ? `"${newlyFlagged[0].label}" looks unusual`
          : `${newlyFlagged.length} assumptions look unusual`;
      toast.hidden = false;
      clearTimeout(unusualToastTimer);
      unusualToastTimer = setTimeout(() => {
        toast.hidden = true;
      }, 8000);
    }
    unusualToastArmed = true;
    previousUnusualIds = flaggedIds;
  }
  document.getElementById('unusualToastBtn')?.addEventListener('click', () => {
    document.getElementById('unusualToast').hidden = true;
    clearTimeout(unusualToastTimer);
    const first = computeUnusualAssumptions()[0];
    if (first) jumpToUnusualField(first.id);
    else switchToDashboardTab();
  });
  document.getElementById('unusualToastClose')?.addEventListener('click', () => {
    document.getElementById('unusualToast').hidden = true;
    clearTimeout(unusualToastTimer);
  });
  // Renders the dashboard "Worth a second look" callout — hidden entirely
  // whenever nothing is flagged (or everything currently flagged has been
  // dismissed) — and, via syncUnusualToast, a brief pop-up toast for any
  // *newly* flagged item so a person working elsewhere on the dashboard
  // (or on the Inputs tab on mobile) still finds out, rather than only
  // someone who happens to be looking at this exact card when it changes.
  function renderUnusualAssumptions(selected) {
    const banner = document.getElementById('unusualAssumptionsBanner');
    const listEl = document.getElementById('unusualAssumptionsList');
    const flagged = computeUnusualAssumptions();
    markUnusualFields(new Set(flagged.map((f) => f.id)));
    if (!banner || !listEl) return;
    if (!flagged.length) {
      banner.hidden = true;
      listEl.innerHTML = '';
      syncUnusualToast(flagged);
      return;
    }
    banner.hidden = false;
    listEl.innerHTML = flagged
      .map((item) => {
        if (item.check)
          return `<li><button type="button" class="unusual-jump" data-field="${item.id}"><b>${item.label}</b></button> — ${item.message()}<button type="button" class="estimate-dismiss unusual-dismiss" data-field="${item.id}" aria-label="This is intentional, stop flagging it" title="This is intentional — stop flagging it">✓</button></li>`;
        const v = state[item.id];
        const impact = unusualAssumptionImpact(item, selected);
        return `<li><button type="button" class="unusual-jump" data-field="${item.id}"><b>${item.label}</b>: ${v}${item.unit}</button> <span style="color:var(--hint)">(typical ${item.min}–${item.max}${item.unit})</span> — using a typical value ${impact}.<button type="button" class="estimate-dismiss unusual-dismiss" data-field="${item.id}" aria-label="This is intentional, stop flagging it" title="This is intentional — stop flagging it">✓</button></li>`;
      })
      .join('');
    syncUnusualToast(flagged);
  }
  // @@shared:04-isEstimateCountable end
  ['A', 'B'].forEach((p) =>
    UNUSUAL_RANGES.push({
      id: 'ssStartAge' + p,
      label: 'Partner ' + p + ' Social Security starts while working',
      check: () => !!ssBeforeRetirementCase(p),
      message: () => {
        const c = ssBeforeRetirementCase(p);
        if (!c) return '';
        return 'the benefit starts at ' + c.start + ', before retirement at ' + c.retire + ' and before full retirement age (' + fraText(c.fra) + '). Social Security would withhold $1 of benefit for every $2 of wages over $' + SS_EARNINGS_TEST_2026.lower.toLocaleString('en-US') + ' (2026 figure; $1 for every $3 over $' + SS_EARNINGS_TEST_2026.higher.toLocaleString('en-US') + ' in the year full retirement age is reached) until that age; the planner does not model the earnings test, so it pays the full benefit while wages continue. The months withheld come back as a higher monthly benefit from full retirement age.';
      },
    }),
  );
  // Tax-parameter indexing. Brackets, deductions, FPL, IRMAA tiers and the
  // FICA wage base all index by this factor. In the deterministic projection
  // it is the steady state.inflation compounded by yearIndex; inside
  // simulateHistorical() (backtest and Monte Carlo) it is the path's own
  // cumulative CPI, so a 1970s-style inflation sequence raises the brackets
  // along with spending instead of leaving them on a 2.5% schedule.



  // Live, always-cheap sibling of the multi-lever optimizer's full
  // lifetime coordinate-ascent search above — the search is too expensive
  // to re-run on every render (it calls simulate() thousands of times), so
  // it stays an explicit, on-demand "Optimize" report.
  //
  // This went through two broken designs before landing here, both found
  // by testing against a real uploaded scenario rather than caught in
  // review — worth recording so neither gets reintroduced:
  //
  // 1. Scoring all WITHDRAWAL_MIX_CANDIDATES on "this year's own tax"
  //    alone: a Roth withdrawal is *always* tax-free this year, so every
  //    Roth-inclusive candidate trivially looks free and the picker drains
  //    Roth almost immediately, with nothing left for a future year that
  //    actually needs it. Drove lifetime cost up by ~$900k instead of down
  //    in testing.
  // 2. Restricting to the menu's "spread" candidates (taxTradHalf/thirds/
  //    balanced/smoothed) to avoid (1): still worse than doing nothing,
  //    by ~$270k. The menu's candidates are fixed PROPORTIONAL splits —
  //    each bucket's share is sized against `need` independently, so if
  //    one bucket's own share exceeds what it actually holds, that
  //    shortfall does NOT roll over into the other buckets; it falls
  //    straight through to the Roth/cash/bond/home fallback below. That's
  //    fine for the full lifetime search above, which evaluates the
  //    resulting multi-year depletion pattern directly and simply
  //    wouldn't pick a candidate that stranded a large balance — but a
  //    one-year-only picker has no way to know whether "leaving
  //    traditional untouched this year" is a deliberate multi-year
  //    strategy (it sometimes is, see the full search's own picks) or an
  //    accident, so it can't safely choose from the same proportional-
  //    split menu at all.
  //
  // What's actually safe for a single year to decide on its own is
  // *order*, not proportion: which of taxable-or-traditional to draw from
  // first, fully cascading into the other for any shortfall — exactly the
  // shape the plain taxable-first default already uses, just choosing
  // which bucket leads based on this year's own marginal tax rates
  // instead of always taxable. Both orders are guaranteed to satisfy
  // `need` out of combined taxable+traditional capacity whenever that
  // combined capacity allows it (never stranding one while draining Roth/
  // cash/bonds for the other), and since one of the two orders (taxable-
  // first) is exactly what the plain default already does, picking
  // whichever of the two costs less this year can never come out ahead of
  // the default by choosing worse — only by choosing traditional-first
  // when that's genuinely cheaper (e.g. a low-bracket year with little
  // taxable gain to save, or one where taxable's own gain would blow the
  // MAGI room traditional wouldn't). `remainingMagiRoom` (the same ACA-
  // cliff/IRMAA-tier ceiling the Roth ladder's conversion sizing already
  // respects) is folded into the cost so an order that would overshoot it
  // is preferred against only when the other order overshoots it more.
  // Roth itself is deliberately left untouched here — it's still reached
  // exactly as it always was, as the shortfall fallback immediately below
  // this branch, once combined taxable+traditional genuinely can't cover
  // `need`.
  function pickLiveWithdrawalOrder(
    need,
    taxableBal,
    traditionalBal,
    taxableBasis,
    profile,
    taxableGainGross,
    traditionalGross,
    penalizedFraction,
    remainingMagiRoom,
  ) {
    function cascade(traditionalFirst) {
      let remaining = need,
        fromTaxable = 0,
        taxableGain = 0,
        taxableBasisTaken = 0,
        fromTraditional = 0,
        penalty = 0,
        gainAcc = taxableGainGross,
        tradAcc = traditionalGross;
      function drawTax(amount) {
        if (amount <= 0) return;
        const d = drawTaxable(
          taxableBal - fromTaxable,
          taxableBasis - taxableBasisTaken,
          amount,
          profile,
          gainAcc,
          tradAcc,
        );
        fromTaxable += d.taken;
        taxableGain += d.gain;
        taxableBasisTaken += d.basisTaken;
        gainAcc += d.gain;
        remaining -= d.net;
      }
      function drawTrad(amount) {
        if (amount <= 0) return;
        const t = solveTraditionalForNet(
          traditionalBal - fromTraditional,
          amount,
          gainAcc,
          tradAcc,
          profile,
          penalizedFraction,
        );
        fromTraditional += t.fromTrad;
        tradAcc += t.fromTrad;
        penalty += t.penalty;
        remaining -= t.tradNet;
      }
      if (traditionalFirst) {
        drawTrad(remaining);
        drawTax(remaining);
      } else {
        drawTax(remaining);
        drawTrad(remaining);
      }
      const incrementalTax =
        taxFor(profile, gainAcc, tradAcc) - taxFor(profile, taxableGainGross, traditionalGross) +
        penalty;
      const overage = Math.max(0, taxableGain + fromTraditional - remainingMagiRoom);
      return {
        fromTaxable,
        taxableGain,
        taxableBasisTaken,
        fromTraditional,
        penalty,
        remainingNeed: Math.max(0, remaining),
        cost: overage * 1e6 + incrementalTax,
      };
    }
    const taxableFirst = cascade(false),
      traditionalFirst = cascade(true);
    return traditionalFirst.cost < taxableFirst.cost ? traditionalFirst : taxableFirst;
  }


















  // @@shared:09-sweepExcessCash begin

  // Pre-retirement bond-ladder build: ramps linearly over the years available
  // before retirement so the full ladderTarget is reached by rotationEndYear.
  // Each year it moves whatever the ramp still needs into the bond reserve:
  // traditional first, then Roth (reallocations inside a retirement account:
  // no income, no tax, no early-withdrawal penalty), then taxable brokerage
  // only as a last resort. The taxable move is a real sale (drawTaxable): the
  // tax on the realized gain is paid out of the proceeds, the new bonds are
  // bought at market (full basis), and the realized gain is returned so the
  // caller can add it to the year's gains (tax, MAGI). `conversionAmount` is
  // this year's ordinary income already in the profile (Roth conversion, US /
  // meltdown, Canada), which the gain stacks on.
  function rotateIntoBondLadder(bal, { year, ladderTarget, rotationStartYear, rotationEndYear }, profile, conversionAmount) {
    if (year < rotationStartYear || year > rotationEndYear) return 0;
    const windowLen = rotationEndYear - rotationStartYear + 1,
      progress = windowLen > 0 ? (year - rotationStartYear + 1) / windowLen : 1;
    let remaining = Math.max(0, ladderTarget * progress - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth));
    const traditionalMove = Math.min(bal.traditional, remaining);
    bal.traditional -= traditionalMove;
    bal.bondTraditional += traditionalMove;
    remaining -= traditionalMove;
    if (remaining > 0) {
      const rothMove = Math.min(bal.roth, remaining);
      bal.roth -= rothMove;
      bal.bondRoth += rothMove;
      remaining -= rothMove;
    }
    if (remaining <= 0) return 0;
    const d = drawTaxable(bal.taxable, bal.taxableBasis, remaining, profile, 0, conversionAmount);
    bal.taxable -= d.taken;
    bal.taxableBasis -= d.basisTaken;
    bal.bondTaxable += d.net;
    bal.bondTaxableBasis += d.net;
    return d.gain;
  }
  // @@shared:09-sweepExcessCash end





  // @@shared:takeTaxable begin
  // Each take*() draws up to `amount` of net cash from one bucket, updates the
  // balances and the running totals on `wd`, and returns the NET cash raised
  // (after any tax or penalty the draw itself triggers). The caller subtracts
  // it from wd.need, because the strategies differ in whether a tiny overshoot
  // is clamped at zero. `bucket` is 'taxable' | 'bondTaxable'.
  function takeTaxable(wd, bucket, amount) {
    const { bal } = wd;
    const basisKey = TAXABLE_BASIS_KEY[bucket];
    const d = drawTaxable(bal[bucket], bal[basisKey], amount, wd.profile, wd.taxableGainGross, wd.traditionalGross);
    bal[bucket] -= d.taken;
    bal[basisKey] -= d.basisTaken;
    wd.taxableGainGross += d.gain;
    wd.taxableWithdrawn += d.taken;
    return d.net;
  }
  // @@shared:takeTaxable end
  // The mix modes that decide how a year's need is split across the stock accounts
  // (taxable / traditional / Roth), shared by the standard cascade and the bucket
  // strategy. Chosen in this order:
  //  1. an explicit per-year mix candidate (an optimizer override or an applied
  //     schedule): taxable, traditional AND Roth in that year's split;
  //  2. the live mix toggle: the cheaper of taxable-first or traditional-first,
  //     cascading fully into the other for any shortfall, respecting the
  //     remaining safe-MAGI room;
  //  3. smooth withdrawals: taxable and traditional in proportion to balances.
  // Returns false when no mix mode is active, so the caller runs its own default
  // order. `solver` is the bisection bracket for traditional draws (the two
  // strategies keep their own, see solveTraditionalForNetFromNeed). Written
  // against the take*() primitives so the account model can change underneath.
  function drawMixedStockAccounts(wd, { age, remainingMagiRoom, solver }) {
    const { bal } = wd;
    const mixCandidate =
      optimizerState.withdrawalMixByAge && optimizerState.withdrawalMixByAge.has(age)
        ? optimizerState.withdrawalMixByAge.get(age)
        : state.appliedMixSchedule && Object.prototype.hasOwnProperty.call(state.appliedMixSchedule, age)
          ? state.appliedMixSchedule[age]
          : 0;
    // Mix weights see only the money this tier may use: penalty-free traditional (and, while penalized
    // money exists, penalty-free Roth).
    const freeTrad = bal.traditional * tradGroup(wd, false).share,
      freeRoth = wd.penaltyAware ? rothFreeCaps(wd, 'roth').reduce((sum, c) => sum + c, 0) : bal.roth;
    const mixWeights = withdrawalMixWeights(mixCandidate, bal.taxable, freeTrad, freeRoth);
    if (mixWeights && wd.need > 0) {
      wd.mixCandidate = mixCandidate;
      const [wTaxable, wTraditional, wRoth] = mixWeights;
      const taxableShare = wd.need * wTaxable,
        traditionalShare = wd.need * wTraditional,
        rothShare = wd.need * wRoth;
      wd.need -= takeTaxable(wd, 'taxable', taxableShare);
      if (traditionalShare > 0 && freeTrad > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
      if (rothShare > 0 && freeRoth > 0) wd.need -= takeRoth(wd, 'roth', rothShare);
    } else if (state.withdrawalMixEnabled && wd.need > 0) {
      // 'live' is a display-only marker, not a WITHDRAWAL_MIX_CANDIDATES id.
      wd.mixCandidate = 'live';
      const free = tradGroup(wd, false),
        live = pickLiveWithdrawalOrder(
          wd.need,
          bal.taxable,
          wd.magiCap ? Math.min(freeTrad, magiCapLeft(wd)) : freeTrad,
          bal.taxableBasis,
          wd.profile,
          wd.taxableGainGross,
          wd.traditionalGross,
          0,
          remainingMagiRoom,
        );
      bal.taxable -= live.fromTaxable;
      bal.taxableBasis -= live.taxableBasisTaken;
      wd.taxableGainGross += live.taxableGain;
      wd.taxableWithdrawn += live.fromTaxable;
      accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, free.slots, live.fromTraditional);
      bal.traditional -= live.fromTraditional;
      wd.traditionalGross += live.fromTraditional;
      wd.traditionalWithdrawn += live.fromTraditional;
      wd.cappableTraditional += live.fromTraditional;
      wd.earlyPenalty += live.penalty;
      wd.need = live.remainingNeed;
    } else if (state.smoothWithdrawals) {
      const pool = bal.taxable + freeTrad;
      if (pool > 0 && wd.need > 0) {
        const taxableShare = wd.need * (bal.taxable / pool),
          traditionalShare = wd.need * (freeTrad / pool);
        wd.need -= takeTaxable(wd, 'taxable', taxableShare);
        if (traditionalShare > 0 && freeTrad > 0)
          wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
      }
    } else return false;
    return true;
  }
  // The standard (non-bucket) withdrawal strategy, used by simulate(). First the
  // discretionary draw from taxable / traditional (and Roth, for an explicit
  // mix): a mix mode (drawMixedStockAccounts) or, by default, taxable first then
  // traditional. Any shortfall then falls through Roth, cash, the bond-reserve
  // buckets (a protected sequence-risk reserve, tapped only after everything
  // else) and finally home equity. `remainingMagiRoom` is the safe-MAGI headroom
  // left after this year's Roth conversion.
  function withdrawStandard(wd, { age, remainingMagiRoom }) {
    const { bal } = wd;
    if (!drawMixedStockAccounts(wd, { age, remainingMagiRoom, solver: solveTraditionalForNet })) {
      wd.need -= takeTaxable(wd, 'taxable', wd.need);
      if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need));
    }
    // The bond reserve keeps its place under a MAGI cap (uncapped draw): the cliff plan steers the stock-account step
    // and what precedes the reserve, never the reserve's own order.
    const bondTrad = () => {
      if (wd.need > 0 && bal.bondTraditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed, false, true));
    };
    if (wd.penaltyAware) {
      // Penalized money exists: cash and the taxable bond reserve come before Roth basis (decision 10),
      // penalty-free Roth before anything penalized, home equity last. A bisection overshoot from the
      // draws above is dropped, not credited back to cash (the live mix clamps it the same way).
      wd.need = Math.max(0, wd.need);
      wd.need -= takeCash(wd, wd.need);
      wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
      bondTrad();
      wd.need -= takeRoth(wd, 'roth', wd.need);
      wd.need -= takeRoth(wd, 'bondRoth', wd.need);
      releaseMagiCap(wd, solveTraditionalForNet);
      takeInherited(wd);
      takePenalized(wd, solveTraditionalForNet);
    } else {
      wd.need -= takeRoth(wd, 'roth', wd.need);
      wd.need -= takeCash(wd, wd.need);
      wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
      bondTrad();
      wd.need -= takeRoth(wd, 'bondRoth', wd.need);
      releaseMagiCap(wd, solveTraditionalForNet);
      takeInherited(wd);
    }
    if (wd.need > 0) wd.need -= takeHomeEquity(wd, wd.need);
  }
  // The bucket strategy's draws, one per bucket, in the two orders (built once, not per year).
  // A draw that leaves a tiny overshoot is clamped to zero remaining need.
  const BUCKET_STEP = {
    cash: (wd) => (wd.need -= takeCash(wd, wd.need)),
    bondTaxable: (wd) => {
      if (wd.bal.bondTaxable > 0) wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
    },
    taxable: (wd) => {
      if (wd.bal.taxable > 0) wd.need -= takeTaxable(wd, 'taxable', wd.need);
    },
    bondTraditional: (wd) => {
      if (wd.bal.bondTraditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed, false, true));
    },
    traditional: (wd) => {
      if (wd.bal.traditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solveTraditionalForNetFromNeed));
    },
    bondRoth: (wd) => {
      wd.need = Math.max(0, wd.need - takeRoth(wd, 'bondRoth', wd.need));
    },
    roth: (wd) => {
      wd.need = Math.max(0, wd.need - takeRoth(wd, 'roth', wd.need));
    },
    home: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      takeInherited(wd);
      if (wd.need > 0) wd.need -= takeHomeEquity(wd, wd.need);
    },
    // The stock accounts as one grouped step: a mix mode when one is active (the
    // same code the standard cascade uses), otherwise taxable -> traditional -> Roth.
    // Cash and the bond buckets keep their own place in the order.
    stocks: (wd, opts) => {
      if (!drawMixedStockAccounts(wd, { age: opts.age, remainingMagiRoom: opts.remainingMagiRoom, solver: solveTraditionalForNetFromNeed })) {
        BUCKET_STEP.taxable(wd);
        if (wd.need > 0) BUCKET_STEP.traditional(wd);
      }
      // While penalized money exists Roth is its own step later (withdrawBucketPenaltyAware).
      if (wd.need > 0 && !wd.penaltyAware) BUCKET_STEP.roth(wd);
    },
    penalized: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      takeInherited(wd);
      if (wd.need > 0) takePenalized(wd, solveTraditionalForNetFromNeed);
    },
  };
  // @@shared:BUCKET_DOWN_YEAR_ORDER begin
  const BUCKET_DOWN_YEAR_ORDER = ['cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'stocks', 'home'].map((k) => BUCKET_STEP[k]);
  const BUCKET_UP_YEAR_ORDER = ['stocks', 'cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'home'].map((k) => BUCKET_STEP[k]);
  // The bucket-strategy withdrawal used by simulateHistorical(): cash and bonds
  // are a sequence-risk reserve. In a market-down year (yearReturn < 0) spending
  // comes from cash, then the bond-reserve buckets, and only then from the
  // stock accounts (taxable, tax-deferred, tax-free) and home equity. In an up
  // year it comes from the stock accounts first, then cash, bonds and home, and
  // any shortfall in the bond reserve versus `bondTarget` is topped back up from
  // the same stock-account order. The stock accounts are one grouped step whose
  // split follows the user's mix mode (see BUCKET_STEP.stocks); `opts` carries
  // what that step needs (age, remainingMagiRoom). A draw that leaves a tiny
  // overshoot is clamped to zero remaining need.
  function withdrawBucket(wd, opts) {
    const { yearReturn, bondTarget } = opts;
    for (const step of yearReturn < 0 ? BUCKET_DOWN_YEAR_ORDER : BUCKET_UP_YEAR_ORDER) if (wd.need > 0) step(wd, opts);
    if (yearReturn >= 0)
      refillBondReserve(wd, bondTarget, { maxMove: opts.refillCap });
  }
  // @@shared:BUCKET_DOWN_YEAR_ORDER end
  // The bucket strategy while penalized money exists (US): the same two years, but every step draws
  // only penalty-free money, cash and the bond reserve come before Roth basis in an up year too, and a
  // penalized tier (cheapest per dollar) runs just before home equity.
  const BUCKET_DOWN_PENALIZED_ORDER = ['cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'stocks', 'roth', 'penalized', 'home'].map((k) => BUCKET_STEP[k]);
  const BUCKET_UP_PENALIZED_ORDER = ['stocks', 'cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'roth', 'penalized', 'home'].map((k) => BUCKET_STEP[k]);
  function withdrawBucketPenaltyAware(wd, opts) {
    const { yearReturn, bondTarget } = opts;
    for (const step of yearReturn < 0 ? BUCKET_DOWN_PENALIZED_ORDER : BUCKET_UP_PENALIZED_ORDER) if (wd.need > 0) step(wd, opts);
    if (yearReturn >= 0) refillBondReserve(wd, bondTarget, { maxMove: opts.refillCap });
  }
  // @@shared:10-refillBondReserve begin
  // Tops the bond reserve up toward bondTarget by moving stocks into bonds: traditional first,
  // then Roth, then taxable only as a last resort when neither has anything left to move.
  //  - Inside a retirement account it is a reallocation, not a sale or a withdrawal: no income, no
  //    tax, no early-withdrawal penalty (age does not restrict it).
  //  - From taxable it is a real sale: drawTaxable sells enough stock that, after the tax on the
  //    realized gain, the amount moved into bonds is what was asked. The gain is added to
  //    wd.taxableGainGross, so it counts in the year's tax, MAGI (ACA, IRMAA) and the MAGI
  //    iteration, and the tax is paid out of the proceeds; the new bonds are bought at market
  //    (full basis). The live withdrawal mix does not plan for it (it decides before the refill).
  // Gradual: at most `maxMove` moves into bonds per call (the engine passes one year of that
  // year's expenses, net of lump expenses). Cash and home equity are never used. Surplus cash
  // refills the reserve separately (routeSurplus), limited only by the surplus and the target.
  function refillBondReserve(wd, bondTarget, { maxMove = Infinity } = {}) {
    const { bal } = wd;
    const bondDeficit = Math.max(0, bondTarget - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth));
    let remaining = Math.min(bondDeficit, maxMove);
    if (remaining <= 0) return;
    const fromTrad = Math.min(bal.traditional, remaining);
    bal.traditional -= fromTrad;
    bal.bondTraditional += fromTrad;
    remaining -= fromTrad;
    if (remaining > 0) {
      const fromRoth = Math.min(bal.roth, remaining);
      bal.roth -= fromRoth;
      bal.bondRoth += fromRoth;
      remaining -= fromRoth;
    }
    if (remaining > 0) {
      const d = drawTaxable(bal.taxable, bal.taxableBasis, remaining, wd.profile, wd.taxableGainGross, wd.traditionalGross);
      bal.taxable -= d.taken;
      bal.taxableBasis -= d.basisTaken;
      bal.bondTaxable += d.net;
      bal.bondTaxableBasis += d.net;
      wd.taxableGainGross += d.gain;
    }
  }
  // @@shared:10-refillBondReserve end
  // ---- end withdrawal building blocks ----




  // ---- end per-year helpers ----

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
  // Cliff plan: `planMode` is 'off' (no steering), 'choose' (the phased year: converge the natural year, try each candidate
  // plan as its own converged iteration, keep the winner and record its intent; deterministic run only, refreshCliffPlan) or
  // 'apply' (follow `plan.intents`). Undefined: 'apply' with the plan of the projected state (planForState), 'off' when
  // there is none (the guard off). This is the first statement: planForState may run nested projections.
  function runProjection({ mode, source, retireAgeA, retireAgeB, trace = null, planTrace = null, planMode, plan = null }) {
    if (planMode === undefined) {
      plan = planForState();
      planMode = plan ? 'apply' : 'off';
    }
    const phased = planMode === 'choose' || planMode === 'apply',
      intents = planMode === 'choose' ? {} : null;
    const singlePerson = !!state.singlePerson;
    if (singlePerson) retireAgeB = retireAgeA;
    // Only the historical source reports a start year; it also adds cumFactor to each row.
    const isHistorical = source.startYear !== undefined;
    // Partner A's share of the pooled traditional balance (normalizeState
    // already clamps this to 0-100) — see traditionalShareA/B below.
    const opening = openingAccounts();
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
      traditional: sumSlots(opening.trad),
      roth: sumSlots(opening.roth),
      cash: state.cash,
      home: state.tenure === 'own' ? state.homeValue : 0,
      mortgage: state.tenure === 'own' ? state.mortgage : 0,
      // E1e: the open inherited accounts (sums of the ledger; always present so the shape is fixed).
      inheritedTrad: 0,
      inheritedRoth: 0,
    };
    const schedule = mortgageSchedule(),
      loans = loanSchedules(),
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
    const rothAccts = rothAccountsNew();
    // Per-account shares of the traditional and Roth pools (see accountsNew).
    const accts = accountsNew();
    let depletedAge = null,
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
    // E3 (spec 5.1): whether the couple was married when a partner died (the lookback reads joint tiers for entered returns from
    // before the death). False without a death, in single-person mode, or for an unmarried couple.
    const marriedAtDeath = deathYear < Infinity && !singlePerson && (state.marryLater ? state.ageA + deathYear >= state.marriageAgeA : state.filingStatus === 'mfj');
    // E1e: the inherited accounts of this run (null for every state without an inherited row).
    const inh = inheritedLedger(state.oneTimeIncome, { ageA: state.ageA, ageB: state.ageB, single: singlePerson, currentYear, deathYear, deceasedIsA, deceasedIsB });
    if (inh !== null) {
      for (let i = 0; i < inh.n; i++) if (inh.open[i] === 1) { if (inh.roth[i]) bal.inheritedRoth += inh.bal[i]; else bal.inheritedTrad += inh.bal[i]; }
    }
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
    // E3 (spec 5.2): the IRMAA appeal events of this run (null for most runs). Built after the death clamp of retireAgeA/B.
    const appeal = irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears });
    // Cliff plan: growth of the IRMAA tiers over the two-year lookback, at the plan's assumed inflation.
    const irmaaGrowth2 = (1 + source.inflation) * (1 + source.inflation);
    for (let age = state.ageA, year = 0; year <= projectionYears; age++, year++) {
      const { stockReturn, bondReturn, bondYield, factor, limitFactor } = source.yearInputs(year);
      const ageB = singlePerson ? null : state.ageB + year,
        workingA = age < retireAgeA,
        workingB = !singlePerson && ageB < retireAgeB,
        working = workingA || workingB,
        isSurvivorPeriod = year >= deathYear;
      const incomeFactor = Math.pow(1 + wageGrowth, year);
      // E1c: a self-employed partner's main income is business profit, not wages.
      const seMainA = workingA && state.incomeKindA === 'self' ? state.incomeA * incomeFactor : 0,
        seMainB = workingB && state.incomeKindB === 'self' ? state.incomeB * incomeFactor : 0;
      const wageA = workingA && state.incomeKindA !== 'self' ? state.incomeA * incomeFactor : 0,
        wageB = workingB && state.incomeKindB !== 'self' ? state.incomeB * incomeFactor : 0;
      const { extraIncome, streams, lumps, oneTimeAmount, extraExpense, lumpExpense } = listAmountsForYear({
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
        if (testHooks.testInhForce !== null && testHooks.testInhForce.year === year) {
          inh.draw[testHooks.testInhForce.slot] += testHooks.testInhForce.x;
          if (inh.slot[testHooks.testInhForce.slot] === 0) INH_OUT.drawA += testHooks.testInhForce.x;
          else INH_OUT.drawB += testHooks.testInhForce.x;
        }
        inhDrawA = INH_OUT.drawA; inhDrawB = INH_OUT.drawB; inhDraw = inhDrawA + inhDrawB; inhRothPayout = INH_OUT.rothPayout;
      }
      // E1d: Social Security wages for the wage base, payroll tax and the profile (a wages lump has no premium, no
      // contribution and no coverage, so it never touches `streams`).
      const ssWagesA = lumpYear ? streams.wagesA + lumpWagesA : streams.wagesA,
        ssWagesB = lumpYear ? streams.wagesB + lumpWagesB : streams.wagesB;
      const paychecks = paychecksPerYear[state.payFrequency] || 26;
      const healthPremiumA = workingA && state.incomeKindA !== 'self' ? state.healthPremiumA * paychecks * factor * medicalGrowth(year) : 0,
        healthPremiumB = !singlePerson && workingB && state.incomeKindB !== 'self' ? state.healthPremiumB * paychecks * factor * medicalGrowth(year) : 0;
      // E1c: self-employment profit per person (main income plus self streams), SE tax, its deductible half and the net
      // earnings that carry the Additional Medicare Tax. Social Security wages (net of the premium) use up the wage base.
      const seA = seMainA + streams.selfA,
        seB = seMainB + streams.selfB;
      let seTaxA = 0, halfA = 0, seNeA = 0, seTaxB = 0, halfB = 0, seNeB = 0;
      if (seA > 0) {
        selfEmploymentTax(seA, Math.max(0, wageA - healthPremiumA) + Math.max(0, ssWagesA - streams.premiumA), year, SE_OUT);
        seTaxA = SE_OUT.tax; halfA = SE_OUT.half; seNeA = SE_OUT.ne;
      }
      if (seB > 0) {
        selfEmploymentTax(seB, Math.max(0, wageB - healthPremiumB) + Math.max(0, ssWagesB - streams.premiumB), year, SE_OUT);
        seTaxB = SE_OUT.tax; halfB = SE_OUT.half; seNeB = SE_OUT.ne;
      }
      // E1c: employer health coverage this year: a W-2 main job while working, or a W-2 stream with a premium. It replaces
      // "working" in every health-insurance rule (marketplace eligibility, Medicare, IRMAA); `workingX` keeps its meaning
      // for pay, contributions and account statuses.
      const employerA = (workingA && state.incomeKindA !== 'self') || streams.coverA,
        employerB = (workingB && state.incomeKindB !== 'self') || streams.coverB;
      let wages =
        wageA + wageB + extraIncome - healthPremiumA - healthPremiumB - streams.premiumA - streams.premiumB + seMainA + seMainB;
      // E1d: the taxable part of the year's one-time income enters the cash flow (appended: the old sum order is unchanged).
      if (lumpYear) wages += lumpFlow;
      const {
        traditionalContribA, traditionalContribB, traditionalContrib, rothContrib, acct: acctContrib,
        employerContrib: employerMatch, streamWageCutA, streamWageCutB, soloPlanCutA, soloPlanCutB, soloIraCutA, soloIraCutB,
      } = retirementContributions({
        wageA, wageB, age, ageB, singlePerson, limitFactor,
        streamList: streams.contrib, streamWagesA: streams.wagesA, streamWagesB: streams.wagesB,
        seA, seB, seMainA, seMainB, halfA, halfB,
      });
      const { ssA, ssB, ss } =
        socialSecurityIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
      const { pensionA, pensionB, pension } =
        pensionIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
      const { traditionalBeforeRmd, rmdA, rmdB, rmd, sepp72A, sepp72B, seppSlots, seppActive, seppLocked } = requiredDistributions({
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
      const housingYear = housingForYear(year, factor, schedule, futureBuy);
      const housing = housingYear.housing;
      if (housingYear.mortgage !== null) bal.mortgage = housingYear.mortgage;
      if (housingYear.homeValue !== null) bal.home = housingYear.homeValue;
      const { loanPayment } = loanPaymentForYear({ year, deathYear, isSurvivorPeriod, loans });
      const { filing } = filingStatusFor({ age, singlePerson, isSurvivorPeriod, year, deathYear });
      // E1c: 162(l) is barred in a year the person has employer coverage, or could join a spouse's employer plan (an
      // unticked box means no affordable offer; an unmarried partner's employer never bars it).
      const jointYear = filingRow(filing).joint && !singlePerson && !isSurvivorPeriod,
        seAllowA = seA > 0 && !employerA && !(jointYear && employerB && state.employerCoversSpouseB),
        seAllowB = seB > 0 && !employerB && !(jointYear && employerA && state.employerCoversSpouseA);
      // Dividends and interest earned this year on start-of-year balances;
      // taxed now (via profile.invOrd/invQual) and counted in MAGI.
      const inv = investmentIncome(bal.taxable, bal.bondTaxable, bal.cash, bondYield, hysa);
      const { otherA, otherB, profile } = buildTaxProfile({
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
        const yr = stateRuleForYear(year);
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
      const [acaEligibleA, acaEligibleB] = acaEligibility({
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
        const scalarSnapshot = { depletedAge, firstWithdrawal };
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
        if (state.incomeSources.length > 0) {
          COVER_CTX.ageA = age + 2; COVER_CTX.ageB = singlePerson ? null : ageB + 2; COVER_CTX.single = singlePerson;
          COVER_CTX.deadA = deceasedIsA && year + 2 >= deathYear; COVER_CTX.deadB = deceasedIsB && year + 2 >= deathYear;
          cover2 = streamCoverBits(state.incomeSources, COVER_CTX);
        }
        for (let iter = 0; ; iter++) {
          if (iter > 0) {
            Object.assign(bal, balSnapshot);
            ({ depletedAge, firstWithdrawal } = scalarSnapshot);
            Object.assign(guardrails, guardrailSnapshot);
            rothAccountsRestore(rothAccts, ledgerSnapshot);
            accountsRestore(accts, acctSnapshot);
            if (inh !== null) inheritedRestore(inh);
          }
          profile.ownerShareA = ownerShareA0;
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
          state.rothConvEnabled && age >= state.rothConvStartAge && age <= state.rothConvEndAge;
        // The ceiling is computed every year: it sizes a conversion and bounds the withdrawal order.
        // Uses this year's estimated discretionary income (estTrad/estGain), same
        // as magiProxy below — see the iteration note in the year loop.
        const preConvMagi = magiBase + estTrad + estGain;
        let preMagiA = 0,
          preMagiB = 0;
        if (twoReturns) [preMagiA, preMagiB] = returnMagis(profile, estTrad, estGain, estInhA, estInhB);
        const magiCeiling = conversionMagiCeiling({
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
        };
        // The cost at another (discretionary traditional + conversion, gains) pair and a 162(l) deduction pair (E1c; the
        // pass's estimate unless given): the forced pass prices the realized one, and 3C's solver prices its candidates.
        let lastCost = null;
        // E1c decisions 9, 10 and 12: the search for the deduction to hold (below the convergence test), built on first use in this pass, so a
        // pass that never searches allocates nothing. Results in seFixA / seFixB / seNeedAlt.
        let seSearch = null,
          seFixA = 0,
          seFixB = 0,
          seNeedAlt = false;
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
          lastCost = healthcareCost(hcArgs);
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
          medA = !(survivor2 && deceasedIsA) && age + 2 >= 65 && !((state.incomeKindA !== 'self' && age + 2 < retireAgeA) || (cover2 & 1) !== 0),
          medB = !singlePerson && !(survivor2 && deceasedIsB) && ageB + 2 >= 65 && !((state.incomeKindB !== 'self' && ageB + 2 < retireAgeB) || (cover2 & 2) !== 0);
        const irmaaAt = (trad, gain, ia = estInhA, ib = estInhB) => {
          if (!medA && !medB) return 0;
          if (twoReturns) {
            // E1c: priced on the pass's 162(l) estimate, as costAt.
            const ra = profile.seHealthA, rb = profile.seHealthB;
            profile.seHealthA = estSeA;
            profile.seHealthB = estSeB;
            const [ma, mb] = returnMagis(profile, trad, gain, ia, ib);
            profile.seHealthA = ra;
            profile.seHealthB = rb;
            return (
              (medA ? irmaaSurcharge(irmaaMagiOf(ma, profile.ssA || 0, irmaaStA) / irmaaGrowth2, 'single', year) : 0) +
              (medB ? irmaaSurcharge(irmaaMagiOf(mb, profile.ssB || 0, 'single') / irmaaGrowth2, 'single', year) : 0)
            );
          }
          const s = irmaaSurcharge(irmaaMagiOf(inh === null ? magiBase + trad + gain : magiBase - estInhA - estInhB + ia + ib + trad + gain, irmaaSsH, filing) / irmaaGrowth2, filing, year);
          return (medA ? s : 0) + (medB ? s : 0);
        };
        // lambda for the year, from the start-of-year traditional pool; computed once (on first use) and held. Its pool
        // walk is net of the traditional share (of investable money at the start of the year) of this year's need,
        // leaving out this year's lump expenses (spec 13.1, 13.2). Only called from the withdrawal plan, after `flow` is known.
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
            ? Math.max(0, (lumpYear ? -flow - lumpExpense + lumpFlow : -flow - lumpExpense) + inhNeedAdj)
            : Math.max(0, lumpYear ? -flow - lumpExpense + lumpFlow : -flow - lumpExpense);
          yearLambdaNeed = lambdaNeed;
          return (yearLambda = lambdaEstimate({ tradPool: tradNow, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor, need: lambdaNeed, tradShare: inv > 0 ? tradNow / inv : 0 }));
        };
        // Phased year: a stay-under plan converts nothing; a fill keeps the natural year's conversion, never more than this
        // pass's ceiling allows (spec 13.5).
        if (convertsThisYear && !(phased && yearPlan.kind === 'under')) {
          const conversionCap = Math.min(Math.max(0, traditionalBeforeRmd - rmd - seppLocked), magiSafeRoom);
          conversionAmount = solveRothConversion(profile, conversionCap, year, age);
          if (phased && yearPlan.kind === 'fill' && conversionAmount > naturalRec.conversion) conversionAmount = naturalRec.conversion;
        }
        magiProxy = magiBase + conversionAmount + estTrad + estGain;
        // Provisional (this pass's estimate); overwritten with the realized MAGI at
        // the end of the year. Only the plan's first-year IRMAA stand-in reads it.
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
          baseSpendingNominal(age, year, factor, incomeFactor) *
          guardrailSpendingMultiplier(guardrails, working) *
          (isSurvivorPeriod ? pct(state.survivorSpendingPct) : 1);
        if (lumpYear) guardrails.prevPortfolio = null; // E1d decision 11: the year after a lump year holds
        // acaEligibleA/B (computed above, before the Roth-conversion guard) say
        // which partners are on the individual market this year.
        hcArgs.magiProxy = magiProxy;
        hcArgs.magiA = magiA;
        hcArgs.magiB = magiB;
        const hcOut = healthcareCost(hcArgs);
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
        const ficaTax = payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, filing, year, streamWagesA: ssWagesA, streamWagesB: ssWagesB, streamPremiumA: streams.premiumA, streamPremiumB: streams.premiumB, seTaxA, seTaxB, seNeA, seNeB });
        const tax = taxFor(profile, 0, conversionAmount) + ficaTax;
        // E1e decisions 15, 16 (spec 6.7): the need as if the inheritance were not there: the scheduled draw net of its own tax and of
        // the premium credit it costs this year. One taxFor and one healthcareCost per pass, only in a draw year.
        if (inhDraw > 0 && !testHooks.testInhNoNeedAdj) {
          testHooks.inhNoDrawCalls++;
          const oA = profile.otherA, oB = profile.otherB, iA = profile.inheritedA, iB = profile.inheritedB,
            on = profile.inhOn, eA = profile.inhExclA, eB = profile.inhExclB, med = profile.medicalExpense;
          // the premium at the pass's MAGI less the draw (each return less its own share in a two-return year)
          hcArgs.magiProxy = magiProxy - inhDraw;
          if (twoReturns) { hcArgs.magiA = magiA - iA; hcArgs.magiB = magiB - iB; }
          const hcNoDraw = healthcareCost(hcArgs).healthcare;
          hcArgs.magiProxy = magiProxy; hcArgs.magiA = magiA; hcArgs.magiB = magiB;
          profile.otherA = oA - iA; profile.otherB = oB - iB;
          profile.inheritedA = 0; profile.inheritedB = 0; profile.inhOn = false; profile.inhExclA = 0; profile.inhExclB = 0;
          profile.medicalExpense = seLive ? hcNoDraw + ltc - (seRealA + seRealB) : hcNoDraw + ltc;
          const taxNoDraw = taxFor(profile, 0, conversionAmount) + ficaTax;
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
        growBalances(bal, { stockReturn, bondReturn, hysa, homeGrowth, inv });
        if (inh !== null) inheritedApply(inh, bal, stockReturn, factor, year);
        // A 72(t) payment comes out of its own account; each partner's RMD out of their own accounts
        // pro rata (a single person or the survivor owns everything, so that draw is pro rata and no
        // share moves).
        const seppPaid = seppSlots[0] + seppSlots[1] + seppSlots[2] + seppSlots[3];
        if (seppPaid > 0) accountsDrawSlots(accts.trad, bal.traditional + bal.bondTraditional, seppSlots);
        if (rmd > seppPaid && !singlePerson && !isSurvivorPeriod)
          accountsDraw(accts.trad, bal.traditional + bal.bondTraditional - seppPaid, [rmdA - sepp72A, rmdB - sepp72B]);
        withdrawRequiredDistributions(bal, rmd);
        applyRothConversion(bal, rothAccts, accts, conversionAmount, year, seppActive);
        bal.cash += oneTimeAmount;
        if (inhRothPayout > 0) bal.cash += inhRothPayout; // E1e: the inherited Roth payout is a transfer (no tax, no MAGI)
        const reserveTarget = state.cashReserve * factor;
        sweepExcessCash(bal, reserveTarget);
        // Ramp linearly over whatever time is actually available before
        // retirement, so the full target is always reached by rotationEndYear
        // (retirement itself) regardless of how large bondYears is set.
        const ladderGain = rotateIntoBondLadder(bal, { year, ...ladder }, profile, conversionAmount);
        const gpBase = bal.taxable + bal.bondTaxable + bal.traditional + bal.bondTraditional + bal.roth + bal.bondRoth + bal.cash;
        // E1e: the portfolio the rate is measured on includes the open inherited accounts and the year's draw (the portfolio before it).
        const guardrailPortfolioNow = inh === null ? gpBase : gpBase + bal.inheritedTrad + bal.inheritedRoth + inhDraw;
        const wd = newWithdrawal({ bal, rothAccts, accts, seppActive, profile, conversionAmount, rmd, inh, inhRule: inh === null ? null : stateRuleForYear(year) });
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
            totalTax = ficaTax + taxFor(profile, ladderGain, conversionAmount);
            totalIncome += ladderGain;
          }
          // E1e: a surplus the scheduled draw created still records the household's need as if the inheritance were not there.
          if (!lumpYear && inhNeedAdj > 0 && -flow + inhNeedAdj > 0) {
            const n = Math.max(0, -flow - lumpExpense + inhNeedAdj);
            if (!working && year === retirementYear) firstWithdrawal = n;
            recordGuardrailWithdrawal(guardrails, n, guardrailPortfolioNow, working);
          }
        } else {
          wd.need = -flow;
          // E1d decision 7: a year with a taxable lump records no guardrail withdrawal and no firstWithdrawal.
          if (!lumpYear) {
            const recorded = inhNeedAdj !== 0 ? Math.max(0, wd.need - lumpExpense + inhNeedAdj) : Math.max(0, wd.need - lumpExpense);
            if (!working && year === retirementYear) firstWithdrawal = recorded;
            recordGuardrailWithdrawal(guardrails, recorded, guardrailPortfolioNow, working);
          }
          // Discretionary traditional / bondTraditional withdrawals (RMDs and 72(t) SEPP payments
          // are mandatory, handled above, and never penalized) owe the 10% early-withdrawal
          // penalty from an account unless its owner is 59.5+ or the account is a 401(k) covered
          // by Rule of 55; see accountStatuses.
          const statusCtx = { age, ageB, isSurvivorPeriod, deceasedIsA, workingA, workingB, retireAgeA, retireAgeB };
          wd.status = accountStatuses(statusCtx);
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
          totalTax = ficaTax + taxFor(profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty;
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
        if ((profile.seAllowA || profile.seAllowB) && !forcedPass && !replaying && seSearch === null && !seHeld && unconverged) {
          seSearch = (trad, gain) => {
            // Step 1 of either method (Rev. Proc. 2014-41 section 5): the deduction at the full premiums (priced at a MAGI above
            // every line). Nothing to hold at a $0 deduction (the Solo plan took the whole net, no premium, no cap): the year
            // goes on as it did before the switch existed.
            costAt(trad, gain, -1e12, -1e12, inhRealA, inhRealB);
            seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
            const d1A = SE_HEALTH[0],
              d1B = SE_HEALTH[1];
            seFixA = 0;
            seFixB = 0;
            seNeedAlt = false;
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
            const rootOf = (top, slot, otherSe) => {
              const probe = (d) => (slot < 0 ? allowedAt(Math.min(d, capA), d - Math.min(d, capA), -1) : slot === 0 ? allowedAt(d, otherSe, 0) : allowedAt(otherSe, d, 1)) - d;
              if (!(top > 0)) return 0;
              if (probe(top) >= 0) return top;
              let lo = 0,
                hi = top;
              for (let i = 0; i < 60 && hi - lo > 0.01; i++) {
                const mid = (lo + hi) / 2;
                if (probe(mid) >= 0) lo = mid;
                else hi = mid;
              }
              return probe(lo) <= 1 ? lo : -1;
            };
            if (!twoReturns) {
              const t = rootOf(d1A + d1B, -1, 0);
              if (t >= 0) {
                seFixA = Math.min(t, capA);
                seFixB = t - seFixA;
                okA = okB = true;
              } else seNeedAlt = true;
            } else {
              const ra = rootOf(d1A, 0, d1B),
                rb = rootOf(d1B, 1, d1A);
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
        // A held deduction is not re-checked at the final draws (decision 12). It was priced on the draws of the pass that failed to
        // converge, and the year then re-ran with draws that respond to it; a second search there (decision 11) could flip across the
        // 400% line and deduct more than the premium paid (224 of 8,610 grid years, worst $12,829), which the law forbids. The hold
        // stays: where the draws move afterwards it can be understated (legal, conservative), never above the premium paid in the
        // grid (tests/se_health.js, invariant grid). The exact settlement at the final draws is Batch 5's.
        if (forcedPass && flow < 0) {
          // Charge the cost at the realized MAGI, return the difference to cash, and re-price the tax (the medical deduction follows the
          // premium). The cash can only rise: the refund is larger than the tax the lower deduction adds (and a held 162(l)
          // deduction, below, is not re-priced at all).
          const realizedCost = costAt(traditionalGross, taxableGainGross, seRealA, seRealB, inhRealA, inhRealB),
            refund = healthcare - realizedCost;
          healthcare = realizedCost;
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
          const taxAfter = ficaTax + taxFor(profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty;
          bal.cash += refund + (totalTax - taxAfter);
          totalTax = taxAfter;
          // The guardrail and the first-withdrawal figure were recorded with the premium that was charged before the refund: record the
          // need net of it (the pass restarts the guardrail's last-year figures from their start-of-year values).
          const needNet = -flow - refund;
          const recordedNet = inhNeedAdj !== 0 ? Math.max(0, needNet - lumpExpense + inhNeedAdj) : Math.max(0, needNet - lumpExpense);
          if (!lumpYear && !working && year === retirementYear) firstWithdrawal = recordedNet;
          guardrails.initialWR = guardrailSnapshot.initialWR;
          if (!lumpYear) recordGuardrailWithdrawal(guardrails, recordedNet, guardrailPortfolioNow, working); // E1d decision 7
        }
        // The year's actual MAGI (all realized income, conversion and
        // withdrawals included): what the IRMAA lookback reads two years on.
        // E1c: net of the realized 162(l) deduction (also after a forced pass).
        let realizedMagi = seLive ? magiBase0 - (seRealA + seRealB) + traditionalGross + taxableGainGross : magiBase0 + traditionalGross + taxableGainGross;
        if (inh !== null) realizedMagi += inhRealA + inhRealB; // E1e: the last-resort draws (appended)
        // Phased year, at the end of a phase (see the phase notes above the loop).
        if (phased && !replaying) {
          let next = -1;
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
                  ? magiThresholds({ year, filing, twoReturns, profile, preMagi: preConvMagi + conversionAmount, preMagiA: preMagiA + convA, preMagiB: preMagiB + conversionAmount - convA, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA: employerA, workingB: employerB, age, ageB, irmaa: { filing, a: medA || inYrA, b: medB || inYrB }, irmaaGrowth: inYrA || inYrB ? 1 : irmaaGrowth2, irmaaGrowthA: inYrA ? 1 : irmaaGrowth2, irmaaGrowthB: inYrB ? 1 : irmaaGrowth2, lo, hi })
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
                naturalRec = { plan: NO_PLAN, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seA: seRealA, seB: seRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, realizedTrad, gain: taxableGainGross, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, cliffCost: healthcare + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB), ok: true, score: lam ? afterTaxValue(bal, lam.lambda, lam.tauGain) - irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB) : null };
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
              cliffCost = healthcare + irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB);
            trialRecs.push({ plan: yearPlan, estTrad, estGain, estSeA, estSeB, estInhA, estInhB, inhA: inhRealA, inhB: inhRealB, seHeld, seKind, forced: forcedPass, unresolved: phaseUnresolved, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, cliffCost, ok: met && wd.need <= 1 && naturalRec.cliffCost - cliffCost > 1, score: afterTaxValue(bal, lam.lambda, lam.tauGain) - irmaaAt(traditionalGross, taxableGainGross, inhRealA, inhRealB) });
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
        // Historical rows also carry the running inflation factor (real-dollar charts divide by it).
        if (isHistorical) row.cumFactor = factor;
        if (twoReturns) {
          row.magiA = magiHistoryA[year];
          row.magiB = magiHistoryB[year];
        }
        // E3 (spec 5.6): a year whose IRMAA charge an appeal lowered (flat scalars, only in those rows: historical_parity
        // compares non-numbers with !==).
        if (appealYrA >= 0) {
          row.irmaaAppealYearA = taxYearOf(appealYrA);
          row.irmaaAppealKindA = irmaaAppealKind(appeal.eventA, year, appealYrA);
        }
        if (appealYrB >= 0) {
          row.irmaaAppealYearB = taxYearOf(appealYrB);
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
          });
        }
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
      ...mortgageResultAges(futureBuy, schedule),
    };
    // Cliff plan scan measure (spec 6, "Known, accepted"): a path stay-under under an IRMAA line saves nothing when the
    // path's own charged tier puts both MAGIs in the same tier.
    for (const c of irmaaChecks) {
      if (c.y > projectionYears) continue;
      planStats.irmaaStayUnders++;
      if (irmaaSurcharge(c.nat, c.filing, c.y) === irmaaSurcharge(c.trial, c.filing, c.y)) planStats.irmaaZeroSaving++;
    }
    // Cliff plan: the intents `choose` recorded, keyed by Partner A's age (not enumerable: the result's fields are unchanged).
    if (intents) Object.defineProperty(result, 'cliffIntents', { value: intents });
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
        cash: bal.cash,
        homeEquity: Math.max(0, bal.home - bal.mortgage),
        profile: endTax ? endTax.profile : null,
        lastGain: endTax ? endTax.lastGain : 0,
        lastTrad: endTax ? endTax.lastTrad : 0,
      },
    });
    return result;
  }


  // Every candidate is a standard (deterministic) run: afterTaxEndValueUS reads the run's own tax law, which a historical
  // run's per-path tax factors no longer carry once it returns (standard runs only).
  // The plan for the current `state`, touching no module plan variable. Planning never sees a historical path's tax
  // factors: a nested call (planForState at the start of a historical run) saves and restores them.
  function computeCliffPlan() {
    if (!state.cliffGuardEnabled) return { plan: null, report: null };
    const prevFactors = histTaxFactors;
    assignHistTaxFactors(null);
    try {
      const run = (planMode, plan) =>
        runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode, plan });
      const infl = pct(state.inflation);
      // cost: lifetime tax plus healthcare in today's dollars (the sum tests/solver_scan.js takes).
      const measure = (family, intents, sim) => {
        let cost = 0;
        for (const r of sim.rows) cost += (r.tax + r.healthcare) / Math.pow(1 + infl, r.year);
        return { family, intents, n: Object.keys(intents).length, depletedAge: sim.depletedAge, value: afterTaxEndValueUS(sim), cost };
      };
      const chosen = run('choose', null),
        all = chosen.cliffIntents,
        pick = (fam) => Object.fromEntries(Object.entries(all).filter(([, i]) => lineFamily(i.line) === fam));
      const fams = new Set(Object.values(all).map((i) => lineFamily(i.line)));
      // A choose run that records no intent is the off run, row for row (pinned in tests/cliff_plan.js): reuse it.
      const cands = [measure('none', {}, fams.size ? run('off', null) : chosen)];
      if (fams.size > 1)
        for (const fam of ['aca', 'irmaa']) {
          const sub = pick(fam);
          cands.push(measure(fam, sub, run('apply', { intents: sub })));
        }
      if (fams.size) cands.push(measure('all', all, chosen));
      let best = cands[0];
      for (const c of cands.slice(1)) if (planCandidateBetter(c, best)) best = c;
      return {
        plan: { intents: best.intents, family: best.family },
        report: { candidates: cands.map((c) => ({ family: c.family, intents: c.n, depletedAge: c.depletedAge, value: c.value, cost: c.cost })), kept: best.family },
      };
    } finally {
      assignHistTaxFactors(prevFactors);
    }
  }
  // Plans for the current state (top of render()) and records which state object the plan belongs to. The plan is re-chosen
  // only when the inputs change: same state JSON, tax year and optimizer overrides keep the plan already computed.
  function refreshCliffPlan() {
    const key = JSON.stringify(state);
    cliffPlanStore.forState = state;
    if (cliffPlanStore.computed && key === cliffPlanStore.key && cliffPlanStore.year === currentYear && cliffPlanStore.overrides && cliffPlanStore.overrides[0] === optimizerState.rothBracketByAge && cliffPlanStore.overrides[1] === optimizerState.withdrawalMixByAge) return;
    cliffPlanStore.key = key;
    cliffPlanStore.year = currentYear;
    cliffPlanStore.overrides = [optimizerState.rothBracketByAge, optimizerState.withdrawalMixByAge];
    ({ plan: cliffPlanStore.plan, report: cliffPlanStore.report } = computeCliffPlan());
    cliffPlanStore.computed = true;
    cliffPlanStore.computes++;
  }
  // The plan a default projection applies (spec section 3, "Stale plans"): the dashboard and in-place variants project the
  // object render() planned for; a swapped-in or replaced state (comparison, overlay, load / undo / reset before render)
  // gets the plan of its own inputs under the current tax year, cached by the year and their JSON (refreshCliffPlan keys on
  // the year too). The state-replacement sites are in shared regions and are not edited: this is the whole stale-plan rule.
  function planForState() {
    if (state === cliffPlanStore.forState && cliffPlanStore.year === currentYear) return cliffPlanStore.plan;
    if (!state.cliffGuardEnabled) return null;
    const key = JSON.stringify(state);
    if (key === cliffPlanStore.key && cliffPlanStore.year === currentYear) return cliffPlanStore.plan;
    const cacheKey = currentYear + '|' + key;
    if (cliffPlanCache.has(cacheKey)) return cliffPlanCache.get(cacheKey);
    const plan = computeCliffPlan().plan;
    if (cliffPlanCache.size >= CLIFF_PLAN_CACHE_MAX) cliffPlanCache.clear();
    cliffPlanCache.set(cacheKey, plan);
    return plan;
  }

  // @@shared:13-simulate begin
  function simulate(retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB) {
    return runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA, retireAgeB });
  }
  // Historical S&P 500 backtest. Runs the same engine as simulate() (same income,
  // contribution, tax, ACA, IRMAA and Roth-conversion mechanics) but drives stock returns,
  // inflation and bond returns from the actual 1928-2025 sequence (or a bootstrapped path)
  // and replaces the standard withdrawal cascade with a cash + bonds "bucket strategy":
  // expenses in a market-down year are paid from cash then the bond reserve only; in an up
  // year they are paid from taxable -> traditional -> Roth and the bond reserve is topped
  // back up from the same order. Cash/HYSA and mortgage still use the fixed rates from the
  // sidebar, since no historical series is loaded for either.
  function simulateHistorical(rowFn, retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB) {
    const prevTaxFactors = histTaxFactors;
    assignHistTaxFactors([]);
    try {
      return runProjection({ mode: BUCKET_MODE, source: historicalYearSource(rowFn), retireAgeA, retireAgeB });
    } finally {
      assignHistTaxFactors(prevTaxFactors);
    }
  }

  // Runs every historical start year with a full run of data available for
  // the current projection length and returns each cycle's outcome plus the
  // resulting success rate.
  function runHistoricalCycles() {
    const projectionYears = state.singlePerson
      ? Math.max(0, state.lifeExpectancyA - state.ageA)
      : Math.max(0, state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    const lastStart = HIST.length - 1 - projectionYears;
    if (lastStart < 0) return { cycles: [], successRate: null, projectionYears };
    const cycles = [];
    for (let i = 0; i <= lastStart; i++) cycles.push(simulateHistorical((y) => HIST[i + y]));
    const successRate = cycles.filter((c) => !c.depletedAge).length / cycles.length;
    return { cycles, successRate, projectionYears };
  }

  function runMonteCarlo(pathCount) {
    const projectionYears = state.singlePerson
      ? Math.max(0, state.lifeExpectancyA - state.ageA)
      : Math.max(0, state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    const length = projectionYears + 1,
      paths = [];
    for (let i = 0; i < pathCount; i++) {
      const series = bootstrapReturnSeries(length);
      paths.push(simulateHistorical((y) => series[y]));
    }
    const successRate = paths.filter((p) => !p.depletedAge).length / paths.length;
    return { paths, successRate, projectionYears };
  }
  // @@shared:13-simulate end

  function render() {
    // The cliff plan for this state, before anything projects (every run below applies it).
    refreshCliffPlan();
    document.body.classList.toggle('single-person', !!state.singlePerson);
    markDefaultFields();
    renderGroupSummaries();
    const countedEstimateIds = computeCountedEstimateIds();
    renderEstimateBadges(countedEstimateIds);
    renderEstimatedRollup(countedEstimateIds);
    const selected = simulate();
    const retirement =
        selected.rows.find((r) => r.year === selected.retirementYear) || selected.rows[0],
      end = selected.rows.at(-1);
    document.getElementById('retireAssets').textContent = compact(
      displayValue(retirement.investable, retirement.year),
    );
    document.getElementById('dashRetireAge').textContent = state.singlePerson
      ? `Age ${state.retireAgeA}`
      : `A ${state.retireAgeA} / B ${state.retireAgeB}`;
    document.getElementById('retireNW').textContent = compact(
      displayValue(retirement.total, retirement.year),
    );
    document.getElementById('retireAssetsSub').textContent = state.singlePerson
      ? `when retired at age ${retirement.age}`
      : `when both retire (A ${retirement.age} / B ${retirement.ageB})`;
    const lasts = document.getElementById('lastsTo');
    lasts.textContent = selected.depletedAge
      ? `Age ${selected.depletedAge}`
      : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    lasts.className = selected.depletedAge ? 'negative' : 'positive';
    document.getElementById('lastsSub').textContent = selected.depletedAge
      ? 'Projected shortfall begins'
      : 'No projected depletion';
    const preRetirement = selected.rows.find((r) => r.year === selected.retirementYear - 1),
      bondRow = preRetirement || retirement,
      bondAtRetirement = bondRow.bonds;
    document.getElementById('bondLadder').textContent = compact(
      displayValue(bondAtRetirement, bondRow.year),
    );
    const fundedYears = selected.ladderTarget
      ? bondAtRetirement / (selected.ladderTarget / getBondYears())
      : 0;
    document.getElementById('bondLadderSub').textContent =
      `${fundedYears.toFixed(1)} years of projected costs funded`;
    document.getElementById('payoffHint').textContent =
      state.tenure === 'own'
        ? selected.payoffAge === null
          ? 'Mortgage remains after the projection'
          : `Estimated payoff around age ${selected.payoffAge}`
        : '';
    if (state.tenure === 'rentThenBuy') {
      if (state.buyCash)
        document.getElementById('buyPayoffHint').textContent =
          `Purchased for cash at age ${state.buyAge}`;
      else if (selected.payoffAge === null)
        document.getElementById('buyPayoffHint').textContent =
          `Mortgage starts at age ${state.buyAge}; remains after the projection`;
      else
        document.getElementById('buyPayoffHint').textContent =
          `Mortgage starts at age ${state.buyAge}; estimated payoff around age ${selected.payoffAge}`;
    } else {
      document.getElementById('buyPayoffHint').textContent = '';
    }
    const currentInvestable = state.taxable + retirementTotal() + state.cash;
    // Both "nest egg" numbers compare liquid assets only (taxable, retirement
    // accounts, cash — never home equity) against yearly spending divided by
    // the chosen safe withdrawal rate.
    const swrPct = state.fiWithdrawalRate,
      multiple = fiMultiple(),
      multipleText = `${Number.isInteger(multiple) ? multiple : multiple.toFixed(1)}×`,
      fiNumber = selected.currentExpense * multiple,
      fireNumber = selected.retirementExpense * multiple;
    document.getElementById('fiNumber').textContent = compact(fiNumber);
    document.getElementById('fiNumberSub').textContent =
      `${fiNumber > 0 ? Math.min(999, (currentInvestable / fiNumber) * 100).toFixed(0) : 0}% funded · liquid assets only`;
    document.getElementById('fiNumberBasis').textContent =
      `FI number · ${compact(selected.currentExpense)}/yr × ${multipleText.slice(0, -1)}`;
    document.getElementById('fireNumber').textContent = compact(fireNumber);
    document.getElementById('fireNumberSub').textContent =
      `${fireNumber > 0 ? Math.min(999, (currentInvestable / fireNumber) * 100).toFixed(0) : 0}% funded · liquid assets only`;
    document.getElementById('fireNumberBasis').textContent =
      `FIRE number · ${compact(selected.retirementExpense)}/yr × ${multipleText.slice(0, -1)}`;
    const workForever = simulate(110, 110),
      crossing = workForever.rows.find((r) => r.investable >= fireNumber);
    document.getElementById('fiRetireAge').textContent = crossing
      ? `Age ${crossing.age}`
      : 'Beyond plan horizon';
    document.getElementById('fiRetireAgeSub').textContent = crossing
      ? 'first age liquid assets reach your retirement nest egg, at current savings rate'
      : 'Retirement nest egg not reached by your plan’s life expectancy at this savings rate';
    const stateTip = document.querySelector('label[for="stateTax"] .info-tip');
    if (stateTip) stateTip.dataset.tip = stateTaxTipText();
    document.getElementById('stateTaxNote').innerHTML =
      stateTaxTreatmentNote() + ' ' + STATE_TAX_NOT_MODELED_NOTE;
    document.getElementById('viewCaption').textContent =
      mode === 'real'
        ? 'Values shown in inflation-adjusted 2026 dollars.'
        : 'Future nominal dollars; expenses rise with inflation each year.';
    updateChartXAxisButtons();
    renderChartView(selected);
    renderTable(selected);
    annotateSolverRows(selected);
    annotateInheritedRows(selected);
    annotateAppealRows(selected);
    // The "More results" card is inside a shared markup region, so the summary line is added here, not in the markup.
    let planLine = document.getElementById('cliffPlanSummary');
    if (!planLine) {
      planLine = document.createElement('p');
      planLine.id = 'cliffPlanSummary';
      planLine.className = 'hint';
      planLine.style.margin = '12px 0 0';
      document.querySelector('#moreResultsCard > summary').after(planLine);
    }
    planLine.textContent = cliffPlanSummary(cliffPlanStore.plan, cliffPlanStore.report);
    renderPlanHeadline(selected);
    renderShortfallBanner(selected);
    renderUnusualAssumptions(selected);
    if (document.getElementById('sensitivityCard').open) renderTornadoChart(selected);
    const rothOptimizerCard = document.getElementById('rothOptimizerCard');
    rothOptimizerCard.hidden = !state.rothConvEnabled;
    if (state.rothConvEnabled && rothOptimizerCard.open) renderRothOptimizer(selected);
    renderMultiLeverAppliedStatus();
    if (document.getElementById('sankeyCard').open) renderSankey(selected);
    if (document.getElementById('decisionCard').open) renderDecisionQuestionPreviews();
    window.fireProjection = {
      mode,
      retirementAgeA: state.retireAgeA,
      retirementAgeB: state.retireAgeB,
      mortgagePayoffAge: selected.payoffAge,
      investableAtRetirement: displayValue(retirement.investable, retirement.year),
      netWorthAtRetirement: displayValue(retirement.total, retirement.year),
      depletedAge: selected.depletedAge,
      endAssets: displayValue(end.total, end.year),
    };
    window.fireProjectionRows = selected.rows;
    renderScenarioComparison();
    renderPlanStatusBar();
  }

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
  // @@shared:14-findMinimalSpendingCut begin
  // are reported whenever any of them helps, because they're a specific,
  // non-obvious diagnosis. Only when none of them help does it fall back to
  // the generic levers everyone always has (spending, retirement timing) —
  // for those it searches for the smallest magnitude of change that actually
  // resolves the shortfall (rather than testing one arbitrary fixed amount),
  // so the person can judge whether the "fix" is a minor tweak or a major
  // compromise, which is the real judgment call for someone genuinely
  // deciding between working longer and spending less.
  function findMinimalSpendingCut(selected) {
    if (!(state.spending > 0)) return null;
    const saved = state.spending;
    let resolvedAt = null;
    for (let cutPct = 5; cutPct <= 90; cutPct += 5) {
      state.spending = saved * (1 - cutPct / 100);
      const r = simulate();
      if (!r.depletedAge) {
        resolvedAt = { cutPct, result: r };
        break;
      }
    }
    if (resolvedAt) {
      state.spending = saved;
      return {
        label: 'household spending',
        detail: `cutting household spending by ${resolvedAt.cutPct}%`,
        result: resolvedAt.result,
        magnitude: resolvedAt.cutPct / 90,
        resolved: true,
      };
    }
    state.spending = saved * 0.1; // largest tested cut: 90%
    const r90 = simulate();
    state.spending = saved;
    const improvement = r90.depletedAge ? r90.depletedAge - selected.depletedAge : 0;
    if (improvement <= 0) return null;
    return {
      label: 'household spending',
      detail: 'even a 90% cut to household spending',
      result: r90,
      improvement,
      magnitude: 1,
      resolved: false,
    };
  }
  function findMinimalRetirementDelay(selected) {
    const secondAge = (yrs) => (state.singlePerson ? state.retireAgeB : state.retireAgeB + yrs);
    for (let yrs = 1; yrs <= 15; yrs++) {
      const r = simulate(state.retireAgeA + yrs, secondAge(yrs));
      if (!r.depletedAge) {
        return {
          label: 'retirement timing',
          detail: `retiring ${yrs} year${yrs === 1 ? '' : 's'} later`,
          result: r,
          magnitude: yrs / 15,
          resolved: true,
        };
      }
    }
    const r15 = simulate(state.retireAgeA + 15, secondAge(15));
    const improvement = r15.depletedAge ? r15.depletedAge - selected.depletedAge : 0;
    if (improvement <= 0) return null;
    return {
      label: 'retirement timing',
      detail: 'even retiring 15 years later',
      result: r15,
      improvement,
      magnitude: 1,
      resolved: false,
    };
  }
  // @@shared:14-findMinimalSpendingCut end
  function analyzeShortfallDrivers(selected) {
    if (!selected.depletedAge) return null;
    const structuralCandidates = [];
    if (state.ltcEnabled) {
      structuralCandidates.push({
        label: 'long-term care costs',
        detail: 'modeling no long-term care costs at all',
        run: () => {
          const saved = state.ltcEnabled;
          state.ltcEnabled = false;
          const r = simulate();
          state.ltcEnabled = saved;
          return r;
        },
      });
    }
    if (state.healthcare > 0) {
      structuralCandidates.push({
        label: 'post-retirement health insurance premiums',
        detail: 'zeroing out the post-retirement health insurance premium',
        run: () => {
          const saved = state.healthcare;
          state.healthcare = 0;
          const r = simulate();
          state.healthcare = saved;
          return r;
        },
      });
    }
    let bestStructural = null;
    for (const c of structuralCandidates) {
      const r = c.run();
      const improvement = r.depletedAge ? r.depletedAge - selected.depletedAge : 999;
      if (improvement <= 0) continue;
      if (!bestStructural || improvement > bestStructural.improvement) {
        bestStructural = { label: c.label, detail: c.detail, improvement, result: r, kind: 'structural' };
      }
    }
    if (bestStructural) return bestStructural;

    // No single cost assumption explains it — fall back to the two levers
    // everyone always has, and report the smaller of the two "asks".
    const genericCandidates = [findMinimalSpendingCut(selected), findMinimalRetirementDelay(selected)].filter(
      Boolean,
    );
    if (!genericCandidates.length) return null;
    const resolved = genericCandidates.filter((c) => c.resolved);
    const pool = resolved.length ? resolved : genericCandidates;
    let best = pool[0];
    for (const c of pool.slice(1)) {
      const better = resolved.length
        ? c.magnitude < best.magnitude
        : (c.improvement ?? 0) > (best.improvement ?? 0);
      if (better) best = c;
    }
    return { ...best, kind: 'generic' };
  }

  // @@shared:15-renderPlanHeadline begin
  function renderShortfallBanner(selected) {
    const banner = document.getElementById('shortfallBanner');
    const driver = analyzeShortfallDrivers(selected);
    if (!driver) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    const newLasts = driver.result.depletedAge
      ? `age ${driver.result.depletedAge}`
      : `the end of the projection (age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+), not depleted`;
    banner.hidden = false;
    const intro = `<b>What's driving this:</b> the plan is projected to run out of money at age ${selected.depletedAge}. `;
    const body =
      driver.kind === 'structural'
        ? `Of the levers tested, <b>${driver.label}</b> has the biggest single effect — with ${driver.detail}, the portfolio instead lasts to ${newLasts}. This isn't necessarily the only fix or the right one for you; it's just the single change (among a few common ones) that moved the needle most.`
        : `No single cost or income assumption tested here explains it — this looks like a general balance-of-spending-vs-savings shortfall rather than one specific driver. The smallest change (of the two generic levers everyone has) that ${driver.resolved ? 'fully resolves it' : 'helps most'}: <b>${driver.detail}</b>, which brings the portfolio to ${newLasts}.`;
    banner.innerHTML = intro + body;
  }
  // @@shared:15-renderPlanHeadline end

  // Sensitivity ("tornado") analysis: for each of a handful of key
  // assumptions, sweeps it up and down by a fixed amount (mutate/simulate/
  // restore, same pattern as simulateAtRealCagr() below) and records the
  // resulting end-assets value, holding every other input fixed. This is a
  // one-at-a-time sensitivity sweep, not a joint/probabilistic analysis like
  // Monte Carlo — it answers "which single assumption matters most," not
  // "what's the range of likely outcomes." Which levers actually run is
  // controlled by the checkboxes in #sensLeverToggles (data-lever id ↔
  // this array's `id`), so a lever with no visible impact on your plan (e.g.
  // long-term care cost, if you haven't enabled LTC) can be left unchecked
  // rather than cluttering the chart with a zero-width bar.
  const SENSITIVITY_LEVERS = [
    {
      id: 'return',
      label: 'Investment return (±2pp)',
      run: (endValue) => {
        const saved = state.returnRate;
        state.returnRate = saved - 2;
        const decrease = endValue(simulate());
        state.returnRate = saved + 2;
        const increase = endValue(simulate());
        state.returnRate = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'retireAge',
      label: 'Retirement age (±3 yrs)',
      run: (endValue) => {
        const decrease = endValue(
          simulate(
            Math.max(state.ageA, state.retireAgeA - 3),
            Math.max(state.ageB, state.retireAgeB - 3),
          ),
        );
        const increase = endValue(
          simulate(Math.min(70, state.retireAgeA + 3), Math.min(70, state.retireAgeB + 3)),
        );
        return { decrease, increase };
      },
    },
    {
      id: 'spending',
      label: 'Household spending (±10%)',
      run: (endValue) => {
        const saved = state.spending;
        state.spending = saved * 0.9;
        const decrease = endValue(simulate());
        state.spending = saved * 1.1;
        const increase = endValue(simulate());
        state.spending = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'inflation',
      label: 'Inflation (±1pp)',
      run: (endValue) => {
        const saved = state.inflation;
        state.inflation = Math.max(0, saved - 1);
        const decrease = endValue(simulate());
        state.inflation = saved + 1;
        const increase = endValue(simulate());
        state.inflation = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'bondReturn',
      label: 'Bond return (±2pp)',
      run: (endValue) => {
        const saved = state.bondReturn;
        state.bondReturn = saved - 2;
        const decrease = endValue(simulate());
        state.bondReturn = saved + 2;
        const increase = endValue(simulate());
        state.bondReturn = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'hysa',
      label: 'HYSA / cash rate (±1pp)',
      run: (endValue) => {
        const saved = state.hysaRate;
        state.hysaRate = Math.max(0, saved - 1);
        const decrease = endValue(simulate());
        state.hysaRate = saved + 1;
        const increase = endValue(simulate());
        state.hysaRate = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'homeGrowth',
      label: 'Home appreciation (±1pp)',
      run: (endValue) => {
        const saved = state.homeGrowth;
        state.homeGrowth = saved - 1;
        const decrease = endValue(simulate());
        state.homeGrowth = saved + 1;
        const increase = endValue(simulate());
        state.homeGrowth = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'healthcare',
      label: 'Healthcare premium (±20%)',
      run: (endValue) => {
        const saved = state.healthcare;
        state.healthcare = saved * 0.8;
        const decrease = endValue(simulate());
        state.healthcare = saved * 1.2;
        const increase = endValue(simulate());
        state.healthcare = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'medicare',
      label: 'Medicare cost (±20%)',
      run: (endValue) => {
        const saved = state.medicareYearly;
        state.medicareYearly = saved * 0.8;
        const decrease = endValue(simulate());
        state.medicareYearly = saved * 1.2;
        const increase = endValue(simulate());
        state.medicareYearly = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'ltc',
      label: 'Long-term care cost (±20%)',
      run: (endValue) => {
        const savedA = state.ltcYearlyA,
          savedB = state.ltcYearlyB;
        state.ltcYearlyA = savedA * 0.8;
        state.ltcYearlyB = savedB * 0.8;
        const decrease = endValue(simulate());
        state.ltcYearlyA = savedA * 1.2;
        state.ltcYearlyB = savedB * 1.2;
        const increase = endValue(simulate());
        state.ltcYearlyA = savedA;
        state.ltcYearlyB = savedB;
        return { decrease, increase };
      },
    },
    {
      id: 'ss',
      label: 'Social Security (±10%)',
      run: (endValue) => {
        const savedA = state.ssMonthlyA,
          savedB = state.ssMonthlyB;
        state.ssMonthlyA = savedA * 0.9;
        state.ssMonthlyB = savedB * 0.9;
        const decrease = endValue(simulate());
        state.ssMonthlyA = savedA * 1.1;
        state.ssMonthlyB = savedB * 1.1;
        const increase = endValue(simulate());
        state.ssMonthlyA = savedA;
        state.ssMonthlyB = savedB;
        return { decrease, increase };
      },
    },
  ];
  // A compact one-line preview shown right on each "Explore a question"
  // @@shared:17-renderDecisionQuestionPreviews begin
  // Only the 6 kind:'compare' questions get a preview — the 2 kind:'open'
  // ones (sensitivity, returns) don't compare two scenarios, they just hand
  // off to an existing card, so there's nothing to preview. Gated by
  // #decisionCard's own open state (see its 'toggle' listener and the
  // matching render() call below), same lazy-compute pattern already used
  // for the tornado/Roth-optimizer/Sankey cards — these are up to 6
  // questions × 2-3 simulate() calls each, cheap individually but pointless
  // work on every keystroke while the card is collapsed and invisible.
  function renderDecisionQuestionPreviews() {
    Object.keys(DECISION_QUESTIONS).forEach((id) => {
      const q = DECISION_QUESTIONS[id];
      if (q.kind !== 'compare') return;
      const el = document.querySelector(`#decisionQuestions button[data-question="${id}"] .q-delta`);
      if (!el) return;
      el.textContent = compactDecisionDelta(q.run().rows);
    });
  }
  // Assigned by the mobile-tab setup further down; declared here (rather
  // than left to that block alone) so the 'open' questions below can flip
  // to the Dashboard tab before scrolling to a card that lives in
  // .content, which is display:none while the Inputs tab is active.
  let setMobileView = () => {};
  function switchToDashboardTab() {
    if (document.getElementById('workspace').dataset.mobileView === 'inputs') setMobileView('dashboard');
  }
  // @@shared:17-renderDecisionQuestionPreviews end
  const DECISION_QUESTIONS = {
    retireTiming: {
      kind: 'compare',
      run() {
        const current = simulate(),
          earlierA = Math.max(state.ageA, state.retireAgeA - 3),
          earlierB = Math.max(state.ageB, state.retireAgeB - 3),
          laterA = Math.min(70, state.retireAgeA + 3),
          laterB = Math.min(70, state.retireAgeB + 3),
          earlier = simulate(earlierA, earlierB),
          later = simulate(laterA, laterB);
        const rows = [
          { label: `3 yrs earlier (age ${earlierA})`, sim: earlier },
          { label: `Current (age ${state.retireAgeA})`, sim: current },
          { label: `3 yrs later (age ${laterA})`, sim: later },
        ];
        const sentence = `Retiring 3 years earlier ${decisionDeltaPhrase(current, earlier)} compared with your current plan. Retiring 3 years later ${decisionDeltaPhrase(current, later)}.`;
        return { rows, sentence };
      },
    },
    buyVsRent: {
      kind: 'compare',
      run() {
        const saved = state.tenure;
        state.tenure = 'own';
        const own = simulate();
        state.tenure = 'rent';
        const rent = simulate();
        state.tenure = saved;
        const rows = [
          { label: `Own${saved === 'own' ? ' (current)' : ''}`, sim: own },
          { label: `Rent${saved === 'rent' ? ' (current)' : ''}`, sim: rent },
        ];
        const rentThenBuyNote =
          saved === 'rentThenBuy'
            ? ` Your plan currently rents, then buys at Partner A age ${state.buyAge} — this comparison shows the two pure endpoints instead.`
            : '';
        const sentence = `Renting instead of owning ${decisionDeltaPhrase(own, rent)} compared with owning outright.${rentThenBuyNote}`;
        return { rows, sentence };
      },
    },
    rothLadder: {
      kind: 'compare',
      run() {
        const saved = state.rothConvEnabled;
        state.rothConvEnabled = false;
        const off = simulate();
        state.rothConvEnabled = true;
        const on = simulate();
        state.rothConvEnabled = saved;
        const rows = [
          { label: 'No Roth conversions', sim: off },
          {
            label: `Roth ladder (age ${state.rothConvStartAge}-${state.rothConvEndAge}, to ${state.rothConvBracket}% bracket)`,
            sim: on,
          },
        ];
        const sentence = `Running the Roth conversion ladder as configured ${decisionDeltaPhrase(off, on)} compared with no conversions.`;
        return { rows, sentence };
      },
    },
    mortgagePayoff: {
      kind: 'compare',
      // Only relevant with an actual current mortgage — the button itself
      // is hidden for tenure !== 'own' in syncControls(), so this only runs
      // when there's a real balance to accelerate.
      run() {
        const saved = state.extraPrincipal,
          // If the user hasn't set an extra-principal amount, $500/mo is a
          // reasonable stand-in so the comparison has something to show —
          // otherwise both rows would be identical (0 vs. 0).
          payExtra = saved > 0 ? saved : 500;
        state.extraPrincipal = 0;
        const invest = simulate();
        state.extraPrincipal = payExtra;
        const pay = simulate();
        state.extraPrincipal = saved;
        const rows = [
          { label: `Invest instead (no extra principal)${saved === 0 ? ' (current)' : ''}`, sim: invest },
          { label: `Pay extra ${money(payExtra)}/mo${saved === payExtra ? ' (current)' : ''}`, sim: pay },
        ];
        const sentence = `Paying an extra ${money(payExtra)}/mo toward the mortgage instead of investing it ${decisionDeltaPhrase(invest, pay)} compared with investing the difference.`;
        return { rows, sentence };
      },
    },
    longevity: {
      kind: 'compare',
      run() {
        const savedA = state.lifeExpectancyA,
          savedB = state.lifeExpectancyB;
        const current = simulate();
        state.lifeExpectancyA = Math.min(110, savedA + 10);
        state.lifeExpectancyB = state.singlePerson ? savedB : Math.min(110, savedB + 10);
        const longer = simulate();
        state.lifeExpectancyA = savedA;
        state.lifeExpectancyB = savedB;
        const rows = [
          { label: `Current (plan through age ${savedA})`, sim: current },
          { label: `Live 10 years longer (age ${Math.min(110, savedA + 10)})`, sim: longer },
        ];
        const sentence = `Planning for 10 more years than your current life expectancy ${decisionDeltaPhrase(current, longer)}.`;
        return { rows, sentence };
      },
    },
    sensitivity: {
      kind: 'open',
      open() {
        switchToDashboardTab();
        const card = document.getElementById('sensitivityCard');
        card.open = true;
        card.dispatchEvent(new Event('toggle'));
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
    returns: {
      kind: 'open',
      open() {
        switchToDashboardTab();
        setChartView('hist');
        document.getElementById('mainChartCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      note() {
        const { cycles, successRate } = runHistoricalCycles();
        if (!cycles.length) return '';
        return `Replayed against every real ${cycles.length}-year stretch of S&P 500 history since ${cycles[0].startYear}, this plan survived to the end of the projection in ${(successRate * 100).toFixed(0)}% of starting years.`;
      },
    },
  };
  // @@shared:18-computeSensitivity begin
  function computeSensitivity(selected) {
    const finalValue = (sim) => {
      const r = sim.rows.at(-1);
      return displayValue(r.total, r.year);
    };
    // If the *current* plan is projected to deplete before the end of the
    // modeled horizon, every row from the depletion age onward floors at
    // $0 — so "end assets" would show $0 for every single bar, hiding real
    // differences between assumptions (one lever might still deplete at 60,
    // another at 89, both reading as an identical, uninformative $0). Peak
    // portfolio value doesn't have that floor, so fall back to it in that
    // case; a healthy plan's peak is usually its final row anyway (assets
    // still growing or holding steady at the end), so this only changes
    // behavior in the depleted case it's meant to fix. The decision is made
    // once, from the baseline/current scenario, so every bar in the chart
    // is measuring the same thing rather than switching metric bar to bar.
    const peakValue = (sim) => Math.max(...sim.rows.map((r) => displayValue(r.total, r.year)));
    const usePeak = finalValue(selected) <= 1;
    const endValue = usePeak ? peakValue : finalValue;
    const baseline = endValue(selected);
    const checked = new Set(
      [...document.querySelectorAll('#sensLeverToggles input[data-lever]:checked')].map(
        (el) => el.dataset.lever,
      ),
    );
    const levers = SENSITIVITY_LEVERS.filter((l) => checked.has(l.id));
    const results = levers.map((l) => {
      const { decrease, increase } = l.run(endValue);
      return {
        label: l.label,
        decrease,
        increase,
        low: Math.min(decrease, increase),
        high: Math.max(decrease, increase),
      };
    });
    results.sort((a, b) => b.high - b.low - (a.high - a.low));
    return { baseline, results, usePeak };
  }
  // @@shared:18-computeSensitivity end

  // @@shared:renderTornadoChart begin
  function renderTornadoChart(selected) {
    const canvas = document.getElementById('tornadoChart');
    if (!canvas) return;
    const { baseline, results, usePeak } = computeSensitivity(selected);
    const note = document.getElementById('tornadoNote');
    if (note) {
      note.textContent = usePeak
        ? 'This plan is projected to deplete before the end of the modeled horizon, so end assets would be $0 for every bar — dashed line and bars instead measure peak portfolio value (labeled on the chart), so real differences between assumptions still show up. Bars show the range across a fixed ± swing in each assumption (not a probability distribution); "pp" = percentage points.'
        : 'Dashed line marks the current projection\'s end assets (labeled on the chart). Bars show the range across a fixed ± swing in each assumption (not a probability distribution); "pp" = percentage points.';
    }
    canvas.setAttribute(
      'aria-label',
      usePeak
        ? 'Sensitivity of projected peak portfolio value to key assumptions, sorted by impact'
        : 'Sensitivity of projected end assets to key assumptions, sorted by impact',
    );
    const rowH = 46,
      labelW = 190,
      p = { l: labelW, r: 66, t: 26, b: 10 };
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1),
      w = Math.max(340, rect.width),
      h = Math.max(1, results.length) * rowH + p.t + p.b;
    // .chart-wrap has a fixed CSS height everywhere else in this file (a
    // fixed-size line/bar chart), but this chart's height depends on how
    // many levers are checked — up to 10 now, not the original hardcoded 5
    // — so its own wrap needs to grow with it or the canvas overflows the
    // fixed-height box and overlaps the chart-note below.
    const wrap = canvas.closest('.chart-wrap');
    if (wrap) wrap.style.height = h + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.max(340, w * dpr);
    canvas.height = Math.max(150, h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!results.length) {
      ctx.font = '13px Inter,system-ui';
      ctx.fillStyle = chartAxisColor();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Check an assumption above to see its sensitivity.', w / 2, h / 2);
      return;
    }
    const allVals = results.flatMap((r) => [r.low, r.high]).concat([baseline]);
    let min = Math.min(...allVals),
      max = Math.max(...allVals);
    const pad = (max - min) * 0.1 || Math.max(1, Math.abs(baseline) * 0.1);
    min -= pad;
    max += pad;
    const x = (v) => p.l + ((v - min) / (max - min || 1)) * (w - p.l - p.r);
    const barColor = isDarkTheme() ? 'rgba(91,141,239,.5)' : 'rgba(37,99,235,.32)',
      barStroke = isDarkTheme() ? '#5b8def' : '#2563eb';
    results.forEach((r, i) => {
      const y = p.t + i * rowH + rowH / 2,
        barY = y - 9,
        barH = 18,
        x1 = x(r.low),
        x2 = x(r.high);
      ctx.textBaseline = 'middle';
      ctx.font = '12px Inter,system-ui';
      ctx.fillStyle = chartAxisColor();
      ctx.textAlign = 'left';
      ctx.fillText(r.label, 0, y);
      ctx.fillStyle = barColor;
      ctx.fillRect(Math.min(x1, x2), barY, Math.max(1, Math.abs(x2 - x1)), barH);
      ctx.strokeStyle = barStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.min(x1, x2), barY, Math.max(1, Math.abs(x2 - x1)), barH);
      ctx.font = '11px Inter,system-ui';
      ctx.fillStyle = chartAxisColor();
      ctx.textAlign = 'right';
      ctx.fillText(compact(r.low), Math.min(x1, x2) - 6, y);
      ctx.textAlign = 'left';
      ctx.fillText(compact(r.high), Math.max(x1, x2) + 6, y);
    });
    const bx = x(baseline);
    ctx.strokeStyle = chartZeroLineColor();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(bx, p.t - 4);
    ctx.lineTo(bx, h - p.b + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = `Current${usePeak ? ' (peak)' : ''}: ${compact(baseline)}`;
    ctx.font = '700 11px Inter,system-ui';
    const labelHalfW = ctx.measureText(label).width / 2,
      labelX = Math.min(w - p.r - labelHalfW, Math.max(p.l + labelHalfW, bx));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = chartAxisColor();
    ctx.fillText(label, labelX, p.t - 10);
  }
  // @@shared:renderTornadoChart end

  function computeRothOptimizer(selected) {
    const candidates = [...document.getElementById('rothConvBracket').options].map((o) =>
      Number(o.value),
    );
    const savedEnabled = state.rothConvEnabled,
      savedBracket = state.rothConvBracket;
    const results = candidates.map((bracket) => {
      state.rothConvEnabled = true;
      state.rothConvBracket = bracket;
      const sim = simulate();
      const end = sim.rows.at(-1);
      return {
        bracket,
        endAssets: displayValue(end.total, end.year),
        lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(r.tax, r.year), 0),
        depletedAge: sim.depletedAge,
      };
    });
    state.rothConvEnabled = savedEnabled;
    state.rothConvBracket = savedBracket;
    // "Not worse" = doesn't deplete when the current plan doesn't, and doesn't
    // deplete earlier when it does — a lifetime-tax-minimizing bracket that
    // shortens the portfolio's life isn't actually an improvement.
    const notWorse = results.filter((r) =>
      selected.depletedAge ? !r.depletedAge || r.depletedAge >= selected.depletedAge : !r.depletedAge,
    );
    const pool = notWorse.length ? notWorse : results;
    const best = pool.reduce((a, b) => (b.lifetimeTax < a.lifetimeTax ? b : a));
    return { results, best, currentBracket: savedBracket };
  }
  function optimizeMultiLever(selected, options) {
    const includeRoth = !!(options && options.includeRoth),
      includeMix = !!(options && options.includeMix),
      includeSmooth = !!(options && options.includeSmooth);
    const rothYearsFull = [];
    for (let a = state.rothConvStartAge; a <= state.rothConvEndAge; a++) rothYearsFull.push(a);
    const mixStartAge = state.singlePerson ? state.retireAgeA : Math.min(state.retireAgeA, state.retireAgeB),
      mixEndAge = state.singlePerson ? state.lifeExpectancyA : Math.max(state.lifeExpectancyA, state.lifeExpectancyB);
    const mixYearsFull = [];
    for (let a = mixStartAge; a <= mixEndAge; a++) mixYearsFull.push(a);
    const rothTruncated = includeRoth && rothYearsFull.length > ROTH_PER_YEAR_MAX_WINDOW;
    const mixTruncated = includeMix && mixYearsFull.length > ROTH_PER_YEAR_MAX_WINDOW;
    const rothYears = includeRoth ? (rothTruncated ? rothYearsFull.slice(0, ROTH_PER_YEAR_MAX_WINDOW) : rothYearsFull) : [];
    const mixYears = includeMix ? (mixTruncated ? mixYearsFull.slice(0, ROTH_PER_YEAR_MAX_WINDOW) : mixYearsFull) : [];
    // Union, sorted — used for the "nothing to optimize" check and as the
    // table's row list downstream; the two lever windows don't have to
    // coincide or even overlap.
    const activeYears = Array.from(new Set([...rothYears, ...mixYears])).sort((a, b) => a - b);
    const truncated = rothTruncated || mixTruncated;

    const savedEnabled = state.rothConvEnabled,
      savedBracket = state.rothConvBracket,
      savedSmooth = state.smoothWithdrawals,
      savedRothOverride = optimizerState.rothBracketByAge,
      savedMixOverride = optimizerState.withdrawalMixByAge;
    if (includeRoth) state.rothConvEnabled = true;
    // Guardrail reference: the plan as it's actually configured right
    // now (selected), not a recomputed baseline — same reference point
    // the flat optimizer above uses, so "doesn't deplete earlier than
    // what you have today" means the same thing in every one of these
    // optimizers.
    const notWorseThanSelected = (depletedAge) =>
      selected.depletedAge ? !depletedAge || depletedAge >= selected.depletedAge : !depletedAge;

    let evalCount = 0;
    let budgetExhausted = false;
    function evaluate(rothMap, mixMap) {
      optimizerState.rothBracketByAge = includeRoth ? rothMap : null;
      optimizerState.withdrawalMixByAge = includeMix ? mixMap : null;
      const sim = simulate();
      evalCount++;
      return { cost: rothScheduleCost(sim), depletedAge: sim.depletedAge };
    }
    function coordinateAscent(startRoth, startMix) {
      const rothMap = new Map(startRoth),
        mixMap = new Map(startMix);
      let current = evaluate(rothMap, mixMap);
      let bestOverall = {
        rothSchedule: new Map(rothMap),
        mixSchedule: new Map(mixMap),
        cost: current.cost,
        depletedAge: current.depletedAge,
      };
      // One coordinate per (lever, age) pair that's actually active this
      // run — cyclic coordinate ascent sweeps every coordinate each pass,
      // regardless of which lever it belongs to, holding both maps fixed
      // except the one entry under test.
      const coords = [];
      if (includeRoth) rothYears.forEach((age) => coords.push({ lever: 'roth', age }));
      if (includeMix) mixYears.forEach((age) => coords.push({ lever: 'mix', age }));
      for (let pass = 0; pass < ROTH_PER_YEAR_MAX_PASSES && !budgetExhausted; pass++) {
        let changedThisPass = false;
        for (const { lever, age } of coords) {
          if (budgetExhausted) break;
          const map = lever === 'roth' ? rothMap : mixMap,
            candidates = lever === 'roth' ? ROTH_PER_YEAR_CANDIDATES : WITHDRAWAL_MIX_CANDIDATES;
          const currentCandidate = map.get(age);
          let best = { candidate: currentCandidate, cost: current.cost, depletedAge: current.depletedAge };
          for (const candidate of candidates) {
            if (candidate === currentCandidate) continue;
            if (evalCount >= optimizerState.rothPerYearEvalBudget) {
              budgetExhausted = true;
              break;
            }
            const trial = new Map(map);
            trial.set(age, candidate);
            const result = lever === 'roth' ? evaluate(trial, mixMap) : evaluate(rothMap, trial);
            if (notWorseThanSelected(result.depletedAge) && result.cost < best.cost) {
              best = { candidate, cost: result.cost, depletedAge: result.depletedAge };
            }
          }
          if (best.candidate !== currentCandidate) {
            map.set(age, best.candidate);
            current = { cost: best.cost, depletedAge: best.depletedAge };
            changedThisPass = true;
            if (current.cost < bestOverall.cost) {
              bestOverall = {
                rothSchedule: new Map(rothMap),
                mixSchedule: new Map(mixMap),
                cost: current.cost,
                depletedAge: current.depletedAge,
              };
            }
          }
        }
        if (!changedThisPass) break;
      }
      return bestOverall;
    }

    // Structured multi-starts, not random — reproducible/explainable for
    // a financial-planning recommendation. Six joint starting points cover
    // the corners a cliff-driven, two-lever cost landscape can create:
    // today's actual flat-bracket Roth setting with no mix override (also
    // useful on its own — "what would the flat optimizer recommend,
    // scored on the wider objective"), nothing at all, max Roth alone,
    // and the mix lever's two natural anchors (balance-proportional, and
    // taxable-preserve-traditional) each tried alone and combined with max
    // Roth — so a year where a deliberate mix choice beats converting, or
    // vice versa, isn't missed just because the other lever's aggressive
    // start crowded out its own room on the first pass. Harmless no-ops
    // for whichever lever isn't included this run.
    const flatRoth = new Map(rothYears.map((a) => [a, savedBracket])),
      zeroRoth = new Map(rothYears.map((a) => [a, 0])),
      maxRoth = new Map(rothYears.map((a) => [a, 35])),
      zeroMix = new Map(mixYears.map((a) => [a, 0])),
      balancedMix = new Map(mixYears.map((a) => [a, 'balanced'])),
      taxableMix = new Map(mixYears.map((a) => [a, 'taxable']));
    const starts = [
      [flatRoth, zeroMix],
      [zeroRoth, zeroMix],
      [maxRoth, zeroMix],
      [zeroRoth, balancedMix],
      [zeroRoth, taxableMix],
      [maxRoth, balancedMix],
    ];

    function runForSmooth(smoothValue) {
      if (includeSmooth) state.smoothWithdrawals = smoothValue;
      const runs = starts.map(([r, m]) => coordinateAscent(r, m));
      const notWorseRuns = runs.filter((r) => notWorseThanSelected(r.depletedAge));
      const pool = notWorseRuns.length ? notWorseRuns : runs;
      const best = pool.reduce((a, b) => (b.cost < a.cost ? b : a));
      return { ...best, smoothWithdrawals: smoothValue };
    }

    const smoothCandidates = includeSmooth ? [true, false] : [savedSmooth];
    const smoothRuns = smoothCandidates.map(runForSmooth);
    const notWorseSmoothRuns = smoothRuns.filter((r) => notWorseThanSelected(r.depletedAge));
    const smoothPool = notWorseSmoothRuns.length ? notWorseSmoothRuns : smoothRuns;
    const best = smoothPool.reduce((a, b) => (b.cost < a.cost ? b : a));

    state.rothConvEnabled = savedEnabled;
    state.rothConvBracket = savedBracket;
    state.smoothWithdrawals = savedSmooth;
    optimizerState.rothBracketByAge = savedRothOverride;
    optimizerState.withdrawalMixByAge = savedMixOverride;

    return {
      ...best,
      truncated,
      rothTruncated,
      mixTruncated,
      budgetExhausted,
      activeYears,
      rothYears,
      mixYears,
      evalCount,
      includeRoth,
      includeMix,
      includeSmooth,
    };
  }
  // Roth-only convenience wrapper, kept for the existing flat-window
  // single-lever card and its test suite — identical behavior/shape to
  // the original single-lever optimizer, implemented as the general
  // driver above with only the Roth lever included.
  function optimizeRothLadderPerYear(selected) {
    const r = optimizeMultiLever(selected, { includeRoth: true });
    return {
      schedule: r.rothSchedule,
      cost: r.cost,
      depletedAge: r.depletedAge,
      truncated: r.truncated,
      budgetExhausted: r.budgetExhausted,
      activeYears: r.activeYears,
      evalCount: r.evalCount,
    };
  }
  // @@shared:19-layoutSankeyColumn begin
  let sankeyTooltipEl = null;
  function ensureSankeyTooltip() {
    if (sankeyTooltipEl && document.body.contains(sankeyTooltipEl)) return sankeyTooltipEl;
    const wrap = document.getElementById('sankeySvg').closest('.chart-wrap');
    sankeyTooltipEl = document.createElement('div');
    sankeyTooltipEl.id = 'sankeyTooltip';
    sankeyTooltipEl.style.cssText =
      'position:absolute;pointer-events:none;background:rgba(15,23,42,.94);color:#fff;font-size:.72rem;padding:8px 10px;border-radius:8px;line-height:1.5;white-space:nowrap;display:none;z-index:6;box-shadow:0 6px 18px rgba(15,23,42,.25)';
    wrap.appendChild(sankeyTooltipEl);
    return sankeyTooltipEl;
  }
  function showSankeyTooltip(wrap, clientX, clientY, label, value, color) {
    const el = ensureSankeyTooltip();
    while (el.firstChild) el.removeChild(el.firstChild);
    const valueEl = document.createElement('div');
    valueEl.style.cssText = 'font-weight:700;font-size:.92rem';
    valueEl.textContent = money(value);
    const keyRow = document.createElement('div');
    keyRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px;color:#cbd5e1';
    const key = document.createElement('span');
    key.style.cssText = `display:inline-block;width:14px;height:2px;background:${color};flex:none`;
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    keyRow.appendChild(key);
    keyRow.appendChild(labelEl);
    el.appendChild(valueEl);
    el.appendChild(keyRow);
    const rect = wrap.getBoundingClientRect();
    let left = clientX - rect.left + 14,
      top = clientY - rect.top - 12;
    if (left + 170 > rect.width) left = clientX - rect.left - 184;
    if (left < 0) left = 4;
    el.style.left = left + 'px';
    el.style.top = Math.max(0, top) + 'px';
    el.style.display = 'block';
  }
  function hideSankeyTooltip() {
    if (sankeyTooltipEl) sankeyTooltipEl.style.display = 'none';
  }
  function renderSankey(selected) {
    const svg = document.getElementById('sankeySvg'),
      wrap = svg.closest('.chart-wrap'),
      rows = selected.rows,
      slider = document.getElementById('sankeyAge');
    slider.max = String(Math.max(0, rows.length - 1));
    const idx = Math.min(rows.length - 1, Math.max(0, Number(slider.value) || 0));
    slider.value = String(idx);
    const row = rows[idx];
    document.getElementById('sankeyAgeOut').textContent = `Age ${row.age}`;
    const { sources, uses, total } = computeSankeyFlow(row);
    const ns = 'http://www.w3.org/2000/svg',
      width = svg.clientWidth || 600,
      height = 360;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    hideSankeyTooltip();
    if (total <= 1) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', width / 2);
      t.setAttribute('y', height / 2);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', 'var(--muted)');
      t.textContent = 'No meaningful cash flow this year.';
      svg.appendChild(t);
      return;
    }
    const pad = 10,
      colW = 150,
      hubW = 26,
      leftX0 = pad,
      leftX1 = pad + colW,
      rightX1 = width - pad,
      rightX0 = rightX1 - colW,
      midSpan = rightX0 - leftX1,
      hubX0 = leftX1 + (midSpan - hubW) / 2,
      hubX1 = hubX0 + hubW,
      top = 32,
      bottom = height - 14;
    const dark = isDarkTheme(),
      haloColor = dark ? '#0d141d' : '#ffffff',
      textColor = dark ? '#e5e7eb' : '#1e293b',
      mutedFill = dark ? 'rgba(195,194,183,0.22)' : 'rgba(137,135,129,0.22)';
    const leftNodes = layoutSankeyColumn(sources, leftX0, leftX1, top, bottom, total),
      rightNodes = layoutSankeyColumn(uses, rightX0, rightX1, top, bottom, total);
    // Hub-face partitions are independent orderings (largest value first) of
    // the same categories — this is a pure layout choice (the hub retains no
    // per-source identity past its edge, so there's no pairing being implied)
    // and it's what produces genuine diagonal curvature rather than flat bands.
    const hubIn = layoutSankeyColumn(
        [...sources].sort((a, b) => b.value - a.value),
        hubX0,
        hubX0,
        top,
        bottom,
        total,
      ),
      hubOut = layoutSankeyColumn(
        [...uses].sort((a, b) => b.value - a.value),
        hubX1,
        hubX1,
        top,
        bottom,
        total,
      );
    const hubInByLabel = new Map(hubIn.map((n) => [n.label, n])),
      hubOutByLabel = new Map(hubOut.map((n) => [n.label, n]));

    // Hub bar + total label.
    const hubRect = document.createElementNS(ns, 'rect');
    hubRect.setAttribute('x', hubX0);
    hubRect.setAttribute('y', top);
    hubRect.setAttribute('width', hubW);
    hubRect.setAttribute('height', bottom - top);
    hubRect.setAttribute('rx', 4);
    hubRect.setAttribute('fill', mutedFill);
    svg.appendChild(hubRect);
    const totalLabel = document.createElementNS(ns, 'text');
    totalLabel.setAttribute('x', hubX0 + hubW / 2);
    totalLabel.setAttribute('y', top - 12);
    totalLabel.setAttribute('text-anchor', 'middle');
    totalLabel.setAttribute('font-size', '10');
    totalLabel.setAttribute('font-weight', '700');
    totalLabel.setAttribute('fill', 'var(--muted)');
    totalLabel.textContent = `Total ${compact(total)}`;
    svg.appendChild(totalLabel);

    const ribbonsGroup = document.createElementNS(ns, 'g');
    const addRibbon = (x0, y0a, y0b, x1, y1a, y1b, color, label, value) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', sankeyRibbonPath(x0, y0a, y0b, x1, y1a, y1b));
      path.setAttribute('fill', color);
      path.setAttribute('opacity', '0.6');
      path.style.cursor = 'pointer';
      path.setAttribute('tabindex', '0');
      const lift = () => path.setAttribute('opacity', '0.85');
      const drop = () => path.setAttribute('opacity', '0.6');
      path.addEventListener('pointerenter', (e) => {
        lift();
        showSankeyTooltip(wrap, e.clientX, e.clientY, label, value, color);
      });
      path.addEventListener('pointermove', (e) => showSankeyTooltip(wrap, e.clientX, e.clientY, label, value, color));
      path.addEventListener('pointerleave', () => {
        drop();
        hideSankeyTooltip();
      });
      path.addEventListener('focus', (e) => {
        lift();
        const r = path.getBoundingClientRect();
        showSankeyTooltip(wrap, r.left + r.width / 2, r.top + r.height / 2, label, value, color);
      });
      path.addEventListener('blur', () => {
        drop();
        hideSankeyTooltip();
      });
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${label}: ${money(value)}`;
      path.appendChild(title);
      ribbonsGroup.appendChild(path);
    };
    leftNodes.forEach((L) => {
      const H = hubInByLabel.get(L.label);
      addRibbon(leftX1, L.drawY0, L.drawY1, hubX0, H.drawY0, H.drawY1, L.color, L.label, L.value);
    });
    rightNodes.forEach((R) => {
      const H = hubOutByLabel.get(R.label);
      addRibbon(hubX1, H.drawY0, H.drawY1, rightX0, R.drawY0, R.drawY1, R.color, R.label, R.value);
    });
    svg.appendChild(ribbonsGroup);

    const drawNodes = (nodes, align) => {
      nodes.forEach((n) => {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', n.x0);
        rect.setAttribute('y', n.drawY0);
        rect.setAttribute('width', n.x1 - n.x0);
        rect.setAttribute('height', Math.max(1, n.drawY1 - n.drawY0));
        rect.setAttribute('rx', 3);
        rect.setAttribute('fill', n.color);
        rect.style.cursor = 'pointer';
        rect.setAttribute('tabindex', '0');
        const lift = () => rect.setAttribute('stroke', dark ? 'rgba(255,255,255,.55)' : 'rgba(11,11,11,.4)');
        const drop = () => rect.removeAttribute('stroke');
        rect.setAttribute('stroke-width', '1.5');
        rect.addEventListener('pointerenter', (e) => {
          lift();
          showSankeyTooltip(wrap, e.clientX, e.clientY, n.label, n.value, n.color);
        });
        rect.addEventListener('pointermove', (e) => showSankeyTooltip(wrap, e.clientX, e.clientY, n.label, n.value, n.color));
        rect.addEventListener('pointerleave', () => {
          drop();
          hideSankeyTooltip();
        });
        rect.addEventListener('focus', (e) => {
          lift();
          const r = rect.getBoundingClientRect();
          showSankeyTooltip(wrap, r.left + r.width / 2, r.top + r.height / 2, n.label, n.value, n.color);
        });
        rect.addEventListener('blur', () => {
          drop();
          hideSankeyTooltip();
        });
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${n.label}: ${money(n.value)}`;
        rect.appendChild(title);
        svg.appendChild(rect);
        if (n.y1 - n.y0 < 16) return;
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', align === 'left' ? n.x0 + 4 : n.x1 - 4);
        label.setAttribute('y', (n.y0 + n.y1) / 2 - 3);
        label.setAttribute('text-anchor', align === 'left' ? 'start' : 'end');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '700');
        label.setAttribute('fill', textColor);
        label.setAttribute('style', `paint-order:stroke;stroke:${haloColor};stroke-width:3px;stroke-linejoin:round;pointer-events:none`);
        label.textContent = n.label;
        svg.appendChild(label);
        const valueText = document.createElementNS(ns, 'text');
        valueText.setAttribute('x', align === 'left' ? n.x0 + 4 : n.x1 - 4);
        valueText.setAttribute('y', (n.y0 + n.y1) / 2 + 11);
        valueText.setAttribute('text-anchor', align === 'left' ? 'start' : 'end');
        valueText.setAttribute('font-size', '10');
        valueText.setAttribute('fill', textColor);
        valueText.setAttribute('style', `paint-order:stroke;stroke:${haloColor};stroke-width:3px;stroke-linejoin:round;pointer-events:none`);
        valueText.textContent = compact(n.value);
        svg.appendChild(valueText);
      });
    };
    drawNodes(leftNodes, 'left');
    drawNodes(rightNodes, 'right');
  }
  function renderRothOptimizer(selected) {
    const card = document.getElementById('rothOptimizerCard'),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows');
    const { results, best, currentBracket } = computeRothOptimizer(selected);
    const current = results.find((r) => r.bracket === currentBracket);
    const lastsLabel = (r) =>
      r.depletedAge
        ? `Age ${r.depletedAge}`
        : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target is already the lifetime-tax-minimizing choice among the available options here.`;
    } else {
      const savings = current.lifetimeTax - best.lifetimeTax;
      summaryEl.innerHTML = `Recommended: fill to the <b>${best.bracket}%</b> bracket instead of your current <b>${currentBracket}%</b> — an estimated <b>${money(savings)}</b> less lifetime tax (income + payroll, today's dollars) over the projection, without shortening how long the portfolio lasts.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? ' (current)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
      )
      .join('');
    card.hidden = false;
  }
  // @@shared:19-layoutSankeyColumn end
  // On-demand only (button click, not auto-run on card expand like the
  // flat optimizer above) — this is the heavier multi-second computation,
  // so it shouldn't fire every time the card is opened or a sibling field
  // changes.
  function renderRothPerYearOptimizer(selected) {
    const resultEl = document.getElementById('rothPerYearResult'),
      summaryEl = document.getElementById('rothPerYearSummary'),
      rowsEl = document.getElementById('rothPerYearRows');
    const opt = optimizeRothLadderPerYear(selected);
    if (opt.activeYears.length === 0) {
      resultEl.hidden = true;
      return;
    }
    // Re-simulate once more with the winning schedule active, purely to
    // read each year's actual conversionAmount for display — opt itself
    // only carries the schedule (bracket targets) and aggregate cost, not
    // the per-row dollar detail.
    optimizerState.rothBracketByAge = opt.schedule;
    const detail = simulate();
    optimizerState.rothBracketByAge = null;
    const rowsByAge = new Map(detail.rows.map((r) => [r.age, r]));

    const currentCost = rothScheduleCost(selected);
    const savings = currentCost - opt.cost;
    const targetLabel = (c) => (c === 0 ? 'Skip' : `${c}%`);
    let notes = '';
    if (opt.truncated) {
      notes += ` Your ladder window is wider than the ${ROTH_PER_YEAR_MAX_WINDOW} years this can optimize at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.activeYears.at(-1)}) are covered — narrow the window above to cover the rest.`;
    }
    if (opt.budgetExhausted) {
      notes += ' Stopped early after reaching its evaluation budget — showing the best schedule found so far, which may not be fully optimized.';
    }
    if (savings > 1) {
      summaryEl.innerHTML = `Recommended: a different fill target each year (see below) instead of a flat <b>${state.rothConvBracket}%</b> every year — an estimated <b>${money(savings)}</b> less lifetime tax + healthcare cost (today's dollars) than your current flat setting, without shortening how long the portfolio lasts.${notes}`;
    } else {
      summaryEl.innerHTML = `Your current flat <b>${state.rothConvBracket}%</b> setting is already at least as good as varying the target by year here.${notes}`;
    }
    rowsEl.innerHTML = opt.activeYears
      .map((age) => {
        const row = rowsByAge.get(age);
        const amount = row ? displayValue(row.conversionAmount, row.year) : 0;
        const candidate = opt.schedule.get(age);
        // A candidate can tie at $0 with every other candidate once that
        // year's traditional balance/conversion room is already
        // exhausted (e.g. a prior year converted aggressively) — showing
        // a specific bracket target next to $0 would read as a
        // meaningful choice when coordinate ascent just kept whichever
        // tied candidate it happened to land on.
        const label = amount < 1 ? '—' : targetLabel(candidate);
        return `<tr><td>${age}</td><td>${label}</td><td>${money(amount)}</td></tr>`;
      })
      .join('');
    resultEl.hidden = false;
  }
  // Generalized sibling of renderRothPerYearOptimizer above — same
  // on-demand-only pattern, but drives optimizeMultiLever() with whichever
  // of the 3 levers (Roth/mix/smooth) the checkboxes have turned on, and
  // builds its results table's columns dynamically around just those.
  function renderMultiLeverOptimizer(selected, options) {
    const resultEl = document.getElementById('multiLeverResult'),
      summaryEl = document.getElementById('multiLeverSummary'),
      headEl = document.getElementById('multiLeverHead'),
      rowsEl = document.getElementById('multiLeverRows'),
      tableWrap = rowsEl.closest('.table-wrap');
    const opt = optimizeMultiLever(selected, options);
    const hasPerYear = options.includeRoth || options.includeMix;
    if (hasPerYear && opt.activeYears.length === 0) {
      resultEl.hidden = true;
      document.getElementById('multiLeverApplyBtn').hidden = true;
      document.getElementById('multiLeverApplyNote').textContent = '';
      return;
    }
    // Re-simulate once more with the winning schedule(s)/setting active,
    // purely to read each year's actual dollar amounts for display — opt
    // itself only carries the schedules/flag and aggregate cost.
    // optimizeMultiLever() restores state.rothConvEnabled to whatever it
    // was before running (so a search doesn't leave the ladder toggled on
    // if it started off), same as the flat/per-year Roth optimizers
    // above — so when the ladder was off and includeRoth is checked, it
    // must be forced back on here too, or solveRothConversion's own
    // `state.rothConvEnabled && age-in-window` gate (see simulate()) skips
    // every year regardless of the override map, and every row would
    // silently show $0/no conversion despite a real non-zero schedule
    // having been found and already counted in opt.cost above.
    const savedEnabled = state.rothConvEnabled,
      savedSmooth = state.smoothWithdrawals;
    if (options.includeRoth) state.rothConvEnabled = true;
    if (options.includeSmooth) state.smoothWithdrawals = opt.smoothWithdrawals;
    optimizerState.rothBracketByAge = options.includeRoth ? opt.rothSchedule : null;
    optimizerState.withdrawalMixByAge = options.includeMix ? opt.mixSchedule : null;
    const detail = simulate();
    optimizerState.rothBracketByAge = null;
    optimizerState.withdrawalMixByAge = null;
    state.rothConvEnabled = savedEnabled;
    state.smoothWithdrawals = savedSmooth;
    const rowsByAge = new Map(detail.rows.map((r) => [r.age, r]));

    const currentCost = rothScheduleCost(selected);
    const savings = currentCost - opt.cost;
    const rothLabel = (c) => (c === 0 ? 'Skip' : `${c}%`);
    const mixLabel = (c) =>
      !c
        ? 'Default'
        : c === 'taxable'
          ? 'Taxable only'
          : c === 'traditional'
            ? 'Traditional only'
            : c === 'roth'
              ? 'Roth only'
              : c === 'balanced'
                ? 'Balanced (3-way)'
                : c === 'smoothed'
                  ? 'Smoothed (tax./trad. only)'
                  : c === 'taxTradHalf'
                    ? '50/50 tax./trad.'
                    : c === 'thirds'
                      ? 'Even thirds'
                      : c;

    let notes = '';
    if (opt.rothTruncated) {
      notes += ` Your Roth ladder window is wider than the ${ROTH_PER_YEAR_MAX_WINDOW} years this can optimize at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.rothYears.at(-1)}) are covered.`;
    }
    if (opt.mixTruncated) {
      notes += ` Your retirement is longer than the ${ROTH_PER_YEAR_MAX_WINDOW} years the withdrawal-mix lever can optimize at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.mixYears.at(-1)}) are covered.`;
    }
    if (opt.budgetExhausted) {
      notes += ' Stopped early after reaching its evaluation budget — showing the best combination found so far, which may not be fully optimized.';
    }
    let smoothNote = '';
    if (options.includeSmooth) {
      smoothNote = opt.smoothWithdrawals
        ? ' Recommends turning <b>on</b> smoothed withdrawals (drawing taxable and traditional proportionally, instead of taxable-first).'
        : ' Recommends keeping smoothed withdrawals <b>off</b>.';
    }
    const leverNames = [options.includeRoth && 'a per-year Roth conversion schedule', options.includeMix && 'a per-year withdrawal mix']
      .filter(Boolean)
      .join(' + ');
    if (savings > 1) {
      summaryEl.innerHTML = `Recommended: ${leverNames || 'the settings below'} — an estimated <b>${money(savings)}</b> less lifetime tax + healthcare cost (today's dollars) than your current settings, without shortening how long the portfolio lasts.${smoothNote}${notes}`;
    } else {
      summaryEl.innerHTML = `Your current settings are already at least as good as anything these levers found.${smoothNote}${notes}`;
    }

    if (!hasPerYear) {
      tableWrap.hidden = true;
    } else {
      tableWrap.hidden = false;
      const cols = ['Age'];
      if (options.includeRoth) cols.push('Roth target', 'Conversion $');
      if (options.includeMix) cols.push('Mix', 'From taxable', 'From traditional', 'From Roth');
      headEl.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
      const rothYearSet = new Set(opt.rothYears || []),
        mixYearSet = new Set(opt.mixYears || []);
      rowsEl.innerHTML = opt.activeYears
        .map((age) => {
          const row = rowsByAge.get(age);
          const cells = [`<td>${age}</td>`];
          if (options.includeRoth) {
            if (!rothYearSet.has(age)) {
              // Outside this lever's own window (the two windows don't
              // have to coincide) — "not applicable," distinct from "—"
              // below, which means evaluated but chose nothing.
              cells.push(`<td style="opacity:.5">–</td><td style="opacity:.5">–</td>`);
            } else {
              const amt = row ? displayValue(row.conversionAmount, row.year) : 0;
              // See the same-named comment in renderRothPerYearOptimizer
              // above: a candidate can tie at $0 once that year's room is
              // already exhausted, so showing a specific target next to $0
              // would read as a meaningful choice that wasn't really made.
              cells.push(`<td>${amt < 1 ? '—' : rothLabel(opt.rothSchedule.get(age))}</td><td>${money(amt)}</td>`);
            }
          }
          if (options.includeMix) {
            // Unlike the Roth column, the $ breakdown here always shows
            // the year's real taxable/traditional/Roth draw — even when
            // this age fell outside the mix lever's own search window (no
            // candidate chosen, so it fell through to
            // state.smoothWithdrawals/the plain default) or the winning
            // candidate was 0 ("default," no override) — that's still
            // genuinely useful information, unlike a Roth conversion
            // target which has no meaning at all outside its window.
            const label = mixYearSet.has(age) ? mixLabel(row ? row.mixCandidate : 0) : '–';
            const fromTaxable = row ? displayValue(row.taxableWithdrawn, row.year) : 0,
              fromTraditional = row ? displayValue(row.traditionalWithdrawn, row.year) : 0,
              fromRoth = row ? displayValue(row.rothWithdrawn, row.year) : 0;
            cells.push(
              `<td>${label}</td><td>${money(fromTaxable)}</td><td>${money(fromTraditional)}</td><td>${money(fromRoth)}</td>`,
            );
          }
          return `<tr>${cells.join('')}</tr>`;
        })
        .join('');
    }
    resultEl.hidden = false;
    // Remembered so the "Apply this schedule" button (next to Optimize,
    // above) knows exactly what the table below is showing — the button
    // applies this run's result, not a fresh re-optimization, so what you
    // see is what you get.
    optimizerState.lastMultiLeverRun = { opt, options, savings };
    const applyBtn = document.getElementById('multiLeverApplyBtn'),
      applyNote = document.getElementById('multiLeverApplyNote');
    applyBtn.hidden = false;
    if (savings > 1) {
      applyBtn.disabled = false;
      applyNote.textContent = '';
    } else {
      applyBtn.disabled = true;
      applyNote.textContent = "Nothing to apply — your current settings already match what was found.";
    }
  }
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

  // @@shared:simulateAtRealCagr begin
  function simulateAtRealCagr(realCagrPct) {
    const infl = pct(state.inflation),
      nominal = ((1 + realCagrPct / 100) * (1 + infl) - 1) * 100,
      saved = state.returnRate;
    state.returnRate = nominal;
    const result = simulate();
    state.returnRate = saved;
    return result;
  }
  // @@shared:simulateAtRealCagr end
  function renderChartView(selected) {
    const titleEl = document.getElementById('chartTitle'),
      subEl = document.getElementById('chartSub'),
      legend = document.getElementById('chartLegend'),
      noteEl = document.getElementById('chartViewNote'),
      canvas = document.getElementById('chart'),
      histCard = document.getElementById('histSuccessCard'),
      mcCard = document.getElementById('mcSuccessCard');
    histCard.hidden = chartView !== 'hist';
    mcCard.hidden = chartView !== 'mc';
    document.getElementById('mcPathCountRow').hidden = chartView !== 'mc';
    // The Both/Gap shift-mode switch only applies to the ±1yr/±3yr
    // comparison itself (not CAGR/Historical/Monte Carlo), and the whole
    // switch is meaningless — not just "Gap" — for a single-person plan or
    // when both partners already share the same retirement year: with
    // nothing to narrow/widen, "Both together" would be the only real
    // choice anyway, which is identical to not having a switch at all. So
    // the entire row hides rather than showing a permanently-disabled Gap
    // button — re-checked on every render (not just on a chart-view
    // change) so it reacts live to sliders/toggles.
    const shiftModeRow = document.getElementById('chartShiftModeRow'),
      shiftGapBtn = document.getElementById('chartShiftGapBtn'),
      gapDisabled = state.singlePerson || state.retireAgeA === state.retireAgeB;
    shiftModeRow.hidden = (chartView !== '1yr' && chartView !== '3yr') || gapDisabled;
    shiftGapBtn.disabled = gapDisabled;
    shiftGapBtn.title = "Hold one partner's retirement date fixed and vary only the other's";
    if (gapDisabled && chartShiftMode === 'gap') assignChartShiftMode('together');
    updateChartShiftModeButtons();
    // The Vary: Partner A/B picker only makes sense once Gap mode is
    // actually active (and available) — hidden otherwise. Its two buttons
    // always show a determinate choice: chartGapPartner if the person
    // explicitly picked one, or the auto-detected earlier partner if not.
    document.getElementById('chartGapPartnerRow').hidden = !(chartShiftMode === 'gap' && !gapDisabled);
    updateChartGapPartnerButtons();
    if (chartView === 'mc') {
      const mc = runMonteCarlo(mcPathCount);
      const rate = document.getElementById('mcSuccessRate'),
        sub = document.getElementById('mcSuccessSub');
      rate.textContent = `${(mc.successRate * 100).toFixed(0)}%`;
      rate.className =
        mc.successRate === 1 ? 'positive' : mc.successRate < 0.9 ? 'negative' : 'warning';
      sub.textContent = `Portfolio survived to the end of the projection in ${mc.paths.filter((p) => !p.depletedAge).length} of ${mc.paths.length} simulated paths, each built from randomly shuffled 5-year blocks of actual 1928–2025 market history.`;
      titleEl.textContent = `Monte Carlo: ${mc.paths.length.toLocaleString()} simulated paths`;
      subEl.textContent =
        'Shaded bands show total assets by age across all simulated paths: the darker band is where the middle 50% of paths landed (25th–75th percentile), the lighter band is the middle 80% (10th–90th percentile). The line is the median (50th percentile) path. Narrower bands with even fewer paths (500) can look artificially tight — 1,000–2,000 gives a smoother read.';
      legend.innerHTML = `<span><i class="swatch" style="background:#2563eb"></i><span>Median</span></span><span><i class="swatch" style="background:rgba(37,99,235,0.4)"></i><span>25th–75th pct. (middle 50%)</span></span><span><i class="swatch" style="background:rgba(37,99,235,0.2)"></i><span>10th–90th pct. (middle 80%)</span></span>`;
      noteEl.textContent = `Each path stitches together random 5-year blocks of real historical stock/inflation/bond returns (block bootstrap), rather than sampling each year independently — this preserves real sequencing and market regime behavior instead of allowing unrealistic runs. Bond reserve sized to ${getBondYears()} years of expenses, same withdrawal order as the historical backtest.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across ${mc.paths.length} Monte Carlo simulated paths`,
      );
      renderMonteCarloChart(mc);
      return;
    }
    if (chartView === 'hist') {
      const { cycles, successRate, projectionYears } = runHistoricalCycles();
      const rate = document.getElementById('histSuccessRate'),
        sub = document.getElementById('histSuccessSub');
      if (!cycles.length) {
        rate.textContent = '—';
        rate.className = '';
        sub.textContent = `Not enough of the 1928–2025 record (98 years) to cover a ${projectionYears}-year projection.`;
        titleEl.textContent = 'Historical S&P 500 backtest';
        subEl.textContent = '';
        legend.innerHTML = '';
        noteEl.textContent = '';
        return;
      }
      rate.textContent = `${(successRate * 100).toFixed(0)}%`;
      rate.className = successRate === 1 ? 'positive' : successRate < 0.9 ? 'negative' : 'warning';
      sub.textContent = `Portfolio survived to the end of the projection in ${cycles.filter((c) => !c.depletedAge).length} of ${cycles.length} historical starting years (${cycles[0].startYear}–${cycles.at(-1).startYear}). Those windows overlap heavily (only about ${Math.max(1, Math.floor(98 / Math.max(1, projectionYears)))} are fully independent), so treat the rate as approximate.`;
      titleEl.textContent = 'Total assets across every historical starting year';
      subEl.textContent = `Same inputs, replayed starting from each calendar year 1928–2025 that has a full ${projectionYears}-year run of actual S&P 500 returns, inflation, and bond returns available.`;
      legend.innerHTML = `<span><i class="swatch" style="background:#0e9f9a"></i><span>Survived</span></span><span><i class="swatch" style="background:#dc2626"></i><span>Depleted</span></span>`;
      // Naming every failing starting year in this note text (an earlier
      // version of this feature did) doesn't scale — a rougher scenario
      // can fail dozens of starting years, and a long comma-separated list
      // crowds the note area under the chart for little benefit when
      // hovering any line already identifies it directly. So this just
      // points at hover instead of listing years; the success-rate sub-line
      // above already gives the count.
      noteEl.textContent = `Bond reserve sized to ${getBondYears()} years of expenses: down years draw cash then bonds only; up years pay from taxable→traditional→Roth and refill the bond reserve the same way. Bond/HYSA/mortgage rates stay at your entered values — only stock growth and inflation follow history. Hover over any line to see its starting year, outcome, and value at that age.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across ${cycles.length} historical starting years`,
      );
      const series = cycles.map((c) => ({ sim: c, color: c.depletedAge ? '#dc2626' : '#0e9f9a' }));
      renderChart(series, (r) => (mode === 'real' ? r.total / r.cumFactor : r.total));
      return;
    }
    if (chartView === 'cagr') {
      titleEl.textContent = 'Total assets across real investment returns';
      // Comparison rates are 0-7% real in whole-percent steps, but with your
      // actual entered assumption (rounded to the nearest tenth) swapped in
      // for real, exactly, rather than snapped to the nearest whole percent
      // and mislabeled "(current)" — e.g. a 4.5% real assumption used to
      // round down and display as an inexact "4% (current)". Whichever
      // whole-percent point sits closest to that exact value is dropped so
      // the sweep doesn't show two near-duplicate points right next to each
      // other (ties favor dropping the lower one, so 4.5% drops 4% and
      // keeps 5%).
      const currentReal = Math.round(((1 + pct(state.returnRate)) / (1 + pct(state.inflation)) - 1) * 1000) / 10;
      const baseInts = [0, 1, 2, 3, 4, 5, 6, 7];
      let closestInt = baseInts[0],
        bestDist = Infinity;
      for (const n of baseInts) {
        const d = Math.abs(n - currentReal);
        if (d < bestDist - 1e-9) {
          bestDist = d;
          closestInt = n;
        }
      }
      // Colors are assigned by rank (lowest real return = red, highest = teal)
      // via ratesAsc/colorFor, independent of the order `rates` is finally
      // displayed/sorted in below — so reversing the display order doesn't
      // flip the color scale's meaning.
      const ratesAsc = baseInts.filter((n) => n !== closestInt).concat([currentReal]).sort((a, b) => a - b);
      const colorFor = new Map(ratesAsc.map((r, i) => [r, cagrColors[i]]));
      // Displayed top-to-bottom from the highest real return (7%) down to the
      // lowest (0%), so the legend/line order matches "better plan at top."
      const rates = ratesAsc.slice().sort((a, b) => b - a);
      const fmtRate = (r) => (Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`);
      // In "Future dollars" (nominal) display mode, the % labels shown are
      // the nominal growth rate (real rate + inflation compounded) so they
      // line up with what's actually driving the nominal-dollar lines on the
      // chart — the underlying simulateAtRealCagr(r) call and simulated
      // lines are unchanged either way; only the displayed label converts.
      const toNominal = (r) => ((1 + r / 100) * (1 + pct(state.inflation)) - 1) * 100;
      const fmtDisplayRate = (r) => fmtRate(mode === 'nominal' ? toNominal(r) : r);
      subEl.textContent = `Same retirement dates and inflation input; investment growth swept across real returns for comparison, with your current ${fmtRate(currentReal)} real assumption included exactly.`;
      const series = rates.map((r) => ({
        sim: simulateAtRealCagr(r),
        color: colorFor.get(r),
        highlight: r === currentReal,
        label: `${fmtDisplayRate(r)}${r === currentReal ? ' (current)' : ''}`,
      }));
      legend.innerHTML = series
        .map(
          (s, i) =>
            `<span><i class="swatch" style="background:${s.color}"></i><span>${fmtDisplayRate(rates[i])}${rates[i] === currentReal ? ' (current)' : ''}</span></span>`,
        )
        .join('');
      noteEl.textContent =
        mode === 'nominal'
          ? `Bond, HYSA, and mortgage rates stay at their entered values; only portfolio growth varies. Percentages shown are nominal (real return + ${state.inflation}% inflation) to match the future-dollar values on this chart.`
          : `Bond, HYSA, and mortgage rates stay at their entered values; only portfolio growth varies. ${state.inflation}% inflation applied on top of each real rate.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across a sweep of real investment returns, including your current ${fmtRate(currentReal)} real assumption`,
      );
      renderChart(series);
    } else {
      const yrs = chartView === '1yr' ? 1 : 3,
        label = `${yrs} yr${yrs > 1 ? 's' : ''}`;
      // 'gap' mode only makes sense with two partners on different dates;
      // chartShiftModeRow's own visibility/disabled state (set in render())
      // already prevents picking 'gap' in those cases, but this guards
      // against a stale chartShiftMode value if singlePerson or the dates
      // are toggled/edited after 'gap' was already selected.
      const gapMode =
        chartShiftMode === 'gap' && !state.singlePerson && state.retireAgeA !== state.retireAgeB;
      let early, late, earlyLabel, lateLabel, ariaSuffix, note;
      if (gapMode) {
        // Which partner moves: an explicit pick (chartGapPartner) sticks
        // regardless of who's actually earlier; with no explicit pick yet,
        // default to auto-tracking whichever partner currently retires
        // earlier (this feature's original behavior).
        const movingIsA = chartGapPartner
          ? chartGapPartner === 'A'
          : state.retireAgeA < state.retireAgeB;
        const movingAge = movingIsA ? state.retireAgeA : state.retireAgeB,
          movingFloor = movingIsA ? state.ageA : state.ageB,
          fixedAge = movingIsA ? state.retireAgeB : state.retireAgeA;
        // sign > 0: moving partner currently retires before the fixed
        // partner, so moving "closer" means retiring later (age goes up).
        // sign < 0: moving partner currently retires after the fixed
        // partner (only reachable via an explicit pick against the grain,
        // e.g. deliberately varying the later-retiring partner instead),
        // so "closer" means retiring earlier (age goes down) instead.
        const sign = movingAge <= fixedAge ? 1 : -1;
        // "Closer" clamps at the fixed partner's own date, so the gap can
        // close to zero but never overshoots into flipping who's earlier.
        // "Farther" floors/caps at the moving partner's current age / 70,
        // same bounds the "Both" branch below already uses.
        const closerAge =
            sign > 0 ? Math.min(fixedAge, movingAge + yrs) : Math.max(fixedAge, movingAge - yrs),
          fartherAge =
            sign > 0 ? Math.max(movingFloor, movingAge - yrs) : Math.min(70, movingAge + yrs);
        early = simulate(movingIsA ? closerAge : state.retireAgeA, movingIsA ? state.retireAgeB : closerAge);
        late = simulate(movingIsA ? fartherAge : state.retireAgeA, movingIsA ? state.retireAgeB : fartherAge);
        // Actual years moved, not the requested ±1/±3 — when the two
        // partners are already closer together than that (e.g. 1 year
        // apart on the ±3yr view), "Closer" clamps at the fixed partner's
        // own date well short of a full 3-year move, so the label needs to
        // say "1 yr" there, not a "3 yrs" that never actually happened.
        const closerYrs = Math.round(Math.abs(closerAge - movingAge)),
          fartherYrs = Math.round(Math.abs(fartherAge - movingAge));
        // Labels name the moving partner and their resulting age directly
        // (e.g. "Partner A → 48") rather than just "Closer"/"Farther" on
        // their own — a real user read the bare adjectives as "both
        // partners move toward/away from each other," when only the named
        // partner's date ever changes; the other partner's date (spelled
        // out in `note` below) never appears in the legend/tooltip at all
        // otherwise, so there was nothing there to contradict that reading.
        const movingLabel = movingIsA ? 'Partner A' : 'Partner B',
          fixedLabel = movingIsA ? 'Partner B' : 'Partner A',
          autoNote = chartGapPartner ? '' : ' (currently the earlier of the two)';
        earlyLabel = `${movingLabel} → ${closerAge} (closer)`;
        lateLabel = `${movingLabel} → ${fartherAge} (farther)`;
        ariaSuffix = `for ${movingLabel} retiring up to ${label} earlier or later, while ${fixedLabel} stays fixed at retirement age ${fixedAge}`;
        note = `Only ${movingLabel}'s date moves${autoNote}; ${fixedLabel}'s stays fixed at retirement age ${fixedAge}.`;
        if (closerYrs < yrs)
          note += ` "Closer" stops at ${closerYrs} yr${closerYrs === 1 ? '' : 's'} here since that's as far as it can move before reaching ${fixedLabel}'s date.`;
      } else {
        early = simulate(
          Math.max(state.ageA, state.retireAgeA - yrs),
          Math.max(state.ageB, state.retireAgeB - yrs),
        );
        late = simulate(Math.min(70, state.retireAgeA + yrs), Math.min(70, state.retireAgeB + yrs));
        earlyLabel = `Both −${label}`;
        lateLabel = `Both +${label}`;
        ariaSuffix = `${label} apart`;
        note = state.singlePerson
          ? ''
          : `Both partners' dates move together, by the same amount.${
              gapDisabled ? '' : ' Switch to "Fix one partner" above to instead hold one partner\'s date and vary only the other\'s.'
            }`;
      }
      titleEl.textContent = 'Total assets across retirement dates';
      subEl.textContent =
        'Investments + cash + home equity, after projected spending and estimated federal and state income tax.';
      // Legend, hover-tooltip line order, and canvas draw order all follow
      // the same top-to-bottom convention as the CAGR sweep: the "+N"/
      // "Farther" line (later retirement — generally the higher line, more
      // compounding time before withdrawals start) listed first, "Selected"
      // in the middle, and the "-N"/"Closer" line (earlier retirement,
      // generally the lower line) listed last — so the order on screen
      // reads top-to-bottom the same way the lines themselves typically
      // stack, rather than the reverse.
      legend.innerHTML = `<span><i class="swatch late"></i><span>${lateLabel}</span></span><span><i class="swatch"></i><span>Selected dates</span></span><span><i class="swatch early"></i><span>${earlyLabel}</span></span>`;
      noteEl.textContent = note;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age for three retirement dates, ${ariaSuffix}`,
      );
      renderChart([
        { sim: late, color: '#0e9f9a', label: lateLabel },
        { sim: selected, color: '#2563eb', highlight: true, label: 'Selected' },
        { sim: early, color: '#d97706', label: earlyLabel },
      ]);
    }
  }





  // @@shared:20-renderTable begin


  function renderChart(series, valueFn = (r) => displayValue(r.total, r.year)) {
    const canvas = document.getElementById('chart'),
      rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(600, rect.width * dpr);
    canvas.height = Math.max(300, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = canvas.width / dpr,
      h = canvas.height / dpr,
      p = { l: 66, r: 18, t: 16, b: 40 };
    const all = series.flatMap((s) => s.sim.rows.map(valueFn)),
      maxAge = series[0].sim.rows.at(-1).age;
    let min = Math.min(0, ...all),
      max = Math.max(1, ...all);
    if (min < 0) min *= 1.1;
    max *= 1.08;
    const x = (age) => p.l + ((age - state.ageA) / (maxAge - state.ageA)) * (w - p.l - p.r);
    let y, floor, logMin, logMax;
    if (logScale) {
      floor = Math.max(1, max * 0.0005);
      logMax = Math.log10(Math.max(max, floor * 10));
      logMin = Math.log10(floor);
      y = (v) =>
        p.t + ((logMax - Math.log10(Math.max(v, floor))) / (logMax - logMin)) * (h - p.t - p.b);
    } else {
      y = (v) => p.t + ((max - v) / (max - min)) * (h - p.t - p.b);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Inter,system-ui';
    ctx.fillStyle = chartAxisColor();
    ctx.strokeStyle = chartGridColor();
    ctx.lineWidth = 1;
    if (logScale) {
      for (let i = 0; i <= 6; i++) {
        const val = Math.pow(10, logMin + (logMax - logMin) * (i / 6)),
          yy = y(val);
        ctx.beginPath();
        ctx.moveTo(p.l, yy);
        ctx.lineTo(w - p.r, yy);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(compact(val), p.l - 9, yy);
      }
    } else {
      for (let i = 0; i <= 5; i++) {
        const val = min + (max - min) * (i / 5),
          yy = y(val);
        ctx.beginPath();
        ctx.moveTo(p.l, yy);
        ctx.lineTo(w - p.r, yy);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(compact(val), p.l - 9, yy);
      }
    }
    Array.from({ length: 7 }, (_, i) => Math.round(state.ageA + (maxAge - state.ageA) * (i / 6)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((age) => {
        ctx.fillStyle = chartAxisColor();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(xAxisLabel(age), x(age), h - p.b + 10);
      });
    if (!logScale) {
      const zero = y(0);
      ctx.strokeStyle = chartZeroLineColor();
      ctx.beginPath();
      ctx.moveTo(p.l, zero);
      ctx.lineTo(w - p.r, zero);
      ctx.stroke();
    }
    series.forEach(({ sim, color, highlight }) => {
      ctx.beginPath();
      sim.rows.forEach((r, i) => {
        const px = x(r.age),
          py = y(valueFn(r));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = highlight ? 3 : 2;
      ctx.globalAlpha = highlight ? 1 : 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    const drawRetirementMarker = (chartAge, label, color, offset = 0) => {
      if (chartAge < state.ageA || chartAge > maxAge) return;
      const rx = x(chartAge);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(rx, p.t);
      ctx.lineTo(rx, h - p.b);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, rx + 2, p.t + 2 + offset);
    };
    drawRetirementMarker(state.retireAgeA, state.singlePerson ? 'Retire' : 'A retires', '#475569');
    if (!state.singlePerson)
      drawRetirementMarker(
        state.ageA + (state.retireAgeB - state.ageB),
        'B retires',
        '#0e7490',
        14,
      );
    lastChart = { series, valueFn, x, y, p, w, h, maxAge };
  }
  let lastChart = null;
  function clearChartHover() {
    if (chartHoverEnabled() && lastChart) renderChart(lastChart.series, lastChart.valueFn);
    if (chartTooltipEl) chartTooltipEl.style.display = 'none';
  }
  let chartTooltipEl = null;
  // @@shared:20-renderTable end
  function initChartHover() {
    const wrap = document.querySelector('.chart-wrap'),
      canvas = document.getElementById('chart');
    if (!wrap || !canvas) return;
    chartTooltipEl = document.createElement('div');
    chartTooltipEl.id = 'chartTooltip';
    chartTooltipEl.style.cssText =
      'position:absolute;pointer-events:none;background:rgba(15,23,42,.94);color:#fff;font-size:.72rem;padding:8px 10px;border-radius:8px;line-height:1.55;white-space:nowrap;display:none;z-index:6;box-shadow:0 6px 18px rgba(15,23,42,.25)';
    wrap.appendChild(chartTooltipEl);
    const handleMove = (e) => {
      if (!chartHoverEnabled() || !lastChart) return;
      const rect = canvas.getBoundingClientRect(),
        clientX = e.touches ? e.touches[0].clientX : e.clientX,
        clientY = e.touches ? e.touches[0].clientY : e.clientY,
        mx = clientX - rect.left,
        my = clientY - rect.top;
      const { series, valueFn, x, y, p, w, h, maxAge } = lastChart;
      if (mx < p.l || mx > w - p.r || my < p.t || my > h - p.b) {
        clearChartHover();
        return;
      }
      const age = Math.round(state.ageA + ((mx - p.l) / (w - p.l - p.r)) * (maxAge - state.ageA));
      renderChart(series, valueFn);
      const ctx = canvas.getContext('2d'),
        rx = x(age);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, p.t);
      ctx.lineTo(rx, h - p.b);
      ctx.stroke();
      ctx.restore();
      let tooltipHTML;
      if (chartView === 'hist') {
        // The historical backtest can draw 30-70+ overlapping lines (one
        // per starting year), so showing every series' value at this age
        // (like the 3yr/1yr/cagr tooltip below) would be an unreadable
        // wall of text. Instead, identify the single line closest to the
        // mouse *vertically* at this age — the same "nearest curve" hover
        // convention used by most multi-line chart libraries — highlight
        // just that line, and name its starting year so a red (depleted)
        // line can actually be identified rather than just seen.
        let nearest = null,
          nearestDist = Infinity;
        series.forEach((s) => {
          const rows = s.sim.rows;
          let r = rows.find((rr) => rr.age === age);
          if (!r) r = rows.reduce((a, b) => (Math.abs(b.age - age) < Math.abs(a.age - age) ? b : a));
          if (!r) return;
          const val = valueFn(r),
            py = y(val),
            dist = Math.abs(py - my);
          if (dist < nearestDist) nearestDist = dist, (nearest = { s, val, py });
        });
        if (!nearest) {
          clearChartHover();
          return;
        }
        // Redraw the nearest line bold and on top of the others so it's
        // clear which one the tooltip is describing, then mark its point.
        ctx.beginPath();
        nearest.s.sim.rows.forEach((r, i) => {
          const px = x(r.age),
            py = y(valueFn(r));
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.strokeStyle = nearest.s.color;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = nearest.s.color;
        ctx.arc(rx, nearest.py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const depletedAge = nearest.s.sim.depletedAge,
          status = depletedAge ? `Depleted at age ${depletedAge}` : 'Survived the full projection';
        tooltipHTML = `<b>Started ${nearest.s.sim.startYear}</b><br><span style="color:${nearest.s.color}">●</span> ${status}<br>Age ${age}: ${money(nearest.val)}`;
      } else {
        const lines = [];
        series.forEach((s) => {
          const rows = s.sim.rows;
          let r = rows.find((rr) => rr.age === age);
          if (!r) r = rows.reduce((a, b) => (Math.abs(b.age - age) < Math.abs(a.age - age) ? b : a));
          if (!r) return;
          const val = valueFn(r),
            py = y(val);
          ctx.beginPath();
          ctx.fillStyle = s.color;
          ctx.arc(rx, py, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          lines.push(
            `<span style="color:${s.color}">●</span> ${s.label ? s.label + ': ' : ''}${money(val)}`,
          );
        });
        // Header always shows year + both partners' ages regardless of
        // which one is currently on the x-axis (chartXAxisMode) — a real
        // user specifically wanted the ages/year they *aren't* scrubbing by
        // visible too, rather than having to mentally convert from
        // whichever one is on the axis.
        const calYear = CURRENT_YEAR + (age - state.ageA),
          ageBVal = Math.round(age - state.ageA + state.ageB),
          header = state.singlePerson
            ? `${calYear} · Age ${age}`
            : `${calYear} · Partner A: ${age} · Partner B: ${ageBVal}`;
        tooltipHTML = `<b>${header}</b><br>${lines.join('<br>')}`;
      }
      chartTooltipEl.innerHTML = tooltipHTML;
      let left = mx + 14,
        top = my - 12;
      if (left + 170 > w) left = mx - 184;
      if (left < 0) left = 4;
      chartTooltipEl.style.left = left + 'px';
      chartTooltipEl.style.top = Math.max(0, top) + 'px';
      chartTooltipEl.style.display = 'block';
    };
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('touchmove', handleMove, { passive: true });
    canvas.addEventListener('mouseleave', clearChartHover);
    canvas.addEventListener('touchend', clearChartHover);
  }

  // @@shared:21-writeStorageNow begin
  // Autosaves `state`/`mode` to this browser's localStorage (never sent
  // anywhere — see the README's privacy note) so a reload or a later visit
  // comes back to real numbers instead of the generic example data.
  // Debounced (250ms idle) since saveInputs() is called on nearly every
  // keystroke via the `ids` input listener; `writeStorageNow()` is also
  // flushed unconditionally on `pagehide` so the very last edit before a
  // tab close/reload is never lost to a pending debounce timer.
  function writeStorageNow() {
    const statusEl = document.getElementById('saveStatus');
    if (!hasPersonalizedData) return;
    if (!storage) {
      if (statusEl) statusEl.textContent = 'Not autosaved — storage unavailable';
      return;
    }
    try {
      storage.setItem(storageKey, JSON.stringify({ state, mode }));
      if (statusEl) statusEl.textContent = 'Plan autosaved in this browser';
    } catch {
      if (statusEl) statusEl.textContent = 'Not autosaved — storage full or unavailable';
    }
  }
  let saveDebounceTimer = null;
  function saveInputs() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(writeStorageNow, 250);
  }
  window.addEventListener('pagehide', writeStorageNow);

  function computeScenarioMetrics(scenarioState) {
    const backup = state;
    assignState(normalizeState(scenarioState));
    let out;
    try {
      const sim = simulate();
      const retirement = sim.rows.find((r) => r.year === sim.retirementYear) || sim.rows[0],
        end = sim.rows.at(-1);
      out = {
        retireLabel: state.singlePerson
          ? `Age ${state.retireAgeA}`
          : `A ${state.retireAgeA} / B ${state.retireAgeB}`,
        investableAtRetirement: displayValue(retirement.investable, retirement.year),
        netWorthAtRetirement: displayValue(retirement.total, retirement.year),
        lastsTo: sim.depletedAge
          ? `Age ${sim.depletedAge}`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`,
        lastsToAge:
          sim.depletedAge ||
          Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB),
        depleted: !!sim.depletedAge,
        endAssets: displayValue(end.total, end.year),
      };
    } finally {
      assignState(backup);
    }
    return out;
  }
  function computeOverlaySeriesFor(name, scenarioState) {
    const backup = state;
    assignState(normalizeState(scenarioState));
    let rows;
    try {
      const sim = simulate();
      rows = sim.rows.map((r) => ({ age: r.age, value: displayValue(r.total, r.year) }));
    } finally {
      assignState(backup);
    }
    return { name, rows };
  }
  function renderOverlayChart(active) {
    const card = document.getElementById('overlayCard'),
      canvas = document.getElementById('overlayChart'),
      legend = document.getElementById('overlayLegend');
    if (!active.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const series = [
      computeOverlaySeriesFor('Current (live inputs)', state),
      ...active.map((sc) => computeOverlaySeriesFor(sc.name, sc.state)),
    ];
    legend.innerHTML = series
      .map(
        (s, i) =>
          `<span><i class="swatch" style="background:${overlayColors[i % overlayColors.length]}"></i><span>${escapeHtml(s.name)}</span></span>`,
      )
      .join('');
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(600, rect.width * dpr);
    canvas.height = Math.max(300, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = canvas.width / dpr,
      h = canvas.height / dpr,
      p = { l: 66, r: 18, t: 16, b: 40 };
    const minAge = Math.min(...series.map((s) => s.rows[0].age)),
      maxAge = Math.max(...series.map((s) => s.rows.at(-1).age)),
      ageSpan = maxAge - minAge || 1;
    const all = series.flatMap((s) => s.rows.map((r) => r.value));
    let min = Math.min(0, ...all),
      max = Math.max(1, ...all);
    if (min < 0) min *= 1.1;
    max *= 1.08;
    const x = (age) => p.l + ((age - minAge) / ageSpan) * (w - p.l - p.r),
      y = (v) => p.t + ((max - v) / (max - min || 1)) * (h - p.t - p.b);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Inter,system-ui';
    ctx.fillStyle = chartAxisColor();
    ctx.strokeStyle = chartGridColor();
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const val = min + (max - min) * (i / 5),
        yy = y(val);
      ctx.beginPath();
      ctx.moveTo(p.l, yy);
      ctx.lineTo(w - p.r, yy);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(compact(val), p.l - 9, yy);
    }
    // Deliberately NOT run through xAxisLabel(): each overlaid scenario
    // was simulated under its own saved `state` (computeOverlaySeriesFor
    // swaps `state` in and restores it after), so these ages aren't all
    // relative to the live state.ageA the way a single chart's rows are
    // — converting to calendar year or Partner B's age here would silently
    // mix each scenario's own timeline with the currently-live one's.
    Array.from({ length: 7 }, (_, i) => Math.round(minAge + ageSpan * (i / 6)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((age) => {
        ctx.fillStyle = chartAxisColor();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(age, x(age), h - p.b + 10);
      });
    const zero = y(0);
    ctx.strokeStyle = chartZeroLineColor();
    ctx.beginPath();
    ctx.moveTo(p.l, zero);
    ctx.lineTo(w - p.r, zero);
    ctx.stroke();
    series.forEach((s, i) => {
      ctx.beginPath();
      s.rows.forEach((r, ri) => {
        const px = x(r.age),
          py = y(r.value);
        ri ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = overlayColors[i % overlayColors.length];
      ctx.lineWidth = i === 0 ? 3 : 2;
      ctx.stroke();
    });
  }
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
  function renderScenarioComparison() {
    const compareCard = document.getElementById('scenarioCompareCard'),
      compareRows = document.getElementById('scenarioCompareRows');
    const active = scenarios.filter((sc) => compareIds.has(sc.id));
    compareCard.hidden = active.length === 0;
    renderOverlayChart(active);
    if (!active.length) {
      compareRows.innerHTML = '';
      return;
    }
    const current = computeScenarioMetrics(state);
    const rows = [
      { name: 'Current (live inputs)', ...current, isCurrent: true },
      ...active.map((sc) => ({ name: sc.name, ...computeScenarioMetrics(sc.state) })),
    ];
    compareRows.innerHTML = rows
      .map(
        (r) =>
          `<tr><td><b>${escapeHtml(r.name)}</b></td><td>${r.retireLabel}</td><td>${money(r.investableAtRetirement)}${r.isCurrent ? '' : deltaMoney(r.investableAtRetirement - current.investableAtRetirement)}</td><td>${money(r.netWorthAtRetirement)}${r.isCurrent ? '' : deltaMoney(r.netWorthAtRetirement - current.netWorthAtRetirement)}</td><td><span class="table-status ${r.depleted ? 'fail' : ''}">${r.lastsTo}</span>${r.isCurrent ? '' : deltaAge(r.lastsToAge - current.lastsToAge)}</td><td>${money(r.endAssets)}${r.isCurrent ? '' : deltaMoney(r.endAssets - current.endAssets)}</td></tr>`,
      )
      .join('');
  }
  // @@shared:21-writeStorageNow end
  function buildPrintReport() {
    const sim = simulate(),
      retirement = sim.rows.find((r) => r.year === sim.retirementYear) || sim.rows[0],
      end = sim.rows.at(-1),
      currentInvestable = state.taxable + retirementTotal() + state.cash,
      fiNumber = sim.currentExpense * fiMultiple(),
      fireNumber = sim.retirementExpense * fiMultiple(),
      tenureLabels = { own: 'Own', rent: 'Rent', rentThenBuy: 'Rent, then buy' },
      stateSelect = document.getElementById('stateTax'),
      stateLabel = stateSelect?.selectedOptions[0]?.textContent || state.stateTax,
      genDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      kv = (pairs) =>
        `<table class="pr-kv"><tbody>${pairs
          .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
          .join('')}</tbody></table>`;
    const resultsTable = kv([
      [
        'Retirement age(s)',
        state.singlePerson
          ? `Age ${state.retireAgeA}`
          : `Partner A: ${state.retireAgeA} · Partner B: ${state.retireAgeB}`,
      ],
      [
        'Investable assets at retirement',
        money(displayValue(retirement.investable, retirement.year)),
      ],
      ['Net worth at retirement', money(displayValue(retirement.total, retirement.year))],
      [
        'Investments last through',
        sim.depletedAge
          ? `Age ${sim.depletedAge} (projected shortfall)`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+ (not depleted)`,
      ],
      ['End assets', money(displayValue(end.total, end.year))],
      [`FI number (${Number(fiMultiple().toFixed(1))}× today's spending, ${state.fiWithdrawalRate}% withdrawal rate)`, money(fiNumber)],
      [`FIRE number (${Number(fiMultiple().toFixed(1))}× retirement spending)`, money(fireNumber)],
      [
        'Currently funded',
        `${fiNumber > 0 ? Math.min(999, (currentInvestable / fiNumber) * 100).toFixed(0) : 0}% of FI number`,
      ],
    ]);
    const assumptionsTable = kv([
      ['Household', state.singlePerson ? 'Single person' : 'Couple'],
      [
        'Current age(s)',
        state.singlePerson ? `${state.ageA}` : `Partner A: ${state.ageA} · Partner B: ${state.ageB}`,
      ],
      [
        'Plan finances through age',
        state.singlePerson
          ? `${state.lifeExpectancyA}`
          : `Partner A: ${state.lifeExpectancyA} · Partner B: ${state.lifeExpectancyB}`,
      ],
      [
        'Current household income',
        state.singlePerson ? money(state.incomeA) : `${money(state.incomeA)} + ${money(state.incomeB)}`,
      ],
      ['Annual household spending', money(state.spending)],
      ['Housing', tenureLabels[state.tenure] || state.tenure],
      ['Filing status', state.filingStatus === 'mfj' ? 'Married filing jointly' : 'Single'],
      ['Resident state', stateLabel],
      ['Stock return assumption', `${state.returnRate}%`],
      ['Bond return assumption', `${state.bondReturn}%`],
      ['HYSA / cash rate assumption', `${state.hysaRate}%`],
      ['Inflation assumption', `${state.inflation}%`],
      ['Bond reserve', `${getBondYears()} years of expenses`],
    ]);
    const chartCanvas = document.getElementById('chart');
    let chartImg = '';
    try {
      chartImg = `<img src="${chartCanvas.toDataURL('image/png')}" alt="Projected total assets chart">`;
    } catch (e) {
      chartImg = '';
    }
    const projRows = sim.rows
      .map(
        (r) =>
          `<tr><td>${r.age}${state.singlePerson ? '' : ` / ${r.ageB}`}</td><td>${money(displayValue(r.income, r.year))}</td><td>${money(displayValue(r.expenses, r.year))}</td><td>${money(displayValue(r.tax, r.year))}</td><td>${money(displayValue(r.taxable, r.year))}</td><td>${money(displayValue(r.bonds, r.year))}</td><td>${money(displayValue(r.traditional, r.year))}</td><td>${money(displayValue(r.roth, r.year))}</td><td>${money(displayValue(r.cash, r.year))}</td><td>${money(displayValue(r.homeEquity, r.year))}</td><td>${money(displayValue(r.total, r.year))}</td></tr>`,
      )
      .join('');
    document.getElementById('printReport').innerHTML = `
      <h1>FIRE Planner — Report</h1>
      <p class="pr-meta">Generated ${genDate} · Values shown in ${mode === 'real' ? "inflation-adjusted 2026 dollars" : "future nominal dollars"} · Planning estimate only — not tax, investment, or legal advice.</p>
      <h2>Key results</h2>
      ${resultsTable}
      <h2>Key assumptions</h2>
      ${assumptionsTable}
      <h2>Projected total assets</h2>
      ${chartImg}
      <h2>Year-by-year projection</h2>
      <table class="pr-proj"><thead><tr><th>Age${state.singlePerson ? '' : ' (A / B)'}</th><th>Income</th><th>Expenses</th><th>Taxes</th><th>Taxable</th><th>Bonds</th><th>Traditional</th><th>Roth</th><th>Cash</th><th>Home equity</th><th>Net assets</th></tr></thead><tbody>${projRows}</tbody></table>
      <p class="pr-disclaimer">"Income" is an estimate of taxable income (wages after retirement contributions, Social Security, pension, RMDs, and any Roth conversion) and excludes brokerage capital gains, which are taxed separately on withdrawal. "Expenses" is household spending plus healthcare, long-term care, housing, and any other loan payments; "Taxes" is estimated federal/state income tax plus payroll tax. This tool was built with AI assistance (Claude) and may contain mistakes; verify all figures independently before making financial decisions. Federal tax brackets, state brackets, retirement contribution limits, capital-gains thresholds, RMD tables, Medicare IRMAA tiers, and ACA premium tax credit rules are 2026 planning estimates and held constant in real terms.</p>
    `;
  }
  // @@shared:22-exportCsv begin
  function exportCsv() {
    const sim = simulate(),
      columns = [
        ['yearIndex', 'Year index'],
        ['age', 'Partner A age'],
        ['ageB', 'Partner B age'],
        ['working', 'Any partner working'],
        ['workingA', 'Partner A working'],
        ['workingB', 'Partner B working'],
        ['taxable', 'Taxable brokerage'],
        ['bonds', 'Bonds'],
        ['traditional', 'Traditional retirement'],
        ['roth', 'Roth retirement'],
        ['cash', 'Cash / HYSA'],
        ['homeEquity', 'Home equity'],
        ['loanBalance', 'Loan balances'],
        ['investable', 'Investable assets'],
        ['total', 'Net assets'],
      ],
      csv = [columns.map(([, label]) => label).join(',')]
        .concat(
          sim.rows.map((row) =>
            columns
              .map(([key]) => {
                const value = key === 'ageB' && state.singlePerson ? '' : row[key];
                return typeof value === 'string' ? `"${value.replaceAll('"', '""')}"` : value;
              })
              .join(','),
          ),
        )
        .join('\n'),
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'fire-planner-annual-projection.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  // @@shared:22-exportCsv end
  DYN.children = {
    key: 'children',
    container: 'childFields',
    prefix: 'child',
    noun: 'child',
    rowTitle: (i) => `Child ${i + 1}`,
    addLabel: '+ Add a child',
    note: 'Children you claim as dependents, including planned ones.',
    tip: "Used for the Child Tax Credit and the credit for other dependents, head of household status, the ACA household size (a larger household has a higher income limit for premium subsidies) and the state child credits and exemptions. A dependent child counts until the end of the year they turn 18, or 23 if they are a full-time student. Spending is NOT adjusted automatically: add what children cost under household spending, additional expenses or spending changes.",
    fresh: () => ({ birthYear: currentYear, student: false }),
    fields: [
      {
        key: 'birthYear',
        kind: 'num',
        label: 'Birth year',
        short: 'A future year counts from birth',
        tip: 'The calendar year the child was (or will be) born. A child counts as a dependent for the whole year of birth.',
        min: CHILD_BIRTH_YEAR_MIN,
        max: CHILD_BIRTH_YEAR_MAX,
        step: 1,
      },
      {
        key: 'joinYear',
        kind: 'num',
        int: true,
        blank: true,
        placeholder: 'From birth',
        label: 'Joins the household in',
        short: 'Blank: from the birth year',
        tip: "For a child who joins the household after birth, such as an adopted child: the year the child is placed with you or moves in. The child counts as a dependent for that whole year and every year after (IRS Publication 501's rule for a child placed for adoption), for the Child Tax Credit, head of household, the ACA household and the state credits. Age still comes from the birth year. Leave blank for a child who has lived with you since birth. The Child Tax Credit assumes the child has a Social Security number; a child with only an adoption number (ATIN) gets the $500 credit for other dependents instead, which is not modeled. The adoption credit is not modeled.",
        min: CHILD_BIRTH_YEAR_MIN,
        max: CHILD_BIRTH_YEAR_MAX,
        step: 1,
      },
      {
        key: 'student',
        kind: 'check',
        label: 'Full-time student after 18',
        short: 'Counts as a dependent through age 23',
        tip: 'Checked: the child is treated as a qualifying child through the year they turn 23 (a full-time student), instead of through 18. Disabled adult children and other relatives are not modeled.',
      },
    ],
  };
  // @@shared:23-dynFieldHtml begin
  function renderDynList(name, force) {
    const spec = DYN[name],
      container = document.getElementById(spec.container),
      items = state[spec.key];
    if (!container) return;
    // Skip a rebuild while someone is typing inside this list (it would drop
    // focus/caret on every keystroke) as long as the row count hasn't changed;
    // show/hide of dependent fields is handled in place by dynApplyVisibility().
    if (!force && container.contains(document.activeElement) && container.dataset.rowCount === String(items.length)) {
      dynApplyVisibility(name);
      return;
    }
    container.dataset.rowCount = String(items.length);
    const rows = items
      .map(
        (item, i) =>
          `<div class="dyn-row"><div class="dyn-row-head"><b>${escapeHtml(spec.rowTitle(i))}</b><button type="button" class="dyn-remove" data-dyn-remove="${i}" aria-label="Remove ${escapeHtml(spec.rowTitle(i).toLowerCase())}" title="Remove">×</button></div>${spec.fields.map((f) => dynFieldHtml(spec, f, item, i)).join('')}</div>`,
      )
      .join('');
    const full = items.length >= LIST_MAX;
    container.innerHTML =
      `<p class="range-note">${escapeHtml(spec.note)}${dynTipBtn(spec.tip)}</p>` +
      (items.length ? rows : '<p class="dyn-empty">None added yet.</p>') +
      `<button type="button" class="btn-card dyn-add" data-dyn-add="${name}"${full ? ' disabled title="Up to ' + LIST_MAX + '"' : ''}>${escapeHtml(spec.addLabel)}</button>`;
    refreshMoneyPreviews(container);
  }
  function dynApplyVisibility(name) {
    const spec = DYN[name],
      container = document.getElementById(spec.container);
    if (!container) return;
    state[spec.key].forEach((item, i) =>
      spec.fields.forEach((f) => {
        if (!f.showIf) return;
        const input = container.querySelector(`[data-dyn-i="${i}"][data-dyn-k="${f.key}"]`),
          wrap = input && input.closest('[data-dyn-wrap]');
        if (wrap) wrap.hidden = !f.showIf(item);
      }),
    );
  }
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
  function renderLoanFields() {
    renderDynList('loans');
  }
  function renderIncomeSourceFields() {
    renderDynList('incomeSources');
  }
  function renderOneTimeIncomeFields() {
    renderDynList('oneTimeIncome');
  }
  function renderExtraExpenseFields() {
    renderDynList('extraExpenses');
  }
  function renderLumpExpenseFields() {
    renderDynList('lumpExpenses');
  }
  function renderSpendingTierFields() {
    renderDynList('spendingTiers');
  }
  function renderChildFields() {
    renderDynList('children');
  }
  // @@shared:23-dynFieldHtml end
  function syncControls() {
    FIELDS.forEach((field) => {
      if (field.type !== 'number') return;
      const id = field.key,
        el = document.getElementById(id);
      // Skip writing .value to whatever field is currently focused, if the
      // numeric value hasn't actually changed. syncControls() runs on every
      // edit to a field with clamping side effects (retireAgeA, extraPrincipal,
      // etc. — see the input listener below), which on mobile can include a
      // slider drag while a *different* text field is still focused (e.g. the
      // on-screen keyboard was dismissed via the Android back button, which
      // hides the keyboard without blurring the field). Programmatically
      // setting .value on a focused input — even to the same string — can
      // make some mobile browsers re-show the keyboard for it, so a slider
      // drag elsewhere was reopening the number pad on a field the user had
      // already backed out of. Comparing against the current numeric value
      // (stripping the money field's "$"/commas) keeps this a no-op guard
      // only — a field whose value genuinely needs updating still gets it.
      const currentNumeric = Number(String(el.value).replace(/[^0-9.-]/g, '')) || 0;
      if (!(el === document.activeElement && currentNumeric === state[id])) el.value = state[id];
      if (field.out && field.outSync === 'controls') syncFieldOut(field);
    });
    FIELDS.filter((field) => isDomWired(field) && field.sync === 'controls').forEach(syncFieldDom);
    renderLoanFields();
    // Partner B's elements hide in single-person mode, and otherwise only when their own registry reveal
    // hides them (the 72(t) first-payment fields while their box is unchecked).
    document
      .querySelectorAll('[data-partner-b]')
      .forEach((el) => (el.hidden = !!state.singlePerson || revealHidden(el.id)));
    // E1c: the main job's match and premium fields hide for a self-employed partner.
    for (const id of ['matchAField', 'healthPremiumAField']) document.getElementById(id).hidden = revealHidden(id);
    // Rule of 55 needs retirement at 55 or later and does nothing from 60 (no penalty left to avoid).
    for (const p of ['A', 'B']) {
      const r = state['retireAge' + p],
        box = document.getElementById('ruleOf55' + p),
        note = document.getElementById('ruleOf55' + p + 'Note');
      box.disabled = r < 55 || r >= 60;
      note.textContent =
        r < 55 ? `Needs retirement at 55 or later (now ${r})` : r >= 60 ? 'No penalty to avoid: retires at 60 or later' : `No 10% penalty on Partner ${p}'s 401(k) withdrawals from 55 to 59½`;
    }
    document.getElementById('filingStatusFields').hidden = !!state.singlePerson;
    document.getElementById('ageAHead').textContent = state.singlePerson ? 'Age' : 'Partner A age';
    document.getElementById('ageBHead').hidden = !!state.singlePerson;
    document.getElementById('ltcLabelSuffix').textContent = state.singlePerson ? '' : ' (couple)';
    dynApplyVisibility('incomeSources');
    [
      ['ownBtn', 'own'],
      ['rentBtn', 'rent'],
      ['buyLaterBtn', 'rentThenBuy'],
    ].forEach(([id, value]) => {
      const active = state.tenure === value;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    document.getElementById('homeValueFields').hidden = state.tenure === 'rent';
    document.getElementById('ownerFields').hidden = state.tenure !== 'own';
    document.getElementById('renterFieldsShared').hidden = state.tenure === 'own';
    document.getElementById('buyLaterFields').hidden = state.tenure !== 'rentThenBuy';
    // The "pay off my mortgage?" decision question only makes sense with an
    // actual current mortgage to accelerate — hide it for rent/rentThenBuy
    // rather than showing a comparison that isn't really answerable yet.
    document.querySelector('[data-question="mortgagePayoff"]').hidden = state.tenure !== 'own';
    document.getElementById('homeValueLabel').textContent =
      state.tenure === 'rentThenBuy' ? 'Home value if bought today' : 'Real estate value';
    document.getElementById('maintenanceHint').textContent =
      state.tenure === 'rentThenBuy' ? 'Applies once you buy' : 'Applies once you own';
    document.getElementById('propertyTaxHint').textContent =
      state.tenure === 'rentThenBuy'
        ? 'Applies once you buy; keeps applying after the mortgage is paid off'
        : 'Applies once you own; keeps applying after the mortgage is paid off';
    document.getElementById('homeInsuranceHint').textContent =
      state.tenure === 'rentThenBuy'
        ? 'Applies once you buy; keeps applying after the mortgage is paid off'
        : 'Applies once you own; keeps applying after the mortgage is paid off';
    document.querySelectorAll('.swr-input').forEach((el) => {
      if (document.activeElement !== el) el.value = String(state.fiWithdrawalRate);
    });
    document.querySelectorAll('[data-wizard-mirror]').forEach((el) => {
      el.value = state[el.dataset.wizardMirror];
    });
    [
      ['buyMortgageBtn', false],
      ['buyCashBtn', true],
    ].forEach(([id, value]) => {
      const active = state.buyCash === value;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    document.getElementById('buyMortgageFields').hidden = !!state.buyCash;
    [
      ['incomeKindAWagesBtn', 'wages', 'incomeKindA'],
      ['incomeKindASelfBtn', 'self', 'incomeKindA'],
      ['incomeKindBWagesBtn', 'wages', 'incomeKindB'],
      ['incomeKindBSelfBtn', 'self', 'incomeKindB'],
      ['k401TraditionalBtn', 'traditional', 'k401Type'],
      ['k401RothBtn', 'roth', 'k401Type'],
      ['iraTraditionalBtn', 'traditional', 'iraType'],
      ['iraRothBtn', 'roth', 'iraType'],
      ['pensionNoneBtn', 'none', 'pensionCoverage'],
      ['pensionABtn', 'a', 'pensionCoverage'],
      ['pensionBBtn', 'b', 'pensionCoverage'],
      ['pensionBothBtn', 'both', 'pensionCoverage'],
      ['mfjBtn', 'mfj', 'filingStatus'],
      ['singleBtn', 'single', 'filingStatus'],
    ].forEach(([id, value, key]) => {
      const el = document.getElementById(id),
        selected = state[key] === value;
      el.classList.toggle('active', selected);
      el.setAttribute('aria-checked', selected);
    });
    refreshMoneyPreviews();
  }
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
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('printReportBtn').addEventListener('click', () => {
    buildPrintReport();
    window.print();
  });
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
  function syncContributionControls() {
    FIELDS.filter((field) => field.outSync === 'contrib').forEach(syncFieldOut);
    FIELDS.filter((field) => isDomWired(field) && field.sync === 'contrib').forEach(syncFieldDom);
    document.getElementById('survivorGroup').hidden = !!state.singlePerson;
    renderSpendingTierFields();
    renderIncomeSourceFields();
    renderOneTimeIncomeFields();
    renderExtraExpenseFields();
    renderLumpExpenseFields();
    renderChildFields();
  }
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
  function setChartView(next) {
    assignChartView(next);
    if (CHART_GROUPS[next] === 'projection') assignLastProjectionView(next);
    if (next === 'hist' || next === 'mc') {
      assignLogScale(true);
      document.getElementById('logScaleToggle').checked = true;
    }
    const map = {
      '3yr': 'chartView3Btn',
      '1yr': 'chartView1Btn',
      cagr: 'chartViewCagrBtn',
    };
    Object.entries(map).forEach(([key, id]) => {
      const active = key === next;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    const group = CHART_GROUPS[next],
      groupMap = { projection: 'chartGroupProjectionBtn', hist: 'chartGroupHistBtn', mc: 'chartGroupMcBtn' };
    Object.entries(groupMap).forEach(([key, id]) => {
      const active = key === group;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    document.getElementById('projectionSubToggle').hidden = group !== 'projection';
    render();
  }
  function setMode(next) {
    assignMode(next);
    document.getElementById('realBtn').classList.toggle('active', mode === 'real');
    document.getElementById('nominalBtn').classList.toggle('active', mode === 'nominal');
    document.getElementById('realBtn').setAttribute('aria-checked', mode === 'real');
    document.getElementById('nominalBtn').setAttribute('aria-checked', mode === 'nominal');
    document.getElementById('dollarModeBtn').textContent = mode === 'real' ? '2026 dollars ▾' : 'Future dollars ▾';
    render();
    saveInputs();
  }
  let undoSnapshot = null;
  let undoToastTimer = null;
  function snapshotForUndo(label) {
    undoSnapshot = {
      label,
      state: JSON.parse(JSON.stringify(state)),
      mode,
      logScale,
    };
    showUndoToast(label);
  }
  function showUndoToast(label) {
    const toast = document.getElementById('undoToast');
    const text = document.getElementById('undoToastText');
    if (!toast || !text) return;
    text.textContent = `${label}. `;
    toast.hidden = false;
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => hideUndoToast(), 10000);
  }
  function hideUndoToast() {
    const toast = document.getElementById('undoToast');
    if (toast) toast.hidden = true;
    clearTimeout(undoToastTimer);
    undoSnapshot = null;
  }
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
  // The Plan status bar and (on mobile) the Inputs/Dashboard tab switcher
  // @@shared:27-syncKeyboardInset begin
  // Checking/unchecking a sidebar checkbox (or changing a <select> like
  // tenure/k401Type) can add or remove other fields elsewhere in the panel
  // -- singlePerson hides/shows every data-partner-b field across several
  // groups at once, and most opt-in checkboxes (ACA, LTC, other
  // income, other loans, survivor, guardrails, Roth conversion/RRSP
  // meltdown, mega backdoor) show/hide fields within their own group. The
  // resulting height change shifts everything below the toggle, which can
  // jump the control the person just clicked out from under their
  // cursor/finger and lose their place in a long sidebar. Preserve the
  // toggle's own on-screen position across that reflow instead: this
  // listener is registered on `document` with capture:true, so it fires
  // before the field's own `change` listener runs the actual show/hide,
  // letting it record the toggle's position pre-mutation; two animation
  // frames later (once layout has settled) it adjusts whichever container
  // actually scrolls -- the whole page on mobile (`.panel` is
  // `position:static` there) or `.panel`'s own internal scroll on desktop
  // -- by the resulting delta, so the toggle itself doesn't visually move.
  document.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
      if (t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'radio') return;
      const panel = t.closest('.panel');
      if (!panel) return;
      const before = t.getBoundingClientRect().top;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const after = t.getBoundingClientRect().top;
          const delta = after - before;
          if (Math.abs(delta) < 1) return;
          if (window.innerWidth <= 820) {
            window.scrollBy(0, delta);
          } else {
            panel.scrollTop += delta;
          }
        });
      });
    },
    true,
  );
  // Real-world bug report, still reproducing on-device after the
  // syncControls()/attachMoneyPreview/dynamic-list fixes above: focus a
  // text/money field (opens the on-screen keyboard), then drag a slider
  // elsewhere on the page while the text field's caret is still sitting in
  // it (never blurred) — the keyboard pops back up over the field, even
  // though nothing in this file's own code still writes to that field's
  // `.value` or rebuilds its DOM node (both were audited and swept with
  // Playwright across every slider in both files, at both desktop and
  // mobile widths, with zero spurious writes and no focus loss found). This
  // points to a platform-level quirk rather than a remaining DOM bug: some
  // mobile browsers/WebViews re-evaluate whether to show the soft keyboard
  // whenever the page regains "input focus" from a touch gesture, even one
  // aimed at a completely different control, as long as some element (here,
  // the text field the person never explicitly left) still technically has
  // DOM focus. The fix that's actually within this file's control either
  // way: explicitly blur the old field ourselves, as early in the gesture
  // as possible, whenever a slider drag begins elsewhere. A field with no
  // focus gives the OS keyboard nothing to reopen for, regardless of the
  // exact underlying platform mechanism, and it also matches how a person
  // would expect a well-behaved page to react to them starting to interact
  // with something else. `pointerdown` (not `input`, which only fires once
  // the drag has already started moving the thumb) is used so the blur
  // happens at the very first touch, before any keyboard-reopen animation
  // has a chance to begin.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== 'range') return;
      const active = document.activeElement;
      if (
        active &&
        active !== t &&
        active instanceof HTMLInputElement &&
        (active.type === 'text' || active.type === 'number') &&
        typeof active.blur === 'function'
      ) {
        active.blur();
      }
    },
    true,
  );
  // Touch/pen vs. page-scroll gesture disambiguation for range sliders.
  //
  // On-device testing (Android Chrome, see the slider-gesture-disambiguation
  // branch's scope doc) ruled out the simpler "just watch touch direction,
  // never call preventDefault()" approach: touching a native
  // <input type=range> track snaps its value to the touch point on the very
  // first touch, before any movement and before any JS runs, and further
  // movement is then split between dragging the thumb and scrolling the
  // page, with the scroll throttled to a fraction of the actual finger
  // travel (confirmed with a diagnostic build: a 10px vertical drag produced
  // under 2px of page scroll). There's no reliable way to get clean,
  // deliberate behavior without taking over the whole gesture ourselves.
  //
  // A first version of this fix used `touch-action:none` on the slider plus
  // `preventDefault()` in a pointer event handler, on the theory that
  // either — or both together — would suppress the browser's native
  // handling. On-device testing (real Android Chrome) disproved that
  // theory completely: `getComputedStyle` confirmed `touch-action:none` was
  // genuinely applying (it correctly stopped the page from panning), and
  // instrumenting `Event.prototype.preventDefault` confirmed it was
  // genuinely being called on every `pointerdown`/`pointermove` — and the
  // slider *still* visibly jumped and dragged regardless. This browser
  // treats a native `<input type=range>`'s own touch-drag as a default
  // action that neither `touch-action` nor `preventDefault()` can suppress.
  // Nothing short of keeping the touch from ever reaching the real input
  // element in the first place actually works.
  //
  // So: `setupRangeTouchCatchers()` (below) wraps every slider in a small
  // positioned container and inserts an invisible sibling
  // `.range-touch-catcher` `<div>` directly on top of it. On a
  // coarse-pointer (touch-primary) device, that catcher — not the real
  // `<input>` — is what the finger actually lands on, via
  // `@media(pointer:coarse){.range-touch-catcher{pointer-events:auto}}`
  // (`pointer-events:none` the rest of the time, so mouse clicks pass
  // straight through to the real input on every non-touch-primary device,
  // completely unaffected). A structural guarantee like this is much
  // stronger than hoping an API call suppresses a default action: the
  // browser can't run a native default action on an element that never
  // received the touch to begin with.
  //
  // The catcher's own `touch-action` is `pan-y`, not `none` — since it's a
  // plain `<div>` with no default action of its own, `pan-y` lets the
  // browser's native compositor-thread scrolling handle a vertical drag
  // entirely for free (smooth, real momentum, zero JS involved), while
  // still forbidding the catcher's own default handling of anything
  // *other* than vertical panning — so a horizontal drag has no competing
  // native behavior to fight, and this code is free to treat it purely as
  // a slider drag. (This sidesteps the earlier "touch-action can't be
  // flipped mid-gesture" problem entirely, because it's never flipped: the
  // value is fixed from the start, and it's the browser's own native
  // scrolling — not our JS — that's now doing the "scroll" half of the
  // decision.)
  //
  // A `resolveRangeTarget()` fallback still recognizes a touch that lands
  // directly on the real `<input>` (an older browser that doesn't support
  // the `pointer` media feature, or any gap in the catcher's sizing) and
  // falls back to the original touch-action:none/preventDefault()/manual-
  // scroll approach for that path — belt-and-suspenders, not load-bearing,
  // since the catcher is what actually carries the fix on the device this
  // was tested against.
  (function () {
    const DRAG_THRESHOLD = 8; // px of movement before committing to drag-or-scroll

    function setupRangeTouchCatchers() {
      document.querySelectorAll('input[type=range]').forEach((input) => {
        if (input.parentElement && input.parentElement.classList.contains('range-touch-wrap')) return;
        const wrap = document.createElement('span');
        wrap.className = 'range-touch-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        const catcher = document.createElement('div');
        catcher.className = 'range-touch-catcher';
        catcher.setAttribute('aria-hidden', 'true');
        catcher._rangeInput = input; // plain JS property, not a DOM attribute — internal use only
        wrap.appendChild(catcher);
      });
    }
    setupRangeTouchCatchers();

    const gestures = new Map(); // pointerId -> gesture state

    function isTouchLike(e) {
      return e.pointerType === 'touch' || e.pointerType === 'pen';
    }

    // Returns { el, viaCatcher } for a touch/pen event aimed at a slider
    // (through the catcher, the normal path, or directly at the real
    // input, the fallback path), or null for anything else.
    function resolveRangeTarget(e) {
      const t = e.target;
      if (t instanceof HTMLElement && t.classList.contains('range-touch-catcher') && t._rangeInput) {
        return { el: t._rangeInput, viaCatcher: true };
      }
      if (t instanceof HTMLInputElement && t.type === 'range') {
        return { el: t, viaCatcher: false };
      }
      return null;
    }

    // Fallback-path only (see file note above) — same "which container
    // actually scrolls" split used elsewhere in this file: window on
    // mobile (.panel is position:static there), .panel's own internal
    // overflow-y:auto scroll on desktop.
    function scrollContainerFor(el) {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return window;
    }

    function scrollContainerBy(container, dy) {
      if (container === window) window.scrollBy(0, dy);
      else container.scrollTop += dy;
    }

    // Reimplements the native "tap/drag this X position on the track" math
    // — needed on both paths, since neither the catcher (not a form
    // control) nor the fallback path (touch-action:none there) gets this
    // for free from the browser.
    function valueFromPointerX(el, clientX) {
      const rect = el.getBoundingClientRect();
      const min = Number(el.min) || 0;
      const max = Number(el.max) || 100;
      const step = Number(el.step) || 1;
      let frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      frac = Math.max(0, Math.min(1, frac));
      let raw = min + frac * (max - min);
      raw = Math.round((raw - min) / step) * step + min;
      return Math.max(min, Math.min(max, raw));
    }

    function setSliderValue(el, v) {
      const s = String(v);
      if (el.value === s) return false;
      el.value = s;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    document.addEventListener(
      'pointerdown',
      (e) => {
        const target = resolveRangeTarget(e);
        if (!target) return;
        // The fallback (direct-input) path only intercepts touch/pen — a
        // mouse there should behave exactly as native, since touch-action
        // only affects touch/pen and there's a real native input to drag.
        // The catcher path has no such native fallback (it's a plain div,
        // not a form control), and CSS pointer-events doesn't filter by
        // pointer type — on a coarse-pointer device (e.g. a touchscreen
        // laptop) a plugged-in mouse would land on the catcher too, so it
        // must be handled here regardless of pointerType or it would be
        // silently swallowed.
        if (!target.viaCatcher && !isTouchLike(e)) return;
        gestures.set(e.pointerId, {
          el: target.el,
          viaCatcher: target.viaCatcher,
          startX: e.clientX,
          startY: e.clientY,
          lastY: e.clientY,
          decided: null, // null (undecided) | 'drag' | 'scroll'
          container: null,
        });
        // Fallback path only: see the touch-action:none/preventDefault()
        // note in the file comment above for why this alone isn't
        // sufficient on every browser — it's the catcher path (see above)
        // that actually carries the fix.
        if (!target.viaCatcher && e.cancelable) e.preventDefault();
      },
      true,
    );

    document.addEventListener(
      'pointermove',
      (e) => {
        const g = gestures.get(e.pointerId);
        if (!g) return;
        if (!g.viaCatcher && e.cancelable) e.preventDefault(); // fallback path only
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        if (!g.decided) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return;
          g.decided = Math.abs(dy) > Math.abs(dx) ? 'scroll' : 'drag';
          if (g.decided === 'scroll') {
            if (!g.viaCatcher) g.container = scrollContainerFor(g.el);
            // Catcher path: nothing to do — its own touch-action:pan-y
            // already lets the browser's native scrolling handle this.
          } else {
            try {
              g.el.setPointerCapture(e.pointerId);
            } catch (err) {
              /* not critical — dragging still works without capture */
            }
          }
        }
        if (g.decided === 'drag') {
          setSliderValue(g.el, valueFromPointerX(g.el, e.clientX));
        } else if (!g.viaCatcher) {
          scrollContainerBy(g.container, -(e.clientY - g.lastY));
        }
        g.lastY = e.clientY;
      },
      true,
    );

    function endGesture(e, isCancel) {
      const g = gestures.get(e.pointerId);
      if (!g) return;
      if (!isCancel && g.decided === null) {
        // Movement never crossed the threshold — a plain tap. Neither path
        // gets a native tap-to-jump for free (the catcher isn't a form
        // control; the fallback path's touch-action:none suppresses it),
        // so this reimplements it directly.
        setSliderValue(g.el, valueFromPointerX(g.el, e.clientX));
        g.el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (g.decided === 'drag') {
        g.el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      gestures.delete(e.pointerId);
    }
    document.addEventListener('pointerup', (e) => endGesture(e, false), true);
    document.addEventListener('pointercancel', (e) => endGesture(e, true), true);
  })();
  // Everything the status bar shows (retirement age, investable assets at
  // retirement, whether the plan depletes) is already computed by every
  // render() call — no extra cost. The one thing that isn't cheap is the
  // historical success rate (a ~70-90-cycle backtest via
  // runHistoricalCycles(), same function the collapsed "Historical
  // (S&P 500)" chart view uses) — running that on every keystroke would add
  // real typing lag, so it's debounced to a short idle period after the
  // last input change instead of being computed inline in render(). Until
  // the first debounced pass finishes (page load, or right after any edit),
  // the bar simply omits that clause rather than showing a stale or
  // placeholder number.
  let planStatusHistTimer = null,
    planStatusHistRate = null;
  function schedulePlanStatusHistRate() {
    clearTimeout(planStatusHistTimer);
    planStatusHistTimer = setTimeout(() => {
      const { successRate } = runHistoricalCycles();
      planStatusHistRate = successRate;
      renderPlanStatusBar({ reschedule: false });
    }, 500);
  }
  let planStatusLastText = null,
    planStatusUpdatedTimer = null;
  function renderPlanStatusBar(opts) {
    const selected = simulate(),
      retirement =
        selected.rows.find((r) => r.year === selected.retirementYear) || selected.rows[0];
    const retireAgeText = state.singlePerson
      ? `Retire ${retirement.age}`
      : `Retire ${retirement.age}${retirement.ageB != null ? `/${retirement.ageB}` : ''}`;
    const lastsText = selected.depletedAge
      ? `depletes at ${selected.depletedAge}`
      : `lasts to ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    const parts = [
      retireAgeText,
      compact(displayValue(retirement.investable, retirement.year)) + ' at retirement',
      lastsText,
    ];
    if (planStatusHistRate != null) parts.push(`${(planStatusHistRate * 100).toFixed(0)}% historical success`);
    const text = parts.join(' · ');
    const textEl = document.getElementById('planStatusText');
    if (textEl) textEl.textContent = text;
    // Dashboard's prominent "Historical success" tile reuses this same
    // debounced backtest rather than running it a second time.
    const dashHist = document.getElementById('dashHistSuccess'),
      dashHistSub = document.getElementById('dashHistSuccessSub');
    if (dashHist) {
      if (planStatusHistRate != null) {
        dashHist.textContent = `${(planStatusHistRate * 100).toFixed(0)}%`;
        dashHist.className =
          planStatusHistRate === 1 ? 'positive' : planStatusHistRate < 0.9 ? 'negative' : 'warning';
      } else {
        dashHist.textContent = '—';
        dashHist.className = '';
      }
      if (dashHistSub) dashHistSub.textContent = 'Every 1928–2025 starting year';
    }
    const updatedEl = document.getElementById('planStatusUpdated');
    if (updatedEl && text !== planStatusLastText && planStatusLastText !== null) {
      updatedEl.textContent = 'Updated just now';
      updatedEl.classList.add('show');
      clearTimeout(planStatusUpdatedTimer);
      planStatusUpdatedTimer = setTimeout(() => {
        updatedEl.classList.remove('show');
        // On mobile, .show animates max-height in over .3s (see the
        // .plan-status-updated CSS) — its removal shrinks the bar back
        // down the same way, and the sticky Inputs/Dashboard tabs below
        // it need to know its real settled height once that finishes, not
        // the mid-transition one. See the matching comment below.
        setTimeout(syncPlanStatusOffsets, 320);
      }, 3000);
    }
    planStatusLastText = text;
    // `reschedule` is false when this call comes from the debounced
    // historical-success callback itself — otherwise it would immediately
    // re-arm its own timer and recompute the backtest again every 500ms
    // forever, with nothing left to actually wait on.
    if (!opts || opts.reschedule !== false) schedulePlanStatusHistRate();
    syncPlanStatusOffsets();
    syncPanelMaxHeight();
    // The sync above runs synchronously right as `.show` is added (or the
    // text wraps to a new line), but on mobile `.plan-status-updated`'s
    // max-height animates in over .3s (see its CSS) rather than jumping
    // immediately — reading `offsetHeight` this instant catches the *pre*-
    // transition (collapsed) height, undercounting `--plan-status-h` by
    // the pulse's grown height for as long as it stays visible. Nothing
    // else re-measures once the transition finishes, so the tabs/search
    // bars below would stay pinned to a stale, too-small offset (and,
    // depending on scroll position, let a sliver of real content show
    // through under them) until some unrelated edit happened to trigger
    // another render() well after the animation settled. Re-sync once the
    // transition duration has actually elapsed to catch the real height.
    if (updatedEl && updatedEl.classList.contains('show')) setTimeout(syncPlanStatusOffsets, 320);
  }
  document.getElementById('planStatusBar').addEventListener('click', () => {
    const bar = document.getElementById('planStatusBar');
    if (document.getElementById('workspace').dataset.mobileView === 'inputs') {
      setMobileView('dashboard');
    }
    const metrics = document.querySelector('.metrics');
    if (metrics) {
      metrics.scrollIntoView({ behavior: 'smooth', block: 'start' });
      metrics.classList.add('flash-highlight');
      setTimeout(() => metrics.classList.remove('flash-highlight'), 1200);
    }
    bar.setAttribute('aria-expanded', 'true');
    setTimeout(() => bar.setAttribute('aria-expanded', 'false'), 1200);
  });
  // Mobile-only (hidden via CSS outside the <=820px media query): a
  // dedicated, obvious path from the plan verdict straight to the input
  // form, rather than relying on someone noticing the Inputs tab in the
  // switcher above. Scrolls to the top first — switching tabs on mobile
  // just swaps which of `.panel`/`.content` is displayed in place, so
  // without this a person scrolled deep into the Dashboard would land
  // partway down the (now different-height) Inputs panel instead of at
  // its top.
  document.getElementById('changeAssumptionsBtn').addEventListener('click', () => {
    setMobileView('inputs');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
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
  setSidebarCollapsed(sidebarCollapsed);
  document.getElementById('sidebarCollapseBtn').addEventListener('click', () => setSidebarCollapsed(!sidebarCollapsed));
  document.getElementById('categoryRail')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat]');
    if (btn) setActiveCategory(btn.dataset.cat, { scrollToRail: true });
  });
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
  // Wizard modal: a two-step guided setup. Step 1 proxies the handful of
  // fields needed to get any projection running at all (single/partnered,
  // ages, income, retirement age, starting balances, spending); step 2 is the
  // existing optional-feature checklist. Every wizard field proxies its real
  // sidebar control by driving it and dispatching a real input/change event,
  // so all the existing state-mutation/hide/re-render logic runs exactly
  // once, from a single source of truth, whether set here or in the sidebar.
  [
    ['wizardLtcEnabled', 'ltcEnabled'],
    ['wizardAcaEnabled', 'acaEnabled'],
    ['wizardRothConvEnabled', 'rothConvEnabled'],
    ['wizardMegaBackdoor', 'megaBackdoor'],
    ['wizardGuardrailsEnabled', 'guardrailsEnabled'],
    ['wizardSinglePerson', 'singlePerson'],
  ].forEach(([wizardId, realId]) => {
    document.getElementById(wizardId).addEventListener('change', (e) => {
      const real = document.getElementById(realId);
      real.checked = e.target.checked;
      real.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  // @@shared:28-wizardOverlay begin
  // Every wizard input that proxies a sidebar control names it in data-wizard-mirror: a
  // change drives the real control with real input/change events, so all the existing
  // state, visibility and render logic runs once, from one source of truth.
  document.querySelectorAll('[data-wizard-mirror]').forEach((wizardEl) => {
    wizardEl.addEventListener('change', (e) => {
      const real = document.getElementById(wizardEl.dataset.wizardMirror);
      real.value = e.target.value;
      real.dispatchEvent(new Event('input', { bubbles: true }));
      real.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  let wizardStep = 1;
  function renderWizardStep() {
    wizardSteps.forEach((el, i) => (el.hidden = wizardStep !== i + 1));
    const current = wizardSteps[wizardStep - 1];
    document.getElementById('wizardTitle').textContent = current.dataset.title;
    document.getElementById('wizardStepNote').textContent =
      `Step ${wizardStep} of ${wizardSteps.length} — ${current.dataset.note}`;
    document.getElementById('wizardBackBtn').hidden = wizardStep === 1;
    document.getElementById('wizardNextBtn').hidden = wizardStep === wizardSteps.length;
    document.getElementById('wizardCloseBtn').hidden = wizardStep === 1;
    // #wizardModal itself is the scrolling container (overflow:auto) — it's
    // one persistent element across every step, never recreated, so its
    // scrollTop carries over from whatever step was showing before. Without
    // this, clicking "Next" from partway (or all the way) down a long step
    // left the next step rendered already scrolled to that same position —
    // often right at the bottom, since the Next button itself sits at the
    // very end of the step. Reset on every step change (including the initial
    // open) so each step always starts at its own top.
    document.getElementById('wizardModal').scrollTop = 0;
  }
  document.getElementById('wizardBtn').addEventListener('click', () => {
    wizardStep = 1;
    renderWizardStep();
    wizardOverlay.classList.add('open');
  });
  document.getElementById('wizardNextBtn').addEventListener('click', () => {
    wizardStep = Math.min(wizardSteps.length, wizardStep + 1);
    renderWizardStep();
  });
  document.getElementById('wizardBackBtn').addEventListener('click', () => {
    wizardStep = Math.max(1, wizardStep - 1);
    renderWizardStep();
  });
  document.getElementById('wizardCloseBtn').addEventListener('click', () => {
    wizardOverlay.classList.remove('open');
    // "What's visible after the wizard is done" should be the plan itself,
    // not the input form they just finished with — on mobile, that means
    // landing on the Dashboard tab (harmless to call on desktop too, where
    // setMobileView has no visible effect; see the CSS note above).
    setMobileView('dashboard');
  });
  wizardOverlay.addEventListener('click', (e) => {
    if (e.target === wizardOverlay) wizardOverlay.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') wizardOverlay.classList.remove('open');
  });
  // Visible on every wizard step (unlike wizardBackBtn/wizardNextBtn/
  // wizardCloseBtn, which the wizardStep hidden-toggling logic above
  // governs) — does exactly what Escape/outside-click already do.
  document.getElementById('wizardXBtn').addEventListener('click', () => {
    wizardOverlay.classList.remove('open');
  });
  // The tornado chart is only computed while expanded (it's a handful of
  // extra simulate() calls, cheap but pointless work while collapsed), so
  // opening it needs its own trigger since no input necessarily changed.
  document.getElementById('sensitivityCard').addEventListener('toggle', (e) => {
    if (e.target.open) render();
  });
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
  document.getElementById('sankeyCard').addEventListener('toggle', (e) => {
    if (e.target.open) render();
  });
  // Same lazy-compute reasoning as the three toggle listeners above: the
  // per-button delta previews cost a handful of simulate() calls each, so
  // they're only worth computing once the "Explore a question" bubble is
  // actually expanded and visible.
  document.getElementById('decisionCard').addEventListener('toggle', (e) => {
    if (e.target.open) renderDecisionQuestionPreviews();
  });
  document.getElementById('sankeyAge').addEventListener('input', () => {
    if (document.getElementById('sankeyCard').open) renderSankey(simulate());
  });
  // First-run banner: the dashboard renders with fully-formed generic
  // default numbers from the moment the page loads, which reads to a
  // brand-new visitor as someone else's finished plan rather than an
  // invitation to enter their own. This banner names that explicitly and
  // points at the two real entry points (the wizard, or importing an
  // exported scenario) rather than leaving the person to notice the
  // sidebar on their own. It dismisses itself the moment its purpose is
  // served — a real edit anywhere in the sidebar, the wizard being opened
  // (intent is clear the moment they click), or a scenario actually
  // imported — rather than needing to be closed by hand. For a *returning*
  // visitor whose real plan was loaded back from this browser's storage at
  // boot, it's skipped entirely (see `hadSavedState` above) rather than
  // needing to be dismissed again on every visit.
  function dismissFirstRunBanner() {
    document.getElementById('firstRunBanner').hidden = true;
    hasPersonalizedData = true;
    syncPanelMaxHeight();
  }
  document.querySelector('.panel').addEventListener(
    'input',
    () => dismissFirstRunBanner(),
    { once: true, capture: true },
  );
  document.querySelector('.panel').addEventListener(
    'change',
    () => dismissFirstRunBanner(),
    { once: true, capture: true },
  );
  document.getElementById('firstRunGetStartedBtn').addEventListener('click', () => {
    dismissFirstRunBanner();
    document.getElementById('wizardBtn').click();
  });
  document.getElementById('firstRunImportBtn').addEventListener('click', () => {
    document.getElementById('importScenarioInput').click();
  });
  // "Explore a question" menu: each button either renders a compare-type
  // answer (a takeaway sentence + a small table, built from
  // DECISION_QUESTIONS' run()) or opens an existing card in place (an
  // open-type question, e.g. handing off to the sensitivity/tornado card
  // that already exists rather than duplicating it here).
  function renderDecisionQuestionAnswer(id) {
    const q = DECISION_QUESTIONS[id],
      answer = document.getElementById('decisionAnswer');
    document
      .querySelectorAll('#decisionQuestions button')
      .forEach((b) => b.classList.toggle('active', b.dataset.question === id));
    if (q.kind === 'open') {
      q.open();
      const note = q.note ? q.note() : '';
      answer.innerHTML = note ? `<p><b>${escapeHtml(note)}</b></p>` : '';
      answer.hidden = !note;
      return;
    }
    const { rows, sentence } = q.run();
    answer.innerHTML = `<p><b>${escapeHtml(sentence)}</b></p>` + renderDecisionCompareTable(rows);
    answer.hidden = false;
    // Same reasoning as the 'open' questions above: with 8 questions now in
    // the menu, the answer can render well below the fold (or, on mobile,
    // behind the Inputs tab) without ever coming into view on its own.
    switchToDashboardTab();
    answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.getElementById('decisionQuestions').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-question]');
    if (!btn) return;
    renderDecisionQuestionAnswer(btn.dataset.question);
  });
  // Mobile swappable screens: below the 820px breakpoint the two-column
  // .workspace collapses to one column, so instead of one long stacked
  // scroll (inputs then dashboard) a small tab bar lets the user flip
  // between them; data-mobile-view on #workspace is what the CSS above
  // keys off to hide whichever side isn't active. Desktop ignores the
  // attribute entirely (no CSS rule reads it above 820px). Charts measure
  // their own container width via getBoundingClientRect(), which returns 0
  // while .content is display:none, so switching TO the dashboard tab
  // forces a fresh render() once it's visible again rather than trusting
  // whatever width was measured (or not measured) while hidden.
  // setMobileView is declared with `let` (not wrapped in the usual
  // self-contained IIFE) so DECISION_QUESTIONS' 'sensitivity'/'returns'
  // open() handlers can flip to the Dashboard tab themselves before
  // scrolling to a card that lives in .content — needed since a click can
  // originate from the Inputs tab now that the question row sits above the
  // tab switcher rather than inside .content.
  {
    const workspace = document.getElementById('workspace'),
      tabInputs = document.getElementById('mobileTabInputs'),
      tabDashboard = document.getElementById('mobileTabDashboard');
    setMobileView = function (view) {
      workspace.dataset.mobileView = view;
      tabInputs.classList.toggle('active', view === 'inputs');
      tabInputs.setAttribute('aria-selected', String(view === 'inputs'));
      tabDashboard.classList.toggle('active', view === 'dashboard');
      tabDashboard.setAttribute('aria-selected', String(view === 'dashboard'));
      if (view === 'dashboard') render();
      // .panel is display:none while the Dashboard tab is active, so
      // .mobile-tabs' own offsetHeight (which feeds --mobile-sticky-h,
      // read by .field-search-wrap's sticky top) can go stale while
      // switching between tabs shifts other sticky heights around;
      // switching to Inputs re-measures it fresh rather than trusting
      // whatever was last computed while a different tab was active.
      if (view === 'inputs') syncPlanStatusOffsets();
    };
    tabInputs.addEventListener('click', () => setMobileView('inputs'));
    tabDashboard.addEventListener('click', () => setMobileView('dashboard'));
    // Dashboard is the mobile default for a RETURNING visitor — on load
    // their real plan is already fully computed, so the results are what
    // they should see first, consistent with the Plan status bar's job of
    // always surfacing the model's current answer. But for a FIRST-TIME
    // visitor there's no real plan yet, only the generic example data —
    // "results first" there just means showing someone else's numbers,
    // which is exactly what the (separate) first-run banner already exists
    // to warn about. `hadSavedState` (set at boot from a real localStorage
    // read, before this block runs) is the same signal that already
    // decides whether to skip the first-run banner, so reusing it here
    // keeps first-time vs. returning treated consistently across both
    // features rather than introducing a second, possibly-divergent check.
    setMobileView(hadSavedState ? 'dashboard' : 'inputs');
  }

  // Mobile-only "minimize sticky header" toggle: collapses the
  // Inputs/Dashboard tab switcher + the field search box (the two sticky
  // bars beneath the Plan Status Bar) to reclaim vertical space, most
  // useful once the on-screen keyboard is open and eating a big chunk of
  // an already-small viewport. Deliberately excludes the Plan Status Bar
  // itself (that one's meant to always stay visible as "the answer"; this
  // toggle only ever touches navigation/search chrome) and is a pure
  // display toggle, not part of `state` — same reasoning as `logScale`/
  // `chartView`/mobile-tab-view, none of which persist across reloads
  // either. The toggle button itself is `position:fixed` (not part of the
  // sticky stack it controls) so it stays reachable to re-expand
  // regardless of collapsed state, with no extra sticky-offset math needed.
  {
    const headerToggle = document.getElementById('mobileHeaderToggle');
    if (headerToggle) {
      headerToggle.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('mobile-header-collapsed');
        headerToggle.textContent = collapsed ? '⌄' : '︿';
        headerToggle.setAttribute('aria-expanded', String(!collapsed));
        headerToggle.setAttribute('aria-label', collapsed ? 'Show tabs and search' : 'Hide tabs and search');
        // .mobile-tabs/.field-search-wrap's offsetHeight reads 0 while
        // hidden, so re-measure once they're visible again on expand —
        // harmless (cheap) to call unconditionally on collapse too.
        syncPlanStatusOffsets();
      });
    }
  }
  if (hadSavedState) dismissFirstRunBanner();
  syncControls();
  syncContributionControls();
  setMode(mode);
  syncTopbarHeight();
  syncPanelMaxHeight();
  syncKeyboardInset();
  initChartHover();

  makeTableWrapsFocusable();
  new MutationObserver(() => makeTableWrapsFocusable()).observe(document.body, {
    childList: true,
    subtree: true,
  });

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
  // Test-only exports for test_roth_optimizer_per_year.js — specifically
  // @@shared:block begin
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
  window.__test_refillBondReserve = refillBondReserve;
  window.__test_rotateIntoBondLadder = rotateIntoBondLadder;
  window.__test_HIST = HIST;
  // @@shared:block end
  // Cliff plan in tests: a test changes state and calls a shared hook without render(), so the hooks plan for the state
  // they see (production plans in render()). Benchmarks use the raw hooks after one explicit refresh.
  const ensureTestPlan = () => {
    if (JSON.stringify(state) !== cliffPlanStore.key || cliffPlanStore.year !== currentYear) refreshCliffPlan();
  };
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
