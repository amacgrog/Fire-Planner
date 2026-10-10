// Inherited traditional and Roth IRA / 401(k) accounts (E1e, US). Spec: docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md.
// Hand-computed; the clock is pinned to 2026-06-15.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // ---- Task 1: the Single Life Table ----
  // Treas. Reg. 1.401(a)(9)-9(b), Single Life Table (distribution calendar years from 2022), ages 0..120.
  const SLT = [84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9, 74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0,
    67.0, 66.0, 65.0, 64.1, 63.1, 62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3, 55.3, 54.4, 53.4, 52.5, 51.5, 50.5, 49.6, 48.6,
    47.7, 46.7, 45.7, 44.8, 43.8, 42.9, 41.9, 41.0, 40.0, 39.0, 38.1, 37.1, 36.2, 35.3, 34.3, 33.4, 32.5, 31.6, 30.6, 29.8,
    28.9, 28.0, 27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4, 19.6, 18.8, 18.0, 17.2, 16.4, 15.6, 14.8, 14.1, 13.3,
    12.6, 11.9, 11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1, 5.7, 5.3, 4.9, 4.6, 4.3, 4.0, 3.7, 3.4, 3.2, 3.0, 2.8,
    2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1, 2.0, 2.0, 2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1, 1.0];
  assert.strictEqual(SLT.length, 121);
  for (let age = 0; age <= 120; age++)
    assert.strictEqual(await page.evaluate((a) => window.__test_inherited.singleLifeFactor(a), age), SLT[age], `SLT ${age}`);
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(125)), 1.0, 'SLT above 120');
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(-3)), 84.6, 'SLT below 0');
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(60.4)), 27.1, 'SLT rounds');

  // ---- Task 2: the state sources fields are written on every taxing-state call (spec 6.4, review B2) ----
  // A profile with an inherited draw, then a legacy profile (no inh fields at all), in one page: the legacy tax equals a
  // fresh evaluation bit for bit (the sources scratch objects are reused between calls).
  for (const [code, extra] of [['ny', {}], ['co', { extraA: 30000 }], ['pa', {}], ['ct', {}]]) {
    const staleCheck = await page.evaluate(([c, ex]) => {
      const T = window.__test_tax;
      const base = { filing: 'single', singlePerson: true, otherA: 40000, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0,
        pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 70, ageB: null, invOrd: 0, invQual: 0, year: 0, ...ex };
      return window.__test_withState({ stateTax: c }, () => {
        const fresh = T.taxFor({ ...base }, 0, 10000);
        T.taxFor({ ...base, otherA: 70000, inhOn: true, inheritedA: 30000, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 20000, inhExclB: 0 }, 0, 10000);
        const after = T.taxFor({ ...base }, 0, 10000);
        return { same: Object.is(fresh, after), fresh, after };
      });
    }, [code, extra]);
    assert(staleCheck.same, `stale source ${code}: ${staleCheck.fresh} vs ${staleCheck.after}`);
  }
  // The comparison above cannot fail for PA or CT on that profile (a stale 30,000 is fully subtracted in PA, and CT's share is 1
  // at a state base of 40,000), and it covers only SOURCES_SINGLE: so every scratch object each taxFor branch uses must read all
  // zeros after a legacy call that follows an inherited one (joint: index 0; one-person: 1; two filers: 2 and 3).
  for (const code of ['ny', 'pa', 'ct']) {
    for (const [branch, o, idxs] of [
      ['joint', { filing: 'mfj', singlePerson: false }, [0]],
      ['one-person', { filing: 'single', singlePerson: true }, [1]],
      ['two filers', { filing: 'single', singlePerson: false }, [2, 3]],
    ]) {
      const zeros = await page.evaluate(([c, ov, ix]) => {
        const T = window.__test_tax;
        const base = { year: 0, otherA: 40000, otherB: 30000, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0,
          ssA: 0, ssB: 0, ageA: 70, ageB: 66, invOrd: 0, invQual: 0, ...ov };
        return window.__test_withState({ stateTax: c }, () => {
          T.taxFor({ ...base, inhOn: true, inheritedA: 30000, inheritedB: 25000, inhExtraA: 4000, inhExtraB: 3000, inhExclA: 20000, inhExclB: 15000 }, 0, 10000);
          const during = ix.map((i) => window.__test_inherited.sourcesInh()[i]);
          T.taxFor({ ...base }, 0, 10000);
          return { during, after: ix.map((i) => window.__test_inherited.sourcesInh()[i]) };
        });
      }, [code, o, idxs]);
      assert(zeros.during.every((r) => r[0] > 0), `${code} ${branch}: the inherited call wrote the sources (${JSON.stringify(zeros.during)})`);
      assert(zeros.after.every((r) => r.every((x) => x === 0)), `${code} ${branch}: stale sources after a legacy call: ${JSON.stringify(zeros.after)}`);
    }
  }
  // A legacy profile pays exactly what it paid before Task 2. The constants were produced by running this same evaluation on the
  // base tree (commit 3a5b7cb, Planner_US.html before Task 1) and are compared bit for bit: [single, joint, two filers] per state.
  const LEGACY = { ny: [6151, 6105.05, 5649.5], pa: [5595.9, 6180.8, 5655.799999999999], ca: [6020.53, 5942.38, 5507.780000000001],
    wa: [5074, 5444, 4919], co: [5947.4, 5488, 5462.4] };
  const legacyNow = await page.evaluate(() => {
    const T = window.__test_tax;
    const base = { filing: 'single', singlePerson: true, otherA: 40000, otherB: 0, extraA: 12000, extraB: 0, wageA: 0, wageB: 0, pensionA: 9000, pensionB: 0, rmdA: 15000, rmdB: 0, ssA: 20000, ssB: 0, ageA: 70, ageB: null, invOrd: 1500, invQual: 500, year: 0 };
    const joint = { ...base, filing: 'mfj', singlePerson: false, ageB: 66, otherB: 20000, pensionB: 5000, ssB: 10000, rmdB: 8000, extraB: 7000 };
    const sep = { ...joint, filing: 'single' };
    const out = {};
    for (const code of Object.keys({ ny: 1, pa: 1, ca: 1, wa: 1, co: 1 }))
      out[code] = window.__test_withState({ stateTax: code }, () => [T.taxFor({ ...base }, 3000, 10000), T.taxFor({ ...joint }, 3000, 10000), T.taxFor({ ...sep }, 3000, 10000)]);
    return out;
  });
  for (const code of Object.keys(LEGACY))
    LEGACY[code].forEach((v, i) => assert(Object.is(legacyNow[code][i], v), `legacy ${code}[${i}]: ${legacyNow[code][i]} vs base ${v}`));

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('[US] inherited accounts (E1e) tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
