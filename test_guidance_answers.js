// UI check (CI: `npm run test:ui`) of the moves card and the goal answers under the verdict, both planners: no moves on a
// Comfortable plan, ranked moves with Try on a Short or Tight one (Try shows what the move measured), one answer per chosen goal
// (measured once per inputs, kept across chip clicks), their copy and links, the background job (never under the light render,
// stopped by a change, run on its own timers, held under __testHoldGuidance), the base reused from the verdict card only when it
// is the same computation, Try then Revert showing the kept measures at once, an unfixable plan (US), a single person, a market
// scenario, mobile. Runs with the hold off (tests/ui_scripts.js HOLD_OFF): its checks are about the jobs themselves.
//   node test_guidance_answers.js
const { chromium } = require('playwright');
const assert = require('assert');
const { plannerPath } = require('./tests/helpers/planner-path');

const SHORT = { 'Planner_US.html': 78000, 'Planner_Canada.html': 76000 };
const TIGHT = 64000;
const WORKING = 'Working it out…';
const RESULT = /^ — (fixes it: lasts through \d+|\+\$[\d.]+K? a year of room|makes it Comfortable in the projection|lasts through \d+, with spending cut by up to \d+% in bad years)$/;
const SCENARIO_TITLE = 'Revert the market scenario to try a change.';

async function open(browser, file, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page._errors = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  await page.goto('file://' + plannerPath(file));
  await page.waitForFunction(() => typeof window.__test_guidanceAnswers === 'function' && window.__test_planVerdict() !== null);
  await settle(page);
  return page;
}
// Draws every pending pass, then runs the measuring jobs to their end.
const settle = (page) => page.evaluate(() => {
  window.__test_flushRender();
  window.__test_flushGuidance();
});
const answers = (page) => page.evaluate(() => window.__test_guidanceAnswers());
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
// Ticks every visible chip that is not pressed.
const tickAll = async (page) => {
  await page.evaluate(() => document.querySelectorAll('.guidance-chip[aria-pressed="false"]:not([hidden])').forEach((b) => b.click()));
  await settle(page);
};
const untickAll = async (page) => {
  await page.evaluate(() => document.querySelectorAll('.guidance-chip[aria-pressed="true"]').forEach((b) => b.click()));
  await settle(page);
};
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#movesList li')].map((li) => ({
  what: li.querySelector('.move-what')?.textContent ?? null,
  result: li.querySelector('.move-result')?.textContent ?? null,
  disabled: li.querySelector('.move-try')?.disabled ?? null,
  title: li.querySelector('.move-try')?.title ?? null,
})));
const shownAnswers = (page) => page.evaluate(() => [...document.querySelectorAll('[data-goal-answer]')].map((d) => ({
  key: d.dataset.goalAnswer,
  q: d.querySelector('.goal-answer-q').textContent,
  text: d.querySelector('.goal-answer-text').textContent,
  link: d.querySelector('.goal-answer-link').dataset.answerLink,
})));
const labelOf = (what) => what.charAt(0).toLowerCase() + what.slice(1);
const pick = (v) => ({ word: v.word, room: v.room, cutPct: v.cutPct, guardrails: v.guardrails });
// The base unit reused from the verdict card is what the job computes on its own for the same state.
async function seededBase(page, file, label) {
  const got = await page.evaluate(() => ({ a: window.__test_guidanceAnswers(), own: window.__test_jobBaseVerdict() }));
  assert.strictEqual(got.a.baseFrom, 'verdict', file + ': ' + label + ': the base is the verdict card\'s');
  assert.deepStrictEqual(got.a.base, got.own, file + ': ' + label + ': the reused base equals the job\'s own');
}

// Try a move, compare the verdict with what the move measured, then revert.
async function tryMatches(page, file, m) {
  const got = await page.evaluate((move) => {
    const ok = window.__test_tryMove(move);
    window.__test_flushRender();
    window.__test_flushGuidance();
    const pv = window.__test_projectionVerdict();
    return { ok, pv: { word: pv.word, room: pv.room, cutPct: pv.cutPct, guardrails: pv.guardrails }, room: window.__test_planVerdict().room };
  }, { label: labelOf(m.what), patch: m.patch });
  assert.strictEqual(got.ok, true, file + ': Try starts a preview for ' + m.key);
  assert.deepStrictEqual(got.pv, pick(m.verdict), file + ': after Try the projection verdict is the move\'s: ' + m.key);
  assert.strictEqual(got.room, m.verdict.room, file + ': after Try the card\'s room is the move\'s: ' + m.key);
  await page.evaluate(() => window.__test_revertMove());
  await settle(page);
}

async function run(browser, file) {
  const us = file === 'Planner_US.html';
  const page = await open(browser, file);
  const s0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState())));
  const endAge = Math.max(s0.lifeExpectancyA, s0.singlePerson ? 0 : s0.lifeExpectancyB);
  const GOALS = (await page.evaluate(() => window.__test_guidanceTables())).goals.map((g) => g.key);

  // comfortable has no moves
  let a = await answers(page);
  assert.strictEqual(a.pending, false, file + ': the job ran to its end');
  assert.strictEqual(a.base.word, 'comfortable', file + ': the default plan is Comfortable in the projection');
  assert.deepStrictEqual(a.moves, [], file + ': no moves on a Comfortable plan');
  assert.strictEqual(await page.locator('#movesCard').isHidden(), true, file + ': the moves card is hidden');
  assert.strictEqual(await page.locator('#goalAnswers').isHidden(), true, file + ': no goal, no answers');
  assert.strictEqual(await page.locator('#shortfallBanner').count(), 0, file + ': the old banner is gone');
  await seededBase(page, file, 'comfortable');

  // stale verdict: inputs changed after the card ran (a chip starts the job before any render) are measured by the job
  const stale = await page.evaluate(() => {
    const el = document.getElementById('spending');
    el.value = String(window.__test_getState().spending + 2000);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-goal="spend"]').click();
    window.__test_flushGuidance();
    const r = { a: window.__test_guidanceAnswers(), own: window.__test_jobBaseVerdict() };
    window.__test_flushRender();
    return r;
  });
  assert.strictEqual(stale.a.baseFrom, 'job', file + ': a stale verdict is not reused');
  assert.deepStrictEqual(stale.a.base, stale.own, file + ': stale: the job measured the new inputs');
  await settle(page);
  await page.evaluate(() => document.querySelector('[data-goal="spend"]').click());
  await setField(page, 'spending', s0.spending);

  // the jobs run on their own timers; under the test hold they wait for the flush
  await page.evaluate(() => {
    const el = document.getElementById('spending');
    el.value = String(window.__test_getState().spending + 3000);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
  });
  await page.waitForFunction(() => !window.__test_guidanceAnswers().pending && !window.__test_guidance().pending, null, { timeout: 15000 });
  const held = await page.evaluate(() => {
    globalThis.__testHoldGuidance = true;
    const el = document.getElementById('spending');
    el.value = String(window.__test_getState().spending + 1000);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
    return { pending: window.__test_guidanceAnswers().pending, fieldsPending: window.__test_guidance().pending, steps: window.__test_guidanceAnswers().steps };
  });
  // A wait no locator can replace: the check is that nothing runs while held.
  await page.waitForTimeout(300);
  const heldLater = await page.evaluate(() => {
    const r = { pending: window.__test_guidanceAnswers().pending, fieldsPending: window.__test_guidance().pending, steps: window.__test_guidanceAnswers().steps };
    window.__test_flushGuidance();
    return { ...r, flushed: !window.__test_guidanceAnswers().pending && !window.__test_guidance().pending };
  });
  assert.deepStrictEqual({ pending: held.pending, fieldsPending: held.fieldsPending }, { pending: true, fieldsPending: true }, file + ': held: both jobs wait');
  assert.deepStrictEqual(heldLater, { pending: true, fieldsPending: true, steps: held.steps, flushed: true }, file + ': held: no step runs until the flush, which ends both');
  await page.evaluate(() => delete globalThis.__testHoldGuidance);
  await setField(page, 'spending', s0.spending);

  // light render does not measure
  const light = await page.evaluate(() => {
    const el = document.getElementById('spending');
    el.value = String(window.__test_getState().spending + 1000);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.__test_flushLightRender();
    const r = { pending: window.__test_guidanceAnswers().pending, measuring: document.getElementById('goalAnswers').classList.contains('measuring') };
    window.__test_flushRender();
    return { ...r, pendingAfter: window.__test_guidanceAnswers().pending };
  });
  assert.deepStrictEqual(light, { pending: false, measuring: true, pendingAfter: true }, file + ': the light render only dims; the deferred pass starts the job');
  await settle(page);

  // job stops on change
  const stop = await page.evaluate(() => {
    const sp = document.getElementById('spending');
    sp.value = String(window.__test_getState().spending + 1000);
    sp.dispatchEvent(new Event('input', { bubbles: true }));
    sp.dispatchEvent(new Event('change', { bubbles: true }));
    window.__test_flushRender();
    const started = window.__test_guidanceAnswers().pending;
    const tx = document.getElementById('taxable');
    tx.value = String(window.__test_getState().taxable + 5000);
    tx.dispatchEvent(new Event('input', { bubbles: true }));
    window.__test_flushGuidance();
    return {
      started,
      pending: window.__test_guidanceAnswers().pending,
      measuring: document.getElementById('goalAnswers').classList.contains('measuring'),
      movesMeasuring: document.getElementById('movesCard').classList.contains('measuring'),
    };
  });
  assert.deepStrictEqual(stop, { started: true, pending: false, measuring: true, movesMeasuring: true }, file + ': a change stops the job before it commits');
  await settle(page);
  assert.strictEqual(await page.evaluate(() => document.getElementById('goalAnswers').classList.contains('measuring')), false, file + ': .measuring clears');
  await setField(page, 'taxable', s0.taxable);
  await setField(page, 'spending', s0.spending);

  // answers follow the chips
  await tickAll(page);
  a = await answers(page);
  const chosen = GOALS.filter((k) => a.answers[k] !== undefined);
  let dom = await shownAnswers(page);
  assert.deepStrictEqual(dom.map((d) => d.key), GOALS, file + ': one answer per goal, in GOALS order');
  assert.deepStrictEqual(chosen, GOALS, file + ': every goal measured');
  assert(dom.every((d) => d.text !== WORKING && d.text.length > 0), file + ': nothing left to work out: ' + JSON.stringify(dom));
  const houseText = a.answers.house;
  const untick = await page.evaluate(() => {
    document.querySelector('[data-goal="house"]').click();
    return { pending: window.__test_guidanceAnswers().pending, house: document.querySelectorAll('[data-goal-answer="house"]').length };
  });
  assert.deepStrictEqual(untick, { pending: false, house: 0 }, file + ': unticking house drops its answer and starts no job');
  const retick = await page.evaluate(() => {
    document.querySelector('[data-goal="house"]').click();
    const el = document.querySelector('[data-goal-answer="house"] .goal-answer-text');
    return { pending: window.__test_guidanceAnswers().pending, text: el ? el.textContent : null };
  });
  assert.deepStrictEqual(retick, { pending: false, text: houseText }, file + ': re-ticking house shows the kept answer with no new runs');

  // answers' copy (default plan, every chip on)
  const text = (k) => dom.find((d) => d.key === k).text;
  dom = await shownAnswers(page);
  assert(/^About \$[\d.]+K a year, \$[\d.]+K more than today\.$/.test(text('spend')), file + ': spend copy: ' + text('spend'));
  assert(text('retire').startsWith('In the projection: '), file + ': retire copy: ' + text('retire'));
  assert(text('legacy').startsWith(`At ${endAge}, `), file + ': legacy copy: ' + text('legacy'));
  if (us) assert(/^(Yes: |No: |Conversions make little difference)/.test(text('convert')), file + ': convert copy: ' + text('convert'));
  assert.strictEqual((text('survivor').match(/If Partner [AB] dies at \d+:/g) || []).length, 2, file + ': survivor has two sentences: ' + text('survivor'));
  assert.strictEqual(dom.find((d) => d.key === 'spend').link, 'field:spending', file + ': spend links to its field');
  assert.strictEqual(dom.find((d) => d.key === 'legacy').link, 'card:mainChartCard', file + ': legacy links to the chart');

  // links
  await page.locator('[data-goal-answer="spend"] .goal-answer-link').click();
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'spending', file + ': the spend link focuses the field');
  await page.locator('[data-goal-answer="legacy"] .goal-answer-link').click();
  await page.waitForFunction(() => {
    const r = document.getElementById('mainChartCard').getBoundingClientRect();
    return r.top >= -2 && r.top < 200;
  }, null, { timeout: 5000 });

  // short shows moves
  await setField(page, 'spending', SHORT[file]);
  a = await answers(page);
  assert.strictEqual(a.base.word, 'short', file + ': short spending is Short in the projection');
  assert.strictEqual(await page.locator('#movesCard').isHidden(), false, file + ': the moves card shows');
  let r = await rows(page);
  assert(r.length >= 1 && r.length <= 4, file + ': 1-4 moves: ' + JSON.stringify(r));
  assert.strictEqual(r.length, a.moves.length, file + ': one row per move');
  assert((await page.locator('#movesHead').textContent()).startsWith('Runs out at'), file + ': head: ' + (await page.locator('#movesHead').textContent()));
  for (const row of r) assert(RESULT.test(row.result), file + ': result copy: ' + row.result);
  const fixes = a.moves.map((m) => m.fixes);
  assert.deepStrictEqual(fixes, [...fixes].sort((x, y) => y - x), file + ': fixing rows first: ' + fixes);
  assert(r.every((row) => row.disabled === false), file + ': Try is enabled on measured moves');
  await seededBase(page, file, 'short');

  // Try then Revert: the real plan's measures come back at once, undimmed, with no new steps
  const back = await page.evaluate((move) => {
    const before = window.__test_guidanceAnswers();
    const fieldsBefore = window.__test_guidance().ranked;
    window.__test_tryMove(move);
    window.__test_flushRender();
    window.__test_flushGuidance();
    const during = window.__test_guidanceAnswers();
    window.__test_revertMove();
    const after = window.__test_guidanceAnswers();
    const g = window.__test_guidance();
    return {
      before, during, after, fieldsBefore, fieldsAfter: g.ranked, fieldsPending: g.pending,
      dim: ['movesCard', 'goalAnswers', 'guidanceList'].map((id) => document.getElementById(id).classList.contains('measuring')),
      tryOn: [...document.querySelectorAll('#movesList .move-try')].map((b) => !b.disabled),
    };
  }, { label: labelOf(a.moves[0].what), patch: a.moves[0].patch });
  assert(back.during.steps > back.before.steps, file + ': revert: the preview was measured');
  assert.strictEqual(back.after.pending, false, file + ': revert: no job runs');
  assert.strictEqual(back.after.steps, back.during.steps, file + ': revert: no new steps');
  for (const k of ['base', 'moves', 'answers']) assert.deepStrictEqual(back.after[k], back.before[k], file + ': revert: the same ' + k + ' as before Try');
  assert.deepStrictEqual({ pending: back.fieldsPending, ranked: back.fieldsAfter }, { pending: false, ranked: back.fieldsBefore }, file + ': revert: the same field figures, no job');
  assert.deepStrictEqual(back.dim, [false, false, false], file + ': revert: nothing dimmed');
  assert(back.tryOn.length > 0 && back.tryOn.every(Boolean), file + ': revert: Try is enabled');
  await settle(page);

  // try matches
  await tryMatches(page, file, a.moves[0]);
  const conv = us ? a.moves.find((m) => m.key === 'conversions') : undefined;
  if (conv && conv !== a.moves[0]) await tryMatches(page, file, conv);

  // scenario
  const crash = await page.evaluate(() => ({ kind: 'crash', crashes: [{ age: window.__test_getState().ageA + 3, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] }));
  await page.evaluate((ms) => window.__test_runMarketScenario(ms), crash);
  await settle(page);
  a = await answers(page);
  r = await rows(page);
  assert.strictEqual(a.pending, false, file + ': scenario: measured');
  assert.strictEqual(await page.locator('#movesCard').isHidden(), false, file + ': scenario: the moves show');
  assert(r.length > 0 && r.every((row) => row.disabled === true && row.title === SCENARIO_TITLE), file + ': scenario: Try is disabled: ' + JSON.stringify(r));
  dom = await shownAnswers(page);
  assert(dom.length > 0 && dom.every((d) => d.text !== WORKING), file + ': scenario: answers measured');
  assert.strictEqual(await page.evaluate(() => document.getElementById('goalAnswers').classList.contains('measuring')), false, file + ': scenario: not dimmed');
  await page.evaluate(() => window.__test_revertMarketScenario());
  await settle(page);

  // tight
  await setField(page, 'spending', TIGHT);
  a = await answers(page);
  assert.strictEqual(a.base.word, 'tight', file + ': tight spending is Tight in the projection');
  await seededBase(page, file, 'tight');
  assert((await page.locator('#movesHead').textContent()).startsWith('Tight in the projection.'), file + ': tight head');
  r = await rows(page);
  const fixing = a.moves.map((m, i) => ({ m, row: r[i] })).filter((x) => x.m.fixes && x.m.key !== 'guardrails');
  assert(fixing.length > 0, file + ': tight: some move fixes it: ' + JSON.stringify(r));
  for (const x of fixing) assert.strictEqual(x.row.result, ' — makes it Comfortable in the projection', file + ': tight fixing row: ' + x.row.result);
  const word = await page.evaluate((move) => {
    window.__test_tryMove(move);
    window.__test_flushRender();
    window.__test_flushGuidance();
    return window.__test_projectionVerdict().word;
  }, { label: labelOf(fixing[0].m.what), patch: fixing[0].m.patch });
  assert.strictEqual(word, 'comfortable', file + ': tight: Try makes it Comfortable');
  await page.evaluate(() => window.__test_revertMove());
  await settle(page);
  await setField(page, 'spending', s0.spending);

  // unfixable (US): rent so high that no spending cut helps
  if (us) {
    await page.evaluate(() => document.getElementById('rentBtn').click());
    await setField(page, 'spending', 0);
    await setField(page, 'rent', 20000);
    a = await answers(page);
    assert.strictEqual(a.base.word, 'short', file + ': unfixable is Short');
    assert(!a.moves.some((m) => m.key === 'spend'), file + ': unfixable: no cut-spending move: ' + JSON.stringify(a.moves.map((m) => m.key)));
    await page.evaluate(() => document.getElementById('ownBtn').click());
    await settle(page);
    await setField(page, 'spending', s0.spending);
  }

  // single
  await setField(page, 'singlePerson', true);
  assert.strictEqual(await page.locator('[data-goal="survivor"]').isHidden(), true, file + ': single: no survivor chip');
  dom = await shownAnswers(page);
  assert(!dom.some((d) => d.key === 'survivor'), file + ': single: no survivor answer');
  const retire = dom.find((d) => d.key === 'retire').text;
  assert(/(at|from|to) \d+/.test(retire) && !/A \d+ \/ B \d+/.test(retire), file + ': single: retire ages read at NN: ' + retire);
  await setField(page, 'singlePerson', false);

  assert.deepStrictEqual(page._errors, [], file + ': page errors ' + page._errors);
  await untickAll(page);
  await page.close();

  // mobile
  const m = await open(browser, file, { width: 390, height: 844 });
  await m.locator('#mobileTabDashboard').click();
  await setField(m, 'spending', SHORT[file]);
  await tickAll(m);
  assert.strictEqual(await m.locator('#movesCard').isHidden(), false, file + ': mobile: the moves card shows');
  assert.strictEqual(await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, file + ': no horizontal scroll at 390');
  await m.locator('[data-goal-answer="spend"] .goal-answer-link').click();
  assert.strictEqual(await m.evaluate(() => document.getElementById('workspace').dataset.mobileView), 'inputs', file + ': mobile: the spend link opens the inputs view');
  assert.strictEqual(await m.evaluate(() => document.activeElement.id), 'spending', file + ': mobile: the spend link focuses the field');
  await untickAll(m);
  assert.deepStrictEqual(m._errors, [], file + ': page errors ' + m._errors);
  await m.close();
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
