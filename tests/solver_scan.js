// Cliff-plan sweep (Batch 3C, cliff plan Task 8): 768 households, for the default withdrawal order and for smooth
// withdrawals (tax-aware withdrawals off in every run). Per household and mode:
//   - the plan: __test_refreshCliffPlan() (the kept family and the keep-rule report);
//   - standard: the plan applied (__test_simulateRaw) against `off` (__test_runPlanMode({ planMode: 'off' })): ending
//     after-tax value (__test_afterTaxEndValueUS), lifetime real tax + healthcare, depletion age; better / equal / worse,
//     p10 / median / p90, the cliff choices used and the 5 largest losses and gains;
//   - historical (every start year, as runHistoricalCycles) and seeded Monte Carlo (MC_PATHS paths, tests/snapshot.js's
//     mulberry32 + 5-year block bootstrap through __test_rowFnFor, seeds MC_SEED0 + i): success rates with and without
//     the plan, per-path earlier / later depletion counts;
//   - per path: the ending after-tax value with the plan and with `off` (priced inside __test_runPlanMode with the path's
//     own tax factors, `endValue: true`) and the ending Roth / traditional / taxable balances; per household the p10 /
//     median / p90 of (plan - off) / off, the paths where the plan is lower by more than $1 and the median Roth
//     difference; the 5 largest per-path losses across the grid;
//   - planStats over the historical and Monte Carlo runs (rothShift also on the standard run);
//   - from __test_planTrace(): the choose years whose lambda used a moved sample, and whether the family holding them
//     was kept or rejected by the keep rule.
// Everything except the standard depletion check is information (no gate). Exit code 1 if any household's plan run
// depletes earlier than `off` on the standard projection (rule A makes it impossible; the scan asserts it), or if a
// cross-check below fails. Not in `npm test` (about 800,000 projections; tens of minutes).
//
//   node tests/solver_scan.js [--root DIR] [--json OUT.json] [--md OUT.md] [--from N] [--limit N] [--mc N]
//
// Grid: 4 filings (MFJ couple, unmarried couple on two single returns, single person, single person with one
// child = head of household) x 4 ages (52, 58, 62, 66; both partners the same, retiring now) x traditional 500k /
// 1.5M (401(k), split evenly for a couple) x taxable 300k / 2M x spending 60k / 130k x elections (none, Rule of 55
// both, 72(t) on A's 401(k)) x conversions off / on (22% bracket, from now to 72); Roth IRA 200k (split), ACA on
// (enhanced credits off), Texas, life expectancy 95, cliff plan on.
// Measures: value = afterTaxEndValueUS (Roth, taxable, cash and home equity at face value, traditional net of the
// income tax on ten slices; 0 once the plan runs out); cost = sum of (tax + healthcare) / (1 + inflation)^year;
// depletion: never counts as the latest age. "Equal" = within $1,000. Percentiles are linear-interpolated.
// Shortcut: a household whose kept plan has no intents runs its paths once (`off`): apply with an empty plan is `off`
// exactly (tests/historical_parity.js); the first EMPTY_CHECKS such households also run apply and assert it.
// Cross-check: for the first HIST_CHECKS households with intents, __test_runHistoricalCycles() (the plan, then
// __test_setCliffPlan(null)) must give the same per-cycle depletion and ending total as the per-path runs.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const JSON_OUT = opt('--json', null);
const MD_OUT = opt('--md', null);
const LIMIT = Number(opt('--limit', 0)), FROM = Number(opt('--from', 0)); // testing: households FROM .. FROM + LIMIT - 1
const MC_PATHS = Number(opt('--mc', 200));
const MC_SEED0 = 1000;
const EMPTY_CHECKS = 5, HIST_CHECKS = 5;

let grid = [];
for (const filing of ['mfj', 'single-couple', 'single-person', 'hoh'])
  for (const age of [52, 58, 62, 66])
    for (const trad of [500000, 1500000])
      for (const taxable of [300000, 2000000])
        for (const spending of [60000, 130000])
          for (const elections of ['none', 'rule55', 'sepp'])
            for (const conv of [false, true]) grid.push({ filing, age, trad, taxable, spending, elections, conv });
if (LIMIT || FROM) grid = grid.slice(FROM, LIMIT ? FROM + LIMIT : undefined);

const patchOf = (g, mode) => ({
  ...(g.filing === 'mfj' ? { singlePerson: false, filingStatus: 'mfj' } : g.filing === 'single-couple' ? { singlePerson: false, filingStatus: 'single' } : { singlePerson: true }),
  children: g.filing === 'hoh' ? [{ birthYear: 2016, student: false }] : [],
  ageA: g.age, ageB: g.age, retireAgeA: g.age, retireAgeB: g.age, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: g.taxable, spending: g.spending,
  smoothWithdrawals: mode === 'smooth', withdrawalMixEnabled: false,
  rothConvEnabled: g.conv, rothConvStartAge: g.age, rothConvEndAge: Math.max(g.age, 72), rothConvBracket: 22,
  ruleOf55A: g.elections === 'rule55', ruleOf55B: g.elections === 'rule55', sepp72tK401A: g.elections === 'sepp',
  cliffGuardEnabled: true,
  ...legacyToAccounts({ traditional: g.trad, roth: 200000 }, { singlePerson: g.filing === 'single-person' || g.filing === 'hoh' }),
});

const MODES = ['default', 'smooth'];
const TOL = 1000;
const STAT_KEYS = ['intentYears', 'applied', 'skippedSide', 'skippedIneligible', 'fallback', 'absent', 'rothShift', 'irmaaStayUnders', 'irmaaZeroSaving'];
const depN = (d) => (d == null ? Infinity : d);
const fmt = (n) => (n == null ? 'never' : Math.round(n).toLocaleString('en-US'));
const sgn = (n) => (n > 0 ? '+' : '') + fmt(n);
const pc = (x) => (x !== x ? '-' : (x > 0 ? '+' : '') + (100 * x).toFixed(2) + '%');
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
const lineFamily = (id) => (id.startsWith('irmaa') ? 'irmaa' : id === 'senior' || id === 'ctc' ? 'tax' : 'aca');

// One household in one mode, in the page. Path tuple: [depPlan, depOff, valPlan, valOff, rothPlan, rothOff, tradPlan,
// tradOff, taxablePlan, taxableOff, totalPlan, totalOff].
const PAGE_RUN = ({ patch, mcPaths, mcSeed0, checkEmpty, checkHist }) => {
  const st = window.__test_getState();
  const saved = JSON.parse(JSON.stringify(st));
  const S = window.__test_planStats;
  const resetStats = () => { for (const k of Object.keys(S)) S[k] = 0; };
  const takeStats = () => ({ ...S });
  try {
    Object.assign(st, patch);
    const H = window.__test_HIST;
    if (!window.__scanMC || window.__scanMC.n !== mcPaths) {
      window.__scanMC = { n: mcPaths, fns: Array.from({ length: mcPaths }, (_, i) => window.__test_rowFnFor({ type: 'mc', seed: mcSeed0 + i })) };
    }
    const infl = st.inflation / 100;
    const costOf = (rows) => { let c = 0; for (const x of rows) c += (x.tax + x.healthcare) / Math.pow(1 + infl, x.year); return c; };
    const { plan, report } = window.__test_refreshCliffPlan();
    const nIntents = plan ? Object.keys(plan.intents).length : 0;
    // Standard: the plan applied (the raw hook: the state's own plan) against off.
    resetStats();
    const sp = window.__test_simulateRaw();
    const stdStats = takeStats();
    const so = window.__test_runPlanMode({ planMode: 'off' }).sim;
    const choices = {};
    for (const x of sp.rows) if (x.cliffChoice) choices[x.cliffChoice] = (choices[x.cliffChoice] || 0) + 1;
    const std = {
      plan: { value: window.__test_afterTaxEndValueUS(sp), cost: costOf(sp.rows), dep: sp.depletedAge, choices },
      off: { value: window.__test_afterTaxEndValueUS(so), cost: costOf(so.rows), dep: so.depletedAge },
    };
    // Moved-sample cross: the choose run's trace.
    const moved = [];
    for (const t of window.__test_planTrace()) if (t.movedSample) moved.push({ year: t.year, line: t.intent ? t.intent.line : null });
    // Paths.
    const projectionYears = st.singlePerson ? Math.max(0, st.lifeExpectancyA - st.ageA) : Math.max(0, st.lifeExpectancyA - st.ageA, st.lifeExpectancyB - st.ageB);
    const lastStart = H.length - 1 - projectionYears;
    const histFns = [];
    for (let i = 0; i <= lastStart; i++) histFns.push((y) => H[i + y]);
    const tuple = (a, b) => [a.depletedAge, b.depletedAge, a.value, b.value, a.estate.roth, b.estate.roth, a.estate.traditional, b.estate.traditional, a.estate.taxable, b.estate.taxable, a.rows.at(-1).total, b.rows.at(-1).total];
    const runSet = (fns) => {
      resetStats();
      const out = [];
      const applyToo = nIntents > 0 || checkEmpty;
      for (const rowFn of fns) {
        const b = window.__test_runPlanMode({ planMode: 'off', rowFn, endValue: true });
        const a = applyToo ? window.__test_runPlanMode({ planMode: 'apply', plan, rowFn, endValue: true }) : b;
        if (nIntents === 0 && checkEmpty && (a.depletedAge !== b.depletedAge || JSON.stringify(a.rows) !== JSON.stringify(b.rows)))
          throw new Error('empty plan differs from off on a path');
        out.push(tuple(a, b));
      }
      return { paths: out, stats: takeStats() };
    };
    const hist = runSet(histFns);
    const mc = runSet(window.__scanMC.fns);
    // Cross-check against runHistoricalCycles (the plan, then no plan).
    let histCheck = null;
    if (checkHist && nIntents > 0) {
      const withPlan = window.__test_runHistoricalCycles();
      window.__test_setCliffPlan(null);
      const without = window.__test_runHistoricalCycles();
      window.__test_refreshCliffPlan();
      const same = (cyc, k) => cyc.cycles.length === hist.paths.length && cyc.cycles.every((c, i) => c.depletedAge === hist.paths[i][k] && c.rows.at(-1).total === hist.paths[i][10 + k]);
      histCheck = { plan: same(withPlan, 0), off: same(without, 1), ratePlan: withPlan.successRate, rateOff: without.successRate };
    }
    return { kept: report ? report.kept : null, nIntents, families: report ? report.candidates.map((c) => c.family) : [], intents: plan ? plan.intents : {}, std, stdStats, moved, hist, mc, histCheck };
  } finally {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, saved);
  }
};

function compare(R, subset) {
  const rows = R.map((_, i) => i).filter(subset).map((i) => {
    const a = R[i].std.plan, x = R[i].std.off;
    return { g: grid[i], a, x, dv: a.value - x.value, dc: a.cost - x.cost, dd: depN(a.dep) - depN(x.dep) };
  });
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

function standardSection(title, R) {
  const subsets = [['conversions off', (i) => !grid[i].conv], ['conversions on', (i) => grid[i].conv], ['combined', () => true]];
  const res = subsets.map(([nm, f]) => [nm, compare(R, f)]);
  const t = (a) => a.map(sgn).join(' / ');
  let s = `\n## ${title}: standard projection (plan minus off)\n\n`;
  const kept = {};
  for (const r of R) kept[r.kept] = (kept[r.kept] || 0) + 1;
  s += `Kept family: ${Object.entries(kept).map(([k, n]) => `${k} ${n}`).join(', ')}. Households whose choose run had both families (four candidates): ${R.filter((r) => r.families.length === 4).length}.\n\n`;
  s += `### Ending after-tax value (positive = plan better)\n\n| Subset | n | Better / equal / worse | p10 / median / p90 | Neither depletes: n | Neither: better / equal / worse | Neither: p10 / median / p90 |\n|---|---|---|---|---|---|---|\n`;
  for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.value.slice(0, 3).join(' / ')} | ${t(r.value.slice(3))} | ${r.nBoth} | ${r.valueBoth.slice(0, 3).join(' / ')} | ${t(r.valueBoth.slice(3))} |\n`;
  s += `\n### Lifetime tax + healthcare, real (negative = plan better)\n\n| Subset | n | Better / equal / worse | p10 / median / p90 | Neither: better / equal / worse | Neither: p10 / median / p90 |\n|---|---|---|---|---|---|\n`;
  for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.cost.slice(0, 3).join(' / ')} | ${t(r.cost.slice(3))} | ${r.costBoth.slice(0, 3).join(' / ')} | ${t(r.costBoth.slice(3))} |\n`;
  s += `\n### Depletion age (years; positive = plan later)\n\n| Subset | n | Later / same / earlier | Both deplete: n | Both deplete: p10 / median / p90 |\n|---|---|---|---|---|\n`;
  for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.dep.slice(0, 3).join(' / ')} | ${r.dep[3]} | ${r.dep[3] ? r.dep.slice(4).map((v) => v.toFixed(1)).join(' / ') : '-'} |\n`;
  const all = res[2][1].rows;
  const tally = (rs) => {
    const c = {};
    for (const r of rs) for (const l of Object.keys(r.a.choices || {})) c[l] = (c[l] || 0) + 1;
    const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
    return e.length ? e.map(([l, n]) => `${l} (${n})`).join(', ') : 'none';
  };
  const losers = all.filter((r) => r.dv < -TOL), winners = all.filter((r) => r.dv > TOL);
  s += `\nCliff choices in the plan run (households using each label at least once):\n- value worse (${losers.length}): ${tally(losers)}\n- value better (${winners.length}): ${tally(winners)}\n`;
  const hdr = `| Household | Value plan-off | Value plan / off | Cost plan-off | Cost plan / off | Depletion plan / off | Cliff choices (years) |\n|---|---|---|---|---|---|---|\n`;
  const line = (r) => `| ${desc(r.g)} | ${sgn(r.dv)} | ${fmt(r.a.value)} / ${fmt(r.x.value)} | ${sgn(r.dc)} | ${fmt(r.a.cost)} / ${fmt(r.x.cost)} | ${fmt(r.a.dep)} / ${fmt(r.x.dep)} | ${chStr(r.a.choices)} |\n`;
  const byV = [...all].sort((a, b) => a.dv - b.dv), byC = [...all].sort((a, b) => b.dc - a.dc);
  s += `\n### 5 largest losses by value\n\n${hdr}${byV.slice(0, 5).map(line).join('')}`;
  s += `\n### 5 largest gains by value\n\n${hdr}${byV.slice(-5).reverse().map(line).join('')}`;
  s += `\n### 5 largest losses by cost (plan pays more)\n\n${hdr}${byC.slice(0, 5).map(line).join('')}`;
  s += `\n### 5 largest gains by cost (plan pays less)\n\n${hdr}${byC.slice(-5).reverse().map(line).join('')}`;
  const c = res[2][1];
  const summary = `${title}: value ${c.value.slice(0, 3).join(' / ')}, cost ${c.cost.slice(0, 3).join(' / ')}, depletion ${c.dep.slice(0, 3).join(' / ')}`;
  return { s, summary, earlier: all.filter((r) => r.dd < 0) };
}

// Per-path summaries of one path set of one household.
function pathSummary(paths) {
  const n = paths.length;
  const okPlan = paths.filter((p) => p[0] == null).length, okOff = paths.filter((p) => p[1] == null).length;
  const earlier = paths.filter((p) => depN(p[0]) < depN(p[1])).length, later = paths.filter((p) => depN(p[0]) > depN(p[1])).length;
  const rel = paths.filter((p) => p[3] > 1).map((p) => (p[2] - p[3]) / p[3]);
  const lower = paths.filter((p) => p[2] < p[3] - 1).length, higher = paths.filter((p) => p[2] > p[3] + 1).length;
  const rothD = paths.map((p) => p[4] - p[5]);
  return { n, ratePlan: okPlan / n, rateOff: okOff / n, earlier, later, relN: rel.length, p10: pctl(rel, 0.1), med: pctl(rel, 0.5), p90: pctl(rel, 0.9), lower, higher, rothMed: pctl(rothD, 0.5) };
}

function pathsSection(title, R) {
  let s = `\n## ${title}: historical and Monte Carlo paths (plan minus off; information only)\n\n`;
  const withPlan = R.map((r, i) => [r, i]).filter(([r]) => r.nIntents > 0);
  s += `${withPlan.length} of ${R.length} households keep intents; the others are \`off\` on every path (empty plan).\n\n`;
  for (const kind of ['hist', 'mc']) {
    const label = kind === 'hist' ? 'Historical (every start year)' : `Monte Carlo (${MC_PATHS} seeded paths)`;
    const sums = withPlan.map(([r, i]) => ({ i, r, ps: pathSummary(r[kind].paths) }));
    const dRate = sums.map((x) => x.ps.ratePlan - x.ps.rateOff);
    const tot = (f) => sums.reduce((a, x) => a + f(x.ps), 0);
    s += `### ${label}\n\n`;
    s += `Success rate, households keeping intents: plan higher / same / lower: ${dRate.filter((d) => d > 1e-12).length} / ${dRate.filter((d) => Math.abs(d) <= 1e-12).length} / ${dRate.filter((d) => d < -1e-12).length}; `;
    s += `mean rate with / without the plan: ${sums.length ? ((100 * tot((p) => p.ratePlan)) / sums.length).toFixed(2) : '-'}% / ${sums.length ? ((100 * tot((p) => p.rateOff)) / sums.length).toFixed(2) : '-'}%; `;
    s += `difference p10 / median / p90: ${[0.1, 0.5, 0.9].map((q) => pc(pctl(dRate, q))).join(' / ')}.\n`;
    s += `Paths (all households keeping intents): ${tot((p) => p.n)}; the plan depletes earlier on ${tot((p) => p.earlier)}, later on ${tot((p) => p.later)}; lower after-tax value by more than $1 on ${tot((p) => p.lower)}, higher on ${tot((p) => p.higher)}.\n`;
    const allRel = [];
    for (const [r] of withPlan) for (const p of r[kind].paths) if (p[3] > 1) allRel.push((p[2] - p[3]) / p[3]);
    s += `(plan - off) / off over all those paths: p10 / median / p90 ${[0.1, 0.5, 0.9].map((q) => pc(pctl(allRel, q))).join(' / ')}.\n\n`;
    s += `| Household | Kept | Paths | Success plan / off | Earlier / later | (plan-off)/off p10 / median / p90 | Lower by > $1 | Median Roth diff |\n|---|---|---|---|---|---|---|---|\n`;
    for (const { i, r, ps } of sums)
      s += `| ${desc(grid[i])} | ${r.kept} (${r.nIntents}) | ${ps.n} | ${(100 * ps.ratePlan).toFixed(1)}% / ${(100 * ps.rateOff).toFixed(1)}% | ${ps.earlier} / ${ps.later} | ${pc(ps.p10)} / ${pc(ps.med)} / ${pc(ps.p90)} | ${ps.lower} | ${sgn(ps.rothMed)} |\n`;
    s += '\n';
  }
  return s;
}

function lossesSection(byMode) {
  const L = [];
  for (const [mode, R] of byMode)
    R.forEach((r, i) => {
      if (!r.nIntents) return;
      for (const kind of ['hist', 'mc'])
        r[kind].paths.forEach((p, j) => {
          if (p[2] < p[3]) L.push({ mode, i, kind, j, p, loss: p[3] - p[2] });
        });
    });
  L.sort((a, b) => b.loss - a.loss);
  let s = `\n## 5 largest per-path losses across the grid (after-tax value, plan below off)\n\n| Mode | Household | Path | Value plan / off | Loss | Roth diff | Traditional diff | Taxable diff | Depletion plan / off |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const x of L.slice(0, 5)) {
    const p = x.p, pathName = x.kind === 'hist' ? `historical start ${1928 + x.j}` : `Monte Carlo seed ${MC_SEED0 + x.j}`;
    s += `| ${x.mode} | ${desc(grid[x.i])} | ${pathName} | ${fmt(p[2])} / ${fmt(p[3])} | ${fmt(x.loss)} | ${sgn(p[4] - p[5])} | ${sgn(p[6] - p[7])} | ${sgn(p[8] - p[9])} | ${fmt(p[0])} / ${fmt(p[1])} |\n`;
  }
  return s;
}

function statsSection(byMode) {
  let s = `\n## planStats (sums over households; rothShift in dollars)\n\n| Mode | Runs | ${STAT_KEYS.join(' | ')} |\n|---|---|${STAT_KEYS.map(() => '---').join('|')}|\n`;
  for (const [mode, R] of byMode) {
    for (const kind of ['std', 'hist', 'mc']) {
      const sum = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
      for (const r of R) {
        const st = kind === 'std' ? r.stdStats : r[kind].stats;
        for (const k of STAT_KEYS) sum[k] += st[k] || 0;
      }
      const runs = kind === 'std' ? 'standard' : kind === 'hist' ? 'historical' : 'Monte Carlo';
      s += `| ${mode} | ${runs} | ${STAT_KEYS.map((k) => (k === 'rothShift' ? sgn(sum[k]) : sum[k])).join(' | ')} |\n`;
    }
  }
  s += `\nPer run, an intent year is applied, skipped (wrong side of the line, or the trial is not eligible), a fallback, or absent (the line is out of reach on that path). rothShift: Roth dollars the stay-unders drew beyond the natural year's (standard: the plan's own projection).\n`;
  return s;
}

function movedSection(byMode) {
  let s = `\n## Moved-sample cross (choose run: lambda samples moved to the year the walk empties the pool)\n\n| Mode | Households with moved-sample years | Moved-sample years | ... in intent years | Households: family with moved-sample years kept | ... rejected |\n|---|---|---|---|---|---|\n`;
  for (const [mode, R] of byMode) {
    let hh = 0, years = 0, intentYears = 0, kept = 0, rejected = 0;
    for (const r of R) {
      if (!r.moved.length) continue;
      hh++;
      years += r.moved.length;
      const fams = new Set();
      for (const m of r.moved) if (m.line) { intentYears++; fams.add(lineFamily(m.line)); }
      let k = false, rej = false;
      for (const f of fams) {
        if (r.kept === 'all' || r.kept === f) k = true;
        else rej = true;
      }
      if (k) kept++;
      if (rej) rejected++;
    }
    s += `| ${mode} | ${hh} | ${years} | ${intentYears} | ${kept} | ${rejected} |\n`;
  }
  return s;
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForTimeout(300);
  const R = Object.fromEntries(MODES.map((m) => [m, []]));
  let emptyChecks = 0, histChecks = 0;
  const failures = [];
  for (const [gi, g] of grid.entries()) {
    for (const mode of MODES) {
      const o = await page.evaluate(PAGE_RUN, { patch: patchOf(g, mode), mcPaths: MC_PATHS, mcSeed0: MC_SEED0, checkEmpty: emptyChecks < EMPTY_CHECKS, checkHist: histChecks < HIST_CHECKS });
      if (o.nIntents === 0 && emptyChecks < EMPTY_CHECKS) emptyChecks++;
      if (o.histCheck) {
        histChecks++;
        if (!o.histCheck.plan || !o.histCheck.off) failures.push(`runHistoricalCycles cross-check: ${mode} ${desc(g)}: ${JSON.stringify(o.histCheck)}`);
      }
      R[mode].push(o);
    }
    if ((gi + 1) % 32 === 0) process.stderr.write(`  ${gi + 1} / ${grid.length} households (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  }
  await browser.close();
  const byMode = MODES.map((m) => [m, R[m]]);
  const a = standardSection('Default order', R.default), b = standardSection('Smooth withdrawals', R.smooth);
  let md = `# Cliff-plan sweep: ${grid.length} households per mode, tax-aware withdrawals off\n`;
  md += `\nCross-checks: ${emptyChecks} empty-plan households ran apply on every path and matched off; ${histChecks} households with intents matched __test_runHistoricalCycles with and without the plan.\n`;
  md += a.s + b.s;
  md += pathsSection('Default order', R.default) + pathsSection('Smooth withdrawals', R.smooth);
  md += lossesSection(byMode) + statsSection(byMode) + movedSection(byMode);
  console.log(md);
  console.log('\nSummary (combined, better / equal / worse; depletion later / same / earlier):');
  console.log('  ' + a.summary);
  console.log('  ' + b.summary);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ grid, mcPaths: MC_PATHS, mcSeed0: MC_SEED0, runs: R }));
  if (MD_OUT) fs.writeFileSync(MD_OUT, md);
  if (errors.length) failures.push('page errors: ' + errors.join('; '));
  const earlier = [...a.earlier.map((r) => ['default', r]), ...b.earlier.map((r) => ['smooth', r])];
  if (earlier.length) {
    console.error(`\nFAIL: ${earlier.length} household(s) deplete EARLIER with the plan than off on the standard projection:`);
    for (const [m, r] of earlier) console.error(`  ${m}: ${desc(r.g)}: ${fmt(r.a.dep)} (plan) vs ${fmt(r.x.dep)} (off)`);
    process.exitCode = 1;
  } else console.log('OK: no household depletes earlier with the plan on the standard projection.');
  if (failures.length) {
    console.error('\nFAIL:\n  ' + failures.join('\n  '));
    process.exitCode = 1;
  }
})();
