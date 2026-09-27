# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repo.

## What this is

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators
for a couple or single person — one for the US, one for Canada. Everything
(markup, CSS, and JS) lives in one `<script>` block per file; there is no
build step, no bundler, no framework, and no server. Opening the `.html` file
in a browser is the entire deployment. See `README.md` for the full feature
list from a user's perspective — this file is about how to work in the code.

## Files

- `Planner_US.html` / `Planner_Canada.html` — the two apps. Each is fully
  self-contained (~4,500–4,700 lines including the inline `<script>`).
  **Stable filenames**: never rename these or create version-numbered copies
  (`Planner_US_v2.html`, etc.) — every update is a `git commit` to the same
  file, not a rename-and-fix-links exercise. See "Versioning" in README.md.
- `index.html` — a small landing page linking to both tools.
- `tests/golden.js` — hand-verified year-by-year drawdown/compounding math
  checks, run via `npm test`. This is the only test wired into CI
  (`.github/workflows/test.yml`).
- `test_*.js` (repo root) — a suite of Playwright scripts covering UI/feature
  behavior (scenarios, Monte Carlo, life expectancy, FHSA, income sources,
  hover tooltips, expenses, the historical backtest, etc). These are **not**
  run by `npm test` or CI — run them individually with `node test_foo.js`.
  They open the actual `.html` file with a headless Chromium
  (`playwright.chromium.launch()` + `file://` URL) and assert against live
  DOM/state, not against a mocked harness. When you add a feature, add or
  extend one of these rather than only relying on `tests/golden.js`, and
  actually run it — don't just eyeball the diff.

## Architecture, per planner file

Each planner is one big IIFE. The core shape:

- `defaults` — the full default state object (every input field's default
  value, including nested arrays like `loans`, `spendingTiers`,
  `incomeSources`, `oneTimeIncome`).
- `normalizeState(raw)` — merges a raw/partial state (autosave, imported
  scenario file, hand-edited) over `defaults`. This is what keeps old
  exported scenarios loading correctly after the tool changes shape: missing
  fields fall back to defaults, unknown fields are dropped. Any new enum-like
  field needs a guard here (see the `filingStatus`/`tenure`/`province`
  pattern) or a bad value can silently corrupt the simulation.
- `ids` — an array of plain-numeric input element IDs that get auto-wired:
  each gets an `input` listener that writes `state[id] = Number(...)`, and
  the MCP tool schema (`update_fire_assumptions`) spreads this array in as
  `{ type: 'number' }` properties "for free". Booleans, enums, and anything
  with side effects (like `singlePerson`) are wired by hand instead — see
  their own listeners further down.
- `simulate(retireAgeA, retireAgeB)` — the main year-by-year drawdown/
  compounding engine. Returns `{ rows, depletedAge, ... }` where `rows` is
  one object per projection year. This is what almost every chart/table/
  metric in the app is built from — it gets called multiple times per
  render (once for the current settings, again for each ±1yr/±3yr line,
  again per Monte Carlo path, again per sensitivity-analysis sweep, etc.),
  so it needs to stay reasonably cheap.
- `simulateHistorical(rowFn, retireAgeA, retireAgeB)` — a **near-duplicate**
  of `simulate()`, used by the historical-backtest and Monte Carlo views.
  Instead of one fixed nominal return, it takes a `rowFn(year)` that returns
  actual-historical `[calendarYear, stockReturn, inflation, bondReturn]` for
  that year, replayed from an embedded 1928–2025 dataset (or a randomly
  block-bootstrapped path, for Monte Carlo).
- `syncControls()` and `syncContributionControls()` — **two separate**
  functions that both push `state` back into the DOM (checkbox states,
  hidden/shown field groups, button `.active` classes, `<output>` text).
  Which one handles a given control is not obvious from the name — check
  where sibling/related controls already live before adding a new one. A
  common bug pattern in this codebase: writing a new field's DOM-sync line
  into the *wrong* one of these two functions, so the field's underlying
  `state` value updates correctly but its visibility/checked-state never
  refreshes. If a checkbox's own `.checked` reads correctly but a dependent
  field group's `.hidden` doesn't update, this is the first thing to check.
- `render()` — the main "redraw everything" function, called after every
  input change. Cheap-to-expensive: collapsible cards (tornado chart, Roth/
  RRSP bracket optimizer, cash-flow Sankey diagram) are only computed when
  `card.open` is true, gated inline in `render()`, with a matching `toggle`
  event listener that calls `render()` when the user expands the card. When
  adding a new expensive collapsible result, follow this pattern rather than
  computing it unconditionally on every keystroke.
- `mortgageSchedule()` (home mortgage) / `loanSchedules()` (each "Other
  loans" entry) — both compute a fixed level monthly payment via
  `mortgagePayment(principal, annualRate, years)` and then walk that
  payment forward against the current balance. The payment MUST be solved
  from the **original** principal and **original** term, never from the
  current remaining balance and however-many-years-the-user-thinks-are-
  left — a real loan's payment is fixed at origination and doesn't get
  smaller just because extra principal has been paid down since. Solving
  from (currentBalance, rate, yearsRemaining) instead silently
  under-charges the payment (since the same balance is being spread over
  the same number of years, ignoring that it started smaller than a fresh
  loan would have), which was an actual bug here until it was fixed: paying
  down half a mortgage early used to show *zero* change in projected
  payoff date, because the recalculated payment shrank to exactly offset
  the smaller balance. Both functions now take `originalPrincipal =
  (state.mortgagePrincipal / loan.principal) > 0 ? that : balance` — the
  fallback to `balance` matters for backward compatibility: it's what an
  older saved scenario (from before `mortgagePrincipal` existed, or one
  that simply left "Original principal" at 0) gets, which reproduces the
  old, only-wrong-if-you've-paid-extra behavior rather than silently
  producing a `$0` payment or a NaN. `term`/`mortgageYears` mean "the
  loan's original term" now, not "years remaining" — the actual remaining
  payoff time falls out naturally from walking the fixed payment against
  the current balance, so the user never has to know or calculate it
  themselves. The one place this pattern does NOT apply:
  `buildDeferredMortgage()` (used by `futureHomePurchase()` for the "Rent,
  then buy" transition) originates a brand-new loan at the full purchase
  price with a term from `state.buyTerm` (a manually-entered "Loan term
  (years)" field — originally a `buyTerm15` boolean toggling between a
  hardcoded 15 or 30 years, changed to a plain number so the person can
  enter whatever their actual term will be, e.g. 25 for the more
  Canada-typical amortization) from day one — there's no "remaining
  balance vs. original" ambiguity for a loan that hasn't started yet, so
  this one was already correct on the payment math and only needed the
  term itself to stop being hardcoded. Every
  downstream consumer (shelter cost, mortgage/loan payoff age, home equity,
  the Sankey diagram, the projection table's "Loan balances" column) reads
  `schedule.payments[year]`/`schedule.balances[year]` or
  `loans[i].payments[year]`/`loans[i].balances[year]` — never
  `state.mortgage`/`state.mortgageYears`/`loan.term` directly — so fixing
  these two functions was sufficient to correct every downstream number
  with no other call sites to update.
- `SENSITIVITY_LEVERS` / `computeSensitivity()` / `renderTornadoChart()` —
  the tornado chart. Levers live in one array (`id`, `label`, `run(endValue)`
  — mutate `state`, call `simulate()`, restore); which ones actually get
  swept is read fresh on every render from the checked `data-lever`
  checkboxes in `#sensLeverToggles`, not from `state` — this is a display
  choice for the chart, not a plan input, so it's not part of `defaults`/
  `normalizeState()`/scenario export, and there's a separate `change`
  listener on the toggle container (not the card's `toggle` event) that
  re-renders just this chart. Because the row count is no longer a fixed 5,
  `renderTornadoChart()` also resizes its own `.chart-wrap` (not just the
  canvas) to fit — that div has a fixed CSS height everywhere else in this
  file, so skipping this makes the canvas overflow its box and overlap
  whatever follows in the DOM once more than ~7 levers are checked at once.
  `computeSensitivity()`'s metric has a fallback for a plan that's already
  projected to deplete: reading `sim.rows.at(-1).total` (the final modeled
  year) floors at $0 for every lever once the current/baseline plan
  depletes before the end of the horizon, which would make every bar in
  the chart show an identical, uninformative $0-to-$0 range even though the
  levers clearly differ (one might deplete at 60, another at 89 — both
  read as "$0 either way" under the naive metric). The fix: decide once,
  from the baseline scenario only, whether to measure `finalValue` or
  `peakValue` (`Math.max` of every row's value) — `usePeak = finalValue(selected)
  <= 1` — and use that same metric for every lever's decrease/increase, so
  the whole chart is measuring one consistent thing. A healthy plan's peak
  is usually its final row anyway (assets still growing or flat at the
  end), so this only changes behavior in the depleted case. The switch is
  never silent: `#tornadoNote`'s text, the "Current (peak): $X" label on
  the chart itself, and the canvas's `aria-label` all flip in step with
  `usePeak`, computed and returned once from `computeSensitivity()` and
  read by `renderTornadoChart()` — don't let a future edit read `baseline`
  without also reading `usePeak`, or the label/note can go out of sync
  with what the bars are actually measuring.
- **Sidebar group order** — the `<details class="group">` blocks in the
  input panel are ordered most-basic-and-universal to most-niche-and-
  advanced, roughly: Scenarios (utility) → tax/province context → Timeline
  → Income → Retirement contributions → Pre-retirement healthcare →
  Household spending → Assets (renamed from "Portfolio composition") →
  Market assumptions → Housing → Retirement income & healthcare (SS/CPP,
  pensions, post-retirement healthcare, LTC) → Other loans → Bridge income
  → Additional income → Survivor planning → Withdrawal & tax strategy
  (smooth withdrawals, Guyton-Klinger, Roth conversion / RRSP meltdown
  ladder, Canada's pension income splitting). This is purely visual
  grouping — nothing in the JS depends on group order, and a field's id is
  the only thing that matters to `ids`/`normalizeState()`/scenario
  save-load, so groups can be freely reordered or renamed later without
  touching simulation logic. The old single `#partnerBFields` wrapper
  `<div>` (which used to bundle every Partner B field together under one
  `data-partner-b` attribute) was split apart when the fields it held moved
  into three different groups (Timeline/Income/Retirement contributions);
  each field now carries `data-partner-b` individually, matching the
  convention already used everywhere else in the sidebar (SS/pension/LTC/
  bridge-income B-fields). The `.single-person [data-partner-b]
  {display:none!important}` CSS rule and the `querySelectorAll('[data-
  partner-b]')` JS loop in `syncControls()` both already operate on the
  attribute wherever it appears, so splitting the wrapper needed no new
  code — only deleting the now-redundant `getElementById('partnerBFields')`
  line that pre-dated the CSS-attribute approach.
- `computeSankeyFlow()` / `layoutSankeyColumn()` / `renderSankey()` — the
  cash-flow Sankey diagram. This planner doesn't track which specific dollar
  funded which specific expense, so the diagram deliberately routes every
  source through a single neutral **hub** node (a thin bar between the two
  columns) rather than drawing direct source→expense ribbons — an earlier
  version drew one ribbon per (source, expense) pair based on where their
  stacked y-ranges happened to overlap, which produced meaningless tiny
  slivers (e.g. "Social Security → Healthcare: $80") and, at low opacity,
  visually blended into a single wash. The hub design draws exactly
  `sources.length + uses.length` ribbons (never N×M), each occupying its own
  non-overlapping vertical band, so nothing blends and nothing implies a
  pairing the data doesn't have. The hub's left-face and right-face y-
  partitions are each their own independent ordering (sorted by descending
  value) of the same categories — that's a pure layout choice (the hub
  retains no per-source identity past its edge) and is what gives the
  ribbons real diagonal curvature instead of flat rectangles. Node/category
  colors come from the `dataviz` skill's validated 8-hue categorical palette
  (`SANKEY_HUES`), reused across the two columns since they're spatially
  separated by the hub — only within-column neighbors need to stay visually
  distinct. Each node and ribbon is its own hover/focus target (a `#sankeyTooltip`
  div styled like the existing `#chartTooltip`), per the "mark is the hit
  target" rule for bar/cell-type marks (not a shared crosshair, which is
  reserved for the continuous ±1yr/±3yr/CAGR line charts).
  `simulate()` (not `simulateHistorical()` — the Sankey only ever reads
  `simulate()`'s rows) tracks `traditionalWithdrawn`/`taxableWithdrawn`
  alongside `rmd`: the total actually drawn from the traditional/taxable
  buckets that year, **folding in whatever came from the matching bond
  sub-account** (`bondTraditional`/`bondTaxable`) rather than leaving it
  buried in the "From portfolio" catch-all. This matters because RMDs (and
  any additional shortfall withdrawal) draw from `traditional` first and
  spill into `bondTraditional` only once that's exhausted (see the
  `rmdFromTraditional`/`fromBondTrad` lines) — so in a year where the equity
  sub-account has already hit zero but the bond reserve hasn't, the
  Sankey's "Traditional withdrawal" source would otherwise look artificially
  small (or the RMD would look inexplicably tiny) relative to what's really
  leaving the traditional-tax-status pool. When porting a change to this
  area, increment both accumulators at every `drawTaxable()`/binary-search
  withdrawal call site, not just the top-level `rmd` calc.
- MCP tool hooks (`read_fire_projection`, `update_fire_assumptions`) near
  the bottom of the script, registered if `window.mcp` exists — lets an
  agent read/drive the live projection. Keep the `execute` handler's
  allow-list (`if (k === 'foo' && ...) state.foo = v`) in sync with any new
  `ids`/boolean/enum state field.
- **Mobile swappable screens** — `#workspace`'s `data-mobile-view` attribute
  (`"inputs"` or `"dashboard"`, set by the `setupMobileTabs()` IIFE near the
  bottom of the script) plus two CSS rules scoped inside the existing
  `@media(max-width:820px)` block (`.workspace[data-mobile-view="dashboard"]
  .panel{display:none}` / `...="inputs"] .content{display:none}`) is what
  turns the one-long-scroll mobile layout into an Inputs/Dashboard tab
  switcher. The `.mobile-tabs` bar itself is `display:none` outside that
  media query, so desktop's two-column `.workspace` ignores the attribute
  entirely — no JS branching on viewport width is needed, only CSS. This is
  intentionally a pure display toggle, not a route or app state: it isn't
  part of `state`/scenario export, same reasoning as the tornado chart's
  lever checkboxes. The one thing that isn't free: canvas-based charts
  (`chart`, `tornadoChart`, `overlayChart`, the Sankey) measure their own
  container via `getBoundingClientRect()`, which returns a zero/stale width
  while `.content` is `display:none`, so `setMobileView()` calls `render()`
  whenever the target view is `"dashboard"` — switching to that tab always
  gets a fresh, correctly-sized render rather than whatever (non-)size was
  measured while hidden. When adding a new canvas-based result card, no
  extra wiring is needed as long as it's redrawn from `render()` (or a
  `card.open`-gated call inside it) — it'll get sized correctly the moment
  the Dashboard tab becomes visible, same as the existing charts. The
  mobile default is `"dashboard"`, not `"inputs"` — the plan is always
  fully computed (even on the generic example data, before a real edit),
  so a mobile visitor sees the actual results first rather than a form.
  `setMobileView('dashboard')` is also called when the wizard's `Done`
  button is clicked, for the same reason — "what's visible after the
  wizard is done" should be the plan, not the form they just filled in.
  Calling `setMobileView()` is always safe on desktop too (the attribute
  has no CSS effect there), so call sites don't need to branch on viewport
  width.
- **Plan status bar** (`#planStatusBar`, `renderPlanStatusBar()`) — a
  compact, sticky one-line summary ("Retire 60/55 · $1.1M at retirement ·
  lasts to 100+ · 94% historical success") that stays pinned to the top of
  the viewport as the page scrolls, so the model's current answer is never
  more than a glance away even 400+ lines down a long results page. Lives
  as a direct child of `<main>`, *before* `#firstRunBanner`/`#decisionCard`
  — same "outside `#workspace`, visible on both mobile tabs" reasoning as
  those two (see below), plus it needs `position:sticky` itself, which
  neither of those two uses.
  - Most of the line is free: retirement age(s), investable-at-retirement,
    and depletion age all come from the same `simulate()` call every
    `render()` already makes. The one expensive piece is the historical
    success rate (`runHistoricalCycles()`, the same ~70-90-cycle backtest
    the collapsed "Historical (S&P 500)" chart view uses) — computing that
    on every keystroke would add real typing lag, so it's **debounced**
    (`schedulePlanStatusHistRate()`, 500ms idle) rather than computed
    inline. `render()` calls `renderPlanStatusBar()` unconditionally (cheap
    parts update immediately); that function re-arms the debounce timer
    each time *unless* it was itself invoked by the debounce's own callback
    (`{ reschedule: false }`) — omitting that guard would have the callback
    immediately reschedule itself and recompute the backtest forever, once
    every 500ms, with nothing left to actually debounce against. Until the
    first debounced pass resolves (page load, or right after any edit), the
    success-rate clause is simply omitted rather than showing a stale or
    placeholder number.
  - The "Updated just now" pulse (`#planStatusUpdated.show`, 3s fade) fires
    whenever the bar's *text* actually changes — comparing against
    `planStatusLastText`, not against a "did render() run" flag, since
    render() runs on every keystroke regardless of whether anything the bar
    shows actually moved (e.g. toggling a checkbox unrelated to retirement
    math). Because the debounced historical-rate update lands ~500ms after
    an edit and appends a new clause to the text, it triggers its *own*
    "Updated just now" pulse, extending visibility a bit past the initial
    edit's 3s window — this is intentional, not a bug: the number
    genuinely did just change again.
  - Clicking the bar switches to the Dashboard tab if currently on Inputs
    (mobile), then smooth-scrolls to `.metrics` and briefly adds
    `.flash-highlight` (a blue outline pulse, `.metrics.flash-highlight`)
    so the click has a visible destination rather than just silently
    landing somewhere.
  - **Sticky-stacking gotcha, and the bug it uncovered**: the bar sits
    above the sidebar's sticky `.panel-title` and (on mobile) the sticky
    `.mobile-tabs` switcher, so all of them need coordinated `top` offsets
    or they visually overlap once more than one is simultaneously "stuck."
    `syncPlanStatusOffsets()` measures the bar's real height into
    `--plan-status-h` (used by `.mobile-tabs`' own sticky `top`) and the
    combined bar+tabs stack height into `--mobile-sticky-h` (used by
    `.panel-title`'s mobile `top` and the scroll-margin on cards a
    decision-question button scrolls to) — measured rather than
    hand-guessed, so a future copy or font change that alters either bar's
    rendered height doesn't quietly reopen the overlap. Building this
    exposed a real, pre-existing bug: `html,body{overflow-x:hidden}` (added
    to stop mobile horizontal overflow) forces the browser to compute
    `overflow-y` as `auto` too — a documented CSS quirk (an element can't
    have one axis "not visible" and the other "visible"; the visible one
    gets silently promoted to `auto`) — which makes `<body>` register as a
    scroll container without actually being a bounded/clipped one (it has
    no explicit height, so it never visibly scrolls on its own), and that
    combination broke `position:sticky` for **every** sticky element on the
    page (topbar, `.panel`, `.panel-title`, `.mobile-tabs` — not just the
    new bar) under real scrolling, even though it wasn't visually obvious
    without actually testing a scroll. Confirmed with Playwright: real
    mouse-wheel scrolling (not `window.scrollTo`, which can mask this) showed
    every sticky element scrolling away instead of pinning. Fixed by
    switching to `overflow-x:clip` instead of `overflow-x:hidden` on
    `html,body` — `clip` suppresses horizontal overflow the same way but,
    unlike `hidden`/`scroll`/`auto`, never establishes a scroll container in
    the first place, so it doesn't trigger the pairing quirk. If a future
    change reintroduces `overflow-x:hidden` (or any `hidden`/`scroll`/`auto`
    overflow) anywhere between a sticky element and the viewport, re-test
    sticky behavior with an actual scroll gesture, not just a
    `scrollWidth > clientWidth` overflow check — the overflow check would
    have passed the whole time this bug existed.
  - **A related gap, found later from real usage**: the base/desktop
    `scroll-margin-top` on `.metrics`/`#sensitivityCard,#mainChartCard` only
    accounted for `--topbar-h`, not the Plan Status Bar's own height
    (`--plan-status-h`) — the mobile media query's equivalents already
    correctly used `--mobile-sticky-h` (which folds the bar's height in),
    but the desktop/base rules predated the bar and were never updated once
    it started sitting `position:sticky` right below the topbar on desktop
    too. Result: clicking the bar to jump to `.metrics` via
    `scrollIntoView({block:'start'})` landed with the top of `.metrics`
    partially hidden behind the bar, needing a small manual scroll up to
    see the top row. Fixed by adding `+ var(--plan-status-h,0px)` to both
    desktop `calc()` expressions, reusing the variable `syncPlanStatusOffsets()`
    already computes unconditionally (not just on mobile) rather than adding
    a new one.
  - **Mobile text truncation, found from a phone screenshot**:
    `.plan-status-text` is `white-space:nowrap;overflow:hidden;text-overflow:
    ellipsis` — a deliberate safety net for the rare case the line is too
    long even on desktop — but at 390px-ish phone widths, the full line
    ("Retire 41/42 · $1.3M at retirement · lasts to 81+ · N% historical
    success") routinely doesn't fit on one row and was getting cut off after
    only the retirement-age clause, hiding the rest of the summary (the
    literal point of the bar) behind a "…". Fixed with a mobile-only
    override inside the existing `@media(max-width:820px)` block:
    `.plan-status-text{white-space:normal;overflow:visible;text-overflow:
    clip}` lets it wrap onto 2+ lines instead of truncating. No extra height
    plumbing was needed: `syncPlanStatusOffsets()` already reads the bar's
    real `offsetHeight` into `--plan-status-h`/`--mobile-sticky-h` on every
    `render()`, so a taller, wrapped bar is picked up automatically by
    every sticky-offset and scroll-margin calc() that already depends on
    those variables (the mobile-tabs bar's position, `.panel-title`'s
    sticky `top`, `.panel`'s own `syncPanelMaxHeight()`). Desktop keeps the
    single-line ellipsis behavior, since the bar has much more horizontal
    room there and truncation there would be a genuine edge case rather
    than the routine case mobile was hitting.
  - **First attempt at the wrap left a gap**: simply switching to
    `align-items:flex-start` (still `flex-direction:row`, the default) kept
    `.plan-status-text` and `.plan-status-right` as side-by-side flex items,
    so the text's own box only ever got `barWidth - rightColumnWidth` to
    wrap within — on *every* line, not just the first, even though the
    chevron/pulse only visually occupies the first line's height. That left
    a chevron-width strip of dead space down the right side of every
    wrapped line and pushed the text to wrap a line earlier than it needed
    to (a screenshot showed "success" alone on a 3rd line with obvious room
    beside it). Flexbox doesn't reflow text around a sibling item the way
    a float or CSS shape would; a flex item's box width doesn't shrink
    line-by-line just because the sibling next to it stopped needing space.
    Fixed by adding `flex-wrap:wrap` to `.plan-status-bar` and
    `flex:1 1 100%` to `.plan-status-text` — a `flex-basis:100%` item
    forces a wrap onto a new flex line in a wrapping flex container, so the
    text now gets the *entire* bar width to itself and `.plan-status-right`
    drops to its own line below (right-aligned there via
    `margin-left:auto`, since it's now alone on that line rather than
    sharing one with the text).
- **First-run banner** (`#firstRunBanner`, styled like `.shortfall-banner`
  but with `--blue` instead of `--amber`) and the **"Explore a question"
  menu** (`#decisionCard`) both live as direct children of `<main>`, *before*
  `#workspace`, not inside `.content` — they used to be the first two
  children of `.content` but that meant they vanished on mobile whenever the
  Inputs tab was active (`.content` is `display:none` in that state). Living
  above `#workspace` means they render once and are visible regardless of
  which mobile tab is active, and also regardless of `.panel`/`.content`
  being swapped in/out — no duplication, no per-tab-state tracking needed.
  On desktop this also makes them full-width above the two-column layout
  rather than confined to the right column, which reads better anyway. Both
  need their own `margin-bottom` now that they're outside `.workspace`'s
  grid `gap` (`.first-run-banner` already had one; `#decisionCard` needed
  one added). The page has no persistence across reloads (see the README's
  privacy note), so it always boots into the same fully-computed projection
  built from generic example numbers, which reads as someone else's
  finished plan rather than an invitation. The
  banner names that and links to the two real "make it yours" paths (the
  `#wizardBtn` — relabeled `✨ Get started` and given the `.cta-btn` accent
  style so it's the most visually prominent action in the topbar, not just
  another gray pill — or importing a scenario file). It self-dismisses via
  `dismissFirstRunBanner()`, wired to three signals: a real `input`/`change`
  event bubbling from anywhere in `.panel` (a `{ once: true, capture: true }`
  listener — programmatic init code sets `.value` directly without
  dispatching events, so this only fires on actual user interaction, not
  boot-time `syncControls()`), the wizard being opened (intent is clear the
  moment they click, whether they finish it or not), or a scenario file
  actually being imported. There's no flag to persist "seen it" across a
  real reload — consistent with the rest of the app, since nothing else
  persists either — so it will show again next load, which is fine since a
  fresh load always looks identical anyway.
- **"Explore a question" menu** (`DECISION_QUESTIONS`, `#decisionQuestions`,
  `#decisionAnswer`, `renderDecisionQuestionAnswer()`) — a v1 slice of the
  broader "reframe as a decision workflow, not a calculator" direction.
  Deliberately built as a thin UI layer over comparisons the app already
  knows how to run, not new modeling:
  - `retireTiming`, `buyVsRent`, and `rothLadder` are **`kind: 'compare'`**
    questions. `retireTiming` calls `simulate(altRetireAgeA, altRetireAgeB)`
    directly (the same override-params path the existing ±3yr chart and the
    `retireAge` sensitivity lever use, so there's no state mutation at all);
    `buyVsRent`/`rothLadder` follow `SENSITIVITY_LEVERS`' mutate/simulate/
    restore idiom instead (see the v2 note below). All three return
    `{ rows, sentence }`: `rows` renders through `renderDecisionCompareTable()`
    (styled like the existing scenario-compare table), `sentence` through
    `decisionDeltaPhrase()`, which special-cases the "both variants already
    fully depleted" case — once end assets are $0 either way, a dollar
    delta is meaningless noise, so it leads with the depletion-age
    difference instead.
  - A `survivor` question ("what if my spouse dies first?") existed
    briefly in v1 — same mutate/simulate/restore shape against
    `state.survivorEnabled` — and was removed at the user's request as too
    grim a framing for the question menu, even though the underlying
    survivor-planning feature itself (the sidebar's "Survivor planning"
    section, `state.survivorEnabled`/`survivorPartner`/`survivorDeathAge`/
    `survivorSpendingPct`) is untouched and still fully modeled — this only
    pulled it out of the quick-question menu. Don't re-add a decision
    question that leads with mortality without checking first.
  - `sensitivity` and `returns` are **`kind: 'open'`** questions — no new
    rendering, they just open/scroll to a card that already exists
    (`#sensitivityCard`, or `setChartView('hist')` on `#mainChartCard`).
    `returns` also has an optional `note()` for a one-line success-rate
    callout; `open` questions without a `note()` leave `#decisionAnswer`
    hidden rather than showing an empty card. Both call
    `switchToDashboardTab()` first — since the question row now lives above
    `#workspace` (visible on both mobile tabs, see above), a click can
    originate from the Inputs tab, and the target card lives in `.content`,
    which is `display:none` in that state. `switchToDashboardTab()` just
    calls `setMobileView('dashboard')` if `#workspace`'s current view is
    `'inputs'` — harmless to call on desktop too, where the attribute has no
    CSS effect. `setMobileView` itself is declared with `let` right next to
    `DECISION_QUESTIONS` (not left private inside the mobile-tabs setup
    block further down) specifically so these two closures can reach it;
    the mobile-tabs block assigns the real implementation to that same
    variable rather than declaring its own. Both cards also carry
    `scroll-margin-top` (topbar height + a buffer on desktop, a fixed value
    accounting for the sticky `.mobile-tabs` bar on mobile) so
    `scrollIntoView({block:'start'})` doesn't land with the card's own
    heading tucked under a sticky element above it.
  - **v2 (built):** `buyVsRent` and `rothLadder` follow the same
    mutate/simulate/restore idiom `SENSITIVITY_LEVERS` uses — directly against
    `state.tenure`/`state.rothConvEnabled` (Canada: `state.meltdownEnabled`),
    never through `setTenure()` (which permanently mutates state, calls
    `render()`, and persists via `saveInputs()` — fine for a real sidebar
    toggle, wrong for a non-destructive what-if). Turns out neither needs a
    mobile-tab flip: both are `kind: 'compare'`, so their answer renders
    into `#decisionAnswer`, which — like the rest of `#decisionCard` — sits
    above `#workspace` and is visible on both mobile tabs regardless
    (`switchToDashboardTab()` is only needed by the `kind: 'open'`
    questions, which scroll to a card that actually lives inside
    `.content`). `buyVsRent` always compares the two pure endpoints (`'own'`
    vs `'rent'`), labeling whichever matches `state.tenure` as "(current)";
    for `'rentThenBuy'` neither row matches, so the sentence adds a note
    that the real plan transitions rather than picking a pure endpoint.
    `rothLadder`/`meltdownEnabled` compares the ladder on vs. off using
    whatever window/bracket is already configured, same as `survivor`
    ignores the current `survivorEnabled` value.
  - Field-name differences to keep in mind if extending either: US
    `rothConvEnabled`/`rothConvStartAge`/`rothConvEndAge`/`rothConvBracket`
    vs. Canada `meltdownEnabled`/`meltdownStartAge`/`meltdownEndAge`/
    `meltdownBracket` — same shape, different keys and labels ("Roth
    conversion ladder" vs. "RRSP meltdown ladder"), same pattern as
    `SENSITIVITY_LEVERS`' `ss` lever already diverging between the two files.
  - **v3 (built):** `mortgagePayoff`, `ssTiming`, and `longevity` — three
    more `kind: 'compare'` questions, all following the same mutate/
    simulate/restore idiom (none of the three can use `retireTiming`'s
    override-params path, since `simulate()` only accepts retirement-age
    overrides).
    - `mortgagePayoff` toggles `state.extraPrincipal` between 0 and either
      its current value or a $500/mo stand-in (if the user has never set
      one — otherwise both rows would be identical). No extra modeling
      needed: the app already routes extra principal through
      `mortgageSchedule()`'s cash flow into reduced brokerage contributions,
      so mutating the one field is sufficient. The question button itself
      carries no `data-*` marker but is hidden by a plain
      `document.querySelector('[data-question="mortgagePayoff"]').hidden =
      state.tenure !== 'own'` line in `syncControls()` (right after the
      other tenure-conditional `.hidden` lines) — there's no current
      mortgage to accelerate under `'rent'`/`'rentThenBuy'`, so rather than
      showing a comparison that isn't really answerable, the button doesn't
      appear until `tenure === 'own'`.
    - `ssTiming` compares claim-age extremes (62 vs. 70 in the US) rather
      than a small offset, since Social Security/CPP/OAS claiming has hard
      legal bounds and the real question is "early vs. late," not a nudge.
      **US** is a single lever (`ssStartAgeA`/`B`, 62–70) so this is a
      straightforward 3-row table (early/current/late). **Canada** has two
      independent levers with different economics — CPP (60–70) has a
      *smaller* per-year deferral credit than OAS (65–70) — so a real,
      commonly-recommended strategy is to take CPP around 65 while
      deferring OAS to 70; bundling both levers into one "early/late" toggle
      (as a first draft of this question did) would hide that strategy
      entirely, since it only ever lets both move together. The Canada
      version is a 4-row table instead: both-early (CPP 60/OAS 65),
      current, CPP-65/OAS-70 (defer OAS only), and both-late (CPP 70/OAS
      70). If this ever needs a genuine full sweep, the real design space
      is a 2-D grid (CPP age × OAS age) — the 4 rows here are named,
      commonly-discussed strategies, not an exhaustive search.
    - `longevity` compares the current life expectancy setting against
      +10 years (capped at the slider's max of 110), applied to both
      partners in lockstep for couples — a relative offset rather than a
      fixed absolute age like 95 or 100, since both defaults are already
      100 and a fixed target could easily be *shorter* than what's already
      configured. Same offset idiom as `retireTiming`'s ±3 years.

- **`renderPlanHeadline(selected)` / `renderShortfallBanner(selected)`** —
  the dashboard's top-of-page callout is exactly one of these two, never
  both: both key off the same `selected.depletedAge` truthy/falsy value, so
  there's no separate coordination flag. `renderShortfallBanner()` (pre-
  existing) shows an amber warning when the plan depletes before the end of
  the horizon. `renderPlanHeadline()` is its positive counterpart — when
  the plan *doesn't* deplete, it says so plainly with real numbers (the end
  age and end assets) via a green-accented `.plan-headline` callout
  (`#planHeadlineBanner`, using the new `--green` CSS variable, themed the
  same way `--amber`/`--red` already are), rather than leaving the top of
  the dashboard silent for a healthy plan. Both are called back-to-back
  from `render()` (`renderPlanHeadline(selected)` immediately before
  `renderShortfallBanner(selected)`).

## Dashboard as home: the "Explore a question" bubble + collapsed methodology

The plan verdict (`#planHeadlineBanner`/`#shortfallBanner` + the Plan Status
Bar) is meant to be the first thing a person sees. Two things used to get in
the way of that even after the verdict itself was made prominent:

- **"Explore a question" (`#decisionCard`) used to render as a big,
  always-expanded 8-button menu.** In an earlier iteration it was moved to
  render *after* all Dashboard content (metrics, chart, sensitivity/Roth/
  Sankey cards, the full projection table, and several always-expanded
  explanation callouts) so it wouldn't compete with the verdict for
  attention — but that meant it landed at the literal bottom of a very long
  page, which was worse: effectively unreachable without a long scroll.
- **The methodology/tax/healthcare/backtest explanation callouts were
  always expanded**, adding a large wall of static text between the
  projection table and the footer on every load, pushing everything below
  them (previously including decisionCard) far down the page.

**Current design** (superseding the earlier order/sibling-selector
approach — that whole mechanism was removed):

- `#decisionCard` is now a `<details class="result-card">` — a small,
  collapsed-by-default "💡 Explore a question" pill/bubble — living
  **inside** `.content`, right after `#changeAssumptionsBtn` and *before*
  `.metrics`. It expands in place (native `<details>`/`<summary>`
  behavior — no JS needed) to reveal the same 8 question buttons and
  `#decisionAnswer`. Collapsed-state styling (`#decisionCard:not([open])`)
  strips the card's normal padding/border/shadow and re-applies them to
  just the `<summary>`, so a closed decisionCard reads as a compact pill,
  not a full-size empty card; a small `.caret` span flips 180° via
  `#decisionCard[open] .caret` for an open/closed indicator.
- Because it's a real child of `.content` now (not a sibling of
  `#workspace`), it automatically inherits `.content`'s existing behavior
  for free: **full width on mobile** (`.workspace{grid-template-columns:1fr}`
  under `@media(max-width:820px)` makes `.content` span the whole viewport
  there anyway — the old "confined to the results column" problem was
  desktop-only) and **Dashboard-tab-only** (`.workspace[data-mobile-view=
  "inputs"] .content{display:none}` already hides all of `.content`,
  decisionCard included — no dedicated sibling-selector rule needed
  anymore). On desktop it's column-width, not full-width above `#workspace`
  like before — an intentional trade against the earlier "desktop must stay
  full-width" constraint, accepted because a collapsed bubble reads fine at
  column width and the whole point now is that it's *not* a big visual
  block competing with the verdict.
- `<main>` no longer needs `display:flex;flex-direction:column` — that was
  only there to support the old `order`-based reorder trick for
  decisionCard, which no longer exists. If a future change reintroduces a
  need to visually reorder one of `<main>`'s direct children (`#planStatusBar`,
  `#firstRunBanner`, `#workspace`) without moving it in the DOM, the flex/
  `order` technique is still valid to bring back — just don't confuse it
  with how decisionCard works today.
- **The methodology/tax/healthcare/backtest callouts** now live inside their
  own collapsed-by-default `<details class="result-card" id="methodologyCard">`
  ("Methodology & assumptions"), split out from the "Selected retirement
  timeline" card (which now holds just the projection table). Same
  `<details class="result-card">` pattern as `sensitivityCard`/
  `rothOptimizerCard`/`sankeyCard` — no `toggle` listener needed since
  nothing inside it is computed lazily (it's all static explanatory text
  set once, not a chart/table built from `simulate()`).

A `.change-assumptions-btn` (`#changeAssumptionsBtn`) still sits right after
`#shortfallBanner`/`#planHeadlineBanner`, `display:none` by default and only
`display:inline-flex` inside the mobile media query — on desktop, the
Inputs/Dashboard split doesn't exist, so there's nothing for the button to
switch away from. Its click handler (`setMobileView('inputs')` +
`window.scrollTo({top:0,behavior:'smooth'})`, registered right after the
`#planStatusBar` click listener in both files) exists because switching
mobile tabs just swaps which of `.panel`/`.content` is displayed *in place*
— without the explicit scroll-to-top, someone who scrolled deep into a long
Dashboard would land partway down the (differently-sized) Inputs panel
instead of at its top. This is unchanged from before.

### Post-launch fixes to "Explore a question" (real-world feedback)

A round of feedback after the collapsed-bubble redesign above shipped turned
up a few more issues, all in `renderDecisionCompareTable()`/
`renderDecisionQuestionAnswer()`/`renderChartView()`'s `chartView === 'cagr'`
branch:

- **The CAGR sweep's "current" line was silently wrong**, not just
  imprecise: `simulateAtRealCagr(realCagrPct)` derives the nominal-return
  override, but the line meant to *highlight* the user's own assumption
  computed `Math.round(...)` to the nearest **whole** percent and clamped to
  `[0,7]` — so a 7% nominal / 2.5% inflation input (real ≈ 4.39%) got
  labeled "4% (current)", a number that isn't actually what's entered. Fixed
  by keeping the exact value to the tenths place
  (`Math.round(... * 1000) / 10`) and using it as one of the swept rates
  itself (`simulateAtRealCagr(currentReal)`) rather than only as a label on
  the nearest whole-percent line. The fixed `0..7` comparison set drops
  whichever integer is numerically closest to that exact value first (ties
  broken toward the lower integer, since the loop only updates `closestInt`
  on a *strictly* smaller distance while iterating ascending) — so a 4.39%
  real assumption shows `0%,1%,2%,3%,4.4% (current),5%,6%,7%`, not two
  near-duplicate lines (4% and 4.4%) crowding the same part of the chart.
  `fmtRate()` (`Number.isInteger(r) ? '${r}%' : '${r.toFixed(1)}%'`) keeps
  the whole-percent lines reading as plain integers while the current line
  gets its one decimal.
- **`renderDecisionCompareTable()`'s "Portfolio lasts to" column said
  "Never"** for a plan that doesn't deplete, which read as an error state
  rather than a healthy outcome, and was inconsistent with every other
  table in the app: `computeScenarioMetrics()` (the main scenario-compare
  table) and `renderRothOptimizer()` (the Roth conversion/RRSP meltdown
  table) both already use `` `Age ${maxLifeExpectancy}+` `` for the same
  "never depletes" case. Fixed by computing that same
  `Math.max(lifeExpectancyA, singlePerson ? 0 : lifeExpectancyB)` value
  once at the top of `renderDecisionCompareTable()` and reusing the same
  convention, plus wrapping the cell in the same `.table-status` pill
  (green/fail) the other two tables use, rather than plain text.
- **The compare-table answer didn't scroll into view.** With 8 questions
  now in the menu, clicking one near the bottom of the list — or reading it
  on mobile, where the button might be on the Inputs tab — could leave the
  resulting table off-screen with no visual cue anything happened.
  `renderDecisionQuestionAnswer()`'s `compare`-kind branch now calls the
  same `switchToDashboardTab()` the `open`-kind branch already used, then
  `answer.scrollIntoView({behavior:'smooth', block:'nearest'})` — `nearest`
  rather than `start`, since `#decisionAnswer` sits near the top of
  `.content` already (right below the question buttons) and a `start`
  scroll would over-scroll past content that's often already visible.
- **The compare table was wider than it needed to be** and always
  triggered `.table-wrap`'s horizontal scrollbar, because it inherited the
  generic `table{min-width:760px}` rule meant for the wide projection/
  scenario-compare tables, even though it only ever has 4 columns
  (Scenario/Investable/Lasts to/End assets) and 2-4 rows. Fixed with a
  dedicated `.decision-compare-table` class (`min-width:0`, tighter
  `8px 10px` cell padding and `.76rem` font vs. the generic `12px 13px`/
  `.8rem`) so it sizes to its actual column content and the card's own
  width instead of forcing a scrollbar — column headers were shortened to
  match ("Investable"/"Lasts to" instead of "Investable at retirement"/
  "Portfolio lasts to") since the narrower table has less room and the
  bubble's intro sentence already gives the full context.

## Home-screen redesign, round 2: fewer headline metrics, card-style questions, categorized wizard Step 2

Three ChatGPT-sourced UX suggestions, implemented on `home-screen-redesign`
without touching any modeling/simulation code:

1. **Dashboard headline shrunk from 9 metrics to 4, with the rest in a
   "More results" disclosure.** The old flat `.metrics` grid (Investable at
   retirement, Net worth, Portfolio lasts to, Bond ladder, FI number, FIRE
   number, Estimated early-retirement age, plus the chart-view-gated
   Historical/Monte Carlo success cards) is now split: a `.metrics
   .metrics-primary` block right after `#decisionCard` shows only
   Investable at retirement, Retirement age, Portfolio lasts to, and
   Historical success; everything else moved as-is (same ids, same
   `render()` call sites — nothing renamed) into a new `<details
   class="result-card" id="moreResultsCard">` right after it, following the
   same collapsed-by-default pattern as `#sensitivityCard`/
   `#rothOptimizerCard`/`#sankeyCard`. `#histSuccessCard`/`#mcSuccessCard`
   (chart-view-gated, unrelated to the new always-on tile below) still live
   inside `#moreResultsCard` and are untouched. `#moreResultsCard`'s caret
   icon reuses `#decisionCard`'s `.caret`/`[open] .caret` CSS rules (now
   scoped to both ids with a comma) rather than duplicating them, but does
   **not** reuse `#decisionCard`'s collapsed-pill styling
   (`#decisionCard:not([open]) summary{...border-radius:999px...}`) — that
   stays decision-card-specific; More Results uses the same plain
   `cursor:pointer` inline summary style every other collapsible result-card
   already uses.
   - **Retirement age tile** (`#dashRetireAge`/`#dashRetireAgeSub`) is new
     state, not a rename — it's set in `render()` right next to
     `#retireAssets`, from the same already-computed `retirement` row, so
     it costs nothing extra.
   - **Historical success tile** (`#dashHistSuccess`/`#dashHistSuccessSub`)
     deliberately does **not** run its own backtest. It piggybacks on the
     Plan Status Bar's existing debounced `runHistoricalCycles()` call
     (`planStatusHistRate`, `schedulePlanStatusHistRate()` — see "Plan
     status bar" above): `renderPlanStatusBar()` now also writes this
     tile's text/color (green/amber/red via the `positive`/`warning`/
     `negative` classes, same thresholds as the Monte Carlo success text)
     every time it updates the status bar string, including the debounced
     500ms-later update. Until the first debounced pass resolves, the tile
     shows "—" as its `<strong>` text, same as it always did before
     `render()`'s first pass — there's no separate loading state to keep in
     sync. If a future change ever needs a *different* historical-success
     number here than the status bar's (e.g. a different projection
     length), don't just copy the tile-writing block — the two would need
     to diverge in `renderPlanStatusBar()` itself or be split into two
     independent debounced timers, doubling the backtest cost.
2. **"Explore a question" → "What do you want to figure out?", buttons
   became bigger two-line cards.** All 8 `DECISION_QUESTIONS` buttons are
   unchanged in behavior (`data-question`, the click handler's
   `e.target.closest('button[data-question]')`, and the `.active`-class
   toggle in `renderDecisionQuestionAnswer()` all still key off the
   `<button>` element itself) — only their inner markup changed, from a
   single text node to `<span class="q-title">…</span><span
   class="q-desc">…</span>`, styled via new (non-minified, appended right
   before `</style>`) `.decision-questions button .q-title`/`.q-desc`
   rules. No consolidation of the 8 questions into fewer categories was
   done — ChatGPT's mockup showed 4 example buttons, but the underlying app
   already has 8 distinct, independently-tested comparisons wired to 8
   buttons; collapsing them into fewer visual categories would mean either
   inventing a two-tier click target (a category card that reveals
   sub-buttons) or actually dropping/merging questions, both bigger and
   riskier changes than what was asked for. The lower-risk interpretation —
   keep every question, just make each button visually bigger with a
   description — is what shipped.
3. **Wizard Step 2 reorganized into named categories.** `#wizardTitle`
   now reads "A few optional questions" (was "Customize modeled features")
   and `#wizardStepNote` opens with "these can make your projection more
   realistic. Skip anything you're unsure about." for step 2. The flat list
   of checkboxes inside `#wizardStep2` now has plain (non-collapsible)
   `<h3 class="wizard-subhead">` category headings inserted between groups
   — Healthcare, Income, Taxes & investing, Guardrails, Debt — matching the
   order and grouping ChatGPT proposed. This is markup-only: the wizard's
   proxy-field wiring (the `[wizardId, realId]` pairs array near the bottom
   of the script) reads fields by id regardless of DOM position, so
   reordering/grouping them needed no JS change. **US** has all 5
   categories (Healthcare: ACA + LTC; Income: bridge/part-time + additional
   income; Taxes & investing: Roth conversion ladder + mega backdoor Roth;
   Guardrails: Guyton-Klinger; Debt: other loans) — note ACA now sorts
   *before* LTC within Healthcare, a harmless field-order swap from the old
   list. **Canada** has no ACA or mega-backdoor-Roth equivalent, so
   Healthcare has only LTC and Taxes & investing has only the RRSP
   meltdown ladder — same 5 category headings still used (an empty
   category was avoided by construction, not by hiding one), same ordering
   otherwise (RRSP meltdown ladder is Canada's Roth-conversion-ladder
   analog, same as elsewhere in this file).

All three changes are presentation-only: no `defaults`, `normalizeState()`,
`ids`, `simulate()`/`simulateHistorical()`, or scenario-export shape
changed. Verified with `npm test`, a syntax check of both files, and
Playwright checks (both files, light+dark, desktop+390×844 mobile): the 4
primary tiles render with `#moreResultsCard` collapsed by default,
expanding it reveals the moved metrics under their original ids, all 8
decision-question buttons still open `#decisionAnswer` on click, wizard
Step 2 shows the 5 subheadings in order, and no horizontal overflow at
mobile width in either theme.

### Round 3: wizard readability + Step 2 checkbox flow

Two follow-up fixes to round 2's wizard Step 2, from trying it in the
browser:

- **Tiny text.** `#wizardModal label`/`small` were inheriting the dense
  sidebar's type scale (`.84rem`/`.76rem`) verbatim — fine in a 300px-wide
  sidebar field, cramped in the wizard's own wider, less-packed modal.
  Fixed by scoping a slightly larger scale to the wizard only:
  `#wizardModal label{font-size:.92rem}` and `#wizardModal
  small{font-size:.82rem;line-height:1.45}` — the sidebar's own type scale
  is untouched.
- **Step 2 fields squeezed into the left half of the modal.** The shared
  `.field{grid-template-columns:minmax(0,1fr) 116px}` template is built for
  a label-on-the-left / real-`<input>`-on-the-right row (that's what Step 1
  uses). But every Step 2 field is a single `<label>` wrapping its own
  checkbox — there's no second grid child — so that unused 116px column sat
  empty on the right, and the label (with its multi-line description) was
  confined to the narrower first column instead of using the full row.
  Fixed with `#wizardStep2 .field{grid-template-columns:1fr}` (each field
  now sizes to the full width of whichever grid cell it's in) plus making
  `#wizardStep2` itself a `display:grid;grid-template-columns:1fr 1fr` two-
  column flow (collapsing to one column under `@media(max-width:600px)`,
  independent of the existing ≤820px/≤520px breakpoints elsewhere in the
  app) so the category's checkboxes read left-to-right, top-to-bottom
  instead of stacking one-per-row all the way down. `.wizard-subhead` picks
  up `grid-column:1/-1` so each category heading still spans both columns
  rather than sitting in the left one only. A category with an odd number
  of items (Healthcare/Taxes & investing on Canada, Guardrails/Debt on
  both) simply leaves the second column of its last row empty — no special-
  casing needed, CSS grid handles it.
- **Modal widened 520px → 640px** (`#wizardModal`'s base `max-width`,
  edited in place rather than appended, so the existing
  `@media(max-width:520px){#wizardModal{max-width:100%;…}}` mobile override
  — which comes later in the stylesheet and must keep winning on narrow
  viewports — isn't accidentally shadowed by a later same-specificity rule)
  to give the new 2-column Step 2 layout (and Step 1's larger text) room to
  breathe; Step 1's existing label+input rows also read more comfortably at
  the wider size, so no Step-1-specific adjustment was needed.

Verified with `npm test`, a syntax check, and Playwright screenshots (both
files, desktop 1280px + mobile 390px): Step 2 renders as a clean 2-column
flow with full-width category headings at desktop widths, collapses to one
readable column on mobile, Step 1 is visually unaffected (still label+input
per row, just larger), and there's no horizontal overflow at either width.

**Follow-up fix, same round: Step 2 rendered stacked under Step 1 instead of
replacing it.** `renderWizardStep()` toggles visibility with the `hidden`
attribute (`document.getElementById('wizardStep2').hidden = wizardStep !==
2`), which relies on the browser's UA stylesheet rule `[hidden]{display:
none}`. The new `#wizardStep2{display:grid;...}` rule added above is an ID
selector (specificity 1,0,0), which beats that UA attribute-selector rule
(0,1,0) regardless of source order — so `display:grid` won even while
`hidden` was set, and both steps rendered at once (Step 2 appended below
Step 1), on both desktop and mobile. This is the exact same trap called out
in "Undo toast for Reset and Load scenario" above for `.undo-toast[hidden]`
— any new rule on an element that's also toggled via the `hidden` attribute
needs its own `#id[hidden]{display:none}` (or `.class[hidden]{...}`)
override, since a plain ID/class rule for the visible state doesn't
automatically defer to `[hidden]` the way relying on the UA default alone
would have. Fixed with `#wizardStep2[hidden]{display:none}` immediately
after the `display:grid` rule. Verified with Playwright: `getComputedStyle`
on both `#wizardStep1`/`#wizardStep2` confirms exactly one is
`display!=='none'` at a time, in both steps, both files, both desktop and
mobile widths.

### The `simulate()` / `simulateHistorical()` duplication trap

These two functions share large near-identical blocks of logic (contribution
limits, RMD/RRIF math, tax profile construction, healthcare/LTC costs,
withdrawal waterfall, etc), but are **not** literally identical — each has
its own local variable names in places (e.g. `factor`/`limitFactor` differ
between them) and only one of them has certain features (e.g. only
`simulate()` models the Roth conversion ladder / RRSP meltdown ladder and
ACA/IRMAA gating; `simulateHistorical()` deliberately omits those). When a
new feature needs to touch both:

1. **Never assume a change to one automatically applies to the other** —
   port it deliberately, checking the parallel spot for structural
   differences first (a subagent/`Grep` pass to diff the two functions side
   by side before editing is worth the time on anything nontrivial).
2. The `Edit` tool's exact-string matching will frequently fail with
   "Found 2 matches" because the same code stretch exists verbatim in both
   functions. Either widen the `old_string` with enough unique surrounding
   context to disambiguate, or — for large multi-line blocks — use a
   precise Node.js line-range-replacement script (read the file, split into
   lines, assert the exact first/last line of the target range match an
   expected literal before splicing, write back) so you don't accidentally
   edit the wrong copy.
3. After editing, **syntax-check both files** before running anything else:
   ```bash
   node -e "
   const fs = require('fs');
   const html = fs.readFileSync('Planner_US.html', 'utf8');
   const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
   scripts.forEach((s, i) => { try { new Function(s); } catch (e) { console.log('SYNTAX ERROR', i, e.message); process.exit(1); } });
   console.log('syntax OK');
   "
   ```
   (swap the filename for the Canada planner too). This catches a mismatched
   brace/paren from a bad splice immediately, before you've spent time on
   Playwright debugging a problem that's actually just a parse error.

## US vs. Canada: same shape, different names and one fewer tax branch

The two planners share the same overall structure but are **not** simple
find-and-replace copies of each other — porting a feature from one to the
other requires re-deriving the equivalent, not just renaming variables:

- US: `ssMonthlyA/B` (Social Security) + `filingStatus` (`mfj`/`single`,
  with a `marryLater` transition age) + `rmdDivisor(age)`. Canada:
  `cppMonthlyA/B` + `oasMonthlyA/B` (with `oasClawback()` recovery tax) +
  `rrifMinPct(age)`, and there is no MFJ/single distinction or
  `marryLater` — Canada always taxes spouses as two individual returns.
- `taxFor(profile, gains, traditionalExtra)` has **3 branches** in the US
  file (`mfj` joint return / `singlePerson` / a "two separate filers" branch
  used only for the pre-marriage `marryLater` case) but only **2** in
  Canada (`singlePerson` / two individual `personTaxCA` calls) — don't
  assume the branch count or names carry over.
- Canada has pension income splitting (`pensionSplitEnabled`,
  `solvePensionSplit()`) with no US equivalent; the US has ACA subsidies,
  IRMAA, and Roth-conversion-ladder MAGI gating with no Canada equivalent
  (Canada's closest analog is the RRSP meltdown ladder, which has no
  income-tested healthcare cliff to gate against).
- Both `taxFor()`'s `singlePerson` branch reads **only** the `A`-slot
  profile fields (`otherA`, `wageA`, etc. in the US; just `otherA` in
  Canada) — this is why survivor modeling (one partner dies) has to
  actively remap the surviving partner's data into the `A` slot when it's
  Partner A who died, rather than just setting `profile.singlePerson = true`
  and leaving the data where it was.
- When asked to port a feature between the two files, do the research pass
  first (read both functions' relevant sections side by side) before
  writing any edits — the two files diverge in exactly the ways that make
  blind copy-paste silently wrong (double-counted tax, a feature gate that
  doesn't exist on the other side, a variable name that means something
  slightly different).

## Money-field in-field formatting (`class="money"`, `attachMoneyPreview`/`refreshMoneyPreviews`)

Every dollar-amount field carries `class="money"` and is converted, at
runtime, from `<input type="number">` to `<input type="text"
inputmode="decimal">` so it can display a comma/currency-formatted value
(`"$1,850,000"`) directly in the field itself — a plain number input can't
show that, since the browser strips anything that isn't a numeral from its
value. (An earlier version of this feature showed the formatted value in a
separate read-out below the field instead; that was changed because it put
the formatting somewhere other than where the person is actually typing.)
- `attachMoneyPreview(el)` does the type conversion once per element
  (`el.dataset.moneyBound`, so repeated calls — e.g. every `syncControls()`
  run, on reset/load/import — don't stack duplicate listeners) and installs
  an `input` listener that strips non-digits from the current value,
  reformats it with `Number(...).toLocaleString('en-US')` prefixed with
  `$`, and restores the caret to the same position *relative to the
  digits* (counts digits before the caret, reformats, then walks forward
  that many digits in the new string) so typing or inserting a character
  mid-value doesn't jump the cursor to the end. It always re-runs the
  reformat (not just the one-time binding) so a value written to the field
  by any other code path — `syncControls()`, the wizard proxy, the MCP
  tool — picks up the `$`-and-commas formatting too.
- `refreshMoneyPreviews(root)` just runs `attachMoneyPreview` over every
  `input.money` under `root` (defaults to the whole document).
- **Static sidebar/wizard fields**: bound once, document-wide, at the end of
  `syncControls()` — covers page load, Reset, Load scenario, and importing a
  scenario file, since all of those call `syncControls()`.
- **Dynamic per-row fields** (loans, spending-tier amounts, income-source
  amounts, one-time-income amounts): each of the four `render*Fields()`
  functions rebuilds its container's `innerHTML` from scratch on every call,
  so there's no stale-listener risk there — each one calls
  `refreshMoneyPreviews()` scoped to its own container at the end of the
  function, after the fresh `<input>` elements exist in the DOM.
- **Every parsing call site that reads a `.money` field's `.value` must
  strip non-digits first** (`e.target.value.replace(/[^0-9]/g, '')`) before
  `Number(...)`, since the field now holds `"$1,850,000"` rather than a bare
  number string. This applies to the generic `ids.forEach` listener, the
  shared loan-field handler, and the three per-row amount handlers
  (spending tiers, income sources, one-time income). Age/term/rate fields
  in those same rows are not money-classed and are untouched. The MCP tool
  (`update_fire_assumptions`) and the wizard proxy fields don't need this —
  the former sets `state[k] = v` directly rather than parsing DOM text, and
  the latter dispatches a real `input` event on the mirrored field, which
  runs through the same listener above.
- **A new dollar field must do two things**: add `class="money"` to its
  `<input type="number">` (it gets swapped to `type="text"` automatically),
  and strip non-digits at whatever call site reads its value. A field added
  without the `class` will stay a plain number input and won't format; a
  parsing site that forgets to strip non-digits will read `NaN` (via
  `Number("$1,850,000")`) and silently fall back to its `|| 0` default.
- CSS: `.field input[type=text]` gets the same right-aligned,
  tabular-numeral styling as `.field input[type=number]`, so a money field
  looks identical to a plain numeric one once converted.

## Sidebar group open/closed defaults

The `<details class="group">` open/closed default is a deliberate, ongoing
editorial call, not just whatever a group happened to ship with — see the
"Sidebar group order" note above for the basic→niche ordering these follow.
Currently open by default: Scenarios, Tax filing status (US) / Province of
residence (Canada), State income tax (US only), Timeline, Income, Household
spending, Assets, Housing, Retirement income & healthcare. Closed by
default: Retirement contributions, Pre-retirement healthcare, Market
assumptions, Other loans, Bridge/part-time income, Additional income,
Survivor planning, Withdrawal & tax strategy — these either have sensible
defaults that don't need immediate attention, or are opt-in features that
are off until enabled anyway. When adding a new group, or reconsidering an
existing one, ask whether a first-time person needs to look at it to get a
believable projection running (open) or can safely ignore it until they
want that specific feature (closed) — not whether it fits alphabetically or
chronologically into the file.

## Sidebar field search (`#fieldSearch`, `setupFieldSearch`)

A search box sits just below the panel title, above every `<details
class="group">`. It matches against each `.field`/`.range-field`'s
`<label>` text (case-insensitive substring, including whatever's inside a
nested `<small>` help blurb, since that's often where the more
jargon-specific term lives). A new field needs nothing extra to be
searchable as long as it sits inside a real `<label>` under a
`.field`/`.range-field` wrapper — the search has no field allow-list to
keep in sync.

- **Filters fields, not just groups.** Every matching field gets
  `.field-match` (the existing blue highlight); every *non*-matching one now
  also gets `.field-hidden` (`display:none`), so a search narrows the whole
  sidebar down to just the fields that matched rather than merely opening
  the groups that contain a match and leaving everything else inside them
  to scan past. With 100+ fields across ~18 groups, "a match exists
  somewhere in this group" wasn't narrow enough on its own.
- **A group's open state is derived fresh from its matches on every
  keystroke**, not accumulated across keystrokes: `panelDetails().forEach(d
  => d.open = d.querySelector('.field-match') !== null)` runs after
  classifying that keystroke's fields, for *every* `<details>` under
  `.panel` (top-level groups and the "Spending changes" sub-group nested
  inside Household spending — `querySelector` looks at all descendants
  regardless of depth, so an outer group opens correctly whenever its
  nested sub-group has a match, with no separate ancestor-walk needed). An
  earlier version only ever recorded/opened a group the first time a match
  appeared inside it, via an ever-growing `forcedOpen` map — so a group that
  matched an early, broad keystroke ("age") stayed open through later,
  narrower ones ("inflation") even once nothing inside it still matched,
  and groups only ever accumulated open across a revised search. Recomputing
  every group's state from scratch each keystroke means narrowing the query
  closes groups again immediately, not just once the box is fully cleared.
- **The original pre-search state is still snapshotted once**, the moment
  a search starts (`searchActive` flips false→true), into an `originalOpen`
  `Map` (`<details>` → its open state right then) — not per-match, so a
  group's snapshot reflects what it was doing *before the search touched
  anything*, not whatever state search itself last left it in. Clearing the
  query restores every snapshotted group to that state and removes
  `.field-match`/`.field-hidden` from every field, so the sidebar looks
  exactly as it did before the search began, whether or not the last
  keystroke had any matches.

## Default-value field marker (`markDefaultFields`, `.is-default`)

Every field in the `ids` array (see "Architecture, per planner file" above)
gets a small amber dot in front of its label, via `label::before`, whenever
`state[id] === defaults[id]` — i.e. it's still whatever the wizard/sidebar
booted with, not something the person actually entered. `markDefaultFields()`
runs at the top of `render()`, so it's always current without a dedicated
call site to remember. It intentionally only covers the `ids`-driven
plain number/range fields, not checkboxes/enums/radio-button-style choices
(`singlePerson`, `tenure`, `k401Type`, survivor/ACA/LTC toggles, etc.) or the
dynamic loan/spending-tier/income-source/one-time-income rows — those are
opt-in features already visually distinguished by their own enabled
checkbox, so a "still default" dot would be redundant there. This is a
narrower, *lasting* per-field version of the one-time `#firstRunBanner`
(which only flags the page as a whole, once, and disappears on the first
edit anywhere) — the two aren't related in code and don't need to stay in
sync with each other.

## Undo toast for Reset and Load scenario (`snapshotForUndo`, `#undoToast`)

Reset and "Load" (on a saved scenario) are the two actions that silently
discard whatever is currently in `state` with no way back other than
re-entering it by hand — as opposed to importing a scenario file, which
only pushes onto the saved-scenarios list (`scenarios.push(...)`) and never
touches live `state`, so it's already non-destructive and doesn't need
this. Both call `snapshotForUndo(label)` *before* they overwrite `state`:
it deep-clones `state` (`JSON.parse(JSON.stringify(state))`) along with
`mode`/`logScale` into a module-level `undoSnapshot`, then shows
`#undoToast` (fixed-position bottom-of-screen bar, `#undoToastText` +
an "Undo" button) with that label and starts a 10-second auto-dismiss
timer. Clicking the button restores `state`/`mode`/`logScale` from the
snapshot and re-runs the same `syncControls()` / `syncContributionControls()`
/ `setMode()` / `render()` / `saveInputs()` sequence the original action
used, then hides the toast. Reset still keeps its own `confirm()` dialog on
top of this — the toast is a second, lower-friction safety net, not a
replacement for the confirmation. A new destructive action that replaces
the whole `state` object should call `snapshotForUndo('<description>')`
right before doing so, following the same pattern.
- `.undo-toast[hidden]{display:none}` matters: without it, the `.undo-toast`
  class's own `display:flex` (same specificity as the `[hidden]` attribute
  selector, but from an author stylesheet rather than the UA one) wins and
  the toast never actually hides even after `hidden` is set — this was
  caught during testing and is easy to reintroduce if the CSS is
  restructured without care.

## Sidebar height (`.panel`'s max-height, `syncPanelMaxHeight`)

`.panel` (the sidebar) is `position:sticky` with a `max-height` so it
scrolls internally (`overflow-y:auto`) instead of growing past the
viewport. That `max-height` used to be a pure CSS `calc()` sized only
against the sticky `top` offset the panel settles into *once scrolled* —
`calc(100vh - var(--topbar-h) - 44px)`. That undersold how much space is
actually needed: `.panel`'s natural (pre-scroll) position in the page flow
sits further down than its eventual stuck position, because the topbar,
the `.top-disclaimer` banner above it, the Plan Status Bar, and the
first-run banner (when shown) all stack above `#workspace` first. Since
`max-height` was sized for the *smaller* stuck-offset case, the sidebar's
actual rendered box came out taller than the room available before any
scrolling — its bottom edge sat below the fold, so seeing it required
scrolling the whole page, not just the sidebar's own internal scroll (the
`overflow-y:auto` only helps once the box itself already fits on screen).

Fixed with `syncPanelMaxHeight()` (same measure-real-heights-into-a-CSS-var
pattern as `syncTopbarHeight()`/`syncPlanStatusOffsets()` above): it sums
the actual `offsetHeight` (+ `margin-bottom`) of `.top-disclaimer`,
`.topbar`, `#planStatusBar` (only if not `.hidden`), `#firstRunBanner`
(only if not `[hidden]`), plus `main`'s own top padding, and sets
`--panel-max-h` to `window.innerHeight` minus that sum minus a small
margin. `.panel{max-height:var(--panel-max-h, calc(...))}` keeps the old
formula as a fallback for the first paint frame before any JS has run.

This deliberately measures the *leading elements* rather than `.panel`
itself: `.panel.getBoundingClientRect().top` would report its already-
pinned sticky position once scroll has engaged sticky (a fixed, small
number), not its true natural one — using that would undersize the needed
margin and reintroduce the overflow the moment the page is scrolled back to
the top. Summing the fixed elements above it is scroll-position-independent
by construction.

Call sites: inside `renderPlanStatusBar()` (so every `render()` keeps it
current, same cadence as `syncPlanStatusOffsets()`), the `resize` listener,
`dismissFirstRunBanner()` (its own explicit call, since hiding the banner
frees up space immediately and this needs to reflect that without waiting
for the next unrelated `render()`), and once at boot. Skipped entirely
under the 820px mobile breakpoint, where `.panel{position:static;
max-height:none;overflow-y:visible}` already removes the constraint (the
whole page scrolls there anyway, by design, per the mobile-tabs section
above).

The same missing-`--plan-status-h` pattern as the item-2 scroll-margin fix
elsewhere in this file also applied to `.panel`'s own sticky `top`: it only
accounted for `--topbar-h`, so once actually stuck the panel could render a
few pixels *under* the Plan Status Bar rather than cleanly below it. Fixed
alongside this by adding `+ var(--plan-status-h,0px)` to both the `top` and
the CSS fallback `max-height` calc(), same as the `.metrics`/
`#sensitivityCard` fix.

## Autosave to localStorage (`storage`, `hasPersonalizedData`, `writeStorageNow`)

The app went from fully ephemeral (state lived only in page memory for that
session) to persisting `state`/`mode` to this browser's `localStorage`, so a
reload or a later visit comes back to real numbers instead of the generic
example data. This was a restoration, not new infrastructure: `storageKey`/
`legacyStorageKey` and the boot-time `saved?.state`/`saved?.mode` read
(inside the `try{}catch{}` right after `theme` is set up) already existed —
`storage` had been hardcoded to `null`, and `saveInputs()` was a stub that
only updated the `#saveStatus` label text ("Not saved — offline mode"),
which is why re-enabling this took far less surface area than it might
sound like.

- **`storage`** is feature-detected, not just `window.localStorage`
  directly: it probes with a real `setItem`/`removeItem` inside a
  `try{}catch{}`, because some private-browsing modes throw on actual use
  even when the `localStorage` property itself is present and doesn't
  throw just by being read. Every read call site already used `storage?.`
  optional-chaining (written years before `storage` was actually `null`,
  apparently in anticipation of this), so re-enabling it needed no changes
  to those call sites.
- **`writeStorageNow()`** does the actual `storage.setItem(storageKey,
  JSON.stringify({ state, mode }))`, wrapped in its own `try{}catch{}`
  (quota exceeded, storage revoked mid-session, etc.) and updates
  `#saveStatus` to reflect what actually happened ("Saved on this device" /
  "Not saved — storage unavailable" / "Not saved — storage full or
  unavailable") rather than assuming success. **`saveInputs()`** — called
  from nearly every state-mutating code path in the file, including on
  every keystroke via the `ids` input listener — only *debounces* into
  `writeStorageNow()` (250ms idle) rather than writing synchronously, so
  typing doesn't fire a `JSON.stringify` of the whole state object per
  keystroke. `writeStorageNow` is also registered directly on `pagehide`,
  unconditionally, so the very last edit before a tab close/reload is
  never lost to a pending debounce timer that never got to fire.
- **`hasPersonalizedData`** is the guard that keeps this from
  auto-persisting the untouched generic example data on someone's very
  first visit. Without it: `setMode(mode)` runs unconditionally at boot →
  calls `saveInputs()` → 250ms later `writeStorageNow()` writes whatever
  `state` currently is (defaults, on a first visit) → the *next* reload
  would then see `saved?.state` and treat the visitor as "returning" with
  "real" data, permanently hiding the first-run banner for someone who
  never actually entered anything. `hasPersonalizedData` starts equal to
  `hadSavedState` (true only if a *previous* visit already had real data)
  and flips to `true` inside `dismissFirstRunBanner()` — reusing the exact
  same three signals that already dismiss that banner (a real edit
  anywhere in `.panel`, opening the wizard, or importing a scenario file),
  since those are precisely the moments the data stops being "generic
  example" and starts being the person's own. `writeStorageNow()` bails
  immediately if `!hasPersonalizedData`, so nothing is ever written to
  storage before one of those three signals has fired at least once in
  that session (or a previous session already had — `hadSavedState`).
- **The first-run banner is skipped entirely for a returning visitor**:
  `if (hadSavedState) dismissFirstRunBanner();` runs once at boot, right
  before the boot-time `syncControls()`/`setMode(mode)` sequence — there's
  nothing "first-run" about someone whose real numbers just loaded back in.
  A first-time visitor still sees it exactly as before.
- **Theme is deliberately still not persisted** — it's a display
  preference, not a plan input, and always starting from the current OS/
  browser preference (rather than freezing whatever it was at last save)
  is the intended behavior, not a gap left over from the old no-storage
  design. Don't "fix" this by folding `theme` into the same storage write
  without checking this reasoning first.
- **What still isn't persisted, on purpose, for now**: the named
  `scenarios` list (in-memory snapshots — still export/import-only, as
  before) and `logScale`/`chartView`/`mcPathCount` (display/view state, not
  plan inputs — same reasoning as theme). These are reasonable future
  follow-ups but were out of scope for this pass.
- **Reset's confirmation text was updated** to match: it used to say
  "nothing is saved," which stopped being true. It now says Reset "clears
  what's saved in this browser" — accurate, since Reset's `state = {
  ...defaults, ... }` followed by `setMode('real')` (which calls
  `saveInputs()`) means Reset itself overwrites the stored plan with the
  defaults, functioning as the de facto "clear saved data" action; there's
  no separate control for wiping storage without also resetting the visible
  form, which is fine since they're the same action.

## Mobile swipe between Inputs/Dashboard tabs — removed

A `touchstart`/`touchend` swipe gesture on `#workspace` (swipe left →
Dashboard, right → Inputs, as an alternative to tapping `.mobile-tabs`) was
built and then **removed** after real-world use: it kept firing accidentally
while someone was trying to scroll a wide table horizontally (the projection
table, the decision-compare tables), which reads as the whole page randomly
jumping to a different tab mid-scroll. Tapping the `.mobile-tabs` buttons is
now the only way to switch tabs on mobile. If swipe-to-switch is ever
reconsidered, it would need to coexist with horizontal-scrolling tables
specifically — e.g. ignoring touches that start inside `.table-wrap` the same
way the old implementation already ignored touches starting on
`input[type="range"]` — not just the generic horizontal-vs-vertical
dominance check it had before.

## Accessibility pass

An `axe-core` sweep (light + dark, both files, wizard modal open and closed)
turned up a few real issues, now fixed — worth knowing about if new UI is
added:
- **`--hint` (`#748195` in light mode) failed WCAG AA contrast** against
  every light-mode background it's used on (callouts, table headers,
  unselected segmented-control buttons, `.range-note`/`.footer-note` text) —
  it's `#5c6779` now, which clears 4.5:1 against all of them. Any new light
  helper/caption text should use `var(--hint)` or `var(--muted)` rather than
  inventing another one-off gray, since both are now contrast-checked.
- **`.reset` is a dark-on-dark-topbar button style** (light text, dark
  transparent-to-dark-hover background) that only works because the topbar
  itself is always dark (`--topbar-fg`, fixed regardless of theme). It was
  being reused on `var(--card)` backgrounds elsewhere (the Scenarios panel's
  Save/Import/Export buttons, the per-scenario Load/Export/Delete row, the
  wizard modal's Back/Next/Done) where the background actually changes with
  theme, making the text nearly invisible in light mode. Those now use a new
  `.btn-card` class (`var(--surface)`/`var(--ink2)`/`var(--surface-border)` —
  theme-aware) instead. Rule of thumb: `.reset` belongs only on the topbar;
  anything on `var(--card)` or `var(--surface)` should use `.btn-card`.
- **Two inline `color:#526174` labels** (the log-scale checkbox label, the
  Monte-Carlo "Paths:" label) were hardcoded for light mode and became
  low-contrast in dark mode against the dark card background. Changed to
  `color:var(--muted)`, which is contrast-checked in both themes. Any new
  inline `style="color:..."` should use a CSS variable rather than a literal
  hex, for the same reason.
- **`.table-wrap` (the scrollable wrapper around wide result tables) had no
  keyboard access** to its own scroll (WCAG 2.1.1) — a mouse/touch user
  could scroll it, a keyboard-only user couldn't. Fixed with a
  `makeTableWrapsFocusable()` call (adds `tabindex="0"`, `role="region"`,
  and an `aria-label` built from the table's first header cell) run once at
  load and again via a `MutationObserver` on `document.body`, so tables
  built later by a render function (scenario comparison, projection table,
  sensitivity, Roth optimizer) are covered without having to instrument
  each render function individually.
- All existing buttons, checkboxes, and charts already carried visible text
  labels or explicit `aria-label`s — there were no icon-only controls
  missing an accessible name at the time of this pass.

## Testing checklist for any change

1. `npm test` (golden math tests — must stay exact-to-the-cent).
2. Syntax-check both `.html` files (see snippet above).
3. Run the specific `test_*.js` file(s) relevant to what changed, plus a
   broad sweep of the rest if the change touches `simulate()`/
   `simulateHistorical()`, `syncControls()`/`syncContributionControls()`,
   or anything in the shared per-year loop (a change there can have
   non-obvious knock-on effects on unrelated features).
4. Mobile-width check for any new sidebar field or result card (390×844
   viewport, assert no horizontal overflow):
   ```js
   document.documentElement.scrollWidth > document.documentElement.clientWidth
   ```
5. If the feature has a UI toggle, verify with Playwright that toggling it
   actually changes `window.fireProjection` / the relevant DOM output —
   don't just check that the checkbox's own `.checked` state is correct;
   confirm the state change actually propagates through to a visible
   result. This is the single most common way a wiring bug slips through in
   this codebase (see the `syncControls()` vs. `syncContributionControls()`
   trap above).
6. If the feature touches anything `position:sticky` (a new sticky bar, a
   z-index/top-offset change), verify it with an actual scroll gesture —
   `page.mouse.wheel(x, y)` or an equivalent — and check
   `getBoundingClientRect()` afterward, not `window.scrollTo()` followed by
   an overflow check. `scrollWidth > clientWidth` only catches horizontal
   overflow; it says nothing about whether sticky positioning is actually
   engaging, which is exactly how the `overflow-x:hidden` sticky-breaking
   bug (see "Plan status bar" above) went unnoticed through every earlier
   mobile-width check this session.

## Commit conventions

- Regular commits, no special attribution needed for local/manual edits.
- When Claude Code makes the commit, it appends its own attribution
  trailer automatically per the harness's standing instructions — don't
  hand-author that trailer yourself in a prompt or template.
- One feature (or tightly related group of changes) per commit; commit
  messages should explain *why*, not just restate the diff.
- **Docs are updated in the same batch of work as the code change, not as
  a separate later pass.** If a change is user-facing, update `README.md`'s
  feature list before/alongside committing (see git history for the
  pattern — e.g. the commit that documented the survivor-planning and
  cash-flow-Sankey features). If a change is architectural — a new shared
  helper, a new US/Canada divergence, a new gotcha worth knowing about —
  update this file (`CLAUDE.md`) the same way. The repo may exist as
  multiple independent local clones with no shared remote between them
  (e.g. a disposable cloud-agent working copy alongside the person's own
  machine), so the two docs, kept current in the repo itself, are what let
  a session with no memory of prior conversations — or a differently-synced
  copy of the repo — pick up accurately from the repo contents alone.
