// State the Roth / multi-lever optimizers share with the engine. No DOM access.

export const ROTH_PER_YEAR_EVAL_BUDGET = 8000; // simulate() calls, hard cap for the whole run (shared across every lever/smooth-branch in one call)

// load-time: a literal object that reads ROTH_PER_YEAR_EVAL_BUDGET, the constant declared above it
export const optimizerState = {
  // Per-age overrides applied by the optimizers ("Apply" writes them; a mapped 0 or no entry means no override that year).
  rothBracketByAge: null,
  withdrawalMixByAge: null,
  // Last completed optimizeMultiLever() run shown in the result card — { opt, options, savings } or null before the first
  // run this session. Read by applyMultiLeverSchedule() so "Apply" writes exactly what the table is currently showing.
  lastMultiLeverRun: null,
  // The budget optimizeMultiLever reads; only the test hook __test_setOptimizerBudget changes it (tests/solver_gap.js runs a
  // slow reference with a larger budget).
  rothPerYearEvalBudget: ROTH_PER_YEAR_EVAL_BUDGET,
};
