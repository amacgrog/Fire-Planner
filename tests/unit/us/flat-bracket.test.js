// The flat-bracket card's pick (pickFlatBracket, src/us/core/optimizer/roth-schedule.js) and the optimizers' shared guardrail
// (notWorseThan, src/us/core/optimizer/objectives.js): the guardrail pool, the latest depletion, the $1 tie and its tie-break,
// and the "No conversions" row (bracket null): picked only when it beats every bracket in the pool.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 18;
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

// The "No conversions" row (bracket null), first in the card's results as computeRothOptimizer orders them.
it('no conversions: wins on a score more than $1 higher, and only then', async () => {
  const { rs } = await load();
  const none = { bracket: null, depletedAge: null, score: 501.5 };
  const results = [none, { bracket: 10, depletedAge: null, score: 400 }, { bracket: 22, depletedAge: null, score: 500 }];
  c.expect(rs.pickFlatBracket(results, null, 22)).toBe(none);
  c.expect(rs.pickFlatBracket(results, null, 10)).toBe(none);
  const tie = [{ bracket: null, depletedAge: null, score: 501 }, ...results.slice(1)];
  c.expect(rs.pickFlatBracket(tie, null, 22)).toBe(tie[2]);
});

it('no conversions: a $1 tie goes to the lowest tied converting bracket when the current one is not tied', async () => {
  const { rs } = await load();
  const results = [
    { bracket: null, depletedAge: null, score: 500 },
    { bracket: 12, depletedAge: null, score: 500 },
    { bracket: 22, depletedAge: null, score: 499.5 },
    { bracket: 24, depletedAge: null, score: 300 },
  ];
  c.expect(rs.pickFlatBracket(results, null, 24)).toBe(results[1]);
});

it('no conversions: wins on a later depletion, and the guardrail drops it like any row', async () => {
  const { rs } = await load();
  const later = [{ bracket: null, depletedAge: 90, score: 100 }, { bracket: 22, depletedAge: 85, score: 900 }];
  c.expect(rs.pickFlatBracket(later, 85, 22)).toBe(later[0]);
  const dropped = [{ bracket: null, depletedAge: 80, score: 9000 }, { bracket: 22, depletedAge: null, score: 500 }];
  c.expect(rs.pickFlatBracket(dropped, null, 22)).toBe(dropped[1]);
});

it('no conversions: nothing passes the guardrail, it is the latest depletion', async () => {
  const { rs } = await load();
  const results = [{ bracket: null, depletedAge: 88, score: 1 }, { bracket: 10, depletedAge: 84, score: 50 }];
  c.expect(rs.pickFlatBracket(results, null, 10)).toBe(results[0]);
});
