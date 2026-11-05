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
    for (const p of ['A', 'B'])
      for (const [base, key] of [['k401', 'k401Type'], ['ira', 'iraType']]) {
        document.getElementById(base + 'TraditionalBtn' + p).addEventListener('click', () => setContributionType(key + p, 'traditional'));
        document.getElementById(base + 'RothBtn' + p).addEventListener('click', () => setContributionType(key + p, 'roth'));
      }
  }
