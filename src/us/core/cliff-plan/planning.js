// Cliff plan planning: refresh the plan, its summary line and test-plan hook

import { state } from '../../../shared/core/store.js';
import { cliffPlanStore } from '../cliff-plan-store.js';
import { optimizerState } from '../optimizer-state.js';
import { computeCliffPlan } from '../projection/run-projection.js';
import { currentYear } from '../tax-year.js';

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
    ({ plan: cliffPlanStore.plan, report: cliffPlanStore.report } = computeCliffPlan());
    cliffPlanStore.computed = true;
    cliffPlanStore.computes++;
  }
  // Cliff plan in tests: a test changes state and calls a shared hook without render(), so the hooks plan for the state
  // they see (production plans in render()). Benchmarks use the raw hooks after one explicit refresh.
  export const ensureTestPlan = () => {
    if (JSON.stringify(state) !== cliffPlanStore.key || cliffPlanStore.year !== currentYear) refreshCliffPlan();
  };
