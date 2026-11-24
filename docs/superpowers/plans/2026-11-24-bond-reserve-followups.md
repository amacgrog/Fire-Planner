# Bond reserve follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Close the limits #125 left documented in `docs/architecture/engine.md` (bridge section): the two reserves fill the
brokerage money in a different order under held and build, and the standard order's down-year bridge sale ignores a cliff
plan's MAGI cap. A second PR (B, outlined at the end) fixes the bracket-search bug the held year-0 regression exposed.

**Owner decisions (2026-11-24):** bridge first in both paths; cap the bridge sale at the MAGI room left; two PRs (A: the two
bridge fixes; B: the bracket search).

**Spec:** `docs/superpowers/specs/2026-11-23-bond-reserve-split-design.md` ("The bridge reserve (US)"); this plan amends it as below.

## Global Constraints

- CLAUDE.md rules hold: engine functions read `ctx.inputs` only; hot paths allocate nothing; no new module-level mutable; exact
  Vitest comparisons with hand-computed or two-run expected values; `npm test` exact to the cent.
- **Exactness:** at `bridgeBondYears` 0 nothing moves — no golden, engine snapshot, rows hash or existing unit test. Every change
  sits behind `bridgeTarget > 0` / `bal.bridgeBonds > 0` (or is bit-identical at 0, as A1's stacked gain of 0).
- US badge V203 → V204 (one bump for PR A); Canada untouched (the shared `bond-ladder.js` change is behind `bridgeTarget > 0`,
  which is 0 in Canada).
- Docs in the same commit as the behavior (Task A3 lists them).

## PR A

Plan review (Opus, 2026-11-24): ready with the changes folded in below (its C1, I1-I4, M1-M5).

### Task A1: Bridge first in the build ramp

**Files:** `src/shared/core/withdrawals/bond-ladder.js` (`rotateIntoBondLadder`); test `tests/unit/us/bridge.test.js`.

Today, in a build year: `fillSplit` moves traditional/Roth stocks into the retirement reserve, then the retirement reserve's
taxable last resort sells brokerage stocks (`remaining > 0`), then the bridge ramp sells brokerage stocks (`bridgeTarget > 0`).
Held (`placeHeldReserve`, `bond-ladder.js` ~123-146) already runs `fillSplit`, then the bridge from taxable (then cash), then
the retirement reserve's leftover from taxable.

Change (M1): move the bridge block **before** the retirement reserve's taxable sale, then run today's retirement block with
`gain` (0 when no bridge) as `drawTaxable`'s prior-gains argument, and `gain += d.gain`, `saleTax += d.taken - d.net`. No else
branch is needed: with no bridge `0 + d.gain` and `0 + (taken - net)` are bit-identical. Keep `remaining` computed before the
bridge sale (the sale raises `bondTaxable` and `bridgeBonds` by the same `d.net`, so `bondTaxable - bridgeHeld(bal)` is
unchanged). The bridge draw passes prior gains 0 and `conversionAmount`; the retirement draw passes the bridge's gain and
`conversionAmount`.

Tests (`bridge.test.js`, no counter there):
1. Bridge first, zero gain, one-year window: `bal({ taxable: 300, taxableBasis: 300, traditional: 150 })`,
   `rotateIntoBondLadder(ctx, b, { year: 0, ladderTarget: 400, bridgeTarget: 200, rotationStartYear: 0, rotationEndYear: 0 }, PROFILE, 0)`
   → `bondTraditional` 150 and `traditional` 0 exact; `bridgeBonds` ≈200 and `bondTaxable` ≈300 (near); `taxable` 0 exact;
   gain 0; `LADDER_OUT.saleTax` 0. (Today's code gives `bridgeBonds` ≈0: the test discriminates.)
2. Held and build agree: same balances, `placeHeldReserve(h, { target: 400, bridgeTarget: 200 })` → exact `bondTraditional` 150,
   `bridgeBonds` 200, `bondTaxable` 300, `taxable` 0; build (test 1) `near` each. Both leave the gap of 150 on the retirement
   reserve's brokerage part, the bridge full.
3. Gain stacking with a conversion: taxable 200000 on basis 100000, traditional 0, ladderTarget 60000, bridgeTarget 40000,
   one-year window, `conversionAmount` 30000 → `near(LADDER_OUT.saleTax, taxFor(ctx, p, gain, 30000) - taxFor(ctx, p, 0, 30000))`
   (telescopes only if the retirement draw stacks on the bridge gain), `bridgeBonds` ≈40000, `bondTaxable` ≈100000. Load `taxFor`
   from the US tax module (check its path).
4. No bridge: the existing "rotateIntoBondLadder without a bridge target…" test unchanged; add a two-run `toStrictEqual` of `bal`
   for `bridgeTarget` 0 vs the key absent.

### Task A2: The down-year bridge sale under the MAGI cap

**Files:** `src/shared/core/withdrawals/draws.js` (`takeBridgeOnly`), `src/us/core/withdrawals/draws.js` (new wrapper),
`src/us/core/withdrawals/strategies.js` (~149); tests `tests/unit/us/bridge.test.js`.

- (I1) `takeBridgeOnly(wd, amount, room = Infinity)`: `gainRatio = clamp(1 - basis / pool, 0, 1)`, `poolCap = gainRatio === 0 ?
  pool : Math.min(pool, room / gainRatio)`, `if (!(poolCap > 0)) return 0`, `drawTaxable` on `poolCap` with basis
  `poolCap >= pool ? basis : basis * poolCap / pool`; keep `bal.bridgeBonds = Math.max(0, pool - d.taken)` on `pool`. With
  `room = Infinity` every expression equals today's. No cap knowledge in shared code.
- (C1) New US wrapper beside `takeStockTaxable`, `takeBridgeBonds(wd, amount)`: `g0 = wd.taxableGainGross; net =
  takeBridgeOnly(wd, amount, magiCapLeft(wd)); wd.cappableGain += wd.taxableGainGross - g0; return net`. `cappableGain` grows on
  **every** down-year bridge sale, capped or not (as `takeStockTaxable`): stay-under eligibility reads `natGain: wd.cappableGain`
  from the uncapped natural pass. Uncapped years keep balances, net and `taxableGainGross` bit-identical; only `cappableGain`
  grows (bridge > 0 only). Behavior change, intended: `underEligible` can now offer a household-line stay-under in a down year
  where a held bridge sold at a gain; the trial still judges it. Check `magiCapLeft` returns Infinity with no cap or `off`.
- `withdrawStandard` (~149) calls the wrapper.
- (I2) No `releaseMagiCap` change: held-back bridge dollars are reached by the reserve step's uncapped `takeBondTaxable` (bridge
  first), before `releaseMagiCap`. Capped down-year order: bridge up to the room → capped stocks/traditional → Roth → cash → the
  reserve (rest of the bridge first, uncapped) → `releaseMagiCap`.
- (I3) The bucket orders' bridge spending stays inside the uncapped `BUCKET_STEP.bondTaxable` (the reserve's own place; capping
  it would strand money, since `releaseMagiCap` never releases `bondTaxable`). Only the standard order's pre-step is capped.
- (M4) MAGI snapshot: nothing new (only `bal` and the per-pass `wd`).

Tests (reuse `gains-capped.test.js`'s `setup`/`mk` pattern: `newWithdrawal`, `PROFILE` single 60 TX, `wd.taxableGainGross =
ladder`, `wd.magiCap = { limit, off: false }`; `yearReturn: -0.2`, age 60, `ladder` 2000, `limit` 12000 → room 10000):
1. Binding cap: `bondTaxable` 200000, basis 100000, `bridgeBonds` 200000, cash 100000, need 60000 → exact
   `taxableGainGross` 12000, `cappableGain` 10000, `bridgeBonds` 180000, `bondTaxable` 180000, `bondTaxableBasis` 90000, `cash`
   60000, `need` 0, `taxableWithdrawn` 20000.
2. Cap, no cash: as 1 with cash 0 → `need` ≈0, `taxableGainGross` > 12000 (≈32000), `cappableGain` 10000, `bridgeBonds` ≈140000.
3. Room 0 (`ladder` 12000): `bridgeBonds` 200000, `cash` 40000, `cappableGain` 0, `taxableGainGross` 12000.
4. Zero-gain bridge (basis 200000) capped vs uncapped: net `toBe`, `bal` `toStrictEqual`, `taxableGainGross` `toBe`,
   `cappableGain` 0 both.
5. Uncapped bit-identical, for `magiCap` null and `{ limit: 0, off: true }`: wrapper vs shared `takeBridgeOnly(wd, 60000)` on test
   1's balances → net, `bal`, `taxableGainGross`, `taxableWithdrawn` identical; `a.cappableGain` `toBe(b.taxableGainGross)`.
6. Up year (`yearReturn` 0.1) with the cap: `cappableGain` 0 from the bridge; the counter untouched until the reserve step.
7. Optional: run-level, planMode `choose`, a held plan with a gained bridge and a crash year (the existing crash-at-52 fixture with
   `bondStart` 'held') → the crash year's plan trace has `natGain > 0` (trace hooks per `cliff-plan.md`).

### Task A3: Docs and badge

- `engine.md` bridge section: replace both limit sentences — the build ramp fills the bridge first (held and build agree on
  brokerage order; only held also draws free cash into the bridge, M2); a build plan with a small brokerage now shows its gap on
  the retirement reserve, which nothing reports (as without a bridge, M3); the standard order's down-year bridge sale honours
  the cap and counts in `cappableGain`; the bucket orders leave it in the reserve's uncapped step (I3).
- `docs/architecture/cliff-plan.md` ~29-31: `magiCap` also limits the down-year bridge sale; `cappableGain` counts it.
- Comments: `src/us/core/withdrawals/draws.js` ~86 (`cappableGain`), `strategies.js` ~144-146, the header of
  `tests/unit/us/gains-capped.test.js` (the bridge pre-step is the exception to "the reserve's sales are not counted").
- `test-inventory.md` for `bridge.test.js`; `us-accounts.md` if it repeats either limit; README only if its bridge bullet does.
- US badge V203 → V204. `npm run analyze` (new export). `npm run test:unit`, `npx vitest run --sequence.shuffle
  tests/unit/us/bridge.test.js`, `npm test` (no golden/snapshot/rows move), `npm run test:ui`.

### Task A4: Held-back bridge dollars are released last (owner, 2026-11-24)

Found by the PR A review: under 59½ the penalty-aware standard order sells the bridge dollars the capped pre-step held back in
the reserve step (`takeBondTaxable`, right after cash, before Roth), uncapped, so a capped down year lands on the natural MAGI
and the offered stay-under's trial fails (a bridge plan loses the ACA stay-under a no-bridge plan gets).

Change: when the capped pre-step leaves bridge dollars unsold while need remains (a per-pass flag on `wd`, e.g.
`wd.bridgeHeldBack`, false in `newWithdrawal`), the reserve step's `bondTaxable` draw in `withdrawStandard` (both branches) takes
only the retirement reserve's part (`bondTaxable - bridgeHeld`, with its basis share; the counter untouched), and
`releaseMagiCap` sells the held-back bridge first (uncapped, `takeBridgeOnly`), before what it releases today. Nothing is
stranded. Bucket orders untouched (they never set the flag). No flag → today's code. Not in the MAGI snapshot (per-pass `wd`).

Tests: unit — capped down year, penalty-aware branch, Roth room enough: the bridge sells only up to the room, Roth covers the
rest, MAGI stays at the cap; Roth too small: the release sells the rest of the bridge (nothing stranded, `need` 0); no flag:
bit-identical. Run-level (the review's case: single 52, held 3-year bridge at 40% basis, ACA on, the crash-at-52 standard-order
scenario, spending 140000, planMode `choose`): year 0 offers the stay-under and its trial now holds (`ok: true`), as the
no-bridge plan's does.

Also from the review (minors): `cliff-plan.md` ~39-40 clause and ~52-53 "Not counted" line; comments at US `draws.js` ~15-17
(`magiCapLeft`) and `solver.js` ~47, ~54-55; a zero-gain bridge at room 0 sells in full (the `gainRatio === 0` guard);
`engine.md` describes the release order.

## PR B (outline; its own plan and review before execution)

The bracket search (`computeCliffPlan`, `src/us/core/projection/run-projection.js`) picks the bracket with `keptBracketOf` on the
stage-0 bests, before conversion sizing, and sizes only the kept bracket; the user's own bracket, once sized, can last longer
(five RI/PA held couples: 92 vs 93, 93 vs 94). Fix: when the sized plan's bracket is not the user's, also size the user
bracket's stage-0 best and take it on a strict `bracketCandidateBetter` win (swap as the `leverPassStands` fallback does; levers
on: compare against toggle-off's sized plan, B0.11.9; capture the start search's base after the swap). Cost: up to
`CONV_RUN_BUDGET`+1 applies per planning where the search moved the bracket (~59% of grid rows); bench with
`tests/bench_runs_interleaved.js --warm-analysis`; before/after `solver_scan --sizing --conv-only` dumps; name every moved
baseline.

Plan review notes for PR B (M5): state whether the bracket search runs at the defaults (if so, goldens and snapshots move at the
defaults, unlike PR A); compare the user bracket's sized plan and the kept bracket's under the same conversion-start-search state
and the same `contextFor` base.
