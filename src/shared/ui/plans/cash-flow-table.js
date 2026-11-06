// The printed report's year-by-year cash-flow table and lifetime taxes, from the cash-flow chart's parts

import { cashFlowParts } from '../../core/format/cash-flow-parts.js';
import { displayValue } from '../../core/format/charts.js';
import { escapeHtml, money } from '../../core/format/numbers.js';
import { state } from '../../core/store.js';
import { CASH_FLOW_LABELS } from '#country/ui/seam-CASH_FLOW_LABELS';

  // Money in by source, money out by use, then the conversion (moved between accounts, on neither side), in the dollar view on
  // screen. A part under $1 in every row is left out; Taxes and Spending always show. Each money cell carries its unrounded
  // value (data-value) and side (data-side), so a reader can check that in equals out without the rounding of money().
  export function cashFlowTableHtml(rows) {
    if (!rows.length) return '';
    const parts = rows.map((r, i) => cashFlowParts(r, i ? rows[i - 1].investable : null)),
      dv = (n, i) => displayValue(n, rows[i].year),
      sepp = rows.some((r) => (r.sepp72 ?? 0) >= 1),
      label = (key) => (key === 'rmd' && sepp && CASH_FLOW_LABELS.rmdWithSepp) || CASH_FLOW_LABELS[key] || key,
      used = (side, key) => key === 'tax' || key === 'spending' || parts.some((p, i) => Math.abs(dv(p[side].find((x) => x.key === key).value, i)) >= 1),
      cols = [
        ...parts[0].in.filter((p) => used('in', p.key)).map((p) => ({ side: 'in', key: p.key })),
        ...parts[0].out.filter((p) => used('out', p.key)).map((p) => ({ side: 'out', key: p.key })),
      ];
    const conv = parts.some((p, i) => Math.abs(dv(p.conversion, i)) >= 1);
    const inCount = cols.filter((c) => c.side === 'in').length,
      outCount = cols.length - inCount;
    const head =
      `<tr><th></th>${inCount ? `<th colspan="${inCount}">Money in</th>` : ''}<th colspan="${outCount}">Money out</th>${conv ? '<th></th>' : ''}</tr>` +
      `<tr><th>Age${state.singlePerson ? '' : ' (A / B)'}</th>${cols.map((c) => `<th>${escapeHtml(label(c.key))}</th>`).join('')}` +
      `${conv ? `<th>${escapeHtml(label('conversion'))}</th>` : ''}</tr>`;
    const cell = (value, side) => `<td data-side="${side}" data-value="${value}">${money(Math.abs(value) < 0.5 ? 0 : value)}</td>`;
    const body = rows
      .map((r, i) => {
        const p = parts[i];
        return (
          `<tr><td>${r.age}${state.singlePerson ? '' : ` / ${r.ageB}`}</td>` +
          cols.map((c) => cell(dv(p[c.side].find((x) => x.key === c.key).value, i), c.side)).join('') +
          (conv ? cell(dv(p.conversion, i), 'conversion') : '') +
          '</tr>'
        );
      })
      .join('');
    return `<table class="pr-proj pr-flow"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }
  // The sum of every year's taxes (the row's tax) in the dollar view on screen.
  export function lifetimeTaxes(rows) {
    return rows.reduce((sum, r) => sum + displayValue(r.tax, r.year), 0);
  }
