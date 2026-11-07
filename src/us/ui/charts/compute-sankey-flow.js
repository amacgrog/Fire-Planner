// Works out the cash-flow diagram's five columns for one year (display dollars, colors)

import { displayValue } from '../../../shared/core/format/charts.js';
import { sankeyModel } from '../../../shared/core/format/sankey-model.js';
import { isDarkTheme } from '../../../shared/ui/charts/chart-colors.js';
import { sankeyColumns } from '../../core/income/sankey-columns.js';
import { storeContext } from '../../core/projection/store-context.js';

  // The row's groups and items (sankeyColumns, raw nominal dollars, list items recomputed from the inputs) in display dollars:
  // the layoutSankey model `{ total, columns, links }`, or null when the year has under one display dollar.
  export function computeSankeyFlow(row) {
    const cols = sankeyColumns(storeContext({ withPlan: false }), row);
    return sankeyModel(cols, (n) => displayValue(n, row.year, row.cumFactor), isDarkTheme());
  }
