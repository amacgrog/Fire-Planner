// The schedule-why plan, revision 2 (R2-2): the card-only row field `convZeroBy` says why a window year that nothing held converts
// under $1: 'full', the bracket fill F is under conversion + 1 (the complement of S4's held test, so no room is left in the bracket),
// decided with no new fill call (the plain / fill path, and the stay-under branch's own capped call at x = 1; never at an amount-map
// age); 'locked', nothing convertible while a balance beyond the RMD is held by the 72(t) lock (the owner, 2026-11-03: "Name the
// 72(t)"); or 'empty', nothing convertible otherwise (the balance gone). No engine path reads it. Pinned values are kinds and
// age sets measured on the tree (2026-11-03, Node 24; Node 22, CI's, not available locally), never engine doubles.
// The boundary F in [1, c + 1): no household reaches it. A scratch scan (2026-11-03) of the fixture, the gap households at 100 and
// the 768 converting scan-grid households in both withdrawal modes gave 1,050 'full' rows, every one converting $0 with an uncapped
// fill F under $1, so the interval [1, c + 1) is empty for each (c = 0). The suite pins the complement instead: every 'full' row's
// fill capped at conversion + 1 falls short of it (the held test's negation), and a held row's reaches it. (A controller ruling,
// 2026-11-03: the boundary stays explained here, with no test.)
// A missed stay-under year (a phased 'under' year with no cliffChoice, which the stay-under branch's 'full' gives a reason) is not
// reached either: magiStats.planMissed is 0 over the same scan and over the 541 snapshot scenarios, so no household found can miss one.
import { it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, scanHouseholds } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const FIXTURE = JSON.parse(fs.readFileSync(new URL('../../fixtures/dana-and-chris.json', import.meta.url), 'utf8'));
const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
// the scan grid's two-return couple at 52 (401(k) 250k + 250k, taxable 300k, spending 60k, conversions on), by its elections
const SPLIT_COUPLE = (elections) => scanHouseholds({ conversions: true }).find((h) => h.name === `couple, two single returns; age 52; 401(k) 250k A + 250k B; taxable 300k; spending 60k; elections ${elections}; conversions on`).patch;

// One standard run of `ctx` with its trace (as conv-held-by.test.js runs it); `hist` a year-row function runs the historical mode.
async function run(w, ctx, hist = null) {
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE, BUCKET_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource, historicalYearSource } = await w.load('shared/core/projection/year-sources.js');
  const trace = [];
  const source = hist ? historicalYearSource(ctx.inputs, hist, ctx.taxFactors) : standardYearSource(ctx.inputs);
  const sim = runProjection(ctx, { mode: hist ? BUCKET_MODE : STANDARD_MODE, source, retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB, trace });
  return { sim, trace };
}
const zeroMap = (rows) => Object.fromEntries(rows.filter((r) => 'convZeroBy' in r).map((r) => [r.age, r.convZeroBy]));
const both = (rows) => rows.filter((r) => 'convZeroBy' in r && 'convHeldBy' in r).map((r) => r.age);
// the bracket fill of a traced year capped at `cap`, with the kept pass's inputs (the held test's call)
async function fillAt(w, ctx, t, age, cap) {
  const { solveRothConversionTop, convBracketFor } = await w.load('us/core/withdrawals/roth-conversion.js');
  return solveRothConversionTop(ctx, t.profile, cap, t.year, convBracketFor(ctx, age), t.estTrad);
}
// the window rows under $1 whose schedule why is the fallback (R2-3 step 7)
async function fallbacks(w, ctx, rows) {
  const { scheduleWhy } = await w.load('us/ui/results/roth-optimizer.js');
  const s = ctx.inputs, bracket = ctx.plan && ctx.plan.bracket != null && ctx.plan.bracketFrom === s.rothConvBracket ? ctx.plan.bracket : s.rothConvBracket;
  return rows.filter((r) => r.age >= s.rothConvStartAge && r.age <= s.rothConvEndAge && r.conversionAmount < 1 && scheduleWhy(r, bracket, 'the cliff plan') === 'No conversion').map((r) => r.age);
}

it("'full': the fixture's window years with no room in the 10% bracket", async () => {
  const w = await world();
  await w.setState(FIXTURE.state);
  const ctx = await w.ctx({ withPlan: true });
  const { sim, trace } = await run(w, ctx);
  // 60-61 (over the line, the 10% fill 0), 62-63 (stayed under, the fill 0: the stay-under branch's own call), 67 (below its cap)
  c.expect(zeroMap(sim.rows)).toStrictEqual({ 60: 'full', 61: 'full', 62: 'full', 63: 'full', 67: 'full' });
  c.expect(both(sim.rows)).toStrictEqual([]);
  // the complement of the held test: each 'full' year's fill capped at conversion + 1 falls short of it
  const short = {};
  for (const age of [60, 61, 62, 63, 67]) {
    const i = sim.rows.findIndex((r) => r.age === age), x = sim.rows[i].conversionAmount + 1;
    short[age] = (await fillAt(w, ctx, trace[i], age, x)) < x;
  }
  c.expect(short).toStrictEqual({ 60: true, 61: true, 62: true, 63: true, 67: true });
  // and a held year's reaches it (64, the plan's stay-under: capped at $1)
  const i64 = sim.rows.findIndex((r) => r.age === 64);
  c.expect(await fillAt(w, ctx, trace[i64], 64, 1)).toBe(1);
  // every window year under $1 has a reason
  c.expect(await fallbacks(w, ctx, sim.rows)).toStrictEqual([]);
});

it("'empty': the balance gone (no 72(t) lock)", async () => {
  const w = await world();
  // conv-held-by.test.js's 'balance' single: $30,000 traditional converted by 63, nothing left 64-75
  await w.setState({ ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 75, acaEnabled: false, tradIraA: 30000, taxable: 500000, spending: 40000, ssMonthlyA: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 75, rothConvBracket: 22, cliffGuardEnabled: false });
  const ctx = await w.ctx({ withPlan: true });
  const { sim, trace } = await run(w, ctx);
  c.expect(zeroMap(sim.rows)).toStrictEqual({ 64: 'empty', 65: 'empty', 66: 'empty', 67: 'empty', 68: 'empty', 69: 'empty', 70: 'empty', 71: 'empty', 72: 'empty', 73: 'empty', 74: 'empty', 75: 'empty' });
  // the held years (60-63, the balance) carry no convZeroBy
  c.expect(both(sim.rows)).toStrictEqual([]);
  // premise: under $1 converted and nothing convertible in those years (the trace's convertible balance: the growth on the
  // converted remainder, $0.13 at 64, then less, then 0)
  const nothing = Object.fromEntries(sim.rows.map((r, i) => [r.age, r.conversionAmount < 1 && trace[i].convertible < 1]).filter(([a]) => a >= 64));
  c.expect(nothing).toStrictEqual(Object.fromEntries([64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75].map((a) => [a, true])));
});

it("'locked': the 72(t) lock takes the whole balance; 'empty' once the balance is gone", async () => {
  const w = await world();
  // the scan grid's single person at 52 (401(k) 500k, taxable 300k, spending 60k, the 72(t) election, conversions on; found by the
  // scratch scan): a 72(t) series locks the account, so with $500,000+ in it nothing is convertible ('locked', the owner's "Name the
  // 72(t)", 2026-11-03)
  await w.setState(scanHouseholds({ conversions: true }).find((h) => h.name === 'single person; age 52; 401(k) 500k A; taxable 300k; spending 60k; elections sepp; conversions on').patch);
  const ctx = await w.ctx({ withPlan: true });
  const { sim, trace } = await run(w, ctx);
  // 52-59 (the series runs to 59 1/2): 'locked' with more than $500,000 in the account; 60-61 convert, 62 the balance; 63-72 the
  // balance gone, no lock: 'empty'
  const zm = zeroMap(sim.rows);
  const window = Object.fromEntries(Object.entries(zm).filter(([a]) => a >= 52 && a <= 72));
  c.expect(window).toStrictEqual({ ...Object.fromEntries([52, 53, 54, 55, 56, 57, 58, 59].map((a) => [a, 'locked'])), ...Object.fromEntries([63, 64, 65, 66, 67, 68, 69, 70, 71, 72].map((a) => [a, 'empty'])) });
  const premise = Object.fromEntries(sim.rows.map((r, i) => [r.age, [r.conversionAmount, trace[i].convertible, trace[i].tradPool > 500000]]).filter(([a]) => a <= 59));
  c.expect(premise).toStrictEqual(Object.fromEntries([52, 53, 54, 55, 56, 57, 58, 59].map((a) => [a, [0, 0, true]])));
  c.expect(await fallbacks(w, ctx, sim.rows)).toStrictEqual([]);
});

it('a held year never has convZeroBy; a sized year that carried its target is never full', async () => {
  const w = await world();
  await w.setState(GAP_CASES.find((g) => g.name === 'couple 58, trad-heavy, ACA (NY)').patch(100, 100));
  const ctx = await w.ctx({ withPlan: true });
  c.expect(ctx.plan.conv).toStrictEqual({ 58: 'b10', 66: 'none', 68: 'none', 69: 'none', 73: 'none' }); // premise (conv-held-by.test.js)
  const { sim } = await run(w, ctx);
  c.expect(both(sim.rows)).toStrictEqual([]);
  // the sized years (58 carries 'b10', the 'none' years carry no conversion): none is 'full'
  c.expect([58, 66, 68, 69, 73].filter((a) => sim.rows.find((r) => r.age === a).convZeroBy === 'full')).toStrictEqual([]);
  c.expect(await fallbacks(w, ctx, sim.rows)).toStrictEqual([]);
});

it("a convFell year can be 'full'", async () => {
  const w = await world();
  await w.setState(SPLIT_COUPLE('sepp'));
  const ctx = await w.ctx({ withPlan: true });
  const { sim, trace } = await run(w, ctx);
  const i = sim.rows.findIndex((r) => r.age === 60), row = sim.rows[i];
  // found by the scratch scan: a sized year whose target was not reachable converts the plain fill under the ceiling, here $0
  c.expect(row.convChoice).toBe('the bracket conversion (target not reachable this year)');
  c.expect(row.conversionAmount).toBe(0);
  c.expect(row.convZeroBy).toBe('full');
  c.expect((await fillAt(w, ctx, trace[i], 60, 1)) < 1).toBe(true);
});

it("a pinned 0% bracket is never 'full'", async () => {
  const w = await world();
  await w.setState(FIXTURE.state);
  const store = await w.load('shared/core/store.js');
  const { optimizerState } = await w.load('us/core/optimizer-state.js');
  const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
  const s = store.state, pin = new Map();
  for (let a = s.rothConvStartAge; a <= s.rothConvEndAge; a++) pin.set(a, 0);
  const ctx = stateContextFor()({ ...s }, { rothBracketByAge: pin, withdrawalMixByAge: optimizerState.withdrawalMixByAge });
  const { sim } = await run(w, ctx);
  c.expect(Object.values(zeroMap(sim.rows)).includes('full')).toBe(false);
  c.expect(sim.rows.every((r) => r.conversionAmount === 0)).toBe(true); // premise: the 0% pin converts nothing
});

it("a forced or cap pick's year (the replay check on) keeps its kind", async () => {
  const w = await world();
  const { testHooks, assignReplayCheck } = await w.load('us/core/test-hooks.js');
  assignReplayCheck(true);
  await w.setState(SPLIT_COUPLE('none'));
  const ctx = await w.ctx({ withPlan: true });
  c.expect(ctx.test.replayCheck).toBe(true);
  const { sim, trace } = await run(w, ctx);
  // 62 ends on a picked pass (found by the scratch scan) and is 'full'
  const i = sim.rows.findIndex((r) => r.age === 62);
  c.expect(trace[i].picked >= 0).toBe(true);
  c.expect(sim.rows[i].convZeroBy).toBe('full');
  c.expect(testHooks.replayMismatch).toBe(0);
  c.expect(both(sim.rows)).toStrictEqual([]);
  // the same run with the check off gives the same rows
  const w2 = await world();
  await w2.setState(SPLIT_COUPLE('none'));
  const again = await run(w2, await w2.ctx({ withPlan: true }));
  c.expect(again.sim.rows).toStrictEqual(sim.rows);
});

it('the historical mode decides the kinds too', async () => {
  const w = await world();
  await w.setState(FIXTURE.state);
  const ctx = await w.ctx({ withPlan: true, taxFactors: [] });
  const flat = (y) => [1970 + y, 0, 0, 0];
  const { sim } = await run(w, ctx, flat);
  const zm = zeroMap(sim.rows);
  // the flat path gives the standard run's kinds and ages (60-61 over the line, 62-63 stayed under, 67 below its cap)
  c.expect(zm).toStrictEqual({ 60: 'full', 61: 'full', 62: 'full', 63: 'full', 67: 'full' });
  c.expect(both(sim.rows)).toStrictEqual([]);
  c.expect(await fallbacks(w, ctx, sim.rows)).toStrictEqual([]);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // full 5, empty 3, the 72(t) lock 3, held / sized 4, convFell 4, 0% pin 2, picked 6, historical 3
  expect(c.total).toBe(30);
});
