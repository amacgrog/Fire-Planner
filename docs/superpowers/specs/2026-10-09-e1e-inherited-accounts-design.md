# E1e: inherited traditional and Roth IRA / 401(k) accounts (US) — design

Date: 2026-10-09. Owner decisions from the brainstorm of this date (questions 1-8 and the design sections, all answered
"A" or "yes"; the state schema and the New York assumption decided after the state research), revised the same day after
an independent Opus review of `6679c3e` (decisions 12-14) and again after a second independent review of `c9845d6`
(decision 15) and a third of `cdd1758` (decisions 16-17); the reviews are recorded in section 11. Base: `6c26726` on
`claude/batch-3b-penalty-rules` (code of `02fd1cb` / `c171fcc`: US V126, Canada V59). US only; no shared-region change;
Canada untouched.

## 1. Where this sits

E1 is E1a (V122) -> E1b (V124) -> E1c (V125) -> E1d (V126) -> **E1e (this spec)**, plus E1-CA later (E1a spec section 1).
E1e was split out of E1d (E1d spec decision 1 and section 11; the "E1e scope note" in `docs/next-batches-plan.md`). It adds
retirement accounts inherited from someone outside the household, typically a parent. A deceased partner's own accounts are
not E1e: a surviving spouse can treat them as their own, which the survivor model already does (the survivor owns every
account).

**Generality rule (owner):** mechanics as pure functions over passed-in rules, country-neutral state keys, and a Canada
port section (section 10).

## 2. Today (`Planner_US.html` at `6c26726`)

- One-time income rows (`DYN.oneTimeIncome` ~14833) carry `amount`, `age` ("Received at Partner A age", min 18), `flat`,
  `kind` (`free` / `wages` / `ordinary` / `gain`), `owner`, `gainPct`, `activeBusiness`. `normalizeUsLumps` (~1169) keeps
  the four kinds; anything else is `free`. `lumpAmountsForYear` (~10205) treats any kind it does not know as tax-free and
  sums it into `taxFree`, which the year loop adds to cash (`bal.cash += oneTimeAmount`, ~11012). A row whose age is
  before Partner A's current age never matches a projection year.
- An inherited IRA can only be entered today as a tax-free lump (wrong: the money is taxable ordinary income when drawn)
  or as an ordinary lump (wrong: all of it in one year).
- `singleLifeDivisor` (~6578) holds the Single Life Table for ages 18-65 only (72(t) sizing).
- `bal` (~10429) holds the household's balances; the MAGI-iteration snapshot is `{ ...bal }` (~10707).
- The year's required distribution `rmd` enters `flow` (~10986) and the tax profile (`rmdA/B`, `buildTaxProfile` ~8801);
  `taxFor` puts it in the state `sources.retirement*` fields (~6787-6984), which `stateRetirementExclusion` (~6136) reads.
- `withdrawStandard` (~10007) and the bucket orders (~10086-10109) end with home equity.

## 3. Decisions (owner, 2026-10-09)

1. **Scope: the 10-year rule only (question 1, option A).** The heir is a designated beneficiary who is not an eligible
   designated beneficiary (an adult child of the decedent, the usual case). The eligible classes (surviving spouse, the
   decedent's minor child, disabled, chronically ill, not more than 10 years younger) and their life-expectancy stretch
   are not modeled and are named in the tooltip. (Rejected: B, a "can stretch" checkbox; C, B plus the minor-child rule.)
2. **The schedule (question 2, option A).** Traditional: drawn evenly, the balance after the year's growth divided by the
   years left in the window, but never less than the yearly RMD on the heir's own Single Life factor and never more than
   the account (spec self-review and review B1, 2026-10-09; section 6.2). Roth: left to grow, paid out whole in year 10.
   No input for "the decedent had started RMDs": the floor applies to every inherited traditional row, which is always
   legal (drawing more than required is allowed); with `d = L - k + 1 > 1` it binds only when `(1 + r) d < 11 - k` (never
   at r >= 0 for an heir 81 or younger), and with `d <= 1` the whole account is drawn (section 6.2); back-loading, which would need the input, is a Batch 5 lever. (Rejected: B, a per-row "Even / Minimum, rest in year 10"
   choice plus the RMD checkbox; C, an "empty within N years" field.)
3. **Inputs: two new kinds on the one-time income row (question 3, option A).** "Inherited traditional IRA / 401(k)" and
   "Inherited Roth IRA / 401(k)". IRA and 401(k) are one kind each: the federal rules are the same (IRC 401(a)(9) governs
   both; neither owes the 10% penalty) and a non-spouse heir can move a 401(k) into an inherited IRA by direct transfer
   (IRC 402(c)(11)), which the model assumes. (Rejected: B, a separate "Inherited accounts" list; C, one kind plus a
   Traditional / Roth select.)
4. **State tax: a new explicit `STATE_RULES` field on every row, researched (question 4, option A), with five values
   (owner, after the research).** `inherited`: `ordinary`, `exempt`, `heir`, `heirAnyAge`, or `decedent` with a cap
   (section 6.4). Every jurisdiction was searched (appendix A). **New York:** the heir is assumed to be the sole
   beneficiary of what they enter, so the whole $20,000 decedent exclusion is theirs (the tooltip says it is smaller when
   siblings share the account). It is a data field, not a UI field.
5. **The account (question 5, option A).** A real balance, `bal.inheritedTrad` / `bal.inheritedRoth`, with a per-row
   ledger, growing at the year's stock return in every run mode (standard, historical, Monte Carlo), counted in
   investable, net worth, the guardrail portfolio and the estate. (Rejected: B, a precomputed schedule with no balance;
   C, growth at the household's stock / bond mix.)
6. **Last resort (question 6, option A).** When the household's own accounts and cash cannot meet a year's need, the
   inherited accounts are drawn before home equity: inherited Roth first, then inherited traditional; the schedule then
   recomputes from what is left. Uncapped by the cliff plan. It runs only after the household's capped penalty-free
   traditional money is released, and in the penalty-aware orders before the household's penalized money (owner,
   2026-10-09, on review of the spec; section 6.6). (Rejected: B, no extra draws;
   C, inherited money ahead of the household's own Roth, an optimizer lever.)
7. **Need readers (question 7, option A).** The guardrails, `firstWithdrawal` and lambda's need add the year's scheduled
   inherited draw back, as E1d decision 12 does for a lump: the inherited balance is in the portfolio, so its draw is a
   portfolio withdrawal, not income. A year the draw turns into a surplus records too. The draw is added back net of its
   own tax (decision 15). (Rejected: B, the draw as income everywhere, like today's RMDs; C, A for the guardrails only.)
8. **Display (question 8, option A).** Folded into the existing columns: `row.traditional` / `row.roth` include the
   inherited balances, `row.traditionalWithdrawn` / `row.rothWithdrawn` the inherited draws; new row fields only in
   years with an inherited account; a US-only tooltip annotation after the shared table. (Rejected: B, a new column and
   chart series in the shared table; C, counted in net assets but in no column.)
9. **An account inherited before today is supported (design section 2).** If "Received at" is before Partner A's current
   age, the amount is today's balance and the schedule covers what is left of the window; a 10-year window already closed
   (received more than 10 years ago) is ignored; a death before 2020 follows decision 17 at any past year. (Rejected:
   future inheritances only.)
10. **The heir's own death (design sections 2 and 3b).** If the owner is dead at receipt (Partner A's age at or after the
    survivor's death year, E1d decision 10), the surviving partner receives the account. If the owner dies within the
    window, the survivor continues the same schedule to the same deadline (the deadline is tied to the decedent's death,
    section 4).
11. **No Roth five-year input (follows from decision 2).** The payout in year 10 is at least ten years after the
    decedent's first contribution, so the five-year clock, which is not restarted at death, has always run.
12. **The last-resort traditional draw is carried per owner through the MAGI iteration (owner, 2026-10-09, review S2).**
    A fourth estimate, `estInhA/B`, on E1c's `estSeA/B` pattern (section 6.5), so the draw lands on its owner's return in
    a two-return year. (Rejected: folding it into `estTrad`, which splits it by the household ownership share.)
13. **New York's 59 1/2 condition (owner, 2026-10-09, review M2).** The decedent is assumed to have been 59 1/2 or older
    (a parent, nearly always), stated in section 9; the tooltip says to enter one row per decedent. (Rejected: an input
    for the decedent's age.)
14. **An early last-resort draw from an inherited Roth is tax-free (owner, 2026-10-09, review M3).** The decedent's
    five-year clock is assumed met, stated in section 9. (Rejected: taxing the earnings part, which needs a basis input.)
15. **The need readers add the scheduled draw back net of its own tax (owner, 2026-10-09, option A on the second
    review's item 5).** One extra `taxFor` per pass, only in a year with a scheduled inherited draw, gives the tax without
    the draw; the guardrails, `firstWithdrawal` and lambda record the need as if the inheritance were not there, the way
    the household's own withdrawals are recorded (section 6.7). Without it a $300,000 year-10 draw (MFJ) recorded about
    $49,500 of its own tax as spending and cut spending 10%. (Rejected: B, no extra tax call, the overstatement accepted.)
16. **The need readers also take out the premium credit the draw costs (owner, 2026-10-09, option A on the third
    review's S-1).** One extra premium evaluation per pass in a year with a scheduled draw, at the pass's MAGI less the
    draw (section 6.7); `taxNoDraw` uses that premium as its medical expense. Example: a couple at 61 whose $42,800 draw
    lifts MAGI over 400% of the poverty line pays $18,000 instead of $5,679; at 64 that $12,321 would trip the 1.2x
    guardrail. IRMAA's two-year lag is not removed (section 9). (Rejected: B, the premium and IRMAA gaps stated and the
    twin test limited to households without ACA.)
17. **An account inherited from a death before 2020 is stretched (owner, 2026-10-09, option A on the third review's
    S-2).** The 10-year rule applies to deaths after 2019 (SECURE Act section 401(b)(1)); before that a designated
    beneficiary could take distributions over their life expectancy. Such a row (death year = `currentYear` +
    receipt year < 2020; any past year accepted) draws the RMD alone on the heir's own factor, traditional taxed and Roth
    tax-free, with no deadline; if the heir dies during the projection, the surviving partner empties it within 10 years of
    the heir's death (SECURE Act section 401(b)(5); section 6.2). No input: the year decides. (Rejected: B, the 10-year
    schedule for every row with a tooltip warning; C, pre-2020 rows ignored.)
18. **The Roth bracket fill sees the last-resort estimate (owner, 2026-10-10, raised by the Task 6 implementer).** The
    fill (`solveRothConversionTo`) sees the scheduled draw through `otherA/B` (6.3) and the 162(l) estimate through
    `profile.seHealthA/B`, but not the pass's last-resort estimate, so a year with a last-resort draw x converted more than
    a year with a scheduled draw x larger. As E1c does for 162(l), the pass top puts the fourth estimate on the profile
    (`profile.inhEstA/B = estInhA/B` when a ledger exists; 0 in both `buildTaxProfile` literals and the survivor remap)
    and the fill's `other` adds `inhEstA + inhEstB`, appended only when non-zero, so a legacy fill is the same double.
    Nothing else reads the pair (`taxFor` reads `inhExtraA/B`, the realized draw). (Rejected: B, recorded as a
    limitation.) **Convergence (owner, 2026-10-10, after Task 6b):** the conversion now depends on the damped estimate,
    whose error shrinks about threefold a pass, so a year with a small last-resort draw converges within `MAGI_ITER_TOL`,
    but one with a large draw reaches the 8-pass cap with the conversion about 0.04% of the draw short of a
    scheduled-draw twin (a few dollars; under $15 a year of tax; the rows record the realized draw and MAGI, so nothing is
    inconsistent). Recorded as a limitation (section 9). A faster step (secant) was considered and not adopted: a new
    numerical rule in the MAGI iteration, with overshoot risk at the premium cliffs, for a few dollars.

## 4. Facts (primary sources; retrieved 2026-10-09)

Federal:
- **10-year rule, non-eligible beneficiary.** Treas. Reg. 1.401(a)(9)-5(e)(2) (LII): the deadline is "the calendar year
  that includes the tenth anniversary of the date of the employee's death". 1.401(a)(9)-3(c)(3): "Distributions satisfy
  this paragraph (c)(3) if the employee's entire interest is distributed by the end of the calendar year that includes the
  tenth anniversary of the date of the employee's death." IRC 401(a)(9)(H)(i), added by the SECURE Act section 401, for
  deaths after 2019 (Notice 2024-35 section II.C).
- **Effective date and successors (decision 17).** Notice 2024-35 section II.C.2: "Section 401(b)(1) of the SECURE Act
  provides that, generally, the amendments made to § 401(a)(9)(H) of the Code apply to distributions with respect to
  employees who die after December 31, 2019"; and under section 401(b)(5), "if an employee who participated in a plan
  died before § 401(a)(9)(H) of the Code became effective with respect to the plan, and the employee's designated
  beneficiary died after that effective date, then that designated beneficiary is treated as an eligible designated
  beneficiary and § 401(a)(9)(H) applies to any beneficiary of that designated beneficiary". Section II.C.1: under
  401(a)(9)(H)(iii), when an eligible designated beneficiary dies, "the remainder of that individual's portion" must be
  "distributed within 10 years of the eligible designated beneficiary's death". Section II.B: before the SECURE Act a
  designated beneficiary could take the interest "over the life or life expectancy of the designated beneficiary"
  (401(a)(9)(B)(iii)).
- **Death before the required beginning date.** Pub. 590-B (2025), "10-year rule": "If the IRA owner dies before the
  required beginning date and the 10-year rule applies, no distribution is required for any year before the 10th year."
- **Death on or after it.** 1.401(a)(9)-5(d)(1): yearly distributions continue; the applicable denominator is "the
  greater of" the beneficiary's and the employee's remaining life expectancy ((d)(1)(ii)); a non-spouse beneficiary's is
  "determined initially using the beneficiary's age as of the beneficiary's birthday in the calendar year following the
  calendar year of the employee's death", then "reducing that initial life expectancy by one for each calendar year that
  has elapsed" ((d)(3)(iii)); and the account must still be emptied by the 10-year deadline ((e)(2)).
- **Single Life Table.** 1.401(a)(9)-9(b), ages 0 to 120+, for distribution calendar years from 2022 (LII, retrieved as a
  table; it equals `singleLifeDivisor` at 18-65; the implementer copies the table from the primary page and the test
  pins every age against it). At 50 the factor is 36.2, at 60 27.1, at 70 18.8, at 80 11.2, at 89 6.1, at 90 5.7.
- **The even draw and the RMD.** In draw year k (1 to 10) the RMD is the start-of-year balance over L - (k - 1), with L
  the heir's factor at their age in the year after the death (the whole account once that divisor is 1 or less). On
  balances alone the even draw (balance over 11 - k) is at least the RMD exactly when L >= 10: an heir 81 or younger in
  the year after the death (factor 10.5 at 81, 9.9 at 82). The engine's even draw is figured on the grown balance, so the
  RMD term binds when `(1 + r)(L - k + 1) < 11 - k` (section 6.2). The decedent's remaining factor applies when it is
  longer (a smaller RMD), so the heir's own factor is the conservative floor. (The brainstorm's "about 90" was the spec
  owner's error, corrected in self-review; the review's B1 and S5 corrected the floor's formula and wording.)
- **Enforcement of the yearly RMDs from 2025.** Notice 2024-35 section I: the final regulations "will apply for purposes
  of determining RMDs for calendar years beginning on or after January 1, 2025".
- **Eligible designated beneficiaries.** Pub. 590-B (2025): "the owner's surviving spouse, the owner's minor child, a
  disabled individual, a chronically ill individual, or any other individual who is not more than 10 years younger than
  the IRA owner" (IRC 401(a)(9)(E)(ii)). Not modeled (decision 1).
- **No 10% penalty.** IRC 72(t)(2)(A)(ii) (LII): a distribution "made to a beneficiary (or to the estate of the employee)
  on or after the death of the employee".
- **401(k) to an inherited IRA.** IRC 402(c)(11) (LII): a direct trustee-to-trustee transfer to an IRA established for a
  non-spouse designated beneficiary, "treated as an inherited individual retirement account", to which "section
  401(a)(9)(B) (other than clause (iv) thereof) shall apply".
- **Roth IRA.** Treas. Reg. 1.408A-6 Q&A-14(a): no minimum distributions while the owner is alive; (b): the post-death
  rules apply "as though the Roth IRA owner died before his or her required beginning date". Q&A-7(a): the five-year
  period "is not redetermined when the Roth IRA owner dies"; it "includes the period it was held by the decedent".
- **Designated Roth 401(k).** IRC 402A(d)(5) (LII): section 401(a)(9)(A) "shall not apply to any designated Roth
  account" (SECURE 2.0 section 325, from 2024), so the same before-the-beginning-date treatment.
- **Not net investment income.** IRC 1411(c)(5) (LII): net investment income "shall not include any distribution from a
  plan or arrangement described in section 401(a), 403(a), 403(b), 408, 408A, or 457(b)".

State: appendix A (one row per jurisdiction, with the sentence that decides it). Pennsylvania, the case that started the
research: PA Personal Income Tax Guide, "Gross Compensation" (pa.gov): "Payments paid to the estate or designated
beneficiary of a participant by reason of the participant's death are not included as taxable compensation."

Canada (section 10): Income Tax Act 146(8.8) (laws-lois.justice.gc.ca): on the annuitant's death the annuitant "shall be
deemed to have received, immediately before the annuitant's death, an amount as a benefit ... equal to ... the fair market
value of all the property of the plan at the time of death"; the definition of "benefit" in 146(1) excludes "the portion
thereof received by a person other than the annuitant that can reasonably be regarded as part of the amount included in
computing the income of an annuitant by virtue of subsections 146(8.8) and 146(8.9)". CRA guide RC4177, "Death of an
RRSP annuitant": "A beneficiary will not have to pay tax on any amount paid out of the RRSP if it can reasonably be
regarded as having been included in the deceased annuitant's income."

## 5. Inputs and stored state (US)

### 5.1 Row fields (`DYN.oneTimeIncome`, US-only spec; the shared `23-dynFieldHtml` is unchanged)

- `kind` options gain `['inheritedTrad', 'Inherited traditional IRA / 401(k)']` and
  `['inheritedRoth', 'Inherited Roth IRA / 401(k)']`, after the four existing options.
- `owner` is shown for the two new kinds as for the taxable kinds (hidden in single-person mode). `gainPct` and
  `activeBusiness` stay gain-only.
- `amount`: the account's balance when inherited (or today's balance for a past row, decision 9). Today's dollars unless
  "Fixed amount" is ticked, as for every row; for a past row the box has no effect.
- `age` ("Received at Partner A age"): the calendar year of the decedent's death and of receipt.
- `fresh()` is unchanged (a new row is tax-free until the user picks a kind).

Copy (written from what the engine does; the plan holds the final wording):
- `kind` tip, added: Inherited traditional IRA / 401(k): an account inherited from someone other than your partner
  (a parent, usually). It grows at the plan's stock return and is drawn evenly over the 10 years after the year of death
  (1/10 of the balance, then 1/9, ... the rest in year 10), never less than the yearly required distribution on the
  owner's life expectancy (which only matters for an owner in their 80s, or in a steep market fall), taxed as ordinary
  income on the owner's return, with no 10% penalty at any age. A past account's balance is not in the Funded % tile. If the
  household runs short, it is drawn earlier (after your own accounts, before home equity). Inherited Roth IRA / 401(k):
  tax-free, left to grow and paid out in the 10th year. Both: enter the balance in the year received; a past year is
  allowed (enter today's balance; the draws cover the years left). An account inherited from a death before 2020 is
  drawn at the yearly required minimum over your life expectancy, with no 10-year deadline (the rules of that time). A
  401(k) is assumed moved to an inherited IRA. Not
  modeled: the longer payout open to a spouse, a minor child of the decedent, a disabled or chronically ill heir or one not
  more than 10 years younger than the decedent; a plan that pays out faster. State tax: see the note under the state
  selector.
- The list note and tip mention inherited accounts beside tax-free and taxable lumps.

### 5.2 Normalization and legacy

`normalizeUsLumps` accepts `'inheritedTrad'` and `'inheritedRoth'` as kinds; nothing else changes, so every legacy row stays
as it is (tax-free unless one of the six kinds) and its numbers are byte-identical. The engine reads raw rows defensively
(tests load state through `Object.assign`, E1d lesson): any `kind` other than the two literals is not inherited; any owner
other than `'B'` is A.

**`lumpAmountsForYear` must skip the two inherited kinds** (a `continue` before its "unknown kind is tax-free" branch), or
the balance would land in cash as a tax-free lump. The inherited opener (section 6.1) reads them instead. The skip is one
comparison per row in a lump list scan, which runs once a year only when the list is not empty.

## 6. Engine (US)

### 6.1 The ledger and the opener (pure functions, country-neutral)

- **Ledger.** At the top of `runProjection`, `inh = inheritedLedger(state.oneTimeIncome, ctx)` returns `null` when no row
  is an inherited kind (every legacy state), else a small object with one slot per inherited row: `{ kind ('trad' |
  'roth'), owner ('A' | 'B'), receiptYear, lastYear (receiptYear + 10), L (the heir's Single Life factor in the year
  after receipt, traditional only), balance }` in fixed-size arrays (at most `LIST_MAX`), allocated once per run. The
  receipt year is `Math.round(o.age) - state.ageA` (the rounding `lumpAmountsForYear` uses). Rows are ordered oldest
  receipt first (the nearest deadline first, for the last-resort draw). **Heir age convention (review 2, item 6):** "heir
  age" means the heir's age in the calendar year after the receipt year, everywhere in this spec (`L` =
  `singleLifeFactor` of that age; the heir is the owner slot at receipt, the survivor when the named owner is already
  dead, 6.9); for a past row, the same definition (the age in the year after receipt, which may be before today).
- **Totals in `bal`.** `bal` always carries `inheritedTrad: 0` and `inheritedRoth: 0` (a fixed object shape for every
  household; the snapshot `{ ...bal }` rewinds them). They equal the ledger's sums.
- **Rewind.** The ledger's per-row balances are cloned with the MAGI-iteration snapshot and restored with it
  (`inheritedClone/Restore`, beside `accountsClone/Restore`), only when `inh !== null`. Every phase of the cliff plan
  rewinds through the year snapshot at its `continue`, so the phase records do not carry the ledger (they carry the
  last-resort estimates, 6.5).
- **Rule by death year (decision 17).** A row's death year is `currentYear + receiptYear`. Before 2020 the row is a
  **stretch** row (`stretch: true`): no 10-year deadline, the schedule of 6.2's stretch bullet, any past year accepted. From
  2020 it is a 10-year row. `currentYear` is the closure variable tests pin.
- **Opening.** A future row (`receiptYear >= 0`) opens in its receipt year **after** that year's growth:
  balance `amount x (flat ? 1 : factor)`, no scheduled draw in the receipt year (it is open to the last resort that year,
  6.3). A past row (`receiptYear < 0`) opens in year 0 **before** growth at `amount` (today's balance) when it is a stretch
  row or `lastYear >= 0`; a 10-year row with `lastYear < 0` is ignored (its window has closed).
- **Owner.** Owner B only when not single-person and the row's owner is `'B'`; else A. If that owner is dead at receipt
  (decision 10), the other partner's slot. If the owner dies later, the slot moves to the survivor from the death year
  (E1d decision 10: the death year counts as after death).

### 6.2 The year: growth and the schedule

- **Growth.** Beside `growBalances` (both strategies), each open row's balance grows by the year's `stockReturn` (the
  path's own return in a historical or Monte Carlo run); `bal.inheritedTrad/Roth` are re-summed.
- **Draws**, known at the start of the year (the year's return is known then) and computed once per year before the MAGI
  iteration, so they are per-year constants like `rmd`. For a row in draw year k (1 to 10, k = year - receiptYear) with
  start-of-year balance `b` and `grown = b x (1 + stockReturn)`:
  - traditional, k <= 9: `d = L - k + 1`; if `d <= 1`, `draw = grown` (the RMD is the whole account); else
    `draw = min(grown, max(grown / (11 - k), b / d))` (review B1: the cap keeps a down year from drawing more than the
    account holds; the RMD is figured on the start-of-year balance, as the household's RMDs are);
  - traditional, k = 10: `draw = grown`;
  - Roth, k = 10: `payout = grown`; earlier years nothing.
  - **Stretch row (death before 2020, decision 17)**, every year k >= 1: `d = L - k + 1`; `amount = grown` if `d <= 1`,
    else `min(grown, b / d)` (the RMD alone, on the heir's own factor); traditional: a taxed draw, Roth: a tax-free
    transfer to cash. No deadline.
  - **Successor deadline.** If the heir (the row's owner) dies during the projection (death year Y): a 10-year row keeps
    its deadline (decision 10); a stretch row gets the deadline `Y + 10` and from year Y + 1 follows the 10-year schedule
    with `k` counted from Y (traditional: even over the years left with the floor on the heir's factor continued; Roth:
    the whole payout at Y + 10) (SECURE Act section 401(b)(5): the original beneficiary is treated as an eligible
    designated beneficiary and 401(a)(9)(H)(iii) gives that beneficiary's beneficiary 10 years from the death).
- When the RMD term binds: in draw year k with `d > 1`, exactly when `(1 + r)(L - k + 1) < 11 - k`; with `d <= 1` the
  whole account is drawn (the floor always binds). With `r >= 0` never for an heir 81 or younger (L >= 10.5); at 6% an
  heir of 82 never binds (1.06 x 9.9 >= 10) and one of 83 binds in year 1; in a down year a younger heir binds too (81
  when r < -4.8%, 75 when r < -32.4%; 1931 was -43%). The `min(grown, ...)` cap binds only when `d < 1 / (1 + r)` (at
  -30%, `d < 1.43`): an heir of 85 in draw year 8 (`d = 1.1`) draws the whole grown balance. `d <= 1` first occurs at heir
  84 and 85 in year 9, 90 in year 6, 100 in year 3.
- `inhDrawA/B` = the year's scheduled traditional draws by owner slot; `inhDraw = inhDrawA + inhDrawB`; `inhRothPayout`
  = the Roth payouts.
- After `growBalances` (beside `withdrawRequiredDistributions`), the draws and payouts leave the ledger; the Roth payout
  goes to `bal.cash` (not to `flow`, tax or MAGI: a transfer), then `sweepExcessCash` invests the excess in taxable at
  full basis, as a tax-free lump.

### 6.3 Cash flow and the federal return

- `flow` adds `inhDraw` in both strategies' sums, appended last (the existing float order is unchanged) and only when
  `inhDraw > 0`. It pays its own tax and covers spending.
- `buildTaxProfile` takes `inheritedA/B` (the scheduled draw by slot) and adds each to its slot's `otherA/B` **only**, the
  way `rmdA/B` are added (~8863). Never through `streamOtherA/B` / `extraA/B`: `taxFor` puts `extraA` into
  `sources.wages` (~6784), which would tax the draw as state wages and a second time through `sources.inherited`
  (review S3). Through `otherA/B` the federal return, Social Security taxation, the deductions and credits, ACA, IRMAA
  (two years on, through `irmaaMagiHistory`), the Roth bracket fill (it converts less) and `magiThresholds` see it with
  no further wiring. The survivor remap moves B's into slot A. The profile always carries `inheritedA/B`, `inhOn`,
  `inhExtraA/B` and `inhExclA/B`, so its shape is fixed. **`profile.inhOn = (inh !== null)` in every year of a run with an
  inherited row** (review 3, S-3): a receipt year with no scheduled draw, or a year with a row open and no scheduled draw,
  can still carry a last-resort draw; false and zeros in every legacy run.
- **NIIT (review S4):** the draw is not net investment income (1411(c)(5)): it never reaches `invOrd` or gains. It is in
  MAGI, so it counts toward the NIIT threshold (1411(a)(1)(B)): `niitTax(ordinary + gains, ...)` sees it. Example: MFJ,
  MAGI $240,000 with $30,000 of investment income; a $20,000 draw makes MAGI $260,000 and NIIT 3.8% x min(30,000,
  10,000) = $380.
- Not part of `requiredDistributions`, the account ledger `accts`, `applyRothConversion`, the bond ladder or the bond
  refill; never penalized (it never reaches `takeTraditional` or the penalty code).
- `row.income` includes `inhDraw` (`otherA/B` already carry it).

### 6.4 The state return

- **Sources, on every call (review B2).** `newStateSources` declares the five fields (`inherited`, `inheritedA/B`,
  `inheritedExclA/B`) so the scratch objects' shape is fixed. Every use of them in `stateIncomeTax` (the add to
  `ordinaryNonSS` and each kind's read) sits inside the `sources.inherited > 0` gate: tests build sources objects without
  these fields (`tests/state_mechanisms.js`), and an ungated `+ sources.inherited` would give `NaN` (review 3, M-6). For a taxing state `taxFor` writes them on **every** call (the
  four scratch objects `SOURCES_JOINT/SINGLE/A/B` are reused, so a conditional write would leave a stale value for the
  next call): when `profile.inhOn === true`, from `profile.inheritedA/B + profile.inhExtraA/B` and `profile.inhExclA/B`;
  otherwise zeros (the lambda, Roth-solver and optimizer profile literals carry no `inhOn`, so they write zeros; one test
  of a flag per call instead of six `|| 0` reads). Each return gets its own slot (two filers: A's return slot A, B's
  return slot A of its own sources, as `retirementA/B`). `retirementA/B` never include them. Only the read in
  `stateIncomeTax` is gated (`sources.inherited > 0`).
- **Where it enters (review S8; review 2, item 4).** `sources.inherited` is added to `ordinaryNonSS` (~6388), so the row's
  `rule.ordinary` gates it (Washington, the one taxing row with `ordinary: false`, never taxes it) and, where ordinary
  income is taxed, it is in `start` (the federal-AGI stand-in that feeds the Social Security tests, the share tables, the
  credits' federal AGI and `exemptionLinear`) for every kind, the way any federally taxed amount is; then the kind
  subtracts its part where the row's retirement exclusion is subtracted:
- `STATE_RULES` gains `inherited` on every row: `{ kind: 'ordinary' | 'exempt' | 'heir' | 'heirAnyAge' | 'decedent',
  cap }` (`cap` only for `decedent`: a number, not indexed). It is compiled in `compileRow`, not `compileStateRule`, so a
  schedule variant (GA, HI, IN, MS, MT, NE have them) carries it; `tests/state_rules.js` checks that no `schedule` entry
  overrides `inherited`.
  - `ordinary`: nothing subtracted.
  - `exempt`: all of it subtracted (an unlimited exclusion).
  - `heir`: joins the filer's retirement amount in `stateRetirementExclusion`, subject to the heir's own age tests, caps,
    `reducedBy` and share tables, as an IRA draw (never the `employerPlan` 401(k) test, 402(c)(11)). In a `perPerson`
    row it adds `sources.inheritedA/B` to that filer's `traditional` term after the filer's age test; in an
    `agiPhasedShare` row (Connecticut, review S6) it adds `sources.inherited` to the household `pension + retirement`.
  - `heirAnyAge` (`perPerson` rows only: CO, AR, OK): **only the inherited amount** bypasses the traditional age test; the
    filer's own pension and traditional draws keep theirs (review S7; Colorado's text: under 55 only income "due to the
    death of the person originally entitled" qualifies). For AR and OK the first tier starts at age 0, so the inherited
    amount only bypasses `traditionalMinAge` (59 1/2) and shares the filer's cap ($6,000, $10,000) with their own pension
    at every age. For CO (first tier at 55) a filer under 55 has no cap today (`cap < 0 -> continue`, ~6147); that path is
    special-cased for the inherited amount: excluded up to the first tier's cap ($20,000), the filer's own income still
    excluded nothing; from 55 the inherited amount shares the filer's cap with their own retirement income (review 2,
    minor).
  - `decedent` (New York): `sources.inheritedExclA/B` subtracted, independent of the filer's own exclusion and age. The
    year loop computes `profile.inhExclA/B` = the sum over each **post-remap** slot's rows (review 3, M-1: after Partner
    A's death everything is slot A) of `min(row's draw this year, cap)` (each row is
    one decedent; review M6: carried on the profile like the other fields) when the year's compiled rule is `decedent`
    (read per year from the compiled rule, so a variant is honoured). The last-resort step adds to it per row (6.6).
  - Every `heir` / `heirAnyAge` row except Connecticut is already `perPerson`, so `needsPerPerson` is already set on
    them; no flag and no `tests/tax_caches.js` pin changes (review S6).
- `scripts/gen-state-rules.js` lists the field; `docs/state-tax-rules.md` regenerated; `tests/state_rules.js` requires it
  on every row with a valid kind and `cap` only on `decedent`; each taxing row's `notes` gains one sentence on inherited
  accounts (what the planner shows under the selector).
- A state that deducts federal tax (the lagged pass) sees the inherited draw through the federal liability as any other
  ordinary income.

### 6.5 MAGI, the iteration, the cliff plan

- **The scheduled draw** is a fixed part of `magiBase0` and `returnMagis` (through `otherA/B`), a per-year constant: it
  does not move the iteration.
- **The last-resort traditional draw is the iteration's fourth estimate** (decision 12, review S2; review 2, item 3), built
  exactly on E1c's `estSeA/B` pattern. Slots are **post-remap** profile slots (6.6: in single-person mode and the survivor
  period always A).
  - `estInhA/B`, seeded from `prevInhA/B` (the previous year's realized natural last-resort draws, written only after
    convergence: no `scalarSnapshot` entry, as `prevSeHealthA/B`).
  - **The pass's MAGI.** At the pass top (~10762), `magiBase = magiBase0 [- estSeA - estSeB] + estInhA + estInhB` (the
    added term only when `inh !== null`). Every reader of `magiBase` (the conversion ceiling and `magiThresholds` through
    `preConvMagi`, `magiProxy`, the cap limit `yearPlan.magi - magiBase`, the reach `lo`, `yearPlanCandidates`, the
    provisional histories) therefore sees the estimate with no further change.
  - **`irmaaAt(trad, gain, ia = estInhA, ib = estInhB)`** (review 3, M-2): its single-return term is `magiBase - estInhA -
    estInhB + ia + ib + trad + gain`, and the two-return term passes the pair to `returnMagis`; the `naturalRec` calls
    (~11295) and the trial calls (~11331-11332) pass the realized pair.
  - **`returnMagis(profile, trad, gain, ia = 0, ib = 0)`** adds `ia` to A's return and `ib` to B's (never split by
    `ownerShareA`). Every call passes the pair: the pass estimate for the ceiling (~10781, `estInhA/B`), `costAt` (~10848),
    `irmaaAt` (~10882), the pass's own premium (~10922, `estInhA/B`), and the post-convergence history (~11394, the realized
    pair).
  - **`costAt(trad, gain, sa, sb, ia = estInhA, ib = estInhB)`**: `hcArgs.magiProxy = magiBase0 - sa - sb + trad + gain + ia
    + ib`, and the pair goes to `returnMagis`.
  - **The realized pair** `inhRealA/B` (= `wd.inheritedGrossA/B`) replaces the estimate in: the drift (`+ |inhRealA - estInhA|
    + |inhRealB - estInhB|`); the damped update (same weight); `passLog` entries (`costAt(..., inhRealA, inhRealB)`); the
    forced pass's `costAt` and `taxAfter`; the fill check (~11059: `m = magiBase - estInhA - estInhB + inhRealA + inhRealB +
    traditionalGross + taxableGainGross`); `totalIncome` (~11063); `realizedMagi` (~11246); the `naturalRec` and trial
    `irmaaAt` / `cliffCost` calls; the post-convergence `returnMagis` (~11394). `naturalRec` and the trial records carry
    the realized pair (`inhA` / `inhB`, as `seA` / `seB`), which the trial seed (~11363) and `prevInhA/B` (~11384) read
    (review 3, M-4).
  - **Records and phases.** `passLog` entries, `naturalRec`, the trial records, the pick restore (~11198), the forced pass,
    the 162(l) hold (~11181: `estInhA/B = inhRealA/B` beside `estTrad = realizedTrad`), the apply fallback replay
    (~11314), the winner replay (~11346) and the trial seed (~11363) carry and restore `estInhA/B` exactly where they carry
    `estSeA/B`. The 162(l) search (`seSearch`) prices with the realized inherited pair it is handed, as it prices the
    draws it is handed.
  - **`estUsed`** (review 3, M-3): mirroring E1c's line (~10966), when `inh !== null` and any of `estInhA/B`,
    `inhRealA/B` is non-zero, `estUsed = true`. Some `magiBase` readers (the reach `lo`, `magiThresholds`' `preMagi`,
    `yearPlanCandidates`, the provisional histories) do not set it, and a year seeded from last year's `prevInh` must not
    keep a stale estimate. No cost in a legacy run.
  - `prevDiscTraditional` and `realizedTrad` keep excluding it (it is not discretionary traditional money).
  - Every term is skipped when `inh === null` (the E1c 9c rule).
- The cliff plan sees the scheduled draw inside `magiBase` in every line, candidate and stay-under; neither draw is a
  lever (Batch 5). `lambdaEstimate`'s sample years do not price future inherited draws (section 9).
- `afterTaxValue` (~9585, the in-year phase score) adds `bal.inheritedTrad x (1 - lambda) + bal.inheritedRoth`. It reads
  `bal`, whose two fields are always present and 0 without an inherited row, so it needs no flag; the terms are added only
  when the sum is non-zero (`if (bal.inheritedTrad + bal.inheritedRoth > 0)`), so a legacy score is the same double.

### 6.6 Last resort (decision 6)

- **The step** `takeInherited(wd)`: inherited Roth rows (net = gross, cash only), then inherited traditional rows, oldest
  receipt first, until the need is met or the accounts are empty. Afterwards each row's later scheduled draws follow from
  its smaller balance.
- **Slots (review 2, item 1).** The step, the fourth estimate and the New York room write the **post-remap profile slot**:
  in single-person mode and the survivor period always A (the one-person branch of `taxFor` reads only slot A, ~6847,
  ~6856), otherwise the row's owner. A row's slot in a year is the slot its scheduled draw lands on after the survivor
  remap of `buildTaxProfile`.
- **Pricing.** A last-resort traditional draw x from a row on slot S is taxed exactly like a scheduled draw x larger:
  the owner's return, the state's `inherited` treatment, no penalty, MAGI. It never uses `takeTraditional` /
  `wd.traditionalGross` (household ownership share, state `retirementA/B`, the penalty code). Mechanism: the step's
  bisection sets `profile.inhExtraS` (and, under `decedent`, `profile.inhExclS` = base + `min(x, room)`, with `room` =
  `max(0, cap - that row's scheduled draw)`) for each `taxFor` probe. **After the step, `profile.inhExtraA/B` equals
  `wd.inheritedGrossA/B` and `profile.inhExclA/B` equals base plus the room used, and they stay so for the rest of the
  pass** (review 2, item 2): every later `taxFor` in the pass sees the draw (`totalTax` ~11070, the `takePenalized` probes
  that follow the step in the penalty-aware orders, the up-year `refillBondReserve` -> `drawTaxable`, `fillTraditional`,
  the forced pass's `taxAfter` ~11233, and the last year's profile copied for `estate`). **Each pass resets them to their
  base values at its top**, beside `profile.ownerShareA = ownerShareA0` (~10759). The step can run twice in a pass (in
  `BUCKET_STEP.penalized`, then in `home`): `inhExtraS` and `wd.inheritedGrossS` accumulate (`+=`), and a row's New York
  room subtracts the earlier last-resort draws from the same row (review 3, M-8).
- **Where `taxFor` adds it.** Under `profile.inhOn`, `inhExtraA/B` is added to the return's other-income sums beside the
  E1c `seH` terms (`otherAB` in the joint branch, `otherA1` in the one-person branch, `otherA2` / `otherB2` in the two-filer
  branch), before the taxable-Social-Security computation, so provisional income, the NIIT MAGI, the AGI-based deductions
  and credits and `federalLiabilityForState` all see it as they see the scheduled draw in `otherA/B`; and to the state
  sources (6.4). The step records `wd.inheritedGrossA/B`.
- **MAGI:** the realized pair counts in MAGI and the convergence test (6.5); it is not in `cappableTraditional` and
  `magiCap` does not limit it (like the bond reserve's traditional draw).
- **Placement (review B3, S1; no shared-region change).** The step runs only after the household's capped penalty-free
  traditional money is released:
  - `withdrawStandard`, plain order: `releaseMagiCap` (if not yet released) -> inherited -> `takeHomeEquity`;
  - `withdrawStandard`, penalty-aware order: `releaseMagiCap` -> inherited -> `takePenalized` -> home equity (penalty-free
    inherited money before the household's penalized money, decision 6);
  - bucket strategy: the shared `BUCKET_DOWN_YEAR_ORDER` / `BUCKET_UP_YEAR_ORDER` arrays are **not** changed (they are the
    shared region `@@shared:BUCKET_DOWN_YEAR_ORDER`, both planners). The US-only `BUCKET_STEP.home` runs
    `releaseMagiCap` -> inherited -> `takeHomeEquity`, and the US-only `BUCKET_STEP.penalized` (used by the two
    US-only penalty-aware orders) runs `releaseMagiCap` -> inherited -> penalized money; the inherited step is a no-op
    when called a second time with nothing left or no need;
  - the step does nothing when `inh === null`: legacy runs never reach it.
- `row.traditionalWithdrawn` includes the scheduled and last-resort traditional draws; `row.rothWithdrawn` the
  last-resort Roth draw; `wd.earlyPenalty` never includes them. `planStats.rothShift` counts a last-resort inherited Roth
  draw like any Roth draw (a statistic; review M8).

### 6.7 Need readers (decision 7)

- **The need without the draw (decision 7 as refined by decisions 15 and 16; review 2, item 5; review 3, S-1).** In a
  year with a scheduled inherited draw (`inhDraw > 0`), each pass computes once, after `tax` (~10971):
  - `hcNoDraw` = the year's healthcare cost (premium after the credit) at the pass's MAGI less the scheduled draw: one extra
    `healthcareCost` evaluation through `costAt`'s arguments, with `magiProxy` lowered by `inhDraw` and, in a two-return
    year, each return's MAGI lowered by its own share (`inhDrawA/B` on the post-remap slots). IRMAA in this year comes from
    the lookback two years back, which the draw of this year does not touch; the IRMAA a past draw caused is not removed
    (section 9).
  - `taxNoDraw` = the same pass's tax with the scheduled draw removed: `taxFor` on the profile with `otherA/B` set to their
    **saved doubles less the draw** and `inhOn` false, its medical expense set from `hcNoDraw` (`hcNoDraw + ltc`, less the
    pass's 162(l) deduction as the pass computes it), the pass's own conversion and lump terms unchanged; then every field
    is restored **from the saved doubles**, never by adding the draw back (`(x - d) + d !== x` in floating point; review 3,
    M-5). Plus the same `ficaTax`.
  - `inhNeedAdj = inhDraw - (tax - taxNoDraw) - (healthcare - hcNoDraw)`: the draw net of its own tax and of the premium
    credit it costs.
  - One extra `taxFor` and one extra `healthcareCost` per pass, only in such a year; never per probe; none in a legacy
    year. Both figures come from the same pass top, so they compose with the forced pass and with a lump year (review 3).
- **Guardrails and `firstWithdrawal`:** where the deficit branch (~11046) and the forced pass (~11241) record
  `max(0, need - lumpExpense)`, they record `max(0, need - lumpExpense + inhNeedAdj)`. A **surplus** year whose surplus the
  draw created (`flow >= 0` and `-flow + inhNeedAdj > 0`) also records `max(0, -flow - lumpExpense + inhNeedAdj)` through
  the same `recordGuardrailWithdrawal` call and sets `firstWithdrawal` in the retirement year under the same rule. This is
  the household's need as if the inheritance were not there, the way its own withdrawals are recorded (net of their tax,
  which the draw solver grosses up separately). A lump year records nothing (E1d decision 7 wins); the hold after a lump
  year is unchanged. As in today's deficit branch, a first record of 0 sets `initialWR = 0`, which leaves the guardrails
  inactive (review M5; unchanged behaviour, stated).
- **The portfolio the rate is measured on (review S9).** `guardrailPortfolioNow` (~11019) is taken after the required
  distributions have left; it adds the inherited balances and the year's scheduled draw `inhDraw` back (the portfolio
  before the draw, as `recordGuardrailWithdrawal` intends). Example (review 2, corrected): household $1.5M plus a $300,000
  inherited traditional account drawn whole in year 10, MFJ, need $60,000 before the draw's tax: the rate is measured
  on $1.8M at a recorded need of $60,000 (3.33%); without this rule it was 4.0% on $1.5M, and without decision 15 about
  $109,500 on $1.8M (6.1%, the draw's own ~$49,500 of federal tax counted as spending), which would cut spending 10%. (The
  trigger in `nextGuardrailMultiplier` is a strict `>` against 1.2x.)
- **Lambda:** `lambdaNeed` (~10903) adds `inhNeedAdj` beside `lumpFlow` (no extra cost: the same figure).
- With no inherited row every expression is the old one unchanged (the term is skipped, not added).

### 6.8 Totals, rows, estate, display (decisions 5 and 8)

Only when `inh !== null`:
- `investable`, `total`, `row.traditional` (+ `inheritedTrad`) and `row.roth` (+ `inheritedRoth`) include the inherited
  balances (and `guardrailPortfolioNow`, 6.7).
- Rows carry `inheritedTrad`, `inheritedRoth` and `inheritedDraw` in a year where any inherited row is open or paid out.
- `estate` (~11511): `traditional` and `roth` add `bal.inheritedTrad` / `bal.inheritedRoth` (code: two additions, skipped
  when both are 0), so `afterTaxEndValueUS` prices an open inherited traditional balance with the household's (section 9).
- The sidebar's income-group summary (~2462-2467) says "inherited account planned" for an inherited row, not "lump sum
  planned" (review 2, minor).
- `trace` entries carry the per-row balances (a test hook).
- A US-only `annotateInheritedRows` (after the shared `renderTable`, like `annotateSolverRows`) adds "includes inherited
  traditional $X / Roth $Y" to the status cell's tooltip in those years. The Sankey needs nothing: the draw is in
  "Traditional withdrawal".
- The Funded % tile and "current investable" read today's input balances, not a past inherited row's balance (review M4;
  stated in the kind tip and section 9).

### 6.9 Single-person mode and the survivor

Single-person mode: owner A always. Survivor period: the dead owner's rows move to the survivor's slot from the death
year; the schedule, `L` and the deadline are unchanged (decision 10).

### 6.10 Exactness and speed

- No existing snapshot entry may move in any commit. Every new term is skipped, not added as zero, when `inh === null`
  (the E1c 9c rule): the per-year cost for a legacy state is a handful of null tests and the `lumpAmountsForYear` skip.
- `bal` and `profile` gain fields that are always present, so their shapes are fixed for every household.
- The state sources fields are declared in `newStateSources`, written on every taxing-state call (6.4, B2) behind one
  `inhOn` test, and read only when `sources.inherited > 0`. The per-call cost in a taxing state for a household with no
  inherited row is that test, five zero writes per sources object used (ten in the two-filer branch) and the gated read
  (review 3, M-7); the timing gate decides whether that is acceptable (a module-level "dirty" flag that skips the zero
  writes after the first clean call is the fallback, its correctness to be proven by the stale-source test). The exact-match snapshot suite (`tests/snapshot.js` against the
  base) is what proves legacy doubles unchanged across each commit; `tests/tax_caches.js` keeps guarding the memos and
  the `needsPerPerson` flag (review 2, minor).
- Timing: `tests/bench_runs_interleaved.js`, 21 rounds, +5% per path, the median of three runs on a quiet machine.

## 7. Tests and gates

- **`tests/inherited_accounts.js`** (new, in `npm test`; hand-computed, expected values written as numbers worked by hand,
  never with the engine's formula):
  - `inheritedLedger`: no row gives null; kinds, owners, single-person mode, a raw row through `Object.assign` with no
    `owner`; `Math.round` of a fractional age; ordering by receipt year; a past row 3 years back (first draw 1/8 in year
    0); a closed window ignored.
  - The schedule: 1/10, 1/9, ... 1/1 of the grown balance at r >= 0; empty after year 10; a Roth row untouched to year
    10, then a transfer (`investable` unchanged across it, tax and MAGI unchanged, cash then taxable at full basis).
  - The RMD floor (review B1, S5; review 2, item 6; heir ages as defined in 6.1): `singleLifeFactor` pinned at every age
    0-120+ against the table; an heir of 81 at r >= 0 draws exactly the even schedule; heirs of 85, 90 and 100 (d <= 1
    inside the window: the whole account; never a negative or above-balance draw); at -30% an heir of 81 bound by the RMD
    in every year and an heir of 75 never bound (0.7 x (15.8 - k) > 11 - k); the cap: at -30% an heir of 85 in draw year 8
    (d = 1.1) draws exactly the grown balance (deleting the cap fails this case); every draw is at least the RMD on the
    heir's factor (or the whole account) and at most the account.
  - Federal: the draw on the owner's return; owner B on two returns; net investment income unchanged while the NIIT
    threshold sees the draw (review S4, the $380 example); Social Security taxation; ACA premium at the realized MAGI;
    IRMAA two years on; the Roth bracket fill converts less by the draw.
  - Survivor: owner dead at receipt (the survivor's slot); owner dying in year 4 of the window (the survivor continues,
    same deadline); **Partner A dies, then a last-resort draw from A's row in the survivor period: its tax equals that of a
    scheduled draw x larger** (review 2, item 1: a draw written to slot B would go untaxed), and the same with B dying.
  - Last resort: a household that runs out with inherited money left draws Roth then traditional, after the release of
    its capped traditional money and before home equity, and depletes later; the schedule after it is smaller; the
    identity test (a last-resort draw x against a scheduled draw x larger: the same tax, premium, `magiA/B` and end
    balances; review 2, minor) in a one-pass year **and** in an ACA-iterating year with several passes **and** in a
    two-return year (the draw on its owner's return; a missing `returnMagis` site fails it); the four placements, each
    reached by its own case: `withdrawStandard` plain and penalty-aware, `BUCKET_STEP.home` and the US-only
    `BUCKET_STEP.penalized` (inherited before penalized money, no penalty charged); a case with the cliff plan on, the
    bucket strategy and the last resort together (the inherited step only after `releaseMagiCap`); a penalty-aware case
    where `takePenalized` runs after the step (its probes see the draw: the year's tax equals a run with the draw
    scheduled); NY `decedent` with a last-resort draw (the per-row room).
  - Guardrails (decisions 15, 16): in a deficit year and in a draw-made surplus year the recorded need equals the twin
    run's need with the inheritance removed (hand-computed: the draw net of its own tax and of the premium credit it
    costs), including an ACA household at 61 and 64 crossing the 400% line (review 3, S-1: $12,321 of premium); year 10 of a $300,000
    traditional row, MFJ (6.7's example: 3.33% on $1.8M, no cut, where the uncorrected need gives about 6.1%); a lump year
    still records nothing; `firstWithdrawal` in a retirement year with an inherited draw; lambda's need equals the same
    figure; the extra `taxFor` and `healthcareCost` run only in a year with a scheduled draw (a call counter); after the
    `taxNoDraw` evaluation the profile's `otherA/B` are the very doubles they were (`Object.is`).
  - Review 3 gaps (M-10, S-3, M-1): a last-resort draw in the receipt year is taxed like a scheduled draw; a forced-pass
    year with a last-resort draw (`taxAfter` sees it); an heir under 59 1/2 taking an early last-resort Roth draw owes no
    tax and no penalty (decision 14); the state draw in `start` before the subtraction, across an AGI-based line (IL's
    exemption at a federal AGI of $250,000; CT's `agiPhasedShare` across a step); the two-return identity case with
    conversions on and a finite ceiling (the ~10781 site); `estate` in a final year with a last-resort draw; New York
    after Partner A dies, the scheduled draw with its $20,000 excluded (post-remap slot). The identity test's tolerance is
    stated: $0.05 (the step's bisection lands about $0.02 from the exact draw at a $50,000 need, and the float association
    differs from a scheduled draw).
  - Stretch rows (decision 17; clock pinned with `currentYear`): a 2018 death traditional row draws the RMD alone (no
    deadline, hand-computed for three years); a 2014 death row (more than 10 years back) still opens; a Roth stretch row
    transfers `min(grown, b / d)` tax-free; a 2020 death row follows the 10-year rule; the heir of a stretch row dies in
    year 3: the survivor empties it by Y + 10 (even schedule from Y + 1); a 10-year row whose heir dies keeps its
    deadline.
  - Totals: row fields, `estate`, `afterTaxValue`, `guardrailPortfolioNow`.
  - Historical and bucket runs: growth at the path's return; the bucket last resort in a down year.
  - Cash conservation: in a working surplus year, total investable **excluding the inherited balances** at year end equals
    the twin run (no inherited row) with a tax-free lump equal to the draw, less the tax difference, within a cent; the
    inherited balance at year end equals the start balance x (1 + r) less the draw, exactly.
- **Stale-source guard (review B2):** in one page, an NY inherited scenario, then a legacy NY scenario; the legacy result
  equals a fresh page's bit for bit (and the same for PA and CO).
- **State:** `tests/state_rules.js` (field present on every row, valid kind, `cap` only on `decedent`);
  `tests/state_mechanisms.js` (the five kinds on the synthetic `zz` row, hand-computed: `heir` in a `perPerson` and an
  `agiPhasedShare` row, `heirAnyAge` below and above the first tier age with the filer's own draws keeping their age test,
  `decedent` per row and per return); engine households for PA (`exempt`: the state tax unchanged by the draw, which
  catches review S3's double count), NY (`decedent`, beside the heir's own $20,000 pension exclusion), CO (`heirAnyAge`
  under 55, the special-cased path, and at 60), AR (at 50: the inherited amount excluded up to $6,000 while the filer's
  own traditional draw is not), CT (`heir`, AGI-phased), GA (`heir` at 62 and 65), MI (`ordinary`), WA (the draw never in
  the capital-gains base); `tests/state_rules.js` also checks that no `schedule` entry overrides `inherited`;
  `tests/tax_caches.js` (the `needsPerPerson` pin list unchanged); `docs/state-tax-rules.md` regenerated (`npm test`
  fails when stale).
- **`tests/legacy_state.js`:** cases with the two new kinds, a junk kind, owner `'b'`, and a past row; pinned.
- **Snapshots:** new scenarios only (traditional received in the future, traditional received in the past, Roth, owner B
  on two returns, last resort near depletion, a historical path, NY); no existing entry moves (dump / compare against the
  base).
- **`test_inherited_accounts.js`** (Playwright, repo root, not in CI): the kinds show the owner and hide gain fields; a
  kind change reaches `window.fireProjectionRows`; the tooltip annotation appears in an inherited year.
- `tests/snapshot_ui.js`: a changed list note or Methodology sentence moves `ui_us.json` text hashes only (E1d lesson);
  any such change is in the same commit with the hash update explained.
- Docs: README feature list, a `CLAUDE.md` paragraph (the ledger, the opener, the fourth estimate, the five state kinds),
  the E1e notes in `docs/next-batches-plan.md`, the US badge bump.

## 8. Commits

1. `STATE_RULES.inherited` on all 51 rows with the research of appendix A (literals, notes, generator, coverage test,
   `docs/state-tax-rules.md`) and the evaluator branches with the always-written sources fields (inert: no profile carries
   an inherited amount yet); a new `singleLifeFactor(age)` with the full 0-120+ table (`singleLifeDivisor`, the 72(t)
   function, is unchanged). No number change. The rows' `notes` render under the state selector inside `<main>`, so
   `ui_us.json`'s text hashes move in this commit (the default state is Massachusetts); explained in the commit (review
   3, M-9).
2. Normalization: `normalizeUsLumps` accepts the two kinds, the `lumpAmountsForYear` skip, legacy corpus. The select does
   **not** offer them yet (review 3, M-9: an inherited row must never silently do nothing between commits). No number
   change.
3. The account: the two select options and their copy, ledger (10-year and stretch rows), opener, growth, schedule, cash
   flow, federal and state tax, need readers (with `taxNoDraw` and `hcNoDraw`), guardrail portfolio, totals, display,
   estate. Unit and engine tests only; **no snapshot scenario yet**.
4. Last resort and the fourth estimate. Unit and engine tests only.
5. All new inherited snapshot scenarios (added only here, so commit 4 cannot move a scenario commit 3 added; review 2,
   item 7), timing record, docs, badge. Every commit keeps every existing snapshot entry unchanged.

## 9. Not modeled

- The Roth bracket fill in a year with a large last-resort draw: the damped fourth estimate reaches the 8-pass cap and
  the conversion ends about 0.04% of the draw short of a year with the same draw scheduled (decision 18; under $15 a
  year of tax).
- Eligible designated beneficiaries' stretch; the surviving-spouse options (a deceased partner is the survivor model).
- A schedule other than even with the RMD floor (back-loading, a faster drain); shaping the draws is a Batch 5 lever. The
  floor uses the heir's own factor even when the decedent's longer one would allow less, and applies even when the
  decedent died before the required beginning date (no yearly RMD due): both draw slightly more than required, and only
  when `(1 + r)(L - k + 1) < 11 - k` (section 6.2).
- The decedent's own unpaid death-year RMD; a 401(k) plan that pays out faster than the law requires (the 402(c)(11)
  transfer is assumed); converting an inherited 401(k) to an inherited Roth IRA.
- After-tax basis in the inherited traditional account (all of it is taxed); state cost recovery of contributions taxed
  by the state (MA, NJ worksheet C), as for the household's own IRAs.
- An early last-resort draw from an inherited Roth is treated as tax-free: the decedent's five-year clock is assumed met
  (decision 14; review M3).
- Inherited annuities, pensions and HSAs (HSA is Batch 6).
- `lambdaEstimate`'s sample years do not price future inherited draws (Batch 5 owns lambda).
- `afterTaxEndValueUS` prices an open inherited traditional balance as the household's own traditional money (its state
  treatment and successor heirs' rates are not modeled).
- The need readers remove the scheduled draw's own tax and the premium credit it costs this year (decisions 15, 16), but
  not the IRMAA surcharge a draw causes two years later, nor anything for a last-resort draw (the last resort is already
  part of the year's need, as the household's own withdrawals are).
- Stretch rows (deaths before 2020, decision 17): the heir's own factor is used even where the decedent's longer remaining
  factor applied (death on or after the required beginning date), and the old five-year-rule election for a death before
  it is not offered; both draw at least what was required.
- The Funded % tile and "current investable" leave out a past inherited row's balance (review M4).
- New York: the decedent exclusion assumes a sole beneficiary (decision 4), one row per decedent (two rows from one
  decedent would get two $20,000 exclusions: the tooltip says to enter one row per decedent), that the decedent used none of
  it in the year of death, and that the decedent would have been 59 1/2 or older (IT-201-I: only amounts received after
  the decedent would have become 59 1/2 qualify; decision 13; review M2).
- Iowa: assumes the heir has an insurable interest in the decedent (a child in a parent) and that the decedent would have
  qualified (55 or older).
- Colorado and Oklahoma: the death-benefit treatment is the department's reading (Colorado) or the spec owner's reading
  of the department's text (Oklahoma); appendix A.
- Federal estate tax; state estate and inheritance taxes (PA, NJ and others charge inheritance tax on the account: the
  user enters the balance received).

## 10. Canada port (E1-CA)

On death an RRSP or RRIF is deemed received by the annuitant immediately before death at its fair market value (ITA
146(8.8); RRIF 146.3(6), not retrieved) and taxed on the final return; the beneficiary is not taxed on that amount (146(1)
"benefit" (a); CRA RC4177). So an inheritance from a parent's RRSP or RRIF is the existing tax-free lump in Canada; the two
inherited kinds are US-only. Not ported: the refund-of-premiums rollover to a financially dependent child or grandchild;
post-death growth taxed to the beneficiary; a TFSA's post-death earnings. The ledger, opener and last-resort step are
written country-neutral (pure functions over passed-in balances and rules), in case E1-CA wants a deferred kind later;
nothing moves into `shared/` now.

## 11. Review record

**Owner review of `6679c3e` (2026-10-09).** Accepted the self-review's RMD-floor correction, the last-resort placement
before penalized money, and the Oklahoma, Iowa and Mississippi readings; no change to the spec.

**Independent Opus review of `6679c3e` (2026-10-09).** Three blocking findings, nine should-fix and nine minor; no owner
decision reopened. All adopted (owner, 2026-10-09; decisions 12-14 for S2, M2 and M3). The spec owner checked B2, B3, S3,
S6 and S9 against the code before adopting them.
- B1: the floor's divisor `L - k + 1` reaches 1 or less inside the window from heir age 84 (a 10x or negative "RMD"): the
  whole account once it is 1 or less, and every draw capped at the grown balance (6.2; tests for 85, 90, 100 and a -30%
  year). The spec owner's error (the self-review fix).
- B2: the state sources scratch objects are reused, so a conditional write leaves a stale inherited amount for the next
  call (a legacy scenario after an inherited one would move): written on every call, only the read gated (6.4; a
  same-page stale-source test).
- B3: `BUCKET_DOWN_YEAR_ORDER` / `BUCKET_UP_YEAR_ORDER` are a shared region (both planners): the inherited step runs inside
  the US-only `BUCKET_STEP.home` and `.penalized` instead (6.6). The spec owner's error.
- S1: the inherited step only after `releaseMagiCap` (6.6). S2: the last-resort draw through every MAGI-iteration site,
  per owner (decision 12, 6.5). S3: the scheduled draw through `otherA/B` only, never `extraA/B` (state wages; the spec
  owner's error) (6.3). S4: the NIIT threshold sees the draw (6.3). S5: when the floor binds depends on the year's return
  (6.2; the spec owner's wording). S6: Connecticut's `agiPhasedShare` row needs its own `heir` mechanism; no
  `needsPerPerson` change (6.4; the spec owner's error). S7: only the inherited amount bypasses the age test (6.4). S8: the
  draw in `start`, then subtracted (6.4). S9: the guardrail portfolio before the draw (6.7).
- M1 the phase records do not carry the ledger (6.1); M2 New York's 59 1/2 condition (decision 13); M3 an early Roth
  last-resort draw (decision 14); M4 the Funded % tile (6.8, section 9); M5 a first guardrail record of 0 (6.7); M6
  `profile.inhExclA/B` (6.4); M7 `Math.round` (6.1); M8 `planStats.rothShift` (6.6); M9 the plan's design record
  (updated with this revision).
- The test gaps the reviewer named (how a mutation would slip through) are closed in section 7: the stale-source guard;
  hand-worked values for the 85-year-old heir; a cliff-plan + bucket + last-resort case; the identity test in a
  multi-pass year and a two-return year; guardrails in year 10; the PA engine run asserting the state tax is unchanged by
  the draw.
- Confirmed by the reviewer: every federal citation of section 4; the 10-year deadline (receipt year + 10, the
  regulation's example); the Single Life Table at the ages quoted; appendix A rows PA, NY, CO, MI, SC, VA; legacy
  exactness of the skips and fixed shapes (once B2 is fixed); the Roth payout as a transfer; the survivor remap; the
  scheduled draw as a per-year constant.

**Second independent Opus review of `c9845d6` (2026-10-09).** One blocking, six should-fix, nine minor; no owner decision
reopened. All adopted (owner, 2026-10-09; decision 15 for item 5). The spec owner checked items 1, 4 and 5 and the
guardrail trigger against the code before adopting them.
- Item 1 (blocking): a last-resort draw written to slot B after Partner A's death was never taxed (the one-person branch
  of `taxFor` reads only slot A): the step, the fourth estimate and the New York room write the post-remap slot (6.6,
  6.5; a survivor last-resort test). The spec owner's error.
- Item 2: the step's profile fields stay at the realized draw for the rest of the pass, and `taxFor` adds them beside the
  E1c `seH` terms in the other-income sums (6.6). Item 3: the fourth estimate's full site list (both pass-estimate
  `returnMagis` calls, the 162(l) search and hold, the replays, the trial seed) and `magiBase` defined at the pass top,
  with the fill check's substitution (6.5). Item 4: the draw enters `ordinaryNonSS`, not `start`, so Washington never
  taxes it (6.4; the spec owner's wording). Item 5: the need readers net of the draw's own tax (decision 15, 6.7; the
  spec owner's example ignored that tax). Item 6: one heir-age convention (6.1) and the −30% and cap tests pinned to it
  (6.2, section 7). Item 7: inherited snapshot scenarios only in commit 5 (section 8).
- Minor, all adopted: AR / OK / CO `heirAnyAge` wording and Colorado's under-55 path (6.4); `inherited` compiled per
  variant in `compileRow`, with a no-override check (6.4); the five fields declared in `newStateSources` and written behind
  one `inhOn` test (6.4); the snapshot suite, not `tests/tax_caches.js`, proves legacy doubles (6.10); `estate` and
  `afterTaxValue` wording (6.5, 6.8); the identity test compares premium, `magiA/B` and balances, the four placements each
  tested, the cash-conservation twin made explicit (section 7); the income-group summary text (6.8); the `d <= 1`
  qualifier (decision 2, 6.2).
- Confirmed by the reviewer: B1's formula and figures against the Single Life Table; B2's always-written fields with a
  gated read; B3 / S1's placement in all six paths with no shared-region edit; S3, S4, S6, S7 (given Colorado's
  special case) and S9's portfolio placement; the NIIT text of IRC 1411(a)(1) and the $380 example; New York's line 29
  (both quoted sentences, the per-decedent $20,000, the reduction for the decedent's own use). Colorado's pages returned
  403 to curl and were not re-verified.

**Third independent Opus review of `cdd1758` (2026-10-09).** No blocking finding; three should-fix and ten minor; no
owner decision reopened. All adopted (owner, 2026-10-09: decision 16 for S-1, decision 17 for S-2, the select options
in commit 3 for M-9).
- S-1: the need readers left in the premium credit the draw costs (an ACA couple at 64 would still trip the guardrail):
  decision 16 (6.7). S-2: a death before 2020 is not under the 10-year rule: decision 17, the stretch and the successor
  deadline (6.1, 6.2; Notice 2024-35 section II.C quoted in section 4). S-3: `inhOn` undefined, so a last-resort draw in
  the receipt year went untaxed: `inhOn = (inh !== null)` in every year of an inherited run (6.3).
- M-1 New York's base exclusion on post-remap slots (6.4); M-2 `irmaaAt`'s signature and single-return term (6.5); M-3
  the `estUsed` line (6.5); M-4 the records carry the realized pair (6.5); M-5 `taxNoDraw` restores saved doubles (6.7);
  M-6 every state read inside the gate (6.4); M-7 the per-call cost stated (6.10); M-8 the step's fields accumulate and
  the room subtracts earlier draws (6.6); M-9 the UI hash move in commit 1 and the select options in commit 3 (section
  8); M-10 six test gaps and the identity tolerance (section 7).
- Confirmed by the reviewer: the four end-to-end traces (MFJ ACA with a $400,000 row; two returns with a last resort; New
  York survivor; a historical −30% year with an heir of 85) apart from the findings above; the second review's fixes;
  legacy exactness in all five commits (the UI text hashes aside); the Single Life Table at every age; the WI, ME, DE, MO,
  CT, IL and IA rows. Not re-fetched by this review: LA (wrong document id), KY, GA, NJ, AR, OK, MS.

## Appendix A. State treatment of inherited traditional draws (retrieved 2026-10-09)

Values: `exempt` (never taxed), `heir` (the heir's own exclusion, age and cap), `heirAnyAge` (the heir's own cap, age test
met for a death distribution), `decedent` (a separate per-decedent cap), `ordinary` (no exclusion for a non-spouse heir).
"No-tax" rows (AK, FL, NV, NH, SD, TN, TX, WY) take `ordinary` (inert). WA taxes no ordinary income (`ordinary`, inert).

| Row | Value | Deciding source and sentence |
|---|---|---|
| PA | exempt | PA PIT Guide, Gross Compensation: "Payments paid to the estate or designated beneficiary of a participant by reason of the participant's death are not included as taxable compensation." (IRA table: same; 1099-R code 4: "a distribution due to death is not taxable".) |
| IL | exempt | IL Pub. 120 (R-12/25): subtract the federally taxed amount from "an Individual Retirement Account (IRA) ... reported on ... Line 4b" and qualified plans (Line 5b); no age or beneficiary condition (IL-1040 instructions 2025, line 5). |
| MS | exempt | Form 80-100 instructions (Rev. 10/24), line 46: only pensions and annuities "taxable as early or excess distributions under the Federal Internal Revenue Code (see Federal Form 5329)" are taxable; 35 Miss. Code R. 3-02-07-100/101 (IRAs are exempt optional retirement allowances), -104 (early distributions taxable). A death distribution is not early (72(t)(2)(A)(ii)). The 2025 instructions PDF was not found at DOR; the statute (27-7-15) was blocked. |
| IA | exempt | Iowa Code 2026 s.422.7(19)(a): subtract pension, IRA and plan income "received by a person who is ... (3) The surviving spouse of an individual or a survivor having an insurable interest in an individual who would have qualified"; (c)(2) limits it to amounts received "as a result of the death of the decedent". Assumes insurable interest and a qualifying decedent (55+). |
| NY | decedent, cap $20,000 (unindexed) | IT-201-I (2025) line 29, "Beneficiaries": "you may make this subtraction if the decedent would have been entitled to it, had the decedent continued to live, regardless of your age"; "If the decedent would have become 59½ during 2025, enter only the amount received after the decedent would have become 59½"; the decedent's $20,000 is shared among beneficiaries by value; the beneficiary's share is separate from their own exclusion. Sole beneficiary (decision 4), one row per decedent and a decedent of 59½ or older (decision 13) assumed. |
| CO | heirAnyAge | ITT "Social Security, Pensions and Annuities" (Jan 2025): "An individual taxpayer who is under age 55 and who receives pension and annuity benefits due to the death of the person originally entitled to receive such benefits may subtract ... limited to $20,000" (1099-R code 4); 55+ claim regardless; the premature-distribution bar does not reach a death distribution. |
| AR | heirAnyAge | AR1000F/AR1000NR instructions 2025, traditional IRA: "the first $6,000 is exempt ... Premature distributions made on account of the participant's death or disability also qualify for the exemption." |
| OK | heirAnyAge (reading) | Form 511 packet 2025, Schedule 511-A line 6: up to $10,000 of retirement benefits that "satisfy the requirements of the IRC" from 401, 457, 408, 403 plans; no age test in the text; the row reads it as no early-withdrawal penalty, which a death distribution never owes. |
| GA | heir | 2025 IT-511: retirement income exclusion $35,000 at 62-64, $65,000 at 65+, each filer on their own age; Schedule 1 line 11 "Taxable IRA Distributions" is retirement income; no beneficiary rule. |
| CT | heir (no age test) | C.G.S. 12-701(a)(20)(B)(xxviii)-(xxix): from 2026 "any distribution from an individual retirement account other than a Roth individual retirement account", by the federal-AGI schedule; no age or beneficiary condition. |
| DE | heir | 30 Del. C. 1106(b)(3): 60+ exclusion up to $12,500 of pensions or "eligible retirement income" (distributions from plans defined in IRC 4974, 401(k), 457 ...); no beneficiary rule. |
| KY | heir (no age test) | Schedule P (2023; later years not reachable): "All pension and retirement income paid under a written retirement plan is eligible ... IRA accounts, 401(k) ... death benefits"; per-person cap $31,110. |
| LA | heir | La. R.S. 47:44.1(A): $12,000 (CPI-indexed from 2026) of "pension and annuity income ... received by an individual sixty-five years of age or older"; no beneficiary rule. |
| MO | heir (no age test) | RSMo 143.124: the exemption's "annuity, pension or retirement allowance" includes "401(k) plans ... and individual retirement arrangements, also known as IRAs ... not including Roth IRAs"; no beneficiary condition. |
| NJ | heir | NJ-1040 instructions 2025: IRA withdrawals on line 20a (Worksheet C); line 28a exclusion if "You ... were age 62 or older or blind/disabled" and income <= $150,000; no beneficiary rule. |
| WI | heir | Wis. Stat. 71.05(6)(b)54m: from 2025, distributions "received by an individual each year from a qualified retirement plan ... or from an individual retirement account" at 67+, up to $24,000; no beneficiary rule. |
| MI | ordinary | michigan.gov "Individual Plans": "Distributions after the death of the participant may only be subtracted by a surviving spouse if the distributions qualified as a subtraction for the participant at the time of death"; MCL 206.30: "Benefits received by a surviving child are not deductible." |
| ME | ordinary | 36 M.R.S. 5122(2)(M-2): the deduction is for "each individual who is a primary recipient", defined as "the individual upon whose earnings or contributions the retirement plan benefits are based or the surviving spouse of that individual". |
| SC | ordinary | S.C. Code 12-6-1170(A)(1): the deduction is for "An individual taxpayer who is the original owner of a qualified retirement account"; (A)(3) the surviving spouse. The 65+ deduction of (B) applies to any income and is unaffected. |
| RI | ordinary | PUB 2026-01 Retirement Income Guide: "No income from a traditional IRA, Roth IRA, SEP-IRA, or any other type of IRA qualifies for the Pension and Annuity Income Modification." (A 401(k) moved to an inherited IRA is IRA income.) **Pre-existing row error, outside E1e:** the RI row excludes all traditional draws, but IRA draws never qualify (Open items). |
| MD | ordinary | 2025 resident booklet, pension exclusion: an "employee retirement system" under 401(a), 403 or 457(b); "[A traditional IRA, a Roth IRA, a rollover IRA ... does not qualify.]" |
| AL, HI, VT | ordinary | Pension-only exclusions (the rows already give no exclusion to IRA draws); an inherited 401(k) moved to an inherited IRA is IRA money. Not separately re-fetched; the rows' 7D sources stand. |
| OH | ordinary | IT 1040 instructions 2025, line 43 "Survivor Benefits" ("any amount received because of the death of another individual") is limited by Ohio Adm. Code 5703-7-08 (updated 2025-11-19): (A)(2) benefits "received pursuant to a survivorship plan if the benefit payment is conditioned on the death of the covered individual"; (D) none "authorized to be paid without the death of the covered individual as a pre-condition". An IRA or 401(k) is payable to its owner in life. |
| VA | ordinary | Form 760 instructions 2025: "Certain Death Benefit Payments" covers death benefits "received from an annuity contract" only. |
| OR | ordinary | OR-17 (2025): the beneficiary subtraction is for federal pension income only (ORS 316.680(1)(e)). |
| MA | ordinary | Form 1 instructions 2025: IRA distributions on Schedule X line 2 with Massachusetts cost recovery (not modeled, as for own IRAs); no beneficiary rule (read from the NBER TAXSIM mirror of the official PDF). |
| CA, AZ, KS, NC, ND, UT | ordinary | 2025 resident instructions: no beneficiary or IRA-specific subtraction (AZ, KS, NC: government and military pensions only). |
| MN, WV, ID, IN, NM, NE, MT, DC | ordinary | 2025 instructions: retirement subtractions for military, railroad, foreign-service, civil-service or public-system pensions only (MT: military survivor benefits only); none for IRAs or beneficiaries (NE, MT, DC read from the NBER TAXSIM mirror of the official PDFs). |
