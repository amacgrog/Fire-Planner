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

### Dropdown navigator (`#fieldSearchResults`, `jumpToSearchField`)

On top of the filter above, the search box now also renders a dropdown of
up to 8 matching fields — a settings-navigator layer, not a replacement for
the filter (the filter stays exactly as-is; this is purely additive).

- Each result shows the field's own label text (via `mainLabelText()`,
  which reads only a `<label>`'s direct text nodes — skipping the nested
  `<small>` blurb, checkbox, and estimate badge that the *matching* logic
  still searches against) plus a group breadcrumb (`groupBreadcrumb()`,
  the **outermost** `details.group` ancestor — a field inside the nested
  "Spending changes" sub-group shows "Household spending", not the
  sub-group's own plain-text summary).
- Clicking a result (or arrowing to it with ArrowUp/ArrowDown and hitting
  Enter) calls `jumpToSearchField(fieldEl)`: opens every ancestor group
  (not just the nearest, in case of nesting), then reuses the exact
  landing-spot/flash-highlight idiom `jumpToEstimateField()` already
  established for the guided estimated-fields review (land the field ~30%
  down the viewport rather than dead-center, `.flash-highlight` for 2.6s,
  focus the real input/select). `selectResult()` also clears the search box
  and calls `endSearch()` **before** opening the target's ancestor groups —
  both happen synchronously in the same tick, so the "restore groups to
  their pre-search state" step never fights with "open the groups the
  clicked field actually needs."
- **Closing the dropdown without racing a result click**: a `focusout` on
  the input checks `resultsEl.contains(e.relatedTarget)` before hiding it —
  a mousedown on a `<button>` result moves focus to that button *before*
  its own `click` fires, so `relatedTarget` is the button itself, and the
  dropdown is correctly left alone until the click has run. Clicking
  anywhere else closes the dropdown but leaves the filter/highlight state
  untouched, same as any ordinary search-suggestions popover.
- `.field-search-results[hidden]{display:none!important}` — added
  defensively up front, following this file's own established pattern (see
  the `.undo-toast[hidden]`/`#wizardStep2[hidden]`/
  `#projectionSubToggle[hidden]` entries elsewhere in this file): the
  dropdown has no other author `display` rule that would conflict with
  `[hidden]`'s UA default today, but every other element in this codebase
  that's grown a conflicting rule *after* first shipping without one has
  been from exactly this trap, so the guard costs nothing to add now.
- Ported identically to both planners — the field-search markup/CSS/JS was
  already byte-identical between `Planner_US.html`/`Planner_Canada.html`
  before this change.

### Round 2: over-broad matching, mobile dropdown covering the form, and losing the filter on select

Real-world feedback, verbatim: "the search returns too many results (i think
it also searches the small text descriptors) for example, income returns
~20 results... the original functionality of removing items from the form
that didn't fit the search was great, however it only does that currently
when actively typing in the search box. in mobile, the search as navigator
dropdown covers most of the screen and you can't see the form as it is
simplifying it. when you click the search button, it takes you to the
first available option, but removes the search term and all of the
original form items come back, negating the usefulness of the search bar."
Four distinct problems, all in the same feature, fixed together:

1. **Matching searched the field's full `label.textContent`**, which
   includes the nested `<small>` help blurb (and the "Estimated ✓" badge)
   — deliberately broad at the time, on the theory that jargon often lives
   in the blurb, but in practice this made a common word absurdly
   over-broad: "income" matched ~20 fields because most field *descriptions*
   mention income somewhere, not because ~20 fields are actually about
   income. Fixed by matching against `mainLabelText(label)` (the label's
   own direct text nodes — already existed, previously used only for the
   dropdown's display text) everywhere, so what's searched is exactly what
   a person sees as the field's name. Confirmed with Playwright: "income"
   now matches 17 fields in the US file, all of them genuinely income
   fields (`Partner A/B income`, `bridge income`, `Income source 1-3`,
   `One-time income 1-3`, etc.) — none of the previous false-positive noise
   from an unrelated field's blurb happening to mention the word.
2. **The dropdown navigator (`#fieldSearchResults`) is now desktop-only**
   (`isMobileSearch()`, checking the same `(max-width:820px)` breakpoint
   used throughout this file). On a phone it used to render as a box up to
   `50vh` tall directly over the very fields it had just filtered down to —
   with the on-screen keyboard open, that's most of the visible viewport,
   hiding the simplified list a person could otherwise just scroll straight
   through. The field-hiding filter (`.field-match`/`.field-hidden`) is
   untouched and still runs identically on mobile — it's the part that was
   "great" per the feedback and never needed a dropdown to be useful on a
   small screen; narrowing 100+ fields down to a handful is enough on its
   own to scan directly. `runSearch()` (the old anonymous `input` listener,
   now a named function so it can be called from a second place — see
   point 4) skips building/showing `resultsEl` whenever `isMobileSearch()`
   is true, same as it already did for zero matches.
3. **`selectResult()` used to clear the search box and call `endSearch()`**
   — un-hiding every filtered-out field and restoring every group's
   pre-search open state — *before* jumping to the picked field. That threw
   away the narrowed view the person had just used to find that field,
   which is exactly the "negating the usefulness of the search bar"
   complaint. It now only closes the dropdown (`hideResults()`); the
   filter, the search term, and the match count are left exactly as they
   were. This was the "only removes items while actively typing" complaint
   too, from the other direction — the filter was never being removed
   *while* typing, it was being removed the moment you *stopped* (by acting
   on a result), which reads the same way from the outside: the simplified
   view doesn't survive the interaction it exists to support.
4. **A new complication from fix 3**: since the search term and filter now
   persist after picking a result, refocusing the search box afterward (to
   look at another match) showed a *stale, empty* dropdown rather than
   nothing happening — the dropdown only ever gets (re)built inside the
   `input` event's handler, and no `input` event fires from just clicking
   back into a box whose value hasn't changed. Fixed by extracting that
   handler into a named `runSearch()` function and adding a `focus`
   listener that calls it whenever the box regains focus with a non-empty
   query on desktop (`isMobileSearch()` guards this the same as the main
   path) — so tabbing away and back re-populates the same dropdown instead
   of requiring the query to be retyped.
- **Verified** with Playwright, both files: "income" now returns a materially
  smaller, entirely on-topic match set; the dropdown never renders at
  390×844 regardless of match count, while `.field-match`/`.field-hidden`
  still apply identically to the desktop behavior; clicking a dropdown
  result on desktop leaves the search box's value, the match count, and
  every other field's hidden/shown state completely unchanged, only closing
  the dropdown itself; refocusing the search box afterward reopens the
  dropdown with the same results, with no retyping needed; Escape still
  fully clears the query and restores every field/group to its pre-search
  state, exactly as before. `npm test` and a syntax check of both files
  also pass.

### Round 3: matching label-only text swapped one asymmetry for another — section-name fallback + drop the "keep typing" prompt

Real-world feedback right after round 2 shipped: "income" now behaves, but
"assets" — a whole sidebar section — returns **zero** matches, because none
of the individual fields inside "Assets" (`Stocks %`, `Cash reserve`, etc.)
literally contain the word "asset" in their own label; the section name is
only spelled out in the group's `<summary>`, not in any field name. And for
a query like "income" that still returns a double-digit match count (17-18,
all genuinely on-topic per round 2), the dropdown's old cap-and-hint
behavior — "+9 more — keep typing to narrow it down" — no longer made
sense: the person is already looking at exactly what they searched for,
and there's no more-specific word to type that would narrow it further.
Two fixes, in `runSearch()`:

1. **Section-name fallback, tried only when the direct pass finds
   nothing.** Matching still runs against each field's own `mainLabelText()`
   first, exactly as round 2 left it — this is what keeps "income" from
   reinflating back to ~20 fields. Only when that pass returns zero matches
   does a second pass check the field's own top-level group title
   (`groupBreadcrumb()`, already used for the dropdown's group-breadcrumb
   display) instead, surfacing every field in that section. "assets" now
   returns the 7 fields under "Assets" (`Taxable brokerage`, `Traditional
   retirement`, `Cash / HYSA`, `Bond pool size`, etc.) — none of which say
   "asset," but all of which live in the section named for it. This
   fallback is deliberately gated on *zero* direct matches, not blended
   into one combined pass: a query that already matches real field names
   (like "income") never reaches it, even though a compound group title
   like "Retirement income & healthcare" also contains "income" and would,
   if checked unconditionally, pull in every Social-Security/pension/ACA/
   LTC field in that unrelated section and reopen the exact over-matching
   round 2 just fixed.
2. **Dropped the `MAX_RESULTS` cap and its "+N more — keep typing to
   narrow it down" hint entirely.** The dropdown already scrolls (its own
   `max-height:320px;overflow-y:auto`), so capping the *rendered* list to 8
   and only reporting the rest as a count was never necessary for
   usability — it just added a prompt that made no sense once a query was
   already a precise, deliberately broad ask ("show me the income
   fields"/"show me the Assets section"). All matches are rendered now
   (`renderedMatches` holds every one), and the person scrolls if there
   are more than fit on screen.
- **Verified** with Playwright, both files: "assets" returns 7 on-topic
  matches (0 under the old label-only-only matching); "income" still
  returns its focused 17/18-field list with every one rendered as a
  dropdown button and no "+more" element present; no overflow at 390×844
  mobile width in either theme, where the same fallback logic applies to
  the field-hiding filter (no dropdown there either way, per round 2).
  `npm test` and a syntax check of both files also pass.

### Round 4: the zero-match gate on its own missed a real case — a few direct matches can still hide a whole section

Follow-up question, before this had come up as a live bug: is "the
section-title fallback only fires on literally zero direct matches" enough,
or can a query return a *small* number of direct matches while the section
it's really asking about has more? Yes — found a concrete instance while
checking: **"other loans"** matched exactly one field directly (the
`otherLoansEnabled` checkbox, labeled "Model other loans"), because none of
the actual per-loan fields say "other loans" in their own label — they're
just "Original principal," "Remaining balance," "Interest rate," "Loan term
(years)," "Extra monthly principal," repeated per loan slot. Round 3's
zero-match gate never triggered for this query (1 ≠ 0), so searching "other
loans" returned only the enable checkbox and hid all 25 of the fields it
actually turns on.

- **Fix**: added a second, *unconditional* matching pass (labeled "pass
  1.5" in the code, between the existing direct-label pass and the
  zero-match substring fallback) that unions in every field whose top-level
  group/section title **exactly** equals the query (case-insensitive,
  trimmed) — not merely *contains* it, and not gated on the direct pass
  coming back empty. "other loans" now returns all 26 fields (the
  checkbox plus every per-loan field across all 5 slots).
- **Why exact-title, not substring, and why still unconditional**: an
  *unconditional substring* check (matching, say, "Retirement income &
  healthcare" against the query "income") is exactly what round 2 fixed —
  it would pull in every Social Security/pension/ACA/LTC field just
  because the word "income" happens to sit inside a compound section name
  that's mostly about something else. Requiring the section title to
  **exactly** equal the query rules that out: "income" doesn't exactly
  equal "Retirement income & healthcare," so that section is left alone,
  while a query that *is* a section's whole name — "other loans," "assets,"
  the "Income" group itself — still gets the full section regardless of
  how many (if any) of its fields also happen to match directly. This is
  strictly narrower than round 3's substring fallback, which is why it's
  safe to run unconditionally rather than only on a literal zero — the two
  rules serve different roles: this one (exact title) catches "the query
  *is* a section name" whether or not a coincidental direct hit already
  happened; the older substring fallback (still zero-match-gated) catches
  a looser section-name-ish query only once nothing else matched at all.
- **A tried-and-discarded example while writing this**: the code comment
  originally illustrated the problem with "mortgage" (as in "Mortgage
  interest rate," inside the "Housing" section) — but that turned out to
  be wrong on inspection: "mortgage" isn't the *Housing* section's name,
  so the exact-title rule correctly does nothing for it, and "mortgage"
  still returns just the 1 literal field, same as before this round. That
  is expected, not a gap this round claims to close — solving "a query
  names a sub-topic within a larger, differently-named section" would
  need either a manually curated per-group keyword/alias list or a looser
  always-on substring match (which reopens round 2's problem), and neither
  was attempted here. "Other loans" is the one that's actually fixed,
  because the query and the section's own name are the same thing.
- **Verified**: `npm test`; a syntax check of both files; Playwright, both
  files — "other loans" now returns 26 matches (was 1); "assets" and
  "income" are unaffected (7 and 17/18 respectively, same as round 3);
  the round 2/3 behaviors (filter and query persisting after selecting a
  dropdown result, no dropdown on mobile, Escape fully clearing) all
  re-verified working.

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

## Sidebar group state summaries (`renderGroupSummaries()`, `.group-state`)

Every sidebar `<details class="group">`'s `<summary>` now shows a one-line
state summary underneath its title, so the sidebar reads as "what's already
configured" instead of a blank form even when every group is collapsed.
Full design rationale lives in the claude.ai Project doc
`claude/sidebar-state-summaries-spec.md`; the essentials:

- **Two treatments, never a third.** 9 "always-on" groups (Timeline,
  Income, Retirement contributions, Pre-retirement healthcare, Household
  spending, Assets, Market assumptions, Housing, Retirement income &
  healthcare) always have a live, meaningful value — even at defaults — so
  they always show plain value text, no icon, e.g. `Retire 55 · plan to
  100`. 5 "hide-when-off" groups (Other loans, Bridge/part-time income,
  Additional income, Survivor planning, Withdrawal & tax strategy) are
  entirely optional features, so they show a `✓ <text>` in `--green` when
  on and a **completely empty string** — not the word "Off" — when off.
  Withdrawal & tax strategy has no single master flag (`guardrailsEnabled`
  OR `rothConvEnabled`/`meltdownEnabled` OR, Canada only,
  `pensionSplitEnabled` — off means all three are false), unlike the other
  four groups' one-checkbox gate.
- **Never render "Off."** This was a deliberate late change from the
  initial design (which had opt-in groups show a muted "Off" label): a
  first-time visitor who hasn't touched any advanced feature should see a
  sidebar that looks exactly as clean as it did before this feature
  existed, not five "Off" badges. A blank `.group-state` collapses to zero
  height, so a hide-when-off group's `<summary>` looks identical to a
  plain single-line title until something is actually turned on.
- **Markup**: `<summary>` went from a bare text node to
  `<summary><span class="group-summary-text"><span
  class="group-title">Timeline</span><span class="group-state"
  id="timelineGroupState"></span></span></summary>`. `.group summary` was
  already `display:flex;justify-content:space-between` to pin the `::after`
  chevron (`content:'▾'`, a pseudo-element, not a real DOM node) to the far
  right — wrapping title+state in one `.group-summary-text{display:flex;
  flex-direction:column}` flex child keeps that chevron positioning intact
  with no changes to the chevron CSS itself.
- **`renderGroupSummaries()`** is called from the top of `render()`, right
  next to `markDefaultFields()` — same cadence, same reasoning (always
  current, no dedicated call site to remember). It only does string
  formatting off already-live `state` (reusing `compact()` for money), no
  `simulate()` calls, so it needed no debouncing.
- **Field mapping deviations worth knowing**: Canada's "Retirement
  contributions" group has no account-type toggle or mega-backdoor
  equivalent (see "US vs. Canada" below), so its summary shows `X% RRSP ·
  Y% TFSA` instead of the US's `X% 401(k) · Traditional/Roth[, mega
  backdoor on]`. "Other loans" counts loans with a nonzero balance/
  principal and estimates the combined annual payment via the existing
  `mortgagePayment()` helper (× 12) rather than the more expensive
  `loanSchedules()`, since this is a display estimate, not a modeled cash
  flow. Pre-retirement healthcare premiums are stored per-paycheck but
  always converted to a `/mo` figure for display consistency, using
  `payFrequency`'s periods/year.
- **This is purely a display feature** — no changes to `ids`,
  `normalizeState()`, or scenario export shape. It's a `defaults` change
  (below) that's the actual behavior change; the summaries are read-only
  reflections of state that already existed.

## First-time defaults: five opt-in features flipped from on to off

Alongside the group summaries above, five feature-enable flags that
defaulted to `true` (with generic example data already populated) were
changed to `false`, because they were the real reason the sidebar looked
like a lot was already configured on a first visit — not just a display
problem the summaries alone could fix:

- US: `acaEnabled`, `ltcEnabled`, `bridgeEnabled`, `otherIncomeEnabled`,
  `otherLoansEnabled`.
- Canada: `ltcEnabled`, `pensionSplitEnabled`, `bridgeEnabled`,
  `otherIncomeEnabled`, `otherLoansEnabled`.

`survivorEnabled`, `guardrailsEnabled`, `rothConvEnabled`/
`meltdownEnabled`, and `megaBackdoor` were already `false` by default in
both files and were left untouched. Only the enable flags changed — the
dollar amounts/ages those features would use once re-enabled are still
present in `defaults`, so turning one back on (wizard Step 2 or the
sidebar) still shows sensible pre-filled numbers rather than zeros.
Verified before making this change that no test depends on the old
defaults: `tests/golden.js` sets `ltcEnabled` explicitly in the two
scenarios that use it (doesn't rely on the default), and no `test_*.js`
file references any of these ten flags.

This does change what the generic first-load example projection looks
like (no ACA subsidy, no bridge income, etc.) — intended, not a
regression: a simpler, core-only first impression was the explicit goal.

## Wizard close button (`#wizardXBtn`)

The wizard modal already closed on Escape and on a click outside the
modal (`wizardOverlay.addEventListener('click', ...)` checking
`e.target === wizardOverlay`), but Step 1 showed only a "Next" button —
`wizardBackBtn`/`wizardCloseBtn` are both `hidden` on step 1, so there was
no *visible* way to leave. Real-world consequence: someone who didn't want
to continue reached for the phone/browser back button, which — no history
entry was pushed for opening the modal — navigated away from the app
entirely to `index.html`, losing the whole planner rather than closing a
dialog. Fixed with a `✕` icon button (`#wizardXBtn`, `aria-label="Close"`),
absolutely positioned in the modal's top-right corner, visible on both
steps (not wired into the `wizardStep`-based show/hide logic that governs
Back/Next/Done), calling the exact same `wizardOverlay.classList.remove
('open')` the Escape/outside-click handlers already use. A third way out,
independent of the two-step Back/Next/Done flow.

## Mobile "Your assumptions" header overlapping the sidebar (another `overflow-x` sticky trap)

Real-world bug report: on mobile, the sticky "Your assumptions" panel-title
(and, underneath it, the search box) would render visually overlapping the
top of the first sidebar group (Scenarios), covering its text, both at the
top of the page (no scroll at all) and while scrolled. This is **the exact
same bug class already documented above** under "Plan status bar" →
"Sticky-stacking gotcha" (the `html,body{overflow-x:hidden}` fix), just
reproduced one level deeper, on `.panel` itself:

- `.panel`'s base rule sets `overflow-x:hidden` (for desktop, where it's a
  fixed-width sidebar column). The mobile media query overrides `position`,
  `max-height`, and `overflow-y` (to `static`/`none`/`visible`) but **left
  `overflow-x:hidden` untouched** — so on mobile, `.panel` had one axis
  explicitly `hidden` and the other explicitly `visible`. Per the same CSS
  quirk noted earlier (an element can't have one axis "not visible" and the
  other "visible" — the visible one gets silently promoted to `auto`),
  `.panel` became an unbounded-but-technically-scrolling container, which
  changes what "nearest scrolling ancestor" its sticky children
  (`.panel-title`, `.field-search-wrap`) resolve to for their `position:
  sticky` calculations. The visible symptom: both elements rendered
  offset **downward by their own sticky `top` value even with zero scroll
  and while not actually "stuck"** (confirmed with Playwright: forcing
  `.panel-title`/`.field-search-wrap` to `position:static`, or forcing
  `--mobile-sticky-h`/`--panel-title-h` to `0px`, or just setting `.panel`'s
  `overflow-x` to `clip` at runtime, all independently produced the
  correct, non-overlapping stack — isolating `overflow-x` as the actual
  cause, not the offset values or the elements' own CSS). Fixed by adding
  `overflow-x:clip` to `.panel`'s mobile override (`clip`, like the
  `html,body` fix, suppresses horizontal overflow without ever establishing
  a scroll container, unlike `hidden`/`scroll`/`auto`).
- **Separately**, `.field-search-wrap`'s sticky `top` was still a hardcoded
  desktop-only `53px` (correct there, where it just needs to clear
  `.panel-title`'s fixed `top:0` desktop position) with no mobile override
  at all — so once genuinely scrolled and stuck on mobile, it would stick
  53px from the viewport top regardless of how tall the Plan Status Bar +
  mobile tabs + panel-title stack actually was, overlapping them. Fixed by
  measuring `.panel-title`'s real height into a new `--panel-title-h` CSS
  var (in `syncPlanStatusOffsets()`, same measure-real-heights pattern as
  `--plan-status-h`/`--mobile-sticky-h`) and giving `.field-search-wrap` a
  mobile-only `top:calc(var(--mobile-sticky-h,0px) + var(--panel-title-h,0px))`
  rule, so it sticks directly below panel-title's actual rendered height
  instead of a stale hardcoded number.
- **Lesson for future sticky work in this file**: any element that is
  `position:sticky` needs its *entire* ancestor chain checked for a mixed
  `overflow-x:hidden`/`overflow-y:visible` (or vice versa) pairing, not
  just `html,body` — the same quirk can reproduce one level down on any
  container between the sticky element and the viewport. When adding a new
  sticky element or a new scrollable/clipped container, verify with a real
  scroll gesture and a zero-scroll screenshot both (this bug was visible
  even before any scrolling happened, which the existing sticky testing
  guidance below didn't explicitly call out).

## Scroll position lost when toggling a field-visibility checkbox

Real-world bug report: checking/unchecking a sidebar checkbox that shows or
hides other fields — `singlePerson` was the reported case, which hides
every `data-partner-b` field across several groups at once, but the same
applies to any opt-in checkbox (ACA, LTC, bridge, other income, other
loans, survivor, guardrails, Roth conversion/RRSP meltdown, mega backdoor)
— would immediately reflow the sidebar's height, jumping whatever the
person was looking at out from under them with no way to find their place
again.

Fixed generically, once, rather than per-checkbox: a single `change`
listener on `document`, registered with `capture:true` so it fires before
the specific checkbox's own `change` listener runs the actual show/hide,
records `event.target.getBoundingClientRect().top` for any checkbox/radio/
`<select>` inside `.panel` right before the mutation happens. Two
`requestAnimationFrame` callbacks later (letting the layout settle), it
re-measures the same element and scrolls whichever container actually
scrolls — `window` on mobile (`.panel` is `position:static` there) or
`.panel`'s own internal scroll on desktop — by the resulting delta. This
keeps the toggled control itself pinned at the same viewport position
across the reflow, which by construction also keeps everything below it
(wherever the person's eyes actually were) visually stable, without
needing to special-case `singlePerson` or any other individual field. New
checkboxes/selects that show/hide fields need no additional wiring — this
listener is delegated and field-agnostic.

## "Estimated" field badges + dashboard rollup + guided review (`.estimate-badge`, `state.dismissedEstimates`)

Full design spec lives in the claude.ai Project doc
`claude/estimated-fields-rollup-spec.md`. This sits on top of the existing
`markDefaultFields()`/`.is-default` dot (see "Default-value field marker"
above) rather than replacing it — the dot still covers every `ids` field
still at default, including generic modeling assumptions (return rate,
inflation, life expectancy) that are fine left alone for most people. This
feature adds a second, narrower layer only for fields that are personal
facts only the user can supply.

- **`ESTIMATE_ALWAYS_IDS`** — the `ids`-array fields that are always
  counted once still at default (ages, income, balances, mortgage terms,
  Social Security/CPP+OAS, etc.). **`ESTIMATE_GATED_GROUPS`** — fields that
  only count while their opt-in feature is currently on (mega backdoor,
  bridge income, survivor planning, Roth conversion ladder/RRSP meltdown,
  LTC, rent-then-buy, the US `marryLater` transition), same reasoning as
  the sidebar's hide-when-off group summaries. `isEstimateCountable(id)` /
  `computeCountedEstimateIds()` are the single source of truth for both the
  badges and the rollup count — never duplicate this classification logic
  at a second call site.
- **`state.dismissedEstimates`** — an array of field ids the person has
  explicitly said "this looks right, leave it," added to `defaults` as
  `[]` and guarded in `normalizeState()` exactly like `loans`/other array
  fields. It's real `state`, so it persists through the existing
  autosave/scenario export/import machinery automatically — no special
  plumbing needed there. The generic `ids.forEach(...)` input listener
  splices a field's id back out of `dismissedEstimates` on any real edit
  (regardless of the new value), so a dismissal only covers the specific
  value the person looked at, not the field forever.
- **`renderEstimateBadges()`** extends the `markDefaultFields()` idiom:
  for each counted field it ensures a `.estimate-badge` (amber pill, with
  a nested `.estimate-dismiss ✓` button) exists right after the field's
  `<label>` text; otherwise it removes one if present. `#estimatedRollupBanner`
  (styled like `.plan-headline`/`.shortfall-banner`) shows the live count
  and hides entirely at zero — computed in the same `render()` pass, right
  after `markDefaultFields()`/`renderGroupSummaries()`, from the same
  `computeCountedEstimateIds()` call that feeds the badges.
- **Contrast**: `--amber` (`#d97706` light / `#f0a949` dark) reads fine as
  a solid dot, but the badge's *text*, sitting on `rgba(217,119,6,.12)`
  amber-tinted background, only cleared ~2.7:1 in light mode against that
  blended background — well under WCAG AA. Added `--amber-text` (`#9a5209`
  light, ≈5.2:1; reuses the existing `--amber` in dark mode, already
  ≈7:1+) for the badge text and the "Review →" button specifically. Any
  future badge/pill using a tinted `--amber` background should use
  `--amber-text` for its foreground, not `--amber` directly — the dot's
  own contrast math (a solid small glyph, not text-on-tint) doesn't carry
  over to a text label on a tinted fill.
- **Guided "Review →" navigation** (`jumpToEstimateField()`,
  `reviewingFieldId`): clicking `#reviewEstimatesBtn` finds the first
  counted field in `ids` order, switches to the mobile Inputs tab if
  needed, opens its `<details class="group">` if closed, scrolls to it,
  applies the existing `.flash-highlight` treatment, and focuses it.
  `reviewingFieldId` tracks which field is being reviewed; every
  `renderEstimatedRollup()` call (i.e. every `render()`) checks whether
  that field dropped out of the counted set (edited away from default, or
  dismissed) and, if so, immediately jumps to whatever's now first — so
  reviewing reads as one continuous flow, not a click-per-field chore.
  Clicking "Review →" again later always resumes at whatever's currently
  first, since it never tries to remember where a previous review left
  off.
- **Gotcha: a button nested inside a `<label for="...">` steals focus
  back via the browser's native label-activation behavior.** The
  `.estimate-dismiss` button lives inside the field's own `<label>` (so it
  visually sits right next to the field name). Clicking it fires our own
  JS (which may synchronously move focus to a *different* field, e.g.
  during Review-mode auto-advance) — but afterward, the browser still runs
  its own default action for a click landing inside a `<label>`: activate/
  focus the label's associated control. That default action fires *after*
  all click listeners finish, so it silently overwrites whatever focus our
  own code just set, snapping focus back to the very field being
  dismissed. Symptom looked exactly like "auto-advance isn't working" —
  `jumpToEstimateField()` was demonstrably being called with the right
  next id (confirmed by instrumenting `HTMLElement.prototype.focus` in a
  Playwright script), yet `document.activeElement` a moment later was back
  on the original field regardless. Fixed with `e.preventDefault()` at the
  top of the `.estimate-dismiss` click handler, which suppresses the
  label's default action without needing to stop propagation or restructure
  the markup. Any future interactive control nested inside a field's
  `<label>` (rather than as a sibling) needs the same guard if it does
  anything with focus itself.

### Round 2: guided-review scroll position, mobile sticky footprint, condensed spending descriptor

Real-world feedback after using the feature on a phone, all fixed together:

- **`block:'center'` pushed a field's own `<small>` descriptor off the
  bottom of the screen.** Centering the *input* vertically means anything
  below it — including a multi-line descriptor, which is exactly the part
  someone reviewing an unfamiliar field most needs to read — gets pushed
  toward (or past) the bottom edge. `jumpToEstimateField()` no longer uses
  `scrollIntoView`'s `block` option at all; it computes the scroll delta
  itself (`rect.top - viewportHeight * 0.3`) so the field lands about 30%
  down the visible viewport instead of dead-center, leaving most of the
  screen free below it. Done via `window.scrollBy`/`.panel.scrollBy`
  (mobile scrolls `window`, desktop scrolls `.panel`'s own internal
  scroll — same split `syncPanelMaxHeight()` already uses), inside a
  `requestAnimationFrame` so the preceding `group.open = true` and
  `setMobileView('inputs')` calls' layout changes have settled before the
  target rect is measured. `el.focus({ preventScroll: true })` avoids the
  browser's own auto-scroll-into-view fighting with this.
- **"Review only ever visits number-box fields, not sliders" turned out to
  be a false read of a real symptom**: range fields *were* being visited
  (confirmed by instrumenting the click sequence directly) — a slider's
  native focus ring is just far less noticeable than a text input's, so
  landing on one read as "did nothing." No code change needed for
  targeting; the repositioning fix above (steadier landing spot, less
  scroll motion to parse) plus the existing `.flash-highlight` box-shadow
  makes it much more obvious when the target is a `.range-field`.
- **"Your assumptions" panel title no longer sticks on mobile.** It used
  to pin itself (via `position:sticky`) right below the Plan Status Bar +
  mobile-tabs stack, permanently eating vertical space for the rest of the
  Inputs scroll. The mobile override now sets `.panel-title{position:
  static}` — it scrolls away normally like any other content — while
  `.field-search-wrap` (previously stuck just *below* the title) takes over
  the sticky slot directly beneath the tabs (`top:var(--mobile-sticky-h,
  0px)`, no longer adding `--panel-title-h` on top of it), so the search
  box is still always reachable without the title's dead space. The
  `--panel-title-h` CSS var that measured the title's height is now
  unused (harmless — `syncPlanStatusOffsets()` still sets it) but nothing
  reads it anymore; a future cleanup could drop that measurement, but it
  wasn't worth the risk of touching working sticky-offset code for this
  pass.
- **Plan Status Bar shrunk on mobile**: `padding:12px 16px` → `9px 14px`,
  bottom `margin:16px` → `10px`, and `.plan-status-text`'s mobile font-size
  dropped to `.82rem` (from the shared `.92rem`) with `line-height:1.35` —
  the summary line still wraps onto 2 lines on a narrow phone (per the
  "Plan status bar" section above) but takes noticeably less vertical
  space doing it. Desktop's single-line ellipsis sizing is untouched.
- **Annual household spending's `<small>` descriptor condensed**, in both
  files: it used to spell out a long parenthetical list of included items
  (a full paragraph) before finally getting to what it excludes. Rewritten
  to lead with a short "everyday costs" summary and a **bolded "Excludes:"**
  clause naming the big-ticket things tracked elsewhere (housing, health/
  LTC premiums, retirement saving) — the part someone skimming actually
  needs, since the included-items list is mostly self-evident ("groceries,
  dining, utilities...") while what's *excluded* is the part that avoids
  double-counting. Canada's version keeps its extra sentence about
  provincial healthcare being universal (not itself an "excludes" item,
  just a clarifying note), unchanged in substance, just shortened
  alongside the rest.

### Round 3: further shrinking the Plan Status Bar, and an explicit "Next" for the estimated-fields review

More real-world mobile feedback, after round 2 above still left the bar
taller than it needed to be:

- **The chevron/pulse column was consuming its own full-width row.** Round
  2 kept `.plan-status-right` (the "Updated just now" pulse + the `▾`
  expand chevron) as a flex sibling of `.plan-status-text`, with
  `flex:1 1 100%` forcing the text onto its own line so the right column
  dropped to a second line, right-aligned. That second line's height (plus
  its own `margin-top`) was pure overhead — the chevron is a few pixels of
  content sharing a whole row. Fixed by taking `.plan-status-right` out of
  the flex flow entirely: `.plan-status-bar{position:relative}` and
  `.plan-status-right{position:absolute;top:8px;right:10px}`, with
  `.plan-status-bar`'s mobile padding widened on the right
  (`8px 34px 8px 14px`) so wrapped text never runs under the corner icon.
  `.plan-status-text` drops `flex:1 1 100%` (no longer needed — it's the
  only flex child left) in favor of a plain `width:100%`. Bar height on a
  2-line summary went from ~89px to ~51px. Font-size trimmed further too
  (`.82rem`→`.8rem`, `line-height` `1.35`→`1.3`) and bottom margin
  `10px`→`8px`.
- **An explicit "Next →" for the estimated-fields guided review.** The
  original design only auto-advanced past a field once it was edited or
  dismissed (see the "Guided 'Review →' navigation" note above) — there was
  no way to just look at a field and move on without doing either. The
  button (`#reviewEstimatesBtn`) now tracks two states: **"Review →"**
  before a review is in progress (or after the field it was on has left
  the counted set some other way), which jumps to the first counted field;
  and **"Next →"** once `reviewingFieldId` is set to a field that's *still*
  counted, which advances to whichever counted field comes after it in
  `ids` order (wrapping to the start past the last one) — a plain "skip
  this one for now" rather than requiring an edit or a dismiss first.
  `renderEstimatedRollup()` sets the button's label every time it runs (so
  it's always in sync after a real edit/dismiss triggers `render()`), but
  a **plain navigation click changes no state**, so nothing else would
  otherwise trigger a `render()` to flip the label — the click handler
  calls `renderEstimatedRollup(computeCountedEstimateIds())` itself right
  after `jumpToEstimateField()`, purely to refresh the label immediately.
  This label-refresh call is safe to make unconditionally: it recomputes
  the same already-cheap counted-set/badge logic `render()` always runs,
  and since the field just jumped *to* is by construction still in the
  counted set, the auto-advance check inside it never double-jumps.

### Round 4: floating review nav, dismiss-on-Next, badge tap-target clarity, status-bar overlap

A fourth round of real-mobile feedback, all fixed together:

- **Bug: "Review"/"Next" appeared to not switch to the Inputs tab.**
  `jumpToEstimateField()` did (and still does) call `setMobileView('inputs')`
  correctly — confirmed with Playwright that the very first click switches
  the tab fine. The real bug was one level up: `#reviewEstimatesBtn` lives
  inside `#estimatedRollupBanner`, which is part of `.content` — the
  Dashboard-tab-only half of the page on mobile. The moment
  `jumpToEstimateField()` switches to Inputs, `.content` (and the button
  the person just tapped) becomes `display:none`, so there is no way to
  tap "Next" again without first switching back to Dashboard by hand. From
  the outside this reads exactly like "review doesn't follow me to the
  input screen" — confirmed empirically: a Playwright loop that clicked
  `#reviewEstimatesBtn` a second time timed out because Playwright
  correctly refused to click a now-hidden element, the same thing a finger
  can't do on a real phone either.
  - **Fix**: a small floating pill (`#reviewNav`, `position:fixed`, bottom
    center, `z-index:40`) with its own "N fields left" count and a
    "Next →"/"Done ✓" button, plus a "✕" to exit the review. It's a
    sibling of `#undoToast` near the end of `<body>` (not inside
    `.content` or `.panel`), so it stays reachable regardless of which
    mobile tab is showing or how wide the viewport is. `syncReviewNav()`
    shows/hides and relabels it from the same `reviewingFieldId`/
    `computeCountedEstimateIds()` state the main banner button already
    uses, called from the end of `renderEstimatedRollup()` (single call
    site, same cadence as everything else in that function).
  - Both the banner's `#reviewEstimatesBtn` and the floating nav's
    `#reviewNavNext` now call the exact same `advanceReview()` function —
    two entry points, one action, no duplicated logic to keep in sync.
- **Behavior change: "Next" now dismisses the field it's leaving, not just
  skips past it.** Previously "Next" only advanced the guided-review
  cursor, leaving the field it left still counted/badged — a person had to
  separately tap the field's own ✓ to actually clear it. `advanceReview()`
  now calls the same `dismissEstimateField(id)` helper the per-field badge
  button uses (factored out of the old inline dismiss-click-handler body
  specifically so there's one push-to-`dismissedEstimates`-and-persist
  code path, not two) whenever it's leaving a still-counted field, then
  calls the full `render()` — whose existing auto-advance logic inside
  `renderEstimatedRollup()` notices `reviewingFieldId` just dropped out of
  the counted set and jumps to whatever's next *on its own*, so
  `advanceReview()` doesn't need to compute or jump to the next id itself
  in that branch. The very first click of a review (nothing dismissed yet,
  nothing to "leave") still just jumps to the first counted field without
  dismissing anything — there's nothing to confirm until the person has
  actually looked at one.
- **Badge tap-target clarity**: "Estimated ✓" used to render as one
  visually uniform pill, which read as if the whole pill (including the
  word "Estimated") might be what removes the field from the list, when
  only the small ✓ actually does. Split into a plain, non-interactive
  `<span class="estimate-badge-label">Estimated</span>` (`cursor:default`)
  followed by a visually distinct `.estimate-dismiss` — now its own filled
  circle (tinted background + border, `width/height:20px`, up from a bare
  16×16 text glyph with no background) so it unambiguously reads as a
  separate, tappable control rather than part of the label text. Kept the
  existing `aria-label` and added a matching `title` for hover/screen
  readers.
- **Highlight duration**: `jumpToEstimateField()`'s `.flash-highlight` on
  the landed field used to clear after 1.2s — often before the smooth
  scroll had even finished settling, so by the time someone actually
  looked at the field the highlight was already gone. Bumped to 2.6s. This
  is scoped to the guided-review jump only; the Plan Status Bar's
  `.metrics.flash-highlight` and the decision-question answer's own flash
  are unrelated call sites and were left at their existing durations.
- **Plan Status Bar: "Updated just now" overlapping the first line of
  wrapped text.** Round 3's fix took `.plan-status-right` (the pulse text +
  chevron) out of flex flow via `position:absolute;top:8px;right:10px` so
  it wouldn't force its own row — but that assumed the pulse's *rendered
  width* would fit inside the 34px of reserved right-padding, when
  "Updated just now" is really more like 110–120px wide. Whenever the main
  summary line wraps to 2 lines, the wide pulse text — anchored at a fixed
  `top:8px`, i.e. vertically aligned with line 1 — visually spilled left
  over line 1's own text rather than staying confined to the corner.
  - **Fix**: stopped trying to reserve horizontal space for the pulse text
    at all. `.plan-status-chevron` (a single glyph, genuinely small) is now
    the only thing absolutely positioned in the corner
    (`padding-right` trimmed 34px→30px accordingly, just enough for the
    chevron). `.plan-status-updated` moved out of the absolutely-positioned
    group entirely and back into normal document flow as its own
    full-width, right-aligned block *below* `.plan-status-text` — i.e.
    literally "on the 2nd line," per the request. `.plan-status-right`
    itself is set to `display:contents` on mobile so its two children
    (`.plan-status-updated`, `.plan-status-chevron`) participate in the
    parent's box model directly, without needing to change the HTML
    structure or the JS, which both still reference `#planStatusUpdated`/
    `.plan-status-chevron` by id/class regardless of DOM nesting.
  - Naively putting `.plan-status-updated` in normal flow would have
    permanently reserved an extra line of height on the bar (opacity:0
    still occupies box space) — exactly the regression round 3 was fixing.
    Avoided with `max-height:0;overflow:hidden` by default and
    `.show{max-height:18px;margin-top:3px}` — collapses to zero height
    for the ~97% of the time nothing was just updated, and only briefly
    grows for the 3s pulse window. `.plan-status-bar` switched from
    `display:flex` to plain `display:block` on mobile to make this
    block-stacking behavior the natural one, rather than fighting flex's
    row layout; desktop's single-line flex layout (where wrapping never
    happens and the old absolute-positioning trick was never actually a
    problem) is untouched.
  - Verified geometrically with Playwright (`getBoundingClientRect()` on
    `#planStatusText` vs `#planStatusUpdated` with `.show` forced on): the
    pulse's `top` now sits below the text block's `bottom` with no
    vertical overlap, confirmed at a width where the summary wraps to 2
    lines.
- **Persistence across scenario Load/import — verified, no code change
  needed.** `state.dismissedEstimates` already flows through the single
  `normalizeState()` choke point used by every load path — boot-time
  autosave restore, `loadScenario()` (the "Load" button on a saved
  scenario), and `importScenarioFile()` (both of which call
  `normalizeState(rawState)` before pushing onto `scenarios`, per the
  existing comment already in that code). Verified concretely with
  Playwright rather than trusting that comment alone: dismissed field A,
  saved a scenario, dismissed a *different* field B (simulating further
  edits made after the save), then clicked "Load" on the saved scenario —
  field A came back dismissed (no badge) and field B's badge reappeared
  (its post-save dismissal was correctly discarded, since it was never
  part of the loaded snapshot). A second check confirmed a real full page
  reload (not just a JS state swap) also preserves a dismissal via
  `localStorage`. No `normalizeState()`/scenario-shape change was needed —
  this round only added verification.

All fixes verified with `npm test`, a syntax check of both files, and
Playwright (both files, light+dark, 390×844 mobile): no horizontal
overflow after opening a review, the floating nav stays visible and
clickable across repeated "Next" clicks without ever needing to
manually flip back to the Dashboard tab, "Next" measurably decrements the
estimated-fields count each click, and the status-bar pulse no longer
overlaps wrapped summary text.

### Round 5: mobile Inputs-tab fields visibly "peeking" above the sticky search box mid-scroll

Real bug report, screenshot showed a slider handle and track appearing
briefly in a gap between the sticky Inputs/Dashboard tab switcher and the
sticky search box while scrolling the Inputs tab on mobile — described as
"a gap where you can see input fields, it is distracting."

- **Root cause, found by instrumenting real scroll positions (not just a
  before/after screenshot)**: `.mobile-tabs` and `.field-search-wrap` are
  two *independently* `position:sticky` elements, and — since round 2 —
  `.panel-title` ("Your assumptions") sits between them in the DOM as a
  plain `position:static` element that scrolls away normally. A sticky
  element only engages once the page has scrolled past *its own* natural
  document offset minus its own `top` value — and because `.mobile-tabs`
  sits much higher up the page than `.panel-title`/`.field-search-wrap`
  (which only start once `.panel` itself begins, well below `.workspace`'s
  first child), `.mobile-tabs` locks into its stuck position *long before*
  `.panel-title` has scrolled up out of the way. For the whole scroll
  distance in between, `.mobile-tabs` renders pinned to the viewport while
  `.panel-title` — and, if it's short, whatever real field sits right below
  it in `.panel` — is still scrolling normally through the now-uncovered
  band directly beneath the pinned tabs bar. Confirmed by scripting
  `window.scrollTo` in fixed steps across the whole transition and reading
  `getBoundingClientRect()` at each step (not just eyeballing a couple of
  scroll positions): the gap was as large as 85px and directly tracked
  `.panel-title`'s own un-stuck position for a good chunk of the scroll
  range, exactly matching the screenshot.
  - **Fix**: made `.panel-title` `position:sticky` again on mobile (round 2
    had deliberately made it `static` to reclaim permanent vertical space —
    that trade-off is superseded here by closing this bug), pinned directly
    below `.mobile-tabs` at `top:var(--mobile-sticky-h,0px)`. To avoid
    reintroducing round 2's "permanently eats space" complaint, it's now
    much more compact: padding trimmed to `9px 20px 7px`, and the "2026
    starting dollars" subtitle `<span>` is hidden on mobile entirely
    (`.panel-title span{display:none}`) — "Your assumptions" alone is
    enough context once it's a small permanent header rather than a
    full two-line block.
  - `.field-search-wrap`'s own sticky `top` moved from `var(--mobile-sticky-h,0px)`
    to `calc(var(--mobile-sticky-h,0px) + var(--panel-title-h,0px))` so it
    stacks directly below the now-sticky title instead of overlapping it.
    `--panel-title-h` already existed as a CSS var (`syncPlanStatusOffsets()`
    already measured `panelTitle.offsetHeight` into it, left over from
    before round 2 removed the code path that read it) — reviving its
    *consumer* was all that was needed here, no new measurement code.
  - **A second, independent bug surfaced while verifying this fix**:
    `--panel-title-h` measured `0px` even after the CSS change above,
    because `.panel` (and the `.panel-title` inside it) is `display:none`
    while the Dashboard tab is active — the mobile default — so the
    boot-time `syncPlanStatusOffsets()` call measures `offsetHeight` on a
    hidden element and gets 0, and nothing ever re-measured it afterward.
    `setMobileView('inputs')` — which is exactly the moment `.panel-title`
    *becomes* visible and therefore first becomes measurable — now calls
    `syncPlanStatusOffsets()` itself. Without this, `--panel-title-h` would
    stay frozen at 0 (silently reopening the same class of gap) until some
    unrelated edit happened to trigger a full `render()` first.
  - A small residual (~37px, matching `.workspace`'s own grid `gap` plus
    `.mobile-tabs`' own `margin-bottom`) transition window still exists
    between `.mobile-tabs` and `.panel-title` engaging their own stickiness
    a few pixels of scroll apart — but since nothing except `.panel`'s own
    plain card-colored background sits in that band (no field content,
    unlike the original bug), it reads as a harmless sliver of the same
    background color rather than a distracting content peek. Confirmed
    with a screenshot at the exact scroll offset where the old bug was
    worst — no field or slider visible, just the tabs, compact title, and
    search box in a clean stack.
- Verified with `npm test`, a syntax check of both files, and Playwright:
  a full stepped scroll (0 to 700px in 8px increments) through the Inputs
  tab on both files, both themes, with no horizontal overflow at any point;
  the estimated-fields guided-review flow (round 4) re-verified working
  end-to-end after this change, since it also depends on the mobile Inputs
  layout.

### Round 6: drop the "assumptions" title entirely on mobile, add a header-minimize toggle

Real-world feedback after round 5 shipped: "The summary ribbon is still
stuck to the top and not moving when scrolling. also with the assumptions
ribbon now visible all the time, it creates very little space to see the
field you are editing, especially when the number pad is open. could we
just get rid of the 'assumptions' ribbon? ... and could we add an option to
minimize the ribbons that are stuck at the top (not the summary ribbon, but
the search and input/dashboard ribbon)."

- **First pass on "the summary ribbon isn't there" was wrong — investigate,
  don't just test the literal words.** The first read of "still stuck to
  the top and not moving when scrolling" was that the user wanted the Plan
  Status Bar to stop being sticky; testing showed `#planStatusBar`'s mobile
  override was `position:relative;top:0` (not sticky) since round 3/4, so
  that first pass concluded there was nothing to fix and the report was
  probably a stale cached copy of the file. That was backwards: a follow-up
  screenshot after this "fix" shipped showed the status bar simply **absent**
  once scrolled — "stuck... not moving when scrolling" meant it stays
  behind at its original document position while everything sticky moves
  with the viewport, i.e. the opposite of what "stuck" usually means for a
  navbar. The tell that should have caught this sooner: `.mobile-tabs`'
  own sticky `top` is `calc(var(--plan-status-h,0px) + 10px)` — that
  formula only makes sense if something sticky is meant to occupy
  `--plan-status-h` worth of space above it. Every other measurement in
  this sticky stack (`--mobile-sticky-h`, the mobile-header-toggle's fixed
  `top`, `.panel`'s desktop sticky offset) was already built assuming the
  status bar is sticky. `position:relative` on mobile was a leftover from
  an earlier fix that needed *a* positioned ancestor for
  `.plan-status-chevron{position:absolute}` to anchor to, and used
  `relative` without noticing it clobbers `sticky` (they're mutually
  exclusive values of the same `position` property) — `position:sticky`
  serves exactly the same containing-block purpose for an absolutely
  positioned child, so switching back to it cost nothing.
  - **Fix**: `.plan-status-bar{top:0;position:relative;...}` → `top:0;
    position:sticky;...}` on mobile (both files). Left every other
    property (padding, margin, `display:block`) untouched.
  - **A second, more interesting bug surfaced immediately during
    verification**: with the bar now sticky, `.mobile-tabs` rendered
    overlapping its bottom edge by ~19px once both were stuck (`tabsTop:61`
    vs. `barBottom:70` — confirmed with a step-by-step real-scroll trace,
    not just an overflow check). Root cause: `--plan-status-h` was frozen
    at the bar's height from *before* the historical-success-rate clause
    was appended (`51px`, one line) rather than its real settled height
    once that clause pushes the summary onto a second line and lets the
    "Updated just now" pulse animate in (`70px`). `syncPlanStatusOffsets()`
    reads `bar.offsetHeight` synchronously right when `renderPlanStatusBar()`
    sets the new text and adds `.plan-status-updated`'s `.show` class — but
    on mobile, `.show` animates `max-height`/`margin-top` in over `.3s`
    (see its CSS) rather than jumping instantly, so that synchronous read
    catches the *pre-transition* height and never gets corrected once the
    animation actually finishes growing the bar. Nothing else re-measures
    afterward, so `--plan-status-h` (and everything downstream:
    `--mobile-sticky-h`, `.mobile-tabs`' sticky `top`) stayed wrong for as
    long as that render's text was current — which in practice is most of
    the time, since the historical-rate clause and its arrival pulse are
    normal, not edge cases.
  - **Fix**: schedule a second `syncPlanStatusOffsets()` call `320ms`
    after `.show` is added (past its `.3s` transition) and again after it's
    removed 3 seconds later (the pulse shrinking back down is the same
    animated-height problem in reverse). Confirmed with the same
    step-by-step scroll trace: `--plan-status-h` now settles to the bar's
    true `70px`, and `.mobile-tabs`/`.field-search-wrap` stack flush below
    it with no overlap and no gap (`barBottom:70` → `tabsTop:80` →
    `tabsBottom:130` → `searchTop:130`).
  - **Lesson for future sticky-stack work here**: when a JS height
    measurement feeds a sticky `top` offset, check every CSS transition on
    the measured element (and its children) for anything that changes
    layout-affecting properties (`max-height`, `margin`, `padding`,
    `height` — not just `opacity`/`transform`, which don't affect layout).
    A transition means the synchronous read at "the moment content
    changed" and the element's true settled state are two different
    numbers, and only one of them is usually being measured.
- **`.panel-title` ("Your assumptions") removed entirely on mobile**, going
  further than round 5's "keep it sticky but compact" — `.panel-title{
  display:none}` under `@media(max-width:820px)`, full stop. Rationale
  (the user's own): which tab you're on already reads as "Inputs" from the
  `.mobile-tabs` switcher itself, so a second "Your assumptions" header
  saying the same thing in different words was pure overhead, worst of all
  while the on-screen keyboard is open and every pixel of vertical space
  actually matters. This is a strictly better fix for round 5's original
  peeking-fields bug too, not just a space-reclaiming trade-off: with
  `.panel-title` gone, `.field-search-wrap` goes back to being the very
  first thing below `.mobile-tabs`, and its sticky `top` reverts to plain
  `var(--mobile-sticky-h,0px)` (dropping the `+ var(--panel-title-h,0px)`
  term round 5 added) — since there's no element left in the DOM to leave
  a "dead zone" gap for, the underlying bug class round 5 fixed doesn't
  have anywhere to reopen. `--panel-title-h` is still measured in
  `syncPlanStatusOffsets()` (harmless — reads `0` for a `display:none`
  element) but nothing reads it as an input to another `top` anymore;
  not worth ripping out for the sake of a no-op line. Desktop's
  `.panel-title` (sticky, full padding, "2026 starting dollars" subtitle
  visible) is completely untouched — this is a mobile-only override, same
  scoping as every other `@media(max-width:820px)` rule in this section.
- **New: a "minimize sticky header" toggle for the tabs+search stack only.**
  A small circular button (`#mobileHeaderToggle`, `︿`/`⌄`), `position:fixed`
  in the top-right corner just below the Plan Status Bar, added as a
  sibling of `.mobile-tabs` inside `#workspace` (base/desktop rule:
  `display:none`, same as `.mobile-tabs` itself). Tapping it toggles
  `body.mobile-header-collapsed`, and a single mobile-only rule —
  `body.mobile-header-collapsed .mobile-tabs,body.mobile-header-collapsed
  .field-search-wrap{display:none}` — hides both the Inputs/Dashboard
  switcher and the search box together. The Plan Status Bar is
  deliberately excluded, per the user's explicit "not the summary ribbon"
  — that one stays exactly as-is; this toggle only ever touches
  navigation/search chrome.
  - Using `position:fixed` (not `sticky`, and not nested inside either
    element it controls) means the toggle needs no sticky-offset math of
    its own and stays reachable regardless of collapsed state — there's
    no "how do I get back" dead end once collapsed, unlike fully removing
    a control would be.
  - This is a pure display toggle, not `state` — same reasoning as
    `logScale`/`chartView`/the mobile tab view itself: none of those
    persist across a reload either, and this doesn't need to.
  - While collapsed, `.mobile-tabs`' `offsetHeight` reads `0`
    (`display:none`), which would leave `--mobile-sticky-h` stale for
    `.field-search-wrap`'s sticky `top` if nothing re-measured it on
    re-expand — the toggle's click handler calls `syncPlanStatusOffsets()`
    itself on every click (collapse or expand) rather than only wiring it
    into the expand path, since it's cheap and one code path is simpler
    to reason about than two.
  - Collapsing hides `.mobile-tabs` entirely, including while on the
    Inputs tab — there's no way to tap over to Dashboard until it's
    re-expanded. This was a deliberate simplicity trade-off (one shared
    collapse state for both elements, matching the user's own framing of
    them as one thing to minimize) rather than trying to preserve
    Dashboard-switching some other way while collapsed.
- Verified with `npm test`, a syntax check of both files, and Playwright
  (both files): `.panel-title` computes to `display:none` on the mobile
  Inputs tab; no horizontal overflow on the Inputs tab in either
  light/dark theme; clicking `#mobileHeaderToggle` hides both `.mobile-tabs`
  and `.field-search-wrap` and flips the button's `aria-label` to "Show
  tabs and search"; clicking it again restores both to `display:flex`; a
  full 0–600px scroll sweep after collapsing shows no overflow; and the
  round-4 guided-review flow (`#reviewEstimatesBtn` → repeated
  `#reviewNavNext` clicks) still keeps `data-mobile-view` on `'inputs'`
  and the floating `#reviewNav` visible throughout, unaffected by the new
  toggle's presence.

## Mobile bug: a slider drag re-opens the keyboard on a field you already backed out of

Real-world bug report: focus a money field (opens the on-screen number pad),
press the phone's back button to dismiss the keyboard (Android's back
button hides the keyboard without blurring the underlying field — it stays
`document.activeElement`), then drag an unrelated slider elsewhere on the
page — and the number pad reopens on the original field.

- **Root cause**: several `ids`-array fields have clamping side effects on
  other fields (age vs. life expectancy, buy-down % vs. mortgage math,
  etc.), so their `input` listener calls `syncControls()` after updating
  `state` — see the hardcoded list (`ageA`, `ageB`, `lifeExpectancyA/B`,
  `retireAgeA/B`, `incomeA/B`, `cashReserve`, `extraPrincipal`,
  `buyDownPct`, `buyClosingPct`, `buyExtraPrincipal`) right before the
  `syncControls()` call in the generic `ids.forEach` listener — several of
  these (`retireAgeA/B`, `extraPrincipal`, `buyDownPct`, `buyClosingPct`)
  are sliders. `syncControls()` used to unconditionally do
  `el.value = state[id]` for **every** `ids` field, and its trailing
  `refreshMoneyPreviews()` call unconditionally re-ran `attachMoneyPreview`'s
  `reformat(null)` on every money field too — both blind writes, touching
  whatever field is currently focused even when its value hasn't changed.
  Programmatically setting `.value` on a still-focused input, even to an
  identical string, is exactly the kind of DOM mutation that makes some
  mobile browsers re-show the on-screen keyboard for it — which is why a
  slider drag having nothing to do with the money field would wake it back
  up. Confirmed by instrumenting the native `value` setter with a counter:
  before the fix, dragging `retireAgeA` fired the setter on a still-focused,
  *unrelated*, unchanged `spending` field twice (once from each call site);
  after the fix, zero times. (The actual "keyboard reopens" symptom itself
  is a mobile-only browser behavior that doesn't reproduce in headless
  desktop Chromium, so this write-count check — not a visible keyboard — is
  what verifies the fix.)
- **Fix, two call sites**:
  1. `syncControls()`'s `ids.forEach` loop now skips the write when the
     field is `document.activeElement` *and* its current numeric value
     (stripping `$`/commas the same way every other money-field read site
     does) already equals `state[id]`.
  2. `attachMoneyPreview`'s `reformat()` now skips the write whenever the
     field already shows the correctly-formatted target string — a general
     no-op guard, not focus-specific, since re-running `refreshMoneyPreviews()`
     (from `syncControls()`, or from any of the four dynamic
     loan/tier/income-source/one-time-income `render*Fields()` rebuilds) is
     routine, not just something that happens while a field is focused.
  Neither guard weakens the fields' actual job: Reset/Load/import/wizard-done
  still overwrite every field, since those calls are always changing the
  value to something different; live typing still reformats on every
  keystroke, since a freshly-inserted raw character essentially never
  already equals the fully-formatted target string.
- **Verified**: `npm test`; a syntax check of both files; typing into a
  money field still live-formats correctly (`$60,000` → `$600,005` after
  appending "5"); and the value-setter instrumentation above, both files.

### Follow-up: the fix above wasn't the whole story — dynamic-list fields were the real trigger

Real-world feedback after the fix above shipped: "The sliders are still
reverting back to having the number pad open and moving the screen back to
the field that has the text cursor." The `syncControls()`/`attachMoneyPreview`
guards were correct as far as they went, but they only covered the
top-level `ids`-array fields (static elements that live in the DOM
permanently and just get their `.value` written). They said nothing about
the four **dynamic list** render functions — `renderLoanFields()`,
`renderSpendingTierFields()`, `renderIncomeSourceFields()`,
`renderOneTimeIncomeFields()` — which is where a person is actually likely
to have "a field with the text cursor in it": loan balances, spending-tier
amounts, income-source amounts, one-time-income amounts are exactly the
kind of per-row money field someone would be mid-edit on.

- **Root cause, much more severe than the previous fix's**: all four
  `render*Fields()` functions unconditionally did
  `container.innerHTML = state.X.map(...).join('')` — a full destroy-and-
  recreate of every row's DOM — on *every single call*, including from
  their own field's own `input` listener (`state.incomeSources[i].amount =
  ...; render(); saveInputs();`). `render()` calls `syncContributionControls()`,
  which unconditionally calls all three of `renderSpendingTierFields()`/
  `renderIncomeSourceFields()`/`renderOneTimeIncomeFields()` on *every*
  render — i.e. on every keystroke anywhere in the app, not just within
  these lists. Confirmed with Playwright: typing a single digit into
  `incSrc0Amount` destroyed and recreated that very input's DOM node,
  dropping focus to `<body>` — this reproduced from typing into the field
  itself, with no slider involved at all. Dragging a completely unrelated
  slider (e.g. a 401(k) contribution %, which calls `syncContributionControls()`
  directly from its own `input` listener) did the same thing to whatever
  dynamic-list field happened to be focused elsewhere on the page. A
  destroyed-and-recreated `<input>` in the same visual position is
  precisely the kind of DOM churn that can make a mobile browser re-show
  its on-screen keyboard for the "new" element sitting where the old,
  keyboard-dismissed one used to be — which is why this reads on a real
  device as "the keyboard reopens on the field I was just in," even though
  the node isn't literally the same one anymore.
- **Why the earlier fix's own test suite didn't catch this**: the previous
  round's `check_typing_still_works.js`/value-setter instrumentation only
  ever exercised the `#spending` field — a static top-level `ids` field,
  never rebuilt via `innerHTML`. None of the verification for that round
  touched a loan/tier/income-source/one-time-income field, so the much
  bigger dynamic-list bug was sitting right next to the fix the whole time,
  untested.
- **Fix**: each `render*Fields()` function now guards its own rebuild with
  a structural signature check: `renderLoanFields()` skips the rebuild
  entirely when the container already contains the focused element *and*
  the row count hasn't changed (loans have no add/remove UI and no
  `enabled` toggle, so row count is the only thing that can structurally
  change). The other three additionally fold each row's `enabled` flag
  into the signature (`rowCount + ':' + enabledFlags.join('')`, stashed on
  `container.dataset.sig`), since toggling a row's own enabled checkbox
  needs to still show/hide its sibling fields correctly. Skipping only
  applies while focus is *inside* the container and the signature is
  unchanged — an explicit enabled-toggle (which always changes the
  signature) or any call from Reset/Load/import/wizard-done/boot (where
  nothing is focused inside the list yet) still does the full authoritative
  rebuild as before. While skipped, nothing is lost: the field's own
  `attachMoneyPreview`/plain `input` listener (still bound, since the node
  was never destroyed) already keeps its value and $-formatting current
  from the user's own typing — the skipped rebuild would have shown
  exactly the same thing, just via a destroyed-and-recreated node.
- **Verified**: `npm test`; a syntax check of both files; Playwright,
  both files — typing a digit into `incSrc0Amount` now keeps the exact
  same DOM node and focus (previously: destroyed, focus fell to `<body>`);
  dragging an unrelated `k401PctA` slider while `incSrc0Amount` is focused
  now leaves it untouched, same node, still focused (previously: same
  destroy-and-refocus-to-body failure); enabling a row via its own
  checkbox still correctly un-hides its sibling fields (the structural
  path still rebuilds); typing into a `loan0Balance` field still works and
  keeps focus. This is a considerably more likely explanation for the
  original bug report than the first fix's narrower mechanism, since it
  reproduces from typing alone, with no slider needed, and applies to
  every one of the four dynamic lists in both files, not just a handful
  of hardcoded top-level ids.

## Mobile bug: gap between the Plan Status Bar and the Inputs/Dashboard tabs shows sidebar content bleeding through

Real-world bug report (screenshot): a real device, scrolled partway down
the mobile Inputs tab, showed an actual sidebar group heading ("TAX FILING
STATUS") visible in a thin band between the sticky Plan Status Bar and the
sticky `.mobile-tabs` switcher below it — not a color mismatch, literal
foreground text bleeding through.

- **Root cause**: `.mobile-tabs`' sticky `top` was
  `calc(var(--plan-status-h,0px) + 10px)` — a **real 10px gap**, not
  padding, between the two sticky elements' own rectangles. A sticky
  element only covers its own box; whatever normal-flow content is
  scrolled to a screen position *between* two stuck siblings is not
  covered by either one and renders exactly as if nothing were sticky
  there at all. Round 5's "Sidebar group state summaries" line of
  reasoning ("nothing except `.panel`'s own plain card-colored background
  sits in that band") turned out to be true only by coincidence at the one
  scroll position that was actually tested — at any other scroll position,
  whatever text happens to be at that exact vertical band (a group
  heading, a field label) shows through it, exactly as the screenshot
  shows. Reproduced directly with Playwright: a real `page.mouse.wheel()`
  scroll on the mobile Inputs tab, screenshotted mid-scroll, shows the same
  sliver of sidebar content peeking through the gap.
- **Fix**: rather than leaving a bare unclipped gap between two sticky
  boxes, the breathing room now lives *inside* the status bar's own opaque
  box — `.plan-status-bar`'s bottom padding grew from `8px` to `18px`
  (i.e. the same 10px, just moved from being "space after the box" to
  "space inside the box"), and `.mobile-tabs`' sticky `top` changed to
  `var(--plan-status-h,0px)` (flush, no `+10`). Since `--plan-status-h` is
  measured from the bar's real `offsetHeight` (which now includes the
  extra padding automatically), nothing else needed to change to keep the
  two in sync — the JS `--mobile-sticky-h` computation's own `+10` term
  (which existed purely to account for this now-removed gap) was also
  dropped, in both files. `.mobile-header-toggle`'s fixed `top` shifted
  from `+6px` to `-4px` off `--plan-status-h` to keep the circular
  minimize button visually centered on the new, gap-free seam between the
  two bars.
- **A second, pre-existing, previously undetected instance of the same bug
  class, found while re-measuring this**: `Planner_Canada.html`'s
  `--mobile-sticky-h` formula had an *extra* `+ 14` term beyond the `+10`
  above (meant, per an existing code comment, to fold in `.mobile-tabs`'
  own CSS `margin-bottom:14px` into `.field-search-wrap`'s sticky offset).
  Measured with a real scroll gesture, this term was simply wrong: with it
  present, `.field-search-wrap` stuck a real 14px too *low*, opening the
  exact same class of gap between `.mobile-tabs` and the search box that
  this round fixed between the status bar and the tabs — confirmed via
  `getBoundingClientRect()` on the committed (pre-fix) code, not just a
  theoretical box-model argument. `Planner_US.html`'s equivalent formula
  never had this `+14` term and was already flush (confirmed to within
  0.3px). The term was removed from Canada's formula to match; the two
  files' `--mobile-sticky-h` formulas are now identical (`barH + tabsH`,
  no gap terms in either). This is a useful general lesson for this sticky
  stack: don't add a margin/gap term to a computed sticky offset on
  theoretical box-model grounds — measure the *actual* stuck rectangles
  with `getBoundingClientRect()` after a real scroll and let that decide,
  the same way this file's own testing-checklist item 6 already prescribes
  for sticky work generally.
- **Verified**: `npm test`; a syntax check of both files; a real
  `page.mouse.wheel()` scroll sweep (light+dark, both files, 390×844) with
  `getBoundingClientRect()` checks confirming a sub-pixel-flush stack
  (status bar → tabs → search box) once stuck, and a before/after
  screenshot at the exact scroll position the original bug reproduced at,
  confirming no sidebar content is visible in the seam; the
  `#mobileHeaderToggle` collapse/expand toggle still works and both
  `.mobile-tabs`/`.field-search-wrap` still hide/show together; the
  estimated-fields guided-review flow (`#reviewEstimatesBtn`/
  `#reviewNavNext`) re-verified working end-to-end, since it also depends
  on this mobile sticky stack.

## Mobile bug: keyboard still reopening on a slider drag after the DOM-write and dynamic-list fixes — a platform-level focus quirk, fixed by blurring proactively

Real-world feedback after both earlier keyboard-reopen fixes shipped: "mobile
text fields are still triggering the number pad when the text cursor is
still in the field, and a slider is manipulated." A comprehensive Playwright
sweep — every `input[type=range]` in both files (21 sliders in
`Planner_US.html`), against a focused static `ids` field and a focused
dynamic-list field, at both desktop and mobile (390px) viewport widths,
instrumenting the focused field's native `value` setter for spurious writes
and checking `document.activeElement` after each drag — found **zero**
remaining writes and **zero** focus loss anywhere. Both previous fixes (the
`syncControls()`/`attachMoneyPreview` no-op guards, and the dynamic-list
`render*Fields()` rebuild guards) hold up under this sweep; there is no
more DOM-mutation-based mechanism left in this file's own code that
explains the report.

- **Conclusion**: this is very likely a platform-level quirk rather than a
  remaining app bug — some mobile browsers/WebViews re-evaluate whether to
  show the on-screen keyboard whenever the page regains "input focus" from
  a touch gesture, even one aimed at a completely different control,
  purely because *some* element (the text field the person never
  explicitly blurred) still technically holds DOM focus. Android's back
  button dismissing the visual keyboard without calling `.blur()` on the
  underlying field (documented in the first keyboard-reopen section above)
  is exactly the kind of state that leaves this quirk able to fire later.
  This isn't something a DOM-write audit can rule out further — the
  browser can decide to reopen the keyboard for a focused-but-dismissed
  field on its own, without our script touching that field at all.
- **Fix**: rather than continuing to chase a specific write path, address
  the underlying stale-focus condition directly. A capture-phase
  `pointerdown` listener on `document` (in both files) checks whether the
  event target is a range slider and, if so, blurs `document.activeElement`
  whenever it's a *different* text/number-type input. `pointerdown` (not
  `input`, which only fires once a drag has already started moving the
  thumb) fires at the very first touch, before any keyboard-reopen
  animation the platform might otherwise trigger has a chance to begin. A
  field with no DOM focus gives the OS keyboard nothing to reopen for,
  regardless of the exact underlying platform mechanism — and it also
  matches ordinary expectations for a well-behaved page: touching a slider
  elsewhere is a clear signal the person's attention has moved on.
- **Verified**: `npm test`; a syntax check of both files; Playwright —
  dispatching a real `PointerEvent('pointerdown')` on a slider while a
  text field is focused blurs it (`document.activeElement` becomes
  `<body>`); clicking back into the field and typing afterward still works
  normally (`$600,000` → `$600,009` after appending a digit), confirming
  the blur doesn't interfere with the field's own subsequent use.

## Estimated-fields guided review was walking `ids` array order, not sidebar visual order

Real-world bug report: "the Next button on the estimated review seems to be
jumping around a lot instead of going in sequential order of the fields in
the assumptions menu."

- **Root cause**: `computeCountedEstimateIds()` filtered and returned
  candidates in `ids`-array order — but per "Sidebar group order" earlier
  in this file, `ids`' declaration order has never been tied to a field's
  actual position in the sidebar markup; fields get freely reordered and
  regrouped across rounds without anyone needing to (or being expected to)
  keep `ids` in sync, since nothing else in the app depends on that
  array's order. The guided review was the one consumer that silently
  *did* depend on it, and nobody had reason to notice until someone
  actually stepped through it field-by-field on a live sidebar.
- **Fix**: `computeCountedEstimateIds()` now sorts its filtered candidates
  with `Node.compareDocumentPosition()` against each field's live DOM
  position, rather than trusting the array's declaration order. This is
  self-maintaining — a future sidebar reorder automatically keeps the
  review in the right order too, with nothing to remember to update in a
  second place.
- **A related, pre-existing gap noticed while verifying this (not fixed,
  out of scope for this round)**: a field can be `ESTIMATE_ALWAYS_IDS`-
  countable while its own field row is actually hidden by an unrelated
  toggle — e.g. `rent` is unconditionally counted, but its row is only
  shown while `tenure === 'rent'`. `jumpToEstimateField()` doesn't
  currently check for this, so reviewing could land on a field that isn't
  visually reachable. Worth a future look, but distinct from the ordering
  bug this round fixes.
- **Verified**: `npm test`; a syntax check of both files; Playwright, both
  files — opened every sidebar group, then repeatedly clicked
  "Review →"/"Next →" and recorded which field was highlighted after each
  click; the resulting sequence's `getBoundingClientRect().top` values are
  monotonically non-decreasing (top-to-bottom, matching visual order)
  across all visible counted fields in both files.

## Historical/Monte Carlo success-rate boxes moved out of "More results" to live with their chart

Real-world feedback: "the historical success rate result box as well as the
monte carlo success rate box appear in the 'more results' menu. this is a
box that only appears when those 2 charts are being viewed. can this box be
moved outside of the 'more results' dropdown and make it visible whenever
the historical and monte carlo charts are viewed?"

- **What was wrong**: `#histSuccessCard`/`#mcSuccessCard` (see the "Home-
  screen redesign, round 2" section above) already correctly toggled their
  own `.hidden` based on `chartView` inside `renderChartView()` — the JS
  was never the problem. But their markup lived *inside*
  `#moreResultsCard`, a `<details>` collapsed by default. So switching the
  main chart to "Historical (S&P 500)" or "Monte Carlo" correctly un-hid
  the box, but it stayed invisible anyway unless the person separately
  expanded "More results" — defeating the point of a box that's supposed
  to appear automatically the moment its matching chart view is selected.
- **Fix**: moved both `<div class="metric" id="histSuccessCard">`/
  `id="mcSuccessCard">` out of `#moreResultsCard` and into `#mainChartCard`
  itself, right after the chart's own `.chart-note`, in both files. No JS
  changed — `renderChartView()`'s existing `histCard.hidden = chartView
  !== 'hist'`/`mcCard.hidden = chartView !== 'mc'` lines work exactly as
  before, just against a box that's now free to actually render as soon as
  it's un-hidden, rather than sitting behind a second, unrelated collapse
  state.
- **Verified**: `npm test`; a syntax check of both files; a mobile
  overflow sweep with both chart views selected; Playwright confirming, in
  both files: neither success card is a descendant of `#moreResultsCard`
  any more; clicking the "Historical (S&P 500)" chart-view button makes
  `#histSuccessCard` visible with `#moreResultsCard` still collapsed;
  switching to "Monte Carlo" shows `#mcSuccessCard` and re-hides
  `#histSuccessCard`, same as before the move.

## Floating review pill (`#reviewNav`) hidden behind the on-screen keyboard

Real-world bug report: "the Next button for the estimated review is covered
up by the number pad whenever it is up, so you can't click it when editing
a text field."

- **Root cause**: `#reviewNav` is `position:fixed;bottom:...`, anchored to
  the bottom of the *layout* viewport. When the on-screen keyboard opens for
  a focused text field, mobile browsers typically leave the layout
  viewport's height unchanged and only shrink the *visual* viewport (the
  part actually visible above the keyboard) — so a plain fixed-bottom
  element stays positioned at the bottom of the full layout viewport, which
  is now behind the keyboard rather than in the visible area. This doesn't
  reproduce in headless desktop Chromium (no real keyboard ever opens), so
  it wasn't caught by any of the earlier Playwright sweeps in this file —
  same category of "can't be seen without the real platform behavior" as
  the mobile keyboard-reopen quirk documented above.
- **Fix**: `syncKeyboardInset()` (in both files, defined right after
  `syncPlanStatusOffsets()`) reads `window.visualViewport` and sets a
  `--keyboard-inset` CSS var to `window.innerHeight - visualViewport.height
  - visualViewport.offsetTop` — the gap between the full layout viewport and
  what's actually visible, i.e. the keyboard's height once one is open (and
  `0` the rest of the time). `.review-nav`'s `bottom` on both the base rule
  and the mobile safe-area override now add `var(--keyboard-inset,0px)`, so
  the pill rides up above the keyboard instead of staying pinned under it.
  Wired to `window.visualViewport`'s own `resize`/`scroll` events (fired
  when the keyboard opens/closes, and also as it's being animated in/out on
  some platforms) plus one call at boot for the initial (no-keyboard) state.
  `window.visualViewport` is undefined only on very old browsers, guarded
  with `if (window.visualViewport)` around both the registration and inside
  the function itself.
- This is a general technique, not `#reviewNav`-specific — any other
  fixed-bottom control added later in this file should read the same
  `--keyboard-inset` var in its own `bottom` calc() rather than reinventing
  keyboard-avoidance, since `syncKeyboardInset()` already keeps the var
  current unconditionally.
- **Verified**: `npm test`; a syntax check of both files; a mobile overflow
  sweep; Playwright confirming the CSS wiring directly (setting
  `--keyboard-inset` to a simulated 300px keyboard height moves
  `#reviewNav`'s bounding rect up by exactly 300px, in both files) — a real
  `visualViewport` resize can't be triggered in headless Chromium without an
  actual on-screen keyboard, so this verifies the CSS/variable plumbing
  rather than the browser's own keyboard-open event, which is the part this
  fix has no control over anyway.

## Slider touch-target and row-spacing pass (accidental-drag mitigation, partial)

Following up on user feedback that "it's pretty easy to mess up slider fields
when scrolling (clicking anywhere on the bar immediately moves the knob)",
implemented the two lowest-risk, established mobile-UX recommendations for
this class of problem:

1. **Larger thumb touch target.** `input[type=range]` (both files) now sets
   `height:44px` on the element itself (Apple HIG / Material both recommend
   ≥44×44px / 48×48dp for a draggable control) — Chromium/WebKit/Firefox all
   keep the visible track thin and vertically center it within that box
   rather than stretching the track to fill it, so the *visual* size barely
   changes while the *invisible* touch-sensitive area around the thumb grows
   substantially. `::-webkit-slider-thumb`/`::-moz-range-thumb` are also
   explicitly sized to `26px` (up from each browser's own smaller default,
   typically ~16-20px) so the visible thumb itself is easier to see and grab
   precisely, not just easier to touch near. Neither change disables native
   `-webkit-appearance`/`accent-color` styling or requires a custom-drawn
   track — this is additive sizing on top of the existing native rendering,
   not a redesign.
2. **More vertical spacing between slider rows.** `.range-field`'s margin
   went from `13px 0 17px` to `17px 0 22px` (desktop/base) and gets an
   additional mobile-only bump to `22px 0 28px` inside the existing
   `@media(max-width:820px)` block — more breathing room around each slider
   means a scroll gesture that grazes the sidebar is less likely to land
   exactly on a slider's row in the first place.
- **What this does and doesn't fix**: both changes make an *intentional*
  drag easier and an *accidental* touch less likely to land on a slider at
  all — but they don't change the fundamental behavior a native
  `<input type=range>` has always had: any touch that *does* land on the
  track (accidental or not) still jumps the value to that position
  immediately, and the browser still has to guess from the initial touch
  direction whether a touch-and-move was meant as a drag or a page scroll.
  Fully solving "an accidental touch during scroll changes the slider's
  value" would need custom JS gesture-disambiguation (only start changing
  the value once a touch has moved a few pixels and stayed mostly
  horizontal, rather than committing to a value on `touchstart`) — a
  materially bigger, riskier change across every slider in both files,
  deliberately left out of this pass and worth a dedicated follow-up if the
  smaller mitigations above don't feel like enough in practice.
- **Verified**: `npm test`; a syntax check of both files; Playwright
  confirming `input[type=range]`'s rendered box height is `44px` on both
  desktop and mobile (Inputs tab) in both files, `.range-field`'s computed
  margin reflects the desktop/mobile values above, a slider still updates
  its paired `<output>`/state correctly after the CSS change, a mobile
  screenshot showing no visual regression (thin track, bigger blue thumb,
  clearly separated rows), and a light+dark mobile overflow sweep in both
  files with no horizontal scroll.

## Slider touch-vs-scroll gesture disambiguation (full fix, branch `slider-gesture-disambiguation`)

The pass above intentionally left the deeper problem alone: any touch that
lands on a slider's track still steals the gesture from the page, even when
the person meant to scroll. Before writing the real fix, this was scoped
with a throwaway diagnostic build (a `console.log` on `pointerdown`/
`pointermove`, no real logic) tested on real Android Chrome hardware via
`chrome://inspect` USB/wireless debugging — headless Chromium can't
reproduce this class of bug at all, since there's no real touchscreen to
generate ambiguous gestures. That test ruled out the naive approach
("just watch touch direction, never call `preventDefault()`, and let the
browser's own scrolling take over once it's clearly vertical") and revealed
what a native `<input type=range>` actually does on touch:

- **The value jumps to the touch point on the very first touch** — before
  any movement, before any JS even runs. This is the control's own default
  action for `pointerdown`/`touchstart`, not something the drag/scroll
  distinction can prevent after the fact.
- **Continued movement is split between dragging and scrolling**, with the
  scroll throttled to a fraction of the actual finger travel — the
  diagnostic logged a 10px vertical drag producing under 2px of page
  scroll. This is worse than either a clean drag or a clean scroll: it's a
  half-hearted compromise that satisfies neither.

Because of this, there's no way to fix the underlying complaint ("clicking
anywhere on the bar immediately moves the knob") without taking over the
entire touch gesture on these controls, not just observing it:

- **`input[type=range]{touch-action:none}`** (added to the shared CSS rule
  in both files) tells the browser not to run *any* of its own default
  touch/pen handling on range inputs — no jump-to-touch, no native drag, no
  native scroll-through. Mouse is unaffected (`touch-action` only governs
  touch/pen), so mouse dragging goes through the browser exactly as before.
- A capture-phase `pointerdown`/`pointermove`/`pointerup`/`pointercancel`
  listener set (in both files, right after the existing slider-focus-blur
  `pointerdown` listener from the "Mobile bug: a slider drag re-opens the
  keyboard" section) re-implements both interactions from scratch:
  - Tracks per-`pointerId` gesture state in a `Map` (not a single shared
    variable), since nothing rules out two fingers touching two different
    sliders, and `pointerId` is the correct key to disambiguate them.
  - Waits for **8px** of movement (`DRAG_THRESHOLD`) before committing to
    an interpretation — this matches the branch's scope doc's decision, and
    is deliberately not re-litigated per slider or per platform.
  - Classifies by comparing `|dx|` vs `|dy|` once the threshold is crossed:
    `|dy| > |dx|` → `'scroll'`, otherwise `'drag'`. This is a one-time
    decision for the life of the gesture — it does not re-evaluate on
    every subsequent move, so a gesture that starts vertical and later
    goes diagonal stays a scroll (matches how people actually scroll:
    the initial direction is the signal, not the path).
  - **Drag**: recomputes the slider's value from the pointer's X position
    against the track's own `getBoundingClientRect()` (`valueFromPointerX`)
    — this re-derives exactly the min/max/step math the browser's native
    default action would have done, since `touch-action:none` suppressed
    that math along with everything else. Sets `.value` and dispatches a
    real `input` event (`bubbles:true`), so every existing per-field
    listener (age/life-expectancy clamping, `syncControls()`, `$`-money
    formatting, etc.) runs exactly as it would from a real native drag —
    no new code path for downstream consumers to learn about.
  - **Scroll**: manually scrolls the correct container by the *incremental*
    per-move delta (not the total delta from gesture start, which would
    overcorrect on every event) — `window` on mobile or `.panel`'s own
    internal scroll on desktop, found generically by walking up from the
    slider for the first `overflow-y:auto|scroll` ancestor with real
    overflow, the same "which container actually scrolls" split already
    used elsewhere in this file (undo-toast auto-scroll, sticky-panel
    math), rather than hardcoding `.panel`.
  - **Plain tap** (movement never crosses the threshold): `pointerup`
    applies the same `valueFromPointerX` jump-to-position math the browser
    used to do for free — `touch-action:none` would otherwise silently
    remove tap-to-jump as a side effect of removing everything else, and
    the scope doc explicitly decided to preserve it.
  - **Pen is treated identically to touch** (`e.pointerType === 'touch' ||
    'pen'`) — `touch-action:none` suppresses the browser's native handling
    for pen input too, so without this a stylus would be unable to
    interact with these sliders at all once the CSS change landed.
- **Why not `touch-action:pan-y` instead** (letting native scrolling pass
  through for free, no manual `scrollBy` needed)? It was seriously
  considered and rejected: `touch-action` is a static, per-element
  declaration that browsers snapshot at the moment of touchdown, not a
  per-gesture negotiation — there's no reliable way to say "start as
  scroll-only, but switch to drag-only if the first few pixels turn out
  horizontal," because by the time JS could try to flip the CSS value the
  browser has often already committed to its touchdown-time interpretation
  for that gesture. `none` plus fully custom drag-or-scroll handling is the
  only approach that behaves identically across gestures and browsers,
  at the cost of the small amount of `scrollBy`/value-math code above.
- **Setup note for anyone continuing this work**: this class of bug is
  invisible to headless Chromium testing (Playwright *can* dispatch
  synthetic `PointerEvent`s with `pointerType:'touch'` and verify the JS
  logic responds correctly — see the drag/scroll/tap/mouse verification
  below — but it cannot reproduce the *native browser* touch-claiming
  behavior that motivated this fix in the first place, since there's no
  real touchscreen in a headless run). Confirming a hypothesis like "the
  native default action still wins" or "the scroll is throttled" requires
  actual on-device testing via remote debugging — Android via
  `chrome://inspect/#devices` (USB or `adb pair`/`adb connect` over
  Wireless debugging both work equally well once connected) is the
  practical option most people can reach even without an iOS device; this
  fix has not been verified on iOS Safari specifically, which is a known
  gap, though the Pointer Events / `touch-action` behaviors it relies on
  are part of the same cross-browser spec.
- **Verified**: `npm test`; a syntax check of both files; Playwright
  dispatching synthetic `PointerEvent`s (`pointerType:'touch'`) directly at
  a slider in both files — a purely-vertical drag leaves the slider's value
  unchanged and scrolls the page; a purely-horizontal drag changes the
  value and leaves scroll position unchanged; a tap with no movement jumps
  the value to the tapped position (tested at 80% along the track); a real
  mouse drag (`page.mouse`) still changes the value exactly as before,
  confirming `touch-action:none` didn't regress non-touch input; a
  light+dark mobile overflow sweep plus a desktop-width overflow check in
  both files with no horizontal scroll. The on-device throttled-scroll
  finding that motivated this fix (10px drag → <2px scroll) was observed
  and confirmed via the throwaway diagnostic build described above, on a
  real Android Chrome device, before this implementation was written.

### Follow-up: `touch-action:none` alone didn't actually block the native drag on real Android Chrome

The first version above shipped with only `touch-action:none` suppressing
the browser's own handling — no `preventDefault()` calls, per the reasoning
that `touch-action:none` was documented as suppressing "no jump-to-touch, no
native drag, no native scroll-through." On-device testing on the real
Samsung Galaxy S23 (Android Chrome) that this feature was scoped against
showed that reasoning was wrong in one specific way: `getComputedStyle(el)
.touchAction` correctly reported `"none"`, and the page correctly stopped
panning through the slider — but the slider's own knob still visibly
jumped/dragged on touch, exactly as before the fix. Headless Chromium's
synthetic `PointerEvent` tests never caught this because dispatching a
`PointerEvent` programmatically doesn't trigger a real browser's *native*
default-action pipeline for a form control at all (there's no actual
touchscreen driving it) — the synthetic tests could only confirm that *our
own* JS decision logic ran correctly, never that the browser had actually
stopped doing its own thing on top of it. This is the same category of gap
called out in the "Setup note" above (headless can't reproduce native
touch-claiming behavior), just one layer deeper: it also can't disprove a
*fix* for that behavior, only prove the JS side of it.

**Fix**: added `e.preventDefault()` in both the `pointerdown` and
`pointermove` handlers (touch/pen only, guarded by `e.cancelable`), on top
of the existing `touch-action:none` CSS — belt-and-suspenders, not a
replacement. `preventDefault()` on a pointer event is the spec-guaranteed,
authoritative way to cancel a default action outright; `touch-action` is
closer to a browser hint about pan/zoom gesture handling, and apparently
doesn't reliably extend to a native form control's own default action (its
built-in touch-drag/tap-to-jump behavior) on every browser. Both are worth
keeping: `touch-action:none` communicates intent declaratively and may
matter for browsers/versions where it *is* sufficient on its own, while
`preventDefault()` is what actually closed the gap on the device this was
tested against.

**Lesson for future work in this file on native-control touch behavior**:
don't treat `touch-action` as sufficient proof that a browser's own default
handling is fully suppressed, even once `getComputedStyle` confirms the
property applied — verify the actual *visible behavior* on a real device,
since a synthetic Playwright `PointerEvent` test can only confirm your own
JS ran, never that the browser didn't *also* do something on top of it.
`preventDefault()` inside the same touch-gated handler is the safer default
to reach for whenever a fix depends on suppressing a native control's touch
behavior, with `touch-action` layered on as a declarative hint rather than
the sole mechanism.

### Conclusive finding: neither `touch-action:none` nor `preventDefault()` actually works here — fixed with a touch-catcher overlay instead

Further on-device testing (same Samsung Galaxy S23 / Android Chrome, same
remote-debugging workflow) disproved the "lesson" above outright, not just
refined it. With `touch-action:none` confirmed applied
(`getComputedStyle(...).touchAction === "none"`) *and* `preventDefault()`
confirmed genuinely invoked — instrumenting `Event.prototype.preventDefault`
showed it firing once on `pointerdown` and repeatedly on every
`pointermove` during a real drag, against an event that itself reported
`cancelable: true` — the slider still visibly dragged **and** the page
still scrolled, simultaneously, exactly as before either fix. This rules
out every explanation short of the real one: on this browser, a native
`<input type=range>`'s own touch-drag/tap-to-jump is a default action that
is simply not governed by `touch-action` or cancelable by
`preventDefault()`, at the API level, at all. No amount of "make sure it's
*really* being called" debugging was going to close this gap, because the
gap isn't in this file's own code — both mechanisms were firing exactly as
documented and the native behavior still won.

**Fix: stop trying to suppress the native default action, and instead make
sure the real `<input>` never receives the touch that would trigger it.**
`setupRangeTouchCatchers()` (in both files, runs once at boot) wraps every
`input[type=range]` in a `<span class="range-touch-wrap">` and inserts an
absolutely-positioned, transparent `<div class="range-touch-catcher">`
sibling directly on top of it (`position:absolute;inset:0;z-index:1`),
storing a direct JS reference to the real input on the catcher element
(`catcher._rangeInput = input`, a plain property, not a DOM attribute).
The catcher is `pointer-events:none` by default and flips to
`pointer-events:auto` only inside `@media(pointer:coarse)` — i.e. only on a
touch-primary device does the catcher actually sit in the hit-testing path
at all; on an ordinary mouse-only desktop it's inert and every click goes
straight through to the real input exactly as before this change (verified:
`getComputedStyle` shows `pointer-events:none` and `(pointer:coarse)`
false in a plain desktop-viewport Playwright page with no `hasTouch`).

This is a fundamentally different, and much stronger, kind of fix than the
previous round: it doesn't ask an API to cancel a default action after the
fact, it structurally prevents the action's own triggering element from
ever being touched in the first place. A browser can't run a native
range-input touch-drag on an element that never received the touch — there
is no equivalent "but what if the browser ignores this too" risk the way
there was with `touch-action`/`preventDefault()`, because the mechanism
being relied on this time (CSS hit-testing via `pointer-events` and
`z-index`) is not the same category of thing as a default-action
suppression API; it's just normal DOM layering.

- **The catcher's own `touch-action` is `pan-y`, not `none`.** A plain
  `<div>` has no native default action worth suppressing (unlike the
  native range input), so there's nothing to fight: `pan-y` lets the
  browser's own compositor-thread scrolling handle a vertical gesture
  entirely natively (smooth, real momentum, zero JS), while still
  forbidding the catcher's default handling of anything else — so a
  horizontal drag has no competing native behavior, and the same
  `valueFromPointerX`/`setSliderValue`/drag-vs-scroll-threshold logic from
  the earlier round now runs unopposed instead of racing the browser. This
  also sidesteps the earlier "`touch-action` can't be flipped mid-gesture"
  problem entirely — it's never flipped, because native scrolling is now
  doing the *entire* scroll side of the decision, not just the part after
  JS gives up.
- **`resolveRangeTarget(e)`** distinguishes the catcher path (`e.target` is
  a `.range-touch-catcher`, resolved to its `_rangeInput`) from a fallback
  direct-input path (`e.target` is the real `<input type=range>` itself —
  an older browser without `pointer` media-feature support, or any gap in
  a catcher's sizing). The fallback path keeps the previous round's
  touch-action:none + `preventDefault()` + manual-scroll logic verbatim —
  belt-and-suspenders, not load-bearing, since the catcher is what actually
  carries the fix on the device this was validated against.
- **Mouse must not be silently swallowed on a coarse-pointer device.** CSS
  `pointer-events` doesn't filter by pointer type — only by whether the
  *device* matches `(pointer:coarse)` — so a touch-capable device that also
  has a mouse plugged in (a touchscreen laptop, say) would have mouse
  clicks land on the now-`pointer-events:auto` catcher too, not the real
  input underneath. The `pointerdown` handler therefore only gates on
  `isTouchLike(e)` for the **fallback** (direct-input) path — a mouse there
  is left untouched, since there's a real native input right there to drag
  natively. For the **catcher** path, every pointer type is handled
  (`if (!target.viaCatcher && !isTouchLike(e)) return;` — note the
  `viaCatcher` short-circuit), since the catcher isn't a form control and
  has no native fallback behavior of its own to fall back to. This was
  caught by a Playwright regression, not on-device: a synthetic mouse drag
  aimed at the real input silently did nothing once the catcher started
  intercepting mouse events too, on an emulated `hasTouch:true` page.
- **Testing note**: this design is actually verifiable in headless
  Playwright, unlike the previous round's fix — `newPage({ hasTouch: true
  })` makes `(pointer:coarse)` evaluate `true`, so a synthetic
  `PointerEvent({pointerType:'touch'})` dispatched at the catcher exercises
  the exact code path a real phone would. This doesn't contradict the
  "headless can't reproduce native touch-claiming behavior" lesson from the
  previous round — it's true for exactly the reason that lesson predicts:
  the fix no longer depends on suppressing a browser's native default
  action (the thing headless Chromium can't be trusted to model faithfully
  for a form control), it depends on ordinary CSS hit-testing and DOM
  event dispatch, which headless Chromium models exactly like any other
  browser. A `hasTouch:false` desktop-viewport page (no `hasTouch` in
  `newPage()`) is what verifies the *other* half — that the catcher is
  inert and mouse behavior is completely unaffected on an ordinary desktop.
- **Verified**: `npm test`; a syntax check of both files; Playwright, both
  files: a vertical `PointerEvent('touch')` drag on the catcher scrolls the
  page and leaves the slider's value unchanged; a horizontal one changes
  the value; a tap with no movement jumps the value to the tapped position;
  a synthetic mouse drag on a `hasTouch:true` (coarse-pointer) page changes
  the value via the catcher's own JS handling; a synthetic mouse drag on a
  plain desktop-viewport (`hasTouch` unset, fine-pointer) page confirms the
  catcher is `pointer-events:none` and `(pointer:coarse)` doesn't match, so
  the click reaches the real input exactly as before this feature existed;
  no horizontal overflow at mobile width in either theme. **Confirmed
  working on the actual S23** (Android Chrome, via `raw.githack.com`,
  checked visually rather than via console diagnostics this time): an
  intentional vertical swipe over a slider scrolls the page cleanly with no
  knob movement, and an intentional horizontal drag moves the slider
  without scrolling the page. Unlike the previous two rounds — each
  confirmed via on-device diagnostics only to be disproven by the *next*
  round of real usage — this is the first version of this fix where the
  actual reported complaint ("clicking anywhere on the bar immediately
  moves the knob") no longer reproduces on the device it was originally
  reported from. Treat the touch-catcher-overlay pattern established here
  as the correct approach for any future native-form-control touch-
  suppression need in this file — not `touch-action`/`preventDefault()`
  alone, which this whole investigation showed cannot be trusted to
  suppress a native control's own default action on every browser.

## Chart controls split into a primary View toggle + view-dependent sub-controls; dollar-mode dropdown; quieter top disclaimer

Three UX-review items implemented together on branch
`chart-controls-and-header-cleanup` (off `home-screen-redesign`), none of
which touch `simulate()`/`simulateHistorical()`/`state`/`defaults`/
`normalizeState()` — all three are display/markup-and-event-wiring changes
layered on top of state that already existed.

- **Chart controls (`chartView`, `CHART_GROUPS`, `lastProjectionView`)**:
  the previous single row of 5 buttons (`±3 yrs | ±1 yr | Real CAGR 0–7% |
  Historical (S&P 500) | Monte Carlo`) read as a control panel, not a
  chart. `chartView`'s underlying values (`'3yr'`, `'1yr'`, `'cagr'`,
  `'hist'`, `'mc'`) are **unchanged** — every downstream consumer
  (`renderChartView()`'s branching, the `['3yr','1yr','cagr'].includes
  (chartView)` check, `snapshotForUndo`) needed zero changes. What changed
  is purely the button markup and the functions that manage button
  active-state:
  - A new primary `#chartGroupToggle` (`Projection | Historical | Monte
    Carlo`) sits where the old 5-button row was. A `const CHART_GROUPS =
    {'3yr':'projection','1yr':'projection',cagr:'projection',hist:'hist',
    mc:'mc'}` map (declared once, next to the `chartView`/`mode`/etc.
    state-variable block) is the single source of truth for which group a
    given `chartView` value belongs to.
  - A new `#projectionSubToggle` row (`±1 yr | ±3 yrs | CAGR` — reordered
    per the review, and "CAGR" shortened from "Real CAGR 0–7%" since the
    range is still explained in the chart's own note/axis) holds the same
    three `chartView3Btn`/`chartView1Btn`/`chartViewCagrBtn` buttons as
    before, just moved into their own `<div>`, hidden/shown by
    `setChartView()` based on `CHART_GROUPS[chartView] === 'projection'`.
  - The pre-existing `#mcPathCountRow` (500/1,000/2,000 paths) is
    unchanged — it already only showed for `chartView === 'mc'`, which is
    exactly the "Monte Carlo" group; item 9 just moved it conceptually
    under the new Monte Carlo group button rather than under a "Monte
    Carlo" item in a flat 5-button row.
  - `lastProjectionView` (defaults to `'3yr'`, i.e. `chartView`'s own
    initial value) remembers which of the three projection sub-views was
    last active. Clicking the group-level "Projection" button calls
    `setChartView(lastProjectionView)` rather than a hardcoded default, so
    switching to Historical/Monte Carlo and back restores exactly where
    you left off. It's updated inside `setChartView()` itself
    (`if (CHART_GROUPS[next] === 'projection') lastProjectionView =
    next;`), not at the three click-handler call sites, so any future new
    call site that sets a projection sub-view can't forget to update it.
  - `setChartView()` now does three things instead of two: (1) updates the
    three sub-view buttons' active/aria-checked state (only meaningful
    while a projection view is selected, but harmless to update
    unconditionally — the row is hidden when not relevant), (2) updates the
    three group-level buttons' active/aria-checked state from
    `CHART_GROUPS[next]`, (3) toggles `#projectionSubToggle`'s `hidden`.
    `#mcPathCountRow`'s `hidden` is still set from inside `renderChartView()`
    (called every `render()`), not from `setChartView()` — left as-is since
    it already worked and there was no reason to duplicate that toggle in
    a second place.
  - Like `logScale`/`mcPathCount`/`chartView` itself, `lastProjectionView`
    is a plain module-level `let`, not part of `state`/`defaults`/
    `normalizeState()`/scenario export — it's chart-display state, not a
    plan input, same reasoning as everything else in that list.
- **Dollar-mode dropdown (`#dollarModeDd`/`#dollarModeBtn`/
  `#dollarModePanel`)**: replaces the topbar's `.view-toggle`
  segmented-button pair (`Real $` / `Nominal $`) with a button reading
  "2026 dollars ▾" (real) or "Future dollars ▾" (nominal) that opens a
  small absolutely-positioned panel with two labeled options ("Real
  dollars" / "Future dollars", each with a one-line explanation and a
  radio-style dot). The underlying `mode` state (`'real'`/`'nominal'`) and
  `setMode(next)` are **unchanged** in what they do to `state`/`render()`/
  `saveInputs()` — the same `#realBtn`/`#nominalBtn` element ids are
  reused (now living inside `#dollarModePanel` instead of a `.view-toggle`
  div), so every existing call site that toggles their `.active`/
  `aria-checked` state, plus the CSV/print-report code that reads `mode`,
  needed no changes. `setMode()` gained exactly one new line
  (`document.getElementById('dollarModeBtn').textContent = mode ===
  'real' ? '2026 dollars ▾' : 'Future dollars ▾'`).
  - The panel's own open/close state is managed by a small self-invoking
    `setupDollarModeDropdown()` IIFE (registered once, alongside the other
    click listeners): click the button to toggle `panel.hidden`; a
    document-level `click` listener closes it on any click outside
    `#dollarModeDd`; a document-level `keydown` listener closes it on
    Escape; and `#realBtn`/`#nominalBtn` each get their own `click`
    listener (in addition to the existing `setMode(...)` ones) that just
    closes the panel — a plain state change shouldn't leave the popover
    open. This mirrors the wizard modal's own outside-click/Escape pattern
    rather than inventing a new one.
  - The panel is `position:absolute` off a `position:relative` wrapper
    (`.dollar-mode-dd`), `z-index:30`, anchored `right:0` so it never
    overflows past the topbar's right edge regardless of viewport width —
    verified at 390px mobile width with the panel open, no horizontal
    scroll introduced. It's nested inside `.topbar` (itself `position:
    sticky;z-index:20`), which is an intentionally *lower* z-index — the
    panel only ever needs to stack above its own topbar siblings, never
    above anything else on the page, so no z-index arms race with the
    existing sticky stack (Plan Status Bar, mobile tabs, etc.) was needed.
  - New `.btn-card`-styled `#dollarModeBtn` reuses the existing
    theme-aware `.btn-card` class (see "Accessibility pass" above — the
    rule of thumb there: `.reset` is topbar-only dark-on-dark, `.btn-card`
    is for anything that needs to read correctly against a themed
    background) rather than introducing a fourth button style, even though
    it sits on the (always-dark) topbar — the button itself is fine either
    way since the topbar's background is fixed, and reusing `.btn-card`
    keeps one fewer button style to maintain.
- **Quiet top disclaimer + Limitations & disclaimer callout**: the old
  `.top-disclaimer` (`⚠ Planning estimate only — not tax, investment, or
  legal advice. This tool was built with AI assistance (Claude) and may
  contain mistakes; verify all figures independently before making
  financial decisions.`) is now `.top-disclaimer.quiet`, showing just
  "Planning estimate" plus a `<button class="link-btn" id=
  "disclaimerLinkBtn">· Learn about limitations</button>". The full text
  moved into a new `<div class="callout full" id="limitationsCallout">` as
  the **first** child of `#methodologyCard`'s `.assumptions` div (ahead of
  "How the model works"), so it's the first thing read once that section
  is expanded.
  - `#disclaimerLinkBtn`'s click handler opens `#methodologyCard` (`card.
    open = true` — a plain boolean property on a `<details>` element, no
    toggle-event dance needed), calls the existing `switchToDashboardTab()`
    helper first (since `#methodologyCard` lives inside `.content`, which
    is Dashboard-tab-only on mobile — same reasoning as every `kind:'open'`
    decision-question button), then inside a `requestAnimationFrame`
    (letting the `card.open = true` reflow settle first, same pattern used
    elsewhere for post-layout scrolling) calls `scrollIntoView({behavior:
    'smooth', block:'start'})` and applies the existing `.flash-highlight`
    treatment to `#limitationsCallout` for 2.6s (same duration as the
    estimated-fields guided-review's highlight, for the same reason: give
    someone long enough to actually notice it, not just the original
    1.2s). `.flash-highlight` previously only had CSS rules for
    `.field`/`.range-field`/`.metrics` — a new `.callout.flash-highlight`
    rule (added alongside the existing ones, same box-shadow/transition)
    was needed since a `<div class="callout">` wasn't a target the
    existing rule covered.
  - Shrinking `.top-disclaimer` did **not** need any change to
    `syncPanelMaxHeight()`/`syncTopbarHeight()`/`syncPlanStatusOffsets()` —
    all three already measure `.top-disclaimer`'s real `offsetHeight` at
    runtime rather than a hardcoded pixel value (see "Sidebar height"
    above), so the shorter banner's height flows through automatically.
    Verified this holds under a real scroll gesture (`page.mouse.wheel()`),
    not just an overflow check, per this file's own testing-checklist
    lesson: after scrolling, the Plan Status Bar / mobile tabs / search box
    stack sub-pixel-flush with no gap or overlap, in both files, matching
    the pre-existing sticky-stack behavior documented under "Mobile bug:
    gap between the Plan Status Bar and the Inputs/Dashboard tabs."
  - `.top-disclaimer`'s dark background (`#3a2a0f`) is unchanged; the new
    `.link-btn` inside it is styled with the same `#f3d38a` text color as
    the rest of the banner (underlined, so it reads as a link against the
    dark background) via a `.top-disclaimer .link-btn` override, while a
    theme-aware plain `.link-btn` rule (using `var(--blue)`) exists for any
    future reuse of the same class outside the disclaimer.
- All three items were ported to both `Planner_US.html` and
  `Planner_Canada.html` — the relevant markup, CSS, and JS
  (`setChartView`/`setMode`/the state-variable block/the event-listener
  registrations) are structurally identical between the two files for this
  particular surface (unlike, say, the tax-bracket logic), so this was a
  straightforward like-for-like port with matching element ids in both
  files.

### Follow-up fix, same round: both sub-rows stayed visually visible in every view — another `[hidden]` vs. an author `display` rule trap

Real-world bug report right after the above shipped: "the 1/3/cagr and
500/1000/2000 are still visible under historical, 1/3/cagr visible under
monte carlo, and 500/1000/2000 under projection" — i.e. `setChartView()`
was toggling both `#projectionSubToggle.hidden` and (via `renderChartView()`)
`#mcPathCountRow.hidden` correctly, but neither row actually disappeared in
any state.

- **Root cause, confirmed with `getComputedStyle()` rather than just
  reasoning about it**: `document.getElementById(...).hidden` was flipping
  correctly, but `getComputedStyle(...).display` stayed `'flex'`
  regardless. This is **the exact same bug class already documented above**
  under "Undo toast for Reset and Load scenario" (`.undo-toast[hidden]`)
  and "Step 2 rendered stacked under Step 1" (`#wizardStep2[hidden]`): the
  browser's own `[hidden]{display:none}` UA-stylesheet rule is only a
  *user-agent normal* declaration, and any *author* `display` declaration —
  whether from a class selector or an inline `style=""` attribute — outranks
  it in the CSS cascade regardless of selector specificity (author-normal
  beats user-agent-normal as a whole cascade *origin*, before specificity
  is even compared). `#projectionSubToggle` carries the `.chart-view-toggle`
  class (`display:flex` from an author stylesheet rule); `#mcPathCountRow`
  carries an inline `style="display:flex;..."` (inline is also "author
  normal," just with very high specificity within that bucket) — either
  way, both outrank `[hidden]`'s UA-normal `display:none`, so the elements
  never actually hid, no matter how correctly the JS was toggling the
  `hidden` property/attribute.
- **Fix**: `#projectionSubToggle[hidden],#mcPathCountRow[hidden]{display:
  none!important}`, added right after the `.chart-view-toggle` rule in both
  files. An author `!important` declaration is a higher-priority cascade
  origin than plain author-normal (which is what both the class rule and
  the inline style are), so this beats them regardless of selector
  specificity or the inline style's own high specificity — the same
  mechanism that made `.undo-toast[hidden]{display:none}` and
  `#wizardStep2[hidden]{display:none}` work as fixes earlier in this file.
- **Verified** by reading `getComputedStyle(...).display` (not just the
  `hidden` property, which was never the part that was actually broken)
  through all four view combinations in both files: Projection shows only
  the projection sub-row (`flex`/`none`), Historical shows neither
  (`none`/`none`), Monte Carlo shows only the path-count row (`none`/
  `flex`), and back to Projection restores the projection row. `npm test`,
  a syntax check of both files, and the full existing Playwright sweep for
  this round of changes all still pass.
- **Lesson reinforced**: whenever a *new* element gets both a `hidden`
  toggle and some other author-level `display` declaration (a class or an
  inline style), check `getComputedStyle().display` after toggling it, not
  just the `hidden` property/attribute value — the property/attribute can
  read correctly while the visual result is completely unaffected, exactly
  as it was here. This file already had two prior instances of this exact
  trap; a third slipping through in the same session that just fixed a
  header-cleanup round is a sign this check belongs in the standard
  post-change verification whenever a new `hidden`-toggled element is added
  in this codebase, not just something to remember after the fact.

## "Explore a question" inline delta previews

Each of the 6 `kind:'compare'` `DECISION_QUESTIONS` buttons (not the 2
`kind:'open'` ones, `sensitivity`/`returns` — there's no two-scenario
comparison to summarize for those) now shows a compact one-line delta right
on the button itself, e.g. `Own → Rent: -$257.1K end assets · lasts to age
72`, so the gist of the answer is visible at a glance without clicking in
first — the click still reveals the full sentence + comparison table as
before, unchanged.

- **`compactDecisionDelta(rows)`** (defined right after `decisionDeltaPhrase`,
  both files) reuses `rows[0]`/`rows.at(-1)` — the two most extreme rows a
  question's own `run()` already returns (for a 2-row question that's just
  both rows; for a 3-row question like `retireTiming`/`ssTiming` it skips
  the middle "current" row and shows the full swing between the two
  endpoints) — and formats them against the same `decisionEndAssets()`/
  `depletedAge` data `decisionDeltaPhrase()`/`renderDecisionCompareTable()`
  already use. This is deliberate: the preview and the full detail it
  expands into are reading the exact same numbers, so they can never
  disagree with each other. `stripCurrent()` trims only a trailing
  `" (current)"` annotation some labels carry (not any parenthetical —
  `rothLadder`'s/`meltdownEnabled`'s window-and-bracket detail is
  substantive and stays) since that tag is redundant noise once shown as
  a bare `A → B` on a button.
- **Deliberately does not show a success-rate delta** (a "+6pts"-style
  number, which was the original suggestion this feature came from) — that
  would need a full historical backtest (`runHistoricalCycles()`) per
  question, and the entire reason the Plan Status Bar's own backtest is
  debounced 500ms (see "Plan status bar" above) is that it's too expensive
  to run casually. End-assets and depletion age are already produced as a
  side effect of `run()`'s normal `simulate()` calls, so this preview costs
  nothing beyond what `run()` already does.
- **Lazily computed, same pattern as the tornado/Roth-optimizer/Sankey
  cards**: `renderDecisionQuestionPreviews()` (iterates `DECISION_QUESTIONS`,
  skips `kind:'open'`, writes into each button's `.q-delta` span) only runs
  while `#decisionCard` is expanded — gated both by a `render()` call
  (`if (document.getElementById('decisionCard').open)
  renderDecisionQuestionPreviews()`, right after the sensitivity/Roth/Sankey
  equivalents) and by `#decisionCard`'s own `toggle` listener (so expanding
  it populates the previews immediately, not just on the next unrelated
  edit). Up to 6 questions × 2-3 `simulate()` calls each is cheap
  individually but pointless work on every keystroke while the card is
  collapsed and invisible — same reasoning as those three cards.
- **Markup**: each compare-kind button's existing `.q-title`/`.q-desc` spans
  gained a third `<span class="q-delta" aria-hidden="true"></span>` (empty
  until `renderDecisionQuestionPreviews()` first runs). `aria-hidden` since
  the full sentence a screen-reader user reaches by actually clicking the
  button already says the same thing, just in prose rather than an
  abbreviated `A → B: delta` shorthand — the preview is a sighted-glance
  affordance, not new information. `.q-delta:empty{display:none}` keeps a
  not-yet-computed (or `kind:'open'`, which never gets one) button's layout
  identical to before this feature, rather than reserving dead space for a
  line that isn't there.
- Ported identically to both files — `DECISION_QUESTIONS`' shape (`run()`
  returning `{rows, sentence}`), `decisionEndAssets()`/`decisionDepletionLabel()`,
  and the button markup are already structurally identical between US and
  Canada for this surface (only the underlying `run()` bodies differ, e.g.
  `rothConvEnabled` vs. `meltdownEnabled` — irrelevant to
  `compactDecisionDelta()`, which only ever looks at the `rows` it's handed).
- **Verified**: `npm test`; a syntax check of both files; Playwright, both
  files — deltas are empty before `#decisionCard` is expanded, populate for
  all 6 compare buttons (and stay absent for `sensitivity`/`returns`) the
  moment it's expanded, update live after an input edit while the card
  stays open, survive a collapse/re-expand cycle, and clicking through to
  the full answer still works exactly as before; no horizontal overflow at
  either desktop or 390×844 mobile width, light or dark theme (screenshots
  confirm clean wrapping on mobile card width).

## Wizard bug: Step 2 opened scrolled to the bottom

Real-world bug report: clicking "Next" at the bottom of wizard Step 1 left
Step 2 rendered already scrolled all the way down, instead of starting at
its own top.

- **Root cause**: `#wizardModal` (not `#wizardStep1`/`#wizardStep2`
  individually) is the actual scrolling container — `overflow:auto` lives
  on the modal itself, and it's one persistent DOM element shared across
  both steps, toggled via `#wizardStep1`/`#wizardStep2`'s own `hidden`
  attribute rather than being torn down and recreated. Its `scrollTop`
  therefore carries straight over from whichever step was showing before.
  Step 1 is long, and the Next button sits at the very bottom of it, so the
  common path (scroll down to find Next, click it) leaves the modal's
  `scrollTop` near its maximum right as Step 2 becomes visible — Step 2
  then renders starting from that same scroll position, which for a
  shorter Step 2 can mean at or near its bottom.
- **Fix**: `renderWizardStep()` (called on open, Next, and Back — the
  single choke point for every step transition) now resets
  `document.getElementById('wizardModal').scrollTop = 0` every time it
  runs, right after the `hidden`/title/button-visibility updates. Resetting
  unconditionally (rather than only on the Next path) also fixes the
  reverse case for free: scrolling down on Step 2 and clicking "Back" used
  to leave Step 1 scrolled down too.
- **Verified**: `npm test`; a syntax check of both files; Playwright, both
  files — scroll the modal to the bottom on Step 1, click Next, confirm
  `scrollTop` is `0` on Step 2; scroll to the bottom on Step 2, click Back,
  confirm `scrollTop` is `0` back on Step 1.

## Surfacing unusual/important assumptions (`UNUSUAL_RANGES`, `.unusual-banner`, `#unusualToast`)

The last of the original ChatGPT-sourced UX suggestions not yet built. This
is a **second, independent layer** on top of the "Estimated" field badges
above — deliberately not merged into that feature, because the two flag
genuinely different things:

- The estimated-fields rollup flags a **personal fact** still sitting at
  its meaningless placeholder default (income, balances, ages) — the
  default itself is never wrong, it just isn't *this person's* number yet.
- This feature flags a **modeling assumption** whose current value —
  default or hand-typed, doesn't matter — sits outside a realistic
  real-world range. A 15% investment return or a 0% inflation rate are
  both allowed by the field's own wide HTML `min`/`max` (e.g. `returnRate`
  is `min="-10" max="20"` — nothing stops a browser from accepting either
  extreme), but neither is a sane planning assumption.

**Scope, decided with the user before writing any code** (three explicit
choices, each with a rejected alternative):
1. "Unusual" = **outside a curated realistic range** per field, not
   "far from this app's shipped default" (the latter would just be a
   second `markDefaultFields()`/`.is-default`, not a new signal).
2. "Important" = **quantify the impact** of the flagged value by comparing
   the current plan against the same plan with just that one field nudged
   back to the nearer edge of its realistic range — reusing the
   `SENSITIVITY_LEVERS`/`decisionDeltaPhrase()` mutate-simulate-restore
   idiom and wording (not a fixed hand-picked "these 3 assumptions always
   matter" list, and not literally pulling from `SENSITIVITY_LEVERS`
   itself, since most of the flaggable fields — `lifeExpectancyA/B`,
   `incomeGrowth`, `propertyTaxGrowth`, `homeInsuranceGrowth`,
   `rentGrowth`, `mortgageRate`, `bondYears` — have no matching lever in
   that array to begin with).
3. Placement is a **dashboard callout**, shown only while something is
   actually flagged (never an empty "0 unusual assumptions" card), easy to
   dismiss per-field, plus a brief pop-up toast so a person working
   elsewhere on the dashboard (or the Inputs tab, on mobile) still finds
   out about a *newly* flagged value — but a dismissal must **not**
   re-trigger just because the same field moves from one unusual value to
   a different unusual one.

**`UNUSUAL_RANGES`** — a flat array of `{ id, label, unit, min, max,
applicable? }`, reusing exactly the field-id set the estimated-fields spec
already classified as "Assumption, never counted" (`lifeExpectancyA/B`,
`incomeGrowth`, `inflation`, `bondYears`, `returnRate`, `bondReturn`,
`hysaRate`, `homeGrowth`, `propertyTaxGrowth`, `homeInsuranceGrowth`,
`rentGrowth`) plus `mortgageRate`, which that spec didn't need to classify.
Ages/retirement ages are **deliberately excluded** — this is a FIRE app, so
a 35-year-old retirement age is the expected case for a real slice of
users, not something to nag about; flagging it would undermine the exact
audience the tool is for. `propertyTaxGrowth`/`homeInsuranceGrowth`/
`mortgageRate` are gated on `state.tenure !== 'rent'` and `rentGrowth` on
`state.tenure !== 'own'` (both apply during `'rentThenBuy'`, since that
transition uses both halves at different points); `lifeExpectancyB` is
gated on `!state.singlePerson`. Field ids and every range value are
identical between `Planner_US.html`/`Planner_Canada.html` — no
US/Canada divergence was needed for this feature, unlike most of this
file's other US-vs-Canada notes.

**`computeUnusualAssumptions()`** filters `UNUSUAL_RANGES` down to
currently-out-of-range, not-dismissed items. It has one deliberate side
effect: the moment a field's value moves back **inside** its range, its id
is spliced out of `state.dismissedUnusualAssumptions` right there, rather
than waiting for a dedicated "un-dismiss" pass — so a *future* move back
out of range is treated as a fresh flag. This is the mechanism behind the
explicit "don't re-nag for a different unusual value on the same field"
requirement: dismissal is keyed to the field being out-of-range at all, not
to the exact value that was dismissed, and it only clears when the
value genuinely becomes normal again. This is the opposite of
`dismissedEstimates`'s own auto-undismiss rule (which clears on *any* edit,
regardless of the new value) — the two dismiss arrays look similar but
intentionally behave differently, matching what each feature is actually
guarding against.

**`unusualAssumptionImpact(item, currentSim)`** mutates `state[item.id]` to
the nearer range edge, re-runs `simulate()`, restores the field, and hands
both sims to the existing `decisionDeltaPhrase(fromSim, toSim)` helper
("Explore a question" already built) to get a ready-made sentence — "using
a typical value adds/costs $X in end assets[, and moves your depletion
point from A to B]" — rather than inventing a second delta phrasing that
could drift out of sync with the one "Explore a question" already uses.

**The toast (`#unusualToast`)** exists because the callout itself
(`#unusualAssumptionsBanner`, inside `.content`) is easy to miss if the
person is scrolled elsewhere on the Dashboard, or on the Inputs tab on
mobile. It's `position:fixed` (reusing the `.undo-toast` class/positioning,
offset above it via `#unusualToast{bottom:96px}` so the two never overlap
if both happen to be visible at once), so it's visible regardless of
scroll position or which mobile tab is active — same reasoning as
`#reviewNav`. It fires **only for newly-flagged items**
(`previousUnusualIds`, an in-memory `Set`, not persisted — compared each
render) and **never for the very first render** (`unusualToastArmed`),
so loading a saved plan with an already-unusual assumption never pops an
unsolicited toast the instant the page settles — only a value that
becomes newly unusual *during* the session does. It also skips a field
that's currently `document.activeElement` — if the person is mid-typing
into the very field that just became unusual, they're already looking
right at it, so a toast announcing it would be pure noise on top of what
they can already see; the toast is for a value that turns unusual as a
side effect while attention is elsewhere. Auto-dismisses after 8s or on
its own ✕/Review buttons.

**`jumpToUnusualField(id)`** is a near-duplicate of the existing
`jumpToEstimateField()` (open the field's group, land it ~30% down the
viewport, 2.6s flash-highlight, focus) with no `reviewingFieldId`-style
guided-review state to track — deliberately kept as its own small function
rather than sharing one with the estimated-fields feature, per this file's
own "`simulate()`/`simulateHistorical()` duplication trap" reasoning: two
independently-evolving features are safer kept separate than coupled
through a shared helper that either one might need to change out from
under the other later.

**Not done here**: no MCP tool schema change (`dismissedUnusualAssumptions`
is left out of `update_fire_assumptions`'s allow-list for the same reason
`dismissedEstimates` was — `loans`, an existing array field, isn't in that
allow-list either, so this stays consistent); no change to `ids`,
`normalizeState()`'s other fields, `simulate()`/`simulateHistorical()`, or
the sensitivity/tornado chart — this reuses their existing outputs without
touching either function's own internals.

**Verified**: `npm test`; a syntax check of both files; Playwright, both
files — the banner and toast are both hidden at boot; setting `returnRate`
to 18% (outside the flagged range) shows the banner with the impact
sentence and pops the toast (once attention is simulated as elsewhere, not
mid-edit on that exact field); nudging the same still-out-of-range field to
a different unusual value re-triggers neither the toast nor a new list
entry; dismissing the item removes it from the list and it stays dismissed
across further edits to other unusual values on that same field; returning
the value to a realistic number clears the banner and the dismissal
silently; pushing it out of range again afterward re-flags it as a fresh
item and re-pops the toast; the dismissal survives a real page reload
(`localStorage`); clicking either the toast's "Review →" button or a
banner item's own inline link opens the field's sidebar group, focuses it,
and applies the flash-highlight; no horizontal overflow at 390×844 mobile
width with the banner visible, in either theme.

### Follow-up: a third, Inputs-side layer — live field marker + blur-gated note

Real-world feedback: the toast/banner above are effectively Dashboard-
oriented signals — the toast is a one-shot pop-up and the banner lives in
`.content` (invisible on the mobile Inputs tab) — so a person could type an
unusual value directly into the sidebar and see nothing at all until they
happened to look at the Dashboard. The person's own request, verbatim: they
didn't notice a toast after setting `returnRate` to 20% and `inflation` to
0% back-to-back — only saw it once on the Dashboard — and reasoned through
the fix themselves: warning shouldn't fire the instant a value changes
(too naggy while still typing/dragging), firing on "navigating away from
the field" is the right moment, *except* for whichever field is the very
last one edited, since a blur may never happen for it.

That last caveat is exactly why this is a **third, independent layer**
rather than a tweak to the toast: a passive, always-current visual marker
right on the field itself, updated on every `render()` (same cadence as
`markDefaultFields()`'s amber dot) — so even the last field edited, with no
blur ever occurring, is correctly marked the instant its value goes out of
range. A second, separate mechanism — a brief "Unusual value" note — is
blur-gated per the person's own reasoning, since that part genuinely
shouldn't interrupt live typing/dragging.

- **`markUnusualFields(flaggedIds)`** (both files) walks `UNUSUAL_RANGES`
  and toggles a plain `.unusual-value` class on each field's `.field`/
  `.range-field` wrapper — `flaggedIds` is the same `Set` of currently-
  flagged-and-not-dismissed ids `renderUnusualAssumptions()` already
  computes via `computeUnusualAssumptions()`, so there's no second range
  check to keep in sync; `renderUnusualAssumptions()` calls it once, before
  its own early-return for "nothing flagged" (so the marker set correctly
  clears to empty in that case too, not just when something's flagged).
  CSS: `.unusual-value>input,>select` get a red border + inset box-shadow,
  a `.range-field.unusual-value input[type=range]` gets the same box-shadow
  (a native range track has no border to color), and both variants get a
  red underline on the field's own `<label>` — deliberately two visual
  treatments at once (border + underline), not just one, since the person
  listed both as candidate options and a field that's out of realistic
  range is worth making hard to miss.
- **The "Unusual value" note is the one blur-gated piece.** A single
  delegated `document.addEventListener('focusout', ...)` (not `blur`,
  which doesn't bubble) checks whether the event's target is one of the
  `UNUSUAL_RANGES` ids and is currently flagged, and if so injects (or
  reuses) a `.unusual-field-note` div right inside that field's wrapper,
  showing it via a `.show` class for 3s. This only fires once focus
  actually leaves the field — exactly the "navigating away" trigger the
  person asked for — so it never interrupts someone still typing or
  dragging a slider. Delegated on `document` rather than wired per-field,
  so no per-field listener registration is needed as `UNUSUAL_RANGES`
  grows.
- **Why the live marker (not the note) is what actually closes the "last
  field, never navigates away" gap**: the marker doesn't wait for any
  event at all — it's recomputed from scratch on every `render()`, which
  already fires on every keystroke via the existing `ids.forEach` input
  listener. So even a field that's never blurred (the very last thing
  someone touches before closing the tab, or before clicking a totally
  unrelated button that happens to not trigger `focusout` in a way this
  cares about) is still visibly marked the instant its own value crosses
  out of range — the passive visual cue has no "did they navigate away"
  precondition; only the transient text note does.
- **Verified**: `npm test`; a syntax check of both files; Playwright, both
  files — the field marker (`.unusual-value` class present, confirmed via
  the wrapper's classList) appears immediately while a field is still
  focused/mid-edit, with the "Unusual value" note staying hidden the whole
  time; moving focus to a different field pops the note on the
  now-unfocused, still-unusual field; nudging an already-flagged,
  currently-unfocused field to a *different* unusual value leaves the
  marker correctly still present (no flicker/clear); returning the value to
  a realistic number while still focused clears the marker immediately,
  with no blur required; no horizontal overflow at 390×844 mobile width
  with both the marker and the note visible, in either theme. The existing
  banner/toast Playwright suite (immediately above) was also re-run
  unchanged and still passes in full, confirming this addition didn't
  disturb that layer.

## Single-person checkbox moved from Timeline to Tax filing status / Province of residence

Real-world feedback (a tester trying the app cold): the "Single-person plan"
checkbox was hard to find, buried as the first field inside the Timeline
group alongside ages/retirement-age sliders — nothing about "Timeline"
suggests "this is where you say whether it's one person or a couple."
Moved to the first field inside `taxFilingGroup` ("Tax filing status" on
US) / the "Province of residence" group on Canada — both are short,
always-open, near-the-top groups, and singlePerson meaningfully affects tax
filing (MFJ vs. single-filer) anyway, so the pairing makes sense
conceptually too.

- **A real self-hiding bug this move would have introduced, caught before
  shipping**: `syncControls()` already had
  `document.getElementById('taxFilingGroup').hidden = !!state.singlePerson`
  — the whole group (MFJ/two-single-filers choice, the `marryLater`
  checkbox, `marriageAgeField`) is irrelevant once modeling a single
  person, so it collapses itself away. Moving the `singlePerson` checkbox
  *into* that same group without changing that line would mean checking it
  hides the entire group, including the checkbox itself — no way to uncheck
  it again from the UI. Fixed by wrapping just the three filing-status-
  specific fields in a new `<div id="filingStatusFields">` and retargeting
  the hide to that wrapper instead of `#taxFilingGroup`; the group
  `<details>` itself is never hidden anymore, only the fields inside it
  that stop being relevant. Canada has no equivalent hide-on-singlePerson
  logic for "Province of residence" (it's just the one `province` select,
  always relevant regardless of household size), so no analogous fix was
  needed there — the checkbox was simply added as that group's first field.
- **Verified with Playwright, not just visual inspection**: in both files,
  `#singlePerson` is visible on load, lives inside the correct group
  (`closest('details.group')`'s summary text), stays visible and checked
  immediately after checking it (US: with `#filingStatusFields` — not
  `#taxFilingGroup` — actually hidden), and can be unchecked again through
  a real UI click with no dead end. `npm test`, a syntax check of both
  files, and a 390×844 mobile overflow check all pass.

## Bug: US resident state (`stateTax`) never synced back into its `<select>` on scenario Load/import

Real-world bug report: "scenario files don't save the state / province tax
setting."

- **The underlying `state` object was never actually losing the value.**
  `state.stateTax` is a normal `state` field (in `defaults`, spread through
  by `normalizeState()` like everything else, and `cloneState()` —
  `JSON.parse(JSON.stringify(state))`, used by `saveScenario()` — is a full
  deep clone, not a field allow-list), so it was always present, correct,
  and round-tripping through save/export/import/autosave. The actual bug
  was one step downstream: `syncControls()` never wrote `state.stateTax`
  back into the `#stateTax` `<select>` element's `.value` anywhere. Every
  other hand-wired enum control in this file (`payFrequency`, the
  `mfjBtn`/`singleBtn` filing-status pair, `k401Type`/`iraType`/
  `pensionCoverage`, and — critically — Canada's directly analogous
  `#province` select, which already had this line) is written back inside
  `syncControls()`/`syncContributionControls()`; `#stateTax` was simply
  missing its own line, so after `loadScenario()` (or an autosave restore)
  the dropdown kept showing whatever the visitor had last picked by hand,
  even though `state.stateTax` — and every number actually computed from
  it — was already correct. This read exactly like "the state tax setting
  doesn't save," even though the save/export machinery itself had no bug.
- **Fix**: added `document.getElementById('stateTax').value = state.stateTax;`
  to `syncControls()`, immediately after the existing `payFrequency` sync
  line — the same spot, same pattern, as Canada's `#province` line.
- **Audited every other hand-wired (non-`ids`-array) `<select>`/checkbox
  control in both files** for the same "sets `state[x]` on change but is
  never written back to the DOM on load" gap, by cross-referencing every
  `addEventListener('change', ...)` registration against
  `syncControls()`/`syncContributionControls()`. `#stateTax` was the only
  gap found in either file — every other control (ACA, Roth conversion
  ladder/RRSP meltdown, survivor planning, mega backdoor, guardrails,
  bridge/other income/other loans, LTC, pension splitting, filing status,
  contribution-type toggles) already has a matching sync line.
- **Verified with Playwright, through the real UI** (not by poking
  module-scoped JS variables, which aren't exposed on `window`): picked a
  non-default `#stateTax` value, saved a named scenario via the real "Save
  current" button, changed the dropdown again, then clicked that
  scenario's real "Load" button — the `<select>`'s DOM value now correctly
  reflects the loaded value. Separately, clicked the scenario's real
  "Export" button and read the actual downloaded `.json` file (via
  Playwright's `download` event, not an in-page shortcut) to confirm
  `state.stateTax` is present and correct in the exported file. Re-ran the
  equivalent check against Canada's `#province` as a regression guard
  (already working; unaffected by this fix). `npm test`, a syntax check of
  both files, and a 390×844 mobile overflow check on both files all pass.

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
