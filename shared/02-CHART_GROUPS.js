  // Which top-level chart "view" a given chartView value belongs to — the
  // primary Projection/Historical/Monte Carlo toggle (item 9) groups the
  // three projection sub-views (3yr/1yr/cagr) under one button, and
  // lastProjectionView remembers which sub-view to restore when clicking
  // back into "Projection" from Historical/Monte Carlo.
  const CHART_GROUPS = { '3yr': 'projection', '1yr': 'projection', cagr: 'projection', hist: 'hist', mc: 'mc' };
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
