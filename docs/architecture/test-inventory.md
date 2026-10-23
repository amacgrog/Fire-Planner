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
  its optimizer hooks `__test_simulate`, `__test_optimizeRothLadderPerYear`, `__test_optimizeMultiLever`, `__test_rothScheduleCost`
  and the override setters, each re-planning the cliff plan first as `ensureTestPlan` does; keep it in step with that installer)
  and `multi-lever.js` (the ACA-cliff scenario, `optimizerWorld` and the counted checks of the optimizer suites). `tests/estate_optimizer.js` is the one Playwright remnant of the move to Vitest (the 5 optimizer-ranking checks
  of the old `estate` script, which need the `ui/` `computeRothOptimizer`). See "Where a new test goes" in CLAUDE.md.
- The optimizer suites (Vitest, in `npm test`; converted from the root scripts `test_roth_optimizer_per_year.js` and
  `test_multi_lever_optimizer.js`): `tests/unit/us/roth-optimizer-per-year.test.js` (the coordinate-ascent trap, a brute-force
  cross-check of a 3-year window, the depletion guardrail, determinism, the eval budget and the window edge cases) and
  `tests/unit/us/multi-lever-optimizer.test.js`, `-mix`, `-combined` and `-determinism` (the mix weights, a forced mix year, the
  levers alone and together, the smoothed A/B, the Roth-only wrapper, determinism and the search windows). They run the
  optimizers at the full eval budget, so they are the slow part of `npm run test:unit` (about 40 s for the determinism file
  alone); the multi-lever checks are split by run time across four files so the forks run them in parallel. Their
  wall-clock limits and the comparison with the flat optimizer's starred card row stay in the root script `test_optimizer_ui.js`
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
  and the default household. `tests/solver_scan.js [--root DIR]` — the cliff-plan sweep: 768 households, default order and smooth, the
  plan applied vs `off`: value / cost / depletion better-equal-worse on the standard projection, then every historical
  start year and 200 seeded Monte Carlo paths (success with and without the plan, per-path after-tax value and Roth /
  traditional / taxable differences, `planStats`, the moved-sample cross); exits 1 if a household's plan depletes earlier
  than off on the standard projection (about 18 minutes). `tests/bench_plan.js` — the planning gate (`refreshCliffPlan()`
  at most 5x one `off` projection, four households). `tests/solver_gap.js` — the gap table: the shipped engine (guard on,
  default order) against a slow reference (`optimizeMultiLever` with a 200,000-evaluation budget through
  `window.__test_setOptimizerBudget`) on three short plans; cost, after-tax end value, amounts converted (about a minute).
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
  replay). `tests/unit/us/qbi.test.js` (Vitest, in `npm test`) — `qbiDeduction` (threshold, phase-in, cap, the $400 minimum) and the engine. `test_self_employment.js`
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
  compensation limit, contribution order and profit sharing (hand-computed). `tests/legacy_balances.js` — test helper that turns the old
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
- `test_*.js` (repo root, committed) — Playwright scripts covering UI/feature behavior (20: the wizard, children, the
  add-as-you-go lists, income streams, one-time income, inherited accounts, self-employment, the optimizer card's Apply button,
  the optimizer card and the optimizers' wall-clock limits, the category rail, info bubbles, ...). `tests/ui_scripts.js` runs every root `test_*.js` (found by name, two
  at a time; `test_optimizer_ui.js`, which asserts wall-clock limits, runs alone afterwards: the `SERIAL` set) and fails if any fails: `npm run
  test:ui` (builds first, about 2½ minutes), its own CI step after `npm test`. Run one with `node test_foo.js`.
  `test_result_cache.js` (both planners) freezes every cached simulation result (`window.__test_freezeSimResults`), visits every view, dollar display, path count and card, and asserts no page error (no caller writes to a cached result) and a stable Monte Carlo success figure across view, card and slider round trips (flushing the deferred render after the slider).
  `test_deferred_render.js` (both planners, page clock) checks the deferred render: an `input` redraws the projection at once and
  leaves the Monte Carlo view and an open card stale (class and `aria-busy`) with their last picture; `window.__test_flushRender()`,
  the field's `change` and 250 ms idle (restarted by each input) draw them exactly as a full render does; a full render clears a
  pending pass.
