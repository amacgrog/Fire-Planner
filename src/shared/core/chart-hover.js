import { chartView } from './chart-prefs.js';

  export function chartHoverEnabled() {
    return ['3yr', '1yr', 'cagr', 'hist'].includes(chartView);
  }
