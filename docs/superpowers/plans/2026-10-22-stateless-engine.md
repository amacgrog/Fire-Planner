# Stateless Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `runProjection` (both planners) becomes a function of an explicit per-run context, the engine stops reading the
store modules and the clock, and the analysis code builds variants as copies instead of mutating `state`, with no
number and no timing change.

**Architecture:** A plain run context (`newRunContext`) is built once per run by a store adapter (`storeContext()`,
one per country) and passed as the first argument to every engine function that needs one of its fields. The engine is
converted folder by folder, leaf first, with a temporary zero-allocation bridge (`LIVE_CTX`) for callers not converted
yet; a structural guard pins a shrinking list of engine modules that still reach the store, and a registry of the
allowed module-level mutables.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), plain-Node guards and
Playwright scripts (`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-22-stateless-engine-design.md` (read it first; section numbers below refer to
it). Also read CLAUDE.md, in particular "Architecture, per planner file", "Shared state and country seams", "Modules,
the entry point and the tools", "Where new code goes", "Where a new test goes" and the tax-code hot-path rules.

## Global Constraints

- No behavior change: `tests/snapshots/*.json` are never updated (`npm run snapshot:update` is never run); every
  `tests/unit` assertion, `tests/golden.js` and every guard pass unchanged. A test file may change only to pass a
  context argument or call a renamed entry point (Task 4 gives the helper, `w.ctx()`); never an expected value.
- Speed: on `tests/bench_runs_interleaved.js --base <ref>` (US) and `tests/bench_canada.js --base <ref>` (Canada), no
  state's median worse than +5%; a result between +5% and +10% is re-run once; a confirmed regression is fixed before
  the stage ends.
- The context is passed explicitly as the first argument (`fn(ctx, ...)`), `taxFor` included. Never a module-level
  "current context" binding set around a run (spec section 9, anti-goals), except the temporary `LIVE_CTX` bridge of
  stage 3, which reads the store and is gone from every engine module by the end of Task 12.
- No new per-call allocation on a hot path (CLAUDE.md hot-path rules). The Canada `state.province === 'on'` tests stay
  plain comparisons (`ctx.inputs.province === 'on'`).
- Module files keep their two-space indentation; every new `core/` or `ui/` module starts with a one-line `//` purpose
  comment and a blank line; after adding, renaming or removing a module or an export, run `npm run analyze`.
- New seam names need a facade in both countries (`src/<country>/core/seam-<name>.js`, one line:
  `export { name } from './path.js';`) and pass `node tests/country_contract.js`.
- One PR per stage (Stages 1-4, in order). Do not push or open a PR: at the end of each stage, stop and report to the
  owner, who decides.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A variant run on a state the plan was not made for** (after `__test_replaceState`, load / undo / reset before
  `render()`, a test world that never refreshed): today each in-place variant is planned for its own JSON; it must stay
  so. Task 3's parity script runs every household twice, once after a refresh and once without; Task 14 owns the rule.
- **The tornado's inflation lever in real-dollar mode**: the end value must be converted with the variant's inflation.
  Task 3's parity bundle includes the levers in both display modes; Task 13/14 own it.
- **A historical run started while a plan is being computed** (nested runs): `taxFactors` must be the run's own array
  and planning must see `null`. Task 1's ratchet test runs a historical path, then a plan refresh, then the same path
  again and compares; Task 5 owns it.
- **Shared nested arrays in shallow copies** (`children`, `oneTimeIncome`, `loans`, `incomeSources`): a variant shares
  them with the base, so any engine write to them would leak across variants. Task 1's deep-frozen test covers every
  list field with at least one row; Task 14 must not deep-copy (it would cost time) and must not normalize.
- **The Canada planner after a US-driven seam change** (`taxFor`, `storeContext`, `LIVE_CTX`): both countries must change
  in the same commit. Every task's verification runs both Vitest projects and the Canada snapshot.

---

## File structure

New:

| File | Responsibility |
| --- | --- |
| `src/shared/core/projection/run-context.js` | `newRunContext(fields)`, `NO_OVERRIDES`, `NO_TEST`: the context's one shape (pure) |
| `src/us/core/projection/store-context.js`, `src/canada/core/projection/store-context.js` | `storeContext(opts)`: a context built from the store (the adapter's boundary; US plans through `planForState`) |
| `src/us/core/projection/live-context.js`, `src/canada/core/projection/live-context.js` | `LIVE_CTX`: getter object over the store bindings, the stage 3 bridge; deleted in Task 16 |
| `src/<country>/core/seam-storeContext.js`, `seam-LIVE_CTX.js`, `seam-variantContext.js` | seam facades |
| `src/shared/core/projection/runs.js` | `simulateWith(ctx, a, b)`, `simulateHistoricalWith(ctx, rowFn, a, b)`: the pure run entry points |
| `src/shared/core/format/display-value.js` | `displayValueOf(mode, inflation, n, yearIndex)` (pure) |
| `tests/unit/shared/engine-ratchet.test.js` | the ratchet tests (spec section 7, stage 1) |
| `tests/engine_purity.js` + `tests/engine-purity.json` | the guard: registry of module-level mutables and the shrinking list |
| `tests/analysis_parity.js` | `--base DIR`: the analysis bundle of two trees compared exactly (not in `npm test`) |

Modified throughout: the engine modules listed per task, `src/shared/core/projection/simulate.js` (the shared adapter
functions), `src/us/core/cliff-plan/planning.js`, the three `install-test-hooks.js`, `tests/unit/helpers/{world,engine,us-plan}.js`,
`package.json` (`test` script), CLAUDE.md, `docs/superpowers/inventory/module-map.md` (generated), `docs/roadmap.md`.

## The context (used by every task)

```js
// src/shared/core/projection/run-context.js
export const NO_OVERRIDES = Object.freeze({ rothBracketByAge: null, withdrawalMixByAge: null });
export const NO_TEST = Object.freeze({ inhForce: null, inhNoNeedAdj: false });
// Always the same key order (one hidden class): inputs, taxYear, taxFactors, plan, planMode, overrides, stats, test.
export function newRunContext({ inputs, taxYear, taxFactors = null, plan = null, planMode = 'off', overrides = NO_OVERRIDES, stats = null, test = NO_TEST }) { ... }
```

- `stats` (US): `{ magi: magiStats, plan: planStats, hooks: testHooks }` from `src/us/core/projection/engine-state.js`
  and `src/us/core/test-hooks.js`; Canada `null`.
- `test` (US): `{ inhForce: testHooks.testInhForce, inhNoNeedAdj: testHooks.testInhNoNeedAdj }`, captured when the
  context is built.
- `storeContext({ withPlan = true, taxFactors = null } = {})`: US: `inputs: state`, `taxYear: currentYear`,
  `overrides: { rothBracketByAge: optimizerState.rothBracketByAge, withdrawalMixByAge: optimizerState.withdrawalMixByAge }`,
  `plan`/`planMode` from `planForState(state)` when `withPlan` (`plan ? 'apply' : 'off'`), else `null`/`'off'`; Canada:
  `taxYear: CURRENT_YEAR` (`src/shared/core/projection/year-factors.js`), no plan, `stats: null`.
- `LIVE_CTX` (bridge, stage 3 only): an object whose getters return the live `state`, `currentYear` (Canada
  `CURRENT_YEAR`), `histTaxFactors`, and fixed `plan: null`, `planMode: 'off'`, `overrides` = `optimizerState` (US; it
  has the two override fields), `stats` = the module sinks, `test` getter as above. No allocation per access except
  `test`, which no bridged function reads.

---

## Stage 1 (PR 1): ratchet tests and guards

### Task 1: The ratchet tests

**Files:**
- Create: `tests/unit/shared/engine-ratchet.test.js`

**Interfaces:**
- Consumes: `world()` (`tests/unit/helpers/world.js`), `engine(w)` (`tests/unit/helpers/engine.js`: `simulate`,
  `simulateHistorical`, which re-plan through `ensureTestPlan` in the US), `w.load('shared/core/projection/historical-data.js')` for `HIST`.
- Produces: nothing other tasks call; it runs in every later task's `npm run test:unit`.

- [ ] **Step 1: Write the test file.** Scenarios per country (`inject('country')` picks the list): the default household;
  a survivor (`survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 80`); a child (`children: [{ birthYear: 2015 }]`);
  US: an inherited IRA (`oneTimeIncome: [{ age: 50, amount: 100000, kind: 'inheritedTrad' }]`), self-employment
  (`incomeKindA: 'self'`), a one-time wages lump, a loan, `stateTax: 'ny'`, `'ca'`, `'pa'`; Canada: `province: 'qc'`,
  `'ns'`, `'mb'`, a single person with OAS. One helper `runAll(w, patch)` returns
  `JSON.stringify([simulate(), simulateHistorical((y) => HIST[(y + 10) % HIST.length])])`. Cases (each in its own `it`,
  each with a fresh `world()`):
  - `identical inputs give identical output`: `runAll(p)` twice, `expect(b).toBe(a)`, for every scenario.
  - `order does not matter`: for scenario pairs (A, B): `a1 = runAll(A); b1 = runAll(B); a2 = runAll(A)` and in a second
    world `b0 = runAll(B); a0 = runAll(A)`; `expect(a2).toBe(a1); expect(a0).toBe(a1); expect(b0).toBe(b1)`.
  - `a deep-frozen state runs`: `w.setState(patch)`, then deep-freeze the store's `state` (every nested object and array;
    give every list field one row: `children`, `oneTimeIncome`, `loans`, `incomeSources`, `extraExpenses`,
    `lumpExpenses`, `spendingTiers`), then `expect(() => runAll(...)).not.toThrow()`.
  - `a historical run, a plan refresh, the same run again` (US): `h1` = historical JSON, then
    `(await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan()`, then `h2`; `expect(h2).toBe(h1)`.
  Use `makeCounter` and assert the check count in `afterAll` (CLAUDE.md "Where a new test goes", rule 3).
- [ ] **Step 2: Run it.** `npx vitest run tests/unit/shared/engine-ratchet.test.js` and
  `npx vitest run tests/unit/shared/engine-ratchet.test.js --sequence.shuffle`. Expected: PASS in both projects (the
  ratchet already holds, spec section 3). A failure is a finding: report it to the owner, do not fix it in this stage.
- [ ] **Step 3: Commit** (`test: ratchet tests for the stateless engine`).

### Task 2: The engine purity guard

**Files:**
- Create: `tests/engine_purity.js`, `tests/engine-purity.json`
- Modify: `package.json` (`test`: add `node tests/engine_purity.js` right after `node tests/ui_cycles.js`)

**Interfaces:**
- Consumes: `buildGraph(root, country)` from `scripts/lib/module-graph.js` (`{ files, edges }`, edges through facades);
  `espree` for the top-level scan.
- Produces: `tests/engine-purity.json` with `{ "storeModules": [...], "adapters": [...], "stillReaching": { "us": [...], "canada": [...] }, "mutables": { "<file>": { "<name>": "memo" | "scratch" | "constant" } } }`.
  Later tasks edit `stillReaching` (remove entries) and `mutables` (add / move entries); Task 16 empties `stillReaching`.

- [ ] **Step 1: Write the guard.** Definitions:
  - *store modules*: `src/shared/core/store.js`, `src/shared/core/tax-factors.js`, `src/shared/core/chart-prefs.js`,
    `src/us/core/tax-year.js`, `src/us/core/optimizer-state.js`, `src/us/core/cliff-plan-store.js`, `src/us/core/test-hooks.js`.
  - *engine modules* (per country): every `core/` module in the import closure of the country's
    `core/projection/run-projection.js`, plus every module under `core/analysis/` and `core/optimizer/` and their
    closures, minus the store modules and the `adapters` list (filled in Task 5).
  - *reaches the store*: the store-module set is reachable from the module through `edges`.
  - Check A: the set of engine modules that reach the store equals `stillReaching[country]` exactly (a new one fails with
    "now reaches the store: X"; a listed one that no longer reaches it fails with "remove X from stillReaching").
  - Check B: every top-level binding of an engine module that is a `let`/`var`, or a `const` whose initializer is an
    object or array literal, `new Map/Set/WeakMap/Array/<typed array>`, or a call, is listed under `mutables[file][name]`;
    an unlisted one fails ("unregistered module-level mutable"); a listed name that no longer exists fails too.
  - Fill the JSON from the current tree: `stillReaching` is whatever Check A finds today (about 40 US + shared, 27 Canada +
    shared, spec section 3); classify `mutables` by spec section 5 (memo: `taxFactorByYear`, `taxFactorInflation`,
    `stateRuleCache`, `PROVINCE_COMPILED`, `medicaidLimitCache`, `RAMQ_CAP`; scratch: the spec's list plus any the scan
    finds; constant: rule tables, step tables, mode objects, `HIST`, the bucket orders; counters `magiStats`, `planStats` are `"counter"` (they stay, as the US stats sinks) and
    `cliffPlanCache` is `"cache"` until Task 5 moves it out of the engine). A binding that fits none of the
    spec's kinds is reported to the owner, not classified by guess.
- [ ] **Step 2: Run it.** `node tests/engine_purity.js`. Expected: `engine purity: N modules still reach the store (us),
  M (canada); K registered mutables` and exit 0. Then check that it bites: temporarily add `let x = 0;` to
  `src/us/core/tax/federal-tax.js`, run, expect exit 1 naming it, revert.
- [ ] **Step 3: Commit** (`test: engine purity guard (shrinking list, mutable registry)`).

### Task 3: The analysis parity hook and script

**Files:**
- Modify: `src/shared/ui/install-test-hooks.js` (add `__test_analysisBundle`), `src/us/ui/install-test-hooks.js` (US
  extras on the bundle)
- Create: `tests/analysis_parity.js`

**Interfaces:**
- Produces: `window.__test_analysisBundle()` → a JSON-serializable object, computed for the current `state` with the
  existing functions:
  `{ sensitivity: { real: [...], nominal: [...] }, decisions: {...}, spendingCut, retirementDelay, shortfall, realCagr: [...], rothOptimizer, us?: { perYear, multiLever, scheduleCost } }`.
  - `sensitivity.<mode>`: for every lever in `SENSITIVITY_LEVERS` (all ids, not the checked boxes), `lever.run(endValue)`
    with `endValue = (sim) => displayValue(sim.rows.at(-1).total, sim.rows.at(-1).year)`, with the store's `mode` set to
    that display mode for the call (`assignMode`) and restored after.
  - `decisions`: for each key of `DECISION_QUESTIONS` (`#country/ui/seam-DECISION_QUESTIONS`), `run()` mapped to
    `{ sentence, rows: rows.map((r) => ({ label: r.label, total: r.sim.rows.at(-1).total, depletedAge: r.sim.depletedAge })) }`
    (whatever fields the question returns; keep every number).
  - `spendingCut` / `retirementDelay`: `findMinimalSpendingCut(simulate())`, `findMinimalRetirementDelay(simulate())`.
  - `shortfall`: `analyzeShortfallDrivers(simulate())`.
  - `realCagr`: `[2, 4, 6].map((c) => simulateAtRealCagr(c).rows.at(-1).total)`.
  - `rothOptimizer`: `computeRothOptimizer(simulate())` (`#country/ui/seam-computeRothOptimizer`).
  - US: `perYear`: `optimizeRothLadderPerYear` and `multiLever`: `optimizeMultiLever` with
    `optimizerState.rothPerYearEvalBudget` set to 200 for the call and restored; `scheduleCost`: `rothScheduleCost` of
    the multi-lever result's schedule. Strip functions and `Map`s to arrays so the bundle serializes.
- [ ] **Step 1: Add the hook** in both installers; it must not change `state` (assert in the hook:
  `JSON.stringify(state)` before and after are equal, else throw).
- [ ] **Step 2: Write `tests/analysis_parity.js --base DIR [--households default,survivor,...]`.** Modeled on
  `tests/plan_off_anchor.js`: one Playwright browser, one page per tree and country (`plannerPath(file, root)`), clock
  installed at `2026-06-15T12:00:00Z`. For each household patch (the Task 1 scenarios, US and Canada lists):
  (a) `__test_replaceState(patch)`, `__test_refreshCliffPlan()` (US), bundle; (b) `__test_replaceState(patch)` with no
  refresh, bundle (the no-refresh path, Review Focus 1). Compare `JSON.stringify` of each bundle between the two trees;
  print `identical / different` per household and the first differing key; exit 1 on any difference.
- [ ] **Step 3: Run it** against this tree itself (`npm run build`, copy `dist/` to a scratch dir, `--base` that dir).
  Expected: all identical. Run `npm test`. Expected: PASS.
- [ ] **Step 4: Commit** (`test: analysis parity hook and script`).

**Stage 1 end:** `npm test` green; stop and report to the owner (PR 1). Record the stage 1 commit: it is the `--base`
of every later `analysis_parity.js` run (it has the hook; `main` does not).

---

## Stage 2 (PR 2): the context and the adapter

### Task 4: The context module and the store contexts

**Files:**
- Create: `src/shared/core/projection/run-context.js`, `src/us/core/projection/store-context.js`,
  `src/canada/core/projection/store-context.js`, `src/us/core/seam-storeContext.js`, `src/canada/core/seam-storeContext.js`
- Modify: `tests/unit/helpers/world.js` (add `w.ctx(opts)`), `tests/engine-purity.json` (`adapters`)
- Test: `tests/unit/shared/run-context.test.js`

**Interfaces:**
- Produces: `newRunContext(fields)`, `NO_OVERRIDES`, `NO_TEST` (section "The context"); `storeContext(opts)`;
  `w.ctx(opts = { withPlan: false })` → `storeContext(opts)` loaded through the world (`#country` path:
  `us/core/projection/store-context.js` or `canada/...`).

- [ ] **Step 1: Write the failing test** `run-context.test.js`: `newRunContext({ inputs: s, taxYear: 2026 })` has exactly
  the keys `['inputs','taxYear','taxFactors','plan','planMode','overrides','stats','test']` in that order
  (`toStrictEqual(Object.keys(...))`), defaults `null`, `null`, `null`, `'off'`, `NO_OVERRIDES`, (US) the sinks / (Canada)
  `null`, `NO_TEST`; `(await w.ctx()).inputs` is the store's `state` (`toBe`), `.taxYear` is 2026; US with
  `w.setTaxYear(2027)`: `.taxYear` is 2027; US `w.ctx({ withPlan: true })` with `cliffGuardEnabled: false` gives
  `plan: null, planMode: 'off'`.
- [ ] **Step 2: Run it** (`npx vitest run tests/unit/shared/run-context.test.js`). Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the three modules and the two facades; `store-context.js` (US) imports `planForState`
  from `src/us/core/cliff-plan/planning.js` (Task 5 moves it there; until then import it from
  `projection/run-projection.js`). Add both store-context files to `adapters` in `tests/engine-purity.json`.
- [ ] **Step 4: Run** the test, `node tests/country_contract.js`, `node tests/engine_purity.js`, `npm run analyze`.
  Expected: PASS; module map regenerated.
- [ ] **Step 5: Commit** (`feat(core): run context and store contexts`).

### Task 5: `runProjection(ctx, opts)` and planning above the engine

**Files:**
- Modify: `src/us/core/projection/run-projection.js`, `src/canada/core/projection/run-projection.js`,
  `src/shared/core/projection/simulate.js`, `src/shared/core/projection/year-sources.js`,
  `src/us/core/cliff-plan/planning.js`, `src/us/core/projection/engine-state.js`, `src/shared/core/inputs/estimates.js`
  (if it calls the engine directly), `src/us/ui/install-test-hooks.js`, `src/shared/ui/install-test-hooks.js`,
  every other caller of `runProjection` / `planForState` / `computeCliffPlan` / the year sources
  (`grep -rn "runProjection(\|planForState(\|computeCliffPlan(\|YearSource(" src tests`),
  `tests/unit/helpers/engine.js`, `tests/unit/helpers/us-plan.js`, `tests/engine-purity.json`
- Create: `src/shared/core/projection/runs.js`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `runProjection(ctx, { mode, source, retireAgeA, retireAgeB, trace = null, planTrace = null })` (both countries).
    It reads `ctx.plan` / `ctx.planMode` (US) and never calls `planForState`.
  - `computeCliffPlan(ctx)` → `{ plan, report }` (US, stays in `run-projection.js`): its runs use
    `newRunContext({ ...ctx-fields, taxFactors: null, plan, planMode })` instead of saving and restoring `histTaxFactors`.
  - `planForState(inputs)`, `refreshCliffPlan()`, `ensureTestPlan()`, `cliffPlanCache`, `CLIFF_PLAN_CACHE_MAX` in
    `src/us/core/cliff-plan/planning.js` (moved; `planForState`'s body unchanged except that it compares and
    stringifies its argument instead of `state`, and plans with `computeCliffPlan(newRunContext({ inputs, taxYear: currentYear, overrides: <the store overrides>, stats, test }))`).
  - `standardYearSource(inputs)`, `historicalYearSource(inputs, rowFn, taxFactors)` (writes `taxFactors[year]`).
  - `simulateWith(ctx, retireAgeA = ctx.inputs.retireAgeA, retireAgeB = ctx.inputs.retireAgeB)` and
    `simulateHistoricalWith(ctx, rowFn, retireAgeA = …, retireAgeB = …)` in `runs.js` (pure; the historical one expects
    `ctx.taxFactors` to be a fresh array).
  - `simulate`, `simulateHistorical`, `runHistoricalCycles`, `runMonteCarlo` keep their signatures in `simulate.js`:
    `simulate(a, b)` = `simulateWith(storeContext(), a, b)`; `simulateHistorical(rowFn, a, b)` builds
    `storeContext({ taxFactors: [] })` and, **until Task 7 removes the legacy reader**, also does
    `assignHistTaxFactors(ctx.taxFactors)` around the run and restores the previous value (exactly today's
    save/restore), so the unconverted `taxIndexFactor` still sees the run's factors.

- [ ] **Step 1: Run the ratchet and parity baselines** (`npm run test:unit`, build, keep a copy of `dist/` as
  `<scratch>/stage2-before`).
- [ ] **Step 2: Change the boundary** as listed. Inside `runProjection` the year loop still reads `state` (the same
  object as `ctx.inputs` when the adapter built the context); only `planForState`, `testHooks` (→ `ctx.test` /
  `ctx.stats.hooks`), `magiStats` / `planStats` writes (→ `ctx.stats.magi` / `.plan`), `currentYear` passed to
  `inheritedLedger` (→ `ctx.taxYear`) and `histTaxFactors` / `assignHistTaxFactors` move to the context in this task.
  Order inside `simulateHistorical` (US): plan first (`storeContext()` calls `planForState`, which may run nested
  standard projections with `taxFactors: null`), then the fresh `taxFactors` array, as today.
- [ ] **Step 3: Update the test helpers and hooks** so every hook and helper keeps its old signature and behavior:
  `tests/unit/helpers/engine.js` `accountTrace` builds `storeContext({ taxFactors: hist ? [] : null })` and calls
  `runProjection(ctx, {...})` (keeping the legacy `assignHistTaxFactors` save/restore until Task 7);
  `tests/unit/helpers/us-plan.js` and `src/us/ui/install-test-hooks.js` (`__test_runPlanMode`, `__test_planTrace`,
  `__test_rowFnFor`, `__test_planForState(s)`) build their context with the plan mode they pass today (keep
  `us-plan.js` in step with the installer, as its header says).
- [ ] **Step 4: Update the registry**: add `src/shared/core/projection/simulate.js` and `src/us/core/cliff-plan/planning.js` to
  `adapters` (they are the store-reading layer above the engine); remove `cliffPlanCache` / `CLIFF_PLAN_CACHE_MAX` from `engine-state.js`'s
  entries (now in `planning.js`, which is listed in `adapters`); `stillReaching` loses whatever no longer reaches the
  store (expected: none yet, the engine still imports `state`).
- [ ] **Step 5: Verify.** `npm test` (exact); `node tests/plan_off_anchor.js --base <main worktree>`;
  `node tests/analysis_parity.js --base <stage 1 tree>`; `node tests/bench_runs_interleaved.js --base <scratch>/stage2-before --rounds 15`;
  `node tests/bench_canada.js --base <scratch>/stage2-before`. Expected: all identical, timing within the gate.
- [ ] **Step 6: Commit** (`refactor(core): runProjection takes a run context; planning moves above the engine`).

**Stage 2 end:** stop and report to the owner (PR 2).

---

## Stage 3 (PR 3): the context through the engine, one folder per task

Every task in this stage follows the same procedure; the task lists only its files and its signature changes.

**Procedure (each task):**
1. A function in the task's files that reads `state`, `currentYear`, `CURRENT_YEAR` (Canada, inside the engine),
   `histTaxFactors`, `optimizerState`, `testHooks`, `magiStats` or `planStats`, or calls a function that now takes a
   context, gains `ctx` as its first parameter and reads `ctx.inputs.<field>` / `ctx.taxYear` / … instead. A function
   that needs only one or two plain values may take those instead of the context when every caller has them (the
   implementer's call; TypeScript, item 5, narrows the rest).
2. Callers: a caller that already has a context passes it; a caller in an engine module not converted yet passes
   `LIVE_CTX` (import from `#country/core/seam-LIVE_CTX` in shared code, the country's `live-context.js` otherwise);
   a `ui/` caller passes `storeContext({ withPlan: false })` (allocates; UI only); a `window.__test_*` hook keeps its
   old signature and supplies the context itself.
3. Tests: a Vitest test that calls a changed function directly gets `const ctx = await w.ctx();` and the argument; no
   other change. Playwright tests change nowhere (the hooks keep their signatures).
4. Remove the module's store imports when nothing in it reads them; update `stillReaching` and `mutables` in
   `tests/engine-purity.json`; `npm run analyze`.
5. Verify: `npm run test:unit` (both projects), `npx vitest run --sequence.shuffle`, `npm test` (exact), then commit
   (`refactor(core): <folder> takes the run context`). Benchmarks run at the stage end, not per task.

### Task 6: The `LIVE_CTX` bridge

**Files:** Create `src/us/core/projection/live-context.js`, `src/canada/core/projection/live-context.js`,
`src/us/core/seam-LIVE_CTX.js`, `src/canada/core/seam-LIVE_CTX.js`; Modify `tests/engine-purity.json`.

**Interfaces:** Produces `LIVE_CTX` (section "The context"). It imports only store modules (no engine module), so
importing it from the engine never makes a cycle.

- [ ] **Step 1:** Add a Vitest case to `tests/unit/shared/run-context.test.js`: after `w.setState(p)`,
  `LIVE_CTX.inputs` is the store's `state`; after `w.setState(q)`, it is the new one (`toBe`); US `LIVE_CTX.taxYear`
  follows `w.setTaxYear`. Run: FAIL.
- [ ] **Step 2:** Implement; run the test, `node tests/country_contract.js`. Expected: PASS. Commit.

### Task 7: Tax factors and the tax year (`year-factors.js`, `federal-rules.js`'s `taxYearOf`)

**Files:** `src/shared/core/projection/year-factors.js`, `src/us/core/tax/federal-rules.js` (`taxYearOf` only), every
caller (`grep -rn "taxIndexFactor(\|taxYearOf(\|medicalGrowth(\|getBondYears(" src tests/unit`: about 38 + 16 + their
callers), `src/shared/core/projection/simulate.js` and `tests/unit/helpers/engine.js` (drop the legacy
`assignHistTaxFactors` save/restore), `src/shared/core/tax-factors.js` (delete when no reader is left), `tests/state_modules.js`
(drop its `tax-factors.js` checks if the module is deleted), CLAUDE.md lines that name `histTaxFactors` (updated in Task 16).

**Signatures:** `taxIndexFactor(ctx, yearIndex)` (historical array `ctx.taxFactors` first, then the memo keyed on
`ctx.inputs.inflation`, same doubles: the spike's `taxIndexFactorC`); `taxYearOf(ctx, yearIndex)`;
`medicalGrowth(ctx, year)`; `getBondYears(inputs)`. `CURRENT_YEAR` stays (a load-time constant for chart labels; the
engine reads `ctx.taxYear`).

- [ ] Steps: the stage 3 procedure. Extra check: `tests/unit/us/tax-caches.test.js` passes unchanged except for the
  added argument (it is the memo's exactness guard).

### Task 8: `tax/` and `benefits/`, both countries in one commit

**Files:** US `src/us/core/tax/{federal-rules,federal-tax,state-tax,state-rules,social-security-tax}.js`; Canada
`src/canada/core/tax/{tax,rules,province-rules}.js`, `src/canada/core/benefits/benefits.js`; the shared
`src/shared/core/withdrawals/draws.js` (`drawTaxable` calls `taxFor` through the seam); every caller of a changed
function (`grep -rn "taxFor(\|personTaxCA(\|provincialTaxCA(\|federalTaxCA(\|incomeTaxCA(\|benefitsFor(\|solvePensionSplit(\|stateIncomeTax(\|ordinaryTax(\|longTermGainTax(\|standardDeduction(" src tests/unit`).

**Signatures:** `taxFor(ctx, profile, gains = 0, traditionalExtra = 0)` in both countries; the US deduction, bracket,
credit, QBI and state functions take `ctx` first where they read the tax year or factors (the spike's set:
`seniorDeduction`, `saltCap`, `itemizedDeduction`, `standardDeduction`, `federalDeduction`, `ordinaryTax`,
`longTermGainTax`, `childCredits`, `federalLiabilityForState`, `qbiDeduction`, `stateIncomeTax`, `stateRuleForYear`,
plus `investmentIncome`, `filingStatusFor`, `selfEmploymentTax`, `payrollTax`, `wageFica` if they read a context
field); `stateRuleFor(code)` stays code-keyed (memo). Canada: `personTaxCA`, `provincialTaxCA`, `federalTaxCA`,
`incomeTaxCA`, `benefitsFor`, `solvePensionSplit`, `payrollItems`, `quebecRamq` and the rest take `ctx` where they read
`state.province`, the tax factor or the year; the province comparison is `ctx.inputs.province === 'on'` (hot-path rule).

- [ ] Steps: the stage 3 procedure. The `profile` gets no context field (spec section 3, spike finding). The Canada
  `tax-brackets.test.js` (about 145 direct calls) changes only by the added argument; review that diff with
  `git diff --word-diff` and check no number changed.

### Task 9: `healthcare/` (US)

**Files:** `src/us/core/healthcare/{aca,irmaa,medicaid-rules}.js` and callers. `testHooks.irmaaInYearCalls++` →
`ctx.stats.hooks.irmaaInYearCalls++` (with `ctx.stats` null-checked only if a caller can pass a context without stats:
`storeContext` always has them in the US, so no check). `medicaidLimitCache` stays (memo). `hasChildAtMost(inputs, maxAge, taxYear)`.

- [ ] Steps: the stage 3 procedure.

### Task 10: `income/` (US, Canada, shared)

**Files:** `src/us/core/income/{contributions,distributions,social-security,streams-and-lumps,year-stages,inherited}.js`,
`src/canada/core/income/year-stages.js` (its five `CURRENT_YEAR` reads → `ctx.taxYear`),
`src/shared/core/income/{pension-income,projected-expense,spending-and-loans}.js`, `src/shared/core/inputs/lists.js`
(`dependentsInYear` if the engine calls it with the store: `dependentsInYear(inputs, taxYear)`), and callers. Split
into two commits (US, then Canada + shared) if the diff is large. Scratch objects (`STREAM_PLAN`, `SOLO_PLAN`,
`STREAM_OUT`, `LUMP_OUT`, `INH_OUT`, `INH_CTX`, `STREAM_CTX`, `COVER_CTX`, `PLAN_REQ`) stay; `INH_CTX.year` reads
`ctx.taxYear`.

- [ ] Steps: the stage 3 procedure.

### Task 11: `accounts/` and `withdrawals/` (US, Canada, shared)

**Files:** `src/us/core/accounts/{account-ledger,penalty-status}.js`, `src/us/core/withdrawals/{roth-conversion,strategies,draws,mix}.js`,
`src/canada/core/withdrawals/{strategies,rrsp-meltdown}.js`, `src/shared/core/withdrawals/draws.js`, and callers.
`optimizerState.rothBracketByAge` → `ctx.overrides.rothBracketByAge` (`roth-conversion.js`),
`optimizerState.withdrawalMixByAge` → `ctx.overrides.withdrawalMixByAge` (`strategies.js`);
`testHooks.inhTakeCount++` → `ctx.stats.hooks.inhTakeCount++` (`draws.js`). The withdrawal object `wd` may carry the
context (`newWithdrawal(ctx, ...)` sets `wd.ctx`) since every take/draw already receives `wd`; it is built once per year,
so it adds no per-call allocation (implementer's call versus a parameter).

- [ ] Steps: the stage 3 procedure.

### Task 12: `cliff-plan/`, `projection/` and the rest of `runProjection`

**Files:** `src/us/core/cliff-plan/solver.js` (`lambdaEstimate({ ..., ctx })`; `LAMBDA_PROFILE` keeps no context:
`taxFor(ctx, P, …)`), `src/us/core/projection/{run-projection,balances}.js`, `src/canada/core/projection/{run-projection,balances}.js`,
`src/shared/core/projection/guardrails.js`, `src/us/core/projection/engine-state.js` (`magiStats`, `planStats` stay
there as the US stats sinks; registry kind `counter`), and any engine module still on `stillReaching`. Every `state.x`
in the year loops becomes `inputs.x` with `const inputs = ctx.inputs` at the top of `runProjection`.

- [ ] **Step 1:** The stage 3 procedure for these files.
- [ ] **Step 2:** `grep -rln "seam-LIVE_CTX\|live-context.js" src/*/core src/shared/core` lists no engine module
  (analysis and optimizer modules may still use it until Stage 4; UI none). `stillReaching` holds only analysis,
  optimizer and the modules Stage 4 converts (`format/charts.js` through `displayValue`).
- [ ] **Step 3 (stage gate):** `npm test`; `node tests/plan_off_anchor.js --base <main worktree>`;
  `node tests/analysis_parity.js --base <stage 1 tree>`; `node tests/bench_runs_interleaved.js --base <stage 2 tree> --rounds 15`;
  `node tests/bench_runs_interleaved.js --base <stage 2 tree> --household appeal`; `node tests/bench_canada.js --base <stage 2 tree>`;
  `node tests/bench_heavy.js` in both trees. Expected: exact, parity identical, timing within the gate.
- [ ] **Step 4:** Commit. **Stage 3 end:** stop and report to the owner (PR 3).

---

## Stage 4 (PR 4): the callers

### Task 13: `displayValueOf`

**Files:** Create `src/shared/core/format/display-value.js`; Modify `src/shared/core/format/charts.js`
(`displayValue(n, yearIndex)` = `displayValueOf(mode, state.inflation, n, yearIndex)`); Test
`tests/unit/shared/display-value.test.js`.

**Interfaces:** Produces `displayValueOf(mode, inflation, n, yearIndex)` → `mode === 'real' ? n / Math.pow(1 + pct(inflation), yearIndex) : n`
(the same expression as today, `pct` from `format/numbers.js`).

- [ ] **Step 1:** Test: `displayValueOf('nominal', 3, 1000, 5)` is `1000`; `displayValueOf('real', 0, 1000, 5)` is `1000`;
  `displayValueOf('real', 3, 1000, 2)` equals `1000 / Math.pow(1.03, 2)` computed in the test from literals
  (`toBe`); after `w.setState({ inflation: 3 })` and `assignMode('real')`, `displayValue(1000, 2)` is
  `displayValueOf('real', 3, 1000, 2)`. Run: FAIL.
- [ ] **Step 2:** Implement; run; commit.

### Task 14: The analysis code (core) on copies

**Files:** `src/us/core/analysis/{sensitivity-levers,shortfall-drivers,decision-compare}.js`,
`src/canada/core/analysis/{sensitivity-levers,shortfall-drivers,decision-compare,estate}.js`,
`src/shared/core/analysis/decisions.js`, `src/shared/core/projection/simulate.js` (`simulateAtRealCagr`),
`src/us/core/cliff-plan/planning.js` and `src/canada/core/projection/store-context.js` (add `variantContext`),
the facades `src/<country>/core/seam-variantContext.js`, `src/shared/ui/charts/tornado.js`, and the Task 3 hook.

**Interfaces:**
- Produces `variantContext(base, variant, opts = {})` (both countries; US in `store-context.js` next to `storeContext`):
  a context for `variant` whose plan follows today's rule (spec section 6):
  ```js
  // US. base: the inputs object the caller started from; variant: a shallow copy (or base itself).
  plan = base === cliffPlanStore.forState && cliffPlanStore.year === currentYear ? cliffPlanStore.plan : planForState(variant);
  ```
  then `newRunContext({ inputs: variant, taxYear: currentYear, plan, planMode: plan ? 'apply' : 'off', overrides: opts.overrides ?? <store overrides>, stats, test })`.
  Canada: no plan, `taxYear: CURRENT_YEAR`.
- Lever shape (both countries): `{ id, label, run(base, endValue) }` → `{ decrease, increase }`, where `run` builds each
  variant as `{ ...base, field: value }` (the retirement-age lever passes ages to `simulateWith` with
  `variantContext(base, base)`), and `endValue(sim, inputs)` receives the variant's inputs.
- `computeSensitivity(selected, base, displayMode)` in `tornado.js`: `endValue = (sim, inputs) => displayValueOf(displayMode, inputs.inflation, …)`.
- `findMinimalSpendingCut(selected, base, displayMode)`, `findMinimalRetirementDelay(selected, base, displayMode)`,
  `fiMultiple(inputs)`, `decisionEndAssets(sim, inputs, displayMode)`, `decisionDeltaPhrase(fromSim, toSim, inputs, displayMode)`,
  `analyzeShortfallDrivers(selected, base)`, `renderDecisionCompareTable(rows, inputs, displayMode)`,
  `simulateAtRealCagr(base, realCagrPct)`, Canada `afterTaxEstate(sim, inputs)` (exact parameter lists are the
  implementer's call where a function needs fewer; the display mode is always an argument, never read from the store).
  The UI callers pass `state` and `mode` from the store.

- [ ] **Step 1:** Convert the lever arrays and the analysis functions; no `state.x =` remains in `src/*/core` or
  `src/shared/core` (`grep -rnE "\bstate\.[A-Za-z_]+(\[[^]]*\])?\s*(=[^=]|\+=|-=)" src/*/core src/shared/core` prints only
  `inputs/` normalization code).
- [ ] **Step 2:** Update the Task 3 hook to the new signatures (same bundle shape).
- [ ] **Step 3:** Verify: `npm test`; `node tests/analysis_parity.js --base <stage 1 tree>` (both refresh and
  no-refresh passes identical). Commit.

### Task 15: The optimizers and the UI variant sites

**Files:** `src/us/core/optimizer/{multi-lever,roth-schedule}.js`, `src/us/ui/results/{roth-optimizer,decision-questions}.js`,
`src/canada/ui/results/{roth-optimizer,decision-questions}.js`, `src/us/ui/install-test-hooks.js` (`__test_optimizeMultiLever`,
`__test_optimizeRothLadderPerYear`, `__test_rothScheduleCost`, `__test_setOptimizerBudget`), `tests/unit/helpers/*` if a
helper calls them.

**Interfaces:**
- `optimizeMultiLever(base, options, { budget, displayMode })`, `optimizeRothLadderPerYear(base, …, { budget, displayMode })`:
  each trial runs `simulateWith(variantContext(base, trialInputs, { overrides: { rothBracketByAge, withdrawalMixByAge } }))`
  where `trialInputs` is `{ ...base, rothConvEnabled: …, rothConvBracket: …, smoothWithdrawals: … }`; no write to
  `state` or `optimizerState`. `budget` replaces the read of `optimizerState.rothPerYearEvalBudget` (the UI and the
  hook pass `optimizerState.rothPerYearEvalBudget`); `optimizerState.lastMultiLeverRun` stays UI state, written by the UI.
- `rothScheduleCost(sim, inputs, displayMode)`.
- `decision-questions.js` (both): each `run()` builds copies of `state` (`{ ...state, tenure: 'own' }`, …) and runs
  `simulateWith(variantContext(state, copy))`; `computeRothOptimizer` (both) likewise.
- `roth-optimizer-controls.js` is not changed (an input write, item 6).

- [ ] **Step 1:** Convert; `grep -rnE "\bstate\.[A-Za-z_]+\s*(=[^=]|\+=|-=)" src/us/ui/results src/canada/ui/results` prints
  only `roth-optimizer-controls.js`.
- [ ] **Step 2:** Verify: `npm test`; `node tests/analysis_parity.js --base <stage 1 tree>`; `node tests/solver_gap.js`
  (expect the same table as on the stage 1 tree). Commit.

### Task 16: Enforce the guard, remove the bridge, update the docs

**Files:** delete `src/*/core/projection/live-context.js` and `src/*/core/seam-LIVE_CTX.js` (nothing imports them);
`tests/engine-purity.json` (`stillReaching` empty for both countries; Check A now means "no engine module reaches the
store"); CLAUDE.md; `docs/roadmap.md`; `docs/superpowers/inventory/module-map.md` (`npm run analyze`).

- [ ] **Step 1:** Delete the bridge; `node tests/engine_purity.js`. Expected: `0 modules reach the store`, exit 0.
- [ ] **Step 2:** CLAUDE.md: in "Architecture, per planner file" describe `runProjection(ctx, opts)`, the run context
  and its fields, `storeContext` / `variantContext`, `simulateWith`, and that `planForState` is above the engine; replace
  every mention of `histTaxFactors` (gone) and of the engine reading `state`; "Shared state and country seams": the
  adapters are the only engine-side readers of the store, the new seam names (and the seam count); "Where new code goes":
  a new engine function takes `ctx` first, never imports a store module; "Where a new test goes": `w.ctx()`; the files
  list: `tests/engine_purity.js`, `tests/analysis_parity.js`, `engine-ratchet.test.js`; the hot-path rules: the
  context and the registry. `docs/roadmap.md`: item 4 done, with the spec and plan paths. README and the version badges
  do not change (no user-facing change).
- [ ] **Step 3 (stage gate):** `npm test`; `node tests/plan_off_anchor.js --base <main worktree>`;
  `node tests/analysis_parity.js --base <stage 1 tree>`; the three benchmarks against the stage 3 tree; `node tests/doc_paths.js`.
- [ ] **Step 4:** Commit. **Stage 4 end:** stop and report to the owner (PR 4).
