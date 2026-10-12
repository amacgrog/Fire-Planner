import { clamp, pct } from '../../shared/core/basics.js';
import { state } from '../../shared/core/store.js';
import { filingKey, NIIT_THRESHOLD } from './federal-deductions.js';
import { currentYear } from './tax-year.js';

  export function niitTax(magi, netInvestmentIncome, filing = 'mfj') {
    return (
      0.038 *
      Math.min(
        Math.max(0, netInvestmentIncome),
        Math.max(0, magi - NIIT_THRESHOLD[filingKey(filing, 'niit')]),
      )
    );
  }
  // SECURE 2.0: RMDs begin at 75 for people born in 1960 or later, and at 73 for
  // those born 1951-1959. Birth year is estimated from today's age (the planner
  // only collects age), so `currentYear` (from `core/tax-year.js`) is a live binding tests can pin.
  export function rmdStartAge(currentAge) {
    return currentYear - Math.round(currentAge) >= 1960 ? 75 : 73;
  }
  export function rmdDivisor(age) {
    const table = {
      72: 27.4,
      73: 26.5,
      74: 25.5,
      75: 24.6,
      76: 23.7,
      77: 22.9,
      78: 22.0,
      79: 21.1,
      80: 20.2,
      81: 19.4,
      82: 18.5,
      83: 17.7,
      84: 16.8,
      85: 16.0,
      86: 15.2,
      87: 14.4,
      88: 13.7,
      89: 12.9,
      90: 12.2,
      91: 11.5,
      92: 10.8,
      93: 10.1,
      94: 9.5,
      95: 8.9,
      96: 8.4,
      97: 7.8,
      98: 7.3,
      99: 6.8,
      100: 6.4,
    };
    return table[age] || Math.max(2.0, 6.4 - (age - 100) * 0.2);
  }
  // IRS Single Life Expectancy Table (Pub. 590-B, effective for distribution
  // calendar years beginning 2022+) — used only for the 72(t) SEPP "RMD
  // method" mandatory distribution below, not for actual RMDs (which use the
  // Uniform Lifetime Table via rmdDivisor() above; the two tables are
  // intentionally different and don't need to line up at any shared age).
  export function singleLifeDivisor(age) {
    const table = {
      18: 67.0, 19: 66.0, 20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2,
      26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3, 30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5,
      34: 51.5, 35: 50.5, 36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7, 40: 45.7, 41: 44.8,
      42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0, 48: 38.1, 49: 37.1,
      50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8,
      58: 28.9, 59: 28.0, 60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9,
    };
    const clamped = Math.max(18, Math.min(65, Math.round(age)));
    return table[clamped];
  }
  // E1e: the full Single Life Table (Treas. Reg. 1.401(a)(9)-9(b), distribution calendar years from 2022), ages 0-120: an
  // inherited account's yearly RMD divisor (spec 6.2). singleLifeDivisor above (72(t), 18-65) is unchanged.
  const SINGLE_LIFE_TABLE = [
    84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9, 74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0,
    67.0, 66.0, 65.0, 64.1, 63.1, 62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3, 55.3, 54.4, 53.4, 52.5, 51.5, 50.5,
    49.6, 48.6, 47.7, 46.7, 45.7, 44.8, 43.8, 42.9, 41.9, 41.0, 40.0, 39.0, 38.1, 37.1, 36.2, 35.3, 34.3, 33.4,
    32.5, 31.6, 30.6, 29.8, 28.9, 28.0, 27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4, 19.6, 18.8, 18.0,
    17.2, 16.4, 15.6, 14.8, 14.1, 13.3, 12.6, 11.9, 11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1,
    5.7, 5.3, 4.9, 4.6, 4.3, 4.0, 3.7, 3.4, 3.2, 3.0, 2.8, 2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1,
    2.0, 2.0, 2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1, 1.0,
  ];
  export function singleLifeFactor(age) {
    const a = Math.round(age);
    return a >= 120 ? 1.0 : a <= 0 ? SINGLE_LIFE_TABLE[0] : SINGLE_LIFE_TABLE[a];
  }
  // Annual taxable investment income on the taxable brokerage account and
  // the taxable bond reserve/cash. Dividends and interest are part of the
  // modeled total return (never added on top of it), but unlike unrealized
  // growth they are taxed in the year they are paid: non-qualified
  // dividends and interest as ordinary income, qualified dividends at
  // long-term gain rates. Computed on start-of-year balances. Reinvested
  // dividends/interest raise cost basis (see the callers) so the gain
  // realized at sale is not taxed a second time. Taxable-bond interest uses
  // the planner's bond return assumption as its yield in both engines.
  export function investmentIncome(taxableBal, bondTaxableBal, cashBal, bondRate, cashRate) {
    const divTotal = Math.max(0, taxableBal) * pct(state.dividendYield),
      qualified = divTotal * clamp(pct(state.qualifiedDivPct), 0, 1),
      bondInterest = Math.max(0, bondTaxableBal) * Math.max(0, bondRate),
      cashInterest = Math.max(0, cashBal) * Math.max(0, cashRate);
    return {
      ordinary: divTotal - qualified + bondInterest + cashInterest,
      qualified,
      divTotal,
      bondInterest,
    };
  }
