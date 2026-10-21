import { describe, it, expect } from 'vitest';
import { makeCounter } from '../helpers/count.js';

describe('makeCounter', () => {
  it('counts tick() and expect()', () => {
    const c = makeCounter();
    expect(c.total).toBe(0);
    c.tick();
    expect(c.total).toBe(1);
    c.expect(5).toBe(5);
    expect(c.total).toBe(2);
    c.expect('a').toStrictEqual('a');
    c.tick();
    expect(c.total).toBe(4);
  });
});
