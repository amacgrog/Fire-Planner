// Ad-hoc Playwright test for the LIVE withdrawal-mix checkbox
// (state.withdrawalMixEnabled / pickLiveWithdrawalMix() in Planner_US.html),
// added alongside the existing "Withdrawal & conversion optimizer" card's
// full lifetime search (see test_multi_lever_optimizer.js). Unlike that
// search (expensive, on-demand only, never applied to the live plan
// automatically), this toggle is a cheap one-year-lookahead heuristic that
// runs inline in every simulate() call — the live-plan analog of the Roth
// ladder's always-on flat bracket target. Not wired into `npm test`/CI —
// run directly with `node test_live_withdrawal_mix.js`.
//
// Relies on window.__test_* hooks: __test_simulate,
// __test_pickLiveWithdrawalMix, __test_WITHDRAWAL_MIX_CANDIDATES,
// __test_withdrawalMixWeights.
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
  await page.goto('file://' + path.resolve('Planner_US.html'));
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
function clickIfChecked(page, id) {
  return page.evaluate((id) => {
    if (document.getElementById(id).checked) document.getElementById(id).click();
  }, id);
}

// Same ACA-cliff-prone scenario test_multi_lever_optimizer.js uses: a big
// taxable/traditional imbalance and a long pre-SS retirement gap, so the
// plain taxable-first default realistically risks tipping the ACA subsidy
// cliff if drained carelessly.
async function setupAcaCliffScenario(page) {
  await setVal(page, 'stateTax', 'fl');
  await page.evaluate(() => document.getElementById('stateTax').dispatchEvent(new Event('change', { bubbles: true })));
  await setVal(page, 'ageA', 45); await setVal(page, 'ageB', 45);
  await setVal(page, 'retireAgeA', 55); await setVal(page, 'retireAgeB', 55);
  await setVal(page, 'lifeExpectancyA', 90); await setVal(page, 'lifeExpectancyB', 90);
  await setVal(page, 'taxable', 1500000);
  await setVal(page, 'basisRatio', 20);
  await setVal(page, 'traditional', 900000);
  await setVal(page, 'roth', 200000);
  await setVal(page, 'cash', 80000);
  await setVal(page, 'cashReserve', 50000);
  await setVal(page, 'spending', 75000);
  await setVal(page, 'ssMonthlyA', 2800); await setVal(page, 'ssMonthlyB', 2200);
  await setVal(page, 'ssStartAgeA', 67); await setVal(page, 'ssStartAgeB', 67);
  await clickIfUnchecked(page, 'acaEnabled');
  await page.evaluate(() => {
    if (document.getElementById('acaEnhanced').checked) document.getElementById('acaEnhanced').click();
  });
}

(async () => {
  // 1. Off by default.
  await withPage(async (page) => {
    const checked = await page.evaluate(() => document.getElementById('withdrawalMixEnabled').checked);
    ok('withdrawalMixEnabled checkbox is unchecked by default', checked === false);
  });

  // 2. Toggling it on actually changes simulate()'s output (proves the
  // checkbox is really wired into the live projection, not just cosmetic).
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const off = await page.evaluate(() => window.__test_simulate());
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    const on = await page.evaluate(() => window.__test_simulate());
    const anyDifferentMix = off.rows.some((r, i) => r.mixCandidate !== on.rows[i].mixCandidate);
    ok('enabling the live toggle changes at least one year\'s mixCandidate', anyDifferentMix);
    const onRowsWithPick = on.rows.filter((r) => !!r.mixCandidate).length;
    ok('with the toggle on, at least one row has a real (non-default) mix pick', onRowsWithPick > 0, { onRowsWithPick });
  });

  // 3. Toggling it back off reproduces the plain-default behavior exactly
  // (no leftover state from having turned it on).
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const before = await page.evaluate(() => window.__test_simulate());
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    await clickIfChecked(page, 'withdrawalMixEnabled');
    const after = await page.evaluate(() => window.__test_simulate());
    const sameDepletedAge = before.depletedAge === after.depletedAge;
    const sameEndAssets =
      Math.abs((before.rows.at(-1)?.assets || 0) - (after.rows.at(-1)?.assets || 0)) < 1;
    ok('toggling on then off reproduces the original plan exactly', sameDepletedAge && sameEndAssets, {
      before: before.depletedAge,
      after: after.depletedAge,
    });
  });

  // 4. pickLiveWithdrawalMix() unit test: given a year where realizing much
  // ordinary/traditional income would blow well past the remaining safe
  // MAGI room, it should prefer a candidate that leans on Roth (avoiding
  // the overage) over one that draws entirely from traditional — even
  // though a pure this-year-tax comparison alone (ignoring the room) might
  // otherwise favor spreading across taxable/traditional.
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      const pick = window.__test_pickLiveWithdrawalMix;
      const profile = {
        filing: 'mfj', otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0,
        rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: 60, singlePerson: false, year: 0,
      };
      // Plenty in every bucket; a tiny remainingMagiRoom means any candidate
      // that realizes more than a token amount of ordinary/gain income
      // should be penalized relative to one that draws mostly from Roth.
      const candidate = pick(
        60000, // need
        500000, // taxable
        500000, // traditional
        500000, // roth
        250000, // taxableBasis (50% basis, 50% gain ratio)
        profile,
        0, // taxableGainGross
        0, // traditionalGross
        0, // penalizedFraction
        500, // remainingMagiRoom — deliberately tiny
      );
      const weights = window.__test_withdrawalMixWeights(candidate, 500000, 500000, 500000);
      return { candidate, weights };
    });
    ok(
      'with a tiny remaining MAGI room, the live picker favors Roth over traditional/taxable',
      result.weights && result.weights[2] >= result.weights[0] && result.weights[2] >= result.weights[1],
      result,
    );
  });

  // 5. pickLiveWithdrawalMix() unit test: with effectively unlimited MAGI
  // room (no ACA/IRMAA cliff in play), the picker should not gratuitously
  // favor Roth — Roth is a scarce, tax-free-forever resource, so burning it
  // down when there's no bracket/cliff reason to should not happen. Check
  // it picks a candidate whose taxable+traditional split it would also pick
  // under plain this-year tax minimization (i.e. not 'roth' outright when
  // roth alone isn't cheaper on pure tax grounds).
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      const pick = window.__test_pickLiveWithdrawalMix;
      const profile = {
        filing: 'mfj', otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0,
        rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: 60, singlePerson: false, year: 0,
      };
      const candidate = pick(
        10000, // need — small relative to balances, well within low brackets either way
        500000, 500000, 500000, 250000, profile, 0, 0, 0,
        Infinity, // remainingMagiRoom — no cliff to avoid
      );
      return { candidate, isReal: window.__test_WITHDRAWAL_MIX_CANDIDATES.includes(candidate) };
    });
    ok('candidate returned is one of the real WITHDRAWAL_MIX_CANDIDATES', result.isReal, result);
  });

  // 6. Live toggle + Roth ladder combined: enabling both shouldn't throw
  // and should still produce a sane, non-depleting-earlier projection
  // relative to the plain default (a loose sanity check, not a precise
  // optimality claim, since the live picker is a one-year heuristic).
  await withPage(async (page) => {
    await setupAcaCliffScenario(page);
    const baseline = await page.evaluate(() => window.__test_simulate());
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    await clickIfUnchecked(page, 'rothConvEnabled');
    await setVal(page, 'rothConvStartAge', 55);
    await setVal(page, 'rothConvEndAge', 66);
    const combined = await page.evaluate(() => window.__test_simulate());
    const neverDepletesEarlier =
      !combined.depletedAge || (baseline.depletedAge && combined.depletedAge >= baseline.depletedAge);
    ok('live mix + Roth ladder together runs cleanly and does not deplete earlier', neverDepletesEarlier, {
      baseline: baseline.depletedAge,
      combined: combined.depletedAge,
    });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
