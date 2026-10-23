# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators
for a couple or single person — one for the US, one for Canada. The source lives
in `src/<country>/` (`index.html` markup shell, `main.js`, and modules) and `src/shared/` (modules, the stylesheet and HTML partials);
`npm run build` (esbuild, `scripts/build.js`) assembles each into one
self-contained `dist/Planner_US.html` / `dist/Planner_Canada.html` with the CSS and
JS inlined. The built file needs no server and no network: opening it in a browser
is the whole runtime. `dist/` is gitignored (CI keeps each run's build as an artifact; there is no Pages deploy: the repository is private);
**edit `src/`, never `dist/`**. Code both planners use is one module under `src/shared/`
that each planner imports (see [module-system.md](docs/architecture/module-system.md) and
`docs/superpowers/specs/2026-10-10-modular-build-design.md`). See `README.md` for the full user-facing feature list.

This file holds the rules and the invariants. The feature write-ups are in `docs/architecture/` (list at the end):
read the topic file before touching its area.

## Layout

- `src/us/` and `src/canada/` — each planner's source: `index.html` (markup shell with
  `{{css}}` and `{{js}}` placeholders and `<!-- @@include name -->` lines) and `main.js`
  (the entry point: an import block and one IIFE of start-up calls, no declarations). All the
  code lives in modules: `src/<country>/core|ui/` for country code and `src/shared/core|ui/`
  for code both planners use (see [module-system.md](docs/architecture/module-system.md)).
  `docs/superpowers/inventory/module-map.md` lists every module with its exports and purpose.
- `scripts/build.js` + `scripts/lib/assemble-html.js` — the build. `dist/Planner_US.html`
  and `dist/Planner_Canada.html` are its output (gitignored). **Stable filenames**:
  never rename these or create version-numbered copies — every update is a `git commit`
  to `src/`, and the built names never change.
- `src/shared/` — code both planners import. `src/shared/core/` is DOM-free and importable in plain Node (the state modules
  `store.js` and `chart-prefs.js` at its top, every other module in a topic folder); `src/shared/ui/` holds the rest (DOM code and what it imports). `src/package.json`
  makes `src/` ES modules and defines the `#country/*` alias. Details: [module-system.md](docs/architecture/module-system.md).
- `src/shared/styles/styles.css` and `src/shared/partials/*.html` — the stylesheet and the shared HTML partials. Edit them there:
  `scripts/build.js` reads them, and `assembleHtml` splices each partial in at the `<!-- @@include name -->` line of a shell.
- `index.html` — a small landing page linking to both tools. It is the landing page *template*: the build copies it
  into `dist/`, where its relative links to the two planners resolve; at the repo root those links point at files that do not exist.
- `tests/` — the Vitest unit tests (`tests/unit/`), the Playwright and plain-Node checks (`tests/*.js`), and ad-hoc Playwright
  scripts at the repo root (`test_*.js`, not in CI); what each covers is in [test-inventory.md](docs/architecture/test-inventory.md).
- `docs/reference.md` — a much longer, chronological architecture/gotcha log
  (bug postmortems, CSS traps, the full history of specific features). Consult
  it for the deep detail behind anything summarized here before touching that
  area of the code.

## Commands

- Node: Vitest 5 needs Node 22.12 or newer (CI's `node-version: 22` resolves to the latest 22.x).
- `npm test` — builds `dist/` first, then runs the generator checks (`gen-*-rules.js --check`),
  the module-map check (`module-map.js --check --require-purpose`), the build and tool tests and
  the structural guards (`assemble_html` through `module_names` in `package.json`), then
  `tests/golden.js` and the rest of the chain (requires `playwright`; `npm install` first if
  `node_modules` isn't present). Must stay exact-to-the-cent. It runs `vitest run` after the structural guards
  and before `tests/golden.js`.
- `npm run test:unit` — all Vitest unit tests (`vitest run`, both planners, about 15 s). `npm run test:unit:us` and
  `npm run test:unit:canada` run one project (`vitest run --project us|canada`); `npm run test:unit:watch` is
  `vitest --project us` (a single file reruns in well under a second). One file: `npx vitest run tests/unit/us/qbi.test.js`;
  one case: add `-t "<name>"` (a filtered run skips the file's check-count assertion). The order must not matter:
  `npx vitest run --sequence.shuffle` passes, and a new suite is run alone and shuffled before it is committed. Unit tests
  read `src/`, never `dist/`, so they need no build.
- `npm run analyze` — rewrites `docs/superpowers/inventory/closure-*.md` and `module-map.md`.
  Run it after adding, renaming or removing a module (or changing a module's exports or line-1
  purpose comment): `npm test` fails while the module map is stale.
- `npm run build` — writes `dist/`. `npm run dev` rebuilds on every change under `src/`
  with inline source maps: edit, save, refresh the browser. The built script carries a
  `"use strict";` banner (the app runs in strict mode), and esbuild renames identifiers in
  the bundled output, so tests must never regex-match source text in `dist/*.html`; read
  `src/` instead, as `tests/unit/helpers/historical-parity.js` (used by `tests/unit/us/historical-parity.test.js`) does.
- `node test_foo.js` — run one ad-hoc Playwright UI check (repo root, committed,
  not wired into CI or `npm test`). Add/extend one of these when you add a
  feature and actually run it. Single-script runs (`node tests/x.js`, `node test_foo.js`) read whatever
  `dist/` currently holds, so run `npm run build` first (or keep `npm run dev` running); only `npm test` rebuilds for you.
- Syntax-check without a browser: `node --check src/us/ui/results/render.js` (any module; `src/` is plain
  ESM), or `npm run build` (esbuild fails on a syntax error in any module), or load the built file
  in Playwright and watch `page.on('pageerror')`.
- There is no lint step. The only build step is the esbuild bundle; the delivered file
  is still a single self-contained HTML file that needs no server.
- CI: `.github/workflows/test.yml` runs `npm test` (which builds first) on every push/PR to `main` and uploads the built `dist/` as the `fire-planner-dist` artifact (14 days; download it from any run to open the exact files the tests ran against). There is no deploy job: the repository is private, so GitHub Pages is not used (owner decision, 2026-10-22).

## Invariants that cause silent bugs

One line each; the topic file named holds the background.

**Engine and run context** ([engine.md](docs/architecture/engine.md)):

- The engine (`runProjection` and its import closure, `computeCliffPlan`, the `core/analysis/` and `core/optimizer/` modules) reads
  only its run context: `ctx.inputs` (never `state.x`), `ctx.taxYear`, `ctx.taxFactors`, `ctx.overrides`, `ctx.plan` / `ctx.planMode`,
  `ctx.test`, and bumps only `ctx.stats`. It never writes its inputs and never imports a store module or the store layer
  (`tests/engine_purity.js`). A new engine function takes the context first, `fn(ctx, ...)`.
- **One context shape.** Every context that reaches an engine function is built by `newRunContext` (US: through `storeRunContext`;
  Vitest: `w.ctx()` / `w.ctxBuilder()`), never a hand-built literal, and is passed as an argument, never held in a module-level
  binding. A second shape on a hot path made the US gate 10-14% slower; `tests/bench_runs_interleaved.js --warm-analysis` catches it.
- Variants run on shallow copies (`{ ...base, field: value }`) through a `contextFor` factory from the caller, never by mutating
  `state`; never deep-copy or normalize a variant (nested arrays are shared, safe because the engine never writes its inputs).
- A new module-level mutable in an engine module is registered by kind in `tests/engine-purity.json` in the same commit. A memo is
  keyed on every input it reads, never cleared, and gives the very double the uncached path gives.
- Hot paths (`taxFor`, the year loop, the per-year helpers) allocate nothing a year does not need. Module scratch objects
  (`SOURCES_*`, `STREAM_OUT`, `LUMP_OUT`, `INH_OUT`, `SE_OUT`, `BEN`, `PAY`, `OAS_RECOVERY`, `PROV_TAX`, ...) are overwritten by the
  next call: read them right after the call that fills them, and keep nothing from them. `dependentsInYear` returns a shared frozen
  empty array: never mutate it; a profile without `dependents` has none.
- No historical-only fork of the year loop: add a mode switch. A new per-year rule goes in the matching per-year helper, a shared
  one when it is identical in both countries (the two `runProjection` year loops are deliberately not shared).

**MAGI iteration** ([magi-iteration.md](docs/architecture/magi-iteration.md)):

- Anything a year body mutates before the convergence check is in the snapshot: `bal` fields are rewound automatically, a new
  scalar `let` goes into `scalarSnapshot`, and a new mutable ledger into the clone/restore pairs (`accountsClone/Restore`,
  `rothLedgerClone/Restore`, `inheritedClone/Restore`) in the same commit. Never add a `continue` / `break` meant for the year loop.
- A new reader of the year's MAGI inside the loop uses `magiBase`, not `magiBase0`.
- **`seOn`:** every profile that reaches `taxFor` carries `seOn`; `taxFor` reads the self-employment fields only when it is true (a
  test profile with self-employment keys needs `seOn: true`). A new E1c term on a hot path is skipped, not added as a zero, for a
  household without self-employment ([self-employment.md](docs/architecture/self-employment.md)). Every E1e term in the year loop sits
  behind `inh === null` (or `inh !== null`) ([inherited-accounts.md](docs/architecture/inherited-accounts.md)).

**Tax code** ([us-state-tax.md](docs/architecture/us-state-tax.md), [us-federal-tax.md](docs/architecture/us-federal-tax.md)):

- **`needsPerPerson`:** a state mechanism that reads a per-person `sources` field (`pensionA/B`, `retirementA/B`,
  `ssBenefitsA/B`, `taxableSSA/B`, `retirement401kA/B`) must set the row's flag in `compileRow`, or it reads a stale scratch
  value (`tests/unit/us/tax-caches.test.js`). `stateIncomeTax` and its credit helpers keep nothing from `sources`.
- State first, federal second: a state base never reads a federal deduction or federal tax (a state that deducts federal tax gets
  one lagged pass).
- Never write `filing === 'mfj'`: read `filingKey` / `filingRow`, and add a row or a family.
- Survivor modeling remaps the survivor into the `A` slot, with everything summed into slot A for the household (see "US vs.
  Canada" below; `tests/survivor_symmetry.js`).

**Cliff plan** ([cliff-plan.md](docs/architecture/cliff-plan.md)):

- A new draw path that honours `magiCapLeft` adds to `cappableTraditional`, or the plan never offers a stay-under for that mode.
- A code path that swaps `state` needs nothing; one that mutates it in place without restoring must call `render()`.

**Inputs** ([inputs-and-ui.md](docs/architecture/inputs-and-ui.md), [lists.md](docs/architecture/lists.md)):

- A new enum-like field needs a guard in `normalizeState` (its `FIELDS` entry's `values` / `fallback`) or, for a list row, in the
  list normalizer (`normalizeLists`, US `normalizeUsStreams` / `normalizeUsLumps`), or a bad value silently
  corrupts the simulation. A retired field is deleted explicitly in `normalizeState` / `normalizeLists`, or it re-migrates on
  every load.
- To add a field: the markup, the `defaults` value and one `FIELDS` entry (plus an `onInput` hook only for a side effect).
- Loan payments come from the original principal and term (`mortgagePayment`), never the current balance; downstream code reads
  `schedule.payments[year]` / `schedule.balances[year]`, never `state.mortgage*` / `loan.term`.

## State and the sanctioned writes

Cross-module state lives in the state modules (`src/shared/core/store.js`, `chart-prefs.js`; US `src/us/core/tax-year.js`,
`cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`). To change one, call its `assign<Name>` function (`assignState`,
`assignMode`, ...): assigning to an import is a build error. The sanctioned remaining writes to `state` are input writes: the input
handlers and their clamps (field listeners, button groups, `inputs/clamps.js`, the life-expectancy clamps in the US `list-rules.js`
and the Canada `fields.js`, `headline-tiles.js`, the MCP tool, load / undo / reset), `src/us/ui/results/roth-optimizer-controls.js`
("Apply" writes `appliedRothSchedule` and friends), and the test-only `multiLeverRun` / `multiLeverPlannedWithoutMaps` of
`src/us/ui/install-test-hooks.js`. Centralizing them is item 6 of `docs/roadmap.md`. Details: [module-system.md](docs/architecture/module-system.md).

## Where new code goes

Code is placed by topic, in the topic folders of `core/` and `ui/` (one line per folder under "Where new code goes: the topic
folders" in [module-system.md](docs/architecture/module-system.md); read it before adding a module; list them with `find src/*/core src/*/ui -mindepth 1 -maxdepth 1 -type d`).
At the top of `ui/` stay the seam facades, `install-test-hooks.js`, `wizard.js` and (shared) `mcp-tools.js`.

Rules: the state modules (above) and the seam facades stay at the top of `core/`; a new topic gets a new folder only when no
existing one fits; there is no `core` or `ui` folder inside a side's tree (`tests/src_paths.js`). After adding or moving a module,
run `npm run analyze`. **A new engine function** (anything `runProjection`, `computeCliffPlan` or an `analysis/` / `optimizer/`
module calls) takes the run context first (`fn(ctx, ...)`), reads the inputs as `ctx.inputs`, and never imports a store module
(`store.js`, `chart-prefs.js`, `tax-year.js`, `optimizer-state.js`, `cliff-plan-store.js`, `test-hooks.js`) or the store layer
(`store-context.js`, `simulate.js`, `planning.js`); a function that runs variants takes a `contextFor` factory from its caller;
a new module-level mutable is registered in `tests/engine-purity.json`. `tests/engine_purity.js` fails otherwise.

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
  a new name needs a facade in both countries (see "The country seam" in [module-system.md](docs/architecture/module-system.md)).
- **Initializers:** in a `ui/` module, a module-level initializer that computes something (anything but literals, functions, arrows,
  classes, and object or array literals of those) runs when the module loads. It needs a comment block directly above it that starts
  with `// load-time: <reason>`, saying why it reads nothing a statement or another function writes; otherwise compute it inside a
  wiring function. In a module that is part of an import cycle, a marked initializer may use only global names and literals
  (`tests/ui_cycles.js` checks both). The same rule applies to a `core/` module (it is not in a cycle, so the marked initializer may also read
  earlier constants of its own file and imports).
- **Test hooks and MCP tools:** in `src/<country>/ui/install-test-hooks.js` / `src/shared/ui/install-test-hooks.js` and
  `src/shared/ui/mcp-tools.js` (rule 3, below), never in `core/`.
- **The guards:** `tests/closure_names.js` (undeclared names), `tests/ui_cycles.js`, `tests/no_bare_imports.js`, `tests/module_names.js`,
  `tests/main_entry.js`, `tests/doc_paths.js`, the module-map check, all in `npm test`. The ordered build comparison is for refactors only; a feature changes the statements on purpose.
- **The entry point and rule 3:** each `main.js` holds only an import block and one IIFE of calls; `window.__test_*` hooks and
  the MCP tools are installed only from it (`registerMcpTools()`, `installSharedTestHooks()`, `installTestHooks()`, in that order).
- **Purpose comment:** line 1 of every `core/` and `ui/` module (not a facade) is a one-line `//` purpose, then a blank line.
  Module files keep their two-space indentation; never reformat a module in a commit that also changes it.
- **A pure move** (no behavior change): run `node scripts/compare-builds.js --base <dir>` and `--ordered` against the previous tree.

## US vs. Canada: same shape, different names, not a find-and-replace

The two planners share overall structure but diverge in ways that make blind
copy-paste silently wrong — always read both files' relevant sections side by
side before porting a feature:

- US: `ssMonthlyA/B` (Social Security) + `filingStatus` (`mfj`/`single`, with
  a `marryLater` transition age) + `rmdDivisor(age)`. Canada: `cppMonthlyA/B` +
  `oasMonthlyA/B` (the recovery tax, `oasClawback()`, is charged inside `personTaxCA`, 7N N1) + `rrifMinPct(age)`; no MFJ/single
  distinction — Canada always taxes spouses as two individual returns.
- `taxFor(ctx, profile, gains, traditionalExtra)` has **3 branches** in US (`mfj` /
  `singlePerson` / a two-separate-filers branch for pre-marriage
  `marryLater`) but only **2** in Canada (`singlePerson` / two individual
  `personTaxCA` calls; Canada's `taxFor` is `incomeTaxCA` minus the income-tested benefits, see [canada-benefits.md](docs/architecture/canada-benefits.md)).
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
- Canada-only write-ups: [canada-tax.md](docs/architecture/canada-tax.md), [canada-benefits.md](docs/architecture/canada-benefits.md).
  US-only: the penalty and per-partner shares ([us-accounts.md](docs/architecture/us-accounts.md)), ACA / Medicare
  ([us-health.md](docs/architecture/us-health.md)); don't port these to Canada.

## UI traps

- `overflow-x:hidden` on an ancestor silently breaks `position:sticky` everywhere on the page: use `overflow-x:clip`, and verify
  sticky behavior with a real scroll gesture, not `window.scrollTo()`.

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

## Where a new test goes

- **Vitest** (`tests/unit/{shared,us,canada}/`): anything that calls `core/` functions or the engines and asserts numbers or
  structure with no DOM. This is the default for a new engine or tax test.
- **Playwright** (`tests/` or root `test_*.js`): anything that needs the DOM (controls, rendering, mobile layout, field wiring),
  the built artifact, or `snapshot_ui`.
- **Plain Node** (`tests/*.js`): the structural guards and the build and tool tests.

Writing a Vitest test (`tests/unit/shared/guard-imports.test.js` and `guard-exact.test.js` fail rules 1 and 2 if you forget):
1. Never import `src/` yourself (static `import`, `import()`, `vi.importActual`, `require`): go through `world()` from
   `tests/unit/helpers/world.js` in each `it` and `await w.load('<path under src/>')`. A world is a fresh module graph, so no
   state leaks between tests; `load` and `setTaxYear` on an older world throw, and so does any function of a helper (`engine`, `usPlan`, `usContributions`) built from a superseded world. Read a state binding from the namespace each
   time (`assignState` replaces it); do not cache a loaded module in a helper. Set the plan with `w.setState(patch)` (it
   normalizes); the US tax year is 2026 and `w.setTaxYear(y)` changes it. An engine function takes a run context first: build it
   with `await w.ctx(opts)` (`storeContext({ withPlan: false, ...opts })`: it captures the store's state object and tax year when
   called, so build it after the last `setState` / `setTaxYear` the call depends on) or, for a wrapper that keeps a function's old
   signature across `setState` / `setTaxYear`, `const now = await w.ctxBuilder()` and pass `now()` at each call. Never hand-build a
   context literal (one context shape). A function that runs variants (`computeSensitivity`, `findMinimalSpendingCut`,
   the optimizers, ...) takes a `contextFor` factory: pass `stateContextFor()` from `w.load('shared/ui/results/state-context.js')`,
   called after the last `setState` (its base is the store's state object at that moment).
2. Exact comparisons only (the rules of `npm test`): `toBe` for numbers (`Object.is`), `toStrictEqual` for objects, never
   `toBeCloseTo` (scanned). An old tolerance (`Math.abs(a - b) <= tol`, including a tolerance of 0, which accepts `-0`) is
   written out, not turned into `toBe`. Hand-computed expected values stay literals; never compute them from the code under test.
3. A suite converted from a script, or one with many checks, counts them: `const c = makeCounter()` (`helpers/count.js`),
   a check helper ticks first and then reports with `expect.soft` (so every failure shows), a direct comparison is
   `c.expect(x).toBe(y)`, and `afterAll(({}, suite) => { if (suite.tasks.some((t) => t.mode === 'skip')) return;
   expect(c.total).toBe(NEW_COUNT); })` asserts the total. Assert the count in `afterAll`, never from the last `it` (shuffle);
   the first `afterAll` argument must be a destructuring pattern.
4. A synthetic rule row (a jurisdiction `zz`) goes through `withRuleRow(table, code, row, fn)` (`helpers/rules.js`): a code is
   registered once per table per world (the compiled caches are keyed by code), it throws on a code that is already a row
   (a real jurisdiction is never overwritten), and the row is removed afterwards. `withCompiledFlags` sets a flag on compiled
   rules and restores it.
5. No `it.concurrent` (module state is shared inside a file). Files run in forks, one module graph per test.
6. Engine output can differ in the last bit between Node 22 (CI) and Node 24: `Math.pow` does (for example
   `Math.pow(1.025, 14)`). So an expected value is a hand-computed figure or a comparison of two runs in one process, never a
   literal copied from an engine run. Run a new suite on both Node versions if it compares engine output.
7. A bug that a test exposes in `src/` is reported, not fixed in the same commit as the test.

## Testing checklist for any change

1. `npm test` (builds, then the structural guards, the Vitest unit tests and the golden math tests — exact-to-the-cent).
   For a change to `core/` or an engine, first `npm run test:unit` (and `npx vitest run --sequence.shuffle` for a new suite):
   it is the fast loop and needs no build.
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
6. A pure refactor leaves the snapshot baselines untouched: **only run `npm run snapshot:update` for an intended behavior
   change**, and say so in the commit.

## Docs are updated with the code change (reference.md excepted during the batch plan)

- User-facing change → update `README.md`'s feature list in the same commit.
- Architectural change (new shared helper, new US/Canada divergence, new
  gotcha) → update this file or the area's topic file in the same batch of work, not as a later pass.
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
- A change to an area updates its `docs/architecture/` topic file in the same commit; a new area gets a new topic file and a
  line in the list below (`tests/doc_paths.js` checks that every topic file is listed there and every listed file exists).

## Topic files

Read the one for the area you are touching. Each lists its related topics.

- [engine.md](docs/architecture/engine.md) — `runProjection`, the run context and its shape, year sources and modes, per-year helpers, `bal`, withdrawals, the hot-path rules, the death clamp.
- [magi-iteration.md](docs/architecture/magi-iteration.md) — the MAGI iteration, two-return years, the 162(l) estimate, the IRMAA lookback and appeal.
- [cliff-plan.md](docs/architecture/cliff-plan.md) — the per-year solver, the run modes, planning, the cliff-plan test hooks (US).
- [us-federal-tax.md](docs/architecture/us-federal-tax.md) — federal deductions, QBI, the filing-status table, child credits.
- [us-state-tax.md](docs/architecture/us-state-tax.md) — `STATE_RULES`, `stateIncomeTax`, the mechanisms and the `sources` scratch objects.
- [us-health.md](docs/architecture/us-health.md) — Medicaid and the premium-credit floor, ACA eligibility, Medicare and IRMAA gating.
- [us-accounts.md](docs/architecture/us-accounts.md) — the eight accounts and the ledger, contribution limits, the early-withdrawal penalty, per-partner shares.
- [self-employment.md](docs/architecture/self-employment.md) — self-employment tax, the Solo 401(k), 162(l), `self` streams (US, E1c).
- [inherited-accounts.md](docs/architecture/inherited-accounts.md) — inherited IRAs and Roths: the ledger, the draws, state kinds, the last resort (US, E1e).
- [lists.md](docs/architecture/lists.md) — the add-as-you-go lists, income streams, one-time income, spending tiers, children, loan schedules.
- [canada-tax.md](docs/architecture/canada-tax.md) — Canada federal and provincial tax, credits, OAS recovery, payroll items, the after-tax estate.
- [canada-benefits.md](docs/architecture/canada-benefits.md) — `BENEFIT_RULES`, `benefitsFor`, GIS and the provincial programs.
- [inputs-and-ui.md](docs/architecture/inputs-and-ui.md) — `defaults`, `normalizeState`, `FIELDS`, the sync functions, `render()`, charts, MCP, the wizard, the dashboard tiles.
- [module-system.md](docs/architecture/module-system.md) — the `core/` and `ui/` topic folders, modules, seams, state modules, `main.js` and wiring functions, the load-time guard, the extraction, regroup and comparison tools.
- [test-inventory.md](docs/architecture/test-inventory.md) — every test, bench and scan script and what it covers.
