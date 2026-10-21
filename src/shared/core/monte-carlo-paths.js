import { HIST } from './projection/historical-data.js';

  // Monte Carlo via block bootstrap: instead of drawing each year's return
  // independently (which has no memory of real market behavior — no mean
  // reversion, no regime clustering, no macro coherence between stocks,
  // bonds, and inflation), each simulated path is built by randomly
  // stitching together contiguous 5-year blocks of the actual 1928-2025
  // historical record. Every block is something that really happened, so a
  // path structurally cannot contain an unrealistic run (e.g. decades of
  // one-directional returns) the way independent-draw Monte Carlo can.
  const MC_BLOCK_SIZE = 5;
  export function bootstrapReturnSeries(length) {
    const series = [],
      maxStart = HIST.length - MC_BLOCK_SIZE;
    while (series.length < length) {
      const s = Math.floor(Math.random() * (maxStart + 1));
      for (let i = 0; i < MC_BLOCK_SIZE && series.length < length; i++) series.push(HIST[s + i]);
    }
    return series;
  }
