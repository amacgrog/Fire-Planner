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
