// The per-year Roth conversion optimizer (optimizeRothLadderPerYear, src/us/core/optimizer/multi-lever.js): cyclic
// coordinate ascent over ROTH_PER_YEAR_CANDIDATES per year of the ladder window, from several starts. Converted from
// test_roth_optimizer_per_year.js (Playwright); the old script executed 11 checks (the page-error checks excluded), this
// file asserts 8 of them. The comparison with the flat optimizer's starred row (a click on its card) and the two wall-clock
// checks ("under 5s") stay in the root script test_optimizer_ui.js. Each it block gets its own world, the 2026 tax year and
// the default state, as each old block got a fresh page; the hooks (re-planning the cliff plan first, as the window hooks
// do) come from usOptimizer in tests/unit/helpers/us-plan.js, the world from tests/unit/helpers/multi-lever.js. The search
// runs on 'lifetimeCost' (the old cost's choices: these check the search mechanics).
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { checks, entries, optimizerWorld } from '../helpers/multi-lever.js';

const NEW_COUNT = 8;
const c = makeCounter();
const { check, sameDeep } = checks(c);

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// The old setupRoth: the ladder on over [start, end] at a bracket, with ACA on.
const roth = ({ start, end, bracket = 22, aca = true }, patch = {}) => ({
  ...patch, rothConvEnabled: true, rothConvStartAge: start, rothConvEndAge: end, rothConvBracket: bracket, ...(aca ? { acaEnabled: true } : null),
});

// The same cyclic-coordinate-ascent pattern the optimizer uses (fix the other coordinates, sweep this one's candidates,
// keep strict improvements, repeat until a pass changes nothing), on a 2-variable trap: cost(0,0)=1, cost(1,0)=2,
// cost(0,1)=2, cost(1,1)=0. From (0,0) no single move improves, so one start is stuck at 1; a start at (1,1), the trap's
// analog of the "max" start, finds 0. This checks the technique, not the engine.
function coordinateAscentTrap(costFn, candidates, dims, start) {
  const schedule = start.slice();
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let d = 0; d < dims; d++) {
      let best = { v: schedule[d], cost: costFn(schedule) };
      for (const cand of candidates) {
        if (cand === schedule[d]) continue;
        const trial = schedule.slice(); trial[d] = cand;
        const cost = costFn(trial);
        if (cost < best.cost) best = { v: cand, cost };
      }
      if (best.v !== schedule[d]) { schedule[d] = best.v; changed = true; }
    }
    if (!changed) break;
  }
  return { schedule, cost: costFn(schedule) };
}

it('trap: one start gets stuck at the local optimum, several starts escape it', () => {
  const cost = ([a, b]) => ({ '0,0': 1, '1,0': 2, '0,1': 2, '1,1': 0 })[`${a},${b}`];
  const singleStart = coordinateAscentTrap(cost, [0, 1], 2, [0, 0]);
  check(singleStart.cost === 1, 'single start stuck at the local optimum: ' + JSON.stringify(singleStart));
  const starts = [[0, 0], [1, 1], [1, 0]].map((s) => coordinateAscentTrap(cost, [0, 1], 2, s));
  const multiBest = starts.reduce((a, b) => (b.cost < a.cost ? b : a));
  check(multiBest.cost === 0, 'multi-start finds the global optimum: ' + JSON.stringify(multiBest));
});

// The strongest check, on the real engine: 3 years x 7 candidates = 343 runs, every schedule, against the optimizer's answer.
it('3-year window: the optimizer matches the brute-force global optimum (within $1)', async () => {
  const { w, h } = await optimizerWorld(roth({ start: 60, end: 62 }));
  const { ROTH_PER_YEAR_CANDIDATES: candidates } = await w.load('us/core/optimizer/roth-schedule.js');
  const selected = h.simulate();
  const opt = h.optimizeRothLadderPerYear(selected, 'lifetimeCost');
  const years = opt.activeYears;
  let bestCost = Infinity, bestSchedule = null;
  const notWorse = (d) => (selected.depletedAge ? !d || d >= selected.depletedAge : !d);
  for (const c0 of candidates) for (const c1 of candidates) for (const c2 of candidates) {
    const schedule = new Map([[years[0], c0], [years[1], c1], [years[2], c2]]);
    h.setRothOverride(schedule);
    const sim = h.simulate();
    h.setRothOverride(null);
    const cost = -h.objectiveScore('lifetimeCost', sim);
    if (notWorse(sim.depletedAge) && cost < bestCost) { bestCost = cost; bestSchedule = entries(schedule); }
  }
  check(Math.abs(opt.value - bestCost) < 1,
    JSON.stringify({ optCost: opt.value, bruteCost: bestCost, optSchedule: entries(opt.schedule), bruteSchedule: bestSchedule }));
});

// A stressed plan (early retirement, modest assets) more likely to deplete, so the guardrail has something to bind against.
it('guardrail: the recommended schedule never depletes earlier than the current plan', async () => {
  const { h } = await optimizerWorld(roth({ start: 50, end: 58 }, { retireAgeA: 50 }));
  const selected = h.simulate();
  const opt = h.optimizeRothLadderPerYear(selected, 'lifetimeCost');
  const ok = selected.depletedAge ? !opt.depletedAge || opt.depletedAge >= selected.depletedAge : true;
  check(ok, `selected depletes at ${selected.depletedAge}, optimized at ${opt.depletedAge}`);
});

it('deterministic: re-running on identical inputs gives the identical schedule', async () => {
  const { h } = await optimizerWorld(roth({ start: 58, end: 66 }));
  const selected = h.simulate();
  const opt1 = h.optimizeRothLadderPerYear(selected, 'lifetimeCost');
  const opt2 = h.optimizeRothLadderPerYear(selected, 'lifetimeCost');
  sameDeep(entries(opt2.schedule), entries(opt1.schedule), 'same schedule');
});

it('a 20-year window does not exhaust the eval budget', async () => {
  const { h } = await optimizerWorld(roth({ start: 55, end: 74 }));
  const opt = h.optimizeRothLadderPerYear(h.simulate(), 'lifetimeCost');
  check(!opt.budgetExhausted, `evalCount ${opt.evalCount}, budgetExhausted ${opt.budgetExhausted}`);
});

it('edge case: an empty (inverted) window returns with no years to optimize', async () => {
  const { h } = await optimizerWorld(roth({ start: 65, end: 64 }));
  const opt = h.optimizeRothLadderPerYear(h.simulate(), 'lifetimeCost');
  check(opt.activeYears.length === 0, 'activeYears: ' + JSON.stringify(opt.activeYears));
});

it('edge case: a 46-year window truncates to the 30-year cap', async () => {
  const { h } = await optimizerWorld(roth({ start: 45, end: 90 }));
  const opt = h.optimizeRothLadderPerYear(h.simulate(), 'lifetimeCost');
  check(opt.activeYears.length === 30 && opt.truncated, `${opt.activeYears.length} years, truncated ${opt.truncated}`);
});
