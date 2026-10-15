import { state } from '../../shared/core/store.js';
import { accountsConvert, rothAccountsConvert } from './withdrawal-mix-and-roth-accounts.js';

  // One year of growth on every account. Stocks (taxable/traditional/Roth),
  // bonds (the three bond-reserve buckets) and cash each grow at their own
  // rate; the home appreciates only when owned. Dividends and interest were
  // already taxed this year (`inv`), so reinvesting them raises cost basis
  // rather than leaving untaxed embedded gain.
  export function growBalances(bal, { stockReturn, bondReturn, hysa, homeGrowth, inv }) {
    bal.taxable *= 1 + stockReturn;
    bal.traditional *= 1 + stockReturn;
    bal.roth *= 1 + stockReturn;
    bal.bondTaxable *= 1 + bondReturn;
    bal.bondTraditional *= 1 + bondReturn;
    bal.bondRoth *= 1 + bondReturn;
    bal.cash *= 1 + hysa;
    bal.taxableBasis = Math.min(bal.taxable, bal.taxableBasis + inv.divTotal);
    bal.bondTaxableBasis = Math.min(bal.bondTaxable, bal.bondTaxableBasis + inv.bondInterest);
    if (state.tenure === 'own' || state.tenure === 'rentThenBuy') bal.home *= 1 + homeGrowth;
  }
  // Takes the year's mandatory distribution (RMD + 72(t) SEPP) out of the
  // traditional balance first, then out of the traditional bond bucket.
  export function withdrawRequiredDistributions(bal, rmd) {
    const rmdFromTraditional = Math.min(bal.traditional, rmd);
    bal.traditional = Math.max(0, bal.traditional - rmdFromTraditional);
    bal.bondTraditional = Math.max(0, bal.bondTraditional - (rmd - rmdFromTraditional));
  }
  // Moves a Roth conversion from the traditional balance (then the traditional
  // bond bucket) into Roth and records it in the ledger, which tracks the 5-year
  // seasoning clock for penalty-free access.
  export function applyRothConversion(bal, rothAccts, accts, conversionAmount, year, seppActive) {
    if (conversionAmount <= 0) return;
    const to = accountsConvert(accts, bal.traditional + bal.bondTraditional, bal.roth + bal.bondRoth, conversionAmount, seppActive);
    const fromTradConv = Math.min(bal.traditional, conversionAmount);
    bal.traditional -= fromTradConv;
    bal.bondTraditional = Math.max(0, bal.bondTraditional - (conversionAmount - fromTradConv));
    bal.roth += conversionAmount;
    rothAccountsConvert(rothAccts, to, year);
  }
