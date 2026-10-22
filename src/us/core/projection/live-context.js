// US LIVE_CTX: the temporary run-context bridge that reads the live store (deleted with the stage 3 bridge)

import { state } from '../../../shared/core/store.js';
import { histTaxFactors } from '../../../shared/core/tax-factors.js';
import { currentYear } from '../tax-year.js';
import { optimizerState } from '../optimizer-state.js';
import { testHooks } from '../test-hooks.js';
import { magiStats, planStats } from './engine-state.js';

// load-time: a literal object of imported bindings (leaf modules, no cycle); read when the module loads
const LIVE_STATS = { magi: magiStats, plan: planStats, hooks: testHooks };

// Getters only, so the initializer is inert; same key order as newRunContext.
export const LIVE_CTX = {
  get inputs() { return state; },
  get taxYear() { return currentYear; },
  get taxFactors() { return histTaxFactors; },
  get plan() { return null; },
  get planMode() { return 'off'; },
  get overrides() { return optimizerState; },
  get stats() { return LIVE_STATS; },
  get test() { return { inhForce: testHooks.testInhForce, inhNoNeedAdj: testHooks.testInhNoNeedAdj }; },
};
