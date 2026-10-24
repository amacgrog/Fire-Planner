# Tax-aware Roth conversion sizing (Batch 5 step 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In plans that already convert, the cliff plan sizes each conversion year to a priced, named target, choosing how much to value
future tax savings (`m`) with a whole-run search that always keeps the user's bracket run as a candidate.

**Architecture:** Pure engine helpers (target resolution, the yearly score and choice, the bridge check) in
`src/us/core/withdrawals/conversion-sizing.js`; the year loop of `src/us/core/projection/run-projection.js` gains a sized phase in
`choose` and per-pass target resolution in `apply`; `computeCliffPlan` runs the outer search over `M_GRID`. The plan object becomes
`{ intents, family, conv, m }`.

**Tech Stack:** plain ES modules, esbuild build, Vitest (unit, through `tests/unit/helpers/world.js`), Playwright node scripts.

**Spec:** `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md` (owner-approved 2026-10-24, decisions 1-6). Read it whole
before any task; section references below (5.1, 6, 9 ...) are the spec's.

## Global Constraints

- Base `b544934` (US V137). Bump the US badge to **V138** in `src/us/index.html` (Task 6). Canada untouched.
- `M_GRID = [0, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]`; `lambdaConv = Math.min(LAMBDA_MAX, Math.max(0, m * rate))`, `LAMBDA_MAX` = 0.6.
- Score evaluation order, exactly: `((c * lambdaConv - dTax) - dPremium) - dIrmaa`.
- Choice scan: candidates by amount ascending, `none` first; replace the running best only when `score > best + 1`.
- Bracket targets: 10, 12, 22, 24, 32, 35. Line ids: `medicaid`, `acaFloor`, `aca400`, `irmaa1`..`irmaa5`, `senior`, `ctc`.
- `SOLVER_LAMBDA_MULT`, `lambdaEstimate`'s `lambda`, the guard's candidates and scoring: unchanged (decision 4).
- Every run with conversions off, the guard off, or `ctx.test.convSizingOff` true is byte-identical to `b544934` in its rows.
- Engine rules (CLAUDE.md): new engine functions take `ctx` first and import no store module; contexts only from `newRunContext`;
  the one `test` literal gains `convSizingOff`; new phase state lives outside the per-pass restore; no new module-level mutable
  (or register it in `tests/engine-purity.json`); Vitest: exact comparisons only, `world()` per `it`, `makeCounter` for counted suites.
- A bug found in existing code is recorded in the notes and brought to the owner, not fixed here (CLAUDE.md rule 7).
- Never `git stash`; never push; never touch other worktrees.
- After every commit that adds, renames or changes a module's exports: `npm run analyze` (the module map), then
  `node tests/module_map.js`. A new const array or object literal in an engine module (`M_GRID`, a target list) is registered as
  `"constant"` in `tests/engine-purity.json` in the same commit; run `node tests/engine_purity.js`.
- Every new test file gets a line in `docs/architecture/test-inventory.md` in the commit that adds it.
- Households named in tests are written out in the test file (a `const` patch per household). The gap cases and the scan grid
  live inside Playwright scripts that run on import (`tests/solver_gap.js`, `tests/solver_scan.js`): Task 2 moves them to
  `tests/unit/helpers/scan-grid.js` (CommonJS-free ESM consts, with the `legacyToAccounts` conversion), imported by the Vitest
  suites; the two scripts keep their own copies (they are CommonJS) with a comment naming the helper as the twin.

## Review Focus

1. **Two-return years** (unmarried couple, pre-`marryLater`): a household amount moves each return by `ownerShareA`; a line target
   on B's return must land B just under B's line. Test in Task 2 (`two-return line target`).
2. **Survivor years**: after a death the target vocabulary is the survivor's (single tiers, one ACA household); a plan intent from a
   joint year whose line no longer exists falls back to the bracket (decision 6). Test in Task 4a (`survivor fallback`).
3. **RMD years and 72(t)**: the convertible balance is `traditionalBeforeRmd - rmd - seppLocked`; a target above it is capped. Test in
   Task 2 (`cap at convertible`).
4. **Year 0 without entered prior MAGIs on Medicare**: each candidate is priced at its own MAGI (the stand-in), histories restored.
   Test in Task 4b (`year-0 stand-in restored`).
5. **A lumpy-expense year already over the ACA 400% line** (the owner's example for decision 2): sizing may convert there; the bracket
   run's ceiling gives it nothing. Test in Task 4b (`lump year converts`).

---

### Task 1: `lambdaEstimate` returns the unscaled rate; the benefits-income helper

**Files:**
- Modify: `src/us/core/cliff-plan/solver.js` (`lambdaEstimate`, ~219-338)
- Test: `tests/unit/us/conversion-sizing.test.js` (new; counted suite, `makeCounter`)

**Interfaces:**
- Produces: `lambdaEstimate(...)` returns `{ lambda, tauGain, movedSample, rate }` where `rate = rateSum / 3` (unclamped, unscaled);
  `export function benefitsIncomeAt(ctx, y, singlePerson, factor)` (Social Security + pensions in projection year index `y`,
  this year's dollars; positional arguments, no per-call object: it runs inside the walk; the body of today's `incomeAt`
  closure, which now calls it).

- [ ] **Step 1: Write the failing test** `it('lambdaEstimate: rate is the unclamped mean, lambda unchanged')`: on two households
  (the default; single, `ageA` 66, `tradIraA` 1,500,000, `taxable` 300,000, spending 130,000, `tx`), `e.lambda` is
  `Math.min(0.6, Math.max(0, e.rate))` (`toBe`). (No household gives `rate < 0`: the sample profile has no wages, so no credit
  phase-in; Task 3's pure `lambdaConv floor` covers the floor.) Plus `it('benefitsIncomeAt')`: single, `ageA` 60,
  `ssMonthlyA` 2,000, `ssStartAgeA` 67, `pensionYearlyA` 10,000, `pensionStartAgeA` 65, `pensionCoverage` 'a', `factor` 1: year
  index 4 (age 64) 0, 5 (65) 10,000, 7 (67) 34,000 (literals).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/conversion-sizing.test.js`. Expected: FAIL (`rate` undefined).
- [ ] **Step 3: Implement** the `rate` field and lift `incomeAt` into `benefitsIncomeAt`, keeping `lambda`'s expression as written.
- [ ] **Step 4: Run** the suite (PASS), then `npm run build && node tests/snapshot.js` (identical) and `node tests/solver_hooks.js`;
  `npm run analyze` and `node tests/module_map.js` (new export).
- [ ] **Step 5: Commit** `git commit -m "US: lambdaEstimate reports its unscaled rate; benefitsIncomeAt helper"`.

### Task 2: Target resolution (pure)

**Files:**
- Create: `src/us/core/withdrawals/conversion-sizing.js` (line 1 purpose comment: `// US Roth conversion sizing: named targets, the yearly score and choice, the bridge check`)
- Modify: `src/us/core/withdrawals/roth-conversion.js` (export a draw-aware variant beside `solveRothConversionTo`; leave
  `solveRothConversionTo` and `solveRothConversion` byte-for-byte)
- Create: `tests/unit/helpers/scan-grid.js` (the gap cases of `tests/solver_gap.js` and the scan grid of `tests/solver_scan.js` as
  exported patch builders, accounts through the same conversion as `tests/legacy_balances.js`)
- Test: `tests/unit/us/conversion-sizing.test.js`

**Interfaces:**
- Produces:
  - `tests/unit/helpers/scan-grid.js`: `GAP_CASES` (`[{ name, patch(life) }]`, conversions on from `ageA` to 74 at 22%) and
    `scanHouseholds({ conversions })` (the 768-household grid's patches, filtered by the conversions axis).
  - `export function solveRothConversionToWithDraws(ctx, profile, maxAvailable, yearIndex, bracketPct, estTrad)`: the bracket top
    counting `estTrad` as ordinary income below the conversion (same deduction, same 24-step bisection).
  - Target values: `'none'`, `'bracket'` (the user's bracket: today's `solveRothConversion` with today's ceiling, i.e.
    `bracketAmount`; a candidate in every choice, never written to `conv`: a year whose winner is `'bracket'` records nothing),
    `'b10'`, `'b12'`, `'b22'`, `'b24'`, `'b32'`, `'b35'` (draw-aware, no ceiling), or `{ id, ret, side }` (`side` `'under'` | `'over'`).
  - `export function sizingLines(ctx, c)`: `magiThresholds(ctx, { ...c, lo: c.preConvMagi, hi: c.preConvMagi + c.convertible })`.
  - `export function resolveTarget(ctx, target, r)` → `{ amount, carried }`, where `r = { profile, year, convertible, preConvMagi,
    estTrad, lines, bracketAmount }` and `bracketAmount` is today's `solveRothConversion` at `min(convertible, magiSafeRoom)`.
    Rule (spec section 6, decision 6): `'bracket'` → `bracketAmount`; a `'bNN'` target → its amount capped at `convertible`; a line found in `lines` by `id` and `ret`
    → `line - 1 - preConvMagi` (under) or `line + 1 - preConvMagi` (over), clamped to `[0, convertible]`; a line not found →
    `{ amount: bracketAmount, carried: false }`; `'none'` → 0.
  - `export function sizingCandidates(lines, preConvMagi, costNear)`: the target list for the choice: `'none'`, `'bracket'`, the six bracket targets, each
    ceiling line above `preConvMagi` as under, each floor whose crossing lowers the cost (the caller passes `costNear`, read as
    `yearPlanCandidates` reads floors) as over.

- [ ] **Step 1: Write the failing tests** (literals hand-computed in the test's comments): `resolve bracket` (single, 2026, standard
  deduction only (16,100), `otherA` 20,000, `estTrad` 15,000; the 12% top 50,400; the bisection interval is
  `maxAvailable / 2 ** 24`: `b12` resolves so that 20,000 + 15,000 + amount sits at the 12% top plus the deduction to within the
  bisection's final interval, written out as `expect(Math.abs(ordinary - top) <= hi - lo).toBe(true)` with `top` a literal; and
  `solveRothConversionTo` on the same profile gives an amount larger by the draw to within the same interval); `resolve under` (line
  100,000, `preConvMagi` 80,000 → 19,999); `resolve over` (floor 15,650, `preConvMagi` 10,000 → 5,651); `passed under falls back`
  (line 70,000, `preConvMagi` 80,000 → `{ amount: bracketAmount, carried: false }`); `absent line falls back`; `cap at convertible`
  (under line 500,000, convertible 40,000 → 40,000); `two-return line target` (B's line translated through `ownerShareA` 0.6:
  B's return MAGI after the amount is the line − 1, checked with `returnMagis`); `candidates order` (`none` first, `bracket` present,
  ascending amounts after resolution); `bracket resolves to bracketAmount`.
- [ ] **Step 2: Run** the suite. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** the suite (PASS); `npx vitest run --sequence.shuffle tests/unit/us/conversion-sizing.test.js` (PASS);
  `npm run analyze` (module map) then `node tests/engine_purity.js && node tests/module_map.js`.
- [ ] **Step 5: Commit** `git commit -m "US: conversion targets and their resolution (pure)"`.

### Task 3: The yearly score, the choice and the bridge check (pure)

**Files:**
- Modify: `src/us/core/withdrawals/conversion-sizing.js`
- Test: `tests/unit/us/conversion-sizing.test.js`

**Interfaces:**
- Consumes: Task 2's `resolveTarget`, `sizingCandidates`; Task 1's `rate`, `benefitsIncomeAt`.
- Produces:
  - `export function scoreConversion(c, lambdaConv, dTax, dPremium, dIrmaa)` → `((c * lambdaConv - dTax) - dPremium) - dIrmaa`.
  - `export function chooseConversion(cands, priceAt, lambdaConv, b)` → the chosen `{ target, amount, score }`. `cands`: resolved
    `{ target, amount }` ascending; `priceAt(c)` → `{ tax, premium, irmaa }` (absolute, the caller's closures); `b` the bridge
    object below, each candidate filtered by `bridgeAllows(c.amount, b)`; the scan rule of Global Constraints.
  - `export function bridgeAllows(c, b)`: `b = { active, base, accessible, taxIncreaseAt, bridgeNeed }` → `!b.active || c <= b.base ||
    b.accessible - b.taxIncreaseAt(c) >= b.bridgeNeed`.
  - `export function bridgeNeedOf(ctx, { year, need, yearsTo595, singlePerson, factor })`: the undiscounted sum over `y = year + 1 ..
    year + yearsTo595` of `max(0, need - max(0, benefitsIncomeAt(y) - benefitsIncomeAt(year)))`.

- [ ] **Step 1: Write the failing tests**: `one-dollar` (spec 9.5 as amended by the owner, 2026-10-24: cents comparison; a flat-rate
  year, single in the 22% bracket in `tx`, a real profile through `taxFor`; `Math.round((tax(c + 1) - tax(c)) * 100)` toBe 22, and
  the scores at `c` and `c + 1` compared in cents against hand-computed literals; plus the pure evaluation-order check
  `scoreConversion(1000, 0.3, 220, 50, 10)` toBe `((1000 * 0.3 - 220) - 50) - 10` written as the literal 20); `tie goes smaller`
  (two candidates scoring 100 and 100.5 → the smaller; 100 and 101.01 → the larger); `bridge drops larger` (spec 9.6: `base` 10,000, `accessible`
  500,000, `bridgeNeed` 420,000 (60,000 x 7), `taxIncreaseAt` 20,000 for the 22% candidate and 100,000 for the 32% one: 480,000
  passes, 400,000 fails; `none` and any amount at or below `base` pass; with `active` false both pass, the mutation check); `bridgeNeed literal` (need 50,000, 3 years, SS starting in year 2 at 20,000: 50,000 + 30,000 +
  30,000 = 110,000); `lambdaConv floor` (rate −0.05 → 0); `m = 0 converts only what pays now` (lambdaConv 0: a floor candidate with
  premium drop 3,000 and tax 1,200 wins; a bracket candidate with tax 2,000 and no premium change loses to none).
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** the suite and the shuffled suite (PASS); `npm run analyze`, `node tests/module_map.js`, `node tests/engine_purity.js`.
- [ ] **Step 5: Commit** `git commit -m "US: the conversion score, choice and bridge check (pure)"`.

### Task 4a: The test switch and `apply` following named targets

**Files:**
- Modify: `src/shared/core/projection/run-context.js` (`NO_TEST` gains `convSizingOff: false`), `src/us/core/cliff-plan/planning.js`
  (`storeRunContext`'s `test` literal: `convSizingOff: testHooks.testConvSizingOff`), `src/us/core/test-hooks.js`
  (`testConvSizingOff: false`), `src/us/core/projection/run-projection.js` (the conversion block ~727-731, the pass setup, the row
  fields, the trace). These two literals are the only `test` literals (every Vitest helper goes through `storeRunContext`).
- Test: `tests/unit/us/conversion-sizing-engine.test.js` (new; counted; runs through `usPlan(w).runPlanMode` with hand-written plans)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `apply` reads `ctx.plan.conv` (guarded `plan.conv &&`: plans from `computeCliffPlan` lack it until Task 5) and resolves
  `plan.conv[age].target` on every pass by Task 2's rule, with `estUsed = true`; `remainingMagiRoom` from the per-pass
  `bracketAmount` in such a year; rows of a year with a conversion intent carry `convChoice` (spec 5.5 wording: "converted to just
  under <line name>", "converted to the top of the <b>% bracket", "no conversion (tax-aware)", and "your bracket (target not
  reachable)" for a fallback; line names as `cliffPlanSummary`'s `lineName`), the same string in `choose` and `apply`; with
  `planTrace`, `planTr` is created for every year with a conversion intent or a sized choice (not only `flow < 0`) and carries
  `planTr.conv = { candidates, chosen, amount, preConvMagi, line, hist0 }` (`hist0`: `irmaaMagiHistory[0]` after the choice).

- [ ] **Step 1: Write the failing tests**: `off is byte-identical` (spec 9.2: the default household and the CA gap case with
  conversions off; and conversions on with `convSizingOff`: `apply` rows with `{ intents: {}, family: 'none', conv: { 62: { target:
  'b24' } }, m: 1 }` `toStrictEqual` rows with plan `{ intents: {}, family: 'none' }`); `apply follows a bracket target` (the CA
  gap case, `conv` `b24` at 62: the year's `conversionAmount` is larger than the bracket run's, and `planTr.conv.amount` equals
  `conversionAmount`); `historical path follows targets` (`real1966` rowFn, a `{ id: 'irmaa1', ret: 'H', side: 'under' }` target at
  66 for a 64-year-old MFJ couple, traditional 2,000,000: `planTr.conv.amount` toBe `planTr.conv.line - 1 - planTr.conv.preConvMagi`
  on the final pass, or the row says the fallback); `survivor fallback` (MFJ 66, `survivorModeling` with A dying at 70, a
  `{ id: 'irmaa2', ret: 'H', side: 'under' }` target at 71 whose line does not exist in the survivor's lines: the amount equals the
  bracket run's amount that year); `explicit schedule wins` (`appliedRothSchedule` `{ 62: 12 }` with a `b24` intent at 62: 62
  converts the schedule's amount).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/conversion-sizing-engine.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm run test:unit`; `npm run build && node tests/snapshot.js` (identical);
  `node tests/plan_off_anchor.js --base <b544934 build>` (identical); `node tests/engine_purity.js`; `node tests/bench_runs_interleaved.js
  --base <b544934 tree>` (+5% gate; over it, stop and report).
- [ ] **Step 5: Commit** `git commit -m "US: apply follows named conversion targets; the sizing test switch"`.

### Task 4b: The sized phase in `choose`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (the phased-year block ~1270-1430, the pass setup ~507-530)
- Test: `tests/unit/us/conversion-sizing-engine.test.js`

**Interfaces:**
- Consumes: Task 4a.
- Produces: in `choose` with `ctx.plan = { intents: {}, family: 'none', conv: {}, m }`, the run returns non-enumerable
  `cliffConvIntents` (`{ [age]: { target } }`, only years whose winner is not `'bracket'`).

Behaviour (spec 5.1-5.5; do not re-derive): sizing is on in a year when `convertsThisYear`, no explicit schedule for the age,
`!ctx.test.convSizingOff`, and `plan.m` is set. The bracket phase as today (phased even with `flow >= 0`; no guard work unless
`flow < 0`); the choice at the natural record's realized draws, `lambdaConv` from `lambdaOf().rate`, candidates from
`sizingCandidates`, the bridge check while a partner is under 59.5 (the 3B penalty statuses; `accessible` from the bracket phase's
ending balances and Roth ledger, `bridgeNeed` from `flowOwn` via `bridgeNeedOf`); if the winner is not `'bracket'`, the sized phase
from the year's start seeds with the trial reset, the target held and resolved per pass exactly as `apply` resolves it (4a), and it
becomes `naturalRec` (carrying its target) for the guard's trials, the fill clamp, replays and next year's seeds. The year-0
stand-in written per candidate pricing and restored (spec 5.3). `profile.medicalExpense` per candidate as spec 5.3 writes it,
restored from the saved double. `magiStats` count the kept phase only: a discarded bracket phase's forced / unresolved flags are not
counted.

- [ ] **Step 1: Write the failing tests**: `apply reproduces choose` (spec 9.7; `GAP_CASES`' CA couple at life expectancy 100,
  `scanHouseholds`' two-return 58 / 1.5M / 2M / 130k with conversions, and its HoH 52 / 500k / 300k / 60k Rule-of-55 household;
  for each `m` in `[0, 1, 2]`: `choose` rows with `{ intents: {}, family: 'none', conv: {}, m }` `toStrictEqual` `apply` rows with
  `{ intents: run.intents, family: 'all', conv: run.sim.cliffConvIntents, m }`, `convChoice` included); `lump year converts` (single
  61, `acaEnabled`, `tx`, traditional 2,000,000, taxable 200,000, a 40,000 one-time expense at 61 pushing the year over the 400%
  line, conversions 61-74 at 12%, `m` 2: the bracket run converts 0 at 61, the sized run more than 0; if a scratch trace shows the
  household does not reach it, pick another from the trace and pin it with a comment); `year-0 stand-in restored` (MFJ 66 / 66,
  `irmaaPriorKnown` false, traditional 2,500,000, conversions on: `planTr.conv.hist0` toBe the bracket phase's
  `irmaaMagiHistory[0]` from a `convSizingOff` run's trace); `estUsed in a one-pass year` (single 60, no ACA, no Medicare in reach,
  conversions on, `b22` target: `planTr.conv.amount` toBe the draw-aware amount at this year's realized `estTrad`, which differs from
  last year's); `M17 fill clamp` if a household reaches it (spec 9.8; delete the clamp line locally and the test fails), else a
  comment naming the households tried.
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm run test:unit`; `npm run build && node tests/snapshot.js` (identical:
  `computeCliffPlan` still passes `plan` null to `choose`); `node tests/plan_off_anchor.js --base <b544934 build>`;
  `node tests/engine_purity.js`, `node tests/cliff_plan.js`, `node tests/solver_hooks.js`, `node tests/cliff_guard.js`;
  `node tests/bench_runs_interleaved.js --base <b544934 tree>` (+5%).
- [ ] **Step 5: Commit** `git commit -m "US: the sized conversion phase in choose"`.

### Task 5: The outer search in `computeCliffPlan`, the report and the summary

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/planning.js`
  (`cliffPlanSummary`'s conversion clause), `src/us/ui/install-test-hooks.js` (`__test_setConversionSizing`)
- Test: `tests/unit/us/conversion-sizing-plan.test.js` (new; counted); `tests/cliff_plan.js` (plan shape only)

**Interfaces:**
- Consumes: Task 4b's plan shape and `cliffConvIntents`.
- Produces: `computeCliffPlan(ctx)` → `{ plan: { intents, family, conv, m }, report: { candidates: [{ family, m, intents, conv,
  depletedAge, value, cost }], kept } }`; `export const M_GRID`; `window.__test_setConversionSizing(on)` sets
  `testHooks.testConvSizingOff = !on`, clears `cliffPlanCache`, marks `cliffPlanStore.computed = false`. `measure`'s `n` counts
  guard intents plus conversion intents (spec 7.3). `M_GRID` registered as `"constant"` in `tests/engine-purity.json`.

Order and rule: spec section 7 steps 1-5 with the fixed rank order of step 3 (the running best replaced only when
`planCandidateBetter(candidate, best)`); sizing skipped (step 1 only) when conversions are off, the guard is off, every window age
has an explicit schedule, or `ctx.test.convSizingOff`. Summary clause wording: spec section 8.

- [ ] **Step 1: Write the failing tests**: `bracket kept on a tie` (a household where every sized run equals the bracket run within
  $1: `plan.m` is null, `conv` is `{}`); `never earlier` (over `scanHouseholds({ conversions: true })`' first 24, standard projection:
  `plan`'s run `depletedAge` is never earlier than the bracket plan's, `null` = never); `CA couple beats flat 24%` (the gap case at
  100: the kept plan's `endValue` is at least the flat-24% bracket run's, literal comparison of two runs in one world); `report`
  (the bracket step's 1-4 candidates, then nine `m` runs in grid order, then a sized winner's family subsets: order and count
  asserted from the families, `kept` names the winner); `summary clause` (two hand-built plans: the run
  grouping and the "your bracket" wording, literal strings); `non-converting plan unchanged` (`computeCliffPlan` on the default
  household: `{ intents, family }` equal to `b544934`'s fields, `conv` `{}`, `m` null; the plan cache keys unchanged).
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement** the search, the report, the summary clause and the hook; update `tests/cliff_plan.js`'s plan-shape
  expectations (the new fields only) and any `magiStats` / `planStats` delta assertions the extra runs move (name each in the commit).
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm run test:unit`; `npm run build && node tests/cliff_plan.js && node tests/solver_hooks.js && node tests/end_value_us.js && node tests/engine_purity.js`;
  `npm run analyze`; the planning time: a scratch Playwright timing (median of 9) of `__test_refreshCliffPlan` on the slowest gap
  household with conversions on, against the 150 ms gate; over it, stop and report to the owner.
- [ ] **Step 5: Commit** `git commit -m "US: the outer search over m in the cliff plan"`.

### Task 6: UI, badge and docs

**Files:**
- Modify: `src/us/ui/results/table-annotations.js` (`annotateSolverRows`: `convChoice` beside `cliffChoice` in the status
  tooltip), `src/us/index.html` (the `rothConvBracket` info tip, spec section 8; badge V138), `README.md`,
  `docs/architecture/cliff-plan.md`, `docs/architecture/engine.md` (the phased-year rule: conversion years are phased in `choose`)
- Test: a root `test_conversion_sizing.js` Playwright script (new; exits 1 on failure)

- [ ] **Step 1: Write the failing UI test** `test_conversion_sizing.js`: the CA gap household loaded, conversions on: the cliff
  plan summary contains "Conversions:"; a sized year's status tooltip contains its `convChoice`; toggling conversions off removes
  the clause and changes `window.fireProjectionRows` (CLAUDE.md checklist 4); at 390×844 `scrollWidth > clientWidth` is false.
- [ ] **Step 2: Run** `npm run build && node test_conversion_sizing.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the tooltip, the tip text (the `<small>` stays under 70 characters), the badge, README, the two
  topic files and `docs/architecture/test-inventory.md` (the new root script).
- [ ] **Step 4: Run** `node test_conversion_sizing.js` (PASS), `node tests/doc_paths.js`, `node tests/snapshot_ui.js`.
- [ ] **Step 5: Commit** `git commit -m "US V138: tax-aware conversion sizing in the cliff plan (UI, docs)"`.

### Task 7: Guard and measurement scripts

**Files:**
- Create: `tests/conversion_sizing.js` (plain Node + Playwright; added to `package.json`'s `test` chain after `tests/cliff_plan.js`)
- Modify: `tests/solver_scan.js` (sized vs bracket and guard on vs off with sizing on, via `__test_setConversionSizing`;
  `__test_refreshCliffPlan` after each toggle), `tests/solver_gap.js` (a sized column: `m`, targets used, converted total; the
  rule-9.4 check), `tests/bench_solver.js` (third scenario: the ACA early retiree with conversions on, to 74, 22%), a
  classification script `tests/hist_depletion_cause.js` (spec 9.1's row test over two snapshot dumps)
- Test: the scripts themselves

- [ ] **Step 1:** `tests/conversion_sizing.js`: the scan grid's conversions-on, default-order households (384), standard
  projection: sized plan vs `__test_setConversionSizing(false)`; exit 1 if any depletes earlier; print the elapsed seconds.
- [ ] **Step 2: Run** it. Expected: exit 0 (a failure is spec 9.1's standard-depletion stop: report to the owner); record the
  seconds (target under 60 s; above that, stop and report to the owner, spec 9).
- [ ] **Step 3:** the solver_scan, solver_gap, bench_solver and classification changes. `tests/hist_depletion_cause.js A.json B.json`
  prints, per `hist` scenario depleting earlier in B, `bridge drain` or `market variance` by spec 9.1's rule, and exits 1 on any
  `bridge drain`.
- [ ] **Step 4: Run** `node tests/solver_gap.js --objective endValue` and `node tests/bench_solver.js --base <b544934 tree> --rounds 7`
  (runs only; numbers go in Task 8).
- [ ] **Step 5:** add `tests/conversion_sizing.js` and `tests/hist_depletion_cause.js` to `docs/architecture/test-inventory.md`;
  commit `git commit -m "Tests: conversion-sizing guard in npm test; scan, gap, bench and cause scripts"`.

### Task 8: Snapshots, measurements, the gate and the notes

**Files:**
- Modify: `tests/snapshots/us.json` (only after the review below), `docs/next-batches-plan.md` ("### Batch 5 notes": a new
  "#### Batch 5 step 3" section)

- [ ] **Step 1:** `node tests/snapshot.js` on this branch; list every mover (scenario, first moved age, depletion before -> after,
  end value change). Standard scenarios: any earlier depletion → **stop and report to the owner** (rule 9.1). Every mover must have
  conversions on and the guard on.
- [ ] **Step 2:** dump `b544934`'s and this branch's snapshot results and run `node tests/hist_depletion_cause.js`. Any `bridge
  drain` → **stop and report to the owner** with the remedy of spec 9.1. Record each `market variance` mover (path, ages, first
  differing year). List the five named scenarios with before / after ages.
- [ ] **Step 3:** `npm run snapshot:update`; `npm test` (PASS, including `tests/conversion_sizing.js`).
- [ ] **Step 4:** measurements for the notes: `node tests/solver_scan.js` (both modes; rule 9.3), `node tests/solver_gap.js
  --objective endValue` (rule 9.4: each case's sized end value at least its best flat bracket's), the timing gates
  (`tests/bench_runs_interleaved.js` +5%, `tests/bench_solver.js` +30% including the converting scenario), the planning time per
  input change on the slowest gap household (gate 150 ms median; over it, stop and report), `node tests/historical_rates.js`
  (reported).
- [ ] **Step 5:** write the notes section (decisions 1-6, the measurements, the movers and their causes, the M17 outcome, the
  planForState override-key observation, the guard-undoes-a-sized-conversion count from the scan) and commit
  `git commit -m "Batch 5 step 3: snapshots and notes"`.
