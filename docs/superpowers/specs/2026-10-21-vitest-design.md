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
  - Module-private scratch objects (`SOURCES_*`, `STREAM_OUT`, `LUMP_OUT`, `SE_*`, `BEN`, `PAY`, ...) that are overwritten on
    every call. They hold nothing across calls by contract; the reset does not touch them (it cannot reach them), and the
    stateless-engine work owns them.
- **Time.** `currentYear` (US) and `CURRENT_YEAR` (Canada) come from the clock at import. Hand-computed tests need a fixed
  year; today's Playwright scripts pin the clock in the page. Vitest tests pin it too (section 5).

## 4. Decisions

All eight recommendations of the brainstorm were accepted by the owner as written.

| # | Question | Decision |
|---|----------|----------|
| 1 | What moves first | Pure-function suites that talk to `core/` only (no DOM interaction). The Playwright UI tests, `snapshot_ui` and DOM-driven math tests (`golden`, `survivor_symmetry`) stay. A thin engine-level helper replaces the `window.__test_*` hooks. |
| 2 | Two countries | One Vitest config with two `projects`, `us` and `canada`, each resolving `#country/*` by its own condition. Shared tests run in both. |
| 3 | State reset | A setup helper runs before each test (section 5.3): fresh state from `normalizeState(null)`, every store and cache reset, the year pinned. Each test file gets its own module graph (isolation on). |
| 4 | Existing plain-Node tests | Structural guards stay plain Node. Only suites that call core functions are converted, one suite per commit, every assertion exact. |
| 5 | `npm test` and CI | `vitest run` is added to the `npm test` chain after the structural guards and before `golden.js`. Playwright stays; `snapshot.js` stays the exact-match gate. |
| 6 | Speed | The whole Vitest suite adds at most about one minute to `npm test`; one file runs in seconds in watch mode. Measured, recorded in section 10. |
| 7 | Ratchet tests | Harness and reset rules designed here; the ratchet cases themselves are the stateless-engine design's. |
| 8 | Dependency | `vitest` is a pinned `devDependency` (exact version, like `esbuild` and `playwright`). Nothing is installed until this design is approved. |

Calls I made that were not asked (the owner may overrule): the file layout and naming of section 5.1, the pilot suites of
section 7, the reset guard of section 6, and the version rule of section 5.5.

## 5. Design

### 5.1 Layout and naming

    vitest.config.js             the two projects (US and Canada), shared setup
    tests/unit/
      setup.js                   per-test reset (section 5.3), registered as a setupFile
      helpers/
        world.js                 resetWorld(), setState(patch), year pinning
        engine.js                simulateUs()/simulateCa() wrappers that match the old hooks
      clock.js                   pins the system time; first setupFile, imports nothing from src/
      shared/*.test.js           run in both projects (includes guard-reset.test.js and guard-exact.test.js, the `toBeCloseTo` scan)
      us/*.test.js               US project only (includes guard-normalize.test.js)
      canada/*.test.js           Canada project only (includes guard-normalize.test.js for Canada's core normalizeState)

Parent section 3 already reserved `tests/unit/` ("Vitest, Node only"); the name stays. Files are `*.test.js`, ES modules
(imports of `src/`, which is ESM), so the old CommonJS scripts in `tests/` are untouched and cannot be picked up by
mistake: Vitest `include` is `tests/unit/**/*.test.js` only. A test imports `core/` modules by relative path, as
`tests/state_modules.js` does, never `dist/`. Every `describe` names the old script it came from while the old script
exists (for the reader tracing a conversion).

### 5.2 Two countries

`vitest.config.js` declares two projects. Each sets the `#country/*` condition (`us` or `canada`) on Vitest's module
resolution so `src/package.json`'s `imports` map resolves, and `include`s `tests/unit/shared/**` plus its own country
folder. A shared test file runs once per project and so exercises both countries' seams. A test that needs a country
name reads it from `process.env`-free context: the project sets a `define`d `COUNTRY` constant the helpers read, so a
shared test can branch on the country without importing a seam.

How the condition is passed (a Vite resolve condition versus the Node `--conditions` flag on the worker, through
`execArgv`) depends on Vitest's current behavior and is the first thing the implementation verifies (section 8, step 1): the
requirement is that `node --conditions=us`'s resolution and Vitest's resolve to the same file for every `#country/...`
specifier (checkable: the test imports each seam facade and compares its exports to `tests/country_contract.js`'s list).
If one mechanism fails, the other is the fallback; if neither works under Vitest, fall back to two config files and an
npm script per country.

### 5.3 State reset (the per-test world)

`tests/unit/setup.js` (listed after `clock.js` in `setupFiles`) registers a `beforeEach` that calls `resetWorld()`
(`helpers/world.js`); `world.js` imports `src/` modules only through dynamic `import()` inside `resetWorld()`, so the clock
is already pinned when the first `core/` module loads:

1. `assignState(normalizeState(null))`; `assignMode('real')`; `assignScenarios([])`; `assignCompareIds(new Set())`.
2. `assignHistTaxFactors(null)`; every chart preference back to its default (`chart-prefs.js` setters).
3. US: `assignCurrentYear(TEST_YEAR)`, `cliffPlanStore` fields back to initial, `optimizerState` back to initial, `testHooks`
   counters to 0, `magiStats` and `planStats` keys to 0, `cliffPlanCache.clear()`. Canada: the pinned year, below.
4. Nothing for the `taxIndexFactor` memo (self-validating), recorded as a comment in `world.js`.

The reset assigns through the existing `assign…` functions and mutates the exported stores in place; it never writes to a
module's internals by another route. **`TEST_YEAR` is 2026**: the year most hand-computed tests assume (2026 tax tables).
A test that needs another year calls `setTaxYear(y)`.

Time: `CURRENT_YEAR` is a module-level constant read from the clock at import, in `src/shared/core/projection/year-factors.js`,
so it exists in both planners; the US additionally has `currentYear` in `src/us/core/tax-year.js` (assignable, which the
reset does through `assignCurrentYear`, and what `__test_setCurrentYear` does). Canada has no setter for its year. Both
projects therefore pin the clock before any `src/` import: `clock.js`, the first `setupFiles` entry, calls
`vi.setSystemTime(new Date(2026, 0, 1))` and imports nothing from `src/` (without fake timers enabled, `setSystemTime` mocks
only `Date`, so timers are unaffected). `world.js` asserts `CURRENT_YEAR === TEST_YEAR` once per file, so a drift fails loudly.
A test that needs a different `CURRENT_YEAR` (none known) sets the system time at the top of its own file before its imports,
which the isolated module graph allows; a test that needs a different US year calls `setTaxYear(y)`.

`setState(patch)` is `assignState(normalizeState(patch))`. `tests/legacy_balances.js` is CommonJS: `legacyToAccounts` is pure and a Vitest file may import it (Vitest loads CommonJS
through its default export); `translateFieldList` and `setBalance` drive the DOM and are never used from `tests/unit/`.
None of the four pilot suites uses `legacy_balances` (checked), so this matters only to later suites.

Isolation: Vitest runs each file in a fresh module graph (isolate on, the default), so module state never crosses files,
and `resetWorld()` makes it independent within a file. Parallelism across files is on. A file that needs a second,
different world in one test (the stateless engine's "A then B equals B then A") calls `resetWorld()` itself between the
two runs.

### 5.4 Engine helpers

`helpers/engine.js` exports `simulate`, `simulateHistorical`, `runHistoricalCycles`, `runMonteCarlo` for the current project's
country with the behavior of the old window hooks: for US, each re-plans through `ensureTestPlan` when the state's JSON or
the tax year changed (what `install-test-hooks.js` does), for Canada they are the shared functions. A test may also import
the raw functions to bypass the plan, as `__test_simulateRaw` does. The helper is the only place that knows the two
installers differ, so a test file written once runs in both projects.

### 5.5 Dependency and versions

`vitest` goes in `devDependencies` pinned to an exact version, as the other three are. The newest release at design time is
5.0.5 (npm, modified 2026-10-19); my call: pin the newest release that is at least two weeks old when step 1 runs (so
5.0.5 is not it if that is still under two weeks), and check that it supports Node 22 (CI) and Node 24 (local). The runner is Node (`pool:
'forks'`: plain Node semantics, so `--conditions` and `process`-level behavior are identical to the structural scripts; no
jsdom, no browser mode).

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
  0.005`, the new one does exactly that, written out; most use none.
- Hand-computed figures stay as the literals (or the hand-derivation) the original had. A converted test never computes its
  expected value from the code under test.
- A test in `tests/unit/` that mentions `toBeCloseTo` fails a small scan (`tests/unit/shared/guard-exact.test.js`) so the rule survives.
- **The reset guard** (my call, owner's requirement 2026-10-21: it must need no maintenance, in particular no allow-list), `tests/unit/shared/guard-reset.test.js`,
  tests behavior, not source text. In each project: (1) in a fresh world, run a fixed sample of the scenarios in
  `tests/snapshot_scenarios.js` (plain data; spread across standard, retirement-age shifts and historical paths, and, for the
  US, with the cliff plan on) and record every output number; (2) dirty the world with a heavy different workload (a Monte
  Carlo run, a historical run, the optimizer, a plan-changing state, a changed inflation and tax year); (3) call
  `resetWorld()` and re-run (1). The outputs must be identical, compared exactly (`Object.is` per number). State that survives
  the reset and changes a result fails the test; memos and scratch objects never change a result, so they need no list.
  Pass or fail is this equality and nothing else. When it fails, the message also names the exported values of any `core/`
  module (found by globbing `src/**/core/**/*.js` and importing each, no list) that differ from a fresh import, as a pointer
  to the cause; that listing is diagnostic only and never fails the test by itself. The fix for a failure is a line in
  `world.js`. Limit: it catches only a leak the sampled scenarios exercise; the sample is large to make that unlikely.
- `tests/unit/us/guard-normalize.test.js` asserts the US `normalizeState` imports in plain Node with no DOM (the section 3 wrinkle): a
  future `FIELDS` change that touches `document` at load fails here.

## 7. First wave and the conversion procedure

**What a suite may import.** Only `core/` exports, plus `normalizeState` (US: the one `ui/` import, section 3) and the
`ui/` modules of nothing else. Most `window.__test_*` hooks are re-exports of `core/` functions (`__test_tax`, `__test_simulate`,
`__test_getState`) or one-line wrappers (`__test_replaceState` is `assignState(normalizeState(raw))` plus a re-plan;
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

Procedure for each suite (a conversion is one commit):
1. Port the assertions verbatim in order. The unit of parity is the old script's named check: a line its helper prints
   (`ok(desc, ...)`) or an `assert` call. Where the script loops over a grid and prints one line per case, the new suite uses
   `it.each` (one test per case); where it prints one line for a whole loop, one `it` with the loop's `expect`s. For a script
   that prints only a final count, count its `assert` calls once with a throwaway wrapper that is not committed.
2. Run old and new once against the same commit; the new suite's test count equals the old named-check count, and the
   commit message records both numbers.
3. For a suite with a non-trivial number of cases, a mutation check: change one constant in the code under test (a bracket
   edge, a credit amount), confirm both old and new fail, then revert.
4. Delete the old script, its entry in the `npm test` chain and its mention in `CLAUDE.md`'s Files section **in the same
   commit** (no second source of truth).
5. The exact-snapshot discipline is untouched: `npm test` still ends with `snapshot.js` and `snapshot_ui.js`, unchanged.

## 8. Implementation steps (for the plan; each ends with `npm test` green)

The plan is written in two stages: step 1, the spike, is planned and run first, and steps 2 to 5 are planned after it reports,
because its answer (a `projects` array, a per-worker `--conditions`, or two config files, section 5.2) sets their shape. If it
forces the two-config fallback, shared tests run once per `vitest run --config` and the `test:unit` script runs both.

1. **Spike and verify** (throwaway, not committed until it works): install the pinned `vitest` into a branch, confirm the
   `#country/*` alias resolves per project (compare against `tests/country_contract.js`), the Canada clock pin works, the
   Node 22 and 24 runs agree, and a trivial `simulate()` test runs in both projects. Record the numbers (section 10).
2. **Config and helpers:** `vitest.config.js`, `tests/unit/setup.js`, `helpers/world.js`, `helpers/engine.js`,
   `guard-reset.test.js`, `guard-normalize.test.js`, `guard-exact.test.js`, the npm scripts, the `npm test` entry. `package.json` and the lockfile change here, nowhere earlier.
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
- Wall-clock of the replaced scripts versus their Vitest versions (the point of the measurement is whether the conversions
  made `npm test` faster, not a requirement).
- The pinned `vitest` version and the Node 22 / 24 results.

## 11. Risks

- **Alias resolution under Vitest** (section 5.2): the one structural unknown; step 1 exists to answer it first.
- **Hidden order dependence:** a converted suite that relied on the page's start-up state (the `render()` that ran before
  the hook was called) will pass or fail differently from the old script. The conversion procedure's step 2 (same counts,
  same commit) catches the failure; the cause is usually state the old page had and the world reset does not.
- **Clock-dependent code:** anything that reads the clock beyond `currentYear` / `CURRENT_YEAR` (none known). The Canada
  pin and the guard's assertion make a new one visible.
- **Vitest major-version churn** (5.x is recent): pin exactly, upgrade deliberately.

## 12. Left to the builder

The exact config syntax and condition mechanism (within the section 5.2 requirement), the final conversion order after the
pilot, the helper's file split if `world.js` grows, whether a suite is cheaper left in Playwright, and the wording of the
CLAUDE.md edits.
