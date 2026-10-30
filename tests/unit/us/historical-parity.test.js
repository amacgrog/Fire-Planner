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

// Wiring check for the withdrawal options (US). Since Batch 5 step 4c the live mix and its safe-MAGI room are gone: the
// order intent rides on the withdrawal (wd.taxAwareOrder), so both strategies get the age only (the bucket strategy also its
// return, bond target and refill cap) through one options object, and no trace of the room's wiring remains.
it('[F5] US withdrawal options carry the age only; the live-mix room wiring is gone (source check)', () => {
  const src = readUsAndSharedSource();
  // Since 3C (B3) both strategies get one options object, `wopts`, built per engine mode and passed
  // through `runWithdraw` (since the cliff plan, called once in the year body: the legacy guard's dry runs are gone).
  const wopts = src.match(/const wopts = mode\.bucketStrategy\s*\?\s*(\{[^}]*\})\s*:\s*(\{[^}]*\});/);
  check(!!wopts, 'the year loop must build the withdrawal options (wopts)');
  check(/\bage\b/.test(wopts?.[2] ?? '') && !wopts?.[2]?.includes('remainingMagiRoom') && src.includes('withdrawStandard(w, wopts)'), 'standard engine must pass the age, and no MAGI room');
  check(/\bage\b/.test(wopts?.[1] ?? '') && !wopts?.[1]?.includes('remainingMagiRoom') && /withdrawBucket\)\(w, wopts\)/.test(src), 'historical engine must pass the age, and no MAGI room');
  check(!/remainingMagiRoom|incomeRoom|pickLiveWithdrawalOrder/.test(src), 'the live-mix room wiring and picker are removed');
  // The legacy in-path guard is gone (cliff plan, Task 6): no dry runs remain to wire.
  check(!/chooseYearPlan|cloneWithdrawal|adoptWithdrawal/.test(src), 'the legacy in-path guard is removed');
});

it.each(SCENARIOS.US)('[$group] US $name', async (sc) => {
  const { w, resetTo, resetOverrides } = await runParity(true, sc, c);
  // apply with an empty plan against off, standard engine and the bucket engine (a real path, so down years too).
  resetTo(sc.patch);
  const plan = await usPlan(w);
  const rowsOf = (planMode, rowFn) => JSON.stringify(plan.runPlanMode({ planMode, plan: planMode === 'apply' ? { intents: {} } : null, rowFn }).rows);
  const out = [];
  for (const rowFn of [null, plan.rowFnFor({ type: 'real', start: 1966 })]) out.push(rowsOf('apply', rowFn) === rowsOf('off', rowFn));
  const [stdSame, histSame] = out;
  check(stdSame && histSame, `[plan] US ${sc.name}: apply with an empty plan differs from off (standard ${stdSame}, bucket ${histSame})`);
  resetOverrides();
});
