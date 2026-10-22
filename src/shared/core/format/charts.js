// Chart formatting helpers: display values, x-axis labels, hues and chart groups

import { displayValueOf } from './display-value.js';
import { mode, state } from '../store.js';
import { chartXAxisMode, chartView } from '../chart-prefs.js';
import { CURRENT_YEAR } from '../projection/year-factors.js';

  export function displayValue(n, yearIndex) {
    return displayValueOf(mode, state.inflation, n, yearIndex);
  }
  // Converts an internal chart `age` (always Partner A's age — every row
  // from simulate()/simulateHistorical() carries one) to whatever the
  // person picked for the x-axis via chartXAxisMode. All three are a
  // simple affine transform of the same age value, so this is the only
  // place that needs to know about chartXAxisMode; x(age)/y(value) pixel
  // mapping and the mousemove age lookup stay entirely in Partner-A-age
  // space and are untouched by this setting.
  export function xAxisLabel(age) {
    if (chartXAxisMode === 'ageB' && !state.singlePerson)
      return Math.round(age - state.ageA + state.ageB);
    if (chartXAxisMode === 'year') return CURRENT_YEAR + Math.round(age - state.ageA);
    return Math.round(age);
  }
  export const cagrColors = [
    '#b91c1c',
    '#dc2626',
    '#ea580c',
    '#d97706',
    '#65a30d',
    '#16a34a',
    '#0d9488',
    '#0e7490',
  ];
  // Which top-level chart "view" a given chartView value belongs to — the
  // primary Projection/Historical/Monte Carlo toggle (item 9) groups the
  // three projection sub-views (3yr/1yr/cagr) under one button, and
  // lastProjectionView remembers which sub-view to restore when clicking
  // back into "Projection" from Historical/Monte Carlo.
  export const CHART_GROUPS = { '3yr': 'projection', '1yr': 'projection', cagr: 'projection', hist: 'hist', mc: 'mc' };
  export function chartHoverEnabled() {
    return ['3yr', '1yr', 'cagr', 'hist'].includes(chartView);
  }
  // Validated categorical palette (see the `dataviz` skill's palette.md) —
  // fixed hue order, never cycled/reassigned by rank. Reused across the two
  // columns (sources / uses) since they're spatially separated by the hub,
  // so only within-column neighbors need to stay visually distinct.
  const SANKEY_HUES = {
    blue: { light: '#2a78d6', dark: '#3987e5' },
    orange: { light: '#eb6834', dark: '#d95926' },
    aqua: { light: '#1baf7a', dark: '#199e70' },
    yellow: { light: '#eda100', dark: '#c98500' },
    magenta: { light: '#e87ba4', dark: '#d55181' },
    green: { light: '#008300', dark: '#008300' },
    violet: { light: '#7e57c2', dark: '#9575cd' },
  };
  export function sankeyHue(name, dark) {
    return SANKEY_HUES[name][dark ? 'dark' : 'light'];
  }
