// UI check (CI: `npm run test:ui`) of the guidance card, both planners: the goal chips (pure filters, saved, locked under a
// market scenario), the ranked "Fill these in next" list and "Everything else", the background measuring job (never under the
// light render, stopped by a change), the review walk over the ranked list, single households, guardrails, a short plan, mobile.
//   node test_guidance.js
const { chromium } = require('playwright');
const assert = require('assert');
const { plannerPath } = require('./tests/helpers/planner-path');

async function open(browser, file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page._errors = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  await page.goto('file://' + plannerPath(file));
  await ready(page);
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => typeof window.__test_flushGuidance === 'function' && window.__test_planVerdict() !== null);
  await settle(page);
}
// Draws every pending pass, then runs the measuring job to its end.
const settle = (page) => page.evaluate(() => {
  window.__test_flushRender();
  window.__test_flushGuidance();
});
const guidance = (page) => page.evaluate(() => window.__test_guidance());
const tables = (page) => page.evaluate(() => window.__test_guidanceTables());
// Sets a sidebar field the way a person does: the state is written on `input`, `change` commits it.
const setField = async (page, id, value) => {
  await page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, value });
  await settle(page);
};
const clickChip = async (page, key) => {
  await page.evaluate((k) => document.querySelector(`[data-goal="${k}"]`).click(), key);
  await settle(page);
};
const pressed = (page, key) => page.locator(`[data-goal="${key}"]`).getAttribute('aria-pressed');

async function run(browser, file) {
  const us = file === 'Planner_US.html';
  const page = await open(browser, file);
  const T = await tables(page);
  const goalIds = (key) => {
    const g = T.goals.find((x) => x.key === key);
    return [...g.fields, ...g.critical];
  };

  // first run
  let g = await guidance(page);
  assert.deepStrictEqual(g.goals, [], file + ': no goals on a fresh page');
  assert(g.ranked.length > 0, file + ': first run ranks some fields');
  assert.strictEqual(g.pending, false, file + ': the job ran to its end');
  assert.strictEqual(typeof g.setupState, 'object', file + ': the setup was measured: ' + g.setupState);
  const measured = g.ranked.filter((r) => typeof r.impact === 'number').map((r) => r.impact);
  assert(measured.length > 0, file + ': some rows carry a figure');
  for (let i = 1; i < measured.length; i++) assert(measured[i - 1] >= measured[i], file + ': figures descend: ' + measured);
  const unbadged = await page.evaluate((ids) => ids.filter((id) => !document.querySelector(`label[for="${id}"] .estimate-badge`)), g.ranked.map((r) => r.id));
  assert.deepStrictEqual(unbadged, [], file + ': every ranked field carries its Estimated badge');
  const summary = page.locator('#guidanceOtherSummary');
  if (!(await summary.isHidden())) assert(/^Everything else \(\d+ fields?\)$/.test(await summary.textContent()), file + ': other summary: ' + (await summary.textContent()));
  // Basics still at their example value lead the list, unmeasured, in sidebar order; the measured rows follow.
  const basics = new Set(T.basicIds);
  const lead = g.ranked.findIndex((r) => !basics.has(r.id));
  assert(lead > 0, file + ': fresh page: the basics lead the list: ' + JSON.stringify(g.ranked.map((r) => r.id)));
  assert(g.ranked.slice(lead).every((r) => !basics.has(r.id)), file + ': no basic after the first other row');
  assert(
    g.ranked.slice(0, lead).every((r) => r.impact === null && r.reason === 'Still the example value: enter yours.'),
    file + ': a default basic has its reason and no figure: ' + JSON.stringify(g.ranked.slice(0, lead)),
  );
  const basicOrder = await page.evaluate((ids) => {
    const els = ids.map((id) => document.getElementById(id));
    return els.every((el, i) => i === 0 || els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, g.ranked.slice(0, lead).map((r) => r.id));
  assert(basicOrder, file + ': the leading basics keep sidebar order');
  const firstRow = await page.locator('#guidanceList li .guidance-why').first().textContent();
  assert(/ — Still the example value: enter yours\.$/.test(firstRow), file + ': first row copy: ' + firstRow);
  const firstMeasured = g.ranked.findIndex((r) => typeof r.impact === 'number');
  const measuredRow = await page.evaluate((id) => document.querySelector(`#guidanceList [data-field="${id}"]`).parentElement.querySelector('.guidance-why').textContent, g.ranked[firstMeasured].id);
  assert(/ — about ±\$[\d.]+K?\/yr on your spending room$/.test(measuredRow), file + ': measured row copy: ' + measuredRow);
  // Feedback A2: the spending row (still the example value here) carries its tip; no other row has one.
  const tips = await page.evaluate(() => [...document.querySelectorAll('#guidanceList .guidance-tip')].map((t) => [t.parentElement.querySelector('[data-field]').dataset.field, t.textContent]));
  assert.deepStrictEqual(tips, [['spending', 'Use 12 months of actual spending, irregular costs included; a card balance you carry goes in Other loans.']], file + ': the spending tip: ' + JSON.stringify(tips));
  assert.strictEqual(
    await page.locator('#guidanceCount').textContent(),
    `(${g.ranked.length} of ${g.ranked.length + g.other.length} estimated)`,
    file + ': the count',
  );

  // start ages never get a figure
  const startAge = us ? 'ssStartAgeA' : 'cppStartAgeA';
  assert(!g.ranked.some((r) => r.id === startAge), file + ': ' + startAge + ' is not ranked');
  assert(g.other.includes(startAge), file + ': ' + startAge + ' is under Everything else');

  // chips only filter
  const before = await page.evaluate(() => {
    const { guidanceGoals, ...rest } = window.__test_getState();
    return { rows: JSON.stringify(window.fireProjectionRows), state: JSON.stringify(rest) };
  });
  await page.locator('[data-goal="convert"]').click();
  await settle(page);
  g = await guidance(page);
  assert.deepStrictEqual(g.goals, ['convert'], file + ': the convert goal is chosen');
  const after = await page.evaluate(() => {
    const { guidanceGoals, ...rest } = window.__test_getState();
    return { rows: JSON.stringify(window.fireProjectionRows), state: JSON.stringify(rest) };
  });
  assert.strictEqual(after.rows, before.rows, file + ': a chip changes no projection row');
  assert.strictEqual(after.state, before.state, file + ': a chip changes no other input (the conversion feature included)');
  assert.strictEqual(await pressed(page, 'convert'), 'true', file + ': the chip reads pressed');
  const allowed = new Set([...T.basicIds, ...goalIds('convert')]);
  assert.deepStrictEqual(g.ranked.map((r) => r.id).filter((id) => !allowed.has(id)), [], file + ': only the basics and the goal\'s fields are ranked');
  const choiceId = us ? 'stateTax' : 'province';
  const choiceRow = await page.locator(`#guidanceList [data-field="${choiceId}"]`).locator('..').textContent();
  assert(choiceRow.includes(us ? 'state tax' : 'provincial tax'), file + ': the critical choice row gives its reason: ' + choiceRow);
  assert(g.ranked.find((r) => r.id === choiceId).reason, file + ': the choice row has a reason');

  // goals are saved
  await page.reload();
  await ready(page);
  assert.strictEqual(await pressed(page, 'convert'), 'true', file + ': the chosen goal survives a reload');

  // review walks the list
  g = await guidance(page);
  await page.locator('#reviewEstimatesBtn').click();
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), g.ranked[0].id, file + ': review starts at the first ranked field');
  assert.strictEqual(await page.locator('#reviewNavCount').textContent(), `${g.ranked.length} fields left`, file + ': the pill counts the ranked list');
  const first = g.ranked[0].id;
  await page.locator('#reviewNavNext').click();
  await settle(page);
  g = await guidance(page);
  assert(await page.evaluate((id) => window.__test_getState().dismissedEstimates.includes(id), first), file + ': Next dismisses the field it leaves');
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), g.ranked[0].id, file + ': Next moves to the new first ranked field');
  await page.locator('#reviewNavClose').click();

  // a filled field leaves the list
  const moneyId = await page.evaluate((ids) => ids.find((id) => document.getElementById(id).classList.contains('money')), g.ranked.map((r) => r.id));
  assert(moneyId, file + ': a money row is ranked');
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    el.value = String(window.__test_getState()[id] + 1234);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, moneyId);
  await settle(page);
  g = await guidance(page);
  assert(!g.ranked.some((r) => r.id === moneyId) && !g.other.includes(moneyId), file + ': a filled field leaves the card: ' + moneyId);
  // Back to no goals (every estimated field in scope): under the convert goal alone, every non-basic Canada field moves the room by
  // under $500, and the basics are never measured, so the checks below would see no figure.
  await clickChip(page, 'convert');

  // the light render does not measure
  const light = await page.evaluate(() => {
    const el = document.getElementById('spending');
    el.value = String(window.__test_getState().spending + 1000);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.__test_flushLightRender();
    const a = { pending: window.__test_guidance().pending, measuring: document.getElementById('guidanceList').classList.contains('measuring') };
    window.__test_flushRender();
    return { ...a, pendingAfter: window.__test_guidance().pending };
  });
  assert.deepStrictEqual(light, { pending: false, measuring: true, pendingAfter: true }, file + ': the light render only dims; the deferred pass starts the job');
  await settle(page);

  // the job stops on a change
  const stop = await page.evaluate(() => {
    const sp = document.getElementById('spending');
    sp.value = String(window.__test_getState().spending + 1000);
    sp.dispatchEvent(new Event('input', { bubbles: true }));
    sp.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
    const started = window.__test_guidance();
    const tx = document.getElementById('taxable');
    tx.value = String(window.__test_getState().taxable + 5000);
    tx.dispatchEvent(new Event('input', { bubbles: true }));
    window.__test_flushGuidance();
    const stopped = window.__test_guidance();
    return {
      startedPending: started.pending,
      startedSetup: started.setupState,
      pending: stopped.pending,
      setupState: stopped.setupState,
      measuring: document.getElementById('guidanceList').classList.contains('measuring'),
    };
  });
  assert.deepStrictEqual(stop, { startedPending: true, startedSetup: 'none', pending: false, setupState: 'none', measuring: true }, file + ': a change stops the job before it commits');
  await settle(page);
  g = await guidance(page);
  assert.strictEqual(typeof g.setupState, 'object', file + ': the next job measures the setup');
  assert(g.ranked.some((r) => typeof r.impact === 'number'), file + ': the next job gives figures');
  assert.strictEqual(await page.evaluate(() => document.getElementById('guidanceList').classList.contains('measuring')), false, file + ': .measuring clears');

  // a light render while a job is pending keeps the last committed figures, dimmed
  const keepShown = await page.evaluate(() => {
    const ids = () => window.__test_guidance().ranked.filter((r) => typeof r.impact === 'number').map((r) => r.id);
    const before = ids();
    const sp = document.getElementById('spending');
    sp.value = String(window.__test_getState().spending + 1000);
    sp.dispatchEvent(new Event('input', { bubbles: true }));
    sp.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
    const pending = window.__test_guidance().pending;
    const tx = document.getElementById('taxable');
    tx.value = String(window.__test_getState().taxable + 5000);
    tx.dispatchEvent(new Event('input', { bubbles: true }));
    window.__test_flushLightRender();
    const g = window.__test_guidance();
    return {
      before: before.length > 0,
      pending,
      figures: g.ranked.filter((r) => typeof r.impact === 'number').length > 0,
      same: JSON.stringify(ids()) === JSON.stringify(before),
      measuring: document.getElementById('guidanceList').classList.contains('measuring'),
    };
  });
  assert.deepStrictEqual(keepShown, { before: true, pending: true, figures: true, same: true, measuring: true }, file + ': a light render mid-job keeps the figures and their order');
  await settle(page);

  // a row's focus survives a repaint
  const refocus = await page.evaluate(() => {
    const btn = document.querySelector('#guidanceList .guidance-field');
    btn.focus();
    const id = btn.dataset.field;
    const sp = document.getElementById('spending');
    sp.value = String(window.__test_getState().spending + 1000);
    sp.dispatchEvent(new Event('input', { bubbles: true }));
    sp.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
    window.__test_flushGuidance();
    const a = document.activeElement;
    return { replaced: !btn.isConnected, same: a.classList.contains('guidance-field') && a.dataset.field === id };
  });
  assert.deepStrictEqual(refocus, { replaced: true, same: true }, file + ': the focused row keeps the focus after a repaint');
  await settle(page);

  // a list-row name is not in the key: a rename measures nothing again
  await page.evaluate(() => document.querySelector('[data-dyn-add="extraExpenses"]').click());
  await page.evaluate(() => (document.getElementById('sankeyCard').open = true));
  await settle(page);
  const beforeName = await guidance(page);
  const rename = await page.evaluate(() => {
    const box = document.querySelector('#extraExpenseFields .dyn-row [data-dyn-k="name"]');
    box.value = 'Roof';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
    const g = window.__test_guidance();
    return {
      named: window.__test_getState().extraExpenses[0].name,
      pending: g.pending,
      measuring: document.getElementById('guidanceList').classList.contains('measuring'),
    };
  });
  assert.deepStrictEqual(rename, { named: 'Roof', pending: false, measuring: false }, file + ': a rename neither dims nor re-measures');
  assert.deepStrictEqual((await guidance(page)).ranked, beforeName.ranked, file + ': a rename keeps every figure');
  await page.evaluate(() => {
    document.getElementById('sankeyCard').open = false;
    document.querySelector('#extraExpenseFields [data-dyn-remove="0"]').click();
  });
  await settle(page);

  // the heading's separator hides with the Review button
  const wrap = await page.evaluate(() => {
    const w = document.getElementById('guidanceReviewWrap');
    return { inWrap: w.contains(document.getElementById('reviewEstimatesBtn')), text: w.textContent.startsWith(' · '), hidden: w.hidden };
  });
  assert.deepStrictEqual(wrap, { inWrap: true, text: true, hidden: false }, file + ': the separator and the Review button share one wrap');

  // the walk survives a chip
  await clickChip(page, 'retire');
  g = await guidance(page);
  const keep = new Set([...T.basicIds, ...goalIds('house')]);
  // A retire field, so unticking the retire chip (the only one pressed; convert was unticked above) keeps it ranked: the
  // no-goal scope holds every field, and goals are not in the memo key, so its figure stays.
  const retire = new Set(goalIds('retire'));
  const target = g.ranked.find((r) => typeof r.impact === 'number' && retire.has(r.id) && !keep.has(r.id));
  assert(target, file + ': a measured retire field outside the basics and the house goal is ranked');
  await page.evaluate((id) => document.querySelector(`#guidanceList [data-field="${id}"]`).click(), target.id);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), target.id, file + ': a row starts the walk at its field');
  const view = await page.evaluate(() => document.getElementById('workspace').dataset.mobileView);
  await page.evaluate(() => [...document.querySelectorAll('.guidance-chip[aria-pressed="true"]')].reverse().forEach((b) => b.click()));
  await settle(page);
  g = await guidance(page);
  assert.deepStrictEqual(g.goals, [], file + ': every chip unticked');
  assert(g.ranked.some((r) => r.id === target.id), file + ': the reviewed field is still ranked');
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), target.id, file + ': a chip does not move the focus');
  assert.strictEqual(await page.locator('#reviewNav').isHidden(), false, file + ': the review goes on');
  await clickChip(page, 'house');
  assert.strictEqual(await page.locator('#reviewNav').isHidden(), true, file + ': a chip that drops the reviewed field ends the review');
  assert.strictEqual(await page.evaluate(() => document.getElementById('workspace').dataset.mobileView), view, file + ': the mobile view is unchanged');
  await clickChip(page, 'house');

  // guardrails: measured on the fixed-spending room
  await setField(page, 'guardrailsEnabled', true);
  g = await guidance(page);
  assert.strictEqual(typeof g.setupState, 'object', file + ': guardrails: the setup is measured');
  assert(g.ranked.some((r) => typeof r.impact === 'number'), file + ': guardrails: some rows carry a figure');
  await setField(page, 'guardrailsEnabled', false);

  // a market scenario locks the chips
  const crash = await page.evaluate(() => ({ kind: 'crash', crashes: [{ age: window.__test_getState().ageA + 3, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] }));
  await page.evaluate((ms) => window.__test_runMarketScenario(ms), crash);
  await settle(page);
  const locked = await page.evaluate(() => [...document.querySelectorAll('.guidance-chip')].map((b) => [b.disabled, b.title]));
  assert(locked.length > 0 && locked.every(([d, t]) => d && t === 'Revert the market scenario to change your goals.'), file + ': chips are locked under a scenario: ' + JSON.stringify(locked));
  await page.evaluate(() => window.__test_revertMarketScenario());
  await settle(page);
  assert(await page.evaluate(() => [...document.querySelectorAll('.guidance-chip')].every((b) => !b.disabled)), file + ': chips unlock after revert');

  // a short plan
  const spending = await page.evaluate(() => window.__test_getState().spending);
  await setField(page, 'spending', 250000);
  g = await guidance(page);
  assert(g.ranked.length > 0, file + ': a short plan ranks fields');
  assert(g.ranked.every((r) => typeof r.impact === 'number' || typeof r.reason === 'string'), file + ': short plan rows: ' + JSON.stringify(g.ranked));
  await setField(page, 'spending', spending);

  // single
  await setField(page, 'singlePerson', true);
  assert.strictEqual(await page.locator('[data-goal="survivor"]').isHidden(), true, file + ': no survivor goal while single');
  g = await guidance(page);
  const partnerB = new Set(T.partnerBIds);
  assert.deepStrictEqual([...g.ranked.map((r) => r.id), ...g.other].filter((id) => partnerB.has(id)), [], file + ': no partner-B field while single');
  const hiddenNamed = await page.evaluate((ids) => ids.filter((id) => document.getElementById(id).closest('[hidden]')), [...g.ranked.map((r) => r.id), ...g.other]);
  assert.deepStrictEqual(hiddenNamed, [], file + ': no hidden field is named');
  assert.strictEqual(await page.locator('#guidanceCount').textContent(), `(${g.ranked.length} of ${g.ranked.length + g.other.length} estimated)`, file + ': single count');
  await setField(page, 'singlePerson', false);

  assert.deepStrictEqual(page._errors, [], file + ': page errors ' + page._errors);
  await page.close();

  // first-run save: a chip on a fresh page is saved
  const fresh = await open(browser, file);
  await fresh.locator('[data-goal="house"]').click();
  await settle(fresh);
  await fresh.reload();
  await ready(fresh);
  assert.strictEqual(await pressed(fresh, 'house'), 'true', file + ': a first-run chip survives a reload');
  await clickChip(fresh, 'house');

  // mobile
  await fresh.setViewportSize({ width: 390, height: 844 });
  await fresh.locator('#mobileTabDashboard').click();
  const more = fresh.locator('#guidanceMoreBtn');
  assert(/^Show \d+ more$/.test(await more.textContent()), file + ': the more button: ' + (await more.textContent()));
  await more.click();
  assert.strictEqual(await more.textContent(), 'Show fewer', file + ': the list expands');
  assert.strictEqual(await fresh.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, file + ': no horizontal scroll at 390');
  assert.deepStrictEqual(fresh._errors, [], file + ': page errors ' + fresh._errors);
  await fresh.close();
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
