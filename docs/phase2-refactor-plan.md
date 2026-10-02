# Phase 2 refactor plan

Scope: the four Phase 2 items in `docs/roadmap.md`. **No behavior change.**
Branch: `claude/tender-meitner-a3bo59` (based on `15d5d00`, the Phase 1 merge;
US V74 / Canada V33). Not merged back to `main` until every step below is
green.

## 1. What the code looks like today (measured)

| | US | Canada |
|---|---|---|
| File size | 11,253 lines | 8,682 lines |
| `simulate()` | ~1,066 lines | ~675 lines |
| `simulateHistorical()` (+`Core`) | ~813 lines | ~570 lines |
| `ids` array | 80 entries (L1227-1306) | ~76 entries |
| `syncControls` + `syncContributionControls` | ~166 lines | ~138 lines |

- **Shared code is already almost verbatim.** Of 145 top-level functions in
  both files, **126 are byte-identical (~2,270 lines)**: all the charts,
  scenarios, dynamic lists, Sankey, mortgage/loan schedules, undo, wizard,
  etc. The 19 that differ are the real US/Canada divergence (`simulate`,
  `simulateHistoricalCore`, `taxFor`, `normalizeState`, `render`,
  `syncControls`, ...) plus small cosmetic drift (`renderChartView`,
  `buildPrintReport`, `initChartHover`, ...).
- **The two engines are not the same model with a different return source.**
  The roadmap wording ("only the per-year return/inflation source differs") is
  out of date. `simulateHistoricalCore` is a distinct *bucket strategy*
  backtest. Measured against `simulate()` it:
  - uses a step-function waterfall (`stepCash` / `stepBondTaxable` / ... /
    `stepHome`) with a down-year / up-year branch (`yearReturn < 0`) instead
    of `simulate()`'s single cascade;
  - refills the bond reserve in up years (`bondTarget = ... * bondYears`) and
    has no pre-retirement bond-ladder rotation (`ladderTarget`,
    `rotationStartYear`, `projectedExpense` exist only in `simulate()`);
  - has **no** applied/override withdrawal-mix, live-mix
    (`pickLiveWithdrawalOrder`), smooth-withdrawal, or `magiSafeRoom` handling,
    and calls `solveRothConversion(profile, cap, year)` without the `age` key;
  - tracks `cumFactor` (actual inflation) and `histTaxFactors` instead of
    `Math.pow(1 + infl, year)`, and uses the dataset's bond yield for taxable
    interest instead of `bondReturn`.
  - Some of these differences look deliberate, some look like features that
    were added to `simulate()` only. **They have to be classified before
    merging** (step 2.0), because "no behavior change" applies to *both*
    engines' current outputs.
- Wiring a field touches up to four places: `defaults`, `normalizeState`,
  `ids` (or a hand-wired listener), and one of `syncControls` /
  `syncContributionControls`, plus the MCP allow-list. This is the repo's most
  common bug (`CLAUDE.md`).
- The US file's whole app is one 10,500-line IIFE; most "helpers" close over
  `state`, `currentYear`, `histTaxFactors`, and the roth override variables.

## 2. Guiding rules

1. **Characterization first.** `npm test` only covers hand-built golden
   scenarios; it will not notice a 0.01% drift in an untested path. Before
   touching any engine code, build a snapshot harness (step 0) that proves
   "byte-identical output" over a wide scenario grid. Every later step must
   pass it with **zero tolerance**.
2. **One step = one commit** (or a small group), each leaving `npm test` and the
   snapshot harness green, with README / `CLAUDE.md` / `docs/reference.md`
   updated in the same commit. Version badges are **not** bumped for pure
   refactor commits (no user-facing change); one bump at the very end, noted as
   "internal refactor" so a screenshot still identifies the build.
3. **Order by risk**: tooling and tests, then the mechanical/low-risk items,
   then the risky engine merge, then cross-file sharing last. (This reorders
   the roadmap numbering; see section 7.)
4. **Constraints preserved:** each `.html` stays self-contained and works
   opened from disk; stable filenames; no framework. `window.__test_*` hooks,
   `window.fireProjectionRows`, the MCP tool hooks, and every element ID keep
   working so existing `tests/*.js` and `test_*.js` run unmodified.

## 3. Step 0: safety net (before any refactor commit)

0.1 **Baseline.** `npm install`, `npm test` green, record the output. Run the
    root `test_*.js` Playwright scripts once and record pass/fail (they are not
    in CI, so know which already fail).

0.2 **Snapshot harness: `tests/snapshot.js` + `tests/snapshots/*.json`.**
    Loads each planner in Playwright, and for every scenario in a fixed list
    calls `window.__test_simulate(...)` and `window.__test_simulateHistorical(
    rowFn, ...)` and serializes `rows`, `depletedAge`, and every other returned
    field to JSON (full precision, `JSON.stringify` of numbers, stable key
    order). First run writes the baseline from the *unrefactored* code
    (`--update`); later runs diff exactly. Scenario grid, per planner:
    - the default state; couple vs single; `mfj` vs `single` with `marryLater`;
    - retirement ages shifted (the +/-1 and +/-3 comparison paths);
    - survivor on/off, deceased partner A and B;
    - each withdrawal path: default cascade, `smoothWithdrawals`,
      `withdrawalMixEnabled` (live), an applied mix schedule, Roth override;
    - Roth conversions on (ACA-gated and IRMAA-gated, US), RMDs, 72(t)/Rule of
      55 (US), pension splitting (CA);
    - bond reserve / ladder on, guardrails on, loans, extra income/expense
      lists, one-time items, spending tiers, `rentThenBuy`;
    - each of the above again through `simulateHistorical` with: a down-year-
      first series (1929, 1966, 2000), an up series, high-inflation (1973),
      and two seeded Monte Carlo bootstrap paths (pin the random source so MC
      is reproducible; do not snapshot `Math.random`).
    - US also: ACA on/off with employer-coverage flags, IRMAA startup MAGI
      inputs, MAGI iteration convergence cases.
    Target 150-300 scenarios per planner; the file lives in CI via `npm test`.
    Also snapshot the *derived* surfaces the UI reads, so refactors of render
    helpers are covered: `window.fireProjectionRows` for the default state,
    the Roth optimizer result, the tornado/sensitivity numbers, the
    historical-cycle success rate, and the Monte Carlo success rate (seeded).

0.3 **Field-wiring snapshot** (needed for item 3): a test that, for every
    element in the sidebar, sets a value through the real DOM, then asserts
    `state[...]` and a re-sync round trip (`state -> DOM`), plus export/import
    scenario JSON round-trip, and the MCP `update_fire_assumptions` /
    `read_fire_projection` schema (names + types) dumped to a snapshot. This
    is what stops the "wired into the wrong sync function" class of bug during
    step 3.

0.4 **Add the new tests to `package.json` `test` and CI.** Also add a cheap
    `pageerror` / console-error check on load for both planners and both modes
    (mobile 390x844 included, with the `scrollWidth > clientWidth` assertion
    from the testing checklist).

0.5 **Tripwire for dead code.** Record the list of currently-unused functions
    (`grep` each top-level name for a second reference) so deletions during the
    refactor are deliberate.

Exit criterion: snapshot harness passes on an untouched tree, fails when a
single constant in `simulate()` is nudged (verify by mutating one number and
confirming a failure, then reverting).

## 4. Step 1: extract per-year helpers (roadmap item 2, done first)

Doing this *before* the merge means the merge compares small pure functions
instead of two 1,000-line bodies. Each helper is extracted from `simulate()`
first, snapshot-verified, then the matching code in `simulateHistoricalCore`
is switched to call it only where the two bodies are already textually equal
(a diff of the extracted block proves this). Where they differ, the
difference becomes an explicit parameter or is left for step 2.

Candidates (US names; Canada gets the analogous subset):

1. **Context/setup**: the per-run constants block (rates, `futureBuy`,
   `schedule`, `loans`, `wageGrowth`, survivor flags, `projectedExpense`,
   `ladderTarget`). Return one frozen `ctx` object. `projectedExpense`
   currently appears in `simulate()` only and duplicates shelter/healthcare/
   LTC math that the year loop also computes: derive both from one
   `yearExpenses(ctx, year, factor, ...)` helper (the year loop's own expense
   lines must match `projectedExpense` exactly; assert this in the snapshot).
2. **`coverageAndAca(ctx, ...)`**: wraps `acaEligibility`, premium, subsidy
   (`acaNetCost`), Medicare gating (US).
3. **`computeMagi(...)`** and the **MAGI-iteration shell**: the
   `for (let iter...)` snapshot/restore/`continue` logic becomes a helper that
   takes a `yearBody(est) -> result` closure plus a snapshot/restore pair,
   so the rules in `CLAUDE.md` (every mutated balance must be in
   `yearSnapshot`, no stray `continue`) are enforced in one place and not
   restated in two engines. `MAGI_ITER_TOL` / `MAX` and the damping after pass
   3 are unchanged.
4. **Income assembly**: wages, SS (US) / CPP+OAS (CA), pensions, extra income
   streams, one-time income, survivor remap into the A slot.
5. **Tax glue**: building the `profile` object for `taxFor`, FICA, Additional
   Medicare Tax, the `totalTax` correction after the waterfall.
6. **Roth conversion sizing**: the `magiCeiling` / `magiSafeRoom` /
   `conversionCap` / `solveRothConversion` block.
7. **Withdrawal cascade**: one function `withdraw(state, need, opts) ->
   { taken..., earlyPenalty, taxableGainGross, traditionalGross, resolvedMix }`
   per strategy. Start with the `simulate()` cascade (applied-mix, live,
   smooth, default) and the bucket step functions as two named strategies
   behind the same signature (see step 2). Balances are passed in a small
   mutable `bal` object (`taxable`, `taxableBasis`, `traditional`, `roth`,
   `cash`, `bond*`, `home`, `rothLedger`) instead of ~12 closure `let`s, which
   also simplifies `yearSnapshot` to a single `structuredClone`-style copy.
8. **Contribution / surplus routing** (`flow >= 0` branch).
9. **Row assembly**: the big `rows.push({...})` object literal, built by one
   `buildRow(...)` so adding a column is a one-place edit.

Rules while extracting: pure functions take everything via arguments (no new
closure reads of `state` inside helpers where an argument is cleaner);
numerical operations keep the same evaluation order (floating-point addition is
not associative; reordering a sum changes the last bit and the snapshot will
catch it, which is the point); do not "fix" anything found on the way, record
it in `docs/reference.md` under "found during Phase 2" and open a separate
change after the refactor.

## 5. Step 2: merge `simulate()` and `simulateHistorical()` (roadmap item 1)

2.0 **Difference audit.** Produce a table of every difference between the two
    bodies (the numbers above are the start), each classified:
    - *Source difference* (returns, inflation, bond yield, tax-index factor):
      belongs in the pluggable "year source".
    - *Strategy difference* (bucket-strategy waterfall, bond refill rule,
      ladder rotation): belongs in a pluggable "withdrawal strategy".
    - *Accidental drift* (a feature present in one engine only, with no
      reason it should be): **do not silently unify.** Unifying changes the
      historical numbers, which violates the contract. Keep behavior via an
      explicit flag (`strategy.supportsMixOverrides = false`) and list each as
      a follow-up bug/feature in the roadmap.
    Review this table with the user before 2.1; it is the one place where a
    product decision (is the backtest *supposed* to ignore withdrawal-mix?) is
    needed.

2.1 **Design.** One `runEngine(ctx, yearSource, strategy, retireAgeA,
    retireAgeB)` loop. 
    - `yearSource(year) -> { stockReturn, inflation (-> cumulative factor),
      bondReturn, bondYield, taxFactor }`. `simulate()` supplies a constant
      source from `state`; historical supplies `rowFn(year)` and keeps its own
      `cumFactor` / `histTaxFactors` handling (including the existing
      save/restore of `histTaxFactors` in the `try/finally`).
    - `strategy` = the withdrawal cascade + bond-reserve rules from step 1.7.
      `'standard'` and `'bucket'`.
    - `simulate(...)` and `simulateHistorical(...)` stay as thin public
      wrappers with the same signatures and return shapes, because tests and
      render code call them by those names (`window.__test_simulate`, etc.).
    - Return object is the **union**; consumers that only read the old fields
      are unaffected. Fields one engine never set (`firstWithdrawal` in the
      historical return) keep their previous value/absence; snapshot decides.

2.2 **Migration order** (each commit snapshot-green):
    1. Move the shared prelude/setup into the common function (already
       extracted in step 1).
    2. Switch the **standard** path to `runEngine` while historical still runs
       its old code. Snapshot proves `simulate` unchanged.
    3. Port historical onto `runEngine` with `strategy = bucket`. Snapshot
       proves historical unchanged across the whole scenario grid and the MC /
       backtest paths.
    4. Delete `simulateHistoricalCore`'s now-dead body.
    5. Confirm the +/-1yr/+/-3yr, Monte Carlo (`runMonteCarlo`,
       `bootstrapReturnSeries`) and `simulateAtRealCagr` callers still go
       through the public wrappers only.

2.3 **Performance gate.** `simulate()` is called thousands of times per render
    (MC paths, tornado, optimizer). Benchmark before/after (render time for the
    default scenario with MC and the optimizer open, plus `npm test` wall
    time). Acceptance: within +5%. If object-allocation in `bal`/`buildRow`
    regresses it, keep rows as plain object literals and reuse the `bal`
    object across years.

Canada: same procedure, simpler (no ACA/IRMAA/72t/MFJ branches); do it after
the US version is stable and port the *same* helper signatures.

## 6. Step 3: single field registry (roadmap item 3)

Goal: declare each field once; derive `ids`, defaults wiring, `state -> DOM`
sync, `DOM -> state` listeners, `normalizeState` guards, and the MCP
schema/allow-list from it.

3.1 **Design.** A `FIELDS` table of descriptors, e.g.
    `{ id, type: 'number'|'money'|'bool'|'enum', default, min, max, values,
      group, sync: 'controls'|'contrib', visibleIf, onChange, mcp: true }`.
    Plain-numeric fields are pure data; fields with side effects keep a custom
    `onChange`/`syncExtra` hook in the same descriptor (not scattered across
    listeners). `defaults` is generated from it (non-registry nested
    structures, the DYN lists, keep their existing specs).
3.2 **Preserve the two sync passes explicitly.** `syncControls()` and
    `syncContributionControls()` exist because some controls must update in a
    particular order / at a particular moment; the registry's `sync` field
    records which pass owns a control and the two functions become loops over
    the registry (with the existing hand-wired exceptions as hooks). This
    removes the most common bug without changing sequencing. Keep the
    focused-field no-op guard (mobile keyboard fix) intact; it is
    load-bearing.
3.3 **Migration order**: (a) generate `ids` from the registry and assert it
    equals the old array (set and order), then delete the old array;
    (b) move enum guards from `normalizeState` into descriptors, asserting
    `normalizeState` output is byte-identical over the saved-scenario corpus;
    (c) move boolean/enum listeners; (d) derive the MCP schema and verify
    against the step 0.3 schema snapshot; (e) convert both sync functions.
    The legacy-migration code in `normalizeState`/`normalizeLists`
    (`sepp72tEnabled`, `bridge*`, `otherLoansEnabled`, ...) stays hand-written
    and is covered by a **legacy-save corpus test**: a set of old-format
    scenario JSON files committed under `tests/fixtures/` that must normalize
    to the same state as today.
3.4 **Guard test:** every sidebar input in the DOM has a registry entry (or an
    explicit allow-listed exemption such as the `.swr-input` boxes synced by
    hand), and every registry entry exists in the DOM. A new field that is not
    registered then fails CI instead of silently not syncing.
3.5 Docs: replace the "`ids` / two sync functions" guidance in `CLAUDE.md`
    with the registry rules; keep a short "how to add a field" recipe.

## 7. Step 4: share structure between US and Canada (roadmap item 4)

Constraint: **no build step** and each file stays self-contained, so the
options are:

| Option | How | Cost / risk |
|---|---|---|
| **A (recommended): marked shared regions + sync script** | Wrap the byte-identical code in `// @@shared:<name> begin/end` markers inside both files. `scripts/sync-shared.js` owns the canonical copy (`shared/*.js` fragments), rewrites the regions in both HTML files, and `--check` fails CI if they drift. Opening either `.html` file needs nothing else. | Not a build step in the "required to run" sense (outputs are committed), but it is a dev-time tool; CLAUDE.md's "no build step" text must be reworded to "no build step needed to run; shared regions are synced by `scripts/sync-shared.js`." |
| B: a `src/` tree + a bundler producing the two files | Real modules | Introduces a build; contradicts the project's central design. Not recommended. |
| C: leave duplicated, add a drift test only | `tests/shared_drift.js` compares the 126 identical functions | Cheapest, but every shared edit is still done twice by hand. |

Plan for A, in order:
4.1 Resolve the **cosmetic drift** first (the ~14 same-name functions that
    differ only trivially, e.g. `renderChartView`, `initChartHover`,
    `buildPrintReport`, `renderGroupSummaries`): move the real differences
    behind small per-planner config (strings, a province/state label, a
    feature flag) so the body becomes identical. Snapshot + a UI test per
    function.
4.2 Introduce `shared/` fragments and `scripts/sync-shared.js` with `--check`;
    first region = the existing 126 identical functions, **verified
    byte-identical before and after** (the script must produce a zero diff on
    the first run).
4.3 Add `npm run sync` and `npm run check:shared`; wire `check:shared` into
    `npm test` and CI.
4.4 Shared CSS (~255-line `<style>` block: confirm what differs first) and
    shared HTML scaffolding (topbar, scenario panel, chart cards) get the same
    treatment, last, because a markup region is harder to verify than JS.
4.5 Share the *engine skeleton* from step 2 (`runEngine`, `buildRow`,
    MAGI-iteration shell, bucket strategy), with country-specific pieces
    injected through the `ctx`/hook object (`taxFor`, income assembly,
    healthcare/Medicare, penalties). The US/Canada divergences listed in
    `CLAUDE.md` stay as divergences, expressed as injected hooks, **not**
    forced to merge. (Do not port `medicareYearly`, 72(t), or `rrifMinPct`
    across.)
4.6 Update `CLAUDE.md` (Architecture + "US vs Canada") and the file-structure
    paragraph; `index.html` unchanged.

## 8. Order of work and verification gates

| # | Work | Gate before the next step |
|---|---|---|
| 0 | Tooling and snapshot harness (3 above) | Baseline recorded; mutation check fails as expected |
| 1 | Per-year helpers (US, then Canada) | Snapshot exact; `npm test` green |
| 2 | Engine merge (US, then Canada) | Snapshot exact incl. historical/MC; perf within +5% |
| 3 | Field registry | Wiring + schema + legacy-corpus tests; mobile check; manual smoke of the wizard, undo, scenario import/export |
| 4 | Shared regions | `check:shared` clean; both files open from disk with no console errors |
| 5 | Wrap-up | Docs updated; version badge bump ("internal refactor"); full Playwright sweep of the root `test_*.js`; line-count report |

After every step: `npm test`, snapshot harness, relevant `test_*.js`, mobile
width check, and a real-browser look at both planners (page errors, layout,
one scroll gesture on the sticky areas).

## 9. Risks and mitigations

- **Floating-point drift** from reordering sums: exact (not tolerance)
  snapshot comparison; keep operation order.
- **MAGI iteration state leak**: any balance not in `yearSnapshot` makes pass 2
  start dirty. The `bal` object makes the snapshot automatic; keep
  `tests/aca_magi_iteration.js` green at every commit.
- **Historical backtest silently changes** (largest risk): the difference audit
  plus a strategy flag instead of unification; historical snapshot grid with
  fixed series and seeded MC.
- **Closure state** (`histTaxFactors`, Roth/mix overrides, `currentYear`):
  extracted helpers must not capture them implicitly; pass explicitly or keep
  them in the single module scope, and keep the `try/finally` restore.
- **Performance** in hot loops: gate at 2.3.
- **Saved-scenario compatibility**: legacy corpus test in step 3.
- **Scope creep**: any bug found goes to `docs/reference.md` and the roadmap,
  not into a refactor commit.
- **Merge conflicts with Phase 3** (separate branch, later): Phase 3 touches
  the same engine; land Phase 2 first or rebase Phase 3 onto it. Say so in the
  PR.

## 10. Decisions needed from the owner

1. Approve **Option A** (marked shared regions + sync script) for item 4, and
   the matching rewording of "no build step" in `CLAUDE.md`.
2. Review the **difference audit table** (step 2.0) before the engine merge:
   specifically which historical-vs-standard differences are intentional.
3. Confirm the **order** (helpers before engine merge, registry before sharing)
   and that the roadmap's item numbering can be updated to match.
4. Confirm pure-refactor commits do **not** bump version badges, with a single
   bump at the end.

## 11. Definition of done

`npm test` (including the new snapshot, wiring, drift, and legacy-corpus
tests) passes with outputs identical to the pre-refactor baseline; root
`test_*.js` results unchanged; both planners load with no page errors at
desktop and 390x844 widths; one engine implementation per planner; one field
registry per planner; shared US/Canada code kept in a single canonical copy;
`CLAUDE.md`, `README.md`, `docs/reference.md`, and `docs/roadmap.md` updated;
line counts reported before/after.
