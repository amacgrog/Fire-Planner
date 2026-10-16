import { simulate } from '../core/monte-carlo-paths-2.js';
import { state } from '../core/store.js';
import { buildPrintReport } from '#country/ui/seam-buildPrintReport';

  function exportCsv() {
    const sim = simulate(),
      columns = [
        ['yearIndex', 'Year index'],
        ['age', 'Partner A age'],
        ['ageB', 'Partner B age'],
        ['working', 'Any partner working'],
        ['workingA', 'Partner A working'],
        ['workingB', 'Partner B working'],
        ['taxable', 'Taxable brokerage'],
        ['bonds', 'Bonds'],
        ['traditional', 'Traditional retirement'],
        ['roth', 'Roth retirement'],
        ['cash', 'Cash / HYSA'],
        ['homeEquity', 'Home equity'],
        ['loanBalance', 'Loan balances'],
        ['investable', 'Investable assets'],
        ['total', 'Net assets'],
      ],
      csv = [columns.map(([, label]) => label).join(',')]
        .concat(
          sim.rows.map((row) =>
            columns
              .map(([key]) => {
                const value = key === 'ageB' && state.singlePerson ? '' : row[key];
                return typeof value === 'string' ? `"${value.replaceAll('"', '""')}"` : value;
              })
              .join(','),
          ),
        )
        .join('\n'),
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'fire-planner-annual-projection.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  export function wireExportButtons() {
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
    document.getElementById('printReportBtn').addEventListener('click', () => {
      buildPrintReport();
      window.print();
    });
  }
