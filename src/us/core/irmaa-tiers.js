  // Medicare IRMAA — 2026 Part B + Part D surcharge tiers (CMS, Nov 2025),
  // applied per Medicare-enrolled partner against MAGI from two simulated
  // years prior (the household's own entries for the first two plan years, if
  // given — see irmaaLookbackMagi), as required by the actual two-year lookback rule.
  export const IRMAA_TIERS = {
    mfj: [
      [218000, 0, true],
      [274000, 95.7, true],
      [342000, 240.4, true],
      [410000, 385.0, true],
      [750000, 529.6, false],
      [Infinity, 578.0, true],
    ],
    single: [
      [109000, 0, true],
      [137000, 95.7, true],
      [171000, 240.4, true],
      [205000, 385.0, true],
      [500000, 529.6, false],
      [Infinity, 578.0, true],
    ],
  };
