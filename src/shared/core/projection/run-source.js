// runSourceFor: the run choke point (the year source and mode of a normal run: the plan's rates, or the market scenario)

import { standardYearSource } from './year-sources.js';
import { scenarioYearSource } from './scenario-source.js';
import { newRunContext } from './run-context.js';
import { BUCKET_MODE } from '#country/core/seam-BUCKET_MODE';
import { STANDARD_MODE } from '#country/core/seam-STANDARD_MODE';

  // Every normal (non-historical, non-Monte Carlo) run takes its context, mode and year source from here:
  // runProjection(run.ctx, { mode: run.mode, source: run.source, ... }).
  // Without ctx.inputs.marketScenario: the very ctx passed in, STANDARD_MODE and the standard source (today's run).
  // With one: a fresh context (every field copied, taxFactors a new empty array, since the scenario source records each
  // year's tax-index factor in it), the bucket strategy unless the scenario's order is 'standard', and the scenario source.
  export function runSourceFor(ctx) {
    const sc = ctx.inputs.marketScenario;
    if (!sc) return { ctx, mode: STANDARD_MODE, source: standardYearSource(ctx.inputs) };
    const run = newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: [], plan: ctx.plan, planMode: ctx.planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
    return { ctx: run, mode: sc.order === 'standard' ? STANDARD_MODE : BUCKET_MODE, source: scenarioYearSource(run.inputs, run.taxFactors) };
  }
