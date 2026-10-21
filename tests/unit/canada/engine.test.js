import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const ENGINE_ROWS = 58;

describe('engine helper (Canada)', () => {
  it('simulate(50, 50); no accountTrace', async () => {
    const w = await world();
    await w.setState({ retireAgeA: 50 });
    const e = await engine(w);
    expect(e.simulate(50, 50).rows.length).toBe(ENGINE_ROWS);
    expect(e.accountTrace).toBe(undefined);
  });
});
