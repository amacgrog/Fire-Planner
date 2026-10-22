# Stateless engine: design

Date: 2026-10-22. Item 4 of "Current plan" in `docs/roadmap.md`; section 11 of
`docs/superpowers/specs/2026-10-10-modular-build-design.md`. Agreed with the owner in a brainstorming session the
same day; the places marked "builder's call" or "my call" were not decided by the owner.

## 1. Why

`runProjection` and everything it calls read the planner's live inputs from module-level bindings (`state` and five
other store modules), and the code that builds variants (the tornado, decision questions, shortfall drivers, the
optimizers) changes `state` in place, runs the engine and restores it. That works, but it makes every later item of the
refactor track harder:

- **TypeScript (item 5)** wants each function's inputs visible in its signature. A function that reads a global has no
  signature to type.
- **Centralized state writes (item 6)** cannot hold while the analysis code writes `state` behind the store's back.
- **Merging the US and Canada engines (item 8)** is a comparison of two functions; it is much easier when each takes the
  same explicit inputs than when each reaches into different globals.
- Tests (Vitest, `tests/unit/`) can only drive the engine by assigning the store; a pure engine can be called with a
  plain object.

The goal is a refactor with **no behavior change and no speed change**: every snapshot, every unit test and the golden
math tests stay exact to the cent, and the timing gates stay within noise.

## 2. What "stateless" means here

When this work is done:

1. **`runProjection` is a function of explicit arguments.** Everything that can change its output arrives in its
   arguments (the run context, section 4, plus the existing `mode`, `source`, retirement ages, `trace`, `planTrace`).
2. **Nothing the engine calls reads the store modules** (`src/shared/core/store.js`, `tax-factors.js`,
   `src/us/core/tax-year.js`, `optimizer-state.js`, `cliff-plan-store.js`, `test-hooks.js`), and nothing reads the clock
   (Canada's `CURRENT_YEAR` inside the engine; section 4).
3. **The engine never writes to its inputs.** A deep-frozen inputs object runs without throwing.
4. **Module-level mutable state in the engine is limited to two registered kinds** (section 5): memos keyed on every
   input they read, and scratch buffers fully written before they are read within one call.
5. **The engine writes only to what it is handed**: the counters and the historical tax-factor array live in the run
   context the caller passed in.

Scope ("the engine"): `runProjection` in both countries and every `core/` module in its import closure, plus
`computeCliffPlan` (the cliff plan's pure planning step) and the `core/analysis/` and `core/optimizer/` modules
(sensitivity levers, decisions, shortfall drivers, decision comparison, estate, the Roth and multi-lever optimizers).
`core/inputs/` (normalization, `defaults`, field metadata, the estimate checks) and `core/format/` (number and chart
formatting, which reads the chart preferences) are outside the engine and are not changed by this work, unless a module
there is in `runProjection`'s import closure (the builder determines the closure with `scripts/lib/module-graph.js`;
any such module is in scope).

"Nothing the engine calls reads the store" means the whole call graph of the in-scope code, not only its direct imports
(my call, from the builder check): a `format/` or `inputs/` helper that an engine or analysis module calls is in scope
for that call. Today the one such case is `displayValue` (`src/shared/core/format/charts.js`), which reads `mode` and
`state.inflation` and is called by `us/core/optimizer/roth-schedule.js` (`rothScheduleCost`, the multi-lever objective),
`shared/core/analysis/decisions.js`, both `analysis/decision-compare.js` and the tornado's `endValue`
(`src/shared/ui/charts/tornado.js`); see section 6. The guard checks the import closure accordingly (section 7).

Out of scope (owner): the input handlers that mutate `state` in place (field listeners, the button groups,
`headline-tiles.js`, the MCP tool) and `render()` reading the store. Those are item 6.

## 3. What exists today (verified 2026-10-22 at `623c8ce`)

- **Store reads.** About 86 functions in about 55 `core/` files read `state` (690 reads of 144 distinct fields). 55
  `core/` modules import at least one store module (40 in the US + shared closure, 27 in the Canada + shared closure).
  The US engine also reads `currentYear` (federal rules, state tax, healthcare, income stages, the cliff plan),
  `histTaxFactors` (a module-level binding that `simulateHistorical` and `computeCliffPlan` set around a run, read by
  `taxIndexFactor` and written by `historicalYearSource`), `optimizerState.rothBracketByAge` (`roth-conversion.js`)
  and `.withdrawalMixByAge` (`strategies.js`), `cliffPlanStore` and `cliffPlanCache` (through `planForState()`, which
  runs as the first statement of every `runProjection` called without `planMode`, and can start nested projections),
  and `testHooks` (counters, plus two switches that change behavior: `testInhForce`, `testInhNoNeedAdj`). Canada reads
  `state` and `CURRENT_YEAR` (`src/canada/core/income/year-stages.js`).
- **Mutate-and-restore callers.** In `core/`: both `analysis/sensitivity-levers.js` (about 75 writes),
  `shared/core/analysis/decisions.js`, both `analysis/shortfall-drivers.js`, `simulateAtRealCagr`
  (`shared/core/projection/simulate.js`), and `us/core/optimizer/multi-lever.js` (writes `state` and the two
  `optimizerState` maps). In `ui/`: both `results/decision-questions.js`, `us/ui/results/roth-optimizer.js`,
  `canada/ui/results/roth-optimizer.js`. (`us/ui/results/roth-optimizer-controls.js` writes the applied schedules for
  real: an input write, item 6, not a variant.)
- **The plan identity rule.** `planForState()` returns the main cliff plan when `state === cliffPlanStore.forState`. That
  is how every in-place variant (age lines, tornado, sensitivity, the optimizer trials) applies the main plan by age and
  never re-plans. A variant built as a copy fails that identity test; if its JSON differs it would be re-planned and its
  numbers would move. **Every variant caller must pass its plan explicitly, chosen by today's rule** (section 6). When
no refresh has happened (`state !== forState`, or another tax year), today's rule plans each in-place variant for its
own JSON instead; the replacement keeps that too.
- **The ratchet already holds.** A scratch probe (plain Node, both planners; households with a survivor, a child, an
  inherited IRA and a loan, and a single person in NY / QC) showed: identical inputs give identical `simulate` and
  `simulateHistorical` output; A, B, A in a row gives the same results; a deep-frozen state runs without throwing.
- **Spike (2026-10-22, throwaway local branches `spike/ctx-profile` and `spike/ctx-explicit`, not pushed).** A per-run
  context `{ state, taxYear, taxFactors }` was threaded through the whole US tax subtree (`taxFor`, the deductions,
  brackets, child credits, QBI, `stateIncomeTax`; `taxIndexFactorC(ctx, yearIndex)`, `taxYearOfC(ctx, yearIndex)`) two
  ways: on the per-year profile (`profile.run`) and as `taxFor`'s explicit first argument. Both left the snapshots
  exact (577 US, 376 Canada scenarios). `tests/bench_runs_interleaved.js`, 15 rounds, against `main`: explicit argument
  between -3.3% and +1.3% in every state (400 `simulate` / 120 historical); on the profile between -3.5% and +5.0%;
  explicit against profile in one process between -2.2% and +2.6%. Both are inside this machine's noise. Findings that
  decided the shape: below `taxFor` the explicit argument is needed either way (`ordinaryTax`, `standardDeduction` and
  the rest receive only a year index); a context on the profile fails quietly for profiles built elsewhere
  (`LAMBDA_PROFILE` in the cliff-plan solver, `{ ...profile }` copies); and the shared `drawTaxable`
  (`src/shared/core/withdrawals/draws.js`) calls `taxFor` through the country seam, so both countries' `taxFor` must
  change signature in the same commit.

## 4. The run context (owner: one object, passed explicitly)

One plain object per run, built once, before the year loop, by the caller (normally the store adapter, section 6),
**passed as the first argument** to every engine function that needs anything from it, `taxFor` included (owner, after
the spike). Functions that need none of it do not take it. Narrowing a function to the exact fields it reads is item 5
(TypeScript), not this work.

Fields (the field list and names are my call; the builder may rename):

| Field | What | Written during the run? |
| --- | --- | --- |
| `inputs` | the normalized state object | never |
| `taxYear` | US: the tax year (`currentYear` today). Canada: the calendar year the engine reads where it reads `CURRENT_YEAR` today | never |
| `taxFactors` | a historical run's per-year tax-index array (today `histTaxFactors`), or `null` for a standard run | yes: filled by `historicalYearSource` |
| `plan`, `planMode` | the cliff plan and `'off' / 'choose' / 'apply'` (US; Canada has no plan) | never |
| `overrides` | US: `{ rothBracketByAge, withdrawalMixByAge }` (today `optimizerState`), `null` maps when unset | never |
| `stats` | the counter sinks: `magiStats`, `planStats`, the `testHooks` counters (US) | yes: incremented |
| `test` | US: `{ inhForce, inhNoNeedAdj }` (today `testHooks.testInhForce` / `.testInhNoNeedAdj`) | never |

Rules:

- `runProjection(ctx, { mode, source, retireAgeA, retireAgeB, trace, planTrace })`. It no longer calls `planForState`;
  `planMode` is required in the context (US). `computeCliffPlan(ctx)` takes a context whose `plan` / `planMode` it
  ignores and builds its own runs from it (with `taxFactors: null`, as it does today by saving and restoring
  `histTaxFactors`).
- The year source reads its inputs from `ctx.inputs` (or is built from them: `standardYearSource(inputs)`,
  `historicalYearSource(inputs, rowFn, taxFactors)`), and the historical source writes the run's own `ctx.taxFactors`
  array instead of the module binding.
- `stats` defaults: the store adapter passes the existing module objects (`magiStats`, `planStats`, `testHooks`), so the
  counters stay cumulative and every test that reads deltas today is unchanged. A test may pass its own object.
- A historical run's tax-factor array is created by the caller per run (as `simulateHistorical` does today with
  `assignHistTaxFactors([])`), so nothing survives between runs.
- No engine function keeps a reference to a context after it returns (the spike's `LAMBDA_PROFILE.run = ctx` is an
  example of what not to do: clear it, or pass the context as an argument).

## 5. Module-level mutable state (owner: keep the scratch, register everything)

Allowed, each entry listed in one registry (a data file or a test constant; builder's call where), with its kind:

- **Memo:** keyed on every input it reads, never needs clearing, returns the very double the uncached path returns:
  `taxFactorByYear` / `taxFactorInflation` (`year-factors.js`; keyed on the inflation input, which `taxIndexFactor` now
  reads from `ctx.inputs`), `stateRuleCache` (`us/core/tax/state-tax.js`), `PROVINCE_COMPILED`
  (`canada/core/tax/province-rules.js`), `medicaidLimitCache` (`us/core/healthcare/medicaid-rules.js`), `RAMQ_CAP`
  (`canada/core/tax/rules.js`).
- **Scratch:** an output or argument buffer reused on every call because allocating measured slow; every field the
  reader uses is written earlier in the same call, and nothing reads it after another engine call could overwrite it.
  Today: `SOURCES_JOINT / SINGLE / A / B`, `SE_OUT`, `SE_HEALTH`, `SOLO_PLAN`, `STREAM_PLAN`, `PLAN_REQ`, `STREAM_OUT`,
  `STREAM_CTX`, `COVER_CTX`, `LUMP_OUT`, `INH_OUT`, `INH_CTX`, `LAMBDA_PROFILE` (US); `BEN`, `PAY`, `OAS_RECOVERY`,
  `PROV_TAX` (Canada). The builder completes the list from the code (the list above came from a search and may miss a
  buffer declared in a multi-name `const`).
- **Constant data** (rule tables, `HIST`, mode objects, step tables): not mutated; listed so the guard can tell them
  apart, not frozen (freezing is not part of this work).

Why the scratch buffers stay (owner): allocation measured slow on these paths; each is written before it is read in one
call; with planning moved out of `runProjection` nothing re-enters the engine mid-run; and a Web Worker (if Monte Carlo
ever moves to workers) gets its own module instance, so the buffers do not block that.

Gone from the engine: `histTaxFactors` (into `ctx.taxFactors`), `cliffPlanCache` (into the store adapter), the counters
(written through `ctx.stats`), the test switches (read from `ctx.test`).

## 6. The store adapter and the callers (owner)

**The store adapter.** One `core/` module per country (name and folder are the builder's call; `core/projection/` fits)
is the only engine-side module that imports the store modules. It holds:

- `simulate`, `simulateHistorical`, `runHistoricalCycles`, `runMonteCarlo` with their current signatures, for the UI and
  the test hooks: each builds the context from the store (`state`, `currentYear`, the `optimizerState` maps, the plan
  from `planForState`, the module counters, the `testHooks` switches) and calls the pure engine. Pure versions that take
  `(inputs, plan, …)` (or a context) exist beside them for the analysis code and the tests.
- `planForState`, `refreshCliffPlan`, `ensureTestPlan` and `cliffPlanCache` (moved from `run-projection.js` and
  `cliff-plan/planning.js`), unchanged in behavior: the identity rule, the JSON key, the 16-entry cache, the tax-year
  and overrides checks. The cache is documented memoization of the adapter, not engine state.

**The callers.** Every mutate-and-restore site listed in section 3 changes to:

- take the inputs (and, US, the main plan) as arguments, or get them from the adapter at the UI boundary;
- build each variant as a shallow copy (`{ ...inputs, returnRate: r }`; nested arrays are shared, which is safe because
  the engine never writes its inputs, and the frozen-inputs test enforces that);
- run it with the plan today's rule would give it, so no number moves (my call, from the builder check). The adapter
  exports one helper for this, for example `variantPlan(baseInputs)`: when `baseInputs` is the object the kept plan was
  made for (`cliffPlanStore.forState`) and the tax year matches, it returns the main plan, which every variant then uses
  (this is the production path: `render()` refreshes the plan first, so the tornado, decision questions, age lines and
  optimizer trials all get it); otherwise it says "no shared plan", and each variant gets
  `planForState(variant)`, planned and cached by the variant's own JSON, exactly as an in-place variant is today when
  no refresh has happened (after `__test_replaceState`, a load / undo / reset before `render()`, or a test world that
  never refreshed). That second path is a quirk kept only for exactness; whether variants should always share the base
  state's plan is a possible follow-up, not part of this work. A run that today goes through `planForState` with a
  different state object (the scenario comparison and overlay swaps) keeps going through the adapter's
  `planForState`, unchanged;
- convert money to display units with the variant's own inputs: `displayValue` gets a pure form taking the display
  mode and the inflation input as arguments (for example `displayValueOf(mode, inflation, n, yearIndex)`; the
  store-reading `displayValue` stays for the UI). The tornado's inflation lever today divides each end value by the
  variant's inflation (it mutates `state.inflation` before `endValue` runs), so the variant's inputs, not the base
  inputs, must reach the conversion, or the inflation bar moves in real mode. The display mode becomes an argument of
  the analysis and optimizer functions that convert (`rothScheduleCost`, the multi-lever optimizer, `decisions.js`,
  both `decision-compare.js`), passed down from the UI. The optimizers' objective therefore keeps depending on the
  real / nominal chart toggle, as it does today; making the objective independent of a display setting would be a
  behavior change and is a possible follow-up;
- the multi-lever optimizer passes its trial override maps in `ctx.overrides` instead of writing `optimizerState`, and
  its trials keep the main plan (today: `state === forState`, so the main plan, planned under the real overrides).

`roth-optimizer-controls.js` ("Apply" writes `state.appliedRothSchedule` and friends) is an input write and stays.

## 7. Stages (owner: one PR per stage, in this order)

Each stage leaves `npm test` exact (snapshots, `tests/unit`, golden, every guard) and is timed against `main` with
`tests/bench_runs_interleaved.js --base <main worktree>` (US) and `tests/bench_canada.js --base <main worktree>`
(Canada), plus `tests/bench_heavy.js` once at the end of stage 3. No stage updates a snapshot baseline.

1. **Ratchet tests and guards.** No `src/` change.
   - Vitest, `tests/unit/{us,canada}/` (or `shared/`, run in both projects), through `world()` and
     `tests/unit/helpers/engine.js`: identical inputs give identical output (standard, historical, the US plan run);
     a deep-frozen inputs object runs `simulate`, `simulateHistorical` and (US) the plan refresh without throwing;
     running scenario A, then B, then A gives A's result both times, and B then A equals A then B. Scenarios: the
     default household plus a few that reach the scratch-heavy paths (survivor, children, inherited IRA, self-employment,
     one-time income, a taxing state; Canada a province with benefits, Quebec). Comparisons exact (`toStrictEqual` on the
     result, or a JSON string compared with `toBe`), per the harness rules.
   - The registry of module-level mutables (section 5) and a guard test that fails on an unregistered mutable top-level
     binding in an engine module (detection method: builder's call; it must catch a module-level `let`, and a `const`
     whose initializer is an object, array, `Map`, `Set` or typed array).
   - The **shrinking list**: the engine modules that still reach a store module, pinned; the guard fails if a module is
     added to the list or a listed module stops reaching one (so the list is updated as it shrinks). "Reach" is through
     the import closure, so an engine module that imports `format/charts.js` for `displayValue` counts until it uses
     the pure form (builder's call how the check tells a store-reading helper from the pure functions in the same
     module, for example by moving the pure form to its own module).
2. **The context and the adapter.** `runProjection(ctx, …)` in both countries; the adapter module; `planForState` and
   the cache move; `taxFactors`, `stats`, `test` and `overrides` read from the context; `computeCliffPlan(ctx)`; the
   year sources take their inputs. Inside the engine, functions still read `state` (which is the same object as
   `ctx.inputs` when the adapter built the context), so this stage changes the boundary, not the internals.
3. **Thread the context through the topic folders**, one commit per folder, each removing modules from the shrinking
   list: `tax/` and `benefits/` (both countries together: the `taxFor` seam), `healthcare/`, `income/`, `accounts/`
   and `withdrawals/`, `cliff-plan/`, `projection/`. `taxIndexFactor(ctx, yearIndex)` and `taxYearOf(ctx, yearIndex)`
   replace the global-reading versions. The order inside the stage is the builder's call; a commit may be split if a
   folder is large (`income/`, `healthcare/aca.js`).
4. **The callers.** The analysis and optimizer modules and the UI variant sites switch to copies with the main plan
   (section 6); `optimizerState` is no longer read by the engine; the shrinking list ends with the adapter alone and the
   guard is enforced; `CLAUDE.md` ("Architecture, per planner file", "Shared state and country seams", "Where new code
   goes", the hot-path rules), the module map (`npm run analyze`) and `docs/roadmap.md` are updated.

## 8. Proving no behavior and no speed change

- **Behavior:** `npm test` after every commit (snapshots `tests/snapshot.js` and `tests/snapshot_ui.js`, `tests/unit`,
  `tests/golden.js`, the guards). The ratchet tests of stage 1 run throughout. `tests/plan_off_anchor.js --base DIR`
  (US, the cliff plan's `off` mode) at the end of stages 2 and 4. `scripts/compare-builds.js` does not apply (statements
  change on purpose).
- **Speed:** the gates above, interleaved against `main` in one process (noise about 10% between separate runs on this
  machine). Gate: no state's median worse than +5% against `main` on the interleaved run; a result between +5% and
  +10% is re-run once, and a confirmed regression is fixed before the PR. The spike suggests the explicit argument costs
  nothing measurable on the hottest path.
- **Hot-path rules still apply** (CLAUDE.md, "Tax-code hot-path rules"): no new allocation per call; the Canada
  `state.province === 'on'` comparisons become `ctx.inputs.province === 'on'` (a plain comparison, as the rule asks;
  reading the rule row instead measured 1.2-1.35x slower), and the builder may hoist such a read to a local at the top
  of the function where that is no slower.

## 9. Goals, non-goals, anti-goals

Goals: the five points of section 2; the analysis code free of mutate-and-restore; a test suite that keeps it that way.

Non-goals: per-field function signatures (item 5); centralized writes, subscriptions and `render()` (item 6); merging
the engines (item 8); moving Monte Carlo to workers; making Monte Carlo deterministic (the bootstrap's
`Math.random` is outside `runProjection`: the path is an input).

Anti-goals (would make this a failure even if the tests passed):

- any snapshot baseline updated, or any number moved;
- a measurable slowdown of `simulate` / `simulateHistorical`;
- the global moved, not removed: a module-level "current context" binding set around a run (the `histTaxFactors`
  pattern) instead of an argument;
- variant callers that re-plan because they lost the identity rule.

## 10. Left to the builder

The adapter module's name and folder; the registry's form and the guard's detection method; the context's field names;
the commit split inside stage 3; whether pure `(inputs, plan, …)` wrappers or a context-taking entry point is what the
analysis code calls; how `tests/unit/helpers/engine.js` exposes the pure entry points (its existing functions must keep
their behavior for the converted suites); how UI code that calls engine helpers directly (`taxIndexFactor`,
`taxYearOf`, `housingForYear`, `cppAndOasIncome`, `seppElections`, `mortgageSchedule`) gets a context (for example a
`storeContext()` the adapter exports); where `optimizerState.rothPerYearEvalBudget` and `.lastMultiLeverRun` live (they
are UI and test state, not engine inputs: the budget becomes an argument of the optimizer); whether the adapter is one
shared module or one per country.
