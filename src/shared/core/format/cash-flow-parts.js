// Maps one projection row to the money-in and money-out parts of the yearly cash-flow chart

export function cashFlowParts(row, prevInvestable) {
  const seIn = row.seSettlementIn ?? 0;
  const rmd = row.rmd;
  const traditional = row.traditionalWithdrawn - rmd;
  const roth = row.rothWithdrawn + (row.inheritedRothPayout ?? 0);
  const taxable = row.taxableWithdrawn + row.taxableSaleForTax;
  const cash = row.cashWithdrawn;
  const home = row.homeWithdrawn;
  const sepp72 = row.sepp72 ?? 0;
  const inParts = [
    { key: 'income', value: row.wages + row.oneTimeCash + Math.max(0, seIn) },
    { key: 'lifetime', value: row.ss + row.pension + (row.benefits ?? 0) },
    { key: 'rmd', value: rmd },
    { key: 'traditional', value: traditional },
    { key: 'roth', value: roth },
    { key: 'taxable', value: taxable },
    { key: 'cash', value: cash },
    { key: 'home', value: home },
    { key: 'shortfall', value: row.shortfall },
  ];
  const outParts = [
    { key: 'tax', value: row.tax + Math.max(0, -seIn) },
    { key: 'spending', value: row.expenses },
    { key: 'contributions', value: row.contributions },
    { key: 'cashTopUp', value: row.cashTopUp },
    { key: 'reinvested', value: row.reinvested },
  ];
  const other = traditional + roth + taxable + cash + home;
  const drawn = rmd + other;
  let rate = null;
  if (drawn >= 1 && prevInvestable !== null && prevInvestable >= 1) {
    const r = drawn / prevInvestable;
    if (r <= 1) rate = r;
  }
  let excessRmd = 0;
  if (other < 1 && rmd - sepp72 >= 1) {
    excessRmd = Math.min(rmd - sepp72, Math.max(0, row.cashTopUp - row.oneTimeCash - (row.inheritedRothPayout ?? 0) + row.reinvested));
  }
  return {
    in: inParts,
    out: outParts,
    // the dollars moved to Roth: a US basis year's gross (conversionGross; conversionAmount is its taxable part, PR 2), plus a US
    // backdoor Roth's gross (PR 3)
    conversion: (row.conversionGross ?? row.conversionAmount ?? row.meltdown ?? 0) + (row.backdoor ?? 0),
    rate,
    excessRmd,
    bondReserve: row.toBondReserve,
    saleForTax: row.taxableSaleForTax,
    sepp72,
  };
}
