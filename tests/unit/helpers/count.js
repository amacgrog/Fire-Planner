import { expect } from 'vitest';

// Counts executed checks so a converted suite can assert it ran as many as the old script did.
export function makeCounter() {
  let n = 0;
  return {
    tick() { n++; },
    expect(actual, msg) { n++; return expect.soft(actual, msg); },
    get total() { return n; },
  };
}
