// Measures the topbar, keyboard inset and plan status bar for layout

  // `#reviewNav` (the floating "Next →" pill) is `position:fixed;bottom:...`,
  // anchored to the bottom of the *layout* viewport. When the on-screen
  // keyboard opens for a focused text field, mobile browsers typically leave
  // the layout viewport's height alone and only shrink the *visual*
  // viewport -- so a plain fixed-bottom element ends up positioned behind
  // the keyboard, off the bottom of what's actually visible, which is
  // exactly the reported symptom ("covered up by the number pad ... can't
  // click it when editing a text field"). The fix is the standard one for
  // this class of bug: track `window.visualViewport` (widely supported on
  // mobile browsers) and feed the gap between the layout and visual
  // viewports into a CSS var the fixed element's `bottom` already reads, so
  // it rides up above the keyboard instead of staying pinned under it.
  export function syncKeyboardInset() {
    const vv = window.visualViewport;
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', inset + 'px');
  }
  // The sidebar (`.panel`) is position:sticky with a max-height so it scrolls
  // internally rather than growing past the viewport — but its max-height
  // used to be sized only against the sticky `top` offset it settles into
  // *once scrolled*, not its natural (pre-scroll) position in the page flow,
  // which sits further down (below the topbar, the Plan Status Bar, and the
  // first-run banner when shown). Since that natural position is always
  // lower than the eventual sticky one, sizing against the sticky offset
  // alone left the sidebar's rendered box taller than the space actually
  // available before any scrolling — its bottom edge sat below the fold,
  // so seeing it required scrolling the whole page (not just the sidebar's
  // own internal scroll). Measuring the leading elements directly (rather
  // than `.panel`'s own getBoundingClientRect(), which reports its already-
  // pinned position once sticky has engaged, not its natural one) keeps
  // this correct regardless of current scroll position.
  export function syncPanelMaxHeight() {
    const panel = document.querySelector('.panel');
    if (!panel || window.innerWidth <= 820) return; // mobile: .panel is position:static, no max-height to size
    const disclaimer = document.querySelector('.top-disclaimer'),
      topbar = document.querySelector('.topbar'),
      bar = document.getElementById('planStatusBar'),
      banner = document.getElementById('firstRunBanner'),
      mainEl = document.querySelector('main'),
      heightOf = (el) =>
        el && !el.hidden ? el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0) : 0,
      mainPad = mainEl ? parseFloat(getComputedStyle(mainEl).paddingTop) || 0 : 0,
      naturalTop = heightOf(disclaimer) + heightOf(topbar) + mainPad + heightOf(bar) + heightOf(banner),
      maxH = Math.max(240, window.innerHeight - naturalTop - 22);
    document.documentElement.style.setProperty('--panel-max-h', maxH + 'px');
  }
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
  export function syncTopbarHeight() {
    const tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  }
