// The projection verdict function, the resumable room search and the Comfortable threshold.
import { it, expect, inject, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const EXPECTED = 79;

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
  for (const [base, want] of T) c.expect(comfortableThreshold(base)).toBe(want);
  for (const base of [30000, 42000, 47000, 52000]) {
    const t = comfortableThreshold(base);
    c.expect(displayRoom(t - 100) / base >= VERDICT_RULES.minRoomShare).toBe(false);
    c.expect(displayRoom(t) / base >= VERDICT_RULES.minRoomShare).toBe(true);
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
      c.expect(r.value).toBe('run');
      yields++;
    }
    c.expect(r.value).toStrictEqual(m.findSpendingRoom(selected, state, ctxFor));
    c.expect(yields).toBe(r.value.runs);
  }
});

async function verdict(patch) {
  const { w, state, ctxFor } = await setup({ ...DRAW, ...patch });
  const { projectionVerdict } = await w.load(PV);
  const { runs, selected, ...rest } = projectionVerdict(state, ctxFor);
  return rest;
}

usIt('projectionVerdict on DRAW', async () => {
  c.expect(await verdict({ spending: 30000 })).toStrictEqual({ word: 'comfortable', room: 10000, shown: 10000, atCap: false,
    unfixable: false, guardrails: false, cutPct: 0, depletedAge: null, shareBase: 30000 });
  const short = await verdict({ spending: 45000 });
  c.expect(short.word).toBe('short');
  c.expect(short.room).toBe(-5000);
  c.expect((await verdict({ spending: 30000, rothIraA: 330000, rothIraBasisA: 330000 })).word).toBe('comfortable');
  const tight = await verdict({ spending: 30000, rothIraA: 329000, rothIraBasisA: 329000 });
  c.expect(tight.word).toBe('tight');
  c.expect(tight.room).toBe(2900);
});

const WORDS = ['comfortable', 'tight', 'short', 'short', 'tight'];
const AGREE = [[{}], [{ spending: 64000 }], [{ spending: 76000 }], [{ spending: 78000 }], [{ guardrailsEnabled: true }]];
it('the word check agrees with the full verdict', async () => {
  const words = [];
  for (const [patch] of AGREE) {
    const { w, state, ctxFor } = await setup(patch);
    const { projectionVerdict, projectionVerdictSteps, projectionWord, projectionWordSteps } = await w.load(PV);
    const { drainSteps } = await w.load(ROOM);
    const full = projectionVerdict(state, ctxFor);
    words.push(full.word);
    c.expect(projectionWord(state, ctxFor).word).toBe(full.word);
    const gen = projectionWordSteps(state, ctxFor);
    let yields = 0, r;
    while (!(r = gen.next()).done) yields++;
    c.expect(yields <= 2).toBe(true);
    c.expect(yields).toBe(r.value.runs);
    const count = (g) => {
      let n = 0, x;
      while (!(x = g.next()).done) n++;
      return { n, value: x.value };
    };
    const without = count(projectionVerdictSteps(state, ctxFor));
    c.expect(without.n).toBe(without.value.runs);
    const withSel = count(projectionVerdictSteps(state, ctxFor, full.selected));
    c.expect(withSel.n).toBe(withSel.value.runs);
    c.expect(withSel.value.runs).toBe(without.value.runs - 1);
    c.expect(drainSteps(projectionWordSteps(state, ctxFor)).word).toBe(full.word);
  }
  c.expect(words).toStrictEqual(WORDS);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(EXPECTED);
});
