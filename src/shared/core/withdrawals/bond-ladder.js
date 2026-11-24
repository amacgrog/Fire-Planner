// Bond ladder planning, rotation into it, and the bond reserve's refill and trim

import { drawTaxable } from './draws.js';

  // Pre-retirement bond-ladder build: ramps linearly over the years available
  // before retirement so the full ladderTarget is reached by rotationEndYear.
  // Each year it moves whatever the ramp still needs into the bond reserve:
  // traditional first, then Roth (reallocations inside a retirement account:
  // no income, no tax, no early-withdrawal penalty), then taxable brokerage
  // only as a last resort. The taxable move is a real sale (drawTaxable): the
  // tax on the realized gain is paid out of the proceeds, the new bonds are
  // bought at market (full basis), and the realized gain is returned so the
  // caller can add it to the year's gains (tax, MAGI). `conversionAmount` is
  // this year's ordinary income already in the profile (Roth conversion, US /
  // meltdown, Canada), which the gain stacks on. LADDER_OUT.saleTax is the tax
  // part of the taxable sale (0 when nothing was sold), for the cash-flow chart:
  // read it right after the call.
  export const LADDER_OUT = { saleTax: 0 };
  export function rotateIntoBondLadder(ctx, bal, { year, ladderTarget, bridgeTarget, rotationStartYear, rotationEndYear }, profile, conversionAmount, tradShare = 1) {
    LADDER_OUT.saleTax = 0;
    if (year < rotationStartYear || year > rotationEndYear) return 0;
    const windowLen = rotationEndYear - rotationStartYear + 1,
      progress = windowLen > 0 ? (year - rotationStartYear + 1) / windowLen : 1;
    let remaining = Math.max(0, ladderTarget * progress - (bal.bondTaxable - bridgeHeld(bal) + bal.bondTraditional + bal.bondRoth));
    remaining = fillSplit(bal, remaining, Math.max(0, ladderTarget * progress * tradShare - bal.bondTraditional));
    let gain = 0,
      saleTax = 0;
    if (bridgeTarget > 0) {
      // The bridge ramps beside the retirement reserve, from the brokerage account only (never traditional or Roth), and it
      // takes the brokerage first: it is the reserve that must be there at retirement, so the retirement reserve's last
      // resort below gets what is left, its sale stacked on the bridge's gain.
      const bridgeLeft = Math.max(0, bridgeTarget * progress - bridgeHeld(bal));
      if (bridgeLeft > 0) {
        const d = drawTaxable(ctx, bal.taxable, bal.taxableBasis, bridgeLeft, profile, 0, conversionAmount);
        bal.taxable -= d.taken;
        bal.taxableBasis -= d.basisTaken;
        bal.bondTaxable += d.net;
        bal.bondTaxableBasis += d.net;
        bal.bridgeBonds = bridgeHeld(bal) + d.net;
        gain = d.gain;
        saleTax = d.taken - d.net;
      }
    }
    if (remaining > 0) {
      const d = drawTaxable(ctx, bal.taxable, bal.taxableBasis, remaining, profile, gain, conversionAmount);
      bal.taxable -= d.taken;
      bal.taxableBasis -= d.basisTaken;
      bal.bondTaxable += d.net;
      bal.bondTaxableBasis += d.net;
      gain += d.gain;
      saleTax += d.taken - d.net;
    }
    LADDER_OUT.saleTax = saleTax;
    return gain;
  }
  // The bridge reserve's dollars inside bal.bondTaxable (bal.bridgeBonds, US), clamped to what bondTaxable holds; 0 when there
  // is none (the key is absent or 0), so every retirement-reserve total below is today's expression then.
  export function bridgeHeld(bal) {
    return bal.bridgeBonds > 0 ? Math.min(bal.bridgeBonds, bal.bondTaxable) : 0;
  }
  // The bridge ends (the first year every living partner is 59 and a half): its bonds move to brokerage stocks, carrying
  // their share of the basis. A reallocation, no tax.
  export function endBridge(bal) {
    if (!(bal.bridgeBonds > 0)) return;
    const held = bridgeHeld(bal);
    const basisMoved = bal.bondTaxable > 0 ? (bal.bondTaxableBasis * held) / bal.bondTaxable : 0;
    bal.bondTaxable -= held;
    bal.bondTaxableBasis -= basisMoved;
    bal.taxable += held;
    bal.taxableBasis += basisMoved;
    bal.bridgeBonds = 0;
  }
  // The pre-retirement bond ladder plan: the target is the sum of the first bondYears of
  // projected expenses starting at retirement, built up linearly over the years before
  // retirement (rotateIntoBondLadder does the moving). bridgeTarget is the bridge reserve's own
  // sum (projected expenses over bridgeYears from retirement, the last tranche fractional; 0 with
  // no bridge), and the window is as long as the longer of the two. A plan that retires in year 0 builds
  // over its first retired years (rotationEndYear = the window less one), unless its reserve is held from
  // the start (`held`, bondStart 'held': placeHeldReserve), which gives it an empty window (rotationEndYear -1).
  export function planBondLadder({ retirementYear, bondYears, bridgeYears = 0, held = false, projectedExpense }) {
    const bondYearsCeil = Math.max(0, Math.ceil(bondYears)),
      bondWhole = Math.floor(bondYears),
      bondFrac = bondYears - bondWhole;
    const ladderTranches = Array.from({ length: bondWhole }, (_, i) =>
      projectedExpense(retirementYear + i),
    );
    if (bondFrac > 0) ladderTranches.push(projectedExpense(retirementYear + bondWhole) * bondFrac);
    const ladderTarget = ladderTranches.reduce((a, b) => a + b, 0);
    let bridgeTarget = 0;
    if (bridgeYears > 0) {
      const bridgeWhole = Math.floor(bridgeYears),
        bridgeFrac = bridgeYears - bridgeWhole;
      for (let i = 0; i < bridgeWhole; i++) bridgeTarget += projectedExpense(retirementYear + i);
      if (bridgeFrac > 0) bridgeTarget += projectedExpense(retirementYear + bridgeWhole) * bridgeFrac;
    }
    const windowYears = Math.max(bondYearsCeil, Math.max(0, Math.ceil(bridgeYears)));
    const rotationStartYear = Math.max(0, retirementYear - windowYears),
      rotationEndYear = retirementYear >= 1 ? retirementYear - 1 : held ? -1 : Math.max(0, windowYears - 1);
    return { ladderTranches, ladderTarget, bridgeTarget, rotationStartYear, rotationEndYear };
  }
  // Moves stocks to bonds inside the retirement accounts (a reallocation: no tax): traditional up to
  // min(amount, tradWant), then Roth, then traditional again. Returns the part of amount not placed.
  // With tradWant = amount it is the traditional-then-Roth order of the ladder and the refill.
  export function fillSplit(bal, amount, tradWant) {
    let left = amount;
    const trad1 = Math.min(left, tradWant, bal.traditional);
    bal.traditional -= trad1;
    bal.bondTraditional += trad1;
    left -= trad1;
    const roth = Math.min(left, bal.roth);
    bal.roth -= roth;
    bal.bondRoth += roth;
    left -= roth;
    const trad2 = Math.min(left, bal.traditional);
    bal.traditional -= trad2;
    bal.bondTraditional += trad2;
    return left - trad2;
  }
  // A reserve held from the start: the person already holds these bonds, so the opening balances are
  // relabelled (no sale, no tax, no gain). The retirement reserve fills the retirement accounts
  // (fillSplit, tradShare of target from traditional first); the bridge reserve (bridgeTarget > 0)
  // relabels taxable, then up to cashFree of cash, into bondTaxable and bal.bridgeBonds; what the
  // retirement reserve could not place in the accounts is relabelled from taxable (the last resort).
  export function placeHeldReserve(bal, { target, tradShare = 1, bridgeTarget = 0, cashFree = 0 }) {
    const left = fillSplit(bal, target, target * tradShare);
    if (bridgeTarget > 0) {
      const fromTaxable = Math.min(bridgeTarget, bal.taxable),
        basisMoved = bal.taxable > 0 ? (bal.taxableBasis * fromTaxable) / bal.taxable : 0;
      bal.taxable -= fromTaxable;
      bal.taxableBasis -= basisMoved;
      bal.bondTaxable += fromTaxable;
      bal.bondTaxableBasis += basisMoved;
      const fromCash = Math.max(0, Math.min(cashFree, bridgeTarget - fromTaxable, bal.cash));
      bal.cash -= fromCash;
      bal.bondTaxable += fromCash;
      bal.bondTaxableBasis += fromCash;
      bal.bridgeBonds = (bal.bridgeBonds || 0) + fromTaxable + fromCash;
    }
    if (left > 0) {
      const moved = Math.min(left, bal.taxable),
        basisMoved = bal.taxable > 0 ? (bal.taxableBasis * moved) / bal.taxable : 0;
      bal.taxable -= moved;
      bal.taxableBasis -= basisMoved;
      bal.bondTaxable += moved;
      bal.bondTaxableBasis += basisMoved;
    }
  }
  // Tops the bond reserve up toward bondTarget by moving stocks into bonds: traditional first,
  // then Roth, then taxable only as a last resort when neither has anything left to move.
  //  - Inside a retirement account it is a reallocation, not a sale or a withdrawal: no income, no
  //    tax, no early-withdrawal penalty (age does not restrict it).
  //  - From taxable it is a real sale: drawTaxable sells enough stock that, after the tax on the
  //    realized gain, the amount moved into bonds is what was asked. The gain is added to
  //    wd.taxableGainGross, so it counts in the year's tax, MAGI (ACA, IRMAA) and the MAGI
  //    iteration, and the tax is paid out of the proceeds; the new bonds are bought at market
  //    (full basis). The order intent does not plan for it (it decides before the refill).
  // Gradual: at most `maxMove` moves into bonds per call (the engine passes one year of that
  // year's expenses, net of lump expenses). Cash and home equity are never used. Surplus cash
  // refills the reserve separately (routeSurplus), limited only by the surplus and the target.
  // `taxable: false` (the standard projection's surplus year, Batch 5 step 5b fix) leaves the taxable
  // step out: the move is then a reallocation only, traditional then Roth, with no gain and no MAGI
  // (a surplus year settles its tax without a draw, so a sale there would go untaxed).
  export function refillBondReserve(wd, bondTarget, { maxMove = Infinity, taxable = true, tradShare = 1 } = {}) {
    const { bal } = wd;
    const bondDeficit = Math.max(0, bondTarget - (bal.bondTaxable - bridgeHeld(bal) + bal.bondTraditional + bal.bondRoth));
    let remaining = Math.min(bondDeficit, maxMove);
    if (remaining <= 0) return;
    remaining = fillSplit(bal, remaining, Math.max(0, bondTarget * tradShare - bal.bondTraditional));
    if (remaining > 0 && taxable) {
      const d = drawTaxable(wd.ctx, bal.taxable, bal.taxableBasis, remaining, wd.profile, wd.taxableGainGross, wd.traditionalGross);
      bal.taxable -= d.taken;
      bal.taxableBasis -= d.basisTaken;
      bal.bondTaxable += d.net;
      bal.bondTaxableBasis += d.net;
      wd.taxableGainGross += d.gain;
      wd.saleForTax += d.taken - d.net; // the cash-flow chart: the sale's tax, paid from the proceeds
    }
  }
  // Trims the bond reserve down to `target`: the excess moves back to stocks of the same account
  // kind, the same fraction from each bucket (bondRoth -> roth, bondTraditional -> traditional,
  // bondTaxable -> taxable carrying its share of the basis). A reallocation with no tax event; in
  // taxable that is a simplification, near exact in the standard projection, where the bonds' basis
  // tracks their interest. After the ladder build (Batch 5 step 5b) the standard projection calls it
  // every year and the bucket strategy in an up year (the year it refills), both before the withdrawal.
  export function trimBondReserve(bal, target) {
    // The bridge's dollars (and their basis share) are not the retirement reserve: the trim leaves them where they are.
    const held = bridgeHeld(bal),
      retTaxable = bal.bondTaxable - held,
      total = retTaxable + bal.bondTraditional + bal.bondRoth;
    if (!(total > target)) return;
    const f = (total - target) / total;
    const fromTaxable = retTaxable * f,
      basisMoved = held > 0 ? bal.bondTaxableBasis * (retTaxable / bal.bondTaxable) * f : bal.bondTaxableBasis * f,
      fromTrad = bal.bondTraditional * f,
      fromRoth = bal.bondRoth * f;
    bal.bondTaxable -= fromTaxable;
    bal.bondTaxableBasis -= basisMoved;
    bal.taxable += fromTaxable;
    bal.taxableBasis += basisMoved;
    bal.bondTraditional -= fromTrad;
    bal.traditional += fromTrad;
    bal.bondRoth -= fromRoth;
    bal.roth += fromRoth;
  }
