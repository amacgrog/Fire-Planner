// Monte Carlo percentile bands: the 10th-90th percentile totals by year across paths

  export function monteCarloBands(paths, projectionYears, valueFn) {
    const pctl = (sortedVals, q) => {
      const idx = (sortedVals.length - 1) * q,
        lo = Math.floor(idx),
        hi = Math.ceil(idx);
      return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (idx - lo);
    };
    const bands = [];
    for (let year = 0; year <= projectionYears; year++) {
      const vals = paths.map((pth) => valueFn(pth.rows[year])).sort((a, b) => a - b);
      bands.push({
        year,
        p10: pctl(vals, 0.1),
        p25: pctl(vals, 0.25),
        p50: pctl(vals, 0.5),
        p75: pctl(vals, 0.75),
        p90: pctl(vals, 0.9),
      });
    }
    return bands;
  }
