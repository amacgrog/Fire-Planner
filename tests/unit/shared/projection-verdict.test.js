// The projection verdict function, the resumable room search and the Comfortable threshold.
import { it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';

const ROOM = 'shared/core/analysis/spending-room.js';
const PV = 'shared/core/analysis/projection-verdict.js';
const isUS = inject('country') === 'us';
const usIt = isUS ? it : it.skip;

const DRAW = { singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 74, incomeA: 0, inflation: 0, returnRate: 0,
  bondReturn: 0, hysaRate: 0, dividendYield: 0, healthcare: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0,
  tenure: 'rent', rent: 0, taxable: 0, cash: 0, emergencyCash: 0, bondYears: 0, trad401kA: 0,
  rothIraA: 400000, rothIraBasisA: 400000 };

async function setup(patch) {
  const w = await world();
  const state = await w.setState(patch);
  if (isUS) (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  return { w, state, ctxFor };
}

it('comfortableThreshold', async () => {
  const w = await world();
  const { comfortableThreshold, displayRoom, VERDICT_RULES } = await w.load(ROOM);
  const T = [[0, 0], [30000, 3000], [42000, 4500], [47000, 5000], [52000, 6000]];
  for (const [base, want] of T) expect(comfortableThreshold(base)).toBe(want);
  for (const base of [30000, 42000, 47000, 52000]) {
    const t = comfortableThreshold(base);
    expect(displayRoom(t - 100) / base >= VERDICT_RULES.minRoomShare).toBe(false);
    expect(displayRoom(t) / base >= VERDICT_RULES.minRoomShare).toBe(true);
  }
});

usIt('the steps drain to findSpendingRoom', async () => {
  for (const spending of [30000, 45000]) {
    const { w, state, ctxFor } = await setup({ ...DRAW, spending });
    const { simulateWith } = await w.load('shared/core/projection/runs.js');
    const m = await w.load(ROOM);
    const selected = simulateWith(ctxFor(state));
    const gen = m.spendingRoomSteps(selected, state, ctxFor);
    let yields = 0, r;
    while (!(r = gen.next()).done) {
      expect(r.value).toBe('run');
      yields++;
    }
    expect(r.value).toStrictEqual(m.findSpendingRoom(selected, state, ctxFor));
    expect(yields).toBe(r.value.runs);
  }
});

async function verdict(patch) {
  const { w, state, ctxFor } = await setup({ ...DRAW, ...patch });
  const { projectionVerdict } = await w.load(PV);
  const { runs, selected, ...rest } = projectionVerdict(state, ctxFor);
  return rest;
}

usIt('projectionVerdict on DRAW', async () => {
  expect(await verdict({ spending: 30000 })).toStrictEqual({ word: 'comfortable', room: 10000, shown: 10000, atCap: false,
    unfixable: false, guardrails: false, cutPct: 0, depletedAge: null, shareBase: 30000 });
  const short = await verdict({ spending: 45000 });
  expect(short.word).toBe('short');
  expect(short.room).toBe(-5000);
  expect((await verdict({ spending: 30000, rothIraA: 330000, rothIraBasisA: 330000 })).word).toBe('comfortable');
  const tight = await verdict({ spending: 30000, rothIraA: 329000, rothIraBasisA: 329000 });
  expect(tight.word).toBe('tight');
  expect(tight.room).toBe(2900);
});

it('the word check agrees with the full verdict', async () => {
  for (const patch of [{}, { spending: 64000 }, { spending: 76000 }, { spending: 78000 }, { guardrailsEnabled: true }]) {
    const { w, state, ctxFor } = await setup(patch);
    const { projectionVerdict, projectionWord, projectionWordSteps } = await w.load(PV);
    const full = projectionVerdict(state, ctxFor);
    expect(projectionWord(state, ctxFor).word).toBe(full.word);
    const { drainSteps } = await w.load(ROOM);
    expect(drainSteps(projectionWordSteps(state, ctxFor)).runs <= 2).toBe(true);
  }
});
