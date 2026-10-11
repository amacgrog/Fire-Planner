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
  if (mobile) await page.evaluate(() => document.getElementById('workspace').setAttribute('data-mobile-view', 'inputs'));
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
