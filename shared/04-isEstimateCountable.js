  function isEstimateCountable(id) {
    if (ESTIMATE_ALWAYS_IDS.includes(id)) return true;
    const group = ESTIMATE_GATED_GROUPS.find((g) => g.ids.includes(id));
    return !!group && group.gate();
  }
  // Returns the currently-counted field ids, sorted into the same order
  // they actually appear in the sidebar (top to bottom) — this is also the
  // order "Review →"/"Next →" walks them in. Deliberately NOT `ids` array
  // order: per "Sidebar group order" elsewhere in this file, a field's
  // position in that array has never been tied to its visual position —
  // fields get freely reordered/regrouped in the markup across rounds
  // without anyone needing to (or being expected to) also reorder `ids` to
  // match, since nothing else depends on that array's order. Real-world
  // bug report: the guided review "jumping around" instead of progressing
  // top-to-bottom was exactly this — it had been walking `ids`' own
  // (unrelated) declaration order the whole time. Sorted here with
  // `compareDocumentPosition` against each field's live DOM position
  // instead, so a future sidebar reorder keeps the review in sync
  // automatically, with nothing to remember to update in two places.
  function computeCountedEstimateIds() {
    return ids
      .filter(
        (id) =>
          isEstimateCountable(id) &&
          state[id] === defaults[id] &&
          !state.dismissedEstimates.includes(id),
      )
      .sort((a, b) => {
        const elA = document.getElementById(a),
          elB = document.getElementById(b);
        if (!elA || !elB) return 0;
        const pos = elA.compareDocumentPosition(elB);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
  }
  // Single source of truth for dismissing a field, used by both the
  // per-field badge's ✓ button and the guided-review "Next" flow below —
  // never duplicate the push/persist logic at a second call site.
  function dismissEstimateField(id) {
    if (id && !state.dismissedEstimates.includes(id)) {
      state.dismissedEstimates.push(id);
      dismissFirstRunBanner();
      saveInputs();
      return true;
    }
    return false;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.estimate-dismiss');
    if (!btn) return;
    // The button lives inside the field's <label for="...">, so a native
    // click here would also trigger the browser's "activate the label's
    // associated control" default action — refocusing/reselecting the very
    // field being dismissed, right after we've moved focus elsewhere (e.g.
    // during Review-mode auto-advance). Suppress that.
    e.preventDefault();
    if (dismissEstimateField(btn.dataset.field)) render();
  });
  function renderEstimateBadges(countedIds) {
    const countedSet = new Set(countedIds);
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const label = document.querySelector(`label[for="${id}"]`);
      if (!label) return;
      let badge = label.querySelector('.estimate-badge');
      if (countedSet.has(id)) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'estimate-badge';
          // The "Estimated" text itself is inert (cursor:default, see CSS) —
          // only the ✓ circle is a real button — but the two used to read as
          // one uniform tappable pill, which made people unsure whether
          // tapping the word "Estimated" itself would dismiss the field.
          // Splitting them into a plain label span plus a visually distinct,
          // larger circular button (its own tinted background/border) makes
          // the actual tap target unambiguous.
          badge.innerHTML =
            '<span class="estimate-badge-label">Estimated</span><button type="button" class="estimate-dismiss" aria-label="This looks right, stop flagging it" title="This looks right — stop flagging it">✓</button>';
          badge.querySelector('.estimate-dismiss').dataset.field = id;
          const small = label.querySelector('small');
          if (small) label.insertBefore(badge, small);
          else label.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }
  // ---- Info bubbles: the small "i" buttons next to field labels -----------
  // Short descriptors live in each field's <small>; anything longer lives in
  // the button's data-tip and opens in this one shared, fixed-position bubble
  // (fixed + appended to <body> so the sidebar's scroll container can't clip
  // it). Click/tap or Enter/Space opens it; click elsewhere, Escape, scroll,
  // or resize closes it. The buttons sit inside the field's <label for=...>,
  // so the delegated handler must preventDefault() — otherwise the browser's
  // label activation would focus/toggle the very control the label points at.
  const infoBubble = document.createElement('div');
  infoBubble.id = 'infoBubble';
  infoBubble.className = 'info-bubble';
  infoBubble.setAttribute('role', 'tooltip');
  infoBubble.hidden = true;
  document.body.appendChild(infoBubble);
  let infoBubbleBtn = null;
  let infoBubbleAnchor = { top: 0, left: 0 };
  function closeInfoBubble(returnFocus) {
    if (!infoBubbleBtn) return;
    const btn = infoBubbleBtn;
    infoBubbleBtn = null;
    infoBubble.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-describedby');
    if (returnFocus && btn.isConnected) btn.focus();
  }
  function placeInfoBubble() {
    if (!infoBubbleBtn || !infoBubbleBtn.isConnected) {
      closeInfoBubble(false);
      return;
    }
    const r = infoBubbleBtn.getBoundingClientRect(),
      vw = document.documentElement.clientWidth,
      vh = window.innerHeight,
      bw = infoBubble.offsetWidth,
      bh = infoBubble.offsetHeight,
      gap = 8,
      margin = 12;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - bw / 2), Math.max(margin, vw - bw - margin));
    let top = r.bottom + gap;
    if (top + bh > vh - margin && r.top - gap - bh >= margin) top = r.top - gap - bh;
    infoBubble.style.left = left + 'px';
    infoBubble.style.top = Math.max(margin, top) + 'px';
  }
  function openInfoBubble(btn) {
    closeInfoBubble(false);
    infoBubble.textContent = btn.dataset.tip || '';
    infoBubble.hidden = false;
    infoBubbleBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'infoBubble');
    placeInfoBubble();
    const ar = btn.getBoundingClientRect();
    infoBubbleAnchor = { top: ar.top, left: ar.left };
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.info-tip') : null;
    if (btn) {
      e.preventDefault();
      if (infoBubbleBtn === btn) closeInfoBubble(false);
      else openInfoBubble(btn);
      return;
    }
    if (infoBubbleBtn && !infoBubble.contains(e.target)) closeInfoBubble(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && infoBubbleBtn) closeInfoBubble(true);
  });
  // Close on scroll only once the button has actually moved — a browser can
  // fire a stray scroll event right after a tap (focus/scroll-into-view) that
  // shouldn't dismiss the bubble that tap just opened.
  document.addEventListener(
    'scroll',
    (e) => {
      if (!infoBubbleBtn || infoBubble.contains(e.target)) return;
      const r = infoBubbleBtn.getBoundingClientRect();
      if (!infoBubbleBtn.isConnected || Math.abs(r.top - infoBubbleAnchor.top) > 4 || Math.abs(r.left - infoBubbleAnchor.left) > 4)
        closeInfoBubble(false);
    },
    true,
  );
  window.addEventListener('resize', () => closeInfoBubble(false));

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
      const viewportH = isMobile ? window.innerHeight : (scrollEl ? scrollEl.clientHeight : window.innerHeight);
      const targetTop = viewportH * 0.3;
      const delta = rect.top - targetTop;
      if (isMobile || !scrollEl) window.scrollBy({ top: delta, behavior: 'smooth' });
      else scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
    });
    el.focus({ preventScroll: true });
  }
  function renderEstimatedRollup(countedIds) {
    const banner = document.getElementById('estimatedRollupBanner');
    const textEl = document.getElementById('estimatedRollupText');
    if (banner && textEl) {
      if (countedIds.length === 0) {
        banner.hidden = true;
        if (reviewingFieldId !== null) reviewingFieldId = null;
      } else {
        banner.hidden = false;
        textEl.innerHTML = `<b>${countedIds.length}</b> of your numbers ${countedIds.length === 1 ? 'is' : 'are'} still estimated`;
        // Auto-advance: if we're mid-review and the field being reviewed
        // just stopped being counted (edited away from default, or
        // dismissed via "Next" below), jump to whatever's now first, if
        // anything remains.
        if (reviewingFieldId !== null && !countedIds.includes(reviewingFieldId)) {
          jumpToEstimateField(countedIds[0]);
        }
        // Once a review is in progress and the field it's on is still
        // counted, the button reads "Next" instead of "Review" — same
        // click target, but now dismisses the current field and advances,
        // rather than just re-jumping to the first one again.
        const btn = document.getElementById('reviewEstimatesBtn');
        if (btn) btn.textContent = reviewingFieldId !== null && countedIds.includes(reviewingFieldId) ? 'Next →' : 'Review →';
      }
    }
    syncReviewNav();
  }
  // Floating "Next →" pill (`#reviewNav`), fixed to the viewport regardless
  // of which mobile tab is active. The guided review's own trigger
  // (`#reviewEstimatesBtn`) lives inside `#estimatedRollupBanner`, which is
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
    const countedIds = computeCountedEstimateIds();
    if (reviewingFieldId === null || !countedIds.includes(reviewingFieldId)) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    document.getElementById('reviewNavCount').textContent =
      `${countedIds.length} ${countedIds.length === 1 ? 'field' : 'fields'} left`;
    document.getElementById('reviewNavNext').textContent = countedIds.length === 1 ? 'Done ✓' : 'Next →';
  }
  // Shared by both the rollup banner's button and the floating nav's
  // button — same action, same state, two entry points (one per mobile
  // tab) so the review flow is reachable no matter which side is showing.
  function advanceReview() {
    const countedIds = computeCountedEstimateIds();
    if (!countedIds.length) return;
    if (reviewingFieldId !== null && countedIds.includes(reviewingFieldId)) {
      // "Next" now also confirms-and-dismisses the field it's leaving —
      // render()'s own auto-advance (inside renderEstimatedRollup, above)
      // notices reviewingFieldId just dropped out of the counted set and
      // jumps to whatever's next on its own.
      dismissEstimateField(reviewingFieldId);
      render();
    } else {
      jumpToEstimateField(countedIds[0]);
      // A plain first jump doesn't itself change any state, so nothing
      // else triggers a render() to refresh the label/nav — do it directly.
      renderEstimatedRollup(computeCountedEstimateIds());
    }
  }
  document.getElementById('reviewEstimatesBtn')?.addEventListener('click', advanceReview);
  document.getElementById('reviewNavNext')?.addEventListener('click', advanceReview);
  document.getElementById('reviewNavClose')?.addEventListener('click', () => {
    reviewingFieldId = null;
    renderEstimatedRollup(computeCountedEstimateIds());
  });
  // Quantifies the impact of one flagged assumption by comparing the
  // current simulation against the same simulation with just that one
  // field nudged back to the nearer edge of its realistic range — the same
  // mutate/simulate/restore idiom SENSITIVITY_LEVERS uses, reusing the
  // "Explore a question" comparison helpers (decisionDeltaPhrase already
  // handles the depleted-portfolio/depletion-age wording) rather than
  // inventing a second delta phrasing.
  function unusualAssumptionImpact(item, currentSim) {
    const saved = state[item.id];
    state[item.id] = saved < item.min ? item.min : item.max;
    const typicalSim = simulate();
    state[item.id] = saved;
    return decisionDeltaPhrase(currentSim, typicalSim);
  }
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
  document.addEventListener('click', (e) => {
    const dismissBtn = e.target.closest('.unusual-dismiss');
    if (dismissBtn) {
      if (dismissUnusualAssumption(dismissBtn.dataset.field)) render();
      return;
    }
    const jumpBtn = e.target.closest('.unusual-jump');
    if (jumpBtn) jumpToUnusualField(jumpBtn.dataset.field);
  });
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
  // Renders the dashboard "Worth a second look" callout — hidden entirely
  // whenever nothing is flagged (or everything currently flagged has been
  // dismissed) — and, via syncUnusualToast, a brief pop-up toast for any
  // *newly* flagged item so a person working elsewhere on the dashboard
  // (or on the Inputs tab on mobile) still finds out, rather than only
  // someone who happens to be looking at this exact card when it changes.
  function renderUnusualAssumptions(selected) {
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
