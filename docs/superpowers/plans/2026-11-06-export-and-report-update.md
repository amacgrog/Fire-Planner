# CSV Export and Printed Report Update: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CSV export and the printed report in both planners show what the engine now computes. The CSV covers income by
source, withdrawals by account, conversions, spending broken down, taxes, contributions and, in the US, each partner's
retirement account balances. The report gains a year-by-year cash-flow table.

**Owner decisions (2026-11-06):**

- Individual account balances are per partner in the US: each partner's traditional IRA, 401(k), Roth IRA and Roth 401(k),
  from the ledger the engine already keeps.
- Canada keeps household RRSP/TFSA totals: its engine pools them, and building a per-partner ledger is out of scope.
- The report keeps its balances table and adds a second year-by-year cash-flow table.

**Architecture:**

- **The CSV writer.** The shared module `src/shared/ui/plans/export-and-print.js` keeps the download plumbing. It gets its
  columns from a new country seam, `#country/ui/seam-csvColumns`, which points to `src/<country>/ui/plans/csv-columns.js`.
- **US per-account balances.** These come from one extra US run with a new, opt-in `accountLog` option on `runProjection`.
  The option is null on every other run, so no other run's behavior or speed changes.
- **The report's new table.** It reuses the shared `cashFlowParts(row, prevInvestable)` and each country's
  `CASH_FLOW_LABELS`, so it adds up the same way the cash-flow chart does.

**Tech stack:** ES modules under `src/`, esbuild, Vitest (`tests/unit/`), a Playwright root UI script.

## What exists today (on `main`, e9533b3)

- **The CSV** (`exportCsv` in `src/shared/ui/plans/export-and-print.js`) has 15 columns, all balances.
  - Bug: its first column reads `row.yearIndex`, which rows do not have (the field is `row.year`), so the "Year index" column
    is always blank.
  - It has no calendar year.
  - It writes raw future dollars whatever the dollar toggle says.
  - In the Canada planner it labels RRSP/TFSA as "Traditional retirement" / "Roth retirement".
- **The report** (`src/<country>/ui/plans/print-report.js`) has key results, key assumptions, the chart, and one year-by-year
  table: income, expenses, taxes, then balances, with Canada also showing benefits. All of it follows the dollar toggle through
  `displayValue`.
- **The US ledger** (`src/us/core/accounts/account-ledger.js`) splits each traditional and Roth pool among four slots, in
  `ACCOUNT_SLOTS` order: IRA A, 401(k) A, IRA B, 401(k) B.
  - Each slot's dollars are `accountBalances(accts.trad, bal.traditional + bal.bondTraditional)`, and likewise for Roth.
  - Each slot therefore includes its share of the traditional or Roth bond reserve.
  - Only the test-only `trace` option exposes these numbers today (`run-projection.js`, the `if (trace)` block after
    `rows.push(row)`).
- **Tests:** none cover the export or the report.

## Global constraints

- Read `CLAUDE.md` first. Edit `src/`, never `dist/`.
- **No engine output changes.** Every row, total, golden figure and snapshot stays identical to the bit. `accountLog` is
  written only when a caller passes an array. No new row fields.
- **Engine rules.** `accountLog` is an output argument, like `trace`. The engine pushes to it and never reads it, so the
  engine-purity rules hold. Per year it allocates two 4-number arrays, and only when the option is on.
- **Dollars.** The CSV follows the dollar toggle, like the report: money columns go through
  `displayValue(value, row.year)`. The download's file name says which basis it is:
  - `fire-planner-annual-projection-todays-dollars.csv`
  - `fire-planner-annual-projection-future-dollars.csv`

  The Canada file uses the prefix `fire-planner-canada-`.
- **Blank cells.**
  - Partner B columns are blank for a single person, as the B age is today.
  - Fields that only some rows carry (for example `conversionGross`, `backdoor`, `inheritedTrad`) write 0 when absent, so
    every column holds a number on every row.
- **Copy.** Labels are descriptive, never advice.
- **New modules.** Line 1 is a one-line `//` purpose comment, then a blank line; two-space indentation. Run
  `npm run analyze` after adding them. A seam facade has no purpose comment (see `src/us/ui/seam-CASH_FLOW_LABELS.js`).
- **Badges and docs** change in the first user-facing commit (US V169 → V170, Canada V76 → V77). Also update:
  - `README.md` (the "CSV export and a printable report" line)
  - `docs/architecture/inputs-and-ui.md` (a short "Export and report" paragraph)
  - `docs/architecture/engine.md` (the `accountLog` option)
  - `docs/architecture/test-inventory.md` (the new tests)

## The CSV columns (fixed here)

Each country's `csvColumns()` returns an array of `{ label, value(row, i, ctx) , money }`. `money: true` columns go through
`displayValue`; the others are written as they are. The CSV-escaping code that exists today is kept.

### US (`src/us/ui/plans/csv-columns.js`)

**Year:**

| Label | Value |
|---|---|
| Calendar year | `CURRENT_YEAR + row.year` (from `shared/core/inputs/current-year.js`) |
| Year index | `row.year` |
| Partner A age | `row.age` |
| Partner B age | `row.ageB`; blank if single |
| Any partner working | `row.working` |
| Partner A working | `row.workingA` |
| Partner B working | `row.workingB`; blank if single |

**Income:**

| Label | Value |
|---|---|
| Wages | `wages` |
| Social Security | `ss` |
| Pension | `pension` |
| One-time income | `oneTimeCash` |
| Taxable income (est.) | `income` |
| MAGI (est.) | `magiProxy` |

**Withdrawals:**

| Label | Value |
|---|---|
| RMD | `rmd` |
| 72(t) payments | `sepp72` |
| From traditional (incl. RMD and 72(t)) | `traditionalWithdrawn` |
| From brokerage | `taxableWithdrawn` |
| Brokerage sold to pay tax | `taxableSaleForTax` |
| From Roth | `rothWithdrawn` |
| Inherited Roth payout | `inheritedRothPayout` |
| From inherited IRA | `inheritedDraw ?? 0` |
| From cash | `cashWithdrawn` |
| From home equity | `homeWithdrawn` |
| Shortfall (not funded) | `shortfall` |

**Conversions:**

| Label | Value |
|---|---|
| Roth conversion | `conversionGross ?? conversionAmount` |
| Roth conversion (taxable part) | `conversionAmount` |
| Backdoor Roth | `backdoor ?? 0` |

**Spending:**

| Label | Value |
|---|---|
| Total spending | `expenses` |
| Base spending | `baseSpend` |
| Housing | `housing` |
| Healthcare | `healthcare` |
| Long-term care | `ltc` |
| Loan payments | `loanPayment` |
| Other recurring expenses | `extraExpense` |
| One-time expenses | `lumpExpense` |

Check while implementing: confirm whether `expenses` includes `housing`, `healthcare`, `ltc`, `loanPayment`, `extraExpense` and
`lumpExpense`. Read the `expenses =` line in each `run-projection.js`. If the parts do not add up to the total, say so in the
docs paragraph; do not change the engine.

**Taxes:**

| Label | Value |
|---|---|
| Taxes (total) | `tax` |
| Early-withdrawal penalty (included in taxes) | `earlyPenalty` |

The penalty is part of `totalTax` (`run-projection.js`: `totalTax = ficaTax + taxFor(...) + wd.earlyPenalty`).

**Saving:**

| Label | Value |
|---|---|
| Contributions: traditional | `contribTraditional` |
| Contributions: Roth | `contribRoth` |
| Employer contributions | `employerContrib` |
| Payroll health premiums | `payrollPremiums` |
| Into cash | `cashTopUp` |
| Into brokerage | `reinvested` |
| Into bond reserve | `toBondReserve` |

**Balances:**

| Label | Value |
|---|---|
| Taxable brokerage | `taxable` |
| Bonds (all accounts) | `bonds` |
| Traditional (all) | `traditional` |
| Roth (all) | `roth` |
| Cash / HYSA | `cash` |
| Home equity | `homeEquity` |
| Loan balances | `loanBalance` |
| Investable assets | `investable` |
| Net assets | `total` |

Then ten per-account columns, labelled "incl. its bonds". Each slot includes its share of the bond reserve held in that
account type, so the four traditional slots add up to traditional stocks plus traditional bonds, not to "Traditional (all)":

- Partner A traditional IRA
- Partner A 401(k)
- Partner B traditional IRA
- Partner B 401(k)
- Partner A Roth IRA
- Partner A Roth 401(k)
- Partner B Roth IRA
- Partner B Roth 401(k)
- Inherited IRA (`inheritedTrad ?? 0`)
- Inherited Roth (`inheritedRoth ?? 0`)

The B columns are blank when single. Last comes "IRA basis (after-tax dollars)" (`iraBasis ?? 0`).

### Canada (`src/canada/ui/plans/csv-columns.js`)

Same groups.

- **Year:** the same seven columns.
- **Income:**
  - Wages
  - CPP / OAS (after recovery tax) (`ss`)
  - Pension
  - One-time income
  - Income-tested benefits (`benefits`), then one column for each part: `benefitGis`, `benefitAllowance`, `benefitCcb`,
    `benefitCgeb`, `benefitProvChild`, `benefitProvSenior`, `benefitProvCredit`
  - Taxable income (est.) (`grossIncome`)
- **Withdrawals:**
  - RRIF minimum (`rmd`)
  - From RRSP/RRIF (`traditionalWithdrawn`)
  - From non-registered (`taxableWithdrawn`)
  - Non-registered sold to pay tax (`taxableSaleForTax`)
  - From TFSA (`rothWithdrawn`)
  - From cash
  - From home equity
  - Shortfall
- **Conversions:** RRSP meltdown (`meltdown`).
- **Spending:** the same eight columns.
- **Taxes:** Taxes (total) (`tax`); OAS recovery tax (`oasClawback`). Check while implementing whether `tax` already includes
  `oasClawback` and write the label to match ("included in taxes" or not).
- **Saving:**
  - Contributions: RRSP (`contribRrsp`)
  - Contributions: TFSA (`contribTfsa`)
  - Contributions: FHSA (`contribFhsa`)
  - Employer contributions
  - Payroll premiums
  - Into cash
  - Into non-registered
  - Into bond reserve
- **Balances:**
  - Non-registered
  - Bonds (all accounts)
  - RRSP/RRIF (household)
  - TFSA (household)
  - Cash / HYSA
  - Home equity
  - Loan balances
  - Investable assets
  - Net assets

Read each field's meaning from `src/canada/core/projection/run-projection.js` (the row literal) before labelling it. Where a
label above turns out wrong (for example `ss` not being net of the recovery tax), fix the label and note it in the PR.

## Tasks

### Task 1: the `accountLog` option (US engine)

**Files:**

- `src/us/core/projection/run-projection.js`
- `docs/architecture/engine.md`
- new `tests/unit/us/account-log.test.js`

- [ ] Add `accountLog = null` to `runProjection`'s options destructuring, next to `trace`.
- [ ] After `rows.push(row)` (and after the `endTax` line, before `if (trace)`), add:
  ```js
  if (accountLog) {
    accountLog.push({
      trad: accountBalances(accts.trad, bal.traditional + bal.bondTraditional),
      roth: accountBalances(accts.roth, bal.roth + bal.bondRoth),
    });
  }
  ```
  This uses the same expressions the `trace` block uses, at the same point (end-of-year balances, after the kept pass).
  Confirm that the row's year-end balances and the trace's `tradPool` / `rothPool` are read at this point. Confirm that no
  `continue` skips this point on a year that pushes a row, so that `accountLog[i]` lines up with `rows[i]`.
- [ ] `engine.md`: one bullet next to the trace description. `accountLog` is an opt-in output: one `{ trad, roth }` entry
  (four slot dollars each, in `ACCOUNT_SLOTS` order, including each slot's bond share) per row, written only when passed.
  The export uses it.
- [ ] Vitest `tests/unit/us/account-log.test.js`. Use `world()`, build a context with `w.ctx()`, and call
  `runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA, retireAgeB, accountLog })`.
  1. `accountLog.length === rows.length`.
  2. The rows of a run with the option `toStrictEqual` the rows of a run without it (same context factory, two contexts). This
     proves it observes and nothing else.
  3. A plan with `bondYears: 0`, no inherited accounts, and distinct opening balances in all eight accounts. For every year:
     - the four trad slots sum to `row.traditional`
     - the four Roth slots sum to `row.roth`

     Write the tolerance out, as CLAUDE.md rule 2 requires: `Math.abs(sum - pool) <= 1e-6 * Math.max(1, pool)`.
  4. Year 0 of a plan with no contributions, conversions or draws in year 0 (`ageA` already retired, `spending` covered by
     Social Security): each slot equals its opening balance times the year's growth. Compute this by hand from
     `returnRate`, with the same written-out tolerance.
  5. A single-person plan: the B slots are 0 on every row.
  Run the file alone and with `--sequence.shuffle`.
- [ ] Commit: "US engine: an opt-in accountLog of per-account balances".

### Task 2: the CSV columns (both countries)

**Files:**

- `src/shared/ui/plans/export-and-print.js`
- new `src/us/ui/plans/csv-columns.js`
- new `src/canada/ui/plans/csv-columns.js`
- new facades `src/us/ui/seam-csvColumns.js` and `src/canada/ui/seam-csvColumns.js`

- [ ] **US `csv-columns.js`** exports `csvColumns()`, which returns `{ columns, fileStem }`.
  - It runs the US projection once with `accountLog`: `const ctx = storeContext()`, the same context `simulateFresh()`
    builds, so the rows equal `simulate()`'s.
  - The column functions read `rows[i]` and `log[i]`.
  - It returns the rows too, so the writer does not call `simulate()` a second time.
  - Imports: `storeContext` (`us/core/projection/store-context.js`), `runProjection`, `STANDARD_MODE`, `standardYearSource`.
    This is the same store-layer path the `__test_accountTrace` hook uses, minus `ensureTestPlan`, which is test-only.
- [ ] **Canada `csv-columns.js`** exports the same shape, with rows from `simulate()` and no log.
- [ ] **`export-and-print.js` `exportCsv()`:**
  - `const { rows, columns, fileStem } = csvColumns()`
  - header row from the labels
  - each cell is `col.value(row, i)`; if `col.money` and the value is a number, it is `displayValue(value, row.year)`
  - blank for `''`, `null` or `undefined`
  - numbers are written with full precision, as today; no rounding
  - file name `${fileStem}-${mode === 'real' ? 'todays' : 'future'}-dollars.csv`
- [ ] Remove the old column list. Keep the blob/link code as it is.
- [ ] Check `tests/closure_names.js`, `tests/ui_cycles.js` and `tests/no_bare_imports.js` after `npm run analyze`.
- [ ] Commit (with the badge, README and inputs-and-ui.md changes): "CSV export: income, withdrawals, spending, taxes, saving
  and per-account balances (V170/V77)".

### Task 3: the report's cash-flow table (both countries)

**Files:** `src/us/ui/plans/print-report.js`, `src/canada/ui/plans/print-report.js`, and `src/shared/styles/styles.css` if
needed.

- [ ] After the year-by-year table, add `<h2>Year-by-year cash flow</h2>` and a `pr-proj` table built from
  `cashFlowParts(row, prev)`:
  - `prev` is the previous row's `investable`, or null for year 0, as the chart passes it. Check
    `src/shared/ui/charts/cash-flow-chart.js` for the exact argument.
  - Columns: Age, then each `in` part, then each `out` part, then "Roth conversion" / "RRSP meltdown" (the parts'
    `conversion`).
  - Header labels come from `CASH_FLOW_LABELS` (`#country/ui/seam-CASH_FLOW_LABELS`). In the US, label `rmd` with
    `rmdWithSepp` when any row's `sepp72 > 0`, as the chart does; check how the chart chooses it.
  - Money goes through `displayValue`.
  - Drop any part column that is under $1 in every row, so the printed table holds only what the plan uses. Age, Taxes and
    Spending are always shown.
  - Add one sentence to the disclaimer paragraph: "Cash flow" shows where each year's money came from and went. Money in
    equals money out, apart from rounding.
- [ ] Key results: add "Lifetime taxes (est.)", the sum of `displayValue(r.tax, r.year)` over all rows.
- [ ] Key assumptions: add "Current balances".
  - US: taxable, cash, and each retirement account that is not zero. Name the accounts as the CSV does, and show Partner B's
    only when there is a couple.
  - Canada: non-registered, RRSP, TFSA, FHSA if there is one, and cash. Read the Canada state fields from the
    `currentInvestable` line (`state.traditional`, `state.roth`, ...).
- [ ] Check the print layout. The new table must fit the page width in the print preview, in Playwright
  `page.emulateMedia({ media: 'print' })`. If it is too wide, use a `.pr-flow` class with a smaller font, the same pattern as
  `.pr-proj`.
- [ ] Commit: "Printed report: a year-by-year cash-flow table, lifetime taxes and current balances".

### Task 4: the UI test and docs

**Files:** new `test_export_report.js` (repo root), `docs/architecture/test-inventory.md`, `docs/architecture/inputs-and-ui.md`.

- [ ] **US export checks.** For the US planner (built `dist/Planner_US.html`):
  - Before clicking, set `window.print = () => {}` with `page.evaluate`.
  - Click `#exportCsvBtn` inside `page.waitForEvent('download')` and read the file.
  - The file name ends `-todays-dollars.csv` (the default mode is real).
  - The header has the expected column count.
  - The data row count equals `window.fireProjectionRows.length`.
  - "Year index" is 0..n-1, and "Calendar year" starts at the current year.
  - For row 0, "Net assets" equals `fireProjectionRows[0].total`, as a number (real and nominal are equal in year 0).
- [ ] Switch to future dollars (`#dollarModeBtn`, then `#nominalBtn`) and export again. The file name ends
  `-future-dollars.csv`, and a late row's "Net assets" equals `fireProjectionRows[k].total`, written out as text.
- [ ] Set a single-person plan through the existing state hook (see how other root scripts set state). The Partner B columns
  are empty.
- [ ] **Per-account check.** With `bondYears` 0, the per-account trad columns add up to "Traditional (all)" within $0.01 on
  every row.
- [ ] **Print report.** Click `#printReportBtn`. `#printReport` holds both tables, and the cash-flow table's header includes
  "Taxes" and "Spending". For every row, money in equals money out within $2 after rounding: compare the parsed cells.
- [ ] **Canada.** Load `dist/Planner_Canada.html` and export. The header holds "RRSP/RRIF (household)" and
  "TFSA (household)" and no "Roth". The file name starts with `fire-planner-canada-`.
- [ ] The script exits 1 on any failure and uses locator waits only.
- [ ] `test-inventory.md`: add a line for `test_export_report.js` and for `tests/unit/us/account-log.test.js`.
- [ ] Commit: "Tests: the export and report UI script".

### Task 5: verification

- [ ] `npm test`: everything passes, exact, with no snapshot changes. If a snapshot moves, stop: the engine changed.
- [ ] `node tests/ui_scripts.js test_export_report.js`, plus the existing scripts that touch the topbar (search the test
  inventory for `printReport` / `exportCsv`; none expected).
- [ ] `node tests/bench_runs_interleaved.js`: the US gate is not slower. The new branch is one null check per year.
- [ ] Mobile check (390×844): the topbar buttons are unchanged, and `scrollWidth > clientWidth` is false.
- [ ] Open both built files, export, and open the CSV in a spreadsheet-like check (parse with a CSV reader). Every row has
  the same cell count as the header.

## Out of scope

- A per-partner RRSP/TFSA ledger for Canada.
- New engine row fields: the federal/state/payroll tax split, ACA credit and IRMAA as separate figures. Rows hold only the
  totals; adding fields would change the row shape and the snapshots.
- Historical and Monte Carlo exports: the CSV stays the plan's projection.
- Printing the per-account balances in the report.

## Plan review fixes (Opus, 2026-11-06): these override the sections above

1. **US withdrawal labels.**
   - "RMD" becomes "RMD (incl. 72(t))": `rmd` includes `sepp72` (distributions.js `rmdA += sepp72A`).
   - "From traditional" becomes "From traditional (incl. RMD, 72(t), inherited IRA)": `traditionalWithdrawn` already holds
     `inheritedDraw`.
2. **US balance labels.**
   - "Traditional (all)" becomes "Traditional (all, incl. inherited; excl. bonds)", and "Roth (all)" likewise. The per-account
     note says the four slots add up to the account type's stocks plus bonds, excluding the inherited accounts.
   - The per-account columns say "by original owner": after a death, the deceased's slots hold what the survivor inherited.
3. **Income labels, both countries.**
   - US `income` and Canada `grossIncome` are "Income before deductions (est.)". They are gross totals: full Social Security,
     traditional draws and realized gains, before deductions.
   - `magiProxy` is "MAGI (est., household)".
   - Fix the report disclaimer's description of "Income" to match: it includes realized brokerage gains, and no deductions are
     taken.
4. **Canada labels.**
   - `tax` is "Taxes (before income-tested benefits)".
   - `oasClawback` is "OAS recovery tax (deducted from CPP/OAS, not in taxes)".
   - `ss` is "CPP / OAS (after recovery tax)".
   - `cash` is "Cash / HYSA (incl. FHSA)".
   - In the report's Canada "Current balances", FHSA is listed on its own (the input). That is fine; the CSV note covers the
     difference.
5. **US 162(l) carry column.** Add "162(l) carry received" (`seSettlementIn ?? 0`) to Income. In the report, "Lifetime taxes
   (est.)" sums `row.tax`; the cash-flow table's Taxes column is the parts' tax, which adds a negative carry. The disclaimer
   notes they can differ in carry years.
6. **Run entry point.** No UI module calls `runProjection` directly.
   - Add `simulateWithAccountLog(ctx)` to `src/shared/core/projection/runs.js`, next to `simulateWith`. It returns
     `{ ...simulateWith-style result, accountLog }` by passing `accountLog` through `runProjection`.
   - The Canada `runProjection` ignores the option, so the Canada log stays `[]`.
   - The US `csv-columns.js` calls it with `storeContext()`.
   - `exportCsv` and the print handler call `flushRender()` first, so the file and report match the table even when a deferred
     pass is pending.
7. **Report balance check.** Each cash-flow cell carries a `data-value` with the unrounded display value. The UI test checks
   |in − out| ≤ 1 per row on those values, not on the `money()` text.
8. **Docs.**
   - `module-system.md`: add `csvColumns` to the `ui/` seam list and raise the seam count (29 → 30).
   - `docs/reference.md`: add a dated entry (this work is outside the batch plan).
9. **Vitest.**
   - Test 3 is replaced: year 0 slot balances equal the opening balances times growth, for a plan with no contributions,
     conversions, draws or bonds in year 0. Read the engine's year-0 growth before hand-computing.
   - Test 4 is dropped (merged into 3).
   - Use `makeCounter` and an `afterAll` count for the per-row loops.
   - Also check that the log's slot totals equal the Task 2 UI sum, through the Playwright per-account check.
10. **Playwright.**
    - Set state with `__test_replaceState`, then click `#realBtn`, then `__test_flushRender()` (the `test_sankey.js` pattern).
    - Read `#printReport` through `evaluate` / `innerHTML` (it is `display:none` outside print).
    - Stub `window.print` before clicking print.
11. **Chart parity.**
    - Choose `rmdWithSepp` when any `r.sepp72 >= 1`, and guard for Canada, which has no such label.
    - `payrollPremiums` moves from Saving to Spending as "Payroll health premiums (not in spending)". Check whether `expenses`
      excludes them; it does not include them.
12. **Calendar year.** "Calendar year" stays `CURRENT_YEAR + row.year`, the same as the chart's year axis.
