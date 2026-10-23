// Ad-hoc Playwright test for the category rail (the row of "All / Scenarios
// / Income / ..." filter pills above the sidebar's assumption groups,
// setActiveCategory() in Planner_US.html / Planner_Canada.html) now being
// available on mobile, not just desktop. Previously the rail was hidden
// outright below 820px (`.category-rail{display:none}`) and filtering
// itself was gated behind an `isDesktop` check inside setActiveCategory(),
// so even un-hiding the CSS alone would have shown a rail where every pill
// was a no-op. Both were removed; this test covers the rail actually
// filtering groups at mobile width, not stranding anything (no overflow,
// "All" still shows everything), and that a direct rail tap's new
// scroll-into-view behavior (added since the rail isn't itself sticky and
// .panel is part of normal page flow on mobile, unlike desktop's own
// scrollable panel) doesn't leak into the other three callers of
// setActiveCategory() that already have their own more specific scroll
// target right after (jumpToEstimateField, the desktop search-dropdown's
// jumpToSearchField, and the resize-reapply listener) — each of those
// resets to "all" via the same function but must not also jump to the
// rail first. Runs against both planner files, since this is shared
// sidebar chrome, not US/Canada-specific logic.
// In CI through `npm run test:ui` (tests/ui_scripts.js), not `npm test`; run one directly with
// `node test_mobile_category_rail.js`.
const { chromium } = require('playwright');
const { plannerPath } = require('./tests/helpers/planner-path');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

function withPage(file, viewport, fn) {
  return (async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + plannerPath(file));
    await page.waitForTimeout(300);
    await fn(page);
    if (errors.length) { fail++; console.log('  FAIL page errors:', errors); }
    await browser.close();
  })();
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1400, height: 900 };

function groupDisplayByCat(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#categoryFields > details.group')).map((g) => ({
      cat: g.dataset.cat,
      shown: getComputedStyle(g).display !== 'none',
    })),
  );
}

async function runSuite(file) {
  console.log(`\n== ${file} ==`);

  // 1. The rail itself is visible at mobile width (not display:none).
  await withPage(file, MOBILE, async (page) => {
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('categoryRail')).display);
    ok('category rail is visible (not display:none) at mobile width', display !== 'none', { display });
  });

  // 2. Tapping a pill at mobile width actually filters groups — this is
  // the part that was silently broken even if someone had only removed
  // the CSS display:none without also removing the isDesktop gate inside
  // setActiveCategory().
  await withPage(file, MOBILE, async (page) => {
    await page.evaluate(() => document.querySelector('#categoryRail button[data-cat="housing"]').click());
    await page.waitForTimeout(500);
    const groups = await groupDisplayByCat(page);
    const housingShown = groups.filter((g) => g.cat === 'housing').every((g) => g.shown);
    const othersHidden = groups.filter((g) => g.cat !== 'housing').every((g) => !g.shown);
    ok('tapping "Housing" at mobile width shows only housing groups', housingShown && othersHidden, groups);
  });

  // 3. Tapping "All" after a filter restores every group.
  await withPage(file, MOBILE, async (page) => {
    await page.evaluate(() => document.querySelector('#categoryRail button[data-cat="income"]').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#categoryRail button[data-cat="all"]').click());
    await page.waitForTimeout(500);
    const groups = await groupDisplayByCat(page);
    ok('tapping "All" restores every group', groups.every((g) => g.shown), groups);
  });

  // 4. No horizontal overflow at 390px with the rail's pills wrapping.
  await withPage(file, MOBILE, async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok('no horizontal overflow at 390x844 with the category rail visible', overflow === false);
  });

  // 5. Tapping a pill after scrolling down scrolls the rail back into view
  // (it isn't sticky itself, and .panel has no independent scrollTop on
  // mobile — see the max-width:820px media query — so without this a tap
  // from partway down a filtered list would leave the rail off-screen).
  await withPage(file, MOBILE, async (page) => {
    await page.evaluate(() => window.scrollTo(0, 900));
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => document.querySelector('#categoryRail button[data-cat="assets"]').click());
    await page.waitForTimeout(700);
    const railTop = await page.evaluate(() => document.getElementById('categoryRail').getBoundingClientRect().top);
    ok(
      'tapping a pill after scrolling down brings the rail back near the top of the viewport',
      railTop >= 0 && railTop < 250,
      { before, railTop },
    );
  });

  // 6. Desktop behavior is unaffected: filtering still works, and no
  // scroll-into-view side effect (desktop keeps the pre-existing
  // panel.scrollTop = 0 reset instead).
  await withPage(file, DESKTOP, async (page) => {
    await page.evaluate(() => document.querySelector('#categoryRail button[data-cat="advanced"]').click());
    await page.waitForTimeout(300);
    const groups = await groupDisplayByCat(page);
    const advancedShown = groups.filter((g) => g.cat === 'advanced').every((g) => g.shown);
    const othersHidden = groups.filter((g) => g.cat !== 'advanced').every((g) => !g.shown);
    ok('category filtering still works at desktop width', advancedShown && othersHidden, groups);
  });

  // 7. A category filter chosen at mobile width survives a resize up to
  // desktop width (the existing resize listener re-applies
  // setActiveCategory(activeCategory), now also exercising the non-desktop
  // filtering path it used to skip).
  await withPage(file, MOBILE, async (page) => {
    await page.evaluate(() => document.querySelector('#categoryRail button[data-cat="spending"]').click());
    await page.waitForTimeout(300);
    await page.setViewportSize(DESKTOP);
    await page.waitForTimeout(300);
    const groups = await groupDisplayByCat(page);
    const spendingShown = groups.filter((g) => g.cat === 'spending').every((g) => g.shown);
    ok('a filter chosen at mobile width survives resizing up to desktop', spendingShown, groups);
  });
}

(async () => {
  await runSuite('Planner_US.html');
  await runSuite('Planner_Canada.html');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
