const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);

async function openPlanner() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  return { browser, page, errors };
}
// Runs simulate() under a state patch and restores the state afterwards. Returns the rows.
const rows = (page, patch) =>
  page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return JSON.parse(JSON.stringify(window.__test_simulate().rows));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, patch);
// Calls window.__test_tax[fn](...args) under a state patch.
const taxCall = (page, patch, fn, args) =>
  page.evaluate(({ patch, fn, args }) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_tax[fn](...args);
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { patch, fn, args });

// 3C primitives on a hand-built withdrawal: single, 60, Texas, no other income (2026: deduction 16,100).
(async () => {
  const { browser, page, errors } = await openPlanner();
  const out = await page.evaluate(() => {
    const st = window.__test_getState();
    Object.assign(st, { stateTax: 'tx', inflation: 0, singlePerson: true });
    const S = window.__test_solver;
    const profile = { filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [] };
    const r = {};
    // Cap: 50,000 asked, MAGI room 20,000: exactly 20,000 gross; tax on it 10% of (20,000 - 16,100) = 390.
    let wd = S.newTestWithdrawal({ traditional: 500000, cash: 0 }, profile);
    wd.magiCap = { limit: 20000, off: false };
    r.capNet = S.takeTraditional(wd, 'traditional', 50000);
    r.capGross = wd.traditionalGross;
    r.capLeft = S.magiCapLeft(wd);
    // Release: the rest comes out uncapped.
    wd.need = 50000 - r.capNet;
    S.releaseMagiCap(wd, S.solveTraditionalForNet);
    r.releaseNeed = wd.need;
    r.releaseGross = wd.traditionalGross;
    // Fill: 10,000 more gross, under the deduction: all of it lands in cash.
    wd = S.newTestWithdrawal({ traditional: 500000, cash: 1000 }, profile);
    r.fillGross = S.fillTraditional(wd, 10000);
    r.fillCash = wd.bal.cash;
    r.fillTrad = wd.bal.traditional;
    // onlyPartner: B's slots only; A owns everything here, so nothing is drawn.
    wd = S.newTestWithdrawal({ traditional: 500000 }, profile);
    wd.onlyPartner = 1;
    r.onlyB = S.takeTraditional(wd, 'traditional', 10000);
    // Cliff plan, Task 1: only the draw a MAGI cap can limit counts as cappable.
    wd = S.newTestWithdrawal({ traditional: 100000, bondTraditional: 50000 }, profile);
    S.takeTraditional(wd, 'bondTraditional', 10000, undefined, false, true); // the bond reserve's uncapped draw
    r.afterReserve = wd.cappableTraditional;
    S.takeTraditional(wd, 'traditional', 10000); // a capped stock-account draw
    r.cappableAfter = wd.cappableTraditional;
    r.cappableGross = wd.traditionalWithdrawn;
    r.reserveGross = 0;
    return r;
  });
  near(out.capGross, 20000, 1e-6, 'cap: gross stops at the room');
  near(out.capNet, 19610, 0.01, 'cap: net after 390 tax');
  near(out.capLeft, 0, 1e-6, 'cap: no room left');
  assert(out.releaseNeed <= 0.01, `release covers the rest (need ${out.releaseNeed})`);
  assert(out.releaseGross > 20000, 'release draws above the cap');
  near(out.fillGross, 10000, 1e-6, 'fill: gross');
  near(out.fillCash, 11000, 1e-6, 'fill: proceeds in cash, no tax under the deduction');
  near(out.fillTrad, 490000, 1e-6, 'fill: traditional reduced');
  near(out.onlyB, 0, 1e-9, 'onlyPartner B: A’s accounts are not drawn');
  assert.strictEqual(out.afterReserve, 0, 'reserve draw is not cappable');
  assert(out.cappableAfter > 0 && out.cappableAfter < out.cappableGross, 'stock draw is cappable, the reserve draw is not');
  assert.deepStrictEqual(errors, []);
  console.log('solver_primitives: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
