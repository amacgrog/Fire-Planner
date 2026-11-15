// The US legacy figure: the plan's end value in today's dollars, the home included, and the sentence that names it

import { displayValueOf } from '../../../shared/core/format/display-value.js';

  // The last row's total, in today's dollars.
  export function legacyValue(ctx, sim) {
    const last = sim.rows[sim.rows.length - 1];
    return displayValueOf('real', ctx.inputs.inflation, last.total, last.year, last.cumFactor);
  }

  export const LEGACY_PHRASE = (x) => `the plan ends with about ${x} in today's dollars, the home included`;
