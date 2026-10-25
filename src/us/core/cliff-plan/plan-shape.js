// The cliff plan's one shape (Batch 5 step 4a): the plan's keys in a fixed order, makePlan, and the id lists a stored plan is checked against.

import { rmdStartAge } from '../income/distributions.js';

// load-time: a frozen literal list (Object.freeze copies nothing it reads).
export const PLAN_KEYS = Object.freeze(['intents', 'family', 'bracket', 'bracketFrom', 'orders', 'splits', 'levers', 'mult', 'orderPhases']);
// load-time: a frozen literal list.
export const PLAN_LINE_IDS = Object.freeze(['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5']);
// load-time: a frozen literal list.
export const PLAN_FAMILIES = Object.freeze(['all', 'aca', 'irmaa', 'none']);
// load-time: a frozen literal list.
export const PLAN_RETS = Object.freeze(['H', 'A', 'B']);
// load-time: a frozen literal list.
export const PLAN_KINDS = Object.freeze(['under', 'fill']);
// load-time: a frozen literal list. The flat brackets the cliff plan's search tries (Batch 5 step 3a, spec A3): the user's bracket
// first, then the others ascending.
export const BRACKET_CANDIDATES = Object.freeze([10, 12, 22, 24, 32, 35]);
// load-time: a frozen literal list.
export const MULT_GRID = Object.freeze([0, 0.5, 1, 1.5, 2]);

// A plan with every key present, in PLAN_KEYS order; a field not given takes its default, an unknown field throws.
export function makePlan(fields) {
  for (const k of Object.keys(fields)) if (!PLAN_KEYS.includes(k)) throw new Error(`makePlan: unknown plan field "${k}"`);
  return {
    intents: fields.intents === undefined ? {} : fields.intents,
    family: fields.family === undefined ? 'none' : fields.family,
    bracket: fields.bracket === undefined ? null : fields.bracket,
    bracketFrom: fields.bracketFrom === undefined ? null : fields.bracketFrom,
    orders: fields.orders === undefined ? null : fields.orders,
    splits: fields.splits === undefined ? null : fields.splits,
    levers: fields.levers === undefined ? null : fields.levers,
    mult: fields.mult === undefined ? null : fields.mult,
    orderPhases: fields.orderPhases === undefined ? null : fields.orderPhases,
  };
}

// The lambda multiplier's phase of a year (Batch 5 step 4a): 0 before 65, 1 from 65 until Partner A's RMD start age, 2 from it on;
// `age` is Partner A's age that year.
export function phaseOf(ctx, age) {
  return age < 65 ? 0 : age < rmdStartAge(ctx, ctx.inputs.ageA) ? 1 : 2;
}

// load-time: a frozen literal list. The objective ids, inlined because objectives.js imports solver.js; a Vitest check keeps it equal to Object.keys(US_OBJECTIVES).
export const STORED_OBJECTIVE_IDS = Object.freeze(['endValue', 'lifetimeCost']);
// load-time: a frozen literal list.
export const STORED_PLAN_KEYS = Object.freeze(['v', 'plan', 'objective', 'mult', 'madeFor', 'taxYear', 'summary']);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.prototype.toString.call(x) === '[object Object]';
const sameKeys = (o, keys) => {
  const k = Object.keys(o);
  return k.length === keys.length && k.every((key, i) => key === keys[i]);
};
const validAge = (k) => /^[0-9]+$/.test(k) && String(Number(k)) === k && Number(k) <= 120;
const validMult = (m) => m === null || (Array.isArray(m) && m.length === 3 && m.every((x) => MULT_GRID.includes(x)));
const rateOk = (x) => x === null || (typeof x === 'number' && Number.isFinite(x));
const pairOk = (a) => Array.isArray(a) && a.length === 2 && rateOk(a[0]) && rateOk(a[1]);
const ageMapOk = (m, values) => m === null || (isObj(m) && Object.keys(m).every((k) => validAge(k) && values.includes(m[k])));

// True when `sp` is a well-formed saved plan (v 1): exactly STORED_PLAN_KEYS, a plan with exactly PLAN_KEYS in order, every id in
// its list. 4a writes `levers` and `orderPhases` as null only, so the guard accepts only null for them.
export function isValidStoredPlan(sp) {
  if (!isObj(sp) || !sameKeys(sp, STORED_PLAN_KEYS) || sp.v !== 1) return false;
  const p = sp.plan;
  if (!isObj(p) || !sameKeys(p, PLAN_KEYS)) return false;
  if (!isObj(p.intents)) return false;
  for (const k of Object.keys(p.intents)) {
    const it = p.intents[k];
    if (!validAge(k) || !isObj(it) || !sameKeys(it, ['kind', 'line', 'ret'])) return false;
    if (!PLAN_KINDS.includes(it.kind) || !PLAN_LINE_IDS.includes(it.line) || !PLAN_RETS.includes(it.ret)) return false;
  }
  if (!PLAN_FAMILIES.includes(p.family)) return false;
  if (!BRACKET_CANDIDATES.includes(p.bracket) || !BRACKET_CANDIDATES.includes(p.bracketFrom)) return false;
  if (!ageMapOk(p.orders, ['traditional']) || !ageMapOk(p.splits, ['A', 'B'])) return false;
  if (p.levers !== null || p.orderPhases !== null) return false;
  if (!validMult(p.mult) || !validMult(sp.mult)) return false;
  if (!STORED_OBJECTIVE_IDS.includes(sp.objective) || typeof sp.madeFor !== 'string') return false;
  if (!Number.isInteger(sp.taxYear)) return false;
  const s = sp.summary;
  if (!isObj(s) || !sameKeys(s, ['gain', 'success']) || typeof s.gain !== 'number' || !Number.isFinite(s.gain)) return false;
  if (!isObj(s.success) || !sameKeys(s.success, ['hist', 'mc'])) return false;
  return pairOk(s.success.hist) && pairOk(s.success.mc);
}
