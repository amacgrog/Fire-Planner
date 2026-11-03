// S4 Task 10 (rulings 1-5): the card-only row fields. `convHeldBy` names the limit that held a window year's conversion below the
// bracket fill F ('aca' / 'irmaa' from the ceiling's CEIL_OUT.kind, 'stayUnder', 'sized', 'plan', 'balance'; absent when nothing
// held it), decided in the conversion block with the pass's own fill inputs; `convOverAca` (true, else absent) marks a year that
// converts at least $1 with its pre-conversion MAGI over an ACA 400% line the ceiling computed. hookStats.heldFills counts the
// held test's fill calls (one per gated pass at most). Pinned values are what the tree gives (measured 2026-11-03, Node 24; Node 22,
// CI's, not available locally: every pin here is a kind, an age set or a premise, not an engine double).
// Not reached here: the 'plan' kind (a phased fill year whose natural cap lowered the conversion): none of the households below,
// the fixture, the gap households or the card's rows has one.
import { it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES } from '../helpers/scan-grid.mjs';

const c = makeCounter();
const FIXTURE = JSON.parse(fs.readFileSync(new URL('../../fixtures/dana-and-chris.json', import.meta.url), 'utf8'));
const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
// a self stream owned by A (se-settlement-plan.test.js's)
const stream = (amount) => ({ amount, startAge: 55, endAge: 75, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });

// One standard run of `ctx` with its trace; `fills` is hookStats.heldFills for this run alone.
async function run(w, ctx) {
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { testHooks } = await w.load('us/core/test-hooks.js');
  const trace = [];
  const f0 = testHooks.heldFills;
  const sim = runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB, trace });
  return { sim, trace, fills: testHooks.heldFills - f0 };
}
// age -> convHeldBy over the rows that carry one, and the ages that carry convOverAca
const heldMap = (rows) => Object.fromEntries(rows.filter((r) => 'convHeldBy' in r).map((r) => [r.age, r.convHeldBy]));
const overAges = (rows) => rows.filter((r) => 'convOverAca' in r).map((r) => r.age);
const at = (sim, trace, age) => {
  const i = sim.rows.findIndex((r) => r.age === age);
  return { row: sim.rows[i], t: trace[i] };
};

it('the fixture: the dashboard run', async () => {
  const w = await world();
  await w.setState(FIXTURE.state);
  const ctx = await w.ctx({ withPlan: true });
  // premises (docs/next-batches-plan.md, S3 results): the plan keeps the 10% bracket for the 22% setting; run-out 95
  c.expect([ctx.planMode, ctx.plan.bracket, ctx.plan.bracketFrom]).toStrictEqual(['apply', 10, 22]);
  const { sim, trace, fills } = await run(w, ctx);
  c.expect(sim.depletedAge).toBe(95);
  // The brief expected no held year (the 10% fill 0 at 60-66). The tree gives two kinds:
  // 59: converts $20,226, exactly its room under the ACA 400% line (the kept pass's MAGI 66,488 under it), the 10% fill about
  //     $58,400: the ACA line held it;
  // 60, 61: over the line and shown (room Infinity), the 10% fill 0 (the draw alone is over the 10% top): nothing held;
  // 62, 63: stayed under the ACA line (the plan), the 10% fill 0 (draw estimates about $51,400 / $50,500): nothing held;
  // 64-66: stayed under the ACA line, the 10% fill about $3,100 / $3,800 / $3,000 (B's Social Security starts at A's 64 and the
  //     draw estimate falls to about $36,700-$39,100): the plan's stay-under held it;
  // 67: converts 0 with room $107,130 left (a plain year below its cap, the 10% fill 0): nothing held, no fill test.
  c.expect(heldMap(sim.rows)).toStrictEqual({ 59: 'aca', 64: 'stayUnder', 65: 'stayUnder', 66: 'stayUnder' });
  const row59 = at(sim, trace, 59);
  c.expect(row59.row.conversionAmount).toBe(row59.t.magiSafeRoom);
  // the only conversion (59) is under the line: no convOverAca anywhere
  c.expect(overAges(sim.rows)).toStrictEqual([]);
  // fill calls, counted per gated pass (every pass and phase of 59 and of the stay-under years 62-66), not per year: pinned
  c.expect(fills).toBe(27);
});

it("the fixture: the card's 22% row", async () => {
  const w = await world();
  await w.setState(FIXTURE.state);
  const store = await w.load('shared/core/store.js');
  const { optimizerState } = await w.load('us/core/optimizer-state.js');
  const { planForState } = await w.load('us/core/cliff-plan/planning.js');
  const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
  const s = store.state;
  const plan = planForState(s, optimizerState);
  c.expect([plan.bracket, plan.bracketFrom]).toStrictEqual([10, 22]);
  // computeRothOptimizer's pinning (src/us/ui/results/roth-optimizer.js): the plan's bracket is not the setting, so every other
  // row pins each window age to its bracket
  const pinAges = [];
  for (let a = Math.max(s.rothConvStartAge, s.ageA); a <= s.rothConvEndAge; a++) pinAges.push(a);
  const ctx = stateContextFor()({ ...s, rothConvEnabled: true, rothConvBracket: 22 }, { rothBracketByAge: new Map(pinAges.map((a) => [a, 22])), withdrawalMixByAge: optimizerState.withdrawalMixByAge });
  const { sim, trace } = await run(w, ctx);
  c.expect(sim.depletedAge).toBe(94); // the card's row (ruling 14)
  // ruling 14: 60 and 61 convert $87,579 / $80,666 with the kept passes' pre-conversion MAGI (184,814 / 204,933, the draw
  // estimate included) over the line: flagged there and nowhere else
  c.expect(overAges(sim.rows)).toStrictEqual([60, 61]);
  for (const age of [60, 61]) {
    const { row, t } = at(sim, trace, age);
    c.expect(row.conversionAmount >= 1, `${age}`).toBe(true);
    c.expect(t.preConvMagi > 88883, `${age}`).toBe(true); // over the 2026 line indexed (the lower of the two years' lines)
  }
  // the held kinds (not part of the card's over-the-line line): 59 the ACA line, 62-66 the plan's stay-under (the 22% fill is
  // positive there), 67 the IRMAA tier (A at 67 on Medicare); 60, 61 converted the whole 22% fill
  c.expect(heldMap(sim.rows)).toStrictEqual({ 59: 'aca', 62: 'stayUnder', 63: 'stayUnder', 64: 'stayUnder', 65: 'stayUnder', 66: 'stayUnder', 67: 'irmaa' });
});

it("'irmaa': a retired single person on Medicare, guard off", async () => {
  const w = await world();
  await w.setState({ ...ZERO, singlePerson: true, ageA: 66, retireAgeA: 66, lifeExpectancyA: 80, acaEnabled: false, tradIraA: 2000000, taxable: 500000, spending: 50000, ssMonthlyA: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 66, rothConvEndAge: 80, rothConvBracket: 24, cliffGuardEnabled: false });
  const { sim, trace } = await run(w, await w.ctx({ withPlan: true }));
  c.expect(Object.values(heldMap(sim.rows)).includes('irmaa')).toBe(true);
  // Hand check at 66 (year 0, no Social Security to translate): the ceiling is the first IRMAA tier's line, 109,000 single; the
  // kept pass's MAGI before the conversion is about 57,016, so the room is about 51,984, and the conversion fills it exactly. The
  // 24% fill (the 24% top 201,775 + the deduction, about 220,000) is far above it: the IRMAA tier held.
  const { row, t } = at(sim, trace, 66);
  c.expect(Math.abs(t.preConvMagi + t.magiSafeRoom - 109000) <= 1e-6).toBe(true);
  c.expect(row.conversionAmount).toBe(t.magiSafeRoom);
  c.expect(row.convHeldBy).toBe('irmaa');
  c.expect('convOverAca' in row).toBe(false); // ACA off: no line
});

// A couple 60/60 on the marketplace (ACA on, not enhanced), retired, Texas: the 2026 ACA line for two, 21,150 x 4 = 84,600.
const COUPLE = { ...ZERO, singlePerson: false, filingStatus: 'mfj', children: [], ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90, lifeExpectancyB: 90, acaEnabled: true, acaEnhanced: false, ssMonthlyA: 0, ssMonthlyB: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 70, rothConvBracket: 22 };

it("'aca', guard on: the couple under the line", async () => {
  const w = await world();
  await w.setState({ ...COUPLE, tradIraA: 300000, taxable: 400000, spending: 40000, cliffGuardEnabled: true });
  const { sim, trace } = await run(w, await w.ctx({ withPlan: true }));
  const { row, t } = at(sim, trace, 60);
  c.expect(t.preConvMagi < 84600).toBe(true); // premise: under the line before the conversion
  c.expect(Math.abs(t.preConvMagi + t.magiSafeRoom - 84599) <= 1e-6).toBe(true); // the cap: the line less $1
  c.expect(row.conversionAmount).toBe(t.magiSafeRoom);
  c.expect(row.convHeldBy).toBe('aca');
  c.expect('convOverAca' in row).toBe(false);
  // the ACA line holds every marketplace year 60-64 (the 22% plan); 65-66 convert the whole balance
  c.expect(heldMap(sim.rows)).toStrictEqual({ 60: 'aca', 61: 'aca', 62: 'aca', 63: 'aca', 64: 'aca', 65: 'balance', 66: 'balance' });
});

it("'aca', guard off (the brake): over the line, held at $0, no convOverAca", async () => {
  const w = await world();
  await w.setState({ ...COUPLE, tradIraA: 1000000, taxable: 400000, basisRatio: 0, spending: 150000, cliffGuardEnabled: false });
  const { sim, trace } = await run(w, await w.ctx({ withPlan: true }));
  const { row, t } = at(sim, trace, 60);
  c.expect(t.preConvMagi > 84600).toBe(true); // premise: over the line before the conversion
  c.expect(t.magiSafeRoom).toBe(0);
  c.expect(row.conversionAmount).toBe(0);
  c.expect(row.convHeldBy).toBe('aca'); // the 22% fill is about $243,600 there
  // no conversion of $1 or more in a year over the line: never flagged
  c.expect(overAges(sim.rows)).toStrictEqual([]);
  c.expect(heldMap(sim.rows)).toStrictEqual({ 60: 'aca', 61: 'aca', 62: 'aca', 63: 'aca', 64: 'aca', 66: 'irmaa', 67: 'balance' });
});

// The brief named the TX gap household at 100 for both kinds: its sized years (65-71) convert more than its 10% fill (0 there), so
// none reads 'sized'. The NY gap household at 100 (couple 58, trad-heavy, ACA; sizing ships on) has both in one run.
it("'sized' and 'stayUnder': the NY gap household at 100", async () => {
  const w = await world();
  await w.setState(GAP_CASES.find((g) => g.name === 'couple 58, trad-heavy, ACA (NY)').patch(100, 100));
  const ctx = await w.ctx({ withPlan: true });
  c.expect(ctx.plan.conv).toStrictEqual({ 58: 'b10', 66: 'none', 68: 'none', 69: 'none', 73: 'none' }); // premise: the kept sizing
  const { sim } = await run(w, ctx);
  // 58: the 'b10' target converts $57,000 under the 22% fill; 66, 68, 69, 73: 'none' with a positive fill; 60-62, 64: the plan
  // stayed under the ACA line; 59 the ACA line; the rest the IRMAA tier
  c.expect(heldMap(sim.rows)).toStrictEqual({
    58: 'sized', 59: 'aca', 60: 'stayUnder', 61: 'stayUnder', 62: 'stayUnder', 63: 'irmaa', 64: 'stayUnder', 65: 'irmaa', 66: 'sized',
    67: 'irmaa', 68: 'sized', 69: 'sized', 70: 'irmaa', 71: 'irmaa', 72: 'irmaa', 73: 'sized', 74: 'irmaa',
  });
  // 63 converts $64,970 over the ACA line (the plan's fill of a year already over it)
  c.expect(overAges(sim.rows)).toStrictEqual([63]);
});

it("'balance': a small traditional balance, guard off; a plain year below its cap never calls the fill", async () => {
  const w = await world();
  await w.setState({ ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 75, acaEnabled: false, tradIraA: 30000, taxable: 500000, spending: 40000, ssMonthlyA: 0, stateTax: 'tx', rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 75, rothConvBracket: 22, cliffGuardEnabled: false });
  const { sim, fills } = await run(w, await w.ctx({ withPlan: true }));
  const r60 = sim.rows.find((r) => r.age === 60);
  c.expect(r60.conversionAmount).toBe(30000);
  c.expect(r60.convHeldBy).toBe('balance');
  // The brief expected nothing left after 60. The tree gives 'balance' at 61-63 too: the year's growth on the converted balance
  // stays in the traditional account ($2,100, then $84, then $3), and each later year converts all of it; from 64 nothing is left.
  c.expect(heldMap(sim.rows)).toStrictEqual({ 60: 'balance', 61: 'balance', 62: 'balance', 63: 'balance' });
  // every window year is a plain year at the balance (no call) or has nothing to convert: no fill test
  c.expect(fills).toBe(0);
});

it('self-employed: the held kind reads the pass\'s 162(l) estimate, as a direct fill with it does', async () => {
  const w = await world();
  // single, 60, retired, a self stream of $43,000 owned by A, on the marketplace (premium 18,000), Texas, guard off
  await w.setState({ ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, acaEnhanced: false, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0, taxable: 100000, tradIraA: 600000, basisRatio: 30, spending: 50000, incomeSources: [stream(43000)], rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 70, rothConvBracket: 22, cliffGuardEnabled: false });
  const ctx = await w.ctx({ withPlan: true });
  const { solveRothConversionTop, convBracketFor } = await w.load('us/core/withdrawals/roth-conversion.js');
  const { sim, trace } = await run(w, ctx);
  const { row, t } = at(sim, trace, 60);
  c.expect(t.estSeA > 0).toBe(true); // premise: a 162(l) deduction in the held year
  c.expect(row.convHeldBy).toBe('aca');
  // the held test as the block runs it: the fill with the kept pass's estimates, capped at conversion + 1, returns its cap
  const x = row.conversionAmount + 1;
  const fill = (seA, seB) => solveRothConversionTop(ctx, { ...t.profile, seHealthA: seA, seHealthB: seB }, x, t.year, convBracketFor(ctx, 60), t.estTrad);
  c.expect(fill(t.estSeA, t.estSeB)).toBe(x);
  c.expect(heldMap(sim.rows)).toStrictEqual({ 60: 'aca', 61: 'aca', 62: 'aca', 63: 'aca', 64: 'aca', 65: 'irmaa', 66: 'irmaa', 67: 'irmaa', 68: 'irmaa', 69: 'irmaa', 70: 'irmaa' });
});

// Two returns (ruling 3): the kind is the final minimum room's, per return. A (60, on the marketplace): its 2026 line for one
// 15,650 x 4 = 62,600, room (62,599 - MAGI A) / share A. B (65, on Medicare, no marketplace): the first IRMAA tier 109,000 single
// (no Social Security), room (109,000 - MAGI B) / share B. Shares 1/2.
it('two returns: CEIL_OUT.kind from the per-return rooms', async () => {
  const w = await world();
  await w.setState({ acaEnabled: true, acaEnhanced: false, singlePerson: false, children: [] });
  const { conversionMagiCeiling, CEIL_OUT } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  const base = {
    acaEligibleA: true, acaEligibleB: false, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
    workingA: false, workingB: false, age: 60, ageB: 65, filing: 'single', year: 0, twoReturns: true, shareA: 0.5,
    profile: { ssA: 0, ssB: 0, dependents: [] },
  };
  const ceil = (preMagiA, preMagiB) => [conversionMagiCeiling(ctx, { ...base, preMagiA, preMagiB, preConvMagi: preMagiA + preMagiB }), CEIL_OUT.kind];
  // A 40,000: room (62,599 - 40,000) / 0.5 = 45,198; B 60,000: (109,000 - 60,000) / 0.5 = 98,000. A's ACA room is smaller.
  c.expect(ceil(40000, 60000)).toStrictEqual([100000 + 45198, 'aca']);
  // B 100,000: (109,000 - 100,000) / 0.5 = 18,000, smaller than A's 45,198: the IRMAA tier
  c.expect(ceil(40000, 100000)).toStrictEqual([140000 + 18000, 'irmaa']);
  // a tie, B 86,401: (109,000 - 86,401) / 0.5 = 45,198 = A's room: 'aca' (applied first)
  c.expect(ceil(40000, 86401)).toStrictEqual([126401 + 45198, 'aca']);
  // the household branch: under the line, the ACA cap (84,599 for two); over it and shown, no cap: ''
  const hh = (preConvMagi) => [conversionMagiCeiling(ctx, { ...base, twoReturns: false, acaEligibleB: true, ageB: 60, filing: 'mfj', preConvMagi }), CEIL_OUT.kind];
  c.expect(hh(50000)).toStrictEqual([84599, 'aca']);
  c.expect(hh(155000)).toStrictEqual([Infinity, '']);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // fixture 6, card 8, irmaa 5, aca guard on 6, guard off 6, NY 3, balance 4, self-employed 4, two returns 5
  expect(c.total).toBe(47);
});
