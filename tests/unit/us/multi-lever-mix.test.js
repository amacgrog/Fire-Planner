// The multi-lever optimizer's withdrawal-mix lever alone, in the ACA-cliff scenario: it finds a real improvement and is
// never worse than the smoothed-withdrawals A/B. Converted from test_multi_lever_optimizer.js (Playwright), which
// executed 31 checks (the page-error checks excluded): multi-lever-optimizer, -mix, -combined and -determinism.test.js
// assert 30 of them, split by run time so Vitest's forks run them in parallel; the wall-clock check ("under 15s") stays
// in the root script test_optimizer_ui.js. Each it block gets its own world (tests/unit/helpers/multi-lever.js), as
// each old block got a fresh page; the hooks re-plan the cliff plan first, as the window hooks do (usOptimizer,
// tests/unit/helpers/us-plan.js). The search runs on 'lifetimeCost' (the old cost's choices).
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { ACA_CLIFF, checks, entries, optimizerWorld } from '../helpers/multi-lever.js';

const NEW_COUNT = 4;
const c = makeCounter();
// A full-budget optimizer run takes tens of seconds, more when every file runs at once: past the 60 s default.
const SLOW = 300000;
const { check } = checks(c);

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

it('mix-only finds a real improvement in the ACA-cliff scenario and is never worse than doing nothing', async () => {
  const { h } = await optimizerWorld(ACA_CLIFF);
  const selected = h.simulate();
  const selectedCost = -h.objectiveScore('lifetimeCost', selected);
  const opt = h.optimizeMultiLever(selected, { includeMix: true }, 'lifetimeCost');
  const schedule = entries(opt.mixSchedule).filter(([, v]) => v !== 0);
  const msg = JSON.stringify({ selectedCost, optCost: opt.value, schedule });
  check(opt.value < selectedCost - 1, 'finds a real improvement: ' + msg);
  check(opt.value <= selectedCost + 1, 'never worse than doing nothing: ' + msg);
  check(schedule.length > 0, 'picked a non-default candidate some year: ' + msg);
}, SLOW);

it('mix-only is never worse than smooth-only (mix is a superset)', async () => {
  const { h } = await optimizerWorld(ACA_CLIFF);
  const selected = h.simulate();
  const smoothOnly = h.optimizeMultiLever(selected, { includeSmooth: true }, 'lifetimeCost');
  const mixOnly = h.optimizeMultiLever(selected, { includeMix: true }, 'lifetimeCost');
  check(mixOnly.value <= smoothOnly.value + 1, `mix ${mixOnly.value} vs smooth ${smoothOnly.value}`);
}, SLOW);
