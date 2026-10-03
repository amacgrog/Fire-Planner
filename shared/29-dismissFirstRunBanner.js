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

  // Wide result tables scroll horizontally inside `.table-wrap` on
  // narrower screens; a scrollable region needs to be reachable by
  // keyboard (WCAG 2.1.1), so every one gets tabindex="0" plus a label,
  // whether it's in the initial markup or built later by a render
  // function (scenario comparison, projection table, sensitivity, Roth
  // optimizer, etc.) — the observer catches those without having to
  // touch each render function individually.
  function makeTableWrapsFocusable(root) {
    (root || document).querySelectorAll('.table-wrap').forEach((el) => {
      if (el.hasAttribute('tabindex')) return;
      el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
      if (!el.hasAttribute('aria-label')) {
        const caption = el.querySelector('th')?.textContent?.trim();
        el.setAttribute('aria-label', caption ? `${caption} table, scrollable` : 'Scrollable table');
      }
    });
  }
  makeTableWrapsFocusable();
  new MutationObserver(() => makeTableWrapsFocusable()).observe(document.body, {
    childList: true,
    subtree: true,
  });

  const mc = document.modelContext;
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
