// simulateWith and simulateHistoricalWith: the pure run entry points (a run context in, a projection out)

import { historicalYearSource, standardYearSource } from './year-sources.js';
import { BUCKET_MODE } from '#country/core/seam-BUCKET_MODE';
import { runProjection } from '#country/core/seam-runProjection';
import { STANDARD_MODE } from '#country/core/seam-STANDARD_MODE';

  // The standard projection of the context's inputs (constant plan return, inflation and bond assumptions).
  export function simulateWith(ctx, retireAgeA = ctx.inputs.retireAgeA, retireAgeB = ctx.inputs.retireAgeB) {
    return runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA, retireAgeB });
  }
  // The historical / Monte Carlo run on one path (rowFn). ctx.taxFactors must be a fresh array: the year source records
  // each year's tax-index factor in it.
  export function simulateHistoricalWith(ctx, rowFn, retireAgeA = ctx.inputs.retireAgeA, retireAgeB = ctx.inputs.retireAgeB) {
    return runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(ctx.inputs, rowFn, ctx.taxFactors), retireAgeA, retireAgeB });
  }
