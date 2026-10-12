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
    assignHistTaxFactors([]);
    try {
      return runProjection({ mode: BUCKET_MODE, source: historicalYearSource(rowFn), retireAgeA, retireAgeB });
    } finally {
      assignHistTaxFactors(prevTaxFactors);
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
