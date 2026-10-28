# The per-year solver and the cliff plan (US)

Read before touching `magiThresholds`, `lambdaEstimate`, the `wd` cap primitives, the run modes (`off` / `choose` / `apply`), planning (`computeCliffPlan`, `planForState`, `refreshCliffPlan`) or their test hooks.

Related: [magi-iteration.md](magi-iteration.md), [engine.md](engine.md), [us-health.md](us-health.md), [module-system.md](module-system.md).

## Per-year solver and the cliff plan

- **Per-year solver and the cliff plan (3C redesign, US; section "Per-year solver (Batch 3C)" just above
  `newWithdrawal`; spec `docs/superpowers/specs/2026-10-07-cliff-plan-design.md`).** Hooks: `magiThresholds` (the year's
  federal lines in household MAGI, each `{ magi, label, id, ret, family }`: `id` in `medicaid | acaFloor | aca400 |
  irmaa1..irmaa5 | senior | ctc`, `ret` 'H' or, in a two-return year, 'A' / 'B', `family` `aca | irmaa | tax`; lines within $1 of each other count as one: the earlier is kept, except that an `aca` or `irmaa` line replaces a `tax` line, so an intent never names `senior` or `ctc`; with
  `c.lo/c.hi` only the lines in that reach, a shared empty list (`NO_THRESHOLDS`) when none; IRMAA lines sit on the tiers of
  the year the surcharge is charged, two years on (`c.irmaaGrowth`, the year loop passes `irmaaGrowth2`, the estimate
  `irmaaAt` uses), on this year's return's filing status (the return SSA will read, E3) for the partners on Medicare then, and
  in a year with an in-year IRMAA appeal candidate on this year's edges (growth 1, per return through `c.irmaaGrowthA/B`; the
  candidate's partners added: `a: medA || inYrA`); the edges are Medicare's MAGI translated
  into the engine's with `magiForIrmaaLine` on this year's return (`c.profile`'s benefit, `c.filing`); the Roth-conversion ceiling
  `irmaaTierCeiling` keeps this year's edges, the safe side there, 13.7 A), `lambdaEstimate` (future tax on a
  traditional dollar, 9 `taxFor` calls: three sample years, each walking today's pool forward at the real return net of
  `tradShare x` the year's need less benefits started since, pricing `max(RMD, min(pool, draw))`, moved to the year the
  walk empties the pool (`movedSample` flags it; a known defect, measured in Batch 5 step 4a by `tests/plan_mult_table.js`, the
  lambda table of the Batch 5 notes, and left for step 5); since step 4a the year's `lambda` is multiplied by the plan's phase
  multiplier (`mult`, below) in `choose` only; IRMAA is priced on Medicare's MAGI (`irmaaMagiOf`
  with the sample's own benefits); two-return samples price IRMAA per person; the year loop's `lambdaOf` passes `need = max(0, -flow - lumpExpense)` and the start-of-year traditional
  share), `afterTaxValue`. Primitives on `wd`: `magiCap`, `releaseMagiCap`, `fillTraditional`, `freeTraditional`,
  `cappableTraditional` and `cappableGain`. `magiCap` limits penalty-free traditional draws and, since Batch 5 step 4b, every
  stock-account taxable sale (through `takeStockTaxable`, the order phase's traditional-first draw included) except the bucket strategy's bond refill
  (`refillBondReserve`) and `releaseMagiCap`'s sale (made with the cap lifted). The ladder gain, the bond reserve's sales and
  early Roth earnings still raise MAGI too, so it is not a hard MAGI guarantee. `releaseMagiCap` runs before penalized money,
  inherited money and home equity: it lifts the cap and draws the taxable, then the traditional, the cap held back.
  `cappableTraditional` is the traditional drawn that a cap could limit: `takeTraditional` with
  `penalized === false && uncapped === false` (the order phase's traditional-first draw in `drawMixedStockAccounts` among them). A new traditional draw path
  that honours `magiCapLeft` must add to it, or the plan never offers a stay-under for that mode.
  `cappableGain` (a `newWithdrawal` field, 0 per pass) is its counterpart for gains: the gain of the pass's `takeStockTaxable`
  sales. `takeStockTaxable(wd, amount)` (`withdrawals/draws.js`) is `takeTaxableCapped(wd, 'taxable', amount, magiCapLeft(wd))`
  under a cap that is not off and `takeTaxable(wd, 'taxable', amount)` otherwise (so the plan-off run is unchanged), and adds
  the sale's gain. Its callers are the explicit mix's and the smoothing's taxable shares, `mixFallthrough`, `withdrawStandard`'s
  default sale, the order phase's traditional-first cascade and `BUCKET_STEP.taxable`. Not counted: the bond refill and `releaseMagiCap`'s sale (as
  above), and also the ladder gain and `bondTaxable` sales. A new stock-account taxable sale goes through `takeStockTaxable`, or
  the plan never offers a gains-capped stay-under for that mode. The bond reserve's traditional draw is uncapped in both
  strategies.
  **Run modes** (`ctx.planMode`, `ctx.plan`): `off` (no steering; byte for byte the guard-off year,
  pinned by `tests/plan_off_anchor.js --base DIR` with a tree at or after `4834615`, E3 Task 3), `choose` (deterministic run only: each withdrawal year with
  a line in reach runs as phases: the natural year converged, then each candidate from `yearPlanCandidates` (a
  stay-under at the nearest real cliff and at the largest one, offered only when `underEligible`: cappable traditional
  drawn (`natTrad`) or, on a household line (`ret` `'H'`), a cappable gain realized (`natGain`, `wd.cappableGain`; since
  Batch 5 step 4b, with no bound on the money that replaces it, owner ruling R0 (c): the trial's own iteration is the test;
  per-return lines are left out, their caps being translated with the traditional share), and the natural MAGI less its
  conversion over the line; a fill to the nearest floor, `fillEligible`, penalty-free
  traditional only) as its own converged iteration from the year's snapshot, seeded from the natural draw; a trial wins
  if it met its line, left no need unmet, cut premium plus IRMAA by more than $1 and beats the natural `afterTaxValue`
  score by more than $1; a stay-under year converts nothing; the winner is recorded as `intents[age] = { kind, line, ret }`
  and returned as the non-enumerable `cliffIntents`), and `apply` (follow `plan.intents` by Partner A's age: the intent's
  line looked up by `id` and `ret` in that year's lines, built only in a year with an intent; absent line, natural year
  already on the plan's side or ineligible: the natural year; otherwise one trial, kept if it met its line with no need
  unmet, else the natural year is replayed. No scoring, no lambda). `apply(choose's intents)` replays `choose` exactly.
  **"Met" is one predicate, `planMet(plan, realizedMagi, magiA, magiB)` (Batch 5 step 4d, owner ruling R1 (a)),** shared by
  the trial record, `apply` and the row label: the household MAGI on the plan's side of its line and, for a per-return intent
  (ret A / B, two-return years only), that return's own MAGI (`returnMagis`) on its side of the return's own line. Each line
  carries `own` (the line in the return's own MAGI before `toHousehold`; `magi` for ret H) and each plan `own - 1` (under) /
  `own + 1` (fill); `NO_PLAN.own` is 0. Without it a return could end over its own line while the household test passed
  (the traditional share places the cap, gains split half and half).
  **The order phase (Batch 5 step 4c).** The phased year runs: the natural year; then, in `choose` with
  `plan.levers.order === true` (`orderLever`) or in `apply` with `plan.orders[age] === 'traditional'`, the order phase; then the
  trials. A year tries the order when its natural pass is orderable (`wd.orderable`: it reached the stock-account step with need
  left, taxable and penalty-free traditional money, and no explicit mix ran, A6) and converted nothing (`conversionAmount === 0`,
  A15 (a)). The order phase is a fresh converged iteration from the year's snapshot with `wd.taxAwareOrder = 'traditional'`
  (`yearOrder`), seeded as a trial is. In `choose` the natural year's record is then built whatever the lines (with its score:
  `lambdaOf()` is first called there, so the trials score with the same lambda as without the lever), saved with its trials
  (`orderNat`), and the order phase is scored as a trial is; it is kept when `ok` (`flow < 0`, it drew traditional-first, no
  need unmet, no more home equity than the natural year: A4) and its score beats the natural score by more than $1, and recorded
  as `orderIntents[age] = 'traditional'` (non-enumerable `sim.orderIntents`, absent with the lever off). In `apply` it is always
  kept (`planStats.orderApplied`). A kept order phase is the year's natural record (`naturalRec.order = 'traditional'`): its lines
  (from its own `preConvMagi` and need), its eligibility (`natOf`) and its trials, which run traditional-first (every trial
  start, winner replay and apply fallback sets `yearOrder` from the record it seeds from); it seeds the next year (A3). A rejected
  one restores the natural record and trials, or replays the natural year's final pass. `apply` on a year that cannot carry
  the order (a historical path whose taxable is gone, a bucket down year covered by cash and bonds: A7, A13, or a conversion year)
  keeps the natural year (`planStats.orderYears` / `orderSkipped`). A row whose kept pass ran traditional-first carries
  `drawOrder: 'traditional'`. `apply` of `choose`'s intents and orders replays `choose` exactly
  (`tests/unit/us/order-lever.test.js`). The `irmaaChecks` push (`irmaaZeroSaving`) reads the kept order's MAGI as the natural one
  in a kept-order year.
  **The split stage (Batch 5 step 4d).** After the order phase and before the trials, in `choose` with `plan.levers.split ===
  true` (`splitLever`) or in `apply` with `plan.splits[age]` set (`planSplits`), a year may run split phases: converged iterations
  with `yearSplit` 0 (A's traditional accounts first) or 1 (B's), seeded as a trial is from the stage's starting record, with the
  share estimate `estShareA` at 1 or 0 ([magi-iteration.md](magi-iteration.md)). The stage starts at the end of the phase it starts
  from: the natural year when no order phase starts, a kept order phase, or (after a rejected order) the restored natural record,
  whose eligibility was saved in `orderNat.canSplit` when the order phase started (the order pass's draws are not the natural
  pass's). It starts only when `canSplit`: a two-return year, no conversion, a draw year (`flow < 0`), discretionary traditional
  money drawn (`wd.traditionalWithdrawn - rmd > 0`), both partners' penalty-free traditional money at the withdrawal's start
  (`wd.splittable`), and the lever or an intent at the age. `wd.splittable` is evaluated (`freeOf` allocates) only on the passes
  whose end can read it: the natural phase's and an order phase's, at an age the lever or an intent covers; never a split
  phase's, a trial's or a replay's (`testHooks.splitCheckCalls` counts the evaluations). The starting record is built whatever the lines (choose: scored, as an
  order year's) and saved with its trials (`splitNat`); `apply`'s intent lookup is skipped there and runs once, at the split
  phase's end. **Each split phase builds its own lines** (owner ruling R2 (a)): the same `magiThresholds` call from its own pass
  (`preMagiA/B` at its `estShareA`, `costAt` / `irmaaAt` and `natOf` at its realized share; at share 1 B's per-return lines are NaN
  through `toHousehold` and dropped, which is right: an A-only draw cannot move B's return), and in `choose` its own trials,
  stored in its record. In a cascade year (the first partner runs out) the lines are translated at the average share while a cap
  removes the second partner's dollars one for one, so a stay-under can over-shoot; `planMet` judges the return (R1) and the
  score decides (a known approximation, Fable review M1, M2). Under the bucket strategy the fall-through to the other partner is
  per bucket: once the first partner's share of the bond reserve is gone, the reserve's uncapped draw takes the other partner's
  bond dollars while the first partner's stock-account traditional money remains, so a path's realized share can sit below 1
  (0.877 in `SPLIT_H1`'s first year on the historical paths) with no split skipped; D1's accounting prices it as drawn. `choose` runs A-first, then B-first, and keeps (D7) `best = start;
  A, then B: if ok && score > best.score + (best === start ? 1 : 0)`, `ok` being the order phase's (it drew, no need unmet, no
  more home equity than the start). A kept split is the year's natural record: it is recorded as `splitIntents[age] = 'A' |
  'B'` (non-enumerable `sim.splitIntents`, absent with the lever off), its trials run (from its record: `yearSplit =
  naturalRec.split`, `estShareA = naturalRec.shareA`), or with none its final pass is replayed unless it is B's (the pass that
  just ran); the start winning restores `splitNat` (its trials, or a replay of its final pass). It seeds the next year (A3).
  `apply` keeps its one phase (`planStats.splitApplied`) unless the split pass drew nothing (`flow >= 0`: its share would stay at
  `estShareA`); such a pass is not a split: counted `splitSkipped`, the stage's starting record's final pass is replayed
  (`splitRun` -1, the one replay whose end runs the phase-end block), with the share at `ownerShareA0`, no `drawSplit`, and the
  year's intent lookup runs over its lines as in a year with no split intent (`choose` never keeps such a phase: `ok` requires a
  draw, so `apply` of `choose`'s plan still replays it). An intent the year cannot carry keeps the natural year (`splitSkipped`;
  `splitYears = splitApplied + splitSkipped`). Every replay takes its record's `yearSplit` and `estShareA`, so it
  repeats the same pass. A row whose kept pass drew one partner first carries `drawSplit`. The trace carries `split` (`{ natScore,
  scoreA, scoreB, okA, okB, kept }` in `choose`, `{ kept }` in `apply`), `shareA` (the kept phase's realized share) and the test-only
  `splitLines` (each split phase's line count). D13's fallback (one split phase) was not needed: planning `SPLIT_H1` measured 11 ms
  in the page with the split lever on. `apply` of `choose`'s intents, orders and splits replays `choose` exactly
  (`tests/unit/us/two-return-split.test.js`).
  **A held phase is judged on its settled return** (B5 decision 4, spec 6.7): the natural phase and each trial settle at their end
  (the 162(l) settlement), so `met`, `ok`, the records' `realized` and `seA/B`, `cliffCost` (`healthcareRet`, the return's premium,
  plus `irmaaAt` at the settled pair: `irmaaAt(trad, gain, ia, ib, sa, sb)`), the choose score (`afterTaxValue + seSettle -
  irmaaAt`) and the row's label read the return; an unheld phase computes the in-year expressions unchanged. The apply natural
  record has no `cliffCost` or score. `computeCliffPlan`'s cost (and `tests/solver_scan.js`) adds a settled row's
  `taxSettled + healthcareSettled` instead of its `tax + healthcare`, through `rowCost` (`src/us/core/projection/row-cost.js`),
  which the objective registry's `lifetimeCost` (`src/us/core/optimizer/objectives.js`) and the Roth optimizer's `lifetimeTax` (`rowTax`) read too: every whole-run cost scores
  a settled year on its return.
  **Planning** (`src/us/core/cliff-plan/planning.js`, above the engine): `computeCliffPlan(ctx)` (in `run-projection.js`; pure; its runs use the context's fields with `taxFactors: null`, and it prices each candidate's end value under that standard-run context) runs `choose`, the ACA-only and
  IRMAA-only subsets through `apply` when both families appear, and `off`, and keeps the best by rule A
  (`planCandidateBetter`, Batch 5 step 4b, decision 9: a candidate that depletes or first draws on home equity earlier than the running best (null: never, the latest for both) is never kept; one later on either and earlier on neither wins; both ages equal, the measure's `score` by more than $1 decides both ways (the after-tax end value unless `objective` says otherwise, step 4a), then fewer intents. The running best starts at `off`, so the kept family never depletes or first draws on the house earlier than `off`, by construction; that holds for the automatic plan, while Optimize's `bracketEvenBest` ranks depletion before the home draw, unchanged. `report.candidates` entries carry `homeDrawAge` after `depletedAge`; each candidate's `value` and `cost` are read from the objective registry, `US_OBJECTIVES.endValue` and `lifetimeCost` in `src/us/core/optimizer/objectives.js`, which the plan names explicitly);
  `afterTaxEndValueUS(ctx, sim)` reads the run's non-enumerable `estate` (final balances, last year's tax profile): face value
  for Roth, taxable (stepped-up basis), cash and home equity, traditional net of ten slices of tax on the last year's
  return; a `choose` run that records no intent is the `off` run row for row, so it is reused as the `none` candidate.
  **The bracket search** (Batch 5 step 3a; on since US V139: `testHooks.testBracketSearchOff` defaults to `false`, read as
  `ctx.test.bracketSearchOff`): `computeCliffPlan(ctx, { search = true })` runs that whole selection once per flat bracket of
  `BRACKET_CANDIDATES` (`[10, 12, 22, 24, 32, 35]`): the user's bracket first (today's plan exactly), then the others
  ascending, each on plans carrying `{ bracket, bracketFrom: rothConvBracket }` (`choose`, the subsets through `apply` and
  `off` all convert at that bracket), and keeps one by `bracketCandidateBetter` (`solver.js`): no earlier depletion and no
  earlier first home-equity draw (`sim.homeDrawAge`; `null` latest for both), then later depletion or later first home draw,
  else a value higher by more than `Math.max(1, 0.001 * |best.value|)`; replaced only on a strict win. It applies only with
  conversions and the guard on, a conversion age of Partner A inside the plan (any state, RI and PA included), no
  applied schedule with keys and the switch off; otherwise (and with `search: false`) the plan is the user's bracket's. Every plan is
  built by `makePlan` (below) and starts `{ intents, family, bracket, bracketFrom }`; the report keeps `candidates` / `kept` for the kept bracket and adds
  `brackets` (`[{ bracket, family, intents (a count), depletedAge, homeDrawAge, value, cost, score }]`, in search order; `score` since step 4a),
  `keptBracket` and `searched` (true after `search: true`, or when the search does not apply: the plan is final).
  Where the kept bracket shows: `cliffPlanSummary` adds a conversion clause once the search has run with other brackets to try
  (`report.searched && report.brackets.length > 1`; none while it is pending, and it follows "no steering helps this plan" too):
  "Conversions: the cliff plan uses the 24% bracket, not your 22%, within your conversion ages." or "Conversions: your 22%
  bracket (no other flat bracket does better)."; the decision question's ladder row names the plan's bracket when it differs
  (`src/us/ui/results/decision-questions.js`). The flat-bracket card (`computeRothOptimizer`) pins each trial's window ages
  (`rothConvStartAge`, from Partner A's age, to `rothConvEndAge`) to its own bracket through the override map when the plan's
  bracket differs from the setting, so its row for the user's bracket is that bracket's run (with the plan's intents), not the
  plan's; otherwise its trials are unchanged. Its baseline is then the plan's bracket (the dashboard's run): `currentBracket` is
  `plan.bracket` (the pick's tie-break), that row is marked "(cliff plan)" and the user's "(your setting)", and the summary reads
  "The cliff plan already uses the 24% bracket (not your 22% setting), ..." when that is the pick, else "fill to the X% bracket
  instead of the cliff plan's 24%"; the per-year card names "the cliff plan's flat 24%" as what its gain is measured against
  (`selected`). With the plan on the setting both cards read as before ("your current 22%"). The optimizers (`optimizeMultiLever`, `optimizeRothLadderPerYear`): the
  "today's flat setting" start uses the plan's bracket when `plan.bracket != null && plan.bracketFrom === rothConvBracket` (the
  plan comes from `contextFor(base, ...)`, the caller's factory: `variantContext` gives the stored plan for the state object
  it was made for), so that start reproduces `selected`; their guardrail (`notWorseThanSelected`, the coordinate steps and
  `pickGuardedRun`) also rejects a run that first draws on home equity earlier than `selected` (`homeDrawAge`; skipped
  when `selected` lacks the field), and the result carries `homeDrawAge`. When a run passes the guardrail (always, when the
  ladder is already on in the base and the store's override maps are null: the flat start reproduces `selected`), the
  suggestion never depletes, or first draws on the house, earlier than the current plan. When none passes (e.g. the Roth
  lever searched on a base with the ladder off), `pickGuardedRun` falls back to the run that depletes latest (`null` = never),
  then the highest score, with no home-draw tiebreak: that suggestion can deplete or first draw on the house earlier than
  the current plan (the comment above `pickGuardedRun` in `multi-lever.js`).
  `refreshCliffPlan()` (first line of `render()`) stores `cliffPlan`, `cliffPlanKey` (JSON of state),
  `cliffPlanReport` and `cliffPlanState` (the state object); it re-plans only when the inputs change (state JSON, tax year
  `currentYear`, the optimizer override maps), otherwise it keeps the plan and only records the state object.
  `refreshCliffPlan({ light: true })` (the light render of a field input) plans with `search: false` and sets
  `cliffPlanStore.searchPending` when the search applies; a full refresh (a full `render()`, `renderDeferred()`, `ensureTestPlan`)
  also re-plans an unchanged key whose plan is not `searched` (the deferred pass: `docs/architecture/inputs-and-ui.md`). The engine never plans: `storeContext()` (every
  `simulate` / `simulateHistorical`) gets the plan from `planForState(state, overrides)` (overrides default to the store's
  maps; since Stage 3 planning runs the engine on a context of exactly `inputs` and `overrides`, so `inputs` need not be
  `state`; the cache keys hold the tax year and the inputs' JSON, not the overrides). `planForState(inputs)` (every step also requires the tax year `currentYear` the plan was made under): the very object `refreshCliffPlan` planned
  for gives `cliffPlan` (dashboard, and every variant of that state object through `variantContext`: age lines, tornado,
  sensitivity, decision questions, optimizer trials, which apply the main plan by age and never re-plan); else guard off gives null; else the
  state's JSON equal to `cliffPlanKey` gives `cliffPlan` when it is searched or its search is pending (`searchPending`: the light
  render's user's-bracket plan, so a normalized copy of the live state, as the scenario comparison's current row and overlay
  project on a light render, runs no search on a keystroke; the deferred pass redraws them through `renderBody` when the kept plan
  differs; the identity step serves it searched or not), and a computed, searched `cliffPlan` served this way is also put in
  `cliffPlanCache`, so a copy of it (a saved scenario equal to the live state) is not planned again after the live state moves
  on; else `cliffPlanCache` (searched plans only) (`planning.js`; 16 entries, emptied when full; keyed on the tax year and the state's JSON) gives or
  stores the plan computed for it now (the scenario comparison and overlay swaps, and load / undo / reset before
  `render()`). The state-replacement sites are NOT edited (all are shared code under `src/shared/`, and a clear at the comparison swap
  would wipe the plan mid-render): a new code path that swaps `state` needs nothing; one that mutates it in place
  without restoring must call `render()`. Tests: the US hooks (`src/us/ui/install-test-hooks.js`, installed after the shared ones) redefine
  `__test_simulate`, `__test_simulateHistorical`, `__test_runHistoricalCycles`, `__test_runMonteCarlo` and
  `__test_accountTrace` to re-plan when the state's JSON or the tax year changed or the plan is not searched (`ensureTestPlan`, never called from production code; it also
  wraps `__test_optimizeRothLadderPerYear`, `__test_optimizeMultiLever`, `__test_objectiveScore`, `__test_objectiveBreakdown` and
  `__test_applyMultiLeverSchedule`; the plan card's hooks `__test_optimizePlan`, `__test_applyStoredPlan`, `__test_clearStoredPlan`
  and `__test_planOptimizerCard` need no re-plan: `optimizePlan` plans its own working copy); `__test_setCliffPlan` marks its plan as not computed (the next refresh re-plans) but searched
  (`ensureTestPlan` keeps it); `__test_setBracketSearch(on)` turns the search on or off (returns the old setting) and drops the
  stored key, state object and `cliffPlanCache`; `__test_setConversionSizing(on)` does the same for the per-year conversion sizing
  (`testHooks.testConvSizingOff`, Batch 5 step 5b piece 3); `__test_cliffPlanState()` reads `{ bracket, bracketFrom, searched, searchPending }`
  without refreshing; `__test_rothOptimizerCard()` returns the flat-bracket card's rows (`computeRothOptimizer`); and
  `__test_cliffPlanComputes()` counts the plans of `refreshCliffPlan` (`cliffPlanStore.computes`) and
  `__test_planForStateComputes()` those `planForState` computes itself (`cliffPlanStore.stateComputes`);
  benchmarks use `__test_simulateRaw` / `__test_simulateHistoricalRaw` after one refresh; `__test_runPlanMode`,
  `__test_refreshCliffPlan`, `__test_setCliffPlan`, `__test_planForState`, `__test_replaceState`,
  `__test_scenarioMetrics`, `__test_planStats` (the plan-mode hooks build their context with `storeContext({ plan, planMode, taxFactors })`;
  `tests/unit/helpers/us-plan.js` mirrors them); `window.__test_planTrace(rowFn)` returns the `choose` trace (each
  year's candidates, `movedSample`, `lambdaNeed` (the need passed to `lambdaEstimate`, null when lambda was not computed),
  the intent, and in a `choose` year with lines `natTrad` / `natGain`, what `underEligible` read; `tauGain` beside `lambda`; in a year
  with an order phase `order` (`{ natScore, score, ok, kept }` in `choose`, `{ kept }` in `apply`) and in `choose` the two phases'
  end balances `natBal` / `orderBal`; `tests/se_health.js`'s
  identity hash deletes them), or with `rowFn` the `apply` trace on that path. `planStats` counts
  what `apply` did (intentYears, applied, skippedSide, skippedIneligible, fallback, absent, rothShift, irmaaStayUnders,
  irmaaZeroSaving, orderYears, orderApplied, orderSkipped, splitYears, splitApplied, splitSkipped; cumulative, scans read deltas). `magiStats.planMissed` counts plan years (choose / apply) whose
  final realized MAGI missed the plan's target (an invariant guard: a plan wins only when it met its line). Rows carry `cliffChoice` ("stayed under ..." / "filled to ...") only
  in a year where the plan was carried out; `annotateSolverRows` (US, after the shared `renderTable`) puts it in the
  status cell's tooltip. State-law cliffs and the senior / CTC lines are priced by `taxFor` but are not candidates.
  The `wd` field `taxAwareOrder` is the order phase's draw order (set from the year's order, `yearOrder`, on each pass: see
  "The order phase" above); `onlyPartner` (read by `tradGroup`) is set only by the split draw (Batch 5 step 4d: with `wd.splitFirst` 0 or 1,
  `takeTraditional` and `fillTraditional` draw that partner's penalty-free accounts first, then the other's, and `profile.ownerShareA` follows
  the realized share on every probe, `solveSplitForNet`); the year loop sets `splitFirst` in a split pass ("The split stage" above).
  Tests: `tests/cliff_plan.js`, `tests/cliff_guard.js`, `tests/end_value_us.js`, `tests/solver_hooks.js`,
  `tests/solver_primitives.js` (in `npm test`); `tests/plan_off_anchor.js --base DIR`, `tests/bench_solver.js --base DIR`,
  `tests/solver_scan.js`, `tests/solver_gap.js`, `tests/plan_mult_table.js` (not in `npm test`).

## The stored plan and Optimize (Batch 5 step 4a, US V140)

Spec `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (sections 4.1-4.7), plan
`docs/superpowers/plans/2026-10-25-b5-stored-plan-4a.md`; figures in the Batch 5 notes of `docs/next-batches-plan.md` ("Batch 5
step 4a").

- **One plan shape** (`src/us/core/cliff-plan/plan-shape.js`). `makePlan(fields)` returns a plan with every key of `PLAN_KEYS`
  in this order: `intents, family, bracket, bracketFrom, orders, splits, levers, mult, orderPhases, conv` (defaults `{}`, `'none'`, then
  `null`; an unknown field throws), so every plan the engine sees (computed, held for a bracket, stored) has one hidden class
  (`solveRothConversion` reads `plan.bracket`, `apply` reads `plan.intents[age]` every year). `orders`, `splits`, `levers` and
  `orderPhases` are `null` in 4a; 4c fills `levers`, `orders` and `orderPhases` (below), 4d `splits`. The module also holds
  `PLAN_LEVERS` (`{ order: true, split: true }`, frozen; the levers with the withdrawal toggle on and Optimize's default, 4d D10;
  4c's `ORDER_LEVERS` had `split: false`), `orderPhasesOf(ctx,
  orders)` (the sorted distinct `phaseOf` of an order map's ages; `null` for `null` or no keys), `PLAN_LINE_IDS` (the line ids an intent can
  name), `PLAN_FAMILIES`, `PLAN_RETS`, `PLAN_KINDS`, `BRACKET_CANDIDATES` (moved here, re-exported by `run-projection.js`),
  `MULT_GRID` (`[0, 0.5, 1, 1.5, 2]`), `phaseOf(ctx, age)` and the stored plan's guard (`STORED_PLAN_KEYS`,
  `STORED_OBJECTIVE_IDS`, `isValidStoredPlan`, `migrateStoredPlan`; [inputs-and-ui.md](inputs-and-ui.md)) and `lineNameOf(id)` (a
  line's name in the summary and the row labels: moved out of `cliffPlanSummary`, same strings). `select(null)` (the user's bracket with no
  `mult`) still passes `null` as the plan: today's runs, byte for byte.
- **`mult`, the per-phase lambda multiplier.** `plan.mult` is `[m1, m2, m3]` or `null` (= `[1, 1, 1]`), by Partner A's age:
  `phaseOf` is 0 before 65, 1 from 65 until A's `rmdStartAge`, 2 from it. In `choose` only, `lambdaOf` passes the year's
  multiplier to `lambdaEstimate`, which returns `lambda = (SOLVER_LAMBDA_MULT * mult * rateSum) / 3` (exact for 1; `tauGain` is
  not multiplied; `LAMBDA_MAX` still clamps); `apply` and `off` never read it. The trace records the year's `lambda`
  (`planTr.lambda`, trace only; `tests/se_health.js`'s identity hash deletes it before hashing). `computeCliffPlan(ctx, { mult })`
  with a `mult` other than all ones runs every `choose` with it (the user's bracket's as `makePlan({ bracket: from, bracketFrom:
  from, mult })`) and returns a plan carrying it; `null` or `[1, 1, 1]` is today's plan.
- **`computeCliffPlan(ctx, { search = true, mult = null, objective = 'endValue', rankEvenly = false, tieBracket = null, offMemo =
  null, levers = null })`.** (`levers`: the order and split levers, below.) `objective` is a registry id (`objectiveById`; an unknown id throws): each measure gains `score` (its last key),
  the value for `endValue`, `cost === 0 ? 0 : -cost` for `lifetimeCost` (never `-0`), and `planCandidateBetter` /
  `bracketCandidateBetter` compare `score` (for `endValue` the value: unchanged). `rankEvenly` keeps the bracket by
  `bracketEvenBest(brackets, tieBracket)` (`solver.js`) over every bracket's best instead of the strict-win chaining from the
  user's bracket: the latest depletion, then the latest first home draw, then the top score, where every bracket within
  `max($1, 0.1% of |top|)` (inclusive) ties and the tie goes to `tieBracket` when it is among them, else to the lowest bracket
  (the kept bracket no longer depends on the setting: 3a's follow-up, spec decision 6). `offMemo` is a caller-owned `Map` keyed
  by bracket holding each bracket's `off` measure (it depends on neither `mult` nor the ranking); it is valid for one working copy
  of the inputs and one objective (the stored `score` is the objective's), and a kept `none` family's `intents` can be the memo's
  shared `{}` (never mutate a returned plan). `report.candidates` carry no `score`. The defaults give today's plan. The report
  always has `keptIndex` (after `kept`): the kept candidate's index in `candidates`; find the kept candidate by it, never by
  `family === report.kept` (with the order lever one family names several candidates).
- **The levers' keep rule** (Batch 5 step 4c, spec 7.3, A2, A11, A12; the split lever 4d, D9, D10). `computeCliffPlan(ctx, {
  levers = null })`: the effective levers are `levers` when `levers.order` or `levers.split` is true, else `PLAN_LEVERS` when
  `levers` is `null` and `inputs.withdrawalMixEnabled` is on, else none (a levers option with both off is no lever at all: the
  plan and report are byte-identical to toggle off). With no lever `select` is the 4b code and nothing below runs. With the
  lever, each bracket's `select` runs:
  - **stage 0**, today's lever-free selection unchanged (its `choose`, its `off` measure, shared and memoized as before, and its
    family subsets);
  - **stage 1**, the lever's `choose` (`makePlan({ ...base, mult, levers })`, `base` the held bracket plan or `{ bracket: from,
    bracketFrom: from }`), its family subsets through `apply` and its `all`, every one holding all its order intents
    (`sim.orderIntents`) and all its split intents (`sim.splitIntents`), or, with no cliff intent, the run itself as family
    `none`. Chained from stage 0's best. A lever run that records no order and no split adds no candidate (stage 0's selection
    stands, and its families are neither measured nor reported); one that records splits but no orders counts (4d);
  - **stage 2** (when the lever run recorded orders or splits), at the kept bracket only, after the bracket search has ranked
    the stage-1 bests (A11's fallback: a full planning of the TX gap household measured 273 ms with stage 2 at every bracket,
    174 ms after): the best lever candidate (the top: best among stage 1's, whether or not it beat stage 0) with its family and
    intents and (`stage2.ords`) each phase's orders alone with the top's splits (when the orders span two or more phases), then
    no orders with the top's splits (only when the top holds orders: a top with splits and no orders would re-run its own plan,
    4d's D9 amendment), then (4d, D9: only when the top holds splits) the top's orders with `splits: null`. A try is skipped
    when it would be `off`: no orders is skipped for family `none` with no splits, no splits for family `none` with no orders.
    The kept bracket's `brackets` entry is rebuilt from its final best.

  **The split lever's keep rule** (4d, D9; spec 8: one subset, with and without): stage 1 holds every split of the lever
  `choose` run, stage 2 adds the one no-splits candidate, and no other subset of the splits is tried. An empty `orders` or
  `splits` map is `null` in `measure` and so in every plan (Opus review I1: `isValidStoredPlan` requires `orderPhases` null
  exactly when `orders` is, so a splits-only Optimize winner carrying `orders: {}` would be dropped on load). Every lever
  candidate replaces the running best only on `planCandidateBetter`, whose `n` counts cliff intents, orders and splits (the
  measure's `ni` is the cliff count alone), so a tie keeps the plan with fewer orders and splits, and a tie with the lever-free
  best keeps it. The bracket rank (`keptBracketOf`,
  `solver.js`: `bracketCandidateBetter`'s strict-win chaining, or `bracketEvenBest` with `rankEvenly`) is not a total order, so a
  lifted bracket best can move the kept bracket to one with an earlier depletion or first home draw than toggle off's. Hence the
  **whole-plan check**, last (after stage 2): toggle off's kept bracket and best are ranked as today over every bracket's stage-0
  best (no new run), and the lever plan's kept candidate stands only when it is that candidate or beats it by
  `planCandidateBetter` (`leverPlanStands`); otherwise the returned plan and report are toggle off's (stage 0's candidates and
  bracket entries, the lever's report fields, `levers` set, `orders` null). So the whole plan never depletes or first draws
  on the house earlier than the toggle-off plan, by construction (A2; `order-lever.test.js`'s scan property and synthetic pair).

  **The order-only floor** (4d, Task 8; owner, 2026-10-26). With both levers (`lev.order && lev.split`, so `PLAN_LEVERS`) a kept
  split displaces that year's stay-under and changes the trajectory, so later order decisions differ and the joint planning can
  keep a plan below what the order lever alone keeps (Task 7's scan: 39 of the 384 two-return household-modes, worst -281,578
  nominal). The automatic planning (everything before the stored-plan guard) is the inner `automatic(lev, offMemo)`, which
  returns `{ kept, best, cands, brackets, split }`, `split` true when some bracket's lever `choose` recorded a split. When it
  is, `computeCliffPlan` runs `automatic({ order: true, split: false }, memo)` too: exactly 4c's planning (its family subsets,
  bracket rank, stage 2 and its own A2 check), sharing the `off` measures (the caller's `offMemo`, else one `Map` made for the
  pair before the first track), and bumps `ctx.stats.plan.orderTracks`. The joint result stands only on a strict win,
  `planCandidateBetter(joint.best, orderOnly.best)` (a tie, including both tracks falling back to the same toggle-off candidate,
  goes to the order-only track); otherwise the plan and report are the order-only track's (`plan.levers` still the caller's
  copy, `splits` null, `keptSplits` 0). `report.leverTrack` (`'joint'` | `'order'`) is set only when both tracks
  ran. So the toggle-on plan never ends below the order lever's alone, by construction (`split-order-floor.test.js`, whose
  sweep over the grid's 384 two-return household-modes runs with `FIRE_SPLIT_FLOOR_SWEEP=1`). Toggle off, a levers option with
  `split` false and a toggle-on household with no recorded split run one track, byte for byte as before. The stored-plan guard
  runs once, on the surviving result. Cost: the order-only track is a second full planning for the households that record a
  split (SPLIT_H1 7 -> 17 ms against 4c; Task 7's worst household 248 -> 402 ms, outside the gate set).
  The plan carries `levers` (a copy `{ ...lev }`, never the frozen `PLAN_LEVERS`: it can reach `state.storedPlan`), `orders`
  (the kept candidate's held orders or `null`), `orderPhases` and `splits` (the kept candidate's held splits or `null`); with the
  lever each candidate in the report gains `orders` (a count), `orderPhases` and `splits` (a count) after `intents`, and the
  report gains `keptOrderPhases` and `keptSplits` (a count; toggle off keeps the 4b shapes). Cost with the toggle on: one
  `choose` and up to two subset `apply` runs per bracket, plus up to five `apply` runs at the kept bracket. `cliffPlanSummary`
  adds, after the cliff clauses, one clause from `plan.orders` and one per partner from `plan.splits`, each as runs of
  consecutive ages ("draw traditional before taxable at 60-63, 66; draw Partner A's traditional accounts first at 64-65, 67;
  draw Partner B's traditional accounts first at 62", A's before B's); "no steering" only when the plan has no intents, orders
  or splits.
- **The guarded comparison** (spec 4.3, owner decision 1). When `ctx.inputs.storedPlan` is set (and the guard is on), after the
  automatic selection `computeCliffPlan` runs `apply` on `storedPlan.plan` once (same `ctxFor`, measured like every candidate) and
  asks `storedPlanVerdict(stored, auto)` (`solver.js`; both scores on the stored plan's own `objective`): `'depletes'` if the
  stored plan depletes earlier, else `'home'` if it first draws on the house earlier (null = never = latest), `'better'` if later
  on either, then, with `tol = max(1, 0.001 * |stored.score|)`, `'better'`, `'score'` or `'tie'`. `'better'` and `'tie'` use it:
  the returned `plan` is `storedPlan.plan` itself, else the automatic plan. The report keeps the automatic plan's fields
  (`candidates`, `kept`, `brackets`, `keptBracket`) and gains `stored: { used, reason, depletedAge, homeDrawAge, value, cost,
  bracketHonoured, converts }` (`bracketHonoured`: `plan.bracketFrom === rothConvBracket`; otherwise its intents run at the
  setting; `converts`: `conversionsInPlan(inputs)`, conversions on and a conversion age of Partner A inside the plan); with
  no stored plan the report has no `stored` key. The light render compares with the user's-bracket plan, the deferred pass with
  the searched one (a `lifetimeCost` plan can lose and win again: one switch). `cliffPlanSummary` of a used stored plan starts
  "Applied plan: ", skips the "not used" family clauses and adds " Conversions: the applied plan uses the X% bracket." only when
  the plan converts (`converts`) and the bracket is honoured and differs from `bracketFrom` ("Applied plan: no steering." with no
  intents). Every planning path
  (render, `planForState`, its cache, comparison swaps) gets the winner with no store-layer special case; `storedPlan` is in the
  state's JSON, so the plan keys already cover it. Cost: one `apply` run per planning, only with a stored plan.
- **`optimizePlan(ctx, { objective = 'endValue', levers = PLAN_LEVERS })`** (`src/us/core/optimizer/plan-search.js`; engine,
  context first, no store import). `levers` goes to every search planning (Batch 5 step 4c, A8, and 4d, D10: the order and split
  levers run in the search with the toggle on or off; `{ order: false, split: false }` is the 4b search); candidate 0 stays `plan(inputs)`, the
  automatic plan, which follows the toggle. An applied plan's order years run even with the toggle off, since `apply` reads `plan.orders` regardless. One working copy `{ ...ctx.inputs, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null }`; every
  planning and run gets a `newRunContext` from `ctx`'s fields over it (standard mode, no tax factors). Candidates: `base`, the
  copy's automatic plan (candidate 0); `current`, a valid stored plan run through `apply` on the copy (`inUse` by
  `storedPlanVerdict` on its own objective); the search: from `[1, 1, 1]` (a `rankEvenly` planning, `tieBracket` base's bracket,
  one `offMemo` per call), up to 3 passes over the phases the plan reaches (some A age in `ageA .. ageA + years`), each trying
  every other `MULT_GRID` value per phase and keeping a strict win. Rank (`rankBetter`): nothing earlier than `base` on depletion
  or the first home draw, then later depletion, later home draw, then a score higher by more than `max($1, 0.1% of
  |best.score|)`; in the order base, current, search, a strict win replacing. `gain` (today's dollars, `gainInTodaysDollars`) is
  the winner's `apply` run against what runs today (`current` when in use, else `base`; so a stored plan not in use that wins
  is measured against `base`). `current` also carries `bracketHonoured` and `converts` (as `report.stored` has them). With applied schedules that have keys,
  `legacy` is the original inputs' own planned run (`{ depletedAge, homeDrawAge, score }`, information only). Result: `{ plan,
  mult, objective, measure, base, current, gain, plannings, legacy, winner ('base' | 'current' | 'search'), report, trials }`
  (`report` is the winner's planning's, else base's; `trials` every search planning's `{ mult, measure }`); guard off: `plan:
  null`. The winner's `apply` run reproduces `measure` (a unit test). 14 plannings when nothing wins (base, the `[1, 1, 1]`
  start, 4 per searched phase), more when a pass changes something; trials are not memoized by `mult` (pass 2 repeats pass 1's).
- **The plan card** (`src/us/ui/results/plan-optimizer.js`, replacing the multi-lever card's UI in V140; `optimizeMultiLever` and
  its hooks stay, `tests/solver_gap.js`'s reference): `searchPlan(objective)` runs `optimizePlan(storeRunContext(state))`, then
  the "with" and "without" rates on the working copy through `storeRunContext(copy, { plan, planMode: 'apply' })`,
  `runHistoricalCyclesWith` and `monteCarloSummaryWith(ctx, mcPathCount)`. Apply is offered on a search win that gains more than
  $1 (`applyGateOpen`), lasts longer, or first draws on the house later (also on a win of a stored plan the guard does not use:
  Apply re-stores it under the searched objective; the plan line then describes the stored plan only), and refused when the inputs or the tax year changed since the search
  (`searchedFor`, `'<tax year>|<fingerprint>'`; every render also hides a drawn result's Apply and says "Your inputs changed
  since this search; search again." until the inputs are back to the searched ones). Apply, Clear, the status line and the fingerprint: [inputs-and-ui.md](inputs-and-ui.md). The flat-bracket and
  per-year cards name "the applied plan" when `report.stored.used`.
- **Hooks** (`src/us/ui/install-test-hooks.js`): `__test_optimizePlan(objective)` (the card's search, drawn into the card; a JSON
  copy of the result with `rates`), `__test_applyStoredPlan(result)` (default the card's last search; `false` when refused),
  `__test_clearStoredPlan()`, `__test_planOptimizerCard()` (what the card shows, and `ms`: the last Search's wall time, search and
  rates). The Vitest helper mirrors the search as `usOptimizer(w).optimizePlan(objective)` (`tests/unit/helpers/us-plan.js`, no
  rates or DOM). `tests/solver_gap.js --shipped optimized` reads its shipped column from `__test_optimizePlan`;
  `tests/plan_mult_table.js` prints the lambda table.
- **Step 4b, the gains-capped stay-under (US V141)**: a year over an ACA or IRMAA line only because of investment gains gets a
  stay-under that caps the taxable sale (`takeStockTaxable`, `wd.cappableGain`, `natGain` in `choose`; owner ruling R0 (c), no
  free-money bound), and `planCandidateBetter` never keeps a family that first draws on the house earlier (decision 9). The
  paragraphs it updated are above, in "Per-year solver and the cliff plan" (the primitives, `underEligible`, the keep rule); the
  figures, rulings and follow-ups are in the Batch 5 notes of `docs/next-batches-plan.md` ("Batch 5 step 4b").

## Per-year conversion sizing: the plan's `conv` and `apply` (Batch 5 step 5b piece 3, Task 1; ships off)

Spec `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md` (B0 authoritative, B6), plan
`docs/superpowers/plans/2026-10-27-b5-piece3-conversion-sizing.md`. Task 1 builds the plan's field, the resolver and `apply`;
`choose`'s sizing and the plan search come in later tasks.

- **The switch.** `ctx.test.convSizingOff` (`NO_TEST` false; `storeRunContext` copies `testHooks.testConvSizingOff`, `true` until
  the switch-on commit). With it set, `apply` ignores `plan.conv` and the run is today's byte for byte (C6). A Vitest test turns
  sizing on with `testHooks.testConvSizingOff = false` before `w.ctx()` (or the planning call); a browser test with
  `__test_setConversionSizing(true)` then `__test_refreshCliffPlan()`.
- **`plan.conv`** (the last of `PLAN_KEYS`, default `null`: no sizing) is a map from Partner A's age to a target: `'none'`, a flat
  bracket `'b10'`..`'b35'` (`BRACKET_CANDIDATES`), or exactly `{ id, ret, side }` (keys in that order; `id` in `PLAN_LINE_IDS`,
  `ret` in `PLAN_RETS`, `side` `'under'` | `'over'`). `isValidStoredPlan` checks it (`convOk`); a malformed `conv` drops the stored
  plan, not the state.
- **The resolver** (`src/shared/core/withdrawals/conversion-targets.js`, pure): `resolveConvTarget(target, { lines, preMagi,
  preMagiA, preMagiB, shareA, convertible, bracketTop })` gives `'none'` 0, a bracket `bracketTop(pct)` capped at `convertible`, a
  household line `magi -/+ 1 - preMagi`, a per-return line `(own -/+ 1 - preMagiX) / shareX` (`shareX` is `shareA` for A,
  `1 - shareA` for B); a line not in `lines` (by `id` and `ret`), a return with no share or an amount `<= 0` gives `-1` (not
  carried), else the amount capped at `convertible`. `convLineTargets(lines, lineIds)` lists the line targets a lines list offers
  (`acaFloor` `'over'`, every other id in `lineIds` `'under'`; the US passes `PLAN_LINE_IDS`, so `senior` / `ctc` are not targets, C2).
- **`apply`** (`run-projection.js`): `planConv` is `plan.conv` in `apply` with the switch off. A year's target `convTarget` is set at
  the year's start when `planConv[age]` is set, the year is in the conversion window (enabled, `rothConvStartAge..rothConvEndAge`)
  and the age is not exempt (`convExempt(ctx, age)`: in `ctx.overrides.rothBracketByAge`, `ctx.overrides.rothAmountByAge` or
  `inputs.appliedRothSchedule`; C8). It is phase state, held for the year (no record restores it; nothing goes into
  `scalarSnapshot`); `convFell` is reset at each pass start; `convDone` is declared for `choose` (Task 2). In the conversion block a
  sized pass sets `estUsed`, builds the lines only for a line target (`convLinesAt(preMagi, preA, preB, hi)`: `magiThresholds` with
  `irmaa: { filing, a: medA, b: medB }`, the two-year growth, `lo: preMagi` and `hi`; `apply` passes `hi` Infinity, a choice
  offering candidates inside the reach passes `preMagi + convertible`; the guard's own call
  at the phase end cannot be reused, it reads `inYrA` / `inYrB`, known only after the conversion), and resolves the target with
  `bracketTop = (pct) => solveRothConversionTop(ctx, profile, convertible, year, pct, estTrad)`. On `-1` it converts
  `solveRothConversion` at `min(convertible, magiSafeRoom)` (the bracket conversion under today's ceiling: the user's bracket, or
  the plan's searched one) and sets `convFell`. A line above `preMagi + convertible` is found (no upper bound in `apply`) and the
  resolver caps the conversion at the convertible balance (B6). The fill clamp still
  applies after either branch; a stay-under trial still converts nothing.
- **Counters and the row.** At the kept pass of a year with a target: `planStats.convYears`, and `convApplied` or `convFellBack`
  (`convYears = convApplied + convFellBack`). The row gains `convChoice` (only on such a year's row): `'no conversion
  (tax-aware)'`, `'the top of the 12% bracket'`, `'just under IRMAA tier 2'`, `'just over the ACA credit floor'` (with
  `" (Partner B's return)"` for a per-return line), or `'the bracket conversion (target not reachable this year)'` when the kept pass fell
  back. A per-pass resolution means a year whose early passes carried a line and whose kept pass did not is not bit-identical to
  the unsized year (the conversion is; `tests/unit/us/conversion-apply.test.js` (h)).

### `choose`: the choice at the bracket phase and the sized phase (Task 2; ships off)

- **When.** `choose` with `plan.conv` non-null (the sentinel `{}`) and the switch off (`convChooseOn`), in a year inside the
  conversion window whose age is not exempt (`convChoose`). At the end of the year's first phase (the bracket phase: the natural year
  as today), before the order stage (`trialIdx < 0 && !orderRun && splitRun === 0 && !convDone`), once (`convDone`), when
  `convertsThisYear` and the convertible balance is above 0.
- **Prices**, at the bracket phase's realized draws (`drawTrad = traditionalGross - conversionAmount`, `gain = taxableGainGross`):
  the pre-conversion MAGI in the form of `irmaaAt`'s (`magiBase + drawTrad + gain`, the inherited form with a ledger), each return's
  from `returnMagis`; `tax(c) = taxFor(ctx, profile, gain, drawTrad + c)` with `profile.conv = c` and `profile.medicalExpense` at
  `premium(c)` (both restored from the saved doubles); `premium(c) = costAt(drawTrad + c, gain, pairA, pairB, inhRealA, inhRealB)`;
  `irmaa(c) = irmaaAt(...)` with the same pair. Year 0 without `irmaaPriorKnown`: `seStand0` around each `costAt`, then the year-0
  history doubles restored. The PA / RI 401(k) conversion fractions are not re-derived per candidate (C7).
- **Candidates:** the bracket target (target `null`, the phase's own `conversionAmount`), `'none'`, `'b10'`..`'b35'` at distinct
  amounts (`solveRothConversionTop` with the realized `drawTrad` below), one per `convLineTargets` entry over the lines
  `convLinesAt(preM, preA, preB, preM + convertible)` that resolves above 0, and `{ id: 'medicaid', ret, side: 'over' }` when the
  premium plus IRMAA just over the Medicaid line is lower than just under it (`yearPlanCandidates`' floor reading). Score:
  `convScore(c, lambda, dTax, dPremium, dIrmaa)` against `c = 0`, `lambda` the year's held `lambdaOf().lambda` (computed from the bracket
  phase). Scan order: a stable sort by amount (the bracket target first at an equal amount, 0 included); `pickConvTarget` (the
  running best replaced only by more than $1, dropped candidates skipped).
- **The bridge (B0.7):** while a living partner is under 59.5 next year, a candidate above the bracket conversion is dropped when
  `bridgeShort({ accessible, extra: c - bracketConv, freeTradShare, taxIncrease, early })`: `accessible =
  penaltyFreeMoney(wd, status)` (`status` is `wd.status` in a draw year, else `accountStatuses` into a local; `wd` is not written),
  `freeTradShare` the penalty-free share of the traditional pool, `taxIncrease` the candidate's tax + premium + IRMAA less the
  bracket target's, `{ early, late } = bridgeNeed(ctx, ...)` (this year's `reserveSpend` less `benefitIncomeAt` with wages to the run's
  retirement ages, years `year+1..year+4` and after, to the youngest living partner's 59.5; C4, C7). The early years only
  (controller ruling): short when `accessible - extra x freeTradShare - taxIncrease < early`. `late` is traced, not tested: each extra
  converted dollar adds a dollar of access from year + 5 for less than a dollar of tax, so a total-need test only gets easier as the
  conversion grows; the drain risk is the years before it seasons. The check is monotone in the amount.
- **Near ties** (controller ruling): a target other than the bracket's whose amount is within $1 of the bracket conversion is not
  offered (`convOffered`), so the bracket stands with no intent and no sized phase.
- **The winner.** The bracket target: the year goes on as today. Any other: `convTarget` is set (constant for the year), recorded in
  `convIntents[age]`, and the year re-runs as the **sized phase** from the year's start seeds (`prevDiscTraditional`, ..., `estShareA
  = 0`; `seHeld`, `seKind`, `forcedPass`, `phaseUnresolved`, `passLog`, `phasePass` reset), so `apply` with `plan.conv[age]` (its first
  phase sized) reproduces it pass for pass. Its end builds the natural record and runs the order, split and trial stages: a `'none'`
  winner lets the order and split stages run, a converting one does not. The run returns `cliffConvIntents` (non-enumerable, choose
  with sizing only). Test-only: `planTr.conv = { candidates: [{ target, c, score, dropped, total }], winner, bracketConv, lambda,
  bridge }` (allocated only in a sized year).
