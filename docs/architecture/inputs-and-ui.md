# Inputs, the field registry and the UI

Read before touching `defaults`, `normalizeState`, `FIELDS`, the sync functions, `render()`, the charts, the MCP tools, the wizard or the dashboard tiles.

Related: [lists.md](lists.md), [module-system.md](module-system.md), [test-inventory.md](test-inventory.md).

## Defaults, normalization and the field registry

- `defaults` — the full default state object (every input field's default
  value, including nested arrays like `loans`, `spendingTiers`,
  `incomeSources`, `oneTimeIncome`).
- `normalizeState(raw)` — merges a raw/partial state (autosave, imported
  scenario file, hand-edited) over `defaults`, so old exported scenarios keep
  loading correctly: missing fields fall back to defaults, unknown fields are
  dropped. Any new enum-like field needs a guard here (see the
  `filingStatus`/`tenure`/`province` pattern) or a bad value can silently
  corrupt the simulation.
- `state.storedPlan` (US, Batch 5 4a; default `null`) is the saved cliff plan. `normalizeState` keeps the very object when
  `isValidStoredPlan` (`src/us/core/cliff-plan/plan-shape.js`) accepts it, else `null`; `monteCarloSeed` leaves it out by name.
  A v1 plan saved before `conv` (Batch 5 step 5b piece 3: its plan has exactly the nine earlier keys) is first migrated by
  `migrateStoredPlan` to a copy (envelope and plan) ending with `conv: null`; the raw input is never written, and a plan that
  already has `conv` keeps its identity.
  Only the plan card writes it (`src/us/ui/results/plan-optimizer.js`, which replaced the multi-lever card in V140): Apply stores a
  JSON copy of the found plan (one undo snapshot), Clear sets `null`. `madeFor` is
  `storedPlanFingerprint(state)` (`fnv1a32` of `normalizeState(state)`'s JSON without `storedPlan` and the two dismissal lists),
  taken over the live state. The card's status line (`renderPlanOptimizerStatus`, in every `renderBody`, so the light
  render too, and in the deferred pass) reads `cliffPlanStore.report.stored` for the verdict and compares the fingerprint (memoized
  on the JSON it hashes, never on `cliffPlanStore.key`) and `taxYear` for staleness. The with / without success rates run on
  Optimize's working copy (`storeRunContext(copy, { plan, planMode: 'apply' })` through `runHistoricalCyclesWith` /
  `monteCarloSummaryWith`), so the "with" Monte Carlo rate is the dashboard's after Apply.
  The guard (`isValidStoredPlan`) drops the whole plan to `null`, never a part, unless it is exactly `{ v: 1, plan, objective, mult,
  madeFor, taxYear, summary }` (`STORED_PLAN_KEYS`, in that order) with a plan of exactly `PLAN_KEYS` in order: intent ages
  string keys with `String(Number(k)) === k`, integers 0-120; each intent exactly `{ kind, line, ret }` from `PLAN_KINDS` /
  `PLAN_LINE_IDS` / `PLAN_RETS`; `family` in `PLAN_FAMILIES`; `bracket` and `bracketFrom` in `BRACKET_CANDIDATES`; `orders` /
  `splits` null or an age map of `'traditional'` / `'A'` and `'B'`; `levers` null or exactly `{ order, split }` (booleans, in that
  order); `orderPhases` null or a non-empty, strictly ascending list of 0 / 1 / 2, null exactly when `orders` is (Batch 5 step 4c;
  a 4a / 4b plan, all three null, stays valid); both
  `mult`s null or three `MULT_GRID` values; `objective` in `STORED_OBJECTIVE_IDS` (inlined; a Vitest check keeps it equal to the
  registry's ids); `madeFor` a string; `taxYear` an integer; `summary` exactly `{ gain, success: { hist: [a, b], mc: [a, b] } }`
  with finite numbers (a rate may be null). Objects are checked with `Object.prototype.toString` (`[object Object]`, not an array), which a class instance also passes; a
  plan read from JSON is always a plain object. The card's states (spec 4.4): "Applied
  plan in use." (fresh, used); in use but stale (computed for different inputs, or another tax year; a guard 'tie' says it
  "still does at least as well as" the automatic plan, a win that it "still beats" it); stale and not used, with
  the reason (runs out earlier / draws on the house earlier / scores lower); the guard off ("The cliff plan is off, so the applied
  plan is not used."); and, after a bracket-setting change while conversions apply (`report.stored.converts`), that the plan's
  intents now run at the setting. An applied plan not in use that wins the search (on another objective) is offered again: "Your
  applied plan is not in use now (the automatic plan is). ..., re-applying it under this objective would put it in use." Search with nothing
  better (no search win, or a gain of at most $1 with no later depletion or home draw) shows no Apply button ("The automatic plan
  is already the best this search found.", or "Your applied plan is ..." only while an applied plan is in use). `appliedRothSchedule` / `appliedMixSchedule` (the old optimizer's per-year schedules) are retired fields
  (Batch 5 step 5, owner decision 2026-10-29): `normalizeState` deletes both on every load, with no note and no migration, so a file
  saved with them runs the automatic plan. A stored plan saved before step 5 still loads and is judged by the guard, but its `madeFor`
  was taken over a state that held the two keys, so it reads "computed for different inputs" until it is re-applied (accepted by the
  owner, no fingerprint compatibility code; pinned by `tests/legacy_state.js`'s "stored plan across step 5").
  The same holds for the per-partner contribution types: a stored plan applied before them shows "computed for different inputs" after the upgrade, because its fingerprint (`fingerprintJson` in `src/us/ui/results/plan-optimizer.js`) hashed the household `k401Type` / `iraType` keys. Its numbers are unaffected, and no compatibility code was added (the step 5 precedent).
  `rothConvBracket` has a `FIELDS` guard since 4a (`values: [10, 12, 22, 24, 32, 35]`, `fallback: 22`; a field with
  `valueAs: 'number'` and a fallback reads a finite numeric string as its number first, so `"24"` stays 24 and `"x"` gives 22).
- **`FIELDS` — the field registry** (`src/us/ui/inputs/fields.js`, `src/canada/core/inputs/fields.js`). Every sidebar
  control that maps straight onto a `state` key is declared once; the input
  listeners, the DOM sync, `ids`, `normalizeState`'s enum guards and the MCP
  `update_fire_assumptions` schema/allow-list are all derived from it. Entry
  types: `number` (plain numeric input/slider; `ids` is the list of these, in
  registry order, which is also the MCP property order), `bool` (checkbox) and
  `choice` (select, or a button group marked `manual`). Per-entry options:
  `out` + `outSync` (the `<key>Out` slider label and which sync function writes
  it), `inlineOut`, `resync`, `syncAfter`, `onInput` (clamps/side effects),
  `sync` + `resync` (below), `reveals` (elements shown/hidden by the value),
  `mirrors` (wizard checkboxes that follow it), `values`/`fallback` (enum list and
  the `normalizeState` fallback), `trueUnlessFalse`, `valueAs: 'number'`, and
  `mcp: true` (expose through the MCP tool). **To add a field: the markup, the
  `defaults` value, and one `FIELDS` entry** (plus an `onInput` hook only if it
  has a side effect). `tests/field_registry.js` fails if a sidebar control is not
  registered or a registry entry points at a missing element/key.

## Syncing, rendering and the charts

- `syncControls()` and `syncContributionControls()` — **two separate**
  functions that both push `state` back into the DOM, and the split is
  deliberate (the contribution sync must not reformat money fields while the
  user types in another field). The registry removes the "wired into the wrong
  one" bug: each `bool`/`choice` entry says which function owns it (`sync:
  'controls' | 'contrib'`), and each function loops over its entries
  (`syncFieldDom`), so the owner is explicit data, not a place you have to
  remember. Hand-written lines remain only for effects that are not a single
  control (singlePerson's partner-B hiding and headings, the tenure/choice
  button groups, the wizard's numeric mirrors, the safe-withdrawal-rate boxes).
  Button groups (`tenure`, `buyCash`, `k401TypeA/B`, `iraTypeA/B`, `pensionCoverage`,
  `filingStatus`) are still wired by hand (`manual: true`) but registered so
  MCP and `normalizeState` share their value lists.
- `render()` — the "redraw everything" function called after every input
  change. Expensive collapsible results (tornado chart, Roth/RRSP bracket
  optimizer, cash-flow Sankey, decision previews) are only computed when their card is open,
  gated in `renderOpenCards()` (each country's `results/render.js`) with a matching `toggle` listener.
  The US bracket card also holds the conversion schedule (Batch 5 step 5, Task 5: `renderConversionSchedule(selected)` in
  `roth-optimizer.js`, called right after `annotateRothOptimizer()`): a read-only table of the dashboard's own run (V155): every
  year of the ladder window and any other year that converts or was held, adjacent $0 years with one why collapsed, each amount in
  the dashboard's dollars (`displayValue`), the why from existing row fields only (`scheduleRows` / `scheduleWhy`, pure and
  exported for `tests/unit/us/roth-optimizer-ages.test.js`; they only read `selected.rows`). It draws with the open cards
  (`renderOpenCards`: the full render and the deferred pass, not the light render, which
  dims the card): the rows it reads can change in the deferred pass, when the bracket search keeps another plan. With the cliff
  plan off the heading says "your plan". The table has the class `conversion-schedule-table` (no minimum width, the Why column
  wraps). Above the schedule, under the bracket table, sits the card's S4 line `#rothOptimizerOverLine` (drawn by
  `annotateRothOptimizer` from each card row's `overAca` map; `hidden` when empty, inside the card, so the light render dims it
  with it). S4's held line `#rothOptimizerHeld` was removed in V155 ([cliff-plan.md](cliff-plan.md) has the copy).
- **Deferred rendering** (`src/shared/ui/results/render-scheduler.js`, responsiveness PR B). A typed field's `input` event
  (number fields in `field-listeners.js`, list-row boxes in `dynamic-list-editing.js`, the safe-withdrawal-rate box in
  `headline-tiles.js`) calls `scheduleRender()`: `render({ light: true })` draws everything except the historical and Monte
  Carlo chart views and the open analysis cards, and `markDeferredStale()` dims those (class `stale`, `aria-busy`; the CSS
  dims a card's body, not its summary). The skipped panels are drawn by `renderDeferred()` (each country, through the
  `seam-renderDeferred` facade) on the field's `change` event (`flushRender()`: a slider released, a text box committed) or
  after 250 ms without input. The timer is only armed when something is stale or (US) the cliff plan's bracket search is pending
  (`searchPending()`, through `#country/core/seam-searchPending`; Canada's is always false). The US cliff plan (Batch 5 step 3a,
  spec section A7): the light render plans with `refreshCliffPlan({ light: true })`, the user's-bracket plan with the bracket
  search skipped, and sets `cliffPlanStore.searchPending` when the search applies; `renderDeferred()` first runs the full
  refresh and, when the kept plan's JSON differs from the one the rows were drawn with (`renderBody` records it, so a full
  refresh in between, a test hook's `ensureTestPlan`, cannot leave stale rows), redraws the light panels with it
  (`renderBody(selected, { light: true, deferredPass: true })`, nothing marked stale), else redraws only the plan summary line
  (it gains its conversion clause), so the rows can change once in the deferred pass. A full
  `render()` searches at once. `cliffPlanStore.searched` says the stored plan needs no more planning for its key;
  `planForState`'s identity branch serves the stored plan searched or not, its JSON branch the stored plan when it is searched or
  its search is pending (the light render's user's-bracket plan, so a normalized copy of the live state runs no search on a
  keystroke), and its cache only searched plans (see [cliff-plan.md](cliff-plan.md)). Every other caller (buttons, selects,
  checkboxes, card and view toggles, load, undo, reset, MCP, scenario swaps) calls the full `render()`, which cancels a
  pending pass and clears the marks. The light render stays synchronous in the `input` event (owner decision, 2026-10-23):
  Chromium delivers at most one slider `input` per frame, the light render costs about one frame, and tests read the DOM
  right after an input. The plan status bar's historical success rate keeps its own 500 ms debounce. When it lands after
  load, the mobile bar wraps onto a second line and pulses "Updated just now" for 3 s, so for about 3.5 s the inputs below
  it move: a Playwright click caught by that move is retried with a scroll, and a scroll closes an open info bubble. A
  mobile test that clicks in the sidebar right after load waits for the bar to settle first (`test_info_tips.js`). Tests flush with
  `window.__test_flushRender()`. Design: `docs/superpowers/specs/2026-10-23-responsiveness-b-design.md`.

## Sensitivity, chart preferences, Sankey, MCP and mobile

- `SENSITIVITY_LEVERS` / `computeSensitivity()` / `renderTornadoChart()` — the
  tornado chart (`computeSensitivity` is a UI entry point in `src/shared/ui/charts/tornado.js` that runs the core levers); levers swept are read live from checked `data-lever`
  checkboxes (a display choice, not part of `state`/scenario export).
- `chartView`/`mode`/`logScale`/`mcPathCount`/`chartShiftMode`/
  `chartGapPartner` (live bindings exported by `src/shared/core/chart-prefs.js`
  and `store.js`; assign them through `assign<Name>`) are all
  plain module variables, not `state` fields — chart-display preferences
  that reset on reload and never round-trip through scenario
  export/import. `chartShiftMode` ('together'/'gap') controls whether the
  ±1yr/±3yr comparison chart shifts both partners' retirement ages
  together, or shifts only one partner's date toward/away from the other
  partner's (fixed) date. `chartGapPartner` (`null`/'A'/'B') controls
  *which* partner moves in 'gap' mode: `null` auto-tracks whichever
  partner currently retires earlier (the original behavior); an explicit
  `'A'`/`'B'` pick sticks even against the grain (varying the
  later-retiring partner while the earlier one stays fixed) — the
  "Closer"/"Farther" math is sign-based on `movingAge <= fixedAge` to
  handle both directions correctly, not hard-coded to "moving partner is
  always earlier." Both variables' dependent UI (`#chartShiftModeRow`,
  `#chartGapPartnerRow`, button active/disabled states) is recomputed on
  every `renderChartView()` call, not just on a button click, so it stays
  correct as retirement-age sliders or single-person mode change live.
- **The Cash flow view** (`chartView === 'cashflow'`): a yearly stacked-bar chart of money in and money out, drawn by
  `renderCashFlowChart(rows)` in `src/shared/ui/charts/cash-flow-chart.js` (`wireCashFlowControls()` wires the Style row and
  `initCashFlowHover()` the tooltip, both called from start-up). The bars come from `cashFlowParts(row, prevInvestable)`
  (`src/shared/core/format/cash-flow-parts.js`), which reads the projection row's cash-flow fields (see engine.md, "Cash-flow
  fields on the row"); the part names come from `CASH_FLOW_LABELS` (`src/<country>/ui/charts/cash-flow-labels.js`, reached through
  `#country/ui/seam-CASH_FLOW_LABELS`) and the colors from `CASH_FLOW_COLORS` (`src/shared/core/format/charts.js`). The Style row
  (`#cashFlowStyleRow`, shown only in this view by `chart-view.js`) picks `bars`, `inout` or `simple`.
  `cashFlowStyle` (`chart-prefs.js`, `assignCashFlowStyle`) is the one chart preference **kept across reloads**: the UI writes it
  to localStorage key `fireCouplePlanner.cashFlowStyle.v1` (read and written in try/catch; the chart renders without storage) and
  reads it back at start-up. It is still not in `state` and never in a scenario export. The hover is its own
  (`#cashFlowTooltip`, positioned by `cash-flow-chart.js`), not `chart-hover.js`: a bar's tooltip lists the year's parts, with an
  asterisk on a Roth conversion (Canada: RRSP meltdown) year, and a touch shows it the same way. The spending lines and the
  asterisks are drawn in the page's ink (`chartInkColor`, `--ink`) over a wider outline in the card color (`chartHaloColor`,
  `--card`), all outlines before any ink, so they read on the bars and the card in both themes; account draws are labelled
  "From ..." and money into an account "Into ...". The test hook `window.__test_cashFlowParts`
  (`src/shared/ui/install-test-hooks.js`) exposes the parts function to Playwright. Copy is descriptive ("drawn"), never advice.
- **The cash-flow diagram** (`#sankeyCard`, a `<details>` drawn only while open) shows one year in five columns: items in →
  groups in (Earned income, Other inflows, Retirement income, From savings, Shortfall) → the year's total → groups out (Taxes,
  Essentials, Everyday spending, Extra & one-time, Savings) → items out. The modules, data to pixels:
  `sankeyColumns(ctx, row)` (`src/<country>/core/income/sankey-columns.js`, raw nominal dollars, list items recomputed from the
  inputs, labels from each row's `name`); `computeSankeyFlow(row)` (`src/<country>/ui/charts/compute-sankey-flow.js`, the seam
  `#country/ui/seam-computeSankeyFlow`: builds the context with the country's `storeContext` (US `withPlan: false`) and calls
  `sankeyModel(cols, dv, dark, notes)` (`src/shared/core/format/sankey-model.js`), which converts every value with
  `displayValue(n, row.year)`, drops items under one display dollar (their group and the hub shrink by them, so every node is
  the sum of its links), gives node ids `in:<item>` / `g:<group>` / `hub` / `out:<item>` (`in:<group>:<item>` when a key repeats
  in a column) and colors (accounts keep `CASH_FLOW_COLORS`, so the bar chart and the diagram agree; other items take their
  group's `SANKEY_GROUP_COLORS` hue in alternating shades; the shortfall keeps its red), or null when the year is empty; Canada adds
  "OAS recovery tax" to the Retirement income tooltip whenever `row.oasClawback >= 1`); `layoutSankey` / `sankeyColumnXs` /
  `fitLabel` (`src/shared/core/format/sankey-layout.js`: one scale, centred columns, label nudging); and `drawSankey(svg, model,
  opts)` / `renderSankey(selected)` (`src/shared/ui/charts/sankey.js`). `drawSankey` takes `{ width, height, cols: 'five' |
  'in' | 'out', fontPx, nodeW, gap, minBand? }`: square 6 px bars (`rect[data-col][data-node]`; no band thinner than `minBand`,
  default 4 px, through `layoutSankey`'s `box.minBand`, so a small amount such as a year's taxes stays visible; a bar under
  14 px gets a transparent 14 px `rect[data-hit-node]` target that hovers and taps as the bar; `minLabelBand` is
  `min(6, minBand)`, so a thin band such as Taxes keeps its label, nudged if it must be, instead of losing it to the tooltip), ribbons filled with a per-drawing
  `linearGradient` from the source to the target color at 0.4 opacity (ids `sk<drawing>-<n>`, unique in the document), labels
  as a name (font `fontPx`, weight 600, full ink) over a bold `compact` amount with a 3.5 px halo in the card color (cut to the room beside the bar by `fitLabel`'s character
  estimate, never by measuring, so the text, and the UI snapshot's textHash, which includes it, is the same on every machine; a
  " · Partner A" suffix is kept and the head cut; hidden labels are skipped), the total over the hub (`text.sankey-total`). Hover, focus or a tap on
  a ribbon or bar raises it (other ribbons to 0.15) and opens a tooltip (`.sankey-tooltip`, one per `.chart-wrap`, remembering the SVG that showed it so only that SVG hides it: the
  upright phone's two SVGs share one wrap, and one's tap-outside handler must not hide the other's tooltip; filled with
  `textContent` only, as every label is: names are user text) with the label, `money()`, its share of the year's money, the
  item's lines and a group's items; a tap's tooltip stays until a tap outside (the cash-flow chart's pattern). In the card the
  height is `clamp(60 + 16n, 300, 480)` (n: the busiest column's bands), the font 12 px, the gap `clamp(height * 0.035, 6, 14)`,
  the label room outside each outer column is its widest label's estimate plus 8 px, clamped to 110 px and the larger of 220 px
  and 16% of the width (`sankeyColumnXs` takes a number or `{ left, right }`); when the even spread leaves an inner gap too
  narrow for its widest group label, the inner gaps take what they need and the outer gaps (at least 40 px) and then the item
  label rooms (not below 60 px) give way; under 660 px the SVG keeps 660 px and `.chart-wrap` scrolls sideways (the page
  never does). **One source:** `renderSankey(selected)` keeps `selected` (`currentSankeySelection()` reads it) and the year
  slider (`wireSankeyAge`) and a window resize redraw from it, never from a fresh `simulate()` (a redraw
  reads list names and item splits from the live inputs, through `storeContext`; every input change renders, so they agree with
  the run); the SVG carries `data-year`
  (calendar year) and `data-total` (the drawn total, rounded) for tests. The readout is "Age 69 · 2038" / "Ages 69 / 67 · 2038"
  (`CURRENT_YEAR + row.year`, as the cash-flow chart's tooltip header). `test_sankey.js` covers it.
- **Sankey full screen and phones** (`src/shared/ui/charts/sankey-fullscreen.js`, `wireSankeyFullscreen()` called from each
  `main.js` after `wireSankeyAge()`). **Phone rule:** `isPhoneViewport()` is
  `matchMedia('(max-width: 820px), (max-height: 500px) and (pointer: coarse)')`, so a phone turned sideways (844x390) is
  still a phone. On a phone `renderSankey` toggles `#sankeyCard.sankey-phone` (at every render, which a window resize
  triggers while the card is open), skips drawing `#sankeySvg` (`clearSankey` empties it) and the card shows only the
  slider and `#sankeyPhoneBtn` ("View full screen"); elsewhere the card has `#sankeyExpandBtn` (⤢) in the
  `.sankey-year-head` row, drawn in the card's top-right corner (`#sankeyCard` is `position:relative`). **The overlay** `#sankeyOverlay` (`role="dialog" aria-modal`, inside the card) is the card's own
  copy of the main chart's overlay pattern, sharing none of its code or its `chartExpanded` preference: opening unhides it
  (fixed, z-index 85), sets `body.chart-scroll-locked`, moves the whole `.sankey-year` block (with the slider's
  `.range-touch-wrap` and catcher) into its header, calls `tryEnterFullscreen(overlay)` (`landscape-fullscreen.js`:
  best-effort Fullscreen API, never `screen.orientation.lock`, so a phone can be held either way), draws, and focuses ✕.
  ✕, Escape and a `fullscreenchange` out of fullscreen close it (its own listeners, guarded by its own `open` flag);
  closing hides it, unlocks the page, puts the year block back, redraws the card and returns focus to the button that
  opened it, after the fullscreen exit resolves (while the overlay is the fullscreen element the rest of the page is
  inert and `focus()` there does nothing). Tab is kept inside the dialog. The layout is read from the overlay's own size
  at every draw (`redrawSankeyOverlay()`, which `renderSankey` calls after the card, so the slider, a render and the card's rAF-throttled `resize` redraw reach it: turning a phone re-lays it out without
  closing): a desktop draws `#sankeyFullSvg` in five columns at the wrap's size up to 2600 x 1400 px (centred; font
  `clamp(round(width / 120), 14, 18)`, `nodeW` three quarters of it, `minBand` 5) and fans it out (`spread: 0.65`, `layoutSankey`'s `box.spread` / `box.hubCol`: the scale is cut
  so the largest column (the total) fills 65% of the height, and each column's gaps grow so it reaches a height rising from 65% at the hub to the
  whole height at the outer columns, each gap between the plain gap, `clamp(3.5% of the height, 6, 14)`, and 9% of the height), so large bands stay moderate as
  in the reference tool; the year block in the overlay header is at most 720 px wide, centred; a
  phone held sideways (overlay wider than tall) draws five columns at the card's sizes and at least 900 px wide (the
  `#sankeyFullWrap` scrolls sideways, the page never does); a phone held upright (`#sankeyOverlay.sankey-upright`, the
  overlay scrolls down) draws `#sankeyInSvg` (`cols: 'in'`, "Money in") above `#sankeyOutSvg` (`cols: 'out'`, "Money
  out"), each at the wrap's width and its own height (`clamp(60 + 34n, 240, 1200)`, n: its busiest column's bands). In these three-column layouts the total sits 10 px from the edge and the group column is placed so its widest label
  (`fitLabel`'s estimate plus 2 px) fits between it and the total; the items keep their label room on the outer side, less
  when the groups need it, with at least 40 px of ribbon between item and group bars ("Retirement income" shows in full at 390 px). The
  SVGs not in use carry the `hidden` attribute (an SVG element has no `.hidden` property) and are emptied; all three carry
  `data-year`. `test_sankey.js` covers the desktop overlay and a phone (`isMobile` + `hasTouch`, which makes
  `(pointer: coarse)` true in headless Chromium) upright, turned and sideways.
- MCP tool hooks (`read_fire_projection`, `update_fire_assumptions`) in
  `src/shared/ui/mcp-tools.js`, registered by `registerMcpTools()` (called near the end of
  `main.js`) if `document.modelContext` exists. The input
  schema and the `execute` allow-list are derived from `FIELDS` (every numeric
  field plus each `mcp: true` entry), so a new field needs no MCP edit.
- Mobile layout is a pure CSS toggle (`#workspace[data-mobile-view]`), not app
  routing state — it isn't part of `state`/scenario export. Canvas-based
  charts measure their container via `getBoundingClientRect()`, which is
  zero/stale while hidden, so switching to the Dashboard tab always calls
  `render()` again to get a correctly-sized redraw.

## More in docs/reference.md

See `docs/reference.md` for the full write-ups of the Plan Status Bar, the
sidebar field search, money-field in-place formatting, the "Estimated" field
badges/guided review, the unusual-assumption warnings, and several
`position:sticky` / mobile-viewport bugs (a recurring trap: `overflow-x:hidden`
on an ancestor silently breaks `position:sticky` everywhere on the page — use
`overflow-x:clip` instead, and verify sticky behavior with a real scroll
gesture, not `window.scrollTo()` + an overflow-width check).

**The desktop sidebar** (`.panel`, wider than 820px) is sticky and exactly as tall as the viewport below its current
top edge: `syncPanelMaxHeight()` (`src/shared/ui/layout/layout-metrics.js`) sets `--panel-max-h` from the panel's
live top, clamped to its sticky offset, on load, resize and every scroll frame (`wireLayoutListeners()`), so it
reaches the bottom of the screen before and after the disclaimer scrolls away. Its title, search bar and category
rail form one sticky header: the search bar sticks at `--panel-title-h` and the rail at that plus
`--field-search-h`, both measured by the same function (a hard-coded offset let the title cover the search bar). A
jump to a field (field search, the estimate review) lands it at `fieldLandingTop()`, 30% of the way down the panel
below that header. Mobile is unchanged (the panel is in the page flow).

## Unusual-assumption warnings

(Shared warnings: `UNUSUAL_RANGES` lives in `src/shared/core/inputs/estimates.js` and accepts an item with `check()` and `message()` instead of a
range; the US pushes its Social Security-before-retirement items onto it in `addSocialSecurityWarnings()` (`src/us/ui/results/unusual-warnings.js`,
called from `main.js` right after the shared `wireUnusualWarnings()`; 7O O5), so the shared module stays the same for both planners.)

## First-run wizard

`#wizardModal` is a list of `[data-wizard-step]` panels in document order, each carrying its own
`data-title` and `data-note` (`renderWizardStep` in `src/shared/ui/wizard.js` adds "Step i of N"). The US wizard
has three: basics, balances (taxable, cash, the eight retirement accounts, a Roth-basis callout) and
the optional questions; Canada has two. Every input names the sidebar control it proxies in
`data-wizard-mirror`, so the mirrors, the value sync in `syncControls` and the step count are all markup,
not lists in code. Step grids use `.wizard-grid`. `test_wizard_accounts.js` covers both planners.

## Dashboard tiles and the safe withdrawal rate

The four `.metrics-primary` tiles are Investable at retirement, `#fiNumber`,
`#fireNumber`, and Investments last through; `#dashRetireAge` is a small
`.retire-chip` box at the top-right of `.content` showing `state.retireAgeA/B` (each partner's own retirement age, not the sim's both-retired year), and `#dashHistSuccess` lives in More results.
`state.fiWithdrawalRate` (default 4, clamped 0.5–15 in `normalizeState`) feeds
`fiMultiple()` (= 100 / rate). It is edited via two `.swr-input` boxes (one
per tile) that are synced by hand in `syncControls()` — it is deliberately not
in `ids`, since there is no sidebar element with that id. Funded % compares
`currentInvestable` (liquid accounts only, no home equity) to the number.
