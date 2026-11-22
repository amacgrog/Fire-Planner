// Wiring for the federal tax-rate what-if: the preset / remove button and the start year's clamp (feedback C2)

import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { dismissFirstRunBanner } from '../../../shared/ui/plans/saved-plan.js';
import { snapshotForUndo } from '../../../shared/ui/plans/undo.js';
import { FED_RATE_PRESET_PCT, FED_RATE_PRESET_YEAR, fedRateYear } from '../../core/inputs/fed-rate-change.js';
import { defaults } from '../../core/inputs/defaults.js';
import { render } from '../results/render.js';
import { syncControls } from './sync-controls.js';

  // B2's toggle: with no change it sets the preset's percent and year (the gains box is left as it is); with any change on (from
  // it, typed, loaded or MCP; negative too) it sets the percent back to 0 and leaves the year. syncControls draws its label and
  // note. Each click takes an undo entry first and dismisses the first-run banner itself (a click is neither `input` nor `change`).
  function toggleRatePreset() {
    const removing = state.fedRateChangePct !== 0;
    snapshotForUndo(removing ? 'Removed the federal rate change' : 'Applied the federal rate rise');
    if (removing) {
      state.fedRateChangePct = 0;
    } else {
      state.fedRateChangePct = FED_RATE_PRESET_PCT;
      state.fedRateChangeYear = FED_RATE_PRESET_YEAR;
    }
    dismissFirstRunBanner();
    syncControls();
    render();
    saveInputs();
  }
  // The start year is rounded up and kept in range once the box is left (normalizeState's rule); a blank box is the default.
  // A capture listener, so it runs before the field listener's `change`, whose flushRender then draws the settled year once.
  function settleStartYear(e) {
    const v = e.target.value.trim() === '' ? defaults.fedRateChangeYear : fedRateYear(state.fedRateChangeYear, defaults.fedRateChangeYear);
    if (v === state.fedRateChangeYear && e.target.value === String(v)) return;
    state.fedRateChangeYear = v;
    syncControls();
    saveInputs();
  }
  export function wireFedRateChangeButton() {
    document.getElementById('fedRateChangeBtn').addEventListener('click', toggleRatePreset);
    document.getElementById('fedRateChangeYear').addEventListener('change', settleStartYear, true);
  }
