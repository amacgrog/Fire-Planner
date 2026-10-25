// The cliff plan's one shape (Batch 5 step 4a): the plan's keys in a fixed order, makePlan, and the id lists a stored plan is checked against.

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
