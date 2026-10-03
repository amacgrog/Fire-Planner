  const BUCKET_DOWN_YEAR_ORDER = ['cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'taxable', 'traditional', 'roth', 'home'].map((k) => BUCKET_STEP[k]);
  const BUCKET_UP_YEAR_ORDER = ['taxable', 'traditional', 'roth', 'cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'home'].map((k) => BUCKET_STEP[k]);
  // The bucket-strategy withdrawal used by simulateHistorical(): cash and bonds
  // are a sequence-risk reserve. In a market-down year (yearReturn < 0) spending
  // comes from cash, then the bond-reserve buckets, and only then from the
  // stock accounts (taxable, tax-deferred, tax-free) and home equity. In an up
  // year it comes from the stock accounts first, then cash, bonds and home, and
  // any shortfall in the bond reserve versus `bondTarget` is topped back up from
  // the same stock-account order. A draw that leaves a tiny overshoot is clamped
  // to zero remaining need.
  function withdrawBucket(wd, { yearReturn, bondTarget }) {
    for (const step of yearReturn < 0 ? BUCKET_DOWN_YEAR_ORDER : BUCKET_UP_YEAR_ORDER) if (wd.need > 0) step(wd);
    if (yearReturn >= 0) refillBondReserve(wd.bal, bondTarget);
  }
