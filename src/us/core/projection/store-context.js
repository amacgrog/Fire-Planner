// US store context: a run context built from the live store modules (the adapter above the engine)

import { state } from '../../../shared/core/store.js';
import { currentYear } from '../tax-year.js';
import { optimizerState } from '../optimizer-state.js';
import { testHooks } from '../test-hooks.js';
import { planForState, US_STATS } from '../cliff-plan/planning.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';

export function storeContext({ withPlan = true, taxFactors = null, plan, planMode } = {}) {
  const overrides = { rothBracketByAge: optimizerState.rothBracketByAge, withdrawalMixByAge: optimizerState.withdrawalMixByAge };
  let p = null;
  let mode = 'off';
  // The plan options are given only with planMode; with planMode undefined `plan` is ignored (planForState decides).
  if (planMode !== undefined) {
    p = plan === undefined ? null : plan;
    mode = planMode;
  } else if (withPlan) {
    p = planForState(state, overrides);
    mode = p ? 'apply' : 'off';
  }
  return newRunContext({
    inputs: state,
    taxYear: currentYear,
    taxFactors,
    plan: p,
    planMode: mode,
    overrides,
    stats: US_STATS,
    test: { inhForce: testHooks.testInhForce, inhNoNeedAdj: testHooks.testInhNoNeedAdj },
  });
}
