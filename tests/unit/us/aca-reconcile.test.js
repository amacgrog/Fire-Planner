// The return's price (162(l) settlement): acaCoverageKind and the reconciliation mode of acaNetCost / healthcareCost.
// A single filer, gross premium 18,000, year 0, 2026 poverty line for one 15,650; expected figures are hand-computed.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

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
