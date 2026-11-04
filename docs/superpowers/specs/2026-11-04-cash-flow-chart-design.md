# Yearly cash-flow chart (design)

Date: 2026-11-04. Status: approved design, pending the plan review. Owner decisions are marked **(owner)**; calls the designer made are marked
**(designer's call)** so the owner can check them.

## 1. Intent

The chart area shows total assets over time (Projection, Historical, Monte Carlo). It does not show, year by year, where the
money comes from and where it goes. The per-year Sankey card shows one year at a time and folds Roth, cash and home-equity
draws into one "From portfolio" plug.

The owner wants a per-year view of the main projection, modelled on a retirement tool's "Yearly cash flow in retirement"
chart: one stacked bar per year for the money coming in, lines or bars for the money going out, and a hover that lists the
year's figures. It should make clear how much the projection draws from each kind of account (traditional, Roth, brokerage,
cash) in each year.

**Framing (owner):** descriptive, never advice. The chart says what *this projection* draws and spends, not what anyone
should withdraw. Copy uses "drawn", "the projection draws", never "you should" or "recommended".

### Goals

- A fourth chart group, **Cash flow**, in both planners **(owner)**, showing the main projection's rows, one bar per year,
  every year of the projection including the working years **(owner)**.
- Three selectable styles of the same data **(owner: "include all 3 as optional views based on preference")**:
  - **Bars + lines** (the reference's look): money in as stacked bars; a solid line for spending and a dotted line for
    spending + taxes (+ cash top-up and contributions, section 3.3); the surplus reinvested in brokerage shown hatched at
    the top of the bar.
  - **In / out** (mirror): money in stacked above zero, money out stacked below zero; the two halves are equal each year.
  - **Simple**: three money-in segments (income, required withdrawals, other withdrawals) and one dotted line (total
    out); the per-account split lives only in the hover.
- A hover / tap tooltip that doubles as the legend: every line carries its color swatch or line type (solid / dotted /
  hatched) **(owner)**, and any item that is zero that year is left out **(owner)**.
- An asterisk above every bar whose year made a Roth conversion (US) or an RRSP meltdown (Canada) **(owner: "for now an
  asterisk"; meltdown = designer's call, it is Canada's analog)**; the amount is in the tooltip.

### Non-goals

- Historical and Monte Carlo paths **(owner: main projection only, for now)**.
- An "essential spending" input. Neither planner has one; the reference's essential / total pair becomes spending /
  spending + taxes **(designer's proposal, owner: "looks good")**.
- Changing any engine result. The new row fields are display-only (section 5).
- Replacing the Sankey card. It stays as it is.

### Anti-goals

- Anything that reads as a recommendation (see Framing).
- A chart whose in and out do not add up: in the In / out style the halves must match to the dollar (section 5.3).
- Horizontal page scroll at 390 px.

## 2. Where it lives

- A fourth button **Cash flow** in `#chartGroupToggle` (`src/shared/partials/chartRotateHint.html`), after Monte Carlo
  **(owner)**. A new `chartView` value `'cashflow'` with `CHART_GROUPS.cashflow = 'cashflow'`.
- Under the group row, in the place of the ±1 yr / ±3 yrs / CAGR row (hidden in this view), a **Style** row: `Bars +
  lines` / `In / out` / `Simple`, the same `.chart-view-toggle` radio-group markup and sizing as the other sub-rows.
- The X-axis row (Partner A age / Partner B age / Year) works as for the projection chart.
- The **Log scale** checkbox row is hidden in this view (stacked bars and a zero line have no meaning on a log axis), and
  entering the view does not change `logScale` **(designer's call)**.
- The shift-mode row, the Monte Carlo paths row and the two success cards stay hidden, as in the projection views.
- The chart title, subtitle, legend (`#chartLegend`) and note (`#chartViewNote`) get cash-flow copy (section 6).
- The style is a chart preference, but unlike the others it is **remembered across reloads** (the designer told the owner
  it would be): kept in `localStorage` under `fireCouplePlanner.cashFlowStyle.v1`, as `sidebar.js` keeps the sidebar
  state, read in a try/catch with `'bars'` as the fallback. It is not part of `state` or scenario export. The chosen
  *group* (Cash flow vs Projection) still resets on reload like `chartView` does today **(designer's call)**.

## 3. What is drawn

### 3.1 Money in (bottom to top, in this order in every style but Simple)

| Segment | US source | Canada source |
|---|---|---|
| Wages & other income | `wages` (pay, income streams, the taxable part of one-time income, net of health premiums) + new `oneTimeCash` (the tax-free one-time income and the inherited-Roth payout, credited straight to cash at run-projection.js:1269-1270) + a positive 162(l) carry `seSettlementIn` | `wages` + new `oneTimeCash` (`oneTimeAmount`, credited to cash at run-projection.js:264) |
| Social Security / pensions (US) · CPP / OAS / pensions / benefits (Canada) | `ss + pension` | `ss + pension + benefits` (the income-tested benefits are cash in; designer's call to fold them in, the tooltip lists them) |
| RMD (US) · RRIF minimum (Canada) | `rmd` (includes 72(t) SEPP payments; see section 3.1a) | `rmd` |
| Traditional (US) · RRSP/RRIF (Canada) | `traditionalWithdrawn - rmd` (`newWithdrawal` starts the field at the RMD, draws.js:75; includes inherited traditional draws) | `traditionalWithdrawn - rmd` (same) |
| Roth (US) · TFSA (Canada) | `rothWithdrawn` | new field (section 5) |
| Brokerage (US) · Non-registered (Canada) | `taxableWithdrawn` | `taxableWithdrawn` |
| Cash | new field | new field |
| Home equity (only when drawn) | new field (`wd.homeDrawn`) | new field (Canada draws on home equity in `withdrawStandard` and the bucket `home` step, strategies.js:46, :77; its `wd` does not track it today) |

**3.1a Tax paid from internal sales (designer's call).** The pre-retirement bond-ladder rotation and the bond-reserve
refill in a withdrawal year sell taxable stock and pay the sale's tax from the proceeds (`bond-ladder.js`:32-37, :86-91).
That tax is in the row's `tax`, so the money-in side shows the part of those sales that paid tax as a Brokerage draw
(new field `taxableSaleForTax`, folded into Brokerage; the tooltip says "incl. $X sold to pay tax on a reserve sale" when it
is at least $1). The rest of such a sale stays inside the account and is not drawn. The forced pass's refund (US :1818),
which lowers the row's `tax` and `expenses` and credits cash, is handled so the row's own figures balance; the builder
confirms its sides with the balance check.

**3.1b 72(t) payments (designer's call).** US `rmd` includes 72(t) SEPP payments (`distributions.js`:131-132; `sepp72` is
kept apart on the row). The segment is labelled "RMD" in a run with no 72(t) payment and "RMD & 72(t)" in a run with one;
the tooltip lists "72(t) payments" as its own line under it. The excess-RMD line (section 3.5) uses `rmd - sepp72`.

**3.1c Shortfall (owner).** In a year the projection runs out of money (`wd.need > 1` after every draw; the run's
`depletedAge`), the unfunded remainder is drawn as a red **Shortfall** segment at the top of the money-in bar, so the bar
still reaches the money-out line. New row field `shortfall` (the year's final `wd.need`, 0 otherwise). It counts on the
money-in side in the balance check (section 5.3); the tooltip shows "Shortfall (not funded) $X" in red. In Simple it is a
fourth segment, shown only in years that have one. Its red is reserved for it (no other segment uses a red hue).

**Simple** folds these into three: **Income** (the first two rows), **Required withdrawals** (RMD / RRIF minimum),
**Other withdrawals** (the rest).

### 3.2 Money out

| Item | Meaning |
|---|---|
| Taxes | the year's taxes and penalties as the row already reports them (US `tax`, which the Sankey labels "Taxes & penalties"; Canada `tax`, which is gross of the income-tested benefits and excludes the OAS recovery, run-projection.js:354, while `ss` is net of the recovery, :365: so benefits in and `tax` out count each once). It matches the year table's tax column. A negative 162(l) carry (a balance due, US) is added to Taxes |
| Spending | `expenses` (every spending category: base, housing, healthcare, long-term care, loans, extra and one-time expenses) |
| Contributions | the household's own contributions this year (US traditional and Roth employee contributions; Canada RRSP, TFSA, FHSA). Employer contributions are not household cash and are not drawn **(designer's call)** |
| Cash top-up | money moved into cash this year: the surplus that refills the cash reserve (`routeSurplus`'s `cashTopUp`) plus any draw proceeds kept as cash (the US fill-to-the-line traditional draw keeps its after-tax proceeds as cash) |
| Reinvested in brokerage | the surplus that goes to the taxable account, **including the bond-reserve fill** (`toBonds`) **(owner: no separate bond segment)**; the tooltip adds "incl. $X to the bond reserve" when that part is at least $1 |

Moves inside one account (bond-reserve refills inside traditional or Roth, the bucket mode's trims, the US pre-retirement
bond-ladder sale apart from the tax it paid, section 3.1a), and the `sweepExcessCash` move of cash above the reserve into
taxable (a move between two of the household's own accounts), are not cash in or out and are not drawn.

### 3.3 The styles

- **Bars + lines.** Stacked money-in bars. Solid line: Spending. Dotted line: Spending + Taxes + Contributions + Cash
  top-up (labelled "Spending + taxes" in the legend; the tooltip lists what it adds when non-zero). Reinvested in brokerage
  is drawn hatched in the top part of the bar, above the dotted line: by construction (section 5.3) the bar's top equals
  the dotted line plus the reinvested amount, so the hatched part sits exactly between them.
- **In / out.** Money in stacked upward from zero; Taxes, Spending, Contributions, Cash top-up, Reinvested stacked downward
  from zero, in that order. The zero line is drawn heavier than the grid (2.5 px vs 1 px), the money-in half has a faint
  tint, and the halves are labelled "MONEY IN ▲" / "MONEY OUT ▼" **(owner: make the division more visible)**. The y axis is
  symmetric (the larger of the two maxima on both sides) and labels show absolute values.
- **Simple.** The three folded segments and one dotted line (total out, as in Bars + lines). No hatching; reinvested money
  is in the tooltip.

Lines are step lines (flat across each bar's slot), as in the mockup, so a line value is read against the bar directly.

### 3.4 Asterisk

An asterisk centred above the bar (above the taller of the bar top and the line, in every style) in each year with
`conversionAmount >= 1` (US) or a meltdown amount `>= 1` (Canada). The legend gains "* Roth conversion" / "* RRSP
meltdown" only when the run has one.

### 3.5 Tooltip

Layout as the approved mockup (`cashflow-styles-v3`):

```
2041 · ages 70 / 68
MONEY IN
■ Social Security / pensions      $44k
■ RMD                              $34k
■ Roth                              $6k
  Withdrawal rate 2.9%
MONEY OUT
━ Spending                          $72k
┅ Spending + taxes                  $84k
  taxes $12k
▨ Reinvested in brokerage           $3k   (incl. $1k to the bond reserve)
* Roth conversion                   $20k
```

- Header: the year and both partners' ages (one age for a single person; the survivor's age only after a death, as the
  year table shows them).
- Each item: swatch (filled square in its color; solid dash; dotted dash; hatched square) and the full dollar amount in
  the app's `money()` format (not `$44k`, which was mockup shorthand).
- An item under $1 is left out **(owner)**; a section heading with no items is left out.
- **Withdrawal rate:** the year's withdrawals from savings (RMD + traditional + Roth + brokerage + cash + home equity)
  divided by the investable total at the start of the year (the previous row's `investable`; the first year's rate is
  left out, since the starting balances are not on the row: amended in the plan, designer's call), one decimal, shown only when withdrawals are at least $1. The reference tool shows this
  figure; it is descriptive ("the share of savings this projection draws"), not a target.
- **Excess RMD:** when the RMD alone exceeds what the year needed from savings, the tooltip adds "RMD beyond the year's
  need $X" under the RMD line (reference tool: "RMD in excess of withdrawal need"). X = the year's Reinvested + Cash top-up,
  capped at the RMD (designer's call: the money that went back into savings in a year whose only draw was the RMD).
  Shown only when there were no other withdrawals.
- In Simple, the per-account split is a muted sub-line under Other withdrawals ("Traditional $X · Roth $Y · ...").
- The dollars follow the app's 2026-dollars / future-dollars switch (`displayValue(n, row.year)`), as everything else.
- Touch: tapping a bar shows its tooltip; tapping outside hides it (the existing chart hover's touch handling).

### 3.6 Colors

Fixed hues from the validated palette in `format/charts.js` (`sankeyHue`), never cycled; the same item has the same color
in all three styles and in both planners. Money in and money out use separate hue sets where both are visible (In / out).
The builder picks the exact mapping with the `dataviz` skill's checks (contrast in light and dark, neighbours distinct).
The lines use the axis text color so they show in both themes.

## 4. Phone width (390 px)

- 40 to 60 bars at 390 px are about 5 px wide; the bar gap shrinks to 1 px below 6 px slots **(designer's call)**.
- The existing rotate hint and landscape full-screen apply unchanged.
- The Style buttons wrap like the other toggle rows; the page never scrolls sideways (`scrollWidth <= clientWidth`).
- Tap behaves as hover (section 3.5).

## 5. Data

### 5.1 Which run

The rows the year table and the projection chart's selected line use (the selected run the chart view already gets:
`renderChartView(selected)`), so the chart always agrees with the table. Cheap: no new simulation, so it draws in the light
render (no deferred pass needed).

### 5.2 New row fields

Each planner's `runProjection` row gains plain numeric fields, present on **every** row (one row shape; a zero when
nothing happened), written from values the year already computes. Proposed names (the plan fixes them):

- both: `cashWithdrawn`, `cashTopUp`, `reinvested`, `toBondReserve` (the part of `reinvested` that filled the bond
  reserve), `contributions` (the household's own contributions that left the year's cash flow);
- both: `shortfall` (section 3.1c), `homeWithdrawn`, `oneTimeCash` (section 3.1), `taxableSaleForTax` (section 3.1a);
- Canada: `tfsaWithdrawn`, `meltdown`.

They are display-only: no engine path reads them, no existing field or total changes, so the golden, parity and snapshot
numbers stay the same. (If the snapshot baselines record the full row, adding fields changes them; that is an intended
change and the commit says so.) The builder must check:

- `tests/unit/us/historical-parity.test.js` / its helper and any test that compares whole rows;
- the hot-path rules in `CLAUDE.md` (no allocation a year does not need: the fields are scalars on the row that is
  already allocated);
- `__test_freezeSimResults` (rows are shared: the chart never writes to a row);
- the MAGI iteration: a value read from `wd` after the kept pass is final; nothing new needs snapshotting unless the
  builder adds a mutable outside `wd` / `bal` (then `scalarSnapshot`).

What the builder must confirm in the code (not assumed here): what US and Canada `wages` hold in working and retired years;
whether Canada's row `tax` is gross or net of benefits and how `ss` nets the OAS recovery (so benefits and the recovery are
counted once); whether Canada has a home-equity draw; every place cash is credited or debited in a year (`takeCash`, the
fill-to-the-line proceeds, `routeSurplus`, the bucket refills) and every place the surplus or the year's flow lands.

### 5.3 The balance check

For every row, in raw (nominal) dollars:

  money in (section 3.1, all items) = money out (section 3.2, all items)

within $1. A Vitest suite asserts it for each year of a set of scenarios per planner that together exercise working years,
a surplus year, a deficit year, RMDs larger than the need, a Roth conversion / meltdown, a cash-reserve top-up, the bond
reserve, the US fill-to-the-line draw, a home-equity draw (US), inherited accounts and self-employment (US), the
income-tested benefits (Canada), both strategies (standard and bucket). If a flow is found that neither side covers, the
builder adds it to the right side (or reports it if it is a real engine question) rather than adding a plug.

The mapping from a row to the drawn segments is one pure function per planner, in `core/` (DOM-free, so the suite can call
it): `cashFlowParts(row)` → `{ in: [{ key, value }], out: [{ key, value }], conversion }` in raw dollars. The UI converts
to display dollars.

## 6. Copy

- Title: "Yearly cash flow". Subtitle: "What this projection brings in and draws from savings each year, and where it
  goes." The note: "Withdrawals are what this projection draws to cover the year, in the order your settings give. They
  are not a recommendation." (Canada words its accounts.)
- `aria-label` on the canvas: "Yearly cash flow: money in and money out by year".
- Legend (`#chartLegend`): the items of the current style with their swatches; the conversion / meltdown asterisk only
  when present.

## 7. Code placement (for the plan)

- `src/shared/core/format/charts.js`: `CHART_GROUPS` gains `cashflow`; `chartHoverEnabled()` is not used for this view
  (it has its own hover).
- `src/shared/core/chart-prefs.js`: `cashFlowStyle` + `assignCashFlowStyle` (the localStorage read and write happen in the
  UI module, not in core).
- `src/<country>/core/<topic>/cash-flow-parts.js` (the row mapping, section 5.3), per country since the fields differ;
  a shared core module if the two turn out identical apart from labels (then labels through the seam).
- `src/shared/ui/charts/cash-flow-chart.js`: draws the canvas and its own hover / tap tooltip; reads the parts through the
  country seam (`#country/core/seam-...`), the labels likewise.
- `src/shared/ui/charts/chart-view-mode.js`: the group button, the Style row visibility, the Log scale row visibility.
- Each country's `ui/charts/chart-view.js`: a `chartView === 'cashflow'` branch (title, subtitle, legend, note,
  `renderCashFlowChart(selected)`).
- Markup in `chartRotateHint.html`. `npm run analyze` after adding modules.
- E4 (US state relocation) is being specced in another session and will likely touch `run-projection.js`; this work keeps
  its US engine change to the row literal and the few lines that read the values, to keep a merge small.

## 8. Tests

- Vitest: the balance check (5.3) per planner; `cashFlowParts` on hand-built rows (each segment, the Canada RRIF
  subtraction, zero items dropped, the excess-RMD figure, the withdrawal rate).
- A root `test_cash_flow_chart.js` (Playwright, both built planners): the Cash flow button shows the view and the Style
  row and hides the comparison and Log scale rows; each style draws (canvas non-blank, legend items match); hovering a bar
  shows a tooltip whose items match `cashFlowParts` of that row in display dollars, with no zero items; the asterisk year
  matches a converting year; the style survives a reload; the 2026 / future dollars switch changes the tooltip figures;
  390×844: no horizontal scroll, the tap shows the tooltip.
- The existing suites: `npm test` (golden exact to the cent), `npm run test:ui`.

## 9. Docs and version

- README feature list (both planners' sections or the shared list): the Cash flow chart and its three styles.
- `docs/architecture/inputs-and-ui.md`: the chart view, the style preference (the one remembered chart preference), the
  row fields and the balance check; `engine.md` lists the new row fields.
- `docs/superpowers/inventory/module-map.md` via `npm run analyze`.
- Badges: US V156 → V157, Canada V67 → V68 (bump again if main moves first).

## 10. Left to the builder

- Exact field names, colors, bar gap, font sizes, the tooltip's position logic at the chart's edges.
- Whether the parts function is shared or per country (section 7).
- The scenario set for the balance check (5.3), as long as it covers the listed cases.
