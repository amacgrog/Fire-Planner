// MEDICAID_RULES: the US Medicaid and premium-credit floor data and lookups

  // ACA premium tax credit — 2026 plan year reverts to the pre-2021 structure:
  // a sliding applicable-percentage schedule from 100%-400% of the federal
  // poverty line (IRS Rev. Proc. 2025-25), then a hard cliff above 400%.
  // "Assume enhanced subsidies return" models the 2021-2025 ARPA/IRA structure
  // instead (no cliff, capped at 8.5% of income), in case Congress extends it.
  // Medicaid for adults under 65 and the premium-credit floor (Batch 7O, O1). Pure literals (read by
  // nothing else; the state-tax generator and coverage test do not see this table).
  // `expansionLimit`: Medicaid for an adult at or below this share of the poverty line (42 CFR 435.119:
  // 133%, plus the 5-point disregard of 435.603(d)(4)). `nonExpansion`: the ten states with no
  // adult group (KFF, Aug 2026). `adultCoverage`: a non-expansion state that covers adults anyway,
  // to that share (Wisconsin's BadgerCare waiver, 100% through 2029). `ptcFloor`: no premium tax
  // credit below this share (IRC 36B(c)(1)(A)). `workRequirement`: from `fromYear` an adult 19 to 64
  // in the adult group (or a waiver covering the same people) must show community engagement, unless
  // a parent or caregiver of a child `exemptChildMaxAge` or younger (SSA 1902(xx), CMCS Informational
  // Bulletin 12/8/2025); one denied for failing it is barred from the premium credit (1902(xx)(7)(B)).
  // MEDICAID_RULES:begin
  export const MEDICAID_RULES = {
    expansionLimit: 1.38,
    nonExpansion: ['al', 'fl', 'ga', 'ks', 'ms', 'sc', 'tn', 'tx', 'wi', 'wy'],
    adultCoverage: { wi: 1.0 },
    ptcFloor: 1.0,
    workRequirement: { fromYear: 2027, exemptChildMaxAge: 13 },
    asOf: 2026,
  };
  // MEDICAID_RULES:end
  // Highest share of the poverty line at which an adult is on Medicaid in this state (0: none).
  const medicaidLimitCache = {};
  export function medicaidLimit(code) {
    let v = medicaidLimitCache[code];
    if (v === undefined) {
      const R = MEDICAID_RULES;
      v = R.nonExpansion.indexOf(code) < 0 ? R.expansionLimit : R.adultCoverage[code] || 0;
      medicaidLimitCache[code] = v;
    }
    return v;
  }
  // True when the household has a child aged `maxAge` or younger in that calendar year (no allocation); a child
  // counts from its join year, as in dependentsInYear (E2).
  export function hasChildAtMost(inputs, taxYear, maxAge) {
    const kids = inputs.children;
    if (!kids) return false;
    for (let i = 0; i < kids.length; i++) {
      const age = taxYear - kids[i].birthYear;
      if (age >= 0 && age <= maxAge && !(kids[i].joinYear > taxYear)) return true;
    }
    return false;
  }
