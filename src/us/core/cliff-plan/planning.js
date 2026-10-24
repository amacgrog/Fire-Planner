// Cliff plan planning above the engine: the plan cache, planForState, refreshCliffPlan, the summary line and test-plan hook

import { state } from '../../../shared/core/store.js';
import { cliffPlanStore } from '../cliff-plan-store.js';
import { optimizerState } from '../optimizer-state.js';
import { computeCliffPlan } from '../projection/run-projection.js';
import { magiStats, planStats } from '../projection/engine-state.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';
import { currentYear } from '../tax-year.js';
import { testHooks } from '../test-hooks.js';

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
      test: { inhForce: testHooks.testInhForce, inhNoNeedAdj: testHooks.testInhNoNeedAdj, seCarryAt: testHooks.testSeCarryAt, seNoSettle: testHooks.testSeNoSettle, bracketSearchOff: testHooks.testBracketSearchOff },
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
  export function planForState(inputs, overrides = optimizerState) {
    if (inputs === cliffPlanStore.forState && cliffPlanStore.year === currentYear) return cliffPlanStore.plan;
    if (!inputs.cliffGuardEnabled) return null;
    const key = JSON.stringify(inputs);
    if (key === cliffPlanStore.key && cliffPlanStore.year === currentYear) return cliffPlanStore.plan;
    const cacheKey = currentYear + '|' + key;
    if (cliffPlanCache.has(cacheKey)) return cliffPlanCache.get(cacheKey);
    const plan = computeCliffPlan(planningContext(inputs, overrides)).plan;
    if (cliffPlanCache.size >= CLIFF_PLAN_CACHE_MAX) cliffPlanCache.clear();
    cliffPlanCache.set(cacheKey, plan);
    return plan;
  }

  // Cliff plan summary line (spec section 7): the kept plan's intents grouped into runs of consecutive ages, then the
  // families that had a candidate and were not kept.
  export function cliffPlanSummary(plan, report) {
    if (!plan) return 'Cliff plan: off.';
    const ages = Object.keys(plan.intents).map(Number).sort((a, b) => a - b);
    if (!ages.length) return 'Cliff plan: no steering helps this plan.';
    const lineName = (id) => {
      const m = /^irmaa([0-9]+)$/.exec(id);
      return id === 'aca400' ? 'the ACA 400% line' : id === 'acaFloor' ? 'the ACA credit floor' : id === 'medicaid' ? 'the Medicaid line' : m ? `IRMAA tier ${m[1]}` : id;
    };
    const runs = [];
    for (const age of ages) {
      const i = plan.intents[age],
        last = runs[runs.length - 1];
      if (last && last.kind === i.kind && last.line === i.line && last.ret === i.ret && last.to === age - 1) last.to = age;
      else runs.push({ kind: i.kind, line: i.line, ret: i.ret, from: age, to: age });
    }
    const clause = (r) =>
      `${r.kind === 'under' ? 'stay under' : 'fill to'} ${lineName(r.line)}${r.ret === 'A' || r.ret === 'B' ? ` (Partner ${r.ret}'s return)` : ''} at ${r.from === r.to ? r.from : r.from + '-' + r.to}`;
    const ordered = runs.filter((r) => r.kind === 'under').concat(runs.filter((r) => r.kind !== 'under'));
    let text = 'Cliff plan: ' + ordered.map(clause).join('; ') + '.';
    if (report) {
      const fams = new Set(report.candidates.map((c) => c.family));
      for (const [fam, name] of [['aca', 'ACA steering'], ['irmaa', 'IRMAA stay-unders']])
        if (fams.has(fam) && report.kept !== fam && report.kept !== 'all') text += ` ${name} not used (no gain over the whole plan).`;
    }
    return text;
  }
  // Plans for the current state (top of render()) and records which state object the plan belongs to. The plan is re-chosen
  // only when the inputs change: same state JSON, tax year and optimizer overrides keep the plan already computed.
  export function refreshCliffPlan() {
    const key = JSON.stringify(state);
    cliffPlanStore.forState = state;
    if (cliffPlanStore.computed && key === cliffPlanStore.key && cliffPlanStore.year === currentYear && cliffPlanStore.overrides && cliffPlanStore.overrides[0] === optimizerState.rothBracketByAge && cliffPlanStore.overrides[1] === optimizerState.withdrawalMixByAge) return;
    cliffPlanStore.key = key;
    cliffPlanStore.year = currentYear;
    cliffPlanStore.overrides = [optimizerState.rothBracketByAge, optimizerState.withdrawalMixByAge];
    ({ plan: cliffPlanStore.plan, report: cliffPlanStore.report } = computeCliffPlan(planningContext(state, optimizerState)));
    cliffPlanStore.computed = true;
    cliffPlanStore.computes++;
  }
  // Cliff plan in tests: a test changes state and calls a shared hook without render(), so the hooks plan for the state
  // they see (production plans in render()). Benchmarks use the raw hooks after one explicit refresh.
  export const ensureTestPlan = () => {
    if (JSON.stringify(state) !== cliffPlanStore.key || cliffPlanStore.year !== currentYear) refreshCliffPlan();
  };
