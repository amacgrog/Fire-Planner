// The multi-lever optimizer with two levers: Roth and mix together are never worse than either alone, in the ACA-cliff
// scenario. Converted from test_multi_lever_optimizer.js (Playwright), which executed 31 checks (the page-error checks
// excluded): multi-lever-optimizer, -mix, -combined and -determinism.test.js assert 30 of them, split by run time so
// Vitest's forks run them in parallel; the wall-clock check ("under 15s") stays in the root script
// test_optimizer_ui.js. Each it block gets its own world (tests/unit/helpers/multi-lever.js), as each old block got a
// fresh page; the hooks re-plan the cliff plan first, as the window hooks do (usOptimizer, tests/unit/helpers/us-
// plan.js).
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { ACA_CLIFF, checks, optimizerWorld } from '../helpers/multi-lever.js';

const NEW_COUNT = 2;
const c = makeCounter();
// A full-budget optimizer run takes tens of seconds, more when every file runs at once: past the 60 s default.
const SLOW = 300000;
const { check } = checks(c);

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

it('roth+mix together is never worse than either lever alone', async () => {
  const { h } = await optimizerWorld(ACA_CLIFF);
  const selected = h.simulate();
  const mixOnly = h.optimizeMultiLever(selected, { includeMix: true }, 'lifetimeCost');
  const rothOnly = h.optimizeMultiLever(selected, { includeRoth: true }, 'lifetimeCost');
  const both = h.optimizeMultiLever(selected, { includeRoth: true, includeMix: true }, 'lifetimeCost');
  check(both.value <= mixOnly.value + 1, `both ${both.value} vs mix ${mixOnly.value}`);
  check(both.value <= rothOnly.value + 1, `both ${both.value} vs roth ${rothOnly.value}`);
}, SLOW);
