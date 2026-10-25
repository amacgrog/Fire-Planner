// Computes and renders the Roth optimizer, per-year and multi-lever results

import { money } from '../../../shared/core/format/numbers.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { displayValue } from '../../../shared/core/format/charts.js';
import { mode, state } from '../../../shared/core/store.js';
import { stateContextFor } from '../../../shared/ui/results/state-context.js';
import { variantContext } from '../../core/projection/store-context.js';
import { optimizeMultiLever, optimizeRothLadderPerYear } from '../../core/optimizer/multi-lever.js';
import { optimizerState } from '../../core/optimizer-state.js';
import { cliffPlanStore } from '../../core/cliff-plan-store.js';
import { pickFlatBracket, ROTH_PER_YEAR_MAX_WINDOW } from '../../core/optimizer/roth-schedule.js';
import { applyGateOpen, DEFAULT_OBJECTIVE_ID, notWorseThan, US_OBJECTIVES } from '../../core/optimizer/objectives.js';
import { rowTax } from '../../core/projection/row-cost.js';

  // The "without shortening" clause of a suggestion, only when the winner passes the guardrail against the current plan.
  function keepsLongevity(selected, opt) {
    return notWorseThan(selected.depletedAge, opt.depletedAge) ? ', without shortening how long the portfolio lasts' : '';
  }

  // The flat-bracket card: each bracket's run (the ladder forced on) is priced with its own context; the pick is the highest
  // after-tax end value among the brackets that pass the guardrail against the current plan (pickFlatBracket: depletion
  // first, a $1 tie keeps the current bracket, else the lowest). lifetimeTax, endAssets and afterTaxEnd are display dollars;
  // score is the nominal end value; guarded is false when no bracket passed the guardrail.
  // When the cliff plan converts to another bracket than the setting (the bracket search, Batch 5 step 3a, spec A4), the trial
  // for the user's own bracket would get the plan's bracket: each trial then pins every window age to its bracket through the
  // override map, so a row is that bracket's own run (with the plan's intents). Otherwise the trials are today's (an applied
  // schedule still wins over the rows).
  export function computeRothOptimizer(selected) {
    const candidates = [...document.getElementById('rothConvBracket').options].map((o) =>
      Number(o.value),
    );
    const savedBracket = state.rothConvBracket;
    const endValue = US_OBJECTIVES.endValue;
    const plan = cliffPlanStore.forState === state ? cliffPlanStore.plan : null;
    const pinAges = [];
    if (plan && plan.bracket != null && plan.bracket !== plan.bracketFrom)
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
    const best = pickFlatBracket(results, selected.depletedAge, savedBracket);
    lastRothOptimizer = { results, best, currentBracket: savedBracket, guarded };
    return lastRothOptimizer;
  }
  // The shared renderRothOptimizer writes the lifetime-tax summary and a four-column table; the US page then replaces them
  // (as Canada's annotateRothOptimizer does): the table gains the after-tax end value column and the sentence names it.
  let lastRothOptimizer = null;
  export function annotateRothOptimizer() {
    const o = lastRothOptimizer;
    if (!o) return;
    const { results, best, currentBracket, guarded } = o,
      current = results.find((r) => r.bracket === currentBracket),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows'),
      unit = mode === 'real' ? "today's dollars" : 'future dollars',
      lastsLabel = (r) =>
        r.depletedAge
          ? `Age ${r.depletedAge}`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (!current || best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target already left the highest estimated after-tax end value of the targets tried here.`;
    } else {
      const gain = best.afterTaxEnd - current.afterTaxEnd,
        savings = current.lifetimeTax - best.lifetimeTax;
      // A bracket can win on lasting longer while its end value is lower (the pick prefers the guardrail, then the value).
      const lasts = (r) => (r.depletedAge ? `age ${r.depletedAge}` : 'the end of the plan'),
        valueClause = gain > 0
          ? `an estimated <b>${money(gain)}</b> more after-tax end value (end assets less the tax still owed on the traditional balance, ${unit})`
          : `the portfolio lasts until ${lasts(best)} instead of ${lasts(current)}`;
      summaryEl.innerHTML = `Suggested: fill to the <b>${best.bracket}%</b> bracket instead of your current <b>${currentBracket}%</b> — ${valueClause}${gain > 0 ? (savings >= 0 ? ` and <b>${money(savings)}</b> less lifetime tax` : ` at <b>${money(-savings)}</b> more lifetime tax`) : ''}${gain > 0 && guarded ? ', without shortening how long the portfolio lasts' : ''}.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? ' (current)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td>${money(r.afterTaxEnd)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
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
    if (applyGateOpen(gain)) {
      summaryEl.innerHTML = `Suggested: a different fill target each year (see below) instead of a flat <b>${state.rothConvBracket}%</b> every year — an estimated <b>${money(gain)}</b> more after-tax end value (today's dollars) than your current flat setting${keepsLongevity(selected, opt)}. The search tries many schedules but can miss a better one, so treat this as a strong candidate to check, not the single right answer.${notes}`;
    } else {
      summaryEl.innerHTML = `The search found no per-year schedule that beats your current flat <b>${state.rothConvBracket}%</b> setting.${notes}`;
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
  // Generalized sibling of renderRothPerYearOptimizer above — same
  // on-demand-only pattern, but drives optimizeMultiLever() with whichever
  // of the 3 levers (Roth/mix/smooth) the checkboxes have turned on, and
  // builds its results table's columns dynamically around just those.
  export function renderMultiLeverOptimizer(selected, options) {
    const resultEl = document.getElementById('multiLeverResult'),
      summaryEl = document.getElementById('multiLeverSummary'),
      headEl = document.getElementById('multiLeverHead'),
      rowsEl = document.getElementById('multiLeverRows'),
      tableWrap = rowsEl.closest('.table-wrap');
    const opt = optimizeMultiLever(selected, state, stateContextFor(), options, { budget: optimizerState.rothPerYearEvalBudget, objective: DEFAULT_OBJECTIVE_ID });
    const hasPerYear = options.includeRoth || options.includeMix;
    if (hasPerYear && opt.activeYears.length === 0) {
      resultEl.hidden = true;
      document.getElementById('multiLeverApplyBtn').hidden = true;
      document.getElementById('multiLeverApplyNote').textContent = '';
      return;
    }
    // Re-simulate once more with the winning schedule(s)/setting active,
    // purely to read each year's actual dollar amounts for display — opt
    // itself only carries the schedules/flag and aggregate figures.
    // optimizeMultiLever() runs its trials on copies (so a search never
    // leaves the ladder toggled on if it started off), same as the
    // flat/per-year Roth optimizers above — so when the ladder was off and
    // includeRoth is checked, this run's copy must turn it on too, or
    // solveRothConversion's own `rothConvEnabled && age-in-window` gate
    // skips every year regardless of the override map, and every row would
    // silently show $0/no conversion despite a real non-zero schedule
    // having been found and already counted in opt's figures above.
    const detail = simulateWith(
      variantContext(
        state,
        {
          ...state,
          rothConvEnabled: options.includeRoth ? true : state.rothConvEnabled,
          smoothWithdrawals: options.includeSmooth ? opt.smoothWithdrawals : state.smoothWithdrawals,
        },
        {
          overrides: {
            rothBracketByAge: options.includeRoth ? opt.rothSchedule : null,
            withdrawalMixByAge: options.includeMix ? opt.mixSchedule : null,
          },
        },
      ),
    );
    optimizerState.rothBracketByAge = null;
    optimizerState.withdrawalMixByAge = null;
    const rowsByAge = new Map(detail.rows.map((r) => [r.age, r]));

    // The end value gained over the current settings, in today's dollars.
    const gain = opt.gain;
    const rothLabel = (c) => (c === 0 ? 'Skip' : `${c}%`);
    const mixLabel = (c) =>
      !c
        ? 'Default'
        : c === 'taxable'
          ? 'Taxable first'
          : c === 'traditional'
            ? 'Traditional first'
            : c === 'roth'
              ? 'Roth first'
              : c === 'balanced'
                ? 'Balanced (3-way)'
                : c === 'smoothed'
                  ? 'Smoothed (tax./trad. only)'
                  : c === 'taxTradHalf'
                    ? '50/50 tax./trad.'
                    : c === 'thirds'
                      ? 'Even thirds'
                      : c;

    let notes = '';
    if (opt.rothTruncated) {
      notes += ` Your Roth ladder window is wider than the ${ROTH_PER_YEAR_MAX_WINDOW} years this can search at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.rothYears.at(-1)}) are covered.`;
    }
    if (opt.mixTruncated) {
      notes += ` Your retirement is longer than the ${ROTH_PER_YEAR_MAX_WINDOW} years the withdrawal-mix lever can search at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.mixYears.at(-1)}) are covered.`;
    }
    if (opt.budgetExhausted) {
      notes += ' Stopped early after reaching its evaluation budget — showing the best combination found so far; a longer search might find a better one.';
    }
    let smoothNote = '';
    if (options.includeSmooth) {
      smoothNote = opt.smoothWithdrawals
        ? ' Suggests turning <b>on</b> smoothed withdrawals (drawing taxable and traditional proportionally, instead of taxable-first).'
        : ' Suggests keeping smoothed withdrawals <b>off</b>.';
    }
    const leverNames = [options.includeRoth && 'a per-year Roth conversion schedule', options.includeMix && 'a per-year withdrawal mix']
      .filter(Boolean)
      .join(' + ');
    // The card promises no change that depletes earlier than the current plan: a winner that does is shown but not applicable.
    const depletesEarlier = applyGateOpen(gain) && !notWorseThan(selected.depletedAge, opt.depletedAge);
    if (depletesEarlier) {
      summaryEl.innerHTML = `The best combination found would deplete the portfolio at age ${opt.depletedAge}, earlier than your current plan, so it is not suggested.${smoothNote}${notes}`;
    } else if (applyGateOpen(gain)) {
      summaryEl.innerHTML = `Suggested: ${leverNames || 'the settings below'} — an estimated <b>${money(gain)}</b> more after-tax end value (today's dollars) than your current settings${keepsLongevity(selected, opt)}. The search tries many schedules but can miss a better one, so treat this as a strong candidate to check, not the single right answer.${smoothNote}${notes}`;
    } else {
      summaryEl.innerHTML = `The search found nothing with these levers that beats your current settings.${smoothNote}${notes}`;
    }

    if (!hasPerYear) {
      tableWrap.hidden = true;
    } else {
      tableWrap.hidden = false;
      const cols = ['Age'];
      if (options.includeRoth) cols.push('Roth target', 'Conversion $');
      if (options.includeMix) cols.push('Mix', 'From taxable', 'From traditional', 'From Roth');
      headEl.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
      const rothYearSet = new Set(opt.rothYears || []),
        mixYearSet = new Set(opt.mixYears || []);
      rowsEl.innerHTML = opt.activeYears
        .map((age) => {
          const row = rowsByAge.get(age);
          const cells = [`<td>${age}</td>`];
          if (options.includeRoth) {
            if (!rothYearSet.has(age)) {
              // Outside this lever's own window (the two windows don't
              // have to coincide) — "not applicable," distinct from "—"
              // below, which means evaluated but chose nothing.
              cells.push(`<td style="opacity:.5">–</td><td style="opacity:.5">–</td>`);
            } else {
              const amt = row ? displayValue(row.conversionAmount, row.year) : 0;
              // See the same-named comment in renderRothPerYearOptimizer
              // above: a candidate can tie at $0 once that year's room is
              // already exhausted, so showing a specific target next to $0
              // would read as a meaningful choice that wasn't really made.
              cells.push(`<td>${amt < 1 ? '—' : rothLabel(opt.rothSchedule.get(age))}</td><td>${money(amt)}</td>`);
            }
          }
          if (options.includeMix) {
            // Unlike the Roth column, the $ breakdown here always shows
            // the year's real taxable/traditional/Roth draw — even when
            // this age fell outside the mix lever's own search window (no
            // candidate chosen, so it fell through to
            // state.smoothWithdrawals/the plain default) or the winning
            // candidate was 0 ("default," no override) — that's still
            // genuinely useful information, unlike a Roth conversion
            // target which has no meaning at all outside its window.
            const label = mixYearSet.has(age) ? mixLabel(row ? row.mixCandidate : 0) : '–';
            const fromTaxable = row ? displayValue(row.taxableWithdrawn, row.year) : 0,
              fromTraditional = row ? displayValue(row.traditionalWithdrawn, row.year) : 0,
              fromRoth = row ? displayValue(row.rothWithdrawn, row.year) : 0;
            cells.push(
              `<td>${label}</td><td>${money(fromTaxable)}</td><td>${money(fromTraditional)}</td><td>${money(fromRoth)}</td>`,
            );
          }
          return `<tr>${cells.join('')}</tr>`;
        })
        .join('');
    }
    resultEl.hidden = false;
    // Remembered so the "Apply this schedule" button (next to Optimize,
    // above) knows exactly what the table below is showing — the button
    // applies this run's result, not a fresh re-optimization, so what you
    // see is what you get.
    optimizerState.lastMultiLeverRun = { opt, options, savings: gain };
    const applyBtn = document.getElementById('multiLeverApplyBtn'),
      applyNote = document.getElementById('multiLeverApplyNote');
    applyBtn.hidden = false;
    if (depletesEarlier) {
      applyBtn.disabled = true;
      applyNote.textContent = 'Not applicable — the best combination found would run out of money earlier than your current plan.';
    } else if (applyGateOpen(gain)) {
      applyBtn.disabled = false;
      applyNote.textContent = '';
    } else {
      applyBtn.disabled = true;
      applyNote.textContent = "Nothing to apply — your current settings already match what was found.";
    }
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
    el.innerHTML = `<div class="callout method" style="padding:10px 12px">Applied from the strategy search below: ${parts.join(' and ')}.</div>`;
  }
