import { state } from '../../shared/core/store.js';
import { cliffPlanStore } from './cliff-plan-store.js';
import { refreshCliffPlan } from './refresh-cliff-plan.js';
import { currentYear } from './tax-year.js';

  // Cliff plan in tests: a test changes state and calls a shared hook without render(), so the hooks plan for the state
  // they see (production plans in render()). Benchmarks use the raw hooks after one explicit refresh.
  export const ensureTestPlan = () => {
    if (JSON.stringify(state) !== cliffPlanStore.key || cliffPlanStore.year !== currentYear) refreshCliffPlan();
  };
