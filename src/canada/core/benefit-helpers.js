  // Income-tested benefits for one year (annual dollars). Fills the module-level scratch object BEN (read the
  // lines with getBenefits() right after the call; any later benefitsFor call overwrites them) and returns the
  // total. Allocation-free. Evaluation order: GIS and Allowance first (their results gate the provincial seniors
  // programs), then the child and sales-tax programs. Same-year income stands in for the prior-year return.
  // Children whose age is within [minAge, maxAge] (the list is dependentsInYear; allocation-free).
  export function countKids(kids, minAge, maxAge) {
    let n = 0;
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i].age;
      if (a >= minAge && a <= maxAge) n++;
    }
    return n;
  }
  // Family credit in the shape of the CGEB: an amount for the adult, for a spouse or an eligible dependant (a single parent) and for
  // each child (at most childCap), reduced over a threshold. dependantReplacesChild: the first child of a single parent counts as the
  // eligible dependant instead of as a child. Amounts and thresholds scale with the plan inflation factor when the row is indexed.
  export function familyCreditCA(R, f, fam, couple, n) {
    const fx = R.indexing.amountsAndThresholds ? f : 1,
      m = n > R.childCap ? R.childCap : n;
    let a = R.adult * fx;
    if (couple) a += (R.spouse + R.child * m) * fx;
    else if (m > 0) a += (R.eligibleDependant + R.child * (R.dependantReplacesChild ? m - 1 : m)) * fx;
    return Math.max(0, a - R.reduction.rate * Math.max(0, fam - R.reduction.from * fx));
  }
  // A band table keyed by income: bands of equal width starting at `shift`; income below the first band gets the first value, income past
  // the last band gets nothing (Manitoba 55 PLUS senior component).
  export function bandValue(T, x) {
    const k = Math.floor((x - T.shift) / T.width + 1e-9);
    return k < 0 ? T.values[0] : k >= T.values.length ? 0 : T.values[k];
  }
  // Provinces whose programs pay at any income (no income test), so benefitsFor must not take the high-income early exit.
  export const BEN_NO_EXIT = { mb: true, pe: true };
  export const BEN = { gis: 0, allowance: 0, ccb: 0, cgeb: 0, provChild: 0, provSenior: 0, provCredit: 0, total: 0 };
