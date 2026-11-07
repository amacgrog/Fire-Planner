// The market scenario card's settings: presets, defaults, clamps and the scenario they run

import { HIST } from '../projection/historical-data.js';
import { planLastAge } from '../format/market-scenario-text.js';

  // load-time: reads the imported HIST data constant, which this module's import has already evaluated
  export const HIST_FIRST_YEAR = HIST[0][0];
  // load-time: reads the imported HIST data constant, as HIST_FIRST_YEAR does
  export const HIST_LAST_YEAR = HIST[HIST.length - 1][0];

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const clampInt = (n, lo, hi) => clamp(Math.round(n), lo, hi);
  // a finite number, or a non-blank string Number reads as finite; anything else is null
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // load-time: freezes literals only, reading nothing a statement or another function writes
  // Each preset: the fall years' average inflation and bond return (the cited HIST rows, rounded to one decimal) and recoverTo,
  // the year the nominal total-return index (the actual market, not inflation-adjusted) got back to its level at the start of fallFrom (for the Depression, back for good).
  export const CRASH_PRESETS = Object.freeze([
    Object.freeze({ id: '1929', label: 'Like 1929–32', inflation: -6.4, bondReturn: 3.7, fallFrom: 1929, fallTo: 1932, recoverTo: 1944 }),
    Object.freeze({ id: '1973', label: 'Like 1973–74', inflation: 10.5, bondReturn: 2.8, fallFrom: 1973, fallTo: 1974, recoverTo: 1976 }),
    Object.freeze({ id: '2000', label: 'Like 2000–02', inflation: 2.4, bondReturn: 12.5, fallFrom: 2000, fallTo: 2002, recoverTo: 2006 }),
    Object.freeze({ id: '2008', label: 'Like 2008', inflation: 0.1, bondReturn: 20.1, fallFrom: 2008, fallTo: 2008, recoverTo: 2012 }),
    Object.freeze({ id: '2022', label: 'Like 2022', inflation: 6.5, bondReturn: -17.8, fallFrom: 2022, fallTo: 2022, recoverTo: 2023 }),
  ]);

  // The preset's real stock path as a crash against the plan's own line (Q11): the crash's drop is measured against the plan's
  // index, so the real bottom and level are divided by the plan's growth over the same years. The HIST products are computed here,
  // when called, never at load. The drop is rounded first and the recovery sized for the rounded drop (the engine runs that drop).
  export function presetCrashShape(preset, returnRatePct) {
    const F = preset.fallTo - preset.fallFrom + 1,
      N = preset.recoverTo - preset.fallTo,
      r = returnRatePct / 100;
    let bottom = 1,
      level = 1;
    for (const row of HIST) {
      if (row[0] >= preset.fallFrom && row[0] <= preset.fallTo) bottom *= 1 + row[1] / 100;
      if (row[0] >= preset.fallFrom && row[0] <= preset.recoverTo) level *= 1 + row[1] / 100;
    }
    const qb = bottom / Math.pow(1 + r, F),
      qe = level / Math.pow(1 + r, F + N),
      drop = clamp(Math.round((1 - qb) * 100), 0, 95),
      d = drop / 100,
      recoverPct = drop === 0 ? 0 : clamp(Math.round(((qe - (1 - d)) / d) * 100), 0, 100);
    return { drop, fallYears: F, recoverPct, recoverYears: N };
  }

  // The card's defaults for these inputs: a 2008-like crash at retirement, and a replay of 2000 from retirement.
  export function defaultCardSettings(inputs) {
    const L = planLastAge(inputs),
      ret = Number.isFinite(inputs.retireAgeA) ? inputs.retireAgeA : inputs.ageA,
      R = clamp(ret, inputs.ageA, L);
    return {
      kind: 'crash',
      order: 'bucket',
      crash: { age: R, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, preset: '2008', presetShape: false, inflation: 0.1, bondReturn: 20.1 },
      history: { startYear: 2000, atAge: R, endAge: null },
    };
  }

  // Always a full settings object: the defaults, with each valid field of `raw` laid over them and clamped into the plan.
  export function normalizeCardSettings(raw, inputs) {
    const out = defaultCardSettings(inputs);
    if (!isObject(raw)) return out;
    const L = planLastAge(inputs),
      lo = inputs.ageA;
    if (raw.kind === 'crash' || raw.kind === 'history') out.kind = raw.kind;
    if (raw.order === 'bucket' || raw.order === 'standard') out.order = raw.order;
    if (isObject(raw.crash)) {
      const c = raw.crash,
        o = out.crash,
        put = (key, min, max, int) => {
          const n = num(c[key]);
          if (n !== null) o[key] = int ? clampInt(n, min, max) : clamp(n, min, max);
        };
      put('age', lo, L, true);
      put('drop', 0, 95, false);
      put('fallYears', 1, 10, true);
      put('recoverPct', 0, 100, false);
      put('recoverYears', 1, 30, true);
      put('inflation', -15, 30, false);
      put('bondReturn', -50, 50, false);
      o.presetShape = c.presetShape === true;
      if (c.preset === 'custom' || CRASH_PRESETS.some((p) => p.id === c.preset)) o.preset = c.preset;
      const p = CRASH_PRESETS.find((x) => x.id === o.preset);
      // a preset chip stands only while the rates are the preset's own
      if (p && (o.inflation !== p.inflation || o.bondReturn !== p.bondReturn)) o.preset = 'custom';
      // a shape preset stands only while the four numbers are what it gives at the plan's current return (Q11)
      if (p && o.preset !== 'custom' && o.presetShape) {
        const s = presetCrashShape(p, inputs.returnRate);
        if (o.drop !== s.drop || o.fallYears !== s.fallYears || o.recoverPct !== s.recoverPct || o.recoverYears !== s.recoverYears) o.preset = 'custom';
      }
    }
    if (isObject(raw.history)) {
      const h = raw.history,
        o = out.history,
        sy = num(h.startYear),
        at = num(h.atAge);
      if (sy !== null) o.startYear = clampInt(sy, HIST_FIRST_YEAR, HIST_LAST_YEAR);
      if (at !== null) o.atAge = clampInt(at, lo, L);
      const e = h.endAge;
      if (!(e === null || e === undefined || e === '')) {
        const n = num(e),
          min = o.atAge + 1;
        if (n !== null) o.endAge = clampInt(n, min, Math.max(min, Math.min(L + 1, 120)));
      }
    }
    return out;
  }

  // The raw marketScenario the settings run (normalizeMarketScenario cleans it).
  export function cardSettingsToScenario(s) {
    if (s.kind === 'history') {
      return { kind: 'history', order: s.order, history: { startYear: s.history.startYear, atAge: s.history.atAge, endAge: s.history.endAge } };
    }
    const c = s.crash;
    return {
      kind: 'crash',
      order: s.order,
      crashes: [{ age: c.age, drop: c.drop, fallYears: c.fallYears, recoverPct: c.recoverPct, recoverYears: c.recoverYears, inflation: c.inflation, bondReturn: c.bondReturn }],
    };
  }
