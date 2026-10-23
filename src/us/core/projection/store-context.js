// US store context: run contexts built from the live store modules (the adapter above the engine)

import { state } from '../../../shared/core/store.js';
import { currentYear } from '../tax-year.js';
import { optimizerState } from '../optimizer-state.js';
import { cliffPlanStore } from '../cliff-plan-store.js';
import { planForState, storeRunContext } from '../cliff-plan/planning.js';

export function storeContext({ withPlan = true, taxFactors = null, plan, planMode } = {}) {
  let p = null;
  let mode = 'off';
  // The plan options are given only with planMode; with planMode undefined `plan` is ignored (planForState decides).
  if (planMode !== undefined) {
    p = plan === undefined ? null : plan;
    mode = planMode;
  } else if (withPlan) {
    p = planForState(state, optimizerState);
    mode = p ? 'apply' : 'off';
  }
  return storeRunContext(state, { taxFactors, plan: p, planMode: mode, overrides: optimizerState });
}
// The context of a variant of `base` (a shallow copy `{ ...base, field: value }`, or base itself) with today's plan rule
// (spec section 6): when `base` is the object the kept plan was made for under the current tax year (planForState's
// identity rule), every variant applies the kept plan; otherwise the variant gets planForState(variant, overrides), planned
// and cached by its own JSON, as an in-place variant of an unrefreshed state is. opts.overrides: an object carrying the two
// override maps (an optimizer trial's), default the store's; it is also what planning sees.
export function variantContext(base, variant, opts = {}) {
  const overrides = opts.overrides ?? optimizerState;
  const plan = base === cliffPlanStore.forState && cliffPlanStore.year === currentYear ? cliffPlanStore.plan : planForState(variant, overrides);
  return storeRunContext(variant, { plan, planMode: plan ? 'apply' : 'off', overrides });
}
