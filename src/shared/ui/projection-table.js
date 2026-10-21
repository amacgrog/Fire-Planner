// Renders the year-by-year projection table

import { pct } from '../core/basics.js';
import { money } from '../core/money-format.js';
import { displayValue } from '../core/format/charts.js';
import { state } from '../core/store.js';

  export function renderTable(sim) {
    const years = [
      0,
      state.retireAgeA - state.ageA,
      !state.singlePerson ? state.retireAgeB - state.ageB : null,
      55 - state.ageA,
      62 - state.ageA,
      67 - state.ageA,
      75 - state.ageA,
      82 - state.ageA,
      90 - state.ageA,
      state.lifeExpectancyA - state.ageA,
    ]
      .filter(
        (v, i, a) =>
          Number.isFinite(v) && v >= 0 && v <= sim.rows.at(-1).year && a.indexOf(v) === i,
      )
      .sort((a, b) => a - b);
    document.getElementById('projectionRows').innerHTML = years
      .map((year) => {
        const r = sim.rows.find((x) => x.year === year);
        if (!r) return '';
        const vals = [
          'taxable',
          'bonds',
          'traditional',
          'roth',
          'cash',
          'homeEquity',
          'loanBalance',
          'total',
        ]
          .map((k) => `<td>${money(displayValue(r[k], r.year))}</td>`)
          .join('');
        let cls =
          r.investable <= 0
            ? 'fail'
            : r.investable < state.spending * Math.pow(1 + pct(state.inflation), r.year) * 3
              ? 'warn'
              : '';
        let status = state.singlePerson
          ? r.workingA
            ? 'Working'
            : r.investable <= 0
              ? 'Depleted'
              : 'Retired'
          : r.workingA && r.workingB
            ? 'Both working'
            : r.workingA
              ? 'A working'
              : r.workingB
                ? 'B working'
                : r.investable <= 0
                  ? 'Depleted'
                  : 'Retired';
        return `<tr><td><b>${r.age}</b></td>${state.singlePerson ? '' : `<td><b>${r.ageB}</b></td>`}<td><span class="table-status ${cls}">${status}</span></td>${vals}</tr>`;
      })
      .join('');
  }
