// Survivor modeling: loanPaymentForYear pays every "other loan" off in the death year, so the rows' loanBalance (subtracted from
// total) is 0 from the death year on, in both planners (hand-computed values).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const LISTS0 = { loans: [], spendingTiers: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], children: [] };
// $24,000 at 0% over 8 years: $3,000 a year, so the balance at the end of year y is 24000 - 3000 * (y + 1).
const LOAN = { name: 'Car', principal: 24000, balance: 24000, rate: 0, term: 8, extra: 0 };

async function rowsFor(patch) {
  const w = await world();
  await w.setState({ ...LISTS0, ageA: 57, ageB: 57, retireAgeA: 57, retireAgeB: 57, lifeExpectancyA: 70, lifeExpectancyB: 70, loans: [LOAN], ...patch });
  const e = await engine(w);
  return e.simulate().rows;
}

for (const partner of ['A', 'B']) {
  it(`Partner ${partner} dies at 60: the loan is paid off in the death year and no balance is counted from then on`, async () => {
    const rows = await rowsFor({ survivorEnabled: true, survivorPartner: partner, survivorDeathAge: 60 });
    // Death year 3: years 0-2 owe the schedule's end-of-year balance, year 3 pays the balance left after year 2 ($15,000).
    expect(rows.slice(0, 6).map((r) => r.loanBalance)).toStrictEqual([21000, 18000, 15000, 0, 0, 0]);
    expect(rows.slice(0, 6).map((r) => r.loanPayment)).toStrictEqual([3000, 3000, 3000, 15000, 0, 0]);
    // Without the fix, years 3-7 counted 12000, 9000, 6000, 3000, 0 against the total.
    expect(rows.every((r) => r.loanBalance === 0 || r.year < 3)).toBe(true);
    for (const r of rows) expect(r.total).toBe(r.investable + r.homeEquity - r.loanBalance);
  });
}

// Revolving rows (feedback B3): $1,200 at 0% paying only the $25 floor ($300 a year: 900, 600, 300, 0), and $10,000 at 12% paying
// $100 a month, the month's interest exactly (10000 * 0.01), so its balance stays $10,000 for as long as the run lasts.
const CARDS = [
  { name: 'Card', type: 'revolving', balance: 1200, rate: 0, minPct: 2, minFloor: 25, payment: 0, principal: 0, term: 0, extra: 0 },
  { name: 'Credit line', type: 'revolving', balance: 10000, rate: 12, minPct: 0, minFloor: 0, payment: 100, principal: 0, term: 0, extra: 0 },
];

it('cards: the death year pays both balances and no balance is counted from then on, to the last row', async () => {
  const rows = await rowsFor({ survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 60, loans: CARDS });
  expect(rows.slice(0, 6).map((r) => r.loanBalance)).toStrictEqual([10900, 10600, 10300, 0, 0, 0]);
  // Year 3 pays the $300 and $10,000 left after year 2.
  expect(rows.slice(0, 6).map((r) => r.loanPayment)).toStrictEqual([1500, 1500, 1500, 10300, 0, 0]);
  // Without the fix every row from year 3 on, the last included, still counted the credit line's $10,000.
  expect(rows.length).toBe(14);
  expect(rows.every((r) => r.loanBalance === 0 || r.year < 3)).toBe(true);
  for (const r of rows) expect(r.total).toBe(r.investable + r.homeEquity - r.loanBalance);
});

it('without survivor modeling the schedule runs to the end of its term', async () => {
  const rows = await rowsFor({ survivorEnabled: false });
  expect(rows.slice(0, 9).map((r) => r.loanBalance)).toStrictEqual([21000, 18000, 15000, 12000, 9000, 6000, 3000, 0, 0]);
  expect(rows.slice(0, 9).map((r) => r.loanPayment)).toStrictEqual([3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 0]);
});
