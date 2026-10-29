// The run context: the one object a projection reads its inputs, tax year, plan, overrides and sinks from

// load-time: Object.freeze is a call on a literal; it reads no other name
export const NO_OVERRIDES = Object.freeze({ rothBracketByAge: null, withdrawalMixByAge: null });

// load-time: Object.freeze is a call on a literal; it reads no other name
export const NO_TEST = Object.freeze({ inhForce: null, inhNoNeedAdj: false, seCarryAt: null, seNoSettle: false, bracketSearchOff: false, convSizingOff: false, convRunBudget: null });

// Always the same key order (one hidden class): inputs, taxYear, taxFactors, plan, planMode, overrides, stats, test.
export function newRunContext({ inputs, taxYear, taxFactors = null, plan = null, planMode = 'off', overrides = NO_OVERRIDES, stats = null, test = NO_TEST }) {
  return { inputs, taxYear, taxFactors, plan, planMode, overrides, stats, test };
}
