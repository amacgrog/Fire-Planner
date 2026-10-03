  // Tops the bond reserve up toward bondTarget by moving stocks into bonds: traditional first,
  // then Roth, then taxable only as a last resort when neither has anything left to move.
  //  - Inside a retirement account it is a reallocation, not a sale or a withdrawal: no income, no
  //    tax, no early-withdrawal penalty (age does not restrict it).
  //  - From taxable it is a real sale: drawTaxable sells enough stock that, after the tax on the
  //    realized gain, the amount moved into bonds is what was asked. The gain is added to
  //    wd.taxableGainGross, so it counts in the year's tax, MAGI (ACA, IRMAA) and the MAGI
  //    iteration, and the tax is paid out of the proceeds; the new bonds are bought at market
  //    (full basis). The live withdrawal mix does not plan for it (it decides before the refill).
  // Gradual: at most `maxMove` moves into bonds per call (the engine passes one year of that
  // year's expenses, net of lump expenses). Cash and home equity are never used. Surplus cash
  // refills the reserve separately (routeSurplus), limited only by the surplus and the target.
  function refillBondReserve(wd, bondTarget, { maxMove = Infinity } = {}) {
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
    if (remaining > 0) {
      const d = drawTaxable(bal.taxable, bal.taxableBasis, remaining, wd.profile, wd.taxableGainGross, wd.traditionalGross);
      bal.taxable -= d.taken;
      bal.taxableBasis -= d.basisTaken;
      bal.bondTaxable += d.net;
      bal.bondTaxableBasis += d.net;
      wd.taxableGainGross += d.gain;
    }
  }
