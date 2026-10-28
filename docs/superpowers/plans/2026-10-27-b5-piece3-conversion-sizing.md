# Batch 5 step 5b piece 3: per-year conversion sizing in the cliff plan (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a plan that converts, `choose` may size each conversion year to a named target instead of the user's bracket: no
conversion, the top of a federal bracket (counting the year's draws), just under a ceiling line or just over a floor. The plan
records the targets (`plan.conv`), `apply` follows them on every path, and the planning keeps the sized plan only when it beats
the unsized one by 3a's rule.

**Architecture:** A pure resolver (`src/shared/core/withdrawals/conversion-targets.js`) turns a target into an amount from a
lines list and a bracket-top function. In the phased year, `choose` prices every target at the end of the converged bracket phase.
It uses B5.3's score on that phase's realized draws, drops a candidate that fails the bridge check, and keeps the best. If the
winner is not the bracket target, a sized phase re-runs the year from its start seeds with the target held, re-sized on every
pass. The sized phase then becomes the year's natural record. `apply` runs a year with a `conv` intent as that sized phase from
its first pass. `computeCliffPlan` adds one sized track after the whole automatic selection, at the kept bracket and with the
kept levers. The track is kept only by `bracketCandidateBetter`.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright (root `test_*.js`,
`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md`, section **B0** (authoritative; approved by the owner
2026-10-27 "as written"), then B4-B13 where B0 does not amend them, and R1-R13. Task 0's results:
`docs/next-batches-plan.md`, "Batch 5 step 5b piece 3, Task 0".
- Base: main `cf22985` (US V146, Canada V65).
- Branch: `claude/b5-piece3-sizing-03a3d1`, with a89e9b0 (B0) and 003c584 (Task 0) already on it.

**Process (owner):** a short outline before code, then stop for the OK. Implementers are tagged **[Opus]** (engine) or
**[Sonnet]** (mechanical). Every review runs on Opus. Snapshot movers are listed before any `npm run snapshot:update`. Never
`git stash`, never touch other worktrees, no push or PR until the owner asks. A bug found in existing code is reported, not
fixed here.

## Plan review

An Opus plan review (2026-10-27) returned "ready after fixes": 2 Critical, 8 Important, and minors. The findings were checked
against the code and are folded in below. Each fix is marked with its id in the task it changes:
- C-1 and C-2 in Task 1;
- I-1, I-3 to I-7 in Task 2;
- I-2 and I-8 in Task 3;
- the minors where they apply.

A Fable plan review (2026-10-27, owner-requested) also returned "ready after fixes": 0 Critical, 6 Important, and minors. It
was checked against the code and folded in:
- I-B and I-D in Task 1;
- I-C in Task 2;
- I-A, I-E and I-F in Task 3;
- the minors where they apply (C4, C7, Task 1 Step 3, Task 2).

## Builder's calls (for the owner to check; B13 leaves these to the builder)

- **C1, no `rate` field.** B0.3 / B0.9 add `rate` to `lambdaEstimate`, so that `lambdaConv = min(LAMBDA_MAX, max(0, mult x
  rateHat))`. `SOLVER_LAMBDA_MULT` is 1 (`solver.js:230`), so that expression is the returned `lambda`, to the bit. `lambdaConv`
  is `lambdaOf().lambda`, the year's lambda held from the bracket phase (B5.1 step 4). `lambdaEstimate` is untouched.
  The two forms are bit-equal at `mult` 1. At other multipliers, `(mult * rateSum) / 3` and `mult * (rateSum / 3)` can differ in
  the last bit; the plan uses the former, which is the guard's own lambda.
- **C2, line targets are `PLAN_LINE_IDS` only.** B5.2 also lists `senior` and `ctc`, but `magiThresholds` already says no intent
  names a tax-family line. B0.4's validator takes ids from `PLAN_LINE_IDS`. So "just under the senior / CTC phase-out" is not a
  target. `taxFor` still prices both exactly, so a bracket-top or none candidate can land there. Task 0 found 11 amounts at a
  bracket top or a phase-out, but did not split the two. If the owner wants the phase-outs, it is a one-line widening of
  `CONV_LINE_IDS` plus a validator case.
- **C3, the resolver's "not carried" signal.** `resolveConvTarget` returns `-1` when a line target's line is not in the pass's
  list, or when the target's own return carries no share of the conversion. The caller then converts the user's bracket with
  today's ceiling (decision 6). A bracket or `none` target never returns `-1`.
- **C4, the bridge check's units.** All figures are in this year's dollars, undiscounted (B5.4 says "today's dollars"; the
  ratio is the same). `incomeAt` is lifted into a solver helper,
  `benefitIncomeAt(ctx, y, singlePerson, factor, wagesTo)`. `wagesTo` is `null` (no wages) or the run's `{ retireAgeA,
  retireAgeB }` options (Fable minor).
  - `lambdaEstimate` calls it with `wagesTo = null`, which is byte-identical to today.
  - The bridge passes the ages, adding `inputs.incomeA * factor` while Partner A is under `retireAgeA` (and B likewise).
  - Self-employment income counts as wages here. This is a rough figure for the bridge only.
- **C5, free traditional money spent by a conversion.** When the conversion's own traditional is penalty-free (Rule of 55), the
  extra conversion `c - bracketConv` moves that money into unseasoned Roth, out of `accessible`. The check subtracts
  `(c - bracketConv) x freeTradShare`, where `freeTradShare` is the penalty-free share of the traditional pool
  (`tradGroup(wd, false).share`).
- **C7, two recorded approximations.**
  - `reserveSpend` includes the year's healthcare, so the bracket phase's premium is counted in every bridge year (R3's first
    point, in part). It is also this year's figure, used for every bridge year, not B0.7's per-year figure (Fable minor).
  - The PA / RI 401(k) conversion fractions (`run-projection.js:796-822`) are not re-derived per candidate, so the price in
    those two states is approximate.

  Both go in the notes.
- **C8, a partly scheduled window.** B7's preamble says a partly scheduled window searches. The track's condition therefore
  does not reuse `bracketSearchApplies`, which turns off on any non-empty `appliedRothSchedule`. `sizingApplies` is its own
  test, and the scheduled ages are exempt one by one (`convExempt`). See Task 3's gate (Fable I-A).
- **C6, the switch gates both modes.** `ctx.test.convSizingOff` makes `choose` size nothing and `apply` ignore `plan.conv`
  (B4). A switched-off run is today's run, byte for byte.

## Global Constraints

- `CLAUDE.md` holds:
  - Engine functions are context-first and read only `ctx.*`. There is one context shape.
  - A new module-level mutable or constant in an engine module is registered in `tests/engine-purity.json` in the same commit.
  - Hot paths allocate nothing a year does not need.
  - MAGI iteration: new per-phase state lives with the phase state outside the per-pass restore. Nothing goes into
    `scalarSnapshot` (B5.1 step 5).
  - Two-space indentation. Never reformat a module you change. Run `npm run analyze` after adding a module or an export.
- **Byte-identity until Task 5** (review C-1: for the projection snapshots and golden; the plan-shape fixtures move in
  Task 1, listed there).
  - `testHooks.testConvSizingOff` defaults to `true` from Task 1 until Task 5's switch-on commit.
  - A plan with `conv: null` never sizes.
  - Every snapshot, `tests/golden.js` and `tests/plan_off_anchor.js` stay byte-identical through Tasks 1-4.
  - Canada's build bytes move only through the shared `NO_TEST` field (R10).
- Turning sizing on in a test:
  - A browser test calls `window.__test_setConversionSizing(true)` and then `__test_refreshCliffPlan()`.
  - A Vitest test sets `(await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = false` before `await w.ctx()` or
    the planning call.
- **Constants:**
  - `CONV_BRACKETS = [10, 12, 22, 24, 32, 35]`. This is `BRACKET_CANDIDATES`: import it, do not copy it.
  - `CONV_LINE_IDS = PLAN_LINE_IDS`.
  - Ceilings (side `'under'`): `medicaid`, `aca400`, `irmaa1`..`irmaa5`. Floor (side `'over'`): `acaFloor`.
  - `medicaid` is also a floor where `yearPlanCandidates` reads it as one. Its rule is reused, not restated.
- **The score:** `score = ((c * lambdaConv - dTax) - dPremium) - dIrmaa`, evaluated in that order.
  - The candidates are scanned by amount ascending, `none` first. At any equal amount, 0 included, the bracket target comes
    first (review I-3), so a bracket phase that converts 0 never records a needless `'none'`.
  - The running best is replaced only on `score > best + 1`.
- **The keep rule:** the sized track's best stands only when `bracketCandidateBetter(sized, unsized)` is true.
- **Badge:** V146 -> **V147** (US), in Task 5's switch-on commit only. Canada stays V65.
- **Vitest rules** (`CLAUDE.md`, "Where a new test goes"):
  - Exact comparisons only. The one-dollar test compares cents (B9.5 as amended).
  - Use `world()`, counters for many checks, and hand-computed literals.
  - No `it.concurrent`.
  - A new suite is run alone and with `--sequence.shuffle` before its commit.
  - Engine-output comparisons are two runs in one process.

## Review Focus

1. **A sized target that cannot be carried on a historical path.** Examples: an "under" line already passed by that path's
   MAGI, or a floor already crossed. `apply` converts the user's bracket with today's ceiling on that pass, and the row never
   converts more than the bracket would. Pinned in Task 1.
2. **A `none` winner in an orderable year.** The order and split stages start from the sized record. `apply(choose)` reproduces
   the kept order phase row for row. Pinned in Task 2.
3. **A two-return year's per-return line.** The target sizes on that return's own share, `planMet` judges it, and a return
   with share 0 gives no candidate. Pinned in Tasks 1 and 2.
4. **A household under 59.5 whose taxable bridge is thin.** A larger conversion is dropped by the bridge check, and the
   bracket and smaller targets stay. Pinned in Task 2 (B9.6).
5. **A saved v1 plan from before this change.** It loads with `conv: null` and keeps every other field. A malformed `conv`
   drops the stored plan, not the state. Pinned in Task 1.

---

### Task 1 [Opus]: the plan's `conv`, the resolver, and `apply` following it

**Files:**
- Create: `src/shared/core/withdrawals/conversion-targets.js` (the resolver; engine, DOM-free).
- Modify:
  - `src/us/core/cliff-plan/plan-shape.js`: `PLAN_KEYS`, `makePlan`, `convOk`, `isValidStoredPlan`.
  - `src/us/ui/inputs/normalize-state.js:70`: the v1 migration.
  - `src/shared/core/projection/run-context.js:7`: `NO_TEST.convSizingOff`.
  - `src/us/core/test-hooks.js`: `testConvSizingOff: true`.
  - `src/us/core/cliff-plan/planning.js:32`: the test literal.
  - `src/us/ui/install-test-hooks.js`: `__test_setConversionSizing`, modelled on `__test_setBracketSearch` at :163.
  - `src/us/core/withdrawals/roth-conversion.js`: `drawBelow`, `solveRothConversionTop`.
  - `src/us/core/projection/engine-state.js:18`: the `planStats` counters.
  - `src/us/core/projection/run-projection.js`: the conversion block at :787 and the phase state at :526.
  - `tests/engine-purity.json`.
- Test:
  - Create `tests/unit/shared/conversion-targets.test.js`.
  - Create `tests/unit/us/conversion-apply.test.js`.
  - Extend `tests/unit/us/plan-shape.test.js` and `tests/unit/us/stored-plan.test.js`.
- Review C-1, tests that the shape change moves (update each in this task):
  - `tests/legacy_state.js:103-108`: the stored-plan fixtures, whose three deep compares at :155, :156 and :158 (4c, V141,
    4d) gain `conv: null`.
  - `tests/snapshots/legacy_state.json`: its four stored-plan hashes. Regenerate with that script's `--update`, as an intended
    change limited to those four cases, and say so in the commit.
  - `tests/unit/us/guard-normalize.test.js:37-63`: give the fixtures `conv: null` (still `toBe(sp)`), and add one legacy case
    that asserts the migrated copy.
  - `tests/unit/shared/run-context.test.js:44,193`: the `NO_TEST` literal and its key list.
  - `tests/unit/us/plan-shape.test.js:18`.

**Interfaces:**
- Produces:
  - `resolveConvTarget(target, t) -> number`, where `t = { lines, preMagi, preMagiA, preMagiB, shareA, convertible, bracketTop }`.
    - `target` is one of: `'none'`; `'b10'`..`'b35'`; `{ id, ret: 'H'|'A'|'B', side: 'under'|'over' }`.
    - `lines` is `magiThresholds`' shape (`{ magi, own, id, ret }`).
    - `bracketTop(pct) -> amount`.
    - Returns an amount in `[0, convertible]`, or `-1` (C3).
  - `convLineTargets(lines, lineIds) -> Array<{ id, ret, side }>`: the line targets a lines list offers, ids in `lineIds` only
  (the US caller passes `PLAN_LINE_IDS`; `shared/` never imports `us/`).
  - `solveRothConversionTop(ctx, profile, maxAvailable, yearIndex, bracketPct, drawBelow) -> number`, exported from
    `roth-conversion.js`. It is `solveRothConversionTo` with `drawBelow` added to `other` in both branches, only when
    non-zero, so the bracket target's calls stay byte-identical.
  - `PLAN_KEYS` ends with `'conv'`, and `makePlan` defaults it to `null`.
  - `convOk(m)`, internal to `plan-shape.js`: `null`, or an object whose keys pass `validAge` and whose values are `'none'`,
    `'b' + one of BRACKET_CANDIDATES`, or exactly `{ id, ret, side }` (keys in that order) with `id` in `PLAN_LINE_IDS`, `ret`
    in `PLAN_RETS` and `side` `'under'`/`'over'`.
  - `planStats.convYears`, `convApplied` and `convFellBack`, where `convYears = convApplied + convFellBack`, counted on the
    year's final pass.
  - `NO_TEST.convSizingOff` (false), `testHooks.testConvSizingOff` (true until Task 5), `window.__test_setConversionSizing(on)`.

The resolution rule is B6's, per pass:
- A bracket target: `bracketTop(pct)`, capped at `convertible`.
- A household line: `magi -/+ 1 - preMagi`.
- A per-return line: `(own -/+ 1 - preMagiX) / shareX`, where `shareX` is `shareA` for `ret` A and `1 - shareA` for B. A
  `shareX` of 0 gives `-1`.
- The line is looked up by `id` and `ret` in `lines`. If it is absent, or the amount is `<= 0`, the result is `-1`; otherwise
  it is capped at `convertible`.
- `'none'`: 0.

- [ ] **Step 1: Write the failing resolver tests** (`conversion-targets.test.js`, hand-built lines, literals). There is one
  case per branch:
  - `'none'` -> 0.
  - `'b22'` -> `bracketTop(22)`, capped at `convertible`.
  - Under a household line (`magi 100000`, `preMagi 60000`) -> 39999.
  - Over a floor (`magi 30000`, `preMagi 20000`) -> 10001.
  - A per-return under on B with `shareA 0.25`, `own 50000`, `preMagiB 20000` -> `29999 / 0.75`.
  - A line at or below `preMagi` -> -1.
  - A line absent from the list -> -1.
  - A per-return line with `shareX 0` -> -1.
  - An amount over `convertible` -> `convertible`.

  `convLineTargets` (given the `PLAN_LINE_IDS` list as a literal) keeps the ceilings as `'under'` and `acaFloor` as
  `'over'`, and drops `senior` / `ctc`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run tests/unit/shared/conversion-targets.test.js`. Expected:
  FAIL, module not found.
- [ ] **Step 3: Implement the resolver module.** Line 1 is the purpose comment. The module declares no module-level
  constant or alias: callers pass `PLAN_LINE_IDS` / `BRACKET_CANDIDATES` directly. So nothing is registered (Fable minor).
- [ ] **Step 4: Plan shape and the stored plan.**
  - `PLAN_KEYS` gains `'conv'` last; `makePlan` and `convOk` as above.
  - `isValidStoredPlan` checks `convOk(p.conv)`.
  - `normalizeState` migrates first: if `s.storedPlan` is a plain object with `v === 1` and its `plan` has exactly the nine
    old keys in order, the envelope and the `plan` are both copied, with `conv: null` appended to the plan. The raw input is
    never mutated (review C-1). A plan that already has ten keys keeps its identity.

  Tests:
  - `plan-shape.test.js`: `makePlan({}).conv === null`, and `PLAN_KEYS` toStrictEqual the ten keys.
  - `stored-plan.test.js`:
    - A legacy-state case: a v1 plan without `conv` loads with `conv: null` and every other field toStrictEqual the original.
    - A plan with `conv: { 62: 'b12', 63: 'none', 64: { id: 'irmaa1', ret: 'H', side: 'under' } }` survives.
    - Each of these drops the stored plan, one case each: `conv: { 62: 'b11' }`, `{ 62: { id: 'senior', ret: 'H', side:
      'under' } }`, `{ 62: { id: 'irmaa1', side: 'under', ret: 'H' } }` (key order), `{ x: 'none' }`.
- [ ] **Step 5: The switch.**
  - `NO_TEST.convSizingOff: false`.
  - `testHooks.testConvSizingOff: true`, with the comment "piece 3 ships off until Task 5".
  - `storeRunContext`'s test literal reads it. The key order is the `NO_TEST` key order, with the new field last.
  - `__test_setConversionSizing(on)`, as `__test_setBracketSearch`: it marks the stored plan not computed and clears the plan
    cache.
- [ ] **Step 6: Write the failing `apply` tests** (`conversion-apply.test.js`). The households are scan-grid-style patches in
  the file: the TX early ACA single at 75 and the two-return couple of `tests/yardstick.mjs`. Each case compares two runs in
  one process:
  - **(a) `conv: null`:** `apply` with `makePlan({ bracket: 22, bracketFrom: 22 })` gives the same rows as with `conv: null`
    explicit. This is a shape-only check.
  - **(b) A `'none'` intent at one window age:** that row's `conversionAmount` is 0. The rows before that age are
    toStrictEqual the unsized run's.
  - **(c) A `'b12'` intent with the user at 22%:** that year's `row.magiProxy` is at most a hand literal, the 12% bracket's
    top times `taxIndexFactor` plus the standard deduction plus the year's draws. Fable I-D: rows carry no ordinary-income
    field. Use year 0 (factor 1) so the literal is hand-computable. The conversion is greater than 0 and less than the 22%
    run's.
  - **(d) `{ id: 'aca400', ret: 'H', side: 'under' }` on the TX household at an ACA age:** the row's MAGI is below the 400%
    line, and `planStats.convApplied` grew by 1.
  - **(e) The same intent at an age whose MAGI without conversion already exceeds the line:** the year converts what the
    unsized run converts, and `convFellBack` grew by 1.
  - **(f) Exempt ages:** the intent is ignored and the row equals the override's run when either holds:
    - `optimizerState.rothBracketByAge = new Map([[age, 12]])` is set at that age, from
      `w.load('us/core/optimizer-state.js')`, before `w.ctx()`. Fable I-B: `storeContext` takes no `overrides` option. See
      `tests/unit/helpers/us-plan.js:125`.
    - `appliedRothSchedule` holds the age.

    `convExempt` guards `ctx.overrides.rothAmountByAge` being undefined, since the store's overrides literal never carries
    it (as the conversion block does at `:790`).
  - **(g) `convSizingOff`:** a plan with intents gives rows toStrictEqual the `conv: null` run.
  - **(i) A historical path (B9.7):** a line-target plan run on `hist ... | real1966` re-sizes on the path's own MAGI. The
    year's row MAGI is below the line where the target resolved, and equals the bracket fallback where it did not.
  - **(h) Two-return year, per-return intent** `{ id: 'aca400', ret: 'B', side: 'under' }`: Partner B's return MAGI (`row.magiB`,
    `run-projection.js:1944`) is below B's own line (the same year's `magiThresholds` entry's `own`).
- [ ] **Step 7: Run them and see them fail** (`npx vitest run tests/unit/us/conversion-apply.test.js`).
- [ ] **Step 8: Implement `apply` in the engine.**
  - Phase state at `:526`: `convTarget = null` (the held target), `convFell = false`, and `convDone = false` (Task 2's flag,
    declared here). No record predates the choice, so `convTarget` is constant for the rest of the year once set, and the
    records need not restore it. In `apply`, set the target at the year
    start when all of these hold:
    - `plan.conv` is set and `plan.conv[age] != null`;
    - `!ctx.test.convSizingOff`;
    - the age is not exempt: absent from `ctx.overrides.rothBracketByAge`, from `ctx.overrides.rothAmountByAge` and from
      `inputs.appliedRothSchedule`. Write one helper, `convExempt(ctx, age)`, for Task 2 to reuse.
  - In the conversion block, when `convTarget !== null && convertsThisYear`:
    - Set `estUsed = true`.
    - Build the lines only when the target is a line, through one new local builder, `convLinesAt(preMagi, preA, preB)`.
      Task 2's choice uses the same builder. Review C-2: it cannot reuse the guard's call at :1583, which reads
      `inYrA` / `inYrB`, consts declared at :869 after the conversion block (a temporal-dead-zone throw). The builder passes
      `irmaa: { filing, a: medA, b: medB }`, `irmaaGrowth: irmaaGrowth2`, `irmaaGrowthA` and `irmaaGrowthB` set to
      `irmaaGrowth2`, `lo: preMagi` and `hi: preMagi + convertible`, plus the guard call's other fields.
    - Call `resolveConvTarget` with `bracketTop = (pct) => solveRothConversionTop(ctx, profile, convertible, year, pct, estTrad)`.
    - On `-1`, set `conversionAmount = solveRothConversion(ctx, profile, Math.min(convertible, magiSafeRoom), year, age)` and
      `convFell = true`; otherwise use the resolved amount.
    - The fill clamp (`:793`) still applies after either branch.
  - Count `convYears` and `convApplied` / `convFellBack` once, at the year's kept final pass. The flag is reset at each pass
    start.
  - Review I-5: `row.convChoice` is set from `convTarget` and `convFell` on the kept pass, in both modes, so
    `apply(choose)`'s `toStrictEqual` holds. A fallen-back pass shows `'your bracket (target not reachable this year)'`. A year
    whose stay-under trial won shows the target as recorded (the trial converts nothing, and `cliffChoice` says why).
- [ ] **Step 9: Run the new tests, then the guards.** Run `npx vitest run tests/unit/us/conversion-apply.test.js
  tests/unit/shared/conversion-targets.test.js` (expected: PASS), then `npm run analyze` and `npm test`. Expected: all green,
  with snapshots and golden byte-identical (no plan carries `conv` yet). Run each new suite alone and with
  `--sequence.shuffle`.
- [ ] **Step 10: Commit.** Message: "Batch 5 step 5b piece 3, Task 1: plan.conv, the target resolver and apply following it
  (ships off)".

### Task 2 [Opus]: `choose`, the choice at the bracket phase and the sized phase

**Files:**
- Modify:
  - `src/us/core/projection/run-projection.js`: the phase-end block at `:1407` (before the order stage), the phase records
    `natRec` / `trialRecs`, the result's `cliffConvIntents`, and `row.convChoice` beside `:1960`.
  - `src/us/core/cliff-plan/solver.js`: `benefitIncomeAt` lifted from `lambdaEstimate` (C4), and `bridgeNeed`.
  - `src/us/core/accounts/penalty-status.js`: `penaltyFreeMoney(wd)`.
- Test: create `tests/unit/us/conversion-choose.test.js`.

**Interfaces:**
- Consumes (Task 1): `resolveConvTarget`, `convLineTargets`, `solveRothConversionTop`, `convExempt`, `planStats.conv*`.
- Produces:
  - `sim.cliffConvIntents`, non-enumerable: `{ [age]: target }`, recorded only in `choose` with `plan.conv` non-null, for each
    sized year whose winner is not the bracket target.
  - `row.convChoice`, set only on a sized year's row. The strings: `'no conversion (tax-aware)'`, `'the top of the 24%
    bracket'`, `'just under IRMAA tier 2'`, `'just over the ACA credit floor'`, with `" (Partner B's return)"` for a
    per-return line. `cliffPlanSummary`'s `lineName` wording is reused by moving it to a `plan-shape.js` export, `lineNameOf(id)`.
  - `penaltyFreeMoney(wd, status) -> number` (`status` replaces `wd.status`): `bal.taxable + bal.bondTaxable + bal.cash`, plus `rothFreeCaps(wd)` summed and capped at
    `bal.roth + bal.bondRoth`, plus the penalty-free traditional `groupRoom` of both buckets (`tradGroup(wd, false)`).
  - `benefitIncomeAt(ctx, y, singlePerson, factor, wages) -> number`.
  - Two pure helpers in `conversion-targets.js` (shared, for 4A's port):
    - `pickConvTarget(cands) -> index`: `cands` is `[{ target, c, score, dropped }]`, already sorted (Global Constraints). It
      returns the winner's index under the tie rule, skipping dropped candidates.
    - `bridgeShort({ accessible, extra, freeTradShare, taxIncrease, c, early, late }) -> boolean`: true when
      `accessible - extra * freeTradShare - taxIncrease + Math.min(c, late) < early + late`.
  - `bridgeNeed(ctx, { year, age, ageB, singlePerson, factor, reserveSpend }) -> { early, late }`: sums of
    `max(0, reserveSpend - benefitIncomeAt(.., true))` over the years from next year until the youngest living partner under
    59.5 reaches it. `early` covers years `year+1..year+4` and `late` covers `year+5..`. Zero when no partner is under 59.5.

**The year (choose, `plan.conv` non-null, the switch off, not exempt, `convertsThisYear`, convertible > 0):**

1. **The bracket phase** is the natural year as today (it may be a phase the year already runs). At its end, before the order
   stage (`trialIdx < 0 && !orderRun && splitRun === 0 && !convDone`), make the choice:
   - **Prices:** `drawTrad = traditionalGross - conversionAmount` and `gain = taxableGainGross`, the bracket phase's realized
     draws (R4). Review I-4: line amounts and the reach use the realized pre-conversion MAGI, not the pass's estimate-based
     `preConvMagi`. Fable I-C: its form is `:1056`'s:
     - `inh === null`: `magiBase + drawTrad + gain`.
     - otherwise: `magiBase - estInhA - estInhB + inhRealA + inhRealB + drawTrad + gain`.

     The per-return pair comes from `returnMagis(profile, drawTrad, gain, inhRealA, inhRealB)`. Lines come from
     `convLinesAt` (Task 1).
   - **Medicaid as a floor:** a `medicaid` line also gets an `'over'` candidate when `costAt` just over it is lower than just
     under it. That is `yearPlanCandidates`' reading, done here by pricing.
   - Create `planTr` at the choice when `planTrace` is set and it is null. `tax(c)` is `taxFor(ctx, profile, gain, drawTrad + c)`. Before the call, set `profile.conv = c` and
     `profile.medicalExpense` as the year sets it at `premium(c)`; afterwards restore both from the saved doubles.
   - **Premiums:** `premium(c) = costAt(drawTrad + c, gain, pairA, pairB, inhRealA, inhRealB)` and `irmaa(c) =
     irmaaAt(drawTrad + c, gain, inhRealA, inhRealB, pairA, pairB)`, the natural record's own arguments (`:1556`, `:1625`;
     Fable I-C). The pair is the bracket phase's (`pairA` / `pairB` at `:1412`). The profile already holds the settled
     `seHealthA/B` at the choice (`:1380-1400`), so `tax(c)` and `premium(c)` agree; set and restore only `conv` and
     `medicalExpense`.
   - **Year 0:** without `irmaaPriorKnown`, each candidate's pricing sets `seStand0 = true` around its `costAt` call and
     restores the year-0 history doubles afterwards: `irmaaMagiHistory[0]`, plus `magiHistoryA/B[0]` and
     `irmaaMagiHistoryA/B[0]` in a two-return year.
   - **Candidates:** `none`; `b10`..`b35` through `bracketTop` (distinct amounts); one target per `convLineTargets` entry whose
     resolved amount is `> 0` (lines built with the pass's reach, as Task 1); and the bracket target at the phase's own
     `conversionAmount`.
   - **Accessible money (review I-1):** `wd.status` is `ALL_FREE` unless the year drew (`draws.js:69`; `accountStatuses`
     runs only at `run-projection.js:1022`). When `flow >= 0`, compute the statuses with `accountStatuses(ctx.inputs, ...)`
     (the same arguments as :1022, `statusCtx` at :1020-1021) into a local, and pass it to `penaltyFreeMoney(wd, status)`.
     `wd` itself is not written, so every object an `apply` pass touches stays identical. `bridgeNeed` uses the run's
     `retireAgeA` / `retireAgeB` options, not `inputs`.
   - **The scan and the bridge:** scan by amount ascending (the bracket first on equal amounts) and apply the score and the
     tie rule (Global Constraints). Drop a candidate `c > bracketConv` when
     `penaltyFreeMoney(wd) - (c - bracketConv) * freeTradShare - taxIncrease(c) + Math.min(c, late) < early + late`.
     Here `taxIncrease(c) = (tax + premium + irmaa)(c) - (tax + premium + irmaa)(bracketConv)`. This is
     `bridgeShort({ accessible: penaltyFreeMoney(wd), extra: c - bracketConv, ... })`.
   - Set `convDone = true`.
2. **A winner that is the bracket target** changes nothing: the year continues into the order, split and trial stages exactly
   as today.
3. **A winner that is not the bracket target:**
   - Set `convTarget = winner` and record `convIntents[age]`.
   - Reseed from the year's start seeds: `prevDiscTraditional`, `prevTaxableGainGross`, `prevSeHealthA/B`, `prevInhA/B`, and
     `estShareA = 0`.
   - Reset `seHeld`, `seKind`, `forcedPass`, `phaseUnresolved`, `passLog.length = 0` and `phasePass = -1`, then `continue`.
   - The year's lambda is already held (`yearLambda`, computed for `lambdaConv`).
   - At the sized phase's end, `convDone` is true, so the block proceeds as for any natural year: it builds its natural record
     (`natRec` carries `convTarget`) and runs the order, split and trial stages. Both stages see the sized `conversionAmount`,
     so a `none` winner lets them run and a converting winner does not (B0.3).
   - `convTarget` is constant for the rest of the year (Task 1), so no record or replay carries it. Do not add it to
     `natRec` or `trialRecs`.
   - `magiStats` count the kept phase only: the discarded bracket phase's forced and unresolved flags are not counted.
4. **`apply` with `plan.conv[age]`** runs the year's first phase sized (Task 1), so its passes are `choose`'s sized phase pass
   for pass (B5.1 step 3's seeds).

- [ ] **Step 1: Write the failing tests** (`conversion-choose.test.js`):
  - **The one-dollar test (B9.5, cents; review I-6):** `taxFor` on a hand-built year-0 profile (factor 1), single, TX, inside
    the 22% band. `Math.round((tax(c+1) - tax(c)) * 100)` toBe `22`. The score goes through a pure export,
    `convScore(c, lambdaConv, dTax, dPremium, dIrmaa)` in `conversion-targets.js`, with literal inputs. Its result at `c` and
    `c+1` toBe hand-computed literals in the evaluation order. No `lambdaEstimate` output appears in an expectation (rule 6).
    The hand-built profile carries `seOn: false` and `dependents: NO_DEPENDENTS`; `LAMBDA_PROFILE` at `solver.js:136` is
    the model.
  - **The tie rule:** two candidates with equal score keep the smaller amount, and a larger one winning by exactly $1 does not
    replace it. (`pickConvTarget`, hand-built candidates).
  - **The bridge (B9.6; review I-7):** a household at 52, taxable $150k, traditional $1.2M, spending $60k, the user's bracket
    **12%**. Its `b32` candidate is dropped, and `b22` (larger than the bracket conversion, so it is checked) is not. Assert from `planTr.conv` (Step 3's trace: candidates, dropped flags). A second
    case calls `bridgeShort` with the traced figures and `early = late = 0`, standing in for "the check removed", and gets
    false, and with the traced real `early` / `late` returns true. So the drop comes from the need. Tests (a) and (g) of
    Task 1 are guards only; they do not count as pinning behaviour.
  - **apply reproduces choose:** for the TX, NY and two-return gap households at 75 and with the levers `PLAN_LEVERS`, run
    `choose` with `conv: {}` and then `apply` with `{ ...plan, conv: sim.cliffConvIntents, intents, orders, splits }`. The
    rows are toStrictEqual. At least one household must record a sized intent, or the test fails (it guards its own premise).
    Add a self-employment household and a year-0 household without `irmaaPriorKnown`, where `apply` skips a phase that
    `choose` ran.
  - **A `none` winner with a kept order phase** (if no household reaches it, record that in the Task 4 notes, as M17): a
    household where `cliffConvIntents[a] === 'none'` and `orderIntents[a] ===
    'traditional'` at the same age. Find it among the gap households and the scan grid, and pin the age. `apply` reproduces it
    (covered above, asserted separately by age).
  - **A per-return line target in a two-return year,** recorded with `ret` `'A'` or `'B'` and met by `planMet` on its return.
  - **`convSizingOff` and exempt ages:** `choose` with `conv: {}` records nothing and its rows equal `choose` with `conv:
    null`.
  - **M17 (B9.8):** if some sized year is followed by a kept fill, the test from Task 1 Step 5 of
    `docs/superpowers/plans/2026-10-08-review-followups.md`, proven red on deleting the clamp line. If no household reaches it
    in the gap households and the scan grid's conversions-on half, record that in the Task 4 notes instead.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the choice, the sized phase and the record.**
  - `planTr.conv = { candidates: [{ target, c, score, dropped }], winner }` is test-only, as `planTr.candidates`.
  - The candidates array is allocated only in a sized year.
  - `lineNameOf` moves to `plan-shape.js` and `cliffPlanSummary` imports it (an identical string).
- [ ] **Step 4: Run the new suite, then `npm run test:unit`, `npm test` and `node tests/survivor_symmetry.js`.** Expected:
  green, with snapshots byte-identical (the switch is still off in the store context).
- [ ] **Step 5: Timing spot check before committing.** Run the scratch `task0_timings.mjs`, adapted to call
  `__test_setConversionSizing(true)`, on the TX household at 75, with `choose` and `conv: {}` only (Task 3 adds the track). If
  the sized `choose` run is more than 2x the unsized `choose` run, stop and report the per-year pricing cost before Task 3.
- [ ] **Step 6: Commit.** Message: "Batch 5 step 5b piece 3, Task 2: choose sizes each conversion year at the bracket phase
  (ships off)".

### Task 3 [Opus]: the sized track in planning, Optimize, the stored plan and the summary

**Files:**
- Modify:
  - `src/us/core/projection/run-projection.js`: `computeCliffPlan` at `:2112`, `measure`, `makePlan` calls, and the sized
    track after `auto` (`:2269`) and before the stored-plan guard.
  - `src/us/core/cliff-plan/planning.js`: `cliffPlanSummary`, the conversion clause.
  - `src/us/ui/results/table-annotations.js`: `convChoice` in the tooltip.
  - `src/us/index.html`: the bracket select's `data-tip`.
- Test: create `tests/unit/us/conversion-plan.test.js`, and extend `tests/unit/us/plan-search.test.js` and
  `tests/cliff_plan.js` (shape only).

**Interfaces:**
- Consumes (Task 2): `sim.cliffConvIntents`.
- Produces: `out.plan.conv` (null when unsized). `out.report.sized`, present only when the track ran:
  `{ candidates: [{ family, intents, conv: n, depletedAge, homeDrawAge, value, cost }], kept: bool, convIntents: { none: n,
  bracket: n, under: n, over: n } }`.
- `report.brackets`, `candidates`, `kept` and `keptIndex` stay the unsized selection's, byte for byte, when the track is not
  kept.

**The track** runs only when `search && sizingApplies(ctx)` (Fable I-A: not `applies`, which is false for a partly scheduled
window, C8). `sizingApplies` holds when all of these do: `inputs.cliffGuardEnabled`, `conversionsInPlan(inputs)`,
`!ctx.test.convSizingOff`, and at least one window age that `convExempt` does not exempt. That is the deferred pass only: the
light refresh runs `search: false`. `report.searched` becomes `search || (!applies && !sizingApplies(ctx))`, so a light plan
whose only search is the track still gets its deferred pass.
1. **The sized `choose` run:** `run('choose', makePlan({ bracket: kept.bracket, bracketFrom: from, mult: useMult, levers:
   keptLev, conv: {} }))`. Review I-2: `keptLev` is the kept track's levers, which `automatic()` returns:
   - `{ order: true, split: false }` when `track === 'order'`;
   - `null` when `leverPlanStands` fell back to toggle off;
   - otherwise `lev`.
2. **No recorded conv intent:** no candidate is added and the track ends with `kept: false`.
3. **Candidates:**
   - `all`: `measure('all' or 'none', intents, sim, orderIntents, splitIntents)` with `conv` attached.
   - When its intents span both families, the ACA-only and IRMAA-only subsets run through `apply`, each holding the run's
     `conv`, orders and splits.
   - The sized best is chained by `planCandidateBetter` in that fixed order.
4. **The keep rule:** the sized best replaces the unsized `best` only by `bracketCandidateBetter(sizedBest, best)`. `measure`
   gains a `conv` argument and `n` counts conv intents too (the fewer-intents tie rule).
5. **The plan:** `makePlan({ ..., conv: best.conv })` (null for an unsized best).
6. **The report (review I-8):** a kept sized candidate is appended to `report.candidates` (with `conv`, a count), and
   `keptIndex` points at it, so `tests/cliff_plan.js:276` (`candidates[keptIndex].family === kept`) holds. When the track is not
   kept, `candidates` is unchanged. Fable I-E: the kept bracket's `report.brackets` entry is refreshed from the kept sized
   candidate, as stage 2 does (`:2231-2232`).

**Optimize:** no new code path. Its trials call `computeCliffPlan(ctx, { mult, ... })` and get the track at that `mult`, and its
winner's plan carries `conv`. Confirm that `plan-search.js` builds no plan by hand (it passes `out.plan` through).

**The summary clause** comes after 3a's bracket clause:
- "Conversions: the top of the 24% bracket at 62-65; just under IRMAA tier 2 at 66-70; none at 71-74 (tax-aware sizing)."
- When the track ran and was not kept: "Conversions: your bracket (tax-aware sizing found nothing better)."

Runs of ages are grouped by equal target, as the guard's runs are. Per-return targets append "(Partner B's return)". Fable
I-F: the clause is part of the `conversions` string, so the early return at `planning.js:100` (no intents, orders or splits)
prints it too. A test covers a plan whose only lever is sizing.

- [ ] **Step 1: Write the failing tests** (`conversion-plan.test.js`, with the switch on):
  - **The keep rule (by construction):** for the gap households at both lengths, the kept plan's `depletedAge` and
    `homeDrawAge` are no earlier than the unsized plan's (same call with the switch off). If `report.sized.kept`, the value is
    higher by more than `max(1, 0.001 x |value|)` or the depletion or home draw is later.
  - **Not kept:** the plan and report toStrictEqual the switch-off call's, except `report.sized`.
  - **The deferred pass:** `computeCliffPlan(ctx, { search: false })` has no `report.sized` and calls `choose` with `conv`
    never. Assert through `ctx.stats` deltas against the unsized call.
  - **Optimize** (if no case is found, record it in the notes): `plan-search.test.js` gets one case where `optimizePlan`'s winner carries a non-null `conv`, and Apply's
    stored plan passes `isValidStoredPlan`.
  - **The summary:** `cliffPlanSummary` on hand-built plans gives the two strings above, a per-return clause, and the
    unchanged string for `conv: null` with no track.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the track, the report, the summary, the tooltip** (`annotateSolverRows`: `Conversion: ${r.convChoice}`
  beside `cliffChoice`), and the tip. The tip's text: the bracket is the starting point, and with the cliff guard on the plan
  may size each conversion year by price. The `<small>` descriptor is unchanged.
- [ ] **Step 4: Run `npm run test:unit`, `npm test`, `node tests/bracket_search.js`, and `node test_optimizer_ui.js` after
  `npm run build`.** Expected: green, with snapshots byte-identical. The per-year card's two 10 s limits hold; record the
  times.
- [ ] **Step 5: Commit.** Message: "Batch 5 step 5b piece 3, Task 3: the sized track in the cliff plan, Optimize and the
  summary (ships off)".

### Task 4 [Sonnet for scripts, Opus for the readings]: guards and measurements

**Files:**
- Create: `tests/conversion_sizing.js`, added to `npm test` after `tests/bracket_search.js` in `package.json`.
- Modify:
  - `tests/solver_scan.js`: a `--sizing` column, sized vs off, with 3a's first-home-draw column.
  - `tests/yardstick.mjs` and `tests/fill_probe.mjs`: `--sizing`, which calls `__test_setConversionSizing(true)` before
    planning.
  - `tests/bench_solver.js`: confirm the converting scenario.
  - `docs/architecture/test-inventory.md`.
  - `docs/next-batches-plan.md`: a new section, "Batch 5 step 5b piece 3: measurements".

- [ ] **Step 1: `tests/conversion_sizing.js`** covers the conversions-on, standard-projection, default-order part of the scan
  grid (384 households). For each: plan with the switch off and on. It exits 1 on any household whose sized plan depletes, or
  first draws on the house, earlier. It prints the count of households with a kept sized plan and the wall time. Target:
  under 60 s (B0.6). If it is over, stop and report.
- [ ] **Step 2: Add `--sizing`** to the yardstick, the fill probe and the scan, and document each in `test-inventory.md`.
- [ ] **Step 3: Measure** (B0.8). Each run goes in the background where it takes over 2 minutes:
  - The yardstick, free and `--hold-bonds`, both lengths, with `--sizing`, and once more with `--levers conv --sizing`. The
    table is the 5b table plus a sized column and the bond share, auto vs sized.
  - The fill probe, `--mode both`, before and after: the held wins.
  - The scan's conversions-on half, sized vs bracket, and guard on vs guard off with sizing on (B9.3), with the historical
    and Monte Carlo rates reported (not gated).
  - Timings: re-run the Task 0 scratch script with sizing on. It covers planning per input change, Optimize, and the per-year
    card.
  - `node tests/bench_runs_interleaved.js` and `node tests/bench_solver.js`, each with `--base` set to a built `cf22985` tree.
    Use a fresh `git worktree add` in the scratchpad, removed afterwards; this is the session's own temporary tree, not
    another session's.
- [ ] **Step 4: Check the gates** (B0.6): the sized track at most +50% of the slowest gap household's planning, Optimize at most
  +40%, `bench_runs_interleaved` +5%, `bench_solver` +30%. Write every figure, gate verdict and the piece-2 bond-share reading
  into the notes section. Any gate over: stop for the owner.
- [ ] **Step 5: Commit.** Message: "Batch 5 step 5b piece 3, Task 4: conversion_sizing guard, --sizing measurements, notes".

### Task 5 [Opus]: the snapshot movers, then (on the owner's OK) the switch-on

**Files:**
- Modify:
  - `src/us/core/test-hooks.js`: `testConvSizingOff: false`.
  - `src/us/index.html`: the V147 badge.
  - `README.md`.
  - `docs/architecture/cliff-plan.md`: sizing, `plan.conv`, the track, the resolution rule, the bridge.
  - `docs/architecture/engine.md` and `docs/architecture/magi-iteration.md`: the sized phase and its seeds.
  - `docs/next-batches-plan.md`.
  - The snapshot baselines, through `npm run snapshot:update` only after the OK.
- Create: `scratchpad/classify_movers.mjs` (scratch). It applies B9.1's mechanical bridge-drain test to the before / after
  snapshot dumps.

- [ ] **Step 1: List the movers** with the switch flipped locally and nothing committed. Run `node tests/snapshot.js` and dump
  before / after. For each moved scenario give: conversions on and the guard on (assert both), depletion and first home draw
  before / after, and the end value. Then:
  - Standard shift-0 movers never deplete or draw earlier. If one does, it is a bug: stop.
  - Historical movers are classified as (i) bridge drain or (ii) market variance by the script.
  - B9.1's five first-attempt scenarios are listed by their current names, moved or not.
- [ ] **Step 2: Stop for the owner** with the movers table (in the notes and in the message). Any (i) case goes with B9.1's
  remedy options.
- [ ] **Step 3: On the OK, in one commit:**
  - the switch on;
  - `npm run snapshot:update`;
  - V147;
  - README (the cliff plan's feature line gains the per-year sizing);
  - the topic docs, and the notes with the movers table;
  - `tests/cliff_plan.js` and `tests/solver_hooks.js` deltas, if the extra `choose` run moves the counters they read.

  Run `npm test` and `npm run test:ui` (expected: green), and do the mobile-width check of the summary line.
- [ ] **Step 4: Commit.** Message: "Batch 5 step 5b piece 3, Task 5: conversion sizing on (V147), snapshot update for the
  listed movers". The message says that the snapshot update is an intended behaviour change.

### Task 6 [Opus]: the independent review

- [ ] **Step 1:** Run an Opus review subagent on `git diff cf22985...HEAD`, given the spec's B0, this plan and the Batch 5
  notes. Its focus:
  - the MAGI-iteration invariants (seeds, records, replays);
  - `apply(choose)` reproduction;
  - byte-identity of unsized plans;
  - the stored-plan guard and migration;
  - the five Review Focus lines.
- [ ] **Step 2:** Fold in the Critical and Important findings, each as its own commit with a test. List the Minor findings in
  the notes. A finding that is a bug in pre-existing code is reported, not fixed (owner rule).
- [ ] **Step 3:** Run `npm test` and `npm run test:ui` (green). Stop for the owner: no push or PR until asked.
