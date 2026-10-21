# Vitest unit tests for core/: design

Date: 2026-10-21
Status: draft for the owner's review
Parent: `docs/superpowers/specs/2026-10-10-modular-build-design.md` (sections 1, 2, 5, 10 and 11); follows Stage 4
(`docs/superpowers/specs/2026-10-15-stage4-ui-design.md`, section 8, "Vitest: its own short design after Stage 4") and the
core regroup (`docs/superpowers/specs/2026-10-21-core-regroup-design.md`). Third item of the refactor track in
`docs/roadmap.md` ("Current plan": docs refresh, core regroup, **Vitest**, stateless engine, TypeScript, centralized state
writes, Vite, merging the engines, all before feature batch E4).

## 1. Intent

Vitest was the refactor's secondary goal (parent section 2: "Vitest in Node against `core/`. Fast, no browser."). `core/`
has been importable in plain Node since Stage 3 (`tests/core_import.js` proves it for every module, once per country), but
almost every behavior test still loads the built `dist/Planner_*.html` in Playwright and reaches the engine through
`window.__test_*` hooks. A one-line change to a tax function therefore costs a build, a browser launch and a page load before
any number appears.

The owner's decisions (2026-10-21), in order of weight:

1. **A fast, exact edit loop for core code.** Run one test file against `src/` in seconds, no build, no browser.
2. **Ready for the stateless engine** (roadmap item 4, parent section 11). Its "ratchet" tests (identical inputs give
   identical output; a deep-frozen `state` does not throw; running scenario A then B equals B then A) need an in-process
   way to run the engine with a known state. This design builds that harness and its reset rules; the ratchet cases are
   the next design's.
3. **Replacing Playwright math tests to speed up `npm test`** is last. It happens only where a Vitest version is provably
   identical, a few suites at a time, never as a goal in itself.

## 2. Goals, non-goals, anti-goals

Goals:
- Vitest runs the `core/` tests of both planners, one project per country, from `src/`, with no build step.
- A per-test state reset that covers every piece of module-level mutable state in `core/`, so a test sees the same world
  however it is run (alone, in a file, in the whole suite, in any order).
- A first wave of existing pure-function suites converted with every assertion kept exact.
- `npm test` runs the Vitest suite; CI is unchanged except for what `npm ci` installs.
- A documented rule for where a new test goes (Vitest or Playwright) and how to write it.

Non-goals:
- No change to anything under `src/`, to `tests/snapshots/`, or to any number the planners produce. This step adds tests and
  configuration only. (If a conversion reveals a bug, it is reported, not fixed here.)
- The Playwright UI tests, `snapshot_ui`, the `test_*.js` ad-hoc scripts and the built-artifact checks stay as they are.
- The structural guards that are plain Node scripts (`core_purity`, `core_import`, `ui_cycles`, `state_modules`, ...) stay
  plain Node. Parent section 10 imagined the purity scan as a Vitest test; that wording is superseded (see section 9).
- No coverage thresholds, no TypeScript, no watch-mode UI, no Vite dev server (roadmap item 7). Vitest pulls in Vite as its
  own dependency; that is not roadmap item 7 and changes nothing in `scripts/build.js`.
- No "convert everything" target (parent section 5: bulk conversion of existing tests is optional follow-up).

Anti-goals (failures even if the tests are green):
- An assertion loosened by a conversion (a tolerance added, `toBeCloseTo` used, a hand-computed figure replaced by a
  recomputed one).
- A test that passes only in a certain order or alone, because it relied on state a previous test left behind.
- A reset helper that quietly misses a new piece of module state, so a future stateful change goes unseen.
- A second source of truth: the same check living in both a Vitest file and a Playwright script after the conversion.
- `npm test` getting slower to run than it is now.

## 3. What exists today (verified 2026-10-21 at 7592cfb)

- `core/` runs in plain Node. With `node --conditions=us`, `normalizeState({ retireAgeA: 50 })`, `assignState(...)` and
  `simulate(50, 50)` return a 58-row projection (same for Canada). The `#country/*` alias in `src/package.json` resolves by
  the `us` / `canada` condition, so a test process is bound to one country.
- `package.json` has no test runner: `npm test` is one `&&` chain of about 110 `node tests/x.js` scripts after a build.
  81 scripts import `playwright`; 24 are plain Node. Devs are Node 24 locally, CI uses Node 22.
- Of the suites that matter, many never touch the DOM: `tax_brackets`, `state_mechanisms`, `state_rules`, `qbi`,
  `self_employment`, `contribution_limits`, `tax_caches`, `benefits`, `gis_tables`, `benefit_rules`, `province_rules`,
  `estate`, `account_ledger`, `bond_refill`, `irmaa_magi`, `historical_parity` (no `setInput` / `getElementById`; they
  `page.evaluate` against `window.__test_*` only). `golden.js` and `survivor_symmetry.js` drive the DOM (`setInput` 88 and
  7 times) and are not first-wave candidates.
- The test hooks (`src/shared/ui/install-test-hooks.js`, `src/<country>/ui/install-test-hooks.js`) are in `ui/` and are
  thin: they expose `core/` functions on `window`, so a Vitest file imports the same functions directly. Two hooks add
  behavior: the US installer redefines `__test_simulate`, `__test_simulateHistorical`, `__test_runHistoricalCycles` and
  `__test_runMonteCarlo` to re-plan the cliff plan when the state's JSON or the tax year changed (`ensureTestPlan`, which is
  in `src/us/core/cliff-plan/planning.js`, so importable).
- **`normalizeState`.** Canada's is in `core/` (`src/canada/core/inputs/normalize-state.js`). The US one is still in
  `ui/` (`src/us/ui/inputs/normalize-state.js`) because it imports `FIELDS` from `src/us/ui/inputs/fields.js`, whose one DOM
  touch (`clampProfitSharing`, `document.getElementById`) sits inside an `onInput` closure that runs only on a keystroke.
  Importing both in Node works (verified), so it does not block building state from a partial save. It is a wrinkle, not a
  blocker: a "core" test imports one `ui/` module. Section 6 guards it.
- **Module-level state in `core/`** (a reset must cover all of it):
  - `src/shared/core/store.js`: `state`, `mode`, `scenarios`, `compareIds` (`assign…` setters).
  - `src/shared/core/chart-prefs.js`: the nine chart preferences.
  - `src/shared/core/tax-factors.js`: `histTaxFactors`.
  - US only: `src/us/core/tax-year.js` (`currentYear`, initialized from the clock at load), `src/us/core/cliff-plan-store.js`
    (`cliffPlanStore`), `src/us/core/optimizer-state.js` (`optimizerState`), `src/us/core/test-hooks.js` (`testHooks`), and
    in `src/us/core/projection/engine-state.js` the counters `magiStats` and `planStats` and the `cliffPlanCache` map.
  - The `taxIndexFactor` memo in `src/shared/core/projection/year-factors.js` (`taxFactorInflation`): keyed on the
    inflation value it was computed for, so it needs no clearing (`tests/tax_caches.js` pins this), but it is state a test
    must know about.
  - **Compiled caches keyed by a name or an object, private to their modules** (not reachable by a list-based reset, except `RAMQ_CAP`):
    `stateRuleCache` (`src/us/core/tax/state-tax.js`, keyed by state code), `medicaidLimitCache`
    (`src/us/core/healthcare/medicaid-rules.js`), `PROVINCE_COMPILED` (`src/canada/core/tax/province-rules.js`), `RAMQ_CAP`
    (`src/canada/core/tax/rules.js`; exported, a Map keyed by rule-object identity, so a list-based reset could clear it) and `taxFactorByYear` (the per-year array next to the
    `taxIndexFactor` memo). They are correct as long as the rule tables they were compiled from do not change under them.
    The tables (`STATE_RULES`, `PROVINCE_RULES`, `BENEFIT_RULES`, `MEDICAID_RULES`) are exported plain objects that tests edit: `tests/state_mechanisms.js`
    registers a synthetic row `R['zz' + n++]` per case, and `tests/tax_caches.js` flips `needsPerPerson` on the compiled rule
    objects. Section 5.3 sets the rules for this.
  - Module-private scratch objects (`SOURCES_*`, `STREAM_OUT`, `LUMP_OUT`, `SE_OUT`, `SE_HEALTH`, `INH_OUT`, `PAY`, `BEN`,
    `OAS_RECOVERY`, `PROV_TAX`, ...), some of them exported. They hold nothing across calls by contract (read right after the
    call that fills them: `getBenefits()` after `benefitsFor`, the `PROV_TAX` / `OAS_RECOVERY` reads in `tests/tax_brackets.js`),
    so a test that reads them immediately is safe, and a list-based reset does not touch them. The stateless-engine work owns them.
  - `REVEAL_BY_ID` (`src/us/core/inputs/list-rules.js`): filled only by `main.js` at start-up, empty under Vitest; no numeric
    path reads it.
- **Time.** `currentYear` (US) and `CURRENT_YEAR` (Canada) come from the clock at import. Hand-computed tests need a fixed
  year; today's Playwright scripts pin the clock in the page. Vitest tests pin it too (section 5).

## 4. Decisions

All eight recommendations of the brainstorm were accepted by the owner as written.

| # | Question | Decision |
|---|----------|----------|
| 1 | What moves first | Pure-function suites that talk to `core/` only (no DOM interaction). The Playwright UI tests, `snapshot_ui` and DOM-driven math tests (`golden`, `survivor_symmetry`) stay. A thin engine-level helper replaces the `window.__test_*` hooks. |
| 2 | Two countries | One Vitest config with two `projects`, `us` and `canada`, each resolving `#country/*` for its country (a resolve condition or an alias, section 5.2). Shared tests run in both; today only the guards are shared, and the pilot covers Canada with `benefits`. |
| 3 | State reset | Every test starts from a pristine world (section 5.3). Preferred mechanism: a fresh module graph per test, which needs no list of state; fallback: a hand-kept reset list plus a behavioral guard. The spike measures the cost and picks. Each test file always gets its own module graph (isolation on). |
| 4 | Existing plain-Node tests | Structural guards stay plain Node. Only suites that call core functions are converted, one suite per commit, every assertion exact. |
| 5 | `npm test` and CI | `vitest run` is added to the `npm test` chain after the structural guards and before `golden.js`. Playwright stays; `snapshot.js` stays the exact-match gate. |
| 6 | Speed | The whole Vitest suite adds at most about one minute to `npm test`; one file runs in seconds in watch mode. Measured, recorded in section 10. |
| 7 | Ratchet tests | Harness and reset rules designed here; the ratchet cases themselves are the stateless-engine design's. |
| 8 | Dependency | `vitest` is a pinned `devDependency` (exact version, like `esbuild` and `playwright`). Nothing is installed until this design is approved. |

Calls I made that were not asked (the owner may overrule): the file layout and naming of section 5.1, the pilot suites of
section 7, the reset guard of section 6, and the version rule of section 5.5.

## 5. Design

### 5.1 Layout and naming

    vitest.config.mjs            the two projects (US and Canada); .mjs because the root package.json is not "type": "module"
    tests/unit/
      clock.js                   pins the system time; the FIRST setupFile, imports nothing from src/
      setup.js                   per-test reset (section 5.3), the second setupFile
      helpers/
        world.js                 the per-test world (fresh graph, or resetWorld() under the fallback), setState(patch), year pinning
        engine.js                simulate / simulateHistorical / runHistoricalCycles / runMonteCarlo / accountTrace, matching the old hooks
        rules.js                 withRuleRow(), withCompiledFlag() (section 5.3)
        scenario-runner.js       the reset guard's small seeded scenario runner (fallback only)
      shared/*.test.js           run in both projects (guard-exact.test.js, the `toBeCloseTo` scan; guard-reset.test.js or guard-isolation.test.js)
      us/*.test.js               US project only (includes guard-normalize.test.js)
      canada/*.test.js           Canada project only (includes guard-normalize.test.js for Canada's core normalizeState)

Parent section 3 already reserved `tests/unit/` ("Vitest, Node only"); the name stays. Files are `*.test.js`, ES modules
(imports of `src/`, which is ESM), so the old CommonJS scripts in `tests/` are untouched and cannot be picked up by
mistake: Vitest `include` is `tests/unit/**/*.test.js` only. A test imports `core/` modules by relative path (or, under the fresh-graph reset, loads them through the `world` helper), as
`tests/state_modules.js` does with paths, never `dist/`. Tests are `it`/`describe` blocks run sequentially: `it.concurrent` is
not used (module state is shared inside a file, and `simulate.js` writes `state.returnRate` and restores it). Every `describe` names the old script it came from while the old script
exists (for the reader tracing a conversion).

### 5.2 Two countries

`vitest.config.mjs` declares two projects. Each makes `src/package.json`'s `#country/*` imports resolve for its country (below)
and `include`s `tests/unit/shared/**` plus its own country folder. A shared test file runs once per project and so exercises
both countries' seams. Vitest 5 inline projects inherit the root config (`extends` defaults to true) and root and project
`setupFiles` arrays are concatenated, so `clock.js` must come first in whichever list holds it, and a project that sets its
own `resolve` gets its own Vite server; the spike checks this (`DEBUG=vitest:projects`).

`src/` is not in `node_modules`, so Vite inlines it and **Vite's resolver, not Node's `--conditions` flag, resolves the
`#country/*` specifiers** (the flag affects only externalized dependencies). The mechanisms to try, strongest first, are:
(a) `resolve.conditions` per project, which must repeat Vite's default conditions because a custom list replaces them
(and, for server-side code, check whether `ssr.resolve.conditions` is the knob that applies); (b) a `resolve.alias` entry
per project that maps `^#country/(.*)` straight to `src/<country>/$1.js` (independent of conditions, and it mirrors what
`src/package.json` already says); (c) two config files and a script per country. The requirement is that every `#country/...`
specifier resolves to the same file as `node --conditions=<c>` does (checkable: the test imports each seam facade and compares
its exports to `tests/country_contract.js`'s list). The config is `vitest.config.mjs` (not `.js`: the root `package.json` is
not `type: module`).

The country reaches a shared test through `inject('country')` (a per-project `test.provide`; the spike confirms it works in Vitest 5, else a setup-file global), not a build-time `define`; a
shared test file never imports a country module statically. Helpers that need one (`engine.js`'s US `ensureTestPlan` from
`src/us/core/cliff-plan/planning.js`) load it by dynamic `import()` in the branch for that country, so the Canada project never
loads a US module and the reverse.

### 5.3 State reset (the per-test world)

Every test must start from the same world, however it is run (alone, in its file, in the suite, shuffled). Two mechanisms; the
spike (step 1) measures the first and decides.

**Mechanism R (preferred): a fresh module graph per test.** `helpers/world.js` exports `world()`: it calls `vi.resetModules()`
and returns a loader that dynamically imports `src/` modules from the new graph, so every module-level variable, including
the private compiled caches, the rule tables, the stores and the scratch objects, starts as at first import. There is no list of
state to keep, nothing to forget when `core/` gains state, and no behavioral guard to maintain. Tests do not import `src/`
statically; they load what they need once per test (`const { taxFor } = await w.load('us/core/tax/...')`) or once per `describe`
when the cases are read-only. The cost is the reload of the modules a test uses (about 3,000 lines of `STATE_RULES` and the
historical data are the heavy ones); the pilot suites have few, large `it` blocks (section 7), so the cost is small.
**R is adopted if the spike shows the reload is under about 100 ms per test at the median and the pilot's total reload cost is
under about 5 s;** else mechanism L.

**Mechanism L (fallback): a hand-kept reset list and a behavioral guard.** `tests/unit/setup.js` registers a `beforeEach` that
calls `resetWorld()` (`helpers/world.js`; imports `src/` modules only by dynamic `import()`, after the clock is pinned):

1. `assignState(normalizeState(null))`; `assignMode('real')`; `assignScenarios([])`; `compareIds.clear()` (`store.js` exports no
   `assignCompareIds`; `compareIds` is a const `Set`).
2. `assignHistTaxFactors(null)`; the nine chart preferences through their setters, to defaults hard-coded in `world.js` (no source
   exposes the initial values: this is a hand-kept copy, a `guard` would catch a drift only if it changed a result).
3. US: `assignCurrentYear(TEST_YEAR)`; the fields of `cliffPlanStore` and `optimizerState` back to their initial values, the
   `testHooks` counters, `magiStats` and `planStats` to 0, and `cliffPlanCache.clear()`, all by writing the fields of these const
   exported objects in place (they have no setters). Canada: the pinned year, below. `RAMQ_CAP.clear()` (Canada).
4. The rule tables (below). Nothing for the `taxIndexFactor` memo (self-validating) or the private compiled caches (the rule-table
   rules below keep them valid).

L writes to the stores' fields directly; it is a reset list, and a new piece of `core/` state is silently unreset until someone
adds it. The guard of section 6 catches only an omission that changes a scenario's output.

**`TEST_YEAR` is 2026** (both mechanisms): the year most hand-computed tests assume (2026 tax tables). A test that needs another
US year calls `setTaxYear(y)` (`assignCurrentYear`).

**Rule tables and compiled caches.** (Under mechanism R the tables and caches are fresh every test and the table-reset sentence
below is moot; the rules for synthetic rows still apply inside one test.) Under L, `resetWorld()` records the key set of `STATE_RULES`, `PROVINCE_RULES` and `BENEFIT_RULES` the
first time it runs in a file and deletes any key a test added since (it never rewrites a row, so a test must also restore a
row it edited). The compiled caches are keyed by code, so: (1) a test that registers a synthetic row uses a code that has
never been used in that file or world, from one counter that is never restarted (`zz0`, `zz1`, ...), and no `it` restarts it; the
fixed codes `tests/state_mechanisms.js` also uses (`zzb`, `zzp`, `zzloc<n>`, `zzl<n>`) are registered through `withRuleRow` and
deleted in `finally`, or kept within one `it`;
(2) a test that edits a compiled rule object or a table row restores it in `try/finally`, so a failing assertion cannot
leave a dirty cache for the next test. These are conversion rules (section 7), and `tests/unit/helpers/rules.js` provides
`withRuleRow(code, row, fn)` (register, run, delete in `finally`) and `withCompiledFlag(code, key, value, fn)`.

Time: `CURRENT_YEAR` is a module-level constant read from the clock at import, in `src/shared/core/projection/year-factors.js`,
so it exists in both planners; the US additionally has `currentYear` in `src/us/core/tax-year.js` (assignable, which the
reset does through `assignCurrentYear`, and what `__test_setCurrentYear` does). Canada has no setter for its year. Both
projects therefore pin the clock before any `src/` import (and, under R, before every fresh load): `clock.js`, the first `setupFiles` entry, calls
`vi.setSystemTime(new Date(2026, 0, 1))` and imports nothing from `src/` (without fake timers enabled, `setSystemTime` mocks
only `Date`, so timers are unaffected). `world.js` asserts `CURRENT_YEAR === TEST_YEAR` once per file, so a drift fails loudly.
Pinning 2026 changes one old script's behavior: `tests/state_mechanisms.js` runs on the real year today (it calls
`setYear(new Date().getFullYear())`); the converted suite uses the pinned year, which is the stable choice. Random numbers:
`bootstrapReturnSeries` (`simulate.js`) uses `Math.random`, so an exact test never calls `runMonteCarlo` unseeded: it uses a
`rowFn` or a seeded series. A test that needs a different `CURRENT_YEAR` (none known) sets the system time at the top of its own file before its imports,
which the isolated module graph allows; a test that needs a different US year calls `setTaxYear(y)`.

`setState(patch)` is `assignState(normalizeState(patch))`. `world.js` imports `normalizeState` by path, the one place a `ui/`
module is named: Canada's from `src/canada/core/inputs/normalize-state.js`, the US one from `src/us/ui/inputs/normalize-state.js`
(not through the `#country/ui/seam-normalizeState` facade). `tests/legacy_balances.js` and `tests/snapshot_scenarios.js` are
CommonJS files outside `node_modules`, so Vite inlines them and `module` is undefined there: they are loaded with
`createRequire(import.meta.url)`, never `import`. `legacyToAccounts` is pure and usable; `translateFieldList` and `setBalance`
drive the DOM and are never used from `tests/unit/`. None of the four pilot suites uses `legacy_balances` (checked).

Isolation: Vitest runs each file in a fresh module graph (isolate on, the default), so module state never crosses files.
Within a file, R or L makes tests independent. Parallelism across files is on. A file that needs a second, different world in
one test (the stateless engine's "A then B equals B then A") calls `world()` (R) or `resetWorld()` (L) between the two runs.
Acceptance for step 2: the whole suite passes unchanged under `vitest run --sequence.shuffle`, and every file passes run alone.

### 5.4 Engine helpers

`helpers/engine.js` exports `simulate`, `simulateHistorical`, `runHistoricalCycles`, `runMonteCarlo` and `accountTrace` (what
`qbi` uses: `runProjection` with `trace`, through `ensureTestPlan`, setting and restoring `histTaxFactors`, as the US installer
redefines it) for the current project's
country with the behavior of the old window hooks: for US, each re-plans through `ensureTestPlan` when the state's JSON or
the tax year changed (what `install-test-hooks.js` does), for Canada they are the shared functions. A test may also import
the raw functions to bypass the plan, as `__test_simulateRaw` does. The helper is the only place that knows the two
installers differ, so a test file written once runs in both projects. `stateRuleFor` (`tax_caches`), `HIST` and the rule-table
stand-ins are imported from their `core/` modules by the suites that use them.

### 5.5 Dependency and versions

`vitest` goes in `devDependencies` pinned to an exact version, as the other three are. The newest release at design time is
5.0.5 (npm, modified 2026-10-19); my call: pin the newest release that is at least two weeks old when step 1 runs (so
5.0.5 is not it if that is still under two weeks), and check its Node range: Vitest 5 needs Node 22.12 or newer (CI's `node-version: 22` resolves to the latest 22.x; a developer on
an older 22.x would fail, and the docs say "22.12+"). The runner is Node (`pool: 'forks'`; no jsdom, no browser mode). Vitest brings
Vite and its own esbuild range as dependencies: step 2 checks the lockfile diff and that `scripts/build.js` still resolves the pinned
`esbuild` 0.28.2.

### 5.6 `npm test`, CI and scripts

- `npm test` gains `vitest run` between `node tests/src_paths.js` and `node tests/golden.js`. It is a hard failure like the
  scripts around it.
- New scripts: `test:unit` (`vitest run`), `test:unit:us`, `test:unit:canada` (`vitest run --project us`), and
  `test:unit:watch` (`vitest --project us`). A single file: `npx vitest run tests/unit/us/qbi.test.js`.
- CI (`.github/workflows/test.yml`) needs no change: it runs `npm test`, and `npm ci` installs the new dependency. Vitest
  needs no Playwright browser. The build step still runs first in `npm test` (the Playwright suites need it); a unit test
  never reads `dist/`.

### 5.7 Where a new test goes

- **Vitest** (`tests/unit/`): anything that calls `core/` functions or the engines and asserts numbers or structure, with no
  DOM. This is the default for new engine and tax tests.
- **Playwright** (`tests/` or `test_*.js`): anything that needs the DOM (controls, rendering, mobile layout, field wiring),
  the built artifact, or `snapshot_ui`.
- **Plain Node** (`tests/`): the structural guards and the build and tool tests.
- CLAUDE.md's Files and testing-checklist sections say this (section 8, step 5).

## 6. Exactness rules (hard rule, as in `npm test` today)

- Numbers: `expect(a).toBe(b)` (`Object.is`, exactly what Node's `assert.strictEqual` does, so `0` and `-0` differ in both). Never `toBeCloseTo`. Objects and arrays: `toStrictEqual`.
- A converted assertion keeps the comparison of the original, no looser and no stricter: an old `===`, `==` or `Math.abs(...)`
  check is written out the same way, not turned into `toBe`; a `-0` failure from a `toBe` that replaced a `strictEqual` cannot
  occur, and one that replaced a looser check is the conversion's mistake, fixed by restoring the old comparison. If it
  exposes a real `-0`, it is reported, not hidden. A converted assertion keeps the tolerance of the original, no looser: if the old test compared with `Math.abs(a - b) <
  0.005`, the new one does exactly that, written out; the four pilot suites use tolerances in places (`state_mechanisms` and `benefits` a `near` of 0.005, `qbi` 1e-9 and 1e-12), which are written out unchanged; `tax_caches` compares with `Object.is` only. `benefits` also uses `near(x, 0, ...)` with a tolerance of 0
  (`Math.abs(a - b) <= 0`, which accepts `-0`): it stays `Math.abs`, never `toBe(0)`. `toStrictEqual` is close to but not identical
  with `assert.deepStrictEqual` (prototypes, `undefined` properties); a conversion that compared objects with `deepStrictEqual` keeps a
  comparison at least as strict, checked per suite.
- Hand-computed figures stay as the literals (or the hand-derivation) the original had. A converted test never computes its
  expected value from the code under test.
- **Numeric environment.** Vitest runs the raw sources under Vite and Node, not the esbuild bundle in Chromium that `snapshot.js` gates;
  the arithmetic is the same (nothing is minified) but the bundle gate stays authoritative. CI runs Node 22 and developers Node 24:
  step 1 compares every figure of the pilot between the two, not only pass or fail (V8's `Math.pow` / `Math.exp` are the places a
  last-bit difference could appear; the `taxIndexFactor` guard compares within one process and is safe).
- A test in `tests/unit/` that mentions `toBeCloseTo` fails a small scan (`tests/unit/shared/guard-exact.test.js`) so the rule survives.
- **Under mechanism R,** the guard is `tests/unit/shared/guard-isolation.test.js`: a few lines (one test dirties a loaded world,
  the next test in the file asserts the pristine values), with nothing to maintain. **Under mechanism L** (my call; owner's
  requirement 2026-10-21: it must need no maintenance, in particular no allow-list), the reset guard is
  `tests/unit/shared/guard-reset.test.js`, which tests behavior, not source text. In each project: (1) in a fresh world, run a
  fixed sample of about 40 scenarios per country (their definitions come from `scenarios(isUS)` in `tests/snapshot_scenarios.js`,
  loaded with `createRequire`, and their old-vocabulary patches through `legacyToAccounts`) and record every output number;
  (2) dirty the world with a heavy different workload; (3) `resetWorld()` and re-run (1). The outputs must be identical,
  compared exactly (`Object.is` per number). The guard needs determinism, not the snapshot hashes, so it runs the scenarios
  through its own small runner (`tests/unit/helpers/scenario-runner.js`, with its own seeded series) rather than copying
  `PAGE_RUNNER` from `tests/snapshot.js`, and `tests/snapshot.js` is not touched. **Dirtying must hit what a scenario run
  does not overwrite on its own:** a swapped `state`, a changed US `currentYear`, a non-empty `optimizerState` override, a
  populated `cliffPlanStore` and `cliffPlanCache`, non-zero `magiStats` / `planStats`, a changed inflation and a historical run.
  Pass or fail is this equality and nothing else. The runner clears nothing but `state` itself (not the optimizer overrides that
  `tests/snapshot.js`'s `resetState` clears, which would hide an omission), and the guard's scenarios include optimizer-override
  cases, set through the `optimizerState` fields. The fix for a failure is a line in `world.js`.
  **Limits, stated plainly:** it detects only an omission that changes a scenario's output. Counters (`magiStats`, `planStats`,
  `testHooks` counts) change no number, so forgetting them is invisible to it (and harmless); `cliffPlanStore` heals itself in
  the test path (`ensureTestPlan` re-plans when the state JSON or year changed); it cannot see the private compiled caches (the
  section 5.3 rules cover those); the chart-preference defaults in `world.js` are a hand-kept copy. So under L the reset list is
  the safety net and the guard a partial check, not a "no maintenance" system, which is why R is preferred. Its runtime is
  measured in step 1 (section 10).
- `tests/unit/us/guard-normalize.test.js` asserts the US `normalizeState` imports in plain Node with no DOM (the section 3 wrinkle): a
  future `FIELDS` change that touches `document` at load fails here.

## 7. First wave and the conversion procedure

**What a suite may import.** Only `core/` exports, plus `normalizeState` (US: the one `ui/` import, section 3) and the
`ui/` modules of nothing else. Most `window.__test_*` hooks are re-exports of `core/` functions (`__test_tax`, `__test_simulate`,
`__test_getState`) or one-line wrappers (`__test_replaceState` is `assignState(normalizeState(raw))`, and the re-plan comes from `ensureTestPlan` in the hooks that call the engine;
`__test_setCurrentYear` is `assignCurrentYear`), and the helpers stand in for them. A hook that closes over `ui/` state or
re-exports a `ui/` function (Canada's `computeRothOptimizer`, the render-bound hooks) has no unit equivalent: a suite that
needs one stays in Playwright, or the one check that needs it does and the rest are converted (the plan decides per suite; the
conversion commit says which). No other `ui/` import is allowed from `tests/unit/`.

**Pilot (proves the setup in both countries, one suite per commit):** `tax_caches` (module-state memos; the hardest test of
the reset), `state_mechanisms` (US, many hand-computed synthetic-state cases), `benefits` (Canada, 833 lines of hand-computed
cases), `qbi` (small, US). These four exercise both projects, the clock pin, the US plan helper, the memo, and a large
assertion count.

**Then, in batches of a few suites** (the implementation plan fixes the order and may skip a suite whose conversion costs
more than it saves): `tax_brackets`, `state_rules`, `gis_tables`, `benefit_rules`, `province_rules`, `estate`,
`self_employment`, `contribution_limits`, `account_ledger`, `bond_refill`, `irmaa_magi`, `historical_parity`. Not converted
in this step: `golden`, `survivor_symmetry`, `snapshot`, `snapshot_ui`, and any script that drives the DOM.

Shape of the pilot conversions (read before the procedure): `state_mechanisms` is ONE `page.evaluate` of about 600 lines whose `near`
calls only push to a `fails` array, with closure state set once and relied on by later cases (`st.stateTax`, `st.inflation = 0`
then `3`, `setYear(2029/2026)`). It becomes a few large `it` blocks (one per section of the old function, each doing its own
setup), not one `it` per check, and parity is counted in `near` labels. `tax_caches` resets state by deleting every key and
`Object.assign`ing a `base` captured from the booted page: the new base is `normalizeState(null)` (checked equal during the
conversion). `benefits` reads page defaults (such as `oasMonthlyA` 762.5) that come from Canada's `normalizeState(null)`, and
mutates `state.province` and others in place and restores them (the restore moves into `finally`). `qbi` uses `accountTrace` (5.4).

Procedure for each suite (a conversion is one commit):
1. Port the assertions verbatim in order. The unit of parity is the old script's named check: a line its helper prints
   (`ok(desc, ...)`), a labelled `near(...)` or an `assert` call. Where the script loops over a grid and prints one line per case, the new suite uses
   `it.each` (one test per case); where it prints one line for a whole loop, one `it` with the loop's `expect`s. For a script
   that prints only a final count, count its `assert` calls once with a throwaway wrapper that is not committed.
   Also: take `state` inside each test (a `const st = state` at file scope points at the object `resetWorld()` replaced), and
   follow the rule-table rules of section 5.3. The stand-in for `__test_tax` is built per suite from the `core/` names that
   suite uses; it never copies the hook object wholesale (Canada's contains `computeRothOptimizer`, a `ui/` import).
2. Run old and new once against the same commit; the new suite's test count equals the old named-check count, and the
   commit message records both numbers.
3. For a suite with a non-trivial number of cases, a mutation check: change one constant in the code under test (a bracket
   edge, a credit amount), confirm both old and new fail, then revert.
4. Delete the old script, its entry in the `npm test` chain and its mention in `CLAUDE.md`'s Files section **in the same
   commit** (no second source of truth).
5. The exact-snapshot discipline is untouched: `npm test` still ends with `snapshot.js` and `snapshot_ui.js`, unchanged.

## 8. Implementation steps (for the plan; each ends with `npm test` green)

The plan is written in two stages: step 1, the spike, is planned and run first, and steps 2 to 5 are planned after it reports,
because its answers (the `#country/*` mechanism of section 5.2: a resolve condition, an alias or two config files; and the reset mechanism R or L of section 5.3) set their shape. If it
forces the two-config fallback, shared tests run once per `vitest run --config` and the `test:unit` script runs both.

1. **Spike and verify** (throwaway: done in a scratch copy or a branch that is discarded; nothing from it is committed, and
   `package.json` and the lockfile change only in step 2): install the pinned `vitest`, confirm the `#country/*` mechanism per
   project (compare against `tests/country_contract.js`; `DEBUG=vitest:projects`), `inject('country')`, the clock pin before
   `src/` loads (US and Canada), importing the CommonJS helpers with `createRequire`, the Node 22.12 and 24 runs of a trivial
   `simulate()` test in both projects with every figure compared, and the **reload cost of mechanism R** (decides R or L,
   section 5.3). Record the numbers (section 10).
2. **Config and helpers:** `vitest.config.mjs`, `tests/unit/clock.js`, `setup.js`, `helpers/world.js`, `engine.js`, `rules.js`
   (and `scenario-runner.js` only under L), the guard tests of section 6 for the chosen mechanism, `guard-normalize.test.js`,
   `guard-exact.test.js`, the npm scripts, the `npm test` entry, the lockfile check of section 5.5, and the shuffle and
   run-alone acceptance of section 5.3. `package.json` and the lockfile change here, nowhere earlier.
3. **Pilot conversions** (section 7), one commit each.
4. **Remaining first-wave batches** (section 7).
5. **Docs:** `CLAUDE.md` (Commands: the new scripts; Files: `tests/unit/` and which scripts moved; "Where a new test goes";
   the testing checklist), `README.md` only if a user-facing note is warranted (it is not), `docs/roadmap.md` (Vitest done),
   `docs/superpowers/specs/2026-10-10-modular-build-design.md` section 5/10 pointer to this design, and
   `docs/superpowers/inventory/module-map.md` is unaffected (nothing under `src/` changes; `npm run analyze` has no diff).

The final review of a conversion asks one question: can the old script's every case be found in the new file by name?

## 9. What this changes in earlier designs

- Parent section 10 ("Purity check. A Vitest scan..."): the scan stays plain Node (`tests/core_purity.js`, `tests/core_import.js`),
  since they already pass and have no benefit from Vitest. The Vitest tests add only the guards of section 6.
- Parent section 5: "Existing Playwright tests are not bulk-converted" holds; the first wave is a bounded set of pure-function
  suites.

## 10. Open measurements (filled in by step 1 and step 4)

- "Not slower than now" (section 2) is judged on the whole of `npm test` at the end of the first wave, against the same
  commit before the pilot; a single pilot commit may be slower while the old and new suites overlap, because Vitest's start-up is
  added before enough Playwright scripts are removed. Wall-clock of `vitest run` for the full suite, and of one file in watch mode; target: at most about 60 s added to
  `npm test` once the first wave is converted (offset, in part, by the removed Playwright scripts).
- The reload cost of mechanism R (median per test, and the pilot's total), and the `guard-reset` runtime if L is chosen.
- Wall-clock of the replaced scripts versus their Vitest versions (the point of the measurement is whether the conversions
  made `npm test` faster, not a requirement).
- The pinned `vitest` version and the Node 22 / 24 results.

### Spike results (2026-10-21, step 1; scratch worktree, discarded)

- **Version:** `vitest` 5.0.3 (2026-09-30), the only 5.x at least 14 days old on 2026-10-21 (5.0.4 is 2026-10-12, 5.0.5 is
  2026-10-15). It brings Vite 8.3.5; `esbuild` stays 0.28.2 (deduped, no nested copy) and `npm run build` still works.
- **`#country/*` mechanism:** a plain per-project `resolve.conditions` **fails** ("No known conditions for #country/..."). Winner:
  mechanism (a'), `ssr: { resolve: { conditions: [country, 'node', 'import', 'module', 'default'] } }` per project; mechanism (b),
  a per-project `resolve.alias` `{ find: /^#country\/(.*)$/, replacement: <abs src/<country>> + '/$1.js' }`, also passes. Choose
  (a') (it mirrors `src/package.json`); (b) is the fallback. Verified per country: `shared/ui/plans/storage.js` loads, and
  `src/<country>/storage-key.js` and `src/<country>/core/seam-taxFor.js` resolve to the right country.
- **Config details that work:** two inline projects with `extends: false`, `test.provide: { country }` with `inject('country')`,
  `pool: 'forks'`, `isolate: true`, `setupFiles: [clock.js]` with `vi.setSystemTime(new Date(2026, 0, 1))` (then `CURRENT_YEAR`
  is 2026 in both projects), CommonJS helpers through `createRequire` (`scenarios(true)` returns 577 US scenarios and
  `scenarios(false)` 376 Canada ones), `load(rel)` as `import(/* @vite-ignore */ new URL('../../../src/' + rel,
  import.meta.url).href)`: two loads in one world are the same instance, `vi.resetModules()` makes the next load a new
  instance, a live binding read through the namespace sees `assignMode`.
- **`ENGINE_ROWS`:** `simulate(50, 50)` for `normalizeState({ retireAgeA: 50 })` returns **58 rows in both countries**.
- **Mechanism R reload cost:** median **15.1 ms** (US) and **12.5 ms** (Canada) per reload of the engine, historical data,
  `normalizeState` and the tax rules; 50 reloads total 0.78 s and 0.67 s. Far inside the limits (100 ms median, 5 s for 40
  reloads): **`RESET_MECHANISM = R`**. A full spike run (both projects, 14 tests) takes about 2 s.
- **Node 22.12 versus 24.21: the engine's last bits differ.** `Math.pow` returns different last bits for 8 of 82 sampled
  values (for example `Math.pow(1.025, 14)` is `1.4129738209737657` on Node 24.21 and `1.4129738209737654` on Node 22.12), so
  `taxIndexFactor` and the `simulate` rows hash differently between the two Nodes, while `stateIncomeTax` over all 51 codes
  hashes identically. CI runs Node 22 and developers Node 24. Consequence: a Vitest assertion that compares an engine result
  with a literal derived from one Node's output can pass locally and fail in CI. Hand-computed literals (exact decimal
  arithmetic, with the old scripts' tolerances) and comparisons inside one process (the `taxIndexFactor` guard) are safe. The
  plan therefore drops a golden-hash test and instead runs every converted suite on both Nodes (Task 7); a suite that fails on
  one Node is reported, not tolerance-loosened. Recommended follow-up for the owner: run CI on the same Node major as
  development (a one-line `node-version` change), since the unit tests are the first tests that run the engine in Node rather
  than in Chromium.

## 11. Risks

- **Alias resolution under Vitest** (section 5.2): the one structural unknown, with three ordered mechanisms; step 1 exists to answer it first. Also unverified until then: `vi.setSystemTime` without fake timers taking effect before `src/` loads, importing CommonJS test helpers (`createRequire` is the planned way), and Vitest 5's Node range.
- **Stale compiled caches:** the main way a converted suite can silently differ from its old script (section 5.3 rules; the reset guard cannot see them).
- **Hidden order dependence:** a converted suite that relied on the page's start-up state (the `render()` that ran before
  the hook was called) will pass or fail differently from the old script. The conversion procedure's step 2 (same counts,
  same commit) catches the failure; the cause is usually state the old page had and the world reset does not.
- **Clock-dependent code:** anything that reads the clock beyond `currentYear` / `CURRENT_YEAR` (none known). The Canada
  pin and the guard's assertion make a new one visible.
- **Node version drift in `Math.pow`** (spike result above): exact comparisons of engine output against a literal can differ between Node 22 and Node 24; Task 7 runs every converted suite on both.
- **Vitest major-version churn** (5.x is recent): pin exactly, upgrade deliberately.

## 12. Left to the builder

The exact config syntax and condition mechanism (within the section 5.2 requirement), the final conversion order after the
pilot, the helper's file split if `world.js` grows, whether a suite is cheaper left in Playwright, and the wording of the
CLAUDE.md edits.
