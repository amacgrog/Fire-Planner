// loanSchedules amortizes an "other loan" at its annual rate as a fraction (rate 6 is 6%), like the mortgage (hand-computed values).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

// $20,000 at 6% for 5 years: r = 0.005, n = 60, payment = 20000 * r * 1.005^60 / (1.005^60 - 1) = $386.66 a month.
async function schedule(loan) {
  const w = await world();
  const { loanSchedules } = await w.load('shared/core/income/spending-and-loans.js');
  await w.setState({ loans: [loan] });
  return { s: loanSchedules(await w.ctx())[0] };
}

// The contract every caller relies on: mortgagePayment's rate is a fraction, so callers holding percent pass pct(rate).
it('mortgagePayment takes the rate as a fraction', async () => {
  const w = await world();
  const { mortgagePayment } = await w.load('shared/core/income/spending-and-loans.js');
  expect(Math.round(mortgagePayment(20000, 0.06, 5) * 100) / 100).toBe(386.66);
});

it('a 6% five-year loan pays $386.66 a month for five years', async () => {
  const { s } = await schedule({ principal: 20000, balance: 20000, rate: 6, term: 5, extra: 0 });
  // Twelve payments of $386.66 a year ($4,639.87, to the dollar $4,640).
  expect(s.payments.slice(0, 5).map((p) => Math.round(p))).toStrictEqual([4640, 4640, 4640, 4640, 4640]);
  expect(s.payments[5]).toBe(0);
  expect(s.balances[3] > 3000).toBe(true);
  expect(s.balances[4] < 0.01).toBe(true);
});

it('a 0% loan is unchanged: principal over the term', async () => {
  const { s } = await schedule({ principal: 12000, balance: 12000, rate: 0, term: 2, extra: 0 });
  expect(s.payments.slice(0, 3)).toStrictEqual([6000, 6000, 0]);
});
