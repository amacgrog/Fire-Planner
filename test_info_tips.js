// Ad-hoc Playwright check for the sidebar info bubbles (ⓘ). Run: node test_info_tips.js
const { chromium } = require('playwright');
const { plannerPath } = require('./tests/helpers/planner-path');
const path = require('path');

const FILES = ['Planner_US.html', 'Planner_Canada.html'];
let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log('  FAIL:', msg);
  }
};

async function run(browser, file, viewport, label) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + plannerPath(file));
  await page.waitForTimeout(400);
  console.log(`[${file}] ${label}`);
  const mobile = viewport.width <= 820;
  if (mobile) {
    await page.evaluate(() => document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs'));
    // Let the plan status bar settle first. Its debounced historical pass lands after load, wraps the mobile bar onto a
    // second line and pulses "Updated just now" for 3 s; each resize moves the sidebar below it. A click caught by that
    // move is retried by Playwright with a scroll, the scroll closes the bubble, and the retried click reopens it.
    await page.waitForFunction(
      () => {
        const bar = document.getElementById('planStatusBar'),
          h = bar.offsetHeight,
          same = window.__barH === h;
        window.__barH = h;
        return (
          same &&
          /% historical/.test(document.getElementById('planStatusText').textContent) &&
          !document.getElementById('planStatusUpdated').classList.contains('show')
        );
      },
      null,
      { polling: 100, timeout: 15000 },
    );
  }
  // Open every group so every bubble is on screen-able.
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => (d.open = true)));

  const info = await page.evaluate(() => {
    const tips = [...document.querySelectorAll('.info-tip')];
    return {
      count: tips.length,
      empty: tips.filter((t) => !(t.dataset.tip || '').trim()).length,
      longestSmall: Math.max(
        ...[...document.querySelectorAll('#panelBody label small, #panelBody .range-note')].map((s) => s.textContent.replace(/i$/, '').length),
      ),
    };
  });
  console.log(`  bubbles: ${info.count}, empty tips: ${info.empty}, longest remaining descriptor: ${info.longestSmall} chars`);
  check(info.count > 40, 'expected 40+ bubbles');
  check(info.empty === 0, 'no empty tips');

  // 1. Checkbox-label bubble must not toggle the checkbox.
  const cb = await page.$('#guardrailsEnabled');
  const before = await cb.isChecked();
  const tipBtn = await page.$('label[for="guardrailsEnabled"] .info-tip');
  await tipBtn.scrollIntoViewIfNeeded();
  await tipBtn.click();
  const bubble = page.locator('#infoBubble');
  check(await bubble.isVisible(), 'bubble opens on click');
  check((await cb.isChecked()) === before, 'clicking ⓘ must not toggle the checkbox');
  const text = await bubble.textContent();
  check(text === (await tipBtn.getAttribute('data-tip')), 'bubble text equals data-tip');
  check((await tipBtn.getAttribute('aria-expanded')) === 'true', 'aria-expanded true while open');
  const box = await bubble.boundingBox();
  check(box && box.x >= 0 && box.x + box.width <= viewport.width + 0.5, 'bubble within viewport horizontally');
  check(box && box.y >= 0 && box.y + box.height <= viewport.height + 0.5, 'bubble within viewport vertically');

  // 2. Second click closes; click outside closes; Escape closes.
  await tipBtn.click();
  check(!(await bubble.isVisible()), 'second click closes');
  await tipBtn.click();
  await page.mouse.click(5, viewport.height - 5);
  check(!(await bubble.isVisible()), 'outside click closes');
  await tipBtn.click();
  await page.keyboard.press('Escape');
  check(!(await bubble.isVisible()), 'Escape closes');
  check((await tipBtn.getAttribute('aria-expanded')) === 'false', 'aria-expanded false after close');

  // 3. Slider-label bubble must not move or focus the slider.
  const sliderId = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.range-field')].find((r) => r.querySelector('label .info-tip') && r.querySelector('input[type=range]'));
    return f.querySelector('input[type=range]').id;
  });
  const sliderTip = await page.$(`label[for="${sliderId}"] .info-tip`);
  await sliderTip.scrollIntoViewIfNeeded();
  const sliderBefore = await page.$eval('#' + sliderId, (s) => s.value);
  await sliderTip.click();
  check((await page.$eval('#' + sliderId, (s) => s.value)) === sliderBefore, 'slider value unchanged by ⓘ click');
  check(await bubble.isVisible(), 'slider-label bubble opens');
  // 4. Scroll closes it.
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(150);
  check(!(await bubble.isVisible()), 'scrolling closes the bubble');

  // 5. Opening one bubble replaces another.
  const tips = await page.$$('#panelBody .info-tip');
  await tips[0].scrollIntoViewIfNeeded();
  await tips[0].click();
  await tips[1].scrollIntoViewIfNeeded();
  await tips[1].click();
  const expanded = await page.$$eval('.info-tip[aria-expanded="true"]', (n) => n.length);
  check(expanded === 1, 'only one bubble open at a time (got ' + expanded + ')');
  await page.keyboard.press('Escape');

  // 6. Field search still shows clean names (no stray "i" from the button).
  await page.fill('#fieldSearch', 'income');
  await page.waitForTimeout(250);
  if (mobile) {
    // Mobile filters the sidebar inline instead of showing a dropdown.
    const count = await page.$eval('#fieldSearchCount', (e) => e.textContent);
    check(/match/.test(count), 'mobile search reports matches: ' + count);
  } else {
    const names = await page.$$eval('.field-search-result .fsr-label', (n) => n.map((x) => x.textContent.trim()));
    check(names.length > 0 && names.every((n) => !/\bi$/.test(n)), 'search result labels are clean: ' + names.slice(0, 3).join(' | '));
  }
  await page.fill('#fieldSearch', '');

  // 6b. The label's last word lives inside the no-wrap span but must still count as part of its name.
  if (!mobile) {
    await page.fill('#fieldSearch', 'guardrails');
    await page.waitForTimeout(250);
    const gnames = await page.$$eval('.field-search-result .fsr-label', (n) => n.map((x) => x.textContent.trim()));
    check(gnames.some((n) => n === 'Guyton-Klinger guardrails'), 'search name keeps the last word: ' + gnames.join(' | '));
    await page.fill('#fieldSearch', '');
  }
  // 6c. No ⓘ orphaned onto its own line: each button shares a line with its last word.
  const orphans = await page.evaluate(() =>
    [...document.querySelectorAll('#panelBody .info-nw')]
      .filter((nw) => nw.getClientRects().length)
      .filter((nw) => {
        const btn = nw.querySelector('.info-tip').getBoundingClientRect();
        const tn = [...nw.childNodes].find((c) => c.nodeType === 3);
        const range = document.createRange();
        range.selectNodeContents(tn);
        const rects = [...range.getClientRects()];
        const last = rects[rects.length - 1];
        return !last || Math.abs(btn.top + btn.height / 2 - (last.top + last.height / 2)) > 8;
      }).length,
  );
  check(orphans === 0, 'no orphaned ⓘ buttons (found ' + orphans + ')');

  // 6d. Feedback Tier A copy: the spending, return and inflation bubbles, the guardrails bubble, and the methodology card's
  // "Before you rely on this" block and "Assumptions" section, right after the limitations callout.
  const copy = await page.evaluate(() => {
    const tip = (id) => document.querySelector(`label[for="${id}"] .info-tip`).dataset.tip;
    const lim = document.getElementById('limitationsCallout');
    const h3 = [...document.querySelectorAll('.method-body h3')].find((h) => h.textContent === 'Assumptions: what stays fixed');
    return {
      spending: tip('spending'), returnRate: tip('returnRate'), bondReturn: tip('bondReturn'), inflation: tip('inflation'),
      guardrails: tip('guardrailsEnabled'),
      methodBlocks: document.querySelectorAll('.method-body .before-you-rely').length,
      afterLimitations: lim.nextElementSibling?.classList.contains('before-you-rely') && lim.nextElementSibling.nextElementSibling === h3,
      assumptions: h3 ? h3.nextElementSibling.textContent : '',
      notModeled: [...document.querySelectorAll('.method-body h3')].find((h) => h.textContent === 'Not modeled').nextElementSibling.textContent,
      guardrailBullet: [...document.querySelectorAll('.method-body li')].some((li) => li.textContent.startsWith('Optional guardrails') && li.textContent.includes('see “Assumptions: what stays fixed”')),
    };
  });
  check(/12 months/.test(copy.spending) && /balance you carry goes in “\+ Add a loan” as a credit card/.test(copy.spending), 'spending bubble asks for 12 months of actual spending, a carried card balance as a loan (B3)');
  for (const k of ['returnRate', 'bondReturn', 'inflation'])
    check(/Market scenario/.test(copy[k]) && /Monte Carlo/.test(copy[k]), k + ' bubble points to the Market scenario card and Monte Carlo');
  check(/starting rate/.test(copy.guardrails) && !/rate at retirement/.test(copy.guardrails), 'guardrails bubble names the starting rate');
  check(copy.methodBlocks === 1 && copy.afterLimitations, 'methodology card: the before-you-rely block and Assumptions follow the limitations callout');
  check(['Guyton-Klinger', '20%', '10%', 'between half and 1.5 times', 'HYSA rate', 'No rebalancing'].every((w) => copy.assumptions.includes(w)), 'Assumptions list states the fixed rules');
  check(copy.notModeled.includes('New charges on a credit card or credit line') && !copy.notModeled.includes('revolving balances') && copy.guardrailBullet, 'method card: new card charges under Not modeled (B3), the guardrail bullet points to Assumptions');
  // Feedback B1 (US): the start-age switch's bubble says no credits accrue after 70, and the start-age bubbles name the switch.
  if (file === 'Planner_US.html') {
    const ss = await page.evaluate(() => ({
      late: document.querySelector('label[for="ssLateStartEnabled"] .info-tip').dataset.tip,
      start: document.querySelector('label[for="ssStartAgeA"] .info-tip').dataset.tip,
      cut: document.querySelector('label[for="ssBenefitCutPct"] .info-tip').dataset.tip,
    }));
    check(/no delayed-retirement credits accrue after 70/.test(ss.late) && /benefit cut \(the benefit cut field below\), not a later start/.test(ss.late), 'start-age switch bubble: no credits after 70; a higher full retirement age is a cut');
    check(/past 70 only with the 'If the law changes' switch/.test(ss.start), 'start-age bubble names the switch');
    // Feedback B2: the benefit cut's bubble is a what-if, and models a higher full retirement age as a cut.
    check(/not a forecast/.test(ss.cut) && /higher full retirement age is also a cut/.test(ss.cut) && /'If the law changes' switch/.test(ss.cut), 'benefit cut bubble: a what-if; a higher full retirement age is a cut; the earliest age is the switch');
  }
  // The disclaimer link still opens the methodology card and flashes the limitations callout.
  await page.click('#disclaimerLinkBtn');
  const flashed = await page.waitForFunction(() => document.getElementById('methodologyCard').open && document.getElementById('limitationsCallout').classList.contains('flash-highlight'), null, { timeout: 5000 }).then(() => true, () => false);
  check(flashed, 'disclaimer link opens the methodology card and flashes the limitations callout');

  // 7. No horizontal overflow, no page errors.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!overflow, 'no horizontal overflow');
  check(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const f of FILES) {
    await run(browser, f, { width: 1280, height: 900 }, 'desktop 1280x900');
    await run(browser, f, { width: 390, height: 844 }, 'mobile 390x844');
  }
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll info-bubble checks passed.');
  process.exit(failures ? 1 : 0);
})();
