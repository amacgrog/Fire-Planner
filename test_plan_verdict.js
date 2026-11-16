// UI check (CI: `npm run test:ui`) of the plan verdict card, both planners: the word, the spending room being the edge of
// what lasts, the short case, the unfixable case (US), differing retirement ages, guardrails, future dollars, the Tight that history
// alone sets (feedback B4), mobile width.
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
  assert(/runs out at (A's |B's )?age \d+/.test(shortText), file + ': says when it runs out: ' + shortText);
  // A couple's ages are on one partner's scale, named: the default household ends on B's life expectancy (B is younger).
  const s0 = await page.evaluate(() => window.__test_getState());
  if (!s0.singlePerson && s0.lifeExpectancyB - s0.ageB > s0.lifeExpectancyA - s0.ageA) assert(/runs out at B's age \d+\. .*to make it to B's age \d+\.$/.test(shortText), file + ': ages on the scale of B: ' + shortText);
  assert(/less a year/.test(shortText), file + ': says how much less: ' + shortText);
  assert.strictEqual(await page.locator('#shortfallBanner').count(), 0, file + ': no shortfall banner (the moves card replaces it)');
  // a click on the cut figure must not pin a gauge that does not exist
  await page.locator('#planVerdictText b').first().click();
  await page.mouse.move(0, 0); // so a hover over the restored room figure cannot show the gauge
  assert(!/\$0 less/.test(shortText), file + ': never $0 less');
  assert(/^Short · runs out at (A's |B's )?age \d+/.test(await bar()), file + ': short bar: ' + (await bar()));
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

  // history sets the word (feedback B4): the backtest ignores the fixed return, so more spending drops it under 80% while a
  // higher return keeps the average-market room over 10%. Then a lower return makes the room small too: Tight on both.
  const returnRate0 = await page.evaluate(() => window.__test_getState().returnRate);
  const settle = () => page.evaluate(() => { window.__test_flushRender(); window.__test_flushVerdictHist(); });
  const HIST_SET_RE = /in an average market\. .*But it runs out in (\d+ of the|every one of the) \d+ historical starting years with a full record\.$/;
  await setField('returnRate', 10);
  await setField('spending', 66000);
  await settle();
  const vh = await verdict();
  assert(vh.shown / vh.shareBase >= 0.10 && !vh.depletedAge && !vh.guardrails, file + ': the history case has 10% room: ' + JSON.stringify(vh));
  assert.strictEqual(vh.byHistory, true, file + ': history alone sets the word');
  assert.strictEqual(await attr(), 'tight', file + ': history alone makes it Tight');
  assert(HIST_SET_RE.test(await text()), file + ': the sentence says history set the word: ' + await text());
  assert(/^Tight \(history\) · \+\$[\d.]+K\+?\/yr room · \d+% historical$/.test(await bar()), file + ': history bar text: ' + (await bar()));
  const histPct = Number((await page.locator('#planVerdictHist').textContent()).match(/Held up in (\d+)%/)[1]);
  assert(histPct < 80, file + ': the line shows the rate under the line: ' + histPct);
  // While a newer backtest is pending, the history sentence dims with the line; it is undimmed when the backtest lands.
  await setField('spending', 66000);
  assert.strictEqual(await page.locator('#planVerdictText .verdict-hist-reason.stale').count(), 1, file + ': the history sentence dims while the backtest is pending');
  await settle();
  assert.strictEqual(await page.locator('#planVerdictText .verdict-hist-reason.stale').count(), 0, file + ': the history sentence is undimmed after it lands');
  assert.strictEqual(await page.locator('#planVerdictText .verdict-hist-reason').count(), 1, file + ': the history sentence is still there');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, file + ': no horizontal scroll at 390 with the history sentence');
  await page.setViewportSize({ width: 1280, height: 900 });
  await setField('returnRate', 7);
  await settle();
  const vb = await verdict();
  assert(vb.shown > 0 && vb.shown / vb.shareBase < 0.10, file + ': the both case has some room under 10%: ' + JSON.stringify(vb));
  assert(Number((await page.locator('#planVerdictHist').textContent()).match(/Held up in (\d+)%/)[1]) < 80, file + ': the both case is under 80% historical');
  assert.strictEqual(await attr(), 'tight', file + ': small room with weak history is Tight');
  assert.strictEqual(vb.byHistory, false, file + ': history does not alone set the word when the room is small too');
  assert(!/in an average market|But it runs out/.test(await text()), file + ': no history sentence when the room is small: ' + (await text()));
  assert(/^Tight · /.test(await bar()), file + ': no (history) in the bar when the room is small: ' + (await bar()));
  await setField('returnRate', returnRate0);
  await setField('spending', v0.spending);

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
