// Canada store context: a run context built from the live store modules (the adapter above the engine)

import { state } from '../../../shared/core/store.js';
import { CURRENT_YEAR } from '../../../shared/core/projection/year-factors.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';

export function storeContext({ taxFactors = null } = {}) {
  return newRunContext({ inputs: state, taxYear: CURRENT_YEAR, taxFactors });
}
