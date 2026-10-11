// E1e: inherited traditional and Roth IRA / 401(k) accounts (US UI). Spec:
// docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md.
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
  const setInput = (id, v) =>
    page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
  const summary = () => page.$eval('#otherIncomeGroupState', (e) => e.textContent.trim());

  await page.evaluate(() => document.querySelector('[data-dyn-add="oneTimeIncome"]').click());
  await page.waitForTimeout(100);
  const options = await page.$$eval('#oneTime0Kind option', (o) => o.map((x) => x.value));
  assert.deepStrictEqual(options, ['free', 'wages', 'ordinary', 'gain', 'inheritedTrad', 'inheritedRoth'], 'the select offers both inherited kinds after the four existing ones');
  for (const kind of ['inheritedTrad', 'inheritedRoth']) {
    await setSelect('oneTime0Kind', kind);
    assert.strictEqual(await page.$eval('#oneTime0Kind', (e) => e.value), kind, kind + ' selectable');
    assert(!(await wrapHidden('oneTime0Owner')), 'owner shown for ' + kind + ' (couple)');
    assert(await wrapHidden('oneTime0GainPct'), 'gain share hidden for ' + kind);
    assert(await wrapHidden('oneTime0ActiveBusiness'), 'the NIIT box hidden for ' + kind);
  }
  await page.evaluate(() => { const c = document.getElementById('singlePerson'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  assert(await wrapHidden('oneTime0Owner'), 'owner hidden in single-person mode');
  await page.evaluate(() => { const c = document.getElementById('singlePerson'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });

  // the income-group summary: an inherited row names itself
  assert.strictEqual(await summary(), '✓ inherited account planned');

  // a kind change from free to inheritedTrad reaches the projection: the rows gain inheritedTrad
  await setSelect('oneTime0Kind', 'free');
  await setInput('oneTime0Amount', 300000);
  await page.evaluate(() => { const c = document.getElementById('oneTime0Flat'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await setInput('oneTime0Age', await page.evaluate(() => window.__test_getState().ageA + 2));
  await page.waitForTimeout(200);
  assert(!(await page.evaluate(() => window.fireProjectionRows.some((r) => 'inheritedTrad' in r))), 'free: no inherited field in any row');
  await setSelect('oneTime0Kind', 'inheritedTrad');
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => window.fireProjectionRows.filter((r) => 'inheritedTrad' in r).map((r) => ({ age: r.age, trad: r.inheritedTrad, draw: r.inheritedDraw })));
  assert(rows.length >= 10, 'inheritedTrad: rows carry the inherited balance for the window (' + rows.length + ')');
  assert.strictEqual(rows[0].trad, 300000, 'the receipt year opens at the entered amount');
  assert(rows.some((r) => r.draw > 0), 'inheritedTrad: draws appear');

  // the status cell's tooltip in an inherited year says so
  const tips = await page.evaluate(() => [...document.querySelectorAll('#projectionRows tr')].map((tr) => (tr.querySelector('.table-status') || {}).title || '').filter((t) => /inherited/i.test(t)));
  assert(tips.length > 0 && /inherited traditional \$/.test(tips[0]), 'a status tooltip mentions the inherited balance: ' + JSON.stringify(tips.slice(0, 1)));

  // S-1: the tooltip speaks the table's units (today's dollars by default), so its figure equals the column's own inherited part
  await setInput('inflation', 3);
  await setInput('ageA', 60);
  await setInput('oneTime0Age', 60);
  await setInput('oneTime0Amount', 400000);
  await page.waitForTimeout(300);
  const tipAt = (age) =>
    page.evaluate((a) => {
      for (const tr of document.querySelectorAll('#projectionRows tr'))
        if (Number(tr.cells[0].textContent) === a) return (tr.querySelector('.table-status') || {}).title || '';
      return null;
    }, age);
  const amt = (t, label) => { const m = new RegExp(label + ' \\$([\\d,]+)').exec(t || ''); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
  const inh67 = await page.evaluate(() => window.fireProjectionRows.find((r) => r.age === 67));
  assert(inh67.inheritedDraw > 0, 'a draw in year 7');
  const tip67 = await tipAt(67);
  assert(/inherited drawn this year \$/.test(tip67), 'the draw appears: ' + tip67);
  assert(Math.abs(amt(tip67, 'inherited traditional') - inh67.inheritedTrad / Math.pow(1.03, 7)) <= 1, "tooltip in today's dollars: " + tip67);
  assert(Math.abs(amt(tip67, 'drawn this year') - inh67.inheritedDraw / Math.pow(1.03, 7)) <= 1, "draw in today's dollars: " + tip67);
  await page.evaluate(() => document.getElementById('nominalBtn').click());
  await page.waitForTimeout(250);
  const tipNom = await tipAt(67);
  assert(Math.abs(amt(tipNom, 'inherited traditional') - inh67.inheritedTrad) <= 1, 'nominal view shows nominal amounts: ' + tipNom);
  await page.evaluate(() => document.getElementById('realBtn').click());
  await page.waitForTimeout(150);

  // an income stream beside it
  await page.evaluate(() => document.querySelector('[data-dyn-add="incomeSources"]').click());
  await page.waitForTimeout(100);
  await setInput('incSrc0Amount', 10000);
  await page.waitForTimeout(150);
  assert.strictEqual(await summary(), '✓ $10K/yr + inherited account');

  // mobile: no horizontal scroll with an inherited row open
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal scroll (390x844)');
  await page.setViewportSize({ width: 1280, height: 900 });

  assert.deepStrictEqual(errors, [], 'page errors');
  console.log('test_inherited_accounts: passed');
  await browser.close();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
