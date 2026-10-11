const { chromium } = require('playwright');
const path = require('path');
const { legacyToAccounts } = require('../../tests/legacy_balances');
const ROOT = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.join(ROOT, 'Planner_US.html'));
  await page.waitForTimeout(300);
  const res = await page.evaluate(({ convert }) => {
    const toAcc = eval('(' + convert + ')');
    const state = window.__test_getState();
    const base = JSON.parse(JSON.stringify(state));
    const out = []; let n = 0;
    const run = (patch, flag) => {
      window.__ROOMFIX = true; window.__CAP = flag;
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, JSON.parse(JSON.stringify(base)), toAcc(patch, base));
      const s = window.__test_simulate(state.retireAgeA, state.retireAgeB);
      return { rows: s.rows, dep: s.depletedAge };
    };
    for (const single of [true, false])
    for (const age of [52, 58, 62])
    for (const taxable of [300000, 800000, 2000000])
    for (const trad of [500000, 1500000])
    for (const basisRatio of [20, 60, 90])
    for (const spending of [60000, 90000, 130000])
    for (const mode of ['live', 'smooth', 'default'])
    for (const aca of [true]) {
      const patch = { singlePerson: single, ageA: age, ageB: age, retireAgeA: age, retireAgeB: age, lifeExpectancyA: 90, lifeExpectancyB: 90, taxable, traditional: trad, roth: 100000, cash: 30000, spending, basisRatio, acaEnabled: aca, acaEnhanced: false, stateTax: 'tx',
        withdrawalMixEnabled: mode === 'live', smoothWithdrawals: mode === 'smooth', bondYears: 0, rothConvEnabled: false, ruleOfAge: 0 };
      const a = run(patch, false), b = run(patch, true);
      n++;
      let diff = 0, magiA = 0, magiB = 0;
      for (let i = 0; i < a.rows.length; i++) { if (Math.abs(a.rows[i].tax - b.rows[i].tax) > 1 || Math.abs(a.rows[i].healthcare - b.rows[i].healthcare) > 1) diff++; }
      if (diff) out.push({ single, age, taxable, trad, basisRatio, spending, mode, diff, totA: a.rows.reduce((s, r) => s + r.tax + r.healthcare, 0), totB: b.rows.reduce((s, r) => s + r.tax + r.healthcare, 0), endA: a.rows.at(-1).investable, endB: b.rows.at(-1).investable, depA: a.dep||0, depB: b.dep||0 });
    }
    return { n, out };
  }, { convert: legacyToAccounts.toString() });
  console.log('scenarios', res.n, 'differing', res.out.length);
  const by = {};
  for (const o of res.out) { const k = o.mode; by[k] = by[k] || { n: 0, better: 0, worse: 0, depBetter: 0, depWorse: 0, dEnd: 0 };
    const e = by[k]; e.n++; const d = o.endB - o.endA; e.dEnd += d; if (d > 1000) e.better++; else if (d < -1000) e.worse++;
    const da = o.depA || 999, db = o.depB || 999; if (db > da) e.depBetter++; if (db < da) e.depWorse++; }
  console.log(JSON.stringify(by, null, 1));
  const worst = res.out.filter(o => (o.depB||999) < (o.depA||999) || o.endB - o.endA < -50000).slice(0, 12); worst.forEach(o => console.log(JSON.stringify(o)));
  await browser.close();
})();
