// simulate, simulateHistorical, historical cycles and Monte Carlo wrappers

import { HIST } from './historical-data.js';
import { state } from '../store.js';
import { simulateHistoricalWith, simulateWith } from './runs.js';
import { storeContext } from '#country/core/seam-storeContext';
import { pct } from '../format/numbers.js';
import { monteCarloBands } from '../format/monte-carlo-bands.js';

  // Monte Carlo via block bootstrap: instead of drawing each year's return
  // independently (which has no memory of real market behavior — no mean
  // reversion, no regime clustering, no macro coherence between stocks,
  // bonds, and inflation), each simulated path is built by randomly
  // stitching together contiguous 5-year blocks of the actual 1928-2025
  // historical record. Every block is something that really happened, so a
  // path structurally cannot contain an unrealistic run (e.g. decades of
  // one-directional returns) the way independent-draw Monte Carlo can.
  // The block draws are seeded from the inputs (monteCarloSeed), so the same
  // plan always gets the same paths and success rate.
  const MC_BLOCK_SIZE = 5;
  export function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // The seed: a hash of the tax year, the path count and the inputs serialized with sorted keys (so key order never matters).
  // dismissedEstimates and dismissedUnusualAssumptions are left out: they only hide warnings in the UI and the engine never reads them.
  export function monteCarloSeed(taxYear, pathCount, inputs) {
    const { dismissedEstimates, dismissedUnusualAssumptions, ...rest } = inputs;
    const canonical = JSON.stringify(rest, (k, v) =>
      v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v
    );
    return fnv1a32(taxYear + '|' + pathCount + '|' + canonical);
  }
  function bootstrapReturnSeries(length, rand) {
    const series = [],
      maxStart = HIST.length - MC_BLOCK_SIZE;
    while (series.length < length) {
      const s = Math.floor(rand() * (maxStart + 1));
      for (let i = 0; i < MC_BLOCK_SIZE && series.length < length; i++) series.push(HIST[s + i]);
    }
    return series;
  }
  // The store's projection: a context built from the store (US: planned with planForState), then the pure run.
  export function simulate(retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB) {
    return simulateWith(storeContext(), retireAgeA, retireAgeB);
  }
  // Historical S&P 500 backtest. Runs the same engine as simulate() (same income,
  // contribution, tax, ACA, IRMAA and Roth-conversion mechanics) but drives stock returns,
  // inflation and bond returns from the actual 1928-2025 sequence (or a bootstrapped path)
  // and replaces the standard withdrawal cascade with a cash + bonds "bucket strategy":
  // expenses in a market-down year are paid from cash then the bond reserve only; in an up
  // year they are paid from taxable -> traditional -> Roth and the bond reserve is topped
  // back up from the same order. Cash/HYSA and mortgage still use the fixed rates from the
  // sidebar, since no historical series is loaded for either.
  // The context is built first (US: planForState, whose nested planning runs see no tax factors); the run records each
  // year's tax-index factor in the context's own fresh array (ctx.taxFactors), which taxIndexFactor reads.
  export function simulateHistorical(rowFn, retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB) {
    return simulateHistoricalWith(storeContext({ taxFactors: [] }), rowFn, retireAgeA, retireAgeB);
  }
  // Runs every historical start year with a full run of data available for
  // the current projection length and returns each cycle's outcome plus the
  // resulting success rate.
  export function runHistoricalCycles() {
    const projectionYears = state.singlePerson
      ? Math.max(0, state.lifeExpectancyA - state.ageA)
      : Math.max(0, state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    const lastStart = HIST.length - 1 - projectionYears;
    if (lastStart < 0) return { cycles: [], successRate: null, projectionYears };
    const cycles = [];
    for (let i = 0; i <= lastStart; i++) cycles.push(simulateHistorical((y) => HIST[i + y]));
    const successRate = cycles.filter((c) => !c.depletedAge).length / cycles.length;
    return { cycles, successRate, projectionYears };
  }
  export function runMonteCarlo(pathCount) {
    const projectionYears = state.singlePerson
      ? Math.max(0, state.lifeExpectancyA - state.ageA)
      : Math.max(0, state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    const length = projectionYears + 1,
      paths = [],
      rand = mulberry32(monteCarloSeed(storeContext({ withPlan: false }).taxYear, pathCount, state));
    for (let i = 0; i < pathCount; i++) {
      const series = bootstrapReturnSeries(length, rand);
      paths.push(simulateHistorical((y) => series[y]));
    }
    const successRate = paths.filter((p) => !p.depletedAge).length / paths.length;
    return { paths, successRate, projectionYears };
  }
  // The chart view needs the success rate, the counts and the percentile bands,
  // not every path: this is runMonteCarlo reduced to those.
  export function monteCarloSummary(pathCount) {
    const { paths, successRate, projectionYears } = runMonteCarlo(pathCount);
    return {
      successRate,
      survived: paths.filter((p) => !p.depletedAge).length,
      pathCount: paths.length,
      projectionYears,
      bands: {
        nominal: monteCarloBands(paths, projectionYears, (r) => r.total),
        real: monteCarloBands(paths, projectionYears, (r) => r.total / r.cumFactor),
      },
    };
  }
  // Real-CAGR sweep: runs a shallow copy of `base` whose nominal investment
  // return is the nominal rate equivalent to the given real CAGR compounded on
  // top of base's inflation input, with the context its caller's factory gives
  // it (contextFor(variant)). Bond/HYSA yields and retirement dates are left
  // untouched, so this isolates sensitivity to the main portfolio return
  // assumption alone. It reads no store binding.
  export function simulateAtRealCagr(base, contextFor, realCagrPct) {
    const infl = pct(base.inflation),
      nominal = ((1 + realCagrPct / 100) * (1 + infl) - 1) * 100;
    return simulateWith(contextFor({ ...base, returnRate: nominal }));
  }
