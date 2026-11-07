// simulateWith and simulateHistoricalWith: the pure run entry points (a run context in, a projection out)

import { historicalYearSource } from './year-sources.js';
import { runSourceFor } from './run-source.js';
import { BUCKET_MODE } from '#country/core/seam-BUCKET_MODE';
import { runProjection } from '#country/core/seam-runProjection';

  // Pure since Stage 3 of docs/superpowers/plans/2026-10-22-stateless-engine.md: runProjection and every module it calls read
  // the run's inputs, tax year, tax factors, overrides, sinks and test switches from the context, never from the store.
  // The projection of the context's inputs: the standard one (constant plan return, inflation and bond assumptions), or the
  // market scenario's when the inputs carry one (runSourceFor, the run choke point).
  export function simulateWith(ctx, retireAgeA = ctx.inputs.retireAgeA, retireAgeB = ctx.inputs.retireAgeB) {
    const run = runSourceFor(ctx);
    return runProjection(run.ctx, { mode: run.mode, source: run.source, retireAgeA, retireAgeB });
  }
  // simulateWith that also returns the per-account log (US: each retirement account's year-end dollars, one entry a row; Canada
  // pools its accounts and leaves it empty). The CSV export's run.
  export function simulateWithAccountLog(ctx, retireAgeA = ctx.inputs.retireAgeA, retireAgeB = ctx.inputs.retireAgeB) {
    const accountLog = [];
    const run = runSourceFor(ctx);
    const sim = runProjection(run.ctx, { mode: run.mode, source: run.source, retireAgeA, retireAgeB, accountLog });
    return { sim, accountLog };
  }
  // The historical / Monte Carlo run on one path (rowFn). ctx.taxFactors must be a fresh array: the year source records
  // each year's tax-index factor in it.
  export function simulateHistoricalWith(ctx, rowFn, retireAgeA = ctx.inputs.retireAgeA, retireAgeB = ctx.inputs.retireAgeB) {
    return runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(ctx.inputs, rowFn, ctx.taxFactors), retireAgeA, retireAgeB });
  }
