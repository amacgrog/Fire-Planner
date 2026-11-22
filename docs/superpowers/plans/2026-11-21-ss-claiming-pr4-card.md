# Social Security claiming-age optimizer, PR 4: the card and Apply (plan, 2026-11-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A US results card, "When to claim Social Security", for a single person and a widow(er): it runs PR 3's search
(`claimSearchSteps`) while it is open, in timer slices after the deferred render, and shows the headline, the shaded grid
with the current choice outlined and "same as" cells, a tooltip per cell, the longevity row and its sentence, the lines that
say what was measured, and the spec 7.4 lines when there is nothing to search. Apply writes the best ages into the plan
with one undo step. Couples are hidden until PR 5.

**Architecture:** One new US UI module, `src/us/ui/results/claiming-card.js`: the cache key (spec 7.3), a small memo of
results by key, the sliced job (the goal answers' driver: `'plan-next'` ends a slice), the paint, Apply and the hooks' view.
The card's text (the headline, a choice's name, the tooltip, the longevity sentence, the fixed-axis lines) is built by pure
functions in a new DOM-free module, `src/us/core/format/claim-text.js` (a new US `format/` folder beside the shared one, where
the other text builders live: `answer-text.js`, `market-scenario-*-text.js`; review 11), so Vitest covers every wording branch without a
browser. The markup is in `src/us/index.html` after the plan optimizer card. `render()` hides or shows the card on every
render (light too: the status is cheap) and, while it is open, paints it and schedules the job in the full and deferred
passes; the light render dims it through `markDeferredStale()`.

**Tech Stack:** plain ES modules under `src/`, esbuild, Vitest 5 (Node 22.12+), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md`: PR 4 is section 10 item 4, using sections
7.2-7.4, 8 and 9. Model plans: `2026-11-21-ss-claiming-pr1-basis-factors.md`, `-pr2-survivor-rules.md`, `-pr3-search.md`
(its "The result" block and "Branch review" define what the card reads). US only.
**Base:** PR 3 (amacgrog/Fire-Planner#117) is open, so this branch (`claude/ss-claiming-pr4-card`) starts from
`origin/claude/ss-claiming-pr3-search` (`44c8d3fc`) and is rebased onto `main` once #117 merges; the PR is opened against
`main` only after that. Badge: US V195 → the next free number at merge (V196 if nothing else lands first); Canada untouched.

## Global Constraints

- `npm test` stays exact to the cent. No projection, golden, Monte Carlo or fingerprint figure moves: the card only reads the
  search and Apply writes two existing keys. The one intended baseline move is `tests/snapshots/ui_us.json`: the hidden-id
  lists of `domMap()` (the card's new ids, hidden for the default couple) in the wiring entries. No text hash moves: the three
  text captures (`std default`, `std R`, `std R everything`, `snapshot_ui.js:240`) are couples, where the card is hidden
  (review 8). The commit says so. `ui_canada.json` must not move.
- UI rules (`CLAUDE.md`, "Adding UI code"): the module's state is module-level `let`s assigned only there; line 1 a purpose
  comment; no computing module-level initializer without a `// load-time:` marker (the module is in the `render.js` import
  cycle, as `plan-optimizer.js` is, so a marked one may use only globals and literals); its wiring function called once from
  `main.js`; its test hooks installed from `src/us/ui/install-test-hooks.js`. `npm run analyze` after adding the two modules.
- `claim-text.js` is a `core/` module: DOM-free, importable in plain Node (`tests/core_purity.js`, `tests/core_import.js`); it
  imports only `shared/core/format/numbers.js`, has no module-level mutable, and takes plain data (a result, numbers), never a
  context. `module-system.md`'s `format/` line gains "US: the claiming card's text".
- Apply is a sanctioned write: it joins the list in `CLAUDE.md`, with the survivor start select's listener
  (`ss-survivor-inputs.js`, PR 2), which spec 9 names too.
- Mobile (390 x 844): no sideways page scroll; the grid scrolls inside its `.table-wrap`.
- The repo is public: invented round figures only, no personal details ("a real user").
- Vitest rules 1-7 of `CLAUDE.md` for `claim-text.test.js` (through `world()`, exact comparisons, counted, shuffled).

## Decisions this plan makes (the spec leaves them to the builder)

1. **Where the card is and when it shows.** A `<details class="result-card" id="claimingCard">` right after
   `#planOptimizerCard` in `src/us/index.html` (spec 8: "beside the plan optimizer card"), closed by default. The other analysis
   cards remember nothing across reloads (no `localStorage` for their `open`), so "collapsed state remembered like the other
   analysis cards" means the same: closed on load, open for the session. `renderBody` (every render, light too) sets
   `claimingCard.hidden` from `claimStatus(ssClaimAxes(storeContext({ withPlan: false })))` and the kind: hidden for
   `'none'`, `'collecting'` and every couple (until PR 5); shown otherwise, with the 7.4 line for `'atClaim'` / `'nothing'`.
   (`ssClaimAxes` reads only inputs and the tax year; no run.) The same call paints the 7.4 line of a `'atClaim'` /
   `'nothing'` status at once, so a card newly shown by a light render is never empty (review 14).
2. **When it searches** (spec 7.2). `scheduleClaimSearch()` is called by `render()` (full) and `renderDeferred()` after
   `scheduleGuidanceAnswers()`, and by the card's `toggle` on open, whose listener runs only `renderClaimingCard();
   scheduleClaimSearch();`: unlike the Sankey's and the Roth card's, it calls no `render()`, which would cancel the deferred
   pass and run the bracket search at once; the card reads no selected run (review 4). It does nothing unless the card is open
   and not hidden, and nothing while `searchPending()` (the deferred pass calls it again). A status other than `'ok'` is drained
   at once (the generator yields nothing) and painted with no timer, held or not. An `'ok'` key not in the memo starts a job;
   under `__testHoldGuidance` (read at every schedule and reschedule through `guidanceHeld()`) the job starts no timer and
   waits for `__test_flushClaimSearch()`. A running job for the same key goes on. A step that finds the card closed or hidden
   sets `job.parked` and schedules nothing; `scheduleClaimSearch()` re-arms a parked job for the same key (one `setTimeout`,
   unless held), so reopening resumes it (review 3).
3. **The slices.** The goal answers' driver (`guidance-answers.js` `step`): `SLICE_MS` 40, `SLICE_STEPS` 8; after a
   `'plan-next'` the slice ends unless it has run nothing yet, so a bracket search is alone in its slice; a step first checks
   `state === job.state` and `claimKey() === job.key` and drops the job (no commit) when either changed. When the generator
   returns, the result is committed to the memo and painted. (A shared driver for the three jobs was considered and left
   out: it would refactor two existing modules in a feature PR.)
4. **The cache key** (spec 7.3): `claimKey()` = `currentYear + '|' + storedPlanFingerprint(state) + '|' +
   JSON.stringify([state.storedPlan, optimizerState.rothBracketByAge, optimizerState.withdrawalMixByAge, kept])`, `kept` the
   kept plan (`cliffPlanStore.plan` when `cliffPlanStore.forState === state`, else null). `storedPlanFingerprint` drops the
   list-row names (`withoutInertListKeys`), the goals and the dismissals, so a rename, a goal chip or a dismissal keeps the
   result. Memoized on `JSON.stringify(state)`, the year, the two override objects and the kept plan object (as the plan card's
   `searchKey` memoizes); `claimKey(true)` skips the memo (Apply's check). The memo holds the results of the last 4 keys
   (`keptMemo` from `guidance.js`: a Try and its Revert keep each side's grid).
5. **The run contexts.** `ctx = stateContextFor()(state)` (the kept plan), `contextFor = stateContextFor()`, `planContextFor
   = (p, r) => ownPlanContextFor(p)(r)`, built when the job starts (after the deferred pass, so the kept plan is the searched
   one). Exactly PR 3's test factories.
6. **`ownPlanFor`'s cache** (PR 3 review 8): `OWN_PLAN_CACHE_MAX` 8 → 16 (`planning.js`). The re-measure adds up to 3 entries
   (the current choice reuses the kept plan), the moves card up to about 5 (retire later, the cut, the levers), a Try and its
   Revert more; at 8 the clear-when-full cache can empty itself between the two cards and repeat bracket searches. A plan is a
   short array of intents. No test reads the cap.
7. **The headline** (spec 8), on the re-measured `best` (own-plan measures). A choice's name (`claimChoiceText`): single
   "claim at 70"; widowed, by start order, "survivor benefit at 60, then your own at 70", "your own benefit at 62, then the
   survivor benefit at 67", or "both at 64" when equal; an own axis fixed: "survivor benefit at 62" (and a survivor axis fixed:
   "your own benefit at 66"). The survivor cell at the axis's last age reads "at 67 (the full survivor amount)": for anyone born
   1957-1961 that age is the survivor full retirement age rounded up (66 and 4 months is paid from 67), so "full retirement
   age" would be wrong (review 9). Then:
   - `best.isCurrent`: "Best: your current choice, <name>." and no Apply;
   - both never run out: "Best: <name>. After-tax end value $X more than your current choice (<name>), in today's
     dollars." (`money(best.gain)`);
   - the best never runs out, the current does: "Best: <name>. Your money lasts the whole plan; with your current choice
     (<name>) it runs out at <age>.";
   - both run out: "Best: <name>. Your money runs out at <age> instead of <age>."
8. **The grid.** A table in `.table-wrap`: single, one row of own ages under a "Claim at" header; widowed, rows = survivor
   start, columns = own start (a fixed axis gives one row or one column). Each cell is a `<button>` (the tap note is reachable
   by keyboard). A cell shows the difference from the current choice in today's dollars: the sign, then
   `compact(Math.abs(d))` ("+$12.3K", "−$8.0K" with a true minus), and "$0" when `|d| <= 1` (the ranking's $1 tolerance;
   review 2); "out at 84" when it runs out; when the current choice itself runs out, a cell that never runs out shows "lasts"
   (a difference over a run-out end value means little; review 10); "current" on the current cell (it wins over "same as",
   since the current cell can itself be a twin); and "same as 60 / 62" (survivor / own) on a deduped cell. **Measures**
   (`claimShownMeasure`; review 1): a cell first resolves to its canonical twin `j = cells[i].sameAs ?? i`; the current choice's
   cell and its twin resolve to `top[0]`; a `j` in `top` shows its own-plan measure, any other its grid (kept-plan) measure; a
   twin's label, tooltip and shade always equal its canonical cell's. Every difference is against `top[0].measure` (the current
   choice's own plan is the kept plan with the same overrides, so its two measures are the same run; PR 3's test pins it). The
   best cell carries a "best" marker; the re-measured ones a small dot and "re-checked with its own cliff plan" in their
   tooltip. **Shading:** cells that never run out on a green scale from the lowest to the highest `today`
   (`color-mix(in srgb, var(--green) p%, transparent)`, p from 8 to 45; one distinct value gives the middle shade, no division
   by zero), cells that run out on a red scale by run-out age (earlier = stronger); the current cell outlined
   (`outline: 2px solid var(--ink2)`). **Current outside the grid**
   (`current.cell === -1`: a start of 71-75, a survivor start of 68-70): a line under the grid, "Your current choice (<name>)
   is outside the ages searched: after-tax end value $X." (or its run-out), and its `sameAs` named when set.
9. **The tooltip** (spec 8): each cell's `title` and `aria-label`, e.g. "Survivor at 60, own at 70: after-tax end value $1.2M
   in today's dollars; never runs out" (or "; runs out at 84"), plus "; same as survivor at 60, own at 62" or "; re-checked
   with its own cliff plan". A click (tap) on a cell writes the same text into a line under the grid (`#claimingCellNote`),
   since a `title` never shows on a phone.
10. **The longevity row** (spec 6, 8): a two-row table, "If the plan ends at 80 85 90 95" / "Best <short name>" (single
    "62"; widowed "60 / 70"; an extra current choice "current"), then one sentence (`longevitySentence`): with L the choice at
    the last end age and E the first end age from which every entry is L: "If you live to E or longer, <L> wins" followed by
    "; to 80, <c>" for each earlier entry (consecutive equal ones joined: "to 80 or 85, <c>"), ending with "."; when every
    entry is the same choice: "Whatever the plan's end age from 80 to 95, <c> wins." (the first and last end ages shown).
    Entries compare by `cell` (an entry with `sameAsCurrent` is the current choice).
11. **The lines** (spec 7.2, 8), under the grid: "Uses standard projections with guardrails off and your current plan
    settings; depends on life expectancy (yours: <lifeExpectancyA>)." Then, with the cliff plan on: "The best cells and your
    current choice were re-checked with their own cliff plan; the other cells, and the row above, use the current plan." Then,
    with a stored plan (`state.storedPlan`): "Re-run Plan search after applying." Widowed with a fixed axis (`ownFixed`, or the
    survivor axis fixed): "Only the survivor start is searched: <why>" with `why` from `ownFixed` ('atClaim': "your own benefit
    is entered as paid at its start age; enter it at full retirement age to compare both"; 'collecting': "you already collect
    your own benefit"; 'past': "your own benefit has started (you are past 70)"; 'none': "no own benefit is entered"), or "Only
    your own start is searched: you already collect the survivor benefit" (or "...: the survivor benefit has reached its full
    amount").
12. **The 7.4 lines.** `'atClaim'`: "Enter your benefit at full retirement age (set “amount entered is” to “At full retirement
    age”) to compare claiming ages." with a button "Go to the field" that calls `revealField('ssBenefitBasisA')` (the sidebar
    field, opened and focused, as the guidance rows do). `'nothing'`: "Nothing to choose: your claiming ages are already set
    (already collecting, or past the last claiming age)." Neither shows a grid or Apply.
13. **Apply** (spec 9): a button "Apply: <short name>" ("Apply: claim at 70", "Apply: survivor 60, own 70"; it wraps at 390 px)
    shown when `best.isCurrent` is false **and** the drawn result's key is `claimKey()`: while a job runs for newer inputs
    (after any input, and right after Apply itself, whose `render()` starts one) the button is hidden, as the plan card's
    `renderSearchStaleness` hides it, and "Applied." stays until a result for the new key is painted (review 5). On click, in
    order:
    - refused in market-scenario mode (`scenarioSnapshot`) or during a move preview (`movePreview`): the button is disabled
      with a `title` and the note "Revert the market scenario to apply a claiming age." / "Keep or revert the change you are
      previewing to apply a claiming age." (the goal chips' wording); the paint disables it, and `applyClaim()` checks again;
    - refused when `claimKey(true)` differs from the drawn result's key: the button hides and the note reads "Your inputs
      changed since these ages were compared; the card is comparing them again." (the plan card's stale line, reworded because
      this card reruns by itself);
    - else `snapshotForUndo('Applied claiming ages')`; write `ssStartAgeA` when the best cell's `a` is not null;
      `ssSurvivorStartAge` when its `survivor` is not null, written as **`null` when it is the survivor axis's last age**
      `claimSurvivorFull(r)` (from the drawn result, one source; review 12: `ssSurvivorStartResolved` gives a `null` start that
      same `ceil(sfra / 12)`, so it pays as that cell does; PR 3 Decision 11; the select
      then reads "At full retirement age", and the stored plan's fingerprint leaves it out as before); then
      `dismissFirstRunBanner()` (as Keep does: an autosave writes nothing before the page is personalized), `syncControls()`,
      `render()`, `saveInputs()`; the note reads "Applied." until the next paint of a new result.
    `best.cell === -1` never reaches Apply (it is the current choice). A stored plan becomes stale through its fingerprint (the
    plan card's existing line shows). With the cliff plan on, Apply is not always idempotent: the applied ages get their own
    kept plan, the grid's top three can change, and a newly re-checked cell can then win (the topic file says so; review 7).
14. **The hooks** (`src/us/ui/install-test-hooks.js`): `__test_flushClaimSearch()` (runs the job to its end with no timer;
    a no-op without one), `__test_claimingCard()` (the card's view: `hidden`, `open`, `status`, `kind`, `pending`, `searches`
    (jobs started, so a test can tell a rerun), `headline`, `grid` (rows of cell texts), `currentCell` / `bestCell` (the
    outlined and marked cells' row and column), `titles`, `longevity` (the row's texts) and `sentence`, `lines`, `applyShown`,
    `applyDisabled`, `applyNote`, and `result` (the drawn result's `best`, `current.cell`, `status`; plain data)), and
    `__test_applyClaim()` (Apply as the click runs it, returning true or false). `snapshot_ui`'s `domMap()` and its text
    capture call `__test_flushClaimSearch` when it exists (its pages are not held but run on a paused clock, so the job's
    slices would depend on `runFor`; today its scenarios are couples with no job, so the call guards later ones). The key
    ignores the test switches (`__test_setBracketSearch` and the like): a test that flips one and reads the card calls
    `__test_flushClaimSearch` only after changing an input.

## Review Focus

1. **The cache key** (Decision 4): every input the search reads is in it (the state through the fingerprint, the year, the
   stored plan, the overrides, the kept plan), and nothing that never changes a figure is (names, goals, dismissals). Apply
   compares a fresh key.
2. **The job's lifetime** (Decisions 2-3): never while `searchPending()`, never while the card is closed or hidden, dropped
   on a state or key change, resumed on reopen, held under the test global, flushed by the hook.
3. **Apply** writes only the varied keys, `null` at the rounded survivor full retirement age, one undo snapshot, then sync,
   render, autosave; refused in scenario mode, in a move preview and on a stale key.
4. **The cell measures** (Decision 8): own-plan for `top`, kept-plan otherwise, differences against `top[0]`.
5. **Mobile:** no sideways scroll at 390 x 844 with the widowed 8 x 9 grid open.

---

### Task 1: The card's text (`claim-text.js`) with Vitest

**Files:**
- Create: `src/us/core/format/claim-text.js` (purpose: "The claiming card's text (SS claiming optimizer PR 4): a choice's
  name, the headline, a cell's label and tooltip, the longevity sentence and the fixed-axis lines")
- Test: `tests/unit/us/claim-text.test.js` (new)

**Interfaces** (all pure; `r` a PR 3 result, `cell` an index or -1 for the current choice):
- `claimChoice(r, cell) -> { survivor, a }` (the ages of a cell, or of the current choice with its fixed axes' ages from
  `r.axes.x.current`).
- `claimChoiceText(r, cell, { short = false } = {}) -> string` (Decision 7; `short`: "62" / "60 / 70").
- `claimHeadline(r) -> string` (Decision 7).
- `claimCellLabel(r, i) -> string` and `claimCellTitle(r, i) -> string` (Decisions 8-9; the measure Decision 8 picks).
- `claimShownMeasure(r, i) -> measure` (Decision 8: resolve the twin, the current choice and its twin to `r.top[0]`; own-plan
  for a canonical cell in `r.top`, else the grid measure; `-1` gives `r.top[0].measure`).
- `longevitySentence(r) -> string` (Decision 10).
- `claimFixedLine(r) -> string` ('' when nothing is fixed; Decision 11).
- `claimSurvivorFull(r) -> number` (the survivor axis's last age, the rounded survivor full retirement age; what Apply maps to
  `null`).

- [ ] **Step 1: Write the failing tests** (counted; hand-built result objects, plain literals: no engine run, so no rule 6
  concern; one case built by `claimSearch` on PR 3's single fixture checks the functions accept a real result):
  - names: single 70 "claim at 70"; widowed (60, 70) "survivor benefit at 60, then your own at 70"; (67, 62) with survivor full
    67 "your own benefit at 62, then the survivor benefit at 67 (the full survivor amount)"; (64, 64) "both at 64"; own fixed
    "survivor benefit at 62"; short forms; the current choice outside the grid (start 72).
  - headline: the four branches of Decision 7 (isCurrent; a gain of 12,345.67 → "$12,346"; best never runs out, current out at
    84; both out, 88 instead of 84).
  - cells: "+$12.3K", "−$8.0K" (a true minus), "$0" at a difference of 0.4 and of −1, "out at 84", "lasts" (the current runs
    out), "current" (also when the current cell is a twin), "same as 60 / 62"; the shown measure is the `top` one for a
    re-measured cell, **the twin's `top` measure for a cell whose `sameAs` is a re-measured cell**, `top[0]` for the current
    cell's twin, and the grid one otherwise; the titles' three tails.
  - longevity: [62, 66, 70, 70] → "If you live to 90 or longer, claim at 70 wins; to 80, claim at 62; to 85, claim at 66.";
    [62, 62, 70, 70] → "...; to 80 or 85, claim at 62."; all 70 → "Whatever the plan's end age from 80 to 95, claim at 70
    wins."; three entries (ageA past 80 is impossible in an `'ok'` search, so a hand-built three-entry row starting at 85).
  - fixed lines: each `ownFixed` value and the two survivor-fixed cases; '' for a single person.
- [ ] **Step 2:** `npx vitest run tests/unit/us/claim-text.test.js`: FAIL. **Step 3:** Implement; `npm run analyze`.
- [ ] **Step 4:** PASS, alone and shuffled; `node tests/engine_purity.js`, `node tests/module_map.js` PASS.
- [ ] **Step 5: Commit** ("SS PR 4: the claiming card's text").

### Task 2: The card, the job, the key and the hooks

**Files:**
- Create: `src/us/ui/results/claiming-card.js` (purpose: "The When to claim Social Security card (SS claiming optimizer PR
  4): the cache key, the sliced search job, the grid and Apply"); exports `claimingCardVisibility()`, `renderClaimingCard()`,
  `scheduleClaimSearch()`, `runClaimSearchToEnd()`, `applyClaim()`, `claimingCardState()`, `wireClaimingCard()`
- Modify: `src/us/index.html` (the card's markup after `#planOptimizerCard`: summary, intro, `#claimingHeadline`,
  `#claimingMeasuring`, `#claimingGridWrap` (`.table-wrap`) with `#claimingGrid`, `#claimingCellNote`, `#claimingCurrentLine`,
  `#claimingLongevity` (`.table-wrap` with a `min-width:0` table) and `#claimingSentence`, `#claimingLines`, `#claimingStatusLine`
  with `#claimingGoToFieldBtn`, `#claimingApplyBtn` and `#claimingApplyNote`)
- Modify: `src/shared/styles/styles.css` (`.claim-grid` cells: centred, `min-width:0` table, `white-space:nowrap`, the current
  outline, the best marker, the re-checked dot, `.claiming-measuring` dim)
- Modify: `src/us/ui/results/render.js` (`renderBody`: `claimingCardVisibility()` beside the Roth card's `hidden`;
  `renderOpenCards`: `renderClaimingCard()` while open; `render()` (full) and `renderDeferred()`: `scheduleClaimSearch()` after
  `scheduleGuidanceAnswers()`)
- Modify: `src/shared/ui/results/render-scheduler.js` (`DEFERRED_CARDS` gains `'claimingCard'`: absent in Canada, where the
  existing `card &&` guard skips it; the comment is reworded: the list holds every country's cards, each drawn by its own
  `renderOpenCards()`, and `claimingCard` is US-only)
- Modify: `src/us/core/cliff-plan/planning.js` (`OWN_PLAN_CACHE_MAX` 16; Decision 6)
- Modify: `src/us/main.js` (`wireClaimingCard()` after `wirePlanOptimizer()`), `src/us/ui/install-test-hooks.js` (Decision 14)
- Modify: `tests/snapshot_ui.js` (the flush in `domMap()` and before the text capture)

- [ ] **Step 1:** Markup and CSS; `npm run build`; open the built US file, set a single person with `ssBenefitBasisA: 'pia'`,
  check the card shows (closed) and its markup fits at 390 px.
- [ ] **Step 2:** The module: the key and its memo (Decision 4), the memo list (`keptMemo`), `scheduleClaimSearch` and `step`
  (Decisions 2-3), the paint from the last committed result for the current key (dimmed with "Comparing claiming ages…" while
  a job runs for a newer key or the drawn key differs), the 7.4 lines, Apply (Decision 13), the cell click note, the hooks'
  view. `node --check`; `npm run analyze`; `node tests/ui_cycles.js`, `node tests/closure_names.js`, `node tests/main_entry.js`.
- [ ] **Step 3:** Wire it into `render.js`, `render-scheduler.js`, `main.js` and the hooks; `npm run build`; a manual pass in
  the built file (single at 62 in `pia`; the widowed fixture of Task 3) with the console clear.
- [ ] **Step 4: Commit** ("SS PR 4: the claiming card, its sliced job, the cache key and Apply").

### Task 3: `test_claiming_card.js` and the held scripts

**Files:**
- Create: `test_claiming_card.js` (root; held by `tests/ui_scripts.js`: every check after an input calls `__test_flushRender()`
  then `__test_flushClaimSearch()`; exits 1 on a failure; no fixed waits)
- Modify: any held root script that opens the card (found by a grep for `claimingCard` and for scripts that open every
  `details` and read text or widths: add the flush after their `__test_flushRender()`), and `docs/architecture/test-inventory.md`

Fixtures (invented figures): set through `__test_replaceState(raw)` (it does not render), then `__test_syncControls()` and a
full render (a `realBtn` / `themeToggleBtn` click, the idiom of `test_cash_flow_chart.js:76`; review 6). `SINGLE` = a single
person of 62 born 1964, `ssMonthlyA` 2,000 in `pia`, the defaults otherwise; `WIDOWED` = PR 3's "own first, survivor later"
zero-tax fixture (60 in 2026, own 2,000 `pia`, survivor 3,000, life expectancy 90, `cliffGuardEnabled: false`, so no kept plan
moves after Apply and the result is deterministic; hand winner own 62, survivor 67; review 7), with the current choice set to
own 70, survivor 60 so Apply has something to write. The script sets `globalThis.__testHoldGuidance = true` in its own init
script too, so a run outside `tests/ui_scripts.js` is held the same way (review 6).

- [ ] **Step 1: Write the checks:**
  - Hidden: the defaults (a couple) → `#claimingCard` hidden; a single person with no Social Security → hidden; a single person
    collecting (`ssCollectingA`, start at or below the age) → hidden.
  - `'atClaim'` (a single person, the default basis): the card shows; opened, the status line and "Go to the field" show
    **with no flush** (the immediate paint), no grid, no Apply; the button reveals `#ssBenefitBasisA` (visible and focused).
  - Couple with `pia` bases: hidden (until PR 5).
  - Not searched while closed: `SINGLE` with the card closed: after `__test_flushRender()` and the flush, `searches` 0.
  - Close and reopen: `SINGLE` opened (a job starts, held), closed, reopened: still one job (`searches` 1), and the flush
    finishes it.
  - Held: `SINGLE`, card opened, after `__test_flushRender()` only: `pending` true and the measuring line shown; after
    `__test_flushClaimSearch()`: `pending` false, 9 cells, the current cell (62) outlined, the headline equals what
    `claimHeadline` gives for `result` (read through the view), every title contains "today's dollars", 4 longevity entries and
    a sentence.
  - Not while the bracket search is pending: type a field (`input`), `__test_flushLightRender()`: `searches` unchanged; then
    `__test_flushRender()`: one more.
  - A rename keeps the result: add an income stream row, flush, read `searches`; change only its name (`input` and `change`),
    then force a full render (a `realBtn` click: a name `change` renders only while the Sankey is open, so without it the check
    proves nothing; review 6), flush: `searches` unchanged and the drawn result the same. The same for a goal chip.
  - Outside the grid: `SINGLE` with `ssLateStartEnabled` and start 72: the current line shows. With a stored plan
    (`storedPlan` set through the plan card's hook): "Re-run Plan search after applying." shows.
  - Shared results never written: one search with `__test_freezeSimResults(true)` (as `test_result_cache.js:22`): no page
    error.
  - The real timer path (review 6): a second context whose init script sets `__testHoldGuidance = false` after the preload,
    `SINGLE` opened, `waitForFunction(() => !__test_claimingCard().pending && __test_claimingCard().result)`: the grid draws
    from the slices with no flush.
  - Widowed: `WIDOWED`, opened, flushed: an 8 x 9 grid, at least one "same as" cell, the headline names "your own benefit at
    62, then the survivor benefit at 67 (full retirement age)"; Apply: `state.ssStartAgeA` 62, `state.ssSurvivorStartAge`
    `null`, `#ssStartAgeA` reads 62 and `#ssSurvivorStartAge` reads '' (synced); the undo toast shows; after the flush the
    headline says the current choice is best and Apply is hidden; Undo: both keys and both boxes back (70, 60).
  - Stale: `SINGLE` drawn, then `state.spending` changed with no render: `__test_applyClaim()` false, the note is the stale
    line, `ssStartAgeA` unchanged.
  - Scenario mode: `__test_runMarketScenario(...)` (a scenario the market-scenario script uses), the card reflushed: Apply
    disabled with the scenario note; `__test_applyClaim()` false; `__test_revertMarketScenario()` enables it again.
    Move preview: `__test_tryMove({ label, patch: { spending: <x> } })`: Apply disabled with the preview note; revert.
  - Mobile: a 390 x 844 page with `WIDOWED`, the card open and flushed: `scrollWidth > clientWidth` false for the document
    (whether `#claimingGridWrap` itself scrolls depends on the grid's width, so it is not asserted; review 6); no page errors.
- [ ] **Step 2:** `npm run build`, `node test_claiming_card.js` (alone, then through `node tests/ui_scripts.js
  test_claiming_card.js` to run it held): PASS.
- [ ] **Step 3:** The held-script sweep (Files); `npm run test:ui` in the background: green.
- [ ] **Step 4: Commit** ("SS PR 4: test_claiming_card.js").

### Task 4: Docs, badge, baselines, verify, PR

**Files:**
- Modify: `docs/architecture/us-social-security.md` (a "The card (PR 4)" section: where it shows and when it searches, the
  key, the slices and the hold, the measures shown, Apply and its refusals, the hooks; the PR 3 section's "Nothing in the UI
  calls it yet" sentence updated); `docs/architecture/inputs-and-ui.md` (the deferred cards list and the claim job beside the
  guidance jobs; `__test_flushClaimSearch` in the test-flush paragraph); `docs/architecture/cliff-plan.md` (`OWN_PLAN_CACHE_MAX`
  16 and why); `docs/architecture/module-system.md` (the `format/` folder line: "US: the claiming card's text");
  `docs/architecture/test-inventory.md`; `CLAUDE.md` (the sanctioned writes: the claiming card's Apply and the
  survivor start select; the inputs invariant's flush paragraph names `__test_flushClaimSearch()` for a test that reads
  `#claimingCard`); `README.md` (the feature line PR 3 left: "When to claim Social Security: ..."); `docs/next-batches-plan.md`
  "### Batch 6 notes" ("Claiming-age optimizer PR 4 (US V196)": the decisions, the baseline update, the timings in the
  browser); the spec, section 10 item 4: built, the badge, this plan's path
- Modify: `src/us/index.html` (badge V195 → the next free number)
- [ ] **Step 1:** Docs; `node tests/doc_paths.js`.
- [ ] **Step 2:** `npm test` (background): green except `snapshot_ui`'s intended US move; read the diff (only the US hidden-id
  lists gain the card's ids; no text hash; Canada unchanged), then `npm run snapshot:update` and `npm test` again: green. The commit says
  the baseline update is intended.
- [ ] **Step 3:** `npm run test:ui` (background): green.
- [ ] **Step 4:** An Opus review of the branch (model opus); fold in; rebase onto `main` once #117 has merged; push; open the
  PR against `main`.

## Not in this PR

Couples on the card and the spousal benefit (PR 5); an MCP tool for the card; remembering the card's open state across
reloads; a shared slice driver for the three jobs; re-measuring the longevity row with own plans; Canada.

## Revisions after the Opus review (2026-11-21; folded into the decisions and tasks above)

The review confirmed the cache key (every dropped key is inert for the search; `optimizerState` is replaced, never mutated, so
the identity memo is sound; `kept` catches a light render's unsearched plan; Apply's fresh key catches a write with no render),
that `top[0].measure` and `current.measure` are the same run, that a `null` survivor start pays as the axis's last cell, the
Apply order and refusals (as Keep and `tryMove`), the hooks the tests need, the render wiring, and that nothing depends on
`OWN_PLAN_CACHE_MAX` being 8. Folded in:

1. *(must-fix)* A "same as" cell resolves to its canonical twin before the `top` lookup, so it never shows a different figure
   from its twin; the current cell's twin maps to `top[0]`; "current" wins over "same as" (Decision 8, Task 1 test).
2. The cell format is the sign, then `compact(|d|)` with a true minus, and "$0" within the $1 tolerance.
3. A parked job is re-armed on reopen (`job.parked`); the hold is re-read at every reschedule; a close-and-reopen check.
4. The `toggle` listener paints and schedules; it calls no `render()`.
5. Apply hides while the drawn key is not the live one; "Applied." stays until the new result paints.
6. The Playwright checks: the render idiom after `__test_replaceState`, a forced full render after the rename and a goal
   chip, the script's own hold, an unheld timer-path check, the mobile check only on the page, and new checks for the
   immediate 7.4 paint, the outside-the-grid line, the stored-plan line and frozen results.
7. `WIDOWED` runs with the cliff plan off, so the after-Apply check is deterministic; the topic file notes Apply is not always
   idempotent with the cliff plan on.
8. The snapshot baseline: only the US hidden-id lists move (the text captures are couples).
9. The survivor's last cell reads "(the full survivor amount)", right for people born 1957-1961 too.
10. When the current choice runs out, cells that never run out read "lasts".
11. `claim-text.js` moves to a new `src/us/core/format/`.
12. Apply takes the survivor's last age from the drawn result.
13. The `DEFERRED_CARDS` comment is reworded.
14. The 7.4 line paints in every render; the cells are buttons; the short Apply label wraps; shading guards one value.
15. The stale wording's deviation from spec 9 is put to the owner (question 4); the key ignores the test switches (Decision 14).

## Questions for the owner

1. **The survivor cell at full retirement age writes `null`** (Decision 13): the select then reads "At full retirement age"
   instead of "67", and nothing else changes (it pays the same; the fingerprint leaves `null` out as before). *Recommended:*
   `null`.
2. **What the grid's cells show** (Decision 8): the difference from your current choice in today's dollars, with the four
   re-checked cells on their own cliff plan and the rest on the current plan (the spec's "the other cells use the current
   plan"). *Recommended:* as written. The alternative, every cell on the current plan with only the headline re-checked, is
   more uniform but can shade a cell darker than the named best.
3. **`ownPlanFor`'s cache from 8 to 16** (Decision 6), so the claiming card and the moves card do not evict each other's plans.
   *Recommended:* 16.
4. **The stale wording** (Decision 13): spec 9 says the plan card's line ("Your inputs changed since this search; search
   again."), but this card has no Search button and reruns by itself. *Recommended:* "Your inputs changed since these ages were
   compared; the card is comparing them again."
