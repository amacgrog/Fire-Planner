// The engine entry points. simulate, runHistoricalCycles and monteCarloSummary are the cached store wrappers (US: re-plan
// through ensureTestPlan first); simulateRaw, simulateHistoricalRaw and runHistoricalCyclesRaw are uncached, like the
// window.__test_* hooks (in the US the raw ones skip ensureTestPlan, as __test_simulateRaw does).
// accountTrace is US only (mirror of src/us/ui/install-test-hooks.js).
import { guardWorld } from './world.js';

export async function engine(w) {
  return guardWorld(w, await buildEngine(w), 'engine');
}

async function buildEngine(w) {
  const sim = await w.load('shared/core/projection/simulate.js');
  const { simulate, simulateFresh, simulateHistorical, runHistoricalCycles, runHistoricalCyclesFresh, runMonteCarlo, monteCarloSummary } = sim;
  if (w.country !== 'us') {
    return {
      simulate, simulateHistorical, runHistoricalCycles, runMonteCarlo, monteCarloSummary,
      simulateRaw: simulateFresh, simulateHistoricalRaw: simulateHistorical, runHistoricalCyclesRaw: runHistoricalCyclesFresh,
      accountTrace: undefined,
    };
  }
  const { ensureTestPlan } = await w.load('us/core/cliff-plan/planning.js');
  const store = await w.load('shared/core/store.js');
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const { BUCKET_MODE, STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { historicalYearSource, standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  return {
    simulate: (...a) => (ensureTestPlan(), simulate(...a)),
    simulateHistorical: (...a) => (ensureTestPlan(), simulateHistorical(...a)),
    runHistoricalCycles: (...a) => (ensureTestPlan(), runHistoricalCycles(...a)),
    runMonteCarlo: (...a) => (ensureTestPlan(), runMonteCarlo(...a)),
    monteCarloSummary: (...a) => (ensureTestPlan(), monteCarloSummary(...a)),
    simulateRaw: simulateFresh,
    simulateHistoricalRaw: simulateHistorical,
    runHistoricalCyclesRaw: runHistoricalCyclesFresh,
    accountTrace(retireAgeA = store.state.retireAgeA, retireAgeB = store.state.retireAgeB, hist) {
      ensureTestPlan();
      const trace = [];
      const ctx = storeContext({ taxFactors: hist ? [] : null });
      if (hist) runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(ctx.inputs, hist, ctx.taxFactors), retireAgeA, retireAgeB, trace });
      else runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA, retireAgeB, trace });
      return trace;
    },
  };
}
