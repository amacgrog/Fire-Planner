# Market scenarios: custom crashes and real history (design)

Date: 2026-11-06. Status: design, not yet planned. Both planners (US and Canada).

## Intent

Today the planner's main projection uses one fixed stock return, bond return and inflation for every year. The historical and
Monte Carlo views test the plan against many market paths, but only as a success rate. You can't make one bad market *the*
market and then plan inside it.

The owner wants to:

- **Pick a market scenario:** a crash of their own design (how deep, when, how much comes back and how fast), or real history
  starting from a chosen year at a chosen age.
- **See a quick preview** of what it does to the current plan.
- **Run the scenario.** The whole planner (dashboard, charts, tables, the cliff plan, the plan card's search and Apply, the Roth
  conversion optimizer, Canada's optimizers) then works on that market, so they can see how to prepare for it or respond to it.
- **Revert with one button** to the planner exactly as it was.

The motivating case: "if I think an AI crash is coming, what should I do now, and what should I do when it hits?" The value
is in sizing the bond and cash reserve, a conversion playbook for the crash years, spending cuts, the retirement date, and (US)
the room a crash opens under the ACA and IRMAA lines. The optimizers have full foresight of the scenario. That is intended (the
owner is asking "if I knew this was coming"), and the banner says the results assume the scenario.

## Goals

1. One results card, "Market scenario", in both planners, next to the other what-if cards (US: beside the plan optimizer card).
   A switch at the top chooses **Custom crash** or **Real history**.
2. **Custom crash:** a crash has a start age, a depth, the years it falls over, a recovery share (0–100%) and the years it
   recovers over, plus inflation and bond returns for the crash years (presets or custom). The data model is a list of crashes
   that stack; the first release's UI shows one crash (see Phasing).
3. **Real history:** a start year (1928–2025 from the embedded `HIST` data), the age it starts at, and an optional end age.
4. **A preview inside the card** before running: a small market chart (the scenario against the plan's line) and a small
   portfolio chart (the current plan replayed through the scenario against the normal projection), with a one-line summary.
   The main chart does not change until the scenario is run.
5. **Scenario mode:** after Run, every normal run of the planner uses the scenario's yearly market inputs and the
   withdrawal order chosen on the card (owner: a switch, default bonds-first). The optimizers and Apply work as usual.
   "Today's dollars" are deflated by the scenario's own inflation (owner: Option A; see section 8).
6. **Revert** restores everything as it was before Run: inputs, the applied (stored) plan, optimizer overrides and pinning.
   Anything changed or applied during the scenario is discarded, and the projection reruns.
7. **A banner** while a scenario is on, pinned above the dashboard, with a Revert button. It also goes on the printed report
   and the CSV export.

## Non-goals

- Re-planning from the crash year only (a "no foresight" mode). It was discussed, and the owner chose full foresight.
- Keeping a scenario-tuned plan after reverting. The owner chose "everything gets undone."
- Applying the scenario's market to the historical and Monte Carlo views. They bring their own market paths, and the Monte
  Carlo seed ignores the scenario. They run the plan in use, though, which in the US is the plan made on the scenario while it
  is on, so their success rates can change. While a scenario is on, they say so.
- Wrapping real history around to 1928 when the data runs out.
- New engine code paths. There is no scenario-only fork of the year loop (CLAUDE.md invariant): a scenario is a new **year
  source** plus an existing mode (`BUCKET_MODE` or `STANDARD_MODE`).
- MCP tools for scenarios (a later addition, if wanted).

## Anti-goals (a failure even if it technically works)

- The planner reopening in a crash without the user knowing. Autosave keeps the user's real settings (see Scenario mode).
- A scenario-tuned plan leaking into the normal plan after Revert.
- Editing the card's settings (before Run) changing the main projection, its cache keys or the cliff plan.
- Silently bending the math: a 100% recovery must land exactly on the plan's line; a 0% recovery must be a permanent loss
  growing at the plan's rate.
- A slowdown of the normal (no-scenario) path. With no scenario on, every run must be the very same run as today, and the
  snapshots and golden tests stay unchanged.

## Background (what exists)

- `runProjection(ctx, { mode, source, ... })` takes a **year source** (`src/shared/core/projection/year-sources.js`):
  `yearInputs(year)` returns `{ stockReturn, bondReturn, bondYield, factor, limitFactor }`, and `endOfYear()` advances state.
  `standardYearSource(inputs)` gives the fixed rates. `historicalYearSource(inputs, rowFn, taxFactors)` reads `HIST`-shaped
  rows `[year, stock%, inflation%, bond%, yield%]`, compounds inflation from the path, and writes each year's tax-index factor
  into `ctx.taxFactors` (which `taxIndexFactor` in `year-factors.js` reads first).
- The modes (`src/<country>/core/projection/year-modes.js`): `STANDARD_MODE` (standard cascade plus the maintained bond reserve,
  Batch 5 step 5b) and `BUCKET_MODE` (cash and bonds first in a down year, refilling the reserve in up years). Today only the
  historical and Monte Carlo runs use `BUCKET_MODE`.
- Nearly every normal run goes through `simulateWith` / `simulateWithAccountLog` (`src/shared/core/projection/runs.js`). Three
  places call `runProjection` with `standardYearSource` directly: US `plan-search.js:76`, US `run-projection.js:3298` (the
  cliff plan's runs) and the US test hooks (`install-test-hooks.js:168, 261, 337`).
- The result caches and the plan cache are keyed on `JSON(inputs)`, so a scenario stored as an input is covered by the keys
  automatically.

## The design

### 1. The scenario as an input

A run is in scenario mode when its inputs carry an active scenario: one `marketScenario` field on `state`. When off, the key
is **absent**, not `null`. That way the JSON of every existing state, cache key, Monte Carlo seed and plan fingerprint stays
byte-identical (revised in the PR 1 plan).
`normalizeState` guards it: an unknown kind, bad numbers or a bad list becomes `null` or is clamped, and the crash list gets a
list normalizer like the other lists. Because it lives in `inputs`, every variant (`{ ...base, field }`), every cache key and
every optimizer run carries it with no extra plumbing.

The card's **unsaved settings** (before Run) are *not* in `state`. They are UI state kept in their own module and their own
`localStorage` key, so editing them never touches the projection's inputs (anti-goal 3).

### 2. The run choke point

`simulateWith`, `simulateWithAccountLog` and the three direct `runProjection` sites choose the source and the mode from the
inputs:

- No scenario: `STANDARD_MODE` with `standardYearSource(inputs)`, exactly as today (the same objects, so the hot path is unchanged).
- A scenario: the mode the scenario names (`marketScenario.order`: `'bucket'` → `BUCKET_MODE`, the default; `'standard'` →
  `STANDARD_MODE`) with `scenarioYearSource(inputs, taxFactors)`, on a context whose `taxFactors` is a fresh array
  (as `pathContext` does in `simulate.js`; a context's `taxFactors` is otherwise `null`). It must still be built by
  `newRunContext`, with one context shape.

One shared helper (say `projectionSourceFor(ctx)` in `core/projection/`) returns `{ mode, source, ctx }` so the five sites
can't drift apart. `runHistoricalCycles` and Monte Carlo keep `historicalYearSource` and ignore the scenario.

### 3. The scenario year source

`scenarioYearSource(inputs, taxFactors)` (`src/shared/core/projection/`, DOM-free) builds the whole path once, at the start of
a run, as `HIST`-shaped rows, then serves them as `historicalYearSource` does: inflation compounds from the path and the
tax-index factors are written to `taxFactors`. Plan year `y` corresponds to Partner A's age `ageA + y`. Each year's default is
the plan's own rates: `returnRate`, `inflation`, and `bondReturn` (also used as the yield).

**Custom crashes.** Each crash `k` has `{ age, depth D, fallYears F ≥ 1, recoverShare R in [0, 1], recoverYears N ≥ 1,
inflation, bondReturn }`. It defines a ratio curve `q_k(t)` against the market it lands on, where `t` is the plan year and
`t0` the crash's start year:

- before `t0`: `q = 1`
- falling, year `j = 1..F` from the start (plan year `t0 + j − 1`): `q = (1 − D)^(j/F)`
- recovering, year `j = 1..N` after the fall: `q = (1 − D) · (q_end / (1 − D))^(j/N)`, with `q_end = 1 − D·(1 − R)`
- after: `q = q_end`

The scenario's stock index is `I(t) = (1 + returnRate)^t · Π_k q_k(t)`, and the stock return for year `t` is
`I(t) / I(t − 1) − 1`. So:

- 100% recovery lands exactly back on the plan's line, and 0% is a permanent loss growing at the plan's rate.
- Crashes stack, overlap and are order-independent.
- With `R = 0` the recovery years don't matter.

**Inflation and bonds:** the crash's `inflation` and `bondReturn` apply in its **fall years**. Recovery and later years use
the plan's rates. Where two crashes' fall years overlap, the later-listed crash wins. *(My call.)*

**Presets** for a crash's inflation and bond return, from `HIST` (averages over the episode's down years; the builder
re-derives them from the data and cites the rows):

- Like 2008: inflation about 0.1%, bonds about +20%.
- Like 2000–02: inflation about 2.4%, bonds about +12%.
- Like 1973–74 (stagflation): inflation about 10.5%, bonds about +2.8%.
- Like 2022: inflation about 6.5%, bonds about −18%.

Plus Custom (both fields editable).

**Real history** `{ startYear, atAge, endAge | null }`:

- Before `atAge`: the plan's rates.
- From `atAge`: the `HIST` rows from `startYear` on, in order (stock, inflation, bond return, yield), until `endAge` or the
  end of the data, whichever comes first.
- After that: the plan's rates, from whatever level the real years reached. Inflation carries on from the real years'
  cumulative factor.

**Ages:** both kinds are set as Partner A's age (shown with the calendar year). A single person is Partner A. *(My call;
the planner's convention.)*

### 4. Scenario mode: Run, Revert, persistence

- **Run:**
  - Takes a full snapshot of the planner's revertable state: `state` (including `storedPlan`) and the optimizer state the
    user can set (the US `optimizer-state.js` maps and the flat-bracket pinning; the builder lists every one of them).
  - Writes `state.marketScenario` from the card's settings, then calls `render()`.
  - Everything then runs on the scenario: the cliff plan re-plans, because its key (the inputs' JSON) changed.
- **Revert:** restores the snapshot through the sanctioned state writes (`assignState`, ...) and calls `render()`. The
  snapshot is then dropped.
- **Autosave** while a scenario is on writes the **snapshot** (the real settings), not the live state. Closing the browser
  mid-scenario reopens the normal planner. The card's own settings are remembered separately, so the scenario can be run
  again.
- **Undo, load and reset:** they must never leave the planner half in a scenario:
  - **Load and reset** leave scenario mode, discarding the snapshot.
  - **Undo** never crosses the Run boundary: undo inside a scenario stops at the moment of Run, and Revert is the way out.
    *(My call; the builder may choose a simpler equivalent that keeps this property.)*
- The writes go through the state modules' `assign*` functions. Run and Revert are new sanctioned writes, listed in
  CLAUDE.md's "State and the sanctioned writes".

### 5. The card (UI)

These are agreed with the owner from the mockups (`.superpowers/brainstorm/`, `scenario-card.html`, `preview-options.html`).

- A `details.result-card` "Market scenario", in both planners. US: right after the plan optimizer card. Canada: the matching
  spot among its result cards.
- A segmented switch at the top: **Custom crash** | **Real history**.
- A **withdrawal order** switch (both kinds): **Bonds first in down years** (default) | **My normal order**. Bonds-first is
  the existing bucket mode: cash and bonds first in a down year, then stocks; in an up year stocks first and the bond reserve
  refilled (the owner asked that up years not draw bonds first, which is already how `BUCKET_MODE` works). The info bubble
  says so in plain words.
- **Custom crash fields:**
  - Hits at age (with the calendar year).
  - Drop %.
  - Falls over (years).
  - A recovery slider, 0–100%, with the hint "0% = permanent loss · 100% = back on your plan's line".
  - Comes back over (years), disabled at 0%.
  - Inflation and bonds during the crash: preset chips (Like 2008 / Like 2000–02 / Like 1973 / Like 2022 / Custom), with
    the two numbers shown.
  - The first release shows one crash. "Add another crash" is a follow-up (Phasing).
- **Real history fields:**
  - Start from year.
  - At age (with the calendar year).
  - End at age (optional).
  - A one-line description of which years are real.
- **The preview** (inside the card, both kinds): a small market chart (the scenario index against the plan's line, from the
  source's math with no projection run), and a small portfolio chart: the current plan (US: the current `cliffPlan`,
  `planMode: 'apply'`) replayed through the scenario, against a **baseline: the same inputs and the same withdrawal order
  with no crash** (the plan's fixed rates). So the gap between the two lines is the crash alone (owner). With "My normal
  order", the baseline is today's projection itself. Under them a one-line summary: how long the money lasts and the end
  value in today's dollars (section 8), scenario against baseline. The portfolio run is two projections at most, so it is a deferred panel (`renderDeferred()` / `markDeferredStale()`), refreshed as the settings change
  (debounced).
- **Run this scenario** button. While a scenario is on, the card shows it as active, its fields are read-only, and its
  button is Revert.
- **Banner** (pinned above the dashboard while on): "Scenario on: <one-line description>. Every number, chart and optimizer
  below assumes it." with a Revert button. The same line heads the printed report and the CSV export.
- The **historical and Monte Carlo views** carry a one-line note while a scenario is on, saying they ignore it.
- **Field rules:** descriptors under about 70 characters, longer copy in info bubbles, money-field and mobile-width rules as
  CLAUDE.md says. The main chart marks the scenario's years (crash or real-history window) while a scenario is on.
  *(The marking style is the builder's.)*

### 6. Canada

The same card, source and scenario mode. The Canada engine has no plan modes, so the preview's "current plan" is just the
current inputs. Revert restores Canada's own state, with no `storedPlan` or US optimizer maps. The bucket mode, the
meltdown and pension splitting run on the scenario as they do in the historical runs.

### 7. Interactions settled after the builder check *(my calls)*

- **Naming:** the state field is `marketScenario` and the card is "Market scenario". The existing saved-scenarios feature
  (`src/shared/ui/plans/scenarios.js`, `store.js` `scenarios`) keeps its name.
- **Saved scenarios** always hold normal-market states:
  - `marketScenario` is stripped on save, export, import and load.
  - While a market scenario is on, Save, Export, Import and Load in the saved-scenarios UI are disabled, with the note
    "Revert the market scenario first". Saving there would turn a scenario-tuned plan into a normal plan (anti-goal 2).
  - The scenario comparison table runs its saved states on the normal market, since they carry no scenario.
- **The applied plan (US `storedPlan`)** stays in `state` during a scenario and keeps competing in `computeCliffPlan`'s guard,
  as it does today: the guard uses it only when it beats the scenario's own plan. The plan card's status line says it was made
  for the normal market. The fingerprint (`fingerprintJson`) leaves `marketScenario` out when it is `null`, so existing
  applied plans don't read as stale after the upgrade. The preview's "current plan" is the plan in use before Run.
- **What-if variants** (the sensitivity card, the decision questions, the chart's return-rate lines) run on the scenario as
  it is: they are ordinary variants of the inputs. Under a custom crash a `returnRate` variant moves the whole crashed path
  (the crash rides on the plan's line). Under real history it moves only the years outside the window. The topic file
  records this, and no card changes.

### 8. Today's dollars follow the scenario's inflation (owner: Option A)

The engine already prices spending and taxes on the path's own inflation. The display does not: every "today's dollars"
figure divides by `displayValueOf(mode, state.inflation, ...)` (`src/shared/core/format/charts.js`), the plan's fixed rate,
as the historical view does today.

In a scenario that would overstate real buying power. A $1,000,000 balance ten years into 10.5% inflation shows as $781k
against a 2.5% plan, when it buys what $369k buys today. So, in scenario mode:

- Each row carries its cumulative price factor (the source's `factor`, already computed per year; a display-only row field
  like the cash-flow fields, which no engine path reads).
- Every "today's dollars" display reads the row's factor instead of `(1 + inflation)^year`: the dashboard tiles, the main
  chart, the tables, the cash-flow and Sankey charts, the report, the CSV and the card's preview summary.
- With no scenario the factor equals the plan's own, so the normal displays are unchanged (the snapshots prove it).

The builder lists every `displayValueOf` / today's-dollars call site. The same goes for the **optimizers' pricing**, which
deflates by the plan's inflation and applies the plan's brackets:
- computeCliffPlan's `runCtx`
- plan-search's `copyCtx` and `measureOn`
- objectives.js `realCost`, `objectiveBreakdown` and `gainInTodaysDollars`
- `endTaxUS` / `afterTaxEndValueUS`

Under a scenario, all of these price on the path's own factors (PR 2). Whether the historical view also switches to its
path's own factor is out of scope (unchanged).

## Constraints (from CLAUDE.md)

- The engine reads only `ctx`. The new source is a pure function of `inputs` and is built inside the run. No module-level
  mutable without a `tests/engine-purity.json` entry.
- One context shape. The scenario context with a fresh `taxFactors` comes from `newRunContext`.
- Exact tests. Hand-computed expected values for the source (ratio curves, stacking, 0% and 100%, real-history windows,
  the data's end).
- With no scenario, every snapshot and golden test is unchanged. `tests/bench_runs_interleaved.js --warm-analysis` shows no
  regression.
- New modules get purpose comments, then `npm run analyze`. A new topic file
  `docs/architecture/market-scenarios.md` is listed in CLAUDE.md.
- Bump both version badges, update README's feature list, and add a Playwright UI script (`test_market_scenario.js`) that
  checks Run changes `window.fireProjectionRows`, Revert restores them exactly, and autosave holds the real settings.

## Phasing (PRs) *(my proposal)*

1. **The source:** `scenarioYearSource`, the state field and its normalizer, the choke-point helper at the five sites, and
   Vitest tests (math, stacking, history windows, and the no-scenario path unchanged). No UI.
2. **Scenario mode:** Run, Revert, the snapshot, autosave, undo, load and reset, the saved-scenarios guard, the banner, the
   notes on the historical and Monte Carlo views, and today's dollars on the path's own factor (section 8). Both planners.
   Pricing and today's dollars need each scenario run's own factors: rows carry cumFactor only for a source with startYear, and
   computeCliffPlan / plan-search drop r.ctx (with the filled taxFactors). Add a scenario-only row factor (a source flag; standard
   rows unchanged, so snapshots hold) and an exported helper that computes one factor path per working copy (it depends only on
   the inputs, not the plan).
3. **The card:** fields, presets, the preview charts, Playwright tests, README, and the version badges.
   The preview baseline (same order, no crash) under the default bucket order needs a BUCKET_MODE run on the plan's rates, which
   runSourceFor cannot express today: add an explicit form (an option on runSourceFor or a normalized kind 'plan'), not a sentinel
   scenario. A scenario whose ages lie past the plan's end is still on (bucket mode): the card states the mode or refuses it. Keep
   both start ages at or above ageA in the fields.
4. **Follow-up:** "Add another crash" (the list UI on top of the PR 1 data model), the two-fall Depression preset and PR 3's
   follow-ups. Designed in "PR 4: Add another crash" below.

## PR 4: Add another crash (design, 2026-11-07)

Settled with the owner on 2026-11-07, after PR 3 (#91). It builds on PR 3's card (`docs/architecture/market-scenarios.md`,
"The card (PR 3)") and on PR 1's data model, which already takes a list of crashes (up to 10) that stack.

### Intent

The owner wants to test **whether the plan survives two (or more) hits**, and **how big a reserve to build** (bonds and cash
rebuilt after the first crash, before the next one). The user can put as many crashes as they like anywhere in the plan, up to the
engine's cap of 10. A crash lands on whatever the market is doing at that point, so a drop in the middle of an earlier crash's
recovery works.

The Depression preset becomes the ultimate test. The other presets test a long, gradual fall with a slow recovery, or a sharp drop
with a quick recovery. "Like 1929–44" is one huge drop, then a very long recovery with a second fall partway through (1937), before
the market got back for good in 1944. Today's single smooth recovery from the 1932 bottom to 1944 cannot show the 1937 fall
(PR 3 Q11 said so). Owner: the second fall is **hidden inside the preset as one entry**, not a second row.

### The list (owner: layout B)

- The crash fields become a list of crashes. Each crash is a **one-line summary row**, and **one row is open at a time** for editing.
  The open row shows the PR 3 fields (age, drop, falls over, recovery, comes back over, the preset chips, the shape box, inflation and
  bonds).
  - A summary reads like "30% at 75, 60% back over 4 yrs". A Depression entry with the shape on reads "Like 1929–44 at 60 (two falls)".
  - Clicking a closed row opens it and closes the open one.
- **"+ Add another crash"** appends a crash and opens it. *(My call:)* the new crash starts with the card's defaults (35% drop, 2 years
  down, 60% back over 4, Like 2008, shape off). Its age is the first age after the last-listed crash's window (fall plus recovery; plus
  its hidden second fall for a Depression entry), clamped to `[ageA, L]`.
- **Remove** on each row. It is hidden while only one crash is left (the crash kind always has at least one).
- **The cap.** Add is disabled when the crashes would need more than 10 engine crashes. A Depression entry with the shape on counts as
  two. *(My call:)* when a click on the Depression chip with the shape on would go past 10, the chip is disabled with a short note.
- The kind switch, the order switch, the description line, the preview and Run / Revert stay one per card, covering all the crashes.
- **Overlaps** are allowed: the levels multiply, and where fall years overlap the later-listed crash sets inflation and bonds (PR 1's
  rule, unchanged). *(My call:)* the description lists the crashes in age order (ties in list order), not list order.
- *(My call:)* the main chart's scenario band shades the union of the windows: overlapping windows are shaded once, not twice.
  `marketScenarioWindows` stays unmerged; the band merges.

### The Depression preset (owner: one entry with a hidden second fall)

- The chip is relabelled **"Like 1929–44"**.
- **Shape off:** unchanged in effect. The chip sets one crash's inflation and bonds to 1929–32's averages (-6.4%, +3.7%).
- **Shape on:** the entry runs as **two engine crashes**:
  - **Leg 1:** falls 1929–32 (4 years) and recovers over 1933–36 (4 years) to the end-of-1936 level (the real nominal total-return
    index got back to about 1.01× its 1929 start). Inflation and bonds as 1929–32. The open row's fields show leg 1.
  - **Leg 2 (hidden):** starts 8 years after leg 1 (1937), falls over 1 year (1937, -35% real), and recovers over 7 years (1938–44) to
    the end-of-1944 level (about 1.16×). Its inflation and bonds are 1937's row rounded to one decimal (2.9%, +1.4%).
  - Leg 2 is measured against the market it lands on (the plan's line times leg 1's final level), so the conversion divides by leg 1's
    rounded `qEnd`. The scenario then reaches the real 1937 bottom and the real 1944 level at the plan's return, within the
    whole-percent rounding. At a 7% return: leg 1 is 73% down, 44% back; leg 2 is 40% down, 15% back. At 0%: 65% / 100%, then
    35% / 100%. At 10%: 76% / 30%, then 41% / 0%.
  - *(My call:)* leg 2 falls over the single year 1937. The market then went sideways until 1941, so its smooth climb from 1938 is a
    little kind to 1938–41; the alternative (a slow fall over 1937–41) would lose the sharp one-year hit, which is what tests the reserve.
  - **The scenario text is plain (owner).** The banner, report, CSV and card description describe the entry as two ordinary crashes
    ("73% drop at age 60 ...; then 40% drop at age 68 ..."). `marketScenario` gains no preset label or grouping field; only the card's
    summary row names the entry.
  - Leg 2 goes into the engine's crash list right after its own leg 1, so the entry keeps its place in the list (the overlap rule
    and ties in the description follow it). *(My call.)*
  - Leg 2's numbers are derived when the scenario is built (from the plan's return), never stored. A note under the open row's fields
    names it: "Then a second fall in 1937 (age 68): 40% drop, 15% back over 7 years."
  - **Moving the entry's age** moves both legs. **Editing any other number** of the entry turns the chip Custom (PR 3's rule), and the
    entry is then one crash with exactly what the fields show: leg 2 goes away. *(My call.)*
  - A later return change turns the chip Custom, numbers kept (PR 3 Q11's rule), and so drops leg 2.
  - *(My call:)* when leg 2's age is past the plan's last age `L`, it is left out of the scenario, and the note says it falls after the
    plan ends.
- The shape box's info tip loses "One crash draws a smooth recovery; for the real year-by-year path (like 1937's second fall), use Real
  history." It says instead that Like 1929–44 includes the 1937 fall, and that Real history gives the real year-by-year path.

### The US preview note (owner)

The US preview replays the current cliff plan through the scenario, while Run re-plans the conversions and caps for it, so the two can
differ. The portfolio info tip gains, in the US only: "Both use your current plan's conversions and caps; Run re-plans for the
scenario." Canada's tip is unchanged (no plan to re-make). The partial is shared, so the US sentence is set per country.

### PR 3 follow-ups folded into PR 4

- `planLastAge` moves out of `core/format/market-scenario-text.js` into a neutral `core/` module (`scenario-source.js` imports it from
  the format module today).
- The `isObject` / `clamp` / `clampInt` / `num` helpers are exported once instead of duplicated in `market-scenario-card.js`.
- The render-time re-normalize no longer clamps the stored settings while a card box has focus (typing "6" on the way to "65"). The
  focused box is still never rewritten.
- `test_market_scenario.js`'s canvas-width check uses `Math.trunc`, as `mini-line-chart.js` does when it assigns `canvas.width`.
- A UI test types into a focused card box (real key presses), covering the focused skip and no clamping on `input`.

### Saved card settings

The card's stored settings move from one `crash` object to a `crashes` list. A PR 3 save (with `crash`) loads as a one-row list. Which row
is open is page state, not saved *(my call)*: the first row opens on load.

## Left to the builder

- Module names and the exact files (by the topic-folder rules).
- The preview charts' drawing and the main chart's scenario marking.
- The default values for a fresh card (suggested: a 35% drop at retirement over 2 years, 60% back over 4 years, Like 2008).
- The debounce of the preview.
- How the snapshot is stored (in memory plus the autosave key).
- Whether presets are stored as numbers or as a preset name plus numbers.
