import { PROVINCE_RULES } from './province-rules.js';
import { itemGrowthFactor, lumpExpenseHits } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';

  // Home buyers' amounts for a first-time buyer in the purchase year (7N N10): the federal 10,000 and the province's own
  // (Saskatchewan 15,000 from 2025, Quebec 10,000 = the 1,400 maximum at its 14% rate), each a non-refundable credit base.
  // Statutory flat amounts, not indexed. One claim on the higher-income partner's return.
  const HOME_BUYERS_AMOUNT = 10000;
  export function homeBuyerAmounts(code) {
    const rule = PROVINCE_RULES[code];
    return [HOME_BUYERS_AMOUNT, rule && rule.homeBuyer ? rule.homeBuyer.amount : 0];
  }
  // ---- Per-year helpers shared by simulate() and simulateHistoricalCore() ----
  // This year's amounts from the add-as-you-go lists: recurring extra income
  // and extra expenses (active between their start and end age, growing with
  // inflation or their own rate), one-time income at an exact age, and lump
  // expenses (which may repeat). Ages are Partner A's.
  export function listAmountsForYear({ age, year, factor, incomeFactor }) {
    const extraIncome = state.incomeSources
      .filter((s) => age >= s.startAge && age <= s.endAge)
      .reduce((sum, s) => sum + s.amount * itemGrowthFactor(s, year, 'income', factor, incomeFactor), 0);
    const oneTimeAmount = state.oneTimeIncome
      .filter((o) => Math.round(o.age) === age)
      .reduce((sum, o) => sum + o.amount * (o.flat ? 1 : factor), 0);
    const extraExpense = state.extraExpenses
      .filter((e) => age >= e.startAge && age <= e.endAge)
      .reduce((sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor), 0);
    const lumpExpense = state.lumpExpenses
      .filter((e) => lumpExpenseHits(e, age))
      .reduce((sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor), 0);
    return { extraIncome, oneTimeAmount, extraExpense, lumpExpense };
  }
  // Takes the year's mandatory distribution (RMD + 72(t) SEPP) out of the
  // traditional balance first, then out of the traditional bond bucket.
  export function withdrawRequiredDistributions(bal, rmd) {
    const rmdFromTraditional = Math.min(bal.traditional, rmd);
    bal.traditional = Math.max(0, bal.traditional - rmdFromTraditional);
    bal.bondTraditional = Math.max(0, bal.bondTraditional - (rmd - rmdFromTraditional));
  }
