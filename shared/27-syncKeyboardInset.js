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
