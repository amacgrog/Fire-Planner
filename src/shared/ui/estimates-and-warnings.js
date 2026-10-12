import { UNUSUAL_RANGES } from '../core/estimates-and-warnings.js';

  // ---- Info bubbles: the small "i" buttons next to field labels -----------
  // Short descriptors live in each field's <small>; anything longer lives in
  // the button's data-tip and opens in this one shared, fixed-position bubble
  // (fixed + appended to <body> so the sidebar's scroll container can't clip
  // it). Click/tap or Enter/Space opens it; click elsewhere, Escape, scroll,
  // or resize closes it. The buttons sit inside the field's <label for=...>,
  // so the delegated handler must preventDefault() — otherwise the browser's
  // label activation would focus/toggle the very control the label points at.
  export const infoBubble = document.createElement('div');
  // Live, passive per-field marker (red border + underlined label) for
  // whichever UNUSUAL_RANGES fields are currently out of range — updates on
  // every render(), same cadence as markDefaultFields()'s amber dot, so it's
  // accurate even for the very last field someone edits and never navigates
  // away from (nothing here waits for a blur). This is deliberately silent
  // — no toast, no popup — just a quiet visual cue at the point of entry.
  export function markUnusualFields(flaggedIds) {
    UNUSUAL_RANGES.forEach((r) => {
      const el = document.getElementById(r.id);
      if (!el) return;
      const fieldEl = el.closest('.field, .range-field');
      if (fieldEl) fieldEl.classList.toggle('unusual-value', flaggedIds.has(r.id));
    });
  }
