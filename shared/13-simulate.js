  function simulate(retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB) {
    return runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA, retireAgeB });
  }
  // Historical S&P 500 backtest. Runs the same engine as simulate() (same income,
  // contribution, tax, ACA, IRMAA and Roth-conversion mechanics) but drives stock returns,
  // inflation and bond returns from the actual 1928-2025 sequence (or a bootstrapped path)
  // and replaces the standard withdrawal cascade with a cash + bonds "bucket strategy":
  // expenses in a market-down year are paid from cash then the bond reserve only; in an up
  // year they are paid from taxable -> traditional -> Roth and the bond reserve is topped
  // back up from the same order. Cash/HYSA and mortgage still use the fixed rates from the
  // sidebar, since no historical series is loaded for either.
  function simulateHistorical(rowFn, retireAgeA = state.retireAgeA, retireAgeB = state.retireAgeB) {
    const prevTaxFactors = histTaxFactors;
    histTaxFactors = [];
    try {
      return runProjection({ mode: BUCKET_MODE, source: historicalYearSource(rowFn), retireAgeA, retireAgeB });
    } finally {
      histTaxFactors = prevTaxFactors;
    }
  }

  // Runs every historical start year with a full run of data available for
  // the current projection length and returns each cycle's outcome plus the
  // resulting success rate.
  function runHistoricalCycles() {
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

  // Monte Carlo via block bootstrap: instead of drawing each year's return
  // independently (which has no memory of real market behavior — no mean
  // reversion, no regime clustering, no macro coherence between stocks,
  // bonds, and inflation), each simulated path is built by randomly
  // stitching together contiguous 5-year blocks of the actual 1928-2025
  // historical record. Every block is something that really happened, so a
  // path structurally cannot contain an unrealistic run (e.g. decades of
  // one-directional returns) the way independent-draw Monte Carlo can.
  const MC_BLOCK_SIZE = 5;
  function bootstrapReturnSeries(length) {
    const series = [],
      maxStart = HIST.length - MC_BLOCK_SIZE;
    while (series.length < length) {
      const s = Math.floor(Math.random() * (maxStart + 1));
      for (let i = 0; i < MC_BLOCK_SIZE && series.length < length; i++) series.push(HIST[s + i]);
    }
    return series;
  }
  function runMonteCarlo(pathCount) {
    const projectionYears = state.singlePerson
      ? Math.max(0, state.lifeExpectancyA - state.ageA)
      : Math.max(0, state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    const length = projectionYears + 1,
      paths = [];
    for (let i = 0; i < pathCount; i++) {
      const series = bootstrapReturnSeries(length);
      paths.push(simulateHistorical((y) => series[y]));
    }
    const successRate = paths.filter((p) => !p.depletedAge).length / paths.length;
    return { paths, successRate, projectionYears };
  }
