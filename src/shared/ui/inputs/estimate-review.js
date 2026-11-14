// The guided review of the estimated fields, walking the guidance card's ranked list

import { activeCategory, setActiveCategory } from './category-rail.js';
import { computeCountedEstimateIds, dismissEstimateField } from './estimate-badges.js';
import { fieldLandingTop } from '../layout/layout-metrics.js';
import { setMobileView } from '../layout/mobile-view.js';
import { rankedFieldIds } from '../results/guidance.js';
import { render } from '#country/ui/seam-render';

  // "Review →"/"Next →": which field id is currently the guided-review
  // target, so render() can tell when it stops being counted (edited away
  // from default, or dismissed) and auto-advance to whatever's next. null
  // means no review is in progress.
  let reviewingFieldId = null;
  function jumpToEstimateField(id) {
    reviewingFieldId = id;
    const el = document.getElementById(id);
    if (!el) return;
    setMobileView('inputs');
    // Reset any active category filter first — a field from a different
    // category than the one currently shown would otherwise be sitting
    // inside a display:none group, and every scroll/focus call below
    // would silently do nothing.
    if (typeof setActiveCategory === 'function' && activeCategory !== 'all') setActiveCategory('all');
    const group = el.closest('details.group');
    if (group && !group.open) group.open = true;
    const fieldEl = el.closest('.field, .range-field') || el;
    if (fieldEl) {
      fieldEl.classList.add('flash-highlight');
      // Long enough to still be visible after the smooth scroll below has
      // settled and the person has had a moment to actually look at the
      // field — 1.2s was disappearing almost as soon as it landed.
      setTimeout(() => fieldEl.classList.remove('flash-highlight'), 2600);
    }
    // Land the field in the upper third of the visible viewport, not dead
    // center — center often pushed a field's own <small> descriptor (which
    // can run several lines) past the bottom edge of the screen. Computed
    // manually (rather than scrollIntoView's block option, which only
    // offers 'start'/'center'/'end'/'nearest') after giving the group-open
    // and mobile-tab-switch layout changes above a frame to settle.
    requestAnimationFrame(() => {
      const isMobile = window.matchMedia('(max-width:820px)').matches;
      const scrollEl = isMobile ? null : document.querySelector('.panel');
      const rect = fieldEl.getBoundingClientRect();
      const delta = rect.top - fieldLandingTop(scrollEl);
      if (isMobile || !scrollEl) window.scrollBy({ top: delta, behavior: 'smooth' });
      else scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
    });
    el.focus({ preventScroll: true });
  }
  // Called from render() (after renderGuidance): the walk follows the guidance card's ranked list. Auto-advance: when the field
  // being reviewed was edited away from its default or dismissed (so it is no longer counted), jump to whatever is now first;
  // when it left the list for another reason, the review ends.
  export function renderEstimateReview() {
    const ranked = rankedFieldIds();
    if (reviewingFieldId !== null && !ranked.includes(reviewingFieldId)) {
      if (ranked.length && !computeCountedEstimateIds().includes(reviewingFieldId)) jumpToEstimateField(ranked[0]);
      else reviewingFieldId = null;
    }
    syncReviewLabel(ranked);
    syncReviewNav();
  }
  // Once a review is in progress and the field it's on is still ranked, the button reads "Next" instead of "Review": same
  // click target, but now it dismisses the current field and advances, rather than re-jumping to the first one.
  function syncReviewLabel(ranked) {
    const btn = document.getElementById('reviewEstimatesBtn');
    if (btn) btn.textContent = reviewingFieldId !== null && ranked.includes(reviewingFieldId) ? 'Next →' : 'Review →';
  }
  // Floating "Next →" pill (`#reviewNav`), fixed to the viewport regardless
  // of which mobile tab is active. The guided review's own trigger
  // (`#reviewEstimatesBtn`) lives inside `#guidanceCard`, which is
  // part of `.content` — the Dashboard-tab-only half of the page on mobile.
  // jumpToEstimateField() switches to the Inputs tab to show the field,
  // which is exactly what hides that trigger button, leaving no way to
  // continue the review without manually flipping back to Dashboard first.
  // This floating control mirrors the same action and stays visible on
  // both tabs (and both viewport widths) for as long as a review is
  // actually in progress.
  function syncReviewNav() {
    const nav = document.getElementById('reviewNav');
    if (!nav) return;
    const ranked = rankedFieldIds();
    if (reviewingFieldId === null || !ranked.includes(reviewingFieldId)) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    document.getElementById('reviewNavCount').textContent =
      `${ranked.length} ${ranked.length === 1 ? 'field' : 'fields'} left`;
    document.getElementById('reviewNavNext').textContent = ranked.length === 1 ? 'Done ✓' : 'Next →';
  }
  // Shared by both the card's button and the floating nav's
  // button — same action, same state, two entry points (one per mobile
  // tab) so the review flow is reachable no matter which side is showing.
  function advanceReview() {
    const ranked = rankedFieldIds();
    if (!ranked.length) return;
    if (reviewingFieldId !== null && ranked.includes(reviewingFieldId)) {
      // "Next" now also confirms-and-dismisses the field it's leaving —
      // render()'s own auto-advance (renderEstimateReview, above)
      // notices reviewingFieldId just stopped being counted and
      // jumps to whatever's next on its own.
      dismissEstimateField(reviewingFieldId);
      render();
    } else {
      jumpToEstimateField(ranked[0]);
      // A plain first jump doesn't itself change any state, so nothing
      // else triggers a render() to refresh the label/nav — do it directly.
      renderEstimateReview();
    }
  }
  export function wireEstimateReview() {
    document.getElementById('reviewEstimatesBtn')?.addEventListener('click', advanceReview);
    document.getElementById('reviewNavNext')?.addEventListener('click', advanceReview);
    document.getElementById('reviewNavClose')?.addEventListener('click', () => {
      reviewingFieldId = null;
      renderEstimateReview();
    });
    // A chip or a finished measuring job changed the list: refresh the label and the pill only, never jump, scroll or switch
    // the mobile view. A reviewed field that is no longer ranked ends the review.
    document.addEventListener('guidance-change', () => {
      const ranked = rankedFieldIds();
      if (reviewingFieldId !== null && !ranked.includes(reviewingFieldId)) reviewingFieldId = null;
      syncReviewLabel(ranked);
      syncReviewNav();
    });
    // A row of the list starts the walk at its field.
    document.getElementById('guidanceList')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-field]');
      if (!row) return;
      jumpToEstimateField(row.dataset.field);
      renderEstimateReview();
    });
  }
