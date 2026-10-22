// Gradual bond-reserve refill in the historical / Monte Carlo engine and the pre-retirement ladder (Canada).
//
// Rules (owner decision, docs/next-batches-plan.md "Batch 1 notes"): surplus cash refills the reserve uncapped
// (routeSurplus); moving stocks into bonds (refillBondReserve, up years) is capped at one year of that year's expenses
// (net of lump) per year, from traditional first, then Roth, then taxable last as a real sale; home equity and cash are
// never a source. Part 1 unit-tests refillBondReserve, part 2 runs the engine on a constant path, part 3 covers
// rotateIntoBondLadder.
// Converted from the Canada half of tests/bond_refill.js (Playwright, which ran one body against both planners; the
// other half is tests/unit/us/bond-refill.test.js). The old script executed 110 assert checks for this planner (page-error
// check excluded); NEW_COUNT is the same. The case bodies are shared in tests/unit/helpers/bond-refill.js. Each it block
// gets its own world and, for the US, the 2026 tax year.
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { bondRefillCases } from '../helpers/bond-refill.js';

const NEW_COUNT = 110;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const cases = bondRefillCases(false, c);

it('refillBondReserve: cap, order, taxable last resort, nothing else touched', cases.unit);
it('engine: the refill respects the one-year cap, the surplus path fills the whole target', cases.engineCases);
it('rotateIntoBondLadder: ramp, spill, taxable last resort', cases.ladderUnit);
