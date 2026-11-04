# Yearly Cash-Flow Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth chart group, **Cash flow**, in both planners: one bar per projection year showing money in (by source and
account) and money out (taxes, spending, contributions, cash top-up, reinvestment), in three selectable styles, with a
swatch-keyed tooltip.

**Architecture:** Each planner's `runProjection` row gains a few display-only numeric fields that record flows the year
already computes. One shared, DOM-free function `cashFlowParts(row, prevInvestable)` maps a row (either planner) to in / out
parts; a Vitest balance check proves money in = money out (within $1) for every year of a scenario set. A shared canvas
renderer draws the three styles from those parts and owns its hover / tap tooltip.

**Tech Stack:** plain ES modules under `src/`, esbuild bundle, canvas 2D, Vitest (`tests/unit/`), Playwright root UI scripts.

**Spec:** `docs/superpowers/specs/2026-11-04-cash-flow-chart-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- Read `CLAUDE.md` before starting. Edit `src/`, never `dist/`.
- The new row fields are display-only: no engine path reads them, and every existing row field, total, golden figure and
  estate stays bit-identical. `npm test` stays exact to the cent.
- Every new row field is present on **every** row of both standard and historical runs, as a number (0 when nothing
  happened): one row shape (`tests/unit/*/historical-parity.test.js` compares every numeric key of standard vs historical).
- Hot paths allocate nothing new: scalars on the existing `wd` and row objects only; a module scratch is registered in
  `tests/engine-purity.json` (kind `"scratch"`) in the same commit.
- New engine values that a MAGI pass sets are declared inside the pass body (the block that holds
  `const { traditionalGross, ... } = wd;`, US `run-projection.js:1377`, the same block that builds `row` at :2721), so each
  pass sets them afresh; never as a year-level `let` (that would need `scalarSnapshot`, `CLAUDE.md` "MAGI iteration").
- Copy is descriptive, never advice: "drawn", "this projection draws"; never "you should", "recommended".
- Field names (fixed here; the spec left them to the plan): `cashWithdrawn`, `homeWithdrawn`, `rothWithdrawn` (Canada: the
  TFSA draw; the spec's `tfsaWithdrawn`, renamed to match the US field so one shared parts function reads both),
  `cashTopUp`, `reinvested`, `toBondReserve`, `contributions`, `oneTimeCash`, `inheritedRothPayout` (US), `taxableSaleForTax`,
  `shortfall`; Canada also `meltdown`.
- Module placement (review I5): the parts function is chart formatting, not an engine function, so it lives in
  `src/shared/core/format/` (not `core/analysis/`, whose modules seed the engine-purity closure and take `ctx` first); the
  labels are UI copy in `src/<country>/ui/charts/`, reached through `#country/ui/seam-CASH_FLOW_LABELS`.
- README and the badges change in the first user-facing commit (Task 4), per `CLAUDE.md`.
- New `ui/` and `core/` modules: line 1 a one-line `//` purpose comment, then a blank line; two-space body indentation like
  their neighbours; `npm run analyze` after adding them.
- Version badges: US `V156` → `V157`, Canada `V67` → `V68` (`<h1>` of `src/<country>/index.html`); if `main` bumped them
  first, take the next number.
- No push, merge or PR unless the owner asks.

## Review Focus

1. **A depleted run** (money runs out at, say, 80): the bars must still balance (Shortfall segment, spec 3.1c), the
   tooltip shows the red Shortfall line, and the withdrawal rate never divides by zero (previous `investable` 0 → omit the
   rate). Test: Task 2 scenario `depleted`, Task 1 `withdrawal rate omitted when start investable is 0`.
2. **Single person and the survivor years:** the tooltip header shows one age for a single person; after a death the bars
   still balance. Test: Task 2 scenario `survivor` (A dies at 75), Task 5 single-person header check.
3. **Future-dollars mode:** every drawn and tooltip figure is `displayValue(raw, row.year)`; the balance holds in raw
   dollars only (display rounding is not asserted to balance). Test: Task 5 toggles the dollar switch and compares a
   tooltip figure to `displayValue` of the raw part.
4. **A year with nothing in a category, or a run with no conversion:** zero items are absent from the tooltip and the
   legend never lists the asterisk. Test: Task 1 `zero parts are dropped`, Task 5 legend check on a no-conversion plan.
5. **Switching away and back:** leaving Cash flow restores the Log scale row and the projection sub-row, and the old
   projection hover works again (the cash-flow hover must not fire in other views). Test: Task 4 view-switch checks.

---

### Task 1: The shared parts function and the labels

**Files:**
- Create: `src/shared/core/format/cash-flow-parts.js`
- Create: `src/us/ui/charts/cash-flow-labels.js`, `src/canada/ui/charts/cash-flow-labels.js`
- Create: `src/us/ui/seam-CASH_FLOW_LABELS.js`, `src/canada/ui/seam-CASH_FLOW_LABELS.js` (one-line re-export, like
  `src/us/ui/seam-FIELDS.js`)
- Modify: `docs/architecture/module-system.md` (the seam-name count, 28 to 29, and the list if it names them)
- Test: `tests/unit/shared/cash-flow-parts.test.js`

**Interfaces:**
- Produces: `cashFlowParts(row, prevInvestable) -> { in: Part[], out: Part[], conversion: number, rate: number | null,
  excessRmd: number, bondReserve: number, saleForTax: number, sepp72: number }` where `Part = { key: string, value: number }`
  in raw dollars, in drawing order, values may be 0 (the caller drops `< 1`).
  - `in` keys, in order: `income` (`wages + oneTimeCash + max(0, seSettlementIn ?? 0)`), `lifetime` (`ss + pension +
    (benefits ?? 0)`), `rmd` (`rmd`), `traditional` (`traditionalWithdrawn - rmd`), `roth` (`rothWithdrawn + (inheritedRothPayout ?? 0)`), `taxable`
    (`taxableWithdrawn + taxableSaleForTax`), `cash` (`cashWithdrawn`), `home` (`homeWithdrawn`), `shortfall` (`shortfall`).
  - `out` keys, in order: `tax` (`tax + max(0, -(seSettlementIn ?? 0))`), `spending` (`expenses`), `contributions`,
    `cashTopUp`, `reinvested` (`reinvested`, which already includes `toBondReserve`).
  - `conversion`: `conversionAmount ?? meltdown ?? 0`.
  - `rate`: `(rmd + traditional + roth + taxable + cash + home) / prevInvestable`, or `null` when that sum `< 1`,
    `prevInvestable` is `null` or `< 1`, or the rate is over 1 (a near-depleted year).
  - `excessRmd`: when `traditional + roth + taxable + cash + home < 1` and `rmd - (sepp72 ?? 0) >= 1`:
    `min(rmd - (sepp72 ?? 0), cashTopUp + reinvested)`; else 0 (spec 3.5, 3.1b).
  - `bondReserve`: `toBondReserve`; `saleForTax`: `taxableSaleForTax`; `sepp72`: `sepp72 ?? 0`.
- Produces: `CASH_FLOW_LABELS` (per country, via `#country/ui/seam-CASH_FLOW_LABELS`): an object keyed by every `in` /
  `out` key plus `conversion`, `sepp72`, `rmdWithSepp`. US: income "Wages & other income", lifetime "Social Security /
  pensions", rmd "RMD", rmdWithSepp "RMD & 72(t)", traditional "Traditional", roth "Roth", taxable "Brokerage", cash "Cash",
  home "Home equity", shortfall "Shortfall (not funded)", tax "Taxes", spending "Spending", contributions "Contributions",
  cashTopUp "Cash top-up", reinvested "Reinvested in brokerage", conversion "Roth conversion", sepp72 "72(t) payments".
  Canada: lifetime "CPP / OAS / pensions / benefits", rmd "RRIF minimum", traditional "RRSP/RRIF", roth "TFSA", taxable
  "Non-registered", reinvested "Reinvested (non-registered)", conversion "RRSP meltdown", the rest as US (no `sepp72` /
  `rmdWithSepp` keys).
- Produces (for Task 4's seam rule): no other export.

- [ ] **Step 1: Write the failing tests** (`world()` + `w.load('shared/core/format/cash-flow-parts.js')`; hand-built rows,
  hand-computed literals, `toBe` / `toStrictEqual` only):
  - `US retirement year`: row `{ wages: 0, oneTimeCash: 0, ss: 30000, pension: 10000, rmd: 20000, traditionalWithdrawn:
    25000, rothWithdrawn: 4000, taxableWithdrawn: 6000, taxableSaleForTax: 0, cashWithdrawn: 1000, homeWithdrawn: 0,
    shortfall: 0, tax: 9000, expenses: 81000, contributions: 0, cashTopUp: 0, reinvested: 0, toBondReserve: 0,
    conversionAmount: 0, sepp72: 0 }`, prev 1000000 → `in` values `[0, 40000, 20000, 5000, 4000, 6000, 1000, 0, 0]`, `out`
    `[9000, 81000, 0, 0, 0]`, `rate` `0.036`, `excessRmd` 0.
  - `excess RMD`: only `rmd: 50000` drawn (traditionalWithdrawn 50000), `reinvested: 12000`, `cashTopUp: 3000` → `excessRmd`
    15000; with `sepp72: 40000` → `rmd - sepp72` = 10000 → `excessRmd` 10000.
  - `Canada row`: `benefits: 2000`, `meltdown: 15000`, no `conversionAmount`, `traditionalWithdrawn: 30000, rmd: 30000` →
    lifetime includes 2000, `traditional` 0, `conversion` 15000.
  - `negative 162(l) carry goes to tax`: `seSettlementIn: -500` → `income` excludes it, `tax` = row tax + 500; `+500` →
    `income` + 500, `tax` unchanged.
  - `withdrawal rate omitted when start investable is 0 or unknown`: prev 0 → `rate` `null`; prev `null` → `null`; prev 50
    with $10,000 drawn → `null` (over 100%).
  - `inherited Roth payout is a Roth draw`: `rothWithdrawn: 1000, inheritedRothPayout: 4000` → `roth` 5000, `income` unchanged.
  - `zero parts are dropped` is the caller's job: assert all nine `in` keys are present even when 0 (`toStrictEqual` on keys).
  - `labels`: load both countries' `ui/charts/cash-flow-labels.js` (DOM-free); every `in` / `out` key of the parts has a label in each.

- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/cash-flow-parts.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the three modules and two seams. Missing optional fields read as 0 (`?? 0`) only for the
  country-specific ones named above (`benefits`, `seSettlementIn`, `sepp72`, `conversionAmount`, `meltdown`,
  `inheritedRothPayout`); the fields
  Tasks 2-3 add are read directly (a missing one is a bug the balance check must catch, so do not default them).

- [ ] **Step 4: Run** the file, then `npx vitest run tests/unit/shared/cash-flow-parts.test.js --sequence.shuffle` — PASS.
  `npm run analyze`, then `node tests/engine_purity.js` and `node scripts/module-map.js --check --require-purpose` — PASS.

- [ ] **Step 5: Commit** `Cash-flow chart, task 1: cashFlowParts and the labels`.

### Task 2: US row fields and the US balance check

**Files:**
- Modify: `src/shared/core/withdrawals/draws.js` (`takeCash`: `wd.cashWithdrawn += from`)
- Modify: `src/us/core/withdrawals/draws.js` (`newWithdrawal` gains `cashWithdrawn: 0, cashKept: 0, saleForTax: 0`;
  `fillTraditional` and `fillTraditionalSplit` add the after-tax proceeds they credit to `bal.cash` to `wd.cashKept`)
- Modify: `src/us/core/projection/year-modes.js` (`routeSurplus` writes a module scratch `SURPLUS_OUT = { cashTopUp,
  toBonds, toTaxable }`; register `SURPLUS_OUT: "scratch"` in `tests/engine-purity.json`)
- Modify: `src/shared/core/withdrawals/bond-ladder.js` (spec 3.1a): the withdrawal-year refill (`:86-91`) adds the tax part
  of its taxable sale (`d.taken - d.net`) to `wd.saleForTax`; the pre-retirement rotation (`:32-37`) runs before `wd` exists
  (US :1276, `wd` at :1284), so it writes a module scratch `LADDER_OUT = { saleTax: 0 }` (registered `"scratch"`), reset to 0
  at the top of `rotateIntoBondLadder` (the early returns at :17 and :32 must not leave a stale value), read right after the
  call
- Modify: `src/us/core/projection/run-projection.js` (the row literal at :2721 and the few lines that set the new values)
- Modify: `src/canada/core/withdrawals/draws.js` (`newWithdrawal` gains `cashWithdrawn: 0, saleForTax: 0` so the shared
  `takeCash` and bond-ladder changes have fields to add to; the rest of Canada is Task 3)
- Test: `tests/unit/us/cash-flow-balance.test.js`

**Interfaces:**
- Consumes: `cashFlowParts` (Task 1).
- Produces: every US row carries `cashWithdrawn`, `homeWithdrawn` (`wd.homeDrawn`), `cashTopUp`, `reinvested`,
  `toBondReserve`, `contributions`, `oneTimeCash`, `inheritedRothPayout`, `taxableSaleForTax`, `shortfall` (numbers, 0
  when nothing happened).

Field meanings (US):
- `cashTopUp`: `oneTimeCash + inheritedRothPayout` (both credited to cash outside `flow`; the `sweepExcessCash` that follows
  is an internal move) plus, in a surplus year, `SURPLUS_OUT.cashTopUp`; in a deficit year, `wd.cashKept` plus the forced
  pass's cash credit `forcedRefund + (totalTax before - taxAfter)` (`:1796-1819`).
- `reinvested`: surplus year: `SURPLUS_OUT.toBonds + SURPLUS_OUT.toTaxable`; `toBondReserve`: `SURPLUS_OUT.toBonds`.
  Deficit year: 0 unless the balance check finds a path that adds to taxable from the year's cash.
- `contributions`: the employee contributions the year's flow subtracts (`traditionalContrib + rothContrib`); employer match
  excluded (spec 3.2).
- `oneTimeCash`: `oneTimeAmount` (`:1269`); `inheritedRothPayout`: `inhRothPayout` (`:1270`; drawn as Roth, an account
  draw, not income).
- `shortfall`: `wd.need` after the draws when `> 0` in a deficit year, else 0.
- `taxableSaleForTax`: `LADDER_OUT.saleTax` (read right after the rotation call) + `wd.saleForTax`.
- Declare `let cfCashTopUp = 0, cfReinvested = 0, cfToBonds = 0, cfForcedCash = 0, cfLadderTax = 0;` in the pass body just
  before `if (flow >= 0) {` (around :1291; a `const` inside the branch is invisible to the row at :2721); assign them right
  after `routeSurplus` (from `SURPLUS_OUT`), after the rotation call and in the forced-refund block; the row reads them.
  Pass-body `let`s need no `scalarSnapshot`. The pass loop starts at :686 (`for (let iter = 0; ; iter++)`), so the rotation
  (:1276), the branch (:1291) and the row (:2721) are all inside it.

- [ ] **Step 1: Write the failing balance test.** For each scenario, run the planned run the chart shows: `e.simulate()`
  (`tests/unit/helpers/engine.js`; cached, so read only, never write a row), not `e.simulateRaw()`, which in the US skips
  `ensureTestPlan`, so no cliff-plan year (fill, cap, order, split) would run;
  and for every row `i` assert `Math.abs(sum(in) - sum(out)) <= 1` using `cashFlowParts(row, i ? rows[i - 1].investable : null)` (written out as a tolerance, `CLAUDE.md` rule 2). Report the failing year and both sides on failure
  (counted checks with `makeCounter`, `afterAll` count). Scenarios (each a `w.setState` patch; at least one row of each must
  have the named feature non-zero, asserted, so a scenario cannot pass vacuously):
  - `working` (couple, 45/43, wages, 401(k) traditional + Roth contributions, a surplus to brokerage);
  - `surplus` (retired, pension > spending: `reinvested > 0`);
  - `reserve` (cashReserve 50000 starting at 0 cash: `cashTopUp > 0`; bondYears 3: `toBondReserve > 0`);
  - `rmd` (large traditional, age 72 → 90: `rmd > 0`, one year with excessRmd > 0);
  - `conversion` (cliff plan with a conversion ladder: `conversionAmount > 0`);
  - `fill` (a cliff-plan year whose `cliffChoice` starts "filled to": `cashTopUp > 0` in a deficit year; find a household
    that produces one in `tests/unit/us/plan-*.test.js` or `tests/cliff_plan.js`);
  - `split` (a two-return year with `drawSplit` set: reuse `tests/unit/us/split-draw.test.js` / `two-return-split.test.js`;
    split draws re-price the share between draws, so check that the per-draw taxes sum to `tax`);
  - `forced` (an ACA year with a forced pass and a refund, trace `forcedRefund > 0`: reuse `tests/unit/us/aca-reconcile.test.js`
    or the forced cases of `se-settlement.test.js`);
  - `home` (tenure own, small portfolio: `homeWithdrawn > 0`);
  - `depleted` (rent, small portfolio: `shortfall > 0`);
  - `survivor` (A dies at 75);
  - `inherited` (an inherited IRA and Roth: reuse `tests/unit/us/` inherited setup or `test_inherited_accounts.js` inputs);
  - `selfEmployed` (`seOn`, with a 162(l) carry: reuse `tests/unit/us/se-carry.test.js`'s switch);
  - `ladder` (early retiree with the pre-retirement bond ladder selling taxable: `taxableSaleForTax > 0`);
  - `oneTime` (a tax-free one-time income: `oneTimeCash > 0`);
  - `bucket`: the `reserve` household through `e.simulateHistoricalRaw((y) => HIST[i + y])` from a down-year start (one
    historical path in bucket mode; not `runHistoricalCyclesRaw`, which runs every cycle).
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/cash-flow-balance.test.js` — Expected: FAIL (fields undefined → NaN).
- [ ] **Step 3: Add the fields** as specified above. Then run the test; for each year still off by more than $1, find the
  flow (in the order the spec 5.2 lists: cash credits/debits, where the surplus lands, the forced refund at :1818, the
  162(l) carry, the inherited draws, the bucket trims) and record it on the right side. If a flow has no honest side, stop
  and report it (do not add a plug). Write each finding (flow, line, side) into the test file's header comment.
- [ ] **Step 4: Run** the balance test (PASS), then `npm run test:unit:us` and `npx vitest run --sequence.shuffle
  tests/unit/us/cash-flow-balance.test.js` (PASS), `node tests/engine_purity.js` (PASS), `node tests/golden.js` (PASS after
  `npm run build`), and the bench: `git worktree add <tmp> <commit before Task 2>`, `npm install` and `node scripts/build.js`
  inside it, then `node tests/bench_runs_interleaved.js --base <tmp> --warm-analysis` (no slowdown beyond its noise band).
- [ ] **Step 5: Commit** `Cash-flow chart, task 2: US row fields and the balance check`.

### Task 3: Canada row fields and the Canada balance check

**Files:**
- Modify: `src/canada/core/withdrawals/draws.js` (`newWithdrawal`: `rothWithdrawn: 0, homeDrawn: 0`, since `cashWithdrawn`
  and `saleForTax` came in Task 2;
  `takeRoth`: `wd.rothWithdrawn += from`)
- Modify: `src/canada/core/withdrawals/strategies.js` (`:46`, `:77`: `wd.homeDrawn +=` the home draw, as the US does at
  `src/us/core/withdrawals/strategies.js:104-106`)
- Modify: `src/canada/core/projection/year-modes.js` (`routeSurplus` → `SURPLUS_OUT`, registered)
- Modify: `src/canada/core/projection/run-projection.js` (row literal at :336 and the lines that set the values)
- Test: `tests/unit/canada/cash-flow-balance.test.js`

**Interfaces:**
- Consumes: `cashFlowParts` (Task 1); the shared `takeCash` change (Task 2).
- Produces: every Canada row carries `cashWithdrawn`, `homeWithdrawn`, `rothWithdrawn`, `cashTopUp`, `reinvested`,
  `toBondReserve`, `contributions` (`traditionalContrib + rothContrib + fhsaContrib`), `oneTimeCash` (`oneTimeAmount`,
  `:264`; also added to `cashTopUp`), `taxableSaleForTax`, `shortfall`, `meltdown` (`meltdownAmount`). Canada has no MAGI
  passes; read `SURPLUS_OUT` / `LADDER_OUT` into locals right after their calls.

- [ ] **Step 1: Write the failing balance test**, same shape as Task 2. Scenarios: `working` (RRSP + TFSA + FHSA
  contributions), `surplus`, `reserve` (cash and bond reserve), `rrif` (`rmd > 0`), `meltdown` (`meltdown > 0`), `home`,
  `depleted`, `survivor`, `benefits` (a low-income senior: `benefits > 0`, GIS), `oneTime`, `bucket` (first historical cycle).
- [ ] **Step 2: Run** `npx vitest run tests/unit/canada/cash-flow-balance.test.js` — FAIL.
- [ ] **Step 3: Add the fields**; chase residuals as in Task 2 Step 3 (Canada specifics: `tax` is gross of benefits and
  excludes the OAS recovery, `ss` is net of it; spec 3.2).
- [ ] **Step 4: Run** the test, `npm run test:unit:canada`, the shuffle run, `node tests/engine_purity.js`, and
  `npm run build && node tests/golden.js` — PASS.
- [ ] **Step 5: Snapshots.** The row hashes move because every row gains keys. Confirm nothing else moved: dump the
  baseline (`git worktree add <tmp> <commit before Task 2>`, then `npm install` and `node scripts/build.js` inside it:
  `dist/` is gitignored) and the current tree per the recipe in
  `tests/snapshot.js:41-45`, compare with `--ignore` listing every new key; expected 0 scenarios moved. Then
  `npm run snapshot:update` (both `tests/snapshot.js` and `tests/snapshot_ui.js`, which hashes `fireProjectionRows`), and add
  a line to the "Baseline moves by design" comment in `tests/snapshot.js` (the
  cash-flow fields, display-only, 0 moved with `--ignore`, owner-approved design 2026-11-04).
- [ ] **Step 6: Commit** `Cash-flow chart, task 3: Canada row fields, balance check, snapshot baseline (by design)`.

### Task 4: The view, the Style row and the bars

**Files:**
- Modify: `src/shared/partials/chartRotateHint.html` (button `#chartGroupCashFlowBtn` "Cash flow" after Monte Carlo; a
  new row `#cashFlowStyleRow`, `hidden` by default, holding `.chart-view-toggle` `#cashFlowStyleToggle` (role radiogroup,
  aria-label "Cash flow chart style") with buttons `#cashFlowStyleBarsBtn` "Bars + lines", `#cashFlowStyleInOutBtn`
  "In / out", `#cashFlowStyleSimpleBtn` "Simple", same margins as `#projectionSubToggle`)
- Modify: `src/shared/styles/styles.css` (`#chartLogScaleRow[hidden],#cashFlowStyleRow[hidden]{display:none!important}`
  next to the existing toolbar `[hidden]` rule, styles.css:111: `#chartLogScaleRow` has an inline `display:flex`)
- Modify: `src/shared/core/format/charts.js` (`CHART_GROUPS.cashflow = 'cashflow'`; `CASH_FLOW_COLORS`: a fixed key →
  `{ light, dark }` map for every `in` / `out` key, chosen with the `dataviz` skill; `shortfall` the only red; `tax` not red)
- Modify: `src/shared/core/chart-prefs.js` (`export let cashFlowStyle = 'bars'` + `assignCashFlowStyle(next)`; values
  `'bars' | 'inout' | 'simple'`; amend the header comment: this one is kept across reloads by the UI, in localStorage)
- Modify: `README.md` (feature list, both planners: the Cash flow chart and its three styles) and the badges
  `src/us/index.html` `V156` to `V157`, `src/canada/index.html` `V67` to `V68` (the first user-facing commit)
- Create: `src/shared/ui/charts/cash-flow-chart.js` (`renderCashFlowChart(rows)`, `wireCashFlowControls()`,
  `initCashFlowHover()`)
- Modify: `src/shared/ui/charts/chart-view-mode.js` (`groupMap.cashflow = 'chartGroupCashFlowBtn'`)
- Modify: `src/us/ui/charts/chart-controls.js`, `src/canada/ui/charts/chart-controls.js` (click on
  `#chartGroupCashFlowBtn` → `setChartView('cashflow')`)
- Modify: `src/us/ui/charts/chart-view.js`, `src/canada/ui/charts/chart-view.js` (at the top, next to the `mcPathCountRow`
  line (US :29): `#cashFlowStyleRow.hidden = chartView !== 'cashflow'` and `#chartLogScaleRow.hidden = chartView ===
  'cashflow'`, so every path that reaches a view (reset, undo, decision questions) sets them; then a `chartView ===
  'cashflow'` branch before the projection branches: title, subtitle, note, canvas `aria-label` (spec 6), `renderCashFlowChart(selected.rows)`,
  `return`)
- Modify: each `main.js` (call `wireCashFlowControls()` right after the chart controls' wiring call and before the first
  `render()` of the IIFE, so the stored style is in place for the first draw; `initCashFlowHover()` next to
  `initChartHover()`)
- Test: `test_cash_flow_chart.js` (repo root)

**Interfaces:**
- Consumes: `cashFlowParts`, `CASH_FLOW_LABELS` (through `#country/ui/seam-CASH_FLOW_LABELS`), `displayValue`,
  `xAxisLabel`, `chartAxisColor` / `chartGridColor`, `isDarkTheme`.
- Produces: `renderCashFlowChart(rows: Row[]) -> void` draws into `#chart` and fills `#chartLegend`; stores the last layout
  in a module `let lastCashFlow = { rows, parts, slot, pad, w, h, y }` for the hover (Task 5).
  `wireCashFlowControls()` reads the stored style (`localStorage.getItem('fireCouplePlanner.cashFlowStyle.v1')`, in
  try/catch; anything other than the three values → `'bars'`), calls `assignCashFlowStyle`, sets the three buttons'
  `active` / `aria-checked`, and on click assigns, writes `localStorage` (try/catch), updates the buttons and calls
  `render()` (through `#country/ui/seam-render`, as `chart-view-mode.js` does).

Drawing rules (spec 3.3, 3.4, 4): `prevInvestable` is `rows[i - 1].investable` for `i > 0` and `null` for `i = 0`, so the
first year's rate is left out (the start balances are not on the row; spec 3.5 as amended).
One slot per row; bar width `slot - gap` with `gap = slot >= 6 ? 3 : 1`; values in display dollars; x labels every 5th
age through `xAxisLabel`; y grid 5 steps; In / out: symmetric axis, heavier zero line (2.5 px), faint tint on the upper
half, "MONEY IN ▲" / "MONEY OUT ▼" labels; Bars + lines: solid step line `spending`, dotted step line `tax + spending +
contributions + cashTopUp`, the hatch pattern overlaid on the top `reinvested` of the stacked in-bar's height (that band lies between the dotted line and the bar top, since in = out); Simple: segments `income + lifetime`,
`rmd`, the other withdrawals, and `shortfall` when present, plus the dotted line. Lines use `chartAxisColor()`. Legend
(`#chartLegend`, same `<span><i class="swatch">` markup as the other views) lists the style's items that reach $1 in display dollars in some year of the run (the one threshold, display dollars,
used for bars, legend and tooltip alike),
plus "* Roth conversion" / "* RRSP meltdown" only when a row has `conversion >= 1`.

- [ ] **Step 1: Write the failing UI test** `test_cash_flow_chart.js` (pattern of `test_lump_income.js`; both
  `dist/Planner_US.html` and `dist/Planner_Canada.html`; `page.on('pageerror')`; exit 1 on failure; no fixed waits):
  - click `#chartGroupCashFlowBtn` → `#cashFlowStyleRow` visible, `#projectionSubToggle` hidden, `#chartLogScaleRow`
    hidden, `#chartTitle` text "Yearly cash flow";
  - for each style button: the button is `aria-checked="true"`, the canvas has non-background pixels, and `#chartLegend`
    contains the style's labels (Bars + lines: "Spending", "Spending + taxes"; In / out: "Taxes"; Simple: "Income");
  - choose In / out, reload, click Cash flow again → In / out is still active;
  - click Projection → `#chartLogScaleRow` and `#projectionSubToggle` visible again, `#cashFlowStyleRow` hidden;
  - 390×844 viewport, Cash flow view: `document.documentElement.scrollWidth > clientWidth` is false.
- [ ] **Step 2: Run** `npm run build && node test_cash_flow_chart.js` — FAIL (no button).
- [ ] **Step 3: Implement** the files above. Module-level initializers follow the load-time rule (`CLAUDE.md` "Initializers").
- [ ] **Step 4: Run** `npm run analyze`, `npm run build && node test_cash_flow_chart.js` (PASS), and
  `node tests/ui_scripts.js test_deferred_render.js test_spending_and_fi_widgets.js` (PASS: other views unaffected).
  Then `node tests/snapshot_ui.js`: the new button and hidden row move the text and hidden-element hashes; confirm only
  those moved, run `node tests/snapshot_ui.js --update`, and give the reason in the snapshot comment and the commit.
- [ ] **Step 5: Commit** `Cash-flow chart, task 4: the view, the Style row and the bars (US V157, Canada V68)`.

### Task 5: Tooltip, asterisk and touch

**Files:**
- Modify: `src/shared/ui/charts/cash-flow-chart.js`
- Modify: `src/shared/ui/install-test-hooks.js` (`window.__test_cashFlowParts = (i) => ({ raw, display })`: `raw` is
  `cashFlowParts(rows[i], i ? rows[i - 1].investable : null)` over `window.fireProjectionRows`, `display` the same parts with
  every value through `displayValue(v, rows[i].year)`, for the UI test)
- Test: `test_cash_flow_chart.js` (extend)

**Interfaces:**
- Consumes: `lastCashFlow` (Task 4), `cashFlowParts`, `CASH_FLOW_LABELS`, `money` (`format/numbers.js`).
- Produces: `initCashFlowHover()`: listeners on `#chart` (`mousemove`, `touchstart`, `touchmove` passive, `mouseleave`;
  a tap outside the chart hides it) that act only while `chartView === 'cashflow'`; the tooltip is its own element
  `#cashFlowTooltip` in `.chart-wrap` (style as `#chartTooltip`), never the projection hover's. Each tooltip item is
  `<div class="cf-item" data-key="<key>" data-value="<display value, unrounded>">` with a swatch (filled square; solid
  dash; dotted dash; hatched square) and `money(display value)`.

Tooltip content (spec 3.5): header `${year} · ages ${ageA} / ${ageB}` (single person: `${year} · age ${age}`; survivor
years: the survivor's age only, as the year table shows them); MONEY IN items (Simple: the three folded items, then the
muted per-account sub-line), the "RMD & 72(t)" label and a "72(t) payments" sub-line when `sepp72 >= 1` in the run,
"RMD beyond the year's need" under the RMD when `excessRmd >= 1`, the withdrawal-rate line when `rate !== null`; MONEY OUT:
In / out lists its five items; Bars + lines and Simple list "Spending" (solid), "Spending + taxes" (dotted) with a muted
sub-line naming the non-zero additions, and "Reinvested in brokerage" (hatched in Bars + lines) with "(incl. $X to the
bond reserve)" when `bondReserve >= 1`; the sale-for-tax note under Brokerage when `saleForTax >= 1`; the shortfall line
in red; the conversion line with "*". Items `< 1` and empty sections are left out. Asterisk: drawn above
`max(bar top, line)` of each row with `conversion >= 1`.

- [ ] **Step 1: Extend the UI test** (US with a Roth conversion plan, e.g. the inputs `test_conversion_schedule.js` uses;
  Canada with `meltdownEnabled`):
  - set the style explicitly before each hover check (the reload check leaves In / out active);
  - hover the middle of bar `i` (compute its x from the canvas rect and `rows.length`): `#cashFlowTooltip` visible; the set
    of `.cf-item` `data-key`s equals the keys of `__test_cashFlowParts(i)` whose `display` value is `>= 1` plus the line
    items of the style; each `data-value` equals the matching `display` value;
  - no `.cf-item` with a value under 1;
  - a converting year's tooltip has the conversion item; a plan with conversions off has no "* " legend entry;
  - switch to future dollars (`#nominalBtn`): a tooltip value changes and still equals the hook's `display` value;
  - single-person plan: header matches `/^\d{4} · age \d+$/`;
  - 390×844: `page.touchscreen.tap` on a bar shows the tooltip; tap outside hides it;
  - switch to Projection and hover: `#cashFlowTooltip` hidden, `#chartTooltip` shown.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run build && node test_cash_flow_chart.js` — PASS.
- [ ] **Step 5: Commit** `Cash-flow chart, task 5: tooltip, asterisk and touch`.

### Task 6: Docs and the full suite

**Files:**
- Modify: `docs/architecture/inputs-and-ui.md` (section "Sensitivity, chart preferences, Sankey, MCP and mobile": the view,
  `cashFlowStyle` as the one chart preference kept across reloads, its localStorage key; the hover is its own)
- Modify: `docs/architecture/engine.md` (the row's cash-flow fields, what each records, the balance check and its tests)
- Modify: `docs/architecture/test-inventory.md` (the two balance suites, the parts suite, `test_cash_flow_chart.js`)
- Modify: `tests/state_modules.js` if it lists the `chart-prefs.js` exports and defaults (add `cashFlowStyle`)

- [ ] **Step 1:** Write the doc changes.
- [ ] **Step 2: Run** `npm run analyze`, `npm test` (PASS, exact), `npm run test:ui` (PASS), `npx vitest run
  --sequence.shuffle` (PASS).
- [ ] **Step 3: Commit** `Cash-flow chart, task 6: architecture docs and the test inventory`.
