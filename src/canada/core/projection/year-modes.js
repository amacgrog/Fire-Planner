  // A year with income above spending, tax and contributions: the surplus first tops cash
  // up to the reserve, then (bucket strategy in an up year, bondTarget not null) rebuilds
  // the bond reserve, and the rest is invested in taxable. This year's contributions then
  // go into the RRSP, TFSA and FHSA.
  export function routeSurplus(bal, { flow, reserveTarget, bondTarget, traditionalContrib, employerMatch, rothContrib, fhsaContrib }) {
    const cashTopUp = Math.min(flow, Math.max(0, reserveTarget - bal.cash));
    bal.cash += cashTopUp;
    let remainder = flow - cashTopUp;
    if (bondTarget !== null) {
      const bondDeficit = Math.max(0, bondTarget - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth)),
        toBonds = Math.min(remainder, bondDeficit);
      bal.bondTaxable += toBonds;
      bal.bondTaxableBasis += toBonds;
      remainder -= toBonds;
    }
    bal.taxable += remainder;
    bal.taxableBasis += remainder;
    bal.traditional += traditionalContrib + employerMatch;
    bal.roth += rothContrib;
    bal.fhsa += fhsaContrib;
  }
  // The explicit differences between the two ways of running the engine. These switches
  // reproduce today's behavior exactly; the historical-parity work turns the bucket mode's
  // switches on one at a time.
  //  bucketStrategy: bucket withdrawals (cash/bonds first in a down year, bond reserve
  //                  refilled in up years) instead of the standard cascade
  export const STANDARD_MODE = { bucketStrategy: false };
  export const BUCKET_MODE = { bucketStrategy: true };
