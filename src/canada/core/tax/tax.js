  // Same loop as progressiveTax, with the caps scaled by `f` in place of a scaled copy.
  export function scaledProgressiveTax(income, caps, rates, f) {
    let tax = 0,
      prev = 0;
    for (let i = 0; i < caps.length; i++) {
      const cap = caps[i] * f;
      tax += Math.min(Math.max(0, income - prev), cap - prev) * rates[i];
      prev = cap;
      if (income <= cap) break;
    }
    return tax;
  }
  export function ontarioHealthPremium(taxableIncome, factor) {
    const i = Math.max(0, taxableIncome);
    if (i <= 20000 * factor) return 0;
    if (i <= 25000 * factor) return (i - 20000 * factor) * 0.06;
    if (i <= 36000 * factor) return 300 * factor;
    if (i <= 38500 * factor) return 300 * factor + (i - 36000 * factor) * 0.06;
    if (i <= 48000 * factor) return 450 * factor;
    if (i <= 48600 * factor) return 450 * factor + (i - 48000 * factor) * 0.25;
    if (i <= 72000 * factor) return 600 * factor;
    if (i <= 72600 * factor) return 600 * factor + (i - 72000 * factor) * 0.25;
    if (i <= 200000 * factor) return 750 * factor;
    if (i <= 200600 * factor) return 750 * factor + (i - 200000 * factor) * 0.25;
    return 900 * factor;
  }
