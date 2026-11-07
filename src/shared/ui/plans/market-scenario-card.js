// The market scenario card: its fields, settings storage and Run / Revert

import { describeMarketScenario } from '../../core/format/market-scenario-text.js';
import { CRASH_PRESETS, HIST_FIRST_YEAR, HIST_LAST_YEAR, cardSettingsToScenario, normalizeCardSettings, presetCrashShape } from '../../core/inputs/market-scenario-card.js';
import { normalizeMarketScenario } from '../../core/inputs/market-scenario.js';
import { CURRENT_YEAR } from '../../core/inputs/current-year.js';
import { state } from '../../core/store.js';
import { revertMarketScenario, runMarketScenario } from './market-scenario-mode.js';
import { scenarioSnapshot } from './market-scenario-snapshot.js';
import { storage, storageKey } from './storage.js';
import { render } from '#country/ui/seam-render';

  // The card's settings (null until wired). A separate UI preference, per country, saved only by a user edit.
  export let cardSettings = null;
  export function assignCardSettings(s, { save = true } = {}) {
    cardSettings = s;
    if (save) saveCardSettings();
  }
  function saveCardSettings() {
    try {
      storage?.setItem(storageKey + '.marketScenarioCard', JSON.stringify(cardSettings));
    } catch {
      // storage full or blocked: the settings stay for this page
    }
  }
  // Task 3 fills this in: the preview of the card's scenario. Every card edit ends here.
  function schedulePreview() {}

  const $ = (id) => document.getElementById(id);
  // number box id -> [group, key] in the settings
  const NUMS = {
    msCrashAge: ['crash', 'age'],
    msDrop: ['crash', 'drop'],
    msFallYears: ['crash', 'fallYears'],
    msRecover: ['crash', 'recoverPct'],
    msRecoverYears: ['crash', 'recoverYears'],
    msInflation: ['crash', 'inflation'],
    msBondReturn: ['crash', 'bondReturn'],
    msHistStart: ['history', 'startYear'],
    msHistAge: ['history', 'atAge'],
    msHistEnd: ['history', 'endAge'],
  };
  const SHAPE_KEYS = ['drop', 'fallYears', 'recoverPct', 'recoverYears'];
  const PRESET_BUTTONS = { msPreset1929: '1929', msPreset1973: '1973', msPreset2000: '2000', msPreset2008: '2008', msPreset2022: '2022', msPresetCustom: 'custom' };
  const clone = (s) => JSON.parse(JSON.stringify(s));

  // Sets a preset's two rates, and its stock shape when the box is ticked, on a settings copy.
  function applyPreset(c, id) {
    c.preset = id;
    const p = CRASH_PRESETS.find((x) => x.id === id);
    if (!p) return;
    c.inflation = p.inflation;
    c.bondReturn = p.bondReturn;
    if (c.presetShape) applyShape(c, p);
  }
  function applyShape(c, p) {
    const s = presetCrashShape(p, state.returnRate);
    c.drop = s.drop;
    c.fallYears = s.fallYears;
    c.recoverPct = s.recoverPct;
    c.recoverYears = s.recoverYears;
  }

  // One edit: the new settings are stored, the card repainted, the preview asked. Nothing renders and nothing but the card key saves.
  function edit(mutate) {
    const next = clone(cardSettings);
    mutate(next);
    assignCardSettings(next);
    renderMarketScenarioCardState();
    schedulePreview();
  }

  // Paints the card from the settings. Cheap; the render calls it. Does nothing until wired.
  export function renderMarketScenarioCardState() {
    if (cardSettings === null) return;
    // while a scenario runs the fields keep showing its settings; the clamp applies again after Revert
    if (scenarioSnapshot === null) {
      const norm = normalizeCardSettings(cardSettings, state);
      if (JSON.stringify(norm) !== JSON.stringify(cardSettings)) assignCardSettings(norm, { save: false });
    }
    const s = cardSettings,
      c = s.crash,
      h = s.history,
      on = scenarioSnapshot !== null,
      active = document.activeElement;
    const set = (id, v) => {
      const el = $(id);
      if (el === active) return;
      const t = v === null ? '' : String(v);
      if (el.value !== t) el.value = t;
    };
    for (const id of Object.keys(NUMS)) {
      const [g, k] = NUMS[id];
      set(id, s[g][k]);
    }
    $('msPresetShape').checked = c.presetShape;
    $('msCrashYear').textContent = `(${CURRENT_YEAR + (c.age - state.ageA)})`;
    $('msHistYear').textContent = `(${CURRENT_YEAR + (h.atAge - state.ageA)})`;
    $('msRecoverOut').textContent = `${c.recoverPct}% of the loss comes back`;
    $('msHistRange').textContent = `${HIST_FIRST_YEAR}–${HIST_LAST_YEAR}`;
    $('msCrashFields').hidden = s.kind !== 'crash';
    $('msHistoryFields').hidden = s.kind !== 'history';
    const mark = (id, isOn) => {
      const b = $(id);
      b.classList.toggle('active', isOn);
      b.setAttribute('aria-checked', String(isOn));
    };
    mark('msKindCrash', s.kind === 'crash');
    mark('msKindHistory', s.kind === 'history');
    mark('msOrderBucket', s.order === 'bucket');
    mark('msOrderStandard', s.order === 'standard');
    for (const id of Object.keys(PRESET_BUTTONS)) mark(id, c.preset === PRESET_BUTTONS[id]);
    // disabled while a scenario runs; the recovery years also at 0% (kept, not used)
    const card = $('marketScenarioCard');
    for (const el of card.querySelectorAll('input, .chart-view-toggle button')) el.disabled = on;
    $('msRecoverYears').disabled = on || c.recoverPct === 0;
    const ms = on && state.marketScenario ? state.marketScenario : normalizeMarketScenario(cardSettingsToScenario(s));
    const text = ms ? describeMarketScenario(ms, state, CURRENT_YEAR) : '';
    $('msDescription').textContent = text.charAt(0).toUpperCase() + text.slice(1);
    $('msRunBtn').textContent = on ? 'Revert' : 'Run this scenario';
    $('msRunningNote').hidden = !on;
    $('marketScenarioOnTag').hidden = !on;
  }

  function onInput(id) {
    const [g, k] = NUMS[id],
      raw = $(id).value.trim();
    let n;
    if (raw === '') {
      if (id !== 'msHistEnd') return;
      n = null;
    } else {
      n = Number(raw);
      if (!Number.isFinite(n)) return;
    }
    edit((next) => {
      next[g][k] = n;
      const c = next.crash;
      if (g === 'crash' && c.preset !== 'custom' && (k === 'inflation' || k === 'bondReturn' || (c.presetShape && SHAPE_KEYS.includes(k)))) c.preset = 'custom';
    });
  }
  // On change the clamped value is written back into the box, which is the first time the box is rewritten.
  function onChange(id) {
    const [g, k] = NUMS[id];
    assignCardSettings(normalizeCardSettings(cardSettings, state));
    const v = cardSettings[g][k];
    $(id).value = v === null ? '' : String(v);
    renderMarketScenarioCardState();
    schedulePreview();
  }

  export function wireMarketScenarioCard() {
    let parsed = null;
    try {
      const raw = storage?.getItem(storageKey + '.marketScenarioCard');
      if (raw) parsed = JSON.parse(raw);
    } catch {
      // unreadable settings: the defaults
    }
    assignCardSettings(normalizeCardSettings(parsed, state), { save: false });
    for (const id of Object.keys(NUMS)) {
      $(id).addEventListener('input', () => onInput(id));
      $(id).addEventListener('change', () => onChange(id));
    }
    $('msKindCrash').addEventListener('click', () => edit((n) => (n.kind = 'crash')));
    $('msKindHistory').addEventListener('click', () => edit((n) => (n.kind = 'history')));
    $('msOrderBucket').addEventListener('click', () => edit((n) => (n.order = 'bucket')));
    $('msOrderStandard').addEventListener('click', () => edit((n) => (n.order = 'standard')));
    for (const id of Object.keys(PRESET_BUTTONS)) $(id).addEventListener('click', () => edit((n) => applyPreset(n.crash, PRESET_BUTTONS[id])));
    $('msPresetShape').addEventListener('change', (e) =>
      edit((n) => {
        const c = n.crash;
        c.presetShape = e.target.checked;
        const p = CRASH_PRESETS.find((x) => x.id === c.preset);
        if (c.presetShape && p) applyShape(c, p);
      })
    );
    $('msRunBtn').addEventListener('click', () => {
      if (scenarioSnapshot) {
        revertMarketScenario();
      } else {
        // the plan may have changed since the card was set: run what the fields will show
        assignCardSettings(normalizeCardSettings(cardSettings, state), { save: false });
        runMarketScenario(cardSettingsToScenario(cardSettings));
      }
      renderMarketScenarioCardState();
    });
    // the preview is only computed while the card is open, so opening it needs its own trigger
    $('marketScenarioCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
  }
