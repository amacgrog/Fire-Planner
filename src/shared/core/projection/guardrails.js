// Guardrail spending state: new state, withdrawal record and spending multiplier

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
  // Per-run guardrail bookkeeping, a plain object so the US MAGI-iteration
  // snapshot can copy it with `{ ...g }` and restore it with Object.assign.
  export function newGuardrails() {
    return { multiplier: 1, initialWR: null, prevNeed: null, prevPortfolio: null };
  }
  // The factor applied to this year's household spending. Also advances the
  // lagged rule from last year's recorded withdrawal.
  export function guardrailSpendingMultiplier(ctx, g, working) {
    if (!ctx.inputs.guardrailsEnabled || working) return 1;
    if (g.prevPortfolio > 0)
      g.multiplier = nextGuardrailMultiplier({
        multiplier: g.multiplier,
        initialWR: g.initialWR,
        prevNeed: g.prevNeed,
        prevPortfolio: g.prevPortfolio,
      });
    return g.multiplier;
  }
  // Records a retired year's withdrawal need (lump expenses excluded) against
  // the portfolio before the draw; the first one fixes the baseline rate.
  export function recordGuardrailWithdrawal(ctx, g, need, portfolioNow, working) {
    if (!ctx.inputs.guardrailsEnabled || working) return;
    if (g.initialWR === null && portfolioNow > 0) g.initialWR = need / portfolioNow;
    g.prevNeed = need;
    g.prevPortfolio = portfolioNow;
  }
