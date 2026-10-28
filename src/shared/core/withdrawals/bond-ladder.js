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
  // meltdown, Canada), which the gain stacks on.
  export function rotateIntoBondLadder(ctx, bal, { year, ladderTarget, rotationStartYear, rotationEndYear }, profile, conversionAmount) {
    if (year < rotationStartYear || year > rotationEndYear) return 0;
    const windowLen = rotationEndYear - rotationStartYear + 1,
      progress = windowLen > 0 ? (year - rotationStartYear + 1) / windowLen : 1;
    let remaining = Math.max(0, ladderTarget * progress - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth));
    const traditionalMove = Math.min(bal.traditional, remaining);
    bal.traditional -= traditionalMove;
    bal.bondTraditional += traditionalMove;
    remaining -= traditionalMove;
    if (remaining > 0) {
      const rothMove = Math.min(bal.roth, remaining);
      bal.roth -= rothMove;
      bal.bondRoth += rothMove;
      remaining -= rothMove;
    }
    if (remaining <= 0) return 0;
    const d = drawTaxable(ctx, bal.taxable, bal.taxableBasis, remaining, profile, 0, conversionAmount);
    bal.taxable -= d.taken;
    bal.taxableBasis -= d.basisTaken;
    bal.bondTaxable += d.net;
    bal.bondTaxableBasis += d.net;
    return d.gain;
  }
  // The pre-retirement bond ladder plan: the target is the sum of the first bondYears of
  // projected expenses starting at retirement, built up linearly over the years before
  // retirement (rotateIntoBondLadder does the moving).
  export function planBondLadder({ retirementYear, bondYears, projectedExpense }) {
    const bondYearsCeil = Math.max(0, Math.ceil(bondYears)),
      bondWhole = Math.floor(bondYears),
      bondFrac = bondYears - bondWhole;
    const ladderTranches = Array.from({ length: bondWhole }, (_, i) =>
      projectedExpense(retirementYear + i),
    );
    if (bondFrac > 0) ladderTranches.push(projectedExpense(retirementYear + bondWhole) * bondFrac);
    const ladderTarget = ladderTranches.reduce((a, b) => a + b, 0);
    const rotationStartYear = Math.max(0, retirementYear - bondYearsCeil),
      rotationEndYear = retirementYear >= 1 ? retirementYear - 1 : Math.max(0, bondYearsCeil - 1);
    return { ladderTranches, ladderTarget, rotationStartYear, rotationEndYear };
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
  export function refillBondReserve(wd, bondTarget, { maxMove = Infinity, taxable = true } = {}) {
    const { bal } = wd;
    const bondDeficit = Math.max(0, bondTarget - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth));
    let remaining = Math.min(bondDeficit, maxMove);
    if (remaining <= 0) return;
    const fromTrad = Math.min(bal.traditional, remaining);
    bal.traditional -= fromTrad;
    bal.bondTraditional += fromTrad;
    remaining -= fromTrad;
    if (remaining > 0) {
      const fromRoth = Math.min(bal.roth, remaining);
      bal.roth -= fromRoth;
      bal.bondRoth += fromRoth;
      remaining -= fromRoth;
    }
    if (remaining > 0 && taxable) {
      const d = drawTaxable(wd.ctx, bal.taxable, bal.taxableBasis, remaining, wd.profile, wd.taxableGainGross, wd.traditionalGross);
      bal.taxable -= d.taken;
      bal.taxableBasis -= d.basisTaken;
      bal.bondTaxable += d.net;
      bal.bondTaxableBasis += d.net;
      wd.taxableGainGross += d.gain;
    }
  }
  // Trims the bond reserve down to `target`: the excess moves back to stocks of the same account
  // kind, the same fraction from each bucket (bondRoth -> roth, bondTraditional -> traditional,
  // bondTaxable -> taxable carrying its share of the basis). A reallocation with no tax event; in
  // taxable that is a simplification, near exact in the standard projection, where the bonds' basis
  // tracks their interest. After the ladder build (Batch 5 step 5b) the standard projection calls it
  // every year and the bucket strategy in an up year (the year it refills), both before the withdrawal.
  export function trimBondReserve(bal, target) {
    const total = bal.bondTaxable + bal.bondTraditional + bal.bondRoth;
    if (!(total > target)) return;
    const f = (total - target) / total;
    const fromTaxable = bal.bondTaxable * f,
      basisMoved = bal.bondTaxableBasis * f,
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
