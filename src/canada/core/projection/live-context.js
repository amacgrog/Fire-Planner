// Canada LIVE_CTX: the temporary run-context bridge that reads the live store (deleted with the stage 3 bridge)

import { state } from '../../../shared/core/store.js';
import { histTaxFactors } from '../../../shared/core/tax-factors.js';
import { CURRENT_YEAR } from '../../../shared/core/projection/year-factors.js';
import { NO_OVERRIDES, NO_TEST } from '../../../shared/core/projection/run-context.js';

// Getters only, so the initializer is inert; same key order as newRunContext.
export const LIVE_CTX = {
  get inputs() { return state; },
  get taxYear() { return CURRENT_YEAR; },
  get taxFactors() { return histTaxFactors; },
  get plan() { return null; },
  get planMode() { return 'off'; },
  get overrides() { return NO_OVERRIDES; },
  get stats() { return null; },
  get test() { return NO_TEST; },
};
