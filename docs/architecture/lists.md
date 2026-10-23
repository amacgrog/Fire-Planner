# Add-as-you-go lists, spending tiers, children and loans

Read before touching a DYN list (loans, income streams, one-time income, extra and lump expenses, spending tiers, children), `normalizeLists`, or the loan schedules.

Related: [self-employment.md](self-employment.md), [inherited-accounts.md](inherited-accounts.md), [us-federal-tax.md](us-federal-tax.md), [inputs-and-ui.md](inputs-and-ui.md), [us-health.md](us-health.md), [canada-benefits.md](canada-benefits.md), [us-accounts.md](us-accounts.md), [magi-iteration.md](magi-iteration.md).

## The lists

## Add-as-you-go lists (loans, extra income, extra expenses, one-time items)

`state.loans`, `incomeSources`, `oneTimeIncome`, `extraExpenses`,
`lumpExpenses` (and `children`, below) are arrays that **default to `[]`** (cap `LIST_MAX = 10`);
the old fixed slots and the `otherLoansEnabled`/`otherIncomeEnabled` master
flags are gone. All five render from one generic DYN block (specs per list,
`renderDynList(name)`, delegated input/change/click handlers) — add a field
by editing the spec, not by hand-writing HTML. Ids are `<prefix><index><Field>`
(e.g. `extraExp0Amount`, `lumpExp0RepeatEvery`). Growth model: items have
`followGrowth` (true = income growth for income, inflation for expenses) or
their own `growth` %; `itemGrowthFactor()` applies it from today, and the
historical engine substitutes its actual-inflation `factor`. Age windows use
Partner A's age. `lumpExpenseHits(e, age)` handles repeat-every/until.
Lump expenses are subtracted out of guardrail needs, `firstWithdrawal`, and
`bondTarget` sizing. `normalizeLists()` (called from `normalizeState`)
migrates legacy saves: flag present+off → list dropped; flag on → only
configured loans / `enabled` streams kept, legacy income streams pinned to
`followGrowth:false, growth=inflation` so old projections reproduce exactly.
`flat: true` on `oneTimeIncome`/`lumpExpenses` makes `itemGrowthFactor` return
1 (and one-time income skip `factor`) — the amount is exact dollars at that
age; the growth fields hide via `showIf`. The old Bridge / part-time income
section (`bridge*` fields) is removed; `normalizeLists()` converts a saved
`bridgeEnabled` plan into income streams (start clamped to that partner's
retirement age, Partner B's window shifted into Partner A's age) and deletes
every `bridge*` key — note `normalizeState` spreads unknown keys, so any
retired field must be deleted explicitly or it re-migrates on every load.

## Income streams, owner and kind

**Income streams, owner and kind (US, E1b).** A stream row also carries `owner` ('A'/'B'), `kind` ('other' = Not earned /
`'wages'` = W-2) and a contribution panel (`contribute`, `deferralType`, `deferralPct`, `matchPct`, `afterTaxPct`, `personalPct`),
normalized by the US-only `normalizeUsStreams(s, raw)` (`src/us/core/inputs/list-rules.js`; the shared `normalizeLists`
keeps only the common keys, so these are read from `raw`, aligned to the filtered list; anything but a literal `'B'` / `'wages'` /
`true` / `'roth'` is the legacy meaning). Canada's streams are unchanged until E1-CA. The shared list renderer
(now `src/shared/core/inputs/dyn-fields.js`) has a `kind: 'select'` field (`options: [[value, label], ...]`). `streamAmountsForYear(streams, yearCtx, out)`
(pure, scratch `STREAM_OUT`, just above `listAmountsForYear`) splits the year's streams: owner A in single-person mode, the window
tested on the owner's age, W-2 skipped once the owner is dead, not-earned moved to the survivor's bucket; `total` is the old
`extraIncome` sum bit for bit and stays the cash figure. `buildTaxProfile` takes `streamWagesA/B` (added to the owner's wages, less
the traditional contributions in `streamWageCutA/B`) and `streamOtherA/B` (not earned); the profile carries `extraA` / `extraB`
(replacing `extraIncome`), and `taxFor` puts each on its owner's return (the two-filer branch gives B's return `extraB`).
`payrollTax` takes `streamWagesA/B` so the Social Security base and the Additional Medicare threshold are shared with the salary.
`streamPlanContributions` (just above `retirementContributions`) fills contributing W-2 streams after the salary, against
per-person deferral / catch-up / IRA rooms (what the salary left) and per-stream annual-additions room; see the spec
(`docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md`) section 5.4. Every added term is an exact 0 for a legacy save, so
existing snapshots did not move. Tests: `tests/income_streams.js`, `tests/stream_contributions.js`, `test_income_streams.js`.

## One-time income

**One-time income (US, E1d; spec `docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md`).** A `oneTimeIncome` row also
carries `kind` (`'free'` default = tax-free, `'wages'` = severance or bonus with payroll tax, `'ordinary'` = no payroll tax, `'gain'` =
long-term gain), `owner` ('A'/'B'), `gainPct` (the taxable share of a gain, 0-100, default 100) and `activeBusiness` (the gain leaves
net investment income but stays in MAGI), normalized by the US-only `normalizeUsLumps(s, raw)` (read from the raw save and aligned like
`normalizeUsStreams`; anything unknown is the legacy meaning, tax-free for Partner A). `lumpAmountsForYear(lumps, yearCtx, out)` (pure, scratch
`LUMP_OUT`, just below `streamAmountsForYear`) reads the rows defensively (a raw row loaded through `Object.assign` with no `kind` is tax-free,
any owner but `'B'` is A, a non-number `gainPct` reads as 100 and a boolean `true` reads as 1; hand-edited saves only), puts owner A in single-person mode, treats the owner as dead from the death year
on (a dead owner's wages or ordinary lump goes to the survivor as ordinary income with no payroll tax; a dead owner's gain is tax-free), sends a
gain's basis to `taxFree`, and sums the taxable part in `flowTotal`, the one gate (a lump year is `flowTotal > 0`). `oneTimeAmount` =
`taxFree` (today's cash path, `bal.cash += oneTimeAmount`, bit for bit); taxable lumps join the year's `wages` (so they pay their own tax
inside the flow). Wages lumps reach the owner's return and payroll through `streamWagesA/B` (also the self-employment Social Security wage
base, `ssWagesA/B`), ordinary lumps through `streamOtherA/B`; neither makes a retirement contribution. Gains ride the profile: `lumpOn`,
`lumpGainA/B`, `lumpGainNoNiitA/B` (both `buildTaxProfile` literals always carry them, the survivor remap moves B's into slot A; read only
under `lumpOn`): `taxFor` adds them inside each branch (joint and one-person: to `gains`; two filers: to each return's own `gainA/B`; the NIIT
leaves out the no-NIIT part from net investment income only), `returnMagis` appends each owner's gain, and `magiBase0` and `row.income`
include them. Guardrails: a lump year records no guardrail withdrawal and no `firstWithdrawal`, and clears `prevPortfolio` after its own step,
so the next year holds the multiplier. The trace carries `guardrails`, `firstWithdrawal` and `forcedPass`. Tests: `tests/lump_income.js`,
`test_lump_income.js`.

## Spending tiers

`state.spendingTiers` is a sixth DYN list (ids `tier<i>…`): amount, startAge,
endAge, followGrowth/growth. `baseSpendingNominal(age, year, factor, incomeFactor)`
is the single place both engines (and `projectedExpense`) read household
spending — the active tier that started latest wins (ties: first in list),
else `state.spending * factor`. Legacy five-slot saves (`enabled`/`age`) are
migrated in `normalizeLists()` as open-ended (end 120) inflation-following
changes, which reproduces the old projections exactly. Additional expenses
(`#extraExpensesGroup`) is `data-cat="spending"`; one-time expenses, other loans and the pre-retirement healthcare group are
also `spending`; additional income is `income`; `extra` keeps survivor planning.

## Children

`state.children` is a seventh DYN list (ids `child<i>BirthYear` / `child<i>Student`; group `#childrenGroup`,
`data-cat="profile"`, inside the shared `spendingTiersGroup` partial (`src/shared/partials/`); its copy lives in each
planner's `DYN.children` spec, so Canada's note says it feeds the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child benefits). A row is `{ birthYear, student }`;
`normalizeLists` (shared) clamps the year to the **fixed** bounds `CHILD_BIRTH_YEAR_MIN/MAX` (1950-2100, never
relative to the clock, so a saved year cannot drift on reload), drops rows without a usable year, and keeps
`student` only when literally `true`. An optional `joinYear` (E2, adoption; the row's "Joins the household in" field) is
kept by `normalizeLists` only when it is a year (same fixed bounds) later than the birth year, otherwise the key is left
off, so a legacy row keeps its exact shape; `dependentsInYear` and the US `hasChildAtMost` (the Medicaid child-13 test,
the one reader that loops over `inputs.children` itself, `hasChildAtMost(inputs, taxYear, maxAge)`) skip a child while `c.joinYear > taxYear` (a missing key
compares false), so a joined child counts for its whole join year and its age stays `taxYear - birthYear`. The field
uses the shared list renderer's opt-in `blank: true` / `placeholder` number options (`src/shared/core/inputs/dyn-fields.js`: a missing
value shows an empty box; clearing the box deletes the key). Nothing is adjusted for children automatically (spending stays the
user's). `dependentsInYear(inputs, taxYear)` (shared, now in `src/shared/core/inputs/lists.js`, takes a CALENDAR year; the US
engines pass `taxYearOf(ctx, yearIndex)`) returns `{ age, student, qualifyingChild }` per child born by then, with
`age = taxYear - birthYear` (a birth year counts as age 0 for the whole year). `qualifyingChild` is the
federal rule: `age <= 18`, or `age <= 23` for a full-time student; each credit applies its OWN cutoff to `age`
(the Child Tax Credit is `age <= 16`; the child-care credit would be `age <= 12`). Qualifying relatives and
disabled-at-any-age children are not modeled. `dependentsInYear` returns a shared frozen empty array when there
are no children (hot path; do not mutate the result). **US plumbing:** `buildTaxProfile` puts
`profile.dependents` on every profile (including the survivor remap: children stay with the surviving
parent), and `acaHouseholdSize(ctx, singlePerson, isSurvivorPeriod, yearIndex)` (adults plus qualifying children)
feeds both `acaNetCost` (via `healthcareCost`) and the 400%-FPL guard in `conversionMagiCeiling`, so cost and
guard cannot drift apart. Profiles built elsewhere (the Roth solver and optimizer literals) have no
`dependents`: a consumer must treat a missing list as none. Canada reads it through `dependentsInYear(ctx.inputs, ctx.taxYear + year)` for the income-tested
benefits (7L: the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child
benefits); no Canadian tax credit uses it. Tests: `tests/child_dependents.js` (in `npm test`), `test_children.js`.
Test: `node test_dynamic_lists.js`, `node test_spending_and_fi_widgets.js`.

## Loan schedules

- `mortgageSchedule()` / `loanSchedules()` — compute a fixed level monthly
  payment via `mortgagePayment(principal, annualRate, years)` from the
  **original** principal and term, never from the current balance and
  years-remaining (a real loan's payment doesn't shrink just because extra
  principal was paid down). Downstream code reads `schedule.payments[year]`/
  `schedule.balances[year]`, never `state.mortgage*`/`loan.term` directly.
