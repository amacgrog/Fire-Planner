// Wires the export and print buttons

import { displayValue } from '../../core/format/charts.js';
import { mode } from '../../core/store.js';
import { flushRender } from '../results/render-scheduler.js';
import { buildPrintReport } from '#country/ui/seam-buildPrintReport';
import { csvColumns } from '#country/ui/seam-csvColumns';

  // One row per projection year; money in the dollar view on screen (today's or future dollars, named in the file name),
  // to the cent.
  function exportCsv() {
    flushRender();
    const { rows, columns, fileStem } = csvColumns(),
      cell = (col, row, i) => {
        const value = col.value(row, i);
        if (value === '' || value === null || value === undefined) return '';
        if (typeof value === 'string') return `"${value.replaceAll('"', '""')}"`;
        return col.money && typeof value === 'number' ? Math.round(displayValue(value, row.year, row.cumFactor) * 100) / 100 : value;
      },
      csv = [columns.map((col) => `"${col.label.replaceAll('"', '""')}"`).join(',')]
        .concat(rows.map((row, i) => columns.map((col) => cell(col, row, i)).join(',')))
        .join('\n'),
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `${fileStem}-${mode === 'real' ? 'todays' : 'future'}-dollars.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  export function wireExportButtons() {
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
    document.getElementById('printReportBtn').addEventListener('click', () => {
      flushRender();
      buildPrintReport();
      window.print();
    });
  }
