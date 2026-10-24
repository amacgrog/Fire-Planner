// A projection row's return figures: the settled tax and healthcare of a 162(l)-settled year, else what the year paid

  // A held year settled at its final draws (B5 step 1) carries taxSettled / healthcareSettled beside the paid tax / healthcare;
  // every other row's paid figures are its return. Whole-run costs (the cliff plan's measure, the optimizers) read these, so a
  // row that does not settle gives the very double `r.tax + r.healthcare` / `r.tax` gives; the carry is timing, never added.
  export function rowCost(r) {
    return r.taxSettled !== undefined ? r.taxSettled + r.healthcareSettled : r.tax + r.healthcare;
  }
  export function rowTax(r) {
    return r.taxSettled !== undefined ? r.taxSettled : r.tax;
  }
