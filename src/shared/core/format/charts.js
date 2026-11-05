// Chart formatting helpers: display values, x-axis labels, hues and chart groups

import { displayValueOf } from './display-value.js';
import { mode, state } from '../store.js';
import { chartXAxisMode, chartView } from '../chart-prefs.js';
import { CURRENT_YEAR } from '../inputs/current-year.js';

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
  export const CHART_GROUPS = { '3yr': 'projection', '1yr': 'projection', cagr: 'projection', hist: 'hist', mc: 'mc', cashflow: 'cashflow' };
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
  // The cash-flow chart's fixed key -> color map (light, dark), checked with the dataviz validator:
  // lightness band, chroma floor, adjacent-pair CVD separation and normal-vision floor pass for the
  // money-in stack and the money-out set in both themes, validated as one 14-colour list (the out set uses
  // hues the in stack does not); shortfall is the only red, tax is rust. Spending is a deliberate neutral slate
  // (the validator's chroma floor flags it by design).
  // The light aqua, yellow and magenta fall under 3:1 on the surface, so every item is also named in
  // the legend and the tooltip, and the segments are separated by gaps.
  export const CASH_FLOW_COLORS = {
    income: { light: '#2a78d6', dark: '#3987e5' },
    lifetime: { light: '#eb6834', dark: '#d95926' },
    rmd: { light: '#1baf7a', dark: '#199e70' },
    traditional: { light: '#7e57c2', dark: '#9575cd' },
    roth: { light: '#008300', dark: '#008300' },
    taxable: { light: '#e87ba4', dark: '#d55181' },
    cash: { light: '#eda100', dark: '#c98500' },
    home: { light: '#0891b2', dark: '#1f9fc0' },
    shortfall: { light: '#dc2626', dark: '#e5484d' },
    tax: { light: '#a8541f', dark: '#c0652f' },
    spending: { light: '#5f6f86', dark: '#8497ad' },
    contributions: { light: '#8f9a00', dark: '#8a9420' },
    cashTopUp: { light: '#b0307a', dark: '#d0407f' },
    reinvested: { light: '#4a4fd0', dark: '#6a6fe0' },
  };
  // load-time: reads only CASH_FLOW_COLORS, a literal declared above in this file
  // The cash-flow diagram's group hues (light, dark): the bar chart's colors where the bar chart has the same thing (income,
  // lifetime income, tax, spending, contributions, shortfall), else a hue the group's column does not use. Items take their
  // group's hue in alternating shades, except the accounts, which keep their CASH_FLOW_COLORS (the two charts agree).
  export const SANKEY_GROUP_COLORS = {
    earned: CASH_FLOW_COLORS.income,
    other: { light: '#2b98ab', dark: '#3aa6b9' },
    retirement: CASH_FLOW_COLORS.lifetime,
    savings: { light: '#6b7280', dark: '#9ca3af' },
    shortfall: CASH_FLOW_COLORS.shortfall,
    taxes: CASH_FLOW_COLORS.tax,
    essentials: { light: '#7e57c2', dark: '#9575cd' },
    everyday: CASH_FLOW_COLORS.spending,
    extra: { light: '#d0457f', dark: '#d55181' },
    saved: CASH_FLOW_COLORS.contributions,
    hub: { light: '#8a8f98', dark: '#8a8f98' },
  };
