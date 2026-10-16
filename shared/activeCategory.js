  // Category rail: filters .category-fields down to a single category's
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
