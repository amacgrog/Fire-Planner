import { BENEFIT_RULES } from './benefits/benefit-rules.js';

  // ---- Income-tested benefit evaluators (7L) ----
  // Linear interpolation over [income, benefit] knots; zero past the last knot; a repeated income is a cliff.
  export function interpKnots(k, x) {
    if (!(x > 0)) x = 0;
    const n = k.length;
    if (x >= k[n - 1][0]) return k[n - 1][1];
    for (let i = 1; i < n; i++) {
      if (x < k[i][0]) {
        const xa = k[i - 1][0];
        return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (x - xa)) / (k[i][0] - xa);
      }
    }
    return 0;
  }
  // Annual GIS (or Allowance) for one household situation at an annual income (net income less OAS and the
  // employment exemption, combined for couples). `factor` is the plan inflation factor: amounts and income
  // cutoffs scale together.
  export function gisAnnual(situation, income, factor = 1) {
    return interpKnots(BENEFIT_RULES.gis.situations[situation], income / factor) * factor;
  }
  // GIS employment income exemption: the first 5,000 is exempt and half of the next 10,000 (per person).
  export function gisEmploymentExemption(earned) {
    const e = BENEFIT_RULES.gis.employmentExemption;
    return Math.min(earned, e.full) + 0.5 * Math.min(Math.max(earned - e.full, 0), e.halfBand);
  }
