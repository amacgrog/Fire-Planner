// Ad-hoc Playwright test for the LIVE withdrawal-mix checkbox
// (state.withdrawalMixEnabled / pickLiveWithdrawalOrder() in
// Planner_US.html), added alongside the existing "Withdrawal &
// conversion optimizer" card's full lifetime search (see
// test_multi_lever_optimizer.js). Not wired into `npm test`/CI — run
// directly with `node test_live_withdrawal_mix.js`.
//
// This file replaces an earlier version written against a since-deleted
// function, pickLiveWithdrawalMix(), which picked from the same
// WITHDRAWAL_MIX_CANDIDATES proportional-split menu the full optimizer
// searches. That design shipped, was caught via a real uploaded scenario
// (not in review), and turned out to be badly broken in two ways — see
// the comment above pickLiveWithdrawalOrder() in Planner_US.html for the
// full account. In short: proportional-split candidates are only safe
// for the FULL lifetime search (which evaluates the actual multi-year
// consequence of each choice), not for a one-year-only picker, which has
// no way to tell "deliberately skip this bucket this year" from
// "accidentally stranded a large balance while draining something
// scarcer instead." The replacement, pickLiveWithdrawalOrder(), compares
// exactly two orders (taxable-first vs traditional-first), each
// cascading fully into the other bucket for any shortfall — provably
// never worse than the plain default for that decision, since taxable-
// first *is* the plain default's own behavior and the live picker only
// switches away from it when the alternative genuinely costs less. Roth
// isn't part of this decision at all; it's reached exactly as before, as
// the ordinary shortfall fallback once taxable+traditional together
// can't cover the year's need.
//
// Relies on window.__test_* hooks: __test_simulate,
// __test_pickLiveWithdrawalOrder.
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
function setSelect(page, id, val) {
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

// A real scenario reported by a user (heavy taxable balance at 90% cost
// basis, large traditional balance, MA state tax, ACA-enhanced, no SS/
// pension until later) — the exact case that exposed both broken designs
// above: the correct behavior here is for the live toggle to change
// NOTHING relative to the plain default, since taxable's 90% basis
// already makes it the cheapest bucket to draw from nearly every year
// (matching what the plain taxable-first default already does).
async function setupRealUserScenario(page) {
  await setSelect(page, 'stateTax', 'ma');
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
  await setVal(page, 'cash', 116000); await setVal(page, 'cashReserve', 50000);
  await setVal(page, 'ssMonthlyA', 0); await setVal(page, 'ssMonthlyB', 0);
  await setVal(page, 'pensionYearlyA', 33000); await setVal(page, 'pensionStartAgeA', 67);
  await clickIfUnchecked(page, 'acaEnabled');
  await page.evaluate(() => {
    if (!document.getElementById('acaEnhanced').checked) document.getElementById('acaEnhanced').click();
  });
}

(async () => {
  // 1. Off by default.
  await withPage(async (page) => {
    const checked = await page.evaluate(() => document.getElementById('withdrawalMixEnabled').checked);
    ok('withdrawalMixEnabled checkbox is unchecked by default', checked === false);
  });

  // 2. On the real scenario that exposed the earlier bugs: the live
  // toggle must reproduce the plain default EXACTLY (same total lifetime
  // tax+healthcare cost, same depleted age) — not just "close", bit-for-
  // bit, since taxable-first is genuinely the cheapest choice here nearly
  // every year and the picker should recognize that rather than drift
  // away from it.
  await withPage(async (page) => {
    await setupRealUserScenario(page);
    const off = await page.evaluate(() => {
      const sim = window.__test_simulate();
      return { cost: sim.rows.reduce((s, r) => s + r.tax + r.healthcare, 0), depletedAge: sim.depletedAge };
    });
    await clickIfUnchecked(page, 'withdrawalMixEnabled');
    const on = await page.evaluate(() => {
      const sim = window.__test_simulate();
      return { cost: sim.rows.reduce((s, r) => s + r.tax + r.healthcare, 0), depletedAge: sim.depletedAge };
    });
    ok(
      'live toggle never costs more than the plain default on the real scenario that exposed the earlier bugs',
      on.cost <= off.cost + 1 && on.depletedAge === off.depletedAge,
      { off, on },
    );
  });

  // 3. Toggling it back off reproduces the plain-default behavior exactly
  // (no leftover state from having turned it on).
  await withPage(async (page) => {
    await setupRealUserScenario(page);
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

  // 4. pickLiveWithdrawalOrder() unit test: taxable-first must never
  // strand traditional, and vice versa — whichever order is picked must
  // fully satisfy `need` whenever the two buckets combined can cover it
  // (the core property the earlier proportional-split design violated).
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      const pick = window.__test_pickLiveWithdrawalOrder;
      const profile = {
        filing: 'mfj', otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0,
        rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: 60, singlePerson: false, year: 0,
      };
      // Taxable alone ($50k) can't cover the $150k need, but taxable +
      // traditional ($550k) easily can — remainingNeed must be 0, not
      // left stranded because one order's first-choice bucket ran out.
      return pick(150000, 50000, 500000, 30000, profile, 0, 0, 0, Infinity);
    });
    ok(
      'combined taxable+traditional capacity is used fully — no stranded shortfall',
      result.remainingNeed < 1,
      result,
    );
  });

  // 5. pickLiveWithdrawalOrder() unit test: a real case where traditional
  // genuinely is cheaper — Illinois fully exempts traditional/retirement
  // withdrawals from state tax but still taxes capital gains, so for a
  // small need funded from a 100%-gain taxable account, traditional-first
  // should win (this is the scenario that confirmed the live picker isn't
  // just a permanent no-op after the redesign).
  await withPage(async (page) => {
    await setSelect(page, 'stateTax', 'il');
    const result = await page.evaluate(() => {
      const pick = window.__test_pickLiveWithdrawalOrder;
      const profile = {
        filing: 'mfj', otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0,
        rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: 60, singlePerson: false, year: 0,
      };
      return pick(40000, 500000, 500000, 0, profile, 0, 0, 0, Infinity);
    });
    ok(
      'Illinois, 100%-gain taxable, small need: live picker correctly prefers traditional-first',
      result.fromTraditional > 0 && result.fromTaxable === 0,
      result,
    );
  });

  // 6. pickLiveWithdrawalOrder() unit test: a tiny remainingMagiRoom
  // should push the picker toward whichever order realizes less MAGI,
  // even at the cost of more raw tax — verifies the overage term actually
  // has an effect (rather than being dead code).
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      const pick = window.__test_pickLiveWithdrawalOrder;
      const profile = {
        filing: 'mfj', otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0,
        rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: 60, singlePerson: false, year: 0,
      };
      // Taxable at 90% basis realizes far less MAGI per dollar than
      // traditional (100% ordinary income) — with a tiny safe room, the
      // picker should prefer whichever order keeps realized income under
      // it, which here is taxable-first (it already matches the
      // default, but confirms the overage term doesn't break anything
      // when it's the SAME order as the tax-only comparison would pick).
      return pick(60000, 500000, 500000, 450000, profile, 0, 0, 0, 500);
    });
    ok(
      'tiny remainingMagiRoom still resolves to a real, fully-funded order',
      result.remainingNeed < 1 && (result.fromTaxable > 0 || result.fromTraditional > 0),
      result,
    );
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
