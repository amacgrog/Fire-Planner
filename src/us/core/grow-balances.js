import { state } from '../../shared/core/store.js';

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
