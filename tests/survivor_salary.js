// A partner who dies before their retirement age stops working at death (E1b, both planners). Spec:
// docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md section 6. Hand-computed: zero growth, zero inflation.
const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const assert = require('assert');
const path = require('path');

const BASE = {
  singlePerson: false, ageA: 60, ageB: 58, retireAgeA: 68, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92,
  incomeA: 100000, incomeB: 50000, incomeGrowth: 0, inflation: 0, healthPremiumA: 0, healthPremiumB: 0,
  survivorEnabled: true, incomeSources: [],
};

async function run(browser, planner, isUS) {
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + plannerPath(planner));
  await page.waitForTimeout(250);
  const sim = (patch) =>
    page.evaluate((p) => {
      const st = window.__test_getState();
      for (const k of Object.keys(p)) {
        assert_has(st, k);
        st[k] = p[k];
      }
      function assert_has(o, k) { if (!(k in o)) throw new Error('state has no key ' + k); }
      const r = window.__test_simulate();
      return r.rows.map((x) => ({ wages: x.wages, workingA: x.workingA, workingB: x.workingB }));
    }, patch);
  const tag = planner + ': ';

  let rows = await sim({ ...BASE, survivorPartner: 'A', survivorDeathAge: 67 });
  assert.strictEqual(rows[6].wages, 150000, tag + 'death year: A 66, both work');
  assert.strictEqual(rows[7].wages, 50000, tag + "death year: A's wages stop");
  assert.strictEqual(rows[7].workingA, false, tag + 'workingA false in the death year');
  assert.strictEqual(rows[8].wages, 0, tag + 'B 66 is retired');

  rows = await sim({ ...BASE, survivorPartner: 'B', survivorDeathAge: 64 });
  assert.strictEqual(rows[5].wages, 150000, tag + 'mirror: before');
  assert.strictEqual(rows[6].wages, 100000, tag + "mirror: B's wages stop");
  assert.strictEqual(rows[6].workingB, false, tag + 'workingB false');

  rows = await sim({ ...BASE, survivorPartner: 'A', survivorDeathAge: 59 });
  assert.strictEqual(rows[0].wages, 50000, tag + 'already dead: no salary at all');
  assert.strictEqual(rows[0].workingA, false, tag + 'already dead: workingA false');

  rows = await sim({ ...BASE, survivorPartner: 'A', survivorDeathAge: 80 });
  assert.strictEqual(rows[7].wages, 150000, tag + 'death after retirement: unchanged');

  if (isUS) {
    const DY = { ...BASE, survivorPartner: 'A', survivorDeathAge: 67, k401PctA: 100, catchupPctA: 0, iraPctA: 0, matchA: 0,
      profitSharingPctA: 0, megaBackdoor: false, returnRate: 0, bondReturn: 0, hysaRate: 0, bondYears: 0 };
    const tr = await page.evaluate((p) => {
      const st = window.__test_getState();
      for (const k of Object.keys(p)) st[k] = p[k];
      return window.__test_accountTrace().map((t) => ({ trad: t.trad }));
    }, DY);
    assert.strictEqual(tr[6].trad[1] - tr[5].trad[1], 24500, 'A contributes at 66');
    assert.strictEqual(tr[7].trad[1], tr[6].trad[1], 'nothing contributed in the death year');
  }
  assert.deepStrictEqual(errors, [], tag + 'page errors');
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'Planner_US.html', true);
  await run(browser, 'Planner_Canada.html', false);
  await browser.close();
  console.log('survivor_salary: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
