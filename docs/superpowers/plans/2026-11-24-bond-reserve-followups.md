# Bond reserve follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Close the limits #125 left documented in `docs/architecture/engine.md` (bridge section): the two reserves fill the
brokerage money in a different order under held and build, and the standard order's down-year bridge sale ignores a cliff
plan's MAGI cap. A second PR (B, planned at the end) fixes the bracket-search bug the held year-0 regression exposed.

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

## PR B: the bracket search sizes the user's bracket too

Plan review (Opus, 2026-11-24): ready with changes, folded in below (its I1-I3, M4-M6, M10-M11).

Plan written 2026-11-24 from the Opus investigation on main (fc41bebe; notes outside the repo) and a prototype measured on
main `ed78419b` (#126 merged). US badge V204 → V205; Canada untouched (the change is in US-only `run-projection.js` and
`solver.js`).

**The bug.** `computeCliffPlan` picks the bracket with `keptBracketOf` on the stage-0 bests (lever-free, unsized), then runs the
sizing pass (`sizePass`) only at the kept bracket. Sizing can gain the user's bracket more than the kept one: under
`bondStart: 'held'` five RI/PA couples of `tests/bracket_search.js`'s grid (MFJ 52, 401(k) 250k + 250k, taxable 300k, spending
60k: RI none / rule55, PA none / rule55 / sepp) keep 10% or 12% and run out at 92 / 93, while the user's 22% sized runs out at
93 / 94. Under `'build'` every bracket ties at stage 0 for those rows, so 22% stays kept; the mechanism is not specific to held.
The search's promise (`tests/bracket_search.js`, `cliff-plan.md`): the kept plan never runs out, or first draws on the house,
earlier than the user's bracket (search off, which sizes the user's bracket). Sizing broke it.

**Does the search run at the defaults?** No. `bracketSearchApplies` and `sizingApplies` both need `rothConvEnabled`, which is
`false` in `defaults`, so a default household plans only the user's bracket, unsized, and nothing in it moves. The baselines that
turn conversions on with the guard on are the ones that can move: `tests/golden.js` (the `R rothConv*` rows), `tests/snapshot.js`
(`rothConvEnabled: true` cases), `tests/snapshot_scenarios.js`, `tests/snapshot_ui.js`, and the root UI scripts that converse
with the bracket search (`test_bracket_search.js`, `test_conversion_schedule.js`, `test_plan_optimizer.js`). Measured with the
prototype (Task B1 records the final list): `tests/golden.js`, `tests/snapshot.js` (US 564, Canada 399) exact; `tests/snapshot_ui.js`: one US surface moves,
"std R everything" (history success 84% -> 86%, its text, projection and rows hashes); Canada exact. Unit tests that move: the
`report.sized` key lists in `conversion-plan.test.js` (two new keys), `stored-plan.test.js` "depletes" (the CA couple at 150,000
spending now keeps the user's 22%, not 12%: its literal `12` and its premise need a re-check), `conversion-answer.test.js` (its
check count: the kept plan converts in one year fewer). Everything else passes (run alone; a parallel run with the scans timed
out three slow files, not failures).

### The rule

After the sizing pass at the kept bracket (and, with the levers, toggle off's own pass), and **before** the lever guard
(`leverPassStands`), the no-conversion candidate and the start search:

1. **Toggle off's sized plan** is `offSized` when toggle off's pass ran on its own (levers on, kept best not toggle off's), else
   the one pass (`pass`: no levers, or the kept best is toggle off's). Its selection is `offSel`: `auto.off` with the levers, else
   the kept one (`{ bracket: keptBracket, best, cands, brackets }`).
2. When `!rankEvenly && offSel.bracket !== from` (the search moved toggle off's bracket; never when the search does not apply,
   since only the user's bracket is then selected), one more pass: `uPass = sizePass(from, auto.user.best, null)`, where `auto.user` is the user
   bracket's stage-0 selection (lever-free: `best0` and `cands.slice(0, n0)` with the levers, else `best` and `cands`; `automatic()`
   returns it beside `off`).
3. **The keep rule** (`userBracketStands(user, other)`, new in `solver.js`): the user's sized plan replaces toggle off's sized
   plan when that plan runs out, or first draws on the house, earlier than the user's (null: never, latest), or when
   `bracketCandidateBetter(user, other)`. Otherwise the other bracket stands.
   - Why not the outline's strict `bracketCandidateBetter` alone: `bracketCandidateBetter` is a partial order on the two ages.
     A kept plan that runs out later but first draws on the house earlier than the user's sized plan is not beaten by it, and the
     gate (`tests/bracket_search.js`: never earlier on either age) would still fail. The first clause makes the user's bracket the
     floor on both ages, as `keptBracketOf`'s chain from the user's bracket makes it at stage 0 (each other bracket replaces the
     running best only on a strict win, so it is never earlier on either age). On equal ages within the 0.1% threshold the other
     bracket stands (the outline's tie rule; stage 0 chose it on a strict win, and sizing at the user's bracket did not beat it).
   - Not "re-run `keptBracketOf` over the sized plans" (chain from the user's sized plan, the other replaces it only on a strict
     win): that also reverts ties within 0.1% to the user's bracket, which moves rows the bug does not touch.
4. **The swap** (as the `leverPassStands` fallback): when the user's plan stands, `offSel` becomes `{ bracket: from, best:
   auto.user.best, cands: auto.user.cands, brackets: auto.off ? auto.off.brackets : brackets }`. If toggle off's pass was its own
   (`offSized !== null`), `offSized = uPass` and toggle on's lever pass is then judged by `leverPassStands(pass.best,
   offSized.best, pass.walkBest, offSized.walkBest)` against it (B0.11.9: toggle on is never below toggle off's fixed sized plan;
   on a fall back the plan is the user's sized plan). Otherwise (the one pass was toggle off's) `pass = uPass`, `keptBracket =
   from`, and `best`, `cands`, `brackets` become `offSel`'s.
   - With the levers the user's bracket's own lever plan is not sized (cost; the guarantee is against toggle off, which is what
     B0.11.9 promises). A lever plan at another bracket that beats toggle off's fixed plan by `leverPassStands` stands.
5. **The start search's base** (`sBase`, `sBracket`) is captured after the swap: `offSel.best`, `offSel.bracket` (today: `auto.off`
   or `auto.best` / `auto.kept.bracket`, captured before the pass, which is the same as `offSel` when nothing swapped). Its
   fall-back branch (toggle off's searched plan) takes `offSel`'s `best`, `cands` and `brackets` (today `auto.off`'s). So both
   toggle states start the search from the same base and the same `contextFor` inputs (`ctx.inputs`; the user pass runs through
   `run()` / `runSourceFor` like every pass), and both sized plans are compared before the start search ran, under the same
   start-search state (none yet).
6. **The report.** `report.sized` gains `userTried` (the user pass ran) and `userKept` (its plan replaced toggle off's sized plan),
   after `offPass` and before `noConvTried`, on every sized report (both toggle states; the start search's fall-back report
   re-adds them in that order). `report.sized` is then the kept plan's pass report as today: the user pass's report when the swap
   took the one pass. `offPass` repeats toggle off's pass figures (the user pass's after a swap with the levers: toggle off's own
   pass at its kept bracket is then no longer reported; `userKept` marks it, review M6). The summary needs
   nothing: `keptBracket` is `from` after a swap, so it reads "your 22% bracket".
6a. **Not under `rankEvenly`** (review I2): Optimize's sized re-plannings (`plan-search.js` ~117) rank the brackets evenly
   (`bracketEvenBest`, ties to the base plan's bracket), so the user's bracket has no priority there; under it stage 0 can keep a
   bracket earlier on the home draw than the user's, so the first clause could install the user's unsized best. Optimize keeps its
   own floor (`rankBetter` against the base planning, which is not `rankEvenly` and gets the fix). `userTried` is false there.
6b. **The no-conversion floor** (review I1, no run): `noConv` is the same measure in both plannings (bracket `from`). In the
   no-lever path (`auto.off === null`), when the user pass ran and was not kept, after today's no-conversion step: if
   `bracketCandidateBetter(noConv, uPass.best)` (search off's end after the candidate is the candidate) and
   `userBracketStands(noConv, fin)` (`fin`: the plan the step ended on), the candidate is kept as the no-conversion step keeps it
   (`final = noConv`, `keptBracket = from`, `noConvKept = true`). Without it a kept plan at another bracket (90 / 85) that the
   candidate (89 / 86) does not beat ends earlier on the home draw than search off (the user's 88 / 85, replaced by the candidate).
   With the levers the toggle-on side is left to B0.11.9 (toggle off's own planning is the no-lever path and gets the floor).
6c. **The promise's scope** (review I1): after this PR the kept plan is never earlier than the user's bracket on either age through
   the sizing pass and the no-conversion candidate (by construction, no-lever path). The start search is not covered by
   construction: search on starts from `sBracket` (toggle off's bracket after the check), search off from the user's, and covering
   it would need user-bracket starts (a second start search). It stays held by the grid gate (`tests/bracket_search.js`, 576 rows,
   start search 'quick' as shipped); `cliff-plan.md` says so.
7. Hot paths: none touched (planning only). No new module-level mutable; `userBracketStands` is a pure function.

### Cost

One `choose` and up to `CONV_RUN_BUDGET` (24) + 1 `apply` runs per planning where toggle off's kept bracket is not the user's
(the investigation: 284 / 480 grid rows under build, 279 under held). Only plannings with conversions on and the guard on (the
deferred pass, and Optimize's sized re-plannings). Benches, before (`main` built in a scratch tree) and after:
- `node tests/bench_runs_interleaved.js --base <main tree> --warm-analysis` (the hot path; the default household has conversions off,
  so it must stay within noise): within noise (US tx -6.5%, ca -1.0%, ny -2.5%, pa -1.7%, ct +2.3%, wa -2.9% on the 400 simulates; the
historical runs -7.9% .. +0.6%).
- `node tests/bench_planning.js --base <main tree>` (the deferred planning on the gap households, toggle off and on): median per row, before -> after: TX @75 off 202 -> 263 ms (+30%), on 223 -> 283 (+27%); TX @100 off 250 -> 314
(+26%), on 284 -> 365 (+29%); CA @75 off 135 -> 168 (+24%), on 150 -> 178 (+19%); CA @100 +8% / +4%; NY (the worst rows, the
search keeps the user's bracket) -8% .. +1%. The worst row stays NY @100 toggle on, 534 -> 529 ms. `bench_optimize` (it moved more
than 25%): mixed signs within its noise (-14% .. +16% across the 12 cells at k = 1..3, 3 rounds).
- `node tests/bench_optimize.js` before/after if `bench_planning` moves by more than 25% (Optimize's sized re-plannings run the
  same planning).
If the planning cost grows by more than about 50% on the median row, stop and ask the owner with the numbers.

### Task B1: the user bracket's sized plan (engine)

Reference prototype (measured; the numbers above): the controller passes its diff to the implementer. To fix in it: `selU` /
`user` assigned once (`const`, inside `if (lev)` / else; review M4); `userBracketStands` uses `== null` as `leverPassStands` does,
with a comment block (M5); the rankEvenly gate (6a) and the no-conversion floor (6b) are not in it.

**Files:** `src/us/core/cliff-plan/solver.js` (`userBracketStands`, exported, with a comment block in the file's style),
`src/us/core/projection/run-projection.js` (`automatic()` returns `user`; the sizing block as above; the comment blocks above
`computeCliffPlan`'s sizing pass, "The toggle's guarantee after sizing", and the start search's base updated).
`npm run analyze` (a new export: the module map).

Tests (TDD: write them first; they fail on main):
- `tests/unit/us/bracket-search.test.js` (the counter's total goes up by the checks added):
  - "sized user bracket": `{ ...scanHouseholds({ conversions: true })[0].patch, stateTax: 'ri', bondStart: 'held' }` (the RI MFJ
    52 couple), `plan(h)` against `plan(h, { searchOff: true })`: the kept plan's `depletedAge` / `homeDrawAge` (the
    `candidates[keptIndex]` entry) no earlier than search off's (`depOf`), and `report.sized.userTried === true`. The relation,
    not literals (rule 6). Fails on main (92 vs 93).
  - "a swap": the same household: `report.sized.userKept === true`, `report.keptBracket` and `plan.bracket` equal the household's
    `rothConvBracket` (`from`), and `report.candidates[report.keptIndex]` is the kept plan.
  - "no user pass": the same couple with `bondStart: 'build'` (22% stays kept): `userTried === false`; and `searchOff: true` on the
    held household: `userTried === false`.
  - "rankEvenly": the held household with `{ rankEvenly: true, tieBracket: 22 }`: `userTried === false`.
  - "report shape": the held household's `Object.keys(report.sized)` lists `userTried`, `userKept` right before `noConvTried`
    (and after `offPass` when present).
  - The no-conversion floor (6b): `userBracketStands` on the 90 / 85 vs 89 / 86 example; a run-level case is not known on the grid
    (say so in the test comment).
  - `userBracketStands` on hand-written measures (`at(...)`-style): earlier run-out of `other` → true; earlier home draw of `other`
    with a later run-out → true; equal ages, user higher by more than the threshold → true; equal ages within the threshold →
    false; `other` later on one age, no earlier on the other → false; nulls as never.
- `tests/unit/us/order-lever.test.js`, `conversion-plan.test.js`, `conversion-start-search.test.js`, `split-order-floor.test.js`:
  any test that asserts `report.sized`'s key list or `toStrictEqual`s a sized report gains the two keys only through the
  engine (no expected literal changes unless one lists the keys: then add `userTried`, `userKept` in place). A new lever case
  (`order-lever.test.js` or `conversion-plan.test.js`): the RI held couple with `withdrawalMixEnabled: true` is never earlier than
  the same household's toggle-off plan (B0.11.9) on either age, and the path ran: `report.sized.userKept === true` and (when the
  lever kept best is not toggle off's) `offPass` present; plus the start-search fall-back after a swap: the same lever household with
  `ctx.test.startCheck = 'revert'` (the existing seam): `report.keptBracket === from`, `report.candidates[keptIndex]` is the searched
  end, and `report.sized`'s keys in order (`offPass`, `userTried`, `userKept`, `noConvTried`, `noConvKept`, `starts`). If that
  household's lever plan does not reach these branches, find one that does (a grid row with the mix on) and name it.
- Run the five failing rows (RI none / rule55, PA none / rule55 / sepp) under held, search on vs off: none earlier.
- `npm run test:unit`, `npx vitest run --sequence.shuffle tests/unit/us/bracket-search.test.js`, on Node 22 and Node 24 (engine
  comparisons are two-run, so no literal).

### Task B2: the gate and the dumps

**Files:** `tests/bracket_search.js`.
- After the 480 rows today (384 + 48 RI + 48 PA, default `bondStart`), the same 96 RI / PA rows with `bondStart: 'held'`
  (names suffixed "; held"); the header comment and the printed count say so. Fails on main (the five rows), passes after B1.
  Runtime goes from about 16 s to about 20 s.
- Before/after dumps (not committed): `node tests/solver_scan.js --root <main tree> --sizing --conv-only --mc 10 --dump before.json`
  and the same on this tree, then `node tests/compare_household_dumps.js before.json after.json`: exit 0 (no row earlier), and the
  differing rows listed in the PR description with their counts per mode. Measured with the prototype: 960 rows (480 per mode), 13 differ, 0 earlier (compare exit 0); `report.sized.kept` 199 -> 200 (default) and 151 -> 158
(smooth), named in the PR with `tests/conversion_sizing.js`'s own kept count (`FLOOR` 130 holds). 11 end higher (largest: HoH 52 1500k / 2000k / 130k smooth, 6,958,405 -> 7,119,336; MFJ 52 250k+250k / 300k / 60k sepp,
81,005 -> 109,494, both modes); 2 end lower (smooth MFJ 52 750k+750k / 2000k / 60k none and rule55: 43,480,570 -> 43,473,120,
-0.017%, same ages: the swap moves the start search's base, and the search from the user's base ends lower than from the kept
bracket's; within the 0.1% tie threshold, and the gate is on the ages). With the fix, all 96 RI / PA rows under held pass (search on
vs off, Vitest).

### Task B3: baselines, docs, badge

- `npm test` in full. If a golden or snapshot moves, check each moved case is one where the search kept another bracket (its
  report's `keptBracket` before) and the user's sized plan now stands; then `npm run snapshot:update` (only for this intended
  change) and name every moved baseline and its reason in the commit message and the PR description. Expected: one UI snapshot surface ("std R everything") and the unit tests listed above.
- `npm run test:ui`; any UI script that pins a kept bracket other than the user's (`test_bracket_search.js`'s CA couple keeps
  24%: unaffected unless its user pass wins) is updated only if the new plan is the intended one, named in the commit.
- `docs/architecture/cliff-plan.md`: the bracket search paragraph (the promise after sizing, scoped as 6c: the user's bracket is
  sized too when the search moved toggle off's bracket, not under `rankEvenly`; the start search held by the gate), the sizing pass section (the user pass, `userBracketStands`, the swap,
  `report.sized.userTried` / `userKept`, `offPass` after a swap, the no-conversion floor, the start search's base after the swap,
  the cost), the code comment blocks above the sizing pass, "The toggle's guarantee after sizing" and the start search's base, and the toggle's guarantee (B0.11.9:
  against toggle off's fixed sized plan).
- `docs/architecture/test-inventory.md`: `bracket-search.test.js` (the new cases and the count), `tests/bracket_search.js` (576
  rows, the held 96, the runtime).
- README: the bracket search bullet only if it states the promise (check; otherwise no change).
- US badge V204 → V205 (`src/us/index.html`).
- This plan's "Batch notes"-style findings (the measured cost, the moved rows) go in the PR description; `docs/reference.md` is not
  edited (CLAUDE.md, batch rule).

### Done

`npm test` and `npm run test:ui` pass; the bench numbers and the dump comparison are in the PR description; every moved baseline
named; commits end with the Co-Authored-By line; the owner is asked before pushing or opening the PR (base `main`).
