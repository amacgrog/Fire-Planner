// E1d: one-time income tax treatment and owner (US UI). Spec:
// docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState().oneTimeIncome)));
  const wrapHidden = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i);
      return !el || el.closest('[data-dyn-wrap]').hidden;
    }, id);
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
  const setInput = (id, v) =>
    page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);

  await page.evaluate(() => document.querySelector('[data-dyn-add="oneTimeIncome"]').click());
  await page.waitForTimeout(100);
  // fresh row: kind free; owner, gain share and checkbox hidden
  assert.strictEqual(await page.$eval('#oneTime0Kind', (e) => e.value), 'free');
  for (const id of ['oneTime0Owner', 'oneTime0GainPct', 'oneTime0ActiveBusiness'])
    assert(await wrapHidden(id), id + ' hidden for a tax-free row');
  await setSelect('oneTime0Kind', 'wages');
  assert(!(await wrapHidden('oneTime0Owner')), 'owner shown for wages (couple)');
  assert(await wrapHidden('oneTime0GainPct'), 'gain share hidden for wages');
  await setSelect('oneTime0Kind', 'gain');
  for (const id of ['oneTime0Owner', 'oneTime0GainPct', 'oneTime0ActiveBusiness'])
    assert(!(await wrapHidden(id)), id + ' shown for a gain row');
  await setCheck('singlePerson', true);
  assert(await wrapHidden('oneTime0Owner'), 'owner hidden in single-person mode');
  await setCheck('singlePerson', false);

  // reload round trip (autosave)
  await setSelect('oneTime0Owner', 'B');
  await setInput('oneTime0GainPct', 40);
  await setCheck('oneTime0ActiveBusiness', true);
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForTimeout(400);
  let r = (await st())[0];
  assert.strictEqual(r.kind, 'gain');
  assert.strictEqual(r.owner, 'B');
  assert.strictEqual(r.gainPct, 40);
  assert.strictEqual(r.activeBusiness, true);

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal scroll');
  await page.setViewportSize({ width: 1280, height: 900 });

  // a kind change reaches the projection
  await setSelect('oneTime0Kind', 'free');
  await setSelect('oneTime0Owner', 'A');
  await setInput('oneTime0Amount', 50000);
  await setCheck('oneTime0Flat', true);
  await setInput('oneTime0Age', await page.evaluate(() => window.__test_getState().ageA + 1));
  await page.waitForTimeout(200);
  const lumpYearRow = async () => page.evaluate(() => {
    const age = window.__test_getState().oneTimeIncome[0].age;
    const r = window.fireProjectionRows.find((x) => x.age === age);
    return { tax: r.tax, wages: r.wages };
  });
  const asFree = await lumpYearRow();
  await setSelect('oneTime0Kind', 'wages');
  await page.waitForTimeout(200);
  const asWages = await lumpYearRow();
  // the engine reads the kind: a wages lump enters the flow and is taxed
  assert(asWages.wages - asFree.wages > 49999, 'wages kind: the lump is in row.wages');
  assert(asWages.tax > asFree.tax, 'wages kind: the lump is taxed');

  // normalization through the same normalizer
  const norm = (raw) =>
    page.evaluate((r) => {
      window.__test_replaceState(r);
      return JSON.parse(JSON.stringify(window.__test_getState().oneTimeIncome));
    }, raw);
  const full = (o) => ({ flat: false, kind: 'free', owner: 'A', gainPct: 100, activeBusiness: false, ...o });
  assert.deepStrictEqual(
    await norm({ oneTimeIncome: [
      { amount: 50000, age: 60, flat: true, kind: 'wages', owner: 'B' },
      { amount: 20000, age: 61, flat: false, kind: 'ordinary', owner: 'A' },
      { amount: 300000, age: 62, flat: true, kind: 'gain', owner: 'B', gainPct: 40, activeBusiness: true } ] }),
    [full({ amount: 50000, age: 60, flat: true, kind: 'wages', owner: 'B' }), full({ amount: 20000, age: 61, kind: 'ordinary' }),
     full({ amount: 300000, age: 62, flat: true, kind: 'gain', owner: 'B', gainPct: 40, activeBusiness: true })]);
  const junk = await norm({ oneTimeIncome: [
    { amount: 1000, age: 60, kind: 'inherited', owner: 'b', gainPct: -5, activeBusiness: 'yes' },
    { amount: 1000, age: 61, kind: 'gain', gainPct: 250 },
    { amount: 1000, age: 62, kind: 'gain', gainPct: 'x' },
    { amount: 1000, age: 63 } ] });
  assert.deepStrictEqual(junk.map((x) => x.kind), ['free', 'gain', 'gain', 'free']);
  assert.deepStrictEqual(junk.map((x) => x.owner), ['A', 'A', 'A', 'A']);
  assert.deepStrictEqual(junk.map((x) => x.gainPct), [0, 100, 100, 100]);
  assert.deepStrictEqual(junk.map((x) => x.activeBusiness), [false, false, false, false]);
  assert.deepStrictEqual(
    await norm({ otherIncomeEnabled: true, oneTimeIncome: [ { enabled: true, amount: 5000, age: 60, kind: 'wages', owner: 'B' }, { enabled: false, amount: 9, age: 61 } ] }),
    [full({ amount: 5000, age: 60 })]);

  assert.deepStrictEqual(errors, [], 'page errors');
  console.log('test_lump_income: passed');
  await browser.close();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
