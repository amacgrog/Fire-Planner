# E1d: one-time income tax treatments (US) — design

Date: 2026-10-09. Owner decisions from the brainstorm of this date, revised the same day after an independent Opus
review of `41fd93a` (decisions 7-10, section 12). Base: `14dde9a` on `claude/batch-3b-penalty-rules`
(US V125, Canada V59; E1c merged as `24defcd`). US only; no shared-region change; Canada untouched.

## 1. Where this sits

E1 is split into E1a (done, V122) -> E1b (done, V124) -> E1c (done, V125) -> **E1d (this spec)** -> **E1e** (inherited
traditional IRA / 401(k); split out of E1d by the owner on 2026-10-09, section 11), plus E1-CA later (E1a spec section 1).
E1d gives each one-time income (lump sum) a tax treatment. Today every lump is tax-free cash.

**Generality rule (owner):** mechanics as pure functions over passed-in rules, country-neutral state keys, and a Canada port
section (section 10).

## 2. Today (`Planner_US.html` at `14dde9a`)

- Rows are `{ amount, age, flat }` (`DYN.oneTimeIncome` ~14699, US-only spec; the shared `23-dynFieldHtml` renders it).
  The note says "Tax-free lump sums received at a specific age."
- `normalizeLists` (shared region `01-LIST_MAX`, ~1014) cleans the three keys and drops every other key, so a new key must be
  read from `raw` by a US-only pass (the `normalizeUsStreams` pattern, ~1145).
- `listAmountsForYear` (~10140): `oneTimeAmount` = sum of `amount x (flat ? 1 : factor)` over rows with
  `Math.round(age) === age` (Partner A's age). The year loop adds it to cash after the draws are set up
  (`bal.cash += oneTimeAmount`, ~10886) and `sweepExcessCash` moves the excess into taxable at full basis. It is not part of
  the year's `flow`, the tax profile, or MAGI.
- Income streams, by contrast, enter `wages` (~10463) and so `flow` in both strategies, and `row.wages` (the Sankey's
  "Wages" source).
- `taxFor` (~6710) adds `profile.invQual` to `gains` at the top; NIIT is `niitTax(ordinary + gains, gains + invOrd, status)`
  in the joint and one-person branches; the two-filer branch splits gains 50/50 (`gainA = gains / 2`). `returnMagis` (~7308)
  also splits the discretionary gain 50/50.

## 3. Decisions (owner, 2026-10-09)

1. **The inherited traditional IRA / 401(k) is its own sub-batch, E1e** (option C of three). E1d's inputs leave room for it as
   a fifth kind; section 11 records the shape the brainstorm preferred (a real account) as E1e's starting point.
2. **Four kinds per lump:** tax-free (default; every legacy row), wages (severance, a bonus: payroll tax), ordinary income with
   no payroll tax (nonqualified deferred compensation and similar compensation; revised after the review: a pension lump sum
   and an annuity payout are not this kind, section 9), long-term capital gain with a gain share. (Rejected: three kinds with a "subject to payroll tax" checkbox.)
3. **An owner per taxable lump** (Partner A / B, the stream rows' control), hidden in single-person mode and for the tax-free
   kind, default A. Timing stays "Received at Partner A age". A dead owner's wages or ordinary lump goes to the survivor as
   ordinary income with no payroll tax (income in respect of a decedent); a dead owner's gain lump is tax-free (stepped-up
   basis; the owner is assumed to have owned the asset alone). The owner is dead from the death year on (decision 10). (Rejected: no owner, everything on A's return.)
4. **NIIT on the gain kind:** a checkbox on gain rows, "Active business (no NIIT)", default off. Ticked, the gain is left out
   of net investment income but stays in MAGI. (Rejected: always apply NIIT; never apply it.)
5. **Taxable lumps enter the year's cash flow** like a stream (they pay their own tax and the year's needs first; a surplus
   goes through the existing surplus path; the guardrails are kept out of a lump year, decision 7). Tax-free lumps keep
   today's path exactly. (Rejected: today's path for every kind, which records the lump's tax as a guardrail withdrawal and,
   in a down year of the bucket strategy, pays it from cash and bonds; every lump into the flow, which moves legacy saves.)
6. **Approach:** a pure splitter `lumpAmountsForYear(lumps, ctx, out)` beside `streamAmountsForYear`, with a module scratch
   output (approach 1 of three; rejected: lumps as one-year streams, which would need guards against stream coverage,
   premiums and contributions and has no gain kind; the split inline in `listAmountsForYear`).
7. **Guardrails in a lump year (after the review; option A1):** a year with a taxable lump (`LUMP_OUT.flowTotal > 0`) records
   no guardrail withdrawal and no `firstWithdrawal`, as a retired surplus year (`flow >= 0`) already records nothing today.
   The guardrail baseline (`initialWR`) comes from the first retired deficit year without a taxable lump, and the next year's
   multiplier reads the last recorded year. Reason: with the lump in the flow, `wd.need` shrinks by the lump's net, so a
   severance in the retirement year would set a very low baseline rate and later years would be cut toward 0.5x. (Rejected,
   A2: record the need without the lump and its tax, which needs a second `buildTaxProfile`, `payrollTax` and `taxFor`
   per pass in lump years.)
8. **Asset-specific state rules for gains are not modeled in E1d (option B1).** A gain lump is a gain to every state row,
   as a brokerage gain is (Washington's row, whose law excludes real estate, taxes a real-estate gain lump; Colorado's and
   Oklahoma's in-state property and business deductions are not applied). The gain tip says so, naming Washington. The fix
   belongs to E5 (real assets), which needs asset-specific state treatment for home and rental sales. (Rejected, B2: a
   "Real estate" checkbox and a new `STATE_RULES` base field in all 51 rows now.)
9. **Only the gain share of a gain lump enters the flow (option C1);** the basis part goes to cash as a tax-free lump does.
   The gain still covers its own tax, less of the lump shows as "Wages", and `gainPct` 0 is simply tax-free. (Rejected,
   C2: the whole amount through the flow.)
10. **The death year counts as after death (option D1),** as for streams (`deadA = deceasedIsA && year >= deathYear`,
    ~10439; `tests/survivor_salary.js`): a lump in the death year is the survivor's (wages and ordinary without payroll tax,
    a gain tax-free). (Rejected, D2: the death year as before death, which needs a second dead flag and care with the
    survivor remap in that year.)

## 4. Facts (primary sources; retrieved 2026-10-09)

- **Severance pay is FICA wages.** *United States v. Quality Stores, Inc.*, 572 U.S. 141 (2014), syllabus: "The severance
  payments at issue are taxable wages for FICA purposes" (Cornell LII, supremecourt/text/12-1408).
- **Nonqualified deferred compensation pays FICA when deferred or vested, not when paid.** IRC 3121(v)(2)(A): an amount
  deferred under a nonqualified deferred compensation plan is taken into account for FICA "as of the later of" when the
  services are performed or when there is no substantial risk of forfeiture; (B): an amount so taken into account (and the
  income attributable thereto) "shall not thereafter be treated as wages". The payment is ordinary income (wages for income
  tax) without FICA at payout in the usual case: the rule holds only when the amount was properly taken into account when
  it vested (Treas. Reg. 31.3121(v)(2)-1(d), not retrieved). The (A) and (B) quotes were checked in the LII text of 26 USC
  3121 retrieved 2026-10-09 by the spec owner (the reviewer's retrieval came back truncated).
- **NIIT.** IRC 1411(b): threshold $250,000 joint or surviving spouse, $200,000 otherwise (not indexed; already
  `NIIT_THRESHOLD`). 1411(c)(1)(A)(iii): net investment income includes net gain from the disposition of property "other than
  property held in a trade or business not described in paragraph (2)"; (c)(2): paragraph (2) businesses are passive
  activities and trading in financial instruments or commodities. So gain on property held in an active (non-passive)
  business is not net investment income. (c)(4): for an interest in a partnership or S corporation the gain counts only to
  the extent the entity's own assets would give net investment income on a sale (an active business: mostly none). (c)(5):
  distributions from 401(a), 403(a), 403(b), 408, 408A and 457(b) plans are not net investment income (for E1e).
  1411(c)(1)(A)(i): annuities are net investment income (so an annuity payout is not the ordinary kind; section 9).
  NIIT's MAGI is AGI (plus a foreign-earned-income add-back, not modeled), so an excluded gain still counts toward the
  threshold test.
- **Stepped-up basis.** IRC 1014(a)(1): property acquired from a decedent takes the fair market value at the date of death as
  its basis. 1014(c): no step-up for a right to receive income in respect of a decedent. Property held jointly by spouses
  in a common-law state steps up only half (1014(b)(9) with 2040(b), per the review; not re-retrieved): the model assumes
  the dead owner owned the asset alone.
- **Income in respect of a decedent.** IRC 691(a)(1): such income is included in the gross income of whoever acquires the
  right to it (the estate, or the person who receives it by reason of the death), for the year received.
- **Home sale exclusion.** IRC 121(a): gain on a principal residence owned and used 2 of the last 5 years is excluded,
  up to $250,000 (121(b)(1)), $500,000 on a qualifying joint return (121(b)(2)), and $500,000 for a surviving spouse who sells
  within 2 years of the death (121(b)(4), per the review). A gain above it is a long-term gain lump.
- Early-withdrawal penalties (per the review, LII 26/72): a pension lump sum before 59 1/2 owes the 10% under 72(t)(1)
  (exceptions in 72(t)(2)(A), including (i) age 59 1/2, (ii) after death, (v) separation after 55), and an annuity payout
  under 72(q)(1). Neither is the ordinary kind.
- Not checked (approximation stated in section 9): wages paid after death in the year of death are FICA wages; the model
  charges no payroll tax on a dead owner's lump at all.

## 5. Inputs and stored state (US)

### 5.1 Row fields (`DYN.oneTimeIncome`, US-only spec)

Existing: `amount` (money), `age` (Received at Partner A age), `flat` (Fixed amount). New, in this order after `amount`:

- **`kind`** (`kind: 'select'`, the E1b field type): `'free'` Tax-free (default), `'wages'` Wages (severance, bonus),
  `'ordinary'` Ordinary income, no payroll tax, `'gain'` Long-term capital gain.
- **`owner`** (`kind: 'select'`, `[['A', 'Partner A'], ['B', 'Partner B']]`): `showIf` kind is not `'free'` and not
  single-person mode (the stream rows' rule).
- **`gainPct`** (`kind: 'num'`, 0-100, step 1, default 100), label "Gain share of the amount, %": `showIf` kind `'gain'`.
- **`activeBusiness`** (`kind: 'check'`), label "Active business (no NIIT)": `showIf` kind `'gain'`.

`fresh()` returns `{ amount: 0, age: 65, flat: false, kind: 'free', owner: 'A', gainPct: 100, activeBusiness: false }`.

Copy (written from what the engine does):
- Note: "Lump sums received at a specific age, each with its own tax treatment."
- List tip: tax-free lumps (an inheritance of cash, investments or a house, whose basis steps up to the value at death; life
  insurance; a gift received; a home-sale gain within the $250,000 / $500,000 exclusion ($500,000 also for a surviving spouse selling within two years); a sale at cost) are added to cash;
  taxable lumps are income of the year received and pay their own tax first. Amounts in today's dollars unless Fixed amount.
- `kind` tip: Wages: severance or a bonus; taxed on the owner's return with Social Security and Medicare tax (sharing the
  owner's wage base with their salary); counts as earned income for the child tax credit; no 401(k) or IRA contribution is
  made from it. Ordinary income, no payroll tax: nonqualified deferred compensation (its payroll tax was normally paid when it
  vested) or similar compensation, a taxable prize or award; not a pension or annuity payout (not modeled). Long-term capital gain: the sale of a business, a rental or
  other property held over a year; only the gain share is taxed, at long-term rates; the state taxes it as it taxes investment gains, with no
  rule for real estate or a business (Washington's capital gains tax excludes real estate, but the planner charges it); a part
  taxed as ordinary income (depreciation recapture, inventory) goes in a separate ordinary lump. If the owner has died
  (in that year or earlier), wages and ordinary income are taxed to the survivor without payroll tax, and a gain is tax-free
  (the basis of an asset the owner held alone steps up at death). Every kind raises the year's income for the ACA premium credit and, two years on, IRMAA.
- `gainPct` tip: the sale price less the basis (what was paid plus improvements, less depreciation), as a share of the
  amount; the rest comes back tax-free.
- `activeBusiness` tip: tick for the sale of a business you actively run (or your interest in a partnership or S corporation
  that runs one): the 3.8% net investment income tax does not apply to that gain. Leave it unticked for a rental, a passive
  investment or other property; the gain still counts as income for the tax's threshold, the ACA and IRMAA.

### 5.2 Normalization and legacy

`normalizeUsLumps(s, raw)` (US-only, just below `normalizeUsStreams`, called where that one is) reads `raw.oneTimeIncome`
exactly as `normalizeUsStreams` reads its list (~1145): for a legacy save (`'otherIncomeEnabled' in raw`) it ignores the raw
rows (`src = []`), else it takes the object rows in order; row i of the kept list reads `src[i] || {}`. It writes onto each
kept row:
- `kind`: one of `'free' | 'wages' | 'ordinary' | 'gain'`, anything else (missing included) `'free'`;
- `owner`: `'B'` only for a literal `'B'`, else `'A'`;
- `gainPct`: a finite number clamped to 0-100, else 100;
- `activeBusiness`: `true` only for a literal `true`.

So every legacy row is tax-free, owner A, and its numbers are byte-identical.

**Raw rows in the engine (review finding 2).** Tests load state with `Object.assign`, not `normalizeState`
(`tests/snapshot.js:78`; `R oneTimeIncome` has rows `{ amount, age, flat }`), so the engine must not depend on normalized
keys: `lumpAmountsForYear` treats any `kind` other than `'wages'`, `'ordinary'` or `'gain'` as tax-free and any owner other
than `'B'` as A (the `streamAmountsForYear` idiom, ~10117), and reads `gainPct` and `activeBusiness` only on a gain row. The `oneTimeIncome` list stays out of the MCP
schema (as today).

## 6. Engine (US)

### 6.1 `lumpAmountsForYear(lumps, ctx, out)` (pure, scratch `LUMP_OUT`, no allocation)

Called from `listAmountsForYear` with `STREAM_CTX` (ages, `deadA/deadB`, `single`, `factor`). For each row with
`Math.round(row.age) === ctx.ageA`, `amt = row.amount x (row.flat ? 1 : ctx.factor)` (bit for bit today's expression). Then:

- `kind` not `'wages'`, `'ordinary'` or `'gain'` (missing included): `out.taxFree += amt`.
- Owner: A in single-person mode or for any owner but `'B'`, else B. `dead` = that owner's dead flag (true from the
  death year on, decision 10).
- `'wages'`: alive: `out.wagesA/B += amt` on the owner's slot; dead: `out.otherA/B += amt` on the living partner's slot
  (the slot rule `streamAmountsForYear` uses for not-earned streams).
- `'ordinary'`: `out.otherA/B += amt` on the owner's slot, or the survivor's when the owner is dead.
- `'gain'`: alive: `g = amt x gainPct / 100` (`gainPct` clamped to 0-100 here too, a non-finite value read as 100);
  `out.gainA/B += g`; if `activeBusiness === true`, `out.gainNoNiitA/B += g` (same owner); the basis part `amt - g` goes to
  `out.taxFree` (decision 9). Dead: `out.taxFree += amt` (stepped-up basis).
- `out.flowTotal` = the sum of `wagesA/B`, `otherA/B` and `gainA/B` (the gain share only). It is the one gate: a year is a
  lump year when `flowTotal > 0`, so a `gainPct` 0 row (all basis) is simply tax-free and no cash can be lost.

`oneTimeAmount` returned by `listAmountsForYear` becomes `out.taxFree` (unchanged for a legacy save: every row is free).
The sum starts at 0 and runs in list order, so it is the old `reduce(..., 0)` bit for bit when every row is free.

### 6.2 Cash flow

`wages` (~10463) adds `LUMP_OUT.flowTotal` beside `extraIncome` (only when it is above 0), so it enters `flow` in both
strategies (standard and bucket) and `row.wages`. The tax-free part (tax-free rows, gain basis, a dead owner's gain) keeps
`bal.cash += oneTimeAmount` (~10886). A taxable lump's tax is in `tax`, inside `flow`; a surplus is routed by the existing
surplus path.

**Guardrails and `firstWithdrawal` (decision 7).** In a lump year (`flowTotal > 0`) both sites that record the year's need,
the deficit branch (~10917-10918) and the forced pass (~11109-11111), skip `firstWithdrawal` and `recordGuardrailWithdrawal`.
In the forced pass the restore `guardrails.initialWR = guardrailSnapshot.initialWR` still runs (it undoes the deficit branch's
record, which a lump year never made, so it is a no-op there). Everything else in those branches runs as before.

**`row.income`.** `totalIncome` (~10809, ~10943) adds `lumpGainA + lumpGainB` in a lump year (wages and ordinary lumps are
already in it through `otherA/B`).

### 6.3 Tax profile, payroll tax, `taxFor`

- **Wages kind:** `buildTaxProfile`'s and `payrollTax`'s `streamWagesA/B` arguments, and the wage argument of each
  `selfEmploymentTax` call (~10450, ~10454: the Social Security wages that use up the wage base before self-employment),
  receive `streams.wagesA/B + LUMP_OUT.wagesA/B` (not the `streams` object: a lump creates no coverage, no premium and no contribution, and
  `streamPlanContributions` never sees it). Effects through existing code: Social Security tax to the owner's wage base shared
  with salary and W-2 streams, Medicare and the Additional Medicare Tax, earned income for the ACTC (`profile.wageA/B`), state
  wages.
- **Ordinary kind:** `streamOtherA/B` receive `streams.otherA/B + LUMP_OUT.otherA/B`: the owner's (or survivor's) `extraA/B`,
  moved by the survivor remap as today.
- **Gain kind:** new profile fields `lumpGainA/B` and `lumpGainNoNiitA/B` (the survivor remap moves B's to slot A as it
  moves `extraB`; a dead owner's gain never reaches the profile, section 6.1). In `taxFor` the lump gain is added inside each branch, never at the top beside
  `invQual` (the top value feeds the two-filer branch's 50/50 split, `gainA = gains / 2`, ~6884):
  - joint and one-person branches: the branch's gain becomes `gains + lumpGainA + lumpGainB`; every reader of the branch's
    gain sees it: Social Security provisional income, `longTermGainTax`, `sources.gains`, `federalDeduction`'s income,
    QBI's `netGain`, the lagged pass `federalLiabilityForState`, and `niitTax`, whose net investment income argument
    leaves out `lumpGainNoNiitA + lumpGainNoNiitB` (its MAGI argument keeps them);
  - two-filer branch: `gainA = gains / 2 + lumpGainA`, `gainB = gains / 2 + lumpGainB`, and every per-return reader uses
    them: each return's provisional income, `longTermGainTax`, `sourcesA/B.gains`, `federalDeduction`, QBI's `netGain`
    (~6966-6971), `federalLiabilityForState`, and `niitTax`, whose net investment income argument leaves out that return's
    `lumpGainNoNiitA/B`. The child credits stay on A as today.
  The plan lists each line it changes, by function and line, so the review can check none is missed.
- **MAGI:** `magiBase0` (~10565) adds `lumpGainA + lumpGainB` (wages and ordinary lumps are already in `otherA/B`);
  `returnMagis` adds `lumpGainA` to A's return and `lumpGainB` to B's. ACA, IRMAA (two years on, through
  `irmaaMagiHistory`), the conversion ceiling, `magiThresholds` and the cliff plan read these, so they see the lump with no
  further wiring.
- **Roth conversion:** the year's bracket fill reads the profile's ordinary income, so a wages or ordinary lump year converts
  less (correct). A gain lump stacks on top of ordinary income as investment gains already do; the fill leaves gains out of
  Social Security provisional income (~7397-7406), so in a large gain-lump year it can convert past the bracket and push the
  gain out of the 0% band (section 9).
- **Profiles built elsewhere** (`lambdaEstimate` samples, the Roth solver and optimizer literals) carry no lump fields and
  must read a missing field as 0; a future lump is not priced by lambda (section 9).

### 6.4 Exactness and speed

- With no taxable lump (every legacy save, and any household whose lumps are all tax-free) every new term is skipped, not
  added as a zero (the E1c 9c rule): one test per year in the loop (`LUMP_OUT.flowTotal > 0`) and one per `taxFor` call.
  Both object literals in `buildTaxProfile` (~8836, ~8879) always carry `lumpOn` and the four `lumpGain*` fields (false and
  zeros outside a lump year), so the profile's shape is the same every year (review finding 10). `taxFor` and `returnMagis`
  read the fields only when `profile.lumpOn === true`. A profile built elsewhere (lambda samples, the Roth solver and
  optimizer literals) has no flag and is valid as it is: absent reads as no lump, so no literal needs editing.
- `LUMP_OUT` is reset per call and reused; the list is scanned once a year as today.
- No snapshot entry may move in any E1d commit. Timing: `tests/bench_runs_interleaved.js`, 21 rounds, +5% per path, the
  median of three runs on a quiet machine.

## 7. Tests and gates

- **`tests/lump_income.js`** (new, in `npm test`; hand-computed):
  - `lumpAmountsForYear`: each kind; a row with no `kind` and no `owner` (as `Object.assign` loads it) is tax-free; owner B;
    single-person mode (owner forced A); a dead owner, including in the death year (wages and ordinary to the survivor's
    ordinary slot, a gain to tax-free); `flat` and inflated amounts; `gainPct` 0 (all to `taxFree`, `flowTotal` 0), 40 and
    100; `activeBusiness`; `flowTotal`.
  - Engine, clock pinned: a severance year (Social Security tax to the wage base shared with a salary, Additional Medicare
    Tax, the ACTC with a child); a deferred-compensation year (no payroll tax, same income tax); a gain lump in the 0%, 15%
    and 20% bands; NIIT on and with `activeBusiness` (MAGI unchanged, NIIT lower by 3.8% of the excluded gain over the
    threshold); a two-return year with an owner-B gain (B's return carries it); an ACA year where an ordinary lump crosses
    the 400% line (premium at the realized MAGI); IRMAA two years on; a state whose `base` treats gains specially (a
    separate gain rate or a gain deduction) and Washington (the gain lump charged as a brokerage gain, decision 8); a
    surviving partner receiving a dead owner's lump.
  - Review finding 7 cases: a self-employed owner receiving a wages lump (SE tax on the wage base left after it); QBI with a
    gain lump on one return and on two returns (`netGain` includes the owner's lump gain); the lagged federal pass in a
    two-return year with a lump gain (a state row that deducts federal tax); B's wages lump in a two-return year (B's payroll
    tax and wage base; the child credits still on A); a row with no `kind` loaded through `Object.assign` gives today's numbers.
  - Cash conservation: in a lump year, end-of-year balances equal those of the same scenario with the lump as tax-free plus
    the taxable share less its added tax (payroll and income), within a cent; with `gainPct` 0 the two runs are identical.
  - Guardrails (decision 7): guardrails on, a wages lump in the retirement year: `initialWR` is not set in the lump year and
    is set by the first retired deficit year without a lump; `firstWithdrawal` is not recorded in the lump year; a lump in a
    later retired year leaves `prevNeed` / `prevPortfolio` at the previous recorded year (the guardrail state read through a
    test hook after each year).
- **`tests/legacy_state.js`:** new corpus cases (a junk `kind`, owner missing or `'b'`, `gainPct` -5 / 250 / `'x'`,
  `activeBusiness: 'yes'`, a legacy `otherIncomeEnabled` save with lumps), pinned in `tests/snapshots/legacy_state.json`.
- **`tests/field_registry.js`, `tests/snapshot_ui.js`:** the new row fields, show/hide by kind and single-person mode, a reload
  round trip.
- **Snapshots:** new scenarios (one per taxable kind, an `activeBusiness` gain, a two-return owner-B gain, a dead-owner lump),
  added in the last engine commit; no existing entry moves (dump/compare against the base). No baseline scenario depletes
  earlier.
- **`test_lump_income.js`** (Playwright, repo root, not in CI): the kind select, owner, gain share and checkbox show and hide;
  changing the kind changes `window.fireProjectionRows` (tax and `wages` in the lump year).
- US version badge bumped; README feature list; a `CLAUDE.md` paragraph (the splitter and its plumbing); E1d notes in
  `docs/next-batches-plan.md`.

## 8. Commits

1. Inputs and `normalizeUsLumps` (markup via the DYN spec, defaults, legacy corpus); no number change.
2. `lumpAmountsForYear`, the cash flow, the profile, `payrollTax`, `taxFor`, `returnMagis`, `magiBase0`; `tests/lump_income.js`;
   no existing snapshot entry moves.
3. New snapshot scenarios, timing record, docs, version badge.

## 9. Not modeled

- Depreciation recapture and other ordinary parts of a sale (enter as an ordinary lump); installment sales; the section 1202
  (QSBS) exclusion; the section 1411(c)(4) look-through beyond the all-or-nothing checkbox.
- A pension lump sum not rolled over and an annuity payout (the 10% early-withdrawal penalty under 72(t) / 72(q), state
  pension exclusions, and, for an annuity, the NIIT); retirement-account money comes with E1e.
- 401(k) or IRA contributions from severance; the supplemental-wage withholding rate (withholding is timing only).
- Payroll tax on wages paid after death in the year of death, and a lump received in the death year before the death (the
  whole death year counts as after death, decision 10).
- Jointly held property of spouses (the step-up of half in a common-law state; community property): a dead owner's gain
  lump is treated as solely owned.
- A future lump in `lambdaEstimate`'s sample years. A lump in the final projection year is in `endTax.profile` (~11328),
  which prices the after-tax end value the cliff plan scores with.
- The Roth bracket fill's provisional income leaves out gains (~7397-7406), so a large gain-lump year can convert past
  the target bracket.
- Asset-specific state treatment of a gain (decision 8; E5).
- A year with a taxable lump records no guardrail withdrawal (decision 7).
- The Sankey and table show a taxable lump inside "Wages" (the shared Sankey and table are not changed; not-earned streams
  already appear there).
- Gift and estate tax; income averaging; state rules beyond what `STATE_RULES` does with wages, other income and gains.
- The inherited traditional IRA / 401(k) and an inherited Roth (E1e).

## 10. Canada port (E1-CA)

`lumpAmountsForYear` is reused with Canada's kinds (facts to confirm when E1-CA is designed): tax-free (inheritances,
including a parent's RRSP/RRIF, which is taxed on the deceased's final return so the heir receives after-tax cash; life
insurance; gifts; a gain sheltered by the principal residence exemption); employment income (CPP/QPP and EI through
`payrollItems`); ordinary income without payroll items (a retiring allowance; the RRSP transfer for pre-1996 service not
modeled); capital gain with a gain share at the 50% inclusion rate (the lifetime capital gains exemption not modeled). No
NIIT equivalent, so no checkbox. Income-tested benefits (`benefitsFor`) and the OAS recovery tax see the lump through the
profile. The owner select and the dead-owner rule carry over (Canada taxes each spouse separately, so the owner always
matters).

## 11. E1e: inherited traditional IRA / 401(k) (own sub-batch; starting point, not decisions)

Preferred shape from the brainstorm (option A): a real account, `bal.inheritedTrad`, opened at receipt, growing at the year's
stock return in every run mode, paying a scheduled ordinary-income draw to cash each year, empty by the end of the tenth year
after the year of death. No 10% penalty at any age (IRC 72(t)(2)(A)(ii), confirmed by the E1d review); outside the household's own RMDs and its Roth
conversions; not net investment income (IRC 1411(c)(5)); counted in net worth and the after-tax estate value. A fifth `kind`
on the one-time income row would open it. Open questions for E1e's brainstorm: the draw schedule (even, or shaped as a Batch 5
lever); annual RMDs within the 10 years when the decedent died on or after the required beginning date (final regulations
under the SECURE Act, Treas. Reg. 1.401(a)(9)-5, to confirm); eligible designated beneficiaries (a sibling not more than 10 years younger);
an inherited Roth (tax-free, 10-year rule, no annual RMDs); `singleLifeDivisor` only covers ages 18-65 today.

## 12. Review record (independent Opus review of `41fd93a`, 2026-10-09)

Two blocking findings, both fixed above: (1) the guardrails and `firstWithdrawal` would read a lump year's smaller need
(decision 7); (2) tests load raw rows through `Object.assign`, so the engine treats a missing `kind` as tax-free (section
5.2), and the `gainPct` 0 gate could lose cash (one gate, `flowTotal`, section 6.1). Should-fix findings adopted: the
ordinary kind's examples (an annuity is net investment income; a pension lump and an annuity owe early-withdrawal penalties;
section 9); the asset-specific state rules (decision 8); the self-employment tax wage base (section 6.3); the lump gain
inside each `taxFor` branch with every reader named (section 6.3); the missing tests (section 7); the owner decisions the
first draft made silently (decisions 7-10). Minor findings adopted: the law notes (section 4), a fixed profile shape (section
6.4), E1b's legacy alignment copied exactly (section 5.2), `row.income` (section 6.2), the Roth fill's provisional income
and the final-year end value (section 9). The reviewer confirmed the Quality Stores sentence, 1411(b), (c)(1)(A)(iii) and
(c)(2), 121(b)(1)-(2) and 72(t)(2)(A)(ii); the spec owner's 3121(v)(2) text (retrieved the same day) covers the quote the
reviewer could not re-retrieve. What holds per the review: legacy numbers bit-exact once finding 2 is fixed; the MAGI
plumbing complete through `magiBase0` and `returnMagis`; wages lumps through the stream arguments reach every payroll and
earned-income reader without touching contributions or coverage; ordinary lumps follow not-earned streams; `bondTarget`,
the refill cap and surplus routing unchanged by design; the same flow in both strategies.
