// US store context: a run context built from the live store modules (the adapter above the engine)

import { state } from '../../../shared/core/store.js';
import { currentYear } from '../tax-year.js';
import { optimizerState } from '../optimizer-state.js';
import { magiStats, planStats } from './engine-state.js';
import { testHooks } from '../test-hooks.js';
// Task 5 moves planForState to cliff-plan/planning.js and gives it (inputs, overrides); until then it reads the store.
import { planForState } from './run-projection.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';

// load-time: a literal object of imported bindings (leaf modules, no cycle); read when the module loads
const US_STATS = { magi: magiStats, plan: planStats, hooks: testHooks };

export function storeContext({ withPlan = true, taxFactors = null, plan, planMode } = {}) {
  let p = null;
  let mode = 'off';
  // The plan options are given only with planMode; with planMode undefined `plan` is ignored (planForState decides).
  if (planMode !== undefined) {
    p = plan === undefined ? null : plan;
    mode = planMode;
  } else if (withPlan) {
    p = planForState();
    mode = p ? 'apply' : 'off';
  }
  return newRunContext({
    inputs: state,
    taxYear: currentYear,
    taxFactors,
    plan: p,
    planMode: mode,
    overrides: { rothBracketByAge: optimizerState.rothBracketByAge, withdrawalMixByAge: optimizerState.withdrawalMixByAge },
    stats: US_STATS,
    test: { inhForce: testHooks.testInhForce, inhNoNeedAdj: testHooks.testInhNoNeedAdj },
  });
}
