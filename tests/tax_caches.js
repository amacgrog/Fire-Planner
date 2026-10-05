// The per-call memos in the tax code ("7D part 2") must never change a number. Each memo is keyed on every
// input it depends on, so nothing is ever cleared; this test is the guard. Compared with Object.is, never a
// tolerance.
//   * taxIndexFactor: the remembered factor against Math.pow, across inflation changes, whole and fractional
//     year indexes, in both orders, and inside a historical run (which has its own factors).
//   * the per-person state inputs (needsPerPerson): every projection with the flags as compiled against the same
//     projection with the per-person inputs built for every row, in every state, for each of a list of one-input
//     changes, so a row that reads a field the flag skipped, or a stale value left in a reused inputs object,
//     shows as a changed double. Also pins which rows have the flag.
//   node tests/tax_caches.js

const { chromium } = require('playwright');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc}${detail ? ' — ' + JSON.stringify(detail) : ''}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(250);

  const factor = await page.evaluate(() => {
    const T = window.__test_tax, st = window.__test_getState();
    const inflations = [2.5, 3, 0, 7.25, -1, 2.5, 4, 4, 2.5];
    const years = [0, 1, 2, 3, 10, 40, 100, 255, 256, 300, 2.5, 0.5, -1, 7, 7];
    let n = 0, bad = 0;
    const check = (inf, y) => {
      st.inflation = inf;
      const want = Math.pow(1 + (inf || 0) / 100, y);
      n++;
      if (!Object.is(T.taxIndexFactor(y), want)) bad++;
    };
    for (const inf of inflations) for (const y of years) check(inf, y);
    for (const y of years.slice().reverse()) for (const inf of inflations.slice().reverse()) check(inf, y);
    // Changing inflation between two calls for the same year must miss.
    st.inflation = 3; const a = T.taxIndexFactor(10); st.inflation = 5; const b = T.taxIndexFactor(10); st.inflation = 3; const c = T.taxIndexFactor(10);
    const flipped = !Object.is(a, b) && Object.is(a, c);
    // Inside a historical run the path's own factors are used, then the plan's own come back.
    st.inflation = 2.5;
    const before = T.taxIndexFactor(5);
    const H = window.__test_HIST;
    window.__test_simulateHistorical((y) => H[40 + y]);
    const after = T.taxIndexFactor(5);
    return { n, bad, flipped, restored: Object.is(before, after) && Object.is(after, Math.pow(1.025, 5)) };
  });
  ok(`taxIndexFactor == Math.pow over ${factor.n} calls`, factor.bad === 0, factor);
  ok('a changed inflation misses, the old value returns with it', factor.flipped);
  ok('the plan factor is intact after a historical run', factor.restored);

  // 3. The per-person inputs: flags as compiled against every row forced on.
  const per = await page.evaluate(() => {
    const st = window.__test_getState(), rules = window.__test_stateRuleFor, R = window.__test_tax.STATE_RULES;
    const base = JSON.parse(JSON.stringify(st));
    const reset = () => { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, JSON.parse(JSON.stringify(base))); };
    const codes = Object.keys(R);
    // Which rows should carry the flag: a per-person retirement kind or the age-and-AGI-tiered Social Security kind.
    const expectFlag = (row) => {
      const hit = (r) => r.retirementExclusion.kind === 'perPerson' || (typeof r.base.socialSecurity === 'object' && r.base.socialSecurity.kind === 'ageAgiTiered');
      return hit(row) || (row.schedule || []).some((v) => (v.retirementExclusion ? v.retirementExclusion.kind === 'perPerson' : false) || (v.base && v.base.socialSecurity && v.base.socialSecurity.kind === 'ageAgiTiered'));
    };
    const flagWrong = codes.filter((c) => !!rules(c).needsPerPerson !== expectFlag(R[c]));
    const kids = [{ birthYear: 2012, student: false }, { birthYear: 2020, student: false }];
    const changes = [
      ['base', {}], ['single person', { singlePerson: true }], ['filing single', { filingStatus: 'single' }],
      ['children', { children: kids }], ['retired both', { ageA: 68, ageB: 66, retireAgeA: 60, retireAgeB: 60 }],
      ['income A only', { incomeB: 0 }], ['survivor', { lifeExpectancyA: 72 }], ['survivor B', { lifeExpectancyB: 72 }],
      ['roth conversions', { rothConvEnabled: true }],
    ];
    const flat = (v, out) => {
      if (typeof v === 'number') out.push(v);
      else if (Array.isArray(v)) for (const x of v) flat(x, out);
      else if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) flat(v[k], out);
    };
    const H = window.__test_HIST;
    const run = (code, patch) => {
      reset();
      Object.assign(st, patch, { stateTax: code });
      const out = [];
      const a = window.__test_simulate(st.retireAgeA, st.retireAgeB); flat(a.rows, out);
      const b = window.__test_simulateHistorical((y) => H[5 + y], st.retireAgeA, st.retireAgeB); flat(b.rows, out);
      return out;
    };
    // The same sweep twice: as compiled, then with every row forced to build the per-person inputs.
    const sweep = () => {
      const all = [];
      for (const code of codes) for (const [, patch] of changes) all.push(run(code, patch));
      return all;
    };
    const asCompiled = sweep();
    const saved = codes.map((c) => rules(c).needsPerPerson);
    codes.forEach((c) => { rules(c).needsPerPerson = true; });
    const forced = sweep();
    codes.forEach((c, i) => { rules(c).needsPerPerson = saved[i]; });
    reset();
    let bad = 0, first = null;
    asCompiled.forEach((row, i) => {
      for (let k = 0; k < row.length || k < forced[i].length; k++)
        if (!Object.is(row[k], forced[i][k])) { bad++; if (!first) first = { code: codes[Math.floor(i / changes.length)], change: changes[i % changes.length][0], at: k }; break; }
    });
    return { n: asCompiled.length, flagged: saved.filter(Boolean).length, flagWrong, bad, first };
  });
  ok('needsPerPerson is set exactly for per-person retirement and age-tiered Social Security rows', per.flagWrong.length === 0, per);
  ok(`${per.n} state x change projections: compiled flags == per-person inputs built for every row`, per.bad === 0, per);

  ok('no page errors', errors.length === 0, errors);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
