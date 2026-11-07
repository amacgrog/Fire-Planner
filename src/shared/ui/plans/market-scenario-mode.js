// Market scenario mode: Run and Revert

import { cloneState } from '../../core/analysis/scenario-helpers.js';
import { normalizeMarketScenario } from '../../core/inputs/market-scenario.js';
import { assignState, state } from '../../core/store.js';
import { syncContributionControls } from '../inputs/sync-contribution-controls.js';
import { saveInputs } from './autosave.js';
import { assignScenarioSnapshot, scenarioSnapshot } from './market-scenario-snapshot.js';
import { renderScenarioList } from './scenarios.js';
import { clearUndo } from './undo.js';
import { normalizeState } from '#country/ui/seam-normalizeState';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  // Turns a market scenario on: keeps the real settings in the snapshot and runs the scenario on a copy.
  // Returns false (and changes nothing) for an invalid scenario or when one is already on.
  export function runMarketScenario(raw) {
    const ms = normalizeMarketScenario(raw);
    if (!ms || scenarioSnapshot) return false;
    const real = cloneState(state);
    delete real.marketScenario;
    assignScenarioSnapshot(real);
    assignState(normalizeState({ ...cloneState(state), marketScenario: ms }));
    clearUndo();
    render();
    renderScenarioList();
    saveInputs();
    return true;
  }
  // Turns it off: the real settings come back from the snapshot. Returns false when no scenario is on.
  export function revertMarketScenario() {
    if (!scenarioSnapshot) return false;
    assignState(scenarioSnapshot);
    assignScenarioSnapshot(null);
    clearUndo();
    syncControls();
    syncContributionControls();
    render();
    renderScenarioList();
    saveInputs();
    return true;
  }
