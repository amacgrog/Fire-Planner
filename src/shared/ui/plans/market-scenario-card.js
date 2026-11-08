// The market scenario card: its fields, settings storage and Run / Revert

import { crashRowSummary, secondLegNote } from '../../core/format/market-scenario-card-text.js';
import { describeMarketScenario } from '../../core/format/market-scenario-text.js';
import { CRASH_PRESETS, HIST_FIRST_YEAR, HIST_LAST_YEAR, cardCrashCount, cardSettingsToScenario, crashLegs, newCrashRow, normalizeCardSettings, presetCrashShape } from '../../core/inputs/market-scenario-card.js';
import { MAX_CRASHES, normalizeMarketScenario } from '../../core/inputs/market-scenario.js';
import { CURRENT_YEAR } from '../../core/inputs/current-year.js';
import { state } from '../../core/store.js';
import { revertMarketScenario, runMarketScenario } from './market-scenario-mode.js';
import { scenarioSnapshot } from './market-scenario-snapshot.js';
import { storage, storageKey } from './storage.js';
import { renderMarketScenarioPreview, wireMarketScenarioPreview } from '../results/market-scenario-preview.js';
import { render } from '#country/ui/seam-render';

  // The open crash row (an index into the settings' rows), never saved: the first row opens on load. The one field editor sits under it.
  let openCrash = 0;
  let editorEl = null;
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
  // Every card edit ends here: the preview redraws 250 ms after the last edit (only while the card is open).
  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if ($('marketScenarioCard').open && cardSettings) renderMarketScenarioPreview(cardSettings);
    }, 250);
  }

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
  // the crash boxes edit the open crash row
  const grp = (s, g) => (g === 'crash' ? s.crashes[openCrash] : s[g]);
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
    // (a number box with focus is mid-typing: its value is clamped on change, not before)
    const typing = Object.hasOwn(NUMS, document.activeElement?.id);
    if (scenarioSnapshot === null && !typing) {
      const norm = normalizeCardSettings(cardSettings, state);
      if (JSON.stringify(norm) !== JSON.stringify(cardSettings)) assignCardSettings(norm, { save: false });
    }
    openCrash = Math.min(Math.max(openCrash, 0), cardSettings.crashes.length - 1);
    const s = cardSettings,
      c = s.crashes[openCrash],
      h = s.history,
      on = scenarioSnapshot !== null,
      active = document.activeElement;
    paintCrashRows(s);
    const set = (id, v) => {
      const el = $(id);
      if (el === active) return;
      const t = v === null ? '' : String(v);
      if (el.value !== t) el.value = t;
    };
    for (const id of Object.keys(NUMS)) {
      const [g, k] = NUMS[id];
      set(id, grp(s, g)[k]);
    }
    $('msPresetShape').checked = c.presetShape;
    $('msCrashYear').textContent = `(${CURRENT_YEAR + (c.age - state.ageA)})`;
    $('msHistYear').textContent = `(${CURRENT_YEAR + (h.atAge - state.ageA)})`;
    $('msRecoverOut').textContent = `${c.recoverPct}% of the loss comes back`;
    $('msHistRange').textContent = `${HIST_FIRST_YEAR}–${HIST_LAST_YEAR}`;
    const note = secondLegNote(c, state);
    $('msSecondLeg').hidden = note === null;
    $('msSecondLeg').textContent = note === null ? '' : note;
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
    for (const el of card.querySelectorAll('input, .chart-view-toggle button, .ms-crash-open, .ms-crash-remove, #msAddCrash')) el.disabled = on;
    $('msRecoverYears').disabled = on || c.recoverPct === 0;
    // the cap: ten engine crashes, a Depression entry counting two (the controls that would pass it)
    const count = cardCrashCount(s),
      addOver = count + 1 > MAX_CRASHES,
      chipOver = c.presetShape && count - crashLegs(c) + 2 > MAX_CRASHES,
      shapeOver = c.preset === '1929' && !c.presetShape && count + 1 > MAX_CRASHES;
    $('msAddCrash').disabled = on || addOver;
    $('msPreset1929').disabled = on || chipOver;
    $('msPresetShape').disabled = on || shapeOver;
    $('msCapNote').hidden = on || !(addOver || chipOver || shapeOver);
    const ms = on && state.marketScenario ? state.marketScenario : normalizeMarketScenario(cardSettingsToScenario(s, state));
    const text = ms ? describeMarketScenario(ms, state, CURRENT_YEAR) : '';
    $('msDescription').textContent = text.charAt(0).toUpperCase() + text.slice(1);
    $('msRunBtn').textContent = on ? 'Revert' : 'Run this scenario';
    $('msRunningNote').hidden = !on;
    if (on) $('msPreview').hidden = true;
    $('marketScenarioOnTag').hidden = !on;
  }

  // The crash list: one line per row, the editor under the open one. Rows are rebuilt only when their number changes; otherwise the
  // texts are set in place, so a render never moves the editor out from under a box being typed in.
  function paintCrashRows(s) {
    const list = $('msCrashList');
    if (list.children.length !== s.crashes.length) {
      list.replaceChildren(...s.crashes.map((_, i) => buildCrashRow(i)));
    }
    const row = list.children[openCrash];
    if (editorEl.parentElement !== row) row.appendChild(editorEl);
    s.crashes.forEach((c, i) => {
      const r = list.children[i],
        open = r.querySelector('.ms-crash-open'),
        label = `Crash ${i + 1} · ${crashRowSummary(c)}`;
      if (open.textContent !== label) open.textContent = label;
      open.setAttribute('aria-expanded', String(i === openCrash));
      r.classList.toggle('open', i === openCrash);
      r.querySelector('.ms-crash-remove').hidden = s.crashes.length === 1;
    });
  }
  function buildCrashRow(i) {
    const row = document.createElement('div'),
      head = document.createElement('div'),
      open = document.createElement('button'),
      remove = document.createElement('button');
    row.className = 'ms-crash-row';
    row.dataset.crash = String(i);
    head.className = 'ms-crash-head';
    open.type = 'button';
    open.className = 'ms-crash-open';
    remove.type = 'button';
    remove.className = 'ms-crash-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove crash ${i + 1}`);
    head.append(open, remove);
    row.append(head);
    return row;
  }
  // The delegated row clicks. The open row also holds the editor, so only the two header buttons count.
  function onCrashListClick(e) {
    const btn = e.target.closest('.ms-crash-open, .ms-crash-remove');
    if (!btn || btn.disabled || cardSettings === null) return;
    const k = Number(btn.closest('.ms-crash-row').dataset.crash);
    if (btn.classList.contains('ms-crash-open')) {
      if (k === openCrash) return;
      openCrash = k;
      renderMarketScenarioCardState();
      return;
    }
    if (cardSettings.crashes.length < 2) return;
    // the crash that was open stays open; removing the open one opens the next (or the new last)
    if (k < openCrash) openCrash -= 1;
    edit((next) => next.crashes.splice(k, 1));
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
      grp(next, g)[k] = n;
      const c = next.crashes[openCrash];
      if (g === 'crash' && c.preset !== 'custom' && (k === 'inflation' || k === 'bondReturn' || (c.presetShape && SHAPE_KEYS.includes(k)))) c.preset = 'custom';
    });
  }
  // On change the clamped value is written back into the box, which is the first time the box is rewritten.
  function onChange(id) {
    const [g, k] = NUMS[id];
    assignCardSettings(normalizeCardSettings(cardSettings, state));
    const v = grp(cardSettings, g)[k];
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
    openCrash = 0;
    editorEl = $('msCrashEditor');
    $('msCrashList').addEventListener('click', onCrashListClick);
    $('msAddCrash').addEventListener('click', () => {
      if (cardCrashCount(cardSettings) + 1 > MAX_CRASHES) return;
      openCrash = cardSettings.crashes.length;
      edit((next) => next.crashes.push(newCrashRow(next, state)));
    });
    for (const id of Object.keys(NUMS)) {
      $(id).addEventListener('input', () => onInput(id));
      $(id).addEventListener('change', () => onChange(id));
    }
    $('msKindCrash').addEventListener('click', () => edit((n) => (n.kind = 'crash')));
    $('msKindHistory').addEventListener('click', () => edit((n) => (n.kind = 'history')));
    $('msOrderBucket').addEventListener('click', () => edit((n) => (n.order = 'bucket')));
    $('msOrderStandard').addEventListener('click', () => edit((n) => (n.order = 'standard')));
    for (const id of Object.keys(PRESET_BUTTONS)) $(id).addEventListener('click', () => edit((n) => applyPreset(n.crashes[openCrash], PRESET_BUTTONS[id])));
    $('msPresetShape').addEventListener('change', (e) =>
      edit((n) => {
        const c = n.crashes[openCrash];
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
        runMarketScenario(cardSettingsToScenario(cardSettings, state));
      }
      renderMarketScenarioCardState();
    });
    wireMarketScenarioPreview();
    // the preview is only computed while the card is open, so opening it needs its own trigger
    $('marketScenarioCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
  }
