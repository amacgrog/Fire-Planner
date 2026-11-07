# Market scenarios

Read before touching `marketScenario`, `scenarioYearSource`, `runSourceFor`, or any code that starts a normal projection run.

Related: [engine.md](engine.md), [cliff-plan.md](cliff-plan.md), [inputs-and-ui.md](inputs-and-ui.md), [test-inventory.md](test-inventory.md), `docs/superpowers/specs/2026-11-06-market-scenarios-design.md`.

PR 1 of the feature (the source, no UI): custom crashes or a replayed real-history window laid over the plan's rates, for the
normal deterministic run. Both planners; the US also plans (cliff plan, Optimize) under the scenario.

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
window ends. A scenario run matches the plain run until the first affected year.

## `runSourceFor`: the run choke point

`runSourceFor(ctx)` (`src/shared/core/projection/run-source.js`) returns `{ ctx, mode, source }` for a normal run:

- No `ctx.inputs.marketScenario`: the very `ctx` passed in, `STANDARD_MODE`, `standardYearSource(ctx.inputs)`. Today's run, with one small
  object more.
- A scenario: a `newRunContext` copy of every field with `taxFactors: []` (the source records each year's tax-index factor there),
  `BUCKET_MODE` unless `order === 'standard'`, and `scenarioYearSource(copy.inputs, copy.taxFactors)`. It never writes the ctx it is given.

The five sites: `simulateWith` and `simulateWithAccountLog` (`runs.js`), the US `computeCliffPlan`'s `run`
(`run-projection.js`), the US `plan-search.js` `runOn`, and the US test hooks (`__test_runPlanMode`, `__test_accountTrace`,
`__test_planTrace`). Each calls `runProjection(run.ctx, { mode: run.mode, source: run.source, ... })`. **A new run site of the normal
projection must go through `runSourceFor`, or that run silently ignores a scenario.** `tests/unit/shared/run-source.test.js` has a
source-text guard that fails on a `standardYearSource(` call anywhere else in `src/` (outside `run-source.js`). Under a scenario, planning (the cliff plan,
Optimize's runs) therefore runs in `BUCKET_MODE` and with tax factors.

## Monte Carlo and the historical view

The historical cycles and the Monte Carlo runs ignore the scenario: they build their own sources and contexts. `monteCarloSeed` and
`successKey` (`simulate.js`) leave `marketScenario` out, so a scenario never changes a Monte Carlo seed or the success cache key.

## Known approximations

- **PR 2 pricing sites.** These still deflate by the plan's inflation, and the brackets they apply are the plan's, not the path's own
  factors: `computeCliffPlan`'s `runCtx` (`run-projection.js`, near line 3297), plan-search's `copyCtx` and `measureOn` (near :75-79),
  objectives.js `realCost`, `objectiveBreakdown` and `gainInTodaysDollars` (near :37, :43, :68), and `endTaxUS` /
  `afterTaxEndValueUS`. PR 2 moves them to the path's factors.
- **Lookahead approximations shared with the historical runs.** `irmaaGrowth2` and the ladder sizing use `source.inflation`
  (the plan's inflation; `run-projection.js` near :341, :349), and `lambdaEstimate` uses `returnRate` (`solver.js` near :388).
- **A hand-edited save during PR 1.** A save carrying `marketScenario` runs the planner in a crash or history path with no indicator.
  Nothing in the UI writes the key until PR 2, which strips it on load and import. Accepted for PR 1.

## What PR 2 and PR 3 still owe (spec sections)

- **PR 2** (spec sections 4, 7, 8): scenario mode (Run, Revert, the snapshot, autosave, undo, load and reset), the saved-scenarios
  guard, the banner, the notes on the historical and Monte Carlo views, and today's dollars on the path's own factor (the pricing
  sites above). Section 6 (Canada) for its part of the UI.
- **PR 3** (spec section 5): the card (fields, presets, preview charts), Playwright tests, README and the version badges.
- **Follow-up:** "Add another crash" (the list UI on the existing data model).

## Tests

`tests/unit/shared/market-scenario-normalize.test.js`, `scenario-source.test.js`, `run-source.test.js`, and
`tests/unit/us/scenario-plan.test.js` (see [test-inventory.md](test-inventory.md)).
