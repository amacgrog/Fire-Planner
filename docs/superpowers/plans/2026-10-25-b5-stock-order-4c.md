# Batch 5 step 4c: the stock-account order as a plan lever (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tax-aware withdrawal order becomes a plan intent (`orders[age] = 'traditional'`) chosen on the deterministic run,
kept only by the whole-run rule, and followed literally on every path; the per-path picker `pickLiveWithdrawalOrder`, its
`overage * 1e6` term and the dead `remainingMagiRoom` wiring are removed.

**Architecture:** The draw step reads one new per-pass field, `wd.taxAwareOrder` (already in `newWithdrawal`, never read until
now): `'traditional'` draws penalty-free traditional first, then taxable. `runProjection`'s phased year gains one phase between
the natural year and the cliff trials: in `choose` (only with `plan.levers.order`) the other order runs as its own converged
phase seeded from the natural year and is kept by the lambda score; in `apply` a year with an order intent runs the same
natural -> order sequence and keeps the order. `computeCliffPlan` adds a second keep stage (all order intents / each phase's /
none, combined with the kept cliff family) and records the kept phases in `orderPhases`. The live-mix toggle
(`withdrawalMixEnabled`) now only turns the order lever on in the automatic plan; Optimize uses the lever toggle on or off.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright (root `test_*.js`,
`tests/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (approved 2026-10-25): sections 4.1 (the plan shape and
who sets `levers`), 5 (shared lever rules, gates), 7 (4c), builder's calls 9 and 10. Acceptance tests: `docs/next-batches-plan.md`
"The three policies and their acceptance tests" (Batch 5) and the 3C notes "Section 13.3". Base `1db3371` (origin/main, PR #51,
US V141). Branch `claude/b5-4c-order-16b05a`.

**Owner rulings for 4b-4d (2026-10-25):** one Opus plan review per sub-step; Sonnet implementers for the mechanical tasks
(**[Sonnet]**), Opus for the engine tasks (**[Opus]**) and every review; 4c and 4d stay separate PRs; don't push or open a PR
until the owner asks.

## Spec amendments and builder's calls (for the owner)

Each line: what the plan does, and why. A1 and Q2 need the owner's answer before Task 1.

- **A1 (owner, recommended): with the toggle on, the natural year keeps smoothing.** Spec 7.1's precedence is explicit mix ->
  order intent -> (toggle on) taxable-first -> smoothing, which keeps today's "the live branch precedes smooth". The plan
  proposes explicit mix -> order intent -> smoothing (when `smoothWithdrawals`) -> taxable-first, so the toggle changes nothing
  in the draw code (only `computeCliffPlan` reads it). Why: with the spec's order a toggle-on household with smoothing on runs
  a different `off` baseline than toggle-off (taxable-first instead of smoothing), so "toggle on never depletes earlier than
  toggle off" is not protected even against `off`, and smoothing silently stops for those households. With A1 the `off` run is
  the same with the toggle on or off, the off memo stays valid, and the order phase compares traditional-first with what the
  household would do anyway. Alternative: the spec's text (the plan's Task 1 Step 3 changes one branch).
- **Q2 (owner): saved scenarios with the toggle on.** The field keeps its name and saved value; its meaning becomes "the order
  lever in the automatic plan". No structural migration is needed, so `normalizeState` gains no code for it; a
  `tests/legacy_state.js` case pins that a saved `withdrawalMixEnabled: true` loads as `true` (recommended). Alternative: load
  it as `false` (the user re-opts in to the new meaning; needs a saved-version marker the state does not have today).
- **A2 (risk, measured): Rule A protects against `off`, not against the toggle-off plan.** The lever's `choose` run picks its
  cliff intents with the order intents in place, so its families differ from the toggle-off plan's. The kept plan never
  depletes or first draws on the house earlier than `off` (by construction), but could against the toggle-off plan. The
  acceptance scan (Task 5) measures it; on any such household the build stops for the owner with fallback F1: add the
  lever-free selection's best (today's `select`) as a stage-1 candidate (about one more `choose` run and its subsets per bracket,
  toggle on only).
- **A3: the next year's seed.** Today the next year is seeded from the natural year (`naturalRec`), never from a kept cliff
  trial. With an order kept, the order phase *is* the year's natural record (the cliff trials start from it), so it seeds the
  next year; with the order rejected, the natural year does. Same in `choose` and `apply`.
- **A4: the order phase's `ok`** (spec silent): no unmet need (`wd.need <= 1`) and no more home equity drawn this year than the
  natural year (`wd.homeDrawn <= natural + 1`). The score alone counts home equity at face value, so it could prefer a phase that
  sells the house sooner.
- **A5: `levers` with the toggle on is `{ order: true, split: false }` in 4c** (spec 4.1 says `split: true`; there is no split
  lever until 4d, which flips it).
- **A6: eligibility.** A year is orderable when its natural pass reached the stock-account step with need left, taxable > 0 and
  penalty-free traditional > 0, and no explicit mix ran (`wd.orderable`, written by the draw step, read at the natural phase's end
  in both modes). An explicit mix year (override map or applied schedule) is never orderable: the explicit mix wins (spec 7.1).
- **A7: `apply` in a year that is not orderable on that path** (a historical path whose taxable is gone) keeps the natural year
  and counts `planStats.orderSkipped`.
- **A8: Optimize's default levers are `{ order: true, split: false }`** (decision 2(b): the lever runs in Optimize toggle on or
  off); candidate 0 stays the automatic plan.
- **A9: the toggle with the cliff plan off does nothing** (no plan, so no lever). Today's live mix ran without the guard. The
  info tip says so; Review Focus 1 pins it.
- **A11: the two-stage reading of spec 7.3** ("each combined with the kept cliff family"). Stage 1 keeps the cliff family with
  every order intent held. Stage 2 then tries the order subsets with that family. When stage 1 keeps `off` while cliff families
  exist, stage 2 also tries the best non-`off` stage-1 family without orders (Opus review I1). Without that run, a household whose
  orders hurt would lose the cliff steering the toggle-off plan keeps. Cost: up to 5 extra `apply` runs per bracket, not the
  spec's 4. Timing fallback, if the 150 ms gate fails: run stage 2 at the kept bracket only, after the bracket search (5 runs in
  all, not per bracket).
- **A12: an extra `off` run.** When `choose` records order intents but no cliff intents, the `off` run can no longer reuse the
  `choose` run. It counts inside A11's bound.
- **A13: bucket down years.** An order intent in a bucket down year whose cash and bond reserve cover the need never reaches the
  stock step. That year is not orderable and is skipped (A7). Spec 7.1 does not say this.
- **A14: spec 7.2's "as for cliff trials today" is factually off.** Today the next year is seeded from `naturalRec`, never from a
  kept cliff trial. A3 states the rule this plan follows.
- **A10: the scan grid.** `tests/solver_scan.js` has 864 households since 3a (768 plus the RI / PA conversions-on rows); the
  acceptance figures are reported on all 864 and on the 768 3C rows, for comparison with 3C's table.

## Global Constraints

- `CLAUDE.md` holds: engine functions take the context first and read only `ctx.*`; one context shape; a new module-level
  constant in an engine module is registered in `tests/engine-purity.json` (`"constant"`) in the same commit; hot paths
  allocate nothing a year does not need; MAGI-iteration rules (anything a phase mutates is restored at the pass start; a new
  per-phase variable joins the phase state); two-space indentation; never reformat a module you change.
- `npm run analyze` in every task that adds, renames or removes an export (the module-map check in `npm test` fails otherwise).
- Toggle-off planning is byte-identical: with `withdrawalMixEnabled: false`, no `levers` option and `mult` null, `select(null)`
  passes `null` and every plan keeps `levers: null, orders: null, orderPhases: null`. Every toggle-off engine snapshot must stay
  identical; only toggle-on scenarios may move (spec section 3).
- Vitest rules of `CLAUDE.md` "Where a new test goes" (exact comparisons, `world()`, counters, hand-computed literals, no
  `it.concurrent`); a new suite is run alone and with `--sequence.shuffle` before its commit.
- `npm test`'s snapshot step goes red on the toggle-on scenarios from Task 1 on, by design, until Task 6's `snapshot:update`
  (after the owner OKs the movers). `npm test` stops at that step, so each task runs the steps after it by hand (`npm run
  test:unit`, `node tests/golden.js` and the scripts named in the task). `test_live_withdrawal_mix.js` (test:ui) is red from Task
  1 (its hook is removed) until Task 4 rewrites it.
- A bug found in existing code is recorded in the task report and the Batch 5 notes, not fixed here.
- Never `git stash`; never touch other worktrees.

## Review Focus

1. **Toggle on, cliff plan off** (`cliffGuardEnabled: false`): rows must equal the toggle-off rows exactly (A9). Pinned in Task 4.
2. **Toggle on with an explicit mix** (`appliedMixSchedule` years, or the optimizer's override map): those years run the explicit
   mix and never get an order intent (A6). Pinned in Task 2.
3. **A historical or Monte Carlo path whose order year has no taxable or no penalty-free traditional left:** `apply` keeps the
   natural year, counts `orderSkipped`, and the path's rows equal a run of the same plan without that age's order (A7). Pinned in
   Task 2.
4. **Penalized money (before 59.5, no Rule of 55):** traditional-first draws penalty-free traditional only; penalized money stays
   after Roth / cash / bonds, as in the default order. Pinned in Task 1 (draw) and Task 4 (`tests/traditional_penalty.js`).
5. **Two-return years (`marryLater`) and survivor years:** an order phase in a two-return year starts from `ownerShareA0` like
   every phase; `apply(choose)` reproduces `choose` on such a household. Pinned in Task 2.

---

### Task 1 [Opus]: the draw step reads the order; the live picker and the MAGI-room wiring go

**Files:**
- Modify: `src/us/core/withdrawals/strategies.js` (`drawMixedStockAccounts`, `BUCKET_STEP.stocks`, `withdrawStandard`, the
  header comments), `src/us/core/withdrawals/mix.js` (remove `pickLiveWithdrawalOrder`, its comment block and the imports only it
  used; line 1 purpose becomes "US withdrawal-mix candidates and weights"), `src/us/core/withdrawals/draws.js` (remove
  `incomeRoom`; `newWithdrawal` gains `orderable: false` right after `taxAwareOrder: null`; the comment at line 19 drops "the live
  mix's"), `src/us/core/projection/run-projection.js` (`wopts` without `remainingMagiRoom`; the import of `incomeRoom`; the comment
  at 542-546 says the room bounds the conversion only; the comment at 1403 drops "the live mix's sale"),
  `src/shared/core/withdrawals/bucket-order.js` (comment: `opts` carries `age`), `src/shared/core/withdrawals/bond-ladder.js:63`
  (comment: "The order intent does not plan for it"), `src/us/ui/install-test-hooks.js` (remove `__test_pickLiveWithdrawalOrder`
  and `incomeRoom` from `__test_penalty`).
- Modify tests: `tests/unit/us/historical-parity.test.js` (the `[F5]` source check), `tests/penalty_status.js` (drop the
  `incomeRoom` check and its expected values), `tests/cliff_guard.js` (delete 5c and `UL`; `withdrawStandard(wd, { age: 60 })`),
  `tests/unit/us/gains-capped.test.js` (drop `remainingMagiRoom: Infinity` from the options), `tests/cliff_plan.js` T6.2a
  (`:384-395`). T6.2a pins the toggle-on `'std R rothConv+aca+live'` (kept `all`, under `aca400` at 62-65, the live draw
  cappable). Re-point it at the same household with the toggle off, which keeps the pinned shape. Re-check the pins against the
  run, and look the kept candidate up by the report's kept index (Task 3), not by `family`.
- Stale comments to fix: `src/us/core/withdrawals/roth-conversion.js:65`, `strategies.js:95, 185`, `mix.js:1`. All three
  imports in `mix.js` go.
- Create: `tests/unit/us/order-draw.test.js`.

**Interfaces:**
- Produces: `drawMixedStockAccounts(wd, { age, solver })` (internal); `withdrawStandard(wd, { age })`; bucket `opts` carries
  `{ yearReturn, bondTarget, refillCap, age }`; `wd.taxAwareOrder: null | 'traditional'` (set by the year body, Task 2) and
  `wd.orderable: boolean` (written by the draw step).

- [ ] **Step 1: Write the failing tests** in `tests/unit/us/order-draw.test.js`, built with `gains-capped.test.js`'s `setup()`
  pattern (Texas, single, 60, `PROFILE`, `newWithdrawal` through the world). Taxes: single 2026 standard deduction 16,100, so a
  traditional draw up to 16,100 nets its gross and a long-term gain inside it is taxed at 0%. **Exact values come from the
  bisection, not the round figure.** At zero tax, `drawTaxable` bisects on `[need, 3·need + 1]` and returns `hi = need +
  (2·need + 1) / 2**24` (`shared/core/withdrawals/draws.js:11-28`). So a taxable sale of a 5,000 need is `5000 + 10001 / 2**24`,
  its gain is half of that at a 0.5 gain ratio, and the leftover need is `-10001 / 2**24` (the taxable step does not clamp it).
  Before writing a literal, read the traditional solver's bracket the same way (`solveTraditionalForNet`, or `...FromNeed` for
  the bucket steps). Write each expected value as that formula in code order, e.g. `15000 * (200000 / 210000)`.
  `withdrawStandard` always calls `releaseMagiCap`, which sets `magiCap.off = true`, so assert that "no release ran" through the
  balances. A penalized case sets `wd.status` and `wd.penaltyAware` by hand, as gains-capped's penalty-aware case does: `mk()`
  builds `ALL_FREE`. Cases (the figures below are the round shapes; the asserted values are the exact formulas):
  - `'traditional-first draws penalty-free traditional, then taxable'`: `taxable 200,000 / basis 100,000`, `traditional 10,000`
    (A's IRA, penalty-free at 60), `need 15,000`, `wd.taxAwareOrder = 'traditional'`, `withdrawStandard(wd, { age: 60 })`:
    `traditionalWithdrawn 10,000`, `taxableWithdrawn 5,000`, `taxableGainGross 2,500`, `need 0`, `cappableTraditional 10,000`,
    `cappableGain 2,500`, `orderable true`.
  - `'taxable-first is unchanged with taxAwareOrder null'`: the same household and need: `taxableWithdrawn 15,000`,
    `traditionalWithdrawn 0`, `orderable true`.
  - `'an explicit mix wins over the order and is not orderable'`: state `appliedMixSchedule: { 60: 'taxable' }`,
    `taxAwareOrder 'traditional'`: `taxableWithdrawn 15,000`, `traditionalWithdrawn 0`, `orderable false`.
  - `'smoothing runs when no order is set (A1)'`: state `smoothWithdrawals: true, withdrawalMixEnabled: true`, `taxAwareOrder
    null`: the taxable share is `15,000 x 200,000 / 210,000` (the smoothing proportions), i.e. the toggle no longer skips
    smoothing; with `taxAwareOrder 'traditional'` the order wins over smoothing (traditional 10,000, taxable 5,000).
  - `'under a cap: traditional is capped at the room, taxable at the room left'`: `taxAwareOrder 'traditional'`, `magiCap {
    limit: 12,000, off: false }` (no ladder), `traditional 20,000`, `taxable 200,000 / basis 200,000` (no gain), need 30,000:
    `traditionalWithdrawn 12,000` (the room), `taxableWithdrawn 18,000` (its bisection value), `cappableGain 0`, and nothing
    drawn by the release (asserted through the balances).
  - `'penalized money stays last'`: A at 50, `traditional` all in an IRA (penalized), `taxable 5,000`, need 15,000, order
    `'traditional'`: `orderable false` (no penalty-free traditional), and the draw equals the `taxAwareOrder null` draw field for
    field (Review Focus 4).
  - `'bucket stocks step reads the order'`: `withdrawBucket(wd, { yearReturn: 0.05, bondTarget: 0, refillCap: Infinity, age: 60 })`
    with the first case's balances and `cash 0`: the same traditional / taxable split as the first case.
  - Counted with `makeCounter()`; `afterAll` asserts the total.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/order-draw.test.js` — expected FAIL (the order is not read; `orderable` is
  undefined).
- [ ] **Step 3: Implement.** In `drawMixedStockAccounts`: after the explicit-mix branch (which leaves `wd.orderable` false), set
  `wd.orderable = wd.need > 0 && bal.taxable > 0 && freeTrad > 0`; then `if (wd.taxAwareOrder === 'traditional' && wd.orderable)`
  (a pass with no penalty-free traditional or no taxable falls through to smoothing / the default, review I7)
  draw `takeTraditional(wd, 'traditional', wd.need, solver)` (clamped `Math.max(0, ...)` as the other branches) and then, if need
  is left, `takeStockTaxable(wd, wd.need)`; then the smoothing branch; else `return false`. Remove the `withdrawalMixEnabled`
  branch, the `'live'` marker and both `wd.mixCandidate !== 'live'` tests (the caller always runs `mixFallthrough` after a `true`;
  after the order branch it is a no-op unless a cap held money back, which is what `mixFallthrough` already handles). Rewrite the
  header comment's list (1. explicit mix, 2. the plan's order intent, 3. smoothing). (A1; if the owner keeps the spec's text,
  insert `else if (inputs.withdrawalMixEnabled) return false;` before smoothing and change the smoothing case's first assertion.)
  Remove `remainingMagiRoom` everywhere listed in Files; `npm run analyze`.
- [ ] **Step 4: Rewrite the `[F5]` source check** in `historical-parity.test.js` as `'[F5] US withdrawal options carry the age only;
  the live-mix room wiring is gone (source check)'`: `wopts` still matches the regex and its two objects contain `age` and not
  `remainingMagiRoom`; `src.includes('withdrawStandard(w, wopts)')`; `/withdrawBucket\)\(w, wopts\)/`; `!/remainingMagiRoom|incomeRoom|pickLiveWithdrawalOrder/.test(src)`; the legacy-guard check unchanged. Keep the counter total.
- [ ] **Step 5: Run** `npx vitest run tests/unit/us/order-draw.test.js tests/unit/us/historical-parity.test.js tests/unit/us/gains-capped.test.js tests/unit/us/mix-fallthrough.test.js`,
  then `npx vitest run --sequence.shuffle tests/unit/us/order-draw.test.js`, `npm run build`, `node tests/penalty_status.js`,
  `node tests/cliff_guard.js`, `node tests/engine_purity.js`, `node tests/closure_names.js` — all PASS. Toggle-off rows are
  unchanged: `npm run snapshot` (or `node tests/snapshot.js`) lists movers only among scenarios with `withdrawalMixEnabled: true`
  (record the list in the report; they now run the default or smoothing order until Task 2).
- [ ] **Step 6: Commit** `Batch 5 4c: the draw step reads the order intent; pickLiveWithdrawalOrder and the remainingMagiRoom wiring removed`.

### Task 2 [Opus]: the order phase in `choose` and `apply`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (the phased year), `src/us/core/projection/engine-state.js` (`planStats`
  gains `orderYears: 0, orderApplied: 0, orderSkipped: 0`, appended), `docs/architecture/engine.md` and
  `docs/architecture/cliff-plan.md` (the phase list).
- Create: `tests/unit/us/order-lever.test.js`. Modify: `tests/helpers/plan-households.js` (the households), and the
  `__test_runPlanMode` hook (`src/us/ui/install-test-hooks.js:187-205`) with its port in `tests/unit/helpers/us-plan.js:19-38`.
  Both return `orderIntents: sim.orderIntents || null` and `homeDrawAge: sim.homeDrawAge` beside `intents`.

**Interfaces:**
- Consumes: Task 1's `wd.taxAwareOrder`, `wd.orderable`.
- Produces: `runProjection` in `choose` with `plan.levers && plan.levers.order === true` records order intents and returns them as
  a non-enumerable `orderIntents` (`{ [age]: 'traditional' }`, beside `cliffIntents`; absent when the lever is off); in `apply` it
  follows `plan.orders` (absent / null / undefined key: no order); a row gains `drawOrder: 'traditional'` (set after the row
  literal, like `cliffChoice`) only in years whose kept pass ran the order; `planTrace` entries gain `order: { natScore, score,
  ok, kept }` (choose) or `order: { kept }` (apply) in years with an order phase.

- [ ] **Step 1: Write the failing tests** in `tests/unit/us/order-lever.test.js` (through `usPlan(w).runPlanMode`, plans built
  with `makePlan`). Before writing them, probe the scan grid (`scanHouseholds()`) for: **H1** a household whose `choose` with
  `levers: { order: true, split: false }` records order intents only (Task 3 pins that its kept plan keeps some; if it keeps none,
  Task 3 picks another and moves the pin); **H4** an order year with no lines in reach (Texas, no ACA, IRMAA out of reach; review
  C1); **H2** one with an order intent and a cliff intent in the same year; **H3** a `marryLater` two-return
  household with an order intent. Pin the patches (not the engine's figures) as `ORDER_H1`, `ORDER_H2`, `ORDER_H3` in
  `tests/helpers/plan-households.js` (CommonJS: Vitest loads it through `createRequire`, the Playwright scripts with `require`).
  Cases:
  - `'the lever off: choose with levers null or { order: false } is the 4b run row for row'`: rows of `choose` with `plan: null`,
    with `makePlan({ bracket, bracketFrom })` and with the same plus `levers: { order: false, split: false }` are equal
    (`toStrictEqual`), and no run has `orderIntents`.
  - `'choose with the lever that records nothing is off row for row'` on a grid household with no order and no cliff intent
    (pins the `off` reuse, review M3).
  - `'replay: apply of choose reproduces choose'` on H1, H2, H3 and H4 (H4 includes the next year after a kept order with no lines): `apply` with `makePlan({ ...held, intents: chosen.intents,
    family: 'all', orders: chosen.orderIntents })` gives equal rows, `depletedAge` and `homeDrawAge`; each run's trace shows an
    order phase (`t.order`) in at least one year (never vacuous); H2's combined year has both `t.order.kept` and `t.intent`.
  - `'an order year draws traditional first and is labelled'`: in an H1 order year, `row.drawOrder === 'traditional'` and the row's
    `traditionalWithdrawn` exceeds the `off` run's in that year; a year without an order has no `drawOrder` key.
  - `'apply on a path where the order year is not orderable keeps the natural year (Review Focus 3)'`: H1's plan applied on a
    bucket path (`rowFnFor({ type: 'real', start: 1966 })`) and on a standard run with one order age moved to an age after taxable
    is gone: `planStats.orderSkipped` rises by the expected count and the rows equal `apply` of the plan without that age.
  - `'an explicit mix year never gets an order intent (Review Focus 2)'`: H1 with `appliedMixSchedule` covering its first order
    age: `chosen.orderIntents` has no such age.
  - `'the choose order phase is kept only on a strict lambda-score win, with no unmet need and no extra home draw'`: from the trace,
    every kept order has `ok && score > natScore + 1`, every rejected one not. Also one hand-checked year (review M5): an H1 order
    year re-scored outside the engine. Take `afterTaxValue` of the two phases' end balances with the trace's lambda / tauGain,
    less the IRMAA from the row's MAGI, and assert it equals the trace's scores to the bit.
  - Counted; `afterAll` total.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/order-lever.test.js` — expected FAIL (`orderIntents` undefined).
- [ ] **Step 3: Implement the phase.** Per-year phase state (declared with `yearPlan`, `naturalRec`, ...; outside the MAGI
  restore): `yearOrder = null`, `orderRun = false`, `orderDone = false`, `orderNat = null` (choose: the natural year's
  `naturalRec`, `trials` and seed values, saved while its order phase runs). `planTr` is created once a year, at the natural
  phase's end, as today.
  Where the pass builds `wd` (`newWithdrawal`, line ~919) set `wd.taxAwareOrder = yearOrder`. Constants hoisted next to `phased`:
  `orderLever = planMode === 'choose' && plan !== null && plan.levers != null && plan.levers.order === true`, `orderIntents =
  orderLever ? {} : null`, `planOrders = planMode === 'apply' && plan !== null && plan.orders != null ? plan.orders : null`. The
  phase-end block (`if (phased && !replaying)`, `trialIdx < 0`, `flow < 0`), new order of work:

  Three rules on top of the block below (Opus review C1, I6):
  - **The record is unconditional in order years.** In `choose`, an order year always builds the natural `naturalRec` with its
    score, even with no lines in reach. Today's block builds it only when `lines.length`. When the order is kept, `naturalRec` is
    rebuilt from the order phase in both modes (`order: 'traditional'`), before and independent of the lines / trials part.
    Without this, a kept order year with no lines seeds the next year from the natural year in `choose` and from the order pass in
    `apply`.
  - **The order-end branch runs whenever `orderRun && !orderDone`,** outside the `flow < 0` test. The order pass's estimated tax
    can make its `flow` non-negative.
  - **`planTr` is created once, at the natural end.** Today's block assigns `planTr = { year }`; it must not be re-assigned when
    the block runs again after a kept order (it would wipe `planTr.order`).

  ```
  natural phase just ended (trialIdx < 0, !orderRun):
    hasOrder = planOrders && planOrders[age] === 'traditional'
    if hasOrder: planStats.orderYears++; if !wd.orderable: planStats.orderSkipped++
    tryOrder = wd.orderable && (orderLever || hasOrder)
    choose && tryOrder: run today's natural-done block in full (lines, trials, naturalRec with its score; lambdaOf() is called
        here even with no trials), add naturalRec.homeDrawn = wd.homeDrawn and naturalRec.order = null, and save
        orderNat = { naturalRec, trials }; do not start a trial yet
    tryOrder: orderRun = true; yearOrder = 'traditional'; start a phase seeded from the natural year exactly as a trial start
        seeds (estTrad = realizedTrad, estGain = taxableGainGross, the realized 162(l) and inherited pairs, seHeld false,
        seKind 0, forcedPass false, phaseUnresolved false, passLog cleared, phasePass -1); continue
    otherwise: today's natural-done block (naturalRec.order = null)
  order phase just ended (trialIdx < 0, orderRun, !orderDone):
    orderDone = true
    choose: score it as a cliff trial is scored (afterTaxValue - irmaaAt, + seSettle when settled);
            ok = wd.need <= 1 && wd.homeDrawn <= orderNat.naturalRec.homeDrawn + 1; keep = ok && score > orderNat.naturalRec.score + 1
            (A4); if keep: orderIntents[age] = 'traditional'
    apply:  keep = true; planStats.orderApplied++
    keep: today's natural-done block on the current state; the order phase is the year's natural record (naturalRec.order =
          'traditional'): its lines, its eligibility (natOf) and its trials
    not kept (choose only): yearOrder = null; naturalRec = orderNat.naturalRec; trials = orderNat.trials; if trials: start
          trial 0 (seeded from naturalRec as today); else replay naturalRec's final pass (yearOrder null, its estimates and
          flags, replaying = true); continue
  ```
  Every trial start, winner replay and `apply` fallback replay sets `yearOrder = rec.order` from the record it seeds from or
  replays (`naturalRec.order`, `best.order`; a trial record copies its natural record's `order`), so a cliff trial runs from the
  kept order (builder's call 9). The year end seeds the next year from `naturalRec` as today (A3). `lambdaOf()` is first called at
  the natural year's end in an order year (as today when there are trials), so the cliff trials score with the same lambda as
  without the lever. `row.drawOrder` and `planTr.order` as in Interfaces; `planTr.intent` unchanged. Comment the phase list
  above the loop (natural; order, choose with the lever or apply with an intent; trials).
- [ ] **Step 4: Run** `npx vitest run tests/unit/us/order-lever.test.js tests/unit/us/gains-capped.test.js tests/unit/us/plan-mult.test.js tests/unit/us/historical-parity.test.js`,
  the new suite with `--sequence.shuffle`, `npm run build`, `node tests/cliff_plan.js`, `node tests/cliff_guard.js`,
  `node tests/engine_purity.js` — PASS; `npm run test:unit` PASS.
- [ ] **Step 5: Commit** `Batch 5 4c: the order phase in choose and apply (replayed exactly; drawOrder row field)`.

### Task 3 [Opus]: the keep rule, the plan fields, the guard, Optimize and the summary

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/plan-shape.js`
  (`ORDER_LEVERS`, `orderPhasesOf`, `isValidStoredPlan`), `src/us/core/optimizer/plan-search.js` (`levers` option),
  `src/us/core/cliff-plan/planning.js` (`cliffPlanSummary`), `tests/engine-purity.json` (`ORDER_LEVERS: "constant"`),
  `docs/architecture/cliff-plan.md`.
- Modify tests: `tests/unit/us/plan-shape.test.js`, `tests/unit/us/guard-normalize.test.js`, `tests/unit/us/order-lever.test.js`
  (keep-rule cases), `tests/unit/us/plan-search.test.js` (one levers case).

**Interfaces:**
- Consumes: Task 2's `orderIntents`, `plan.orders`.
- Produces: `ORDER_LEVERS = Object.freeze({ order: true, split: false })` and `orderPhasesOf(ctx, orders) -> number[] | null`
  (sorted distinct `phaseOf(ctx, age)` of the keys; null for null or no keys) in `plan-shape.js`; `computeCliffPlan(ctx, { ...,
  levers = null })` — effective levers `lev = levers && levers.order ? levers : levers === null && inputs.withdrawalMixEnabled ?
  ORDER_LEVERS : null` (a levers option with the order off is no lever at all, so the plan stays byte-identical; review I5);
  `ORDER_LEVERS` carries a `// load-time:` comment like its neighbours, and the returned plan carries a copy
  (`{ ...lev }`), never the frozen object (it reaches `state.storedPlan` through Apply); the returned
  plan carries `levers` (that value), `orders` (the kept order intents or null) and `orderPhases`; only when `lev` is set (so a toggle-off report keeps its exact
  shape, review M2), the report's `candidates` gain `orders` (count) and `orderPhases`, and the report gains `keptOrderPhases`.
  The report always gains `keptIndex`, the kept candidate's index in `candidates`, because a family name no longer identifies one
  candidate (review M1). `cliffPlanSummary` and `tests/cliff_plan.js` look the kept candidate up by `keptIndex`; `optimizePlan(ctx, { objective, levers =
  ORDER_LEVERS })` passes `levers` to every search planning (candidate 0 stays `plan(inputs)`).

- [ ] **Step 1: Write the failing tests.** `plan-shape.test.js`: `orderPhasesOf` at tax year 2026, `ageA 60`: `{ 60, 61, 66 }` ->
  `[0, 1]`, `{ 75 }` -> `[2]`, `{}` and `null` -> `null`. `guard-normalize.test.js`: valid — `levers: { order: true, split: false }`
  with `orders: { 60: 'traditional' }, orderPhases: [0]`; and a V141 plan (`levers: null`, `orders: null`, `orderPhases: null`);
  dropped — `levers: { order: true }`, `{ split: false, order: true }` (key order), `{ order: 1, split: false }`, `orderPhases: []`,
  `[1, 0]`, `[0, 0]`, `[3]`, `orders` set with `orderPhases: null`, `orderPhases: [0]` with `orders: null`. The existing `'orders roth'` case gains
  `orderPhases: [0]`, so it is dropped only for its value (review M6). A keep-rule case for A11: a household where stage 1 keeps
  `off` and the cliff family without orders beats it (probe; pin). `order-lever.test.js`
  keep rule, on H1 with `withdrawalMixEnabled: true`:
  `computeCliffPlan(await w.ctx())`: the plan's `orders` keys are a subset of `choose`'s order intents at the kept bracket and
  `orderPhases` equals `orderPhasesOf(ctx, plan.orders)`; the kept plan's `apply` run depletes and first draws on the house no
  earlier than `off` at the kept bracket; `levers` is `ORDER_LEVERS`; and the same household toggle off returns a plan whose
  `levers`, `orders` and `orderPhases` are null and which equals `makePlan({ intents, family, bracket, bracketFrom })` of its own
  fields (`toStrictEqual`). A household where
  choose records order intents and the keep rule drops them all (probe the grid; pin it): `orders: null`, and a report candidate
  with `orders > 0` that lost. `cliffPlanSummary` with `orders: { 60..63, 66 }` and no cliff intents ->
  `'Cliff plan: draw traditional before taxable at 60-63, 66.'`; with cliff intents the order clause follows them (`'...; draw
  traditional before taxable at 60-63.'`). `plan-search.test.js`: `optimizePlan` with `levers: { order: false, split: false }` on
  the existing case equals today's result; with the default the winner is never worse than candidate 0 (Rule A) and its `apply`
  run equals the search's measure. Expected to move, because Optimize's default now carries the lever:
  - the existing `plan-search.test.js` cases (e.g. `:112-121`, every trial measure equal to base; `:125-152`);
  - `test_plan_optimizer.js`.

  Re-pinning rule: a case that pins the 4b search keeps it by passing `levers: { order: false, split: false }`. A case that pins
  a property (never worse than base, `apply` equals the measure) keeps the default. No pinned figure is copied from a new run
  without saying so in the commit.
- [ ] **Step 2: Run** them — expected FAIL.
- [ ] **Step 3: Implement.** In `select(bracket, held)`: `base = held || { bracket: from, bracketFrom: from }`; the `choose` plan is
  `held` unchanged when `!useMult && !lev`, else `makePlan({ ...base, mult: useMult, levers: lev })`. `ords = chosen.orderIntents`
  (`{}` when absent), `hasOrd`. `measure(family, intents, sim, orders = null)` returns also `orders`, `orderPhases`
  (`orderPhasesOf`) and `n` = cliff intents + order intents. `off`: reuse `chosen` only when `!fams.size && !hasOrd`. Stage 1
  (today's families): every candidate but `off` carries `orders: hasOrd ? ords : null` (the subsets' `apply` plans and `chosen`'s
  measure); when `!fams.size && hasOrd`, `chosen` is measured as `('none', {}, chosen, ords)`. Stage 2, only when `hasOrd`: with
  `F` / `I` the stage-1 best's family and intents, the candidates are, in this order, `F + all orders` (unless stage 1 measured
  it: it did for every family but `none` when `fams.size`, and for `none` when `!fams.size`), `F + each phase's orders alone` (only when `orderPhasesOf(ords)` has two or more phases), and `F + no
  orders` (skipped when `F` is `none`: that is `off`). When stage 1 kept `off` and `fams.size`, one more candidate follows: `G +
  no orders`, where `G` is the best non-`off` stage-1 candidate by `planCandidateBetter` (A11, review I1); each through `run('apply', makePlan({ ...base, intents: I, family: F,
  orders, orderPhases }))`; the running best (stage 1's) is replaced only on `planCandidateBetter` (so Rule A against `off` still
  holds by construction, and a tie keeps fewer intents). The final plan: `makePlan({ intents, family, bracket, bracketFrom: from,
  mult: useMult, levers: lev, orders: best.orders, orderPhases: best.orderPhases })`. The stored plan's guarded run is unchanged
  (`apply` reads its `orders`). `isValidStoredPlan`: `levers` null or exactly `['order', 'split']` booleans; `orderPhases` null or
  a non-empty strictly ascending array of 0 / 1 / 2; `(orders === null) === (orderPhases === null)`; update its comment.
  `cliffPlanSummary`: the order clause from `plan.orders` (runs of consecutive ages as for intents), after the cliff clauses;
  `'no steering'` only when both are empty. `optimizePlan`: the `levers` option. `npm run analyze`.
- [ ] **Step 4: Run** the four suites (plus `plan-search.test.js` re-pinned as above), `npm run test:unit`, `npm run build`, `node tests/cliff_plan.js`, `node tests/legacy_state.js`,
  `node tests/engine_purity.js` — PASS (legacy_state hashes unchanged: no default changed).
- [ ] **Step 5: Commit** `Batch 5 4c: the order keep rule (all / each phase / none), orderPhases, the stored-plan guard, Optimize's levers`.

### Task 4 [Sonnet]: the toggle's new meaning in the UI and the scripts that pinned the live mix

**Files:**
- Modify: `src/us/index.html:179` (label, `<small>`, info tip), `test_live_withdrawal_mix.js` (rewrite), `tests/golden.js`
  (checks 3 and 4), `tests/traditional_penalty.js` (cases 6 and 7), `tests/legacy_state.js` (+ `tests/snapshots/legacy_state.json`
  for the new cases only), `tests/historical_rates.js` (the `'early retiree, live mix (US)'` label -> `'early retiree, order lever
  (US)'`), `tests/snapshot_scenarios.js` (scenario names stay; comment that `mixLive` now means the order lever).

**Interfaces:**
- Consumes: Tasks 1-3 (`row.drawOrder`, the plan's `orders`, `__test_runPlanMode`, `__test_refreshCliffPlan`).

- [ ] **Step 1: The control.** Label "Tax-aware withdrawal order" (drop "(live)"); `<small>`: "The plan picks years to draw
  traditional before taxable" (under ~70 characters); `data-tip`: "The cliff plan chooses, on its own assumptions, the years to draw
  traditional money before taxable, and keeps that only if the whole plan lasts at least as long and ends better. It needs the
  cliff plan (on by default); the historical and Monte Carlo views follow the same years. Roth is still reached only once taxable
  and traditional together run short." (Wrap the label's last word and the button in `<span class="info-nw">`, as now.)
- [ ] **Step 2: `test_live_withdrawal_mix.js`** keeps its name; rewrite the header to the new meaning and the checks to: unchecked by
  default; on H1's patch (Task 2's pinned household) toggling on gives rows with `drawOrder === 'traditional'` in the plan's order
  years and none toggle off; toggling on then off reproduces the original rows exactly; with `cliffGuardEnabled: false` toggling
  on changes no row (Review Focus 1); the info tip opens. No `__test_pickLiveWithdrawalOrder`. Exit 1 on a failure.
- [ ] **Step 3: `tests/golden.js`.** Check 3 (Roth untouched with the toggle on) keeps its assertions. Check 4 becomes "the order
  lever never runs this household out earlier": with the toggle on, `depletedAge` and the first home draw are not earlier than
  with it off; if the plan keeps no order (`orders` null), the lifetime cost is identical to the cent (today's assertion); if it
  keeps one, stop and report the figures to the controller before choosing the assertion.
- [ ] **Step 4: `tests/traditional_penalty.js` 6-7** test the order intent instead of the live mix. Run them through
  `__test_runPlanMode({ planMode: 'apply', plan })`, with `plan` written out in full `PLAN_KEYS` order (every key, `orders:
  { [age]: 'traditional' }`, `orderPhases` to match). `BASE.taxable` is 0 (`:31`), so as written no year is orderable (review I3):
  - 6 (penalized IRA only) asserts the skip: `__test_planStats.orderSkipped` rises, no row has `drawOrder`, and the penalized draw
    and its 10% are as today (`grossForNet`);
  - 7 gives the household taxable money (e.g. 100,000) so the order runs: `drawOrder === 'traditional'` and `orderApplied`
    rises in year 0, and the ledger still moves from A to B as A's 401(k) runs out.
- [ ] **Step 4b: the smoothing tip** (`src/us/index.html:178`) says smoothing "Has no effect while 'Tax-aware withdrawal order' is
  on". Under A1 that is false: rewrite it. With A1 it reads "Smoothing still runs in the years the plan does not choose the
  order"; with the spec's text, keep it.
- [ ] **Step 5: `tests/legacy_state.js`** cases: `'live mix toggle on (legacy)'` (`withdrawalMixEnabled: true` loads as `true`,
  Q2), `'stored plan: 4c levers and orders'` (valid, round-trips unchanged), `'stored plan: V141 levers null'` (valid),
  `'stored plan: bad levers'` and `'stored plan: orderPhases without orders'` (dropped to null). Regenerate the baseline; only the
  new cases' entries are added (state the count in the commit).
- [ ] **Step 6: Run** `npm run build`, `node test_live_withdrawal_mix.js`, `node tests/golden.js`, `node tests/traditional_penalty.js`,
  `node tests/legacy_state.js`, `node tests/snapshot_ui.js` (US moves only on the toggle's markup; list it) and the 390x844 mobile
  check on the sidebar (`scrollWidth > clientWidth` false).
- [ ] **Step 7: Commit** `Batch 5 4c: the toggle's new meaning (label, tip), its UI script, golden, penalty and legacy cases`.

### Task 5 [Sonnet]: the benches and the scan learn the lever

**Files:**
- Modify: `tests/bench_plan.js` (`HOUSEHOLDS`), `tests/bench_solver.js` (`SCENARIOS`), `tests/solver_scan.js` (`--order`),
  `tests/solver_gap.js` (`--toggle on`).

- [ ] **Step 1:** Add `'early ACA single (TX), order lever'` = 4b's TX household with `withdrawalMixEnabled: true` to both benches
  (spec 5: a toggle-on household with taxable and traditional money); comment "Batch 5 step 4c: a toggle-on household (spec 5)".
- [ ] **Step 2:** `solver_scan.js --order`: per household and mode, also plan and run with the toggle on, and print the table "Order
  lever (toggle on) vs toggle off, standard projection": value and cost better / equal / worse with p10 / median / p90 (all, and
  neither depletes), depletion and first home draw later / same / earlier, by conversions off / on / combined, on all 864 and on
  the 768 3C rows (A10); the kept `orderPhases` counts; the 5 largest losses and gains; 3C's five households (single 58 trad 500k /
  taxable 2M / 130k; single 66 1.5M / 300k / 130k; HoH 58 500k / 2M / 130k; HoH 62 500k / 300k / 60k conversions on; HoH 66 1.5M /
  300k / 130k conversions on; all elections) with their depletion ages; and the two costs the yearly score cannot see: the sum of
  MAGI (`magiProxy`) and of IRMAA paid in the years after each household's first order year, on against off (IRMAA from the row
  field the engine records, if there is one; else say so and report MAGI and healthcare). Exit 1 if any household depletes or
  first draws on the house earlier with the toggle on than off (the acceptance gate, A2). Header comment updated.
- [ ] **Step 3:** `solver_gap.js --toggle on` runs the shipped column with `withdrawalMixEnabled: true` (default off, unchanged).
- [ ] **Step 4: Run** `node --check` on all four, `node tests/solver_scan.js --order --limit 8` and `node tests/bench_plan.js`
  (smoke; report only).
- [ ] **Step 5: Commit** `Batch 5 4c: the order-lever household in the benches; solver_scan --order; solver_gap --toggle`.

### Task 6 [Opus, controller]: gates and measurements; the movers to the owner

Record everything in `docs/next-batches-plan.md` "Batch 5 step 4c" (Task 7) and a scratch report beside the shared notes.

- [ ] **Step 1: Snapshots.** `npm test` up to the snapshot step; list every US mover with its cause (expected: only toggle-on
  scenarios; any toggle-off mover is a bug, stop). For each standard mover: depletion and first home draw before / after (hard
  gate: none earlier). Historical movers through `node tests/hist_depletion_cause.js`; a bridge drain stops for the owner.
  **Stop: send the owner the movers and wait for the OK before `npm run snapshot:update`** (say in the commit that it is an
  intended behaviour change).
- [ ] **Step 2: Timing** against a built copy of `1db3371`: `node tests/bench_runs_interleaved.js --base <dir>` (+5% per path),
  `node tests/bench_solver.js --base <dir> --rounds 21` (+30%, the new household included), planning per household (median of 9
  full refreshes, search on, the gap households and the new one, toggle on and off: 150 ms), Optimize on the three gap households
  at life 100 (cost target 10 s, report). If the toggle-on planning fails 150 ms, apply A11's fallback: stage 2 at the kept
  bracket only. That is an engine change: re-run Task 3's suites and stop for the owner if it still fails.
- [ ] **Step 2b: The lambda table (spec section 9)** re-run with the lever: `node tests/plan_mult_table.js --objective endValue`
  and `--objective lifetimeCost`, against 4b's table.
- [ ] **Step 3: The `cappableGain` follow-up (4b).** Re-measure bench_solver's default row. If the +15-17% stays, gate the write in
  `takeStockTaxable` identically in both modes (`wd.magiCap !== null || ctx.planMode !== 'off'`, 4b's note; `natOf` reads the
  counter in the natural phase of `choose` and `apply`), re-run the replay suites (`gains-capped`, `order-lever`) and the bench,
  and commit separately (`Batch 5 4c: the cappableGain write gated (4b timing follow-up)`). If it is gone, record that.
- [ ] **Step 4: The gap.** `node tests/solver_gap.js --objective endValue --lengths 75,default` (auto), the same with
  `--shipped optimized` (Optimize now uses the lever) and with `--toggle on`; table against 4b's figures (TX 100: 92,915 /
  4.57%; TX 75: 61,475 / 3.20%; CA 100 1.45%, CA 75 4.51%, NY 100 0.001%, NY 75 1.25%).
- [ ] **Step 5: The acceptance scan.** `node tests/solver_scan.js --order --json <scratch> --md <scratch>` (background, about an
  hour). Against 3C: no earlier depletion or first home draw (3C: 19 earlier); losses shrink (3C p10 about -75k, -150k among
  never-depleting, worst -694k); conversions on, value and cost better than a coin flip (3C: 107 dearer, 87 cheaper on cost);
  the 5 households not earlier. A failure of the first gate stops for the owner (A2, fallback F1).
- [ ] **Step 6: The MFJ 62 household** (`plan-search.test.js` MFJ62): toggle on and Optimize; whether an order intent appears at
  66, and the end value, real end value and lifetime cost against 4b's automatic plan (4,454,430 / 1,971,989 / 509,650) and the
  hand fill (4,704,162 / 2,082,546 / 513,697). Report only.
- [ ] **Step 7:** `npm run test:ui` green after the snapshot update.

### Task 7 [Sonnet]: docs, notes and the badge

**Files:** `README.md` (the toggle bullet at line 55 rewritten from the code; line 196's "live withdrawal order" sentence),
`docs/architecture/cliff-plan.md` (a 4c bullet in "The stored plan and Optimize"; the plan shape's `orders` / `orderPhases` /
`levers`; the phase list; the keep rule's stage 2; the 4b lines that name the live mix), `docs/architecture/engine.md` (lines 130,
192, 210: the mix modes), `docs/architecture/test-inventory.md` (`order-draw`, `order-lever`, `solver_scan --order`,
`solver_gap --toggle`, `test_live_withdrawal_mix.js`'s new meaning), `docs/next-batches-plan.md` (status line, "Batch 5 step
4c" notes: amendments and owner answers, rulings, movers, timings, gap, scan, MFJ 62, follow-ups; the Open items line at 8779
marked done), `src/us/index.html` badge V141 -> V142.

- [ ] **Step 1:** Write the docs from the code and Task 6's figures. **Step 2:** `node tests/doc_paths.js`, `npm test` green.
  **Step 3:** Commit `Batch 5 4c: docs, notes, V142`.

## Self-review notes

- Spec 7.1 (Task 1, with A1), 7.2 (Task 2), 7.3 (Task 3), 7.4 removals (Task 1; the label and tip, Task 4; `historical-parity`'s
  source check, Task 1), 7.5 acceptance (Tasks 5-6), section 5 gates and the new bench household (Tasks 5-6), 4.1 `levers`
  (Task 3, A5), the 4b follow-ups (5c deleted, Task 1; `strategies.js:61` gone with the branch; the timing write, Task 6 Step 3;
  MFJ 62, Task 6 Step 6). `objectiveBetter` is untouched (not in this plan's code).
