// Shared by the multi-lever optimizer suites (tests/unit/us/multi-lever-*.test.js): the ACA-cliff scenario, a world with the
// optimizer hooks, and the counted check helpers. The suites are split by run time so Vitest's forks run them in parallel.
import { expect } from 'vitest';
import { world } from './world.js';
import { usOptimizer } from './us-plan.js';

// Retiring well before Social Security, with a large traditional balance sitting idle and a large taxable balance that the
// plain taxable-first default drains hard during the gap, pushing MAGI through the ACA subsidy cliff (enhanced credits off,
// so the 400% FPL cliff applies): a scenario where managing the withdrawal mix deliberately should matter a lot.
export const ACA_CLIFF = Object.freeze({
  stateTax: 'fl', ageA: 45, ageB: 45, retireAgeA: 55, retireAgeB: 55, lifeExpectancyA: 90, lifeExpectancyB: 90,
  taxable: 1500000, basisRatio: 20, trad401kA: 450000, trad401kB: 450000, rothIraA: 100000, rothIraB: 100000,
  cash: 80000, cashReserve: 50000, spending: 75000, ssMonthlyA: 2800, ssMonthlyB: 2200, ssStartAgeA: 67, ssStartAgeB: 67,
  acaEnabled: true, acaEnhanced: false, rothConvStartAge: 55, rothConvEndAge: 66,
});

// A fresh world with the 2026 tax year and the default state under `patch` (as each block of the old script got a fresh
// page), and the optimizer hooks.
export async function optimizerWorld(patch) {
  const w = await world();
  const st = await w.setState(patch);
  w.setTaxYear(2026);
  return { w, st, h: await usOptimizer(w) };
}

export const entries = (m) => [...m.entries()];

// Every failing check is reported (expect.soft) and each evaluation counts once on the suite's counter.
export function checks(c) {
  return {
    check(ok, msg) {
      c.tick();
      expect.soft(ok, msg).toBe(true);
    },
    sameDeep(a, b, msg) {
      c.tick();
      expect.soft(a, msg).toStrictEqual(b);
    },
  };
}
