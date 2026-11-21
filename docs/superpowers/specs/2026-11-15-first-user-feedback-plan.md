# First real-user feedback: plan, easiest to hardest (2026-11-15)

Notes from a first real user of the US planner (written 2026-11-09, on about V175), plus one item from the owner
(revolving debt, 2026-11-15). The user's recurring theme: let a person test a wider range of futures, and make sure
the planner never looks rosier than it should. This file orders the work by how hard it is to build, not by value.
Each item names the feedback point it answers (#1-#12 in the user's numbering) and what already exists.

Sizes: **hours** (copy only), **a day**, **2-4 days**, **a batch** (a week or more, its own spec). Every item that
adds an input defaults to the current behavior, so no existing projection or snapshot moves unless stated.

## Already covered: say so, don't build

Answer these in the reply to the user and in the UI copy (tier 1), not with new features:

- **#7 timing of losses, losing streaks:** the Market scenario card (a crash at any age, its depth, how long the fall
  lasts and how much comes back, presets from 1929 to 2022, or a replay of real history from a chosen year).
- **#5 inflation, partly:** the historical backtest and Monte Carlo use each year's real CPI with its stocks and bonds,
  and a scenario crash already takes its own inflation and bond return for the years of the fall (`msInflation`,
  `msBondReturn`; `scenario-source.js`). What is missing is an inflation spell with no crash (C3).
- **#9 Monte Carlo, partly:** it samples 5-year blocks of history, so inflation and bond returns vary with stocks.
- **#10, partly:** Guyton-Klinger guardrails cut spending after bad markets.
- **#11 debt:** the "+ Add a loan" list, fixed-term loans and (since B3) credit cards and lines of credit.

## Tier A: copy only (hours each; one PR for all four) — built 2026-11-15 (US V179, Canada V84)

- **A1. FIRE prerequisites (#2).** A short "Before you rely on this" block: the projection assumes you spend what you
  enter, keep saving what you enter, and carry no debt you left out; FIRE needs that discipline. Put it on the wizard's
  first step and in the Limitations section. Text only.
- **A2. Expense accuracy (#3).** The spending field's info bubble and the guidance card's spending line: base it on 12
  months of actual spending, including irregular costs (car, home repairs, gifts, travel), not on a budget; and count
  the full card payoff, not the minimum payment (this links to B3). Text only.
- **A3. What stays fixed (#6, #10).** An "Assumptions" paragraph: each asset class has one return for the whole run;
  the bond reserve is sized in years of expenses, built before retirement and refilled after; contributions go to the
  accounts as entered; there is no rebalancing or glide path; spending responds to markets only through guardrails; cash earns
  one rate. Text only, until C5 and D2 change it.
- **A4. Point to the stress tests (#5, #7, #9).** The inflation and return fields' info bubbles name the Market
  scenario card and the historical and Monte Carlo views. Text only.

Version badge bump; `snapshot_ui` text hashes move (stated in the commit).

## Tier B: small input and engine changes (about a day each; one PR each)

- **B1. Social Security start age past 70, as an "if the law changes" option (#12; owner, 2026-11-15).** Built
  2026-11-15 (US V180; plan `docs/superpowers/plans/2026-11-15-feedback-b1.md`). This models
  a law that raises the *earliest* claiming age, so no benefit is paid before, say, 72. A cut does not model that: it is
  a later start, not a smaller check. A raised *full* retirement age still lets people claim at 62-70 for less, which
  is B2's cut. Default: the field stays at 62-70. A switch, "If the law changes: allow a start age past 70", raises
  the field's `max` to 75 (and its clamp in `normalizeState`); turning it off clamps the age back to 70. Its info
  bubble says that under current law no delayed credits accrue after 70, so waiting longer only loses checks; enter
  the benefit you expect at that age. The benefit is already used as entered from the start age
  (`src/us/core/income/social-security.js`). Check the wizard and `guidance-fields` for a 70 assumption. Add a Vitest
  case at 72, and one with the switch off. A day or less.
- **B2. Social Security benefit cut (#12; also covers a raised full retirement age).** Built 2026-11-15 (US V181; plan
  `docs/superpowers/plans/2026-11-15-feedback-b2.md`). B2's info bubble says that a
  higher full retirement age is modeled as a cut; B1's switch bubble ("is a benefit cut, not a later start") then names
  B2's field. Batch 6, item 5, already specified in `docs/next-batches-plan.md`
  (`ssBenefitCutPct`, `ssBenefitCutStartYear`, a "Use the Trustees' projection" button that sets 22% from 2033).
  Pull it forward on its own; it needs none of the rest of Batch 6. The cut must reach the taxable-benefit calculation
  (Pub. 915) and the MAGI the ACA and IRMAA read, which happens automatically if it is applied where the benefit is
  computed. Survivor symmetry still holds.
- **B3. Revolving debt (#11, owner).** Built 2026-11-16 (US V182, Canada V86; plan
  `docs/superpowers/plans/2026-11-16-feedback-b3.md`). A loan row gets a type: amortized (today) or revolving (a credit card or line
  of credit): balance, APR, and the payment. **Owner decision (2026-11-16):** each month's payment is the larger of a fixed
  monthly amount the user enters and the card's minimum (a percent of the balance with a dollar floor, for example 2% or $25,
  never more than the balance); a fixed amount of 0 pays the minimum only. Interest accrues monthly
  on the balance as in `loanSchedules()` (`src/shared/core/income/spending-and-loans.js`), and the row returns the
  same `{ payments, balances }` schedule, so nothing downstream changes. A warning when the payment does not cover the
  first month's interest. Both planners (the list is shared). Needs a `type` guard in `normalizeLists`, `showIf` for
  the fields of each type, and the guidance and Sankey labels. Variable rate: one APR for the whole run (a schedule of
  rates is out of scope; say so in the bubble).
  **Copy to update:** the card sentence in `beforeYouRely.html`, the "Credit-card and other revolving balances" item in both method cards' "Not modeled", and the spending bubble's card sentence (Tier A; `docs/architecture/inputs-and-ui.md`, "The trust copy").
- **B4. Lead with the cautious figure (#1).** Built 2026-11-16 (US V184, Canada V88; plan
  `docs/superpowers/plans/2026-11-16-feedback-b4.md`). The verdict already carries a line about how the plan fared in
  historical markets. **Owner decision (2026-11-16):** the verdict keeps leading with the average-market sentence (how
  long the money lasts, and the spending room or the cut), and the Comfortable / Tight / Short word stays judged on both
  measures (`VERDICT_RULES`: Tight under 10% room, a guardrail cut over 10%, or under 80% historical success). When the
  historical rate alone sets the word (the margin alone would read Comfortable), the sentence says so with the exact
  count, never rounded: "…lasts through age 95 in an average market. … But it runs out in 22 of the 70 historical
  starting years since 1928." The status bar reads "Tight (history) · …". A history-only Tight still gets no moves card
  (PR #99's rule; owner confirmed). Every displayed success percent now rounds down, so none reads 100% after a failure
  or reads 80% under the line.

## Tier C: medium (2-4 days each; one PR each, a short design first)

- **C1. Cash rate over time (#7).** In historical, Monte Carlo and history-replay years the cash account earns the
  year's Treasury yield (the data already carries it: `bondYield` in `year-sources.js` / `scenario-source.js`)
  instead of the fixed `hysaRate`, minus a spread the user sets. A switch, default off, so no number moves until it is
  turned on. Touches `investmentIncome` and `growBalances` in both engines, and historical parity
  (`tests/unit/us/historical-parity.test.js`).
  **Copy to update:** the returns item in `methodAssumptions.html` ("cash still earns your HYSA rate") (Tier A; `docs/architecture/inputs-and-ui.md`, "The trust copy").
- **C2. Federal tax-rate what-if (#4).** "Federal income tax rates up N percent from year Y" (and a preset for a
  named change if the owner wants one). Scale the bracket *rates*, not the thresholds, so the conversion bracket
  targets and the cliff plan's bracket fills keep their meaning. It reads only `ctx.inputs`, so the result cache keys
  it with no change. Hot path: the scale is a per-year factor read once, not per bracket call; time it with
  `tests/bench_runs_interleaved.js`. US first; Canada's federal table takes the same switch later. State tax is out of
  scope (point the bubble at E4 for state).
- **C3. An inflation spell without a crash (#5).** A Market scenario kind "Inflation spell": inflation N percent for
  K years from an age, with its own bond return and an optional stock return, built on the crash path's existing
  `c.inflation` / `c.bondReturn` handling. Everything that follows inflation (spending, benefits, brackets, limits) moves
  through the scenario's `taxFactors` path already. The user's "hold expenses fixed" point: spending entered in
  today's dollars rises with inflation by design; say so in the scenario's description.
- **C4. Social Security means test (#12).** "Cut Social Security by X percent in a year when liquid assets were over
  $Y (today's dollars)." Read the *previous* year-end balances, so the test does not enter the MAGI iteration (a
  same-year test would, and every new estimate there has the snapshot rules of `magi-iteration.md`). Builds on B2's
  cut path. Default off. B2 left the hook: `ssPaidShare` (`src/us/core/income/social-security.js`) is the input-driven
  share, and C4 passes its own per-year share in from the caller and multiplies it into `paid`; the Sankey, which recomputes
  the year's benefits, then reads the row's `ss` instead, and the cliff plan's estimates (`ssAt`, `ssOf`) need the share too.
- **C5. Flexible guardrails (#10; owner, 2026-11-15: "too rigid", not a flat 10% in every down year).** Today
  (`src/shared/core/projection/guardrails.js`) the rule is one on/off switch, with every number fixed in code:
  - the trigger: the withdrawal rate more than 20% above or below the first retired year's;
  - the step: spending cut or raised 10%;
  - the band: 0.5x to 1.5x of base living spending;
  - a cut lasts until the next trigger.

  Make it modular, in this order, each piece defaulting to today's numbers so no saved plan moves:
  1. *Settings:* the trigger percent, the cut percent and the raise percent (separately), and the band.
  2. *A graduated cut:* the cut grows with how far the rate is over the trigger (for example 5% just over it, up to
     the cut percent at twice the trigger), instead of the same step every time.
  3. *A spending floor in today's dollars* (essentials never cut below it), so a run of cuts stays livable.
  4. *The original rules as options:* no inflation raise after a losing year, and no cuts in the last 15 years of
     the plan.
  5. *Presets:* "Cautious", "Standard" (classic Guyton-Klinger) and "Flexible", which only set the fields above.

  Show the cost: years spent below plan and the deepest cut (the verdict already has the deepest cut), and a spending
  line on the chart. **Open decisions (owner):** which settings are shown and which live only in presets, and whether
  a graduated cut becomes the default (it would move existing guardrail projections; say so in the commit). The
  guardrail state is in the MAGI-iteration snapshot (`newGuardrails`, copied with `{ ...g }`), so a new field there
  is snapshotted automatically. Both planners (the module is shared). A trigger based on the chance of success (a
  success-rate calculation inside every year) is out of scope here; it goes with D4.
  **Copy to update:** the guardrail item in `methodAssumptions.html` and the `#guardrailsEnabled` bubble in both shells (Tier A; `docs/architecture/inputs-and-ui.md`, "The trust copy").

## Tier D: a batch each (a week or more; own spec, per-PR plans, reviews)

- **D1. State relocation (#8).** Batch E4, already specified in `docs/next-batches-plan.md`: a "+ Add a move" list,
  one state per year, read by `stateIncomeTax`, `taxFor`'s no-tax fast path, the Medicaid line, `magiThresholds` and
  `lambdaEstimate`.
- **D2. Asset allocation over time and rebalancing (#6, #10).** A target stock share by age (a glide path), with
  rebalancing toward it each year, in place of today's fixed stocks plus a bond reserve. Touches every account's
  growth, the bond reserve and refill, the withdrawal order, the bucket mode of market scenarios, historical parity,
  and both engines. The largest item here; decide first whether it replaces the bond reserve or sits beside it.
  **Copy to update:** the bond-reserve and no-rebalancing items in `methodAssumptions.html` (Tier A; `docs/architecture/inputs-and-ui.md`, "The trust copy").
- **D3. Monte Carlo beyond returns (#9).** Seeded random shocks: a job loss before retirement (a gap in earned income
  with a yearly probability), an expense shock (a one-time cost), and optionally income growth drawn around its mean.
  Cost: Monte Carlo runs 1,000 paths, so each shock must stay cheap; the result cache key must cover the new settings.
- **D4. Responses to markets beyond guardrails (#10).** For example, delay retirement a year or move to a more
  conservative allocation after a drawdown. Needs D2 for the allocation response. Last, and only if users ask after
  seeing the guardrails.
  **Copy to update:** the guardrail and "Taxes and withdrawals" items in `methodAssumptions.html` (Tier A; `docs/architecture/inputs-and-ui.md`, "The trust copy").

## Validation track: every state and province (owner, 2026-11-15; runs beside the tiers)

The user asked how the results were validated. The October spot-check (prep item 4, `docs/next-batches-plan.md`,
"Correctness spot-check") worked one tax year by hand for three states (MA, CA, MN), federal, the ACA credit, IRMAA and
Ontario. It found four bugs that the tests had missed. The owner wants the same check for every jurisdiction.

- **V1. Primary sources for the rows that have none** (a batch of source reading; data fixes only). 19 of the 51 rows in
  `docs/state-tax-rules.md` cite only a secondary source: AK, AZ, CA, CO, DE, FL, LA, MA, MI, NV, NH, NY, OH, OR, PA, SD,
  TX, WY, DC. Seven have no wage income tax (AK, FL, NV, NH, SD, TX, WY) and need only a primary confirmation. The other
  twelve need their forms read. MA and CA were partly read in the spot-check; update their rows' status. Of the
  province rows, 13 families are marked secondary in `docs/province-tax-rules.md`; read them on the province or CRA
  pages. Each correction is reported, and fixed in its own commit with a hand-computed test.
  - *Status (2026-11-16):* every state row now cites a primary source (each row's notes name the lines read), and so does
    every province family (the 21 secondary cells were medical ×9, dividend ×10 and probate ×2, not 13).
    - *Corrections,* each with a case in `tests/unit/us/state-primary-sources.test.js` or
      `tests/unit/canada/province-primary-sources.test.js`:
      - AZ: no $2,300 exemption for a child.
      - CA: renter's credit limits $53,994 / $107,988.
      - DE: the statute's 2.2%-6.6% brackets (HB 13 never passed); $2,500 at 65.
      - LA: the 2026 indexed amounts; head of household takes the joint deduction.
      - NY: the 2027-2032 rate cut.
      - OR: the 2026 amounts; the 65+ add-on.
      - DC: the child credit in the Code ($420 per child under 6).
      - SK: the medical ceiling, $2,735.
    - *Fixed with small rule options* (the owner agreed 2026-11-16; their own PR after the data PR, one commit each; the
      options are in `docs/architecture/us-state-tax.md`):
      - Ohio taxes income over $26,050 at $332 plus 2.75% (the `thresholdAmount` addition).
      - Ohio's senior credit is $50 per return (`perSenior.perReturn`).
      - Ohio's joint filing credit is 20/15/10/5% by income (a step-table `share`), taken on the tax after the earlier
        credits (Schedule of Credits line 11).
      - DC's 2026-2029 standard deduction is its own basic amount plus the 65+ add-on and the senior deduction.
      - California's exemption-credit phase-out floors the personal and dependent credits separately.
    - *Fixed after the independent review of #107-#109* (`docs/superpowers/reviews/2026-11-17-v1-review.md`):
      - Ohio from 2026: no exemptions and no joint filing credit at a modified AGI of $500,000 or more (R.C. 5747.025,
        5747.05(E)(2)); #109 had used the 2025 limit of $750,000 on income less exemptions.
      - Ohio: a qualifying surviving spouse files in the single column (no joint filing credit).
      - The senior deduction's phase-out reads the federal modified AGI (all of the gains and the taxable Social Security)
        in every conforming row and DC, not the state's own start.
      - DC's senior-deduction citation is sec. 47-1803.04(e)(6).
    - *Follow-ups, not fixed:*
      - New York's child credit reverts to the older form in 2028 (the greater of $100 or a share of the federal credit;
        it needs a credit kind that reads the federal child credit).
      - Ohio's personal exemption is tiered by MAGI ($2,400 / $2,150 / $1,900, none from $500,000 since 2026); the planner uses
        $2,150 for the filers. The retirement income credit (up to $200) is not modeled.
      - Louisiana's final 2026 return deduction is not published; RIB 26-005's $12,875 / $25,750 may differ slightly.
      - Michigan's 2026 retirement limit is derived (the 2025 limit times 1.026) until Treasury publishes it; the planner
        applies the joint limit to each spouse.
      - DC's 2026 basic deduction is the 2025 figure until the District publishes its cost-of-living adjustment.
      - New York's statutory tables carry rounded dollar constants; the planner's exact bracket sums differ by under $1.
    - *Rows outside V1's list:* CT, GA, KS, KY, MS, NJ, NM, NC, ND, UT and WV cite a primary source but name a few
      secondary figures in their notes; read them before V2 reaches those states.
- **V2. A worked household for each jurisdiction** (a batch; PRs of about ten jurisdictions each). Use the spot-check
  method: one tax year (projection year 0, so the published figures apply), the engine's figure against the state's
  own form and worksheet lines worked by hand. Check two households per taxing state and per province: a working
  couple, and a retired couple with Social Security (CPP/OAS), a pension and IRA (RRIF) draws, since retirement
  exclusions are where jurisdictions differ most. Record each as a Vitest case with literal hand-computed figures,
  citing the form line (rule 2 of "Where a new test goes"). Covered so far: MA, CA, MN, ON (spot-check H1-H5); left:
  37 taxing states plus DC and 9 provinces. The territories stay out of scope.
- **Limits, stated to users:** these checks cover one year's tax given that year's incomes. No outside tool models a
  whole projection the same way. The tables are refreshed each tax year, and the refresh re-runs V2's cases.

V1 comes before V2, so a household is never worked from a secondary figure. A difference V2 finds in `src/` is
reported, then fixed in its own commit (rule 7).

## Suggested order

A (one PR) → B1 → B2 → B3 (after the owner's payment decision) → B4 (after the owner's decision) → C1 → C2 → C3 → C4 → C5
→ D1 (E4, already next on the roadmap after Batch 5) → D2 → D3 → D4.

Value can reorder this: B2, B3 and B4 answer the user's "too rosy" worry most directly and are cheap, so they could go
before A. D1 is already scheduled in `docs/roadmap.md`; the rest of tier D goes there only once the owner picks it.

**Revised order (owner, 2026-11-16, after the A/B review `docs/superpowers/reviews/2026-11-16-feedback-a-b-review.md`):**
the review's copy fixes and B5 → V1 (with a "How this was checked" paragraph in the method card) → C3 → C2 → C1 → C5 →
C4 → D1. V1 comes before C, and C3 before C1. V2 runs beside C from C2 on.

## Owner decisions from the A/B review (2026-11-16)

- **The historical tile (review F5):** 82% historical success stays Comfortable, so `VERDICT_RULES.minHistSuccess`
  stays 0.80. The dashboard tile changes instead: amber (`warning`) from 80% to under 90%, red only under 80%
  (`plan-verdict.js`, the tile's class). Monte Carlo does not count toward the word.
- **B5. Debt left at the end of the plan (review F2; owner).** A loan balance still owed at the end of the plan changes
  the verdict. "The end of the plan" is the last surviving partner's end age (the run's last row). The verdict reads
  Short, or Tight with a sentence naming the balance; the plan for B5 decides which. B5 also adds a normalizer floor,
  so a revolving row cannot have a 0% minimum, a $0 floor and no payment together.
  - *Inherited or not:* when a partner dies, each of their debts can either pass to the surviving spouse or not. Whether
    it passes depends on how assets and beneficiaries were assigned. For example, a partner who expects to die can move
    their assets into the spouse's name, and most of the spouse's own assets are then out of reach of the deceased's
    creditors.
  - *Today:* every non-mortgage loan is paid off in full from the household's assets in the death year (#104), so every
    debt is in effect inherited. Loans have no owner.
  - *Tabled (owner, 2026-11-17):* inheritance stays as it is. In probate, debts are paid from the assets in each
    person's name, whoever's name is on the loan, so a per-loan "inherited or not" switch would model the wrong thing.
    B5 is the small piece only: the verdict and the normalizer floor.

### B5 plan (small B5, 2026-11-17)

**What counts.** "Debt at the end" is the last row's `loanBalance` (other loans only: the mortgage is not in it, since
the home secures it and the row's home equity already nets it). Measured in today's dollars
(`displayValueOf('real', inflation, loanBalance, year, cumFactor)`), it counts at $1 or more. With survivor modeling on,
the death year pays every loan off (#104), so a couple's run never ends with debt unless the death falls after the
plan's end. The balance is the same in every spending variant (loan schedules never read spending), so the room search
is unchanged.

**The word: Tight, never Short.** A debt left at the end caps the word at Tight (a Comfortable plan becomes Tight; a
Tight or Short plan keeps its word). Short is rejected: Short means the money runs out, and its sentence, room and
moves are built on a spending cut, which never clears a debt. `planVerdict` and `historySetsWord` take a new rule field
`debtAtEnd` (boolean). `planVerdict`: depleted → short; else `debtAtEnd` → tight; else as today. `historySetsWord`:
false when `debtAtEnd` (history did not set the word alone). All four callers pass it: `projectionVerdictSteps`,
`projectionWordSteps` (an early 'tight' after the depleted check, before the guardrail or threshold run, so goal
answers and moves agree with the card), `renderPlanVerdict` and `landVerdictHistRate`.
`projectionVerdictSteps` returns `debtAtEnd` (the today's-dollars balance, or 0) and `debtExceedsAssets` (the last
row's `total < 0`); `lastVerdict` carries both.

**The sentence.** Appended to whatever sentence the plan gets (lasts, runs out, guardrails):
"But <b>$2.4K</b> (today's dollars) of debt is still owed at 100: the plan never pays it off." With
`debtExceedsAssets`: "…still owed at 100, more than everything you own then." (`end` is `endAgeText(scale)`, the
same end the sentence already names.) The status bar adds "debt left at end" after the room clause.

**The normalizer floor.** A revolving row with a 0% minimum, a $0 floor and no payment reads its minimum as 1% (the
lowest real card minimum; the review's suggestion), in `normalizeLists` and in `revolvingSchedule`, which mirrors the
normalizer's reading (a live row is not normalized until load or undo). A 1% minimum still lets a high-APR card grow;
the row's warning and the new verdict sentence cover that.

**After the plan review (Opus, 2026-11-17).**
- *Schedules past year 70 (a bug, its own commit first):* `loanSchedules` builds 71 years, so in a longer plan (a
  29-year-old to 100, or anyone to 110 from 39 or younger) a balance reads 0 from year 71, and a death after it pays
  `undefined` (NaN). The schedules now run to the longer partner's horizon, never fewer than the old 71 years, so no
  plan of 70 years or less changes.
- *Names:* the rule field is `debtAtEnd` (boolean); the amount `projectionVerdictSteps` returns is `debtLeft` (today's
  dollars, 0 with none), with `debtExceedsAssets`. `renderPlanVerdict` copies both into `lastVerdict`.
- *The moves card:* on a plan that is Tight with debt left, the moves would list a spending cut and a later retirement
  that cannot clear it. `movesSteps` returns no moves for a Tight plan with `debtLeft > 0`, and `movesHeadText` says
  "Tight: $X (today's dollars) of debt is still owed at 100. Raise its payment to clear it inside the plan." A Short
  plan's moves are unchanged (running out comes first).
- *The floor:* the 0/0/0 test in revolving-loan.test.js changes (the row now pays off). The check reads the clamped
  values. The Monte Carlo seed and `impactKey` hash the raw state, so a live 0/0/0 row's seed changes after a reload;
  minor, accepted.

**Not in B5.** No "pay the debt" move in the moves card (a later idea); the historical backtest and Monte Carlo do not
read the debt (the loans are the same in every cycle); a fixed-term loan whose term outlasts the plan counts, as it
should.

**Tests.** Vitest: `planVerdict` / `historySetsWord` with `debtAtEnd` (spending-room.test.js); `projectionVerdict` and
`projectionWord` on a single person with a card that outlives the plan → tight with the balance, and with survivor
modeling on → no debt (projection-verdict.test.js); the normalizer floor and `revolvingSchedule`'s matching reading
(revolving-loan.test.js). Playwright: `test_plan_verdict.js` gains the sentence and the status-bar clause; the 0/0/0 row
reads 1% after a reload (`test_revolving_debt.js`). Docs: `inputs-and-ui.md` (the verdict), `lists.md` (the floor),
README. Badges: US V189, Canada V91.
- **B2's Trustees figures (review F7):** checked by the starting session against the SSA's 2026 Trustees summary
  (ssa.gov/oact/TRSUM) on 2026-11-16. The OASI fund is depleted in Q4 2032, and 78% of scheduled benefits are payable
  after that, so the bubble and the button's 22% from 2033 are right. Not in the bubble: the payable share falls to
  62% by 2100, so a flat 22% cut is optimistic late in a long plan. The combined OASDI figures (Q3 2034, 83%) are the
  ones often quoted. **Owner decision (2026-11-16):** add a sentence to the bubble, as a copy fix: the payable share is
  projected to fall to about 62% by 2100, so a flat 22% cut is optimistic late in a long plan; enter a larger cut to
  test that. No cut schedule.

## Review copy fixes (one PR, hours; before B5)

From the A/B review, with the owner's answers:
1. **F1, the verdict's ages:** "runs out at 103 … to make it to 100" mixes Partner A's age with the younger partner's
   end age. Say whose age each figure is, or put both on one scale (`plan-verdict.js:39`, `:84-93`; both planners).
2. **F3, the wizard's spending field:** add A2's advice (12 months of actual spending, irregular costs included) to the
   `wizardSpending` descriptor in both shells.
3. **F5, the tile:** amber from 80% to under 90%, red only under 80% (`plan-verdict.js:205`).
4. **F7, the B2 bubble:** the 62%-by-2100 sentence above (`src/us/index.html`, `#ssBenefitCutPct`).
5. **The B4 nit:** "41 historical starting years since 1928" → "41 starting years with a full record" (or similar).

Version badges bump; `snapshot_ui` text hashes move (say so in the commit). Update the trust-copy list in
`docs/architecture/inputs-and-ui.md` if a listed line changes.

## Tier C plans

### C3 plan (an inflation spell without a crash, 2026-11-20)

**What it is.** A third kind on the Market scenario card, "Inflation spell": inflation at N% a year for K years from an
age, with its own bond return and an optional stock return. Outside the spell every year is the plan's. Both planners:
everything it touches is shared (`scenario-source.js`, `market-scenario.js`, the card, the text, the preview), and Canada's
CPP and OAS, its brackets and the OAS recovery threshold already follow the path's factor. One spell per scenario; the
kinds stay exclusive (a crash list, a spell or a history replay), since a crash already sets its own inflation for its fall.

**The input (the engine's data model).** `marketScenario` gains `{ kind: 'inflation', order, spell: { age, years,
inflation, bondReturn, stockReturn } }`. `normalizeMarketScenario` (`src/shared/core/inputs/market-scenario.js`) cleans it
with the crash path's rules: `age` 0-120 (rounded), `years` 1-30 (rounded), `inflation` -15 to 30, `bondReturn` -50 to 50,
each a required number (`num`). `stockReturn` is optional: `null`, `undefined` or `''` is `null` (the plan's return), a
number is clamped -50 to 50, and anything else turns the scenario off (as `history.endAge` does). A `spell` that is not an
object, or a missing required field, is off; other keys are dropped. No `defaults` value and no `FIELDS` entry: as today
the key is absent when off, and both `normalizeState` functions already delete it when the normalizer returns `undefined`,
so nothing else in `normalizeState` changes. The result cache key (`resultKey`, the whole inputs JSON) covers the new kind
unchanged; `successKey` and `monteCarloSeed` already leave `marketScenario` out.

**The year source.** `scenarioYearSource` gets a third branch, exclusive with the crash and history ones, built on the
crash's fall-year override: `t0 = max(0, round(spell.age - ageA))`; for `t0 <= year < t0 + years` inflation is
`pct(spell.inflation)`, the bond return `pct(spell.bondReturn)`, and the stock return `pct(spell.stockReturn)` when it is not
null (else exactly the plan's `r`). The yield stays the plan's bond return, as in a crash's years (the coupon is not the
total return; C1 may revisit this with the cash rate). The factor rule (step 4) needs no change: the first spell year whose
inflation differs from the plan's turns the running product on, and the price level stays raised after the spell (prices do
not come back down). A spell at the plan's own inflation leaves the factor on the pow.

Every consumer of `factor`, `limitFactor` and `taxFactors` then follows the spell: spending and the spending tiers,
healthcare and LTC (times their medical premium), Social Security / CPP / OAS and pensions, list items that follow
inflation, the brackets, deductions, FPL, IRMAA tiers, contribution limits and (Canada) the OAS recovery threshold.
Today's dollars divide by the row's `cumFactor`. What stays on the plan (market-scenarios.md, "Rates a scenario leaves on
the plan"): wages (`incomeFactor`), the HYSA rate, the mortgage rate, the pre-retirement ladder's sizing and the lookahead
approximations. A spell shows the wage gap more than a crash does, so the description says so (below). `runSourceFor`,
`pricingContextFor` and `scenarioFactorPath` are unchanged. The standard run never builds this source, so no hot-path bench
is needed, and the branch adds no module-level mutable.

**Historical and Monte Carlo.** Unchanged: both build their own sources and ignore every scenario kind, and the `.ms-note`
("Ignores the market scenario: these runs bring their own markets.") already shows while any scenario is on.

**The verdict and guidance under a spell.** Nothing new: they already treat every kind alike. The verdict judges the
spell's own projection (`planVerdict` with `scenario: true`, so the historical rate never sets the word and
`historySetsWord` is false), `#planVerdictHist` reads "Inside the scenario: <description>.", the status bar drops the
historical percent, and the goal chips, the wizard's goals and the goal answers' Try are locked
(`currentMarketScenarioText() !== null`). B5's debt rule applies inside the spell (loans are nominal, so a spell shrinks a
debt in today's dollars). The Playwright test checks these on a spell.

**The text.** `describeMarketScenario` for kind `inflation`, with `A = ageA + t0` and `A2 = min(L, A + years - 1)`:
- "inflation 8% a year at ages 62–71 (2028–2037), bonds −2% and stocks your plan's 7% a year then; spending, benefits and
  tax brackets rise with it, wages keep your plan's growth; bonds first in down years". With a stock return the phrase is
  "stocks +3%". One year: "at age 62 (2028)". The years are `currentYear + (A - ageA)`, as in the crash text; signs as the
  crash text writes the bond return (`+` before a positive figure).
- A spell starting past the plan's last age: "inflation spell at age 101: after the plan ends".
- `marketScenarioWindows`: `{ fromAge: A, toAge: A2 }`, nothing past L; the chart band shades it.

The banner, the print report's `pr-meta` line, the CSV's first line and `#msDescription` take this text unchanged.

**The card.** The kind toggle becomes Custom crash · Inflation spell · Real history (`#msKindSpell`). `#msSpellFields`
(hidden unless the kind is `inflation`) holds:
- `#msSpellAge` "Starts at age" (its year in a `<small><output>`, as the crash's), `#msSpellYears` "Lasts" (years, 1-30),
  `#msSpellInflation` "Inflation" (% a year), `#msSpellBond` "Bond return" (% a year) and `#msSpellStock` "Stock return"
  (descriptor "Optional; blank = your plan's return"; blank stores `null`, as `#msHistEnd` does).
- Two real-episode chips, `#msSpellPreset1966` "Like 1966–81" and `#msSpellPreset2021` "Like 2021–23", and
  `#msSpellPresetCustom`. A chip sets the years, inflation, bond return and stock return to the episode's compound annual
  averages of the cited `HIST` rows (geometric means rounded to one decimal, so a constant rate ends the spell at the real
  price level; the crash presets' fall-year figures are arithmetic averages): 1966–81, 16 years, inflation 7.0%, bonds 3.6%,
  stocks 6.0%; 2021–23, 3 years, inflation 5.6%, bonds −6.6%, stocks 9.9%. `SPELL_PRESETS` in `market-scenario-card.js`.
  A chip stands while the years, inflation and bond return are its own; the stock box is left out, so blanking it to keep
  the plan's return keeps the chip.
- A fixed note `#msSpellNote` (`.ms-description`): "Spending, benefits and tax brackets you entered in today's dollars rise
  with this inflation, as they do with your plan's own rate, and stay higher after it ends. This tests whether your money
  keeps up with prices, not whether you could hold your costs down: to test that, lower your spending too. Wages keep your
  plan's growth rate."
- Card settings gain `spell: { age, years, inflation, bondReturn, stockReturn, preset }`. `defaultCardSettings` adds the
  1966–81 preset at retirement (age R, as the crash default). `normalizeCardSettings` accepts `kind: 'inflation'` and lays
  valid fields over the default (age clamped into `[ageA, L]`, the rest with the engine's clamps, a null `stockReturn`
  kept, an unknown preset left at the default, a chip turned `'custom'` when its three numbers differ).
  `cardSettingsToScenario` returns `{ kind: 'inflation', order, spell: { age, years, inflation, bondReturn, stockReturn } }`.
  A save from before C3 has no `spell` and gets the default.
- `market-scenario-card.js`: the five boxes join `NUMS` (group `spell`), `onInput`'s blank rule covers `msSpellStock` as
  well as `msHistEnd`, the spell chips are wired as the crash chips are (on the spell group), the kind button and the field
  block are shown and marked like the other two, and everything is disabled while a scenario is on (the existing selector
  covers the new inputs and chips). The new ids join `UI_ONLY` and the button list in `tests/field_registry.js`.
- **The preview.** For a spell, the "market" chart draws the price level instead of the stock index: a new
  `scenarioPricePath(inputs)` (`scenario-source.js`) returns `{ ages, plan, scenario }`, `plan[t]` the plan's pow and
  `scenario[t]` the source's factor; the label reads "Prices" and the legend "Your plan's inflation" / "Scenario" (and the
  canvas `aria-label` matches). The portfolio chart and the summary are unchanged (today's dollars on each run's own
  factor; the baseline is the kind `'plan'` run in the bucket order).

**Copy (and the Tier A trust copy).** A4's bubbles change in both shells:
- `#inflation`: "…, and a Market scenario sets its own inflation: a crash for the years of its fall, or an inflation spell
  of any length."
- `#returnRate` and `#bondReturn`: "(a crash at any age, a spell of high inflation, or a replay of real history)".
- The card's intro: "Try a market of your own: a crash, a spell of high inflation, or real history from a year you pick."

The `methodAssumptions.html` returns item already says "unless you turn on a market scenario" and needs no change. The
trust-copy paragraph of `inputs-and-ui.md` gets a line for C3, and this file's "Already covered" #5 bullet says the spell
exists. The reply to the user says the spell answers #5, and that spending entered in today's dollars rises with inflation
by design.

**Tests.**
- Vitest, `market-scenario-normalize.test.js`: a valid spell; each clamp at both ends; `stockReturn` null / undefined / `''`
  → null and `'abc'` → off; a missing `years` → off; `spell: []` → off; an extra key dropped.
- `scenario-source.test.js`, with binary-exact rates as case A uses: plan inflation 0, returnRate 10, bondReturn 4; a spell
  at t0 = 2 for 2 years, inflation 100, bonds −50, no stock: factors `[1, 1, 1, 2, 4, 4, 4]`, `limitFactor` and `taxFactors`
  equal; stock exactly `0.1` every year; bonds `0.04, 0.04, -0.5, -0.5, 0.04, …`; yield `0.04` every year. With
  `stockReturn: 25`: stock `0.25` in years 2-3 only. A non-binary case on case K's pattern: plan 2.5%, spell 8% at t0 = 2 for
  3 years: year 2 is `Math.pow(1.025, 2)`, year 3 that `* (1 + 8 / 100)`, year 5 three such factors, year 6 then
  `* (1 + 2.5 / 100)`. A spell age before `ageA` starts in year 0; a spell at the plan's inflation keeps the pow.
  `scenarioPricePath` against the same factors.
- `market-scenario-text.test.js`: the sentence with and without a stock return, one year, capped at L, past L; the window
  (none past L).
- `market-scenario-card.test.js`: the defaults, the clamps into the plan, a chip turning Custom, a blank stock keeping the
  chip, `cardSettingsToScenario` for the kind, and `SPELL_PRESETS` as literals (16 / 7.0 / 3.6 / 6.0 and 3 / 5.6 / −6.6 /
  9.9, hand-computed from the `HIST` rows 1966-81 and 2021-23).
- Engine, one per country (`tests/unit/us/inflation-spell.test.js`, `tests/unit/canada/inflation-spell.test.js`): a single
  retired person, plan inflation 0, Social Security (US) or CPP and OAS (Canada) from year 0, a 25% spell for 2 years from
  year 2: the row's benefit is the entered figure times `1, 1, 1.25, 1.5625, 1.5625` (literals, e.g. 24,000 / 24,000 /
  30,000 / 37,500 / 37,500), each row's `cumFactor` is that factor, the living spending in today's dollars
  (`displayValueOf('real', …, r.cumFactor)`) is the same every year, and a working partner's wage equals the plan run's
  wage (two runs in one process). Built with `w.ctx()` and `runSourceFor`, never a context literal.
- Playwright, `test_market_scenario.js`: pick Inflation spell, a chip, edit a box, blank the stock box (null, chip kept);
  the description and `#msSpellNote`; the price chart draws; Run → the banner text, `fireProjectionRows` benefits in the
  spell years above the plan run's, `#planVerdictHist` "Inside the scenario: inflation …", no "historical" in the status
  bar; Revert → the plan's rows; a reload keeps the card's kind and spell; the 390×844 width check with the spell fields
  open. `test_market_scenario_mode.js` gains one spell Run / Revert round trip if the card test does not cover the
  autosave line.

**Docs and badges.** `market-scenarios.md` (the input shape, the source's third branch, the text, the windows, the
card's spell fields and presets, the preview's price chart, the tests), README's feature list, the trust-copy line in
`inputs-and-ui.md`, `test-inventory.md` for the two engine files, and `npm run analyze` (new exports `SPELL_PRESETS`,
`scenarioPricePath`). `snapshot_ui` text hashes move (the card and the bubbles; said in the commit). Badges: the next of
each planner (US V191 and Canada V93 if #112 lands first, else V190 / V92). Commits: the engine and the normalizer with
their tests; the text; the card, the preview and the copy; docs and badges.

**Not in C3.** A spell inside a crash list, or more than one spell; wages, the cash rate or the mortgage rate following
the spell (C1 takes the cash rate); a spell in the Historical or Monte Carlo views.
