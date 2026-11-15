// The Canada legacy figure: the after-tax estate in today's dollars, and the sentence that names it

import { displayValueOf } from '../../../shared/core/format/display-value.js';
import { pricingContextFor } from '../../../shared/core/projection/run-source.js';
import { afterTaxEstate } from './estate.js';

  // The real after-tax estate of the run.
  export function legacyValue(ctx, sim) {
    const last = sim.rows[sim.rows.length - 1];
    return displayValueOf('real', ctx.inputs.inflation, afterTaxEstate(pricingContextFor(ctx), sim), last.year, last.cumFactor);
  }

  export const LEGACY_PHRASE = (x) =>
    `the after-tax estate is about ${x} in today's dollars, after tax on the RRSP/RRIF and gains at the last death, and probate`;
