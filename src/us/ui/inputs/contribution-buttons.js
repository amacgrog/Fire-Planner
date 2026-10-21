// Wiring for the contribution type buttons (401(k) and IRA)

import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { render } from '../results/render.js';
import { syncControls } from './sync-controls.js';

  function setContributionType(key, value) {
    state[key] = value;
    syncControls();
    render();
    saveInputs();
  }
  export function wireContributionButtons() {
    for (const [id, key, value] of [['incomeKindAWagesBtn', 'incomeKindA', 'wages'], ['incomeKindASelfBtn', 'incomeKindA', 'self'], ['incomeKindBWagesBtn', 'incomeKindB', 'wages'], ['incomeKindBSelfBtn', 'incomeKindB', 'self']])
      document.getElementById(id).addEventListener('click', () => setContributionType(key, value));
    document
      .getElementById('k401TraditionalBtn')
      .addEventListener('click', () => setContributionType('k401Type', 'traditional'));
    document
      .getElementById('k401RothBtn')
      .addEventListener('click', () => setContributionType('k401Type', 'roth'));
    document
      .getElementById('iraTraditionalBtn')
      .addEventListener('click', () => setContributionType('iraType', 'traditional'));
    document
      .getElementById('iraRothBtn')
      .addEventListener('click', () => setContributionType('iraType', 'roth'));
  }
