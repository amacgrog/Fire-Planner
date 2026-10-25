# Batch 5 step 4b: the gains-capped stay-under (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A year whose MAGI is over an ACA or IRMAA line because of stock-account gains can stay under that line when MAGI-free
money (cash, penalty-free Roth) can cover the rest, and the family keep rule can never keep a plan that first draws on home
equity earlier than no steering.

**Architecture:** One new withdrawal primitive, `takeStockTaxable`, replaces every stock-account taxable sale: under a stay-under
cap it sells only the gain that fits the room (`takeTaxableCapped`, from 2b), otherwise it is `takeTaxable` to the bit, and in
both cases it adds the sale's gain to a new `wd.cappableGain` counter. The natural year's record (`natOf`) carries that counter
(`natGain`) and the MAGI-free money left (`natFree`), and `underEligible` (shared by `choose` and `apply`) offers a household-line
stay-under when the gains, not traditional money, put the year over. `planCandidateBetter` gains 3a's home-draw rule.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright (root `test_*.js`,
`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (approved 2026-10-25): section 5 (the shared lever rules,
the gates, decision 9), section 6 (4b), builder's call 14. Base `4de0eb6` (origin/main, PR #50, US V140). Branch
`claude/b5-4b-gains-capped`.

**Owner rulings for 4b-4d (2026-10-25):** one Opus plan review per sub-step; Sonnet implementers for the mechanical tasks
(marked **[Sonnet]**), Opus for the engine tasks (**[Opus]**) and every review; 4c and 4d stay separate PRs.

## Global Constraints

- `CLAUDE.md` holds: engine functions take the run context first and read only `ctx.*`; one context shape; no new module-level
  mutable in an engine module (none is planned; if one appears it is registered in `tests/engine-purity.json` in the same
  commit); hot paths allocate nothing a year does not need; two-space module indentation; never reformat a module you change.
- `npm run analyze` in every task that adds, renames or removes an export (the module-map check in `npm test` fails otherwise).
- Vitest rules (CLAUDE.md "Writing a Vitest test"): only through `world()`; `toBe` / `toStrictEqual`; hand-computed expected
  values stay literals and engine-derived ones are properties (rule 6: Node 22 and 24 can differ in the last bit); contexts from
  `w.ctx()` / `w.ctxBuilder()`; a new suite run alone and with `--sequence.shuffle`; `makeCounter` + `afterAll` for a suite with
  many checks.
- **Snapshots move in this PR by design** (guard-on scenarios: the guard is on by default). Tasks 1-3 do not run
  `npm run snapshot:update`; each of them runs the Vitest suites and the named scripts, and `tests/snapshot.js` is expected to
  fail on guard-on entries from Task 1 on. Byte-identity that must hold at every task: every `off` run
  (`node tests/plan_off_anchor.js --base <base build>`, all US scenarios identical) and Canada (`node tests/snapshot.js --only
  Canada` identical). Task 5 lists the movers, the owner sees the list, and only then is the baseline regenerated.
- An existing test assertion that a task's change moves is updated in that task with its cause in the commit message; never
  loosened (no tolerance added, no check deleted) without the controller's ruling.
- A bug found in existing `src/` code is reported to the controller, not fixed (rule 7), except the items this plan names.
- Base build for every `--base` comparison: `git archive 4de0eb6` extracted into the scratchpad (a plain directory, not a
  worktree), with a directory junction to this worktree's `node_modules`, then `npm run build` there. Removed at the end.
- US badge V140 -> V141 (Task 7) with the README feature line.
- Batch notes go in `docs/next-batches-plan.md` "Batch 5 notes", a new "Batch 5 step 4b" subsection (not `docs/reference.md`).
- Never push, never open a PR, never `git stash`, never touch another worktree. Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Findings while writing the plan (probes on `4de0eb6`, 2026-10-25; corrected by the plan review; for the owner)

The TX gap household (`GAP_CASES[0]`: single, 55, 600,000 taxable, 1.2M traditional (a 401(k), penalized before 59.5: no Rule
of 55), 100,000 Roth with no Roth IRA basis, conversions 55-74 at 22%, life 100) keeps the 10% bracket. The two brackets run at
different fixed points of the MAGI iteration across the cliff:
- **User's bracket (22%), the `choose` trace:** year 0 converts nothing (the conversion ceiling leaves no room), draws no
  traditional and ends at MAGI 63,377 against the 400% line 62,600: $777 over, **all from taxable gains** (about 54k of gain
  plus dividends), healthcare 18,000. At 62 and 63: MAGI 91,109 and 106,900 (28,819 of traditional at 63).
- **Kept 10% plan:** year 0 converts 5,123 and ends at the line (healthcare 6,235, as years 1-6). At 62 and 63: MAGI 91,413 and
  94,929 from taxable sales of 86,267 and 84,498 (traditional 0 and 4,104), healthcare 22,940 and 23,748 against 7,787 the year
  after under the line; cash 35,661 and Roth 220,430 (all penalty-free at 62) cover the gains.
- **Year 0 is blocked by spec 6's own bound.** At 55 the household has penalized money, so `natFree` is cash plus penalty-free
  Roth: 30,000 + 0 (no basis). `natGain` is about 54,000, so `natFree >= natGain` fails, although the year is only $777 over and
  about $1,300 of gross held back and replaced from cash would meet the line and save about $11,800 of premium. Spec 6 lets the
  builder tighten the bound, not loosen it.
- **No free-money bound is a correctness bound** (Fable review). The trial runs its own converged MAGI iteration, so the
  premium saved under the line and the tax not paid on the held-back gain reduce the year's need too: TX year 0 at 22% saves
  18,000 - 6,235 of premium, more than the held-back gross, and would meet its line with no free money at all. Any bound on
  `natFree` is a trial-count heuristic that can exclude feasible stay-unders; the trial (`met`, no unmet need, the cliff saving,
  the score) is the real test. The one necessary condition is already in the test: `t.magi - 1 >= c.lo`.
- **Owner ruling R0 (asked before the build), the gains-capped term:**
  - (a) spec 6's `natFree >= natGain`: ages 62-63 qualify, year 0 does not (recorded as excluded by the bound);
  - (b) `natFree >= natMagi - natConv - (t.magi - 1)` (free money covers the excess): year 0 and 62-63 qualify; still excludes
    a feasible year with no cash and no Roth basis;
  - (c) **recommended:** no free-money bound (`t.ret === 'H' && c.natGain > 0`): every gains-driven year over a household line
    gets its trial; `natFree` is not computed (no `rothFreeSum`). Most trials of the three.
  On the scan grid (200,000 Roth, 30,000 cash in every household) (a) and (b) offer nearly the same trials, so neither is a
  timing lever. **The timing fallback**, if Task 6's gates miss: a gains-driven (natTrad 0) year offers its stay-under at the
  nearest real cliff only, not also at the largest one; if the gates still miss, stop for the owner. The plan is written for
  (c); with (a) or (b) Task 2 adds `natFree` (amendment 4) and its year-0 test follows the ruling.

## Spec amendments and builder's calls made by this plan

1. R0 above (the bound).
2. **The live-mix branch is unchanged.** `drawMixedStockAccounts`' `withdrawalMixEnabled` branch (`pickLiveWithdrawalOrder`) sells
   taxable outside the primitives; spec 6's list of capped sales does not name it and 4c removes it. Its sale is neither capped
   nor counted in `cappableGain` (counting a sale the cap cannot limit would offer trials that fail `met`). Toggle-on years keep
   today's eligibility.
3. **What `cappableGain` counts:** the gain of every `takeStockTaxable` sale (the default order's, smoothing's, an explicit mix's
   taxable share, the mix fallthrough's, the bucket `taxable` step that `stocks` runs), as `wd.taxableGainGross` after the sale
   less before it. Not counted: `ladderGain`, `bondTaxable` sales, the release's sale (`releaseMagiCap` lifts the cap first; in a
   natural year it never runs), the live mix, and the bucket strategy's up-year bond refill (`refillBondReserve`, after the need
   is met: it sells taxable stock uncapped once traditional and Roth have nothing to move; it cannot make a year short, so it
   stays uncapped, and it joins the named causes of a trial that misses its line, with `bondTaxable` sales, the uncapped
   `bondTraditional` draw and the release).
4. **`natFree`** (only with R0 (a) or (b)) is `bal.cash + (wd.penaltyAware ? rothFreeSum(wd, 'roth') : bal.roth)` read in `natOf` (after the natural year's
   draws, the same place `natTrad` is read), where `rothFreeSum` is a new non-allocating loop in `penalty-status.js` that gives
   the very double `rothFreeCaps(wd, bucket).reduce((s, c) => s + c, 0)` gives (index order from 0). The bond Roth bucket is not
   counted (spec: "cash plus penalty-free Roth"). At that point `bal.cash` already holds a forced pass's refund and `bal.roth`
   the year's Roth contribution; both modes read the same point, so the replay holds (do not move the read).
5. **`planCandidateBetter` (decision 9)** becomes, with `null` / `undefined` read as never (Infinity) for both ages:
   `if (cd < bd || ch < bh) return false; if (cd > bd || ch > bh) return true;` then today's `$1` score test both ways, then
   fewer intents. The score tolerance stays `$1` (not 3a's 0.1%), so a family subset that ties on both ages ranks as today. The
   running best starts at `off` and is replaced only by a candidate no earlier on either age, so the kept family never depletes
   or first draws on the house earlier than `off`, by construction. That holds for the automatic plan (the strict chaining of
   `planCandidateBetter` and `bracketCandidateBetter`, and `storedPlanVerdict`); Optimize's `bracketEvenBest` ranks depletion
   before the home draw, so Optimize's even rank can keep a later-depleting bracket that draws on the house earlier (unchanged
   here, recorded).
6. **The parked 4a items done here:** the light-render timing re-measured on a like-for-like pair and the misplaced table row
   fixed (Task 6 / 7); `searchKey()` and `liveFingerprint()` memoized on `JSON.stringify(state)` and the tax year (Task 4); the two card items:
   `decision-questions.js` names "the applied plan's" bracket when a stored plan runs, and the status line no longer says "does
   not beat" when no verdict was computed (Task 4); the stored plan's apply run on every light planning measured (Task 6).

## Review Focus

1. **The replay.** `apply(choose's plan)` reproduces `choose` on every row field in a gains-capped year: `natGain` and `natFree`
   are read from the same converged natural pass in both modes. Test: Task 2.
2. **The year never goes short.** A gains-capped trial that cannot meet its line still raises its need (the release sells the
   held-back taxable before penalized money, inherited money and home equity) and is rejected, so the natural year runs.
   `magiStats.planMissed` stays 0. Tests: Task 2, Task 6 (scan).
3. **No earlier depletion or first home draw** than `off` on any standard scenario (hard), by Task 3's rule and checked over the
   snapshot corpus and the scan grid. Tests: Task 3, Task 5, Task 6.
4. **Guard-off and Canada byte-identical.** Every `off` run is unchanged (the primitive is `takeTaxable` to the bit without a
   cap). Test: `plan_off_anchor.js` at every engine task.

---

## File structure

- Modify `src/us/core/withdrawals/draws.js` (`takeStockTaxable`, `cappableGain` in `newWithdrawal`),
  `src/us/core/withdrawals/strategies.js` (the five sales), `src/us/core/accounts/penalty-status.js` (`rothFreeSum`),
  `src/us/core/cliff-plan/solver.js` (`underEligible`, `planCandidateBetter`, comments), `src/us/core/projection/run-projection.js`
  (`natOf`, the trace), `src/us/ui/results/plan-optimizer.js`, `src/us/ui/results/decision-questions.js`, `src/us/index.html`
  (badge), `tests/bench_plan.js`, `tests/bench_solver.js`, `tests/se_health.js` (trace-key delete lines, R3 of 4a).
- Create `tests/unit/us/gains-capped.test.js`.
- Docs: `docs/architecture/cliff-plan.md`, `README.md`, `docs/next-batches-plan.md`, `docs/architecture/test-inventory.md`.

---

### Task 1: `takeStockTaxable` and the `cappableGain` counter **[Opus]**

**Files:**
- Modify: `src/us/core/withdrawals/draws.js`, `src/us/core/withdrawals/strategies.js`
- Modify too: the trial comment in `run-projection.js`'s phased block ("a cap limits traditional draws only", above the trial
  record), now false; CLAUDE.md's cliff-plan invariant gains the counterpart ("a new stock-account taxable sale goes through
  `takeStockTaxable`, or the plan never offers a gains-capped stay-under for that mode"); `cliff-plan.md`'s primitives paragraph
  (CLAUDE.md: the topic file in the same commit as the change; Task 7 only adds the 4b summary).
- Test: `tests/unit/us/gains-capped.test.js` (new), `tests/unit/us/mix-fallthrough.test.js` (only if a case moves)

**Interfaces:**
- Produces: `takeStockTaxable(wd, amount) -> net` (draws.js, exported): with `wd.magiCap && !wd.magiCap.off`,
  `takeTaxableCapped(wd, 'taxable', amount, magiCapLeft(wd))`, else `takeTaxable(wd, 'taxable', amount)`; then
  `wd.cappableGain += wd.taxableGainGross - g0`. `newWithdrawal` gains `cappableGain: 0` right after `cappableTraditional`
  (one object shape for every pass).
- The five sites in `strategies.js` call it: the explicit mix's taxable share (`drawMixedStockAccounts`, today line 47), the
  smoothing share (line 83), `mixFallthrough` (line 96, which today inlines the same cap test), `withdrawStandard`'s default
  sale (line 171) and `BUCKET_STEP.taxable` (line 107; keep its `bal.taxable > 0` guard). Untouched: the live branch,
  `bondTaxable`, `releaseMagiCap`.

- [ ] **Step 1: Write the failing tests** (primitive level; build each `wd` with the exported `newWithdrawal(ctx, {...})`, as
  the engine does, so `status`, `accts`, `rothAccts` and `penaltyAware` are real; `newTestWithdrawal` in
  `src/us/ui/install-test-hooks.js` shows the arguments; every case also asserts `Number.isFinite(wd.cappableGain)`): (a) no cap: one `takeStockTaxable` sale equals
  `takeTaxable` on net, `bal`, `taxableGainGross` (`toBe` / `toStrictEqual`) and `cappableGain` equals that sale's gain; (b) a
  binding cap: the gain realized equals the room (a hand-computed literal, as the 2b case does) and `cappableGain` equals it;
  (c) `withdrawStandard` with taxable only, no cap: `cappableGain` equals `taxableGainGross` less the starting ladder gain (one
  counted sale: `toBe`); with a `bondTaxable` sale too, the bond sale's gain is not in `cappableGain` (compare with the counted
  increments computed the same way, never a sum that could differ in the last bit); (d) under a cap, each of: the default
  order, smoothing (`smoothWithdrawals: true`), an explicit mix (an override map row, as the mix-fallthrough suite sets one),
  the bucket strategy (`withdrawBucket` up and down year, and `withdrawBucketPenaltyAware`), with cash able to cover the need:
  at the end `taxableGainGross - ladder gain <= room + 1`, the taxable balance fell by exactly the capped sale (the release
  sold nothing) and `wd.need <= 1`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/gains-capped.test.js` — FAIL (no export).
- [ ] **Step 3: Implement.** Update the comments that describe the cap (`magiCapLeft`, `takeTaxableCapped` "does not add to
  cappableTraditional" stays true; `mixFallthrough`'s comment; `drawMixedStockAccounts`' header).
- [ ] **Step 4: Run** `npx vitest run tests/unit/us`, then `npm run build && node tests/plan_off_anchor.js --base <base build>`
  (all identical), `node tests/snapshot.js --only Canada` (identical), and `node tests/cliff_plan.js && node tests/cliff_guard.js
  && node tests/solver_hooks.js && node tests/solver_primitives.js` (Task 1 already moves trials that were traditional-driven and
  failed `met` on gains; `cliff_guard.js` test 9 drives `withdrawStandard` under a cap through `newTestWithdrawal`; moved
  assertions updated with causes). Record (not fix) how many US guard-on entries
  `node tests/snapshot.js --only US` now reports as different (expected: trials that were traditional-driven now cap taxable).
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4b: takeStockTaxable caps every stock-account taxable sale under a
  stay-under; cappableGain counter").

### Task 2: The gains-capped eligibility **[Opus]**

**Files:**
- Modify: `src/us/core/accounts/penalty-status.js` (`rothFreeSum`), `src/us/core/cliff-plan/solver.js` (`underEligible` and the
  comments above it and `yearPlanCandidates`), `src/us/core/projection/run-projection.js` (`natOf`; trace keys),
  `tests/se_health.js` (delete lines for the new trace keys)
- Test: `tests/unit/us/gains-capped.test.js`

**Interfaces:**
- With R0 (a) / (b) only: `rothFreeSum(wd, bucket) -> number`, the same double as summing `rothFreeCaps(wd, bucket)` from index 0,
  no array (and `drawMixedStockAccounts`' own reduce, today line 39, switched to it: bit-identical); `natFree` in `natOf`.
- `natOf` returns `{ natMagi, natConv, natTrad, natGain: wd.cappableGain, lo, hi, canFill }` (+ `natFree` with (a) / (b)).
- `underEligible(t, c)` (R0 (c)): `(c.natTrad > 0 || (t.ret === 'H' && c.natGain > 0)) && c.natMagi - c.natConv > t.magi &&
  t.magi - 1 >= c.lo` (with (a) / (b) the gains term adds its `natFree` bound). A caller whose `c` has no `natGain` (old test hooks) gets today's answer (`undefined > 0` is
  false).
- Trace (choose, trace only): `planTr.natTrad`, `planTr.natGain` (and `planTr.natFree` with (a) / (b)) in a year with lines;
  `tests/se_health.js`'s identity hash (about line 528, beside `delete t.lambda`) deletes them before hashing (4a's R3).

- [ ] **Step 1: Write the failing tests:**
  - `underEligible` pure cases (hand literals): traditional-driven as today; gains-driven with `natFree >= natGain` on an `H` line
    -> true; the same on an `A` / `B` line -> false; `natGain` 0 -> false; (with (a) / (b): the bound's edges); MAGI less the conversion under the line ->
    false; `natGain` absent -> today's answer.
  - (with (a) / (b)) `rothFreeSum` equals the reduce over `rothFreeCaps` (`toBe`) on a penalty-aware `wd` with four Roth
    accounts of mixed status.
  - **The TX household** (`GAP_CASES[0]` from `tests/unit/helpers/scan-grid.mjs`, life 100, search on as
    `bracket-search.test.js` sets it). Every comparison is at one bracket, read from the planning: `B = report.keptBracket`; the
    `off` run at `B` is `runPlanMode({ planMode: 'off', plan: makePlan({ bracket: B, bracketFrom: 22 }) })` (`null` plan when
    `B === 22`), and each line's MAGI is read from the `choose` trace run at `B`. At ages 62 and 63 the kept plan's intents are
    `{ kind: 'under', line: 'aca400', ret: 'H' }`; on the plan's `apply` run those rows carry a "stayed under" `cliffChoice`,
    their healthcare is lower than the `off` run's at the same ages by more than $1 (`cliffChoice` is set only when the trial met
    its line; rows carry no `magi` field). In the `choose` trace at `B` the winning candidate's `realized` is at most its `magi`
    + 1 (an `under` candidate's `magi` is the target, the line less 1). **Year 0 on the user's bracket:** the `choose` trace at 22% offers an `aca400` stay-under in year 0 (R0 (b) / (c); with (a):
    offers none), and its trial meets the line. A copy of the household with `cash: 0` (no Roth basis) also offers and meets it
    under (c) (Fable review's counterexample to a free-money bound). The kept plan's depletion and first home draw are no earlier than
    `off`'s at `B`, and at equal ages its ending after-tax value is at least `off`'s.
  - **Replay:** on the TX household and on two scan-grid households with gains-driven intents (found by the test in the
    48-household sample: the first two whose `choose` trace records an intent in a year with `natTrad === 0`), the `apply` run
    of `choose`'s intents (same bracket) equals the `choose` run row for row (`toStrictEqual` on `rows`) and on `depletedAge` /
    `homeDrawAge`. The test asserts that at least two such households were found (never vacuous).
  - `magiStats.planMissed` delta 0 over the TX household's planning and its historical cycles.
- [ ] **Step 2: Run** the suite — FAIL (no gains-capped intents).
- [ ] **Step 3: Implement.** If the TX household's ages 62-63 do not become kept stay-unders (the trial fails `met`, or Rule A
  keeps another family), **stop and report to the controller** with the trace (do not tune the rule; the builder may tighten
  `natFree >= natGain` only for the timing gate, spec 6, and only with the controller's ruling).
- [ ] **Step 4: Run** `npx vitest run tests/unit/us` (and the new suite alone and shuffled), `npm run build &&
  node tests/plan_off_anchor.js --base <base build> && node tests/se_health.js && node tests/cliff_plan.js &&
  node tests/solver_hooks.js && node tests/solver_primitives.js`. A `cliff_plan.js` / `solver_hooks.js` assertion that moves on
  a guard-on household is updated with its cause (Global Constraints).
- [ ] **Step 5:** `npm run analyze`; commit ("Batch 5 4b: gains-capped stay-under eligibility (natGain, natFree)").

### Task 3: Home-aware `planCandidateBetter` (decision 9) **[Opus]**

**Files:**
- Modify: `src/us/core/cliff-plan/solver.js` (`planCandidateBetter` and its comment; the comment above `computeCliffPlan`'s
  `select` in `run-projection.js`)
- Test: `tests/unit/us/gains-capped.test.js` (or `objectives.test.js` if that is where `planCandidateBetter` is tested today:
  put the pure cases beside the existing ones)

**Interfaces:** amendment 5's rule. `report.candidates` gains `homeDrawAge` (after `depletedAge`), so the card and the scan can
see why a family was not kept.

- [ ] **Step 1: Write the failing tests:** pure cases (literals): equal depletion, higher score, earlier home draw -> false; equal
  ages, score higher by more than $1 -> true; later home draw, lower score -> true; later depletion, earlier home draw -> false;
  `homeDrawAge` absent on both -> today's result on today's existing cases. Property (the rule is per bracket, so plannings use `search: false`; one searched planning per gap household) over the
  48-household sample (every 16th of the scan grid, both withdrawal modes) and the three gap households at 75 and 100; the
  suite's wall time is recorded in the commit, and if it is over 15 s the sample drops to every 32nd: the kept candidate's depletion and first
  home draw are no earlier than `report.candidates[0]`'s (the kept bracket's `none`), and the final plan's run is no earlier on
  either than the user's-bracket `off` run (`runPlanMode({ planMode: 'off' })`). Find (by the test, from the same sample) and pin one household where the old rule
  kept a family that drew on the house earlier than `off`, if any exists: that case asserts the new kept family; if none
  exists in the sample, say so in the commit message.
- [ ] **Step 2: Run** — FAIL on the pure cases.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/unit/us`, `npm run build && node tests/cliff_plan.js && node tests/bracket_search.js
  && node tests/plan_off_anchor.js --base <base build>`; moved assertions updated with causes. Expected update:
  `tests/cliff_plan.js` T5.2 (about line 287, `kept.value >= off.value` at equal depletion) is conditioned on equal
  `homeDrawAge` (now in `report.candidates`) and gains a check that the kept family's home draw is no earlier than `off`'s.
  Same commit: `cliff-plan.md`'s Rule A sentence.
- [ ] **Step 5:** commit ("Batch 5 4b: planCandidateBetter never keeps an earlier first home draw (decision 9)").

### Task 4: The parked card items **[Sonnet]**

**Files:**
- Modify: `src/us/ui/results/plan-optimizer.js`, `src/us/ui/results/decision-questions.js`
- Test: `test_plan_optimizer.js` (root), a Playwright check of the decision question

- [ ] **Step 1:** Memoize `searchKey()` and `liveFingerprint()` on `JSON.stringify(state)` and `currentYear` (always a valid
  key: the fingerprint is a function of the state and the year; it skips `normalizeState`, the second stringify and the hash).
  Not on `cliffPlanStore.key`: that is the state's JSON at the last `refreshCliffPlan`, stale after a write with no render (a
  hook, test code, an MCP path). `applyStoredPlan`'s safety check computes `searchKey()` fresh (a click). The memo is a
  module-level object in the `ui/` module (like `fingerprintMemo`). A test in `test_plan_optimizer.js`: after a search, type a
  value, flush, type the old value back: Apply hides then shows again; and a write through `__test_getState()` with no render,
  then `__test_applyStoredPlan()`, is refused (the fresh check).
- [ ] **Step 2:** `decision-questions.js` (the `rothLadder` row label): when `report.stored.used` (read from `cliffPlanStore`
  for this state, as the flat-bracket card does), say "the applied plan's X% bracket" instead of "the cliff plan's". Playwright:
  with a stored plan in use that is bracket-honoured (`plan.bracketFrom === state.rothConvBracket`) and whose bracket differs
  from it (the label shows only then, `decision-questions.js` about line 58), the row label names the applied plan.
- [ ] **Step 3:** `renderPlanOptimizerStatus`: when `stored` is null (no verdict computed for this state, e.g. before the first
  planning), the line reads "Your applied plan is saved; its comparison with the automatic plan is not computed yet." instead of
  "does not beat". Playwright check where reachable; otherwise a comment naming the case.
- [ ] **Step 4: Run** `npm run build && node test_plan_optimizer.js` and the script that covers the decision questions (find it in
  `docs/architecture/test-inventory.md`; if none covers the ladder row, add the check to `test_plan_optimizer.js`).
- [ ] **Step 5:** commit ("Batch 5 4b: memoized search key and fingerprint; applied-plan wording in the decision question and
  the status line").

### Task 5: Movers, the hard gate, the snapshot update **[Opus]**

- [ ] **Step 1:** Dumps: `node tests/snapshot.js --only US --update-nothing --dump <A> --root <base copy>` and
  `node tests/snapshot.js --only US --update-nothing --dump <B>` (this tree). A scratch script (scratchpad, not committed) lists
  every differing US scenario with: standard / historical, guard on or off (off must be none), `depletedAge` and `homeDrawAge` A
  -> B, the ages whose `cliffChoice` changed, and the cause class: (i) a new gains-capped stay-under, (ii) a traditional-driven
  trial that now caps taxable, (iii) Task 3's rule kept another family, (iv) other (each "other" explained one by one).
- [ ] **Step 2: Hard gate:** no standard scenario depletes or first draws on the house earlier in B than in A. Historical
  scenarios that deplete earlier: `node tests/hist_depletion_cause.js <A> <B>`; any bridge drain **stops for the owner**; market
  variance listed with ages.
- [ ] **Step 3: Stop and show the owner the mover list** (counts by cause, every standard mover named, the historical classes,
  the `snapshot_ui` movers from `node tests/snapshot_ui.js` or its equivalent). Wait for the owner's OK.
- [ ] **Step 4:** `npm run snapshot:update` (and the UI baseline where `snapshot_ui` moved); commit with the mover summary in the
  message ("Batch 5 4b: snapshot movers (intended): ...").
- [ ] **Step 5: Run** `npm test` and `npm run test:ui` — green.

### Task 6: Gates and measurements **[Opus]**

- [ ] **Step 1 [Sonnet-able, done here]:** add the TX gap household to `tests/bench_plan.js`'s `HOUSEHOLDS` and to
  `tests/bench_solver.js`'s `SCENARIOS` (both CommonJS: inline the patch, `const p = { singlePerson: true, ageA: 55, retireAgeA:
  55, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 }` then `{ ...p, lifeExpectancyA: 100, rothConvEnabled:
  true, rothConvStartAge: 55, rothConvEndAge: 74, cliffGuardEnabled: true, ...legacyToAccounts({ traditional: 1200000, roth:
  100000 }, p) }` with `require('./legacy_balances')`, as `scan-grid.mjs` builds it) (comment: "Batch 5 step 4b:
  a guard-on ACA household whose MAGI is gains-driven (spec 5)"). Commit.
- [ ] **Step 2: Timing** (gates, spec 5; a miss applies R0's timing fallback, then stops for the owner): `node tests/bench_runs_interleaved.js --base <base>` (+5% per path);
  `node tests/bench_solver.js --base <base> --rounds 7` (+30%, the new TX row included); planning per household, median of 9
  full refreshes on the gap households at 75 and 100 and the TX household with a stored plan applied (150 ms);
  `node tests/bench_plan.js` (exit 0). A gate miss stops for the controller (the spec's lever: tighten `natFree >= natGain`).
- [ ] **Step 3: The parked light-render measurement, like for like:** per spending keystroke (median of 27 `input` events, 3
  rounds of 9, light render only, deferred pass flushed between events, TX and CA gap households at 100) with no stored plan and
  with a stored plan **equal to the light render's own automatic plan** (so both run the same rows; verdict `tie`), so the
  difference is the stored plan's `apply` run plus the fingerprint. Also the light planning alone (`refreshCliffPlan({ light:
  true })`) with and without it. Scratch script; figures to the notes.
- [ ] **Step 4: The gap:** `node tests/solver_gap.js --objective endValue` and `--shipped optimized`, both lengths
  (`--lengths 75,default`); TX's ages 62-63 checked in the table's year detail or the trace.
- [ ] **Step 5: The scan:** `node tests/solver_scan.js` (background; the 768 / 864 households): no standard depletion or first
  home draw earlier than `off`; Roth used by stay-unders on paths; `planMissed` 0; the counts of gains-capped intents (a scratch
  tally from the trace if the scan does not print it).
- [ ] **Step 6: The lambda table** (spec 9's re-run): `node tests/plan_mult_table.js` on the gap sample (both objectives).
- [ ] **Step 7: The MFJ 62 IRMAA observation** (4a's final note): the grid's MFJ couple at 62 with 250,000 + 250,000 traditional
  (the 4a R12 household): its automatic plan against the same plus `{ kind: 'fill', line: 'irmaa1', ret: 'H' }` at 66 through
  `apply`, on 4de0eb6 and on this branch: end value (nominal and real), lifetime cost, what the fill draws that year and later
  (traditional left, RMD tax). Why `choose` does not offer it (a fill is offered only at a floor: `yearPlanCandidates` skips a
  line where crossing raises the cost, and an IRMAA tier is a cliff) and which lever could catch it (4c's traditional-first
  order in that year; a "fill to just under a cliff" candidate; the conversion bracket). Report only; no code.

### Task 7: Docs, badge, notes **[Sonnet]**

- [ ] `docs/architecture/cliff-plan.md` (Tasks 1-3 updated their paragraphs in their own commits): a short "4b" bullet in the
  step 4 section pointing at them.
- [ ] `README.md` feature line (cliff plan: a year over an ACA / IRMAA line because of investment gains can stay under it with
  cash and Roth money; a family is never kept if it draws on the house earlier). US badge V140 -> V141 in `src/us/index.html`.
- [ ] `docs/next-batches-plan.md`: the Batch 5 status line (4b done on this branch); a "Batch 5 step 4b" notes subsection:
  amendments, rulings, movers by cause, the gates' figures, the gap, the scan, the lambda table, the MFJ 62 finding, the
  corrected light-render figures; that plans applied before V141 re-run under the new rule (a stored plan's traditional-driven
  stay-unders now cap taxable too, so its recorded gain may no longer describe what runs; the guard still decides; re-run
  Optimize), also one sentence in README; in the 4a subsection, the confounded light-render line gets a pointer to 4b's like-for-like
  figures and its row moves into the table (the parked cosmetic fix); the "Parked for 4b" line marked done.
- [ ] `docs/architecture/test-inventory.md`: the new suite.
- [ ] Run `node tests/doc_paths.js`, `npm test`; commit.

### Final: whole-branch review **[Opus]**, then the owner

`npm test` and `npm run test:ui` green; the hand-over note in the side-session notes folder (`b5-4b.md`, the SDD ledger copied as
`b5-4b-sdd-ledger.md`). No push or PR until the owner asks.

## Self-review

- Spec 6: eligibility (Task 2, bound per R0), `natGain` (Task 1's counter, amendment 3), `natFree` (amendment 4), household lines only (Task 2),
  the trial capping every stock-account sale (Task 1; live mix excluded, amendment 2), the win rule unchanged (no edit to the
  trial bookkeeping), acceptance (Task 2's TX case: ages 62-63, and year 0 per R0, Task 6's gap and scan, `planMissed`).
- Spec 5: the replay (Task 2), keep by whole-run evaluation (gains-capped intents join the `aca` / `irmaa` families; no new
  subset), the gates (Tasks 5-6), the new bench household (Task 6), MAGI-iteration rules (`cappableGain` lives on the per-pass
  `wd`; nothing is added to the year's snapshot; `natGain` / `natFree` are read into `natOf` like `natTrad`, so the natural
  record and the replays carry them as they carry `natTrad`).
- Decision 9: Task 3.
- Parked 4a items: Tasks 4, 6, 7 (amendment 6).
- Gates of the brief: `npm test` / `test:ui` (Task 5), timing (Task 6), standard hard gate and historical causes (Task 5), movers
  before the update (Task 5 Step 3), badge (Task 7), `solver_gap` and `solver_scan` (Task 6), the MFJ 62 check (Task 6 Step 7).
