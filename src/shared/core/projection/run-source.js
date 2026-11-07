// runSourceFor: the run choke point (the year source and mode of a normal run: the plan's rates, or the market scenario)

import { standardYearSource } from './year-sources.js';
import { scenarioYearSource, scenarioFactorPath } from './scenario-source.js';
import { newRunContext } from './run-context.js';
import { BUCKET_MODE } from '#country/core/seam-BUCKET_MODE';
import { STANDARD_MODE } from '#country/core/seam-STANDARD_MODE';

  // Every normal (non-historical, non-Monte Carlo) run takes its context, mode and year source from here:
  // runProjection(run.ctx, { mode: run.mode, source: run.source, ... }).
  // Without ctx.inputs.marketScenario: the very ctx passed in, STANDARD_MODE and the standard source (today's run).
  // With one: a fresh context (every field copied, taxFactors pre-filled with the scenario's factor path, a new array the source also writes each year's
  // tax-index factor into), the bucket strategy unless the scenario's order is 'standard', and the scenario source.
  export function runSourceFor(ctx) {
    const sc = ctx.inputs.marketScenario;
    if (!sc) return { ctx, mode: STANDARD_MODE, source: standardYearSource(ctx.inputs) };
    const run = newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: scenarioFactorPath(ctx.inputs), plan: ctx.plan, planMode: ctx.planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
    return { ctx: run, mode: sc.order === 'standard' ? STANDARD_MODE : BUCKET_MODE, source: scenarioYearSource(run.inputs, run.taxFactors) };
  }

  // The context the pricing of a finished run reads (afterTaxEndValueUS, afterTaxEstate, the objectives): the very ctx without a
  // scenario or when it already carries a path (a historical run's, or a scenario run's); else a copy whose taxFactors is the
  // scenario's path, so the brackets and the deflator are the path's own. It never writes the ctx it is given.
  export function pricingContextFor(ctx) {
    if (!ctx.inputs.marketScenario || ctx.taxFactors !== null) return ctx;
    return newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: scenarioFactorPath(ctx.inputs), plan: ctx.plan, planMode: ctx.planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
  }
