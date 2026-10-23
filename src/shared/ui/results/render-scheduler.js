// Field-input rendering: the light render now, the deferred panels on release or after an idle pause

import { chartView } from '../../core/chart-prefs.js';
import { render } from '#country/ui/seam-render';
import { renderDeferred } from '#country/ui/seam-renderDeferred';

  // A field `input` event (a slider step, a keystroke) runs the light render at once: the tiles, the status bar, the
  // projection chart and the table. The expensive panels (the historical and Monte Carlo chart views, the open analysis
  // cards) keep their last picture, dimmed, until the field's `change` event (slider released, text field committed)
  // or IDLE_MS without input. Every other caller uses the full, synchronous render(), which cancels a pending pass.
  const IDLE_MS = 250;
  let deferredTimer = null,
    staleEls = [];
  export function scheduleRender() {
    render({ light: true });
    clearTimeout(deferredTimer);
    deferredTimer = staleEls.length ? setTimeout(flushDeferred, IDLE_MS) : null;
  }
  // Runs a pending deferred pass now (a field's `change` event, the test hook); nothing when none is pending.
  export function flushRender() {
    if (deferredTimer !== null) flushDeferred();
  }
  function flushDeferred() {
    cancelDeferredRender();
    renderDeferred();
  }
  // Called by the full render(), which draws the deferred panels itself.
  export function cancelDeferredRender() {
    clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  // The panels the light render skips: the historical and Monte Carlo chart views, and these cards while open.
  const DEFERRED_CARDS = ['sensitivityCard', 'rothOptimizerCard', 'sankeyCard', 'decisionCard'];
  export const isDeferredChartView = () => chartView === 'hist' || chartView === 'mc';
  export function markDeferredStale() {
    if (isDeferredChartView()) {
      markStale(document.getElementById('chart').closest('.chart-wrap'));
      markStale(document.getElementById(chartView === 'hist' ? 'histSuccessCard' : 'mcSuccessCard'));
    }
    DEFERRED_CARDS.forEach((id) => {
      const card = document.getElementById(id);
      if (card && card.open && !card.hidden) markStale(card);
    });
  }
  function markStale(el) {
    if (!el || staleEls.includes(el)) return;
    el.classList.add('stale');
    el.setAttribute('aria-busy', 'true');
    staleEls.push(el);
  }
  export function clearStale() {
    staleEls.forEach((el) => {
      el.classList.remove('stale');
      el.removeAttribute('aria-busy');
    });
    staleEls = [];
  }
