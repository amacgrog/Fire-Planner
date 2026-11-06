// The Canada CSV export's columns: the plan's rows (household RRSP/TFSA totals) and the file name

import { CURRENT_YEAR } from '../../../shared/core/inputs/current-year.js';
import { simulate } from '../../../shared/core/projection/simulate.js';
import { state } from '../../../shared/core/store.js';

  // Each column: its header, its value for row i (a number, a boolean or '' for blank) and whether it is money (the
  // writer converts money to the dollar view on screen).
  export function csvColumns() {
    const sim = simulate(),
      single = !!state.singlePerson,
      f = (label, key) => ({ label, money: true, value: (r) => r[key] ?? 0 });
    const columns = [
      { label: 'Calendar year', value: (r) => CURRENT_YEAR + r.year },
      { label: 'Year index', value: (r) => r.year },
      { label: 'Partner A age', value: (r) => r.age },
      { label: 'Partner B age', value: (r) => (single ? '' : r.ageB) },
      { label: 'Any partner working', value: (r) => r.working },
      { label: 'Partner A working', value: (r) => r.workingA },
      { label: 'Partner B working', value: (r) => (single ? '' : r.workingB) },
      // Income
      f('Wages', 'wages'),
      f('CPP / OAS (after recovery tax)', 'ss'),
      f('Pension', 'pension'),
      f('One-time income', 'oneTimeCash'),
      f('Income-tested benefits', 'benefits'),
      f('GIS', 'benefitGis'),
      f('Allowance', 'benefitAllowance'),
      f('Canada Child Benefit', 'benefitCcb'),
      f('Canada Groceries and Essentials Benefit', 'benefitCgeb'),
      f('Provincial child benefit', 'benefitProvChild'),
      f('Provincial senior benefit', 'benefitProvSenior'),
      f('Provincial credits', 'benefitProvCredit'),
      f('Income before deductions (est.)', 'grossIncome'),
      // Withdrawals
      f('RRIF minimum', 'rmd'),
      f('From RRSP/RRIF (incl. RRIF minimum)', 'traditionalWithdrawn'),
      f('From non-registered', 'taxableWithdrawn'),
      f('Non-registered sold to pay tax', 'taxableSaleForTax'),
      f('From TFSA', 'rothWithdrawn'),
      f('From cash', 'cashWithdrawn'),
      f('From home equity', 'homeWithdrawn'),
      f('Shortfall (not funded)', 'shortfall'),
      // Conversions
      f('RRSP meltdown', 'meltdown'),
      // Spending
      f('Total spending', 'expenses'),
      f('Base spending', 'baseSpend'),
      f('Housing', 'housing'),
      f('Healthcare', 'healthcare'),
      f('Long-term care', 'ltc'),
      f('Loan payments', 'loanPayment'),
      f('Other recurring expenses', 'extraExpense'),
      f('One-time expenses', 'lumpExpense'),
      f('Payroll premiums (not in spending)', 'payrollPremiums'),
      // Taxes
      f('Taxes (before income-tested benefits)', 'tax'),
      f('OAS recovery tax (deducted from CPP/OAS, not in taxes)', 'oasClawback'),
      // Saving
      f('Contributions: RRSP', 'contribRrsp'),
      f('Contributions: TFSA', 'contribTfsa'),
      f('Contributions: FHSA', 'contribFhsa'),
      f('Employer contributions', 'employerContrib'),
      f('Into cash', 'cashTopUp'),
      f('Into non-registered (incl. bond reserve)', 'reinvested'),
      f('Into bond reserve', 'toBondReserve'),
      // Balances
      f('Non-registered', 'taxable'),
      f('Bonds (all accounts)', 'bonds'),
      f('RRSP/RRIF (household)', 'traditional'),
      f('TFSA (household)', 'roth'),
      f('Cash / HYSA (incl. FHSA)', 'cash'),
      f('Home equity', 'homeEquity'),
      f('Loan balances', 'loanBalance'),
      f('Investable assets', 'investable'),
      f('Net assets', 'total'),
    ];
    return { rows: sim.rows, columns, fileStem: 'fire-planner-canada-annual-projection' };
  }
