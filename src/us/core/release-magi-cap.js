import { solveTraditionalForNetFromNeed, takeTraditional } from './withdrawals/draws.js';

  // Lifts the cap and takes any remaining need from penalty-free traditional money (stocks, then the bond
  // bucket): runs before penalized money and before home equity, so a target never strands money.
  export function releaseMagiCap(wd, solver) {
    if (!wd.magiCap || wd.magiCap.off) return;
    wd.magiCap.off = true;
    if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
    if (wd.need > 0 && wd.bal.bondTraditional > 0)
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
  }
