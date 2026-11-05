// UI check (CI: `npm run test:ui`) of the one-year cash-flow diagram, both planners at 1280x900: five bar columns, the total
// over the hub, no plug bands, named and unnamed list rows as their own bands, the slider redrawing from the run render()
// gave it (one source), the future-dollars switch and unique gradient ids.
//   npm run build && node test_sankey.js
const { chromium } = require('playwright');
const path = require('path');

let failures = 0;
const check = (ok, msg) => {
  if (ok) console.log('  ok   ' + msg);
  else {
    failures++;
    console.log('  FAIL ' + msg);
  }
};

async function run(browser, file) {
  console.log(file);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', file));
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function');
  // Two one-time expenses in the same year: the first unnamed, the second named.
  const base = await page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
  const age = base.ageA + 6;
  const lump = (name, amount) => ({ name, amount, age, repeatEvery: 0, untilAge: 85, flat: false, followGrowth: true, growth: base.inflation });
  const patch = { lumpExpenses: [lump('', 30000), lump('New roof', 25000)] };
  const setState = (p) =>
    page.evaluate((s) => {
      window.__test_replaceState(s);
      document.getElementById('realBtn').click();
      window.__test_flushRender();
    }, { ...base, ...p });
  await setState(patch);
  await page.evaluate(() => {
    const d = document.getElementById('sankeyCard');
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
  });
  await page.locator('#sankeySvg rect[data-col]').first().waitFor({ state: 'attached', timeout: 5000 });
  const slide = (i) =>
    page.evaluate((v) => {
      const el = document.getElementById('sankeyAge');
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, i);
  const idx = age - base.ageA;
  await slide(idx);
  const look = () =>
    page.evaluate(() => {
      const svg = document.getElementById('sankeySvg');
      const bars = [...svg.querySelectorAll('rect[data-col]')];
      const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent);
      return {
        cols: [...new Set(bars.map((b) => b.getAttribute('data-col')))].sort(),
        xs: [...new Set(bars.map((b) => b.getAttribute('x')))].length,
        hub: svg.querySelector('text.sankey-total')?.textContent ?? '',
        texts,
        bold: svg.querySelectorAll('b').length,
        year: svg.getAttribute('data-year'),
        total: svg.getAttribute('data-total'),
        readout: document.getElementById('sankeyAgeOut').textContent,
        height: svg.getBoundingClientRect().height,
      };
    });
  let s = await look();
  check(s.cols.join() === '0,1,2,3,4', 'five bar columns: ' + s.cols.join());
  check(s.xs === 5, 'five distinct bar x positions: ' + s.xs);
  check(s.hub.startsWith('Total'), 'the hub label starts with "Total": ' + s.hub);
  check(!s.texts.some((t) => /From portfolio|To savings/.test(t)), 'no plug band');
  check(s.texts.includes('New roof'), 'the named one-time expense is its own band');
  check(s.texts.includes('One-time expense 1'), 'the unnamed one is "One-time expense 1"');
  check(/^Ages? \d+( \/ \d+)? · \d{4}$/.test(s.readout), 'the readout: ' + s.readout);
  check(s.height >= 300 && s.height <= 480, 'the card height is computed: ' + s.height);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!sideways, 'the page does not scroll sideways');
  const wrapScroll = await page.evaluate(() => {
    const w = document.getElementById('sankeySvg').closest('.chart-wrap');
    return w.scrollWidth > w.clientWidth;
  });
  check(!wrapScroll, 'the card does not scroll sideways at 1280');

  // A name with markup is literal text.
  await setState({ lumpExpenses: [lump('', 30000), lump('<b>Roof</b> & "gutters"', 25000)] });
  s = await look();
  check(s.bold === 0 && s.texts.some((t) => t.startsWith('<b>Roof')), 'a name with markup is text');
  await setState(patch);

  // One source: render() draws index idx; the slider away and back draws the same year from the same run, even when the
  // state has changed since without a render.
  const first = await look();
  check(first.year !== null && first.total !== null, 'data-year and data-total are set: ' + first.year + ' ' + first.total);
  await page.evaluate((s) => window.__test_replaceState(s), { ...base, ...patch, spending: base.spending * 2 });
  await slide(idx + 3);
  s = await look();
  check(s.year !== first.year, 'the slider moves the year: ' + s.year);
  await slide(idx);
  s = await look();
  check(s.year === first.year && s.total === first.total, 'back to the same year from the same run: ' + s.total + ' vs ' + first.total);
  await setState(patch);
  await slide(idx);

  // Future dollars change the hub label; gradient ids are unique.
  const realHub = (await look()).hub;
  await page.evaluate(() => {
    document.getElementById('nominalBtn').click();
    window.__test_flushRender();
  });
  s = await look();
  check(s.hub !== realHub, 'future dollars change the total: ' + realHub + ' -> ' + s.hub);
  const ids = await page.evaluate(() => [...document.querySelectorAll('linearGradient')].map((g) => g.id));
  check(ids.length > 0 && new Set(ids).size === ids.length, 'gradient ids are unique (' + ids.length + ')');
  await page.evaluate(() => document.getElementById('realBtn').click());

  // Hover a bar: the tooltip names it with its share.
  const bar = page.locator('#sankeySvg rect[data-col="4"]').first();
  await bar.hover();
  const tip = await page.evaluate(() => {
    const t = document.querySelector('#sankeyCard .sankey-tooltip');
    return t && t.style.display !== 'none' ? t.textContent : '';
  });
  check(/% of the year's money/.test(tip), 'hover shows the tooltip: ' + tip.slice(0, 80));

  check(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const file of ['Planner_US.html', 'Planner_Canada.html']) await run(browser, file);
  } finally {
    await browser.close();
  }
  if (failures) {
    console.log(failures + ' failure(s)');
    process.exit(1);
  }
  console.log('test_sankey.js: all checks passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
