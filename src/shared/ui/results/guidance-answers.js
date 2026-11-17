// The moves card and the goal answers under the verdict, and the background job that measures them

import { houseVariants, retireAnswerSteps, roomChangeSteps, survivorVariants } from '../../core/analysis/goal-answers.js';
import { cutSpendingDelta, moveOutcome, rankMoves, retireLaterSteps, retireShift } from '../../core/analysis/moves.js';
import { projectionVerdictSteps } from '../../core/analysis/projection-verdict.js';
import { cloneState } from '../../core/analysis/scenario-helpers.js';
import { drainSteps, spendingRoomSteps, spendingVariant } from '../../core/analysis/spending-room.js';
import {
  NO_MOVES_TEXT, ageScale, houseAnswerText, legacyAnswerText, moveText, movesHeadText, retireAnswerText, spendAnswerText, survivorAnswerText,
} from '../../core/format/answer-text.js';
import { chosenGoals } from '../../core/inputs/guidance-scope.js';
import { simulateWith } from '../../core/projection/runs.js';
import { state } from '../../core/store.js';
import { revealField } from '../inputs/estimate-review.js';
import { setMobileView } from '../layout/mobile-view.js';
import { movePreview } from '../plans/move-preview-snapshot.js';
import { tryMove } from '../plans/move-preview.js';
import { guidanceHeld, impactKey, keptMemo } from './guidance.js';
import { currentMarketScenarioText } from './market-scenario-banner.js';
import { verdictRun } from './plan-verdict.js';
import { stateContextFor } from './state-context.js';
import { GOALS } from '#country/core/seam-GUIDANCE_FIELDS';
import { LEGACY_PHRASE, legacyValue } from '#country/core/seam-legacyValue';
import { MOVE_LEVERS } from '#country/core/seam-MOVE_LEVERS';
import { ownPlanContextFor } from '#country/core/seam-ownPlanContextFor';
import { searchPending } from '#country/core/seam-searchPending';
import { COUNTRY_ANSWERS } from '#country/ui/seam-COUNTRY_ANSWERS';
import { normalizeState } from '#country/ui/seam-normalizeState';

  const SLICE_MS = 40;
  const SLICE_STEPS = 8;
  const WORKING = 'Working it out…';
  const MEASURING_TITLE = 'Still measuring this change…';
  const PREVIEW_TITLE = 'Keep or revert the change you are previewing first.';
  const SCENARIO_TITLE = 'Revert the market scenario to try a change.';
  // The links of the shared goals (the country goals' units give their own).
  const LINKS = {
    retire: { target: 'field:retireAgeA', label: 'Change your retirement age →' },
    spend: { target: 'field:spending', label: 'Change your spending →' },
    house: { target: 'field:ownBtn', label: 'Housing settings →' },
    survivor: { target: 'field:survivorEnabled', label: 'Model a death in the plan →' },
    legacy: { target: 'card:mainChartCard', label: 'See the chart →' },
  };
  // load-time: an object literal holding an empty Map (global names only); reads nothing.
  // What is measured for one key (impactKey): base is the projection verdict of the inputs (undefined: not yet measured), moves
  // the ranked moves as shown ({ key, what, result, fixes, gain, patch, verdict }; [] on a Comfortable plan), answers maps a goal
  // to { text, link }, roomOff the room with guardrails off (measured once, under guardrails only); baseFrom says who measured
  // the base ('verdict': the verdict card's own result, reused; 'job'). Assigned only in this module.
  let memo = { key: null, scale: null, base: undefined, baseFrom: null, moves: undefined, answers: new Map(), roomOff: undefined };
  // The last few memos by key (keptMemo: at most four), the most recently used last, so a Try and its Revert keep each side's measures.
  // Assigned only in this module (its contents through keptMemo).
  const memos = [];
  // Every step a unit took (the test hook's run counter). Assigned only in this module.
  let unitSteps = 0;
  // load-time: an object literal holding an empty Map (global names only); reads nothing.
  // The display memo: a copy of the working memo, committed each time a unit finishes, so each answer shows as soon as it is
  // measured and a change keeps the old ones (dimmed) until the next job commits. Assigned only in this module.
  let shown = { key: null, scale: null, base: undefined, baseFrom: null, moves: undefined, answers: new Map() };
  // The running job ({ gen, key, state, ctxFor, unit, planNext }) or null; gen tells a live timer from a stale one. unit is the
  // unit being stepped ({ it, commit }) or null; planNext is set when the unit yielded 'plan-next' (its next step plans).
  let job = null;
  let gen = 0;

  // The room with guardrails off (the spending answer's and the housing answer's base under guardrails), measured once per key.
  function* roomOffSteps(s, ctxFor) {
    if (memo.roomOff !== undefined) return memo.roomOff;
    const off = { ...s, guardrailsEnabled: false };
    const selected = simulateWith(ctxFor(off));
    yield 'run';
    memo.roomOff = (yield* spendingRoomSteps(selected, off, ctxFor)).room;
    return memo.roomOff;
  }

  // The shared goals' units: function* (state, ctxFor, base) -> { text, link }, base being the base unit's verdict.
  const SHARED_UNITS = {
    retire: function* (s, ctxFor, base) {
      return { text: retireAnswerText(s, yield* retireAnswerSteps(s, ctxFor, base)), link: LINKS.retire };
    },
    spend: function* (s, ctxFor, base) {
      const offRoom = base.guardrails ? yield* roomOffSteps(s, ctxFor) : null;
      return { text: spendAnswerText(s, base, offRoom), link: LINKS.spend };
    },
    house: function* (s, ctxFor, base) {
      const variants = houseVariants(s);
      if (!variants.length) return { text: 'No housing change is tested for this plan.', link: LINKS.house };
      const roomBase = base.guardrails ? { ...s, guardrailsEnabled: false } : s;
      const baseRoom = base.guardrails ? yield* roomOffSteps(s, ctxFor) : base.room;
      const changes = [];
      for (const v of variants) {
        changes.push({ key: v.key, delta: yield* roomChangeSteps(roomBase, { ...roomBase, ...v.patch }, ctxFor, baseRoom) });
      }
      return { text: houseAnswerText(s, changes), link: LINKS.house };
    },
    survivor: function* (s, ctxFor) {
      const rows = [];
      for (const v of survivorVariants(s)) rows.push({ partner: v.partner, verdict: yield* projectionVerdictSteps({ ...s, ...v.patch }, ctxFor) });
      return { text: survivorAnswerText(s, rows), link: LINKS.survivor };
    },
    // From the base unit's dashboard run: no run.
    legacy: function* (s, ctxFor, base) {
      return { text: legacyAnswerText(LEGACY_PHRASE, legacyValue(ctxFor(s), base.selected), ageScale(s), base.depletedAge), link: LINKS.legacy };
    },
  };

  // The moves of a Tight or Short plan, ranked, with their sentences: retire later (found under the held plan), the spending cut,
  // the country's levers. Each move's verdict is measured with its own inputs' plan (the plan Try will keep), its search alone
  // in its slice.
  function* movesSteps(s, ctxFor, base) {
    if (base.word === 'comfortable') return [];
    const candidates = [];
    const later = yield* retireLaterSteps(s, ctxFor, base.word);
    if (later) candidates.push({ key: 'retire', label: null, patch: retireShift(s, later.k) });
    const delta = cutSpendingDelta(base);
    if (delta !== null) {
      const cut = spendingVariant(s, delta);
      candidates.push({ key: 'spend', label: null, patch: { spending: cut.spending, spendingTiers: cut.spendingTiers } });
    }
    for (const lever of MOVE_LEVERS) if (lever.when(s)) candidates.push({ key: lever.key, label: lever.label, patch: { [lever.field]: true } });
    const measured = [];
    for (const c of candidates) {
      const v = normalizeState({ ...cloneState(s), ...cloneState(c.patch) });
      yield 'plan-next';
      const f = ownPlanContextFor(v);
      yield 'plan';
      const verdict = yield* projectionVerdictSteps(v, f);
      measured.push({ ...c, verdict, ...moveOutcome(base, verdict) });
    }
    const scale = ageScale(s);
    return rankMoves(measured).map((m) => {
      const { what, result } = moveText(m, s, scale, base);
      const { word, room, cutPct, guardrails } = m.verdict;
      return { key: m.key, what, result, fixes: m.fixes, gain: m.gain, patch: m.patch, verdict: { word, room, cutPct, guardrails } };
    });
  }

  // The moves for a state, measured to the end through the job's own generator (the test hook's path): [] on a Comfortable plan.
  export function evaluateMoves(s, ctxFor) {
    const base = drainSteps(projectionVerdictSteps(s, ctxFor));
    return drainSteps(movesSteps(s, ctxFor, base));
  }

  // The next unmeasured unit for the job's inputs, or null: the base verdict, the moves, then each chosen goal in GOALS order.
  function nextUnit(j) {
    const s = j.state,
      f = j.ctxFor;
    if (memo.base === undefined) {
      return {
        it: projectionVerdictSteps(s, f),
        commit: (v) => {
          memo.base = v;
          memo.baseFrom = 'job';
        },
      };
    }
    if (memo.moves === undefined) return { it: movesSteps(s, f, memo.base), commit: (v) => (memo.moves = v) };
    for (const g of chosenGoals(s)) {
      if (memo.answers.has(g.key)) continue;
      const unit = COUNTRY_ANSWERS[g.key] || SHARED_UNITS[g.key];
      return { it: unit(s, f, memo.base), commit: (v) => memo.answers.set(g.key, v) };
    }
    return null;
  }

  // The verdict card's result for these inputs, when it is provably the base unit's: the same state object, the same key and
  // the same kept plan (US) as the job's context gives the state; else null.
  function verdictSeed(key, ctxFor) {
    const r = verdictRun;
    if (r === null || r.state !== state || r.key !== key) return null;
    return ctxFor(state).plan === r.plan ? r.verdict : null;
  }

  function unmeasured(s) {
    return memo.base === undefined || memo.moves === undefined || chosenGoals(s).some((g) => !memo.answers.has(g.key));
  }

  function commitShown() {
    shown = { key: memo.key, scale: memo.scale, base: memo.base, baseFrom: memo.baseFrom, moves: memo.moves, answers: new Map(memo.answers) };
  }

  // Starts the job when anything is unmeasured for the current inputs (a running job for the same inputs goes on: it picks up a
  // newly chosen goal when it gets there). With nothing to measure, it commits the working memo for display and repaints if
  // that changed what is shown. Never while the US bracket search is pending: the deferred pass that runs it calls this again.
  export function scheduleGuidanceAnswers() {
    if (searchPending()) return;
    const key = impactKey(state);
    if (memo.key !== key) {
      memo = keptMemo(memos, key, () => ({ key, scale: ageScale(state), base: undefined, baseFrom: null, moves: undefined, answers: new Map(), roomOff: undefined }));
    }
    if (job !== null && job.state === state && job.key === key) return;
    const ctxFor = stateContextFor();
    if (memo.base === undefined) {
      const seed = verdictSeed(key, ctxFor);
      if (seed !== null) {
        memo.base = seed;
        memo.baseFrom = 'verdict';
      }
    }
    if (!unmeasured(state)) {
      if (job !== null) {
        job = null;
        gen++;
      }
      if (shown.key !== memo.key || shown.base !== memo.base || shown.moves !== memo.moves || shown.answers.size !== memo.answers.size) {
        commitShown();
        renderGuidanceAnswers();
        document.dispatchEvent(new CustomEvent('guidance-answers-change'));
      }
      return;
    }
    gen++;
    job = { gen, key, state, ctxFor, unit: null, planNext: false };
    // What the memo already holds for these inputs (a reused verdict, a kept memo) shows at once, dimmed while the job runs.
    if (memo.base !== undefined && (shown.key !== memo.key || shown.base !== memo.base || shown.moves !== memo.moves || shown.answers.size !== memo.answers.size)) {
      commitShown();
      renderGuidanceAnswers();
    }
    const g = gen;
    // Under the test hold the job waits for the test's flush (runGuidanceAnswersToEnd).
    if (!guidanceHeld()) setTimeout(() => step(g), 0);
  }

  // One slice of the job: steps until SLICE_MS or SLICE_STEPS (no limit when `sync`). A cliff-plan search runs alone: after a
  // 'plan-next' the slice ends unless it has run nothing yet, and the planning step is then its only step. A finished unit goes
  // into the memo and the display copy; a changed state or key stops the job without committing; after the last unit the job
  // ends, repaints and dispatches guidance-answers-change.
  function step(g, sync = false) {
    if (!job || job.gen !== g) return;
    if (state !== job.state || impactKey(state) !== job.key) {
      job = null;
      return;
    }
    const t0 = performance.now();
    let ran = 0;
    for (;;) {
      if (job.unit === null) {
        job.unit = nextUnit(job);
        if (job.unit === null) {
          job = null;
          commitShown();
          renderGuidanceAnswers();
          document.dispatchEvent(new CustomEvent('guidance-answers-change'));
          return;
        }
      }
      if (job.planNext && ran > 0 && !sync) break;
      const planning = job.planNext;
      job.planNext = false;
      const r = job.unit.it.next();
      unitSteps++;
      if (r.done) {
        job.unit.commit(r.value);
        job.unit = null;
        commitShown();
        renderGuidanceAnswers();
        ran++;
      } else if (r.value === 'plan-next') {
        job.planNext = true;
        continue;
      } else ran++;
      if (!sync && (planning || ran >= SLICE_STEPS || performance.now() - t0 >= SLICE_MS)) break;
    }
    if (!guidanceHeld()) setTimeout(() => step(g), 0);
  }

  // Runs the job to its end at once, scheduling no timer (the test hook).
  export function runGuidanceAnswersToEnd() {
    while (job) step(job.gen, true);
  }

  // Paints the moves card and the answers from the display memo; runs no projection.
  export function renderGuidanceAnswers() {
    const card = document.getElementById('movesCard'),
      box = document.getElementById('goalAnswers');
    if (!card || !box) return;
    const dim = job !== null || impactKey(state) !== shown.key;
    const active = document.activeElement;
    const focusMove = active && card.contains(active) ? active.dataset?.move : undefined;
    const focusLink = active && box.contains(active) ? active.dataset?.answerLink : undefined;
    paintMoves(card, dim);
    paintAnswers(box, dim);
    if (focusMove !== undefined) card.querySelector(`[data-move="${focusMove}"]`)?.focus({ preventScroll: true });
    if (focusLink !== undefined) box.querySelector(`[data-answer-link="${focusLink}"]`)?.focus({ preventScroll: true });
  }

  function paintMoves(card, dim) {
    const b = shown.base;
    card.classList.toggle('measuring', dim);
    card.hidden = !b || b.word === 'comfortable';
    if (card.hidden) return;
    card.dataset.word = b.word;
    document.getElementById('movesHead').textContent = movesHeadText(b, shown.scale);
    const list = document.getElementById('movesList');
    list.replaceChildren();
    if (!shown.moves || !shown.moves.length) {
      const li = document.createElement('li');
      li.className = 'move-none';
      li.textContent = shown.moves ? NO_MOVES_TEXT : WORKING;
      list.append(li);
      return;
    }
    let title = '';
    if (currentMarketScenarioText() !== null) title = SCENARIO_TITLE;
    else if (movePreview !== null) title = PREVIEW_TITLE;
    else if (dim) title = MEASURING_TITLE;
    shown.moves.forEach((m, i) => {
      const li = document.createElement('li');
      const what = document.createElement('span');
      what.className = 'move-what';
      what.textContent = m.what;
      const result = document.createElement('span');
      result.className = 'move-result';
      result.textContent = ' — ' + m.result;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'move-try';
      btn.dataset.move = String(i);
      btn.textContent = 'Try';
      btn.disabled = title !== '';
      btn.title = title;
      li.append(what, result, ' ', btn);
      list.append(li);
    });
  }

  function paintAnswers(box, dim) {
    const goals = chosenGoals(state);
    box.classList.toggle('measuring', dim);
    box.hidden = goals.length === 0;
    box.replaceChildren(
      ...goals.map((g) => {
        const a = shown.answers.get(g.key);
        const div = document.createElement('div');
        div.className = 'goal-answer';
        div.dataset.goalAnswer = g.key;
        const q = document.createElement('b');
        q.className = 'goal-answer-q';
        q.textContent = g.label;
        const text = document.createElement('span');
        text.className = 'goal-answer-text';
        text.textContent = a ? a.text : WORKING;
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'link-btn goal-answer-link';
        const l = a ? a.link : LINKS[g.key];
        link.hidden = !l;
        if (l) {
          link.dataset.answerLink = l.target;
          link.textContent = l.label;
        }
        div.append(q, ' ', text, ' ', link);
        return div;
      }),
    );
  }

  // A link's target: `field:<id>` shows the sidebar field; `card:<id>` shows the dashboard card (opened, scrolled to, flashed).
  function followLink(target) {
    const i = target.indexOf(':'),
      kind = target.slice(0, i),
      id = target.slice(i + 1);
    if (kind === 'field') {
      revealField(id);
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    setMobileView('dashboard');
    if (el.tagName === 'DETAILS' && !el.open) el.open = true;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.classList.add('flash-highlight');
    setTimeout(() => el.classList.remove('flash-highlight'), 2600);
  }

  // The hook's view, from the display memo: whether a job runs, who measured the base ('verdict', 'job', null), the unit steps
  // run so far (a counter), the base verdict and the moves' verdicts (without runs and the selected run), the moves (null before
  // they are measured) and each measured answer's text.
  export function guidanceAnswersSnapshot() {
    let base = null;
    if (shown.base) {
      const { runs, selected, ...rest } = shown.base;
      base = rest;
    }
    const answers = {};
    for (const [k, a] of shown.answers) answers[k] = a.text;
    return {
      pending: job !== null,
      baseFrom: shown.baseFrom,
      steps: unitSteps,
      base,
      moves: shown.moves ? shown.moves.map((m) => ({ ...m, patch: cloneState(m.patch), verdict: { ...m.verdict } })) : null,
      answers,
    };
  }

  export function wireGuidanceAnswers() {
    document.getElementById('movesCard').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-move]');
      if (!btn || btn.disabled) return;
      // Only a move measured for the current inputs is tried (the button can lag a change by a light render); tryMove
      // itself refuses under a market scenario or another preview.
      if (job !== null || impactKey(state) !== shown.key) return;
      const m = shown.moves && shown.moves[Number(btn.dataset.move)];
      if (m) tryMove({ label: m.what.charAt(0).toLowerCase() + m.what.slice(1), patch: cloneState(m.patch) });
    });
    document.getElementById('goalAnswers').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-answer-link]');
      if (btn) followLink(btn.dataset.answerLink);
    });
    // A chip renders no projection: a newly chosen goal is measured from here (guidance.js does not import this module).
    document.addEventListener('guidance-change', () => {
      renderGuidanceAnswers();
      if (!searchPending()) scheduleGuidanceAnswers();
    });
  }
