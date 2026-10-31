# Batch 5 follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the US Roth-conversion bracket fill count the year's own traditional draw, let the whole-run sizing pass turn a year's
conversion off, stop the ACA 400% line from holding over-the-line years at $0, and have the bracket card name the limit that holds
the conversions.

**Architecture:** Four PRs in order (S1 fill, S2 "convert nothing", S3 over-the-line rule, S4 card note), each branched from
`origin/main` after the previous one merges, each with its own movers table shown to the owner before any baseline changes. Engine
changes are in `src/us/core/withdrawals/roth-conversion.js` and `src/us/core/projection/run-projection.js`; the card is
`src/us/ui/results/roth-optimizer.js`. Canada is untouched.

**Tech Stack:** plain ES modules, esbuild build, Vitest (unit), Playwright (UI and the scan/snapshot tools), Node 22.12+.

**Spec:** `docs/superpowers/specs/2026-10-31-b5-followups-design.md` (read it first; section numbers below are its). Background:
`docs/superpowers/reports/2026-10-31-aca-cap-over-line-analysis.md` and the review
`docs/superpowers/reports/2026-10-31-b5-followups-spec-review.md` (branches `claude/aca-cap-over-line`,
`claude/b5-followups-spec-review`; read with `git show origin/<branch>:<path>`).

## Global Constraints

- Follow `CLAUDE.md`: engine functions take `ctx` first and read only `ctx.inputs`; no store imports in the engine; a new module-level
  mutable in an engine module is registered in `tests/engine-purity.json` in the same commit; hot paths allocate nothing a year does
  not need; a new scalar a year body mutates before the convergence check goes into `scalarSnapshot`.
- Vitest rules: go through `world()`; exact comparisons only (`toBe`, `toStrictEqual`; a tolerance is written out); hand-computed
  expected values are literals; engine-vs-engine comparisons run in one process; counted suites update their `afterAll` count; a new
  suite passes alone and with `npx vitest run --sequence.shuffle`; a suite comparing engine output runs on Node 22 and Node 24.
- **Never run `npm run snapshot:update` before the owner has seen and accepted the movers table** (spec section 5). The commit that
  updates baselines says it is an intended behavior change.
- An earlier run-out or first home draw is a row in the movers table for the owner to accept or reject (owner, 2026-10-31).
- Version badge: the `<span ...>V150</span>` in `src/us/index.html`'s `<h1>`. S1 -> V151; S2 (if it ships code) -> V152; S3 and S4
  take the next numbers. Canada stays V67.
- Docs in the same PR: `README.md` (user-facing), the topic files named per task, `docs/architecture/test-inventory.md` (new tests
  and tool options), and a new "Batch 5 follow-ups: results" section of `docs/next-batches-plan.md` placed after "Batch 5 step 5:
  results". `docs/reference.md` is not edited.
- The owner merges every PR. Reviews use an Opus subagent; mechanical tasks (tooling, docs) may go to Sonnet.
- The test couple: `tests/fixtures/dana-and-chris.json` (`{ firePlannerScenario, schemaVersion, name, savedAt, state }`); load its
  `state` unchanged.

## Review Focus

- A conversion year with no ACA premium and no finite MAGI limit (under 63 with ACA off; at 63+ the IRMAA tier is always a finite
  ceiling): the fill must count this year's draw, not last year's (Task 2's engine-level test).
- The first retired year (`prevDiscTraditional` 0): the first pass fills as if no draw, so the year must iterate (Task 2's test runs a
  first-retired-year conversion).
- A two-return year and a survivor year with a large draw: `drawBelow` is the household `estTrad` in both `ordinaryAt` branches (Task 2
  adds a two-return direct-call case).
- A household whose whole-run shortlist already uses the 24-run budget: S2 must leave it byte-identical (Task 7's test).
- A year with a stay-under plan, a sizing target and an ACA hold all in one run: `convHeldBy` names each correctly and the card's
  line picks the most frequent with "mostly" (Task 11's test).

---

## PR 1 (S1): the plain fill counts the year's draw

Branch `claude/b5-f1-fill-draw` from `origin/main`.

### Task 1: per-household dumps for the scan tools, and the baselines

**Files:**
- Modify: `tests/conversion_sizing.js`, `tests/solver_scan.js`
- Create: `tests/compare_household_dumps.js`
- Modify: `docs/architecture/test-inventory.md`

**Interfaces:**
- Produces: `node tests/conversion_sizing.js --dump <file.json>` and `node tests/solver_scan.js ... --dump <file.json>` writing
  `[{ id, mode, runOut, firstHomeDraw, endValue }]` (`id`: the household's name plus its variant, never a grid index: `solver_scan.js`
  filters the grid and appends the RI/PA copies (`~536-539`), so indexes shift between trees; `runOut` and
  `firstHomeDraw`: an age or `null` for never; `endValue`: the after-tax end value of the sizing-on plan's run, computed through
  `__test_runPlanMode({ ..., endValue: true })` as `solver_scan.js` does). `conversion_sizing.js` also gains `--root DIR` (as
  `solver_scan.js` has), so the branch's tools can measure another tree's build. `node tests/compare_household_dumps.js <before.json> <after.json>` prints the rows that differ and exits 1 when any row
  depletes or first draws on the house earlier (null = never = latest), listing them; exit 0 otherwise.

- [ ] **Step 1:** Add `--dump` to both tools (no change to their existing output or exit codes without the flag) and write
  `compare_household_dumps.js`. Check: running a tool twice on the same build and comparing the dumps prints no differing row and
  exits 0; editing one `runOut` in a copy to an earlier age makes it exit 1 naming that row.
- [ ] **Step 2:** Baselines, saved outside the repo (the scratchpad), all taken with this branch's tools: scratch worktrees (`git
  worktree add`, outside the repo) at `d67ebd3` (main) and at `9ab5cad` (the WIP), each `npm ci && npm run build`. For each tree
  `<t>` in `main`, `wip`: `node tests/snapshot.js --root <tree> --only US --dump <dir>/<t>-snap --update-nothing` (check `snapshot.js`'s
  own option names; it takes a tree to measure and a dump directory); `node tests/conversion_sizing.js --root <tree> --dump
  <dir>/<t>-cs.json`; `node tests/solver_scan.js --root <tree> --sizing --conv-only --dump <dir>/<t>-scan.json`. The WIP dumps are for
  PR 3.
- [ ] **Step 3:** Record the fixture on `main`: a small script (scratchpad, not committed) loading `dist/Planner_US.html` with the
  fixture's state, reading `window.fireProjectionRows` (run-out, conversion by age, `cliffChoice` by age) and the bracket card's rows
  (`#rothOptimizerRows` text). Keep its output for the notes; reuse the script in every PR.
- [ ] **Step 4:** Add the two options and the new script to `docs/architecture/test-inventory.md`. Commit:
  `tests: per-household dumps for conversion_sizing and solver_scan, and a dump compare`.

### Task 2: the fill counts `estTrad`

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js:28-32` (comment), `:160-181` (`solveRothConversion`)
- Modify: `src/us/core/projection/run-projection.js:836-861` (the two call sites, `estUsed`)
- Create: `tests/unit/us/conversion-fill-draw.test.js`

**Interfaces:**
- Produces: `solveRothConversion(ctx, profile, maxAvailable, yearIndex, ageKey, drawBelow)`: `drawBelow` a number (the pass's
  `estTrad`), passed to `solveRothConversionTop(..., bracketPct, drawBelow)`. The `rothAmountByAge` branch ignores it.
- Produces: `export function convBracketFor(ctx, ageKey)` in `roth-conversion.js`: the bracket `solveRothConversion` resolves today
  inline (`~174-179`: the `rothBracketByAge` override, else the plan's bracket when made for the setting, else the setting), which
  `solveRothConversion` now calls. Used by Task 2's `estUsed` condition and Task 10's comparison fill.
- Produces (test-only): the `trace` option's per-year record (`~2211-2240`) gains `estTrad` (the kept pass's) and `convertible`, both
  numbers, allocated only when tracing.

- [ ] **Step 1: Write the failing direct-call tests** in `conversion-fill-draw.test.js` (load `us/core/withdrawals/roth-conversion.js`
  through `w.load`; `ctx = await w.ctx()` after the last `setState`; the profile literal `{ filing: 'mfj', ageA: 60, ageB: 60,
  otherA: 0, otherB: 0, ssA: 0, ssB: 0 }` plus the fields `solveRothConversionTop` reads, year 0, no plan in the context):
  - `'a 10% fill in a $190,000-draw year converts 0'`: with `rothConvBracket: 10`, `solveRothConversion(ctx, profile, 1e6, 0, 60,
    190000)` is `0`.
  - `'a 24% fill converts only the 24% room above the draw'`: with `rothConvBracket: 24` and `drawBelow` 190,000, the result is within
    the bisection's last step of the hand-computed literal: 24% bracket top (MFJ 2026 taxable income, from `federal-rules.js`'s
    table) + the MFJ standard deduction for two people 60 (32,200) - 190,000, written `Math.abs(x - LIT) <= 0.06` (1e6 / 2^24),
    the arithmetic in a comment.
  - `'with no draw the fill is unchanged'`: `solveRothConversion(..., 0)` equals `solveRothConversionTop(ctx, profile, 1e6, 0, 24, 0)`
    (`toBe`, same process).
  - `'two returns: the draw counts in the single-filer branch too'`: a two-return profile (`filing: 'single'`, `otherB` set) with a
    draw that fills the 12% top converts 0 at 12%.
- [ ] **Step 2:** `npx vitest run tests/unit/us/conversion-fill-draw.test.js`: the first, second and fourth fail (the argument is
  ignored), the third passes. (The single 12% figure for the two-return case: 66,500 of ordinary income at year 0, the 12% top
  50,400 plus the single standard deduction 16,100; review M8.)
- [ ] **Step 3:** Add `drawBelow` to `solveRothConversion` and pass it on. In `run-projection.js` both calls (`~855` fallback,
  `~860` plain) pass `estTrad`, and each sets `estUsed = true` when `convBracketFor(ctx, age) !== 0` and `convertible > 0`, whatever
  `estTrad` is (spec 4.1; the first retired year starts at `estTrad` 0 and must still iterate). Then Task 2b (convergence) before
  Step 4's test can pass. Rewrite the comment at
  `roth-conversion.js:28-32`: every path now passes the pass's draw; a call with 0 is still the same doubles as before.
- [ ] **Step 4: Write the engine-level test** (same file, through the `engine(w)` helper with `trace`): `'a conversion year with no
  finite limit fills against its own draw'`: a single, 60, retired at 60, Texas, ACA off, no Social Security, no pension,
  traditional 1,500,000, taxable 0, cash 0, spending 120,000, conversions 60-62 at **24%**, the guard off, life 70 (under 63: no IRMAA
  ceiling; ACA off: no ACA line). For rows 60 (first retired year) and 61, with `t = trace[i]` and `profile =
  e.accountTrace()[i].profile`: the row's conversion `toBe` `solveRothConversionTop(ctx, profile, t.convertible, i, 24, t.estTrad)`
  (the kept pass's own inputs: the wiring); `t.passes > 1` at 60; and the year converged: `Math.abs(draw - t.estTrad) <=
  MAGI_ITER_TOL` with `draw = row.traditionalWithdrawn - row.rmd - (row.inheritedDraw || 0)` (`traditionalWithdrawn` starts at the
  RMD and never includes the conversion, `draws.js`). On `main` the first assertion fails (the fill ignores the draw); after Task 2
  alone the last fails (review C1: 8 passes, $266 over at 60); after Task 2b all pass.
- [ ] **Step 5:** `npx vitest run tests/unit/us/conversion-fill-draw.test.js` passes; run it alone with `--sequence.shuffle`, on Node
  22 and 24.
- [ ] **Step 6:** `npm run test:unit`: list every failing check (expected: pinned conversion figures in `conversion-apply`,
  `conversion-choose`, `conversion-plan`, `plan-search`, `bracket-search`, `gains-capped`, `order-lever`, `split-order-floor`,
  two-return-split`, `flat-bracket` and others). Do not re-pin yet (Task 4). Commit the source and the new test:
  `S1: the plain bracket fill counts the year's traditional draw (WIP: pinned checks not yet re-pinned)`. This branch state is not
  pushed or reviewed until Task 4 Step 8.

### Task 2b: the fill's years converge (owner decision 2026-10-31, see the spec's section 4.1 "Convergence")

**Files:** `src/us/core/projection/run-projection.js` (the estimate update `~1160-1170`), `tests/unit/us/conversion-fill-draw.test.js`

**Interfaces:**
- Consumes: `convReadEst` (Task 3 defines it; build it here first if Task 3 is not done: a per-pass flag, true when the conversion
  was resolved from `estTrad` under Task 2's `estUsed` condition or on the sized path).
- Produces: two year-iteration scalars `secEst`, `secReal` (the previous pass's `estTrad` and `realizedTrad`; `NaN` when none), reset
  wherever `passLog.length = 0` / `phasePass = -1` are reset (year start, phase start, the sized phase). They are iteration
  bookkeeping like `passLog`, not year state: check `magi-iteration.md`'s snapshot rule and say in the commit why they are (or are
  not) in `scalarSnapshot`.

- [ ] **Step 1: Failing test** (in `conversion-fill-draw.test.js`): Task 2 Step 4's household also asserts `t.passes <= 5` at 60 and
  61, and the convergence assertion holds (it fails after Task 2 alone: 8 passes, $266 over).
- [ ] **Step 2: Implement** in the update at `~1163-1170`: when `convReadEst && !usesMagiEstimate` and `secEst` is a number with
  `Math.abs(estTrad - secEst) > 1e-9`:

  ```js
  const s = (realizedTrad - secReal) / (estTrad - secEst); // slope of realized against estimated draw
  if (Number.isFinite(s) && s < 1) next = Math.max(0, (realizedTrad - s * estTrad) / (1 - s)); // the line's fixed point
  ```

  else (no previous pass, a flat step, or `s >= 1`) the plain step `next = realizedTrad`. In those years every other estimate takes
  the undamped step (`w = 1`). Then `secEst = estTrad; secReal = realizedTrad; estTrad = next`. All other years: today's code,
  untouched (same doubles).
- [ ] **Step 3:** Run the file: passes. `npm run test:unit`: no new failure beyond Task 2 Step 6's list (a failure in a household
  with ACA on or no conversion means the scope leaked: fix it). Commit: `S1: a secant step settles the years whose fill reads the
  draw (no ACA premium)`.

### Task 3: the forced-pick tie in every year whose conversion read the draw

**Files:**
- Modify: `src/us/core/projection/run-projection.js:~1303-1310` (the pick), the conversion block (`~836-861`)
- Test: `tests/unit/us/conversion-fill-draw.test.js`

**Interfaces:**
- Produces: a per-pass `let convReadEst` (false at each pass start, beside `estUsed`'s resets at `~514` and `~635`; true when the
  conversion block resolved a conversion from `estTrad` under the same condition that sets `estUsed` in Task 2: the sized path, or
  the plain or fallback fill with a non-zero bracket and `convertible > 0`). It is reset each pass and is not a rewound accumulator,
  so it is not in `scalarSnapshot`; the pick (`~1307-1312`) reads the last pass's value, which is the same every pass of a year
  (the condition does not depend on the estimates). The tie clause reads `(convTarget !== null || convReadEst)` in place of
  `convTarget !== null`.
- Produces (test-only): the `trace` option's per-year record (`~2211-2240`) gains `passLog` (a copy, `passLog.slice()`, allocated only
  when tracing) and `picked` (the index of the forced pick in it, or -1).

- [ ] **Step 1: Add the trace fields, then find a household** among the US snapshot scenarios or `tests/unit/helpers/scan-grid.mjs`'s
  grid, on Task 2b's tree, with ACA on (the forced pick runs only under `usesMagiEstimate`, `~1303`) and the guard off (a single
  phase: phases clear the pass log), with `trace[i].forcedPass` in a plain-fill (unsized) conversion year and an overpay tie in its
  `trace[i].passLog` (`magiStats.forced` misses forced years with `flow >= 0`, so select by the trace). Record it.
- [ ] **Step 2: Write the failing test** `'a forced plain-fill year breaks an overpay tie by the smallest drift'`: on that household,
  `trace[i].picked` is the index of the tied pass with the smallest `drift`.
- [ ] **Step 3:** Run it: fails (the seed pass is picked).
- [ ] **Step 4:** Add `convReadEst` and widen the clause. Run: passes. If Step 1 finds no such household on the grid, say so in the
  notes and test the clause with the smallest constructed case `planTrace` allows; do not skip the code change.
- [ ] **Step 5:** Mark the follow-ups list's "the unsized forced-pick tie (11 of 60 years)" as settled by this task in
  `docs/next-batches-plan.md`. Commit: `S1: an overpay tie in any year whose conversion read the draw goes to the smallest drift`.

### Task 4: measure S1, show the owner, then re-pin and document

**Files:** `tests/snapshots/*` (after the owner's OK), the failing Vitest files from Task 2 Step 6, `tests/plan_off_anchor.js:1-10`,
`docs/next-batches-plan.md`, `docs/architecture/cliff-plan.md`, `magi-iteration.md`, `engine.md:~276-279`, `README.md`,
`src/us/index.html` (badge, and the bracket field's info bubble if its copy says the fill ignores draws), `test-inventory.md`.

- [ ] **Step 1: magiStats.** Before (main) and after (this branch): forced and unresolved year counts over the US snapshot scenarios
  and the `conversion_sizing` grid, through `window.__test_magiStats` (cumulative, planning's own runs included: reset its keys after
  planning and before each measured set) and fresh runs (`__test_simulateRaw`: cached `__test_simulate` results do not count). Also
  record, per set, the passes per converting year and the years that hit the 8-pass cap: `magiStats` misses them with ACA off
  (`forced` / `unresolved` sit behind `usesMagiEstimate`; review C1). Gate: no year at the cap that was not there on `main`. Gate: no more unresolved years; forced increases
  listed with the households.
- [ ] **Step 2: Movers.** `node tests/snapshot.js --only US --dump <dir>/s1-snap --update-nothing`, then `node tests/snapshot.js
  --compare <dir>/main-snap <dir>/s1-snap`; the two tools' `--dump` on this branch and `compare_household_dumps.js` against the
  `main-*` dumps; `tests/plan_off_anchor.js`; `tests/snapshot_ui.js`. Build the movers table
  (scenario, run-out before -> after, first home draw before -> after, end value before -> after, cause) and the earlier-run-out rows
  separately at the top.
- [ ] **Step 3: The combined direction (review L4).** A scratch tree = this branch + `9ab5cad`'s `roth-conversion.js` hunk, built,
  dumped with `--update-nothing` and compared (`--compare <dir>/main-snap <dir>/s1wip-snap`): count up/down/earlier/later. Plus the fixture script on main, S1 and S1+WIP.
- [ ] **Step 4: Benches** against `main` (`--base` a build of `d67ebd3`), one quiet machine, environment recorded:
  `tests/bench_runs_interleaved.js --warm-analysis` (+5%, noise caveat), `tests/bench_solver.js` (+30%), `tests/bench_planning.js`
  (250 ms toggle off / 350 ms on), `tests/conversion_sizing.js` (under 60 s), `tests/bench_optimize.js` (+40%); `tests/yardstick.mjs
  --jobs 2` and `tests/solver_scan.js --sizing --conv-only` deltas. The extra passes of H1 are the expected cost; a failed gate stops
  here for the owner.
- [ ] **Step 5: STOP. Show the owner** the movers table, the earlier rows, magiStats, the combined direction, the fixture before/after
  and the benches. Wait for the owner's accept, or a rejected row (then back to the design with the owner).
- [ ] **Step 6:** After the OK: `npm run snapshot:update`; re-pin each failing Vitest check with a one-line reason comment (the cause
  from the table) and fix counted totals, then run the re-pinned files on Node 22 and Node 24; update `plan_off_anchor.js`'s header
  baseline (review L2). The PR body says Tasks 2 and 3's commits leave unit tests failing until this one (squash on merge if the
  owner prefers).
- [ ] **Step 7: Docs and badge.** `cliff-plan.md` (the fill's `drawBelow`, `estUsed`, the tie; what is in `otherA/B` vs `estTrad`,
  re-checked on this base), `magi-iteration.md` (the conversion depends on `estTrad`; the tie), `engine.md` (the "calls with 0" note),
  `README.md` (a bracket setting fills ordinary income including the year's draws), the info bubble check, badge V151, the new
  results section (commits, movers table, magiStats, benches, fixture), the follow-ups list (spec section 2's statuses for B, C, E,
  F with today's date; A1 done), and the stored-plan note (spec 4.5: plans applied at V140-V150 run under the new fill silently,
  owner-accepted, no compatibility code).
- [ ] **Step 8:** `npm test` green (it includes `tests/cliff_guard.js` and `tests/engine_purity.js`); the relevant UI scripts (`node test_conversion_schedule.js` and the bracket-card scripts) green
  after `npm run build`. Commit: `S1: re-pin and baselines after the fill counts the draw (intended behavior change; owner-approved
  movers) (US V151)`. Opus review of the branch; fix; open the PR (base `main`) with the movers table in the body.

## PR 2 (S2): "convert nothing" in the whole-run pass

Branch `claude/b5-f2-convert-nothing` from `origin/main` after PR 1 merges.

### Task 5: the measurement that decides S2

- [ ] **Step 1:** Scratch build = this base + `9ab5cad`'s ceiling hunk (spec 4.2). On the US snapshot scenarios with the guard on and
  `tests/solver_scan.js --sizing --conv-only`, count the years where the per-year winner is `'none'` while the kept plan's `apply` run converts
  more than $0 that year. The winner comes from `__test_runPlanMode({ planMode: 'choose', plan: <the kept plan with conv {}>,
  planTrace: true })` (`trace[i].conv.winner`), not `__test_planTrace`, which runs with `plan: null` and prices no conversion
  (`install-test-hooks.js:313`, `run-projection.js:162`). Also on the plain base (no WIP hunk).
- [ ] **Step 2:** Record both counts and the households in the results section. If the scratch count is 0: stop S2 here; the figures
  go into PR 3's notes; skip Tasks 6-7.

### Task 6: `cliffConvNone` and the pass walking it

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`~1616-1620` record; `~2278` return; `sizePass` `~2556-2590`)
- Test: `tests/unit/us/conversion-choose.test.js`, `tests/unit/us/conversion-plan.test.js` (or a new `conversion-none.test.js`)

**Interfaces:**
- Produces: `cliffConvNone` on a `choose` run with sizing (non-enumerable, like `cliffConvShortlist`): ascending array of Partner A
  ages whose `won.target === 'none'`. `sizePass` walks `shortlist` as today, then `cliffConvNone` with the budget left (a shared
  `tried` count against `budget`), each a trial `{ ...conv, [age]: 'none' }` accepted only by `greedyAccepts`; an age already in
  `conv` from the first walk is skipped. `report.sized` gains `noneProposed` (the list's length) and `noneTried`. `convIntents.none`
  counts as now.

- [ ] **Step 1: Failing tests.** (a) `'cliffConvNone lists the ages whose winner is none'`: on the household Task 5 found, equals the
  `planTrace` ages with `conv.winner === 'none'`; a `choose` with `conv` null and an `apply` run record none (`undefined`). (b) `'a kept
  none target converts 0 at its age'`: the planning's kept `plan.conv` holds `'none'` at an age, that row's conversion is 0, and
  `report.sized.convIntents.none > 0`. (c) `'a full budget tries no none age'`: with `ctx.test.convRunBudget` equal to the shortlist's
  length, `report.sized.noneTried` is 0, the kept `plan.conv` holds no `'none'`, and `noneProposed` equals the choose run's
  `cliffConvNone.length`.
  Today's checks at `conversion-choose.test.js:~323-324` stay as they are.
- [ ] **Step 2:** Run: (a)-(c) fail. Implement. Run: pass; the whole `npm run test:unit`; shuffle and Node 24 for the new cases.
- [ ] **Step 3:** Commit: `S2: the whole-run sizing pass can turn a year's conversion off ('none' after the shortlist)`.

### Task 7: gates, movers, docs

- [ ] Same shape as Task 4 Steps 1-8, against PR 1's merge and against the `main-*` dumps (`d67ebd3`, per household through
  `compare_household_dumps.js`): magiStats, movers (expected few: only households with a `'none'`
  winner and budget left), benches, **STOP for the owner**, then baselines, `cliff-plan.md` (the none list; "`none` is always 0"
  goes), `README.md` if the card's text changes, badge V152, results section, A2 done. Opus review; PR.

## PR 3 (S3): the ACA line caps only a year at or under it

Branch `claude/b5-f3-aca-over-line` from `origin/main` after PR 2 (or PR 1, if S2 closed) merges.

### Task 8: the rule

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`conversionMagiCeiling`, from `~86`; the hunk at `~111-139` on `main`)
- Create: `tests/unit/us/conversion-aca-ceiling.test.js` (from `9ab5cad`)

- [ ] **Step 1:** `git checkout 9ab5cad -- tests/unit/us/conversion-aca-ceiling.test.js`; run it: the "over the line" and the
  two-return cases fail.
- [ ] **Step 2:** Apply `9ab5cad`'s `roth-conversion.js` hunk by hand (`allowAca` for the per-return room; the household line only
  when `preConvMagi <= line`; its comment). Run: passes. `npm run test:unit`: list the failures (the WIP's 13, less any already moved).
- [ ] **Step 3:** Commit: `S3: the ACA 400% line caps a conversion only while MAGI is at or under it`.

### Task 9: gates, the WIP comparison, the keep floor, docs

**Files:** as Task 4, plus `tests/conversion_sizing.js` (the floor), `docs/architecture/us-health.md:~16`.

- [ ] **Step 1:** magiStats as Task 4 Step 1 (the second jump at the line, spec 4.3).
- [ ] **Step 2:** Movers against the parent, against `main-*` (`d67ebd3`) and against the `wip-*` dumps; a row earlier than both
  `main` and the WIP is flagged at the top. The fixture against main, the WIP and each PR so far.
- [ ] **Step 3:** Benches as Task 4 Step 4. **STOP for the owner.** After the OK: baselines; re-pin each check with a reason.
- [ ] **Step 4: The keep floor (D).** `conversion_sizing.js` fails when the kept count is below `FLOOR`, a constant = this tip's kept
  count less 10%, rounded down (comment: the count and the date). Check it fails with `FLOOR` set one above the count, then restore.
- [ ] **Step 5: Docs and badge.** `us-health.md` (the ceiling's over-the-line rule), `magi-iteration.md` (the second jump; after S1 the
  jump is between 0 and the fill's room), `cliff-plan.md`, `README.md` (ACA line wording), next badge, results, A3 done.
  `npm test`; UI scripts; commit; Opus review; PR.

## PR 4 (S4): the card names the limit; the `cliffChoice` test

Branch `claude/b5-f4-card-note` from `origin/main` after PR 3 merges.

### Task 10: `convHeldBy` on the row

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`conversionMagiCeiling` records which ceiling bound)
- Modify: `src/us/core/projection/run-projection.js` (the row build at `~2190-2200`)
- Modify: `tests/engine-purity.json`
- Test: `tests/unit/us/conv-held-by.test.js`

**Interfaces:**
- Produces: a module scratch `CEIL_OUT = { kind: '' }` in `roth-conversion.js`, overwritten by every `conversionMagiCeiling` call:
  `'aca'` when the ACA line (household or per-return) set the minimum, `'irmaa'` when an IRMAA tier did, `''` when none bound, set
  in both branches including the two-return early return (`~122`); read right after the call and kept in a per-pass local
  (registered in `engine-purity.json` as `"scratch"`).
  Row field `row.convHeldBy` (`'aca' | 'irmaa' | 'stayUnder' | 'sized' | 'balance'`), set only on a conversion-window year whose
  conversion is more than $1 below the bracket fill at the kept pass's `estTrad`: `'stayUnder'` for a phased `under` year, else
  `'sized'` when `convTarget !== null`, else the kept pass's ceiling kind when `magiSafeRoom` bound, else `'balance'` when
  `convertible` bound. `convertible` is a block `const` in the conversion block (`~840`): hoist it to a per-pass `let` the row build can
  read (reset with the pass). The comparison fill is `solveRothConversionTop(ctx, profile, convertible, year, pct, estTrad)` with `pct` the
  bracket `convBracketFor(ctx, age)` (Task 2), never with
  `maxAvailable` Infinity (the bisection returns 0 there). It is computed only at the row build of a conversion-window year where
  something below the fill could bind (a phased `under` year, `convTarget` set, or `magiSafeRoom` or `convertible` under the year's
  conversion cap), so a year converting its full fill pays nothing. It runs in Monte Carlo and historical rows too: Task 10 Step 3
  measures it.

- [ ] **Step 1: Failing tests** on the fixture (its state; the rows of the dashboard run, `planMode` as the dashboard uses):
  `'convHeldBy names the limit in each held year'`: on PR 3's tree the fixture's 62-66 rows are `'stayUnder'` if they still read
  "stayed under ACA 400% line" (check first and pin what the tree gives, with the reason); a year whose conversion is the full fill has
  no `convHeldBy`. A second household: ACA on, over-65 IRMAA tier binding: `'irmaa'`. Review Focus case: one run with a stay-under,
  a sized and an ACA year, each named.
- [ ] **Step 2:** Run: fail. Implement. Run: pass; `npm run test:unit`; `tests/engine_purity.js`.
- [ ] **Step 3:** Snapshots: every mover must differ only by the new `convHeldBy` field (prove it with a compare that strips the field:
  0 other differences); the per-household dumps against PR 3's merge and `main-*` identical. Benches as Task 4 Step 4 against PR 3's
  merge (the row-build fill is the cost to watch), and `magiStats` and the pass counts unchanged. STOP for the owner with that proof and the benches, then baselines. Commit: `S4: rows record which limit held the conversion`.

### Task 11: the card's line and the `cliffChoice` test

**Files:**
- Modify: `src/us/ui/results/roth-optimizer.js` (`annotateRothOptimizer`, or `renderConversionSchedule` in the open-card pass; it
  reads the dashboard run `selected`). The shared card renderer `src/shared/ui/results/roth-optimizer-card.js` is not changed
  (Canada).
- Modify: the card markup in `src/us/index.html`: one `<p id="rothOptimizerHeld">` under the table, hidden by default
- Modify: `test_conversion_schedule.js` (or a new root `test_conv_held_note.js`)

**Interfaces:**
- Consumes: `row.convHeldBy` (Task 10).
- Copy (spec 4.4): `The ${limit} holds your conversions at ${ages}, so the bracket setting changes little here.` with `limit` from
  `{ aca: 'ACA 400% line', irmaa: 'IRMAA tier', stayUnder: 'cliff plan\'s stay-under', sized: 'tax-aware sizing', balance:
  'convertible balance' }`, `ages` from a new `export function ageRanges(ages)` in `roth-optimizer.js` (ascending integers to
  `"60-66"`, `"59, 61-63"`; a single age alone; the schedule itself still prints one row per age), with a Vitest case for it; with two or more kinds the
  most frequent (ties to the order above) and the sentence starts `Mostly, the`. No line when no row has `convHeldBy`. Dimmed with
  the card in the light render.

- [ ] **Step 1: Failing UI test:** on the fixture the line is visible and names the ACA line (or what Task 10 pinned) with the ages;
  on a household no limit holds (a single, 60, retired at 60, ACA off, traditional 1,500,000, conversions 60-62 at 12%, life 70:
  under 63 there is no IRMAA ceiling and the balance cannot bind) it is hidden; the 390x844 check
  (`scrollWidth > clientWidth` is false); the conversion schedule's why column shows "Filled to ..." on a phased fill year that converts
  (D; only that branch can appear: a stay-under year converts $0 and is not listed; a household from the gap cases, the scan grid or
  the fixture, else a constructed row in a Vitest case, noted).
- [ ] **Step 2:** `npm run build`; run the script: fails. Implement. Run: passes. `node tests/snapshot_ui.js`: movers only from the new
  hidden id; the fixture script before and after (review M7); the per-household dumps against `main-*` unchanged from Task 10; STOP
  for the owner, then baselines.
- [ ] **Step 3: Docs and badge.** `README.md` (the card's line), `docs/architecture/inputs-and-ui.md` or `cliff-plan.md` (where the card is
  described), `test-inventory.md`, badge, results section, A4 and D done; the follow-ups bullet of 2026-10-31 marked complete.
  `npm test`; `npm run test:ui`; commit; Opus review; PR.
