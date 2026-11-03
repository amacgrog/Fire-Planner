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

### Task 2f: the IRMAA tier holds within a year (owner decision 2026-11-01; spec 4.1 "The IRMAA tier within a year")

Replaces 90f9e8b's damping (Task 2d) and the uncommitted Task 2e guard. Why: the tier the conversion ceiling caps at is read from
`preConvMagi`, whose `estGain` is the previous pass's realized gains, which include the sale that paid the previous conversion's
tax (about 17-20 cents per dollar converted). A seed about 4x the margin too low crosses the tier line on the pass-0 -> 1 step, at
weight 1 under every rule (`main`'s included), and the year then converts up to the next tier and confirms it. No estimate-update
rule can act on it (`fable-path-report.md` sections 1-2); 90f9e8b passed the tier test only through the seed path from ages 65-67,
and its damping tripled the converting cap years (9/148/320 -> 26/448/842). The fix is a pass that converts nothing: its realized
MAGI is the year's no-conversion MAGI, the one honest test of which tier the year sits in.

This task's plan was checked by an independent Opus review that enumerated the sites from the code before reading this text
(`.superpowers/sdd/2026-10-31-b5-followups/task-2f-plan-review.md`): its enumeration matches the table below, and its fixes are
folded in (C1, I1-I6, M1-M7, cited where they apply).

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`conversionMagiCeiling`, `~87-150`), `src/us/core/projection/run-projection.js`
  (the ceiling call `~660-685`, the conversion block `~836-880`, the estimate update `~1181-1283`, the settlement and phased block
  `~1490-1800`, every site in the table below, the trace row `~2353`), `src/shared/core/projection/run-context.js` (`NO_TEST`),
  `src/us/core/projection/planning.js` (`storeRunContext`'s test literal), `src/us/core/test-hooks.js` (the `replayCheck` binding and
  its `assign` function), `src/us/ui/install-test-hooks.js` (the hook), the US stats object (`US_STATS`), `tests/engine-purity.json`,
  `CLAUDE.md` (the MAGI-iteration invariant), `docs/architecture/magi-iteration.md`, `docs/architecture/us-health.md`,
  `docs/architecture/engine.md` (if it lists the ceiling's inputs), `docs/architecture/test-inventory.md`.
- Test: `tests/unit/us/conversion-fill-draw.test.js`; new structural guard `tests/estimate_sites.js` (in `npm test`'s chain after
  `tests/engine_purity.js`); new scan script `tests/replay_check.js` (not in `npm test`; run by Steps 4-5 and the re-measure).
- Starting point: discard the uncommitted Task 2e guard (`git checkout -- src/us/core/projection/run-projection.js
  src/us/core/withdrawals/roth-conversion.js tests/engine-purity.json`; its diff is kept in the scratchpad as `task-2e-wip.diff`).
  The Fable prototype's diff (`<scratchpad>/fable-proto-P1.diff`, at 5c2f27d) is a reference, not a patch to apply: it misses site
  P4, the gate (rule 0), the converged-probe release and the trace row; the site table here is the authority.

**Interfaces:**
- Produces: `conversionMagiCeiling(ctx, { ..., irmaaHold = Infinity, irmaaHoldA = Infinity, irmaaHoldB = Infinity })`, all in the
  engine's MAGI. Household branch: `line = magiForIrmaaLine(irmaaTierCeiling(...), ssH, filing)`, `CEIL_OUT.line = line`, the cap is
  `Math.min(line, irmaaHold)` (with Infinity the very double of today). Two-return branch: `la = irmaaRoomFor(ctx, preMagiA, ...)`,
  `CEIL_OUT.lineA = la`, `allow(Math.min(la, irmaaHoldA), preMagiA, shareA)`; the same for B.
- Produces: `export const CEIL_OUT = { line: NaN, lineA: NaN, lineB: NaN }` in `roth-conversion.js`, all three set to NaN on entry to
  `conversionMagiCeiling` (a scratch: read right after the call, keep nothing), registered `"CEIL_OUT": "scratch"` in
  `tests/engine-purity.json`.
- Produces: three year-loop scalars `irmaaHold`, `irmaaHoldA`, `irmaaHoldB` (Infinity = no hold), declared beside `secEst`
  (`~531`, inside the year so each year starts at Infinity). They are iteration bookkeeping, not year state: NOT in
  `scalarSnapshot` (a rewind each pass would erase the line the previous pass found). Unlike `secEst` they are an input to the
  pass (they set the ceiling), so they go everywhere `estTrad` goes, site by site per the table.
- Produces: a per-pass `ceilRead` (false at each pass start, beside `convReadEst`'s reset): true where the conversion is solved under
  `magiSafeRoom` (the plain fill: `convertsThisYear`, not a stay-under trial, no `rothAmountByAge` age, `convertible > 0`,
  `convBracketFor(ctx, age) !== 0`; and the sized path's fallback when `resolveConvTarget` returns `amount < 0`). Derived from the
  pass's inputs, so the replay argument is unaffected (review C1).
- Produces: secant-pair scalars `secHold`, `secHoldA`, `secHoldB` beside `secHc` (pair bookkeeping, not pass inputs: not carried in
  records; reset wherever `secEst = secReal = NaN` is, by the same statement) (review I6).
- Produces (test-only): the replay check (review I3, I4):
  - `ctx.test.replayCheck` (default false): a key of BOTH the frozen `NO_TEST` (`run-context.js`) and `storeRunContext`'s test literal
    (`planning.js`), in the same position (one context shape), read there from a `test-hooks.js` binding set by an `assign...`
    function; `w.ctx()` carries it.
  - Counters declared in `US_STATS` (not created at run time): `replayMismatch`, and `replayChecked` per kind as separate numeric keys
    (`replayCheckedForced`, `...R2` ... `...R6`, `...SeedP1` ... `...SeedP5`, `...S1`, `...P4`). Every bump is guarded on `ctx.stats`
    being non-null.
  - A scalar `replayRec` set at every replay site (R2-R6) to the record it repeats (R1 uses the existing `forcedPick`), cleared
    where `replaying` is cleared.
  - What it compares, with `Object.is` so Infinity and NaN compare exactly: (i) on a replayed pass and the forced pass, the holds
    entering the pass against the record's stored holds; (ii) on pass 0 of a seeded phase, the entering holds against the seed source
    (`naturalRec`'s for P2/P3/P5, Infinity for P1, the pre-site live values for S1/P4); (iii) on a replayed pass, `conversionAmount`
    and the post-settlement `realizedMagi` against the record's `conversion` / `realized`; on the forced pass, `conversionAmount` and
    the pre-settlement MAGI (`realizedPre`, below) against the passLog entry's. The replay comparison runs after the settlement and
    **before** the phased block (R2's replay clears `replaying` inside it, `~1770`).
  - The `passLog` entry gains `conversion: conversionAmount` and `realizedPre` (two fields on an object already allocated).
  - `window.__test_replayCheck(on)` in `src/us/ui/install-test-hooks.js` sets the binding for the store's runs.

**The rule.**
0. The gate (review C1). The holds act only on a pass with `ceilRead` true. The ceiling call passes the holds only then (Infinity
   otherwise), so a year that converts nothing, a split phase, a stay-under trial, a sized target, bracket 0 and a conversions-off
   household compute exactly today's doubles; `estUsed` is never turned on by a hold.
1. After the ceiling call (`~664`), when `ceilRead`: `if (CEIL_OUT.line < irmaaHold) irmaaHold = CEIL_OUT.line;` and the A / B twins
   (a `<` against NaN is false). A down-move is always taken.
2. The probe release, when `ceilRead` and `conversionAmount === 0` and the hold bound this pass (`irmaaHold < CEIL_OUT.line`; per
   return for A / B). The no-conversion MAGI is the pre-settlement realized MAGI (review I1; `realizedMagi` itself is declared
   later, `~1492`, and is rewritten by the 162(l) settlement): `realizedPre = (seLive ? magiBase0 - (seRealA + seRealB) : magiBase0) +
   traditionalGross + taxableGainGross`, plus `inhRealA + inhRealB` when `inh !== null` (the same terms as the line at `~1492-1493`).
   Two-return: `[ma, mb] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB)`, only when a per-return hold
   bound (the one allocation, rare). If `realizedPre > irmaaHold`: `irmaaHold = Infinity` (each return against its own hold).
   Where (review M3): compute a `released` flag before the update's `if` (`~1186`), whose condition becomes `(unconverged ||
   released) && !forcedPass && !replaying && phasePass < MAGI_ITER_MAX - 1`. So the release covers both an unconverged pass and one
   that would otherwise end the phase converged (a year that truly sits higher then converts to the higher line instead of ending at
   0). At `phasePass === MAGI_ITER_MAX - 1`, on a forced pass and on a replay nothing releases. The later readers of `unconverged`
   (the seSearch build, the switch, the forced pick) are skipped on a releasing pass by the update's `continue`.
3. The secant pair (review I6): at each update that sets the pair (`secEst = estTrad`), also `secHold = irmaaHold` (and A / B); the
   secant and the kink logic use the pair only when `Object.is(secHold, irmaaHold)` and the A / B twins. A release or a down-move then
   drops the pair by itself; a first binding does not need to (the cap is `min(line, hold)` on both sides of it).
4. The secant branch's weight returns to b50d53b's: `w = 1` for the non-draw estimates in `convReadEst && !usesMagiEstimate`
   (revert 90f9e8b's `w = phasePass >= 3 ? 0.5 : 1` there); its comment names the hold as the tier protection. The ACA branch is
   unchanged.
5. Hot path: no allocation per pass outside the rare two-return release; nothing runs when `ceilRead` is false or every hold is
   Infinity.

**The sites (at 5c2f27d; find each by its anchor, not its line number).** Every site where the estimates are saved, restored or
re-seeded. "Carry" = the three holds go in or come out with the record, exactly like `estShareA`.

| # | ~Line | Anchor | Kind | The holds |
|---|---|---|---|---|
| Y0 | 531 | `let secEst = NaN,` | year start | declared here at Infinity (reset every year by scope) |
| W1 | 1184 | `passLog.push({ estTrad,` | record write | carry (plus `conversion`, `realizedPre` for the check) |
| W2 | 1600 | `const natRec = (cliffCost, score, order) => ({` | record write | carry |
| W3 | 2129 | `trialRecs.push({ plan: yearPlan, estTrad,` | record write | carry |
| W4 | 2353 | `estTrad,` in the trace row literal (before `convertible: convertibleTr,`) | record write (test-only) | carry (review I2) |
| U1 | 1181-1283 | `if (unconverged && !forcedPass && !replaying && phasePass < MAGI_ITER_MAX - 1)` | estimate update | the `released` flag and condition (rule 2), pair (rule 3), weight (rule 4) |
| S1 | 1397 | `estTrad = realizedTrad;` in the `seSearch(...)` hold switch | same phase continues | **kept** (the switch continues the phase from realized values that include the conversion's tax; dropping the hold re-opens the hole). Marked `// hold: kept` |
| R1 | 1420 | `estTrad = pick.estTrad;` (forced pick) | exact replay | restore from `pick` |
| P1 | 1735 | `estTrad = prevDiscTraditional;` (the sized phase) | fresh re-seed from the year's start seeds | reset to Infinity (choose/apply parity: apply's first phase of a sized year starts with no hold) |
| R2 | 1781 | `estTrad = r.estTrad;` (split pass that drew nothing) | exact replay | restore from `r`; `replayRec = r` |
| R3 | 1870 | `estTrad = naturalRec.estTrad;` (order not kept, no trials) | exact replay | restore from `naturalRec`; `replayRec` |
| P2 | 1984 | `estTrad = naturalRec.realizedTrad;` (split partner B start) | new phase seeded from a record's realized values | from `naturalRec` |
| R4 | 2018 | `estTrad = best.estTrad;` (split stage, best is not the last) | exact replay | restore from `best`; `replayRec` |
| P3 | 2043 | `estTrad = naturalRec.realizedTrad;` (split stage start) | new phase seeded from a record | from `naturalRec` |
| P4 | 2068 | `estTrad = realizedTrad;` (order phase start) | new phase seeded from the live pass | **kept** (in choose the live pass is the one `naturalRec` was just built from; in apply no `naturalRec` is built here, so "from naturalRec" would read a stale record). Missing from the prototype. Marked `// hold: kept` |
| R5 | 2100 | `estTrad = naturalRec.estTrad;` (apply fallback) | exact replay | restore from `naturalRec`; `replayRec` |
| R6 | 2143 | `estTrad = best.estTrad;` (trial winner replay) | exact replay | restore from `best`; `replayRec` |
| P5 | 2169 | `estTrad = naturalRec.realizedTrad;` (trial start) | new phase seeded from a record | from `naturalRec` |

The two `estTrad = next;` lines (`~1228`, `~1269`) are the update itself (U1), not sites. The independent review confirmed this table
against its own enumeration (12 runs, 4 literals with W4). If you find an estimate assignment or a record literal with `estTrad` as a
property key that is not in this table, stop and report it before coding.

Why a record's post-pass hold replays exactly: the pass computes `line` from its estimates and caps at `min(line, holdIn)`; the
record stores `holdOut = min(holdIn, line)`; a replay computes the same `line` and caps at `min(line, holdOut) = min(line, holdIn)`.
A releasing pass always takes the update branch (rule 2), so it is never a phase's final pass and never a record's pass. Say this in
the code comment at W2.

- [ ] **Step 1: The structural guard first** (`tests/estimate_sites.js`, plain Node, reads `src/us/core/projection/run-projection.js`
  as text; review M2):
  - (a) For every statement matching `\bestTrad = ` other than the declaration `let estTrad =` and the update's `estTrad = next;`,
    take the innermost brace-matched block containing it, through its `continue;`. That block assigns `irmaaHold = `,
    `irmaaHoldA = ` and `irmaaHoldB = `, or carries the comment `// hold: kept` (anywhere in the block: in P4 a nested
    `if (planMode === 'choose') { ... }` comes before `estTrad =`). Key on `estTrad`, not `estShareA`: P4 assigns no `estShareA`,
    which is how the prototype missed it.
  - (b) Every object literal with `estTrad` as a property key (shorthand `estTrad,` / `estTrad }`, or `estTrad:`) lists
    `irmaaHold`, `irmaaHoldA` and `irmaaHoldB`. A call argument inside a literal (`~866`, `solveRothConversionTop(..., estTrad)`) is
    not a property key and is not counted.
  - (c) Fail on any other assignment form to `estTrad` (`+=`, destructuring) outside the update.
  - (d) Every block containing `replaying = true;` and the block containing `forcedPass = true;` contains an `estTrad = ` run and a
    `replayRec = ` assignment (the forced block: `forcedPick = `) (6 blocks), so a replay that restores through a helper fails.
  - (e) It prints the counts it checked and fails if one differs from the table's: 12 runs, 4 literals, 6 replay blocks. A site added
    later fails until the table and the guard are updated together.
  - Run it: it fails (no holds yet). Self-test on a scratch copy (do it by hand and say so in the report): it passes with the holds
    added and fails with one site's line removed, with a literal's hold removed, and with a `replayRec` removed.
- [ ] **Step 2: The replay check before the holds (review M6).** Add the replay-check plumbing (the interface bullet) and
  `tests/replay_check.js`: it runs, with `__test_replayCheck(true)` and through the uncached paths (`__test_simulateRaw`, forced
  replanning each household: the store's `simulate` and `refreshCliffPlan` caches count nothing, review I3 (d)), (i) every US snapshot
  scenario, (ii) the `conversion_sizing` grid, (iii) a lever variant of that grid (`withdrawalMixEnabled: true`; the single-couple
  and MFJ households at 62 and 66, conversions on; review I5), and (iv) the phased fixtures of `plan-search`, `order-lever`,
  `two-return-split`, `split-order-floor`, `gains-capped` and `stored-plan` (through the hooks, rebuilt in the script); it prints
  `replayMismatch` and every `replayChecked*` count per set, and exits 1 on a mismatch. With no holds yet (the holds are Infinity
  everywhere), run it on the branch: `replayMismatch` 0 in every set, so a later mismatch is the holds' doing. Record the per-kind
  checked counts: they show which data reaches which site.
- [ ] **Step 3: Failing tests** in `tests/unit/us/conversion-fill-draw.test.js`:
  - (a) direct: `conversionMagiCeiling` with `irmaaHold` below the computed line returns the hold-capped ceiling; with Infinity, the
    very double of a call without the argument (household and two-return branches).
  - (b) the release: `single 58; 500k; 2000k; 60k; none` at 71 (and/or `HoH 66; 1500k; 2000k; 130k; none` at 71; premise checked with
    `rothBracketByAge` pinned to 0, as the tier case does: the no-conversion MAGI is over the lower line): the year's MAGI is above
    the lower line and at or under the higher line, and it converts more than $0.
  - (c) the crawl (review M1): a non-ACA secant year with no IRMAA ceiling in play (under 63: the engine wiring household at 60-62,
    or `std G two returns 66 irmaa smooth` years 0-1) settles in fewer than `MAGI_ITER_MAX` passes with the draw and gains estimates
    within `MAGI_ITER_TOL`.
  - (d) the converged probe (rule 2's second case): a household whose probe pass would converge at 0 while its no-conversion MAGI is
    over the held line (construct it from (b)'s household by shrinking the previous conversion, or find one); evidence from the trace
    row's holds (W4). If none is in reach, a synthetic case the trace can show, and say so.
  - (e) the gate (review C1): a conversions-off household at 63+ and the same household with conversions on outside its window give
    rows `toStrictEqual` to the same run at 5c2f27d's rule; test it as equality between two runs in one process, the holds forced off
    by a test switch (`ctx.test`, e.g. `irmaaHoldOff`, a key of both test literals like `replayCheck`) against the holds on.
  - (f) replay exactness: with `ctx.test.replayCheck` on, the tier household, the two release households and the targeted cases
    below give `replayMismatch` 0 and a non-zero `replayChecked*` count for the kind each targets.
  - Targeted cases for the sites the scan data cannot reach (review I5): S1 (a household with `seAllowA` at 63+ that reaches the
    162(l) switch in a converting year; the E1c fixtures may serve), R1 (an ACA forced year at 63-64 with a finite hold), R2 (apply
    with a split intent at an age whose split pass draws nothing, e.g. a year funded by income). Each asserts its `replayChecked*`
    count is above 0 and the mismatch count is 0.
  - The 90f9e8b tier case stays unchanged and must pass.
  - Run them: (a)-(d) and the targeted cases fail or cannot reach (no holds yet); (e) passes trivially.
- [ ] **Step 4: Implement** rules 0-5 and the sites, in table order. Run Step 1's guard, Step 3's file (also `--sequence.shuffle`) and
  Step 2's scan: all pass, `replayMismatch` 0 in every set.
- [ ] **Step 5: Mutation check: a reach proof for each site (review I4).** On a scratch worktree (`git worktree add
  <scratchpad>/t2f-mut HEAD`, never in the branch worktree), for each site in turn set that site's holds to a sentinel (`1`) instead
  of its handling (for a record write, store the sentinel; for a "kept" site, assign the sentinel), rebuild, and run Step 2's scan
  and Step 3's file. Each mutation must be caught by the hold comparison of the replay check (a replayed or seeded pass whose
  entering holds differ from its source) or a test. A site no mutation is caught at gets a targeted Vitest case that reaches it, or,
  if no input can reach it, a written proof naming why. Record a table: site, the data set that reached it (the `replayChecked*`
  counts), caught by. Remove the scratch worktree.
- [ ] **Step 6: The whole-set replay scan on the real change**: Step 2's scan on the branch: `replayMismatch` 0 in every set, every
  `replayChecked*` kind above 0 in at least one set (or covered by its targeted case); also over `solver_scan --sizing --conv-only
  --limit 120` households (both modes). Record the counts.
- [ ] **Step 7: Gates before review**: `npm run test:unit` (the 8 known files the only failures, same counts as before), `node
  tests/engine_purity.js`, `node tests/estimate_sites.js`, `node tests/cliff_guard.js`, `node tests/two_return_magi.js`,
  `node tests/aca_magi_iteration.js`. The conversions-off check (review C1): the Task 1 path fingerprints of every conversions-off
  household (the `conversion_sizing` grid with conversions off, through `--dump`) equal 5c2f27d's exactly. (**Restated, owner
  2026-11-01**, after Task 2g: the holds and the release change no conversions-off row. The cliff plan runs with conversions off
  too, so Task 2g's superset candidate legitimately moves 11 of 768 smooth rows, listed as movers in the results; with the
  superset push disabled the holds and the release give 0 of 768.) The quick cap-year count
  (`<dir>/magistats.js`): snapshot and `conversion_sizing` grid. The prototype measured 72 (9) / 0 new and 321 (128) / about 10 new,
  none converting, without the gate and without the converged-probe release (review M4): re-measure, do not assume; the trace's
  `passes` is a phase sum, so probe passes in fill trials can raise class-D counts (review M7): classify any new cap year. The tier
  household: age 68 converts about $20 under its own line in about 4 passes; ages 65-67 near 7 / 6 / 6.
- [ ] **Step 8: Docs**: `CLAUDE.md`'s MAGI-iteration invariant names the holds (carried like an estimate, kept at the seHeld switch
  and the order start, reset at the sized phase) and `tests/estimate_sites.js` (review M5); `magi-iteration.md` (the hold, the gate,
  the probe release, the secant pair's `secHold`, why it is carried like an estimate and not in `scalarSnapshot`, the replay argument,
  the site table's kinds, the guard and the replay check); `us-health.md` (the IRMAA ceiling: the tier the year's no-conversion MAGI
  sits in, held within a year); `engine.md` if it lists the ceiling's inputs; `test-inventory.md` (`estimate_sites.js`,
  `replay_check.js`). Spec 4.1 already carries the rule.
- [ ] **Step 9: Commit**: `S1: the IRMAA tier holds within a year; a pass converting nothing releases it (replaces the 90f9e8b
  damping)`. Then the task review (Opus), push, and Task 4 Steps 1-4 re-measured in full (the re-measure brief lists the Fable
  report's section 6 checks, Step 7's conversions-off fingerprint check, and `replayMismatch` 0 over the full solver_scan grid).

### Task 2g: the plan search's superset candidate, and the tighter release (owner 2026-11-01)

Built after the Task 4 re-measure of 4772ea3 found 3 solver_scan rows depleting earlier than main (`single 66; 1500k; 300k; 130k`,
smooth, none / rule55 / sepp: 85 / 82 against main's 86 / 83). The trace (`.superpowers/sdd/2026-10-31-b5-followups/task-2g-trace-report.md`)
found it a consequence of Task 2f, not a defect: main's IRMAA stay-unders at 66, 68 and 70 won against natural years crawled to the
top tier, and against the honest natural years they lose `choose`'s keep test by $681-$2,825 (a near tie decided by a lambda whose
samples are all moved), while the whole run holding them lasts a year longer. What was built:
- **The superset candidate** (`computeCliffPlan` stage 0): `choose` also records `cliffAltIntents` (per year the winner, else the
  `ok` trial with the lowest cliff cost); when it holds more intents than `cliffIntents` it is one more `all` candidate through one
  `apply` run, kept only by `planCandidateBetter`. The greedy choice and "apply replays choose" are unchanged; stage 1 does not get it.
- **The tighter release** (owner-approved): rule 2 releases only a hold that set the conversion ceiling (`CEIL_OUT.held` /
  `heldA` / `heldB`); before, an ACA year whose 400% line was the tighter cap released and re-ran for nothing (74 of 100 converged
  releases in the re-measure), changing no row.
- Tests: `tests/unit/us/plan-superset.test.js` (the trace's household: 86 / 83 on every election); two cases in
  `conversion-fill-draw.test.js` (the held flags; an ACA-bound year keeps its hold, the passes and row of the holds-off run);
  `objectives.test.js`'s stage-0 candidate pin takes the second `all`. Docs: `cliff-plan.md`, `magi-iteration.md`, spec 4.1.

### Task 4: measure S1, show the owner, then re-pin and document

**Files:** `tests/snapshots/*` (after the owner's OK), the failing Vitest files from Task 2 Step 6, `tests/plan_off_anchor.js:1-10`,
`docs/next-batches-plan.md`, `docs/architecture/cliff-plan.md`, `magi-iteration.md`, `engine.md:~276-279`, `README.md`,
`src/us/index.html` (badge, and the bracket field's info bubble if its copy says the fill ignores draws), `test-inventory.md`.

- [ ] **Step 1: magiStats.** Before (main) and after (this branch): forced and unresolved year counts over the US snapshot scenarios
  and the `conversion_sizing` grid, through `window.__test_magiStats` (cumulative, planning's own runs included: reset its keys after
  planning and before each measured set) and fresh runs (`__test_simulateRaw`: cached `__test_simulate` results do not count). Also
  record, per set, the passes per converting year and the years that hit the 8-pass cap: `magiStats` misses them with ACA off
  (`forced` / `unresolved` sit behind `usesMagiEstimate`; review C1). Gate: no year at the cap that was not there on `main` (**restated, owner 2026-11-01**: no kept phase accepted unconverged, a drift over $1 and not forced, that `main` did not have; a year's `passes` sums every phase, so a converged natural phase plus a converged stay-under trial reads 8 or more, and the old wording fired on every held year: at bd7ea0b 5 / 94 such years, snapshot / scan grid, against main's 77 / 1,137). Gate: no more unresolved years; forced increases
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
  **Accepted** (owner, 2026-11-01, at bd7ea0b, after the Fable analysis `fable-bd7ea0b-report.md`) with two gates restated: the cap
  gate (Step 1) reads "no kept phase accepted unconverged (drift over $1, not forced) that `main` did not have", since a year's
  pass count sums its phases; the conversions-off check (Task 2f Step 7) reads "the holds and the release change no conversions-off
  row", with the 11 superset rows listed as movers. Fable's 8 follow-ups are recorded (Task 4b below, spec 4.2 and 4.3, and the
  follow-ups list of `docs/next-batches-plan.md`).
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

### Task 4b (first task of PR 2): the cap pick for non-ACA years (Fable bd7ea0b follow-up 1; owner 2026-11-01)

S1 leaves a year without an ACA premium that reaches `MAGI_ITER_MAX` on whatever pass ran last: the smallest-drift pick exists only
inside the forced pass, behind `usesMagiEstimate` (`run-projection.js` ~1551-1585), and the `passLog` is pushed only behind
`usesMagiEstimate` too (~1284), so a non-ACA year logs nothing. Worst case: smooth `HoH 62; 1500k; 300k; 130k` at 70, a slack-fill
period-4 cycle kept at a $50,461 drift (S1 left 94 years over $1 in the scan grid, 20 over $1,000).

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (the `passLog` push ~1284; a new cap-pick block beside the forced pick ~1551; the
  replay-check block ~1738 and the hold check ~698; the trace record ~2573-2604; `magiStats` bump ~2423)
- Modify: `src/us/core/projection/engine-state.js` (`magiStats` gains `capPicked`)
- Modify: `tests/estimate_sites.js` (the new restore block is checked like the forced one), `tests/engine-purity.json` only if a new
  module-level mutable appears (none expected)
- Test: `tests/unit/us/conversion-fill-draw.test.js` (new cases at the end), `tests/replay_check.js` if its expected keys list needs
  the new key
- Docs: `docs/architecture/magi-iteration.md` (the site table and the cap section)

**Interfaces:**
- Produces: `magiStats.capPicked` (years whose kept pass is a cap pick, counted at the kept phase like `forced`); the year trace
  (`planTrace`/`trace`) gains `capPicked: boolean` and its `picked` index also names the cap pick's `passLog` entry;
  `hookStats.replayCheckedCapPick` and replay-check key `'capPick'`.
- Consumes: `convReadEst`, `passLog`, `forcedPick`'s restore list (estTrad, estGain, estSeA, estSeB, estInhA, estInhB, estShareA,
  irmaaHold, irmaaHoldA, irmaaHoldB).

**The rule.** At the cap (a pass that ends `unconverged` with no update left: the point the forced pick is reached today), in a year
with `convReadEst` and `!usesMagiEstimate`, re-run once the logged pass with the smallest `drift` (first logged wins a tie), with its
estimates and holds restored exactly as the forced pick restores them. The re-run is the kept pass: it takes no convergence decision,
charges what it computes (no refund: no ACA premium was estimated), and is not counted as forced or unresolved. ACA years
(`usesMagiEstimate`) keep the forced pick unchanged; a year without `convReadEst` is unchanged.
- Log the pass in such a year: the push condition becomes `(usesMagiEstimate || convReadEst) && !forcedPass && !capPass && !replaying`
  (`charged`/`realized` are what they are; the cap pick reads only `drift`). No logging, and no allocation, in any other year.
- A distinct flag `capPass` (beside `forcedPass`, reset everywhere `forcedPass = false` resets with `passLog.length = 0`, carried on
  every phase record as `capPicked` and restored on every replay where `forcedPass = r.forced` is) so `magiStats.forced` keeps its
  meaning. Every guard that reads `!forcedPass` to skip a convergence decision reads `!forcedPass && !capPass` (the probe release, the
  update, the 162(l) switch, the forced block itself); the refund block (`forcedPass && flow < 0`) does not.
- `tests/estimate_sites.js`: the `capPass = true` block restores `estTrad` and sets the pick (rule (d)), and the site table in
  `magi-iteration.md` gains the row; the replay check compares conversion, realizedPre and the three holds against the pick, like
  `'forced'`.

- [ ] **Step 1: Failing tests** in `conversion-fill-draw.test.js`, through `world()` and `__test_runPlanMode` / the trace as the file's
  existing forced-pick case (`'a forced plain-fill year breaks an overpay tie by the smallest drift'`) does:
  (a) `'a non-ACA plain-fill year at the cap keeps its smallest-drift pass'`: the household above (smooth, HoH, 62, 1,500k, 300k,
  130k; find its exact `setState` patch in `tests/solver_scan.js`'s grid) at age 70: the trace has `capPicked` true, the kept pass's
  drift equals the minimum `drift` of that year's `passLog` and is under $50,461, and the kept row's conversion equals that pass's
  logged `conversion`.
  (b) `'a cap pick is not a forced year'`: in that run the age-70 trace has `forcedPass` false, and `magiStats.capPicked` is at
  least 1 while `magiStats.forced` counts no non-ACA year (a cap-picked year is never also counted forced).
  (c) `'an ACA year at the cap keeps the forced pick'`: the file's existing ACA forced case still has `forcedPass` true and
  `capPicked` false.
  (d) `'a converged year logs no cap pick'`: a smooth converging household (the file's `'a unit-slope year steps to the conversion kink
  and settles'`) has `magiStats.capPicked` 0.
  (e) `'the replay check reaches a cap-picked year'`: as the R1 case, `ctx.test.replayCheck` on household (a): the
  `replayCheckedCapPick` count is above 0 and the mismatch list is empty.
  Expected values are facts of the same run (min over the logged drifts, the logged conversion), never literals from a run (rule 6).
- [ ] **Step 2:** Run (a), (b), (e) fail; (c), (d) may already pass. Implement. Run the file, then the whole `npm run test:unit`, then
  `node tests/estimate_sites.js`, `node tests/engine_purity.js`, `npm run build && node tests/replay_check.js` (0 mismatches over its
  grid). Other unit tests that move are expected movers (their kept pass changes at a cap year): do not re-pin them; list each failing
  check with old/new value in the report (Task 7 re-pins after the owner sees the movers).
- [ ] **Step 3:** Update `magi-iteration.md` (the site table, the cap pick next to the forced pick, `magiStats.capPicked`).
  Commit: `S2 Task 4b: at the cap, a non-ACA year whose fill read the draw keeps its smallest-drift pass`.

**Expected:** the ~100 such years keep their best pass (the $50,461 year back to the ~$20,161-drift pass converting $20-40k); no new
plan expected; `magiStats.forced` / `unresolved` unchanged. **Risk:** low-moderate. Its re-measure and movers fold into Task 7 (one
movers table for PR 2); Task 5 runs on top of 4b.

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

Branch `claude/b5-f3-aca-over-line` from `origin/main` at `2fc43c7` (PR 2 merged). Spec 4.3 and section 5; the follow-ups list of
`docs/next-batches-plan.md` (found 2026-10-31, finding 1; found by S1, items 4 and 10; the D keep floor). US V153; Canada stays V67.
`<dir>` below is the measurement scratch directory of PRs 1-2 (`.../scratchpad/b5`, named in `task-7-measure-brief.md`); its dumps
and scripts are reused, never committed.

**What the plan was checked against (planning, 2026-11-02).** A scratch worktree at `2fc43c7` plus `9ab5cad`'s `roth-conversion.js`
hunk (`<dir>/wip-ceiling-hunk.diff`, `git apply --3way`: applies cleanly) and its test file, Node v24.21.0:
- `npx vitest run`: 15 tests fail in 8 files (listed under ruling 7), plus `tax-caches.test.js`'s 60 s case timing out under the full
  parallel run (it passes alone: a load timeout, not a mover). The WIP's test file passes.
- `tests/two_return_magi.js`, `aca_magi_iteration.js`, `se_health.js`, `cliff_guard.js`, `estimate_sites.js`, `engine_purity.js`,
  `cliff_plan.js`: pass.
- The fixture (Dana and Chris, `<dir>/fixture-run.js`): run-out 95 (main 95, the WIP alone 94); the plan keeps the **10%** bracket
  (main: the 22% setting), so it converts only at 59 ($20,227; main's $79,509 at 67 goes); stay-unders 62-66 as on main; the card's
  rows 10% $334,288 / 95, 12% $334,569 / 95, 22% (your setting) $335,214 / **94**, 24% $362,432 / 92, 32% $398,680 / 90, 35%
  $465,575 / 88 (the same as S1 + the WIP at 5c2f27d, `fixture-s1zwip.json`).
- With Task 8b's margin added as well: `tests/cliff_plan.js` passes with T4.3's conversions back on; with the rule alone and
  conversions on, T4.3 fails (`skippedIneligible` 1 at spending 18,000: the year lands over the line). The full Vitest run with the
  margin: 18 tests fail in 9 files, ruling 7's list less `conversion-apply` (h) (a per-return target pinned to the cent: it passes with
  the margin) plus the direct-call values the margin changes by design (Task 8b Step 1).

### Rulings (planning, 2026-11-02; the owner sees them at Task 9's STOP; revised after the Opus plan review, `pr3-plan-review.md`)

1. **The rule is `9ab5cad`'s, unchanged in substance.** Household branch: the ACA line caps only when `preConvMagi <= acaLine`
   (at the line it still caps). Two returns: each return's ACA room is `allowAca`, Infinity for a return already over its own line.
   The IRMAA rooms keep `allow`. Why: over the line the credit is already lost, so the line holds nothing; the IRMAA ceiling already
   keeps the tier the year sits in. Caveat (review C1, ruling 11): "over the line" is read on `preConvMagi`, which includes the draw
   that pays the conversion's own tax, so a year can be over the line only because it converts.
2. **One return over its line, the other not:** the over return's ACA room is Infinity; the other's room (its line less its MAGI,
   over its share of the conversion) still caps the household's conversion, as do both IRMAA rooms; the cap is the minimum. Why: the
   conversion lands on both returns by the traditional share, and the return still under its line has a credit to lose (the WIP
   test's second case: 185,200, 185,198 after the margin).
3. **The IRMAA holds and the held flags: no code change.** `CEIL_OUT.held` stays `irmaaHold < line && irmaaHold <= magiCeiling`, and
   `heldA` / `heldB` stay "this return's held room is the final room". In an over-the-line year at 63-64 the ACA line no longer
   competes, so a hold under the IRMAA line now sets the ceiling (`held` true where `2fc43c7` read false), and the probe release can
   fire there. That is the intended reading of Task 2g ("the hold set the ceiling"): before S3 the ACA line set the ceiling at $0 in
   those years and no release was due. Tested at the direct-call level (Task 8 (e), (f)), at engine level (Task 8 Step 4c) and by the
   replay check (Task 9). Before S3 a hold (an IRMAA line, about 109,000 engine MAGI or more for a single) was never under the ACA line
   (62,600 / 84,600), so no release fired in an ACA (`usesMagiEstimate`) year; now one can, and follow-up 13 becomes reachable: the
   ACA forced pick does not skip a `released` pass, and over the line every pass is charged the full premium (realized equals
   charged), so the smallest-drift tie can re-run the released pass that converted $0 and end the year at $0, the outcome the release
   exists to undo. Not fixed here (follow-up 13 stays C); Task 9 Step 4 counts it and 9b updates the follow-up with the count.
4. **A year whose pre-conversion MAGI straddles the line between passes** (one pass's `preConvMagi` at or under it, capped at the
   line; another's over it, filling the bracket room above the draw; defined on `preConvMagi`, never on `realizedPre`, which
   includes the conversion, so a knife-edge year capped at the line and landing cents over it is not a straddle): handled by the existing ACA branch of the iteration, with no new
   mechanism. Every year the ACA line can cap is a `usesMagiEstimate` year (the ceiling's condition, `acaEnabled && !acaEnhanced` and
   a partner eligible, implies `healthcareCost`'s, `acaEnabled` and a partner eligible), so: the damped step (weight 0.5 from pass 3);
   option Y's same-premium secant drops out across the line (the paired passes are charged different premiums, `healthcare !==
   secHc`), the unit-slope kink jump still applies; at the cap the forced pick re-runs the pass that overpaid least, never one charged
   under its realized price (`p.realized <= p.charged + 1e-9`), else the year is unresolved. Not the cap pick (non-ACA years only);
   the release can now fire in an over-the-line year at 63-64 (ruling 3). Both regimes reinforce themselves (over the line the
   conversion's tax and the full premium raise the draw, under it the credit lowers it), so the expected outcome is one regime, the
   seed's, not a cycle (and the seed can carry the over regime into a year whose own no-conversion MAGI is under the line: ruling
   11); a new forced or unresolved year is measured (Task 9) and a new unresolved year fails the gate. Tested by Task 8 (g) (the
   regime facts) and Task 8b (g2) (the price, after the margin). Also: the ceiling's
   `estUsed = true` (`run-projection.js`, after the call) can now be skipped in an over-the-line year (the ceiling is Infinity before
   63), but `usesMagiEstimate` sets `estUsed` in the same years, so no year stops iterating and no conversions-off row moves.
5. **The knife-edge margin (follow-up 4) is in PR 3, as its own commit (Task 8b).** Exactly: the ACA 400% line caps a conversion at
   `line - MAGI_ITER_TOL` ($1 under it), household and per return; the over-the-line test still reads the line itself, so a year
   within $1 under the line converts $0 and a year over it is not capped. *My call* among the spec's two forms, and its scope: the
   margin, not "charge the realized price at a converged year's end" (that changes every converged ACA year's charge and is a design
   of its own), and the ACA line only, not the IRMAA tiers (IRMAA is charged two years on from the recorded realized MAGI, so a year
   cents over a tier is priced as it is: there is no charged-versus-realized gap to close). Why $1 is enough: a converged pass's
   realized MAGI exceeds its estimate by at most the summed drift (`|realizedTrad - estTrad| + |gain - estGain|`, plus the
   inherited and 162(l) terms where live), which is at most `MAGI_ITER_TOL`; capped at `line - 1`, the realized MAGI is at most the
   line, and `acaNetCost` loses the credit only above `4 + 1e-9` of the poverty line. Per return, a return's realized MAGI moves by
   its share of the same drift, at most $1. The sized line targets already keep the same $1 (`resolveConvTarget`: `ln.magi - 1`).
   The 36 knife-edge years at `2fc43c7` (snapshot 23 + `conversion_sizing` grid 13, undercharged $2,765-$14,112 a year) are expected
   to go; any left is classified in Task 9.
6. **T4.3 returns to conversions on in this PR** (Task 8b, follow-up 10), checked in planning: it passes with the margin and fails
   without it. If it fails on the real tree, stop and report; do not turn conversions off again.
7. **The failing Vitest checks, each sorted into a figure or a premise** (review I3). Of the WIP's 13 (8 files), at `2fc43c7` + the
   hunk `conversion-choose` passes now (moved by S1/S2). A **figure** check pins a number or count the movers change: it is re-pinned
   in Task 9b with its cause, after the owner's OK. A **premise** check tests a mechanism on a household that had it; when S3 removes
   the premise the check is never re-pinned to the new value (it would then test nothing): a household that has the premise on the
   tip is found (as S1 re-pinned `SINGLE52_MULT` at 8 reserve years), or one is constructed, and the test's comment names the old
   and the new household. Planning's sort, which Task 8 Step 6 confirms on the real tree from each failing assertion (a check it
   cannot sort is shown to the owner as such):

   | Check | Planning's failing assertion | Kind |
   |---|---|---|
   | `conversion-apply` (d) (under the ACA line at 57, carried) | the target reads "the bracket conversion (target not reachable)" where it pins "just under the ACA 400% line" | premise (a carried line target) |
   | `conversion-apply` (h) (a two-return per-return target) | B's MAGI 62,099.13281 against 62,099.13280 (rule alone); passes with the margin | figure; Task 8b Step 3 records why it passes |
   | `conversion-apply` (k) (the forced pick in a sized year, B0.11.10) | `plan.conv` null: no sized year | premise |
   | `conversion-apply` (l) (a sized plan made for 22% on a 12% variant) | no kept sized plan | premise |
   | `conversion-plan` (the pass on the gap households) | NY@100 keeps 4 `'none'` ages (pinned 0, commented "a pin, not an invariant"); the TX@100 known exception moves; check count 230 -> 215 | figure (ruling 8 in a unit test) |
   | `gains-capped` (the property over the scan sample) | an object `toStrictEqual` at 414 | to sort: a pinned sample is a figure; a property that fails (an earlier run-out than `none`) is a finding for the owner, never a re-pin |
   | `order-lever` B0.11.9 (a kept toggle-on plan with no orders, HoH 52) | the plan now holds orders | premise |
   | `plan-search` (a stored plan not in use that wins) | `[true, 'better']` against `[false, 'score']` | premise |
   | `plan-search` (levers: SINGLE52's multiplier win) | the multiplier `[1.5, 1, 1]` -> null | premise |
   | `split-order-floor` (the joint track wins) | the joint track is not kept; check count 46 -> 43 | premise |
   | `two-return-split` (Optimize's splits-only winner) | the base's first home draw 79 -> 80 (later) | figure |
   | `conversion-fill-draw`: 'releases the held tier when the year sits higher', 'the replay check reaches the 162(l) switch (S1)', 'the cap pick skips a pass that released its hold' | their households ran through brake years | premise: re-found in Task 8 Step 5 |
   | `conversion-fill-draw`: 'a pass converting nothing under the ACA line keeps a hold that did not set the ceiling' | its premise is the brake itself (an ACA year over the line converting 0; S3 converts $29,319 there) | premise gone: rewritten in Task 8 Step 3 |
   | `test_bracket_search.js` sized-plan case (the NY couple at 100 keeps another bracket than the setting, with sized ages) | not run in planning; NY@100 now keeps `'none'` ages | premise, checked in Task 9 Step 10 |
   | `test_plan_optimizer.js` stale-plan case (added at Task 9's STOP, ruling 16) | the applied plan still beats the automatic plan at spending 80,000 (the rule's: passes on `2fc43c7`, fails on `b5ec3ab`) | premise: inputs where the applied plan loses, in Task 9b |
   | `conversion-fill-draw`: 'an ACA year whose premium moves between passes keeps the damped step', 'the replay check reaches the 162(l) switch (S1)' (added by Task 8c) | the charges differ by noise only (secant now); the year converges before the switch | premise: re-found in Task 8c |
   | `conversion-fill-draw`: the 4b case (Task 8 Step 4b; Task 8d) | 61 keeps the under state with the lump too | premise gone by design: rewritten in Task 8d |

   With the margin (planning run) `conversion-apply` (h) passes again and nothing else moves beyond the direct-call values Task 8b
   Step 1 changes by design (the WIP file's three values, 'the conversion ceiling says when the hold set it'). The `tax-caches` load
   timeout is neither (it passes alone).
8. **What S2 does with it (Task 5 on the WIP hunk).** Over-the-line years now convert on the proposal run; where converting does not
   pay, the per-year winner is `'none'` and S2's second walk can turn the conversion off, within the 24-run budget and only through
   `greedyAccepts`. Task 5 measured the hunk on S1 + 4b: `'none'` winners 3,150 -> 4,948 (scan grid), 23 -> 34 (snapshot); hit years
   2,580 -> 3,565 in 556 -> 648 households, all with budget left (3-23 left; 477 of 648 with room for every `'none'` age). Expected
   in the movers: (a) more kept `'none'` ages, mostly at over-the-line ages under 65, and more budget hits (S2 left 34 in
   `conversion_sizing`); rows moved only by that absorption end near `2fc43c7`'s figures; (b) over-the-line years that pay keep their
   conversion (the motivating case); (c) where the budget runs out or `greedyAccepts` refuses a `'none'`, a conversion that does not
   pay stays, so drops and earlier rows are possible: each is a flagged row. Task 9 measures (a)-(c) per household.
9. **Two commits, three trees.** Task 8 (the rule) and Task 8b (the margin) are separate commits, and Task 9 measures `2fc43c7`, Task
   8's commit and the tip, so every mover is attributed (rule / margin / both), as S2 did for 4b / 6.
10. **Follow-up 12 is not extended here.** If straddling years add ACA years that end unforced at the cap, they are listed as new
    rows of the restated cap gate for the owner (the 16 known S2 years and the 3 known S1 years are not new against `2fc43c7`).
11. **A year over the line only because it converts (review C1): measured, pinned and taken to the owner, not designed here.**
    `preConvMagi = magiBase + estTrad + estGain`, and the draw estimates include the draw that pays the conversion's own tax. A year
    whose no-conversion MAGI sits within about the conversion's tax under the line therefore has two consistent states: under (capped
    at the line, the credit kept) and over (the conversion's tax lifts the draw over the line, the cap lifts, the fill converts, the
    full premium is owed). The seed (last year's draw, `prevDiscTraditional`) picks one, so a year after a truly over-the-line year can
    keep the over state and lose a credit the brake used to keep. Guard-on runs can be rescued by a stay-under or S2's `'none'` walk
    (within the budget); guard-off runs cannot. *Considered and not taken:* testing "over the line" on a MAGI without the conversion's
    tax draw. The year loop has no such figure: the draw a pass would make with no conversion is known only from a pass that converts
    nothing. The sound form is a probe like the IRMAA release (an over-the-line pass whose year has not shown its no-conversion MAGI
    over the line keeps the cap until a pass converting nothing shows it), and that is a new carried per-year flag at every estimate
    site (`tests/estimate_sites.js`'s 13 sites and 4 literals, the replay check) plus up to one extra pass per over-the-line ACA year:
    not small, and a design for the owner. So: Task 8 Step 4b pins the behaviour on a constructed household; Task 9 Step 5 counts these
    years per set (guard-off runs apart), with the credit each lost and whether the plan rescued it; and the count goes to the owner at
    the STOP, with the probe as the candidate design (or "keep the cap when the year pinned to no conversion is under the line"), before
    Task 9b.

### PR 3 Review Focus

- An over-the-line ACA year at 63-64 with an IRMAA hold: the hold now sets the ceiling (`held` true), the release can fire, and
  `replayMismatch` stays 0 (Task 8 (e), (f); Task 9).
- A two-return year with one return over its line: the other return's room (less the margin, over its share) is the cap (ruling 2).
- A year straddling the line between passes (on `preConvMagi`): never kept charged under its realized price (Task 8 (g), 8b (g2)).
- A year over the line only because it converts (ruling 11): pinned (Task 8 Step 4b), counted (Task 9 Step 5), the owner's call.
- A released pass in an ACA year: the forced pick can re-run it (follow-up 13); counted (Task 9 Step 4).
- A premise check is never re-pinned to a value that no longer tests its mechanism (ruling 7).
- A year within $1 under the line converts $0; a converged ACA-capped year lands at or under the line (Task 8b).
- Conversions-off rows do not move (ruling 4's `estUsed` note; Task 9 Step 6; with 8c measured 0 of 768, and 8d passes 3 there).
- A household whose `'none'` walk runs out of budget: its over-the-line conversions stay; its row is in the movers table.
- (8c) A pass charged within `PREMIUM_SAME_TOL` of the pass before it steps undamped, and option Y's secant reads the same test; a
  year whose charges really move (more than a cent) keeps the damped step (Task 8c (c)); a step of the premium schedule is never
  smaller than the tolerance (ruling 17).
- (8c) `hist R rothConv+aca | crashFirst` at 59 stays unresolved after 8c (ruling 18): reported by name, never hidden by a re-pin.
- (8d) A year truly over the line computes S3's row exactly after one probe pass (Task 8d's exactness test); the probe pass is never
  logged, so neither the forced pick nor the cap pick can re-run it.
- (8d) A year over the line only because it converts keeps the cap and the credit, household and per return (Task 8d); the residual
  (a no-conversion year that is itself over at the full premium and under at the credit price) is counted, not claimed fixed.
- (8d) `acaShown` goes everywhere the IRMAA holds go (`tests/estimate_sites.js`'s `HOLDS`, the replay check's compares); a pass that
  does not fill under the ceiling gets 3 (S3's doubles), so conversions-off and stay-under rows cannot move. `seedShown` is set at
  every seed site; a secant pair never spans a kept-cap pass (`secKept`).
- (8c, 8d) bench_optimize had 6.4 points of margin at Task 9 (+33.6% against +40%): the re-measure names the change that moved it.
- (8e) The all-none candidate runs after both walks and outside the budget, and replaces the walk's plan only through `greedyAccepts`:
  no row earlier or lower than `9fb1163`'s pass (ruling 24); `tried`, `accepted` and `budgetHit` keep S2's meaning.
- (8f) The brake reads the guard setting, never `ctx.plan === null` (the planning's own user-bracket runs are plan-less: ruling 25);
  with the guard off `acaShown` is 0 and the probe and `secKept` never fire, so guard-off rows equal `2fc43c7`'s but for the margin
  and 8c (ruling 26); the switched test cases test S3's planless run, the planning's own (ruling 27).

### Task 8: the rule

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`conversionMagiCeiling`: the two-return ACA rooms `~128-135`, the household
  ACA block `~158-172`; the header comment `~76-89` and `CEIL_OUT`'s comment `~92-95`, which say the ACA line is "a lower cap")
- Create: `tests/unit/us/conversion-aca-ceiling.test.js` (from `9ab5cad`, extended)
- Modify: `tests/unit/us/conversion-fill-draw.test.js` (the four cases of ruling 7)
- Modify (test-only field): `run-projection.js`, the `passLog.push({ estTrad, ...` literal gains `preConv: preConvMagi` (the pass's
  pre-conversion MAGI, a field on an object already allocated, only in logged years), for the straddle test and count (ruling 4)
- Not changed otherwise: `run-projection.js` (the ceiling call, `ceilRead`, the holds and the release read the ceiling as before:
  ruling 3, 4), `tests/engine-purity.json` (no module-level mutable), `tests/estimate_sites.js` (no estimate site; the literal still
  lists the three holds)

**Interfaces:**
- `conversionMagiCeiling(ctx, args)`: signature and `CEIL_OUT` fields unchanged. Household: `const acaLine = fplForHousehold(ctx,
  acaHouseholdSize(...), year) * 4; if (preConvMagi <= acaLine) magiCeiling = Math.min(magiCeiling, acaLine);`. Two returns: `allowAca
  = (line, m, frac) => (m > line ? Infinity : allow(line, m, frac))` for the A and B ACA rooms. A year with no ACA line in play, or at
  or under it, computes `2fc43c7`'s doubles.

- [ ] **Step 1: Failing tests.** `git checkout 9ab5cad -- tests/unit/us/conversion-aca-ceiling.test.js`, then add (setup as
  `conversion-fill-draw.test.js`'s 'the conversion ceiling says when the hold set it': `acaEnabled: true, acaEnhanced: false,
  stateTax: 'tx'`; a retired single person at 63 on the marketplace, year 0: the 400% line 15,650 x 4 = 62,600, IRMAA's first tier
  109,000; read `[CEIL_OUT.held, CEIL_OUT.heldA, CEIL_OUT.heldB]` right after each call):
  - (e) `'over the line, the IRMAA hold sets the ceiling'`: `preConvMagi` 70,000: with `irmaaHold: 100000` the ceiling is 100,000 and
    held `[true, false, false]` (on `2fc43c7`: 62,600, held false: the ACA line set it); with no hold 109,000, held false.
  - (f) `'two returns, A over its line at 63: A's IRMAA hold sets the ceiling'`: two returns, A 63 on the marketplace, B 66 (no ACA,
    IRMAA), `preMagiA` 70,000, `preMagiB` 0, `preConvMagi` 70,000, `shareA` 0.5, `irmaaHoldA` 100,000: A's ACA room Infinity, A's held
    room (100,000 - 70,000) / 0.5 = 60,000, B's (109,000 - 0) / 0.5 = 218,000: ceiling 130,000, held `[false, true, false]` (on
    `2fc43c7`: A's ACA room max(0, (62,600 - 70,000) / 0.5) = 0, ceiling 70,000, `heldA` false).
  Run the file: the WIP's 'already over the line', its two-return case, (e) and (f) fail; 'under the line' and 'exactly at the line'
  pass.
- [ ] **Step 2: Implement.** `git apply --3way <dir>/wip-ceiling-hunk.diff` (or by hand), then the comments: the household block's
  (the WIP's text), the header's ACA paragraph (the line caps a conversion only while the year's pre-conversion MAGI is at or under
  it, household and per return), `CEIL_OUT`'s ("no lower cap: household, the ACA 400% line when the year is at or under it").
  Run the file: passes.
- [ ] **Step 3: The engine case at 63-64** (replaces 'a pass converting nothing under the ACA line keeps a hold that did not set
  the ceiling', whose premise, an ACA year over the line converting $0, was the brake; the tighter release for a year under the line
  stays tested at the direct-call level by 'the conversion ceiling says when the hold set it'): `'an ACA year over the 400% line
  converts under its IRMAA hold'`, the same household (`gridOf('single-person', 62, 500000, 2000000, 130000)`, guard off) at 63 and
  64: the premise, the year's MAGI with the conversion pinned to 0 at that age (`noConversionYear`, as the release cases do) is over
  the line (`fplForHousehold(ctx, 1, i) * 4`); then the row converts more than $0 (planning: $29,319 at 63), its MAGI is at most
  `hi` (`noConversionYear`'s tier line above the no-conversion MAGI: the conversion stays in the IRMAA tier the year sits in), and
  the row's `healthcare` `toBe` the pinned row's (both over the line pay the full premium: the conversion costs no credit). The comment says what the old case tested and why it
  changed (S3).
- [ ] **Step 4: (g) the straddle, the regime facts** (ruling 4): `'a year whose pre-conversion MAGI crosses the line between passes
  ends converged or forced, never unresolved'`. Find a household on this tree by a sweep (scratch script; the conversion_sizing grid,
  guard off, then the gap households): an ACA conversion year whose trace `passLog` holds one pass with `preConv` at or under the
  year's line and another with `preConv` over it (single and MFJ households: the household line, `fplForHousehold(ctx,
  acaHouseholdSize(ctx, singlePerson, isSurvivorPeriod, i), i) * 4`; skip two-return years). The test first asserts that premise
  (`L.some((p) => p.preConv <= line)` and `L.some((p) => p.preConv > line)`: re-review N2), so a later change that moves the household
  off the straddle fails the test instead of passing it vacuously. On it: if `t.forcedPass`, `t.picked >= 0`
  (the trace says -1 when a phase cleared the log) and `L[t.picked].realized <= L[t.picked].charged + 1e-9` (true by the pick's
  definition: it shows the pick ran); else the last logged pass's drift is at most `MAGI_ITER_TOL`; in either case `magiStats.unresolved`
  is 0 for the run and the test states which regime the year kept. No price check here: on this tree (no margin yet) an under-regime
  year capped at the line can land cents over it, the knife-edge; the price check is (g2) in Task 8b. The comment names the household
  and the passes found. If the sweep finds none, say so and construct one (a single at 60 on the marketplace whose spending puts the
  no-conversion MAGI within the first pass's conversion of the line); the test is not skipped.
- [ ] **Step 4b: the year over the line only because it converts** (ruling 11): `'a year whose no-conversion MAGI is under the line
  can keep the over-the-line state its seed gives it'`, constructed: a single at 59 on the marketplace, guard off, conversions 59-64 at
  22%, a one-time expense (`lumpExpenses`) at 60 that puts 60 truly over the line and is paid from the traditional draw (so it
  reaches `prevDiscTraditional`, the seed of 61's estimate: assert that 61's first logged `estTrad` is higher with the lump than
  without; re-review N1), and a spending level (bisect it in a scratch
  script) at which 61's MAGI with the conversion pinned to 0 (`noConversionYear`) is at or under the line. Assert the facts, whatever
  they are, as relations (no engine literal): the pinned 61 is at or under the line; the kept 61 converts more than $0 with its MAGI
  over the line (the over state), or converts at the line (the under state); and the same household without the lump expense (a seed
  from an under year) keeps the under state at 61 (if it does not, the household is not a two-state case: re-bisect the spending; if
  no level gives the no-lump run the under state, record that and pin what each run does, as below). The comment says this pins today's behaviour of ruling 11's class for the owner's
  decision, and is not an endorsement. If no spending level gives two different states, record that (the class may be unreachable
  with this seed) and pin the one state found.
- [ ] **Step 4c: the release in an ACA year** (ruling 3, review I2): `'an over-the-line ACA year at 63-64 can release its hold'`: a
  sweep (the scan grid's single persons and HoH at 62, guard off), else constructed, finding an ACA year at 63-64 over the line whose
  trace shows `holdReleases > 0`. Assert `row.conversionAmount > 0`; or, if the year ends forced, `t.picked >= 0` and state
  `L[t.picked].released` (a forced re-run of a released pass converting $0 is follow-up 13's case: the test pins it and its comment
  says so). Also `replayMismatch` 0 on it with `ctx.test.replayCheck` on.
- [ ] **Step 5: Re-find the three moved S1/S2 households** ('releases the held tier when the year sits higher' (its first case, `single
  52; 500k; 2000k; 130k` at 69), 'the replay check reaches the 162(l) switch (S1)', 'the cap pick skips a pass that released its
  hold'): their assertions are the mechanisms' and stay; the households were found by sweeps (Task 2f, Task 4b), and S3's
  over-the-line conversions in their ACA years moved their later years. Re-run the same sweep on this tree, replace the household,
  and say in the comment "re-found at S3 (the rule moved <old household>'s later years)". A case no household reaches gets a
  constructed one, said in the report.
- [ ] **Step 6:** `npx vitest run tests/unit/us/conversion-aca-ceiling.test.js tests/unit/us/conversion-fill-draw.test.js` (also
  `--sequence.shuffle`), on Node 24 and Node 22 (Vitest rule 6: the new engine-level cases compare engine output);
  `npm run test:unit`: list every other failure with its old / new value and its kind (ruling 7's table: figure or premise, from the
  failing assertion); do not re-pin or re-find (Task 9b). `node tests/estimate_sites.js`, `node tests/engine_purity.js`, `npm run build`, `node tests/replay_check.js`
  (`replayMismatch` 0), `node tests/two_return_magi.js`, `node tests/aca_magi_iteration.js`, `node tests/cliff_guard.js`, `node
  tests/se_health.js`, `node tests/cliff_plan.js` (all passed in planning).
- [ ] **Step 7:** `conversion-fill-draw.test.js`'s count in `test-inventory.md` stays for Task 9b. Commit: `S3: the ACA 400% line caps
  a conversion only while MAGI is at or under it (pinned checks not yet re-pinned)`. Opus task review (the four rewritten cases and
  the tests of Steps 3-4c against rulings 3, 4 and 11).

### Task 8b: the knife-edge margin (follow-up 4) and T4.3 (follow-up 10)

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (import `MAGI_ITER_TOL` from `'../projection/engine-state.js'`; the two ACA
  caps)
- Modify: `tests/unit/us/conversion-aca-ceiling.test.js`, `tests/unit/us/conversion-fill-draw.test.js` ('the conversion ceiling says
  when the hold set it'), `tests/cliff_plan.js` (T4.3)

**Interfaces:**
- Household: `if (preConvMagi <= acaLine) magiCeiling = Math.min(magiCeiling, acaLine - MAGI_ITER_TOL);`. Two returns: `allowAca =
  (line, m, frac) => (m > line ? Infinity : allow(line - MAGI_ITER_TOL, m, frac))`. The over-the-line test reads the line itself
  (ruling 5). `CEIL_OUT.held`'s comparison reads the capped ceiling, so a hold between `line - 1` and the line does not set it.
  `engine-state.js` imports nothing; no cycle, no new mutable.

- [ ] **Step 1: Failing tests (values hand-computed; tax index factor 1 at year 0).**
  - `conversion-aca-ceiling.test.js`: under the line 84,600 -> **84,599**; exactly at the line (`preConvMagi` 84,600): **84,599**
    (below the MAGI: `magiSafeRoom` clamps to 0); new `'within $1 under the line, no room'`: `preConvMagi` 84,599.5 -> 84,599; two
    returns, A over and B at 40,000: B's room (62,600 - 1 - 40,000) / 0.5 = 45,198 -> **185,198**; A over with B off the marketplace:
    Infinity (unchanged). The file's header comment states the margin.
  - `conversion-fill-draw.test.js` 'the conversion ceiling says when the hold set it': 62,600 -> **62,599** where the ACA line sets the
    ceiling (the bare call, `irmaaHold: 100000`); the tie case becomes `irmaaHold: 62599` -> 62,599, held `[true, false, false]`; new:
    `irmaaHold: 62600` -> 62,599, held `[false, false, false]` (a hold between the capped line and the line does not set it). Task 8's
    (e) and (f) unchanged (no ACA room binds there).
  - In `conversion-aca-ceiling.test.js`: the knife-edge, `'a converged year the 400% line caps lands at or under it'`, on households from S2's knife-edge list
    (`<dir>/as2-s2.knife2.json`; scan-grid default mode): `MFJ 52; 750k+750k; 300k; 130k; none` (at 54 on `2fc43c7`: MAGI $88,882.88,
    cents over the line, charged $8,852.73, priced $19,291.37), `HoH 58; 500k; 300k; 60k; none` (61), `two returns 62; 250k+250k;
    2000k; 60k; none` (62), each with its plan as the tools run it: no row that converts has its MAGI over its household line by at most
    `MAGI_ITER_TOL` (single / MFJ / HoH: `fplForHousehold(ctx, acaHouseholdSize(ctx, singlePerson, isSurvivorPeriod, i), i) * 4`, the
    engine's household size, children included; two returns: `magiA` against `fplForHousehold(ctx, 1 + qualifyingChildCount(inputs,
    taxYearOf(ctx, i)), i) * 4`, `magiB` against `fplForHousehold(ctx, 1, i) * 4`, as the ceiling forms them), and (not vacuous) at least one row converts with its MAGI within $2 under the line. First run it on Task 8's tree: it
    must fail there; if the listed years no longer land over the line on Task 8's tree, take the households from Task 9 Step 7's list
    run on Task 8's tree, and say which.
  - In `conversion-fill-draw.test.js`, beside (g): (g2) `'a straddling year is never kept under its realized price'`: on (g)'s
    household, when the year is not forced, `L.at(-1).realized - L.at(-1).charged <= 1` (written out; under the line the premium's
    slope is the applicable percentage, about 10 cents a dollar, so a $1 drift moves it about $0.10). It may fail on Task 8's tree (the
    knife-edge); it must pass after the margin.
  Run: these fail (g2 may already pass).
- [ ] **Step 2: Implement.** Run the two files (also shuffled): pass. T4.3 (`tests/cliff_plan.js`): drop `rothConvEnabled: false` from
  `lower` and rewrite its comment ("conversions on: the lower-spending year converts to $1 under the 400% line, the S3 margin, so the
  year reads as under the line and the intent is skipped; before the margin it landed 42 cents over, the knife-edge"). `npm run build
  && node tests/cliff_plan.js`: passes (planning: passes with the margin; with the rule alone `skippedIneligible` 1 at spending 18,000).
- [ ] **Step 3:** `npm run test:unit` (the new cases also on Node 22): list the failures beyond Task 8's with old / new values and
  kind (margin movers). Record why `conversion-apply` (h) fails on the rule and passes with the margin (review M5): trace its years on
  both trees (a sized per-return target reads `magiSafeRoom` only in the fallback, so the difference must come from an earlier year's
  plain fill or a fallback); if the pass is two effects cancelling, say so, so it is not read as luck. `node
  tests/replay_check.js`, `node tests/engine_purity.js`, `node tests/estimate_sites.js`. Commit: `S3: the ACA line keeps a $1 margin
  (MAGI_ITER_TOL), so a converged year cannot land cents over it; T4.3 back to conversions on`.

### Rulings 12-22 (owner at Task 9's STOP, 2026-11-02; addendum planning the same day)

The owner, verbatim: "Build the forced-years damping fix and the ruling-11 probe in PR 3, re-measure, then stop at the movers table
again. Keep the IRMAA margin ACA-only, and accept Dana and Chris's 22% row for now (S4's card can say why)."

**What the addendum was checked against (planning, 2026-11-02).** A scratch worktree at `0158a9d` (`<scratch>/pr3add/tree-8c`, Node
v24.21.0, `node_modules` a junction) with both fixes behind a scratch switch (`globalThis.__S8C`: never in the branch), scratch
Vitest files through `tests/unit/helpers/world.js` and the `s3-histyear.js` page script on its build. The probe there is a prototype:
its phase records (`natRec`, `trialRecs`) do not carry the flag, so its guard-on figures are indicative only; every guard-off figure
is a single-phase run and exact. Figures below are from those runs; the report `pr3-addendum-plan-report.md` lists the scripts.

12. **The decision.** Tasks 8c (the damping fix) and 8d (the ruling-11 probe) are built in PR 3, as separate commits after Task 8b;
    Task 9 is re-run on four trees and STOPs at the movers table again; Task 9b follows only after the owner's OK.
13. **The IRMAA margin stays ACA-only** (owner question 1; ruling 5 confirmed): no code change. Task 9 reports the $1 IRMAA landings
    again as information.
14. **Dana and Chris's 22% row is accepted** (owner question 2): the card's "22% (your setting)" row runs out at 94 against the plan's
    95 because it converts $87,579 at 60 and $80,666 at 61, years already over the line on their own (no-conversion MAGI 154,965 /
    179,120 against lines 88,883 / 91,105; the same premium either way). Not a ruling-11 case. S4's card says why (the note under PR 4).
    Cost if wrong: none in PR 3; S4 carries the copy.
15. **The S2 walk's 24-run budget is not changed by 8c or 8d** (controller ruling). The re-measure lists every earlier row again with
    its cause; any row still earlier than `2fc43c7` because the walk ran out of budget (or `greedyAccepts` refused) goes to the owner at
    the next STOP as the budget question (options from Task 9's concern 1: accept; raise the budget for over-the-line ages; walk them
    first). Expected: 8d removes some (a year it keeps under the line has no conversion for the walk to take off), 8c moves none on
    purpose. Cost if wrong: the gate fails again and the owner rules on the rows, as at the first STOP.
16. **`test_plan_optimizer.js`'s stale-plan case is a premise check** (Task 9's concern 7; the rule's: on `b5ec3ab` the applied plan
    still beats the automatic plan at spending 80,000): it joins ruling 7's table and Task 9b's premise list.
17. **8c, "the same premium" (my call, the owner's definition made exact).** The damped step (`w = phasePass >= 3 ? 0.5 : 1` in the
    update's ACA branch, `run-projection.js:1385`) is skipped, `w = 1`, on a pass of a `usesMagiEstimate` year whose charged healthcare
    is within `PREMIUM_SAME_TOL` = $0.01 of the previous pass's (`Math.abs(healthcare - passLog[passLog.length - 2].charged) <=
    PREMIUM_SAME_TOL`), and option Y's secant reads the same test (`Math.abs(healthcare - secHc) <= PREMIUM_SAME_TOL` replaces
    `healthcare === secHc`, `:1404`): one definition of "the same premium" for both.
    - *Which passes:* this pass and the one before it in the phase. In a `usesMagiEstimate` year every pass that is not forced, cap-picked
      or a replay is logged (`:1305`), and the update runs only on such passes, so the log's last entry is this pass and the one before
      it the previous pass; every phase start clears the log (`passLog.length = 0` with `phasePass = -1`), so a pair never spans phases.
      With fewer than two entries the weight is already 1 (`phasePass < 3`).
    - *Which premium:* `healthcare` at the update, the passLog's `charged`: the year's healthcare cost as the pass charged it (ACA
      premiums, and the in-year IRMAA of an appeal year, which `healthcareCost` also prices off the estimate; IRMAA charged two years on
      is not in it). So "ACA only or also IRMAA": whatever the year prices off the estimate.
    - *Why a tolerance, not `===`:* checked. On `hist R rothConv+aca | real2000` at 59 (the first new unresolved year) every pass is
      charged 6,174.40 but the doubles differ by up to $0.0004 (the fill's `estTrad + conversion` is the bracket top only to rounding),
      so `===` fails, option Y's secant never fires and the year runs 8 damped passes. The household of `conversion-fill-draw.test.js`'s
      'an ACA year whose premium moves between passes keeps the damped step' (two returns 52 / 750k+750k / 300k / 60k at 61) is the
      same: its "different premium on every pass" is $0.00001-$0.00015 of noise. With the tolerance real2000 converges in 3 passes
      (drift 27,113, 11,471, 0.01) and the other in 3; with the damping skip alone (exact or tolerant) real2000 still ends unresolved
      (drift 65.78 on pass 8): the secant is what reaches it.
    - *Why $0.01:* no step of the premium schedule is that small (the 400% cliff, the Medicaid and 100% lines and the 133% step of the
      applicable percentage are tens to thousands of dollars), and the continuous part moves at most about $0.20 per dollar of MAGI per
      return (a two-return household's `healthcare` sums both returns' slopes, so up to about twice that), so two charges within a cent
      mean the MAGI estimates sit within a few cents of each other or crossed no step. A cent is far above the noise (4e-4) and far below
      any step (review M1).
    - *Not changed:* the same branch's damping in a year with no premium priced off the estimate and a fill that does not read the draw
      (the `else` branch serves it too: no log, no premium to compare); the non-ACA secant branch (weight 1 already).
    - *The estimate-site rules:* no new carried value (the weight is computed at each update from the phase's own log; a replay or a
      forced pass takes no update), no `scalarSnapshot` entry (iteration bookkeeping, like `secHc`), no new `passLog` field (`charged`
      exists), no site-table row, `tests/estimate_sites.js` unchanged (13 sites, 4 literals, 7 replay blocks); no module-level mutable
      (`PREMIUM_SAME_TOL` is a `const` in `engine-state.js` beside `MAGI_ITER_TOL`).
    - *Measured in planning* (guard off, the 384 default-mode scan households, then smooth; converting years under 65 with a logged
      pass): forced 183 -> 55 (smooth 268 -> 60), 7-8-pass years 146 -> 101 (169 -> 109), unresolved 0 -> 0, all passes 31,071 ->
      30,509 (-1.8%); guard on (default): forced 67 -> 34, slow 69 -> 42. Rows move in 194 of 384 households guard off (no run-out or
      home-draw age moves; end values within -0.16% / +), so 8c is a broad cents-level mover set of its own (ruling 21). The plan
      review's own 8c build (`pr3-addendum-plan-review.md`): **12 of 541 US snapshot scenarios** move, all conversions-on (the two
      `hist R rothConv+aca` years at 59 and cents-level moves of years capped at the line); a much larger snapshot mover set at the re-run
      is unexpected and is traced. **Conversions off: 0 of 768 rows move** (default and smooth, path fingerprint included): in a
      conversions-off ACA year two passes charged the same premium already sit on the fixed point by pass 2, before the damping starts,
      so the conversions-off gate stays exact (review I1).
    - Cost if wrong: an undamped step taken where a premium step sits between two passes charged within a cent cannot happen (no such
      step); if an undamped step lands across a step, the next pass is charged differently and damped again, and the cap's forced pick
      is the backstop as today.
18. **8c reaches one of the two new unresolved years, not both (checked).** `hist R rothConv+aca | crashFirst` at 59 takes a unit-slope
    kink jump to conversion 0 on pass 3 and is then a no-conversion ACA year whose premium moves continuously ($589 down to $78 a pass)
    under the damped step, every pass charged under its realized price: unresolved on the tip and with 8c (drift 884 -> 277 on pass 8).
    It is outside "the same premium". Not fixed here; Task 9 reports it by name and mechanism, and the candidate (no damping while the
    paired passes' MAGI estimates sit in one band of the ACA schedule, a step-free secant) is a question for the owner at the STOP.
    Cost if wrong: the "no more unresolved" gate fails by 1 (a historical cycle) at the re-measure. This corrects the first Task 9
    report, which told the owner the same-premium fix would reach both new unresolved years (review M8; the review's 8c build moves
    `crashFirst`'s year 7 by $69.26 of healthcare without resolving it).
19. **8d, the probe: design (a), in a one-pass form (my call).** (b), "keep the cap when the year re-run with the conversion pinned to 0
    is under the line", needs a converged no-conversion iteration of the year (up to `MAGI_ITER_MAX` more passes, with its own records,
    replays and seeds) inside every over-the-line ACA year; (a) costs one pass where the probe fires and nothing elsewhere. The form:
    - *The signal:* `acaShown`, one integer per phase (bit 1: the household's line, or return A's on two returns; bit 2: return B's),
      0 = "not shown". `conversionMagiCeiling` gains the argument `acaShown` (default 3, S3's doubles): the ACA cap at `line -
      MAGI_ITER_TOL` applies when `preConvMagi <= line` **or** the bit is clear (per return: `allowAca` gives Infinity only when the return
      is over its line **and** its bit is set). So a not-shown pass over the line converts 0 (the old brake). `CEIL_OUT` gains `acaLine`,
      `acaLineA`, `acaLineB` (NaN where no ACA line applied) and `acaProbe`, `acaProbeA`, `acaProbeB` (the line capped only because the
      bit is clear: MAGI over the line, bit clear).
    - *The probe (where it is set):* on a pass with `ceilRead && conversionAmount === 0 && !forcedPass && !capPass && !replaying &&
      !released` (after rule 2's IRMAA release, which keeps priority), if `ceilAcaProbe && realizedPre >
      ceilAcaLine` (as built, Task 8d review: no last-pass guard (M1); `secKept` gated on `ceilRead`, since sized passes carry
      `acaShown` but only the fallback reads the ceiling; `acaProbeA` / `acaProbeB` set only for a return whose conversion share is
      above 0 (I1)) (per return: `returnMagis` of the realized draws against `ceilAcaLineA` / `ceilAcaLineB`, as the IRMAA release does),
      the bit is set ("shown"): the year without a conversion is over the line. That pass is a measurement: its `passLog` entry is popped,
      `phasePass` is decremented, and it `continue`s **before the update**, so the estimates and the secant pair are untouched and the
      next pass repeats it with the cap lifted. The holds may take rule 1's down-move on the probe pass (the conversion block,
      `:985-989`, runs before the probe); the repeat computes the same `ceilLine` from the same estimates, and `min(line, min(hold,
      line)) = min(line, hold)` (the holds' own replay argument), so no hold restore is added for the probe (review M2). A truly-over year therefore computes S3's doubles after one extra pass: checked,
      171 of 171 guard-off default-grid households where the probe fired and no cap was kept have rows identical to 8c's. If the
      realized MAGI is at or under the line, nothing is set: the pass is an ordinary pass of the under regime and takes the update (the
      estimates move to the no-conversion draw, so the year can settle capped at the line, the credit kept).
    - *Carried like the IRMAA holds (reset / carry):* declared 0 at the year start (Y0); on every record (`passLog` W1 as the pass's
      input `acaShown`, `natRec` W2, `trialRecs` W3, the trace row W4); restored by every exact replay (R1 forced pick, R1b cap pick,
      R2-R6); taken from the seed's record by P2, P3, P5; reset to 0 by P1 (the sized phase); kept by S1 (the `seHeld` switch) and P4
      (the order start) (`// hold: kept` covers it). Not in `scalarSnapshot`. `tests/estimate_sites.js` adds `acaShown` to `HOLDS`;
      the counts stay 13 / 4 / 7 / 1 / 2. The replay check compares it with `Object.is` beside the holds: one `replayCompare` line
      per branch at the pass start (`:698-720`), against `replayRec.acaShown`, `forcedPick.acaShown`, `capPick.acaShown` and a new
      `seedShown`, declared `let seedShown = 0` beside `seedHold = Infinity` (`:584`), set at every seed site: 0 at P1, the record's `acaShown` at P2, P3
      and P5, the current `acaShown` at S1 and P4. A seeded phase whose first pass probes uses the seed compare on that probe pass;
      the pass enters with the seed's inputs, so the compare is still valid (review M3).
    - *Gate:* passed to the ceiling only when `holdsIn` (the holds' gate, rule 0), else 3: a pass that does not fill under the ceiling,
      a split phase, a stay-under trial, bracket 0 and conversions-off households compute S3's doubles. `ctx.test.acaProbeOff` (new
      test switch, like `irmaaHoldOff`) passes 3 always: S3's behaviour, for the exactness test and Task 9's on/off counts.
    - *The forced pick and the cap pick:* unchanged except that they restore `acaShown` from the pick; a probe pass is never logged, so
      the pick can never re-run it (no brake outcome through the pick).
    - *The secant pair:* no `secShown`. The pair across a probe is the pass before it and the repeat, which is S3's own pair (the
      exactness above depends on it). **`secKept` (review M4):** a pair never spans a kept-cap pass. Stored with the holds at the pair
      update, `secKept = ceilRead && (ceilAcaProbe || ceilAcaProbeA || ceilAcaProbeB)` (the pair pass was over its line, household or that return,
      with the bit clear, and kept the cap; on two returns the other return may still convert; a probed pass never reaches the update),
      reset as its own statement `secKept = false` beside every `secEst = NaN` reset (not in the NaN chain); both secant
      blocks use the pair only when `!secKept`. Why: such a pass and a later shown pass can both pay the full premium, so option Y would
      take a secant across a change of the cap, the case rule 3 drops for the holds. Measured: on the planned variant without it,
      pairs spanning a kept-cap pass met the pair condition 68 times guard off (default; smooth 64; guard on 56); with it, 0 rows
      differ guard off (default and smooth, 384 + 384), passes -2, and guard on forced 30 -> 31. It keeps the exactness: in a year
      with no kept-cap pass no update ever stores `secKept` true, so the pair is S3's own (a kept-cap pass can precede a probe; that
      year's pair is then dropped, re-review N1). Iteration bookkeeping like `secHold`: not carried, not
      snapshotted, no site.
    - *Two returns:* per return, bits 1 and 2; the other return's room still caps (ruling 2).
    - *With 8b's margin:* the cap is `line - MAGI_ITER_TOL` shown or not; the over tests (cap and probe) read the line itself.
    - *With rule 2:* the probe does not fire on a pass where a hold released (that pass takes the update as today); the next not-shown
      over pass probes. At 63-64 the ACA cap (about 62,600-100,000) sits under every IRMAA hold (109,000 and up), so a probe pass has
      `CEIL_OUT.held` false and no release can fire on it; after the probe the hold sets the ceiling as in S3 (ruling 3).
    - *Residual (checked, for the owner):* the probe pass is charged off an over-the-line estimate (the full premium), so it measures the
      no-conversion MAGI at the full premium. A year whose no-conversion year itself has two states (over at the full premium, under at
      the credit price) shows over and converts as in S3: `HoH 52; 1500k; 2000k; 60k` at 52 and its 58 / rule55 / 500k twins (the pinned
      year 80,496 under 84,600; it converts $225,900 and loses $9,983, as now). Pricing the probe pass at the capped MAGI was tried and
      gave releases I could not explain in the time: not taken.
    - *Measured in planning, on the variant this plan specifies* (pop-and-repeat, the probe pass unlogged, no `secShown`, with and
      without `secKept`; on top of 8c; re-run after the plan review's I2, `<scratch>/pr3add/tree-8r`; the default-mode grid; ruling
      11's count = kept converting ACA years over their line whose year pinned to no conversion is at or under it, plain fill): guard
      off **118 -> 9** (the 9: 8 HoH years of the residual, 1 MFJ 52 / 250k+250k / 2000k / 60k / sepp at 52, all with the probe fired);
      guard on **6 -> 4** (the 4 HoH years; sized over-the-line years, the plan's own choice, 8 -> 5). Guard off (default, smooth in
      brackets): rows move in 44 households (36), every one with a kept cap; 171 (199) probed households with no kept cap have rows
      identical to 8c's; run-out earlier 0, later 11 (8); end value up 19 (11), down 0; forced converting years under 65 55 -> 40 (60 ->
      54); passes 30,509 -> 32,110, +5.2% (+4.9%); unresolved 0. Guard on (phase records do not carry the flag in the prototype:
      indicative): passes 33,310 -> 34,439 (+3.4%), forced 34 -> 30 (31 with `secKept`), run-outs unchanged. The first figures, from
      the logged-and-update variant (the pass kept in the log, the estimates updated, a `secShown` check), were within a household or
      two of these (rows moved in 45, forced 55 -> 40, +5.2%): the planned variant is not worse.
    - Cost if wrong: the probe misses the residual (ruling 11's count does not reach 0: Task 9 splits it); a kept cap can force a year
      that S3 converged (it re-runs the least-overpaying pass: the brake's outcome, the credit kept); bench_optimize's margin (6.4
      points at Task 9) narrows by the extra pass (planning: +3.4% passes guard on, against 8c's -1.8%).
20. **Two commits, four trees.** Task 8c and Task 8d are separate commits. Task 9 measures four trees (controller): `2fc43c7`,
    `b5ec3ab` (Task 8), `0158a9d` (8 + 8b) and the tip (8c + 8d). A tip row that differs from `0158a9d` is split between 8c and 8d on
    the tip itself, world against world (review M6): the household's probe-off `world()` row against its as-built `world()` row (Task
    9's two world sweeps on the tip), never against the page dump (Node and Chromium can differ in the last bit, Vitest rule 6). The
    switch is set with `assignAcaProbeOff(true)` on the world's `test-hooks.js` (as the gate test sets `assignIrmaaHoldOff`:
    `storeRunContext` builds every planning context's `test` from `testHooks`, so a `ctx.test` handed to `w.ctx()` alone would leave
    the plan search probing), one fresh world per setting (`cliffPlanCache` keys only on the year and the state). Equal: 8c's; else 8d's
    ("both" when the probe-off row also differs from `0158a9d`'s world row). Ruling 9's causes gain "damping" and "probe".
21. **8c's movers are re-pinned like the others, after the owner's OK.** 8c moves converged rows by cents and forced rows to converged
    ones in many conversions-on ACA households; Task 9 counts them per set and Task 9b re-pins (a figure) or re-finds (a premise) every
    check they move. No check is re-pinned in Tasks 8c / 8d. The conversions-off gate is unchanged and exact (ruling 4; Task 9 Step 6):
    neither 8c (measured 0 of 768) nor 8d (its gate passes 3 there) may move a conversions-off row; one that moves is a finding.
22. **Follow-ups touched.** Follow-up 13 (the forced pick re-running a released pass) is unchanged by 8d (a probe pass is never logged);
    Task 9 counts it again. Follow-up 12 (ACA years ending unforced at the cap) may shrink with 8c; Task 9 recounts the restated cap gate.

### Task 8c: the damping fix ("the same premium", ruling 17)

**Files:**
- Modify: `src/us/core/projection/engine-state.js` (`export const PREMIUM_SAME_TOL = 0.01` beside `MAGI_ITER_TOL`, with its comment:
  ruling 17's "why $0.01")
- Modify: `src/us/core/projection/run-projection.js` (the import at `:14`; the update's ACA branch at `:1385`; option Y's condition at
  `:1404` and its comment at `:1389-1396`, which says "exactly equal (===, no tolerance)"; the comment above the update at `:1339-1340`)
- Modify: `tests/unit/us/conversion-fill-draw.test.js` (two new cases; the re-found damped-step case; the Step 3 tripwire comment)
- Docs: `docs/architecture/magi-iteration.md` (the first paragraph's "damped after pass 3"; option Y's definition)
- Not changed: `tests/estimate_sites.js`, `tests/engine-purity.json`, `tests/replay_check.js` (ruling 17)

**Interfaces:**
- `PREMIUM_SAME_TOL` (`engine-state.js`): 0.01, dollars of charged healthcare.
- In the update's ACA branch: `const samePremium = usesMagiEstimate && passLog.length >= 2 && Math.abs(healthcare -
  passLog[passLog.length - 2].charged) <= PREMIUM_SAME_TOL; w = phasePass >= 3 && !samePremium ? 0.5 : 1;`
- Option Y: `Math.abs(healthcare - secHc) <= PREMIUM_SAME_TOL && s < 1 - 1e-3` in place of `healthcare === secHc && s < 1 - 1e-3`.

- [ ] **Step 1: Failing tests** in `conversion-fill-draw.test.js` (through `world()`; relations and same-run facts, no engine literal):
  (a) `'an ACA year whose passes pay the same premium steps undamped'`: `gridOf('mfj', 52, 1500000, 2000000, 60000)` (MFJ 52 /
  750k+750k / 2000k / 60k / none), guard off, at 63 and 64. Premise: every logged pass over the household line (`L.every((p) => p.preConv
  > line)`, the line as in (g)) and charged within `PREMIUM_SAME_TOL` of the first. On the tip 63 ends forced (9 passes, kept drift
  $4.31) and 64 takes 8 passes; after: at both ages `t.forcedPass` false, `L.at(-1).drift <= MAGI_ITER_TOL`, and 64's `t.passes < 8`
  (planning: 63 converges on pass 8 at drift $0.23, 64 on pass 6).
  (b) `'a fill that holds the MAGI estimate takes the secant through sub-cent premium noise'`: `hist R rothConv+aca | real2000` from
  `tests/snapshot_scenarios.js` (its `patch` through `legacyToAccounts` on the normalized base, as the file's `scenarios` cases do),
  `e.accountTrace(undefined, undefined, (await usPlan(w)).rowFnFor(sc.series))`, year index 7 (age 59). Premise: the charges differ
  (`Math.max(...charged) - Math.min(...charged) > 0`) but by at most `PREMIUM_SAME_TOL`; the year's conversion reads the draw. On the tip:
  8 passes, `magiStats.unresolved` +1 for the run (read before and after); after: `t.passes <= 4` (planning: 3), `L.at(-1).drift <=
  MAGI_ITER_TOL`, `t.forcedPass` false, `magiStats.unresolved` +0.
  (c) `'an ACA year whose premium moves between passes keeps the damped step'` is a **premise check** (ruling 7): its household's
  charges differ only by noise, so under the tolerance it takes the secant (planning: 7 passes -> 3). Re-find it now, not in 9b (this
  task removes the premise): sweep the scan grid, guard off, for an ACA year with at least 5 logged passes whose consecutive charges
  differ by more than `PREMIUM_SAME_TOL` on every pair and where a secant would have run (`s < 1 - 1e-3` on some pair); keep the
  assertions, with `Math.abs(L[k].charged - L[k - 1].charged) > PREMIUM_SAME_TOL` in place of `L[k].charged === L[k - 1].charged` being
  false; the comment names the old and the new household and why (8c). If none exists, construct one and say so.
  Run the file: (a), (b) fail on the tip; (c) passes on the tip with its new household.
- [ ] **Step 2: Implement** (Interfaces). Run the file (also `--sequence.shuffle`), on Node 24 and Node 22: (a)-(c) pass. Update the
  tripwire comment of 'an ACA year over the 400% line converts under its IRMAA hold' (planning: that household now converges on pass 6,
  not 8; the assertions hold; the comment's drift list and "8th and last allowed pass" are rewritten from the new run and name 8c).
- [ ] **Step 3:** `npm run test:unit`: list every failure beyond Task 9's list with old / new value and kind (figure / premise, ruling 7);
  do not re-pin. Planning's run (Node 24, US project, 8c alone on the tip) failed, beyond Task 9's ten: 'an ACA year whose premium
  moves between passes keeps the damped step' (Step 1 (c)) and 'the replay check reaches the 162(l) switch (S1) in a converting household' (`SeedS1` not reached: the year now converges before
  the switch). The second is a premise this task removes: re-find its household here (Task 8 Step 5's sweep: self-employed singles
  from 63, ACA on, converting, guard off, spending and balances varied), and its comment says "re-found at S3 Task 8c". The ten of
  Task 9 still fail (record any whose value moved). `node
  tests/estimate_sites.js`, `node tests/engine_purity.js`, `npm run build && node tests/replay_check.js` (`replayMismatch` 0), `node
  tests/aca_magi_iteration.js`, `node tests/two_return_magi.js`, `node tests/se_health.js`, `node tests/cliff_plan.js`.
- [ ] **Step 4:** `magi-iteration.md`: the first paragraph ("damped after pass 3, except a pass charged the same premium as the one
  before it, within `PREMIUM_SAME_TOL`"), option Y's paragraph (the tolerance, why: the fill's `estTrad + conversion` is the bracket top
  only to rounding). Commit: `S3 Task 8c: no damping while the passes are charged the same premium (within a cent); option Y reads the
  same test`. Opus task review (the definition against ruling 17, the re-found premise, the moved checks' sort).

### Task 8d: the ruling-11 probe (ruling 19)

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`conversionMagiCeiling`'s `acaShown` argument; the household cap `:187`, the
  per-return `allowAca` `:144` and its two calls; `CEIL_OUT` `:105` and its comment `:100-104`, its resets `:130-131`; the header's ACA
  paragraph `:85-92`)
- Modify: `src/us/core/projection/run-projection.js` (the declaration beside the holds `:562-570`; the ceiling call `:750-771` and the
  reads after it `:775-780`; the probe after the IRMAA release `:1316-1351`; every record, replay and seed site of the site table; the
  trace record `~:2690`; the replay check's compares `~:698-720`); `testCtl.acaProbeOff` read beside `holdOff` (`:150`)
- Modify: `src/shared/core/projection/run-context.js` (`NO_TEST` gains `acaProbeOff: false`), `src/us/core/cliff-plan/planning.js:33`
  (the test literal), `src/us/core/test-hooks.js` (`testAcaProbeOff`, `assignAcaProbeOff`), `tests/unit/shared/run-context.test.js:44`
  and `:193` (the `Object.keys(ctx.test)` list), `tests/state_modules.js:66` (the `testHooks` field list) (review M5)
- Modify: `tests/estimate_sites.js` (`HOLDS` gains `'acaShown'`; the header comment), `tests/replay_check.js` only if it lists the
  compared fields
- Modify: `tests/unit/us/conversion-aca-ceiling.test.js` (direct calls), `tests/unit/us/conversion-fill-draw.test.js` (the 4b case
  rewritten; new cases)
- Docs: `docs/architecture/magi-iteration.md` (the site table, the probe beside rule 2), `docs/architecture/us-health.md` stays for 9b
- Not changed: `tests/engine-purity.json` (no module-level mutable; `CEIL_OUT` is an existing scratch)

**Interfaces:**
- `conversionMagiCeiling(ctx, { ..., acaShown = 3 })`: household `if (preConvMagi <= acaLine || !(acaShown & 1)) magiCeiling =
  Math.min(magiCeiling, acaLine - MAGI_ITER_TOL);`; per return `allowAca = (line, m, frac, shown) => (m > line && shown ? Infinity :
  allow(line - MAGI_ITER_TOL, m, frac))` with `acaShown & 1` for A and `acaShown & 2` for B. With `acaShown` 3 every double is the tip's.
- `CEIL_OUT` adds `acaLine`, `acaLineA`, `acaLineB` (NaN: none) and `acaProbe`, `acaProbeA`, `acaProbeB` (`preConvMagi > acaLine &&
  !(acaShown & 1)`; per return `preMagiX > lineX` and its bit clear); read right after the call as `ceilAcaLine` ... `ceilAcaProbeB`.
- The year loop: `let acaShown = 0` with the holds; the ceiling gets `acaShown: holdsIn && !probeOff ? acaShown : 3`; the probe
  (ruling 19) sets bits and, when it set one, `if (logged) passLog.pop(); phasePass--; acaProbes++; continue;`. The trace row gains
  `acaShown` (the kept pass's input) and `acaProbes` (the year's probe passes, every phase).
- The secant pair: `let secKept = false` beside `secHold`; set `secKept = ceilRead && (ceilAcaProbe || ceilAcaProbeA || ceilAcaProbeB)` where the
  update stores `secHold = irmaaHold`, reset by its own `secKept = false` beside every `secEst = NaN`; both pair conditions gain
  `&& !secKept` (ruling 19). The trace row gains `secKeptDrops` (test-only: the pair uses `secKept` skipped this year).
- The replay check: `seedShown` beside `seedHold` (ruling 19's seed list) and one `replayCompare(..., 'acaShown', ...)` per branch.
- `ctx.test.acaProbeOff` (test-only): the ceiling always gets 3.

- [ ] **Step 1: Failing tests.** Every "probe-off" run below is a fresh `world()` with `(await
  w.load('us/core/test-hooks.js')).assignAcaProbeOff(true)` before `setState` (so the plan search runs without the probe too), compared
  with an as-built world in the same process (review M6).
  - `conversion-aca-ceiling.test.js` (direct calls, the file's `setup()` and `setup63()`, values hand-computed; read `CEIL_OUT`
    right after each call): `'over the line and not shown, the line still caps (the probe)'`: household `preConvMagi` 155,000 with
    `acaShown: 0` -> 84,599, `acaProbe` true, `acaLine` 84,600; `acaShown: 1` -> Infinity, `acaProbe` false; under the line (50,000)
    `acaShown: 0` -> 84,599, `acaProbe` false. Two returns (the file's case: A over at 100,000, B under at 40,000, household 140,000,
    `shareA` 0.5): `acaShown: 0` -> A's room max(0, (62,599 - 100,000) / 0.5) = 0, ceiling 140,000, `acaProbeA` true, `acaProbeB`
    false; `acaShown: 2` the same (A's bit clear); `acaShown: 1` -> B's room 45,198, ceiling 185,198 (ruling 2). `setup63()` at
    `preConvMagi` 70,000, `irmaaHold: 100000`, `acaShown: 0` -> 62,599, held `[false, false, false]` (the probe pass's cap is below
    the hold: no release can fire on it), and `acaShown: 1` -> (e)'s 100,000, held `[true, false, false]`. Every existing call (no
    `acaShown`: the default 3) keeps its value.
  - `conversion-fill-draw.test.js`, the 4b case `'a year whose no-conversion MAGI is under the line can keep the over-the-line state its
    seed gives it'` becomes `'the probe keeps a year under the line when its no-conversion MAGI is under it'` (same constructed
    household and lump; the premise facts stay: 60 truly over, 61's first `estTrad` higher with the lump, 61 pinned under the line in both
    runs). New facts: with the lump, 61 converts more than $0, its MAGI at or under the line and within `MAGI_ITER_TOL` of `line -
    MAGI_ITER_TOL`, and its `healthcare` under the same run's with `ctx.test.acaProbeOff` (same process: the over state's premium);
    every converting year 61-64 of both runs whose pinned year is at or under the line ends at or under it (planning: without the lump
    S3 keeps the over state at 62-64 too; the probe keeps all of them under). The comment says what the old case pinned and that 8d
    changes it (ruling 19).
  - `'a year truly over the line computes the S3 row after one probe pass'`: `gridOf('mfj', 52, 500000, 2000000, 60000)` (MFJ 52 /
    250k+250k / 2000k / 60k / none), guard off: premise `trace.some((t) => t.acaProbes > 0)`; every row `toStrictEqual` the same
    household's rows with `ctx.test.acaProbeOff` (one process), and each year's `passes` is the probe-off year's plus its `acaProbes`
    (planning: 9 probes, rows identical).
  - `'a two-return year keeps the cap on the return its conversion lifts over the line'`: `gridOf('single-couple', 52, 500000,
    2000000, 130000)`, guard off, at 52-56 (planning: S3 converts $122,099-$131,165 with A's MAGI 129,555-141,592 over its line, the
    pinned A MAGI 59,186-66,552 under, losing $6,210-$7,418 a year; with the probe A's MAGI sits at `lineA - 1` within `MAGI_ITER_TOL`
    and the run lasts 92 -> 94): at each age `row.magiA <= lineA`, `row.healthcare <` the probe-off row's, and the run's `depletedAge`
    not earlier than the probe-off run's.
  - `'a guard-on ruling-11 year keeps its credit'`: from the conversion_sizing grid with its plan (the tools' run): `couple, two single
    returns; 52; 750k+750k; 300k; 130k; sepp` at 52 or `single person; 58; 1500k; 300k; 130k; rule55` at 64 (the guard-on plain list of
    Task 9, both fixed by the prototype); pick the one that, on the real implementation, keeps the year under its line(s) with the
    credit; assert the row's MAGI (per return) at or under the line, and `healthcare` under the probe-off run's at that age. If the year
    ends forced (the second can: the capped conversion lifts the draw over the line, so no capped state is consistent and the pick
    re-runs a pass converting 0), assert `t.picked >= 0` and `L[t.picked].conversion` 0 and say so in the comment.
  - `'the replay check reaches a probed year'`: `ctx.test.replayCheck` on the guard-on household above (phases): `replayMismatch` 0
    and at least one `replayChecked*` kind above 0 in a year with `acaProbes > 0` (if none has phases there, a guard-on grid household
    found by a sweep; say which).
  Run: all fail except the default-argument direct calls.
- [ ] **Step 2: Implement** (Interfaces; ruling 19's sites, one `acaShown` line beside each triple of holds). `node
  tests/estimate_sites.js` passes with `acaShown` in `HOLDS` (and fails on a scratch copy with one site's `acaShown` line removed: say
  you ran it). Run the two files (also shuffled), Node 24 and 22: pass.
- [ ] **Step 3:** `npm run test:unit`: list the failures beyond Task 8c's with old / new value and kind; do not re-pin. Planning's run
  (the prototype on 8c) failed, beyond 8c's list: the 4b case only (rewritten in Step 1). `node tests/engine_purity.js`, `npm run
  build && node tests/replay_check.js` (`replayMismatch` 0; the per-kind counts beside Task 9's), `node tests/two_return_magi.js`, `node
  tests/aca_magi_iteration.js`, `node tests/cliff_guard.js`, `node tests/se_health.js`, `node tests/cliff_plan.js` (T4.3: the year it
  tests is under the line, so the probe never fires there; if it moves, stop and report).
- [ ] **Step 3b: bench_optimize early (review M7).** `node tests/bench_optimize.js --base <dir>/tree-s3b` (`0158a9d`), once, on a quiet
  machine (minutes): its worst head against Task 9's +33.6% (TX@75 endValue). Above +36% against `tree-main3`'s figure (re-run it
  against `tree-main3` if needed): stop and report before Task 9. Task 9 Step 10 stays the gate of record.
- [ ] **Step 4:** `magi-iteration.md`: the site table and the guard paragraph name `acaShown` with the holds; a paragraph "The ACA
  probe (S3, Task 8d)" beside rule 2 (the signal, the measurement pass, the exactness, the residual). Commit: `S3 Task 8d: the ACA line
  keeps its cap until a pass converting nothing shows the year over it (the ruling-11 probe)`. Opus task review (the sites against the
  table, the exactness test, the residual's wording).

### Task 9: measure S3, STOP for the owner

Measurement only (no `src/` or `tests/` change, no re-pin, no `snapshot:update`, no commit). Method and structure: `task-7-report.md`
(S2) and `task-4-report.md` "## Re-measure at bd7ea0b", with these trees and changes. Long runs in the background, the benches last
and alone; remove every scratch worktree when done.

**Run twice (owner, 2026-11-02, ruling 12).** The first run (2026-11-02, `task-9-report.md`, `<dir>/s3-movers-owner.md`) measured
`2fc43c7`, `b5ec3ab` and `0158a9d` and stopped; the owner's answers are rulings 12-22. The **re-run** comes after Tasks 8c and 8d, on
four trees (ruling 20), and writes `task-9r-report.md` and `<dir>/s3-movers-owner-r.md`. Every step below applies to the re-run with
"the tip" meaning Task 8d's commit; the additions marked **(re-run)** are new. The first run's dumps of `2fc43c7`, `b5ec3ab` and
`0158a9d` (`s3-main3-*`, `s3-s3a-*`, `s3-*`) are reused if their tool versions still match (`git diff 0158a9d -- tests/snapshot.js
tests/conversion_sizing.js tests/solver_scan.js` empty), else re-dumped; the first run's `s3-*` (then the tip) is renamed `s3b-*`.

**Trees and dumps** (`<dir>`; each built with `npm run build`, `node_modules` a junction to the branch's):
- `tree-main3` = `2fc43c7` (the parent; dumps `s3-main-*`), `tree-s3a` = Task 8's commit (`s3a-*`), `tree-s3b` = `0158a9d` (Task 8b,
  `s3b-*`), the branch tip (`s3d-*`; **re-run**); the instrumented copies for the cap gate and the knife-edge (`<dir>/s2-logapply.js`
  on `tree-main3` and the tip, as S2 did; they must change no row). The world sweeps of the first run (`<dir>/s3sweep/s3.sweep.js`, the
  trees patched by `<dir>/s3-prapply.js`) run on the tip twice, as built and with `ctx.test.acaProbeOff` (8c alone), for the
  per-row 8c / 8d split (ruling 20) and the probe's before / after counts; `s3-prapply.js` gains the trace's `acaProbes` and
  `acaShown` only if it does not already pass them through (the real trace has them).
- The old main `d67ebd3`: `main-snap/`, `s1z-main-cs.json`, `s1z-main-scan.json` (still in `<dir>`).
- The WIP `9ab5cad`: `<dir>/tree-wip` (exists, built) re-dumped with this branch's tools (`s3-wip-snap`, `s3-wip-cs.json`,
  `s3-wip-scan.json`): the old `wip-*` dumps predate the path fingerprint (`5101504`, `5c2f27d`), so they compare by tuple only; and
  the analysis's figures (54 snapshot movers, 2 earlier / 5 later; S1 + the WIP: 73 movers, 2 earlier first home draws, both the WIP's
  own: `hist R everything | real2000` 83 -> 82, `hist R rothConv+aca | mc1` 76 -> 75).

- [ ] **Step 1: Dumps.** For each tree: `node tests/snapshot.js --root <tree> --only US --dump <dir>/<t>-snap --update-nothing`, `node
  tests/conversion_sizing.js --root <tree> --dump <dir>/<t>-cs.json`, `node tests/solver_scan.js --root <tree> --sizing --conv-only
  --dump <dir>/<t>-scan.json`; `node tests/snapshot.js --only Canada` on the tip (376 exact).
- [ ] **Step 2: Movers** (`tests/compare_household_dumps.js`, `node tests/snapshot.js --compare`, `<dir>/s2-cmp.js` /
  `s2-snapcmp.js` for the three-way attribution: a row that differs on `tree-s3a` and not again at the tip is the rule's, one equal to
  main on `tree-s3a` and different at the tip the margin's, one that moves on both "both", one that differs on `tree-s3a` and equals main at the tip "the margin undoes the rule"). Per set (snapshot 541, `conversion_sizing`
  384, `solver_scan` 960): rows, differ, deplete on both with the path differing, earlier / later run-out, earlier / later first home
  draw, end value up / down, cause rule / margin / both / undone. **At the top: every row earlier than `2fc43c7`** (run-out or first home
  draw), each marked also earlier than `d67ebd3`, than the WIP, or both; then the WIP's two earlier rows by name (where they are on
  the tip). End-value drops over 1% by row with a traced cause. Summary counts also against `d67ebd3` and against the WIP. The
  snapshot movers table in full (scenario, run-out, first home draw, end value before -> after, cause).
  **(re-run)** Four-way: the tip against `0158a9d` adds the causes "damping" (8c) and "probe" (8d), split per row by ruling 20's
  probe-off re-run; the summary counts per set against `2fc43c7` and against `0158a9d` both. **The earlier rows again (ruling 15):**
  each of the first run's 27 (snapshot 2, scan 25 including conversion_sizing's 5) by name with its tip run-out / first home draw:
  still earlier than `2fc43c7` or not, and for each still earlier its cause (budget hit: `'none'` ages proposed / tried; `greedyAccepts`
  refused; other) and whether 8d's cap now keeps any of its over-the-line years; plus any new earlier row. The rows still earlier
  because of the budget are the owner's budget question.
- [ ] **Step 3: The S2 interplay** (ruling 8): Task 5's `<dir>/measure.js` and `<dir>/s2-t6.js` on the three trees: `'none'` winners,
  hit years and households, kept `'none'` ages (by age band: under 65, 65+), `noneProposed` / `noneTried`, budget hits, sized plans
  kept; and per mover whether a kept `'none'` age is an over-the-line age. Say whether (a)-(c) held. **(re-run)** On the four trees;
  the kept sized plans (`conversion_sizing`'s own count, 140 at `0158a9d`) on the tip are the keep floor's base (Task 9b Step 2:
  floor(0.9 x the tip's count)); a fall from 140 is a row of its own with its cause (8c or 8d, by the switch).
- [ ] **Step 4: `magiStats` and the gates** (snapshot / `conversion_sizing` grid / scan grid, `<dir>/magistats.js`,
  `scanplans.js`): forced, unresolved, `capPicked`, mean passes per converting year, years at the 8-pass cap (converting).
  Restated cap gate (`<dir>/s2-unc.js` on the instrumented builds): kept phases accepted unconverged (drift over $1, not forced) that
  `2fc43c7` did not have; the 3 S1 years and the 16 S2 years are `2fc43c7`'s, so they are not new; list any new year with its class
  (an ACA straddle is follow-up 12's class: ruling 10). Gate: no more unresolved years (0 / 0 / 0 at `2fc43c7`). Forced increases
  listed with the households. Releases in ACA (`usesMagiEstimate`) years (`trace.holdReleases`) and forced picks that re-ran a
  released pass (`passLog[picked].released`), per set, against `2fc43c7` (expected 0 there): follow-up 13's reach.
  **(re-run)** (i) The unresolved years by name: `hist R rothConv+aca | real2000` at 59 expected resolved by 8c (planning: 3 passes),
  `| crashFirst` at 59 expected still unresolved (ruling 18: the unit-slope kink to 0, then a continuous premium under the damped
  step); say for each which change did what, and list any other. (ii) The forced and slow (7-8 passes, not forced) ACA years by cause,
  as the first run's table (all over and the same premium / straddle / rest) on `0158a9d`, 8c alone (probe off) and the tip; "the same
  premium" now read with `PREMIUM_SAME_TOL` (recount `0158a9d`'s column with it too, and say how much the first run's `===` class
  differed). Planning (guard off, default grid; 8d on the planned pop-and-repeat variant): forced 183 -> 55 with 8c, 55 -> 40 with 8d. (iii) The probe: probe passes per set
  (`acaProbes`), years whose kept pass kept the cap over the line (the trace's `acaShown` bit clear and the kept `preConv` over the
  line), and the forced years among those (a kept cap whose capped conversion lifts the draw over the line ends forced on a pass
  converting 0: the brake's outcome, the credit kept; name them); also the two-return years where return A is over its line and
  return B converts, which the probe's `conversionAmount === 0` gate never probes for A (a gap older than `dce2b2f`, re-review N2):
  count them and name the worst. (iv) Mean passes per converting year and all passes per set on
  `0158a9d`, 8c alone and the tip (planning: -1.8% with 8c guard off; +5.2% guard off / +3.4% guard on with 8d, the planned variant). (v) The pairs `secKept` dropped (planning: 68 guard off default, 64 smooth, 56 guard on, changing no guard-off row), read from a
  test-only trace field `secKeptDrops` (the year's count of pair updates skipped for `secKept`; Task 8d adds it to the trace row beside
  `acaProbes`, re-review N4).
- [ ] **Step 5: The straddle count and ruling 11's count.** Standard-mode rows only (historical and Monte Carlo cycles are not re-run
  pinned; say so in the results). Two-return years are counted per return against each return's own line, and listed apart from
  the household-line years (re-review N3). (a) From the traces, the ACA conversion years whose passes' `preConv`
  sits on both sides of the line (never `realizedPre`: ruling 4), by outcome (converged in which regime / forced / unresolved), and
  their pass counts. (b) Ruling 11 (review C1): per set, every kept converting ACA year over its line whose year re-run with the
  conversion pinned to 0 at that age (`rothBracketByAge` age: 0, as `noConversionYear`; through a scratch Node script on
  `tests/unit/helpers/world.js`, or a page hook taking that override, say which) lands at or under the line: the count, the credit
  each lost (the row's `healthcare` less the pinned row's), and whether the plan rescued the household elsewhere (a stay-under or a
  kept `'none'` at another age); the guard-off runs (`plan_off_anchor.js`'s set, and the grids with the guard off) apart. Also on the
  WIP and `d67ebd3` for scale (on `d67ebd3` the brake made the count 0 by construction).
  **(re-run)** (b) on the tip with the probe and with `acaProbeOff` (8c alone), guard on and guard off, per set, in the first run's
  classes (plain / sized / knife). The plain years left at the tip are split: (b1) the probe fired in that year (`acaProbes > 0`):
  ruling 19's residual, the no-conversion year itself over at the full premium (planning: the HoH 52 / 58, 1500k or 500k, 2000k, 60k
  households; guard on 4 years, guard off 8 of 9); (b2) no probe fired (the cap was never read over the line, e.g. a sized fallback
  or a stay-under phase): each named with its class. Planning (default grid, the planned variant): guard off 118 -> 9, guard on 6 -> 4.
- [ ] **Step 6: Conversions off** (`<dir>/s1h-cs-off.js`, 768 rows): 0 differ from `2fc43c7` (ruling 4); a mover is a finding.
  **(re-run)** The gate is unchanged and exact on the tip (8c + 8d): 0 of the 768 conversions-off rows differ from `0158a9d`, nor
  from `2fc43c7`. A mover is a finding, reported with its mechanism, never an accepted mover. (The plan review's 8c-alone build: 0 of
  768; 8d passes `acaShown` 3 to every pass that does not fill under the ceiling.)
- [ ] **Step 7: The knife-edge** (`<dir>/s1z-ascan.js` + `s1h-asstats.js`, snapshot + `conversion_sizing` grid): converged ACA years
  charged over $100 under their realized price, `2fc43c7` 23 + 13; expected 0 at the tip on the years the ceiling caps; any left,
  classified (a sized line target, a stay-under, a two-return year, unforced at the cap (follow-up 12), a settled 162(l) year (the
  settlement can move MAGI after convergence, where the $1 bound does not hold), other). Information: converged years whose realized MAGI is within
  $1 over the IRMAA line their ceiling read (ruling 5 leaves IRMAA alone; a large count is a note for the owner).
- [ ] **Step 8: Other sets.** `tests/replay_check.js` over its sets and the full `solver_scan` grid (with `<dir>/s1h-replay-ripa.js`
  for the RI / PA copies): `replayMismatch` 0, the per-kind counts. `tests/plan_off_anchor.js` (guard off) and `tests/snapshot_ui.js`
  against `2fc43c7`.
- [ ] **Step 9: The fixture and the motivating household** (`<dir>/fixture-run.js`): run-out, conversions by age, `cliffChoice` by
  age and the bracket card's rows on `2fc43c7`, `tree-s3a`, the tip, beside the recorded main (`fixture-main.json`), WIP
  (`fixture-wip.json`: 94), S1 (`fixture-s1.json`), S1 + WIP (`fixture-s1zwip.json`) and S2 (`fixture-s2.json`). Planning's figures
  for the rule alone are in the section's head (95; the plan keeps 10%; 67's conversion goes; the 22% row 94): the card's "your
  setting" row lasting a year less than the plan's is a flagged card row for the owner, confirmed on the tip, and checked against
  ruling 11 (does the 22% row convert in a year whose no-conversion MAGI is under the line and end over it?). `std R rothConv+aca+live`'s conversions at 60-61, run-out
  and end value on the same builds (the WIP took it from 96 to 95). **(re-run)** The same on the tip; the 22% row is accepted
  (ruling 14), so only a change from the first run's figures (95; 10% kept; the 22% row 94) is reported.
- [ ] **Step 10: Benches** against `tree-main3`, one quiet machine, the environment recorded: `bench_runs_interleaved.js
  --warm-analysis` (+5%), `bench_solver.js` (+30%; a 7-round result near the gate is re-run at 15 rounds), `bench_planning.js` (250 ms
  off / 350 ms on), `conversion_sizing.js` time (under 60 s), `bench_optimize.js` (+40%; also against `d67ebd3`, where NY@100
  endValue sat at +28.0% after S2); `yardstick.mjs --jobs 2` and the `solver_scan` time as information. A failed gate stops here for
  the owner. **(re-run)** Against `tree-main3` as before, and bench_optimize also against `tree-s3b` (`0158a9d`), so the share of 8c
  and 8d is visible: the first run's closest gate was TX@75 endValue +33.6% against +40%. A result within 4 points of a gate
  (bench_optimize above +36%) is re-run once and flagged to the owner with the head that moved and whether its planning count moved.
- [ ] **Step 10b: The full chain on the tip** (review I4): after `npm run build`, each plain-node script of `npm test`'s chain run
  individually (the chain stops at the first failure: read the list from `package.json`), and `npm run test:ui` in full; every
  failure listed with its old / new value and its kind (ruling 7), beside the Vitest list. `test_bracket_search.js`'s sized-plan case
  is checked for its premise here. **(re-run)** `test_plan_optimizer.js`'s stale-plan case is a premise (ruling 16): say whether it
  still fails on the tip. Any check 8c or 8d moved beyond Tasks 8c / 8d's lists is added to the sort.
- [ ] **Step 11: STOP.** Write `.superpowers/sdd/2026-10-31-b5-followups/task-9-report.md` (the method, every table, the gate verdicts
  one line each, "Concerns for the owner") and `<dir>/s3-movers-owner.md` (short, plain words: the counts, every earlier row, every
  drop over 1%, the snapshot movers table, the fixture, the gates, ruling 11's count with its design question, the failing checks
  sorted into figure / premise (which tests change household), rulings 1-11). Show the owner; wait for an accept or a rejected row
  (then back to the design with the owner). **(re-run)** `task-9r-report.md` and `<dir>/s3-movers-owner-r.md` the same way, with
  rulings 1-22 and these questions for the owner, each with its numbers: the earlier rows still at the S2 budget (ruling 15: accept /
  raise the budget for over-the-line ages / walk them first); `crashFirst`'s unresolved year (ruling 18: accept, or the step-free
  secant as a follow-up); ruling 11's residual (ruling 19 (b1): accept, or a design that prices the probe at the credit); and any
  bench within 4 points of its gate. The gates are the first run's, unchanged (the conversions-off gate exact: Step 6). The owner
  file says in one line that the first report's "the candidate fix would also reach the two new unresolved years" was wrong for
  `crashFirst` (ruling 18: after a unit-slope kink to conversion 0 its premium moves by dollars a pass, so it is never "the same
  premium"), so the expected "no more unresolved" FAIL (snapshot 0 -> 1) is no surprise (review M8).

### Rulings 23-31 (owner after the second STOP and `fable-analysis.md`, 2026-11-02; addendum planning the same day)

The owner, as the ledger records it: "Build it, keep brake": build the all-none candidate in `sizePass` in PR 3 (plan, review,
implement), keep the old ACA brake on the planless path, re-measure on one tree, then stop at the movers table. Q2-Q5 and the other
concerns of `task-9-rerun-report.md` are accepted (rulings 29-30).

**What this addendum was checked against (planning, 2026-11-02).** A scratch worktree at `9fb1163` (`<scratch>/e8/tree`, Node
v24.21.0, `node_modules` a junction; never in the branch) with scratch switches (`globalThis.__BRAKE`, `__BRAKEPLAN`, `__NOMARGIN`,
`__NO8C`, `__ALLNONE`, `__ALLNONELAST`; the patch is `<scratch>/e8/e8-switches.diff`), driven by `<scratch>/e8/go.mjs` (the 384 x 2
guard-off grid rows against Fable's `go-main-*.json` of `2fc43c7`), `gon.mjs` (a guard-on planning, the kept candidate's measure
against its applied run), `grid.mjs` + `cmp.mjs` (the guard-on grid, 384 x 2, before / after), `anb.mjs` (Fable's 25 earlier rows
and 24 drops), `sweep.mjs` and `hh.mjs` (single households), and the US Vitest project with each switch on (`vt-brake.log`,
`vt-an.log`). `<scratch>` is this session's scratchpad (the directory holding `b5/`).

23. **The decision.** Task 8e (the all-none candidate) and Task 8f (the planless brake) are built in PR 3 as separate commits after
    Task 8d; Task 9r re-measures the tip on one tree against `2fc43c7` and `9fb1163` and STOPs at the movers table; Task 9b follows only
    after the owner's OK. Two tasks, not one: they touch disjoint code (8e the planner, `computeCliffPlan`'s `sizePass`; 8f the year
    loop's ceiling call) and disjoint populations (8e runs only with the guard on, inside the planning; 8f changes only runs with the
    guard off, which never plan), so no row can be moved by both, each commit's movers attribute themselves on one tree, and each gets
    a scoped review. Order: 8e, then 8f (either order gives the same tip).
24. **8e: the all-none candidate runs after both walks, outside the budget (my call; the analysis proposed "tried first").** One extra
    `apply` run per pass: cur's conv plus `'none'` at every age of the proposal run's `cliffConvNone` that cur's conv does not hold
    (`rest`), tried when `rest.length >= 2`, or `rest.length === 1` with the budget hit, accepted only by `greedyAccepts(m, cur)`;
    the keep rule (`bracketCandidateBetter(cur, base)`) is unchanged. A lone `rest` age with the budget left is skipped because the
    `'none'` walk tried it and refused it (the walk tries every `'none'` age not in conv while the budget lasts). With the budget hit,
    a lone `rest` age is the walk's untried age: a refused `'none'` trial stays in `rest`, so a hit budget with a refused trial leaves
    two or more (review M3).
    - *Why after, not first (measured, `grid.mjs`, guard on, the 384-household grid per mode, against `9fb1163`):* tried first (before
      the shortlist walk, counted in the budget), the candidate changes the greedy path whenever it is accepted, so a household whose
      walk found a good plan can end on a worse one: default 73 rows differ, end value **down in 35** (worst **-9.87%**, `couple, two
      single returns; age 52; 401(k) 250k A + 250k B; taxable 300k; spending 60k; sepp`, and -7.99% for its none / rule55 twins), up 37,
      6 later, 0 earlier; smooth 68 differ, 26 down. Tried after the walks it can only replace the walk's final plan by a better one
      (`greedyAccepts`), so the pass's result is at least the walk's on both ages and the score: default 29 rows differ, **0 down**, 26
      up, 6 later, 0 earlier; smooth 23 differ, 0 down, 18 up, 8 later, 0 earlier. Fable's 25 earlier rows: both placements restore the
      same **21 of 25** (run-out and first home draw at or later than `2fc43c7`), and neither makes a row earlier than `9fb1163`.
    - *Why outside the budget:* the rows it exists for are the ones whose walks used all 24 runs and accepted none (`accepted 0`,
      `budgetHit`): a candidate inside the budget would never run for them. `tried`, `budgetHit` and the walks are exactly `9fb1163`'s;
      the candidate is reported apart (`allNoneTried`, `allNoneAges`), so every count S2's tests read keeps its meaning.
    - *Why it never makes a row earlier, per pass:* the walks are unchanged, and the candidate replaces their final `cur` only through
      `greedyAccepts` (no earlier run-out or first home draw). The kept plan still passes `bracketCandidateBetter` against `base`. So
      each pass's result is at least `9fb1163`'s pass result (call it the pass's *walk plan*: `cur` before the candidate when the walk
      is kept, else `base`; no run needed).
    - *With the levers (review I1; checked in scratch, guard added).* When both passes run, the pick between them is
      `leverPlanStands(lever, off)`, i.e. `planCandidateBetter`, which is only a partial order on the two ages. Example: at `9fb1163`
      the lever walk plan L1 stood against toggle off's O1. The candidate can improve O1 to an O2 with a later home draw but an earlier
      run-out than L1. L2 (at least L1) then no longer beats O2, the fallback returns O2, and O2 runs out earlier than `9fb1163`'s plan.
      **The guard** is a pure helper in `solver.js`, `leverPassStands(lever, off, leverWalk, offWalk)`. The lever pass stands when
      `leverPlanStands(lever, off)`, or when `leverPlanStands(leverWalk, offWalk)` (`9fb1163`'s own pick, recomputed with no run)
      and `off` runs out or first draws on the house earlier than `leverWalk`. The plan is then the lever pass's, at least L1 on both
      ages, so "never earlier than `9fb1163`" holds per planning.
      - The cost: in that case the toggle's guarantee is held against toggle off's walk plan (O1, which L1 beat: `9fb1163`'s
        guarantee), not against O2. That trade loses neither guarantee against `9fb1163`.
      - The other direction needs no guard. If `9fb1163` fell back to O1 and L2 now beats O2, L2's ages are at least O2's, which are
        at least O1's.
      - Measured: the scan grid sets `withdrawalMixEnabled: false` (`scan-grid.mjs:38`), so `offPass` never ran on the 768 rows above.
        With `withdrawalMixEnabled: true` on all 768 (scratch `grid.mjs` `__MIX`; `offPass` ran in 108 + 114 households), the
        candidate (after, without the guard) gives 0 earlier and 0 down against `9fb1163` (24 + 25 rows differ, 6 + 8 later, 21 + 20 up).
      - The case the guard covers was not reached, so the guard is tested on hand-written measures (Task 8e (e)), and Task 9r Step 4
        measures the lever households.
    - *What it restores, checked (`anb.mjs`):* 21 of the 25 grid rows (every MFJ 52 / 250k+250k / 2M / 130k row on TX, RI and PA, both
      modes, most now a year *later* than `2fc43c7`: 95 / 89 against 94 / 88 for the TX none household, because the candidate turns
      off the 65-72 conversions too; the default two-return 52 sepp row; smooth single 58 / 2M / 130k rule55; smooth HoH 52 sepp); the
      drops of Fable's list move toward `2fc43c7` (default MFJ 58 / 2M / 130k rule55 3,843,501 -> 3,906,010 against 3,907,721; default
      two-return 52 / 2M / 130k none 277,463 -> 338,913 with the home draw 90 -> 91, above `2fc43c7`'s 297,972). Not restored (4): default
      `HoH 58; 500k; 2000k; 130k; rule55` (91 / 86 against 91 / 87; its `cliffConvNone` is 62-72 and the all-none over them is refused:
      Fable's 58-63 block was the converting ages, not the proposal's `'none'` list); smooth `two single returns 52; 250k+250k; 2000k;
      130k; sepp` (95 / 89 against never / 90: refused; **Fable's analysis counted this row restored, but its own figures, 95 / 88
      against never / 90, are not: by them its candidate restored 22 of 25, not 23**); smooth `single 58; 500k; 300k; 60k; none` (84 / 76 against 85 / 77: ruling 11's credit-price
      residual, as Fable found); smooth `HoH 58; 500k; 2000k; 130k; rule55` (90 / 86 against 91 / 86: the family stage, ruling 31). A
      variant over the ages under 65 only restored 20 (it loses the default two-return row): not taken.
    - *The kept count rises:* `conversion_sizing`'s grid (= the default scan grid) kept 137 at `9fb1163`, 145 with the candidate
      (tried first: 147); smooth 98 -> 106. The keep floor of Task 9b reads Task 9r's measured count (ruling 30).
    - *Not in the year loop:* no estimate site, record, replay or snapshot; no module-level mutable (locals of `sizePass`); the replay
      check sees only `apply` runs of conv plans with `'none'` ages, which S2 already runs. Cost: at most one `apply` run per pass (two
      per planning with `offPass`); the grid's planning time did not move measurably (37 s against 40 s for 384 plannings).
    - Cost if wrong: if the owner wants "first", it is the same block moved above the shortlist walk and counted in `tried` (the 35 / 26
      drops above come with it).
25. **8f: the brake's condition is the guard setting, `!ctx.inputs.cliffGuardEnabled`, not `ctx.plan === null` (checked).** The
    planning's own runs at the user's bracket have `ctx.plan === null` with the guard on: stage 0's `run('choose', held)` and the off
    anchor `run('off', held)` (`run-projection.js`, `select`: `held` is null for the user's bracket). Gated on `ctx.plan === null`, the
    brake would apply to those runs and not to the family subsets, the sized pass or the kept plan's `apply` run, so a kept candidate
    measured from the braked `choose` run would not be the run that applies it. Measured (`gon.mjs`, `__BRAKEPLAN`): MFJ 52 / 250k+250k /
    2000k / 130k, all three elections: the kept candidate measured 93 / 87, its applied run **91 / 85** (earlier than `9fb1163`'s
    93 / 87). The engine reads `cliffGuardEnabled` nowhere else (`grep`: only `planForState`, `computeCliffPlan`, `bracketSearchApplies`
    and `sizingApplies`, none inside `runProjection`), and the planner never runs with the guard off (`computeCliffPlan` returns
    `{ plan: null }`), so "guard off" is exactly the planless path the owner means: the user's runs with the cliff guard off, their
    historical and Monte Carlo cycles, and Optimize's trials of such a state. It also does not reach the bracket card's rows (guard-on
    plannings): Fable's "protects the card's 'your setting' row" held only under the `ctx.plan === null` reading, which is unsound.
26. **8f: what the brake is, and its exactness (checked).** With the guard off the ceiling gets `acaShown: 0` on every pass (S3 Task
    8d's "not shown" state, so the ACA line caps at the line less `MAGI_ITER_TOL` whatever the year's MAGI, household and per return:
    the old brake, a year over the line converts 0), and the probe and `secKept` never fire (the three CEIL_OUT probe flags are read as
    false). Both are needed: passing 0 alone would loop (the probe sets a bit the next pass does not read, gives `phasePass` back and
    `continue`s again on every pass) and `secKept` would drop secant pairs `2fc43c7` used. The IRMAA holds and their gate (`holdsIn`) are
    unchanged. `acaShown` stays 0 all year, so every record carries 0, every replay restores 0 and the replay compares hold; no new
    carried value, no `scalarSnapshot` entry, no site (`tests/estimate_sites.js` unchanged: 13 / 4 / 7 / 1 / 2), no module-level mutable
    (`acaBrake` is a `const` of the run beside `probeOff`; `tests/engine-purity.json` unchanged). Measured (`go.mjs`, the 384 x 2
    guard-off grid rows against `2fc43c7`): S3 as built, default 203 rows differ, 117 down (summed -$34.9M on this scratch's end
    values; Fable's -$41.4M figure summed the down rows only), 23 earlier; **with the brake, 296 / 384 identical (smooth 317), 0 earlier,
    0 later, the largest difference -$11,831 (-0.086%, two single returns 52 / 750k+750k / 300k / 60k), summed -$23,871 (smooth
    -$24,165)**; with the brake and the margin and 8c switched off (scratch), **384 / 384 identical in both modes** (end value, run-out,
    first home draw). So every guard-off difference from `2fc43c7` left after 8f is the margin (Task 8b) or the damping fix (Task 8c),
    both accepted for every run; Task 9r checks this exactly, not by sampling. Single household (`hh.mjs`): `single 62; 500k; 2000k;
    130k`, guard off, converts $96,599 / $29,319 / $28,594 at 62-64 on `9fb1163`, **0 / 0 / 0** with the brake (home draw 91 -> 92 =
    `2fc43c7`'s, end value 82,996 -> 192,899).
27. **8f's test switch: `ctx.test.acaBrakeOff` (test-only, `assignAcaBrakeOff`), the brake off with the guard off.** Eight cases of
    `conversion-fill-draw.test.js` (list in Task 8f) test S3 / 8c / 8d's over-the-line behaviour on guard-off households (one phase:
    phases clear the pass log); with the brake they lose their premise (`vt-brake.log`: they fail, nothing else beyond the expected
    list). The switch restores S3's planless run, which is exactly the run the planning makes at the user's bracket with the guard on
    (plan null, `'off'`; ruling 25): a real path, not a test-only one. Task 8f pins that equivalence (`toStrictEqual` rows, one
    process). Five sites as Task 8d's `acaProbeOff` (review M5 there): `NO_TEST`, `planning.js:33`, `test-hooks.js`,
    `run-context.test.js:44` / `:193`, `tests/state_modules.js:66`.
28. **What each task changes in the Vitest list** (the list of `task-9-rerun-report.md` (10b): 10 failing tests in 7 files, plus
    `tax-caches`' load timeout under a full parallel run). 8e: no new failure once its restated checks are in (with the scratch
    candidate counted in `tried`, `conversion-none`'s 'a full budget tries no none age' and `conversion-plan`'s 'the run budget = 1' failed:
    8e does not count it, and restates their `'none'` / target assertions, Task 8e Step 1); the gap-households check stays failing on its
    figures only. 8f: no new failure once the eight cases take the switch. Any value a task moves inside the ten is recorded old / new
    for Task 9b.
29. **Accepted by the owner (2026-11-02), recorded:**
    - *Q2:* `hist R rothConv+aca | crashFirst`'s unresolved year at 59 stays (ruling 18); follow-up: the step-free secant.
    - *Q3:* ruling 19's credit-price residual stays (guard on 9 scan years, $9,884-$9,983 each, a lower bound: smooth `single 58; 500k;
      300k; 60k` is the same class outside that list); follow-up: Fable's ambiguity band (keep the cap when the probe's no-conversion
      MAGI is over the line by less than the premium difference's draw), measured before adoption.
    - *Q4:* the bench_optimize gate is restated per planning: per head, `ms / plannings` on the tip against `tree-main3`, +40%; the
      whole-search time and the plannings count are reported as information (the tip's +40% came from 29 plannings against 15, not
      slower plannings: 5,334 passes per planning against 7,457).
    - *Q5:* bench_runs_interleaved's +5% readings (+8.9 / +7.3 / +1.2 on three runs) are accepted as noise plus a bounded cost (the
      probe's +0.4% to +5.7% passes); Task 9r runs it once at 21 rounds and reports it.
    - *The concerns:* the new forced class (22 guard-on years at 63-64 ending forced on a pass converting $0: the brake's outcome, the
      credit kept); the -19% row (`MFJ 52; 250k+250k; 300k; 60k; sepp; RI`, 8c, still later than `2fc43c7`); `gains-capped`'s property
      check, now vacuous, re-found in Task 9b.
30. **The keep floor.** The count fell 140 -> 137 with 8d (accepted); after 8e Task 9r measures it again (planning: 145) and Task 9b
    Step 2 pins floor(0.9 x Task 9r's count).
31. **Follow-up outside PR 3: the all-none candidate at family selection** (Fable's alternative B): the two grid rows 8e misses by the
    family stage (smooth HoH 58 / 2M / 130k rule55; and the default HoH 58 rule55 row if its cause is the same: Task 9r says) and the
    `single 62; 500k; 2000k; 130k` -8.3% rows (x3; the `none` family with `'none'` at 62-64 reaches `2fc43c7`'s 326,510 on the tip).
    One extra run per bracket per planning; measured first. Task 9b writes it into `docs/next-batches-plan.md`'s follow-ups list.

### Task 8e: the all-none candidate in the sizing pass (ruling 24)

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`sizePass` `~3121-3176`: the candidate after the `'none'` walk, the report, the
  keep test; its comment block `~3107-3120`; `offPass` `~3191-3193` and the comment above `const sizes` `~3177-3188`)
- Modify: `src/us/core/cliff-plan/solver.js` (`leverPassStands` beside `leverPlanStands` `~:215`, exported), and the lever fallback
  in `computeCliffPlan` `~:3195` (`leverPlanStands(pass.best, offSized.best)` -> `leverPassStands(pass.best, offSized.best,
  pass.walkBest, offSized.walkBest)`)
- Modify: `docs/superpowers/inventory/module-map.md` (through `npm run analyze`: `solver.js`'s export list gains `leverPassStands`)
- Modify: `tests/unit/us/conversion-none.test.js` (two new cases, `setup()` taking a patch; 'a full budget tries no none age' restated)
- Modify: `tests/unit/us/conversion-plan.test.js` (`SIZED_KEYS`; the gap-households invariants; NY 75's kept-pass counts; 'the run
  budget (ctx.test.convRunBudget = 1)' restated; `leverPassStands` by hand; no figure re-pinned)
- Docs: `docs/architecture/cliff-plan.md` ("The pass", "The keep rule", "`report.sized`" bullets of the whole-run sizing pass)
- Not changed: `tests/estimate_sites.js`, `tests/engine-purity.json`, `tests/replay_check.js`, `tests/conversion_sizing.js` (it reads
  `kept`, `tried`, `accepted`, `budgetHit`; `nConv` counts the candidate's ages too, which is what its "sized years" means)

**Interfaces:**
- In `sizePass`: `attempt`'s run-and-measure split into `const trialMeasure = (trialConv) => measure(cur.family, cur.intents,
  run('apply', makePlan({ ... as today ... conv: trialConv })), cur.orders, cur.splits, trialConv);` (`attempt` = `trialMeasure`,
  `tried++`, the `greedyAccepts` acceptance, as today). After the `'none'` walk, whether or not the budget was hit:
  `const rest = noneAges.filter((a) => !(a in conv)); let allNoneTried = false, allNoneAges = [];` and, when `rest.length >= 2`,
  `allNoneTried = true;` a trial `{ ...conv }` with `'none'` at each age of `rest`, `const m = trialMeasure(trial)`, and if
  `greedyAccepts(m, cur)`: `cur = m; conv = trial; allNoneAges = rest;`. Not counted in `tried` or `accepted`; `budgetHit` unchanged.
  The condition is `rest.length >= 2 || (rest.length === 1 && budgetHit)` (ruling 24, M3). Before the candidate: `const walkBest =
  accepted > 0 && bracketCandidateBetter(cur, base) ? cur : base;` (the pass's result as at `9fb1163`, no run); `sizePass` returns
  `{ best, report, walkBest }`.
- `leverPassStands(lever, off, leverWalk, offWalk)` (`solver.js`): `leverPlanStands(lever, off) || (leverPlanStands(leverWalk,
  offWalk) && (late(off.depletedAge) < late(leverWalk.depletedAge) || late(off.homeDrawAge) < late(leverWalk.homeDrawAge)))`, with
  `late` = null as Infinity. In `computeCliffPlan` it replaces the `leverPlanStands(pass.best, offSized.best)` test of the second
  pass.
- The keep test: `if (!((accepted > 0 || allNoneAges.length > 0) && bracketCandidateBetter(cur, base))) return { best: base, report };`
- `report.sized`: `{ proposed, tried, accepted, budgetHit, kept, convIntents, noneProposed, noneTried, allNoneTried, allNoneAges }`
  (`allNoneAges`: Partner A's ages, ascending numbers, the candidate set when accepted, `[]` otherwise; `convIntents.none` counts them,
  so the kept conv has `accepted + allNoneAges.length` ages); `offPass` gains `allNoneTried` and `allNoneAges` after `noneTried`.

- [ ] **Step 1: Failing tests** (through `world()`, relations and same-process comparisons, no engine literal; the planning figures
  in brackets are from the scratch prototype, `<scratch>/e8`). `conversion-none.test.js`'s `setup(patch = the snapshot household's)`;
  a scan-grid household is `scanHouseholds({ conversions: true })`'s default-mode row (as `conversion-fill-draw.test.js`'s `gridOf`),
  guard on; `u` is the same household's planning with sizing off (`testHooks.testConvSizingOff`, as `conversion-plan.test.js`'s
  `setup`), its kept candidate the unsized base:
  - (a) `'the all-none candidate turns a depleting household's over-the-line block off at once'`: `couple, MFJ; age 52; 401(k) 250k A +
    250k B; taxable 2000k; spending 130k; elections none` (at `9fb1163`: proposed 21, `noneProposed` 19, tried 24, accepted 0, the budget
    hit, `plan.conv` null, run-out 93 / home 87; `2fc43c7` 94 / 88). Premise (true on `9fb1163` too): `s.accepted === 0`, `s.budgetHit`,
    `u.depletedAge !== null`, and for each of the first three ages of the proposal run's `cliffConvNone` (built as 'cliffConvNone lists
    the ages whose winner is none' builds it) the unsized plan with `'none'` at that age alone, applied and measured, fails
    `greedyAccepts(m, u)` (one age cannot move a depleting household's run-out: why the walks accept nothing). Then: `s.allNoneTried`
    true; `s.allNoneAges` `toStrictEqual` the proposal's `cliffConvNone` (accepted 0: every age); `Object.keys(plan.conv).map(Number)`
    `toStrictEqual` `s.allNoneAges`, every value `'none'`; `s.kept`; `late(k.depletedAge) > late(u.depletedAge)` and `late(k.homeDrawAge)
    >= late(u.homeDrawAge)` (prototype: 95 / 89); the plan's `apply` run measured equals `k` (`[depletedAge, homeDrawAge, value]`);
    every `'none'` age's row converts 0; `s.tried <= 24`.
  - (b) `'the all-none candidate only ever replaces the walk's plan by a better one'`: (b1) accepted after a walk that kept targets:
    `single person, HoH (1 child b. 2016); age 52; 401(k) 500k A; taxable 2000k; spending 60k; elections none` (prototype: the walk
    accepted 5, irmaa1 under-targets and `'none'` ages, then the candidate). Premise: `s.accepted > 0 && s.allNoneAges.length >= 2`. Then:
    no age of `s.allNoneAges` is a walk age; `Object.keys(plan.conv).length === s.accepted + s.allNoneAges.length`; the walk's own plan
    (the kept conv less `s.allNoneAges`), applied and measured, is `walk`, and `greedyAccepts(k, walk)` is true while `greedyAccepts(walk,
    k)` is false. (b2) refused: `couple, MFJ; age 52; 401(k) 250k A + 250k B; taxable 300k; spending 60k; elections none` (prototype: the
    walk accepted `{ 57: 'b10' }`, the candidate tried and refused). Premise: `s.accepted > 0`, `s.allNoneTried`, `s.kept` (so `k` is
    the walk's `cur`, the plan the candidate was compared with; review M2). Then `s.allNoneAges`
    `toStrictEqual([])`, `Object.keys(plan.conv).length === s.accepted`, and the refused trial rebuilt (the kept conv plus `'none'` at
    each proposal `'none'` age not in it), applied and measured, fails `greedyAccepts(m, k)`. If a household no longer has its premise
    on the real tree, find one by the sweep (`<scratch>/e8/sweep.mjs`'s condition) and say which in the comment.
  - (c) `conversion-none.test.js` 'a full budget tries no none age': the last-but-two assertion becomes "every `'none'` in the plan is
    the candidate's": `Object.entries(conv ?? {}).filter(([, t]) => t === 'none').map(([a]) => Number(a))` `toStrictEqual`
    `s.allNoneAges` (the walk with the full budget still tries no `'none'` age: `s.noneTried === 0` stays).
  - (d) `conversion-plan.test.js`: `SIZED_KEYS` gains `'allNoneTried', 'allNoneAges'`; in the gap-households check `convIntents`' sum is
    `s.kept ? s.accepted + s.allNoneAges.length : 0`, `Object.keys(on.plan.conv).length` and `k.conv` are `s.accepted +
    s.allNoneAges.length`, the "each kept age removed alone" loop runs over the walk's ages (not in `s.allNoneAges`), and, when
    `s.allNoneAges.length`, the block removed whole fails `greedyAccepts` against the kept plan; 'the run budget (convRunBudget = 1)':
    `Object.keys(one.plan.conv).length - one.report.sized.allNoneAges.length <= 1` in place of "at most one target" (the walk's own
    targets).
    - Also restated (review M1):
      - The gap check's pin `c.expect(s.convIntents.none, name).toBe(0)` (`:121`) becomes the walk's own: `s.convIntents.none -
        s.allNoneAges.length`. It stays "a pin, not an invariant".
      - NY 75's kept-pass case: `k.conv` (`:173`) and `Object.keys(on.plan.conv).length` (`:183`) become `s.accepted +
        s.allNoneAges.length`.
      - The CA case's `s.kept` false (`:209`) is a premise ("not kept"). If the candidate is kept there on the real tree, Step 2 sorts
        it as a premise for Task 9b (another not-kept household); it is never re-pinned to true.
    - The counted total (`afterAll`, 230 now, failing at 216 on `9fb1163`) gains one check per gap household with a kept candidate (the
      block removed whole) plus the by-hand cases of (e). Step 2 records the new count; Task 9b pins it with the figures.
    - The gap check's figure assertions (ruling 7's row) stay failing until Task 9b.
    - Planning's `vt-an.log` ran the "after" placement (`__ALLNONELAST`), but counted in `tried` and `accepted`. That is why
      'the run budget = 1' and 'a full budget tries no none age' failed there and nothing else did. With the planned count apart,
      only those two cases' `'none'` / target assertions need restating.
  - (e) `conversion-plan.test.js`, beside 'greedyAccepts by hand': `'leverPassStands by hand: the lever pass stands, or its walk plan
    stood and toggle off's improved plan is earlier'`. The measures are `{ depletedAge, homeDrawAge, score, n }` literals, with distinct
    objects in each argument:
    - Each of the following holds:
      - `lever` beats `off`: true.
      - Neither stands; walks: `leverWalk` (90, 85) did not beat `offWalk` (90, 86): false.
      - The I1 case. `lever` = `leverWalk` = (90, 85, 100); `offWalk` = (89, 85, 100); `off` = (89, 87, 100): true (`off` runs out
        earlier than `leverWalk`).
      - The walks stood, but `off` (91, 86, 100) dominates `leverWalk` (90, 85): false (the fallback is no earlier).
      - Equal ages, scores: `leverPlanStands`'s $1 rule as `planCandidateBetter` gives it.
    - Run alone it fails (`leverPassStands` is not exported).
  Run the two files: (a), (b1) fail on `9fb1163` (`s.allNoneTried` undefined); (b2), (c), (d) fail on the missing fields; (e) on
  the missing export.
- [ ] **Step 2: Implement** (Interfaces), then `npm run analyze` (`solver.js` exports `leverPassStands`; review I3's rule) and `node
  scripts/module-map.js --check --require-purpose`. Run the two files (also `--sequence.shuffle`), Node 24 and Node 22: pass except
  the gap check's figure assertions (list them with old / new values, and the new counted total).
- [ ] **Step 3:** `npm run test:unit`: the failures are `task-9-rerun-report.md` (10b)'s ten (record any value 8e moved, old / new);
  any other is listed with its kind (ruling 7) and not re-pinned. `node tests/engine_purity.js`, `node tests/estimate_sites.js`, `npm
  run build && node tests/conversion_sizing.js` (no earlier row against sizing off; the kept count printed: planning 145),
  `node tests/cliff_plan.js`, `node tests/bracket_search.js`.
- [ ] **Step 4:** `cliff-plan.md`: after "Then the `none` ages", a bullet "**Then the all-none candidate** (S3 Task 8e, ruling 24)"
  (what, when, outside the budget, accepted only by `greedyAccepts`, why after the walks: the measured drops of "first"); the keep rule's
  "When an age was accepted" reads "or the candidate"; `report.sized`'s and `offPass`'s field lists; "The toggle's guarantee after
  sizing" gains the guard (`leverPassStands`, ruling 24: why the plain `leverPlanStands` pick could end earlier than `9fb1163`, and
  that the guarantee is then held against toggle off's walk plan). Commit: `S3 Task 8e: the sizing
  pass tries every proposed 'none' age at once after its walks (the all-none candidate)`. Opus task review (the placement against
  ruling 24, the restated invariants, the never-earlier argument per pass and the lever guard).

### Task 8f: the planless brake (rulings 25-27)

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`acaBrake` beside `probeOff` `~:152`; the ceiling call's `acaShown` `~:791`;
  the three `ceilAcaProbe*` reads `~:805-807`; the comments at `:151`, `~:564-570` and above the probe `~:1365`)
- Modify: `src/shared/core/projection/run-context.js` (`NO_TEST` gains `acaBrakeOff: false` after `acaProbeOff`),
  `src/us/core/cliff-plan/planning.js:33` (`acaBrakeOff: testHooks.testAcaBrakeOff`), `src/us/core/test-hooks.js`
  (`testAcaBrakeOff: false`, `assignAcaBrakeOff`), `tests/unit/shared/run-context.test.js:44` and `:193`, `tests/state_modules.js:66`
- Modify: `docs/superpowers/inventory/module-map.md` (through `npm run analyze`: `test-hooks.js`'s export list, `module-map.md:277`,
  gains `assignAcaBrakeOff`; review I3)
- Modify: `tests/unit/us/conversion-fill-draw.test.js` (two new cases; the switch in the guard-off S3 cases)
- Docs: `docs/architecture/magi-iteration.md` (the ACA probe's bullets: a sub-bullet "Guard off: the brake"; the gate paragraph's
  "The ACA probe's `acaShown` (below) has the same gate" `~:127`)
- Not changed: `src/us/core/withdrawals/roth-conversion.js`, `tests/estimate_sites.js`, `tests/engine-purity.json`,
  `tests/replay_check.js` (ruling 26)

**Interfaces:**
- `acaBrake = !ctx.inputs.cliffGuardEnabled && testCtl.acaBrakeOff !== true` (a `const` of the run, beside `holdOff` / `probeOff`).
- The ceiling call: `acaShown: acaBrake ? 0 : holdsIn && !probeOff ? acaShown : 3`.
- The reads after it: `ceilAcaProbe = !acaBrake && CEIL_OUT.acaProbe`, likewise `ceilAcaProbeA`, `ceilAcaProbeB` (so the probe and
  `secKept` never fire with the brake; `ceilAcaLine*` unchanged).
- `ctx.test.acaBrakeOff` (test-only): the guard-off run as S3 left it (the planning's planless run at the user's bracket).

- [ ] **Step 1: Failing tests** (`conversion-fill-draw.test.js`, through `world()`, relations, one process):
  - (a) `'with the guard off the ACA line still caps the conversion in a marketplace year over it (the planless brake)'`:
    `gridOf('single-person', 62, 500000, 2000000, 130000)`, guard off (the household of 'an ACA year over the 400% line converts under
    its IRMAA hold'). Premise: the same household with `assignAcaBrakeOff(true)` (a fresh world) converts more than $0 at 62, 63 and 64
    with each row's MAGI over its household line (`fplForHousehold(ctx, acaHouseholdSize(...), i) * 4`) (planning: $96,599 / $29,319 /
    $28,594). Then, braked: at 62-64 `conversionAmount` 0 (planning: 0 / 0 / 0, as on `2fc43c7`), every year's `acaProbes` 0 (the
    trace), and `late(braked.homeDrawAge) >= late(brakeOff.homeDrawAge)` (planning: 92 against 91; `2fc43c7` 92).
  - (b) `'the brake-off switch is the planning's planless run'` (ruling 27): the same household, guard off with `assignAcaBrakeOff(true)`,
    against guard on run planless (`storeRunContext(state, { plan: null, planMode: 'off' })` and `runProjection` directly, as
    `noConversionYear` does, so no plan applies): the rows `toStrictEqual`, and the traces' `passes` equal year by year.
  - (c) **The guard-off cases, sorted by their premise (review I2).**
    - The brake overrides `acaProbeOff`. `acaBrake ? 0 : ...` comes first, so a probe-off world on a guard-off household is braked
      too. Every case below therefore gets `assignAcaBrakeOff(true)` on **all** its worlds, the probe-off world included, before
      `setState`, with a comment line: "the brake off (S3 Task 8f): this case tests S3's planless run, the run the planning makes at
      the user's bracket".
    - **Group A.** The premise is S3, 8c or 8d behaviour on a guard-off household: the case calls `assignAcaProbeOff`, reads
      `acaProbes` / `secKeptDrops`, or its household was written or re-found at S3 or later (the comment says so). Every Group A case
      takes the switch.
      - 'an ACA year whose premium moves between passes keeps the damped step' (re-found at 8c).
      - 'an ACA year whose passes pay the same premium steps undamped' (8c).
      - 'a pass converting nothing releases the held tier when the year sits higher' (its first household re-found at S3).
      - 'an ACA year over the 400% line converts under its IRMAA hold'.
      - (g) 'a year whose pre-conversion MAGI crosses the line between passes ...'.
      - (g2) 'a straddling year is never kept under its realized price'.
      - 'the probe keeps a year under the line when its no-conversion MAGI is under it' (and its probe-off world).
      - 'a year truly over the line computes the S3 row after one probe pass' (and its probe-off world).
      - 'a two-return year keeps the cap on the return its conversion lifts over the line' (and its probe-off world).
      - 'a return with no share of the conversion keeps the S3 rows' (and its probe-off world).
      - 'an over-the-line ACA year at 63-64 can release its hold'.
      - 'the replay check reaches the 162(l) switch (S1) in a converting household' (re-found at 8c).
      - 'the cap pick skips a pass that released its hold' (re-found at S3).
      - Also any case Task 8e or 8f adds on a guard-off household for S3 behaviour.
    - **Would pass trivially without the switch** (named so the review checks them; braked, each would compare the brake with the
      brake or test a year that converts 0):
      - 'a return with no share of the conversion keeps the S3 rows': its `on.rows toStrictEqual off.rows` holds, both braked.
      - 'an ACA year whose passes pay the same premium steps undamped': braked, 63 and 64 convert 0 in 2 passes (checked), so
        `passes < 8` and the drift hold with nothing damped.
      - The probe-on / probe-off comparisons of the three probe cases above.
      - The eight cases that fail braked (`vt-brake.log`) fail on their premise assertions, not trivially. The list is in Group A.
    - **Group B.** The premise predates S3 (S1 / S2 cases whose households were found on trees that had the brake). Each is run
      braked and with the switch, and keeps the brake (no switch). The brake gives these cases their original regime. A Group B case
      that fails braked is a finding: stop and report it.
      - 'a conversion year with no finite limit fills against its own draw'.
      - 'a forced plain-fill year breaks an overpay tie by the smallest drift'.
      - 'a unit-slope year steps to the conversion kink and settles'.
      - 'an ACA year whose fill reads the draw settles while the premium holds'.
      - 'a secant year settles its draw and gains estimates without the damping'.
      - 'the replay check reaches a forced year with a finite hold (R1)'.
      - 'the replay check reaches apply's split pass that drew nothing (R2)'.
      - 'an ACA year at the cap keeps the forced pick'.
      - 'a converged year logs no cap pick'.
      - The release / cap cases on households not listed in Group A.
    - Report, per case: its group, and whether its rows differ braked against the switch.
  Run the file: (a) fails on Task 8e's commit (63 converts $29,319); (b) fails (no switch: `assignAcaBrakeOff` is not a function).
- [ ] **Step 2: Implement** (Interfaces), then `npm run analyze` (`test-hooks.js` exports `assignAcaBrakeOff`) and `node
  scripts/module-map.js --check --require-purpose` (review I3). Run the file (also shuffled), Node 24 and Node 22: passes. `node
  tests/estimate_sites.js`, `node tests/engine_purity.js` (both unchanged), `npx vitest run tests/unit/shared/run-context.test.js`,
  `node tests/state_modules.js`.
- [ ] **Step 3: Exactness against `2fc43c7` (ruling 26), scratch:** the 384 x 2 guard-off grid rows (`<scratch>/e8/go.mjs` pointed at
  this tree, or the same loop through `tests/unit/helpers/world.js`) against `tree-main3`'s: run-out and first home draw identical in
  all 768; then on a scratch copy of this tree with `<scratch>/e8/e8-switches.diff`'s `__NOMARGIN` and `__NO8C` hunks applied (by hand
  if it no longer applies), every row identical (end value too). Also the 768 **conversions-off** grid rows with the guard off (review
  M4: the brake passes 0 on every pass, `!holdsIn` ones too, and the ceiling's finite value sets `estUsed`). Braked against
  `acaBrakeOff`, every row is byte-identical (`JSON.stringify` of the rows; planning `<scratch>/e8/cof.mjs`: 384 + 384 identical).
  A difference left is a finding: stop and report it. Not committed.
- [ ] **Step 4:** `npm run test:unit` (the failures are the ten; list any value 8f moved), `npm run build && node tests/replay_check.js`
  (`replayMismatch` 0), `node tests/plan_off_anchor.js` (guard off: it compares with another tree; report its count against
  `tree-main3` here, as information for Task 9r), `node tests/cliff_plan.js`, `node tests/aca_magi_iteration.js`, `node
  tests/two_return_magi.js`, `node tests/se_health.js`, `node tests/cliff_guard.js`.
- [ ] **Step 5:** `magi-iteration.md`, in "The ACA probe" bullets: "*Guard off: the brake (S3 Task 8f, rulings 25-27).*" (the
  condition and why not `ctx.plan === null`; `acaShown` 0, the flags read false, so a marketplace year over the line converts 0 as
  before S3; exact against `2fc43c7` but for the margin and 8c; `ctx.test.acaBrakeOff`). The gate paragraph's "The ACA probe's
  `acaShown` (below) has the same gate: those passes get 3" gains "except with the guard off, where every pass gets 0 (the brake)".
  Commit: `S3 Task 8f: with the cliff guard off
  the ACA line still caps every marketplace year's conversion (the old brake on the planless path)`. Opus task review (the condition
  against ruling 25, the exactness check, the switched cases).

### Task 9r: re-measure on one tree, STOP for the owner (ruling 23)

Measurement only (no `src/` or `tests/` change, no re-pin, no `snapshot:update`, no commit), the method of Task 9 on **one tree**: the
tip (Task 8f's commit, dumps `s3f-*`) against `2fc43c7` (`tree-main3`, dumps `s3-main3-*`, reused) and `9fb1163` (dumps `s3d-*`,
reused), if `git diff 9fb1163 -- tests/snapshot.js tests/conversion_sizing.js tests/solver_scan.js` is empty (else re-dump both).
Writes `task-9r-report.md` and `<dir>/s3-movers-owner-3.md`. Long runs in the background, the benches last and alone; remove every
scratch worktree when done.

- [ ] **Step 1: Dumps** on the tip (Task 9 Step 1's three commands) and `node tests/snapshot.js --only Canada` (376 exact).
- [ ] **Step 2: Movers**, per set (snapshot 541, `conversion_sizing` 384, `solver_scan` 960): Task 9 Step 2's columns against
  `2fc43c7` and against `9fb1163`; the cause per row is 8e (the row's planning kept the candidate: `report.sized.allNoneAges` non-empty,
  from a world sweep of the tip) or 8f (a guard-off row) or other (a finding). **Never earlier:** every row earlier than `2fc43c7` by
  name (expected: the 4 grid rows of ruling 24 and their RI / PA copies if any, `conversion_sizing`'s default HoH 58 rule55 row, the
  snapshot's `hist R everything | real2000`, home 83 -> 82, with the analysis's mechanism: `2fc43c7`'s 83 rested on $20.5k of
  knife-edge undercharging at 53-54), each with its cause (family stage, ruling 11 residual, refused candidate); and **0 rows earlier
  than `9fb1163`** (ruling 24: a row earlier than `9fb1163` is a finding). Drops over 1% against both trees by row.
- [ ] **Step 3: The guard-off population (rulings 25-26; the table the analysis found missing).** The 768 guard-off grid rows (both
  modes) and `tests/plan_off_anchor.js` (541 scenarios, `--base tree-main3`): differ / earlier / later / up / down / summed and worst end
  value against `2fc43c7` and against `9fb1163` (planning: against `2fc43c7` 296 + 317 identical, 0 earlier, 0 later, worst -0.086%;
  against `9fb1163` the analysis's guard-off losses reverse: end values **up**, about +$34.9M summed in the default grid (scratch's
  net figure; Fable's -$41.4M was the down rows alone), with run-outs and home draws mostly later; review M6). *As measured (Task
  9r) and ruled (owner, 2026-11-03):* "never earlier than `9fb1163`" was too strong for guard-off rows. 12 grid rows and 1 historical
  scenario are a year earlier than `9fb1163`, each exactly at `2fc43c7`'s ages: S3's over-the-line conversion had helped them, and
  the brake gives back main's result, the brake's intended outcome. For guard-off rows the gate is "never earlier than `2fc43c7`". Every differing row checked on the scratch copy with the margin and 8c off
  (Task 8f Step 3): identical there. Historical and Monte Carlo scenarios are in `plan_off_anchor`'s set; any of them that differs is
  traced the same way.
- [ ] **Step 4: The all-none candidate (ruling 24).** Per set: households where it ran (`allNoneTried`), where it was kept (`allNoneAges`
  non-empty), the mean ages it set, the kept sized plans (`conversion_sizing`'s own count: planning 145; the keep floor's base), budget
  hits; Fable's 25 earlier rows and 24 drops by name with tip / `2fc43c7` / `9fb1163` figures (planning: 21 of 25 restored; the drops
  per `<scratch>/e8/anb.mjs`'s run). **The lever households (ruling 24, review I1):** the 768 grid rows re-planned with
  `withdrawalMixEnabled: true` (scratch, as `<scratch>/e8/grid.mjs`'s `__MIX`; both modes) on the tip and on `9fb1163`, plus the
  snapshot's withdrawal-mix scenarios. Count: rows where `offPass` ran, differ / earlier / later / up / down against `9fb1163`, and the
  plannings where `leverPassStands` kept the lever pass that `leverPlanStands` alone would have dropped (a scratch counter). Planning,
  with the candidate and no guard: 108 + 114 with `offPass`, 0 earlier, 0 down. A row earlier than `9fb1163` is a finding.
- [ ] **Step 5: The gates, short.** `magiStats` per set (forced, unresolved, `capPicked`, passes); unresolved: only `hist R rothConv+aca |
  crashFirst` at 59 (accepted, ruling 29; any other fails the gate); conversions off: the 768 rows (`<dir>/s1h-cs-off.js`, guard on)
  identical to `2fc43c7` and `9fb1163` (exact; a mover is a finding), and the same 768 with the guard off identical to `9fb1163`'s
  (review M4); the knife-edge (`<dir>/s1z-ascan.js` + `s1h-asstats.js`): 0; `node
  tests/replay_check.js` over its sets and the scan grid (with the RI / PA copies): `replayMismatch` 0; ruling 11's count guard on
  (the b1 residual, `task-9-rerun-report.md`'s classes) and guard off (expected 0: with the brake no guard-off marketplace year converts
  over the line); the fixture (Dana and Chris, `<dir>/fixture-run.js`): a change from the re-run's figures is reported.
- [ ] **Step 6: Benches** against `tree-main3`, one quiet machine, the environment recorded: bench_optimize **per planning** (ruling 29:
  per head `ms / plannings` on both trees, +40%; whole time and plannings as information; also against `9fb1163`, rebuilt as
  `<dir>/tree-s3d`, so 8e's share shows; expected: up to two more `apply` runs per planning, the sized trials' plannings included
  (review M7), so per planning a few percent at most); `bench_runs_interleaved.js --warm-analysis --rounds 21` (+5%, reported, ruling 29);
  `bench_planning.js` (250 ms off / 350 ms on); `bench_solver.js` (+30%); `conversion_sizing.js` time (under 60 s).
- [ ] **Step 7: The full chain and `npm run test:ui` on the tip** (Task 9 Step 10b): every failure listed with old / new and its kind;
  expected: the re-run's (the ten Vitest checks, `tests/snapshot.js` US movers, `snapshot_ui.js`, `test_bracket_search.js`'s sized-plan
  case, `test_plan_optimizer.js`'s stale-plan case), and a check 8e or 8f moved beyond Tasks 8e / 8f's lists is added to the sort.
- [ ] **Step 8: STOP.** `task-9r-report.md` (method, tables, gate verdicts one line each, concerns) and `<dir>/s3-movers-owner-3.md`
  (short: the counts, every row earlier than `2fc43c7` with its cause, the guard-off table, drops over 1%, the snapshot movers, the
  gates, rulings 23-31). Show the owner; Task 9b starts only after an accept.

### Task 9b: after the owner's OK: baselines, re-pins, the keep floor, docs

**Files:** `tests/snapshots/us.json` (and the UI baselines only if `snapshot_ui` moved), the failing Vitest files of Tasks 8, 8b, 8c
and 8d, `test_plan_optimizer.js` and `test_bracket_search.js` (premises), `tests/plan_off_anchor.js:1-10` (its baseline commit),
`tests/conversion_sizing.js`, `src/us/index.html` (badge V153; the `rothConvEnabled` info bubble), `README.md:~91-92`,
`docs/architecture/us-health.md`, `magi-iteration.md`, `cliff-plan.md`, `test-inventory.md`, `docs/next-batches-plan.md`, the spec's
status line (section 2).

**After Tasks 8e, 8f and 9r (rulings 23-31).** The re-pins name 8e ("the all-none candidate") and 8f ("the planless brake") as
causes too; the premise list adds any check Task 9r sorted as a premise; the docs below say the guard-off rule (with the cliff guard
off the conversion stays capped short of the ACA cliff in every marketplace year, as before S3; the rule of S3 and the probe apply to
guard-on runs, the plan deciding); `docs/next-batches-plan.md`'s follow-ups gain ruling 29's two (the step-free secant, the ambiguity
band) and ruling 31 (the all-none candidate at family selection); the bench notes state the bench_optimize gate per planning; the PR
body lists rulings 1-31 and says Tasks 8, 8b, 8c, 8d, 8e and 8f's commits leave unit tests failing until this one.

**The premise list (rulings 7, 16)** after the re-run: ruling 7's table, plus `test_plan_optimizer.js`'s stale-plan case (find inputs
where the applied plan loses to the automatic plan on the tip, so its "stale plan" checks run again) and `test_bracket_search.js`'s
sized-plan case (already in the table); the two premises 8c removed ('keeps the damped step', the 162(l) switch replay) and 8d's 4b
rewrite are done in their tasks, not here. A check the re-run adds to the sort is handled here by its kind.

- [ ] **Step 1:** `npm run snapshot:update` (US only expected; Canada must not move). Re-pin each failing **figure** check with a
  one-line reason comment naming its cause from the movers table (the rule, the margin, the damping, the probe, or S2 absorbing an
  over-the-line year); for
  each **premise** check find a household that has the premise on the tip (or construct one) and keep the assertion: a premise check
  is never re-pinned to the new value; fix counted totals;
  run the re-pinned files alone, shuffled, on Node 22 and Node 24. Update `plan_off_anchor.js`'s header baseline if it moved.
- [ ] **Step 2: The keep floor (D).** In `tests/conversion_sizing.js`: `const FLOOR = <n>;` with a comment (the tip's commit, the date,
  the measured kept count, "90% of it, rounded down: spec 4.3, D"), and `if (keptCount < FLOOR) failures.push('the kept count ' +
  keptCount + ' fell below the floor ' + FLOOR)`. `<n>` = floor(0.9 x the kept count Task 9r measured at the tip: ruling 30); `2fc43c7` kept 148, `9fb1163` 137.
  Check: with `FLOOR` one above the count the tool exits 1 naming the floor; restore. Its header comment and `test-inventory.md` say it.
- [ ] **Step 3: Docs.**
  - `us-health.md`: the line "`conversionMagiCeiling` is unchanged" (`~16`) and the IRMAA ceiling bullet (`~62`): the ceiling's ACA
    rule (caps at $1 under the 400% line while the year's pre-conversion MAGI is at or under it, or while no pass converting nothing
    has shown the year over it (the probe, 8d), household and per return; once shown, the credit is already lost and the line holds
    nothing; the margin and why; the probe's residual).
  - `magi-iteration.md` (8c's and 8d's paragraphs and the site table are already in; here): "The second jump at the line" (ruling 4:
    the ceiling jumps between the line and Infinity as the pre-conversion MAGI crosses the line, now only once the probe has shown
    the year over it; after S1 the conversion jumps only between 0 and the fill's room above the draw; the ACA branch's damped step
    (undamped while the passes are charged the same premium), option Y and the forced pick settle it; the measured straddle count);
    the release paragraph (`held` can now be true at 63-64 over the line, after the probe); the knife-edge margin under the
    convergence tolerance; `crashFirst`'s unresolved year and ruling 11's residual as the owner decided them.
  - `cliff-plan.md`: over-the-line years and the `'none'` walk (ruling 8, with Task 9r's figures), with the all-none candidate
    and the lever guard (8e's paragraphs are in; here, Task 9r's figures: rows restored, kept count, lever households); the stay-under
    is still what gets a year back under the line.
  - The copy has two regimes after 8f (review M5). With the cliff guard **off** (the planless brake, ruling 26), the conversion stays
    capped short of the ACA cliff in every marketplace year, as before S3. With the guard **on**, the cap applies while the year's
    income without the conversion is under the cliff; a year already over it may convert to the bracket, and the plan decides
    (stay-under, `'none'`, sizing).
    - `README.md` (`~91-92`). Replace "capped below the ACA cliff and the next IRMAA tier" with: "capped below the next IRMAA tier
      and, while the year's income without the conversion is under it, below the ACA cliff (with the cliff guard off, below the
      ACA cliff in every marketplace year, as before)". Also the cliff plan bullet: "...and per-year conversion sizes, including
      turning a run of over-the-cliff conversions off at once".
    - The `rothConvEnabled` info bubble (`src/us/index.html:182`). It says "automatically capped short of the ACA subsidy cliff
      (400% FPL, non-enhanced mode) ... and short of the next Medicare IRMAA tier". Change it to: "automatically capped short of
      the next Medicare IRMAA tier and of the ACA subsidy cliff (400% FPL, non-enhanced mode). With the cliff guard on, a year
      whose income without the conversion is already over the cliff may still convert (the credit is already lost), and the cliff
      plan decides whether that pays."
    - The bracket field's bubble (`~185`, "also capped short of the ACA subsidy cliff and the next Medicare IRMAA tier") gets the
      same condition. So does the "How the model works" callout (`~282`, "automatically reduced further to stay short of the ACA
      subsidy cliff"): "... (with the cliff guard on, only while the year's income without the conversion is under it)".
    - Check each against `simulate()` with the guard on and off (CLAUDE.md "Field descriptors and info bubbles"). The residual of
      ruling 19 is why the copy says "income", not a promise for every year. A bubble over ~70 characters stays in `data-tip`.
  - `test-inventory.md`: `conversion-aca-ceiling.test.js`, the changed `conversion-fill-draw.test.js` cases and count (8c's, 8d's and
    8f's included: the two brake cases, the Group A switch), `conversion-none.test.js`'s two 8e cases, `conversion-plan.test.js`'s
    restated checks and `leverPassStands` by hand, `ctx.test.acaProbeOff` and `ctx.test.acaBrakeOff`, `tests/estimate_sites.js`'s
    `acaShown`, T4.3, `conversion_sizing.js`'s floor.
  - `docs/next-batches-plan.md`: a "S3" block in "Batch 5 follow-ups: results" (commits, rulings, movers, the S2 interplay, magiStats,
    the knife-edge, benches, the fixture, re-pins); the follow-ups list: finding 1 done (S3), items 4 and 10 done, the D keep floor
    done; follow-up 13 now reachable at 63-64 over the line, with Task 9's count; ruling 11's class as the owner decided it (8d and
    its residual); `crashFirst`'s unresolved year and the S2 budget rows as the owner decided them at the second STOP; the status
    line (A3 done). The spec's section 2 status line likewise. The stored-plan note (spec 4.5): plans applied at V151-V152 run under the
    new rule silently, on the same terms (owner-accepted for S1).
  - Badge V153.
- [ ] **Step 4:** `npm test` green; `npm run test:ui` in full (CI runs all of it) after `npm run build`. Commit: `S3: baselines, re-pins, the keep floor and docs after the ACA line caps only a year at or under it
  (intended behavior change; owner-approved movers) (US V153)`. Opus review of the branch; fix; open the PR (base `main`) with the
  movers table and rulings 1-22 in the body, and a line that Tasks 8, 8b, 8c and 8d's commits leave unit tests failing until this one
  (squash on merge if the owner prefers).

### PR 3 batch notes (Task 9b, 2026-11-03)

**The owner after Task 9r's STOP (2026-11-03, "Accept, start 9b").**
- Accepted: the 5 rows still earlier than `2fc43c7` (ruling 24's 4 grid rows, each where the all-none candidate was tried and
  refused, and `hist R everything | real2000`, home 83 -> 82), with the all-none candidate at family selection (ruling 31) as the
  follow-up; `crashFirst`'s unresolved year; ruling 11's residual; the new forced class; the -19% row.
- **The guard-off rows.** The 12 guard-off grid rows and 1 historical scenario earlier than `9fb1163` are the brake's intended
  outcome (each equals `2fc43c7`): for guard-off rows "never earlier" is against `2fc43c7` (768 / 768 grid rows, 541 / 541
  `plan_off_anchor` scenarios with main's run-out and first home draw), not against `9fb1163`. Task 9r Step 3's wording above says so.
- **Two bench gates restated, with the measured numbers (Task 9r, `6bab805` against `tree-main3` = `2fc43c7`, 2026-11-02 23:00-23:56,
  quiet machine):**
  - `bench_optimize`: per planning, `ms / plannings` per head against main, +40%; the whole-search time and the plannings count
    are information (ruling 29, Q4). Worst NY@75 lifetimeCost +14.6%; NY@100 endValue +5.0%, TX@75 lifetimeCost +4.3%, CA@75 endValue
    +3.5%; TX@75 endValue -26.4% and NY@75 endValue -23.4% per planning (15 -> 29 and 16 -> 29 plannings). The whole search
    (information): TX@75 endValue +42.4% (3,148 -> 4,482 ms), NY@75 endValue +38.8%. PASS.
  - `bench_runs_interleaved --warm-analysis --rounds 21`: the +5% gate is missed and **accepted as S3's cost**: +9.5% (ct), +7.5%
    (pa), +7.6% (wa) worst on three runs; in the same session `9fb1163` against main +3.9% worst and the tip against `9fb1163`
    -1.6% to +1.6%, so 8e and 8f add nothing measurable.
  - The bench scripts carry no threshold to edit; the gates live in this plan and in `docs/next-batches-plan.md`'s S3 notes.
- **The keep floor: 130** (ruling 30): `conversion_sizing` keeps 145 sized plans at the tip; floor(0.9 x 145) = 130
  (`tests/conversion_sizing.js`, `FLOOR`).

**What Task 9b changed.** The re-pins (figures) and the re-found premises, each test's comment naming its cause, old -> new in
`.superpowers/sdd/2026-10-31-b5-followups/task-9b-report.md`; the parked minors (8b review M1 / M2, 8e review M4, 8f review M1 / M2);
`npm run snapshot:update` (US only: `us.json` 57 scenarios, `ui_us.json`); `tests/plan_off_anchor.js`'s baseline (499 identical,
42 different against `2fc43c7`); the keep floor; the copy (README, the `rothConvEnabled` and bracket bubbles, "How the model works")
in two regimes, guard off and guard on; the docs (`magi-iteration.md`, `us-health.md`, `cliff-plan.md`, `test-inventory.md`,
`docs/next-batches-plan.md`, the spec's status line); US V153.

## PR 4 (S4): the card names the limit; the `cliffChoice` test

Branch `claude/b5-f4-card-limit-8b4f99` (worktree `b5-f4-card-limit-8b4f99`), cut from `origin/main` at `70a1f18` (PR 3, #68,
merged). Rewritten 2026-11-03 against that tree (the first draft predated PR 3's `CEIL_OUT` fields, the ACA probe and the brake),
then revised after the Opus plan review (`.superpowers/sdd/2026-10-31-b5-followups/pr4-plan-review.md`: 4 Important, 15 Minor,
all taken). Badge: US V153 -> V154, in Task 11's commit (the first user-facing change); Canada stays V67 (no Canada file changes:
the shared card renderer `src/shared/ui/results/roth-optimizer-card.js` is not touched).

**What S4 ships (spec 4.4, plus PR 3's ruling 14).**
1. **The held-limit line** (A4, spec 4.4): one line under the bracket table naming the limit that held the dashboard run's
   conversions below the bracket fill, and the ages: "The ACA 400% line holds your conversions at 60-66, so the bracket setting
   changes little here." Engine: a row field `convHeldBy`.
2. **The over-the-line line** (PR 3 ruling 14, the owner's condition for accepting Dana and Chris's 22% row): when a card row runs
   out earlier than the dashboard's run and that row's run converts in a year already over the ACA 400% line before its conversion,
   one line says so: the premium is the same either way, so that conversion's tax buys no credit. Engine: a row field `convOverAca`.
3. **The `cliffChoice` test** (D, spec 4.4): the schedule's why column shows "Filled to ..." on a phased fill year that converts.

**The facts this rests on (read on `70a1f18`; checked by the plan review).**
- `conversionMagiCeiling` (`src/us/core/withdrawals/roth-conversion.js:113-233`) already writes a module scratch `CEIL_OUT`
  (`:112`, registered `"scratch"` in `tests/engine-purity.json:202-203`) with `line`/`lineA`/`lineB` (IRMAA), `held*`,
  `acaLine`/`acaLineA`/`acaLineB` and `acaProbe*`. The household branch caps at `acaLine - MAGI_ITER_TOL` when
  `preConvMagi <= acaLine || !(acaShown & 1)` (`:213`), then at `min(line, irmaaHold)` (`:227`); the two-return branch takes the
  minimum `room` over `allowAca` (A, B, `:156-171`) and the IRMAA rooms (A, B, `:176-189`) and returns early (`:193`). With the
  cliff guard off every pass gets `acaShown` 0 (the brake: the line caps whatever the MAGI, `run-projection.js:800`).
- In `runProjection` (US) the pass body reads `CEIL_OUT` right after the call into `const`s (`run-projection.js:804-817`), sets
  `magiSafeRoom = max(0, magiCeiling - preConvMagi)` (`:819`), and converts in the block at `:982-1038`: a sized year
  (`convTarget !== null`) resolves its target (`resolveConvTarget`), falling back (`convFell`) to the bracket fill under
  `min(convertible, magiSafeRoom)`; a plain year fills under `conversionCap = min(convertible, magiSafeRoom)` (the amount-map
  test-only age lifts the ceiling); a phased `'fill'` year then caps at `naturalRec.conversion` (`:1028`). `convertible` is a block
  `const` (`:987`, the same expression at `:773`). `convertibleTr` (`:753`, set `:1027`) is **not** test-only: the secant step
  reads it (`:1434`, `:1485`); do not repurpose it. A phased `'under'` year and a split year (`yearSplit !== null`) skip the block
  (`convertsThisYear`, `convFill`, `:757-770`).
- The row literal starts at `:2656`; the conditional fields after it (`cliffChoice` `:2733`, `convChoice` `:2738`, `drawOrder`)
  are the model for a field set only in some rows. Every kept path (forced pick, cap pick, replays) re-runs the pass body, so the
  per-pass locals hold the kept pass's values at the row build. **But not `profile`'s fill inputs:** after the conversion the pass
  rewrites `profile.seHealthA/B` (`:1119-1120`, `:1748-1749`, `:1843-1844`, `:1855-1856`), which the fill reads
  (`roth-conversion.js:52`, `:59`). So the held kind is decided **inside the conversion block**, not at the row build (ruling 2).
- The fill is `solveRothConversionTop(ctx, profile, maxAvailable, year, pct, drawBelow)` (`roth-conversion.js:35-75`): it returns
  `maxAvailable` exactly when the fill reaches it (`:68`, after two `ordinaryAt` calls), else a 24-step bisection on
  `[0, maxAvailable]` (resolution `maxAvailable / 2^24`: over $1 only above about $16.8M); with `maxAvailable` Infinity it returns 0,
  so never pass Infinity. `convBracketFor(ctx, age)` (`:259`) is the bracket the year fills to.
- `magiStats` is module state in `src/us/core/projection/engine-state.js:25`, not in any dump; test-only counters go on `hookStats`
  (as `inhNoDrawCalls`, `run-projection.js:1131`).
- `tests/snapshot.js` dumps canonical full rows (`:121-141`, `:184`); `tests/plan_off_anchor.js` compares the whole canonical result,
  rows included (`:101-110`, `:144`); the `conversion_sizing` / `solver_scan` dumps carry fixed path fields only. Whole-row equality
  checks across runs: `tests/unit/us/conversion-choose.test.js:138,153,262,340,352`, `bracket-search.test.js:77`,
  `conversion-fill-draw.test.js:564,731,791`, `tests/cliff_plan.js:113,451,704`, `tests/irmaa_appeal.js:356`.
- The card (`src/us/ui/results/roth-optimizer.js`): `computeRothOptimizer(selected)` runs one variant per bracket through
  `simulateWith` (cached, shared results: never write to them) and keeps `{ bracket, endAssets, afterTaxEnd, score, lifetimeTax,
  depletedAge }` per row; `annotateRothOptimizer()` rewrites the summary and rows; `renderConversionSchedule(selected)` draws the
  schedule. `src/us/ui/results/render.js:195-196` calls both on the open card. Markup `src/us/index.html:244-255`. `planName()`
  returns `'the cliff plan'` / `'the applied plan'`. The world helper loads `ui/` modules (`tests/unit/helpers/world.js:27`); this
  module touches no DOM at load. The state hook is `window.__test_replaceState`.
- The fixture on `70a1f18` (`docs/next-batches-plan.md`, S3 results): run-out 95; the plan keeps the 10% bracket (setting 22%) and
  converts only at 59 ($20,226); the card's rows 10% (cliff plan) 95, 12% 95, 22% (your setting) 94, 24% 92, 32% 90, 35% 88. PR 3
  ruling 14: the 22% row converts $87,579 at 60 and $80,666 at 61, whose no-conversion MAGI (154,965 / 179,120) is over the lines
  (88,883 / 91,105). At 60-66 the fixture's income is above the 10% top, so the 10% fill is likely 0 there and **the dashboard run
  probably shows no held line** (plan review 18): measured in Task 10 Step 1 and taken to the owner as a spec deviation (spec 4.4
  asks for the line on the fixture) at Task 10's STOP. The over-the-line line is what explains the fixture's card.

### PR 4 rulings (planning, 2026-11-03; the owner sees them at Task 10's STOP)

1. **`convHeldBy` values and order.** Spec 4.4 lists `'aca'`, `'irmaa'`, `'stayUnder'`, `'sized'`, `'balance'`. Decided only in a
   conversion-window year (`inputs.rothConvEnabled`, `rothConvStartAge <= age <= rothConvEndAge`), not a split year, not an
   amount-map age (test-only `rothAmountByAge`). With `F` the bracket fill (ruling 2), first match wins:
   (a) `'stayUnder'`: a phased `'under'` year (converts $0 by the plan) with `F >= 1`;
   (b) `'sized'`: `convTarget !== null && !convFell` and `F >= conversion + 1` (the target, `'none'` included, set the amount);
   (c) `'plan'`: a phased `'fill'` year whose conversion the natural cap (`:1028`) lowered (a new per-pass `let natCapped`) and
       `F >= conversion + 1`;
   (d) `'aca'` / `'irmaa'` (the call's `CEIL_OUT.kind`, ruling 3): `magiSafeRoom < convertible`, the conversion within $1 of
       `magiSafeRoom`, and `F >= conversion + 1`;
   (e) `'balance'`: the conversion within $1 of `convertible`, `convertible >= 1`, and the fill reaches the balance (`F` returned
       `convertible`: in a plain year whose cap is `convertible` that is `conversionAmount === convertible`, no extra call).
   No other case can be held (plan review: with this gate a held year matching none of (a)-(e) is unreachable), so there is no
   `heldUnknown` counter. *Why `'plan'` (a sixth value):* the spec's list missed the phased fill year's natural cap (Batch 5 spec
   13.5); the phrase "the cliff plan's fill" is honest. *Cost if wrong:* the owner folds it into another value; one map entry.
   *Why split years are left out:* a split year converts nothing by the plan's draw split (4d D3), not by a limit on conversions.
   *Cost if wrong:* no line for those years; adding `'split'` later is one branch.
2. **Where and how `F` is tested.** Decided inside the pass where the fill's own inputs are live (plan review 1): in the conversion
   block right after `:1028` (cases b-e) and, for a phased `'under'` year, at the same point in the skipped branch, before anything
   rewrites `profile.seHealthA/B`. The result goes into two per-pass `let`s (`heldKind = ''`, `overAca = false`, declared beside
   `convertibleTr` at `:753`, never at year scope, so no `scalarSnapshot` entry) that the row build copies. The convertible balance
   is one per-pass `const` hoisted beside them (`max(0, traditionalBeforeRmd - rmd - seppLocked)`, today computed at `:773` and
   `:987`), read by both. One fill call per gated pass at most: "is the fill at least `x`?" is
   `solveRothConversionTop(ctx, profile, x, year, convBracketFor(ctx, age), estTrad) === x` with `x = Math.min(convertible,
   conversion + 1)` (two `ordinaryAt` calls when the answer is yes, the 24-step bisection when it is no: a no ends the test,
   so a call per gated pass; for (a) `x = Math.min(convertible, 1)`), and it is called only in a year that passes
   the gate: (a), (b), (c), or a plain / fallback year whose conversion is within $1 of `min(convertible, magiSafeRoom)` with
   `magiSafeRoom < convertible`. A plain year below its cap never calls it. A test-only `hookStats.heldFills` counts the calls.
   *Cost if wrong:* a mislabelled year on a card-only line.
3. **The ceiling kind.** `conversionMagiCeiling` writes `CEIL_OUT.kind`: `'aca'` when an ACA cap (household `acaLine -
   MAGI_ITER_TOL`, brake included, or a return's `allowAca` room) is the final minimum; `'irmaa'` when an IRMAA line or hold is; `''`
   when the ceiling is Infinity. A tie goes to `'aca'` (applied first in both branches). Reset with the other fields at the top of every
   call; read into a pass `const ceilKind` beside the others (`:804-817`).
4. **`convOverAca`.** `true` on a year that converts at least $1 whose pass's pre-conversion MAGI is over an ACA 400% line the
   ceiling call computed: household `ceilAcaLine` finite and `preConvMagi > ceilAcaLine`; two returns, `preMagiA > ceilAcaLineA &&
   shareA > 0` or `preMagiB > ceilAcaLineB && 1 - shareA > 0`; absent otherwise. Guard on only in practice (with the bit clear or the
   brake the cap is under the MAGI: room 0, no conversion); enhanced ACA (`acaLine` NaN) never flags. *Why the pass's pre-conversion
   MAGI, not a separate no-conversion run:* it is the MAGI the ceiling read; ruling 19's probe already requires the year to be over
   the line without the conversion before it converts there. *Cost if wrong:* a year within a draw's response of the line could be
   flagged; the line is informational.
5. **Both fields are card-only.** No engine path reads them (Task 10 Step 2 greps). Set in every engine mode (the year loop is
   shared); the cost is at most one fill call in a gated pass. *Cost if wrong:* the bench gate misses; then the test moves behind
   a context flag the card's and the dashboard's contexts set (a follow-up).
6. **Existing whole-row comparisons.** A comparison that fails only on `convHeldBy` / `convOverAca` (the same amount can read
   `'sized'` in a planned run and `'aca'` in a plain one) strips those two keys through one helper (`tests/unit/helpers/row-keys.js`
   for Vitest, `tests/helpers/row-keys.js` for the Node / Playwright scripts: `stripCardFields(row)`), with a comment saying why.
   Any other difference is a bug: reported (CLAUDE.md test rule 7), not fixed in the test commit. `tests/snapshot.js --compare` and
   `tests/plan_off_anchor.js` gain `--ignore <field,field>` (drop those keys from every row of both sides before comparing; test
   tooling only).
7. **The card's lines (Task 11).** Two `<p>` elements under the bracket table, hidden by default: `#rothOptimizerHeld` (from
   `selected.rows`) and `#rothOptimizerOverLine` (from the card's variant rows). With `plan = planName().slice(4)` ("cliff plan" /
   "applied plan"):
   - Held: `The ${limit} holds your conversions at ${ages}, so the bracket setting changes little here.`; with two or more kinds
     `Mostly, the ${limit} holds ...`, `limit` the most frequent kind (ties in the order `aca, irmaa, stayUnder, sized, plan,
     balance`), `ages` that kind's ages. Phrases: `aca` "ACA 400% line", `irmaa` "IRMAA tier", `stayUnder` "${plan}'s stay-under",
     `sized` "tax-aware sizing", `plan` "${plan}'s fill", `balance` "convertible balance".
   - Over the line: `The ${rows} row${s} run${s0} out before ${base}: ${it/they} convert${s1} at ${ages}, years already over the ACA
     400% line without a conversion, so the premium is the same either way and the conversion's tax costs years.` `base` is
     `the ${plan}'s` when the plan sets the bracket (`byPlan`), else `your current setting's`; `rows` lists the brackets ("22%",
     "22% and 24%", "22%, 24% and 32%"); `ages` the union of the listed rows' ages, where an age counts for a row when that row's run
     has `convOverAca` there and converts at least $1 more than `selected` at that age (plan review 11). Trigger: a card row with
     `bracket !== currentBracket`, `!notWorseThan(selected.depletedAge, r.depletedAge)` and at least one such age.
   Ages print through a new exported `ageRanges(ages)` in `roth-optimizer.js` (ascending distinct integers -> `"60-66"`,
   `"59, 61-63"`, `"60"`, `""`). `computeRothOptimizer` adds to each result row `overAca: Map<age, conversion>` read from the
   cached sim's rows (never written to them). The lines sit inside the card, so the light render dims them with it. The final copy
   is the owner's at Task 11's STOP. *Cost if wrong:* copy edits only.
8. **The `cliffChoice` test (D).** A Playwright case on a household with a phased fill year that converts at least $1, found in
   Task 11 Step 1 (search order: the fixture, the gap households of `tests/unit/us/conversion-plan.test.js`, the scan grid via
   `tests/solver_scan.js --dump`); its why cell reads `Filled to <label>`. If none exists, `roth-optimizer.js` exports the why-cell
   formatter as `scheduleWhy(row, bracket)` (today's template expression, unchanged) and a Vitest case feeds it a constructed row;
   the notes say none was found.

### PR 4 Review Focus

- A plain year below its cap: no `convHeldBy`, and no fill test (`hookStats.heldFills` on the fixture equals the number of gated
  window years, pinned).
- A self-employed (162(l)) year: the held kind uses the fill's `seHealthA/B` (decided in the block), not the settled ones.
- A two-return year: `CEIL_OUT.kind` from the per-return rooms (ACA on one return, IRMAA on the other).
- Guard off (the brake): an over-line year held at $0 reads `'aca'`, with no `convOverAca`.
- A kept replay (forced pick, cap pick, won trial) names the kept pass's limit (the in-block decision is re-run on the replay).
- The card: the dashboard's own row and a row lasting as long are never in the over-the-line line.

### Task 10: the row fields `convHeldBy` and `convOverAca`

**Files:**
- Modify: `src/us/core/withdrawals/roth-conversion.js` (`CEIL_OUT.kind`; the comment block above `CEIL_OUT`)
- Modify: `src/us/core/projection/run-projection.js` (the hoisted convertible; `ceilKind`; `heldKind`, `overAca`, `natCapped`;
  the decision after `:1028` and in the `'under'` branch; the row build copies; `hookStats.heldFills`)
- Create: `tests/unit/us/conv-held-by.test.js` (counted); `tests/unit/helpers/row-keys.js`, `tests/helpers/row-keys.js` (ruling 6,
  only if a comparison needs them)
- Modify: `tests/snapshot.js`, `tests/plan_off_anchor.js` (`--ignore`); any whole-row comparison that fails only on the two fields
- Docs (same commit as the code): `docs/architecture/engine.md` (~`:240`, the row fields list: both fields, card-only),
  `docs/architecture/magi-iteration.md` (where `CEIL_OUT` is described: `kind`), `docs/architecture/test-inventory.md` (the suite,
  the `--ignore` options, the helper)

**Interfaces:**
- Produces: `CEIL_OUT.kind` (`'' | 'aca' | 'irmaa'`); `row.convHeldBy` (`'aca' | 'irmaa' | 'stayUnder' | 'sized' | 'plan' |
  'balance'`, absent when not held); `row.convOverAca` (`true`, absent otherwise); `hookStats.heldFills`. No new module-level mutable
  (if one is added, register it in `tests/engine-purity.json` in the same commit).

- [ ] **Step 1: Measure, then write failing tests.** First a scratch run (not committed) of the fixture: load it with
  `JSON.parse(fs.readFileSync('tests/fixtures/dana-and-chris.json'))` and `w.setState(fixture.state)`; the dashboard run through
  `await w.ctx({ withPlan: true })`. Print per window year: age, `conversionAmount`, `cliffChoice`, `convChoice`, `magiSafeRoom`,
  the convertible balance and the 10% fill (from `trace`). Record which years ruling 1 names and why. Then
  `tests/unit/us/conv-held-by.test.js` (counted, `makeCounter`, `afterAll` total):
  - `'the fixture: the dashboard run'`: pin each window year's `convHeldBy` (absent expected at 60-66 if the 10% fill is 0: pin what
    the tree gives, each with a one-line reason) and `convOverAca` (absent at 59, the only conversion, under the line: pin);
    `hookStats.heldFills` pinned.
  - `'the fixture: the card's 22% row'`: after the last `setState`, `const { planForState } = await
    w.load('us/core/cliff-plan/planning.js')`; `const plan = planForState(store.state, optimizerState)` with premise checks
    `plan.bracket === 10` and `plan.bracketFrom === 22`; `pinAges` built as `computeRothOptimizer` builds them (`:49-50`); then
    `stateContextFor()({ ...store.state, rothConvEnabled: true, rothConvBracket: 22 }, { rothBracketByAge: new Map(pinAges.map((a)
    => [a, 22])), withdrawalMixByAge: optimizerState.withdrawalMixByAge })` (follow `variantContext`'s actual signature, read
    `src/us/core/projection/store-context.js` and `src/shared/ui/results/state-context.js`; if `stateContextFor` cannot carry the
    overrides, use `variantContext` through `w.load` the same way). Premise: the run's `depletedAge` is 94 (the card's row). Pin:
    `convOverAca` at 60 and 61, nowhere else (or what the tree gives, with the reason).
  - `'irmaa'`: a single, retired, 66, ACA off, traditional 2,000,000, conversions on at 24% from 66, life 80, `cliffGuardEnabled:
    false`: at least one year reads `'irmaa'`; one year's fill-vs-room hand-checked in a comment.
  - `'aca'` guard on: a couple 60/60, ACA on (not enhanced), retired, spending low enough that `preConvMagi` is under the line (premise
    read from `trace`), conversions on at 22%: a year reads `'aca'`. Guard off: the same couple with spending high enough that
    `preConvMagi > acaLine` (premise asserted): reads `'aca'` (the brake), no `convOverAca`, conversion 0.
  - `'sized'` and `'stayUnder'`: the `conversion-plan.test.js` gap household TX at life 100, with sizing on as that suite turns it on
    (read the suite: `ctx.test` / its sizing switch); one run with both kinds preferred, else two, noted.
  - `'balance'`: a single, 60, retired, ACA off, traditional 30,000, conversions on at 22%, life 75, `cliffGuardEnabled: false`: the
    first window year reads `'balance'` (later years have nothing left: F 0).
  - Self-employed: a household with a 162(l) deduction in a held year (the `se-settlement-plan` / `se-health` suites' households are
    the starting point): its kind is pinned and equals what a direct fill with the pass's `estSeA/B` gives.
  - Two returns: a direct `conversionMagiCeiling` call (`twoReturns: true`) with an ACA line on return A and an IRMAA tier on B:
    `CEIL_OUT.kind` names the smaller room's kind, the rooms hand-checked; and a tie reads `'aca'`.
  Run the suite on Node 24 here; Node 22 is CI's (owner: Node 22 not available locally), noted.
- [ ] **Step 2:** Run: fail. Implement. Run: pass. `npm run test:unit`; the new suite alone and with `--sequence.shuffle`;
  `node tests/engine_purity.js`; `grep -rn "convHeldBy\|convOverAca" src` shows only the writes in `run-projection.js`. Then
  `npm test` (it builds): expected to fail only at `tests/snapshot.js`; every other failure is listed in the report with its
  cause, and handled by ruling 6 (strip, if only the two fields differ) or reported as a bug.
- [ ] **Step 3: Measure (no baseline changes).** On a scratch worktree of `70a1f18` (built) and the tip: `node tests/snapshot.js
  --dump` on both, then `--compare <base> <tip> --ignore convHeldBy,convOverAca`: **0 differences**; also the raw compare's mover
  count, each raw difference one of the two fields. `tests/plan_off_anchor.js --ignore convHeldBy,convOverAca`: 0 differences, and
  its raw count. `tests/snapshot_ui.js`: movers listed. `tests/conversion_sizing.js --dump` and `tests/solver_scan.js --dump` on both:
  identical (this meets the never-earlier gate against the parent; against `d67ebd3` it carries over from PR 3's tables). `magiStats`
  (forced, unresolved, capPicked) through a scratch print around each snapshot scenario (`__test_magiStats`), both trees: identical.
  Benches against the `70a1f18` build, one quiet machine, environment recorded: `bench_runs_interleaved.js --warm-analysis --rounds 21`
  (+5% against `70a1f18`), `bench_solver.js` (+30%), `bench_planning.js` (250 / 350 ms), `conversion_sizing.js` time (under 60 s),
  `bench_optimize.js` (+40%); `tests/yardstick.mjs --jobs 2` and `tests/solver_scan.js --sizing --conv-only` before and after, their
  deltas as information. Write the table to the report and to a new S4 part of the "Batch 5 follow-ups: results" section of
  `docs/next-batches-plan.md`.
- [ ] **Step 4: STOP for the owner** with: the strip-compare proofs (snapshot, `plan_off_anchor`) and the raw counts; the fixture's
  held years (and, if none, the spec deviation: the held line will not show on the fixture; the over-the-line line explains its
  card); the other `npm test` failures and how each was handled; the benches; rulings 1-8. After the OK: `npm run snapshot:update`
  (and the `snapshot_ui` / `plan_off_anchor` baselines if they moved; `plan_off_anchor.js`'s header comment names the new baseline:
  "any tree at or after S4 Task 10 ... N different against `70a1f18`, only the two card-only fields"); the commit says the baselines
  change only by the two card-only row fields (an intended change). `npm test` green. Commit: `S4 Task 10: rows record which limit
  held the conversion, and a conversion over the ACA line (card-only fields)`. Push.

### Task 11: the card's two lines and the `cliffChoice` test

**Files:**
- Modify: `src/us/ui/results/roth-optimizer.js` (`ageRanges`; `computeRothOptimizer` keeps each row's `overAca`;
  `annotateRothOptimizer` draws the over-the-line line; the held line drawn in `renderConversionSchedule(selected)` (it has
  `selected`); `scheduleWhy` only under ruling 8's fallback)
- Modify: `src/us/index.html` (`#rothOptimizerHeld` and `#rothOptimizerOverLine`, `hidden`, after the bracket table's `.table-wrap`,
  styled like `#rothOptimizerSummary`; the badge V153 -> V154)
- Test: `test_conversion_schedule.js` extended with new sections (its header comment lists them); `tests/unit/us/roth-optimizer-
  ages.test.js` (new: `ageRanges`, and `scheduleWhy` if built) through `w.load('us/ui/results/roth-optimizer.js')`
- Docs: `README.md` (the bracket card's two lines), `docs/architecture/cliff-plan.md` (~`:172-173`) and
  `docs/architecture/inputs-and-ui.md` (~`:94`) where the card is described, `test-inventory.md`, `docs/next-batches-plan.md` (S4
  results; A4 and D done; the 2026-10-31 follow-ups bullet marked complete), the spec's status line (A4 done)

**Interfaces:**
- Consumes: `row.convHeldBy`, `row.convOverAca` (Task 10); `notWorseThan` (already imported); `planName()`.
- Produces: `export function ageRanges(ages)`; each `computeRothOptimizer` result row gains `overAca` (ruling 7).
  `tests/analysis_parity.js` (not in `npm test`) reads `__test_analysisBundle`'s `rothOptimizer`: if run, pass
  `--ignore-us-keys rothOptimizer`, noted.

- [ ] **Step 1: Find the households and write failing tests.** (a) The fixture (through `window.__test_replaceState` with its
  `state`): the over-the-line line visible, naming every row the trigger takes (by the S3 results 22%, 24%, 32%, 35% run out earlier:
  pin what the tree gives) with the ages (60-61 expected: pin); the held line as Task 10 pinned (hidden if none held). (b) The held
  line's positive case: Task 10's `'aca'` guard-on couple (or the fixture if it is held): visible, naming the ACA line and the ages.
  (c) "No limit": a single, 60, retired at 60, ACA off, `cliffGuardEnabled: false`, traditional 1,500,000, conversions 60-62 at 12%,
  life 70 (premise: no row has `convHeldBy`): both lines hidden. (d) The phased fill year (ruling 8): its why cell reads `Filled to
  ...`. (e) 390x844: `scrollWidth > clientWidth` false with both lines shown. (f) The light render: a spending `input` marks the card
  stale (the lines inside it); after `__test_flushRender()` they follow the new run. `ageRanges`: `[60,61,62]` -> `"60-62"`,
  `[59,61,62,63]` -> `"59, 61-63"`, `[60]` -> `"60"`, `[]` -> `""`, `[62,60,61,61]` -> `"60-62"`.
- [ ] **Step 2:** `npm run build`; run the script: fails. Implement. Run: passes. `node tests/snapshot_ui.js`: movers only from the
  two new hidden ids (listed). The fixture's card before and after (the rows, the schedule, the two lines). The per-household dumps
  against `70a1f18` unchanged from Task 10.
- [ ] **Step 3: STOP for the owner** with the fixture's card (screenshots of the open card at 1280 and 390 px, the two lines' text),
  the copy (ruling 7) and the `snapshot_ui` movers. After the OK (copy edits applied): the `snapshot_ui` baseline if it moved; the
  badge V153 -> V154; the docs above. `npm test`; `npm run test:ui`. One commit: `S4: the bracket card names the limit that holds the
  conversions and the rows that convert over the ACA line; the cliffChoice why test (US V154)`. Push. Then the Opus whole-branch
  review, its fixes, and the PR (the owner merges; no auto-merge).
