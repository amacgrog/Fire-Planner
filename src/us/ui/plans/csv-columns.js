// The US CSV export's columns: the plan's rows, each partner's retirement accounts, and the file name

import { CURRENT_YEAR } from '../../../shared/core/inputs/current-year.js';
import { simulateWithAccountLog } from '../../../shared/core/projection/runs.js';
import { state } from '../../../shared/core/store.js';
import { storeContext } from '../../core/projection/store-context.js';

  // Each column: its header, its value for row i (a number, a boolean or '' for blank) and whether it is money (the
  // writer converts money to the dollar view on screen). Optional row fields are 0 when the row does not carry them.
  export function csvColumns() {
    const { sim, accountLog } = simulateWithAccountLog(storeContext()),
      single = !!state.singlePerson,
      f = (label, key) => ({ label, money: true, value: (r) => r[key] ?? 0 }),
      slot = (label, kind, i, partnerB) => ({ label, money: true, value: (r, n) => (partnerB && single ? '' : accountLog[n][kind][i]) });
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
      f('Social Security', 'ss'),
      f('Pension', 'pension'),
      f('One-time income', 'oneTimeCash'),
      f('162(l) carry received', 'seSettlementIn'),
      f('Income before deductions (est.)', 'income'),
      f('MAGI (est., household)', 'magiProxy'),
      // Withdrawals
      f('RMD (incl. 72(t))', 'rmd'),
      f('72(t) payments', 'sepp72'),
      f('From traditional (incl. RMD, 72(t), inherited IRA)', 'traditionalWithdrawn'),
      f('From inherited IRA', 'inheritedDraw'),
      f('From brokerage', 'taxableWithdrawn'),
      f('Brokerage sold to pay tax', 'taxableSaleForTax'),
      f('From Roth', 'rothWithdrawn'),
      f('Inherited Roth payout', 'inheritedRothPayout'),
      f('From cash', 'cashWithdrawn'),
      f('From home equity', 'homeWithdrawn'),
      f('Shortfall (not funded)', 'shortfall'),
      // Conversions
      { label: 'Roth conversion', money: true, value: (r) => r.conversionGross ?? r.conversionAmount },
      f('Roth conversion (taxable part)', 'conversionAmount'),
      f('Backdoor Roth', 'backdoor'),
      // Spending
      f('Total spending', 'expenses'),
      f('Base spending', 'baseSpend'),
      f('Housing', 'housing'),
      f('Healthcare', 'healthcare'),
      f('Long-term care', 'ltc'),
      f('Loan payments', 'loanPayment'),
      f('Other recurring expenses', 'extraExpense'),
      f('One-time expenses', 'lumpExpense'),
      f('Payroll health premiums (not in spending)', 'payrollPremiums'),
      // Taxes
      f('Taxes (total)', 'tax'),
      f('Early-withdrawal penalty (included in taxes)', 'earlyPenalty'),
      // Saving
      f('Contributions: traditional', 'contribTraditional'),
      f('Contributions: Roth', 'contribRoth'),
      f('Employer contributions', 'employerContrib'),
      f('Into cash', 'cashTopUp'),
      f('Into brokerage', 'reinvested'),
      f('Into bond reserve', 'toBondReserve'),
      // Balances
      f('Taxable brokerage', 'taxable'),
      f('Bonds (all accounts)', 'bonds'),
      f('Traditional (all, incl. inherited; excl. bonds)', 'traditional'),
      f('Roth (all, incl. inherited; excl. bonds)', 'roth'),
      f('Cash / HYSA', 'cash'),
      f('Home equity', 'homeEquity'),
      f('Loan balances', 'loanBalance'),
      f('Investable assets', 'investable'),
      f('Net assets', 'total'),
      // Per account, by original owner, each with its share of that account type's bonds (ACCOUNT_SLOTS order)
      slot('Partner A traditional IRA (incl. its bonds)', 'trad', 0, false),
      slot('Partner A 401(k) (incl. its bonds)', 'trad', 1, false),
      slot('Partner B traditional IRA (incl. its bonds)', 'trad', 2, true),
      slot('Partner B 401(k) (incl. its bonds)', 'trad', 3, true),
      slot('Partner A Roth IRA (incl. its bonds)', 'roth', 0, false),
      slot('Partner A Roth 401(k) (incl. its bonds)', 'roth', 1, false),
      slot('Partner B Roth IRA (incl. its bonds)', 'roth', 2, true),
      slot('Partner B Roth 401(k) (incl. its bonds)', 'roth', 3, true),
      f('Inherited IRA', 'inheritedTrad'),
      f('Inherited Roth', 'inheritedRoth'),
      f('IRA basis (after-tax dollars)', 'iraBasis'),
    ];
    return { rows: sim.rows, columns, fileStem: 'fire-planner-annual-projection' };
  }
