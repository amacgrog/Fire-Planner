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

## Owner rulings needed before Task 1

- **R1: the per-return `met` guard (the 4b Fable finding).** In a two-return year a stay-under or fill on Partner A's or B's
  line is placed in household MAGI through the traditional share (`toHousehold`), while gains split half and half
  (`returnMagis`). With `shareA < 0.5` return A can end over its own line by `G * (1/2 - shareA)` while `met` passes. A split
  moves the share to 1 or 0, so in split years the error is the rule, not the exception. Fix: `met` also requires the intent's
  own return MAGI on its side of the return's own line (Task 2). `choose` and `apply` must share the test, or the replay breaks.
  - **(a) recommended: everywhere.** A correctness guard on a known mis-met. Limiting it to split years would make the same trial
    met or not depending on the toggle. Cost: guard-on two-return scenarios with the toggle off can move (a trial now rejected).
    They are listed under their own cause before `snapshot:update`. This amends spec section 3's "only toggle-on two-return
    scenarios move".
  - **(b): only in split years** (`yearSplit !== null`): no toggle-off mover; the pre-existing mis-met stays, recorded.
- **Go-ahead and execution method** (subagent-driven recommended, as 4a-4c).

## Spec amendments and builder's calls (for the owner to check)

- **D1, the realized share (spec 8 generalised).** The spec's `fromFirst / (fromFirst + probe)` assumes the year's traditional
  income is only the split draw. The plan uses the general form, which reduces to the spec's when nothing else is in
  `traditionalGross`: at each split draw's start, the A-attributed dollars already in `traditionalGross` are
  `profile.ownerShareA * traditionalGross` (`attrA`). Each probe sets `ownerShareA = (attrA + (partner === 0 ? probe : 0)) /
  (traditionalGross + probe)`, and the realized value is set after the draw. Traditional dollars that do not go through a split
  draw follow the share in force when they are added: Roth earnings, a fill (`fillTraditional`) and penalized draws. At the
  withdrawal's start the share is `ownerShareA0`, so dollars added before any split draw are pro rata, as today.
- **D2, a new estimate: `estShareA` (spec silent; needed for correctness).** The pass prices ACA and the conversion ceiling per
  return before it draws (`returnMagis` at the pass start). With the pass-start reset to `ownerShareA0`, a split pass would charge
  each return's premium on the pro-rata share, and the year would converge with a mispriced premium. So in a split phase the pass
  starts with `profile.ownerShareA = estShareA`, and the share is set back to `ownerShareA0` at the withdrawal's start (D1).
  `estShareA` converges like `estTrad`: drift `|realizedTrad * shareEnd - estTrad * estShareA|`, the same damping, the same
  `MAGI_ITER_MAX`. Seed: 1 for A-first, 0 for B-first. A trial from a kept split phase is seeded with the phase's realized share.
  Outside split phases nothing changes (the pass start still resets to `ownerShareA0`).
- **D3, no conversion in a split phase.** The split runs only where the natural pass converted nothing. A split pass's per-return
  ceiling could still size a conversion, so `conversionAmount` is held at 0 in split phases, as a stay-under holds it.
- **D4, which draws split.** Every penalty-free `takeTraditional` call in a split pass takes the first partner's free accounts
  first, then the other's: the stock step, a mix share, the fallthrough, the release and the bond reserve's uncapped draw. Fills
  and penalized draws stay pro rata (D1 attributes them). Taxable is a joint pool and is not split (spec 8).
- **D5, eligibility (`splittable`).** All of these: a two-return year (`twoReturns`); the natural pass converted nothing; a draw
  year (`flow < 0`); the natural pass drew traditional income (`realizedTrad > 0`); and at the withdrawal's start both partners'
  penalty-free accounts hold traditional money (`wd.splittable`, written in the withdrawal block only when the lever or a split
  intent can read it). A joint return, a survivor year and a single person are never two-return years, so never split. `apply`
  with an intent at an age where the path's year is not splittable keeps the natural year and counts `planStats.splitSkipped`.
- **D6, the sequence.** natural -> order (4c) -> split -> cliff trials. The year's lines are built at the end of the
  natural-or-kept-order phase, as today, and saved. A split phase never rebuilds them, so `toHousehold` never sees a share of
  0 or 1 (spec 8). Each split phase's end records the trial candidates over the saved lines with its own `natOf` and closures, as
  4c's `orderNat` stores the natural trials. A kept split phase becomes the year's natural record. The trials start from it, it
  seeds the next year (4c A3) and its record carries `split` and the realized share.
- **D7, the year's choice (choose).** The split phase's `ok` is 4c A4's: it drew, `wd.need <= 1`, and `wd.homeDrawn <= natural +
  1`. The chain is the trials': `best = natural`; for A-first, then B-first, `if (ok && score > best.score + (best === natural ?
  1 : 0)) best = it`. `apply` keeps its one phase always (as the order).
- **D8, `k401DrawFracA/B`.** Spec 8 says recompute them from the accounts drawn. A split draws a partner's free accounts in the
  same proportions as the pro-rata draw does, so each filer's 401(k) fraction is unchanged. Task 3 Step 1 confirms this from
  `k401Fractions` and records it; if `k401Fractions` ignores penalty status, that is a pre-existing gap, recorded and not fixed.
- **D9, the keep rule (spec 8: one subset, with / without).** Stage 1 (4c) holds every order and every split of the lever
  `choose` run. A lever run that records splits but no orders now counts. Stage 2 at the kept bracket adds one candidate: the
  stage-2 top's family, intents and orders with `splits: null`, when the top holds splits. 4c's tries (order phases alone, no
  orders) keep the top's splits. `n` counts splits too, so a tie keeps fewer intents. A2 (`leverPlanStands`) is unchanged and
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
2. **The first partner's free money runs out mid-draw:** the draw cascades to the other partner, and the realized share is
   `attrA / traditionalGross` exactly. A's accounts end the draw empty; neither the cap nor the bisection goes short. Pinned in Task 3.
3. **A stay-under from a kept split phase** (ACA on two returns): the trial uses the saved lines, met is judged per return (R1),
   and `apply(choose's plan)` reproduces `choose` row for row. Pinned in Task 4.
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
the arguments it passes today: the settled form with `pairA, pairB`, the unsettled form without.

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
- The three call sites compute `[mA, mB] = returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB)` only when
  `twoReturns && yearPlan.ret !== 'H'`; otherwise they pass `0, 0` (H ignores them). No array is allocated otherwise.

- [ ] **Step 1: Failing tests** (`plan-met.test.js`, counted). Hand literals:
  - `planMet(H under, magi 60000, realized 60001, 0, 0)` is true; at realized 60001.5 it is false.
  - A under, `magi` 80000, `own` 40000: realized 79000, `magiA` 41000 -> false (household met, return over). `magiA` 40001 -> true.
  - B fill, `own` 20000: `magiB` 19998 -> false; `magiB` 19999 -> true.
  - `magiThresholds` on a two-return year (an existing two-return fixture in `tests/unit/us/`): every A / B line has
    `own` equal to the untranslated line (ACA 400% of the return's FPL; the IRMAA edge through `magiForIrmaaLine`), and H lines
    have `own === magi`.
- [ ] **Step 2:** Run it: fails (`planMet` not exported).
- [ ] **Step 3:** Implement. One predicate at all three sites, the same in choose and apply.
- [ ] **Step 4:** `npx vitest run tests/unit/us/plan-met.test.js` and shuffled; `npm run test:unit`; `node tests/golden.js`;
  `node tests/survivor_symmetry.js`. Then `node tests/snapshot.js --dump <scratch>/t2`. Movers: under (a) only guard-on
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
  - A-first, A free 20,000, need 50,000: A's slots end at 0, the rest comes from B, the net raised is >= 50,000 - 1, and
    `ownerShareA === 20000 / wd.traditionalGross` (a ratio of two values read from the run, not a hand literal).
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
- Year-level phase state, beside 4c's: `yearSplit` (null | 0 | 1), `estShareA`, `splitStage` (0 none, 1 running A or the
  intent's partner, 2 running B), `splitNat` (`{ naturalRec, trials }` saved at the stage's start), `splitRecs` (the A and B
  records), and `splitLines` / `splitLo` / `splitHi` (the saved lines).
- Every record (`natRec`, the trial record, the split records) gains `split` (yearSplit), `estShareA`, `shareA` (the realized
  `profile.ownerShareA` at the phase end) and `trials` (split records only: candidates over the saved lines).
- Row: `if (yearSplit !== null) row.drawSplit = yearSplit === 0 ? 'A' : 'B';`

**The state machine** (what the implementer cannot infer; the code is theirs):
1. Pass start: `profile.ownerShareA = yearSplit === null ? ownerShareA0 : estShareA` (D2). Conversion: add `&& yearSplit ===
   null` to the `convertsThisYear` guard (D3). Withdrawal block: `wd.splitFirst = yearSplit === null ? -1 : yearSplit`. When
   `splitLever || planSplits !== null`, set `wd.splittable = twoReturns && conversionAmount === 0 && freeOf(0) > 0 &&
   freeOf(1) > 0` (each partner's free group share times the traditional plus bond-traditional balance, through `tradGroup` with
   `onlyPartner` set and reset). In a split pass only, set `profile.ownerShareA = ownerShareA0` just before `runWithdraw` (D1).
2. Convergence: in a split phase, add `Math.abs(realizedTrad * profile.ownerShareA - estTrad * estShareA)` to the drift, and on
   an unconverged pass `estShareA += w * (profile.ownerShareA - estShareA)`.
3. The natural (or kept order) phase's end, in both modes, after today's block has built `lines` and the trials: if `twoReturns
   && conversionAmount === 0 && flow < 0 && realizedTrad > 0 && wd.splittable` and (`splitLever` or `planSplits[age]`), save
   `splitLines = lines`, `splitLo`, `splitHi`, and `splitNat = { naturalRec, trials }`. Then start the split phase (choose: A;
   apply: the intent's partner), seeded as a trial is, with `estShareA` 1 or 0 and `yearSplit` set. In apply with an intent at a
   year that is not splittable: `splitSkipped++` and carry on as today. `splitYears++` for every intent year. In apply, today's
   block must build `lines` in a year that has a split intent even without a cliff intent, so the saved lines exist when a cliff
   intent also exists. Build them when `intent || planSplits[age]`.
4. A split phase's end: build its record (`natRec` with `split`, `estShareA`, `shareA`), its score and `ok` (D7), and `trials =
   yearPlanCandidates({ thresholds: splitLines, ...natOf(), ... })` with this pass's `costAt` / `irmaaAt`, in choose (in apply:
   the intent's line among `splitLines`, through today's apply lookup). choose after A: start B. choose after B: pick by D7. If
   natural wins, restore `splitNat` exactly as 4c restores `orderNat`: trials or replay. If a split wins, `naturalRec =` its
   record, `splitIntents[age] = 'A' | 'B'`, then its trials, or, when it has none and is not the last phase run, a replay of its
   final pass (`yearSplit`, every estimate and `estShareA` from the record). apply keeps its phase always (`splitApplied++`).
5. Trials and replays carry `yearSplit` and `estShareA` from the record they start from (`naturalRec.split`, its `shareA` as
   the seed). Every `continue` back to the pass loop sets them.
6. The next year's seed reads `naturalRec` (so a kept split seeds it, 4c A3). `planTr.split = { natScore, scoreA, scoreB, okA,
   okB, kept }` (choose) or `{ kept }` (apply), trace only.

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
    pension only: no gains, no investment income, no traditional on B's return). The trace's `profile.ownerShareA === 1` at 60.
  - `SPLIT_CONV`: no `splitIntents` key at 60 or 61, and no `drawSplit` on the rows where `conversionAmount > 0`.
  - `SPLIT_ML`: no split at 63 or later (joint returns); the years 60-62 may split.
  - `SPLIT_H1` with `filingStatus: 'mfj'`: `splitIntents` is `{}`, and no row has `drawSplit`.
  - `SPLIT_H1` with the lever off (`levers: null`): rows equal the `off` run's on every field (no split stage runs).
  - Replay: `apply` of a plan built from the choose run's `cliffIntents`, `orderIntents` and `splitIntents` reproduces the choose
    rows on every field (`toStrictEqual`) on `SPLIT_H1`, `SPLIT_ML`, and one ACA two-return household with a kept stay-under in a
    split year. Find it by a short search over the `plan-households` two-return cases and the scan grid's two-return rows. If
    none exists, say so in the report; do not invent a pin.
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
  `toStrictEqual({ order: true, split: true })`. Toggle off: `plan.splits === null` and the plan is byte-identical to the Task 4
  build's (compare `JSON.stringify` of both runs in one world, the lever only differing). The stage-2 no-splits candidate
  appears in `report.candidates` when the top holds splits. The summary on a hand-built plan `{ splits: { 60: 'A', 61: 'A', 63:
  'B' } }`: `'Cliff plan: draw Partner A's traditional accounts first at 60-61; draw Partner B's traditional accounts first at
  63.'`. `optimizePlan` on `SPLIT_H1` toggle off: the winner's plan carries the split (Optimize runs the lever by default).
- [ ] **Step 2:** Run: fails. **Step 3:** Implement; `npm run analyze`. **Step 4:** The suites alone and shuffled;
  `npm run test:unit`; `node tests/golden.js` (check 4: toggle on not earlier, not lower than toggle off, holds);
  `node tests/survivor_symmetry.js`; `node tests/snapshot.js --dump <scratch>/t5`. New movers past Task 2's: toggle-on
  two-return scenarios only. List them; any other stops the task.
- [ ] **Step 5: Commit** `Batch 5 4d: the split lever in the plan (keep rule, PLAN_LEVERS, Optimize, summary)`.

### Task 6 [Sonnet]: UI, guard cases, benches, docs and the badge

**Files:** `test_live_withdrawal_mix.js` (a toggle check on `SPLIT_H1`), `tests/legacy_state.js`, `tests/bench_solver.js`,
the planning gate script (copy `plangate4c.cjs` into the 4d scratchpad as `plangate4d.cjs` and add the household), the
toggle's label and info tip in `src/us/index.html` (from the code), the badge `V142` -> `V143`, `README.md`,
`docs/architecture/cliff-plan.md` ("The split stage", "The split lever's keep rule"), `engine.md` (`estShareA`, the realized
share, `drawSplit`), `magi-iteration.md` (the new estimate), `us-accounts.md` (per-partner shares: the split), `test-inventory.md`
(the new suites), `CLAUDE.md` (the MAGI invariant line names `estShareA`).

- [ ] **Step 1:** `test_live_withdrawal_mix.js`: load `SPLIT_H1`, toggle on, `__test_flushRender()`. `window.fireProjectionRows[0]
  .drawSplit === 'A'`; toggle off: no row has `drawSplit` (CLAUDE.md checklist item 4). Mobile 390x844: no horizontal scroll.
- [ ] **Step 2:** `tests/legacy_state.js`: `'stored plan: 4d splits'` (`splits: { 60: 'A', 61: 'B' }`, `levers: { order:
  true, split: true }`, orders null, orderPhases null) round-trips unchanged; `'stored plan: bad split'` (`splits: { 60: 'C' }`)
  drops to null. The baseline hash is regenerated for the two new cases only (name them in the commit).
- [ ] **Step 3:** `tests/bench_solver.js` row `'two-return split (TX), toggle on': SPLIT_H1 at life 100`; add the household to
  the planning gate script.
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
  `bench_runs_interleaved.js` (+5% per path), `bench_solver.js` (+30% on the existing rows; the new row reported), the planning
  gate (150 ms; the new household toggle on and off, plus the six gap households), and Optimize on the three gap households and
  `SPLIT_H1` (10 s target).
- [ ] **Step 4:** `node tests/solver_scan.js --order` (exit 0; the three OK lines). Report the toggle-on vs toggle-off table as 4c
  did, plus the households and years keeping a split. `node tests/solver_gap.js --objective endValue --lengths 75,default` (auto,
  `--shipped optimized`, `--toggle on`). `node tests/plan_mult_table.js` (spec 9's table, lever separated from the multiplier if
  the script allows; otherwise say so).
- [ ] **Step 5: Notes** ("Batch 5 step 4d (US V143)", 4c's layout): what it does; R1 and D1-D13; rulings during the build; the
  movers table; timings; scan; gap; lambda table; follow-ups (D12's, D8's finding, anything new). **Step 4 summary for step
  5:** the gap left to `optimizeMultiLever` per gap household and length; what step 5 retires; the 30-year cap question; the
  MFJ 62 IRMAA tier-1 fill (+5.6% real), still missed, with the three ways to reach it (A15 (a) relaxed, a fill-to-just-under-a-
  cliff candidate, the bracket).
- [ ] **Step 6: Commit** `Batch 5 4d: notes, snapshots (owner OK), scan and gap figures`. Copy the SDD ledger and the
  measurement logs to the side-session notes folder.
