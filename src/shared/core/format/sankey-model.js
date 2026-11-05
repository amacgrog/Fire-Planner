// The cash-flow diagram's five-column model: one year's groups in display dollars, with colors, tooltip lines and links

import { CASH_FLOW_COLORS, SANKEY_GROUP_COLORS } from './charts.js';
import { money } from './numbers.js';

  // Items whose own account or flow the bar chart colors: the same color here.
  const ACCOUNT_COLOR = {
    rmd: 'rmd', traditional: 'traditional', roth: 'roth', taxable: 'taxable', cash: 'cash', home: 'home', shortfall: 'shortfall',
    intoCash: 'cashTopUp', intoBrokerage: 'reinvested', intoNonRegistered: 'reinvested', intoBonds: 'reinvested',
  };
  // load-time: a Set of string literals; reads nothing
  // Savings items in the bar chart's contributions color.
  const SAVED_INTO = new Set(['intoTrad', 'intoTradEmployer', 'intoRoth', 'intoRrsp', 'intoRrspEmployer', 'intoTfsa', 'intoFhsa']);
  const SHADES = [0, 0.18, 0.32];
  // Mixes a #rrggbb color toward black (light theme) or white (dark theme) by t, so a shade keeps its contrast on the card.
  function shade(hex, t, dark) {
    if (t === 0) return hex;
    const to = dark ? 255 : 0;
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return '#' + c.map((v) => Math.round(v + (to - v) * t).toString(16).padStart(2, '0')).join('');
  }

  // `cols` is a country's sankeyColumns result (raw dollars); `dv` converts a raw value to display dollars; `notes` adds tooltip
  // lines to a group by key. Items under one display dollar are dropped and their group and the hub shrink by them, so every
  // node's value is the sum of its links. Node ids: `in:<item>`, `g:<group>`, `hub`, `out:<item>` (an item key a column has
  // already used gets its group key too: `in:<group>:<item>`). Null when the total is under one display dollar.
  export function sankeyModel(cols, dv, dark, notes = {}) {
    const theme = dark ? 'dark' : 'light';
    const columns = [[], [], [], [], []];
    const links = [];
    const side = (groups, prefix, itemCol, groupCol, toHub) => {
      const used = new Set();
      let sum = 0;
      for (const g of groups) {
        const items = [];
        for (const it of g.items) {
          const value = dv(it.value);
          if (value >= 1) items.push({ it, value });
        }
        if (items.length === 0) continue;
        let gv = 0;
        for (const x of items) gv += x.value;
        const hue = (SANKEY_GROUP_COLORS[g.key] || SANKEY_GROUP_COLORS.hub)[theme];
        const gid = 'g:' + g.key;
        const groupNode = {
          id: gid, label: g.label, value: gv, color: hue, group: g.key,
          items: items.map((x) => ({ label: x.it.label, value: x.value })),
          lines: notes[g.key] || [],
        };
        let shadeAt = 0;
        for (const { it, value } of items) {
          let id = prefix + it.key;
          if (used.has(id)) id = prefix + g.key + ':' + it.key;
          used.add(id);
          const account = ACCOUNT_COLOR[it.key] || (SAVED_INTO.has(it.key) ? 'contributions' : null);
          const color = account ? CASH_FLOW_COLORS[account][theme] : shade(hue, SHADES[shadeAt++ % SHADES.length], dark);
          const lines = [];
          if (typeof it.sub === 'string' && it.sub !== '') lines.push(it.sub);
          if (it.recovery >= 1) {
            lines.push('Gross OAS ' + money(dv(it.gross)));
            lines.push('OAS recovery tax ' + money(dv(it.recovery)));
          }
          columns[itemCol].push({ id, label: it.label, value, color, group: g.key, lines });
          links.push(toHub ? { from: id, to: gid, value } : { from: gid, to: id, value });
        }
        columns[groupCol].push(groupNode);
        links.push(toHub ? { from: gid, to: 'hub', value: gv } : { from: 'hub', to: gid, value: gv });
        sum += gv;
      }
      return sum;
    };
    const total = side(cols.in, 'in:', 0, 1, true);
    side(cols.out, 'out:', 4, 3, false);
    if (!(total >= 1)) return null;
    columns[2].push({
      id: 'hub', label: 'Total', value: total, color: SANKEY_GROUP_COLORS.hub[theme], group: 'hub',
      items: columns[1].map((g) => ({ label: g.label, value: g.value })), lines: [],
    });
    return { total, columns, links };
  }
