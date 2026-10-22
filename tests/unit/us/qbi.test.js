// The qualified business income deduction (IRC 199A) (E1c Task 6, US).
// Spec: docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md section 6.6. Hand-computed (hand-computed literals,
// never engine output); the clock is pinned to 2026 (tests/unit/clock.js).
// Converted from tests/qbi.js (Playwright); the old script executed 22 near and assert checks (page-error check excluded),
// this file asserts the same 22. Each it block sets up its own world, state and tax year.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 22;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const near = (a, b, tol, msg) => {
  c.tick();
  expect.soft(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`).toBe(true);
};

// A fresh world with the 2026 tax year and the default state at 0% inflation (the old page's starting point).
async function setup() {
  const w = await world();
  const fed = await w.load('us/core/tax/federal-tax.js');
  const rules = await w.load('us/core/tax/federal-rules.js');
  const { STATE_RULES } = await w.load('us/core/tax/state-rules.js');
  const { taxIndexFactor } = await w.load('shared/core/projection/year-factors.js');
  const st = await w.setState();
  w.setTaxYear(2026);
  st.inflation = 0;
  const ctx = await w.ctx({ withPlan: false });
  // The functions that take the run context get one built from the store at each call (the hooks' old signatures).
  const now = await w.ctxBuilder(), live = (fn) => (...a) => fn(now(), ...a);
  const t = { taxFor: live(fed.taxFor), ordinaryTax: live(fed.ordinaryTax), qbiDeduction: live(fed.qbiDeduction), federalDeduction: live(rules.federalDeduction), taxIndexFactor: (y) => taxIndexFactor(ctx, y), STATE_RULES };
  const q = (qbi, taxable, gain, joint, y) => fed.qbiDeduction(now(), qbi, taxable, gain, !!joint, y || 0);
  return { w, st, t, q };
}

it('the pure function (year 0, no indexing)', async () => {
  const { q } = await setup();
  near(q(50000, 80000, 0), 10000, 1e-9, '20% of QBI below the threshold');
  near(q(100000, 239250, 0), 5000, 1e-9, 'inside the range: ap 0.5, 0.2 x 100,000 x 0.25');
  near(q(100000, 300000, 0), 0, 1e-9, 'above the range: an SSTB gets nothing, not even the minimum');
  near(q(1500, 239250, 0), 75, 1e-9, 'inside the range, only 750 of QBI counts (under 1,000): no minimum');
  near(q(3000, 239250, 0), 400, 1e-9, 'inside the range, 1,500 counts: raised to the 400 minimum');
  near(q(50000, 60000, 30000), 6000, 1e-9, 'cap: 20% x (60,000 - 30,000 net gain)');
  near(q(1500, 50000, 0), 400, 1e-9, 'minimum: 300 raised to 400');
  near(q(900, 50000, 0), 180, 1e-9, 'under 1,000 of QBI: no minimum');
  near(q(100000, 478500, 0, true), 5000, 1e-9, 'joint: threshold 403,500, width 150,000 at 478,500 -> ap 0.5');
});

it('indexing', async () => {
  const { st, t, q } = await setup();
  st.inflation = 10;
  const f = t.taxIndexFactor(1);
  near(f, 1.1, 1e-12, 'taxIndexFactor(1) at 10% inflation');
  near(q(100000, 201750 * f + 37500, 0, false, 1), 5000, 1e-9, 'indexed threshold, fixed width');
  near(q(3000, 201750 * f + 37500, 0, false, 1), 400 * f, 1e-9, 'indexed minimum');
  st.inflation = 0;
});

it('taxFor', async () => {
  const { st, t } = await setup();
  const out = {};
  const profile = (o) => Object.assign({ year: 0, filing: 'single', singlePerson: true, otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 40, ageB: 40, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [], seOn: true }, o);
  st.stateTax = 'tx';
  const one = { otherA: 50000, seNetA: 50000, sePlanNetA: 50000 };
  out.oneQ = t.taxFor(profile(one), 0, 0);
  out.oneNoQ = t.taxFor(profile({ ...one, sePlanNetA: 0 }), 0, 0);
  const two = { filing: 'single', singlePerson: false, sePlanNetA: 40000, seNetA: 40000, otherA: 40000, sePlanNetB: 60000, seNetB: 60000, otherB: 60000 };
  out.two = t.taxFor(profile(two), 0, 0);
  out.twoNoQ = t.taxFor(profile({ ...two, sePlanNetA: 0, sePlanNetB: 0 }), 0, 0);
  // Oregon deducts federal tax through the lagged pass.
  out.orLagged = t.STATE_RULES.or.federalTaxSubtraction && t.STATE_RULES.or.federalTaxSubtraction.kind;
  const orp = { otherA: 90000, seNetA: 90000, sePlanNetA: 90000 };
  out.txQ = t.taxFor(profile(orp), 0, 0);
  out.txNoQ = t.taxFor(profile({ ...orp, sePlanNetA: 0 }), 0, 0);
  st.stateTax = 'or';
  out.orQ = t.taxFor(profile(orp), 0, 0);
  out.orNoQ = t.taxFor(profile({ ...orp, sePlanNetA: 0 }), 0, 0);
  // an all-W-2 household: the new keys at zero change nothing
  st.stateTax = 'ca';
  const w2 = { wageA: 80000, otherA: 80000 };
  out.w2a = t.taxFor(profile(w2), 0, 0);
  out.w2b = t.taxFor(profile({ ...w2, sePlanNetA: 0, sePlanNetB: 0, seHealthA: 0, seHealthB: 0 }), 0, 0);
  const res = out;
  // single, 2026: standard deduction 16,100; taxable before QBI 33,900; QBI = min(10,000, 0.2 x 33,900 = 6,780) = 6,780.
  // Ordinary tax on 33,900: 1,240 + 12% x (33,900 - 12,400) = 1,240 + 2,580 = 3,820;
  // on 27,120: 1,240 + 12% x (27,120 - 12,400) = 1,240 + 1,766.40 = 3,006.40; difference 813.60.
  near(res.oneNoQ - res.oneQ, 813.6, 1e-6, 'taxFor: QBI saves 3,820 - 3,006.40');
  // two separate returns: A taxable 40,000 - 16,100 = 23,900, QBI min(8,000, 4,780) = 4,780, taxable 19,120:
  // 1,240 + 12% x 6,720 = 2,046.40. B taxable 43,900, QBI min(12,000, 8,780) = 8,780, taxable 35,120: 1,240 + 12% x 22,720 = 3,966.40.
  near(res.two, 2046.4 + 3966.4, 1e-6, 'two returns: QBI on each return, not one joint figure');
  near(res.twoNoQ - res.two, (1240 + 0.12 * (23900 - 12400) - 2046.4) + (1240 + 0.12 * (43900 - 12400) - 3966.4), 1e-6, 'two returns: the saving');
  c.expect(res.orLagged, 'Oregon deducts federal tax through the lagged pass').toBe('lagged');
  const fedEffect = res.txNoQ - res.txQ, orEffect = res.orNoQ - res.orQ;
  c.expect(fedEffect > 0, 'federal QBI effect positive').toBe(true);
  c.expect(orEffect > 0 && orEffect <= fedEffect + 1e-9, 'Oregon: lower by less than (or as much as) the federal effect alone').toBe(true);
  c.expect(Object.is(res.w2a, res.w2b), 'all-W-2: new keys at zero change nothing').toBe(true);
});

it('engine: the Task 3 single self-employed household', async () => {
  // The hand-computed pure cases above pin qbiDeduction itself; this case checks the wiring (taxFor takes the deduction off
  // the taxable income of the right return).
  const { w, t } = await setup();
  const eng = await engine(w);
  const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const FP = {
    ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
    stateTax: 'tx', inflation: 0, incomeGrowth: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, megaBackdoor: false,
  };
  const st = await w.setState(FP);
  st.inflation = 0;
  const trace = eng.accountTrace();
  const pr = trace[0].profile;
  const a = t.taxFor(pr, 0, 0), b = t.taxFor({ ...pr, sePlanNetA: 0 }, 0, 0);
  const o = pr.otherA - (pr.seHealthA || 0) + (pr.invOrd || 0), d = t.federalDeduction('single', 0, [pr.ageA], o, 0, pr.propertyTax || 0, pr.mortgageInterest || 0, pr.medicalExpense || 0); // the real deduction: itemized medical may apply
  const qd = t.qbiDeduction(pr.sePlanNetA - (pr.seHealthA || 0), o - d, 0, false, 0);
  const expected = -(t.ordinaryTax(o, 0, 'single', d) - t.ordinaryTax(o, 0, 'single', d + qd));
  c.expect(qd > 0, 'engine: a QBI deduction').toBe(true);
  near(a - b, expected, 1e-6, 'engine: taxFor with and without QBI');
});

it('all-W-2 household: identical rows with the self-employment machinery idle', async () => {
  const { w } = await setup();
  const eng = await engine(w);
  const R = { ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 };
  const rowsOf = async (patch) => { await w.setState({ ...R, ...patch }); return JSON.stringify(eng.simulate().rows); };
  const first = await rowsOf({});
  const second = await rowsOf({ incomeKindA: 'wages', incomeSources: [{ amount: 1000, startAge: 30, endAge: 31, kind: 'wages', healthPremium: 0 }] });
  c.expect(first, 'all-W-2 identical').toBe(second);
});
