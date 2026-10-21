  // Federal child credits for one return (IRC 24). 2026 amounts (Rev. Proc. 2025-32, via
  // secondary sources): the Child Tax Credit is $2,200 per child aged 16 or under at year end,
  // of which at most $1,700 is refundable (the ACTC, 15% of earned income over $2,500), both
  // indexed with the tax parameters from 2026. The Credit for Other Dependents is $500 (not
  // indexed, nonrefundable) for a qualifying child who is not CTC-eligible (17 and over: 17-18,
  // and students to 23). The two share one phase-out: $50 per $1,000 (or part) of MAGI over
  // $200,000 ($400,000 joint), thresholds that are NOT indexed. Both are limited to the federal
  // income tax (ordinary + long-term gains tax; not state tax, NIIT or payroll tax).
  // `dependents` is the `dependentsInYear` list (a missing list means none). Every child and
  // parent is assumed to have a valid Social Security number. Returns the credit pieces; taxFor
  // subtracts `nonrefundable + refundable` from the federal tax.
  // Ordering inside the combined credit (it only matters below the phase-out, where the tax limit
  // binds): the phase-out reduction comes off the CTC part first, the tax absorbs the nonrefundable
  // ODC first, and only the unused CTC can be refunded.
  export const CTC_PER_CHILD = 2200,
    CTC_REFUNDABLE_CAP = 1700,
    CTC_MAX_AGE = 16,
    ODC_PER_DEPENDENT = 500,
    CTC_PHASE_START = { mfj: 400000, single: 200000 },
    CTC_PHASE_STEP = 1000,
    CTC_PHASE_PER_STEP = 50,
    ACTC_EARNED_FLOOR = 2500,
    ACTC_RATE = 0.15;
  export const NO_CHILD_CREDIT = { nonrefundable: 0, refundable: 0 };
