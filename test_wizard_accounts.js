// Batch 3A UI: the Retirement accounts sidebar group and the three-step first-run wizard (basics, balances, goals) in both planners. Run: node test_wizard_accounts.js
const { chromium } = require('playwright');
const path = require('path');

let failed = 0;
const check = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};

const ACCOUNTS = ['trad401k', 'tradIra', 'roth401k', 'rothIra'];


// Step 3 of either wizard: labels equal the chips', features follow the ticks, a feature already on stays on, retire changes
// nothing, removed checkboxes are gone, Done lands on the guidance card.
async function goalChecks(page, name, country, featureId, extraGoal, extraFeature) {
  const labels = await page.evaluate(() => [...document.querySelectorAll('#wizardGoalList .field')].map((f) => f.textContent.trim()));
  const chips = await page.evaluate(() => [...document.querySelectorAll('#guidanceGoals [data-goal]')].map((c) => c.textContent.trim()));
  check(labels.length > 0 && JSON.stringify(labels) === JSON.stringify(chips), `[${name}] ${country} step 3 labels equal the chip labels`);
  const feat = (id) => page.evaluate((i) => window.__test_getState()[i], id);
  const tick = async (goal, on) => {
    await page.evaluate(([g, o]) => {
      const b = document.querySelector(`[data-wizard-goal="${g}"]`);
      if (b.checked !== o) b.click();
    }, [goal, on]);
  };
  const goalsOf = () => page.evaluate(() => window.__test_getState().guidanceGoals);
  check((await feat(featureId)) === false, `[${name}] ${country} ${featureId} starts off`);
  await tick('convert', true);
  check((await feat(featureId)) === true && (await goalsOf()).includes('convert'), `[${name}] ${country} ticking convert turns ${featureId} on`);
  await tick('convert', false);
  check((await feat(featureId)) === false && !(await goalsOf()).includes('convert'), `[${name}] ${country} unticking convert turns it back off`);
  if (extraGoal) {
    await tick(extraGoal, true);
    check((await feat(extraFeature)) === true, `[${name}] ${country} ticking ${extraGoal} turns ${extraFeature} on`);
    await tick(extraGoal, false);
    check((await feat(extraFeature)) === false, `[${name}] ${country} unticking ${extraGoal} turns ${extraFeature} off`);
  }
  const noRetire = await page.evaluate(() => JSON.stringify({ ...window.__test_getState(), guidanceGoals: 0 }));
  await tick('retire', true);
  const withRetire = await page.evaluate(() => JSON.stringify({ ...window.__test_getState(), guidanceGoals: 0 }));
  check(noRetire === withRetire && (await goalsOf()).includes('retire'), `[${name}] ${country} ticking retire changes only guidanceGoals`);
  await tick('retire', false);
  const removed = await page.evaluate(() => ['wizardLtcEnabled', 'wizardAcaEnabled', 'wizardRothConvEnabled', 'wizardMegaBackdoor', 'wizardMeltdownEnabled', 'wizardGuardrailsEnabled'].filter((i) => document.getElementById(i)));
  check(removed.length === 0, `[${name}] ${country} the old feature checkboxes are gone ${removed}`);
}

// A feature already on before the wizard opens stays on after a tick and an untick.
async function alreadyOnCheck(page, name, country, featureId) {
  await page.evaluate((id) => { const b = document.getElementById(id); if (!b.checked) b.click(); }, featureId);
  await page.click('#wizardBtn');
  await page.click('#wizardNextBtn');
  await page.click('#wizardNextBtn');
  await page.click('[data-wizard-goal="convert"]');
  await page.click('[data-wizard-goal="convert"]');
  check((await page.evaluate((id) => window.__test_getState()[id], featureId)) === true, `[${name}] ${country} ${featureId} was already on and stays on`);
}

// Done closes the overlay, lands on the dashboard on a phone and brings the guidance card into view.
async function doneCheck(page, name, country) {
  await page.click('#wizardCloseBtn');
  check(!(await page.evaluate(() => document.getElementById('wizardOverlay').classList.contains('open'))), `[${name}] ${country} Done closes the wizard`);
  if (name === 'mobile') check((await page.getAttribute('#workspace', 'data-mobile-view')) === 'dashboard', `[${name}] ${country} Done lands on the dashboard`);
  const inView = await page.waitForFunction(() => { const r = document.getElementById('guidanceCard').getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight; }, null, { timeout: 5000 }).then(() => true, () => false);
  check(inView, `[${name}] ${country} the guidance card is in the viewport after Done`);
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
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
    check(!(await page.evaluate(() => !!document.querySelector('.wizard-callout'))), `[${name}] the basis callout is gone`);
    for (const id of ['wizardRothIraBasisA', 'wizardRoth401kBasisPctA', 'wizardRothIraBasisB', 'wizardRoth401kBasisPctB'])
      check(await visible('#' + id), `[${name}] ${id} is shown on step 2`);
    await page.fill('#wizardRothIraBasisA', '25000');
    await page.dispatchEvent('#wizardRothIraBasisA', 'change');
    check((await page.evaluate(() => window.__test_getState().rothIraBasisA)) === 25000, `[${name}] the Roth IRA basis box writes state.rothIraBasisA`);
    check((await page.inputValue('#rothIraBasisA')).replace(/\D/g, '') === '25000', `[${name}] the sidebar basis box reads 25000`);
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
    check(s.title === 'What are you trying to decide?' && s.note === 'Step 3 of 3 ' && s.shown[2] && s.back && !s.next && s.done, `[${name}] step 3: goals, Back/Done`);
    if (name === 'mobile') check(!(await overflow()), `[${name}] no horizontal overflow on step 3`);
    await goalChecks(page, name, 'US', 'rothConvEnabled', 'aca', 'acaEnabled');
    await page.click('#wizardBackBtn');
    s = await step();
    check(s.shown[1], `[${name}] Back from step 3 returns to step 2`);
    // Single-person mode hides every Partner B balance in the wizard.
    await page.click('#wizardBackBtn');
    await page.click('#wizardSinglePerson');
    await page.click('#wizardNextBtn');
    for (const k of ACCOUNTS) check(!(await visible(`#wizard${k[0].toUpperCase() + k.slice(1)}B`)), `[${name}] single person hides Partner B ${k} in the wizard`);
    await page.click('#wizardNextBtn');
    check(!(await visible('[data-wizard-goal="survivor"]')), `[${name}] a single plan hides the survivor goal`);
    await doneCheck(page, name, 'US');
    await alreadyOnCheck(page, name, 'US', 'rothConvEnabled');
    await doneCheck(page, name, 'US');
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

  // ---- Canada wizard: three steps, balances on step 2, goals on step 3 ---------------
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const ca = await browser.newPage({ viewport: { width, height } });
    const caErrors = [];
    ca.on('pageerror', (e) => caErrors.push(e.message));
    await ca.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_Canada.html'));
    await ca.waitForTimeout(300);
    const vis = (sel) => ca.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
    const ovf = () => ca.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const cs = () => ca.evaluate(() => ({ title: document.getElementById('wizardTitle').textContent, note: document.getElementById('wizardStepNote').textContent.slice(0, 12), n: document.querySelectorAll('#wizardModal [data-wizard-step]').length, back: !document.getElementById('wizardBackBtn').hidden, next: !document.getElementById('wizardNextBtn').hidden, done: !document.getElementById('wizardCloseBtn').hidden }));
    await ca.click('#wizardBtn');
    let c = await cs();
    check(c.n === 3 && c.title === 'Get started: the basics' && c.note === 'Step 1 of 3 ' && !c.back && c.next && !c.done, `[${name}] Canada step 1: basics, Next only`);
    for (const id of ['wizardTaxable', 'wizardTraditional', 'wizardRoth', 'wizardCash']) check(!(await vis('#' + id)), `[${name}] Canada ${id} is not on step 1`);
    if (name === 'mobile') check(!(await ovf()), `[${name}] Canada no horizontal overflow on step 1`);
    await ca.click('#wizardNextBtn');
    c = await cs();
    check(c.title === 'Your balances' && c.note === 'Step 2 of 3 ' && c.back && c.next && c.done, `[${name}] Canada step 2: balances, Back/Next/Done`);
    for (const id of ['wizardTaxable', 'wizardTraditional', 'wizardRoth', 'wizardCash']) check(await vis('#' + id), `[${name}] Canada ${id} is on step 2`);
    await ca.fill('#wizardTraditional', '123000');
    await ca.dispatchEvent('#wizardTraditional', 'change');
    check((await ca.evaluate(() => window.__test_getState().traditional)) === 123000, `[${name}] Canada wizard RRSP field drives the real control`);
    if (name === 'mobile') check(!(await ovf()), `[${name}] Canada no horizontal overflow on step 2`);
    await ca.click('#wizardNextBtn');
    c = await cs();
    check(c.title === 'What are you trying to decide?' && c.note === 'Step 3 of 3 ' && c.back && !c.next && c.done, `[${name}] Canada step 3: goals, Back/Done`);
    if (name === 'mobile') check(!(await ovf()), `[${name}] Canada no horizontal overflow on step 3`);
    await goalChecks(ca, name, 'Canada', 'meltdownEnabled');
    await ca.click('#wizardCloseBtn');
    await alreadyOnCheck(ca, name, 'Canada', 'meltdownEnabled');
    await doneCheck(ca, name, 'Canada');
    check(caErrors.length === 0, `[${name}] Canada: no page errors ${caErrors.join(' | ')}`);
    await ca.close();
  }
  await browser.close();
  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll wizard/retirement-account checks passed.');
})();
