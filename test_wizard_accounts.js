// Batch 3A UI: the Retirement accounts sidebar group and the three-step first-run wizard
// (US), plus the unchanged two-step Canada wizard. Run: node test_wizard_accounts.js
const { chromium } = require('playwright');
const path = require('path');

let failed = 0;
const check = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};

const ACCOUNTS = ['trad401k', 'tradIra', 'roth401k', 'rothIra'];

(async () => {
  const browser = await chromium.launch();
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
    await page.waitForTimeout(300);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);

    // ---- wizard: three steps ------------------------------------------------------
    await page.click('#wizardBtn');
    await page.waitForTimeout(100);
    const step = () =>
      page.evaluate(() => ({
        title: document.getElementById('wizardTitle').textContent,
        note: document.getElementById('wizardStepNote').textContent.slice(0, 12),
        shown: [...document.querySelectorAll('#wizardModal [data-wizard-step]')].map((e) => !e.hidden),
        back: !document.getElementById('wizardBackBtn').hidden,
        next: !document.getElementById('wizardNextBtn').hidden,
        done: !document.getElementById('wizardCloseBtn').hidden,
      }));
    let s = await step();
    check(s.shown.length === 3, `[${name}] US wizard has three steps`);
    check(s.title === 'Get started: the basics' && s.note === 'Step 1 of 3 ' && s.shown[0] && !s.back && s.next && !s.done, `[${name}] step 1: basics, Next only`);
    check(!(await visible('#wizardTrad401kA')), `[${name}] balances are not on step 1`);
    if (name === 'mobile') check(!(await overflow()), `[${name}] no horizontal overflow on step 1`);
    await page.click('#wizardNextBtn');
    s = await step();
    check(s.title === 'Your balances' && s.note === 'Step 2 of 3 ' && s.shown[1] && s.back && s.next && s.done, `[${name}] step 2: balances, Back/Next/Done`);
    for (const k of ACCOUNTS)
      for (const P of ['A', 'B']) {
        const id = `wizard${k[0].toUpperCase() + k.slice(1)}${P}`;
        check(await visible('#' + id), `[${name}] ${id} is shown on step 2`);
      }
    check(await visible('#wizardTaxable') && (await visible('#wizardCash')), `[${name}] taxable and cash are on step 2`);
    const callout = await page.evaluate(() => document.querySelector('.wizard-callout')?.innerText || '');
    check(/basis/i.test(callout) && /penalty/i.test(callout), `[${name}] the basis note is on step 2`);
    if (name === 'mobile') check(!(await overflow()), `[${name}] no horizontal overflow on step 2`);
    // Typing in the wizard drives the real control and the projection.
    const before = await page.evaluate(() => window.fireProjectionRows[0].investable);
    await page.fill('#wizardTrad401kA', '700000');
    await page.dispatchEvent('#wizardTrad401kA', 'change');
    await page.fill('#wizardTradIraB', '50000');
    await page.dispatchEvent('#wizardTradIraB', 'change');
    await page.fill('#wizardRoth401kA', '40000');
    await page.dispatchEvent('#wizardRoth401kA', 'change');
    await page.fill('#wizardRothIraB', '30000');
    await page.dispatchEvent('#wizardRothIraB', 'change');
    const st = await page.evaluate(() => {
      const s = window.__test_getState();
      return { a: s.trad401kA, b: s.tradIraB, c: s.roth401kA, d: s.rothIraB, row: window.fireProjectionRows[0].investable };
    });
    check(st.a === 700000 && st.b === 50000 && st.c === 40000 && st.d === 30000, `[${name}] wizard fields write the account state`);
    check(st.row !== before, `[${name}] the projection responds to the wizard balances`);
    check(
      (await page.inputValue('#trad401kA')).replace(/\D/g, '') === '700000' && (await page.inputValue('#rothIraB')).replace(/\D/g, '') === '30000',
      `[${name}] the sidebar fields show the wizard values`,
    );
    await page.click('#wizardNextBtn');
    s = await step();
    check(s.title === 'A few optional questions' && s.note === 'Step 3 of 3 ' && s.shown[2] && s.back && !s.next && s.done, `[${name}] step 3: optional questions, Back/Done`);
    if (name === 'mobile') check(!(await overflow()), `[${name}] no horizontal overflow on step 3`);
    await page.click('#wizardBackBtn');
    s = await step();
    check(s.shown[1], `[${name}] Back from step 3 returns to step 2`);
    // Single-person mode hides every Partner B balance in the wizard.
    await page.click('#wizardBackBtn');
    await page.click('#wizardSinglePerson');
    await page.click('#wizardNextBtn');
    for (const k of ACCOUNTS) check(!(await visible(`#wizard${k[0].toUpperCase() + k.slice(1)}B`)), `[${name}] single person hides Partner B ${k} in the wizard`);
    await page.click('#wizardCloseBtn');
    await page.waitForTimeout(100);
    // Done lands on the Dashboard tab on a phone; the sidebar lives on the Inputs tab.
    if (name === 'mobile') await page.click('#mobileTabInputs');

    // ---- sidebar group -------------------------------------------------------------
    check(await page.evaluate(() => !!document.getElementById('retirementAccountsGroup')), `[${name}] the Retirement accounts group exists`);
    await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
    for (const id of ['trad401kA', 'tradIraA', 'roth401kA', 'rothIraA', 'rothIraBasisA', 'roth401kBasisPctA'])
      check(await visible('#' + id), `[${name}] ${id} is shown in the sidebar`);
    for (const id of ['trad401kB', 'tradIraB', 'roth401kB', 'rothIraB', 'rothIraBasisB', 'roth401kBasisPctB'])
      check(!(await visible('#' + id)), `[${name}] ${id} is hidden in single-person mode`);
    for (const id of ['traditional', 'roth', 'traditionalSharePctA', 'rothBasisPct'])
      check(!(await page.evaluate((i) => !!document.getElementById(i), id)), `[${name}] retired control #${id} is gone`);
    check(/traditional/.test(await page.textContent('#retirementAccountsGroupState')), `[${name}] the group summary shows the totals`);
    await page.click('#singlePerson'); // back to a couple
    await page.waitForTimeout(100);
    check(await visible('#trad401kB'), `[${name}] Partner B accounts return with a couple plan`);
    // Single-person mode ignores Partner B's accounts in the projection.
    const couple = await page.evaluate(() => window.fireProjectionRows[0].investable);
    await page.click('#singlePerson');
    await page.waitForTimeout(150);
    const single = await page.evaluate(() => window.fireProjectionRows[0].investable);
    check(single < couple, `[${name}] single-person mode drops Partner B's balances from the plan (${single} < ${couple})`);
    // Roth 401(k) basis slider label.
    await page.evaluate(() => { const e = document.getElementById('roth401kBasisPctA'); e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); });
    check((await page.textContent('#roth401kBasisPctAOut')).includes('40%'), `[${name}] the Roth 401(k) basis slider shows its value`);
    if (name === 'mobile') check(!(await overflow()), `[${name}] no horizontal overflow with every group open`);
    check(errors.length === 0, `[${name}] no page errors ${errors.join(' | ')}`);
    await page.close();
  }

  // ---- Canada wizard is unchanged: two steps, same text ---------------------------
  const ca = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const caErrors = [];
  ca.on('pageerror', (e) => caErrors.push(e.message));
  await ca.goto('file://' + path.resolve(__dirname, 'Planner_Canada.html'));
  await ca.waitForTimeout(300);
  await ca.click('#wizardBtn');
  const c1 = await ca.evaluate(() => ({
    n: document.querySelectorAll('#wizardModal [data-wizard-step]').length,
    title: document.getElementById('wizardTitle').textContent,
    note: document.getElementById('wizardStepNote').textContent,
  }));
  check(c1.n === 2 && c1.title === 'Get started: the basics' && c1.note.startsWith('Step 1 of 2 — enter the essentials'), 'Canada wizard still has two steps with its original step-1 text');
  await ca.fill('#wizardTraditional', '123000');
  await ca.dispatchEvent('#wizardTraditional', 'change');
  check((await ca.evaluate(() => window.__test_getState().traditional)) === 123000, 'Canada wizard RRSP field still drives the real control');
  await ca.click('#wizardNextBtn');
  const c2 = await ca.evaluate(() => ({ title: document.getElementById('wizardTitle').textContent, next: document.getElementById('wizardNextBtn').hidden, done: !document.getElementById('wizardCloseBtn').hidden }));
  check(c2.title === 'A few optional questions' && c2.next && c2.done, 'Canada step 2 is the last step (Done, no Next)');
  check(caErrors.length === 0, 'Canada: no page errors');
  await browser.close();
  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll wizard/retirement-account checks passed.');
})();
