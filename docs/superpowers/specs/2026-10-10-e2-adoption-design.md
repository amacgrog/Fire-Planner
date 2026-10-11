# E2: adoption, a child who joins the household after birth (US and Canada) — design

Date: 2026-10-10. Owner decisions 1-5 from the brainstorm of this date, revised the same day after an independent Opus review
of `57e632c` (round 1: no blocking findings; section 10). Base: `6bfb1ed` on `claude/batch-3b-penalty-rules`
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
  per-child tiers); the cliff plan's later years (its whole-run candidates call the same functions with each year).
  `lambdaEstimate` never sees children: `LAMBDA_PROFILE` carries `dependents: NO_DEPENDENTS` and a `single` / `mfj` filing.
- **US exception:** `hasChildAtMost(taxYear, maxAge)` (`Planner_US.html`, just above `fplForHousehold`; Medicaid's 2027 work
  requirement exempts a parent of a child 13 or younger) loops over `state.children` itself and tests only the age.
- **Canada** (all through `profile.dependents = dependentsInYear(CURRENT_YEAR + year)`): `benefitsFor` (CCB, CGEB, the
  provincial child benefits and family credits), `incomeTaxCA` (the eligible-dependant and child amounts, Saskatchewan's
  child amount, Ontario's low-income reduction children, the children in Quebec's RAMQ premium: `kids` in `incomeTaxCA`), the
  `solvePensionSplit` children (`kids`, `pay.rk`). No state or provincial rule keys on the birth event or the year of birth:
  every one tests age through `dependentsInYear`.
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

## 4. Facts (retrieved 2026-10-10; statute, regulation or official guidance, each labelled)

### 4.1 US: an adopted child as a qualifying child, for head of household and for QSS

Statute (https://www.law.cornell.edu/uscode/text/26/152 and /26/2, /26/24):
- IRC 152(f)(1)(B): "A legally adopted individual of the taxpayer, or an individual who is lawfully placed with the taxpayer for
  legal adoption by the taxpayer, shall be treated as a child of such individual by blood." IRC 152(f)(1)(A) defines "child" as
  a son, daughter, stepson or stepdaughter, or "an eligible foster child of the taxpayer".
- IRC 152(c)(1)(B), the residency test of a qualifying child: "the same principal place of abode as the taxpayer for more than
  one-half of such taxable year".
- IRC 2(a)(1)(B), qualifying surviving spouse: a dependent "who (within the meaning of section 152 ...) is a son, stepson,
  daughter, or stepdaughter of the taxpayer". The list omits the eligible foster child that 152(f)(1)(A) adds to "child", so a
  foster child does not qualify a survivor (Pub. 501 says so outright: "a child or stepchild (not a foster child)").
- IRC 24(h)(7), as rewritten by P.L. 119-21: no Child Tax Credit for a qualifying child unless the return includes "the social
  security number of such qualifying child" (issued to a citizen or under the work-authorization rules, by the due date);
  IRC 24(h)(4)(C) gives a qualifying child who fails (h)(7) the $500 credit for other dependents instead. A child placed for
  adoption often has only an adoption taxpayer identification number (ATIN) until the adoption is final (Pub. 501, "Alien or
  adoptee with no SSN": the return shows "the ITIN or adoption taxpayer identification number (ATIN) instead of an SSN").

IRS guidance (IRS Publication 501, 2025, https://www.irs.gov/publications/p501; no statute or final regulation states the
placement-year rule; the sentences below are quoted):
- Relationship test, "Adopted child": "An adopted child is always treated as your own child. The term 'adopted child' includes
  a child who was lawfully placed with you for legal adoption."
- Residency test, "Adopted child or foster child": "This child is considered to have lived with you for more than half of 2025
  if your main home was this child's main home for more than half the time since this child was adopted or placed with you in
  2025."
- Head of household, "Adopted child or foster child": "The person is considered to have lived with you for more than half of
  2025 if your main home was this person's main home for more than half the time since the child was adopted or placed with
  you in 2025."
- Qualifying surviving spouse, "Adopted child": "The child is considered to have lived with you for all of 2025 if your main
  home was this child's main home for the entire time since this child was adopted or placed with you in 2025."

The planner assumes a child lives with the household continuously from the join year, so under that guidance every test above
is met for the whole join year: decision 2 is exact for dependency, head of household and QSS. The CTC assumes an SSN, as it
does for every child (`childCredits`: "every child ... is assumed to have a valid Social Security number"); a placed child with
only an ATIN gets the $500 credit instead until it has an SSN (section 9). The join year to enter for an adoption is the year
of placement (or the year the child moves in), which the tooltip says.

### 4.2 US: the ACA household

26 CFR 1.36B-1(d) (https://www.law.cornell.edu/cfr/text/26/1.36B-1): "A taxpayer's family means the individuals for whom a
taxpayer properly claims a deduction for a personal exemption under section 151 for the taxable year"; family size is the
number of individuals in the family. Family size is annual and follows the dependents claimed, so the join year counts in full
(the planner's `acaHouseholdSize`). The premium the household enters is its own (unchanged: the gross premium is not scaled for
children). Medicaid's work-requirement exemption (from 2027) covers "a parent, guardian, caretaker relative, or family caregiver
... of a dependent child who is 13 years of age and under" (CMCS Informational Bulletin, 12/8/2025,
https://www.medicaid.gov/federal-policy-guidance/downloads/cib12082025.pdf, official guidance on SSA 1902(xx) as added by P.L.
119-21 section 71119; the statute's own text was not read). Community engagement is shown by month (one to three months before
the month of application, then between renewals every six months), so the exemption is assessed for those months, not per
calendar year: counting the whole join year (`hasChildAtMost`) is an approximation, like the CCB's (section 9).

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

Nothing. Every other reader receives the filtered list (section 2), including the later years the cliff plan's whole-run
candidates price, because they call the same functions with each year (`lambdaEstimate` never sees children). No profile,
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
  input also reports for partly typed invalid text such as `-`) deletes `item[f.key]`, checked before any other number path;
  otherwise today's code. The join-year field also sets the existing `int: true` option, so a typed `2032.4` is stored as
  2032, as `normalizeLists` stores it on reload (the live and saved values agree; `int`'s `Math.max(0, ...)` is harmless for a
  year). The birth year keeps today's unrounded live value (the same gap, outside E2; section 9).
Edit `shared/23-dynFieldHtml.js`, run `npm run sync`, restore CRLF in the planners (CLAUDE.md, "Shared code"), `npm run
check:shared`.

### 7.2 The field (each planner's own `DYN.children` spec; not shared)

Inserted between `birthYear` and `student`:

```js
{
  key: 'joinYear',
  kind: 'num',
  int: true,
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
  from the birth year. Leave blank for a child who has lived with you since birth. The Child Tax Credit assumes the child has a
  Social Security number; a child with only an adoption number (ATIN) gets the $500 credit for other dependents instead, which
  is not modeled. The adoption credit is not modeled."
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

Clock: the existing pages of `tests/child_dependents.js` install no clock (they rely on the wall clock being 2026, as the file
header says) and stay as they are; the US cases call `__test_setCurrentYear(2026)` as the existing ACA case does; only the new
Canada engine page installs `page.clock.install({ time: new Date('2026-06-15T12:00:00Z') })` before `goto` (as
`tests/dependant_amounts.js` does), because Canada's `CURRENT_YEAR` is read at load. Inflation 0 where a dollar figure is
asserted (so every index factor is exactly 1).

### 8.1 `tests/child_dependents.js` (both planners; in `npm test`)

Normalization (new `NORMALIZE` rows):
- `{ birthYear: 2027, joinYear: 2032 }` -> `{ birthYear: 2027, student: false, joinYear: 2032 }`.
- join year equal to the birth year (2027/2027), before it (2027/2020), `'x'`, `''`, `'  '`, `null`, `true`, `{}`: the row
  without `joinYear` (`{ birthYear: 2027, student: false }`); the row is never dropped.
- `'2032.4'` -> 2032; `2500` with birth 2027 -> 2100; `1900` with birth 1950 -> clamped to 1950, not later than the birth year:
  `{ birthYear: 1950, student: false }` (key left off).
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
  (`Object.is` on every own numeric field). The plan must be off for this identity: `computeCliffPlan` compares whole runs
  (depletion, then the after-tax end value), so a child who joins in 2027 can legitimately change the 2026 choice.
  (`lambdaEstimate` is not the reason: it never sees children.)
- Engine identity: the same scenario with `joinYear: 2020` on the first child and `joinYear: 2022` on the second (equal to
  the birth years, set directly on the state, as a live row can hold) gives every row identical (`Object.is`) to the run with
  no `joinYear`, through the default `__test_simulate` (equivalent inputs give the same plan).

Canada only (engine): Ontario couple, both 40, retired, inflation 0, all savings in the TFSA (`roth`), every other balance
and every income input zero (no pension, no CPP or OAS before 60, no dividends); one child born 2025 with `joinYear: 2028`.
Precondition, asserted from the row: row 2's family net income is at most $38,237 (the CCB's first reduction threshold,
`BENEFIT_RULES.ccb.reduction.from1`, factor 1), so incidental income such as cash interest does not break the case. Rows 0 and 1
(2026, 2027): `benefitCcb` 0; row 2 (2028, age 3): `benefitCcb` = 8,157 (CCB under-6 amount, July 2026 to June 2027, no
reduction, factor 1); rows 0 and 1 equal the no-children run's rows field for field (Canada has no cliff plan).

### 8.2 `tests/legacy_state.js` (both planners; in `npm test`)

Add cases `'children join year'` (`[{ birthYear: 2027, joinYear: 2032 }, { birthYear: 2015, joinYear: 2015 }, { birthYear: 2010,
joinYear: 'x' }]`) and `'children join year junk'` (`[{ birthYear: 2027, joinYear: 1900 }, { birthYear: 2027, joinYear: 2500 },
{ birthYear: 2020, joinYear: null, student: true }]`), appended to `COMMON` right after the existing children cases. `--update`
rewrites the whole baseline file, so check that its diff is insertions only (every existing entry's line and hash unchanged), and
say so in the commit message.

### 8.3 `test_children.js` (repo root, Playwright, not in CI; both planners)

Extend it: a new child row shows an empty "Joins the household in" box with the placeholder and no `joinYear` key in the state;
typing 2032 stores `joinYear: 2032` and changes `window.fireProjectionRows` (US: the section 8.1 ACA single household, with
the scenario entered through the state and one child born 2027 added through the form; the `healthcare` of the rows for 2027 to
2031 changes against the from-birth projection; Canada: the section 8.1 household, `benefitCcb` of the rows before 2032); clearing the box deletes the key and restores the from-birth rows;
the reload round trip keeps 2032 and keeps a blank blank; the 390x844 overflow check. Other lists' number fields still show 0
for a missing value (spot check one loan field).

### 8.4 Gates

`npm test` passes with no snapshot change other than the legacy additions; `npm run check:shared`; `tests/bench_runs.js` once
(sanity, section 6.3).

## 9. Not modeled

- The US adoption credit (IRC 23: expenses, timing, the refundable part, the carryforward) and the employer adoption assistance
  exclusion (IRC 137); Canada's federal adoption expense credit and the provincial adoption credits (decision 1).
- Canada: the month the benefits start (the join year counts in full; section 4.3).
- US: a child placed for adoption with only an ATIN gets the $500 credit for other dependents, not the Child Tax Credit, until
  it has a Social Security number (IRC 24(h)(7), 24(h)(4)(C)); the planner assumes an SSN for every child (section 4.1).
- US: Medicaid's child-13 exemption is assessed by month; the whole join year counts (section 4.2).
- US: a foster child entered with a join year would also qualify the survivor for QSS, which IRC 2(a)(1)(B) denies (section
  4.1).
- The birth year's live value is not rounded while typing (`normalizeLists` rounds it on reload); outside E2.
- A child who leaves the household before the age limits (foster care ending, a child living with another parent); shared
  custody; a foster child as such (a foster child placed by an agency is a qualifying child under the same Pub. 501 rule, so a
  user can enter one with a join year, but no end year exists).
- A disabled child (excluded from Batch E by the owner).

## 10. Review record

**Round 1** (independent Opus review of `57e632c`, 2026-10-10): 0 blocking, 3 should-fix, 9 minor; all adopted by the owner.
- S1: the CTC is not exact for a placed child with only an ATIN (IRC 24(h)(7)): section 4.1, the US tooltip, section 9.
- S2: a foster child entered here would get QSS, which IRC 2(a)(1)(B) denies: section 9.
- S3: section 4.1's Pub. 501 text was partly paraphrase: now quoted, and labelled IRS guidance (no statute or final regulation
  states the placement-year rule); the statute added beside it.
- M4: `lambdaEstimate` never sees children (`LAMBDA_PROFILE`); the plan-off reason is `computeCliffPlan`'s whole-run
  comparison: sections 2, 6.3, 8.1.
- M5: Canada readers named in full (Quebec RAMQ children, Saskatchewan child amount): section 2.
- M6: `int: true` on the field, so the live value rounds as a reload does: sections 7.1, 7.2, 9.
- M7: the 1900/1950 normalization case written as the expected row: section 8.1.
- M8: clock pinning only on the new Canada engine page: section 8.
- M9: the Canada CCB precondition is income at most $38,237, not exactly 0: section 8.1.
- M10: the UI test names its household and the field it asserts on: section 8.3.
- M11: Medicaid's exemption is assessed by month (CMCS bulletin): sections 4.2, 9.
- M12: the legacy cases are appended after the existing children cases and the diff is checked: section 8.2.
The owner asked for the sources of S1, S2, S3 and M11; they were fetched and added (IRC 24, 2, 152; Pub. 501 quoted; CMCS
bulletin), all retrieved 2026-10-10.
