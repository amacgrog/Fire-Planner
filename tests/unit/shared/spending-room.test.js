// Spending room search, display rounding, deepest guardrail cut and the verdict rules.
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

const ROOM = 'shared/core/analysis/spending-room.js';
const isUS = inject('country') === 'us';
const usIt = isUS ? it : it.skip;

const DRAW = { singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 74, incomeA: 0, inflation: 0, returnRate: 0,
  bondReturn: 0, hysaRate: 0, dividendYield: 0, healthcare: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0,
  tenure: 'rent', rent: 0, taxable: 0, cash: 0, emergencyCash: 0, bondYears: 0, trad401kA: 0,
  rothIraA: 400000, rothIraBasisA: 400000 };
const TIER = { name: '', amount: 50000, startAge: 65, endAge: 69, followGrowth: true, growth: 0 };

async function room(patch) {
  const w = await world();
  const state = await w.setState({ ...DRAW, ...patch });
  const { refreshCliffPlan } = await w.load('us/core/cliff-plan/planning.js');
  refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const selected = (await w.load('shared/core/projection/runs.js')).simulateWith(ctxFor(state));
  const m = await w.load(ROOM);
  const { runs, ...rest } = m.findSpendingRoom(selected, state, ctxFor);
  expect(runs <= 20).toBe(true);
  return rest;
}

const CASES = [
  ['room to spare', { spending: 30000 }, { room: 10000, atCap: false, unfixable: false }],
  ['cut needed', { spending: 45000 }, { room: -5000, atCap: false, unfixable: false }],
  ['spending room shifts spending tiers', { spending: 30000, spendingTiers: [TIER] }, { room: 0, atCap: false, unfixable: false }],
  ['a tier above base spending is not unfixable', { spending: 10000, spendingTiers: [{ ...TIER, amount: 60000, endAge: 74 }] }, { room: -20000, atCap: false, unfixable: false }],
  ['capped when the room is beyond the search', { spending: 0, rothIraA: 10000000, rothIraBasisA: 10000000 }, { room: 100000, atCap: true, unfixable: false }],
  ['unfixable when even zero spending runs out', { spending: 30000, rothIraA: 100000, rothIraBasisA: 100000, rent: 1000 }, { room: -30000, atCap: false, unfixable: true }],
];
for (const [name, patch, want] of CASES) {
  usIt(name, async () => {
    expect(await room(patch)).toStrictEqual(want);
  });
}

// The verdict's room share is measured against what the household spends in retirement, tiers included.
async function retired(patch) {
  const w = await world();
  const state = await w.setState({ ...DRAW, ...patch });
  const { refreshCliffPlan } = await w.load('us/core/cliff-plan/planning.js');
  refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const selected = (await w.load('shared/core/projection/runs.js')).simulateWith(ctxFor(state));
  return (await w.load(ROOM)).retiredSpending(selected, state);
}
usIt('retiredSpending: base spending alone', async () => {
  expect(await retired({ spending: 30000 })).toBe(30000);
});
usIt('retiredSpending: a tier replaces base spending in its years', async () => {
  // 5 years at 50,000 (the tier) and 5 at 30,000 (base): 400,000 / 10.
  expect(await retired({ spending: 30000, spendingTiers: [TIER] })).toBe(40000);
});
usIt('retiredSpending: a tier covering all of retirement', async () => {
  expect(await retired({ spending: 80000, spendingTiers: [{ ...TIER, amount: 50000, endAge: 74 }] })).toBe(50000);
});
it('retiredSpending: no retired years gives 0', async () => {
  const w = await world();
  const { retiredSpending } = await w.load(ROOM);
  expect(retiredSpending({ rows: [{ working: true, baseSpend: 10, year: 0 }] }, { inflation: 0 })).toBe(0);
});

it('the room is the edge: default household', async () => {
  const w = await world();
  const state = await w.setState({});
  if (isUS) (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { findSpendingRoom, spendingVariant, ROOM_STEP } = await w.load(ROOM);
  const r = findSpendingRoom(simulateWith(ctxFor(state)), state, ctxFor);
  expect(r.room % ROOM_STEP).toBe(0);
  if (!r.atCap && !r.unfixable) {
    expect(simulateWith(ctxFor(spendingVariant(state, r.room))).depletedAge).toBe(null);
    expect(simulateWith(ctxFor(spendingVariant(state, r.room + ROOM_STEP))).depletedAge).not.toBe(null);
  }
});

it('deepestGuardrailCut', async () => {
  const w = await world();
  const { deepestGuardrailCut } = await w.load(ROOM);
  const mk = (rows) => ({ rows: rows.map(([working, baseSpend]) => ({ working, baseSpend })) });
  const off = mk([[true, 100], [false, 100], [false, 90]]);
  expect(deepestGuardrailCut(mk([[true, 50], [false, 90], [false, 72]]), off)).toBe(0.19999999999999996);
  expect(deepestGuardrailCut(off, off)).toBe(0);
  expect(deepestGuardrailCut(mk([[true, 100], [false, 120], [false, 95]]), off)).toBe(0);
  expect(deepestGuardrailCut(mk([[false, 10], [false, 50]]), mk([[false, 0], [false, 100]]))).toBe(0.5);
});

it('displayRoom', async () => {
  const w = await world();
  const { displayRoom } = await w.load(ROOM);
  const T = [[9900, 9000], [7800, 7000], [4999, 4500], [499, 0], [0, 0], [-100, -500], [-4501, -5000], [-6001, -7000], [-6000, -6000]];
  for (const [i, o] of T) expect(displayRoom(i)).toBe(o);
});

it('planVerdict', async () => {
  const w = await world();
  const { planVerdict } = await w.load(ROOM);
  const base = { depleted: false, roomShare: 0.5, histRate: 0.9, guardrails: false, cutPct: 0, scenario: false };
  const T = [
    [{ depleted: true }, 'short'],
    [{ roomShare: 0.10, histRate: 0.80 }, 'comfortable'],
    [{ roomShare: 0.0999 }, 'tight'],
    [{ histRate: 0.79 }, 'tight'],
    [{ histRate: null }, 'comfortable'],
    [{ guardrails: true, cutPct: 10 }, 'comfortable'],
    [{ guardrails: true, cutPct: 11 }, 'tight'],
    // Feedback B5: debt left at the end caps the word at Tight, never Short.
    [{ debtAtEnd: true }, 'tight'],
    [{ debtAtEnd: true, guardrails: true, cutPct: 0 }, 'tight'],
    [{ debtAtEnd: true, depleted: true }, 'short'],
    [{ debtAtEnd: false }, 'comfortable'],
  ];
  for (const [p, o] of T) expect(planVerdict({ ...base, ...p })).toBe(o);
});

it('debtAtEndOf: the last row\'s loan balance in today\'s dollars, $1 or more', async () => {
  const w = await world();
  const { debtAtEndOf } = await w.load(ROOM);
  const sim = (last) => ({ rows: [{ loanBalance: 9999, total: 0, year: 0 }, last] });
  expect(debtAtEndOf(sim({ loanBalance: 5000, total: 10, year: 2 }), { inflation: 0 })).toStrictEqual({ debtLeft: 5000, debtExceedsAssets: false });
  expect(debtAtEndOf(sim({ loanBalance: 5000, total: -1, year: 2 }), { inflation: 0 })).toStrictEqual({ debtLeft: 5000, debtExceedsAssets: true });
  // A scenario row's own factor: 5000 / 1.25
  expect(debtAtEndOf(sim({ loanBalance: 5000, total: 10, year: 2, cumFactor: 1.25 }), { inflation: 3 })).toStrictEqual({ debtLeft: 4000, debtExceedsAssets: false });
  expect(debtAtEndOf(sim({ loanBalance: 0.99, total: -5, year: 2 }), { inflation: 0 })).toStrictEqual({ debtLeft: 0, debtExceedsAssets: false });
  expect(debtAtEndOf(sim({ loanBalance: 0, total: 10, year: 2 }), { inflation: 0 })).toStrictEqual({ debtLeft: 0, debtExceedsAssets: false });
});

it('planVerdict ignores history under a scenario', async () => {
  const w = await world();
  const { planVerdict } = await w.load(ROOM);
  expect(planVerdict({ depleted: false, roomShare: 0.5, histRate: 0.5, guardrails: false, cutPct: 0, scenario: true })).toBe('comfortable');
});

it('historySetsWord: only when the margin passes and history alone fails', async () => {
  const w = await world();
  const { planVerdict, historySetsWord } = await w.load(ROOM);
  const base = { depleted: false, roomShare: 0.10, histRate: 0.79, guardrails: false, cutPct: 0, scenario: false };
  const T = [
    [{}, true],
    [{ histRate: 0.80 }, false],
    [{ roomShare: 0.0999 }, false],
    [{ histRate: null }, false],
    [{ scenario: true }, false],
    [{ depleted: true }, false],
    [{ roomShare: Infinity }, true],
    [{ guardrails: true, roomShare: 0, cutPct: 10 }, true],
    [{ guardrails: true, roomShare: 0, cutPct: 11 }, false],
    [{ debtAtEnd: true }, false],
  ];
  for (const [p, o] of T) {
    const args = { ...base, ...p };
    expect(historySetsWord(args)).toBe(o);
    // Wherever history alone sets the word it is Tight, and the same plan at the line reads Comfortable.
    if (o) {
      expect(planVerdict(args)).toBe('tight');
      expect(planVerdict({ ...args, histRate: 0.80 })).toBe('comfortable');
    }
  }
});
