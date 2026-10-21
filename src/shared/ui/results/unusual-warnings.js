// The unusual-assumption warnings

import { unusualAssumptionImpact, computeUnusualAssumptions, UNUSUAL_RANGES } from '../../core/inputs/estimates.js';
import { state } from '../../core/store.js';
import { saveInputs } from '../plans/autosave.js';
import { setMobileView, switchToDashboardTab } from '../layout/mobile-view.js';
import { render } from '#country/ui/seam-render';

  function dismissUnusualAssumption(id) {
    if (id && !state.dismissedUnusualAssumptions.includes(id)) {
      state.dismissedUnusualAssumptions.push(id);
      saveInputs();
      return true;
    }
    return false;
  }
  // Same landing/scroll/flash idiom as jumpToEstimateField, duplicated
  // rather than shared: it has no reviewingFieldId-style guided-review
  // state to track, and per this file's own "simulate()/simulateHistorical()
  // duplication trap" note, two independently-evolving features are safer
  // kept as separate small functions than coupled through one shared one.
  function jumpToUnusualField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    setMobileView('inputs');
    const group = el.closest('details.group');
    if (group && !group.open) group.open = true;
    const fieldEl = el.closest('.field, .range-field') || el;
    fieldEl.classList.add('flash-highlight');
    setTimeout(() => fieldEl.classList.remove('flash-highlight'), 2600);
    requestAnimationFrame(() => {
      const isMobile = window.matchMedia('(max-width:820px)').matches;
      const scrollEl = isMobile ? null : document.querySelector('.panel');
      const rect = fieldEl.getBoundingClientRect();
      const viewportH = isMobile
        ? window.innerHeight
        : scrollEl
          ? scrollEl.clientHeight
          : window.innerHeight;
      const targetTop = viewportH * 0.3;
      const delta = rect.top - targetTop;
      if (isMobile || !scrollEl) window.scrollBy({ top: delta, behavior: 'smooth' });
      else scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
    });
    el.focus({ preventScroll: true });
  }
  // load-time: an empty Set; reads nothing.
  // Tracks which flagged ids were already showing as of the *previous*
  // render, purely in memory (not persisted — a fresh page load always
  // starts from a clean slate). `unusualToastArmed` skips the very first
  // render (page boot, or a Reset/Load that just replaced the whole
  // state) so loading a plan never pops an unsolicited toast the instant
  // the page settles — only a value that becomes newly unusual *during*
  // the session (typing, or a scenario import) does.
  let previousUnusualIds = new Set(),
    unusualToastArmed = false,
    unusualToastTimer = null;
  function syncUnusualToast(flagged) {
    const toast = document.getElementById('unusualToast');
    if (!toast) return;
    const flaggedIds = new Set(flagged.map((f) => f.id));
    // Skip a field the person is actively typing into right now — they're
    // already looking right at it, so a toast announcing it would just be
    // noise layered on top of what they can already see.
    const newlyFlagged = flagged.filter(
      (f) => !previousUnusualIds.has(f.id) && document.activeElement?.id !== f.id,
    );
    if (unusualToastArmed && newlyFlagged.length) {
      document.getElementById('unusualToastText').textContent =
        newlyFlagged.length === 1
          ? `"${newlyFlagged[0].label}" looks unusual`
          : `${newlyFlagged.length} assumptions look unusual`;
      toast.hidden = false;
      clearTimeout(unusualToastTimer);
      unusualToastTimer = setTimeout(() => {
        toast.hidden = true;
      }, 8000);
    }
    unusualToastArmed = true;
    previousUnusualIds = flaggedIds;
  }
  // Renders the dashboard "Worth a second look" callout — hidden entirely
  // whenever nothing is flagged (or everything currently flagged has been
  // dismissed) — and, via syncUnusualToast, a brief pop-up toast for any
  // *newly* flagged item so a person working elsewhere on the dashboard
  // (or on the Inputs tab on mobile) still finds out, rather than only
  // someone who happens to be looking at this exact card when it changes.
  export function renderUnusualAssumptions(selected) {
    const banner = document.getElementById('unusualAssumptionsBanner');
    const listEl = document.getElementById('unusualAssumptionsList');
    const flagged = computeUnusualAssumptions();
    markUnusualFields(new Set(flagged.map((f) => f.id)));
    if (!banner || !listEl) return;
    if (!flagged.length) {
      banner.hidden = true;
      listEl.innerHTML = '';
      syncUnusualToast(flagged);
      return;
    }
    banner.hidden = false;
    listEl.innerHTML = flagged
      .map((item) => {
        if (item.check)
          return `<li><button type="button" class="unusual-jump" data-field="${item.id}"><b>${item.label}</b></button> — ${item.message()}<button type="button" class="estimate-dismiss unusual-dismiss" data-field="${item.id}" aria-label="This is intentional, stop flagging it" title="This is intentional — stop flagging it">✓</button></li>`;
        const v = state[item.id];
        const impact = unusualAssumptionImpact(item, selected);
        return `<li><button type="button" class="unusual-jump" data-field="${item.id}"><b>${item.label}</b>: ${v}${item.unit}</button> <span style="color:var(--hint)">(typical ${item.min}–${item.max}${item.unit})</span> — using a typical value ${impact}.<button type="button" class="estimate-dismiss unusual-dismiss" data-field="${item.id}" aria-label="This is intentional, stop flagging it" title="This is intentional — stop flagging it">✓</button></li>`;
      })
      .join('');
    syncUnusualToast(flagged);
  }
  export function wireUnusualWarnings() {
    document.addEventListener('click', (e) => {
      const dismissBtn = e.target.closest('.unusual-dismiss');
      if (dismissBtn) {
        if (dismissUnusualAssumption(dismissBtn.dataset.field)) render();
        return;
      }
      const jumpBtn = e.target.closest('.unusual-jump');
      if (jumpBtn) jumpToUnusualField(jumpBtn.dataset.field);
    });
    // The one non-passive cue: a brief "Unusual value" note right under the
    // field, shown only once the person actually leaves it (focusout, not
    // input) — per feedback, this shouldn't interrupt while they're still
    // typing/dragging, only once they've moved on. Delegated + capture-free
    // (focusout bubbles, unlike blur) so it needs no per-field wiring.
    document.addEventListener('focusout', (e) => {
      const id = e.target && e.target.id;
      if (!id || !UNUSUAL_RANGES.some((r) => r.id === id)) return;
      if (!computeUnusualAssumptions().some((f) => f.id === id)) return;
      const fieldEl = e.target.closest('.field, .range-field');
      if (!fieldEl) return;
      let note = fieldEl.querySelector('.unusual-field-note');
      if (!note) {
        note = document.createElement('div');
        note.className = 'unusual-field-note';
        note.textContent = 'Unusual value';
        fieldEl.appendChild(note);
      }
      note.classList.add('show');
      clearTimeout(note._hideTimer);
      note._hideTimer = setTimeout(() => note.classList.remove('show'), 3000);
    });
    document.getElementById('unusualToastBtn')?.addEventListener('click', () => {
      document.getElementById('unusualToast').hidden = true;
      clearTimeout(unusualToastTimer);
      const first = computeUnusualAssumptions()[0];
      if (first) jumpToUnusualField(first.id);
      else switchToDashboardTab();
    });
    document.getElementById('unusualToastClose')?.addEventListener('click', () => {
      document.getElementById('unusualToast').hidden = true;
      clearTimeout(unusualToastTimer);
    });
  }
  // Live, passive per-field marker (red border + underlined label) for
  // whichever UNUSUAL_RANGES fields are currently out of range — updates on
  // every render(), same cadence as markDefaultFields()'s amber dot, so it's
  // accurate even for the very last field someone edits and never navigates
  // away from (nothing here waits for a blur). This is deliberately silent
  // — no toast, no popup — just a quiet visual cue at the point of entry.
  function markUnusualFields(flaggedIds) {
    UNUSUAL_RANGES.forEach((r) => {
      const el = document.getElementById(r.id);
      if (!el) return;
      const fieldEl = el.closest('.field, .range-field');
      if (fieldEl) fieldEl.classList.toggle('unusual-value', flaggedIds.has(r.id));
    });
  }
