# Market scenarios PR 3: the card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a "Market scenario" results card in both planners. It has a Custom crash | Real history switch, the crash
and history fields, presets, a withdrawal-order switch, an in-card preview (a market chart and a portfolio chart plus a one-line
summary), and Run / Revert. While a scenario is on, the main chart marks the scenario's years. This PR also updates the README and bumps both
version badges.

**Architecture:** The card's settings are UI state, not `state`. They live in one module with their own `localStorage` key, so
editing them never touches the projection (spec anti-goal 3). The DOM-free half goes under `src/shared/core/`: the
presets, defaults, clamps, the settings-to-scenario conversion, the market path, the scenario windows and the preview summary
text, all tested in Vitest. The UI half goes under `src/shared/ui/`: the card, its preview (a deferred card) and a small canvas
line-chart helper. The preview's baseline under the bucket order needs a BUCKET_MODE run on the plan's rates. A new
normalized scenario kind, `'plan'`, provides it: the plan's own rates, served by the scenario source. Run calls PR 2's
`runMarketScenario`. Revert calls `revertMarketScenario`.

**Tech Stack:** Plain ES modules under `src/`, esbuild, canvas 2D (no chart library), Vitest through `world()`, Playwright
root UI scripts.

**Spec:** `docs/superpowers/specs/2026-11-06-market-scenarios-design.md`: section 5 (the card), section 3 (the presets), section 6
(Canada), the Constraints and the PR 3 Phasing notes. PR 1 and PR 2 are written up in `docs/architecture/market-scenarios.md`.

## Global Constraints

- **No scenario means no change.** With no `marketScenario`, every engine snapshot (US 541, Canada 376) and golden test is
  unchanged. The UI snapshot baselines (`tests/snapshots/ui_*.json`) change for the new markup. Update them with
  `node tests/snapshot_ui.js --update` and say so in the commit message.
- **Benchmark.** `tests/bench_runs_interleaved.js --warm-analysis` shows no regression.
- **Engine rules.** The engine reads only `ctx`. New `core/` code imports no store module and nothing from `ui/`.
  - Vitest follows CLAUDE.md: go through `world()`, use exact `toBe` / `toStrictEqual`, write hand-computed literals, and
    never use `toBeCloseTo`.
  - Rule 6 applies: an expected value that rests on `Math.pow` is computed in the test, in the same process.
- **UI state.** A module-level `let` is assigned only in its own module, through an `assign<Name>` function.
  - The card's storage key is `fireCouplePlanner.marketScenarioCard.v1`.
  - Every `localStorage` read and write is wrapped in try/catch. The card works with storage blocked.
- **New modules.** Line 1 is a one-line `//` purpose comment, then a blank line, then two-space indented bodies. Run
  `npm run analyze` after adding modules. Each card wiring function is called once from both `main.js` IIFEs.
- **Copy.** Descriptors stay under about 70 characters; anything longer goes in an info bubble (`<span class="info-nw">` +
  `button.info-tip`, whose click handler is the shared delegated one). The exact strings are in the tasks. Use them verbatim.
- **Mobile.** At 390×844, with the card open (both kinds) and with the banner shown, `scrollWidth > clientWidth` stays false.
- **Version badges.** Bump both, each to its shell's current number + 1 at commit time (today US `V170`, Canada `V77`).
  - Update README's feature list in the same task.
- **Ages and years.** Ages are Partner A's age, and a single person is Partner A. The calendar year of age `a` is
  `CURRENT_YEAR + (a - state.ageA)`.

## Rulings made while planning (record in the ledger)

- **Q1, the baseline kind:** `normalizeMarketScenario` accepts `{ kind: 'plan', order }`, meaning "the plan's own rates".
  - The scenario source serves the plan's rates every year: no crash, no history, factor `pow(1 + planInfl, year)`.
  - The text reads "your plan's own rates".
  - This is spec Phasing's "a normalized kind 'plan'". The card never offers it; only the preview baseline and tests use it.
  - If wrong, the cost is small: a test hook could run a no-op scenario.
- **Q2, ages inside the plan:** the card clamps both start ages to `[ageA, L]`, where `L = planLastAge(inputs)`.
  - It also clamps `endAge` to `[atAge + 1, L + 1]`, or keeps it blank.
  - A scenario from the card therefore always starts inside the plan. This answers spec Phasing's "the card states the
    mode or refuses it" by never allowing such a scenario.
  - Saved settings are clamped again on load against the current inputs.
- **Q3, the card's place:** a new shared partial `marketScenarioCard.html`, included just before `<!-- @@include sankeyCard -->`
  in both shells.
  - US: that is right after the plan optimizer card (spec). Canada: right after the meltdown card, its matching spot.
  - The partial starts with `</details>` (it closes the card before it) and leaves its own `<details>` open, for the
    `</details>` that opens `sankeyCard.html`. This is the trick `sankeyCard.html` and `tornadoChart.html` already use.
- **Q4, the preview is in today's dollars always** (spec section 8: "the end value in today's dollars"). It divides by
  `displayValueOf('real', state.inflation, n, r.year, r.cumFactor)`, whatever the real/future-dollars switch says.
- **Q5, the banner copy** becomes the spec's.
  - The text is "Scenario on: {text}. Every number, chart and optimizer below assumes it." and the button reads
    "Revert to my plan".
  - The PR 2 report line and CSV line stay as they are.
  - The banner gets the shortfall banner's look.
  - This settles the owner's open question on PR 2's copy in favour of the spec they approved.
- **Q6, the preview while a scenario is on:** hidden. Its place shows "This scenario is running. Revert to change it."
  - The fields are read-only (disabled), and the Run button becomes Revert.
- **Q7, the historical and Monte Carlo notes keep PR 2's wording.** Canada has no plan modes, so a US-only addition would need
  per-country copy for little gain. Recorded in the topic file.
- **Q8, two PR 2 deferred minors are done here** (both in Task 1):
  - Hoist the double `pricingContextFor(ctx)` in US `roth-optimizer.js` into one `const`.
  - Add a Vitest case that `scheduleRows` carries `factor` exactly when the row has `cumFactor`.

## Review Focus

1. **Card edits must leave the projection alone** (anti-goal 3).
   - Typing in a card field, moving the slider, a chip, or the kind or order switch must not change
     `window.fireProjectionRows`, the saved plan in `localStorage`, or the cliff plan.
   - Those edits never call `render()`, `scheduleRender()` or `saveInputs()`.
   - Tested in Task 2's UI script.
2. **Saved card settings that no longer fit the plan.**
   - Case: Partner A's age moves past the saved crash age, or the plan shortens.
   - On load the ages clamp into `[ageA, L]`. Run then runs what the fields show.
   - Tested in Task 1 (`normalizeCardSettings`).
3. **Broken or missing card storage.** Garbage JSON, a wrong kind, or `localStorage` throwing must all give the defaults, with
   no page error. Tested in Task 1 and in Task 2's script (garbage seeded).
4. **Recovery at 0%.**
   - "Comes back over" is disabled, but its value is kept and the scenario stays valid.
   - The description reads "no recovery".
   - Tested in Task 1, plus a UI check in Task 2.
5. **The card while a scenario is on.**
   - Reset, reload, and Revert from the banner must each put the card back in its Run state, with the fields enabled.
   - The fields must show the settings that were run.
   - Tested in Task 2's UI script.

---

### Task 1: The DOM-free pieces (kind 'plan', the card settings, the market path, windows, summary text)

**Files:**
- Modify: `src/shared/core/inputs/market-scenario.js` (accept `kind: 'plan'`)
- Modify: `src/shared/core/projection/scenario-source.js`
  - The history branch becomes `else if (sc.kind === 'history')`, so kind 'plan' gets the plan's rates.
  - Add `scenarioMarketPath`.
- Modify: `src/shared/core/format/market-scenario-text.js`
  - Export `planLastAge(inputs)`, the `L` it already computes.
  - Add the kind 'plan' text.
  - Add `marketScenarioWindows`.
- Create: `src/shared/core/inputs/market-scenario-card.js`
  - Purpose line: "The market scenario card's settings: presets, defaults, clamps and the scenario they run".
- Create: `src/shared/core/format/market-scenario-preview-text.js`
  - Purpose line: "The market scenario preview's one-line summary".
- Modify: `src/us/ui/results/roth-optimizer.js` (Q8: one `const price = pricingContextFor(ctx)`)
- Test: `tests/unit/shared/market-scenario-card.test.js` (new)
- Test: `tests/unit/shared/market-scenario-text.test.js` (extend)
- Test: `tests/unit/shared/scenario-source.test.js` (extend)
- Test: `tests/unit/shared/market-scenario-normalize.test.js` (extend)
- Test: the US `scheduleRows` test file (extend; find it with `grep -rl scheduleRows tests/unit`)

**Interfaces:**
- Consumes: `normalizeMarketScenario`, `scenarioYearSource`, `describeMarketScenario` and `HIST` (PR 1 and PR 2).
- Produces:
  - **`normalizeMarketScenario({ kind: 'plan', order })`** returns `{ kind: 'plan', order }`.
  - **`describeMarketScenario`** for kind 'plan' returns `"your plan's own rates; {order suffix}"`.
  - **`planLastAge(inputs) -> number`** is `ageA + projectionYears`. It uses the same formula `describeMarketScenario`
    already uses, and the describe text switches to it.
  - **`scenarioMarketPath(inputs) -> { ages: number[], plan: number[], scenario: number[] }`**:
    - Indexes `0..P`, where `P = planLastAge(inputs) - inputs.ageA`, and `ages[t] = inputs.ageA + t`.
    - `plan[0] = scenario[0] = 1`.
    - `plan[t+1] = plan[t] * (1 + r)`.
    - `scenario[t+1] = scenario[t] * (1 + stockReturn_t)`, from a fresh `scenarioYearSource(inputs, [])`, calling
      `yearInputs(t)` and then `endOfYear()`.
    - `inputs.marketScenario` must be set.
  - **`marketScenarioWindows(ms, inputs) -> Array<{ fromAge, toAge }>`** gives the ages the scenario changes, both ends
    inclusive, capped at `L`.
    - **A crash** gives `[A, min(L, A + fallYears + (recoverPct > 0 ? recoverYears : 0) - 1)]`, with `A` from the source's
      `t0`, as the text uses it.
      - A crash with `A > L` gives nothing.
      - Windows are not merged.
    - **History** gives `[A1, A2]`, as the text computes them, or nothing for an empty window.
    - **Kind 'plan'** gives `[]`.
  - **`CRASH_PRESETS`**, frozen, in this order. Each is `{ id, label, inflation, bondReturn }`, with each number the average of the cited `HIST` rows
    (`historical-data.js`), rounded to one decimal and pinned as a literal:
    - `{ id: '2008', label: 'Like 2008', inflation: 0.1, bondReturn: 20.1 }`, from row 2008 [2008, -36.55, 0.11, 20.1, 4.10].
    - `{ id: '2000', label: 'Like 2000–02', inflation: 2.4, bondReturn: 12.5 }`, from rows 2000-2002 (inflation 3.39, 1.55,
      2.38; bonds 16.66, 5.57, 15.12).
    - `{ id: '1973', label: 'Like 1973–74', inflation: 10.5, bondReturn: 2.8 }`, from rows 1973-1974 (inflation 8.71, 12.34;
      bonds 3.66, 1.99).
    - `{ id: '2022', label: 'Like 2022', inflation: 6.5, bondReturn: -17.8 }`, from row 2022 [2022, -18.04, 6.45, -17.83, 1.47].
  - **`defaultCardSettings(inputs)`** returns
    `{ kind: 'crash', order: 'bucket', crash: { age: R, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, preset: '2008', inflation: 0.1, bondReturn: 20.1 }, history: { startYear: 2000, atAge: R, endAge: null } }`.
    - Here `R` is `inputs.retireAgeA` clamped to `[ageA, L]`.
  - **`normalizeCardSettings(raw, inputs)`** always returns a full settings object.
    - Start from the defaults. Each field of `raw` that is valid replaces its default.
    - Clamps:
      - `kind`: `'crash'` or `'history'`.
      - `order`: `'bucket'` or `'standard'`.
      - Crash and history numbers: the ranges `normalizeMarketScenario` uses.
      - `age` and `atAge`: `[ageA, L]`.
      - `endAge`: `null`, or `[atAge + 1, L + 1]`.
      - `preset`: one of the four ids or `'custom'`. A preset id whose numbers differ from `inflation` / `bondReturn`
        becomes `'custom'`.
    - Garbage (not an object, a JSON string, `null`) gives the defaults.
  - **`cardSettingsToScenario(s) -> raw marketScenario`**:
    - A crash gives `{ kind: 'crash', order, crashes: [{ age, drop, fallYears, recoverPct, recoverYears, inflation, bondReturn }] }`.
    - History gives `{ kind: 'history', order, history: { startYear, atAge, endAge } }`.
  - **`previewSummaryText({ scenDepletedAge, baseDepletedAge, lastAge, scenEnd, baseEnd }, fmt) -> string`**:
    - The format is `"Lasts to {a} instead of {b} · ends with {fmt(scenEnd)} instead of {fmt(baseEnd)} (today's $)"`.
    - `{a}` / `{b}` are `age N` for a depleted run, or `age {lastAge}+` when the money lasts.
    - When both are equal, it reads `"Lasts to {a} in both · ends with … (today's $)"`.

- [ ] **Step 1: Write the failing tests.**
  - Write literals by hand, and check each against `node -p` once.
  - **`market-scenario-card.test.js`**:
    - Defaults for a couple and for a single person.
    - The clamps:
      - A saved crash age below `ageA` reads `ageA`, and one above `L` reads `L`.
      - `endAge` equal to `atAge` reads `atAge + 1`.
      - A blank `endAge` stays `null`.
    - Garbage gives the defaults: a string, `null`, `{ kind: 'x' }`.
    - `recoverPct: 0` keeps `recoverYears`, and `cardSettingsToScenario` passes the value through.
    - A changed inflation makes a preset `'custom'`.
    - `CRASH_PRESETS` equals the literal list above (`toStrictEqual`).
    - The cited `HIST` rows hold the cited values. Read `HIST` through `w.load` as data.
    - `cardSettingsToScenario` for both kinds and both orders, then through `normalizeMarketScenario`, equals the literal.
  - **The text tests**:
    - Kind 'plan' text.
    - `planLastAge` for a single person and for a couple whose B outlives A.
    - `marketScenarioWindows`:
      - 35% at age 60, falling over 2 years, 60% back over 4: `[{ fromAge: 60, toAge: 65 }]`.
      - The same crash with `recoverPct: 0`: `[{ fromAge: 60, toAge: 61 }]`.
      - A crash past `L`: `[]`.
      - History 2008 at age 60 with `endAge` 63: `[{ fromAge: 60, toAge: 62 }]`.
      - Kind 'plan': `[]`.
  - **`scenario-source.test.js`**:
    - `scenarioMarketPath` with plan return 7, a crash at `ageA + 1` dropping 30% over 1 year with `recoverPct: 0`:
      - `plan[1] = 1.07`.
      - `scenario[1] = 1.07`.
      - `scenario[2]` is about `0.80143`: `1.07 * (1 + ((1 + 0.07) * 0.7 / 1 - 1))` (year 1 is the fall year, level 0.7).
      - `scenario[3]` is `scenario[2] * 1.07` (recoverPct 0 keeps the level at 0.7, so the return is the plan's).
      - Write each as the exact literal `node -p` prints for the code's own multiplication order.
      - Check each literal with `node -p`, and multiply in the order the code does.
    - **Kind 'plan' with `order: 'standard'`:** run through `runSourceFor` and the seam `runProjection`. The rows, with
      `cumFactor` deleted, `toStrictEqual` the no-scenario rows. Each `cumFactor` is `toBe(Math.pow(1 + infl, year))`,
      computed in the test (rule 6).
  - **`market-scenario-normalize.test.js`**: `{ kind: 'plan' }` gives `{ kind: 'plan', order: 'bucket' }`.
  - **`previewSummaryText`**: use `fmt = (n) => '$' + n`. One case with both depleted, one with only the scenario depleted, and
    one with equal results.
  - **`scheduleRows`** (Q8): a row with `cumFactor` gives `factor`, and one without gives no `factor` key.
- [ ] **Step 2: Run them to see them fail:** `npx vitest run tests/unit/shared/market-scenario-card.test.js tests/unit/shared/market-scenario-text.test.js tests/unit/shared/scenario-source.test.js tests/unit/shared/market-scenario-normalize.test.js`.
- [ ] **Step 3: Implement the Produces.** Then make the Q8 hoist.
- [ ] **Step 4: Run.**
  - `npm run test:unit`.
  - Each new or changed suite alone, and with `--sequence.shuffle`.
  - `npm run analyze`.
  - `npm test`.
  - Expect everything green, with no snapshot change.
- [ ] **Step 5: Commit** `Market scenarios: card settings, presets, the market path and the baseline kind`.

### Task 2: The card (fields, switches, presets, storage, Run / Revert) and the banner

**Files:**
- Create: `src/shared/partials/marketScenarioCard.html` (Q3). Include it before `<!-- @@include sankeyCard -->` in
  `src/us/index.html` and `src/canada/index.html`.
- Create: `src/shared/ui/plans/market-scenario-card.js`
  - Purpose line: "The market scenario card: its fields, settings storage and Run / Revert".
- Modify: `src/shared/styles/styles.css` (the card's field grid, chips and banner rules; see Step 3)
- Modify: `src/shared/ui/results/market-scenario-banner.js` and `src/shared/partials/marketScenarioBanner.html` (Q5)
- Modify: US and Canada `src/<country>/ui/results/render.js`. In `renderBody`, call `renderMarketScenarioCardState()` next to
  `renderMarketScenarioBanner()`. It is cheap and is not the preview.
- Modify: `src/us/main.js` and `src/canada/main.js` (call `wireMarketScenarioCard()`)
- Create: root `test_market_scenario.js`

**Interfaces:**
- Consumes:
  - Task 1's `normalizeCardSettings`, `cardSettingsToScenario`, `CRASH_PRESETS` and `planLastAge`.
  - PR 2's `runMarketScenario`, `revertMarketScenario` and `scenarioSnapshot` (`src/shared/ui/plans/market-scenario-*.js`),
    and `describeMarketScenario`.
  - `state` from `store.js`, and `CURRENT_YEAR`.
- Produces:
  - **`cardSettings`**, a live binding. `assignCardSettings(s)` saves it to the storage key.
  - **`renderMarketScenarioCardState()`**:
    - Fills the fields from `cardSettings`. While `scenarioSnapshot` is set, it shows the settings of the running scenario.
    - Shows the kind's fields.
    - Disables or enables the fields.
    - Sets the button text and the description line.
  - **`wireMarketScenarioCard()`**:
    - Loads the settings with try/catch and `normalizeCardSettings(parsed, state)`.
    - Wires every control.
    - Wires the card's `toggle` listener, which calls `render()` on open, as `wireSensitivityCard` does.
  - **`schedulePreview()`**: a no-op in this task. Task 3 fills it, and it is the only thing a card edit triggers.

**Markup and copy** (verbatim):
- **Card shell and intro.**
  - `<details class="result-card" id="marketScenarioCard">`.
  - The summary is `Market scenario`, styled like the plan optimizer card's summary, and holds a
    `<span id="marketScenarioOnTag" hidden> · on</span>`.
  - The intro `<p>` (muted, as the other cards): "Try a market of your own: a crash, or real history from a year you pick.
    Preview it here, then run it to plan inside it."
- **The kind switch:** a `.chart-view-toggle` `role="radiogroup"` `aria-label="Scenario kind"`, with buttons `Custom crash` and
  `Real history`.
- **The order switch:** a second toggle, `aria-label="Withdrawals in down years"`, with buttons `Bonds first in down years` and
  `My normal order`. Before it sits the label "Withdrawals" with an info tip whose text is:
  "Bonds first: in a year stocks fall, spending comes from cash and bonds first, then stocks. In an up year stocks are drawn
  first and the bond reserve is refilled. My normal order: the planner's usual withdrawal order, as with no scenario."
- **The crash fields** go in a `.ms-fields` grid. Each is a `<label>` with a `<small>` descriptor, then an `<input type="number">`:
  - "Hits at age". The descriptor is an `<output id="msCrashYear">` showing `(2034)`.
  - "Drop" (`%`), descriptor "Fall from peak to bottom".
  - "Falls over", descriptor "Years".
  - The recovery: an `<input type="range" min="0" max="100" step="5">` labelled "Recovery".
    - Its `<output>` reads "{p}% of the loss comes back".
    - The hint line is "0% = permanent loss · 100% = back on your plan's line".
  - "Comes back over", descriptor "Years; not used at 0%". It is disabled at 0%.
- **The presets:** a chip row (a `.chart-view-toggle`, `aria-label="Inflation and bonds during the fall"`) with the four preset
  labels and `Custom`. Then two fields:
  - "Inflation", descriptor "% a year during the fall".
  - "Bond return", descriptor "% a year during the fall".
  - Typing in either switches the chip to Custom. A chip sets both numbers.
- **The history fields:**
  - "Start from year", descriptor "1928–2025".
  - "At age", with a year `<output>`.
  - "End at age", descriptor "Optional; blank = until the data ends".
- **The description and the button:**
  - `<p id="msDescription">` holds `describeMarketScenario(normalizeMarketScenario(cardSettingsToScenario(s)), state,
    CURRENT_YEAR)`, with its first letter capitalized.
  - `<button type="button" class="btn-card" id="msRunBtn">` reads `Run this scenario`, or `Revert` while on.
  - While on, the preview's place (Task 3) shows `<p id="msRunningNote">`: "This scenario is running. Revert to change it."
- **The banner (Q5):**
  - The text is "Scenario on: {text}. Every number, chart and optimizer below assumes it."
  - The button reads `Revert to my plan`.
  - The banner element's class is `callout shortfall-banner`, keeping its id.
  - Make it a flex row with the button at the end, without changing `.shortfall-banner`'s other users: add an id-scoped rule.

- [ ] **Step 1: Write `test_market_scenario.js`** (both planners). Reuse `test_market_scenario_mode.js`'s `open`, `reload`,
  `rows` and `saved` helpers by copying them; do not import across root scripts. Use no fixed waits. Exit 1 on any failure.
  - **Setup and defaults.**
    - Seed a saved plan as that script does, and seed `fireCouplePlanner.marketScenarioCard.v1` with `'not json'`.
    - The page loads with no page error.
    - Open the card. It shows the defaults: drop 35, recovery 60, and the Like 2008 chip active.
  - **Edits leave the projection alone (Review Focus 1).**
    - Record the rows' JSON and the flushed plan key.
    - Change the drop, the slider, a chip, the kind and the order.
    - The rows' JSON and the plan key are both unchanged.
    - The card key holds the new settings.
  - **Recovery at 0% (Review Focus 4).** The slider at 0 disables "Comes back over", and the description contains "no recovery".
  - **Reload.** The card shows the saved settings.
  - **Run and while on.**
    - Click Run. The rows differ, the banner is visible with "Scenario on:", the fields are disabled, the button reads
      Revert, and the summary tag is visible.
  - **Reload while on (Review Focus 5).** There is no scenario, the card is in its Run state, and the fields are enabled and
    show the settings that were run.
  - **Revert from the card.**
    - Run again, then click the card's Revert. The rows equal the recorded JSON exactly.
  - **Reset while on.** Run again, then Reset (accept the dialog). The card is in its Run state.
  - **Revert from the banner.** Run again, then click the banner's button. The card is in its Run state.
  - **Real history.** Set start 2008 at age `ageA + 2`. The description contains "real markets 2008". Run changes the rows.
  - **Mobile.** At 390×844, with the card open for each kind and the banner shown, `scrollWidth > clientWidth` is false.
- [ ] **Step 2: Build and run it to see it fail** (`npm run build`, then `node test_market_scenario.js`).
- [ ] **Step 3: Implement the markup, styles, module and banner change.**
  - **Card edits.** A card edit calls `assignCardSettings`, `renderMarketScenarioCardState()` and `schedulePreview()`.
    Nothing else.
  - **Run** calls `runMarketScenario(cardSettingsToScenario(cardSettings))`.
  - **Revert** calls `revertMarketScenario()`.
  - **The field registry test.** If `tests/field_registry.js` (or the test that lists every control) objects to the new
    inputs, exclude them the way it already excludes `#sankeyAge` and the safe-withdrawal-rate input. They are not state
    fields.
  - **CSS.** Add `.ms-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 14px}` and the
    banner's flex rule. Use existing tokens only, so dark mode works.
- [ ] **Step 4: Run.**
  - `npm run build`.
  - `node test_market_scenario.js`.
  - `node test_market_scenario_mode.js`: its banner text check may need the new wording; update it.
  - `npm test`. Update the UI snapshot baselines; the engine snapshots stay unchanged.
- [ ] **Step 5: Commit** `Market scenarios: the card, its settings and Run / Revert`.

### Task 3: The preview, the main chart's marking, README, badges and docs

**Files:**
- Create: `src/shared/ui/charts/mini-line-chart.js`
  - Purpose line: "A small two-line canvas chart (the market scenario preview)".
  - Export `drawMiniLines(canvas, { xs, series, yFormat })`.
  - `series` is `[{ values, color, dash }]`. The canvas is 120 CSS px tall, with the same dpr and colors as the other
    charts (`chart-colors.js`).
  - Draw two y gridlines with `yFormat` labels, the first and last x labels, and the lines.
- Create: `src/shared/ui/results/market-scenario-preview.js`
  - Purpose line: "The market scenario card's preview: the market and portfolio charts and the summary".
  - Export `renderMarketScenarioPreview()`.
  - Task 2's `schedulePreview` (in the card module) debounces it by 250 ms.
- Modify: `src/shared/partials/marketScenarioCard.html` (the preview block)
  - Two canvases (`#msMarketChart`, `#msPortfolioChart`) with legends.
  - The market legend reads `Your plan's line` and `Scenario`. The portfolio legend reads `Your plan` and
    `Through the scenario`.
  - `<p id="msSummary">`.
  - An info tip after the portfolio legend: "Both lines replay your current plan with the same withdrawal order. The only
    difference is the market, so the gap is the scenario alone."
- Modify: `src/shared/ui/results/render-scheduler.js` (add `'marketScenarioCard'` to `DEFERRED_CARDS`)
- Modify: US and Canada `renderOpenCards` (when the card is open and not hidden, call `renderMarketScenarioPreview()`)
- Modify: `src/shared/ui/charts/projection-chart.js` and `src/shared/ui/charts/chart-hover.js` (the scenario band), and both
  `chart-view.js` (pass the option)
- Modify: `README.md`, both version badges, `docs/architecture/market-scenarios.md`, `docs/architecture/inputs-and-ui.md`,
  `docs/architecture/test-inventory.md`, and `npm run analyze`
- Modify: `test_market_scenario.js` (extend)

**Interfaces:**
- Consumes:
  - Task 1's `scenarioMarketPath`, `marketScenarioWindows`, `previewSummaryText`, the kind 'plan' and `planLastAge`.
  - Task 2's `cardSettings`.
  - `simulate`, `simulateWith`, `stateContextFor` and `displayValueOf`.
- Produces:
  - **`renderMarketScenarioPreview()`.** While `scenarioSnapshot` is set, it hides the preview, shows `#msRunningNote` and
    returns. Otherwise:
    - **Inputs.** `ms = normalizeMarketScenario(cardSettingsToScenario(cardSettings))` and `ctxFor = stateContextFor()`.
    - **Runs.**
      - `scen = simulateWith(ctxFor({ ...state, marketScenario: ms }))`.
      - `base = ms.order === 'standard' ? simulate() : simulateWith(ctxFor({ ...state, marketScenario: { kind: 'plan', order: 'bucket' } }))`.
      - In the US, `stateContextFor` gives both runs the kept plan (`variantContext`'s base rule). The baseline is the same
        plan and the same order with no crash (spec section 5).
    - **Market chart.** `scenarioMarketPath({ ...state, marketScenario: ms })`, with `plan` in the muted color, dashed, and
      `scenario` in red. The x axis is ages.
    - **Portfolio chart.** Each run's `r.total` through `displayValueOf('real', state.inflation, r.total, r.year, r.cumFactor)`
      (Q4). `base` is drawn blue and `scen` red.
    - **Summary.** `previewSummaryText({ scenDepletedAge: scen.depletedAge ?? null, baseDepletedAge: base.depletedAge ?? null,
      lastAge: planLastAge(state), scenEnd, baseEnd }, compactMoney)`, using the planner's existing compact money formatter
      (the one the tiles use).
  - **The scenario band.** `renderChart(series, valueFn, opts)` gains an `opts` argument with `{ marketBand: boolean }`.
    - `lastChart` stores `opts`, and `chart-hover.js` passes `lastChart.opts` back.
    - With `opts.marketBand` set and `scenarioSnapshot` set, it draws `marketScenarioWindows(state.marketScenario, state)`.
      - Each window is a translucent band (`rgba(220,76,100,.08)`, and `.14` in dark mode via `isDarkTheme()`).
      - Bands span `x(fromAge)` to `x(toAge + 1)`, clipped to the plot.
      - They are drawn after the zero line and before the series.
    - Only the projection views pass `{ marketBand: true }`: the CAGR sweep and the retirement-date views
      (`chart-view.js` :185 and :280 US, :167 and :262 Canada). The historical view (:120) does not.

- [ ] **Step 1: Extend `test_market_scenario.js`.** With the card open and no scenario:
  - `#msSummary` matches `/^Lasts to .* · ends with .* \(today's \$\)$/`.
  - Both canvases have a nonzero width.
  - After a card edit and the debounce (wait on `#msSummary` text changing, not on a timer), the summary text changes.
  - The rows are still unchanged.
  - With order "My normal order" and a drop of 0, the summary reads "in both".
  - While a scenario is on, `#msRunningNote` is visible and the canvases are hidden.
- [ ] **Step 2: Build and run it to see it fail.**
- [ ] **Step 3: Implement the preview, the deferred registration and the band.**
  - The card's `toggle` open already calls `render()`, which reaches `renderOpenCards`.
  - The scheduler's light render marks the open card stale, as it does for the other cards.
- [ ] **Step 4: Write the docs, README and badges.**
  - **README:** one bullet under `**Results and analysis**` in `## Features (both planners)`: "A Market scenario card: design
    a crash (depth, timing, how much comes back and how fast, with inflation and bond presets from real episodes) or replay
    real market history from a chosen year and age, preview it against your plan, then run the whole planner inside it,
    optimizers included, and revert with one click."
  - **Badges:** bump both (Global Constraints).
  - **`market-scenarios.md`:**
    - A "The card" section covering the settings module and its key, the clamps (Q2), the presets with their `HIST` rows,
      the preview's two runs and baseline (Q1, Q4), the deferred registration, the band, and Q5-Q7.
    - Drop the PR 3 line from "What PR 2 and PR 3 still owe".
    - The follow-up stays.
  - **`inputs-and-ui.md`:** the card's storage key, and that card edits never render.
  - **`test-inventory.md`:** the new suites and `test_market_scenario.js`.
  - Then `npm run analyze`.
- [ ] **Step 5: Run.**
  - `npm test`.
  - `node tests/ui_scripts.js test_market_scenario.js test_market_scenario_mode.js`.
  - `npm run test:ui`.
  - `node tests/bench_runs_interleaved.js --warm-analysis`.
  - Expect everything green and the benchmark within noise.
- [ ] **Step 6: Commit** `Market scenarios: the preview, the chart's scenario band, README and badges`.
