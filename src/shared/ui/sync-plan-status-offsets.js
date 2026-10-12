  // both stick to the top of the viewport as the page scrolls, and the
  // sidebar's own sticky panel-title has to clear both of them too once
  // they're stuck. `--plan-status-h` is just the status bar's own height
  // (used by the tab switcher's sticky `top`); `--mobile-sticky-h` is the
  // status bar plus the tab switcher's stuck offset and height combined
  // (used by panel-title and the scroll-margin on cards a decision-question
  // button scrolls to) — see the mobile media query above. Both are
  // measured rather than guessed, so a future copy/font change that alters
  // either bar's real height doesn't silently reopen the overlap.
  export function syncPlanStatusOffsets() {
    const bar = document.getElementById('planStatusBar'),
      tabs = document.querySelector('.mobile-tabs'),
      panelTitle = document.querySelector('.panel-title'),
      searchWrap = document.querySelector('.field-search-wrap');
    if (!bar) return;
    const barH = bar.offsetHeight;
    document.documentElement.style.setProperty('--plan-status-h', barH + 'px');
    const tabsH = tabs && window.innerWidth <= 820 ? tabs.offsetHeight : 0;
    // No "+10" gap term here: .mobile-tabs sticks flush against the status
    // bar's own bottom edge (top:var(--plan-status-h,0px)) rather than 10px
    // below it. An earlier version left a real 10px offset between the two
    // sticky bars, which is uncovered viewport space, not padding — once
    // scrolled, whatever sidebar content happened to be at that exact
    // vertical band (a group heading, a field) rendered visibly through the
    // gap. The equivalent breathing room now lives inside the status bar's
    // own opaque box (extra bottom padding, see .plan-status-bar), so it's
    // baked into `barH` already and needs no separate addition here.
    document.documentElement.style.setProperty(
      '--mobile-sticky-h',
      barH + (tabsH ? tabsH : 0) + 'px',
    );
    // .field-search-wrap sticks directly below .panel-title on mobile (both
    // position:sticky, stacked), so it needs panel-title's real height on
    // top of --mobile-sticky-h to stick at the right offset instead of
    // overlapping whatever's in normal flow just below it.
    if (panelTitle) {
      document.documentElement.style.setProperty('--panel-title-h', panelTitle.offsetHeight + 'px');
    }
    // .category-rail (unlike .field-search-wrap, it isn't itself sticky —
    // see setActiveCategory() below) needs the search bar's own height on
    // top of --mobile-sticky-h for its scroll-margin-top, so a tapped
    // category pill scrolls it to land just below the sticky status
    // bar/tabs/search stack instead of partly underneath it.
    if (searchWrap && window.innerWidth <= 820) {
      document.documentElement.style.setProperty('--field-search-h', searchWrap.offsetHeight + 'px');
    }
  }
