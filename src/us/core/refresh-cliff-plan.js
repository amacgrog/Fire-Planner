import { state } from '../../shared/core/store.js';
import { cliffPlanStore } from './cliff-plan-store.js';
import { optimizerState } from './optimizer-state.js';
import { computeCliffPlan } from './run-projection.js';
import { currentYear } from './tax-year.js';

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
