# Cash flow diagram redesign (design)

Status: brainstormed with the owner on 2026-11-05; mockups in `.superpowers/brainstorm/` (not committed): `layout.html`,
`layout-v2.html`, `style-v3.html` (the approved look). Builds on PR #74 (the yearly cash-flow chart, merged), whose spec is
`docs/superpowers/specs/2026-11-04-cash-flow-chart-design.md` ("the bar chart spec" below).

## 1. Intent

The "Cash flow diagram" card (`#sankeyCard`, both planners) shows one year's money: sources on the left, a hub, uses on the
right. The owner finds it "scrunched together": every source and use sits in one column on each side, and Roth, cash and
home-equity draws are folded into a grey "From portfolio" plug, as is everything that goes back into savings ("To
savings"). The planner now has income streams, one-time income, extra and one-time expenses and loans, and since PR #74
every row balances money in against money out, so the diagram can show where each dollar came from and went without a
plug. Today the list rows have no names (only "Loan 1", "Expense 2"); the owner asked for an optional name on each row
(section 2.1) so the bands can read "New roof".

The model is ProjectionLab's cash-flow Sankey (the owner's reference): **individual items → groups → one total → groups →
individual items**, thin bars, gaps between bands, ribbons that blend from one color to the next.

### Goals

- Five columns: items in, groups in, the total, groups out, items out (section 3).
- No plug: every draw from savings has its own band (RMDs apart from other traditional draws, Roth, brokerage, cash, home
  equity), and "To savings" is split by where the money went (section 3.2).
- List items (each income stream, each one-time income, each extra and one-time expense, each loan) get their own band,
  labelled with the row's name when the user gave one (section 2.1), else its row title ("Expense 2").
- An optional **Name** on every list row (owner), section 2.1.
- The employer match is shown (owner): in as "Employer contributions" (Earned income), out as "Into traditional
  (employer)" / "Into RRSP (employer)", so the total includes it.
- Less boxy (owner approved `style-v3`): thin bars, centred columns at one dollar scale, gradient ribbons, small name over a
  bold amount.
- The layout is computed from the space it has (owner: "movable depending on the size of the screen"): the card on desktop,
  a full-screen view on desktop, and a full-screen view on a phone, upright or sideways (section 4).

### Non-goals

- No tax breakdown (federal / state / payroll). One Taxes band, plus the US early-withdrawal penalty as its own band when
  it is at least $1 (owner: "if need be we can do that later").
- No change to what the engine computes. New row fields are display-only (section 5.2).
- No drag-to-rearrange of bands (the owner's "movable" means the layout adapts to the screen; confirmed in the playback,
  not contradicted).
- Roth conversions / RRSP meltdowns are moves between the household's own accounts, not money in or out, and are not drawn
  (as in the bar chart). The Monte Carlo and historical views are not involved: the card keeps using the selected run.

### Anti-goals

- Never advice. Copy describes what this projection does ("draws", "puts into"), never what the user should do.
- Never a band that does not match the row: the groups come from the row's own figures; items only subdivide them.
- Never squish: below a minimum width the diagram scrolls sideways inside its own box rather than shrinking text; the page
  itself never scrolls sideways.

## 2. Where it lives

- The card stays where it is (`src/shared/partials/sankeyCard.html`), still a `<details>` computed only while open (its
  `renderOpenCards` hook and the deferred pass are unchanged), with the year slider.
- The year slider is lengthened (owner): it spans the full width of the card and of the full-screen view (today it sits in
  a `.field` capped at `max-width:420px`), with the label and the selected year ("Age 69 · 2038", both partners' ages in a
  couple, as the bar chart's tooltip header shows) on one line above it, and small start / end labels (first and last
  age) under its ends. Arrow keys still step one year (designer's call on the readout format).
- The card gains an expand button (⤢, as the main chart has) that opens the full-screen view (section 4.2).
- `computeSankeyFlow(row)` in each country (`src/<country>/ui/charts/compute-sankey-flow.js`) is replaced by a pure,
  DOM-free function in `core/` that returns the five columns (section 5.3); the drawing code in
  `src/shared/ui/charts/sankey.js` and the layout math in `src/shared/core/format/sankey-layout.js` are rewritten for five
  columns.

### 2.1 A name on each list row (owner)

The add-as-you-go lists in both planners (`src/<country>/core/inputs/dyn.js`: `loans`, `incomeSources`, `oneTimeIncome`,
`extraExpenses`, `spendingTiers`, `lumpExpenses`) gain an optional text field `name`:

- **Input:** the first field of each row, labelled per list so field search tells them apart ("Loan name", "Stream
  name", "Income name", "Expense name", "Change name"), placeholder from the row kind ("e.g. Car loan", "e.g. Consulting",
  "e.g. Inheritance", "e.g. Travel", "e.g. Early years", "e.g. New roof"); blank by default. The field renderer
  (`src/shared/core/inputs/dyn-fields.js`) has no text kind today: it gains one (`kind: 'text'`, `<input type="text">`,
  `maxlength` 40). Its `input` listener updates `state` and the row header but does not re-run the projection (a name
  changes no number; designer's call); an open Sankey redraws on `change`.
- **Row header:** "Loan 1 · Car loan" when named, "Loan 1" when not (escaped with `escapeHtml`, as the header is today).
  The undo label ("Removed loan 1") is unchanged.
- **State:** `name` is a string on the row object; `fresh()` rows get `''`. The list normalizers (`normalizeLists` in
  `src/shared/core/inputs/lists.js`, and the US `normalizeUsStreams` / `normalizeUsLumps` where they rebuild rows) keep a
  string, trimmed and cut to 40 characters, and turn anything else into `''`. Old saves load with blank names. Scenario
  export / import, undo, reset and the URL or saved-plan paths carry it like any other row field.
- **The engine never reads `name`, and a name changes no number, seed or fingerprint.** Two places hash the whole input
  state today and would otherwise change when a name is typed or when old saves gain `name: ''`: the Monte Carlo seed
  (`monteCarloSeed`, `simulate.js`, which would re-draw every path) and the US stored-plan fingerprint (`fingerprintJson`,
  `plan-optimizer.js`, which would mark an applied plan out of date). Both hash the state with `name` stripped from list
  rows (one shared helper), so old saves hash exactly as before (found in the plan review).
- **Listeners:** typing a name saves it and updates the row header without re-running the projection, a deliberate
  exception to the typed-listener rule in `CLAUDE.md` "Inputs", recorded there.
- **MCP tools** (`src/shared/ui/mcp-tools.js`): there is no list tool today (only `update_fire_assumptions` and
  `read_fire_projection`), so nothing changes there (corrected after the plan's code check).
- **Field search:** a list row's Name field is searchable like its other fields (whatever `mainLabelText()` and the field
  registry do for list fields today; `tests/field_registry.js` is updated if it enumerates them).
- **Where names show:** the Sankey bands and tooltips, and the row header. Other places that list items (the decision
  questions, tooltips elsewhere) are out of scope (designer's call: a follow-up if the owner wants it).
- Spending tiers are not separate bands (only one tier is active a year): the Everyday spending tooltip shows the active
  tier's name when it has one.

## 3. What is drawn

Each band's value is in the app's display dollars (`displayValue(n, row.year)`, the 2026-dollars / future-dollars switch).
A band under $1 is left out when drawing (its group and the total shrink by it); a group with no bands is left out. A
group's drawn value is the sum of the items it draws; the comparison with the row's figure (3.4) uses all items.

### 3.1 Money in

| Group | Items (US) | Items (Canada) |
|---|---|---|
| **Earned income** | Wages · Partner A, Wages · Partner B (the main salary fields, gross of their payroll health premiums); each income stream of kind `wages` or `self`, by name (W-2 streams gross of their own premiums); self-employment profit from the main fields (per partner); **Employer contributions** (one band: the employer match and W-2 profit sharing, the engine's `employerContrib`; owner asked for the match, designer's call on the label since the engine's figure also holds profit sharing) | Wages · Partner A / B (gross of premiums); **Employer contributions** (`matchA + matchB`) |
| **Other inflows** | each one-time income item, by name (its taxable and tax-free parts together; inherited-account rows are not income and are skipped, as the engine does); each income stream of kind "Not earned", by name; a positive 162(l) carry (`seSettlementIn > 0`) as "Health deduction settlement" | each one-time income item, by name; **every** income stream, by name (Canada streams have no kind and no owner, and are not stopped at a death: `canada/core/inputs/dyn.js`, `year-stages.js` `listAmountsForYear`) |
| **Retirement income** | Social Security · Partner A / B; Pension · Partner A / B | CPP · A / B; OAS (one band for the household, net of the recovery tax, so it matches the row; the tooltip shows gross OAS and the recovery, from `oasClawback`; designer's call: the recovery is worked out per person inside the tax code and the row carries only its total); Pension · A / B; GIS / Allowance; Child benefits; Credits and provincial seniors' programs (today's three benefit bands) |
| **From savings** | RMD (or "RMD & 72(t)" in a run with a 72(t) payment, as the bar chart labels it); Traditional (beyond the RMD); Roth (incl. the inherited Roth payout); Brokerage (incl. the part sold to pay tax on a reserve sale); Cash; Home equity | RRIF minimum; RRSP / RRIF (beyond the minimum); TFSA; Non-registered; Cash; Home equity |
| **Shortfall (not funded)** | the unfunded need (`shortfall`), red, as in the bar chart; a group of one band, drawn last | same |

Inherited traditional draws are in Traditional, as the bar chart does. The From-savings split uses `cashFlowParts` (PR #74)
so the two charts always agree.

### 3.2 Money out

| Group | Items (US) | Items (Canada) |
|---|---|---|
| **Taxes** | Taxes (`tax` minus `earlyPenalty`, plus a negative 162(l) carry); Early-withdrawal penalty (when ≥ $1) | Taxes (`tax`, as the bar chart reads it) |
| **Essentials** | Housing; Healthcare; Payroll health premiums (the main-job premiums and every W-2 stream's premium: the premiums the wages above are gross of; shown when ≥ $1); Long-term care; each loan, by name (the mortgage is in Housing) | Housing; Healthcare; Payroll health premiums; Long-term care; each loan, by name |
| **Everyday spending** | one band: `baseSpend` (the active spending tier after guardrail and survivor adjustments). The owner chose the name; it replaces "Discretionary spending" | same |
| **Extra & one-time** | each extra (recurring) expense, by name; each one-time expense, by name | same |
| **Savings** | Into traditional (your contributions); Into traditional (employer); Into Roth; Into cash (`cashTopUp`); Into brokerage (`reinvested − toBondReserve`); Into the bond reserve (`toBondReserve`) | Into RRSP (your contributions); Into RRSP (employer); Into TFSA; Into FHSA; Into cash; Into non-registered; Into the bond reserve |

"(your contributions)" appears only when the employer band is also present; otherwise the band is "Into traditional" /
"Into RRSP" (designer's call). The US Solo 401(k) profit share is the household's own money in the engine
(`contributions.js`, counted in `traditionalContrib`), so it is in "your contributions", not the employer band.

### 3.3 The balance

Money in = money out within $1 for every row, as in the bar chart (whose balance check this reuses), with two additions that
appear on both sides and so keep the balance: the employer match (in and out) and the payroll health premiums (wages are
shown gross, the premium is shown as a use). The total over the hub is that money-in figure.

### 3.4 Items and their group

- Where the row has a figure for a group, the group's value is that figure and items subdivide it: Retirement income
  (`ss + pension` (+ `benefits` in Canada)), From savings (`cashFlowParts`), Taxes, Essentials (`housing + healthcare +
  ltc + loanPayment` + the premiums), Everyday spending, Extra & one-time (`extraExpense + lumpExpense`), Savings. If the
  items fall short of such a group by $1 or more, the difference is a band "Other <group name lowercased>"; if they exceed
  it by $1 or more, the app drops that group's item split (one band with the group's name) rather than drawing a wrong
  total. Neither should happen; the Vitest suite asserts neither does for its scenarios (section 7) (designer's call).
- **Earned income and Other inflows** have no separate row figures (US `wages` mixes main pay, every stream of every kind,
  self-employment profit and the taxable part of one-time income, net of all payroll premiums; Canada `wages` includes
  every stream). Each of these two groups is the sum of its items, and the check is on the pair: Earned + Other =
  `wages + oneTimeCash + max(0, seSettlementIn)` + the premiums + the employer contributions (US; Canada without the 162(l)
  term), within $1. The same short / exceed rules apply to the pair, with the "Other" band going to Other inflows
  (designer's call; no new row fields for this).
- More than 8 items in one group: the smallest fold into "Other (n items)", whose tooltip lists them (designer's call; the
  lists allow many rows).
- Order inside a column: groups in the order of the tables above; items in group order, and inside a group in list order
  (the order the user entered them), the named-person items A before B.
- An item's label is the row's `name` (section 2.1) when it is not blank, else the row title ("Expense 2", "One-time
  expense 1", "Income stream 3"); always set as SVG text (`textContent`), never HTML; truncated with an ellipsis to fit its
  label space; the tooltip shows the full label and, for a named row, its row title too.

## 4. Layout and screens

### 4.1 The look (owner approved `style-v3`)

- Bars about 6 px wide (scaled with the view), square ends.
- One dollar is the same height in every column; the scale fits the busiest column (its bands plus its gaps) in the height,
  and every column is centred vertically.
- Gaps between bands of about 12 px in full screen, smaller in the card (computed from the height so a busy column still
  fits).
- Ribbons are filled with a left-to-right gradient from the source band's color to the target band's color, at about 0.4
  opacity; hover raises one ribbon (and its two bands' outline) and dims the rest.
- Labels: a small name and a bold amount under it, beside the bar: items-in on the left of their bars, groups-in on the
  right, groups-out on the left, items-out on the right; the total's label ("Total $176K") above the hub. Labels have a
  halo in the card background so they read over ribbons.
- Label collisions: labels in a column are laid out top to bottom and nudged down (then up from the bottom) so none
  overlap; a band too thin for its label after nudging gets the label only in its tooltip (the mockup's Roth / Brokerage
  overlap is what this fixes).
- Colors: each group has a hue; its items use that hue or close shades; the Shortfall band keeps the bar chart's reserved
  red. The builder picks the mapping with the `dataviz` skill's checks (light and dark, neighbours distinct), from
  `sankeyHue` in `format/charts.js`. Where the bar chart shows the same account (Traditional, Roth, Brokerage, Cash, Home
  equity, RMD), the Sankey uses the same color.
- Hover / focus / tap: a tooltip with the full name, `money()` amount, and its share of the total ("12% of the year's
  money"); on a group, its items are listed. Keyboard: bands are focusable as today.

### 4.2 Screens (owner)

| Where | What |
|---|---|
| Desktop, in the card | Five columns, height computed from the busiest column (about 300–380 px; the old 360 px fixed height goes), full card width |
| Desktop, full screen | The card's expand button opens the diagram over the whole window (the main chart's `chart-expanded` overlay pattern: fixed, Escape or ✕ closes, page scroll locked); the year slider stays visible; the diagram fills the space |
| Phone, in the card | Only a "View full screen" button (and the year slider); no diagram is drawn in the card (owner) |
| Phone, full screen, upright | Split: Money in (items → groups → total) on top, Money out (total → groups → items) below; the overlay scrolls down |
| Phone, full screen, sideways | All five columns at a minimum diagram width (about 900 px, builder tunes); narrower screens scroll sideways inside the overlay; text is never shrunk below the card's size |

- "Phone" means a phone in either orientation: the viewport is narrower than the app's mobile breakpoint (820 px,
  `mobile-view.js`) **or** it is under 500 px tall with a coarse pointer (`(max-width: 820px), (max-height: 500px) and
  (pointer: coarse)`), so a phone turned sideways (844×390) is still a phone and the card does not flip between modes when
  it turns (designer's call; the builder may tune the numbers). Upright vs sideways is read from the overlay's own size
  (wider than tall = sideways), live: turning the phone re-lays out the diagram (a `resize` re-render while the overlay is
  open).
- The expand mechanism (`chart-expanded` overlay, scroll lock, Escape, `fullscreenchange`) is wired to `#mainChartCard`
  only today (`chart-toolbar.js`); the plan generalizes it or gives the Sankey card its own small copy (builder's call),
  without changing the main chart's behaviour.
- Unlike the main chart, full screen does **not** lock landscape: the owner wants both upright and sideways. It may use the
  Fullscreen API where available to hide the address bar (best-effort, as `landscape-fullscreen.js` does) but never calls
  `screen.orientation.lock`.
- The desktop card has its own, smaller minimum width (about 660 px: the card is about 750 px wide at a 1280 px window);
  below it the card scrolls sideways inside `.chart-wrap` (designer's call); the page never scrolls sideways
  (`scrollWidth <= clientWidth`).
- In a busy year the gaps shrink so the bands keep most of the height, and labels that cannot fit are hidden (the band's
  tooltip still names it); the card grows taller with the number of bands, up to about 480 px.

## 5. Data

### 5.1 Which run and year

The selected run's rows, the year from the slider. Today the slider's `input` handler redraws from `simulate()`
(`sankey.js` `wireSankeyAge`), not from the run `render()` passed in, so moving the slider can switch runs (for example
when a stored plan is applied). Fixed here: `renderSankey(selected)` keeps the last `selected` it was given in a
module-level `let`, and the slider (in the card and in the overlay, one slider moved or two kept in sync, builder's call)
redraws from that (designer's call).

### 5.2 New row fields (engine, display-only)

Scalars on every row of each planner's `runProjection` (one row shape; 0 when nothing happened), written from values the
year already computes, read by nothing in the engine. Proposed names (the plan fixes them):

- US: `contribTraditional`, `contribRoth` (the existing `contributions` split; their sum is exactly `contributions`),
  `employerContrib` (the engine's `employerContrib`, `contributions.js`: the W-2 matches and W-2 profit sharing, which the
  engine adds to `bal.traditional`).
- Canada: `contribRrsp`, `contribTfsa`, `contribFhsa` (sum exactly `contributions`), `employerContrib` (`matchA + matchB`).
- Both, if the per-item recomputation (5.3) cannot recover them exactly from inputs: per-partner `wagesA` / `wagesB`,
  `ssA` / `ssB` (CPP A/B in Canada), `pensionA` / `pensionB`, and the year's payroll premiums. The plan decides per field
  after checking the code; scalars only, never a per-item array on the row (a row exists for every year of every Monte
  Carlo and historical path; hot-path rule).

The CLAUDE.md checks for row fields apply as in the bar chart spec (5.2): historical parity, whole-row comparisons,
snapshots (an intended change if they record whole rows), `__test_freezeSimResults`, and the MAGI iteration (a value read
after the kept pass is final). **E4 (US state relocation) is changing `src/us/core/projection/run-projection.js` in another
session**: the new fields are a few lines in the row literal, so the plan keeps them in one small commit that rebases
easily.

### 5.3 Per-item amounts

Named list items are not on the row. For the one selected year, a pure function per planner in `core/`
(`sankeyColumns(inputs, row, prevRow)` or similar; DOM-free so Vitest can call it) recomputes each item's amount from the
inputs with the same pure helpers the engine uses (the stream and lump windows and growth, `itemGrowthFactor`,
`lumpExpenseHits`, `loanSchedules` / `loanPaymentForYear`, `pensionIncome`, `socialSecurityIncome`, `cppAndOasIncome`,
the year's inflation factor), honouring the same death and survivor rules. It does not import a store module (it takes
`inputs` as an argument), so it stays testable and engine-pure in spirit, though the engine never calls it.

The existing aggregate helpers sum by owner and kind (US `streamAmountsForYear` / `lumpAmountsForYear` into module
scratch objects, Canada `listAmountsForYear` with filter / reduce) and are on the hot path; they are **not** changed to
emit per-item arrays. The per-item function walks the
lists itself with the same window / growth / death tests. Drift between the two is caught by the reconciliation tests
(section 7): for every row of the test scenarios, each group's items sum to the row figure within $1.

It returns, in raw dollars: `{ in: [{ group, items: [{ key, label, value }] }], out: [...] , total }`; the UI converts to
display dollars and lays it out.

## 6. Copy

- Card summary stays "Cash flow diagram". Description: "Where one year's money comes from and where it goes: each source,
  grouped, into the year's total, then out to taxes, spending and savings. Only computed while expanded."
- Note under the diagram: unchanged ("Amounts shown in the mode currently selected above (real or nominal dollars).") plus
  "Withdrawals are what this projection draws to cover the year, in the order your settings give. They are not a
  recommendation." (the bar chart's wording).
- Phone card button: "View full screen".
- Empty year: unchanged ("No meaningful cash flow this year.").

## 7. Tests

- **Vitest** (`tests/unit/us/`, `tests/unit/canada/`): for every row of a scenario set per planner (working years with
  streams, one-time income and expenses, loans, the employer match and payroll premiums, retirement with RMDs, Roth / TFSA
  draws, cash and home-equity draws, a surplus year, a shortfall year, a survivor year, US self-employment and inherited
  accounts, Canada benefits and FHSA): money in = money out within $1; each group's items sum to its row figure within $1
  (no "Other" band appears); a named item appears with its label in the years its window covers and not outside it. Rules
  of `CLAUDE.md` "Writing a Vitest test" apply (world(), exact comparisons, written-out tolerances, check counts).
- **Names** (Vitest): the normalizers keep a string name (trimmed, 40 characters), turn a non-string into `''`, and an old
  save loads with blank names; a name changes no projection number (a run with and without names gives identical rows).
- **Layout** (Vitest, `tests/unit/shared/`): the pure layout returns non-overlapping labels for a crowded column; every
  column's bands plus gaps fit the height; the scale is equal across columns.
- **Playwright** (a new root `test_sankey.js`): the card draws five columns on desktop; the expand button opens and Escape
  closes the overlay; at 390×844 the card shows only the button, the overlay shows the split, and the page has no
  horizontal scroll; at 844×390 the card still shows only the button and the overlay shows five columns; the slider moves
  through the selected run; a named expense appears as its own band with its name, and an unnamed one as "Expense 1"
  (update `test_dynamic_lists.js` step 8, which looks for "Additional expenses"); typing a name updates the row header;
  `test_deferred_render.js` still passes.

## 8. Docs and version

- `README.md` feature list: the diagram's new columns and full-screen view, and the optional name on list rows.
- `docs/architecture/inputs-and-ui.md` (charts section), `docs/architecture/lists.md` (the `name` field and the text
  field kind), and the module map (`npm run analyze`).
- The bar chart spec is not edited; this spec references it.
- Version badges: bump both planners.

## 9. Left to the builder (designer's calls, flagged)

- Exact pixel sizes, gaps, minimum widths and breakpoints, within the look in 4.1.
- The color mapping (dataviz checks).
- The 8-item fold threshold and the "Other (n items)" wording.
- Whether a field in 5.2's last bullet is needed, after checking whether 5.3 can recompute it exactly.
