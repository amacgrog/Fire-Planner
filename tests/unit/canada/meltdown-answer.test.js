// The Canada meltdown goal's answer (src/canada/core/analysis/meltdown-answer.js): one run per bracket and one without, the
// best bracket by the card's rule, and the sentences.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const EXPECTED = 30;

const MA = 'canada/core/analysis/meltdown-answer.js';
const BRACKETS = [14, 20.5, 26, 29, 33];

it('meltdown answer', async () => {
  const w = await world();
  const state = await w.setState({});
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const { drainSteps } = await w.load('shared/core/analysis/spending-room.js');
  const { meltdownAnswerSteps } = await w.load(MA);
  const selected = simulateWith(ctxFor(state));
  let runs = 0;
  const gen = meltdownAnswerSteps(state, ctxFor, BRACKETS, selected);
  let r;
  for (;;) {
    r = gen.next();
    if (r.done) break;
    c.expect(r.value).toBe('run');
    runs++;
  }
  const a = r.value;
  c.expect(runs).toBe(6);
  c.expect(a.results.map((x) => x.bracket)).toStrictEqual(BRACKETS);
  for (const x of a.results) {
    c.expect(Number.isFinite(x.estate)).toBe(true);
    c.expect(x.depletedAge === null || Number.isInteger(x.depletedAge)).toBe(true);
  }
  c.expect(Number.isFinite(a.off.estate)).toBe(true);
  // best: the highest estate among the not-worse brackets, or among all when none passes (checked here against the results)
  const notWorse = a.results.filter((x) => (selected.depletedAge ? !x.depletedAge || x.depletedAge >= selected.depletedAge : !x.depletedAge));
  const pool = notWorse.length ? notWorse : a.results;
  const top = Math.max(...pool.map((x) => x.estate));
  c.expect(a.best.estate).toBe(top);
  c.expect(pool.includes(a.best)).toBe(true);
  // the answer is stable: a second drain gives the same figures
  c.expect(drainSteps(meltdownAnswerSteps(state, ctxFor, BRACKETS, selected))).toStrictEqual(a);
});

it('meltdown answer sentences', async () => {
  const w = await world();
  const { meltdownAnswerText } = await w.load(MA);
  const off = { estate: 1000000, depletedAge: null };
  const results = [
    { bracket: 20.5, estate: 1012000, depletedAge: null },
    { bracket: 26, estate: 1030300, depletedAge: null },
  ];
  const off0 = { meltdownEnabled: false, meltdownBracket: 20.5 };
  c.expect(meltdownAnswerText({ results, off, best: results[1] }, off0)).toBe(
    "Yes: an RRSP meltdown to the top of the 26% bracket leaves about $30.3K more after-tax estate at the end (today's dollars).",
  );
  c.expect(meltdownAnswerText({ results, off, best: results[1] }, { meltdownEnabled: true, meltdownBracket: 26 })).toBe(
    "Yes: an RRSP meltdown to the top of the 26% bracket leaves about $30.3K more after-tax estate at the end (today's dollars).",
  );
  c.expect(meltdownAnswerText({ results, off, best: results[1] }, { meltdownEnabled: true, meltdownBracket: 20.5 })).toBe(
    'Your meltdown at 20.5% leaves about $12K more after-tax estate than none; 26% would leave about $18.3K more than 20.5%.',
  );
  const worse = [{ bracket: 26, estate: 997500, depletedAge: null }];
  c.expect(meltdownAnswerText({ results: worse, off, best: worse[0] }, off0)).toBe(
    'No: an RRSP meltdown to the top of the 26% bracket leaves about $2.5K less after-tax estate at the end.',
  );
  const flat = [{ bracket: 26, estate: 1000100, depletedAge: null }];
  c.expect(meltdownAnswerText({ results: flat, off, best: flat[0] }, off0)).toBe(
    'A meltdown makes little difference here (under $500 of after-tax estate at the end).',
  );
  const dep = [{ bracket: 26, estate: 1100000, depletedAge: 88 }];
  c.expect(meltdownAnswerText({ results: dep, off, best: dep[0] }, off0)).toBe(
    'No: an RRSP meltdown to the top of the 26% bracket makes the money run out at 88 instead of lasting.',
  );
  c.expect(meltdownAnswerText({ results: dep, off: { estate: 900000, depletedAge: 92 }, best: dep[0] }, off0)).toBe(
    'No: an RRSP meltdown to the top of the 26% bracket makes the money run out at 88 instead of 92.',
  );
  c.expect(meltdownAnswerText({ results: [], off, best: null }, off0)).toBe('No bracket was tested.');
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(EXPECTED);
});
