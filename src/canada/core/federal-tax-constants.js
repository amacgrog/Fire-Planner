  function progressiveTax(income, brackets) {
    let tax = 0,
      prev = 0;
    for (const [cap, rate] of brackets) {
      const slice = Math.min(Math.max(0, income - prev), cap - prev);
      tax += slice * rate;
      prev = cap;
      if (income <= cap) break;
    }
    return tax;
  }
  // 2026 federal brackets (CRA), held constant in real terms like the rest of
  // this planner's tax parameters. Non-refundable credits are worth the lowest
  // rate (14% in 2026) of the credit amount, subtracted from the tax on the
  // brackets (they are not deductions at the marginal rate). The basic personal
  // amount is $16,452 up to the 29% bracket threshold and phases down linearly
  // to $14,829 at the 33% threshold (CRA indexation notice for 2026), keyed on
  // net income. `extraCreditBase` is further credit amounts (age amount, pension
  // income amount) the caller has already worked out; tax cannot go below zero.
  export const FED_CREDIT_RATE = 0.14,
    FED_BPA_MIN = 14829,
    FED_BPA_ENHANCED = 1623, // 16,452 - 14,829
    FED_BPA_PHASE_START = 181440,
    FED_BPA_PHASE_END = 258482;
  // The federal brackets as flat arrays (no per-call allocation); scaledProgressiveTax multiplies the caps by the index factor.
  export const FED_CAPS = [58523, 117045, 181440, 258482, Infinity],
    FED_RATES = [0.14, 0.205, 0.26, 0.2929, 0.33];
