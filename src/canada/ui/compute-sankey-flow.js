// Works out the cash-flow Sankey flows for one year

import { sankeyHue } from '../../shared/core/sankey-hues.js';
import { displayValue } from '../../shared/core/format/charts.js';
import { isDarkTheme } from '../../shared/ui/chart-colors.js';

  // Builds the source/use category breakdown for a single projection year,
  // for the cash-flow (Sankey-style) diagram. Any gap between what income
  // covers and what taxes+spending require is shown as either a draw from
  // savings ("From portfolio") or a surplus added to it ("To savings") —
  // this planner doesn't track which specific dollar funded which specific
  // expense, so the diagram pools all sources into a single "cash flow" hub
  // and fans back out to categories, rather than implying specific
  // source-to-expense pairings the underlying data can't support.
  // "Traditional withdrawal" and "Taxable/brokerage" are each the FULL
  // amount drawn from that tax-status bucket, folding in whatever came from
  // the same-status slice of the bond reserve (bondTraditional/bondTaxable)
  // — otherwise a year that drained the equity sub-account but still had
  // money sitting in the bond sub-account would make traditional/taxable
  // withdrawals look artificially small next to a vague "from portfolio"
  // catch-all. "From portfolio" now only covers Roth, cash, and home-equity
  // draws (plus any pooled equity/pension shortfall not itemized here).
  export function computeSankeyFlow(row) {
    const dark = isDarkTheme(),
      val = (n) => Math.max(0, displayValue(n || 0, row.year)),
      muted = dark ? '#898781' : '#898781';
    const sources = [
      { label: 'Wages', value: val(row.wages), color: sankeyHue('blue', dark) },
      { label: 'CPP + OAS', value: val(row.ss), color: sankeyHue('orange', dark) },
      { label: 'Pension', value: val(row.pension), color: sankeyHue('aqua', dark) },
      { label: 'Traditional withdrawal', value: val(row.traditionalWithdrawn), color: sankeyHue('yellow', dark) },
      { label: 'Taxable/brokerage', value: val(row.taxableWithdrawn), color: sankeyHue('magenta', dark) },
      { label: 'GIS / Allowance', value: val((row.benefitGis || 0) + (row.benefitAllowance || 0)), color: sankeyHue('green', dark) },
      { label: 'Child benefits', value: val((row.benefitCcb || 0) + (row.benefitProvChild || 0)), color: sankeyHue('green', dark) },
      { label: 'Credits and provincial seniors', value: val((row.benefitCgeb || 0) + (row.benefitProvCredit || 0) + (row.benefitProvSenior || 0)), color: sankeyHue('green', dark) },
    ].filter((s) => s.value > 1);
    const uses = [
      { label: 'Taxes', value: val(row.tax), color: sankeyHue('blue', dark) },
      { label: 'Housing', value: val(row.housing), color: sankeyHue('orange', dark) },
      { label: 'Healthcare', value: val(row.healthcare), color: sankeyHue('aqua', dark) },
      { label: 'Long-term care', value: val(row.ltc), color: sankeyHue('yellow', dark) },
      { label: 'Loan payments', value: val(row.loanPayment), color: sankeyHue('magenta', dark) },
      {
        label: 'Additional expenses',
        value: val((row.extraExpense || 0) + (row.lumpExpense || 0)),
        color: sankeyHue('violet', dark),
      },
      { label: 'Discretionary spending', value: val(row.baseSpend), color: sankeyHue('green', dark) },
    ].filter((u) => u.value > 1);
    const totalIn = sources.reduce((a, s) => a + s.value, 0),
      totalOut = uses.reduce((a, u) => a + u.value, 0);
    if (totalIn > totalOut + 1) uses.push({ label: 'To savings', value: totalIn - totalOut, color: muted, plug: true });
    else if (totalOut > totalIn + 1)
      sources.push({ label: 'From portfolio', value: totalOut - totalIn, color: muted, plug: true });
    return { sources, uses, total: Math.max(totalIn, totalOut) };
  }
