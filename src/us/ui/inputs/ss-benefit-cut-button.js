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
  // agree; while typing it is used as typed.
  function settleStartYear() {
    const v = ssBenefitCutYear(state.ssBenefitCutStartYear, defaults.ssBenefitCutStartYear);
    if (v === state.ssBenefitCutStartYear) return;
    state.ssBenefitCutStartYear = v;
    syncControls();
    render();
    saveInputs();
  }
  export function wireSsBenefitCutButton() {
    document.getElementById('ssTrusteesCutNote').textContent =
      `Sets a ${SS_TRUSTEES_CUT_PCT}% cut from ${SS_TRUSTEES_CUT_START_YEAR}, the ${SS_TRUSTEES_REPORT_YEAR} Trustees Report's projection`;
    document.getElementById('ssTrusteesCutBtn').addEventListener('click', useTrusteesProjection);
    document.getElementById('ssBenefitCutStartYear').addEventListener('change', settleStartYear);
  }
