// Historical-engine parity with the standard engine (Batch 1 of docs/next-batches-plan.md), Canada half. See
// tests/unit/helpers/historical-parity.js for the scenarios and the comparison.
// Converted from tests/historical_parity.js (Playwright), which ran both planners: the old script executed 44 checks
// (5 assert calls of the US source check, and 39 inline guard evaluations: one parity verdict per scenario, 20, one
// ladder-vacuity guard per pre-retirement scenario, 6, one empty-plan guard per US scenario, 13; the page-error asserts
// are excluded). The suite is split per planner: this Canada file asserts 10 (7 verdicts and 3 vacuity guards), the US
// file 34. NEW_COUNT follows the scenario list, so it moves only if a scenario is added.
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { SCENARIOS, runParity } from '../helpers/historical-parity.js';

const NEW_COUNT = 10;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

it.each(SCENARIOS.Canada)('[$group] Canada $name', async (sc) => {
  await runParity(false, sc, c);
});
