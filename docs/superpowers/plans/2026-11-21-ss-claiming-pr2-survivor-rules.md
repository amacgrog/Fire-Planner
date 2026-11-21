# Social Security claiming-age optimizer, PR 2: the survivor rules (plan, 2026-11-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single person who is already widowed enter the survivor benefit SSA quoted (at full retirement age, and
optionally at an earlier age) and when it starts, paid by SSA's rules alongside their own benefit; and, for a couple with
survivor modeling on and the deceased's benefit entered at full retirement age, replace the "keep the greater of the two"
swap with the survivor rules (the deceased's base, the widow's limit, the survivor's age reduction, the marriage gate).

**Architecture:** All the rules go in `src/us/core/income/social-security.js`, the one formula PR 1 built: new pure helpers
(the survivor full retirement age, the survivor factor `f(x)`, the reading of the two quotes, the widowed survivor amount,
the deceased's survivor amount), a new `paidBenefitYearly` for a living partner's slot (own, or for a widowed single person
the higher of own and survivor), and the real body of `survivorBenefitYearly`, which keeps today's swap exactly whenever the
deceased is in the `atClaim` basis. The engine, the cliff-plan solver and the Sankey already route through these names, so
no other engine file gets a formula. Six new state keys, a sidebar group gated on `ssWidowed` in single-person mode, a check
line, the earnings-test warning for the survivor start, the seed and fingerprint rule.

**Tech Stack:** plain ES modules under `src/`, esbuild, Vitest 5 (Node 22.12+), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md`: PR 2 is section 10 item 2, using sections
5.2, 5.3, 9 and 12. Model plan: `docs/superpowers/plans/2026-11-21-ss-claiming-pr1-basis-factors.md`. US only; Canada is
untouched (its badge stays). One PR against `main` (at US V192 after #114); badge US V192 → V193.

## Global Constraints

- `npm test` stays exact to the cent. With `ssWidowed` false (the default and every saved plan) and every deceased in the
  `atClaim` basis, no projection row, golden figure, Monte Carlo figure or stored-plan fingerprint moves. Only
  `tests/snapshots/ui_us.json` (new controls, state hashes, MCP schema, changed copy) and `tests/snapshots/legacy_state.json`
  (every US hash: the state carries six new keys) move, and the commit says so.
- The survivor full retirement age by birth year (20 CFR 404.409(b), POMS RS 00615.003 B.3, read 2026-11-21): 65 for born
  1939 or earlier (a 1 January birthday counts as the prior year, so "1/2/1912-1/1/1940" is birth year 1939 and earlier
  here); 65 + 2 months a year for 1940-1944; 66 for 1945-1956; 66 + 2 months a year for 1957-1961; 67 for 1962 or later.
  In months: `<=1939` 780; `1940-1944` `780 + 2 * (by - 1939)`; `1945-1956` 792; `1957-1961` `792 + 2 * (by - 1956)`;
  `>=1962` 804. (The table's "before 1/2/1912: 62" row is for people of 114 and older: not modeled, they get 780.)
- The survivor factor `f(x)` (spec 5.2, POMS RS 00615.301): with `M = sfra - 720` (months from 60 to the survivor FRA) and
  `m = min(M, max(0, sfra - 12 * x))`, `f = (1000 * M - 285 * m) / (1000 * M)`: whole units of 1/1000 of 28.5% divided
  once, so `f(60)` for an FRA of 67 is `60060 / 84000`, the double nearest 0.715. 1 from the survivor FRA on.
- The earnings test for a survivor benefit ends at the **retirement** full retirement age (20 CFR 404.415(a) cites
  404.409(a), the retirement table; read 2026-11-21), so the survivor-start warning reads `ssFullRetirementAgeMonths`, not
  the survivor table. Identical for anyone born 1962 or later.
- Whole years, as PR 1: a start at x pays the whole projection year in which the person is x.
- The repo is public: no personal names, relationships or real benefit figures in code, tests, docs or commits ("a real
  user"). Test figures are round invented amounts.
- Engine rules (`CLAUDE.md`): every new helper takes `ctx` first (or is pure on numbers), reads only `ctx.inputs` /
  `ctx.taxYear`, imports no store module, holds no module-level mutable, allocates nothing per call (no objects or arrays
  returned: the quote reading returns a small integer), and picks properties as PR 1 does
  (`p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB`), no string-built names on the hot path.
- Vitest rules 1-7 of `CLAUDE.md`: through `world()`, exact comparisons, counted with `makeCounter`, run alone and with
  `--sequence.shuffle` before the commit, hand-computed literals written in the code's documented operation order.

## Decisions this plan makes (the spec leaves them to the builder)

1. **The survivor start age is a `<select>`, not a number box.** `null` (the default, "at full retirement age") cannot
   round-trip through a number field: the shared listener writes `Number(value) || 0` (`field-listeners.js:19-21`). A select
   with a first option "At full retirement age (<sFRA>)" (value `""` → `null`) and 60-70 has no typing state and needs no
   clamp: `normalizeState` falls anything off the list back to `null`. FIELDS: `{ key: 'ssSurvivorStartAge', type: 'choice',
   manual: true, valueAs: 'number', values: [null, 60, 61, ..., 70], fallback: null }` (written out, a load-time literal), wired
   by hand (new module, Task 4). Not offered over MCP in this PR: `mcpSchemaFor` would give `{ type: 'string', enum: [null,
   60, ...] }`, which is wrong; PR 4's Apply writes it directly. So there is no survivor-start clamp to add to the sanctioned
   writes; the hand-wired listener is an input write like the other button groups.
2. **`null` resolves to `ceil(sfra / 12)`** (67 for an FRA of 67; 67 for 66 and 4 months): the whole projection year from
   which the benefit is unreduced, as the spec's search axis rounds up (7.1). Ages past it pay the same as at it.
3. **The quote age is a number field, default 60.** `ssSurvivorQuoteAge` (min 60, max 67) matters only while
   `ssSurvivorQuoteMonthly > 0`; the implied PIA does not depend on whether that age has passed, so a stored 60 stays right
   as the person ages. The spec's "or the current age if later" is the field's descriptor ("The age SSA quoted it for; SSA
   quotes from your current age on"), not a write. The engine clamps the age it reads to `[60, ceil(sfra / 12)]`.
4. **The widowed keys apply only when `singlePerson && ssWidowed === true`.** The engine ignores them otherwise, and the
   fingerprint appends the five sub-keys only then (the spec's rule names `singlePerson`; leaving them out while
   `ssWidowed` is off too keeps a plan from going stale over values that change nothing).
5. **The deceased "had claimed"** when `ssFactorAge(ctx, d) < D` (PR 1's factor age, with collecting and "claims now"), `D`
   the deceased's age in the death year. A start in the death year itself is read as not claimed: in whole years the death
   year is all survivor period, so that benefit was never paid.
6. **The marriage gate** reuses E3's predicate: `marriedAtYear(ctx, y)` = `!inputs.singlePerson && (inputs.marryLater ?
   inputs.ageA + y >= inputs.marriageAgeA : inputs.filingStatus === 'mfj')`, exported from `social-security.js`;
   `run-projection.js:333`'s `marriedAtDeath` becomes `deathYear < Infinity && marriedAtYear(ctx, deathYear)` (the same
   boolean). Whole years: a death in the wedding year counts as married (SSA's 9 months is not tracked; the topic file says so).
7. **Quote reading** (`ssSurvivorQuoteRead(ctx)` returns an integer): with `F = ssSurvivorMonthlyFra`, `Q =
   ssSurvivorQuoteMonthly`, `a` the clamped quote age and `P = Q / f(a)`:
   `0` no quote (`!(Q > 0)`); `3` disagree when `Q > F` or `P < F - 2`; `1` agree (no widow's limit) when `P <= F`;
   `2` a widow's limit when `P > F`. Codes 0, 1, 3 pay `F x f(x)`; code 2 pays `min(P x f(x), F)`. (With no limit `P` is at most
   the true PIA, under `F + 1`, so a `P` a few cents above `F` is read as a limit; the two formulas then differ by under $1 a
   month, and the spec's formula is the one used.)

## Review Focus

1. **A widowed person whose survivor start is "at full retirement age" and who is already past it, not collecting:** claims
   now, paid from year 0 at f = 1 (never a reduced factor). Test in Task 2.
2. **A widowed person under 60** (the motivating case, widowed at 59½): nothing from the survivor benefit before 60, the
   own benefit only from its start; at 60 `F x 0.715`. Test in Task 2.
3. **A couple whose survivor is under 60 in the death year:** the survivor benefit starts at 60 at `f(60)`, nothing between
   the death and 60 except the survivor's own benefit (if started). Test in Task 2.
4. **`ssWidowed` left on after switching to a couple, or survivor modeling on in a widowed single plan:** the widowed keys
   change no figure for a couple; a single plan has no survivor period. Test in Task 2 (rows `toStrictEqual`) and Task 3
   (fingerprint).
5. **A collecting box with a start age later than the current age, or with the start at `null`:** read as not collecting
   (as PR 1), and the check line says "Starts at <x>". Test in Task 2 and the Playwright script.

---

### Task 1: The survivor formula (engine)

**Files:**
- Modify: `src/us/core/income/social-security.js`
- Modify: `src/us/core/cliff-plan/solver.js` (`benefitIncomeAt` :369 and `lambdaEstimate`'s own-A call in the `else`
  branch :453: `ownBenefitYearly(ctx, 'A', ...)` → `paidBenefitYearly(ctx, 'A', ...)`; nothing else)
- Modify: `src/us/core/projection/run-projection.js:333` (`marriedAtDeath` through `marriedAtYear`)
- Test: `tests/unit/us/ss-survivor.test.js` (new)

**Interfaces (all exported from `social-security.js`; Tasks 2-5 rely on these names):**
- `ssSurvivorFraMonths(birthYear) -> number`: the table of Global Constraints.
- `ssSurvivorFactor(sfraMonths, x) -> number`: `f(x)` of Global Constraints (pure; `x` below 60 reads 60).
- `ssSurvivorStartResolved(ctx) -> number`: `inputs.ssSurvivorStartAge`, or `Math.ceil(sfra / 12)` when it is `null`
  (`sfra = ssSurvivorFraMonths(ctx.taxYear - inputs.ageA)`).
- `ssSurvivorFactorAge(ctx) -> number`: as `ssFactorAge` for the survivor benefit: the resolved start when
  `ssSurvivorCollecting === true` and it is at or below `ageA`; else `max(start, ageA)`.
- `ssSurvivorQuoteRead(ctx) -> 0 | 1 | 2 | 3`: decision 7.
- `widowedSurvivorYearly(ctx) -> number`: the widowed survivor benefit for a year at or after its start, today's dollars,
  before inflation and the cut: with `fx = ssSurvivorFactor(sfra, ssSurvivorFactorAge(ctx))`, code 2:
  `Math.min(((Q * 12) / fa) * fx, F * 12)`; otherwise `F * 12 * fx`. (`fa` the factor at the clamped quote age.)
- `paidBenefitYearly(ctx, p, a, factor, paid) -> number`: a living partner's slot outside a survivor period. When `p === 'A'
  && inputs.singlePerson && inputs.ssWidowed === true`: `Math.max(own, a >= ssSurvivorStartResolved(ctx) ? widowedSurvivorYearly(ctx)
  * factor * paid : 0)` with `own = ownBenefitYearly(ctx, 'A', a, factor, paid)` (a start below the current age is paid from
  year 0, as PR 1's payment condition); otherwise exactly `ownBenefitYearly(...)`
  (the same call, so every non-widowed figure is the bit it was).
- `marriedAtYear(ctx, y) -> boolean`: decision 6.
- `deceasedSurvivorYearly(ctx, deceasedIsA, deathYear, x) -> number`: the couple's survivor amount at survivor start `x`,
  today's dollars, before inflation and the cut. With `d` the deceased, `s` the survivor, `pia = ssMonthlyD * 12`, `fx =
  ssSurvivorFactor(ssSurvivorFraMonths(ctx.taxYear - ageS), x)`, `D = ageD + deathYear`, `fraD =
  ssFullRetirementAgeMonths(ctx.taxYear - ageD)`, `k = ssFactorAge(ctx, d)`:
  - claimed (`k < D`) with `r = ssClaimFactor(fraD, k) < 1`: `Math.min(pia * fx, Math.max(pia * 0.825, pia * r))` (the
    widow's limit, POMS RS 00615.320; never `R x f(x)`);
  - claimed with `r >= 1`: `pia * r * fx`;
  - not claimed: `pia * Math.max(1, ssClaimFactor(fraD, D)) * fx` (credits to the death year, stopping at 70 by the clamp; none
    before full retirement age).
- `survivorBenefitYearly(ctx, deceasedIsA, deathYear, ageA, ageB, factor, paid)`, same signature, new body:
  - the deceased's basis is not `'pia'`: **exactly today's** `Math.max(ownBenefitYearly(ctx, 'A', ageA, ...),
    ownBenefitYearly(ctx, 'B', ageB, ...))` (married or not; spec 5.3 "my calls");
  - `own = ownBenefitYearly(ctx, s, ageS, factor, paid)`; not `marriedAtYear(ctx, deathYear)`: `own`;
  - `x = max(60, ageS0 + deathYear)` (`ageS0` the survivor's input age); `ageS < x`: `own`;
  - else `Math.max(own, deceasedSurvivorYearly(ctx, deceasedIsA, deathYear, x) * factor * paid)`.
- `socialSecurityIncome`: the living branch's `ssA` calls `paidBenefitYearly(ctx, 'A', age, factor, paid)`; `ssB` stays
  `ownBenefitYearly`. Unchanged otherwise.
- Comments: the top-of-file purpose line, the two PR 1 comments that say `deceasedIsA` / `deathYear` are for PR 2, and the
  survivor block comment in `run-projection.js:308-319` ("keeps the greater of the two Social Security benefits") rewritten
  to name the rules.

- [ ] **Step 1: Write the failing tests** in `tests/unit/us/ss-survivor.test.js` (counted; header comment: inflation 0, tax
  year 2026, the expected values written in the code's order; the fixtures are invented round figures):
  - *Survivor FRA table:* `ssSurvivorFraMonths` of 1939, 1940, 1944, 1945, 1956, 1957, 1961, 1962, 1990 is 780, 782, 790,
    792, 792, 794, 802, 804, 804.
  - *Factor, FRA 67:* `ssSurvivorFactor(804, 60)` `toBe(60060 / 84000)` and `toBe(0.715)`; `(804, 62)` `toBe(66900 / 84000)`;
    `(804, 67)` and `(804, 70)` `toBe(1)`; `(804, 59)` equals `(804, 60)`.
  - *Factor, FRA 66 and 4 months (796, born 1958):* `M = 76`; `(796, 60)` `toBe(54340 / 76000)` (0.715), `(796, 66)`
    `toBe(74860 / 76000)` (m = 4: 76000 - 1140).
  - *Resolved start:* a widowed single of 59 (born 1967): `null` → 67; 63 → 63. Born 1958 (age 68 in 2026): `null` → 67
    (ceil of 66 and 4 months).
  - *Quote reading:* F 2000, no quote: 0. Quote 1430 at 60 (P = 2000): 1. Quote 1429 at 60 (P = 1998.60...): 1 (within $2).
    Quote 1425 at 60 (P = 1993.0...): 3. Quote 2100 at 60: 3 (above F). Quote 1600 at 60 (P = 2237.7...): 2. Quote 2000 at 64
    (`f(64) = (84000 - 285 * 36) / 84000 = 73740 / 84000`, P = 2278.2...): 2.
  - *Widowed amounts:* F 2000, no quote, start 60: `widowedSurvivorYearly` `toBe(2000 * 12 * (60060 / 84000))`; with the
    1600-at-60 quote, start 60: `toBe(Math.min(((1600 * 12) / (60060 / 84000)) * (60060 / 84000), 2000 * 12))`, start 64:
    `Math.min(((1600 * 12) / (60060 / 84000)) * (73740 / 84000), 2000 * 12)` (about 23,573: below the limit), start 67:
    `Math.min(((1600 * 12) / (60060 / 84000)) * 1, 2000 * 12)` (24000: the limit binds).
  - *Deceased base* (couple, both born 1964, FRA 67 and survivor FRA 67, the deceased 2,000 a month in `pia`, married, death at
    the deceased's 75 so `D = 75`, `x = 75`, fx 1): claimed at 62: `Math.min(24000 * 1, Math.max(24000 * 0.825, 24000 *
    0.7))`; claimed at 67: `24000 * 1 * 1`; claimed at 70: `24000 * 1.24 * 1`; start 70 not yet claimed with death at 68
    (`D = 68`): `24000 * Math.max(1, 3888 / 3600) * fx` (12 months late, 288 units); death at 64, start 67 (not claimed,
    before FRA): `24000 * Math.max(1, 2880 / 3600) * fx` = no reduction; death at 72, start 72 under the switch (not claimed):
    `24000 * 1.24 * fx` (credits stop at 70).
  - *atClaim deceased keeps the swap to the bit:* for the PR 1 couple with the deceased in `atClaim` and the survivor in
    `pia`, `survivorBenefitYearly(ctx, true, 13, 75, 75, 1.37, 0.78)` `toBe(Math.max(ownBenefitYearly(ctx, 'A', 75, 1.37, 0.78),
    ownBenefitYearly(ctx, 'B', 75, 1.37, 0.78)))`, also with `filingStatus: 'single'` (unmarried).
  - *paidBenefitYearly is ownBenefitYearly when not widowed:* single not widowed, couple with `ssWidowed: true`: equal
    (`toBe`) for a = 61, 62, 80 with factor 1.37 and paid 0.78.
  - *marriedAtYear:* mfj true; single filing false; `marryLater` with wedding at A's 64, A 62: year 1 false, year 2 true;
    single-person mode false.
  These fail: the exports do not exist.
- [ ] **Step 2:** Run `npx vitest run tests/unit/us/ss-survivor.test.js`: FAIL (not a function).
- [ ] **Step 3:** Implement the interfaces. The defaults are not added yet (Task 3): an absent `ssWidowed` is `!== true`, so
  Task 1-2 states set the keys explicitly (`setState` spreads unknown keys through).
- [ ] **Step 4:** Run the file: PASS. `npm run test:unit` and `npm test`: green with **no** baseline change. The PR 1 couple
  case in `ss-claim-basis.test.js` ("pia survivor") stays green by arithmetic: A claimed at 62 and dies at 75, so the
  widow's limit gives `min(24000, max(19800, 16800)) = 19800`, below B's own `24000 * 1.24`; mirrored, B's base is `24000 * 1.24`
  at f = 1. Its title and comment are updated to name the rule (the survivor keeps the higher of their own and the survivor
  benefit), its assertions unchanged.
- [ ] **Step 5:** `node tests/bench_runs_interleaved.js --base <a built worktree of origin/main> --warm-analysis`: no
  slowdown beyond noise (its household is not widowed and `atClaim`: one added compare per year).
- [ ] **Step 6: Commit** ("SS PR 2: the survivor rules in social-security.js").

### Task 2: The survivor rules in the projection (rows, solver, Sankey)

**Files:**
- Test: `tests/unit/us/ss-survivor.test.js` (more cases)
- Modify only if a case fails: the Task 1 files

**Interfaces:** consumes Task 1's exports; `engine(w).simulateRaw().rows`, `benefitIncomeAt`, `sankeyColumns`.

- [ ] **Step 1: Write the tests.** The widowed fixture: a single person of 59 in 2026 (born 1967, both FRAs 67), retired,
  `lifeExpectancyA` 90, own 2,500 a month in `pia`, `ssWidowed: true`, `ssSurvivorMonthlyFra: 2000`, inflation 0, Texas,
  ACA off, no conversions; `ss` of the row at an age:
  - *Survivor first, own at 70 (Review Focus 2):* survivor start 60, own start 70: `ss` 0 at 59; `2000 * 12 * (60060 /
    84000)` at 60 and 69; `30000 * 1.24` at 70 and 85 (the higher, no carry-over reduction).
  - *Own first, survivor later:* own start 62, survivor `null` (67): `30000 * 0.7` at 62-66 (21000 > the survivor's 0);
    at 67 `Math.max(30000 * 0.7, 2000 * 12 * 1)` = 24000.
  - *Survivor never higher:* survivor 1,000 a month, own start 62: every row equals the same plan with `ssWidowed: false`
    (`toStrictEqual` on `ss`).
  - *Widow's limit in the rows:* the 1600-at-60 quote, survivor start 64: `ss` at 64 is `Math.min(((1600 * 12) / (60060 /
    84000)) * (73740 / 84000), 2000 * 12)`.
  - *Disagreeing quotes:* the 1425-at-60 quote pays `2000 * 12 * fx`, as with no quote (`toStrictEqual` rows).
  - *Review Focus 1:* age 69, survivor `null`, not collecting, own 0: `ss` at 69 is `2000 * 12 * 1` (claims now at f = 1).
  - *Collecting:* age 63, survivor start 60, collecting: `2000 * 12 * (60060 / 84000)` at 63; not collecting: claims now,
    `2000 * 12 * (70320 / 84000)` at 63 (`f(63)`: m = 48, 84000 - 13680).
    Review Focus 5: collecting with start 65 (after 63): read as not collecting, 0 at 63-64, `f(65)` at 65.
  - *The benefit cut applies:* `ssBenefitCutPct: 20`, start year 2026: `ss` at 60 is `2000 * 12 * (60060 / 84000) * 1 * 0.8`.
  - *Review Focus 4:* the widowed keys on a couple (`singlePerson: false`, `ssWidowed: true`, F 2000) give rows
    `toStrictEqual` to the same couple with `ssWidowed: false`.
  - *The couple rule* (the PR 1 `COUPLE`, both `pia`, death at 75): A claims 62, B 62: B's `ss` after the death is
    `24000 * 0.825` (widow's limit over B's own `24000 * 0.7`); with `filingStatus: 'single'` (unmarried, both single filers):
    `24000 * 0.7` (own only); with A in `atClaim`: `Math.max(24000, 24000 * 0.7)` = 24000 (today's swap).
  - *Review Focus 3:* the couple with B 10 years younger (`ageB` 52, `retireAgeB` 52, B own start 67), A claims 67 and dies at
    65 (`survivorDeathAge` 65, so the death year is year 3 and B is 55): B's `ss` is 0 at 55-59, `24000 * 1 * (60060 / 84000)` at
    60 (A unclaimed before FRA: base `max(1, factor of 65)` = 1), the same at 66, and `Math.max(24000, that)` from 67 (B's own).
  - *The solver agrees:* `benefitIncomeAt(ctx, y, true, 1, null)` for the widowed fixture (survivor 60, own 70) is the row's
    `ss` at y = 1 and y = 11.
  - *The Sankey agrees:* for the widowed fixture at 60 and 70 and the couple at 80, the `retirement` items `ssA` + `ssB` (a
    missing one counts 0) `toBe(row.ss)`, no `retirement` issue.
  - *One formula guard* (PR 1's) still passes: no file under `src/us/core/` outside `inputs/` and `income/social-security.js`
    names `ssSurvivor` either (`usCoreFilesContaining('ssSurvivor')`).
- [ ] **Step 2:** Run the file; fix any failure in Task 1's code.
- [ ] **Step 3:** The file alone, with `--sequence.shuffle`, and on Node 24 if available (rule 6).
- [ ] **Step 4:** `tests/survivor_symmetry.js`: a `runSsPia(browser)` case in the style of `runIraBasis` (`__test_replaceState`
  then `__test_simulate()`): identical partners, both `pia`, both start 62, 2,500 a month, mfj, death at 75, Texas, inflation
  0; A-dies equals B-dies in every numeric row field from the death year (`<= 0.01`), and the survivor's `ss` from 75 is within
  0.01 of `30000 * 0.825` (asserted, so the case proves the new rule ran). Called from the file's `main` after `runIraBasis`.
  Run `npm run build && node tests/survivor_symmetry.js`: PASS.
- [ ] **Step 5: Commit** ("SS PR 2: survivor cases: widowed orders, the widow's limit, the couple rule, solver, Sankey, symmetry").

### Task 3: Inputs: defaults, markup, fields, normalize, seed, fingerprint, estimates, guidance

**Files:**
- Modify: `src/us/core/inputs/defaults.js` (after `ssCollectingB`: `ssWidowed: false`, `ssSurvivorMonthlyFra: 0`,
  `ssSurvivorQuoteMonthly: 0`, `ssSurvivorQuoteAge: 60`, `ssSurvivorStartAge: null`, `ssSurvivorCollecting: false`; one
  comment line naming this PR)
- Modify: `src/us/index.html`: the controls as Task 4's Interfaces describe (a FIELDS entry without its element throws at
  start-up); the copy, the check line text and the hint stay in Task 4
- Modify: `src/us/ui/inputs/fields.js`: numbers block after `ssBenefitCutStartYear`: `{ key: 'ssSurvivorMonthlyFra', type:
  'number' }`, `{ key: 'ssSurvivorQuoteMonthly', type: 'number' }`, `{ key: 'ssSurvivorQuoteAge', type: 'number', min: 60, max:
  67 }`; bools after `ssCollectingB`: `{ key: 'ssWidowed', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{
  id: 'ssWidowedField', hidden: (s) => !s.singlePerson }, { id: 'ssWidowedFields', hidden: (s) => !s.singlePerson ||
  !s.ssWidowed }], mcp: true }` and `{ key: 'ssSurvivorCollecting', type: 'bool', sync: 'controls', resync: [], mcp: true }`;
  choices after `ssBenefitBasisB`: decision 1's `ssSurvivorStartAge` entry
- Modify: `src/us/ui/inputs/normalize-state.js` (after the PR 1 lines): `ssWidowed` and `ssSurvivorCollecting` true only when
  `=== true`; `ssSurvivorMonthlyFra` and `ssSurvivorQuoteMonthly` `Math.max(0, Number(v) || 0)`; `ssSurvivorQuoteAge`
  `Math.min(67, Math.max(60, Math.round(Number(v)) || 60))`; `ssSurvivorStartAge` through the FIELDS fallback (a numeric
  string coerced by `valueAs: 'number'`)
- Modify: `src/shared/core/projection/simulate.js` (`monteCarloSeed`: the six keys left out by name, a comment in PR 1's style)
- Modify: `src/us/ui/results/plan-optimizer.js` (`fingerprintJson`)
- Modify: `src/us/core/inputs/field-meta.js` (`ESTIMATE_GATED_GROUPS`: `{ ids: ['ssSurvivorMonthlyFra'], gate: (s = state) =>
  !!s.singlePerson && s.ssWidowed === true }`)
- Modify: `src/us/core/inputs/guidance-fields.js` (`RETIRE_FIELDS` and the `convert` goal gain `ssSurvivorMonthlyFra`; the
  quote fields are optional and stay out; `NO_FIGURE` is unchanged: the survivor start is a select, not a nudged number)
- Test: `tests/unit/us/ss-survivor.test.js`; `tests/legacy_state.js`; `tests/field_registry.js` (run after Task 4)

**Interfaces:**
- `fingerprintJson`: the six keys destructured out; when `singlePerson && ssWidowed === true`, appended after PR 1's keys in
  the order of `defaults`, each only while away from its default (`ssWidowed` true is always appended then). Otherwise none.
- The seed: all six by name, always.

- [ ] **Step 1: Write the tests** (Vitest): normalize: `ssWidowed: 'yes'` → false, `true` kept; `ssSurvivorStartAge: '64'` →
  64, `59` → null, `71` → null, `null` kept, `'x'` → null; quote age 58 → 60, 70 → 67, `'x'` → 60; money `-5` → 0. The seed:
  `monteCarloSeed(2026, 500, s)` for PR 1's `RETIREE` is `toBe(2315242127)` at the defaults and with all six away from them.
  The fingerprint: `storedPlanFingerprint(RETIREE)` `toBe('47067756')` at the defaults; still `'47067756'` with
  `ssSurvivorMonthlyFra: 2000` and `ssWidowed: false`; still with a couple and `ssWidowed: true`; different with
  `ssWidowed: true` (single); different again with `ssWidowed: true, ssSurvivorStartAge: 60`. The estimate gate: the group
  counts `ssSurvivorMonthlyFra` only for a widowed single (`ESTIMATE_GATED_GROUPS` gate called with states). `tests/legacy_state.js`:
  a case `'ss widowed'` (`{ ssWidowed: 'yes', ssSurvivorStartAge: '64', ssSurvivorQuoteAge: 99 }`) and the `empty` case, with
  explicit asserts `[false, 64, 67]` and `[false, null, 60]` (as PR 1's).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:unit` PASS; `npm run build && node tests/legacy_state.js`: only the hashes move and the new
  asserts pass; `node tests/legacy_state.js --update`.
- [ ] **Step 5: Commit** with the baseline update named (`ui_us.json` moves too and is updated once in Task 4 Step 6).

### Task 4: The sidebar: the widowed group, the check lines, the warning, the copy

**Files:**
- Modify: `src/us/index.html` (after `#ssGuide`, before `ssLateStartEnabled`; the `survivorEnabled` bubble; methodology
  and not-modeled lines that name the survivor swap; the badge V192 → V193)
- Create: `src/us/ui/inputs/ss-survivor-inputs.js` (purpose line: "US widowed survivor inputs: the start-age select and the
  check lines (SS claiming optimizer PR 2)")
- Modify: `src/us/ui/inputs/sync-controls.js` (calls `syncSsSurvivorStart()`); `src/us/ui/results/render.js` (calls
  `renderSsSurvivorNotes()` next to `renderSsBasisNotes()`); `src/us/main.js` (calls `wireSsSurvivorInputs()` where the other
  hand-wired inputs are wired)
- Modify: `src/us/ui/results/unusual-warnings.js` and `src/us/core/income/social-security.js` (`ssSurvivorBeforeRetirementCase`)
- Modify: `src/us/ui/inputs/render-group-summaries.js` (" · survivor at <x>" in the Social Security summary when widowed);
  `src/us/ui/plans/print-report.js` (a row "Survivor benefit" "<$F> a month at full retirement age, from <x>" when widowed)
- Test: `test_ss_survivor.js` (new root Playwright script); `test_info_tips.js` if a regex matches changed copy

**Interfaces:**
- Markup: `<div class="field" id="ssWidowedField">` with checkbox `ssWidowed` "I'm widowed: show my late spouse's record",
  descriptor "Adds the survivor benefit on their record", an info bubble (eligibility from 60, married at least 9 months, ended
  by remarrying before 60; the disabled widow(er)'s benefit at 50-59 and child-in-care benefits are not modeled). Then
  `<div id="ssWidowedFields">`: `ssSurvivorMonthlyFra` (money; "Survivor benefit at your full retirement age"; descriptor "As SSA
  quotes it, today's dollars"); `ssSurvivorStartAge` (select; "Survivor benefit starts at"; bubble: 71.5% at 60 rising to 100%
  at the survivor full retirement age, the 28.5% spread over the months between; a later start pays the same as at full
  retirement age; once both have started the higher of the two is paid, and each is cut only for the age it starts; a start
  below your age, if not yet collecting, is read as claiming now); `ssSurvivorCollecting` ("I'm already collecting the survivor
  benefit"; "The start age is when it started"); `ssSurvivorQuoteMonthly` (money; "SSA's quote at an earlier age (optional)";
  bubble: only needed when your late spouse had started a reduced benefit before their full retirement age, which can cap the
  survivor benefit (the widow's limit); the two quotes let the planner find the cap without knowing how your spouse claimed);
  `ssSurvivorQuoteAge` (number; "Age of that quote"; "SSA quotes from your current age on"); two `<small class="range-note">`
  lines, `ssSurvivorNote` and `ssSurvivorCheck`; a `<small>` hint "SSA quotes survivor amounts by phone (1-800-772-1213) or at
  an office; ask for the amount now and at your full retirement age."
- `syncSsSurvivorStart()`: writes the select's value (`''` for `null`) and the first option's text "At full retirement age
  (<fraText(sfra / 12)>)".
- `wireSsSurvivorInputs()`: the select's `change` writes `state.ssSurvivorStartAge = value === '' ? null : Number(value)`,
  then `render()` and `saveInputs()`, as the FIELDS choice listener does.
- `renderSsSurvivorNotes()`: empty unless widowed (single); `ssSurvivorNote`: "Survivor benefit from <x>: <money(yearly / 12)> a
  month, <pct(fx)> of your amount at full retirement age (<sfra text>)", with "Starts at", "Collecting since", "Paid from",
  "Claims now, at" as PR 1's `noteFor` picks them, plus ", the limit applies" when code 2 caps it. `ssSurvivorCheck` by code:
  0 "At <a> this is <money(F x f(a))> a month: compare it with SSA's quote."; 1 "Your two quotes agree: no widow's limit.";
  2 "Your quotes show a widow's limit: the survivor benefit is at most <money(F)> a month."; 3 "The two quotes disagree
  (<money(Q)> at <a> would be <money(P)> at full retirement age): the planner uses your full-retirement-age quote."
  `money`, `pctText` and `fraText` as `ss-basis-notes.js` uses them (move `pctText` to an export there if both need it).
- `ssSurvivorBeforeRetirementCase(ctx) -> { start, retire, fra } | null`: widowed single, `F > 0`, `incomeA > 0`, the resolved
  start below `retireAgeA` and below the retirement FRA (`ssFullRetirementAgeMonths`, Global Constraints). In
  `unusual-warnings.js` a third entry, id `ssSurvivorStartAge`, label "Survivor benefit starts while working", message
  "the survivor benefit starts at <start>, before retirement at <retire> and before full retirement age (<fra>). ..." (the
  rest the own warning's sentence, which applies to survivor benefits too: spec 12).
- `survivorEnabled` bubble: "keeps the greater of the two Social Security benefits (a simplified survivor-benefit swap)"
  becomes "keeps the higher of their own benefit and the survivor benefit (SSA's rules when the late partner's benefit is
  entered at full retirement age; otherwise the greater of the two benefits as entered)"; its descriptor is unchanged.
- `README.md`: the Social Security line gains "a widowed person's survivor benefit (from 60, reduced up to 28.5%, with the
  widow's limit from two SSA quotes) and, with survivor modeling, SSA's survivor rules for the surviving partner".

- [ ] **Step 1: Write `test_ss_survivor.js`** (exits 1 on a failure; locator waits; held, so reads after
  `__test_flushRender()`): load the built US page; couple mode: `#ssWidowedField` hidden. Single, age 59, own 2,500 in
  `pia`, start 70: tick widowed: the group shows; F 2000; the select's first option reads "At full retirement age (67)"; row
  `ss` at 67 is 24000 (survivor at f = 1, own 0 before 70), at 70 is 37200. Choose 60: the note reads "Starts at 60: $1,430
  a month, 71.5% of your amount at full retirement age (67)"; the check reads "At 60 this is $1,430 a month: compare it with
  SSA's quote."; row `ss` at 60 is `2000 * 12 * 0.715` within 0.01. Quote 1600 at 60: the check names the limit. Quote 1425: the
  check says the quotes disagree. Untick widowed: the rows match the unwidowed plan. The earnings-test warning: income 50000,
  retire 66, survivor 60: "Survivor benefit starts while working" listed. Reload: the state survives the autosave (`null` start
  stays `null`). MCP: `ssWidowed: true` accepted. Mobile 390x844 with the group open: `scrollWidth > clientWidth` false.
- [ ] **Step 2:** Run it: FAIL (no controls).
- [ ] **Step 3:** Implement the markup, the module, the calls, the warning, the copy, the summary, the print row, README, the
  badge. `npm run analyze`. `node --check` the module.
- [ ] **Step 4:** `npm run build`; `node test_ss_survivor.js` PASS; `node test_ss_basis.js`, `node test_info_tips.js` (a regex
  updated only where it matched changed copy), `node tests/field_registry.js` PASS.
- [ ] **Step 5:** The held guidance scripts still pass (`node tests/ui_scripts.js test_guidance.js test_guidance_answers.js`):
  `RETIRE_FIELDS` changed.
- [ ] **Step 6:** `npm test`; then `npm run snapshot:update` for the intended `ui_us.json` change (the new controls and their
  wiring entries, every state hash, the MCP `schemaHash` / `propertyNames` / `executeStateHash`, the changed copy) and check
  the diff holds only those.
- [ ] **Step 7: Commit** (the message names the snapshot update as intended).

### Task 5: Docs

**Files:**
- Modify: `docs/architecture/us-social-security.md` (the six inputs; the survivor factor and its units; the survivor FRA table
  with its source and date; the quote reading and its four codes; `paidBenefitYearly`; the couple rule, the "claimed" reading,
  the marriage gate and its whole-year simplification; the earnings-test FRA; the seed and fingerprint rule for the widowed keys;
  "Not modeled": remarriage, the disabled widow(er)'s benefit, child-in-care, the lump-sum death payment, the survivor's start
  age for a couple as a fixed rule)
- Modify: `docs/architecture/engine.md` (the survivor block names the rules), `docs/architecture/cliff-plan.md` (the solver's
  `paidBenefitYearly`), `docs/architecture/inputs-and-ui.md` (the six fields, the select wired by hand and why, the seed and
  fingerprint), `docs/architecture/test-inventory.md` (the Vitest file, the Playwright script, the symmetry case), `CLAUDE.md`
  (the "State and the sanctioned writes" list adds the survivor start select's listener, `ss-survivor-inputs.js`, to the input
  handlers; one invariant line: a survivor amount is read through `paidBenefitYearly` / `survivorBenefitYearly`)
- Modify: `docs/next-batches-plan.md` "### Batch 6 notes": an "Item 4 (claiming-age optimizer PR 2, US V193)" entry (the
  sources and dates, decisions 1-7, the baselines moved), and Batch 6 item 4 marked built
- Modify: the spec, section 10 item 2: built, US V193, this plan's path

- [ ] **Step 1:** Write the docs. `node tests/doc_paths.js` PASS.
- [ ] **Step 2: Commit.**

### Task 6: Verify and open the PR

- [ ] **Step 1:** `npm test` and `npm run test:ui` (background): green.
- [ ] **Step 2:** An Opus review of the branch (model opus); fold in its findings; push; open the PR against `main` with the
  baselines that moved and why.

## Not in this PR

The search, the card and Apply (PRs 3-4); the spousal benefit and deemed filing (PR 5); searching a couple's survivor start;
the earnings test itself; remarriage; Canada; the survivor start over MCP (decision 1).
