import { drawTaxable } from '../../../shared/core/withdrawals/draws.js';
import { taxFor } from '../tax/federal-tax.js';
import { solveTraditionalForNet } from './draws.js';

  // Per-year withdrawal-mix override for the multi-lever optimizer — same
  // idiom as optimizerState.rothBracketByAge above. null in normal operation.
  // Map<Partner-A age, candidate-id-or-0>. Unlike the Roth ladder (which
  // creates NEW discretionary income you choose to generate) or the old
  // gain-harvesting lever it replaces the working half of (removed after
  // real-world testing found its effect was consistently negligible — see
  // docs/reference.md), this is about HOW to fund a spending need that's
  // already mandatory that year — so there's no MAGI cap to size against;
  // minimizing MAGI (to dodge an ACA cliff or IRMAA tier) is exactly what
  // the search is scoring for via rothScheduleCost, which already sums
  // tax+healthcare across the projection. A mapped 0 (or no entry) means
  // "no override this year" — falls through to state.smoothWithdrawals'
  // simple proportional-by-balance rule, then the plain taxable-first
  // default, unchanged.
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
  // Live, always-cheap sibling of the multi-lever optimizer's full
  // lifetime coordinate-ascent search above — the search is too expensive
  // to re-run on every render (it calls simulate() thousands of times), so
  // it stays an explicit, on-demand "Optimize" report.
  //
  // This went through two broken designs before landing here, both found
  // by testing against a real uploaded scenario rather than caught in
  // review — worth recording so neither gets reintroduced:
  //
  // 1. Scoring all WITHDRAWAL_MIX_CANDIDATES on "this year's own tax"
  //    alone: a Roth withdrawal is *always* tax-free this year, so every
  //    Roth-inclusive candidate trivially looks free and the picker drains
  //    Roth almost immediately, with nothing left for a future year that
  //    actually needs it. Drove lifetime cost up by ~$900k instead of down
  //    in testing.
  // 2. Restricting to the menu's "spread" candidates (taxTradHalf/thirds/
  //    balanced/smoothed) to avoid (1): still worse than doing nothing,
  //    by ~$270k. The menu's candidates are fixed PROPORTIONAL splits —
  //    each bucket's share is sized against `need` independently, so if
  //    one bucket's own share exceeds what it actually holds, that
  //    shortfall does NOT roll over into the other buckets; it falls
  //    straight through to the Roth/cash/bond/home fallback below. That's
  //    fine for the full lifetime search above, which evaluates the
  //    resulting multi-year depletion pattern directly and simply
  //    wouldn't pick a candidate that stranded a large balance — but a
  //    one-year-only picker has no way to know whether "leaving
  //    traditional untouched this year" is a deliberate multi-year
  //    strategy (it sometimes is, see the full search's own picks) or an
  //    accident, so it can't safely choose from the same proportional-
  //    split menu at all.
  //
  // What's actually safe for a single year to decide on its own is
  // *order*, not proportion: which of taxable-or-traditional to draw from
  // first, fully cascading into the other for any shortfall — exactly the
  // shape the plain taxable-first default already uses, just choosing
  // which bucket leads based on this year's own marginal tax rates
  // instead of always taxable. Both orders are guaranteed to satisfy
  // `need` out of combined taxable+traditional capacity whenever that
  // combined capacity allows it (never stranding one while draining Roth/
  // cash/bonds for the other), and since one of the two orders (taxable-
  // first) is exactly what the plain default already does, picking
  // whichever of the two costs less this year can never come out ahead of
  // the default by choosing worse — only by choosing traditional-first
  // when that's genuinely cheaper (e.g. a low-bracket year with little
  // taxable gain to save, or one where taxable's own gain would blow the
  // MAGI room traditional wouldn't). `remainingMagiRoom` (the same ACA-
  // cliff/IRMAA-tier ceiling the Roth ladder's conversion sizing already
  // respects) is folded into the cost so an order that would overshoot it
  // is preferred against only when the other order overshoots it more.
  // Roth itself is deliberately left untouched here — it's still reached
  // exactly as it always was, as the shortfall fallback immediately below
  // this branch, once combined taxable+traditional genuinely can't cover
  // `need`.
  export function pickLiveWithdrawalOrder(
    need,
    taxableBal,
    traditionalBal,
    taxableBasis,
    profile,
    taxableGainGross,
    traditionalGross,
    penalizedFraction,
    remainingMagiRoom,
  ) {
    function cascade(traditionalFirst) {
      let remaining = need,
        fromTaxable = 0,
        taxableGain = 0,
        taxableBasisTaken = 0,
        fromTraditional = 0,
        penalty = 0,
        gainAcc = taxableGainGross,
        tradAcc = traditionalGross;
      function drawTax(amount) {
        if (amount <= 0) return;
        const d = drawTaxable(
          taxableBal - fromTaxable,
          taxableBasis - taxableBasisTaken,
          amount,
          profile,
          gainAcc,
          tradAcc,
        );
        fromTaxable += d.taken;
        taxableGain += d.gain;
        taxableBasisTaken += d.basisTaken;
        gainAcc += d.gain;
        remaining -= d.net;
      }
      function drawTrad(amount) {
        if (amount <= 0) return;
        const t = solveTraditionalForNet(
          traditionalBal - fromTraditional,
          amount,
          gainAcc,
          tradAcc,
          profile,
          penalizedFraction,
        );
        fromTraditional += t.fromTrad;
        tradAcc += t.fromTrad;
        penalty += t.penalty;
        remaining -= t.tradNet;
      }
      if (traditionalFirst) {
        drawTrad(remaining);
        drawTax(remaining);
      } else {
        drawTax(remaining);
        drawTrad(remaining);
      }
      const incrementalTax =
        taxFor(profile, gainAcc, tradAcc) - taxFor(profile, taxableGainGross, traditionalGross) +
        penalty;
      const overage = Math.max(0, taxableGain + fromTraditional - remainingMagiRoom);
      return {
        fromTaxable,
        taxableGain,
        taxableBasisTaken,
        fromTraditional,
        penalty,
        remainingNeed: Math.max(0, remaining),
        cost: overage * 1e6 + incrementalTax,
      };
    }
    const taxableFirst = cascade(false),
      traditionalFirst = cascade(true);
    return traditionalFirst.cost < taxableFirst.cost ? traditionalFirst : taxableFirst;
  }
