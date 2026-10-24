// The flat-bracket card's pick (pickFlatBracket, src/us/core/optimizer/roth-schedule.js) and the optimizers' shared guardrail
// (notWorseThan, src/us/core/optimizer/objectives.js): the guardrail pool, the latest depletion, the $1 tie and its tie-break.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 11;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

async function load() {
  const w = await world();
  const rs = await w.load('us/core/optimizer/roth-schedule.js');
  const obj = await w.load('us/core/optimizer/objectives.js');
  return { rs, obj };
}

it('identical scores: the current bracket when tied, else the lowest tied bracket', async () => {
  const { rs } = await load();
  const results = [
    { bracket: 10, depletedAge: null, score: 400 },
    { bracket: 12, depletedAge: null, score: 500 },
    { bracket: 22, depletedAge: null, score: 500 },
    { bracket: 24, depletedAge: null, score: 500 },
    { bracket: 32, depletedAge: null, score: 500 },
    { bracket: 35, depletedAge: null, score: 500 },
  ];
  c.expect(rs.pickFlatBracket(results, null, 22)).toBe(results[2]);
  c.expect(rs.pickFlatBracket(results, null, 10)).toBe(results[1]);
});

it('the guardrail drops a higher score that depletes when the current plan does not', async () => {
  const { rs } = await load();
  const results = [
    { bracket: 22, depletedAge: null, score: 500 },
    { bracket: 24, depletedAge: 80, score: 900 },
  ];
  c.expect(rs.pickFlatBracket(results, null, 24)).toBe(results[0]);
});

it('with the current plan depleting, the passing pool still ranks the later depletion first', async () => {
  const { rs } = await load();
  const results = [
    { bracket: 22, depletedAge: null, score: 500 },
    { bracket: 24, depletedAge: 85, score: 900 },
    { bracket: 32, depletedAge: 80, score: 2000 },
  ];
  c.expect(rs.pickFlatBracket(results, 82, 32)).toBe(results[0]);
});

it('nothing passes: the latest depletion group, the $1 tie, the lowest tied bracket', async () => {
  const { rs } = await load();
  const results = [
    { bracket: 10, depletedAge: 80, score: 9 },
    { bracket: 12, depletedAge: 85, score: 1 },
    { bracket: 22, depletedAge: 85, score: 1.5 },
  ];
  c.expect(rs.pickFlatBracket(results, null, 35)).toBe(results[1]);
});

it('notWorseThan: no depletion when the current plan has none, no earlier depletion when it has one', async () => {
  const { obj } = await load();
  c.expect(obj.notWorseThan(null, null)).toBe(true);
  c.expect(obj.notWorseThan(null, 80)).toBe(false);
  c.expect(obj.notWorseThan(80, null)).toBe(true);
  c.expect(obj.notWorseThan(80, 85)).toBe(true);
  c.expect(obj.notWorseThan(80, 80)).toBe(true);
  c.expect(obj.notWorseThan(80, 79)).toBe(false);
});
