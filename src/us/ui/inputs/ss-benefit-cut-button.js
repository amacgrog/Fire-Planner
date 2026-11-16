// Wiring for the Social Security benefit cut: the Trustees' projection button and the start year's clamp (feedback B2)

import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { SS_TRUSTEES_CUT_PCT, SS_TRUSTEES_CUT_START_YEAR, SS_TRUSTEES_REPORT_YEAR, ssBenefitCutYear } from '../../core/inputs/ss-benefit-cut.js';
import { defaults } from '../../core/inputs/defaults.js';
import { render } from '../results/render.js';
import { syncControls } from './sync-controls.js';

  function useTrusteesProjection() {
    state.ssBenefitCutPct = SS_TRUSTEES_CUT_PCT;
    state.ssBenefitCutStartYear = SS_TRUSTEES_CUT_START_YEAR;
    syncControls();
    render();
    saveInputs();
  }
  // The start year is rounded up and kept in range once the box is left (normalizeState's rule), so the live run and a reload
  // agree; while typing it is used as typed. A blank box (which the input listener wrote as 0) is the default. A capture
  // listener, so it runs before the field listener's `change`, whose flushRender then draws the settled year once.
  function settleStartYear(e) {
    const v = e.target.value.trim() === '' ? defaults.ssBenefitCutStartYear : ssBenefitCutYear(state.ssBenefitCutStartYear, defaults.ssBenefitCutStartYear);
    if (v === state.ssBenefitCutStartYear && e.target.value === String(v)) return;
    state.ssBenefitCutStartYear = v;
    syncControls();
    saveInputs();
  }
  export function wireSsBenefitCutButton() {
    document.getElementById('ssTrusteesCutNote').textContent =
      `Sets a ${SS_TRUSTEES_CUT_PCT}% cut from ${SS_TRUSTEES_CUT_START_YEAR}, the ${SS_TRUSTEES_REPORT_YEAR} Trustees Report's projection`;
    document.getElementById('ssTrusteesCutBtn').addEventListener('click', useTrusteesProjection);
    document.getElementById('ssBenefitCutStartYear').addEventListener('change', settleStartYear, true);
  }
