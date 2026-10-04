// penaltyStatus / incomeRoom / rule55Applies hooks (US, Batch 3B step 1): pure rules, no engine.
//
//   node tests/penalty_status.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const t = window.__test_penalty,
      st = window.__test_getState();
    const out = {};
    out.ira55 = t.penaltyStatus('ira', 56, { rule55: true }).free;
    out.k55 = t.penaltyStatus('k401', 56, { rule55: true }).free;
    out.rk55 = t.penaltyStatus('roth401k', 56, { rule55: true }).free;
    out.rira55 = t.penaltyStatus('rothIra', 56, { rule55: true }).free;
    out.k56 = t.penaltyStatus('k401', 56).free;
    out.ira59 = t.penaltyStatus('ira', 59.4).free;
    out.ira595 = t.penaltyStatus('ira', 59.5).free;
    st.ruleOf55Enabled = true;
    out.on = [t.rule55Applies(false, 55), t.rule55Applies(false, 54.9), t.rule55Applies(true, 60)];
    st.ruleOf55Enabled = false;
    out.off = t.rule55Applies(false, 60);
    out.room = [t.incomeRoom(50000, 20000), t.incomeRoom(10000, 20000)];
    return out;
  });
  assert.strictEqual(r.ira55, false, 'IRAs never get Rule of 55');
  assert.strictEqual(r.rira55, false, 'Roth IRAs never get Rule of 55');
  assert.strictEqual(r.k55, true);
  assert.strictEqual(r.rk55, true);
  assert.strictEqual(r.k56, false);
  assert.strictEqual(r.ira59, false);
  assert.strictEqual(r.ira595, true);
  assert.deepStrictEqual(r.on, [true, false, false]);
  assert.strictEqual(r.off, false);
  assert.deepStrictEqual(r.room, [30000, 0]);
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('penalty status test passed');
})();
