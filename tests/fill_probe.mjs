// Batch 5 step 5a: how often a fill to a cliff line beats the automatic plan (the MFJ 62 IRMAA tier-1 miss of the 4b notes).
// Measurement only: not a gate, not in `npm test`. Plain Node (tests/helpers/engine-node.mjs), no browser.
//
// Per household of the scan grid (tests/unit/helpers/scan-grid.mjs `scanHouseholds`, the 768 3C households; with --mode both,
// once per withdrawal mode) the automatic plan (computeCliffPlan, the bracket search on, the withdrawal toggle off) is run through
// `apply`, then the same plan with ONE added fill intent (`{ kind: 'fill', line, ret: 'H' }`, replacing the plan's own intent at
// that age if it has one) through `apply`:
//   - over: the shipped fill (to $1 over the line, fillPlanOf);
//   - under: the fill-just-under copy of src/ (to $1 under the line; engine-node.mjs, `fillUnder`);
// for one year (every age the line can be in reach: aca400 before 65, irmaa1..5 from 63) and for one phase (the same line at every
// age of: before 65, 65 to 74, 75 on; A's RMD age is 75 on the whole grid, born 1960 or later). Each trial's outcome comes from
// the engine's own counters (planStats: absent / skippedSide / skippedIneligible / fallback, else carried).
// A win: depletion and first home draw no earlier than the automatic plan's (Rule A, as planCandidateBetter), the nominal
// after-tax end value higher by more than max($1, 0.1% of the automatic plan's), and the real gain over $1,000.
// On each household with a win:
//   - greedy: from its best trial (a year or a phase), its other winning single years of the same kind added one at a time
//     while one adds a win;
//   - routes, at the best trial's ages: (r1) the best trial itself; (r2a) the automatic plan with the withdrawal toggle on (4c's
//     order lever, A15 (a) as shipped); (r2b) the explicit withdrawal mix 'traditional' at those ages (ctx.overrides, the stock-
//     account step drawn traditional-first, which a conversion year allows); (r3, conversions on only) the conversion at those
//     ages inside the conversion window sized so each year's MAGI lands on the under-fill's MAGI there
//     (ctx.overrides.rothAmountByAge, the MAGI ceiling lifted; one correction step); (opt) Optimize on endValue (optimizePlan,
//     the plan card's search) against the automatic plan.
// A couple filing two returns (the grid's unmarried couples) also gets the per-return lines (ret A / B) beside the household's.
// Prints the tables of the Batch 5 step 5a notes and, with --json, every household's record.
//
//   node tests/fill_probe.mjs [--mode default|smooth|both] [--jobs 4] [--from N] [--limit N] [--json OUT.json]
//   node tests/fill_probe.mjs --winners IN.json [--mc 200] [--jobs 4] [--json OUT.json]   (the risk pass, near the end)
// (re-runs itself under `node --conditions=us`; --jobs splits the grid over child processes.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureUsConditions, loadEngine } from './helpers/engine-node.mjs';
import { scanHouseholds } from './unit/helpers/scan-grid.mjs';

ensureUsConditions();
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const MODE = opt('--mode', 'both');
if (!['default', 'smooth', 'both'].includes(MODE)) throw new Error(`--mode must be default, smooth or both, got ${MODE}`);
const JOBS = Number(opt('--jobs', 4)),
  FROM = Number(opt('--from', 0)),
  LIMIT = Number(opt('--limit', Infinity)),
  JSON_OUT = opt('--json', null),
  PART = opt('--part', null); // internal: a child process writes its records here
const MIN_REAL = 1000;
const IRMAA = ['irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5'];
const PHASES = [
  ['<65', (a) => a < 65],
  ['65-74', (a) => a >= 65 && a < 75],
  ['75+', (a) => a >= 75],
];
const late = (x) => (x === null || x === undefined ? Infinity : x);

// The grid as one list of [mode, household] in a fixed order (default first).
function jobsList() {
  const modes = MODE === 'both' ? ['default', 'smooth'] : [MODE];
  const all = [];
  for (const m of modes) for (const h of scanHouseholds({ mode: m })) all.push({ mode: m, h });
  return all;
}

async function probe(list) {
  const E = await loadEngine(),
    U = await loadEngine({ fillUnder: true });
  const out = [];
  for (const { mode, h } of list) {
    const t0 = performance.now();
    const inputs = E.inputsOf(h.patch);
    const auto = E.autoPlan(inputs).plan;
    const runOn = (X, plan, overrides) => X.run(X.ctxOf(inputs, { planMode: 'apply', plan, overrides }));
    const baseSim = runOn(E, auto),
      base = E.measure(inputs, baseSim);
    const life = inputs.lifeExpectancyA;
    const thr = Math.max(1, 0.001 * Math.abs(base.value));
    const wins = (m) => late(m.depletedAge) >= late(base.depletedAge) && late(m.homeDrawAge) >= late(base.homeDrawAge) && m.value - base.value > thr && m.real - base.real > MIN_REAL;
    const ruleAFail = (m) => late(m.depletedAge) < late(base.depletedAge) || late(m.homeDrawAge) < late(base.homeDrawAge);
    const outcomes = { carried: 0, absent: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0 };
    const KEYS = ['absent', 'skippedSide', 'skippedIneligible', 'fallback'];
    // One trial: the plan with `add` merged into its intents, through X; the outcome of the first added age by the counters.
    const trial = (X, add, label) => {
      const st = Object.fromEntries(KEYS.map((k) => [k, X.planStats[k]]));
      const plan = { ...auto, intents: { ...auto.intents, ...add } };
      const sim = runOn(X, plan),
        m = X.measure(inputs, sim);
      let outcome = 'carried';
      for (const k of KEYS) if (X.planStats[k] > st[k]) outcome = k;
      return { label, add, m, outcome, gain: m.real - base.real, sim };
    };
    // A couple filing two returns (single filing, before a marry-later wedding) has per-return lines (ret A / B) beside the household's.
    const twoReturns = (a) => !inputs.singlePerson && inputs.filingStatus === 'single' && (!inputs.marryLater || a < inputs.marriageAgeA);
    const retsAt = (a) => (twoReturns(a) ? ['H', 'A', 'B'] : ['H']);
    const singles = [],
      phases = [];
    for (let age = inputs.ageA; age <= life; age++) {
      const lines = [...(age < 65 ? ['aca400'] : []), ...(age >= 63 ? IRMAA : [])];
      for (const line of lines)
        for (const ret of retsAt(age))
          for (const [kind, X] of [['over', E], ['under', U]]) {
            const t = trial(X, { [age]: { kind: 'fill', line, ret } }, { age, line, ret, kind });
            outcomes[t.outcome]++;
            singles.push(t);
          }
    }
    for (const [ph, inPh] of PHASES) {
      const ages = [];
      for (let a = inputs.ageA; a <= life; a++) if (inPh(a)) ages.push(a);
      if (!ages.length) continue;
      for (const line of ph === '<65' ? ['aca400', ...IRMAA] : IRMAA)
        for (const ret of ['H', 'A', 'B'])
          for (const [kind, X] of [['over', E], ['under', U]]) {
            const add = Object.fromEntries(ages.filter((a) => (line === 'aca400' ? a < 65 : a >= 63) && retsAt(a).includes(ret)).map((a) => [a, { kind: 'fill', line, ret }]));
            if (!Object.keys(add).length) continue;
            phases.push(trial(X, add, { phase: ph, line, ret, kind }));
          }
    }
    const all = [...singles, ...phases];
    const winning = all.filter((t) => wins(t.m)),
      bestOf = (ts) => ts.reduce((a, b) => (b.m.value > a.m.value ? b : a), ts[0]);
    const rec = {
      mode,
      name: h.name,
      g: h.g,
      base: { bracket: auto.bracket, intents: Object.keys(auto.intents).length, value: base.value, real: base.real, cost: base.cost, dep: base.depletedAge, home: base.homeDrawAge },
      trials: all.length,
      outcomes,
      ruleAFails: all.filter((t) => t.m.real - base.real > MIN_REAL && ruleAFail(t.m)).length,
      winsSingle: singles.filter((t) => wins(t.m)).length,
      winsPhase: phases.filter((t) => wins(t.m)).length,
    };
    if (winning.length) {
      const best = bestOf(winning),
        bestSingle = bestOf(singles.filter((t) => wins(t.m))) || null;
      const pick = (t) => (t ? { ...t.label, ages: Object.keys(t.add).map(Number), gain: t.gain, cost: t.m.cost - base.cost, dep: t.m.depletedAge, home: t.m.homeDrawAge } : null);
      rec.best = pick(best);
      rec.bestSingle = pick(bestSingle);
      rec.bestUnder = pick(bestOf(winning.filter((t) => t.label.kind === 'under')));
      rec.bestOver = pick(bestOf(winning.filter((t) => t.label.kind === 'over')));
      rec.boundary = Math.max(...rec.best.ages) >= life - 2;
      // Greedy: from the best trial (a year or a phase), the household's winning single years of the same kind at other ages added
      // one at a time, best first, each kept only when it wins over the running total (an over and an under intent are not mixed).
      const X = best.label.kind === 'under' ? U : E;
      let cur = best,
        add = { ...best.add };
      const pool = singles.filter((t) => wins(t.m) && t.label.kind === best.label.kind && !(t.label.age in add));
      pool.sort((a, b) => b.m.value - a.m.value);
      for (const p of pool) {
        if (p.label.age in add) continue;
        const t = trial(X, { ...add, ...p.add }, null);
        if (wins(t.m) && t.m.value - cur.m.value > Math.max(1, 0.001 * Math.abs(cur.m.value))) {
          cur = t;
          add = { ...add, ...p.add };
        }
      }
      rec.greedy = { gain: cur.gain, ages: Object.keys(add).map(Number).sort((a, b) => a - b) };
      // Routes at the best trial's ages, against the under-fill of the same line and ages (its MAGI per age is r3's target).
      const routes = {};
      const ins2 = { ...inputs, withdrawalMixEnabled: true },
        plan2 = E.autoPlan(ins2).plan,
        m2 = E.measure(ins2, E.run(E.ctxOf(ins2, { planMode: 'apply', plan: plan2 })));
      routes.r2aToggle = m2.real - base.real;
      const ages = rec.best.ages;
      const mixM = E.measure(inputs, runOn(E, auto, { ...E.NO_MAPS, withdrawalMixByAge: new Map(ages.map((a) => [a, 'traditional'])) }));
      routes.r2bMix = mixM.real - base.real;
      const twin = all.find((t) => t.label.kind === 'under' && t.label.line === best.label.line && t.label.ret === best.label.ret && t.label.age === best.label.age && t.label.phase === best.label.phase);
      if (inputs.rothConvEnabled && twin) {
        const rowAt = (sim, a) => sim.rows.find((r) => r.age === a);
        const conv = ages.filter((a) => a >= inputs.rothConvStartAge && a <= inputs.rothConvEndAge);
        const amounts = new Map(conv.map((a) => [a, Math.max(0, rowAt(baseSim, a).conversionAmount + rowAt(twin.sim, a).magiProxy - rowAt(baseSim, a).magiProxy)]));
        let sim3 = runOn(E, auto, { ...E.NO_MAPS, rothAmountByAge: amounts });
        for (const a of conv) amounts.set(a, Math.max(0, amounts.get(a) + rowAt(twin.sim, a).magiProxy - rowAt(sim3, a).magiProxy));
        sim3 = runOn(E, auto, { ...E.NO_MAPS, rothAmountByAge: amounts });
        const m3 = E.measure(inputs, sim3);
        routes.r3Conv = conv.length ? m3.real - base.real : null;
        routes.r3Ok = !ruleAFail(m3);
      } else {
        routes.r3Conv = null;
        routes.r3Ok = true;
      }
      const o = E.optimize(inputs, 'endValue');
      routes.optimize = o.gain;
      routes.optimizeWinner = o.winner;
      rec.routes = routes;
    }
    rec.secs = (performance.now() - t0) / 1000;
    out.push(rec);
  }
  return out;
}

const pctl = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b),
    i = (s.length - 1) * p,
    lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};
const fmt = (n) => (n == null || Number.isNaN(n) ? '-' : Math.round(n).toLocaleString('en-US'));

function report(recs, secs) {
  const modes = [...new Set(recs.map((r) => r.mode))];
  console.log(`\nFill probe: ${recs.length} household-modes, ${secs.toFixed(0)} s wall, Node ${process.version}\n`);
  console.log('| Mode | Households | Trials | Carried / absent / wrong side / ineligible / fallback | Win (any) | Win, single year | Win, phase only | Rule A: trials > $1k that deplete or draw on the house earlier |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const m of modes) {
    const rs = recs.filter((r) => r.mode === m),
      sum = (f) => rs.reduce((a, r) => a + f(r), 0),
      oc = (k) => sum((r) => r.outcomes[k]);
    console.log(`| ${m} | ${rs.length} | ${sum((r) => r.trials)} | ${oc('carried')} / ${oc('absent')} / ${oc('skippedSide')} / ${oc('skippedIneligible')} / ${oc('fallback')} | ${rs.filter((r) => r.best).length} | ${rs.filter((r) => r.bestSingle).length} | ${rs.filter((r) => r.best && !r.bestSingle).length} | ${sum((r) => r.ruleAFails)} (in ${rs.filter((r) => r.ruleAFails).length} households) |`);
  }
  console.log('\nGain of the best winning trial (real, today\'s dollars) and as a share of the automatic plan\'s real end value\n');
  console.log('| Mode | Wins | p10 | median | p90 | max | median % | max % (automatic plan ending above 0) | automatic plan runs out, the fill does not | best under / best over (median) | greedy (median, max) | boundary (fill at life - 2 or later) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of modes) {
    const w = recs.filter((r) => r.mode === m && r.best),
      g = w.map((r) => r.best.gain),
      p = w.filter((r) => r.base.real > 0).map((r) => (100 * r.best.gain) / r.base.real);
    const gu = w.filter((r) => r.bestUnder).map((r) => r.bestUnder.gain),
      go = w.filter((r) => r.bestOver).map((r) => r.bestOver.gain),
      gr = w.filter((r) => r.greedy).map((r) => r.greedy.gain);
    console.log(`| ${m} | ${w.length} | ${fmt(pctl(g, 0.1))} | ${fmt(pctl(g, 0.5))} | ${fmt(pctl(g, 0.9))} | ${fmt(Math.max(...g))} | ${pctl(p, 0.5).toFixed(2)}% | ${Math.max(...p).toFixed(2)}% | ${w.filter((r) => r.base.dep !== null && r.best.dep === null).length} | ${fmt(pctl(gu, 0.5))} (${gu.length}) / ${fmt(pctl(go, 0.5))} (${go.length}) | ${fmt(pctl(gr, 0.5))}, ${fmt(Math.max(...gr))} | ${w.filter((r) => r.boundary).length} |`);
  }
  const axes = [
    ['filing', (r) => r.g.filing],
    ['age', (r) => r.g.age],
    ['traditional', (r) => r.g.trad],
    ['taxable', (r) => r.g.taxable],
    ['spending', (r) => r.g.spending],
    ['elections', (r) => r.g.elections],
    ['conversions', (r) => (r.g.conv ? 'on' : 'off')],
    ['best: line', (r) => r.best && r.best.line],
    ['best: kind', (r) => r.best && r.best.kind],
    ['best: return', (r) => r.best && r.best.ret],
    ['best: single age or phase', (r) => r.best && (r.best.phase || r.best.age)],
  ];
  console.log('\nWinners by profile (wins / households in the bucket, both modes)\n');
  for (const [name, f] of axes) {
    const buckets = new Map();
    for (const r of recs) {
      const k = String(f(r));
      if (!buckets.has(k)) buckets.set(k, [0, 0, 0]);
      const b = buckets.get(k);
      b[1]++;
      if (r.best) {
        b[0]++;
        b[2] += r.best.gain;
      }
    }
    const isBest = name.startsWith('best');
    console.log(`- ${name}: ${[...buckets].filter(([k]) => !isBest || k !== 'undefined').sort((a, b) => (isNaN(a[0]) ? a[0].localeCompare(b[0]) : a[0] - b[0])).map(([k, [w, n, s]]) => (isBest ? `${k} ${w} (gain sum ${fmt(s)})` : `${k} ${w}/${n}`)).join('; ')}`);
  }
  console.log('\nRoutes on the winners (real gain over the automatic plan; r1 = the best fill, at its ages; r3 only where conversions are on)\n');
  console.log('| Mode | Households | r1 sum | r2a toggle on: sum (households >= 50% of r1) | r2b mix traditional: sum (>= 50%) | r3 conversion to the same MAGI: households, r1 sum there, r3 sum (>= 50%, Rule A fails) | Optimize endValue: sum (>= 50%) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const m of modes) {
    const w = recs.filter((r) => r.mode === m && r.routes),
      w3 = w.filter((r) => r.routes.r3Conv !== null),
      s = (xs, f) => xs.reduce((a, r) => a + f(r), 0),
      half = (xs, f) => xs.filter((r) => f(r) >= 0.5 * r.best.gain).length;
    console.log(`| ${m} | ${w.length} | ${fmt(s(w, (r) => r.best.gain))} | ${fmt(s(w, (r) => r.routes.r2aToggle))} (${half(w, (r) => r.routes.r2aToggle)}) | ${fmt(s(w, (r) => r.routes.r2bMix))} (${half(w, (r) => r.routes.r2bMix)}) | ${w3.length}, ${fmt(s(w3, (r) => r.best.gain))}, ${fmt(s(w3, (r) => r.routes.r3Conv))} (${half(w3, (r) => r.routes.r3Conv)}, ${w3.filter((r) => !r.routes.r3Ok).length}) | ${fmt(s(w, (r) => r.routes.optimize))} (${half(w, (r) => r.routes.optimize)}) |`);
  }
  console.log('\nThe 10 largest wins\n');
  console.log('| Mode | Household | Best (line, kind, age / phase) | Gain | % | Cost change | Greedy (ages) | r2a / r2b / r3 / Optimize |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of recs.filter((x) => x.best).sort((a, b) => b.best.gain - a.best.gain).slice(0, 10)) {
    const ro = r.routes;
    console.log(`| ${r.mode} | ${r.name} | ${r.best.line} (${r.best.ret}), ${r.best.kind}, ${r.best.phase || r.best.age} | ${fmt(r.best.gain)} | ${r.base.real > 0 ? `${((100 * r.best.gain) / r.base.real).toFixed(2)}%` : 'runs out'} | ${fmt(r.best.cost)} | ${r.greedy ? `${fmt(r.greedy.gain)} (${r.greedy.ages.join(', ')})` : '-'} | ${ro ? `${fmt(ro.r2aToggle)} / ${fmt(ro.r2bMix)} / ${fmt(ro.r3Conv)} / ${fmt(ro.optimize)}` : '-'} |`);
  }
  const t = recs.map((r) => r.secs);
  console.log(`\nSeconds per household-mode: median ${pctl(t, 0.5).toFixed(1)}, max ${Math.max(...t).toFixed(1)}, sum ${t.reduce((a, b) => a + b, 0).toFixed(0)}`);
}

// --winners IN.json (a previous run's --json): for each winning household-mode, the automatic plan and its best fill re-run, then
//   - the bond reserve: the end balances (real) with and without the fill, and the bond reserve's share of the investable money
//     (taxable, bonds, traditional, Roth, cash) averaged over the years: how much of the gain is money moved out of the reserve;
//   - the historical paths (every start year, runHistoricalCyclesWith): success with and without, and per path (paired by start
//     year) the share where the fill ends higher and the median ratio of the real end totals (total / cumFactor);
//   - Monte Carlo (MC_PATHS seeded paths, monteCarloSummaryWith; both runs read the same paths): the success rates.
const MC_PATHS = Number(opt('--mc', 200));
async function riskPass(list) {
  const E = await loadEngine(),
    U = await loadEngine({ fillUnder: true });
  const grid = { default: scanHouseholds({ mode: 'default' }), smooth: scanHouseholds({ mode: 'smooth' }) };
  const out = [];
  for (const r of list) {
    const h = grid[r.mode].find((x) => x.name === r.name),
      inputs = E.inputsOf(h.patch),
      auto = E.autoPlan(inputs).plan;
    const X = r.best.kind === 'under' ? U : E,
      plan = { ...auto, intents: { ...auto.intents, ...Object.fromEntries(r.best.ages.map((a) => [a, { kind: 'fill', line: r.best.line, ret: r.best.ret }])) } };
    const c0 = E.ctxOf(inputs, { planMode: 'apply', plan: auto }),
      c1 = X.ctxOf(inputs, { planMode: 'apply', plan });
    const s0 = E.run(c0),
      s1 = X.run(c1);
    const defl = Math.pow(1 + inputs.inflation / 100, s0.rows[s0.rows.length - 1].year),
      end = (s, k) => s.rows[s.rows.length - 1][k] / defl;
    const bondShare = (s) => {
      let n = 0,
        t = 0;
      for (const x of s.rows) {
        const inv = x.taxable + x.bonds + x.traditional + x.roth + x.cash;
        if (inv > 0) {
          t += x.bonds / inv;
          n++;
        }
      }
      return n ? t / n : 0;
    };
    const h0 = E.historical(c0).cycles,
      h1 = X.historical(c1).cycles;
    const realEnd = (c) => {
      const last = c.rows[c.rows.length - 1];
      return last.total / last.cumFactor;
    };
    const ratios = h0.map((c, i) => (realEnd(c) > 0 ? realEnd(h1[i]) / realEnd(c) : Infinity));
    out.push({
      mode: r.mode,
      name: r.name,
      g: r.g,
      best: r.best,
      dBonds: end(s1, 'bonds') - end(s0, 'bonds'),
      dTaxable: end(s1, 'taxable') - end(s0, 'taxable'),
      dRoth: end(s1, 'roth') - end(s0, 'roth'),
      dTrad: end(s1, 'traditional') - end(s0, 'traditional'),
      dCash: end(s1, 'cash') - end(s0, 'cash'),
      share0: bondShare(s0),
      share1: bondShare(s1),
      hist: {
        n: h0.length,
        ok0: h0.filter((c) => !c.depletedAge).length,
        ok1: h1.filter((c) => !c.depletedAge).length,
        higher: ratios.filter((x) => x > 1).length,
        medRatio: pctl(ratios.filter(Number.isFinite), 0.5),
        p10Ratio: pctl(ratios.filter(Number.isFinite), 0.1),
      },
      mc: { rate0: E.monteCarlo(c0, MC_PATHS).successRate, rate1: X.monteCarlo(c1, MC_PATHS).successRate },
    });
  }
  return out;
}
function riskReport(rs, secs) {
  console.log(`\nWinners re-run: ${rs.length} household-modes, ${secs.toFixed(0)} s wall, Node ${process.version}, Monte Carlo ${MC_PATHS} paths\n`);
  const sum = (xs, f) => xs.reduce((a, r) => a + f(r), 0),
    lower = (r) => r.share1 < r.share0 - 0.005;
  const groups = [
    ['all winners', rs],
    ['bond share lower by over 0.5 points', rs.filter(lower)],
    ['bond share not lower', rs.filter((r) => !lower(r))],
  ];
  console.log('| Winners | Count | Gain sum (real) | End balance change, real: bonds / taxable / Roth / traditional / cash | Mean bond share of investable money: automatic / fill (median) |');
  console.log('|---|---|---|---|---|');
  for (const [name, g] of groups)
    console.log(`| ${name} | ${g.length} | ${fmt(sum(g, (r) => r.best.gain))} | ${['dBonds', 'dTaxable', 'dRoth', 'dTrad', 'dCash'].map((k) => fmt(sum(g, (r) => r[k]))).join(' / ')} | ${g.length ? `${pctl(g.map((r) => r.share0), 0.5).toFixed(3)} / ${pctl(g.map((r) => r.share1), 0.5).toFixed(3)}` : '-'} |`);
  console.log(
    "\n| Winners | Historical cycles; success automatic / fill (summed) | Households: fill success lower / higher | Paths where the fill ends higher | Median of the households' median path ratio (fill / automatic) | Median of their p10 path ratio | Households whose p10 path ratio < 1 | Monte Carlo success, mean: automatic / fill | Households: MC success lower / higher |",
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [name, g] of groups) {
    if (!g.length) continue;
    const n = sum(g, (r) => r.hist.n);
    console.log(`| ${name} | ${n}; ${sum(g, (r) => r.hist.ok0)} / ${sum(g, (r) => r.hist.ok1)} | ${g.filter((r) => r.hist.ok1 < r.hist.ok0).length} / ${g.filter((r) => r.hist.ok1 > r.hist.ok0).length} | ${sum(g, (r) => r.hist.higher)} of ${n} | ${pctl(g.map((r) => r.hist.medRatio), 0.5).toFixed(3)} | ${pctl(g.map((r) => r.hist.p10Ratio), 0.5).toFixed(3)} | ${g.filter((r) => r.hist.p10Ratio < 1).length} | ${((100 * sum(g, (r) => r.mc.rate0)) / g.length).toFixed(2)}% / ${((100 * sum(g, (r) => r.mc.rate1)) / g.length).toFixed(2)}% | ${g.filter((r) => r.mc.rate1 < r.mc.rate0).length} / ${g.filter((r) => r.mc.rate1 > r.mc.rate0).length} |`);
  }
}

const WINNERS = opt('--winners', null);
const work = WINNERS ? riskPass : probe;
const list = (WINNERS ? JSON.parse(fs.readFileSync(WINNERS, 'utf8')).filter((r) => r.best) : jobsList()).slice(FROM, Number.isFinite(LIMIT) ? FROM + LIMIT : undefined);
const show = (recs, secs) => (WINNERS ? riskReport(recs, secs) : report(recs, secs));
const t0 = performance.now();
if (PART) {
  fs.writeFileSync(PART, JSON.stringify(await work(list)));
} else if (JOBS <= 1) {
  const recs = await work(list);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(recs, null, 1));
  show(recs, (performance.now() - t0) / 1000);
} else {
  const self = fileURLToPath(import.meta.url),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-5a-probe-')),
    n = list.length,
    per = Math.ceil(n / JOBS);
  const parts = [];
  await Promise.all(
    Array.from({ length: JOBS }, (_, j) => {
      const from = FROM + j * per,
        lim = Math.min(per, n - j * per);
      if (lim <= 0) return null;
      const part = path.join(dir, `part${j}.json`);
      parts.push(part);
      const extra = WINNERS ? ['--winners', WINNERS, '--mc', String(MC_PATHS)] : [];
      return new Promise((res, rej) => {
        const c = spawn(process.execPath, ['--conditions=us', self, '--mode', MODE, '--from', String(from), '--limit', String(lim), '--part', part, ...extra], { stdio: 'inherit' });
        c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`job ${j} exited ${code}`))));
      });
    }),
  );
  const recs = parts.flatMap((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
  fs.rmSync(dir, { recursive: true, force: true });
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(recs, null, 1));
  show(recs, (performance.now() - t0) / 1000);
}
