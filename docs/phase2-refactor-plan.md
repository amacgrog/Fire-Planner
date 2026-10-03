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
  `simulateHistoricalCore` is a *bucket-strategy* backtest and, separately, is
  missing several features `simulate()` has. The owner has confirmed the
  missing features are accidental and should be added, while the bucket
  waterfall is intentional and stays. The full classification is in
  **Appendix A**.
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

**Only the exact merge (2A) is in the refactor branch. Every behavior change,
including the historical-parity work (2B), lives in a separate follow-up branch
started once 2A is green** (decided by the owner: the refactor branch stays
pure and reviewable as "numbers identical"). The follow-up branch's commits,
in order: 2B parity, then the gradual bond refill, then penalty-aware mixing
(Appendix A.5).

- **2A: pure merge (snapshot-exact).** One engine, with the differences in
  Appendix A expressed as explicit capability switches that reproduce today's
  historical output exactly (e.g. `historical.mixModes = false`). Zero-tolerance
  snapshot.
- **2B (follow-up branch): historical parity (deliberate behavior change).** Flip the switches
  one commit at a time. Each commit regenerates *only* the historical
  snapshots, includes a test for the new behavior, and records in
  `docs/reference.md` the before/after change in the default scenario's
  historical success rate and Monte Carlo success rate, so the effect of each
  decision is visible and revertable on its own. The standard-projection
  snapshot must not change in any 2B commit.

2.0 **Difference audit: done, see Appendix A.** Decisions recorded there.

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

2.2b **2B commits** (follow-up branch, started after 2A is green; order chosen so each is independently
    reviewable): (1) pass `age` to `solveRothConversion`; (2) `magiSafeRoom`
    lifted out of the conversion block and used by the withdrawal order;
    (3) pre-retirement bond-ladder rotation; (4) smooth withdrawals;
    (5) applied/override mix schedule; (6) live mix
    (`pickLiveWithdrawalOrder`); (7) return the extra row columns/fields.
    Canada gets (3), (4) and (7) only; it has no mix modes or MAGI room.
    After these, the same branch adds (8) the gradual bond refill (A.2) and
    then (9) penalty-aware mixing (A.5), each its own commit.

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
| 5 | Wrap-up | Docs updated; one version badge bump ("internal refactor"); full Playwright sweep of the root `test_*.js`; line-count report |

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

## 10. Decisions

Resolved by the owner:
- Historical/backtest/Monte Carlo paths follow the plan: they gain the
  pre-retirement ladder, smooth withdrawals, applied/override and live
  withdrawal mix, `magiSafeRoom`, and the `age` argument to
  `solveRothConversion`. The up/down-year bucket waterfall and bond refill stay.
- Version badges are not bumped per commit; **one bump at the end of each
  branch** (the refactor branch, and the follow-up behavior branch).

Also resolved (second review round):
- Q1: bucket order in a down year, then the mix modes (see A.2 for the final rule).
- Q2: the initial ladder is sized from the plan's inflation.
- Q3: the standard `simulate()` does **not** refill the bond bucket.
- Historical refill is gradual (at most one year of expenses per up year), but
  it is a **new rule, so it is done after the refactor** in the follow-up
  branch, not in 2A. Until then historical keeps today's all-at-once refill.
- Shared-code approach for item 4: **Option A** (marked shared regions plus
  `scripts/sync-shared.js`); `CLAUDE.md`'s "no build step" line is reworded to
  "no build step needed to run or deploy; shared regions are synced by a
  dev-time script whose output is committed".
- Penalty-aware mixing (apply the mix only when the 10% penalty is not a
  factor) is **deferred until after the refactor**, as one change to both
  engines (see A.5 and `docs/roadmap.md`). 2B gives historical exactly what
  `simulate()` does today, so the two engines stay identical.
- Canada mixed withdrawals are designed for, not built in Phase 2 (A.6).

Nothing is open; the plan is ready to start at Step 0.

## 11. Definition of done

`npm test` (including the new snapshot, wiring, drift, and legacy-corpus
tests) passes with outputs identical to the pre-refactor baseline; root
`test_*.js` results unchanged; both planners load with no page errors at
desktop and 390x844 widths; one engine implementation per planner; one field
registry per planner; shared US/Canada code kept in a single canonical copy;
`CLAUDE.md`, `README.md`, `docs/reference.md`, and `docs/roadmap.md` updated;
line counts reported before/after.

## 12. Readability standards (what "human readable" means here)

The refactor is meant to make the code *easier* to read, and these are
acceptance criteria, not hopes:
- The year loop reads as a short list of named stages (`assembleIncome`,
  `sizeRothConversion`, `computeTaxes`, `withdraw`, `routeSurplus`,
  `buildRow`), each a function of roughly 30-120 lines with a one-paragraph
  comment saying *what rule it models*. No 1,000-line function remains.
- Existing explanatory comments (Guyton-Klinger, survivor rules, MAGI
  iteration) move with the code they describe; none are dropped.
- Names say what the thing is (`bucketStrategy`, `yearSource`) rather than
  `ctx2` / `tmp`. Related balances live in one `bal` object instead of a dozen
  loose `let`s.
- Each file gets banner section headers and a short table of contents comment
  at the top of the script, so a 6,000-line file can be navigated.
- Review checkpoint: the first extraction commit (one helper in US) is shown
  to the owner for a style check before the rest follows the same pattern.
- Sync-script regions (step 4) are marked with plain comments, and the
  generated shared text is the same readable source, not minified or
  templated.

## Appendix A: differences between `simulate()` and `simulateHistorical()`

Compiled from a line diff of the US and Canada engine bodies. "Hist" =
`simulateHistoricalCore`. Owner decisions are applied. Items marked **Q** need
a design answer before that 2B commit.

### A.1 Source differences (belong in the year source; no behavior decision)

| # | Item | `simulate()` | Hist | Merge treatment |
|---|---|---|---|---|
| S1 | Stock return | `nominalReturn` constant | `histRow[1]` | `yearSource.stockReturn` |
| S2 | Bond return | `bondYield` constant (also the interest on the bond reserve) | `histRow[3]` | `yearSource.bondReturn` |
| S3 | Taxable bond interest | `bondYield` | `histRow[4]` (Treasury yield) or `max(0, bond return)` | `yearSource.bondYield` |
| S4 | Inflation factor | `(1 + infl)^year` | running `cumFactor` of actual inflation | `yearSource.factor` |
| S5 | Tax-index factor | derived from `infl` | `histTaxFactors[year] = cumFactor` (saved/restored in `try/finally`) | `yearSource.taxFactor`, keep the `try/finally` |
| S6 | Return shape | n/a | adds `startYear`, rows carry `cumFactor` | keep as extra fields |

### A.2 Strategy difference that stays (the intended bucket behavior)

| # | Item | Standard | Hist |
|---|---|---|---|
| B1 | Down year (`yearReturn < 0`) | single cascade, no down-year branch | cash -> bond taxable -> bond traditional -> bond Roth -> stocks -> home |
| B2 | Up year (`yearReturn >= 0`) | single cascade | taxable -> traditional -> Roth -> cash -> bonds -> home, then refill bond bucket from stocks to `bondTarget` |
| B3 | Surplus (`flow >= 0`) | cash top-up, then taxable | cash top-up, then (up years only) bond bucket to `bondTarget`, then taxable |
| B4 | `bondTarget` | n/a | `(expenses - lump) * bondYears` using that year's realized expense |

**Decided rule (Q1).**
- *Down year:* cash first, then the bond buckets (taxable, traditional, Roth),
  then the remaining need from stocks using the active mix mode (applied/
  override schedule, live mix, smooth, or the default order), then home.
- *Up year:* the draw is `simulate()`'s cascade (mix modes, Roth fallback,
  cash, bonds, home), then the gradual refill below.
- *Gradual refill (follow-up branch only; 2A keeps today's all-at-once refill; changes B2/B4):* in an up
  year, move at most one year of that year's expenses (net of lump expenses)
  from stocks into the bond bucket, until the bucket reaches `bondTarget`.
  Today's code tops it up to `bondTarget` in a single year.
- *Surplus years (B3)* use the same one-year-per-up-year cap.
- Standard `simulate()` never refills (Q3), and with constant positive returns
  it never has a down year, so its output is untouched by any of this.

### A.3 Features missing from Hist (accidental; to be added in 2B)

| # | Item | US `simulate()` | Hist today | 2B action |
|---|---|---|---|---|
| F1 | `age` passed to `solveRothConversion(profile, cap, year, age)` | yes | no (`year` only) | pass `age` (US) |
| F2 | `magiSafeRoom` lifted out of the conversion block and passed as `remainingMagiRoom` to the live-mix order | yes | scoped inside the `if`, never used by withdrawals | lift and use (US) |
| F3 | Pre-retirement bond ladder (`ladderTarget`, `rotationStartYear/EndYear`, moves taxable/traditional into bond buckets) | yes (US and Canada) | none | add (US, Canada) |
| F4 | Applied mix schedule (`state.appliedMixSchedule`) and override map (`withdrawalMixOverrideByAge`), `withdrawalMixWeights` | yes | none | add (US only) |
| F5 | Live mix (`state.withdrawalMixEnabled` -> `pickLiveWithdrawalOrder`) | yes | none | add (US only) |
| F6 | Smooth withdrawals (`state.smoothWithdrawals`) | yes (US and Canada) | none | add (US, Canada) |
| F7 | Row/return columns: `expenses, tax, income, wages, ss, pension, rmd, sepp72, earlyPenalty, traditionalWithdrawn, taxableWithdrawn, rothWithdrawn, housing, ltc, loanPayment, extraExpense, lumpExpense, baseSpend, mixCandidate`; return fields `firstWithdrawal, retirementYear, currentExpense, retirementExpense, ladderTarget`; end-of-year `totalTax`/`totalIncome` correction | yes | absent | union; computed by the shared code (no new behavior, extra data only) |

Canada specifics: Canada's `simulate()` has no applied/override/live mix and no
MAGI room (those are US-only), so F1, F2, F4, F5 do not apply there. Canada
gains F3, F6, F7 only. Do not add mix strategies to Canada.

**Decided (Q2).** The initial ladder target and rotation window are sized once,
from the plan's `state.inflation`, as `simulate()` does. Realized inflation
affects only the executed dollars afterwards; after retirement the gradual
refill (using that year's expenses) takes over.

**Decided (Q3).** The standard `simulate()` does not refill the bond bucket.
If the bucket is being drawn, funds are dwindling and a refill adds nothing to
that projection. The refill is historical-only (`bucketStrategy` flag).

### A.4 Things checked and found identical (no action)
Survivor modeling, Guyton-Klinger guardrails, RMD/SEPP/penalty fractions,
MAGI iteration convergence, ACA/IRMAA, healthcare/LTC, loans/mortgage/lists,
tax calls (`taxFor`, FICA, Additional Medicare Tax), the Roth ledger, cash
reserve, and early-withdrawal penalty handling are textually the same between
the two bodies apart from the S-items above (the only diffs are comments and
local variable names, e.g. `totalExpense` vs `expenses`).

### A.5 Deferred: penalty-aware mixing (after the refactor, both engines)

Today the mix modes (smooth, applied/override, live) compute
`penalizedFraction` / `rothPenalizedFraction` and *charge* the 10% penalty on
the traditional/Roth share, but they do not stop the mix from drawing that
share before 59.5 when taxable money is available. (`pickLiveWithdrawalOrder`
does choose the cheaper of two orders, penalty included; smooth and applied
schedules use fixed weights.) The intended rule is: when a penalty applies,
draw from taxable first, use Rule of 55 / 72(t) where elected, and apply the mix
only on the portion where no penalty is owed. That changes numbers in
`simulate()` as well, so it is done once, after the merge and 2B, as a single
reviewed behavior change with its own tests and a before/after on the default
scenario. It lives in the shared withdrawal module, so both engines get it
together. Tracked in `docs/roadmap.md`.

### A.6 Canada mixed withdrawals (designed for now, built later)

Canada has no early-withdrawal penalty, so the penalty gating in A.5 does not
exist there. The injected hooks the shared withdrawal module takes are:
`penaltyFraction(age...)` (US: today's fractions; Canada: always 0),
`incomeRoom(...)` (US: `magiSafeRoom`; Canada: room under the OAS clawback
threshold, and possibly the age-credit phase-out), and an account mapping
(`traditional` = RRSP/RRIF, `roth` = TFSA with no basis ledger, plus FHSA).
With those hooks, Canada can reuse `withdrawalMixWeights`, the live order, and
the mix schedule without a rewrite. Extra Canada work then is: the UI for the
mix controls, porting the multi-lever optimizer (US-only today), and checking
the interaction with `solvePensionSplit()` and the RRSP meltdown ladder.
Scheduled as a post-refactor item in `docs/roadmap.md`.
