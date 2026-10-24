// The return's price (162(l) settlement): acaCoverageKind and the reconciliation mode of acaNetCost / healthcareCost.
// A single filer, gross premium 18,000, year 0, 2026 poverty line for one 15,650; expected figures are hand-computed.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const GROSS = 18000;
const base = { inflation: 0, children: [], acaEnabled: true, acaEnhanced: false };

async function setup(patch) {
  const w = await world();
  const aca = await w.load('us/core/healthcare/aca.js');
  await w.setState({ ...base, ...patch });
  const ctx = await w.ctx();
  expect(aca.fplForHousehold(ctx, 1, 0)).toBe(15650);
  return { w, aca, ctx };
}

it('tx, magi 10000: under the floor, no credit in-year; recon 1 is the credit at 2.1%', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx' });
  expect(aca.acaCoverageKind(ctx, 10000, 1, GROSS, 0)).toBe(2);
  expect(aca.acaNetCost(ctx, 10000, 1, GROSS, 0, 0)).toBe(18000);
  expect(aca.acaNetCost(ctx, 10000, 1, GROSS, 0, 1)).toBe(210);
  expect(aca.acaNetCost(ctx, 10000, 1, GROSS, 0, 2)).toBe(18000);
});

it('ca, enrolled in Medicaid, magi 20000: kind 3', async () => {
  const { aca, ctx } = await setup({ stateTax: 'ca', medicaidWhenEligible: true });
  expect(aca.acaCoverageKind(ctx, 20000, 1, GROSS, 0)).toBe(3);
  expect(aca.acaNetCost(ctx, 20000, 1, GROSS, 0, 0)).toBe(0);
  expect(aca.acaNetCost(ctx, 20000, 1, GROSS, 0, 1)).toBe(420);
  expect(aca.acaNetCost(ctx, 20000, 1, GROSS, 0, 2)).toBe(18000);
  expect(aca.acaNetCost(ctx, 20000, 1, GROSS, 0, 3)).toBe(0);
});

it('ca, Medicaid box off, magi 20000: kind 2, full premium', async () => {
  const { aca, ctx } = await setup({ stateTax: 'ca', medicaidWhenEligible: false });
  expect(aca.acaCoverageKind(ctx, 20000, 1, GROSS, 0)).toBe(2);
  expect(aca.acaNetCost(ctx, 20000, 1, GROSS, 0, 0)).toBe(18000);
  expect(aca.acaNetCost(ctx, 20000, 1, GROSS, 0, 2)).toBe(18000);
});

it('ca, box off, magi 30000: above the Medicaid line, recon 2 equals recon 0', async () => {
  const { aca, ctx } = await setup({ stateTax: 'ca', medicaidWhenEligible: false });
  const r0 = aca.acaNetCost(ctx, 30000, 1, GROSS, 0, 0);
  expect(aca.acaNetCost(ctx, 30000, 1, GROSS, 0, 2)).toBe(r0);
  expect(r0 > 0 && r0 < GROSS).toBe(true);
});

it('tx, magi 40000: kind 1, recon 1 is the same double as in-year', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx' });
  expect(aca.acaCoverageKind(ctx, 40000, 1, GROSS, 0)).toBe(1);
  expect(aca.acaNetCost(ctx, 40000, 1, GROSS, 0, 1)).toBe(aca.acaNetCost(ctx, 40000, 1, GROSS, 0, 0));
});

it('tx, magi 100000: over 400% without the enhanced credit, kind 2 and recon 1 pays the full premium', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx' });
  expect(aca.acaCoverageKind(ctx, 100000, 1, GROSS, 0)).toBe(2);
  expect(aca.acaNetCost(ctx, 100000, 1, GROSS, 0, 1)).toBe(18000);
});

it('no premium: kind 0, cost 0', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx' });
  expect(aca.acaCoverageKind(ctx, 40000, 1, 0, 0)).toBe(0);
  expect(aca.acaNetCost(ctx, 40000, 1, 0, 0, 1)).toBe(0);
});

function hcArgs(extra) {
  return {
    acaEligibleA: true, acaEligibleB: true, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
    workingA: false, workingB: false, factor: 1, year: 0, age: 60, ageB: 60, magiProxy: 0, irmaaHistory: [], filing: 'mfj',
    twoReturns: true, magiA: 10000, magiB: 40000, ...extra,
  };
}

it('healthcareCost recon -1 on two returns fills ACA_KIND with each return kind, and prices in-year', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx', healthcare: 36000 });
  const plain = aca.healthcareCost(ctx, hcArgs({}));
  aca.ACA_KIND[0] = -5;
  aca.ACA_KIND[1] = -5;
  const cap = aca.healthcareCost(ctx, hcArgs({ recon: -1 }));
  expect(aca.ACA_KIND[0]).toBe(2);
  expect(aca.ACA_KIND[1]).toBe(1);
  expect(cap).toStrictEqual(plain);
  // recon 1 with the captured kinds: A's return takes the credit at 2.1% of 10000 = 210
  const back = aca.healthcareCost(ctx, hcArgs({ recon: 1, reconKindA: 1, reconKindB: 1 }));
  expect(back.premA).toBe(210);
});

it('healthcareCost recon -1 on one return fills slot 0', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx', healthcare: 36000 });
  aca.healthcareCost(ctx, hcArgs({ twoReturns: false, magiProxy: 40000, recon: -1 }));
  expect(aca.ACA_KIND[0]).toBe(1);
});

it('healthcareCost with recon 0 gives the same fields as a call without the new fields', async () => {
  const { aca, ctx } = await setup({ stateTax: 'tx', healthcare: 36000 });
  expect(aca.healthcareCost(ctx, hcArgs({ recon: 0, reconKindA: 3, reconKindB: 3 }))).toStrictEqual(aca.healthcareCost(ctx, hcArgs({})));
});

it('ca, Medicaid (kind 3): the return costs 0 even at a MAGI over the Medicaid line (not re-assessed)', async () => {
  const { aca, ctx } = await setup({ stateTax: 'ca', medicaidWhenEligible: true });
  expect(aca.acaNetCost(ctx, 30000, 1, GROSS, 0, 3)).toBe(0);
  expect(aca.acaNetCost(ctx, 30000, 1, GROSS, 0, 0) > 0).toBe(true);
});

// The drift sweep (final review, Minor 5): acaCoverageKind restates acaNetCost's branches, so the two must not drift apart. Over a
// grid of MAGIs crossing the Medicaid line (138%), the 100% floor, 133%, 150% and 400% of the poverty line, in an expansion state
// (ca) and a non-expansion one (tx), with medicaidWhenEligible and acaEnhanced on and off, in 2026, in 2027 for a retired adult
// with no child (the work requirement applies) and in 2027 with a child of 7 (exempt), the in-year price (recon 0) is the
// kind's: kind 3 costs 0; kind 2 the gross premium; kind 1 the credit price (recon 1's), strictly below the gross premium (an
// advance credit was paid: a band point whose expected contribution reaches the premium has no credit and is kind 2). Two
// gross premiums: 18,000 (a credit at every band point) and 1,500 (no credit at the high band points). Three checks per point.
const c = makeCounter();
const RATIOS = [0, 0.5, 0.99, 1, 1.01, 1.2, 1.33, 1.34, 1.38, 1.39, 1.45, 1.5, 1.51, 2.5, 3.99, 4, 4.01, 5, 8];
const GROSSES = [18000, 1500];
// [label, children, year index]
const YEARS = [['2026', [], 0], ['2027, no child', [], 1], ['2027, a child of 7', [{ birthYear: 2020, student: false }], 1]];
const seen = { 1: 0, 2: 0, 3: 0, bandNoCredit: 0, workReq: 0, exempt: 0 };
for (const stateTax of ['ca', 'tx'])
  for (const medicaidWhenEligible of [true, false])
    for (const acaEnhanced of [false, true])
      for (const [label, children, y] of YEARS)
        it(`drift sweep: ${stateTax}, Medicaid box ${medicaidWhenEligible ? 'on' : 'off'}, enhanced ${acaEnhanced ? 'on' : 'off'}, ${label}`, async () => {
          const { aca, ctx } = await setup({ stateTax, medicaidWhenEligible, acaEnhanced, children });
          const fpl = aca.fplForHousehold(ctx, 1, y);
          for (const gross of GROSSES)
            for (const r of RATIOS) {
              const magi = r * fpl;
              const kind = aca.acaCoverageKind(ctx, magi, 1, gross, y);
              const p = aca.acaNetCost(ctx, magi, 1, gross, y, 0);
              c.expect(kind === 1 || kind === 2 || kind === 3, `kind at ${r}`).toBe(true);
              seen[kind]++;
              if (kind === 3) {
                c.expect(p, `kind 3 at ${r}`).toBe(0);
                c.expect(aca.acaNetCost(ctx, magi, 1, gross, y, 3)).toBe(0);
              } else if (kind === 2) {
                c.expect(p, `kind 2 at ${r}`).toBe(gross);
                c.expect(aca.acaNetCost(ctx, magi, 1, gross, y, 2)).toBe(gross);
                if (r >= 1.5 && r <= 3.99) seen.bandNoCredit++;
              } else {
                c.expect(p, `kind 1 at ${r}: the credit price`).toBe(aca.acaNetCost(ctx, magi, 1, gross, y, 1));
                c.expect(p < gross, `kind 1 at ${r}: an advance credit, below the gross premium`).toBe(true);
              }
              // the work requirement: enrolled, in an expansion state, under the line, 2027
              if (stateTax === 'ca' && medicaidWhenEligible && y === 1 && r === 1.2) {
                if (children.length === 0 && kind === 2) seen.workReq++;
                if (children.length === 1 && kind === 3) seen.exempt++;
              }
            }
        });

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // 2 states x 2 Medicaid boxes x 2 enhanced x 3 years x 2 premiums x 19 MAGIs x 3 checks
  expect(c.total).toBe(2 * 2 * 2 * 3 * 2 * 19 * 3);
  // every kind is reached, a band point without a credit (kind 2), and both sides of the work requirement (per enhanced setting)
  expect(seen[1] > 0 && seen[2] > 0 && seen[3] > 0).toBe(true);
  expect(seen.bandNoCredit > 0).toBe(true);
  expect([seen.workReq, seen.exempt]).toStrictEqual([4, 4]);
});
