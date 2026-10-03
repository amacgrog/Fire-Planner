  // Guyton-Klinger guardrails (simplified): compares last withdrawal year's
  // draw rate to the rate at the first withdrawal. A rate more than 20% above
  // it cuts discretionary spending 10%; more than 20% below raises it 10%; the
  // multiplier is held to a 0.5x-1.5x band and persists until the next trigger.
  function nextGuardrailMultiplier({ multiplier, initialWR, prevNeed, prevPortfolio }) {
    const priorWR = prevNeed / prevPortfolio;
    if (initialWR > 0) {
      if (priorWR > initialWR * 1.2) return Math.max(0.5, multiplier * 0.9);
      if (priorWR < initialWR * 0.8) return Math.min(1.5, multiplier * 1.1);
    }
    return multiplier;
  }
