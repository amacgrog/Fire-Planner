// UI check (CI: `npm run test:ui`) of the CSV export and the printed report, both planners: the file name names the dollar view,
// every row has the header's cell count, Year index and Calendar year count up, Net assets matches the run's rows in today's
// and future dollars, Partner B's cells are blank for a single person, the US per-account traditional columns add up to the
// household traditional column (no bonds, no inherited accounts), Canada's labels are RRSP/TFSA; the report has the
// cash-flow table (money in equals money out within $1 a row, on the cells' unrounded values), lifetime taxes and today's
// balances; and a phone-width page does not scroll sideways.
//   npm run build && node test_export_report.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

let failures = 0;
const check = (ok, msg) => {
  if (ok) console.log('  ok   ' + msg);
  else {
    failures++;
    console.log('  FAIL ' + msg);
  }
};

// The header's labels are quoted (some hold commas); data cells are numbers, booleans or blank.
function parseCsv(text) {
  const lines = text.split('\n');
  const header = [...lines[0].matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replaceAll('""', '"'));
  const rows = lines.slice(1).map((l) => l.split(','));
  return { header, rows, col: (label) => header.indexOf(label) };
}
async function exportCsv(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportCsvBtn')]);
  return { name: download.suggestedFilename(), ...parseCsv(fs.readFileSync(await download.path(), 'utf8')) };
}
const setState = (page, base, patch) =>
  page.evaluate((s) => {
    window.__test_replaceState(s);
    document.getElementById('realBtn').click();
    window.__test_flushRender();
  }, { ...base, ...patch });
const cents = (n) => Math.round(n * 100) / 100;

// The report: built by the print button (window.print stubbed), read from the DOM (it is display:none on screen).
async function report(page) {
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.click('#printReportBtn');
  return page.evaluate(() => {
    const root = document.getElementById('printReport'),
      flow = root.querySelector('.pr-flow'),
      sums = [...flow.querySelectorAll('tbody tr')].map((tr) => {
        let inSum = 0,
          outSum = 0;
        tr.querySelectorAll('td[data-side]').forEach((td) => {
          if (td.dataset.side === 'in') inSum += Number(td.dataset.value);
          else if (td.dataset.side === 'out') outSum += Number(td.dataset.value);
        });
        return inSum - outSum;
      });
    return {
      tables: root.querySelectorAll('table.pr-proj').length,
      heads: [...flow.querySelectorAll('thead th')].map((th) => th.textContent),
      rows: sums.length,
      worst: Math.max(...sums.map(Math.abs)),
      kv: [...root.querySelectorAll('.pr-kv tr')].map((tr) => tr.textContent),
    };
  });
}

async function us(browser) {
  console.log('Planner_US.html');
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_US.html'));
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  const base = await page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
  await setState(page, base, { bondYears: 0 });
  const runRows = () => page.evaluate(() => window.fireProjectionRows.map((r) => ({ year: r.year, total: r.total })));

  let csv = await exportCsv(page);
  let rows = await runRows();
  check(csv.name === 'fire-planner-annual-projection-todays-dollars.csv', 'file name names today\'s dollars: ' + csv.name);
  check(csv.header.length === 65, '65 columns: ' + csv.header.length);
  check(csv.rows.length === rows.length, 'one CSV row per projection row: ' + csv.rows.length + ' vs ' + rows.length);
  check(csv.rows.every((r) => r.length === csv.header.length), 'every row has the header\'s cell count');
  const yi = csv.col('Year index'),
    cy = csv.col('Calendar year'),
    year0 = new Date().getFullYear();
  check(csv.rows.every((r, i) => Number(r[yi]) === i && Number(r[cy]) === year0 + i), 'Year index and Calendar year count up from 0 and ' + year0);
  const net = csv.col('Net assets');
  check(Number(csv.rows[0][net]) === cents(rows[0].total), 'year 0 Net assets is the row total: ' + csv.rows[0][net]);
  // The per-account traditional columns add up to the household column (no bonds, no inherited accounts); rounding to the
  // cent leaves at most 2.5 cents.
  const tradCols = ['Partner A traditional IRA (incl. its bonds)', 'Partner A 401(k) (incl. its bonds)', 'Partner B traditional IRA (incl. its bonds)', 'Partner B 401(k) (incl. its bonds)'].map(csv.col),
    tradAll = csv.col('Traditional (all, incl. inherited; excl. bonds)');
  check(tradCols.every((i) => i >= 0) && tradAll >= 0, 'the per-account and household traditional columns exist');
  const worstTrad = Math.max(...csv.rows.map((r) => Math.abs(tradCols.reduce((s, i) => s + Number(r[i]), 0) - Number(r[tradAll]))));
  check(worstTrad <= 0.03, 'per-account traditional columns add up to Traditional (all), worst gap ' + worstTrad);
  check(csv.rows.some((r) => Number(r[tradCols[1]]) > 0 && Number(r[tradCols[3]]) > 0), 'both partners\' 401(k) columns hold money');

  // Future dollars: the file name and a late row's Net assets follow the view.
  await page.click('#dollarModeBtn');
  await page.click('#nominalBtn');
  csv = await exportCsv(page);
  rows = await runRows();
  const k = rows.length - 5;
  check(csv.name === 'fire-planner-annual-projection-future-dollars.csv', 'file name names future dollars: ' + csv.name);
  check(Number(csv.rows[k][net]) === cents(rows[k].total), `row ${k} Net assets is the nominal row total: ${csv.rows[k][net]} vs ${cents(rows[k].total)}`);

  // A single person: Partner B's cells are blank.
  await setState(page, base, { singlePerson: true, filingStatus: 'single' });
  csv = await exportCsv(page);
  const bCols = csv.header.filter((h) => h.startsWith('Partner B')).map(csv.col);
  check(bCols.length === 6, 'six Partner B columns: ' + bCols.length);
  check(csv.rows.every((r) => bCols.every((i) => r[i] === '')), 'Partner B cells are blank for a single person');

  // The report.
  await setState(page, base, {});
  const rep = await report(page);
  check(rep.tables === 2, 'two year-by-year tables: ' + rep.tables);
  check(['Money in', 'Money out', 'Taxes', 'Spending'].every((h) => rep.heads.includes(h)), 'cash-flow headers: ' + rep.heads.join(' | '));
  check(rep.rows === rows.length, 'a cash-flow row per projection year: ' + rep.rows);
  check(rep.worst <= 1, 'money in equals money out within $1 in every row, worst ' + rep.worst);
  check(rep.kv.some((t) => t.startsWith('Lifetime taxes (est.)$')), 'Lifetime taxes in Key results');
  check(rep.kv.some((t) => t.startsWith('Balance today: Partner A 401(k)$')), "today's balances in Key assumptions");

  // A phone-width page does not scroll sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll at 390 px');
  check(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await page.close();
}

async function canada(browser) {
  console.log('Planner_Canada.html');
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', 'Planner_Canada.html'));
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  const csv = await exportCsv(page);
  const n = await page.evaluate(() => window.fireProjectionRows.length);
  check(csv.name === 'fire-planner-canada-annual-projection-todays-dollars.csv', 'file name: ' + csv.name);
  check(csv.header.length === 56, '56 columns: ' + csv.header.length);
  check(csv.rows.length === n && csv.rows.every((r) => r.length === csv.header.length), 'one full row per projection year');
  check(csv.header.includes('RRSP/RRIF (household)') && csv.header.includes('TFSA (household)'), 'RRSP and TFSA columns');
  check(!csv.header.some((h) => /Roth|401\(k\)|Social Security/.test(h)), 'no US labels: ' + csv.header.filter((h) => /Roth|401|Social/.test(h)).join(', '));
  const rep = await report(page);
  check(rep.tables === 2 && rep.rows === n, 'two tables, a cash-flow row per year');
  check(rep.worst <= 1, 'money in equals money out within $1 in every row, worst ' + rep.worst);
  check(rep.kv.some((t) => t.startsWith('Balance today: RRSP$')), "today's balances list the RRSP");
  check(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await us(browser);
    await canada(browser);
  } finally {
    await browser.close();
  }
  console.log(failures ? `${failures} failure(s)` : 'all passed');
  process.exit(failures ? 1 : 0);
})();
