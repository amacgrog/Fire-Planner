import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';

describe('objective ranking', () => {
  it('objectiveBetter ranks depletion first, then the score with a $1 tolerance', async () => {
    const w = await world();
    const { objectiveBetter: B } = await w.load('shared/core/analysis/objectives.js');
    expect(B({ depletedAge: null, score: 0 }, { depletedAge: 80, score: 1e6 })).toBe(true);
    expect(B({ depletedAge: 85, score: 0 }, { depletedAge: 80, score: 1e6 })).toBe(true);
    expect(B({ depletedAge: 80, score: 1e6 }, { depletedAge: 85, score: 0 })).toBe(false);
    expect(B({ depletedAge: null, score: 101 }, { depletedAge: null, score: 100 })).toBe(false);
    expect(B({ depletedAge: null, score: 100 }, { depletedAge: null, score: 101 })).toBe(false);
    expect(B({ depletedAge: null, score: 101.5 }, { depletedAge: null, score: 100 })).toBe(true);
  });
  it('pickBest hands the tied set to preferred, fixed by the maximum', async () => {
    const w = await world();
    const { pickBest } = await w.load('shared/core/analysis/objectives.js');
    const a = { id: 'a', depletedAge: null, score: 0 },
      b = { id: 'b', depletedAge: null, score: 0.8 },
      c = { id: 'c', depletedAge: null, score: 1.6 };
    const first = (t) => t[0],
      ids = [];
    pickBest([a, b, c], (t) => (ids.push(t.map((x) => x.id)), t[0]));
    expect(ids).toStrictEqual([['b', 'c']]);
    expect(pickBest([c, b, a], first)).toBe(c);
  });
  it('pickBest only lets the latest-depletion group compete', async () => {
    const w = await world();
    const { pickBest } = await w.load('shared/core/analysis/objectives.js');
    const first = (t) => t[0];
    expect(pickBest([{ depletedAge: 80, score: 1e6 }, { depletedAge: null, score: 0 }], first).score).toBe(0);
    expect(pickBest([{ depletedAge: 80, score: 5 }, { depletedAge: 82, score: 0 }], first).depletedAge).toBe(82);
  });
});
