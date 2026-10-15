  // Cliff plan (spec sections 3 and 5): chosen once per render on the deterministic projection. Candidates: the chooser's
  // whole plan (its own run: apply would reproduce it exactly), the ACA-family and IRMAA-family subsets when both families
  // appear, and no steering. Rule A: later depletion first, then the ending after-tax value by more than $1, then fewer
  // intents. Lifetime real tax plus healthcare is reported, never ranked.
  export function planCandidateBetter(a, b) {
    const da = a.depletedAge == null ? Infinity : a.depletedAge,
      db = b.depletedAge == null ? Infinity : b.depletedAge;
    if (da !== db) return da > db;
    if (a.value > b.value + 1) return true;
    if (b.value > a.value + 1) return false;
    return a.n < b.n;
  }
