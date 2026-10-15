  // After-tax estate (7N N8), a display figure that changes no projection. At the last death the RRSP/RRIF is income on the final
  // return and the unrealized gains of the taxable accounts are deemed realized (50% inclusion); the TFSA and the principal residence
  // are not taxed. Provincial probate fees fall on the estate that passes through probate: the taxable accounts, cash and the home
  // (registered accounts and the TFSA are assumed to pass by beneficiary designation, outside the estate; Ontario's page confirms that
  // designated RRSP, RRIF and TFSA are excluded). The final return is one person's: the deemed income is stacked on that person's share
  // of the last year's income, and the tax is the difference. Fee schedules are in today's dollars (indexed with the plan). Quebec: a
  // notarial will needs no probate (no fee); Manitoba abolished its probate charges in 2020.
  export function probateFee(rule, value) {
    const p = rule.probate;
    for (let i = 0; i < p.steps.length; i++) if (value <= p.steps[i][0]) return p.steps[i][1];
    let fee = p.base;
    for (let i = 0; i < p.bands.length; i++) {
      const from = p.bands[i][0],
        to = i + 1 < p.bands.length ? p.bands[i + 1][0] : Infinity;
      if (value > from) fee += p.bands[i][1] * Math.ceil((Math.min(value, to) - from) / 1000);
    }
    return fee;
  }
