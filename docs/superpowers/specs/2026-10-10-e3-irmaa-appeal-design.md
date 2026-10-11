# E3: IRMAA appeal for a life-changing event (form SSA-44; US only) — design

Date: 2026-10-10. Owner decisions 1-8 from the brainstorm of this date. Base: `ea78ef6` on `claude/batch-3b-penalty-rules`
(US V129, Canada V60). US only: no shared region and no Canada change. The review record is section 11.

## 1. Where this sits

Batch E (life events) in `docs/next-batches-plan.md`: E1 (E1a to E1e) and E2 are done; E3 is this item; E4 (state relocation)
follows and waits for E3's merge. The plan's E3 text: IRMAA always uses MAGI from two years earlier (the healthcare callout says
appeals are not modeled); model the two common appeals, a work stoppage (a retiree first charged on their last salary years) and
a spouse's death (the survivor charged on the old joint MAGI against the single tiers): the charge uses the current year's MAGI
instead; no new input. The research (section 4) changed the second half of that text: the survivor's single-tier charge is an
engine error, not the real exposure (decision 1).

## 2. Today (`ea78ef6`)

Every IRMAA reader in `Planner_US.html`, confirmed in the code:

- **The charge** (`healthcareCost`, args from the year loop's `hcArgs`). Per partner on Medicare this year
  (`medicareEligibleA/B`: 65 or over, no employer coverage, alive). If the lookback year had two returns
  (`irmaaLookbackSplit(irmaaHistoryA, irmaaHistoryB, twoReturnHistory, year)` not null): each person's own Medicare MAGI from
  that year against the single tiers. Else `irmaaLookbackMagi(irmaaHistory, year)` against **this year's** `filing`:
  `irmaaSurcharge(lookbackMagi, filing, year)`. The tier table is the charged year's (`irmaaTiers(filing, yearIndex)`).
- **The lookback** (`irmaaLookbackMagi`, `irmaaLookbackSplit`). Years 0 and 1: the household's entries `irmaaMagiPrior2` /
  `irmaaMagiPrior1` when `irmaaPriorKnown` (split evenly on two returns), else year 0's own Medicare MAGI (`magiHistory[0]`).
  From year 2: the realized Medicare MAGI of year t-2.
- **The history** (`runProjection` locals): `irmaaMagiHistory`, `irmaaMagiHistoryA/B`, `magiHistoryA/B`, `twoReturnHistory`.
  Written provisionally in every MAGI pass just before `healthcareCost` (only year 0's stand-in reads the provisional value, and
  it is not held to convergence: it does not set `estUsed`), and overwritten with the realized values after convergence.
  Medicare MAGI is `irmaaMagiOf(magi, ss, filing)` on the year's own return (`irmaaSsH`, `irmaaStA`).
- **The MAGI iteration.** `healthcareCost` returns `usesMagiEstimate` (true only for an ACA premium today); the year loop ORs it
  into `estUsed`. `costAt(trad, gain, ...)` re-prices `healthcareCost` at another MAGI (forced pass, cliff-plan trials); the
  forced pass charges the cost at the realized MAGI and refunds the difference to cash.
- **The cliff plan.** `irmaaAt` prices the charge this year's MAGI sets two years on (`medA/medB`, `irmaaFiling2()`, tiers
  scaled by `irmaaGrowth2`). `magiThresholds` puts the IRMAA lines (`irmaa1..5`, family `irmaa`) on the charged year's edges:
  the call site passes `irmaa: { filing: irmaaFiling2(), a: medA, b: medB }, irmaaGrowth: irmaaGrowth2`. The trials' `cliffCost`
  is `healthcare + irmaaAt(...)`; `healthcare` is this year's full cost, so an in-year charge is already in the comparison.
  `irmaaChecks` / `planStats.irmaaZeroSaving` are statistics only.
- **The conversion ceiling** (`conversionMagiCeiling`): keeps this year's Medicare MAGI inside its current tier on this year's
  edges and filing (`irmaaTierCeiling`), for a retired partner 63 or over. **`lambdaEstimate`**: each sample year prices IRMAA
  on its own MAGI. Neither reads the lookback.
- **Filing status** (`filingStatusFor`): a survivor of a married couple is `mfj` in the death year, `qss` for two years with a
  qualifying child, else `single` / `hoh`. `FILING`'s `irmaa` family maps `single`, `hoh` and `qss` to the single tiers.

Consequence: the charged year's filing and the lookback return's filing map to different IRMAA tables only in the two years
after a death (D+1, D+2), whose lookback returns (D-1, D) are joint. In every other year the two map to the same table (a
marry-later couple's pre-wedding lookback years go through the per-person split).

Events the engine can date: each partner's retirement age (`retireAgeA/B`, clamped to the death age; the first year without
wages or self-employment), each work stream's age window (`state.incomeSources`, kind `wages` or `self`, owner A/B, inclusive
`startAge..endAge` on the owner's age; `streamAmountsForYear`), and the survivor-modeling death year (`deathYear`).

## 3. Decisions (owner, 2026-10-10)

1. **The lookback uses the filing status of the lookback year's return**, as SSA does (section 4.4). Built first, on its own,
   with its own movers table: only survivor scenarios move (D+1 and D+2). For the plan's first two years with entered prior
   MAGIs the return's status is unknown: this year's status is assumed (as today).
2. **Events: a main-job retirement, the end of a work stream, and a spouse's death.** The end of any job counts, also while
   another job continues (418.1205(d): stop working or reduce hours). Not-earned streams, marriage, work reduction within a job,
   pension loss, property loss and employer settlements are not events (section 10). Divorce and cars stay excluded from Batch E
   (owner, unchanged).
3. **Which year and for how long: the lowest allowed charge in premium years E and E+1** (E = the first year after the event).
   Year E: the normal lookback or year E's own MAGI. Year E+1: the normal lookback, year E's MAGI, or year E+1's own MAGI.
   Each candidate uses its own year's filing status. The charge is on realized MAGI (SSA corrects estimates to the return).
4. **Always assumed, no new input.** The household files the appeal whenever it lowers the charge.
5. **Only events inside the plan.** A retirement or a stream end counts when its last working year is plan year 0 or later
   (E >= 1); a death counts in any plan year (E = `deathYear` >= 0). The entered prior-year MAGIs stay the normal lookback of
   years 0 and 1 and compete in the minimum. The year-0 stand-in's missing convergence is a known limitation, not fixed here.
6. **The MAGI iteration.** The in-year candidate is priced from the pass's own MAGI inside `healthcareCost` (so `costAt`, the
   forced pass and the trials price it unchanged) and sets `usesMagiEstimate`, so the year converges. Two-return years: per
   person, own return, single tiers; a person's own event covers only their own charge. The conversion ceiling and
   `lambdaEstimate` are unchanged. A run without an event pays nothing (a null table).
7. **The cliff plan's IRMAA lines** in a year with an in-year candidate for a partner on Medicare: on this year's edges (growth
   1) and this year's filing, drawn for partners on Medicare now or two years on; ids unchanged. `irmaaAt` is unchanged (the
   effect of year E's MAGI on the E+1 charge is not scored; a Batch 5 note).
8. **Display.** A row whose charge the appeal lowered carries `irmaaAppeal`; the status cell's tooltip says so. Copy: the
   healthcare callout, the prior-MAGI tooltip, README, US badge V130. The snapshot changes are intended and are approved stage
   by stage: decision 1's movers, then the appeal's.

## 4. Facts (retrieved 2026-10-10)

### 4.1 The regulation: 20 CFR 418 subpart B (eCFR, version of 2026-10-01; https://www.ecfr.gov, title 20 part 418)

- 418.1135(a): SSA uses "your modified adjusted gross income provided by IRS for the tax year 2 years prior to the effective
  year"; (e): "We may use information that you give us about your modified adjusted gross income for a more recent tax year ...
  as described in 418.1201 through 418.1270."
- 418.1201: a more recent tax year is used "to reduce or eliminate your income-related monthly adjustment amount" when (a) "You
  experience a major life-changing event as defined in 418.1205"; (b) it "results in a significant reduction in your modified
  adjusted gross income for the year which you request we use and the next year, if applicable"; (c) you request it; (d) you
  give evidence.
- 418.1205, the events: "(a) Your spouse dies; (b) You marry; (c) Your marriage ends through divorce or annulment; (d) You or
  your spouse stop working or reduce the hours you work; (e) ... a loss of income-producing property, provided the loss is not
  at the direction of you or your spouse ... and is not a result of the ordinary risk of investment ...; (f) ... a scheduled
  cessation, termination, or reorganization of an employer's pension plan; (g) ... a settlement from an employer or former
  employer because of the employer's closure, bankruptcy, or reorganization." 418.1210: "We will not consider events other than
  those described in 418.1205 to be major life-changing events."
- 418.1215: a reduction is significant if it "reduces the percentage of the income-related monthly adjustment amount" or brings
  MAGI below the threshold; 418.1220: not significant "unless the reduction affects the amount".
- 418.1225: SSA asks for the filed return of the more recent year, or, if not yet filed, equivalent evidence (418.1265(c): an
  estimate, signed under penalty of perjury, with "your intended income tax filing status" when the event changes it).
- 418.1230(a): effective "January 1 of the year in which you make your request" (or the first month of Part B enrollment if
  later); (c): effective January 1 of the next year when the reduction starts only then.
- 418.1235: SSA uses the more recent year "for each year thereafter until ... (a) We receive your modified adjusted gross income
  from IRS for the more recent tax year we used or a later tax year; (b) ... a tax year more than 3 years prior to the ...
  effective year; (c) You request we use a more recent tax year based on another major life-changing event ...; or (d) You
  notify us of a change ...".
- 418.1140(d): "When we use modified adjusted gross income information that you provided due to a qualifying life-changing
  event and we receive different information from IRS, we will use the IRS information to make retroactive corrections to all
  months in the effective year(s)". 418.1265(d): an estimate is later verified against the return.

### 4.2 Form SSA-44 (rev. 12-2025; https://www.ssa.gov/forms/ssa-44.pdf, read in a browser 2026-10-10)

- Step 1 instructions: "The life-changing event date must be in the same year or an earlier year than the tax year you ask us
  to use". The table: Death of Your Spouse ("Your spouse died"), Work Stoppage or Reduction ("You or your spouse stopped working
  or reduced the hours that you work"), Marriage, Divorce/Annulment, Loss of Income-Producing Property, Loss of Pension Income,
  Employer Settlement Payment.
- Step 2 instructions, the tax year: "Choose this year (the 'premium year') - if your modified adjusted gross income is lower
  this year than last year ... use your estimate of your 2026 MAGI if: 1. Your income was not reduced until 2026; or 2. Your
  income was reduced in 2025, but will be lower in 2026." Or "Choose last year ... if your MAGI is not lower this year than last
  year." Each with "your actual or expected tax filing status for the year".
- Step 3: "Complete this step only if you expect that your MAGI for next year will be even lower. We will record this
  information and use it next year ... If you do not complete Step 3, we will use the information from Step 2 next year".
- Important Facts: an estimate is checked "with the IRS"; "We will use your estimate provided in Step 2 to make a decision about
  the amount of your income-related monthly adjustment amounts the following year until: IRS sends us your tax return
  information for the year used in Step 2; or ... You provide an updated estimate."

### 4.3 POMS HI 01120 (https://secure.ssa.gov/poms.nsf/lnx/0601120001 and the pages it links)

- HI 01120.005 (06/18/2013): the eight events; "a significant reduction in MAGI is a reduction that decreases or eliminates the
  [IRMAA] for a specific tax year"; a beneficiary with such an event "may request us to make a new initial determination using
  a more recent tax year".
- HI 01120.030 (06/10/2024), work stoppage: includes "retirement, lay-off, and/or sale of business"; the beneficiary may give
  "an estimate of MAGI and tax filing status for the tax year they are requesting SSA to use (current year or PY-1)" (PY = the
  premium year).

### 4.4 Filing status

418.1120(a): "We will determine your income-related monthly adjustment amount by using your tax filing status and modified
adjusted gross income"; (b): "We use your tax filing status and your modified adjusted gross income for the tax year to determine
which income-related monthly adjustment amount to apply"; (b)(1) the general tables cover single, head of household, qualifying
widow(er) with dependent child, and married filing separately living apart all year; (b)(2) the joint tables cover "married filing
jointly for the tax year". 418.1101 defines tax filing status as "the filing status shown on your individual income tax return".
So the tier table follows the return SSA uses, not the premium year's status. A survivor's D+1 and D+2 charges read the joint
returns of D-1 and D: joint tiers.

### 4.5 What this means for the engine (whole-year model)

The engine's events are at the start of a year: a partner retiring at 68 has no wages at 68 (year E) and full wages at 67; a
partner who dies in `deathYear` is absent all that year (the year's return is joint). So year E-1 and earlier are pre-event,
year E is the first post-event year, and the allowed years for premium year t are s in {t-1, t} with s >= E (the event in the
requested year or earlier; the requested year more recent than the lookback t-2). From t = E+2 the normal lookback (E) is
already post-event, so the appeal has nothing to add. 418.1235 (Step 2 carries over) is the s = E option of year E+1; Step 3 is
the s = E+1 option. SSA's retroactive correction (418.1140(d)) means the final charge rests on the realized MAGI of the chosen
year, which the engine has; the estimate's timing is not modeled. The household picks the lowest charge (418.1201: used only to
reduce the charge).

## 5. Design

### 5.1 Decision 1: the lookback filing history

- A new history array beside `twoReturnHistory`: `irmaaFilingHistory[year] = filing`, written at the same two places
  (provisionally in each pass, just before `healthcareCost`; and after convergence). The year's `filing` does not change between
  passes; the second write keeps the pattern uniform.
- `hcArgs` gains `irmaaFilingHistory`. In `healthcareCost`'s household branch, the tier filing becomes
  `irmaaLookbackFiling(irmaaFilingHistory, year, filing)`: `filing` when `year < 2 && state.irmaaPriorKnown` (entered returns,
  status unknown: decision 1), else `irmaaFilingHistory[Math.max(0, year - 2)]`.
- Outside survivor years D+1 / D+2 the two filings select the same `IRMAA_TIERS` row (`filingKey(f, 'irmaa')`), so
  `irmaaSurcharge` returns the identical double: no other number changes.
- `irmaaFiling2()` (the plan's charged-year filing for `irmaaAt` and the lines) is not changed in this stage: it estimates the
  charge two years on from year t's MAGI, whose return is year t's own, so its correct filing is year t's own `filing`, not the
  charged year's. **Correction made in the same stage:** `irmaaAt` and the `irmaa` argument of the lines call use `filing`
  (this year's return) for the tier table, keeping `medA/medB` (who is on Medicare two years on). In a non-survivor year the two
  map to the same table; the change moves only plan pricing in years D-1 and D (whose charges two years on are D+1 and D+2).
  This belongs to decision 1 (the same rule: the return's status picks the table).

### 5.2 The event table

At the top of `runProjection`, after `deathYear` and the death clamp of `retireAgeA/B`, and after `projectionYears` is known:

```js
// E3: the IRMAA appeal windows of this run (null when there is no event). Per person and plan year: 0 none, 1 this year's MAGI
// may replace the lookback (year E), 2 last year's or this year's (year E+1); kind: 1 job end, 2 retirement, 3 death.
const appeal = irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears });
```

`irmaaAppealTable` (pure apart from reading `state`; just above `healthcareCost`) returns `null` when no event exists, else
`{ codeA, codeB, kindA, kindB }` (four `Int8Array(projectionYears + 1)`; allocated once per run). Events, each with an owner and
a year index E:

- **Retirement** of partner X (X = A, or B when not `singlePerson`): `state.incomeX > 0` and `E = retireAgeX - state.ageX >= 1`
  (the clamped retirement age; a retirement at death is the death event's year too: both are kept, the kind rule below picks one).
- **Job end**: each `state.incomeSources` row of kind `wages` or `self` with `amount > 0` and `startAge <= endAge`; owner A in
  single-person mode, else the row's owner; `E = endAge + 1 - ownerAgeNow`, kept when `E >= 1`, `E <= projectionYears`, and the
  owner is alive in year E (`E < deathYear` for a deceased owner: a job ended by death is the death event).
- **Death**: `deathYear < Infinity`, `deathYear <= projectionYears`, and the couple married in `deathYear` (the same test as
  `filingStatusFor`: `state.marryLater ? state.ageA + deathYear >= state.marriageAgeA : state.filingStatus === 'mfj'`). The
  death of an unmarried partner is not an event (418.1205(a): "Your spouse dies").

Coverage: an event of owner X covers X, and covers X's partner when the couple is married in year E (same test; never in
single-person mode). A death event covers only the survivor. A partner who is dead in year t is never charged (unchanged), so
coverage of a dead partner is harmless.

For each covered person P and t in {E, E+1} within `[0, projectionYears]`: `codeP[t] = max(codeP[t], t === E ? 1 : 2)`. The
kind recorded for (P, t) is the event with the latest E covering t; on a tie: death, then retirement, then job end.

A test hook `window.__test_irmaaAppealTable()` returns the table of the current state (plain arrays) for `tests/irmaa_appeal.js`.

### 5.3 The charge (`healthcareCost`)

`hcArgs` gains: `appeal` (the table or null), `irmaaFilingHistory` (5.1), and the pass's IRMAA inputs `irmaaSsH`, `ssA`, `ssB`,
`irmaaStA` (the year loop's `irmaaSsH` / `irmaaStA` move above `hcArgs`; both are constant within the year).

For each partner P on Medicare this year (`medicareEligibleP`), the charge is today's normal charge (with 5.1's lookback filing),
and when `appeal !== null` and `c = appeal.codeP[year]` is not 0, the minimum of it and:

- **this year's MAGI** (`c >= 1`): one return, `irmaaSurcharge(irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year)`; two
  returns, P's own `irmaaSurcharge(irmaaMagiOf(magiP, ssP, P === A ? irmaaStA : 'single'), 'single', year)`. Reading it sets
  `usesMagiEstimate = true`.
- **last year's MAGI** (`c === 2`, `s = year - 1`): `twoReturnHistory[s]` ? P's own `irmaaMagiHistoryP[s]` on the single tiers :
  `irmaaMagiHistory[s]` on `irmaaFilingHistory[s]`; the tier table is this year's (`irmaaSurcharge(..., year)`).

The candidate is used only when strictly lower than the normal charge (decision 4); on a tie between the two candidates the
earlier year is reported. `premA/premB` (the two-return 162(l) base) receive P's final charge as today. The return value gains
`appealA` / `appealB` (the plan year used, or -1 when the normal charge stood) and `appealInYear` (true when a partner on
Medicare has `c >= 1` this year; independent of MAGI).

Medicare's MAGI on the household return is `irmaaMagiOf(magiProxy, irmaaSsH, filing)`, the expression the history already stores
(`irmaaMagiHistory[year] = irmaaMagiOf(magiProxy, irmaaSsH, filing)`), so a converged year's in-year charge equals the charge on
the stored realized value.

### 5.4 The MAGI iteration and the forced pass

No new estimate variable: the in-year candidate reads `hcArgs.magiProxy` / `magiA` / `magiB`, which the year loop sets from the
pass's estimate before `healthcareCost` and `costAt` sets from the pair it is pricing. `usesMagiEstimate` (5.3) feeds `estUsed`,
the pass log and the forced pass exactly as the ACA premium does. An IRMAA tier is a step up in cost as MAGI rises; a damped
iteration settles on one side of it, and a year that does not settle in `MAGI_ITER_MAX` passes takes the existing forced pass
(the pass that overpaid least, charged at its realized MAGI, the refund to cash). No change to the convergence test, the damping
or the snapshot lists: the candidates read only the pass's MAGI and the history of earlier years.

Survivor and two-return years need nothing extra: `magiProxy` is the survivor's MAGI after the remap, and the two-return MAGIs
come from `returnMagis`, as for the ACA.

### 5.5 The cliff plan (decision 7)

At the `magiThresholds` call in the withdrawal plan, when the year's `hcOut.appealInYear` is true the call passes
`irmaaGrowth: 1` and `irmaa: { filing, a: medA || medNowA, b: medB || medNowB }` (`medNowA/B`: the partners on Medicare this
year, returned by `healthcareCost` as `medicareA/B`); otherwise the call is unchanged (with 5.1's `filing`). The lines keep ids
`irmaa1..5` and family `irmaa`, so `apply` finds them by id in the same year's lines. `yearPlanCandidates`, the trial rules,
`irmaaAt` and `afterTaxValue` are unchanged.

Unchanged readers, by design: `conversionMagiCeiling` (already this year's tier and edges), `lambdaEstimate` (its samples price
IRMAA on their own MAGI), `irmaaChecks` / `planStats` (statistics; in an appeal year they still compare at the two-years-on
tiers).

### 5.6 Rows and display

After the year's final cost is charged (the year's `hcOut`, or `lastCost` after a forced-pass refund), a year where
`appealA >= 0` or `appealB >= 0` sets `row.irmaaAppeal = { a, b }`, each `null` or `{ taxYear, lookbackYear, event }`
(`taxYear = taxYearOf(appealP)`, `lookbackYear = taxYearOf(year - 2)`, `event` one of `'retirement'`, `'job end'`, `'death'`
from `kindP[year]`). The field exists only in rows whose charge the appeal lowered, which move anyway.

`annotateAppealRows(sim)` (beside `annotateInheritedRows`, called after it in `render()`) appends to the status cell's title:
"IRMAA appeal (form SSA-44, retirement): Partner A charged on 2034 income instead of 2032" (one clause per partner; "You" in
single-person mode, as the table's other copy does).

Copy:
- Healthcare callout: "... Neither ACA nor IRMAA account for the Medicaid coverage gap, state ACA variations, or IRMAA appeals
  for life-changing events." becomes a sentence saying the planner assumes the household appeals (form SSA-44) after a
  retirement, the end of a job, or a spouse's death, so the first one or two Medicare years after such an event are charged on
  that year's (or the year before's) income when that is lower; other events (marriage, divorce, a pension or property loss)
  are not modeled. The rewritten sentence also drops "the Medicaid coverage gap": since 7O O1 the planner models Medicaid and
  the non-expansion gap (`MEDICAID_RULES`, the 100% credit floor), so the phrase is stale (owner to confirm in the spec review);
  "state ACA variations" stays.
- The `irmaaPriorKnown` tooltip gains: "A retirement, the end of a job or a spouse's death inside the plan is appealed
  automatically (form SSA-44)."
- README: one bullet in the IRMAA feature text. US badge V129 -> V130.

### 5.7 Hot path

The table is built once per run (a few comparisons; allocation only when an event exists). `healthcareCost` adds one null test
and, outside the event windows, one array read per partner. The default household has a retirement event, so its table exists;
its windows are two years per event. The candidates cost one or two `irmaaSurcharge` calls in those years (each allocates the
tier table through `irmaaTiers`, as the normal charge does today). Gate: section 7.

## 6. Legacy behavior and the movers

No input is added, so no saved state changes and `normalizeState` is untouched. Numbers change by design in two stages, each with
a dump/compare movers table (`node tests/snapshot.js --root <base> --dump A --update-nothing`, `--dump B`, `--compare A B`) for
the owner's approval before `npm run snapshot:update`:

1. **Decision 1.** Expected movers: scenarios with survivor modeling on a married couple whose D+1 or D+2 lies inside the plan
   and someone on Medicare then; first change in year D-1 or later (D-1 and D only through the plan's pricing, 5.1), the first
   charge change in D+1 or D+2. Every other scenario identical. Canada identical.
2. **The appeal (5.2 to 5.6).** Expected movers: scenarios with an event (section 5.2) and a partner on Medicare in E or E+1;
   first change in year E or E+1 (healthcare, then everything downstream), or, through the plan's lines (5.5), in a year with an
   in-year candidate. Every other scenario identical, including every scenario without Medicare in an event window. Canada
   identical.

Each table lists counts by group (first change), the largest healthcare and end-total moves, and any depletion change.
`tests/plan_off_anchor.js` is re-based at each stage (it pins guard-off numbers, which move by design; the IRMAA fix's lesson).

## 7. Gates

- `npm test` green after each `snapshot:update` that the owner approved.
- Timing: `node tests/bench_runs_interleaved.js --base <baseline worktree> --rounds 21`, the median of three runs, at most +5%
  per path; `tests/bench_solver.js --base` (the ACA early retiree and the default household) and `tests/bench_plan.js` (planning
  at most 5x one off projection) recorded.
- `tests/cliff_plan.js`, `tests/cliff_guard.js` and the other cliff-plan tests unchanged and green; `tests/plan_off_anchor.js`
  re-based as in section 6.

## 8. Tests (`tests/irmaa_appeal.js`, new, in `npm test`; hand-computed)

The quiet base of `tests/irmaa_magi.js` (Texas, no inflation, no returns, no investments, no conversions, Medicare 10,000 a year
for the household, half per partner), with `incomeGrowth: 0`, `k401PctA/B: 0`, `iraPctA/B: 0` and the clock pinned to 2026.
2026 tiers: single 109,000 / 137,000 / 171,000 / 205,000 / 500,000; joint 218,000 / 274,000 / 342,000 / 410,000 / 750,000;
monthly 95.70, 240.40, 385.00, 529.60, 578.00 (annual 1,148.40, 2,884.80, 4,620.00, 6,355.20, 6,936.00). No Social Security
(Medicare MAGI = MAGI) unless a case says otherwise.

1. **Decision 1, the survivor** (stage 1). Married, both 68, retired at 65; pensions 125,000 each (joint MAGI 250,000, joint tier
   1); A dies at 71 (`deathYear` 3; the deceased's pension stops). Years 0-2: 10,000 + 2 x 1,148.40 = 12,296.80. Year 3 (D, B
   only, lookback year 1 joint 250,000): 5,000 + 1,148.40 = 6,148.40. Year 4 (D+1, lookback year 2, 250,000 on a joint return):
   today 250,000 on the single tiers = tier 4, 5,000 + 6,355.20 = 11,355.20; after stage 1 the joint tiers, 6,148.40. Year 5
   (D+2, lookback year 3, B's 125,000 on a joint return): today single tier 1, 6,148.40; after stage 1 under 218,000, 5,000.
   Year 6 (lookback year 4, 125,000 single): 6,148.40 on both trees.
2. **The survivor with the appeal** (stage 2; case 1's household). Year 3: min(1,148.40; year 3's 125,000 on its joint return:
   0) = 0, healthcare 5,000, `irmaaAppeal.b = { taxYear: 2029, lookbackYear: 2027, event: 'death' }`. Year 4: min(1,148.40;
   year 3: 0; year 4's 125,000 single: 1,148.40) = 0, 5,000, tax year 2029. Years 5 on as case 1 after stage 1.
3. **Retirement past 65.** Single, 66, salary 200,000, retires at 68 (E = 2), pension 60,000 from 68. Medicare from 68 (employer
   coverage until then). Year 2: normal = year 0's 200,000, tier 3, 4,620; appeal year 2's 60,000: 0. Healthcare 10,000 (was
   14,620). Year 3: normal year 1's 200,000 (4,620); appeal min(year 2: 0, year 3: 0) = 0, tax year 2028 (the earlier year on a
   tie). Year 4 (lookback year 2): 10,000 on both trees.
4. **The year-E option in E+1.** Case 3 plus an `ordinary` one-time income of 100,000 at 69 (year 3; MAGI 160,000, tier 2).
   Year 3: min(4,620; year 2: 0; year 3: 2,884.80) = 0, tax year 2028. Year 5 (lookback year 3): 2,884.80 on both trees.
5. **The next-year option (Step 3).** Case 3 plus the 100,000 at 68 (year 2: MAGI 160,000). Year 2: min(4,620; 2,884.80) =
   2,884.80, tax year 2028. Year 3: min(4,620; year 2: 2,884.80; year 3's 60,000: 0) = 0, tax year 2029.
6. **A spouse's retirement covers both.** Married; A 66 with a salary of 300,000 retiring at 68; B 70, retired, on Medicare,
   pension 60,000. Joint MAGI 360,000 in years 0-1 (joint tier 3). Years 0-1: B only, 5,000 + 4,620. Year 2 (both on Medicare):
   normal 2 x 4,620 on year 0; appealed on year 2's 60,000: 10,000 (was 19,240). Year 3: 10,000 (was 19,240). Both partners'
   `irmaaAppeal` entries set, event 'retirement'.
7. **A job stream ends.** Single, 66, main job ended at 60 (`incomeA` 0), pension 40,000 from 60, a W-2 stream (owner A, ages
   60-69, 200,000, no health premium, no growth): Medicare from 65; MAGI 240,000 (single tier 4) in years 0-3. E = 4 (age 70).
   Years 0-3: 16,355.20. Years 4 and 5: 10,000 (was 16,355.20), event 'job end'. Year 6 (lookback year 4, 40,000): 10,000.
8. **Two returns: own events only.** An unmarried couple (`filingStatus: 'single'`), both 66 and retired, A has case 7's stream
   and pension, B a pension of 150,000 (tier 2). B's charge is 2,884.80 every year on both trees; A's follows case 7 (years 4, 5:
   none). B's `irmaaAppeal` is never set.
9. **Not events.** (a) Retirement at or before today's age (`retireAgeA: 66` at 66) with entered prior MAGIs of 200,000: years 0
   and 1 pay 4,620 on both trees. (b) A partner with `incomeA: 0` and a later retirement age: no event (table all zero). (c) An
   unmarried couple's death (`filingStatus: 'single'`, survivor modeling on): no death event for the survivor. (d) A job stream
   that ends in the owner's death year: no job-end event (the death event, when married, covers the survivor).
10. **The table** (`__test_irmaaAppealTable`): case 6's codes (A and B: year 2 code 1, year 3 code 2, kind 2), case 7's (A: years
   4 and 5), a death at year 0 (code 1 at 0, 2 at 1), an event at the plan's last year (E only), a retirement covered by a later
   stream end (latest E wins the kind).
11. **Convergence (in-year).** A single retiree retiring at 67 with a traditional balance, spending that requires a draw and a
   MAGI near 109,000 in year E: the charged surcharge equals `irmaaSurcharge(irmaaMagiOf(row.magiProxy, ss, filing), filing,
   year)` at the row's own realized MAGI (the year converged or took the forced pass, whose charge is at the realized MAGI).
12. **The lines** (stage 2). Inflation 3%, case 3's household: in year 2 (an in-year candidate) the plan trace's `irmaa1` line is
   `magiForIrmaaLine(109,000 x taxIndexFactor(2))` (growth 1, the household's filing); in a later year without a candidate it is
   `... x taxIndexFactor(y) x irmaaGrowth2` as today.
13. **Legacy.** `tests/snapshot.js` (every non-mover identical), the existing IRMAA tests (`irmaa_magi`, `irmaa_startup`,
   `irmaa_gating`, `medicare_enrollment`, `two_return_magi`, `solver_hooks`, `cliff_plan`, `cliff_guard`) unchanged; any existing
   expectation that must change is listed with its reason in the stage's record (expected: case (d) of `tests/irmaa_magi.js` is
   unaffected, its survivor pays no surcharge).

Playwright (`test_irmaa_appeal.js`, repo root, not in CI): case 3 loaded through the UI, the status tooltip of age 68 contains
"IRMAA appeal"; the healthcare callout text; the mobile-width check.

## 9. Docs

CLAUDE.md: the "MAGI iteration" paragraph gains the appeal (the event table, the in-year candidate inside `healthcareCost`,
`usesMagiEstimate`, the lookback filing history); the cliff-plan paragraph notes the growth-1 lines; the file list gains
`tests/irmaa_appeal.js`. `docs/next-batches-plan.md`: the "E3: design" and "E3: implementation" records (section 11 and the
plan).

## 10. Not modeled

- **Events:** marriage (a date exists; joint tiers are twice the single ones, so it rarely lowers the charge), divorce (excluded
  from Batch E), a cut in hours within one job (the end of one of several jobs counts), loss of pension income, loss of
  income-producing property, employer settlements, the end of a not-earned stream.
- **Attribution:** any drop in MAGI in an event window is credited to the event; SSA requires the reduction to come from it. The
  guard is that the job had pay (a zero-income retirement or stream is not an event).
- **Whole years:** events at the start of a year; a mid-year retirement's partial salary is not modeled (the engine has none).
- **Events before the plan:** a retirement at or before today's age is not an event; the entered prior MAGIs (or the year-0
  stand-in) stand. The entered returns' filing status is assumed to be this year's.
- **Timing of SSA's corrections:** the estimate, the later IRS check and the retroactive adjustment are collapsed into a charge
  on the realized MAGI in the premium year.
- **The plan's scoring:** `irmaaAt` prices only the charge two years on; the effect of year E's MAGI on year E+1's charge is not
  scored (Batch 5). `irmaaChecks` statistics in appeal years compare at the two-years-on tiers.
- **The year-0 stand-in** still reads the pass's provisional MAGI without convergence (pre-existing; a separate fix).
- **Unmarried couples:** a partner's event never covers the other's charge, and a partner's death is not an event.
- Tax-exempt interest (part of Medicare's MAGI) is not modeled, as before.

## 11. Review record

(Filled in after each review round.)
