// Ad-hoc Playwright check for: spending changes as an add-as-you-go list,
// Additional expenses living under the Spending rail pill, and the new top
// dashboard tiles (nest-egg numbers with a safe-withdrawal-rate box).
// Run: node test_spending_and_fi_widgets.js
const { chromium } = require('playwright');
const { plannerPath } = require('./tests/helpers/planner-path');
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
const parseCompact = (t) => {
  const m = String(t).replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)/);
  return m ? parseFloat(m[1]) * { '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]] : NaN;
};

async function open(browser, file, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + plannerPath(file));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));
  return { ctx, page, errors };
}
const rows = (page) => page.evaluate(() => window.fireProjectionRows.map((r) => ({ ...r })));
const num = (page, id) => page.$eval(id, (e) => Number(String(e.value).replace(/[^0-9.\-]/g, '')));
// Retirement balances: Canada has RRSP/TFSA fields; the US planner has four accounts per partner
// (a partner B account is ignored in single-person mode, which this test does not use).
async function retirementTotal(page) {
  if (await page.$('#trad401kA')) {
    let t = 0;
    for (const id of ['tradIraA', 'trad401kA', 'rothIraA', 'roth401kA', 'tradIraB', 'trad401kB', 'rothIraB', 'roth401kB']) t += await num(page, '#' + id);
    return t;
  }
  return (await num(page, '#traditional')) + (await num(page, '#roth'));
}
async function fill(page, sel, v) {
  await page.fill(sel, String(v));
  await page.waitForTimeout(60);
}
const atAge = (rs, age) => rs.find((r) => r.age === age);

async function run(browser, file) {
  console.log(`[${file}]`);
  const { ctx, page, errors } = await open(browser, file);
  const ageA = await num(page, '#ageA'),
    infl = (await num(page, '#inflation')) / 100,
    spending = await num(page, '#spending');
  const yr = (a) => a - ageA;
  const base = await rows(page);

  // --- Spending changes: add-as-you-go list
  check((await page.$$('#spendingTierFields .dyn-row')).length === 0, 'no spending changes by default');
  check(!/up to 5/i.test(await page.$eval('#spendingTiersGroup', (e) => e.textContent)), '"up to 5" wording is gone');
  await page.click('[data-dyn-add="spendingTiers"]');
  await page.waitForTimeout(80);
  await fill(page, '#tier0Amount', 80000);
  await fill(page, '#tier0StartAge', 60);
  await fill(page, '#tier0EndAge', 70);
  let rs = await rows(page);
  check(near(atAge(rs, 60).baseSpend, 80000 * Math.pow(1 + infl, yr(60)), 1), 'change replaces spending from its start age, grown with inflation: ' + atAge(rs, 60).baseSpend);
  check(near(atAge(rs, 59).baseSpend, atAge(base, 59).baseSpend), 'unchanged before the start age');
  check(near(atAge(rs, 71).baseSpend, atAge(base, 71).baseSpend), 'spending reverts to the base figure after the end age');
  check(near(atAge(rs, 70).baseSpend, 80000 * Math.pow(1 + infl, yr(70)), 1), 'end age is inclusive');
  check(!(await page.$eval('#tier0Growth', (e) => e.closest('[data-dyn-wrap]').hidden)) === false, 'own growth hidden while following inflation');
  await page.uncheck('#tier0FollowGrowth');
  await fill(page, '#tier0Growth', 0);
  rs = await rows(page);
  check(near(atAge(rs, 65).baseSpend, 80000, 0.5), 'own 0% growth keeps the change flat: ' + atAge(rs, 65).baseSpend);
  await fill(page, '#tier0Growth', 4);
  rs = await rows(page);
  check(near(atAge(rs, 65).baseSpend, 80000 * Math.pow(1.04, yr(65)), 1), 'own growth rate applies');
  // overlap: later start wins
  await page.click('[data-dyn-add="spendingTiers"]');
  await page.waitForTimeout(80);
  await fill(page, '#tier1Amount', 50000);
  await fill(page, '#tier1StartAge', 65);
  await fill(page, '#tier1EndAge', 67);
  rs = await rows(page);
  check(near(atAge(rs, 66).baseSpend, 50000 * Math.pow(1 + infl, yr(66)), 1), 'overlapping changes: the one that started later wins');
  check(near(atAge(rs, 68).baseSpend, 80000 * Math.pow(1.04, yr(68)), 1), 'earlier change resumes after the later one ends');
  const st = await page.$eval('#spendingGroupState', (e) => e.textContent);
  check(/2 spending change/.test(st), 'spending summary counts changes: ' + st);
  // remove + undo
  await page.click('#spendingTierFields [data-dyn-remove="1"]');
  await page.waitForTimeout(150);
  check((await page.$$('#spendingTierFields .dyn-row')).length === 1, 'spending change removed');
  await page.click('#undoToastBtn');
  await page.waitForTimeout(300);
  check((await page.$$('#spendingTierFields .dyn-row')).length === 2, 'undo restores it');
  // 10 cap
  for (let i = 0; i < 12; i++) {
    const b = await page.$('[data-dyn-add="spendingTiers"]');
    if (await b.isDisabled()) break;
    await b.click();
    await page.waitForTimeout(30);
  }
  check((await page.$$('#spendingTierFields .dyn-row')).length === 10, 'spending changes cap at 10');

  // --- Pill membership
  const cat = (sel) => page.getAttribute(sel, 'data-cat');
  check((await cat('#extraExpensesGroup')) === 'spending', 'Additional expenses is in the spending category');
  check((await cat('#lumpExpensesGroup')) === 'spending', 'One-time expenses is in the spending category');
  check((await cat('#otherLoansGroup')) === 'spending', 'Other loans is in the spending category');
  check((await cat('#otherIncomeGroup')) === 'income', 'Additional income is in the income category');
  check((await page.$eval('#preRetireHealthGroupState', (e) => e.closest('details').dataset.cat)) === 'spending', 'Pre-retirement healthcare is in the spending category');
  await page.click('button[data-cat="spending"]');
  await page.waitForTimeout(200);
  for (const id of ['#extraExpensesGroup', '#lumpExpensesGroup', '#otherLoansGroup'])
    check(await page.locator(id).isVisible(), `Spending pill shows ${id}`);
  check(await page.locator('#preRetireHealthGroupState').isVisible(), 'Spending pill shows pre-retirement healthcare');
  check(!(await page.locator('#otherIncomeGroup').isVisible()), 'Spending pill hides additional income');
  await page.click('button[data-cat="income"]');
  await page.waitForTimeout(200);
  check(await page.locator('#otherIncomeGroup').isVisible(), 'Income pill shows additional income');
  check(!(await page.locator('#lumpExpensesGroup').isVisible()), 'Income pill hides one-time expenses');
  await page.click('button[data-cat="all"]').catch(() => {});

  // --- Dashboard tiles
  const tiles = await page.$$eval('.metrics-primary .metric .kicker', (n) => n.map((x) => x.textContent.trim()));
  check(tiles.length === 4, 'four primary tiles (got ' + tiles.length + ')');
  check(/Investable at retirement/.test(tiles[0]) && /lifestyle/i.test(tiles[1]) && /retirement/i.test(tiles[2]) && /last through/i.test(tiles[3]), 'primary tile order: ' + tiles.join(' | '));
  check(!(await page.$('#moreResultsCard #fiNumber')) && !(await page.$('#moreResultsCard #fireNumber')), 'nest-egg tiles are out of More results');
  check(!!(await page.$('#moreResultsCard #dashHistSuccess')), 'Historical success moved into More results');
  check(await page.locator('#fiNumber').isVisible() && await page.locator('#fireNumber').isVisible(), 'nest-egg tiles visible without opening More results');
  const chipBox = await page.locator('#dashRetireChip').boundingBox(),
    tileBox = await page.locator('.metrics-primary .metric').first().boundingBox();
  check(chipBox && tileBox && chipBox.height < tileBox.height / 2, 'retirement age is a small chip, not a tile');
  check(!(await page.$('.metrics-primary #dashRetireAge')), 'retirement age no longer one of the four tiles');
  const ra = await num(page, '#retireAgeA'),
    rb = await num(page, '#retireAgeB');
  const chipText = await page.$eval('#dashRetireAge', (e) => e.textContent);
  check(chipText === `A ${ra} / B ${rb}`, `chip shows each partner's own retirement age: "${chipText}" vs A ${ra} / B ${rb}`);
  check(!/both retire/i.test(await page.$eval('#dashRetireChip', (e) => e.textContent)), 'no "when both retire" text');
  const cb = await page.locator('#dashRetireChip').boundingBox(),
    sb = await page.locator('.content').boundingBox();
  check(cb.x + cb.width > sb.x + sb.width - 6 && cb.y < sb.y + 60, 'chip sits in the upper-right of the results area');
  check(/rgb\(18, 52, 77\)/.test(await page.$eval('#dashRetireChip', (e) => getComputedStyle(e).backgroundColor)), 'chip is a colored box');
  // Rate boxes: no spinner arrows, explained by an info bubble rather than a hover tooltip
  check((await page.$eval('.swr-input', (e) => getComputedStyle(e).appearance)) === 'textfield', 'rate box has no spinner arrows');
  check(!(await page.$('.swr-row[title]')) && !(await page.$('.swr-input[title]')), 'no hover tooltip on the rate row');
  const tips = await page.$$('.swr-row .info-tip');
  check(tips.length === 2, 'info icon beside both withdrawal-rate labels');
  await tips[0].click();
  check((await page.locator('#infoBubble').isVisible()) && /first year of retirement/.test(await page.locator('#infoBubble').textContent()), 'info bubble explains the withdrawal rate');
  await page.keyboard.press('Escape');
  check((await tips[0].getAttribute('data-tip')).split(/[.!?]\s/).length === 1, 'withdrawal-rate explanation is a single sentence');
  // Chip sits beside the on-track banner and is roughly square-ish (two lines)
  const banner = page.locator('#planHeadlineBanner');
  if (await banner.isVisible()) {
    const bb = await banner.boundingBox(),
      cc = await page.locator('#dashRetireChip').boundingBox();
    check(Math.abs(cc.y - bb.y) < 20 && cc.x > bb.x + bb.width - 5, 'retirement box sits beside the on-track banner');
  }
  check((await page.$eval('#dashRetireChip .kicker', (e) => e.getBoundingClientRect().bottom)) <= (await page.$eval('#dashRetireAge', (e) => e.getBoundingClientRect().top)) + 1, 'ages are on their own line');
  // Headline tiles: 4-across when roomy, 2x2 once they would get cramped
  const colsAt = async (w) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    return page.$eval('.metrics-primary', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  };
  check((await colsAt(1900)) === 4, 'four across at a wide window');
  check((await colsAt(1400)) === 2, '2x2 once the tile row drops below ~1000px');
  check((await colsAt(1700)) === 4, 'back to four across when widened');
  await page.setViewportSize({ width: 1280, height: 900 });

  // Safe withdrawal rate
  const swr = await page.$$('.swr-input');
  check(swr.length === 2 && (await swr[0].inputValue()) === '4' && (await swr[1].inputValue()) === '4', 'both tiles default to a 4% rate');
  const fi4 = parseCompact(await page.$eval('#fiNumber', (e) => e.textContent)),
    fire4 = parseCompact(await page.$eval('#fireNumber', (e) => e.textContent));
  await swr[0].fill('5');
  await page.waitForTimeout(150);
  const fi5 = parseCompact(await page.$eval('#fiNumber', (e) => e.textContent)),
    fire5 = parseCompact(await page.$eval('#fireNumber', (e) => e.textContent));
  check(near(fi5 / fi4, 0.8, 0.05) && near(fire5 / fire4, 0.8, 0.05), `5% rate scales both numbers by 20/25 (${fi5 / fi4}, ${fire5 / fire4})`);
  check((await swr[1].inputValue()) === '5', 'the two rate boxes stay in sync');
  const funded = parseInt(await page.$eval('#fiNumberSub', (e) => e.textContent), 10);
  const liquid =
    (await num(page, '#taxable')) + (await retirementTotal(page)) + (await num(page, '#cash')) + ((await page.$('#fhsa')) ? await num(page, '#fhsa') : 0);
  check(/liquid/i.test(await page.$eval('#fiNumberSub', (e) => e.textContent)), 'funded % is labeled as liquid assets');
  check(Number.isFinite(funded), 'funded % is a number: ' + funded);
  // funded% = liquid / fiNumber(unrounded); verify within the rounding of the compact display
  check(Math.abs(funded - (liquid / fi5) * 100) < 3, `funded % uses liquid assets only (${funded} vs ${(liquid / fi5) * 100})`);
  await swr[0].fill('');
  await page.keyboard.press('Tab');
  check((await swr[0].inputValue()) === '5', 'empty/invalid entry reverts on blur');
  await page.reload();
  await page.waitForTimeout(400);
  check((await page.$eval('.swr-input', (e) => e.value)) === '5', 'rate persists across reload');

  // Mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!overflow, 'no horizontal overflow at 390px');
  check(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await ctx.close();

  // --- Legacy fixed-slot spending tiers carry over unchanged
  const S = process.env.MAIN_DIR;
  if (S) {
    const legacy = {
      spendingTiers: [
        { enabled: true, age: 62, amount: 70000 },
        { enabled: false, age: 70, amount: 10000 },
        { enabled: true, age: 75, amount: 55000 },
        { enabled: false, age: 65, amount: 60000 },
        { enabled: false, age: 65, amount: 60000 },
      ],
    };
    const get = async (f) => {
      const c = await open(browser, f);
      const tmp = path.join(os.tmpdir(), 'lg' + Math.random() + '.json');
      fs.writeFileSync(tmp, JSON.stringify({ firePlannerScenario: true, schemaVersion: 1, name: 'x', state: legacy }));
      await c.page.setInputFiles('#importScenarioInput', tmp);
      await c.page.waitForTimeout(500);
      const l = await c.page.$$('[data-load]');
      if (l.length) await l[l.length - 1].click();
      await c.page.waitForTimeout(500);
      const r = await c.page.evaluate(() => JSON.stringify(window.fireProjectionRows.map((x) => x.baseSpend)));
      const n = (await c.page.$$('#spendingTierFields .dyn-row')).length;
      await c.ctx.close();
      return { r, n };
    };
    const a = await get(path.join(S, 'main_' + (file.includes('US') ? 'US' : 'Canada') + '.html')),
      b = await get(plannerPath(file));
    check(a.r === b.r, 'legacy spending tiers reproduce main\'s baseSpend exactly');
    check(b.n === 2, 'only enabled legacy tiers become rows (got ' + b.n + ')');
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const f of FILES) await run(browser, f);
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll spending/FI-widget checks passed.');
  process.exit(failures ? 1 : 0);
})();
