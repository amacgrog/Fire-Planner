// Canada store context: run contexts built from the live store modules (the adapter above the engine)

import { state } from '../../../shared/core/store.js';
import { CURRENT_YEAR } from '../../../shared/core/projection/year-factors.js';
import { newRunContext } from '../../../shared/core/projection/run-context.js';

export function storeContext({ taxFactors = null } = {}) {
  return newRunContext({ inputs: state, taxYear: CURRENT_YEAR, taxFactors });
}
// The context of a variant of `base` (a shallow copy, or base itself): Canada has no plan and no overrides, so `base` and
// `opts` are not read; the signature is the US one (the seam).
export function variantContext(base, variant, opts = {}) {
  return newRunContext({ inputs: variant, taxYear: CURRENT_YEAR });
}
