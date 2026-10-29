// testHooks: test-only counters and switches the US engine reads or bumps

// Test-only counters and switches the engine reads or bumps; the window.__test_* hooks that set and read them are
// installed by src/us/ui/install-test-hooks.js. Kept in one object so the engine does not own test state. No DOM access.
export const testHooks = {
  irmaaInYearCalls: 0, // how many times healthcareCost priced an in-year appeal candidate
  inhTakeCount: 0, // takeInherited calls that get past the null gate
  testInhForce: null, // add x to ledger slot `slot`'s scheduled draw in projection year `year` (the identity tests)
  testInhNoNeedAdj: false, // switch off the need-without-the-draw step (the exact-restore test)
  inhNoDrawCalls: 0, // evaluations of that step
  testSeCarryAt: null, // { year, amount }: add amount to year `year`'s outgoing 162(l) carry (next year's cash, or the estate)
  testSeNoSettle: false, // switch off the 162(l) settlement (the comparison runs)
  testBracketSearchOff: false, // switch off the cliff plan's bracket search (Batch 5 step 3a)
  testConvSizingOff: false, // switch off the cliff plan's per-year conversion sizing (Batch 5 step 5b piece 3; ships on since V148)
  splitCheckCalls: 0, // evaluations of the split lever's eligibility (wd.splittable; Batch 5 step 4d)
};
