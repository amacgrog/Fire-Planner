// Employer coverage and the W-2 stream premium (E1c Task 2, US). Spec: docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md.
// Hand-computed; the clock is pinned to 2026-06-15.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  const W2 = (o) => ({ amount: 30000, startAge: 50, endAge: 60, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', healthPremium: 6000, ...o });
  const ctx0 = { ageA: 55, ageB: 55, deadA: false, deadB: false, single: false, year: 0, factor: 1, incomeFactor: 1, premiumFactor: 1 };
  const fn = (streams, c = {}) => page.evaluate(([s, x]) => window.__test_streamAmountsForYear(s, x), [streams, { ...ctx0, ...c }]);
  const bits = (streams, c = {}) => page.evaluate(([s, x]) => window.__test_streamCoverBits(s, x), [streams, { ...ctx0, ...c }]);

  // ---- the pure functions ----
  let r = await fn([W2({ owner: 'B' })], { premiumFactor: 1.5 });
  assert.deepStrictEqual([r.wagesB, r.premiumB, r.coverB, r.coverA], [30000, 9000, true, false], 'W-2 stream premium');
  r = await fn([W2({ owner: 'B', kind: 'self' })]);
  assert.deepStrictEqual([r.selfB, r.premiumB, r.coverB, r.wagesB], [30000, 0, false, 0], 'self stream premium ignored');
  const wb = [W2({ owner: 'B' })];
  assert.strictEqual(await bits(wb, { ageB: 61 }), 0, 'cover bits: out of window');
  assert.strictEqual(await bits(wb, { deadB: true }), 0, 'cover bits: owner dead');
  assert.strictEqual(await bits(wb, { single: true }), 1, 'cover bits: single reads the owner as A');
  assert.strictEqual(await bits(wb), 2, 'cover bits: B');

  // ---- engine ----
  const BASE = {
    singlePerson: false, ageA: 55, ageB: 55, retireAgeA: 55, retireAgeB: 55, incomeA: 0, incomeB: 0, inflation: 0, incomeGrowth: 0,
    medicalInflation: 0, healthPremiumA: 0, healthPremiumB: 0, stateTax: 'tx', acaEnabled: false, healthcare: 18000, medicareYearly: 10000,
    survivorEnabled: false, incomeSources: [], incomeKindA: 'wages', incomeKindB: 'wages', employerCoversSpouseA: true, employerCoversSpouseB: true,
  };
  const engine = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      Object.assign(st, p);
      const trace = window.__test_accountTrace();
      const rows = window.__test_simulate().rows;
      return {
        trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax, medA: t.medA, medB: t.medB })),
        rows: rows.map((x) => ({ healthcare: x.healthcare, wages: x.wages })),
      };
    }, { ...BASE, ...patch });

  let e = await engine({ incomeSources: [W2({})], employerCoversSpouseA: false });
  assert.strictEqual(e.rows[0].healthcare, 9000, 'stream premium covers A; B alone on the marketplace (half of 18,000)');
  const covered = await engine({ incomeSources: [W2({})], employerCoversSpouseA: true });
  assert.strictEqual(covered.rows[0].healthcare, 0, "B rides on A's stream job");
  near(covered.trace[0].ficaTax, (30000 - 6000) * 0.0765, 1e-6, 'payroll tax on pay less the premium');
  assert.strictEqual(covered.trace[0].profile.wageA, 24000, 'premium is pre-tax');
  assert.strictEqual(covered.rows[0].wages, 30000 - 6000, 'cash: pay less the premium');

  const med = { ageA: 63, retireAgeA: 63 };
  const withS = await engine({ ...med, incomeSources: [W2({ startAge: 60, endAge: 70 })] });
  const without = await engine({ ...med, incomeSources: [] });
  assert(withS.rows[2].healthcare < without.rows[2].healthcare, `Medicare while covered: ${withS.rows[2].healthcare} vs ${without.rows[2].healthcare}`);
  assert.strictEqual(withS.rows[8].healthcare, without.rows[8].healthcare, 'Medicare once the stream ends (A 71)');

  const lk = { ageA: 62, retireAgeA: 62 };
  const l1 = await engine({ ...lk, incomeSources: [W2({ startAge: 60, endAge: 66 })] });
  const l0 = await engine({ ...lk, incomeSources: [] });
  for (const y of [1, 2]) assert.strictEqual(l1.trace[y].medA, false, `IRMAA lookback covered y${y}`);
  for (const y of [3, 4]) assert.strictEqual(l1.trace[y].medA, true, `IRMAA lookback after the stream y${y}`);
  assert.strictEqual(l0.trace[1].medA, true, 'without the stream medA from y1');

  const se = await engine({ singlePerson: true, ageA: 64, retireAgeA: 68, incomeKindA: 'self', incomeA: 50000 });
  assert.strictEqual(se.rows[0].healthcare, 18000, 'self-employed A: marketplace');
  assert.strictEqual(se.rows[1].healthcare, 10000, 'self-employed A at 65: Medicare');

  // legacy identical
  const R = { ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 };
  const a = await engine({ ...R });
  const b = await engine({ ...R, incomeKindA: 'wages', incomeSources: [{ amount: 1000, startAge: 30, endAge: 31, kind: 'wages', healthPremium: 0 }] });
  assert.strictEqual(JSON.stringify(a.rows), JSON.stringify(b.rows), 'legacy identical');

  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('se_health: coverage passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
