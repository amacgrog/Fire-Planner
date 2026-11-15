// The guidance card: goal chips, the fields worth filling in next, and the background job that measures them

import { IMPACT_RULES, fieldImpact, impactSetup, shownImpact } from '../../core/analysis/field-impact.js';
import { compact } from '../../core/format/numbers.js';
import { withoutListNames } from '../../core/inputs/lists.js';
import { chosenGoals, criticalRows, impactBounds, impactKind, normalizeGoals, scopeIds } from '../../core/inputs/guidance-scope.js';
import { state } from '../../core/store.js';
import { computeCountedEstimateIds, renderEstimateBadges } from '../inputs/estimate-badges.js';
import { saveInputs } from '../plans/autosave.js';
import { movePreview } from '../plans/move-preview-snapshot.js';
import { dismissFirstRunBanner } from '../plans/saved-plan.js';
import { currentMarketScenarioText } from './market-scenario-banner.js';
import { stateContextFor } from './state-context.js';
import { BASIC_IDS, GOALS } from '#country/core/seam-GUIDANCE_FIELDS';
import { searchPending } from '#country/core/seam-searchPending';
import { storeContext } from '#country/core/seam-storeContext';

  const SHOWN_ROWS = 5;
  const SLICE_MS = 40;
  // The memos each job keeps by key (the real plan's and a previewed move's are enough).
  const MEMO_CACHE_MAX = 4;
  const LOCKED_TITLE = 'Revert the market scenario to change your goals.';
  const PREVIEW_LOCKED_TITLE = 'Keep or revert the change you are previewing to change your goals.';
  // A basic (BASIC_IDS) still at its example value is a placeholder, not an estimate: a ±10% error says nothing about it, so it
  // gets no figure, is never measured, and is listed first (owner decision, 2026-11-15).
  const BASIC_REASON = 'Still the example value: enter yours.';
  // load-time: an object literal holding an empty Map (a global constructor); reads nothing.
  // What is measured for one key (impactKey): setup undefined is not yet measured, null is no slope (every value null), else
  // impactSetup's result; values maps a field id to its fieldImpact (null under a null setup). Assigned only in this module.
  let memo = { key: null, setup: undefined, values: new Map() };
  // The last MEMO_CACHE_MAX memos by key, the most recently used last, so a Try and its Revert keep each side's figures.
  // Assigned only in this module (its contents through keptMemo).
  const memos = [];
  // load-time: an object literal holding an empty Map (a global constructor); reads nothing.
  // The display memo: a copy of the working memo as last committed (a job emptied its queue, or nothing was left to measure).
  // The card paints from it, so a change keeps the old figures (dimmed) until the next job commits. Assigned only in this module.
  let shown = { key: null, setup: undefined, values: new Map() };
  // The running job ({ gen, key, state, ctxFor, base, queue }) or null; gen tells a live timer from a stale one.
  let job = null;
  let gen = 0;
  // The last painted list: ranked rows ({ id, impact, reason }) in walk order and the "Everything else" ids.
  let lastRanked = [];
  let lastOther = [];
  let showAll = false;
  // load-time: an empty Set (a global constructor); reads nothing.
  // The features the wizard's goal step turned on, so turning the goal off there turns them off again.
  const turnedOnBySetup = new Set();

  // The memo key: the tax year and the inputs, without the goals, the two dismissal lists and the list-row names (a chip, a
  // dismissal or a rename keeps every figure). Also the key of the goal answers' job (guidance-answers.js).
  export function impactKey(s) {
    const { guidanceGoals, dismissedEstimates, dismissedUnusualAssumptions, ...rest } = withoutListNames(s);
    return storeContext({ withPlan: false }).taxYear + '|' + JSON.stringify(rest);
  }

  // The test hold (a test-only global, read at schedule time; production never sets it): while it is true, the two guidance
  // jobs (this one and the goal answers') start no timer and run no step; __test_flushGuidance runs them to their end.
  export function guidanceHeld() {
    return globalThis.__testHoldGuidance === true;
  }

  // The memo of `key` in a job's cache `list` (the caller's own array, the most recently used last): the cached one, moved to
  // the end, or fresh(), added (the oldest dropped beyond MEMO_CACHE_MAX). A memo is reused only for an equal key, which
  // covers the tax year and every input that changes a figure. Also the goal answers' cache (guidance-answers.js).
  export function keptMemo(list, key, fresh) {
    const i = list.findIndex((m) => m.key === key);
    if (i >= 0) {
      const m = list[i];
      list.splice(i, 1);
      list.push(m);
      return m;
    }
    const m = fresh();
    list.push(m);
    if (list.length > MEMO_CACHE_MAX) list.shift();
    return m;
  }

  // A field's name as the sidebar shows it: the label's own text plus its no-wrap last word, never the info button's text.
  function fieldLabel(id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (!label) return id;
    let text = '';
    label.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
      else if (n.classList && n.classList.contains('info-nw'))
        n.childNodes.forEach((c) => {
          if (c.nodeType === Node.TEXT_NODE) text += c.textContent;
        });
    });
    return text.trim() || id;
  }

  // The counted ids a person can see (no [hidden] ancestor), and of those the ones in the goals' scope that can get a figure,
  // with the critical reasons.
  function scopeOf(countedIds) {
    const shown = countedIds.filter((id) => {
      const el = document.getElementById(id);
      return el && !el.closest('[hidden]');
    });
    const scope = scopeIds(state);
    const candidates = shown.filter((id) => (scope === null || scope.has(id)) && impactKind(id) !== null);
    const critical = new Map(criticalRows(state).map((r) => [r.id, r.reason]));
    return { shown, candidates, critical };
  }

  // Paints the chips, the ranked list and "Everything else" from what is already measured; runs no projection.
  export function renderGuidance(countedIds) {
    const card = document.getElementById('guidanceCard');
    if (!card) return;
    paintChips();
    const { shown: shownIds, candidates, critical } = scopeOf(countedIds);
    const rows = [];
    candidates.forEach((id, order) => {
      if (BASIC_IDS.includes(id)) {
        rows.push({ id, impact: null, reason: BASIC_REASON, rank: Infinity, order });
        return;
      }
      if (critical.has(id)) {
        rows.push({ id, impact: null, reason: critical.get(id), rank: IMPACT_RULES.criticalRank, order });
        return;
      }
      const x = shown.setup === null || !shown.values.has(id) ? null : shown.values.get(id);
      if (x === null) rows.push({ id, impact: null, reason: null, rank: -1, order });
      else if (x >= IMPACT_RULES.minShown) rows.push({ id, impact: shownImpact(x), reason: null, rank: x, order });
    });
    // Two basics both rank Infinity (Infinity - Infinity is NaN), so they fall through to sidebar order.
    rows.sort((a, b) => b.rank - a.rank || a.order - b.order);
    lastRanked = rows.map(({ id, impact, reason }) => ({ id, impact, reason }));
    const rankedSet = new Set(lastRanked.map((r) => r.id));
    lastOther = shownIds.filter((id) => !rankedSet.has(id));

    const list = document.getElementById('guidanceList');
    list.classList.toggle('measuring', job !== null || impactKey(state) !== shown.key);
    // A row button that has the focus gets it back after the repaint.
    const active = document.activeElement;
    const focusId = active && list.contains(active) ? active.dataset?.field : undefined;
    list.replaceChildren();
    document.getElementById('guidanceCount').textContent = `(${lastRanked.length} of ${shownIds.length} estimated)`;
    document.getElementById('guidanceReviewWrap').hidden = lastRanked.length === 0;
    if (lastRanked.length === 0) {
      const li = document.createElement('li');
      li.className = 'guidance-empty';
      li.textContent = shownIds.length === 0 ? 'All your numbers are filled in.' : 'Nothing in scope is still estimated.';
      list.append(li);
    }
    lastRanked.forEach((r, i) => {
      const li = document.createElement('li');
      li.hidden = !showAll && i >= SHOWN_ROWS;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'guidance-field';
      btn.dataset.field = r.id;
      btn.textContent = fieldLabel(r.id);
      const why = document.createElement('span');
      why.className = 'guidance-why';
      why.textContent = ' — ' + whyText(r);
      li.append(btn, why);
      list.append(li);
    });
    if (focusId) list.querySelector(`[data-field="${focusId}"]`)?.focus({ preventScroll: true });
    const more = document.getElementById('guidanceMoreBtn');
    const beyond = lastRanked.length - SHOWN_ROWS;
    more.hidden = beyond <= 0;
    more.textContent = beyond <= 0 ? '' : showAll ? 'Show fewer' : `Show ${beyond} more`;

    const other = document.getElementById('guidanceOther');
    const n = lastOther.length;
    other.hidden = n === 0;
    document.getElementById('guidanceOtherSummary').textContent = `Everything else (${n} ${n === 1 ? 'field' : 'fields'})`;
    const otherList = document.getElementById('guidanceOtherList');
    otherList.replaceChildren(
      ...lastOther.map((id) => {
        const li = document.createElement('li');
        li.textContent = fieldLabel(id);
        return li;
      }),
    );
  }

  function whyText(r) {
    if (r.reason !== null) return r.reason;
    if (r.impact !== null) return `about ±${compact(r.impact)}/yr on your spending room`;
    if (shown.setup === null) return 'effect not measured';
    return job !== null ? 'measuring…' : 'not measured yet';
  }

  function paintChips() {
    const box = document.getElementById('guidanceGoals');
    const on = new Set(chosenGoals(state).map((g) => g.key));
    const locked = currentMarketScenarioText() !== null || movePreview !== null;
    for (const g of GOALS) {
      let chip = box.querySelector(`[data-goal="${g.key}"]`);
      if (!chip) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'guidance-chip';
        chip.dataset.goal = g.key;
        chip.textContent = g.label;
        box.append(chip);
      }
      chip.hidden = g.couples && !!state.singlePerson;
      chip.setAttribute('aria-pressed', String(on.has(g.key)));
      chip.disabled = locked;
      chip.title = locked ? (movePreview !== null ? PREVIEW_LOCKED_TITLE : LOCKED_TITLE) : '';
    }
  }

  // The walk order: every ranked row's id, as last painted (from the display memo).
  export function rankedFieldIds() {
    return lastRanked.map((r) => r.id);
  }

  // Copies the working memo into the display memo.
  function commitShown() {
    shown = { key: memo.key, setup: memo.setup, values: new Map(memo.values) };
  }

  // Starts the measuring job when a field in scope is unmeasured for the current inputs (its first slice measures the setup
  // when that is not yet measured). With nothing to measure, it commits the working memo for display and repaints the card if
  // that changed what is shown. Never while the US bracket search is pending: the deferred pass that runs it calls this again.
  export function scheduleFieldImpacts() {
    if (searchPending()) return;
    const key = impactKey(state);
    if (memo.key !== key) memo = keptMemo(memos, key, () => ({ key, setup: undefined, values: new Map() }));
    const { candidates, critical } = scopeOf(computeCountedEstimateIds());
    const queue = candidates.filter((id) => !critical.has(id) && !BASIC_IDS.includes(id) && !memo.values.has(id));
    if (queue.length === 0) {
      if (job !== null) {
        job = null;
        gen++;
      }
      if (shown.key !== memo.key || shown.setup !== memo.setup || shown.values.size !== memo.values.size) {
        commitShown();
        renderGuidance(computeCountedEstimateIds());
        document.dispatchEvent(new CustomEvent('guidance-change'));
      }
      return;
    }
    gen++;
    const base = state.guardrailsEnabled ? { ...state, guardrailsEnabled: false } : state;
    job = { gen, key, state, ctxFor: stateContextFor(), base, queue };
    const g = gen;
    // Under the test hold the job waits for the test's flush (runGuidanceJobToEnd).
    if (!guidanceHeld()) setTimeout(() => step(g), 0);
  }

  // One slice of the job: the setup alone, or queued fields for up to SLICE_MS (no limit when `sync`). A changed state or key
  // stops the job without committing; an emptied queue commits (repaints the card and dispatches guidance-change).
  function step(g, sync = false) {
    if (!job || job.gen !== g) return;
    if (state !== job.state || impactKey(state) !== job.key) {
      job = null;
      return;
    }
    if (memo.setup === undefined) {
      memo.setup = impactSetup(job.base, job.ctxFor);
    } else {
      const t0 = performance.now();
      while (job.queue.length && (sync || performance.now() - t0 < SLICE_MS)) {
        const id = job.queue.shift();
        memo.values.set(id, memo.setup ? fieldImpact(job.base, id, impactKind(id), impactBounds(id), memo.setup, job.ctxFor) : null);
      }
      if (!job.queue.length) {
        job = null;
        commitShown();
        renderGuidance(computeCountedEstimateIds());
        document.dispatchEvent(new CustomEvent('guidance-change'));
        return;
      }
    }
    if (!sync && !guidanceHeld()) setTimeout(() => step(g), 0);
  }

  // Runs the job to its end at once, scheduling no timer (the test hook).
  export function runGuidanceJobToEnd() {
    while (job) step(job.gen, true);
  }

  // The only writer of state.guidanceGoals: a chip, or the wizard's goal step (fromSetup), which also turns the goal's feature
  // on or off. Never renders the projection and takes no undo snapshot; does nothing under a market scenario or while a move is
  // previewed.
  export function setGoal(key, on, { fromSetup = false } = {}) {
    if (currentMarketScenarioText() !== null || movePreview !== null) return;
    state.guidanceGoals = normalizeGoals(on ? [...state.guidanceGoals, key] : state.guidanceGoals.filter((k) => k !== key));
    if (fromSetup) {
      const feature = GOALS.find((g) => g.key === key)?.feature;
      const box = feature ? document.getElementById(feature) : null;
      if (box && on && !box.checked) {
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        turnedOnBySetup.add(feature);
      } else if (box && !on && turnedOnBySetup.has(feature)) {
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        turnedOnBySetup.delete(feature);
      }
    }
    dismissFirstRunBanner();
    saveInputs();
    const counted = computeCountedEstimateIds();
    renderEstimateBadges(counted);
    // Scheduled before the paint, so rows the new scope adds read "measuring…" while their job runs.
    scheduleFieldImpacts();
    renderGuidance(counted);
    document.dispatchEvent(new CustomEvent('guidance-change'));
  }

  // The wizard calls this when it opens: the features it turned on before are no longer its to turn off.
  export function resetSetupFeatures() {
    turnedOnBySetup.clear();
  }

  // The hook's view: the goals, the ranked rows (as painted, from the display memo), the other ids, whether a job is running
  // and the setup as measured in the working memo.
  export function guidanceSnapshot() {
    let setupState;
    if (memo.setup === undefined) setupState = 'none';
    else if (memo.setup === null) setupState = 'no-slope';
    else {
      const { runs, ...rest } = memo.setup;
      setupState = rest;
    }
    return {
      goals: [...state.guidanceGoals],
      ranked: lastRanked.map((r) => ({ ...r })),
      other: [...lastOther],
      pending: job !== null,
      setupState,
    };
  }

  export function wireGuidance() {
    const card = document.getElementById('guidanceCard');
    card.addEventListener('click', (e) => {
      const chip = e.target.closest('.guidance-chip');
      if (chip && !chip.disabled) {
        setGoal(chip.dataset.goal, chip.getAttribute('aria-pressed') !== 'true');
        return;
      }
      if (e.target.closest('#guidanceMoreBtn')) {
        showAll = !showAll;
        renderGuidance(computeCountedEstimateIds());
      }
    });
  }
