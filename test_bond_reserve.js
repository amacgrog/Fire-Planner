// Bond reserve UI check (CI: `npm run test:ui`), both planners: "Start with it held" on a plan retiring in 5 years changes year 0's
// bonds (held: the whole reserve from year 0; build: the first step of the ramp); a plan retiring now shows the held note and locks
// the Build button; no horizontal overflow at 390x844. Run: node test_bond_reserve.js (after npm run build)
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
      // Retiring now, at phone width: the note shows, Build is locked, nothing overflows.
      {
        const { page, errors } = await open(browser, p, base(p, { retireAgeA: 55, incomeA: 0 }), { width: 390, height: 844 });
        await page.evaluate(() => window.__test_flushRender());
        assert.strictEqual(await noteHidden(page), false, `${p.name}: the year-0 note shows for a plan retiring now`);
        assert.strictEqual(await page.locator('#bondBuildBtn').isDisabled(), true, `${p.name}: Build locked for a plan retiring now`);
        assert((await year0Bonds(page)) > 0, `${p.name}: a plan retiring now holds bonds in year 0`);
        assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${p.name}: no horizontal overflow at 390px`);
        assert.deepStrictEqual(errors, [], `${p.name}: page errors (390px)`);
        await page.close();
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
