// normalizeMarketScenario: cleans the market-scenario input (custom crashes or a replayed historical start) into its fixed shape, or undefined for off

import { HIST } from '../projection/historical-data.js';

const MAX_CRASHES = 10;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A number is a finite number or a non-blank string Number reads as finite; '', null, true and [] are not numbers.
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clampInt = (n, lo, hi) => clamp(Math.round(n), lo, hi);

const CRASH_FIELDS = [
  ['age', 0, 120, true],
  ['drop', 0, 95, false],
  ['fallYears', 1, 10, true],
  ['recoverPct', 0, 100, false],
  ['recoverYears', 1, 30, true],
  ['inflation', -15, 30, false],
  ['bondReturn', -50, 50, false],
];

function normalizeCrash(row) {
  if (!isObject(row)) return null;
  const out = {};
  for (const [key, lo, hi, int] of CRASH_FIELDS) {
    const n = num(row[key]);
    if (n === null) return null;
    out[key] = int ? clampInt(n, lo, hi) : clamp(n, lo, hi);
  }
  return out;
}

export function normalizeMarketScenario(raw) {
  if (!isObject(raw)) return undefined;
  if (raw.kind !== 'crash' && raw.kind !== 'history') return undefined;
  const order = raw.order === 'standard' ? 'standard' : 'bucket';
  if (raw.kind === 'crash') {
    if (!Array.isArray(raw.crashes)) return undefined;
    const crashes = [];
    for (const row of raw.crashes) {
      const c = normalizeCrash(row);
      if (c) crashes.push(c);
      if (crashes.length === MAX_CRASHES) break;
    }
    if (crashes.length === 0) return undefined;
    return { kind: 'crash', order, crashes };
  }
  if (!isObject(raw.history)) return undefined;
  const startYear = num(raw.history.startYear);
  const atAge = num(raw.history.atAge);
  if (startYear === null || atAge === null) return undefined;
  const e = raw.history.endAge;
  let endAge = null;
  if (!(e === null || e === undefined || e === '')) {
    const n = num(e);
    if (n === null) return undefined;
    endAge = clampInt(n, 0, 120);
  }
  return {
    kind: 'history',
    order,
    history: { startYear: clampInt(startYear, HIST[0][0], HIST[HIST.length - 1][0]), atAge: clampInt(atAge, 0, 120), endAge },
  };
}
