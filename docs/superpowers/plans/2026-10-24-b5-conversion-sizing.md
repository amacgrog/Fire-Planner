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

## Review Focus

1. **Two-return years** (unmarried couple, pre-`marryLater`): a household amount moves each return by `ownerShareA`; a line target
   on B's return must land B just under B's line. Test in Task 2 (`two-return line target`).
2. **Survivor years**: after a death the target vocabulary is the survivor's (single tiers, one ACA household); a plan intent from a
   joint year whose line no longer exists falls back to the bracket (decision 6). Test in Task 4 (`survivor fallback`).
3. **RMD years and 72(t)**: the convertible balance is `traditionalBeforeRmd - rmd - seppLocked`; a target above it is capped. Test in
   Task 2 (`cap at convertible`).
4. **Year 0 without entered prior MAGIs on Medicare**: each candidate is priced at its own MAGI (the stand-in), histories restored.
   Test in Task 3 (`year-0 stand-in restored`).
5. **A lumpy-expense year already over the ACA 400% line** (the owner's example for decision 2): sizing may convert there; the bracket
   run's ceiling gives it nothing. Test in Task 4 (`lump year converts`).

---

### Task 1: `lambdaEstimate` returns the unscaled rate; the benefits-income helper

**Files:**
- Modify: `src/us/core/cliff-plan/solver.js` (`lambdaEstimate`, ~219-338)
- Test: `tests/unit/us/conversion-sizing.test.js` (new; counted suite, `makeCounter`)

**Interfaces:**
- Produces: `lambdaEstimate(...)` returns `{ lambda, tauGain, movedSample, rate }` where `rate = rateSum / 3` (unclamped, unscaled);
  `export function benefitsIncomeAt(ctx, y, { singlePerson, factor })` (Social Security + pensions in year `y`, this year's
  dollars; the body of today's `incomeAt` closure, which now calls it).

- [ ] **Step 1: Write the failing test** `it('lambdaEstimate: rate is the unclamped mean, lambda unchanged')`: on two households
  (the default; a 66-year-old single with 1.5M traditional), `e.lambda` is `Math.min(0.6, Math.max(0, e.rate))` (`toBe`), and on a
  household with a credit phase-in (`rate < 0`) `e.lambda` is 0 and `e.rate < 0`. Plus `it('benefitsIncomeAt')`: SS 2,000/month
  from 67 and a 10,000 pension from 65, `factor` 1: 0 at 64, 10,000 at 65, 34,000 at 67 (literals).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/conversion-sizing.test.js`. Expected: FAIL (`rate` undefined).
- [ ] **Step 3: Implement** the `rate` field and lift `incomeAt` into `benefitsIncomeAt`, keeping `lambda`'s expression as written.
- [ ] **Step 4: Run** the suite (PASS), then `npm run build && node tests/snapshot.js` (identical) and `node tests/solver_hooks.js`.
- [ ] **Step 5: Commit** `git commit -m "US: lambdaEstimate reports its unscaled rate; benefitsIncomeAt helper"`.

### Task 2: Target resolution (pure)

**Files:**
- Create: `src/us/core/withdrawals/conversion-sizing.js` (line 1 purpose comment: `// US Roth conversion sizing: named targets, the yearly score and choice, the bridge check`)
- Modify: `src/us/core/withdrawals/roth-conversion.js` (export a draw-aware variant beside `solveRothConversionTo`; leave
  `solveRothConversionTo` and `solveRothConversion` byte-for-byte)
- Test: `tests/unit/us/conversion-sizing.test.js`

**Interfaces:**
- Produces:
  - `export function solveRothConversionToWithDraws(ctx, profile, maxAvailable, yearIndex, bracketPct, estTrad)`: the bracket top
    counting `estTrad` as ordinary income below the conversion (same deduction, same 24-step bisection).
  - Target values: `'none'`, `'b10'`, `'b12'`, `'b22'`, `'b24'`, `'b32'`, `'b35'`, or `{ id, ret, side }` (`side` `'under'` | `'over'`).
  - `export function sizingLines(ctx, c)`: `magiThresholds(ctx, { ...c, lo: c.preConvMagi, hi: c.preConvMagi + c.convertible })`.
  - `export function resolveTarget(ctx, target, r)` → `{ amount, carried }`, where `r = { profile, year, convertible, preConvMagi,
    estTrad, lines, bracketAmount }` and `bracketAmount` is today's `solveRothConversion` at `min(convertible, magiSafeRoom)`.
    Rule (spec section 6, decision 6): bracket target → its amount capped at `convertible`; a line found in `lines` by `id` and `ret`
    → `line - 1 - preConvMagi` (under) or `line + 1 - preConvMagi` (over), clamped to `[0, convertible]`; a line not found →
    `{ amount: bracketAmount, carried: false }`; `'none'` → 0.
  - `export function sizingCandidates(lines, preConvMagi)`: the target list for the choice: `'none'`, the six bracket targets, each
    ceiling line above `preConvMagi` as under, each floor whose crossing lowers the cost (the caller passes `costNear`, read as
    `yearPlanCandidates` reads floors) as over.

- [ ] **Step 1: Write the failing tests** (literals hand-computed in the test's comments): `resolve bracket` (single, 2026, standard
  deduction only, `otherA` 20,000, `estTrad` 15,000: `b12` resolves so that 20,000 + 15,000 + amount sits at the 12% top plus the deduction to within the
  bisection's final interval, written out as `expect(Math.abs(ordinary - top) <= hi - lo).toBe(true)` with `top` a literal; and
  `solveRothConversionTo` on the same profile gives an amount larger by the draw to within the same interval); `resolve under` (line
  100,000, `preConvMagi` 80,000 → 19,999); `resolve over` (floor 15,650, `preConvMagi` 10,000 → 5,651); `passed under falls back`
  (line 70,000, `preConvMagi` 80,000 → `{ amount: bracketAmount, carried: false }`); `absent line falls back`; `cap at convertible`
  (under line 500,000, convertible 40,000 → 40,000); `two-return line target` (B's line translated through `ownerShareA` 0.6:
  B's return MAGI after the amount is the line − 1, checked with `returnMagis`); `candidates order` (none first, ascending amounts
  after resolution).
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
  - `export function chooseConversion(cands, priceAt, lambdaConv, bridge)` → the chosen `{ target, amount, score }`. `cands`: resolved
    `{ target, amount }` ascending; `priceAt(c)` → `{ tax, premium, irmaa }` (absolute, the caller's closures); `bridge(c)` → true when
    the candidate is allowed (5.4); the scan rule of Global Constraints. Candidates no larger than `bridge.base` (the bracket phase's
    conversion) are never dropped.
  - `export function bridgeAllows(c, b)`: `b = { active, base, accessible, taxIncreaseAt, bridgeNeed }` → `!b.active || c <= b.base ||
    b.accessible - b.taxIncreaseAt(c) >= b.bridgeNeed`.
  - `export function bridgeNeedOf(ctx, { year, need, yearsTo595, singlePerson, factor })`: the undiscounted sum over `y = year + 1 ..
    year + yearsTo595` of `max(0, need - max(0, benefitsIncomeAt(y) - benefitsIncomeAt(year)))`.

- [ ] **Step 1: Write the failing tests**: `one-dollar` (spec 9.5: a flat-rate year; `tax(c+1) - tax(c)` equals the hand-computed
  marginal rate × 1 as a literal, e.g. 0.22 for a single in the 22% bracket in a no-state-tax state; scores at `c` and `c+1` equal
  literals computed in the fixed order; the year comes from a real profile through `taxFor`, not a stub); `tie goes smaller`
  (two candidates scoring 100 and 100.5 → the smaller; 100 and 101.01 → the larger); `bridge drops larger` (spec 9.6: a 52-year-old,
  taxable 300,000, need 60,000, `yearsTo595` 7: the 32% candidate fails, the 22% candidate and `none` pass; and with `active` false
  both pass, the mutation check); `bridgeNeed literal` (need 50,000, 3 years, SS starting in year 2 at 20,000: 50,000 + 30,000 +
  30,000 = 110,000); `lambdaConv floor` (rate −0.05 → 0); `m = 0 converts only what pays now` (lambdaConv 0: a floor candidate with
  premium drop 3,000 and tax 1,200 wins; a bracket candidate with tax 2,000 and no premium change loses to none); `year-0 stand-in
  restored` (the caller-side closure contract, tested in Task 4 through the engine; here only the pure parts).
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** the suite and the shuffled suite (PASS).
- [ ] **Step 5: Commit** `git commit -m "US: the conversion score, choice and bridge check (pure)"`.

### Task 4: The engine: the sized phase in `choose`, resolution in `apply`

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (the conversion block ~727-731, the phased-year block ~1270-1430, the pass
  setup ~507-530, the row fields), `src/shared/core/projection/run-context.js` (`NO_TEST` gains `convSizingOff: false`),
  `src/us/core/cliff-plan/planning.js` (`storeRunContext`'s `test` literal), `src/us/core/test-hooks.js` (`testConvSizingOff: false`),
  `tests/unit/helpers/*.js` that build the `test` literal (one shape)
- Test: `tests/unit/us/conversion-sizing-engine.test.js` (new; counted; runs through `usPlan(w).runPlanMode`)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: in `choose` with `ctx.plan = { intents: {}, conv: {}, m }`, the run returns non-enumerable `cliffConvIntents`
  (`{ [age]: { target } }`); `apply` reads `ctx.plan.conv`; rows of a sized year carry `convChoice` (string, spec 5.5 wording:
  "converted to just under <line name>", "converted to the top of the <b>% bracket", "no conversion (tax-aware)"; line names as
  `cliffPlanSummary`'s `lineName`); `planTr.conv` in the trace (`{ candidates: [{ target, amount, score, allowed }], chosen }`).

Behaviour (spec 5.1-5.5, 6; do not re-derive): sizing is on in a year when `convertsThisYear`, no explicit schedule for the age,
`!ctx.test.convSizingOff`, and (`choose` with `plan.m` set) or (`apply` with `plan.conv[age]`). In `choose`: the bracket phase as
today (phased even with `flow >= 0`; no guard work unless `flow < 0`); the choice at the natural record's realized draws with
`lambdaConv` from `lambdaOf().rate`; the bridge check of Task 3 while a partner is under 59.5 (the 3B
penalty statuses; `accessible` from the bracket phase's ending balances and Roth ledger, `bridgeNeed` from `flowOwn`); if the winner differs, the sized phase from the year's start seeds with the trial reset, the
target held, `estUsed = true`, `remainingMagiRoom` from the per-pass bracket amount, and it becomes `naturalRec` (with its target)
for the guard's trials, the fill clamp and next year's seeds. In `apply`: the year's first phase resolves `plan.conv[age]` each pass
(same rule), `estUsed = true`. The year-0 stand-in written per candidate pricing and restored (spec 5.3). `profile.medicalExpense`
per candidate as spec 5.3 writes it, restored from the saved double. `magiStats` count the kept phase only: a
discarded bracket phase's forced / unresolved flags are not counted.

- [ ] **Step 1: Write the failing tests**: `apply reproduces choose` (spec 9.7; three households: the CA couple of
  `tests/solver_gap.js` at life expectancy 100, a two-return couple 58 with ACA, a single 52 with Rule of 55; for each `m` in
  `[0, 1, 2]`: rows of `choose` with `{ intents: {}, conv: {}, m }` deep-equal (`toStrictEqual`) rows of `apply` with
  `{ intents: chosen.intents, conv: chosen.convIntents, m }`); `off is byte-identical` (spec 9.2: conversions off, and conversions on
  with `convSizingOff`: rows `toStrictEqual` to `choose` with `plan` null); `historical path follows targets` (a `real1966` rowFn:
  a line target re-sized on the path's own MAGI: the row's MAGI is the line − 1, or the bracket amount where the line was passed);
  `survivor fallback` (A dies at 70: a joint-year line target absent in the survivor year converts the bracket amount);
  `lump year converts` (a 40,000 one-time expense at 61 puts the year over the 400% line: the bracket run converts 0 there, the sized
  run at `m` 1 converts more than 0); `year-0 stand-in restored` (a 66-year-old couple, no `irmaaPriorKnown`: after the choice
  `irmaaMagiHistory[0]` equals the bracket phase's value, read through the trace); `estUsed in a one-pass year` (a year with no
  premium and no ceiling: the sized amount reflects this year's draw, not last year's); `M17 fill clamp` if a household reaches it
  (spec 9.8: a sized natural year followed by a winning fill; delete the clamp line locally and the test fails), else a comment
  naming the households tried.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/conversion-sizing-engine.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the engine changes.
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm run test:unit`; `npm run build && node tests/snapshot.js` (identical: no
  run reaches sizing yet, `computeCliffPlan` still passes `plan` null); `node tests/plan_off_anchor.js --base <b544934 build>`
  (identical); `node tests/engine_purity.js`, `node tests/cliff_plan.js`, `node tests/solver_hooks.js`, `node tests/cliff_guard.js`.
- [ ] **Step 5: Commit** `git commit -m "US: the sized conversion phase (choose) and named-target resolution (apply)"`.

### Task 5: The outer search in `computeCliffPlan`, the report and the summary

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`), `src/us/core/cliff-plan/planning.js`
  (`cliffPlanSummary`'s conversion clause), `src/us/ui/install-test-hooks.js` (`__test_setConversionSizing`)
- Test: `tests/unit/us/conversion-sizing-plan.test.js` (new; counted); `tests/cliff_plan.js` (plan shape only)

**Interfaces:**
- Consumes: Task 4's plan shape and `cliffConvIntents`.
- Produces: `computeCliffPlan(ctx)` → `{ plan: { intents, family, conv, m }, report: { candidates: [{ family, m, intents, conv,
  depletedAge, value, cost }], kept } }`; `export const M_GRID`; `window.__test_setConversionSizing(on)` sets
  `testHooks.testConvSizingOff = !on`, clears `cliffPlanCache`, marks `cliffPlanStore.computed = false`.

Order and rule: spec section 7 steps 1-5 with the fixed rank order of step 3 (the running best replaced only when
`planCandidateBetter(candidate, best)`); sizing skipped (step 1 only) when conversions are off, the guard is off, every window age
has an explicit schedule, or `ctx.test.convSizingOff`. Summary clause wording: spec section 8.

- [ ] **Step 1: Write the failing tests**: `bracket kept on a tie` (a household where every sized run equals the bracket run within
  $1: `plan.m` is null, `conv` is `{}`); `never earlier` (over the 384 conversions-on scan households' first 24, standard projection:
  `plan`'s run `depletedAge` is never earlier than the bracket plan's, `null` = never); `CA couple beats flat 24%` (the gap case at
  100: the kept plan's `endValue` is at least the flat-24% bracket run's, literal comparison of two runs in one world); `report`
  (ten sized-or-bracket candidates listed in order, `kept` names the winner); `summary clause` (two hand-built plans: the run
  grouping and the "your bracket" wording, literal strings); `non-converting plan unchanged` (`computeCliffPlan` on the default
  household: `{ intents, family }` equal to `b544934`'s fields, `conv` `{}`, `m` null; the plan cache keys unchanged).
- [ ] **Step 2: Run** the suite. Expected: FAIL.
- [ ] **Step 3: Implement** the search, the report, the summary clause and the hook; update `tests/cliff_plan.js`'s plan-shape
  expectations (the new fields only) and any `magiStats` / `planStats` delta assertions the extra runs move (name each in the commit).
- [ ] **Step 4: Run** the suite and shuffled (PASS); `npm run test:unit`; `npm run build && node tests/cliff_plan.js && node tests/solver_hooks.js && node tests/end_value_us.js`.
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
- [ ] **Step 3: Implement** the tooltip, the tip text (the `<small>` stays under 70 characters), the badge, README and the two
  topic files.
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
- [ ] **Step 2: Run** it. Expected: exit 0; record the seconds (target under 60 s; above that, stop and report to the owner).
- [ ] **Step 3:** the solver_scan, solver_gap, bench_solver and classification changes. `tests/hist_depletion_cause.js A.json B.json`
  prints, per `hist` scenario depleting earlier in B, `bridge drain` or `market variance` by spec 9.1's rule, and exits 1 on any
  `bridge drain`.
- [ ] **Step 4: Run** `node tests/solver_gap.js --objective endValue` and `node tests/bench_solver.js --base <b544934 tree> --rounds 7`
  (runs only; numbers go in Task 8).
- [ ] **Step 5: Commit** `git commit -m "Tests: conversion-sizing guard in npm test; scan, gap, bench and cause scripts"`.

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
