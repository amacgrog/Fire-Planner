// Wiring for the filing status buttons

import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { render } from '../results/render.js';
import { syncControls } from './sync-controls.js';

  function setFilingStatus(value) {
    state.filingStatus = value;
    syncControls();
    render();
    saveInputs();
  }
  export function wireFilingStatusButtons() {
    document.getElementById('mfjBtn').addEventListener('click', () => setFilingStatus('mfj'));
    document.getElementById('singleBtn').addEventListener('click', () => setFilingStatus('single'));
  }
