// penaltyStatus / rule55Applies hooks (US, Batch 3B step 1): pure rules, no engine.
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
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const t = window.__test_penalty,
      st = window.__test_getState();
    const out = {};
    out.ira55 = t.penaltyStatus('ira', 56, { rule55: true }).free;
    out.k55 = t.penaltyStatus('k401', 56, { rule55: true }).free;
    out.q = [t.penaltyStatus('k401', 56, { rule55: true }).qualified, t.penaltyStatus('ira', 59.5).qualified, t.penaltyStatus('ira', 59.4).qualified];
    out.k56 = t.penaltyStatus('k401', 56).free;
    out.ira59 = t.penaltyStatus('ira', 59.4).free;
    out.ira595 = t.penaltyStatus('ira', 59.5).free;
    st.ruleOf55A = st.ruleOf55B = true;
    out.on = [t.rule55Applies(false, 55), t.rule55Applies(false, 54.9), t.rule55Applies(true, 60)];
    st.ruleOf55A = st.ruleOf55B = false;
    out.off = t.rule55Applies(false, 60);
    st.ruleOf55A = st.ruleOf55B = true;
    const ctx = { age: 60, ageB: 56, isSurvivorPeriod: false, deceasedIsA: false, workingA: false, workingB: false, retireAgeA: 60, retireAgeB: 56 };
    out.couple = t.accountStatuses(ctx).map((x) => x.free);
    out.dead = t.accountStatuses({ ...ctx, age: 45, ageB: 45, isSurvivorPeriod: true, deceasedIsA: true }).map((x) => [x.free, x.qualified]);
    st.ruleOf55A = st.ruleOf55B = false;
    return out;
  });
  assert.strictEqual(r.ira55, false, 'IRAs never get Rule of 55');
  assert.strictEqual(r.k55, true);
  assert.deepStrictEqual(r.q, [false, true, false], 'Rule of 55 is penalty-free but not qualified; 59.5 is qualified');
  assert.deepStrictEqual(r.couple, [true, true, false, true], 'A is 60: both free; B is 56 with Rule of 55: only the 401(k)');
  assert.deepStrictEqual(r.dead, [[true, true], [true, true], [false, false], [true, false]], 'the deceased partner\'s accounts are free and qualified; the survivor at 45 is penalized except her 401(k) under Rule of 55 (free, not qualified)');
  assert.strictEqual(r.k56, false);
  assert.strictEqual(r.ira59, false);
  assert.strictEqual(r.ira595, true);
  assert.deepStrictEqual(r.on, [true, false, false]);
  assert.strictEqual(r.off, false);
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('penalty status test passed');
})();
