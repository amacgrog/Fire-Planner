# The engine and the run context

Read before touching `runProjection`, the run context, the year sources and modes, the per-year helpers, `bal`, the withdrawal strategies, or anything on the `taxFor` hot path.

Related: [magi-iteration.md](magi-iteration.md), [cliff-plan.md](cliff-plan.md), [us-accounts.md](us-accounts.md), [lists.md](lists.md), [module-system.md](module-system.md), [inherited-accounts.md](inherited-accounts.md), [canada-benefits.md](canada-benefits.md), [us-state-tax.md](us-state-tax.md).

## Overview


Every declaration lives in a module: the tax code, the engine (`taxFor`, `runProjection`, `simulate`, the withdrawal solvers) and
`defaults` under `core/`, the DOM code (`render`, `syncControls`, the charts, the wizard, the MCP tools, the listeners) under `ui/`;
each planner's `main.js` only calls the start-up functions (see [module-system.md](module-system.md)). The bullets below say
"the function X"; find it with `grep -rn "function X" src`, or by topic in `docs/superpowers/inventory/module-map.md`
(`docs/superpowers/inventory/stage{2,3,4}-region-map.md` for the old shared regions). The `defaults`, `normalizeState` and `FIELDS` write-ups are in
[inputs-and-ui.md](inputs-and-ui.md).

## `runProjection` and the run context

- `runProjection(ctx, { mode, source, retireAgeA, retireAgeB, trace, planTrace })` — the one
  year-by-year drawdown/compounding engine behind everything: almost every
  chart/table/metric is built from its `{ rows, depletedAge, ... }` return. `ctx` is the **run context**
  (`newRunContext` in `src/shared/core/projection/run-context.js`: `inputs`, `taxYear`, `taxFactors`, `plan`, `planMode`,
  `overrides`, `stats`, `test`, always in that key order; spec `docs/superpowers/specs/2026-10-22-stateless-engine-design.md`).
  **The engine reads only the context:** `runProjection`
  (`const inputs = ctx.inputs` at its top; the year loop reads `inputs.x`, never `state.x`) and every module it calls read the
  inputs, `ctx.taxYear`, `ctx.taxFactors` (a historical path's per-year tax-index factors), `ctx.overrides` (the optimizer's
  `rothBracketByAge` / `withdrawalMixByAge`), `ctx.plan` / `ctx.planMode` and `ctx.test`, and bump the sinks in `ctx.stats` (US
  `magi` / `plan`, `engine-state.js`'s `magiStats` / `planStats`, and `hooks`, `testHooks`; Canada `null`), never a store
  binding, and never writes its inputs (a deep-frozen state runs: `tests/unit/shared/engine-ratchet.test.js`). The engine is
  `runProjection` and its import closure plus `computeCliffPlan` and the `core/analysis/` and `core/optimizer/` modules;
  `tests/engine_purity.js` fails if any of them reaches a store module. It never plans, and passes its own `ctx` to every function it calls. Engine functions take the context
  FIRST: `taxFor(ctx, profile, gains, traditionalExtra)` in both countries (and `incomeTaxCA`, `personTaxCA`, `benefitsFor`,
  `healthcareCost`, `buildTaxProfile`, the draws and solvers), `taxIndexFactor(ctx, yearIndex)`, `taxYearOf(ctx, yearIndex)`,
  `medicalGrowth(ctx, year)`, `newWithdrawal(ctx, { ... })` (the withdrawal carries it as `wd.ctx` for its draws and solvers),
  `solveRothConversion(ctx, ...)` / `solveRothConversionTo(ctx, profile, cap, yearIndex, bracketPct)`, `growBalances(ctx, bal,
  ...)`, `guardrailSpendingMultiplier(ctx, g, working)` / `recordGuardrailWithdrawal(ctx, g, ...)`, `magiThresholds(ctx, c)`,
  `lambdaEstimate({ ..., ctx })`, `afterTaxEndValueUS(ctx, sim)` and Canada `afterTaxEstate(ctx, sim)` (both price with the context
  of the run that made `sim`); a function that needs only the inputs takes them: `getBondYears(inputs)`,
  `dependentsInYear(inputs, taxYear)`, `qualifyingChildCount(inputs, taxYear)`, `rule55Applies(inputs, working, retireAge,
  partner)`. **Convention differences left for item 5 of `docs/roadmap.md` (TypeScript):** besides those, the account ledger
  (`accountsNew(inputs)` and friends), `penalty-status.js` and the US `hasChildAtMost(inputs, taxYear, maxAge)` take `inputs`
  rather than `ctx`; `lambdaEstimate` takes the context inside its options object (`{ ..., ctx }`); and the draws and solvers read
  the context from the withdrawal (`wd.ctx`), not from an argument. A `ui/` caller passes `storeContext({ withPlan: false })` (it
  allocates: UI only); a `window.__test_*` hook keeps its old signature and builds the context itself. **One context shape:**
  every context that reaches an engine function is built by `newRunContext`, through the factories below or `w.ctx()` /
  `w.ctxBuilder()` in Vitest; never a hand-built literal or another object (see the hot-path rules). In the US every factory goes
  through `storeRunContext(inputs, opts)` (`src/us/core/cliff-plan/planning.js`), which gives `overrides` a fresh two-key literal
  `{ rothBracketByAge, withdrawalMixByAge }`, `test` a fresh `{ inhForce, inhNoNeedAdj }` literal (captured from `testHooks` when
  built) and `stats: US_STATS` (`{ magi, plan, hooks }`, one module constant); the exception is `computeCliffPlan`'s `ctxFor`
  (`run-projection.js`), which builds its contexts with `newRunContext` directly, reusing its parent context's `overrides`,
  `stats` and `test` objects so the shape stays one. **The store layer** (the only modules besides the
  UI that read the store; `adapters` in `tests/engine-purity.json`, none of them an engine module): the two
  `src/<country>/core/projection/store-context.js`, the shared `src/shared/core/projection/simulate.js` and US
  `src/us/core/cliff-plan/planning.js`. `storeContext(opts)` (seam `#country/core/seam-storeContext`) builds a context from the
  store: US plans with `planForState(state, overrides)` unless `planMode` is passed (then `plan` / `planMode` are taken as given);
  `{ withPlan: false }` gives no plan; Canada's tax year is `CURRENT_YEAR`. `variantContext(base, variant, opts)` (seam
  `#country/core/seam-variantContext`) is the context of a variant of `base` (a shallow copy `{ ...base, field: value }`, or
  `base` itself) with the plan rule of spec section 6: when `base` is the object the kept plan was made for under the current tax
  year, every variant applies the kept plan; otherwise the variant gets `planForState(variant, overrides)`, planned and cached by
  its own JSON (`opts.overrides`: an optimizer trial's two maps, default the store's; planning sees the same maps). **Variants run on
  copies, never by mutating `state`:** the analysis and optimizer functions (`computeSensitivity`, a UI entry point in
  `src/shared/ui/charts/tornado.js`, and the core levers' `swing`, `findMinimalSpendingCut` / `findMinimalRetirementDelay`, `analyzeShortfallDrivers`, `simulateAtRealCagr`, the US
  `optimizeMultiLever` / `optimizeRothLadderPerYear`, ...) take `(selected, base, contextFor, ...)`, where `contextFor(variant,
  overrides?)` is a context factory their caller passes, and they never import the store layer; the UI passes
  `stateContextFor()` (`src/shared/ui/results/state-context.js`: `variantContext` with the store's state object itself as
  `base`), and a Vitest test loads the same `stateContextFor` through its world. Variants share nested arrays (`children`, `oneTimeIncome`, ...) with the base, which is
  safe because the engine never writes its inputs; never deep-copy or normalize a variant. Money is converted to display units
  with the variant's own inputs: `displayValueOf(mode, inflation, n, yearIndex)` (`src/shared/core/format/display-value.js`, pure;
  the display mode is an argument of the analysis and optimizer functions that convert, passed down from the UI), while the
  store-reading `displayValue` stays for the UI. The pure entry points
  are `simulateWith(ctx, a, b)` and `simulateHistoricalWith(ctx, rowFn, a, b)` (`src/shared/core/projection/runs.js`; the
  historical one expects `ctx.taxFactors` to be a fresh array). Two
  thin store wrappers call them (`src/shared/core/projection/simulate.js`; `runMonteCarlo` seeds mulberry32 with
  `monteCarloSeed(taxYear, pathCount, inputs)`, a hash of a key-sorted serialization of the inputs without the
  dismissed-warning fields). `simulate(retireAgeA, retireAgeB)` is the standard
  projection (`STANDARD_MODE` + `standardYearSource(inputs)`: constant plan return,
  inflation and bond assumptions). `simulateHistorical(rowFn, retireAgeA,
  retireAgeB)` is the historical-backtest / Monte Carlo run (`BUCKET_MODE` +
  `historicalYearSource(inputs, rowFn, taxFactors)`, which records each year's tax-index factor in the context's own fresh
  `taxFactors` array, the one `taxIndexFactor` reads),
  where `rowFn(year)` returns actual
  `[calendarYear, stockReturn, inflation, bondReturn, optional Treasury yield]`
  from the embedded 1928–2025 dataset or a block-bootstrapped path). Called
  many times per render (current settings, ±1yr/±3yr lines, each Monte Carlo
  path, each sensitivity sweep), so it needs to stay cheap — avoid
  per-year allocations that a hot path doesn't need (the bucket-step table is
  built once at module level for that reason).

## Year source and mode

- **Year source and mode.** A year source supplies each year's market inputs
  (`yearInputs(year)` → stock return, bond return, bond interest yield,
  inflation `factor`; `endOfYear()` advances running inflation). The mode is a
  small object of explicit capability switches. Today it has one,
  `bucketStrategy` (cash/bonds first in a down year, bond reserve refilled in up
  years, instead of the standard cascade); both modes run the detailed rows, the
  Roth-conversion age key, the safe-MAGI ceiling and the pre-retirement bond ladder. Rows and result fields are identical in both modes;
  historical rows additionally carry `cumFactor` and the result carries
  `startYear`. The bond reserve is refilled gradually: `routeSurplus` fills it from
  surplus cash (limited by the surplus and `bondTarget`, no extra cap), and
  `refillBondReserve(wd, bondTarget, { maxMove })` (up years, after the draw)
  moves at most one year of that year's non-lump expenses into bonds:
  traditional, then Roth (no income, no penalty), then taxable last, a real sale
  through `drawTaxable` whose gain goes into `wd.taxableGainGross` (so tax, MAGI
  and the MAGI iteration see it) with the tax paid from the proceeds; never cash
  or home equity. `rotateIntoBondLadder` (the pre-retirement ladder, both
  engines) uses the same source order (traditional, Roth, taxable last); a taxable
  move is a real sale through `drawTaxable` whose gain it returns, and the engine
  adds that to `wd.taxableGainGross` (and to the row's tax/income in a surplus
  year). The stock-account step of the bucket strategy is one grouped step,
  `BUCKET_STEP.stocks`, that delegates to `drawMixedStockAccounts` (US: applied/
  override mix, live mix, smooth) or `drawSmoothStockAccounts` (Canada: smooth
  only), the same code `withdrawStandard` uses, with the bucket's own bisection
  bracket (`solveTraditionalForNetFromNeed`); with no mix mode on it runs the
  original taxable -> traditional -> Roth steps. Cash and the bond buckets keep
  their place in the down/up-year orders. The pre-retirement ladder is sized once from the plan's assumed
  inflation (`source.inflation`) in both engines. Do not add a new
  historical-only fork of the year loop; add a mode switch.

## Tax-code hot-path rules and the context shape

- **Tax-code hot-path rules (7D part 2).** `taxFor` is the hottest function (a withdrawal solve probes it 25 to 50 times
  per year), so: `taxIndexFactor(ctx, yearIndex)` (`src/shared/core/projection/year-factors.js`, with its memo `taxFactorInflation`) remembers the plan's own factor per whole
  year index while `ctx.inputs.inflation` is the value it was computed for (`Math.pow` was a fifth of a projection; the historical
  path still reads its own per-run array first); `drawTaxable`'s bisection computes the no-draw `taxFor` once, not per probe
  (the other solvers already did). Measured and rejected, do not retry: a memo inside `standardDeduction`, a conformity-
  deduction cache, and a 4-slot memo of the federal pass (the lagged pass reused by the main pass) all cost as much to look up as
  they save. A memo must be keyed on every input it reads (so it never needs clearing) and give the very double the uncached
  path gives; verify with `tests/unit/us/tax-caches.test.js` and the snapshots. **The context shape (stateless engine):**
  `taxFor` and the other hot functions read `ctx.inputs` / `ctx.taxYear` / `ctx.taxFactors` on every call, and per-year paths read
  the nested `ctx.overrides`, `ctx.stats` and `ctx.test`, so every context passed to them must share `newRunContext`'s hidden
  class, nested objects included (US: built through `storeRunContext`). Measured (stateless-engine Tasks 11 and 12): while a
  getters-only bridge object (`LIVE_CTX`, deleted in Task 16) still reached `taxFor`, `taxIndexFactor` and the healthcare helpers
  through the cliff-plan solver, their context loads went polymorphic for every later run (planning ran first), and the US gate was
  +10 to +14% against the stage 1 tree (CPU profile: `taxFor` self time +55%); with one shape it is -4 to +4%. So: no second
  context shape on a path real contexts also take, and the context is passed as an argument, never held in a module-level binding
  (no "current context" set around a run). `tests/bench_runs_interleaved.js --warm-analysis` is the gate that catches a slip.
  **The registry:** every module-level mutable of an engine module is listed by kind in `tests/engine-purity.json` (`mutables`):
  `memo` (keyed on every input it reads, never cleared, the very double the uncached path gives: `taxFactorByYear` /
  `taxFactorInflation`, `stateRuleCache`, `PROVINCE_COMPILED`, `medicaidLimitCache`, `RAMQ_CAP`, ...), `scratch` (a buffer reused
  on every call because allocating measured slow; every field its reader uses is written earlier in the same call: `SOURCES_*`,
  `STREAM_OUT`, `STREAM_CTX`, `INH_OUT`, `BEN`, `PAY`, ...), `constant` (rule tables, `HIST`, mode objects), `counter` (the US sinks
  `magiStats` / `planStats`, written only through `ctx.stats`) and `cache`. `tests/engine_purity.js` fails on an unregistered
  module-level `let` or mutable `const` (object, array, `Map`, `Set`, typed array) in an engine module: a new one is registered with
  its kind in the same commit, and anything else is passed in the context.

## Per-year helpers

- **Per-year helpers** (section "Per-year helpers shared by simulate() and
  simulateHistoricalCore()", just above `simulate()`). The year loop is a
  sequence of named stages: `listAmountsForYear`, `retirementContributions`,
  `socialSecurityIncome`/`cppAndOasIncome`, `pensionIncome`,
  `requiredDistributions`, `housingForYear`, `loanPaymentForYear`,
  `filingStatusFor`, `buildTaxProfile`, `conversionMagiCeiling` (US),
  `healthcareCost`, `payrollTax`, then balance mutations (`growBalances`,
  `withdrawRequiredDistributions`, `applyRothConversion`/`applyRrspMeltdown`,
  `sweepExcessCash`, `rotateIntoBondLadder`) and the withdrawal. Add a new
  per-year rule to the matching helper, not inline in an engine.

## Balances

- **Account balances live in one `bal` object** (`bal.taxable`,
  `bal.taxableBasis`, `bal.bondTaxable`, `bal.bondTaxableBasis`,
  `bal.bondTraditional`, `bal.bondRoth`, `bal.traditional`, `bal.roth`,
  `bal.cash`, `bal.home`, `bal.mortgage`, plus `bal.fhsa` in Canada), not loose
  `let`s. The MAGI-iteration snapshot is `{ ...bal }`, so a new balance field is
  rewound automatically; only scalars (depletedAge, firstWithdrawal) still need
  adding to `scalarSnapshot`; guardrail state lives in a `guardrails` object
  (`newGuardrails`, `guardrailSpendingMultiplier`, `recordGuardrailWithdrawal`).

## Withdrawals

- **Withdrawals** build a `wd` object (`newWithdrawal`) and run a strategy:
  `withdrawStandard` (simulate: explicit/optimizer mix, live mix, smooth, or
  taxable-then-traditional, then the Roth/cash/bond/home fallback) or
  `withdrawBucket` (simulateHistorical: cash and bonds first in a down year, then
  stocks; in an up year stocks first, then refill the bond reserve). Both are
  built from `takeTaxable`/`takeTraditional`/`takeRoth`/`takeCash`/
  `takeHomeEquity`, which return net cash and leave `wd.need` to the caller
  (the strategies differ on clamping a tiny overshoot to zero).
  `solveTraditionalForNet` and `solveTraditionalForNetFromNeed` bisect from
  different brackets and give slightly different (~1e-7) answers; both are
  kept on purpose until the numerics are unified as a deliberate change.
  `solveRothConversionTo(ctx, profile, cap, yearIndex, bracketPct)` is the bracket fill, and `solveRothConversion`
  resolves the bracket (override, applied schedule, setting) and calls it. The US year loop builds the
  healthcare-cost block (`hcArgs`, `costAt`) and the `irmaaAt` / `lambdaOf` closures before the conversion (3C B5,
  for Batch 5's conversion pricing; `healthcareCost` itself still runs after the conversion is known).

## Death clamp

**Death clamp (both planners).** At the top of each `runProjection`, after `deathYear`, the deceased partner's `retireAgeA/B`
becomes `min(retirement age, survivorDeathAge)`: wages, contributions, health premiums, `retirementYear`, `makeProjectedExpense`,
ACA eligibility and the account statuses all key off the clamped value. Test: `tests/survivor_salary.js`.
