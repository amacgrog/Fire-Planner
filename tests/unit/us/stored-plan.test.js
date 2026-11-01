// The stored plan as a guarded candidate (Batch 5 step 4a, spec 4.3): computeCliffPlan runs `apply` on state.storedPlan.plan once,
// compares it with the automatic plan's best on the stored plan's own objective (storedPlanVerdict) and returns the winner; the
// report gains `stored`, and cliffPlanSummary describes an applied plan in use.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES } from '../helpers/scan-grid.mjs';

const c = makeCounter();
// bondYears 0: these cases are about the stored-plan verdict, not the bond reserve; with the default 5 years the maintained reserve
// (Batch 5 step 5b) moves CA's kept brackets and verdicts off the ones the cases below need, so the reserve is switched off.
const CA = { ...GAP_CASES.find((g) => g.name === 'couple 62, IRMAA (CA)').patch(100, 100), bondYears: 0 };
const NY = GAP_CASES.find((g) => g.name === 'couple 58, trad-heavy, ACA (NY)').patch(100, 100);
const TX = GAP_CASES.find((g) => g.name === 'early ACA single (TX)').patch(100, 100);
// bracket-search.test.js's household with no money but the house (450,000 against a 300,000 mortgage), retired at 48.
const BROKE = {
  ageA: 48, ageB: 43, retireAgeA: 48, retireAgeB: 43, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0,
  trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, tenure: 'own', homeValue: 450000, mortgagePrincipal: 300000, mortgage: 300000,
};
// BROKE draws on the house at 48 under every plan, so no plan can draw on it earlier: this variant (300,000 in A's 401(k),
// converting from 48 to 74, spending 30,000) keeps the 22% bracket, whose plan draws on the house a year early at 40,000.
const BROKE_TRAD = { ...BROKE, trad401kA: 300000, rothConvEnabled: true, rothConvStartAge: 48, rothConvEndAge: 74, spending: 30000 };
// CA at a spending of 150,000 keeps the 12% bracket (it does not deplete); from 190,000 the 12% plan runs out a year early (from
// 200,000 since S1, the fill counting the draw).
const CA150 = { ...CA, spending: 150000 };
// CA at a spending of 140,000 (the lifetimeCost case below): a bracket that costs less and is worth less than the kept one.
const CA140 = { ...CA, spending: 140000 };

// A saved plan envelope (it passes isValidStoredPlan).
const stored = (plan, objective = 'endValue') => ({ v: 1, plan, objective, mult: null, madeFor: 'test', taxYear: 2026, summary: { gain: 0, success: { hist: [null, null], mc: [null, null] } } });
const late = (x) => (x === null ? Infinity : x);
const keptOf = (report) => report.brackets.find((b) => b.bracket === report.keptBracket);
const STORED_KEYS = ['used', 'reason', 'depletedAge', 'homeDrawAge', 'value', 'cost', 'bracketHonoured', 'converts'];

// A fresh world with the bracket search on or off; `run(patch, opts)` sets the state and plans it (asserting a set stored plan
// survived the guard).
async function setup({ searchOff = false } = {}) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = searchOff;
  const store = await w.load('shared/core/store.js');
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const run = async (patch, opts) => {
    await w.setState(patch);
    if (patch.storedPlan) c.expect(store.state.storedPlan !== null).toBe(true);
    return computeCliffPlan(await w.ctx(), opts);
  };
  return { w, store, run, makePlan, P: await usPlan(w) };
}

it('storedPlanVerdict: depletion, then the home draw, then the score beyond max($1, 0.1% of the stored score)', async () => {
  const w = await world();
  const { storedPlanVerdict: v } = await w.load('us/core/cliff-plan/solver.js');
  const at = (depletedAge, homeDrawAge, score) => ({ depletedAge, homeDrawAge, score });
  c.expect(v(at(89, null, 9e9), at(90, null, 0))).toBe('depletes');
  c.expect(v(at(90, null, 9e9), at(null, null, 0))).toBe('depletes'); // null: never, the latest
  c.expect(v(at(95, 70, 9e9), at(90, 80, 0))).toBe('home'); // an earlier home draw loses, even depleting later
  c.expect(v(at(null, 80, 9e9), at(null, null, 0))).toBe('home');
  c.expect(v(at(91, null, 0), at(90, null, 9e9))).toBe('better');
  c.expect(v(at(90, 85, 0), at(90, 80, 9e9))).toBe('better');
  c.expect(v(at(90, null, 0), at(90, 80, 9e9))).toBe('better');
  // the threshold is 0.1% of the stored plan's score: 1000 of 1,000,000
  c.expect(v(at(null, null, 1000000), at(null, null, 1001000))).toBe('tie');
  c.expect(v(at(null, null, 1000000), at(null, null, 1001000.01))).toBe('score');
  c.expect(v(at(null, null, 1001001), at(null, null, 1000000))).toBe('tie'); // 0.1% of 1,001,001 is 1001.001
  c.expect(v(at(null, null, 1001001.01), at(null, null, 1000000))).toBe('better');
  c.expect(v(at(null, null, 1000000), at(null, null, 999000))).toBe('tie');
  c.expect(v(at(null, null, 1000000), at(null, null, 998999.99))).toBe('better');
  // the $1 floor, and negative (lifetimeCost) scores
  c.expect(v(at(null, null, 100), at(null, null, 101))).toBe('tie');
  c.expect(v(at(null, null, 100), at(null, null, 101.01))).toBe('score');
  c.expect(v(at(null, null, -100000), at(null, null, -99900))).toBe('tie');
  c.expect(v(at(null, null, -100000), at(null, null, -99899.99))).toBe('score');
  c.expect(v(at(null, null, 0), at(null, null, 0))).toBe('tie');
});

it('the automatic plan stored as is: a tie, used, the very stored plan returned; the other report fields are the automatic plan', async () => {
  for (const patch of [CA, NY]) {
    const { store, run } = await setup();
    const first = await run(patch);
    const again = await run({ ...patch, storedPlan: stored(first.plan) });
    const s = again.report.stored;
    c.expect(Object.keys(s)).toStrictEqual(STORED_KEYS);
    c.expect([s.used, s.reason, s.bracketHonoured]).toStrictEqual([true, 'tie', true]);
    c.expect(again.plan).toStrictEqual(first.plan);
    c.expect(again.plan).toBe(store.state.storedPlan.plan);
    const { stored: _s, ...rest } = again.report;
    c.expect(rest).toStrictEqual(first.report);
    // the apply run of the automatic plan measures as the kept candidate
    const kept = keptOf(first.report);
    c.expect([s.depletedAge, s.homeDrawAge, s.value, s.cost]).toStrictEqual([kept.depletedAge, kept.homeDrawAge, kept.value, kept.cost]);
  }
});

it('no stored plan: no `stored` key in the report', async () => {
  const { run } = await setup();
  const out = await run(CA);
  c.expect(Object.prototype.hasOwnProperty.call(out.report, 'stored')).toBe(false);
});

// TX: in the `choose` trace, a year whose best candidate other than the winner meets its line (ok: true) lost the year on its
// score; the automatic intents with that year's intent replaced by it (the natural draw: the intent removed) lose on the whole
// plan's score, and the store's own run is the automatic plan's.
it("score: the automatic intents with a year's runner-up (TX) lose on the score; the planForState run is the automatic plan", async () => {
  const { store, run, makePlan, P } = await setup({ searchOff: true });
  const auto = await run(TX);
  c.expect(auto.plan.family).toBe('all');
  const ID = { 'Medicaid line': 'medicaid', 'ACA credit floor (100%)': 'acaFloor', 'ACA 400% line': 'aca400' };
  const trace = P.planTrace();
  let found = null;
  // the trace's year is the projection year: Partner A's age is ageA + year
  for (const t of trace) {
    if (!t.candidates || t.candidates.length < 2) continue;
    const winner = t.intent,
      isWinner = (x) => (x.kind === 'none' ? winner === null : winner !== null && winner.kind === x.kind && ID[x.label] === winner.line);
    let runnerUp = null;
    for (const x of t.candidates) if (x.ok && !isWinner(x) && (x.kind === 'none' || x.label in ID) && (runnerUp === null || x.score > runnerUp.score)) runnerUp = x;
    if (runnerUp === null) continue;
    const age = store.state.ageA + t.year,
      intents = { ...auto.plan.intents };
    if (runnerUp.kind === 'none') delete intents[age];
    else intents[age] = { kind: runnerUp.kind, line: ID[runnerUp.label], ret: 'H' };
    found = { age, plan: makePlan({ intents, family: Object.keys(intents).length ? 'all' : 'none', bracket: auto.plan.bracket, bracketFrom: auto.plan.bracketFrom }) };
    break;
  }
  c.expect(found !== null).toBe(true);
  c.expect(found.plan.intents).not.toStrictEqual(auto.plan.intents);
  const out = await run({ ...TX, storedPlan: stored(found.plan) });
  const s = out.report.stored,
    kept = keptOf(auto.report);
  c.expect([s.used, s.reason]).toStrictEqual([false, 'score']);
  c.expect([s.depletedAge, s.homeDrawAge]).toStrictEqual([kept.depletedAge, kept.homeDrawAge]);
  c.expect(kept.value - s.value > Math.max(1, 0.001 * Math.abs(s.value))).toBe(true);
  c.expect(out.plan).toStrictEqual(auto.plan);
  // the store's own run (planForState plans the state with its stored plan) is the automatic plan's apply run
  const storeRows = P.runPlanMode({ planMode: undefined }).rows;
  const autoRows = P.runPlanMode({ planMode: 'apply', plan: auto.plan }).rows;
  c.expect(storeRows).toStrictEqual(autoRows);
  const storedRows = P.runPlanMode({ planMode: 'apply', plan: found.plan }).rows;
  c.expect(storeRows).not.toStrictEqual(storedRows);
});

// The CA plan stored, then the spending raised (literal tries) until the stored plan depletes earlier than the re-planned one.
it('depletes: the CA plan stored, then a spending at which it runs out earlier than the re-planned automatic plan', async () => {
  const { run } = await setup();
  const first = await run(CA150);
  c.expect(first.plan.bracket).toBe(12);
  let hit = null;
  for (const spending of [150000, 160000, 170000, 180000, 190000, 200000]) {
    const out = await run({ ...CA, spending, storedPlan: stored(first.plan) });
    if (out.report.stored.reason === 'depletes') {
      hit = { spending, out };
      break;
    }
  }
  c.expect(hit !== null).toBe(true);
  const { out } = hit;
  const kept = keptOf(out.report);
  c.expect(out.report.stored.used).toBe(false);
  // the stored plan runs out, and the re-planned plan lasts at least a year longer
  c.expect(out.report.stored.depletedAge !== null && late(kept.depletedAge) >= out.report.stored.depletedAge + 1).toBe(true);
  c.expect(out.plan.bracket).toBe(out.report.keptBracket);
});

it('home: the same with a BROKE household (it first draws on the house earlier than the re-planned plan)', async () => {
  const { run } = await setup();
  const first = await run(BROKE_TRAD);
  c.expect(first.plan.bracket).toBe(22);
  let hit = null;
  for (const spending of [35000, 40000, 45000, 50000, 60000]) {
    const out = await run({ ...BROKE_TRAD, spending, storedPlan: stored(first.plan) });
    if (out.report.stored.reason === 'home') {
      hit = { spending, out };
      break;
    }
  }
  c.expect(hit !== null).toBe(true);
  const { out } = hit;
  const kept = keptOf(out.report);
  c.expect(out.report.stored.used).toBe(false);
  // the same depletion, and the stored plan draws on the house (earlier than the re-planned plan, which may never)
  c.expect(out.report.stored.homeDrawAge !== null).toBe(true);
  c.expect(late(out.report.stored.depletedAge)).toBe(late(kept.depletedAge));
  c.expect(late(out.report.stored.homeDrawAge) < late(kept.homeDrawAge)).toBe(true);
});

// CA140's searched brackets: one that costs less over the lifetime and is worth less at the end than the kept (end-value) one.
it('lifetimeCost: a stored plan costing less and worth less than the automatic plan is better on its own objective', async () => {
  const { run, makePlan } = await setup();
  const first = await run(CA140);
  const kept = keptOf(first.report);
  const cheap = first.report.brackets.find((b) => b.depletedAge === kept.depletedAge && b.homeDrawAge === kept.homeDrawAge && b.cost < kept.cost - Math.max(1, 0.001 * kept.cost) && b.value < kept.value);
  c.expect(cheap !== undefined).toBe(true);
  const plan = makePlan({ intents: {}, family: 'none', bracket: cheap.bracket, bracketFrom: 22 });
  const byCost = await run({ ...CA140, storedPlan: stored(plan, 'lifetimeCost') });
  c.expect([byCost.report.stored.used, byCost.report.stored.reason]).toStrictEqual([true, 'better']);
  c.expect(byCost.plan).toStrictEqual(plan);
  c.expect([byCost.report.stored.value, byCost.report.stored.cost]).toStrictEqual([cheap.value, cheap.cost]);
  // on endValue the same plan loses
  const byValue = await run({ ...CA140, storedPlan: stored(plan, 'endValue') });
  c.expect([byValue.report.stored.used, byValue.report.stored.reason]).toStrictEqual([false, 'score']);
});

// A plan made for 22% runs at the setting once the setting moved (apply honours plan.bracket only while bracketFrom is the
// setting): 24% made for 22%, at 12%, loses on the score to CA's automatic 24% plan; 12% made for 22%, at 24%, runs as the
// automatic 24% plan, ties and is used, with no bracket clause in its summary.
it('the bracket setting changed after Apply: the plan converts at the new setting, the verdict decides, no bracket clause', async () => {
  const { run, makePlan, P, w } = await setup();
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  const cases = [
    [24, 12, 'score'],
    [12, 24, 'tie'],
  ];
  for (const [bracket, setting, reason] of cases) {
    const plan = makePlan({ intents: {}, family: 'none', bracket, bracketFrom: 22 });
    const auto = await run({ ...CA, rothConvBracket: setting });
    const out = await run({ ...CA, rothConvBracket: setting, storedPlan: stored(plan) });
    const s = out.report.stored;
    c.expect([s.bracketHonoured, s.reason, s.used]).toStrictEqual([false, reason, reason === 'tie']);
    const asStored = P.runPlanMode({ planMode: 'apply', plan, endValue: true });
    const atSetting = P.runPlanMode({ planMode: 'apply', plan: makePlan({ intents: {}, family: 'none', bracket: setting, bracketFrom: setting }), endValue: true });
    c.expect(asStored.rows).toStrictEqual(atSetting.rows);
    c.expect([s.value, s.depletedAge]).toStrictEqual([atSetting.value, atSetting.depletedAge]);
    if (s.used) {
      c.expect(out.plan).toBe(plan);
      const text = cliffPlanSummary(out.plan, out.report);
      c.expect(text.startsWith('Applied plan: ')).toBe(true);
      c.expect(text.includes('Conversions:')).toBe(false);
    } else c.expect(out.plan).toStrictEqual(auto.plan);
  }
});

it("the tax year changed: the comparison still runs, repriced under that year's law (staleness is display only)", async () => {
  const { w, run } = await setup();
  const { storedPlanVerdict } = await w.load('us/core/cliff-plan/solver.js');
  const first = await run(CA);
  const at2026 = (await run({ ...CA, storedPlan: stored(first.plan) })).report.stored;
  w.setTaxYear(2027);
  const out = await run({ ...CA, storedPlan: stored(first.plan) });
  const s = out.report.stored,
    kept = keptOf(out.report);
  c.expect(Object.keys(s)).toStrictEqual(STORED_KEYS);
  // the same plan, repriced: its end value under 2027's law is not its 2026 value
  c.expect(s.value !== at2026.value).toBe(true);
  // the verdict is the one the two 2027 measures imply (endValue: the score is the value)
  c.expect(s.reason).toBe(storedPlanVerdict({ depletedAge: s.depletedAge, homeDrawAge: s.homeDrawAge, score: s.value }, { depletedAge: kept.depletedAge, homeDrawAge: kept.homeDrawAge, score: kept.value }));
  c.expect(s.used).toBe(s.reason === 'better' || s.reason === 'tie');
});

// report.stored.converts (finding 2 of the second review): conversions on with a conversion age of Partner A inside the plan.
// With the ladder off, or its ages all before the plan starts, a used plan made for the setting at another bracket prints no
// bracket clause; with the ladder on it does.
it('converts: no bracket clause for a used applied plan when conversions do not apply', async () => {
  const { w, run, makePlan } = await setup();
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  const cases = [
    [{ rothConvEnabled: false }, false],
    [{ rothConvStartAge: 40, rothConvEndAge: 50 }, false],
    [{}, true],
  ];
  for (const [patch, converts] of cases) {
    const ins = { ...CA, ...patch };
    const auto = await run(ins);
    // the automatic plan at a bracket other than the setting, made for the setting (the off runs ignore the bracket)
    const other = auto.plan.bracket === 24 ? 32 : 24;
    const plan = converts ? auto.plan : makePlan({ ...auto.plan, bracket: other, bracketFrom: 22 });
    c.expect(plan.bracket !== plan.bracketFrom && plan.bracketFrom === 22).toBe(true);
    const out = await run({ ...ins, storedPlan: stored(plan) });
    const s = out.report.stored;
    c.expect([s.used, s.bracketHonoured, s.converts]).toStrictEqual([true, true, converts]);
    const text = cliffPlanSummary(out.plan, out.report);
    c.expect(text.startsWith('Applied plan: ')).toBe(true);
    c.expect(text.endsWith(` Conversions: the applied plan uses the ${plan.bracket}% bracket.`)).toBe(converts);
  }
  // a synthetic report: converts false drops the clause the same report prints with converts true
  const p24 = makePlan({ intents: {}, family: 'none', bracket: 24, bracketFrom: 22 });
  const rep = (cv) => ({ stored: { used: true, bracketHonoured: true, converts: cv } });
  c.expect(cliffPlanSummary(p24, rep(true))).toBe('Applied plan: no steering. Conversions: the applied plan uses the 24% bracket.');
  c.expect(cliffPlanSummary(p24, rep(false))).toBe('Applied plan: no steering.');
});

it('guard off with a stored plan: { plan: null, report: null }', async () => {
  const { run } = await setup();
  const first = await run(CA);
  c.expect(await run({ ...CA, cliffGuardEnabled: false, storedPlan: stored(first.plan) })).toStrictEqual({ plan: null, report: null });
});

it('cliffPlanSummary: a used stored plan reads "Applied plan:" with no "not used"; the bracket clause only when honoured and moved', async () => {
  const { w, run } = await setup();
  const { cliffPlanSummary } = await w.load('us/core/cliff-plan/planning.js');
  const first = await run(NY);
  c.expect(Object.keys(first.plan.intents).length > 0).toBe(true);
  const out = await run({ ...NY, storedPlan: stored(first.plan) });
  c.expect(out.report.stored.used).toBe(true);
  const text = cliffPlanSummary(out.plan, out.report);
  c.expect(text.startsWith('Applied plan: ')).toBe(true);
  c.expect(text.includes('not used')).toBe(false);
  // the same clauses as the automatic plan's line
  const auto = cliffPlanSummary(first.plan, { ...first.report, candidates: [] });
  c.expect(text.split(' Conversions:')[0]).toBe(auto.replace(/^Cliff plan: /, 'Applied plan: ').split(' Conversions:')[0]);
  // synthetic reports: the bracket clause
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const intents = { 60: { kind: 'under', line: 'aca400', ret: 'H' } };
  const p24 = makePlan({ intents, family: 'all', bracket: 24, bracketFrom: 22 });
  const rep = (honoured) => ({ candidates: [{ family: 'none' }, { family: 'aca' }, { family: 'irmaa' }, { family: 'all' }], kept: 'aca', brackets: [{}, {}], keptBracket: 22, searched: true, stored: { used: true, reason: 'tie', depletedAge: null, homeDrawAge: null, value: 0, cost: 0, bracketHonoured: honoured, converts: true } });
  c.expect(cliffPlanSummary(p24, rep(true))).toBe('Applied plan: stay under the ACA 400% line at 60. Conversions: the applied plan uses the 24% bracket.');
  c.expect(cliffPlanSummary(p24, rep(false))).toBe('Applied plan: stay under the ACA 400% line at 60.');
  const p22 = makePlan({ intents, family: 'all', bracket: 22, bracketFrom: 22 });
  c.expect(cliffPlanSummary(p22, rep(true))).toBe('Applied plan: stay under the ACA 400% line at 60.');
  c.expect(cliffPlanSummary(makePlan({ intents: {}, family: 'none', bracket: 24, bracketFrom: 22 }), rep(true))).toBe('Applied plan: no steering. Conversions: the applied plan uses the 24% bracket.');
  // a stored plan not used: the automatic plan's line, as today
  const lost = { ...rep(true), stored: { ...rep(true).stored, used: false, reason: 'score' } };
  c.expect(cliffPlanSummary(p22, lost)).toBe(cliffPlanSummary(p22, { ...lost, stored: undefined }));
  c.expect(cliffPlanSummary(p22, lost).startsWith('Cliff plan: ')).toBe(true);
});

// Batch 5 step 5b piece 3 (spec B0.4, Review Focus 5): a saved v1 plan from before `conv` loads with `conv: null` and every other
// field as saved; a well-formed `conv` survives; a malformed one drops the stored plan, not the state, and so does an empty map
// (Fable M-1: an empty `conv` is null, as for `orders` and `splits`).
it('the stored plan with conv: a legacy v1 plan migrates, a valid conv survives, a malformed conv drops the plan', async () => {
  const w = await world();
  const store = await w.load('shared/core/store.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const base = makePlan({ intents: { 60: { kind: 'under', line: 'aca400', ret: 'H' } }, family: 'all', bracket: 22, bracketFrom: 22 });
  const legacyPlan = { ...base };
  delete legacyPlan.conv;
  const legacy = stored(legacyPlan);
  await w.setState({ ...CA, storedPlan: legacy });
  const got = store.state.storedPlan;
  c.expect(got.plan.conv).toBe(null);
  const { conv, ...rest } = got.plan;
  c.expect(rest).toStrictEqual(legacyPlan);
  c.expect({ ...got, plan: null }).toStrictEqual({ ...legacy, plan: null });
  c.expect('conv' in legacyPlan).toBe(false);
  const good = stored(makePlan({ ...base, conv: { 62: 'b12', 63: 'none', 64: { id: 'irmaa1', ret: 'H', side: 'under' } } }));
  await w.setState({ ...CA, storedPlan: good });
  c.expect(store.state.storedPlan).toBe(good);
  for (const conv of [{ 62: 'b11' }, { 62: { id: 'senior', ret: 'H', side: 'under' } }, { 62: { id: 'irmaa1', side: 'under', ret: 'H' } }, { x: 'none' }, {}]) {
    await w.setState({ ...CA, storedPlan: stored(makePlan({ ...base, conv })) });
    c.expect(store.state.storedPlan).toBe(null);
    c.expect(store.state.spending).toBe(CA.spending);
  }
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // run() ticks one check per stored-plan run, and the depletes case now needs one more try (190,000, not 180,000): 116 + 1;
  // the conv case (Batch 5 step 5b piece 3) adds 13, and its empty map (revision 2, M-1) 2; S1 (the fill counts the draw) moves the
  // depletes case one more try, to 200,000 (the stored 12% plan runs out at 96 against the re-planned plan's 97): 133.
  expect(c.total).toBe(133);
});
