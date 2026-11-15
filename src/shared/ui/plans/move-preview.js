// Try: a held preview of one tested move, with Keep and Revert

import { cloneState } from '../../core/analysis/scenario-helpers.js';
import { assignState, state } from '../../core/store.js';
import { syncContributionControls } from '../inputs/sync-contribution-controls.js';
import { saveInputs } from './autosave.js';
import { scenarioSnapshot } from './market-scenario-snapshot.js';
import { assignMovePreview, movePreview } from './move-preview-snapshot.js';
import { dismissFirstRunBanner } from './saved-plan.js';
import { renderScenarioList } from './scenarios.js';
import { clearUndo, snapshotForUndo } from './undo.js';
import { normalizeState } from '#country/ui/seam-normalizeState';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  // Turns a move's preview on: keeps the real settings in the snapshot and shows the plan with the patch applied.
  // Returns false (and changes nothing) while a market scenario or another move is on.
  export function tryMove({ label, patch }) {
    if (scenarioSnapshot || movePreview) return false;
    assignMovePreview({ real: cloneState(state), label });
    assignState(normalizeState({ ...cloneState(state), ...cloneState(patch) }));
    clearUndo();
    syncControls();
    syncContributionControls();
    render();
    renderScenarioList();
    saveInputs();
    return true;
  }
  // Keeps the previewed change, with an undo back to the real settings. Returns false when no move is previewed.
  export function keepMove() {
    if (!movePreview) return false;
    const { real, label } = movePreview;
    assignMovePreview(null);
    // autosave writes nothing before the page is personalized, so a Keep on the example data would be lost without this
    dismissFirstRunBanner();
    snapshotForUndo(`Kept: ${label}`, real);
    render();
    renderScenarioList();
    saveInputs();
    return true;
  }
  // Puts the real settings back. Returns false when no move is previewed.
  export function revertMove() {
    if (!movePreview) return false;
    assignState(movePreview.real);
    assignMovePreview(null);
    clearUndo();
    syncControls();
    syncContributionControls();
    render();
    renderScenarioList();
    saveInputs();
    return true;
  }
  // The banner's sentence, or null when no move is previewed.
  export function previewText() {
    return movePreview
      ? `Previewing: ${movePreview.label}. Everything below shows the plan with this change: Keep saves it, Revert puts your plan back.`
      : null;
  }
  // Shown while a move is previewed.
  export function renderMovePreviewBanner() {
    const banner = document.getElementById('movePreviewBanner');
    const text = previewText();
    if (text === null) {
      banner.hidden = true;
      return;
    }
    document.getElementById('movePreviewText').textContent = text;
    banner.hidden = false;
  }
  export function wireMovePreviewBanner() {
    document.getElementById('movePreviewKeepBtn').addEventListener('click', () => keepMove());
    document.getElementById('movePreviewRevertBtn').addEventListener('click', () => revertMove());
  }
