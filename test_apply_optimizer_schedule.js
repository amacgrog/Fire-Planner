// Ad-hoc Playwright test for the "Apply this schedule to my plan" button of
// the former Withdrawal & conversion optimizer card (applyMultiLeverSchedule() /
// clearAppliedMultiLeverSchedule() / renderMultiLeverAppliedStatus() in
// Planner_US.html) — added after a user pointed out that running the full
// optimizer never moved the main "Selected retirement timeline" table, no
// matter what it found. Root cause: optimizeMultiLever()/
// renderMultiLeverOptimizer() only ever set rothBracketOverrideByAge/
// withdrawalMixOverrideByAge for the duration of one simulate() call (to
// read dollar amounts for the card's own table), then reset them to null —
// nothing ever wrote the winning schedule anywhere simulate() would read it
// on the NEXT call. Fix: state.appliedRothSchedule/appliedMixSchedule
// (plain {age: value} objects, so they survive JSON/localStorage/scenario
// export) which solveRothConversion()/the mixCandidate line in simulate()
// now consult as a fallback whenever the transient override map has no
// entry for that age. Scoped to simulate() only, same as the live
// withdrawalMixEnabled toggle (see test_live_withdrawal_mix.js) — neither
// touches simulateHistorical()/the backtest or Monte Carlo views.
// In CI through `npm run test:ui` (tests/ui_scripts.js), not `npm test`; run one directly with
// `node test_apply_optimizer_schedule.js`.
//
// Relies on the window.__test_* hooks installed from main.js:
// __test_simulate, __test_getState, __test_applyMultiLeverSchedule,
// __test_clearAppliedMultiLeverSchedule, __test_optimizeMultiLever. The
// multi-lever card was replaced by the plan card in Batch 5 step 4a
// (test_plan_optimizer.js), so the optimizer runs through its hook, on the
// default objective (the after-tax end value; the card offered Apply when
// the gain was over $1, today's dollars), and the schedule is applied and
// cleared through the hooks; the applied schedules' status line still
// shows in the plan card (#multiLeverAppliedStatus).
const { chromium } = require('playwright');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

async function withPage(fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('dist', 'Planner_US.html'));
  await page.waitForTimeout(250);
  await fn(page);
  if (errors.length) { fail++; console.log('  FAIL page errors:', errors); }
  await browser.close();
}

function setVal(page, id, val) {
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, val });
}
function clickIfUnchecked(page, id) {
  return page.evaluate((id) => {
    if (!document.getElementById(id).checked) document.getElementById(id).click();
  }, id);
}

// Same real-user shape that exposed the live-mix bugs and the "optimizer
// finds something but the main table never moves" report that led here: a
// large traditional balance, an ACA-cliff-relevant gap before Social
// Security, and real room for a Roth ladder + mix schedule to help.
async function setupRealUserScenario(page) {
  await setVal(page, 'stateTax', 'ma');
  await page.evaluate(() => document.getElementById('stateTax').dispatchEvent(new Event('change', { bubbles: true })));
  await setVal(page, 'basisRatio', 90);
  await setVal(page, 'ageA', 33); await setVal(page, 'ageB', 34);
  await setVal(page, 'lifeExpectancyA', 85); await setVal(page, 'lifeExpectancyB', 85);
  await setVal(page, 'retireAgeA', 55); await setVal(page, 'retireAgeB', 50);
  await setVal(page, 'incomeA', 155000); await setVal(page, 'incomeB', 159000);
  await setVal(page, 'spending', 38500);
  await setVal(page, 'taxable', 204395);
  await setVal(page, 'trad401kA', 216750);
  await setVal(page, 'trad401kB', 216750);
  await setVal(page, 'rothIraA', 115500);
  await setVal(page, 'rothIraB', 115500);
  await setVal(page, 'cash', 116000);
  await setVal(page, 'cashReserve', 50000);
  await setVal(page, 'ssMonthlyA', 0); await setVal(page, 'ssMonthlyB', 0);
  await setVal(page, 'pensionYearlyA', 33000); await setVal(page, 'pensionStartAgeA', 67);
  await clickIfUnchecked(page, 'acaEnabled');
  await clickIfUnchecked(page, 'acaEnhanced');
}

// The multi-lever optimizer on the given levers (the hook), then its schedule applied (the hook, as the removed card's Apply
// button did). Returns the run's gain (today's dollars).
function optimizeAndApply(page, options) {
  return page.evaluate((options) => {
    const opt = window.__test_optimizeMultiLever(window.__test_simulate(), options, 'endValue');
    window.__test_applyMultiLeverSchedule(opt, options);
    return opt.gain;
  }, options);
}

(async () => {
  // 1. Applying does nothing to appliedRothSchedule/appliedMixSchedule
  // before the button is ever clicked — off by default, same "never
  // changes your plan until you act" promise the card's own copy makes.
  await withPage(async (page) => {
    const applied = await page.evaluate(() => {
      const s = window.__test_getState();
      return { roth: s.appliedRothSchedule, mix: s.appliedMixSchedule };
    });
    ok('appliedRothSchedule/appliedMixSchedule are null by default', applied.roth === null && applied.mix === null, applied);
  });

  // 2. Clicking Apply after an Optimize run actually changes what
  // simulate() produces for the main plan — not just the optimizer card's
  // own result table (this is the bug report that led here: before this
  // fix, the main "Selected retirement timeline" table never moved no
  // matter what the optimizer found).
  await withPage(async (page) => {
    await setupRealUserScenario(page);
    const before = await page.evaluate(() => window.__test_simulate().rows.find((r) => r.age === 62).total);
    const gain = await optimizeAndApply(page, { includeRoth: true, includeMix: true });
    ok('the run found real savings (over $1, what the card offered Apply on)', gain > 1, gain);
    const after = await page.evaluate(() => window.__test_simulate().rows.find((r) => r.age === 62).total);
    ok(
      'applying the schedule actually changes the main plan\'s projection (not just the optimizer card\'s own table)',
      after !== before,
      { before, after },
    );
    const state = await page.evaluate(() => {
      const s = window.__test_getState();
      return { rothConvEnabled: s.rothConvEnabled, roth: s.appliedRothSchedule, mix: s.appliedMixSchedule };
    });
    ok('applying the Roth lever turns rothConvEnabled on', state.rothConvEnabled === true);
    ok('appliedRothSchedule is a non-empty plain object after applying', !!state.roth && Object.keys(state.roth).length > 0, state.roth);
    ok('appliedMixSchedule is a non-empty plain object after applying', !!state.mix && Object.keys(state.mix).length > 0, state.mix);
    const status = await page.evaluate(() => ({ hidden: document.getElementById('multiLeverAppliedStatus').hidden, text: document.getElementById('multiLeverAppliedStatus').textContent }));
    ok('the applied-status line shows in the plan card', !status.hidden && status.text.includes('a per-year Roth conversion schedule') && status.text.includes('a per-year withdrawal mix'), status);
  });

  // 3. The applied schedule survives a page reload (it's a real state
  // field now, not a session-only closure variable) via the normal
  // localStorage autosave path.
  await withPage(async (page) => {
    await setupRealUserScenario(page);
    await optimizeAndApply(page, { includeRoth: true, includeMix: true });
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => window.__test_simulate().rows.find((r) => r.age === 62).total);
    await page.reload();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__test_simulate().rows.find((r) => r.age === 62).total);
    ok('applied schedule survives a page reload via autosave', Math.abs(after - before) < 1, { before, after });
    const bannerHidden = await page.evaluate(() => document.getElementById('multiLeverAppliedStatus').hidden);
    ok('the "applied from the optimizer" banner is visible after reload (not just mid-session)', bannerHidden === false);
  });

  // 4. Clearing an applied schedule removes exactly the schedule override
  // (not the "Enable Roth conversion ladder"/other checkboxes Apply may
  // have turned on along the way — those stay exactly as Apply left them,
  // same as if the person had checked them by hand) and hides the banner.
  // Verified by comparing against a second page that reaches the same
  // "ladder on, flat default bracket, no mix" state purely by hand.
  await withPage(async (page) => {
    await setupRealUserScenario(page);
    await optimizeAndApply(page, { includeRoth: true, includeMix: true });
    // The status line's own clear links (the listener kept in the plan card), the Roth one then the mix one.
    await page.click('#planOptimizerCard > summary');
    await page.click('#multiLeverAppliedStatus [data-clear-applied="roth"]');
    ok("the status line's Roth clear link clears only the Roth schedule", await page.evaluate(() => window.__test_getState().appliedRothSchedule === null && window.__test_getState().appliedMixSchedule !== null));
    await page.evaluate(() => {
      window.__test_clearAppliedMultiLeverSchedule('both');
    });
    const after = await page.evaluate(() => window.__test_simulate().rows.find((r) => r.age === 62).total);
    const state = await page.evaluate(() => {
      const s = window.__test_getState();
      return { roth: s.appliedRothSchedule, mix: s.appliedMixSchedule, rothConvEnabled: s.rothConvEnabled };
    });
    ok('clearing sets both applied schedules back to null', state.roth === null && state.mix === null, state);
    ok(
      '"Enable Roth conversion ladder" stays on after clearing (Apply turning it on behaves like checking it by hand)',
      state.rothConvEnabled === true,
    );
    const bannerHidden = await page.evaluate(() => document.getElementById('multiLeverAppliedStatus').hidden);
    ok('the applied-status banner hides again once cleared', bannerHidden === true);

    await withPage(async (handPage) => {
      await setupRealUserScenario(handPage);
      await clickIfUnchecked(handPage, 'rothConvEnabled');
      const handTotal = await handPage.evaluate(() => window.__test_simulate().rows.find((r) => r.age === 62).total);
      ok(
        'post-clear plan matches manually checking the ladder box with its flat default bracket (no leftover schedule influence)',
        Math.abs(after - handTotal) < 1,
        { after, handTotal },
      );
    });
  });

  // 5. Applying only the mix lever (Roth left unchecked) doesn't disturb
  // an already-applied Roth schedule from an earlier run — "only touches
  // the lever(s) this run actually searched" per the comment on
  // applyMultiLeverSchedule().
  await withPage(async (page) => {
    await setupRealUserScenario(page);
    await optimizeAndApply(page, { includeRoth: true });
    const rothAfterFirstApply = await page.evaluate(() => window.__test_getState().appliedRothSchedule);
    await optimizeAndApply(page, { includeMix: true });
    const state = await page.evaluate(() => {
      const s = window.__test_getState();
      return { roth: s.appliedRothSchedule, mix: s.appliedMixSchedule };
    });
    ok(
      'applying only the mix lever leaves a previously-applied Roth schedule untouched',
      JSON.stringify(state.roth) === JSON.stringify(rothAfterFirstApply),
      { before: rothAfterFirstApply, after: state.roth },
    );
    ok('the mix lever got applied on the second run', !!state.mix && Object.keys(state.mix).length > 0, state.mix);
  });

  // 6. normalizeState() guards against a hand-edited/corrupted applied
  // schedule the same way the enum fields elsewhere in the file are
  // guarded — a bogus key or value is dropped rather than silently
  // corrupting simulate()'s withdrawal/conversion math.
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      // Re-run normalizeState() indirectly via loadScenario's own
      // normalization path (scenarios array isn't exposed directly, so
      // exercise importScenarioFile's equivalent by round-tripping
      // through the scenario-list "Load" button).
      const file = new File(
        [
          JSON.stringify({
            firePlannerScenario: true,
            schemaVersion: 1,
            name: 'corrupt applied schedule',
            state: {
              appliedRothSchedule: { '-5': 22, abc: 99, '60': 22, '61': 999 },
              appliedMixSchedule: { '60': 'taxable', '61': 'not-a-real-candidate' },
            },
          }),
        ],
        'corrupt.json',
        { type: 'application/json' },
      );
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('importScenarioInput');
      input.files = dt.files;
      return new Promise((resolve) => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(() => {
          document.querySelector('[data-load]').click();
          setTimeout(() => {
            const s = window.__test_getState();
            resolve({ roth: s.appliedRothSchedule, mix: s.appliedMixSchedule });
          }, 100);
        }, 100);
      });
    });
    ok('negative/non-numeric ages are dropped from an imported applied-roth schedule', !('−5' in (result.roth || {})) && !('abc' in (result.roth || {})), result.roth);
    ok('an out-of-menu bracket value (999) is dropped, valid age 60 kept', result.roth && result.roth[60] === 22 && !(61 in result.roth), result.roth);
    ok('an unrecognized mix candidate string is dropped, valid "taxable" kept', result.mix && result.mix[60] === 'taxable' && !(61 in result.mix), result.mix);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
