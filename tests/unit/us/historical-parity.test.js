// Historical-engine parity with the standard engine (Batch 1 of docs/next-batches-plan.md), US half. See
// tests/unit/helpers/historical-parity.js for the scenarios and the comparison.
// Converted from tests/historical_parity.js (Playwright), which ran both planners: the old script executed 44 checks
// (5 assert calls of the source check, and 39 inline guard evaluations: one parity verdict per scenario, 20, one
// ladder-vacuity guard per pre-retirement scenario, 6, one empty-plan guard per US scenario, 13; the page-error asserts
// are excluded). The suite is split per planner: this US file asserts 34 (5 source asserts, 13 verdicts, 3 vacuity guards,
// 13 empty-plan guards), the Canada file 10. NEW_COUNT follows the scenario list, so it moves only if a scenario is added.
//
// The US runs go through the engine helper, which plans for the state it sees: the cliff plan is applied in both engines.
// A second US check: `apply` with an empty plan equals `off` on both engines for every parity household (the cliff plan's
// apply mode adds nothing in a year without an intent). It uses __test_runPlanMode and __test_rowFnFor, ported in
// tests/unit/helpers/us-plan.js.
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { usPlan } from '../helpers/us-plan.js';
import { SCENARIOS, runParity, readUsAndSharedSource } from '../helpers/historical-parity.js';

const NEW_COUNT = 34;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const check = (ok, msg) => {
  c.tick();
  expect.soft(ok, msg).toBe(true);
};

// Wiring check for the safe-MAGI room (US). No scenario was found where the room changes the live
// mix's choice (828 searched, see docs/next-batches-plan.md "Batch 1 notes"), so behavior alone
// cannot prove the historical engine passes it on. Check the source instead: both strategies must
// hand the live mix the same remaining room, `max(0, magiSafeRoom - conversionAmount)`, and the
// bucket's grouped stock step must forward it.
it('[F5] US safe-MAGI room is passed to the live mix by both engines (source check)', () => {
  const src = readUsAndSharedSource();
  const room = 'incomeRoom(magiSafeRoom, conversionAmount)';
  // Since 3C (B3) both strategies get one options object, `wopts`, built per engine mode and passed
  // through `runWithdraw` (since the cliff plan, called once in the year body: the legacy guard's dry runs are gone).
  const wopts = src.match(/const wopts = mode\.bucketStrategy\s*\?\s*(\{[^}]*\})\s*:\s*(\{[^}]*\});/);
  check(!!wopts, 'the year loop must build the withdrawal options (wopts)');
  check(wopts[2].includes(`remainingMagiRoom: ${room}`) && src.includes('withdrawStandard(w, wopts)'), 'standard engine must pass the remaining MAGI room');
  check(wopts[1].includes(`remainingMagiRoom: ${room}`) && /withdrawBucket\)\(w, wopts\)/.test(src), 'historical engine must pass the remaining MAGI room');
  check(src.includes('remainingMagiRoom: opts.remainingMagiRoom'), 'BUCKET_STEP.stocks must forward the remaining MAGI room');
  // The legacy in-path guard is gone (cliff plan, Task 6): no dry runs remain to wire.
  check(!/chooseYearPlan|cloneWithdrawal|adoptWithdrawal/.test(src), 'the legacy in-path guard is removed');
});

it.each(SCENARIOS.US)('[$group] US $name', async (sc) => {
  const { w, resetTo } = await runParity(true, sc, c);
  // apply with an empty plan against off, standard engine and the bucket engine (a real path, so down years too).
  resetTo(sc.patch);
  const plan = await usPlan(w);
  const rowsOf = (planMode, rowFn) => JSON.stringify(plan.runPlanMode({ planMode, plan: planMode === 'apply' ? { intents: {} } : null, rowFn }).rows);
  const out = [];
  for (const rowFn of [null, plan.rowFnFor({ type: 'real', start: 1966 })]) out.push(rowsOf('apply', rowFn) === rowsOf('off', rowFn));
  const [stdSame, histSame] = out;
  check(stdSame && histSame, `[plan] US ${sc.name}: apply with an empty plan differs from off (standard ${stdSame}, bucket ${histSame})`);
});
