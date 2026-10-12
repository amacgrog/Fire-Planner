  // Quebec health contributions (7N N7), charged on the Quebec return like the Ontario Health Premium. (1) The Health Services Fund
  // contribution on income other than employment income and OAS (Revenu Quebec Schedule F, 2025-12; the 2026 thresholds are in the Finance
  // Quebec parameters, Table 3): nil to the first threshold, 1% of the excess to 150, flat to the second threshold, then 150 plus 1% of the
  // excess to 1,000 (the dollar caps are statutory, not indexed). (2) The RAMQ prescription drug insurance premium (Schedule K, 2025-12,
  // premium table; the 2026 maximum from the RAMQ page): the income used is the family net income less 19,890 (single) or 32,240 (couple)
  // plus an amount for dependent children; 7.84% of the first 5,000 and 11.76% above for a single person, 3.93% and 5.89% for each spouse of
  // a couple, capped at the year's maximum. The 2025 table maximum is 755 (six months at 62.00 and six at 63.83); 2026 is six months at
  // 63.83 and six at 65.75 (789 a year from July 2026) = 777.48, so the table is scaled by 777.48 / 755. Every retired adult pays it (owner
  // decision: a working partner is assumed to be on a group plan); the premium is also an eligible medical expense. Not modeled: the
  // exemptions (a group plan, a claim slip, 65 and over with at least 94% of the maximum GIS: that household's income is nil here anyway).
  // The hot path: the rule is passed in (one province lookup per tax call) and the income at which the premium reaches its maximum is
  // worked out once per rule, so a household above it costs one comparison.
  export const RAMQ_CAP = new Map();
