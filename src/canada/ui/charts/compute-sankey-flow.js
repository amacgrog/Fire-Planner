// Works out the cash-flow diagram's five columns for one year (display dollars, colors)

import { displayValue } from '../../../shared/core/format/charts.js';
import { money } from '../../../shared/core/format/numbers.js';
import { sankeyModel } from '../../../shared/core/format/sankey-model.js';
import { isDarkTheme } from '../../../shared/ui/charts/chart-colors.js';
import { sankeyColumns } from '../../core/income/sankey-columns.js';
import { storeContext } from '../../core/projection/store-context.js';

  // The row's groups and items (sankeyColumns, raw nominal dollars, list items recomputed from the inputs) in display dollars:
  // the layoutSankey model `{ total, columns, links }`, or null when the year has under one display dollar. The OAS recovery
  // tax is named on the Retirement income group whenever there is one: a fully recovered OAS draws no band.
  export function computeSankeyFlow(row) {
    const cols = sankeyColumns(storeContext(), row),
      dv = (n) => displayValue(n, row.year),
      notes = row.oasClawback >= 1 ? { retirement: ['OAS recovery tax ' + money(dv(row.oasClawback))] } : {};
    return sankeyModel(cols, dv, isDarkTheme(), notes);
  }
