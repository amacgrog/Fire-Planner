import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';

describe('normalizeState without a DOM (US)', () => {
  it('setState normalizes a patch', async () => {
    expect(typeof document).toBe('undefined');
    const w = await world();
    const state = await w.setState({ retireAgeA: 50 });
    expect(state.retireAgeA).toBe(50);
  });
});

// A hand-built stored plan (Batch 5 step 4a): the envelope, then the plan, with every key in order.
function validStoredPlan() {
  return {
    v: 1,
    plan: {
      intents: { 60: { kind: 'under', line: 'aca400', ret: 'H' }, 61: { kind: 'fill', line: 'irmaa1', ret: 'A' } },
      family: 'all',
      bracket: 22,
      bracketFrom: 24,
      orders: { 60: 'traditional' },
      splits: { 60: 'A', 61: 'B' },
      levers: null,
      mult: [0.5, 1, 1.5],
      orderPhases: null,
    },
    objective: 'endValue',
    mult: [1, 1, 2],
    madeFor: 'abc',
    taxYear: 2026,
    summary: { gain: 1234.5, success: { hist: [0.9, null], mc: [0.8, 0.85] } },
  };
}

describe('the stored plan guard (US)', () => {
  it('a valid stored plan survives as the same object with unchanged JSON', async () => {
    const w = await world();
    const sp = validStoredPlan();
    const json = JSON.stringify(sp);
    const state = await w.setState({ storedPlan: sp });
    expect(state.storedPlan).toBe(sp);
    expect(JSON.stringify(state.storedPlan)).toBe(json);
  });

  it('the default is null', async () => {
    const w = await world();
    const state = await w.setState({});
    expect(state.storedPlan).toBe(null);
  });

  const reorder = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  const bad = {
    'v 2': (p) => { p.v = 2; },
    'extra envelope key': (p) => { p.extra = 1; },
    'missing envelope key': (p) => { delete p.summary; },
    'extra plan key': (p) => { p.plan.extra = 1; },
    'plan keys out of order': (p) => { p.plan = reorder(p.plan, ['family', 'intents', ...Object.keys(p.plan).slice(2)]); },
    "intent age '07'": (p) => { p.plan.intents = { '07': { kind: 'under', line: 'aca400', ret: 'H' } }; },
    "intent age '121'": (p) => { p.plan.intents = { 121: { kind: 'under', line: 'aca400', ret: 'H' } }; },
    "intent age '6.5'": (p) => { p.plan.intents = { '6.5': { kind: 'under', line: 'aca400', ret: 'H' } }; },
    "intent line 'senior'": (p) => { p.plan.intents[60].line = 'senior'; },
    "ret 'C'": (p) => { p.plan.intents[60].ret = 'C'; },
    'intent extra key': (p) => { p.plan.intents[60].x = 1; },
    'family bad': (p) => { p.plan.family = 'x'; },
    'bracket 23': (p) => { p.plan.bracket = 23; },
    'plan.mult [1,1,3]': (p) => { p.plan.mult = [1, 1, 3]; },
    'envelope mult [1,1]': (p) => { p.mult = [1, 1]; },
    "orders roth": (p) => { p.plan.orders = { 60: 'roth' }; },
    "splits C": (p) => { p.plan.splits = { 60: 'C' }; },
    'levers object': (p) => { p.plan.levers = { order: true }; },
    "objective 'x'": (p) => { p.objective = 'x'; },
    'madeFor 5': (p) => { p.madeFor = 5; },
    'taxYear 2026.5': (p) => { p.taxYear = 2026.5; },
    'summary.gain NaN': (p) => { p.summary.gain = NaN; },
    'summary.success.mc [0.5]': (p) => { p.summary.success.mc = [0.5]; },
  };
  for (const [name, mutate] of Object.entries(bad)) {
    it(`malformed (${name}) gives null`, async () => {
      const w = await world();
      const sp = validStoredPlan();
      mutate(sp);
      const state = await w.setState({ storedPlan: sp });
      expect(state.storedPlan).toBe(null);
    });
  }

  it('rothConvBracket 23 and the string 22 give 22; a valid 12 stays', async () => {
    const w = await world();
    expect((await w.setState({ rothConvBracket: 23 })).rothConvBracket).toBe(22);
    expect((await w.setState({ rothConvBracket: '22' })).rothConvBracket).toBe(22);
    expect((await w.setState({ rothConvBracket: 12 })).rothConvBracket).toBe(12);
  });

  it('the objective list inlined in plan-shape.js equals the registry ids', async () => {
    const w = await world();
    const { STORED_OBJECTIVE_IDS } = await w.load('us/core/cliff-plan/plan-shape.js');
    const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
    expect([...STORED_OBJECTIVE_IDS]).toStrictEqual(Object.keys(US_OBJECTIVES));
  });
});
