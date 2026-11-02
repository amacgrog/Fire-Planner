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
  sizedTrials: null, // Optimize's sized trials, k (null: SIZED_TRIALS of src/us/core/optimizer/plan-search.js; Batch 5 step 5, Task 4)
  splitCheckCalls: 0, // evaluations of the split lever's eligibility (wd.splittable; Batch 5 step 4d)
  // Batch 5 follow-ups S1, Task 2f: the replay check (ctx.test.replayCheck; tests/replay_check.js) and the IRMAA holds off
  // (ctx.test.irmaaHoldOff, the gate test), read into storeRunContext's test literal; set through the assign functions below.
  testReplayCheck: false,
  testIrmaaHoldOff: false,
  // The replay check's counters: a replayed or forced pass (or a seeded phase's first pass) that did not repeat its source exactly,
  // and the passes checked per kind (the forced pass, the replays R2-R6, the seeds P1-P5, S1 and P4 of the site table).
  replayMismatch: 0,
  replayCheckedForced: 0,
  replayCheckedCapPick: 0, // Task 4b: the cap pick's pass (compared with its logged pass, as the forced one)
  replayCheckedR2: 0,
  replayCheckedR3: 0,
  replayCheckedR4: 0,
  replayCheckedR5: 0,
  replayCheckedR6: 0,
  replayCheckedSeedP1: 0,
  replayCheckedSeedP2: 0,
  replayCheckedSeedP3: 0,
  replayCheckedSeedP4: 0,
  replayCheckedSeedP5: 0,
  replayCheckedSeedS1: 0,
  replayMismatchLast: null, // the last mismatch ({ kind, year, what, got, want }), for a report
};
// The replay check on or off (testHooks.testReplayCheck).
export function assignReplayCheck(on) {
  testHooks.testReplayCheck = on === true;
}
// The IRMAA holds off (testHooks.testIrmaaHoldOff): the conversion ceiling as before Task 2f (the gate test).
export function assignIrmaaHoldOff(on) {
  testHooks.testIrmaaHoldOff = on === true;
}
