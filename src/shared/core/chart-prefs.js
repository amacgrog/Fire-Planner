// Chart display preferences shared by both planners, with assign functions

// Chart display preferences, shared by the chart code in both planners. Not part of `state` and never
// saved or exported with a scenario: everything here resets on reload. Readers import the binding (a
// live view); only this module assigns it, through the assign* functions. No DOM access.

export let chartView = '3yr';

// Display-only, like chartView/mode/logScale: which partner(s)
// move for the ±1yr/±3yr comparison chart. 'together' shifts both
// partners' dates by the same amount (today's original behavior);
// 'gap' shifts only one partner's date, narrowing or widening the gap
// between the two dates. Not part of state/scenario export, and reset
// to 'together' on reload — see chartShiftModeRow's visibility/
// disabled handling in render() for why.
export let chartShiftMode = 'together';

// Which partner moves in 'gap' mode: null means "auto" — track
// whichever partner currently retires earlier, same as this
// feature's original behavior. 'A' or 'B' means the person explicitly
// picked that partner via the Vary: Partner A/B buttons, which then
// sticks regardless of which partner is actually earlier — full
// manual control, not just auto-detection.
export let chartGapPartner = null;

// Display-only, like chartShiftMode above: which value the chart's
// x-axis is labeled/scrubbed in. All three are just an affine
// transform of the same underlying `age` (Partner A's age) every row
// already carries — 'ageB' = age - ageA + state.ageB, 'year' =
// CURRENT_YEAR + (age - ageA) — so this never changes how rows are
// generated or how the chart's internal x(age) pixel-mapping works,
// only how tick labels and the hover-tooltip header are formatted.
// Not part of state/scenario export, resets to 'ageA' on reload.
export let chartXAxisMode = 'ageA';

export let logScale = false;

// Display-only, like the above: whether the chart card is in its
// CSS-overlay "expanded" (fixed, full-viewport) presentation. Not
// part of state/scenario export, resets to false on reload/tab
// switch — see setChartExpanded() for the CSS class it toggles and
// the best-effort real-Fullscreen/landscape-lock attempt layered on
// top of it for capable mobile browsers.
export let chartExpanded = false;

// Display-only: whether #chartToolbar (the view/x-axis/shift/path
// rows) is collapsed out of the way. Independent of chartExpanded —
// see #chartToolbarToggleBtn's CSS for exactly when it's shown/has an
// effect. Reset to false whenever chartExpanded turns off (in
// setChartExpanded()) so a stale "collapsed" state can never carry
// into a context where the toggle button to undo it isn't visible.
export let chartToolbarCollapsed = false;

export let mcPathCount = 1000;
export let lastProjectionView = '3yr';

export function assignChartView(next) {
  chartView = next;
}
export function assignChartShiftMode(next) {
  chartShiftMode = next;
}
export function assignChartGapPartner(next) {
  chartGapPartner = next;
}
export function assignChartXAxisMode(next) {
  chartXAxisMode = next;
}
export function assignLogScale(next) {
  logScale = next;
}
export function assignChartExpanded(next) {
  chartExpanded = next;
}
export function assignChartToolbarCollapsed(next) {
  chartToolbarCollapsed = next;
}
export function assignMcPathCount(next) {
  mcPathCount = next;
}
export function assignLastProjectionView(next) {
  lastProjectionView = next;
}
