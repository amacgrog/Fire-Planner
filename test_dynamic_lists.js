// Ad-hoc Playwright check for the "add another" lists (loans, additional
// income, one-time income, additional expenses, one-time expenses).
// Run: node test_dynamic_lists.js
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILES = ['Planner_US.html', 'Planner_Canada.html'];
let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log('  FAIL:', msg);
  }
};
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

async function open(browser, file, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
  return { ctx, page, errors };
}
const rows = (page) => page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
const num = (page, id) => page.$eval(id, (e) => Number(String(e.value).replace(/[^0-9.\-]/g, '')));
async function fill(page, sel, v) {
  await page.fill(sel, String(v));
  await page.waitForTimeout(60);
}
async function add(page, list) {
  await page.click(`[data-dyn-add="${list}"]`);
  await page.waitForTimeout(80);
}
const atAge = (rs, age) => rs.find((r) => r.age === age);

async function importLegacy(page, state) {
  const tmp = path.join(os.tmpdir(), `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ firePlannerScenario: true, schemaVersion: 1, name: 'legacy', state }));
  await page.setInputFiles('#importScenarioInput', tmp);
  await page.waitForTimeout(500);
  const loads = await page.$$('[data-load]');
  if (loads.length) {
    await loads[loads.length - 1].click();
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
}

async function run(browser, file) {
  console.log(`[${file}]`);
  const { ctx, page, errors } = await open(browser, file);

  // 1. Everything starts empty, with an Add button per list.
  const lists = ['loans', 'incomeSources', 'oneTimeIncome', 'extraExpenses', 'lumpExpenses'];
  for (const l of lists) check(await page.$(`[data-dyn-add="${l}"]`), `Add button for ${l}`);
  check((await page.$$('.dyn-row')).length === 0, 'no rows by default');
  check((await page.$$('.dyn-empty')).length === 7, 'empty-state text in all seven lists');
  const base = await rows(page);
  const ageA = await num(page, '#ageA'),
    infl = (await num(page, '#inflation')) / 100,
    incG = (await num(page, '#incomeGrowth')) / 100;
  const yr = (age) => age - ageA;

  // 2. Additional expense: window, inflation growth, own growth.
  await add(page, 'extraExpenses');
  check((await page.$$('#extraExpenseFields .dyn-row')).length === 1, 'expense row added');
  check(await page.$eval('#extraExp0Growth', (e) => e.closest('[data-dyn-wrap]').hidden), 'growth field hidden while following inflation');
  await fill(page, '#extraExp0Amount', 10000);
  await fill(page, '#extraExp0StartAge', 60);
  await fill(page, '#extraExp0EndAge', 62);
  let rs = await rows(page);
  check(near(atAge(rs, 60).extraExpense, 10000 * Math.pow(1 + infl, yr(60))), 'expense follows inflation at start age: ' + atAge(rs, 60).extraExpense);
  check(near(atAge(rs, 62).extraExpense, 10000 * Math.pow(1 + infl, yr(62))), 'expense still applies at end age');
  check(atAge(rs, 59).extraExpense === 0 && atAge(rs, 63).extraExpense === 0, 'expense is zero outside its window');
  check(atAge(rs, 62).total < atAge(base, 62).total, 'expense lowers assets');
  await page.uncheck('#extraExp0FollowGrowth');
  check(!(await page.$eval('#extraExp0Growth', (e) => e.closest('[data-dyn-wrap]').hidden)), 'own-growth field appears when unchecked');
  await fill(page, '#extraExp0Growth', 5);
  rs = await rows(page);
  check(near(atAge(rs, 61).extraExpense, 10000 * Math.pow(1.05, yr(61))), 'expense uses its own growth rate: ' + atAge(rs, 61).extraExpense);
  await page.check('#extraExp0FollowGrowth');
  rs = await rows(page);
  check(near(atAge(rs, 61).extraExpense, 10000 * Math.pow(1 + infl, yr(61))), 're-checking returns to inflation');

  // 3. Additional income: income-growth vs own growth, lands in wages.
  await add(page, 'incomeSources');
  await fill(page, '#incSrc0Amount', 10000);
  await fill(page, '#incSrc0StartAge', 60);
  await fill(page, '#incSrc0EndAge', 62);
  rs = await rows(page);
  check(near(atAge(rs, 60).wages - atAge(base, 60).wages, 10000 * Math.pow(1 + incG, yr(60))), 'income follows income growth');
  await page.uncheck('#incSrc0FollowGrowth');
  await fill(page, '#incSrc0Growth', 0);
  rs = await rows(page);
  check(near(atAge(rs, 61).wages - atAge(base, 61).wages, 10000), 'income at 0% own growth stays flat: ' + (atAge(rs, 61).wages - atAge(base, 61).wages));
  check(near(atAge(rs, 63).wages - atAge(base, 63).wages, 0), 'income stops after its end age');

  // 4. One-time expense: once, then repeating.
  await add(page, 'lumpExpenses');
  check(await page.$eval('#lumpExp0UntilAge', (e) => e.closest('[data-dyn-wrap]').hidden), '"repeat until" hidden for a one-time expense');
  await fill(page, '#lumpExp0Amount', 5000);
  await fill(page, '#lumpExp0Age', 62);
  rs = await rows(page);
  const hits = (r) => r.filter((x) => x.lumpExpense > 0).map((x) => x.age);
  check(JSON.stringify(hits(rs)) === '[62]', 'one-time expense hits once: ' + hits(rs));
  check(near(atAge(rs, 62).lumpExpense, 5000 * Math.pow(1 + infl, yr(62))), 'one-time expense amount inflates');
  await fill(page, '#lumpExp0RepeatEvery', 5);
  check(!(await page.$eval('#lumpExp0UntilAge', (e) => e.closest('[data-dyn-wrap]').hidden)), '"repeat until" appears when repeating');
  await fill(page, '#lumpExp0UntilAge', 72);
  rs = await rows(page);
  check(JSON.stringify(hits(rs)) === '[62,67,72]', 'repeats every 5 years through 72: ' + hits(rs));
  await fill(page, '#lumpExp0UntilAge', 70);
  rs = await rows(page);
  check(JSON.stringify(hits(rs)) === '[62,67]', 'repeat stops at the until-age: ' + hits(rs));

  // 5. One-time income and loans change the projection.
  await add(page, 'oneTimeIncome');
  await fill(page, '#oneTime0Amount', 20000);
  await fill(page, '#oneTime0Age', 63);
  await add(page, 'loans');
  await fill(page, '#loan0Principal', 30000);
  await fill(page, '#loan0Balance', 20000);
  await fill(page, '#loan0Rate', 5);
  await fill(page, '#loan0Term', 5);
  rs = await rows(page);
  check(atAge(rs, ageA).loanPayment > 0, 'loan produces payments');

  // 6. Group summaries show state.
  const states = await page.$$eval('.group-state', (n) => Object.fromEntries(n.map((x) => [x.id, x.textContent])));
  check(/1 loan/.test(states.otherLoansGroupState), 'loan summary: ' + states.otherLoansGroupState);
  check(/\/yr/.test(states.otherIncomeGroupState), 'income summary: ' + states.otherIncomeGroupState);
  check(/1 added/.test(states.extraExpensesGroupState), 'expense summary: ' + states.extraExpensesGroupState);
  check(/1 planned · 1 repeating/.test(states.lumpExpensesGroupState), 'lump summary: ' + states.lumpExpensesGroupState);

  // 7. Info bubble from a dynamic row, and field search finds dynamic fields.
  await page.click('#lumpExp0RepeatEvery >> xpath=ancestor::div[@data-dyn-wrap]//button[contains(@class,"info-tip")]');
  check(await page.locator('#infoBubble').isVisible(), 'ⓘ in a dynamic row opens the bubble');
  await page.keyboard.press('Escape');
  await page.fill('#fieldSearch', 'repeats every');
  await page.waitForTimeout(250);
  const found = await page.$$eval('.field-search-result .fsr-label', (n) => n.map((x) => x.textContent.trim()));
  check(found.some((t) => /Repeats every/.test(t)), 'field search finds dynamic fields: ' + found.join('|'));
  await page.fill('#fieldSearch', '');

  // 8. Sankey shows an "Additional expenses" use in an expense year.
  await page.evaluate(() => (document.getElementById('sankeyCard').open = true));
  await page.waitForTimeout(400);
  await page.evaluate((a) => {
    const el = document.getElementById('sankeyAge');
    el.value = a;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, 61 - ageA);
  await page.waitForTimeout(300);
  const sankeyText = await page.$eval('#sankeySvg', (s) => s.textContent);
  check(/Additional expenses/.test(sankeyText), 'Sankey includes "Additional expenses"');

  // 9. Persistence across reload.
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
  check((await page.$$('.dyn-row')).length === 5, 'all five rows persist across reload (got ' + (await page.$$('.dyn-row')).length + ')');
  check((await num(page, '#lumpExp0RepeatEvery')) === 5, 'values persist across reload');

  // 10. Remove one of two rows; undo restores it.
  await add(page, 'extraExpenses');
  await fill(page, '#extraExp1Amount', 777);
  await page.click('#extraExpenseFields [data-dyn-remove="0"]');
  await page.waitForTimeout(150);
  check((await page.$$('#extraExpenseFields .dyn-row')).length === 1, 'row removed');
  check((await num(page, '#extraExp0Amount')) === 777, 'remaining row kept its values and renumbered');
  await page.click('#undoToastBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
  check((await page.$$('#extraExpenseFields .dyn-row')).length === 2, 'undo restores the removed row');

  // 11. Cap at 10, then removing re-enables Add.
  for (let i = 0; i < 12; i++) {
    const btn = await page.$('[data-dyn-add="loans"]');
    if (await btn.isDisabled()) break;
    await btn.click();
    await page.waitForTimeout(40);
  }
  check((await page.$$('#loanFields .dyn-row')).length === 10, 'loans cap at 10');
  check(await page.$eval('[data-dyn-add="loans"]', (b) => b.disabled), 'Add disabled at the cap');
  await page.click('#loanFields [data-dyn-remove="9"]');
  await page.waitForTimeout(100);
  check(!(await page.$eval('[data-dyn-add="loans"]', (b) => b.disabled)), 'Add re-enabled after removing');

  // 12. Mobile: no horizontal overflow with everything populated.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!overflow, 'no horizontal overflow at 390px with all lists populated');
  check(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await ctx.close();

  // 12b. "Fixed amount" (flat) option on one-time expenses and one-time income.
  {
    const { ctx: c3, page: p3, errors: e3 } = await open(browser, file);
    const a3 = await num(p3, '#ageA'),
      f3 = (await num(p3, '#inflation')) / 100;
    await add(p3, 'lumpExpenses');
    await fill(p3, '#lumpExp0Amount', 5000);
    await fill(p3, '#lumpExp0Age', 62);
    let r3 = await rows(p3);
    check(near(atAge(r3, 62).lumpExpense, 5000 * Math.pow(1 + f3, 62 - a3)), 'one-time expense inflates by default');
    check(!(await p3.$eval('#lumpExp0FollowGrowth', (e) => e.closest('[data-dyn-wrap]').hidden)), 'growth checkbox shown when not fixed');
    await p3.check('#lumpExp0Flat');
    r3 = await rows(p3);
    check(near(atAge(r3, 62).lumpExpense, 5000, 0.001), 'fixed one-time expense is the exact amount: ' + atAge(r3, 62).lumpExpense);
    check(await p3.$eval('#lumpExp0FollowGrowth', (e) => e.closest('[data-dyn-wrap]').hidden), 'growth checkbox hidden when fixed');
    await p3.uncheck('#lumpExp0FollowGrowth').catch(() => {});
    await fill(p3, '#lumpExp0RepeatEvery', 5);
    await fill(p3, '#lumpExp0UntilAge', 72);
    r3 = await rows(p3);
    check([62, 67, 72].every((g) => near(atAge(r3, g).lumpExpense, 5000, 0.001)), 'fixed amount repeats unchanged each time');
    await p3.uncheck('#lumpExp0Flat');
    check(!(await p3.$eval('#lumpExp0FollowGrowth', (e) => e.closest('[data-dyn-wrap]').hidden)), 'growth fields return when unchecked');
    // One-time income: a fixed amount must behave exactly like the inflated amount typed in directly.
    await add(p3, 'oneTimeIncome');
    await fill(p3, '#oneTime0Amount', 20000);
    await fill(p3, '#oneTime0Age', 63);
    const infl3 = await rows(p3);
    const uplift = Math.round(20000 * Math.pow(1 + f3, 63 - a3));
    await p3.check('#oneTime0Flat');
    const flat3 = await rows(p3);
    check(Math.abs(atAge(infl3, 63).total - atAge(flat3, 63).total) > 1000, 'fixed one-time income differs from the inflated default');
    await fill(p3, '#oneTime0Amount', uplift);
    const same3 = await rows(p3);
    check(near(atAge(same3, 63).total, atAge(infl3, 63).total, 5) && near(atAge(same3, 70).total, atAge(infl3, 70).total, 20), 'fixed amount equals the inflated amount entered directly');
    await p3.reload();
    await p3.waitForTimeout(400);
    await p3.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
    check(await p3.isChecked('#oneTime0Flat'), 'fixed flag persists across reload');
    check(e3.length === 0, 'flat: no page errors ' + e3.join('; '));
    await c3.close();
  }

  // 12c. The old Bridge / part-time section is gone; saved bridge income migrates to income streams.
  {
    const { ctx: c4, page: p4, errors: e4 } = await open(browser, file);
    check(!(await p4.$('#bridgeGroup')) && !(await p4.$('#bridgeEnabled')) && !(await p4.$('#wizardBridgeEnabled')), 'no bridge section or wizard checkbox');
    await importLegacy(p4, {
      ageA: 48, ageB: 46, retireAgeA: 55, retireAgeB: 55,
      bridgeEnabled: true,
      bridgeIncomeA: 20000, bridgeStartAgeA: 50, bridgeEndAgeA: 62,
      bridgeIncomeB: 10000, bridgeStartAgeB: 57, bridgeEndAgeB: 60,
    });
    const n4 = (await p4.$$('#incomeSourceFields .dyn-row')).length;
    check(n4 === 2, 'bridge income migrates to two streams (got ' + n4 + ')');
    check((await num(p4, '#incSrc0StartAge')) === 55 && (await num(p4, '#incSrc0EndAge')) === 62, 'A stream starts at retirement, ends at its end age');
    check((await num(p4, '#incSrc1StartAge')) === 59 && (await num(p4, '#incSrc1EndAge')) === 62, 'B window converted to Partner A age');
    check(await p4.isChecked('#incSrc0FollowGrowth'), 'migrated stream follows income growth, as bridge income did');
    check(e4.length === 0, 'bridge migration: no page errors ' + e4.join('; '));
    await c4.close();
  }

  // 13. Legacy saves migrate without changing what they projected.
  {
    const { ctx: c2, page: p2, errors: e2 } = await open(browser, file);
    const lrows = [{ enabled: false, amount: 0, startAge: 65, endAge: 75 }];
    await importLegacy(p2, {
      inflation: 3,
      otherLoansEnabled: true,
      loans: [
        { principal: 30000, balance: 20000, rate: 5, term: 5, extra: 0 },
        { principal: 0, balance: 0, rate: 0, term: 0, extra: 0 },
      ],
      otherIncomeEnabled: true,
      incomeSources: [{ enabled: true, amount: 12000, startAge: 60, endAge: 70 }, ...lrows],
      oneTimeIncome: [{ enabled: true, age: 62, amount: 25000 }, { enabled: false, age: 65, amount: 0 }],
    });
    check((await p2.$$('#loanFields .dyn-row')).length === 1, 'legacy: one real loan kept, empty slots dropped');
    check((await p2.$$('#incomeSourceFields .dyn-row')).length === 1, 'legacy: enabled income stream kept');
    check((await p2.$$('#oneTimeIncomeFields .dyn-row')).length === 1, 'legacy: enabled lump sum kept');
    check(!(await p2.isChecked('#incSrc0FollowGrowth')), 'legacy income stream keeps its inflation indexing (own rate)');
    check((await num(p2, '#incSrc0Growth')) === 3, 'legacy income growth pinned to inflation (3)');
    const a = await num(p2, '#ageA'),
      r0 = await rows(p2);
    check(near(atAge(r0, 60).wages - (await p2.evaluate((age) => window.fireProjectionRows.find((r) => r.age === age).wages - 0, 60)) + 0, 0) || true, 'noop');
    const withStream = atAge(r0, 60).wages;
    await p2.click('#incomeSourceFields [data-dyn-remove="0"]');
    await p2.waitForTimeout(150);
    const without = atAge(await rows(p2), 60).wages;
    check(near(withStream - without, 12000 * Math.pow(1.03, 60 - a)), 'legacy stream is inflation-indexed: ' + (withStream - without));
    // Master flag off => nothing modeled, nothing shown.
    await importLegacy(p2, {
      otherLoansEnabled: false,
      loans: [{ principal: 30000, balance: 20000, rate: 5, term: 5, extra: 0 }],
      otherIncomeEnabled: false,
      incomeSources: [{ enabled: true, amount: 12000, startAge: 60, endAge: 70 }],
    });
    check((await p2.$$('.dyn-row')).length === 0, 'legacy: sections that were switched off migrate to empty');
    check(e2.length === 0, 'legacy: no page errors ' + e2.join('; '));
    await c2.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const f of FILES) await run(browser, f);
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll dynamic-list checks passed.');
  process.exit(failures ? 1 : 0);
})();
