import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';

describe('normalizeState without a DOM (Canada)', () => {
  it('setState normalizes a patch', async () => {
    expect(typeof document).toBe('undefined');
    const w = await world();
    const state = await w.setState({ retireAgeA: 50 });
    expect(state.retireAgeA).toBe(50);
  });

  it('migrates the old 29.29% meltdown bracket to 29%', async () => {
    const w = await world();
    const state = await w.setState({ meltdownBracket: 29.29 });
    expect(state.meltdownBracket).toBe(29);
    const { federalBracketCeilingCA } = await w.load('canada/core/tax/tax.js');
    expect(federalBracketCeilingCA(29)).toBe(258482);
  });
});

describe('bondStart guard', () => {
  it('a bad value falls back to build, held stays, missing is build', async () => {
    const w = await world();
    expect((await w.setState({ bondStart: 'bogus' })).bondStart).toBe('build');
    expect((await w.setState({ bondStart: 'held' })).bondStart).toBe('held');
    expect((await w.setState({ bondStart: 'build' })).bondStart).toBe('build');
    const w2 = await world();
    expect((await w2.setState({})).bondStart).toBe('build');
  });
});
