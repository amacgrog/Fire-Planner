// Spending tiers, growth factors, mortgage and loan schedules, lump expenses

import { state } from '../store.js';
import { pct } from '../format/numbers.js';

  // Mortgage payoff and rent-then-buy fields that both engines return.
  export function mortgageResultAges(futureBuy, schedule) {
    const payoffYear = state.tenure === 'rentThenBuy' ? futureBuy.payoffYear : schedule.payoffYear;
    return {
      payoffAge: payoffYear === null ? null : state.ageA + payoffYear,
      buyAge: state.tenure === 'rentThenBuy' ? state.buyAge : null,
    };
  }
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
  export function mortgagePayment(principal, annualRate, years) {
    if (!principal || !years) return 0;
    const r = annualRate / 12,
      n = years * 12;
    return r ? (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : principal / n;
  }
  // Growth multiplier for an "add another" income/expense item at `year`
  // (years from today). `followGrowth` items track the engine's own running
  // inflation factor (expenses — so the historical backtest uses actual
  // historical inflation) or the Annual income growth factor (income); the
  // rest compound at their own `growth` rate. Amounts are entered in today's
  // dollars, so growth runs from today, not from the item's start age.
  // The household spending figure in force at a given Partner A age, in
  // nominal dollars: the active spending change that started latest (a change
  // is active from its start age through its end age, inclusive), grown by
  // its own rule; otherwise the base "Annual household spending" inflated.
  export function baseSpendingNominal(age, year, inflationFactor, incomeFactor) {
    let best = null;
    for (const t of state.spendingTiers)
      if (age >= t.startAge && age <= t.endAge && (!best || t.startAge > best.startAge)) best = t;
    return best
      ? best.amount * itemGrowthFactor(best, year, 'expense', inflationFactor, incomeFactor)
      : state.spending * inflationFactor;
  }
  export function itemGrowthFactor(item, year, kind, inflationFactor, incomeFactor) {
    if (item.flat) return 1; // fixed dollar amount at the occurrence — no growth
    if (item.followGrowth) return kind === 'income' ? incomeFactor : inflationFactor;
    return Math.pow(1 + pct(Number(item.growth) || 0), year);
  }
  // A one-time expense hits at its first age, and (if repeatEvery > 0) again
  // every repeatEvery years after that through untilAge.
  export function lumpExpenseHits(e, age) {
    const first = Math.round(e.age),
      every = Math.round(Number(e.repeatEvery) || 0);
    if (age === first) return true;
    return every > 0 && age > first && age <= e.untilAge && (age - first) % every === 0;
  }
  export function loanSchedules() {
    return state.loans.map((loan) => {
      let balance = Math.max(0, Number(loan.balance) || 0),
        rate = pct(Number(loan.rate) || 0) / 12,
        term = Math.max(0, Number(loan.term) || 0),
        // Fixed at origination by the original principal and term, not
        // recalculated from today's balance — see mortgageSchedule() for
        // why. Falls back to the current balance if no original principal
        // is entered.
        originalPrincipal = Number(loan.principal) > 0 ? Number(loan.principal) : balance,
        scheduled = mortgagePayment(originalPrincipal, Number(loan.rate) || 0, term),
        payments = [],
        balances = [];
      for (let year = 0; year <= 70; year++) {
        let paid = 0;
        for (let month = 0; month < 12 && balance > 0 && year < term; month++) {
          let interest = balance * rate,
            principal = Math.min(
              balance,
              Math.max(0, scheduled - interest) + (Number(loan.extra) || 0),
            );
          balance -= principal;
          paid += interest + principal;
        }
        payments.push(paid);
        balances.push(Math.max(0, balance));
      }
      return { payments, balances };
    });
  }
  // Builds a payment/balance schedule for a mortgage that doesn't start
  // until startYear (used for a future home purchase), indexed 0..maxYear
  // so it lines up directly with the main simulation loop; zero before
  // startYear and after payoff.
  function buildDeferredMortgage(
    principal,
    annualRate,
    termYears,
    extraMonthly,
    startYear,
    maxYear,
  ) {
    const payments = Array(maxYear + 1).fill(0),
      balances = Array(maxYear + 1).fill(0),
      interest = Array(maxYear + 1).fill(0);
    if (principal <= 0 || termYears <= 0) return { payments, balances, interest, principal };
    let balance = principal;
    const scheduled = mortgagePayment(principal, annualRate, termYears),
      rate = annualRate / 12;
    for (let year = startYear; year <= maxYear; year++) {
      let paid = 0,
        interestPaid = 0;
      if (year - startYear < termYears) {
        for (let month = 0; month < 12 && balance > 0; month++) {
          const monthInterest = balance * rate,
            scheduledPrincipal = Math.max(0, scheduled - monthInterest),
            princ = Math.min(balance, scheduledPrincipal + extraMonthly);
          balance -= princ;
          paid += monthInterest + princ;
          interestPaid += monthInterest;
        }
      }
      payments[year] = paid;
      interest[year] = interestPaid;
      balances[year] = Math.max(0, balance);
    }
    return { payments, balances, interest, principal };
  }
  // Precomputes the mechanics of a future rent-to-buy purchase: the home's
  // value at the purchase year (today's homeValue input, appreciated
  // forward), the one-time cash outlay (full price if paying cash, or down
  // payment + closing costs if financing), and the resulting mortgage
  // schedule.
  export function futureHomePurchase(homeGrowth) {
    const buyYear = Math.max(0, Math.round(state.buyAge - state.ageA));
    const homeValueAtPurchase = state.homeValue * Math.pow(1 + homeGrowth, buyYear);
    const downPayment = state.buyCash
      ? homeValueAtPurchase
      : homeValueAtPurchase * pct(state.buyDownPct);
    const closingCosts = state.buyCash ? 0 : homeValueAtPurchase * pct(state.buyClosingPct);
    const loanPrincipal = state.buyCash ? 0 : Math.max(0, homeValueAtPurchase - downPayment);
    const purchaseCash = downPayment + closingCosts;
    const buyTermYears = state.buyTerm;
    const buySchedule = buildDeferredMortgage(
      loanPrincipal,
      pct(state.mortgageRate),
      buyTermYears,
      state.buyExtraPrincipal,
      buyYear,
      100,
    );
    const payoffIdx = buySchedule.balances.findIndex((b, i) => i >= buyYear && b < 1);
    return {
      buyYear,
      homeValueAtPurchase,
      purchaseCash,
      buySchedule,
      payoffYear: payoffIdx < 0 ? null : payoffIdx,
    };
  }
  export function mortgageSchedule() {
    const payments = [],
      balances = [],
      interest = [];
    let balance = state.tenure === 'own' ? state.mortgage : 0;
    // The level payment is fixed at origination by the *original* principal
    // and term, not by whatever balance happens to be left today — extra
    // principal already paid shortens the payoff, it doesn't change the
    // payment amount. Falls back to the current balance if no original
    // amount is entered (e.g. an older saved scenario), which reproduces
    // the old (slightly wrong, but harmless-if-no-extra-payments) behavior
    // rather than breaking silently.
    const originalPrincipal = state.mortgagePrincipal > 0 ? state.mortgagePrincipal : balance,
      scheduled = mortgagePayment(originalPrincipal, pct(state.mortgageRate), state.mortgageYears),
      rate = pct(state.mortgageRate) / 12,
      maxYears = Math.max(0, state.mortgageYears);
    for (let year = 0; year <= Math.max(70, maxYears); year++) {
      let paid = 0,
        interestPaid = 0;
      for (let month = 0; month < 12 && balance > 0 && year < maxYears; month++) {
        const monthInterest = balance * rate,
          scheduledPrincipal = Math.max(0, scheduled - monthInterest),
          principal = Math.min(balance, scheduledPrincipal + state.extraPrincipal);
        balance -= principal;
        paid += monthInterest + principal;
        interestPaid += monthInterest;
      }
      payments.push(paid);
      interest.push(interestPaid);
      balances.push(Math.max(0, balance));
    }
    const payoffYear = balances.findIndex((b) => b < 1);
    return {
      payments,
      balances,
      interest,
      originalPrincipal,
      payoffYear: payoffYear < 0 ? null : payoffYear,
    };
  }
