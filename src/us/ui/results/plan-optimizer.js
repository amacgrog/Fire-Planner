// The plan optimizer card (Batch 5 step 4a, spec 4.4-4.6): Search (optimizePlan), the success rates with and without the plan, Apply / Clear of state.storedPlan and its status

import { money } from '../../../shared/core/format/numbers.js';
import { fnv1a32, monteCarloSummaryWith, runHistoricalCyclesWith } from '../../../shared/core/projection/simulate.js';
import { mcPathCount } from '../../../shared/core/chart-prefs.js';
import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { snapshotForUndo } from '../../../shared/ui/plans/undo.js';
import { cliffPlanStore } from '../../core/cliff-plan-store.js';
import { cliffPlanSummary, storeRunContext } from '../../core/cliff-plan/planning.js';
import { isValidStoredPlan } from '../../core/cliff-plan/plan-shape.js';
import { optimizePlan } from '../../core/optimizer/plan-search.js';
import { applyGateOpen } from '../../core/optimizer/objectives.js';
import { currentYear } from '../../core/tax-year.js';
import { normalizeState } from '../inputs/normalize-state.js';
import { render } from './render.js';

  // The last search the card shows (Apply stores its plan), the time it took (search and the four rates, ms) and the
  // fingerprint memo of the status render: the JSON it hashed and the hash.
  let lastPlanSearch = null;
  let lastPlanSearchMs = null;
  const fingerprintMemo = { json: null, hash: null };

  const late = (x) => (x === null || x === undefined ? Infinity : x);
  const hasKeys = (o) => !!o && Object.keys(o).length > 0;
  const lastsTo = (age) => (age === null || age === undefined ? 'the end of the plan' : `age ${age}`);
  const rateText = (r) => (r === null || r === undefined ? '—' : `${(r * 100).toFixed(0)}%`);
  const multText = (m) => `×${m}`;

  // The JSON a stored plan's fingerprint hashes: normalizeState(s) without the stored plan and the two dismissal lists.
  function fingerprintJson(s) {
    const { storedPlan, dismissedEstimates, dismissedUnusualAssumptions, ...rest } = normalizeState(s);
    return JSON.stringify(rest);
  }
  // What a stored plan was made for (spec 4.4): the fnv1a32 hash of fingerprintJson, as a string.
  export function storedPlanFingerprint(s) {
    return String(fnv1a32(fingerprintJson(s)));
  }
  // The status render's fingerprint of the live state, memoized on the JSON it stringifies (compared before hashing).
  function liveFingerprint() {
    const json = fingerprintJson(state);
    if (json !== fingerprintMemo.json) {
      fingerprintMemo.json = json;
      fingerprintMemo.hash = String(fnv1a32(json));
    }
    return fingerprintMemo.hash;
  }

  // The historical and Monte Carlo success rates of one plan on Optimize's working copy (no stored plan, no applied schedules).
  function successRates(copy, plan) {
    const ctx = storeRunContext(copy, { plan, planMode: 'apply' });
    return { hist: runHistoricalCyclesWith(ctx).successRate, mc: monteCarloSummaryWith(ctx, mcPathCount).successRate };
  }
  // The state as Apply leaves it before writing the plan: the applied schedules that have keys set to null (a shallow copy).
  const withoutSchedules = (s) => ({
    ...s,
    appliedRothSchedule: hasKeys(s.appliedRothSchedule) ? null : s.appliedRothSchedule,
    appliedMixSchedule: hasKeys(s.appliedMixSchedule) ? null : s.appliedMixSchedule,
  });
  // What a search was made for: the tax year and the fingerprint Apply would store for the live inputs ('<year>|<hash>').
  const searchKey = () => currentYear + '|' + storedPlanFingerprint(withoutSchedules(state));
  // The line shown (and Apply refused) when the inputs or the tax year changed since the search drawn in the card.
  const SEARCH_STALE = 'Your inputs changed since this search; search again.';
  // The card's search: optimizePlan on the store's inputs, then the rates with the found plan and with the automatic plan.
  // `searchedFor`: searchKey() for these inputs, so Apply (and the status render) can tell the inputs or the tax year changed
  // since the search.
  export function searchPlan(objective) {
    const t0 = performance.now();
    const result = optimizePlan(storeRunContext(state), { objective });
    const copy = { ...state, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null };
    const rates = result.plan
      ? { with: successRates(copy, result.plan), without: successRates(copy, result.base.plan) }
      : null;
    lastPlanSearch = { ...result, rates, searchedFor: searchKey() };
    lastPlanSearchMs = performance.now() - t0;
    return lastPlanSearch;
  }
  // What runs today (current when the guard uses it, else the automatic plan) and whether the found plan is offered (ruling 8):
  // a search win, or a win of the applied plan while the guard does not use it (`reapply`: the same plan re-stored under the
  // searched objective, measured against the automatic plan, which runs today), when it gains more than $1 or lasts longer or
  // first draws on home equity later.
  function offerOf(r) {
    const reapply = !!r.plan && r.winner === 'current' && !!r.current && !r.current.inUse;
    if (!r.plan || (r.winner !== 'search' && !reapply)) return { offer: false, ref: null, longer: false, laterHome: false, reapply: false };
    const ref = r.current && r.current.inUse ? r.current : r.base,
      longer = late(r.measure.depletedAge) > late(ref.depletedAge),
      laterHome = late(r.measure.homeDrawAge) > late(ref.homeDrawAge);
    return { offer: applyGateOpen(r.gain) || longer || laterHome, ref, longer, laterHome, reapply };
  }

  // Draws a search result into the card.
  function renderPlanSearch(r) {
    const resultEl = document.getElementById('planOptimizerResult'),
      summaryEl = document.getElementById('planOptimizerSummary'),
      planEl = document.getElementById('planOptimizerPlanText'),
      multEl = document.getElementById('planOptimizerMult'),
      ratesEl = document.getElementById('planOptimizerRates'),
      replaceEl = document.getElementById('planOptimizerReplaceNote'),
      applyBtn = document.getElementById('planOptimizerApplyBtn'),
      applyNote = document.getElementById('planOptimizerApplyNote');
    resultEl.hidden = false;
    applyNote.textContent = '';
    if (!r.plan) {
      summaryEl.textContent = 'The cliff plan is off, so there is no plan to search.';
      for (const el of [planEl, multEl]) el.textContent = '';
      ratesEl.innerHTML = '';
      replaceEl.hidden = true;
      applyBtn.hidden = true;
      return;
    }
    const { offer, ref, longer, laterHome, reapply } = offerOf(r);
    const inUse = r.current && r.current.inUse;
    const parts = [];
    if (offer) {
      if (applyGateOpen(r.gain))
        parts.push(r.objective === 'lifetimeCost'
          ? `costs an estimated <b>${money(r.gain)}</b> less lifetime tax + healthcare (today's dollars)`
          : `leaves an estimated <b>${money(r.gain)}</b> more after-tax end value (today's dollars)`);
      if (longer) parts.push(`lasts longer (to ${lastsTo(r.measure.depletedAge)} instead of ${lastsTo(ref.depletedAge)})`);
      if (laterHome) parts.push(`first draws on home equity later (${r.measure.homeDrawAge === null ? 'never' : `at ${r.measure.homeDrawAge}`} instead of at ${ref.homeDrawAge})`);
    }
    if (!offer) {
      summaryEl.textContent = inUse
        ? 'Your applied plan is already the best this search found.'
        : 'The automatic plan is already the best this search found.';
    } else if (reapply) {
      summaryEl.innerHTML = `Your applied plan is not in use now (the automatic plan is). On this objective it ${parts.join(', and ')}, compared with the automatic plan; re-applying it under this objective would put it in use.`;
    } else {
      const against = inUse ? 'your applied plan' : 'the automatic plan';
      summaryEl.innerHTML = `Found a plan that ${parts.join(', and ')}, compared with ${against}.`;
    }
    // The stored plan's own summary when it wins (a report shaped for it: no candidates or brackets, its bracket honoured and
    // whether conversions apply, so no clause of the automatic plan's planning shows); else the winner's planning report.
    const summaryReport = r.winner === 'current'
      ? { stored: { used: true, bracketHonoured: r.current.bracketHonoured, converts: r.current.converts } }
      : r.report;
    planEl.textContent = cliffPlanSummary(r.plan, summaryReport).replace(/^(Cliff|Applied) plan: /, 'The plan found: ');
    const m = r.mult || [1, 1, 1];
    multEl.textContent = `How strongly the plan weighs future tax when choosing the years to stay under or fill a line: before 65 ${multText(m[0])}, 65 to RMDs ${multText(m[1])}, RMD years ${multText(m[2])}.`;
    ratesEl.innerHTML = [
      ['Historical (1928–2025 starts)', r.rates.with.hist, r.rates.without.hist],
      [`Monte Carlo (${mcPathCount.toLocaleString()} paths)`, r.rates.with.mc, r.rates.without.mc],
    ].map(([label, a, b]) => `<tr><td>${label}</td><td>${rateText(a)}</td><td>${rateText(b)}</td></tr>`).join('');
    // The legacy schedules (spec 4.5): Apply replaces them; say so before the button, and when they last longer or first
    // draw on the house later than the found plan, say that too.
    if (offer && r.legacy) {
      const legacyBetter = late(r.legacy.depletedAge) > late(r.measure.depletedAge) || late(r.legacy.homeDrawAge) > late(r.measure.homeDrawAge);
      replaceEl.textContent = legacyBetter
        ? 'Your applied schedule lasts longer (or draws on home equity later) than this plan; applying it replaces that schedule.'
        : 'Applying replaces your applied conversion / withdrawal schedule.';
      replaceEl.hidden = false;
    } else {
      replaceEl.hidden = true;
      replaceEl.textContent = '';
    }
    applyBtn.hidden = !offer;
  }

  // Apply (spec 4.6): one undo snapshot; the applied schedules that have keys set to null; the found plan stored as a JSON
  // copy (never the engine's object: a plan's intents can be shared), its fingerprint taken after the schedules are cleared.
  // A result whose inputs changed since its search is not applied (the card asks for a new search): the plan would otherwise
  // be stored as made for inputs it was not made for.
  export function applyStoredPlan(result = lastPlanSearch) {
    if (!result || !result.plan) return false;
    if (result.searchedFor !== searchKey()) {
      document.getElementById('planOptimizerApplyBtn').hidden = true;
      document.getElementById('planOptimizerApplyNote').textContent = SEARCH_STALE;
      return false;
    }
    const plan = JSON.parse(JSON.stringify(result.plan));
    const summary = {
      gain: result.gain,
      success: { hist: [result.rates.with.hist, result.rates.without.hist], mc: [result.rates.with.mc, result.rates.without.mc] },
    };
    const candidate = { v: 1, plan, objective: result.objective, mult: (result.mult || [1, 1, 1]).slice(), madeFor: '', taxYear: currentYear, summary };
    if (!isValidStoredPlan(candidate)) return false;
    snapshotForUndo('Applied plan');
    if (hasKeys(state.appliedRothSchedule)) state.appliedRothSchedule = null;
    if (hasKeys(state.appliedMixSchedule)) state.appliedMixSchedule = null;
    candidate.madeFor = storedPlanFingerprint(state);
    state.storedPlan = candidate;
    document.getElementById('planOptimizerApplyBtn').hidden = true;
    document.getElementById('planOptimizerApplyNote').textContent = 'Applied.';
    document.getElementById('planOptimizerReplaceNote').hidden = true;
    render();
    saveInputs();
    return true;
  }
  // Clear (spec 4.4): one undo snapshot, no stored plan.
  export function clearStoredPlan() {
    snapshotForUndo('Cleared applied plan');
    state.storedPlan = null;
    render();
    saveInputs();
  }

  // The drawn search result against the live inputs: when they (or the tax year) changed since the search, Apply hides and the
  // card says to search again; when they are back to the searched ones, Apply shows again as the search drew it. Only while a
  // result is drawn and Apply is offered or was refused for staleness (never after "Applied.").
  function renderSearchStaleness() {
    const r = lastPlanSearch;
    if (!r || !r.plan || document.getElementById('planOptimizerResult').hidden) return;
    const applyBtn = document.getElementById('planOptimizerApplyBtn'),
      applyNote = document.getElementById('planOptimizerApplyNote');
    const refused = applyNote.textContent === SEARCH_STALE;
    if (applyBtn.hidden && !refused) return;
    if (r.searchedFor !== searchKey()) {
      applyBtn.hidden = true;
      applyNote.textContent = SEARCH_STALE;
    } else if (refused) {
      applyBtn.hidden = !offerOf(r).offer;
      applyNote.textContent = '';
    }
  }

  // The status line of the stored plan (spec 4.4), drawn by every render (the light one too): the guard's verdict on the
  // current inputs (cliffPlanStore.report.stored, for the state the plan was made for) and whether it is stale (the inputs'
  // fingerprint or the tax year differ from what it was made for).
  export function renderPlanOptimizerStatus() {
    renderSearchStaleness();
    const box = document.getElementById('planOptimizerStatus'),
      textEl = document.getElementById('planOptimizerStatusText');
    const sp = state.storedPlan;
    if (!sp) {
      box.hidden = true;
      textEl.textContent = '';
      return;
    }
    box.hidden = false;
    if (!state.cliffGuardEnabled) {
      textEl.textContent = 'The cliff plan is off, so the applied plan is not used.';
      return;
    }
    const report = cliffPlanStore.forState === state ? cliffPlanStore.report : null,
      stored = report && report.stored;
    const stale = liveFingerprint() !== sp.madeFor || sp.taxYear !== currentYear;
    if (stored && stored.used) {
      let text = !stale
        ? 'Applied plan in use.'
        : stored.reason === 'tie'
          ? 'Applied plan in use. It was computed for different inputs; it still does at least as well as the automatic plan on these inputs. Re-run Optimize to refine it.'
          : 'Applied plan in use. It was computed for different inputs; it still beats the automatic plan on these inputs. Re-run Optimize to refine it.';
      if (stored.bracketHonoured === false && stored.converts)
        text += ` Your conversion bracket changed since this plan was applied; it now converts at your ${state.rothConvBracket}%.`;
      textEl.textContent = text;
      return;
    }
    const reason = stored
      ? stored.reason === 'depletes' ? ' (it runs out earlier)' : stored.reason === 'home' ? ' (it draws on home equity earlier)' : stored.reason === 'score' ? ' (it scores lower)' : ''
      : '';
    textEl.textContent = stale
      ? `Your applied plan was computed for different inputs and no longer beats the automatic plan, which is in use. Re-run Optimize.${reason}`
      : `Your applied plan does not beat the automatic plan on these inputs, which is in use. Re-run Optimize.${reason}`;
  }

  // What the card shows (tests): the status line, the result's lines, whether Apply shows, the rates as drawn, the last search's
  // winner and its wall time.
  export function planOptimizerCardState() {
    const text = (id) => document.getElementById(id).textContent;
    return {
      statusHidden: document.getElementById('planOptimizerStatus').hidden,
      status: text('planOptimizerStatusText'),
      resultHidden: document.getElementById('planOptimizerResult').hidden,
      summary: text('planOptimizerSummary'),
      planText: text('planOptimizerPlanText'),
      mult: text('planOptimizerMult'),
      rates: [...document.querySelectorAll('#planOptimizerRates tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
      replaceNote: document.getElementById('planOptimizerReplaceNote').hidden ? '' : text('planOptimizerReplaceNote'),
      applyShown: !document.getElementById('planOptimizerApplyBtn').hidden,
      applyNote: text('planOptimizerApplyNote'),
      winner: lastPlanSearch ? lastPlanSearch.winner : null,
      ms: lastPlanSearchMs,
    };
  }

  export function wirePlanOptimizer() {
    // Deliberately not run by render(): a search is several seconds of plannings, so it runs only on a click, after one
    // frame so the "Searching…" label paints before the synchronous search blocks the main thread.
    document.getElementById('planOptimizerSearchBtn').addEventListener('click', (e) => {
      const btn = e.target;
      const originalLabel = btn.textContent;
      const checked = document.querySelector('input[name="planObjective"]:checked');
      const objective = checked ? checked.value : 'endValue';
      btn.disabled = true;
      btn.textContent = 'Searching…';
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            renderPlanSearch(searchPlan(objective));
          } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
          }
        }, 0);
      });
    });
    document.getElementById('planOptimizerApplyBtn').addEventListener('click', () => {
      applyStoredPlan();
    });
    document.getElementById('planOptimizerClearBtn').addEventListener('click', () => {
      clearStoredPlan();
    });
  }
  // The test hook's search: the card's search, drawn into the card as a click draws it.
  export function searchPlanAndRender(objective) {
    const r = searchPlan(objective);
    renderPlanSearch(r);
    return r;
  }
