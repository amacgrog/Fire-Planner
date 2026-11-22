# Social Security claiming-age optimizer, PR 3: the search (plan, 2026-11-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An engine module that, for a single person, a widow(er) or a couple, runs one standard projection per claiming
choice, ranks the choices (never runs out, then the after-tax end value with a $1 tolerance, then the later run-out age; ties
to the current choice, then to earlier ages), runs identical Social Security streams once, re-measures the best three choices
and the current one with their own cliff plan, gives the best choice if the plan ends at 80, 85, 90 or 95, and says when there
is nothing to search. No UI: the card, Apply and the cache key are PR 4.

**Architecture:** The claiming rules of the search (which ages each benefit can take, what "already collecting" and "claims
now" fix, the variant's keys, the yearly stream a choice pays) go in `src/us/core/income/social-security.js`, so the one-formula
guards of PR 1 and PR 2 (`ssMonthly` and `ssSurvivor` named only there) stay as they are. The search itself is a new engine
module `src/us/core/optimizer/claim-search.js`: a generator `claimSearchSteps(ctx, contextFor, planContextFor)` that yields
`'run'` after every projection and `'plan-next'` / `'plan'` around every own-plan search (the guidance jobs' protocol, so PR 4
slices it with the same driver), and `claimSearch(...)`, its drained form. It imports no store module; its one module-level
constant is registered in `tests/engine-purity.json`.

**Tech Stack:** plain ES modules under `src/`, esbuild, Vitest 5 (Node 22.12+).

**Spec:** `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md`: PR 3 is section 10 item 3, using sections 6,
7.1-7.4 and 14. Model plans: `2026-11-21-ss-claiming-pr1-basis-factors.md`, `2026-11-21-ss-claiming-pr2-survivor-rules.md`.
US only. **Base:** PR 2 (amacgrog/Fire-Planner#116) was open when this was written, so this branch (`claude/ss-claiming-pr3-search`) starts from
`origin/claude/ss-claiming-pr2-d494be` (`dac1d8c9`) and is rebased onto `main` once #116 merges; the PR is opened against `main`
only after that. Badge: US V194 → the next free number at merge (V195 if nothing else lands first); Canada untouched.

## Global Constraints

- `npm test` stays exact to the cent. Nothing in the projection changes: the new functions are called only by the new module
  and its tests. No baseline moves (`tests/snapshots/ui_us.json` does not hold the badge text; review).
- Engine rules (`CLAUDE.md`): `claimSearchSteps` takes the base run context first; the base inputs are `ctx.inputs`, the tax
  year `ctx.taxYear`; every variant runs through the caller's `contextFor(variant)` and `simulateWith` (so through
  `runSourceFor`: a market scenario is honored) and is priced with `pricingContextFor(runCtx)`, as `optimizePlan` prices.
  Variants are shallow copies (`{ ...base, key: value }`), never normalized or deep-copied, never written. No store or
  store-layer import (`tests/engine_purity.js`). No memo: the dedupe map lives inside one call.
- The own-plan factory is the caller's: `planContextFor(planInputs, runInputs) -> ctx` (the UI and the tests pass
  `(p, r) => ownPlanContextFor(p)(r)`): the plan Apply would keep for `planInputs` (a variant with the base's guardrails, or
  the base itself for the current choice), applied to the run of `runInputs` (that variant with guardrails off; Decision 9).
  The engine never imports `ownPlanContextFor` (store layer).
- Whole years, as PRs 1-2. Ages are the plan's ages; the axes never go above 70 (spec 7.1).
- The repo is public: invented round figures only, no personal details ("a real user").
- Vitest rules 1-7 of `CLAUDE.md`: through `world()`, exact comparisons, counted with `makeCounter`, run alone and with
  `--sequence.shuffle` and on Node 24 if available (rule 6: the expected values are winners and comparisons of two runs in one
  process, never engine literals).

## Decisions this plan makes (the spec leaves them to the builder)

1. **Household kind.** `widowed` when `singlePerson && ssWidowed === true && ssSurvivorMonthlyFra > 0`; `single` for any other
   single person (a widowed box with no survivor amount searches the own benefit only); `couple` otherwise.
2. **An axis** (`ssClaimAxes(ctx)`): per own benefit `p` (A; B for a couple), the first rule that applies:
   - `fixed: 'none'` when `!(ssMonthlyP > 0)`;
   - `fixed: 'collecting'` when `ssCollectingP === true && start <= age` (PR 1's reading: a later start is not collecting);
   - `fixed: 'past'` when `max(62, age) > 70` (nothing left to choose; the benefit claims now; before `atClaim`, so a
     72-year-old is not told to switch the basis: review 7);
   - `fixed: 'atClaim'` when the basis is not `'pia'` (spec 7.4: the age does not change the amount);
   - else `ages: [max(62, age) .. 70]`.
   For the survivor benefit (widowed only): `'collecting'` when `ssSurvivorCollecting === true && resolved start <= ageA`;
   `'past'` when `max(60, ageA) > ceil(sfra / 12)`; else `ages: [max(60, ageA) .. ceil(sfra / 12)]` (60-67 for anyone born 1962
   or later). Every axis also carries `current`: the effective age of the current choice (`max(start, age)`, or the start while
   collecting; for the survivor, `ssSurvivorFactorAge(ctx)`), which is what the formula pays from. A fixed axis is never
   written into a variant. Returned as a small object (not a hot path).
3. **The status** (spec 7.4), from the axes, before any run: `'none'` (hidden) when no own benefit has an amount and the kind is
   not widowed; `'collecting'` (hidden) when every benefit with an amount is fixed as collecting; `'atClaim'` (the "enter your
   benefit at full retirement age" line) when no axis varies and at least one own axis is fixed as `atClaim`; `'nothing'` ("nothing
   to choose") when no axis varies otherwise, or when the grid has one cell and the current choice is that cell (an axis with
   one age, as at 70 or a survivor at the rounded survivor full retirement age: spec 7.1; review 6; a current choice outside
   that one cell, as a start of 72, is still a choice and stays `'ok'`); else `'ok'`, with `ownFixed` naming why an own axis is fixed (the widow(er) with
   `atClaim` gets the "only the survivor age is searched" line in PR 4). Anything but `'ok'` runs nothing.
4. **The grid's order.** Cells in row-major order: widowed survivor start (rows) by own start (columns); couple A by B; single
   one row. The "earlier ages" tie order is the smaller sum of the varied ages, then the smaller survivor start (widowed) or
   Partner A's (couple); this order is the dedupe's processing order (so a "same as" names the earliest cell) and the scan order below.
5. **The current choice.** When every varied axis's `current` is one of its ages, the current choice is that cell (its run is
   the cell's: the stream is the same, Decision 7). Otherwise (a start of 71-75 under `ssLateStartEnabled`, a survivor start of
   68-70) it is an extra run of the base's own ages, `current.cell === -1`, shown beside the grid by PR 4 (spec 7.1). It is
   deduped against the grid like any cell (a start never paid within the horizon shares a key; then `current.sameAs` names
   the cell and nothing extra runs; review 13). `current.measure` is the kept-plan (grid) measure; `top[0].measure` is its
   own-plan measure, which the headline and gain read (review 14).
6. **The ranking** (spec 6). A measure is `{ depletedAge, value, today }`: `depletedAge` the run's (`null` when it never runs
   out), `value` the nominal after-tax end value (`US_OBJECTIVES.endValue.value(pricingContextFor(runCtx), sim)`), `today` that
   value in today's dollars (divided by the last row's `cumFactor ?? Math.pow(1 + pct(inputs.inflation), year)`, exactly as
   `objectiveBreakdown` does; review 10). `homeDrawAge` is not ranked (the cliff plan's verdict reads it; the claiming
   ranking is the spec's three keys; the topic file says so).
   `claimBetter(c, best)` is a strict win: c never runs out and best does; or neither runs out and `c.value > best.value + 1`
   (the cliff plan's $1); or both run out and `c.depletedAge > best.depletedAge`. `claimPick(list)` scans the list in order
   and replaces the best only on a strict win, so the first entry wins every tie. Every pick scans the current choice first,
   then the cells in the earlier-ages order (Decision 4): ties go to the current choice, then to earlier ages. (The $1 margin
   is not transitive; a scan in a fixed order is what the cliff plan does too.)
7. **The dedupe** ("same as"). `ssStreamKey(ctx)` is the yearly Social Security of a choice before inflation and the cut:
   for `y` in `0 .. years` (`years` as `optimizePlan` counts it: `lifeExpectancyA - ageA`, or the larger of the two for a
   couple), `paidBenefitYearly(ctx, 'A', ageA + y, 1, 1)` and, for a couple, `ownBenefitYearly(ctx, 'B', ageB + y, 1, 1)`,
   joined as a string (`String` of a double round-trips). Two cells with one key are run once; the later (earlier-ages order) gets
   `sameAs` the earlier's index and its measure. *Why this is exact:* every engine reader of a start age is in
   `social-security.js`, and each formula reads a start only through `a >= start` and the factor age, which for a varied axis
   (not collecting, at or above the current age) are both functions of the effective age alone; so two choices with one key
   pay the same in the living years, and a couple's survivor benefit reads the deceased's factor age, which two equal own
   streams share whenever it was paid before the death (when it was never paid by the death year, the "not claimed" branch does
   not read it). A widow(er)'s survivor start that never pays more than the own benefit is the case the spec names. The cliff
   plan's solver reads the same functions, so an own-plan search gives one plan too. A Vitest case checks every deduped pair of
   the fixtures against two real runs (rows `toStrictEqual`).
8. **The longevity row** (single and widowed only; `null` for a couple). For each `E` of `CLAIM_END_AGES = [80, 85, 90, 95]`
   with `E > ageA` (a guard only: an `'ok'` search has an axis at or below 70, so `ageA` is at most 70; review 3), the grid (and the current choice) re-run with `lifeExpectancyA: E` on the same variants, deduped by their key
   at that horizon, picked by Decision 6 with the kept plan (no own-plan re-measure: four bracket searches per end age would be
   16 more). The entry is `{ endAge: E, cell, sameAsCurrent }` (`cell` -1 for an extra current choice). A run whose plan already
   ends at `E` (`lifeExpectancyA === E`) reuses the grid's measures.
9. **The re-measure** (owner, spec 7.2). The grid ranks every distinct run with the plan the caller's `contextFor` gives (the
   kept plan, in the UI). The top three distinct runs other than the current choice, by the sort key (never runs out first; then
   `value` descending; runs that run out by `depletedAge` descending, then `value`; equal keys in the earlier-ages order), and
   the current choice, are each run with `planContextFor(vOn, vOff)`: `vOn` the variant with the base's own guardrails setting
   (the inputs Apply would write, so its plan is the one `refreshCliffPlan` keeps after Apply), `vOff` the same with guardrails
   off (Decision 10); for the current choice `vOn` is `ctx.inputs` itself, so `ownPlanFor` returns the kept plan with no search
   (review 5). `plannings` counts `planContextFor` calls (a call can be a cache hit: the notes' timings say which); `claimPick` over [current, the three in the earlier-ages
   order] is the headline (`best`), and `best.gain` is `best.today - current.today` on those measures. With
   `ctx.inputs.cliffGuardEnabled` false there is no plan to search: the grid measures are reused, `plannings` is 0, no
   `'plan-next'` is yielded. Fewer than three other distinct runs: all of them. **For PR 4** (review 8): `ownPlanFor`'s cache
   holds 8 entries and clears when full, shared with the moves card; four re-measures plus the moves' candidates can evict each
   other, costing searches, never correctness. The topic file notes it; PR 4 decides whether to raise the cap.
10. **Guardrails off.** Every run (grid, current, longevity, re-measure) is of `{ ...variant, guardrailsEnabled: false }` when the
    base has them on (spec 6; as the guidance job does), so `ssStreamKey` and the measures never see a guardrail cut.
11. **The variant keys.** `ssClaimVariant(base, axes, cell)` (in `social-security.js`) returns `{ ...base }` with only the varied
    keys written: `ssStartAgeA` (single, widowed, couple A), `ssStartAgeB` (couple B), `ssSurvivorStartAge` (widowed: a number,
    never `null`; the cell at `ceil(sfra / 12)` pays as the `null` default does, and PR 4 decides whether Apply writes `null`
    there). Plus `lifeExpectancyA` for a longevity run and `guardrailsEnabled: false` (Decision 10), written by the search module.

## The result (PR 4 reads it; every field is plain data, no sims kept)

```
{ status: 'ok' | 'none' | 'collecting' | 'atClaim' | 'nothing', kind: 'single' | 'widowed' | 'couple',
  axes,                                   // ssClaimAxes(ctx)
  ownFixed: null | 'none' | 'collecting' | 'atClaim' | 'past',   // widowed only: why the own axis is fixed
  cells: [{ survivor, a, b, sameAs, measure }],   // row-major (Decision 4); a fixed axis's key is null; sameAs an index or null
  current: { cell, survivor, a, b, sameAs, measure },   // cell -1: an extra run (Decision 5); a fixed axis's age is null, as in
                                          // cells (axes.x.current has it); sameAs: the cell an extra run shares a stream with, or null
  gridBest,                               // the winning cell of the grid and the current choice: current.cell when the current choice
                                          // wins (-1 only for an extra current run); test "is current" with cell === current.cell
  top: [{ cell, measure }],               // the re-measured entries, current first (Decision 9)
  best: { cell, isCurrent, measure, gain },  // the headline; gain in today's dollars over the current choice
  longevity: null | [{ endAge, cell, sameAsCurrent }],
  runs, plannings }                       // projections run and own plans searched (tests, the notes' timings)
```

For a status other than `'ok'`: `{ status, kind, axes, ownFixed }` and nothing else.

## Review Focus

1. **The dedupe's exactness** (Decision 7): a deduped pair must be the same run, never two runs that happen to tie. Test in
   Task 2 against real runs.
2. **The current choice outside the grid** (Decision 5) and a current start below the current age, not collecting ("claims
   now"): mapped to the cell at the current age. Tests in Task 1 and Task 2.
3. **The re-measure** compares own-plan measures with own-plan measures only (the current choice is re-measured too), and the
   gain is read on them. Test in Task 3.
4. **Guardrails and a market scenario** reach every run (Decisions 6, 10). Tests in Task 3.
5. **No store import and nothing module-level mutable** in the new module (`tests/engine_purity.js`, the purity json).

---

### Task 1: The claiming rules in `social-security.js` and the ranking

**Files:**
- Modify: `src/us/core/income/social-security.js` (`ssClaimAxes`, `ssClaimVariant`, `ssStreamKey`; the purpose line gains "and
  the claiming search's axes")
- Create: `src/us/core/optimizer/claim-search.js` (purpose line: "The US Social Security claiming-age search (SS claiming
  optimizer PR 3): the status, the ranking, the grid, the dedupe, the re-measure and the longevity row"); this task adds
  `claimStatus`, `claimBetter`, `claimPick`, `CLAIM_END_AGES`
- Modify: `tests/engine-purity.json` (`"src/us/core/optimizer/claim-search.js": { "CLAIM_END_AGES": "constant" }`)
- Test: `tests/unit/us/claim-search.test.js` (new)

**Interfaces:**
- `ssClaimAxes(ctx) -> { kind, a, b, survivor }`: each an axis `{ ages: number[], fixed: null | 'none' | 'collecting' |
  'atClaim' | 'past', current: number }` (`ages` empty when fixed); `b` null unless a couple, `survivor` null unless widowed.
- `ssClaimVariant(base, axes, cell) -> object`: Decision 11; `cell` is `{ survivor, a, b }`, a fixed axis's entry ignored.
- `ssStreamKey(ctx) -> string`: Decision 7.
- `claimStatus(axes) -> 'ok' | 'none' | 'collecting' | 'atClaim' | 'nothing'`: Decision 3.
- `claimBetter(c, best) -> boolean`, `claimPick(list) -> number` (an index into `list`, of measures): Decision 6.
- `CLAIM_END_AGES`: `Object.freeze([80, 85, 90, 95])` under a `// load-time: a frozen literal list; reads nothing.` comment
  (an `Object.freeze` call is not inert to `scripts/lib/load-time.js`, so `tests/ui_cycles.js` needs the marker, as
  `plan-shape.js` and `move-levers.js` carry it; review 4).

- [ ] **Step 1: Write the failing tests** (counted; header comment as PR 2's: tax year 2026, invented figures):
  - *Axes, single:* `pia`, 60: A `ages [62..70]`, `current` 62 at the default start; 66 with start 62 not collecting: `[66..70]`,
    `current` 66 (claims now); 66 collecting with start 64: fixed `'collecting'`, `current` 64; collecting with start 68 (after
    66): not collecting, `[66..70]`, `current` 68; 72: fixed `'past'`; `atClaim`: fixed `'atClaim'`; `ssMonthlyA` 0: fixed
    `'none'`; 72 in `atClaim`: `'past'` (rule order); `ssLateStartEnabled` with start 72 at 64: `[64..70]`, `current` 72.
  - *Axes, widowed* (PR 2's `WIDOWED`, 59, born 1967): survivor `[60..67]`, own `[62..70]`, `current` 67 (the `null` start) and
    70; born 1958 (68): survivor fixed `'past'` (68 > ceil(796 / 12) = 67), own `[68..70]`; survivor collecting with start 60 at
    63: fixed `'collecting'`, `current` 60; `ssSurvivorMonthlyFra` 0: kind `'single'`, `survivor` null.
  - *Axes, couple* (PR 2's `COUPLE`, both 62): A and B `[62..70]`; B in `atClaim`: B fixed `'atClaim'`, A varies.
  - *Status:* single `ssMonthlyA` 0 → `'none'`; single collecting → `'collecting'`; single `atClaim` → `'atClaim'`; single 72 →
    `'nothing'`; single 72 in `atClaim` → `'nothing'`; single 70, start 70 → `'nothing'` (one cell, the current); single 70 with
    `ssLateStartEnabled` and start 72 → `'ok'` (the current choice is outside the one cell); widowed with own `atClaim` → `'ok'` (survivor varies); widowed with own `atClaim` and survivor collecting →
    `'atClaim'`; widowed both collecting → `'collecting'`; couple A collecting, B `ssMonthlyB` 0 → `'collecting'`; couple A
    collecting, B `atClaim` → `'atClaim'`.
  - *Variant:* `ssClaimVariant(base, axes, { survivor: 60, a: 70, b: null })` for the widowed base: `toStrictEqual({ ...base,
    ssSurvivorStartAge: 60, ssStartAgeA: 70 })`, `base` unchanged; with the own axis fixed (`atClaim`): only
    `ssSurvivorStartAge` written.
  - *Stream key:* the widowed base with own 62 and survivor 62 has the key of survivor 63 (both never higher than the own
    21,000: f(62) x 24,000 = 19,114.28..., f(63) x 24,000 = 20,091.42...) and not of survivor 64 (f(64) x 24,000 = 21,068.57...
    > 21,000); a start of 60 at 64, not collecting, has the key of 64 (claims now).
  - *Ranking:* `claimBetter` of `{ depletedAge: null, value: 0 }` over `{ depletedAge: 90, value: 1e9 }` true and back false;
    values 100.5 over 100 false, 101.5 over 100 true; both run out, 85 over 84 true, 84 over 85 false, 85 over 85 (any values)
    false. `claimPick` of three measures within $1 of each other: 0; of `[90 out, never, never + $5]`: 2.
- [ ] **Step 2:** `npx vitest run tests/unit/us/claim-search.test.js`: FAIL (not exported).
- [ ] **Step 3:** Implement; `npm run analyze` (new module and exports: the module map check fails otherwise);
  `node --check` both files.
- [ ] **Step 4:** The file: PASS; `npm run test:unit`; `node tests/engine_purity.js` PASS; the PR 1 and PR 2 one-formula guards
  (`usCoreFilesContaining('ssMonthly')`, `('ssSurvivor')`) still PASS unchanged: the new module names neither (it reads amounts
  and keys only through the three new functions). If a check still needs a key name in the module, move that check into
  `social-security.js` rather than widening a guard.
- [ ] **Step 5: Commit** ("SS PR 3: the claiming axes, variant, stream key and ranking").

### Task 2: The grid, the dedupe and the hand-computed winners

**Files:**
- Modify: `src/us/core/optimizer/claim-search.js` (`claimSearchSteps`, `claimSearch`: the grid, the current choice, the dedupe,
  `gridBest`; the re-measure and the longevity row come in Task 3 with `top` / `best` / `longevity` stubbed as the grid's
  winner and null)
- Test: `tests/unit/us/claim-search.test.js`

**Interfaces:**
- `function* claimSearchSteps(ctx, contextFor, planContextFor) -> result` (yields `'run'`, and in Task 3 `'plan-next'` /
  `'plan'`); `claimSearch(ctx, contextFor, planContextFor) = drainSteps(claimSearchSteps(...))` (`drainSteps` from
  `shared/core/analysis/spending-room.js`).
- The test's factories: after the last `setState`, in every case with the cliff plan on, `refreshCliffPlan()` (from
  `us/core/cliff-plan/planning.js`), so a kept plan exists for the state and `stateContextFor`'s identity rule hands it to every
  variant (without it every variant runs its own bracket search through `planForState`; review 2); then `contextFor =
  stateContextFor()`, `ctx = contextFor(state)` where `state` is read from the store namespace, `planContextFor = (p, r) =>
  ownPlanContextFor(p)(r)` from `us/core/projection/store-context.js`; a direct run for a comparison is
  `simulateWith(contextFor(v))` with `v` built by `ssClaimVariant` plus Decision 10. Cases where the plan is not the point
  (the `ZERO_TAX` cases, `COUPLE`) set `cliffGuardEnabled: false`.

The fixture for the hand-computed cases (`ZERO_TAX`, written out in full in the test; review 1): a single person retired at
the current age (`retireAgeA = ageA`, `incomeA: 0`), `tenure: 'rent'` with `rent: 0` (no home, mortgage or maintenance: the
defaults own a 450,000 home with a 300,000 mortgage), `cash: 400000` with `cashReserve` at least `cash` (or, if the reserve
cannot be that high, the cash above it sits in taxable at full basis: the implementer reads `sweepExcessCash`, `draws.js:34`),
`taxable`, `trad401kA`, `tradIraA`, `rothIraA`, `roth401kA` and every other balance 0, `returnRate`, `hysaRate`, `bondReturn`,
`dividendYield` and `inflation` 0, `bondYears: 0`, `spending: 10000`, `healthcare: 0`, `medicareYearly: 0` (charged from 65
whatever `healthcare` is, `aca.js:233-236`), `acaEnabled: false`, `cliffGuardEnabled: false`, `rothConvEnabled: false`, Texas. Yearly Social Security never
above 37,200, so provisional income stays under $25,000: no federal or state tax, no IRMAA. **Step 1 first asserts this**: for
every distinct run of each case, the sum over rows of tax and healthcare is the same (`toBe`) and nothing runs out; then the end
value orders as the sum of the yearly benefit, which the hand sums below give with margins of at least $960 (rows at every age
from the current age to the life expectancy, both included).

- [ ] **Step 1: Write the tests:**
  - *Survivor first, own at 70* (widowed, 60 in 2026, born 1966, life expectancy 90, own 2,500 `pia`, survivor 2,000): the best
    is survivor 60, own 70: 10 x 17,160 + 21 x 37,200 = 952,800; the runner-up survivor 61, own 70: 9 x 18,137.14... + 781,200 =
    944,434.29 (margin 8,366); own 62 then survivor 67: 5 x 21,000 + 24 x 24,000 = 681,000. `gridBest` is the cell (60, 70).
    (Runner-ups are comments for the reader; only the winner is asserted; review 11.)
  - *Own first, survivor later* (the same person, own 2,000, survivor 3,000): the best is own 62, survivor 67: 5 x 16,800 + 24 x
    36,000 = 948,000; survivor 66, own 62: 4 x 16,800 + 25 x 34,534.28... = 930,557; survivor 60, own 70: 10 x 25,740 + 21
    x 29,760 = 882,360; the runner-up survivor 67 with own 63: 4 x 18,000 + 864,000 = 936,000. `gridBest` is the cell (67, 62).
  - *Single, the longevity sums* (62 in 2026, born 1964, own 2,000 `pia`; used again in Task 3): at life expectancy 80 the best
    is 68 (13 x 25,920 = 336,960; 67: 14 x 24,000 = 336,000; 66: 15 x 22,400 = 336,000; 70: 11 x 29,760 = 327,360; 62: 19 x
    16,800 = 319,200); at 90 it is 70 (21 x 29,760 = 624,960 against 69: 22 x 27,840 = 612,480).
  - *Dedupe:* in the first case, the cell (survivor 63, own 62) has `sameAs` the index of (62, 62); the rows of the two variants
    run directly are `toStrictEqual`; `runs` equals the number of distinct keys plus 0 (the current choice is a cell). Every
    `sameAs` pair of the three cases: the two direct runs' rows `toStrictEqual` (Review Focus 1).
  - *Every measure is a direct run:* for three cells of each case, `measure.value` `toBe` the direct run priced with
    `pricingContextFor`, `measure.depletedAge` `toBe` its `depletedAge || null`.
  - *The current choice:* the widowed base at its defaults (survivor `null`, own 70) is the cell (67, 70) with `current.cell`
    its index; a single person with `ssLateStartEnabled` and start 72 has `current.cell` -1 and an extra run; a current start of
    60 at 64 is the cell of 64 (Review Focus 2).
  - *Ties go to the current choice:* tested on measures (Task 1's `claimPick` cases), plus one projection case: in the single
    longevity sums at 80, 67 and 66 tie exactly (336,000 each); with the current start at 67 and the plan ending at 80, the
    scan of [current 67, 62, 63, ...] keeps 67 over 66 (the winner is still 68). Assert the pick over the grid restricted to
    {66, 67} with the current first is 67, and with the current at 66 is 66 (`claimPick` over the two cells' measures in that
    order).
  - *A run-out case:* the single person of 62 with `cash: 300000`, `spending: 30000`, life expectancy 90, nothing else
    changed. Hand: a claim at 62 drains 13,200 a year (30,000 - 16,800) for 29 years, 382,800, and runs out; 66 drains 4 x 30,000
    + 25 x 7,600 = 310,000 and runs out; 67 drains 5 x 30,000 + 24 x 6,000 = 294,000 and never runs out (end 6,000); 70 drains
    8 x 30,000 + 21 x 240 = 245,040 (end 54,960, the best); so `gridBest` is 70, the cells 62-66 have a `depletedAge` and among
    them the later run-out ranks higher (`claimBetter` of 66 over 62 true). The Step 1 precondition (nothing runs out) is not
    asserted for this case; the equal tax and healthcare sums are.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement. **Step 4:** PASS; alone, shuffled, Node 24 if available.
- [ ] **Step 5: Commit** ("SS PR 3: the claiming grid, dedupe and hand-computed winners").

### Task 3: The re-measure, the longevity row, guardrails, scenarios, couples

**Files:**
- Modify: `src/us/core/optimizer/claim-search.js`
- Test: `tests/unit/us/claim-search.test.js`

- [ ] **Step 1: Write the tests:**
  - *Longevity, single* (Task 2's single sums): `longevity` is `[{ endAge: 80, cell: <68> }, { 85: <70> }, { 90: <70> }, { 95:
    <70> }]` (hand: at 85, 70 gives 16 x 29,760 = 476,160 over 69's 17 x 27,840 = 473,280); a couple gets `null`; a widowed
    person gets four entries. (No case for an end age at or below the current age: an `'ok'` search is at most 70; review 3.)
  - *Longevity reuses the grid when the plan ends there:* a single person with life expectancy 90: the entry for 90 is
    `gridBest`, and `runs` counts no second run for 90.
  - *The re-measure* (cliff plan on, after `refreshCliffPlan()`): the widowed person of 60 (own 2,500 `pia`, survivor 2,000),
    retired, on ACA coverage until 65: `acaEnabled: true`, `cliffGuardEnabled: true`, `spending: 50000`, `taxable: 600000`,
    `trad401kA: 500000`, `cash: 30000`, inflation 0, Texas, no home (`tenure: 'rent'`, `rent: 0`). The test first asserts the kept
    plan has at least one intent (so the fixture really steers; if not, raise `trad401kA` until it does and say so in the
    comment). Then: `top[0]` is the current choice and its measure is the kept plan's run (its `vOn` is the state itself, so
    `ownPlanFor` returns the kept plan; Decision 9); `top.length` is 4 (or 1 + the distinct other runs); each `top[i].measure`
    `toBe` a direct run with `ownPlanContextFor(vOn)(vOff)` (value and depletedAge); at least one `top[i].measure` differs from
    its grid measure (the re-measure changes something; review 9); `plannings` is `top.length`; `best` is `claimPick` over `top` in Decision 9's order
    and `best.gain` `toBe(best.measure.today - top[0].measure.today)`. The same fixture with `cliffGuardEnabled: false`:
    `plannings` 0, `top` measures `toStrictEqual` the grid measures of those cells, no `'plan-next'` yielded (collect the yields).
  - *The yields:* the count of `'run'` yields equals `runs`; `'plan-next'` and `'plan'` each equal `plannings`; every
    `'plan-next'` is followed by `'plan'` before the next `'run'`.
  - *Guardrails off:* the first Task 2 case with `guardrailsEnabled: true` gives the same `cells` (`toStrictEqual`) as with
    them off.
  - *A market scenario:* the first Task 2 case with a `marketScenario` (a fixed sequence the market-scenario tests use): each
    checked cell's measure `toBe` the direct `simulateWith(contextFor(v))` priced with `pricingContextFor`, and differs from the
    no-scenario measure for at least one cell.
  - *Couples run:* the `COUPLE` (both 62, `pia`, `cliffGuardEnabled: false`): 81 cells; `current` is the cell (62, 62);
    `longevity` null; for three cells the measure is a direct run; no `sameAs` (distinct `pia` starts never share a key).
    A horizon case (review 12): the couple with both life expectancies 67 and survivor modeling on (A dies at 65): starts of
    68-70 are never paid, so the cells (A, B) and (A', B) with A, A' in 68-70 share a key and land in the not-claimed branch;
    each such pair's two direct runs' rows `toStrictEqual`.
  - *Refusals run nothing:* for each non-`'ok'` status of Task 1, the result is `{ status, kind, axes, ownFixed }` and the
    generator yields nothing.
  - *Purity:* the base `state` is unchanged after a search (`toStrictEqual` a `structuredClone` taken before).
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement. **Step 4:** PASS; alone, shuffled, Node 24 if available.
- [ ] **Step 5:** Time the search (a scratch script, not committed): the widowed person of 60 with the default plan, the cliff
  plan on, through a world: the grid, the longevity row and the re-measure separately; record the figures and the run and
  planning counts in the Batch 6 notes (spec 7.2's estimate: well under a second for the grid).
- [ ] **Step 6: Commit** ("SS PR 3: the re-measure with own plans, the longevity row, guardrails, scenarios, couples").

### Task 4: Docs, badge, verify, PR

**Files:**
- Modify: `docs/architecture/us-social-security.md` (a "The claiming search" section: the axes and status, the ranking and its
  scan order, the dedupe and why it is exact, the current choice outside the grid, the re-measure, the longevity row, the
  whole-year bias of spec 7.1, the result's shape, what PR 4 adds); `docs/architecture/cliff-plan.md` (one line: the claiming
  search re-measures its top cells with `planContextFor`, the moves' rule); `docs/architecture/test-inventory.md` (the Vitest
  file); `docs/next-batches-plan.md` "### Batch 6 notes": an entry "Claiming-age optimizer PR 3 (US V195)" (decisions 1-11, the
  timings, no baseline moved); the spec, section 10 item 3: built, the badge, this plan's path
- Modify: `src/us/index.html` (badge V194 → the next free number); `README.md` (Question 1)
- [ ] **Step 1:** Docs; `node tests/doc_paths.js`.
- [ ] **Step 2:** `npm test` and `npm run test:ui` (background): green, no baseline moved (`ui_us.json` does not hold the
  badge text).
- [ ] **Step 3:** An Opus review of the branch (model opus); fold in; rebase onto `main` once #116 has merged; push; open the
  PR against `main`.

## Not in this PR

The card, its place and shading, Apply, the cache key of spec 7.3, the timer slices and `__test_flushClaimSearch` (PR 4);
the spousal benefit and couples on the card (PR 5); re-measuring the longevity row with own plans; Canada.

## Revisions after the Opus review (2026-11-21; folded into the decisions and tasks above)

The review recomputed every factor and grid sum by brute force over the full grids (the winners (60, 70), (67, 62) and the single
person's 68 / 70 / 70 / 70 confirmed), confirmed that no engine reader of a start age exists outside `social-security.js`, that
the dedupe is exact (equal factor-1 keys give equal engine values; a couple's deceased factor age is shared or unread; the
solver's implied deaths lie inside the horizon), and that the engine rules, the yield protocol, `stateContextFor`'s identity
rule and the plumbing hold. Folded in:

1. The `ZERO_TAX` fixture is written out in full: no home or mortgage, `medicareYearly` 0, no wages, every default balance 0,
   no bond ladder, the cash reserve (the defaults carry about $26,000 a year of housing and a $10,000 Medicare charge).
2. A Vitest world has no kept plan until `refreshCliffPlan()` runs: every cliff-on case calls it; `COUPLE` and `ZERO_TAX` set
   the cliff plan off.
3. The "end age at or below the current age" case is dropped: an `'ok'` search is at most 70 (Decision 8 says the filter guards).
4. `CLAIM_END_AGES` carries a `// load-time:` marker (`Object.freeze` is a call).
5. The re-measure plans the variant with the base's guardrails and runs it with them off (`planContextFor(vOn, vOff)`); the
   current choice plans with the state itself, so it reuses the kept plan.
6. A grid of one cell that is the current choice is `'nothing'` (spec 7.1).
7. `'past'` is read before `'atClaim'`.
8. `ownPlanFor`'s shared 8-entry cache is noted for PR 4.
9. The re-measure test names its fixture and asserts the re-measure changes a measure.
10. `today` uses `pct(inflation)` and `Math.pow`, as `objectiveBreakdown`.
11. The first case's runner-up is (61, 70); runner-ups are comments, not assertions.
12. A couple horizon case gives the couples dedupe something to check.
13. An extra current choice is deduped against the grid.
14. `current.measure` (kept plan) and `top[0].measure` (own plan) are named apart; `homeDrawAge` is not ranked (topic file).

## Branch review (Opus, 2026-11-21)

No must-fix findings; the review confirmed the status, the current-cell mapping, the dedupe (order, the current's extra run, the
exclusion of the current's canonical cell), the re-measure, the longevity row, the yields, the stream key's exactness and the
engine rules. Folded in: the result block documents `gridBest` / `best.cell` as the current choice's cell when it wins, and
`best.isCurrent` is added; `current`'s fixed axes are null, as in `cells`, and `current.sameAs` is documented; a test where the
current choice is a non-canonical duplicate of the winning cell (the tie to the current choice through the search itself, the
current's canonical cell kept out of the top three); the re-measure test checks which three cells are re-measured; the
guardrails test shows the fixture is guardrail-sensitive; a one-cell grid beside an `atClaim` benefit reads `'atClaim'`
(pinned by a test); the axes' low end is rounded up for a fractional age; a garbled sentence in `cliff-plan.md`.

## Owner decisions

*Decided 2026-11-21 (owner: "Go with your recommendations"):* the plan is approved with the three recommended answers below
(the badge bumped, the README left alone until PR 4; the longevity row on the kept plan; the earlier-ages tie order). #116
merged the same day, so the branch was rebased onto `main` before implementing.

## Questions for the owner (answered above)

1. **README and badge for a PR with no visible change.** The search has no UI until PR 4. *Recommended:* bump the badge as every
   PR does (the process rule) and leave the README's feature list alone until the card ships in PR 4 (a line now would describe
   something nobody can use).
2. **The longevity row uses the kept plan** (Decision 8), not each choice's own plan: four end ages x four bracket searches would
   add 16 plannings. *Recommended:* as written; the card's line "the other cells use the current plan" covers it.
3. **The "earlier ages" tie order** (Decision 4): the smaller sum of the ages, then the earlier survivor (or Partner A) start.
   Ties need two choices within $1, so this almost never decides. *Recommended:* as written.
