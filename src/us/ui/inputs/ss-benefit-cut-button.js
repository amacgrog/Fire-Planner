// Wiring for the Social Security benefit cut: the Trustees' projection / remove button and the start year's clamp (feedback B2)

import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { dismissFirstRunBanner } from '../../../shared/ui/plans/saved-plan.js';
import { snapshotForUndo } from '../../../shared/ui/plans/undo.js';
import { SS_TRUSTEES_CUT_PCT, SS_TRUSTEES_CUT_START_YEAR, ssBenefitCutYear } from '../../core/inputs/ss-benefit-cut.js';
import { defaults } from '../../core/inputs/defaults.js';
import { render } from '../results/render.js';
import { syncControls } from './sync-controls.js';

  // One button, two jobs: with no cut it sets the Trustees' 22% from 2033; with any cut on (from it, typed, loaded or MCP) it
  // sets the percent back to 0 and leaves the start year (which does nothing at 0). syncControls draws its label and note.
  // Each click takes an undo entry first; a click is neither `input` nor `change`, so it dismisses the first-run banner
  // itself, or the example data's autosave would drop it.
  function toggleTrusteesCut() {
    const removing = state.ssBenefitCutPct > 0;
    snapshotForUndo(removing ? 'Removed the benefit cut' : "Applied the Trustees' benefit cut");
    if (removing) {
      state.ssBenefitCutPct = 0;
    } else {
      state.ssBenefitCutPct = SS_TRUSTEES_CUT_PCT;
      state.ssBenefitCutStartYear = SS_TRUSTEES_CUT_START_YEAR;
    }
    dismissFirstRunBanner();
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
    document.getElementById('ssTrusteesCutBtn').addEventListener('click', toggleTrusteesCut);
    document.getElementById('ssBenefitCutStartYear').addEventListener('change', settleStartYear, true);
  }
