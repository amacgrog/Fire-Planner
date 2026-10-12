// Test-only counters and switches the engine reads or bumps; the window.__test_* hooks in main.js set them.
// Kept in one object so the engine does not own test state. No DOM access.
export const testHooks = {
  irmaaInYearCalls: 0, // how many times healthcareCost priced an in-year appeal candidate
  inhTakeCount: 0, // takeInherited calls that get past the null gate
  testInhForce: null, // add x to ledger slot `slot`'s scheduled draw in projection year `year` (the identity tests)
  testInhNoNeedAdj: false, // switch off the need-without-the-draw step (the exact-restore test)
  inhNoDrawCalls: 0, // evaluations of that step
};
