// The sidebar field search

import { escapeHtml } from '../core/format/numbers.js';
import { activeCategory, setActiveCategory } from './category-rail.js';
import { setMobileView } from './mobile-view.js';

  export function wireFieldSearch() {
    // Sidebar field search: highlights every field whose label matches the
    // query and force-opens whichever <details> group(s) contain it (walking
    // up through nested details, e.g. the "Spending changes" sub-group inside
    // "Household spending"). Groups opened only because of a search are
    // restored to whatever they were before, the moment the query is cleared
    // — a group already open (or one the person opened themselves mid-search)
    // is left alone either way.
    (function setupFieldSearch() {
      const input = document.getElementById('fieldSearch'),
        countEl = document.getElementById('fieldSearchCount'),
        resultsEl = document.getElementById('fieldSearchResults');
      if (!input || !resultsEl) return;
      // originalOpen is a snapshot of every <details> under .panel (top-level
      // groups and the "Spending changes" sub-group nested inside Household
      // spending) taken once, the moment a search *starts* (query goes from
      // empty to non-empty) — not incrementally per keystroke like an earlier
      // version of this did. That earlier approach only ever recorded a
      // group's state the first time a match forced it open, so a group that
      // picked up a match on an early, broader keystroke stayed force-open
      // through later, narrower keystrokes even once nothing inside it
      // mattered — group after group would accumulate open, and it read as
      // "search pops open everything." Snapshotting once up front and then
      // deriving every group's open state fresh from its match set on every
      // keystroke (below) means each keystroke's group state depends only on
      // that keystroke's matches, not on the search's history, while still
      // giving us the one true "before the search touched anything" state to
      // restore to when the box is emptied.
      let searchActive = false;
      const originalOpen = new Map();
      // Dropdown navigator state: which result (if any) is keyboard-active,
      // and the {fieldEl, label, group} entries currently rendered (every
      // match, uncapped — see runSearch() below), so click/Enter handlers can
      // resolve an index back to a real field element without re-querying
      // the DOM.
      let activeIndex = -1;
      let renderedMatches = [];
      function panelDetails() {
        return document.querySelectorAll('.panel details');
      }
      function panelFields() {
        return document.querySelectorAll('.panel .field, .panel .range-field');
      }
      // mainLabelText() pulls only a label's direct text nodes — skipping the
      // nested <small> help blurb, checkbox, and "Estimated ✓" badge child
      // elements — falling back to the full text if a field's markup doesn't
      // have a plain leading text node (shouldn't happen, but better than
      // showing nothing). This used to feed only the dropdown's display text,
      // with matching itself done separately against the full
      // label.textContent (including the <small> blurb) — deliberately broad,
      // on the theory that jargon often lives in the blurb. In practice that
      // made common words absurdly over-broad: "income" matched ~20 fields
      // because most field blurbs mention income somewhere, which defeated
      // the point of a filter meant to narrow things down. Matching now uses
      // this same direct-label text everywhere (see the isMatch line below),
      // so what's searched is exactly what's shown as a field's name — a
      // person typing "income" gets only fields actually about income, not
      // every field whose description happens to mention it in passing.
      function mainLabelText(label) {
        let text = '';
        label.childNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
          // A label's last word and its ⓘ button are wrapped together in a
          // no-wrap span (so the button can't wrap onto its own line) — that
          // word is still part of the field's name, the button text is not.
          else if (n.classList && n.classList.contains('info-nw'))
            n.childNodes.forEach((c) => {
              if (c.nodeType === Node.TEXT_NODE) text += c.textContent;
            });
        });
        text = text.trim();
        return text || label.textContent.trim();
      }
      // Breadcrumb = the outermost <details class="group"> a field lives
      // under (walking all the way up, not just the nearest — a field inside
      // the nested "Spending changes" sub-group should still show "Household
      // spending", not the sub-group's own plain-text summary).
      function groupBreadcrumb(fieldEl) {
        let topGroup = null,
          g = fieldEl.parentElement ? fieldEl.parentElement.closest('details.group') : null;
        while (g) {
          topGroup = g;
          g = g.parentElement ? g.parentElement.closest('details.group') : null;
        }
        if (!topGroup) return '';
        const titleEl = topGroup.querySelector(':scope > summary .group-title');
        return titleEl ? titleEl.textContent.trim() : topGroup.querySelector(':scope > summary').textContent.trim();
      }
      function hideResults() {
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
        activeIndex = -1;
        renderedMatches = [];
      }
      function setActive(idx) {
        const buttons = resultsEl.querySelectorAll('.field-search-result');
        buttons.forEach((b, i) => b.classList.toggle('active', i === idx));
        if (idx >= 0 && buttons[idx]) buttons[idx].scrollIntoView({ block: 'nearest' });
        activeIndex = idx;
      }
      // Opens every ancestor group (not just the nearest — see groupBreadcrumb
      // above), scrolls the field into the upper third of the viewport, and
      // focuses its input — the same landing spot/flash-highlight idiom
      // jumpToEstimateField() uses for the guided estimated-fields review,
      // reused here rather than re-deriving a second version of the same
      // "reveal and focus a sidebar field" logic.
      function jumpToSearchField(fieldEl) {
        // Same reset as jumpToEstimateField() — a search hit from a
        // category other than the one currently filtered would otherwise
        // be scrolled/focused inside a display:none group.
        if (typeof setActiveCategory === 'function' && activeCategory !== 'all') setActiveCategory('all');
        let g = fieldEl.parentElement ? fieldEl.parentElement.closest('details.group') : null;
        while (g) {
          if (!g.open) g.open = true;
          g = g.parentElement ? g.parentElement.closest('details.group') : null;
        }
        setMobileView('inputs');
        fieldEl.classList.add('flash-highlight');
        setTimeout(() => fieldEl.classList.remove('flash-highlight'), 2600);
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
        const focusable = fieldEl.querySelector('input,select,textarea');
        if (focusable) focusable.focus({ preventScroll: true });
      }
      // Selecting a result used to clear the search box and call endSearch()
      // — restoring every hidden field and the groups' pre-search open state
      // — before jumping to the picked field. That threw away the whole point
      // of having narrowed the list: the person picked a result specifically
      // because the filtered view made it easy to find, and a click promptly
      // put the entire unfiltered sidebar back, "negating the usefulness of
      // the search bar" (verbatim feedback). Now it only closes the dropdown
      // — the filter, the search term, and the match count all stay exactly
      // as they were, so a person can look at (or jump to) more than one
      // matching field from the same search without retyping it.
      function selectResult(fieldEl) {
        hideResults();
        jumpToSearchField(fieldEl);
      }
      function endSearch() {
        panelFields().forEach((el) => el.classList.remove('field-match', 'field-hidden'));
        if (searchActive) {
          originalOpen.forEach((wasOpen, details) => {
            details.open = wasOpen;
          });
          originalOpen.clear();
          searchActive = false;
        }
        countEl.hidden = true;
        hideResults();
      }
      // The dropdown navigator is desktop-only. On a phone it used to render
      // as a box up to 50vh tall directly over the very fields it had just
      // finished filtering down — with the on-screen keyboard open, that
      // could be most of the visible viewport, hiding the simplified list a
      // person could otherwise just scroll straight through. The filter
      // itself (field-match/field-hidden below) is the part that was already
      // great and needs no dropdown to be useful on a small screen: narrowing
      // 100+ fields down to a handful is enough on its own to scan directly.
      function isMobileSearch() {
        return window.matchMedia('(max-width:820px)').matches;
      }
      function runSearch() {
        const q = input.value.trim().toLowerCase();
        if (!q) {
          endSearch();
          return;
        }
        if (!searchActive) {
          panelDetails().forEach((d) => {
            if (!originalOpen.has(d)) originalOpen.set(d, d.open);
          });
          searchActive = true;
        }
        // Gather each field's own name and section once, up front, so both
        // matching passes below read the same data without re-querying the
        // DOM or re-deriving text twice.
        const fieldInfo = Array.from(panelFields()).map((fieldEl) => {
          const label = fieldEl.querySelector('label');
          return {
            fieldEl,
            name: label ? mainLabelText(label) : '',
            group: groupBreadcrumb(fieldEl),
          };
        });
        // Pass 1: match against the field's own name only (not the full
        // label.textContent a field's <small> blurb and "Estimated ✓" badge
        // also live inside) — that used to make a common word like "income"
        // match every field whose *description* merely mentioned it in
        // passing (~20 fields), which defeated the point of a filter meant
        // to narrow things down to what someone is actually looking for.
        const directSet = new Set(fieldInfo.filter((info) => info.name.toLowerCase().includes(q)));
        // Pass 1.5: also union in every field whose top-level group/section
        // title *exactly* matches the query (not merely contains it) — this
        // runs unconditionally, not just when pass 1 finds nothing. A query
        // naming a whole section precisely ("assets", "other loans") should
        // pull in that entire section even when one of its fields *also*
        // happens to match by name directly, rather than only kicking in on a
        // literal zero: "other loans" without this pass would match only the
        // one field literally titled "Model other loans" and stop there,
        // missing all 25 of the actual per-loan fields (original principal,
        // remaining balance, interest rate, term, extra principal — none of
        // which say "other loans" in their own label) that are exactly what
        // someone searching "other loans" is looking for. Requiring an
        // *exact* title match (not a
        // substring) is what keeps this from reintroducing the over-broad
        // matching pass 1 exists to avoid: "income" doesn't exactly equal
        // "Retirement income & healthcare" (a compound title that's mostly
        // Social Security/pensions/healthcare, not income specifically), so
        // that section is never pulled in wholesale just because the word
        // "income" happens to appear inside its name — it only fires for a
        // section actually *named* the query, like the "Income" group itself
        // (whose few fields already match directly anyway) or "Housing".
        const exactSectionSet = new Set(fieldInfo.filter((info) => info.group.trim().toLowerCase() === q));
        let matchList = fieldInfo.filter((info) => directSet.has(info) || exactSectionSet.has(info));
        // Pass 2 (fallback, only when passes 1 and 1.5 together come back
        // empty): match against the field's own top-level group/section
        // title as a *substring* instead of requiring an exact title match.
        // Covers a section-level query that isn't quite the section's exact
        // name (plural/wording mismatch, etc.) when nothing else matched at
        // all — a looser bar than pass 1.5, but only reached once there's
        // nothing to lose by widening it.
        if (matchList.length === 0) {
          matchList = fieldInfo.filter((info) => info.group.toLowerCase().includes(q));
        }
        const matches = matchList.length;
        fieldInfo.forEach((info) => {
          const isMatch = matchList.includes(info);
          info.fieldEl.classList.toggle('field-match', isMatch);
          // Filters the sidebar down to just the matching fields (rather than
          // only opening their groups) — with 100+ fields across a couple
          // dozen groups, opening every group that has *a* match still left
          // a lot of irrelevant fields to scan past to find the one you
          // wanted.
          info.fieldEl.classList.toggle('field-hidden', !isMatch);
        });
        const firstMatch = matchList.length ? matchList[0].fieldEl : null;
        // A group's open state during search is derived fresh from whether it
        // currently contains a match — including a group that was already
        // open before searching, which now collapses too if this keystroke's
        // query no longer matches anything inside it, consistent with hiding
        // that same content everywhere else. querySelector() looks at every
        // descendant regardless of depth, so this also correctly opens an
        // outer group purely because its nested sub-group has a match.
        panelDetails().forEach((d) => {
          d.open = d.querySelector('.field-match') !== null;
        });
        countEl.hidden = false;
        countEl.textContent = matches ? `${matches} match${matches === 1 ? '' : 'es'}` : 'No matches';
        // Dropdown navigator: a settings-navigator layer on top of the
        // existing filter — lets someone jump straight to a specific matching
        // field (open its group, scroll to it, focus it) instead of having to
        // scan the filtered sidebar for it, most valuable once a query
        // matches several fields spread across different groups. Desktop
        // only — see isMobileSearch() above. Every match is rendered (no
        // arbitrary cap) — the dropdown itself scrolls (see its own
        // max-height/overflow-y CSS), and a person searching a whole section
        // ("income," "assets") has no obvious next word to type that would
        // narrow a list that's already exactly what they were looking for,
        // so there's no "+N more — keep typing" prompt any more either.
        renderedMatches = matchList.map((m) => ({ fieldEl: m.fieldEl, label: m.name, group: m.group }));
        activeIndex = -1;
        if (matchList.length === 0 || isMobileSearch()) {
          hideResults();
        } else {
          resultsEl.innerHTML = renderedMatches
            .map(
              (m, i) =>
                `<button type="button" class="field-search-result" data-idx="${i}" role="option"><span class="fsr-label">${escapeHtml(m.label)}</span>${
                  m.group ? `<span class="fsr-group">${escapeHtml(m.group)}</span>` : ''
                }</button>`,
            )
            .join('');
          resultsEl.querySelectorAll('.field-search-result').forEach((btn, i) => {
            btn.addEventListener('click', () => selectResult(renderedMatches[i].fieldEl));
          });
          resultsEl.hidden = false;
          input.setAttribute('aria-expanded', 'true');
        }
        if (firstMatch) firstMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      input.addEventListener('input', runSearch);
      // Re-show the dropdown when the search box regains focus with a query
      // still in it (e.g. after picking a result, which no longer clears the
      // query — see selectResult() above) rather than leaving someone unable
      // to get back to the list of matches without retyping the whole query.
      input.addEventListener('focus', () => {
        if (input.value.trim() && !isMobileSearch()) runSearch();
      });
      input.addEventListener('keydown', (e) => {
        const buttons = resultsEl.querySelectorAll('.field-search-result');
        if (e.key === 'Escape') {
          input.value = '';
          endSearch();
          input.blur();
        } else if (e.key === 'ArrowDown' && buttons.length) {
          e.preventDefault();
          setActive(activeIndex < buttons.length - 1 ? activeIndex + 1 : 0);
        } else if (e.key === 'ArrowUp' && buttons.length) {
          e.preventDefault();
          setActive(activeIndex > 0 ? activeIndex - 1 : buttons.length - 1);
        } else if (e.key === 'Enter' && buttons.length) {
          e.preventDefault();
          buttons[activeIndex >= 0 ? activeIndex : 0].click();
        }
      });
      // Closing the dropdown on blur needs to not race a click on one of its
      // own result buttons: a mousedown on a <button> moves focus to it before
      // its click event fires, so the resulting focusout's relatedTarget is
      // that button — checking resultsEl.contains(relatedTarget) lets the
      // click complete normally instead of the dropdown disappearing out from
      // under it. Clicking anywhere else (a sidebar field, blank space) hides
      // the dropdown but leaves the filter/highlight state as-is, same as any
      // ordinary search-suggestions popover.
      input.addEventListener('focusout', (e) => {
        if (resultsEl.contains(e.relatedTarget)) return;
        hideResults();
      });
    })();
  }
