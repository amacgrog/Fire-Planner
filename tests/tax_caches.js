// The per-call memos in the tax code ("7D part 2") must never change a number. Each memo is keyed on every
// input it depends on, so nothing is ever cleared; this test is the guard. Compared with Object.is, never a
// tolerance.
//   * taxIndexFactor: the remembered factor against Math.pow, across inflation changes, whole and fractional
//     year indexes, in both orders, and inside a historical run (which has its own factors).
//   node tests/tax_caches.js

const { chromium } = require('playwright');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(250);

  const factor = await page.evaluate(() => {
    const T = window.__test_tax, st = window.__test_getState();
    const inflations = [2.5, 3, 0, 7.25, -1, 2.5, 4, 4, 2.5];
    const years = [0, 1, 2, 3, 10, 40, 100, 255, 256, 300, 2.5, 0.5, -1, 7, 7];
    let n = 0, bad = 0;
    const check = (inf, y) => {
      st.inflation = inf;
      const want = Math.pow(1 + (inf || 0) / 100, y);
      n++;
      if (!Object.is(T.taxIndexFactor(y), want)) bad++;
    };
    for (const inf of inflations) for (const y of years) check(inf, y);
    for (const y of years.slice().reverse()) for (const inf of inflations.slice().reverse()) check(inf, y);
    // Changing inflation between two calls for the same year must miss.
    st.inflation = 3; const a = T.taxIndexFactor(10); st.inflation = 5; const b = T.taxIndexFactor(10); st.inflation = 3; const c = T.taxIndexFactor(10);
    const flipped = !Object.is(a, b) && Object.is(a, c);
    // Inside a historical run the path's own factors are used, then the plan's own come back.
    st.inflation = 2.5;
    const before = T.taxIndexFactor(5);
    const H = window.__test_HIST;
    window.__test_simulateHistorical((y) => H[40 + y]);
    const after = T.taxIndexFactor(5);
    return { n, bad, flipped, restored: Object.is(before, after) && Object.is(after, Math.pow(1.025, 5)) };
  });
  ok(`taxIndexFactor == Math.pow over ${factor.n} calls`, factor.bad === 0, factor);
  ok('a changed inflation misses, the old value returns with it', factor.flipped);
  ok('the plan factor is intact after a historical run', factor.restored);

  ok('no page errors', errors.length === 0, errors);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
