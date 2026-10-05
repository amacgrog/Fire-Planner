// Tests for annual taxation of dividends and interest on the taxable account.
//
// Dividends and interest are part of the modeled total return, but are taxed
// in the year they are paid (rather than only when gains are realized), count
// toward MAGI (US) / net income (Canada), and raise cost basis when
// reinvested. Each scenario is built so the expected number can be derived by
// hand from the model's documented rules.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

const root = path.resolve(__dirname, '..');

async function scenario(file, isUS, fields, years = 2) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(200);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  // Retired single person, nothing but a taxable account, zero inflation, so
  // every tax parameter is exactly its 2026 value. The US person is 64, one year
  // under the 65+ additional standard deduction and senior deduction (Batch 2),
  // so the plain $16,100 standard deduction in the hand calculations applies.
  const startAge = isUS ? 64 : 65;
  const base = [
    ['singlePerson', true],
    ['ageA', startAge],
    ['retireAgeA', startAge],
    ['lifeExpectancyA', startAge + years],
    ['spending', 40000],
    ['healthcare', 0],
    ['ltcEnabled', false],
    ['inflation', 0],
    ['returnRate', 6],
    ['bondReturn', 0],
    ['hysaRate', 0],
  ];
  if (isUS) base.push(['medicareYearly', 0], ['stateTax', 'tx'], ['ssMonthlyA', 0], ['acaEnabled', false]);
  else base.push(['cppMonthlyA', 0], ['oasMonthlyA', 0]);
  for (const [id, v] of base) await set(id, v);
  await page.evaluate(() => document.getElementById('rentBtn').click());
  for (const [id, v] of translateFieldList([
    ['rent', 0],
    ['traditional', 0],
    ['roth', 0],
    ['cash', 0],
    ['bondYears', 0],
    ['taxable', 1000000],
    ['basisRatio', 100],
  ], isUS, { single: true }))
    await set(id, v);
  for (const [id, v] of fields) await set(id, v);
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => window.fireProjectionRows);
  await browser.close();
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  return rows;
}

const near = (actual, expected, tol, label) =>
  assert(Math.abs(actual - expected) <= tol, `${label}: expected ${expected} (+/-${tol}), got ${actual}`);

async function testUS() {
  const file = path.join(root, 'Planner_US.html');
  // A. 2% yield on $1M, all non-qualified: $20,000 ordinary income. Single
  // 2026 standard deduction $16,100 -> $3,900 taxed at 10% = $390.
  let rows = await scenario(file, true, [
    ['dividendYield', 2],
    ['qualifiedDivPct', 0],
  ]);
  near(rows[0].tax, 390, 0.01, 'US ordinary dividends: year-0 tax');
  // MAGI is the year's realized total: dividends plus the capital gain from
  // selling shares to fund spending (computed below).
  near(rows[0].magiProxy, rows[0].income, 0.01, 'US ordinary dividends: MAGI equals realized income');
  // Reinvested dividends raise basis: after 6% growth the pool is $1.06M and
  // basis is $1.0M + $20k, so the realized-gain share of the $40,390
  // withdrawal is 1 - 1.02/1.06, not the 1 - 1.0/1.06 it would be if basis
  // stayed flat.
  const gain = rows[0].income - 20000;
  near(gain, 40390 * (1 - 1020000 / 1060000), 0.5, 'US basis step-up: realized gain in year 0');
  near(rows[0].magiProxy, 20000 + gain, 0.01, 'US ordinary dividends: MAGI = dividends + realized gain');

  // B. No dividends: no tax, no MAGI (regression guard for the old model).
  rows = await scenario(file, true, [['dividendYield', 0]]);
  near(rows[0].tax, 0, 0.01, 'US zero yield: tax');
  // MAGI is only the capital gain on the shares sold for spending.
  near(rows[0].magiProxy, 40000 * (1 - 1000000 / 1060000), 0.5, 'US zero yield: MAGI = realized gain only');

  // B2. Interest on cash is taxed as ordinary income too: $500k at 4% = $20k.
  rows = await scenario(file, true, [
    ['taxable', 0],
    ['cash', 500000],
    ['cashReserve', 500000],
    ['hysaRate', 4],
    ['dividendYield', 0],
  ]);
  near(rows[0].tax, 390, 0.01, 'US cash interest: year-0 tax');
  near(rows[0].magiProxy, 20000, 0.01, 'US cash interest: MAGI');

  // C. Qualified dividends stack as long-term gains: $150k on $3M, spending 0,
  // single. Taxable income = 150,000 - 16,100 = 133,900; 0% up to 49,450,
  // 15% on the remaining 84,450 = 12,667.50 (plus a few dollars on the tiny
  // gain realized withdrawing money to pay the tax).
  rows = await scenario(file, true, [
    ['taxable', 3000000],
    ['spending', 0],
    ['dividendYield', 5],
    ['qualifiedDivPct', 100],
  ]);
  near(rows[0].tax, 12667.5, 60, 'US qualified dividends: year-0 tax');
  near(rows[0].magiProxy, 150000, 250, 'US qualified dividends: MAGI (plus a few dollars of realized gain)');

  // D. Unused standard deduction shelters qualified dividends: $40k of
  // qualified dividends with no other income is entirely in the 0% bracket.
  rows = await scenario(file, true, [
    ['taxable', 3000000],
    ['spending', 0],
    ['dividendYield', 1.3333333],
    ['qualifiedDivPct', 100],
  ]);
  near(rows[0].tax, 0, 1, 'US qualified dividends under deduction + 0% bracket: tax');

  // E. Dividend income reaches the ACA subsidy calculation.
  const aca = [
    ['ageA', 55],
    ['retireAgeA', 55],
    ['lifeExpectancyA', 60],
    ['acaEnabled', true],
    ['healthcare', 12000],
  ];
  const noDiv = await scenario(file, true, [...aca, ['dividendYield', 0]]);
  const withDiv = await scenario(file, true, [...aca, ['dividendYield', 2], ['qualifiedDivPct', 0]]);
  assert(
    withDiv[0].healthcare > noDiv[0].healthcare + 100,
    `US ACA: dividends should raise net premium (no dividends ${noDiv[0].healthcare}, with ${withDiv[0].healthcare})`,
  );
  console.log('[US] dividend/interest taxation tests passed');
}

async function testCanada() {
  const file = path.join(root, 'Planner_Canada.html');
  // Ontario excluded: its Health Premium is based on the grossed-up dividend and is not reduced by the credit.
  const ordinary = await scenario(file, false, [
    ['dividendYield', 2],
    ['qualifiedDivPct', 0],
  ]);
  const eligible = await scenario(file, false, [
    ['province', 'bc'],
    ['dividendYield', 2],
    ['qualifiedDivPct', 100],
  ]);
  const none = await scenario(file, false, [['province', 'bc'], ['dividendYield', 0]]);
  assert(ordinary[0].tax > none[0].tax + 100, `Canada: dividends should add tax (${ordinary[0].tax} vs ${none[0].tax})`);
  assert(
    eligible[0].tax < ordinary[0].tax,
    `Canada: eligible dividends (gross-up + credit) should owe less than ordinary-rate dividends (${eligible[0].tax} vs ${ordinary[0].tax})`,
  );
  // The grossed-up dividend (1.38x) is what counts as income: $20,000 of
  // eligible dividends adds $27,600, versus $20,000 of ordinary dividends.
  near(
    eligible[0].grossIncome - ordinary[0].grossIncome,
    7600,
    80,
    'Canada: eligible dividends count grossed-up in income',
  );
  console.log('[Canada] dividend/interest taxation tests passed');
}

(async () => {
  await testUS();
  await testCanada();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
