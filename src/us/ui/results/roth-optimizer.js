// Computes and renders the Roth optimizer and per-year results, and the applied schedules' status

import { money } from '../../../shared/core/format/numbers.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { displayValue } from '../../../shared/core/format/charts.js';
import { mode, state } from '../../../shared/core/store.js';
import { stateContextFor } from '../../../shared/ui/results/state-context.js';
import { variantContext } from '../../core/projection/store-context.js';
import { optimizeRothLadderPerYear } from '../../core/optimizer/multi-lever.js';
import { optimizerState } from '../../core/optimizer-state.js';
import { cliffPlanStore } from '../../core/cliff-plan-store.js';
import { pickFlatBracket, ROTH_PER_YEAR_MAX_WINDOW } from '../../core/optimizer/roth-schedule.js';
import { applyGateOpen, DEFAULT_OBJECTIVE_ID, notWorseThan, US_OBJECTIVES } from '../../core/optimizer/objectives.js';
import { rowTax } from '../../core/projection/row-cost.js';

  // The "without shortening" clause of a suggestion, only when the winner passes the guardrail against the current plan.
  function keepsLongevity(selected, opt) {
    return notWorseThan(selected.depletedAge, opt.depletedAge) ? ', without shortening how long the portfolio lasts' : '';
  }

  // The cliff plan's flat bracket when the bracket search kept another one than the setting (Batch 5 step 3a), else null: the
  // dashboard runs that bracket, so the cards word their baseline against it, not against the setting.
  function planBracketOverSetting() {
    const plan = cliffPlanStore.forState === state ? cliffPlanStore.plan : null;
    return plan && plan.bracket != null && plan.bracketFrom === state.rothConvBracket && plan.bracket !== plan.bracketFrom ? plan.bracket : null;
  }
  // The plan the dashboard runs, as the cards name it: the applied plan (state.storedPlan) when the guard uses it (Batch 5
  // step 4a, spec 4.6), else the cliff plan.
  function planName() {
    const report = cliffPlanStore.forState === state ? cliffPlanStore.report : null;
    return report && report.stored && report.stored.used ? 'the applied plan' : 'the cliff plan';
  }
  // The flat-bracket card: each bracket's run (the ladder forced on) is priced with its own context; the pick is the highest
  // after-tax end value among the brackets that pass the guardrail against the current plan (pickFlatBracket: depletion
  // first, a $1 tie keeps the current bracket, else the lowest). lifetimeTax, endAssets and afterTaxEnd are display dollars;
  // score is the nominal end value; guarded is false when no bracket passed the guardrail.
  // When the cliff plan converts to another bracket than the setting (the bracket search, Batch 5 step 3a, spec A4), the trial
  // for the user's own bracket would get the plan's bracket: each trial then pins every window age to its bracket through the
  // override map, so a row is that bracket's own run (with the plan's intents; a pinned age is exempt from the plan's sized
  // conversions, so no row is sized and the plan's row is its bracket's flat run). Otherwise the trials are today's (an applied
  // schedule still wins over the rows): the plan's sized conversions (`plan.conv`, Batch 5 step 5b piece 3) are honoured only
  // for the setting the plan was made for (runProjection's `planConv`, R5 I-1), so the user's row is the dashboard's run, sized
  // as the plan sizes it, and every other row is that bracket's own unsized run. The card's baseline (`currentBracket`: the pick's tie-break, the "current" row and the
  // suggestion's wording) is then the plan's bracket, whose row is the dashboard's run (annotateRothOptimizer, called right after,
  // compares it with the setting).
  export function computeRothOptimizer(selected) {
    const candidates = [...document.getElementById('rothConvBracket').options].map((o) =>
      Number(o.value),
    );
    const settingBracket = state.rothConvBracket;
    const planBracket = planBracketOverSetting();
    const currentBracket = planBracket ?? settingBracket;
    const endValue = US_OBJECTIVES.endValue;
    const pinAges = [];
    if (planBracket != null)
      for (let a = Math.max(state.rothConvStartAge, state.ageA); a <= state.rothConvEndAge; a++) pinAges.push(a);
    const results = candidates.map((bracket) => {
      const variant = { ...state, rothConvEnabled: true, rothConvBracket: bracket };
      const ctx = pinAges.length
        ? variantContext(state, variant, { overrides: { rothBracketByAge: new Map(pinAges.map((a) => [a, bracket])), withdrawalMixByAge: optimizerState.withdrawalMixByAge } })
        : variantContext(state, variant);
      const sim = simulateWith(ctx);
      const end = sim.rows.at(-1);
      return {
        bracket,
        endAssets: displayValue(end.total, end.year),
        afterTaxEnd: displayValue(endValue.value(ctx, sim), end.year),
        score: endValue.score(ctx, sim),
        lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(rowTax(r), r.year), 0),
        depletedAge: sim.depletedAge,
      };
    });
    const guarded = results.some((r) => notWorseThan(selected.depletedAge, r.depletedAge));
    const best = pickFlatBracket(results, selected.depletedAge, currentBracket);
    lastRothOptimizer = { results, best, currentBracket, guarded };
    return lastRothOptimizer;
  }
  // The shared renderRothOptimizer writes the lifetime-tax summary and a four-column table; the US page then replaces them
  // (as Canada's annotateRothOptimizer does): the table gains the after-tax end value column and the sentence names it.
  let lastRothOptimizer = null;
  export function annotateRothOptimizer() {
    const o = lastRothOptimizer;
    if (!o) return;
    const { results, best, currentBracket, guarded } = o,
      settingBracket = state.rothConvBracket,
      byPlan = currentBracket !== settingBracket,
      current = results.find((r) => r.bracket === currentBracket),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows'),
      unit = mode === 'real' ? "today's dollars" : 'future dollars',
      lastsLabel = (r) =>
        r.depletedAge
          ? `Age ${r.depletedAge}`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (byPlan && (!current || best.bracket === currentBracket)) {
      const name = planName();
      summaryEl.innerHTML = `${name[0].toUpperCase() + name.slice(1)} already uses the <b>${currentBracket}%</b> bracket (not your ${settingBracket}% setting), which left the highest estimated after-tax end value of the targets tried here.`;
    } else if (!current || best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target already left the highest estimated after-tax end value of the targets tried here.`;
    } else {
      const gain = best.afterTaxEnd - current.afterTaxEnd,
        savings = current.lifetimeTax - best.lifetimeTax;
      // A bracket can win on lasting longer while its end value is lower (the pick prefers the guardrail, then the value).
      const lasts = (r) => (r.depletedAge ? `age ${r.depletedAge}` : 'the end of the plan'),
        valueClause = gain > 0
          ? `an estimated <b>${money(gain)}</b> more after-tax end value (end assets less the tax still owed on the traditional balance, ${unit})`
          : `the portfolio lasts until ${lasts(best)} instead of ${lasts(current)}`;
      summaryEl.innerHTML = `Suggested: fill to the <b>${best.bracket}%</b> bracket instead of ${byPlan ? `${planName()}'s` : 'your current'} <b>${currentBracket}%</b> — ${valueClause}${gain > 0 ? (savings >= 0 ? ` and <b>${money(savings)}</b> less lifetime tax` : ` at <b>${money(-savings)}</b> more lifetime tax`) : ''}${gain > 0 && guarded ? ', without shortening how long the portfolio lasts' : ''}.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? (byPlan ? ` (${planName().slice(4)})` : ' (current)') : byPlan && r.bracket === settingBracket ? ' (your setting)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td>${money(r.afterTaxEnd)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
      )
      .join('');
  }
  // On-demand only (button click, not auto-run on card expand like the
  // flat optimizer above) — this is the heavier multi-second computation,
  // so it shouldn't fire every time the card is opened or a sibling field
  // changes.
  export function renderRothPerYearOptimizer(selected) {
    const resultEl = document.getElementById('rothPerYearResult'),
      summaryEl = document.getElementById('rothPerYearSummary'),
      rowsEl = document.getElementById('rothPerYearRows');
    const opt = optimizeRothLadderPerYear(selected, state, stateContextFor(), { budget: optimizerState.rothPerYearEvalBudget, objective: DEFAULT_OBJECTIVE_ID });
    if (opt.activeYears.length === 0) {
      resultEl.hidden = true;
      return;
    }
    // Re-simulate once more with the winning schedule active, purely to
    // read each year's actual conversionAmount for display — opt itself
    // only carries the schedule (bracket targets) and aggregate figures, not
    // the per-row dollar detail.
    const detail = simulateWith(
      variantContext(state, state, { overrides: { rothBracketByAge: opt.schedule, withdrawalMixByAge: optimizerState.withdrawalMixByAge } }),
    );
    optimizerState.rothBracketByAge = null;
    const rowsByAge = new Map(detail.rows.map((r) => [r.age, r]));

    // The end value gained over the current settings, in today's dollars.
    const gain = opt.gain;
    const targetLabel = (c) => (c === 0 ? 'Skip' : `${c}%`);
    let notes = '';
    if (opt.truncated) {
      notes += ` Your ladder window is wider than the ${ROTH_PER_YEAR_MAX_WINDOW} years this can search at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.activeYears.at(-1)}) are covered — narrow the window above to cover the rest.`;
    }
    if (opt.budgetExhausted) {
      notes += ' Stopped early after reaching its evaluation budget — showing the best schedule found so far; a longer search might find a better one.';
    }
    // The gain is measured against `selected`, the dashboard's run: the cliff plan's flat bracket when it kept another one.
    const planBracket = planBracketOverSetting(),
      flat = planBracket ?? state.rothConvBracket;
    if (applyGateOpen(gain)) {
      summaryEl.innerHTML = `Suggested: a different fill target each year (see below) instead of a flat <b>${flat}%</b> every year — an estimated <b>${money(gain)}</b> more after-tax end value (today's dollars) than ${planBracket != null ? `${planName()}'s flat ${flat}%` : 'your current flat setting'}${keepsLongevity(selected, opt)}. The search tries many schedules but can miss a better one, so treat this as a strong candidate to check, not the single right answer.${notes}`;
    } else {
      summaryEl.innerHTML = planBracket != null
        ? `The search found no per-year schedule that beats ${planName()}'s flat <b>${flat}%</b> (not your ${state.rothConvBracket}% setting).${notes}`
        : `The search found no per-year schedule that beats your current flat <b>${flat}%</b> setting.${notes}`;
    }
    rowsEl.innerHTML = opt.activeYears
      .map((age) => {
        const row = rowsByAge.get(age);
        const amount = row ? displayValue(row.conversionAmount, row.year) : 0;
        const candidate = opt.schedule.get(age);
        // A candidate can tie at $0 with every other candidate once that
        // year's traditional balance/conversion room is already
        // exhausted (e.g. a prior year converted aggressively) — showing
        // a specific bracket target next to $0 would read as a
        // meaningful choice when coordinate ascent just kept whichever
        // tied candidate it happened to land on.
        const label = amount < 1 ? '—' : targetLabel(candidate);
        return `<tr><td>${age}</td><td>${label}</td><td>${money(amount)}</td></tr>`;
      })
      .join('');
    resultEl.hidden = false;
  }
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
    el.innerHTML = `<div class="callout method" style="padding:10px 12px">Applied from the earlier strategy search: ${parts.join(' and ')}. Applying a plan below replaces it.</div>`;
  }
