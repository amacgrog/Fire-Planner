import { state } from '../../shared/core/store.js';

  // Always-visible summary of whatever's currently applied — shown whether
  // or not the card is expanded/has just been run, so a schedule applied in
  // an earlier session isn't silently invisible the next time this page
  // loads (it's otherwise undiscoverable: it doesn't show up as a checked
  // box anywhere, only as a change in the numbers).
  export function renderMultiLeverAppliedStatus() {
    const el = document.getElementById('multiLeverAppliedStatus');
    const rothAges = state.appliedRothSchedule ? Object.keys(state.appliedRothSchedule) : [],
      mixAges = state.appliedMixSchedule ? Object.keys(state.appliedMixSchedule) : [];
    if (!rothAges.length && !mixAges.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const parts = [];
    if (rothAges.length)
      parts.push(
        `a per-year Roth conversion schedule (ages ${Math.min(...rothAges)}–${Math.max(...rothAges)}) <button type="button" class="link-btn" data-clear-applied="roth">clear</button>`,
      );
    if (mixAges.length)
      parts.push(
        `a per-year withdrawal mix (ages ${Math.min(...mixAges)}–${Math.max(...mixAges)}) <button type="button" class="link-btn" data-clear-applied="mix">clear</button>`,
      );
    el.hidden = false;
    el.innerHTML = `<div class="callout method" style="padding:10px 12px">Applied from the optimizer below: ${parts.join(' and ')}.</div>`;
  }
