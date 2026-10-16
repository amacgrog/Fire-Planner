  wireInputGestures();
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
