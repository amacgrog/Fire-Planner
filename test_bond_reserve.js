// Bond reserve UI check (CI: `npm run test:ui`), both planners: "Start with it held" on a plan retiring in 5 years changes year 0's
// bonds (held: the whole reserve from year 0; build: the first step of the ramp); a plan retiring now keeps Build (held is opt-in)
// and shows the hint that the reserve is built over its first years, which hides once Held is picked; no horizontal overflow at
// 390x844. Run: node test_bond_reserve.js (after npm run build)
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PLANNERS = [
  {
    name: 'US', file: 'Planner_US.html', key: 'fireCouplePlanner.massachusettsOffline.v1',
    accounts: { tradIraA: 0, trad401kA: 800000, rothIraA: 200000, roth401kA: 0, stateTax: 'tx' },
  },
  {
    name: 'Canada', file: 'Planner_Canada.html', key: 'fireCouplePlanner.canadaOffline.v1',
    accounts: { traditional: 800000, roth: 200000, province: 'on' },
  },
];
const base = (p, over) => ({
  singlePerson: true, ageA: 55, retireAgeA: 60, lifeExpectancyA: 90, incomeA: 120000, taxable: 400000, cash: 40000,
  spending: 60000, bondYears: 5, bondStart: 'build', ...p.accounts, ...over,
});

async function open(browser, p, saved, viewport) {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [p.key, JSON.stringify({ state: saved, mode: 'real' })]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'dist', p.file));
  await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && typeof window.__test_flushRender === 'function');
  return { page, errors };
}
// The note's own `hidden` attribute (its group may be closed at phone width, so visibility is not the test).
const noteHidden = (page) => page.$eval('#bondStartNote', (e) => e.hidden);
const year0Bonds = (page) => page.evaluate(() => (window.__test_flushRender(), window.fireProjectionRows[0].bonds));

(async () => {
  const browser = await chromium.launch();
  try {
    for (const p of PLANNERS) {
      // Retiring in 5 years: Build ramps the reserve (year 0 holds a fifth of it), Held holds all of it from year 0.
      {
        const { page, errors } = await open(browser, p, base(p), { width: 1280, height: 900 });
        const built = await year0Bonds(page);
        assert.strictEqual(await noteHidden(page), true, `${p.name}: no year-0 note for a later retirement`);
        assert.strictEqual(await page.locator('#bondBuildBtn').isDisabled(), false, `${p.name}: Build enabled for a later retirement`);
        await page.click('#bondHeldBtn');
        const held = await year0Bonds(page);
        console.log(`${p.name}: year-0 bonds build ${Math.round(built)}, held ${Math.round(held)}`);
        assert(built > 0, `${p.name}: the build puts something in bonds in year 0`);
        assert(held > built * 2, `${p.name}: held holds more than the ramp's first step (${held} vs ${built})`);
        assert.strictEqual(await page.getAttribute('#bondHeldBtn', 'aria-checked'), 'true', `${p.name}: Held checked`);
        await page.click('#bondBuildBtn');
        assert.strictEqual(await year0Bonds(page), built, `${p.name}: Build again gives the build's year 0`);
        assert.deepStrictEqual(errors, [], `${p.name}: page errors`);
        await page.close();
      }
      // Retiring now, at phone width: Build stays chosen and enabled, the hint shows; Held hides it; nothing overflows.
      {
        const { page, errors } = await open(browser, p, base(p, { retireAgeA: 55, incomeA: 0 }), { width: 390, height: 844 });
        const built = await year0Bonds(page);
        assert.strictEqual(await noteHidden(page), false, `${p.name}: the year-0 hint shows for a plan retiring now with Build`);
        const hint = await page.$eval('#bondStartNote', (e) => e.textContent);
        assert.strictEqual(hint, 'You retire this year: the reserve is built over your first 5 years. Choose held if you already own these bonds.', `${p.name}: hint text`);
        assert.strictEqual(await page.locator('#bondBuildBtn').isDisabled(), false, `${p.name}: Build enabled for a plan retiring now`);
        assert.strictEqual(await page.getAttribute('#bondBuildBtn', 'aria-checked'), 'true', `${p.name}: Build checked for a plan retiring now`);
        assert(built > 0, `${p.name}: the build puts something in bonds in year 0`);
        await page.evaluate(() => document.getElementById('bondHeldBtn').click());
        const held = await year0Bonds(page);
        assert.strictEqual(await noteHidden(page), true, `${p.name}: the hint hides once Held is picked`);
        assert(held > built * 2, `${p.name}: held from year 0 holds more than the ramp's first step (${held} vs ${built})`);
        assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${p.name}: no horizontal overflow at 390px`);
        // A reserve of one year or less: the hint says "year", not "1 years".
        await page.evaluate(() => document.getElementById('bondBuildBtn').click());
        await page.evaluate(() => {
          const el = document.getElementById('bondYears');
          el.value = '1';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          window.__test_flushRender();
        });
        assert.strictEqual(await page.$eval('#bondStartNote', (e) => e.textContent), 'You retire this year: the reserve is built over your first year. Choose held if you already own these bonds.', `${p.name}: singular hint at bondYears 1`);
        assert.deepStrictEqual(errors, [], `${p.name}: page errors (390px)`);
        await page.close();
      }
    }
    // US only: the traditional/Roth split slider. At 80 with Roth money the rows change vs 100 and the note is empty; with no Roth
    // money the reserve holds 100/0 and the note says Roth fell short; no horizontal overflow at 390x844 with the slider in view.
    {
      const p = PLANNERS[0];
      const setSlider = (page, v) => page.evaluate((x) => {
        const el = document.getElementById('bondTradPct');
        el.value = String(x);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        window.__test_flushRender();
      }, v);
      const rowsKey = (page) => page.evaluate(() => JSON.stringify(window.fireProjectionRows.map((r) => r.bonds)));
      const note = (page) => page.$eval('#bondSplitNote', (e) => e.textContent);
      {
        const { page, errors } = await open(browser, p, base(p), { width: 390, height: 844 });
        const at100 = await rowsKey(page);
        assert.strictEqual(await note(page), '', 'US: no split note at the default');
        await setSlider(page, 80);
        assert.strictEqual(await note(page), '', 'US: no note when the reserve held the split it was asked for');
        await page.evaluate(() => document.getElementById('bondTradPct').scrollIntoView());
        assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'US: no horizontal overflow at 390px with the slider shown');
        assert.deepStrictEqual(errors, [], 'US: page errors (split slider)');
        await page.close();
        const noRoth = { ...base(p), rothIraA: 0, roth401kA: 0 };
        const b = await open(browser, p, noRoth, { width: 1280, height: 900 });
        await setSlider(b.page, 80);
        assert.strictEqual(await note(b.page), 'Held 100/0 at retirement: not enough in Roth.', 'US: the note names Roth when it fell short');
        await setSlider(b.page, 100);
        assert.strictEqual(await note(b.page), '', 'US: the note clears at 100');
        await b.page.close();
        const c = await open(browser, p, { ...base(p), bondTradPct: 80 }, { width: 1280, height: 900 });
        const at80 = await rowsKey(c.page);
        assert.notStrictEqual(at80, at100, 'US: the split changes the projection rows');
        await c.page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log('test_bond_reserve: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
