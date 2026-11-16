// The historical backtest in words: a success percent that never reads better than the rate, and the starting years that ran out

  // The success rate as a whole percent, rounded down so a rate under a line never reads as the line (0.796 → 79) and a rate
  // under 1 never reads 100 (0.995 → 99). The 1e-9 keeps a float product like 0.29 * 100 (28.999999999999996) at 29.
  export function successPercent(rate) {
    return rate === 1 ? 100 : Math.min(99, Math.floor(rate * 100 + 1e-9));
  }

  // The starting years that ran out, as the phrase after "runs out in": the exact count, never rounded (failed > 0).
  export function failedYearsText(failed, total) {
    return failed === total
      ? `every one of the ${total} historical starting years since 1928`
      : `${failed} of the ${total} historical starting years since 1928`;
  }
