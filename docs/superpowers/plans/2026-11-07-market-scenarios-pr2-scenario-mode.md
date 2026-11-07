# Market scenarios PR 2: scenario mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a market scenario something the planner can enter and leave. Run and Revert, the snapshot, autosave, undo, load
and reset, the saved-scenarios guard, the banner, the notes, and today's dollars and optimizer pricing on the scenario's own
inflation, in both planners. No card yet (PR 3); Run is reached through an exported function, a test hook and the banner's Revert.

**Architecture:** The scenario's price path depends only on the inputs. So one helper, `scenarioFactorPath(inputs)`, builds it,
and `runSourceFor` pre-fills each scenario run's `taxFactors` with it. A new `pricingContextFor(ctx)` gives every pricing site
the same array. Scenario rows carry `cumFactor`, as historical rows already do. The display conversion and the objectives
prefer `row.cumFactor` when a row has one. Scenario mode is UI state in two new `src/shared/ui/plans/` modules: a snapshot
binding, and Run/Revert. The autosave, undo, reset, boot-load and saved-scenarios code each learn one rule. With no scenario,
every run, row and display is the very same as today.

**Tech Stack:** Plain ES modules under `src/`, esbuild, Vitest (through `world()`), Playwright root UI scripts.

**Spec:** `docs/superpowers/specs/2026-11-06-market-scenarios-design.md` (sections 4, 6, 7 and 8, plus the Phasing notes for PR 2).
PR 1's topic file is `docs/architecture/market-scenarios.md`.

## Global Constraints

- With no `marketScenario`, every snapshot (US 541, Canada 376) and golden test is unchanged. `npm test` must not need `snapshot:update`.
- `tests/bench_runs_interleaved.js --warm-analysis` shows no regression on the no-scenario path.
- The engine reads only `ctx`. New engine-side helpers take `inputs` or `ctx` and never import a store module. One context shape:
  every context comes from `newRunContext`. A new module-level mutable in an engine module goes into `tests/engine-purity.json`.
- Vitest rules from CLAUDE.md: go through `world()`, use exact `toBe`/`toStrictEqual`, hand-computed literals, no `toBeCloseTo`. Rule 7: a `src` bug found by a test is reported, not fixed.
- UI state: a module-level `let`, assigned only in its own module through an `assign<Name>` function.
- Line 1 of every new module is a one-line `//` purpose comment, then a blank line, then two-space indented bodies. Run `npm run analyze`
  after adding modules.
- Run and Revert are new sanctioned writes to `state`: list them in CLAUDE.md's "State and the sanctioned writes".
- Copy rules: descriptors under about 70 characters; info bubbles for anything longer.
- Mobile check (390×844): `scrollWidth > clientWidth` stays false with the banner shown.
- No version-badge bump and no README change in this PR. Nothing here is reachable by a user without the card, so PR 3 bumps
  both and writes the README (spec Phasing). This is my call.

## Rulings made while planning (record in the ledger)

- **R3, a pre-filled factor path:** `runSourceFor` fills the scenario run's `taxFactors` with the whole path up front
  (`scenarioFactorPath`), not `[]`. The source still writes `taxFactors[year] = factor`, which is the same value. The benefit:
  the state-tax base-year divisor `taxIndexFactor(ctx, by.x - cy)` (`src/us/core/tax/state-tax.js` :40-45, :170) reads a year
  the run has not reached when a rule's base year is after the plan's start. Today that read falls back to the plan's pow.
  With the full path, numerator and divisor come from one series. This settles the open engine report from PR 1.
  If wrong, the cost is a different last bit in scenario runs only; PR 1's run-source test changes its expected `taxFactors`.
- **R4, the factor path length:** 256 years (indexes 0..255, the range of `taxIndexFactor`'s memo). If wrong, years past 255
  fall back to the plan's pow, as they do today.
- **R5, Reset while a scenario is on reverts first:** it restores the snapshot, then runs the normal reset. That way the reset's
  undo returns to the real settings, never into the scenario. The spec says reset discards the snapshot; this keeps the spec's
  property (never half in a scenario) and also keeps reset undoable. If wrong, the cost is small: undoing that reset lands on the
  real settings instead of nowhere.
- **R6, Undo:** Run and Revert clear the single undo slot. A snapshot taken inside the scenario carries `marketScenario`, so
  undo stays inside it. This is the spec's "a simpler equivalent". No cost.
- **R7, the banner is not sticky:** it sits first in `.content`, above the headline row. No `layout-metrics` change. If wrong,
  PR 3 can make it sticky.
- **R8, the applied plan under a scenario:** the fingerprint keeps `marketScenario`, so Optimize's search key and Apply's
  staleness check stay correct inside a scenario. The plan card's status line names the normal-market case: the fingerprint
  without `marketScenario` equals `madeFor`. No engine change.

## Review Focus

1. **A start age below Partner A's age** (crash `age < ageA`, or history `atAge < ageA`). The source starts at plan year 0
   (history mid-path). The banner text must describe what runs, not what was typed (Task 4 test).
2. **The tab closed mid-scenario** (the `pagehide` flush). The page must reopen in the normal planner with the pre-Run settings
   (Task 4 Playwright check).
3. **Undo around the boundary.** Undo after Run, after Revert, and after Reset in a scenario must never leave a live
   `marketScenario` without a snapshot (Task 3 Vitest-free checks in Playwright, Task 4).
4. **Historical rows through the display code.** Historical rows already carry `cumFactor`. A display site that now prefers
   `r.cumFactor` must never see a historical row, or the historical view's figures would change; that is out of scope (Task 2's
   site audit, and the snapshots).
5. **Nominal mode under a scenario** shows nominal figures untouched. The factor applies only in real mode (Task 2 test).

---

### Task 1: The factor path, scenario rows and optimizer pricing

**Files:**
- Modify: `src/shared/core/projection/scenario-source.js` (add `pathFactor: true` to the returned source; add `scenarioFactorPath`)
- Modify: `src/shared/core/projection/run-source.js` (pre-fill, and add `pricingContextFor`)
- Modify: `src/us/core/projection/run-projection.js:3042` and `src/canada/core/projection/run-projection.js:406`
  (`if (isHistorical || source.pathFactor) row.cumFactor = factor;`)
- Modify: `src/us/core/projection/run-projection.js` near :3297 (`runCtx = pricingContextFor(ctxFor('off', null))`, plus the comment above it)
- Modify: `src/us/core/optimizer/plan-search.js:74,80` (`copyCtx` and `priceCtx` through `pricingContextFor`)
- Modify: `src/us/core/optimizer/objectives.js` (`realCost`, `objectiveBreakdown`, `gainInTodaysDollars`: each row's divisor is
  `r.cumFactor ?? Math.pow(1 + infl, r.year)`, in the same expression order otherwise. Update the :7 header comment.)
- Modify: `src/us/ui/results/roth-optimizer.js` (the ctx passed to `endValue.value`), `src/canada/ui/results/roth-optimizer.js`
  (the ctx passed to `afterTaxEstate`), `src/canada/ui/plans/print-report.js:65` (`afterTaxEstate(pricingContextFor(storeContext()), sim)`),
  and the US test hooks `install-test-hooks.js:162,233,236`
- Modify: `tests/unit/shared/run-source.test.js` (the scenario branch's `taxFactors` expectation, R3)
- Test: `tests/unit/shared/scenario-pricing.test.js` (new), `tests/unit/us/scenario-plan.test.js` (extend)

**Interfaces:**
- Consumes: `scenarioYearSource(inputs, taxFactors)`, `runSourceFor(ctx)`, `newRunContext` (PR 1).
- Produces:
  - `scenarioFactorPath(inputs) -> number[]`, length 256. `inputs.marketScenario` must be set. It builds a source on a fresh
    array, calls `yearInputs(y)` then `endOfYear()` for y = 0..255, and returns the array.
  - `pricingContextFor(ctx) -> ctx`. With no scenario it returns the very `ctx`. With one, it returns a `newRunContext` copy of
    every field with `taxFactors: scenarioFactorPath(ctx.inputs)`. It never writes the ctx it is given.
  - Scenario rows carry `cumFactor` (equal to that year's `factor`). Standard rows have no `cumFactor` key.
  - `runSourceFor` is unchanged in shape. Its scenario `ctx.taxFactors` starts as `scenarioFactorPath(inputs)`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/scenario-pricing.test.js` (both projects; follow `run-source.test.js` for setup):
  - `factor path matches the run`: a crash scenario (`{ kind: 'crash', order: 'bucket', crashes: [{ age: ageA + 2, drop: 30,
    fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 8, bondReturn: 4 }] }`). Run it through `runSourceFor` and the
    seam `runProjection`. Assert `run.ctx.taxFactors.length` `toBe(256)`, and for every row `r.cumFactor`
    `toBe(run.ctx.taxFactors[r.year])`. Assert `scenarioFactorPath(inputs)` `toStrictEqual(run.ctx.taxFactors)`.
  - `hand-computed path`: plan inflation 2.5. Indexes 0..2 are `1`, `1.025`, `1.025 ** 2` written as the literal
    `1.050625`, the pow value. Index 2 is the first fall year (inflation 8), so its factor is still the pow. Index 3 is
    `1.050625 * 1.08`, written as `1.1346749999999999`, and index 4 is that times `1.08`. Write each literal by hand and check it
    against `node -p` once while writing. The fall years are 2 and 3, and index 4 multiplies by year 3's inflation.
  - `standard rows have no cumFactor`: no scenario; `Object.hasOwn(row, 'cumFactor')` is `false` for every row. Assert `pricingContextFor(ctx)` `toBe(ctx)`.
  - `pricing context`: scenario on. `pricingContextFor(ctx)` is not `ctx`. Its `taxFactors` `toStrictEqual(scenarioFactorPath(ctx.inputs))`,
    every other field is the very same (`toBe`), and `ctx.taxFactors` is unchanged (still `null`).
  - `realCost uses the row factor` (US): build a two-row sim literal `{ rows: [{ year: 0, tax: 100, healthcare: 0, ... }, { year: 1, cumFactor: 2, ... }] }`
    with exactly the fields `rowCost` reads. Assert `US_OBJECTIVES.lifetimeCost.value(ctx, sim)` `toBe(100 + 50)` for
    `tax: 100` in both rows. With no `cumFactor`, row 1 divides by `1.025` (a separate assertion with its own literal).
- [ ] **Step 2: Run them to see them fail:** `npx vitest run tests/unit/shared/scenario-pricing.test.js` (missing exports, missing `cumFactor`).
- [ ] **Step 3: Implement** the Produces above, the two `row.cumFactor` lines, the objectives divisors and the pricing-site switches.
  `pricingContextFor` takes the same field list as `runSourceFor`'s copy.
- [ ] **Step 4: Extend `tests/unit/us/scenario-plan.test.js`:** under a scenario with high crash inflation, `computeCliffPlan`'s
  report prices through the path. `objectiveBreakdown(pricingContextFor(ctx), sim).endValue` differs from
  `objectiveBreakdown(ctx, sim).endValue` (`not.toBe`), and the plan's `report` figures equal the first (`toBe`) for the
  base row the report exposes. Read `cliff-plan.md` to find that figure. If none is exposed, assert on `plan-search`'s
  `measure` instead.
- [ ] **Step 5: Run** `npm run test:unit`, then `npx vitest run --sequence.shuffle tests/unit/shared/scenario-pricing.test.js`, then `npm test`. Expect green with no snapshot change.
- [ ] **Step 6: Commit** `Market scenarios: the factor path, scenario rows and pricing`.

### Task 2: Today's dollars on the row's factor

**Files:**
- Modify: `src/shared/core/format/display-value.js`: `displayValueOf(mode, inflation, n, yearIndex, factor)` returns
  `mode === 'real' ? n / (factor ?? Math.pow(1 + pct(inflation), yearIndex)) : n`
- Modify: `src/shared/core/format/charts.js:8-9`: `displayValue(n, yearIndex, factor)` passes `factor` through
- Modify: every main-run and variant-row display site, passing the row's `cumFactor` as the new last argument:
  - `us/ui/results/render.js:61,67,84,168,169,171`, `canada/ui/results/render.js:43,49,66,142,143,145`
  - `shared/ui/results/render-plan-headline.js:22`, `plan-status-bar.js:45`
  - `shared/ui/plans/scenario-comparison.js:23,24,32,45`
  - `shared/ui/charts/projection-chart.js:9` (the default `valueFn`)
  - `shared/ui/results/projection-table.js:39`, and :44's threshold factor `(r.cumFactor ?? Math.pow(...))`
  - `shared/ui/plans/cash-flow-table.js:15,46`, `us/ui/results/table-annotations.js:33`
  - `shared/ui/charts/cash-flow-chart.js:61,101`, `us/ui/charts/compute-sankey-flow.js:13`, `canada/ui/charts/compute-sankey-flow.js:15`
  - `us/ui/plans/print-report.js:59,61,68`, `canada/ui/plans/print-report.js:54,56,63,65`
  - `shared/ui/plans/export-and-print.js:18`
  - `us/ui/results/roth-optimizer.js:81,82,84,182`, `canada/ui/results/roth-optimizer.js:21,23,24`
  - `shared/ui/charts/tornado.js:22,35`, `shared/core/analysis/decisions.js:23`, `us/core/analysis/decision-compare.js:23`, `canada/core/analysis/decision-compare.js:23`
  - the display test hooks `shared/ui/install-test-hooks.js:172`, `canada/ui/install-test-hooks.js:12`
- Test: `tests/unit/shared/display-value.test.js` (extend)

**Interfaces:**
- Consumes: Task 1's `row.cumFactor` on scenario rows only.
- Produces: `displayValueOf(mode, inflation, n, yearIndex, factor?)` and `displayValue(n, yearIndex, factor?)`. With `factor`
  undefined, the result is the very double it is today.

- [ ] **Step 1: Write the failing tests** in `display-value.test.js`: `displayValueOf('real', 2.5, 1000, 3, 2)` `toBe(500)`;
  `displayValueOf('nominal', 2.5, 1000, 3, 2)` `toBe(1000)`; `displayValueOf('real', 2.5, 1000, 1, undefined)` `toBe(1000 / 1.025)`
  (the same expression the test file already uses for the existing case).
- [ ] **Step 2: Run** to see the first one fail.
- [ ] **Step 3: Implement** the two signatures, then pass `r.cumFactor` (or `row.cumFactor` / `rows[i].cumFactor`, whichever
  row is in scope) at every site above. **Site audit (Review Focus 4):** for each site, confirm in the report that its rows
  come from `simulate()` / `simulateWith` / a variant run, never `runHistoricalCycles` or Monte Carlo. If a site can receive
  historical rows, leave it unchanged and list it. Grep `displayValue(` and `displayValueOf(` once more after editing; every
  call that has a row in scope passes its factor. List any call left without one, with the reason.
- [ ] **Step 4: Run** `npm run test:unit` and `npm test`. Expect green with no snapshot change: no standard row has `cumFactor`.
- [ ] **Step 5: Commit** `Market scenarios: today's dollars on the row's own factor`.

### Task 3: Scenario mode (Run, Revert, the snapshot, autosave, undo, reset, load, saved scenarios)

**Files:**
- Create: `src/shared/ui/plans/market-scenario-snapshot.js`: `export let scenarioSnapshot = null;` and
  `export function assignScenarioSnapshot(s)`. Purpose line: "The market scenario's revert snapshot (the real settings while a scenario is on)".
- Create: `src/shared/ui/plans/market-scenario-mode.js`: `runMarketScenario(raw) -> boolean`, `revertMarketScenario() -> boolean`.
  Purpose line: "Market scenario mode: Run and Revert".
- Modify: `src/shared/ui/plans/undo.js` (export `clearUndo()`: hides the toast and drops the slot; `hideUndoToast` already does both)
- Modify: `src/shared/ui/plans/autosave.js:22` (write the snapshot when there is one)
- Modify: `src/shared/ui/plans/saved-plan.js:48` (boot load drops `marketScenario`)
- Modify: `src/shared/ui/plans/reset-plan.js` (R5: revert first)
- Modify: `src/shared/ui/plans/scenarios.js` (strip on save :25, import :62 and load :33; disable the controls while on)
- Modify: `src/shared/ui/install-test-hooks.js` (`__test_runMarketScenario(raw)`, `__test_revertMarketScenario()`,
  `__test_marketScenarioSnapshot()` returning a JSON clone or null)
- Modify: CLAUDE.md "State and the sanctioned writes" (add `market-scenario-mode.js`'s Run and Revert)

**Interfaces:**
- Consumes: `normalizeMarketScenario` (PR 1), `state` / `assignState` (`store.js`), `cloneState`
  (`core/analysis/scenario-helpers.js`), `normalizeState` (`#country/ui/seam-normalizeState`), `render`
  (`#country/ui/seam-render`), `syncControls` (`#country/ui/seam-syncControls`), `syncContributionControls`
  (`shared/ui/inputs/sync-contribution-controls.js`, as `undo.js` imports it), `saveInputs`.
- Produces:
  - `runMarketScenario(raw)`:
    - Normalize `raw`. If invalid, or a scenario is already on, return `false` and change nothing.
    - Otherwise: snapshot `cloneState(state)` with `marketScenario` deleted from the clone, and `assignScenarioSnapshot` it.
    - `assignState(normalizeState({ ...cloneState(state), marketScenario: ms }))`.
    - Then `clearUndo()`, `render()`, `saveInputs()`, and return `true`.
  - `revertMarketScenario()`:
    - No snapshot: return `false`.
    - Otherwise: `assignState(snapshot)`, `assignScenarioSnapshot(null)`, `clearUndo()`, `syncControls()`,
      `syncContributionControls()`, `render()`, `saveInputs()`, and return `true`.
  - `scenarioSnapshot` (a live import) is the single "is a scenario on" test for the UI. Never read `state.marketScenario` for that.

- [ ] **Step 1: Implement the two modules and `clearUndo`.** The snapshot module imports nothing, so `autosave.js` can import it with no cycle.
- [ ] **Step 2: Autosave:** `JSON.stringify({ state: scenarioSnapshot ?? state, mode })`.
- [ ] **Step 3: Boot load:** after `normalizeState(saved.state)`, delete `marketScenario` from the result before `assignState`
  (a hand-edited or old save must never open in a scenario; spec anti-goal 1).
- [ ] **Step 4: Reset (R5):** in the click handler, after the confirm and before `snapshotForUndo`, call `revertMarketScenario()`. Its
  render is redundant but harmless; keep the code simple.
- [ ] **Step 5: Saved scenarios:**
  - Strip `marketScenario` from the cloned state on save, from each imported state after `normalizeState`, and from the state
    `loadScenario` assigns.
  - While `scenarioSnapshot` is set, `renderScenarioList` disables `#saveScenarioBtn`, `#importScenarioBtn`,
    `#exportAllScenariosBtn` and each row's Load and Export buttons.
  - It shows the note "Revert the market scenario first" in a new `<small id="scenarioLockNote" hidden>` inside the Scenarios
    card in `src/shared/partials/fieldSearch.html`.
  - `importScenarioFile` and `loadScenario` return early while on.
  - `renderScenarioList` must also run on Run and Revert: call it from both functions after `render()`.
- [ ] **Step 6: Test hooks** as listed. The comparison table's live row label reads "Current (market scenario)" while on (`scenario-comparison.js`).
- [ ] **Step 7: Run** `npm run build`, `npm test`. Run/Revert itself is tested in Task 4's UI script; this task's commit must leave everything green.
- [ ] **Step 8: Commit** `Market scenarios: scenario mode (Run, Revert, autosave, undo, reset, saved scenarios)`.

### Task 4: The banner, the notes, the report and CSV, the plan card, the UI script and the docs

**Files:**
- Create: `src/shared/core/format/market-scenario-text.js`: `describeMarketScenario(ms, inputs, currentYear) -> string`.
  Purpose line: "The one-line description of a market scenario (banner, report, CSV)".
- Create: `src/shared/partials/marketScenarioBanner.html`: `<div id="marketScenarioBanner" class="callout" role="status" hidden><span id="marketScenarioBannerText"></span> <button type="button" id="marketScenarioRevertBtn">Revert</button></div>`.
  Include it first in `.content` in `src/us/index.html:208` and `src/canada/index.html:152` (`<!-- @@include marketScenarioBanner -->`).
- Create: `src/shared/ui/results/market-scenario-banner.js`: `renderMarketScenarioBanner()` and `wireMarketScenarioBanner()`
  (the Revert click calls `revertMarketScenario()`). Purpose line: "The market scenario banner and its Revert button".
  Call `renderMarketScenarioBanner()` from US `renderBody` next to `renderShortfallBanner` (render.js:153) and from Canada `render` (:129).
  Call `wireMarketScenarioBanner()` from both `main.js` IIFEs where the other plan wiring runs.
- Modify: `src/shared/partials/chartRotateHint.html` (a `<small class="ms-note" hidden>` in `#histSuccessCard` and in
  `#mcSuccessCard`, text "Ignores the market scenario: these runs bring their own markets."). US and Canada `chart-view.js`
  show it in the historical and Monte Carlo branches while `scenarioSnapshot` is set.
- Modify: both `print-report.js` (a `<p class="pr-meta">Market scenario on: {text}. Every number below assumes it, in today's
  dollars on the scenario's own inflation.</p>` after the existing `pr-meta`, only while on)
- Modify: `shared/ui/plans/export-and-print.js:20` (while on, one first line `"Market scenario on: {text}"` before the header; unchanged otherwise)
- Modify: `src/us/ui/results/plan-optimizer.js` `renderPlanOptimizerStatus` (R8). While on, if
  `storedPlanFingerprint({ ...state, marketScenario: undefined })` equals `sp.madeFor`, the status text is "Applied plan made for the
  normal market. Under the scenario it is used only where it beats the scenario's own plan." `fingerprintJson` is unchanged.
- Create: root `test_market_scenario_mode.js` (both planners, `dist/`)
- Modify: `docs/architecture/market-scenarios.md` (a "Scenario mode" section, the factor path, R3-R8, the pricing sites
  moved out of "Known approximations", the PR 2 line in "What PR 2 and PR 3 still owe" removed), `docs/architecture/inputs-and-ui.md`
  (the autosave, undo and reset rules), `docs/architecture/test-inventory.md`, CLAUDE.md's topic-file line for market scenarios,
  and `npm run analyze`
- Test: `tests/unit/shared/market-scenario-text.test.js` (new)

**Interfaces:**
- Consumes: `scenarioSnapshot`, `revertMarketScenario` (Task 3), `HIST`, `CURRENT_YEAR` (`shared/core/inputs/current-year.js`).
- Produces: `describeMarketScenario(ms, inputs, currentYear)`. The calendar year of age `a` is `currentYear + (a - inputs.ageA)`.
  The ages and years it names are the ones the source runs, after the source's own clamps (Review Focus 1):
  - **A crash**, one per row in the listed order, joined with `"; then "`:
    - `"{drop}% drop at age {A} ({Y}) over {F} year(s)"`, where `A = max(age, ageA)` and `Y` is its calendar year.
    - Then `", no recovery"` when `recoverPct` is 0, `", back on the plan's line over {N} year(s)"` at 100, or
      `", {R}% recovered over {N} year(s)"` otherwise.
    - Then `", inflation {i}% and bonds {b}% a year during the fall"`, with a signed bond (`+20%`, `-18%`).
  - **History:** `"real markets {Y1}–{Y2} at ages {A1}–{A2}, then the plan's rates"`.
    - `A1 = max(atAge, ageA)`, and `Y1 = startYear + (A1 - atAge)`.
    - The last real year `Y2` is the earlier of the data's last year and the year before `endAge`.
    - When the window is empty, the text is `"real markets from {startYear}: no real years fall inside the plan"`.
  - **The order suffix**, always: `"; bonds first in down years"` or `"; your normal withdrawal order"`.
  - "year(s)" is "year" for 1 and "years" otherwise.

- [ ] **Step 1: Write the failing tests** in `market-scenario-text.test.js`:
  - with `ageA` 55 and `currentYear` 2026:
    - `{ age: 60, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, inflation: 0.1, bondReturn: 20 }` with bucket order
      gives `"35% drop at age 60 (2031) over 2 years, 60% recovered over 4 years, inflation 0.1% and bonds +20% a year during the fall; bonds first in down years"`.
    - the same crash at `age: 50` reads age 55 (2026).
    - `recoverPct` 0 and 100 give their phrases.
    - two crashes are joined with `"; then "`.
  - history:
    - `{ startYear: 2008, atAge: 60, endAge: null }` gives `"real markets 2008–{last}"` at ages `60–{60 + last - 2008}`. Take
      `{last}` from `HIST.at(-1)[0]`, read once in the test as data, not from the code under test.
    - `atAge: 50` starts at 2013, age 55.
    - `endAge: 63` ends at 2010, age 62.
    - an empty window gives the empty-window text.
- [ ] **Step 2: Run** to see them fail; **Step 3: implement**; **Step 4: run** to see them pass.
- [ ] **Step 5: Implement the banner, notes, report, CSV and plan-card line** as listed.
- [ ] **Step 6: Write `test_market_scenario_mode.js`.** It loops over both planners, with no fixed waits. It reads
  `window.fireProjectionRows` (or the planner's equivalent the other root scripts read) after `__test_flushRender()`.
  - Before Run: record the rows' JSON and `localStorage[storageKey]`.
  - `__test_runMarketScenario({ kind: 'crash', crashes: [{ age: <ageA + 3>, drop: 40, fallYears: 2, recoverPct: 50, recoverYears: 3, inflation: 9, bondReturn: 2 }] })`
    returns true.
  - While on:
    - The rows differ.
    - The banner is visible and holds the description.
    - The Save scenario button is disabled.
    - The autosaved JSON still equals the recorded one after a field edit plus `__test_flushRender()`. Read `localStorage`
      after the 250 ms debounce with a `waitForFunction` on `#saveStatus`, or flush the save through `pagehide`
      (`page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')))`).
    - The undo toast is hidden.
    - A real-mode tile differs from the same tile under `order: 'standard'` with no inflation change. Optional; drop it if it is
      slow.
  - Reload the page. There is no banner, and the rows equal the pre-Run JSON (Review Focus 2).
  - Run again, then click `#marketScenarioRevertBtn`. The rows equal the pre-Run JSON exactly, the banner is hidden, and
    `__test_marketScenarioSnapshot()` is null.
  - Run again, then Reset (accept the confirm dialog), then click Undo. The state is the pre-Run state with no
    `marketScenario`, and the snapshot is null (Review Focus 3).
  - US only: Apply a plan while on, through the plan card's Optimize and Apply buttons as the existing plan-card root scripts do
    (`grep -l planOptimizer test_*.js`). After Revert, `state.storedPlan` equals its pre-Run JSON.
  - Mobile: at 390×844 with the banner shown, `scrollWidth > clientWidth` is false.
  - Exit 1 on any failure.
- [ ] **Step 7: Docs and module map** as listed; `npm run analyze`.
- [ ] **Step 8: Run** `npm test`, then `node tests/ui_scripts.js test_market_scenario_mode.js`, then `npm run test:ui`, then
  `node tests/bench_runs_interleaved.js --warm-analysis`. All green, and the bench within noise.
- [ ] **Step 9: Commit** `Market scenarios: banner, notes, report, plan card and the scenario-mode UI script`.
