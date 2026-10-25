# Test inventory

Read to find the test for an area, or before adding a benchmark, a scan or a Playwright script.

Related: [module-system.md](module-system.md), [engine.md](engine.md).

## Tests, benches and scans

- `tests/state_modules.js` (the state modules in plain Node), `tests/country_contract.js` (the `#country` seam contract, code in
  `scripts/lib/country-contract.js`), `tests/closure_names.js` (no undeclared name in any `src/**/*.js`), `tests/core_purity.js`
  (no browser global, DOM method call or `ui/` import in any `src/**/core/` file; it reads only `core/` files),
  `tests/core_import.js` (every `core/` module imports in plain Node, one fresh process per module), `tests/ui_cycles.js` (import
  cycles only among `ui/` modules: a cycle with a member outside `ui/` fails; and every `ui/` and `core/` module passes the load-time guard),
  `tests/main_entry.js` (each `main.js` is imports plus one IIFE of calls and if statements), `tests/doc_paths.js` (every
  module path under `src/` named in CLAUDE.md, `docs/architecture/*.md` and `docs/superpowers/inventory/*.md` exists; every topic file CLAUDE.md names exists and each is named there), `tests/module_map.js` (the module-map
  script's write and check modes, on fixture trees), `tests/no_bare_imports.js` (no
  `import './x.js';` in `src/`), `tests/module_names.js` (no module file name ending in `-<digits>.js`), `tests/src_paths.js` (every file under `src/` has a side: `core/`, `ui/` or entry), `tests/no_markers.js`
  (no `@@shared` marker anywhere in `src/`), `tests/extraction_plan.js` / `tests/extract_units.js` / `tests/marker_source.js` /
  `tests/regroup_modules.js` / `tests/compare_builds.js` (the extraction tool, its helper, the regroup tool and the build
  comparison, on fixture trees), `tests/closure_analyzer.js` (the analyzer), `tests/assemble_html.js` (`assembleHtml`),
  `tests/build_output.js` (what `npm run build` wrote to `dist/`), `tests/planner_path.js` (`tests/helpers/planner-path.js`, which
  finds the built planner, fails with a clear message when it is not built).

- `tests/unit/` — the Vitest unit tests for `core/` (design `docs/superpowers/specs/2026-10-21-vitest-design.md`, plan
  `docs/superpowers/plans/2026-10-21-vitest.md`), configured by `vitest.config.mjs` (two projects, `us` and `canada`; each passes its
  country as an ssr resolve condition for `#country/*` and as `inject('country')`). Layout: `clock.js` (pins the system time to
  2026, the only setup file), `shared/*.test.js` (run in both projects: the guards `guard-imports`, `guard-exact` and
  `guard-isolation`, and the tests of the helpers), `us/*.test.js` (US project only), `canada/*.test.js` (Canada project only)
  and `helpers/`. Every test calls `world()` for a fresh module graph and loads `src/` through it. Helpers:
  `world.js` (`world()`, `load`, `setState`, `setTaxYear`; the only file that imports `src/`), `engine.js` (the cached
  `simulate`, `runHistoricalCycles` and `monteCarloSummary`; the uncached `simulateRaw`, `simulateHistoricalRaw` and
  `runHistoricalCyclesRaw`, matching the `window.__test_*` hooks; `simulateHistorical`, `runMonteCarlo`; the suites
  `shared/monte-carlo.test.js` (the seeded Monte Carlo) and `shared/result-cache.test.js` (the result cache) test these),
  `rules.js` (`withRuleRow`, `withCompiledFlags`), `count.js` (`makeCounter`), `markup.js` (values the old pages read from the
  DOM or the markup), `us-contributions.js` (the contribution-function hooks), `bond-refill.js` (the cases of
  `refillBondReserve` and `rotateIntoBondLadder` shared by the two `bond-refill` files), `historical-parity.js` (the scenarios
  and comparison of the two `historical-parity` files) and `us-plan.js` (a port of the test-only plan-mode hooks
  `__test_runPlanMode`, `__test_planTrace` and `__test_rowFnFor` of `src/us/ui/install-test-hooks.js`, and in `usOptimizer` of
  its optimizer hooks `__test_simulate`, `__test_optimizeRothLadderPerYear(selected, objective)`,
  `__test_optimizeMultiLever(selected, options, objective)`, `__test_objectiveScore(id, sim)`, `__test_objectiveBreakdown(sim)`
  and the override setters, each re-planning the cliff plan first as `ensureTestPlan` does; keep it in step with that installer)
  and `multi-lever.js` (the ACA-cliff scenario, `optimizerWorld` and the counted checks of the optimizer suites). `tests/estate_optimizer.js` is the one Playwright remnant of the move to Vitest (the 5 optimizer-ranking checks
  of the old `estate` script, which need the `ui/` `computeRothOptimizer`). See "Where a new test goes" in CLAUDE.md.
- `tests/unit/us/flat-bracket.test.js` (Vitest, in `npm test`, 11 checks): the flat-bracket card's pick `pickFlatBracket` (a
  tie keeps the current bracket, else the lowest tied; the guardrail drops a higher score that depletes; the passing pool still
  ranks the later depletion first; when nothing passes, the latest depletion group and the $1 tie) and the shared guardrail
  `notWorseThan` (literal cases).
- The optimizer suites (Vitest, in `npm test`; converted from the root scripts `test_roth_optimizer_per_year.js` and
  `test_multi_lever_optimizer.js`): `tests/unit/us/roth-optimizer-per-year.test.js` (the coordinate-ascent trap, a brute-force
  cross-check of a 3-year window, the depletion guardrail, determinism, the eval budget and the window edge cases) and
  `tests/unit/us/multi-lever-optimizer.test.js`, `-mix`, `-combined` and `-determinism` (the mix weights, a forced mix year, the
  levers alone and together, the smoothed A/B, the Roth-only wrapper, determinism, the search windows, the final pick
  `pickGuardedRun`, the required objective id, the result's `score` / `value` / `gain` / `breakdown`, and the same `endValue`
  answer in either display mode). The mechanics checks search on `'lifetimeCost'` (the old cost's choices). They run the
  optimizers at the full eval budget, so they are the slow part of `npm run test:unit` (about 40 s for the determinism file
  alone); the multi-lever checks are split by run time across four files so the forks run them in parallel. Their
  wall-clock limits, the comparison with the flat optimizer's starred card row (on `endValue`) and the plan card's same
  answer in nominal and real mode (the multi-lever card's, before V140) stay in the root script `test_optimizer_ui.js`
  (Vitest runs the engine about 1.5-2x slower than the browser, and files in parallel, so a timing there means nothing).
- Stateless-engine checks (design `docs/superpowers/specs/2026-10-22-stateless-engine-design.md`, plan `docs/superpowers/plans/2026-10-22-stateless-engine.md`):
  `tests/unit/shared/engine-ratchet.test.js` (Vitest, in `npm test`; the ratchet: identical inputs give identical output, the order of
  runs does not matter, a deep-frozen state runs, and a historical run planned nested equals one planned after a refresh);
  `tests/engine_purity.js` + `tests/engine-purity.json` (in `npm test`: the `storeModules` list (the single source of the store modules), the `adapters` list (store-reading modules above the engine, excluded from the engine set: the two `store-context.js`, the shared `simulate.js` and US `cliff-plan/planning.js`), the `stillReaching` list of engine modules that still
  reach the store modules, empty in both countries since Stage 4, so the check now means "no engine module reaches the store" and
  fails on any that does, and the registry of every module-level mutable in the engine modules by kind: memo, scratch, constant,
  counter, cache); `tests/analysis_parity.js --base DIR [--households a,b]` (Playwright, not in `npm test`: compares
  `window.__test_analysisBundle()` of two built trees per household, a never-refreshed pass and a refreshed pass, with self-checks
  that the plan households PLAN_G58, PLAN_G62 and PLAN_G58_SCHED still plan and that the no-refresh and planning-control paths are
  exercised; the base of every stateless-engine stage is the stage 1 tree). The households of both live in
  `tests/helpers/plan-households.js`. `__test_analysisBundle` (the tornado, the decision questions, the shortfall searches, the CAGR
  sweep, the unusual-assumption impacts, `us.planEndValue` (the after-tax end value on one historical path), the Roth optimizers and their card, in both display modes; it throws if the state changed)
  and `__test_replaceState` (replace the state as load / undo / reset do, without `render()`) are installed by
  `src/shared/ui/install-test-hooks.js`; each country installer registers its part with `assignCountryAnalysis`.
- `tests/golden.js` — hand-verified year-by-year drawdown/compounding math
  checks, run via `npm test` along with the other `tests/*.js` files listed in
  `package.json` (all wired into CI). `tests/unit/us/tax-brackets.test.js` and
  `tests/unit/canada/tax-brackets.test.js` (Vitest, in `npm test`) cover every tax
  schedule (federal, each state/province, NIIT, OAS clawback) against hand-computed
  literals and per-bracket reference sums; run them whenever a bracket or tax function changes.
- `tests/unit/us/aca-enhanced.test.js` (Vitest, in `npm test`) — the ACA applicable percentage: the enhanced banded table (IRC 36B(b)(3)(A)(iii)) and the regular one, and `acaNetCost` at 200%, 300%, 305% and 500% of FPL (hand-computed).
- `tests/unit/us/aca-reconcile.test.js` (Vitest, in `npm test`) — the return's price: `acaCoverageKind` for each branch, `acaNetCost` with `recon` 1/2/3 (Medicaid stays 0 over the line), and `healthcareCost` capturing `ACA_KIND` (hand-computed); a drift sweep (counted) checks that the in-year price matches `acaCoverageKind` over a MAGI grid crossing the Medicaid line, 100%, 133%, 150% and 400%, in an expansion and a non-expansion state, with the Medicaid box and the enhanced credit on and off, and the 2027 work requirement and its child exemption.
- `tests/unit/us/se-settlement.test.js` (Vitest, in `npm test`) — the 162(l) settlement of a held phase: the identity and the next year's `seSettlementIn`, the settled MAGI against the `ctx.test.seNoSettle` run, the return's price (`acaNetCost` with the paid kind), the legal bound, `settleChoice` (pure), the 400% jump claiming `lo`, the reconciliation price under the Medicaid line and under 133%, an uncredited year claiming the credit, a forced unheld year with no deduction, two returns, the year-0 IRMAA stand-in (step 1 at the premium paid, not the top tier), IRMAA two years on and the appeal at the settled MAGI, the forced pass under a carry in both directions (and an inherited-path re-record net of the refund under a tipping balance due), historical / Monte Carlo determinism, and the Task 5 probe households (5.02 chosen on an exact tie with the year-0 stand-in at the chosen return's MAGI, a forced held year's kind from its realized pricing, an itemizer's settled medical expense, the kinds reset before the capture) (hand-computed or two runs in one process; the cases not constructible are listed in its header).
- `tests/unit/us/se-carry.test.js` (Vitest, in `npm test`) — the 162(l) carry through the test switch `ctx.test.seCarryAt`: a zero carry changes nothing, a refund lowers next year's draw, a refund that tips a draw year into a surplus and a balance due that tips a surplus year into a draw keep the year's guardrail record and `firstWithdrawal` (read from `flowOwn`), and the last year's carry goes to the estate's cash (two runs compared in one world).
- `tests/unit/us/row-cost.test.js` (Vitest, in `npm test`) — `rowCost` / `rowTax` (hand values: the paid figures, or a settled row's return) and the registry's `lifetimeCost` scoring a settled run on its return (the FP 82,000 household).
- `tests/unit/us/se-settlement-plan.test.js` (Vitest, in `npm test`) — the cliff plan judges a held phase on its settled return: the natural record's `realized` and `cliffCost` (the return's premium, IRMAA at the settled MAGI), a kept trial's `cliffCost` at the moved return premium, the natural score as the unsettled score plus `seSettlement` (`ctx.test.seNoSettle`), a stay-under the return breaks is not `ok` and not chosen, `lambdaNeed` unchanged by a carry (`ctx.test.seCarryAt`), and `computeCliffPlan`'s candidate cost from the settled rows (every run through `runPlanMode` with an explicit plan mode; the cases not constructible are listed in its header).
- `tests/unit/us/bracket-search.test.js` (Vitest, in `npm test`, 164 checks) — the cliff plan's bracket search (Batch 5 step 3a, spec A2-A3, the search switched on per test): `bracketCandidateBetter`'s every branch (depletion, the first home draw, the 0.1% threshold edge and the $1 floor; a richer plan drawing on the house sooner never wins), the search's order and report (the CA gap case at 100: brackets 22, 10, 12, 24, 32, 35; the kept bracket owns `candidates` / `kept`; it keeps a higher bracket), skipped for an applied schedule, conversions off, no window age, `bracketSearchOff`, the guard off and `search: false`, and the scan grid's first 24 converting households never deplete or first draw on the house earlier than the user's bracket. And the conversion bracket in the engine (spec A4): a plan carrying `bracket` 24 made for the 22% setting runs as the 24% setting row for row (the CA gap case, and a `marryLater` couple across the marriage), a plan whose `bracketFrom` is not the setting is ignored, the optimizer's override map and an applied schedule win over the plan's bracket, `apply` reproduces `choose` with the bracket held (the CA and NY gap cases), and `sim.homeDrawAge` (an owner with only home equity draws on it in year 0 and depletes later; a renter and a funded owner `null`; not enumerable). Every run through `runPlanMode` with an explicit plan mode (the engine and plan tests). And the optimizers against the searched plan (Task 5): the "today's flat setting" start of the per-year and the multi-lever optimizer (the first trial context each builds with a Roth override map, run once) pins every window age to the plan's bracket and reproduces `selected` row for row on the CA case, whose plan keeps another bracket; and on the per-year optimizer suite's guardrail household (retired at 50, converting 50-58) the suggestion depletes and first draws on the house no earlier than the searched plan. And `computeCliffPlan`'s step 4a options: `rankEvenly` with `tieBracket` 22 keeps the same bracket and the same per-bracket entries at the settings 12 and 22 (CA, TX and a named grid household where the strict-win default differs), `objective: 'lifetimeCost'` scores every entry `-cost` and keeps the cheapest at equal ages, a zero cost scores `+0`, `offMemo` (six keys, reused, equal with and without a memo, also under a `mult`), and `bracketEvenBest`'s tie rules on synthetic entries.
- Batch 5 step 4a suites (Vitest, in `npm test`; spec `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md`): `tests/unit/us/plan-shape.test.js` (23 checks: `makePlan`'s key order, defaults, unknown-field throw and frozen lists; the plans `computeCliffPlan` returns carry `PLAN_KEYS`; every intent `choose` records over every bracket on the gap households and 48 scan households is in the id lists); `tests/unit/us/plan-mult.test.js` (20 checks: `phaseOf` at `rmdStartAge` 73 and 75, the multiplier in the `choose` trace's `lambda`, `[1, 1, 1]` byte-identical to no `mult`, a non-unit `mult` reaching the plan); `tests/unit/us/guard-normalize.test.js` (the stored plan's guard: a valid plan kept as the same object and JSON, the default `null`, 23 malformed kinds each dropping the whole plan, the `rothConvBracket` fallback, the inlined objective ids equal the registry's); `tests/unit/us/stored-plan.test.js` (99 checks: `storedPlanVerdict`'s table; the automatic plan stored as is is used on a tie and the rest of the report is unchanged; no stored plan, no `stored` key; the `score`, `depletes`, `home` and `lifetimeCost` verdicts; a changed bracket setting; another tax year; the guard off; the summary of an applied plan); `tests/unit/shared/success-with.test.js` (both projects: `monteCarloSeed` leaves out `storedPlan`; `runHistoricalCyclesWith` / `monteCarloSummaryWith` equal the fresh functions on US and Canada households, the wrappers return the With entry, another plan has its own entry, the key leaves out `storedPlan`); `tests/unit/us/plan-search.test.js` (154 checks: `optimizePlan` on the gap households at 100 and 75 never earlier than base, at least base's score, its winner reproduced through `apply`, deterministic; the depleting household; a stored search winner (SINGLE52, `lifetimeCost`) used with `'better'` and kept by a second search; a win by later depletion (HOH58); a household with legacy schedules).
- `tests/unit/us/state-rules.test.js` (Vitest, in `npm test`; US only, the Canada table is covered by `tests/unit/canada/province-rules.test.js`) — the state-tax table: every jurisdiction present, every field explicit, schema ranges.
  `tests/unit/us/state-mechanisms.test.js` — each mechanism on a synthetic jurisdiction `zz` (hand-computed): recapture, step tables,
  every credit kind, per-person exclusions, columns, indexing, and the `taxFor` per-person plumbing.
  `tests/bench_runs.js [--root DIR]` — the timing gate (400 `simulate()` + 120 historical runs, median of 3, per
  state); not in `npm test`; compare a worktree of the previous commit (run `npm ci && npm run build` in the worktree first) with the working tree (+5% allowed).
  Wall-clock noise between runs is ±10% on this machine, so for a decision compare two trees in ONE process, interleaved
  (load each tree's `Planner_US.html` in its own page, alternate rounds, take medians), and use `bench_runs.js` for the record.
  `tests/bench_runs_interleaved.js --base DIR [--rounds 11] [--states ...]` is that comparison: bench_runs.js's workload,
  two trees in one process, interleaved rounds, medians; not in `npm test`; `--household appeal` (E3) times the IRMAA
  appeal household (age 66, retiring at 67) instead of the default one; `--warm-analysis` runs `window.__test_analysisBundle()`
  once on each tree's page before the timed rounds (both trees need the hook: the stateless-engine stage 1 tree and later), so the
  variant contexts of the tornado, decision questions and optimizers have reached the hot functions first and a context-shape slip
  (a second hidden class, see the hot-path rules) shows in the gate; the stateless-engine stage gates use it.
  `tests/bench_heavy.js [--root DIR] [--states ...]` — per state: a slider move with every results card closed, with only
  the tornado card open and with all open, one Monte Carlo run and one per-year Roth optimizer run; uses only hooks that exist
  at the 7C merge so it runs unchanged on an old worktree; not in `npm test`.
  `tests/bench_input.js [--root DIR] [--planner us|canada|both] [--steps N] [--drag N] [--views proj,hist,mc]` — slider
  responsiveness (responsiveness PR B): per planner, chart view and card setting (all closed, all open), on a fresh page, the
  synchronous time of one `input` step (median, p90), a drag of one `input` per animation frame (median and longest frame gap,
  total) and the `change` that ends it (the deferred pass); uses only the DOM, so it times old builds too; not in `npm test`.
  Per-year solver scripts (3C, US; none in `npm test`): `tests/bench_solver.js --base DIR [--rounds N]` — interleaved timing
  (two trees, one process, medians) of one `simulate()` and one historical path for the ACA early retiree (CA, the +30% gate)
  the converting ACA early retiree (conversions to 74 at 22%, the bracket search on in the head tree; +30% gate) and the default household. `tests/solver_scan.js [--root DIR]` — the cliff-plan sweep: 864 households (the 768 plus the first 48 conversions-on ones with RI and with PA), default order and smooth, the
  plan applied vs `off`: value / cost / depletion better-equal-worse on the standard projection, then every historical
  start year and 200 seeded Monte Carlo paths (success with and without the plan, per-path after-tax value and Roth /
  traditional / taxable differences, `planStats`, the moved-sample cross); exits 1 if a household's plan depletes earlier
  than off on the standard projection (about 18 minutes); since Batch 5 step 3a also the bracket search on vs off and the guard on vs off, with a first-home-draw-age column, an earlier depletion or first home draw under the kept plan than under the user's bracket counting as a failure. `tests/bench_plan.js` — the planning gate (`refreshCliffPlan()`
  at most 5x one `off` projection, four households). `tests/solver_gap.js [--root DIR] [--budget N] [--lengths L] [--objective endValue|lifetimeCost] [--levers all|roth] [--shipped auto|optimized]` — the gap table: the shipped engine (guard on,
  default order) against a slow reference (`optimizeMultiLever` with a 200,000-evaluation budget through
  `window.__test_setOptimizerBudget`) on three households at life expectancy 75 and at the planner's own (100, `--lengths`);
  two scores: lifetime real tax + healthcare (table 1's cost; the default objective is now the end value) and that plus the tax still owed on traditional at
  the end (`afterTaxEndValueUS`'s pricing; Batch 5 step 0), the best flat bracket under the second, after-tax end value,
  amounts converted (about 5 minutes); since Batch 5 step 3a the shipped column is the kept plan (bracket search on), the flat brackets run with it off, and a kept-plan table prints the A5.4 check per case (exit 1 on a failure); the reference optimizes `--objective` (default `endValue`); `--shipped optimized` (Batch 5 step 4a) reads the shipped column from the plan card's search (`__test_optimizePlan(objective)`'s plan run through `apply`) and prints its winner, multipliers, gain and seconds first (default `auto`, the kept plan, unchanged output). `tests/plan_mult_table.js [--root DIR] [--objective endValue|lifetimeCost] [--sample every16|conv] [--no-gap] [--limit N]` — the lambda table (Batch 5 step 4a, spec section 9): on the gap households at 75 and 100 and a 48-household scan sample, the plan card's search per phase (before 65, 65 to the RMD start, RMD years): the multiplier kept, the gain over the `[1, 1, 1]` start and over the automatic plan, the share of the phase's plan years with `movedSample` (`__test_planTrace()`), and per-phase counts; measurement only, about 2 minutes. `tests/bench_optimizer.js [--root DIR] [--budget N] [--rounds N] [--objective endValue|lifetimeCost]` — the optimizer's
  performance baseline (Batch 5 step 0): `optimizeMultiLever` (Roth + mix + smooth) timed on six US households, with the
  evaluations used, ms per evaluation and the lever windows searched against `ROTH_PER_YEAR_MAX_WINDOW`.
  `tests/unit/us/tax-caches.test.js` (Vitest, in `npm test`) — the
  guard for the tax-code memos and the per-row `needsPerPerson` flag: identical doubles (`Object.is`), never a tolerance.
- `tests/unit/canada/benefit-rules.test.js` / `tests/unit/canada/gis-tables.test.js` / `tests/unit/canada/benefits.test.js` (Vitest, in `npm test` through `vitest run`) — the Canada income-tested benefit table coverage, every row of the ESDC GIS tables against the fitted knots, and hand-computed benefit cases (see [canada-benefits.md](canada-benefits.md)); `docs/sources/` holds the ESDC tables and the extraction script.
- `tests/deductions.js` — US federal deductions (age-based standard deduction,
  senior deduction through 2028, SALT cap schedule, simplified itemizing, the
  $750,000 mortgage-debt limit), hand-computed, plus engine-level cases with the
  clock pinned. `tests/medicare_enrollment.js` — Medicare/IRMAA start at
  `max(65, retirement age)`.
- `tests/child_dependents.js` — the children list: `normalizeState` cleaning, `dependentsInYear` /
  qualifying-child ages, and the US ACA household size and its effect on the 400%-FPL cliff; E2: the join year (normalization,
  dependents, the US ACA household, Medicaid child-13 test, filing status and credits, a US engine case, the Canada CCB).
- `tests/aca_medicaid.js` — Medicaid and the premium-credit floor in `acaNetCost` (hand-computed: expansion, non-expansion and
  Wisconsin at several shares of the poverty line, the checkbox, 2026 versus 2027, the child-13 exemption, all 51 codes, engine rows).
  `tests/irmaa_appeal.js` — E3: the lookback's filing status and the IRMAA appeal (form SSA-44), hand-computed;
  `test_irmaa_appeal.js` (Playwright, `npm run test:ui`) covers the status tooltip and the callout.
  `tests/bracket_search.js` (in `npm test`, after `cliff_plan.js`; about 16 s) — the bracket-search guard (spec A5.3): the scan grid's 384 conversions-on, default-order households plus the first 48 of them with RI and with PA (decision 16), the kept plan (search on) against the user's-bracket plan (search off) on the standard projection; exits 1 on an earlier depletion or an earlier first home draw (`null` = never = latest); prints its seconds.
  `tests/hist_depletion_cause.js DIR_A DIR_B` — no browser, not in `npm test`: reads two `node tests/snapshot.js --dump` outputs and classifies each `hist ...` or shifted `std ... shift+-N` US scenario that depletes earlier in B as a bridge drain (B has an `earlyPenalty` before the youngest partner's 59.5, converted more at an earlier age than A, A has none) or market variance (spec A5.1); exits 1 on any bridge drain.
  `tests/pa_employer_plan.js` — Pennsylvania's employer-plan exclusion end to end (the engine, per-filer 401(k) shares, hand-computed
  including the 10% early-withdrawal penalty). `tests/ri_ira_exclusion.js` — Rhode Island's exclusion end to end (401(k) money
  from 67 qualifies, IRA money never; hand-computed). `tests/state_child_credits.js` — the state child credits (MN, VT, UT, OR, ME, NJ) run
  through each row's real credit literals on a flat-10% synthetic base.
- `tests/income_streams.js` — income stream owner and kind (E1b, US): `streamAmountsForYear`, payroll tax on stream wages, the ACTC,
  two-return and survivor cases, hand-computed. `tests/stream_contributions.js` — `streamPlanContributions` and its rooms through
  `retirementContributions` and the engine. `tests/survivor_salary.js` — a partner who dies before retiring stops working at death
  (both planners). `test_income_streams.js` (Playwright, `npm run test:ui`) covers the stream rows' owner/kind/panel controls.
- `tests/lump_income.js` — E1d (US): `lumpAmountsForYear`, payroll tax and the return placement of taxable lumps, gain lumps in `taxFor`, the NIIT active-business exclusion, dead-owner and survivor cases, hand-computed. `test_lump_income.js` (Playwright, `npm run test:ui`) covers the one-time income rows' kind/owner/gain controls.
- `tests/inherited_accounts.js` — E1e (US): `singleLifeFactor`, `inheritedDraw` (the floor and cap sweep, stretch rows), `inheritedLedger`, the five state kinds through `taxFor` (the sources scratch objects never stale), the account in the engine (federal, ACA, IRMAA, NIIT, the Roth fill, owner B on two returns, the survivor and the successor rule), the need readers (decisions 15, 16), the last resort's placements and its identity against a scheduled draw, the fourth estimate, the receipt-year slot, the fill convergence bound, hand-computed. `test_inherited_accounts.js` (Playwright, `npm run test:ui`) covers the inherited kinds' owner/gain controls, a kind change reaching the projection, and the status tooltip.
- `tests/unit/us/self-employment.test.js` (Vitest, in `npm test`) — E1c (US): `selfEmploymentTax` (the 92.35% base, the $400 floor, the wage-base interaction, half deducted),
  `soloPlanContributions` (deferral room after W-2 plans, profit sharing C x r / (1 + r), one annual-additions room, IRA, all from household
  cash) and the engine plumbing, hand-computed. `tests/se_health.js` — W-2 stream premium as coverage (`streamCoverBits`), the 162(l)
  deduction inside the MAGI iteration (`seHealthDeduction`: caps, spouse-plan bar, two returns, the band case, the Roth fill, the cliff-plan
  replay), the invariant grid of the settlement (spec section 8 (a)-(e), (c2): legal bound, return's price, 0 understated, best candidate,
  identity, carry) and the base-pinned identity cases, a phased choose run with no held phase among them (`SE_CASE='base identity'`; `SE_BASE_DIST=<dir>` runs them on another build to
  print the hashes recorded against `d8e3cee`). `tests/survivor_symmetry.js` also runs identical self-employed partners with a settled
  year before the death year (the carry reaches the survivor). `tests/unit/us/qbi.test.js` (Vitest, in `npm test`) — `qbiDeduction` (threshold, phase-in, cap, the $400 minimum) and the engine. `test_self_employment.js`
  (Playwright, `npm run test:ui`) covers the income-type buttons and the stream `self` kind in the UI.
- `tests/field_registry.js` — guards the field registry (see `FIELDS`): every
  sidebar control registered, every entry resolvable, MCP schema == registry.
- `tests/legacy_state.js` — a corpus of old/partial/invalid saved states whose
  `normalizeState()` result is pinned (`tests/snapshots/legacy_state.json`); run it
  when touching `normalizeState`, `normalizeLists`, or an enum guard.
- `tests/unit/us/account-ledger.test.js` (Vitest, in `npm test`) — the US per-account share ledger (contribution routing,
  conversion order, MAGI-iteration rewind, share invariants); `tests/account_inputs.js` —
  how the eight account inputs, the Roth basis rules, single-person mode and the opening
  ownership ratio feed the engine; `tests/unit/us/contribution-limits.test.js` (Vitest, in `npm test`) — the plan limits, catch-ups,
  compensation limit, contribution order and profit sharing (hand-computed). `tests/unit/helpers/scan-grid.mjs` — test helper (ESM): `GAP_CASES` (the gap table's three households, `patch(lifeA, lifeB)`) and
  `scanHouseholds({ conversions, mode })` (the 768-household sweep grid, `{ name, patch, g }` each, in the sweep's interleaved order);
  Vitest suites import it directly, the CommonJS scripts (`solver_gap.js`, `solver_scan.js`, `cliff_plan.js` F2) through
  `await import(pathToFileURL(...))`; it re-exports `legacyToAccounts`. `tests/legacy_balances.js` — test helper that turns the old
  pooled vocabulary (`traditional`, `roth`, `traditionalSharePctA`, `rothBasisPct`) into the
  per-partner account fields (`legacyToAccounts` for state patches, `translateFieldList` and
  `setBalance` for DOM-driven tests); the snapshot grid and many older tests still speak the old
  vocabulary through it. `test_wizard_accounts.js` — the three-step US wizard and the
  Retirement accounts group.
- `tests/unit/{us,canada}/bond-refill.test.js` (Vitest, in `npm test`, one file per planner) — the cases are in `tests/unit/helpers/bond-refill.js`: hand-computed unit tests of `refillBondReserve` (cap, order,
  realized gain, never home/cash) and of `rotateIntoBondLadder`, plus engine checks of the cap and the surplus path.
- `tests/unit/{us,canada}/historical-parity.test.js` (Vitest, in `npm test`, one file per planner; the scenarios and the
  comparison are in `tests/unit/helpers/historical-parity.js`) — runs a constant-return historical path (equal to
  the plan's own assumptions, `bondYears: 0`) next to `simulate()` and asserts every
  shared row field agrees year by year; the US file also checks the safe-MAGI wiring in the source and that `apply` with
  an empty plan equals `off`. `tests/historical_rates.js [--root DIR]` prints the historical and (seeded from the inputs; `--seed` applies only to an older, unseeded --root tree)
  Monte Carlo success rates for a few scenarios, for before/after tables; not in
  `npm test`.
- `tests/snapshot.js` + `tests/snapshot_scenarios.js` + `tests/snapshots/{us,canada}.json`
  — exact-match characterization test of `simulate()`/`simulateHistorical()`
  over ~435 US / ~340 Canada scenarios (standard, retirement-age shifts, and
  historical/Monte-Carlo-style paths); the committed baseline stores hashes.
  `tests/snapshot_ui.js` + `tests/snapshots/ui_*.json` pins field wiring (each
  sidebar control: state change, visibility, reload round trip), the MCP tool
  schema, a clean load at desktop/mobile width, and rendered-results text. Both
  run in `npm test`. **Only run `npm run snapshot:update` for an intended
  behavior change**, and say so in the commit; a pure refactor must leave the
  baseline untouched. To see *what* changed after a failure:
  `node tests/snapshot.js --root <worktree of good ref> --dump A --update-nothing` (run `npm ci && npm run build` in the worktree first),
  `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`.
- `test_*.js` (repo root, committed) — Playwright scripts covering UI/feature behavior (22: the wizard, children, the
  add-as-you-go lists, income streams, one-time income, inherited accounts, self-employment, the legacy schedules' Apply and Clear,
  the plan card and the optimizers' wall-clock limits, the plan optimizer card, the category rail, info bubbles, ...). `tests/ui_scripts.js` runs every root `test_*.js` (found by name, two
  at a time; `test_optimizer_ui.js`, which asserts wall-clock limits, runs alone afterwards: the `SERIAL` set) and fails if any fails: `npm run
  test:ui` (builds first, about 2½ minutes), its own CI step after `npm test`. Run one with `node test_foo.js`.
  `test_result_cache.js` (both planners) freezes every cached simulation result (`window.__test_freezeSimResults`), visits every view, dollar display, path count and card, and asserts no page error (no caller writes to a cached result) and a stable Monte Carlo success figure across view, card and slider round trips (flushing the deferred render after the slider).
  `test_deferred_render.js` (both planners, page clock) checks the deferred render: an `input` redraws the projection at once and
  leaves the Monte Carlo view and an open card stale (class and `aria-busy`) with their last picture; `window.__test_flushRender()`,
  the field's `change` and 250 ms idle (restarted by each input) draw them exactly as a full render does; a full render clears a
  pending pass.
  `test_plan_optimizer.js` (US, Batch 5 step 4a) checks the plan card (`src/us/ui/results/plan-optimizer.js`; hooks
  `__test_optimizePlan(objective)`, `__test_applyStoredPlan(result)`, `__test_clearStoredPlan()`, `__test_planOptimizerCard()`):
  on SINGLE52 of `tests/unit/us/plan-search.test.js` (lifetimeCost), loaded through the autosave, Search shows a gain and four
  rates, Apply stores the plan and the dashboard rows are its `apply` run and the Monte Carlo rate the card's "with" rate; undo
  (the toast); a drawn search gone stale (spending typed, then another tax year through `__test_setCurrentYear`: Apply hides,
  the card says to search again, Apply is refused; back to the searched inputs, Apply shows); the reload round trip; a stale plan still used (Partner A's life expectancy one year off) and one no longer used
  (spending up: the reason, the automatic plan's rows; the rows drawn from the last input through the flush switch plan at most
  once); the guard off; Clear; the gap table's TX single at life 100 and the depleting household (no Apply, "already the best");
  Apply over a legacy schedule (cleared, not stale, the bracket search back on); Search right after Apply ("your applied plan");
  a saved scenario with the stored plan in the comparison (typing plans nothing for it; loading it gives its row); 390 px. It
  prints the card's Search wall time (search and the four rates). `test_apply_optimizer_schedule.js` keeps the legacy schedules'
  apply-and-clear through the hooks (`__test_optimizeMultiLever`, `__test_applyMultiLeverSchedule`, the status line's links).
  `test_bracket_search.js` (US, Batch 5 step 3a) checks the cliff plan's bracket search in the deferred pass, with the search on
  (`__test_setBracketSearch(true)`) on the gap table's CA couple at life 100: a full render searches at once; a spending `input`
  leaves the search pending (`__test_cliffPlanState()`), plans once with no other planning (`__test_cliffPlanComputes()`,
  `__test_planForStateComputes()`) and shows the user's-bracket plan's `apply` rows; the `change` event, and
  without it the idle pause, run the search and redraw the rows with the kept plan (24%, not 22%). Task 5: the plan summary's
  conversion clause (none while pending; "the cliff plan uses the 24% bracket, not your 22%, within your conversion ages"; at
  $120k "your 22% bracket (no other flat bracket does better)"); a full refresh between the input and the flush
  (`__test_simulate()`) still leaves the kept plan's rows; the flat-bracket card's 22% row (`__test_rothOptimizerCard()`) is the
  22% run with the kept intents and its 24% row the kept plan; the card's wording (its 24% row "(cliff plan)", the 22% "(your
  setting)", the summary against the cliff plan's 24%) and the per-year card's ("the cliff plan's flat 24%", a small budget via
  `__test_setOptimizerBudget`), and at $120k both worded against "your current 22%" as before; the decision question's ladder row names the plan's bracket;
  conversions off drops the clause and changes `fireProjectionRows`; no horizontal scroll at 390x844. With a scenario comparison
  open (a saved scenario, its compare box checked), a spending `input` runs no `planForState` planning and the comparison's
  "Current (live inputs)" end assets equal the dashboard's (the user's-bracket plan); `change` and the idle pause move that row to
  the kept plan, still with no `planForState` planning (final review item 1).
