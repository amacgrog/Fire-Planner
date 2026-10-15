  // ---- Withdrawal building blocks ----
  export const TAXABLE_BASIS_KEY = { taxable: 'taxableBasis', bondTaxable: 'bondTaxableBasis' };
  // A year's discretionary withdrawal in progress. `need` is the cash still to
  // be raised; the other fields accumulate what the draws did, for tax and the
  // cash-flow display. traditionalGross starts at the RRSP meltdown (ordinary
  // income already this year) and traditionalWithdrawn at the mandatory RRIF
  // minimum; traditionalWithdrawn / taxableWithdrawn fold the bond-reserve
  // buckets into their parent tax status so the Sankey does not undercount them.
  export function newWithdrawal({ bal, profile, meltdownAmount, rmd }) {
    return {
      bal,
      profile,
      need: 0,
      taxableGainGross: 0,
      traditionalGross: meltdownAmount,
      traditionalWithdrawn: rmd,
      taxableWithdrawn: 0,
    };
  }
