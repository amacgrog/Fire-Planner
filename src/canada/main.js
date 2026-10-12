import { storageKey, legacyStorageKey, storage, SCENARIO_SCHEMA_VERSION } from '../shared/ui/storage.js';
import { state, mode, scenarios, compareIds, assignState, assignMode, assignScenarios } from '../shared/core/store.js';
import { chartView, chartShiftMode, chartGapPartner, logScale, chartExpanded, chartToolbarCollapsed, mcPathCount, lastProjectionView, assignChartView, assignChartShiftMode, assignChartGapPartner, assignChartXAxisMode, assignLogScale, assignChartExpanded, assignChartToolbarCollapsed, assignMcPathCount, assignLastProjectionView } from '../shared/core/chart-prefs.js';
import { histTaxFactors, assignHistTaxFactors } from '../shared/core/tax-factors.js';
import { CHILD_BIRTH_YEAR_MAX, CHILD_BIRTH_YEAR_MIN, LIST_MAX, NO_DEPENDENTS, dependentsInYear, qualifyingChildCount } from '../shared/core/lists-and-children.js';
import { defaults } from './core/defaults.js';
import { compact, money } from '../shared/core/money-format.js';
import { ESTIMATE_ALWAYS_IDS, ESTIMATE_GATED_GROUPS } from './core/estimate-always-ids.js';
import { UNUSUAL_RANGES, computeUnusualAssumptions } from '../shared/core/estimates-and-warnings.js';
import { HIST, clamp, escapeHtml, paychecksPerYear, pct } from '../shared/core/basics.js';
import { FED_BPA_ENHANCED, FED_BPA_MIN, FED_BPA_PHASE_END, FED_BPA_PHASE_START, FED_CAPS, FED_CREDIT_RATE, FED_RATES } from './core/federal-tax-constants.js';
import { BENEFIT_RULES, PROVINCE_RULES, currentProvince, ontarioHealthPremium, scaledProgressiveTax } from './core/province-rules.js';
import { PROV_TAX } from './core/prov-tax.js';
import { FED_MEDICAL_THRESHOLD } from './core/fed-medical-threshold.js';
import { OAS_RECOVERY } from './core/oas-recovery.js';
import { BEN, BEN_NO_EXIT, bandValue, countKids, familyCreditCA } from './core/benefit-helpers.js';
import { federalBracketCeilingCA } from './core/federal-bracket-ceiling-ca.js';
import { probateFee } from './core/probate-fee.js';
import { RAMQ_CAP } from './core/ramq-cap.js';
import { CPP_ENHANCED_RATE, EI_MIE, EMPLOYMENT_AMOUNT, PAY, QC_WORKERS_DEDUCTION_MAX, QC_WORKERS_DEDUCTION_RATE } from './core/ei-mie.js';
import { TAXABLE_BASIS_KEY, newWithdrawal } from './core/taxable-basis-key.js';
import { takeCash, takeHomeEquity } from '../shared/core/take-cash.js';
import { takeRoth } from './core/take-roth.js';
import { guardrailSpendingMultiplier, mortgageResultAges, newGuardrails, recordGuardrailWithdrawal } from '../shared/core/next-guardrail-multiplier.js';
import { loanPaymentForYear } from '../shared/core/loan-payment-for-year.js';
import { pensionIncome } from '../shared/core/pension-income.js';
import { planBondLadder } from '../shared/core/bond-ladder.js';
import { BUCKET_MODE, STANDARD_MODE, routeSurplus } from './core/year-modes.js';
import { sweepExcessCash } from '../shared/core/sweep-excess-cash.js';
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
import { FIELDS } from './core/fields.js';
import { infoBubble, markUnusualFields } from '../shared/ui/estimates-and-warnings.js';
import { CURRENT_YEAR, baseSpendingNominal, displayValue, fiMultiple, futureHomePurchase, itemGrowthFactor, loanSchedules, mortgageSchedule, xAxisLabel } from '../shared/core/spending-and-loans.js';
import { getBondYears, medicalGrowth, taxFactorByYear } from '../shared/core/year-factors.js';
import { OAS_RECOVERY_THRESHOLD, provinceTaxTreatmentNote } from './core/oas-and-rrif.js';
import { AGE_AMOUNT, AGE_AMOUNT_REDUCTION, AGE_AMOUNT_THRESHOLD, FEDERAL_ELIGIBLE_DTC, PENSION_INCOME_AMOUNT, investmentIncomeCA } from './core/credits-and-gross-up.js';
import { RRIF_PENSION_AGE, gisAnnual, gisEmploymentExemption, interpKnots } from './core/gis-and-rrif.js';
import { historicalYearSource, standardYearSource } from '../shared/core/year-sources.js';
import { bootstrapReturnSeries } from '../shared/core/monte-carlo-paths.js';
import { cloneState, deltaAge, deltaMoney, overlayColors } from '../shared/core/scenario-helpers.js';
import { dynTipBtn } from '../shared/core/dyn-field-helpers.js';
import { refreshMoneyPreviews } from '../shared/ui/money-format.js';
import { getBenefits } from './core/get-benefits.js';
import { decisionDeltaPhrase } from '../shared/core/decision-end-assets.js';
import { homeBuyerAmounts, listAmountsForYear, withdrawRequiredDistributions } from './core/list-amounts-and-home-buyers.js';
import { cppAndOasIncome, housingForYear, oasAgeFactor, requiredDistributions, retirementContributions } from './core/income-and-housing-per-year.js';
import { applyRrspMeltdown, growBalances, healthcareCost } from './core/grow-balances.js';
import { renderGroupSummaries } from './ui/render-group-summaries.js';
import { renderPlanHeadline } from '../shared/ui/render-plan-headline.js';
import { renderMonteCarloChart, renderTable } from '../shared/ui/chart-render.js';
import { compactDecisionDelta } from '../shared/core/compact-decision-delta.js';
import { computeSankeyFlow } from './ui/compute-sankey-flow.js';
import { DYN } from './core/dyn.js';
import { dynFieldHtml } from '../shared/core/dyn-field-html.js';
import { renderDecisionCompareTable } from './core/render-decision-compare-table.js';
(() => {
  // @@shared:01-LIST_MAX begin
  function normalizeLists(s, raw) {
    const num = (v, d, lo = -Infinity, hi = Infinity) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
      },
      rows = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []),
      legacyLoans = !!raw && 'otherLoansEnabled' in raw,
      legacyIncome = !!raw && 'otherIncomeEnabled' in raw;
    let loans = rows(raw?.loans),
      streams = rows(raw?.incomeSources),
      lumps = rows(raw?.oneTimeIncome);
    if (legacyLoans)
      loans = raw.otherLoansEnabled
        ? loans.filter((l) => [l.principal, l.balance, l.rate, l.term, l.extra].some((v) => Number(v) > 0))
        : [];
    if (legacyIncome) {
      streams = raw.otherIncomeEnabled ? streams.filter((x) => x.enabled) : [];
      lumps = raw.otherIncomeEnabled ? lumps.filter((x) => x.enabled) : [];
    }
    const legacyGrowth = num(s.inflation, defaults.inflation, -10, 20),
      growthOf = (x, legacy, ownDefault) => ({
        followGrowth: legacy && x.followGrowth === undefined ? false : x.followGrowth !== false,
        growth: num(x.growth, ownDefault, -10, 20),
      });
    s.loans = loans.slice(0, LIST_MAX).map((l) => ({
      principal: num(l.principal, 0, 0),
      balance: num(l.balance, 0, 0),
      rate: num(l.rate, 0, 0, 40),
      term: num(l.term, 0, 0, 50),
      extra: num(l.extra, 0, 0),
    }));
    s.incomeSources = streams.slice(0, LIST_MAX).map((x) => ({
      amount: num(x.amount, 0, 0),
      startAge: num(x.startAge, 65, 0, 120),
      endAge: num(x.endAge, 75, 0, 120),
      ...growthOf(x, legacyIncome, legacyIncome ? legacyGrowth : defaults.incomeGrowth),
    }));
    s.oneTimeIncome = lumps.slice(0, LIST_MAX).map((x) => ({
      amount: num(x.amount, 0, 0),
      age: num(x.age, 65, 0, 120),
      flat: x.flat === true,
    }));
    s.extraExpenses = rows(raw?.extraExpenses)
      .slice(0, LIST_MAX)
      .map((x) => ({
        amount: num(x.amount, 0, 0),
        startAge: num(x.startAge, 65, 0, 120),
        endAge: num(x.endAge, 75, 0, 120),
        ...growthOf(x, false, defaults.inflation),
      }));
    // Spending changes: legacy saves held five fixed slots with an `enabled`
    // flag and a single `age` (active from then on, forever, inflating with
    // general inflation) — carry those over as open-ended changes.
    s.spendingTiers = rows(raw?.spendingTiers)
      .filter((x) => x.enabled === undefined || x.enabled === true)
      .slice(0, LIST_MAX)
      .map((x) => ({
        amount: num(x.amount, 0, 0),
        startAge: num(x.startAge ?? x.age, 65, 0, 120),
        endAge: num(x.endAge, 120, 0, 120),
        ...growthOf(x, false, defaults.inflation),
      }));
    s.lumpExpenses = rows(raw?.lumpExpenses)
      .slice(0, LIST_MAX)
      .map((x) => ({
        amount: num(x.amount, 0, 0),
        age: num(x.age, 65, 0, 120),
        repeatEvery: Math.round(num(x.repeatEvery, 0, 0, 50)),
        untilAge: num(x.untilAge, 85, 0, 120),
        flat: x.flat === true,
        ...growthOf(x, false, defaults.inflation),
      }));
    // Children (dependents): birth year (a past or future year; a planned child counts from the
    // year of birth) and whether the child is a full-time student after 18. The year bounds are
    // fixed, not relative to the clock, so a saved birth year never shifts when it is reloaded
    // years later. A row without a usable year is dropped. An optional join year (E2: an adopted child)
    // is kept only when it is a year later than the birth year; otherwise the key is left off (from
    // birth), so a legacy row keeps its exact shape.
    s.children = rows(raw?.children)
      .filter(
        (x) =>
          (typeof x.birthYear === 'number' || (typeof x.birthYear === 'string' && x.birthYear.trim() !== '')) &&
          Number.isFinite(Number(x.birthYear)),
      )
      .slice(0, LIST_MAX)
      .map((x) => {
        const birthYear = Math.round(num(x.birthYear, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MAX)),
          row = { birthYear, student: x.student === true },
          j = x.joinYear;
        if ((typeof j === 'number' || (typeof j === 'string' && j.trim() !== '')) && Number.isFinite(Number(j))) {
          const joinYear = Math.round(num(j, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MAX));
          if (joinYear > birthYear) row.joinYear = joinYear;
        }
        return row;
      });
    // The old Bridge / part-time income section was folded into additional
    // income streams: carry a saved plan's bridge income over as streams
    // (Partner B's age window converted to Partner A's age), starting no
    // earlier than that partner's retirement, as the old section did.
    if (raw && raw.bridgeEnabled === true) {
      const offsetB = (Number(s.ageA) || 0) - (Number(s.ageB) || 0),
        migrated = [];
      [
        ['A', 0],
        ['B', offsetB],
      ].forEach(([p, off]) => {
        if (p === 'B' && raw.singlePerson) return;
        const amount = Number(raw['bridgeIncome' + p]) || 0,
          start = Math.max(Number(raw['bridgeStartAge' + p]) || 0, Number(s['retireAge' + p]) || 0) + off,
          end = (Number(raw['bridgeEndAge' + p]) || 0) + off;
        if (amount > 0 && start <= end) migrated.push({ amount, startAge: num(start, 65, 0, 120), endAge: num(end, 75, 0, 120), followGrowth: true, growth: defaults.incomeGrowth });
      });
      s.incomeSources = s.incomeSources.concat(migrated).slice(0, LIST_MAX);
    }
    ['bridgeEnabled', 'bridgeIncomeA', 'bridgeStartAgeA', 'bridgeEndAgeA', 'bridgeIncomeB', 'bridgeStartAgeB', 'bridgeEndAgeB'].forEach((k) => delete s[k]);
    delete s.otherLoansEnabled;
    delete s.otherIncomeEnabled;
  }
  // @@shared:01-LIST_MAX end
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
    normalizeLists(s, raw);
    s.dismissedEstimates = Array.isArray(raw?.dismissedEstimates) ? raw.dismissedEstimates : [];
    s.dismissedUnusualAssumptions = Array.isArray(raw?.dismissedUnusualAssumptions)
      ? raw.dismissedUnusualAssumptions
      : [];
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
  // Tax-parameter indexing. Brackets, credits, the OAS clawback threshold and
  // CPP contribution limits all index by this factor. In the deterministic
  // projection it is the steady state.inflation compounded by yearIndex;
  // inside simulateHistorical() (backtest and Monte Carlo) it is the path's
  // own cumulative CPI, so a 1970s-style inflation sequence raises the
  // brackets along with spending instead of leaving them on a 2.5% schedule.
  // @@shared:06-histTaxFactors begin
  // The plan's own factor for a whole year index, remembered while state.inflation is the value it was computed
  // for (Math.pow was a visible share of a projection: every tax call asks for it). The key is the full input
  // (inflation, year index), so nothing is ever cleared and the value is the very double the pow returns.
  let taxFactorInflation = NaN;
  function taxIndexFactor(yearIndex) {
    if (histTaxFactors) {
      const f = histTaxFactors[Math.floor(yearIndex)];
      if (f !== undefined) return f;
    }
    if (yearIndex >= 0 && yearIndex < 256 && yearIndex === Math.floor(yearIndex)) {
      if (state.inflation !== taxFactorInflation) {
        taxFactorInflation = state.inflation;
        taxFactorByYear.length = 0;
      }
      let v = taxFactorByYear[yearIndex];
      if (v === undefined) v = taxFactorByYear[yearIndex] = Math.pow(1 + pct(state.inflation), yearIndex);
      return v;
    }
    return Math.pow(1 + pct(state.inflation), yearIndex);
  }
  // @@shared:06-histTaxFactors end

  function federalTaxCA(income, yearIndex, extraCreditBase = 0, claimMinus = -1) {
    const factor = taxIndexFactor(yearIndex);
    const phaseStart = FED_BPA_PHASE_START * factor,
      phaseEnd = FED_BPA_PHASE_END * factor,
      bpa =
        FED_BPA_MIN * factor +
        FED_BPA_ENHANCED *
          factor *
          (income <= phaseStart ? 1 : income >= phaseEnd ? 0 : (phaseEnd - income) / (phaseEnd - phaseStart));
    return Math.max(
      0,
      scaledProgressiveTax(Math.max(0, income), FED_CAPS, FED_RATES, factor) -
        FED_CREDIT_RATE * (bpa + extraCreditBase + (claimMinus >= 0 ? Math.max(0, bpa - claimMinus) : 0)),
    );
  }
  // Quebec: a person's age amount (65+) plus retirement-income amount (the lesser of the amount and
  // 1.25 times the eligible pension or RRIF income); zero outside Quebec. The living-alone amount is
  // added by the caller (single filers only).
  function quebecPoolAmount(age, pensionIncome, yearIndex) {
    const rule = currentProvince().rule,
      pool = rule.pooled;
    if (!pool) return 0;
    const g = rule.indexing.ageAmountIndexed ? taxIndexFactor(yearIndex) : 1;
    let amount = pensionIncome > 0 ? Math.min(pool.retirementAmount * g, pensionIncome * pool.retirementMultiplier) : 0;
    if (age >= 65) amount += pool.ageAmount * g;
    return amount;
  }
  // Provincial tax for one person: tax on the brackets, less each non-refundable credit
  // at the province's lowest rate (basic personal amount, with its phase-down where
  // there is one), floored at zero; then Ontario's surtax on that; then the eligible
  // dividend credit (against the provincial tax only, floored at zero; Ontario takes it
  // after the surtax, as form ON428 does); then Ontario's Health Premium, which is not
  // reduced by credits and is based on taxable income.
  function provincialTaxCA(income, yearIndex, dtcBase = 0, age = 0, pensionIncome = 0, familyIncome = null, partnerPool = 0, spouseNet = -1, depKids = 0, childKids = 0, extraCredit = 0, medical = 0, redKids = 0) {
    const c = currentProvince(),
      rule = c.rule,
      ix = rule.indexing,
      f = taxIndexFactor(yearIndex),
      ni = Math.max(0, income);
    const base = scaledProgressiveTax(ni, c.caps, c.rates, ix.bracketsIndexed ? f : 1);
    let bpa = rule.bpa.amount * (ix.bpaIndexed ? f : 1);
    const phase = rule.bpa.phase;
    if (phase) {
      const fp = ix.bpaIndexed ? f : 1,
        start = phase.start * fp,
        end = phase.end * fp,
        floor = phase.floor * fp;
      bpa = floor + (bpa - floor) * (ni <= start ? 1 : ni >= end ? 0 : (end - ni) / (end - start));
    }
    // Age amount (65+): reduced by 15% of net income over the threshold, plus a supplement
    // that is not reduced; pension amount: the first dollars of eligible pension income.
    let credits = bpa + extraCredit;
    if (medical > 0 && rule.medical) {
      const m = rule.medical,
        three = 0.03 * (m.familyIncome ? (familyIncome === null ? ni : familyIncome) : ni),
        floor = m.threshold === null ? three : Math.min(three, m.threshold * (ix.bpaIndexed ? f : 1));
      if (medical > floor) credits += medical - floor;
    }
    if (age >= 65 && rule.age) {
      const a = rule.age,
        fa = ix.ageAmountIndexed ? f : 1;
      credits += Math.max(0, a.amount * fa - a.rate * Math.max(0, ni - a.threshold * fa)) + a.supplement * fa;
    }
    if (pensionIncome > 0 && rule.pension) credits += Math.min(rule.pension.amount * (ix.pensionAmountIndexed ? f : 1), pensionIncome);
    // Spouse or eligible-dependant amount (CRA TD1 forms, 2026): the amount, with the spouse's (or dependant's) net income
    // free up to a threshold, so the credit amount is clamp(amount + threshold - net income, 0, amount); the amounts index
    // like the basic personal amount. depKids > 0 is a single claimant's eligible dependant (a child under 18 with no
    // income). Saskatchewan also has a child amount for each child under 18 other than the one claimed as the dependant.
    if (spouseNet >= 0 || depKids > 0 || childKids > 0) {
      const fb = ix.bpaIndexed ? f : 1,
        sp = rule.spouse,
        ch = rule.childAmount;
      if (sp && (spouseNet >= 0 || depKids > 0))
        credits += Math.min(sp.amount * fb, Math.max(0, (sp.amount + sp.threshold) * fb - (spouseNet > 0 ? spouseNet : 0)));
      if (ch) credits += ((depKids > 0 ? depKids - 1 : 0) + childKids) * ch.amount * fb;
    }
    // Quebec: age, retirement-income and living-alone amounts are one pool, reduced as a whole by
    // 18.75% of family income over the threshold (form TP-1015.3-V, Work Chart 2). For a couple the
    // two spouses' amounts are added and reduced ONCE; each spouse takes a share of what is left in
    // proportion to their own amounts (`partnerPool` is the other spouse's amount, `familyIncome`
    // both spouses' net income). `familyIncome` null means a single filer: own income, living alone.
    const pool = rule.pooled;
    if (pool) {
      const g = ix.ageAmountIndexed ? f : 1;
      let own = quebecPoolAmount(age, pensionIncome, yearIndex);
      if (familyIncome === null) own += pool.livingAlone * g;
      const total = own + partnerPool;
      if (total > 0) {
        const reduction = pool.reductionRate * Math.max(0, (familyIncome === null ? ni : familyIncome) - pool.reductionThreshold * g);
        credits += Math.max(0, total - reduction) * (own / total);
      }
    }
    let tax = Math.max(0, base - rule.creditRate * credits);
    if (rule.surtax) {
      const s = rule.surtax,
        sf = ix.surtaxIndexed ? f : 1;
      tax += Math.max(0, tax - s.first * sf) * s.firstRate + Math.max(0, tax - s.second * sf) * s.secondRate;
    }
    if (dtcBase > 0) tax = Math.max(0, tax - dtcBase * rule.dividend.eligible);
    // Low-income tax reduction (after the dividend credit, before Ontario's health premium).
    const li = rule.lowIncomeReduction;
    if (li) {
      const fb = ix.bpaIndexed ? f : 1;
      if (li.kind === 'perReturn') {
        const r = li.multiplier * (li.basic + li.child * redKids) * fb - tax;
        if (r > 0) tax = Math.max(0, tax - r);
      } else if (li.kind === 'income') {
        const r = li.basic * fb - li.rate * Math.max(0, ni - li.base * fb);
        if (r > 0) tax = Math.max(0, tax - r);
      }
      const ac = li.ageTaxCredit;
      if (ac && age >= ac.age && ni < ac.incomeBelow * fb) tax = Math.max(0, tax - ac.amount * fb);
    }
    PROV_TAX.pre = tax;
    if (rule.healthPremium) tax += ontarioHealthPremium(ni, f);
    PROV_TAX.last = tax;
    return tax;
  }
  function oasClawback(netIncomeInclOas, oasReceived, yearIndex) {
    if (oasReceived <= 0) return 0;
    const factor = taxIndexFactor(yearIndex),
      threshold = OAS_RECOVERY_THRESHOLD * factor;
    return Math.min(oasReceived, Math.max(0, (netIncomeInclOas - threshold) * 0.15));
  }
  function ageAndPensionCreditBase(netIncome, age, pensionIncome, yearIndex) {
    let base = Math.min(PENSION_INCOME_AMOUNT, Math.max(0, pensionIncome));
    if (age >= 65) {
      const factor = taxIndexFactor(yearIndex);
      base += Math.max(
        0,
        AGE_AMOUNT * factor - AGE_AMOUNT_REDUCTION * Math.max(0, netIncome - AGE_AMOUNT_THRESHOLD * factor),
      );
    }
    return base;
  }
  function personTaxCA(ordinaryIncome, gains, yearIndex, dtcBase = 0, age = 0, pensionIncome = 0, familyIncome = null, partnerPool = 0, oas = 0, spouseNet = -1, depKids = 0, childKids = 0, fedCredit = 0, provCredit = 0, provDeduction = 0, medical = 0, redKids = 0) {
    let taxableIncome = Math.max(0, ordinaryIncome + Math.max(0, gains) * 0.5),
      recovery = 0;
    if (oas > 0) {
      // oasClawback, inlined (hot path): 15% over the indexed threshold, up to the OAS received.
      const over = taxableIncome - OAS_RECOVERY_THRESHOLD * taxIndexFactor(yearIndex);
      if (over > 0) {
        recovery = over * 0.15 < oas ? over * 0.15 : oas;
        taxableIncome -= recovery;
      }
    }
    if (oas > 0) OAS_RECOVERY.last = recovery;
    let fedTax = federalTaxCA(
      taxableIncome,
      yearIndex,
      (age >= 65 || pensionIncome > 0 ? ageAndPensionCreditBase(taxableIncome, age, pensionIncome, yearIndex) : 0) +
        fedCredit +
        (medical > 0 ? Math.max(0, medical - Math.min(0.03 * taxableIncome, FED_MEDICAL_THRESHOLD * taxIndexFactor(yearIndex))) : 0),
      spouseNet >= 0 ? spouseNet : depKids > 0 ? 0 : -1,
    );
    if (dtcBase > 0) fedTax = Math.max(0, fedTax - dtcBase * FEDERAL_ELIGIBLE_DTC);
    if (state.province === 'qc') fedTax *= 0.835;
    const provTax = provincialTaxCA(provDeduction > 0 ? taxableIncome - provDeduction : taxableIncome, yearIndex, dtcBase, age, pensionIncome, familyIncome, partnerPool, spouseNet, depKids, childKids, provCredit, medical, redKids) + recovery;
    PROV_TAX.fed = fedTax; // with PROV_TAX.pre: a zero means the return had no tax left for a credit (the medical claim chooser)
    return fedTax + provTax;
  }
  function incomeTaxCA(profile, gains = 0, traditionalExtra = 0) {
    // Eligible pension income for the credit: the profile's pension (and RRIF
    // income at 65+, after any split) plus, from RRIF_PENSION_AGE, the discretionary
    // RRSP/RRIF draw, which counts as RRIF income. A profile built without
    // ages or pension fields (the Roth-style literals) reads as under 65, none.
    const ageA = profile.ageA || 0,
      ageB = profile.ageB || 0,
      penA = profile.penA || 0,
      penB = profile.penB || 0;
    const oasA = profile.oasA || 0,
      oasB = profile.oasB || 0;
    // Children under 18 (the eligible-dependant and child amounts); none on the common path.
    const deps = profile.dependents,
      kids = deps && deps.length ? countKids(deps, 0, 17) : 0,
      kids18 = kids > 0 ? countKids(deps, 0, 18) : deps && deps.length ? countKids(deps, 0, 18) : 0;
    const li = currentProvince().rule.lowIncomeReduction;
    // The household's eligible medical expenses (health premium and long-term care), claimed on one return.
    let med = profile.medical || 0;
    // Quebec health contributions (7N N7): the Health Services Fund on each return's non-employment income (OAS excluded, dividends at the
    // amount received) and the drug premium of every retired adult, which is also a medical expense.
    const hc = currentProvince().rule.healthContributions;
    let health = 0;
    OAS_RECOVERY.a = OAS_RECOVERY.b = 0;
    if (profile.singlePerson) {
      if (hc) {
        const netQ = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5),
          nonEmp = Math.max(0, netQ - (profile.earnedA || 0) - oasA - (profile.dtcA || 0) * 0.2753623);
        health = quebecHsf(nonEmp, profile.year, hc.hsf);
        if (!(profile.earnedA > 0)) {
          const ramq = quebecRamq(netQ, false, kids, profile.year, hc.ramq);
          health += ramq;
          med += ramq;
        }
      }
      const single = personTaxCA(
        profile.otherA + traditionalExtra,
        gains,
        profile.year,
        profile.dtcA,
        ageA,
        ageA >= RRIF_PENSION_AGE ? penA + traditionalExtra : penA,
        null,
        0,
        oasA,
        -1,
        kids,
        0,
        profile.fedCreditA || 0,
        profile.provCreditA || 0,
        profile.provDedA || 0,
        med,
        kids18,
      );
      const pSingle = PROV_TAX.last;
      if (oasA > 0) OAS_RECOVERY.a = OAS_RECOVERY.last;
      if (li && li.kind === 'family') {
        const netS = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5);
        return single - lowIncomeFamilyReduction(li, ageA, 0, false, kids, kids18, netS, 0, pSingle, profile.year, currentProvince().rule.indexing.bpaIndexed);
      }
      if (med > 0 && state.province === 'on') {
        const net = Math.max(0, profile.otherA + traditionalExtra + gains * 0.5);
        return single - careAtHomeCredit(med, net, net, profile.year, ageA, 0);
      }
      return single + health;
    }
    const gainA = gains / 2,
      gainB = gains / 2,
      tradA = traditionalExtra / 2,
      tradB = traditionalExtra / 2;
    // Family net income (Quebec's reductions): both spouses' income with the 50% gains inclusion.
    const netA = Math.max(0, profile.otherA + tradA + gainA * 0.5),
      netB = Math.max(0, profile.otherB + tradB + gainB * 0.5),
      family = netA + netB;
    // One spouse amount a household: the higher-income partner claims for the other (A on a tie); the children go
    // to the lower-income parent (A on a tie), as the Saskatchewan child amount requires.
    const spouseA = netA >= netB ? netB : -1,
      spouseB = netB > netA ? netA : -1,
      kidsA = netA <= netB ? kids : 0,
      kidsB = netB < netA ? kids : 0;
    const pensionA = ageA >= RRIF_PENSION_AGE ? penA + tradA : penA,
      pensionB = ageB >= RRIF_PENSION_AGE ? penB + tradB : penB;
    if (hc) {
      const nonEmpA = Math.max(0, netA - (profile.earnedA || 0) - oasA - (profile.dtcA || 0) * 0.2753623),
        nonEmpB = Math.max(0, netB - (profile.earnedB || 0) - oasB - (profile.dtcB || 0) * 0.2753623);
      health = quebecHsf(nonEmpA, profile.year, hc.hsf) + quebecHsf(nonEmpB, profile.year, hc.hsf);
      const ramq = quebecRamq(family, true, kids, profile.year, hc.ramq);
      if (!(profile.earnedA > 0)) {
        health += ramq;
        med += ramq;
      }
      if (!(profile.earnedB > 0)) {
        health += ramq;
        med += ramq;
      }
    }
    // The medical claim goes to the lower-income partner (the preferred return), but a return with no tax left to absorb it wastes the
    // credit (a 65+ partner owes nothing up to about 27,700 federally), so with expenses both claimants are priced and the cheaper kept.
    const medPrefB = med > 0 && medicalClaimToB(netA, netB, profile.year);
    // Ontario with a 70+ spouse: the claimant also sets the Seniors Care at Home credit, so both claimants are priced on tax less that credit.
    const careSwap = med > 0 && state.province === 'on' && (ageA >= 70 || ageB >= 70); // 70: the row's careAtHome.age
    let medToB = medPrefB,
      taxA = 0,
      taxB = 0,
      pA = 0,
      pB = 0,
      bestCost = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const toB = attempt === 0 ? medPrefB : !medPrefB;
      const tA = personTaxCA(profile.otherA + tradA, gainA, profile.year, profile.dtcA, ageA, pensionA, family, quebecPoolAmount(ageB, pensionB, profile.year), oasA, spouseA, 0, kidsA, profile.fedCreditA || 0, profile.provCreditA || 0, profile.provDedA || 0, toB ? 0 : med, netA >= netB ? kids18 : 0);
      const qA = PROV_TAX.last,
        fedA = PROV_TAX.fed,
        preA = PROV_TAX.pre;
      if (oasA > 0) OAS_RECOVERY.a = OAS_RECOVERY.last;
      const tB = personTaxCA(profile.otherB + tradB, gainB, profile.year, profile.dtcB, ageB, pensionB, family, quebecPoolAmount(ageA, pensionA, profile.year), oasB, spouseB, 0, kidsB, profile.fedCreditB || 0, profile.provCreditB || 0, profile.provDedB || 0, toB ? med : 0, netB > netA ? kids18 : 0);
      const qB = PROV_TAX.last,
        fedB = PROV_TAX.fed,
        preB = PROV_TAX.pre;
      if (oasB > 0) OAS_RECOVERY.b = OAS_RECOVERY.last;
      const cost = careSwap ? tA + tB - careAtHomeCredit(med, toB ? netB : netA, family, profile.year, ageA, ageB) : tA + tB;
      if (attempt === 0 || cost < bestCost) {
        taxA = tA;
        taxB = tB;
        pA = qA;
        pB = qB;
        medToB = toB;
        bestCost = cost;
      }
      // the other return can only do better if this one had no tax left for the credit and the other has some to reduce
      if (attempt === 0 && !(med > 0 && (careSwap || (toB ? (fedB === 0 && fedA > 0) || (preB === 0 && preA > 0) : (fedA === 0 && fedB > 0) || (preA === 0 && preB > 0))))) break;
    }
    let reduction = 0;
    if (li && li.kind === 'family') reduction = lowIncomeFamilyReduction(li, ageA, ageB, true, kids, kids18, netA, netB, pA + pB, profile.year, currentProvince().rule.indexing.bpaIndexed);
    if (med > 0 && state.province === 'on') return taxA + taxB - careAtHomeCredit(med, medToB ? netB : netA, family, profile.year, ageA, ageB);
    return taxA + taxB - reduction + health;
  }
  // Canada taxFor is the household's net cost of income: income tax minus the income-tested benefits it
  // triggers. The shared withdrawal solvers (drawTaxable and the Canada solvers) price a withdrawal as the change
  // in taxFor, so with this definition they see lost GIS and the other benefits as a cost of withdrawing. The
  // benefits are tax-free cash, so net cash is the same as a separate inflow; the engine reports gross tax and
  // each benefit separately (see runProjection).
  function taxFor(profile, gains = 0, traditionalExtra = 0) {
    return incomeTaxCA(profile, gains, traditionalExtra) - benefitsFor(profile, gains, traditionalExtra);
  }
  function benefitsFor(profile, gains, traditionalExtra) {
    BEN.gis = BEN.allowance = BEN.ccb = BEN.cgeb = BEN.provChild = BEN.provSenior = BEN.provCredit = BEN.total = 0;
    const couple = !profile.singlePerson,
      f = taxIndexFactor(profile.year),
      trad = traditionalExtra || 0,
      g = gains || 0;
    // Family net income: each return's income plus half the extra RRSP draw and a quarter of the gains (50 percent
    // inclusion, split evenly), as taxFor does for Quebec's family income.
    const incA = Math.max(0, profile.otherA + (couple ? trad / 2 + g / 4 : trad + g * 0.5)),
      incB = couple ? Math.max(0, profile.otherB + trad / 2 + g / 4) : 0,
      fam = incA + incB;
    // Hot path: with no children, a family income above 125,000 (indexed) receives nothing from any program here (the
    // largest cutoff is the Ontario credit for a senior couple, nil at about 118,000; tests/benefits.js pins the boundary).
    // Manitoba (homeowners and renters credits) and Prince Edward Island (the Island Essentials Benefit) pay at any income, so they never take the exit.
    if (fam > 125000 * f && !(profile.dependents && profile.dependents.length) && !BEN_NO_EXIT[state.province]) return 0;
    const oasA = profile.oasA || 0,
      oasB = couple ? profile.oasB || 0 : 0,
      ageA = profile.ageA || 0,
      ageB = couple ? profile.ageB || 0 : 0;
    // GIS and the Allowances. A pensioner is 65 or older and receiving OAS this year.
    const pA = ageA >= 65 && oasA > 0,
      pB = couple && ageB >= 65 && oasB > 0;
    if (pA || pB || (!couple && profile.survivor && ageA >= 60 && ageA < 65)) {
      const exemption = gisEmploymentExemption(profile.earnedA || 0) + (couple ? gisEmploymentExemption(profile.earnedB || 0) : 0),
        gisInc = Math.max(0, fam - oasA - oasB - exemption);
      if (!couple) {
        if (pA) BEN.gis = gisAnnual('single', gisInc, f);
        else BEN.allowance = gisAnnual('survivorAllowance', gisInc, f);
      } else if (pA && pB) {
        BEN.gis = 2 * gisAnnual('spouseOas', gisInc, f);
      } else {
        const otherAge = pA ? ageB : ageA;
        // Table 4 (a spouse aged 60 to 64 on the Allowance) ends where that spouse's Allowance reaches 0; the pensioner
        // then continues on table 3 (a spouse who does not receive OAS or the Allowance), so the GIS is continuous.
        const alw = otherAge >= 60 && otherAge < 65 ? gisAnnual('coupleAllowance', gisInc, f) : 0;
        if (alw > 0) {
          BEN.gis = gisAnnual('couplePensioner', gisInc, f);
          BEN.allowance = alw;
        } else BEN.gis = gisAnnual('spouseNoOas', gisInc, f);
      }
    }
    // Canada Groceries and Essentials Benefit (ITA 122.5(3.005)): amounts and cutoffs scale with f from 2027.
    const kids = profile.dependents || NO_DEPENDENTS;
    {
      const R = BENEFIT_RULES.cgeb;
      let n = 0;
      for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.childMaxAge) n++;
      let a = R.adult * f;
      if (couple) a += (R.spouse + R.child * n) * f;
      else if (n > 0) a += (R.eligibleDependant + R.child * (n - 1) + R.singleParentExtra) * f;
      else a += Math.min(R.singleSupplement.max * f, Math.max(0, R.singleSupplement.rate * (fam - R.singleSupplement.from * f)));
      BEN.cgeb = Math.max(0, a - R.reduction.rate * Math.max(0, fam - R.reduction.from * f));
    }
    // Canada Child Benefit: per child by age band, reduced by the number of children on family net income.
    if (kids.length) {
      const R = BENEFIT_RULES.ccb;
      let n = 0,
        sum = 0;
      for (let i = 0; i < kids.length; i++) {
        const age = kids[i].age;
        if (age > R.amounts[1].maxAge) continue;
        n++;
        sum += (age <= R.amounts[0].maxAge ? R.amounts[0].amount : R.amounts[1].amount) * f;
      }
      if (n > 0) {
        const idx = Math.min(n, 4) - 1,
          RR = R.reduction,
          from1 = RR.from1 * f,
          from2 = RR.from2 * f;
        const red = fam <= from1 ? 0 : fam <= from2 ? RR.rate1[idx] * (fam - from1) : RR.base2[idx] * f + RR.rate2[idx] * (fam - from2);
        BEN.ccb = Math.max(0, sum - red);
      }
    }
    // Provincial paid benefits. The province row set is small and fixed, so dispatch is a switch on the code.
    switch (state.province) {
      case 'on': {
        // Ontario Sales Tax Credit: like the CGEB, per adult and child under 19, reduced over a threshold.
        const R = BENEFIT_RULES.ostc;
        let n = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.childMaxAge) n++;
        const people = (couple ? 2 : 1) + n,
          from = (couple || n > 0 ? R.reduction.from : R.reduction.fromSingle) * f;
        BEN.provCredit = Math.max(0, R.adult * f * people - R.reduction.rate * Math.max(0, fam - from));
        // Ontario Child Benefit: per child under 18, family total reduced over a threshold.
        const O = BENEFIT_RULES.ocb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= O.maxAge) m++;
        if (m > 0) BEN.provChild = Math.max(0, O.amountPerChild * f * m - O.reduction.rate * Math.max(0, fam - O.reduction.from * f));
        // Ontario senior homeowners property tax grant, then the Energy and Property Tax Credit (which reads it).
        // Occupancy cost is 20 percent of rent plus property tax (CRA 2026 calculation sheets, step 1).
        {
          const H = BENEFIT_RULES.oshptg,
            E = BENEFIT_RULES.oeptc,
            ptPaid = profile.propertyTaxPaid || 0,
            occ = E.rentRate * (profile.rentPaid || 0) + ptPaid,
            senior = ageA >= E.seniorAge || (couple && ageB >= E.seniorAge);
          let grant = 0;
          if (senior && ptPaid > 0 && fam < (couple ? H.coupleTo : H.singleTo)) grant = Math.max(0, H.max - H.rate * Math.max(0, fam - (couple ? H.coupleFrom : H.singleFrom)));
          if (occ > 0) {
            let childUnder18 = false;
            for (let i = 0; i < kids.length; i++) if (kids[i].age <= 17) childUnder18 = true;
            const P = senior ? E.senior : E.nonSenior,
              from = (couple ? P.fromCouple : childUnder18 ? P.fromSingleParent : P.fromSingle) * f,
              energy = Math.min(P.energyCap * f, occ),
              propertyTax = Math.min(Math.min(E.propertyTaxRate * occ, P.propertyTaxCap * f) + P.propertyTaxAdd * f, occ);
            let credit = Math.max(0, energy + propertyTax - E.reductionRate * Math.max(0, fam - from));
            // Step 5: with a grant, the credit plus the grant cannot exceed the energy component plus the occupancy cost.
            if (grant > 0) credit = Math.max(0, credit - Math.max(0, Math.max(0, grant + credit - energy) - occ));
            BEN.provCredit += credit;
          }
          BEN.provSenior += grant;
        }
        break;
      }
      case 'bc': {
        // BC Family Benefit: per child by order, a floor between the two thresholds, a second reduction above.
        const R = BENEFIT_RULES.bcfb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          let max = 0,
            floor = 0;
          for (let i = 0; i < m; i++) {
            max += R.amounts[Math.min(i, 2)];
            floor += R.floors[Math.min(i, 2)];
          }
          if (!couple) max += R.singleParentFirstChild;
          max *= f;
          floor *= f;
          const t1 = R.reduction.from1 * f,
            t2 = R.reduction.from2 * f;
          let v = max - R.reduction.rate * Math.max(0, fam - t1);
          if (fam <= t2) v = Math.max(v, floor);
          else v = Math.max(0, floor - R.reduction.rate * (fam - t2));
          BEN.provChild = Math.max(0, v);
        }
        break;
      }
      case 'ab': {
        // Alberta Child and Family Benefit: base reduced by child count over a threshold, plus a working component.
        const R = BENEFIT_RULES.acfb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const idx = Math.min(m, 4) - 1,
            earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0);
          const base = Math.max(0, R.baseMax[idx] * f - R.baseRate[idx] * Math.max(0, fam - R.baseFrom * f));
          const phaseIn = Math.min(R.workingMax[idx] * f, R.workingPhaseInRate * Math.max(0, earned - R.workingPhaseInFrom * f));
          const working = Math.max(0, phaseIn - R.workingRate[idx] * Math.max(0, fam - R.workingFrom * f));
          BEN.provChild = base + working;
        }
        // Alberta Seniors Benefit: needs a partner (or the person) receiving OAS; income is net income less OAS,
        // GIS and up to 3,600 of employment income; a couple is one benefit on combined income.
        const S = BENEFIT_RULES.absb;
        if (pA || pB) {
          const used = Math.max(0, fam - oasA - oasB - Math.min(S.employmentDeduction * f, (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0)));
          const row = couple ? S.couple : S.single;
          BEN.provSenior = Math.max(0, row.max * f - row.rate * used);
        }
        break;
      }
      case 'qc': {
        // Quebec Family Allowance: per child (plus a single-parent supplement once), linear between the reduction
        // threshold and the income where the minimum is reached.
        const R = BENEFIT_RULES.qcfa;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const from = (couple ? R.from.twoParent : R.from.oneParent) * f,
            to = R.to * f,
            share = fam <= from ? 0 : fam >= to ? 1 : (fam - from) / (to - from); // 0 = maximum, 1 = minimum
          let v = m * (R.perChild.max - (R.perChild.max - R.perChild.min) * share);
          if (!couple) v += R.singleParentSupplement.max - (R.singleParentSupplement.max - R.singleParentSupplement.min) * share;
          BEN.provChild = v * f;
        }
        // Quebec Solidarity Tax Credit (QST and housing components), Finance Quebec Table 4.
        {
          const S = BENEFIT_RULES.qcsol,
            W = BENEFIT_RULES.qcwp;
          let m = 0;
          for (let i = 0; i < kids.length; i++) if (kids[i].age <= S.childMaxAge) m++;
          const amount = (S.qst.basic + (couple ? S.qst.spouse + S.housing.couple : S.qst.livingAlone + S.housing.singleOrParent) + S.housing.child * m) * f;
          BEN.provCredit += Math.max(0, amount - S.reductionRate * Math.max(0, fam - S.reductionFrom * f));
          // Work premium: needs work income above the exclusion; maximum reached at the threshold, then reduced by family income.
          const earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0),
            exclusion = (couple ? W.exclusion.couple : W.exclusion.single) * f;
          if (earned > exclusion) {
            const sit = couple ? (m > 0 ? W.situations.coupleKids : W.situations.coupleNoKids) : m > 0 ? W.situations.singleParent : W.situations.alone,
              threshold = sit.threshold * f,
              premium = sit.rate * (Math.min(earned, threshold) - exclusion) - W.reductionRate * Math.max(0, fam - threshold);
            if (premium > 0) BEN.provCredit += premium;
          }
        }
        break;
      }
      case 'nb': {
        // Residential Property Tax Allowance: a stepped rebate by household income, never more than the property tax paid.
        const R = BENEFIT_RULES.nbpta,
          pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          let a = 0;
          for (let i = 0; i < R.tiers.length; i++)
            if (fam < R.tiers[i][0]) {
              a = R.tiers[i][1];
              break;
            }
          BEN.provCredit += Math.min(a, pt);
        }
        {
          // Child Tax Benefit, Working Income Supplement and School Supplement (gnb.ca, CRA New Brunswick page).
          const K = BENEFIT_RULES.nbctb,
            n = countKids(kids, 0, K.maxAge);
          if (n > 0) {
            BEN.provChild += Math.max(0, K.perChild * n - (n === 1 ? K.rateOne : K.rateMore) * Math.max(0, fam - K.from));
            const W = BENEFIT_RULES.nbwis,
              earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0);
            BEN.provChild += Math.max(0, Math.min(W.max, W.earnedRate * Math.max(0, earned - W.earnedFrom)) - W.incomeRate * Math.max(0, fam - W.incomeFrom));
            const Z = BENEFIT_RULES.nbss;
            if (fam <= Z.incomeMax) BEN.provChild += Z.perChild * countKids(kids, Z.minAge, Z.maxAge);
          }
          const H = BENEFIT_RULES.nbhst;
          BEN.provCredit += familyCreditCA(H, f, fam, couple, countKids(kids, 0, H.childMaxAge));
          if (BEN.gis + BEN.allowance > 0) BEN.provSenior += BENEFIT_RULES.nblisb.amount;
        }
        break;
      }
      case 'ns': {
        // Property Tax Rebate for Seniors: half of the property tax (15 to 800) for a household that receives GIS or an Allowance.
        const R = BENEFIT_RULES.nsptr,
          pt = profile.propertyTaxPaid || 0;
        if (pt > 0 && BEN.gis + BEN.allowance > 0) BEN.provSenior += Math.max(R.min, Math.min(R.max, R.share * pt));
        {
          // Child Benefit (the first child in full, later children half in the partial band) and Affordable Living Tax Credit.
          const C = BENEFIT_RULES.nsncb,
            n = countKids(kids, 0, C.maxAge);
          if (n > 0 && fam < C.zeroFrom) BEN.provChild += C.perChild * (fam < C.halfFrom ? n : 1 + (n - 1) * 0.5);
          const A = BENEFIT_RULES.nsaltc;
          BEN.provCredit += familyCreditCA(A, f, fam, couple, countKids(kids, 0, A.childMaxAge));
        }
        break;
      }
      case 'mb': {
        // Homeowners Affordability Tax Credit (school-tax proxy: the property tax) and the Seniors School Tax Rebate.
        const pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          const H = BENEFIT_RULES.mbhatc,
            S = BENEFIT_RULES.mbsstr;
          const credit = Math.min(H.max * f, pt);
          BEN.provCredit += credit;
          // The rebate is based on school taxes less the credit received: with the whole property tax as the proxy it is limited to what is left.
          if (ageA >= S.seniorAge || (couple && ageB >= S.seniorAge)) BEN.provSenior += Math.min(pt - credit, Math.max(0, S.max - S.rate * Math.max(0, fam - S.from)));
        }
        if ((profile.rentPaid || 0) > 0) {
          // Renters Affordability Tax Credit (Form MB479 lines 29 to 40): one credit per household, plus the seniors top-up
          // reduced by family income, never more than the rent paid.
          const T = BENEFIT_RULES.mbratc;
          let c = T.max * f;
          if (ageA >= T.seniorAge || (couple && ageB >= T.seniorAge)) c += Math.max(0, T.topUp * f - T.topUpRate * fam);
          BEN.provCredit += Math.min(profile.rentPaid, c);
        }
        {
          // Child Benefit: a straight line from the full amount to nil, steeper for up to three children.
          const M = BENEFIT_RULES.mbmcb,
            n = countKids(kids, 0, M.maxAge);
          if (n > 0 && fam < M.zero[n > M.zero.length ? M.zero.length - 1 : n - 1]) {
            const zero = M.zero[n > M.zero.length ? M.zero.length - 1 : n - 1];
            BEN.provChild += fam <= M.fullTo ? M.perChild * n : M.perChild * n * (1 - (fam - M.fullTo) / (zero - M.fullTo));
          }
          // 55 PLUS junior component (Regulation 64/90): each eligible person aged 55 to 64 gets the table amount at family income.
          const J = BENEFIT_RULES.mb55j,
            eA = ageA >= J.minAge && ageA <= J.maxAge,
            eB = couple && ageB >= J.minAge && ageB <= J.maxAge;
          // Regulation 64/90 s. 2(3)(a): not paid to a person eligible for OAS Act benefits, and the Allowance is one (the only
          // 55 to 64 candidate in a household that receives it is the Allowance recipient).
          if ((eA || eB) && BEN.allowance === 0) {
            const T = couple ? J.couple : J.single;
            let v = 0;
            if (fam <= T.from) v = T.max;
            else {
              const k = Math.max(1, Math.ceil((fam - T.from) / T.width - 1e-9));
              if (k <= T.values.length) v = T.values[k - 1];
            }
            BEN.provSenior += v * ((eA ? 1 : 0) + (eB ? 1 : 0));
          }
          // 55 PLUS senior component (Regulation 65/90): a pensioner (OAS recipient) gets the quarterly table amount for the household
          // type at income excluding OAS; a survivor 60 to 64 on the Allowance for the Survivor gets the survivor table.
          const Q = BENEFIT_RULES.mb55s;
          if (pA || pB) {
            const used = Math.max(0, fam - oasA - oasB);
            let T = Q.single,
              people = 1;
            if (couple) {
              if (pA && pB) {
                T = Q.bothPensioners;
                people = 2;
              } else {
                const otherAge = pA ? ageB : ageA;
                T = BEN.allowance > 0 && otherAge >= 60 && otherAge < 65 ? Q.spouseAllowance : Q.spouseNeither;
              }
            }
            BEN.provSenior += people * 4 * bandValue(T, used);
          } else if (!couple && profile.survivor && BEN.allowance > 0) BEN.provSenior += 4 * bandValue(Q.survivorAllowance, Math.max(0, fam));
        }
        break;
      }
      case 'sk': {
        // Low-Income Tax Credit and the Saskatchewan Income Plan (needs GIS; a straight line from the maximum to the nil point).
        const L = BENEFIT_RULES.sklitc;
        BEN.provCredit += familyCreditCA(L, f, fam, couple, countKids(kids, 0, L.childMaxAge));
        if (BEN.gis > 0 && (pA || pB)) {
          const S = BENEFIT_RULES.sksip,
            used = Math.max(0, fam - oasA - oasB);
          let row = S.single;
          if (couple) {
            if (pA && pB) row = S.couple;
            else {
              const otherAge = pA ? ageB : ageA;
              row = BEN.allowance > 0 && otherAge >= 60 && otherAge < 65 ? S.spouseAllowance : S.spouseUnder60;
            }
          }
          BEN.provSenior += Math.max(0, row.max * f * (1 - Math.max(0, used - row.flatTo * f) / ((row.zero - row.flatTo) * f)));
        }
        break;
      }
      case 'nl': {
        // Child Benefit (a straight line to nil), Income Supplement (basic, phase-in, spouse, children, phase-out) and Seniors Benefit.
        const C = BENEFIT_RULES.nlcb,
          I = BENEFIT_RULES.nlis,
          S = BENEFIT_RULES.nlsb,
          n = countKids(kids, 0, C.maxAge);
        if (n > 0 && fam < C.zero * f) {
          let total = 0;
          for (let i = 0; i < n; i++) total += (i < 3 ? C.monthly[i] : C.monthlyLater) * 12;
          total *= f;
          BEN.provChild += fam <= C.from * f ? total : Math.max(0, total * (1 - (fam - C.from * f) / ((C.zero - C.from) * f)));
          // Nutrition supplement: flat 150 a month for each child under five while the family is eligible for the Child Benefit.
          BEN.provChild += C.nutrition.monthly * 12 * countKids(kids, 0, C.nutrition.maxAge);
        }
        const k = countKids(kids, 0, I.childMaxAge),
          a = I.basic * f + Math.min(I.phaseInAdd * f, I.phaseInRate * Math.max(0, fam - I.phaseInFrom * f)) + (couple ? I.spouse * f : 0) + I.child * f * k;
        BEN.provCredit += Math.max(0, a - I.reduction.rate * Math.max(0, fam - I.reduction.from * f));
        if (ageA >= S.minAge || (couple && ageB >= S.minAge)) BEN.provSenior += Math.max(0, S.max * f - S.rate * Math.max(0, fam - S.from * f));
        break;
      }
      case 'pe': {
        // Child Benefit (two income steps) and the Island Essentials Benefit (flat, prorated down to a minimum, never nil).
        const C = BENEFIT_RULES.peicb,
          E = BENEFIT_RULES.peieb,
          n = countKids(kids, 0, C.maxAge);
        if (n > 0) {
          if (fam < C.lowTo) BEN.provChild += C.monthlyLow * 12 * n;
          else if (fam <= C.midTo) BEN.provChild += C.monthlyMid * 12 * n;
        }
        const big = couple || n > 0,
          max = big ? E.couple : E.single,
          zero = big ? E.coupleZero : E.singleZero;
        BEN.provCredit += fam <= E.fullTo ? max : fam >= zero ? E.min : max - ((max - E.min) * (fam - E.fullTo)) / (zero - E.fullTo);
        break;
      }
    }
    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;
    return BEN.total;
  }
  // How much more income (extra traditional draw) the household can take before GIS and the Allowances end:
  // the hook the Canada mixed-withdrawal batch (4A) reads for its income room. Zero when no GIS situation applies.
  // Not hot: bisection over benefitsFor (benefits never rise with income, so the bisection is valid, cliffs included).
  function gisIncomeRoom(profile, gains, traditionalExtra) {
    const f = taxIndexFactor(profile.year);
    benefitsFor(profile, gains, traditionalExtra);
    if (BEN.gis + BEN.allowance <= 0) return 0;
    let lo = 0,
      hi = 200000 * f;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      benefitsFor(profile, gains, (traditionalExtra || 0) + mid);
      if (BEN.gis + BEN.allowance > 0) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  // @@shared:drawTaxable begin
  function drawTaxable(pool, basis, need, profile, priorGains = 0, priorTraditionalExtra = 0) {
    if (pool <= 0 || need <= 0) return { taken: 0, net: 0, gain: 0, basisTaken: 0 };
    const gainRatio = clamp(1 - basis / pool, 0, 1),
      basisRatio = 1 - gainRatio;
    let lo = need,
      hi = need * 3 + 1;
    // The tax with nothing drawn is the same for every probe, so it is computed once.
    const baseTax = taxFor(profile, priorGains, priorTraditionalExtra);
    const incrementalTax = (gross) => taxFor(profile, priorGains + gross * gainRatio, priorTraditionalExtra) - baseTax;
    // A benefit that stops in a step can leave the net at the top of the bracket below the need, and the bisection would then
    // return the top with a short net. Widen only in that case, so every other draw is unchanged.
    for (let w = 0; w < 12 && hi < pool && hi - incrementalTax(hi) < need; w++) {
      lo = hi;
      hi = Math.min(pool, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - incrementalTax(mid);
      if (net < need) lo = mid;
      else hi = mid;
    }
    const taken = Math.min(pool, hi),
      net = taken - incrementalTax(taken);
    return { taken, net, gain: taken * gainRatio, basisTaken: taken * basisRatio };
  }
  // @@shared:drawTaxable end
  function solveMeltdown(otherIncome, maxAvailable, yearIndex) {
    if (maxAvailable <= 0) return 0;
    const factor = taxIndexFactor(yearIndex);
    // Brackets apply to income itself (credits come off the tax), so the top of
    // the chosen bracket is the income to fill up to.
    const targetGross = federalBracketCeilingCA(state.meltdownBracket) * factor;
    if (otherIncome >= targetGross) return 0;
    return Math.min(maxAvailable, targetGross - otherIncome);
  }
  // Pension income splitting — up to 50% of one spouse's eligible pension
  // income (RRIF/RRSP annuity from age 65, employer pension at any age; CPP,
  // OAS, and RRSP lump-sum withdrawals are not eligible) may be reallocated
  // to the other spouse's return. Solved by ternary search since combined
  // tax is convex in the amount transferred between two progressive-tax
  // filers.
  function solvePensionSplit(otherA, otherB, eligibleA, eligibleB, yearIndex, ageA = 0, ageB = 0, oasA = 0, oasB = 0, kids = 0, pay = null) {
    const maxAtoB = 0.5 * eligibleA,
      maxBtoA = 0.5 * eligibleB;
    let lo = -maxBtoA,
      hi = maxAtoB;
    if (lo >= hi) return 0;
    // The transferred amount counts as pension income for the receiver, so the
    // pension credit and the age-amount clawback both move with it.
    const family = Math.max(0, otherA) + Math.max(0, otherB); // unchanged by the transfer
    // Same claims as incomeTaxCA: the higher-income partner claims the spouse amount, the lower-income parent the children.
    const combinedTax = (x) => {
      const nA = otherA - x,
        nB = otherB + x,
        withMed = pay && pay.med > 0,
        prefB = withMed && medicalClaimToB(nA, nB, yearIndex);
      const a1 = personTaxCA(nA, 0, yearIndex, 0, ageA, eligibleA - x, family, quebecPoolAmount(ageB, eligibleB + x, yearIndex), oasA, nA >= nB ? Math.max(0, nB) : -1, 0, nA <= nB ? kids : 0, pay ? pay.fedA : 0, pay ? pay.provA : 0, pay ? pay.dedA : 0, withMed && !prefB ? pay.med : 0, pay && nA >= nB ? pay.rk : 0),
        fedA = PROV_TAX.fed,
        preA = PROV_TAX.pre,
        b1 = personTaxCA(nB, 0, yearIndex, 0, ageB, eligibleB + x, family, quebecPoolAmount(ageA, eligibleA - x, yearIndex), oasB, nB > nA ? Math.max(0, nA) : -1, 0, nB < nA ? kids : 0, pay ? pay.fedB : 0, pay ? pay.provB : 0, pay ? pay.dedB : 0, withMed && prefB ? pay.med : 0, pay && nB > nA ? pay.rk : 0),
        fedB = PROV_TAX.fed,
        preB = PROV_TAX.pre,
        t1 = a1 + b1;
      // a claimant with no tax left wastes the credit: price the other return too and keep the cheaper
      if (!withMed || !(prefB ? (fedB === 0 && fedA > 0) || (preB === 0 && preA > 0) : (fedA === 0 && fedB > 0) || (preA === 0 && preB > 0))) return t1;
      const t2 = (personTaxCA(nA, 0, yearIndex, 0, ageA, eligibleA - x, family, quebecPoolAmount(ageB, eligibleB + x, yearIndex), oasA, nA >= nB ? Math.max(0, nB) : -1, 0, nA <= nB ? kids : 0, pay ? pay.fedA : 0, pay ? pay.provA : 0, pay ? pay.dedA : 0, withMed && !!prefB ? pay.med : 0, pay && nA >= nB ? pay.rk : 0) + personTaxCA(nB, 0, yearIndex, 0, ageB, eligibleB + x, family, quebecPoolAmount(ageA, eligibleA - x, yearIndex), oasB, nB > nA ? Math.max(0, nA) : -1, 0, nB < nA ? kids : 0, pay ? pay.fedB : 0, pay ? pay.provB : 0, pay ? pay.dedB : 0, withMed && !prefB ? pay.med : 0, pay && nB > nA ? pay.rk : 0));
      return t2 < t1 ? t2 : t1;
    };
    // The age-amount clawback makes combined tax non-convex for a 65+ filer
    // (its slope drops back where the clawback ends), so a ternary search over
    // the whole range can settle in the wrong dip. With a 65+ partner, scan a
    // coarse grid first and run the ternary search inside the best cell. Where
    // both partners are on the same marginal rate the tax is flat over a wide
    // stretch, with a narrow dip where their incomes are equal that neither the
    // grid nor the search can see, so that transfer is also a candidate.
    const search65 = ageA >= 65 || ageB >= 65,
      loAll = lo,
      hiAll = hi;
    let iterations = 40;
    if (search65) {
      iterations = 20; // refining inside one grid cell
      const cells = 48,
        step = (hi - lo) / cells;
      let bestI = 0,
        bestTax = Infinity;
      for (let i = 0; i <= cells; i++) {
        const tax = combinedTax(lo + step * i);
        if (tax < bestTax) {
          bestTax = tax;
          bestI = i;
        }
      }
      const cellLo = lo + step * Math.max(0, bestI - 1),
        cellHi = lo + step * Math.min(cells, bestI + 1);
      lo = cellLo;
      hi = cellHi;
    }
    for (let i = 0; i < iterations; i++) {
      const m1 = lo + (hi - lo) / 3,
        m2 = hi - (hi - lo) / 3;
      if (combinedTax(m1) < combinedTax(m2)) hi = m2;
      else lo = m1;
    }
    const found = (lo + hi) / 2;
    if (!search65) return found;
    const equal = Math.min(hiAll, Math.max(loAll, (otherA - otherB) / 2));
    return combinedTax(equal) < combinedTax(found) ? equal : found;
  }
  // CPP contributions (employee side): 5.95% on earnings between the basic
  // exemption and the YMPE, plus 4% (CPP2) between the YMPE and YAMPE. Quebec
  // residents pay QPP instead (6.30% on the same band, same 4% second tier) plus
  // the QPIP premium (0.430% up to $103,000), from the province row. This is the
  // contribution alone (kept for the tests); the engine's payroll cost, the EI
  // premium and the credits and deductions they give are in payrollItems below.
  function cppContribution(wages, yearIndex) {
    const f = taxIndexFactor(yearIndex),
      ympe = 74600 * f,
      yampe = 85000 * f,
      exemption = 3500 * f;
    const payroll = currentProvince().rule.payroll,
      cpp1 = Math.max(0, Math.min(wages, ympe) - exemption) * payroll.pensionRate,
      cpp2 = Math.max(0, Math.min(wages, yampe) - ympe) * 0.04;
    return payroll.premium ? cpp1 + cpp2 + Math.min(wages, payroll.premium.max * f) * payroll.premium.rate : cpp1 + cpp2;
  }
  function medicalClaimToB(netA, netB, yearIndex) {
    const bpa = FED_BPA_MIN * taxIndexFactor(yearIndex);
    return netA <= netB ? netA < bpa : netB >= bpa;
  }
  // Ontario Seniors Care at Home Tax Credit (refundable): a household with someone 70 or older gets 25 percent of up to 6,000 of
  // the claimable medical expenses, reduced by 5 percent of family net income over 35,000 (ontario.ca, claimed on ON479).
  function careAtHomeCredit(med, netClaimant, famNet, yearIndex, ageA, ageB) {
    const rule = currentProvince().rule,
      c = rule.careAtHome;
    if (!c || !(med > 0) || !(ageA >= c.age || ageB >= c.age)) return 0;
    const fb = rule.indexing.bpaIndexed ? taxIndexFactor(yearIndex) : 1,
      claimable = med - Math.min(0.03 * netClaimant, rule.medical.threshold * fb);
    if (!(claimable > 0)) return 0;
    return Math.max(0, c.rate * Math.min(c.maxExpenses, claimable) - c.reductionRate * Math.max(0, famNet - c.startIncome));
  }
  function afterTaxEstate(sim) {
    const e = sim.estate;
    if (!e || !sim.rows.length) return 0;
    const last = sim.rows[sim.rows.length - 1],
      y = last.year,
      f = taxIndexFactor(y),
      income = last.grossIncome - 0.5 * (e.lastGains || 0), // grossIncome carries the realized gains in full; net income counts half
      own = state.singlePerson || e.survivor ? income : income / 2,
      age = Math.max(last.age, last.ageB || 0),
      gains = Math.max(0, e.taxable - e.taxableBasis),
      tax = personTaxCA(own + e.traditional, gains, y, 0, age, 0) - personTaxCA(own, 0, y, 0, age, 0),
      probate = probateFee(currentProvince().rule, (e.taxable + e.cash + e.homeEquity) / f) * f;
    return last.total - Math.max(0, tax) - probate;
  }
  function quebecHsf(income, yearIndex, h = currentProvince().rule.healthContributions.hsf) {
    const f = taxIndexFactor(yearIndex),
      t1 = h.t1 * f;
    if (!(income > t1)) return 0;
    const t2 = h.t2 * f;
    if (income <= t2) return Math.min(h.cap1, h.rate * (income - t1));
    return Math.min(h.cap2, h.cap1 + h.rate * (income - t2));
  }
  function quebecRamq(familyIncome, couple, kids, yearIndex, r = currentProvince().rule.healthContributions.ramq) {
    const g = couple ? r.couple : r.single,
      f = taxIndexFactor(yearIndex),
      u = familyIncome / f - (g.exempt + (kids > 1 ? g.childMore : kids === 1 ? g.childOne : 0));
    if (!(u > 0)) return 0;
    let cap = RAMQ_CAP.get(g);
    if (cap === undefined) {
      const k = r.max / r.max2025;
      cap = r.step + (r.max / k - g.low * r.step) / g.high; // the income used at which the table reaches the maximum
      RAMQ_CAP.set(g, cap);
    }
    if (u >= cap) return f * r.max;
    return f * Math.min(r.max, ((g.low * Math.min(u, r.step) + g.high * Math.max(0, u - r.step)) * r.max) / r.max2025);
  }
  function lowIncomeFamilyReduction(li, ageA, ageB, couple, kidsU18, kids18, netA, netB, pTotal, yearIndex, indexed) {
    const fb = indexed ? taxIndexFactor(yearIndex) : 1,
      afi = netA + netB;
    const eligibility = li.eligibility;
    if (eligibility) {
      if (couple || kidsU18 > 0 ? !(afi < eligibility.familyBelow * fb) : !(afi < eligibility.singleBelow * fb)) return 0;
    }
    const dependant = !couple && kidsU18 > 0;
    let items = li.basic + (couple ? li.spouse : dependant ? li.dependant : 0) + li.child * (dependant ? Math.max(0, kids18 - 1) : kids18);
    if (li.age > 0) items += li.age * ((ageA >= 65 ? 1 : 0) + (couple && ageB >= 65 ? 1 : 0));
    const baseIncome = li.baseWithDependants !== null && (couple || dependant) ? li.baseWithDependants : li.base,
      r = items * fb - li.rate * Math.max(0, afi - baseIncome * fb);
    return r > 0 ? (r < pTotal ? r : pTotal) : 0;
  }
  function payrollItems(wages, yearIndex) {
    PAY.cash = PAY.fedCredit = PAY.provCredit = PAY.deduction = PAY.provDeduction = 0;
    if (!(wages > 0)) return PAY;
    const f = taxIndexFactor(yearIndex),
      rule = currentProvince().rule,
      payroll = rule.payroll,
      band = Math.max(0, Math.min(wages, 74600 * f) - 3500 * f),
      base = band * (payroll.pensionRate - CPP_ENHANCED_RATE),
      enhanced = band * CPP_ENHANCED_RATE + Math.max(0, Math.min(wages, 85000 * f) - 74600 * f) * 0.04,
      ei = Math.min(wages, EI_MIE * f) * payroll.eiRate,
      qpip = payroll.premium ? Math.min(wages, payroll.premium.max * f) * payroll.premium.rate : 0,
      credit = base + ei + qpip;
    PAY.cash = base + enhanced + ei + qpip;
    PAY.deduction = enhanced;
    PAY.fedCredit = credit + Math.min(EMPLOYMENT_AMOUNT * f, wages);
    if (rule.pooled) PAY.provDeduction = Math.min(QC_WORKERS_DEDUCTION_RATE * wages, QC_WORKERS_DEDUCTION_MAX * f);
    else PAY.provCredit = credit;
    return PAY;
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





  // The tax profile handed to taxFor() for the year, and each partner's income. Canada taxes spouses as two individuals, so
  // `totalA`/`totalB` are each partner's own income (zero if deceased), and with
  // pension income splitting enabled up to half of eligible pension/RRIF income
  // moves between them to minimize combined tax (`splitA`/`splitB` after the
  // transfer). A deceased Partner A remaps the survivor into the A slot, because
  // taxFor()'s single-person branch reads only the A fields.
  function buildTaxProfile({
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




  // Employee CPP/QPP, QPIP and EI contributions on this year's wages (net of pre-tax health
  // premiums), both partners. Separate from taxFor(), which covers income tax.
  function payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, year }) {
    return (
      payrollItems(Math.max(0, wageA - healthPremiumA), year).cash +
      payrollItems(Math.max(0, wageB - healthPremiumB), year).cash
    );
  }

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
  // RRSP/RRIF withdrawals are fully taxable income. `bucket` is 'traditional' |
  // 'bondTraditional'; `solver` picks the bisection bracket.
  function takeTraditional(wd, bucket, amount, solver = solveTraditionalForNet) {
    const { bal } = wd;
    const { fromTrad, tradNet } = solver(bal[bucket], amount, wd.taxableGainGross, wd.traditionalGross, wd.profile);
    bal[bucket] -= fromTrad;
    wd.traditionalGross += fromTrad;
    wd.traditionalWithdrawn += fromTrad;
    return tradNet;
  }
  // How much RRSP to withdraw to net `targetNet` after tax, by bisection over
  // [0, min(balance, 3*target + 1)]. Used for the smooth-withdrawal RRSP share.
  function solveTraditionalForNet(traditionalBal, targetNet, taxableGainGross, traditionalGross, profile) {
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    let lo = 0,
      hi = Math.min(traditionalBal, targetNet * 3 + 1);
    // Widen the bracket only when a benefit step leaves the net at its top short of the target (see drawTaxable).
    for (let w = 0; w < 12 && hi < traditionalBal && hi - (taxFor(profile, taxableGainGross, traditionalGross + hi) - baseTax) < targetNet; w++) {
      lo = hi;
      hi = Math.min(traditionalBal, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - (taxFor(profile, taxableGainGross, traditionalGross + mid) - baseTax);
      if (net < targetNet) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      tradNet = fromTrad - (taxFor(profile, taxableGainGross, traditionalGross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
  // Same job, but bisecting from [need, 6*need + 1]. The two brackets converge to
  // slightly different values (~1e-7 relative), so both are kept until the
  // numerics are unified deliberately; the default draw, the bond-reserve draw
  // and the historical engine use this one.
  function solveTraditionalForNetFromNeed(traditionalBal, need, taxableGainGross, traditionalGross, profile) {
    if (traditionalBal <= 0 || need <= 0) return { fromTrad: 0, tradNet: 0 };
    const baseTax = taxFor(profile, taxableGainGross, traditionalGross);
    let lo = need,
      hi = need * 6 + 1;
    // Widen the bracket only when a benefit step leaves the net at its top short of the need (see drawTaxable).
    for (let w = 0; w < 12 && hi < traditionalBal && hi - (taxFor(profile, taxableGainGross, traditionalGross + hi) - baseTax) < need; w++) {
      lo = hi;
      hi = Math.min(traditionalBal, hi * 2);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - (taxFor(profile, taxableGainGross, traditionalGross + mid) - baseTax);
      if (net < need) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      tradNet = fromTrad - (taxFor(profile, taxableGainGross, traditionalGross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
  // Smooth withdrawals (the only mix mode Canada has): the year's need is split
  // between taxable and RRSP/RRIF in proportion to their balances, shared by the
  // standard cascade and the bucket strategy. Returns false when smooth is off, so
  // the caller runs its own default order. `solver` is the bisection bracket for
  // the RRSP draw (the two strategies keep their own, see
  // solveTraditionalForNetFromNeed). Written against the take*() primitives so the
  // account model can change underneath.
  function drawSmoothStockAccounts(wd, solver) {
    if (!state.smoothWithdrawals) return false;
    const { bal } = wd;
    const pool = bal.taxable + bal.traditional;
    if (pool > 0 && wd.need > 0) {
      const taxableShare = wd.need * (bal.taxable / pool),
        traditionalShare = wd.need * (bal.traditional / pool);
      wd.need -= takeTaxable(wd, 'taxable', taxableShare);
      if (traditionalShare > 0 && bal.traditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', traditionalShare, solver));
    }
    return true;
  }
  // The standard (non-bucket) withdrawal strategy, used by simulate(). First
  // the discretionary draw from taxable and RRSP/RRIF: with smooth withdrawals,
  // in proportion to balances; otherwise taxable first, then RRSP. Any
  // shortfall then falls through the TFSA, cash, the bond-reserve buckets (a
  // protected sequence-risk reserve, tapped only after everything else) and
  // finally home equity.
  function withdrawStandard(wd) {
    const { bal } = wd;
    if (!drawSmoothStockAccounts(wd, solveTraditionalForNet)) {
      wd.need -= takeTaxable(wd, 'taxable', wd.need);
      if (wd.need > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solveTraditionalForNetFromNeed));
    }
    wd.need -= takeRoth(wd, 'roth', wd.need);
    wd.need -= takeCash(wd, wd.need);
    wd.need -= takeTaxable(wd, 'bondTaxable', wd.need);
    if (wd.need > 0 && bal.bondTraditional > 0)
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
    wd.need -= takeRoth(wd, 'bondRoth', wd.need);
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
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
    },
    traditional: (wd) => {
      if (wd.bal.traditional > 0)
        wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solveTraditionalForNetFromNeed));
    },
    bondRoth: (wd) => (wd.need -= takeRoth(wd, 'bondRoth', wd.need)),
    roth: (wd) => (wd.need -= takeRoth(wd, 'roth', wd.need)),
    home: (wd) => (wd.need -= takeHomeEquity(wd, wd.need)),
    // The stock accounts as one grouped step: smooth withdrawals when enabled (the same
    // code the standard cascade uses), otherwise taxable -> RRSP/RRIF -> TFSA. Cash and
    // the bond buckets keep their own place in the order.
    stocks: (wd) => {
      if (!drawSmoothStockAccounts(wd, solveTraditionalForNetFromNeed)) {
        BUCKET_STEP.taxable(wd);
        if (wd.need > 0) BUCKET_STEP.traditional(wd);
      }
      if (wd.need > 0) BUCKET_STEP.roth(wd);
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

  // @@shared:11-makeProjectedExpense begin
  // Projected total living expense for a future year in nominal dollars at the plan's
  // assumed inflation: spending + healthcare + LTC + shelter + recurring extra expenses.
  // Sizes the pre-retirement bond ladder.
  function makeProjectedExpense({ infl, wageGrowth, schedule, futureBuy, singlePerson, retireAgeA, retireAgeB }) {
    return (year) => {
      const factor = Math.pow(1 + infl, year);
      const shelter = housingForYear(year, factor, schedule, futureBuy).housing;
      const ageA = state.ageA + year,
        ageB = state.ageB + year;
      const healthcare = singlePerson
        ? (ageA >= retireAgeA ? state.healthcare : 0) * factor * medicalGrowth(year)
        : (ageA >= retireAgeA ? state.healthcare / 2 : 0) * factor * medicalGrowth(year) +
          (ageB >= retireAgeB ? state.healthcare / 2 : 0) * factor * medicalGrowth(year);
      const ltc = state.ltcEnabled
        ? (ageA >= state.ltcAgeA ? state.ltcYearlyA : 0) * factor * medicalGrowth(year) +
          (!singlePerson && ageB >= state.ltcAgeB ? state.ltcYearlyB : 0) * factor * medicalGrowth(year)
        : 0;
      const extraRecurring = state.extraExpenses
        .filter((e) => ageA >= e.startAge && ageA <= e.endAge)
        .reduce(
          (sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, Math.pow(1 + wageGrowth, year)),
          0,
        );
      return baseSpendingNominal(ageA, year, factor, factor) + healthcare + ltc + shelter + extraRecurring;
    };
  }
  // @@shared:11-makeProjectedExpense end

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
  function runProjection({ mode, source, retireAgeA, retireAgeB }) {
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
    const currentInvestable =
      state.taxable + state.traditional + state.roth + state.cash + state.fhsa;
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
    document.getElementById('stateTaxNote').innerHTML = provinceTaxTreatmentNote();
    document.getElementById('viewCaption').textContent =
      mode === 'real'
        ? 'Values shown in inflation-adjusted 2026 dollars.'
        : 'Future nominal dollars; expenses rise with inflation each year.';
    updateChartXAxisButtons();
    renderChartView(selected);
    renderTable(selected);
    renderPlanHeadline(selected);
    renderShortfallBanner(selected);
    renderUnusualAssumptions(selected);
    if (document.getElementById('sensitivityCard').open) renderTornadoChart(selected);
    const rothOptimizerCard = document.getElementById('rothOptimizerCard');
    rothOptimizerCard.hidden = !state.meltdownEnabled;
    if (state.meltdownEnabled && rothOptimizerCard.open) {
      renderRothOptimizer(selected);
      annotateRothOptimizer();
    }
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
        label: 'post-retirement extra health/dental insurance',
        detail: 'zeroing out the post-retirement extra health/dental insurance cost',
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

  // Real-CAGR sweep: temporarily overrides the nominal investment return with
  // the nominal rate equivalent to the given real CAGR compounded on top of
  // the current inflation input, then restores it. Bond/HYSA yields and
  // retirement dates are left untouched, so this isolates sensitivity to the
  // main portfolio return assumption alone.
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
      label: 'CPP + OAS (±10%)',
      run: (endValue) => {
        const savedCppA = state.cppMonthlyA,
          savedCppB = state.cppMonthlyB,
          savedOasA = state.oasMonthlyA,
          savedOasB = state.oasMonthlyB;
        state.cppMonthlyA = savedCppA * 0.9;
        state.cppMonthlyB = savedCppB * 0.9;
        state.oasMonthlyA = savedOasA * 0.9;
        state.oasMonthlyB = savedOasB * 0.9;
        const decrease = endValue(simulate());
        state.cppMonthlyA = savedCppA * 1.1;
        state.cppMonthlyB = savedCppB * 1.1;
        state.oasMonthlyA = savedOasA * 1.1;
        state.oasMonthlyB = savedOasB * 1.1;
        const increase = endValue(simulate());
        state.cppMonthlyA = savedCppA;
        state.cppMonthlyB = savedCppB;
        state.oasMonthlyA = savedOasA;
        state.oasMonthlyB = savedOasB;
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
        const saved = state.meltdownEnabled;
        state.meltdownEnabled = false;
        const off = simulate();
        state.meltdownEnabled = true;
        const on = simulate();
        state.meltdownEnabled = saved;
        const rows = [
          { label: 'No RRSP meltdown', sim: off },
          {
            label: `RRSP meltdown (age ${state.meltdownStartAge}-${state.meltdownEndAge}, to ${state.meltdownBracket}% bracket)`,
            sim: on,
          },
        ];
        const sentence = `Running the RRSP meltdown ladder as configured ${decisionDeltaPhrase(off, on)} compared with no meltdown.`;
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
    const candidates = [...document.getElementById('meltdownBracket').options].map((o) =>
      Number(o.value),
    );
    const savedEnabled = state.meltdownEnabled,
      savedBracket = state.meltdownBracket;
    const results = candidates.map((bracket) => {
      state.meltdownEnabled = true;
      state.meltdownBracket = bracket;
      const sim = simulate();
      const end = sim.rows.at(-1);
      return {
        bracket,
        endAssets: displayValue(end.total, end.year),
        afterTaxEstate: displayValue(afterTaxEstate(sim), end.year),
        lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(r.tax + (r.oasClawback || 0) - (r.benefits || 0), r.year), 0),
        depletedAge: sim.depletedAge,
      };
    });
    state.meltdownEnabled = savedEnabled;
    state.meltdownBracket = savedBracket;
    // "Not worse" = doesn't deplete when the current plan doesn't, and doesn't
    // deplete earlier when it does — a bracket that shortens the portfolio's life
    // isn't actually an improvement. The pick is the highest after-tax estate (7N N8:
    // pre-tax end assets count an RRSP dollar like a TFSA dollar and would undervalue
    // melting down); the lifetime tax stays in the table.
    const notWorse = results.filter((r) =>
      selected.depletedAge ? !r.depletedAge || r.depletedAge >= selected.depletedAge : !r.depletedAge,
    );
    const pool = notWorse.length ? notWorse : results;
    const best = pool.reduce((a, b) => (b.afterTaxEstate > a.afterTaxEstate ? b : a));
    lastRothOptimizer = { results, best, currentBracket: savedBracket };
    return lastRothOptimizer;
  }
  // The shared renderRothOptimizer (a region both planners carry) writes the lifetime-tax summary and a four-column table; the Canada
  // page then replaces them (7N N8): the table gains the after-tax estate column and the recommendation is the highest after-tax estate.
  let lastRothOptimizer = null;
  function annotateRothOptimizer() {
    const o = lastRothOptimizer;
    if (!o) return;
    const { results, best, currentBracket } = o,
      current = results.find((r) => r.bracket === currentBracket),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows'),
      lastsLabel = (r) =>
        r.depletedAge
          ? `Age ${r.depletedAge}`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target already leaves the highest after-tax estate among the available options here.`;
    } else {
      const gain = best.afterTaxEstate - current.afterTaxEstate,
        savings = current.lifetimeTax - best.lifetimeTax;
      summaryEl.innerHTML = `Recommended: fill to the <b>${best.bracket}%</b> bracket instead of your current <b>${currentBracket}%</b> — an estimated <b>${money(gain)}</b> more after-tax estate (end assets less the tax on the RRSP/RRIF and unrealized gains at the last death, and probate fees, today's dollars)${savings >= 0 ? ` and <b>${money(savings)}</b> less lifetime tax` : ` at <b>${money(-savings)}</b> more lifetime tax`}, without shortening how long the portfolio lasts.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? ' (current)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td>${money(r.afterTaxEstate)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
      )
      .join('');
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
      const rates = baseInts.filter((n) => n !== closestInt).concat([currentReal]).sort((a, b) => a - b);
      const fmtRate = (r) => (Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`);
      subEl.textContent = `Same retirement dates and inflation input; investment growth swept across real returns for comparison, with your current ${fmtRate(currentReal)} assumption included exactly.`;
      const series = rates.map((r, i) => ({
        sim: simulateAtRealCagr(r),
        color: cagrColors[i],
        highlight: r === currentReal,
        label: `${fmtRate(r)}${r === currentReal ? ' (current)' : ''}`,
      }));
      legend.innerHTML = series
        .map(
          (s, i) =>
            `<span><i class="swatch" style="background:${s.color}"></i><span>${fmtRate(rates[i])}${rates[i] === currentReal ? ' (current)' : ''}</span></span>`,
        )
        .join('');
      noteEl.textContent = `Bond, HYSA, and mortgage rates stay at their entered values; only portfolio growth varies. ${state.inflation}% inflation applied on top of each real rate.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across a sweep of real investment returns, including your current ${fmtRate(currentReal)} assumption`,
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
        'Investments + cash + home equity, after projected spending and estimated federal + provincial income tax.';
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
      currentInvestable = state.taxable + state.traditional + state.roth + state.cash,
      fiNumber = sim.currentExpense * fiMultiple(),
      fireNumber = sim.retirementExpense * fiMultiple(),
      tenureLabels = { own: 'Own', rent: 'Rent', rentThenBuy: 'Rent, then buy' },
      provinceSelect = document.getElementById('province'),
      provinceLabel = provinceSelect?.selectedOptions[0]?.textContent || state.province,
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
      ['After-tax estate (est.)', money(displayValue(afterTaxEstate(sim), end.year))],
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
      ['Province', provinceLabel],
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
          `<tr><td>${r.age}${state.singlePerson ? '' : ` / ${r.ageB}`}</td><td>${money(displayValue(r.grossIncome, r.year))}</td><td>${money(displayValue(r.expenses, r.year))}</td><td>${money(displayValue(r.tax, r.year))}</td><td>${money(displayValue(r.benefits || 0, r.year))}</td><td>${money(displayValue(r.taxable, r.year))}</td><td>${money(displayValue(r.bonds, r.year))}</td><td>${money(displayValue(r.traditional, r.year))}</td><td>${money(displayValue(r.roth, r.year))}</td><td>${money(displayValue(r.cash, r.year))}</td><td>${money(displayValue(r.homeEquity, r.year))}</td><td>${money(displayValue(r.total, r.year))}</td></tr>`,
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
      <table class="pr-proj"><thead><tr><th>Age${state.singlePerson ? '' : ' (A / B)'}</th><th>Income</th><th>Expenses</th><th>Taxes</th><th>Benefits</th><th>Taxable</th><th>Bonds</th><th>RRSP</th><th>TFSA</th><th>Cash</th><th>Home equity</th><th>Net assets</th></tr></thead><tbody>${projRows}</tbody></table>
      <p class="pr-disclaimer">"Income" is an estimate of taxable income (wages after retirement contributions, CPP, OAS, pension, RRIF withdrawals, and any RRSP meltdown) and excludes brokerage capital gains, which are taxed separately on withdrawal. "Expenses" is household spending plus healthcare, long-term care, housing, and any other loan payments; "Taxes" is estimated federal/provincial income tax plus CPP contributions. This tool was built with AI assistance (Claude) and may contain mistakes; verify all figures independently before making financial decisions. Federal/provincial tax parameters, RRSP/TFSA/FHSA limits, CPP/OAS amounts, and RRIF minimum withdrawal factors are 2026 planning estimates and held constant in real terms. "Benefits" are the income-tested payments (GIS, Allowance, child benefits, groceries benefit and provincial benefits) estimated on the same year's income.</p>
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
    note: 'Children in your household, including planned ones.',
    tip: "Feeds the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child benefits and family credits (Ontario, BC, Alberta, Quebec, Saskatchewan, Manitoba, Nova Scotia, New Brunswick, Newfoundland and Labrador and PEI). Spending is NOT adjusted automatically: add what children cost under household spending, additional expenses or spending changes.",
    fresh: () => ({ birthYear: new Date().getFullYear(), student: false }),
    fields: [
      {
        key: 'birthYear',
        kind: 'num',
        label: 'Birth year',
        short: 'A future year counts from birth',
        tip: 'The calendar year the child was (or will be) born.',
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
        tip: 'For a child who joins the household after birth, such as an adopted child: the year the child moves in. The child counts for that whole year and every year after, for the Canada Child Benefit, the Canada Groceries and Essentials Benefit, the provincial benefits and the dependant amounts. The benefits really start the month after the child moves in, so the join year\'s benefits are overstated. Age still comes from the birth year. Leave blank for a child who has lived with you since birth. Adoption expense credits are not modeled.',
        min: CHILD_BIRTH_YEAR_MIN,
        max: CHILD_BIRTH_YEAR_MAX,
        step: 1,
      },
      {
        key: 'student',
        kind: 'check',
        label: 'Full-time student after 18',
        short: 'For credits that extend past 18',
        tip: 'Recorded for the credits that arrive in a later update. It has no effect on the projection today.',
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
    document
      .querySelectorAll('[data-partner-b]')
      .forEach((el) => (el.hidden = !!state.singlePerson));
    document.getElementById('ageAHead').textContent = state.singlePerson ? 'Age' : 'Partner A age';
    document.getElementById('ageBHead').hidden = !!state.singlePerson;
    document.getElementById('ltcLabelSuffix').textContent = state.singlePerson ? '' : ' (couple)';
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
    document.getElementById('wizardAgeA').value = state.ageA;
    document.getElementById('wizardAgeB').value = state.ageB;
    document.getElementById('wizardIncomeA').value = state.incomeA;
    document.getElementById('wizardIncomeB').value = state.incomeB;
    document.getElementById('wizardRetireAgeA').value = state.retireAgeA;
    document.getElementById('wizardRetireAgeB').value = state.retireAgeB;
    document.getElementById('wizardTaxable').value = state.taxable;
    document.getElementById('wizardTraditional').value = state.traditional;
    document.getElementById('wizardRoth').value = state.roth;
    document.getElementById('wizardCash').value = state.cash;
    document.getElementById('wizardSpending').value = state.spending;
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
      ['pensionNoneBtn', 'none', 'pensionCoverage'],
      ['pensionABtn', 'a', 'pensionCoverage'],
      ['pensionBBtn', 'b', 'pensionCoverage'],
      ['pensionBothBtn', 'both', 'pensionCoverage'],
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
  document.getElementById('realBtn').addEventListener('click', () => setMode('real'));
  document.getElementById('nominalBtn').addEventListener('click', () => setMode('nominal'));
  document.getElementById('chartView3Btn').addEventListener('click', () => setChartView('3yr'));
  document.getElementById('chartView1Btn').addEventListener('click', () => setChartView('1yr'));
  document.getElementById('chartViewCagrBtn').addEventListener('click', () => setChartView('cagr'));
  document.getElementById('chartGroupProjectionBtn').addEventListener('click', () => setChartView(lastProjectionView));
  document.getElementById('chartGroupHistBtn').addEventListener('click', () => setChartView('hist'));
  document.getElementById('chartGroupMcBtn').addEventListener('click', () => setChartView('mc'));
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
    ['wizardMeltdownEnabled', 'meltdownEnabled'],
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
  window.__test_getState = () => state;
  window.__test_children = { dependentsInYear, qualifyingChildCount };
  window.__test_FIELDS = FIELDS;
  window.__test_tax = { displayValue, solveTraditionalForNet, solveTraditionalForNetFromNeed, taxFor, solvePensionSplit, federalTaxCA, provincialTaxCA, personTaxCA, oasClawback, ontarioHealthPremium, PROVINCE_RULES, BENEFIT_RULES, interpKnots, gisAnnual, gisEmploymentExemption, oasAgeFactor, cppAndOasIncome, incomeTax: incomeTaxCA, benefitsFor, getBenefits, gisIncomeRoom, housingForYear, drawTaxable, cppContribution, quebecPoolAmount, taxIndexFactor, payrollItems: (w, y) => ({ ...payrollItems(w, y) }), homeBuyerAmounts, medicalClaimToB, quebecHsf, quebecRamq, probateFee, afterTaxEstate, computeRothOptimizer };
})();
