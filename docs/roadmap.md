# Roadmap

Planned work, in priority order. Sources: the earlier modeling-refinement list
(what is done / not done is folded in below) and an external review of the US
engine's ACA / IRMAA / payroll-tax handling.

**Status (as of 2026-10-26):** on `main`: Phases 1 and 2, Batches 1, 2, 3, 7 and
E1-E3, the cliff plan, the IRMAA MAGI fix, the modular-build refactor (stages
0-4), the core regroup, Vitest, the stateless engine, the prep phase and Batch 5
through step 4d (the rest of Batch 5 is on hold, below); US V143 / Canada V64.
Every PR goes to `main`. This page holds the live order; the batch details, the
owner's decisions and the per-batch notes stay in `docs/next-batches-plan.md`.

## Current plan (revised 2026-10-22; supersedes the Phase 3 and "After Phase 2" lists where they differ)

**What changed (owner, 2026-10-22, after an assessment of the whole project):** the
refactor queue (TypeScript, centralized state writes, Vite, merging the engines) is
no longer a gate in front of feature work. It was ordered by technical dependency,
not by value, and the code is already modular, stateless, exact to the cent and well
tested. Instead: a short prep phase that lowers the cost and risk of everything after
it, then real users on the US planner, then the feature batches in an order their use
informs, with each remaining refactor pulled in only when a feature needs it.

Each batch (or sub-batch) is one PR into `main`, reviewed by the owner before the
next starts. The batch specs are the sections of `docs/next-batches-plan.md` named
below.

### Done
- **1. Historical parity (2B)** and gradual bond refill.
- **2. US tax and Medicare:** Medicare delayed while working, age-based and senior
  deductions, simplified itemizing.
- **3. Retirement accounts and early-withdrawal rules:** 3A per-partner account
  model, 3B penalty-aware withdrawals, 72(t) per account and Rule of 55; 3C
  redesigned as the cliff plan
  (`docs/superpowers/specs/2026-10-07-cliff-plan-design.md`).
- **7. Dependents and the tax update** (7A-7O): children, US federal credits, the
  state rules table (50 states and DC), the Canadian federal credits, the
  provincial rules table, the income-tested benefits.
- **IRMAA MAGI fix.**
- **E1-E3 (life events):** income character (E1a-E1e: contribution limits, income
  streams, self-employment, one-time income, inherited accounts), E2 adoption, E3
  the IRMAA appeal.
- **Modular build, stages 0-4** (below).
- **Core regroup** (`docs/superpowers/specs/2026-10-21-core-regroup-design.md`,
  `docs/superpowers/plans/2026-10-21-core-regroup.md`): `core/` and `ui/` are topic folders.
- **Vitest** (`docs/superpowers/specs/2026-10-21-vitest-design.md`, `docs/superpowers/plans/2026-10-21-vitest.md`):
  `tests/unit/` holds the `core/` suites, per planner, in a fresh module graph per test, run by `npm test`.
  Further conversions are follow-up, not a prerequisite.
- **Stateless engine** (`docs/superpowers/specs/2026-10-22-stateless-engine-design.md`,
  `docs/superpowers/plans/2026-10-22-stateless-engine.md`, PRs #28-31): `runProjection(ctx, ...)` and every engine module
  (its import closure, `computeCliffPlan`, `core/analysis/`, `core/optimizer/`) read a run context passed first and never
  the store; variants run on shallow copies through `variantContext` / a `contextFor` factory. Guarded by
  `tests/engine_purity.js` and `tests/unit/shared/engine-ratchet.test.js`; every stage was exact, parity-identical
  (`tests/analysis_parity.js`) and within the +5% timing gate.
- **The prep phase** (items 1-5 below, PRs #34-#43, 2026-10-23).
- **Batch 5, steps 0-4d** (PRs #44-#53, merged 2026-10-24 to 2026-10-26; the rest is on hold, see "Batch 5: on hold" below):
  0 the re-measured optimizer gap (#45); 1 the 162(l) deduction settled at the final draws (#44); 2 the objective registry,
  with the after-tax end value as the default (#46); 2b a withdrawal mix's shortfall falls through to the other stock
  accounts, not home equity (#47); Rhode Island and Pennsylvania tax a conversion by its source account (#48); 3a the cliff
  plan tries all six flat conversion brackets (#49); 4a the stored plan, Optimize -> Apply and per-phase lambda multipliers
  (#50); 4b the gains-capped stay-under (#51); 4c the tax-aware stock-account order as a plan lever, replacing the per-path
  live mix (#52); 4d the two-return draw split (#53). Specs: `docs/superpowers/specs/2026-10-23-b5-*`,
  `2026-10-24-b5-conversion-sizing-design.md` (Part B, per-year sizing, shelved there), `2026-10-24-b5-mix-fallthrough-design.md`, `2026-10-25-b5-stored-plan-design.md`.

### Next, in order

**Prep (done 2026-10-23; kept as the record):**

1. **Slim CLAUDE.md** (about a day; this is also the docs refresh). CLAUDE.md is about 175 KB, and every
   Claude session on the repo pays for it. Most of it is feature write-ups ("Architecture, per planner
   file" about 67 KB, "US vs. Canada" about 29 KB, "Files" about 22 KB, "Add-as-you-go lists" about 18 KB),
   while the rules every task needs (Commands, Where new code goes, Where a new test goes, Adding UI code,
   the testing checklist) are about 15 KB together. Target: CLAUDE.md at about 15-20 KB, holding the rules,
   the invariants that cause silent bugs (one context shape, the MAGI-iteration snapshot rules, `seOn`, the
   `needsPerPerson` flag, money-field parsing) and one pointer line per topic. Each feature write-up moves to
   `docs/architecture/<topic>.md` (MAGI iteration, the cliff plan, state tax, Canada benefits,
   self-employment, inherited accounts, ...), read only when touching that area. `tests/doc_paths.js` and the
   regroup tool (`scripts/lib/regroup.js`) check and rewrite the `src/` paths in CLAUDE.md: point both at the
   new folder too, and check that every topic file CLAUDE.md links to exists. A proposed outline of the new
   files goes to the owner before anything moves.
2. **Triage the root `test_*.js` scripts** (a few hours). The 19 Playwright scripts at the repo root have
   been through the module split, the core regroup and the stateless engine without CI running them. Run
   each once; fix and wire into CI (one Playwright step; each script must earn its run time) the ones that
   guard real UI behavior (the wizard, children, income streams, inherited accounts, ...); delete the rest.
   **Done (2026-10-23):** all 19 passed and each covers something `npm test` does not, so none was deleted (owner
   decision). `tests/ui_scripts.js` runs every root `test_*.js`, two at a time (`npm run test:ui`, about 4 minutes), as its
   own CI step after `npm test`. The three optimizer scripts check the engine through hooks: moving them to Vitest is a
   later task.
3. **Responsiveness** (one to two days; two PRs; proposal
   `docs/superpowers/specs/2026-10-22-responsiveness-proposal.md`). Each slider step runs `render()` synchronously:
   about 30 ms in the default view, but about 1.25 s in the Monte Carlo view (1,000 paths re-run per step), and
   Monte Carlo is unseeded, so its success rate changes on any re-render. PR A: seed Monte Carlo from the inputs
   (mulberry32, as `tests/historical_rates.js`), and add a bounded result cache for `simulate` /
   `runHistoricalCycles` / `runMonteCarlo` in the store layer, keyed on the tax year, the state JSON, the plan, the
   overrides and the call's arguments (safe since the stateless engine; same pattern as `cliffPlanCache`);
   `snapshot_ui` moves for the Monte Carlo figures only, stated. PR B: field listeners call `scheduleRender()`: the
   cheap part once per frame, the Monte Carlo and historical views and the open analysis cards on release or after
   about 250 ms idle (dimmed while stale); programmatic callers keep a synchronous `render()`; tests flush with
   `__test_flushRender()`; timing script `tests/bench_input.js`. After item 2 because the root UI scripts are what
   catch a control that stops refreshing; before real users because a frozen slider and a jittering success rate
   are first-impression problems.
   **PR A done (2026-10-23, #37):** seeded Monte Carlo, the Monte Carlo summary and the bounded result cache
   (`docs/superpowers/specs/2026-10-23-responsiveness-a-design.md`). **PR B** (deferred rendering):
   `docs/superpowers/specs/2026-10-23-responsiveness-b-design.md`.
4. **Correctness spot-check** (a day or two), before real people make decisions with it: run 4-6 households
   (a single person, a couple, an ACA-cliff case, an RMD and IRMAA case, one Canada household) against the
   IRS and state worksheets, the CRA calculator or a second calculator, one tax year at a time (a year's
   federal and state tax, the ACA premium credit, the IRMAA tier), since no outside tool models a whole
   projection the same way. It catches the errors where a test and the code share one misunderstanding.
   Record the households and the sources in the verification backlog of `docs/next-batches-plan.md`.
5. **Optimizer wording** (about an hour; the wording item of Batch 5, pulled forward): the UI says the
   optimizer "searches for a tax-efficient strategy", not that it finds the best one (coordinate ascent over
   a discontinuous objective is not a global optimum), so nobody treats its output as the single right
   answer for a real conversion decision.
   **Done (2026-10-23, branch `claude/optimizer-wording`):** the cards are now the "Roth conversion bracket
   search", the "RRSP meltdown bracket search" and the "Withdrawal & conversion strategy search" (buttons
   "Search →"); "Recommended" became "Suggested"; the per-year and multi-lever results say the search can miss
   a better schedule; the live toggle is the "Tax-aware withdrawal order". Text only (`snapshot_ui` text
   hashes moved; projections identical).

**Then real users (in parallel with the next batch):** hand the US planner to its first real users (family
members around 60 whose questions are Roth conversions and a bond bucket, both already built). What they
trip over decides the feature order below: anything that stops them getting an answer they trust (a
confusing input, a missing account type, a result they cannot interpret) jumps to the front, even if it is
not on this list. Batch 5 ran first, through step 4d (Done, above).

**Batch 5: on hold (owner, 2026-10-26, after 4d).** Resumed by the owner's decision only, for example once the users'
questions show what the optimizer must answer. The full record is the "Step 4 summary, for step 5" in the 4d notes of
`docs/next-batches-plan.md` ("Batch 5 step 4d"). What is left:
- **The gap to `optimizeMultiLever`** (the slow reference; after-tax end value, real, toggle off): TX 3.2% / 4.6%, CA
  4.5% / 1.5%, NY 1.3% / about 0 (life expectancy 75 / 100). Steps 4a-4d did not move these; the notes put the rest on
  conversion sizing and the per-year mix the reference tunes. At length 100 they are lower bounds (the reference's
  30-year window cut).
- **A yardstick that does not depend on `optimizeMultiLever`** (a capless reference, plus a two-return gap case: the
  gap set has none), needed before step 5 retires it.
- **The missed MFJ 62 IRMAA tier-1 fill:** filling traditional income to just under IRMAA tier 1 at 66 gives +5.6% real
  end value (about $110k) that the automatic plan misses. It matches the first users' profile (a couple about 60
  asking about Roth conversions). Three routes are recorded: a fill-to-just-under-a-cliff plan intent, relaxing 4c's
  A15 (a) so a conversion year can take an order, or a conversion bracket sized to the IRMAA line.
- **Optimize is slower on some two-return households** (11-19 s cold against 9-15 s before 4d on the worst one measured).
- **Step 5:** retire `optimizeMultiLever` and the age-keyed schedules (`appliedRothSchedule`, `appliedMixSchedule`)
  in favour of the stored plan, and decide the 30-year cap (`ROTH_PER_YEAR_MAX_WINDOW`).
- **Shelved:** step 3b, per-year conversion sizing (Part B of `docs/superpowers/specs/2026-10-24-b5-conversion-sizing-design.md`,
  with its revision list R1-R13), if the yardstick shows conversion sizing still leaves room.
Suggested order when it resumes: the yardstick and the fill-to-just-under-a-cliff candidate first, then step 5.

**Then the feature batches** (default order; the users' feedback reorders it):
- **E4. State relocation (US)** (`docs/next-batches-plan.md`, "Batch E: life events", E4).
- **6. Social Security and others** (`docs/next-batches-plan.md`, "Batch 6"): guided PIA estimate, claim-age
  rules, spousal and survivor benefits, trust-fund benefit-cut what-if; HSA; CPP/OAS claim-age basis; loose
  ends. Its first task is unit tests for the Social Security module (about 42% covered today). E4 and 6 may
  swap if the users' questions are about Social Security first.
- **4. Canada** (`docs/next-batches-plan.md`, "Batch 4"): 4A mixed withdrawals, 4B the optimizer port. The
  engine merge is decided here (below). After the US work because the US planner has the real users.
- **8. Social Security survivor-claim optimizer** (`docs/next-batches-plan.md`, "Batch 8"): when a surviving
  spouse should start the survivor benefit and their own benefit, and when to switch, in both orders.

Later, not scheduled: E5 (real assets), the Canada province move, and Monte Carlo in a Web Worker (the engine is
DOM-free and context-driven, so it can run off the main thread; the single-file build would need the worker inlined
from a Blob URL, to check in Safari and Firefox; only if prep item 3's deferral and cache are not enough).

### The remaining refactors: pulled in on demand, never a gate

The rest of section 11 of `docs/superpowers/specs/2026-10-10-modular-build-design.md` no longer has its own
slots (the earlier order, by dependency, was TypeScript, centralized state writes, Vite, merging the engines):
- **Centralized state writes:** small; done inside whichever batch next touches the input or undo path.
  CLAUDE.md ("Who reads the store") lists today's sanctioned writes. Dependency-tracked recomputation (re-running
  only what an input affects), if it is ever wanted, belongs here too.
- **TypeScript:** no conversion. Add `// @ts-check` with JSDoc types on `core/`, checked by `tsc --noEmit` in
  `npm test`; no change to the build or the single-file output. Start with the run context (one `RunContext`
  typedef would have caught the stateless engine's context-shape slip) and the modules a batch is already
  editing; expand only if it earns its keep. The convention differences the stateless engine left (functions
  taking `inputs` rather than `ctx`, `lambdaEstimate({ ..., ctx })`, `wd.ctx`) are listed in CLAUDE.md for it.
- **Vite:** dropped. `npm run dev` already rebuilds on save, and the unit tests need no build; a second
  toolchain is not worth a seconds-level gain.
- **Merging the US and Canada engines:** decided at Batch 4. If porting the optimizer to Canada would mean
  writing it twice, merge then; otherwise leave the two year loops separate, as they were kept on purpose
  (`docs/phase2-refactor-plan.md` section 7, step 4.5). The largest and riskiest refactor, so it happens only
  for a concrete payoff.

Documentation: `docs/reference.md` is updated once, after the last batch, from
the per-batch "Batch notes" kept in `docs/next-batches-plan.md` (the one exception
so far: the modular-build refresh of its layout sections, 2026-10-21). The
CLAUDE.md split (prep item 1) moves feature write-ups to `docs/architecture/`; it
does not replace that consolidation.

Not modeled by decision: charitable itemized deductions, Medicare late-enrollment
penalties, the Social Security earnings test, WEP/GPO (repealed), territories
(Canada), local income taxes (except a flat county rate for MD and IN, 7D).
Medical expenses over 7.5% of AGI are deducted since 7O.

## Phase 0: baseline
- `npm test` green (golden, historical_tax_indexing, dividend_income,
  medical_inflation, irmaa_gating, roth_early_access, tax-brackets (Vitest),
  historical_bond_yield, rmd_age).
- Confirm CI is green on `main` (Actions tab).

## Phase 1: bug fixes (US unless noted) — done
Each item is its own commit with its own test; docs and the version badge are
updated in the same commit.

1. **IRMAA startup MAGI.** Inputs for MAGI one and two years before plan start;
   used for the 2-year lookback in years 0 and 1, simulated MAGI afterward.
   Blank inputs keep the old behavior (year-0 MAGI stand-in).
2. **IRMAA boundaries.** Exact CMS thresholds with `<` comparisons instead of
   `749999` / `499999`.
3. **Additional Medicare Tax.** 0.9% of wages above $250k (MFJ) / $200k (single);
   statutory, not indexed.
4. **ACA coverage model.** Explicit per-partner coverage (employer / ACA /
   other) and whether a working partner's employer plan covers the spouse;
   default reproduces the old "ACA only once both have stopped working" rule.
5. **ACA MAGI iteration.** Compute ACA MAGI including this year's discretionary
   withdrawals and conversions by iterating to convergence; applies to the
   subsidy, the displayed healthcare cost, and the 400%-FPL cliff guard the
   Roth-conversion sizing uses.

Canada has no ACA, IRMAA, or Additional Medicare Tax equivalent. The Canada
survivor-income loose end was checked in this phase and was a real bug (fixed,
with the US extra-income variant; see `docs/reference.md`).

## Phase 2: refactor (separate branch, not merged back) — done
All four items are complete (see `docs/phase2-refactor-plan.md`; item 4 was shared regions kept in sync by `scripts/sync-shared.js`, later replaced by the modular build (below), with the two `runProjection` year loops deliberately left per-country). Deferred follow-ups are listed under "After Phase 2".
No behavior change; `npm test` must stay identical throughout.
1. Merge `simulate()` and `simulateHistorical()` into one engine; only the
   per-year return/inflation source differs.
2. Extract per-year helpers (coverage/ACA eligibility, MAGI, healthcare cost,
   withdrawal cascade).
3. Consolidate the `ids` / `syncControls` / `syncContributionControls` wiring
   into a single field registry.
4. Share structure between the US and Canada planners (files stay
   self-contained; no build step). (Superseded by the modular build.)

## Modular build (stages 0-4) — done
The source moved to `src/` as ES modules, with an esbuild build to one
self-contained file per planner in `dist/` (CI keeps the build as an artifact; the Pages deploy
was removed on 2026-10-22: the repository is private); no
behavior change. Specs: `docs/superpowers/specs/2026-10-10-modular-build-design.md`
and `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`. Stage 4 was merged by
PR #24. The follow-ups are in "Current plan".

## Phase 3: remaining items (a branch per group)
- **Done (Batch 2).** **Medicare enrollment:** configurable (still working at 65, employer
  coverage, delayed Part B).
- **Done in part, the rest on hold: Batch 5** (steps 0-4d; see "Batch 5: on hold" in "Current plan"). **Optimizer:** user-selectable objective (lifetime tax, healthcare cost,
  ending net worth, legacy, IRMAA, ACA subsidy, RMDs, balanced); raise or remove
  the 30-year cap (`ROTH_PER_YEAR_MAX_WINDOW`) if performance allows; reword UI
  as "searches for a tax-efficient strategy" (coordinate ascent over a
  discontinuous objective is not a global optimum). The wording is pulled forward into the
  prep phase (Current plan, prep item 5).
- **Done (Batch 2; medical in 7O).** **Itemized deductions** (mortgage interest, charity/QCD, medical, SALT) and
  **age-based deductions** (65+ additional standard deduction, the temporary
  senior deduction with phase-out). Build together; verify current IRS rules
  and the SALT cap first.
- **Done in part (7C/7D: each state's notes show under the selector; local taxes only for MD and IN).** **State-tax scope:** state clearly in the UI that the state model is
  simplified (no local taxes, some credits, state itemizing, pension exclusions,
  after-tax IRA basis, some capital-gain rules, phase-outs).
- **Open: Batch 6.** **Social Security:** ssa.gov estimate assumes earnings continue to claiming
  (too high for an early retiree); no trust-fund benefit-cut scenario; spousal
  and survivor rules simplified.
- **Open: Batch 6.** **HSA** account type.
- **Age and pension credits done (7J); CPP/OAS claim ages open (Batch 6).** **Canada:** federal age amount and pension income credits (verify current
  amounts); CPP/OAS claim-age adjustments (a design decision, since it changes
  saved scenarios).

## After Phase 2 (decided, not yet scheduled)
Done in a follow-up branch started once the exact refactor (2A) is green, in
this order, each its own commit with a before/after on the default scenario's
historical and Monte Carlo success rates:
- **Done (Batch 1).** **Historical parity (2B):** the backtest/Monte Carlo engine gains what the
  standard engine already has: pre-retirement bond ladder (sized from plan
  inflation), smooth withdrawals, applied/override and live withdrawal mix,
  MAGI safe room, the `age` argument to `solveRothConversion`, and the extra
  row columns (US all; Canada ladder, smooth, columns only).
- **Done (Batch 1).** **Gradual bond refill (historical only):** in up years move at most one year
  of that year's expenses from stocks into the bond bucket until it reaches its
  target (today it refills all at once). The standard projection never refills.
  Down years: cash, then bond buckets, then stocks via the mix modes.
- **Done (3B).** **Penalty-aware mixed withdrawals (US, both engines):** when the 10% early
  penalty applies, draw taxable first, honor Rule of 55 / 72(t), and apply the
  mix (smooth/applied/live) only where no penalty is owed. Changes standard
  and historical numbers together; see `docs/phase2-refactor-plan.md` A.5.
- **Superseded (3C, by the cliff plan).** **Use the safe-MAGI room wherever withdrawals are chosen (US):** today
  `magiSafeRoom` (the headroom under the ACA 400%-FPL cliff and the next IRMAA
  tier) caps only the Roth conversion and the live withdrawal mix. The default
  draw, smooth withdrawals, and the applied/optimizer mix schedules ignore it, so
  they can push MAGI over a cliff that the engine then merely charges for.
  Make every withdrawal path respect the remaining room (prefer drawing taxable
  gains or Roth when traditional would cross a cliff, within the same
  penalty-aware rules), in both engines, with the ceiling computed every year
  (`usesMagiRoom` on for the bucket mode). Lands with or right after the
  penalty-aware mixing change; it changes standard and historical numbers, so a
  before/after on the default scenario is required. See
  `docs/phase2-refactor-plan.md` A.7.
- **Open: Batch 4A.** **Canada mixed withdrawals:** taxable / RRSP / TFSA mix, with the OAS
  clawback threshold as the income-room limit and no penalty gating; needs the
  shared withdrawal module from Phase 2 first (A.6).

## Loose ends
- ~~Canada survivor period: partner B's income zeroed when partner A dies
  first.~~ Confirmed and fixed in Phase 1 (V33 Canada, V74 US for the
  extra-income variant); see `docs/reference.md`.
- The standard projection (not the historical one) taxes bond interest at the
  `Bond return` input, a total return used as a proxy for the coupon.
- The 2024 Treasury yield uses January 2024 (4.06%) because no December 2023
  value was supplied. Decided: keep the recorded 2023-2025 yields as they are.
- The CPI column's source is not recorded (matches Dec-to-Dec CPI-U through
  2022; 2023-2025 unchecked).
- Backlog (owner, 2026-10-24: negligible, not scheduled): in the US
  `withdrawStandard` tail used when no penalized money exists, a taxable
  bisection overshoot leaves `wd.need` slightly negative and
  `takeRoth(wd, 'roth', wd.need)` returns that fraction of a cent to Roth, even
  a Roth of 0 (0.00787 in year 0 of the `roth-empty equals no-mix` household of
  `tests/unit/us/mix-fallthrough.test.js`, whose 5-cent tolerance it causes). The
  penalty-aware tail clamps first and the bucket step guards `need > 0`. A fix
  (clamp before the tail, or `rothDraw` ignoring a non-positive target) moves
  cents in many snapshot scenarios; check Canada's cascade for the same pattern;
  then make that test exact.

## Verified as not needing changes
2026 ACA FPL values (the subsidy uses the prior-year FPL); the two-year IRMAA
lookback itself; federal brackets and standard deduction; LTCG thresholds;
Social Security taxation; NIIT; RMD ages/divisors.
