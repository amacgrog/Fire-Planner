// Computes and renders the flat-bracket Roth optimizer card (the bracket ranking table, the over-the-ACA-line line) and the conversion schedule under it (the years that convert or a limit held, each with its why)

import { money, escapeHtml } from '../../../shared/core/format/numbers.js';
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
  // dashboard runs that bracket, so the card words its baseline against it, not against the setting.
  function planBracketOverSetting() {
    const plan = cliffPlanStore.forState === state ? cliffPlanStore.plan : null;
    return plan && plan.bracket != null && plan.bracketFrom === state.rothConvBracket && plan.bracket !== plan.bracketFrom ? plan.bracket : null;
  }
  // The plan the dashboard runs, as the card names it: the applied plan (state.storedPlan) when the guard uses it (Batch 5
  // step 4a, spec 4.6), else the cliff plan.
  function planName() {
    const report = cliffPlanStore.forState === state ? cliffPlanStore.report : null;
    return report && report.stored && report.stored.used ? 'the applied plan' : 'the cliff plan';
  }
  // Distinct integer ages as ascending ranges (S4 ruling 7): [60,61,62] -> "60-62", [59,61,62,63] -> "59, 61-63", [60] -> "60",
  // [] -> "".
  export function ageRanges(ages) {
    const sorted = [...new Set(ages)].sort((a, b) => a - b),
      parts = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
      i = j + 1;
    }
    return parts.join(', ');
  }
  // The flat-bracket card: each bracket's run (the ladder forced on) is priced with its own context; the pick is the highest
  // after-tax end value among the brackets that pass the guardrail against the current plan (pickFlatBracket: depletion
  // first, a $1 tie keeps the current bracket, else the lowest). lifetimeTax, endAssets and afterTaxEnd are display dollars;
  // score is the nominal end value; guarded is false when no bracket passed the guardrail. overAca maps each age whose row
  // carries convOverAca (S4 Task 10: a conversion with the pre-conversion MAGI already over an ACA 400% line) to that row's
  // conversion; it is read from the cached run's rows, never written to them.
  // When the cliff plan converts to another bracket than the setting (the bracket search, Batch 5 step 3a, spec A4), the trial
  // for the user's own bracket would get the plan's bracket: each other trial then pins every window age to its bracket through
  // the override map, so a row is that bracket's own run (with the plan's intents; a pinned age is exempt from the plan's sized
  // conversions, so those rows are unsized). The plan's own row runs unpinned at the setting (R5 review I-A): the engine then
  // converts at `plan.bracket` and follows the plan's sizing (`planConv`, made for this setting), so it is the dashboard's
  // run, sized as the plan sizes it, as the baseline below assumes. Otherwise the trials are today's: the plan's sized conversions (`plan.conv`, Batch 5 step 5b piece 3) are honoured only
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
        overAca: new Map(sim.rows.filter((r) => r.convOverAca).map((r) => [r.age, r.conversionAmount])),
      };
    });
    const guarded = results.some((r) => notWorseThan(selected.depletedAge, r.depletedAge));
    const best = pickFlatBracket(results, selected.depletedAge, currentBracket);
    lastRothOptimizer = { results, best, currentBracket, guarded, selected };
    return lastRothOptimizer;
  }
  // The shared renderRothOptimizer writes the lifetime-tax summary and a four-column table; the US page then replaces them
  // (as Canada's annotateRothOptimizer does): the table gains the after-tax end value column and the sentence names it.
  let lastRothOptimizer = null;
  export function annotateRothOptimizer() {
    const o = lastRothOptimizer;
    if (!o) return;
    const { results, best, currentBracket, guarded, selected } = o,
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
    // The over-the-line line (S4 ruling 7, PR 3 ruling 14; the owner's wording, 2026-11-03): the rows that run out before the
    // dashboard's run and convert, at least $1 more than the dashboard's run, in a year whose pre-conversion MAGI is already over
    // the ACA 400% line (the premium is the same either way). The dashboard's own row and a row lasting as long are never named.
    const selConv = new Map(selected.rows.map((r) => [r.age, r.conversionAmount])),
      overRows = [],
      overAges = [];
    for (const r of results) {
      if (r.bracket === currentBracket || notWorseThan(selected.depletedAge, r.depletedAge)) continue;
      const ages = [...r.overAca].filter(([age, conv]) => conv - (selConv.get(age) ?? 0) >= 1).map(([age]) => age);
      if (!ages.length) continue;
      overRows.push(`${r.bracket}%`);
      overAges.push(...ages);
    }
    const overEl = document.getElementById('rothOptimizerOverLine');
    overEl.hidden = overRows.length === 0;
    if (overRows.length) {
      const many = overRows.length > 1,
        rowsText = many ? `${overRows.slice(0, -1).join(', ')} and ${overRows.at(-1)}` : overRows[0];
      overEl.textContent = `The ${rowsText} row${many ? 's' : ''} run${many ? '' : 's'} out sooner: ${many ? 'they' : 'it'} convert${many ? '' : 's'} at ${ageRanges(overAges)}, when you're already over the ACA 400% line, so the extra tax buys no premium savings.`;
    } else overEl.textContent = '';
  }
  // The solver's line labels (cliffChoice's tail) as the schedule names them; an exact match on the label, any other label as it is.
  const LINE_TEXT = {
    'Medicaid line': 'the Medicaid line',
    'ACA credit floor (100%)': 'the ACA credit floor',
    'ACA 400% line': 'the ACA 400% line',
    'IRMAA tier': 'an IRMAA tier',
  };
  const lineText = (label) => (Object.hasOwn(LINE_TEXT, label) ? LINE_TEXT[label] : label);
  // The why cell's phrase per convHeldBy kind ('sized' is not one: a sized year says its own target); `plan` is "the cliff plan" /
  // "the applied plan".
  const heldWhy = (kind, plan) =>
    kind === 'aca' ? 'Held by the ACA 400% line'
    : kind === 'irmaa' ? 'Held under an IRMAA tier'
    : kind === 'balance' ? 'The whole remaining balance'
    : kind === 'stayUnder' ? `Held by ${plan}'s stay-under`
    : kind === 'plan' ? `Held by ${plan}'s fill`
    : null;
  // The conversion schedule under the bracket table (Batch 5 step 5, Task 5; the schedule-why plan, 2026-11-03): the dashboard's
  // own run `selected`, from existing row fields only (scheduleRows), read and never written. The bracket the why names is the
  // plan's flat bracket when the plan was made for this setting, else the setting.
  export function renderConversionSchedule(selected) {
    const plan = cliffPlanStore.forState === state ? cliffPlanStore.plan : null,
      bracket = plan && plan.bracket != null && plan.bracketFrom === state.rothConvBracket ? plan.bracket : state.rothConvBracket,
      shown = scheduleRows(selected.rows, bracket, planName(), state.rothConvStartAge, state.rothConvEndAge),
      converts = selected.rows.some((r) => r.conversionAmount >= 1);
    document.getElementById('conversionScheduleTitle').textContent = `Conversions in ${plan ? planName() : 'your plan'}`;
    document.getElementById('conversionScheduleNone').hidden = converts;
    document.getElementById('conversionScheduleRows').closest('.table-wrap').hidden = shown.length === 0;
    document.getElementById('conversionScheduleRows').innerHTML = shown
      .map((s) => `<tr><td>${s.from === s.to ? s.from : `${s.from}-${s.to}`}</td><td>${money(s.amount < 1 ? 0 : displayValue(s.amount, s.year))}</td><td>${escapeHtml(s.why)}</td></tr>`)
      .join('');
  }
  // The schedule's rows (rulings 1 and 2; exported for its test): in ascending age, a row shows when it converts at least $1, when
  // it carries a held kind (convHeldBy: a held $0 year too), or when its age is in the ladder window [startAge, endAge], it converts
  // under $1 and its cliffChoice is a stay-under. Two adjacent shown rows (the later age the earlier + 1) merge when both convert
  // under $1 and say the same why; a converting row never merges. Returns new objects { from, to, amount, year, why }: `amount` is
  // the row's conversion (0 for a row under $1), `year` the first row's year (for the display dollars).
  export function scheduleRows(rows, bracket, planLabel, startAge, endAge) {
    const out = [];
    for (const r of rows) {
      const converts = r.conversionAmount >= 1;
      if (!converts && !r.convHeldBy && !(r.age >= startAge && r.age <= endAge && r.cliffChoice && r.cliffChoice.startsWith('stayed under '))) continue;
      const why = scheduleWhy(r, bracket, planLabel),
        last = out.at(-1);
      if (!converts && last && last.amount === 0 && last.to + 1 === r.age && last.why === why) last.to = r.age;
      else out.push({ from: r.age, to: r.age, amount: converts ? r.conversionAmount : 0, year: r.year, why });
    }
    return out;
  }
  // The schedule's why cell (ruling 3; exported for its test): the first rule that applies.
  // 1. under $1 and a stay-under cliffChoice: "Stayed under" the line;
  // 2. the sized year's own target (convChoice) when nothing but the sizing held it;
  // 3. a fill cliffChoice: "Filled to" the line (a phased fill year's conversion is capped at the natural year's, so the bracket
  //    would be wrong there);
  // 4. the held kind (heldWhy; `planLabel` names the plan);
  // 5. the target of a year another limit held that rule 4 does not name;
  // 6. the flat bracket `bracket`.
  export function scheduleWhy(row, bracket, planLabel) {
    const cap = (t) => t[0].toUpperCase() + t.slice(1),
      cliff = row.cliffChoice || '';
    if (row.conversionAmount < 1 && cliff.startsWith('stayed under ')) return 'Stayed under ' + lineText(cliff.slice('stayed under '.length));
    if (row.convChoice && (!row.convHeldBy || row.convHeldBy === 'sized')) return cap(row.convChoice);
    if (cliff.startsWith('filled to ')) return 'Filled to ' + lineText(cliff.slice('filled to '.length));
    const held = heldWhy(row.convHeldBy, planLabel);
    if (held) return held;
    if (row.convChoice) return cap(row.convChoice);
    return `Fill to the top of the ${bracket}% bracket`;
  }
