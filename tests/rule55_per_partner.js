// Rule of 55 per partner (US, PR 1 of 3C): ruleOf55A / ruleOf55B replace the household ruleOf55Enabled.
//
//   node tests/rule55_per_partner.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

async function openPlanner() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  return { browser, page, errors };
}

// Rule of 55 per partner (PR 1): each partner's box covers that partner's 401(k)s only; an old save's
// household box ticks both; the box is enabled only for a retirement age from 55 to 59.
(async () => {
  const { browser, page, errors } = await openPlanner();
  const statuses = (patch, age, ageB) =>
    page.evaluate(({ patch, age, ageB }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return window.__test_accountStatuses({ age, ageB, isSurvivorPeriod: false, deceasedIsA: false, workingA: false, workingB: false, retireAgeA: st.retireAgeA, retireAgeB: st.retireAgeB });
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch, age, ageB });
  const couple = { singlePerson: false, retireAgeA: 56, retireAgeB: 56 };
  // Slots: [IRA A, 401(k) A, IRA B, 401(k) B].
  let s = await statuses({ ...couple, ruleOf55A: true, ruleOf55B: false }, 57, 57);
  assert.deepStrictEqual(s.map((x) => x.free), [false, true, false, false], 'A only: A 401(k) free');
  s = await statuses({ ...couple, ruleOf55A: false, ruleOf55B: true }, 57, 57);
  assert.deepStrictEqual(s.map((x) => x.free), [false, false, false, true], 'B only: B 401(k) free');
  s = await statuses({ ...couple, retireAgeA: 54, ruleOf55A: true, ruleOf55B: false }, 57, 57);
  assert.deepStrictEqual(s.map((x) => x.free), [false, false, false, false], 'retired at 54: no Rule of 55');

  // Migration: an old save with the household box loads with both partners ticked; the old key is gone.
  const migrated = await page.evaluate(() => window.__test_normalizeState({ ruleOf55Enabled: true }));
  assert.strictEqual(migrated.ruleOf55A, true);
  assert.strictEqual(migrated.ruleOf55B, true);
  assert.strictEqual('ruleOf55Enabled' in migrated, false);
  const off = await page.evaluate(() => window.__test_normalizeState({ ruleOf55Enabled: false }));
  assert.strictEqual(off.ruleOf55A, false);
  assert.strictEqual(off.ruleOf55B, false);

  // The checkbox is enabled only for a retirement age 55-59.
  const enabled = (retireAgeA) =>
    page.evaluate((r) => {
      Object.assign(window.__test_getState(), { retireAgeA: r, ageA: Math.min(r, 50) });
      window.__test_syncControls();
      return !document.getElementById('ruleOf55A').disabled;
    }, retireAgeA);
  assert.strictEqual(await enabled(54), false, 'retire 54: disabled');
  assert.strictEqual(await enabled(55), true, 'retire 55: enabled');
  assert.strictEqual(await enabled(59), true, 'retire 59: enabled');
  assert.strictEqual(await enabled(60), false, 'retire 60: disabled (no penalty to avoid)');
  assert.deepStrictEqual(errors, []);
  console.log('rule55_per_partner: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
