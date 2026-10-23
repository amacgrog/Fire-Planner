// The multi-lever optimizer with all three levers is deterministic: two runs on the same inputs give the same joint
// schedule. Converted from test_multi_lever_optimizer.js (Playwright), which executed 31 checks (the page-error checks
// excluded): multi-lever-optimizer, -mix, -combined and -determinism.test.js assert 30 of them, split by run time so
// Vitest's forks run them in parallel; the wall-clock check ("under 15s") stays in the root script
// test_optimizer_ui.js. Each it block gets its own world (tests/unit/helpers/multi-lever.js), as each old block got a
// fresh page; the hooks re-plan the cliff plan first, as the window hooks do (usOptimizer, tests/unit/helpers/us-
// plan.js).
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { ACA_CLIFF, checks, entries, optimizerWorld } from '../helpers/multi-lever.js';

const NEW_COUNT = 1;
const c = makeCounter();
// A full-budget optimizer run takes tens of seconds, more when every file runs at once: past the 60 s default.
const SLOW = 300000;
const { sameDeep } = checks(c);

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

it('an all-3-levers run is deterministic across repeated calls', async () => {
  const { h } = await optimizerWorld(ACA_CLIFF);
  const selected = h.simulate();
  const all = { includeRoth: true, includeMix: true, includeSmooth: true };
  const opt1 = h.optimizeMultiLever(selected, all);
  const opt2 = h.optimizeMultiLever(selected, all);
  sameDeep(
    { roth: entries(opt2.rothSchedule), mix: entries(opt2.mixSchedule), smooth: opt2.smoothWithdrawals },
    { roth: entries(opt1.rothSchedule), mix: entries(opt1.mixSchedule), smooth: opt1.smoothWithdrawals },
    'same joint schedule',
  );
}, SLOW);
