// The engine entry points with the behavior of the window.__test_* hooks (US: re-plans through
// ensureTestPlan first; Canada: the shared functions). simulateRaw, simulateHistoricalRaw and
// accountTrace are US only (mirror of src/us/ui/install-test-hooks.js).
import { guardWorld } from './world.js';

export async function engine(w) {
  return guardWorld(w, await buildEngine(w), 'engine');
}

async function buildEngine(w) {
  const sim = await w.load('shared/core/projection/simulate.js');
  const { simulate, simulateHistorical, runHistoricalCycles, runMonteCarlo } = sim;
  if (w.country !== 'us') {
    return {
      simulate, simulateHistorical, runHistoricalCycles, runMonteCarlo,
      simulateRaw: simulate, simulateHistoricalRaw: simulateHistorical,
      accountTrace: undefined,
    };
  }
  const { ensureTestPlan } = await w.load('us/core/cliff-plan/planning.js');
  const store = await w.load('shared/core/store.js');
  const tf = await w.load('shared/core/tax-factors.js');
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const { BUCKET_MODE, STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { historicalYearSource, standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  return {
    simulate: (...a) => (ensureTestPlan(), simulate(...a)),
    simulateHistorical: (...a) => (ensureTestPlan(), simulateHistorical(...a)),
    runHistoricalCycles: (...a) => (ensureTestPlan(), runHistoricalCycles(...a)),
    runMonteCarlo: (...a) => (ensureTestPlan(), runMonteCarlo(...a)),
    simulateRaw: simulate,
    simulateHistoricalRaw: simulateHistorical,
    accountTrace(retireAgeA = store.state.retireAgeA, retireAgeB = store.state.retireAgeB, hist) {
      ensureTestPlan();
      const trace = [];
      const ctx = storeContext({ taxFactors: hist ? [] : null });
      if (hist) {
        const prevTaxFactors = tf.histTaxFactors;
        tf.assignHistTaxFactors(ctx.taxFactors);
        try {
          runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(ctx.inputs, hist, ctx.taxFactors), retireAgeA, retireAgeB, trace });
        } finally {
          tf.assignHistTaxFactors(prevTaxFactors);
        }
      } else runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA, retireAgeB, trace });
      return trace;
    },
  };
}
