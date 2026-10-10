# E1e: inherited traditional and Roth IRA / 401(k) accounts (US) — design

Date: 2026-10-09. Owner decisions from the brainstorm of this date (questions 1-8 and the design sections, all answered
"A" or "yes"; the state schema and the New York assumption decided after the state research). Base: `6c26726` on
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
   years left in the window, but never less than the yearly RMD on the heir's own Single Life factor (spec self-review,
   2026-10-09: the even draw alone falls below that RMD for an heir 82 or older, section 4). Roth: left to grow, paid out
   whole in year 10. No input for "the decedent had started RMDs": the floor applies to every inherited traditional row,
   which is always legal (drawing more than required is allowed) and changes nothing for an heir 81 or younger;
   back-loading, which would need the input, is a Batch 5 lever. (Rejected: B, a per-row "Even / Minimum, rest in year 10"
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
   recomputes from what is left. Uncapped by the cliff plan. In the penalty-aware orders the inherited step sits before the
   household's penalized money (section 6.6; flagged for the owner's review of this spec). (Rejected: B, no extra draws;
   C, inherited money ahead of the household's own Roth, an optimizer lever.)
7. **Need readers (question 7, option A).** The guardrails, `firstWithdrawal` and lambda's need add the year's scheduled
   inherited draw back, as E1d decision 12 does for a lump: the inherited balance is in the portfolio, so its draw is a
   portfolio withdrawal, not income. A year the draw turns into a surplus records too. (Rejected: B, the draw as income
   everywhere, like today's RMDs; C, A for the guardrails only.)
8. **Display (question 8, option A).** Folded into the existing columns: `row.traditional` / `row.roth` include the
   inherited balances, `row.traditionalWithdrawn` / `row.rothWithdrawn` the inherited draws; new row fields only in
   years with an inherited account; a US-only tooltip annotation after the shared table. (Rejected: B, a new column and
   chart series in the shared table; C, counted in net assets but in no column.)
9. **An account inherited before today is supported (design section 2).** If "Received at" is before Partner A's current
   age, the amount is today's balance and the schedule covers what is left of the window; a window already closed
   (received more than 10 years ago) is ignored. (Rejected: future inheritances only.)
10. **The heir's own death (design sections 2 and 3b).** If the owner is dead at receipt (Partner A's age at or after the
    survivor's death year, E1d decision 10), the surviving partner receives the account. If the owner dies within the
    window, the survivor continues the same schedule to the same deadline (the deadline is tied to the decedent's death,
    section 4).
11. **No Roth five-year input (follows from decision 2).** The payout in year 10 is at least ten years after the
    decedent's first contribution, so the five-year clock, which is not restarted at death, has always run.

## 4. Facts (primary sources; retrieved 2026-10-09)

Federal:
- **10-year rule, non-eligible beneficiary.** Treas. Reg. 1.401(a)(9)-5(e)(2) (LII): the deadline is "the calendar year
  that includes the tenth anniversary of the date of the employee's death". 1.401(a)(9)-3(c)(3): "Distributions satisfy
  this paragraph (c)(3) if the employee's entire interest is distributed by the end of the calendar year that includes the
  tenth anniversary of the date of the employee's death." IRC 401(a)(9)(H)(i), added by the SECURE Act section 401, for
  deaths after 2019 (Notice 2024-35 section II.C).
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
- **The even draw and the RMD.** In draw year k (1 to 10) the even draw is the balance over 11 - k; the RMD is the
  balance over L - (k - 1), with L the heir's factor at their age in the year after the death. The even draw is at least
  the RMD in every year exactly when L - k + 1 >= 11 - k, that is L >= 10: an heir 81 or younger in the year after the
  death (factor 10.5 at 81, 9.9 at 82). The decedent's remaining factor applies when it is longer (a smaller RMD), so the
  heir's own factor is the conservative floor. The engine draws max(even draw, balance / (L - k + 1)) in years 1-9
  (decision 2), which is legal in every case and equal to the even draw for an heir 81 or younger. (The brainstorm's
  "about 90" was the spec owner's error, corrected in self-review.)
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
  owner's life expectancy (which only matters from age 82), taxed as ordinary income on the owner's return, with no 10%
  penalty at any age. If the
  household runs short, it is drawn earlier (after your own accounts, before home equity). Inherited Roth IRA / 401(k):
  tax-free, left to grow and paid out in the 10th year. Both: enter the balance in the year received; a past year is
  allowed (enter today's balance; the draws cover the years left). A 401(k) is assumed moved to an inherited IRA. Not
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
  'roth'), owner ('A' | 'B'), openYear, firstDrawYear (the year after receipt), lastYear (receipt year + 10), balance }`
  in fixed-size arrays (at most `LIST_MAX`), allocated once per run. Rows are ordered oldest receipt first (the nearest
  deadline first, for the last-resort draw).
- **Totals in `bal`.** `bal` always carries `inheritedTrad: 0` and `inheritedRoth: 0` (a fixed object shape for every
  household; the snapshot `{ ...bal }` rewinds them). They equal the ledger's sums.
- **Snapshot.** The ledger's per-row balances are cloned with the MAGI-iteration snapshot and restored with it
  (`inheritedClone/Restore`, beside `accountsClone/Restore`), only when `inh !== null`. The plan's phase records
  (`naturalRec`, trial records) carry the clone the same way they carry the account ledger.
- **Opening.** A future row (receipt year >= 0) opens in its receipt year **after** that year's growth (`growBalances`):
  balance `amount x (flat ? 1 : factor)`, no draw in the receipt year. A past row (receipt year < 0, at most 10 years
  back: `lastYear >= 0`) opens in year 0 **before** growth at `amount` (today's balance). A row with `lastYear < 0` is
  ignored. The deadline year is `receiptYear + 10` (calendar years relative to the projection's year 0).
- **Owner.** Owner B only when not single-person and the row's owner is `'B'`; else A. If that owner is dead at receipt
  (decision 10), the other partner's slot. If the owner dies later, the slot moves to the survivor from the death year
  (the dead-owner rule of E1d decision 10: the death year counts as after death).

### 6.2 The year: growth and the schedule

- **Growth.** In `growBalances`' place in the year (both strategies), each open row's balance grows by the year's
  `stockReturn` (the path's own return in a historical or Monte Carlo run); `bal.inheritedTrad/Roth` are re-summed.
- **Draws** (known at the start of the year, because the year's return is known then; computed once per year before the
  MAGI iteration, so they are per-year constants like `rmd`):
  - traditional row in draw year k (1 to 10, k = year - receiptYear): `grown = balance x (1 + stockReturn)`; in years
    1-9 `draw = max(grown / (11 - k), balance / (L - k + 1))` with `L = singleLifeFactor(heir age in the year after
    receipt)` (the RMD is figured on the start-of-year balance, as the household's RMDs are, and the heir is the slot's
    owner at receipt); year 10 takes everything;
  - Roth row in year 10: `payout = balance x (1 + stockReturn)`; earlier years nothing.
- `inhDrawA/B` = the year's scheduled traditional draws by owner slot; `inhDraw = inhDrawA + inhDrawB`; `inhRothPayout`
  = the Roth payouts.
- After `growBalances` (beside `withdrawRequiredDistributions`), the draws and payouts leave the ledger; the Roth payout
  goes to `bal.cash` (not to `flow`, tax or MAGI: a transfer), then `sweepExcessCash` invests the excess in taxable at full
  basis, as a tax-free lump.

### 6.3 Cash flow and the federal return

- `flow` adds `inhDraw` in both strategies' sums, appended last (the existing float order is unchanged) and only when
  `inhDraw > 0`. It pays its own tax and covers spending.
- `buildTaxProfile` takes `inheritedA/B` (the scheduled draw by slot) and adds each to its slot's other income (`otherA/B`
  and so `extraA/B`), so the federal return, Social Security taxation, the deductions and credits, ACA, IRMAA (two years
  on, through `irmaaMagiHistory`), the Roth bracket fill (it converts less) and `magiThresholds` see it with no further
  wiring. The survivor remap moves B's into slot A. The profile always carries `inheritedA/B` (zeros), so its shape is
  fixed (E1d section 6.4 rule). It is never part of `invOrd` or gains, so NIIT never sees it (1411(c)(5)).
- Not part of `requiredDistributions`, the account ledger `accts`, `applyRothConversion`, the bond ladder or the bond
  refill; never penalized (it never reaches `takeTraditional` or the penalty code).
- `row.income` includes `inhDraw` (as `otherA/B` already carry it).

### 6.4 The state return

- `taxFor` fills `sources.inheritedA/B` (and `sources.inherited`, the household sum) from `profile.inheritedA/B` (each
  return its own, the two-filer branch per return), in every branch, only when non-zero; `retirementA/B` never include
  them. The state ordinary base adds `sources.inherited` except when the row's value is `exempt`.
- `STATE_RULES` gains `inherited` on every row: `{ kind: 'ordinary' | 'exempt' | 'heir' | 'heirAnyAge' | 'decedent', cap
  }` (`cap` for `decedent` only, per column or a number; `indexed` false for New York). `compileStateRule` copies it into
  the compiled rule; `stateIncomeTax` reads it only when `sources.inherited > 0`, so every existing household is the same
  double (`tests/tax_caches.js`).
  - `ordinary`: taxed with other ordinary income; no exclusion reaches it.
  - `exempt`: left out of the state base entirely.
  - `heir`: added to the filer's retirement amount inside `stateRetirementExclusion` (the heir's own age tests, caps,
    `reducedBy`, share tables), as if it were the heir's own traditional draw, but past the 401(k)-after-retirement test
    (`employerPlan`) as an IRA (402(c)(11)).
  - `heirAnyAge`: as `heir`, but the traditional age test is treated as met; below the row's first tier age the cap is
    the first tier's cap (CO: $20,000 under 55; AR: $6,000; OK: $10,000).
  - `decedent`: a separate exclusion of `min(inherited, cap)` per inherited row (NY: $20,000, not indexed), independent of
    the heir's own exclusion and age. Per row needs the per-row draws: `sources.inheritedExclA/B` (per return) is the
    sum over that slot's rows of `min(row draw, cap)` computed by the year loop when the year's compiled rule has
    `decedent` (New York's row has no schedule, so this is read once per run; a scheduled row would read it per year).
    The last-resort draw (section 6.6) joins the same per-row sums.
  - `heir` and `heirAnyAge` read per-person fields, so a row with either sets `needsPerPerson` (`compileRow`; the
    `tests/tax_caches.js` pin list moves accordingly).
- `scripts/gen-state-rules.js` lists the field; `docs/state-tax-rules.md` regenerated; `tests/state_rules.js` requires it
  on every row with a valid kind; each row's `notes` gains one sentence on inherited accounts (what the planner shows
  under the selector).
- A state that deducts federal tax (the lagged pass) sees the inherited draw through the federal liability as any other
  ordinary income.

### 6.5 MAGI, the iteration, the cliff plan

- The scheduled draw is a fixed part of `magiBase0` and `returnMagis` (through `otherA/B`). It does not move the
  iteration's estimates; nothing new is added to `scalarSnapshot` (the `bal` totals and the cloned ledger are rewound).
- The cliff plan sees it inside `magiBase` in every line, candidate and stay-under; it is never a lever (Batch 5).
  `lambdaEstimate`'s sample years do not price future inherited draws (section 9).
- `afterTaxValue` (~9585, the in-year phase score) adds `inheritedTrad x (1 - lambda) + inheritedRoth`, only when
  `inh !== null`.

### 6.6 Last resort (decision 6)

- A new step `takeInherited(wd)`: inherited Roth rows (net = gross, cash only), then inherited traditional rows, oldest
  receipt first, until the need is met or the accounts are empty.
- The inherited traditional draw is taxed **exactly like a scheduled draw** of the same size: the owner's return, the
  state's `inherited` treatment, no penalty, MAGI. It therefore cannot use `takeTraditional` / `wd.traditionalGross`
  (household ownership share, state `retirementA/B`, the penalty code). A separate gross on `wd`, `inheritedGrossA/B`,
  is priced by `taxFor` through the profile's `inheritedA/B` (the plan picks the mechanism: a profile field the solver
  sets around each probe, or an argument). Requirement and test: the tax of a last-resort draw x equals the tax of the
  same year with a scheduled draw x larger (identity to the cent).
- Realized MAGI and the convergence test count `inheritedGrossA + inheritedGrossB` beside `traditionalGross`; it is not
  in `cappableTraditional` and `magiCap` does not limit it (like the bond reserve's traditional draw).
- Placement:
  - `withdrawStandard`, plain order: before `takeHomeEquity` (after Roth, cash and the bond reserve).
  - `withdrawStandard`, penalty-aware order: before `takePenalized` (penalty-free inherited money before the household's
    penalized money: the penalty-aware order's own principle); home equity stays last.
  - Bucket orders: `BUCKET_DOWN_YEAR_ORDER` and `BUCKET_UP_YEAR_ORDER` gain `'inherited'` before `'home'`;
    `BUCKET_DOWN_PENALIZED_ORDER` and `BUCKET_UP_PENALIZED_ORDER` before `'penalized'`.
  - The step does nothing when `inh === null` (no row, no ledger): legacy runs never reach it.
- Afterwards each row's later scheduled draws follow from its smaller balance (the even schedule is recomputed every
  year by construction).
- `row.traditionalWithdrawn` includes the scheduled and last-resort traditional draws; `row.rothWithdrawn` the
  last-resort Roth draw; `wd.earlyPenalty` never includes them.

### 6.7 Need readers (decision 7)

- **Guardrails and `firstWithdrawal`:** where the deficit branch (~11046) and the forced pass (~11241) record
  `max(0, need - lumpExpense)`, they record `max(0, need - lumpExpense + inhDraw)`. A **surplus** year whose surplus the
  draw created (`flow >= 0` and `-flow + inhDraw > 0`) also records `-flow - lumpExpense + inhDraw` (floored at 0) through
  the same `recordGuardrailWithdrawal` call, and sets `firstWithdrawal` in the retirement year under the same rule. A
  lump year records nothing (E1d decision 7 wins); the hold after a lump year is unchanged.
- **Lambda:** `lambdaNeed` (~10903) adds `inhDraw` beside `lumpFlow`.
- Both overstate by the draw's own tax (no extra tax call), as E1d decision 12 does.
- With no inherited row `inhDraw` is 0 and each expression is the old one unchanged (the term is skipped, not added).

### 6.8 Totals, rows, estate, display (decisions 5 and 8)

Only when `inh !== null`:
- `investable`, `total`, `row.traditional` (+ `inheritedTrad`), `row.roth` (+ `inheritedRoth`) and
  `guardrailPortfolioNow` include the inherited balances.
- Rows carry `inheritedTrad`, `inheritedRoth` and `inheritedDraw` in a year where any inherited row is open or paid out.
- `estate` gains nothing new: `traditional` and `roth` include the inherited balances, so `afterTaxEndValueUS` prices an
  open inherited traditional balance with the household's (section 9).
- `trace` entries carry the per-row balances (a test hook).
- A US-only `annotateInheritedRows` (after the shared `renderTable`, like `annotateSolverRows`) adds "includes inherited
  traditional $X / Roth $Y" to the status cell's tooltip in those years. The Sankey needs nothing: the draw is in
  "Traditional withdrawal".

### 6.9 Single-person mode and the survivor

Single-person mode: owner A always. Survivor period: the dead owner's rows move to the survivor's slot from the death
year; the schedule and deadline are unchanged (decision 10).

### 6.10 Exactness and speed

- No existing snapshot entry may move in any commit. Every new term is skipped, not added as zero, when `inh === null`
  (the E1c 9c rule): the per-year cost for a legacy state is a handful of null tests and the `lumpAmountsForYear` skip.
- `bal` and `profile` gain fields that are always present (zeros), so their shapes are fixed for every household.
- `STATE_RULES` gains a field on every row, read only when `sources.inherited > 0`; `tests/tax_caches.js` proves the
  doubles are identical (`Object.is`).
- Timing: `tests/bench_runs_interleaved.js`, 21 rounds, +5% per path, the median of three runs on a quiet machine.

## 7. Tests and gates

- **`tests/inherited_accounts.js`** (new, in `npm test`; hand-computed):
  - `inheritedLedger`: no row gives null; kinds, owners, single-person mode, a raw row through `Object.assign` with no
    `owner`; ordering by receipt year; a past row 3 years back (first draw 1/8 in year 0); a closed window ignored.
  - The schedule: 1/10, 1/9, ... 1/1 of the grown balance; empty after year 10; a Roth row untouched to year 10, then a
    transfer (`investable` unchanged across it, tax and MAGI unchanged, cash then taxable at full basis).
  - The RMD floor: `singleLifeFactor` pinned at every age 0-120+ against the table; an heir of 81 draws exactly the even
    schedule; an heir of 85 draws the RMD in the years where it is larger (hand-computed); every draw is at least the
    RMD on the heir's factor.
  - Federal: the draw on the owner's return; owner B on two returns; NIIT unchanged by it; Social Security taxation; ACA
    premium at the realized MAGI; IRMAA two years on; the Roth bracket fill converts less by the draw.
  - Survivor: owner dead at receipt (the survivor's slot); owner dying in year 4 of the window (the survivor continues,
    same deadline).
  - Last resort: a household that runs out with inherited money left draws Roth then traditional before home equity,
    depletes later than without it; the schedule after it is smaller; the identity test (a last-resort draw x taxes like
    a scheduled draw x larger); the penalty-aware order (inherited before penalized money, no penalty charged).
  - Guardrails: a draw-made surplus year records the need with the draw added back; a deficit year likewise; a lump year
    still records nothing; `firstWithdrawal` in a retirement year with an inherited draw; lambda's need.
  - Totals: row fields, `estate`, `afterTaxValue`, `guardrailPortfolioNow`.
  - Historical and bucket runs: growth at the path's return; the bucket orders' last resort.
  - Cash conservation: in a working surplus year, total investable plus inherited at year end equals the twin run with the
    draw moved to a tax-free lump of the same size, less the tax difference, within a cent.
- **State:** `tests/state_rules.js` (field present on every row, valid kind, `cap` only on `decedent`);
  `tests/state_mechanisms.js` (the five kinds on the synthetic `zz` row, hand-computed, including `heirAnyAge` below the
  first tier and `decedent` per row); hand-computed households for PA (`exempt`), NY (`decedent`, beside the heir's own
  $20,000 pension exclusion), CO (`heirAnyAge` under 55), GA (`heir` at 62 and 65), MI (`ordinary`);
  `tests/tax_caches.js` (identical doubles; the `needsPerPerson` pin list); `docs/state-tax-rules.md` regenerated
  (`npm test` fails when stale).
- **`tests/legacy_state.js`:** cases with the two new kinds, a junk kind, owner `'b'`, and a past row; pinned.
- **Snapshots:** new scenarios only (traditional received in the future, traditional received in the past, Roth, owner B
  on two returns, last resort near depletion, a historical path, NY); no existing entry moves (dump / compare against the
  base).
- **`test_inherited_accounts.js`** (Playwright, repo root, not in CI): the kinds show the owner and hide gain fields; a
  kind change reaches `window.fireProjectionRows`; the tooltip annotation appears in an inherited year.
- `tests/snapshot_ui.js`: a changed list note or Methodology sentence moves `ui_us.json` text hashes only (E1d lesson);
  any such change is in the same commit with the hash update explained.
- Docs: README feature list, a `CLAUDE.md` paragraph (the ledger, the opener, the five state kinds), the E1e notes in
  `docs/next-batches-plan.md`, the US badge bump.

## 8. Commits

1. `STATE_RULES.inherited` on all 51 rows with the research of appendix A (literals, notes, generator, coverage test,
   `docs/state-tax-rules.md`); a new `singleLifeFactor(age)` with the full 0-120+ table (`singleLifeDivisor`, the 72(t)
   function, is unchanged). No number change.
2. Inputs: the two kinds, `normalizeUsLumps`, the `lumpAmountsForYear` skip, legacy corpus. No number change.
3. The account: ledger, opener, growth, schedule, cash flow, federal and state tax, MAGI, need readers, totals, display,
   estate. New scenarios.
4. Last resort.
5. Scenarios, timing record, docs, badge.

## 9. Not modeled

- Eligible designated beneficiaries' stretch; the surviving-spouse options (a deceased partner is the survivor model).
- A schedule other than even with the RMD floor (back-loading, a faster drain); shaping the draws is a Batch 5 lever. The
  floor uses the heir's own factor even when the decedent's longer one would allow less, and applies even when the
  decedent died before the required beginning date (no yearly RMD due): both draw slightly more than required, only for
  an heir 82 or older.
- The decedent's own unpaid death-year RMD; a 401(k) plan that pays out faster than the law requires (the 402(c)(11)
  transfer is assumed); converting an inherited 401(k) to an inherited Roth IRA.
- After-tax basis in the inherited traditional account (all of it is taxed); state cost recovery of contributions taxed
  by the state (MA, NJ worksheet C), as for the household's own IRAs.
- Inherited annuities, pensions and HSAs (HSA is Batch 6).
- `lambdaEstimate`'s sample years do not price future inherited draws (Batch 5 owns lambda).
- `afterTaxEndValueUS` prices an open inherited traditional balance as the household's own traditional money (its state
  treatment and successor heirs' rates are not modeled).
- The need readers overstate the withdrawal by the draw's own tax (decision 7).
- New York: the decedent exclusion assumes a sole beneficiary and that the decedent used none of it in the year of death.
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

(Empty: the owner's review of this spec comes next.)

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
| NY | decedent, cap $20,000 (unindexed) | IT-201-I (2025) line 29, "Beneficiaries": "you may make this subtraction if the decedent would have been entitled to it, had the decedent continued to live, regardless of your age"; the decedent's $20,000 is shared among beneficiaries by value; the beneficiary's share is separate from their own exclusion. Sole beneficiary assumed (decision 4). |
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
