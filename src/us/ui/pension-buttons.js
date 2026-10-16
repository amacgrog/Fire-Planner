import { state } from '../../shared/core/store.js';
import { saveInputs } from '../../shared/ui/autosave.js';
import { render } from './render.js';
import { syncControls } from './sync-controls.js';

  function setPensionCoverage(value) {
    state.pensionCoverage = value;
    syncControls();
    render();
    saveInputs();
  }
  export function wirePensionButtons() {
    document
      .getElementById('pensionNoneBtn')
      .addEventListener('click', () => setPensionCoverage('none'));
    document.getElementById('pensionABtn').addEventListener('click', () => setPensionCoverage('a'));
    document.getElementById('pensionBBtn').addEventListener('click', () => setPensionCoverage('b'));
    document
      .getElementById('pensionBothBtn')
      .addEventListener('click', () => setPensionCoverage('both'));
  }
