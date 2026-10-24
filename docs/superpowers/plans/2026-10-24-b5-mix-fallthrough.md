# Mix fallthrough (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A withdrawal mix's shortfall falls through to the other stock accounts (cap-aware) before cash, bonds,
inherited money and home equity, closing the home-equity loophole the end-value search exploits.

**Architecture:** `drawMixedStockAccounts` is unchanged; its two callers (`withdrawStandard`, `BUCKET_STEP.stocks`) run a
fallthrough (capped-or-plain taxable, then `takeTraditional`) only when it returned true and need is left. A new US helper
`takeTaxableCapped` sells taxable within the MAGI room. `releaseMagiCap` first draws the taxable the cap held back.

**Tech Stack:** plain ESM, Vitest 5 (Node 22.12+), Playwright scripts.

**Spec:** `docs/superpowers/specs/2026-10-24-b5-mix-fallthrough-design.md` (approved 2026-10-24).

## Global Constraints

- No-mix plans are byte-identical: the existing two default lines of `withdrawStandard` (and `BUCKET_STEP.taxable` /
  `.traditional` in the bucket `stocks` step) run unchanged when `drawMixedStockAccounts` returns false.
- Only the fallthrough's taxable draw is capped; the mix's own shares, the default draw and the live mix are untouched.
- The live mix gets no fallthrough at all (`wd.mixCandidate === 'live'`): it already cascades fully, and a traditional
  draw after it could take a float residual of the free group's share (`accountsDrawGroup` rebuilds the shares). The
  spec allows this skip; taken up front so live-mix runs stay byte-identical by construction.
- The capped sale cap is `gainRatio === 0 ? pool : Math.min(pool, room / gainRatio)` (never `0 / 0`).
- The capped taxable draw does not add to `cappableTraditional`.
- `releaseMagiCap`'s new step is `if (wd.need > 0 && wd.bal.taxable > 0) wd.need -= takeTaxable(wd, 'taxable', wd.need);`,
  before its traditional lines.
- No new module-level state, no allocation beyond `drawTaxable`'s existing return object, nothing in `src/shared/` or Canada.
- CLAUDE.md Vitest rules: `world()` per `it`, `toBe` / `toStrictEqual` only, hand-computed or two-run expected values,
  a counter + `afterAll` when a suite has many checks, run alone and `--sequence.shuffle` before committing.
- US badge `V136` -> `V137` in `src/us/index.html`, in the commit with the user-facing change.

## Review Focus

1. A capped year whose MAGI room is already 0 with taxable at or above basis (gain ratio 0): no `NaN` in any balance;
   the sale is not limited. Test: Task 1 `gain ratio 0`.
2. A capped year whose room is 0 with gains: the fallthrough sells no taxable, traditional draws nothing, Roth / cash /
   bonds pay, and `releaseMagiCap` sells the taxable before home equity. Test: Task 1 `room 0` and Task 2 capped case.
3. A `roth` mix with Roth empty (no conversions) gives exactly the no-mix rows. Test: Task 2 `roth-empty equals no-mix`.
4. The historical (bucket) strategy and a penalty-aware year never draw home equity while free stock money is left.
   Test: Task 2 `bucket` and `penalty-aware`.
5. The live mix is unchanged to the bit (skipped by construction). Test: Task 3 (`test_live_withdrawal_mix.js`, the
   `R mixLive` and `R rothConv+aca+live` snapshots do not move).

---

### Task 1: `takeTaxableCapped`

**Files:**
- Modify: `src/us/core/withdrawals/draws.js` (new export next to `magiCapLeft`; imports `drawTaxable` from the shared
  draws, `clamp` from `src/shared/core/format/numbers.js`, `TAXABLE_BASIS_KEY` from `./taxable-basis-key.js`)
- Test: `tests/unit/us/mix-fallthrough.test.js` (new)

**Interfaces:**
- Produces: `takeTaxableCapped(wd, bucket, amount, room) -> number` (net cash raised). Sells from
  `poolCap = gainRatio === 0 ? pool : Math.min(pool, room / gainRatio)` with basis `poolCap >= pool ? basis : basis * poolCap / pool`
  (so a loose room is `takeTaxable` to the bit) through
  `drawTaxable(wd.ctx, poolCap, basisCap, amount, wd.profile, wd.taxableGainGross, wd.traditionalGross)`; returns 0
  without calling it when `poolCap <= 0`; writes `bal[bucket]`, `bal[basisKey]`, `wd.taxableGainGross`,
  `wd.taxableWithdrawn` exactly as the shared `takeTaxable` does.

- [ ] **Step 1: Write the failing tests.** A hand-built `wd` like `tests/unit/helpers/bond-refill.js:53`
  (`{ bal, profile, taxableGainGross: 0, traditionalGross: 0, taxableWithdrawn: 0, ctx }`, `ctx = await w.ctx()`, the
  default profile from that helper's pattern). Cases:
  - `room binds`: taxable 100,000, basis 50,000 (gain ratio 0.5), room 10,000, amount 60,000: `wd.taxableGainGross`
    `toBe(10000)`, `bal.taxable` `toBe(80000)`, `bal.taxableBasis` `toBe(40000)`, and the net is below 60,000.
  - `room loose`: room 1e9, taxable 100,000, basis 37,000: the result equals the shared `takeTaxable` on an identical
    copy of `wd` (`toBe` on the net and `toStrictEqual` on `bal` and the totals).
  - `gain ratio 0`: basis 100,000 = pool, room 0, amount 30,000: net `>= 30000`, every `bal` field `Number.isFinite`.
  - `room 0`: basis 50,000, room 0: returns 0 and `bal` is unchanged (`toStrictEqual` with a copy).
- [ ] **Step 2:** `npx vitest run tests/unit/us/mix-fallthrough.test.js` fails (no export).
- [ ] **Step 3:** Implement `takeTaxableCapped` as in Interfaces.
- [ ] **Step 4:** The file passes, alone and with `--sequence.shuffle`; `npm run analyze` (a new export of
  `src/us/core/withdrawals/draws.js` changes `docs/superpowers/inventory/module-map.md`), and
  `node scripts/module-map.js --check --require-purpose` passes.
- [ ] **Step 5:** Commit `US: takeTaxableCapped (a taxable sale within the MAGI room)` with the module map.

### Task 2: the fallthrough in both strategies and `releaseMagiCap`

**Files:**
- Modify: `src/us/core/withdrawals/strategies.js` (`withdrawStandard`, `BUCKET_STEP.stocks`, the comment above
  `drawMixedStockAccounts`); `src/us/core/withdrawals/draws.js` (`releaseMagiCap`); `src/us/core/withdrawals/mix.js`
  (the comment's point 2 above `pickLiveWithdrawalOrder`, which says a proportional split's shortfall does not roll over)
- Test: `tests/unit/us/mix-fallthrough.test.js`

**Interfaces:**
- Consumes: `takeTaxableCapped` (Task 1), `magiCapLeft`, `takeTraditional`, `releaseMagiCap`.
- Produces: a private `function mixFallthrough(wd, solver)` in `strategies.js`: if `wd.need > 0 && wd.bal.taxable > 0`,
  `wd.need -= wd.magiCap && !wd.magiCap.off ? takeTaxableCapped(wd, 'taxable', wd.need, magiCapLeft(wd)) : takeTaxable(wd, 'taxable', wd.need)`;
  then if `wd.need > 0`, `wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver))`.
  `withdrawStandard`: `if (!drawMixedStockAccounts(...)) { <the two lines unchanged> } else if (wd.mixCandidate !== 'live') mixFallthrough(wd, solveTraditionalForNet);`
  (the default `takeTraditional` solver there is `solveTraditionalForNet`: pass it explicitly). `BUCKET_STEP.stocks`:
  the same with `solveTraditionalForNetFromNeed`, Roth step unchanged.

- [ ] **Step 1: Write the failing engine tests** (through `engine(w)` / `usPlan(w)`; a retired household with no
  conversions, no contributions, `tenure: 'own'`, a home, the mortgage fields zeroed explicitly, Roth 0; build from the
  `ZERO` / `HELD` pattern of `tests/unit/us/se-settlement-plan.test.js`). **Every equivalence case runs with the cliff
  guard off** (`cliffGuardEnabled: false`, or `runPlanMode({ planMode: 'off' })`), with a comment saying why: under a cap
  the mix path sells taxable capped and the no-mix path uncapped (the spec's recorded asymmetry), so rows legitimately
  differ there. Compare whole arrays, `toStrictEqual(rowsA.map(strip), rowsB.map(strip))` with `strip` deleting
  `mixCandidate` from a copy (one assertion; no counter needed):
  - `roth-empty equals no-mix`: `appliedMixSchedule` `roth` for every retirement age: every row equals the no-mix
    run's row field-for-field except `mixCandidate` (`toStrictEqual` after deleting it from both).
  - `taxable equals no-mix`: same household with Roth 200,000, mix `taxable` every year: rows equal the no-mix run's
    (minus `mixCandidate`).
  - `home untouched`: the same household with mix `roth` and Roth 100,000: `homeEquity` of every row equals the no-mix
    run's (`toBe`) while that run's `depletedAge` is null; and at the age the Roth runs dry, `taxable` falls.
  - `bucket`: the `roth`-empty case on the historical engine (`runPlanMode({ planMode: 'off', rowFn: rowFnFor({ type:
    'crashFirst' }) })`): rows equal the no-mix bucket run's (minus `mixCandidate`).
  - `penalty-aware`: retire at 52, traditional IRA 1,000,000, taxable 150,000, Roth 0, mix `roth` 52-58: rows equal the
    no-mix run's (minus `mixCandidate`); the penalized traditional is untouched exactly as there.
  - `capped`: the `NAT` household of `se-settlement-plan.test.js` without the self stream (spending met from the
    portfolio), switched to `own` with a home and zeroed mortgage, mix `roth` every year with Roth small enough to run
    dry in the ACA years, `runPlanMode({ planMode: 'choose', planTrace: true })`. A kept trial always met its line
    (`ok` requires `met`, `run-projection.js:1361`), so "realized <= target" is tautological and is not the assertion.
    Instead: (1) in at least one year after the Roth runs dry, the trace keeps an `under` candidate (`planTr.candidates[]`
    has `kind === 'under'` and `ok === true`, and the row carries `cliffChoice`); on the current code the Roth share's
    shortfall reaches `releaseMagiCap` -> uncapped traditional / home equity and the trial fails or never offers; (2)
    every row's `homeEquity` equals the `planMode: 'off'` no-mix run's while that run is not depleted. The builder
    tunes the household until (1) fails on the current build (confirm before the fix; if no such household is found
    in a reasonable search, report it rather than weaken the assertion).
  On the current code a `roth` mix with Roth 0 draws nothing and skips the default draw, so the need goes straight to
  cash / bonds / home: `roth-empty`, `home untouched`, `bucket`, `penalty-aware` and `capped` fail; `taxable equals
  no-mix` fails wherever taxable runs dry (traditional skipped; the household must run taxable dry within the plan).
  Run to confirm each fails before the fix.
- [ ] **Step 2:** The new cases fail as expected; Task 1's still pass.
- [ ] **Step 3:** Implement `mixFallthrough`, its two call sites, the `releaseMagiCap` step (Global Constraints), and
  rewrite the two comments to say a mix's shortfall now falls through (cap-aware) before Roth / cash / bonds / home.
- [ ] **Step 4:** The file passes alone and shuffled; `npm run test:unit` passes (any moved expected value in a
  multi-lever suite is re-derived or turned into a two-run comparison, and listed for Task 3's notes).
- [ ] **Step 5:** `node tests/engine_purity.js` passes. Commit `US: a withdrawal mix's shortfall falls through to the
  other stock accounts (cap-aware)` (TDD: the fix and its tests together, the approved fix of a recorded defect, not an
  incidental bug under CLAUDE.md Vitest rule 7).

### Task 3: measure what moves, labels, docs, badge

**Files:**
- Modify: `src/us/ui/results/roth-optimizer.js:193-197` ("Taxable only" / "Traditional only" / "Roth only" -> "... first");
  `src/us/index.html` (badge V137); `docs/architecture/engine.md` ("Withdrawals": the fallthrough rule, the capped taxable
  draw, `releaseMagiCap`'s taxable step); `docs/architecture/cliff-plan.md` (the `cappableTraditional` rule applies to
  traditional draws; the capped taxable draw honours `magiCapLeft` but does not add); `README.md` (if it describes the
  mix's fallback or the "only" labels); `docs/next-batches-plan.md` (a new "Batch 5: the mix fallthrough (US V137)" notes
  section after step 2's); `tests/snapshots/*.json` (only via `npm run snapshot:update`)

- [ ] **Step 1:** `npm run build`; `node tests/plan_off_anchor.js --base <scratch>/base-dist` (base = `1ece7f3`,
  already built). It forces the guard off on every scenario, so it shows which mix scenarios move with no cap; it cannot
  see the capped asymmetry (only `tests/snapshot.js` runs guard-on). Expected to differ: `R smooth`, `R mixApplied`,
  `R mixApplied+live` (its applied years), the guardrails+live+smooth scenario (`snapshot_scenarios.js:148`), possibly
  `G hoh ... smooth` (`:297`); must not differ: `R mixLive`, `R rothConv+aca+live` and every no-mix scenario. Update the
  header of `tests/plan_off_anchor.js` (baseline = the fix commit; append the counts to its history lines).
- [ ] **Step 2:** `node tests/snapshot.js`: list every moved scenario with its mix mode, guard on; confirm the set is
  the step-1 set plus only capped mix years. `node tests/snapshot_ui.js`: expected unchanged (it never runs the
  optimizer, so the labels do not show); update its baseline only if it differs, and say why.
- [ ] **Step 3:** Rename the labels in `roth-optimizer.js:193-197` (the only code hits; prose in tests and docs that
  describes old behaviour is left or corrected where it now misdescribes the engine).
- [ ] **Step 4:** One plan-year showing the recorded asymmetry (a `roth` mix with Roth empty under a cap vs the no-mix
  year), from a scratch script outside the repo, for the notes.
- [ ] **Step 5:** Docs and badge as listed; `npm run snapshot:update` rewrites both grids wholesale, so run it only
  after steps 1-2 confirmed that the moved set is exactly the mix scenarios, and check `git diff --stat tests/snapshots`
  matches that set; say so in the commit. Commit `US V137: mix fallthrough docs, labels, snapshots`.

### Task 4: re-measure the gap

- [ ] **Step 1:** `node tests/solver_gap.js --objective endValue` (both lengths, background, about 5 minutes) and
  `node tests/bench_optimizer.js --objective endValue` (8,000 budget, three rounds) on the fixed build.
- [ ] **Step 2:** The default household's mix lever alone under `endValue` (step 2's +2,292,391 and end home equity
  281,898), from the same scratch replay as step 2's review.
- [ ] **Step 3:** Gate: home equity left / summed of the reference near the shipped run's in TX and NY, and the default
  household's mix-lever-alone gain no longer in the millions with end home equity near 611,662. If not met, stop and
  report to the owner (spec, builder's calls).
- [ ] **Step 4:** Record the tables beside step 2's in the notes section; commit `Batch 5 notes: the mix fallthrough
  re-measured`.

### Task 5: full verification and PR

- [ ] **Step 1:** `npm test` green; `npm run test:ui` green.
- [ ] **Step 2:** Mobile check unnecessary (no new field or card); state so in the PR.
- [ ] **Step 3:** Push, open the PR to `main` with the measurements summary, bind it (`ccd_pr`).
