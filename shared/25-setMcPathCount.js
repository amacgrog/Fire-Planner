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
    mcPathCount = n;
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
    logScale = e.target.checked;
    render();
  });
  // Best-effort only: real browser Fullscreen (which also hides the
  // mobile address bar) plus a landscape orientation lock, attempted
  // together since Chrome/Android requires the page to already be in
  // Fullscreen before it will grant an orientation lock at all. Neither
  // API is required for the expand feature to work — the CSS overlay
  // above is the actual mechanism, functional with or without this —
  // this only reaches for the nicer outcome where the browser supports
  // it (mainly Android Chrome) and silently does nothing everywhere else
  // (notably iOS Safari, which supports neither API for a plain <div>).
  async function tryEnterLandscapeFullscreen() {
    try {
      const el = document.getElementById('mainChartCard');
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (err) {
      // Unsupported or denied (e.g. iOS Safari, or a desktop browser with
      // no orientation to lock) — the CSS overlay already covers the
      // viewport regardless, so there's nothing to recover from here.
    }
  }
  function tryExitLandscapeFullscreen() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (err) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  function setChartExpanded(next) {
    chartExpanded = next;
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
    chartToolbarCollapsed = next;
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
