// Characterization ("snapshot") test for the two projection engines.
//
// Phase 2 of the roadmap restructures simulate() / simulateHistorical() with a
// "no behavior change" contract. The golden tests only cover hand-built
// scenarios, so this harness runs a wide grid (tests/snapshot_scenarios.js) of
// standard and historical/Monte-Carlo-style projections through both planners
// and compares every output number EXACTLY (no tolerance) against a committed
// baseline in tests/snapshots/.
//
// To keep the committed baseline small it stores hashes, not rows: one hash per
// scenario, one per projected year, one for the non-row return fields, plus a
// couple of human-readable summary values.
//
// Usage
//   node tests/snapshot.js                      check against tests/snapshots/
//   node tests/snapshot.js --update             rewrite the baseline (do this ONLY
//                                               for an intended behavior change)
//   node tests/snapshot.js --only US|Canada     run one planner
//   node tests/snapshot.js --filter text        only scenarios whose name has text
//   node tests/snapshot.js --root DIR           load Planner_*.html from DIR
//                                               (e.g. a `git worktree` of another ref)
//   node tests/snapshot.js --dump DIR           also write the full canonical JSON
//                                               of every scenario to DIR/<planner>/
//   node tests/snapshot.js --compare A B [--tol 1e-9]
//                                               no browser: diff two dump dirs and
//                                               print the first differing fields;
//                                               with --tol, numbers within that
//                                               relative tolerance count as equal
//                                               (use only to PROVE a diff is
//                                               floating-point rounding noise)
//   node tests/snapshot.js --compare A B --ignore f1,f2
//                                               drop those keys from every row of
//                                               both sides before comparing (S4
//                                               Task 10: proves a change moves only
//                                               the named row fields, e.g. the
//                                               card-only convHeldBy,convOverAca)
// Baseline moves by design: S4 (PR 4, convHeldBy / convOverAca) and the schedule-why plan (V155, owner OK 2026-11-03: the US rows
// gain the card-only convZeroBy; 25 of 541 US scenarios moved against 1738dff, 0 with --ignore convZeroBy). The cash-flow
// chart, task 2 (owner-approved design 2026-11-04): the US rows gain the display-only cash-flow fields (cashWithdrawn,
// homeWithdrawn, cashTopUp, reinvested, toBondReserve, contributions, oneTimeCash, inheritedRothPayout, taxableSaleForTax,
// shortfall); all 541 US scenarios moved against b726749 (row hashes only), 0 with --ignore of those keys; ui_us.json's
// rowsHash moved in its three surfaces, its text and projection hashes did not. Task 3 (the same approval): the Canada rows gain
// the display-only cash-flow fields (cashWithdrawn, homeWithdrawn, rothWithdrawn, cashTopUp, reinvested, toBondReserve,
// contributions, oneTimeCash, taxableSaleForTax, shortfall, meltdown); all 376 Canada scenarios moved against f67e23e (row
// hashes only), 0 with --ignore of those keys, and no US scenario moved; ui_canada.json's rowsHash moved in its three surfaces,
// its text and projection hashes did not.
// Sankey redesign, task 1 (owner-approved design 2026-11-05): the US rows gain the display-only contribTraditional, contribRoth,
// employerContrib and payrollPremiums; the Canada rows gain contribRrsp, contribTfsa, contribFhsa, employerContrib and
// payrollPremiums. Every scenario's row hash moved; measured against daa01e8, 917 scenario files differ, 0 with --ignore of the 7 new keys.
// IRA deduction PR 2 (US V160, owner-approved design 2026-11-04): the traditional IRA deduction phases out for a partner covered
// by a workplace plan (IRC 219(g)) and the nondeductible dollars become basis, recovered pro rata (Form 8606); the US rows gain
// iraDeducted, iraNondeductible, iraMagi, conversionGross, rmdTaxable, iraBasis and iraBasisRecovered. 100 of 541 US scenarios
// moved against 06c03ed, 98 with --ignore of those keys, every one with a traditional IRA contribution and a covered partner (97
// with nondeductible dollars, hence basis; 'R single self-employed ACA line' keeps its full deduction but its years iterate on
// the estimates the deduction reads, which moves its 162(l) settlement); 2 moved by the new keys only, both with a full
// deduction ('R aca employerCoversSpouse', 'R self-employed past 65'); 'default' year 1: tax 34,615.25 -> 38,665.25,
// iraNondeductible 15,000. No Canada scenario moved. ui_us.json moved against its last update (3ed6bbd, PR 2 Task 4; the <main>
// text is identical at 359b33c and at V160: the badge is in the header, outside <main>), all from the basis recovery (Tasks
// 5a/5b): 'std default' projection and rows hashes, the MCP executeProjectionHash, and its <main> text (21 numbers: the
// decision cards' later-retirement, Roth-ladder, mortgage and live-longer deltas and the year-by-year balances); 'std R
// everything' only its <main> text, the retire-timing card's "3 yrs later (age 55)" preview +$1.3M -> +$1.2M (the later
// variant works 3 years with nondeductible contributions that its conversions then move tax-free: richer by $74K at 82, the
// guardrails then raise its spending, and it ends $53K lower: 1,659,983 -> 1,606,960).
// Other-loan rate fix (US V164, Canada V71): loanSchedules() passed the loan's rate in percent to mortgagePayment(), which
// takes a fraction, so a 6% loan was amortized at 600% a year and paid off in year 0; it now passes pct(rate), as the mortgage
// does. Every scenario with an interest-bearing other loan moved, and nothing else: 64 of 541 US and 64 of 376 Canada scenarios
// against 6e90468, each one a 'loans', 'all lists' or 'everything' scenario (the grid's loan: principal 40,000, balance 30,000,
// 6%, 10 years, $500 a month extra). That loan now pays 11,329 / 11,329 / 10,094 in years 0-2 ($444.08 a month scheduled plus
// the extra) instead of 30,198 in year 0. 'std R everything' depletes later (US 93 -> 95, Canada 92 -> 93). ui_us.json and
// ui_canada.json moved only in 'std R everything' (the one UI state with a loan): its text, projection and rows hashes, and
// its historical success 66% -> 77% (US), 66% -> 75% (Canada).
//
// Finding out WHAT changed after a failure: dump the baseline tree and the
// current tree and compare them, e.g.
//   git worktree add /tmp/base <good-ref>
//   node tests/snapshot.js --root /tmp/base --dump /tmp/dumpA --update-nothing
//   node tests/snapshot.js --dump /tmp/dumpB
//   node tests/snapshot.js --compare /tmp/dumpA /tmp/dumpB
// (`--update-nothing` runs without checking or writing the baseline.)

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { scenarios } = require('./snapshot_scenarios');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const REPO = path.resolve(__dirname, '..');
const ROOT = path.resolve(opt('--root') || REPO);
const SNAP_DIR = path.join(__dirname, 'snapshots');
const PLANNERS = [
  { key: 'US', file: 'Planner_US.html', isUS: true, snap: 'us.json' },
  { key: 'Canada', file: 'Planner_Canada.html', isUS: false, snap: 'canada.json' },
];

const sha = (s, algo = 'sha256', n = 16) => crypto.createHash(algo).update(s).digest('hex').slice(0, n);
const slug = (s) => s.replace(/[^a-z0-9+.-]+/gi, '_');

// ---- code that runs inside the page ---------------------------------------
const { legacyToAccounts } = require('./legacy_balances');

const PAGE_RUNNER = `(() => {
  const state = window.__test_getState();
  const base = JSON.parse(JSON.stringify(state));
  // The grid is written with the old pooled retirement fields; a planner that has the per-partner
  // account fields (US, since Batch 3A) gets the equivalent accounts, an older tree is left alone.
  const legacyToAccounts = ${legacyToAccounts.toString()};
  const HAS_ACCOUNTS = base.trad401kA !== undefined;
  const HIST = window.__test_HIST;

  function resetState(patch) {
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(HAS_ACCOUNTS ? legacyToAccounts(patch, base) : patch)));
    if (window.__test_setRothOverride) window.__test_setRothOverride(null);
    if (window.__test_setWithdrawalMixOverride) window.__test_setWithdrawalMixOverride(null);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rowFnFor(series) {
    const wrap = (i) => HIST[((i % HIST.length) + HIST.length) % HIST.length];
    switch (series.type) {
      case 'real': {
        const i0 = series.start - HIST[0][0];
        return (y) => wrap(i0 + y);
      }
      case 'crashFirst':
        return (y) => [2000 + y, [-30, -18, -5][y] ?? 9, y < 3 ? -3 : 3, y < 3 ? 6 : 4, y < 3 ? 2 : 4.5];
      case 'sawtooth':
        return (y) => [2000 + y, y % 2 ? -15 : 25, 3, y % 2 ? 6 : 2, 4];
      case 'boom':
        return (y) => [2000 + y, 15, 2, 3, null].slice(0, 4);
      case 'flat':
        return (y) => [2000 + y, 0, 0, 0, 0];
      case 'mc': {
        const rnd = mulberry32(series.seed), B = 5, out = [];
        const maxStart = HIST.length - B;
        while (out.length < 120) {
          const s = Math.floor(rnd() * (maxStart + 1));
          for (let i = 0; i < B; i++) out.push(HIST[s + i]);
        }
        return (y) => out[y];
      }
    }
    throw new Error('unknown series ' + series.type);
  }

  function canon(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined && typeof v[k] !== 'function') o[k] = canon(v[k]);
      return o;
    }
    return v;
  }

  function run(sc) {
    try {
      resetState(sc.patch);
      let res;
      if (sc.kind === 'std') res = window.__test_simulate(state.retireAgeA + sc.shift, state.retireAgeB + sc.shift);
      else res = window.__test_simulateHistorical(rowFnFor(sc.series));
      const { rows, ...rest } = res;
      return { rows: rows.map((r) => JSON.stringify(canon(r))), rest: JSON.stringify(canon(rest)),
               depletedAge: res.depletedAge ?? null,
               finalInvestable: rows.length ? rows[rows.length - 1].investable ?? null : null };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  window.__snap = { runBatch: (batch) => batch.map(run) };
  return true;
})()`;

async function runPlanner(browser, planner, list, dumpDir) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Pin the wall clock: the engines key tax-index years off the current year.
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + plannerPath(planner.file, ROOT));
  await page.waitForTimeout(300);
  await page.evaluate(PAGE_RUNNER);

  const results = {};
  const CHUNK = 20;
  for (let i = 0; i < list.length; i += CHUNK) {
    const batch = list.slice(i, i + CHUNK);
    const out = await page.evaluate((b) => window.__snap.runBatch(b), batch);
    batch.forEach((sc, j) => {
      const r = out[j];
      if (r.error) {
        results[sc.name] = { error: r.error };
        return;
      }
      const full = r.rows.join('\n') + '\n' + r.rest;
      results[sc.name] = {
        hash: sha(full),
        rows: r.rows.map((x) => sha(x, 'sha1', 8)).join(''),  // 8 hex chars per year
        rest: sha(r.rest, 'sha1', 8),
        depletedAge: r.depletedAge,
        finalInvestable: r.finalInvestable,
      };
      if (dumpDir) {
        const dir = path.join(dumpDir, planner.key);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, slug(sc.name) + '.json'), JSON.stringify({ rows: r.rows.map((x) => JSON.parse(x)), rest: JSON.parse(r.rest) }));
      }
    });
  }
  await ctx.close();
  if (errors.length) throw new Error(`${planner.key}: page errors: ${errors.join('; ')}`);
  return results;
}

// ---- dump comparison (no browser) -----------------------------------------
let TOL = 0;
// --ignore (test tooling only): row keys dropped from both sides before comparing (top-level `rows` only: a key
// anywhere else still shows as a difference, so it fails safe)
let IGNORE = [];
function stripIgnored(dump) {
  if (IGNORE.length && Array.isArray(dump.rows)) for (const r of dump.rows) for (const k of IGNORE) delete r[k];
  return dump;
}
function diffValues(a, b, p, out, limit) {
  if (out.length >= limit) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    if (typeof a === 'number' && typeof b === 'number' && TOL > 0 && Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b))) return;
    if (a !== b) out.push(`${p}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diffValues(a[k], b[k], p ? `${p}.${k}` : k, out, limit);
}
function compareDumps(A, B) {
  let bad = 0, total = 0;
  for (const planner of fs.readdirSync(A)) {
    const dirA = path.join(A, planner), dirB = path.join(B, planner);
    if (!fs.existsSync(dirB)) { console.log(`${planner}: missing in ${B}`); bad++; continue; }
    for (const f of fs.readdirSync(dirA)) {
      total++;
      if (!fs.existsSync(path.join(dirB, f))) { console.log(`${planner}/${f}: missing in B`); bad++; continue; }
      const a = stripIgnored(JSON.parse(fs.readFileSync(path.join(dirA, f)))), b = stripIgnored(JSON.parse(fs.readFileSync(path.join(dirB, f))));
      const out = [];
      diffValues(a, b, '', out, 6);
      if (out.length) { bad++; console.log(`${planner}/${f}:\n  ${out.join('\n  ')}`); }
    }
  }
  console.log(`${total} scenario files compared, ${bad} differ${IGNORE.length ? ' (ignoring row keys ' + IGNORE.join(', ') + ')' : ''}`);
  process.exit(bad ? 1 : 0);
}

(async () => {
  if (flag('--compare')) {
    const i = args.indexOf('--compare');
    if (opt('--tol')) TOL = Number(opt('--tol'));
    if (opt('--ignore')) IGNORE = opt('--ignore').split(',').filter(Boolean);
    return compareDumps(args[i + 1], args[i + 2]);
  }
  const update = flag('--update');
  const checkOff = flag('--update-nothing');
  const dumpDir = opt('--dump');
  const only = opt('--only');
  const filter = opt('--filter');
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const planner of PLANNERS) {
      if (only && only.toLowerCase() !== planner.key.toLowerCase()) continue;
      let list = scenarios(planner.isUS);
      const names = new Set();
      for (const s of list) {
        if (names.has(s.name)) throw new Error('duplicate scenario name: ' + s.name);
        names.add(s.name);
      }
      if (filter) list = list.filter((s) => s.name.includes(filter));
      const t0 = Date.now();
      const got = await runPlanner(browser, planner, list, dumpDir);
      const errs = Object.entries(got).filter(([, v]) => v.error);
      const snapPath = path.join(SNAP_DIR, planner.snap);
      if (update) {
        if (filter || errs.length) throw new Error('refusing to --update with --filter or with scenario errors: ' + errs.map(([n, v]) => n + ': ' + v.error).join('; '));
        fs.mkdirSync(SNAP_DIR, { recursive: true });
        fs.writeFileSync(snapPath, JSON.stringify({ planner: planner.key, scenarios: got }, null, 1) + '\n');
        console.log(`[${planner.key}] wrote ${Object.keys(got).length} scenarios to tests/snapshots/${planner.snap}`);
        continue;
      }
      if (checkOff) { console.log(`[${planner.key}] ran ${list.length} scenarios (no check)`); continue; }
      const want = JSON.parse(fs.readFileSync(snapPath, 'utf8')).scenarios;
      const problems = [];
      for (const [name, g] of Object.entries(got)) {
        const w = want[name];
        if (g.error) { problems.push(`${name}: threw ${g.error}`); continue; }
        if (!w) { problems.push(`${name}: not in baseline (run --update if intended)`); continue; }
        if (w.error) { problems.push(`${name}: baseline recorded an error`); continue; }
        if (g.hash === w.hash) continue;
        const gr = g.rows.match(/.{8}/g) || [], wr = w.rows.match(/.{8}/g) || [];
        const idx = gr.findIndex((h, i) => h !== wr[i]);
        const where = gr.length !== wr.length ? `row count ${wr.length} -> ${gr.length}` : idx >= 0 ? `first differing year index ${idx}` : 'non-row fields differ';
        problems.push(`${name}: ${where}; depletedAge ${w.depletedAge} -> ${g.depletedAge}; finalInvestable ${w.finalInvestable} -> ${g.finalInvestable}`);
      }
      if (!filter) for (const name of Object.keys(want)) if (!(name in got)) problems.push(`${name}: in baseline but no longer run`);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (problems.length) {
        failed++;
        console.error(`[${planner.key}] snapshot MISMATCH (${problems.length} of ${list.length} scenarios), ${secs}s:`);
        problems.slice(0, 25).forEach((p) => console.error('  ' + p));
        if (problems.length > 25) console.error(`  ... and ${problems.length - 25} more`);
      } else console.log(`[${planner.key}] snapshot test passed (${list.length} scenarios, exact match, ${secs}s)`);
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exit(1);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
