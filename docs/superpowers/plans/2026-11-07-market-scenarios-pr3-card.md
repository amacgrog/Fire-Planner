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
  - The card's storage key is per country: `storageKey + '.marketScenarioCard'`, with `storageKey` imported from
    `#country/storage-key` (as `src/shared/ui/plans/storage.js` does). Both planners share one origin from `file://` and on
    Pages, so one shared key would carry the US card into Canada.
  - Loading the settings never writes the key (`tests/snapshot_ui.js:166` reads any long stored value as "autosave wrote").
    Only a user edit saves.
  - Every `localStorage` read and write is wrapped in try/catch. The card works with storage blocked.
- **New modules.** Line 1 is a one-line `//` purpose comment, then a blank line, then two-space indented bodies. Run
  `npm run analyze` after adding modules. Each card wiring function is called once from both `main.js` IIFEs.
- **Copy.** Descriptors stay under about 70 characters; anything longer goes in an info bubble (`<span class="info-nw">` +
  `button.info-tip`, whose click handler is the shared delegated one). The exact strings are in the tasks. Use them verbatim.
- **Mobile.** At 390×844, with the card open (both kinds) and with the banner shown, `scrollWidth > clientWidth` stays false.
- **Version badges.** Bump both once in this PR, in Task 2, the first user-facing commit. Each goes to its shell's current
  number + 1 at commit time (today US `V170`, Canada `V77`). Task 3 does not bump again; the PR lands as one batch.
  - README's feature list is updated in Task 3, when the feature is complete.
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
  - The clamps run on load, again on every render (`renderMarketScenarioCardState()` re-normalizes against the live
    `state` and writes the binding back only when it changed, without saving), and once more at Run. A plan change made
    after the card was set (a later ageA, a shorter life expectancy) is therefore caught before anything runs.
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
  - Add a Vitest case that `scheduleRows` carries `factor` exactly when the row has `cumFactor`. It goes in
    `tests/unit/us/roth-optimizer-ages.test.js`, whose `afterAll` count (`c.total`, today 70) goes up by the new checks.
- **Q9, Reset does not reset the card's settings.** They are a separate UI preference, like the cash-flow style.
- **Q10, what is disabled while on:** every card input, the slider, the shape checkbox, and the kind, order and preset
  buttons. The Run/Revert button stays enabled.
- **Q11, presets can carry the stock path too (owner, 2026-11-07).** There are five presets, adding "Like 1929–32" (the Great
  Depression with its long recovery). A checkbox "Also use its stock drop and recovery" (off by default) makes a chip also set
  the drop, fall years, recovery and recovery years.
  - **Why the conversion.** The crash's drop is measured against the plan's line (spec section 3: `q = (1 - D)^(j/F)` multiplies
    the plan's index), not from the market's peak. So the shape is converted with the plan's own return `r`.
    - The scenario bottoms out where the real market did: `1 - D = bottom / (1 + r)^F`.
    - It reaches the real market's level at the end of the recovery: `qEnd = level / (1 + r)^(F + N)`, and
      `recoverPct = (qEnd - (1 - d)) / d`, where `d` is the drop already rounded to a whole percent (the engine runs the
      rounded drop, so the recovery is sized for it).
    - Both are rounded to whole percents and clamped (drop 0-95, recovery 0-100).
  - **A later return change.** The shape depends on `state.returnRate`. When the return changes after a shape preset was
    applied, the numbers are kept and the chip becomes Custom (`normalizeCardSettings`, run on every render, Q2). The card
    never rewrites the user's numbers without a click.
  - A single crash draws a smooth recovery: it cannot show 1937's second fall. The info tip points to Real history for the real
    path.
  - This supersedes spec sections 3 and 5 on the preset list (five, in chronological order) and adds the shape option.
  - The Drop descriptor says "Below your plan's line at the bottom", correcting this plan's earlier "Fall from peak to bottom".
  - The recovery slider steps by 1, so a preset can set a value like 17%.
  - If wrong: the chips set only inflation and bonds, as before.

## Review Focus

1. **Card edits must leave the projection alone** (anti-goal 3).
   - Typing in a card field, moving the slider, a chip, the shape checkbox, or the kind or order switch must not change
     `window.fireProjectionRows`, the saved plan in `localStorage`, or the cliff plan.
   - Those edits never call `render()`, `scheduleRender()` or `saveInputs()`.
   - Tested in Task 2's UI script by a sentinel: `renderBody` replaces `window.fireProjection` on every render
     (`render.js:173`), so a mark set on it before the edits must survive them.
2. **Saved card settings that no longer fit the plan.**
   - Case: Partner A's age moves past the saved crash age, or the plan shortens.
   - The ages clamp into `[ageA, L]` on load and on every render (Q2). Run then runs what the fields show.
   - Tested in Task 1 (`normalizeCardSettings`) and in Task 2's UI script (lower the life expectancy below the crash age).
3. **Broken or missing card storage.** Garbage JSON, a wrong kind, or `localStorage` throwing must all give the defaults, with
   no page error. Tested in Task 1 and in Task 2's script (garbage seeded).
4. **Recovery at 0%.**
   - "Comes back over" is disabled, but its value is kept and the scenario stays valid.
   - The description reads "no recovery".
   - Tested in Task 1, plus a UI check in Task 2.
5. **The card while a scenario is on.**
   - Reset, reload, and Revert from the banner must each put the card back in its Run state, with the fields and the shape
     checkbox enabled.
   - The fields must show the settings that were run.
   - Tested in Task 2's UI script.

6. **A shape preset (Q11).**
   - The converted crash bottoms out at the real market's bottom and reaches the real level at the end of the recovery,
     for the plan's return, within the whole-percent rounding.
   - A later return change turns the chip Custom and keeps the numbers.
   - Tested in Task 1 (`presetCrashShape` literals, the stale-return case) and Task 2's UI script.

---

### Task 1: The DOM-free pieces (kind 'plan', the card settings, the market path, windows, summary text)

**Files:**
- Modify: `src/shared/core/inputs/market-scenario.js` (accept `kind: 'plan'`)
- Modify: `src/shared/core/projection/scenario-source.js`
  - Kind 'plan' gets the plan's rates. Guard **both** history sites: the constructor (`else { histT0 = ... sc.history ... }`,
    near :40, which would throw on kind 'plan') and the history branch in `yearInputs` (near :69). Use one
    `const isHistory = sc.kind === 'history'`.
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
- Modify: `docs/architecture/market-scenarios.md` in this task: "The input" lists kind 'plan' (it says any other kind is off),
  and "The year source" says what kind 'plan' serves. CLAUDE.md wants a topic file updated in the commit that changes its area.
- Test: `tests/unit/shared/market-scenario-card.test.js` (new)
- Test: `tests/unit/shared/market-scenario-text.test.js` (extend)
- Test: `tests/unit/shared/scenario-source.test.js` (extend)
- Test: `tests/unit/shared/market-scenario-normalize.test.js` (extend)
- Test: `tests/unit/shared/run-source.test.js` (extend: the kind 'plan' engine check, through its `setup()`)
- Test: `tests/unit/us/roth-optimizer-ages.test.js` (extend: `scheduleRows`; bump its count)

**Interfaces:**
- Consumes: `normalizeMarketScenario`, `scenarioYearSource`, `describeMarketScenario` and `HIST` (PR 1 and PR 2).
- Produces:
  - **`normalizeMarketScenario({ kind: 'plan', order })`** returns `{ kind: 'plan', order }`.
  - **`describeMarketScenario`** for kind 'plan' returns `"your plan's own rates; {order suffix}"`.
  - **`HIST_FIRST_YEAR`, `HIST_LAST_YEAR`**: exported from `market-scenario-card.js` (`HIST[0][0]`, `HIST.at(-1)[0]`), so the
    card's year descriptor is built from the data, never hard-coded.
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
  - **`CRASH_PRESETS`**, frozen, in this order. Each is `{ id, label, inflation, bondReturn, fallFrom, fallTo, recoverTo }`.
    - `inflation` and `bondReturn` are the averages of the cited `HIST` rows (`historical-data.js`) over the fall years
      `fallFrom..fallTo`, rounded to one decimal and pinned as literals.
    - `recoverTo` is the year the real total-return index got back to its level at the start of `fallFrom` (for the
      Depression, back for good).
    - The presets:
      - `{ id: '1929', label: 'Like 1929–32', inflation: -6.4, bondReturn: 3.7, fallFrom: 1929, fallTo: 1932, recoverTo: 1944 }`
        - Rows 1929-1932: inflation 0.58, -6.4, -9.32, -10.27; bonds 4.2, 4.54, -2.56, 8.79.
        - The index regained its 1929 level briefly in 1936, then lost it in 1937; 1944 is for good.
      - `{ id: '1973', label: 'Like 1973–74', inflation: 10.5, bondReturn: 2.8, fallFrom: 1973, fallTo: 1974, recoverTo: 1976 }`
        - Rows 1973-1974: inflation 8.71, 12.34; bonds 3.66, 1.99.
      - `{ id: '2000', label: 'Like 2000–02', inflation: 2.4, bondReturn: 12.5, fallFrom: 2000, fallTo: 2002, recoverTo: 2006 }`
        - Rows 2000-2002: inflation 3.39, 1.55, 2.38; bonds 16.66, 5.57, 15.12.
      - `{ id: '2008', label: 'Like 2008', inflation: 0.1, bondReturn: 20.1, fallFrom: 2008, fallTo: 2008, recoverTo: 2012 }`
        - Row 2008: [2008, -36.55, 0.11, 20.1, 4.10].
      - `{ id: '2022', label: 'Like 2022', inflation: 6.5, bondReturn: -17.8, fallFrom: 2022, fallTo: 2022, recoverTo: 2023 }`
        - Row 2022: [2022, -18.04, 6.45, -17.83, 1.47].
  - **`presetCrashShape(preset, returnRatePct) -> { drop, fallYears, recoverPct, recoverYears }`** (Q11):
    - `F = fallTo - fallFrom + 1` and `N = recoverTo - fallTo`.
    - `bottom` is the product of `1 + stock/100` over the `HIST` rows `fallFrom..fallTo`, and `level` the same product over
      `fallFrom..recoverTo`. Both are computed inside the function, never at module load.
    - With `r = returnRatePct / 100`:
      - `qb = bottom / Math.pow(1 + r, F)` and `qe = level / Math.pow(1 + r, F + N)`.
      - `drop = clamp(Math.round((1 - qb) * 100), 0, 95)`, then `d = drop / 100`.
      - `recoverPct = drop === 0 ? 0 : clamp(Math.round(((qe - (1 - d)) / d) * 100), 0, 100)` (the zero check first: no
        division by zero).
    - The result is `{ drop, fallYears: F, recoverPct, recoverYears: N }`.
  - **`defaultCardSettings(inputs)`** returns
    `{ kind: 'crash', order: 'bucket', crash: { age: R, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, preset: '2008', presetShape: false, inflation: 0.1, bondReturn: 20.1 }, history: { startYear: 2000, atAge: R, endAge: null } }`.
    - Here `R` is `inputs.retireAgeA` clamped to `[ageA, L]`.
  - **`normalizeCardSettings(raw, inputs)`** always returns a full settings object.
    - Start from the defaults. Each field of `raw` that is valid replaces its default.
    - Clamps:
      - `kind`: `'crash'` or `'history'`.
      - `order`: `'bucket'` or `'standard'`.
      - Crash and history numbers: the ranges `normalizeMarketScenario` uses.
      - `age` and `atAge`: `[ageA, L]`.
      - `endAge`: `null`, or `[atAge + 1, min(L + 1, 120)]`.
      - `preset`: one of the five ids or `'custom'`. A preset id whose numbers differ from `inflation` / `bondReturn`
        becomes `'custom'`.
      - `presetShape`: a boolean (anything else gives `false`).
      - When `presetShape` is true and `preset` is not `'custom'`, a drop, fall years, recovery or recovery years that differs
        from `presetCrashShape(preset, inputs.returnRate)` makes the preset `'custom'` (Q11, a later return change).
    - Garbage (not an object, a JSON string, `null`) gives the defaults.
  - **`cardSettingsToScenario(s) -> raw marketScenario`**:
    - A crash gives `{ kind: 'crash', order, crashes: [{ age, drop, fallYears, recoverPct, recoverYears, inflation, bondReturn }] }`.
    - History gives `{ kind: 'history', order, history: { startYear, atAge, endAge } }`.
  - **`previewSummaryText({ scenDepletedAge, baseDepletedAge, lastAge, scenEnd, baseEnd }, fmt) -> string`**:
    - `{a}` / `{b}` are `age N` for a depleted run (`N` its depleted age), or `age {lastAge}+` when the money lasts.
    - Different ages: `"Lasts to {a} instead of {b} · ends with {fmt(scenEnd)} instead of {fmt(baseEnd)} (today's $)"`.
    - Equal ages (the `{a}` and `{b}` strings are equal): `"Lasts to {a} in both · ends with {fmt(scenEnd)} instead of
      {fmt(baseEnd)} (today's $)"`. The end values are always both shown.
    - `scenEnd` / `baseEnd` are each run's `rows.at(-1).total` in today's dollars (Task 3 computes them).

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
    - `presetCrashShape` at a 7% return gives these hand literals (each checked once against `node -p` while writing):
      - 1929: `{ drop: 73, fallYears: 4, recoverPct: 17, recoverYears: 12 }`
      - 1973: `{ drop: 45, fallYears: 2, recoverPct: 60, recoverYears: 2 }`
      - 2000: `{ drop: 49, fallYears: 3, recoverPct: 33, recoverYears: 4 }`
      - 2008: `{ drop: 41, fallYears: 1, recoverPct: 45, recoverYears: 4 }`
      - 2022: `{ drop: 23, fallYears: 1, recoverPct: 58, recoverYears: 1 }`
    - At a 12% return, 1929 gives `{ drop: 78, fallYears: 4, recoverPct: 0, recoverYears: 12 }` (`toStrictEqual`): its real
      recovery is slower than the plan's line, so the clamp holds.
    - A shape preset applied at 7% (`preset: '1929'`, `presetShape: true`, the 7% shape) normalized against inputs with
      `returnRate: 6` reads `preset: 'custom'` with the same four numbers; against `returnRate: 7` it stays `'1929'`.
    - At a 0% return, 2008 gives `{ drop: 37, fallYears: 1, recoverPct: 100, recoverYears: 4 }` (the index got back above its
      old level, so the recovery clamps at 100).
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
    - `scenarioMarketPath` with plain inputs that include `singlePerson: true`, `ageA`, `lifeExpectancyA`, `inflation` and
      `bondReturn` (without the life expectancy `planLastAge` gives NaN), plan return 7, a crash at `ageA + 1` dropping 30% over 1 year with `recoverPct: 0`:
      - `plan[1] = 1.07`.
      - `scenario[1] = 1.07`.
      - `scenario[2]` is about `0.80143`: `1.07 * (1 + ((1 + 0.07) * 0.7 / 1 - 1))` (year 1 is the fall year, level 0.7).
      - `scenario[3]` is `scenario[2] * 1.07` (recoverPct 0 keeps the level at 0.7, so the return is the plan's).
      - Write each as the exact literal `node -p` prints for the code's own multiplication order.
      - Check each literal with `node -p`, and multiply in the order the code does.
  - **`run-source.test.js`** (its `setup()`, the same path as its first-five-rows test near :106): kind 'plan' with
    `order: 'standard'` through `S.runs.simulateWith(await S.w.ctx())`. Every row, with `cumFactor` deleted,
    `toStrictEqual` the no-scenario run's row. Each `cumFactor` is `toBe(Math.pow(1 + infl, year))`, computed in the test
    (rule 6).
  - **`market-scenario-normalize.test.js`**: `{ kind: 'plan' }` gives `{ kind: 'plan', order: 'bucket' }`.
  - **`previewSummaryText`**: use `fmt = (n) => '$' + n`. Three literals:
    - both depleted (82 and 90): `"Lasts to age 82 instead of age 90 · ends with $0 instead of $5 (today's $)"`;
    - only the scenario depleted, `lastAge` 95: `"Lasts to age 82 instead of age 95+ · ends with $0 instead of $7 (today's $)"`;
    - neither depleted: `"Lasts to age 95+ in both · ends with $3 instead of $7 (today's $)"`.
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
  - **`cardSettings`**, a live binding (`null` until wired). `assignCardSettings(s, { save = true } = {})` sets it, and saves
    it to the storage key unless `save` is false. Loading and the render-time re-clamp pass `save: false`.
  - **`renderMarketScenarioCardState()`**:
    - Does nothing while `cardSettings === null`.
    - Re-normalizes `cardSettings` against the live `state` (Q2) and assigns the result with `save: false` when it changed.
    - Fills the fields from `cardSettings`, skipping the element that has focus (`document.activeElement`), so typing is
      never overwritten. While `scenarioSnapshot` is set, it shows the settings of the running scenario.
    - Shows the kind's fields.
    - Disables or enables the fields.
    - Sets the button text and the description line.
  - **`wireMarketScenarioCard()`**, called in both `main.js` right after `wireMarketScenarioBanner()` (before the first
    render, which is `setMode(mode)`):
    - Loads the settings with try/catch and `normalizeCardSettings(parsed, state)`, assigned with `save: false`.
    - Wires every control.
    - Wires the card's `toggle` listener, which calls `render()` on open, as `wireSensitivityCard` does.
  - **`schedulePreview()`**: a no-op in this task. Task 3 fills it, and it is the only thing a card edit triggers.

**Markup and copy** (verbatim). Element ids: inputs `msCrashAge`, `msDrop`, `msFallYears`, `msRecover` (the range),
`msRecoverYears`, `msInflation`, `msBondReturn`, `msHistStart`, `msHistAge`, `msHistEnd`; outputs `msCrashYear`,
`msRecoverOut`, `msHistYear`; the checkbox `msPresetShape`; buttons `msKindCrash`, `msKindHistory`, `msOrderBucket`,
`msOrderStandard`, `msPreset1929`, `msPreset1973`, `msPreset2000`, `msPreset2008`, `msPreset2022`, `msPresetCustom`, `msRunBtn`; blocks `msCrashFields`, `msHistoryFields`,
`msDescription`, `msRunningNote`. None collides with a sidebar field.
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
  - "Drop" (`%`), descriptor "Below your plan's line at the bottom", with an info tip: "Measured against your plan's line,
    which keeps growing at your return rate while the market falls. With 'Also use its stock drop and recovery', a preset
    converts the real market's fall and recovery to this measure for your return rate."
  - "Falls over", descriptor "Years".
  - The recovery: an `<input type="range" min="0" max="100" step="1">` labelled "Recovery".
    - Its `<output>` reads "{p}% of the loss comes back".
    - The hint line is "0% = permanent loss · 100% = back on your plan's line".
  - "Comes back over", descriptor "Years; not used at 0%". It is disabled at 0%.
- **The presets:** a chip row (a `.chart-view-toggle`, `aria-label="Real episodes"`) with the five preset labels and
  `Custom`. Under it, the checkbox "Also use its stock drop and recovery", with an info tip: "Off: a preset sets only the
  inflation and bond returns during the fall. On: it also sets the drop, the fall years and the recovery, so the crash bottoms
  out and climbs back the way the real market did. One crash draws a smooth recovery; for the real year-by-year path (like
  1937's second fall), use Real history." Then two fields:
  - "Inflation", descriptor "% a year during the fall".
  - "Bond return", descriptor "% a year during the fall".
  - Typing in either switches the chip to Custom. A chip sets both numbers.
  - With the checkbox on, a chip also sets drop, fall years, recovery and recovery years from
    `presetCrashShape(preset, state.returnRate)`. Editing any of those four while a preset chip is active switches it to Custom.
  - Ticking the checkbox while a preset chip is active applies that preset's shape at once; unticking changes no number.
- **The history fields:**
  - "Start from year", descriptor "{HIST_FIRST_YEAR}–{HIST_LAST_YEAR}" (set from Task 1's constants; today "1928–2025").
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
  - Make it a flex row (`flex-wrap:wrap`) with the button at the end, without changing `.shortfall-banner`'s other users:
    add an id-scoped rule.

- [ ] **Step 1: Write `test_market_scenario.js`** (both planners). Reuse `test_market_scenario_mode.js`'s `open`, `reload`,
  `rows` and `saved` helpers by copying them; do not import across root scripts. Use no fixed waits. Exit 1 on any failure.
  - **Setup and defaults.**
    - Seed a saved plan as that script does, and seed `fireCouplePlanner.marketScenarioCard.v1` with `'not json'`.
    - The page loads with no page error.
    - Open the card. It shows the defaults: drop 35, recovery 60, the Like 2008 chip active, and the shape checkbox off.
  - **Presets with the shape (Q11).** Tick the checkbox and click Like 1929–32. The drop, fall years, recovery and recovery
    years read `73`, `4`, `17` and `12` (the seed sets `returnRate: 7`; add it to the seed if it lacks it), and the inflation
    field reads -6.4. Unticking the checkbox changes no number. Editing the drop switches the chip to Custom.
  - **Edits leave the projection alone (Review Focus 1).**
    - Record the rows' JSON and the flushed plan key.
    - Change the drop, the slider, a chip, the shape checkbox (and a chip with it on), the kind and the order.
    - Before the edits, set `window.fireProjection.__mark = 1`. After them (and a `__test_flushRender()`), the mark is still
      there: no render ran.
    - The rows' JSON and the plan key are both unchanged.
    - The card key (`<plan key>.marketScenarioCard`) holds the new settings, and the other planner's card key is untouched.
  - **Recovery at 0% (Review Focus 4).** The slider at 0 disables "Comes back over", and the description contains "no recovery".
  - **Reload.** The card shows the saved settings.
  - **A plan change after the card was set (Review Focus 2).** Set the crash age to `L`, then lower the life expectancy
    field by 5 and flush. The card's age field reads the new `L`.
  - **Run and while on.**
    - Click Run. The rows differ, the banner is visible with "Scenario on:", the fields, the shape checkbox and the kind,
      order and preset buttons are disabled, the button reads Revert, and the summary tag is visible.
    - After a `pagehide` flush, the plan key has no `marketScenario` and equals its value before Run (spec Constraints:
      autosave holds the real settings).
  - **Reload while on (Review Focus 5).** There is no scenario, the card is in its Run state, and the fields are enabled and
    show the settings that were run.
  - **Revert from the card.**
    - Run again, then click the card's Revert. The rows equal the recorded JSON exactly.
  - **Reset while on.** Run again, then Reset (accept the dialog). The card is in its Run state.
  - **Revert from the banner.** Run again, then click the banner's button. The card is in its Run state.
  - **Real history.** Set start 2008 at age `ageA + 2`. The description contains "real markets 2008". Run changes the rows.
  - **Mobile and tablet.** At 390×844 and at 768×1024, with the card open for each kind and the banner shown,
    `scrollWidth > clientWidth` is false.
- [ ] **Step 2: Build and run it to see it fail** (`npm run build`, then `node test_market_scenario.js`).
- [ ] **Step 3: Implement the markup, styles, module and banner change.**
  - **Card edits.** A card edit calls `assignCardSettings`, `renderMarketScenarioCardState()` and `schedulePreview()`.
    Nothing else.
  - **Run** calls `runMarketScenario(cardSettingsToScenario(cardSettings))`.
  - **Revert** calls `revertMarketScenario()`.
  - **Typing.** On `input`, store a field only when it parses as a number (a blank End at age stores `null`), and never
    clamp or rewrite the box being typed in. Clamp and write back on `change`.
  - **The field registry test.** `tests/field_registry.js` fails on any input with an id outside `FIELDS`: add every new
    input id above, including the checkbox `msPresetShape`, to its `UI_ONLY` list (near :19). They are not state fields.
  - **CSS.** Add `.ms-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 14px}`,
    `#marketScenarioCard .chart-view-toggle{flex-wrap:wrap;max-width:100%}` (the shared toggle wraps only under 520 px),
    and the banner's flex rule. Use existing tokens only, so dark mode works.
  - **Badges:** bump both here (Global Constraints).
- [ ] **Step 4: Run.**
  - `npm run build`.
  - `node test_market_scenario.js`.
  - `node test_market_scenario_mode.js`: change its `^Market scenario on:` banner regex (near :91) to `^Scenario on:`.
  - `npm test`. Update the UI snapshot baselines; the engine snapshots stay unchanged.
- [ ] **Step 5: Commit** `Market scenarios: the card, its settings and Run / Revert` (say in the message that the UI
  snapshot baselines changed for the new markup).

### Task 3: The preview, the main chart's marking, README and docs

**Files:**
- Create: `src/shared/ui/charts/mini-line-chart.js`
  - Purpose line: "A small two-line canvas chart (the market scenario preview)".
  - Export `drawMiniLines(canvas, { xs, series, yFormat })`.
  - `series` is `[{ values, color, dash }]`. The canvas is 120 CSS px tall, with the same dpr and colors as the other
    charts (`chart-colors.js`).
  - Draw two y gridlines with `yFormat` labels, the first and last x labels, and the lines.
- Create: `src/shared/ui/results/market-scenario-preview.js`
  - Purpose line: "The market scenario card's preview: the market and portfolio charts and the summary".
  - Export `renderMarketScenarioPreview(settings)`. It takes the settings as an argument, so it does not import the card
    module (no cycle). Task 2's `schedulePreview` (in the card module) debounces it by 250 ms and passes `cardSettings`;
    `renderOpenCards` passes `cardSettings` too.
  - Redraw on the card's resize as `sankey.js` (near :407) does, only while the card is open.
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
      lastAge: planLastAge(state), scenEnd, baseEnd }, compact)`, where `scenEnd` / `baseEnd` are each run's
      `rows.at(-1).total` through `displayValueOf('real', ...)` and `compact` is `src/shared/core/format/numbers.js`'s.
      `simulateWith` is `src/shared/core/projection/runs.js`'s (uncached); `simulate` is `simulate.js`'s.
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
  - With a 90% drop and no recovery at the earliest age (the seed's money then runs out under the scenario only), the
    summary starts `Lasts to age ` and contains ` instead of age `.
  - While a scenario is on, `#msRunningNote` is visible and the canvases are hidden.
- [ ] **Step 2: Build and run it to see it fail.**
- [ ] **Step 3: Implement the preview, the deferred registration and the band.**
  - The card's `toggle` open already calls `render()`, which reaches `renderOpenCards`.
  - The scheduler's light render marks the open card stale, as it does for the other cards.
- [ ] **Step 4: Write the docs, README and badges.**
  - **README:** one bullet under `**Results and analysis**` in `## Features (both planners)`: "A Market scenario card: design
    a crash (depth, timing, how much comes back and how fast, with presets from real episodes, from the Great Depression to
    2022, that can also set the drop and recovery) or replay
    real market history from a chosen year and age, preview it against your plan, then run the whole planner inside it,
    optimizers included, and revert with one click."
  - **`market-scenarios.md`** (its heading is "What PR 3 still owes"):
    - A "The card" section covering the settings module and its key, the clamps (Q2), the presets with their `HIST` rows and the shape conversion (Q11),
      the preview's two runs and baseline (Q1, Q4), the deferred registration, the band, and Q5-Q7.
    - Drop the PR 3 line from "What PR 3 still owes" (keep the follow-up).
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
- [ ] **Step 6: Commit** in two commits: `Market scenarios: the card's preview` (the preview, the mini chart, the deferred
  registration, its UI checks) and `Market scenarios: the chart's scenario band, README and docs`.
