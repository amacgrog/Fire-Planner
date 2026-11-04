// cashFlowParts maps one projection row to the cash-flow chart's money-in and money-out parts (hand-built rows, hand-computed values).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

async function load() {
  const w = await world();
  return (await w.load('shared/core/format/cash-flow-parts.js')).cashFlowParts;
}

const base = {
  wages: 0, oneTimeCash: 0, ss: 0, pension: 0, rmd: 0, traditionalWithdrawn: 0, rothWithdrawn: 0, taxableWithdrawn: 0,
  taxableSaleForTax: 0, cashWithdrawn: 0, homeWithdrawn: 0, shortfall: 0, tax: 0, expenses: 0, contributions: 0,
  cashTopUp: 0, reinvested: 0, toBondReserve: 0, conversionAmount: 0, sepp72: 0,
};
const vals = (parts) => parts.map((p) => p.value);
const excessRow = { ...base, rmd: 50000, traditionalWithdrawn: 50000, reinvested: 12000, cashTopUp: 3000 };

it('US retirement year', async () => {
  const cashFlowParts = await load();
  const row = { ...base, ss: 30000, pension: 10000, rmd: 20000, traditionalWithdrawn: 25000, rothWithdrawn: 4000,
    taxableWithdrawn: 6000, cashWithdrawn: 1000, tax: 9000, expenses: 81000 };
  const p = cashFlowParts(row, 1000000);
  expect(vals(p.in)).toStrictEqual([0, 40000, 20000, 5000, 4000, 6000, 1000, 0, 0]);
  expect(vals(p.out)).toStrictEqual([9000, 81000, 0, 0, 0]);
  expect(p.rate).toBe(0.036);
  expect(p.excessRmd).toBe(0);
});

it('excess RMD', async () => {
  const cashFlowParts = await load();
  expect(cashFlowParts(excessRow, 1000000).excessRmd).toBe(15000);
  expect(cashFlowParts({ ...excessRow, sepp72: 40000 }, 1000000).excessRmd).toBe(10000);
});

it('excess RMD leaves out one-time cash', async () => {
  const cashFlowParts = await load();
  expect(cashFlowParts({ ...excessRow, oneTimeCash: 2000, cashTopUp: 5000 }, 1000000).excessRmd).toBe(15000);
});

it('Canada row', async () => {
  const cashFlowParts = await load();
  const row = { ...base, benefits: 2000, meltdown: 15000, traditionalWithdrawn: 30000, rmd: 30000 };
  delete row.conversionAmount;
  const p = cashFlowParts(row, 1000000);
  expect(p.in[1].value).toBe(2000);
  expect(p.in[3].value).toBe(0);
  expect(p.conversion).toBe(15000);
});

it('negative 162(l) carry goes to tax', async () => {
  const cashFlowParts = await load();
  const neg = cashFlowParts({ ...base, tax: 1000, seSettlementIn: -500 }, null);
  expect(neg.in[0].value).toBe(0);
  expect(neg.out[0].value).toBe(1500);
  const pos = cashFlowParts({ ...base, tax: 1000, seSettlementIn: 500 }, null);
  expect(pos.in[0].value).toBe(500);
  expect(pos.out[0].value).toBe(1000);
});

it('withdrawal rate omitted when start investable is 0 or unknown', async () => {
  const cashFlowParts = await load();
  const row = { ...base, taxableWithdrawn: 10000 };
  expect(cashFlowParts(row, 0).rate).toBe(null);
  expect(cashFlowParts(row, null).rate).toBe(null);
  expect(cashFlowParts(row, 50).rate).toBe(null);
});

it('inherited Roth payout is a Roth draw', async () => {
  const cashFlowParts = await load();
  const p = cashFlowParts({ ...base, rothWithdrawn: 1000, inheritedRothPayout: 4000 }, 1000000);
  expect(p.in[4].value).toBe(5000);
  expect(p.in[0].value).toBe(0);
});

it('all nine in keys and five out keys are present when zero', async () => {
  const cashFlowParts = await load();
  const p = cashFlowParts(base, 1000000);
  expect(p.in.map((x) => x.key)).toStrictEqual(['income', 'lifetime', 'rmd', 'traditional', 'roth', 'taxable', 'cash', 'home', 'shortfall']);
  expect(p.out.map((x) => x.key)).toStrictEqual(['tax', 'spending', 'contributions', 'cashTopUp', 'reinvested']);
});

it('both countries label every part', async () => {
  const cashFlowParts = await load();
  const w = await world();
  const p = cashFlowParts(base, 1000000);
  const keys = [...p.in, ...p.out].map((x) => x.key).concat('conversion');
  for (const c of ['us', 'canada']) {
    const labels = (await w.load(`${c}/ui/charts/cash-flow-labels.js`)).CASH_FLOW_LABELS;
    for (const k of keys) expect(typeof labels[k]).toBe('string');
  }
});
