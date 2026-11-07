# Market scenarios PR 4: Add another crash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementers run on Sonnet; every review runs on Opus (owner).

**Goal:** Let the card hold several crashes, each one a one-line summary row with one row open for editing. Make "Like 1929–44"
(with the shape box on) one entry that runs as two crashes: the 1929–32 fall and its recovery to 1936, then the 1937 fall and
the recovery to 1944. Also fold in PR 3's follow-ups.

**Architecture:** The card's settings change from one `crash` object to a `crashes` list. The engine's `marketScenario` data
model is unchanged (PR 1 already takes up to 10 crashes that stack). The DOM-free half stays in
`src/shared/core/inputs/market-scenario-card.js`:
- the list,
- the cap counting,
- the Depression entry's hidden second leg,
- the conversion to the engine's crash list.

New `core/format/` text gives the rows and the second-leg note. The card keeps **one** set of field elements (the PR 3 ids)
and moves it under the open row, so the field ids, `tests/field_registry.js` and the PR 3 wiring stay as they are. The PR 3
follow-ups are:
- a pure move of `planLastAge` and the shared number helpers,
- no clamping mid-typing,
- `Math.trunc` in the canvas-width check,
- a real typing test,
- the US-only clause in the portfolio tip.

**Tech Stack:** Plain ES modules under `src/`, esbuild, Vitest through `world()`, Playwright root UI scripts.

**Spec:** `docs/superpowers/specs/2026-11-06-market-scenarios-design.md`, section "PR 4: Add another crash (design, 2026-11-07)",
approved by the owner on 2026-11-07. Background: `docs/architecture/market-scenarios.md` ("Card helpers" and "The card (PR 3)")
and PR 3's plan, `docs/superpowers/plans/2026-11-07-market-scenarios-pr3-card.md`. The branch is based on `main` at 76bc501 (#91 merged).

## Global Constraints

- **No scenario means no change.** With no `marketScenario`, every engine snapshot (US 541, Canada 376) and golden test stays
  unchanged. The UI snapshot baselines (`tests/snapshots/ui_*.json`) may change in Task 2 (the chip label) and in Task 3 (the
  new markup). Update them with `node tests/snapshot_ui.js --update` in the commit that changes them, and say so in its message.
- **The engine data model is untouched.** `normalizeMarketScenario`, `scenarioYearSource`, `runSourceFor` and the fingerprint
  do not change. The banner, report, CSV and card description describe a Depression entry as two plain crashes (owner). Only
  the card's summary row names it.
- **Benchmark.** `node tests/bench_runs_interleaved.js --warm-analysis` shows no regression (Task 4).
- **Engine and Vitest rules** are as in CLAUDE.md:
  - New `core/` code imports no store module and nothing from `ui/`.
  - Go through `world()`, and use exact `toBe` / `toStrictEqual`.
  - Write hand-computed literals, and never use `toBeCloseTo`.
  - Rule 6 applies: a value that rests on `Math.pow` is a literal checked once with `node -p`, or is computed in the test.
- **UI state.** A module-level `let` is assigned only in its own module. The card's storage key is still
  `storageKey + '.marketScenarioCard'`.
  - Loading never writes the key. Only a user edit saves.
  - Every storage access stays in try/catch.
- **Card edits leave the projection alone** (PR 3 Review Focus 1, spec anti-goal 3). Add, Remove, opening a row, a chip and
  typing in any row never call `render()`, `scheduleRender()` or `saveInputs()`.
  - Add, Remove, a chip and typing end in `assignCardSettings`, `renderMarketScenarioCardState()` and `schedulePreview()`, as
    PR 3's `edit()` does.
  - Opening a row calls only `renderMarketScenarioCardState()` (no save, no preview: the settings did not change). Clicking
    the header of the row that is already open does nothing.
- **New modules.** Line 1 is a one-line `//` purpose comment, then a blank line, then two-space indented bodies. Run
  `npm run analyze` after adding or moving a module, or after changing exports.
- **Copy.** The exact strings are in the tasks. Use them verbatim. Descriptors stay under about 70 characters.
- **Mobile.** At 390×844, with the card open and three crash rows, `scrollWidth > clientWidth` stays false.
- **Version badges.** Bump both once, in Task 2, the first user-facing commit (it changes the chip and the preset numbers):
  US `V171` → `V172`, Canada `V78` → `V79` (or each shell's current number + 1 at commit time). Tasks 3 and 4 do not bump
  again; the PR lands as one batch.
  - README's feature list is updated in Task 4.
- **Ages** are Partner A's. A single person is Partner A. The calendar year of age `a` is `CURRENT_YEAR + (a - state.ageA)`.

## Rulings made while planning (record in the ledger)

- **R1, one editor under the open row.**
  - `#msCrashList` holds one row element per crash. The PR 3 field block, wrapped as `#msCrashEditor`, is moved
    (`appendChild`) into the open row.
  - The field ids are unchanged, and the fields edit `cardSettings.crashes[openCrash]`.
  - `tests/field_registry.js` scans only `input, select, textarea` (:38). The new elements are buttons and paragraphs, so they
    need no entry.
  - If wrong, the cost is per-row ids and registry entries.
- **R2, the editor never moves while typing, and never leaves the DOM.**
  - `wireMarketScenarioCard()` captures the editor once in a module `let editorEl = null`. A module-level `$()` initializer
    would break the load-time rule.
  - A render updates the rows' header text in place. It rebuilds the row elements only when their count differs from
    `cardSettings.crashes.length`, and moves the editor only when its parent is not the open row.
  - Rows are rebuilt with `replaceChildren`, which would detach the editor, so the editor is re-appended to the open row
    right after the rebuild. That comes before any field read or write in the same render (`set` would otherwise get `null`).
  - The row clicks are wired once: one delegated listener on `#msCrashList`, reading `closest('.ms-crash-row').dataset.crash`.
  - Moving a focused input blurs it, so neither a rebuild nor a move may happen inside an `input` handler. An `input`
    changes no row count and no open row, so the rule holds by construction.
- **R3, `openCrash`** is a module-level `let` in the card UI module.
  - It is not saved (spec: the first row opens on load), and it is reset to 0 on wiring.
  - **On Remove of index `k`:**
    - `k < openCrash` gives `openCrash - 1`, so the same crash stays open.
    - `k === openCrash` keeps the index, clamped, so the next row opens (or the new last row).
    - `k > openCrash` leaves it as it is.
  - After every re-normalize it is clamped to `[0, crashes.length - 1]`.
- **R4, the Depression preset data.** The 1929 entry of `CRASH_PRESETS` becomes:
  `{ id: '1929', label: 'Like 1929–44', inflation: -6.4, bondReturn: 3.7, fallFrom: 1929, fallTo: 1932, recoverTo: 1936, then: { fallFrom: 1937, fallTo: 1937, recoverTo: 1944, inflation: 2.9, bondReturn: 1.4 } }`.
  - `then` is frozen too. The other four presets are unchanged and have no `then`.
  - `recoverTo` 1936 is the end of leg 1's recovery (the index stood at 1.0108× its 1929 start at the end of 1936).
  - 2.9 and 1.4 are the 1937 row (`[1937, -35.34, 2.86, 1.38, 2.68]`) rounded to one decimal.
- **R5, leg 2's conversion.** `presetSecondLeg` measures leg 2 against the market it lands on: the plan's line times leg 1's
  rounded `qEnd`. Leg 1's `drop` and `recoverPct` come from `presetCrashShape`, so `qEnd1 = 1 - d1 * (1 - R1)` with
  `d1 = drop / 100` and `R1 = recoverPct / 100`. With `lvl(a, b)` the product of `1 + stock/100` over the HIST rows `a..b`:
  - `qb2 = lvl(fallFrom, then.fallTo) / (Math.pow(1 + r, then.fallTo - fallFrom + 1) * qEnd1)`.
  - `qe2 = lvl(fallFrom, then.recoverTo) / (Math.pow(1 + r, then.recoverTo - fallFrom + 1) * qEnd1)`.
  - `drop2` and `recoverPct2` are rounded and clamped exactly as `presetCrashShape` does (drop 0–95, recovery 0–100, the
    zero-drop check first).
  - `fallYears2 = then.fallTo - then.fallFrom + 1`, `recoverYears2 = then.recoverTo - then.fallTo`, and
    `ageOffset = then.fallFrom - fallFrom`.
  - The values were checked against HIST while planning:

    | Return | Leg 1 (drop / back over 4 years) | Leg 2 (drop / back over 7 years) |
    |---|---|---|
    | 0% | 65 / 100 | 35 / 100 |
    | 4% | 70 / 63 | 38 / 56 |
    | 7% | 73 / 44 | 40 / 15 |
    | 10% | 76 / 30 | 41 / 0 |
    | 12% | 78 / 24 | 42 / 0 |

- **R6, a two-leg row.** `crashLegs(row)` is 2 exactly when `row.presetShape` is true and `row.preset` names a preset with
  `then`. Otherwise it is 1.
  - PR 3's normalize rule (a shape preset turns Custom when its four numbers differ from the shape at the current return)
    then removes leg 2 on any number edit and on a return change, as the spec says.
  - Changing the age keeps the chip: age is not a shape number.
- **R7, the scenario order.** `cardSettingsToScenario(s, inputs)` emits the rows in list order. A two-leg row is followed by
  its leg 2 at `age + ageOffset`. Leg 2 is left out when `age + ageOffset > planLastAge(inputs)`.
- **R8, the cap.** `MAX_CRASHES` (10, exported from `market-scenario.js`) counts engine crashes: `cardCrashCount(s)` is the
  sum of `crashLegs`. A two-leg row counts 2 even when its leg 2 falls past `L`, so the count never depends on the plan.
  - **Normalize** walks the rows in order. Each row is normalized first, and then counted, since a return change can turn a
    1929 row Custom (one leg). The walk **stops at the first row that would take the running count past 10**, and drops it
    and every row after it (a later one-leg row is not kept). The list order is the user's, so a gap would surprise.
  - **Add** is disabled when `cardCrashCount(s) + 1 > 10`.
  - **The 1929 chip** is disabled when the shape box is on and
    `cardCrashCount(s) - crashLegs(open row) + 2 > 10`.
  - **The shape box** is disabled when the open row's preset is `'1929'`, the box is off, and `cardCrashCount(s) + 1 > 10`.
  - **The order.** These three lines come after PR 3's disabled loop (`el.disabled = on`, card.js:123), as
    `el.disabled = on || <cap condition>`.
  - `#msCapNote` shows exactly when no scenario is on and at least one of the three cap conditions holds.
  - A disabled `#msAddCrash` needs its own style. `.btn-card:disabled` is styled only under `.group[data-cat="scenarios"]`
    (styles.css:219), so add a `#msAddCrash:disabled` rule that uses the same tokens.
- **R9, a new crash.** `newCrashRow(s, inputs)` is the default crash (`defaultCardSettings(inputs).crashes[0]`) with its
  `age` set to `nextCrashAge(s, inputs)`:
  - the last-listed row's window end + 1, clamped to `[ageA, L]`;
  - for a one-leg row, the end is `age + fallYears + (recoverPct > 0 ? recoverYears : 0) - 1`;
  - for a two-leg row, the end is leg 2's own, `age + ageOffset + fallYears2 + (recoverPct2 > 0 ? recoverYears2 : 0) - 1`.
- **R10, the description in age order.** `describeMarketScenario` sorts a copy of `ms.crashes` before joining with
  `"; then "`.
  - The sort key is the clamped age the text prints, `ageA + Math.max(0, Math.round(c.age - ageA))`, so ages below `ageA`
    tie.
  - The sort is stable, so ties keep list order.
  - The engine's own order and the overlap rule are untouched.
- **R11, the band.** `unionWindows(windows)` in `market-scenario-text.js` works on copies.
  - It sorts by `fromAge`.
  - It merges a window into the one before it when `next.fromAge <= cur.toAge + 1`, with
    `cur.toAge = Math.max(cur.toAge, next.toAge)`.
  - Adjacent windows merge too, so no hairline seam is drawn.
  `projection-chart.js` draws `unionWindows(marketScenarioWindows(...))`. `marketScenarioWindows` stays unmerged.
- **R12, no clamping mid-typing.** `renderMarketScenarioCardState()` skips its re-normalize while `document.activeElement` is
  one of the card's `NUMS` boxes.
  - The box is still never rewritten while it has focus.
  - `onChange` still normalizes and writes back.
  - Run normalizes once more.
  - A light render that arrives while a box has focus therefore leaves the typed value unclamped until `change`.
  - **Accepted side effect.** While typing, the row header, `#msCrashYear`, `#msSecondLeg` and the description show the
    unclamped value (age 6 shows a year in the 1970s). `change` puts them right.
- **R13, `planLastAge`'s new home** is `src/shared/core/inputs/plan-last-age.js`. Its purpose line is "The plan's last age:
  Partner A's age plus the projection's years". It is a pure function of the inputs, which the format, projection and inputs
  modules all read.
  - It is not re-exported from `market-scenario-text.js`. Every importer imports the new module.
- **R14, the number helpers.** `isObject`, `num`, `clamp` and `clampInt` are exported from `core/inputs/market-scenario.js`
  (their bodies unchanged). The card module imports them and drops its copies.
- **R15, the US tip clause** goes through a country seam, `#country/ui/seam-MS_PORTFOLIO_TIP`.
  - It re-exports `MS_PORTFOLIO_TIP` from a new `src/<country>/ui/results/market-scenario-copy.js` in each country.
  - `wireMarketScenarioCard()` writes it into `#msPortfolioTip`'s `data-tip`. The partial's own `data-tip` is the Canada
    text, so the page reads right before wiring.
  - Each `MS_PORTFOLIO_TIP` is one string literal. A concatenation would be a computed initializer in a `ui/` module and
    would need a `// load-time:` marker.
- **R16, a render in a UI test.** `__test_flushRender()` runs only a pending deferred pass (`render-scheduler.js:23-25`), and
  card edits schedule nothing. So a test that needs "a render arrives" first dispatches `input` on the sidebar's `spending`
  box, which calls `scheduleRender()` and a light render. Then it calls `__test_flushRender()`. Focus stays where it was,
  because dispatching an event does not move focus.

## Review Focus

1. **Typing in a row while something renders.**
   - Case: the user types in row 2's drop and a light render arrives (a debounced sidebar edit or the scheduler).
   - Expected: the box keeps focus and its text, the editor stays under row 2, and the value is not clamped until `change`
     (R2, R12).
   - Test (Task 3 UI script): focus `#msDrop` in row 2 and type. Force a render (R16). Then check
     `document.activeElement.id === 'msDrop'` and that the editor's parent is row 2.
2. **Removing a row.**
   - Expected: the crash that was open stays open (R3), the remaining crashes keep their numbers, Remove hides at one row, and
     Run runs exactly the remaining rows.
   - Test (Task 3), with three rows:
     - Open row 2 and remove row 1. The open row is the old row 2 (read its drop).
     - Remove the open row. The next row opens.
     - Run: `state.marketScenario.crashes` equals the remaining rows.
3. **The cap from every side.**
   - Cases: a saved list longer than 10 engine crashes; the 1929 chip or the shape box on a nearly full list; Add at 10.
   - Expected: the list loads trimmed, and the controls are disabled with `#msCapNote` shown. The scenario never carries more
     crashes than the card shows (the normalizer would silently drop the 11th).
   - Tests: Task 2 (normalize trims) and Task 3 (UI disabled states).
4. **A Depression entry near the plan's end.**
   - Case: leg 1 inside the plan, leg 2 past `L`.
   - Expected: the scenario has one crash for that entry, the note says the second fall comes after the plan ends, and Run
     works.
   - Tests: Task 2 (`cardSettingsToScenario` and `secondLegNote` literals) and Task 3 (one UI check of the note).
5. **A PR 3 save after the upgrade.**
   - Case: the stored card key has `crash` (one object), not `crashes`.
   - Expected: it loads as one row with the same numbers, the page has no error, and the key is not rewritten by loading.
   - Tests: Task 2 (normalize) and Task 3 (UI: seed a PR 3-shaped key, open, read the drop; the key is unchanged).

---

### Task 1: PR 3 follow-ups, the pure moves (`planLastAge`, the number helpers)

**Files:**
- Create: `src/shared/core/inputs/plan-last-age.js` (R13). Move `planLastAge` here verbatim, with its comment.
- Modify: `src/shared/core/format/market-scenario-text.js`. Delete `planLastAge` and import it from `../inputs/plan-last-age.js`.
- Modify: `src/shared/core/projection/scenario-source.js`. Import it from `../inputs/plan-last-age.js`.
- Modify: `src/shared/core/inputs/market-scenario-card.js`. Import `planLastAge` from `./plan-last-age.js`. Import
  `isObject`, `num`, `clamp` and `clampInt` from `./market-scenario.js`, and delete the local copies.
- Modify: `src/shared/ui/results/market-scenario-preview.js`. Import `planLastAge` from the new module.
- Modify: `src/shared/core/inputs/market-scenario.js`. Export the four helpers, and export `MAX_CRASHES` (used in Task 2).
- Modify: `tests/unit/shared/market-scenario-text.test.js`. The `planLastAge` case loads `shared/core/inputs/plan-last-age.js`.
- Modify: `docs/architecture/market-scenarios.md`, "Card helpers": `planLastAge`'s new path.

**Interfaces:**
- Produces:
  - `planLastAge(inputs) -> number` from `core/inputs/plan-last-age.js`, the same function as before.
  - `isObject(v)`, `num(v)`, `clamp(n, lo, hi)`, `clampInt(n, lo, hi)` and `MAX_CRASHES` exported from
    `core/inputs/market-scenario.js`.

- [ ] **Step 1: Build the base.**
  - `npm run build`.
  - Copy `dist/` to a scratch folder `<scratch>/pr4-base/dist` (scratchpad, not the repo).
- [ ] **Step 2: Make the moves.** Check with
  `grep -rn "planLastAge" src tests`: no import from `format/market-scenario-text.js` remains.
- [ ] **Step 3: Run.**
  - `npm run analyze`.
  - `npm run test:unit`.
  - `npm test`: everything green, with no snapshot change.
  - `node scripts/compare-builds.js --base <scratch>/pr4-base`. It compares statement text and does not undo esbuild's
    collision renames (`clamp` is top-level in five modules: `numbers.js`, `market-scenario.js`, the card module, `sankey.js`
    and `sankey-fullscreen.js`). Two kinds of difference are expected:
    - the four dropped declarations;
    - statements whose only change is a collision suffix (`clamp3` → `clamp2`, `isObject2` → `isObject`, …), in the card
      module and possibly in the Sankey modules.
    Check each difference by eye, and list the kinds in the commit message. A difference of any other kind is a finding.
- [ ] **Step 4: Commit** `Market scenarios: planLastAge to a neutral module, the number helpers shared`.

### Task 2: The DOM-free crash list (settings, the two-leg preset, the conversion, the texts, the band union)

**Files:**
- Modify: `src/shared/core/inputs/market-scenario-card.js`
- Create: `src/shared/core/format/market-scenario-card-text.js`
  - Purpose line: "The market scenario card's crash-row summaries and the Depression entry's second-fall note".
- Modify: `src/shared/core/format/market-scenario-text.js` (R10 sort, R11 `unionWindows`)
- Test: `tests/unit/shared/market-scenario-card.test.js` (extend and update), `tests/unit/shared/market-scenario-text.test.js`
  (extend), and a new `tests/unit/shared/market-scenario-card-text.test.js`.
- Modify: `docs/architecture/market-scenarios.md`, "Card helpers" (the list, the legs, the cap, the texts; CLAUDE.md wants the
  topic file updated in the commit that changes its area).

**Interfaces:**
- Consumes: Task 1's `planLastAge`, `MAX_CRASHES`, `num`, `clamp`, `clampInt`, `isObject`; `HIST`.
- Produces (all exported from `market-scenario-card.js` unless noted):
  - **`CRASH_PRESETS`**, with the 1929 entry as R4.
  - **`presetCrashShape(preset, returnRatePct)`**, unchanged code. With R4's `recoverTo: 1936` its 1929 results become:
    - 0%: `{ drop: 65, fallYears: 4, recoverPct: 100, recoverYears: 4 }`
    - 7%: `{ drop: 73, fallYears: 4, recoverPct: 44, recoverYears: 4 }`
    - 10%: `{ drop: 76, fallYears: 4, recoverPct: 30, recoverYears: 4 }`
    - 12%: `{ drop: 78, fallYears: 4, recoverPct: 24, recoverYears: 4 }`
  - **`presetSecondLeg(preset, returnRatePct) -> { ageOffset, drop, fallYears, recoverPct, recoverYears, inflation, bondReturn } | null`**
    follows R5. It returns `null` for a preset without `then`. It computes from HIST when called, never at load.
  - **`crashLegs(row) -> 1 | 2`** (R6) and **`cardCrashCount(s) -> number`** (R8).
  - **`defaultCardSettings(inputs)`** returns
    `{ kind, order, crashes: [ <PR 3's default crash> ], history }`. The `crash` key is gone.
  - **`normalizeCardSettings(raw, inputs)`**:
    - **The rows.** `raw.crashes` (an array) gives the rows. Otherwise `raw.crash` (an object, a PR 3 save) gives one row.
      Otherwise there is the one default row.
    - **Each row** is normalized exactly as PR 3 normalizes `crash` (over a fresh default crash, the same clamps and preset
      rules). A non-object entry is dropped.
    - **The cap.** Rows are kept in order while `cardCrashCount` stays at or under `MAX_CRASHES` (R8). No row left gives the
      one default row.
    - **The output** never carries a `crash` key.
  - **`nextCrashAge(s, inputs) -> number`** (R9) and **`newCrashRow(s, inputs) -> row`** (R9).
  - **`cardSettingsToScenario(s, inputs)`** (R7). The new `inputs` parameter is needed for leg 2's return and `L`. History is
    unchanged.
  - **`market-scenario-card-text.js`**:
    - **`crashRowSummary(row) -> string`**:
      - A two-leg row reads `"{preset label} at {age} (two falls)"`, so `"Like 1929–44 at 60 (two falls)"`.
      - Otherwise `"{drop}% at {age}, {back}"`, where `{back}` is:
        - `"no recovery"` at 0;
        - `"all back over {n} {yr|yrs}"` at 100;
        - else `"{recoverPct}% back over {n} {yr|yrs}"` (`yr` when `n === 1`).
    - **`secondLegNote(row, inputs) -> string | null`** (the spec's copy, "Then a second fall in 1937 (age 68): 40% drop,
      15% back over 7 years."):
      - `null` for a one-leg row.
      - With `A2 = row.age + ageOffset`, `L = planLastAge(inputs)` and `{Y}` the preset's `then.fallFrom` (1937):
        - `A2 > L`: `"Then a second fall in {Y} (age {A2}), after the plan ends."`
        - else `"Then a second fall in {Y} (age {A2}): {drop2}% drop, {back2}."`, where `{back2}` is `"no recovery"`,
          `"all back over {n} years"` or `"{p}% back over {n} years"` (`year` when `n === 1`).
  - **`unionWindows(windows) -> Array<{ fromAge, toAge }>`** (R11, `market-scenario-text.js`). It returns a new array and
    never mutates its input.
  - **`describeMarketScenario`**: R10 (the crashes in age order).

- [ ] **Step 1: Write the failing tests.**
  - Write literals by hand, and check each against `node -p` once.
  - **`market-scenario-card.test.js`:**
    - Update PR 3's cases for the list:
      - `DEFAULT_CRASH` is now `crashes[0]`.
      - Every `crash:` input becomes `crashes: [...]`.
      - The `CRASH_PRESETS` literal has R4's 1929 entry. `Object.isFrozen` holds for `then` as well.
      - The cited-rows case adds the 1937 row.
      - The 1929 `presetCrashShape` literals are as in Produces.
      - The 12% case asserts `{ drop: 78, fallYears: 4, recoverPct: 24, recoverYears: 4 }`. The zero-recovery clamp is now
        exercised by `presetSecondLeg` at 10% and 12%.
    - **`presetSecondLeg`** at 0 / 4 / 7 / 10 / 12% gives R5's table, with `ageOffset: 8`, `fallYears: 1`,
      `recoverYears: 7`, `inflation: 2.9` and `bondReturn: 1.4`. For the 2008 preset it gives `null`.
    - **`crashLegs`:** a 1929 row with the shape on gives 2. The same row with the shape off gives 1. A 2008 row with the
      shape on gives 1. A `'custom'` row gives 1.
    - **A PR 3 save:** `{ kind: 'crash', order: 'standard', crash: { age: 60, drop: 44, … } }` normalizes to one row with drop
      44, and the output has no `crash` key.
    - **The cap:**
      - Twelve one-leg rows keep the first ten.
      - Nine one-leg rows followed by a two-leg row keep the nine (adding the two-leg row would make 11).
      - Nine one-leg rows, a two-leg row, then one more one-leg row also keep only the nine. The walk stops at the
        overflowing row (R8).
      - A two-leg row followed by nine one-leg rows keeps the two-leg row and eight others.
      - Ten rows where the first is a 1929 shape row at the 7% numbers, normalized against `returnRate: 6`, keep all ten.
        That row turns Custom, so it counts 1.
    - **A garbage `crashes`** (`[null, 'x', 3]`) gives the one default row.
    - **A shape 1929 row** at the 7% numbers, normalized against `returnRate: 6`, reads `'custom'`. `crashLegs` then gives 1.
    - **`nextCrashAge`** (COUPLE, `L` 97):
      - The default row at 62 gives 68 (`62 + 2 + 4`).
      - A 1929 shape row at 60, at 7%, gives 76 (`60 + 8 + 1 + 7`).
      - A last row at 95 with a long recovery clamps to 97.
    - **`newCrashRow`** equals the default crash with `age: 68`.
    - **`cardSettingsToScenario`** (COUPLE at 7%): rows `[1929 shape at 60, 2008 at 75]` give
      `crashes: [{ age: 60, drop: 73, fallYears: 4, recoverPct: 44, recoverYears: 4, inflation: -6.4, bondReturn: 3.7 }, { age: 68, drop: 40, fallYears: 1, recoverPct: 15, recoverYears: 7, inflation: 2.9, bondReturn: 1.4 }, { age: 75, …the 2008 row… }]`.
      - The output is unchanged through `normalizeMarketScenario`.
      - SINGLE (`L` 90) with the 1929 shape row at 85 gives one crash, leg 2 (age 93) left out.
  - **`market-scenario-card-text.test.js`:**
    - `crashRowSummary` gives:
      - `"30% at 75, 60% back over 4 yrs"`
      - `"30% at 75, no recovery"`
      - `"30% at 75, all back over 1 yr"`
      - `"Like 1929–44 at 60 (two falls)"`
    - `secondLegNote` (COUPLE, 7%, the row at 60) gives:
      - `"Then a second fall in 1937 (age 68): 40% drop, 15% back over 7 years."`
      - at 10% (the 10% leg-1 numbers): `"Then a second fall in 1937 (age 68): 41% drop, no recovery."`
      - at 0% (the 0% numbers): `"Then a second fall in 1937 (age 68): 35% drop, all back over 7 years."`
      - SINGLE with the row at 85: `"Then a second fall in 1937 (age 93), after the plan ends."`
      - `null` for a 2008 row.
  - **`market-scenario-text.test.js`:**
    - The two-crash describe case listed in reverse (the age-62 crash first) gives the same text as in age order. Two crashes
      at one age keep list order.
    - `unionWindows` gives:
      - `[]` for `[]`;
      - `[{60,65},{62,61}]` → `[{60,65}]` (written out as objects);
      - `[{70,72},{60,65}]` → `[{60,65},{70,72}]`;
      - `[{60,65},{66,68}]` → `[{60,68}]` (adjacent);
      - and the input array is unchanged afterwards.
- [ ] **Step 2: Run them to see them fail:**
  `npx vitest run tests/unit/shared/market-scenario-card.test.js tests/unit/shared/market-scenario-card-text.test.js tests/unit/shared/market-scenario-text.test.js`.
- [ ] **Step 3: Implement the Produces.**
  - Update the `CRASH_PRESETS` comment: `recoverTo` is the end of the (first) recovery, and `then` is the Depression's second
    fall.
  - **The minimal UI adaptation**, so the page keeps working (`tests/field_registry.js` and `tests/snapshot_ui.js` in
    `npm test` fail on any page error):
    - In `src/shared/ui/plans/market-scenario-card.js`, every `s.crash`, `n.crash` and `next.crash` becomes `crashes[0]`
      (today at :90, :147, :178 and :181).
    - The three calls of `cardSettingsToScenario` pass `state`: card.js :125 and :193, and preview.js :31.
    - `NUMS` maps every crash box to the group `'crash'`, and three sites index it dynamically: `s[g][k]` (:102),
      `next[g][k] = n` (:146) and `cardSettings[g][k]` (:155). Add a helper
      `const grp = (s, g) => (g === 'crash' ? s.crashes[0] : s[g]);` and use it at all three.
    - Task 3 then swaps `[0]` for `[openCrash]` (in the property accesses and inside `grp`).
  - **The UI script.** In `test_market_scenario.js`:
    - The 1929 checks (:141-152) become 73 / 4 / 44 / 4, and the label text "Like 1929–44" where it is read.
    - `card.crash.preset` / `card.crash.presetShape` (:181) become `card.crashes[0]`.
    - Run it after `npm run build`. It must pass in this task.
  - The 1929 chip's label in the partial becomes `Like 1929–44` here too, so the label matches `CRASH_PRESETS`.
  - Bump both version badges here (Global Constraints).
- [ ] **Step 4: Run.**
  - `npm run test:unit`.
  - Each changed suite alone, and with `--sequence.shuffle`.
  - `npm run analyze`.
  - `npm test`: green, with no engine snapshot change. The chip label changes the UI snapshot text; update the baselines with
    `node tests/snapshot_ui.js --update` if `npm test` reports it, and say so in the commit.
  - `npm run build`, then `node test_market_scenario.js`.
- [ ] **Step 5: Commit** `Market scenarios: the card's crash list, the two-fall Depression preset and the row texts`.

### Task 3: The card's list (rows, Add / Remove, the cap, the Depression note), no clamping mid-typing, and the UI checks

**Files:**
- Modify: `src/shared/partials/marketScenarioCard.html`
- Modify: `src/shared/ui/plans/market-scenario-card.js`
- Modify: `src/shared/ui/results/market-scenario-preview.js` (it already passes `state` after Task 2; nothing else)
- Modify: both `src/<country>/ui/results/render.js` only if they need it (they pass `cardSettings` as today)
- Modify: `src/shared/ui/install-test-hooks.js` (`__test_marketScenarioCardSettings`)
- Modify: `src/shared/styles/styles.css` (row rules, existing tokens only)
- Run: `tests/field_registry.js` (no change expected, R1)
- Modify: `test_market_scenario.js`
- Modify: the UI snapshot baselines (`node tests/snapshot_ui.js --update`)

**Interfaces:**
- Consumes: Task 2's `crashLegs`, `cardCrashCount`, `newCrashRow`, `cardSettingsToScenario(s, inputs)`, `crashRowSummary`,
  `secondLegNote` and `MAX_CRASHES`.
- Produces:
  - **`window.__test_marketScenarioCardSettings()`**: a JSON clone of `cardSettings`, or `null`.
  - **The markup** (ids):
    - `#msCrashList`, the rows' container. Each row is
      `<div class="ms-crash-row" data-crash="{i}"><div class="ms-crash-head"><button type="button" class="ms-crash-open" aria-expanded="{bool}">Crash {i+1} · {crashRowSummary}</button><button type="button" class="ms-crash-remove" aria-label="Remove crash {i+1}">Remove</button></div></div>`,
      built by the module.
    - `#msCrashEditor` wraps PR 3's crash field block (everything that was inside `#msCrashFields`). It also holds a new
      `<p id="msSecondLeg" class="ms-description" hidden>` after the inflation and bond fields.
    - `<button type="button" class="btn-card" id="msAddCrash">+ Add another crash</button>` and
      `<p id="msCapNote" class="ms-description" hidden>` follow `#msCrashList`, inside `#msCrashFields`.
    - `#msPortfolioTip`, the id of the portfolio legend's info-tip button (Task 4 sets its text).
  - **The copy:**
    - The 1929 chip reads `Like 1929–44` (done in Task 2).
    - `#msCapNote` reads "Up to 10 crashes in all; Like 1929–44 with its stock path counts as two."
    - The shape box's info tip becomes: "Off: a preset sets only the inflation and bond returns during the fall. On: it also
      sets the drop, the fall years and the recovery, so the crash bottoms out and climbs back the way the real market did.
      Like 1929–44 also brings the 1937 fall partway through the recovery. For the real year-by-year path, use Real history."

- [ ] **Step 1: Extend `test_market_scenario.js`** (both planners; no fixed waits; exit 1 on a failure).
  - **Where the new sections go.** The existing flow assumes one row (for example "reload: the card shows the saved
    settings" reads the first row). Put the typing section where PR 3's preset checks end. Put every list section (Add and
    Remove, the cap, the plan end, the PR 3 save) after the history section and before the mobile loop. Each list section
    starts from a known card: write the card key with `localStorage.setItem` and reload.
  - **Canvas width.** In `widthOk`, `Math.round` becomes `Math.trunc` (the PR 3 follow-up).
  - **The Depression entry.** Task 2 already checks 73 / 4 / 44 / 4. Add:
    - `#msSecondLeg` is visible and starts `Then a second fall in 1937 (age `.
    - Row 1's header reads `Crash 1 · Like 1929–44 at {age} (two falls)`.
    - Editing the drop hides `#msSecondLeg` and makes the chip Custom.
  - **Typing (R12, Review Focus 1).** With no scenario on:
    - Focus `#msCrashAge`, select all (`Control+A`), and type `6` with `page.keyboard.type`. The box reads `6`, and
      `__test_marketScenarioCardSettings().crashes[0].age === 6` (not clamped to `ageA`).
    - Type `5`. The box reads `65` and the stored age is 65.
    - Force a render (R16). `document.activeElement.id` is still `msCrashAge`, and the box still reads `65`.
    - Press Tab. The box reads `65`.
    - Focus again, select all, type `3`, then press Tab. The box reads `ageA` (clamped on `change`).
    - End with `page.evaluate(() => document.activeElement.blur())`. Tab leaves focus in the next card box, and R12 would
      then skip the re-normalize that later checks rely on (the shorter life expectancy).
  - **Add and Remove (Review Focus 2).** From a one-row card:
    - The row's Remove is hidden.
    - Click `#msAddCrash`. There are two rows, row 2 is open (`aria-expanded="true"`, `#msCrashEditor` inside row 2), and
      row 2's age box reads the next age. Compute it in the test from the row-1 numbers the section wrote.
    - Set row 2's drop to 30. Open row 1: its drop is unchanged.
    - Add a third row. Open row 2, then remove row 1. The open row is the old row 2 (its drop reads 30).
    - Remove the open row. One row remains (the old row 3). It is open, and its Remove is hidden.
    - Run: `state.marketScenario.crashes` equals the remaining rows. Then Revert.
  - **Typing in row 2 while a render arrives (Review Focus 1).** With two rows, open row 2 and focus `#msDrop`. Select all,
    type `4`, then force a render (R16). The focus is still `msDrop`, and `#msCrashEditor`'s parent is row 2. Blur
    afterwards.
  - **The cap (Review Focus 3).**
    - Make row 1 a 1929 shape entry (tick the shape box, click the chip), then add rows until `#msAddCrash` is disabled:
      9 rows (2 + 8). `#msCapNote` is visible.
    - Open a one-leg row and tick its shape box. `#msPreset1929` is disabled.
    - Remove one row. Add is enabled again and `#msCapNote` is hidden.
  - **Near the plan end (Review Focus 4).** A 1929 shape row written into the key
    (`{ age: L - 3, drop: 73, fallYears: 4, recoverPct: 44, recoverYears: 4, preset: '1929', presetShape: true, inflation: -6.4, bondReturn: 3.7 }`;
    the seed's return is 7, so the chip stands) shows `#msSecondLeg`
    ending `after the plan ends.` Run carries one crash for that row. Revert.
  - **A PR 3 save (Review Focus 5).** Seed the card key with
    `{"kind":"crash","order":"bucket","crash":{"age":<ageA+3>,"drop":44,"fallYears":2,"recoverPct":60,"recoverYears":4,"preset":"custom","presetShape":false,"inflation":2,"bondReturn":3}}`
    and reload. Expect one row with drop 44, no page error, and the key byte-identical after the load.
  - **Locked while on.** With two rows, below the cap, Run:
    - `#msAddCrash` is disabled, and so is every `.ms-crash-open` and `.ms-crash-remove`. Check them with
      `querySelectorAll`: `LOCKED` is an id list.
    - After Revert they are enabled again.
    - `runState()` (`noneDisabled`) runs only on lists below the cap: R8 may disable Add and the 1929 chip at the cap.
  - **Edits leave the projection alone.** The sentinel check from PR 3 also covers Add, opening a row and Remove. Put them
    after PR 3's chip clicks (:170-175): Add, open row 1, remove row 2. The card is then back to one row, so
    `card.crashes[0].preset === '1973'` (:181) still holds. No R16 render may run between the sentinel and its checks
    (R16 replaces `window.fireProjection` and saves).
  - **Mobile.** Before the mobile loop, write a three-row key and reload. At 390 px there is no sideways scroll.
- [ ] **Step 2: Build and run it to see it fail** (`npm run build`, then `node test_market_scenario.js`).
- [ ] **Step 3: Implement the markup, module, hook and styles.**
  - **R1–R3.** Every card edit goes through `edit()`. Opening a row sets `openCrash` and repaints the card, with no save.
    `NUMS` keeps its ids, but its `crash` group reads and writes `crashes[openCrash]`.
  - **R8's disabled states** and `#msCapNote` are set in `renderMarketScenarioCardState()`.
    - While a scenario is on, everything is disabled except Run / Revert: the row buttons, Add and Remove are added to the
      selector of PR 3's disabled loop.
  - **Add** appends `newCrashRow(cardSettings, state)` and sets `openCrash = crashes.length - 1` (the new row opens).
  - **The delegated row listener** acts only on `e.target.closest('.ms-crash-open, .ms-crash-remove')`. The open row also
    holds the editor, so clicks on its chips and boxes bubble into the row and must be ignored.
  - **`#msSecondLeg`** shows `secondLegNote(openRow, state)` when it is not null.
  - **R12.** Skip the re-normalize while `document.activeElement` is a `NUMS` box.
  - **The callers.** Both callers pass `state` to `cardSettingsToScenario`, as Task 2 left them.
  - **CSS.**
    - `.ms-crash-row`: a bordered block, `border-radius:8px`, existing border and background tokens.
    - `.ms-crash-head`: a flex row, `justify-content:space-between`, `gap:8px`.
    - `.ms-crash-open`: a text-style button that wraps (`white-space:normal; text-align:left`).
    - The open row gets an accent border.
    - `.ms-crash-remove[hidden]{display:none}`, since the button gets a `display` rule.
    - `#msAddCrash:disabled` (R8).
- [ ] **Step 4: Run.**
  - `npm run build`.
  - `node test_market_scenario.js`.
  - `node test_market_scenario_mode.js`.
  - `node tests/field_registry.js`.
  - `npm test`. Update the UI snapshot baselines; the engine snapshots stay unchanged.
- [ ] **Step 5: Commit** `Market scenarios: the card's crash list, Add and Remove, and no clamping mid-typing`. Say in the
  message that the UI snapshot baselines changed for the new markup.

### Task 4: The band's union, the US tip clause, README and docs

**Files:**
- Modify: `src/shared/ui/charts/projection-chart.js`: draw `unionWindows(marketScenarioWindows(state.marketScenario, state))` (R11).
- Create: `src/us/ui/results/market-scenario-copy.js` and `src/canada/ui/results/market-scenario-copy.js`
  - Purpose line: "The market scenario preview's portfolio tip, per country".
  - Each exports `MS_PORTFOLIO_TIP`:
    - **Canada:** "Both lines replay your current plan with the same withdrawal order. The only difference is the market, so
      the gap is the scenario alone." This is PR 3's text, unchanged.
    - **US:** the same, followed by " Both use your current plan's conversions and caps; Run re-plans for the scenario."
- Create: `src/us/ui/seam-MS_PORTFOLIO_TIP.js` and `src/canada/ui/seam-MS_PORTFOLIO_TIP.js` (facades, as the other `seam-*.js`)
- Modify: `src/shared/ui/plans/market-scenario-card.js`. In `wireMarketScenarioCard()`, set
  `$('msPortfolioTip').dataset.tip = MS_PORTFOLIO_TIP` (R15).
- Modify: `test_market_scenario.js`.
  - The US tip's `data-tip` ends with "Run re-plans for the scenario.".
  - Canada's equals the Canada string.
  - No new band check: overlapping fills still pass the light-mode alpha filter, so pixels cannot tell merged from unmerged.
    The union is pinned by Task 2's `unionWindows` tests and PR 3's band check (`bandPixels() > 500`) keeps passing.
- Modify: `README.md`. Replace the Market scenario bullet with:
  "A Market scenario card: design one or more crashes (depth, timing, how much comes back and how fast, with presets from
  real episodes, from the Great Depression with its 1937 second fall to 2022, that can also set the drop and recovery) or
  replay real market history from a chosen year and age, preview it against your plan, then run the whole planner inside it,
  optimizers included, and revert with one click."
- Modify: `docs/architecture/market-scenarios.md`:
  - "The card": the list, R1–R3, the cap (R8), the Depression entry (R4–R7), R12 and R15. Record that the scenario text stays
    plain (owner).
  - Say that leg 2 makes the engine's index hit the real 1937 bottom and the real 1944 level **where the 0–100% recovery
    clamps do not bind** (about 2–8.5% returns). At 0%, leg 2 clamps to 100% back, and the index ends at 1.00×. At 9% and
    above, it clamps to 0% back, and the index ends above the real 1944 level.
  - "Card helpers": Task 2's helpers.
  - Drop the follow-up line from "What is still owed". Delete the section if it is then empty.
- Modify: `docs/architecture/module-system.md` (the new seam: the seam count near :119 goes up by one, and `MS_PORTFOLIO_TIP`
  joins the `ui/` seam list).
- Modify: `docs/architecture/inputs-and-ui.md` (the card key's `crashes` list and the PR 3 migration),
  `docs/architecture/test-inventory.md` (the new suite and the extended UI script), then `npm run analyze`.

- [ ] **Step 1: Extend the UI script** (the tip and the union checks above) and run it to see it fail.
- [ ] **Step 2: Implement** the union draw, the copy modules, the seams and the wiring line.
- [ ] **Step 3: Write the docs and README.** Then `npm run analyze`.
- [ ] **Step 4: Run.**
  - `npm test`.
  - `node tests/ui_scripts.js test_market_scenario.js test_market_scenario_mode.js`.
  - `npm run test:ui`.
  - `node tests/bench_runs_interleaved.js --warm-analysis`.
  - Expect everything green and the benchmark within noise.
- [ ] **Step 5: Commit** `Market scenarios: the band's union, the US preview tip, README and docs`.
