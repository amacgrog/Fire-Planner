// Computes and renders the flat-bracket Roth optimizer card, and the applied schedules' status

import { money } from '../../../shared/core/format/numbers.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { displayValue } from '../../../shared/core/format/charts.js';
import { mode, state } from '../../../shared/core/store.js';
import { variantContext } from '../../core/projection/store-context.js';
import { optimizerState } from '../../core/optimizer-state.js';
import { cliffPlanStore } from '../../core/cliff-plan-store.js';
import { pickFlatBracket } from '../../core/optimizer/roth-schedule.js';
import { notWorseThan, US_OBJECTIVES } from '../../core/optimizer/objectives.js';
import { rowTax } from '../../core/projection/row-cost.js';

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
  // for the user's own bracket would get the plan's bracket: each other trial then pins every window age to its bracket through
  // the override map, so a row is that bracket's own run (with the plan's intents; a pinned age is exempt from the plan's sized
  // conversions, so those rows are unsized). The plan's own row runs unpinned at the setting (R5 review I-A): the engine then
  // converts at `plan.bracket` and follows the plan's sizing (`planConv`, made for this setting), so it is the dashboard's
  // run, sized as the plan sizes it, as the baseline below assumes. Otherwise the trials are today's (an applied
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
      const ctx = bracket === planBracket
        ? variantContext(state, { ...state, rothConvEnabled: true })
        : pinAges.length
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
