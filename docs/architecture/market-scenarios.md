# Market scenarios

Read before touching `marketScenario`, `scenarioYearSource`, `runSourceFor`, or any code that starts a normal projection run.

Related: [engine.md](engine.md), [cliff-plan.md](cliff-plan.md), [inputs-and-ui.md](inputs-and-ui.md), [test-inventory.md](test-inventory.md), `docs/superpowers/specs/2026-11-06-market-scenarios-design.md`.

Custom crashes or a replayed real-history window laid over the plan's rates, for the normal deterministic run. Both planners; the
US also plans (cliff plan, Optimize) under the scenario. PR 1 built the source; PR 2 added scenario mode (below) and today's dollars on
the path's own factor; PR 3 adds the card that sets one up.

## The input

`inputs.marketScenario` (normalized by `normalizeMarketScenario(raw)`, `src/shared/core/inputs/market-scenario.js`), or absent.
The shape is `{ kind: 'crash' | 'history', order: 'bucket' | 'standard', ... }`:

- `order`: `'standard'` is kept; anything else becomes `'bucket'`.
- `kind: 'crash'`: `crashes`, an array (at most 10 valid rows are kept; invalid rows do not count toward the cap). A row is kept only when every field below is a
  number (a finite number or a non-blank string Number reads as finite; `''`, `null`, `true`, `[]`, `Infinity` are not); a bad row is
  dropped. No row left: off. Clamps: `age` 0-120 (rounded), `drop` 0-95 (percent), `fallYears` 1-10 (rounded), `recoverPct`
  0-100 (percent of the drop recovered), `recoverYears` 1-30 (rounded), `inflation` -15 to 30 (percent a year during the fall),
  `bondReturn` -50 to 50 (percent a year during the fall).
- `kind: 'history'`: `history: { startYear, atAge, endAge }`. `startYear` is rounded and clamped to the first and last year of
  `HIST`; `atAge` is rounded and clamped 0-120; `endAge` is `null` (to the end of the data), or a number rounded and clamped
  0-120. A missing or non-numeric `startYear` / `atAge`, or a non-numeric non-empty `endAge`, turns the scenario off.
- Anything else (not an object, another `kind`, `crashes` not an array, no `history` object): off, returned as `undefined`.

**The key is absent when off.** Both `normalizeState` functions delete `marketScenario` when the normalizer returns `undefined`
(never `null`, `false` or an empty object). The state JSON, `storedPlanFingerprint`, undo snapshots, saved-scenario comparison and every
cache key are then byte-identical to a build without the feature, and `runSourceFor` tests one truthiness. There is no `defaults`
value and no `FIELDS` entry for it.

## The year source

`scenarioYearSource(inputs, taxFactors)` (`src/shared/core/projection/scenario-source.js`) has the contract of
`historicalYearSource` except it has no `startYear`, so `runProjection` treats the run as non-historical (the plan's life
expectancy, the death clamp and the plan search all as in a standard run). `inputs.marketScenario` is already normalized.
`taxFactors` is the caller's own fresh array; the source writes `taxFactors[year] = factor` each year.

`yearInputs(year)` returns `{ stockReturn, bondReturn, bondYield, factor, limitFactor }`. Year `t` is the offset from the first
plan year, so `t0 = max(0, round(crash.age - ageA))` for a crash and `histT0 = round(atAge - ageA)` for history. Evaluation order:

1. **Start from the plan's rates:** stock `r`, inflation `planInfl`, bond `planBond`, yield `planBond` (all fractions).
2. **Crash (kind `crash`).** A crash's level `q(t)` is 1 before `t0`; during the fall (`t0 <= t < t0 + fallYears`) it is
   `(1 - drop)^((t - t0 + 1) / fallYears)`; through the recovery it climbs from `1 - drop` toward
   `qEnd = 1 - drop * (1 - recoverPct)` by `(1 - drop) * (qEnd / (1 - drop))^((t - t0 - fallYears + 1) / recoverYears)`;
   the last recovery year and every year after is `qEnd` itself (never the pow form's rounded value). Levels multiply across
   crashes, taken in a fixed sorted order (age, drop, fallYears, recoverPct, recoverYears) so the list order never changes the
   float result. The year's stock return is the plan's return scaled by the level ratio, `(1 + r) * qNow / qPrev - 1`, only when the
   ratio differs from 1 (otherwise exactly `r`). Inflation and bond return are overridden during a crash's fall years (in the
   listed order, so a later crash wins an overlap).
3. **History (kind `history`; steps 2 and 3 are exclusive).** The `HIST` row at index `startYear - HIST[0][0] + (year - histT0)` replaces stock, inflation and bond when
   `year >= histT0`, the index is inside `HIST`, and `endAge` is null or `ageA + year < endAge`. Outside that window the year is the
   plan's. The yield is the row's yield when it has one, else `max(0, bond)` (the **yield rule**, as the historical run applies it);
   a crash's years keep the plan's bond return as the yield.
4. **The inflation factor.** `factor` is `pow(1 + planInfl, year)` while every year so far matched the plan's inflation, through the
   first off-plan year (that year's factor is still the pow). From then on a running product: seeded with that pow value, then
   `endOfYear()` multiplies it by `1 + yearInflation` from the end of that (first off-plan) year on. `factor` is used for both `factor` and `limitFactor`.

So an off-window or off-crash year returns the plan's stock return, bond return and yield. The factor (and `limitFactor` and
`taxFactors`) keeps the running product once any year has gone off-plan, including the years after a crash's fall or after a history
window ends. With `order: 'standard'`, a scenario run matches the plain run until the first affected year; with `'bucket'` (the default) the withdrawal mode differs from year 0.

## `runSourceFor`: the run choke point

`runSourceFor(ctx)` (`src/shared/core/projection/run-source.js`) returns `{ ctx, mode, source }` for a normal run:

- No `ctx.inputs.marketScenario`: the very `ctx` passed in, `STANDARD_MODE`, `standardYearSource(ctx.inputs)`. Today's run, with one small
  object more.
- A scenario: a `newRunContext` copy of every field with `taxFactors: scenarioFactorPath(inputs)` (a fresh 256-entry array; the source writes the same value into it each year),
  `BUCKET_MODE` unless `order === 'standard'`, and `scenarioYearSource(copy.inputs, copy.taxFactors)`. It never writes the ctx it is given.

The five sites: `simulateWith` and `simulateWithAccountLog` (`runs.js`), the US `computeCliffPlan`'s `run`
(`run-projection.js`), the US `plan-search.js` `runOn`, and the US test hooks (`__test_runPlanMode`, `__test_accountTrace`,
`__test_planTrace`). Each calls `runProjection(run.ctx, { mode: run.mode, source: run.source, ... })`. **A new run site of the normal
projection must go through `runSourceFor`, or that run silently ignores a scenario.** `tests/unit/shared/run-source.test.js` has a
source-text guard that fails on a `standardYearSource(` call anywhere else in `src/` (outside `run-source.js`). Under a scenario, planning (the cliff plan,
Optimize's runs) therefore runs in `BUCKET_MODE` and with tax factors.

`scenarioFactorPath(inputs)` (`scenario-source.js`) runs a fresh scenario source for years 0..255 and returns the tax-index factors. The source
reports `pathFactor: true`, so scenario rows carry `cumFactor` (equal to the year's factor), as historical rows do; standard rows have none.
`pricingContextFor(ctx)` (`run-source.js`) is what pricing of a finished run reads (`afterTaxEndValueUS`, `afterTaxEstate`, the objectives'
`runCtx` / `priceCtx` / `copyCtx`): the very ctx without a scenario or when `ctx.taxFactors !== null`, else a copy carrying the path. The
objectives divide each row by `r.cumFactor ?? pow(1 + inflation, r.year)`.

## Today's dollars and pricing under a scenario (PR 2)

A scenario run's rows carry `cumFactor` (the year's factor), and `displayValueOf(mode, inflation, n, yearIndex, factor?)` /
`displayValue(n, yearIndex, factor?)` divide by it when given (every main-run display site passes `r.cumFactor`), so "today's dollars"
follow the scenario's own inflation. Pricing code that runs outside the scenario run (the cliff plan, plan search, objectives, the Roth
optimizers, `afterTaxEndValueUS`, the Canada print-report estate, the US test hooks) goes through `pricingContextFor(ctx)`
(`run-source.js`): the very ctx when there is no scenario **or when `ctx.taxFactors !== null`** (a ctx that already carries its own
path keeps it: `__test_runPlanMode`'s historical branch, and a scenario run's own copy), else a `newRunContext` copy carrying
`scenarioFactorPath(inputs)`. The objectives divide each row by `r.cumFactor ?? pow(1 + inflation, r.year)`.

Rulings of the PR 2 plan:

- **R3:** `runSourceFor` fills the scenario run's `taxFactors` with the whole 256-year path up front, so the state-tax base-year
  divisor (`taxIndexFactor(ctx, by.x - cy)`) reads a year the run has not reached from one series with the numerator. The cost: the
  256-year path is built once per scenario run (`runSourceFor`), and once per pricing call that needs it (`pricingContextFor`), not once
  per working copy of a variant.
- **R4:** the path is 256 years (indexes 0..255, the range of `taxIndexFactor`'s memo); past it the factor falls back to the plan's pow.
- **R5:** Reset while a scenario is on reverts first, then resets, so the reset's Undo returns to the real settings.
- **R6:** Run and Revert clear the single undo slot (`clearUndo`); a snapshot taken inside the scenario carries `marketScenario`, so Undo
  stays inside it.
- **R7:** the banner is not sticky; it is first in `.content`, above the headline row.
- **R8:** the stored plan's fingerprint keeps `marketScenario`, so the search key and Apply's staleness check stay correct inside a
  scenario. `renderPlanOptimizerStatus` names the case of a plan made for the normal market (the fingerprint without `marketScenario`
  equals `madeFor` and the tax year matches): "Applied plan (made for the normal market) in use: it beats the scenario's own plan." when
  the guard uses it, else "The scenario's own plan is in use; your applied plan was made for the normal market."

**Overlap rule.** When crashes' fall years overlap, the last listed crash sets inflation and bonds for those years (the stock levels
multiply). The description text does not mention it.

## Scenario mode (PR 2)

`scenarioSnapshot` (`src/shared/ui/plans/market-scenario-snapshot.js`, imports nothing) is non-null exactly while a scenario is on: it is
the UI's single "is a scenario on" test (never read `state.marketScenario` for that). `runMarketScenario(raw)` and
`revertMarketScenario()` (`market-scenario-mode.js`) are the only writers:

- **Run** keeps a clone of the real `state` (no `marketScenario`) in the snapshot, replaces `state` with a normalized copy carrying the
  scenario, clears the undo slot, renders and saves. It returns false for an invalid scenario or when one is already on.
- **Revert** puts the snapshot back as `state`, clears the snapshot and the undo slot, re-syncs the controls, renders and saves.
- **What the snapshot changes elsewhere.** Autosave writes the snapshot (the real settings), never the scenario, and `#saveStatus` reads
  "Market scenario on: changes here are not saved". Boot load strips `marketScenario`, so a reload is always the real plan. Reset reverts
  first (R5). While on, `renderScenarioList` disables Save current, Import, Export all, and each row's Load and Export (with `#scenarioLockNote`); Compare and Delete stay enabled, because the comparison runs the saved states on the normal market (spec section 7); the comparison
  table row and the overlay chart's live series read "Current (market scenario)". `__test_replaceState` clears the snapshot.
- **What shows it.** `#marketScenarioBanner` (partial `marketScenarioBanner`, first in `.content`; `renderMarketScenarioBanner()` from both
  renders, the Revert click wired by `wireMarketScenarioBanner()`) holds `describeMarketScenario(ms, inputs, currentYear)`
  (`src/shared/core/format/market-scenario-text.js`). The text names the ages and years the source actually runs, after its own clamps; the
  last plan age is `L = ageA + projectionYears` (the loop of `runProjection` runs `year <= projectionYears`, the longer life-expectancy gap, or
  partner A's alone for a single person). The same text opens the print report (a `pr-meta` line), is the CSV's first line (one quoted
  cell), and the Historical and Monte Carlo cards carry a note (`.ms-note`) that they ignore the scenario.
- **Test hooks:** `__test_runMarketScenario(raw)`, `__test_revertMarketScenario()`, `__test_marketScenarioSnapshot()`.

## Monte Carlo and the historical view

The historical cycles and the Monte Carlo runs ignore the scenario: they build their own sources and contexts. `monteCarloSeed` and
`successKey` (`simulate.js`) leave `marketScenario` out, so a scenario never changes a Monte Carlo seed or the success cache key.

## Known approximations

- **Lookahead approximations shared with the historical runs.** `irmaaGrowth2` and the ladder sizing use `source.inflation`
  (the plan's inflation; `run-projection.js` near :341, :349), and `lambdaEstimate` uses `returnRate` (`solver.js` near :388).
- **Rates a scenario leaves on the plan.** Wage growth (`incomeFactor`), the cash/HYSA rate and the mortgage rate stay on the plan's
  rates under a scenario, as in the historical run (so under a high-inflation crash spending inflates on the path while salaries grow at
  the plan rate).
- **A hand-edited save.** Boot load strips `marketScenario` (scenario mode below), so a save carrying the key never starts a scenario.

## What PR 3 still owes (spec sections)

- **PR 3** (spec section 5): the card (fields, presets, preview charts), Playwright tests of the card, README and the version badges.
- **Follow-up:** "Add another crash" (the list UI on the existing data model).

## Tests

`tests/unit/shared/market-scenario-normalize.test.js`, `scenario-source.test.js`, `run-source.test.js`, `market-scenario-text.test.js`, `scenario-pricing.test.js`, the root `test_market_scenario_mode.js`, and
`tests/unit/us/scenario-plan.test.js` (see [test-inventory.md](test-inventory.md)).
