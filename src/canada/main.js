import { SCENARIO_SCHEMA_VERSION } from '../shared/ui/storage.js';
import { state, mode, scenarios, compareIds, assignState, assignMode, assignScenarios } from '../shared/core/store.js';
import { logScale, chartExpanded, chartToolbarCollapsed, lastProjectionView, assignChartShiftMode, assignChartGapPartner, assignChartXAxisMode, assignLogScale, assignChartExpanded, assignChartToolbarCollapsed, assignMcPathCount } from '../shared/core/chart-prefs.js';
import { LIST_MAX } from '../shared/core/lists-and-children.js';
import { defaults } from './core/defaults.js';
import { escapeHtml } from '../shared/core/basics.js';
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
import { FIELDS } from './core/fields.js';
import { cloneState } from '../shared/core/scenario-helpers.js';
import { DYN } from './core/dyn.js';
import { normalizeState } from './core/normalize-state.js';
import { simulate } from '../shared/core/monte-carlo-paths-2.js';
import { activeCategory, setActiveCategory, wireCategoryRail } from '../shared/ui/category-rail.js';
import { hideUndoToast, snapshotForUndo, undoSnapshot } from '../shared/ui/undo.js';
import { dynApplyVisibility, renderDynList } from '../shared/ui/dynamic-lists.js';
import { addChildrenList } from './ui/dynamic-lists.js';
import { wireWizardCheckboxes } from './ui/wizard.js';
import { wireInfoBubble } from '../shared/ui/info-bubble.js';
import { wireInputGestures } from '../shared/ui/input-gestures.js';
import { installSharedTestHooks } from '../shared/ui/install-test-hooks.js';
import { loadSidebarPreference, wireSidebarCollapse } from '../shared/ui/sidebar.js';
import { wireTableFocus } from '../shared/ui/table-focus.js';
import { wireWizard, wireWizardDismiss } from '../shared/ui/wizard.js';
import { syncContributionControls } from '../shared/ui/sync-contribution-controls.js';
import { syncControls } from './ui/sync-controls.js';
import { dismissFirstRunBanner, hadSavedState, loadSavedState, wireFirstRunBanner } from '../shared/ui/saved-plan.js';
import { renderScenarioComparison } from '../shared/ui/scenario-comparison.js';
import { initChartHover } from '../shared/ui/chart-hover.js';
import { installTestHooks } from './ui/install-test-hooks.js';
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
  // Tax-parameter indexing. Brackets, credits, the OAS clawback threshold and
  // CPP contribution limits all index by this factor. In the deterministic
  // projection it is the steady state.inflation compounded by yearIndex;
  // inside simulateHistorical() (backtest and Monte Carlo) it is the path's
  // own cumulative CPI, so a 1970s-style inflation sequence raises the
  // brackets along with spending instead of leaving them on a 2.5% schedule.

















  // ---- end withdrawal building blocks ----


  // ---- end per-year helpers ----




  // "What's driving this" shortfall analysis: when the selected projection
  // shows a depletion age, first tests "structural" single-lever changes tied
  // to a specific input (LTC off, healthcare premiums off) by temporarily
  // mutating state and re-running simulate(), then restoring state exactly —
  // same mutate/simulate/restore pattern as simulateAtRealCagr(). These









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
  installTestHooks();
})();
