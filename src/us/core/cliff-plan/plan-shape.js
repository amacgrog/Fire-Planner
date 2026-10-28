// The cliff plan's one shape (Batch 5 step 4a): the plan's keys in a fixed order, makePlan, and the id lists a stored plan is checked against.

import { rmdStartAge } from '../income/distributions.js';

// load-time: a frozen literal list (Object.freeze copies nothing it reads).
export const PLAN_KEYS = Object.freeze(['intents', 'family', 'bracket', 'bracketFrom', 'orders', 'splits', 'levers', 'mult', 'orderPhases', 'conv']);
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
    conv: fields.conv === undefined ? null : fields.conv,
  };
}

// A plan line's name in the summary and the row labels (Batch 5 step 5b piece 3: moved here from cliffPlanSummary, for the
// conversion choice's wording).
export function lineNameOf(id) {
  const m = /^irmaa([0-9]+)$/.exec(id);
  return id === 'aca400' ? 'the ACA 400% line' : id === 'acaFloor' ? 'the ACA credit floor' : id === 'medicaid' ? 'the Medicaid line' : m ? `IRMAA tier ${m[1]}` : id;
}

// The lambda multiplier's phase of a year (Batch 5 step 4a): 0 before 65, 1 from 65 until Partner A's RMD start age, 2 from it on;
// `age` is Partner A's age that year.
export function phaseOf(ctx, age) {
  return age < 65 ? 0 : age < rmdStartAge(ctx, ctx.inputs.ageA) ? 1 : 2;
}

// load-time: a frozen literal object. The levers of the automatic plan with the withdrawal toggle on, and Optimize's default
// (Batch 5 step 4d, D10; 4c's ORDER_LEVERS had the order lever only): the order lever and the split lever.
export const PLAN_LEVERS = Object.freeze({ order: true, split: true });

// The phases (phaseOf) of an order map's ages, sorted and distinct; null for null or a map with no keys (Batch 5 step 4c).
export function orderPhasesOf(ctx, orders) {
  if (orders === null || orders === undefined) return null;
  const out = [];
  for (const k of Object.keys(orders)) {
    const p = phaseOf(ctx, Number(k));
    if (!out.includes(p)) out.push(p);
  }
  return out.length ? out.sort((a, b) => a - b) : null;
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
const leversOk = (l) => l === null || (isObj(l) && sameKeys(l, ['order', 'split']) && typeof l.order === 'boolean' && typeof l.split === 'boolean');
// Batch 5 step 5b piece 3 (spec B0.4): the conversion targets by Partner A's age: 'none', a flat bracket 'b10'..'b35', or exactly
// { id, ret, side } (in that order) with a plan line id, a return and a side.
const convTargetOk = (v) =>
  v === 'none' ||
  BRACKET_CANDIDATES.some((b) => v === 'b' + b) ||
  (isObj(v) && sameKeys(v, ['id', 'ret', 'side']) && PLAN_LINE_IDS.includes(v.id) && PLAN_RETS.includes(v.ret) && (v.side === 'under' || v.side === 'over'));
const convOk = (m) => m === null || (isObj(m) && Object.keys(m).every((k) => validAge(k) && convTargetOk(m[k])));
const phasesOk = (a) => a === null || (Array.isArray(a) && a.length > 0 && a.every((x, i) => (x === 0 || x === 1 || x === 2) && (i === 0 || x > a[i - 1])));

// True when `sp` is a well-formed saved plan (v 1): exactly STORED_PLAN_KEYS, a plan with exactly PLAN_KEYS in order, every id in
// its list. `levers` is null or exactly `{ order, split }` (booleans, in that order); `orderPhases` null or a non-empty, strictly
// ascending list of phases (0, 1, 2), null exactly when `orders` is (Batch 5 step 4c; a 4a / 4b plan has all three null).
// `splits` is null or an age map of 'A' / 'B' (Batch 5 step 4d); an empty `orders` or `splits` map never reaches a plan (it is
// stored as null). `conv` (Batch 5 step 5b piece 3) is null or an age map of conversion targets (convOk).
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
  if (!leversOk(p.levers) || !phasesOk(p.orderPhases) || (p.orders === null) !== (p.orderPhases === null)) return false;
  if (!convOk(p.conv)) return false;
  if (!validMult(p.mult) || !validMult(sp.mult)) return false;
  if (!STORED_OBJECTIVE_IDS.includes(sp.objective) || typeof sp.madeFor !== 'string') return false;
  if (!Number.isInteger(sp.taxYear)) return false;
  const s = sp.summary;
  if (!isObj(s) || !sameKeys(s, ['gain', 'success']) || typeof s.gain !== 'number' || !Number.isFinite(s.gain)) return false;
  if (!isObj(s.success) || !sameKeys(s.success, ['hist', 'mc'])) return false;
  return pairOk(s.success.hist) && pairOk(s.success.mc);
}

// Batch 5 step 5b piece 3 (spec B0.4): a saved v1 plan made before `conv` (its plan has exactly the nine earlier keys, in order)
// as a copy whose plan ends with `conv: null`; anything else is returned as it is (the guard then judges it). The argument is
// never written.
export function migrateStoredPlan(sp) {
  if (!isObj(sp) || sp.v !== 1 || !isObj(sp.plan) || !sameKeys(sp.plan, PLAN_KEYS.slice(0, -1))) return sp;
  return { ...sp, plan: { ...sp.plan, conv: null } };
}
