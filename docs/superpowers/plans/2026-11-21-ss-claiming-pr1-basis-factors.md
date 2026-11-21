# Social Security claiming-age optimizer, PR 1: the benefit basis and the claim-age factors (plan, 2026-11-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each partner enter their Social Security benefit either as paid at the start age (today) or as the benefit at
full retirement age, which the planner then reduces or raises for the claiming age; with one benefit formula that the
engine, the cliff-plan solver and the Sankey all call.

**Architecture:** Per-partner keys `ssBenefitBasisA/B` (`atClaim` | `pia`) and `ssCollectingA/B`; pure helpers in
`src/us/core/income/social-security.js` (full retirement age by birth year, the claim factor, the factor's age, a partner's
own yearly benefit, the survivor's yearly benefit) replace the solver's two copies; `atClaim` keeps today's operation order,
so no projection figure moves. A sidebar select per partner, an "already collecting" box per partner (both bases), one
check line per partner and a collapsed guided-entry panel for SSA's Quick Calculator.

**Tech Stack:** plain ES modules under `src/`, esbuild, Vitest 5 (Node 22.12+), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md`: PR 1 is section 10 item 1, using sections
5.1, 5.5, 7.1 (the "already collecting" boxes and the "claims now" rule) and 9 (the fingerprint rule). US only; Canada is
untouched (its badge stays). One PR against `main`; badge US V191 → V192 (main is at V191 after C3, #113; this branch is cut
from the spec branch, so Task 0 merges `main` first).

## Global Constraints

- `npm test` stays exact to the cent: with both bases `atClaim` (the default and every saved plan) no projection row, golden
  figure, Monte Carlo figure or stored-plan fingerprint moves. Only `tests/snapshots/ui_us.json` (new controls, state hashes,
  MCP schema, changed copy) and `tests/snapshots/legacy_state.json` (every US hash: the state carries the new keys) move,
  and the commit says so.
- Factors (spec 5.1, verified in spec section 12): minus 5/9 of 1% a month for the first 36 months before full retirement
  age, 5/12 of 1% a month beyond; plus 2/3 of 1% a month after it, to 70. The factor's age is clamped to 62-70.
- Full retirement age from the birth year `ctx.taxYear - inputs.ageX` (the plan stores ages, not birth years): 65 for born
  1937 or earlier; 65 + 2 months a year for 1938-1942; 66 for 1943-1954; 66 + 2 months a year for 1955-1959; 67 for 1960
  or later (POMS RS 00615.003, the Batch 6 notes in `ce3b78a`).
- Whole years: a claim at x pays the whole projection year in which the person is x (today's year model).
- The repo is public: no personal names, relationships or real benefit figures in code, tests, docs or commits ("a real user").
- Engine rules (`CLAUDE.md`): the new helpers take `ctx` first, read only `ctx.inputs` / `ctx.taxYear`, import no store
  module, hold no module-level mutable, allocate nothing per call, and build no property names from strings on the hot path
  (pick `p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB`).
- Vitest rules 1-7 of `CLAUDE.md` ("Writing a Vitest test"): through `world()`, exact comparisons, counted with
  `makeCounter`, run alone and with `--sequence.shuffle` before the commit, hand-computed literals.

## Review Focus

1. **A start age below 62 in the `pia` basis** (the box's minimum is not enforced, `ss-start-age.js:6-8`): paid from that
   age at the factor of 62, never an extrapolated factor below 70%. Test in Task 1 (unit) and Task 2 (rows).
2. **A start age of 71-75 under the "if the law changes" switch in `pia`:** paid from that age at the factor of 70 (124% for
   full retirement age 67), never more. Test in Task 1 and Task 2.
3. **A person past 70 who is not collecting, with the default start age 62 (claims now):** paid from year 0 at the factor of
   70, not of 62; collecting, the factor of 62. Test in Task 2.
4. **A birth year in 1955-1959 (full retirement age 66 and some months) and a tax-year change moving the birth year across
   1960:** the factor follows `ctx.taxYear` (66 in 2026 is born 1960, FRA 67; in tax year 2025 the same age is born 1959,
   FRA 66 and 10 months). Test in Task 1.
5. **The survivor period in the `pia` basis** (today's greater-of swap, kept until PR 2): the survivor keeps the larger of the
   two factored benefits, and A-dies equals B-dies for identical partners; the solver and the Sankey agree with the engine
   rows. Test in Task 2.

---

### Task 0: Merge `main`

- [ ] **Step 1:** `git merge origin/main` (C3, #113; no conflict expected: it touches none of the files below except
  `src/us/index.html`'s badge and docs). Run `npm test`: green, as on `main`.
- [ ] **Step 2:** Commit the merge.

### Task 1: The shared benefit formula (engine), with `atClaim` exact

**Files:**
- Modify: `src/us/core/income/social-security.js`
- Modify: `src/us/core/cliff-plan/solver.js` (`ssAt` :357-361 deleted; `benefitIncomeAt` :369; `lambdaEstimate`'s `ssOf`
  :420 deleted and its two greater-of lines :458, :464)
- Modify: `src/us/core/projection/run-projection.js:431` and `src/us/core/income/sankey-columns.js:114` (pass `deathYear`)
- Test: `tests/unit/us/ss-claim-basis.test.js` (new)

**Interfaces (all exported from `social-security.js`; Task 2-4 rely on these names):**
- `ssFullRetirementAgeMonths(birthYear) -> number` (months): the existing unexported `fullRetirementAgeMonths`, renamed,
  exported, and extended to the full table of Global Constraints. `ssBeforeRetirementCase` calls it as before.
- `ssClaimFactor(fraMonths, claimAge) -> number`: pure. `claimAge` is clamped to 62-70 first. With `m` the months between
  `12 * claimAge` and `fraMonths`, the factor is `(3600 - units) / 3600` early (units = `20 * min(m, 36) + 15 * max(0, m - 36)`)
  and `(3600 + 24 * m) / 3600` late: whole units of 1/3600 (5/9 % = 20/3600, 5/12 % = 15/3600, 2/3 % = 24/3600) so 62
  with FRA 67 is the double nearest 0.7 (2520 / 3600), not `1 - 0.2 - 0.1` (0.7000000000000001).
- `ssFactorAge(ctx, p) -> number`: the age the factor is read at, before the clamp: the start age if `ssCollectingP`, else
  `max(ssStartAgeP, ageP)` ("claims now", spec 7.1; `ageP` is the age at year 0).
- `ownBenefitYearly(ctx, p, a, factor, paid) -> number`: partner `p`'s own benefit in the year they are `a`, nominal.
  `atClaim`: `(a >= start ? monthly * 12 : 0) * factor * paid` (today's order, to the bit). `pia`:
  `(a >= start ? monthly * 12 * ssClaimFactor(ssFullRetirementAgeMonths(ctx.taxYear - ageP), ssFactorAge(ctx, p)) : 0) * factor * paid`.
  The payment condition is the same in both bases: a start age below the current age is already `a >= start` from year 0,
  which is "claims now" (only the factor needs the rule).
- `survivorBenefitYearly(ctx, deceasedIsA, deathYear, ageA, ageB, factor, paid) -> number`: the survivor's yearly benefit in a
  year after a death. PR 1: `Math.max(ownBenefitYearly(ctx, 'A', ageA, ...), ownBenefitYearly(ctx, 'B', ageB, ...))`, today's
  swap. `deceasedIsA` and `deathYear` are unused in PR 1 and are in the signature for PR 2's survivor rules (spec 5.5: the
  formula takes the deceased and the death year as arguments, so `lambdaEstimate`'s implied death can pass its own).
- `socialSecurityIncome(ctx, { year, age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA, deathYear })`: same
  return `{ ssA, ssB, ss }`; outside the survivor period `ssA` / `ssB` are `ownBenefitYearly`; in it the survivor's slot is
  `survivorBenefitYearly` and the deceased's 0 (the slots as today, `social-security.js:25-31`), without first computing
  the two own benefits.
- `ssOwnFactor(ctx, p) -> number` (review 8): 1 in `atClaim`; in `pia`,
  `ssClaimFactor(ssFullRetirementAgeMonths(ctx.taxYear - ageP), ssFactorAge(ctx, p))`. `ownBenefitYearly`'s `pia` branch is
  `monthly * 12 * ssOwnFactor(ctx, p)` (the same order as above); the sidebar notes (Task 4) call it rather than rebuild it.
- No `defaults` change in this task (review 3): an absent key is `!== 'pia'` and falsy, and `setState` spreads unknown keys
  through, so Tasks 1-2 run on test states that set the keys. The keys go into `defaults` in Task 3.

- [ ] **Step 1: Write the failing tests** in `tests/unit/us/ss-claim-basis.test.js` (counted; the header comment says
  inflation 0 so `factor` is 1, tax year 2026, Roth conversions, ACA and the cliff plan off unless stated):
  - *FRA table:* `ssFullRetirementAgeMonths` of 1937, 1938, 1942, 1943, 1954, 1955, 1959, 1960, 1990 is 780, 782, 790,
    792, 792, 794, 802, 804, 804.
  - *Factors, FRA 67 (804):* `ssClaimFactor(804, 62)` `toBe(0.7)`; `(804, 67)` `toBe(1)`; `(804, 70)` `toBe(1.24)`;
    `(804, 65)` `toBe(3120 / 3600)` (24 months: 480 units); `(804, 64)` `toBe(2880 / 3600)` (36 months: 720).
  - *Factors, FRA 66 (792):* 62 is `0.75` (48 months: 720 + 180 = 900), 70 is `1.32` (48 x 24 = 1152).
  - *Factors, FRA 66 and 6 months (798, born 1957):* 62 is `2610 / 3600` (54 months: 720 + 270), 70 is `4608 / 3600`
    (42 x 24 = 1008).
  - *Clamp:* `(804, 60)` equals `(804, 62)`; `(804, 75)` equals `(804, 70)`.
  - *Factor age:* single, age 65, start 62: `ssFactorAge` 65 not collecting, 62 collecting; start 68: 68 either way.
  - *Tax year (Review Focus 4):* a single `pia` state, age 66, start 66, 2,000 a month: `ownBenefitYearly(ctx, 'A', 66, 1, 1)`
    at tax year 2026 (born 1960, FRA 804, 12 months early, 240 units) is `toBe(24000 * (3360 / 3600))`; after
    `w.setTaxYear(2025)` and a new `w.ctx()` (born 1959, FRA 802, 10 months early, 200 units), `toBe(24000 * (3400 / 3600))`.
  - **Expected values in the `pia` basis** are written in the code's documented order, `monthly * 12 * factorLiteral`, with
    the factor as a hand-computed literal or a ratio of hand-computed units (`24000 * 0.7`, `24000 * (3120 / 3600)`), never
    a product folded by hand into one number whose rounding nobody checked.
  - *One formula, atClaim exact:* for a couple state at the defaults, `ownBenefitYearly(ctx, 'A', a, 1.37, 0.78)` is `toBe`
    the literal expression `(a >= 62 ? 2500 * 12 : 0) * 1.37 * 0.78` for a = 61, 62, 80.
  These fail: the exports do not exist.
- [ ] **Step 2:** Run `npx vitest run tests/unit/us/ss-claim-basis.test.js`: FAIL (not a function).
- [ ] **Step 3:** Implement the interfaces above; `socialSecurityIncome`'s callers pass `deathYear` (both have it in scope:
  `run-projection.js:322`, `sankey-columns.js:57`). In the solver: `benefitIncomeAt` calls `ownBenefitYearly(ctx, ...)` in
  place of `ssAt(inputs, ...)` with the same argument order; `lambdaEstimate` drops `ssOf`, calls `ownBenefitYearly` for
  the own slots (`P.ssA` in the couple branch, `P.ssB`), and for the two greater-of lines calls
  `survivorBenefitYearly(ctx, survivorIsB, isSurvivorPeriod ? deathYear : firstDeath, ageAs, ageBs, factor, paid)`
  (`survivorIsB` is "A died"). Update the comments that name `ssAt` / `ssOf` (solver :356-358, the B2 comment) and the
  top-of-file comment of `social-security.js`.
- [ ] **Step 4:** Run the file: PASS. Run `npm run test:unit` and `npm test`: green with **no** baseline change (no new
  default key yet, so no seed, fingerprint, state hash or row moves).
- [ ] **Step 5:** `node tests/bench_runs_interleaved.js --base <a built worktree of origin/main> --warm-analysis`: no
  slowdown beyond noise (its household is `atClaim`, so this measures the added compare).
- [ ] **Step 6: Commit** ("SS PR 1: one benefit formula in social-security.js, the claim factor and the basis keys").

### Task 2: The `pia` basis in the projection (rows, solver, Sankey, survivor)

**Files:**
- Test: `tests/unit/us/ss-claim-basis.test.js` (more cases)
- Modify only if a case fails: the Task 1 files

**Interfaces:** consumes Task 1's exports; `engine(w).simulateRaw().rows` (as `ss-benefit-cut.test.js`), `benefitIncomeAt`,
`sankeyColumns` (the Sankey's `ss.ssA` item reads `socialSecurityIncome`).

- [ ] **Step 1: Write the tests** (a single retiree of `ss-benefit-cut.test.js`'s shape: age 62 in 2026, `lifeExpectancyA`
  90, 2,000 a month, `ssBenefitBasisA: 'pia'`; `ss` of the row at an age):
  - start 67: `ss` 0 at 62-66, 24000 at 67 and 80; start 62: `24000 * 0.7` at 62; start 70: 0 at 62-69, `24000 * 1.24` at 70.
  - The same state with `ssBenefitBasisA: 'atClaim'` and start 62: 24000 at 62 (today).
  - *Review Focus 1:* a person of 58 with start 60 in `pia`: 0 at 58-59, `24000 * 0.7` at 60 (paid from 60, the factor of 62).
  - *Review Focus 2:* `ssLateStartEnabled: true`, start 72, `pia`: 0 at 70-71, `24000 * 1.24` at 72.
  - *Review Focus 3:* age 72, start 62, not collecting: `24000 * 1.24` at 72 (the factor of 70); collecting: `24000 * 0.7`.
  - *Claims now:* age 65, start 62, not collecting: `24000 * (3120 / 3600)` at 65; collecting: `24000 * 0.7`.
  - *Collecting has no effect in `atClaim`:* rows `toStrictEqual` with `ssCollectingA` true and false.
  - *Legacy:* a state without the four keys (deleted from what `setState` returns, before `w.ctx()`) gives rows
    `toStrictEqual` to the same state with them at the defaults.
  - *Review Focus 5, survivor:* the mirrored identical-partner couple of `ss-late-start.test.js` (62 in 2026, death at 75,
    `survivorEnabled`, both 2,000 a month), both `pia`, A starts 62 and B 70 (mirrored: A 70, B 62): the survivor's `ss`
    after the death is `24000 * 1.24` in both runs, and `ss`, `tax` and the end balance agree every year (`toBe`); `ss` is
    `24000 * 0.7` at 62-69 and `24000 * 0.7 + 24000 * 1.24` at 70-74.
  - *The solver agrees:* `benefitIncomeAt(ctx, y, true, 1, null)` for the single `pia` start-62 state (no pension) is
    `24000 * 0.7` at y = 0 and y = 10.
  - *The Sankey agrees:* for one survivor-period row of the couple above, `sankeyColumns(ctx, row)`'s retirement items `ssA` +
    `ssB` sum to `row.ss` (its `issues` has no `retirement` entry).
  - *One formula guard:* reading the files under `src/us/core/` (fs, not import; as `helpers/markup.js` reads the shell), no
    file outside `core/inputs/` and `core/income/social-security.js` contains `ssMonthly`.
- [ ] **Step 2:** Run the file; fix any failure in Task 1's code (a failure here is this PR's own bug, not a pre-existing one).
- [ ] **Step 3:** `npx vitest run tests/unit/us/ss-claim-basis.test.js --sequence.shuffle` and alone: PASS; run it on Node
  24 too if available (rule 6).
- [ ] **Step 4: Commit** ("SS PR 1: the pia basis cases: factors in the rows, claims now, collecting, survivor, solver, Sankey").

### Task 3: Inputs: defaults, the controls' markup, fields, normalize, seed and fingerprint

**Files:**
- Modify: `src/us/core/inputs/defaults.js` (after `ssStartAgeB`: `ssBenefitBasisA/B: 'atClaim'`, `ssCollectingA/B: false`,
  one comment line naming this PR)
- Modify: `src/us/index.html`: the two selects, the two `ssCollectingXField` boxes and their `data-partner-b` wrappers, as
  Task 4's Interfaces describe them (review 2: a FIELDS entry without its element throws at start-up,
  `field-listeners.js:37-38`); the notes, the guided panel and the copy stay in Task 4
- Modify: `src/us/ui/inputs/fields.js` (choices block after `filingStatus`: the two selects; bools block after
  `ssLateStartEnabled`: the two boxes)
- Modify: `src/us/ui/inputs/normalize-state.js` (after the B2 lines)
- Modify: `src/shared/core/projection/simulate.js` (`monteCarloSeed`)
- Modify: `src/us/ui/results/plan-optimizer.js` (`fingerprintJson`)
- Test: `tests/unit/us/ss-claim-basis.test.js`; `tests/legacy_state.js`

**Interfaces:**
- FIELDS: `{ key: 'ssBenefitBasisA', type: 'choice', sync: 'controls', resync: ['controls'], values: ['atClaim', 'pia'],
  fallback: 'atClaim', mcp: true }`, B the same. The collecting boxes are shown in both bases (owner, 2026-11-21: "Both
  ways"; in `atClaim` the box changes no figure, and PRs 3-4 read it to hide the card for someone already collecting), so
  no `reveals`: A's field is always shown, B's sits in a `data-partner-b` wrapper. `{ key: 'ssCollectingA', type: 'bool',
  sync: 'controls', resync: [], mcp: true }`, B likewise. (A `select`, as `payFrequency`: no hand-wired button module.)
- `normalizeState`: `s.ssCollectingA = s.ssCollectingA === true` (and B), as `ssLateStartEnabled`.
- `monteCarloSeed`: the four keys left out by name, with a comment in the style of B1/B2's (the new keys would change every
  US seed; with `pia` on, the same seed runs the same market paths, so the difference is the basis's alone).
- `fingerprintJson`: the four keys are destructured out and appended after the rest (after the cut keys) only while not at
  their default: each basis only when `'pia'`, each collecting box only when `true`. At the defaults the JSON is today's.

- [ ] **Step 1: Write the tests** (Vitest): normalize `'x'` → `'atClaim'`, `'pia'` kept, collecting `'yes'` → false, `true`
  kept; `monteCarloSeed` the same with the keys deleted, at the defaults, and at `pia`/`true`; `storedPlanFingerprint` the
  same with the keys deleted and at the defaults, different with `ssBenefitBasisA: 'pia'` and with `ssCollectingB: true`.
  `tests/legacy_state.js`: a case `'ss basis'`: `{ ssBenefitBasisA: 'x', ssBenefitBasisB: 'pia', ssCollectingA: 'yes' }`
  and the `empty` case, with explicit asserts `['atClaim', 'pia', false, false]` and `['atClaim', 'atClaim', false, false]`
  (as the B1/B2 asserts at :216-221).
- [ ] **Step 2:** Run: FAIL (no FIELDS entry, the seed and fingerprint move).
- [ ] **Step 3:** Implement the interfaces. `tests/field_registry.js` must see the four controls (Task 4 adds the markup;
  run it after Task 4).
- [ ] **Step 4:** `npm run test:unit` PASS; `npm run build && node tests/legacy_state.js`: only the hashes move (every US
  case: the state carries the new keys) and the new asserts pass; `node tests/legacy_state.js --update`.
- [ ] **Step 5: Commit** with the baseline update named in the message.

### Task 4: The sidebar: selects, boxes, check lines, guided entry, copy

**Files:**
- Modify: `src/us/index.html` (the retirement-income group, after each `ssStartAgeX` field; the methodology lines :273 and
  :329; the badge V191 → V192)
- Create: `src/us/ui/inputs/ss-basis-notes.js` (purpose line: "US Social Security basis check lines under the start ages")
- Modify: `src/us/ui/results/render.js` (the light render calls `renderSsBasisNotes()` next to the `payoffHint` lines)
- Modify: `src/us/ui/inputs/render-group-summaries.js:98-100`; `src/us/ui/plans/print-report.js:106`
- Test: `test_ss_basis.js` (new root Playwright script); `test_info_tips.js` if a regex matches changed copy

**Interfaces:**
- Markup per partner (B's with `data-partner-b`): a field `<label for="ssBenefitBasisA">Partner A amount entered is<small>…</small></label>`
  with `<select id="ssBenefitBasisA"><option value="atClaim">At the start age (paid as entered)</option><option value="pia">At full retirement age (adjusted for the start age)</option></select>`;
  a field `id="ssCollectingAField"` holding the checkbox `ssCollectingA`, "I'm already collecting my own benefit", descriptor
  "The start age is when you started"; a `<small id="ssBasisNoteA" class="range-note">` check line after the start-age field.
- `renderSsBasisNotes()`: per partner, empty in `atClaim` (or B in single-person mode); in `pia`, with `fra =
  ssFullRetirementAgeMonths(currentYear - state.ageX) / 12` and `f = ssClaimFactor(fra * 12, ssFactorAge(storeContext, p))`
  read through a context built as `unusual-warnings.js` builds one (`storeContext({ withPlan: false })`):
  "Paid from <age>: <money(monthly x f)> a month, <pct(f)> of your amount at full retirement age (<fraText(fra)>)", where
  <age> is the start age, "Claims now, at <current age>" when the claims-now rule applies, "Collecting since <start>" when
  collecting; `pct` is one decimal with a trailing ".0" dropped (70%, 86.7%, 124%). Today's dollars, no benefit cut (the cut
  has its own field).
- The guided entry: one collapsed `<details class="ss-guide">` after Partner B's fields, always shown, summary "How to find
  your benefit at full retirement age"; its steps (spec 5.1 / Batch 6 item 1): open SSA's Quick Calculator
  (ssa.gov/OACT/quickcalc/, `target="_blank" rel="noopener"`), enter the date of birth and this year's earnings in today's
  dollars; open the earnings it used and set the years after your planned retirement to 0 (it otherwise assumes you keep
  earning until you claim, which overstates an early retiree's benefit), or use your record from ssa.gov/myaccount; read the
  benefit at full retirement age, enter it above and choose "At full retirement age". **Step 1 below re-checks the
  calculator's labels in a browser and quotes them exactly.**
- Copy changes: the two `ssStartAgeX` bubbles (now: in the start-age basis the amount is paid as entered; at full retirement
  age the planner reduces it 5/9 of 1% a month for the 36 months before, 5/12 of 1% beyond (70% at 62 for anyone born 1960 or
  later) and adds 2/3 of 1% a month after, to 70; a start age below your age, if not yet collecting, is read as claiming now;
  62 to 70, past 70 only with the switch, which earns no credit after 70); the `ssLateStartEnabled` bubble's "used as-is from
  the start age, like any other start age" becomes "in the start-age basis, used as entered; at full retirement age, it gets
  the credits of 70"; methodology :273 names the basis; the not-modeled line :329 drops "claiming-age adjustments" and keeps
  the earnings test and the full survivor rules. Group summary: " (FRA amounts)" after "SS at …" when either living-plan
  partner is in `pia`. Print report: a row "Social Security amount" "At full retirement age, adjusted for the start age"
  (naming the partner when only one) when any partner is `pia`.
- `README.md`: the Social Security line gains "entered as paid at the start age, or as the benefit at full retirement age
  with SSA's claim-age factors (62-70) and a guided entry for SSA's Quick Calculator".

- [ ] **Step 1:** Open https://www.ssa.gov/OACT/quickcalc/ in Claude in Chrome (www.ssa.gov answers 403 to WebFetch) and
  note the exact labels (date of birth, earnings, today's or future dollars, the earnings-record link, the full-retirement-age
  line); write the guided-entry copy from them and record the retrieval date in the topic file (Task 5).
- [ ] **Step 2: Write `test_ss_basis.js`** (exits 1 on a failure; locator waits, no fixed waits; held, so reads after
  `__test_flushRender()`): load the built US page; single, age 62, start 62, 2,000 a month; the `ssCollectingAField` is shown and ticking it leaves the row's `ss` at 24000 (no effect in `atClaim`); untick it;
  row `ss` at 62 is 24000. Select "At full retirement age": the check line reads "Paid from 62:
  $1,400 a month, 70% of your amount at full retirement age (67)", the row's `ss` is 16800. Set age 65 (start 62): the line
  reads "Claims now, at 65" and 86.7%; tick collecting: "Collecting since 62", 70%. Back to "At the start age": the line is
  empty and the row is 24000. The guided panel opens and holds the Quick Calculator link. MCP (the stubbed
  `document.modelContext` of `test_ss_late_start.js`): `ssBenefitBasisA: 'pia'` accepted, `'x'` refused. Mobile: at 390x844
  with `#workspace` `data-mobile-view="inputs"` and the group open, `scrollWidth > clientWidth` is false.
- [ ] **Step 3:** Run it: FAIL (no controls).
- [ ] **Step 4:** Implement the markup, the module, the render call, the copy, the summary, the print row, README, the badge.
  `npm run analyze` (new module). `node --check` the module.
- [ ] **Step 5:** `npm run build`, `node test_ss_basis.js` PASS; `node test_info_tips.js` (update a regex only where it
  matched changed copy); `node tests/field_registry.js` PASS.
- [ ] **Step 6:** `npm test`; then `npm run snapshot:update` for the intended `ui_us.json` change (new controls and their
  wiring entries, every control's state hash, the MCP `schemaHash` / `propertyNames` / `executeStateHash`, the surfaces whose
  text holds the new copy) and check the diff holds only those.
- [ ] **Step 7: Commit** (the message names the snapshot update as intended).

### Task 5: Docs

**Files:**
- Create: `docs/architecture/us-social-security.md`
- Modify: `CLAUDE.md` (topic list; one invariant line), `docs/architecture/engine.md` (the per-year helpers line naming
  `socialSecurityIncome`), `docs/architecture/cliff-plan.md` (the solver calls `ownBenefitYearly` /
  `survivorBenefitYearly`, no copy), `docs/architecture/inputs-and-ui.md` (the four fields, the seed and fingerprint
  handling, the notes module), `docs/architecture/test-inventory.md` (the Vitest file and the Playwright script),
  `docs/reference.md` (a short entry: the factors and the FRA table with their sources and dates, outside the batch plan as
  B1/B2 did), the spec (section 10 item 1 marked built, US V192, this plan's path)

- [ ] **Step 1:** `us-social-security.md`: the inputs (`ssMonthlyX`, `ssStartAgeX`, the basis, collecting, B1's switch, B2's
  cut); the one formula and its five exports with the operation order of each basis; the factor's units of 1/3600 and why; the
  FRA table and the birth year from the age and the tax year; the claims-now rule and the factor's clamp to 62-70; the
  survivor swap kept until PR 2 and the unused `deceasedIsA` / `deathYear` arguments; whole years and their bias (spec 7.1);
  the known simplifications (delayed credits at 8% a year for everyone, though born before 1943 earned less; no January lag;
  the earnings test not modeled); the seed and fingerprint rule for new keys (spec 9); the related topics.
- [ ] **Step 2:** `CLAUDE.md`: the topic line, and under "Engine and run context": "A Social Security amount is read through
  `ownBenefitYearly` / `survivorBenefitYearly` (`social-security.js`), never a copy of the formula (`ss-claim-basis.test.js`
  scans `src/us/core/`)." `node tests/doc_paths.js` PASS.
- [ ] **Step 3: Commit.**

### Task 6: Verify and open the PR

- [ ] **Step 1:** `npm test` and `npm run test:ui` (background): green.
- [ ] **Step 2:** An Opus review of the branch (model opus); fold in its findings; push; open the PR against `main` with the
  baselines that moved and why.

## Not in this PR

The widowed inputs, the survivor rules and the marriage gate (PR 2); the search, the card and Apply (PRs 3-4); the spousal
benefit (PR 5); Canada; the earnings-test warning reading the claims-now age (it still reads the start age).

## Revisions after the Opus review (2026-11-21; these supersede the text above where they differ)

Already folded into the tasks above: the FRA-798 factor at 70 is `4608 / 3600` (42 months late, not 24; review 1); the
four `defaults` keys and the controls' markup move to Task 3, so Tasks 1-2 change no baseline and Task 3's build does not
throw on a missing element (reviews 2, 3); `ssOwnFactor(ctx, p)` is the one place the factor is formed, used by
`ownBenefitYearly` and the sidebar notes (review 8).

1. **Fingerprint test (review 4).** `fingerprintJson` normalizes first, so "same with the keys deleted" proves nothing. In
   Task 0, on the merged `main` code before any change, record `storedPlanFingerprint(S)` for a fixed state S (the
   `ss-benefit-cut.test.js` single retiree; the load needs `vi.stubGlobal('document', …)` as `ss-late-start.test.js:105`
   does) and write it into the plan's Batch 6 note; Task 3's test asserts `toBe('<that string>')` at the defaults, and a
   different string with `ssBenefitBasisA: 'pia'` and with `ssCollectingB: true`. (A hash string, not a float: rule 6 does
   not apply.) The seed test likewise asserts `monteCarloSeed(2026, 500, S)` against the value recorded in Task 0.
2. **Survivor symmetry (review 5).** Run 1: `survivorPartner: 'A'`, A starts 62, B 70; run 2: `survivorPartner: 'B'`, A 70,
   B 62. Override the `ss-late-start.test.js` couple's `ssLateStartEnabled: true` and starts of 72. Compare `ss`, `tax`,
   `income` and `investable` per year, as that test does (:133-134).
3. **Docs (review 6).** This PR is Batch 6 items 1-2 of `docs/next-batches-plan.md` (:3190), so per `CLAUDE.md` its findings
   (the factors and the FRA table with sources and dates, the Task 0 fingerprint, the snapshot moves) go in "### Batch 6
   notes" (:10844), and items 1-2 are marked built (US V192, this plan), not `docs/reference.md`. Task 5 drops the
   reference.md entry.
4. **The guided panel's CSS (review 7).** `details.group summary` rules (`src/shared/styles/styles.css:99-104`) are
   descendant selectors: Task 4 adds `src/shared/styles/styles.css` with a `details.ss-guide summary` reset (no uppercase,
   no second marker) and the open panel is in the mobile check. Field search's `panelDetails()` (`field-search.js:46, 258`)
   closes and reopens it during a search; harmless. One shared panel, since the steps are the same for both partners
   (owner question 1).
5. **Baselines by commit (reviews 3, 9).** Tasks 1-2: none move (gate: `npm run test:unit`, `npm test`). Task 3:
   `legacy_state.json` (every US hash) is updated there; `ui_us.json` moves too (the state hashes, the MCP `schemaHash` /
   `propertyNames`) and stays red until Task 4 Step 6, which runs `npm run snapshot:update` once for all of it.
6. **Sankey case (review 10).** `finish` drops items of 0 or less (`sankey-columns.js:38-41`): the `'retirement'` group of
   `out.in` holds one of `ssA` / `ssB` after a death; the items present (a missing one counts as 0) sum to `row.ss` (`toBe`).
7. **The FRA rename (review 11)** changes `ssBeforeRetirementCase`'s `fra` for birth years up to 1942 (age 84 and older):
   65 to 65 and 10 months instead of 66. Intended; the topic file says so.
8. **Note edge cases (review 12).** Under 62, not collecting, start below the current age: "Paid from <current age>, at the
   factor of 62". Collecting reads the start age only when the start age is at or below the current age; a collecting box
   with a later start age is read as not collecting (the factor and the note both), and the note says "Starts at <start>".
   `ssBasisNoteB` sits inside a `data-partner-b` element.
9. **Copy (review 13).** The select's descriptor: "Choose how SSA quoted the monthly amount above". The start-age bubbles keep
   the exact phrase `past 70 only with the 'If the law changes' switch`, and the late bubble keeps `no delayed-retirement
   credits accrue after 70` (`test_info_tips.js:189-190`).
10. **Small fixes (review 14).** MCP: a basis off the list is ignored (`mcp-tools.js:14`): assert the state is unchanged.
    `(await engine(w)).simulateRaw()`. Task 0: main also changed `tests/field_registry.js` and the module map; a conflict is
    still unlikely.
11. **Notes placement (review 15).** `renderSsBasisNotes()` is called in `render()` next to `renderGroupSummaries()`
    (`render.js:47`), not in `renderBody` (which the deferred pass reruns).

**Owner decisions:**
1. *Decided 2026-11-21 (owner: "one shared panel"):* one shared guided panel for both partners.
2. *Decided 2026-11-21 (owner: "Both ways"):* the "already collecting" box is shown in both bases. In the start-age basis
   it changes no figure; it is there so PRs 3-4 can hide the card for someone already collecting. Its descriptor is the same in
   both bases ("The start age is when you started"; PR 1 names no card that does not exist yet).
