import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';

describe('pinned clock', () => {
  it('CURRENT_YEAR is 2026', async () => {
    const w = await world();
    const { CURRENT_YEAR } = await w.load('shared/core/projection/year-factors.js');
    expect(CURRENT_YEAR).toBe(2026);
  });
});
