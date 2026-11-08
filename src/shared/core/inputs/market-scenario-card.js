// The market scenario card's settings: presets, defaults, clamps and the scenario they run

import { HIST } from '../projection/historical-data.js';
import { planLastAge } from './plan-last-age.js';
import { isObject, num, clamp, clampInt, MAX_CRASHES } from './market-scenario.js';

  // load-time: reads the imported HIST data constant, which this module's import has already evaluated
  export const HIST_FIRST_YEAR = HIST[0][0];
  // load-time: reads the imported HIST data constant, as HIST_FIRST_YEAR does
  export const HIST_LAST_YEAR = HIST[HIST.length - 1][0];

  // load-time: freezes literals only, reading nothing a statement or another function writes
  // Each preset: the fall years' average inflation and bond return (the cited HIST rows, rounded to one decimal) and recoverTo,
  // the year the nominal total-return index (the actual market, not inflation-adjusted) got back to its level at the start of fallFrom
  // (for the Depression, the end of its first recovery). `then` is the Depression's second fall (1937) with its own rates and recoverTo.
  export const CRASH_PRESETS = Object.freeze([
    Object.freeze({
      id: '1929',
      label: 'Like 1929–44',
      inflation: -6.4,
      bondReturn: 3.7,
      fallFrom: 1929,
      fallTo: 1932,
      recoverTo: 1936,
      then: Object.freeze({ fallFrom: 1937, fallTo: 1937, recoverTo: 1944, inflation: 2.9, bondReturn: 1.4 }),
    }),
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

  // The Depression's second fall as a crash row, measured against the market leg 1 lands on (the plan's line times leg 1's rounded
  // end level), rounded and clamped as presetCrashShape does. null for a preset with no second fall. Computed when called.
  export function presetSecondLeg(preset, returnRatePct) {
    const t = preset.then;
    if (!t) return null;
    const r = returnRatePct / 100,
      s1 = presetCrashShape(preset, returnRatePct),
      qEnd1 = 1 - (s1.drop / 100) * (1 - s1.recoverPct / 100);
    let bottom = 1,
      level = 1;
    for (const row of HIST) {
      if (row[0] >= preset.fallFrom && row[0] <= t.fallTo) bottom *= 1 + row[1] / 100;
      if (row[0] >= preset.fallFrom && row[0] <= t.recoverTo) level *= 1 + row[1] / 100;
    }
    // both levels run from the preset's own start (1929), against the plan's line over the same years and the leg 1 end level
    const F = t.fallTo - t.fallFrom + 1,
      N = t.recoverTo - t.fallTo,
      qb = bottom / (Math.pow(1 + r, t.fallTo - preset.fallFrom + 1) * qEnd1),
      qe = level / (Math.pow(1 + r, t.recoverTo - preset.fallFrom + 1) * qEnd1),
      drop = clamp(Math.round((1 - qb) * 100), 0, 95),
      d = drop / 100,
      recoverPct = drop === 0 ? 0 : clamp(Math.round(((qe - (1 - d)) / d) * 100), 0, 100);
    return { ageOffset: t.fallFrom - preset.fallFrom, drop, fallYears: F, recoverPct, recoverYears: N, inflation: t.inflation, bondReturn: t.bondReturn };
  }

  // A row is two engine crashes exactly when its Depression shape is on and still standing (a Custom row is one).
  export function crashLegs(row) {
    if (row.presetShape !== true) return 1;
    const p = CRASH_PRESETS.find((x) => x.id === row.preset);
    return p && p.then ? 2 : 1;
  }
  // The engine crashes the list makes (the cap counts these, whatever the plan's last age is).
  export function cardCrashCount(s) {
    let n = 0;
    for (const row of s.crashes) n += crashLegs(row);
    return n;
  }

  // The card's defaults for these inputs: a 2008-like crash at retirement, and a replay of 2000 from retirement.
  export function defaultCardSettings(inputs) {
    const L = planLastAge(inputs),
      ret = Number.isFinite(inputs.retireAgeA) ? inputs.retireAgeA : inputs.ageA,
      R = clamp(ret, inputs.ageA, L);
    return {
      kind: 'crash',
      order: 'bucket',
      crashes: [{ age: R, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, preset: '2008', presetShape: false, inflation: 0.1, bondReturn: 20.1 }],
      history: { startYear: 2000, atAge: R, endAge: null },
    };
  }

  // One crash row: the default crash with each valid field of `c` laid over it and clamped into the plan.
  function normalizeCrashRow(c, inputs) {
    const o = defaultCardSettings(inputs).crashes[0],
      L = planLastAge(inputs),
      lo = inputs.ageA,
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
    return o;
  }

  // Always a full settings object: the defaults, with each valid field of `raw` laid over them and clamped into the plan.
  // The rows are `raw.crashes`, or the one `raw.crash` of a PR 3 save; the list is cut where the engine-crash count would pass MAX_CRASHES.
  export function normalizeCardSettings(raw, inputs) {
    const out = defaultCardSettings(inputs);
    if (!isObject(raw)) return out;
    const L = planLastAge(inputs),
      lo = inputs.ageA;
    if (raw.kind === 'crash' || raw.kind === 'history') out.kind = raw.kind;
    if (raw.order === 'bucket' || raw.order === 'standard') out.order = raw.order;
    const source = Array.isArray(raw.crashes) ? raw.crashes : isObject(raw.crash) ? [raw.crash] : null;
    if (source) {
      const rows = [];
      let count = 0;
      for (const c of source) {
        if (!isObject(c)) continue;
        const row = normalizeCrashRow(c, inputs),
          legs = crashLegs(row);
        if (count + legs > MAX_CRASHES) break;
        count += legs;
        rows.push(row);
      }
      if (rows.length > 0) out.crashes = rows;
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

  // The last window age of a row: its fall plus its recovery (none at 0%), the end of leg 2 for a two-leg row.
  function rowEndAge(row, inputs) {
    const leg = crashLegs(row) === 2 ? presetSecondLeg(CRASH_PRESETS.find((x) => x.id === row.preset), inputs.returnRate) : null;
    if (leg) return row.age + leg.ageOffset + leg.fallYears + (leg.recoverPct > 0 ? leg.recoverYears : 0) - 1;
    return row.age + row.fallYears + (row.recoverPct > 0 ? row.recoverYears : 0) - 1;
  }
  // Where a new crash goes: the year after the last listed row's window, kept inside the plan.
  export function nextCrashAge(s, inputs) {
    const last = s.crashes[s.crashes.length - 1];
    return clampInt(rowEndAge(last, inputs) + 1, inputs.ageA, planLastAge(inputs));
  }
  export function newCrashRow(s, inputs) {
    const row = defaultCardSettings(inputs).crashes[0];
    row.age = nextCrashAge(s, inputs);
    return row;
  }

  // The raw marketScenario the settings run (normalizeMarketScenario cleans it). A Depression row is followed by its second fall,
  // left out when that falls after the plan's last age.
  export function cardSettingsToScenario(s, inputs) {
    if (s.kind === 'history') {
      return { kind: 'history', order: s.order, history: { startYear: s.history.startYear, atAge: s.history.atAge, endAge: s.history.endAge } };
    }
    const L = planLastAge(inputs),
      crashes = [];
    for (const c of s.crashes) {
      crashes.push({ age: c.age, drop: c.drop, fallYears: c.fallYears, recoverPct: c.recoverPct, recoverYears: c.recoverYears, inflation: c.inflation, bondReturn: c.bondReturn });
      if (crashLegs(c) === 2) {
        const leg = presetSecondLeg(CRASH_PRESETS.find((x) => x.id === c.preset), inputs.returnRate);
        if (c.age + leg.ageOffset <= L) {
          crashes.push({ age: c.age + leg.ageOffset, drop: leg.drop, fallYears: leg.fallYears, recoverPct: leg.recoverPct, recoverYears: leg.recoverYears, inflation: leg.inflation, bondReturn: leg.bondReturn });
        }
      }
    }
    return { kind: 'crash', order: s.order, crashes };
  }
