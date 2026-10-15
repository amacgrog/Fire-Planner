import { state } from './store.js';

  // Total "other loans" payment for the year. In the survivor period the
  // remaining balance is paid off as a lump sum in the year of death
  // (approximating debts settled through probate) and nothing is owed after.
  export function loanPaymentForYear({ year, deathYear, isSurvivorPeriod, loans }) {
    const loanPayment = isSurvivorPeriod && year > deathYear
      ? 0
      : year === deathYear
        ? loans.reduce(
            (sum, l, i) =>
              sum + (year > 0 ? l.balances[year - 1] : Number(state.loans[i]?.balance) || 0),
            0,
          )
        : loans.reduce((sum, l) => sum + (l.payments[year] || 0), 0);
    return { loanPayment };
  }
