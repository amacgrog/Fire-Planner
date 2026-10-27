# Batch 5 step 4d: the two-return draw split as a plan lever (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a two-return year with no conversion, the plan may draw one partner's traditional accounts first (`splits[age] =
'A' | 'B'`), chosen on the deterministic run, kept only by the whole-run rule and followed literally on every path; the rows
carry `drawSplit`. This is the last lever of step 4.

**Architecture:** One new per-pass field, `wd.splitFirst` (-1, 0 for A, 1 for B), makes every penalty-free `takeTraditional`
draw take that partner's free accounts first (`wd.onlyPartner`), then the other's, while `profile.ownerShareA` tracks the
realized share of the year's traditional income on every bisection probe. `runProjection`'s phased year gains a split stage after
4c's order phase and before the cliff trials: in `choose` (with `plan.levers.split`) A-first and B-first run as converged phases
against pro rata and the lambda score keeps one; in `apply` a year with a split intent runs the same sequence and keeps it. A new
MAGI-iteration estimate, `estShareA`, prices each split pass's per-return healthcare at the share it will realize.
`computeCliffPlan` holds every split in the lever stage and adds one candidate without them at the kept bracket. The toggle-on
levers become `{ order: true, split: true }`.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright (root `test_*.js`,
`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (approved 2026-10-25): sections 4.1 (plan shape,
`levers`), 5 (shared lever rules and gates), 8 (4d), builder's call 15. Acceptance: `docs/next-batches-plan.md` Batch 5 "The three
policies and their acceptance tests" (two-return draw split). Follow-ups this plan settles: the "Batch 5 step 4b" and "Batch 5
step 4c" notes. Base `8f406f4` (origin/main, PR #52, US V142). Branch `claude/b5-4d-split-b5f41b`.

**Process (owner, 2026-10-25):** one Opus plan review; implementers tagged **[Opus]** (engine) or **[Sonnet]** (mechanical);
every review on Opus; 4d is its own PR; no push or PR until the owner asks.

## Owner rulings before Task 1

**Owner (2026-10-26): R1 (a) and R2 (a) approved.** A Fable plan review was requested before the build.

- **R1: the per-return `met` guard (the 4b Fable finding).** In a two-return year a stay-under or fill on Partner A's or B's
  line is placed in household MAGI through the traditional share (`toHousehold`), while gains split half and half
  (`returnMagis`). With `shareA < 0.5` return A can end over its own line by `G * (1/2 - shareA)` while `met` passes. A split
  moves the share to 1 or 0, so in split years the error is the rule, not the exception. Fix: `met` also requires the intent's
  own return MAGI on its side of the return's own line (Task 2). `choose` and `apply` must share the test, or the replay breaks.
  - **(a) recommended: everywhere.** `apply` accepts a trial on `met` alone on historical and Monte Carlo paths and for stored
    plans, so a mis-met there runs a year over its own line with no check; and `choose` and `apply` must share one predicate.
    Cost: guard-on two-return scenarios with the toggle off can move (a trial now rejected). Two-return years come from a couple
    filing single as well as from `marryLater` (the 4b note says `marryLater` only; Task 7 corrects it). The movers are listed
    under their own cause before `snapshot:update`. This amends spec section 3's "only toggle-on two-return scenarios move".
  - **(b): only in split years** (`yearSplit !== null`): no toggle-off mover; the pre-existing mis-met stays, recorded.
- **R2: a split phase's lines (Opus review I2).** Spec 8 builds a split year's lines from the pro-rata natural year, so a
  per-return line is translated into household MAGI at the pro-rata share. `costAt` / `irmaaAt` price at the split's share (1 or
  0), so a split year's candidates and caps sit in the wrong place, and the trials there are effectively inert.
  - **(a) recommended: each split phase builds its own lines at its realized share**, through the same `magiThresholds` call. At
    share 1 `toHousehold(..., 1 - shareA)` is NaN for B's lines, and `add` drops them (`Number.isFinite`). That is the right
    answer: the draw cannot move B's return, so no stay-under on B's line exists. A share strictly between 0 and 1 (a cascade)
    translates as today. This amends spec 8's "a split phase does not rebuild them".
  - **(b): split years carry no cliff trials** (the split and a cliff intent never share an age). This is simpler, and the
    gains-capped and IRMAA stay-unders are lost in split years.
- **Go-ahead and execution method** (subagent-driven recommended, as 4a-4c).

## Spec amendments and builder's calls (for the owner to check)

Opus plan review (2026-10-26; "ready after fixes": 3 Critical, 7 Important, 9 Minor) folded in at the commit after 6d8cfdf:
C1-C3 (the natural record in split years, the split after a rejected order, `estShareA` in the forced pass) in D2 / Task 4; I1
in D9 / Task 5; I2 became R2; I3 in D4 / Task 3; I4 and I7 in Task 4; I5 in Task 2; I6 in D7 / Task 4; minors M1-M5, M7-M9
folded in, M6 ruled (Task 1).

Fable plan review (2026-10-26, owner-requested; "ready after fixes": 0 Critical, 6 Important, 8 Minor) folded in at the commit
after e62a575: I1 (the estate's end-tax profile at `ownerShareA0`) and I6 in Task 4's state machine; I2 in D9; I3 and I4 in
Task 4's tests; I5 in Tasks 6 and 7; M1-M8 in D5, D6 / Task 4, Tasks 1, 2 and 6.

- **D1, the realized share (spec 8 generalised).** The spec's `fromFirst / (fromFirst + probe)` assumes the year's traditional
  income is only the split draw. The plan uses the general form, which reduces to the spec's when nothing else is in
  `traditionalGross`: at each split draw's start, the A-attributed dollars already in `traditionalGross` are
  `profile.ownerShareA * traditionalGross` (`attrA`). Each probe sets `ownerShareA = (attrA + (partner === 0 ? probe : 0)) /
  (traditionalGross + probe)`, and the realized value is set after the draw. At the withdrawal's start the share is
  `ownerShareA0`, so dollars added before any split draw are pro rata, as today. Penalized draws and early Roth earnings in a
  split pass follow the share in force when they are added. That is a known approximation, recorded: such a pass is rare, because
  penalized money means a partner is under 59.5, and that partner's free money is usually what makes the year splittable.
- **D2, a new estimate: `estShareA` (spec silent; needed for correctness).** The pass prices ACA and the conversion ceiling per
  return before it draws (`returnMagis` at the pass start). With the pass-start reset to `ownerShareA0`, a split pass would charge
  each return's premium on the pro-rata share, and the year would converge with a mispriced premium. So in a split phase the pass
  starts with `profile.ownerShareA = estShareA`, and the share is set back to `ownerShareA0` at the withdrawal's start (D1).
  `estShareA` converges like `estTrad`: drift `|realizedTrad * shareEnd - estTrad * estShareA|`, the same damping, the same
  `MAGI_ITER_MAX`. Seed: 1 for A-first, 0 for B-first. A trial from a kept split phase is seeded with the phase's realized share.
  `estShareA` goes everywhere the other estimates go (Opus review C3): the `passLog` entries and the forced pass's pick (a forced
  pass must repeat the picked pass exactly, or its refund can go negative), the `seHeld` switch's seeding (to the realized
  share), every record and every replay.
  Outside split phases nothing changes (the pass start still resets to `ownerShareA0`).
- **D3, no conversion in a split phase.** The split runs only where the natural pass converted nothing. A split pass's per-return
  ceiling could still size a conversion, so `conversionAmount` is held at 0 in split phases, as a stay-under holds it.
- **D4, which draws split.** Every penalty-free `takeTraditional` call in a split pass takes the first partner's free accounts
  first, then the other's: the stock step, a mix share, the fallthrough, the release and the bond reserve's uncapped draw. A fill
  (`fillTraditional`, a gross amount) in a split pass also draws the first partner's free accounts first and updates the share by
  D1's rule (Opus review I3: a pro-rata fill at the share in force would tax B's dollars on A's return). Penalized draws stay pro
  rata (D1). Taxable is a joint pool and is not split (spec 8).
- **D5, eligibility (`splittable`).** All of these: a two-return year (`twoReturns`); the natural pass converted nothing; a draw
  year (`flow < 0`); the natural pass drew discretionary traditional money (`wd.traditionalWithdrawn - rmd > 0`, not counting Roth
  earnings; it also counts penalized draws and the inherited last resort, which are rare when both partners hold free money, and
  that approximation is recorded with D1's; Fable review M3); and at the withdrawal's start both partners' penalty-free accounts hold traditional money (`wd.splittable`). It is
  written right after `wd.penaltyAware = hasPenalizedMoney(wd)` (`wd.status` is set just before), only when the lever or a split
  intent can read it. A joint return, a survivor year and a single person are never two-return years, so never split. `apply`
  with an intent at an age where the path's year is not splittable keeps the natural year and counts `planStats.splitSkipped`.
- **D6, the sequence.** natural -> order (4c) -> split -> cliff trials. The split starts from the year's natural record: the
  kept order phase, or the natural year itself when the order phase did not run or was rejected. Under R2 (a), each split phase
  builds its own lines and its trial candidates at its end, from its own pass (`natOf`, `costAt`, `irmaaAt`, `lo` / `hi`), and
  stores them in its record, as 4c's `orderNat` stores the natural trials. When B-first runs after A-first, A's candidates were
  priced by A's pass. A kept split phase becomes the year's natural record: the trials start from it, it seeds the next year
  (4c A3) and its record carries `split` and the realized share. A split phase runs with `yearOrder = naturalRec.order`.
- **D7, the year's choice (choose).** The split phase's `ok` is 4c A4's: it drew, `wd.need <= 1`, and `wd.homeDrawn <= natural +
  1`. The chain is the trials': `best = natural`; for A-first, then B-first, `if (ok && score > best.score + (best === natural ?
  1 : 0)) best = it`. So pro rata wins every tie, and A beats B only by more than $0. `apply` keeps its one phase always (as the
  order). Identical partners filing single: an even draw is already the pro-rata draw, so a split should not win; Task 4 pins
  A-dies against B-dies there (Opus review I6), because `tests/survivor_symmetry.js` runs a joint household with the toggle off.
- **D8, `k401DrawFracA/B`.** Spec 8 says recompute them from the accounts drawn. A split draws a partner's free accounts in the
  same proportions as the pro-rata draw does, so each filer's 401(k) fraction is unchanged. Task 3 Step 1 confirms this from
  `k401Fractions` and records it; if `k401Fractions` ignores penalty status, that is a pre-existing gap, recorded and not fixed.
- **D9, the keep rule (spec 8: one subset, with / without).** Stage 1 (4c) holds every order and every split of the lever
  `choose` run. A lever run that records splits but no orders now counts. Stage 2 at the kept bracket adds one candidate: the
  stage-2 top's family, intents and orders with `splits: null`, when the top holds splits. 4c's tries (order phases alone, no
  orders) keep the top's splits. `n` counts splits too, so a tie keeps fewer intents. A try is skipped only when it would be
  `off` (Fable review I2). 4c's no-orders line (`run-projection.js:1921`) becomes `if (top.family !== 'none' || top.splits)
  tries.push(null)`, and the no-splits try is skipped when the family is `none` and `top.orders` is null. An empty `orders` or `splits` map is null in `measure` and in every plan (Opus review
  I1: `isValidStoredPlan` requires `orderPhases` null exactly when `orders` is, so a splits-only Optimize winner carrying `orders:
  {}` would be dropped on load). A2 (`leverPlanStands`) is unchanged and
  still guarantees toggle on >= toggle off on the standard projection.
- **D10, the levers.** `ORDER_LEVERS` is replaced by `PLAN_LEVERS = Object.freeze({ order: true, split: true })`: toggle on, and
  Optimize's default (4c A8). The `lev` test becomes `levers && (levers.order || levers.split)`. A levers option with both off is
  no lever (byte-identical).
- **D11, counters.** `planStats.splitYears`, `splitApplied`, `splitSkipped` (`splitYears = splitApplied + splitSkipped`).
- **D12, 4c follow-ups.** Unify the phase score and the `naturalRec` literal (Task 1, required before the split adds copies).
  `onlyPartner` is now set (Task 3). Left recorded, because 4d does not read them: `isValidStoredPlan` not checking `orderPhases`
  against the order ages; the guard accepting `levers.order` false with `orders` set (and now `levers.split` false with `splits`
  set); the A2 revert branch's integration run; the "not used" clause from lever-only families.
- **D13, timing fallback.** If the toggle-on two-return household's planning is over 150 ms, `choose` runs one split phase only:
  the partner whose return has the lower pre-draw MAGI first (`preMagiA` vs `preMagiB` less the draw estimate). Decided in Task 4
  from a measurement, before any pin is written.

## Global Constraints

- `CLAUDE.md` holds. Engine functions are context-first and read only `ctx.*`; one context shape. A new module-level mutable or
  constant in an engine module is registered in `tests/engine-purity.json` in the same commit. Hot paths allocate nothing a year
  does not need. MAGI rules: what a phase mutates is reset at the pass start, and a new per-phase variable joins the phase
  records. Two-space indentation; never reformat a module you change.
- `npm run analyze` in every task that adds, renames or removes an export.
- Toggle off (no `levers`, `mult` null) with the guard off: every engine snapshot is byte-identical. Under R1 (b) the whole toggle
  off grid is byte-identical too. Under R1 (a) only guard-on two-return scenarios may move, from Task 2. Toggle-on movers come from
  Task 4 on. The `off` path of `takeTraditional` gains one compare (`wd.splitFirst >= 0`) and nothing else.
- `npm test`'s snapshot step may go red from Task 2 on, by design, until Task 7's `snapshot:update` after the owner OKs the
  movers. Each task runs the steps after it by hand: `npm run test:unit`, `node tests/golden.js`, `node tests/survivor_symmetry.js`
  and the scripts it names.
- Vitest rules of `CLAUDE.md` ("Where a new test goes"): exact comparisons, `world()`, counters, hand-computed literals, no
  `it.concurrent`. A new suite runs alone and with `--sequence.shuffle` before its commit.
- A bug found in existing code is recorded in the task report and the Batch 5 notes, not fixed here. Never `git stash`; never
  touch other worktrees.

## Review Focus

1. **A partner with no penalty-free money** (B under 59.5, no Rule of 55): not splittable, no phase runs, and the natural draw is
   unchanged. Pinned in Task 4.
2. **The first partner's free stock-account money runs out mid-draw:** the draw cascades to the other partner, and the
   realized share is A's drawn dollars over `traditionalGross`. Neither the cap nor the bisection goes short. Pinned in Task 3.
3. **A stay-under in a split year** (ACA on two returns): under R2 (a) the trial uses the split phase's own lines, met is judged
   per return (R1), and `apply(choose's plan)` reproduces `choose` row for row. Pinned in Task 4 (under R2 (b): a hand-built plan
   with a split and an under intent at one age keeps the split and skips the intent).
4. **`marryLater`:** splits only before the marriage age, none after (a joint return), and none in the survivor years. Pinned in
   Task 4.
5. **A historical path whose split year has no free money left on one side:** `apply` keeps the natural year, counts
   `splitSkipped`, and the rows equal the same plan without that age's split. Pinned in Task 4.

---

### Task 1 [Opus]: one phase score and one natural record in the phase-end block (pure refactor)

**Files:** Modify `src/us/core/projection/run-projection.js` (the phase-end block, about 1327-1576).

**Interfaces:** Produces `phaseScore(bal, lam, seSettled, seSettle, irmaa)` (module-level, not exported):
`seSettled ? afterTaxValue(bal, lam.lambda, lam.tauGain) + seSettle - irmaa : afterTaxValue(bal, lam.lambda, lam.tauGain) -
irmaa`. Also produces one `natRec(cliffCost, score, order)` arrow, defined once inside `if (phased && !replaying)`, that returns
the natural-record literal (the keys and order of today's literals at 1406 / 1444 / 1461). Every caller passes `irmaaAt(...)` with
the arguments it passes today: the settled form with `pairA, pairB`, the unsettled form without. apply passes `null` for `cliffCost` and `score`, as
today, so it calls neither `irmaaAt` nor `lambdaOf` at a phase end (Fable review M4). (`natRec` is an
arrow, not a module function: it closes over about twenty year-loop values, and it is allocated once per phase end in phased
runs only, which is negligible next to a pass; Opus review M6, ruled.)

- [ ] **Step 1:** Replace the four score expressions (1362, 1406, 1461, 1527) with `phaseScore`, and the three `naturalRec`
  literals with `natRec`. Today's 1444 literal (apply, an intent year) has no `cliffCost` / `score` keys; through `natRec` it gets
  both as `null`. Nothing reads them in apply (check every `naturalRec.` read in the block), so no number moves.
- [ ] **Step 2:** `npm run build` then `node tests/snapshot.js`: US and Canada pass (byte-identical). `npm run test:unit`
  green; `npx vitest run tests/unit/us/order-lever.test.js tests/unit/us/cliff-plan*.test.js` green; `node tests/golden.js`.
- [ ] **Step 3:** `node tests/bench_runs_interleaved.js --base <8f406f4 build> --rounds 11`: within +5%.
- [ ] **Step 4: Commit** `Batch 5 4d: one phase score and natural record in the phase-end block (refactor, no number change)`.

### Task 2 [Opus]: the per-return `met` guard (R1)

**Files:** Modify `src/us/core/cliff-plan/solver.js` (`magiThresholds`' `add`, `underPlanOf`, `fillPlanOf`, `NO_PLAN`, new
`planMet`), `src/us/core/projection/run-projection.js` (apply's `met` at 1496, the trial record's `met` at 1525, the row label
at 1690). Test: `tests/unit/us/plan-met.test.js` (new).

**Interfaces:** Produces:
- A threshold object `{ magi, label, id, ret, family, own }`: `own` is the line in the return's own MAGI for `ret` A / B (the
  value before `toHousehold`), and `magi` for `ret` H.
- A plan object `{ kind, magi, label, id, ret, own }`: under `own - 1`, fill `own + 1`. `NO_PLAN.own = 0`.
- `export function planMet(plan, realizedMagi, magiA, magiB)` -> boolean. The household test is today's. For `ret` A (B) under
  R1 (a), add `magiA <= plan.own + 1` (under) or `magiA >= plan.own - 1` (fill), and likewise `magiB`. Under R1 (b), the caller
  passes `null` for both return MAGIs outside split years and `planMet` skips the per-return test on `null`.
- The trial-record and apply sites compute `[mA, mB] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA,
  inhRealB)` only when `twoReturns && yearPlan.ret !== 'H'`; otherwise they pass `0, 0` (H ignores them). No array is allocated
  otherwise. The row-label site reads `magiHistoryA[year]` / `magiHistoryB[year]`, which are written at about 1600 before the
  row and only `if (twoReturns)`. That is safe: an A / B plan exists only in a two-return year. The `'H'` path passes `0, 0`, so
  the single-return label is byte-identical (Fable review M5).
- Existing fixtures that pin the plan or line shape are updated in this task: `tests/cliff_plan.js:382` (the `yearPlanCandidates`
  hook's `deepStrictEqual` on the plan objects, which gain `own`) and the hand-built line fixtures in `tests/cliff_plan.js` and `tests/solver_hooks.js` gain `own`.

- [ ] **Step 1: Failing tests** (`plan-met.test.js`, counted). Hand literals:
  - `planMet(H under, magi 60000, realized 60001, 0, 0)` is true; at realized 60001.5 it is false.
  - A under, `magi` 80000, `own` 40000: realized 79000, `magiA` 41000 -> false (household met, return over). `magiA` 40001 -> true.
  - B fill, `own` 20000: `magiB` 19998 -> false; `magiB` 19999 -> true.
  - `magiThresholds` on a two-return year (an existing two-return fixture in `tests/unit/us/`): every A / B line has
    `own` equal to the untranslated line (ACA 400% of the return's FPL; the IRMAA edge through `magiForIrmaaLine`), and H lines
    have `own === magi`.
- [ ] **Step 2:** Run it: fails (`planMet` not exported).
- [ ] **Step 3:** Implement. One predicate at all three sites, the same in choose and apply.
- [ ] **Step 4:** `npx vitest run tests/unit/us/plan-met.test.js` and shuffled; `npm run test:unit`; `npm run build && node
  tests/cliff_plan.js && node tests/solver_hooks.js`; `node tests/golden.js`; `node tests/survivor_symmetry.js`. Then `node tests/snapshot.js --dump <scratch>/t2`. Movers: under (a) only guard-on
  two-return scenarios (list them with the age and line that failed per return); under (b) none. Any other mover stops the task.
- [ ] **Step 5: Commit** `Batch 5 4d: met judges a per-return intent on its own return (R1)`, listing the movers in the body.

### Task 3 [Opus]: the split draw

**Files:** Modify `src/us/core/withdrawals/draws.js` (`newWithdrawal`, `takeTraditional`, new `solveSplitForNet`),
`src/us/core/accounts/penalty-status.js` (comment only: `onlyPartner` is set by the split draw). Test:
`tests/unit/us/split-draw.test.js` (new).

**Interfaces:**
- `newWithdrawal` gains, right after `orderable: false`: `splitFirst: -1` and `splittable: false`. These are the only shape
  changes; the realized-share arithmetic uses locals, not fields.
- `takeTraditional(wd, bucket, amount, solver, penalized, uncapped)`: first line `if (wd.splitFirst >= 0 && !penalized) return
  takeTraditionalSplit(wd, bucket, amount, solver === solveTraditionalForNetFromNeed, uncapped);` and the rest stays.
- `function takeTraditionalSplit(wd, bucket, amount, fromNeed, uncapped)` -> the net raised. For `p` of `[first, 1 - first]`
  while `amount` is left: set `wd.onlyPartner = p`, then `tradGroup(wd, false)` and the cap (with `magiCapLeft` unless `uncapped`).
  Then `attrA = profile.ownerShareA * wd.traditionalGross` and `solveSplitForNet(...)`. The ledger draw, `bal`, `traditionalGross`,
  `traditionalWithdrawn` and `cappableTraditional` (unless `uncapped`) are updated as in `takeTraditional`. Set
  `profile.ownerShareA = (attrA + (p === 0 ? fromTrad : 0)) / wd.traditionalGross` when `traditionalGross > 0`. Last, set
  `wd.onlyPartner = -1`.
- `fillTraditional(wd, gross)`: with `wd.splitFirst >= 0`, it runs its bucket loop once per partner (`onlyPartner` = first, then
  the other) with the share updated after each piece by the same rule (D4); with -1 it is unchanged.
- `export function solveSplitForNet(ctx, traditionalBal, target, gain, gross, profile, attrA, partner, fromNeed)` -> `{ fromTrad,
  tradNet }`: the same 24-step bisection as `solveTraditionalForNet` (`fromNeed` false: from `[0, min(bal, 6t+1)]`) or
  `solveTraditionalForNetFromNeed` (`true`: from `[t, 6t+1]`), penalty 0. Before every `taxFor` it sets `profile.ownerShareA =
  (attrA + (partner === 0 ? x : 0)) / (gross + x)` for the probe `x`, and for the base tax at `x = 0` the share in force (when
  `gross` is 0 the base tax's share does not matter). It allocates nothing but its result.

- [ ] **Step 1:** Read `k401Fractions` (`src/us/core/income/year-stages.js:64`) and record D8's finding in the report.
- [ ] **Step 2: Failing tests** (`split-draw.test.js`, counted; withdrawals built as `order-draw.test.js` builds them, on a
  two-return profile, `ownerShareA0` 0.5, both partners 60):
  - A-first, A free 300,000, need 50,000: every dollar comes from slots 0-1 (slots 2-3 unchanged to the bit),
    `profile.ownerShareA === 1`, and `wd.onlyPartner === -1` after.
  - A-first, A free 20,000 (no bond reserve), need 50,000: A's dollars drop to within $0.01 of 0 (the ledger's `1 - cap/total`
    can differ in the last bit), the rest comes from B, the net raised is >= 50,000 - 1, and `ownerShareA === drawnA /
    wd.traditionalGross`, where `drawnA` is A's slot dollars before less after, read from the ledger.
  - A fill of 30,000 gross in an A-first pass with A free 300,000: B's slots unchanged, `ownerShareA === 1`.
  - B-first mirror: `ownerShareA === 0` when B covers it.
  - `splitFirst` -1: `takeTraditional` gives the same doubles as on the base (compare against `solveTraditionalForNet` called
    directly with the same arguments).
  - Under a MAGI cap of 10,000 room: the split draw stops at the room (`magiCapLeft` 0 after) on both partners together.
  - The probe share: a stub-free check that `solveSplitForNet` with `attrA` 0, `partner` 0, `gross` 0 equals
    `solveTraditionalForNet` priced on a profile copy with `ownerShareA` 1 (same doubles).
- [ ] **Step 3:** Run: fails. **Step 4:** Implement. **Step 5:** The suite alone and shuffled; `npm run test:unit`;
  `node tests/snapshot.js` unchanged from Task 2 (no caller sets `splitFirst` yet); `node tests/engine_purity.js`.
- [ ] **Step 6:** `node tests/bench_runs_interleaved.js --base <Task 2 build> --rounds 11` and `node tests/bench_solver.js --base
  <Task 2 build> --rounds 11`: within the gates (the shape change is the 4b `cappableGain` risk; report the default row).
- [ ] **Step 7: Commit** `Batch 5 4d: the split draw (one partner's traditional accounts first, realized share per probe)`.

### Task 4 [Opus]: the split stage in the phased year

**Files:** Modify `src/us/core/projection/run-projection.js` (phase state, pass start, conversion guard, withdrawal block,
convergence drift, phase-end block, the row, the result), `src/us/core/projection/engine-state.js` (D11),
`src/us/ui/install-test-hooks.js` (`__test_runPlanMode` returns `splitIntents`), `tests/helpers/plan-households.js`
(`SPLIT_H1`, `SPLIT_ML`, `SPLIT_CONV`). Test: `tests/unit/us/two-return-split.test.js` (new).

**Interfaces:**
- Consumes Task 3's `wd.splitFirst` / `wd.splittable` and Task 1's `natRec` / `phaseScore`.
- `runProjection` reads `splitLever = planMode === 'choose' && plan?.levers?.split === true` (written in the file's style) and
  `planSplits = planMode === 'apply' && plan && plan.splits != null ? plan.splits : null`. In choose with the lever, it records
  `splitIntents` (by A's age, `'A' | 'B'`), exposed non-enumerable as `result.splitIntents`, like `orderIntents`.
- Year-level phase state, beside 4c's: `yearSplit` (null | 0 | 1), `estShareA`, `splitRun` (0 none, 1 running A or the
  intent's partner, 2 running B), `splitNat` (`{ naturalRec, trials }` saved at the stage's start), `splitRecA` (choose: A's
  record while B runs).
- Every record (`natRec`, the trial record, the split records) gains `split` (yearSplit), `estShareA` and `shareA` (the realized
  `profile.ownerShareA` at the phase end). A split record also carries `trials`: its own candidates, built from its own lines.
- `orderNat` (4c) gains `canSplit`: the whole natural-pass predicate of item 3 (not only `wd.splittable`), saved when the order
  phase starts (Fable review M6). The order
  pass's `wd`, `flow` and `conversionAmount` are not the natural pass's.
- Row: `if (yearSplit !== null) row.drawSplit = yearSplit === 0 ? 'A' : 'B';`

**The state machine** (what the implementer cannot infer; the code is theirs):
1. **Pass start:** `profile.ownerShareA = yearSplit === null ? ownerShareA0 : estShareA` (D2). **Conversion:** add `&& yearSplit
   === null` to the `convertsThisYear` guard (D3). **Withdrawal block:** right after `wd.penaltyAware = hasPenalizedMoney(wd)`
   (I7), when `splitLever || planSplits !== null`, set `wd.splittable = twoReturns && conversionAmount === 0 && freeOf(0) > 0 &&
   freeOf(1) > 0` (`freeOf(p)`: `tradGroup(wd, false).share` with `onlyPartner = p`, reset to -1, times traditional plus
   bond-traditional). Then, in a split pass only, `wd.splitFirst = yearSplit` and `profile.ownerShareA = ownerShareA0` (D1), before
   `runWithdraw`.
2. **Convergence:** in a split phase, add `Math.abs(realizedTrad * profile.ownerShareA - estTrad * estShareA)` to the drift. On
   an unconverged pass, `estShareA += w * (profile.ownerShareA - estShareA)`. `estShareA` joins the `passLog` entry, the forced
   pass's pick and the `seHeld` seeding (D2, C3).
3. **Eligibility at a natural end.** `canSplit = twoReturns && conversionAmount === 0 && flow < 0 && wd.traditionalWithdrawn - rmd
   > 0 && wd.splittable && (splitLever || (planSplits !== null && planSplits[age] != null))`. It is evaluated at the end of the
   natural pass (saved in `orderNat.canSplit` when the order phase starts) and, for a kept order phase, at its end. In apply,
   an intent year with `!canSplit` counts `splitSkipped++` and goes on as today; `splitYears++` for every intent year.
4. **Starting the stage** (both modes; C1, C2, I4). This happens at the end of the phase the split starts from: the natural pass
   when no order phase starts, the kept order phase, or, after a rejected order, the restored natural record with
   `orderNat.canSplit`.
   - If `canSplit`, build the natural record with `natRec` whatever the lines (choose: its score from `lambdaOf()` and its cliff
     cost from `healthcareRet + irmaaAt(...)`, as an order year does; apply: no score), and save `splitNat = { naturalRec, trials:
     <that phase's trials, choose only> }`.
   - Skip today's apply intent lookup and its counters at this end. They run once, at the split phase's end.
   - Start the split phase (choose: A; apply: the intent's partner), seeded as a trial is (from `naturalRec`), with `yearOrder =
     naturalRec.order`, `estShareA` 1 or 0, `yearSplit` set, `splitRun` 1.
   - After a rejected order, choose starts the split here, before the natural year's trials or replay. Those then come from the
     split stage's outcome.
5. **A split phase's end.** Build its record (`natRec` plus `split`, `estShareA`, `shareA`). Under R2 (a), build its lines with
   today's `magiThresholds` call and its own `lo` / `hi` / `natOf`. In choose, compute its `trials = yearPlanCandidates(...)` with
   this pass's `costAt` / `irmaaAt`, plus its score and `ok` (D7). In apply, run today's intent lookup and counters over its
   lines.
   - choose after A: keep A's record in `splitRecA` and start B (same seeding, `estShareA` 0).
   - choose after B: pick by D7. If the natural record wins, restore `splitNat` as 4c restores `orderNat`: its trials, or a replay
     of its final pass. If a split wins: `naturalRec =` its record and `splitIntents[age] = 'A' | 'B'`. Then run its trials. When
     it has none and it is not B (the last phase run), replay its final pass, with `yearSplit`, every estimate and `estShareA`
     taken from the record.
   - apply keeps its phase always (`splitApplied++`), then runs the intent's trial if one is eligible.
   - Under R2 (b), a split phase builds no lines, and a cliff intent at a split age counts `skippedIneligible`.
6. **Trials and replays** carry `yearSplit` from the record they start from (`naturalRec.split`). A replay (choose's non-last
   winner, apply's fallback, the restore after a rejected order) takes the record's `estShareA`, so it repeats the same pass. A
   trial, or the next split phase, is seeded with `estShareA = record.shareA` (Fable review I6). Every `continue` back to the pass loop sets them; every phase start that is not a split sets `yearSplit
   = naturalRec.split` (null outside a kept split).
7. **The estate's end-tax profile** (Fable review I1): `endTax = { profile: { ...profile, ownerShareA: ownerShareA0 }, ... }`.
   A last-year split must not tax the whole traditional estate on one partner's return; this is byte-identical outside split
   years, because today the share at the row is always `ownerShareA0`. Pinned on `SPLIT_H1`: `result.estate.profile.ownerShareA
   === ownerShareA0` of the last year.
8. **Lines in a split phase** (R2 (a)): the `magiThresholds` call's `preMagiA` / `preMagiB` are the pass start's (at
   `estShareA`), while `shareA` is the realized share. The two are equal when the pass converged; a forced pass places its lines
   with a mixed share (recorded, not corrected). In a cascade year the lines are translated at the average share while a cap
   removes the second partner's dollars one for one, so a stay-under over-shoots. That is safe: `met` judges the return (R1) and
   the score decides. Recorded as a known approximation (Fable review M1, M2).
9. **The next year's seed** reads `naturalRec`, so a kept split seeds it (4c A3). Trace only: `planTr.split = { natScore, scoreA,
   scoreB, okA, okB, kept }` (choose) or `{ kept }` (apply), and `planTr.shareA` (the kept phase's realized share).

- [ ] **Step 1: Households** (`tests/helpers/plan-households.js`):
  - `SPLIT_H1`, the brief's case: a couple filing single (`filingStatus: 'single'`, two returns), both 60 and retired, B's
    pension 90,000 a year from 60 (A none), 1,000,000 in each partner's traditional 401(k), taxable 0, cash 0, spending 120,000,
    conversions off, guard on, `withdrawalMixEnabled: true`, TX.
  - `SPLIT_ML`: `SPLIT_H1` with `marryLater` and A's marriage age 63.
  - `SPLIT_CONV`: `SPLIT_H1` with conversions on at 60-61.
- [ ] **Step 2: Timing probe (D13).** Before any pin: median of 9 `computeCliffPlan` on `SPLIT_H1` at life 100 in a Vitest
  world, and the in-page planning (the 4c method, `plangate4c.cjs` from the 4c scratchpad rewritten to the new household). Over
  150 ms in the page: apply D13 and record it.
- [ ] **Step 3: Failing tests** (`two-return-split.test.js`, counted):
  - `SPLIT_H1`, choose with the lever: `splitIntents[60] === 'A'`. Row 0 has `drawSplit === 'A'` and `magiB === 90000` (B's
    pension only: no gains, no investment income, no traditional on B's return). `planTr.shareA === 1` at 60.
  - `SPLIT_H1` at 60 under ACA (`acaEnabled: true`): a two-return year whose lines exist. Pin the state machine only: both
    phases ran (`planTr.split` with `scoreA` and `scoreB` numbers), the split phases' lines are non-empty, and whatever the year
    keeps is replayed by `apply`. Do not pin `kept`. Fable review I3: A-first moves about $3.5k of premium onto A's subsidized
    return against about $2.4k of tax saved, so pro rata may win. Record the engine's `kept` with a one-line hand cross-check in
    the report. Together with the plain `SPLIT_H1` (no lines at 60) this covers C1's lines and no-lines paths.
  - Survivor symmetry with the toggle on (I6): `SPLIT_H1` with identical partners (no pension, equal 401(k)s), filing single,
    survivor modeling on. The A-dies rows equal the B-dies rows (`tests/survivor_symmetry.js`'s comparison, ported into the suite).
    No split is kept before the death.
  - Order rejected, then split (C2): a toggle-on two-return household with taxable money where `choose` tries an order phase,
    rejects it and keeps a split at the same age. Find it by a short search. If none exists, pin the state machine with a trace
    check on any year where `planTr.order.kept === false` and `planTr.split` exists.
  - `SPLIT_CONV`: no `splitIntents` key at 60 or 61, and no `drawSplit` on the rows where `conversionAmount > 0`.
  - `SPLIT_ML`: no split at 63 or later (joint returns); the years 60-62 may split.
  - `SPLIT_H1` with `filingStatus: 'mfj'`: `splitIntents` is `{}`, and no row has `drawSplit`.
  - `SPLIT_H1` with the lever off: the `choose` run with no levers equals the `choose` run with `levers: { order: false, split:
    false }` row for row (`toStrictEqual`, one world). It is not compared with `off`: `SPLIT_H1` has IRMAA lines from 63, so
    `choose` can keep a stay-under (Fable review I4).
  - Replay: `apply` of a plan built from the choose run's `cliffIntents`, `orderIntents` and `splitIntents` reproduces the choose
    rows on every field (`toStrictEqual`) on `SPLIT_H1`, `SPLIT_ML`, `SPLIT_H1` with ACA, and (R2 (a)) one two-return household
    with a kept stay-under in a split year. Find it by a short search over the `plan-households` two-return cases and the scan
    grid's two-return rows. If none exists, say so in the report and pin the apply path with a hand-built plan carrying a split
    and an under intent at one age; do not invent a choose pin.
  - Review Focus 1: `SPLIT_H1` with B at 55 (no Rule of 55): no split at A's ages where B is under 59.5.
  - Review Focus 5: an `apply` of `{ splits: { 60: 'A' } }` on `SPLIT_H1` with A's 401(k) at 0 counts `splitSkipped === 1`, and
    the rows equal the plan without the split.
  - Counters: on `SPLIT_H1` apply, `splitYears === splitApplied + splitSkipped`.
- [ ] **Step 4:** Run: fails. **Step 5:** Implement. **Step 6:** The suite alone and shuffled; the replay suites (`order-lever`,
  `cliff-plan*`, `se-settlement-plan`); `npm run test:unit`; `node tests/golden.js`; `node tests/survivor_symmetry.js`;
  `node tests/engine_purity.js`; `node tests/snapshot.js --dump <scratch>/t4`. New movers past Task 2's must be toggle-on
  two-return scenarios only (none yet unless the lever is on: `computeCliffPlan` still passes `ORDER_LEVERS` until Task 5, so
  expect none).
- [ ] **Step 7:** `bench_runs_interleaved.js` against the Task 3 build (+5%).
- [ ] **Step 8: Commit** `Batch 5 4d: the split stage (choose and apply), drawSplit, estShareA`.

### Task 5 [Opus]: the keep rule, the toggle's levers, Optimize, the summary

**Files:** Modify `src/us/core/cliff-plan/plan-shape.js` (`PLAN_LEVERS` replaces `ORDER_LEVERS`), `src/us/core/projection/
run-projection.js` (`computeCliffPlan`: `lev`, `measure`, `select`'s stage 1, `stage2`, the plan, the report),
`src/us/core/optimizer/plan-search.js` (default `PLAN_LEVERS`), `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`),
`tests/engine-purity.json` (rename the constant), the tests that import `ORDER_LEVERS` (`order-lever`, `plan-search`,
`plan-shape`). Test: `two-return-split.test.js` (extended).

**Interfaces:**
- `measure(family, intents, sim, orders = null, splits = null)` -> today's fields plus `splits` and `n` counting splits. Candidate
  report rows with the lever gain `splits` (a count).
- Stage 1: the lever `choose` returns `orderIntents` and `splitIntents`. It adds candidates when either is non-empty, and every
  stage-1 `apply` plan carries both. Stage 2 (D9): `stage2.ords` / `stage2.splits`; the extra try `{ ...top, splits: null }` when
  the top has splits. The final plan: `makePlan({ ..., splits: best.splits })`. `report.keptSplits` = a count (lever only).
- `cliffPlanSummary`: after the order clause, `'draw Partner A's traditional accounts first at 60-62'` (and B's), runs of
  consecutive ages per partner; "no steering" only with no intents, orders or splits.

- [ ] **Step 1: Failing tests:** `computeCliffPlan` on `SPLIT_H1` (toggle on) keeps `plan.splits[60] === 'A'` and `plan.levers`
  `toStrictEqual({ order: true, split: true })`. Toggle off: `plan.splits === null`, `plan.levers === null`, and
  `computeCliffPlan` with `levers: { order: false, split: false }` gives a plan `toStrictEqual` to the call with no `levers` option
  (both in one world). The Optimize winner on `SPLIT_H1` (toggle off) carries the split, and wrapped as a stored plan it passes
  `isValidStoredPlan` (I1: `orders` null, not `{}`). The stage-2 no-splits candidate
  appears in `report.candidates` when the top holds splits. The summary on a hand-built plan `{ splits: { 60: 'A', 61: 'A', 63:
  'B' } }`: `'Cliff plan: draw Partner A's traditional accounts first at 60-61; draw Partner B's traditional accounts first at
  63.'`.
- [ ] **Step 2:** Run: fails. **Step 3:** Implement; `npm run analyze`. **Step 4:** The suites alone and shuffled;
  `npm run test:unit`; `node tests/golden.js` (check 4: toggle on not earlier, not lower than toggle off, holds);
  `node tests/survivor_symmetry.js`; `node tests/snapshot.js --dump <scratch>/t5`. New movers past Task 2's: toggle-on
  two-return scenarios only. List them; any other stops the task.
- [ ] **Step 5: Commit** `Batch 5 4d: the split lever in the plan (keep rule, PLAN_LEVERS, Optimize, summary)`.

### Task 6 [Sonnet]: UI, guard cases, benches, docs and the badge

**Files:** `test_live_withdrawal_mix.js` (a toggle check on `SPLIT_H1`), `tests/legacy_state.js`, `tests/bench_solver.js`,
the planning gate script (copy `plangate4c.cjs` into the 4d scratchpad as `plangate4d.cjs` and add the household), the
toggle's label and info tip in `src/us/index.html` (from the code), the badge `V142` -> `V143`, `README.md`, `test-inventory.md`
(the new suites), `CLAUDE.md` (the MAGI invariant line names `estShareA`). The engine prose is not this task's (Opus review M8):
Task 4's implementer writes `engine.md` (`estShareA`, the realized share, `drawSplit`), `magi-iteration.md` (the new estimate)
and `us-accounts.md` (per-partner shares: the split); Task 5's writes `cliff-plan.md` ("The split stage", "The split lever's keep
rule"), each in its own commit.

- [ ] **Step 1:** `test_live_withdrawal_mix.js`: load `SPLIT_H1`, toggle on, `__test_flushRender()`. `window.fireProjectionRows[0]
  .drawSplit === 'A'`; toggle off: no row has `drawSplit` (CLAUDE.md checklist item 4). Mobile 390x844: no horizontal scroll.
- [ ] **Step 2:** `tests/legacy_state.js`: `'stored plan: 4d splits'` (`splits: { 60: 'A', 61: 'B' }`, `levers: { order:
  true, split: true }`, orders null, orderPhases null) round-trips unchanged; `'stored plan: bad split'` (`splits: { 60: 'C' }`)
  drops to null. `isValidStoredPlan` already validates `splits` (`plan-shape.js`): write no validator, only the cases (Fable
  review M7). The baseline hash is regenerated for the two new cases only (name them in the commit).
- [ ] **Step 3:** `tests/bench_solver.js` row `'two-return split (TX), toggle on': SPLIT_H1 at life 100`; add the household to
  the planning gate script. `tests/bench_runs_interleaved.js` gains `--household split`: `SPLIT_H1` with the toggle on and its
  plan applied, so the `apply` cost of split years on the historical paths is timed (Fable review I5).
- [ ] **Step 4:** Tip copy, from the code: the toggle turns on two plan levers: the stock-account order, and, in years with two
  separate returns and no conversion, whose traditional accounts to draw first. Each is kept only when the whole plan lasts as
  long and ends better on the plan's own assumptions. README feature list; the architecture files above; badge V143.
- [ ] **Step 5:** `npm run build`; `node test_live_withdrawal_mix.js`; `node tests/legacy_state.js`; `node tests/doc_paths.js`;
  `npm run test:unit`. **Commit** `Batch 5 4d: toggle copy, guard cases, benches, docs, US V143`.

### Task 7 [Opus]: movers, gates, scan, gap and the step 4 notes

**Files:** `docs/next-batches-plan.md` ("Batch 5 step 4d" notes; the Batch 5 header's status line), `tests/snapshots/*.json`
(after the owner's OK), `tests/solver_scan.js` (report households and years keeping a split with `--order`; a count only).

- [ ] **Step 1: Movers.** `node tests/snapshot.js --dump <scratch>/t7`; classify every US mover: (i) R1's guard (guard-on
  two-return, toggle off or on), (ii) a kept split (toggle-on two-return), (iii) the toggle-on stage-2 candidate set changed with
  no split kept, (iv) other. Hard gate: no standard scenario depletes or first draws on the house earlier.
  `node tests/hist_depletion_cause.js`: historical movers by cause; a bridge drain stops for the owner. Canada passes.
  **STOP: send the owner the movers table and wait for the OK before `npm run snapshot:update`.**
- [ ] **Step 2:** After the OK: `npm run snapshot:update`, `npm test` green, `npm run test:ui` green.
- [ ] **Step 3: Timing** (quiet machine, one bench at a time, `--rounds 21`, against a built `8f406f4`):
  `bench_runs_interleaved.js` (+5% per path; `--household split` reported as information, since the base has no split),
  `bench_solver.js` (+30% on the existing rows; the new row reported), the planning
  gate (150 ms; the new household toggle on and off, plus the six gap households), and Optimize on the three gap households and
  `SPLIT_H1` (10 s target).
- [ ] **Step 4:** `node tests/solver_scan.js --order` (exit 0; the three OK lines). Report the toggle-on vs toggle-off table as 4c
  did, plus the households and years keeping a split. `node tests/solver_gap.js --objective endValue --lengths 75,default` (auto,
  `--shipped optimized`, `--toggle on`). `node tests/plan_mult_table.js` (spec 9's table, lever separated from the multiplier if
  the script allows; otherwise say so).
- [ ] **Step 5: Notes** ("Batch 5 step 4d (US V143)", 4c's layout; also correct the 4b note's "two-return years exist only with
  `marryLater`": a couple filing single has them too): what it does; R1, R2 and D1-D13; rulings during the build; the
  movers table; timings; scan; gap; lambda table; follow-ups (D12's, D8's finding, anything new). **Step 4 summary for step
  5:** the gap left to `optimizeMultiLever` per gap household and length; what step 5 retires; the 30-year cap question; the
  MFJ 62 IRMAA tier-1 fill (+5.6% real), still missed, with the three ways to reach it (A15 (a) relaxed, a fill-to-just-under-a-
  cliff candidate, the bracket).
- [ ] **Step 6: Commit** `Batch 5 4d: notes, snapshots (owner OK), scan and gap figures`. Copy the SDD ledger and the
  measurement logs to the side-session notes folder.
