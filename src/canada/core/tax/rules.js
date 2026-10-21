  // The planner converts the RRSP to a RRIF at 71 (see rrifMinPct). CRA counts RRIF payments as
  // pension income from 65, but a withdrawal from an RRSP that is not an annuity or RRIF payment
  // is not pension income at any age, so the discretionary draw earns the pension income amount
  // only once the account is a RRIF (7K fix of the 7J rule, which counted it from 65).
  export const RRIF_PENSION_AGE = 71;
  // OAS recovery tax ("clawback"): 15% of net income (including OAS itself)
  // above the 2026 threshold, up to the full OAS amount received. Charged inside
  // personTaxCA (7N N1), on the return's full income. Modeled using the same
  // year's income rather than CRA's actual one-year lookback, as a planning-level
  // simplification (similar in spirit to the US planner's IRMAA lookback approximation).
  export const OAS_RECOVERY_THRESHOLD = 95323; // 2026 (CRA OAS recovery tax page, retrieved 2026-10-06)
