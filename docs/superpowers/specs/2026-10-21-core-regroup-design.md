# Core regroup (and ui/ folders): design

Date: 2026-10-21
Status: draft for the owner's review
Parent: `docs/superpowers/specs/2026-10-10-modular-build-design.md` (section 10, "Directory names"); follows Stage 4
(`docs/superpowers/specs/2026-10-15-stage4-ui-design.md`, sections 5.8, 8 and 10) and its open items
(`docs/superpowers/inventory/stage4-open-items.md`, T17). First item of the refactor track in `docs/roadmap.md`.

## 1. Intent

The parent design decided to "group by topic and name files by content". The extraction tool could not: it named each
module after its first unit and split units into one-unit modules wherever two modules would otherwise import each other.
Stage 4 fixed the names in `ui/`; `core/` was left for this step.

The owner's reason (2026-10-21): new code should have an obvious home. Someone adding a feature (E4's state moves, a new
credit, a layout change) should be able to find every file of that topic in one folder and know where the new code goes,
without searching. The owner chose **topic subfolders**, for `core/` first and then for `ui/` ("it would be easier to
update the UI if I'm able to locate all of the required layout files").

## 2. Goals, non-goals, anti-goals

Goals:
- Every `core/` and `ui/` directory (shared, US, Canada) is split into topic subfolders, each holding a few files named by
  content.
- No misleading names: no module is named after an unrelated unit (`taxFor` is not in `standard-deduction.js`;
  `newWithdrawal` is not in `taxable-basis-key.js`).
- The grab-bag modules are split by topic: US `standard-deduction.js` (1,728 lines, 35 units: federal tax, state tax, ACA
  and IRMAA pricing, the Roth conversion fill, the withdrawal solvers, cliff-plan helpers), US `payroll-and-plan-limits.js`,
  US `withdrawal-mix-and-roth-accounts.js`, US `income-streams-and-lumps.js`, Canada `federal-tax-ca.js` (1,070 lines: tax,
  benefits, payroll, the withdrawal solvers, the estate) and the smaller mixed ones.
- The one-unit modules join their topic.
- Every module has a purpose comment on line 1 (the definition of Stage 4 section 5.8). Today
  `scripts/module-map.js --require-purpose` (in `npm test`) requires it for `ui/` modules only; it becomes required for
  `core/` modules too (seam facades stay exempt).
- CLAUDE.md gains a short "where new code goes" guide: each folder, what belongs in it, one line each.

Non-goals:
- Any behavior change. The built planners run the same statements; the snapshots do not move.
- Splitting `runProjection` or any other function, or editing any statement other than imports, exports and comments.
- Moving code between shared and country (making a country module shared or the reverse), or changing the seam facades'
  set of names.
- Removing `main.js`'s IIFE wrapper, Vitest, TypeScript (later items of the refactor track).

Anti-goals (a failure even if it works):
- Folders so fine that a topic is one file per folder again, or so coarse that a folder is a new grab-bag.
- Different folder names for the same topic in shared, US and Canada.
- An import loop that touches `core/` (the existing guards refuse it; the design must not need an exception).

## 3. What the inventory showed (2026-10-21, on `main` at `9aece4a`)

- `core/`: 132 modules plus 32 seam facades. US 57 (+16 facades), Canada 35 (+16), shared 40. `ui/`: 81 modules plus 16
  facades. US 22 (+8), Canada 15 (+8), shared 50.
- Unit-level cycles in `core/`: one, `runProjection` / `computeCliffPlan` / `planForState` (all in `src/us/core/run-projection.js`);
  they stay together. Canada has none. So the only constraint on grouping is module level: no import cycle may touch
  `core/` (Stage 4 section 5.3; `tests/ui_cycles.js`, the regroup tool).
- A draft topic map was checked for module cycles with a throwaway script (each unit assigned to a topic file, then cycles
  in the topic graph, shared plus each country): US with about 20 topic files and Canada with about 12 had no cycle on their
  own. Two splits were needed to get there, and they generalize:
  - **Rules before evaluators.** Federal tables and deductions (`FILING`, brackets, `standardDeduction`, `seniorDeduction`)
    are a file of their own: state tax uses them (federal conformity), and `taxFor` uses state tax. The Social Security
    taxation helpers (`taxableSocialSecurity`, `taxableSsOnRow`, `returnStatusA`, `irmaaSsOf`) are their own small file,
    used by both tax and healthcare.
  - **Planning above the engine.** The cliff plan splits into the per-year solver the engine calls (lines, candidates,
    lambda) and the planning step that calls the engine (`refreshCliffPlan`, `ensureTestPlan`, the summary).
  - The live withdrawal order and the mix weights (`pickLiveWithdrawalOrder`, `withdrawalMixWeights`) belong with the
    withdrawals, not the optimizer (the per-year draw calls them; the optimizer calls `simulate`).
  - `TAXABLE_BASIS_KEY` (a seam name used by the shared `takeTaxable`) and `defaults` (used by the shared `normalizeLists`)
    stay in files of their own.
- With shared code included, three cycles remained, each a shared topic that sits both below and above country code:
  the shared bucket order (`withdrawBucket`, which uses the country `BUCKET_STEP`) versus the shared draw primitives
  (`takeTaxable`, `drawTaxable`, which country withdrawals use); `makeProjectedExpense` (uses the country `housingForYear`)
  versus the spending helpers (`itemGrowthFactor`, `lumpExpenseHits`, which country income uses); `standardYearSource`
  (used by `computeCliffPlan`) versus `simulate` (which calls `runProjection`); and in Canada `pensionIncome` (used by the
  tax code) beside the spending helpers. Each is solved by giving that shared piece its own file in the folder: the plan
  must find a cycle-free split before the first move.

## 4. Decisions

- **Subfolders** (owner). One level of topic folders under each `core/` and `ui/`; files inside are named by content.
- **Same names across shared, US and Canada** for the same topic (my call): `withdrawals/` exists in all three where each
  has withdrawal code, so a reader looks in the same place.
- **What stays at the top of `core/`** (my call): the state modules that CLAUDE.md's "Shared state and country seams"
  describes as state homes (`store.js`, `chart-prefs.js`, `tax-factors.js`, `chart-hover.js` and the shared ones; US
  `tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`) and every seam facade
  (`#country/core/seam-<name>` and `#country/ui/seam-<name>` keep their paths; their targets change). At the top of `ui/`:
  the facades, `mcp-tools.js`, the test-hook installers and the wizard.
- **The tool is the existing regroup tool** (`scripts/regroup-modules.js`, Stage 4 section 5.8): renames, merges and moves,
  every structural guard re-run after each operation, imports rewritten in `src/`, module paths rewritten in
  `tests/state_modules.js` and CLAUDE.md. It already writes into new directories. No new tool.
- **T17 first** (open item, prerequisite): one shared definition of "a ui/ path" used by `tests/ui_cycles.js`, the regroup
  tool, the applier and the module map (a path whose segment right after `src/<owner>/` is `ui`, so
  `src/us/ui/charts/x.js` is ui and `src/us/core/ui/x.js` is neither), and a refusal of any module outside `core/` and
  `ui/` other than `src/<country>/main.js` and `src/<country>/storage-key.js`. With subfolders this matters more than
  before: today two of the tools would call `src/us/core/ui/x.js` ui and two would not.
- **Load-time comments in `core/`** (my call): the 33 non-inert `core/` initializers (Stage 4 section 10) get a
  `// load-time:` comment in this pass, and the load-time guard covers `core/` too, so the rule is the same on both sides.
  If the guard cannot cover `core/` without an exception, the comments still go in and the guard stays ui-only (say so in
  the plan).
- **Two steps, two PRs into `main`** (my call, matching "PRs go to `main`"): (1) T17 and `core/`; (2) `ui/`. Each step is
  several commits (batches by topic), each green on its own.

## 5. The proposed folders

A starting point, checked for cycles as far as section 3 says; the plan fixes every unit's file and runs the cycle check
before the first move. File names inside folders are the plan's to choose by content, one topic per file.

`core/` (all three directories use the same folder names where the topic exists):
- `tax/`: federal rules (tables, filing statuses, deductions), the tax functions (`taxFor` and its parts, payroll, NIIT,
  self-employment tax, QBI, credits), Social Security taxation, state tax (the `STATE_RULES` data block in a file of its
  own, the evaluator and sources). Canada: tax rules (federal constants), `PROVINCE_RULES` (data, own file), the tax
  functions (`federalTaxCA`, `provincialTaxCA`, `personTaxCA`, `incomeTaxCA`, `taxFor`, payroll, the Quebec items, the
  pension split).
- `benefits/` (Canada): `BENEFIT_RULES` (data, own file), `benefitsFor`, GIS, the benefit helpers.
- `healthcare/` (US): ACA and Medicaid (`acaNetCost`, `healthcareCost`, `MEDICAID_RULES`), IRMAA (tiers, lookback, appeal,
  `magiForIrmaaLine`), the 162(l) deduction.
- `income/`: the per-year stages (contributions and plan limits, income streams and one-time income, Social Security /
  CPP and OAS income, pensions, RMDs or RRIF minimums, housing, `buildTaxProfile`), inherited accounts (US).
- `accounts/` (US): the account ledger, the Roth ledger, penalty status and Rule of 55.
- `withdrawals/`: the draw primitives (`take*`, `drawTaxable`, the solvers), the strategies (`withdrawStandard`, the stock-
  account mixes, the bucket steps and orders), the live order and mix weights, the bond ladder and reserve refill, Roth
  conversion (US) / RRSP meltdown (Canada), `newWithdrawal`. `TAXABLE_BASIS_KEY` in its own file here.
- `cliff-plan/` (US): the per-year solver (lines, candidates, lambda, `afterTaxValue`) and the planning step.
- `projection/`: `runProjection`, the year modes, balance growth, `simulate` and the historical and Monte Carlo runs, the
  year sources and factors, guardrails.
- `optimizer/` (US): the multi-lever optimizer and the per-year Roth ladder.
- `inputs/`: `defaults` (own file), `DYN`, `FIELDS` (Canada), list normalization, children, the estimate ids and checks,
  the MCP schema.
- `analysis/`: sensitivity levers, shortfall drivers, the decision comparisons, the minimal spending cut, the estate
  (Canada).
- `format/` (shared): money and number formatting, chart colours and groups, the Sankey layout, small helpers.

`ui/`:
- `charts/`: the projection, Monte Carlo, tornado and Sankey charts, hover, toolbar, colours, view mode, landscape full
  screen; country chart controls, chart view, Sankey flow, sensitivity.
- `inputs/` (the sidebar): field listeners and sync, field search, money formatting, dynamic lists, info bubbles, input
  gestures, the category rail, the estimate badges and review; country `fields`, `sync-controls`, the button groups, group
  summaries, the state-tax note, US `normalize-state`.
- `results/` (the dashboard): headline tiles, the plan status bar and headline, shortfall banner, projection table,
  decision questions, unusual-assumption warnings, the Roth optimizer card; country `render`, the Roth optimizer and its
  controls, table annotations.
- `plans/` (saving and comparing): autosave, storage, the saved plan, reset, undo, scenarios, scenario comparison and
  export, export and print; country print report.
- `layout/` (the app shell): layout listeners and metrics, mobile view, theme, sidebar, disclaimer link.

## 6. Order and verification

1. T17: the shared ui-path definition and the refusal, with fixtures (including a `core/ui/` path and a module outside
   both). No `src/` change.
2. The `core/` map, applied in batches by topic (suggested: tax, healthcare and benefits, income and accounts, withdrawals,
   cliff plan and optimizer, projection, inputs and analysis, shared format), each batch one commit. After each batch:
   `npm run build`, `node scripts/compare-builds.js --base <tree before the step> --ordered` (no statement added, dropped or
   changed; only module order), the load-time order report reviewed, `npm test` green with the snapshots untouched.
3. Purpose comments for every `core/` module, the load-time comments (and the guard, section 4), the regenerated module
   map, inventory and rule docs (`npm run analyze`, `npm run gen:states`, `gen:provinces`, `gen:benefits`: the generators
   record the source path of each data block), CLAUDE.md (paths are rewritten by the tool; the prose of "Modules, the entry
   point and the tools", "Shared state and country seams" and the new "where new code goes" guide by hand), README
   "Files". First PR.
4. The `ui/` map, the same way (one or two batches), purpose comments already exist; CLAUDE.md "Adding UI code" names the
   folders. Second PR.

Every step ends with `npm test` green and the snapshot baselines unchanged. No version badge bump (nothing user-facing).
Timing: module order can change the bundle's statement order only between modules, so no benchmark is needed unless the
comparison reports a change inside a function (which would be a bug).

## 7. Left to the builder

- Each unit's exact file, and the file names inside each folder, within section 5 and the rules of section 3.
- Splitting a folder in two, or merging two, when the cycle check or a topic's size calls for it (say why in the plan).
- The batch boundaries and the order of operations inside a batch.
- Whether `names.json` and the old stage manifests need an update (they are history; Stage 4 left them).
