import { describe, it, expect } from 'vitest';
import { world } from '../helpers/world.js';

describe('displayValueOf', () => {
  it('nominal mode returns the amount unchanged', async () => {
    const w = await world();
    const { displayValueOf } = await w.load('shared/core/format/display-value.js');
    expect(displayValueOf('nominal', 3, 1000, 5)).toBe(1000);
  });
  it('zero inflation in real mode returns the amount unchanged', async () => {
    const w = await world();
    const { displayValueOf } = await w.load('shared/core/format/display-value.js');
    expect(displayValueOf('real', 0, 1000, 5)).toBe(1000);
  });
  it('real mode deflates by the compounded inflation', async () => {
    const w = await world();
    const { displayValueOf } = await w.load('shared/core/format/display-value.js');
    expect(displayValueOf('real', 3, 1000, 2)).toBe(1000 / Math.pow(1.03, 2));
  });
  it('displayValue reads the store and equals displayValueOf', async () => {
    const w = await world();
    const { displayValue } = await w.load('shared/core/format/charts.js');
    const { displayValueOf } = await w.load('shared/core/format/display-value.js');
    const store = await w.load('shared/core/store.js');
    await w.setState({ inflation: 3 });
    store.assignMode('real');
    expect(displayValue(1000, 2)).toBe(displayValueOf('real', 3, 1000, 2));
  });
});
