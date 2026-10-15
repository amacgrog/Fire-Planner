  // Which top-level chart "view" a given chartView value belongs to — the
  // primary Projection/Historical/Monte Carlo toggle (item 9) groups the
  // three projection sub-views (3yr/1yr/cagr) under one button, and
  // lastProjectionView remembers which sub-view to restore when clicking
  // back into "Projection" from Historical/Monte Carlo.
  export const CHART_GROUPS = { '3yr': 'projection', '1yr': 'projection', cagr: 'projection', hist: 'hist', mc: 'mc' };
