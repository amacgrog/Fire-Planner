// Employer-plan and IRA contribution limits (E1a). Task 2: the PLAN_LIMITS table and allocatePlanRoom, with tests that
// pin today's contribution math (no number change). Spec: docs/superpowers/specs/2026-10-08-e1a-plan-contribution-limits-design.md.
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
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const rc = (patch, args) =>
    page.evaluate(
      ([p, a]) =>
        window.__test_retirementContributions(p, {
          wageB: 0, ageB: null, singlePerson: true, limitFactor: 1, matchA: 0, matchB: 0, ...a,
        }),
      [patch, args],
    );
  const alloc = (room, amounts) => page.evaluate(([r, a]) => window.__test_allocatePlanRoom(r, a), [room, amounts]);
  const P0 = {
    k401Type: 'traditional', iraType: 'roth', k401PctA: 100, catchupPctA: 100, iraPctA: 0,
    megaBackdoor: true, megaPctA: 100, matchA: 0,
  };

  // Under 50, no catch-up: deferral 24,500, then the mega-backdoor fills the 72,000 annual-additions limit.
  let r = await rc(P0, { wageA: 200000, age: 40 });
  assert.strictEqual(r.acct.trad[1], 24500, 'deferral');
  assert.strictEqual(r.acct.roth[1], 47500, 'mega-backdoor room');
  // Indexing: every limit scales with limitFactor.
  r = await rc(P0, { wageA: 200000, age: 40, limitFactor: 1.1 });
  near(r.acct.trad[1], 26950, 1e-9, 'indexed deferral');
  near(r.acct.roth[1], 52250, 1e-9, 'indexed mega room');
  // IRA limit, with and without the age-50 catch-up.
  const ira = { ...P0, iraPctA: 100, megaBackdoor: false };
  r = await rc(ira, { wageA: 200000, age: 55 });
  assert.strictEqual(r.acct.roth[0], 8600, 'IRA at 55');
  r = await rc(ira, { wageA: 200000, age: 40 });
  assert.strictEqual(r.acct.roth[0], 7500, 'IRA at 40');
  // Pay below the deferral limit.
  r = await rc({ ...P0, megaBackdoor: false }, { wageA: 20000, age: 40 });
  assert.strictEqual(r.acct.trad[1], 20000, 'pay below the limit');

  // allocatePlanRoom
  let a = await alloc(100, [30, 50, 40]);
  assert.deepStrictEqual(a, { out: [30, 50, 20], left: 0 });
  a = await alloc(100, [30, 20]);
  assert.deepStrictEqual(a, { out: [30, 20], left: 50 });
  a = await alloc(0, [10]);
  assert.deepStrictEqual(a, { out: [0], left: 0 });
  a = await alloc(-5, [10]);
  assert.deepStrictEqual(a, { out: [0], left: 0 });
  a = await alloc(50, [-10, 20]);
  assert.deepStrictEqual(a, { out: [0, 20], left: 30 });
  // Canada-shaped list: an employer DPSP contribution and a group-RRSP match ahead of the employee's RRSP in one yearly
  // room; nothing in the allocator is US-specific.
  a = await alloc(33810, [10000, 5000, 25000]);
  assert.deepStrictEqual(a, { out: [10000, 5000, 18810], left: 0 });

  assert.deepStrictEqual(errors, []);
  console.log('contribution_limits: all passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
