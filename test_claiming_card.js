// SS claiming optimizer PR 4 (US): the "When to claim Social Security" card. It is hidden for a couple, for no Social Security
// and when everything is already collecting; it shows a one-line status with nothing to search; open, it searches in timer
// slices (held here: __test_flushRender() then __test_flushClaimSearch()), draws the grid with the current choice outlined and
// "same as" cells, the longevity row and its sentence; Apply writes the ages, syncs the boxes and undoes in one step, and is
// refused on changed inputs, in market-scenario mode and during a move preview; the 390x844 layout does not scroll sideways.
// Run: node test_claiming_card.js (tests/ui_scripts.js runs it held too; it also holds its own pages).

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'dist', 'Planner_US.html');

async function open(browser, { viewport = { width: 1280, height: 900 }, hold = true } = {}) {
  const context = await browser.newContext({ viewport });
  // Runs after the preloaded hold (tests/ui_scripts.js), so `hold: false` runs the real timers.
  await context.addInitScript(`globalThis.__testHoldGuidance = ${hold};`);
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => Array.isArray(window.fireProjectionRows) && window.fireProjectionRows.length > 0);
  return { page, errors, context };
}
// Replaces the plan with the page's first state (the defaults) plus `patch`, syncs the boxes and runs a full render.
const load = (page, patch) =>
  page.evaluate((patch) => {
    window.__claimBase ??= JSON.parse(JSON.stringify(window.__test_getState()));
    window.__test_replaceState({ ...window.__claimBase, ...patch });
    window.__test_syncControls();
    document.getElementById('realBtn').click();
  }, patch);
const fullRender = (page) => page.evaluate(() => document.getElementById('realBtn').click());
const openCard = (page, on = true) =>
  page.evaluate((on) => {
    document.getElementById('claimingCard').open = on;
  }, on);
const flush = (page) =>
  page.evaluate(() => {
    window.__test_flushRender();
    window.__test_flushClaimSearch();
  });
const card = (page) => page.evaluate(() => window.__test_claimingCard());
const st = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));

// A single person of 62 (born 1964), 2,000 a month at full retirement age, claiming at 62 now; the defaults otherwise.
const SINGLE = { singlePerson: true, ageA: 62, retireAgeA: 62, lifeExpectancyA: 90, incomeA: 0, ssMonthlyA: 2000, ssBenefitBasisA: 'pia', ssStartAgeA: 62 };
// PR 3's "own first, survivor later" case: no tax and no cliff plan, a widowed person of 60 (born 1966), own 2,000 and survivor
// 3,000 a month at full retirement age; hand winner own 62, survivor 67 (5 x 16,800 + 24 x 36,000 = 948,000) over the current
// survivor 60, own 70 (10 x 25,740 + 21 x 29,760 = 882,360).
const WIDOWED = {
  singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 90, incomeA: 0, tenure: 'rent', rent: 0, homeValue: 0,
  mortgage: 0, mortgagePrincipal: 0, maintenance: 0, cash: 400000, cashReserve: 1000000, taxable: 0, tradIraA: 0, trad401kA: 0,
  rothIraA: 0, roth401kA: 0, returnRate: 0, hysaRate: 0, bondReturn: 0, bondYears: 0, dividendYield: 0, inflation: 0,
  spending: 10000, healthcare: 0, medicareYearly: 0, acaEnabled: false, cliffGuardEnabled: false, rothConvEnabled: false,
  guardrailsEnabled: false, stateTax: 'tx', ssMonthlyA: 2000, ssStartAgeA: 70, ssBenefitBasisA: 'pia', ssWidowed: true,
  ssSurvivorMonthlyFra: 3000, ssSurvivorStartAge: 60,
};
const WIDOWED_BEST = 'your own benefit at 62, then the survivor benefit at 67 (the full survivor amount)';

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL - ${name}\n  ${e.message.split('\n').join('\n  ')}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);

    await check('hidden for a couple, no Social Security, or everything collecting', async () => {
      assert.strictEqual((await card(page)).hidden, true, 'the default couple');
      await load(page, { ssBenefitBasisA: 'pia', ssBenefitBasisB: 'pia' });
      assert.strictEqual((await card(page)).hidden, true, 'a couple in the pia basis (until PR 5)');
      await load(page, { ...SINGLE, ssMonthlyA: 0 });
      assert.strictEqual((await card(page)).hidden, true, 'no Social Security');
      await load(page, { ...SINGLE, ageA: 66, retireAgeA: 66, ssStartAgeA: 64, ssCollectingA: true });
      assert.strictEqual((await card(page)).hidden, true, 'already collecting');
    });

    await check("'atClaim': the status line at once, and the button reveals the basis field", async () => {
      await load(page, { ...SINGLE, ssBenefitBasisA: 'atClaim' });
      await openCard(page);
      const c = await card(page);
      assert.strictEqual(c.hidden, false);
      assert.strictEqual(c.status, 'atClaim');
      assert.match(c.statusLine, /^Enter your benefit at full retirement age/);
      assert.strictEqual(c.goToField, true);
      assert.strictEqual(c.headline, '');
      assert.strictEqual(c.applyShown, false);
      await page.click('#claimingGoToFieldBtn');
      await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'ssBenefitBasisA');
      await openCard(page, false);
    });

    await check('not searched while closed', async () => {
      const before = (await card(page)).searches;
      await load(page, SINGLE);
      await flush(page);
      const c = await card(page);
      assert.strictEqual(c.open, false);
      assert.strictEqual(c.searches, before, 'no job while closed');
      assert.strictEqual(c.result, null);
    });

    await check('held: measuring until the flush, then the single grid', async () => {
      await openCard(page);
      await page.evaluate(() => window.__test_flushRender());
      // The toggle schedules the job; under the hold it waits.
      await page.waitForFunction(() => window.__test_claimingCard().pending);
      let c = await card(page);
      assert.strictEqual(c.measuring, true, 'the measuring line');
      // Closed and reopened: the same job, not a second one.
      const n = c.searches;
      await openCard(page, false);
      await openCard(page);
      await page.waitForFunction(() => document.getElementById('claimingCard').open);
      await flush(page);
      c = await card(page);
      assert.strictEqual(c.searches, n, 'reopening resumes the job');
      assert.strictEqual(c.pending, false);
      assert.strictEqual(c.measuring, false);
      assert.strictEqual(c.grid.length, 1);
      assert.strictEqual(c.grid[0].length, 9);
      assert.deepStrictEqual(c.currentCell, [0, 0], 'the current choice (62) outlined');
      assert.strictEqual(c.grid[0][0], 'current');
      assert.strictEqual(c.headline, c.result.headline);
      assert.match(c.headline, /^Best: /);
      assert.ok(c.titles.every((t) => t.includes("in today's dollars")), 'every tooltip in today\'s dollars');
      assert.strictEqual(c.longevity.length, 2);
      assert.deepStrictEqual(c.longevity[0].slice(1), ['80', '85', '90', '95']);
      assert.ok(c.sentence.length > 0);
      assert.match(c.lines[0], /^Uses standard projections with guardrails off/);
    });

    await check('not in the light render, once after the deferred pass', async () => {
      const n = (await card(page)).searches;
      await page.evaluate(() => {
        const e = document.getElementById('spending');
        e.value = String(window.__test_getState().spending + 1000);
        e.dispatchEvent(new Event('input', { bubbles: true }));
        window.__test_flushLightRender();
      });
      assert.strictEqual((await card(page)).searches, n, 'nothing after the light render');
      await flush(page);
      assert.strictEqual((await card(page)).searches, n + 1, 'one search after the deferred pass');
    });

    await check('a rename or a goal chip keeps the result', async () => {
      await load(page, { ...SINGLE, oneTimeIncome: [{ name: 'Gift', age: 70, amount: 1000 }] });
      await flush(page);
      const n = (await card(page)).searches;
      const before = (await card(page)).result;
      await page.evaluate(() => {
        window.__test_getState().oneTimeIncome[0].name = 'Bequest';
      });
      await fullRender(page);
      await flush(page);
      assert.strictEqual((await card(page)).searches, n, 'a rename');
      await page.click('.guidance-chip:not([hidden])');
      await fullRender(page);
      await flush(page);
      const c = await card(page);
      assert.strictEqual(c.searches, n, 'a goal chip');
      assert.deepStrictEqual(c.result, before);
    });

    // The stored-plan line ("Re-run Plan search after applying.") is covered by tests/unit/us/claim-text.test.js (claimLines).
    await check('outside the grid', async () => {
      await load(page, { ...SINGLE, ageA: 64, retireAgeA: 64, ssLateStartEnabled: true, ssStartAgeA: 72 });
      await flush(page);
      const c = await card(page);
      assert.strictEqual(c.result.currentCell, -1);
      assert.match(c.currentLine, /^Your current choice \(claim at 72\) is outside the ages searched/);
      assert.strictEqual(c.currentCell, null, 'no cell outlined');
    });

    await check('the widowed grid, Apply, the synced boxes and Undo', async () => {
      await page.evaluate(() => window.__test_freezeSimResults(true));
      await load(page, WIDOWED);
      await flush(page);
      let c = await card(page);
      assert.strictEqual(c.kind, 'widowed');
      assert.strictEqual(c.grid.length, 8, 'survivor 60-67');
      assert.ok(c.grid.every((row) => row.length === 9), 'own 62-70');
      assert.ok(c.grid.flat().some((t) => t.startsWith('same as ')), 'a "same as" cell');
      assert.deepStrictEqual(c.currentCell, [0, 8], 'survivor 60, own 70');
      assert.deepStrictEqual(c.bestCell, [7, 0], 'survivor 67, own 62');
      assert.strictEqual(
        c.headline,
        `Best: ${WIDOWED_BEST}. After-tax end value $65,640 more than your current choice (survivor benefit at 60, then your own at 70), in today's dollars.`,
      );
      assert.strictEqual(c.lines.length, 1, 'no cliff plan, no stored plan: one line');
      assert.strictEqual(c.applyShown, true);
      assert.strictEqual(c.applyLabel, 'Apply: survivor at 67, own at 62');
      await page.click('#claimingApplyBtn');
      let s = await st(page);
      assert.strictEqual(s.ssStartAgeA, 62);
      assert.strictEqual(s.ssSurvivorStartAge, null, 'the full-amount cell writes the null start');
      assert.strictEqual(await page.inputValue('#ssStartAgeA'), '62');
      assert.strictEqual(await page.inputValue('#ssSurvivorStartAge'), '');
      assert.strictEqual(await page.isVisible('#undoToast'), true);
      c = await card(page);
      assert.strictEqual(c.applyShown, false, 'hidden until the new result');
      assert.strictEqual(c.applyNote, 'Applied.');
      await flush(page);
      c = await card(page);
      assert.strictEqual(c.headline, `Best: your current choice, ${WIDOWED_BEST}.`);
      assert.strictEqual(c.applyShown, false);
      await page.click('#undoToastBtn');
      s = await st(page);
      assert.strictEqual(s.ssStartAgeA, 70);
      assert.strictEqual(s.ssSurvivorStartAge, 60);
      assert.strictEqual(await page.inputValue('#ssStartAgeA'), '70');
      assert.strictEqual(await page.inputValue('#ssSurvivorStartAge'), '60');
      await page.evaluate(() => window.__test_freezeSimResults(false));
    });

    await check('Apply refused on changed inputs', async () => {
      await load(page, WIDOWED);
      await flush(page);
      await page.evaluate(() => {
        window.__test_getState().spending += 1000;
      });
      assert.strictEqual(await page.evaluate(() => window.__test_applyClaim()), false);
      const c = await card(page);
      assert.strictEqual(c.applyNote, 'Your inputs changed since these ages were compared; the card is comparing them again.');
      assert.strictEqual(c.applyShown, false);
      assert.strictEqual((await st(page)).ssStartAgeA, 70);
    });

    await check('Apply refused in market-scenario mode and during a move preview', async () => {
      await load(page, WIDOWED);
      await flush(page);
      await page.evaluate(() =>
        window.__test_runMarketScenario({ kind: 'crash', crashes: [{ age: 63, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] }),
      );
      await flush(page);
      let c = await card(page);
      assert.strictEqual(c.applyShown, true);
      assert.strictEqual(c.applyDisabled, true);
      assert.strictEqual(c.applyNote, 'Revert the market scenario to apply a claiming age.');
      assert.strictEqual(await page.evaluate(() => window.__test_applyClaim()), false);
      assert.strictEqual((await st(page)).ssStartAgeA, 70);
      await page.evaluate(() => window.__test_revertMarketScenario());
      await flush(page);
      c = await card(page);
      assert.strictEqual(c.applyDisabled, false, 'enabled again after Revert');
      await page.evaluate(() => window.__test_tryMove({ label: 'spend less', patch: { spending: 9000 } }));
      await flush(page);
      c = await card(page);
      assert.strictEqual(c.applyDisabled, true);
      assert.strictEqual(c.applyNote, 'Keep or revert the change you are previewing to apply a claiming age.');
      assert.strictEqual(await page.evaluate(() => window.__test_applyClaim()), false);
      await page.evaluate(() => window.__test_revertMove());
    });

    assert.deepStrictEqual(errors, [], 'no page errors');
    await page.context().close();

    await check('the real timer path, unheld', async () => {
      const u = await open(browser, { hold: false });
      await load(u.page, SINGLE);
      await openCard(u.page);
      await u.page.waitForFunction(() => {
        const c = window.__test_claimingCard();
        return !c.pending && c.result !== null && c.fresh;
      }, null, { timeout: 20000 });
      const c = await card(u.page);
      assert.strictEqual(c.grid[0].length, 9);
      assert.deepStrictEqual(u.errors, []);
      await u.context.close();
    });

    await check('390x844: no sideways scroll with the widowed grid open', async () => {
      const m = await open(browser, { viewport: { width: 390, height: 844 } });
      await load(m.page, WIDOWED);
      await openCard(m.page);
      await flush(m.page);
      assert.strictEqual((await card(m.page)).grid.length, 8);
      const over = await m.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.strictEqual(over, false, 'the page does not scroll sideways');
      assert.deepStrictEqual(m.errors, []);
      await m.context.close();
    });
  } catch (e) {
    failures++;
    console.log(`FAIL - ${e.stack}`);
  } finally {
    await browser.close();
  }
  if (failures) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('test_claiming_card: all checks passed');
})();
