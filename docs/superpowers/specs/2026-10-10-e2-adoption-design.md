# E2: adoption, a child who joins the household after birth (US and Canada) — design

Date: 2026-10-10. Owner decisions 1-5 from the brainstorm of this date. Base: `6bfb1ed` on `claude/batch-3b-penalty-rules`
(US V128, Canada V59). Both planners; two shared regions change (`01-LIST_MAX`, `23-dynFieldHtml`); one US-only engine
function changes (`hasChildAtMost`). The review record is section 10.

## 1. Where this sits

Batch E (life events) in `docs/next-batches-plan.md`: E1 (income character, E1a to E1e) is done; E2 is this item; E3 (IRMAA
appeal) and E4 (state relocation) follow. The plan's E2 text: `dependentsInYear` counts a child from the birth year, so a
5-year-old adopted in 2032 is entered as born 2027 and counts from 2027, which gives wrong child credits, ACA household size,
head-of-household status and Canada benefits for 2027 to 2031. Fix: one optional field per child row, "Joins the household
in (year)", blank meaning from birth; both planners; legacy-state cases.

## 2. Today (`6bfb1ed`)

`state.children` is a DYN list of `{ birthYear, student }` (cap `LIST_MAX`, default `[]`). The shared `dependentsInYear(taxYear)`
(`01-LIST_MAX`) returns `{ age, student, qualifyingChild }` for each child with `taxYear - birthYear >= 0`; age is
`taxYear - birthYear`; a shared frozen empty array when there are no children. Every engine reader goes through it, with one
exception (US `hasChildAtMost`, below). Readers confirmed in the code:

- **US** (all through `dependentsInYear` or `qualifyingChildCount`): `childCredits` (CTC, ODC, ACTC) through
  `profile.dependents`; `filingStatusFor` (head of household; qualifying surviving spouse); `returnStatusA` (A's status on two
  returns); `acaHouseholdSize` (`acaNetCost` via `healthcareCost`, and the 400%-FPL guard in `conversionMagiCeiling`); the
  two-return ACA lines in `healthcareCost`, `conversionMagiCeiling` and `magiThresholds`; the CTC phase-out line in
  `magiThresholds`; the state code through `sources.dependents` (`dependentExemption`, `childCredit`, `childStepCredit`, the
  per-child tiers); the cliff plan's and `lambdaEstimate`'s future years (they call the same functions with their own year).
- **US exception:** `hasChildAtMost(taxYear, maxAge)` (`Planner_US.html`, just above `fplForHousehold`; Medicaid's 2027 work
  requirement exempts a parent of a child 13 or younger) loops over `state.children` itself and tests only the age.
- **Canada** (all through `profile.dependents = dependentsInYear(CURRENT_YEAR + year)`): `benefitsFor` (CCB, CGEB, the
  provincial child benefits and family credits), `incomeTaxCA` (the eligible-dependant and child amounts, Ontario's
  low-income reduction children), the `solvePensionSplit` children (`kids`, `pay.rk`).
- **Display only:** the group summary (`✓ n children`) counts rows; unchanged.

The list renderer (shared `23-dynFieldHtml`) writes a number field as `value="${Number(item[f.key]) || 0}"` and its input
handler stores `Number(el.value) || 0`, so a number field cannot be blank today.

## 3. Decisions (owner, 2026-10-10)

1. **Scope: the join year only.** The US adoption credit (IRC 23, including its refundable part since 2025) and Canada's
   adoption expense credits (federal and provincial) are not modeled: each is a new money item with its own inputs (expenses;
   domestic, foreign or special needs), its own timing and a carryforward. A user can enter the adoption cost, net of the credit
   they expect, as a one-time expense. Named in section 9 and the README.
2. **The child counts for the whole join year,** in both planners, as a child counts for the whole year of birth today. US:
   this is the law (section 4.1). Canada: an approximation (the benefits start the month after the child moves in; section
   4.3), stated in the field's tooltip and section 9.
3. **Validation.** Engine rule: a child is in the household in calendar year Y when `Y >= birthYear` and, if a join year is
   set, `Y >= joinYear`; a join year at or before the birth year therefore means "from birth" (this also covers a partly typed
   year). `normalizeLists` keeps `joinYear` only when it is a finite number (a number, or a non-blank numeric string), rounded,
   clamped to the fixed `CHILD_BIRTH_YEAR_MIN/MAX` bounds (1950-2100), and later than the (normalized) birth year; otherwise the
   key is left off. A bad join year never drops the row. A join year after the plan ends is kept (the child never counts; no
   warning); a past join year is kept (no effect on the projection's years).
4. **The UI: a blankable number field.** The shared renderer gains an opt-in `blank: true` option for `kind: 'num'` fields
   (empty box when the key is missing, an optional `placeholder`, and clearing the box deletes the key). No other list sets
   it, so nothing else changes.
5. **Nothing else changes for a joined child.** Age still runs from the birth year in every rule; spending stays the user's;
   the survivor rules are unchanged (children stay with the surviving parent); no new warning; the group summary is unchanged.
   Copy: the new field's label, short line and tooltip in both planners; the stale US Children tooltip sentence ("in the next
   update, for the Child Tax Credit and other federal and state credits": they were built in Batch 7) is reworded; README;
   CLAUDE.md; both version badges.

## 4. Facts (primary sources; retrieved 2026-10-10)

### 4.1 US: an adopted child as a qualifying child and for head of household

IRS Publication 501 (2025), https://www.irs.gov/publications/p501:
- Relationship test: "An adopted child is always treated as your own child. The term 'adopted child' includes a child who was
  lawfully placed with you for legal adoption."
- Residency test (qualifying child; "Adopted child or foster child"): a child adopted or lawfully placed for adoption during the
  year is treated as meeting the more-than-half-the-year test if your main home was the child's main home for more than half the
  time since the adoption or placement.
- Head of household ("Adopted child or foster child" under "Qualifying Person"): the same rule; the person is considered to
  have lived with you for more than half the year if your main home was their main home for more than half the time since the
  placement.
- Qualifying surviving spouse ("Adopted child"): the child is considered to have lived with you all year if your main home was
  the child's main home for the entire time since the placement.

The planner assumes a child lives with the household continuously from the join year, so every test above is met for the
whole join year: decision 2 is exact for the CTC, ODC and ACTC (which follow the qualifying-child rules), head of household and
QSS. The join year to enter for an adoption is the year of placement (or the year the child moves in), which the tooltip says.

### 4.2 US: the ACA household

26 CFR 1.36B-1(d) (https://www.law.cornell.edu/cfr/text/26/1.36B-1): "A taxpayer's family means the individuals for whom a
taxpayer properly claims a deduction for a personal exemption under section 151 for the taxable year"; family size is the
number of individuals in the family. Family size is annual and follows the dependents claimed, so the join year counts in full
(the planner's `acaHouseholdSize`). The premium the household enters is its own (unchanged: the gross premium is not scaled for
children). Medicaid's work-requirement exemption (a parent of a child 13 or younger, from 2027) reads the same household.

### 4.3 Canada: the CCB and the other benefits

Income Tax Act 122.61(1) (https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-122.61.html): the CCB for a month counts
the qualified dependants "in respect of whom the person was an eligible individual at the beginning of the month". So the
benefit starts the month after the child starts living with the parent. The planner is yearly: counting the whole join year
overstates the join year's benefit by up to 12 months of it (one month for a placement in January, twelve in December).
Counting from the year after would understate it by up to 11 months. The same approximation is already made for the birth
year, and the engine already uses same-year income in place of the July-to-June base year (CLAUDE.md, "Income-tested
benefits"). The CGEB and the provincial benefits paid with the CCB follow the same monthly or quarterly eligibility (not
re-read for E2; same approximation). The eligible-dependant amount (ITA 118(1)(b)) asks whether the dependant lived with the
claimant at any time in the year, so the join year counts in full there with no approximation.

### 4.4 The adoption credits (not modeled; for the record)

Rev. Proc. 2025-32 section 3.04 (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf), 2026: qualified adoption expenses up to
$17,670 (a special-needs adoption gets $17,670 whatever the expenses); phase-out from $265,080 to $305,080 of MAGI; $5,120 of the
credit refundable under 23(a)(4). Canada's federal adoption expense credit and the provincial credits (Quebec's is refundable)
were not researched further (decision 1).

## 5. Stored state and normalization (shared `01-LIST_MAX`)

A child row is `{ birthYear, student }` or `{ birthYear, student, joinYear }`. `joinYear` is present only when it is meaningful
(decision 3); a legacy row and a blank field have no key, so a legacy save normalizes to exactly the object it gives today
(`tests/legacy_state.js` hashes the normalized state: existing cases keep their hashes).

In `normalizeLists`, the children `.map` becomes (sketch):

```js
.map((x) => {
  const birthYear = Math.round(num(x.birthYear, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MAX)),
    row = { birthYear, student: x.student === true },
    j = x.joinYear;
  if ((typeof j === 'number' || (typeof j === 'string' && j.trim() !== '')) && Number.isFinite(Number(j))) {
    const joinYear = Math.round(num(j, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MAX));
    if (joinYear > birthYear) row.joinYear = joinYear;
  }
  return row;
})
```

The type test is the same as the birth year's (a boolean, `null`, an object or a blank string is not a year). The comparison
uses the rounded, clamped years (a join year of 2500 becomes 2100 and is kept when the birth year is earlier). The comment
above the block gains one sentence: the optional join year (adoption), missing meaning from birth.

## 6. Engine

### 6.1 `dependentsInYear` (shared `01-LIST_MAX`)

One condition: a child whose join year is later than `taxYear` is skipped.

```js
for (const c of kids) {
  const age = taxYear - c.birthYear;
  if (age < 0 || c.joinYear > taxYear) continue;
  ...
}
```

`undefined > n` is `false`, so a row without the key takes exactly today's path (no new branch result, no new double). A live
row can briefly hold a partly typed value (`2` while typing `2032`, or `0` from the input handler's `|| 0`); either is below the
birth year, so the child counts from birth until the year is complete (decision 3). `qualifyingChildCount` calls
`dependentsInYear` and needs no edit. The comment above the function gains: "a child with a join year (adoption) counts from
that year; age is still from the birth year".

### 6.2 `hasChildAtMost` (US only)

The same condition in its loop:

```js
const age = taxYear - kids[i].birthYear;
if (age >= 0 && age <= maxAge && !(kids[i].joinYear > taxYear)) return true;
```

### 6.3 Everything else

Nothing. Every other reader receives the filtered list (section 2), including the future years that the cliff plan, the
two-year IRMAA lookahead and `lambdaEstimate` price, because they call the same functions with their own year. No profile,
row, snapshot or cache changes: `planForState` keys on the state's JSON, which now includes `joinYear` when set.

**Exactness.** With no `joinYear` anywhere, every function returns the very values it returns today. No snapshot scenario,
golden case or legacy corpus entry has a join year, so `tests/snapshot.js`, `tests/golden.js`, `tests/legacy_state.js` (existing
cases) and `tests/snapshot_ui.js` (no children by default) must not move.

**Speed.** One comparison per child per call, only when the list is non-empty (the empty path returns before the loop). No
timing gate is needed; the plan runs `tests/bench_runs.js` once as a sanity check, not a gate.

## 7. UI

### 7.1 Shared renderer (`23-dynFieldHtml`)

Two opt-in options for `kind: 'num'`: `blank: true` and `placeholder` (a string).
- `dynFieldHtml`: the value attribute is `''` when `f.blank` and `item[f.key] === undefined`, otherwise today's
  `Number(item[f.key]) || 0`; the input carries `placeholder="..."` (escaped) when `f.placeholder` is set.
- The input handler (`apply`): for a `num` field with `f.blank`, an empty box (`String(el.value).trim() === ''`, which a number
  input also reports for partly typed invalid text such as `-`) deletes `item[f.key]`; otherwise today's code.
Edit `shared/23-dynFieldHtml.js`, run `npm run sync`, restore CRLF in the planners (CLAUDE.md, "Shared code"), `npm run
check:shared`.

### 7.2 The field (each planner's own `DYN.children` spec; not shared)

Inserted between `birthYear` and `student`:

```js
{
  key: 'joinYear',
  kind: 'num',
  blank: true,
  placeholder: 'From birth',
  label: 'Joins the household in',
  short: 'Blank: from the birth year',
  tip: <per planner, below>,
  min: CHILD_BIRTH_YEAR_MIN,
  max: CHILD_BIRTH_YEAR_MAX,
  step: 1,
},
```

- US tip: "For a child who joins the household after birth, such as an adopted child: the year the child is placed with you or
  moves in. The child counts as a dependent for that whole year and every year after (IRS Publication 501's rule for a child
  placed for adoption), for the Child Tax Credit, head of household, the ACA household and the state credits. Age still comes
  from the birth year. Leave blank for a child who has lived with you since birth. The adoption credit is not modeled."
- Canada tip: "For a child who joins the household after birth, such as an adopted child: the year the child moves in. The
  child counts for that whole year and every year after, for the Canada Child Benefit, the Canada Groceries and Essentials
  Benefit, the provincial benefits and the dependant amounts. The benefits really start the month after the child moves in,
  so the join year's benefits are overstated. Age still comes from the birth year. Leave blank for a child who has lived with
  you since birth. Adoption expense credits are not modeled."

### 7.3 Other copy

- US Children list tip (`DYN.children.tip`): replace "Used for the ACA household size (...) and, in the next update, for the
  Child Tax Credit and other federal and state credits." with "Used for the Child Tax Credit and the credit for other
  dependents, head of household status, the ACA household size (a larger household has a higher income limit for premium
  subsidies) and the state child credits and exemptions." The rest of the tip stays.
- Both list notes: unchanged.
- README: in the Children feature text of both planners, one sentence on the join year (adoption) and one line under what is
  not modeled (the adoption credits).
- Version badges: US V128 -> V129, Canada V59 -> V60.
- CLAUDE.md, "Add-as-you-go lists", the children paragraph: the row is `{ birthYear, student, joinYear? }`; the join-year rule
  in `dependentsInYear` and `hasChildAtMost`; the `blank` / `placeholder` options of the shared renderer.

## 8. Tests (hand-computed)

Clock pinned to 2026 (US `__test_setCurrentYear(2026)` where the existing test does so; Canada `page.clock.install` before
load, as `tests/snapshot.js` does), inflation 0 where a dollar figure is asserted (so every index factor is exactly 1).

### 8.1 `tests/child_dependents.js` (both planners; in `npm test`)

Normalization (new `NORMALIZE` rows):
- `{ birthYear: 2027, joinYear: 2032 }` -> `{ birthYear: 2027, student: false, joinYear: 2032 }`.
- join year equal to the birth year (2027/2027), before it (2027/2020), `'x'`, `''`, `'  '`, `null`, `true`, `{}`: the row
  without `joinYear` (`{ birthYear: 2027, student: false }`); the row is never dropped.
- `'2032.4'` -> 2032; `2500` with birth 2027 -> 2100; `1900` with birth 1950 -> clamped to 1950, not later than the birth year,
  dropped.
- A birth year clamped up (1900 -> 1950) with a join year 1960: kept (1960 > 1950).

`dependentsInYear` (both planners), child `{ birthYear: 2027, student: false, joinYear: 2032 }`:
- 2026: `[]` (not born); 2031: `[]` (born, not joined); 2032: `[{ age: 5, student: false, qualifyingChild: true }]`;
  `qualifyingChildCount(2031) = 0`, `(2032) = 1`.
- The same child with `joinYear: 2` (a live partly typed value, set directly on the state) and with `joinYear: 0`: 2027 gives
  `[{ age: 0, ... }]` (from birth).
- A mixed list (one from birth born 2020, the joined child above): 2031 gives one dependent (age 11), 2032 two (ages 12, 5),
  in list order.

US only:
- `acaHouseholdSize(true, false, 5)` (tax year 2031) = 1 and `(true, false, 6)` (2032) = 2 with the joined child.
- `hasChildAtMost(2031, 13) === false`, `hasChildAtMost(2032, 13) === true` (add `hasChildAtMost` to `window.__test_children`,
  a US-only line).
- `__test_tax.filingStatusFor({ age: 45, singlePerson: true, isSurvivorPeriod: false, year: 5, deathYear: Infinity })` is
  `'single'`, and `'hoh'` at `year: 6`. Survivor: married couple (`filingStatus: 'mfj'`), death at year index 4 (2030), joined
  child 2032: `year: 5` (2031) is `'single'` (no qualifying child yet), `year: 6` (2032, two tax years after the death year)
  is `'qss'`.
- `__test_tax.childCredits(dependentsInYear(2031), 'hoh', 5, 50000, 5000, 50000)` is `{ nonrefundable: 0, refundable: 0 }`;
  with `dependentsInYear(2032)` and year index 6: `nonrefundable` 2,200 (one CTC child at age 5, `state.inflation = 0` so
  the factor is 1, under the phase-out, within the $5,000 tax), `refundable` 0.
- Engine (the existing ACA scenario: single, 50, retired, $90,000 stream, $20,000 premium, Texas, inflation 0): the two
  children born 2020 and 2022, both with `joinYear: 2027`. Row 0's healthcare is $20,000 (household 1, over the cliff); row 1
  (2027) healthcare is above 0 and below $20,000 (household 3: 400% of $26,650 = $106,600 > MAGI). With the cliff plan off
  (`__test_runPlanMode({ planMode: 'off' })` for both runs), row 0 (2026) equals the no-children run's row 0 field for field
  (`Object.is` on every own numeric field). The plan must be off for this identity: the cliff plan looks ahead (its scoring
  and `lambdaEstimate` price later years), so a child who joins in 2027 can legitimately change the 2026 choice.
- Engine identity: the same scenario with `joinYear: 2020` on the first child and `joinYear: 2022` on the second (equal to
  the birth years, set directly on the state, as a live row can hold) gives every row identical (`Object.is`) to the run with
  no `joinYear`, through the default `__test_simulate` (equivalent inputs give the same plan).

Canada only (engine): Ontario couple, both 40, retired, inflation 0, all savings in the TFSA (`roth`), every other balance
and every income input zero (no pension, no CPP or OAS before 60, no cash interest, no dividends), so family net income is 0; one child born 2025 with `joinYear: 2028`. Rows 0 and 1 (2026, 2027): `benefitCcb` 0; row 2 (2028,
age 3): `benefitCcb` = 8,157 (CCB under-6 amount, July 2026 to June 2027, no reduction at income 0, factor 1); rows 0 and 1
equal the no-children run's rows field for field.

### 8.2 `tests/legacy_state.js` (both planners; in `npm test`)

Add cases `'children join year'` (`[{ birthYear: 2027, joinYear: 2032 }, { birthYear: 2015, joinYear: 2015 }, { birthYear: 2010,
joinYear: 'x' }]`) and `'children join year junk'` (`[{ birthYear: 2027, joinYear: 1900 }, { birthYear: 2027, joinYear: 2500 },
{ birthYear: 2020, joinYear: null, student: true }]`). Run `--update`; the diff of `tests/snapshots/legacy_state.json` must be
additions only (every existing entry's hash unchanged), and the commit message says so.

### 8.3 `test_children.js` (repo root, Playwright, not in CI; both planners)

Extend it: a new child row shows an empty "Joins the household in" box with the placeholder and no `joinYear` key in the state;
typing 2032 stores `joinYear: 2032` and changes `window.fireProjectionRows` (US: a household with a child born 2027; the rows
for 2027 to 2031 change against the from-birth projection); clearing the box deletes the key and restores the from-birth rows;
the reload round trip keeps 2032 and keeps a blank blank; the 390x844 overflow check. Other lists' number fields still show 0
for a missing value (spot check one loan field).

### 8.4 Gates

`npm test` passes with no snapshot change other than the legacy additions; `npm run check:shared`; `tests/bench_runs.js` once
(sanity, section 6.3).

## 9. Not modeled

- The US adoption credit (IRC 23: expenses, timing, the refundable part, the carryforward) and the employer adoption assistance
  exclusion (IRC 137); Canada's federal adoption expense credit and the provincial adoption credits (decision 1).
- Canada: the month the benefits start (the join year counts in full; section 4.3).
- A child who leaves the household before the age limits (foster care ending, a child living with another parent); shared
  custody; a foster child as such (a foster child placed by an agency is a qualifying child under the same Pub. 501 rule, so a
  user can enter one with a join year, but no end year exists).
- A disabled child (excluded from Batch E by the owner).

## 10. Review record

(Filled in after each independent review.)
