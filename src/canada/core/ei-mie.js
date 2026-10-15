  // Working-year payroll items for one earner (7N N4), per CRA and Revenu Quebec 2026 figures. cash is the employee cost
  // (CPP or QPP, CPP2, EI, QPIP). The tax return treats the pieces differently: the base CPP/QPP contribution (CPP 4.95%,
  // QPP 5.30%: the rate less the 1% first additional), the EI premium and the QPIP premium are non-refundable credits at
  // the lowest rate (federal and, outside Quebec, provincial); the enhanced part (the 1% first additional and the 4%
  // second additional, CPP2) is a deduction from income, federal, provincial and Quebec's (Schedule U part B); the Canada
  // employment amount is a federal credit; Quebec has no credit for these but gives a workers deduction (6% of work
  // income to a maximum) at the provincial level only. The result is left in the scratch object PAY (allocation-free);
  // read it right after the call. Everything is zero without wages. Computed once a year (not inside the solvers).
  export const EI_MIE = 68900,
    CPP_ENHANCED_RATE = 0.01,
    EMPLOYMENT_AMOUNT = 1501,
    QC_WORKERS_DEDUCTION_MAX = 1450,
    QC_WORKERS_DEDUCTION_RATE = 0.06;
  export const PAY = { cash: 0, fedCredit: 0, provCredit: 0, deduction: 0, provDeduction: 0 };
