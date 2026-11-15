# Dashboard guidance PR 3: goal answers, ranked moves and "Try" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "What should I change?" in both planners:
- one short answer per chosen goal, under the verdict, each from an engine that exists today;
- when the plan is Tight or Short, up to four tested moves, best first, each with "Try" (a held preview with Keep / Revert).

It removes the run-out banner and the "What do you want to figure out?" card.

**Architecture:**
- **One verdict function.** The verdict's computation (room search, or the guardrail cut) moves out of `plan-verdict.js` into a
  DOM-free `projectionVerdict` (`src/shared/core/analysis/projection-verdict.js`). The verdict card, every move and the survivor
  answer call it, so a move's figure is by construction the figure the verdict shows after "Try".
- **Resumable searches.** The room search becomes a generator that yields after each engine run (`spendingRoomSteps`);
  `findSpendingRoom` drains it. Every move and answer is a generator of steps.
- **One background job** (`src/shared/ui/results/guidance-answers.js`), modelled on PR 2's measuring job:
  - it starts only from the full render and the end of the deferred pass, never while the US bracket search is pending;
  - it runs in slices of at most 40 ms (or 8 steps, or one cliff-plan search), and stops without committing when `state` or its
    key changes;
  - its first unit is the base verdict, then the moves (only for a Tight or Short projection), then the chosen goals' answers.
- **US moves get their own plan.** A US move is measured with the cliff plan of the moved inputs (`ownPlanContextFor`, one
  searched plan per move, then held fixed), because that is the plan the page runs after "Try". Goal answers that only compare
  hold the kept plan fixed, as the verdict and PR 2 do, except the conversion answer (below).
- **Try** (`src/shared/ui/plans/move-preview.js`) replaces `state` with the moved inputs and keeps the real settings in a preview
  snapshot, like market-scenario mode. Only one preview (a move or a market scenario) can be on at a time.
- Sentences are built by DOM-free text functions, so their exact copy is unit-tested.

**Tech Stack:** plain ES modules, esbuild single-file build, Vitest (unit), Playwright (root `test_*.js`).

**Spec:** `docs/superpowers/specs/2026-11-12-dashboard-guidance-design.md`, Part 3 only ("What should I change?").

**Base:** this branch starts from `claude/dashboard-goals-3adbba` (PR 2, amacgrog/Fire-Planner#98, not yet merged). It uses PR 2's
`guidanceGoals`, `GOALS`, `chosenGoals` and the guidance job's key (`impactKey`). Rebase onto `main` once #98 merges.

## What each answer and move costs (probed 2026-11-14)

A scratch Vitest probe (not committed) timed the pieces in Node on the default households and three variants of them: Tight
(`spending: 64000`), Short (US `78000`, Canada `76000`), and a US early-ACA household (`ageA/B 40`, retiring at 50, ACA and
conversions on).

| Piece | US | Canada |
|---|---|---|
| One projection run | 8–13 ms | 5–9 ms |
| One room search (`findSpendingRoom`) | 10–12 runs, 45–130 ms | 10–12 runs, 30–100 ms |
| One searched cliff plan for a variant (`planForState`) | 5–16 ms on the default households; 105–240 ms with conversions newly on; 160–260 ms for every variant of the early-ACA household | none |

**Held plan or own plan (US room, $/yr):**

| Household | Variant | kept plan held | variant's own plan |
|---|---|---|---|
| default (room 9,000) | conversions on | 7,900 | 9,100 |
| Short (room −9,000) | conversions on | −10,100 | −9,000 |
| early-ACA (room 2,700) | retire 1 year later | 6,800 | 7,100 |
| early-ACA | retire 1 year earlier | −1,800 | −1,400 |
| early-ACA | rent instead | −15,300 | −16,000 |
| every household | withdrawal order on | equal | equal |
| default, Tight, Short | retire ±1–2, rent, payoff, survivor A / B | equal | equal |

**What this decides:**
- With the kept plan held, "turn on conversions" reads as a loss (−$1,100/yr on the default plan) where its own plan makes it a
  small gain. The kept plan of a non-converting state carries no bracket search, and the order lever's plan carries no `orders`.
  So US moves, and the conversion answer's toggled run, get their own searched plan. That also makes "Try" show the move's figure.
- The other comparisons agree with the kept plan held, except in the early-ACA household (within $700/yr). Goal answers hold it,
  as the verdict does, which keeps the retirement-age scan affordable.
- Turning on the meltdown or pension splitting moved the Canada room by $0 in all three households, and the withdrawal order by
  $0 in the US. They are still tested; a move under $500/yr of gain is not shown.

**Job totals** (estimates from the table, measured in Task 5): all seven goals on the US default plan come to about 85 runs plus one
cliff search, about 1.2 s of background work. A Short US plan's moves come to about 45 runs plus five cliff searches (one per move: retire, spend, conversions, order,
guardrails; the reviewer timed the order lever's at 65 ms), 0.6–1.3 s.
Canada is about half. Every slice is short (one run is at most 13 ms); the one exception is a cliff search, which is atomic, at up to
260 ms. That is the same order as the bracket search the deferred pass already runs.

## Global Constraints

- **Scope:** both planners in this PR. Shared code goes in `src/shared/`; country pieces come through seams.
- **No projection number changes:** `npm test` stays exact and `tests/golden.js` is untouched.
  - Task 1 refactors the verdict and the room search: every verdict figure stays the same (`tests/unit/shared/spending-room.test.js`
    and `test_plan_verdict.js` pass unchanged).
  - `snapshot_ui` text and layout baselines move on purpose (the moves card replaces the banner; the decision card goes); each
    commit says so.
- **When work runs:**
  - The light render only repaints the moves and answers from what is already measured, dimmed (`.measuring`) when the key
    changed. It runs no projection.
  - The job starts from `render()` when `!light` and at the end of `renderDeferred()`, beside `scheduleFieldImpacts()`. It never
    starts while `searchPending()`.
  - Removing `renderShortfallBanner` takes its two searches (`findMinimalSpendingCut`, `findMinimalRetirementDelay`) out of
    every light render: the light render gets faster on a Short plan.
- **The job key** is PR 2's `impactKey(s)` (the tax year and the inputs without `guidanceGoals`, the two dismissal lists and the
  list-row names). Export it from `guidance.js`. A chip click keeps every answer already measured; a newly chosen goal is
  measured.
- **Slices:** a slice runs steps until 40 ms have passed (`performance.now()`) or 8 steps, whichever comes first; then
  `setTimeout(…, 0)`.
  - A cliff-plan search always runs alone. A unit yields `'plan-next'` right before it plans, and the slice ends there unless it has
    run nothing yet; the planning step is then the slice's only step.
  - The step cap keeps a slice short under Playwright's frozen clock.
  `runGuidanceAnswersToEnd()` (the test flush) has no limit and schedules no timer.
- **Measures:**
  - Every figure is in today's dollars, whatever the display mode, as the verdict's room is. The display mode is not in the key.
  - Rounding: a room or a gain is shown through `displayRoom` (down to $500 under $5,000, else to $1,000). A gain under $500 is
    "little difference".
  - Words come from `projectionVerdict` / `projectionWord`, which never read the historical rate: an answer or move says "in the
    projection".
- **Moves are computed only when the projection word is Tight or Short.** A plan that is Tight only because of the historical line
  gets no moves (no move is tested against history; the verdict's "see the bad ones" link is its guidance). *(My call, recorded for
  the owner.)*
- **Move rules** (`MOVE_RULES`, one frozen object): `{ maxShown: 4, maxDelay: 15, fallbackDelay: 5, minGain: 500, maxRetireAge: 70 }`.
- **Try:**
  - Only a move measured for the current inputs can be tried: Try is disabled while the moves are dimmed or being measured.
  - One preview at a time: `tryMove` refuses while a market scenario or another move is previewed; `runMarketScenario` refuses
    while a move is previewed. Try buttons are disabled then, with the title `Keep or revert the change you are previewing first.`
    (move on) or `Revert the market scenario to try a change.` (scenario on). The market scenario card's Run button is disabled
    with the first title while a move is previewed.
  - While a move is previewed, autosave writes the real settings and `#saveStatus` reads `Previewing a change: Keep it to save`.
  - Edits made during a preview apply to the preview; Revert discards them, as under a market scenario.
  - The goal chips and the wizard's goal checkboxes are locked during a preview, with the title
    `Keep or revert the change you are previewing to change your goals.`
  - Reset reverts a preview first (as it reverts a scenario first).
- **Version badges:** US `V177` → `V178`, Canada `V82` → `V83`, once for the PR, in Task 5. Task 6 is user-facing too and does
  not bump again; its commit message says the PR's bump covers it (the PR 2 precedent).
- **Module rules:**
  - Line 1 is a one-line `//` purpose comment, then a blank line.
  - Two-space indentation inside modules.
  - A computing module-level initializer gets a `// load-time:` comment.
  - Run `npm run analyze` after adding or removing modules or exports.
  - Engine-side modules (`core/analysis/`) take a `contextFor` from their caller and import no store module.
- **Wiring:** new listeners go in wiring functions called once from both `main.js` files.
- **Docs** change in the same commit as the code they describe.
- **Vitest:** through `world()` only; exact comparisons (`toBe`, `toStrictEqual`); a tolerance is written out, never
  `toBeCloseTo`; hand-computed figures stay literals. The new suites with many checks count them (`makeCounter`, the total
  asserted in `afterAll`: rule 3).

## Review Focus

1. **Try shows what the move said.** After Try, the verdict's room (or cut) and projection word equal the move's measured ones
   exactly, in both planners, the US included (its own plan). Tests: Task 2, `a move's verdict is the verdict of its inputs`;
   Task 5, check "try matches".
2. **Inputs change while the job runs,** or a load / undo / reset / Try replaces `state`: nothing for old inputs is committed or shown
   undimmed. Test: Task 5, check "job stops on change".
3. **A preview left open:** reload, Reset, a market scenario Run, a chip click and the scenario list while previewing. The real plan
   is what is saved and what comes back. Tests: Task 4, checks "reload is the real plan", "one preview at a time", "reset reverts".
4. **Guardrails on:** the verdict's margin is the cut, so moves are judged by the cut and the cut-spending move is not offered; the
   spending answer measures without guardrails and says so. Tests: Task 2, `guardrails: moves judged by the cut`; Task 3,
   `spend answer under guardrails`.
5. **Edges of the retirement scan and the moves:** a single person (no partner-B ages, no survivor answer), a partner already
   retired (the earliest age is today's), a plan that cannot be fixed by spending, and a plan already at the latest retirement age.
   Tests: Task 2, `retire-later range`; Task 3, `retire answer edges`; Task 5, check "unfixable".

---

### Task 1: Core: a resumable room search and one verdict function

**Files:**
- Create: `src/shared/core/analysis/projection-verdict.js`, `tests/unit/shared/projection-verdict.test.js`
- Modify:
  - `src/shared/core/analysis/spending-room.js`: `spendingRoomSteps`, `comfortableThreshold`.
  - `src/shared/ui/results/plan-verdict.js`: `renderPlanVerdict` calls `projectionVerdict`.
  - `docs/architecture/inputs-and-ui.md` (the verdict paragraph), `docs/architecture/test-inventory.md`.

**Interfaces:**
- Produces, in `spending-room.js`:
  - `function* spendingRoomSteps(selected, base, contextFor)`: the body of today's `findSpendingRoom`, with `yield 'run'` after
    every projection. Returns `{ room, atCap, unfixable, runs }` (the generator's return value).
  - `drainSteps(gen) -> value`: runs a generator to its end and returns its return value. It lives here, not in
    `projection-verdict.js`, which imports this module (a `core/` module is never in an import cycle, `tests/ui_cycles.js`).
  - `findSpendingRoom(selected, base, contextFor)` = `drainSteps(spendingRoomSteps(...))`. Same results, same `runs`.
  - `comfortableThreshold(shareBase) -> number`: the smallest multiple of `ROOM_STEP` whose shown room reads Comfortable, decided
    with the verdict's own comparison so the two can never differ in the last bit: the smallest `t` (a multiple of 100, from 0) with
    `displayRoom(t) / shareBase >= VERDICT_RULES.minRoomShare`. Compute the candidate from `X = minRoomShare * shareBase`
    (`Math.ceil(X / 500) * 500`, or `Math.ceil(X / 1000) * 1000` when that is 5,000 or more), then step it down by 100 while the
    comparison still holds and up by 100 until it holds. `shareBase` can be fractional (tiers, guardrails), which is why the
    comparison, not `X`, decides.
- Produces, in `projection-verdict.js` (line 1: `// The verdict of a projection without history: its word, its room or guardrail cut, and its cheap word-only check`):
  - `function* projectionVerdictSteps(base, contextFor, selected = null)` returns
    `{ word, room, shown, atCap, unfixable, guardrails, cutPct, depletedAge, shareBase, selected, runs }`:
    - `selected` is the run of `base` when the caller has it (the verdict card passes the dashboard run). Otherwise it is
      `simulateWith(contextFor(base))`, and one `'run'` is yielded.
    - The rest is today's `renderPlanVerdict` computation:
      - `guardrails = Boolean(base.guardrailsEnabled && !selected.depletedAge)`;
      - with guardrails, one off run (`{ ...base, guardrailsEnabled: false }`) gives `cutPct = Math.round(deepestGuardrailCut(...) * 100)`;
      - otherwise `spendingRoomSteps`;
      - `shown = displayRoom(room)`, `shareBase = retiredSpending(selected, base)`;
      - `word = planVerdict({ ..., histRate: null, scenario: false })`.
    - `runs` counts every projection it ran.
  - `projectionVerdict(base, contextFor, selected = null)` = `drainSteps(projectionVerdictSteps(...))`.
  - `function* projectionWordSteps(base, contextFor) -> { word, depletedAge, shareBase, runs }`: the same word in at most 2 runs:
    - run 0 at `base`; depleted → `'short'`;
    - guardrails on: the off run, then the cut rule;
    - otherwise `shareBase <= 0` → `'comfortable'`, else one run at `spendingVariant(base, comfortableThreshold(shareBase))`:
      it lasts → `'comfortable'`, else `'tight'`.
- Changes: `renderPlanVerdict(selected)` builds `lastVerdict` from `projectionVerdict(state, stateContextFor(), selected)` and
  re-decides the word with `verdictHistRate` and the scenario exactly as today. `lastVerdict`'s fields and every painted string are
  unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/projection-verdict.test.js`. Reuse `spending-room.test.js`'s `DRAW`
  household and its setup (`setState`, `refreshCliffPlan()` in the US, `stateContextFor()`).
  - **`comfortableThreshold`** (both countries, no engine): 0 → 0; 30000 → 3000; 42000 → 4500; 47000 → 5000; 52000 → 6000.
    For each of 30000, 42000, 47000, 52000, the room one step below (`t - 100`) gives `displayRoom(t - 100) < X` and `t` gives
    `displayRoom(t) >= X`.
  - **`the steps drain to findSpendingRoom`** (`usIt`, `DRAW` at spending 30000 and 45000): `drainSteps(spendingRoomSteps(...))`
    is `toStrictEqual` to `findSpendingRoom(...)`, and the number of yielded `'run'` values equals `runs`.
  - **`projectionVerdict on DRAW`** (`usIt`):
    - spending 30000 → `{ word: 'comfortable', room: 10000, shown: 10000, atCap: false, unfixable: false, guardrails: false, cutPct: 0, depletedAge: null, shareBase: 30000 }`
      (compared without `runs` and `selected`);
    - 45000 → word `'short'`, room −5000;
    - 30000 with `rothIraA: 330000, rothIraBasisA: 330000` (room 3,000 against a threshold of 3,000) → `'comfortable'`;
      with 329000 → `'tight'` (room 2,900).
  - **`the word check agrees with the full verdict`** (both countries): on the default household and its `spending` set to 64000,
    76000 and 78000, and with `guardrailsEnabled: true`, `projectionWord(...).word === projectionVerdict(...).word`, and
    `projectionWordSteps` runs at most 2 projections.
  - **`the verdict card is unchanged`**: covered by `spending-room.test.js` and `test_plan_verdict.js`, run unchanged in Step 4.

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/projection-verdict.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the two modules and the `plan-verdict.js` change. `projection-verdict.js` imports `spending-room.js`
  and `runs.js` only.

- [ ] **Step 4: Run.**
  - `npx vitest run tests/unit/shared/projection-verdict.test.js tests/unit/shared/spending-room.test.js` passes, and again with
    `--sequence.shuffle`.
  - `npm run analyze`; `node tests/engine_purity.js && node tests/ui_cycles.js`.
  - `npm run build && node test_plan_verdict.js && node test_guidance.js` pass.

- [ ] **Step 5: Commit** with the test-inventory line and the `inputs-and-ui.md` sentence (the verdict's computation is
  `projectionVerdict`, shared with the moves):
  `git commit -m "Verdict: one projection-verdict function and a resumable room search (dashboard guidance PR 3)"`.

---

### Task 2: Core: the moves

**Files:**
- Create:
  - `src/shared/core/analysis/moves.js`
  - `src/us/core/analysis/move-levers.js`, `src/canada/core/analysis/move-levers.js`
  - `src/us/core/seam-MOVE_LEVERS.js`, `src/canada/core/seam-MOVE_LEVERS.js` (facades, as `seam-GUIDANCE_FIELDS.js`)
  - `src/us/core/seam-ownPlanContextFor.js`, `src/canada/core/seam-ownPlanContextFor.js`
  - `tests/unit/shared/moves.test.js`
- Modify:
  - `src/us/core/projection/store-context.js`, `src/canada/core/projection/store-context.js`: `ownPlanContextFor`.
  - `docs/architecture/test-inventory.md`.

**Interfaces:**
- Consumes: `projectionVerdictSteps`, `projectionWordSteps`, `drainSteps` (Task 1); `spendingVariant`, `displayRoom`
  (`spending-room.js`).
- Produces, in each `move-levers.js` (re-exported by its seam): `MOVE_LEVERS`, a frozen array in display order of
  `{ key, field, label, when: (s) => boolean }`, each move setting `field: true`:
  - US:
    - `conversions`, `rothConvEnabled`, `Turn on Roth conversions`, `!s.rothConvEnabled`;
    - `order`, `withdrawalMixEnabled`, `Turn on the tax-aware withdrawal order`, `!s.withdrawalMixEnabled && s.cliffGuardEnabled`
      (the order needs the cliff plan);
    - `guardrails`, `guardrailsEnabled`, `Turn on guardrails`, `!s.guardrailsEnabled`.
  - Canada:
    - `meltdown`, `meltdownEnabled`, `Turn on the RRSP meltdown`, `!s.meltdownEnabled`;
    - `split`, `pensionSplitEnabled`, `Turn on pension income splitting`, `!s.pensionSplitEnabled && !s.singlePerson`;
    - `guardrails`, as the US.
- Produces, in each `store-context.js` (store layer, beside `variantContext`; re-exported by `seam-ownPlanContextFor`):
  - `ownPlanContextFor(inputs) -> (variant) => ctx`:
    - US: the plan is, in order:
      - the kept plan when `inputs === cliffPlanStore.forState` (and the year matches), or when `JSON.stringify(inputs)` equals
        `cliffPlanStore.key` with the kept plan searched;
      - else a hit in a cache of its own, `ownPlanCache` (`currentYear | JSON`, at most 8 entries, cleared when full);
      - else `computeCliffPlan(storeRunContext(inputs, { overrides: optimizerState })).plan` (`planningContext`'s context, search
        on), counted in a counter of its own, `ownPlanComputes`.

      It never calls `planForState`: that would bump `cliffPlanStore.stateComputes` (which `test_bracket_search.js:171-192`
      asserts a render leaves alone) and churn `cliffPlanCache` (16 entries), which `renderScenarioComparison` relies on in every
      render, light included: an evicted comparison plan would put a 100-260 ms search back on the next keystroke.
      `ownPlanCache` and `ownPlanComputes` live in `planning.js` beside `cliffPlanCache` (a store-layer module), with a
      `// load-time:` comment. The plan is made the way `planForState` makes it, so it is the plan `refreshCliffPlan` keeps after
      Try. The factory is then `(v) => storeRunContext(v, { plan, planMode: plan ? 'apply' : 'off' })`: one searched plan, held for
      every variant.
    - Canada: `(v) => variantContext(v, v)`.
- Produces, in `moves.js` (line 1: `// The moves the dashboard tests on a Tight or Short plan: their inputs, their outcome and their order`):
  - `MOVE_RULES`: `Object.freeze({ maxShown: 4, maxDelay: 15, fallbackDelay: 5, minGain: 500, maxRetireAge: 70 })`, with a
    `// load-time:` comment.
  - `retireShift(base, k) -> { retireAgeA, retireAgeB }`: Partner A's retirement age plus `k`, and Partner B's plus `k` for a
    couple (a single person keeps `retireAgeB`).
  - `retireShiftRange(base) -> { lo, hi }`, the shifts the scans may use:
    - `lo = max(-10, ageA - retireAgeA)`, and for a couple `max(lo, ageB - retireAgeB)`;
    - `hi = min(MOVE_RULES.maxDelay, MOVE_RULES.maxRetireAge - retireAgeA, lifeExpectancyA - 1 - retireAgeA)`, and for a couple the
      same for B.
    - `maxRetireAge` is 70: the retirement-age sliders' `max` (`timelineGroupState.html:6,9`) and `clampRetireAgeA`'s cap
      (`inputs/clamps.js:5`). So a move or an answer never names an age the slider cannot show.
  - `function* firstTrueSteps(lo, hi, known, test)`: the smallest `k` in `[lo, hi]` with `test(k)` true, or `null` when `test(hi)`
    is false. `test` is a generator function `(k) => Generator<…, boolean>`; `known` is a `Map` of shifts already decided (the base
    at `k = 0`). It assumes the test is monotone in `k` and bisects with sentinels:
    - start with `f = lo - 1` (false) and `t = hi + 1` (true, meaning "none"); known shifts narrow them first;
    - while `t - f > 1`, test `m = Math.floor((f + t) / 2)` (from `known` when there) and move `f` or `t`;
    - return `t <= hi ? t : null`.
  - `function* retireLaterSteps(base, contextFor, baseWord)` returns `{ k, fixed }`, or `null` when `hi < 1` or
    `baseWord === 'comfortable'`:
    - `fix(k)`: the word of `{ ...base, ...retireShift(base, k) }` from `projectionWordSteps` is not `'short'` when
      `baseWord === 'short'`, and `'comfortable'` when `baseWord === 'tight'`;
    - `k = firstTrueSteps(1, hi, new Map(), fix)`;
    - with `k === null`: `{ k: min(MOVE_RULES.fallbackDelay, hi), fixed: false }`.
    - These probes run with the caller's `contextFor` (the kept plan held); the move itself is then measured with its own plan.
  - `cutSpendingDelta(baseVerdict) -> number | null`: the change to base spending (negative) the cut move applies:
    - `null` when `baseVerdict.guardrails` or `baseVerdict.unfixable`;
    - Short: `baseVerdict.shown` (the verdict's own rounded cut);
    - Tight: `-c` for the smallest multiple of 500, `c >= 500`, with
      `displayRoom(baseVerdict.room + c) >= VERDICT_RULES.minRoomShare * (baseVerdict.shareBase - c)`.
  - `moveOutcome(baseVerdict, moveVerdict) -> { fixes: boolean, gain: number }`:
    - `fixes`: Short base → `moveVerdict.word !== 'short'`; Tight base → `moveVerdict.word === 'comfortable'`;
    - `gain`: `moveVerdict.room - baseVerdict.room` when both are room-based; when `baseVerdict.guardrails` and
      `moveVerdict.guardrails`, `baseVerdict.cutPct - moveVerdict.cutPct` (points); otherwise 0.
  - `rankMoves(moves) -> moves`, where each move is `{ key, label, patch, verdict, fixes, gain }`. A gain is a cut gain (points)
    when `move.verdict.guardrails`, else a room gain:
    - keep a move when `fixes`, or when its shown gain passes `minGain` (`displayRoom(gain) >= minGain`, or for a cut gain
      `gain >= 1` point);
    - drop the `guardrails` move unless it fixes (its gain is in other units);
    - order: fixing moves first, by `verdict.room` descending (`cutPct` ascending when guardrail-judged), the `guardrails` move
      last among them; then the rest by gain descending; ties keep the input order;
    - the first `maxShown`.
- The move list the UI evaluates, in this order (each is `{ key, label, patch }`):
  1. `retire`: `patch = retireShift(base, k)` from `retireLaterSteps`.
  2. `spend`: `patch = { spending, spendingTiers }` of `spendingVariant(base, cutSpendingDelta(...))`, when that is not `null`.
  3. Each `MOVE_LEVERS` entry whose `when(base)` holds: `patch = { [field]: true }`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/moves.test.js`.
  - **`retire-later range`** (both): the default couple (ages 48 / 43, retiring at 55 / 55, life expectancy 100) gives
    `{ lo: -7, hi: 15 }`. With `retireAgeA: 49` the `lo` is −1. With `retireAgeA: 65, retireAgeB: 60` the `hi` is 5 (the age-70 cap). A single person ignores B. With `retireAgeA: 70` the `hi` is 0, and `retireLaterSteps` returns `null`.
  - **`firstTrueSteps bisects`**, over `[1, 15]`:
    - with `test = (k) => k >= 6` it returns 6, after exactly the tests 8, 4, 6, 5;
    - with `k >= 99` it returns `null`, after 8, 12, 14, 15;
    - with `known` holding `{ 6: true }` and `k >= 6`, it never tests 6 or above.
  - **`cutSpendingDelta`** (no engine): Short `{ shown: -6000, guardrails: false, unfixable: false }` → −6000. Tight
    `{ room: 3000, shareBase: 60000, ... }`:
    - c = 3000 gives `displayRoom(6000) = 6000 >= 5700`;
    - c = 2500 gives `displayRoom(5500) = 5000 < 5750`;
    - so −3000.
    Guardrails or unfixable → `null`.
  - **`moveOutcome`** and **`rankMoves`** on hand-built verdicts:
    - a Short base: a move that lasts fixes; one that stays short has `gain` = the room difference;
    - a move with gain 400 is dropped, one with 500 is kept;
    - order: fixing by room descending, `guardrails` last among fixers, then gain descending; at most 4.
  - **`a move's verdict is the verdict of its inputs`** (both). On the Short default (US `spending: 78000`, Canada `76000`), with
    `refreshCliffPlan()` in the US:
    - for the conversions / meltdown lever and for `retire` at `k = 2`, build `v = normalizeState({ ...cloneState(state), ...patch })`
      (the way Try builds it);
    - `projectionVerdict(v, ownPlanContextFor(v))` equals (`toStrictEqual`, `runs` and `selected` dropped) the verdict of a fresh world whose state
      is `v`, measured as the verdict card measures it: `setState(v)`, `refreshCliffPlan()`, `projectionVerdict(state, stateContextFor())`.
  - **`guardrails: moves judged by the cut`** (both). Use the default household with `guardrailsEnabled: true` and a spending whose
    deepest cut is above 10% but below the 50% floor. Find it in Step 1 by stepping spending in $2,000 steps from 60000, and record it
    as a literal: at 78000 / 76000 the cut sits at the floor (50%) and moves nothing.
    - The base verdict is guardrail-judged (`guardrails: true`) and Tight.
    - `cutSpendingDelta` is `null`.
    - The retire-later move at `k = 2` has `moveOutcome.gain === base.cutPct - move.cutPct`, and that is above 0.
  - **`own plan in the US`** (`usIt`):
    - on the default plan, `ownPlanContextFor(state)(state).plan` is the kept plan (`cliffPlanStore.plan`, the same object);
    - for `v = { ...state, rothConvEnabled: true }`, the plan is not the kept plan, and it equals (`toStrictEqual`) the plan a
      fresh world whose state is `v` keeps after `refreshCliffPlan()`;
    - a second call for an equal `v` plans nothing (`ownPlanComputes` unchanged);
    - neither call moves `cliffPlanStore.stateComputes` or `cliffPlanCache.size`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/moves.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the modules, the seams and `ownPlanContextFor`. `moves.js` is an engine-side module: context factory from
  the caller, no store import, no module-level mutable.

- [ ] **Step 4: Run.**
  - The suite passes in both projects, and again with `--sequence.shuffle`.
  - Run it on Node 22 and Node 24 (rule 6).
  - `npm run analyze`; `node tests/engine_purity.js && node tests/core_purity.js`.

- [ ] **Step 5: Commit** with the test-inventory line:
  `git commit -m "Moves: the tested changes, their outcome and their order (dashboard guidance PR 3)"`.

---

### Task 3: Core: the goal answers and their copy

**Files:**
- Create:
  - `src/shared/core/analysis/goal-answers.js`
  - `src/shared/core/format/answer-text.js`
  - `src/us/core/analysis/conversion-answer.js`, `src/canada/core/analysis/meltdown-answer.js`
  - `src/us/core/seam-legacyValue.js`, `src/canada/core/seam-legacyValue.js`
  - `tests/unit/shared/goal-answers.test.js`, `tests/unit/us/conversion-answer.test.js`, `tests/unit/canada/meltdown-answer.test.js`
- Modify: `docs/architecture/test-inventory.md`.

**Interfaces:**
- Consumes: Tasks 1–2 (`projectionWordSteps`, `projectionVerdictSteps`, `spendingRoomSteps`, `firstTrueSteps`, `retireShift`,
  `retireShiftRange`).
- Produces, in `goal-answers.js` (line 1: `// The goal answers the engines already give: retirement ages, spending, housing, a death, the estate`):
  - `function* retireAnswerSteps(base, contextFor, baseVerdict) -> { lastsFrom, comfortableFrom, perYear, lo, hi }`. Shifts are
    `k` in `retireShiftRange(base)`; both boundaries come from `firstTrueSteps` with `known` seeded from `baseVerdict.word` at
    `k = 0`, using `projectionWordSteps`.
    - `lastsFrom`: the smallest `k` whose word is not short, or `null`.
    - `comfortableFrom`: the smallest `k` whose word is comfortable, or `null`.
    - `perYear`: `baseVerdict.room` minus the room at `k = -1` (`spendingRoomSteps`), when `lo <= -1` and `!baseVerdict.guardrails`;
      else `null`.
  - `function* roomChangeSteps(base, variant, contextFor, baseRoom) -> number`:
    - it runs the variant once (one yielded `'run'`: the `selected` that `spendingRoomSteps` needs);
    - then it returns the variant's room (`spendingRoomSteps`) minus `baseRoom`.
    - The spend answer under guardrails, and the house answer's room base, measure the guardrails-off state the same way: one
      run, then the search.
  - `houseVariants(base) -> { key, patch }[]`:
    - `own`: `{ key: 'rent', patch: { tenure: 'rent' } }`, plus `{ key: 'payoff', patch: { extraPrincipal: base.extraPrincipal > 0 ? 0 : 500 } }`
      when `base.mortgage > 0`;
    - `rent`: `{ key: 'own', patch: { tenure: 'own' } }`;
    - `rentThenBuy`: `{ key: 'rent', patch: { tenure: 'rent' } }`.
  - `survivorVariants(base) -> { partner, patch }[]`: for a couple, A then B, each
    `{ survivorEnabled: true, survivorPartner: partner }`; `[]` for a single person.
- Produces, in `src/us/core/analysis/conversion-answer.js` (line 1: `// The US conversion goal's answer: conversions on against off, the plan's bracket, ages and ACA holds`):
  - `conversionAnswer(onCtx, onSim, offCtx, offSim, settingBracket) -> { gain, depletedOn, depletedOff, bracket, ages, acaHeld, sized }`:
    - `gain = gainInTodaysDollars(US_OBJECTIVES.endValue, pricingContextFor(onCtx), onSim, offSim)`;
    - `bracket`: the bracket the engine converts at, by the US card's rule (`roth-optimizer.js:20-23,173-176`). With
      `plan = onCtx.plan`, it is `plan && plan.bracket != null && plan.bracketFrom === settingBracket ? plan.bracket : settingBracket`;
    - `ages`: the ages of rows with `(r.conversionGross ?? r.conversionAmount) >= 1`;
    - `acaHeld`: the number of rows with `r.convHeldBy === 'aca'`;
    - `sized`: `!!(onCtx.plan?.conv && Object.keys(onCtx.plan.conv).length)`.
  - `stripAcaIntents(plan) -> plan`: `makePlan` of the plan with the intents whose `line` is `medicaid`, `acaFloor` or `aca400` removed.
  - `acaAnswer(ctx, sim, strippedSim) -> { ages, kept }`:
    - `ages`: the plan's ACA intents' ages, ascending;
    - `kept`: `objectiveBreakdown(ctx, strippedSim).healthcare - objectiveBreakdown(ctx, sim).healthcare` (today's dollars).
- Produces, in `src/canada/core/analysis/meltdown-answer.js`:
  - `function* meltdownAnswerSteps(base, contextFor, brackets, selected) -> { results: [{ bracket, estate, depletedAge }], off: { estate, depletedAge }, best }`:
    - one run per bracket of `{ ...base, meltdownEnabled: true, meltdownBracket: b }`, and one off run;
    - `estate`: `afterTaxEstate(pricingContextFor(ctx), sim)` deflated to today's dollars with
      `displayValueOf('real', base.inflation, x, last.year, last.cumFactor)`;
    - `best`: the card's rule (`canada/ui/results/roth-optimizer.js:34-38`): the highest estate among the brackets that are not
      worse than the current run `selected`, or among all of them when none passes. The answer and the card then always name the
      same bracket.
- Produces, through `#country/core/seam-legacyValue`: `legacyValue(ctx, sim) -> number`, in today's dollars. US: the last row's real
  `total`. Canada: the real after-tax estate.
- Produces, in `answer-text.js` (line 1: `// The goal answers' and moves' sentences, from their results (no engine)`), the shared
  sentences. The country sentences live in the country modules named below. Exact copy:
  - **`agesText(base, k)`:** `at ${retireAgeA + k}` (single), or `at A ${retireAgeA + k} / B ${retireAgeB + k}`.
  - **`retireAnswerText(base, r)`:** in the projection, joined with `; `, then `.`:
    - `Comfortable from ${ages(c)}` when `comfortableFrom` is not null (`Comfortable even ${ages(lo)}`… when it is `lo`);
    - `Tight from ${ages(l)}` when `lastsFrom` is not null and below `comfortableFrom` (or `comfortableFrom` is null);
    - `runs out if you retire before ${ages(l)}` when `lastsFrom > lo`, or `runs out at every age up to ${ages(hi)}` when
      `lastsFrom` is null.
    - Then ` Each year earlier costs about ${compact(displayRoom(perYear))} a year of room.` when `displayRoom(perYear) >= 500`.
    - The sentence starts `In the projection: `, and `ages()` drops the leading `at ` after `from` / `before` / `up to`.
    - Example: `In the projection: Comfortable from A 58 / B 58; Tight from A 56 / B 56; runs out if you retire before A 56 / B 56. Each year earlier costs about $4K a year of room.`
  - **`spendAnswerText(base, v, offRoom)`:** `v` is the base verdict; `offRoom` is the guardrails-off room under guardrails.
    - guardrails: `Without guardrails, about ${compact(base.spending + displayRoom(offRoom))} a year (${signed}). With them on, the worst year's spending is cut by up to ${v.cutPct}%.`
    - tiers: `About ${compact(|shown|)} a year ${more|less} than you plan, in every retired year.`
    - at cap: `More than ${compact(base.spending + v.shown)} a year: the search stops at ${compact(v.shown)} more.`
    - unfixable: `Even spending nothing runs out: cutting spending alone can't fix this.`
    - `shown > 0`: `About ${compact(base.spending + v.shown)} a year, ${compact(v.shown)} more than today.`
    - `shown === 0`: `About ${compact(base.spending)} a year: what you spend now, with nothing to spare.`
    - `shown < 0`: `About ${compact(base.spending + v.shown)} a year, ${compact(-v.shown)} less than today.`
    - The signed part reads `$9K more than today` or `$6K less than today`.
  - **`houseAnswerText(base, changes)`:** `changes` is `{ key, delta }[]`; `d = displayRoom(|delta|)`, and under $500 the
    difference counts as little.
    - `rent` from `own`: `Owning leaves about ${d} a year more room than renting.` / `Renting would leave about ${d} a year more room than owning.` / `Owning or renting makes little difference (under $500 a year).`
    - `own` from `rent`: the same two sentences, the subject swapped (`Buying the home in your housing settings would leave…` /
      `Renting leaves about ${d} a year more room than buying.`).
    - `rent` from `rentThenBuy`: `Buying at ${buyAge} leaves about ${d} a year more room than renting throughout.` or `Renting throughout would leave about ${d} a year more room than buying at ${buyAge}.`
    - `payoff`: `Paying an extra $500 a month on the mortgage would ${add|cost} about ${d} a year of room.` (from 0), or
      `Your extra ${money(extraPrincipal)} a month on the mortgage ${adds|costs} about ${d} a year of room against investing it.`
  - **`survivorAnswerText(base, rows)`:** `rows` is `{ partner, verdict }`. One sentence each:
    - `If Partner ${p} dies at ${survivorDeathAge}: ${Word}, about ${compact(shown)} a year of room.` (room-judged and not short);
    - `If Partner ${p} dies at ${survivorDeathAge}: Short, the money runs out at ${depletedAge}.`;
    - `If Partner ${p} dies at ${survivorDeathAge}: ${Word}, guardrails cut spending by up to ${cutPct}%.`
  - **`legacyAnswerText(phrase, value, endAge, depletedAge)`:** `At ${endAge}, ${phrase(compact(value))}.`, plus
    ` The investments run out at ${depletedAge}.` when depleted. `phrase` comes from the `legacyValue` seam module, which exports
    `LEGACY_PHRASE` beside `legacyValue`:
    - US: `the plan ends with about ${x} in today's dollars, the home included`;
    - Canada: `the after-tax estate is about ${x} in today's dollars, after tax on the RRSP/RRIF and gains at the last death, and probate`.
  - **`conversionAnswerText(a, base, planLabel)`** (US; it lives in `src/us/core/analysis/conversion-answer.js`, not the shared module):
    - gain ≥ 500 and not depleting earlier: `Yes: ${what}, ages ${ageRanges(a.ages)}, leaves about ${compact(a.gain)} more after tax at the end (today's dollars).`
    - gain ≤ −500: `No: ${what} leaves about ${compact(-a.gain)} less after tax at the end.`
    - otherwise: `Conversions make little difference here (under $500 after tax at the end).`
    - A depletion difference: `No: conversions make the money run out at ${depletedOn} instead of ${depletedOff ?? 'lasting'}.`
    - `what`: `converting to the top of the ${bracket}% bracket`, or, when `bracket !== setting`,
      `converting to ${planLabel}'s ${bracket}% bracket, not your ${setting}%`; then ` sized by year` when `sized`.
      The second form is what `test_bracket_search.js` and `test_plan_optimizer.js` assert: `the cliff plan's 24% bracket, not your 22%`.
    - Then ` Held by the ACA line in ${n} year${s}.` when `acaHeld > 0`.
    - `planLabel` is `the cliff plan` or `the applied plan`.
    - `ageRanges` moves from `src/us/ui/results/roth-optimizer.js` to `answer-text.js`. It is exported, used by both countries'
      texts, and the US card imports it from there.
  - **`acaAnswerText(a)`** (US; in `conversion-answer.js`): `The cliff plan stays under the ACA line at ${ageRanges(ages)}, keeping about ${compact(kept)} of premium credit (today's dollars).`, or `No year needs steering under an ACA line.`
  - **`meltdownAnswerText(a, base)`** (Canada; in `meltdown-answer.js`): the same shape as the US one, with `an RRSP meltdown to the top of the ${b}% bracket`
    and `after-tax estate`. With the meltdown on at another bracket than `best`:
    `Your meltdown at ${cur}% leaves about ${x} more after-tax estate than none; ${best}% would leave about ${y} more than ${cur}%.`
  - **`moveText(move, base, endAge)` -> { what, result }:**
    - `what`: retire `Retire ${k} year${s} later (${agesText})`; spend `Spend about ${compact(-delta)} less a year`; a lever its
      `label`.
    - `result`:
      - base Short and fixes: `fixes it: lasts through ${endAge}`;
      - base Tight and fixes: `makes it Comfortable in the projection`;
      - `guardrails` move: `lasts through ${endAge}, with spending cut by up to ${cutPct}% in bad years`;
      - else room gain: `+${compact(displayRoom(gain))} a year of room`;
      - else cut gain: `worst-year cut ${base.cutPct}% → ${verdict.cutPct}%`.
  - **`movesHeadText(baseVerdict)`:** Short `Runs out at ${depletedAge} in the projection. Biggest fixes:`; Tight
    `Tight in the projection. What helps most:`; with no move kept, the list holds `None of the changes tested here helps on its own.`

- [ ] **Step 1: Write the failing tests.**
  - `tests/unit/shared/goal-answers.test.js` (DOM-free; `usIt` where it needs the cliff plan):
    - **`retire answer on DRAW`** (`usIt`). The `DRAW` household at spending 30000 (room 10,000; age 65, retiring at 65,
      `lifeExpectancyA: 74`, so `lo = 0`, `hi = 8`): `{ lastsFrom: 0, comfortableFrom: 0, perYear: null, lo: 0, hi: 8 }`.
      (A `DRAW` variant with earlier ages proves nothing: its working years have no income and spend the same, so the retirement
      age does not move the room.)
    - **`retire answer agrees with the word check`** (both): on the default household and on its Short form (US `spending: 78000`,
      Canada `76000`):
      - `lastsFrom <= comfortableFrom` when both are numbers;
      - at each boundary `b` that is a number, `projectionWord` of `{ ...base, ...retireShift(base, b) }` gives the boundary's word,
        and at `b - 1` (when `b > lo`) a lower one;
      - `perYear` is a multiple of 100.
    - **`retire answer edges`** (both):
      - a single person: `retireShift` leaves B alone;
      - a couple with B already retired (`retireAgeB === ageB`): `lo = 0`;
      - `retireAgeA: 70`: `hi = 0`;
      - none of these throws.
    - **`house variants`**: own with a mortgage → `['rent', 'payoff']` with `extraPrincipal: 500`; own with `extraPrincipal: 300`
      → payoff patch `extraPrincipal: 0`; rent → `['own']`; rentThenBuy → `['rent']`; own with `mortgage: 0` → `['rent']`.
    - **`survivor variants`**: a couple → A then B; single → `[]`.
    - **The text functions**, every sentence above at least once, with literal inputs and literal expected strings. Include the
      examples:
      - `spendAnswerText` → `About $69K a year, $9K more than today.`;
      - the Short form;
      - `retireAnswerText` with `lastsFrom: null`;
      - `moveText` for each `result` form;
      - `houseAnswerText` under $500.
    - **`spend answer under guardrails`**: `spendAnswerText(base, { guardrails: true, cutPct: 20, ... }, 9000)` is
      `Without guardrails, about $69K a year ($9K more than today). With them on, the worst year's spending is cut by up to 20%.`
  - `tests/unit/us/conversion-answer.test.js`:
    - **`conversion answer on the default plan`**: on vs off by `rothConvEnabled`, each with its own plan (`ownPlanContextFor`).
      `gain` equals `gainInTodaysDollars(...)` computed in the test from the same two runs; `bracket` is the on-plan's `bracket`;
      every listed age has a conversion row.
    - **`strip ACA intents`**: a hand-made plan with intents `{ 55: { kind: 'under', line: 'aca400', ret: 'H' }, 70: { kind: 'under', line: 'irmaa1', ret: 'H' } }`
      keeps only 70, and has every `PLAN_KEYS` key.
    - **`ACA answer on the early household`**: `ageA/B 40`, retiring 50, `acaEnabled`. After `refreshCliffPlan()`:
      - if the kept plan has ACA intents, `ages` lists them and `kept` equals the healthcare difference the test computes;
      - otherwise `ages` is `[]`, and the test records that with a message, so a later engine change is noticed.
  - `tests/unit/canada/meltdown-answer.test.js`:
    - **`meltdown answer`**: brackets `[14, 20.5, 26, 29, 33]` on the default household. One result per bracket. `best` is the
      highest-estate bracket among the not-worse ones, checked against the results in the test. 6 runs.

- [ ] **Step 2: Run** the three suites. Expected: FAIL.

- [ ] **Step 3: Implement.** The `conversion-answer.js` and `meltdown-answer.js` modules are engine-side: they take contexts and
  factories from the caller, and import no store module.

- [ ] **Step 4: Run.**
  - The suites pass in both projects, and again with `--sequence.shuffle`.
  - Run them on Node 22 and Node 24.
  - `npm run analyze`; `node tests/engine_purity.js`.
  - `npm run build && node test_bracket_search.js` (the US card's `ageRanges` import moved).

- [ ] **Step 5: Commit**:
  `git commit -m "Goal answers: the engines' answers per goal and their sentences (dashboard guidance PR 3)"`.

---

### Task 4: Try: the held move preview

**Files:**
- Create:
  - `src/shared/ui/plans/move-preview.js`
  - `src/shared/ui/plans/move-preview-snapshot.js` (imports nothing, as `market-scenario-snapshot.js`)
  - `src/shared/partials/movePreviewBanner.html`
  - `test_move_preview.js` (repo root, both planners)
- Modify:
  - **Both shells:** `<!-- @@include movePreviewBanner -->` right after `<!-- @@include marketScenarioBanner -->`.
  - `src/shared/ui/plans/undo.js`: `snapshotForUndo(label, from = state)`.
  - `src/shared/ui/plans/autosave.js`: writes `movePreview?.real ?? scenarioSnapshot ?? state`, with the status text above.
  - `src/shared/ui/plans/market-scenario-mode.js`: `runMarketScenario` returns false while `movePreview`.
  - `src/shared/ui/plans/market-scenario-card.js` (`renderMarketScenarioCardState`): the Run button is disabled, with the title,
    while a move is previewed.
  - `src/shared/ui/plans/scenarios.js`: every `if (scenarioSnapshot)` lock and `locked` also read `movePreview`.
  - `src/shared/ui/plans/saved-plan.js:75`: the same for the first-run Import.
  - `src/shared/ui/plans/reset-plan.js`: `revertMove()` before `revertMarketScenario()`.
  - `src/shared/ui/results/guidance.js`: `setGoal` and `paintChips` lock under a preview, with their own title. The wizard's goal
    checkboxes (`src/shared/ui/wizard.js`) do the same.
  - Both `render.js`: `renderMovePreviewBanner()` beside `renderMarketScenarioBanner()`.
  - Both `main.js`: `wireMovePreviewBanner()` beside `wireMarketScenarioBanner()`.
  - `src/shared/ui/install-test-hooks.js` and `src/us/ui/install-test-hooks.js:189-192`: both `__test_replaceState`s clear the
    move preview. The US defines its own, installed after the shared one. New hooks (below).
  - `src/shared/styles/styles.css`, `CLAUDE.md`, `docs/architecture/inputs-and-ui.md`, `docs/architecture/test-inventory.md`.

**Interfaces:**
- Produces, in `move-preview-snapshot.js`: `export let movePreview = null` (`{ real, label }` exactly while a move is previewed)
  and `assignMovePreview(p)`.
- Produces, in `move-preview.js` (line 1: `// Try: a held preview of one tested move, with Keep and Revert`):
  - `tryMove({ label, patch }) -> boolean`:
    - false, changing nothing, while `scenarioSnapshot` or `movePreview`;
    - else `assignMovePreview({ real: cloneState(state), label })`;
    - `assignState(normalizeState({ ...cloneState(state), ...cloneState(patch) }))`;
    - then `clearUndo()`, `syncControls()`, `syncContributionControls()`, `render()`, `renderScenarioList()`, `saveInputs()`.
  - `keepMove() -> boolean`:
    - false when no preview;
    - else take `real` and `label`, `assignMovePreview(null)`;
    - `dismissFirstRunBanner()`, as `setGoal` does: autosave writes nothing before the page is personalized (`autosave.js:16`), so
      a Keep on the example data would otherwise be lost;
    - `snapshotForUndo(\`Kept: ${label}\`, real)`, so Undo returns to the real settings;
    - then `render()`, `renderScenarioList()`, `saveInputs()`.
  - `revertMove() -> boolean`:
    - false when no preview;
    - else `assignState(movePreview.real)`, `assignMovePreview(null)`;
    - then `clearUndo()`, `syncControls()`, `syncContributionControls()`, `render()`, `renderScenarioList()`, `saveInputs()`.
  - `previewText() -> string | null`: `Previewing: ${label}. Everything below shows the plan with this change: Keep saves it, Revert puts your plan back.`
  - `renderMovePreviewBanner()`, `wireMovePreviewBanner()` (Keep and Revert clicks).
- **Markup** (`movePreviewBanner.html`):
  `<div id="movePreviewBanner" class="callout move-preview-banner" hidden><span id="movePreviewText"></span> <button type="button" id="movePreviewKeepBtn">Keep</button> <button type="button" id="movePreviewRevertBtn">Revert</button></div>`
- **Hooks:** `__test_tryMove(move)`, `__test_keepMove()`, `__test_revertMove()`, and `__test_movePreview()` (a JSON clone of
  `movePreview`, or null).
- **`CLAUDE.md`**, the sanctioned-writes paragraph gains:
  "`src/shared/ui/plans/move-preview.js` (Try replaces `state` with the plan plus one tested move and keeps the real settings in the
  preview snapshot; Keep keeps it, with an undo back to the real settings; Revert restores them)".

- [ ] **Step 1: Write `test_move_preview.js`.**
  - **Form:** model it on `test_market_scenario_mode.js`: it reads the build, exits 1 on failure, collects `pageerror` and uses no
    fixed waits.
  - Each check runs in both planners, with the move `{ label: 'retire 2 years later', patch: { retireAgeA: <A + 2>, retireAgeB: <B + 2> } }`.
  - **"try"**:
    - `__test_tryMove(move)` returns true;
    - the banner shows the text;
    - `#retireAgeA` reads A + 2;
    - `__test_getState().retireAgeA` is A + 2;
    - `#saveStatus` reads `Previewing a change: Keep it to save`.
  - **"reload is the real plan"**: personalize first (any field change), Try, reload: `retireAgeA` is A, no banner.
  - **"keep on a fresh page is saved"**: on a fresh page, Try, Keep, reload: `retireAgeA` is A + 2.
  - **"revert"**: Try, change `#spending`, Revert:
    - the state equals the one before Try (`JSON.stringify`, `guidanceGoals` included);
    - the undo toast is hidden.
  - **"keep"**: Try, Keep:
    - the state has A + 2;
    - the banner is hidden;
    - the undo toast's text, trimmed, is `Kept: retire 2 years later.`;
    - clicking Undo restores A.
  - **"one preview at a time"**:
    - with a move previewed, `__test_runMarketScenario(...)` returns false and `#msRunBtn` is disabled;
    - with a scenario on, `__test_tryMove` returns false;
    - every `.guidance-chip` is disabled with the preview title while a move is previewed.
  - **"reset reverts"**: Try, then Reset (accept the confirm): the state is the defaults, and Undo returns to the real settings
    (not the preview).
  - **"scenario list locked"**: during a preview:
    - `#saveScenarioBtn` is disabled;
    - `#scenarioLockNote` reads `Keep or revert the change you are previewing to save or load scenarios.` `renderScenarioList`
      sets the note's text from which preview is on; the market-scenario text stays as it is.
  - **"mobile"**: at 390×844 with the banner shown, `scrollWidth > clientWidth` is false.

- [ ] **Step 2: Run** `npm run build && node test_move_preview.js`. Expected: FAIL.

- [ ] **Step 3: Implement** as above. Style `.move-preview-banner` like `#marketScenarioBanner`.

- [ ] **Step 4: Run.**
  - `npm run build && node test_move_preview.js && node test_market_scenario_mode.js && node test_guidance.js` pass.
  - `npm run analyze`; `node tests/ui_cycles.js && node tests/closure_names.js && node tests/doc_paths.js`.

- [ ] **Step 5: Commit** with the docs (`inputs-and-ui.md` gains a "Try" paragraph: the snapshot, the one-preview rule, autosave,
  locks, reset, undo; `CLAUDE.md` the sanctioned-writes line):
  `git commit -m "Try: a held preview of one move with Keep and Revert (dashboard guidance PR 3)"`.

---

### Task 5: The moves card, the goal answers and their job

**Files:**
- Create:
  - `src/shared/ui/results/guidance-answers.js`
  - `src/us/ui/results/country-answers.js`, `src/canada/ui/results/country-answers.js`
  - `src/us/ui/seam-COUNTRY_ANSWERS.js`, `src/canada/ui/seam-COUNTRY_ANSWERS.js` (facades)
  - `test_guidance_answers.js` (repo root, both planners)
- Modify:
  - **Both shells:**
    - `#shortfallBanner` is replaced by the markup below;
    - the badges become `V178` / `V83`.
  - Both `render.js`:
    - `renderShortfallBanner` is replaced by `renderGuidanceAnswers()` (every render);
    - `scheduleGuidanceAnswers()` sits beside each `scheduleFieldImpacts()` call.
  - `src/shared/ui/results/guidance.js`: export `impactKey`.
  - `src/shared/ui/inputs/estimate-review.js`: split `revealField(id)` (the reveal without setting `reviewingFieldId`) out of
    `jumpToEstimateField`, and export it.
  - Both `main.js`: `wireGuidanceAnswers()`.
  - `src/shared/ui/install-test-hooks.js`: `__test_guidanceAnswers()`; `__test_flushGuidance()` also runs
    `runGuidanceAnswersToEnd()`.
  - `test_bracket_search.js`: its `planForState plans nothing` checks (`:171-192`) stay as they are and must pass. Add a check that
    the same steps leave `__test_ownPlanComputes()` (a new hook) unchanged, and `cliffPlanCache` unevicted, while the household is
    Comfortable with no goal chosen (no moves and no conversion answer, so the job plans nothing).
  - `test_plan_verdict.js:84`: the `#shortfallBanner` check becomes "no `#shortfallBanner` element".
  - `test_bracket_search.js:238-243`, `test_plan_optimizer.js:412-430`: the ladder-label checks read the convert goal's answer
    instead. Turn on the `convert` chip, flush, and read `[data-goal-answer="convert"]`. It names `the cliff plan's 24% bracket,
    not your 22%` / `the applied plan's`.
  - `src/shared/styles/styles.css`, `README.md`, `docs/architecture/inputs-and-ui.md`, `docs/architecture/test-inventory.md`,
    `CLAUDE.md` (the deferred-rendering invariant: `__test_flushGuidance()` also flushes the answers).

**Interfaces:**
- Consumes: Tasks 1–4; `chosenGoals`, `GOALS` (PR 2); `impactKey`; `stateContextFor`; `ownPlanContextFor`, `MOVE_LEVERS`,
  `legacyValue` (seams); `searchPending`; `currentMarketScenarioText`; `movePreview`; `tryMove`; `revealField`; `setMobileView`.
- Produces, in `guidance-answers.js` (line 1: `// The moves card and the goal answers under the verdict, and the background job that measures them`):
  - `renderGuidanceAnswers()`: paints `#movesCard` and `#goalAnswers` from the display memo; runs no projection.
  - `scheduleGuidanceAnswers()`: starts the job when anything is unmeasured for `impactKey(state)`.
    - Besides the render calls, `wireGuidanceAnswers()` adds a `document` listener for PR 2's `guidance-change` event. It calls
      `renderGuidanceAnswers()` and, unless `searchPending()`, `scheduleGuidanceAnswers()`. A chip click renders no projection, so
      this is how a newly ticked goal gets measured.
    - It is a listener, not a call from `setGoal`, so that `guidance.js` does not import this module (which imports `impactKey`
      from it).
    - This job dispatches its own event, `guidance-answers-change`, never `guidance-change`, so it cannot re-trigger itself.
  - `runGuidanceAnswersToEnd()`: the synchronous flush.
  - `guidanceAnswersSnapshot()` returns
    `{ pending, base: verdict | null, moves: [{ key, what, result, fixes, gain, patch, verdict: { word, room, cutPct, guardrails } }], answers: { [goal]: string } }`
    (verdicts without `runs` and `selected`).
    It is the hook's view.
  - `wireGuidanceAnswers()`: delegated clicks for Try (`[data-move]`) and the links (`[data-answer-link]`).
- Produces, in each `country-answers.js` (UI: it may read the store layer; re-exported by `#country/ui/seam-COUNTRY_ANSWERS`):
  `COUNTRY_ANSWERS`, an object of unit generators `function* (state, ctxFor, base) -> { text, link }` for the country's own goals
  (`base` is the base unit's result, `base.selected` the dashboard run):
  - US: `convert` and `aca`, as described under "The job". `planName()` and `ageRanges` come from the US card's modules; the plan
    from `cliffPlanStore`; `contextWithPlan` from `src/us/core/projection/store-context.js`.
  - Canada: `convert` (the meltdown).
  The shared job calls `COUNTRY_ANSWERS[goal]` for any goal it has, and its own units for the rest. `guidance-answers.js` names no
  country.

**Markup** (both shells, replacing `#shortfallBanner`):
```html
<div class="callout moves-card" id="movesCard" hidden><h3 class="moves-head" id="movesHead"></h3><ol class="moves-list" id="movesList"></ol></div><div class="goal-answers" id="goalAnswers" hidden></div>
```
- **A move row:** `<li><span class="move-what"></span><span class="move-result"></span> <button type="button" class="move-try" data-move="${i}">Try</button></li>`.
  The texts are set through `textContent`, the result with a leading ` — `.
- **An answer:** `<div class="goal-answer" data-goal-answer="${key}"><b class="goal-answer-q"></b> <span class="goal-answer-text"></span> <button type="button" class="link-btn goal-answer-link" data-answer-link="${target}"></button></div>`,
  in `GOALS` order, for each chosen goal (`chosenGoals(state)`). The question is the goal's label. While unmeasured, the text reads
  `Working it out…`.
- **Links** (`target` is `field:<id>` or `card:<id>`):

  | Goal | Link | Label |
  |---|---|---|
  | `retire` | `field:retireAgeA` | `Change your retirement age →` |
  | `spend` | `field:spending` | `Change your spending →` |
  | `convert` (feature on) | `card:rothOptimizerCard` | `See the conversion schedule →` (Canada `See the meltdown table →`) |
  | `convert` (feature off) | `field:rothConvEnabled` / `field:meltdownEnabled` | `Turn it on in the sidebar →` |
  | `aca` | `card:moreResultsCard`, or `field:acaEnabled` while the subsidy is off | `See the cliff plan →` / `Turn it on in the sidebar →` |
  | `house` | `field:ownBtn` (the housing button group's first button) | `Housing settings →` |
  | `survivor` | `field:survivorEnabled` | `Model a death in the plan →` |
  | `legacy` | `card:mainChartCard` | `See the chart →` |

  A field link calls `revealField(id)`. A card link:
  - calls `setMobileView('dashboard')`;
  - opens a `<details>`;
  - scrolls it into view (`block: 'start'`, smooth);
  - flashes it (`flash-highlight`, 2600 ms).
- `#movesCard` is shown only when the memo's base word is Tight or Short and the key is current or dimmed.
- Try buttons are disabled with the titles of the Global Constraints, and also, with the title `Still measuring this change…`,
  whenever the job is running or `shown.key !== impactKey(state)`: a move's `patch` holds absolute values made from the inputs it was
  measured on, so a Try on a dimmed move would apply inputs nobody tested. A click calls `tryMove({ label, patch })`, where `label`
  is `what` with only its first letter lower-cased.
- `.measuring` dims both containers while the job runs or the key changed.

**The job** (module state assigned only in this module; each `new Map()` initializer gets a `// load-time:` comment):
- **Memos:** `memo = { key, base: undefined, moves: undefined, answers: new Map() }`, and a display copy `shown` committed when a
  unit finishes. Unlike PR 2, the display copy is committed per unit, so each answer appears as soon as it is measured.
- **Units,** in order, each a generator of steps (`'run'`, `'plan-next'` right before a cliff-plan search, or `'plan'` right after it); a unit's result goes into the memo when the unit returns:
  1. **base:** `projectionVerdictSteps(state, ctxFor)`.
  2. **moves**, when `base.word !== 'comfortable'`:
     - retire: `retireLaterSteps` (held plan), then the move's own verdict;
     - then the cut-spending and lever moves.
     - **Each move's verdict:** `v = normalizeState({ ...cloneState(state), ...patch })`; `yield 'plan-next'; const f = ownPlanContextFor(v);`
       (so the search runs alone in its slice); then `projectionVerdictSteps(v, f)` and `moveOutcome`.
     - **`rankMoves`** when all are done.
  3. **Each chosen goal** not in `memo.answers`, in `GOALS` order:
     - `retire`: `retireAnswerSteps` (held plan).
     - `spend`: no runs, except under guardrails: `spendingRoomSteps` on `{ ...state, guardrailsEnabled: false }`.
     - `convert`, US:
       - the toggled state `t = normalizeState({ ...cloneState(state), rothConvEnabled: !state.rothConvEnabled })`, its own plan
         (`'plan-next'` first), one run;
       - the on and off sides are the dashboard's run and that run, whichever is which;
       - `conversionAnswer`, with `planLabel` from `planName()` in `src/us/ui/results/roth-optimizer.js` (exported for this).
     - `convert`, Canada: `meltdownAnswerSteps(state, ctxFor, brackets, base.selected)`, the brackets read once from
       `#meltdownBracket`'s options.
     - `aca` (US):
       - off, or no plan: the text `The ACA subsidy is off, so the plan does not model it.` / `The cliff plan is off, so no year is steered under an ACA line.`;
       - else one run with `contextWithPlan(state, stripAcaIntents(plan))` (US store layer: `storeRunContext(inputs, { plan, planMode: 'apply' })`,
         exported beside `ownPlanContextFor`), then `acaAnswer`.
     - `convert` and `aca` are the country units (`COUNTRY_ANSWERS`); the rest are shared.
     - `house`: `roomChangeSteps` per `houseVariants`, against the room base. The room base is the state, or under guardrails the
       state with them off; its room is measured once.
     - `survivor`: `projectionVerdictSteps` per `survivorVariants` (held plan).
     - `legacy`: `legacyValue(ctxFor(state), base.selected)`, from the base unit's dashboard run (no run).
- **The rest is PR 2's job rules:**
  - `gen` / `step(g, sync)`;
  - the stop on `state !== job.state || impactKey(state) !== job.key`;
  - the slice limits of the Global Constraints;
  - after the last unit, `job = null`, repaint, and dispatch `guidance-answers-change`.

- [ ] **Step 1: Write `test_guidance_answers.js`.**
  - **Form:** as `test_guidance.js`. Read results after `__test_flushRender()` then `__test_flushGuidance()`.
  - **"comfortable has no moves"**: on the default plan, `#movesCard` is hidden and `moves` is `[]`.
  - **"short shows moves"**:
    - set `#spending` to US 78000 / Canada 76000 and flush;
    - `#movesCard` is visible, with 1–4 rows;
    - the head starts `Runs out at`;
    - every row's result matches `/^ — (fixes it: lasts through \d+|\+\$[\d.]+K? a year of room|makes it Comfortable in the projection|lasts through \d+, with spending cut by up to \d+% in bad years)$/`;
    - fixing rows come first.
  - **"try matches"**:
    - for the first move, and in the US for the conversions move when listed, call `__test_tryMove({ label, patch })`, then flush;
    - `__test_projectionVerdict()` has `word`, `room`, `cutPct` and `guardrails` equal to the move's `verdict`, and
      `__test_planVerdict().room` equals its `room` too.
      - `__test_projectionVerdict()` is a new hook: `projectionVerdict(state, stateContextFor(), simulate())` without `runs` and
        `selected`.
      - `__test_planVerdict()`'s word is not compared: it folds in the historical rate.
    - Revert.
  - **"tight"**: spending US 64000 / Canada 64000.
    - The head starts `Tight in the projection.`
    - Every fixing row reads `makes it Comfortable in the projection`.
    - After Trying one, `__test_projectionVerdict().word` is `comfortable`.
  - **"answers follow the chips"**:
    - tick every chip;
    - each chosen goal has one `[data-goal-answer]` in `GOALS` order, with no `Working it out…` left;
    - untick `house`: its answer goes and no job starts (`pending` false right after the click);
    - re-tick: it comes back measured, with no new runs (the memo kept it).
  - **"answers' copy"** (default plan, every chip on):
    - spend matches `/^About \$[\d.]+K a year, \$[\d.]+K more than today\.$/`;
    - retire starts `In the projection: `;
    - legacy starts `At ${endAge}, `;
    - US convert starts `Yes: `, `No: ` or `Conversions make little difference`;
    - survivor has two sentences.
  - **"links"**:
    - the spend link focuses `#spending` (mobile: the inputs view);
    - the legacy link scrolls `#mainChartCard` into view.
  - **"light render does not measure"** and **"job stops on change"**: as PR 2's two checks, on `pending` and `.measuring` of
    `#goalAnswers`.
  - **"unfixable"**: PR 1's unfixable household. No cut-spending move; no page error.
  - **"single"**: check `#singlePerson`. No survivor chip or answer; retire answer ages read `at NN`.
  - **"scenario"**: `__test_runMarketScenario(...)` on a Short plan. The moves show, every Try is disabled with the scenario title,
    and the answers are measured inside the scenario.
  - **"mobile"**: at 390×844, Short with every chip on, `scrollWidth > clientWidth` is false.

- [ ] **Step 2: Run** `npm run build && node test_guidance_answers.js`. Expected: FAIL.

- [ ] **Step 3: Markup and styles.**
  - `.moves-card` uses the callout look, with an amber border for Tight and red for Short (`data-word`).
  - `.move-try` is a small button.
  - `.goal-answers` is a stack with gap 8px; `.goal-answer` is a compact callout.
  - `.measuring { opacity: .5 }` (as `.guidance-list.measuring`).
  - Delete the `.shortfall-banner` rule only if `#marketScenarioBanner` no longer uses the class. It does today (its partial has
    `class="callout shortfall-banner"`), so keep it.

- [ ] **Step 4: Implement `guidance-answers.js`** and the wiring above.

- [ ] **Step 5: Timing.** In the built planners, time:
  - each unit;
  - the longest slice;
  - the job's total on the default plan with every chip on, and on the Short plan with every chip on.

  Use a temporary `performance.now()` snippet, not committed. Record the figures for the PR description. **If a slice without a
  cliff search is over 60 ms, or a search slice over 300 ms, stop and report.**

- [ ] **Step 6: Run.**
  - `npm run build && node test_guidance_answers.js && node test_guidance.js && node test_plan_verdict.js && node test_deferred_render.js && node test_bracket_search.js && node test_plan_optimizer.js && node test_move_preview.js` pass.
  - `npm run analyze`; `node tests/ui_cycles.js && node tests/closure_names.js && node tests/doc_paths.js`.
  - `npm test` passes except for the `snapshot_ui` text and layout hashes. Confirm that only the moves card (it replaces the
    banner) and the badges moved, then run `npm run snapshot:update`.

- [ ] **Step 7: Commit** with the docs and baselines:
  - **README:** the goal answers and the moves with Try replace the run-out banner bullet.
  - **`inputs-and-ui.md`:** a "Goal answers and moves" paragraph covering:
    - the units and their engines;
    - own plan versus held plan, and the probe table in short;
    - moves only on a Tight or Short projection;
    - the job's slices and key.

  `git commit -m "Goal answers and ranked moves under the verdict (US V178, Canada V83)"`.

---

### Task 6: Remove the run-out banner and the decision card

**Files:**
- Delete:
  - `src/shared/ui/results/shortfall-banner.js`
  - `src/us/core/analysis/shortfall-drivers.js`, `src/canada/core/analysis/shortfall-drivers.js`
  - `src/us/core/seam-analyzeShortfallDrivers.js`, `src/canada/core/seam-analyzeShortfallDrivers.js`
  - `src/shared/ui/results/decision-questions.js`
  - `src/us/ui/results/decision-questions.js`, `src/canada/ui/results/decision-questions.js`
  - `src/us/ui/seam-DECISION_QUESTIONS.js`, `src/canada/ui/seam-DECISION_QUESTIONS.js`
  - `src/us/core/analysis/decision-compare.js`, `src/canada/core/analysis/decision-compare.js` (the answers do not reuse its table)
  - `src/us/core/seam-renderDecisionCompareTable.js`, `src/canada/core/seam-renderDecisionCompareTable.js`
- Modify:
  - **Both shells:** `#decisionCard` goes.
  - **Both `main.js`:** the `wireDecisionCard` / `wireDecisionQuestions` imports and calls go.
  - **Both `render.js`:** the `renderDecisionQuestionPreviews` import and the `renderOpenCards` line go.
  - **`src/shared/ui/results/render-scheduler.js:67`:** `DEFERRED_CARDS` loses `'decisionCard'`.
  - **`src/shared/core/analysis/decisions.js`:** keeps `fiMultiple`, `decisionEndAssets` and `decisionDeltaPhrase` (the
    unusual-assumption warnings call `decisionDeltaPhrase`: `src/shared/core/inputs/estimates.js:3,30`). `compactDecisionDelta`,
    `findMinimalSpendingCut` and `findMinimalRetirementDelay` go, with the "Explore a question" comments. Its line-1 comment becomes
    `// Decision helpers: the FI multiple and the end-assets phrase the unusual-assumption warnings use`.
  - **`src/shared/ui/install-test-hooks.js`** (`analysisForMode`):
    - `decisions`, `spendingCut`, `retirementDelay`, `shortfall`, `ui.shortfall` and `ui.decisions` go;
    - it gains `out.verdict` (`projectionVerdict(state, stateContextFor())` without `runs` and `selected`);
    - and `out.moves`: each applicable move's `{ key, patch, verdict }` (the verdict without `runs` and `selected`), through the same code path as the job
      (export a drained `evaluateMoves()` from `guidance-answers.js`).
  - **`src/shared/styles/styles.css`:** the `#decisionCard` and `.decision-*` rules go.
  - **`tests/unit/shared/engine-ratchet.test.js:151-174, 196-209`:**
    - the spending-cut, delay and shortfall calls become `projectionVerdict(base, contextFor)` and `retireLaterSteps` drained, each
      `not.toThrow()` and `c.tick()`;
    - in the no-refresh case, only `projectionVerdict` (every variant plans for itself there);
    - update the `afterAll` total.
  - **`tests/analysis_parity.js`:** the header says a base before PR 3 has `decisions`, `spendingCut`, `retirementDelay` and
    `shortfall` and no `verdict` / `moves`, so compare against a base from this task or later.
  - **Comments** naming removed code: `src/shared/ui/layout/mobile-view.js:27`, `src/shared/core/inputs/estimates.js:23` (the
    comment only; its import of `decisionDeltaPhrase` stays), `tests/bench_runs_interleaved.js:7`.
  - **`README.md:68`:** the "What do you want to figure out?" bullet goes.
  - **Docs:**
    - `docs/architecture/engine.md:69-70`;
    - `docs/architecture/cliff-plan.md:167`;
    - `docs/architecture/module-system.md:120,128,131,202,213`;
    - `docs/architecture/test-inventory.md:95,393`;
    - `docs/architecture/inputs-and-ui.md:133`;
    - `CLAUDE.md:316` (`findMinimalSpendingCut` → `projectionVerdict`, the moves).
  - **`docs/superpowers/inventory/stage4-region-map.md`, `stage4-open-items.md`:** rows naming deleted paths are reworded as PR 2
    did (`decision-questions.js (removed in dashboard guidance PR 3)`, with no `src/` path).
  - `scripts/extractions/*.json` stay unchanged (historical records).

**Interfaces:**
- Consumes: `projectionVerdict` (Task 1), `retireLaterSteps` (Task 2), `evaluateMoves` (Task 5).
- Produces: none.

- [ ] **Step 1: Delete and edit** as listed. Then run
  `grep -rn "decisionCard\|decisionQuestions\|DECISION_QUESTIONS\|shortfallBanner\|analyzeShortfallDrivers\|renderDecisionCompareTable\|findMinimalSpendingCut\|findMinimalRetirementDelay\|compactDecisionDelta" src tests test_*.js docs/architecture README.md CLAUDE.md`.
  Expected: no match, except a sentence that says they were removed.

- [ ] **Step 2: Run.**
  - `npm run analyze`.
  - `npm run build`.
  - `node tests/engine_purity.js && node tests/doc_paths.js && node tests/closure_names.js && node tests/ui_cycles.js && node test_deferred_render.js`.
  - `npx vitest run tests/unit/shared/engine-ratchet.test.js`.
  - `npm test`: the `snapshot_ui` hashes move for the removed card. Confirm only that moved, then run `npm run snapshot:update`.

- [ ] **Step 3: Commit** with the baselines:
  `git commit -m "Remove the run-out banner and the decision card: the moves and goal answers replace them (dashboard guidance PR 3)"`.

---

### Task 7: The full sweep

- [ ] **Step 1:** `npm test` passes.
- [ ] **Step 2:** `npm run test:ui` passes (CI runs every root script).
- [ ] **Step 3:** `npx vitest run --sequence.shuffle` passes.
- [ ] **Step 4: Cost.** Compare the wall time of `npm test` and `npm run test:ui` with the PR 2 branch on the same machine. **If either
  grows by more than 15%, stop and report.** The fix to offer is a test switch that holds both guidance jobs until
  `__test_flushGuidance` (the owner decides).
- [ ] **Step 5: Light render.** Time a light render (`__test_flushLightRender`) on the Short US plan, against the PR 2 branch. It
  should be faster: the banner's two searches are gone. Record it.
- [ ] **Step 6:** The PR description includes:
  - the Task 5 timings and the Step 4–5 costs;
  - the probe table above, in short;
  - the snapshot-baseline changes;
  - the history-only-Tight decision;
  - a note that the branch is stacked on #98 and is rebased once that merges.

---

## Review record

Plan review, 2026-11-14, by an independent opus reviewer. It re-ran the probe's US figures (exact) and checked that a fresh world
planned for a move's inputs gives the same room as the move's own-plan run, so the Try claim holds for the plan identity. Every
finding is folded into the text above. The main ones:
- **Blockers:**
  - `drainSteps` lives in `spending-room.js`, so no `core/` import cycle forms;
  - `decisions.js` keeps `decisionEndAssets` and `decisionDeltaPhrase`, which the unusual-assumption warnings call;
  - Try is disabled on a dimmed or still-measuring move, because a move's patch holds absolute values;
  - `ownPlanContextFor` has its own cache and counter, never `planForState`. Otherwise it would bump the counter
    `test_bracket_search.js` guards, and evict `cliffPlanCache` entries the scenario comparison uses on every keystroke;
  - a chip click starts the answers job (a `guidance-change` listener), and the job dispatches its own event.
- **Settled:**
  - a projection-only verdict hook for the Try check;
  - retirement ages capped at 70, the slider's maximum;
  - a cliff search runs alone in its slice;
  - the convert answer uses the card's bracket rule, and its copy matches the two UI tests;
  - the country units receive the base result;
  - `roomChangeSteps` makes its own first run;
  - the bisection's sentinel algorithm and its exact test sequence;
  - a guardrails test household whose cut moves;
  - the gain regex allows `$500`;
  - the housing link targets `ownBtn`;
  - both `__test_replaceState`s clear the preview;
  - Keep personalizes the page;
  - the README bullet and the badge note in Task 6;
  - the country sentences live in the country modules;
  - the meltdown pick follows the card's rule;
  - `comfortableThreshold` uses the verdict's own comparison;
  - the smaller nits.
- **Kept, and stated for the owner:**
  - moves only on a Tight or Short projection (a history-only Tight gets none);
  - goal answers other than conversions hold the kept plan (within $700/yr of own-plan figures in the probe's worst household).
