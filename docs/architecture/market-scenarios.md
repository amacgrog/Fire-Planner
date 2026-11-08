# Market scenarios

Read before touching `marketScenario`, `scenarioYearSource`, `runSourceFor`, or any code that starts a normal projection run.

Related: [engine.md](engine.md), [cliff-plan.md](cliff-plan.md), [inputs-and-ui.md](inputs-and-ui.md), [test-inventory.md](test-inventory.md), `docs/superpowers/specs/2026-11-06-market-scenarios-design.md`.

Custom crashes or a replayed real-history window laid over the plan's rates, for the normal deterministic run. Both planners; the
US also plans (cliff plan, Optimize) under the scenario. PR 1 built the source; PR 2 added scenario mode (below) and today's dollars on
the path's own factor; PR 3 adds the card that sets one up; PR 4 makes the card a list of crashes.

## The input

`inputs.marketScenario` (normalized by `normalizeMarketScenario(raw)`, `src/shared/core/inputs/market-scenario.js`), or absent.
The shape is `{ kind: 'crash' | 'history' | 'plan', order: 'bucket' | 'standard', ... }`:

- `order`: `'standard'` is kept; anything else becomes `'bucket'`.
- `kind: 'crash'`: `crashes`, an array (at most 10 valid rows are kept; invalid rows do not count toward the cap). A row is kept only when every field below is a
  number (a finite number or a non-blank string Number reads as finite; `''`, `null`, `true`, `[]`, `Infinity` are not); a bad row is
  dropped. No row left: off. Clamps: `age` 0-120 (rounded), `drop` 0-95 (percent), `fallYears` 1-10 (rounded), `recoverPct`
  0-100 (percent of the drop recovered), `recoverYears` 1-30 (rounded), `inflation` -15 to 30 (percent a year during the fall),
  `bondReturn` -50 to 50 (percent a year during the fall).
- `kind: 'history'`: `history: { startYear, atAge, endAge }`. `startYear` is rounded and clamped to the first and last year of
  `HIST`; `atAge` is rounded and clamped 0-120; `endAge` is `null` (to the end of the data), or a number rounded and clamped
  0-120. A missing or non-numeric `startYear` / `atAge`, or a non-numeric non-empty `endAge`, turns the scenario off.
- `kind: 'plan'`: the plan's own rates, just `{ kind: 'plan', order }`; other fields are dropped. The card never offers it: the preview's baseline and tests use it
  (PR 3, Q1).
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

0. **Kind `plan`** serves step 1 every year and nothing else (no crash, no history branch: both are guarded), so its factor is the standard
   `pow(1 + planInfl, year)` and each row carries a `cumFactor` equal to it.
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

## Tests

`tests/unit/shared/market-scenario-normalize.test.js`, `scenario-source.test.js`, `run-source.test.js`, `market-scenario-text.test.js`, `market-scenario-card.test.js` (the card's DOM-free helpers, PR 3),
`scenario-pricing.test.js`, the root `test_market_scenario_mode.js` and `test_market_scenario.js` (the card, PR 3), and
`tests/unit/us/scenario-plan.test.js` (see [test-inventory.md](test-inventory.md)).

## Card helpers (DOM-free)

- `planLastAge(inputs)` (`inputs/plan-last-age.js`) is `ageA + projectionYears`, the `L` the text and the card clamps use.
  `marketScenarioWindows(ms, inputs)` returns the `[{ fromAge, toAge }]` the scenario changes (a crash: fall plus recovery, none when
  `recoverPct` is 0, capped at `L`, nothing past `L`; history: the ages the text names; kind `plan`: none).
- `scenarioMarketPath(inputs)` (`projection/scenario-source.js`) returns `{ ages, plan, scenario }`, the plan's stock index and the
  scenario's from age `ageA` to `L` (both start at 1), the second built from a fresh source's `stockReturn`.
- `inputs/market-scenario-card.js` holds the card's settings: `CRASH_PRESETS` (five, chronological, rates pinned from the cited `HIST`
  rows; the Depression entry is "Like 1929–44": leg 1 falls 1929-32 and recovers to 1936, and its frozen `then` is the 1937 fall, to
  1944), `presetCrashShape(preset, returnRatePct)` (a preset's real stock path as a crash against the plan's own line, Q11; computed
  when called), `presetSecondLeg(preset, returnRatePct)` (leg 2 measured against the plan's line times leg 1's rounded end level, both
  levels running from 1929; `null` without `then`), `crashLegs(row)` (2 exactly when the row's shape box is on and its preset has
  `then`, so any number edit or a return change that turns the row Custom removes leg 2), `cardCrashCount(s)` (the sum of the legs,
  which the cap `MAX_CRASHES` counts, independent of the plan's last age), `defaultCardSettings`, `normalizeCardSettings` (always a full
  object; the rows are `crashes`, or the one `crash` of a PR 3 save, never written back as `crash`; each row is normalized as before;
  the walk keeps rows in order and stops at the first that would pass the cap; ages clamp into `[ageA, L]`; a preset chip becomes
  `'custom'` when its rates differ, or when the shape checkbox is on and the numbers are no longer the shape at the current return),
  `nextCrashAge` / `newCrashRow` (a new row starts the year after the last row's window, clamped into the plan) and
  `cardSettingsToScenario(s, inputs)` (the rows in list order, a Depression row followed by its leg 2 at `age + 8`, left out past `L`;
  the engine data model is unchanged, so the banner and report describe a Depression entry as two plain crashes).
  `format/market-scenario-card-text.js` writes a row's summary (`crashRowSummary`) and the Depression note (`secondLegNote`);
  `format/market-scenario-preview-text.js` writes the preview's one-line summary. `describeMarketScenario` lists the crashes in age
  order (a stable sort on the clamped age it prints) and `unionWindows(windows)` (`market-scenario-text.js`) merges overlapping and
  adjacent windows on copies for the band (R11: `marketScenarioWindows` stays unmerged, and `projection-chart.js` draws
  `unionWindows(marketScenarioWindows(...))`, so overlapping crashes shade once and adjacent ones leave no seam). `isObject`, `num`, `clamp`
  and `clampInt` are exported from `inputs/market-scenario.js` and shared with the card module.

## The card (PR 3, the crash list in PR 4)

**The list (PR 4).** `#msCrashList` holds one row per crash (R1; the R-numbers here are the rulings of the PR 4 plan, `docs/superpowers/plans/2026-11-07-market-scenarios-pr4-another-crash.md`); the field block (`#msCrashEditor`) is moved into the open row and
edits `cardSettings.crashes[openCrash]`. `openCrash` is a module-level `let`, not saved, reset to 0 on wiring (R3): Remove of an earlier
row shifts it down by one, Remove of the open row opens the next (or the new last) row, and it is clamped after every normalize. The
editor is captured once at wiring and never leaves the DOM (R2): a render updates the header text in place, rebuilds the rows only when
their count changed and re-appends the editor right away. One delegated click listener on the list opens a row (the header of the open
row does nothing; opening saves and previews nothing). Add starts the new crash the year after the last row's window (`newCrashRow`).
The scenario text stays plain (owner): the banner, report, CSV and description list every crash in age order, a Depression entry as two
plain crashes (R10); only the card's summary row names it.

**The cap (R8).** `MAX_CRASHES` (10) counts engine crashes, so a two-leg row counts 2 whatever the plan's last age. Normalize walks the
rows in order and drops the first row that would pass the cap and everything after it. Add, the 1929 chip (with the shape box on) and
the shape box on a 1929 row are disabled when they would pass it, after PR 3's lock loop, and `#msCapNote` shows when no scenario is on
and one of them holds. `#msAddCrash:disabled` has its own style.

**The Depression entry (R4-R7).** "Like 1929–44" with the shape box on is two legs (`crashLegs`): leg 1 falls 1929-32 and recovers to
1936; its frozen `then` is the 1937 fall, recovering to 1944, which `presetSecondLeg` measures against the plan's line times leg 1's
rounded end level. `cardSettingsToScenario` emits leg 2 after its row at `age + 8`, and leaves it out past the plan's last age (the
row's note then says the second fall comes after the plan ends). Leg 2 makes the engine's index hit the real 1937 bottom and the real
1944 level where the 0-100% recovery clamps do not bind (about 2-8.5% returns). At 0% leg 2 clamps to 100% back and the index ends at
1.00x; at 9% and above it clamps to 0% back and the index ends above the real 1944 level. Any number edit or a return change turns the
row Custom, which removes leg 2; changing the age keeps the chip.

**No clamping mid-typing (R12).** `renderMarketScenarioCardState()` skips its re-normalize while one of the card's number boxes has focus,
so a render that arrives while typing leaves the typed value unclamped until `change` (the row header and description show it meanwhile).
`change` and Run normalize.

**The portfolio tip (R15).** `wireMarketScenarioCard()` writes `MS_PORTFOLIO_TIP` into `#msPortfolioTip`'s `data-tip`. It comes from the
country seam `#country/ui/seam-MS_PORTFOLIO_TIP` (`<country>/ui/results/market-scenario-copy.js`): the US adds "Both use your current
plan's conversions and caps; Run re-plans for the scenario." since its baseline keeps the stored plan. The partial holds the Canada text.

`shared/ui/plans/market-scenario-card.js` owns the card (`marketScenarioCard.html`, included before `sankeyCard`). Its settings are the
live binding `cardSettings` (changed only by `assignCardSettings`), kept in `storageKey + '.marketScenarioCard'` (per country): loading
never writes the key, only a user edit does, and every storage access is in try/catch. A card edit calls `assignCardSettings`,
`renderMarketScenarioCardState()` and `schedulePreview()` and nothing else: no `render()`, no `saveInputs()` (`test_market_scenario.js`
sets a sentinel on `window.fireProjection` to prove it). `renderMarketScenarioCardState()` runs in `renderBody`: it re-normalizes the
settings against the live `state` (ages clamp into the plan), skips the focused box, and disables the whole card while a scenario is on.
Typing stores a value without clamping or rewriting the box; `change` clamps and writes back. Run normalizes once more, then calls
`runMarketScenario`; Revert calls `revertMarketScenario`. Reset does not touch the card's settings. The banner reads "Scenario on: ...
Every number, chart and optimizer below assumes it." with a "Revert to my plan" button. The card's input ids are listed in `UI_ONLY` of
`tests/field_registry.js`.

**The preview.** `shared/ui/results/market-scenario-preview.js` exports `renderMarketScenarioPreview(settings)` (it takes the settings as
an argument, so it does not import the card; the card's `schedulePreview` debounces it by 250 ms and the `renderOpenCards` of both
countries pass `cardSettings`). It runs the plan twice through `stateContextFor()` and `simulateWith` (never a hand-built context): the
scenario (`{ ...state, marketScenario: ms }`) and the baseline. The baseline is `simulate()` for the standard order and, for the bucket
order, a kind `'plan'` scenario (the plan's own rates, no crash) in the bucket order, so the gap is the market alone and not the
withdrawal order (Q1). In the US `stateContextFor` gives both runs the kept plan. The market chart is `scenarioMarketPath` (the
plan's index dashed in the muted color, the scenario red); the portfolio chart is each run's `total` through `displayValueOf('real', ...)`
(Q4: the preview is always in today's dollars, whatever the on-screen switch says); the summary is `previewSummaryText`. Both charts
are drawn by `charts/mini-line-chart.js` (`drawMiniLines`, 120 CSS px tall, two y gridlines). The preview is registered in
`DEFERRED_CARDS` of `render-scheduler.js` (the light render marks the open card stale; the deferred pass draws it), is drawn only while
the card is open, and redraws on a window resize like the Sankey. While a scenario is on it is hidden and `#msRunningNote` shows (Q6).

**The scenario band.** `renderChart(series, valueFn, opts)` takes `{ marketBand: true }` from the projection views only (the CAGR sweep and
the retirement-date views, not the historical view). With `scenarioSnapshot` set it shades each window of `unionWindows(marketScenarioWindows(state.marketScenario,
state))`, `x(fromAge)` to `x(toAge + 1)` clipped to the plot, after the zero line and before the series (translucent red, stronger in
dark mode). `lastChart.opts` is passed back by `chart-hover.js`, so the hover redraw keeps the band.

**Rulings.** Q2 ages clamp into `[ageA, L]` on load, every render and Run; Q5 the banner copy is the spec's; Q6 the preview is hidden while
on; Q7 the historical and Monte Carlo notes keep PR 2's wording (Canada has no plan modes); Q9 Reset leaves the card's settings alone; Q10
every card input, the slider, the checkbox and the kind, order and preset buttons are disabled while on (Run / Revert stays enabled); Q11
presets can carry the stock shape (the `Also use its stock drop and recovery` box).
