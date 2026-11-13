# Dashboard guidance PR 1: the verdict ("Am I OK?") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "On track" headline and the sticky status bar's text with one verdict (Comfortable / Tight / Short),
a spending-room margin and the historical success line, in both planners.

**Architecture:**
- A DOM-free core module (`src/shared/core/analysis/spending-room.js`) does three things:
  - searches the spending room through the caller's `contextFor` factory;
  - rounds the room conservatively for display;
  - decides the verdict word from fixed rules, using the displayed figures, so the word never disagrees with the numbers beside it.
- A shared UI module (`src/shared/ui/results/plan-verdict.js`):
  - runs the search in the full render and the deferred pass, never in the light render;
  - paints the verdict card, the status bar's short form and the gauge;
  - takes over the debounced historical backtest from `plan-status-bar.js`.

**Tech Stack:** plain ES modules, esbuild single-file build, Vitest (unit), Playwright (root `test_*.js`).

**Spec:** `docs/superpowers/specs/2026-11-12-dashboard-guidance-design.md`, Part 1 only. Parts 2 and 3 get their own
plans. The run-out banner (`#shortfallBanner`) stays in this PR (Part 3 removes it), but stops offering a spending cut
(Task 2), so it never shows a second spending figure next to the verdict's.

## Global Constraints

- **Scope:** both planners in this PR. Shared code goes in `src/shared/`; no country seam is needed.
- **No projection number changes:** `npm test` stays exact; `tests/golden.js` is untouched.
- **Spending room** is in today's dollars per year, searched on a $100 grid (`ROOM_STEP = 100`).
- **Displaying the room** (`displayRoom`, Task 1) rounds conservatively. This replaces the spec's "nearest": rounding
  to the nearest value said "$8K more" for a room where $8K runs out.
  - The step is $1,000, or $500 when the size is under $5,000.
  - A positive room rounds **down**.
  - A cut needed rounds **up** in size, never below $500.
  - A room that rounds to 0 is "no room to spend more".
  - Every sentence, bar and gauge figure shows `displayRoom(room)`, and the verdict's room share is computed from it.
- **Spending tiers:** the room changes base `spending` **and** every `spendingTiers` row's `amount` by the same delta,
  each clamped at 0. For a tier with its own growth rate (`followGrowth: false`) the delta grows at that rate, so the
  figure is exact only for tiers that follow inflation. Note this in a comment; nothing else is needed.
- **Verdict rules** (constants in one frozen object):
  - **Short** if the projection runs out.
  - **Tight** if the displayed room is under 10% of base spending, or historical success is under 80%.
  - **Comfortable** otherwise.
  - **With guardrails on and the plan lasting:** Tight if the displayed deepest cut (`Math.round(cut × 100)`) is over
    10%, or historical success is under 80%.
- **Under a market scenario** (`currentMarketScenarioText() !== null`), the verdict ignores historical success and the
  historical line reads "Inside the scenario: <text>."
- **When the verdict is computed:** only in the full `render()` and in `renderDeferred()`, never in the light render.
  The light render dims it (the `.stale` class), as it does the deferred cards.
- **Variants** run through `stateContextFor()` (`src/shared/ui/results/state-context.js`). The US kept cliff plan
  applies to them because `refreshCliffPlan` runs first. Never hand-build a context.
- **Retirement ages in the sentence:** "Retiring at 55" when the ages are the same (or single); "Retiring at A 55 / B 57"
  when the partners' ages differ, matching the "Retire at" chip, as the spec says.
- **Version badges:** US `V175` → `V176`, Canada `V80` → `V81`, once, in Task 2.
- **Module rules:**
  - Line 1 is a one-line `//` purpose comment, then a blank line.
  - Two-space indentation inside modules.
  - A computing module-level initializer gets a `// load-time:` comment (see `src/shared/core/projection/simulate.js:62`).
  - Run `npm run analyze` after adding or removing a module or changing exports.
- **Wiring:** new listeners go in a wiring function called once from both `main.js` files.
- **Docs** change in the same commit as the code they describe.
- **Vitest:** through `world()` only; exact comparisons (`toBe`, `toStrictEqual`); no `toBeCloseTo`.

## Review Focus

1. **A couple retiring at different ages.** The sentence reads "Retiring at A 55 / B 57", never the old bar's "60/55".
   Test: Task 2, the root-test check "different retirement ages".
2. **Spending tiers covering retirement,** including a tier larger than base spending. Without the shift, "spend $X
   more" is false, and "can't fix this" can be false. Tests: Task 1, `spending room shifts spending tiers` and
   `a tier above base spending is not unfixable`.
3. **A plan no spending cut can fix,** and a room within $100 of the edge. Expect "Cutting household spending alone
   can't fix this", and never "$0 less" or "$0 more". Tests: Task 1, `unfixable when even zero spending runs out` and the
   `displayRoom` table; Task 2, the root-test check "unfixable".
4. **The future-dollars display mode.** The room stays in today's dollars and says so. Test: Task 2, the root-test
   check "nominal mode".
5. **A market scenario in force.** Tests: Task 1, `planVerdict ignores history under a scenario`; Task 3, the root-test
   check "scenario" (through `__test_runMarketScenario` / `__test_revertMarketScenario`,
   `src/shared/ui/install-test-hooks.js:172-173`).

---

### Task 1: Core: spending room, display rounding, deepest guardrail cut, verdict rules

**Files:**
- Create: `src/shared/core/analysis/spending-room.js`
- Test: `tests/unit/shared/spending-room.test.js`

**Interfaces:**
- Consumes: `simulateWith(ctx)` from `src/shared/core/projection/runs.js`.
- Produces:
  - `ROOM_STEP`: 100.
  - `VERDICT_RULES`: `Object.freeze({ minRoomShare: 0.10, minHistSuccess: 0.80, maxGuardrailCutPct: 10 })`, with a
    `// load-time:` comment.
  - `spendingVariant(base, delta) -> inputs`:
    `{ ...base, spending: Math.max(0, base.spending + delta), spendingTiers: base.spendingTiers.map((t) => ({ ...t, amount: Math.max(0, t.amount + delta) })) }`
  - `findSpendingRoom(selected, base, contextFor) -> { room, atCap, unfixable, runs }`. It always returns all four
    fields.
    - `room`: a multiple of `ROOM_STEP`; positive is room to spare, negative is the cut needed.
    - `runs`: the number of projections it ran.
  - `displayRoom(room) -> number`: the conservative rounding in Global Constraints.
  - `deepestGuardrailCut(onSim, offSim) -> number` in [0, 1).
  - `planVerdict({ depleted, roomShare, histRate, guardrails, cutPct, scenario }) -> 'comfortable' | 'tight' | 'short'`.
    `roomShare` is `displayRoom(room) / spending`; `cutPct` is `Math.round(cut * 100)`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/spending-room.test.js`.

  **The US hand-computed cases** build on one household, `DRAW`:

  ```js
  { singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 74, incomeA: 0, inflation: 0, returnRate: 0,
    bondReturn: 0, hysaRate: 0, dividendYield: 0, healthcare: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0,
    tenure: 'rent', rent: 0, taxable: 0, cash: 0, emergencyCash: 0, bondYears: 0, trad401kA: 0,
    rothIraA: 400000, rothIraBasisA: 400000 }
  ```

  It runs 10 projection years (65–74), and $400,000 lasts at exactly $40,000 a year (verified: $40,000 lasts and $40,100
  runs out at 74). Each case does the following:
  1. `const state = await w.setState({ ...DRAW, ...patch })`.
  2. US only: `refreshCliffPlan()` from `us/core/cliff-plan/planning.js`, as `tests/unit/shared/engine-ratchet.test.js:66`
     does.
  3. `const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor()`.
  4. `const selected = (await w.load('shared/core/projection/runs.js')).simulateWith(ctxFor(state))`.
  5. `findSpendingRoom(selected, state, ctxFor)`.

  | Test (US only, `usIt`) | Patch | Expected (whole object) |
  |---|---|---|
  | `room to spare` | `spending: 30000` | `room: 10000, atCap: false, unfixable: false` |
  | `cut needed` | `spending: 45000` | `room: -5000, atCap: false, unfixable: false` |
  | `spending room shifts spending tiers` | `spending: 30000`, `spendingTiers: [{ name: '', amount: 50000, startAge: 65, endAge: 69, followGrowth: true, growth: 0 }]` | `room: 0` (5×(50,000+d) + 5×(30,000+d) = 400,000 gives d = 0; shifting base spending alone would give +20,000) |
  | `a tier above base spending is not unfixable` | `spending: 10000`, tier `{ amount: 60000, startAge: 65, endAge: 74, ... }` | `room: -20000, unfixable: false` (10×(60,000+d) = 400,000) |
  | `capped when the room is beyond the search` | `spending: 0`, `rothIraA: 10000000`, `rothIraBasisA: 10000000` | `room: 100000, atCap: true, unfixable: false` (cap = max(100,000, 2 × spending)) |
  | `unfixable when even zero spending runs out` | `spending: 30000`, `rothIraA: 100000`, `rothIraBasisA: 100000`, `rent: 1000` (monthly: $12,000 a year exceeds $100,000 over 10 years) | `room: -30000, atCap: false, unfixable: true` |

  Each of these also checks `runs <= 20`. Compare `{ room, atCap, unfixable }` with `toStrictEqual`; check `runs`
  separately.

  **For both countries:**
  - `the room is the edge: default household`. `w.setState({})` (refresh the cliff plan in the US), find the room `R`.
    If it is not `atCap`, then `simulateWith(ctxFor(spendingVariant(state, R))).depletedAge` is `null` and
    `simulateWith(ctxFor(spendingVariant(state, R + ROOM_STEP))).depletedAge` is not `null`. These are two runs in one
    process, so the check holds on Node 22 and 24.
  - `deepestGuardrailCut`, on plain objects.
    - With `on = { rows: [{ working: true, baseSpend: 50 }, { working: false, baseSpend: 90 }, { working: false, baseSpend: 72 }] }`
      and `off = { rows: [{ working: true, baseSpend: 100 }, { working: false, baseSpend: 100 }, { working: false, baseSpend: 90 }] }`,
      the result is `0.19999999999999996` (1 − 72/90, as the double).
    - Identical rows give `0`.
    - A raise (on above off) gives `0` (clamped).
    - Off rows with `baseSpend: 0` are skipped.
  - `displayRoom`:

    | In | Out | In | Out |
    |---|---|---|---|
    | 9900 | 9000 | 7800 | 7000 |
    | 4999 | 4500 | 499 | 0 |
    | 0 | 0 | −100 | −500 |
    | −4501 | −5000 | −6001 | −7000 |
    | −6000 | −6000 | | |

    No result is `-0`.
  - `planVerdict`. Each case lists only the fields that differ from
    `{ depleted: false, roomShare: 0.5, histRate: 0.9, guardrails: false, cutPct: 0, scenario: false }`:

    | Input | Out |
    |---|---|
    | `depleted: true` | `'short'` |
    | `roomShare: 0.10, histRate: 0.80` | `'comfortable'` |
    | `roomShare: 0.0999` | `'tight'` |
    | `histRate: 0.79` | `'tight'` |
    | `histRate: null` | `'comfortable'` |
    | `guardrails: true, cutPct: 10` | `'comfortable'` |
    | `guardrails: true, cutPct: 11` | `'tight'` |
    | `roomShare: 0.5, histRate: 0.5, scenario: true` (test name `planVerdict ignores history under a scenario`) | `'comfortable'` |

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/spending-room.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/core/analysis/spending-room.js`.** Line 1:
  `// Spending room: how much more (or less) a year the plan supports, and the verdict word`.

  The search uses `lasts(d) = !simulateWith(contextFor(spendingVariant(base, d))).depletedAge`.
  - **When `selected` lasts:**
    - `cap = ROOM_STEP * Math.ceil(Math.max(100000, 2 * base.spending) / ROOM_STEP)`.
    - If `lasts(cap)`, return `room: cap, atCap: true`.
    - Otherwise bisect integer `k` in `[0, cap / ROOM_STEP)` for the largest `k` with `lasts(k * ROOM_STEP)`
      (`k = 0` is `selected`).
  - **When `selected` runs out:**
    - `lo = -ROOM_STEP * Math.ceil(Math.max(base.spending, ...base.spendingTiers.map((t) => t.amount)) / ROOM_STEP)`.
    - If `!lasts(lo)`, return `room: lo, unfixable: true`.
    - Otherwise bisect for the largest lasting `k` in `[lo / ROOM_STEP, 0)`.
  - Add a comment that lasting is assumed monotone in `d`.

  `deepestGuardrailCut` returns `Math.max(0, 1 - min(on.rows[i].baseSpend / off.rows[i].baseSpend))` over the rows
  where `!on.rows[i].working && off.rows[i].baseSpend > 0`, and 0 when there are none.

  `planVerdict`:
  - `histOk = scenario || histRate == null || histRate >= minHistSuccess`.
  - The margin test is `roomShare >= minRoomShare`, or with guardrails `cutPct <= maxGuardrailCutPct`.

  `displayRoom(x)`:
  - `step = Math.abs(x) < 5000 ? 500 : 1000`.
  - `x >= 0` gives `Math.floor(x / step) * step`.
  - `x < 0` gives `-Math.max(500, Math.ceil(-x / step) * step)`.
  - Return `0`, never `-0`.

- [ ] **Step 4: Run.**
  - `npx vitest run tests/unit/shared/spending-room.test.js` passes in both projects.
  - The same with `--sequence.shuffle` passes.
  - `npm run analyze`.
  - `node tests/engine_purity.js` passes.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/shared/core/analysis/spending-room.js tests/unit/shared/spending-room.test.js docs/superpowers/inventory docs/architecture/test-inventory.md
  git commit -m "Spending room search and verdict rules (dashboard guidance PR 1)"
  ```
  The commit includes the `test-inventory.md` line for the new suite.

---

### Task 2: The verdict card replaces the "On track" headline

**Files:**
- Create:
  - `src/shared/ui/results/plan-verdict.js`
  - `test_plan_verdict.js` (repo root, both planners)
- Delete: `src/shared/ui/results/render-plan-headline.js`
- Modify:
  - `src/us/index.html:211` and `src/canada/index.html:154`: the headline div, plus the badges `V176` / `V81`.
  - `src/us/ui/results/render.js`:
    - `renderBody`: the `renderPlanHeadline(selected)` call at line 155.
    - `renderDeferred()`.
  - `src/canada/ui/results/render.js`. Canada has no `renderBody`: the call is inline in `render()` at line 131, and
    `renderDeferred()` is at lines 167–172, with no re-draw.
  - `src/us/main.js` and `src/canada/main.js`: call `wirePlanVerdict()`.
  - `src/shared/ui/results/render-scheduler.js`: `markDeferredStale()`.
  - `src/shared/ui/results/shortfall-banner.js`: stop offering a spending cut.
  - `src/shared/styles/styles.css`.
  - `src/shared/ui/install-test-hooks.js`.
  - `test_spending_and_fi_widgets.js:159`.
  - `test_deferred_render.js`: lines 47–66, 143 and 159.
  - `docs/superpowers/inventory/stage2-region-map.md:27`.
  - `README.md` ("Results and analysis").
  - `docs/architecture/inputs-and-ui.md`.
  - `docs/architecture/test-inventory.md`.

**Interfaces:**
- Consumes:
  - From Task 1: `findSpendingRoom`, `spendingVariant`, `displayRoom`, `deepestGuardrailCut`, `planVerdict`.
  - From elsewhere:
    - `simulateWith` (`core/projection/runs.js`)
    - `stateContextFor`
    - `currentMarketScenarioText` (`market-scenario-banner.js`)
    - `compact` (`core/format/numbers.js`)
    - `state` (`core/store.js`)
    - `setChartView` (`src/shared/ui/charts/chart-view-mode.js:9`)
- Produces, in `plan-verdict.js`:
  - `export let lastVerdict`: `null`, or
    `{ word, room, shown, atCap, unfixable, guardrails, cutPct, depletedAge, endAge, spending, scenarioText }`, where
    `shown = displayRoom(room)`. UI state, assigned only in this module.
  - `export function renderPlanVerdict(selected)`: computes, then paints.
  - `export function paintPlanVerdict()`: paints from `lastVerdict` and the historical rate; computes nothing.
  - `export function wirePlanVerdict()`: delegated listeners on `#planVerdict`, called once from each `main.js`.
  - Test hook: `window.__test_planVerdict = () => lastVerdict`.

- [ ] **Step 1: Write `test_plan_verdict.js`.**
  - **Form:** model it on the other root scripts. It reads the build (`plannerPath`), exits 1 on failure, collects
    `pageerror`, and uses no fixed waits.
  - **Reading results:** after an input change, call `__test_flushRender()` before reading.
  - **Base spending:** read it back from `__test_planVerdict().spending`.
  - Checks run in both planners unless marked otherwise:
  - **"default verdict":** `#planVerdict[data-verdict]` is one of `comfortable|tight|short`, and `#planVerdictWord`
    equals `{ comfortable: 'Comfortable', tight: 'Tight', short: 'Short' }[__test_planVerdict().word]`.
  - **"room is the edge"** (skip when `atCap`):
    - Set `#spending` to base + `room` and dispatch `change`: `window.fireProjection.depletedAge === null`.
    - Base + `room` + 1000 gives a non-null `depletedAge`.
  - **"short":** spending 250000 gives `data-verdict="short"`, and the text matches `/runs out at \d+/` and
    `/less a year/`, not `/\$0 less/`.
  - **"unfixable"** (US): on the default household with spending 0, raise `#rent` until the verdict is `short` (a fixed
    value is fine once found). The text then contains `Cutting household spending alone can't fix this`, and
    `#shortfallBanner` does not mention household spending.
  - **"different retirement ages"** (couple): `retireAgeA` 55 and `retireAgeB` 57 give text containing
    `Retiring at A 55 / B 57`.
  - **"guardrails":** check `#guardrailsEnabled`. On the default household, the text contains `Guardrails` and
    `__test_planVerdict().guardrails === true`.
  - **"nominal mode":** switch to future dollars (`setMode` through the dollars menu). The text contains
    `today's dollars`.
  - **"mobile":** at 390×844, `document.documentElement.scrollWidth > clientWidth` is `false`.

- [ ] **Step 2: Run** `npm run build && node test_plan_verdict.js`. Expected: FAIL (`#planVerdict` missing).

- [ ] **Step 3: Markup and styles.**
  - **Markup:** in both shells, inside `.headline-row` and before the retire chip, the headline div becomes:
    ```html
    <div class="callout plan-verdict" id="planVerdict" data-verdict=""><div class="verdict-word" id="planVerdictWord"></div><div class="verdict-text" id="planVerdictText"></div><div class="verdict-hist" id="planVerdictHist"></div></div>
    ```
  - **The verdict block:** `.plan-verdict` takes `.plan-headline`'s rules. That includes the
    `.headline-row .plan-headline` selector, which is renamed.
  - **Colour:** the border-left colour follows `data-verdict`: `var(--green)`, `var(--amber)` or `var(--red)`.
  - **The word:** `.verdict-word` is bold, about 1.05em.
  - **Dimming:** add `.plan-verdict.stale, .verdict-hist.stale { opacity: .5; transition: opacity .15s }`. The existing
    `.stale` rules cover only charts, metrics and cards.
  - Delete the `.plan-headline` rules.

- [ ] **Step 4: Implement `plan-verdict.js`.** Line 1:
  `// The plan verdict: Comfortable / Tight / Short, the spending room and the historical line`.

  `renderPlanVerdict(selected)`:
  - Set up: `ctxFor = stateContextFor()`, `scenarioText = currentMarketScenarioText()`, and
    `endAge = Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)`.
  - **If `state.guardrailsEnabled && !selected.depletedAge`:**
    - `off = simulateWith(ctxFor({ ...state, guardrailsEnabled: false }))`.
    - `cutPct = Math.round(deepestGuardrailCut(selected, off) * 100)`.
    - Skip the room search.
  - **Otherwise:** `findSpendingRoom(selected, state, ctxFor)`.
  - **The word:** `planVerdict` with:
    - `roomShare = state.spending > 0 ? shown / state.spending : Infinity`
    - `scenario: scenarioText !== null`
    - `histRate`: Task 3 supplies it; `null` until then, and the historical line stays empty.
  - Store `lastVerdict`, then call `paintPlanVerdict()`.

  **Copy** (exact). Notation:
  - `fmt(x) = compact(x)` applied to `shown` or `-shown`.
  - `retiring`: per Global Constraints.
  - Pick the case on `shown`, never on `room`.

  | Case | `#planVerdictText` |
  |---|---|
  | Lasts, `shown > 0` | `${retiring}, your money lasts through age ${endAge}. You could spend about <b class="verdict-room" tabindex="0">${fmt(shown)} more a year</b> (today's dollars) and still make it.` When `atCap`, the bold text is `more than ${fmt(shown)} more a year`. |
  | Lasts, `shown === 0` | `${retiring}, your money lasts through age ${endAge}, with no room to spend more.` |
  | Runs out | `${retiring}, your money runs out at ${depletedAge}. You would need to spend about <b class="verdict-room" tabindex="0">${fmt(-shown)} less a year</b> (today's dollars) to make it to ${endAge}.` |
  | Runs out, `unfixable` | `${retiring}, your money runs out at ${depletedAge}. Cutting household spending alone can't fix this.` |
  | Guardrails, lasts | `${retiring}, your money lasts through age ${endAge}. Guardrails cut your spending by up to <b>${cutPct}%</b> in the worst year.` When `cutPct === 0`, the second sentence is `Guardrails never cut your spending.` |

  | `#planVerdictHist` | Text |
  |---|---|
  | No scenario, rate known | `Held up in ${Math.round(rate * 100)}% of historical markets since 1928 · <button type="button" class="link-btn" data-verdict-action="bad-years">see the bad ones</button>` |
  | Scenario on | `Inside the scenario: ${scenarioText}.` |
  | Rate never computed | empty |

  `wirePlanVerdict()` adds one delegated `click` listener on `#planVerdict`. For
  `[data-verdict-action="bad-years"]` it calls `setChartView('hist')`, then
  `document.getElementById('mainChartCard').scrollIntoView({ behavior: 'smooth', block: 'start' })`. (Task 4 adds the
  gauge's listeners here.)

- [ ] **Step 5: Wire the render passes and neighbours.**
  - **US:** in `renderBody`, replace `renderPlanHeadline(selected)` with `if (!light) renderPlanVerdict(selected);`.
    **Canada:** the same change at the inline call in `render()`.
  - **`renderDeferred()`** (both countries): call `renderPlanVerdict(simulate())` after any `renderBody` re-draw and
    before `clearStale()`.
  - **`markDeferredStale()`:** always `markStale(document.getElementById('planVerdict'))`. The deferred timer is then
    armed after every light render (`render-scheduler.js:39`), in Canada too.
  - **`shortfall-banner.js`:** when `driver.kind !== 'structural' && driver.label === 'household spending'`, hide the
    banner as in the no-driver branch. The verdict now owns the spending figure. Leave the delay driver and the
    structural drivers as they are.
  - **Remove the old headline:** delete `render-plan-headline.js` and its imports. Replace the
    `docs/superpowers/inventory/stage2-region-map.md:27` row's path with
    "render-plan-headline.js (removed in dashboard guidance PR 1)", with no `src/` path, so `tests/doc_paths.js` passes.
  - **Test hook and wiring:** add the hook to `src/shared/ui/install-test-hooks.js`, and call `wirePlanVerdict()` in
    both `main.js` files beside `wirePlanStatusBar()`.
  - **`test_spending_and_fi_widgets.js:159`:** keep the layout assertion (the chip sits beside the block), now on
    `#planVerdict` and unconditional. The block is always visible.
  - **`test_deferred_render.js`:**
    - Add `'planVerdict'` to every list of stale elements expected after an input (lines 47, 52, 65, 143, 159).
    - Update the `busy` count (line 66).
    - Reword line 49's "nothing is deferred" to "only the verdict is deferred".
  - **Docs:**
    - README: the "Results and analysis" bullets describe the verdict, its spending room, the historical line and
      that the pinned bar shows the verdict.
    - `inputs-and-ui.md`: the verdict replaces the headline. It is computed in the full render and the deferred pass,
      and the light render dims it.
    - `test-inventory.md`: add `test_plan_verdict.js`.
  - **Badges:** bump both.

- [ ] **Step 6: Timing gate.**
  - In the built US planner, time `renderPlanVerdict(simulate())` with `performance.now()` through a temporary
    snippet in the browser console (not committed). Three households:
    - the default;
    - `CONVERTING` from `tests/unit/shared/success-with.test.js:20`;
    - a couple aged 30 retiring at 50 with conversions on.
  - Also time it in the Canada default.
  - Record the four times for the PR description. **If any is over 250 ms, stop and report**: the search bounds and
    the full-render placement are design choices, not tuning.

- [ ] **Step 7: Run.**
  - `npm run build && node test_plan_verdict.js && node test_spending_and_fi_widgets.js && node test_deferred_render.js`
    passes.
  - `npm run analyze`.
  - `node tests/doc_paths.js` passes.
  - `npm test` passes except for the `snapshot_ui` text and layout hashes. Confirm that the moved entries are only the
    verdict block, the badges and the shortfall banner, then run `npm run snapshot:update` (an intended change).

- [ ] **Step 8: Commit** everything above, with the snapshot baselines:
  `git commit -m "Plan verdict card replaces the On track headline (US V176, Canada V81)"`.

---

### Task 3: The status bar shows the verdict; the backtest moves to the verdict module

**Files:**
- Modify:
  - `src/shared/ui/results/plan-status-bar.js`
  - `src/shared/ui/results/plan-verdict.js`
  - both `render.js` (the `renderPlanStatusBar()` calls: US line 180, Canada line 154)
  - `test_info_tips.js:37`
  - `test_plan_verdict.js`
  - `docs/architecture/inputs-and-ui.md`

**Interfaces:**
- Consumes:
  - `lastVerdict`, `paintPlanVerdict` (Task 2)
  - `runHistoricalCycles` (`core/projection/simulate.js`)
  - `__test_runMarketScenario`, `__test_revertMarketScenario` (existing hooks)
- Produces:
  - **`plan-status-bar.js`:**
    - `export function paintPlanStatusBar(text)`. It keeps today's "Updated just now" pulse and the offset syncs
      (`syncPlanStatusOffsets`, `syncPanelMaxHeight`, the 320 ms re-sync), and `wirePlanStatusBar()` unchanged.
    - `renderPlanStatusBar` and its historical timer are removed.
  - **`plan-verdict.js`:**
    - `export let verdictHistRate = null`.
    - `export function scheduleVerdictHistRate()`: the 500 ms debounce moved from the bar. On arrival it:
      - sets `verdictHistRate`;
      - re-decides `lastVerdict.word` with `planVerdict`, which is the only way a downgrade to Tight from history
        happens;
      - updates the `#dashHistSuccess` tile exactly as today (text, class, sub-label);
      - calls `paintPlanVerdict()`.
    - Between a change and the next arrival, the previous rate stays in use and `#planVerdictHist` carries `.stale`.
      The rate never resets to `null` after the first arrival, so the word does not flicker.
  - The import direction is `plan-verdict.js` → `plan-status-bar.js` only (no cycle).

- [ ] **Step 1: Extend the tests.** `test_plan_verdict.js` gains three checks:
  - **"historical line":** `page.waitForFunction` until `#planVerdictHist` matches
    `/Held up in \d+% of historical markets since 1928/`. Clicking `[data-verdict-action="bad-years"]` makes the
    historical chart view active (read it the way `test_deferred_render.js` detects the chart view).
  - **"status bar":**
    - `#planStatusText` starts with the displayed word.
    - With the historical line in, the default household matches
      `/^(Comfortable|Tight) · \+\$[\d.]+K\+?\/yr room · \d+% historical$/`.
    - The "short" check matches `/^Short · runs out at \d+/`.
  - **"scenario":**
    - `__test_runMarketScenario(...)` with a preset crash (copy the argument shape from an existing scenario test),
      then flush.
    - `#planVerdictHist` reads `Inside the scenario:`, and `#planStatusText` has no `% historical`.
    - `__test_revertMarketScenario()` brings both back.

  `test_info_tips.js:37`: `/historical success/` becomes `/% historical/`.

- [ ] **Step 2: Run** `npm run build && node test_plan_verdict.js`. Expected: FAIL on "historical line".

- [ ] **Step 3: Implement.**
  - **Bar text** from `lastVerdict`, joined with `' · '`:
    1. The word.
    2. One of:
       - `+${compact(shown)}/yr room`, with `+` before `/yr` when `atCap`;
       - `no room to spare` when `shown === 0`;
       - `runs out at ${depletedAge}`;
       - with guardrails, `cuts up to ${cutPct}%`, or `no guardrail cuts`.
    3. `${Math.round(rate * 100)}% historical`, only when the rate is known and no scenario is on.
  - **Where `renderPlanStatusBar()` was called** (every render, light or not):
    - call `scheduleVerdictHistRate()`;
    - repaint the bar from the (possibly stale) `lastVerdict`.
  - **Docs:** `inputs-and-ui.md` says the backtest debounce lives in `plan-verdict.js`.

- [ ] **Step 4: Run.**
  - `npm run build && node test_plan_verdict.js && node test_info_tips.js && node test_deferred_render.js` passes.
  - `npm run analyze`.
  - `npm test`. Refresh the `snapshot_ui` baselines for the moved bar text only, and state it in the commit.

- [ ] **Step 5: Commit:** `git commit -m "Status bar shows the verdict; historical backtest moves to plan-verdict"`.

---

### Task 4: The spending gauge

**Files:**
- Modify: `src/shared/ui/results/plan-verdict.js`, `src/shared/styles/styles.css`, `test_plan_verdict.js`.

**Interfaces:**
- Consumes: `lastVerdict` (`spending`, `shown`), `wirePlanVerdict` (Task 2).
- Produces: `#planVerdictGauge`, inside `#planVerdict`, created by `paintPlanVerdict` when a gauge applies.

- [ ] **Step 1: Extend `test_plan_verdict.js` with "gauge".** It applies to the default household; skip it when the
  plan is `atCap`, `shown <= 0` or guardrails are on.
  - `page.click('.verdict-room')` pins the gauge open: `#planVerdictGauge` is visible.
  - Its text contains `you: ${compact(spending)}` and `most it supports: ${compact(spending + shown)}`, both computed
    in the test from `__test_planVerdict()`. Pass `compact` in through `page.evaluate`, or compare against the
    `#planVerdictText` figure.
  - A second click hides it.
  - With the gauge open at 390×844, mobile overflow is `false`.
  - In the "guardrails" and "unfixable" checks, `#planVerdictGauge` does not exist.

- [ ] **Step 2: Run.** It fails on "gauge".

- [ ] **Step 3: Implement.**
  - **Scale:** the bar spans $0 to `1.15 × (spending + shown)`.
  - **Colours:** green to `0.9 × (spending + shown)`, amber to `spending + shown`, red beyond. A white marker sits at
    `spending`.
  - **Labels:** `$0`, `you: ${compact(spending)}`, `most it supports: ${compact(spending + shown)}`. They use `shown`,
    the same figure as the sentence.
  - **Showing and hiding**, through delegated listeners added in `wirePlanVerdict()`:
    - `pointerover` / `pointerout` on `.verdict-room` show and hide it only when `e.pointerType === 'mouse'` and it is
      not pinned;
    - `focusin` / `focusout` do the same for the keyboard;
    - `click` toggles a pinned state.
  - **Repaints:** delegated listeners survive repaints, and the pinned state lives in a module `let`, reapplied by
    `paintPlanVerdict`.
  - **When there is no gauge:** with guardrails, `atCap`, `unfixable`, or `shown <= 0`.

- [ ] **Step 4: Run** `npm run build && node test_plan_verdict.js`. It passes.

- [ ] **Step 5: Commit:** `git commit -m "Spending gauge on the verdict's room figure"`.

---

### Task 5: The full sweep

- [ ] **Step 1:** `npm test` passes.
- [ ] **Step 2:** `npm run test:ui` passes. CI runs every root script.
- [ ] **Step 3:** `npx vitest run --sequence.shuffle` passes.
- [ ] **Step 4:** Put the Task 2 timings and the snapshot changes in the PR description.
