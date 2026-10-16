import { assignLogScale, logScale } from '../core/chart-prefs.js';
import { assignMode, assignState, mode } from '../core/store.js';
import { saveInputs } from './autosave.js';
import { setMode } from './chart-view-mode.js';
import { syncContributionControls } from './sync-contribution-controls.js';
import { undoToastBtnEl } from './topbar-and-undo.js';
import { hideUndoToast, undoSnapshot } from './undo.js';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  export function wireUndoButton() {
    if (undoToastBtnEl) {
      undoToastBtnEl.addEventListener('click', () => {
        if (!undoSnapshot) return;
        assignState(undoSnapshot.state);
        assignMode(undoSnapshot.mode);
        assignLogScale(undoSnapshot.logScale);
        document.getElementById('logScaleToggle').checked = logScale;
        syncControls();
        syncContributionControls();
        setMode(mode);
        render();
        saveInputs();
        hideUndoToast();
      });
    }
  }
