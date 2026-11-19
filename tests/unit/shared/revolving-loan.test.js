// Feedback B3: a credit card or line of credit as a loan row (revolvingSchedule in src/shared/core/income/spending-and-loans.js,
// the row's guards in normalizeLists, its note in dyn-fields.js, the type-aware title in list-titles.js). Each month the balance
// accrues a twelfth of the APR, then the payment is the larger of the fixed amount and the minimum (the percent of that
// statement balance, at least the floor), never more than the balance. The expected figures are exact-fraction hand
// computations rounded to the cent (docs/superpowers/plans/2026-11-16-feedback-b3.md, "Hand-computed figures").
import { it, expect, afterAll, inject } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const isUS = inject('country') === 'us';
const NEW_COUNT = isUS ? 110 : 109;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const LOANS = 'shared/core/income/spending-and-loans.js';
const cents = (x) => Math.round(x * 100) / 100;
// $10,000 at 22% APR, a 2% minimum with a $25 floor; `payment` is the fixed amount.
const CARD = (o) => ({ name: '', type: 'revolving', balance: 10000, rate: 22, minPct: 2, minFloor: 25, payment: 0, principal: 0, term: 0, extra: 0, ...o });
async function rev(loan, months) {
  const w = await world();
  const { revolvingSchedule } = await w.load(LOANS);
  return revolvingSchedule(loan, months);
}
async function schedules(loans) {
  const w = await world();
  const { loanSchedules } = await w.load(LOANS);
  await w.setState({ loans });
  return loanSchedules(await w.ctx());
}

it('minimum only: 2% of $10,000 at 22% takes 96 years 6 months and $81,039.69 of interest', async () => {
  const r = await rev(CARD({}), 1200);
  c.expect(cents(r.firstInterest)).toBe(183.33);
  c.expect(cents(r.firstPayment)).toBe(203.67);
  c.expect(cents(r.payments[0])).toBe(2416.85);
  c.expect(cents(r.balances[0])).toBe(9758.71);
  c.expect(cents(r.payments[1])).toBe(2358.54);
  c.expect(cents(r.balances[1])).toBe(9523.24);
  c.expect(r.payoffMonth).toBe(1158);
  c.expect(cents(r.totalInterest)).toBe(81039.69);
  c.expect(r.fixedFromMonth).toBe(null);
});

it('$400 a month: paid off in month 34 with $3,499.76 of interest', async () => {
  const r = await rev(CARD({ payment: 400 }), 1200);
  c.expect(cents(r.firstPayment)).toBe(400);
  c.expect(r.payments.slice(0, 4).map(cents)).toStrictEqual([4800, 4800, 3899.76, 0]);
  c.expect(r.balances.slice(0, 3).map(cents)).toStrictEqual([7121.13, 3540.98, 0]);
  c.expect(r.payoffMonth).toBe(34);
  c.expect(cents(r.totalInterest)).toBe(3499.76);
  c.expect(r.fixedFromMonth).toBe(1);
});

it('$150 a month: the minimum is larger until month 152, then $150 sets the payment', async () => {
  const r = await rev(CARD({ payment: 150 }), 1200);
  c.expect(r.fixedFromMonth).toBe(152);
  c.expect(cents(r.payments[0])).toBe(2416.85);
  c.expect(cents(r.payments[11])).toBe(1847.42);
  c.expect(cents(r.payments[12])).toBe(1807.01);
  c.expect(cents(r.balances[12])).toBe(7275.24);
  c.expect(cents(r.payments[13])).toBe(1800);
  c.expect(cents(r.payments[23])).toBe(164.57);
  c.expect(r.balances[23]).toBe(0);
  c.expect(r.payoffMonth).toBe(278);
  c.expect(cents(r.totalInterest)).toBe(35418.33);
});

it('the floor: $1,000 pays $25 a month (2% would be $20.37), paid off in month 73', async () => {
  const r = await rev(CARD({ balance: 1000 }), 1200);
  c.expect(cents(r.firstInterest)).toBe(18.33);
  c.expect(r.firstPayment).toBe(25);
  c.expect(r.payments.slice(0, 6).map(cents)).toStrictEqual([300, 300, 300, 300, 300, 300]);
  c.expect(r.balances.slice(0, 2).map(cents)).toStrictEqual([911.42, 801.26]);
  c.expect(cents(r.balances[5])).toBe(18.57);
  c.expect(cents(r.payments[6])).toBe(18.91);
  c.expect(r.payoffMonth).toBe(73);
  c.expect(cents(r.totalInterest)).toBe(818.91);
});

it('the warning case: a 1% minimum does not cover 22% interest, and the balance grows', async () => {
  const r = await rev(CARD({ minPct: 1 }), 12);
  c.expect(cents(r.firstPayment)).toBe(101.83);
  c.expect(cents(r.payments[0])).toBe(1278.29);
  c.expect(cents(r.balances[0])).toBe(11023.05);
  c.expect(r.payoffMonth).toBe(null);
});

it('0% APR: the minimum alone pays it down, in month 153', async () => {
  const r = await rev(CARD({ rate: 0 }), 1200);
  c.expect(r.firstInterest).toBe(0);
  c.expect(r.firstPayment).toBe(200);
  c.expect(cents(r.payments[0])).toBe(2152.83);
  c.expect(cents(r.balances[0])).toBe(7847.17);
  c.expect(r.payoffMonth).toBe(153);
});

it('a raw row with no minimum keys reads the defaults (2%, $25, $0); null reads 0, as the normalizer reads it', async () => {
  const r = await rev({ type: 'revolving', balance: 10000, rate: 22 }, 12);
  c.expect(cents(r.firstPayment)).toBe(203.67);
  c.expect(cents(r.payments[0])).toBe(2416.85);
  // minPct null and minFloor 25: the minimum is the floor, $25 (normalizeLists also reads null as 0).
  const n = await rev({ type: 'revolving', balance: 10000, rate: 22, minPct: null }, 12);
  c.expect(n.firstPayment).toBe(25);
  const w = await world();
  c.expect((await w.setState({ loans: [{ type: 'revolving', minPct: null }] })).loans[0].minPct).toBe(0);
});
// A payment a few cents under the interest: the warning shows cents, so the two figures never read alike.
it('the warning shows cents: $1,370 at 22% with a 1% minimum pays the $25 floor against $25.12 of interest', async () => {
  const w = await world();
  const { revolvingLoanNote } = await w.load('shared/core/inputs/dyn-fields.js');
  c.expect(revolvingLoanNote(CARD({ balance: 1370, minPct: 1 })).text.startsWith("The first payment ($25.00) does not cover the month's interest ($25.12)")).toBe(true);
});

it('loanSchedules: a card returns the same { payments, balances } shape, 71 years long', async () => {
  const [s] = await schedules([CARD({ payment: 400 })]);
  c.expect(Object.keys(s)).toStrictEqual(['payments', 'balances']);
  c.expect(s.payments.length).toBe(71);
  c.expect(s.balances.length).toBe(71);
  c.expect(s.payments.slice(0, 4).map(cents)).toStrictEqual([4800, 4800, 3899.76, 0]);
  c.expect(s.balances[70]).toBe(0);
});

it('the 0/0/0 floor (feedback B5): a 1% minimum in revolvingSchedule and in normalizeLists', async () => {
  const w = await world();
  const { revolvingSchedule } = await w.load(LOANS);
  // $1,000 at 0%: the first month pays 1% of 1,000 = $10.
  const r = revolvingSchedule(CARD({ balance: 1000, rate: 0, minPct: 0, minFloor: 0 }), 12);
  c.expect(r.firstPayment).toBe(10);
  c.expect(r.floored).toBe(true);
  // A negative typed box reads as 0, so it floors too; a payment or a floor keeps the 0%.
  c.expect(revolvingSchedule(CARD({ balance: 1000, rate: 0, minPct: -3, minFloor: 0 }), 12).firstPayment).toBe(10);
  c.expect(revolvingSchedule(CARD({ balance: 1000, rate: 0, minPct: 0, minFloor: 0, payment: 5 }), 12).firstPayment).toBe(5);
  c.expect(revolvingSchedule(CARD({ balance: 1000, rate: 0, minPct: 0, minFloor: 7 }), 12).firstPayment).toBe(7);
  const s = await w.setState({ loans: [CARD({ minPct: 0, minFloor: 0 }), CARD({ minPct: 0, minFloor: 0, payment: 50 }), { ...CARD({ minPct: 0, minFloor: 0 }), type: 'amortized' }] });
  c.expect(s.loans.map((l) => l.minPct)).toStrictEqual([1, 0, 0]);
});

it('loanSchedules: a plan past year 70 keeps its card balance (the schedules run to the longer horizon)', async () => {
  const w = await world();
  const e = await engine(w);
  const { revolvingSchedule } = await w.load(LOANS);
  // Minimum only: paid off in 96 years 6 months, so still owed from year 71 to year 95.
  const long = revolvingSchedule(CARD({}), 1200);
  await w.setState({ singlePerson: true, ageA: 20, retireAgeA: 40, lifeExpectancyA: 110, loans: [CARD({})] });
  const [s] = (await w.load(LOANS)).loanSchedules(await w.ctx());
  c.expect(s.balances.length).toBe(91);
  c.expect(s.balances[75]).toBe(long.balances[75]);
  c.expect(s.balances[75] > 0).toBe(true);
  const rows = e.simulateRaw().rows;
  c.expect(rows.length).toBe(91);
  c.expect(rows[90].loanBalance).toBe(long.balances[90]);
});

it('loanSchedules: a fixed-term loan is unchanged by the type and the new keys', async () => {
  const OLD = { principal: 20000, balance: 20000, rate: 6, term: 5, extra: 0 };
  const [a] = await schedules([OLD]);
  const [b] = await schedules([{ ...OLD, type: 'amortized', minPct: 7, minFloor: 90, payment: 1000 }]);
  c.expect(b).toStrictEqual(a);
  c.expect(a.payments.slice(0, 5).map((p) => Math.round(p))).toStrictEqual([4640, 4640, 4640, 4640, 4640]);
  c.expect(a.payments[5]).toBe(0);
});

it('normalizeLists: the type and the new keys are guarded', async () => {
  const w = await world();
  const s = await w.setState({
    loans: [
      { balance: 1 },
      { type: 'Revolving' },
      { type: 7 },
      { type: 'revolving', minPct: 150, minFloor: -3, payment: -5 },
      { type: 'revolving', minPct: -1, minFloor: 'x', payment: 'y' },
      { type: 'revolving', minPct: 'x' },
    ],
  });
  c.expect(s.loans.map((l) => l.type)).toStrictEqual(['amortized', 'amortized', 'amortized', 'revolving', 'revolving', 'revolving']);
  c.expect(s.loans[0].minPct).toBe(2);
  c.expect(s.loans[0].minFloor).toBe(25);
  c.expect(s.loans[0].payment).toBe(0);
  c.expect([s.loans[3].minPct, s.loans[3].minFloor, s.loans[3].payment]).toStrictEqual([100, 0, 0]);
  c.expect([s.loans[4].minPct, s.loans[4].minFloor, s.loans[4].payment]).toStrictEqual([0, 25, 0]);
  c.expect(s.loans[5].minPct).toBe(2);
});

it('an old save loads as a fixed-term loan, with the old keys in their old order first', async () => {
  const w = await world();
  const { withoutInertListKeys } = await w.load('shared/core/inputs/lists.js');
  const s = await w.setState({ loans: [{ name: 'Car', principal: 20000, balance: 15000, rate: 6, term: 5, extra: 100 }] });
  c.expect(Object.keys(s.loans[0])).toStrictEqual(['name', 'principal', 'balance', 'rate', 'term', 'extra', 'type', 'minPct', 'minFloor', 'payment']);
  c.expect(s.loans[0].type).toBe('amortized');
  // What the seed, the stored-plan fingerprint and the guidance memo hash: the five-key row of before B3 (unsorted JSON).
  c.expect(JSON.stringify(withoutInertListKeys(s).loans)).toBe('[{"principal":20000,"balance":15000,"rate":6,"term":5,"extra":100}]');
});

it('the projection of an old save is unchanged: the new default keys move no row', async () => {
  const w = await world();
  const e = await engine(w);
  const OLD = { principal: 20000, balance: 15000, rate: 6, term: 5, extra: 100 };
  const base = { ageA: 50, ageB: 50, retireAgeA: 55, retireAgeB: 55 };
  await w.setState({ ...base, loans: [OLD] });
  const normalized = e.simulateRaw().rows;
  const s = await w.setState({ ...base, loans: [OLD] });
  for (const k of ['type', 'minPct', 'minFloor', 'payment']) delete s.loans[0][k];
  c.expect(e.simulateRaw().rows).toStrictEqual(normalized);
});

it('the seed: a fixed-term loan hashes as before, a card does not', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const LOAN = { name: 'Car', principal: 20000, balance: 15000, rate: 6, term: 5, extra: 100 };
  const s = await w.setState({ loans: [LOAN] });
  const seed = monteCarloSeed(2026, 1000, s);
  // US: the seed of this save on main at af3247c, before B3.
  if (isUS) c.expect(seed).toBe(2539645778);
  const { type, minPct, minFloor, payment, ...old } = s.loans[0];
  c.expect(monteCarloSeed(2026, 1000, { ...s, loans: [old] })).toBe(seed);
  const card = await w.setState({ loans: [{ ...LOAN, type: 'revolving' }] });
  c.expect(monteCarloSeed(2026, 1000, card) === seed).toBe(false);
});

it('the projection: a $400 card pays $4,800 a year in years 0 and 1, and its balance is the row\'s loan balance', async () => {
  const w = await world();
  const e = await engine(w);
  const base = { ageA: 50, ageB: 50, retireAgeA: 55, retireAgeB: 55, inflation: 0 };
  await w.setState({ ...base, loans: [CARD({ payment: 400 })] });
  const rows = e.simulateRaw().rows;
  c.expect(rows.slice(0, 3).map((r) => cents(r.loanPayment))).toStrictEqual([4800, 4800, 3899.76]);
  c.expect(cents(rows[0].loanBalance)).toBe(7121.13);
  c.expect(rows[3].loanPayment).toBe(0);
  await w.setState({ ...base, loans: [] });
  c.expect(e.simulateRaw().rows[0].loanPayment).toBe(0);
});

it('the row note: payoff time and interest, the warning, and nothing with no balance', async () => {
  const w = await world();
  const { revolvingLoanNote } = await w.load('shared/core/inputs/dyn-fields.js');
  c.expect(revolvingLoanNote(CARD({ payment: 400 }))).toStrictEqual({ text: 'Paid off in 2 years 10 months, with $3,500 in interest.', warn: false });
  c.expect(revolvingLoanNote(CARD({}))).toStrictEqual({ text: 'Paid off in 96 years 6 months, with $81,040 in interest.', warn: false });
  c.expect(revolvingLoanNote(CARD({ balance: 1000, payment: 100 }))).toStrictEqual({ text: 'Paid off in 1 year, with $115 in interest.', warn: false });
  c.expect(revolvingLoanNote(CARD({ balance: 1000, payment: 200 }))).toStrictEqual({ text: 'Paid off in 6 months, with $59 in interest.', warn: false });
  c.expect(revolvingLoanNote(CARD({ minPct: 1 }))).toStrictEqual({
    text: "The first payment ($101.83) does not cover the month's interest ($183.33), so the balance grows. Raise the payment or the minimum.",
    warn: true,
  });
  // Feedback B5: 0/0/0 reads as a 1% minimum with no floor (1% of a falling balance never reaches 0); a 0% minimum with a
  // floor is left alone ($1 a month on $10,000 at 0% takes 10,000 months).
  c.expect(revolvingLoanNote(CARD({ rate: 0, minPct: 0, minFloor: 0 }))).toStrictEqual({ text: 'With no minimum and no payment, this is read as a 1% minimum. Not paid off in 100 years at this payment.', warn: false });
  c.expect(revolvingLoanNote(CARD({ rate: 0, minPct: 0, minFloor: 1 }))).toStrictEqual({ text: 'Not paid off in 100 years at this payment.', warn: false });
  c.expect(revolvingLoanNote(CARD({ minPct: 0.5, minFloor: 0, payment: 0, rate: 1 })).warn).toBe(false);
  c.expect(revolvingLoanNote(CARD({ balance: 0 }))).toStrictEqual({ text: '', warn: false });
});

it('the row title: an unnamed card is "Card or credit line N"; a fixed-term loan is "Loan N"', async () => {
  const w = await world();
  const { itemLabel, LIST_ROW_TITLES } = await w.load('shared/core/inputs/list-titles.js');
  const { listRowLabel } = await w.load('shared/core/inputs/dyn-fields.js');
  const { DYN } = await w.load(`${w.country}/core/inputs/dyn.js`);
  c.expect(itemLabel('loans', { type: 'revolving', name: '' }, 1)).toBe('Card or credit line 2');
  c.expect(itemLabel('loans', { type: 'amortized', name: '' }, 1)).toBe('Loan 2');
  c.expect(itemLabel('loans', { name: '' }, 1)).toBe('Loan 2');
  c.expect(LIST_ROW_TITLES.loans(0)).toBe('Loan 1');
  c.expect(listRowLabel(DYN.loans, { type: 'revolving', name: 'Visa' }, 0)).toBe('Card or credit line 1 · Visa');
});

it('the Sankey: an unnamed card has no sub-label; a named card is subtitled by its type', async () => {
  const w = await world();
  const e = await engine(w);
  const { sankeyColumns } = await w.load(`${w.country}/core/income/sankey-columns.js`);
  await w.setState({ ageA: 50, ageB: 50, retireAgeA: 55, retireAgeB: 55, loans: [CARD({ payment: 400 }), CARD({ name: 'Visa', payment: 400 })] });
  const row = e.simulateRaw().rows[0];
  const cols = sankeyColumns(await w.ctx(), row);
  const items = [...cols.in, ...cols.out].flatMap((g) => g.items);
  const a = items.find((it) => it.key === 'loan:0'),
    b = items.find((it) => it.key === 'loan:1');
  c.expect([a.label, a.sub]).toStrictEqual(['Card or credit line 1', undefined]);
  c.expect([b.label, b.sub]).toStrictEqual(['Visa', 'Card or credit line 2']);
  c.expect(cents(a.value)).toBe(4800);
});

it('the loan spec: the type select and the revolving fields show by type', async () => {
  const w = await world();
  const { DYN } = await w.load(`${w.country}/core/inputs/dyn.js`);
  const f = (k) => DYN.loans.fields.find((x) => x.key === k);
  const card = { type: 'revolving' },
    loan = { type: 'amortized' },
    raw = {};
  for (const k of ['principal', 'term', 'extra']) c.expect([f(k).showIf(card), f(k).showIf(loan), f(k).showIf(raw)]).toStrictEqual([false, true, true]);
  for (const k of ['minPct', 'minFloor', 'payment', 'payoffNote']) c.expect([f(k).showIf(card), f(k).showIf(loan), f(k).showIf(raw)]).toStrictEqual([true, false, false]);
  c.expect(f('type').options.map(([v]) => v)).toStrictEqual(['amortized', 'revolving']);
  c.expect(DYN.loans.fresh().type).toBe('amortized');
});
