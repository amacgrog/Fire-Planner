  // ---- Year sources and modes for runProjection() ----
  // A year source supplies each year's market inputs: yearInputs(year) returns the stock
  // return, bond return, bond interest yield (taxed each year) and the cumulative inflation
  // `factor` (also the factor that indexes contribution limits); endOfYear() advances any
  // running state; `inflation` is the plan's assumed rate.
  function standardYearSource() {
    const stockReturn = pct(state.returnRate),
      bondReturn = pct(state.bondReturn),
      infl = pct(state.inflation);
    return {
      inflation: infl,
      yearInputs(year) {
        const factor = Math.pow(1 + infl, year);
        return { stockReturn, bondReturn, bondYield: bondReturn, factor, limitFactor: factor };
      },
      endOfYear() {},
    };
  }
  // One path of the dataset: rowFn(year) returns [calendarYear, stockReturn%, inflation%,
  // bondReturn%, optional Treasury yield%]. Inflation compounds from the path itself, and the
  // tax-index factor for each year is recorded in histTaxFactors. Interest on the taxable
  // bond reserve is the start-of-year Treasury yield, or the bond return floored at zero
  // for a row without one.
  function historicalYearSource(rowFn) {
    let cumFactor = 1,
      yearInflation = 0;
    return {
      inflation: pct(state.inflation),
      startYear: rowFn(0)[0],
      yearInputs(year) {
        const histRow = rowFn(year),
          bondReturn = histRow[3] / 100;
        yearInflation = histRow[2] / 100;
        histTaxFactors[year] = cumFactor;
        return {
          stockReturn: histRow[1] / 100,
          bondReturn,
          bondYield: histRow[4] != null ? histRow[4] / 100 : Math.max(0, bondReturn),
          factor: cumFactor,
          limitFactor: cumFactor,
        };
      },
      endOfYear() {
        cumFactor *= 1 + yearInflation;
      },
    };
  }
