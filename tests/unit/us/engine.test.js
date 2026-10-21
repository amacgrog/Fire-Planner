import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const ENGINE_ROWS = 58;

describe('engine helper (US)', () => {
  it('simulate(50, 50) and accountTrace', async () => {
    const w = await world();
    await w.setState({ retireAgeA: 50 });
    const e = await engine(w);
    expect(e.simulate(50, 50).rows.length).toBe(ENGINE_ROWS);
    const trace = e.accountTrace(50, 50);
    expect(Array.isArray(trace)).toBe(true);
    expect(trace.length).toBeGreaterThan(0);
  });
});
