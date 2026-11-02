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
// Batch 5 step 3a: per household and mode, the bracket search on against off (__test_setBracketSearch(on) then
// __test_refreshCliffPlan(); the kept bracket, and the kept plan's standard depletion age and first home-draw age beside the
// user's-bracket plan's), and with the search on, the guard on against off. An earlier depletion or an earlier first home draw
// under the kept plan than under the user's bracket counts like an earlier depletion (exit 1, standard projection). The grid
// gains the first 48 conversions-on households with Rhode Island and with Pennsylvania (owner decision 16): 864 households.
//
// Batch 5 step 4c: --order also plans and runs every household and mode with `withdrawalMixEnabled: true` (the order lever in the
// automatic plan; the bracket search on, as the kept plan) and prints "Order lever (toggle on) vs toggle off, standard projection"
// per mode: the kept toggle-on plan against the kept toggle-off plan (not against `off`), value and cost better / equal / worse with
// p10 / median / p90 (all, and neither depletes), depletion and first home draw later / same / earlier, by conversions off / on /
// combined, on all households and on the 3C rows (the 768 of the first grid: the rows without the RI / PA `stateTax` that the
// additions above carry in their `g`); the kept `orderPhases` counts; the 5 largest losses and gains; 3C's five households with
// their depletion ages; and the two costs the yearly score cannot see, summed over the years after each household's first order
// year: the MAGI (`magiProxy`) and the healthcare (the rows record no IRMAA field, so IRMAA is inside `healthcare`), toggle on
// against toggle off, real dollars. Exit 1 if any household depletes, or first draws on the house, earlier with the toggle on than
// off (A2 of the plan makes that impossible; the scan asserts it). Without --order nothing here runs and the output is unchanged.
// Batch 5 step 4d: the same section also counts the households and years whose toggle-on plan keeps a split (`plan.splits`, by the
// partner drawn first; a count only).
//
// Batch 5 step 5b piece 3: --sizing also plans every household and mode with the per-year conversion sizing on
// (__test_setConversionSizing(true)), the bracket search on, and prints "Conversion sizing" per mode: the sized plan
// against the bracket plan (sizing off) on the standard projection (depletion and first home draw later / same / earlier, with the
// count of households that keep a sized plan: report.sized.kept), the guard on against off with sizing on (B9.3), and the historical
// and Monte Carlo success rates (information, not a gate) of the bracket plan, the sized plan and the guard off. Exit 1 if a sized
// plan depletes, or first draws on the house, earlier than the bracket plan (the keep rule makes it impossible; the scan asserts
// it). --no-sizing leaves the section out; neither flag: the shipped switch decides (on once sizing ships on). --conv-only restricts
// the grid to the conversions-on households (the half sizing acts on; 384 per mode plus the RI / PA 96).
//
// --dump OUT.json writes, per household and mode, { id, mode, runOut, firstHomeDraw, endValue, conv, inv, path } (id: the household's description, which
// carries the RI / PA variant, never a grid index; runOut / firstHomeDraw: an age or null for never; endValue: the after-tax end value
// of the run through __test_runPlanMode({ endValue: true }); conv, inv: that run's yearly Roth conversions and investable end balances in whole dollars; path: a hash of its whole
// yearly path, tests/helpers/path-fingerprint.js) of the sizing-on plan with --sizing, else of the bracket plan, for
// tests/compare_household_dumps.js. The output and the exit code are the same with or without it.
//
//   node tests/solver_scan.js [--root DIR] [--json OUT.json] [--md OUT.md] [--dump OUT.json] [--from N] [--limit N] [--mc N] [--order] [--sizing | --no-sizing] [--conv-only]
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
// exactly (tests/unit/us/historical-parity.test.js); the first EMPTY_CHECKS such households also run apply and assert it.
// Cross-check: for the first HIST_CHECKS households with intents, __test_runHistoricalCycles() (the plan, then
// __test_setCliffPlan(null)) must give the same per-cycle depletion and ending total as the per-path runs.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const { installPathFingerprint } = require('./helpers/path-fingerprint');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const JSON_OUT = opt('--json', null);
const MD_OUT = opt('--md', null);
const DUMP_OUT = opt('--dump', null);
const LIMIT = Number(opt('--limit', 0)), FROM = Number(opt('--from', 0)); // testing: households FROM .. FROM + LIMIT - 1
const MC_PATHS = Number(opt('--mc', 200));
const ORDER = args.includes('--order');
// --sizing / --no-sizing override the shipped switch (src/us/core/test-hooks.js of the --root tree, read in main; Fable I-1).
if (args.includes('--sizing') && args.includes('--no-sizing')) throw new Error('--sizing and --no-sizing together');
let SIZING = args.includes('--sizing') ? true : args.includes('--no-sizing') ? false : undefined;
const CONV_ONLY = args.includes('--conv-only');
const MC_SEED0 = 1000;
const EMPTY_CHECKS = 5, HIST_CHECKS = 5;

// The grid and each household's patch come from tests/unit/helpers/scan-grid.mjs (loaded in main); grid holds the households' own fields.
let grid = [];
const NAMES = new Map(); // household fields -> the one-line description
const PATCHES = {}; // mode -> patches, parallel to grid

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
const desc = (g) => NAMES.get(g);
const chStr = (c) => { const e = Object.entries(c || {}); return e.length ? e.map(([l, n]) => `${l} x${n}`).join('; ') : '-'; };
const lineFamily = (id) => (id.startsWith('irmaa') ? 'irmaa' : id === 'senior' || id === 'ctc' ? 'tax' : 'aca');

// One household in one mode, in the page. Path tuple: [depPlan, depOff, valPlan, valOff, rothPlan, rothOff, tradPlan,
// tradOff, taxablePlan, taxableOff, totalPlan, totalOff].
const PAGE_RUN = ({ patch, mcPaths, mcSeed0, checkEmpty, checkHist, order, sizing, dump }) => {
  const st = window.__test_getState();
  const saved = JSON.parse(JSON.stringify(st));
  const S = window.__test_planStats;
  const resetStats = () => { for (const k of Object.keys(S)) S[k] = 0; };
  const takeStats = () => ({ ...S });
  const wasSearch = window.__test_setBracketSearch(false); // returns the switch as it stood, to put back
  const wasSizing = window.__test_setConversionSizing(false);
  try {
    Object.assign(st, patch);
    const H = window.__test_HIST;
    if (!window.__scanMC || window.__scanMC.n !== mcPaths) {
      window.__scanMC = { n: mcPaths, fns: Array.from({ length: mcPaths }, (_, i) => window.__test_rowFnFor({ type: 'mc', seed: mcSeed0 + i })) };
    }
    const infl = st.inflation / 100;
    const costOf = (rows) => { let c = 0; for (const x of rows) c += (x.taxSettled !== undefined ? x.taxSettled + x.healthcareSettled : x.tax + x.healthcare) / Math.pow(1 + infl, x.year); return c; };
    // The bracket search off, then on (the kept plan): standard depletion and first home-draw age under each, then the guard off
    // with the search on. homeDrawAge is non-enumerable on a run, so it is read here, before serialization.
    window.__test_setBracketSearch(false);
    window.__test_refreshCliffPlan();
    const sU = window.__test_simulateRaw();
    const userBracket = { dep: sU.depletedAge, home: sU.homeDrawAge, value: window.__test_afterTaxEndValueUS(sU) };
    window.__test_setBracketSearch(true);
    const { plan, report } = window.__test_refreshCliffPlan();
    const keptBracket = plan ? plan.bracket : null;
    const nIntents = plan ? Object.keys(plan.intents).length : 0;
    // A plan with no intents and the user's own bracket is `off` exactly; one that kept another bracket is not.
    const active = nIntents > 0 || (plan != null && plan.bracket != null && plan.bracket !== st.rothConvBracket);
    // Standard: the plan applied (the raw hook: the state's own plan) against off.
    resetStats();
    window.__test_setBracketSearch(true);
    window.__test_refreshCliffPlan();
    const sp = window.__test_simulateRaw();
    const keptHome = sp.homeDrawAge;
    const stdStats = takeStats();
    const so = window.__test_runPlanMode({ planMode: 'off' }).sim;
    // The guard off, search on (conversions at the user's bracket, no steering).
    st.cliffGuardEnabled = false;
    const sg = window.__test_simulateRaw();
    const guardOff = { dep: sg.depletedAge, home: sg.homeDrawAge };
    st.cliffGuardEnabled = patch.cliffGuardEnabled === undefined ? saved.cliffGuardEnabled : patch.cliffGuardEnabled;
    const choices = {};
    for (const x of sp.rows) if (x.cliffChoice) choices[x.cliffChoice] = (choices[x.cliffChoice] || 0) + 1;
    const std = {
      plan: { value: window.__test_afterTaxEndValueUS(sp), cost: costOf(sp.rows), dep: sp.depletedAge, home: keptHome, choices },
      off: { value: window.__test_afterTaxEndValueUS(so), cost: costOf(so.rows), dep: so.depletedAge, home: so.homeDrawAge },
      userBracket, keptBracket, guardOff, userBracketSetting: st.rothConvBracket,
    };
    if (dump) Object.assign(std.plan, window.__pathFp(sp.rows));
    // Batch 5 step 4c (--order): the same household with the toggle on, the kept plan (search on) against the toggle-off kept plan `sp`.
    let ord = null;
    if (order) {
      const real = (x) => 1 / Math.pow(1 + infl, x.year);
      const hc = (x) => (x.healthcareSettled !== undefined ? x.healthcareSettled : x.healthcare);
      st.withdrawalMixEnabled = true;
      const { plan: p2 } = window.__test_refreshCliffPlan();
      const s2 = window.__test_simulateRaw();
      const first = s2.rows.find((x) => x.drawOrder !== undefined);
      const after = (rows, y) => rows.filter((x) => x.year > y);
      const sum = (rows, f) => rows.reduce((a, x) => a + f(x) * real(x), 0);
      ord = {
        on: { value: window.__test_afterTaxEndValueUS(s2), cost: costOf(s2.rows), dep: s2.depletedAge, home: s2.homeDrawAge },
        orders: p2 && p2.orders ? Object.keys(p2.orders).length : 0, phases: p2 && p2.orderPhases ? p2.orderPhases.length : 0,
        splitsA: p2 && p2.splits ? Object.values(p2.splits).filter((v) => v === 'A').length : 0,
        splitsB: p2 && p2.splits ? Object.values(p2.splits).filter((v) => v === 'B').length : 0,
        firstOrderYear: first ? first.year : null,
        magiOn: first ? sum(after(s2.rows, first.year), (x) => x.magiProxy) : 0, magiOff: first ? sum(after(sp.rows, first.year), (x) => x.magiProxy) : 0,
        hcOn: first ? sum(after(s2.rows, first.year), hc) : 0, hcOff: first ? sum(after(sp.rows, first.year), hc) : 0,
      };
      st.withdrawalMixEnabled = patch.withdrawalMixEnabled === undefined ? saved.withdrawalMixEnabled : patch.withdrawalMixEnabled;
      window.__test_refreshCliffPlan();
    }
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
      const applyToo = active || checkEmpty;
      for (const rowFn of fns) {
        const b = window.__test_runPlanMode({ planMode: 'off', rowFn, endValue: true });
        const a = applyToo ? window.__test_runPlanMode({ planMode: 'apply', plan, rowFn, endValue: true }) : b;
        if (!active && checkEmpty && (a.depletedAge !== b.depletedAge || JSON.stringify(a.rows) !== JSON.stringify(b.rows)))
          throw new Error('empty plan differs from off on a path');
        out.push(tuple(a, b));
      }
      return { paths: out, stats: takeStats() };
    };
    const hist = runSet(histFns);
    const mc = runSet(window.__scanMC.fns);
    // Cross-check against runHistoricalCycles (the plan, then no plan).
    let histCheck = null;
    if (checkHist && active) {
      const withPlan = window.__test_runHistoricalCycles();
      window.__test_setCliffPlan(null);
      const without = window.__test_runHistoricalCycles();
      window.__test_refreshCliffPlan();
      const same = (cyc, k) => cyc.cycles.length === hist.paths.length && cyc.cycles.every((c, i) => c.depletedAge === hist.paths[i][k] && c.rows.at(-1).total === hist.paths[i][10 + k]);
      histCheck = { plan: same(withPlan, 0), off: same(without, 1), ratePlan: withPlan.successRate, rateOff: without.successRate };
    }
    // Batch 5 step 5b piece 3 (--sizing): the sized plan (search on, sizing on) against the bracket plan `sp` / `plan` above.
    let sized = null;
    if (sizing) {
      const guardSetting = st.cliffGuardEnabled;
      window.__test_setConversionSizing(true);
      const { plan: p3, report: r3 } = window.__test_refreshCliffPlan();
      const keptSized = !!(r3 && r3.sized && r3.sized.kept);
      const s3 = window.__test_simulateRaw();
      const sized0 = { kept: keptSized, ran: !!(r3 && r3.sized), nConv: p3 && p3.conv ? Object.keys(p3.conv).length : 0, dep: s3.depletedAge, home: s3.homeDrawAge, value: window.__test_afterTaxEndValueUS(s3), cost: costOf(s3.rows) };
      // Guard off with sizing on (B9.3): sizing needs the guard, so this is the user's-bracket run.
      st.cliffGuardEnabled = false;
      const sg3 = window.__test_simulateRaw();
      sized0.guardOff = { dep: sg3.depletedAge, home: sg3.homeDrawAge };
      st.cliffGuardEnabled = guardSetting;
      // Success rates on the historical and Monte Carlo paths: the bracket plan, the sized plan, the guard off (the user's bracket).
      // A household whose sized track is not kept has the bracket plan as its sized plan: its paths are not run twice.
      const rates = (fns) => {
        let bracket = 0, sizedN = 0, off = 0;
        for (const rowFn of fns) {
          const bRun = window.__test_runPlanMode({ planMode: 'apply', plan, rowFn, endValue: true });
          const sRun = keptSized ? window.__test_runPlanMode({ planMode: 'apply', plan: p3, rowFn, endValue: true }) : bRun;
          st.cliffGuardEnabled = false;
          const oRun = window.__test_runPlanMode({ planMode: 'off', rowFn, endValue: true });
          st.cliffGuardEnabled = guardSetting;
          if (bRun.depletedAge == null) bracket++;
          if (sRun.depletedAge == null) sizedN++;
          if (oRun.depletedAge == null) off++;
        }
        return { n: fns.length, bracket, sized: sizedN, off };
      };
      if (keptSized) {
        sized0.hist = rates(histFns);
        sized0.mc = rates(window.__scanMC.fns);
      }
      if (dump) {
        const fin = window.__test_runPlanMode({ planMode: p3 ? 'apply' : 'off', plan: p3, endValue: true });
        sized0.endValue = fin.value;
        Object.assign(sized0, window.__pathFp(fin.rows));
      }
      sized = sized0;
      window.__test_setConversionSizing(false);
      window.__test_refreshCliffPlan();
    }
    return { ...(order ? { ord } : {}), ...(sizing ? { sized } : {}), kept: report ? report.kept : null, nIntents, active, families: report ? report.candidates.map((c) => c.family) : [], intents: plan ? plan.intents : {}, std, stdStats, moved, hist, mc, histCheck };
  } finally {
    window.__test_setBracketSearch(wasSearch);
    window.__test_setConversionSizing(wasSizing);
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, saved);
  }
};

function compare(R, subset, pick = (r) => [r.std.plan, r.std.off]) {
  const rows = R.map((_, i) => i).filter(subset).map((i) => {
    const [a, x] = pick(R[i]);
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
  // both families by membership, not by count: since S1 Task 2g stage 0 can add a second `all` (the superset of the met stay-unders)
  s += `Kept family: ${Object.entries(kept).map(([k, n]) => `${k} ${n}`).join(', ')}. Households whose choose run had both families (the aca and irmaa subsets among the candidates): ${R.filter((r) => r.families.includes('aca') && r.families.includes('irmaa')).length}.\n\n`;
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
  const lossV = byV.slice(0, 5).filter((x) => x.dv < 0);
  s += `\n### 5 largest losses by value\n\n${lossV.length ? hdr + lossV.map(line).join('') : 'none\n'}`;
  s += `\n### 5 largest gains by value\n\n${hdr}${byV.slice(-5).reverse().map(line).join('')}`;
  const lossC = byC.slice(0, 5).filter((x) => x.dc > 0);
  s += `\n### 5 largest losses by cost (plan pays more)\n\n${lossC.length ? hdr + lossC.map(line).join('') : 'none\n'}`;
  s += `\n### 5 largest gains by cost (plan pays less)\n\n${hdr}${byC.slice(-5).reverse().map(line).join('')}`;
  const c = res[2][1];
  const summary = `${title}: value ${c.value.slice(0, 3).join(' / ')}, cost ${c.cost.slice(0, 3).join(' / ')}, depletion ${c.dep.slice(0, 3).join(' / ')}`;
  return { s, summary, earlier: all.filter((r) => r.dd < 0) };
}

// Batch 5 step 4c (--order): the toggle-on kept plan against the toggle-off kept plan on the standard projection (see the header).
// `earlier` lists the households that deplete or first draw on the house earlier with the toggle on (A2 makes it impossible).
const is3C = (g) => g.stateTax === undefined;
const FIVE = [
  ['single 58, trad 500k, taxable 2M, spending 130k', (g) => g.filing === 'single-person' && g.age === 58 && g.trad === 500000 && g.taxable === 2000000 && g.spending === 130000],
  ['single 66, trad 1.5M, taxable 300k, spending 130k', (g) => g.filing === 'single-person' && g.age === 66 && g.trad === 1500000 && g.taxable === 300000 && g.spending === 130000],
  ['HoH 58, trad 500k, taxable 2M, spending 130k', (g) => g.filing === 'hoh' && g.age === 58 && g.trad === 500000 && g.taxable === 2000000 && g.spending === 130000],
  ['HoH 62, trad 500k, taxable 300k, spending 60k, conversions on', (g) => g.filing === 'hoh' && g.age === 62 && g.trad === 500000 && g.taxable === 300000 && g.spending === 60000 && g.conv],
  ['HoH 66, trad 1.5M, taxable 300k, spending 130k, conversions on', (g) => g.filing === 'hoh' && g.age === 66 && g.trad === 1500000 && g.taxable === 300000 && g.spending === 130000 && g.conv],
];
function orderSection(title, R) {
  const pick = (r) => [r.ord.on, r.std.plan];
  const t = (a) => a.map(sgn).join(' / ');
  let s = `\n## ${title}: order lever (toggle on) vs toggle off, standard projection (toggle on minus toggle off; the kept plans)\n\n`;
  const cmp = (a, b) => (depN(a) > depN(b) ? 'later' : depN(a) < depN(b) ? 'earlier' : 'same');
  const sets = [['all', () => true], ['3C rows (no RI / PA additions)', (i) => is3C(grid[i])]];
  for (const [setName, inSet] of sets) {
    const subsets = [['conversions off', (i) => inSet(i) && !grid[i].conv], ['conversions on', (i) => inSet(i) && grid[i].conv], ['combined', (i) => inSet(i)]];
    const res = subsets.map(([nm, f]) => [nm, compare(R, f, pick)]);
    s += `### ${setName}: ending after-tax value (positive = toggle on better)\n\n| Subset | n | Better / equal / worse | p10 / median / p90 | Neither depletes: n | Neither: better / equal / worse | Neither: p10 / median / p90 |\n|---|---|---|---|---|---|---|\n`;
    for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.value.slice(0, 3).join(' / ')} | ${t(r.value.slice(3))} | ${r.nBoth} | ${r.valueBoth.slice(0, 3).join(' / ')} | ${t(r.valueBoth.slice(3))} |\n`;
    s += `\n### ${setName}: lifetime tax + healthcare, real (negative = toggle on better)\n\n| Subset | n | Better / equal / worse | p10 / median / p90 | Neither: better / equal / worse | Neither: p10 / median / p90 |\n|---|---|---|---|---|---|\n`;
    for (const [nm, r] of res) s += `| ${nm} | ${r.n} | ${r.cost.slice(0, 3).join(' / ')} | ${t(r.cost.slice(3))} | ${r.costBoth.slice(0, 3).join(' / ')} | ${t(r.costBoth.slice(3))} |\n`;
    s += `\n### ${setName}: depletion age and first home draw (toggle on later / same / earlier)\n\n| Subset | n | Depletion later / same / earlier | First home draw later / same / earlier |\n|---|---|---|---|\n`;
    for (const [nm, f] of subsets) {
      const idx = R.map((_, i) => i).filter(f);
      const tally = (g) => { const c = { later: 0, same: 0, earlier: 0 }; for (const i of idx) c[cmp(...g(R[i]))]++; return `${c.later} / ${c.same} / ${c.earlier}`; };
      s += `| ${nm} | ${idx.length} | ${tally((r) => [r.ord.on.dep, r.std.plan.dep])} | ${tally((r) => [r.ord.on.home, r.std.plan.home])} |\n`;
    }
    s += '\n';
  }
  const all = R.map((r, i) => ({ r, g: grid[i] }));
  const withOrders = all.filter((x) => x.r.ord.orders > 0);
  const phaseCount = {};
  for (const x of withOrders) phaseCount[x.r.ord.phases] = (phaseCount[x.r.ord.phases] || 0) + 1;
  s += `Kept orders: ${withOrders.length} of ${all.length} households keep at least one order (${all.filter((x) => is3C(x.g) && x.r.ord.orders > 0).length} of ${all.filter((x) => is3C(x.g)).length} on the 3C rows); orderPhases kept (households by phase count): ${Object.entries(phaseCount).map(([k, n]) => `${k} phase(s) ${n}`).join(', ') || 'none'}; order years kept in total: ${withOrders.reduce((a, x) => a + x.r.ord.orders, 0)}.\n\n`;
  const withSplits = all.filter((x) => x.r.ord.splitsA + x.r.ord.splitsB > 0);
  const twoRet = all.filter((x) => x.g.filing === 'single-couple');
  s += `Kept splits (Batch 5 step 4d): ${withSplits.length} of ${all.length} households keep at least one split year (${withSplits.filter((x) => x.g.conv).length} with conversions on; ${twoRet.length} households file two returns); split years kept in total: ${withSplits.reduce((a, x) => a + x.r.ord.splitsA + x.r.ord.splitsB, 0)} (A first ${withSplits.reduce((a, x) => a + x.r.ord.splitsA, 0)}, B first ${withSplits.reduce((a, x) => a + x.r.ord.splitsB, 0)}); households keeping both an order and a split: ${withSplits.filter((x) => x.r.ord.orders > 0).length}.

`;
  const rows = compare(R, () => true, pick).rows;
  const hdr = `| Household | Value on-off | Value on / off | Cost on-off | Cost on / off | Depletion on / off | Orders (phases) |\n|---|---|---|---|---|---|---|\n`;
  const line = (r) => { const o = R[grid.indexOf(r.g)].ord; return `| ${desc(r.g)} | ${sgn(r.dv)} | ${fmt(r.a.value)} / ${fmt(r.x.value)} | ${sgn(r.dc)} | ${fmt(r.a.cost)} / ${fmt(r.x.cost)} | ${fmt(r.a.dep)} / ${fmt(r.x.dep)} | ${o.orders} (${o.phases}) |\n`; };
  const byV = [...rows].sort((a, b) => a.dv - b.dv), byC = [...rows].sort((a, b) => b.dc - a.dc);
  const lossV2 = byV.slice(0, 5).filter((x) => x.dv < 0);
  s += `### 5 largest losses by value\n\n${lossV2.length ? hdr + lossV2.map(line).join('') : 'none\n'}`;
  s += `\n### 5 largest gains by value\n\n${hdr}${byV.slice(-5).reverse().map(line).join('')}`;
  const lossC2 = byC.slice(0, 5).filter((x) => x.dc > 0);
  s += `\n### 5 largest losses by cost (toggle on pays more)\n\n${lossC2.length ? hdr + lossC2.map(line).join('') : 'none\n'}`;
  s += `\n### 5 largest gains by cost (toggle on pays less)\n\n${hdr}${byC.slice(-5).reverse().map(line).join('')}`;
  s += `\n### 3C's five households (all elections, Texas; toggle on / toggle off)\n\n| Household | Elections | Conversions | Value on-off | Cost on-off | Depletion on / off | First home draw on / off | Orders (phases) |\n|---|---|---|---|---|---|---|---|\n`;
  for (const [nm, f] of FIVE)
    for (const x of all.filter((y) => is3C(y.g) && f(y.g))) {
      const o = x.r.ord, p = x.r.std.plan;
      s += `| ${nm} | ${x.g.elections} | ${x.g.conv ? 'on' : 'off'} | ${sgn(o.on.value - p.value)} | ${sgn(o.on.cost - p.cost)} | ${fmt(o.on.dep)} / ${fmt(p.dep)} | ${fmt(o.on.home)} / ${fmt(p.home)} | ${o.orders} (${o.phases}) |\n`;
    }
  const kept = all.filter((x) => x.r.ord.firstOrderYear !== null);
  const sum = (f) => kept.reduce((a, x) => a + f(x.r.ord), 0);
  s += `\n### Costs the yearly score cannot see (${kept.length} households with an order year on the standard run, of ${withOrders.length} that keep an order in the plan; years after the household's first order year; real dollars, summed over those households)\n\n`;
  s += `| Measure | Toggle on | Toggle off | On minus off |\n|---|---|---|---|\n`;
  s += `| MAGI (magiProxy) | ${fmt(sum((o) => o.magiOn))} | ${fmt(sum((o) => o.magiOff))} | ${sgn(sum((o) => o.magiOn - o.magiOff))} |\n`;
  s += `| Healthcare (includes IRMAA; the rows record no separate IRMAA field) | ${fmt(sum((o) => o.hcOn))} | ${fmt(sum((o) => o.hcOff))} | ${sgn(sum((o) => o.hcOn - o.hcOff))} |\n`;
  const earlier = all.filter((x) => depN(x.r.ord.on.dep) < depN(x.r.std.plan.dep) || depN(x.r.ord.on.home) < depN(x.r.std.plan.home));
  const c = compare(R, () => true, pick);
  const summary = `${title}: order lever value ${c.value.slice(0, 3).join(' / ')}, cost ${c.cost.slice(0, 3).join(' / ')}, depletion ${c.dep.slice(0, 3).join(' / ')}`;
  return { s, earlier, summary };
}

// The bracket search on vs off (the kept plan against the user's-bracket plan), and the guard on vs off with the search on, on the
// standard projection: depletion age and first home-draw age (never = latest). `earlier` lists the households where the kept plan
// depletes or first draws on the house earlier than the user's bracket.
function searchSection(title, R) {
  const rows = R.map((r, i) => ({ g: grid[i], r }));
  const cmp = (a, b) => (depN(a) > depN(b) ? 'later' : depN(a) < depN(b) ? 'earlier' : 'same');
  const tally = (f) => { const t = { later: 0, same: 0, earlier: 0 }; for (const x of rows) t[f(x.r)]++; return `${t.later} / ${t.same} / ${t.earlier}`; };
  const kept = {};
  for (const x of rows) { const b = x.r.std.keptBracket; kept[b] = (kept[b] || 0) + 1; }
  const dv = rows.map((x) => x.r.std.plan.value - x.r.std.userBracket.value);
  let s = `\n## ${title}: bracket search on vs off, and the guard on vs off (standard projection)\n\n`;
  s += `Kept bracket (households): ${Object.entries(kept).map(([b, n]) => `${b}% ${n}`).join(', ')}. Households whose kept bracket differs from the user's: ${rows.filter((x) => x.r.std.keptBracket !== x.r.std.userBracketSetting).length}.\n\n`;
  s += `| Comparison | Later / same / earlier | Value change p10 / median / p90 |\n|---|---|---|\n`;
  s += `| Depletion, kept plan vs user's bracket | ${tally((r) => cmp(r.std.plan.dep, r.std.userBracket.dep))} | ${[0.1, 0.5, 0.9].map((q) => sgn(pctl(dv, q))).join(' / ')} |\n`;
  s += `| First home draw, kept plan vs user's bracket | ${tally((r) => cmp(r.std.plan.home, r.std.userBracket.home))} | |\n`;
  s += `| Depletion, guard on vs off (search on) | ${tally((r) => cmp(r.std.plan.dep, r.std.guardOff.dep))} | |\n`;
  s += `| First home draw, guard on vs off (search on) | ${tally((r) => cmp(r.std.plan.home, r.std.guardOff.home))} | |\n`;
  const earlier = rows.filter((x) => depN(x.r.std.plan.dep) < depN(x.r.std.userBracket.dep) || depN(x.r.std.plan.home) < depN(x.r.std.userBracket.home));
  return { s, earlier };
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

// Batch 5 step 5b piece 3 (--sizing): the sized plan against the bracket plan (sizing off), and the guard on against off with sizing
// on, on the standard projection; the historical and Monte Carlo success rates of the households that keep a sized plan (the others
// run the bracket plan twice: equal by construction). `earlier` lists the households whose sized plan depletes or first draws on the
// house earlier than the bracket plan.
function sizingSection(title, R) {
  const rows = R.map((r, i) => ({ g: grid[i], r }));
  const cmp = (a, b) => (depN(a) > depN(b) ? 'later' : depN(a) < depN(b) ? 'earlier' : 'same');
  const tally = (f) => { const t = { later: 0, same: 0, earlier: 0 }; for (const x of rows) t[f(x.r)]++; return `${t.later} / ${t.same} / ${t.earlier}`; };
  const keptRows = rows.filter((x) => x.r.sized.kept);
  const dv = keptRows.map((x) => x.r.sized.value - x.r.std.plan.value), dc = keptRows.map((x) => x.r.sized.cost - x.r.std.plan.cost);
  let s = `\n## ${title}: conversion sizing on vs off (standard projection; the sized plan against the bracket plan)\n\n`;
  s += `${rows.length} households; the sized track ran on ${rows.filter((x) => x.r.sized.ran).length}; a sized plan is kept on ${keptRows.length} (${keptRows.reduce((a, x) => a + x.r.sized.nConv, 0)} sized conversion years in all).\n\n`;
  s += `| Comparison | Later / same / earlier | p10 / median / p90 over the kept households |\n|---|---|---|\n`;
  s += `| Depletion, sized plan vs bracket plan | ${tally((r) => cmp(r.sized.dep, r.std.plan.dep))} | |\n`;
  s += `| First home draw, sized plan vs bracket plan | ${tally((r) => cmp(r.sized.home, r.std.plan.home))} | |\n`;
  s += `| Ending after-tax value, sized minus bracket (kept households) | | ${[0.1, 0.5, 0.9].map((q) => sgn(pctl(dv, q))).join(' / ')} |\n`;
  s += `| Lifetime tax + healthcare, real, sized minus bracket (kept households) | | ${[0.1, 0.5, 0.9].map((q) => sgn(pctl(dc, q))).join(' / ')} |\n`;
  s += `| Depletion, guard on vs off (sizing on) | ${tally((r) => cmp(r.sized.dep, r.sized.guardOff.dep))} | |\n`;
  s += `| First home draw, guard on vs off (sizing on) | ${tally((r) => cmp(r.sized.home, r.sized.guardOff.home))} | |\n`;
  s += `\n### Success rates on the paths (households with a kept sized plan; information, not a gate)\n\n| Path set | Households | Paths | Success: bracket plan | Success: sized plan | Success: guard off |\n|---|---|---|---|---|---|\n`;
  for (const kind of ['hist', 'mc']) {
    const k = keptRows.filter((x) => x.r.sized[kind]);
    const tot = (f) => k.reduce((a, x) => a + f(x.r.sized[kind]), 0), n = tot((p) => p.n);
    const rate = (key) => (n ? ((100 * tot((p) => p[key])) / n).toFixed(2) + '%' : '-');
    s += `| ${kind === 'hist' ? 'Historical (every start year)' : `Monte Carlo (${MC_PATHS} seeded paths)`} | ${k.length} | ${n} | ${rate('bracket')} | ${rate('sized')} | ${rate('off')} |\n`;
    const worse = k.filter((x) => x.r.sized[kind].sized < x.r.sized[kind].bracket).length;
    s += `|   households whose sized success count is lower than the bracket plan's | ${worse} | | | | |\n`;
  }
  const earlier = rows.filter((x) => depN(x.r.sized.dep) < depN(x.r.std.plan.dep) || depN(x.r.sized.home) < depN(x.r.std.plan.home));
  return { s, earlier, kept: keptRows.length };
}

function pathsSection(title, R) {
  let s = `\n## ${title}: historical and Monte Carlo paths (plan minus off; information only)\n\n`;
  const withPlan = R.map((r, i) => [r, i]).filter(([r]) => r.active);
  s += `${withPlan.length} of ${R.length} households keep intents or another bracket; the others are \`off\` on every path (empty plan).\n\n`;
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
      if (!r.active) return;
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
  if (SIZING === undefined) SIZING = !(await import(pathToFileURL(path.join(ROOT, 'src', 'us', 'core', 'test-hooks.js')).href)).testHooks.testConvSizingOff;
  const { scanHouseholds } = await import(pathToFileURL(path.resolve(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  for (const mode of MODES) {
    let hh = scanHouseholds(CONV_ONLY ? { mode, conversions: true } : { mode });
    // Decision 16: the first 48 conversions-on households again with RI and with PA (the search covers both).
    for (const stateTax of ['ri', 'pa'])
      for (const x of scanHouseholds({ conversions: true, mode }).slice(0, 48)) hh.push({ name: `${x.name}; ${stateTax.toUpperCase()}`, patch: { ...x.patch, stateTax }, g: { ...x.g, stateTax } });
    if (LIMIT || FROM) hh = hh.slice(FROM, LIMIT ? FROM + LIMIT : undefined);
    PATCHES[mode] = hh.map((x) => x.patch);
    if (mode === MODES[0]) { grid = hh.map((x) => x.g); for (const x of hh) NAMES.set(x.g, x.name); }
  }
  const t0 = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (DUMP_OUT) await installPathFingerprint(page);
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForTimeout(300);
  const R = Object.fromEntries(MODES.map((m) => [m, []]));
  let emptyChecks = 0, histChecks = 0;
  const failures = [];
  for (const [gi, g] of grid.entries()) {
    for (const mode of MODES) {
      const o = await page.evaluate(PAGE_RUN, { patch: PATCHES[mode][gi], mcPaths: MC_PATHS, mcSeed0: MC_SEED0, checkEmpty: emptyChecks < EMPTY_CHECKS, checkHist: histChecks < HIST_CHECKS, order: ORDER, sizing: SIZING, dump: !!DUMP_OUT });
      if (!o.active && emptyChecks < EMPTY_CHECKS) emptyChecks++;
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
  const sa = searchSection('Default order', R.default), sb = searchSection('Smooth withdrawals', R.smooth);
  const earlierSearch = [...sa.earlier.map((x) => ['default', x]), ...sb.earlier.map((x) => ['smooth', x])];
  let md = `# Cliff-plan sweep: ${grid.length} households per mode, tax-aware withdrawals off\n`;
  md += `\nCross-checks: ${emptyChecks} empty-plan households ran apply on every path and matched off; ${histChecks} households with intents matched __test_runHistoricalCycles with and without the plan.\n`;
  md += a.s + b.s + sa.s + sb.s;
  md += pathsSection('Default order', R.default) + pathsSection('Smooth withdrawals', R.smooth);
  md += lossesSection(byMode) + statsSection(byMode) + movedSection(byMode);
  const za = SIZING ? sizingSection('Default order', R.default) : null, zb = SIZING ? sizingSection('Smooth withdrawals', R.smooth) : null;
  if (SIZING) md += '\n# Conversion sizing (Batch 5 step 5b piece 3)\n' + za.s + zb.s;
  const oa = ORDER ? orderSection('Default order', R.default) : null, ob = ORDER ? orderSection('Smooth withdrawals', R.smooth) : null;
  if (ORDER) md += '\n# Order lever (Batch 5 step 4c)\n' + oa.s + ob.s;
  console.log(md);
  console.log('\nSummary (combined, better / equal / worse; depletion later / same / earlier):');
  console.log('  ' + a.summary);
  console.log('  ' + b.summary);
  if (ORDER) { console.log('  ' + oa.summary); console.log('  ' + ob.summary); }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ grid, mcPaths: MC_PATHS, mcSeed0: MC_SEED0, runs: R }));
  if (MD_OUT) fs.writeFileSync(MD_OUT, md);
  if (DUMP_OUT) {
    const rows = [];
    for (const mode of MODES) for (const [i, g] of grid.entries()) {
      const r = R[mode][i], z = r.sized || { ...r.std.plan, endValue: r.std.plan.value };
      rows.push({ id: desc(g), mode, runOut: z.dep == null ? null : z.dep, firstHomeDraw: z.home == null ? null : z.home, endValue: z.endValue, conv: z.conv, inv: z.inv, path: z.path });
    }
    fs.writeFileSync(DUMP_OUT, JSON.stringify(rows));
  }
  if (errors.length) failures.push('page errors: ' + errors.join('; '));
  const earlier = [...a.earlier.map((r) => ['default', r]), ...b.earlier.map((r) => ['smooth', r])];
  if (earlier.length) {
    console.error(`\nFAIL: ${earlier.length} household(s) deplete EARLIER with the plan than off on the standard projection:`);
    for (const [m, r] of earlier) console.error(`  ${m}: ${desc(r.g)}: ${fmt(r.a.dep)} (plan) vs ${fmt(r.x.dep)} (off)`);
    process.exitCode = 1;
  } else console.log('OK: no household depletes earlier with the plan on the standard projection.');
  if (earlierSearch.length) {
    console.error(`\nFAIL: ${earlierSearch.length} household(s) deplete or first draw on the house EARLIER with the bracket search than without:`);
    for (const [m, x] of earlierSearch) console.error(`  ${m}: ${desc(x.g)}: depletion ${fmt(x.r.std.plan.dep)} vs ${fmt(x.r.std.userBracket.dep)}, first home draw ${fmt(x.r.std.plan.home)} vs ${fmt(x.r.std.userBracket.home)}`);
    process.exitCode = 1;
  } else console.log('OK: no household depletes, or first draws on the house, earlier with the bracket search on the standard projection.');
  if (SIZING) {
    const earlierSized = [...za.earlier.map((x) => ['default', x]), ...zb.earlier.map((x) => ['smooth', x])];
    console.log(`  Conversion sizing: sized plan kept on ${za.kept} (default) and ${zb.kept} (smooth) of ${grid.length} households per mode`);
    if (earlierSized.length) {
      console.error(`\nFAIL: ${earlierSized.length} household(s) deplete or first draw on the house EARLIER with the sized plan than the bracket plan:`);
      for (const [m, x] of earlierSized) console.error(`  ${m}: ${desc(x.g)}: depletion ${fmt(x.r.sized.dep)} vs ${fmt(x.r.std.plan.dep)}, first home draw ${fmt(x.r.sized.home)} vs ${fmt(x.r.std.plan.home)}`);
      process.exitCode = 1;
    } else console.log('OK: no household depletes, or first draws on the house, earlier with conversion sizing than with the bracket plan on the standard projection.');
  }
  if (ORDER) {
    const earlierOrder = [...oa.earlier.map((x) => ['default', x]), ...ob.earlier.map((x) => ['smooth', x])];
    if (earlierOrder.length) {
      console.error(`\nFAIL: ${earlierOrder.length} household(s) deplete or first draw on the house EARLIER with the toggle on than off (A2):`);
      for (const [m, x] of earlierOrder) console.error(`  ${m}: ${desc(x.g)}: depletion ${fmt(x.r.ord.on.dep)} vs ${fmt(x.r.std.plan.dep)}, first home draw ${fmt(x.r.ord.on.home)} vs ${fmt(x.r.std.plan.home)}`);
      process.exitCode = 1;
    } else console.log('OK: no household depletes, or first draws on the house, earlier with the toggle on than off on the standard projection.');
  }
  if (failures.length) {
    console.error('\nFAIL:\n  ' + failures.join('\n  '));
    process.exitCode = 1;
  }
})();
