# Modules, seams, state and the module tools

Read before adding, moving or renaming a module, adding a seam, touching `main.js` or a wiring function, or running the extraction, regroup or build-comparison tools.

Related: [engine.md](engine.md), [inputs-and-ui.md](inputs-and-ui.md), [test-inventory.md](test-inventory.md).

## Tools, inventory files and the shared tree

- `scripts/analyze-closure.js` — writes `docs/superpowers/inventory/closure-*.md`, the
  per-unit dependency inventory of each `main.js` the module split was planned from (today
  59 US / 54 Canada units, all statements). `scripts/module-map.js` writes
  `docs/superpowers/inventory/module-map.md`; `npm run analyze` runs both.
- `docs/superpowers/inventory/` — the generated inventory and module map, the region maps
  (`stage2-region-map.md`, `stage3-region-map.md`, `stage4-region-map.md`: which module holds each
  old `@@shared` region's units) and `stage4-open-items.md` (the deferred limits and cleanups of stage 4).
- `src/shared/` — code both planners import. `src/shared/core/` is DOM-free and importable in plain Node: at its top the state modules `store.js` (`state`, `mode`, `scenarios`, `compareIds`), and `chart-prefs.js` (the chart display preferences); every other module is in a topic folder (see "Where new code goes" in CLAUDE.md; the device clock's year, `CURRENT_YEAR`, is read once in `inputs/current-year.js`, outside the engine). `src/shared/ui/plans/storage.js` holds the storage keys and the localStorage probe. `src/us/core/` holds US-only state (`tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`). `src/package.json` makes `src/` ES modules and defines the `#country/*` alias (below).

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
  trees statement by statement (run it after any change that only moves code; see "The build comparison" below).

## Shared code between the planners

Code both planners use lives once, in a module under `src/shared/core/` or `src/shared/ui/`, and both planners import it, so it
is identical in both by construction (the stylesheet and the HTML partials under `src/shared/styles/` and `src/shared/partials/`
are build-time includes, see "Layout" in CLAUDE.md). Country code lives in `src/<country>/core|ui/`; shared code reaches it only through the seam
facades (`#country/core/seam-<name>`, `#country/ui/seam-<name>`; below). `docs/superpowers/inventory/stage{2,3,4}-region-map.md`
say which module now holds each old `@@shared` region's units, and
`tests/no_markers.js` keeps `@@shared` markers out of `src/`. The extraction tool no longer makes shared modules (it refuses a
manifest module with `owner: 'shared'`): write new shared code in `src/shared/` directly. To share code that still differs
between the planners, first remove the difference, then move it into one `src/shared/` module (a name that differs per country
goes through a seam). The two `runProjection` year loops are deliberately not shared (`src/us/core/projection/run-projection.js`,
`src/canada/core/projection/run-projection.js`; see `docs/phase2-refactor-plan.md` section 7, step 4.5): put a new per-year rule in a
shared stage helper when it is identical in both countries, otherwise edit each loop. Line endings do not matter: the build and
the analysis tools normalize CRLF to LF on read, and the regroup tool writes LF (including CLAUDE.md, the topic files and `tests/state_modules.js`);
git normalizes on commit (`core.autocrlf=true`), so a CRLF checkout shows "LF will be replaced by CRLF" warnings until then and
nothing needs converting by hand.

## Shared state and country seams

- **Cross-module mutable state lives in modules, not in the closure.** `state`, `mode`, `scenarios` and `compareIds` are in
  `src/shared/core/store.js`; the nine chart preferences in `chart-prefs.js` (the stateless engine removed the old
  `histTaxFactors` binding and its module: a historical run's factors are `ctx.taxFactors`). The modules
  that use them import them. **To change one, call its `assign<Name>` function** (`assignState`,
  `assignMode`, `assignLogScale`, ...): assigning to an import is a build error (`Cannot assign to import`). The names are
  `assign…` because `set…` is taken by UI handlers (`setMode`, `setChartView`) that do more than assign. A new binding that
  several modules write belongs in one of these modules (or a new one next to them, at the top of `core/`).
  The state modules sit at the top of their `core/`, beside the seam facades: shared `store.js`, `chart-prefs.js`;
  US `tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`. Every other `core/` module is in a topic folder.
- **US-only state** is in `src/us/core/`: `cliffPlanStore` (`.plan`, `.key`, `.report`, `.forState`, `.year`, `.overrides`,
  `.computed`, `.computes`: the fields [cliff-plan.md](cliff-plan.md) calls `cliffPlan`, `cliffPlanKey`,
  `cliffPlanReport`, `cliffPlanState`, `cliffPlanYear`, `cliffPlanOverrides`, `cliffPlanComputed`, `cliffPlanComputes`),
  `optimizerState` (`.rothBracketByAge` = the older `rothBracketOverrideByAge`, `.withdrawalMixByAge` =
  `withdrawalMixOverrideByAge`, `.lastMultiLeverRun`, `.rothPerYearEvalBudget`), `testHooks` (the test-only counters) and
  `currentYear` (`assignCurrentYear`).
- **Who reads the store (stateless engine).** Outside the UI, the store modules are read by the store layer (the two
  `store-context.js`, the shared `projection/simulate.js` and US `cliff-plan/planning.js`; see [engine.md](engine.md)), by
  the non-engine `core/inputs/` modules (`clamps.js`, `estimates.js`, the US `dyn.js` / `field-meta.js` / `list-rules.js`, the
  Canada `fields.js` / `field-meta.js`) and by `core/format/charts.js` (`displayValue`); the engine never does
  (`tests/engine_purity.js`). One exception the static guard cannot see: the `contextFor` factory the UI passes into the core
  analysis and optimizer functions (`stateContextFor` -> `variantContext`) reads the store when called, so those functions are pure
  for a given factory, like `rowFn`. The sanctioned remaining writes to `state` are input writes: the input handlers and
  their clamps (field listeners, button groups, `inputs/clamps.js`, the life-expectancy clamps in the US `list-rules.js` and the
  Canada `fields.js`, `headline-tiles.js`, the MCP tool, load / undo / reset),
  `src/us/ui/results/roth-optimizer-controls.js` ("Apply" writes `appliedRothSchedule` and friends), and the test-only
  `multiLeverRun` / `multiLeverPlannedWithoutMaps` of `src/us/ui/install-test-hooks.js` (the parity bundle's multi-lever run, kept
  identical to the stage 1 hook so `tests/analysis_parity.js` measures the same thing). Centralizing them is item 6 of
  `docs/roadmap.md`.
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

## Modules, the entry point and the tools

- **Where code lives.** (Design `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`.) Shared code is under
  `src/shared/core|ui/`, country code under `src/<country>/core|ui/`. A module is under `core/` when none of its units uses a browser global,
  calls a DOM method on an element, or imports a `ui/` module, and under `ui/` otherwise. `tests/core_purity.js` checks only that
  `core/` files reference no DOM (browser globals, DOM method calls) and import nothing from `ui/`; it does not check that a
  module under `ui/` needs to be there. `ui/`
  modules are named by topic (`theme.js`, `sidebar.js`, `wizard.js`, `info-bubble.js`, `undo.js`, `mobile-view.js`,
  `scenarios.js`, `chart-controls.js`, `mcp-tools.js`, `src/us/ui/inputs/fields.js` for `FIELDS`, ...). `core/` is split into topic folders
  (the core regroup, 2026-10; see "Where new code goes" in CLAUDE.md) and a file is named by what it holds, not after its first unit;
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
  name; the regroup tool moves facades by this rule. There are 27 seam names (the 24 of `scripts/extractions/stage4.json`, `seam`, plus `storeContext` and `variantContext`, under `core/`, and `renderDeferred`, under `ui/`): under
  `ui/` `render`, `renderDeferred`, `syncControls`, `DECISION_QUESTIONS`, `computeRothOptimizer`, `computeSankeyFlow`, `buildPrintReport`, `FIELDS` and
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
  facades), the exact module paths in `tests/state_modules.js`, in CLAUDE.md, in the topic files (`docs/architecture/*.md`) and in the region maps
  (`docs/superpowers/inventory/stage{2,3,4}-region-map.md`), and counts the names `tests/state_modules.js` reads from a module
  as importers before it removes an export (`tests/doc_paths.js` checks every module path under `src/` in these docs exists), and reports a generated rule doc whose source path changed
  (`regenerate: npm run gen:...`). After every operation it re-runs the structural guards (facade side, `core/` purity, no cycle touching
  `core/`, the load-time guard, no undeclared name, no initializer reading a later declaration) and bundles both planners to report any
  change in the order the `// load-time:` initializers run; it refuses a name clash, a mutable binding moved without all its writers and
  UI code moved into `core/`. It checks every operation, on a staged copy, before it writes anything: a failed check refuses the whole
  map and writes nothing. Writing is staged files renamed into place at the end, so an operating-system failure during those final
  renames (a Windows file lock) can still leave a partial application, visible in `git status` (a T12 limit in
  `docs/superpowers/inventory/stage4-open-items.md`). It writes LF line endings (see "Shared code between the planners" above). `scripts/extractions/stage4-regroup.json` is the stage 4 tidy.
- **The build comparison.** `node scripts/compare-builds.js --base <dir> [--head <dir>] [--ordered]` compares the built planners of two trees
  (each with a built `dist/`) statement by statement: it flattens the IIFEs, expands each wiring function back into its call site (a new
  top-level function called exactly once as `name();`), undoes the split rule, and compares the multisets of statements; `--ordered` also
  requires the statements that are not declarations to run in the same order. Run both modes after any change that only moves code; a
  feature changes statements on purpose. The order of declaration initializers is not compared (the load-time guard covers `ui/` and `core/`).
## Where new code goes: the topic folders

The rules for placing code are in "Where new code goes" in CLAUDE.md; these are the folders.

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
- `inputs/` — `defaults`, the `DYN` list specs, `FIELDS` metadata, the list rules, normalization and the estimate checks; shared
  `clamps.js` holds the retirement-age clamps the field registries' `onInput` hooks run (they write the store's state, so it is
  not an engine module).
- `analysis/` — sensitivity, decision comparison, shortfall drivers, estate (Canada) and other read-only reports on a projection.
- `format/` — shared: number and chart formatting, the Sankey layout.

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

## Older plans and notes

Plans, specs and notes dated before 2026-10-11 describe the old layout, where `Planner_*.html` at the repo
root was the source; notes written before stage 4 name shared code by its `@@shared`
region, and `docs/superpowers/inventory/stage{2,3,4}-region-map.md` say which module now
holds it.
