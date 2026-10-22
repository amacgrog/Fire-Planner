# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators
for a couple or single person — one for the US, one for Canada. The source lives
in `src/<country>/` (`index.html` markup shell, `main.js`, and modules) and `src/shared/` (modules, the stylesheet and HTML partials);
`npm run build` (esbuild, `scripts/build.js`) assembles each into one
self-contained `dist/Planner_US.html` / `dist/Planner_Canada.html` with the CSS and
JS inlined. The built file needs no server and no network: opening it in a browser
is the whole runtime. `dist/` is gitignored and published to GitHub Pages by CI;
**edit `src/`, never `dist/`**. Code both planners use is one module under `src/shared/`
that each planner imports (see "Shared code between the planners" and
`docs/superpowers/specs/2026-10-10-modular-build-design.md`). Plans, specs and notes
dated before 2026-10-11 describe the old layout, where `Planner_*.html` at the repo
root was the source; notes written before stage 4 name shared code by its `@@shared`
region, and `docs/superpowers/inventory/stage{2,3,4}-region-map.md` say which module now
holds it. See `README.md` for the full user-facing feature list.

## Files

- `src/us/` and `src/canada/` — each planner's source: `index.html` (markup shell with
  `{{css}}` and `{{js}}` placeholders and `<!-- @@include name -->` lines) and `main.js`
  (the entry point: an import block and one IIFE of start-up calls, no declarations). All the
  code lives in modules: `src/<country>/core|ui/` for country code and `src/shared/core|ui/`
  for code both planners use (see "Modules, the entry point and the tools" below).
  `docs/superpowers/inventory/module-map.md` lists every module with its exports and purpose.
- `scripts/build.js` + `scripts/lib/assemble-html.js` — the build. `dist/Planner_US.html`
  and `dist/Planner_Canada.html` are its output (gitignored). **Stable filenames**:
  never rename these or create version-numbered copies — every update is a `git commit`
  to `src/`, and the built names never change.
- `scripts/analyze-closure.js` — writes `docs/superpowers/inventory/closure-*.md`, the
  per-unit dependency inventory of each `main.js` the module split was planned from (today
  59 US / 54 Canada units, all statements). `scripts/module-map.js` writes
  `docs/superpowers/inventory/module-map.md`; `npm run analyze` runs both.
- `docs/superpowers/inventory/` — the generated inventory and module map, the region maps
  (`stage2-region-map.md`, `stage3-region-map.md`, `stage4-region-map.md`: which module holds each
  old `@@shared` region's units) and `stage4-open-items.md` (the deferred limits and cleanups of stage 4).
- `src/shared/` — code both planners import. `src/shared/core/` is DOM-free and importable in plain Node: at its top the state modules `store.js` (`state`, `mode`, `scenarios`, `compareIds`), `chart-prefs.js` (the chart display preferences) and `tax-factors.js` (`histTaxFactors`); every other module is in a topic folder (see "Where new code goes"). `src/shared/ui/plans/storage.js` holds the storage keys and the localStorage probe. `src/us/core/` holds US-only state (`tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`). `src/package.json` makes `src/` ES modules and defines the `#country/*` alias (below).
- `src/shared/styles/styles.css` and `src/shared/partials/*.html` — the stylesheet and the shared HTML partials. Edit them there:
  `scripts/build.js` reads them, and `assembleHtml` splices each partial in at the `<!-- @@include name -->` line of a shell.
- `scripts/plan-extraction.js` + `scripts/extract-units.js` (code in `scripts/lib/extraction-plan.js`, `extract-units.js`,
  `marker-source.js`) — the tool that moved top-level units out of `main.js` into modules. `scripts/extractions/stage2.json`,
  `stage3.json` and `stage4.json` are the plans it applied (every module with its unit labels and batch; from stage 3 the seam
  names and the mutable-binding report, in stage 4 also the facade side of each seam name and each module's wiring functions);
  `stage4-topics.json` placed every stage 4 unit and statement, `stage4-reserved.json` lists the names a wiring function may not
  take, `stage4-expected.json` the stage's recorded numbers, and `names.json` the module-name overrides of stages 2-3.
- `scripts/regroup-modules.js` (code in `scripts/lib/regroup.js`) — renames, merges and moves modules by a map
  (`scripts/extractions/stage4-regroup.json` is the stage 4 tidy). `scripts/lib/load-time.js` (inert initializers, the
  `// load-time:` marker, the load-time guard) and `scripts/lib/module-graph.js` (the import graph per country) are shared by
  the tools and `tests/ui_cycles.js`. `scripts/compare-builds.js --base DIR [--ordered]` compares the built planners of two
  trees statement by statement (run it after any change that only moves code; see "Modules, the entry point and the tools").
- `tests/state_modules.js` (the state modules in plain Node), `tests/country_contract.js` (the `#country` seam contract, code in
  `scripts/lib/country-contract.js`), `tests/closure_names.js` (no undeclared name in any `src/**/*.js`), `tests/core_purity.js`
  (no browser global, DOM method call or `ui/` import in any `src/**/core/` file; it reads only `core/` files),
  `tests/core_import.js` (every `core/` module imports in plain Node, one fresh process per module), `tests/ui_cycles.js` (import
  cycles only among `ui/` modules: a cycle with a member outside `ui/` fails; and every `ui/` and `core/` module passes the load-time guard),
  `tests/main_entry.js` (each `main.js` is imports plus one IIFE of calls and if statements), `tests/doc_paths.js` (every
  module path under `src/` named in this file and in `docs/superpowers/inventory/*.md` exists), `tests/module_map.js` (the module-map
  script's write and check modes, on fixture trees), `tests/no_bare_imports.js` (no
  `import './x.js';` in `src/`), `tests/module_names.js` (no module file name ending in `-<digits>.js`), `tests/src_paths.js` (every file under `src/` has a side: `core/`, `ui/` or entry), `tests/no_markers.js`
  (no `@@shared` marker anywhere in `src/`), `tests/extraction_plan.js` / `tests/extract_units.js` / `tests/marker_source.js` /
  `tests/regroup_modules.js` / `tests/compare_builds.js` (the extraction tool, its helper, the regroup tool and the build
  comparison, on fixture trees), `tests/closure_analyzer.js` (the analyzer), `tests/assemble_html.js` (`assembleHtml`),
  `tests/build_output.js` (what `npm run build` wrote to `dist/`), `tests/planner_path.js` (`tests/helpers/planner-path.js`, which
  finds the built planner, fails with a clear message when it is not built).
- `index.html` — a small landing page linking to both tools. It is the landing page *template*: the build copies it
  into `dist/`, where its relative links to the two planners resolve; at the repo root those links point at files that do not exist.
- `tests/golden.js` — hand-verified year-by-year drawdown/compounding math
  checks, run via `npm test` along with the other `tests/*.js` files listed in
  `package.json` (all wired into CI). `tests/unit/us/tax-brackets.test.js` and
  `tests/unit/canada/tax-brackets.test.js` (Vitest, in `npm test`) cover every tax
  schedule (federal, each state/province, NIIT, OAS clawback) against hand-computed
  literals and per-bracket reference sums; run them whenever a bracket or tax function changes.
- `tests/unit/us/state-rules.test.js` (Vitest, in `npm test`) — the state-tax table: every jurisdiction present, every field explicit, schema ranges.
  `tests/unit/us/state-mechanisms.test.js` — each mechanism on a synthetic jurisdiction `zz` (hand-computed): recapture, step tables,
  every credit kind, per-person exclusions, columns, indexing, and the `taxFor` per-person plumbing.
  `tests/bench_runs.js [--root DIR]` — the timing gate (400 `simulate()` + 120 historical runs, median of 3, per
  state); not in `npm test`; compare a worktree of the previous commit (run `npm ci && npm run build` in the worktree first) with the working tree (+5% allowed).
  Wall-clock noise between runs is ±10% on this machine, so for a decision compare two trees in ONE process, interleaved
  (load each tree's `Planner_US.html` in its own page, alternate rounds, take medians), and use `bench_runs.js` for the record.
  `tests/bench_runs_interleaved.js --base DIR [--rounds 11] [--states ...]` is that comparison: bench_runs.js's workload,
  two trees in one process, interleaved rounds, medians; not in `npm test`; `--household appeal` (E3) times the IRMAA
  appeal household (age 66, retiring at 67) instead of the default one.
  `tests/bench_heavy.js [--root DIR] [--states ...]` — per state: a slider move with every results card closed, with only
  the tornado card open and with all open, one Monte Carlo run and one per-year Roth optimizer run; uses only hooks that exist
  at the 7C merge so it runs unchanged on an old worktree; not in `npm test`.
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
- `tests/unit/canada/benefit-rules.test.js` / `tests/unit/canada/gis-tables.test.js` / `tests/unit/canada/benefits.test.js` (Vitest, in `npm test`) — the Canada income-tested benefit table coverage, every row of the ESDC GIS tables against the fitted knots, and hand-computed benefit cases (see "Income-tested benefits"); `docs/sources/` holds the ESDC tables and the extraction script.
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
  `test_irmaa_appeal.js` (Playwright, not in CI) covers the status tooltip and the callout.
  `tests/pa_employer_plan.js` — Pennsylvania's employer-plan exclusion end to end (the engine, per-filer 401(k) shares, hand-computed
  including the 10% early-withdrawal penalty). `tests/ri_ira_exclusion.js` — Rhode Island's exclusion end to end (401(k) money
  from 67 qualifies, IRA money never; hand-computed). `tests/state_child_credits.js` — the state child credits (MN, VT, UT, OR, ME, NJ) run
  through each row's real credit literals on a flat-10% synthetic base.
- `tests/income_streams.js` — income stream owner and kind (E1b, US): `streamAmountsForYear`, payroll tax on stream wages, the ACTC,
  two-return and survivor cases, hand-computed. `tests/stream_contributions.js` — `streamPlanContributions` and its rooms through
  `retirementContributions` and the engine. `tests/survivor_salary.js` — a partner who dies before retiring stops working at death
  (both planners). `test_income_streams.js` (Playwright, not in CI) covers the stream rows' owner/kind/panel controls.
- `tests/lump_income.js` — E1d (US): `lumpAmountsForYear`, payroll tax and the return placement of taxable lumps, gain lumps in `taxFor`, the NIIT active-business exclusion, dead-owner and survivor cases, hand-computed. `test_lump_income.js` (Playwright, not in CI) covers the one-time income rows' kind/owner/gain controls.
- `tests/inherited_accounts.js` — E1e (US): `singleLifeFactor`, `inheritedDraw` (the floor and cap sweep, stretch rows), `inheritedLedger`, the five state kinds through `taxFor` (the sources scratch objects never stale), the account in the engine (federal, ACA, IRMAA, NIIT, the Roth fill, owner B on two returns, the survivor and the successor rule), the need readers (decisions 15, 16), the last resort's placements and its identity against a scheduled draw, the fourth estimate, the receipt-year slot, the fill convergence bound, hand-computed. `test_inherited_accounts.js` (Playwright, not in CI) covers the inherited kinds' owner/gain controls, a kind change reaching the projection, and the status tooltip.
- `tests/unit/us/self-employment.test.js` (Vitest, in `npm test`) — E1c (US): `selfEmploymentTax` (the 92.35% base, the $400 floor, the wage-base interaction, half deducted),
  `soloPlanContributions` (deferral room after W-2 plans, profit sharing C x r / (1 + r), one annual-additions room, IRA, all from household
  cash) and the engine plumbing, hand-computed. `tests/se_health.js` — W-2 stream premium as coverage (`streamCoverBits`), the 162(l)
  deduction inside the MAGI iteration (`seHealthDeduction`: caps, spouse-plan bar, two returns, the band case, the Roth fill, the cliff-plan
  replay). `tests/unit/us/qbi.test.js` (Vitest, in `npm test`) — `qbiDeduction` (threshold, phase-in, cap, the $400 minimum) and the engine. `test_self_employment.js`
  (Playwright, not in CI) covers the income-type buttons and the stream `self` kind in the UI.
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
- `tests/unit/{us,canada}/bond-refill.test.js` (Vitest, in `npm test`, one file per planner) — hand-computed unit test of `refillBondReserve` (cap, order,
  realized gain, never home/cash) plus engine checks of the cap and the surplus path.
- `tests/historical_parity.js` — runs a constant-return historical path (equal to
  the plan's own assumptions, `bondYears: 0`) next to `simulate()` and asserts every
  shared row field agrees year by year; its `ENABLED` groups grow with each Batch 1
  step. `tests/historical_rates.js [--root DIR]` prints the historical and (seeded)
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
- `test_*.js` (repo root, committed) — ad-hoc Playwright scripts covering
  UI/feature behavior; not run by CI. Run individually with `node test_foo.js`.
- `docs/reference.md` — a much longer, chronological architecture/gotcha log
  (bug postmortems, CSS traps, the full history of specific features). Consult
  it for the deep detail behind anything summarized below before touching that
  area of the code.

## Commands

- `npm test` — builds `dist/` first, then runs the generator checks (`gen-*-rules.js --check`),
  the module-map check (`module-map.js --check --require-purpose`), the build and tool tests and
  the structural guards (`assemble_html` through `module_names` in `package.json`), then
  `tests/golden.js` and the rest of the chain (requires `playwright`; `npm install` first if
  `node_modules` isn't present). Must stay exact-to-the-cent.
- `npm run analyze` — rewrites `docs/superpowers/inventory/closure-*.md` and `module-map.md`.
  Run it after adding, renaming or removing a module (or changing a module's exports or line-1
  purpose comment): `npm test` fails while the module map is stale.
- `npm run build` — writes `dist/`. `npm run dev` rebuilds on every change under `src/`
  with inline source maps: edit, save, refresh the browser. The built script carries a
  `"use strict";` banner (the app runs in strict mode), and esbuild renames identifiers in
  the bundled output, so tests must never regex-match source text in `dist/*.html`; read
  `src/` instead, as `tests/historical_parity.js` does.
- `node test_foo.js` — run one ad-hoc Playwright UI check (repo root, committed,
  not wired into CI or `npm test`). Add/extend one of these when you add a
  feature and actually run it. Single-script runs (`node tests/x.js`, `node test_foo.js`) read whatever
  `dist/` currently holds, so run `npm run build` first (or keep `npm run dev` running); only `npm test` rebuilds for you.
- Syntax-check without a browser: `node --check src/us/ui/results/render.js` (any module; `src/` is plain
  ESM), or `npm run build` (esbuild fails on a syntax error in any module), or load the built file
  in Playwright and watch `page.on('pageerror')`.
- There is no lint step. The only build step is the esbuild bundle; the delivered file
  is still a single self-contained HTML file that needs no server.
- CI: `.github/workflows/test.yml` runs `npm test` (which builds first) on every push/PR to `main` and uploads the built `dist/` as the `fire-planner-dist` artifact (14 days; download it from any run to open the exact files the tests ran against). On pushes to `main` the `deploy` job publishes that same artifact to GitHub Pages instead of rebuilding.

## Architecture, per planner file

Every declaration lives in a module: the tax code, the engine (`taxFor`, `runProjection`, `simulate`, the withdrawal solvers) and
`defaults` under `core/`, the DOM code (`render`, `syncControls`, the charts, the wizard, the MCP tools, the listeners) under `ui/`;
each planner's `main.js` only calls the start-up functions (see "Modules, the entry point and the tools"). The bullets below say
"the function X"; find it with `grep -rn "function X" src`, or by topic in `docs/superpowers/inventory/module-map.md`
(`docs/superpowers/inventory/stage{2,3,4}-region-map.md` for the old shared regions). Core shape:

- `defaults` — the full default state object (every input field's default
  value, including nested arrays like `loans`, `spendingTiers`,
  `incomeSources`, `oneTimeIncome`).
- `normalizeState(raw)` — merges a raw/partial state (autosave, imported
  scenario file, hand-edited) over `defaults`, so old exported scenarios keep
  loading correctly: missing fields fall back to defaults, unknown fields are
  dropped. Any new enum-like field needs a guard here (see the
  `filingStatus`/`tenure`/`province` pattern) or a bad value can silently
  corrupt the simulation.
- **`FIELDS` — the field registry** (`src/us/ui/inputs/fields.js`, `src/canada/core/inputs/fields.js`). Every sidebar
  control that maps straight onto a `state` key is declared once; the input
  listeners, the DOM sync, `ids`, `normalizeState`'s enum guards and the MCP
  `update_fire_assumptions` schema/allow-list are all derived from it. Entry
  types: `number` (plain numeric input/slider; `ids` is the list of these, in
  registry order, which is also the MCP property order), `bool` (checkbox) and
  `choice` (select, or a button group marked `manual`). Per-entry options:
  `out` + `outSync` (the `<key>Out` slider label and which sync function writes
  it), `inlineOut`, `resync`, `syncAfter`, `onInput` (clamps/side effects),
  `sync` + `resync` (below), `reveals` (elements shown/hidden by the value),
  `mirrors` (wizard checkboxes that follow it), `values`/`fallback` (enum list and
  the `normalizeState` fallback), `trueUnlessFalse`, `valueAs: 'number'`, and
  `mcp: true` (expose through the MCP tool). **To add a field: the markup, the
  `defaults` value, and one `FIELDS` entry** (plus an `onInput` hook only if it
  has a side effect). `tests/field_registry.js` fails if a sidebar control is not
  registered or a registry entry points at a missing element/key.
- `runProjection({ mode, source, retireAgeA, retireAgeB })` — the one
  year-by-year drawdown/compounding engine behind everything: almost every
  chart/table/metric is built from its `{ rows, depletedAge, ... }` return. Two
  thin wrappers call it. `simulate(retireAgeA, retireAgeB)` is the standard
  projection (`STANDARD_MODE` + `standardYearSource()`: constant plan return,
  inflation and bond assumptions). `simulateHistorical(rowFn, retireAgeA,
  retireAgeB)` is the historical-backtest / Monte Carlo run (`BUCKET_MODE` +
  `historicalYearSource(rowFn)`, where `rowFn(year)` returns actual
  `[calendarYear, stockReturn, inflation, bondReturn, optional Treasury yield]`
  from the embedded 1928–2025 dataset or a block-bootstrapped path). Called
  many times per render (current settings, ±1yr/±3yr lines, each Monte Carlo
  path, each sensitivity sweep), so it needs to stay cheap — avoid
  per-year allocations that a hot path doesn't need (the bucket-step table is
  built once at module level for that reason).
- **Year source and mode.** A year source supplies each year's market inputs
  (`yearInputs(year)` → stock return, bond return, bond interest yield,
  inflation `factor`; `endOfYear()` advances running inflation). The mode is a
  small object of explicit capability switches. Today it has one,
  `bucketStrategy` (cash/bonds first in a down year, bond reserve refilled in up
  years, instead of the standard cascade); the other differences between the two
  ways of running the engine (detailed rows, Roth-conversion age key, safe-MAGI
  ceiling, pre-retirement bond ladder) were switches that the historical-parity
  work (Batch 1 of `docs/next-batches-plan.md`) turned on and then removed, so
  both modes now run them. Rows and result fields are identical in both modes;
  historical rows additionally carry `cumFactor` and the result carries
  `startYear`. The bond reserve is refilled gradually: `routeSurplus` fills it from
  surplus cash (limited by the surplus and `bondTarget`, no extra cap), and
  `refillBondReserve(wd, bondTarget, { maxMove })` (up years, after the draw)
  moves at most one year of that year's non-lump expenses into bonds:
  traditional, then Roth (no income, no penalty), then taxable last, a real sale
  through `drawTaxable` whose gain goes into `wd.taxableGainGross` (so tax, MAGI
  and the MAGI iteration see it) with the tax paid from the proceeds; never cash
  or home equity. `rotateIntoBondLadder` (the pre-retirement ladder, both
  engines) uses the same source order (traditional, Roth, taxable last); a taxable
  move is a real sale through `drawTaxable` whose gain it returns, and the engine
  adds that to `wd.taxableGainGross` (and to the row's tax/income in a surplus
  year). The stock-account step of the bucket strategy is one grouped step,
  `BUCKET_STEP.stocks`, that delegates to `drawMixedStockAccounts` (US: applied/
  override mix, live mix, smooth) or `drawSmoothStockAccounts` (Canada: smooth
  only), the same code `withdrawStandard` uses, with the bucket's own bisection
  bracket (`solveTraditionalForNetFromNeed`); with no mix mode on it runs the
  original taxable -> traditional -> Roth steps. Cash and the bond buckets keep
  their place in the down/up-year orders. The pre-retirement ladder is sized once from the plan's assumed
  inflation (`source.inflation`) in both engines. Do not add a new
  historical-only fork of the year loop; add a mode switch.
- **MAGI iteration (both engines).** ACA subsidy, the ACA/IRMAA
  Roth-conversion ceilings and the IRMAA lookback need THIS year's MAGI,
  which includes this year's discretionary withdrawals, which depend on
  the premium that MAGI sets. Inside each engine's year loop the body is
  wrapped in `for (let iter = 0; ; iter++)`: it snapshots every mutated
  balance (and the Roth and account ledgers) before the first mutation, and if
  `estUsed` (an ACA premium or a finite MAGI ceiling consumed
  `estTrad`/`estGain`) and the realized discretionary traditional
  withdrawals + taxable gains differ from the estimate by more than
  `MAGI_ITER_TOL`, it restores the snapshot, updates the estimate, and
  `continue`s (max `MAGI_ITER_MAX` passes, damped after pass 3). Rules for
  editing a year body: anything that mutates closure state before the
  convergence check must be in the snapshot (`bal` fields are rewound
  automatically; add new scalar `let`s to `scalarSnapshot`; the guardrail state is the `guardrails` object, copied as `guardrailSnapshot`), and never add a `continue`/`break` that is meant for the year
  loop. `prevDiscTraditional`/`prevTaxableGainGross` only seed pass 0.
  `row.magiProxy` is the realized MAGI and `irmaaMagiHistory[year]` is
  overwritten with its Medicare MAGI after convergence; the in-body assignment is
  provisional and only read by the plan's first-year IRMAA stand-in.
  The engine's MAGI is the ACA definition (all of Social Security); IRMAA amounts convert with
  `irmaaMagiOf(magi, ss, filing)` (Medicare's MAGI: only the taxable part of Social Security, this year's
  return's benefit and filing status, `irmaaSsOf` / `returnStatusA`), and IRMAA lines and caps translate
  into the engine's MAGI with its exact inverse `magiForIrmaaLine` (one MAGI scale for steering).
  **Two-return years (US, 3C B1):** `twoReturns = !profile.singlePerson && !filingRow(filing).joint` (an
  unmarried couple, or before a marry-later wedding; never the survivor period or single-person mode).
  `returnMagis(profile, trad, gain)` splits the MAGI into `[magiA, magiB]` (each partner's `other` and
  Social Security, half the investment income and gains, `trad` = discretionary draw + conversion by
  `profile.ownerShareA`; the two sum to the household figure) and allocates its 2-array only in those
  years. The year loop keeps `magiHistoryA/B` (rows keep this ACA per-return MAGI), their Medicare MAGIs
  `irmaaMagiHistoryA/B` (A on `returnStatusA`, B single; what `healthcareCost`'s IRMAA reads) and
  `twoReturnHistory` beside `irmaaMagiHistory` (written per pass like it, overwritten with the realized split
  after convergence; rows carry `magiA`/`magiB` in two-return years only). `healthcareCost` prices the ACA premium per tax household (A's includes the
  children, half the premium each, own poverty line) and IRMAA per person on the single tiers whenever
  the lookback year had two returns (`irmaaLookbackSplit`; the entered first-two-years prior MAGI is
  split evenly), else the household rule. `conversionMagiCeiling` keeps each return under its own ACA
  400% line and IRMAA tier, dividing each return's room by its share of the conversion. The forced pass
  prices other draws through `costAt(trad, gain)` (which re-splits the MAGI). Test: `tests/two_return_magi.js`.
  **Third estimate (US, E1c).** The self-employed health insurance deduction (162(l)) depends on the year's premium, which depends
  on the MAGI the deduction lowers, so the iteration carries a THIRD estimate beside `estTrad`/`estGain`: `estSeA`/`estSeB` (seeded from
  `prevSeHealthA/B`, the realized deductions of the previous year, written only after convergence, so there is no `scalarSnapshot` entry).
  `magiBase0` is the MAGI before the deduction and `magiBase = magiBase0 - estSeA - estSeB` is rebuilt every pass; each pass puts
  `profile.seHealthA/B` on the profile, prices the premium with `costAt(trad, gain, sa, sb)` (the deduction pair rides as arguments, and
  `lastCost` remembers the pass's cost), and `returnMagis` subtracts `seHealthA/B` from each return's other income. After `healthcareCost`
  the pass runs `seHealthDeduction` (`seRealA/B`), sets `estUsed` when the deduction moved, and removes the realized deduction from the
  medical expense (no double count). The convergence test, the pass log (realized cost on the realized pair), the damped update, the pick
  restore, the forced pass (realized-pair `costAt`, the deduction re-run on `lastCost`), the recorded MAGI (`realizedMagi = magiBase0 -
  (seRealA + seRealB) + draws`) and the cliff plan's phases (natural, fallback replay, trial records, winner replay, trial seed) all carry
  it. A year whose damped iteration does not converge, with a 162(l) deduction allowed (`seAllowA || seAllowB`; 8b, owner
  decision A, refined by decisions 10 and 12), holds a deduction chosen once, as Rev. Proc. 2014-41 section 5 allows: the consistent
  deduction when one exists (a bisection, below), else the alternative calculation (the deduction at the full premiums, `costAt` at a
  MAGI of 1e12, then at the premium after the credit the step-1 MAGI allows). It sets `estSeA/B` to it and `seHeld = true`, and re-runs
  the phase: while `seHeld`, site 7 takes the held pair as the realized pair (the deduction term of the convergence test is 0) and the
  forced pass does not re-price it, so the premium, the draws and the MAGI follow the held deduction. The two methods are one closure,
  `seSearch(trad, gain)` (built on first use in a pass: a pass that never searches allocates nothing), which prices the draws it is
  handed. **Decision 12 (Task 11, withdrawing decision 11's re-check):** a hold is priced on the draws of the pass that failed to
  converge and is not re-checked. The re-run's draws move afterwards, so the deduction can be understated (legal, conservative); the
  one re-hold of decision 11 could flip across the 400% line and deduct more than the premium paid (224 of 8,610 grid years, worst
  $12,829), which the law forbids, so it is gone. The invariant grid in `tests/se_health.js` asserts the deduction never exceeds the
  premium paid or the plan net and counts the understated years (a recorded limitation); the exact settlement at the final draws is
  Batch 5's. Nothing is held when the
  step-1 deduction is 0 (the Solo plan took the whole net): the pass falls through to the forced pass as it did before the switch.
  `magiStats.seFixed` / `seAlternative` count the kept phase only, through `seKind` (1 consistent, 2 alternative), like `forced` /
  `unresolved`. `seHeld` and `seKind` are reset at a trial start and carried in `naturalRec` / the trial records with
  `estSeA/B`, so the plan's replays restore them. A new reader of the year's MAGI inside the loop must use `magiBase`, not
  `magiBase0`. **`seOn` (8a):** `buildTaxProfile` sets `profile.seOn = seA > 0 || seB > 0`, and `taxFor` reads the self-employment
  fields (`seNet*`, `sePlanNet*`, `seHealth*`, ...) only when it is true (exact zeros otherwise, no number changes), so EVERY profile
  that reaches `taxFor` must carry `seOn` (the lambda, Roth solver and optimizer literals carry `seOn: false`; a test profile with
  self-employment keys needs `seOn: true`, or the keys are ignored). **Decision 10 (9a):** before the alternative calculation the
  block searches for the consistent deduction (D equal to the deduction the premium at D's MAGI allows, within $1) by bisection, holding the
  pass's draws: the deduction the premium allows falls as D rises, so `g(D) = allowed(D) - D` is decreasing on `[0, step-1 deduction]` and
  has at most one crossing (one search on the total on one return, one per return on two; a return's slot of `seHealthDeduction` reads only
  its own MAGI). Found: held (`seHeld`), counted in `magiStats.seFixed`; not found (a jump in `g`, or a non-monotone `g` below 100% of the
  poverty line in a non-expansion state or with `medicaidWhenEligible` off): section 5.02's alternative calculation for that part, counted in
  `magiStats.seAlternative`. The damped 8-pass iteration alone zigzags across the 400% line just below the band, so without the search the
  year charged a premium up to $11,800 too high (single, $18,000 premium, profits 72,750 to 74,000). **9c (speed):** every E1c term is
  skipped, not added as a zero, for a household without self-employment: `taxFor` tests `seOn` once and builds each self-employment term
  inside `if (seOn)` / `seOn ? ... : ...`; the year loop's `seLive` (`profile.seOn` or a deduction carried in from last year) gates the
  162(l) terms of the pass (`magiBase`, the `estUsed` line, the medical expense, the convergence test, `realizedMagi`); the Solo terms of
  `retirementContributions` are added only when `so !== NO_SOLO`; the stream premium factor and the IRMAA cover bits are computed only when
  `state.incomeSources` is not empty. A new E1c term in a hot path must follow the same rule. Tests: `tests/se_health.js` (Task 9a and 10a blocks),
  `tests/unit/us/tax-caches.test.js`.
  **IRMAA appeal and the lookback's filing status (US, E3).** The household lookback charges on the tiers of the lookback
  return's filing status (`irmaaFilingHistory`, written once per year before `hcArgs`; `irmaaLookbackFiling`: years 0 and 1
  read year 0's status, except an entered prior return from before a married partner's death, which is joint), so a survivor's
  D+1 and D+2 are on the joint tiers. `irmaaAppealTable` (per run; `null` for most runs) records each person's usable events by
  first post-event year E (a main-job retirement, the end of a W-2 or self-employed stream, a married spouse's death; covered:
  the owner, the spouse when married in E; kept for a covered person alive in E and 65 by E+1). In `healthcareCost`, a partner
  on Medicare whose window is open (`irmaaAppealWindow`) and whose normal charge is above 0 is charged the lowest of the normal
  charge, this year's MAGI (the pass's estimate, so it sets `usesMagiEstimate` and converges within `MAGI_ITER_TOL`; `costAt`,
  the forced pass, the 162(l) search and the inherited need adjustment price it unchanged) and, in year E+1, last year's
  realized MAGI; year 0 without entered prior MAGIs is skipped. At Medicare ages the IRMAA Roth-conversion ceiling is finite
  and already sets `estUsed`, so the appeal's own `usesMagiEstimate` matters only where that ceiling is infinite. The year loop keeps `appealYrA/B` (set from `hcOut`, and again
  after the forced pass's `costAt`; never read from `lastCost`) for the row's `irmaaAppealYearA/B` / `irmaaAppealKindA/B`, and
  `inYrA/B` for the cliff plan, whose IRMAA lines sit on this year's edges (growth 1, per return through
  `c.irmaaGrowthA/B`) in a year with an in-year candidate. The plan's `irmaaAt`, lines and `irmaaChecks` use this year's
  filing status (the return SSA will read); `irmaaFiling2` is gone. Test: `tests/irmaa_appeal.js`.
  Test: `tests/aca_magi_iteration.js`. Test: `tests/irmaa_magi.js`. See `docs/reference.md`.
- **Medicaid and the premium-credit floor (US, `MEDICAID_RULES`, 7O O1).** A pure-literal table in `src/us/core/healthcare/medicaid-rules.js`
  (`MEDICAID_RULES:begin/end`; not a `STATE_RULES` column): `expansionLimit` (1.38 of FPL: 133% plus the 5-point disregard),
  `nonExpansion` (ten states), `adultCoverage` (Wisconsin 1.0), `ptcFloor` (1.0) and `workRequirement` (`fromYear` 2027,
  `exemptChildMaxAge` 13). `acaNetCost` applies it before the credit schedule, so `healthcareCost` and the 400% guard still share one function:
  at or under the state's Medicaid line the cost is $0 (checkbox `medicaidWhenEligible`, default on) or the full premium (checkbox off, or from
  2027 a household with no child 13 or younger fails the work requirement, which also bars the credit); under 100% of FPL there is no credit.
  A MAGI of 0 is no longer a free pass. `medicaidLimit(code)` is cached per code and `hasChildAtMost` loops the children list in place (a child counts from its join year, E2), so the
  path allocates nothing. `conversionMagiCeiling` is unchanged: the new cliffs (the floor, the 138% line, the 2027 start) are priced by the cost
  and listed in the plan's cliffs register; 3C decides the policy. At the step-down cliffs the MAGI iteration has no fixed point: after the cap the pass that overpaid the least is re-run once (`forcedPass`), the cost at the realized MAGI is charged and the refund goes to cash (`magiStats`, 7O follow-up F5; filling to the line is 3C); the guardrail record and `firstWithdrawal` are re-recorded net of the refund so the guardrails do not cut spending for a premium that was never paid. Tests: `tests/aca_medicaid.js`.
- **US federal deductions** (just above `ordinaryTax`): `standardDeduction(filing,
  yearIndex, ages)` (base + the 65+ additional amount per filer), `seniorDeduction`
  (the temporary $6,000, zero after `SENIOR_DEDUCTION_LAST_YEAR = 2028`; revisit if
  Congress extends it), `saltCap` (explicit year table to 2029, `SALT_CAP_LAST_YEAR`),
  `itemizedDeduction` (min(SALT cap, state tax + property tax) + mortgage interest,
  nothing else) and `federalDeduction` (max of standard and itemized, plus senior).
  `itemizedDeduction` and `federalDeduction` also take the year's medical expenses (7O O2): the part over 7.5% of AGI
  (`MEDICAL_FLOOR_PCT`) is added to the itemized total. The engine sets `profile.medicalExpense = healthcare + ltc` each MAGI pass,
  right after `healthcareCost` (premium after the credit, Medicare, IRMAA and the long-term-care cost); `taxFor` and the lagged
  federal pass read it (`|| 0`), the two-filer branch splits it 50/50, and the itemizing branch is entered only when `medical` exceeds
  the floor, so ordinary Medicare years add nothing to the hot path. `solveRothConversion` and the optimizer's profile literals carry no
  medical term (conservative).
  **QBI and 162(l) (US, E1c).** Both are deductions the engine supplies through the profile, not new filing-status families. The
  self-employed health insurance deduction reaches each return as `profile.seHealthA/B` (it lowers `sources.wages` and the other
  income that `returnMagis` and the Roth fill read, but is not part of the itemized/standard choice). `qbiDeduction(qbi, taxable,
  netGain, joint, yearIndex)` (just above `taxFor`; `QBI_LIMITS`, 2026 Rev. Proc. 2025-32) is subtracted below AGI beside the
  standard/itemized deduction in `ordinaryTax`/`longTermGainTax` calls and in `federalLiabilityForState`, on `sePlanNet - seHealth`
  per return (a joint return adds both; the two-filer branch gives each partner their own). Every business is a specified service
  business with no employees and no property, capped at 20% of taxable income less net gain, with the $400 minimum applied after the cap.
  The Roth-conversion bracket fill subtracts 162(l) but not QBI. See "Self-employment (US, E1c)".
  The tax year is `currentYear + yearIndex` in both engines (historical runs replay
  returns, not tax law). `taxFor()` computes each return's deduction itself from its
  own income (AGI stands in for MAGI), the state tax it just computed, and the
  `profile.propertyTax` / `profile.mortgageInterest` that `housingForYear()` supplies
  (interest already limited to $750,000 of original debt); `ordinaryTax` and
  `longTermGainTax` take it as an optional last argument. The two-single-filers
  branch splits housing deductions 50/50. `solveRothConversion` uses a conservative
  lower bound (age-adjusted standard, or property tax + interest if larger; no
  senior deduction, no state tax). `mortgageSchedule()` and `buildDeferredMortgage()`
  (now `src/shared/core/income/spending-and-loans.js`; see `docs/superpowers/inventory/stage2-region-map.md`) now also return a per-year `interest` array.
  Canada has no equivalent in this batch. The Annual property tax field line sits
  between two shared partials (`medicalInflation` ends before it,
  `propertyTaxGrowth` starts after it) so each planner can word its label
  differently; keep it outside the shared partials.
- **Filing-status table (US, `FILING`, in `src/us/core/tax/federal-rules.js`).** Each status row names, per
  parameter family (brackets, deduction, extraAge, gains, ss, niit, medicare, irmaa, senior, ctc), which
  data row it reads (`ORDINARY_BRACKETS`, `STD_DEDUCTION`, `STD_EXTRA_65`, `GAIN_BANDS`, `SS_BASE`,
  `NIIT_THRESHOLD`, `IRMAA_TIERS`, `SENIOR_PHASE_START`), plus a `joint` flag for the structural branch in
  `taxFor`/`solveRothConversion`. Read through `filingKey(filing, family)` / `filingRow(filing)`; an unknown
  status reads as single. Never write `filing === 'mfj'` in new code; add a row or a family instead.
  Statuses: `mfj`, `single`, `hoh` and `qss`. `filingStatusFor` (US) picks the year's status: unmarried with a
  qualifying child that year is `hoh`, else `single`; a survivor of a married couple is `mfj` in the death year,
  `qss` for the next two tax years while a qualifying child exists, then as unmarried. `qss` mixes families (joint
  brackets, deduction and gain bands and the NIIT, single Social Security bases, Additional Medicare Tax, IRMAA and
  senior phase-out). An unmarried couple (marry-later before the wedding, or `filingStatus: single`) keeps household
  status `single`; the two-filer branch of `taxFor` gives Partner A (who claims the children) `hoh`. `taxFor`
  branches on `filingRow(f).joint`, then `profile.singlePerson` (single, hoh or qss), then two filers.
- **State income tax (US, `STATE_RULES` in `src/us/core/tax/state-rules.js`, evaluated by `stateIncomeTax`; Batch 7C).** One data row per jurisdiction (the
  50 states and DC, matching the `#stateTax` options) and one generic evaluator, `stateIncomeTax(sources, filing,
  yearIndex)`, replacing the old per-state code. A row declares every field explicitly (`tests/unit/us/state-rules.test.js` fails on
  a missing field or a state missing from the table): `status` (always `researched`: `source` URL + `asOf` year; the `migrated` status of 7C is gone), `indexing` (one boolean per family: `bracketsIndexed`, `standardDeductionIndexed`, `personalExemptionIndexed`, `creditAmountsIndexed`,
  `creditThresholdsIndexed`, `retirementExclusionIndexed`, never one switch for the whole state: CA indexes its brackets, deduction and credits but not
  its $1 million surcharge, NY indexes nothing, WA indexes the deduction but not its $1 million tier; each `additions` entry has its own `indexed`;
  a true flag scales that family by `taxIndexFactor`), `statusAs` (which column `mfj`/`single`/`hoh`/`qss` read: HoH falls back to the
  single column and QSS to the joint one unless the row has its own `hoh` column; the old `FILING.state` family is gone),
  `tax` (`none`, `flat`, or `graduated` with `[start, rate]` columns), `surtax`, `base` (ordinary income yes/no, share
  of gains included, Social Security `exempt`/`taxed`/subtraction), `standardDeduction`, `exemption`, `retirementExclusion`
  (kinds in `stateRetirementExclusion`: `perPerson` and `agiPhasedShare`; the household-level kinds of 7C were removed in 7D),
  `credits`, `federalTaxSubtraction`, `localTax` (local income taxes are an accepted, documented gap) and `notes`. Mechanisms
  (all data, evaluator in `stateIncomeTax`): `additions` (a threshold surtax, an AGI step table, NY's `benefitRecapture`),
  `exemptionPhaseOut` and `dependentExemption`, the AGI-tested Social Security kind, per-person retirement kinds
  (`perPerson`, `agiPhasedShare`), and `credits` of kind `exemptionCredits`, `renterCredit`, `childCredit`,
  `propertyTaxCredit`, `taxForgiveness`, `agiStepFraction` (a nonrefundable credit is capped by the tax; a `refundable` one
  can take the state tax negative, as the ACTC can). Step tables are `[[lowerBound, value], ...]` per column. The state
  inputs come from `taxFor`'s `sources`: besides the household sums it carries per-person pensions and traditional draws
  (`pensionA/B`, `retirementA/B`; the discretionary draw is split by `profile.ownerShareA`, the account-ledger share, 0.5 if
  absent), `ssBenefits` (plus per-person `ssBenefitsA/B` and the taxable part split in proportion, `taxableSSA/B`; a one-person return reads slot A), `dependents`, `propertyTax` and `rent` (`housingForYear` now returns `rent`). `taxFor` does not build
  `sources` at all for a no-tax state: that path stays as fast as before. For a taxing state it refills four module-level
  scratch objects (`SOURCES_JOINT/SINGLE/A/B`, one per return, same shape, `newStateSources`) instead of allocating, and
  writes the per-person fields (`pensionA/B`, `retirementA/B`, `ssBenefitsA/B`, `taxableSSA/B`) only when the row's
  `needsPerPerson` flag is set (`compileRow`: a per-person retirement kind or the age-and-AGI-tiered Social Security kind;
  `compileStateRule` ORs in the scheduled variants), so **a new mechanism that reads a per-person field must set that flag**
  (`tests/unit/us/tax-caches.test.js` runs every state with the flag forced on for all rows and fails on a difference, and pins which rows
  carry it). `stateIncomeTax` and its credit helpers must keep nothing from `sources` (it is reused on the next call). Each
  row is resolved once per state code into flat arrays (`compileStateRule`, cached), and the factor is applied inside
  `graduatedTax`, so the hot path allocates nothing. Order of evaluation is fixed, state first, federal second: the state
  tax feeds the federal SALT deduction, so a state base must never read a federal deduction or federal tax (a state that
  deducts federal tax gets one lagged pass, 7D). 7D mechanisms (all data, evaluator in `stateIncomeTax`, hand-computed cases in `tests/unit/us/state-mechanisms.test.js`): `schedule` (year-effective
  rule sets: `[{ fromYear, baseYear?, ...overrides }]`, each building on the one before; a scheduled family holds statutory dollars of its
  base year and indexes from there, `base / taxIndexFactor(baseYear - currentYear)`; only unconditional enacted changes, never revenue
  triggers), `standardDeductionPhase` (`stepDown` / `linear` by state AGI), `seniorExemption` (per filer, optional AGI phase-out),
  `dependentExemption` as a number or an AGI-tiered table, `federalConformity` (the state deducts the federal standard deduction, optionally
  with the 65+ add-on and the senior deduction), additions with a `threshold` per column, and the per-person `perPerson` retirement kind
  now carries `applies` (pension / traditional), `tiers` (age-tiered caps), `reducedBy` (the filer's Social Security subtraction or all
  benefits received uses up the same cap) and `share` (an AGI step share). Second set: Social Security kinds `ageAgiTiered` (per filer by age, with an AGI limit and a cap over it),
  `agiShare` and `agiPhaseOut`; credits `incomeTestedCredit` and `ssCredit`; `base.gainsRate` / `gainsDeduction` (gains taxed separately or reduced by a dollar
  exclusion); `federalTaxSubtraction` as `{ kind: 'lagged', placement, cap, phase }` (taxFor runs one extra federal pass with state tax zero, only for a row that
  deducts federal tax: `rule.lagged`, `federalLiabilityForState`; the liability excludes NIIT, payroll tax and the ACTC; the small SALT-feedback
  inconsistency is accepted and named in the row); and `localTax: { kind: 'flat', rate }` (MD and IN only, a flat county rate on the state taxable income, which
  feeds the federal SALT deduction like the state tax). Third set: `exemptionPhaseOut` kind `linear` (every exemption, the filers' and `dependent` per child, loses `rate` x the federal AGI over `start`), `dependentExemption` `{ kind: 'afterFirst', amount }`, a `seniorExemption` phase-out with a rate per column and `basis: 'federal'`, and credit kind `childStepCredit` (per qualifying child, from a step table of the federal AGI). Circuit-breaker credits are deliberately not built (owner decision). The block between the `STATE_RULES:begin` / `end` comments is pure
  literals so `scripts/gen-state-rules.js` can evaluate it. Rows are `researched` (the six reference states CA, NY, PA, CT, WA, TX with tests in
  `tests/state_reference.js`; the 7D states with hand-computed households in `tests/state_7d_households.js`) and now all 51 rows are researched. Rows follow the
  state's real indexing (`none` for NY, PA and CT; `cpi` for CA and WA), HoH and QSS columns, and income tests; their `notes` text is what the
  planner shows under the selector. The generator also lists every parameter of the researched rows. Evaluating it: that script writes `docs/state-tax-rules.md` (the owner's review
  artifact: one row per jurisdiction with every rule and its source; `npm run gen:states`), and `npm test` fails if the file is
  stale. After changing a row, regenerate and commit the file. Not shared with Canada (US only).
- **State rows, later additions (7O O3, O4).** The per-person retirement kind's `applies` takes an optional `employerPlanAfterRetirement: true` (Pennsylvania only,
  7O O3): below the traditional minimum age a retired filer's 401(k) part of their traditional draw is excluded at any age.
  `applies.employerPlanOnly: true` (Rhode Island only, PUB 2026-01: IRA income never qualifies) reads the same 401(k) part the other way:
  from the minimum age only that part of the traditional draw counts toward the cap, and RI has no "stopped working" test: for a state
  whose rule is `employerPlanOnly`, `buildTaxProfile` computes `k401FracA/B` while the filer works too (PUB 2026-01, Example 4)
  (`tests/ri_ira_exclusion.js`).
  `buildTaxProfile` puts `k401FracA/B` on the profile (the filer's 401(k) share of their own traditional accounts from the account ledger at the start
  of the year, zero while they work; a single person or survivor: the pool's 401(k) share) and `taxFor` fills `sources.retirement401kA/B` (draw x fraction,
  only when `needsPerPerson`); the draw is assumed pro rata, which the penalty-aware draw order and 72(t) payments can depart from. `childCredit` also
  takes `phaseOut.measure` ('stateAgi' | 'income'), `phaseOut.rate` (a straight line), `maxChildren` and `fixed` (unindexed whatever the row flags say), `phaseOut.share` ({ width, round }: a percentage of the whole credit, Oregon), `phaseOut.perChild` (the cut comes off each child, Vermont), and
  `childStepCredit` takes `maxAge` and `measure: 'income'` (7O O4: MN, VT, ME, NJ, OR, UT).
- **Child credits (US, `childCredits`, just above `taxFor`).** `childCredits(dependents, filing, yearIndex, magi,
  federalTax, earnedIncome)` returns `{ nonrefundable, refundable }`: the Credit for Other Dependents ($500, a qualifying
  child with `age >= 17`, nonrefundable, not indexed, shares the phase-out; the reduction comes off the CTC part first and
  the tax absorbs the ODC first) and the CTC ($2,200 per child with `age <= 16`,
  indexed by `taxIndexFactor`; phase-out $50 per $1,000 over the `ctc` family threshold, not indexed), limited to the
  federal income tax (ordinary + gains tax, not state/NIIT/payroll), plus the ACTC (min of the unused credit, $1,700
  per child indexed, 15% of earned income over $2,500). `taxFor` subtracts both from the federal tax, so a tax can
  be negative (only through the ACTC). Earned income is `profile.wageA (+ wageB)`, already net of pre-tax
  contributions; extra income streams are not earned income. The no-children path returns a shared constant and
  leaves the float order of the sum untouched (snapshot-exact). The two-filer branch puts the credits on Partner A.
- **Tax-code hot-path rules (7D part 2).** `taxFor` is the hottest function (a withdrawal solve probes it 25 to 50 times
  per year), so: `taxIndexFactor(yearIndex)` (`src/shared/core/projection/year-factors.js`, with its memo `taxFactorInflation`) remembers the plan's own factor per whole
  year index while `state.inflation` is the value it was computed for (`Math.pow` was a fifth of a projection; the historical
  path still reads its own per-run array first); `drawTaxable`'s bisection computes the no-draw `taxFor` once, not per probe
  (the other solvers already did). Measured and rejected, do not retry: a memo inside `standardDeduction`, a conformity-
  deduction cache, and a 4-slot memo of the federal pass (the lagged pass reused by the main pass) all cost as much to look up as
  they save. A memo must be keyed on every input it reads (so it never needs clearing) and give the very double the uncached
  path gives; verify with `tests/unit/us/tax-caches.test.js` and the snapshots.
- **Per-year helpers** (section "Per-year helpers shared by simulate() and
  simulateHistoricalCore()", just above `simulate()`). The year loop is a
  sequence of named stages: `listAmountsForYear`, `retirementContributions`,
  `socialSecurityIncome`/`cppAndOasIncome`, `pensionIncome`,
  `requiredDistributions`, `housingForYear`, `loanPaymentForYear`,
  `filingStatusFor`, `buildTaxProfile`, `conversionMagiCeiling` (US),
  `healthcareCost`, `payrollTax`, then balance mutations (`growBalances`,
  `withdrawRequiredDistributions`, `applyRothConversion`/`applyRrspMeltdown`,
  `sweepExcessCash`, `rotateIntoBondLadder`) and the withdrawal. Add a new
  per-year rule to the matching helper, not inline in an engine.
- **Retirement accounts (US).** Four accounts per partner: `tradIraA/B`, `trad401kA/B`,
  `rothIraA/B`, `roth401kA/B` (all `.money`), plus `rothIraBasisA/B` (dollars; **0 means "not entered"**
  and the engine assumes `ROTH_BASIS_ASSUMED_PCT` = 50% of the balance, enter 1 for none) and
  `roth401kBasisPctA/B` (slider, default 50). The snapshot grid and `tests/historical_rates.js` use the
  planner's own basis defaults (so they run at 50%); hand-computed tests pin 100% through
  `translateFieldList` / `pinBasis`. `openingAccounts()` reads them (Partner B's are zero in
  single-person mode: B's balances are ignored, not summed); `bal.traditional/roth` start as the sums.
  The old pooled `traditional`, `roth`, `traditionalSharePctA` and `rothBasisPct` are retired and **not
  migrated** (owner decision): `normalizeState` deletes them, so an old save opens with default
  accounts. Under the pooled `bal.traditional + bal.bondTraditional` and `bal.roth + bal.bondRoth` sits
  the **account ledger** (`accts`, `accountsNew/Contribute/Convert/Clone/Restore`): each account's
  SHARE of its pool in `ACCOUNT_SLOTS` order `[IRA A, 401(k) A, IRA B, 401(k) B]` (Roth pool: Roth IRA A,
  Roth 401(k) A, Roth IRA B, Roth 401(k) B). Growth, ladder/refill moves and draws are pro rata and
  leave shares alone; only a contribution (to the owner's account; employer match to the traditional
  401(k), mega-backdoor to the Roth 401(k)) or a Roth conversion (IRAs first, then 401(k)s, into the
  same partner's Roth IRA) changes them. The ledger is cloned/restored with the MAGI-iteration snapshot
  (`accountsClone/Restore`, next to `rothLedgerClone/Restore`): a new mutable ledger must be added
  there in the same commit. `window.__test_accountTrace` returns per-year account balances.
  The engine reads the ledger: RMD and 72(t) sizing use `accountsOwnerShareA(accts.trad)` (A's
  current share of the pool), the penalty blend uses the traditional share for traditional draws and
  the Roth share (`accountsOwnerShareA(accts.roth)`) for `rothPenaltyFraction`, and a partner's RMD /
  72(t) amount is drawn from that partner's own accounts (`accountsDraw`; a single person or the
  survivor owns everything, so the draw is pro rata and no share moves). Roth conversions come from the
  IRAs first. Batch 3B replaces the fractional blend with a per-account status.
- **Contribution limits and profit sharing (US, E1a).** `PLAN_LIMITS` (2026 values: the $72,000 annual limit, the
  catch-ups outside it, the $360,000 compensation limit; indexed by `limitFactor`) and `allocatePlanRoom(room, amounts,
  out)` (pure, country-neutral, allocation-free; in `src/us/core/income/contributions.js`, to move to `src/shared/core/` at E1-CA) sit above `retirementContributions`, which
  returns the limited `matchA/B`, `profitA/B` and `employerContrib` (the year loop's `employerMatch`). One room per
  partner is filled in the order deferrals, match, profit sharing, after-tax (mega backdoor); the room is
  `min(pay, annual limit) - deferrals` (catch-ups outside it); the mega backdoor is further capped at pay less deferral and catch-up (the employee's own money never exceeds pay); match and profit sharing count pay only up to the compensation limit. `profitSharingPctA/B` (0-25, clamped in
  `normalizeState` and while typing) is the employer's share of pay into the traditional 401(k). Partner income
  (`incomeA/B`) is a money field, not a slider. Optional `min` / `max` on a `FIELDS` number entry bound MCP input only (`mcpAccepts`, US-only; profit sharing 0-25). Test: `tests/unit/us/contribution-limits.test.js`.
- **Self-employment (US, E1c; spec `docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md`).** `incomeKindA/B` (`'wages'` default,
  `'self'`; a `choice` field with `manual: true` and `mcp: true`) says what the partner's main income is. In the year loop
  `seMainA/B` is the main income when the kind is `self` and the partner works (the same `incomeFactor` growth), `wageA/B` the W-2 amount
  (zero for a self-employed partner), so every payroll reader keeps reading wages only; `streamAmountsForYear` returns `self` stream
  profit separately (`seA/B` = main + streams, all of one person's self-employment is one business: one Schedule SE, one Solo 401(k)
  room). `employerA/B` replaces `workingA/B` in the health rules (`acaEligibility`, Medicare gating, the 400% guard): a W-2 job, or a
  W-2 stream with a `healthPremium` (`streamCoverBits(streams, ctx)`, bit 1 = A, bit 2 = B, the IRMAA lookback asks two years ahead),
  counts as employer coverage; a self-employed person does not. `seAllowA/B` (162(l) allowed) = self-employed profit, no employer
  coverage of their own, and no spouse-plan coverage in a joint year (`employerCoversSpouseA/B` ticked). Pure functions:
  `selfEmploymentTax(se, ssWages, yearIndex, out)` (scratch `SE_OUT`: `tax`, `half`, `ne`; 92.35%, nothing under $400 of net earnings,
  Social Security to `SS_WAGE_BASE` less the W-2 wages, Medicare uncapped; the Additional Medicare Tax is in `payrollTax` on wages plus
  `ne`), `soloPlanContributions(p, out)` (scratch `SOLO_PLAN`, `ACCOUNT_SLOTS` order; C = profit less half the SE tax; deferrals in the
  room the W-2 plans left, profit sharing P = C x r / (1 + r) with the compensation limit, one annual-additions room, after-tax money,
  then the IRA on W-2 pay plus C; every dollar is household cash; no Roth catch-up rule) and `seHealthDeduction(healthcare, premA,
  premB, twoReturns, profile, out)` (scratch `SE_HEALTH`; capped by `sePlanNetA/B`, the profit less half the SE tax and the Solo plan
  money, never reduced by a traditional IRA). `retirementContributions` takes `seA/B`, `seMainA/B`, `halfA/B` and returns the Solo money;
  `buildTaxProfile` takes the SE totals and the plan/IRA cuts and carries `seNetA/B` (taxable profit after half the SE tax and the
  cuts), `seEarnedA/B` (profit less half the SE tax: earned income for the ACTC), `sePlanNetA/B`, `seAllowA/B` and `seHealthA/B`
  (the survivor remap moves B's into slot A). `payrollTax` takes `seTaxA/B` (the SE tax joins the cash payroll cost) and `seNeA/B` (net earnings join the Additional Medicare Tax base with the wages). The main income's Solo 401(k) uses the existing partner fields (`profitSharingPctA/B` is the plan rate, `k401*` / `afterTax*` the employee side). A person who dies
  before retiring stops self-employing at death like a salary. A `self` stream carries `profitSharingPct` and joins the same rooms
  (no `healthPremium` on it: a self-employed stream is covered by the marketplace rule). Defaults reproduce today's numbers: an exact 0
  for every term, so no existing snapshot entry moved. Not modeled: S corporations, business losses, Social Security credit from
  self-employment earnings, a business with employees or property (QBI wage/property limits). Tests: `tests/unit/us/self-employment.test.js`,
  `tests/se_health.js`, `tests/unit/us/qbi.test.js`, `test_self_employment.js`.
- **Account balances live in one `bal` object** (`bal.taxable`,
  `bal.taxableBasis`, `bal.bondTaxable`, `bal.bondTaxableBasis`,
  `bal.bondTraditional`, `bal.bondRoth`, `bal.traditional`, `bal.roth`,
  `bal.cash`, `bal.home`, `bal.mortgage`, plus `bal.fhsa` in Canada), not loose
  `let`s. The MAGI-iteration snapshot is `{ ...bal }`, so a new balance field is
  rewound automatically; only scalars (depletedAge, firstWithdrawal) still need
  adding to `scalarSnapshot`; guardrail state lives in a `guardrails` object
  (`newGuardrails`, `guardrailSpendingMultiplier`, `recordGuardrailWithdrawal`).
- **Withdrawals** build a `wd` object (`newWithdrawal`) and run a strategy:
  `withdrawStandard` (simulate: explicit/optimizer mix, live mix, smooth, or
  taxable-then-traditional, then the Roth/cash/bond/home fallback) or
  `withdrawBucket` (simulateHistorical: cash and bonds first in a down year, then
  stocks; in an up year stocks first, then refill the bond reserve). Both are
  built from `takeTaxable`/`takeTraditional`/`takeRoth`/`takeCash`/
  `takeHomeEquity`, which return net cash and leave `wd.need` to the caller
  (the strategies differ on clamping a tiny overshoot to zero).
  `solveTraditionalForNet` and `solveTraditionalForNetFromNeed` bisect from
  different brackets and give slightly different (~1e-7) answers; both are
  kept on purpose until the numerics are unified as a deliberate change.
  `solveRothConversionTo(profile, cap, yearIndex, bracketPct)` is the bracket fill, and `solveRothConversion`
  resolves the bracket (override, applied schedule, setting) and calls it. The US year loop builds the
  healthcare-cost block (`hcArgs`, `costAt`) and the `irmaaAt` / `lambdaOf` closures before the conversion (3C B5,
  for Batch 5's conversion pricing; `healthcareCost` itself still runs after the conversion is known).
- **Per-year solver and the cliff plan (3C redesign, US; section "Per-year solver (Batch 3C)" just above
  `newWithdrawal`; spec `docs/superpowers/specs/2026-10-07-cliff-plan-design.md`).** Hooks: `magiThresholds` (the year's
  federal lines in household MAGI, each `{ magi, label, id, ret, family }`: `id` in `medicaid | acaFloor | aca400 |
  irmaa1..irmaa5 | senior | ctc`, `ret` 'H' or, in a two-return year, 'A' / 'B', `family` `aca | irmaa | tax`; lines within $1 of each other count as one: the earlier is kept, except that an `aca` or `irmaa` line replaces a `tax` line, so an intent never names `senior` or `ctc`; with
  `c.lo/c.hi` only the lines in that reach, a shared empty list (`NO_THRESHOLDS`) when none; IRMAA lines sit on the tiers of
  the year the surcharge is charged, two years on (`c.irmaaGrowth`, the year loop passes `irmaaGrowth2`, the estimate
  `irmaaAt` uses), on this year's return's filing status (the return SSA will read, E3) for the partners on Medicare then, and
  in a year with an in-year IRMAA appeal candidate on this year's edges (growth 1, per return through `c.irmaaGrowthA/B`; the
  candidate's partners added: `a: medA || inYrA`); the edges are Medicare's MAGI translated
  into the engine's with `magiForIrmaaLine` on this year's return (`c.profile`'s benefit, `c.filing`); the Roth-conversion ceiling
  `irmaaTierCeiling` keeps this year's edges, the safe side there, 13.7 A), `lambdaEstimate` (future tax on a
  traditional dollar, 9 `taxFor` calls: three sample years, each walking today's pool forward at the real return net of
  `tradShare x` the year's need less benefits started since, pricing `max(RMD, min(pool, draw))`, moved to the year the
  walk empties the pool (`movedSample` flags it; a known defect left for Batch 5); IRMAA is priced on Medicare's MAGI (`irmaaMagiOf`
  with the sample's own benefits); two-return samples price IRMAA per person; the year loop's `lambdaOf` passes `need = max(0, -flow - lumpExpense)` and the start-of-year traditional
  share), `afterTaxValue`. Primitives on `wd`: `magiCap` (limits penalty-free traditional draws only; gains and early
  Roth earnings still raise MAGI, so it is not a hard MAGI guarantee), `releaseMagiCap` (before penalized money and
  home equity), `fillTraditional`, `freeTraditional`, `cappableTraditional` (the traditional drawn that a cap could
  limit: `takeTraditional` with `penalized === false && uncapped === false`, and the live-mix draw of
  `drawMixedStockAccounts`; a new draw path that honours `magiCapLeft` must add to it, or the plan never offers a
  stay-under for that mode). The bond reserve's traditional draw is uncapped in both strategies.
  **Run modes** (`runProjection({ ..., planMode, plan })`): `off` (no steering; byte for byte the guard-off year,
  pinned by `tests/plan_off_anchor.js --base DIR` with a tree at or after `4834615`, E3 Task 3; before it `aef6cb2`, E3 Task 1, was the baseline, then `5eb30fa` up to E3 Task 1, and `3ebee0e` up to `ce5fb56`), `choose` (deterministic run only: each withdrawal year with
  a line in reach runs as phases: the natural year converged, then each candidate from `yearPlanCandidates` (a
  stay-under at the nearest real cliff and at the largest one, offered only when `underEligible`: cappable traditional
  drawn and the natural MAGI less its conversion over the line; a fill to the nearest floor, `fillEligible`, penalty-free
  traditional only) as its own converged iteration from the year's snapshot, seeded from the natural draw; a trial wins
  if it met its line, left no need unmet, cut premium plus IRMAA by more than $1 and beats the natural `afterTaxValue`
  score by more than $1; a stay-under year converts nothing; the winner is recorded as `intents[age] = { kind, line, ret }`
  and returned as the non-enumerable `cliffIntents`), and `apply` (follow `plan.intents` by Partner A's age: the intent's
  line looked up by `id` and `ret` in that year's lines, built only in a year with an intent; absent line, natural year
  already on the plan's side or ineligible: the natural year; otherwise one trial, kept if it met its line with no need
  unmet, else the natural year is replayed. No scoring, no lambda). `apply(choose's intents)` replays `choose` exactly.
  **Planning**: `computeCliffPlan()` (pure; saves and restores `histTaxFactors`) runs `choose`, the ACA-only and
  IRMAA-only subsets through `apply` when both families appear, and `off`, and keeps the best by rule A
  (`planCandidateBetter`: later depletion, then the after-tax end value by more than $1, then fewer intents);
  `afterTaxEndValueUS(sim)` reads the run's non-enumerable `estate` (final balances, last year's tax profile): face value
  for Roth, taxable (stepped-up basis), cash and home equity, traditional net of ten slices of tax on the last year's
  return; a `choose` run that records no intent is the `off` run row for row, so it is reused as the `none` candidate.
  `refreshCliffPlan()` (first line of `render()`) stores `cliffPlan`, `cliffPlanKey` (JSON of state),
  `cliffPlanReport` and `cliffPlanState` (the state object); it re-plans only when the inputs change (state JSON, tax year
  `currentYear`, the optimizer override maps), otherwise it keeps the plan and only records the state object. **`runProjection`'s first statement**, with no `planMode`:
  `plan = planForState(); planMode = plan ? 'apply' : 'off'`. `planForState()` (every step also requires the tax year `currentYear` the plan was made under): the very object `refreshCliffPlan` planned
  for gives `cliffPlan` (dashboard, and every variant that mutates `state` in place and restores it: age lines, tornado,
  sensitivity, optimizer, which apply the main plan by age and never re-plan); else guard off gives null; else the
  state's JSON equal to `cliffPlanKey` gives `cliffPlan`; else `cliffPlanCache` (16 entries, emptied when full; keyed on the tax year and the state's JSON) gives or
  stores the plan computed for it now (the scenario comparison and overlay swaps, and load / undo / reset before
  `render()`). The state-replacement sites are NOT edited (all are shared code under `src/shared/`, and a clear at the comparison swap
  would wipe the plan mid-render): a new code path that swaps `state` needs nothing; one that mutates it in place
  without restoring must call `render()`. Tests: the US hooks (`src/us/ui/install-test-hooks.js`, installed after the shared ones) redefine
  `__test_simulate`, `__test_simulateHistorical`, `__test_runHistoricalCycles`, `__test_runMonteCarlo` and
  `__test_accountTrace` to re-plan when the state's JSON or the tax year changed (`ensureTestPlan`, never called from production code; it also
  wraps `__test_optimizeRothLadderPerYear`, `__test_optimizeMultiLever`, `__test_rothScheduleCost` and
  `__test_applyMultiLeverSchedule`); `__test_setCliffPlan` marks its plan as not computed (the next refresh re-plans) and
  `__test_cliffPlanComputes()` counts plans;
  benchmarks use `__test_simulateRaw` / `__test_simulateHistoricalRaw` after one refresh; `__test_runPlanMode`,
  `__test_refreshCliffPlan`, `__test_setCliffPlan`, `__test_planForState`, `__test_replaceState`,
  `__test_scenarioMetrics`, `__test_planStats`; `window.__test_planTrace(rowFn)` returns the `choose` trace (each
  year's candidates, `movedSample`, `lambdaNeed` (the need passed to `lambdaEstimate`, null when lambda was not computed),
  the intent), or with `rowFn` the `apply` trace on that path. `planStats` counts
  what `apply` did (intentYears, applied, skippedSide, skippedIneligible, fallback, absent, rothShift, irmaaStayUnders,
  irmaaZeroSaving; cumulative, scans read deltas). `magiStats.planMissed` counts plan years (choose / apply) whose
  final realized MAGI missed the plan's target (an invariant guard: a plan wins only when it met its line). Rows carry `cliffChoice` ("stayed under ..." / "filled to ...") only
  in a year where the plan was carried out; `annotateSolverRows` (US, after the shared `renderTable`) puts it in the
  status cell's tooltip. State-law cliffs and the senior / CTC lines are priced by `taxFor` but are not candidates.
  The `wd` fields `taxAwareOrder` / `onlyPartner` are wired but unused (Batch 5: the tax-aware order, the two-return draw
  split and conversion sizing, as plan intents); the live-mix toggle still runs `pickLiveWithdrawalOrder` per path.
  Tests: `tests/cliff_plan.js`, `tests/cliff_guard.js`, `tests/end_value_us.js`, `tests/solver_hooks.js`,
  `tests/solver_primitives.js` (in `npm test`); `tests/plan_off_anchor.js --base DIR`, `tests/bench_solver.js --base DIR`,
  `tests/solver_scan.js`, `tests/solver_gap.js` (not in `npm test`).
- `syncControls()` and `syncContributionControls()` — **two separate**
  functions that both push `state` back into the DOM, and the split is
  deliberate (the contribution sync must not reformat money fields while the
  user types in another field). The registry removes the "wired into the wrong
  one" bug: each `bool`/`choice` entry says which function owns it (`sync:
  'controls' | 'contrib'`), and each function loops over its entries
  (`syncFieldDom`), so the owner is explicit data, not a place you have to
  remember. Hand-written lines remain only for effects that are not a single
  control (singlePerson's partner-B hiding and headings, the tenure/choice
  button groups, the wizard's numeric mirrors, the safe-withdrawal-rate boxes).
  Button groups (`tenure`, `buyCash`, `k401Type`, `iraType`, `pensionCoverage`,
  `filingStatus`) are still wired by hand (`manual: true`) but registered so
  MCP and `normalizeState` share their value lists.
- `render()` — the "redraw everything" function called after every input
  change. Expensive collapsible results (tornado chart, Roth/RRSP bracket
  optimizer, cash-flow Sankey) are only computed when their card is open,
  gated inline in `render()` with a matching `toggle` listener.
- `mortgageSchedule()` / `loanSchedules()` — compute a fixed level monthly
  payment via `mortgagePayment(principal, annualRate, years)` from the
  **original** principal and term, never from the current balance and
  years-remaining (a real loan's payment doesn't shrink just because extra
  principal was paid down). Downstream code reads `schedule.payments[year]`/
  `schedule.balances[year]`, never `state.mortgage*`/`loan.term` directly.
- `SENSITIVITY_LEVERS` / `computeSensitivity()` / `renderTornadoChart()` — the
  tornado chart; levers swept are read live from checked `data-lever`
  checkboxes (a display choice, not part of `state`/scenario export).
- `chartView`/`mode`/`logScale`/`mcPathCount`/`chartShiftMode`/
  `chartGapPartner` (live bindings exported by `src/shared/core/chart-prefs.js`
  and `store.js`; assign them through `assign<Name>`) are all
  plain module variables, not `state` fields — chart-display preferences
  that reset on reload and never round-trip through scenario
  export/import. `chartShiftMode` ('together'/'gap') controls whether the
  ±1yr/±3yr comparison chart shifts both partners' retirement ages
  together, or shifts only one partner's date toward/away from the other
  partner's (fixed) date. `chartGapPartner` (`null`/'A'/'B') controls
  *which* partner moves in 'gap' mode: `null` auto-tracks whichever
  partner currently retires earlier (the original behavior); an explicit
  `'A'`/`'B'` pick sticks even against the grain (varying the
  later-retiring partner while the earlier one stays fixed) — the
  "Closer"/"Farther" math is sign-based on `movingAge <= fixedAge` to
  handle both directions correctly, not hard-coded to "moving partner is
  always earlier." Both variables' dependent UI (`#chartShiftModeRow`,
  `#chartGapPartnerRow`, button active/disabled states) is recomputed on
  every `renderChartView()` call, not just on a button click, so it stays
  correct as retirement-age sliders or single-person mode change live.
- `computeSankeyFlow()` / `layoutSankeyColumn()` / `renderSankey()` — cash-flow
  Sankey; routes every source through a single neutral hub node rather than
  drawing direct source→expense ribbons (no per-dollar tracking exists).
- MCP tool hooks (`read_fire_projection`, `update_fire_assumptions`) in
  `src/shared/ui/mcp-tools.js`, registered by `registerMcpTools()` (called near the end of
  `main.js`) if `document.modelContext` exists. The input
  schema and the `execute` allow-list are derived from `FIELDS` (every numeric
  field plus each `mcp: true` entry), so a new field needs no MCP edit.
- Mobile layout is a pure CSS toggle (`#workspace[data-mobile-view]`), not app
  routing state — it isn't part of `state`/scenario export. Canvas-based
  charts measure their container via `getBoundingClientRect()`, which is
  zero/stale while hidden, so switching to the Dashboard tab always calls
  `render()` again to get a correctly-sized redraw.

See `docs/reference.md` for the full write-ups of the Plan Status Bar, the
sidebar field search, money-field in-place formatting, the "Estimated" field
badges/guided review, the unusual-assumption warnings, and several
`position:sticky` / mobile-viewport bugs (a recurring trap: `overflow-x:hidden`
on an ancestor silently breaks `position:sticky` everywhere on the page — use
`overflow-x:clip` instead, and verify sticky behavior with a real scroll
gesture, not `window.scrollTo()` + an overflow-width check).

## Shared code between the planners

Code both planners use lives once, in a module under `src/shared/core/` or `src/shared/ui/`, and both planners import it, so it
is identical in both by construction (the stylesheet and the HTML partials under `src/shared/styles/` and `src/shared/partials/`
are build-time includes, above). Country code lives in `src/<country>/core|ui/`; shared code reaches it only through the seam
facades (`#country/core/seam-<name>`, `#country/ui/seam-<name>`; below). The old `@@shared` regions and `scripts/sync-shared.js`
are gone: `docs/superpowers/inventory/stage{2,3,4}-region-map.md` say which module now holds each old region's units, and
`tests/no_markers.js` keeps `@@shared` markers out of `src/`. The extraction tool no longer makes shared modules (it refuses a
manifest module with `owner: 'shared'`): write new shared code in `src/shared/` directly. To share code that still differs
between the planners, first remove the difference, then move it into one `src/shared/` module (a name that differs per country
goes through a seam). The two `runProjection` year loops are deliberately not shared (`src/us/core/projection/run-projection.js`,
`src/canada/core/projection/run-projection.js`; see `docs/phase2-refactor-plan.md` section 7, step 4.5): put a new per-year rule in a
shared stage helper when it is identical in both countries, otherwise edit each loop. Line endings do not matter: the build and
the analysis tools normalize CRLF to LF on read, and the regroup tool writes LF (including this file and `tests/state_modules.js`);
git normalizes on commit (`core.autocrlf=true`), so a CRLF checkout shows "LF will be replaced by CRLF" warnings until then and
nothing needs converting by hand.

## Shared state and country seams (stage 1 of the module split)

- **Cross-module mutable state lives in modules, not in the closure.** `state`, `mode`, `scenarios` and `compareIds` are in
  `src/shared/core/store.js`; the nine chart preferences in `chart-prefs.js`; `histTaxFactors` in `tax-factors.js`. The modules
  that use them import them. **To change one, call its `assign<Name>` function** (`assignState`,
  `assignMode`, `assignLogScale`, ...): assigning to an import is a build error (`Cannot assign to import`). The names are
  `assign…` because `set…` is taken by UI handlers (`setMode`, `setChartView`) that do more than assign. A new binding that
  several modules write belongs in one of these modules (or a new one next to them, at the top of `core/`).
  The state modules sit at the top of their `core/`, beside the seam facades: shared `store.js`, `chart-prefs.js`, `tax-factors.js`;
  US `tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`. Every other `core/` module is in a topic folder.
- **US-only state** is in `src/us/core/`: `cliffPlanStore` (`.plan`, `.key`, `.report`, `.forState`, `.year`, `.overrides`,
  `.computed`, `.computes`: the fields the "Per-year solver and the cliff plan" bullet above calls `cliffPlan`, `cliffPlanKey`,
  `cliffPlanReport`, `cliffPlanState`, `cliffPlanYear`, `cliffPlanOverrides`, `cliffPlanComputed`, `cliffPlanComputes`),
  `optimizerState` (`.rothBracketByAge` = the older `rothBracketOverrideByAge`, `.withdrawalMixByAge` =
  `withdrawalMixOverrideByAge`, `.lastMultiLeverRun`, `.rothPerYearEvalBudget`), `testHooks` (the test-only counters) and
  `currentYear` (`assignCurrentYear`).
- **Country seams: shared code imports country code as `#country/<name>`.** `src/package.json` maps it to `src/us/<name>.js` or
  `src/canada/<name>.js`; `scripts/build.js` passes the planner's name as the esbuild condition (a build without it fails with
  `Could not resolve "#country/..."`), and plain Node resolves it with `--conditions=us|canada`. Both countries must provide
  the module and export the same names; `tests/country_contract.js` checks this and only accepts named imports
  (`import { a, b } from '#country/<name>'`). The first seam is `#country/storage-key`, used by `src/shared/ui/plans/storage.js`.
  To add a seam: create `src/us/<name>.js` and `src/canada/<name>.js`, import from `#country/<name>` in shared code, run
  `node tests/country_contract.js`.
- **Checks that guard this:** `tests/closure_names.js` fails on any name a source file under `src/` uses without declaring (esbuild does not
  report that; stage 1 edits remove declarations), `npm run analyze` regenerates `docs/superpowers/inventory/` (the closure
  inventory and the module map), and `src/**/core/` files must not touch `document`, `window`, `localStorage` or `navigator`.

## Modules, the entry point and the tools (stages 2-4 of the module split)

- **Where code lives.** Stage 2 moved the first four dependency layers out of the planner IIFE, stage 3 every remaining DOM-free unit,
  stage 4 the UI layer and every side-effect statement (design `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`). Shared code is under
  `src/shared/core|ui/`, country code under `src/<country>/core|ui/`. A module is under `core/` when none of its units uses a browser global,
  calls a DOM method on an element, or imports a `ui/` module, and under `ui/` otherwise. `tests/core_purity.js` checks only that
  `core/` files reference no DOM (browser globals, DOM method calls) and import nothing from `ui/`; it does not check that a
  module under `ui/` needs to be there. `ui/`
  modules are named by topic (`theme.js`, `sidebar.js`, `wizard.js`, `info-bubble.js`, `undo.js`, `mobile-view.js`,
  `scenarios.js`, `chart-controls.js`, `mcp-tools.js`, `src/us/ui/inputs/fields.js` for `FIELDS`, ...). `core/` is split into topic folders
  (the core regroup, 2026-10; see "Where new code goes") and a file is named by what it holds, not after its first unit;
  `scripts/plan-regroup.js` (maps in `scripts/extractions/core-regroup-*.json`) and the regroup tool are how modules move. No module name ends in `-<digits>` (`tests/module_names.js`). Module files keep the two-space
  indentation they had inside the IIFE (the tools move text verbatim; do not reformat a module in a commit that also changes it). To find
  a unit: `grep -rn "function taxFor" src`, or the module map below.
- **`main.js` is the entry point.** Each planner's `main.js` holds no declaration: an import block, then one IIFE that runs, in start-up
  order, the **wiring calls** (`wireThemeToggle();`, `loadSavedState();`, `wireWizard();`, ...), the start-up statements pinned there
  (US `FIELDS.forEach(... REVEAL_BY_ID.set ...)` and `assignState(normalizeState(null));`, Canada `assignState(normalizeState(null));`),
  the boot sequence (`if (hadSavedState) dismissFirstRunBanner();` through `initChartHover();`), `wireTableFocus();`, and last
  `registerMcpTools();`, `installSharedTestHooks();` and `installTestHooks();`. A **wiring function** is an exported function of a `ui/`
  module whose body is a run of former top-level statements (listeners, start-up reads), called once, from `main.js`, where those
  statements used to run; so a listener lives next to the code it drives and the start-up order is unchanged. Wiring functions live only
  in `ui/` modules, never in `core/`.
- **Rule 3 (test hooks and MCP; design section 5.7).** `window.__test_*` hooks and the MCP tool registration are installed only from
  `main.js`, by calling `registerMcpTools()`, `installSharedTestHooks()` and `installTestHooks()`, in that order. They are defined in
  dedicated `ui/` modules (`src/shared/ui/mcp-tools.js`, `src/shared/ui/install-test-hooks.js`, `src/<country>/ui/install-test-hooks.js`),
  never in `core/`. The country installer runs last because it redefines some shared hooks (the US `__test_simulate`,
  `__test_simulateHistorical`, `__test_runHistoricalCycles`, `__test_runMonteCarlo`). (`src/us/core/test-hooks.js` is different: the
  engine's test-only counters.)
- **The country seam.** Shared code that needs a country name imports it from that name's own facade (one import line per name), a
  one-line module each country has (`export { render } from './render.js';`): `src/<country>/core/seam-<name>.js`, imported as
  `#country/core/seam-<name>`, or `src/<country>/ui/seam-<name>.js`, imported as `#country/ui/seam-<name>`. A name's facade
  is under `ui/` in both countries if either country's module for it is under `ui/` (shared code imports one specifier for both countries),
  else under `core/`. No test checks the side as such: `tests/core_purity.js` (which checks only that `core/` files reference no
  DOM and import nothing from `ui/`) fails a `core/` facade that re-exports a `ui/` module, but not a `ui/` facade of a `core/`
  name; the regroup tool moves facades by this rule. There are 24 seam names (`scripts/extractions/stage4.json`, `seam`): under
  `ui/` `render`, `syncControls`, `DECISION_QUESTIONS`, `computeRothOptimizer`, `computeSankeyFlow`, `buildPrintReport`, `FIELDS` and
  `normalizeState`; under `core/` the rest (`taxFor`, `runProjection`, `defaults`, `DYN`, `SENSITIVITY_LEVERS`, `mcpSchemaFor`, ...). One
  facade per name, not one for all: a single facade reached every country module it named and made one large import cycle per country.
  Adding a name means a country module exporting it and a facade in both planners; `tests/country_contract.js` checks that both countries
  export the same names. The alias is resolved by the build condition (`us`/`canada`).
- **UI import cycles and the load-time guard.** Import cycles are allowed only among `ui/` modules (seam facades included; a facade's
  re-export is a pass-through edge). Today there is one per country, the render cycle: one strongly connected group of 13 modules,
  the nine shared `src/shared/ui/` modules `charts/chart-view-mode.js`, `results/decision-questions.js`, `inputs/estimate-badges.js`,
  `inputs/estimate-review.js`, `layout/mobile-view.js`, `results/plan-status-bar.js`, `charts/sankey.js`, `charts/tornado.js` and
  `results/unusual-warnings.js`, plus that country's `ui/charts/chart-controls.js`, `ui/charts/chart-view.js`,
  `ui/results/decision-questions.js` and `ui/results/render.js`, allowed because every one passes the load-time guard below. It
  started with the chain country `render` -> decision questions -> `setChartView` -> `render` (an example, not the whole cycle).
  `core/` stays acyclic: `tests/ui_cycles.js` refuses any import cycle with a member outside `ui/` (`tests/core_import.js`
  imports each `core/` module alone in a fresh process, which catches a load-order failure across a cycle, but does not
  refuse a cycle as such). esbuild turns a module's top-level `const` and `let` into `var` and bundles
  in dependency order, so a read across a cycle while modules load would give a silent `undefined` (native ESM: a TDZ error). The guard
  (`scripts/lib/load-time.js`, run by `tests/ui_cycles.js` on every `ui/` and `core/` module, by the applier on a cycle it would create and by the
  regroup tool after every operation): a `ui/` or `core/` module holds no top-level statement other than declarations (its statements are in
  wiring functions, which run from `main.js` after every module has loaded), and every top-level initializer must be **inert**
  (literals, template literals without expressions, function, arrow and class expressions, unary operators on those, object and array
  literals of inert values; a reference to another name is not inert), or carry a comment block directly above it whose first line is
  `// load-time: <reason>` saying why it reads nothing a statement or another function writes. In a module that is part of an import
  cycle, a marked initializer may use only global names (browser globals and ES built-ins such as `Set`) and literals. `core/` modules are held to the same guard; they are never in a cycle, so a marked
  initializer there may also read earlier constants of its own file and its imports. A `let x = <init>` that read start-up state was split by the tool into `let x;` plus `x = <init>;` inside
  the module's wiring function (`hasPersonalizedData` in `src/shared/ui/plans/saved-plan.js`, set by `loadSavedState()`).
- **State.** Cross-module state goes through the `assign…` functions described above. A UI binding (`theme`, `sidebarCollapsed`,
  `wizardStep`, ...) is a module-level `let` in the one `ui/` module that holds all its writers, exported for reading only; a module that
  exports a `let` is read by others as a live binding, and they must not assign it (esbuild: `Cannot assign to import`). A `let` written by
  one function lives in that function's module (for example `taxFactorInflation`, the memo of `taxIndexFactor`).
- **The module map.** `npm run analyze` writes `docs/superpowers/inventory/module-map.md` (`scripts/module-map.js`): one table per directory,
  one row per module with its exports and purpose; seam facades are one row per directory. `npm test` runs `module-map.js --check
  --require-purpose`, so the map must be current and every `core/` and `ui/` module (not a facade) needs a **purpose comment**: line 1 of the file, a
  `//` line that does not start with `load-time:`, followed by a blank line (so it never joins the first unit's comment block).
- **Data blocks.** A `// NAME:begin ... // NAME:end` block (`STATE_RULES`, `MEDICAID_RULES`, `PROVINCE_RULES`, `BENEFIT_RULES`) is moved whole
  with both markers. `scripts/gen-*-rules.js` find it in whichever file holds it (`scripts/lib/marker-source.js`) and evaluate the text with
  `export` removed.
- **The extraction tool.** `node scripts/plan-extraction.js [--core-only] [--max-layer=N] [--max-batch=N] [--seam=a,b] [--topics=FILE]
  [--reserved=FILE] > plan.json` prints a plan for the current `main.js`; `node scripts/extract-units.js --manifest plan.json --batch N
  [--dry-run]` applies one batch and writes nothing unless every check passes (it stages its files and renames them into place). It
  creates country modules only: a manifest module with `owner: 'shared'` is refused (no shared region remains to extract from), so new
  shared code is written in `src/shared/` directly. Little is left for it: `main.js` holds only calls.
- **The regroup tool.** `node scripts/regroup-modules.js --map <file> [--dry-run]` applies a map of renames (`{ "rename": old, "to": new }`),
  merges (`{ "merge": [paths], "to": path }`) and moves of one top-level declaration with its comments (`{ "move": name, "from": path, "to":
  path }`), in order; `--dry-run` prints what it would do and writes nothing. It rewrites every import in `src/` (relative paths and seam
  facades), the exact module paths in `tests/state_modules.js`, in this file and in the region maps
  (`docs/superpowers/inventory/stage{2,3,4}-region-map.md`), and counts the names `tests/state_modules.js` reads from a module
  as importers before it removes an export (`tests/doc_paths.js` checks every module path under `src/` in these docs exists), and reports a generated rule doc whose source path changed
  (`regenerate: npm run gen:...`). After every operation it re-runs the structural guards (facade side, `core/` purity, no cycle touching
  `core/`, the load-time guard, no undeclared name, no initializer reading a later declaration) and bundles both planners to report any
  change in the order the `// load-time:` initializers run; it refuses a name clash, a mutable binding moved without all its writers and
  UI code moved into `core/`. It checks every operation, on a staged copy, before it writes anything: a failed check refuses the whole
  map and writes nothing. Writing is staged files renamed into place at the end, so an operating-system failure during those final
  renames (a Windows file lock) can still leave a partial application, visible in `git status` (a T12 limit in
  `docs/superpowers/inventory/stage4-open-items.md`). It writes LF line endings (see "Shared code between the planners"). `scripts/extractions/stage4-regroup.json` is the stage 4 tidy.
- **The build comparison.** `node scripts/compare-builds.js --base <dir> [--head <dir>] [--ordered]` compares the built planners of two trees
  (each with a built `dist/`) statement by statement: it flattens the IIFEs, expands each wiring function back into its call site (a new
  top-level function called exactly once as `name();`), undoes the split rule, and compares the multisets of statements; `--ordered` also
  requires the statements that are not declarations to run in the same order. Run both modes after any change that only moves code; a
  feature changes statements on purpose. The order of declaration initializers is not compared (the load-time guard covers `ui/` and `core/`).

## Where new code goes

Code is placed by topic. Each `core/` has these folders (a folder exists only where the side has code for it; read them with
`find src/*/core -mindepth 1 -maxdepth 1 -type d`):

- `tax/` — US: the federal rules and deductions (`federal-rules.js`), `taxFor` and the tax functions (`federal-tax.js`), Social
  Security taxation, state tax and `STATE_RULES`. Canada: the tax rules, `PROVINCE_RULES` and the tax functions.
- `benefits/` — Canada: `BENEFIT_RULES` and `benefitsFor`.
- `healthcare/` — US: ACA, Medicaid (`MEDICAID_RULES`), IRMAA and the 162(l) deduction. (Canada's flat `healthcareCost` is in
  `income/year-stages.js`.)
- `income/` — the per-year stages: contributions, income streams, Social Security (CPP and OAS in Canada), pensions, required
  distributions, housing and loans, `buildTaxProfile`.
- `accounts/` — US: the account and Roth ledgers and the early-withdrawal penalty status.
- `withdrawals/` — the withdrawal strategies, the draws and solvers, the Roth conversion (US) and RRSP meltdown (Canada).
- `cliff-plan/` — US: the per-year solver and the cliff plan.
- `projection/` — the engine (`runProjection`, the year modes and sources, factors), the historical data, guardrails, `simulate`.
- `optimizer/` — US: the Roth and multi-lever optimizers.
- `inputs/` — `defaults`, the `DYN` list specs, `FIELDS` metadata, the list rules, normalization and the estimate checks.
- `analysis/` — sensitivity, decision comparison, shortfall drivers, estate (Canada) and other read-only reports on a projection.
- `format/` — shared: number and chart formatting, the Sankey layout.

Rules: the state modules (above) and the seam facades stay at the top of `core/`; a new topic gets a new folder only when no
existing one fits; there is no `core` or `ui` folder inside a side's tree (`tests/src_paths.js`). After adding or moving a module,
run `npm run analyze`.

Each `ui/` has these topic folders (read them with `find src/*/ui -mindepth 1 -maxdepth 1 -type d`; a side has a folder only where
it has code for it):

- `charts/` — the projection, Monte Carlo, tornado and Sankey charts, chart colors, hover, the toolbar and chart view mode;
  per country the chart controls and view, the Sankey flow and the sensitivity sweep.
- `inputs/` — the sidebar: field wiring (ids, listeners, DOM sync, search, gestures), money formatting, info bubbles, the category
  rail, the estimate badges and review, the dynamic lists and button groups; per country `syncControls` (and in the US `FIELDS`
  and the `normalizeState` facade target).
- `results/` — the dashboard: `render`, the headline tiles, plan status bar, projection table, shortfall banner, unusual-assumption
  warnings, decision questions and the Roth optimizer card and controls.
- `plans/` — saving and comparing: storage, autosave, the saved plan, undo, reset, scenarios and their comparison and export, export
  and print; per country the print report.
- `layout/` — shared only, the app shell: theme, sidebar, mobile view, layout listeners and metrics, the disclaimer link.

At the top of `ui/` stay the seam facades, `install-test-hooks.js`, `wizard.js` and (shared) `mcp-tools.js`.

## Adding UI code

- **Markup:** `src/<country>/index.html`, or a shared partial in `src/shared/partials/`, as before.
- **Behavior on an existing topic:** a function in that topic's module (find it in `docs/superpowers/inventory/module-map.md`). A
  listener that belongs at an existing point of start-up goes inside the module's wiring function; one that needs its own point gets a
  new exported wiring function, called once from `main.js` where it should run.
- **UI state:** a module-level `let`, assigned only in its own module; another module that must write it calls an `assign<Name>`
  function the module exports. Reading it elsewhere is a live import.
- **A new topic:** a new module in its topic folder (`charts/`, `inputs/`, `results/`, `plans/` or, shared only, `layout/`) under `src/shared/ui/` (both planners) or `src/<country>/ui/`, whose line 1 is a one-line purpose
  comment followed by a blank line (the module map reads it), then `npm run analyze` to update the module map.
- **A country name in shared UI code:** import it from `#country/ui/seam-<name>` (or `#country/core/seam-<name>` for a `core/` name);
  a new name needs a facade in both countries (see "The country seam").
- **Initializers:** in a `ui/` module, a module-level initializer that computes something (anything but literals, functions, arrows,
  classes, and object or array literals of those) runs when the module loads. It needs a comment block directly above it that starts
  with `// load-time: <reason>`, saying why it reads nothing a statement or another function writes; otherwise compute it inside a
  wiring function. In a module that is part of an import cycle, a marked initializer may use only global names and literals
  (`tests/ui_cycles.js` checks both). The same rule applies to a `core/` module (it is not in a cycle, so the marked initializer may also read
  earlier constants of its own file and imports).
- **Test hooks and MCP tools:** in `src/<country>/ui/install-test-hooks.js` / `src/shared/ui/install-test-hooks.js` and
  `src/shared/ui/mcp-tools.js` (rule 3 above), never in `core/`.
- **The guards:** `tests/closure_names.js` (undeclared names), `tests/ui_cycles.js`, `tests/no_bare_imports.js`, `tests/module_names.js`,
  `tests/main_entry.js`, `tests/doc_paths.js`, the module-map check, all in `npm test`. The ordered build comparison is for refactors only; a feature changes the statements on purpose.

## US vs. Canada: same shape, different names, not a find-and-replace

(Shared warnings: `UNUSUAL_RANGES` lives in `src/shared/core/inputs/estimates.js` and accepts an item with `check()` and `message()` instead of a
range; the US pushes its Social Security-before-retirement items onto it in `addSocialSecurityWarnings()` (`src/us/ui/results/unusual-warnings.js`,
called from `main.js` right after the shared `wireUnusualWarnings()`; 7O O5), so the shared module stays the same for both planners.)

The two planners share overall structure but diverge in ways that make blind
copy-paste silently wrong — always read both files' relevant sections side by
side before porting a feature:

- US: `ssMonthlyA/B` (Social Security) + `filingStatus` (`mfj`/`single`, with
  a `marryLater` transition age) + `rmdDivisor(age)`. Canada: `cppMonthlyA/B` +
  `oasMonthlyA/B` (the recovery tax, `oasClawback()`, is charged inside `personTaxCA`, 7N N1) + `rrifMinPct(age)`; no MFJ/single
  distinction — Canada always taxes spouses as two individual returns.
- `taxFor(profile, gains, traditionalExtra)` has **3 branches** in US (`mfj` /
  `singlePerson` / a two-separate-filers branch for pre-marriage
  `marryLater`) but only **2** in Canada (`singlePerson` / two individual
  `personTaxCA` calls; Canada's `taxFor` is `incomeTaxCA` minus the income-tested benefits, see "Income-tested benefits" below).
- Canada has pension income splitting (`pensionSplitEnabled`,
  `solvePensionSplit()`) with no US equivalent; US has ACA subsidies, IRMAA,
  and Roth-conversion-ladder MAGI gating with no Canada equivalent (Canada's
  closest analog is the RRSP meltdown ladder, with no income-tested
  healthcare cliff to gate against).
- Both `taxFor()`'s `singlePerson` branch reads **only** the `A`-slot profile
  fields — survivor modeling has to actively remap the surviving partner's
  data into the `A` slot when Partner A died, rather than just flipping
  `profile.singlePerson = true` in place.
  Anything summed into the A slot for the household (US: not-earned income streams, now `extraA` / `extraB`, each on its
  owner's slot) must be re-attributed to the survivor in that remap too, and the Canada
  `totalA`/`totalB`/OAS-clawback block keys off `aliveA`/`aliveB`, never off
  `effectiveSingle` alone. `tests/survivor_symmetry.js` (identical partners,
  A-dies must equal B-dies) guards both.
- **Canada federal credits (7J).** `federalTaxCA(income, yearIndex, extraCreditBase)` takes the basic personal amount as a 14% credit (`FED_CREDIT_RATE`; $16,452 phasing to $14,829 over `FED_BPA_PHASE_START`-`FED_BPA_PHASE_END`, keyed on net income), never as a deduction at the marginal rate, floored at zero. `personTaxCA(ordinary, gains, yearIndex, dtcBase, age, pensionIncome)` computes the age amount (65+, 15% clawback over the threshold, both indexed) and the pension income amount ($2,000, **not indexed**) in `ageAndPensionCreditBase` and passes the sum as `extraCreditBase`; Quebec's 0.835 abatement applies after them. Per-person data comes from `buildTaxProfile` (`ageA/B`, `penA/B` = eligible pension income after the split transfer; from `RRIF_PENSION_AGE` = 71 `taxFor` adds the discretionary RRSP/RRIF draw as RRIF income: an RRSP withdrawal is not pension income before the RRIF conversion, 7K); a profile without them reads as under 65. `solvePensionSplit(..., ageA, ageB)` sees the credits and, with a 65+ partner, scans a 48-cell grid, refines inside the best cell and also tries the equal-income transfer (combined tax is non-convex through the clawback; under 65 it is the original ternary search). Brackets apply to income itself, so `solveMeltdown` fills to the bracket cap with no BPA term.
- **OAS recovery tax (Canada, 7N N1).** `personTaxCA(..., partnerPool, oas)` takes the OAS the person received and charges the recovery tax on the return's full net income: 15% over `OAS_RECOVERY_THRESHOLD` (95,323, indexed), up to the OAS. As on the T1 the repayment is deducted from net income first (line 23500, so the brackets and the age amount see the lower figure) and added to the tax payable (line 42200); credits do not reduce it and Quebec's abatement does not touch it. `incomeTaxCA` passes `profile.oasA/oasB` (already on the profile since 7L; the survivor remap puts the survivor's OAS in slot A) and leaves each return's recovery in the module scratch `OAS_RECOVERY.a/.b` (written only when a return has OAS; read it right after the `taxFor` call whose income you want). Because Canada `taxFor` is the net cost, every draw solver prices the 15% with no solver change. `solvePensionSplit(..., ageA, ageB, oasA, oasB)` carries the OAS so the kink is inside its objective. In the year loop the cash flow starts from GROSS OAS and `tax` includes the recovery; the row keeps `ss` (CPP plus OAS, a field name inherited from the US planner) net of the recovery, adds `oasClawback`, and reports `tax` WITHOUT the recovery (as `benefits` is added back), so tables and the Sankey show each amount once. Tests: `tests/oas_recovery.js` (engine), the OAS section of `tests/unit/canada/tax-brackets.test.js`, the high-income scenario of `tests/survivor_symmetry.js`. `tests/bench_canada.js --base DIR` is the Canada timing gate (interleaved, one process).
- **After-tax estate (Canada, 7N N8; display only).** `runProjection` attaches the final balances as a NON-ENUMERABLE `estate` property (`traditional`, `taxable`, `taxableBasis`, `roth`, `cash`, `homeEquity`), so the result's own fields and every snapshot are unchanged. `afterTaxEstate(sim)` = last row's total less the tax the RRSP/RRIF and the deemed gains (50% inclusion) add to one final return (stacked on the last survivor's share of the last year's income, via `personTaxCA`) less `probateFee(rule, taxable + cash + home equity)`; registered accounts and the TFSA are assumed to pass by beneficiary designation (outside probate). Row family `probate` per province (`steps` flat fees up to a limit, `base` the fee above the last step, `bands` marginal rates per $1,000 or part: Ontario 15 over 50,000, BC 6 and 14, Alberta steps to 525, Saskatchewan 7, Manitoba and Quebec none, New Brunswick, Nova Scotia, PEI, Newfoundland and Labrador per their statutes). Shown beside End assets in the printed report; `computeRothOptimizer` ranks by the highest after-tax estate among the plans that do not shorten the portfolio (it used to minimize lifetime tax; lifetime tax stays in the table); `renderRothOptimizer` is SHARED code (`src/shared/ui/results/roth-optimizer-card.js`, one text for both planners), so the Canada-only `annotateRothOptimizer`, called right after it from `render()` and fed by `lastRothOptimizer`, rewrites the summary and the five-column rows. Tests: `tests/unit/canada/estate.test.js` (Vitest, 27 checks, in `npm test`) and `tests/estate_optimizer.js` (Playwright, the 5 optimizer-ranking checks that need the ui/ `computeRothOptimizer`, in `npm test`).
- **Quebec health contributions (Canada, 7N N7).** Row family `healthContributions` (Quebec only). `incomeTaxCA` (Quebec only) adds, per return, the Health Services Fund contribution `quebecHsf(non-employment income)` (net income less wages, OAS and the dividend gross-up; 1% from the first threshold to 150, flat, then 1% from the second to 1,000; caps unindexed) and the RAMQ premium `quebecRamq(family income, couple, kids, yearIndex)` for each partner with no wages this year (every retired adult; owner decision), and adds the premium to the medical expenses. The premium table is the 2025 Schedule K scaled by 777.48 / 755 to the 2026 calendar maximum; the income at which it reaches the maximum is cached (`RAMQ_CAP`) so a household above it costs one comparison. Cost: not per call but call volume (the extra 1,900 of yearly need pushes more years into two-account draws); see the 7N notes. Tests: `tests/quebec_health.js`.
- **Low-income provincial tax reductions (Canada, 7N N6).** Row family `lowIncomeReduction` (null in AB, SK, MB and QC, whose forms have none), figures from the CRA 2025 provincial forms (British Columbia: the 2026 T4127 figures). `kind: 'perReturn'` (Ontario: `multiplier x (basic + child x redKids)` less the tax, off the tax) and `kind: 'income'` (British Columbia: `basic - rate x (net income - base)`) run inside `provincialTaxCA` after the dividend credit and before Ontario's health premium (`redKids` = children born in the last 18 years, claimed by the higher-income partner); `kind: 'family'` (NB, NL, NS, PE) is one household reduction worked out in `incomeTaxCA` by `lowIncomeFamilyReduction` (basic, spouse or eligible dependant, children, PEI age amounts, less a rate on adjusted family income over a base, limited to the sum of both returns' provincial tax, which each `provincialTaxCA` call leaves in the scratch `PROV_TAX.last`). Nova Scotia's 1,000 age tax credit is per return. Amounts index with the BPA flag. `solvePensionSplit` mirrors Ontario's children through `pay.rk`; the family reduction is not in its objective. Not built: Ontario's dependants with an impairment and the LIFT credit (Schedule ON428-A). Tests: the N6 block of `tests/unit/canada/tax-brackets.test.js`.
- **Medical expense credit (Canada, 7N N5).** `profile.medical` is the year's eligible expenses: the private health premium plus the WHOLE LTC cost (`healthcareCost` now runs before `buildTaxProfile`; owner decision: nursing-home care). One claim a household: `medicalClaimToB(netA, netB, yearIndex)` names the preferred claimant (the lower net income unless that partner is under the basic personal amount), and `incomeTaxCA` and `solvePensionSplit` price the other partner too, keeping the cheaper, only when the preferred return had no federal or provincial tax left for the credit (read from `PROV_TAX.fed` / `PROV_TAX.pre`, written by every `personTaxCA` call) and the other return has some; in Ontario with a 70+ spouse both claimants are always priced on tax less the Seniors Care at Home credit, whose floor depends on the claimant (keep that test a plain `state.province` comparison: reading the rule row in this hot function measured 1.2 to 1.35x slower in every province) (a 65+ partner owes nothing up to about 27,700, so the preferred claim could be wasted; 7N review fix; the low-income reduction and surtax interplay is not priced). `personTaxCA(..., provDeduction, medical)` adds `max(0, medical - min(3% of net income, FED_MEDICAL_THRESHOLD x factor))` to the federal credit base; `provincialTaxCA(..., extraCredit, medical)` does the same from the row family `medical: { threshold, familyIncome }` (Quebec: no dollar floor, 3% of family income). Ontario's refundable Seniors Care at Home credit (`careAtHome` row family; `careAtHomeCredit`) is subtracted in `incomeTaxCA` (net tax can be negative). `solvePensionSplit(..., kids, pay)` mirrors the claimant through `pay.med`. Not built: the federal top-up tax credit, Quebec's refundable medical credit. Tests: the N5 block of `tests/unit/canada/tax-brackets.test.js`, `tests/medical_credit.js`.
- **Payroll items and the home buyers' amount (Canada, 7N N4 and N10).** `payrollItems(wages, yearIndex)` fills the scratch object `PAY` (read it right after the call; the test hook returns a copy): `cash` (CPP or QPP, CPP2, EI at `payroll.eiRate`, QPIP), `fedCredit` (base CPP/QPP = `pensionRate` less the 1% first additional, plus EI, QPIP and the $1,501 Canada employment amount), `provCredit` (the same without the employment amount; zero in Quebec, which gives no credit for them), `deduction` (the enhanced CPP/QPP: 1% on the band plus the 4% second tier; a deduction from income federally, provincially and in Quebec) and `provDeduction` (Quebec's workers deduction, 6% to $1,450, provincial only). It is computed once a year in `buildTaxProfile` (never inside the solvers): the deduction lowers `otherA/B`, the credit bases ride on the profile as `fedCreditA/B`, `provCreditA/B`, `provDedA/B` (the survivor remap moves B's into slot A) and `personTaxCA(..., childKids, fedCredit, provCredit, provDeduction)` applies them; `solvePensionSplit(..., kids, pay)` takes the same numbers as one object so the split sees them. `payrollTax` returns `cash` for both earners (the cash cost reaches the engine through it). The home buyers' amount is a flat non-refundable credit base in the `rentThenBuy` purchase year (`housingYear.homeValue !== null`): the federal 10,000 and the row's `homeBuyer.amount` (Saskatchewan 15,000, Quebec 10,000; every other province none), on the higher-income partner's return. Not built: Quebec's tax credit for access to homeownership (up to 5,875), the EI/CPP effects of a person who works past 70. Tests: the N4/N10 block of `tests/unit/canada/tax-brackets.test.js`, `tests/payroll_credits.js` (engine, including the purchase-year plumbing).
- **Spouse, eligible-dependant and child amounts (Canada, 7N N3).** Federal: `federalTaxCA(income, yearIndex, extraCreditBase, claimMinus)` adds `max(0, bpa - claimMinus)` to the credit base, where `bpa` is the claimant's own phased basic personal amount (16,452 to 14,829) and `claimMinus` is the spouse's net income (0 for a dependant child; -1 means no claim). Provincial: each `PROVINCE_RULES` row has `spouse: { amount, threshold }` (CRA TD1 forms 2026; `null` for Quebec) and `childAmount` (Saskatchewan only: 8,358 for each child under 18 besides the one claimed as the eligible dependant); the credit amount is `clamp(amount + threshold - spouse net income, 0, amount)` and indexes with the BPA flag (Manitoba frozen). Quebec has no spouse amount, and its additional amount for a person living alone (single-parent family; 2,681 for 2026) is NOT built: the primary rule (Revenu Quebec guide line 361) gives it only to someone living with a child 18 or over in post-secondary studies who is not entitled to the Family Allowance, so a parent of a minor child gets nothing (the living-alone amount already covers a single parent). `personTaxCA(..., oas, spouseNet, depKids, childKids)`: `spouseNet >= 0` is a spouse claim, `depKids > 0` a single claimant's eligible dependant (one child; the rest are child-amount children), `childKids` the children whose child amount this return claims. `incomeTaxCA` decides who claims: the higher-income partner claims the spouse amount (A on a tie) and the lower-income parent the children (A on a tie); a single person or survivor claims the dependant. `solvePensionSplit(..., oasA, oasB, kids)` mirrors the same rule on the post-transfer incomes (a test that re-prices the split must mirror it too: `claimNets` in `tests/unit/canada/tax-brackets.test.js`). Children under 18 come from `profile.dependents` (`countKids(deps, 0, 17)`). Not built: the transfer of a spouse's unused amounts. Tests: the N3 block of `tests/unit/canada/tax-brackets.test.js`, `tests/dependant_amounts.js` (engine), the child scenarios of `tests/survivor_symmetry.js`.
- **Provincial tax (Canada, `PROVINCE_RULES`, 7K).** One data row per province (the 10; no territories) between the `// PROVINCE_RULES:begin` / `end` comments (pure literals, read by `scripts/gen-province-rules.js`, which writes `docs/province-tax-rules.md`; `npm run gen:provinces`; `npm test` fails if it is stale and runs `tests/unit/canada/province-rules.test.js`, the coverage test). A row declares every field: `creditRate` (the lowest bracket rate: every non-refundable amount is worth that), `brackets`, `bpa` (amount, optional `phase` down to a floor: Manitoba only in 2026; Nova Scotia's phase-down is gone), `age` (amount, threshold, 15% reduction rate, optional unreduced `supplement`: Saskatchewan), `pension` (the provincial maximum), `pooled` (Quebec: age, retirement-income (the lesser of $3,541 and 1.25 times the pension or RRIF income) and living-alone amounts, reduced together by 18.75% of family income over $42,955; a couple's two pools are added and reduced once, each spouse taking a share in proportion to their own amounts: `quebecPoolAmount` and the `partnerPool` argument), `payroll` (CPP or QPP rate and Quebec's QPIP premium; `cppContribution` reads it), `dividend.eligible`, Ontario's `surtax` and `healthPremium`, `indexing` (one boolean per family: Manitoba's schedule is frozen; AB, ON and NS pension amounts are indexed, the flat $1,000 ones are not) and `verified` (primary or secondary per family). `compileProvince` splits each row once per code; `provincialTaxCA(income, yearIndex, dtcBase, age, pensionIncome, familyIncome, partnerPool, spouseNet, depKids, childKids)` allocates nothing: tax on the brackets, less credits at `creditRate` (floored at zero), then Ontario's surtax on that, then the eligible dividend credit against provincial tax only (federal and provincial dividend credits are floored separately; Ontario's surtax comes before its dividend credit, as on form ON428), then the Health Premium (on taxable income, not reduced by credits). `familyIncome` is read only by Quebec: a number for a couple (built in `taxFor` and `solvePensionSplit`), `null` for a single filer or survivor (own income, lives alone). Quebec's 16.5% abatement applies after the federal credits, the dividend credit included. **Not modeled:** a spouse's transfer of unused amounts, non-eligible Canadian dividends (taxed like interest), the Ontario LIFT credit (low-income tax reductions are built in 7N N6 for ON, BC, NB, NL, NS and PE; AB, SK, MB and QC have none). The paid benefits and the Ontario property-tax/rent credit are modeled in 7L (`BENEFIT_RULES`, below). To add a family, add the field to every row, the coverage test and the generator. Verification status and the backlog are in the 7K notes in `docs/next-batches-plan.md`.
- **Income-tested benefits (Canada, `BENEFIT_RULES`, 7L).** One pure-literal data row per program between the `// BENEFIT_RULES:begin` / `end` comments (read by `scripts/gen-benefit-rules.js`, which writes `docs/benefits-rules.md`; `npm run gen:benefits`; `npm test` fails if it is stale and runs `tests/unit/canada/benefit-rules.test.js`, the coverage test). Row kinds: `gisAllowance` (the six ESDC household situations as `[income, annual benefit]` knots fitted to tables 1 to 5, interpolated by `interpKnots` / `gisAnnual`, scaled with the plan inflation factor), `oasPension` (the 75-plus factor 1.10 and the recommended 2026 amount: **update for 2027**, quarterly-indexed), `familyCredit` (CGEB, Ontario Sales Tax Credit), `childSchedule` (CCB, Ontario Child Benefit, BC Family Benefit, ACFB, Quebec Family Allowance), `seniorSupplement` (Alberta Seniors Benefit), `occupancyCredit` (from rent or property tax: Ontario Energy and Property Tax Credit and senior homeowners grant; 7M adds the New Brunswick property tax allowance, the Nova Scotia seniors property tax rebate, which reads `BEN.gis` and `BEN.allowance`, and the Manitoba homeowners credit, seniors school tax rebate and renters credit, the Manitoba figures are those of the 2025 Form MB479 and scale with plan inflation, the renters credit is limited by the rent paid and the seniors rebate by the tax left after the homeowners credit, the others are unindexed; the coverage test allows scope `on`, `mb`, `ns`, `nb`; the Manitoba homeowners credit proxies school taxes by the whole property tax) and `quebecCredit` (solidarity credit, work premium). Each row has `source`, `asOf`, `retrieved`, `verified` per family (primary or secondary), `indexing` and `dependsOn`. `benefitsFor(profile, gains, traditionalExtra)` fills the module-level scratch object `BEN` (read with `getBenefits()`; the next call overwrites it), allocation-free, in a fixed order (GIS and Allowance first, then the child and credit programs by `state.province`), with an early exit for a household with no children above 125,000 (skipped for Manitoba, whose homeowners and renters credits have no income test). **Net-tax design:** Canada `taxFor` is `incomeTaxCA(...) - benefitsFor(...)` (the benefits are tax-free cash, so net cash is identical to a separate inflow), which lets the shared `drawTaxable` and the Canada solvers price lost benefits as a cost of withdrawing without editing the shared `drawTaxable` (`src/shared/core/withdrawals/draws.js`); rows keep `tax` gross and add `benefits` plus one field per line (`benefitGis`, `benefitAllowance`, `benefitCcb`, `benefitCgeb`, `benefitProvChild`, `benefitProvSenior`, `benefitProvCredit`). Profile fields for it: `oasA/B`, `earnedA/B`, `survivor`, `dependents` (from `dependentsInYear`), `rentPaid`, `propertyTaxPaid` (from `housingForYear`). Same-year income stands in for the prior-year return (an engine convention). `gisIncomeRoom` is the hook the Canada mixed-withdrawal batch (4A) reads. Step cliffs (7M): the New Brunswick allowance tiers and the Nova Scotia rebate (which stops when GIS stops, up to 800) drop in a step, which used to leave the net at the top of the `drawTaxable` bracket (`need * 3 + 1`) below the need and return a negative net (measured: Nova Scotia, single 70, property tax 3,000, other income 32,212, need 100: net -563). `drawTaxable` and the two Canada RRSP solvers (`solveTraditionalForNet`, `solveTraditionalForNetFromNeed`) now widen the bracket (doubling, at most 12 times, up to the pool) only when the net at its top is short of the need, so every draw that did not need it is bit-identical (the snapshots did not move) and the extra cost is one tax evaluation per call (measured +3 to +7 percent, ten percent noise). At a cliff the net is not monotone, so the result is a valid draw, not necessarily the smallest sale. Test: `tests/unit/canada/benefits.test.js`, "step cliffs and the withdrawal solvers". Known approximation: where a benefit phases IN as income rises (the CGEB single supplement at 2 percent, later the ACFB and work premium), the net of a taxable sale can exceed the gross, and the shared `drawTaxable` bisection (which starts at the amount needed) over-sells by up to that phase-in amount. 7M completes the ten provinces: the child benefits, family and low-income credits and seniors programs of SK (Low-Income Tax Credit, Income Plan), MB (Child Benefit, 55 PLUS junior component), NS (Child Benefit, Affordable Living Tax Credit), NB (Child Tax Benefit, Working Income Supplement, School Supplement, HST credit, Low-Income Seniors Benefit), NL (Child Benefit, Income Supplement, Seniors Benefit) and PEI (Child Benefit, Island Essentials Benefit) are `childSchedule`, `familyCredit` and `seniorSupplement` rows with a `case` each in `benefitsFor`. Helpers: `countKids(kids, minAge, maxAge)` and `familyCreditCA(R, f, fam, couple, n)` (the CGEB shape: adult, spouse or eligible dependant, per child with an optional `childCap`, reduced over a threshold; `indexing.amountsAndThresholds` decides whether `f` applies). `BEN_NO_EXIT` lists the provinces whose programs pay at any income, which skip the 125,000 early exit: Manitoba (the homeowners and renters credits; the Child Benefit and 55 PLUS are income-tested) and PEI (the Island Essentials Benefit pays at least 175 at any income). Several shapes are readings and are marked secondary in their rows: the Saskatchewan Seniors Income Plan follows its regulation (RRS c S-25.1 Reg 3 s. 5(2), read from the consolidation through SR 39/2023): the maximum falls by 1.90, 2.10 or 6.55 dollars per dollar of base GIS reduction, which is a straight line from the maximum at no income to the published nil point for a single person, a couple and a spouse on the Allowance (190 bands of 24 and 155 bands of 48 reproduce 4,560 and 7,440), and flat at the maximum to income 9,184 then to the published 11,568 for a pensioner whose spouse is not a pensioner (the regulation formula alone gives about 11,822) and the Manitoba Child Benefit is a straight line between the published full-benefit income and the published nil point, the Saskatchewan credit rate is derived from the published maximum and nil income, the Manitoba 55 PLUS senior component (Regulation 65/90 tables by household type) and the NL Nutrition Supplement (150 a month a child under five, with the Child Benefit) are built from their primary pages, the NL Income Supplement phases IN with family income between 15,000 and 20,000 (the known `drawTaxable` phase-in limitation; the NB Working Income Supplement phases in on earned income, which a withdrawal does not change), the Manitoba 55 PLUS junior component is not paid to someone who receives the Allowance (an OAS Act benefit), and the Saskatchewan single-parent amount (eligible dependant plus child amounts) is a reading. Not built: the CSV export has no benefit columns (the export is shared code, `exportCsv` in `src/shared/ui/plans/export-and-print.js`); the NL pregnancy and birth parts of the Nutrition Supplement; the PEI provincial property tax credit (needs the assessed value), Manitoba Rent Assist and the Nova Scotia heating rebate (inputs we do not have); disability benefits; low-income tax reductions; the prior-year lookback. Tests: `tests/unit/canada/benefit-rules.test.js`, `tests/unit/canada/gis-tables.test.js` (every row of the ESDC tables, from `docs/sources/gis-tables-2026q4.json`), `tests/unit/canada/benefits.test.js` (hand-computed cases citing the page or statute).
- US models a 10% early-withdrawal penalty (`ruleOf55A`/`ruleOf55B`: Rule of 55
  elected per partner, covering that partner's 401(k)s only through
  `rule55Applies(working, retireAge, partner)`; an old save's household
  `ruleOf55Enabled: true` ticks both in `normalizeState`,
  `sepp72tEnabledA`/`sepp72tEnabledB`, `singleLifeDivisor(age)`) on
  traditional/bondTraditional withdrawals before 59.5; Canada has no
  equivalent to build, since RRSP/RRIF withdrawals carry no age-based
  penalty at any age (only withholding tax, already captured via
  `taxFor()`) — don't port this feature to Canada.
- `traditional`/`bondTraditional` are one pooled household balance (not
  separate per-partner accounts), but RMDs, the 72(t)/early-withdrawal
  penalty fraction, and 72(t) SEPP sizing all need to know each partner's
  own share of that pool. Since Batch 3A that share comes from the account
  inputs (see "Retirement accounts (US)" above); the former
  `state.traditionalSharePctA` slider (0-100, default 50) is gone, and the text below
  describes how the shares are used; `traditionalShareA`/
  `traditionalShareB` (computed fresh each loop year in both
  `simulate()`/`simulateHistorical()` from `traditionalBeforeRmd * pctA`/
  `* (1 - pctA)`) replace the old single `traditionalShare` variable
  everywhere RMD/SEPP/penalty math reads it. During survivor period or
  single-person mode, both shares collapse to the full pooled balance
  (ownership stops being split once there's only one living partner) —
  whichever partner's RMD doesn't apply gets zeroed immediately after via
  the existing `isSurvivorPeriod`/`deceasedIsA` guard, same as before this
  feature existed. `sepp72tEnabledA`/`sepp72tEnabledB` are independently
  toggleable (replacing the old single `sepp72tEnabled` boolean, migrated
  in `normalizeState()` for old saved scenarios) since a real 72(t) SEPP
  plan is elected per account, not per household — enabling it for one
  partner doesn't require or affect the other's. Canada has no equivalent
  needing this split (no RMD-style age-based mandatory distribution
  penalty, no 72(t)), so `traditionalSharePctA` is US-only.
- US splits post-retirement healthcare into two separate cost lines —
  `state.healthcare` (pre-65 ACA/retiree premium, gated on `acaEligibleA`/
  `acaEligibleB` from `acaEligibility()`: that partner retired AND under 65,
  AND either the other partner has also stopped working or that other
  partner's `employerCoversSpouseA/B` flag is off — the flags default to
  true, which is the old "both retired" rule; the same helper feeds the
  400%-FPL conversion guard, so cost and guard can't drift apart) and
  `state.medicareYearly` (Part B/D + supplement, gated per-partner on
  `age >= 65 && !working` (Medicare starts at `max(65, that partner's
  retirement age)`: a partner still working at 65 stays on the employer plan and
  enrolls the year they stop, no late-enrollment penalty modeled; independent of
  the other partner), and IRMAA follows the same gate) — unlike ACA marketplace
  eligibility, which also depends on the spouse. Canada has no equivalent split to
  build: `state.healthcare` there is a flat "supplemental private
  insurance once retired" figure with no age-65 transition at all, because
  provincial coverage (OHIP/MSP) is universal at every age — if anything,
  some provinces' senior drug programs (e.g. Ontario Drug Benefit at 65)
  argue for *lower* supplemental cost at 65, not a new mandatory expense —
  don't port `medicareYearly` to Canada.

## Add-as-you-go lists (loans, extra income, extra expenses, one-time items)

`state.loans`, `incomeSources`, `oneTimeIncome`, `extraExpenses`,
`lumpExpenses` (and `children`, below) are arrays that **default to `[]`** (cap `LIST_MAX = 10`);
the old fixed slots and the `otherLoansEnabled`/`otherIncomeEnabled` master
flags are gone. All five render from one generic DYN block (specs per list,
`renderDynList(name)`, delegated input/change/click handlers) — add a field
by editing the spec, not by hand-writing HTML. Ids are `<prefix><index><Field>`
(e.g. `extraExp0Amount`, `lumpExp0RepeatEvery`). Growth model: items have
`followGrowth` (true = income growth for income, inflation for expenses) or
their own `growth` %; `itemGrowthFactor()` applies it from today, and the
historical engine substitutes its actual-inflation `factor`. Age windows use
Partner A's age. `lumpExpenseHits(e, age)` handles repeat-every/until.
Lump expenses are subtracted out of guardrail needs, `firstWithdrawal`, and
`bondTarget` sizing. `normalizeLists()` (called from `normalizeState`)
migrates legacy saves: flag present+off → list dropped; flag on → only
configured loans / `enabled` streams kept, legacy income streams pinned to
`followGrowth:false, growth=inflation` so old projections reproduce exactly.
`flat: true` on `oneTimeIncome`/`lumpExpenses` makes `itemGrowthFactor` return
1 (and one-time income skip `factor`) — the amount is exact dollars at that
age; the growth fields hide via `showIf`. The old Bridge / part-time income
section (`bridge*` fields) is removed; `normalizeLists()` converts a saved
`bridgeEnabled` plan into income streams (start clamped to that partner's
retirement age, Partner B's window shifted into Partner A's age) and deletes
every `bridge*` key — note `normalizeState` spreads unknown keys, so any
retired field must be deleted explicitly or it re-migrates on every load.
**Income streams, owner and kind (US, E1b).** A stream row also carries `owner` ('A'/'B'), `kind` ('other' = Not earned /
`'wages'` = W-2) and a contribution panel (`contribute`, `deferralType`, `deferralPct`, `matchPct`, `afterTaxPct`, `personalPct`),
normalized by the US-only `normalizeUsStreams(s, raw)` (`src/us/core/inputs/list-rules.js`; the shared `normalizeLists`
keeps only the common keys, so these are read from `raw`, aligned to the filtered list; anything but a literal `'B'` / `'wages'` /
`true` / `'roth'` is the legacy meaning). Canada's streams are unchanged until E1-CA. The shared list renderer
(now `src/shared/core/inputs/dyn-fields.js`) has a `kind: 'select'` field (`options: [[value, label], ...]`). `streamAmountsForYear(streams, ctx, out)`
(pure, scratch `STREAM_OUT`, just above `listAmountsForYear`) splits the year's streams: owner A in single-person mode, the window
tested on the owner's age, W-2 skipped once the owner is dead, not-earned moved to the survivor's bucket; `total` is the old
`extraIncome` sum bit for bit and stays the cash figure. `buildTaxProfile` takes `streamWagesA/B` (added to the owner's wages, less
the traditional contributions in `streamWageCutA/B`) and `streamOtherA/B` (not earned); the profile carries `extraA` / `extraB`
(replacing `extraIncome`), and `taxFor` puts each on its owner's return (the two-filer branch gives B's return `extraB`).
`payrollTax` takes `streamWagesA/B` so the Social Security base and the Additional Medicare threshold are shared with the salary.
`streamPlanContributions` (just above `retirementContributions`) fills contributing W-2 streams after the salary, against
per-person deferral / catch-up / IRA rooms (what the salary left) and per-stream annual-additions room; see the spec
(`docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md`) section 5.4. Every added term is an exact 0 for a legacy save, so
existing snapshots did not move. Tests: `tests/income_streams.js`, `tests/stream_contributions.js`, `test_income_streams.js`.
**Streams in E1c (US).** The stream `kind` gains `'self'` (self-employed profit, normalized by `normalizeUsStreams` with a plan-rate
`profitSharingPct`, 0-25, the same panel and rooms as the salary's Solo 401(k) in `soloPlanContributions`) and a W-2 stream gets an
optional yearly `healthPremium` (pre-tax, reduces the stream's wages; above zero the job covers its owner, see `streamCoverBits`).
See "Self-employment (US, E1c)".
**One-time income (US, E1d; spec `docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md`).** A `oneTimeIncome` row also
carries `kind` (`'free'` default = tax-free, `'wages'` = severance or bonus with payroll tax, `'ordinary'` = no payroll tax, `'gain'` =
long-term gain), `owner` ('A'/'B'), `gainPct` (the taxable share of a gain, 0-100, default 100) and `activeBusiness` (the gain leaves
net investment income but stays in MAGI), normalized by the US-only `normalizeUsLumps(s, raw)` (read from the raw save and aligned like
`normalizeUsStreams`; anything unknown is the legacy meaning, tax-free for Partner A). `lumpAmountsForYear(lumps, ctx, out)` (pure, scratch
`LUMP_OUT`, just below `streamAmountsForYear`) reads the rows defensively (a raw row loaded through `Object.assign` with no `kind` is tax-free,
any owner but `'B'` is A, a non-number `gainPct` reads as 100 and a boolean `true` reads as 1; hand-edited saves only), puts owner A in single-person mode, treats the owner as dead from the death year
on (a dead owner's wages or ordinary lump goes to the survivor as ordinary income with no payroll tax; a dead owner's gain is tax-free), sends a
gain's basis to `taxFree`, and sums the taxable part in `flowTotal`, the one gate (a lump year is `flowTotal > 0`). `oneTimeAmount` =
`taxFree` (today's cash path, `bal.cash += oneTimeAmount`, bit for bit); taxable lumps join the year's `wages` (so they pay their own tax
inside the flow). Wages lumps reach the owner's return and payroll through `streamWagesA/B` (also the self-employment Social Security wage
base, `ssWagesA/B`), ordinary lumps through `streamOtherA/B`; neither makes a retirement contribution. Gains ride the profile: `lumpOn`,
`lumpGainA/B`, `lumpGainNoNiitA/B` (both `buildTaxProfile` literals always carry them, the survivor remap moves B's into slot A; read only
under `lumpOn`): `taxFor` adds them inside each branch (joint and one-person: to `gains`; two filers: to each return's own `gainA/B`; the NIIT
leaves out the no-NIIT part from net investment income only), `returnMagis` appends each owner's gain, and `magiBase0` and `row.income`
include them. Guardrails: a lump year records no guardrail withdrawal and no `firstWithdrawal`, and clears `prevPortfolio` after its own step,
so the next year holds the multiplier. The trace carries `guardrails`, `firstWithdrawal` and `forcedPass`. Tests: `tests/lump_income.js`,
`test_lump_income.js`.
**Inherited accounts (US, E1e; spec `docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md`).** Two more `oneTimeIncome`
kinds, `'inheritedTrad'` and `'inheritedRoth'` (kept by `normalizeUsLumps`, skipped by `lumpAmountsForYear`; `age` is the year of death
in Partner A's age, `owner` A/B, a past year allowed). **Ledger:** `inheritedLedger(state.oneTimeIncome, ctx)` at the top of
`runProjection` returns `null` for every state without such a row, and every E1e term in the year loop sits behind `inh === null` (or
`inh !== null`), so a legacy run is the same double; otherwise one slot per row in preallocated typed arrays, oldest receipt first
(`receiptYear`, heir at receipt, `L` = `singleLifeFactor` of the heir's age in the year after receipt, `deadline`, `stretch`, `slot` /
`post` = the pre- / post-remap profile slot). `bal.inheritedTrad` / `bal.inheritedRoth` (always present, 0) are the ledger's sums; the
ledger is cloned and restored with the MAGI-iteration snapshot (`inheritedClone/Restore`). `inheritedYear` computes the year's draws once,
before the iteration, from start-of-year balances (`INH_OUT.drawA/B` by pre-remap slot, `rothPayout`); `inheritedApply` grows each open
row at the year's stock return, takes the draw, closes an emptied or expired row, and is the only place a row opens (a future row after
that year's growth, with no scheduled draw in its receipt year; it gets its slot and post-remap slot when it opens, `b816cc9`). **The
schedule** is `inheritedDraw(b, r, k, L, roth, stretch)`: a 10-year traditional row `min(grown, max(grown / (11 - k), b / (L - k + 1)))`
(the RMD on the heir's factor as a floor, the account as a cap; the whole account in year 10 or when `L - k + 1 <= 1`); a Roth row
nothing until year 10, then the whole account, a tax-free transfer to `bal.cash` (no flow, tax or MAGI); a **stretch** row (decision 17:
death year `currentYear + receiptYear < 2020`) the RMD alone, no deadline. **Successor rule:** if the heir dies, the slot moves to the
survivor; a 10-year row keeps its deadline; a stretch row's heir's first dead year is still a stretch year, then `deadline = Y + 10`
and the 10-year schedule with the heir's factor continued. **Federal:** the scheduled draw joins `flow` (appended, only when non-zero)
and `buildTaxProfile`'s `otherA/B` via `inheritedA/B`, **never** `streamOtherA/B` / `extraA/B` (which `taxFor` puts into the state's
wages); not net investment income, never penalized, not in `requiredDistributions`, `accts` or the conversion. Every profile carries
`inhOn` (true in every year of a run with a ledger), `inheritedA/B`, `inhExtraA/B` (the last-resort draw), `inhExclA/B` and `inhEstA/B`;
the profile literals of the Roth solver, optimizer and lambda carry none of them (read as off). **State:** `STATE_RULES.inherited`
on all 51 rows, `{ kind, cap }` with five kinds (`INH_CODE`): `ordinary`, `exempt` (subtracted from the base), `heir` (joins the
heir's own retirement exclusion with its age tests and caps; CT's `agiPhasedShare` adds it to the household retirement amount),
`heirAnyAge` (CO, AR, OK: only the inherited amount bypasses the age test; CO under 55 special-cased up to the first tier's cap) and
`decedent` (NY: `inhExclA/B`, per post-remap slot, `min(each row's draw, cap)`); compiled in `compileRow` (a missing field reads
`ordinary`, for the synthetic test rows). `newStateSources` declares `inherited`, `inheritedA/B`, `inheritedExclA/B` and `taxFor`
writes them on **every** taxing-state call (zeros when `inhOn` is off), because the four scratch objects are reused; only the reads in
`stateIncomeTax` are gated (`sources.inherited > 0`), and the amount enters `ordinaryNonSS` (so Washington never taxes it).
**Fourth estimate:** the last-resort draw per post-remap slot rides the MAGI iteration as `estInhA/B` beside `estTrad`/`estGain`/
`estSeA/B` (seeded from `prevInhA/B`, written after convergence; through `magiBase`, `returnMagis`, `costAt`, `irmaaAt`, `estUsed`, the
convergence test and damped update, the forced pass, `realizedMagi` and every cliff-plan record). The pass top also sets
`profile.inhEstA/B = estInhA/B`, which only the Roth bracket fill reads (decision 18: `solveRothConversionTo`'s other income adds
`inhEstA + inhEstB`, appended only when non-zero); `taxFor` reads the realized `inhExtraA/B`. Known limitation (decision 18, spec
section 9): with a large last-resort draw the damped estimate reaches the 8-pass cap and the conversion ends about 0.04% of the draw
short of a scheduled-draw twin (`fill convergence bound` in the test pins it). **Last resort:** `takeInherited(wd)` (inherited Roth,
then traditional rows by bisection, oldest receipt first, each taxed like a scheduled draw on its post-remap slot through
`profile.inhExtraA/B` and, under `decedent`, the row's remaining room in `inhExclA/B`) runs right after `releaseMagiCap` in both
`withdrawStandard` branches (before `takePenalized` in the penalty-aware one, before home equity in both) and inside the US-only
`BUCKET_STEP.home` and `BUCKET_STEP.penalized`, so the shared bucket orders are unchanged; uncapped by the cliff plan. **Need
(decisions 15, 16):** in a year with a scheduled draw, one extra premium evaluation and one `taxFor` without the draw (`taxNoDraw`,
the profile restored to the very doubles) give `inhNeedAdj = inhDraw - (tax - taxNoDraw) - (healthcare - hcNoDraw)`, which the
guardrails, `firstWithdrawal` and lambda's need add back (a draw-made surplus year records too; the guardrail portfolio counts the
inherited balance before the draw). Rows carry `inheritedTrad` / `inheritedRoth` / `inheritedDraw` only in an inherited year (folded
into `traditional`, `investable`, `traditionalWithdrawn`), `annotateInheritedRows` adds them to the status tooltip, and `estate` /
`afterTaxValue` count the balances. Hooks: `window.__test_inherited`, `__test_inhForceExtra`, `__test_inhTakeCount`,
`__test_inhNoDrawCalls`, `__test_inhNoNeedAdj`. Tests: `tests/inherited_accounts.js`, the inherited cases in `tests/unit/us/state-rules.test.js`,
`tests/unit/us/state-mechanisms.test.js` and `tests/legacy_state.js`, `test_inherited_accounts.js` (Playwright, not in CI).
**Death clamp (both planners).** At the top of each `runProjection`, after `deathYear`, the deceased partner's `retireAgeA/B`
becomes `min(retirement age, survivorDeathAge)`: wages, contributions, health premiums, `retirementYear`, `makeProjectedExpense`,
ACA eligibility and the account statuses all key off the clamped value. Test: `tests/survivor_salary.js`.

`state.spendingTiers` is a sixth DYN list (ids `tier<i>…`): amount, startAge,
endAge, followGrowth/growth. `baseSpendingNominal(age, year, factor, incomeFactor)`
is the single place both engines (and `projectedExpense`) read household
spending — the active tier that started latest wins (ties: first in list),
else `state.spending * factor`. Legacy five-slot saves (`enabled`/`age`) are
migrated in `normalizeLists()` as open-ended (end 120) inflation-following
changes, which reproduces the old projections exactly. Additional expenses
(`#extraExpensesGroup`) is `data-cat="spending"`; one-time expenses, other loans and the pre-retirement healthcare group are
also `spending`; additional income is `income`; `extra` keeps survivor planning.
`state.children` is a seventh DYN list (ids `child<i>BirthYear` / `child<i>Student`; group `#childrenGroup`,
`data-cat="profile"`, inside the shared `spendingTiersGroup` partial (`src/shared/partials/`); its copy lives in each
planner's `DYN.children` spec, so Canada's note says it feeds the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child benefits). A row is `{ birthYear, student }`;
`normalizeLists` (shared) clamps the year to the **fixed** bounds `CHILD_BIRTH_YEAR_MIN/MAX` (1950-2100, never
relative to the clock, so a saved year cannot drift on reload), drops rows without a usable year, and keeps
`student` only when literally `true`. An optional `joinYear` (E2, adoption; the row's "Joins the household in" field) is
kept by `normalizeLists` only when it is a year (same fixed bounds) later than the birth year, otherwise the key is left
off, so a legacy row keeps its exact shape; `dependentsInYear` and the US `hasChildAtMost` (the Medicaid child-13 test,
the one reader that loops over `state.children` itself) skip a child while `c.joinYear > taxYear` (a missing key
compares false), so a joined child counts for its whole join year and its age stays `taxYear - birthYear`. The field
uses the shared list renderer's opt-in `blank: true` / `placeholder` number options (`src/shared/core/inputs/dyn-fields.js`: a missing
value shows an empty box; clearing the box deletes the key). Nothing is adjusted for children automatically (spending stays the
user's). `dependentsInYear(taxYear)` (shared, now in `src/shared/core/inputs/lists.js`, takes a CALENDAR year; the US
engines pass `taxYearOf(yearIndex)`) returns `{ age, student, qualifyingChild }` per child born by then, with
`age = taxYear - birthYear` (a birth year counts as age 0 for the whole year). `qualifyingChild` is the
federal rule: `age <= 18`, or `age <= 23` for a full-time student; each credit applies its OWN cutoff to `age`
(the Child Tax Credit is `age <= 16`; the child-care credit would be `age <= 12`). Qualifying relatives and
disabled-at-any-age children are not modeled. `dependentsInYear` returns a shared frozen empty array when there
are no children (hot path; do not mutate the result). **US plumbing:** `buildTaxProfile` puts
`profile.dependents` on every profile (including the survivor remap: children stay with the surviving
parent), and `acaHouseholdSize(singlePerson, isSurvivorPeriod, yearIndex)` (adults plus qualifying children)
feeds both `acaNetCost` (via `healthcareCost`) and the 400%-FPL guard in `conversionMagiCeiling`, so cost and
guard cannot drift apart. Profiles built elsewhere (the Roth solver and optimizer literals) have no
`dependents`: a consumer must treat a missing list as none. Canada reads it through `dependentsInYear(CURRENT_YEAR + year)` for the income-tested
benefits (7L: the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child
benefits); no Canadian tax credit uses it. Tests: `tests/child_dependents.js` (in `npm test`), `test_children.js`.
Test: `node test_dynamic_lists.js`, `node test_spending_and_fi_widgets.js`.

## First-run wizard

`#wizardModal` is a list of `[data-wizard-step]` panels in document order, each carrying its own
`data-title` and `data-note` (`renderWizardStep` in `src/shared/ui/wizard.js` adds "Step i of N"). The US wizard
has three: basics, balances (taxable, cash, the eight retirement accounts, a Roth-basis callout) and
the optional questions; Canada has two. Every input names the sidebar control it proxies in
`data-wizard-mirror`, so the mirrors, the value sync in `syncControls` and the step count are all markup,
not lists in code. Step grids use `.wizard-grid`. `test_wizard_accounts.js` covers both planners.

## Dashboard tiles and the safe withdrawal rate

The four `.metrics-primary` tiles are Investable at retirement, `#fiNumber`,
`#fireNumber`, and Investments last through; `#dashRetireAge` is a small
`.retire-chip` box at the top-right of `.content` showing `state.retireAgeA/B` (each partner's own retirement age, not the sim's both-retired year), and `#dashHistSuccess` lives in More results.
`state.fiWithdrawalRate` (default 4, clamped 0.5–15 in `normalizeState`) feeds
`fiMultiple()` (= 100 / rate). It is edited via two `.swr-input` boxes (one
per tile) that are synced by hand in `syncControls()` — it is deliberately not
in `ids`, since there is no sidebar element with that id. Funded % compares
`currentInvestable` (liquid accounts only, no home equity) to the number.

## Money-field formatting

Every dollar field has `class="money"` and is runtime-converted from
`type="number"` to `type="text"` so it can show `"$1,850,000"` in place as you
type (`attachMoneyPreview`/`refreshMoneyPreviews`). Any code reading a
`.money` field's `.value` must strip non-digits first
(`.replace(/[^0-9]/g, '')`) before `Number(...)`, or it silently reads `NaN`
and falls back to `|| 0`. A new dollar field needs both: the `class="money"`
attribute, and non-digit stripping at every call site that parses it.

## Field descriptors and info bubbles

A field's `<small>` is a one-line descriptor (aim for under ~70 characters);
anything longer goes in a `<button class="info-tip" data-tip="…">` placed in
the label, which opens the shared `#infoBubble`. Wrap the label's last word
and the button together in `<span class="info-nw">` so the button can't wrap
alone — and note `mainLabelText()` (field search) reads that span's text too.
The button lives inside `<label for>`, so its click handler must
`preventDefault()`. Write tooltip copy from what `simulate()` actually does,
not from older blurbs (see `docs/reference.md`, "Sidebar info bubbles").

## Versioning

Stable filenames (`Planner_US.html`, `Planner_Canada.html`), no
version-numbered copies. Full history lives in `git log`, not in old files;
the built names in `dist/` never change, so the copied `index.html`'s links never go stale.

Each planner's topbar also carries a small hand-maintained version badge
(the `<span>V19</span>`/`<span>V4</span>` inside the `<h1>` of `src/<country>/index.html`) — bump the
relevant file's badge in the same commit as any other user-facing change to
that file. It's the one piece of on-page provenance a person (or a
screenshot sent to Claude) can use to tell which build they're looking at,
and it only stays trustworthy if every batch bumps it, not just some.

## Testing checklist for any change

1. `npm test` (golden math tests — exact-to-the-cent).
2. Run the specific `test_*.js` file(s) relevant to what changed, plus a
   broader sweep if the change touches `simulate()`/`simulateHistorical()`,
   `syncControls()`/`syncContributionControls()`, or the shared per-year loop. Single-script runs read whatever
   `dist/` currently holds, so run `npm run build` first (or keep `npm run dev` running); only `npm test` rebuilds for you.
3. Mobile-width check for any new sidebar field or result card (390×844
   viewport): `document.documentElement.scrollWidth >
   document.documentElement.clientWidth` should stay `false`.
4. If the feature has a UI toggle, verify with Playwright that toggling it
   actually changes `window.fireProjectionRows`/the relevant DOM output — not
   just that the checkbox's own `.checked` state is correct.
5. If the feature touches anything `position:sticky`, verify with an actual
   scroll gesture (`page.mouse.wheel(...)`), not `window.scrollTo()`.

## Docs are updated with the code change (reference.md excepted during the batch plan)

- User-facing change → update `README.md`'s feature list in the same commit.
- Architectural change (new shared helper, new US/Canada divergence, new
  gotcha) → update this file in the same batch of work, not as a later pass.
- `docs/reference.md`: Batch 1 was consolidated into it early (2026-10-03, at the
  owner's request; see its "Batch 1" section). For the remaining batches in
  `docs/next-batches-plan.md`, do **not** edit it per batch unless the owner asks.
  Append findings (decisions, verified
  figures with primary-source citations and dates, gotchas, before/after
  tables) to that batch's "Batch notes" section in `docs/next-batches-plan.md`
  in the same PR; one consolidation PR moves them into `docs/reference.md`
  after the last batch. Outside that plan, update `docs/reference.md` in the
  same batch of work as before.
- The repo may exist as multiple independent local clones with no shared
  remote, so these docs — kept current in the repo itself — are what let a
  future session with no memory of this conversation pick up accurately from
  the repo contents alone.
