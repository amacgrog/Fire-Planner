// US withdrawal-mix candidates and weights

  // Per-year withdrawal-mix override: a test-only seam (the yardstick, the fill probe and the tests; no UI path sets it) — same
  // idiom as ctx.overrides.rothBracketByAge (roth-conversion.js). null in normal operation.
  // Map<Partner-A age, candidate-id-or-0>. Unlike the Roth ladder (which
  // creates NEW discretionary income you choose to generate) or the old
  // gain-harvesting lever it replaces the working half of (removed after
  // real-world testing found its effect was consistently negligible — see
  // docs/reference.md), this is about HOW to fund a spending need that's
  // already mandatory that year — so there's no MAGI cap to size against;
  // minimizing MAGI (to dodge an ACA cliff or IRMAA tier) is exactly what
  // the search prices through its objective (src/us/core/optimizer/objectives.js),
  // which already counts tax+healthcare across the projection. A mapped 0 (or no entry) means
  // "no override this year" — falls through to the plan's order intent
  // (wd.taxAwareOrder), then state.smoothWithdrawals' simple
  // proportional-by-balance rule, then the plain taxable-first default.
  // Candidate withdrawal splits the per-year optimizer searches, as
  // [taxable, traditional, roth] fractions of that year's spending need
  // (always summing to 1). 'balanced' is resolved dynamically from that
  // year's live account balances (a 3-way extension of what
  // state.smoothWithdrawals already does 2-way) rather than a fixed
  // triple, since the "right" balance-proportional split obviously shifts
  // as each account drains at a different rate. Deliberately a small,
  // fixed menu rather than a continuous 2-simplex search — richer
  // resolution would multiply the coordinate-ascent search space (already
  // combined with the Roth ladder's own per-year coordinates) far past
  // what a few seconds of browser-side search can cover.
  export const WITHDRAWAL_MIX_CANDIDATES = [0, 'taxable', 'traditional', 'roth', 'balanced', 'smoothed', 'taxTradHalf', 'thirds'];
  export function withdrawalMixWeights(candidate, taxableBal, traditionalBal, rothBal) {
    switch (candidate) {
      case 'taxable':
        return [1, 0, 0];
      case 'traditional':
        return [0, 1, 0];
      case 'roth':
        return [0, 0, 1];
      case 'taxTradHalf':
        return [0.5, 0.5, 0];
      case 'thirds':
        return [1 / 3, 1 / 3, 1 / 3];
      case 'balanced': {
        const pool = taxableBal + traditionalBal + rothBal;
        return pool > 0 ? [taxableBal / pool, traditionalBal / pool, rothBal / pool] : [1 / 3, 1 / 3, 1 / 3];
      }
      case 'smoothed': {
        // Exactly state.smoothWithdrawals' own 2-way formula (taxable +
        // traditional only, proportional to balance, Roth left at 0 here
        // so it only gets tapped via the shortfall fallback below) —
        // included as its own candidate so the mix lever is a strict
        // superset of what the simple smoothWithdrawals toggle can find,
        // not just "usually at least as good" empirically.
        const pool = taxableBal + traditionalBal;
        return pool > 0 ? [taxableBal / pool, traditionalBal / pool, 0] : [0.5, 0.5, 0];
      }
      default:
        return null; // 0, or an unrecognized id — "no override this year"
    }
  }
