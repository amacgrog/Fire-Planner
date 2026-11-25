// The US conversion and ACA goal answers (src/us/core/analysis/conversion-answer.js): conversions on against off with each run's
// own plan, the plan's bracket, the stripped ACA intents, the ACA answer on the early household, and the sentences.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
// 36 since bond reserve follow-ups PR B (the bracket search sizes the user's bracket too): the default plan with conversions on
// keeps the user's 22% sized (another bracket before) and converts in one year fewer, so the per-age check ticks once less (37 before).
const EXPECTED = 36;

const CA = 'us/core/analysis/conversion-answer.js';
const NORMALIZE = 'us/ui/inputs/normalize-state.js';

async function variantRuns(w, state, patchOn) {
  const { ownPlanContextFor } = await w.load('us/core/seam-ownPlanContextFor.js');
  const { normalizeState } = await w.load(NORMALIZE);
  const { cloneState } = await w.load('shared/core/analysis/scenario-helpers.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const make = (rothConvEnabled) => {
    const v = normalizeState({ ...cloneState(state), ...patchOn, rothConvEnabled });
    const ctx = ownPlanContextFor(v)(v);
    return { ctx, sim: simulateWith(ctx) };
  };
  return { on: make(true), off: make(false) };
}

it('conversion answer on the default plan', async () => {
  const w = await world();
  const state = await w.setState({});
  (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const { conversionAnswer } = await w.load(CA);
  const { US_OBJECTIVES, gainInTodaysDollars } = await w.load('us/core/optimizer/objectives.js');
  const { pricingContextFor } = await w.load('shared/core/projection/run-source.js');
  const { on, off } = await variantRuns(w, state, {});
  const a = conversionAnswer(on.ctx, on.sim, off.ctx, off.sim, 22);
  c.expect(a.gain).toBe(gainInTodaysDollars(US_OBJECTIVES.endValue, pricingContextFor(on.ctx), on.sim, off.sim));
  const plan = on.ctx.plan;
  c.expect(a.bracket).toBe(plan && plan.bracket != null && plan.bracketFrom === 22 ? plan.bracket : 22);
  c.expect(a.sized).toBe(!!(plan?.conv && Object.keys(plan.conv).length));
  c.expect(a.depletedOn).toBe(on.sim.depletedAge || null);
  c.expect(a.depletedOff).toBe(off.sim.depletedAge || null);
  const rowAt = (age) => on.sim.rows.find((r) => r.age === age);
  for (const age of a.ages) c.expect((rowAt(age).conversionGross ?? rowAt(age).conversionAmount) >= 1).toBe(true);
  c.expect(a.ages.length).toBe(on.sim.rows.filter((r) => (r.conversionGross ?? r.conversionAmount) >= 1).length);
  c.expect(a.acaHeld).toBe(on.sim.rows.filter((r) => r.convHeldBy === 'aca').length);
  // a bracket other than the setting's: the plan's bracket only when it was made for the setting
  const other = conversionAnswer(on.ctx, on.sim, off.ctx, off.sim, 99);
  c.expect(other.bracket).toBe(plan && plan.bracket != null && plan.bracketFrom === 99 ? plan.bracket : 99);
});

it('strip ACA intents', async () => {
  const w = await world();
  const { stripAcaIntents } = await w.load(CA);
  const { PLAN_KEYS, makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const plan = makePlan({
    intents: { 55: { kind: 'under', line: 'aca400', ret: 'H' }, 70: { kind: 'under', line: 'irmaa1', ret: 'H' } },
    family: 'all',
    bracket: 22,
    bracketFrom: 22,
  });
  const out = stripAcaIntents(plan);
  c.expect(Object.keys(out)).toStrictEqual([...PLAN_KEYS]);
  c.expect(out.intents).toStrictEqual({ 70: { kind: 'under', line: 'irmaa1', ret: 'H' } });
  c.expect(out.family).toBe('all');
  c.expect(out.bracket).toBe(22);
  // the plan given is not written
  c.expect(Object.keys(plan.intents)).toStrictEqual(['55', '70']);
  for (const line of ['medicaid', 'acaFloor']) {
    c.expect(stripAcaIntents(makePlan({ intents: { 50: { kind: 'under', line, ret: 'A' } } })).intents).toStrictEqual({});
  }
});

it('ACA answer on the early household', async () => {
  const w = await world();
  const state = await w.setState({ ageA: 40, ageB: 40, retireAgeA: 50, retireAgeB: 50, acaEnabled: true });
  (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const { acaAnswer, stripAcaIntents } = await w.load(CA);
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  const { ownPlanContextFor } = await w.load('us/core/seam-ownPlanContextFor.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { objectiveBreakdown } = await w.load('us/core/optimizer/objectives.js');
  const ctx = ownPlanContextFor(state)(state);
  const plan = ctx.plan;
  c.expect(plan === cliffPlanStore.plan).toBe(true);
  const sim = simulateWith(ctx);
  const { storeRunContext } = await w.load('us/core/cliff-plan/planning.js');
  const strippedCtx = storeRunContext(state, { plan: stripAcaIntents(plan), planMode: 'apply' });
  const strippedSim = simulateWith(strippedCtx);
  const a = acaAnswer(ctx, sim, strippedSim);
  const aca = Object.keys(plan.intents)
    .filter((k) => ['medicaid', 'acaFloor', 'aca400'].includes(plan.intents[k].line))
    .map(Number)
    .sort((x, y) => x - y);
  c.expect(a.ages).toStrictEqual(aca);
  if (aca.length) {
    c.expect(a.kept).toBe(objectiveBreakdown(ctx, strippedSim).healthcare - objectiveBreakdown(ctx, sim).healthcare);
  } else {
    // the early household keeps no ACA intent: the answer is the empty one (a later engine change that keeps one is noticed here)
    c.expect(a.ages).toStrictEqual([]);
    c.expect(Number.isFinite(a.kept)).toBe(true);
  }
});

it('conversion and ACA sentences', async () => {
  const w = await world();
  const { conversionAnswerText, acaAnswerText } = await w.load(CA);
  const base = { rothConvBracket: 22 };
  const a = { gain: 12300, depletedOn: null, depletedOff: null, bracket: 22, ages: [60, 61, 62, 65], acaHeld: 0, sized: false };
  c.expect(conversionAnswerText(a, base, 'the cliff plan')).toBe(
    "Yes: converting to the top of the 22% bracket, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars).",
  );
  c.expect(conversionAnswerText({ ...a, bracket: 24, sized: true }, base, 'the cliff plan')).toBe(
    "Yes: converting to the cliff plan's 24% bracket, not your 22%, sized by year, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars).",
  );
  c.expect(conversionAnswerText({ ...a, bracket: 24 }, base, 'the applied plan')).toBe(
    "Yes: converting to the applied plan's 24% bracket, not your 22%, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars).",
  );
  c.expect(conversionAnswerText({ ...a, sized: true }, base, 'the cliff plan')).toBe(
    "Yes: converting to the top of the 22% bracket, sized by year, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars).",
  );
  c.expect(conversionAnswerText({ ...a, acaHeld: 1 }, base, 'the cliff plan')).toBe(
    "Yes: converting to the top of the 22% bracket, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars). Held by the ACA line in 1 year.",
  );
  c.expect(conversionAnswerText({ ...a, acaHeld: 3 }, base, 'the cliff plan')).toBe(
    "Yes: converting to the top of the 22% bracket, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars). Held by the ACA line in 3 years.",
  );
  c.expect(conversionAnswerText({ ...a, gain: -2500 }, base, 'the cliff plan')).toBe(
    'No: converting to the top of the 22% bracket leaves about $2.5K less after tax at the end.',
  );
  c.expect(conversionAnswerText({ ...a, gain: 100 }, base, 'the cliff plan')).toBe(
    'Conversions make little difference here (under $500 after tax at the end).',
  );
  c.expect(conversionAnswerText({ ...a, gain: -499 }, base, 'the cliff plan')).toBe(
    'Conversions make little difference here (under $500 after tax at the end).',
  );
  c.expect(conversionAnswerText({ ...a, depletedOn: 80, depletedOff: null }, base, 'the cliff plan')).toBe(
    'No: conversions make the money run out at 80 instead of lasting.',
  );
  c.expect(conversionAnswerText({ ...a, depletedOn: 80, depletedOff: 85 }, base, 'the cliff plan')).toBe(
    'No: conversions make the money run out at 80 instead of 85.',
  );
  // conversions that rescue a plan that runs out are not a depletion warning
  c.expect(conversionAnswerText({ ...a, depletedOn: 90, depletedOff: 85 }, base, 'the cliff plan')).toBe(
    "Yes: converting to the top of the 22% bracket, ages 60-62, 65, leaves about $12.3K more after tax at the end (today's dollars).",
  );
  c.expect(acaAnswerText({ ages: [55, 56, 57, 60], kept: 8400 })).toBe(
    "The cliff plan stays under the ACA line at 55-57, 60, keeping about $8.4K of premium credit (today's dollars).",
  );
  c.expect(acaAnswerText({ ages: [], kept: 0 })).toBe('No year needs steering under an ACA line.');
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(EXPECTED);
});
