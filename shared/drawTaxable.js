  function drawTaxable(pool, basis, need, profile, priorGains = 0, priorTraditionalExtra = 0) {
    if (pool <= 0 || need <= 0) return { taken: 0, net: 0, gain: 0, basisTaken: 0 };
    const gainRatio = clamp(1 - basis / pool, 0, 1),
      basisRatio = 1 - gainRatio;
    let lo = need,
      hi = need * 3 + 1;
    const incrementalTax = (gross) =>
      taxFor(profile, priorGains + gross * gainRatio, priorTraditionalExtra) -
      taxFor(profile, priorGains, priorTraditionalExtra);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net = mid - incrementalTax(mid);
      if (net < need) lo = mid;
      else hi = mid;
    }
    const taken = Math.min(pool, hi),
      net = taken - incrementalTax(taken);
    return { taken, net, gain: taken * gainRatio, basisTaken: taken * basisRatio };
  }
