# Conversion start-age search Implementation Plan (US V173; Canada untouched)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the cliff plan finds a converting plan that a wider conversion window hides, by also running the whole-run sizing pass
from later start ages inside the user's window, under a new Off / Quick / Thorough setting.

**Architecture:** at the end of `computeCliffPlan`'s sizing block (`src/us/core/projection/run-projection.js`), after the no-conversion
candidate, a start-age search runs the sizing pass's walk from a few start ages `k`: the proposal is a `choose` run on a shallow copy
of the inputs with `rothConvStartAge: k`, the walk starts from toggle off's base with `'none'` at every sizable age before `k`, and
each result replaces the finished plan only by `bracketCandidateBetter`. A new input `rothConvStartSearch` (`'off' | 'quick' |
'thorough'`) picks how many starts are tried.

**Tech Stack:** plain ESM engine modules, Vitest (`tests/unit/us/`), the Playwright grid scripts (`tests/conversion_sizing.js`,
`tests/solver_scan.js`), one root UI script.

**Spec:** this file (no separate spec). The problem and the measurements below are the spec; the owner chose "both as options"
(Quick and Thorough) on 2026-11-08.

## The problem (recap; first measured 2026-11-08 at `1bb81ca` on a real household, re-measured on household H)

Household H (`tests/unit/helpers/start-search-household.json`, a made-up household that keeps the property the first one showed:
MFJ, CT, A 36 retiring at 55, B 37 retired at 43, ACA and Medicaid on, guard and mix on, conversions at 22%): with the window 48-78
the plan converts nothing; with a later start it converts and ends higher. A plan that converts nothing before its start is a legal
48-78 plan. Nominal after-tax end values (`report.candidates[keptIndex].value`; measured 2026-11-08, Node v24, after the final
review's fixes; `'off'` is `1bb81ca`'s plan byte for byte):

| Window / plan | Kept bracket | End value |
|---|---|---|
| 48-78 today (`'off'`; the no-conversion candidate kept; the pass accepted 0 of 7) | 22 (user's) | 98,000,691 |
| 56-78 today | 10 | 98,258,813 |
| 57-78 today | 10 | 98,526,044 |
| 62-78 today | 10 | 98,887,721 |
| 48-78, Quick (tried 56, 59, 62, 61, 63; **62** kept; converts $550,374 in all) | 10 | 98,902,118 |
| 48-78, Thorough (all 9 converting ages tried; **57** kept) | 10 | **99,152,337** |

(These two rows predate the fix after the PR opened: the first converting age, 55, is now a start when the window begins before
it. Quick and Thorough then both keep 64, 99,135,221. See docs/reference.md, "Conversion start-age search".)

Why the pass misses it: (1) at 48-54 (still working) the plan without a cliff plan converts about 131k-156k a year at 22%, and the
proposal `choose` run prices every later year on a path like it, which never happens (the shortlist was 7 ages, all refused); (2) after
retirement the per-year pricing prefers the 10% fill to `none`, so `none` is rarely proposed there; (3) the walk accepts one age at a
time, and `'none'` over the early retired years helps only together with the later targets. Starting more passes from other flat
brackets (the first idea, tried on the first household) did not help: the plan still converted nothing. Cost on H (Vitest, this
machine): the `'off'` planning about 300-540 ms, Quick about 1.9 s (5 starts, 107 runs), Thorough about 3.2 s (9 starts, 200 runs).

## Global Constraints

- Engine rules (CLAUDE.md): context first; reads only `ctx.inputs` (never `state`); variants are shallow copies
  (`{ ...inputs, rothConvStartAge: k }`) run through `runSourceFor`; contexts only from `newRunContext`; the new constant
  `START_CAP` is a primitive, like `CONV_RUN_BUDGET`, so not in `tests/engine-purity.json`; the new `planStats` key is registered
  there with the object (it is a "counter").
- Not in the year loop: no estimate site, record, replay or snapshot changes; `tests/estimate_sites.js`, `tests/replay_check.js`
  unchanged.
- Vitest rules 1-7 (CLAUDE.md "Where a new test goes"): `world()`, exact comparisons, comparisons of two runs in one process, no
  literals copied from an engine run.
- With `rothConvStartSearch: 'off'` every plan and report is today's byte for byte except the new `report.sized.starts` field, and
  no Monte Carlo seed moves (the field is left out of `monteCarloSeed` by name, as `storedPlan` is).
- Canada untouched. Badge `V172 -> V173` in `src/us/index.html` once, in Task 1.

## Review Focus

1. A window where the base plan converts in one year or none: no start is tried, one run (`starts.ages` `[]`, `tried` `[]`,
   `runs` 1). Test in Task 1.
2. Ages pinned by a bracket or amount override (`convExempt`): never given `'none'` in the prefix, never a start. Test in Task 1.
3. The withdrawal toggle's guarantee with the search on: toggle on never ends earlier than toggle off. Test in Task 1, sweep in
   Task 2.
4. A market scenario: every start's runs go through `runSourceFor`. Test in Task 1.
5. Saved scenarios, the bracket card's variants and the analysis cards plan with `search` on (`planForState`,
   `src/us/core/cliff-plan/planning.js:68`), so each pays for the search: benched in Task 2.

---

## The design

**The setting.** `rothConvStartSearch`: `'off' | 'quick' | 'thorough'`. `defaults.js`: `'off'` in Task 1 (no plan moves while it
is built and measured); the shipped default is ruled at the Task 2 STOP (provisional: `'quick'`). A select in the page from Task 1
(a `FIELDS` choice field needs its element: `src/shared/ui/inputs/field-listeners.js:36-37`). Not an MCP field (`mcp` unset).
`computeCliffPlan` gains the option `startSearch = null` (null: `inputs.rothConvStartSearch`).

**Where.** Last in the `if (sizing && search && sizes)` block: after the pass, its lever fallback and the no-conversion candidate,
before the existing kept-plan block (`if (final !== null)`, run-projection.js:3631), when the mode is not `'off'`. The light refresh
(`search: false`) and Optimize's mult trials (`sizing: false`) never run it; Optimize's sized re-plannings pass `startSearch:
'off'` (`plan-search.js`); Optimize's base planning runs it.

**The base.** Captured before the pass: `sBase = auto.off ? auto.off.best : auto.best`, `sBracket = auto.off ? auto.off.bracket :
auto.kept.bracket` (toggle off's stage-0 selection, lever-free in every case and shared with the order-only track through
`s0memo`), so both toggle states run the same starts from the same base with the same results. No levers in any start's runs.

**The start ages `K`.** One `apply` run of the base (`makePlan({ bracket: sBracket, bracketFrom: from, mult: useMult, intents:
sBase.intents, family: sBase.family })`): the ages of `sizedConvAges(ctx)` whose row (`row.age`) has `conversionAmount > 0`,
ascending, without the first (a start there repeats the base's own proposal, which the pass ran when `sBracket` was the kept
bracket and the plan had no levers).

- **Quick:** every third age of `K` (indices 0, 3, 6, ...), then the untried neighbours (index -1, +1) of the best of those (the
  best by `bracketCandidateBetter` chained from the first tried).
- **Thorough:** Quick's exact sequence first, then the other ages of `K`, ascending; at most `START_CAP` (16) starts in all, so when
  `K` is long the rest are the untried ages at indices `Math.round(i * (K.length - 1) / (n - 1))` for the `n` places left. Trying
  Quick's sequence first makes Thorough no worse than Quick (the chain is transitive).

**One start `k` (`startPass(k)`).** Refactor `sizePass` into its proposal and `walk(bracket, proposalSim, cur0, conv0)`, which runs
the two walks and the all-none candidate exactly as today and returns `{ cur, conv, walkCur, tried, noneTried, accepted, budgetHit,
allNoneTried, allNoneAges }` (`walkCur`: cur before the all-none candidate, which `walkBest` and `leverPassStands` read);
`sizePass` = proposal + `walk(bracket, sv, base, {})` + today's keep rule and report, byte-identical. `startPass(k)`: the proposal is
a `choose` run of `makePlan({ bracket: sBracket, bracketFrom: from, mult: useMult, conv: {} })` on the context of `{ ...inputs,
rothConvStartAge: k }` (built as `ctxFor` builds one, through `runSourceFor`); the seed is one `apply` run of the base with `prefix`
= `'none'` at every `sizedConvAges` age below `k`; then `walk(sBracket, proposal, seed, prefix)` with today's budget (24). It
returns the walk's `cur`. (A `'none'` prefix year still sets `estUsed` and the basis figures, so the proposal under `k`-inputs is
not exactly the walked path: harmless, said in the comment block.)

**Keeping one.** `offEnd` = the plan the block ends on today (the no-conversion candidate when kept, else the pass's when kept,
else the automatic best). In the order tried, a start's `cur` replaces the running end only by `bracketCandidateBetter(cur,
running)`; `starts.kept` is that `k`. Because the chain starts from today's end and the order is transitive, the plan never ends
earlier or lower than with `'off'`. When one is kept, only `final = cur` and `keptBracket = sBracket`
are set; the existing block appends it to `cands` and refreshes the `brackets` entry once. `sized.kept`, `convIntents`
and the other fields stay the pass's and the candidate's own, except `noConvKept`: a kept start clears it (final review: the
summary reads it first, and printed "Conversions: none" over a converting plan).

**The toggle's guarantee (with levers, `auto.off !== null`).** The same start measures (no new run) are also chained from toggle
off's end: `offSized.best` when the second pass ran, else the pass's best when it is toggle off's own, then the no-conversion
measure when that run happened and beats it (computed with no new run; when the candidate was skipped because the lever plan
already was it, toggle off's end is that plan). Toggle on's result stands only by `leverPlanStands(onEnd, offEndSearched)`;
otherwise the plan, bracket, candidates and `brackets` are toggle off's searched ones (as run-projection.js:3597-3603 falls back).

**The report.** `report.sized.starts = { mode, ages, tried, runs, kept }` after `noConvKept` (`ages`: `K`; `tried`: the starts in
the order tried; `runs`: every run of the search, the converting-ages run included; `kept`: an age or null). With `'off'`:
`{ mode: 'off', ages: [], tried: [], runs: 0, kept: null }`. `planStats.startSearches` (`src/us/core/projection/engine-state.js`)
is bumped once per search that runs (mode not `'off'`).

**The summary.** When `starts.kept` is set, `cliffPlanSummary` (`src/us/core/cliff-plan/planning.js`) appends
" Conversion start ages searched: starting at 62 did best." (copy for the owner's OK at the STOP). The per-age list already prints
the prefix (on H: "none at 48-61"). The decision question's "Roth ladder (age 48-78, ...)" row (`decision-questions.js:64`) is left as
is (copy question for the STOP).

## Tasks

### Task 1: the engine, the field and their tests (Opus)

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (`computeCliffPlan`: the option, `sBase` / `sBracket`, `walk`, `startPass`,
  the search, the toggle chain, the report; the comment blocks above `sizePass` and `const sizes`),
  `src/us/core/projection/engine-state.js` (`planStats.startSearches: 0`), `tests/engine-purity.json` (if it lists the counter's keys),
  `src/us/core/optimizer/plan-search.js` (the sized re-plannings pass `startSearch: 'off'`), `src/shared/core/projection/simulate.js`
  (`monteCarloSeed` leaves `rothConvStartSearch` out by name, with its comment), `src/us/core/inputs/defaults.js`
  (`rothConvStartSearch: 'off'`), `src/us/ui/inputs/fields.js` (`{ key: 'rothConvStartSearch', type: 'choice', sync: 'contrib',
  resync: [], values: ['off', 'quick', 'thorough'], fallback: 'off' }`, beside `rothConvBracket`'s), `src/us/index.html` (the field
  after `rothConvBracket`'s, below; the badge `V172 -> V173`).
- Create: `tests/unit/us/conversion-start-search.test.js`.
- Modify: `tests/unit/us/conversion-plan.test.js` (`SIZED_KEYS` gains `starts`), the legacy-state cases (a
  `'rothConvStartSearch invalid'` case, as commit `3270a89` added one) and the regenerated `legacy_state.json`, `ui_us.json` and
  the `snapshot_ui` baselines (the new select), each named in the commit.

**Markup:** `<div class="field"><label for="rothConvStartSearch">Search conversion start <span class="info-nw">ages<button
type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="…">i</button></span><small>Tries later starts
within your conversion ages</small></label><select id="rothConvStartSearch"><option value="off">Off</option><option
value="quick">Quick</option><option value="thorough">Thorough</option></select></div>`, shown and disabled exactly as
`rothConvBracket` is. The tip (from what the engine does): "With the cliff plan on, the plan also tries starting conversions at
later ages inside your window (no conversion before that age), and keeps one only when it lasts at least as long and leaves more
after-tax money at the end. Quick tries every third age the plan converts in, then the ages next to the best; Thorough also tries
the rest (at most 16). Both make each plan refresh slower; Thorough the most."

**Interfaces:**
- Produces: `computeCliffPlan(ctx, { ..., startSearch = null })`; `report.sized.starts`; `planStats.startSearches`; `START_CAP = 16`.

- [ ] **Step 1: Write the failing tests** in `conversion-start-search.test.js`. `H` is household H, read from
  `tests/unit/helpers/start-search-household.json` (`rothConvStartAge: 48`, `rothConvEndAge: 78`). Helper `planned(patch, mode, { test, before })`:
  a fresh world, `setState({ ...patch, rothConvStartSearch: mode })`, `before(w)` when given (sets test hooks or
  `optimizerState`), `computeCliffPlan(await w.ctx())`, returning `{ out, k: out.report.candidates[out.report.keptIndex] }`.
  `late = (x) => (x === null ? Infinity : x)`. Keep the file under about 30 s: 6 grid households, not more.
  - `'off reports an empty search'`: on `H`, `starts` `toStrictEqual({ mode: 'off', ages: [], tried: [], runs: 0, kept: null })`.
  - `'quick finds a converting plan in the wide window'`: on `H`, `starts.kept` is a number in `starts.ages`; `plan.conv[a] ===
    'none'` for every age 48 to `kept - 1`; some row with `age >= kept` has `conversionAmount > 0` in the plan's apply run; neither
    age earlier than off's, and `k.value > off.k.value`.
  - `'quick tries every third age, then the best one's neighbours'`: on `H`, `tried.slice(0, n)` equals `ages.filter((_, i) => i %
    3 === 0)` (`n` its length); the rest (at most 2) are untried ages adjacent in `ages` to one coarse age.
  - `'thorough tries quick's starts first and is no worse'`: on `H`, thorough's `tried.slice(0, quick.tried.length)` equals quick's
    `tried`, `tried.length <= 16`, neither age earlier than quick's, and with both ages equal its value `>=` quick's.
  - `'no converting ages: nothing tried'`: `H` with `rothConvBracket: 10`, `rothConvEndAge: 54` (A's last working year) and `testHooks.testBracketSearchOff
    = true` (so the kept bracket is 10, which fills nothing while working); first assert the precondition (the off plan's apply run
    converts 0 at every age 48-54), then `starts.ages` `[]`, `tried` `[]`, `runs` 1, and `out.plan` `toStrictEqual` the `'off'`
    planning's.
  - `'exempt ages are left alone'`: `H` with `optimizerState.rothBracketByAge = new Map([[59, 12]])` set before the context is
    built (as `conversion-plan.test.js`'s `setup` sets an override): 59 is not in `starts.ages`, and `(out.plan.conv ?? {})[59]` is
    `undefined`.
  - `'never earlier than off'`: 6 households from `scanHouseholds({ conversions: true, mode: 'default' })` (every 64th) plus `H`,
    quick against off: neither age earlier; with both ages equal, value `>=`.
  - `'the toggle keeps its guarantee'`: the same 7 with quick, `withdrawalMixEnabled` true against false: toggle on never earlier on
    either age.
  - `'a market scenario reaches every start'`: `H` with a market scenario set (as `tests/unit/shared/run-source.test.js` sets one):
    `starts.kept !== null`, and `k.value` equals the after-tax end value of one `apply` run of `out.plan` through `runSourceFor` on
    the scenario's context (the `applied` helper of `conversion-none.test.js`, built on `runSourceFor`).
  - `'Optimize searches once'`: `testHooks.sizedTrials = 1`; read `planStats.startSearches` from
    `w.load('us/core/projection/engine-state.js')` before and after `optimizePlan` (`stateContextFor()`) on `H` with quick: the
    difference is `1`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/conversion-start-search.test.js`. Expected: FAIL (`starts` undefined).
- [ ] **Step 3: Implement** the design (the engine, the counter, Optimize's option, the seed exclusion, the default, the `FIELDS`
  entry, the markup and the badge).
- [ ] **Step 4: Run** the new file, then `npx vitest run --sequence.shuffle tests/unit/us/conversion-start-search.test.js`, then
  `npm run test:unit` (everything else passes unchanged), `node --check` on the touched modules, `npm run build`,
  `node tests/engine_purity.js`, `node tests/field_registry.js`, `node tests/legacy_state.js` (after regenerating its baseline),
  `node tests/snapshot.js` (US and Canada exact: no seed moved), `node tests/snapshot_ui.js` (after regenerating for the select).
- [ ] **Step 5: Commit** (`Conversion start search: the engine and the field (off by default), V173`), naming each regenerated
  baseline; push.

### Task 2: measure, STOP for the owner (me)

- [ ] `tests/conversion_sizing.js` and `tests/solver_scan.js` gain `--start-search MODE` (sets `rothConvStartSearch` on every
  household; the output adds the kept-start count, information only).
- [ ] Dumps for `off`, `quick`, `thorough`: `conversion_sizing --dump`, `solver_scan --sizing --conv-only --dump`,
  `tests/snapshot.js --only US --dump`; `tests/compare_household_dumps.js` off -> quick and off -> thorough: differ / earlier /
  later / up / down per set (0 earlier and 0 down are required; a row earlier or down is a finding), the plannings where a start was
  kept, and the toggle sweep (the 768 grid rows, toggle off and on, endValue and lifetimeCost, as the S3 item 3 plan measured).
- [ ] Benches against `1bb81ca` on a quiet machine: `bench_planning` (gates 250 ms off / 350 ms on; raised by the owner 2026-11-08 to 600 ms off / 650 ms on for Quick: measured worst NY @100, 462 ms off / 495 ms on), `bench_optimize` per
  planning, `bench_runs_interleaved --warm-analysis --rounds 21`, `conversion_sizing` time (under 60 s), and in the page (US, `H`,
  each mode): the deferred pass's time after one input change, the bracket card, and the open analysis cards (they plan variants
  with `search` on).
- [ ] **STOP:** to the owner: the movers table, the benches, the default (`'quick'` or `'off'`), the summary copy, the decision
  question's copy, and whether `bench_planning`'s gate moves. Nothing re-pinned before an OK.

### Task 3: the default, the copy and the UI script (Sonnet, after the owner's OK)

**Files:** `src/us/core/inputs/defaults.js` and `src/us/ui/inputs/fields.js` (the ruled default and `fallback`),
`src/us/core/cliff-plan/planning.js` (the summary sentence, as ruled), `README.md`, a new `test_conversion_start_search.js` (repo
root).

- [ ] The summary sentence and its `conversion-plan.test.js` case (a kept start; the check count updated).
- [ ] UI script `test_conversion_start_search.js`: load the built US page, set `H`, select Off then Quick,
  `__test_flushRender()` after each, and check `window.fireProjectionRows` differs (some row's conversion) and the select's value
  survives a reload (autosave); exit 1 on a failure. Mobile width (390x844): no horizontal scroll.
- [ ] With the default ruled `'quick'`: `npm run snapshot:update` (an intended behaviour change, said in the commit), re-pin only
  the Vitest checks the Task 2 table lists, each by name in the commit.
- [ ] README: the conversions-and-planning bullet gains the start-age search.
- [ ] `npm test`, `node test_conversion_start_search.js`; commit, push.

### Task 4: docs, the full runs, the PR (Sonnet)

- [ ] `docs/architecture/cliff-plan.md`: a "Then the start-age search" paragraph after the no-conversion candidate's (the base,
  `K`, Quick / Thorough, the keep rule, the toggle chain, why: the measurements above), the `report.sized` bullet (`starts`),
  Optimize's sentence (sized re-plannings pass `'off'`); `docs/architecture/inputs-and-ui.md` if it lists the Roth fields;
  `docs/architecture/test-inventory.md` (the new test, the UI script, the `--start-search` flags); `docs/reference.md` (a short
  entry: the problem, the measurement, the rulings).
- [ ] `npm test`, `npm run test:ui`; commit, push; open the PR against `main` (never auto-merge).

## Rulings (mine, for the owner's review)

1. **Start from toggle off's lever-free selection, not the kept plan,** so both toggle states run the same starts.
2. **Starts are the base plan's converting ages,** not every window age: a start where the base converts nothing changes nothing
   the prefix does not (H's window: 48-54, A's working years, convert nothing at 10%).
3. **Last in the block, chained from today's finished plan** by `bracketCandidateBetter` (review C2: before the no-conversion
   candidate, the partial order could end a plan earlier or lower than `'off'`); with levers, also chained from toggle off's end and
   held by `leverPlanStands` (review C3).
4. **Thorough runs Quick's sequence first** (review I4), so it is never worse than Quick; its cap is 16 starts.
5. **Optimize runs one search** (its base planning); its sized re-plannings pass `'off'`.
6. **Off by default until the STOP,** so Task 1 moves no plan; the field and the seed exclusion still regenerate `legacy_state`,
   `ui_us` and `snapshot_ui` in Task 1.

## Review (Opus, 2026-11-08) and what changed

C1 (a `FIELDS` entry with no element breaks the page): the markup and badge moved to Task 1. C2 (the order against the
no-conversion candidate): the search runs last, chained from today's end. C3 (the toggle guarantee): the toggle chain. I1 (the
seed and the baselines): the seed exclusion and the regenerated baselines in Task 1. I2 (`w.ctx({ overrides })` is ignored): the
test sets `optimizerState`. I3: the test turns the bracket search off and asserts its precondition. I4: Thorough runs Quick's
sequence first; the cap 12 -> 16. I5: `walk` returns `walkCur`. I6: one append. I7: the page benches. I8: the market-scenario test
checks the starts. I9: `planStats` and `sizedTrials`. M1: the comment. M2: reworded. M3: a STOP question. M4: not MCP. M5: 6
households.
