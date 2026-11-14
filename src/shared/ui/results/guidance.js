// The guidance card: goal chips, the fields worth filling in next, and the background job that measures them

import { IMPACT_RULES, fieldImpact, impactSetup, shownImpact } from '../../core/analysis/field-impact.js';
import { compact } from '../../core/format/numbers.js';
import { chosenGoals, criticalRows, impactBounds, impactKind, normalizeGoals, scopeIds } from '../../core/inputs/guidance-scope.js';
import { state } from '../../core/store.js';
import { computeCountedEstimateIds, renderEstimateBadges } from '../inputs/estimate-badges.js';
import { saveInputs } from '../plans/autosave.js';
import { dismissFirstRunBanner } from '../plans/saved-plan.js';
import { currentMarketScenarioText } from './market-scenario-banner.js';
import { stateContextFor } from './state-context.js';
import { GOALS } from '#country/core/seam-GUIDANCE_FIELDS';
import { searchPending } from '#country/core/seam-searchPending';
import { storeContext } from '#country/core/seam-storeContext';

  const SHOWN_ROWS = 5;
  const SLICE_MS = 40;
  const LOCKED_TITLE = 'Revert the market scenario to change your goals.';
  // load-time: an object literal holding an empty Map (a global constructor); reads nothing.
  // What is measured for one key (impactKey): setup undefined is not yet measured, null is no slope (every value null), else
  // impactSetup's result; values maps a field id to its fieldImpact (null under a null setup). Assigned only in this module.
  let memo = { key: null, setup: undefined, values: new Map() };
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

  // The memo key: the tax year and the inputs, without the goals and the two dismissal lists (a chip or a dismissal keeps
  // every figure).
  function impactKey(s) {
    const { guidanceGoals, dismissedEstimates, dismissedUnusualAssumptions, ...rest } = s;
    return storeContext({ withPlan: false }).taxYear + '|' + JSON.stringify(rest);
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
    const { shown, candidates, critical } = scopeOf(countedIds);
    const rows = [];
    candidates.forEach((id, order) => {
      if (critical.has(id)) {
        rows.push({ id, impact: null, reason: critical.get(id), rank: IMPACT_RULES.criticalRank, order });
        return;
      }
      const x = memo.setup === null || !memo.values.has(id) ? null : memo.values.get(id);
      if (x === null) rows.push({ id, impact: null, reason: null, rank: -1, order });
      else if (x >= IMPACT_RULES.minShown) rows.push({ id, impact: shownImpact(x), reason: null, rank: x, order });
    });
    rows.sort((a, b) => b.rank - a.rank || a.order - b.order);
    lastRanked = rows.map(({ id, impact, reason }) => ({ id, impact, reason }));
    const rankedSet = new Set(lastRanked.map((r) => r.id));
    lastOther = shown.filter((id) => !rankedSet.has(id));

    const list = document.getElementById('guidanceList');
    list.classList.toggle('measuring', job !== null || impactKey(state) !== memo.key);
    list.replaceChildren();
    document.getElementById('guidanceCount').textContent = `(${lastRanked.length} of ${shown.length} estimated)`;
    document.getElementById('reviewEstimatesBtn').hidden = lastRanked.length === 0;
    if (lastRanked.length === 0) {
      const li = document.createElement('li');
      li.className = 'guidance-empty';
      li.textContent = shown.length === 0 ? 'All your numbers are filled in.' : 'Nothing in scope is still estimated.';
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
    if (memo.setup === null) return 'effect not measured';
    return job !== null ? 'measuring…' : 'not measured yet';
  }

  function paintChips() {
    const box = document.getElementById('guidanceGoals');
    const on = new Set(chosenGoals(state).map((g) => g.key));
    const locked = currentMarketScenarioText() !== null;
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
      chip.title = locked ? LOCKED_TITLE : '';
    }
  }

  // The walk order: every ranked row's id, as last painted.
  export function rankedFieldIds() {
    return lastRanked.map((r) => r.id);
  }

  // Starts the measuring job when anything in scope is unmeasured for the current inputs; otherwise does nothing. Never while
  // the US bracket search is pending: the deferred pass that runs it calls this again.
  export function scheduleFieldImpacts() {
    if (searchPending()) return;
    const key = impactKey(state);
    if (memo.key !== key) memo = { key, setup: undefined, values: new Map() };
    const { candidates, critical } = scopeOf(computeCountedEstimateIds());
    const queue = candidates.filter((id) => !critical.has(id) && !memo.values.has(id));
    if (memo.setup !== undefined && queue.length === 0) return;
    gen++;
    const base = state.guardrailsEnabled ? { ...state, guardrailsEnabled: false } : state;
    job = { gen, key, state, ctxFor: stateContextFor(), base, queue };
    const g = gen;
    setTimeout(() => step(g), 0);
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
        renderGuidance(computeCountedEstimateIds());
        document.dispatchEvent(new CustomEvent('guidance-change'));
        return;
      }
    }
    if (!sync) setTimeout(() => step(g), 0);
  }

  // Runs the job to its end at once, scheduling no timer (the test hook).
  export function runGuidanceJobToEnd() {
    while (job) step(job.gen, true);
  }

  // The only writer of state.guidanceGoals: a chip, or the wizard's goal step (fromSetup), which also turns the goal's feature
  // on or off. Never renders the projection and takes no undo snapshot; does nothing under a market scenario.
  export function setGoal(key, on, { fromSetup = false } = {}) {
    if (currentMarketScenarioText() !== null) return;
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
    renderGuidance(counted);
    scheduleFieldImpacts();
    document.dispatchEvent(new CustomEvent('guidance-change'));
  }

  // The wizard calls this when it opens: the features it turned on before are no longer its to turn off.
  export function resetSetupFeatures() {
    turnedOnBySetup.clear();
  }

  // The hook's view: the goals, the ranked rows, the other ids, whether a job is running and the setup as measured.
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
