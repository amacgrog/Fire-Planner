// US Social Security benefit-cut what-if: the Trustees' preset and the input rules (feedback B2)

  // The preset ("Use the Trustees' projection"): the 2026 OASDI Trustees Report (June 2026) projects the OASI trust fund's
  // reserves depleted in the fourth quarter of 2032, after which continuing income pays about 78% of scheduled benefits.
  // Revisit all three with every annual Trustees Report (and the cut field's info bubble, which names the figures).
  export const SS_TRUSTEES_CUT_PCT = 22;
  export const SS_TRUSTEES_CUT_START_YEAR = 2033;
  export const SS_TRUSTEES_REPORT_YEAR = 2026;
  export const SS_BENEFIT_CUT_YEAR_MIN = 2000;
  export const SS_BENEFIT_CUT_YEAR_MAX = 2200;
  // The percent, 0 to 100 (a non-number is 0), on the object passed (normalizeState's, or the store's from the field hook).
  export function clampSsBenefitCutPct(s) {
    s.ssBenefitCutPct = Math.min(100, Math.max(0, Number(s.ssBenefitCutPct) || 0));
  }
  // The start year: a blank or a non-number is `fallback` (the default); otherwise rounded up (the engine's test is `>=`, so
  // 2034.4 cuts from 2035 either way) and kept in range (0, an emptied box, becomes 2000: still a cut from now).
  export function ssBenefitCutYear(v, fallback) {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || !Number.isFinite(Number(v))) return fallback;
    return Math.min(SS_BENEFIT_CUT_YEAR_MAX, Math.max(SS_BENEFIT_CUT_YEAR_MIN, Math.ceil(Number(v))));
  }
