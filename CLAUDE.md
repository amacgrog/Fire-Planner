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
  the Dashboard tab becomes visible, same as the existing charts.
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
  - The `survivor` button carries the existing `data-partner-b` attribute
    (same convention as every other partner-B-only field) so single-person
    mode hides it for free via the existing `.single-person
    [data-partner-b]{display:none!important}` rule — no new JS needed.
  - **v2 (built):** `buyVsRent` and `rothLadder` follow the same
    mutate/simulate/restore idiom as `survivor` — directly against
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
