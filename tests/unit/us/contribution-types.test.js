// Per-partner contribution types (PR 1 Task 1): k401TypeA/B and iraTypeA/B route each partner's dollars on their own.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { usContributions } from '../helpers/us-contributions.js';

const ARGS = { wageA: 100000, wageB: 100000, age: 40, ageB: 40, singlePerson: false, limitFactor: 1, matchA: 0, matchB: 0 };
const BASE = {
  k401PctA: 100, k401PctB: 100, catchupPctA: 0, catchupPctB: 0, iraPctA: 100, iraPctB: 100,
  megaBackdoor: false, matchA: 0, matchB: 0, profitSharingPctA: 0, profitSharingPctB: 0,
};

it('mixed types route per partner', async () => {
  const w = await world();
  await w.setState({ ...BASE, k401TypeA: 'roth', k401TypeB: 'traditional', iraTypeA: 'traditional', iraTypeB: 'roth', incomeA: 100000, incomeB: 100000, ageA: 40, ageB: 40 });
  w.setTaxYear(2026);
  const hooks = await usContributions(w);
  const r = hooks.retirementContributions({}, ARGS);
  expect(r.acct.roth[1]).toBe(24500);
  expect(r.acct.trad[1]).toBe(0);
  expect(r.acct.trad[3]).toBe(24500);
  expect(r.acct.roth[3]).toBe(0);
  expect(r.acct.trad[0]).toBe(7500);
  expect(r.acct.roth[0]).toBe(0);
  expect(r.acct.roth[2]).toBe(7500);
  expect(r.acct.trad[2]).toBe(0);
  expect(r.traditionalContribA).toBe(7500);
  expect(r.traditionalContribB).toBe(24500);
});

it("a stream IRA follows its owner's type", async () => {
  const w = await world();
  await w.setState({ ...BASE, iraPctA: 0, iraPctB: 0, k401PctA: 0, k401PctB: 0, k401TypeA: 'traditional', k401TypeB: 'traditional', iraTypeA: 'traditional', iraTypeB: 'roth', ageA: 40, ageB: 40 });
  w.setTaxYear(2026);
  const hooks = await usContributions(w);
  const mk = (owner) => ({
    owner, pay: 100000,
    stream: { kind: 'wages', contribute: true, deferralPct: 0, deferralType: 'traditional', matchPct: 0, afterTaxPct: 0, personalPct: 100, profitSharingPct: 0 },
  });
  const r = hooks.retirementContributions({}, { ...ARGS, streamList: [mk(0), mk(1)], streamWagesA: 100000, streamWagesB: 100000, wageA: 0, wageB: 0 });
  expect(r.acct.trad[0]).toBe(7500);
  expect(r.acct.roth[0]).toBe(0);
  expect(r.acct.roth[2]).toBe(7500);
  expect(r.acct.trad[2]).toBe(0);
});

it('Solo 401(k) and Solo IRA dollars follow each owner\'s type', async () => {
  const w = await world();
  const hooks = await usContributions(w);
  const pct = { deferral: 100, catchUp: 0, profit: 0, afterTax: 0, ira: 100 };
  // se 100,000 with no half: C = 100,000, so the 24,500 deferral and the 7,500 IRA both fit for each partner.
  const r = hooks.soloPlanContributions({
    se: [100000, 100000], half: [0, 0], main: [100000, 100000], w2Comp: [0, 0], iraLeft: [7500, 7500],
    mainPct: [pct, pct], list: [], rooms: { deferral: [24500, 24500], catchUp: [0, 0], personal: [0, 0] },
    annualAdditions: 72000, compensation: 360000, mainRoth: [true, false], iraPretax: [false, true], megaOn: false,
  });
  expect(r.out.roth[1]).toBe(24500); // A's deferral: Roth 401(k)
  expect(r.out.trad[1]).toBe(0);
  expect(r.out.trad[3]).toBe(24500); // B's deferral: traditional 401(k)
  expect(r.out.roth[3]).toBe(0);
  expect(r.out.roth[0]).toBe(7500); // A's Solo IRA: Roth IRA
  expect(r.out.trad[0]).toBe(0);
  expect(r.out.trad[2]).toBe(7500); // B's Solo IRA: traditional IRA
  expect(r.out.roth[2]).toBe(0);
});
