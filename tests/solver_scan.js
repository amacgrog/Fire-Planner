// Cliff-guard sweep (Batch 3C, spec section 13.3): 768 households, each run with the cliff guard on and off, for
// the default withdrawal order and for smooth withdrawals (tax-aware withdrawals off in every run). Prints, for
// guard ON minus guard OFF:
//   - ending after-tax value, lifetime real tax + healthcare and depletion age: better / equal / worse;
//   - p10 / median / p90 of the differences, over all households and over those where neither run depletes;
//   - the same split by conversions off / on;
//   - the cliff choices used, and the 5 largest losses and gains by value and by cost.
// Exit code 1 if any household depletes earlier with the guard on (the 3C hard rule). Not in `npm test`
// (about 3,000 projections plus account traces; several minutes).
//
//   node tests/solver_scan.js [--root DIR] [--json OUT.json] [--md OUT.md]
//
// Grid: 4 filings (MFJ couple, unmarried couple on two single returns, single person, single person with one
// child = head of household) x 4 ages (52, 58, 62, 66; both partners the same, retiring now) x traditional 500k /
// 1.5M (401(k), split evenly for a couple) x taxable 300k / 2M x spending 60k / 130k x elections (none, Rule of 55
// both, 72(t) on A's 401(k)) x conversions off / on (22% bracket, from now to 72); Roth IRA 200k (split), ACA on
// (enhanced credits off), Texas, life expectancy 95.
// Measures: value = the last row's total with every traditional dollar (stock and bond buckets) haircut by a flat
// 22%; cost = sum of (tax + healthcare) / (1 + inflation)^year (rothScheduleCost's 'real' factor); depletion:
// never counts as the latest age. "Equal" = within $1,000. Percentiles are linear-interpolated.
// Matches the numbers in docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md section 13.3, rows 2 and 3.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const JSON_OUT = opt('--json', null);
const MD_OUT = opt('--md', null);

const grid = [];
for (const filing of ['mfj', 'single-couple', 'single-person', 'hoh'])
  for (const age of [52, 58, 62, 66])
    for (const trad of [500000, 1500000])
      for (const taxable of [300000, 2000000])
        for (const spending of [60000, 130000])
          for (const elections of ['none', 'rule55', 'sepp'])
            for (const conv of [false, true]) grid.push({ filing, age, trad, taxable, spending, elections, conv });

const patchOf = (g, mode, guard) => ({
  ...(g.filing === 'mfj' ? { singlePerson: false, filingStatus: 'mfj' } : g.filing === 'single-couple' ? { singlePerson: false, filingStatus: 'single' } : { singlePerson: true }),
  children: g.filing === 'hoh' ? [{ birthYear: 2016, student: false }] : [],
  ageA: g.age, ageB: g.age, retireAgeA: g.age, retireAgeB: g.age, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: g.taxable, spending: g.spending,
  smoothWithdrawals: mode === 'smooth', withdrawalMixEnabled: false,
  rothConvEnabled: g.conv, rothConvStartAge: g.age, rothConvEndAge: Math.max(g.age, 72), rothConvBracket: 22,
  ruleOf55A: g.elections === 'rule55', ruleOf55B: g.elections === 'rule55', sepp72tK401A: g.elections === 'sepp',
  cliffGuardEnabled: guard,
  ...legacyToAccounts({ traditional: g.trad, roth: 200000 }, { singlePerson: g.filing === 'single-person' || g.filing === 'hoh' }),
});

const RUNS = [['default', true], ['default', false], ['smooth', true], ['smooth', false]];
const TOL = 1000;
const depN = (d) => (d == null ? Infinity : d);
const fmt = (n) => (n == null ? 'never' : Math.round(n).toLocaleString('en-US'));
const sgn = (n) => (n > 0 ? '+' : '') + fmt(n);
const pctl = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const FIL = { mfj: 'couple, MFJ', 'single-couple': 'couple, two single returns', 'single-person': 'single person', hoh: 'single person, HoH (1 child b. 2016)' };
const desc = (g) => {
  const couple = g.filing === 'mfj' || g.filing === 'single-couple', k = (n) => n / 1000 + 'k';
  const accts = couple ? `401(k) ${k(g.trad / 2)} A + ${k(g.trad / 2)} B` : `401(k) ${k(g.trad)} A`;
  return `${FIL[g.filing]}; age ${g.age}; ${accts}; taxable ${k(g.taxable)}; spending ${k(g.spending)}; elections ${g.elections}; conversions ${g.conv ? 'on' : 'off'}`;
};
const chStr = (c) => { const e = Object.entries(c || {}); return e.length ? e.map(([l, n]) => `${l} x${n}`).join('; ') : '-'; };

function compare(ON, OFF, subset) {
  const rows = ON.map((_, i) => i).filter(subset).map((i) => ({ g: grid[i], a: ON[i], x: OFF[i], dv: ON[i].value - OFF[i].value, dc: ON[i].cost - OFF[i].cost, dd: depN(ON[i].dep) - depN(OFF[i].dep) }));
  const cnt = (rs, f) => rs.filter(f).length;
  const st = (arr) => [pctl(arr, 0.1), pctl(arr, 0.5), pctl(arr, 0.9)];
  const both = rows.filter((r) => r.a.dep == null && r.x.dep == null);
  const value = (rs) => [cnt(rs, (r) => r.dv > TOL), cnt(rs, (r) => Math.abs(r.dv) <= TOL), cnt(rs, (r) => r.dv < -TOL), ...st(rs.map((r) => r.dv))];
  const cost = (rs) => [cnt(rs, (r) => r.dc < -TOL), cnt(rs, (r) => Math.abs(r.dc) <= TOL), cnt(rs, (r) => r.dc > TOL), ...st(rs.map((r) => r.dc))];
  const finiteDd = rows.filter((r) => isFinite(r.dd)).map((r) => r.dd);
  return {
    n: rows.length, rows, nBoth: both.length,
    value: value(rows), valueBoth: value(both), cost: cost(rows), costBoth: cost(both),
    dep: [cnt(rows, (r) => r.dd > 0), cnt(rows, (r) => r.dd === 0 || r.dd !== r.dd), cnt(rows, (r) => r.dd < 0), finiteDd.length, ...st(finiteDd)],
  };
}

function section(title, ON, OFF) {
  const subsets = [['conversions off', (i) => !grid[i].conv], ['conversions on', (i) => grid[i].conv], ['combined', () => true]];
  const res = subsets.map(([nm, f]) => [nm, compare(ON, OFF, f)]);
  const t = (a) => a.map(sgn).join(' / ');
  let s = `\n## ${title} (guard ON minus guard OFF)\n\n`;
  s += `### Ending after-tax value (positive = ON better)\n\n| Subset | n | Better / equal / worse | p10 / median / p90 | Neither depletes: n | Neither: better / equal / worse | Neither: p10 / median / p90 |\n|---|---|---|---|---|---|---|\n`;
  for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.value.slice(0, 3).join(' / ')} | ${t(r.value.slice(3))} | ${r.nBoth} | ${r.valueBoth.slice(0, 3).join(' / ')} | ${t(r.valueBoth.slice(3))} |\n`;
  s += `\n### Lifetime tax + healthcare, real (negative = ON better)\n\n| Subset | n | Better / equal / worse | p10 / median / p90 | Neither: better / equal / worse | Neither: p10 / median / p90 |\n|---|---|---|---|---|---|\n`;
  for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.cost.slice(0, 3).join(' / ')} | ${t(r.cost.slice(3))} | ${r.costBoth.slice(0, 3).join(' / ')} | ${t(r.costBoth.slice(3))} |\n`;
  s += `\n### Depletion age (years; positive = ON later)\n\n| Subset | n | Later / same / earlier | Both deplete: n | Both deplete: p10 / median / p90 |\n|---|---|---|---|---|\n`;
  for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.dep.slice(0, 3).join(' / ')} | ${r.dep[3]} | ${r.dep[3] ? r.dep.slice(4).map((v) => v.toFixed(1)).join(' / ') : '-'} |\n`;
  const all = res[2][1].rows;
  const tally = (rs) => {
    const c = {};
    for (const r of rs) for (const l of Object.keys(r.a.choices || {})) c[l] = (c[l] || 0) + 1;
    const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
    return e.length ? e.map(([l, n]) => `${l} (${n})`).join(', ') : 'none';
  };
  const losers = all.filter((r) => r.dv < -TOL), winners = all.filter((r) => r.dv > TOL);
  s += `\nCliff choices in the ON run (households using each label at least once):\n- value worse (${losers.length}): ${tally(losers)}\n- value better (${winners.length}): ${tally(winners)}\n`;
  const hdr = `| Household | Value ON-OFF | Value ON / OFF | Cost ON-OFF | Cost ON / OFF | Depletion ON / OFF | Cliff choices ON (years) |\n|---|---|---|---|---|---|---|\n`;
  const line = (r) => `| ${desc(r.g)} | ${sgn(r.dv)} | ${fmt(r.a.value)} / ${fmt(r.x.value)} | ${sgn(r.dc)} | ${fmt(r.a.cost)} / ${fmt(r.x.cost)} | ${fmt(r.a.dep)} / ${fmt(r.x.dep)} | ${chStr(r.a.choices)} |\n`;
  const byV = [...all].sort((a, b) => a.dv - b.dv), byC = [...all].sort((a, b) => b.dc - a.dc);
  s += `\n### 5 largest losses by value\n\n${hdr}${byV.slice(0, 5).map(line).join('')}`;
  s += `\n### 5 largest gains by value\n\n${hdr}${byV.slice(-5).reverse().map(line).join('')}`;
  s += `\n### 5 largest losses by cost (ON pays more)\n\n${hdr}${byC.slice(0, 5).map(line).join('')}`;
  s += `\n### 5 largest gains by cost (ON pays less)\n\n${hdr}${byC.slice(-5).reverse().map(line).join('')}`;
  const c = res[2][1];
  const summary = `${title}: value ${c.value.slice(0, 3).join(' / ')}, cost ${c.cost.slice(0, 3).join(' / ')}, depletion ${c.dep.slice(0, 3).join(' / ')}`;
  return { s, summary, earlier: all.filter((r) => r.dd < 0) };
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(path.join(ROOT, 'Planner_US.html')).href);
  await page.waitForTimeout(300);
  const R = Object.fromEntries(RUNS.map(([m, g]) => [`${m}/${g ? 'on' : 'off'}`, []]));
  for (const g of grid) {
    for (const [mode, guard] of RUNS) {
      const o = await page.evaluate((patch) => {
        const st = window.__test_getState();
        const saved = JSON.parse(JSON.stringify(st));
        try {
          Object.assign(st, patch);
          const s = window.__test_simulate(st.retireAgeA, st.retireAgeB);
          const tr = window.__test_accountTrace(st.retireAgeA, st.retireAgeB);
          const r = s.rows.at(-1), t = tr.at(-1);
          if (t.year !== r.year || tr.length !== s.rows.length) throw new Error('trace/rows mismatch');
          // Ending after-tax value: every account once, all traditional money (stock + bond bucket = tradPool) haircut 22%.
          const value = r.taxable + r.bonds + r.cash + r.roth + r.homeEquity + r.traditional - 0.22 * t.tradPool;
          const infl = st.inflation / 100;
          let cost = 0;
          for (const x of s.rows) cost += (x.tax + x.healthcare) / Math.pow(1 + infl, x.year);
          const choices = {};
          for (const x of s.rows) if (x.cliffChoice) choices[x.cliffChoice] = (choices[x.cliffChoice] || 0) + 1;
          return { value, cost, dep: s.depletedAge, choices };
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      }, patchOf(g, mode, guard));
      R[`${mode}/${guard ? 'on' : 'off'}`].push(o);
    }
  }
  await browser.close();
  const a = section('Default order', R['default/on'], R['default/off']);
  const b = section('Smooth withdrawals', R['smooth/on'], R['smooth/off']);
  const md = `# Cliff-guard sweep: ${grid.length} households per mode, tax-aware withdrawals off\n${a.s}${b.s}`;
  console.log(md);
  console.log('\nSummary (combined, better / equal / worse; depletion later / same / earlier):');
  console.log('  ' + a.summary);
  console.log('  ' + b.summary);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ grid, runs: R }));
  if (MD_OUT) fs.writeFileSync(MD_OUT, md);
  const earlier = [...a.earlier.map((r) => ['default', r]), ...b.earlier.map((r) => ['smooth', r])];
  if (earlier.length) {
    console.error(`\nFAIL: ${earlier.length} household(s) deplete EARLIER with the guard on:`);
    for (const [m, r] of earlier) console.error(`  ${m}: ${desc(r.g)}: ${fmt(r.a.dep)} (on) vs ${fmt(r.x.dep)} (off)`);
    process.exitCode = 1;
  } else console.log('OK: no household depletes earlier with the guard on.');
})();
