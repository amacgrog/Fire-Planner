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
  stock-account taxable sale (through `takeStockTaxable`) except the live mix's sale, the bucket strategy's bond refill
  (`refillBondReserve`) and `releaseMagiCap`'s sale (made with the cap lifted). The ladder gain, the bond reserve's sales and
  early Roth earnings still raise MAGI too, so it is not a hard MAGI guarantee. `releaseMagiCap` runs before penalized money
  and home equity: it lifts the cap and draws the taxable, then the traditional, the cap held back.
  `cappableTraditional` is the traditional drawn that a cap could limit: `takeTraditional` with
  `penalized === false && uncapped === false`, and the live-mix draw of `drawMixedStockAccounts`. A new traditional draw path
  that honours `magiCapLeft` must add to it, or the plan never offers a stay-under for that mode.
  `cappableGain` (a `newWithdrawal` field, 0 per pass) is its counterpart for gains: the gain of the pass's `takeStockTaxable`
  sales. `takeStockTaxable(wd, amount)` (`withdrawals/draws.js`) is `takeTaxableCapped(wd, 'taxable', amount, magiCapLeft(wd))`
  under a cap that is not off and `takeTaxable(wd, 'taxable', amount)` otherwise (so the plan-off run is unchanged), and adds
  the sale's gain. Its callers are the explicit mix's and the smoothing's taxable shares, `mixFallthrough`, `withdrawStandard`'s
  default sale and `BUCKET_STEP.taxable`. Not counted: the live mix's sale, the bond refill and `releaseMagiCap`'s sale (as
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
  (`planCandidateBetter`: it decides through the shared `objectiveBetter` (later depletion, then the measure's `score` by more than $1: the after-tax end value unless `objective` says otherwise, step 4a), then fewer intents; each candidate's `value` and `cost` are read from the objective registry, `US_OBJECTIVES.endValue` and `lifetimeCost` in `src/us/core/optimizer/objectives.js`, which the plan names explicitly);
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
  stored key, state object and `cliffPlanCache`; `__test_cliffPlanState()` reads `{ bracket, bracketFrom, searched, searchPending }`
  without refreshing; `__test_rothOptimizerCard()` returns the flat-bracket card's rows (`computeRothOptimizer`); and
  `__test_cliffPlanComputes()` counts the plans of `refreshCliffPlan` (`cliffPlanStore.computes`) and
  `__test_planForStateComputes()` those `planForState` computes itself (`cliffPlanStore.stateComputes`);
  benchmarks use `__test_simulateRaw` / `__test_simulateHistoricalRaw` after one refresh; `__test_runPlanMode`,
  `__test_refreshCliffPlan`, `__test_setCliffPlan`, `__test_planForState`, `__test_replaceState`,
  `__test_scenarioMetrics`, `__test_planStats` (the plan-mode hooks build their context with `storeContext({ plan, planMode, taxFactors })`;
  `tests/unit/helpers/us-plan.js` mirrors them); `window.__test_planTrace(rowFn)` returns the `choose` trace (each
  year's candidates, `movedSample`, `lambdaNeed` (the need passed to `lambdaEstimate`, null when lambda was not computed),
  the intent, and in a `choose` year with lines `natTrad` / `natGain`, what `underEligible` read; `tests/se_health.js`'s
  identity hash deletes them), or with `rowFn` the `apply` trace on that path. `planStats` counts
  what `apply` did (intentYears, applied, skippedSide, skippedIneligible, fallback, absent, rothShift, irmaaStayUnders,
  irmaaZeroSaving; cumulative, scans read deltas). `magiStats.planMissed` counts plan years (choose / apply) whose
  final realized MAGI missed the plan's target (an invariant guard: a plan wins only when it met its line). Rows carry `cliffChoice` ("stayed under ..." / "filled to ...") only
  in a year where the plan was carried out; `annotateSolverRows` (US, after the shared `renderTable`) puts it in the
  status cell's tooltip. State-law cliffs and the senior / CTC lines are priced by `taxFor` but are not candidates.
  The `wd` fields `taxAwareOrder` / `onlyPartner` are wired but unused (Batch 5: the tax-aware order, the two-return draw
  split and conversion sizing, as plan intents); the live-mix toggle still runs `pickLiveWithdrawalOrder` per path.
  Tests: `tests/cliff_plan.js`, `tests/cliff_guard.js`, `tests/end_value_us.js`, `tests/solver_hooks.js`,
  `tests/solver_primitives.js` (in `npm test`); `tests/plan_off_anchor.js --base DIR`, `tests/bench_solver.js --base DIR`,
  `tests/solver_scan.js`, `tests/solver_gap.js`, `tests/plan_mult_table.js` (not in `npm test`).

## The stored plan and Optimize (Batch 5 step 4a, US V140)

Spec `docs/superpowers/specs/2026-10-25-b5-stored-plan-design.md` (sections 4.1-4.7), plan
`docs/superpowers/plans/2026-10-25-b5-stored-plan-4a.md`; figures in the Batch 5 notes of `docs/next-batches-plan.md` ("Batch 5
step 4a").

- **One plan shape** (`src/us/core/cliff-plan/plan-shape.js`). `makePlan(fields)` returns a plan with every key of `PLAN_KEYS`
  in this order: `intents, family, bracket, bracketFrom, orders, splits, levers, mult, orderPhases` (defaults `{}`, `'none'`, then
  `null`; an unknown field throws), so every plan the engine sees (computed, held for a bracket, stored) has one hidden class
  (`solveRothConversion` reads `plan.bracket`, `apply` reads `plan.intents[age]` every year). `orders`, `splits`, `levers` and
  `orderPhases` are `null` in 4a (4c and 4d fill them). The module also holds `PLAN_LINE_IDS` (the line ids an intent can
  name), `PLAN_FAMILIES`, `PLAN_RETS`, `PLAN_KINDS`, `BRACKET_CANDIDATES` (moved here, re-exported by `run-projection.js`),
  `MULT_GRID` (`[0, 0.5, 1, 1.5, 2]`), `phaseOf(ctx, age)` and the stored plan's guard (`STORED_PLAN_KEYS`,
  `STORED_OBJECTIVE_IDS`, `isValidStoredPlan`; [inputs-and-ui.md](inputs-and-ui.md)). `select(null)` (the user's bracket with no
  `mult`) still passes `null` as the plan: today's runs, byte for byte.
- **`mult`, the per-phase lambda multiplier.** `plan.mult` is `[m1, m2, m3]` or `null` (= `[1, 1, 1]`), by Partner A's age:
  `phaseOf` is 0 before 65, 1 from 65 until A's `rmdStartAge`, 2 from it. In `choose` only, `lambdaOf` passes the year's
  multiplier to `lambdaEstimate`, which returns `lambda = (SOLVER_LAMBDA_MULT * mult * rateSum) / 3` (exact for 1; `tauGain` is
  not multiplied; `LAMBDA_MAX` still clamps); `apply` and `off` never read it. The trace records the year's `lambda`
  (`planTr.lambda`, trace only; `tests/se_health.js`'s identity hash deletes it before hashing). `computeCliffPlan(ctx, { mult })`
  with a `mult` other than all ones runs every `choose` with it (the user's bracket's as `makePlan({ bracket: from, bracketFrom:
  from, mult })`) and returns a plan carrying it; `null` or `[1, 1, 1]` is today's plan.
- **`computeCliffPlan(ctx, { search = true, mult = null, objective = 'endValue', rankEvenly = false, tieBracket = null, offMemo =
  null })`.** `objective` is a registry id (`objectiveById`; an unknown id throws): each measure gains `score` (its last key),
  the value for `endValue`, `cost === 0 ? 0 : -cost` for `lifetimeCost` (never `-0`), and `planCandidateBetter` /
  `bracketCandidateBetter` compare `score` (for `endValue` the value: unchanged). `rankEvenly` keeps the bracket by
  `bracketEvenBest(brackets, tieBracket)` (`solver.js`) over every bracket's best instead of the strict-win chaining from the
  user's bracket: the latest depletion, then the latest first home draw, then the top score, where every bracket within
  `max($1, 0.1% of |top|)` (inclusive) ties and the tie goes to `tieBracket` when it is among them, else to the lowest bracket
  (the kept bracket no longer depends on the setting: 3a's follow-up, spec decision 6). `offMemo` is a caller-owned `Map` keyed
  by bracket holding each bracket's `off` measure (it depends on neither `mult` nor the ranking); it is valid for one working copy
  of the inputs and one objective (the stored `score` is the objective's), and a kept `none` family's `intents` can be the memo's
  shared `{}` (never mutate a returned plan). `report.candidates` carry no `score`. The defaults give today's plan.
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
- **`optimizePlan(ctx, { objective = 'endValue' })`** (`src/us/core/optimizer/plan-search.js`; engine, context first, no store
  import). One working copy `{ ...ctx.inputs, storedPlan: null, appliedRothSchedule: null, appliedMixSchedule: null }`; every
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
