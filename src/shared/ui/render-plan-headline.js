// The plan headline sentence on the dashboard

import { compact } from '../core/format/numbers.js';
import { displayValue } from '../core/format/charts.js';
import { mode, state } from '../core/store.js';

  // The positive counterpart to renderShortfallBanner(): when the plan
  // doesn't deplete, says so plainly with the actual numbers (end age,
  // end assets) rather than leaving the top of the dashboard silent.
  // Mutually exclusive with the shortfall banner — exactly one of the two
  // is ever visible, since both key off the same selected.depletedAge.
  export function renderPlanHeadline(selected) {
    const banner = document.getElementById('planHeadlineBanner');
    if (selected.depletedAge) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    const endAge = Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB);
    const end = selected.rows.at(-1);
    const endValue = compact(displayValue(end.total, end.year));
    const retiring = state.singlePerson
      ? `retiring at ${state.retireAgeA}`
      : state.retireAgeA === state.retireAgeB
        ? `retiring at ${state.retireAgeA}`
        : `retiring at ${state.retireAgeA} / ${state.retireAgeB}`;
    banner.innerHTML = `<b>On track:</b> ${retiring}, the plan is projected to last through age ${endAge}+ with about ${endValue} remaining (in ${mode === 'real' ? "today's" : 'future'} dollars).`;
  }
