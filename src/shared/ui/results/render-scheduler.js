// Field-input rendering: the light render after a short pause, the deferred panels on release or after an idle pause

import { chartView } from '../../core/chart-prefs.js';
import { render } from '#country/ui/seam-render';
import { renderDeferred } from '#country/ui/seam-renderDeferred';
import { searchPending } from '#country/core/seam-searchPending';

  // A field `input` event (a slider step, a keystroke) runs the light render once the field has been still for
  // SLIDER_MS (a range slider) or TYPING_MS (a typed box), so a drag or a typed 120000 draws once, not per step or digit:
  // the tiles, the status bar, the projection chart and the table. The expensive panels (the historical and Monte Carlo
  // chart views, the open analysis cards) keep their last picture, dimmed, until the field's `change` event (slider
  // released, text field committed), which also draws a pending light render, or IDLE_MS without input. Every other
  // caller uses the full, synchronous render(), which cancels both pending passes.
  // The US cliff plan's bracket search also waits for that pass (searchPending()), so the timer is set for it even with no
  // stale panel, and the rows can change once in the deferred pass.
  const SLIDER_MS = 150,
    TYPING_MS = 400,
    IDLE_MS = 250,
    PAINT_GAP_MS = 50;
  let lightTimer = null,
    lightDelay = 0,
    deferredTimer = null,
    staleEls = [];
  // `el`: the field that fired, which picks the pause (a slider's is shorter: it should follow the drag).
  export function scheduleRender(el) {
    lightDelay = el && el.type === 'range' ? SLIDER_MS : TYPING_MS;
    clearTimeout(lightTimer);
    clearTimeout(deferredTimer);
    deferredTimer = null;
    lightTimer = setTimeout(flushLight, lightDelay);
  }
  function flushLight() {
    clearTimeout(lightTimer);
    lightTimer = null;
    render({ light: true });
    // IDLE_MS is counted from the last input, part of which the light pause already waited; PAINT_GAP_MS at least, so the
    // light render's picture reaches the screen before the deferred pass takes the thread.
    const wait = Math.max(PAINT_GAP_MS, IDLE_MS - lightDelay);
    deferredTimer = staleEls.length || searchPending() ? setTimeout(flushDeferred, wait) : null;
  }
  // Runs a pending light render now and arms the deferred pass after it, as its own timer would (a test hook).
  export function flushLightRender() {
    if (lightTimer !== null) flushLight();
  }
  // Runs the pending passes now (a field's `change` event, printing, the test hook); nothing when none is pending.
  export function flushRender() {
    if (lightTimer !== null) flushLight();
    if (deferredTimer !== null) flushDeferred();
  }
  function flushDeferred() {
    cancelDeferredRender();
    try {
      renderDeferred();
    } finally {
      clearStale();
    }
  }
  // Called by the full render(), which draws everything a pending pass would.
  export function cancelDeferredRender() {
    clearTimeout(lightTimer);
    lightTimer = null;
    clearTimeout(deferredTimer);
    deferredTimer = null;
  }
  // The panels the light render skips: the historical and Monte Carlo chart views, and these cards while open. Keep the
  // list in step with renderOpenCards() in each country's results/render.js, which draws them.
  const DEFERRED_CARDS = ['sensitivityCard', 'rothOptimizerCard', 'sankeyCard', 'decisionCard', 'marketScenarioCard'];
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
