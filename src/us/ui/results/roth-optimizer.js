// Computes and renders the Roth optimizer, per-year and multi-lever results

import { money } from '../../../shared/core/format/numbers.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { displayValue } from '../../../shared/core/format/charts.js';
import { mode, state } from '../../../shared/core/store.js';
import { stateContextFor } from '../../../shared/ui/results/state-context.js';
import { variantContext } from '../../core/projection/store-context.js';
import { optimizeMultiLever, optimizeRothLadderPerYear } from '../../core/optimizer/multi-lever.js';
import { optimizerState } from '../../core/optimizer-state.js';
import { ROTH_PER_YEAR_MAX_WINDOW, rothScheduleCost } from '../../core/optimizer/roth-schedule.js';

  export function computeRothOptimizer(selected) {
    const candidates = [...document.getElementById('rothConvBracket').options].map((o) =>
      Number(o.value),
    );
    const savedBracket = state.rothConvBracket;
    const results = candidates.map((bracket) => {
      const sim = simulateWith(variantContext(state, { ...state, rothConvEnabled: true, rothConvBracket: bracket }));
      const end = sim.rows.at(-1);
      return {
        bracket,
        endAssets: displayValue(end.total, end.year),
        lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(r.tax, r.year), 0),
        depletedAge: sim.depletedAge,
      };
    });
    // "Not worse" = doesn't deplete when the current plan doesn't, and doesn't
    // deplete earlier when it does — a lifetime-tax-minimizing bracket that
    // shortens the portfolio's life isn't actually an improvement.
    const notWorse = results.filter((r) =>
      selected.depletedAge ? !r.depletedAge || r.depletedAge >= selected.depletedAge : !r.depletedAge,
    );
    const pool = notWorse.length ? notWorse : results;
    const best = pool.reduce((a, b) => (b.lifetimeTax < a.lifetimeTax ? b : a));
    return { results, best, currentBracket: savedBracket };
  }
  // On-demand only (button click, not auto-run on card expand like the
  // flat optimizer above) — this is the heavier multi-second computation,
  // so it shouldn't fire every time the card is opened or a sibling field
  // changes.
  export function renderRothPerYearOptimizer(selected) {
    const resultEl = document.getElementById('rothPerYearResult'),
      summaryEl = document.getElementById('rothPerYearSummary'),
      rowsEl = document.getElementById('rothPerYearRows');
    const opt = optimizeRothLadderPerYear(selected, state, stateContextFor(), { budget: optimizerState.rothPerYearEvalBudget, displayMode: mode });
    if (opt.activeYears.length === 0) {
      resultEl.hidden = true;
      return;
    }
    // Re-simulate once more with the winning schedule active, purely to
    // read each year's actual conversionAmount for display — opt itself
    // only carries the schedule (bracket targets) and aggregate cost, not
    // the per-row dollar detail.
    const detail = simulateWith(
      variantContext(state, state, { overrides: { rothBracketByAge: opt.schedule, withdrawalMixByAge: optimizerState.withdrawalMixByAge } }),
    );
    optimizerState.rothBracketByAge = null;
    const rowsByAge = new Map(detail.rows.map((r) => [r.age, r]));

    const currentCost = rothScheduleCost(selected, state, mode);
    const savings = currentCost - opt.cost;
    const targetLabel = (c) => (c === 0 ? 'Skip' : `${c}%`);
    let notes = '';
    if (opt.truncated) {
      notes += ` Your ladder window is wider than the ${ROTH_PER_YEAR_MAX_WINDOW} years this can optimize at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.activeYears.at(-1)}) are covered — narrow the window above to cover the rest.`;
    }
    if (opt.budgetExhausted) {
      notes += ' Stopped early after reaching its evaluation budget — showing the best schedule found so far, which may not be fully optimized.';
    }
    if (savings > 1) {
      summaryEl.innerHTML = `Recommended: a different fill target each year (see below) instead of a flat <b>${state.rothConvBracket}%</b> every year — an estimated <b>${money(savings)}</b> less lifetime tax + healthcare cost (today's dollars) than your current flat setting, without shortening how long the portfolio lasts.${notes}`;
    } else {
      summaryEl.innerHTML = `Your current flat <b>${state.rothConvBracket}%</b> setting is already at least as good as varying the target by year here.${notes}`;
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
    const opt = optimizeMultiLever(selected, state, stateContextFor(), options, { budget: optimizerState.rothPerYearEvalBudget, displayMode: mode });
    const hasPerYear = options.includeRoth || options.includeMix;
    if (hasPerYear && opt.activeYears.length === 0) {
      resultEl.hidden = true;
      document.getElementById('multiLeverApplyBtn').hidden = true;
      document.getElementById('multiLeverApplyNote').textContent = '';
      return;
    }
    // Re-simulate once more with the winning schedule(s)/setting active,
    // purely to read each year's actual dollar amounts for display — opt
    // itself only carries the schedules/flag and aggregate cost.
    // optimizeMultiLever() runs its trials on copies (so a search never
    // leaves the ladder toggled on if it started off), same as the
    // flat/per-year Roth optimizers above — so when the ladder was off and
    // includeRoth is checked, this run's copy must turn it on too, or
    // solveRothConversion's own `rothConvEnabled && age-in-window` gate
    // skips every year regardless of the override map, and every row would
    // silently show $0/no conversion despite a real non-zero schedule
    // having been found and already counted in opt.cost above.
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

    const currentCost = rothScheduleCost(selected, state, mode);
    const savings = currentCost - opt.cost;
    const rothLabel = (c) => (c === 0 ? 'Skip' : `${c}%`);
    const mixLabel = (c) =>
      !c
        ? 'Default'
        : c === 'taxable'
          ? 'Taxable only'
          : c === 'traditional'
            ? 'Traditional only'
            : c === 'roth'
              ? 'Roth only'
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
      notes += ` Your Roth ladder window is wider than the ${ROTH_PER_YEAR_MAX_WINDOW} years this can optimize at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.rothYears.at(-1)}) are covered.`;
    }
    if (opt.mixTruncated) {
      notes += ` Your retirement is longer than the ${ROTH_PER_YEAR_MAX_WINDOW} years the withdrawal-mix lever can optimize at once, so only the first ${ROTH_PER_YEAR_MAX_WINDOW} years (through age ${opt.mixYears.at(-1)}) are covered.`;
    }
    if (opt.budgetExhausted) {
      notes += ' Stopped early after reaching its evaluation budget — showing the best combination found so far, which may not be fully optimized.';
    }
    let smoothNote = '';
    if (options.includeSmooth) {
      smoothNote = opt.smoothWithdrawals
        ? ' Recommends turning <b>on</b> smoothed withdrawals (drawing taxable and traditional proportionally, instead of taxable-first).'
        : ' Recommends keeping smoothed withdrawals <b>off</b>.';
    }
    const leverNames = [options.includeRoth && 'a per-year Roth conversion schedule', options.includeMix && 'a per-year withdrawal mix']
      .filter(Boolean)
      .join(' + ');
    if (savings > 1) {
      summaryEl.innerHTML = `Recommended: ${leverNames || 'the settings below'} — an estimated <b>${money(savings)}</b> less lifetime tax + healthcare cost (today's dollars) than your current settings, without shortening how long the portfolio lasts.${smoothNote}${notes}`;
    } else {
      summaryEl.innerHTML = `Your current settings are already at least as good as anything these levers found.${smoothNote}${notes}`;
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
    optimizerState.lastMultiLeverRun = { opt, options, savings };
    const applyBtn = document.getElementById('multiLeverApplyBtn'),
      applyNote = document.getElementById('multiLeverApplyNote');
    applyBtn.hidden = false;
    if (savings > 1) {
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
    el.innerHTML = `<div class="callout method" style="padding:10px 12px">Applied from the optimizer below: ${parts.join(' and ')}.</div>`;
  }
