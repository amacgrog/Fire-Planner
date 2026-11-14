// UI check (CI: `npm run test:ui`) of the plan verdict card, both planners: the word, the spending room being the edge of
// what lasts, the short case, the unfixable case (US), differing retirement ages, guardrails, future dollars, mobile width.
//   node test_plan_verdict.js
const { chromium } = require('playwright');
const assert = require('assert');
const { plannerPath } = require('./tests/helpers/planner-path');

// A monthly rent at which the default household runs out even with no household spending at all.
const RENT = 20000;
const WORDS = { comfortable: 'Comfortable', tight: 'Tight', short: 'Short' };

async function run(browser, file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + plannerPath(file));
  await page.waitForFunction(() => typeof window.__test_flushRender === 'function' && window.__test_planVerdict() !== null);
  const flush = () => page.evaluate(() => window.__test_flushRender());
  const setField = async (id, value) => {
    await page.evaluate(({ id, value }) => {
      const el = document.getElementById(id);
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = String(value);
      // The state is written on `input`; `change` then commits the field and runs the full render.
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id, value });
    await flush();
  };
  const verdict = () => page.evaluate(() => window.__test_planVerdict());
  const text = () => page.locator('#planVerdictText').textContent();
  const attr = () => page.locator('#planVerdict').getAttribute('data-verdict');

  // default verdict
  const v0 = await verdict();
  assert(['comfortable', 'tight', 'short'].includes(await attr()), file + ': data-verdict is set');
  assert.strictEqual(await page.locator('#planVerdictWord').textContent(), WORDS[v0.word], file + ': the word matches the verdict');
  assert.strictEqual(await attr(), v0.word, file + ': data-verdict matches the verdict');

  // room is the edge
  if (!v0.atCap && !v0.guardrails && v0.word !== 'short') {
    await setField('spending', v0.spending + v0.room);
    assert.strictEqual(await page.evaluate(() => window.fireProjection.depletedAge), null, file + ': base + room lasts');
    await setField('spending', v0.spending + v0.room + 1000);
    assert.notStrictEqual(await page.evaluate(() => window.fireProjection.depletedAge), null, file + ': base + room + 1000 runs out');
    await setField('spending', v0.spending);
  }

  // historical line (arrives after the 500 ms debounce), then the status bar
  const HIST_RE = /Held up in \d+% of historical markets since 1928/;
  const BAR_RE = /^(Comfortable|Tight) · \+\$[\d.]+K\+?\/yr room · \d+% historical$/;
  const histArrived = () => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('planVerdictHist').textContent), HIST_RE.source);
  const bar = () => page.locator('#planStatusText').textContent();
  await histArrived();
  await page.locator('[data-verdict-action="bad-years"]').click();
  assert.strictEqual(await page.locator('#chartGroupHistBtn').getAttribute('aria-checked'), 'true', file + ': see the bad ones opens the historical chart view');
  await page.evaluate(() => document.getElementById('chartGroupProjectionBtn').click());
  await flush();
  const vNow = await verdict();
  assert((await bar()).startsWith(WORDS[vNow.word]), file + ': the bar starts with the word: ' + (await bar()));
  if (!vNow.guardrails && vNow.shown > 0 && vNow.word !== 'short') {
    await histArrived();
    assert(BAR_RE.test(await bar()), file + ': default bar text: ' + (await bar()));
  }

  // scenario: the verdict ignores history
  const crashMs = await page.evaluate(() => ({ kind: 'crash', crashes: [{ age: window.__test_getState().ageA + 3, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] }));
  await page.evaluate((ms) => window.__test_runMarketScenario(ms), crashMs);
  await flush();
  assert(/Inside the scenario:/.test(await page.locator('#planVerdictHist').textContent()), file + ': scenario line: ' + (await page.locator('#planVerdictHist').textContent()));
  assert(!/% historical/.test(await bar()), file + ': no historical clause in the bar under a scenario: ' + (await bar()));
  await page.evaluate(() => window.__test_revertMarketScenario());
  await flush();
  await histArrived();
  assert(!/Inside the scenario/.test(await page.locator('#planVerdictHist').textContent()), file + ': scenario line gone after revert');
  assert(/% historical/.test(await bar()), file + ': bar has history again: ' + (await bar()));

  // short
  await setField('spending', 250000);
  assert.strictEqual(await attr(), 'short', file + ': 250000 a year is short');
  const shortText = await text();
  assert(/runs out at \d+/.test(shortText), file + ': says when it runs out: ' + shortText);
  assert(/less a year/.test(shortText), file + ': says how much less: ' + shortText);
  assert(!/household spending/.test(await page.locator('#shortfallBanner').textContent()), file + ': the banner no longer offers a spending cut');
  // a click on the cut figure must not pin a gauge that does not exist
  await page.locator('#planVerdictText b').first().click();
  await page.mouse.move(0, 0); // so a hover over the restored room figure cannot show the gauge
  assert(!/\$0 less/.test(shortText), file + ': never $0 less');
  assert(/^Short · runs out at \d+/.test(await bar()), file + ': short bar: ' + (await bar()));
  await setField('spending', v0.spending);
  if (!v0.atCap && !v0.guardrails && v0.shown > 0) assert.strictEqual(await page.locator('#planVerdictGauge').isHidden(), true, file + ': the gauge is not pinned open after a Short plan');

  // unfixable (US): rent so high that no spending cut helps
  if (file === 'Planner_US.html') {
    await page.evaluate(() => document.getElementById('rentBtn').click());
    await setField('spending', 0);
    await setField('rent', RENT);
    assert.strictEqual(await attr(), 'short', file + ': huge rent is short');
    assert(/Cutting household spending alone can't fix this/.test(await text()), file + ': unfixable wording: ' + (await text()));
    assert.strictEqual(await page.locator('#planVerdictGauge').count(), 0, file + ': no gauge when unfixable');
    await page.evaluate(() => document.getElementById('ownBtn').click());
    await setField('spending', v0.spending);
  }

  // gauge: the room figure pins a bar open; it never shows without a room to spend, with guardrails, or when unfixable
  if (!v0.atCap && !v0.guardrails && v0.shown > 0) {
    const fmt = (n) => page.evaluate((n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n || 0), n);
    const gauge = page.locator('#planVerdictGauge');
    await page.locator('.verdict-room').click();
    await gauge.waitFor({ state: 'visible' });
    const gaugeText = await gauge.textContent();
    assert(gaugeText.includes('you: ' + (await fmt(v0.spending))), file + ': gauge you label: ' + gaugeText);
    assert(gaugeText.includes('most it supports: ' + (await fmt(v0.spending + v0.shown))), file + ': gauge most label: ' + gaugeText);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, file + ': no horizontal scroll with the gauge open');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.verdict-room').click();
    await gauge.waitFor({ state: 'hidden' });
  }

  // spending tiers: no gauge (a tier replaces the base spending the marker shows), the sentence stays
  if (!v0.atCap && !v0.guardrails && v0.shown > 0) {
    await page.evaluate(() => document.querySelector('[data-dyn-add="spendingTiers"]').click());
    await flush();
    assert.strictEqual(await page.evaluate(() => window.__test_getState().spendingTiers.length), 1, file + ': a spending tier was added');
    assert.strictEqual(await page.locator('#planVerdictGauge').count(), 0, file + ': no gauge with a spending tier');
    assert(/more a year|less a year/.test(await text()), file + ': the sentence still shows the room with a tier: ' + (await text()));
    await page.evaluate(() => document.querySelector('[data-dyn-remove="0"]').click());
    await flush();
    assert.strictEqual(await page.evaluate(() => window.__test_getState().spendingTiers.length), 0, file + ': the tier was removed');
  }

  // different retirement ages (couple)
  const single = await page.evaluate(() => window.__test_getState().singlePerson);
  if (!single) {
    await setField('retireAgeA', 55);
    await setField('retireAgeB', 57);
    assert(/Retiring at A 55 \/ B 57/.test(await text()), file + ': differing ages: ' + (await text()));
    await setField('retireAgeB', 55);
    assert(/Retiring at 55,/.test(await text()), file + ': equal ages read once: ' + (await text()));
  }

  // guardrails
  await setField('guardrailsEnabled', true);
  const vg = await verdict();
  if (!vg.depletedAge) {
    assert(/Guardrails/.test(await text()), file + ': guardrails sentence: ' + (await text()));
    assert.strictEqual(vg.guardrails, true, file + ': guardrails flagged');
    assert.strictEqual(await page.locator('#planVerdictGauge').count(), 0, file + ': no gauge with guardrails');
    assert(/cuts up to \d+%|no guardrail cuts/.test(await bar()), file + ': guardrail bar text: ' + (await bar()));
  }
  await setField('guardrailsEnabled', false);

  // nominal mode
  await page.evaluate(() => document.getElementById('nominalBtn').click());
  await flush();
  assert(/today's dollars/.test(await text()), file + ': the room is in today\'s dollars even in future-dollar view');
  await page.evaluate(() => document.getElementById('realBtn').click());

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, file + ': no horizontal scroll at 390');

  assert.deepStrictEqual(errors, [], file + ': page errors ' + errors);
  await page.close();
  console.log('OK ' + file);
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const file of ['Planner_US.html', 'Planner_Canada.html']) await run(browser, file);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
