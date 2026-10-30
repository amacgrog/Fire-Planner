// Cliff plan planning above the engine: the plan cache, planForState, refreshCliffPlan, the summary line and test-plan hook

import { state } from '../../../shared/core/store.js';
import { cliffPlanStore } from '../cliff-plan-store.js';
import { optimizerState } from '../optimizer-state.js';
import { computeCliffPlan } from '../projection/run-projection.js';
import { magiStats, planStats } from '../projection/engine-state.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';
import { currentYear } from '../tax-year.js';
import { testHooks } from '../test-hooks.js';
import { lineNameOf } from './plan-shape.js';

// load-time: a literal object of imported bindings (leaf modules, no cycle); read when the module loads
export const US_STATS = { magi: magiStats, plan: planStats, hooks: testHooks };
// load-time: creates an empty cache Map; reads nothing
export const cliffPlanCache = new Map(), // tax year | JSON of a swapped-in state -> its plan (planForState)
  CLIFF_PLAN_CACHE_MAX = 16;

  // The store-reading part of every US context (storeContext, variantContext, planningContext): `inputs` under the current
  // tax year, the override maps of `overrides` (default the store's optimizerState) copied into a fresh two-key literal, the
  // US stats sinks and a fresh literal of the test switches as they are now. One shape for every context, nested objects
  // included (a second shape reaching the hot functions leaves their property loads polymorphic). It lives here, not in
  // store-context.js, because store-context.js imports this module.
  export function storeRunContext(inputs, { taxFactors = null, plan = null, planMode = 'off', overrides = optimizerState } = {}) {
    return newRunContext({
      inputs,
      taxYear: currentYear,
      taxFactors,
      plan,
      planMode,
      overrides: { rothBracketByAge: overrides.rothBracketByAge, withdrawalMixByAge: overrides.withdrawalMixByAge },
      stats: US_STATS,
      test: { inhForce: testHooks.testInhForce, inhNoNeedAdj: testHooks.testInhNoNeedAdj, seCarryAt: testHooks.testSeCarryAt, seNoSettle: testHooks.testSeNoSettle, bracketSearchOff: testHooks.testBracketSearchOff, convSizingOff: testHooks.testConvSizingOff, convRunBudget: null, sizedTrials: testHooks.sizedTrials },
    });
  }
  // The planning context of `inputs` under the current tax year with the given override maps.
  function planningContext(inputs, overrides) {
    return storeRunContext(inputs, { overrides });
  }
  // The plan a default projection applies (spec section 3, "Stale plans"): the dashboard and in-place variants project the
  // object render() planned for; a swapped-in or replaced state (comparison, overlay, load / undo / reset before render)
  // gets the plan of its own inputs under the current tax year, cached by the year and their JSON (refreshCliffPlan keys on
  // the year too). The state-replacement sites are in shared regions and are not edited: this is the whole stale-plan rule.
  // `overrides` (an object carrying the optimizer's two override maps, default the store's optimizerState; only the two maps
  // are read, copied into the planning context) are used only when it has to plan; the cache key is
  // the tax year and the inputs' JSON, so the first plan cached for a JSON wins.
  // Since Stage 3 the engine reads only its context, so planning sees exactly `inputs` and `overrides`.
  // The bracket search (spec A7): the identity branch serves the stored plan searched or not (the light render's own runs
  // reach it, and the user's-bracket plan shows while typing); the JSON match serves a searched plan, and also the light
  // render's unsearched one while its search is pending (a normalized copy of the live state, as the scenario comparison's
  // current row and overlay project, must not run the search on a keystroke: the deferred pass redraws them through
  // renderBody when the kept plan differs). The cache holds only searched plans (planning here always searches); a computed,
  // searched stored plan served by the JSON match is also cached, so a copy of it (a saved scenario equal to the live state)
  // is not planned again once the live state moves on.
  export function planForState(inputs, overrides = optimizerState) {
    if (inputs === cliffPlanStore.forState && cliffPlanStore.year === currentYear) return cliffPlanStore.plan;
    if (!inputs.cliffGuardEnabled) return null;
    const key = JSON.stringify(inputs);
    const cacheKey = currentYear + '|' + key;
    if (key === cliffPlanStore.key && cliffPlanStore.year === currentYear && (cliffPlanStore.searched || cliffPlanStore.searchPending)) {
      if (cliffPlanStore.searched && cliffPlanStore.computed && !cliffPlanCache.has(cacheKey)) {
        if (cliffPlanCache.size >= CLIFF_PLAN_CACHE_MAX) cliffPlanCache.clear();
        cliffPlanCache.set(cacheKey, cliffPlanStore.plan);
      }
      return cliffPlanStore.plan;
    }
    if (cliffPlanCache.has(cacheKey)) return cliffPlanCache.get(cacheKey);
    const plan = computeCliffPlan(planningContext(inputs, overrides)).plan;
    cliffPlanStore.stateComputes++;
    if (cliffPlanCache.size >= CLIFF_PLAN_CACHE_MAX) cliffPlanCache.clear();
    cliffPlanCache.set(cacheKey, plan);
    return plan;
  }

  // Cliff plan summary line (spec section 7): the kept plan's intents grouped into runs of consecutive ages, then the
  // families that had a candidate and were not kept, then the conversion clause of the bracket search (Batch 5 step 3a,
  // spec A5.7): only once the search has run and had other brackets to try (none while it is pending in the deferred pass),
  // also when no steering helps.
  // A stored plan in use (Batch 5 step 4a, spec 4.3: report.stored.used, `plan` being the stored plan) reads "Applied plan:"
  // with the same clauses over its intents, no "not used" family clauses (they describe the automatic plan, not running), and
  // a bracket clause only when the plan converts (report.stored.converts: conversions on, a conversion age inside the plan)
  // and its bracket is honoured (made for the current setting) and differs from it (after the setting changed, `apply`
  // converts at the setting).
  // The order lever (Batch 5 step 4c): the plan's orders, as runs of consecutive ages, make one clause after the cliff clauses
  // ("draw traditional before taxable at 60-63, 66"); "no steering" only when the plan has neither intents nor orders.
  // Batch 5 step 5b piece 3 (spec B8): the sized conversions' clause follows the bracket clause, inside the same `conversions`
  // string (so the no-steering return prints it too): convSizingClause. With a bracket clause the two make one "Conversions:"
  // clause (R5 I-3, owner wording): "Conversions: your 22% bracket (no other flat bracket does better), sized by year: …".
  // The applied plan's sizing clause prints only where `apply` follows it: the plan is honoured for the current setting.
  export function cliffPlanSummary(plan, report) {
    if (!plan) return 'Cliff plan: off.';
    const applied = !!(report && report.stored && report.stored.used);
    const bracketClause = applied
      ? report.stored.converts && report.stored.bracketHonoured && plan.bracket != null && plan.bracket !== plan.bracketFrom
        ? ` Conversions: the applied plan uses the ${plan.bracket}% bracket.`
        : ''
      : report && report.searched && report.brackets.length > 1 && plan.bracket != null
        ? plan.bracket !== plan.bracketFrom
          ? ` Conversions: the cliff plan uses the ${plan.bracket}% bracket, not your ${plan.bracketFrom}%, within your conversion ages.`
          : ` Conversions: your ${plan.bracketFrom}% bracket (no other flat bracket does better).`
        : '';
    // the track ran and was not kept (no targets): with a bracket clause the two merge into one "Conversions:" clause
    // the targets' runs, '' when there are none or (an applied plan) when apply does not follow them (made for another setting)
    const sizedRuns = applied && !report.stored.bracketHonoured ? '' : convRunsOf(plan);
    const sizedNotKept = !applied && !!(report && report.sized && !report.sized.kept) && !(plan.conv && Object.keys(plan.conv).length);
    const conversions =
      bracketClause && sizedNotKept
        ? plan.bracket !== plan.bracketFrom
          ? ` Conversions: the cliff plan uses the ${plan.bracket}% bracket, not your ${plan.bracketFrom}%, within your conversion ages; tax-aware sizing found nothing better.`
          : ` Conversions: your ${plan.bracketFrom}% bracket (no other flat bracket does better; tax-aware sizing found nothing better).`
        : bracketClause && sizedRuns
          ? // a bracket clause and kept targets: one clause ("…, sized by year: …"), the bracket clause's final period dropped
            bracketClause.slice(0, -1) + ', sized by year: ' + sizedRuns + ' (tax-aware sizing).'
          : bracketClause + convSizingClause(sizedRuns, report, applied);
    const ages = Object.keys(plan.intents).map(Number).sort((a, b) => a - b),
      orderAges = plan.orders ? Object.keys(plan.orders).map(Number).sort((a, b) => a - b) : [],
      splitAges = plan.splits ? Object.keys(plan.splits).map(Number).sort((a, b) => a - b) : [];
    if (!ages.length && !orderAges.length && !splitAges.length) return (applied ? 'Applied plan: no steering.' : 'Cliff plan: no steering helps this plan.') + conversions;
    const runs = [];
    for (const age of ages) {
      const i = plan.intents[age],
        last = runs[runs.length - 1];
      if (last && last.kind === i.kind && last.line === i.line && last.ret === i.ret && last.to === age - 1) last.to = age;
      else runs.push({ kind: i.kind, line: i.line, ret: i.ret, from: age, to: age });
    }
    const clause = (r) =>
      `${r.kind === 'under' ? 'stay under' : 'fill to'} ${lineNameOf(r.line)}${r.ret === 'A' || r.ret === 'B' ? ` (Partner ${r.ret}'s return)` : ''} at ${r.from === r.to ? r.from : r.from + '-' + r.to}`;
    const ordered = runs.filter((r) => r.kind === 'under').concat(runs.filter((r) => r.kind !== 'under'));
    const clauses = ordered.map(clause);
    // runs of consecutive ages, e.g. "60-63, 66"
    const spansOf = (list) => {
      const spans = [];
      for (const age of list) {
        const last = spans[spans.length - 1];
        if (last && last.to === age - 1) last.to = age;
        else spans.push({ from: age, to: age });
      }
      return spans.map((r) => (r.from === r.to ? r.from : r.from + '-' + r.to)).join(', ');
    };
    if (orderAges.length) clauses.push('draw traditional before taxable at ' + spansOf(orderAges));
    // Batch 5 step 4d: the split clause, Partner A's ages then Partner B's
    for (const who of ['A', 'B']) {
      const list = splitAges.filter((a) => plan.splits[a] === who);
      if (list.length) clauses.push(`draw Partner ${who}'s traditional accounts first at ` + spansOf(list));
    }
    let text = (applied ? 'Applied plan: ' : 'Cliff plan: ') + clauses.join('; ') + '.';
    if (report && !applied) {
      const fams = new Set(report.candidates.map((c) => c.family));
      for (const [fam, name] of [['aca', 'ACA steering'], ['irmaa', 'IRMAA stay-unders']])
        if (fams.has(fam) && report.kept !== fam && report.kept !== 'all') text += ` ${name} not used (no gain over the whole plan).`;
    }
    return text + conversions;
  }
  // The sized conversions' clause (Batch 5 step 5b piece 3, spec B8), when no bracket clause prints: `runs` (convRunsOf, the
  // plan's conversion targets as runs of consecutive ages with an equal target), "Conversions: the top of the 24% bracket at 62-65; just under IRMAA tier 2 at 66-70;
  // none at 71-74 (tax-aware sizing)."; a per-return line target names its return. With no targets, when the automatic plan's
  // sized track ran and was not kept: "Conversions: the plan's bracket (tax-aware sizing found nothing better)."; otherwise nothing.
  function convSizingClause(runs, report, applied) {
    if (!runs) return !applied && report && report.sized && !report.sized.kept ? " Conversions: the plan's bracket (tax-aware sizing found nothing better)." : '';
    return ' Conversions: ' + runs + ' (tax-aware sizing).';
  }
  // The plan's targets as runs of consecutive ages with an equal target ("the top of the 24% bracket at 62-65; none at 71-74"),
  // or '' when the plan has none.
  function convRunsOf(plan) {
    const conv = plan.conv,
      ages = conv ? Object.keys(conv).map(Number).sort((a, b) => a - b) : [];
    if (!ages.length) return '';
    const text = (t) =>
      t === 'none'
        ? 'none'
        : typeof t === 'string'
          ? `the top of the ${t.slice(1)}% bracket`
          : `${t.side === 'under' ? 'just under' : 'just over'} ${lineNameOf(t.id)}${t.ret === 'A' || t.ret === 'B' ? ` (Partner ${t.ret}'s return)` : ''}`;
    const runs = [];
    for (const age of ages) {
      const t = text(conv[age]),
        last = runs[runs.length - 1];
      if (last && last.t === t && last.to === age - 1) last.to = age;
      else runs.push({ t, from: age, to: age });
    }
    return runs.map((r) => `${r.t} at ${r.from === r.to ? r.from : r.from + '-' + r.to}`).join('; ');
  }
  // Plans for the current state (top of render()) and records which state object the plan belongs to. The plan is re-chosen
  // only when the inputs change: same state JSON, tax year and optimizer overrides keep the plan already computed.
  // `light` (the light render of a field input, spec A7): plan with the bracket search skipped (the user's-bracket plan) and,
  // when the search applies, leave it pending for the deferred pass; a full refresh (the default) runs the search, also for
  // an unchanged key whose stored plan is not searched yet.
  export function refreshCliffPlan({ light = false } = {}) {
    const key = JSON.stringify(state);
    cliffPlanStore.forState = state;
    const same = cliffPlanStore.computed && key === cliffPlanStore.key && cliffPlanStore.year === currentYear && cliffPlanStore.overrides && cliffPlanStore.overrides[0] === optimizerState.rothBracketByAge && cliffPlanStore.overrides[1] === optimizerState.withdrawalMixByAge;
    if (same && (light || cliffPlanStore.searched)) return;
    cliffPlanStore.key = key;
    cliffPlanStore.year = currentYear;
    cliffPlanStore.overrides = [optimizerState.rothBracketByAge, optimizerState.withdrawalMixByAge];
    ({ plan: cliffPlanStore.plan, report: cliffPlanStore.report } = computeCliffPlan(planningContext(state, optimizerState), { search: !light }));
    // Guard off: no report, nothing to search.
    cliffPlanStore.searched = !cliffPlanStore.report || cliffPlanStore.report.searched;
    cliffPlanStore.searchPending = !cliffPlanStore.searched;
    cliffPlanStore.computed = true;
    cliffPlanStore.computes++;
  }
  // Whether the light render left the bracket search to the deferred pass (the shared render scheduler reads it through
  // #country/core/seam-searchPending, to set the deferred timer with no stale panel).
  export function searchPending() {
    return cliffPlanStore.searchPending;
  }
  // Cliff plan in tests: a test changes state and calls a shared hook without render(), so the hooks plan for the state
  // they see (production plans in render()). Benchmarks use the raw hooks after one explicit refresh.
  export const ensureTestPlan = () => {
    if (JSON.stringify(state) !== cliffPlanStore.key || cliffPlanStore.year !== currentYear || !cliffPlanStore.searched) refreshCliffPlan();
  };
