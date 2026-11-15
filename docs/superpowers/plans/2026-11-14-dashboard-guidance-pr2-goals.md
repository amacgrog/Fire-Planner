# Dashboard guidance PR 2: goals and "What matters most?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask what the household is deciding, then list the still-estimated fields that matter for it, ordered by how much a
realistic error in each moves the spending room. Do it in both planners, replacing the "N of your numbers are still
estimated" rollup, the wizard's optional-feature step and the tornado card.

**Architecture:**
- Per-country data tables (`src/<country>/core/inputs/guidance-fields.js`, through a new seam) hold:
  - the goal list;
  - the fields each goal brings in;
  - the goal-critical fields with their reasons;
  - each field's realistic error.
- A DOM-free scope module (`src/shared/core/inputs/guidance-scope.js`) turns the saved `guidanceGoals` into the set of
  fields in scope.
- A DOM-free engine module (`src/shared/core/analysis/field-impact.js`) measures one field's effect on the spending room.
  - It nudges the field, runs the projection once at the room's edge spending, and converts the change in an unfloored end
    measure to $/yr through the slope measured at that edge.
  - That is two runs per field. The exact search costs about 22.
- A shared UI module (`src/shared/ui/results/guidance.js`) paints the guidance card: goal chips, "Fill these in next" and
  "Everything else".
  - It runs the measurements as a background job in slices of at most 40 ms, started from the full render and the
    deferred pass, never the light render.
- The review walk (`estimate-review.js`) walks the card's list.
- The wizard's third step asks for goals.

**Tech Stack:** plain ES modules, esbuild single-file build, Vitest (unit), Playwright (root `test_*.js`).

**Spec:** `docs/superpowers/specs/2026-11-12-dashboard-guidance-design.md`, Part 2 only. Part 3 (goal answers, ranked moves,
removing the run-out banner and the "What do you want to figure out?" card) gets its own plan. This PR removes only that
card's "What's actually driving my results?" button, because the card it opened is gone.

**Base:** this branch starts from `claude/dashboard-verdict` (PR 1, amacgrog/Fire-Planner#97, not yet merged). It uses
PR 1's `findSpendingRoom` / `spendingVariant` (`src/shared/core/analysis/spending-room.js`). Rebase onto `main` once #97
merges.

## Why the impact method is the edge slope (measured 2026-11-14)

The spec suggests running each nudged variant once and converting its end-asset change to $/yr through the slope the room
search measures. The builder checks this against the exact search before committing to it. A scratch Vitest probe (not
committed) compared three figures per field:
- **exact:** a full `findSpendingRoom` per variant;
- **base:** the spec's suggestion. The change in end real total on the base run, over the average slope `(M(0) − M(R)) / R`.
- **edge:** the variant run at the room's edge spending `R`, over the slope measured between `R` and `R + $1,000`.

The measure `M` is the final row's real `total` minus the real sum of `shortfall` over all rows. It is unfloored, so it
keeps falling past depletion. The final row's `investable` is not usable: the plan draws the home after the investments
are gone, so it reads 0 at the edge.

| Household (both directions, $/yr) | Field | exact | edge | base |
|---|---|---|---|---|
| US default (room 9,000) | ssMonthlyA ±10% | +1,600 / −1,600 | +1,647 / −1,578 | +2,034 / −2,037 |
| | retireAgeA ±2 | +4,100 / −4,600 | +5,054 / −4,017 | +6,844 / −5,797 |
| | mortgageRate ±1 pt | −1,200 / +1,200 | −1,244 / +1,279 | −1,967 / +1,891 |
| | taxable ±10% | +200 / −200 | +189 / −204 | +296 / −301 |
| US converting (`CONVERTING`) | trad401kA ±10% | +3,400 / −3,400 | +3,763 / −3,099 | +4,768 / −4,810 |
| US age 40 retiring 50, conversions and ACA on | retireAgeA ±2 | +4,600 / −4,100 | +6,906 / −2,525 | +9,154 / −3,785 |
| | mortgageRate ±1 pt | −1,500 / +400 | −1,120 / +1,674 | −1,890 / +1,866 |
| Canada default (room 7,800) | cppMonthlyA ±10% | +500 / −400 | +526 / −479 | +816 / −801 |
| | retireAgeA ±2 | +3,900 / −4,000 | +6,040 / −4,177 | +8,632 / −5,525 |

**What this shows:**
- The base method overstates lasting plans by 1.5–2× because end assets compound.
- The edge method is mostly within 10–20% and keeps the order. Retirement age is its worst row, overstated up to 50%.
  The early-ACA household is noisier, as expected near the cliff.
- The list ranks fields and says "about", so the edge method is used.
- Cost: one room search (about 11 runs), 2 slope runs, then 2 runs per field.

On a first-run plan every field is still at its default: 34 non-zero estimated fields in each country, 68 runs, 730 ms
(Canada) and 820 ms (US) in Node. That is why the measurements run as a sliced background job, not in the deferred pass.

## Global Constraints

- **Scope:** both planners in this PR. Shared code goes in `src/shared/`. Country data comes through a new seam,
  `#country/core/seam-GUIDANCE_FIELDS`.
- **No projection number changes:** `npm test` stays exact and `tests/golden.js` is untouched.
  - `guidanceGoals` is left out of `monteCarloSeed` (`src/shared/core/projection/simulate.js:47`), or every Monte Carlo seed
    changes.
  - It is also left out of the stored plan's `fingerprintJson` (`src/us/ui/results/plan-optimizer.js:36`), or every applied
    plan reads "computed for different inputs".
- **The state field `guidanceGoals`:** a list of goal keys, default `[]`.
  - `normalizeState` keeps only known keys, once each, in `GOAL_KEYS` order. Anything that is not an array gives `[]`.
  - The engine never reads it.
  - It has **no `FIELDS` entry**: it is not a sidebar control, so a `FIELDS` entry would fail `tests/field_registry.js`.
    `dismissedEstimates` is the precedent. As a result it is not in the MCP schema.
  - A survivor goal saved by a couple is kept when the plan becomes single, and ignored while single.
- **Goal keys** (both countries unless marked): `retire`, `spend`, `convert`, `aca` (US only), `house`, `survivor`
  (couples only), `legacy`.
  - **Labels:**
    - `retire`: "When can I retire?"
    - `spend`: "How much can I spend?"
    - `convert`: "Should I do Roth conversions?" in the US, "Should I do an RRSP meltdown?" in Canada
    - `aca`: "Health cover before Medicare"
    - `house`: "Buy, rent or pay off the house"
    - `survivor`: "What if one of us dies early?"
    - `legacy`: "What I leave behind"
- **Chips are pure filters:**
  - A chip click writes only `state.guidanceGoals`, calls `dismissFirstRunBanner()` and `saveInputs()`, and repaints the
    guidance card and the badges.
    - `dismissFirstRunBanner()` comes first because autosave writes nothing until the page counts as personalized
      (`src/shared/ui/plans/autosave.js:17`). `dismissEstimateField` does the same.
  - It never calls `render()`, never changes another input and takes no undo snapshot.
  - **While a market scenario is on,** the chips and the wizard's goal checkboxes are disabled, with the title
    `Revert the market scenario to change your goals.`
    - Autosave writes the revert snapshot then (`autosave.js:23`), so a change would be lost.
    - This follows the locked saved-scenario controls.
- **Other state keys:** `guidanceGoals` stays in the cliff-plan key (`planning.js:58,195`) and the result-cache keys
  (`simulate.js:107-114`), as `dismissedEstimates` does today.
  - So the first full render after a chip click with nothing else changed (a dollar-mode toggle, say) replans and reruns
    the backtest.
  - Accepted, the cost a dismissal already has. Task 6 measures it.
- **Start ages get no figure.** `ssStartAgeA/B`, `cppStartAgeA/B` and `oasStartAgeA/B` never get a figure, because the
  engine uses the benefit amount as-is from the start age. A ±2-year figure would be claiming advice, which the spec defers
  to Batch 6. They are not measured, and when estimated they go to "Everything else".
  - Only the wizard's goal step turns a feature on:
    - `convert` turns on `rothConvEnabled` (US) or `meltdownEnabled` (Canada);
    - `aca` turns on `acaEnabled` (US).
- **Realistic error** (`IMPACT_RULES`, one frozen object):

  | Field kind | Nudge |
  |---|---|
  | money (Social Security / CPP / OAS included) | ±10% |
  | ages and terms in years | ±2 years |
  | rates | ±1 percentage point, floored at 0 |
  | shares | ±10 points, clamped to [0, 100] |

  The figure is the larger of the two directions.
  - **Shown:** `shownImpact` rounds to the nearest $100. Under $500 it counts as "little effect", and the field goes to
    "Everything else".
  - **Copy:** `about ±$1.6K/yr`, through `compact`.
- **Goal-critical fields** (US Roth basis and state, Canada province):
  - They never get a figure, only their reason.
  - They sort as if they moved the room by `IMPACT_RULES.criticalRank` ($2,000/yr), so they sit among the large items, as
    in the mockup.
- **When:**
  - The measurements run only as the background job started by the full `render()` and `renderDeferred()`. No job starts
    while the US cliff plan's bracket search is pending (`searchPending()` through `#country/core/seam-searchPending`), so
    no figure is measured under the light render's unsearched plan.
  - The light render only repaints from what is already measured. It marks the list `.measuring` when the inputs changed
    since. This is a class of the card's own, not `.stale`, which belongs to the deferred scheduler and which
    `test_deferred_render.js` counts.
  - After the setup slice, a slice runs for at most 40 ms, then yields with `setTimeout(…, 0)`.
  - The setup slice (one room search) may run longer; record its time.
- **Variants** run through `stateContextFor()`, built once per job.
  - A job stops (commits nothing) at the start of any slice where `state` is no longer the object it started with, or its
    key changed. The next full or deferred render starts a new one.
  - Never hand-build a context.
- **Guardrails on:** impacts are measured on `{ ...state, guardrailsEnabled: false }`, so the figure is about the
  fixed-spending room the verdict's room search uses.
- **The list:** "Fill these in next" shows the first 5 rows, then a "Show N more" button. The review walk covers every
  ranked row, not just the first 5.
- **Version badges:** US `V176` → `V177`, Canada `V81` → `V82`, once, in Task 3.
- **Module rules:**
  - Line 1 is a one-line `//` purpose comment, then a blank line.
  - Two-space indentation inside modules.
  - A computing module-level initializer gets a `// load-time:` comment.
  - Run `npm run analyze` after adding or removing modules or exports.
- **Wiring:** new listeners go in a wiring function called once from both `main.js` files.
- **Docs** change in the same commit as the code they describe.
- **Vitest:** through `world()` only; exact comparisons (`toBe`, `toStrictEqual`); a tolerance is written out, never
  `toBeCloseTo`.

## Review Focus

1. **Inputs change while the job runs:** typing mid-measure, or load / undo / reset replacing `state`. No figure for old
   inputs is ever committed or shown unmarked. Test: Task 3, the root-test check "job stops on change".
2. **Guardrails on:** the list still has figures, measured on the guardrails-off run. Test: Task 3, check "guardrails".
3. **A single-person plan:** the survivor chip is hidden, no partner-B field is listed, and a saved survivor goal is kept but
   ignored. Tests: Task 1, `scope: single drops the survivor goal and partner B`; Task 3, check "single".
4. **An old save, and a US plan with an applied stored plan.** The old save loads with `guidanceGoals: []`. The Monte Carlo
   seed and the stored-plan fingerprint are unchanged, so the card still reads "Applied plan in use". Tests: Task 1,
   `monteCarloSeed ignores guidanceGoals` and `storedPlanFingerprint ignores guidanceGoals`.
5. **A chip click on a first visit, or under a market scenario.** On a first visit the goal is saved, because the
   first-run gate is lifted first. Under a market scenario the chips are locked, so no change is lost to the revert
   snapshot. Tests: Task 3, checks "first-run save" and "scenario locks the chips".
6. **A plan that runs out, cannot be fixed, or is at the search cap:** `impactSetup` still gives a slope, and a missing slope
   (`null`) gives rows with no figure, never an error. Tests: Task 2, `setup on a plan that runs out` and `setup on an
   unfixable plan`; Task 3, check "short plan".

---

### Task 1: Goal tables, scope rules and the `guidanceGoals` field

**Files:**
- Create:
  - `src/us/core/inputs/guidance-fields.js`
  - `src/canada/core/inputs/guidance-fields.js`
  - `src/us/core/seam-GUIDANCE_FIELDS.js`, `src/canada/core/seam-GUIDANCE_FIELDS.js` (facades, as `seam-SENSITIVITY_LEVERS.js`)
  - `src/shared/core/inputs/guidance-scope.js`
  - `tests/unit/shared/guidance-goals.test.js`
- Modify:
  - `src/us/core/inputs/defaults.js`, `src/canada/core/inputs/defaults.js`: `guidanceGoals: []` beside
    `dismissedEstimates`.
  - `src/us/ui/inputs/normalize-state.js:30`, `src/canada/core/inputs/normalize-state.js:23`: the guard.
  - `src/shared/core/projection/simulate.js:40-47`: leave out `guidanceGoals` and extend the comment.
  - `src/us/ui/results/plan-optimizer.js:34-36`: leave out `guidanceGoals` in `fingerprintJson`.
  - `src/shared/core/inputs/estimates.js:10`: `isEstimateCountable`.
  - `src/us/core/inputs/field-meta.js:21-33`, `src/canada/core/inputs/field-meta.js:21-28`: each `gate` takes `(s = state)`.
  - `tests/snapshots/legacy_state.json` (through `node tests/legacy_state.js --update`, an intended change).
  - `docs/architecture/inputs-and-ui.md`, `docs/architecture/test-inventory.md`.

**Interfaces:**
- Produces, in each `guidance-fields.js` and re-exported by its seam:
  - `GOALS`, a frozen array in display order of
    `{ key, label, fields: string[], critical: string[], feature: string | null, couples: boolean }`.
  - `GOAL_KEYS`: `GOALS.map((g) => g.key)`.
  - `BASIC_IDS`:
    - US: `ageA ageB retireAgeA retireAgeB incomeA incomeB spending taxable cash trad401kA trad401kB tradIraA tradIraB roth401kA roth401kB rothIraA rothIraB`
    - Canada: `ageA ageB retireAgeA retireAgeB incomeA incomeB spending taxable cash traditional roth`
  - `CRITICAL`: `{ [id]: { reason: string, when: (s) => boolean } }`.
  - `IMPACT_KIND`: `{ age: string[], rate: string[], share: string[] }`. Every other id is money.
  - `IMPACT_BOUNDS`: `{ [id]: [min, max] }`.
  - `NO_FIGURE`: the start-age ids that are never measured.
  - `CHOICE_ESTIMATE_IDS`: `['stateTax']` (US) or `['province']` (Canada). These are select fields that can be estimated.
- Produces, in `guidance-scope.js` (each function takes the state as its argument and imports no store):
  - `chosenGoals(s) -> goal[]`: in `GOALS` order; drops a `couples` goal when `s.singlePerson`.
  - `scopeIds(s) -> Set<string> | null`:
    - `null` when no goal is chosen, which means every estimated field;
    - otherwise `BASIC_IDS` ∪ each chosen goal's `fields` and `critical`.
  - `goalBroughtIds(s) -> Set<string>`: the chosen goals' `fields`, plus each `critical` id whose `when(s)` holds.
    - Leaves out partner-B ids when `s.singlePerson`. A partner-B id is one that ends in `B` and whose `A` twin (the same
      id with its final `B` replaced by `A`) is also a `defaults` key. Export the rule as `isPartnerBId(id)`.
    - Leaves out ids in an `ESTIMATE_GATED_GROUPS` group whose `gate(s)` is false.
    - Today each gate reads the store's `state` (`src/us/core/inputs/field-meta.js:21-33`). This task changes every gate,
      in both countries, to `gate: (s = state) => ...` reading `s`. `isEstimateCountable` keeps calling `gate()`, and the
      scope module passes its argument, so `guidance-scope.js` imports no store.
  - `criticalRows(s) -> { id, reason }[]`: the chosen goals' `critical` ids, deduplicated in goal order, whose `when(s)`
    holds.
  - `impactKind(id) -> 'money' | 'age' | 'rate' | 'share' | null`. `null` is a `NO_FIGURE` id.
  - `impactBounds(id) -> [number, number] | undefined`.
  - `normalizeGoals(raw) -> string[]`: `GOAL_KEYS.filter((k) => Array.isArray(raw) && raw.includes(k))`.
- Changes: `isEstimateCountable(id, brought = goalBroughtIds(state))` is also true for `brought.has(id)`. Callers that loop
  pass one set.

**The tables.** Complete them from the code each later answer calls. Every id must be a `defaults` key, a numeric
`FIELDS` key or a `CHOICE_ESTIMATE_IDS` entry.

| Goal | `fields` (US; Canada swaps in its own names) | `critical` | `feature` |
|---|---|---|---|
| `retire` | `ssMonthlyA/B ssStartAgeA/B pensionYearlyA/B pensionStartAgeA/B healthcare` (Canada: `cppMonthlyA/B cppStartAgeA/B oasMonthlyA/B oasStartAgeA/B` instead of `ss…`) | US `rothIraBasisA/B roth401kBasisPctA/B` | null |
| `spend` | `retire`'s, plus `mortgage mortgageRate mortgageYears mortgagePrincipal maintenance propertyTax homeInsurance rent` (US also `medicareYearly`) | same as `retire` | null |
| `convert` | US `trad401kA/B tradIraA/B ssMonthlyA/B`; Canada `traditional oasMonthlyA/B` | US `stateTax rothIraBasisA/B`; Canada `province` | US `rothConvEnabled`; Canada `meltdownEnabled` |
| `aca` (US) | `healthcare basisRatio taxable pensionYearlyA/B pensionStartAgeA/B` | — | `acaEnabled` |
| `house` | `homeValue mortgagePrincipal mortgage mortgageRate mortgageYears extraPrincipal maintenance propertyTax homeInsurance rent buyAge buyDownPct buyClosingPct buyTerm buyExtraPrincipal` | — | null |
| `survivor` (`couples: true`) | `lifeExpectancyA/B pensionYearlyA/B survivorDeathAge survivorSpendingPct`, plus US `ssMonthlyA/B` / Canada `cppMonthlyA/B` | — | null |
| `legacy` | `lifeExpectancyA/B homeValue`, plus US `trad401kA/B tradIraA/B` / Canada `traditional` | US `stateTax`; Canada `province` | null |

- No pension survivor-share field exists, so the spec's "pensions' survivor share" has no row.
- The survivor goal does not turn on `survivorEnabled`: that would make the main projection a death scenario. Its gated
  fields stay out while the feature is off (the gate rule above).

`CRITICAL` (exact copy):
- `rothIraBasisA`: `Decides how much of Partner A's Roth IRA can be reached before 59½.`
  - `when: (s) => s.rothIraA > 0 && s.retireAgeA < 60`
- `rothIraBasisB`: the same, for B, and `!s.singlePerson`.
- `roth401kBasisPctA` / `B`: `Decides how much of Partner A's Roth 401(k) can be reached before 59½.`
  - `when` uses `roth401kA` / `roth401kB`, with the same age rule.
- `stateTax`: `Sets the state tax on every withdrawal and conversion.` `when: () => true`.
- `province`: `Sets the provincial tax on withdrawals, the meltdown and the estate.` `when: () => true`.

`IMPACT_KIND` and `IMPACT_BOUNDS` (confirm each rate row against the field's markup: a field found to hold dollars moves to
money):
- **age** (±2 years):
  - `ageA/B retireAgeA/B lifeExpectancyA/B`
  - `pensionStartAgeA/B ltcAgeA/B survivorDeathAge buyAge`
  - US `marriageAgeA rothConvStartAge rothConvEndAge`; Canada `meltdownStartAge meltdownEndAge`
  - `mortgageYears` ([1, 40]) and `buyTerm` ([1, 40])
- **rate** (±1 point, floored at 0):
  - `mortgageRate matchA/B buyClosingPct`
  - US `profitSharingPctA/B` ([0, 25])
  - Canada `tfsaPctA/B fhsaPctA/B`
  - These are percent of pay or a rate.
- **share** (±10 points, [0, 100]):
  - `basisRatio survivorSpendingPct buyDownPct`
  - US `roth401kBasisPctA/B`, and `k401PctA/B iraPctA/B megaPctA/B` (a share of the yearly limit, as their tooltips say)
  - Canada `rrspPctA/B` (a share of the limit)
- `NO_FIGURE`: US `['ssStartAgeA', 'ssStartAgeB']`; Canada
  `['cppStartAgeA', 'cppStartAgeB', 'oasStartAgeA', 'oasStartAgeB']`.
  - These are never measured (Global Constraints, "Start ages get no figure").
  - Export it beside `IMPACT_KIND`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/guidance-goals.test.js`. They run in both projects unless
  marked `usIt`. Load the seam's module as `w.load(\`${country}/core/inputs/guidance-fields.js\`)`.
  - **`defaults carry guidanceGoals: []`.**
  - **`normalizeState keeps known goals in order, once each`:** `(await w.setState({ guidanceGoals: ['legacy', 'bogus', 'retire', 'retire'] })).guidanceGoals`
    is `['retire', 'legacy']`.
  - **`normalizeState: not a list gives []`:** run it on `'retire'`, `null` and `{}`.
  - **`Canada drops aca`:** in Canada, `['aca', 'house']` gives `['house']`. In the US it gives `['aca', 'house']`.
  - **`monteCarloSeed ignores guidanceGoals`:** model it on `tests/unit/shared/success-with.test.js:5`.
    `monteCarloSeed(2026, 500, { ...s, guidanceGoals: ['retire'] })` equals `monteCarloSeed(2026, 500, noKey)`.
  - **`storedPlanFingerprint ignores guidanceGoals`** (`usIt`): model it on `tests/unit/shared/list-names.test.js:128`.
  - **`tables name real fields`:**
    - Every `fields` / `critical` / `IMPACT_KIND` / `IMPACT_BOUNDS` / `BASIC_IDS` id is `in defaults`.
    - Every goal's `feature` is `null` or a boolean `defaults` key.
    - `GOAL_KEYS` has no duplicates.
    - Every `CRITICAL` key appears in some goal's `critical`.
  - **`scope: no goal means every field`:** `scopeIds({ ...s, guidanceGoals: [] })` is `null`.
  - **`scope: convert`** (US): `scopeIds` for `['convert']` has `ageA`, `trad401kA` and `stateTax`, and no `homeValue`.
  - **`scope: single drops the survivor goal and partner B`:**
    - With `{ singlePerson: true, guidanceGoals: ['survivor', 'retire'] }`, `chosenGoals(...)` has the keys `['retire']`.
    - `goalBroughtIds(...)` has no id ending in `B`.
    - The saved `guidanceGoals` is still `['retire', 'survivor']`.
  - **`critical rows follow when`** (US):
    - `{ guidanceGoals: ['retire'], retireAgeA: 55, rothIraA: 100000 }`: `criticalRows` contains
      `{ id: 'rothIraBasisA', reason: CRITICAL.rothIraBasisA.reason }`.
    - The same with `retireAgeA: 62` (and `ageA` ≤ 62) leaves it out.
  - **`a goal makes its assumption fields countable`:**
    - `isEstimateCountable('lifeExpectancyA')` is `false` with `guidanceGoals: []`, and `true` with `['legacy']`.
    - Read it through `w.load('shared/core/inputs/estimates.js')` after each `setState`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/guidance-goals.test.js`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.**
  - **Line-1 comments:**
    - `guidance-fields.js`: `// <Country> guidance goals: the goals, the fields each brings in, and each field's realistic error`
    - `guidance-scope.js`: `// Which fields the chosen guidance goals bring in, and how far each one is nudged`
  - **The guard:** `s.guidanceGoals = normalizeGoals(raw?.guidanceGoals)`, beside `dismissedEstimates`.
    - The US `normalize-state.js` imports `normalizeGoals` from `shared/core/inputs/guidance-scope.js`. Canada imports the same.
    - `guidance-scope.js` reads the country tables through the seam.
  - **`monteCarloSeed` and `fingerprintJson`:** add `guidanceGoals` to the destructured-away names. The seed comment gains:
    "guidanceGoals (dashboard guidance PR 2) is left out by name too: it only filters the guidance card, and the new key
    would change every seed".
  - **`isEstimateCountable`:** gains the `brought` parameter. In `computeCountedEstimateIds`, compute `goalBroughtIds(state)`
    once and pass it.

- [ ] **Step 4: Run.**
  - `npx vitest run tests/unit/shared/guidance-goals.test.js` passes, and passes again with `--sequence.shuffle`.
  - `npm run analyze`.
  - `node tests/engine_purity.js`, `node tests/core_purity.js` and `node tests/core_import.js` pass.
  - `npm run build && node tests/legacy_state.js` fails only on the new key. Then run `node tests/legacy_state.js --update`
    (an intended change: every normalized state gains `guidanceGoals: []`).
  - `npm test`: `tests/snapshot_ui.js` moves its per-control state hashes and `executeStateHash`
    (`tests/snapshot_ui.js:174,222,231`) for the new key, and nothing else. Run `npm run snapshot:update` and say so in the
    commit.
  - Add a line to the spec's "Goals" section recording that `guidanceGoals` has no `FIELDS` entry (it is a list, not a
    sidebar control), a deliberate departure from the Constraints line.

- [ ] **Step 5: Commit.**
  - Include:
    - the test-inventory line for the new suite;
    - the `inputs-and-ui.md` paragraph: the field, its guard, why it has no `FIELDS` entry, and its exclusion from the seed
      and the fingerprint;
    - the spec line;
    - the legacy and `snapshot_ui` baselines.
  - `git commit -m "Guidance goals: the goal tables, scope rules and the saved guidanceGoals field (dashboard guidance PR 2)"`

---

### Task 2: Core: one field's effect on the spending room

**Files:**
- Create: `src/shared/core/analysis/field-impact.js`, `tests/unit/shared/field-impact.test.js`
- Modify: `docs/architecture/test-inventory.md`

**Interfaces:**
- Consumes:
  - `findSpendingRoom`, `spendingVariant` (`spending-room.js`, PR 1);
  - `simulateWith` (`core/projection/runs.js`);
  - `displayValueOf` (`core/format/display-value.js`).
- Produces:
  - `IMPACT_RULES`: `Object.freeze({ moneyPct: 10, ageYears: 2, ratePts: 1, sharePts: 10, slopeStep: 1000, minShown: 500, criticalRank: 2000 })`,
    with a `// load-time:` comment.
  - `nudgedInputs(base, id, kind, dir, bounds) -> inputs | null`. `dir` is `1` or `-1`.
    - `null` when the clamped value equals `base[id]`, so the field is not run.
    - money: `v + (v * moneyPct * dir) / 100` (this form keeps 30000 → 33000 exact).
    - age: `v + ageYears * dir`. rate: `max(0, v + ratePts * dir)`. share: clamped to [0, 100].
    - Then `bounds` clamp.
    - **Linked keys,** as `normalizeState` does:
      - a nudged `ageX` raises `retireAgeX` to at least the new age, and `lifeExpectancyX` to at least the new age + 1;
      - a nudged `retireAgeX` is clamped to [`ageX`, `lifeExpectancyX`];
      - a nudged `lifeExpectancyX` is clamped to [`ageX` + 1, 110].
    - Returns a shallow copy (`{ ...base, ... }`) and never writes `base`.
  - `endMeasure(sim, inputs) -> number`: the final row's `total` in real dollars, minus the real sum of every row's
    `shortfall`. Both are converted with `displayValueOf('real', inputs.inflation, x, r.year, r.cumFactor)`.
  - `impactSetup(base, contextFor) -> { d0, m0, slope, runs } | null`.
    - `d0` is `findSpendingRoom(simulateWith(contextFor(base)), base, contextFor).room`. That is the room, the cap, or the
      unfixable floor.
    - `m0 = endMeasure` at `spendingVariant(base, d0)`.
    - `slope = (m0 − endMeasure at d0 + slopeStep) / slopeStep`.
    - `null` unless `slope > 0`.
    - `runs` counts every projection, the search's included.
  - `fieldImpact(base, id, kind, bounds, setup, contextFor) -> number`: ≥ 0, unrounded. It is the largest of
    `|endMeasure(simulateWith(contextFor(spendingVariant(v, setup.d0))), v) − setup.m0| / setup.slope` over the two
    directions, where `v = nudgedInputs(...)`. A `null` direction counts 0.
  - `shownImpact(x) -> number`: `0` when `x < minShown`, else `Math.round(x / 100) * 100`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/shared/field-impact.test.js`.

  **The `DRAW` household** (`usIt`). It is the PR 1 household of `tests/unit/shared/spending-room.test.js:8`: zero returns,
  zero inflation, $400,000 Roth over 10 years.
  - Set it up as that file's `room()` helper does: `setState`, `refreshCliffPlan()`, `stateContextFor()`.
  - At `spending: 30000`:
    - `M(d) = 400000 − 10 × (30000 + d)`, linear across depletion, because the shortfall counts what no account covers.
    - So the room is 10,000, `M` at the edge is 0, and the slope is 10.

  | Test | Call | Expected |
  |---|---|---|
  | `setup measures the edge slope` | `impactSetup(state, ctxFor)` without `runs` | `{ d0: 10000, m0: 0, slope: 10 }` |
  | `a balance moves the room by a tenth of itself per year` | `fieldImpact(state, 'rothIraA', 'money', undefined, setup, ctxFor)` | `4000` (±40,000 over 10 years) |
  | `spending moves the room by its own nudge` | `'spending'`, money | `3000` |
  | `a longer life is measured at the base slope` | `'lifeExpectancyA'`, age | `8000` (±2 years at $40,000, over the slope 10). The exact room changes are −6,667 (76: 400,000 / 12 − 30,000) and +10,000 (72: 400,000 / 8 − 30,000), so the method understates here: its documented approximation |
  | `a zero balance has no effect` | `'trad401kA'`, money | `0` |
  | `setup on a plan that runs out` | `spending: 45000` | `{ d0: -5000, m0: 0, slope: 10 }` |
  | `setup on an unfixable plan` | PR 1's unfixable patch plus flat rent (`rothIraA: 100000`, `rothIraBasisA: 100000`, `rent: 1000`, `rentGrowth: 0`) | `{ d0: -30000, m0: -20000, slope: 10 }` (spending 0: $120,000 of rent against $100,000; spending 0 → 1,000 adds $10,000 of shortfall). Without `rentGrowth: 0`, `m0` is −37,566.55… |

  All seven rows were checked against the engine on 2026-11-14 (scratch probe). The `rothIraA` nudges move `M` by exactly
  ±40,000, `spending` by ∓30,000 and `lifeExpectancyA` by ∓80,000.

  **`nudgedInputs`** (both countries). Each case sets its own base values with `w.setState({ ... })`; the default spending is
  60,000, not 30,000:
  - `{ spending: 30000 }`: `+1` gives 33000, `-1` gives 27000.
  - `{ mortgageYears: 40 }` with `[1, 40]` and `+1` gives `null`.
  - `{ ageA: 65, retireAgeA: 65, lifeExpectancyA: 74 }`, `ageA` `+1`, gives `ageA` 67, `retireAgeA` 67, `lifeExpectancyA` 74.
  - `{ basisRatio: 95 }`, `+1`, gives 100. `{ basisRatio: 100 }`, `+1`, gives `null`.
  - `{ mortgageRate: 0.5 }`, `-1`, gives 0.
  - The base object is unchanged (`toStrictEqual` against a copy taken before).

  **`shownImpact`:** 499 → 0, 500 → 500, 1649 → 1600, 1650 → 1700.

  **`the edge method keeps the exact order: default household`** (both countries):
  - Fields: US `ssMonthlyA retireAgeA taxable mortgageRate incomeA`; Canada `cppMonthlyA retireAgeA taxable mortgageRate incomeA`.
  - For each, `exact` is the larger |`findSpendingRoom(variant).room − base room`| over the two `nudgedInputs` directions.
    `approx` is `fieldImpact`.
  - The field with the largest `exact` also has the largest `approx`.
  - For every field with `exact >= 1000`, `approx >= exact / 2 && approx <= exact * 2`, written out with a message.
  - These are runs in one process, so the check holds on Node 22 and 24.

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/field-impact.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/core/analysis/field-impact.js`.**
  - Line 1: `// How far a realistic error in one field moves the spending room (the guidance list's figure)`.
  - Add a comment over `impactSetup` naming the measure. It is unfloored because the shortfall keeps counting past
    depletion. `investable` would read 0 at the edge, because the plan draws the home last.
  - An engine module: context first where it takes one, no store import, no module-level mutable.

- [ ] **Step 4: Run.**
  - The suite passes in both projects, and again with `--sequence.shuffle`.
  - Run it on Node 22 and Node 24 (rule 6).
  - `npm run analyze`; `node tests/engine_purity.js`.

- [ ] **Step 5: Commit**, with the test-inventory line:
  `git commit -m "Field impact: a field's realistic error in spending-room dollars (dashboard guidance PR 2)"`.

---

### Task 3: The guidance card and the review walk

**Files:**
- Create:
  - `src/shared/ui/results/guidance.js`
  - `test_guidance.js` (repo root, both planners)
- Modify:
  - **Both shells** (`src/us/index.html:213`, `src/canada/index.html:155`):
    - `#estimatedRollupBanner` is replaced by `#guidanceCard` in the same place;
    - the badges become `V177` / `V82`.
  - `src/shared/ui/inputs/estimate-badges.js`:
    - `computeCountedEstimateIds` and `renderEstimateBadges` cover `[...ids, ...CHOICE_ESTIMATE_IDS]`;
    - `markDefaultFields` stays on `ids`.
  - `src/shared/ui/inputs/estimate-review.js`.
  - `src/shared/ui/inputs/field-listeners.js`:
    - the choice-field `change` listener un-dismisses an id in `CHOICE_ESTIMATE_IDS`, the way the number listener does at
      `:24`;
    - otherwise a dismissed state or province stays dismissed after an edit.
  - `test_deferred_render.js:41`: `look()` leaves out `#guidanceCard`, as it leaves out `#planVerdictHist`. Its stale
    captures and "nothing redraws after a full render" check must not see the job's repaint.
  - Both `render.js`:
    - the `renderEstimatedRollup(countedEstimateIds)` call (US `:51`) becomes `renderGuidance(countedEstimateIds); renderEstimateReview();`;
    - `scheduleFieldImpacts()` is called in `render()` when `!light`, and at the end of `renderDeferred()`.
  - Both `main.js`: call `wireGuidance()` beside `wireEstimateReview()`.
  - `src/shared/ui/install-test-hooks.js`.
  - `src/shared/styles/styles.css`.
  - `README.md`, `docs/architecture/inputs-and-ui.md`, `docs/architecture/test-inventory.md`.
  - `CLAUDE.md`: the sanctioned-writes paragraph gains "the guidance goal chips and the wizard's goal step
    (`src/shared/ui/results/guidance.js`: `state.guidanceGoals`, and the feature a goal turns on in setup)".

**Interfaces:**
- Consumes:
  - Task 1: `chosenGoals`, `scopeIds`, `criticalRows`, `impactKind`, `impactBounds`, `normalizeGoals`, `isPartnerBId`,
    `GOALS`, `CHOICE_ESTIMATE_IDS`.
  - Task 2: `impactSetup`, `fieldImpact`, `shownImpact`, `IMPACT_RULES`.
  - Elsewhere:
    - `computeCountedEstimateIds`, `renderEstimateBadges`;
    - `stateContextFor`, `saveInputs`, `dismissFirstRunBanner`, `compact`;
    - `currentMarketScenarioText` (`market-scenario-banner.js`);
    - `searchPending` (`#country/core/seam-searchPending`).
- Produces, in `guidance.js`:
  - `renderGuidance(countedIds)`: paints the chips, the ranked list and "Everything else" from what is already measured.
    It runs no projection, and is called on every render, light or not.
  - `scheduleFieldImpacts()`: starts the measuring job when anything in scope is unmeasured for the current inputs.
    Otherwise it does nothing.
  - `rankedFieldIds() -> string[]`: the walk order, every ranked row.
  - `setGoal(key, on, { fromSetup = false } = {})`: the only writer of `state.guidanceGoals` (Task 4 calls it with
    `fromSetup: true`).
  - `resetSetupFeatures()`: Task 4 calls it when the wizard opens.
  - `wireGuidance()`: delegated chip and "Show more" listeners on `#guidanceCard`.
  - `runGuidanceJobToEnd()`: for the test hook.
  - It dispatches `document` `CustomEvent('guidance-change')` after a chip change and after a job commits.
- The import direction: `estimate-review.js` imports `rankedFieldIds` from `guidance.js`; `guidance.js` never imports
  `estimate-review.js`. Instead, estimate-review listens for `guidance-change`.
- Test hooks (shared `install-test-hooks.js`):
  - `__test_guidance()` returns `{ goals, ranked: [{ id, impact, reason }], other: string[], pending: boolean, setupState }`.
    - `impact` is `shownImpact(...)` or `null`.
    - `reason` is a string or `null`.
    - `setupState` is one of:
      - `'none'` (`memo.setup === undefined`, not measured);
      - `'no-slope'` (`null`);
      - the setup without `runs`.
  - `__test_flushGuidance()` calls `runGuidanceJobToEnd()`.

**Markup** (both shells; US labels shown):
```html
<div class="callout guidance-card" id="guidanceCard"><div class="guidance-goals" id="guidanceGoals" role="group" aria-label="Your goals"><span class="guidance-goals-label">Your goals:</span></div><h3 class="guidance-head">Fill these in next <span id="guidanceCount"></span> · <button type="button" id="reviewEstimatesBtn">Review →</button></h3><ol class="guidance-list" id="guidanceList"></ol><button type="button" class="link-btn" id="guidanceMoreBtn" hidden></button><details class="guidance-other" id="guidanceOther"><summary id="guidanceOtherSummary"></summary><ul id="guidanceOtherList"></ul></details></div>
```
Chips are created by `renderGuidance` from `chosenGoals`/`GOALS`:
- `<button type="button" class="guidance-chip" data-goal="${key}" aria-pressed="${on}">${label}</button>`;
- a `couples` goal is hidden while single;
- every chip is `disabled`, with the market-scenario title, while `currentMarketScenarioText() !== null`.

**Rows.** Each row is computed fresh by `renderGuidance`:
1. **Shown ids:** `countedIds`, keeping only ids whose element has no `[hidden]` ancestor (`!el.closest('[hidden]')`).
   Reveals and partner-B rows use `hidden`. Everything below, the counts and "Everything else" included, uses these, so a
   hidden field is never named or counted.
2. **Candidates:** the shown ids ∩ `scopeIds(state)` (all shown ids when that is `null`), minus `NO_FIGURE` ids.
3. **Critical:** a candidate in `criticalRows(state)` gets `{ id, reason, rank: criticalRank }`.
4. **Measured:** a candidate with a memo value `x` gets `{ id, impact: shownImpact(x), rank: x }`. One under `minShown`
   goes to "Everything else".
5. **Unmeasured:** a candidate with no memo value, or a `null` setup, gets `{ id, impact: null, rank: -1 }`.
6. **Order:** by `rank` descending, ties in sidebar order. `rankedFieldIds()` is these ids.
7. **Everything else:** the shown ids minus the ranked ids, in sidebar order.

**Copy** (exact):
- **A row:** `<li><button type="button" class="guidance-field" data-field="${id}">${fieldLabel(id)}</button><span class="guidance-why"> — ${why}</span></li>`, where `why` is one of:
  - `about ±${compact(impact)}/yr on your spending room`;
  - the critical `reason`;
  - `measuring…` while the job is pending;
  - `not measured yet` when there is no value and no job is pending (a stopped job, before the next render);
  - `effect not measured` with a `null` setup.
- **`fieldLabel(id)`:** the label's direct text nodes plus the direct text nodes of its `.info-nw` (not the info button's
  "i"), trimmed. This is the rule of `mainLabelText` in `src/shared/ui/inputs/field-search.js:66-76`, written again
  because that function is nested.
  - Build each row with DOM nodes and set the label and the reason through `textContent`, never `innerHTML`.
- **`#guidanceCount`:** `(${ranked.length} of ${shown.length} estimated)`.
  - With no ranked rows, the list holds one `<li class="guidance-empty">`:
    - `Nothing in scope is still estimated.`, or
    - `All your numbers are filled in.` when there are no shown ids.
  - `#reviewEstimatesBtn` is hidden.
- **`#guidanceMoreBtn`:** `Show ${n} more` while `n` ranked rows are beyond the first 5 and `showAll` is false;
  `Show fewer` while `showAll` is true; hidden otherwise.
- **`#guidanceOtherSummary`:** `Everything else (${n} ${n === 1 ? 'field' : 'fields'})`. Hidden when `n === 0`.
- **`#guidanceList` carries `.measuring`** while a job is pending or `impactKey(state) !== memo.key`.

**The job** (module state, assigned only in `guidance.js`; `guidance.js` is in the render cycle, so each `new Map()` /
`new Set()` initializer gets a `// load-time:` comment):
- **The memo:** `let memo = { key: null, setup: undefined, values: new Map() }`. A `setup` of `undefined` means not yet
  measured.
  - `impactKey(s)` is the context's `taxYear`, `|`, then `JSON.stringify` of `s` without `guidanceGoals`,
    `dismissedEstimates` and `dismissedUnusualAssumptions`.
  - So a chip click or a dismissal keeps every figure.
- **`scheduleFieldImpacts()`:**
  - Return at once while `searchPending()`. The deferred pass that runs the search calls it again.
  - On a new key, reset the memo.
  - The queue is the unmeasured, non-critical candidates.
  - If the setup is still `undefined` or the queue is not empty:
    - bump `gen`;
    - store `job = { gen, key, state, ctxFor: stateContextFor(), queue }`;
    - `const g = gen; setTimeout(() => step(g), 0)`.
- **`step(g, sync = false)`:**
  - Return if `!job || job.gen !== g`. A timer left behind by a finished, stopped or replaced job does nothing.
  - If `state !== job.state || impactKey(state) !== job.key`, set `job = null` and return without committing.
  - Only when `memo.setup === undefined`, the slice computes `memo.setup = impactSetup(impactBase, job.ctxFor)` and then
    yields. `impactBase` is `{ ...state, guardrailsEnabled: false }` when guardrails are on, else `state`. A restarted job
    on the same key never measures the setup twice.
  - Otherwise the slice measures queued ids until 40 ms have passed (`performance.now()`; no limit when `sync`), each one
    `memo.values.set(id, memo.setup ? fieldImpact(impactBase, id, impactKind(id), impactBounds(id), memo.setup, job.ctxFor) : null)`.
  - **When the queue is empty:**
    - set `job = null`;
    - call `renderGuidance(computeCountedEstimateIds())`;
    - dispatch `guidance-change`.
  - **Otherwise,** unless `sync`: `setTimeout(() => step(g), 0)`.
- **`runGuidanceJobToEnd()`:** `while (job) step(job.gen, true)`. It schedules no timer.
- **Under Playwright's fake clock** `performance.now()` stands still, so a slice runs the whole queue. That is harmless,
  but it lengthens every test that renders. Task 6 measures it.

**`setGoal(key, on, { fromSetup })`:**
- `state.guidanceGoals = normalizeGoals(on ? [...state.guidanceGoals, key] : state.guidanceGoals.filter((k) => k !== key))`.
- Then:
  - `dismissFirstRunBanner()` and `saveInputs()`;
  - `renderEstimateBadges(computeCountedEstimateIds())`, `renderGuidance(...)`;
  - `scheduleFieldImpacts()`, because newly in-scope fields need figures;
  - the `guidance-change` event.
- It does nothing while a market scenario is on (the chips are disabled then).
- **With `fromSetup`:**
  - **Turning a goal on whose `feature` is off:** check the sidebar's checkbox `#${feature}` and dispatch `change`, the way
    `wireWizardCheckboxes` drives features today. Remember the feature in a module `Set` (`turnedOnBySetup`).
  - **Turning a goal off whose feature is in that set:** uncheck it the same way and drop it from the set.
- `resetSetupFeatures()` empties the set.

**estimate-review.js:**
- `renderEstimatedRollup(countedIds)` becomes `renderEstimateReview()`. It reads `rankedFieldIds()` and keeps:
  - the auto-advance;
  - the `Review →` / `Next →` label;
  - `syncReviewNav()`.
  It loses the banner text.
- `syncReviewNav` and `advanceReview` use `rankedFieldIds()` instead of `computeCountedEstimateIds()`.
- **Auto-advance** (jumping to the next field when the one being reviewed leaves the list) happens only from the
  `render()` path, when the field was edited or dismissed.
- `wireEstimateReview()` adds:
  - a `guidance-change` listener. It only refreshes the label and the pill.
    - If the field being reviewed is no longer ranked (a chip dropped its goal, or a job pushed it under $500), it ends the
      review (`reviewingFieldId = null`, the pill hidden).
    - It never jumps, scrolls or switches the mobile view;
  - a delegated `click` on `#guidanceList [data-field]` that starts the walk at that field (`jumpToEstimateField(id)`,
    then `renderEstimateReview()`).

- [ ] **Step 1: Write `test_guidance.js`.**
  - **Form:** model it on `test_plan_verdict.js`. It reads the build, exits 1 on failure, collects `pageerror` and uses no
    fixed waits.
  - **Reading results:** after any change, call `__test_flushRender()`, then `__test_flushGuidance()`.
  - Checks run in both planners unless marked:
  - **"first run":** on a fresh page, `ranked` is non-empty. Its measured rows have descending `impact`. Every ranked id's
    label has an `.estimate-badge`. `#guidanceOtherSummary` matches `/^Everything else \(\d+ fields?\)$/` or is hidden.
  - **"chips only filter":**
    - Record `JSON.stringify(window.fireProjectionRows)` and `__test_getState()` without `guidanceGoals`.
    - Click `[data-goal="convert"]`.
    - Then:
      - `goals` is `['convert']`;
      - the rows and the rest of the state are unchanged, including `rothConvEnabled` / `meltdownEnabled`;
      - the chip has `aria-pressed="true"`;
      - every ranked id is in `BASIC_IDS` ∪ the convert goal's ids (pass the lists in from the test);
      - US: a `stateTax` row's text contains `state tax`; Canada: a `province` row contains `provincial tax`.
  - **"goals are saved":** reload the page; `[data-goal="convert"]` is still pressed.
  - **"review walks the list":**
    - Click `#reviewEstimatesBtn`: `document.activeElement.id === ranked[0].id`, and `#reviewNavCount` reads
      `${ranked.length} fields left`.
    - Click `#reviewNavNext`, then flush: `ranked[0].id` is in `__test_getState().dismissedEstimates`, and focus is on the
      new `ranked[0]`.
  - **"a filled field leaves the list":** fill the first money row with another value and dispatch `change`. After the
    flushes it is in neither `ranked` nor `other`.
  - **"light render does not measure":** one `page.evaluate`, so no timer runs between the steps:
    - Set `#spending`, dispatch `input`, call `__test_flushLightRender()`.
    - Read: `pending` is `false` and `#guidanceList` has `.measuring`.
    - Then call `__test_flushRender()` and read `pending` (`true`).
  - **"job stops on change":** one `page.evaluate`, with no await between the steps:
    - Start a job: set `#spending` to a new value, dispatch `input` (which writes the state), then `change`, then call
      `__test_flushRender()`. The memo is reset and a job is pending.
    - Set `#taxable` to a new value and dispatch `input`. The field listener writes `state` at once; the light render waits
      400 ms.
    - Call `__test_flushGuidance()`. Expected:
      - `pending` is `false`;
      - `setupState` is `'none'` (the job stopped before its setup slice committed);
      - `#guidanceList` has `.measuring`.
    - A `__test_flushRender()` and `__test_flushGuidance()` then give an object `setupState` and figures, and `.measuring`
      clears.
  - **"guardrails":** check `#guardrailsEnabled`. `setupState` is an object, and at least one ranked row has a number
    `impact`.
  - **"single":** check `#singlePerson`.
    - `[data-goal="survivor"]` is hidden.
    - No ranked or `other` id is a partner-B id (`isPartnerBId`, passed in as a list from the test).
    - `#guidanceCount` counts no hidden field.
  - **"start ages":** on a fresh page, `ssStartAgeA` (Canada: `cppStartAgeA`) is not ranked, and is in `other`.
  - **"walk survives a chip":**
    - Start the walk, then untick every chip through `page.evaluate` clicks while the field being reviewed stays ranked:
      focus does not move.
    - Then tick only `house`, which drops the field being reviewed: `#reviewNav` is hidden, and the mobile view is
      unchanged.
  - **"scenario locks the chips":** `__test_runMarketScenario(...)` (argument shape as in `test_plan_verdict.js`). Every
    `.guidance-chip` is `disabled`. `__test_revertMarketScenario()` enables them.
  - **"first-run save":** on a fresh page, click a chip, then reload: the chip is still pressed.
  - **"short plan":** spending 250000 gives no page error, and every ranked row has a number or a reason.
  - **"mobile":** at 390×844, after clicking `#guidanceMoreBtn`, `scrollWidth > clientWidth` is `false`.

- [ ] **Step 2: Run** `npm run build && node test_guidance.js`. Expected: FAIL (`#guidanceCard` missing).

- [ ] **Step 3: Markup and styles.**
  - `.guidance-card` uses the callout look.
  - `.guidance-goals` is a wrapping flex row, gap 6px.
  - `.guidance-chip` is a pill. It uses the accent colours when `[aria-pressed="true"]`.
  - `.guidance-list` is a numbered list. `.guidance-why` is muted.
  - Add `.guidance-list.measuring { opacity: .5; transition: opacity .15s }`.
  - Delete the `.estimated-rollup` rules.

- [ ] **Step 4: Implement `guidance.js`** as above. Line 1:
  `// The guidance card: goal chips, the fields worth filling in next, and the background job that measures them`.

- [ ] **Step 5: Wire it.**
  - Make the `render.js` calls, `estimate-review.js` and the hooks, and call `wireGuidance()` in both `main.js` files.
  - **Docs:**
    - **README:** replace the "still estimated" review bullet with the goals, the ranked list and the review walk.
    - **`inputs-and-ui.md`:** a "Guidance card" paragraph covering:
      - the scope rules;
      - the edge-slope method and its probe table, in short;
      - the job: slices, its key, the stop rule, the `searchPending` wait and `__test_flushGuidance`;
      - that chips never call `render()`, and that they are locked under a market scenario;
      - that the figure is the larger direction, usually the compounding one, which the probe shows overstates. That is
        accepted for a ranking figure.
    - **`test-inventory.md`:** add `test_guidance.js`.
    - **`CLAUDE.md`:** add the sanctioned-writes line. In the "Deferred rendering" invariant, add that a test reading the
      guidance list calls `__test_flushGuidance()` after `__test_flushRender()`.
  - Bump both badges.

- [ ] **Step 6: Timing.** In the built US and Canada planners, measure on a fresh first-run page and on the default plus
  `guidanceGoals: ['retire', 'convert']`:
  - the setup slice;
  - the longest later slice;
  - the job's total wall time.

  Use a temporary console snippet with `performance.now()` around `step` (not committed). Record them for the PR
  description. **If a later slice is over 60 ms, or the setup slice over 250 ms, stop and report.**

- [ ] **Step 7: Run.**
  - `npm run build && node test_guidance.js && node test_deferred_render.js && node test_plan_verdict.js` pass.
  - `npm run analyze`; `node tests/ui_cycles.js && node tests/closure_names.js && node tests/doc_paths.js` pass.
  - `npm test` passes except for the `snapshot_ui` text and layout hashes. Confirm that only the guidance card (it replaces
    the rollup banner) and the badges moved, then run `npm run snapshot:update`.

- [ ] **Step 8: Commit** with the baselines:
  `git commit -m "Guidance card: goal chips and the fields worth filling in next (US V177, Canada V82)"`.

---

### Task 4: The new setup wizard

**Files:**
- Modify:
  - **`src/us/index.html:359-405`:**
    - step 2 loses the `.wizard-callout` and gains the Roth basis fields;
    - step 3 becomes the goals step.
  - **`src/canada/index.html:270-305`:**
    - step 1 keeps only the basics;
    - a new step 2 holds the balances;
    - step 3 is the goals step.
  - `src/us/ui/wizard.js`, `src/canada/ui/wizard.js`: `wireWizardCheckboxes` keeps only `wizardSinglePerson`.
  - `src/shared/ui/wizard.js`: the goal checkboxes, `resetSetupFeatures()` on open, and Done leading to the card.
  - **`src/us/ui/inputs/fields.js`, `src/canada/core/inputs/fields.js`:** remove the `mirrors` of the deleted wizard
    checkboxes:
    - US: `wizardLtcEnabled`, `wizardAcaEnabled`, `wizardRothConvEnabled`, `wizardMegaBackdoor`, `wizardGuardrailsEnabled`;
    - Canada: `wizardLtcEnabled`, `wizardMeltdownEnabled`, `wizardGuardrailsEnabled`.
  - `test_wizard_accounts.js`, `docs/architecture/inputs-and-ui.md` ("First-run wizard"), `README.md`.

**Interfaces:**
- Consumes: `setGoal`, `resetSetupFeatures` (Task 3); `GOALS` (Task 1).
- Produces: none for later tasks.

**Markup:**
- **US step 2:** after the Roth IRA rows, a `<h3 class="wizard-subhead">Roth basis</h3>` and four fields:
  - `wizardRothIraBasisA/B`: money, mirroring `rothIraBasisA/B`.
    `<small>What you contributed (not earnings): reachable at any age with no tax or penalty.</small>`
  - `wizardRoth401kBasisPctA/B`: number 0–100, mirroring `roth401kBasisPctA/B`. `<small>The share of the balance that is
    your contributions.</small>`
  - Partner B rows carry `data-partner-b`.
- **Step 3 (both countries):**
  - `data-title="What are you trying to decide?"`.
  - `data-note="pick any that apply. They decide which numbers the dashboard asks you to check first; you can change them any time with the chips above the list."`
  - The step's markup holds only an empty `<div id="wizardGoalList" class="wizard-grid"></div>`.
    - `wireWizard()` fills it once from `GOALS`: one
      `<div class="field"><label><input type="checkbox" data-wizard-goal="${key}"> ${label}</label></div>` per goal.
    - The labels are set with `textContent`, so they exist only in the tables.
    - The survivor row carries `data-partner-b`, which the existing `[data-partner-b]` sync hides for a single person.
  - The goal checkboxes have no `id`, so `tests/field_registry.js` does not ask for a registration.
  - While a market scenario is on, the checkboxes are `disabled` (as the chips are).
  - The "Other items" note stays.

**Behaviour:**
- **Opening the wizard** (`#wizardBtn`):
  - `resetSetupFeatures()`;
  - each `[data-wizard-goal]` is checked when `state.guidanceGoals` has its key.
- **A goal checkbox's `change`:** `setGoal(key, checked, { fromSetup: true })`.
- **Done** (`#wizardCloseBtn`):
  - close the overlay and call `setMobileView('dashboard')`;
  - then `document.getElementById('guidanceCard').scrollIntoView({ behavior: 'smooth', block: 'start' })` and a
    `flash-highlight` for 2600 ms (as `estimate-review.js`).

- [ ] **Step 1: Rewrite `test_wizard_accounts.js`** for both planners. Keep its sidebar-group checks and its desktop and
  mobile loop. The checks:
  - **Three steps in each planner,** titled `Get started: the basics`, `Your balances`, `What are you trying to decide?`,
    with the same Back / Next / Done rules as today.
  - **Canada step 1** has no balance fields. Step 2 has `wizardTaxable`, `wizardTraditional`, `wizardRoth` and
    `wizardCash`.
  - **US step 2** shows `wizardRothIraBasisA` and `wizardRoth401kBasisPctA` (and B for a couple), and has no
    `.wizard-callout`.
    - Filling `wizardRothIraBasisA` with 25000 and dispatching `change` sets `state.rothIraBasisA === 25000`, and the
      sidebar box reads 25000.
  - **Step 3** labels equal the chip labels (`[data-goal]` text).
  - **Ticking a feature goal:** ticking `convert` makes `rothConvEnabled` / `meltdownEnabled` `true`. Unticking it in the
    same opening makes it `false` again. US: the same for `aca` and `acaEnabled`.
  - **A feature already on:** with `rothConvEnabled` already `true` before opening, ticking and then unticking `convert`
    leaves it `true`.
  - **Ticking `retire`** changes nothing in `__test_getState()` but `guidanceGoals`.
  - **Done:** the overlay is closed, `#workspace[data-mobile-view="dashboard"]` (mobile), and `#guidanceCard` is in the
    viewport.
  - **Mobile:** no horizontal overflow on any step at 390×844.
  - **Removed checkboxes:** `#wizardLtcEnabled`, `#wizardRothConvEnabled`, `#wizardGuardrailsEnabled` (and US
    `#wizardAcaEnabled`, `#wizardMegaBackdoor`; Canada `#wizardMeltdownEnabled`) do not exist.

- [ ] **Step 2: Run** `npm run build && node test_wizard_accounts.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the markup, the wiring and the `mirrors` removals.

- [ ] **Step 4: Run.**
  - `npm run build && node test_wizard_accounts.js && node tests/field_registry.js && node test_guidance.js` pass.
  - `npm test`: the wizard is in the `snapshot_ui` captures (`tests/snapshots/ui_*.json`), so its hashes move. Confirm
    only the wizard moved, run `npm run snapshot:update`, and say so in the commit.

- [ ] **Step 5: Commit** with the docs:
  `git commit -m "Setup wizard: basics, balances with Roth basis, then goals (dashboard guidance PR 2)"`.

---

### Task 5: Remove the tornado card

**Files:**
- Delete:
  - `src/shared/ui/charts/tornado.js`
  - `src/us/core/analysis/sensitivity-levers.js`, `src/canada/core/analysis/sensitivity-levers.js`
  - `src/us/core/seam-SENSITIVITY_LEVERS.js`, `src/canada/core/seam-SENSITIVITY_LEVERS.js`
  - `src/us/ui/charts/sensitivity.js`, `src/canada/ui/charts/sensitivity.js`
  - `src/shared/partials/tornadoChart.html`
- Modify:
  - **Both shells:**
    - `#sensitivityCard` and its `@@include tornadoChart`;
    - the decision card's `data-question="sensitivity"` button.
  - **Both `main.js`:** the `wireSensitivityCard` and `wireSensitivityLevers` imports and calls.
  - **Both `render.js`:** the `renderTornadoChart` import and the `renderOpenCards` line (US `:196`, Canada `:157`).
  - **`src/shared/ui/results/render-scheduler.js:67`:** `DEFERRED_CARDS` loses `'sensitivityCard'`.
  - **Both `decision-questions.js`:** the `sensitivity` entry.
  - **`src/shared/ui/install-test-hooks.js`:**
    - `analysisForMode` loses `out.sensitivity` and `ui.tornado`;
    - it gains `out.impacts`: `impactSetup(state, stateContextFor())` without `runs`, plus `fieldImpact` for
      `retireAgeA`, `taxable` and `trad401kA` (Canada: `traditional`).
  - **`src/shared/styles/styles.css:11`:** drop `#sensitivityCard` from the selector, and any tornado rules.
  - **Comments that name the tornado:**
    - `src/shared/ui/layout/layout-listeners.js:12`
    - `src/shared/ui/layout/mobile-view.js:27`
    - `src/shared/ui/results/table-focus.js:14`
    - `src/shared/ui/results/decision-questions.js:16,31`
    - `src/shared/core/analysis/decisions.js:13`
    - `src/shared/core/inputs/estimates.js:20`
  - **`tests/engine-purity.json`:** remove the two `sensitivity-levers.js` entries.
  - **`tests/unit/shared/engine-ratchet.test.js:148,186`:**
    - **The refreshed case (`:148`):** the `SENSITIVITY_LEVERS` loop becomes `impactSetup` once plus `fieldImpact` for
      every id in `BASIC_IDS` and every goal's `fields` (deduplicated, minus `NO_FIGURE`), each `not.toThrow()` and
      `c.tick()`.
    - **The no-refresh case (`:186`):** every variant plans for itself there, so it uses only `impactSetup` plus
      `retireAgeA` and `taxable`, or the case grows by about 100 cliff-plan searches.
    - update the `afterAll` total.
  - **`test_deferred_render.js`:**
    - the tornado pixels and the "projection view with the tornado open" section (`:38`, `:153-168`) go;
    - remove `'sensitivityCard'` from any expected stale list.
  - **`tests/analysis_parity.js`:**
    - the header and the PLAN_G58 self-check now compare `impacts`;
    - if refresh and no-refresh no longer differ there, drop the self-check and say so in the header;
    - note that a base tree before PR 2 has `sensitivity` and no `impacts`.
  - **`tests/bench_heavy.js`:** drop the `slider(tornado)` column.
  - **Comments in `tests/helpers/plan-households.js:28` and `tests/bench_runs_interleaved.js:7`.**
  - **Docs:**
    - `README.md:67` (the tornado bullet goes);
    - `docs/architecture/inputs-and-ui.md` (the "Sensitivity" bullet becomes the guidance card's pointer, and the
      `render()` bullet's list of open cards);
    - `docs/architecture/engine.md:69-70,92`;
    - `docs/architecture/cliff-plan.md:217-218`;
    - `docs/architecture/module-system.md:121,127,202,208-209`;
    - `docs/architecture/test-inventory.md:94,204,209`;
    - `CLAUDE.md:314` (`computeSensitivity` → `impactSetup` / `fieldImpact`).
  - **`docs/superpowers/inventory/stage4-region-map.md`, `stage4-open-items.md`:** each row naming a deleted path is
    reworded as PR 1 did (`tornado.js (removed in dashboard guidance PR 2)`, with no `src/` path).
  - `scripts/extractions/*.json` are historical extraction records: leave them unchanged.

**Interfaces:**
- Consumes: `impactSetup`, `fieldImpact`, `BASIC_IDS`, `GOALS`, `impactKind`, `impactBounds` (Tasks 1–2).
- Produces: none.

- [ ] **Step 1: Delete and edit** as listed. Then run
  `grep -rn "sensitivityCard\|tornado\|SENSITIVITY_LEVERS\|computeSensitivity\|renderTornadoChart" src tests test_*.js docs/architecture README.md CLAUDE.md`.
  Expected: no match, except a sentence that says the tornado was removed.

- [ ] **Step 2: Run.**
  - `npm run analyze`.
  - `npm run build`.
  - `node tests/engine_purity.js && node tests/doc_paths.js && node tests/closure_names.js && node tests/ui_cycles.js && node test_deferred_render.js`.
  - `npx vitest run tests/unit/shared/engine-ratchet.test.js`.
  - `npm test`: the `snapshot_ui` hashes move for the removed card and button. Confirm only those moved, then run
    `npm run snapshot:update`.

- [ ] **Step 3: Commit** with the baselines:
  `git commit -m "Remove the tornado card: its job is the guidance list's figure (dashboard guidance PR 2)"`.

---

### Task 6: The full sweep

- [ ] **Step 1:** `npm test` passes.
- [ ] **Step 2:** `npm run test:ui` passes (CI runs every root script).
- [ ] **Step 3:** `npx vitest run --sequence.shuffle` passes.
- [ ] **Step 3a: Cost of the background job and the new key.** Compare the wall time of `npm test` and `npm run test:ui`
  with the PR 1 branch on the same machine. Under the fake clock, the job's slice runs the whole queue.
  - **If either grows by more than 15%, stop and report.** The fix is a test switch, `__test_pauseGuidance`, that holds the
    job until `__test_flushGuidance` (the owner decides).
  - Also time a full `render()` right after a chip click, against one without (the cliff-plan key includes
    `guidanceGoals`).
- [ ] **Step 4:** The PR description includes:
  - the Task 3 timings and the Step 3a costs;
  - the probe table above, in short;
  - the snapshot and legacy-baseline changes;
  - a note that the branch is stacked on #97 and is rebased once that merges.

---

## Review record

Plan review, 2026-11-14, by an independent opus reviewer. Every finding is folded into the text above. The main ones:
- **Blockers:**
  - the guidance list now has its own `.measuring` class, and `test_deferred_render.js` leaves the card out;
  - `step(g)` closes over its generation and stays null-safe, and the synchronous flush schedules no timer;
  - `setGoal` lifts the first-run save gate;
  - the unfixable `DRAW` case uses flat rent (re-verified against the engine).
- **Settled:**
  - Task 1 and Task 4 refresh `snapshot_ui`;
  - the stop test writes through `input`;
  - the light-render test reads in one evaluate;
  - no job while the bracket search is pending;
  - chips are locked under a market scenario;
  - `guidance-change` never moves the review;
  - start ages get no figure (Batch 6);
  - the contribution-share fields are shares;
  - the gates take the state as an argument;
  - hidden fields are neither named nor counted;
  - choice fields un-dismiss on edit;
  - `setupState` replaces `setup`;
  - the no-refresh ratchet case uses two ids;
  - Task 6 measures the job's cost under the fake clock.
- **Kept, and accepted in writing:** `guidanceGoals` in the cliff-plan and result-cache keys (as `dismissedEstimates`),
  and a separate room search in the job rather than reusing `lastVerdict.room`. The latter keeps the job independent of
  the verdict's timing.
