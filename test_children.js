// Batch 7A UI check (not run by CI): the Children group in both planners. Add / edit / remove a
// child through the real controls, the group summary, the reload round trip, the join-year field (E2),
// that the join year reaches the projection, and the 390x844 overflow check.
//   node test_children.js
const { chromium } = require('playwright');
const { plannerPath } = require('./tests/helpers/planner-path');
const assert = require('assert');
const path = require('path');

const PLANNERS = [
  { key: 'US', file: 'Planner_US.html', storage: 'fireCouplePlanner.massachusettsOffline.v1' },
  { key: 'Canada', file: 'Planner_Canada.html', storage: 'fireCouplePlanner.canadaOffline.v1' },
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const p of PLANNERS) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('file://' + plannerPath(p.file));
      await page.waitForTimeout(300);
      // The first-run wizard / banner may cover the page; the group itself is in the DOM regardless.
      const group = page.locator('#childrenGroup');
      assert.strictEqual(await group.count(), 1, `[${p.key}] Children group exists`);
      await page.evaluate(() => (document.getElementById('childrenGroup').open = true));
      assert.strictEqual(await page.locator('#childFields .dyn-empty').count(), 1, `[${p.key}] starts empty`);
      assert.strictEqual(await page.locator('#childrenGroupState').innerText(), '', `[${p.key}] no summary when empty`);

      // Add a child: the row has a birth-year field defaulting to the current year, and a student box.
      await page.locator('#childFields [data-dyn-add="children"]').evaluate((b) => b.click());
      const year = new Date().getFullYear();
      assert.strictEqual(await page.inputValue('#child0BirthYear'), String(year), `[${p.key}] new child defaults to this year`);
      assert.strictEqual(await page.locator('#child0Student').isChecked(), false);
      await page.fill('#child0BirthYear', String(year - 5));
      await page.locator('#child0Student').evaluate((c) => c.click());
      await page.locator('#childFields [data-dyn-add="children"]').evaluate((b) => b.click());
      await page.fill('#child1BirthYear', String(year + 2));
      const st = await page.evaluate(() => window.__test_getState().children);
      assert.deepStrictEqual(st, [{ birthYear: year - 5, student: true }, { birthYear: year + 2, student: false }], `[${p.key}] state follows the controls`);
      assert.strictEqual(await page.locator('#childrenGroupState').innerText(), '✓ 2 children', `[${p.key}] summary`);

      // Round trip through autosave.
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(400);
      assert.deepStrictEqual(await page.evaluate(() => window.__test_getState().children), st, `[${p.key}] children survive a reload`);
      assert.strictEqual(await page.inputValue('#child1BirthYear'), String(year + 2), `[${p.key}] controls repopulate`);

      // E2: the join-year box. Blank with the placeholder for a new row, no key in the state. (The group is closed after
      // the reload above; `fill` and `type` need the input visible. No `page.click`: the first-run wizard may cover the
      // page and a click is hit-tested; `type` focuses the element itself.)
      await page.evaluate(() => (document.getElementById('childrenGroup').open = true));
      assert.strictEqual(await page.inputValue('#child0JoinYear'), '', `[${p.key}] join year starts blank`);
      assert.strictEqual(await page.getAttribute('#child0JoinYear', 'placeholder'), 'From birth', `[${p.key}] placeholder`);
      assert.strictEqual('joinYear' in (await page.evaluate(() => window.__test_getState().children[0])), false, `[${p.key}] no joinYear key`);
      // Typed digit by digit: focus stays (the list is not rebuilt) and the final value is the year.
      await page.type('#child0JoinYear', String(year + 3), { delay: 30 });
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'child0JoinYear', `[${p.key}] focus kept while typing`);
      assert.strictEqual(await page.evaluate(() => window.__test_getState().children[0].joinYear), year + 3, `[${p.key}] typed join year stored`);
      // A fractional year is stored rounded (int), as a reload would store it.
      await page.fill('#child0JoinYear', String(year + 3) + '.4');
      assert.strictEqual(await page.evaluate(() => window.__test_getState().children[0].joinYear), year + 3, `[${p.key}] join year rounded`);
      // Cleared: the key is deleted, not 0.
      await page.fill('#child0JoinYear', '');
      assert.strictEqual('joinYear' in (await page.evaluate(() => window.__test_getState().children[0])), false, `[${p.key}] cleared box deletes the key`);
      // Set again, reload: kept; the other row stays blank after the reload.
      await page.fill('#child0JoinYear', String(year + 3));
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(400);
      await page.evaluate(() => (document.getElementById('childrenGroup').open = true));
      assert.strictEqual(await page.inputValue('#child0JoinYear'), String(year + 3), `[${p.key}] join year survives a reload`);
      assert.strictEqual(await page.inputValue('#child1JoinYear'), '', `[${p.key}] a blank join year stays blank after a reload`);
      assert.strictEqual('joinYear' in (await page.evaluate(() => window.__test_getState().children[1])), false, `[${p.key}] no key after the reload`);
      // Other lists are unchanged by the option: a loan's number field (DYN.loans, `rate`, kind 'num', no `blank`) still
      // stores 0 for an empty box and shows 0 after a reload.
      await page.evaluate(() => (document.getElementById('otherLoansGroup').open = true));
      await page.locator('#loanFields [data-dyn-add="loans"]').evaluate((b) => b.click());
      await page.fill('#loan0Rate', '');
      assert.strictEqual(await page.evaluate(() => window.__test_getState().loans[0].rate), 0, `[${p.key}] empty loan rate stores 0`);
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(400);
      await page.evaluate(() => (document.getElementById('otherLoansGroup').open = true));
      assert.strictEqual(await page.inputValue('#loan0Rate'), '0', `[${p.key}] loan rate shows 0 after a reload`);
      // The renderer side: a loan row with NO rate key still renders 0 (only a field with `blank` renders ''). The add
      // button forces a rebuild of the whole list.
      await page.evaluate(() => delete window.__test_getState().loans[0].rate);
      await page.locator('#loanFields [data-dyn-add="loans"]').evaluate((b) => b.click());
      assert.strictEqual(await page.inputValue('#loan0Rate'), '0', `[${p.key}] a missing loan rate renders 0`);
      await page.locator('#loanFields [data-dyn-remove="1"]').evaluate((b) => b.click());
      await page.locator('#loanFields [data-dyn-remove="0"]').evaluate((b) => b.click());
      await page.evaluate(() => (document.getElementById('childrenGroup').open = true));

      // Each list tip says what the list feeds.
      const tip = await page.locator('#childFields .range-note .info-tip').getAttribute('data-tip');
      assert(p.key === 'Canada' ? /Canada Child Benefit/.test(tip) : /ACA household/.test(tip), `[${p.key}] list tip: ${tip.slice(0, 60)}`);

      // Remove one.
      await page.locator('#childFields [data-dyn-remove="0"]').evaluate((b) => b.click());
      assert.strictEqual(await page.locator('#childrenGroupState').innerText(), '✓ 1 child', `[${p.key}] singular summary`);
      assert.strictEqual((await page.evaluate(() => window.__test_getState().children)).length, 1);

      // The cap of ten disables the add button.
      for (let i = 0; i < 12; i++) await page.locator('#childFields [data-dyn-add="children"]').evaluate((b) => b.click());
      assert.strictEqual((await page.evaluate(() => window.__test_getState().children)).length, 10, `[${p.key}] capped at ten`);
      assert.strictEqual(await page.locator('#childFields [data-dyn-add="children"]').isDisabled(), true);

      // Phone width: no horizontal overflow.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `[${p.key}] no horizontal overflow at 390px`);
      assert.deepStrictEqual(errors, [], `[${p.key}] page errors: ${errors}`);
      // E2: the join year reaches the projection (spec 8.3).
      {
        const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const pg = await c2.newPage();
        const errs = [];
        pg.on('pageerror', (e) => errs.push(e.message));
        await pg.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
        const saved =
          p.key === 'US'
            ? {
                singlePerson: true, ageA: 50, retireAgeA: 50, lifeExpectancyA: 60, inflation: 0, medicalInflation: 0,
                stateTax: 'tx', spending: 30000, healthcare: 20000, acaEnabled: true, acaEnhanced: false,
                incomeSources: [{ amount: 90000, startAge: 50, endAge: 60, followGrowth: false, growth: 0 }],
                children: [{ birthYear: 2027, student: false }],
              }
            : {
                province: 'on', singlePerson: false, ageA: 40, ageB: 40, retireAgeA: 40, retireAgeB: 40, inflation: 0,
                taxable: 0, traditional: 0, roth: 2000000, cash: 0, cashReserve: 0, bondYears: 0, dividendYield: 0, hysaRate: 0,
                incomeA: 0, incomeB: 0, cppMonthlyA: 0, cppMonthlyB: 0, oasMonthlyA: 0, oasMonthlyB: 0, pensionYearlyA: 0,
                pensionYearlyB: 0, tenure: 'rent', spending: 40000,
                children: [{ birthYear: 2025, student: false }],
              };
        await pg.addInitScript(([k, v]) => localStorage.setItem(k, v), [p.storage, JSON.stringify({ state: saved, mode: 'real' })]);
        await pg.goto('file://' + plannerPath(p.file));
        await pg.waitForTimeout(400);
        await pg.evaluate(() => (document.getElementById('childrenGroup').open = true));
        const field = p.key === 'US' ? 'tax' : 'benefitCcb';
        const pick = () => pg.evaluate((f) => window.fireProjectionRows.slice(0, 6).map((r) => r[f]), field);
        const fromBirth = await pick();
        await pg.fill('#child0JoinYear', p.key === 'US' ? '2032' : '2028');
        await pg.waitForTimeout(300);
        const joined = await pick();
        if (p.key === 'US') {
          // 2027-2031 (rows 1-5): no head of household and no $2,200 credit yet, so more tax than from birth. Spec 8.3
          // asserts on tax, not healthcare: one child makes the household 2, whose 400% line ($84,600) is still below this
          // household's MAGI, so the premium is $20,000 either way (spec section 10, plan review round 1).
          for (let i = 1; i <= 5; i++) assert(joined[i] > fromBirth[i], `[US] row ${i}: tax ${joined[i]} > from-birth ${fromBirth[i]}`);
        } else {
          // 2026-2027 (rows 0-1): no CCB before the 2028 join year; from birth it was paid.
          assert(fromBirth[0] > 0 && fromBirth[1] > 0, `[Canada] from birth the CCB is paid in 2026-2027`);
          assert.deepStrictEqual(joined.slice(0, 2), [0, 0], `[Canada] no CCB before the join year`);
        }
        await pg.fill('#child0JoinYear', '');
        await pg.waitForTimeout(300);
        assert.deepStrictEqual(await pick(), fromBirth, `[${p.key}] cleared: the from-birth projection again`);
        assert.deepStrictEqual(errs, [], `[${p.key}] page errors: ${errs}`);
        await c2.close();
      }

      await ctx.close();
      console.log(`[${p.key}] children UI ok`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
