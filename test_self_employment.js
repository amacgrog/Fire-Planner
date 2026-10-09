// E1c: self-employment UI (US): income type buttons, stream kind `self`, profit sharing and premium fields. Spec:
// docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md. Not run by CI.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
  await page.waitForTimeout(300);
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
  const hidden = (id) => page.evaluate((i) => document.getElementById(i).hidden, id);
  const dynHidden = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i);
      return !el || el.closest('[data-dyn-wrap]').hidden;
    }, id);
  const click = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
  const setSelect = (id, v) =>
    page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
  const setCheck = (id, v) =>
    page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.checked = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);

  // ---- Part 1: inputs ----
  assert.strictEqual((await state()).incomeKindA, 'wages');
  assert(await page.evaluate(() => document.getElementById('incomeKindAWagesBtn').classList.contains('active')), 'W-2 active');
  assert(!(await hidden('matchAField')), 'match shown');
  assert(!(await hidden('healthPremiumAField')), 'premium shown');

  await click('incomeKindASelfBtn');
  assert.strictEqual((await state()).incomeKindA, 'self');
  assert.strictEqual(await hidden('matchAField'), true);
  assert.strictEqual(await hidden('healthPremiumAField'), true);
  await click('incomeKindAWagesBtn');
  assert.strictEqual((await state()).incomeKindA, 'wages');
  assert.strictEqual(await hidden('matchAField'), false);
  assert.strictEqual(await hidden('healthPremiumAField'), false);

  await click('incomeKindBSelfBtn');
  assert.strictEqual((await state()).incomeKindB, 'self');
  assert.strictEqual(await hidden('matchBField'), true);
  assert.strictEqual(await hidden('healthPremiumBField'), true);
  await setCheck('singlePerson', true);
  assert.strictEqual(
    await page.evaluate(() => document.getElementById('incomeKindBSelfBtn').closest('[data-partner-b]').hidden),
    true,
    'B type buttons hidden in single-person mode'
  );
  await setCheck('singlePerson', false);
  await click('incomeKindBWagesBtn');

  // streams
  await page.evaluate(() => document.querySelector('[data-dyn-add="incomeSources"]').click());
  await page.waitForTimeout(100);
  const opts = await page.evaluate(() => [...document.getElementById('incSrc0Kind').options].map((o) => o.value));
  assert.deepStrictEqual(opts, ['other', 'wages', 'self']);
  assert(await dynHidden('incSrc0HealthPremium'), 'premium hidden for Not earned');
  await setSelect('incSrc0Kind', 'wages');
  assert(!(await dynHidden('incSrc0HealthPremium')), 'premium shown for W-2');
  await setSelect('incSrc0Kind', 'self');
  assert(await dynHidden('incSrc0HealthPremium'), 'premium hidden for self');
  await setCheck('incSrc0Contribute', true);
  assert(!(await dynHidden('incSrc0ProfitSharingPct')), 'profit sharing shown for self + contribute');
  assert(await dynHidden('incSrc0MatchPct'), 'match hidden for self');
  await setSelect('incSrc0Kind', 'wages');
  assert(!(await dynHidden('incSrc0MatchPct')), 'match shown for W-2 + contribute');
  assert(await dynHidden('incSrc0ProfitSharingPct'), 'profit sharing hidden for W-2');
  await setSelect('incSrc0Kind', 'self');
  const s0 = (await state()).incomeSources[0];
  assert.strictEqual(s0.profitSharingPct, 0);
  assert.strictEqual(s0.healthPremium, 0);

  // 390 x 844 with the panel open
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.strictEqual(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    false,
    'no horizontal scroll at 390'
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  // reload keeps the choice
  await click('incomeKindASelfBtn');
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForTimeout(300);
  assert.strictEqual((await state()).incomeKindA, 'self');

  // normalization
  await page.evaluate(() =>
    window.__test_replaceState({
      incomeKindA: 'x',
      incomeSources: [{ amount: 1, startAge: 50, endAge: 60, kind: 'self', profitSharingPct: 40, healthPremium: -5 }],
    })
  );
  const n = await state();
  assert.strictEqual(n.incomeKindA, 'wages');
  assert.strictEqual(n.incomeSources[0].kind, 'self');
  assert.strictEqual(n.incomeSources[0].profitSharingPct, 25);
  assert.strictEqual(n.incomeSources[0].healthPremium, 0);

  assert.deepStrictEqual(errors, []);
  console.log('test_self_employment: part 1 passed');
  // Part 2 (Task 6)

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
