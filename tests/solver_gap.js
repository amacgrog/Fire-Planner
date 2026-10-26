// Gap table (Batch 3C, spec sections 7 and 13.3; Batch 5 step 0): the shipped engine (cliff plan on, default withdrawal
// order, the bracket conversion: `withdrawalMixEnabled: false`, `cliffGuardEnabled: true`) against a slow reference, the
// multi-lever coordinate ascent (per-year Roth bracket, per-year withdrawal mix, smooth on/off) with a
// 200,000-evaluation budget. Each case converts at the plan's bracket setting (22%) from now to 74 in the shipped run;
// the reference may pick any bracket per year, including none. A positive gap means the shipped engine costs more than
// the reference: the room Batch 5's outer search has to win back. Not a gate; not in `npm test`.
//
// Two scores. Table 1 (3C's table): lifetime real tax + healthcare
// (`lifetimeCost` of `__test_objectiveBreakdown`; under --objective endValue it is not what the reference optimized), which does not count the tax still owed on the traditional balance left at the end; its
// after-tax end value column haircuts every traditional dollar 22% (as in tests/solver_scan.js). Table 2 (Batch 5
// step 0): the same cost plus the tax still owed on the traditional balances at the end, priced as the cliff plan
// prices its candidates (`afterTaxEndValueUS`: the balance in ten slices, each added to the last year's own return),
// in real dollars; beside it the same score with a flat 22% haircut instead, and the engine-priced after-tax end value.
// The reference optimizes --objective (Batch 5 step 2): `endValue` (the after-tax end value, the default) or `lifetimeCost`
// (table 1's cost, what the reference optimized before the objective registry); both tables rescore its schedules on both
// scores whichever it optimized, and table 2 adds the best flat bracket (off, 10 ... 35%) of the shipped engine under the new score, so the share
// of the gap that a flat conversion size closes is visible. The reference's trials apply the cliff plan made for the
// user's settings; its schedules are replayed re-planned (as Apply runs them), and table 1's cost column is the pinned-plan replay's, with the
// re-planned replay's cost and gap beside it when they differ. Table 2 and the value columns read the re-planned replay.
//
// Each case runs at every plan length in --lengths: 75 (3C's short plans) and `default` (the planner's own life
// expectancy for both partners, 100). About 1 minute at 75 and 4 at 100.
// Batch 5 step 3a: the shipped column is the KEPT plan (the bracket search on: the cliff plan may convert at another flat bracket than
// the user's 22%; its bracket, value, cost, depletion and first home draw are in the kept-plan table), the flat-bracket runs have the
// search off (each is that bracket alone), and the A5.4 check is printed per case: the kept value is at least the best flat bracket's
// (among those whose depletion and first home-draw age equal the kept plan's) less the threshold (0.001 * |value|, at least $1).
// --levers roth limits the reference to the per-year Roth bracket (no withdrawal mix, no smooth toggle): the room per-year
// conversion sizing alone could win (Batch 5 step 3b's measure); the default, all, searches the three levers.
// Batch 5 step 4a: --shipped optimized reads the shipped column from the plan card's search instead of the automatic plan:
// `__test_optimizePlan(objective)`'s plan (the per-phase multipliers and the even bracket ranking, on --objective) run through
// `__test_runPlanMode({ planMode: 'apply', plan })` (what Apply delivers), its 22%-haircut value read with that plan pinned;
// the kept-plan table then shows that plan's bracket, and a table before table 1 shows the search's winner, multipliers, gain
// and time. The default, auto, is the automatic (kept) plan, as before.
// Batch 5 step 4c: --toggle on runs the shipped column with `withdrawalMixEnabled: true` (the order lever in the automatic plan, or
// in Optimize's search); the setting stays on for the whole case (the guard-off, flat-bracket and reference runs read the same state).
// The default, off, is unchanged.
// Usage: node tests/solver_gap.js [--root DIR] [--budget 200000] [--lengths 75,default] [--objective endValue|lifetimeCost] [--levers all|roth] [--shipped auto|optimized] [--toggle off|on]
const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const BUDGET = Number(opt('--budget', 200000));
const LENGTHS = opt('--lengths', '75,default').split(',');
const OBJECTIVE = opt('--objective', 'endValue');
if (OBJECTIVE !== 'endValue' && OBJECTIVE !== 'lifetimeCost') throw new Error(`--objective must be endValue or lifetimeCost, got ${OBJECTIVE}`);
const LEVERS = opt('--levers', 'all');
if (LEVERS !== 'all' && LEVERS !== 'roth') throw new Error(`--levers must be all or roth, got ${LEVERS}`);
const SHIPPED = opt('--shipped', 'auto');
if (SHIPPED !== 'auto' && SHIPPED !== 'optimized') throw new Error(`--shipped must be auto or optimized, got ${SHIPPED}`);

const TOGGLE = opt('--toggle', 'off');
if (TOGGLE !== 'off' && TOGGLE !== 'on') throw new Error(`--toggle must be off or on, got ${TOGGLE}`);

// The flat brackets of the plan's conversion setting (the #rothConvBracket options); null is conversions off.
const FLAT = [null, 10, 12, 22, 24, 32, 35];

(async () => {
  const { GAP_CASES } = await import(pathToFileURL(path.resolve(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForTimeout(300);
  const defaultLife = await page.evaluate(() => [window.__test_getState().lifeExpectancyA, window.__test_getState().lifeExpectancyB]);
  const fmt = (n) => (n == null ? 'never' : Math.round(n).toLocaleString('en-US'));
  const pctGap = (a, b) => `${((a / b - 1) * 100).toFixed(2)}%`;
  for (const len of LENGTHS) {
    const [lifeA, lifeB] = len === 'default' ? defaultLife : [Number(len), Number(len)];
    const results = [];
    for (const c of GAP_CASES) {
      const patch = c.patch(lifeA, lifeB);
      const out = await page.evaluate(({ patch, BUDGET, FLAT, OBJECTIVE, LEVERS, SHIPPED, TOGGLE }) => {
        const st = window.__test_getState();
        const saved = JSON.parse(JSON.stringify(st));
        const cost = (s) => window.__test_objectiveBreakdown(s).lifetimeCost;
        const deflate = (s) => Math.pow(1 + st.inflation / 100, s.rows.at(-1).year);
        // Ending after-tax value as in tests/solver_scan.js (every traditional dollar haircut 22%), real (today's dollars),
        // and the sum of the conversions, both read from the run just made (same overrides and settings).
        const valueOf = (s) => {
          const r = s.rows.at(-1), t = window.__test_accountTrace(st.retireAgeA, st.retireAgeB).at(-1);
          return (r.taxable + r.bonds + r.cash + r.roth + r.homeEquity + r.traditional - 0.22 * t.tradPool) / deflate(s);
        };
        // Table 2: the tax still owed on the traditional balances at the end (the cliff plan's pricing, afterTaxEndValueUS:
        // the estate's face value less its after-tax value is that tax alone), the traditional balance itself, and the
        // after-tax end value, all real.
        // A run that ends before the last year has no last-year profile (afterTaxEndValueUS gives 0): no end tax then.
        // The breakdown is in today's dollars (the same deflation, the same pricing); only the traditional balance is read here.
        const endOf = (s) => {
          const b = window.__test_objectiveBreakdown(s);
          // Home equity (the last resort of a shortfall, tax-free) at the end and summed over the years, real.
          const homeSum = s.rows.reduce((a, r) => a + r.homeEquity / Math.pow(1 + st.inflation / 100, r.year), 0);
          return { endTax: b.endTax, trad: s.estate.traditional / deflate(s), value: b.endValue, home: s.estate.homeEquity / deflate(s), homeSum };
        };
        const home = (s) => (s.homeDrawAge === undefined ? null : s.homeDrawAge);
        const converted = (s) => s.rows.reduce((a, r) => a + (r.conversionAmount || 0), 0);
        const scored = (s) => ({ cost: cost(s), ...endOf(s), conv: converted(s), dep: s.depletedAge, home: home(s) });
        const wasSearch = window.__test_setBracketSearch(true);
        try {
          Object.assign(st, patch, { withdrawalMixEnabled: TOGGLE === 'on', cliffGuardEnabled: true });
          let shipped, keptBracket, optimized = null;
          if (SHIPPED === 'optimized') {
            // The plan card's search, its plan run as Apply runs it; pinned so valueOf's account trace reads the same plan.
            const t1 = performance.now();
            const o = window.__test_optimizePlan(OBJECTIVE);
            optimized = { winner: o.winner, mult: o.mult, gain: o.gain, plannings: o.plannings, secs: (performance.now() - t1) / 1000 };
            window.__test_setCliffPlan(o.plan);
            shipped = window.__test_runPlanMode({ planMode: 'apply', plan: o.plan }).sim;
            keptBracket = o.plan.bracket;
          } else {
            shipped = window.__test_simulate();
            keptBracket = window.__test_cliffPlanState().bracket;
          }
          const shippedValue = valueOf(shipped);
          const shippedS = scored(shipped);
          // The user's bracket alone (the search off), the kept plan's own columns' counterpart.
          window.__test_setBracketSearch(false);
          st.cliffGuardEnabled = false;
          const guardOff = window.__test_simulate();
          st.cliffGuardEnabled = true;
          // The shipped engine at each flat bracket (guard on), for table 2's best flat bracket.
          const flat = FLAT.map((b) => {
            st.rothConvEnabled = b !== null;
            if (b !== null) st.rothConvBracket = b;
            return { bracket: b, ...scored(window.__test_simulate()) };
          });
          window.__test_setBracketSearch(true);
          st.rothConvEnabled = true;
          st.rothConvBracket = patch.rothConvBracket === undefined ? saved.rothConvBracket : patch.rothConvBracket;
          // The cliff plan of the user's settings: the optimizer's trials apply it by age and never re-plan (cliff-plan.md).
          const userPlan = window.__test_refreshCliffPlan().plan;
          window.__test_setOptimizerBudget(BUDGET);
          const t0 = performance.now();
          const ref = window.__test_optimizeMultiLever(shipped, { includeRoth: true, includeMix: LEVERS === 'all', includeSmooth: LEVERS === 'all' }, OBJECTIVE);
          const secs = (performance.now() - t0) / 1000;
          // Replay the reference's schedules to read its ending total and depletion age, twice: with the user's plan pinned
          // (the run the optimizer scored; its score must equal ref.score), and re-planned for the reference's settings and
          // maps (what Apply gives: render() re-plans). The tables use the re-planned run; they differ only when the
          // reference's smooth setting or maps move the plan.
          window.__test_setRothOverride(ref.rothSchedule);
          window.__test_setWithdrawalMixOverride(ref.mixSchedule);
          st.smoothWithdrawals = ref.smoothWithdrawals;
          window.__test_setCliffPlan(userPlan);
          const pinnedSim = window.__test_simulate();
          const refScored = cost(pinnedSim);
          const pinnedScoreOk = ref.score === window.__test_objectiveScore(OBJECTIVE, pinnedSim);
          window.__test_refreshCliffPlan();
          const refSim = window.__test_simulate();
          const refValue = valueOf(refSim);
          return {
            keptBracket, optimized, userBracket: st.rothConvBracket, shipped: shippedS.cost, guardOff: cost(guardOff), shippedValue, shippedConv: shippedS.conv, shippedDep: shipped.depletedAge, shippedS,
            ref: refScored, pinnedScoreOk, refReplay: cost(refSim), refValue, refConv: converted(refSim), refDep: refSim.depletedAge, refSmooth: ref.smoothWithdrawals, refS: scored(refSim),
            refEvals: ref.evalCount, refBudget: ref.budgetExhausted, rothTruncated: ref.rothTruncated, mixTruncated: ref.mixTruncated, mixYears: ref.mixYears.length, secs, flat,
          };
        } finally {
          window.__test_setRothOverride(null);
          window.__test_setWithdrawalMixOverride(null);
          window.__test_setOptimizerBudget(8000);
          window.__test_setBracketSearch(wasSearch);
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      }, { patch, BUDGET, FLAT, OBJECTIVE, LEVERS, SHIPPED, TOGGLE });
      if (!out.pinnedScoreOk) console.error(`  ${c.name}: the reference's ${OBJECTIVE} score differs from its replay with the user's plan pinned`);
      results.push({ c, out });
    }
    const lifeLabel = lifeA === lifeB ? `${lifeA}` : `${lifeA} / ${lifeB}`;
    console.log(`\nLife expectancy ${lifeLabel}, budget ${BUDGET}, reference optimizes ${OBJECTIVE}${LEVERS === 'roth' ? ' with the Roth lever only' : ''}\n`);
    if (SHIPPED === 'optimized') {
      console.log(`Shipped column: the plan card's search (optimizePlan on ${OBJECTIVE}), its plan run through apply\n`);
      console.log(`| Case | Winner | Multipliers | Gain (today's $) | Plannings | Seconds (search + the four rates) |`);
      console.log(`|---|---|---|---|---|---|`);
      for (const { c, out } of results) {
        const o = out.optimized;
        console.log(`| ${c.name} | ${o.winner} | ${o.mult ? o.mult.join(', ') : '1, 1, 1'} | ${fmt(o.gain)} | ${o.plannings} | ${o.secs.toFixed(1)} |`);
      }
      console.log('');
    }
    console.log(`Table 1: lifetime real tax + healthcare (the reference's cost with the user's plan pinned, whichever objective it optimized)\n`);
    console.log(`| Case | Shipped (guard on) cost | Guard off cost | Reference cost | Gap | After-tax end value, real: shipped / ref | Converted: shipped / ref | Depletion shipped / ref | Ref smooth | Reference evals | Seconds |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const { c, out } of results) {
      const trunc = out.rothTruncated || out.mixTruncated ? `, window cut (${out.rothTruncated ? 'Roth ' : ''}${out.mixTruncated ? `mix ${out.mixYears} yrs` : ''})` : '';
      // The gap against the optimizer's own cost (3C's column), and against the re-planned replay when it differs (table 2's basis).
      const moved = Math.abs(out.refReplay - out.ref) > 0.01;
      const replanned = moved ? ` (re-planned ${fmt(out.refReplay)})` : '', replannedGap = moved ? ` (re-planned ${pctGap(out.shipped, out.refReplay)})` : '';
      console.log(`| ${c.name} | ${fmt(out.shipped)} | ${fmt(out.guardOff)} | ${fmt(out.ref)}${replanned} | ${pctGap(out.shipped, out.ref)}${replannedGap} | ${fmt(out.shippedValue)} / ${fmt(out.refValue)} | ${fmt(out.shippedConv)} / ${fmt(out.refConv)} | ${fmt(out.shippedDep)} / ${fmt(out.refDep)} | ${out.refSmooth ? 'on' : 'off'} | ${out.refEvals}${out.refBudget ? ' (budget hit)' : ''}${trunc} | ${out.secs.toFixed(0)} |`);
    }
    console.log(`\nTable 2: lifetime real tax + healthcare + the tax still owed on traditional at the end (the reference optimizes ${OBJECTIVE})\n`);
    console.log(`| Case | End tax, real: shipped / ref | Traditional left, real: shipped / ref | Score: shipped | Score: ref | Gap | Best flat bracket: score (gap to ref), its end tax | Score at a flat 22% haircut: shipped / ref (gap) | After-tax end value (engine pricing), real: shipped / ref | Home equity left, real: shipped / ref | Home equity summed over the years, real: shipped / ref |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const { c, out } of results) {
      const s = out.shippedS, r = out.refS;
      const score = (x) => x.cost + x.endTax, flat22 = (x) => x.cost + 0.22 * x.trad;
      // The best flat bracket under the new score among the brackets that do not run out earlier than the shipped run.
      const ok = out.flat.filter((f) => (out.shippedDep ? !f.dep || f.dep >= out.shippedDep : !f.dep));
      const best = ok.reduce((a, b) => (score(b) < score(a) ? b : a));
      const bestLabel = best.bracket === null ? 'off' : `${best.bracket}%`;
      console.log(`| ${c.name} | ${fmt(s.endTax)} / ${fmt(r.endTax)} | ${fmt(s.trad)} / ${fmt(r.trad)} | ${fmt(score(s))} | ${fmt(score(r))} | ${pctGap(score(s), score(r))} | ${bestLabel}: ${fmt(score(best))} (${pctGap(score(best), score(r))}), ${fmt(best.endTax)} | ${fmt(flat22(s))} / ${fmt(flat22(r))} (${pctGap(flat22(s), flat22(r))}) | ${fmt(s.value)} / ${fmt(r.value)} | ${fmt(s.home)} / ${fmt(r.home)} | ${fmt(s.homeSum)} / ${fmt(r.homeSum)} |`);
    }
    console.log(`\nKept plan (the bracket search on) against the best flat bracket (search off) whose depletion and first home draw equal the kept plan's; check: kept value >= best flat value less max($1, 0.1% of |value|)\n`);
    console.log(`| Case | Kept bracket (user's) | Kept: value / cost / depletion / first home draw | Best equal-outcome flat bracket: value | Check |`);
    console.log(`|---|---|---|---|---|`);
    for (const { c, out } of results) {
      const k = out.shippedS;
      const eq = out.flat.filter((f) => f.bracket !== null && f.dep === k.dep && f.home === k.home);
      const best = eq.reduce((a, b) => (a === null || b.value > a.value ? b : a), null);
      const thr = best ? Math.max(1, 0.001 * Math.abs(best.value)) : 0;
      const ok = !best || k.value >= best.value - thr;
      if (!ok) process.exitCode = 1;
      console.log(`| ${c.name} | ${out.keptBracket}% (${out.userBracket}%) | ${fmt(k.value)} / ${fmt(k.cost)} / ${fmt(k.dep)} / ${fmt(k.home)} | ${best ? `${best.bracket}%: ${fmt(best.value)}` : 'none'} | ${ok ? 'ok' : 'FAIL'} |`);
    }
    console.log(`\nFlat brackets of the shipped engine (guard on), score of table 2 / table 1's cost / depletion\n`);
    console.log(`| Case | ${FLAT.map((b) => (b === null ? 'off' : `${b}%`)).join(' | ')} |`);
    console.log(`|---|${FLAT.map(() => '---').join('|')}|`);
    for (const { c, out } of results) console.log(`| ${c.name} | ${out.flat.map((f) => `${fmt(f.cost + f.endTax)} / ${fmt(f.cost)}${f.dep ? ` (runs out ${f.dep})` : ''}`).join(' | ')} |`);
  }
  await browser.close();
})();
