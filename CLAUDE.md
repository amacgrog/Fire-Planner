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

## Dashboard as home: decision-card reorder + "Change assumptions" button

The plan verdict (`#planHeadlineBanner`/`#shortfallBanner` + the Plan Status
Bar) is meant to be the first thing a person sees, with "Explore a question"
(`#decisionCard`) coming *after* it as a next step once they've absorbed the
verdict — not before it, which is how the page used to read. Two constraints
made this harder than a plain DOM move:

- **Desktop must not change.** `#decisionCard` has always rendered
  full-width, above the two-column `.workspace` grid (inputs left, results
  right) — not confined to the results column. It was already a sibling of
  `#workspace` under `<main>` for exactly this reason (see the "First-run
  banner" note above for the same pattern). Moving it into `.content`
  (inside the results column) to reorder it relative to the verdict would
  have shrunk it to half-width on desktop, which nobody asked for.
- **On mobile, `#decisionCard` needed to become Dashboard-tab-only** (a
  deliberate reversal of its previous cross-tab-visible design — see the
  "Explore a question" menu note above). Now that Dashboard is the default
  tab and holds the verdict, there's no reason for the question menu to
  also appear on the Inputs tab; showing it there just duplicates content
  the person will see anyway once they switch back.

The fix uses two CSS mechanisms together, needing no JS reparenting:

1. **`#decisionCard` was physically moved later in the DOM** — from *before*
   `#workspace` to *after* it (`<main>`'s last child, right before `</main>`).
   This is what both mechanisms below depend on.
2. **`<main>` is now `display:flex;flex-direction:column`**, with
   `#decisionCard{order:-1}` as the default (desktop and the base/no-media-
   query state). Flexbox `order` reorders *painted* position without
   touching DOM position, so `#decisionCard` still paints above
   `#workspace` everywhere `order:-1` applies, even though it's now later in
   the DOM. Inside `@media(max-width:820px)`, `order` is reset to `0`
   (natural DOM order), so on mobile it paints *after* `#workspace` — i.e.
   after all Dashboard-tab content — matching the "explore a question
   *after* seeing the verdict" goal.
3. **Tab-gating via a general-sibling-combinator selector**, only possible
   because step 1 made `#decisionCard` a later sibling of `#workspace` (that
   combinator only matches forward): `#workspace[data-mobile-view="inputs"]
   ~ #decisionCard{display:none}`, scoped inside the same
   `@media(max-width:820px)` block. No JS change needed — `setMobileView()`
   already just flips the `data-mobile-view` attribute it always did.

A new `.change-assumptions-btn` (`#changeAssumptionsBtn`) sits right after
`#shortfallBanner`/`#planHeadlineBanner` in the DOM but is `display:none` by
default and only `display:inline-flex` inside the same mobile media query —
on desktop, the Inputs/Dashboard split doesn't exist, so there's nothing for
the button to switch away from. Its click handler (`setMobileView('inputs')`
+ `window.scrollTo({top:0,behavior:'smooth'})`, registered right after the
`#planStatusBar` click listener in both files) exists because switching
mobile tabs just swaps which of `.panel`/`.content` is displayed *in place*
— without the explicit scroll-to-top, someone who scrolled deep into a long
Dashboard would land partway down the (differently-sized) Inputs panel
instead of at its top.

If a future change adds another `<main>`-level sibling that needs the same
"desktop: painted first, mobile: painted last + tab-gated" treatment, follow
this same three-part pattern rather than inventing a JS-driven visibility
toggle — it's what let this ship with zero new state and zero new render-
path branching.

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
jargon-specific term lives) and, for every match, walks *every* ancestor
`<details>` open with `openAncestorDetails()` — not just the nearest one —
because a few fields (the "Spending changes" sub-group) sit inside a
`<details>` nested inside another `<details>`. Groups it opens are recorded
in a `forcedOpen` `Map` (element → its open state right before the search
touched it) so clearing the query (`input.value === ''`) restores each one
exactly, without needing to know or guess the "correct" default — a group
already open, or one the person opened themselves mid-search, is recorded
too but restores to the same open state, so it's a no-op either way. A new
field needs nothing extra to be searchable as long as it sits inside a real
`<label>` under a `.field`/`.range-field` wrapper — the search has no field
allow-list to keep in sync.

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

## Mobile swipe between Inputs/Dashboard tabs

At the same <=820px width where `.mobile-tabs` (the Inputs/Dashboard tab
switcher) appears, a `touchstart`/`touchend` pair on `#workspace` also lets
a person swipe left (→ Dashboard) or right (→ Inputs) as an alternative to
tapping the tab buttons. It requires the horizontal distance to clearly
dominate the vertical one (`abs(dx) >= abs(dy) * 1.4`) and pass a minimum
55px threshold, so ordinary vertical scrolling is never mistaken for a
tab-switch swipe. A touch that starts on `input[type="range"]` is ignored
entirely, since dragging a slider is itself a horizontal gesture on the
same touch surface and would otherwise fight with the tab swipe. This
lives right next to the existing `setMobileView`/tab-button wiring (search
for it in each file) since both control the same `workspace.dataset.mobileView`
state.

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
