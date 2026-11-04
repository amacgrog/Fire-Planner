// US standard and bucket run modes, and the surplus-routing step

  // A year with income above spending, tax and contributions: the surplus first tops cash
  // up to the reserve, then (bondTarget not null: the bucket strategy in an up year, the standard mode's maintained
  // reserve, Batch 5 step 5b) rebuilds
  // the bond reserve, and the rest is invested in taxable. This year's contributions then
  // go into the traditional and Roth accounts. SURPLUS_OUT records where the
  // surplus landed, every field on every call, for the cash-flow chart: read it
  // right after the call.
  export const SURPLUS_OUT = { cashTopUp: 0, toBonds: 0, toTaxable: 0 };
  export function routeSurplus(bal, { flow, reserveTarget, bondTarget, traditionalContrib, employerMatch, rothContrib }) {
    const cashTopUp = Math.min(flow, Math.max(0, reserveTarget - bal.cash));
    bal.cash += cashTopUp;
    let remainder = flow - cashTopUp;
    SURPLUS_OUT.cashTopUp = cashTopUp;
    SURPLUS_OUT.toBonds = 0;
    if (bondTarget !== null) {
      const bondDeficit = Math.max(0, bondTarget - (bal.bondTaxable + bal.bondTraditional + bal.bondRoth)),
        toBonds = Math.min(remainder, bondDeficit);
      bal.bondTaxable += toBonds;
      bal.bondTaxableBasis += toBonds;
      remainder -= toBonds;
      SURPLUS_OUT.toBonds = toBonds;
    }
    SURPLUS_OUT.toTaxable = remainder;
    bal.taxable += remainder;
    bal.taxableBasis += remainder;
    bal.traditional += traditionalContrib + employerMatch;
    bal.roth += rothContrib;
  }
  // The explicit differences between the two ways of running the engine. These switches
  // reproduce today's behavior exactly; the historical-parity work turns the bucket mode's
  // switches on one at a time.
  //  bucketStrategy:    bucket withdrawals (cash/bonds first in a down year, bond reserve
  //                     refilled in up years) instead of the standard cascade
  export const STANDARD_MODE = { bucketStrategy: false };
  export const BUCKET_MODE = { bucketStrategy: true };
