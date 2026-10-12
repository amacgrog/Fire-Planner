  // `oas` is the OAS this person received. The recovery tax (15% of net income, OAS included, over the
  // threshold, up to the OAS) is worked out here, on the return's full income, so every caller (the year
  // loop, the draw solvers through taxFor, the pension-split search) prices it. As on the T1 the repayment
  // is deducted from net income (line 23500, so net income at line 23600 and the age amount see the
  // lower figure) and added to the tax payable (line 42200); it is not reduced by credits and the Quebec
  // abatement does not touch it. The amount is left in OAS_RECOVERY.last for the caller to read.
  export const OAS_RECOVERY = { last: 0, a: 0, b: 0 };
