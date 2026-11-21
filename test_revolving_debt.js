// Feedback B3 (both planners): a credit card or line of credit as a loan row. Checks that choosing the type swaps the fields
// and retitles the row, that the card moves window.fireProjectionRows (not only its boxes), the payoff note and the warning,
// that the type survives a reload, switching back, then the 390x844 layout.
// Run: node test_revolving_debt.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const fileFor = (planner) => 'file://' + path.resolve(__dirname, 'dist', planner);

async function open(context, planner) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fileFor(planner));
  await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
  return { page, errors };
}
// Types into a loan-row box (input, then change), as a person does.
const set = (page, id, v) =>
  page.evaluate(
    ({ id, v }) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { id, v },
  );
const shown = (page, id) => page.evaluate((id) => !document.getElementById(id).closest('[data-dyn-wrap]').hidden, id);
const view = (page) =>
  page.evaluate(() => {
    window.__test_flushRender();
    const note = document.querySelector('#loanFields .dyn-note');
    return {
      pay0: window.fireProjectionRows[0].loanPayment,
      title: document.querySelector('#loanFields [data-dyn-title="0"]').textContent,
      note: note ? note.textContent : null,
      noteShown: !!note && !note.hidden,
      warn: !!note && note.classList.contains('warn'),
    };
  });

async function check(browser, planner) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, errors } = await open(context, planner);
    await page.evaluate(() => (document.getElementById('otherLoansGroup').open = true));
    const before = await page.evaluate(() => window.fireProjectionRows[0].loanPayment);
    assert.strictEqual(before, 0, `${planner}: no loan payment before`);
    await page.click('[data-dyn-add="loans"]');
    let v = await view(page);
    assert.strictEqual(v.title, 'Loan 1', `${planner}: a new row is a fixed-term loan`);
    assert.strictEqual(await shown(page, 'loan0Principal'), true, `${planner}: principal shown for a fixed-term loan`);
    assert.strictEqual(await shown(page, 'loan0Payment'), false, `${planner}: payment hidden for a fixed-term loan`);

    await page.selectOption('#loan0Type', 'revolving');
    v = await view(page);
    assert.strictEqual(v.title, 'Card or credit line 1', `${planner}: the header follows the type`);
    assert.strictEqual(await page.getAttribute('[data-dyn-remove="0"]', 'aria-label'), 'Remove card or credit line 1', `${planner}: the remove label follows the type`);
    for (const id of ['loan0Principal', 'loan0Term', 'loan0Extra']) assert.strictEqual(await shown(page, id), false, `${planner}: ${id} hidden for a card`);
    for (const id of ['loan0MinPct', 'loan0MinFloor', 'loan0Payment']) assert.strictEqual(await shown(page, id), true, `${planner}: ${id} shown for a card`);
    assert.strictEqual(await page.inputValue('#loan0MinPct'), '2', `${planner}: the minimum defaults to 2%`);

    // $10,000 at 22% paid at $400 a month: $4,800 in year 0 (hand-computed), paid off in month 34.
    await set(page, 'loan0Balance', '10000');
    await set(page, 'loan0Rate', '22');
    await set(page, 'loan0Payment', '400');
    v = await view(page);
    assert(Math.abs(v.pay0 - 4800) < 0.005, `${planner}: year 0 pays 4,800 (got ${v.pay0})`);
    assert.strictEqual(v.note, 'Paid off in 2 years 10 months, with $3,500 in interest.', `${planner}: the payoff note`);
    assert.strictEqual(v.noteShown && !v.warn, true, `${planner}: the note shows, no warning`);

    // The minimum only, at 1%: below the month's interest, so the warning.
    await set(page, 'loan0Payment', '0');
    await set(page, 'loan0MinPct', '1');
    v = await view(page);
    assert.strictEqual(v.warn, true, `${planner}: the warning class`);
    assert(v.note.includes('does not cover'), `${planner}: the warning text (got ${v.note})`);
    assert(Math.abs(v.pay0 - 1278.29) < 0.005, `${planner}: year 0 pays the minimum, 1,278.29 (got ${v.pay0})`);

    // Feedback B5: a 0% minimum with a $0 floor and no payment reads as 1% (the floor never bound at 1% here, so the same
    // year-0 payment), the note says so, and the reload stores the 1%.
    await set(page, 'loan0MinPct', '0');
    await set(page, 'loan0MinFloor', '0');
    v = await view(page);
    assert(Math.abs(v.pay0 - 1278.29) < 0.005, `${planner}: 0/0/0 pays the 1% minimum, 1,278.29 (got ${v.pay0})`);
    assert(v.note.startsWith('With no minimum and no payment, this is read as a 1% minimum. The first payment'), `${planner}: the 0/0/0 note (got ${v.note})`);

    // The type and the fields survive a reload (autosave).
    await page.reload();
    await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
    assert.strictEqual(await page.inputValue('#loan0Type'), 'revolving', `${planner}: the type is kept on reload`);
    assert.strictEqual(await page.evaluate(() => window.__test_getState().loans[0].minPct), 1, `${planner}: the 0% minimum is stored as 1% on reload`);
    assert.strictEqual(await page.evaluate(() => window.__test_getState().loans[0].minFloor), 0, `${planner}: the $0 floor is kept on reload`);

    // Back to a fixed-term loan: its fields return, the note hides.
    await page.evaluate(() => (document.getElementById('otherLoansGroup').open = true));
    await page.selectOption('#loan0Type', 'amortized');
    v = await view(page);
    assert.strictEqual(v.title, 'Loan 1', `${planner}: the header is a loan again`);
    assert.strictEqual(v.noteShown, false, `${planner}: the note hides`);
    assert.strictEqual(await shown(page, 'loan0Term'), true, `${planner}: the term shows again`);
    assert.deepStrictEqual(errors, [], `${planner}: no page errors: ` + errors.join('; '));
    await page.close();

    // 390x844 with a card row open.
    const m = await context.newPage();
    await m.setViewportSize({ width: 390, height: 844 });
    await m.goto(fileFor(planner));
    await m.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
    await m.evaluate(() => {
      document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs');
      document.getElementById('otherLoansGroup').open = true;
    });
    await m.selectOption('#loan0Type', 'revolving');
    assert(await m.isVisible('#loan0Payment'), `${planner} mobile: the payment box is shown`);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflow, false, `${planner} mobile 390x844: no horizontal overflow`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const planner of ['Planner_US.html', 'Planner_Canada.html']) await check(browser, planner);
    console.log('test_revolving_debt: all checks passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
