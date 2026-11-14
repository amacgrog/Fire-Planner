// The plan status bar: paints the text it is given and wires it

import { setMobileView } from '../layout/mobile-view.js';
import { syncPanelMaxHeight, syncPlanStatusOffsets } from '../layout/layout-metrics.js';

  let planStatusLastText = null,
    planStatusUpdatedTimer = null;
  // Shows the text (built by plan-verdict.js from the verdict) and pulses "Updated just now" when it changed.
  export function paintPlanStatusBar(text) {
    const textEl = document.getElementById('planStatusText');
    if (textEl) textEl.textContent = text;
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
  export function wirePlanStatusBar() {
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
  }
