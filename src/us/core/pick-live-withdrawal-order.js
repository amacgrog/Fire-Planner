import { drawTaxable } from '../../shared/core/draw-taxable.js';
import { solveTraditionalForNet, taxFor } from './standard-deduction.js';

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
