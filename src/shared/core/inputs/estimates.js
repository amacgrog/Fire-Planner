// Unusual-assumption ranges and the estimate-countable rules for field badges

import { decisionDeltaPhrase } from '../analysis/decisions.js';
import { simulate } from '../projection/simulate.js';
import { state } from '../store.js';
import { ESTIMATE_ALWAYS_IDS } from '#country/core/seam-ESTIMATE_ALWAYS_IDS';
import { ESTIMATE_GATED_GROUPS } from '#country/core/seam-ESTIMATE_GATED_GROUPS';

  export function isEstimateCountable(id) {
    if (ESTIMATE_ALWAYS_IDS.includes(id)) return true;
    const group = ESTIMATE_GATED_GROUPS.find((g) => g.ids.includes(id));
    return !!group && group.gate();
  }
  // Quantifies the impact of one flagged assumption by comparing the
  // current simulation against the same simulation with just that one
  // field nudged back to the nearer edge of its realistic range — the same
  // mutate/simulate/restore idiom SENSITIVITY_LEVERS uses, reusing the
  // "Explore a question" comparison helpers (decisionDeltaPhrase already
  // handles the depleted-portfolio/depletion-age wording) rather than
  // inventing a second delta phrasing.
  export function unusualAssumptionImpact(item, currentSim) {
    const saved = state[item.id];
    state[item.id] = saved < item.min ? item.min : item.max;
    const typicalSim = simulate();
    state[item.id] = saved;
    return decisionDeltaPhrase(currentSim, typicalSim);
  }
  // "Surface unusual/important assumptions" — a second, independent layer
  // on top of the "still estimated" badges above. That feature flags a
  // personal fact still at its meaningless placeholder default; this one
  // flags a *modeling assumption* whose current value (default or not,
  // deliberately typed or not) sits outside a realistic real-world range —
  // e.g. a 15% investment return or a 0% inflation rate, both of which are
  // allowed by the field's own wide HTML min/max (so the browser won't stop
  // you) but aren't a sane planning assumption. Reuses exactly the same
  // fields the estimated-fields spec already classified as "Assumption,
  // never counted" (lifeExpectancyA/B, incomeGrowth, inflation, bondYears,
  // returnRate, bondReturn, hysaRate, homeGrowth, propertyTaxGrowth,
  // homeInsuranceGrowth, rentGrowth) plus mortgageRate, which that spec
  // didn't need to classify. Deliberately excludes ages/retirement ages —
  // this is a FIRE app, so a 35-year-old retirement age is the expected
  // case for a real slice of users, not something to nag about.
  export const UNUSUAL_RANGES = [
    { id: 'returnRate', label: 'Investment return', unit: '%', min: 3, max: 11 },
    { id: 'bondReturn', label: 'Bond return', unit: '%', min: 0, max: 6 },
    { id: 'hysaRate', label: 'HYSA interest rate', unit: '%', min: 0, max: 6 },
    { id: 'inflation', label: 'Inflation', unit: '%', min: 1, max: 5 },
    { id: 'incomeGrowth', label: 'Income growth', unit: '%', min: 0, max: 6 },
    { id: 'homeGrowth', label: 'Home appreciation', unit: '%', min: 0, max: 6 },
    {
      id: 'mortgageRate',
      label: 'Mortgage interest rate',
      unit: '%',
      min: 2.5,
      max: 9,
      applicable: () => state.tenure !== 'rent',
    },
    {
      id: 'propertyTaxGrowth',
      label: 'Property tax growth',
      unit: '%',
      min: 0,
      max: 6,
      applicable: () => state.tenure !== 'rent',
    },
    {
      id: 'homeInsuranceGrowth',
      label: 'Home insurance growth',
      unit: '%',
      min: 0,
      max: 8,
      applicable: () => state.tenure !== 'rent',
    },
    {
      id: 'rentGrowth',
      label: 'Rent growth',
      unit: '%',
      min: 0,
      max: 6,
      applicable: () => state.tenure !== 'own',
    },
    { id: 'bondYears', label: 'Bond reserve size', unit: ' yrs', min: 0, max: 8 },
    { id: 'lifeExpectancyA', label: 'Partner A life expectancy', unit: '', min: 75, max: 100 },
    {
      id: 'lifeExpectancyB',
      label: 'Partner B life expectancy',
      unit: '',
      min: 75,
      max: 100,
      applicable: () => !state.singlePerson,
    },
  ];
  // Returns the currently-flagged, not-yet-dismissed items. A dismissal is
  // cleared automatically the moment a field's value moves back inside its
  // realistic range — not on every edit the way dismissedEstimates is —
  // so nudging an already-dismissed unusual value to a *different* unusual
  // value never re-surfaces the flag; only actually fixing it (and then
  // pushing it out of range again some other time) does. This is a
  // deliberate, explicit design choice from user feedback, not an oversight
  // matching the estimated-fields auto-undismiss-on-any-edit behavior.
  export function computeUnusualAssumptions() {
    return UNUSUAL_RANGES.filter((r) => {
      if (r.applicable && !r.applicable()) return false;
      // A condition-based item (a planner adds one with `check` and `message` instead of a range): flagged while
      // `check()` is true, dismissal cleared as soon as it is not, like a value that returns to its range.
      const v = r.check ? (r.check() ? 1 : NaN) : Number(state[r.id]);
      if (r.check && !Number.isFinite(v)) {
        const at = state.dismissedUnusualAssumptions.indexOf(r.id);
        if (at !== -1) state.dismissedUnusualAssumptions.splice(at, 1);
        return false;
      }
      if (!Number.isFinite(v)) return false;
      const out = r.check ? true : v < r.min || v > r.max;
      if (!out) {
        const idx = state.dismissedUnusualAssumptions.indexOf(r.id);
        if (idx !== -1) state.dismissedUnusualAssumptions.splice(idx, 1);
        return false;
      }
      return !state.dismissedUnusualAssumptions.includes(r.id);
    });
  }
