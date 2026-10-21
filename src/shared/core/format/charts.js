import { pct } from '../basics.js';
import { mode, state } from '../store.js';
import { chartXAxisMode } from '../chart-prefs.js';
import { CURRENT_YEAR } from '../projection/year-factors.js';

  export function displayValue(n, yearIndex) {
    return mode === 'real' ? n / Math.pow(1 + pct(state.inflation), yearIndex) : n;
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
