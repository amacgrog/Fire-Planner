// US federal tax-rate what-if: the preset and the input rules (feedback C2)

  // The preset ("Rates rise 20% from 2030"): a plain stress test, every federal income-tax rate a fifth higher from 2030. It
  // models no particular bill.
  export const FED_RATE_PRESET_PCT = 20;
  export const FED_RATE_PRESET_YEAR = 2030;
  // The percent's range: -50 lowers every rate by half; +50 puts the top rate at 55.5%, inside the engine's own rate
  // assumptions (docs/architecture/us-federal-tax.md, "The federal rate what-if").
  export const FED_RATE_PCT_MIN = -50;
  export const FED_RATE_PCT_MAX = 50;
  export const FED_RATE_YEAR_MIN = 2000;
  export const FED_RATE_YEAR_MAX = 2200;
  // The percent, -50 to 50 (a non-number is 0), on the object passed (normalizeState's, or the store's from the field hook).
  export function clampFedRateChangePct(s) {
    s.fedRateChangePct = Math.min(FED_RATE_PCT_MAX, Math.max(FED_RATE_PCT_MIN, Number(s.fedRateChangePct) || 0));
  }
  // The start year, B2's rule: a blank or a non-number is `fallback` (the default); otherwise rounded up (the engine's test is
  // `>=`) and kept in range.
  export function fedRateYear(v, fallback) {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || !Number.isFinite(Number(v))) return fallback;
    return Math.min(FED_RATE_YEAR_MAX, Math.max(FED_RATE_YEAR_MIN, Math.ceil(Number(v))));
  }
  // The change in words for the group summary and the print report ("+20% from 2030", "-10% from 2028, not gains"), or null
  // while the percent is 0.
  export function fedRateChangeText(s) {
    const p = s.fedRateChangePct;
    if (!p) return null;
    return `${p > 0 ? '+' : ''}${p}% from ${s.fedRateChangeYear}${s.fedRateChangeGains === false ? ', not gains' : ''}`;
  }
