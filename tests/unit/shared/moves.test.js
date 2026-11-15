// The moves: the retirement shift range and bisection, the cut-spending delta, the outcome and ranking, a move's verdict
// against the card's verdict after Try, guardrail-judged moves, and the US own-plan context factory.
import { it, expect, inject, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const EXPECTED = 70;

const MOVES = 'shared/core/analysis/moves.js';
const PV = 'shared/core/analysis/projection-verdict.js';
const ROOM = 'shared/core/analysis/spending-room.js';
const isUS = inject('country') === 'us';
const usIt = isUS ? it : it.skip;
const PLANNING = 'us/core/cliff-plan/planning.js';
const STORE_CTX = isUS ? 'us/core/projection/store-context.js' : 'canada/core/projection/store-context.js';
const NORMALIZE = isUS ? 'us/ui/inputs/normalize-state.js' : 'canada/core/inputs/normalize-state.js';
// The Short default and the lever each country tests there.
const SHORT = isUS ? 78000 : 76000;
const LEVER = isUS ? { rothConvEnabled: true } : { meltdownEnabled: true };
// The default household with guardrails on at a spending whose deepest cut is above 10% and below the 50% floor (found by
// stepping from 60000 in $2,000 steps: US 60000-62000 sit at 50%, 64000 cuts 40%; Canada 60000 cuts 34%).
const GUARD_SPENDING = isUS ? 64000 : 60000;

async function setup(patch) {
  const w = await world();
  const state = await w.setState(patch);
  if (isUS) (await w.load(PLANNING)).refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  return { w, state, ctxFor };
}
const strip = ({ runs, selected, ...rest }) => rest;

it('retire-later range', async () => {
  const w = await world();
  const m = await w.load(MOVES);
  const { drainSteps } = await w.load(ROOM);
  c.expect(m.retireShiftRange(await w.setState({}))).toStrictEqual({ lo: -7, hi: 15 });
  c.expect(m.retireShiftRange(await w.setState({ retireAgeA: 49 }))).toStrictEqual({ lo: -1, hi: 15 });
  c.expect(m.retireShiftRange(await w.setState({ retireAgeA: 65, retireAgeB: 60 }))).toStrictEqual({ lo: -10, hi: 5 });
  // a single person: Partner B's ages (B already past retirement, B at the cap) are ignored
  const single = await w.setState({ singlePerson: true, ageB: 60, retireAgeB: 70 });
  c.expect(single.retireAgeB).toBe(70);
  c.expect(m.retireShiftRange(single)).toStrictEqual({ lo: -7, hi: 15 });
  c.expect(m.retireShift(single, 3)).toStrictEqual({ retireAgeA: 58, retireAgeB: 70 });
  const couple = await w.setState({});
  c.expect(m.retireShift(couple, -2)).toStrictEqual({ retireAgeA: 53, retireAgeB: 53 });
  // at the age-70 cap: no later age, no move (and no run)
  const late = await w.setState({ retireAgeA: 70 });
  c.expect(m.retireShiftRange(late).hi).toBe(0);
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const gen = m.retireLaterSteps(late, ctxFor, 'short');
  const r = gen.next();
  c.expect(r.done).toBe(true);
  c.expect(r.value).toBe(null);
  c.expect(drainSteps(m.retireLaterSteps(couple, ctxFor, 'comfortable'))).toBe(null);
});

it('firstTrueSteps bisects', async () => {
  const w = await world();
  const { firstTrueSteps } = await w.load(MOVES);
  const { drainSteps } = await w.load(ROOM);
  const run = (known, pass) => {
    const tested = [];
    const test = function* (k) {
      tested.push(k);
      yield 'run';
      return pass(k);
    };
    return { k: drainSteps(firstTrueSteps(1, 15, known, test)), tested };
  };
  c.expect(run(new Map(), (k) => k >= 6)).toStrictEqual({ k: 6, tested: [8, 4, 6, 5] });
  c.expect(run(new Map(), (k) => k >= 99)).toStrictEqual({ k: null, tested: [8, 12, 14, 15] });
  const known = run(new Map([[6, true]]), (k) => k >= 6);
  c.expect(known.k).toBe(6);
  c.expect(known.tested.every((k) => k < 6)).toBe(true);
  c.expect(known.tested).toStrictEqual([3, 4, 5]);
  // the base at k = 0 is outside [1, 15]: it narrows nothing
  c.expect(run(new Map([[0, false]]), (k) => k >= 1)).toStrictEqual({ k: 1, tested: [8, 4, 2, 1] });
});

it('cutSpendingDelta', async () => {
  const w = await world();
  const { cutSpendingDelta } = await w.load(MOVES);
  const { displayRoom } = await w.load(ROOM);
  c.expect(cutSpendingDelta({ word: 'short', room: -5700, shown: -6000, shareBase: 70000, guardrails: false, unfixable: false })).toBe(-6000);
  const tight = { word: 'tight', room: 3000, shown: 3000, shareBase: 60000, guardrails: false, unfixable: false };
  c.expect(displayRoom(6000)).toBe(6000);
  c.expect(displayRoom(5500)).toBe(5000);
  c.expect(cutSpendingDelta(tight)).toBe(-3000);
  c.expect(cutSpendingDelta({ ...tight, guardrails: true, cutPct: 20 })).toBe(null);
  c.expect(cutSpendingDelta({ word: 'short', room: -90000, shown: -90000, shareBase: 70000, guardrails: false, unfixable: true })).toBe(null);
});

it('moveOutcome and rankMoves', async () => {
  const w = await world();
  const { moveOutcome, rankMoves, MOVE_RULES } = await w.load(MOVES);
  c.expect(MOVE_RULES).toStrictEqual({ maxShown: 4, maxDelay: 15, fallbackDelay: 5, minGain: 500, maxRetireAge: 70 });
  c.expect(Object.isFrozen(MOVE_RULES)).toBe(true);
  const short = { word: 'short', room: -6000, guardrails: false, cutPct: 0 };
  c.expect(moveOutcome(short, { word: 'tight', room: 2000, guardrails: false, cutPct: 0 })).toStrictEqual({ fixes: true, gain: 8000 });
  c.expect(moveOutcome(short, { word: 'short', room: -2500, guardrails: false, cutPct: 0 })).toStrictEqual({ fixes: false, gain: 3500 });
  // a Short base fixed by guardrails: the units differ, no gain
  c.expect(moveOutcome(short, { word: 'tight', room: 0, guardrails: true, cutPct: 30 })).toStrictEqual({ fixes: true, gain: 0 });
  const tight = { word: 'tight', room: 3000, guardrails: false, cutPct: 0 };
  c.expect(moveOutcome(tight, { word: 'tight', room: 5000, guardrails: false, cutPct: 0 })).toStrictEqual({ fixes: false, gain: 2000 });
  c.expect(moveOutcome(tight, { word: 'comfortable', room: 9000, guardrails: false, cutPct: 0 }).fixes).toBe(true);
  const guarded = { word: 'tight', room: 0, guardrails: true, cutPct: 40 };
  c.expect(moveOutcome(guarded, { word: 'tight', room: 0, guardrails: true, cutPct: 28 })).toStrictEqual({ fixes: false, gain: 12 });

  const mv = (key, fixes, gain, verdict) => ({ key, label: key, patch: {}, verdict, fixes, gain });
  const room = (r) => ({ word: 'tight', room: r, guardrails: false, cutPct: 0 });
  const g400 = mv('g400', false, 400, room(-5600)),
    g500 = mv('g500', false, 500, room(-5500)),
    g999 = mv('g999', false, 999, room(-5001));
  c.expect(rankMoves([g400, g500])).toStrictEqual([g500]);
  c.expect(rankMoves([g999])).toStrictEqual([g999]);
  const fixA = mv('a', true, 8000, room(2000)),
    fixB = mv('b', true, 15000, room(9000)),
    guard = mv('guardrails', true, 0, { word: 'tight', room: 0, guardrails: true, cutPct: 30 }),
    restE = mv('e', false, 3000, room(-3000)),
    restD = mv('d', false, 500, room(-5500));
  const input = [guard, restD, fixA, restE, g400, fixB];
  c.expect(rankMoves(input)).toStrictEqual([fixB, fixA, guard, restE]);
  c.expect(input.map((x) => x.key)).toStrictEqual(['guardrails', 'd', 'a', 'e', 'g400', 'b']);
  c.expect(rankMoves([restD, restE, g500])).toStrictEqual([restE, restD, g500]);
  // the guardrails move is dropped unless it fixes; ties keep the input order
  c.expect(rankMoves([mv('guardrails', false, 9000, room(3000)), restD])).toStrictEqual([restD]);
  const tie1 = mv('t1', true, 1, room(4000)),
    tie2 = mv('t2', true, 1, room(4000));
  c.expect(rankMoves([tie1, tie2])).toStrictEqual([tie1, tie2]);
  // guardrail-judged moves: a cut gain counts from 1 point; fixers by cut ascending
  const cut = (p) => ({ word: 'tight', room: 0, guardrails: true, cutPct: p });
  const cut1 = mv('c1', false, 1, cut(39)),
    cut0 = mv('c0', false, 0, cut(40)),
    fix20 = mv('f20', true, 30, cut(10)),
    fix5 = mv('f5', true, 35, cut(5));
  c.expect(rankMoves([cut0, cut1, fix20, fix5])).toStrictEqual([fix5, fix20, cut1]);
});

it("a move's verdict is the verdict of its inputs", async () => {
  const cases = [];
  {
    const { w, state } = await setup({ spending: SHORT });
    const m = await w.load(MOVES);
    const { projectionVerdict } = await w.load(PV);
    const { ownPlanContextFor } = await w.load(STORE_CTX);
    const { normalizeState } = await w.load(NORMALIZE);
    const { cloneState } = await w.load('shared/core/analysis/scenario-helpers.js');
    for (const patch of [LEVER, m.retireShift(state, 2)]) {
      const v = normalizeState({ ...cloneState(state), ...patch });
      cases.push({ v, got: strip(projectionVerdict(v, ownPlanContextFor(v))) });
    }
  }
  for (const { v, got } of cases) {
    const { w, state, ctxFor } = await setup(v);
    const { projectionVerdict } = await w.load(PV);
    c.expect(got).toStrictEqual(strip(projectionVerdict(state, ctxFor)));
  }
  // the retire-later move at k = 2 changes the verdict (it is not the Short base's)
  c.expect(cases[1].got.room === cases[0].got.room && cases[1].got.word === 'short').toBe(false);
});

it('guardrails: moves judged by the cut', async () => {
  const { w, state, ctxFor } = await setup({ guardrailsEnabled: true, spending: GUARD_SPENDING });
  const m = await w.load(MOVES);
  const { projectionVerdict } = await w.load(PV);
  const { ownPlanContextFor } = await w.load(STORE_CTX);
  const base = projectionVerdict(state, ctxFor);
  c.expect(base.guardrails).toBe(true);
  c.expect(base.word).toBe('tight');
  c.expect(base.cutPct > 10 && base.cutPct < 50).toBe(true);
  c.expect(m.cutSpendingDelta(base)).toBe(null);
  const v = { ...state, ...m.retireShift(state, 2) };
  const move = projectionVerdict(v, ownPlanContextFor(v));
  c.expect(move.guardrails).toBe(true);
  const out = m.moveOutcome(base, move);
  c.expect(out.gain).toBe(base.cutPct - move.cutPct);
  c.expect(out.gain > 0).toBe(true);
});

it('the move levers', async () => {
  const w = await world();
  const { MOVE_LEVERS } = await w.load(isUS ? 'us/core/seam-MOVE_LEVERS.js' : 'canada/core/seam-MOVE_LEVERS.js');
  c.expect(Object.isFrozen(MOVE_LEVERS)).toBe(true);
  const rows = MOVE_LEVERS.map(({ key, field, label }) => ({ key, field, label }));
  c.expect(rows).toStrictEqual(
    isUS
      ? [
          { key: 'conversions', field: 'rothConvEnabled', label: 'Turn on Roth conversions' },
          { key: 'order', field: 'withdrawalMixEnabled', label: 'Turn on the tax-aware withdrawal order' },
          { key: 'guardrails', field: 'guardrailsEnabled', label: 'Turn on guardrails' },
        ]
      : [
          { key: 'meltdown', field: 'meltdownEnabled', label: 'Turn on the RRSP meltdown' },
          { key: 'split', field: 'pensionSplitEnabled', label: 'Turn on pension income splitting' },
          { key: 'guardrails', field: 'guardrailsEnabled', label: 'Turn on guardrails' },
        ],
  );
  const offered = (s) => MOVE_LEVERS.filter((l) => l.when(s)).map((l) => l.key);
  c.expect(offered(await w.setState({}))).toStrictEqual(isUS ? ['conversions', 'order', 'guardrails'] : ['meltdown', 'split', 'guardrails']);
  c.expect(offered(await w.setState(isUS ? { cliffGuardEnabled: false, guardrailsEnabled: true } : { singlePerson: true, guardrailsEnabled: true })))
    .toStrictEqual(isUS ? ['conversions'] : ['meltdown']);
  c.expect(offered(await w.setState(isUS ? { rothConvEnabled: true, withdrawalMixEnabled: true } : { meltdownEnabled: true, pensionSplitEnabled: true })))
    .toStrictEqual(['guardrails']);
});

usIt('own plan in the US', async () => {
  let p, v;
  {
    const { w, state } = await setup({});
    const planning = await w.load(PLANNING);
    const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
    const { ownPlanContextFor } = await w.load('us/core/seam-ownPlanContextFor.js');
    const stateComputes = cliffPlanStore.stateComputes,
      cacheSize = planning.cliffPlanCache.size,
      computes = planning.ownPlanComputes();
    c.expect(cliffPlanStore.plan === null).toBe(false);
    c.expect(ownPlanContextFor(state)(state).plan).toBe(cliffPlanStore.plan);
    // an equal copy of the state gets the kept (searched) plan by its key
    c.expect(ownPlanContextFor({ ...state })({ ...state }).plan).toBe(cliffPlanStore.plan);
    c.expect(planning.ownPlanComputes()).toBe(computes);
    v = { ...state, rothConvEnabled: true };
    const ctx = ownPlanContextFor(v)(v);
    p = ctx.plan;
    c.expect(ctx.planMode).toBe('apply');
    c.expect(p === cliffPlanStore.plan).toBe(false);
    c.expect(planning.ownPlanComputes()).toBe(computes + 1);
    // every variant holds the one plan
    c.expect(ownPlanContextFor(v)({ ...v, spending: 50000 }).plan).toBe(p);
    c.expect(planning.ownPlanComputes()).toBe(computes + 1);
    c.expect(ownPlanContextFor({ ...state, rothConvEnabled: true })(v).plan).toBe(p);
    c.expect(planning.ownPlanComputes()).toBe(computes + 1);
    c.expect(cliffPlanStore.stateComputes).toBe(stateComputes);
    c.expect(planning.cliffPlanCache.size).toBe(cacheSize);
    // the guard off: no plan, nothing planned
    const off = { ...state, cliffGuardEnabled: false };
    c.expect(ownPlanContextFor(off)(off).planMode).toBe('off');
    c.expect(planning.ownPlanComputes()).toBe(computes + 1);
  }
  const { w } = await setup(v);
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  c.expect(cliffPlanStore.plan).toStrictEqual(p);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(EXPECTED);
});
