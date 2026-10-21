// Saved scenarios: wires the save, load, compare and import controls

import { escapeHtml } from '../../core/format/numbers.js';
import { cloneState } from '../../core/analysis/scenario-helpers.js';
import { assignScenarios, assignState, compareIds, scenarios, state } from '../../core/store.js';
import { saveInputs } from './autosave.js';
import { dismissFirstRunBanner } from './saved-plan.js';
import { renderScenarioComparison } from './scenario-comparison.js';
import { exportAllScenarios, exportScenario } from './scenario-export.js';
import { SCENARIO_SCHEMA_VERSION } from './storage.js';
import { syncContributionControls } from '../inputs/sync-contribution-controls.js';
import { snapshotForUndo } from './undo.js';
import { normalizeState } from '#country/ui/seam-normalizeState';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  function saveScenario() {
    const nameInput = document.getElementById('scenarioName'),
      name = (nameInput.value || '').trim() || `Scenario ${scenarios.length + 1}`;
    scenarios.push({
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      schemaVersion: SCENARIO_SCHEMA_VERSION,
      state: cloneState(state),
    });
    nameInput.value = '';
    renderScenarioList();
    renderScenarioComparison();
  }
  function loadScenario(id) {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    snapshotForUndo(`Loaded "${sc.name || 'scenario'}"`);
    assignState(normalizeState(sc.state));
    syncControls();
    syncContributionControls();
    render();
    saveInputs();
  }
  function deleteScenario(id) {
    assignScenarios(scenarios.filter((s) => s.id !== id));
    compareIds.delete(id);
    renderScenarioList();
    renderScenarioComparison();
  }
  function importScenarioFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const items = Array.isArray(parsed.scenarios) ? parsed.scenarios : [parsed];
        let added = 0;
        items.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const rawState = item.state && typeof item.state === 'object' ? item.state : item;
          scenarios.push({
            id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: item.name || 'Imported scenario',
            savedAt: item.savedAt || new Date().toISOString(),
            schemaVersion: SCENARIO_SCHEMA_VERSION,
            state: normalizeState(rawState),
          });
          added++;
        });
        if (!added) throw new Error('empty');
        renderScenarioList();
        renderScenarioComparison();
      } catch (err) {
        alert('Could not read that file as a scenario export (invalid or unrecognized JSON).');
      }
    };
    reader.readAsText(file);
  }
  function renderScenarioList() {
    const list = document.getElementById('scenarioList');
    document.getElementById('exportAllScenariosBtn').hidden = scenarios.length === 0;
    if (!scenarios.length) {
      list.innerHTML = '<p class="range-note">No saved scenarios yet.</p>';
      return;
    }
    list.innerHTML = scenarios
      .map(
        (sc) =>
          `<div style="display:flex;align-items:center;gap:6px;border-top:1px solid #edf1f5;padding:7px 0;font-size:.8rem"><label style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;cursor:pointer"><input type="checkbox" data-compare="${sc.id}" ${compareIds.has(sc.id) ? 'checked' : ''}><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(sc.name)}">${escapeHtml(sc.name)}</span></label><button type="button" class="btn-card" data-load="${sc.id}" style="padding:4px 8px">Load</button><button type="button" class="btn-card" data-export="${sc.id}" style="padding:4px 8px">Export</button><button type="button" class="btn-card" data-delete="${sc.id}" style="padding:4px 8px">Delete</button></div>`,
      )
      .join('');
    list.querySelectorAll('[data-compare]').forEach((el) =>
      el.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-compare');
        if (e.target.checked) compareIds.add(id);
        else compareIds.delete(id);
        renderScenarioComparison();
      }),
    );
    list
      .querySelectorAll('[data-load]')
      .forEach((el) =>
        el.addEventListener('click', (e) => loadScenario(e.target.getAttribute('data-load'))),
      );
    list
      .querySelectorAll('[data-export]')
      .forEach((el) =>
        el.addEventListener('click', (e) => exportScenario(e.target.getAttribute('data-export'))),
      );
    list.querySelectorAll('[data-delete]').forEach((el) =>
      el.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-delete'),
          target = scenarios.find((s) => s.id === id);
        if (
          confirm(
            `Delete scenario "${target ? target.name : 'this scenario'}"? This can't be undone (export it first if you want to keep it).`,
          )
        )
          deleteScenario(id);
      }),
    );
  }
  export function wireScenarios() {
    document.getElementById('saveScenarioBtn').addEventListener('click', saveScenario);
    document.getElementById('scenarioName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveScenario();
      }
    });
    document
      .getElementById('importScenarioBtn')
      .addEventListener('click', () => document.getElementById('importScenarioInput').click());
    document.getElementById('importScenarioInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) {
        importScenarioFile(f);
        dismissFirstRunBanner();
      }
      e.target.value = '';
    });
    document.getElementById('exportAllScenariosBtn').addEventListener('click', exportAllScenarios);
    renderScenarioList();
  }
