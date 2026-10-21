// The undo snapshot and undo button

import { logScale, assignLogScale } from '../../core/chart-prefs.js';
import { mode, state, assignMode, assignState } from '../../core/store.js';
import { saveInputs } from './autosave.js';
import { setMode } from '../charts/chart-view-mode.js';
import { syncContributionControls } from '../inputs/sync-contribution-controls.js';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  let undoSnapshot = null;
  let undoToastTimer = null;
  export function snapshotForUndo(label) {
    undoSnapshot = {
      label,
      state: JSON.parse(JSON.stringify(state)),
      mode,
      logScale,
    };
    showUndoToast(label);
  }
  function showUndoToast(label) {
    const toast = document.getElementById('undoToast');
    const text = document.getElementById('undoToastText');
    if (!toast || !text) return;
    text.textContent = `${label}. `;
    toast.hidden = false;
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => hideUndoToast(), 10000);
  }
  function hideUndoToast() {
    const toast = document.getElementById('undoToast');
    if (toast) toast.hidden = true;
    clearTimeout(undoToastTimer);
    undoSnapshot = null;
  }
  // load-time: looks up a static element; reads nothing a statement writes.
  const undoToastBtnEl = document.getElementById('undoToastBtn');
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
