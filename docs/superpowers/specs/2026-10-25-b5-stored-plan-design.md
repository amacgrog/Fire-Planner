# Batch 5 step 4: the stored plan, Optimize -> Apply, and the withdrawal levers (US)

Status: design, for the owner's approval. Base `a12c64c` (origin/main, PR #49, US V139). Branch `claude/b5-stored-plan-b3568e`.
Canada is untouched (Batch 4B ports what lands here). No implementation plan exists yet: one plan per sub-step, written after
this spec is approved, 4a first.

Read with: `docs/next-batches-plan.md` "Batch 5: optimizer" (the "Re-scoped by the cliff plan" block wins where texts conflict)
and its Batch 5 notes (steps 0, 2, 2b, 3a); `docs/superpowers/specs/2026-10-07-cliff-plan-design.md` (sections 3, 5, 6, 10);
`docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md` (Part A built; Part B shelved);
`docs/superpowers/specs/2026-10-23-b5-objective-registry-design.md`; `docs/architecture/cliff-plan.md`.

## 1. Intent

The cliff plan is chosen once on the deterministic projection and applied unchanged in historical and Monte Carlo runs. Step 4
finishes that design for the US:
- **A plan the user can keep.** Optimize -> Apply runs a deeper search and stores a plan of the cliff plan's shape in `state`.
  What the card reports is what Apply delivers (step 0, reading 4: today's trials reuse the user's plan while Apply re-plans,
  so the reported gain is not the delivered one).
- **The levers the gap points at.** After 3a the gap to the 3-lever reference is TX 9.7% / 4.7% (life 100 / 75), CA 1.5% /
  4.5%, NY 0 / 1.3%; with the reference limited to the Roth lever it is at most 0.6%. The rest is the withdrawal mix and
  smoothing. TX's share is mostly ACA years where taxable gains carry MAGI over the 400% line, which no stay-under can cap
  today (`underEligible` needs cappable traditional).
- **The last per-path choice goes.** `pickLiveWithdrawalOrder` (the live-mix toggle) chooses each year on each path from that
  path's own tax. It becomes plan intents, chosen on the deterministic run and judged by whole-run evaluation.

Calculations correct before UI polish (owner): the UI changes only where the change needs it.

## 2. Owner decisions (2026-10-25)

1. **The stored plan is a guarded candidate, not an unconditional override.** Every planning (full and light render,
   `planForState`) computes the automatic plan as today and, when `state.storedPlan` is set, runs the stored plan once through
   `apply` and keeps the better of the two by Rule A on the current inputs (section 4.3). With the inputs it was made for the
   stored plan wins by construction. After an edit, if it loses, the automatic plan runs and the card says so; the stored plan
   stays saved (undoing the edit brings it back). The staleness flag ("computed for different inputs") is display.
2. **Where the levers run.** The stock-account order and the two-return split are plan intents recorded by `choose` and
   followed literally by `apply`. They run (a) in the automatic plan only when the live-mix toggle (`withdrawalMixEnabled`)
   is on: that is the toggle's new meaning, default off, so no default household moves; and (b) in Optimize, toggle on or off.
   `pickLiveWithdrawalOrder` and the dead `remainingMagiRoom` wiring are removed.
3. **The gains-capped stay-under is in scope**, as its own sub-step (4b): a year whose MAGI excess over a line comes from
   taxable gains is eligible for a stay-under when MAGI-free money (cash, penalty-free Roth) can cover the rest. A cliff-plan
   change, so it applies to every guard-on household, not behind the toggle.
4. **The new plan card replaces the multi-lever card** in the UI in step 4. `optimizeMultiLever` stays in the code, behind
   its test hooks, as the measuring reference for `tests/solver_gap.js` and `tests/bench_optimizer.js` until step 5. Saved
   `appliedRothSchedule` / `appliedMixSchedule` keep working unchanged and stay clearable; step 5 migrates or retires them.
   The flat-bracket and per-year Roth cards stay as they are (step 5 decides them).
5. **Lambda's accuracy is measured in step 4 and fixed in step 5.** No estimator change here (it would move every guard-on
   plan and confound the levers' movers). Step 4's notes record the per-phase multiplier Optimize chooses, crossed with
   `movedSample` years and the gain over `m = 1` (section 9).
6. **3a's follow-ups:** the flat-bracket card's ranking, step 5; the kept bracket depending on the starting bracket, fixed in
   Optimize only (it ranks all six brackets evenly; the automatic plan keeps today's strict-win rule); an applied schedule past
   the 30-year cap, step 5; `planForState` ignoring override maps, left and documented (the new Optimize builds plans, not
   override maps); `rothConvBracket` gains a `normalizeState` guard in 4a (an existing gap, fixed here by the owner's leave).
7. **The objective choice** is a two-option selector on the plan card (after-tax end value, the default; lifetime tax +
   healthcare), saved inside the stored plan, not a household input. The automatic plan keeps ranking by the end value. The
   guarded comparison (decision 1) ranks by the stored plan's own objective after Rule A's depletion and home-draw tests.
8. **Four PRs, in order:** 4a the stored plan and Apply; 4b the gains-capped stay-under; 4c the stock-account order; 4d the
   two-return split (section 3). A later PR that moves US snapshots or the badge merges main and regenerates; it never
   hand-merges hashes.

## 3. Sub-steps

| Sub-step | Contents | Snapshot expectation |
|---|---|---|
| 4a | The stored plan (shape, guard, legacy cases), the guarded candidate, Optimize with per-phase multipliers and even bracket ranking, the objective selector, the plan card (replacing the multi-lever card) with with/without success rates, the `rothConvBracket` guard, the lambda measurement | Engine snapshots byte-identical (no scenario carries a stored plan); `snapshot_ui` moves only where the card's markup changed, explained |
| 4b | The gains-capped stay-under (section 6) | Guard-on movers near a line; standard: none depletes or first draws on the house earlier; historical explained by cause |
| 4c | `order` intents; `pickLiveWithdrawalOrder` and `remainingMagiRoom` removed (section 7) | Toggle-on scenarios only |
| 4d | `split` intents, `drawSplit` (section 8) | Toggle-on two-return scenarios only |

Order: 4a first (the levers need a home, and Optimize is the tool every later step measures with); 4b before 4c (the largest
expected gain, and the order lever's 768-household acceptance should be measured on a baseline that will not move again); 4d
last (it reuses 4c's intent plumbing). Each sub-step bumps the US badge and updates README, `cliff-plan.md` and the Batch 5
notes in its own PR.

## 4. Part 4a: the stored plan and Optimize -> Apply

### 4.1 The plan shape

The cliff plan today is `{ intents, family, bracket, bracketFrom }`. Step 4's plan, for both the automatic and the stored plan:

```
{ intents: { [Partner A age]: { kind: 'under' | 'fill', line, ret } },   // unchanged
  family,                     // 'all' | 'aca' | 'irmaa' | 'none' (4c adds order subsets, section 7.3)
  bracket, bracketFrom,       // unchanged (3a)
  orders: { [age]: 'traditional' } | null,   // 4c; absent age = today's default order
  splits: { [age]: 'A' | 'B' } | null,       // 4d; absent age = pro rata
  levers: { order: bool, split: bool } }     // read by choose only: which lever trials to run
```
- `orders` / `splits` / `levers` are part of the shape from 4a (null / false), so 4c and 4d add no context shape change on the
  hot path (one context shape, CLAUDE.md). `apply` ignores `levers`. 4c adds one field, `orderPhases` (section 7.3), and the
  `normalizeState` guard's lists grow with it in 4c.
- `mult: [m1, m2, m3]` (section 4.5) rides on the plan object `choose` receives; absent means `[1, 1, 1]`.
- The plan object itself is plain data; `ctx.plan` carries it as today.

The stored plan in `state`:
```
state.storedPlan = null | {
  v: 1,
  plan: <the shape above>,
  objective: 'endValue' | 'lifetimeCost',
  mult: [m1, m2, m3],         // the per-phase multipliers Optimize chose (display and the step 5 measurement only)
  madeFor: string,            // fnv1a32 hash of the inputs it was made for (section 4.4)
  taxYear: number,            // the tax year it was made under
  summary: { gain, success: { hist: [with, without], mc: [with, without] } }   // what the card showed at Apply
}
```
`defaults.storedPlan = null`. One `FIELDS` entry is not enough for a nested object: the guard lives in `normalizeState`
beside the applied schedules' `sanitizeSchedule`.

### 4.2 The `normalizeState` guard and legacy cases

- Anything not matching the shape exactly drops the **whole** stored plan to `null` (never a partial plan): wrong `v`;
  `intents` ages not integers in 0-120 or values outside `kind` / the line ids `magiThresholds` can return (`medicaid`,
  `acaFloor`, `aca400`, `irmaa1`-`irmaa5`) / `ret` in `H`, `A`, `B`; `family` outside its set; `bracket` / `bracketFrom` not
  in `BRACKET_CANDIDATES`; `orders` values other than `'traditional'`; `splits` values other than `'A'` / `'B'`; `objective`
  not a registry id; `mult` not three finite numbers from the grid (section 4.5); `levers` not two booleans; `orders` /
  `splits` not null or an object; `madeFor` not a string; `taxYear` not an integer; `summary` not its shape with finite
  numbers. Ages are JSON string keys: a key is valid when `String(Number(key)) === key` and the number is an integer in 0-120.
  Dropping is safe: the automatic plan runs.
  The allowed lists are duplicated in `normalize-state.js` as the schedule lists are (it runs before the engine constants
  load), with a test that they equal the engine's.
- Legacy saves: no `storedPlan` key -> `null`; `appliedRothSchedule` / `appliedMixSchedule` unchanged (decision 4).
- `rothConvBracket` gains `values: [10, 12, 22, 24, 32, 35]`, `fallback: 22` (the default in `defaults.js` and the
  `<select>`; a numeric string falls back to 22, as for every `values` field) (decision 6).
- `tests/legacy_state.js` gains: a save with no key, a malformed stored plan of each kind, a valid one round-tripping
  unchanged, a bad `rothConvBracket`.

### 4.3 The guarded candidate (decision 1)

Inside `computeCliffPlan(ctx, opts)` (engine, pure: it reads `ctx.inputs.storedPlan`), after the automatic plan is chosen:
1. No stored plan, or the guard off: unchanged.
2. Otherwise run `apply` on `storedPlan.plan` once (standard mode, the same `ctxFor`), measure it as every candidate is
   measured, and compare with the automatic plan's best:
   - `storedPlanBetterOrEqual(stored, auto, objective)`: the stored plan is used unless it depletes earlier or first draws on
     home equity earlier than the automatic plan, or, both equal, the automatic plan scores higher on the stored plan's
     `objective` by more than `max($1, 0.1% of |score|)`. A tie keeps the stored plan (the user's applied choice).
   - The report gains `stored: { used: bool, reason: 'better' | 'tie' | 'depletes' | 'home' | 'score', depletedAge,
     homeDrawAge, value, cost }`.
3. The returned `plan` is the winner. Everything downstream (`planForState`, the cache, historical and Monte Carlo runs,
   variants) sees only the winner, unchanged.
4. **The report and the summary describe the winner.** When the stored plan is used, `cliffPlanSummary` reads the stored
   plan (its intents, its bracket) and says "Applied plan:" instead of "Cliff plan:"; the automatic plan's `candidates`,
   `kept` and `brackets` stay in the report under `auto` for the card, and the summary's "not used" family clauses and the
   bracket clause are not printed for a plan that is not running.
5. The comparison run adds to `ctx.stats.plan` (`intentYears`, `applied`, `fallback`, ...) like any planning run; tests that
   read `planStats` deltas around a planning see it.

Light and full renders both compare (the light render against the user's-bracket automatic plan, the deferred pass against the
searched one), so the dashboard never runs a plan that lost on the current inputs. "Wins by construction" holds against the
searched automatic plan; in the light pass a stored plan can lose (for example a `lifetimeCost` plan against the
user's-bracket plan on `home` or `score`, since `planCandidateBetter` does not read `homeDrawAge`) and win again after the
deferred pass: one switch, expected (builder's call 3). Cost: one `apply` projection (about 1-5 ms) per planning, only for
states that carry a stored plan. Because `storedPlan` is in `state`, `JSON.stringify(state)` (`cliffPlanStore.key` and the
`cliffPlanCache` key) already covers it: no cache change.

**The bracket setting after Apply.** `apply` honours `plan.bracket` only while `plan.bracketFrom === rothConvBracket`
(`solveRothConversion`). After the user changes the bracket setting, the stored plan's intents run at the new setting (the plan
is then stale and still guarded); an override map or an applied per-year Roth schedule still wins over the plan's bracket. The
card states the first case ("Your conversion bracket changed since this plan was applied; it now converts at your X%").

**The Monte Carlo seed.** `monteCarloSeed` (`src/shared/core/projection/simulate.js`) hashes every input except the two
dismissal lists. `storedPlan` joins the excluded keys, so Apply does not change the dashboard's Monte Carlo paths and the
card's "with" rate is the rate the dashboard shows after Apply. Canada never has the key, so its seed is byte-identical.

With the guard off (`cliffGuardEnabled: false`) the stored plan is not applied (no plan is), and the card says so.

### 4.4 Staleness (display)

`madeFor` is the `fnv1a32` hash (already in `simulate.js`) of `JSON.stringify` of the normalized state with `storedPlan`,
`dismissedEstimates` and `dismissedUnusualAssumptions` removed, taken after Apply has cleared any legacy schedules (a hash, not
the string: storing the state's JSON inside the state would double every `JSON.stringify(state)` on the render path). Stale
when the hash differs from the current state's or `taxYear` differs from `currentYear`. Computed in the store layer (the card), never in the engine. The card's states:
- fresh, used: "Applied plan in use."
- stale, used: "Applied plan in use. It was computed for different inputs; it still beats the automatic plan on these inputs.
  Re-run Optimize to refine it."
- stale, not used: "Your applied plan was computed for different inputs and no longer beats the automatic plan, which is in
  use. Re-run Optimize." (with the reason: runs out earlier / draws on the house earlier / scores lower)
- guard off: "The cliff plan is off, so the applied plan is not used."
A "Clear applied plan" button (undo snapshot, `render()`, `saveInputs()`).

### 4.5 Optimize (the deep search)

A new engine function `optimizePlan(ctx, { objective, levers })` in `src/us/core/optimizer/plan-search.js` (context first; no
store import; registered in the module map). It returns the best plan found and its measures, never a run. It does not take a
`contextFor` factory: like `computeCliffPlan`'s `ctxFor`, it builds every run's context with `newRunContext` from `ctx`'s
fields over one working copy of the inputs, `{ ...ctx.inputs, storedPlan: null, appliedRothSchedule: null,
appliedMixSchedule: null }` (a shallow copy, never normalized). Stripping `storedPlan` keeps each candidate's
`computeCliffPlan` from running the guarded comparison (candidate 0 would otherwise be the better of the stored and automatic
plans, and the gain's baseline would be muddled).

**Candidates.** A candidate is a full planning, `computeCliffPlan` with new options:
- `mult: [m1, m2, m3]`, the lambda multiplier per phase by Partner A's age: before 65; 65 up to the year before A's RMD start
  age (`rmdStartAge`); RMD years. `lambdaEstimate`'s `lambda` is multiplied by the year's phase multiplier where it reads
  `SOLVER_LAMBDA_MULT` (`(SOLVER_LAMBDA_MULT * m * rateSum) / 3`, exact for `m = 1`); `tauGain` is not multiplied. The
  multiplier reaches `choose` on `ctx.plan`. For the user's bracket, `select(null)` runs `choose` and `off` with no plan
  today; with a `mult` other than `[1, 1, 1]` it passes `{ intents: {}, family: 'none', bracket: from, bracketFrom: from,
  mult }` instead (equivalent: `solveRothConversion` resolves `bracket === from` to the setting), and with `[1, 1, 1]` it
  stays `null`, so the automatic plan is byte-identical. No new context field, no new module mutable; `apply` never reads it.
- The `off` candidate of each bracket does not depend on `mult` (nor on `levers`): it is computed once per bracket and reused
  across the search's plannings (the main lever for the cost target; about 24 runs per planning otherwise).
- `levers: { order, split }` (4c / 4d; false in 4a).
- `rankEvenly: true`: the bracket search ranks the six brackets with no preference for the setting: Rule A's depletion and
  home-draw tests, then the objective by more than `max($1, 0.1%)`, ties to the automatic plan's kept bracket (decision 6).
- `objective`: the registry id the selection ranks by (`planCandidateBetter` and the bracket rank read it instead of the
  hard-coded `endValue`; the automatic plan passes `endValue`, so it is unchanged).

**Search.** Deterministic coordinate search over the three multipliers on the grid `[0, 0.5, 1, 1.5, 2]`, starting from
`[1, 1, 1]`: each pass tries every other grid value of each phase in turn, keeps a strict win, stops after a pass with no
change or 3 passes. About 13-37 plannings. The automatic plan (the current inputs' own plan, `[1, 1, 1]`, today's bracket rule)
is candidate 0, so the result is never worse than it on the standard projection (the 3C redesign's item 2, "always
applicable"). When the state already carries a stored plan, that plan (run through `apply` on the working copy) is also a
candidate, so re-running Optimize never proposes replacing a better plan in use; the card's gain is measured against what
runs today (the guarded winner). Ranking between candidates: Rule A (no earlier depletion, no earlier first home draw than
candidate 0, then later depletion / later home draw), then the objective. A phase the plan never reaches (no year in it) is not
searched.

**Scored as Apply runs it.** A candidate's measure is the run of its own plan (`choose`'s run, which `apply` reproduces
exactly, pinned by the existing replay test), so the gain the card shows is the gain Apply delivers. The final winner is
re-run through `apply` once and its measure checked equal to the search's (an assertion in the unit test, not a runtime
check).

**Legacy schedules.** If `appliedRothSchedule` or `appliedMixSchedule` has keys, the search runs on the working copy without
them and Rule A ranks against candidate 0 (the copy's automatic plan) only, so the winner always passes the guarded comparison
right after Apply. The current run with the schedules is reported beside it as information (its depletion, home draw and
objective value), and Apply clears them (one undo snapshot). The card says "Applying replaces your applied conversion /
withdrawal schedule", and, when the with-schedules run lasts longer or draws on the house later than the found plan, says so
before the Apply button.

**Cost target.** At most 10 s on the three gap households at life 100 (the multi-lever search took 8-31 s); recorded in the
notes, not a CI gate. The button yields a frame before the synchronous search, as the multi-lever button does today.

### 4.6 The plan card (replaces the multi-lever card)

In the multi-lever card's place (`#multiLeverOptimizerCard` markup in `src/us/index.html`, controls in
`src/us/ui/results/roth-optimizer-controls.js` and `roth-optimizer.js`): a "Plan optimizer" card.
- The objective selector (two radio buttons, default end value), the Search button, then the result: the gain in the
  objective's units (today's dollars), the plan in words (the cliff-plan summary of the stored plan, the per-phase
  multipliers as "conversion and steering tilt: before 65 / 65-RMD / RMD years"), and the historical and Monte Carlo success
  rates with and without the plan (with: the found plan; without: the automatic plan). Today `runHistoricalCycles()` and
  `monteCarloSummary(pathCount)` (`simulate.js`) take no context: they build `storeContext()` from `state`, plan through
  `planForState`, and `runMonteCarlo` seeds from `state`. 4a adds context-taking entry points beside them,
  `runHistoricalCyclesWith(ctx)` and `monteCarloSummaryWith(ctx, pathCount)`, seeded from the base inputs (the seed excludes
  `storedPlan`), with cache keys that include `ctx.plan`; the existing functions become thin wrappers with unchanged results.
  Never a state swap.
- "Apply this plan" writes `state.storedPlan` (a new sanctioned write: CLAUDE.md's "State and the sanctioned writes" list gains
  the module), then `render()` and `saveInputs()`, with an undo snapshot. When the search found nothing better than the
  automatic plan (gain at most $1, `applyGateOpen`), no Apply button: "The automatic plan is already the best this search
  found."
- The applied status line (section 4.4) and Clear; the legacy schedules' status and Clear buttons stay while they exist.
- Wording from the code: "searches for a tax-efficient plan; a better one may exist".
- The multi-lever card's markup and its UI wiring are removed; `optimizeMultiLever`, `optimizeRothLadderPerYear` and their
  test hooks stay. `test_apply_optimizer_schedule.js` and `test_optimizer_ui.js` move to the new card or to the hooks (the
  builder decides per check, keeping coverage of the legacy schedules' apply-and-clear through hooks).
- MCP: no new tool (the stored plan is not an MCP input in this step); `storedPlan` is not in `FIELDS`' MCP list.

### 4.7 4a acceptance

- `npm test`, `npm run test:ui` green; engine snapshots byte-identical; `snapshot_ui` movers only from the card markup.
- Vitest: the guard (every malformed kind drops the whole plan; the lists equal the engine's); `computeCliffPlan` with a stored
  plan: equal inputs -> used, `reason: 'tie'`; an edit that makes it deplete earlier -> not used, `depletes`; the same for the
  home draw and the score; the objective read from the stored plan; `mult: [1, 1, 1]` byte-identical to no `mult` on the gap
  households and a converting household; `optimizePlan` never worse than candidate 0 and its winner equal through `apply`;
  the Monte Carlo seed unchanged by adding a stored plan; `runHistoricalCyclesWith` / `monteCarloSummaryWith` on the store's
  context equal today's `runHistoricalCycles` / `monteCarloSummary` exactly; the summary line names the stored plan when it is
  used.
- Playwright (`test_plan_optimizer.js`): search, apply, the card's four states, clear, undo, save/reload round trip, a stale
  plan still used and one not used (dashboard rows equal the automatic plan's), the 390-px mobile check.
- Re-measure `tests/solver_gap.js --objective endValue` with the shipped column read from Optimize's plan (a new
  `--shipped optimized` option; the default stays the automatic plan), both lengths; record the gap closed by the multipliers
  alone.
- Timing: the per-render gates unchanged for states without a stored plan (`bench_runs_interleaved.js` +5%); with a stored plan,
  planning time within the 150 ms of 3a's gate.

## 5. Shared rules for the levers (4b-4d)

- **Chosen on the deterministic run, followed literally on every path** (cliff-plan spec section 6): `apply` builds and checks
  exactly what `choose` did; no lambda, no score, no per-path choice. `apply(choose's plan)` reproduces `choose` on every row
  field (the replay test extends to each lever).
- **Kept only by whole-run evaluation:** each lever's intents form subsets that the keep rule (Rule A, then the objective)
  compares with the plan without them, as the ACA / IRMAA family subsets are today.
- **Gates** (owner, step 3 decision 5): no standard snapshot scenario depletes or first draws on home equity earlier (hard);
  historical movers explained by cause (`tests/hist_depletion_cause.js`); a bridge drain stops for the owner. Timing within the
  existing gates (`bench_runs_interleaved.js` +5% per path, `bench_solver.js` +30%, planning 150 ms).
- **MAGI-iteration rules:** anything a lever mutates in a year body is in the snapshot / restored at the pass start (as
  `ownerShareA0` is today); a new per-phase variable joins the cliff plan's carries (`naturalRec`, `trialRecs`, the replays).

## 6. Part 4b: the gains-capped stay-under

**Eligibility** (`underEligible`, used by both `choose` and `apply`): today `natTrad > 0 && natMagi - natConv > line && line - 1
>= lo`. New: the first term becomes `natTrad > 0 || (t.ret === 'H' && natGain > 0 && natFree >= natGain)`, where:
- `natGain` is a new `wd.cappableGain` counter beside `cappableTraditional`: the gain realized by the stock-account taxable sale
  only (not `taxableGainGross`, which also holds `ladderGain` and bond-reserve gains that no cap limits);
- `natFree` is the MAGI-free money left after the natural year's draws, read where `natOf` reads (after the natural year has
  converged): cash plus penalty-free Roth, through the draw primitives (`rothFreeCaps(wd, 'roth')` summed when
  `wd.penaltyAware`, else `bal.roth`), so `choose` and `apply` read the same figure;
- `natFree >= natGain` is a cheap bound on "MAGI-free money can replace the gain the cap would hold back" (a sale of `g` of gain
  frees at most its gross; requiring the free money to cover at least the gain keeps trials to years that can plausibly meet the
  line, for the `bench_solver.js` +30% gate). The builder may tighten it if the scan shows many trials that fail `met`.
- Household lines only (`ret === 'H'`): in two-return years per-return lines are translated with the traditional share
  (`toHousehold`) while gains split half and half (`returnMagis`), so a gains-capped stay-under on an A / B line would be
  mistranslated. Two-return gains-capped stay-unders are left out, recorded.
The natural year's record carries both (`natOf`).

**The trial.** Under a stay-under cap, every stock-account taxable sale is capped at the room left (`takeTaxableCapped`, built
in 2b), not only the mix fallthrough's: the default order's sale (`withdrawStandard`), the smoothing branch's taxable share
(`drawMixedStockAccounts`), an explicit mix's taxable share, and the bucket strategy's `stocks` and `taxable` steps
(`BUCKET_STEP`). Those sales add to `cappableGain`. The rest of the need comes, in the existing order of each strategy, from
Roth and cash (MAGI-free) and then the bond reserve; `releaseMagiCap` still draws what the cap held back before penalized money,
inherited money and home equity, so the year never goes short. A stay-under converts nothing (unchanged). The win rule is
unchanged (met its line, no unmet need, premium plus IRMAA cut by more than $1, beats the natural score). Capping taxable
applies to every stay-under trial, including the traditional-driven ones that today fail `met` because gains carried them
over: those may now meet their line (counted as movers by cause). Named causes of a trial that still misses its line: gains on
`bondTaxable` sales and the uncapped `bondTraditional` draw (both keep their place in the order, as today), and the release.

**Acceptance.** The TX gap household's year 0 ($777 over the line) and ages 62-63 become stay-unders on the standard projection
(a Vitest case on the household, years checked by MAGI and premium); the gap table re-run (both lengths, automatic and
optimized plans); the 864-household scan (`tests/solver_scan.js`): no standard depletion or first home draw earlier than `off`;
the Roth used by stay-unders on paths reported (the cliff-plan scan's measure); `magiStats.planMissed` stays 0.

## 7. Part 4c: the stock-account order

### 7.1 The intent

`orders[age] = 'traditional'`: in that year the stock-account step draws penalty-free traditional first, then taxable
(cascading fully, as `pickLiveWithdrawalOrder`'s traditional-first branch does today); absent: today's taxable-first. It
applies where the default cascade or the bucket `stocks` step runs; an explicit mix (override map or applied schedule) still
wins. Precedence in `drawMixedStockAccounts`: explicit mix, then the plan's order intent for the year, then (toggle on) the
default taxable-first cascade, then smoothing. So with the toggle on, smoothing is skipped as today (the live branch precedes
smooth); with the toggle off and the order lever on in an Optimize candidate, a year with an order intent runs that order and
a year without one smooths when `smoothWithdrawals` is on, else taxable-first. Under a stay-under cap the traditional-first
cascade's taxable step uses `takeTaxableCapped` (4b).

### 7.2 In `choose` (only when `plan.levers.order`)

Per withdrawal year with both taxable and penalty-free traditional money: after the natural year converges, one extra
converged phase with the other order (from the natural year's snapshot, seeded from its draws, the existing trial mechanics).
The year's order is the one with the higher lambda score (`afterTaxValue` less IRMAA, as cliff trials are scored) by more than
$1; the cliff candidates of the year then run from that order's natural year.

**Replay.** `apply` runs the same sequence in a year with an order intent: the default natural year converged, then the order
phase seeded from it, then (with a cliff intent) the cliff trial seeded from the order phase. It never runs the order
directly, so `apply(choose's plan)` reproduces `choose` exactly (the replay test extends to order years). The record that
seeds the next year (`prevDiscTraditional` and the other carries) is the kept phase's, as for cliff trials today.

No cliff-saving test for an order trial (it is
not a cliff), which is why the whole-run keep rule (7.3) is the safeguard 3C lacked (3C section 13.3: the yearly choice alone
never let a plan last longer and lost up to 694k).

### 7.3 The keep rule

Order intents are grouped by the three phases of section 4.5. Candidates: the plan with all order intents, with each phase's
alone, and with none, each combined with the kept cliff family (so up to 4 extra `apply` runs per bracket when order intents
exist). Rule A, then the objective, then fewer intents. `family` keeps the cliff family; a new `orderPhases` field records the
phases kept.

### 7.4 Removals

`pickLiveWithdrawalOrder` (`mix.js`), its test hook, `remainingMagiRoom` (built in the year loop by `incomeRoom(magiSafeRoom,
conversionAmount)` and forwarded through `withdrawStandard` / `drawMixedStockAccounts` / the bucket options), the `'live'`
marker (replaced by a row field `drawOrder: 'traditional'` only in years the intent ran), and the comment in
`src/shared/core/withdrawals/bucket-order.js` that names `remainingMagiRoom`. `tests/unit/us/historical-parity.test.js`
checks the wiring in the source and changes with it; `test_live_withdrawal_mix.js` (which calls
`__test_pickLiveWithdrawalOrder`) is rewritten to the toggle's new meaning. The toggle's label and info tip are rewritten from the code ("Tax-aware
withdrawal order: the plan chooses, on its own assumptions, the years to draw traditional money before taxable, and keeps that
only if the whole plan lasts at least as long and ends better").

### 7.5 Acceptance (from the plan's text)

Toggle on against toggle off over the 768-household grid per mode: no earlier depletion or first home draw (it was 19 at 3C);
losses shrink against 3C's (p10 about -75k, -150k among plans that never run out, worst -694k); with conversions on, better
than a coin flip on the objective (3C: 107 dearer, 87 cheaper on cost); the 5 households of 3C's table (single 58 trad 500k /
taxable 2M / 130k; single 66 1.5M / 300k / 130k; HoH 58 500k / 2M / 130k; HoH 62 500k / 300k / 60k conversions on; HoH 66
1.5M / 300k / 130k conversions on) do not run out earlier. The two costs the yearly score cannot see (gains left in taxable
raise later MAGI and IRMAA; a finite step can cross an IRMAA tier) are reported in the scan: later MAGI and IRMAA paid, with
the lever against without.

## 8. Part 4d: the two-return split

`splits[age] = 'A' | 'B'`: in a two-return year with no conversion, the **traditional** draw comes from that partner's accounts
first (`wd.onlyPartner`), then the other's (taxable is a joint pool and is not split). `profile.ownerShareA` scales every
traditional dollar onto the two returns (`federal-tax.js`, `returnMagis`), so it is not set to 1 or 0: during the first
partner's draw it is that partner's (1 or 0), and once the draw cascades to the other partner it is the realized
`fromA / (fromA + fromB)`, set before the second `takeTraditional`'s bisection prices tax, with `k401DrawFracA/B` recomputed
from the accounts actually drawn (states that read the 401(k) part, `needsPerPerson`). The pass-start reset to `ownerShareA0`
undoes all of it. Lines: a split year's lines are built from the pro-rata natural year (as the cliff candidates are today), and
`magiThresholds`' `toHousehold(..., 1 - shareA)` must not see a share of exactly 0 or 1 (it returns NaN and drops B's lines):
the split is decided after the year's lines are built, and a split phase does not rebuild them.
`choose` (only when `plan.levers.split`): two extra converged phases (A first, B first) against pro rata, the lambda score
picks, by more than $1; never in a conversion year or a joint return; replayed by `apply` in the same sequence as 4c's order.
Keep rule: the split intents as one subset (with / without), then Rule A and the objective. Row field `drawSplit` ('A' / 'B',
only when not pro rata). Acceptance: a Vitest suite `tests/unit/us/two-return-split.test.js` (CLAUDE.md "Where a new test
goes"; the B6 brief named a script) with the brief's case (B has a 90,000 pension and A none, both 60, filing single, 1M in each
401(k), cash 0, spending 120,000: the split is 'A'; a conversion year is never split; a joint return is never split); only
toggle-on two-return scenarios move.

## 9. Lambda's accuracy: the step 4 measurement (decision 5)

4a's notes (and 4b-4d's re-runs) record, on the gap households and a sample of the scan grid: the multipliers Optimize keeps per
phase, the gain over `[1, 1, 1]`, and the share of each phase's years with `movedSample` (from `__test_planTrace`). Step 5
decides from this table between correcting the emptied-pool sample, a tuned default multiplier and a new estimator.

## 10. Non-goals and anti-goals

- Not here: retiring `optimizeMultiLever`, the age-keyed schedules, the flat-bracket and per-year cards (step 5); the 30-year
  cap (step 5); Canada; per-year conversion sizing (3b, shelved); pricing home equity as a last resort; IRMAA discounting; MCP
  access to the stored plan; UI polish beyond what is described.
- Anti-goals: a stored plan that silently runs worse than the automatic plan on the current inputs; a reported gain that Apply
  does not deliver; any choice made per historical or Monte Carlo path; a lever that makes a standard plan run out or draw on
  the house earlier; success rates used to choose (reported only).

## 11. Builder's calls (made by the spec author, for the owner to check)

1. The comparison of decision 1 runs inside `computeCliffPlan` (engine, from `ctx.inputs.storedPlan`), so every planning path
   (render, `planForState`, its cache, comparison swaps) gets the same answer with no store-layer special case.
2. The guarded comparison's tolerance is 3a's (`max($1, 0.1%)`) and ties keep the stored plan.
3. The light render compares the stored plan with the user's-bracket automatic plan; the deferred pass re-compares with the
   searched one (consistent with 3a's deferred search; the dashboard may switch once after the deferred pass).
4. `madeFor` excludes the dismissal lists (UI-only state) and the stored plan itself.
5. Phases by Partner A's age, matching the intents' key; RMD start from `rmdStartAge` of A.
6. The multiplier grid `[0, 0.5, 1, 1.5, 2]`, after which `LAMBDA_MAX` still clamps.
7. Optimize searches on a copy without legacy applied schedules; Apply clears them (decision 4 keeps them working only until
   someone applies a stored plan).
8. The stored plan carries the plan shape only, no rows: what runs is always recomputed through `apply` on the current inputs.
9. 4c's order and 4b's stay-under combine in a year: the order is decided first, the cliff candidates run from it.
10. 4c groups order intents by phase for the keep rule (all / each phase / none), so one bad year cannot veto the rest and the
    cost stays bounded (about 4 extra `apply` runs per bracket).
11. `storedPlan` is left out of the Monte Carlo seed (a shared-code change in `simulate.js`; Canada's seed is unchanged).
12. Re-running Optimize includes the stored plan in use as a candidate; the gain is against what runs today.
13. With legacy schedules, Rule A ranks against the copy's automatic plan, and the with-schedules run is shown as information.
14. 4b's gains-capped stay-under is household lines only; 4b caps every stock-account taxable sale under a stay-under, smoothing
    and explicit mixes included.
15. 4d sets `ownerShareA` to the realized share once a split draw cascades, and decides the split after the year's lines.

## 12. Left to the builder

Module names inside the topic folders (`core/optimizer/`, `ui/results/`); the card's exact markup and copy (from the code);
how the existing UI scripts split between the new card and the hooks; the scan sample for section 9; the `--shipped optimized`
option's implementation in `tests/solver_gap.js`.
