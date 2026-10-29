// Batch 5 step 5a: the gap yardstick that survives step 5 (owner, 2026-10-27). Measurement only: not a gate, not in `npm test`.
// Plain Node (tests/helpers/engine-node.mjs), no browser; deterministic (fixed starts and candidate lists, no random choice).
//
// The shipped plans against two references, per case, plan length and objective (endValue: the nominal after-tax end value;
// lifetimeCost: real lifetime tax + healthcare):
//   - shipped: the automatic plan (computeCliffPlan, the bracket search on, the withdrawal toggle as the case has it) and
//     Optimize on the objective (optimizePlan, the plan card's search), each run through `apply`;
//   - reference A (the per-year search; replaces `optimizeMultiLever`, which step 5 deletes from src/): cyclic coordinate ascent
//     over three levers, written here and owning its algorithm (it imports no optimizer code):
//       * the conversion AMOUNT per age, rothConvStartAge .. rothConvEndAge, through the test-only `ctx.overrides.rothAmountByAge`
//         (the MAGI ceiling lifted for a mapped age; amounts searched in today's dollars, priced nominal at the age's year):
//         'engine' (no entry: the engine sizes it), 0, everything, and the current amount +/- 50k, 20k, 10k, 5k, 2k;
//       * the withdrawal mix per age, retirement to the last life expectancy (`ctx.overrides.withdrawalMixByAge`; the mix ids of
//         src/us/core/withdrawals/mix.js), NO 30-year window;
//       * smooth withdrawals on / off;
//     six structured starts (the engine's sizing, no conversion, the flat 35% bracket's amounts; each with no mix, and two with the
//     'balanced' / 'taxable' mixes), each in every trial family (the automatic plan pinned through `apply`, as the old reference's
//     trials ran; Optimize's plan pinned, when Optimize picks another plan; and no plan, `off`) and both smooth settings. A move is
//     kept only when its score is strictly higher and it neither depletes nor first draws on the house earlier than the automatic
//     plan (Rule A); the best of all runs is the reference. The 'engine' start in a pinned family is that plan's own run, so the
//     reference never scores below the automatic plan, nor below Optimize unless Optimize's plan itself fails the guard (with
//     --hold-bonds, a lower bond share). In a pinned family a mapped amount does nothing in a stay-under year (it converts 0) and
//     is held to the natural year's conversion in a fill year (run-projection.js); the `off` family has no such limit;
//   - reference C (the plan's own vocabulary, the yardstick's second column): cyclic coordinate ascent on a plan's shape through
//     `apply`, from the automatic plan and (when it differs) from Optimize's, the better kept: per age of A, the intent (none, or
//     under / fill at each line id, ret H and, in a two-return year, A / B; an intent whose first try is `absent` is not tried
//     again: the test reads the run's whole absent count, so it can also drop a candidate whose own line exists when the move
//     makes another kept intent absent), the order (default / traditional) and the split (none / A / B, two-return years), and
//     the bracket (off, 10 .. 35%); at most C_PASSES passes; the two searches share one --budget (the second gets what the first
//     left). A - C is what the plan's vocabulary cannot express.
// Cases: the gap table's three households (tests/unit/helpers/scan-grid.mjs GAP_CASES) and a two-return couple (TWO_RETURN, below),
// at the plan lengths of --lengths (75, and `default`: the planner's own, 100). A run that hits --budget is marked.
//
//   node tests/yardstick.mjs [--lengths 75,default] [--objectives endValue,lifetimeCost] [--cases 0,1,2,3] [--jobs 4]
//                            [--budget 400000] [--hold-bonds] [--levers all|conv] [--sizing | --no-sizing] [--json OUT.json]
// --hold-bonds: every reference run must also keep the bond reserve's mean share of the investable money (bondShare) within 0.5
// points of the automatic plan's, so the gap shows tax sizing without the shift of the low-return reserve into stocks.
// Every run also reports the reserve-to-target ratio after the ladder build (reserveRatio, below; spec B0.11.7): its minimum and
// the years under 0.95, per plan (`reserve: { min, below, years }` in the JSON record's auto / optimize / refA / refC).
// --sizing / --no-sizing (piece 3): the automatic plan, Optimize and every reference run with the per-year conversion sizing on / off
// (independent of --levers and --hold-bonds); neither flag: the shipped switch (src/us/core/test-hooks.js; Fable I-1). The header
// line says which.
// --levers conv (Batch 5 step 5b piece 3, spec B0.1, Task 0): reference A searches only the conversion amount per age; the mix
// is held at the family's own (no mix override), smoothing at the case's setting, and only the three no-mix starts run. Each
// record then carries `targets`: per age where A's amount differs from the engine's, A's MAGI and the local marginal cost
// (tax + healthcare of that year and the two after, which hold its IRMAA) per conversion dollar (real) over the $1,000 just
// below and just above A's amount, and the nearest jump in that rate within $10,000, so the report shows whether A stops at a
// kink (a bracket top, a phase-out or a cliff: spec B5.2's target kinds) or between kinks.
// (re-runs itself under `node --conditions=us`; --jobs runs the case x length x objective jobs in child processes.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureUsConditions, loadEngine, sizingArg, shippedSizing } from './helpers/engine-node.mjs';
import { GAP_CASES, legacyToAccounts } from './unit/helpers/scan-grid.mjs';

ensureUsConditions();
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const LENGTHS = opt('--lengths', '75,default').split(','),
  OBJECTIVES = opt('--objectives', 'endValue,lifetimeCost').split(','),
  JOBS = Number(opt('--jobs', 4)),
  BUDGET = Number(opt('--budget', 400000)),
  HOLD = args.includes('--hold-bonds'),
  SIZING = sizingArg(args) ?? (await shippedSizing()),
  LEVERS = opt('--levers', 'all'),
  JSON_OUT = opt('--json', null),
  ONE = opt('--one', null); // internal: "case,length,objective,outfile" for a child process
if (LEVERS !== 'all' && LEVERS !== 'conv') throw new Error(`unknown --levers ${LEVERS}`);
const CONV_ONLY = LEVERS === 'conv';
for (const o of OBJECTIVES) if (o !== 'endValue' && o !== 'lifetimeCost') throw new Error(`unknown objective ${o}`);
const MAX_PASSES = 5,
  C_PASSES = 3;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WITHDRAWAL_MIX_CANDIDATES } = await import(pathToFileURL(path.join(ROOT, 'src/us/core/withdrawals/mix.js')).href);

// The two-return household (4d's SPLIT_ML grown into a gap case, Fable review of the 5a outline): an unmarried couple, both 60
// and retired, filing two single returns until they marry at A's 63 (joint from then); B's pension 60,000 a year from 60, A none;
// 401(k) 800k A + 800k B, Roth 100k, taxable 300k; spending 100,000; ACA on (per-return 400% lines until the wedding);
// conversions 60-74 at 22%; Texas; the withdrawal toggle off.
const TWO_RETURN = {
  name: 'couple 60, two returns to 63, ACA (TX)',
  patch: (lifeA, lifeB) => ({
    singlePerson: false, filingStatus: 'single', marryLater: true, marriageAgeA: 63, children: [],
    ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: lifeA, lifeExpectancyB: lifeB,
    pensionCoverage: 'b', pensionYearlyA: 0, pensionStartAgeA: 60, pensionYearlyB: 60000, pensionStartAgeB: 60,
    taxable: 300000, cash: 0, spending: 100000, acaEnabled: true, acaEnhanced: false, stateTax: 'tx',
    rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 74, rothConvBracket: 22,
    cliffGuardEnabled: true, withdrawalMixEnabled: false, smoothWithdrawals: false,
    ...legacyToAccounts({ traditional: 1600000, roth: 100000 }, { singlePerson: false }),
  }),
};
const CASES = [...GAP_CASES, TWO_RETURN];
const CASE_IDS = opt('--cases', CASES.map((_, i) => i).join(',')).split(',').map(Number);

const late = (x) => (x === null || x === undefined ? Infinity : x);
// The bond reserve's share of the investable money (taxable, bonds, traditional, Roth, cash), averaged over the years with any.
function bondShare(sim) {
  let n = 0,
    t = 0;
  for (const r of sim.rows) {
    const inv = r.taxable + r.bonds + r.traditional + r.roth + r.cash;
    if (inv > 0) {
      t += r.bonds / inv;
      n++;
    }
  }
  return n ? t / n : 0;
}
// The reserve-to-target ratio after the ladder build (spec B0.11.7, owner 2026-10-28; reported, not gated): over the years after
// the ladder's rotation end year (planBondLadder in src/shared/core/withdrawals/bond-ladder.js: retirementYear - 1, or
// ceil(bondYears) - 1 for a household that retires now, so its ramp years, which build the reserve 1 / bondYears a year, are left
// out) and before depletion (or to the end), the year's reserve (row.bonds: bondTaxable + bondTraditional + bondRoth, at the row)
// against the standard projection's target, stdBondTarget = reserveSpend x bondYears (run-projection.js). The rows carry no
// target: it is computed here from them, (row.expenses - row.lumpExpense) x the input bondYears. Two simplifications against the
// engine's figure: row.expenses is after a forced pass's healthcare refund (the target uses the pre-refund premium), and a home
// purchase year's cash is not subtracted (no yardstick case buys a home). { min, below: years under 0.95, years }; null with no
// reserve (bondYears 0) or no such year.
function reserveRatio(sim, inputs) {
  const bondYears = Math.min(15, Math.max(0, Number.isFinite(Number(inputs.bondYears)) ? Number(inputs.bondYears) : 5));
  if (!(bondYears > 0)) return null;
  const ry = sim.retirementYear,
    rotationEndYear = ry >= 1 ? ry - 1 : Math.max(0, Math.ceil(bondYears) - 1),
    endYear = sim.depletedAge === null || sim.depletedAge === undefined ? Infinity : sim.depletedAge - inputs.ageA;
  let min = Infinity,
    below = 0,
    years = 0;
  for (const r of sim.rows) {
    if (r.year <= rotationEndYear || r.year >= endYear) continue;
    const target = (r.expenses - r.lumpExpense) * bondYears;
    if (!(target > 0)) continue;
    const x = r.bonds / target;
    years++;
    if (x < min) min = x;
    if (x < 0.95) below++;
  }
  return years ? { min, below, years } : null;
}
const LINE_IDS = ['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5'];
const BRACKETS = [null, 10, 12, 22, 24, 32, 35];

async function runOne(caseIdx, len, objective) {
  const E = await loadEngine({ sizing: SIZING });
  const c = CASES[caseIdx];
  const defaults = E.inputsOf({});
  const [lifeA, lifeB] = len === 'default' ? [defaults.lifeExpectancyA, defaults.lifeExpectancyB] : [Number(len), Number(len)];
  const inputs = E.inputsOf(c.patch(lifeA, lifeB));
  const infl = inputs.inflation / 100;
  const t0 = performance.now();
  let evals = 0,
    budgetHit = false;
  const score = (m) => m[objective];
  const auto = E.autoPlan(inputs).plan;
  const autoSim = E.run(E.ctxOf(inputs, { planMode: 'apply', plan: auto })),
    autoM = E.measure(inputs, autoSim);
  // --hold-bonds: a run must also keep the bond reserve's mean share of the investable money within 0.5 points of the automatic
  // plan's (the reference may not win by spending the low-return reserve into stocks; Batch 5 step 5a notes).
  autoM.bondShare = bondShare(autoSim);
  autoM.reserve = reserveRatio(autoSim, inputs);
  const notWorse = (m) =>
    late(m.depletedAge) >= late(autoM.depletedAge) && late(m.homeDrawAge) >= late(autoM.homeDrawAge) && (!HOLD || m.bondShare >= autoM.bondShare - 0.005);
  const tOpt = performance.now();
  const o = E.optimize(inputs, objective);
  const optSecs = (performance.now() - tOpt) / 1000;
  const optSim = E.run(E.ctxOf(inputs, { planMode: 'apply', plan: o.plan })),
    optM = E.measure(inputs, optSim);
  optM.bondShare = bondShare(optSim);
  optM.reserve = reserveRatio(optSim, inputs);
  const converted = (sim) => sim.rows.reduce((a, r) => a + (r.conversionAmount || 0) / Math.pow(1 + infl, r.year), 0);

  // Reference A.
  const tA = performance.now();
  const rothAges = [],
    mixAges = [];
  for (let a = inputs.rothConvStartAge; a <= inputs.rothConvEndAge; a++) rothAges.push(a);
  const mixEnd = inputs.singlePerson ? inputs.lifeExpectancyA : Math.max(inputs.lifeExpectancyA, inputs.lifeExpectancyB);
  for (let a = inputs.singlePerson ? inputs.retireAgeA : Math.min(inputs.retireAgeA, inputs.retireAgeB); a <= mixEnd; a++) mixAges.push(a);
  const ALL = 'all',
    ENGINE = 'engine';
  const nominal = (age, real) => (real === ALL ? 1e12 : real * Math.pow(1 + infl, age - inputs.ageA));
  const evalA = (family, smooth, roth, mix) => {
    evals++;
    const ins = smooth === inputs.smoothWithdrawals ? inputs : { ...inputs, smoothWithdrawals: smooth };
    const amounts = new Map();
    for (const [a, v] of roth) if (v !== ENGINE) amounts.set(a, nominal(a, v));
    const mixMap = new Map([...mix].filter(([, v]) => v !== 0));
    const overrides = { rothBracketByAge: null, withdrawalMixByAge: mixMap.size ? mixMap : null, rothAmountByAge: amounts.size ? amounts : null };
    const sim = E.run(E.ctxOf(ins, family === 'off' ? { overrides } : { planMode: 'apply', plan: family === 'pinned' ? auto : o.plan, overrides }));
    const m = E.measure(ins, sim);
    m.bondShare = bondShare(sim);
    m.reserve = reserveRatio(sim, ins);
    return { m, sim };
  };
  // The flat 35% bracket's conversions (the old reference's "max Roth" start), real, from the run at that setting with no plan.
  const sim35 = E.run(E.ctxOf({ ...inputs, rothConvBracket: 35 }));
  const amount35 = new Map(rothAges.map((a) => [a, Math.round((sim35.rows.find((r) => r.age === a)?.conversionAmount || 0) / Math.pow(1 + infl, a - inputs.ageA))]));
  const engineRoth = new Map(rothAges.map((a) => [a, ENGINE])),
    zeroRoth = new Map(rothAges.map((a) => [a, 0])),
    noMix = new Map(mixAges.map((a) => [a, 0])),
    mixOf = (id) => new Map(mixAges.map((a) => [a, id]));
  const starts = [
    ['engine', engineRoth, noMix],
    ['zero', zeroRoth, noMix],
    ['flat35', amount35, noMix],
    ...(CONV_ONLY
      ? []
      : [
          ['zero+balanced', zeroRoth, mixOf('balanced')],
          ['zero+taxable', zeroRoth, mixOf('taxable')],
          ['flat35+balanced', amount35, mixOf('balanced')],
        ]),
  ];
  const rothCands = (v) => {
    const out = [ENGINE, 0, ALL];
    if (typeof v === 'number') for (const d of [50000, 20000, 10000, 5000, 2000]) for (const s of [v - d, v + d]) if (s > 0) out.push(s);
    return out;
  };
  let best = null;
  const startLog = [];
  for (const family of o.winner !== 'base' ? ['pinned', 'optimize', 'off'] : ['pinned', 'off'])
    for (const smooth of CONV_ONLY ? [inputs.smoothWithdrawals] : [inputs.smoothWithdrawals, !inputs.smoothWithdrawals])
      for (const [sname, r0, m0] of starts) {
        const roth = new Map(r0),
          mix = new Map(m0);
        let cur = evalA(family, smooth, roth, mix);
        let passes = 0;
        for (let pass = 0; pass < MAX_PASSES && !budgetHit; pass++) {
          passes++;
          let changed = false;
          const coords = [...rothAges.map((a) => ['roth', a]), ...(CONV_ONLY ? [] : mixAges.map((a) => ['mix', a]))];
          for (const [lever, age] of coords) {
            if (evals >= BUDGET) {
              budgetHit = true;
              break;
            }
            const map = lever === 'roth' ? roth : mix,
              now = map.get(age);
            let pick = null;
            for (const cand of lever === 'roth' ? rothCands(now) : WITHDRAWAL_MIX_CANDIDATES) {
              if (cand === now) continue;
              map.set(age, cand);
              const t = evalA(family, smooth, roth, mix);
              if (notWorse(t.m) && score(t.m) > (pick ? score(pick.t.m) : score(cur.m))) pick = { cand, t };
            }
            map.set(age, pick ? pick.cand : now);
            if (pick) {
              cur = pick.t;
              changed = true;
            }
          }
          if (!changed) break;
        }
        const ok = notWorse(cur.m);
        startLog.push({ family, smooth, start: sname, score: score(cur.m), ok, passes });
        if (ok && (!best || score(cur.m) > score(best.m))) best = { ...cur, family, smooth, start: sname, roth: Object.fromEntries(roth), mix: Object.fromEntries([...mix].filter(([, v]) => v !== 0)) };
      }
  const aSecs = (performance.now() - tA) / 1000,
    aEvals = evals,
    aBudgetHit = budgetHit;
  // --levers conv: where A's amounts sit (see the header). Outside the budget; measurement only.
  const targets = [];
  if (CONV_ONLY && best) {
    const disc = (r) => Math.pow(1 + infl, r.year),
      rowAt = (sim, a) => sim.rows.find((r) => r.age === a),
      bestMix = () => new Map(Object.entries(best.mix).map(([k, x]) => [Number(k), x])),
      bestRoth = () => new Map(Object.entries(best.roth).map(([k, x]) => [Number(k), x]));
    const engineSim = evalA(best.family, best.smooth, engineRoth, bestMix()).sim;
    for (const a of rothAges) {
      const v = best.roth[a],
        rowA = rowAt(best.sim, a);
      if (v === ENGINE || !rowA) continue;
      const realConv = rowA.conversionAmount / disc(rowA),
        eRow = rowAt(engineSim, a),
        engineConv = eRow ? eRow.conversionAmount / disc(eRow) : 0;
      if (Math.abs(realConv - engineConv) <= 1) continue;
      const probe = (realAmt) => {
        const roth = bestRoth();
        roth.set(a, Math.max(0, realAmt));
        const sim = evalA(best.family, best.smooth, roth, bestMix()).sim;
        let cost = 0;
        for (const r of sim.rows) if (r.age >= a && r.age <= a + 2) cost += (r.tax + r.healthcare) / disc(r);
        const rr = rowAt(sim, a);
        return { conv: rr ? rr.conversionAmount / disc(rr) : 0, cost };
      };
      const pts = [];
      for (let k = -10; k <= 10; k++) pts.push(probe(realConv + k * 1000));
      // slopes[9]: the $1,000 just below A's amount; slopes[10]: just above (null where the amount could not move).
      const slopes = pts.slice(0, -1).map((p, i) => (pts[i + 1].conv - p.conv > 1 ? (pts[i + 1].cost - p.cost) / (pts[i + 1].conv - p.conv) : null));
      let jump = null;
      for (let i = 1; i < slopes.length; i++) {
        if (slopes[i] === null || slopes[i - 1] === null) continue;
        const at = (i - 10) * 1000;
        if (Math.abs(slopes[i] - slopes[i - 1]) >= 0.015 && (!jump || Math.abs(at) < Math.abs(jump.at))) jump = { at, from: slopes[i - 1], to: slopes[i] };
      }
      targets.push({ age: a, set: v === ALL ? 'all' : v, engineConv, conv: realConv, magi: rowA.magiProxy / disc(rowA), below: slopes[9], above: slopes[10], jump });
    }
  }

  // Reference C: the plan's vocabulary, from the automatic plan's shape and from Optimize's (when it differs); the better is C.
  const tC = performance.now();
  const twoReturnAge = (a) => !!inputs.marryLater && !inputs.singlePerson && a < inputs.marriageAgeA;
  const twoRet = !inputs.singlePerson && inputs.filingStatus === 'single';
  const ages = [];
  for (let a = inputs.ageA; a <= mixEnd; a++) ages.push(a);
  const cBase = evals;
  let cBudgetHit = false;
  const cSearch = (start, from) => {
    const planOf = (st) => ({ ...start, bracket: st.bracket, intents: st.intents, orders: Object.keys(st.orders).length ? st.orders : null, splits: Object.keys(st.splits).length ? st.splits : null });
    const evalC = (st) => {
      evals++;
      const sim = E.run(E.ctxOf(inputs, { planMode: 'apply', plan: planOf(st) })),
        m = E.measure(inputs, sim);
      m.bondShare = bondShare(sim);
      m.reserve = reserveRatio(sim, inputs);
      return { m };
    };
    const st = { bracket: start.bracket, intents: { ...start.intents }, orders: { ...(start.orders || {}) }, splits: { ...(start.splits || {}) } };
    let cur = evalC(st);
    const dropped = new Set();
    for (let pass = 0; pass < C_PASSES && !cBudgetHit; pass++) {
      let changed = false;
      for (const b of BRACKETS) {
        if (b === st.bracket) continue;
        const was = st.bracket;
        st.bracket = b;
        const t = evalC(st);
        if (notWorse(t.m) && score(t.m) > score(cur.m)) {
          cur = t;
          changed = true;
        } else st.bracket = was;
      }
      for (const age of ages) {
        if (evals - cBase >= BUDGET) {
          cBudgetHit = true;
          break;
        }
        const rets = twoRet && (!inputs.marryLater || twoReturnAge(age)) ? ['H', 'A', 'B'] : ['H'];
        const intentCands = [null];
        for (const line of LINE_IDS) for (const ret of rets) for (const kind of ['under', 'fill']) intentCands.push({ kind, line, ret });
        const tryField = (field, cands) => {
          const now = st[field][age] || null;
          let pick = null;
          for (const cand of cands) {
            const id = `${age}|${field}|${JSON.stringify(cand)}`;
            if (dropped.has(id) || JSON.stringify(cand) === JSON.stringify(now)) continue;
            if (cand === null) delete st[field][age];
            else st[field][age] = cand;
            const before = E.planStats.absent;
            const t = evalC(st);
            // An intent whose line the age does not have on its first try is not tried again.
            if (field === 'intents' && cand !== null && E.planStats.absent > before && pass === 0) dropped.add(id);
            if (notWorse(t.m) && score(t.m) > (pick ? score(pick.t.m) : score(cur.m))) pick = { cand, t };
          }
          const v = pick ? pick.cand : now;
          if (v === null) delete st[field][age];
          else st[field][age] = v;
          if (pick) {
            cur = pick.t;
            changed = true;
          }
        };
        tryField('intents', intentCands);
        tryField('orders', [null, 'traditional']);
        if (rets.length > 1) tryField('splits', [null, 'A', 'B']);
      }
      if (!changed) break;
    }
    return { ...cur.m, from, bracket: st.bracket, intents: st.intents, orders: st.orders, splits: st.splits };
  };
  let refC = cSearch(auto, 'automatic');
  if (o.winner !== 'base') {
    const c2 = cSearch(o.plan, 'Optimize');
    if (notWorse(c2) && score(c2) > score(refC)) refC = c2;
  }
  const cSecs = (performance.now() - tC) / 1000;
  const refSimA = best ? best.sim : autoSim;
  return {
    case: c.name, len, lifeA, lifeB, objective, ageA: inputs.ageA, secs: (performance.now() - t0) / 1000, budgetHit: aBudgetHit, cBudgetHit,
    auto: { ...autoM, bracket: auto.bracket, intents: Object.keys(auto.intents).length, converted: converted(autoSim) },
    optimize: { ...optM, winner: o.winner, mult: o.mult, secs: optSecs },
    refA: best ? { ...best.m, family: best.family, smooth: best.smooth, start: best.start, roth: best.roth, mix: best.mix, converted: converted(refSimA), evals: aEvals, secs: aSecs } : null,
    refC: { ...refC, evals: evals - cBase, secs: cSecs },
    levers: LEVERS,
    targets,
    starts: startLog,
  };
}

const fmt = (n) => (n == null || Number.isNaN(n) ? '-' : Math.round(n).toLocaleString('en-US'));
function report(recs, wall) {
  console.log(`\nYardstick: ${recs.length} runs, ${wall.toFixed(0)} s wall, Node ${process.version}${HOLD ? ', --hold-bonds' : ''}${SIZING ? ', sizing on' : ', sizing off'}${CONV_ONLY ? ', --levers conv (reference A: conversion amounts only)' : ''}\n`);
  for (const objective of OBJECTIVES) {
    const rs = recs.filter((r) => r.objective === objective);
    if (!rs.length) continue;
    const isEV = objective === 'endValue';
    const show = (m) => (isEV ? fmt(m.real) : fmt(m.cost)),
      gapOf = (s, r) => (isEV ? r.real - s.real : s.cost - r.cost),
      pctOf = (s, r) => (isEV ? (100 * (r.real - s.real)) / r.real : (100 * (s.cost - r.cost)) / r.cost);
    console.log(`\n${isEV ? 'After-tax end value, real (higher is better)' : 'Lifetime tax + healthcare, real (lower is better)'}: the references optimize ${objective}\n`);
    console.log('| Case | Life | Automatic | Optimize (winner) | Reference A (family, smooth, start) | Reference C | Gap A - automatic | Gap A - Optimize | Gap C - automatic | A evals / s | C evals / s | Optimize s |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const a = r.refA || r.auto;
      console.log(`| ${r.case} | ${r.lifeA} | ${show(r.auto)} | ${show(r.optimize)} (${r.optimize.winner}) | ${show(a)} (${r.refA ? `${r.refA.family}, ${r.refA.smooth ? 'on' : 'off'}, ${r.refA.start}` : '-'}) | ${show(r.refC)} | ${fmt(gapOf(r.auto, a))} (${pctOf(r.auto, a).toFixed(2)}%) | ${fmt(gapOf(r.optimize, a))} (${pctOf(r.optimize, a).toFixed(2)}%) | ${fmt(gapOf(r.auto, r.refC))} (${pctOf(r.auto, r.refC).toFixed(2)}%) | ${r.refA ? `${r.refA.evals} / ${r.refA.secs.toFixed(0)}` : '-'}${r.budgetHit ? ' (budget hit)' : ''} | ${r.refC.evals} / ${r.refC.secs.toFixed(0)}${r.cBudgetHit ? ' (budget hit)' : ''} | ${r.optimize.secs.toFixed(1)} |`);
    }
    console.log('\nThe other objective and the conversions of the same runs (real): automatic / Optimize / A / C\n');
    console.log('| Case | Life | End value | Lifetime cost | Converted | Depletion; first home draw (automatic / A) | Bond share: automatic / A / C | Min reserve ratio: automatic / Optimize / A / C | Years < 95%: automatic / Optimize / A / C | A: amounts set / mix ages set | C: bracket, intents, orders, splits |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const a = r.refA || r.auto,
        n = (o) => Object.keys(o || {}).length;
      console.log(`| ${r.case} | ${r.lifeA} | ${[r.auto, r.optimize, a, r.refC].map((m) => fmt(m.real)).join(' / ')} | ${[r.auto, r.optimize, a, r.refC].map((m) => fmt(m.cost)).join(' / ')} | ${fmt(r.auto.converted)} / - / ${r.refA ? fmt(r.refA.converted) : '-'} / - | ${fmt(r.auto.depletedAge)}; ${fmt(r.auto.homeDrawAge)} / ${fmt(a.depletedAge)}; ${fmt(a.homeDrawAge)} | ${[r.auto, a, r.refC].map((m) => (m.bondShare === undefined ? '-' : m.bondShare.toFixed(3))).join(' / ')} | ${[r.auto, r.optimize, a, r.refC].map((m) => (m.reserve ? m.reserve.min.toFixed(3) : '-')).join(' / ')} | ${[r.auto, r.optimize, a, r.refC].map((m) => (m.reserve ? `${m.reserve.below} of ${m.reserve.years}` : '-')).join(' / ')} | ${r.refA ? `${Object.values(r.refA.roth).filter((v) => v !== 'engine').length} / ${n(r.refA.mix)}` : '-'} | ${r.refC.bracket ?? 'off'}%, ${n(r.refC.intents)}, ${n(r.refC.orders)}, ${n(r.refC.splits)} |`);
    }
  }
  if (CONV_ONLY) {
    const pct = (x) => (x === null || x === undefined ? '-' : `${(100 * x).toFixed(1)}%`);
    console.log("\nWhere reference A's amounts sit (real; marginal cost = tax + healthcare of the year and the two after, per conversion dollar)\n");
    console.log('| Case | Life | Objective | Age | Engine conv | A conv | A MAGI | Rate below / above | Nearest rate jump within 10k |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    for (const r of recs)
      for (const t of r.targets || [])
        console.log(`| ${r.case} | ${r.lifeA} | ${r.objective} | ${t.age} | ${fmt(t.engineConv)} | ${fmt(t.conv)}${t.set === 'all' ? ' (all)' : ''} | ${fmt(t.magi)} | ${pct(t.below)} / ${pct(t.above)} | ${t.jump ? `${t.jump.at >= 0 ? '+' : ''}${fmt(t.jump.at)}: ${pct(t.jump.from)} -> ${pct(t.jump.to)}` : 'none'} |`);
  }
  console.log(`\nSeconds per run: ${recs.map((r) => `${r.case.split(' ')[0]} ${r.len} ${r.objective} ${r.secs.toFixed(0)}`).join('; ')}`);
}

const jobs = [];
for (const ci of CASE_IDS) for (const len of LENGTHS) for (const objective of OBJECTIVES) jobs.push([ci, len, objective]);
const t0 = performance.now();
if (ONE) {
  const [ci, len, objective, out] = ONE.split(',');
  fs.writeFileSync(out, JSON.stringify(await runOne(Number(ci), len, objective)));
} else {
  const self = fileURLToPath(import.meta.url),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-5a-yard-'));
  const recs = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = next++,
        [ci, len, objective] = jobs[j],
        out = path.join(dir, `job${j}.json`);
      await new Promise((res, rej) => {
        const c = spawn(process.execPath, ['--conditions=us', self, '--one', `${ci},${len},${objective},${out}`, '--budget', String(BUDGET), '--levers', LEVERS, ...(HOLD ? ['--hold-bonds'] : []), SIZING ? '--sizing' : '--no-sizing'], { stdio: 'inherit' });
        c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`job ${ci} ${len} ${objective} exited ${code}`))));
      });
      recs[j] = JSON.parse(fs.readFileSync(out, 'utf8'));
      console.error(`done ${recs[j].case} ${len} ${objective} in ${recs[j].secs.toFixed(0)} s`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
  fs.rmSync(dir, { recursive: true, force: true });
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(recs, null, 1));
  report(recs, (performance.now() - t0) / 1000);
}
