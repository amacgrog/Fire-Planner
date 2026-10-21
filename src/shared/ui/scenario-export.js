// Exports one scenario or all scenarios to a file

import { scenarios } from '../core/store.js';
import { SCENARIO_SCHEMA_VERSION } from './storage.js';

  function downloadJson(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  export function exportScenario(id) {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    downloadJson(
      `fire-planner-scenario-${(sc.name || 'scenario').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
      {
        firePlannerScenario: true,
        schemaVersion: SCENARIO_SCHEMA_VERSION,
        name: sc.name,
        savedAt: sc.savedAt,
        state: sc.state,
      },
    );
  }
  export function exportAllScenarios() {
    downloadJson('fire-planner-scenarios.json', {
      firePlannerScenarioList: true,
      schemaVersion: SCENARIO_SCHEMA_VERSION,
      scenarios: scenarios.map((sc) => ({ name: sc.name, savedAt: sc.savedAt, state: sc.state })),
    });
  }
