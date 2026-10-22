// Employer-plan and IRA contribution limits (E1a). Task 2: the PLAN_LIMITS table and allocatePlanRoom, with tests that
// pin today's contribution math (no number change). Spec: docs/superpowers/specs/2026-10-08-e1a-plan-contribution-limits-design.md.
// Converted from tests/contribution_limits.js (Playwright); the old script executed 48 near and assert checks (page-error
// check excluded), this file asserts the same 48 (NEW_COUNT tracks them). Each it block sets up its own world, state and tax year.
// Two checks changed their route, not their input: the legacy-save checks run the raw save through normalizeState (what the
// page's loader did) with w.setState, and the MCP bound checks read the registry entry's bounds from fields.js (a ui/ module)
// through tests/unit/helpers/markup.js and call the core mcpAccepts.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usContributions } from '../helpers/us-contributions.js';
import { usNumberFieldEntry } from '../helpers/markup.js';

const NEW_COUNT = 48;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// Every failing check is reported, not only the first (expect.soft), and each one counts once.
const near = (a, b, tol, msg) => {
  c.tick();
  expect.soft(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`).toBe(true);
};
const check = (cond, msg) => {
  c.tick();
  expect.soft(cond, msg).toBe(true);
};
const same = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toBe(b);
};
const deep = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toStrictEqual(b);
};

async function setup() {
  const w = await world();
  const state = await w.setState();
  w.setTaxYear(2026);
  const hooks = await usContributions(w);
  const e = await engine(w);
  const rc = (patch, args) =>
    hooks.retirementContributions(patch, { wageB: 0, ageB: null, singlePerson: true, limitFactor: 1, matchA: 0, matchB: 0, ...args });
  return { w, state, hooks, e, rc };
}

const P0 = {
  k401Type: 'traditional', iraType: 'roth', k401PctA: 100, catchupPctA: 100, iraPctA: 0,
  megaBackdoor: true, megaPctA: 100, matchA: 0,
};

it('the plan limits: deferral, mega backdoor, indexing, IRA, pay below the limit', async () => {
  const { rc } = await setup();
  // Under 50, no catch-up: deferral 24,500, then the mega-backdoor fills the 72,000 annual-additions limit.
  let r = rc(P0, { wageA: 200000, age: 40 });
  same(r.acct.trad[1], 24500, 'deferral');
  same(r.acct.roth[1], 47500, 'mega-backdoor room');
  // Indexing: every limit scales with limitFactor.
  r = rc(P0, { wageA: 200000, age: 40, limitFactor: 1.1 });
  near(r.acct.trad[1], 26950, 1e-9, 'indexed deferral');
  near(r.acct.roth[1], 52250, 1e-9, 'indexed mega room');
  // IRA limit, with and without the age-50 catch-up.
  const ira = { ...P0, iraPctA: 100, megaBackdoor: false };
  r = rc(ira, { wageA: 200000, age: 55 });
  same(r.acct.roth[0], 8600, 'IRA at 55');
  r = rc(ira, { wageA: 200000, age: 40 });
  same(r.acct.roth[0], 7500, 'IRA at 40');
  // Pay below the deferral limit.
  r = rc({ ...P0, megaBackdoor: false }, { wageA: 20000, age: 40 });
  same(r.acct.trad[1], 20000, 'pay below the limit');
});

it('the limit math and profit sharing (Task 3)', async () => {
  const { rc } = await setup();
  // Catch-up outside the annual-additions limit (spec 2.1). At 55, pay 200,000: deferral 24,500 (traditional); catch-up
  // 8,000, Roth because pay 200,000 > 150,000; room 72,000 - 24,500 = 47,500, all mega backdoor. Roth 401(k)
  // 8,000 + 47,500 = 55,500 (before the fix the catch-up used the room: 72,000 - 32,500 = 39,500, Roth 47,500).
  let r = rc(P0, { wageA: 200000, age: 55 });
  same(r.acct.trad[1], 24500, 'catch-up: deferral');
  same(r.acct.roth[1], 55500, 'catch-up: Roth catch-up 8,000 + mega 47,500');
  // At 61: catch-up 11,250 (ages 60-63), mega 47,500: 58,750.
  r = rc(P0, { wageA: 200000, age: 61 });
  same(r.acct.roth[1], 58750, 'catch-up at 61: 11,250 + 47,500');
  // Compensation limit: pay 500,000 counts as 360,000; profit sharing 10% = 36,000, under the room 72,000.
  const comp = { ...P0, k401PctA: 0, megaBackdoor: false, profitSharingPctA: 10 };
  r = rc(comp, { wageA: 500000, age: 40 });
  same(r.profitA, 36000, 'compensation limit: profit sharing');
  same(r.acct.trad[1], 36000, 'compensation limit: profit sharing in the traditional 401(k)');
  // The match the same way: 10% of 360,000.
  r = rc({ ...comp, matchA: 10, profitSharingPctA: 0 }, { wageA: 500000, age: 40 });
  same(r.matchA, 36000, 'compensation limit: match');
  // Order: pay 300,000, deferral 24,500, room 47,500; match 6% = 18,000; profit sharing min(25% = 75,000, 29,500) =
  // 29,500; mega 0. 401(k) A traditional 24,500 + 18,000 + 29,500 = 72,000.
  r = rc({ ...P0, matchA: 6, profitSharingPctA: 25 }, { wageA: 300000, age: 40 });
  same(r.matchA, 18000, 'order: match');
  same(r.profitA, 29500, 'order: profit sharing cut to the room');
  same(r.acct.roth[1], 0, 'order: no mega backdoor room');
  same(r.acct.trad[1], 72000, 'order: 401(k) A traditional');
  same(r.employerContrib, 47500, 'order: employer total');
  // Match cut to the room (100% of pay): pay 20,000, deferral 20,000 fills it, room 0, match 50% -> 0.
  r = rc({ ...P0, megaBackdoor: false, matchA: 50 }, { wageA: 20000, age: 40 });
  same(r.matchA, 0, '100% of pay: match');
  same(r.acct.trad[1], 20000, '100% of pay: deferral only');
  // Indexing: compensation limit 396,000 x 10% = 39,600 (room 79,200).
  r = rc(comp, { wageA: 1000000, age: 40, limitFactor: 1.1 });
  near(r.profitA, 39600, 1e-9, 'indexed compensation limit');
  // Retired (no pay): nothing, whatever the percentages.
  r = rc({ ...P0, matchA: 6, profitSharingPctA: 10 }, { wageA: 0, age: 66 });
  deep([r.matchA, r.profitA, r.acct.roth[1], r.acct.trad[1]], [0, 0, 0, 0], 'retired');
  // Single-person mode: B gets nothing.
  r = rc(
    { ...P0, matchB: 6, profitSharingPctB: 10, k401PctB: 100 },
    { wageA: 100000, age: 40, wageB: 0, ageB: null, singlePerson: true },
  );
  deep([r.matchB, r.profitB, r.acct.trad[3], r.acct.roth[3]], [0, 0, 0, 0], 'single: B');
});

it('engine: profit sharing is untaxed employer money (Review Focus 4)', async () => {
  const { state, e } = await setup();
  // Profit sharing is untaxed employer money in the traditional 401(k) A. Pay 150,000 x 10% = 15,000 in year 0; tax, wages
  // and MAGI unchanged.
  const run = (ps) => {
    const saved = JSON.parse(JSON.stringify(state));
    Object.assign(state, { singlePerson: true, ageA: 40, retireAgeA: 60, incomeA: 150000, bondYears: 0, profitSharingPctA: ps });
    try {
      const rows = JSON.parse(JSON.stringify(e.simulate(60).rows));
      const trace = e.accountTrace();
      return structuredClone({ row: rows[0], trace: trace[0] });
    } finally {
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, saved);
    }
  };
  const e0 = run(0), e10 = run(10);
  for (const f of ['tax', 'wages', 'magiProxy'])
    check(Object.is(e0.row[f], e10.row[f]), `engine: ${f} unchanged (${e0.row[f]} vs ${e10.row[f]})`);
  near(e10.trace.trad[1] - e0.trace.trad[1], 15000, 0.01, 'engine: 401(k) A higher by the profit sharing');
  check(Object.is(e0.trace.trad[0], e10.trace.trad[0]), 'engine: IRA A unchanged');
});

it('legacy saves: profit sharing clamped 0 to 25, income above the old slider cap kept', async () => {
  // The raw save goes through normalizeState, as the page's loader did.
  const loadSaved = async (raw) => {
    const w = await world();
    const st = await w.setState(raw);
    return { a: st.profitSharingPctA, b: st.profitSharingPctB, incomeA: st.incomeA };
  };
  let sv = await loadSaved({ profitSharingPctA: 'x', profitSharingPctB: 400 });
  deep([sv.a, sv.b], [0, 25], 'legacy: profit sharing junk');
  sv = await loadSaved({ profitSharingPctA: -5 });
  deep([sv.a, sv.b], [0, 0], 'legacy: profit sharing negative');
  sv = await loadSaved({ incomeA: 500000 });
  same(sv.incomeA, 500000, 'legacy: income above the old slider cap');
});

it('the employee money never exceeds pay (Task 5)', async () => {
  const { rc } = await setup();
  // Pay 40,000 at 55: deferral 24,500 (traditional); catch-up min(40,000 - 24,500, 8,000) = 8,000 (traditional, pay under
  // 150,000); room 40,000 - 24,500 = 15,500; employee money left 40,000 - 24,500 - 8,000 = 7,500, so mega 7,500
  // (before the cap 15,500: 24,500 + 8,000 + 15,500 = 48,000 of 40,000 pay). 401(k) traditional 24,500 + 8,000 = 32,500.
  let r = rc(P0, { wageA: 40000, age: 55 });
  same(r.acct.trad[1], 32500, 'pay cap: traditional 401(k)');
  same(r.acct.roth[1], 7500, 'pay cap: mega limited to pay less deferral and catch-up');
  // With a 10% match: match 4,000 (room 15,500 -> 11,500 left); mega min(11,500, 7,500) = 7,500; traditional 32,500 + 4,000.
  r = rc({ ...P0, matchA: 10 }, { wageA: 40000, age: 55 });
  same(r.matchA, 4000, 'pay cap + match: match');
  same(r.acct.roth[1], 7500, 'pay cap + match: mega');
  same(r.acct.trad[1], 36500, 'pay cap + match: traditional');
  // The cap does not bind when the room is smaller: match 30% = 12,000 (room 15,500 -> 3,500); mega min(3,500, 7,500).
  r = rc({ ...P0, matchA: 30 }, { wageA: 40000, age: 55 });
  same(r.acct.roth[1], 3500, 'room smaller than the pay cap');
});

it('MCP bounds: profit sharing strictly 0 to 25, the match unbounded', async () => {
  const w = await world();
  const { mcpAccepts } = await w.load('us/core/seam-mcpAccepts.js');
  const acc = (k, v) => mcpAccepts(usNumberFieldEntry(k), v);
  same(acc('profitSharingPctA', 26), false, 'mcp: 26 rejected');
  same(acc('profitSharingPctA', -1), false, 'mcp: -1 rejected');
  same(acc('profitSharingPctA', 25), true, 'mcp: 25 accepted');
  same(acc('profitSharingPctA', 0), true, 'mcp: 0 accepted');
  same(acc('matchA', 5000), true, 'mcp: match unbounded');
});

it('allocatePlanRoom', async () => {
  const { hooks } = await setup();
  const alloc = (room, amounts) => hooks.allocatePlanRoom(room, amounts);
  deep(alloc(100, [30, 50, 40]), { out: [30, 50, 20], left: 0 }, 'allocate 100 over [30, 50, 40]');
  deep(alloc(100, [30, 20]), { out: [30, 20], left: 50 }, 'allocate 100 over [30, 20]');
  deep(alloc(0, [10]), { out: [0], left: 0 }, 'allocate 0');
  deep(alloc(-5, [10]), { out: [0], left: 0 }, 'allocate -5');
  deep(alloc(50, [-10, 20]), { out: [0, 20], left: 30 }, 'allocate with a negative amount');
  // Canada-shaped list: an employer DPSP contribution and a group-RRSP match ahead of the employee's RRSP in one yearly
  // room; nothing in the allocator is US-specific.
  deep(alloc(33810, [10000, 5000, 25000]), { out: [10000, 5000, 18810], left: 0 }, 'Canada-shaped list');
});
