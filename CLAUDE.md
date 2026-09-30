# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators
for a couple or single person — one for the US, one for Canada. Everything
(markup, CSS, and JS) lives in one `<script>` block per file; there is no build
step, no bundler, no framework, and no server. Opening the `.html` file in a
browser is the entire deployment. See `README.md` for the full user-facing
feature list.

## Files

- `Planner_US.html` / `Planner_Canada.html` — the two apps, each fully
  self-contained (~4,500–4,700 lines including the inline `<script>`).
  **Stable filenames**: never rename these or create version-numbered copies
  (`Planner_US_v2.html`, etc.) — every update is a `git commit` to the same
  file, not a rename-and-fix-links exercise.
- `index.html` — a small landing page linking to both tools.
- `tests/golden.js` — hand-verified year-by-year drawdown/compounding math
  checks, run via `npm test`. This is the only test wired into CI.
- `test_*.js` (repo root, gitignored) — ad-hoc Playwright scripts covering
  UI/feature behavior; not run by CI. Run individually with `node test_foo.js`.
- `docs/reference.md` — a much longer, chronological architecture/gotcha log
  (bug postmortems, CSS traps, the full history of specific features). Consult
  it for the deep detail behind anything summarized below before touching that
  area of the code.

## Commands

- `npm test` — runs `tests/golden.js` (requires `playwright`; `npm install`
  first if `node_modules` isn't present). Must stay exact-to-the-cent.
- `node test_foo.js` — run one ad-hoc Playwright UI check (repo root, gitignored,
  not wired into CI or `npm test`). Add/extend one of these when you add a
  feature and actually run it.
- Syntax-check a planner file without a browser: `node --check Planner_US.html`
  won't work directly (it's HTML, not JS) — extract/lint the inline `<script>`
  block, or just load the file in Playwright and check `page.on('pageerror')`.
- No build/lint step exists — there's nothing to compile; edit the `.html`
  files directly and reload in a browser.
- CI: `.github/workflows/test.yml` runs `npm test` on every push/PR to `main`.

## Architecture, per planner file

Each planner is one big IIFE. Core shape:

- `defaults` — the full default state object (every input field's default
  value, including nested arrays like `loans`, `spendingTiers`,
  `incomeSources`, `oneTimeIncome`).
- `normalizeState(raw)` — merges a raw/partial state (autosave, imported
  scenario file, hand-edited) over `defaults`, so old exported scenarios keep
  loading correctly: missing fields fall back to defaults, unknown fields are
  dropped. Any new enum-like field needs a guard here (see the
  `filingStatus`/`tenure`/`province` pattern) or a bad value can silently
  corrupt the simulation.
- `ids` — an array of plain-numeric input element IDs auto-wired to
  `state[id] = Number(...)` on `input`; this array also feeds the MCP tool
  schema (`update_fire_assumptions`). Booleans, enums, and anything with side
  effects are wired by hand instead.
- `simulate(retireAgeA, retireAgeB)` — the main year-by-year drawdown/
  compounding engine; almost every chart/table/metric is built from its
  `{ rows, depletedAge, ... }` return. Called many times per render (current
  settings, ±1yr/±3yr lines, each Monte Carlo path, each sensitivity sweep),
  so it needs to stay cheap.
- `simulateHistorical(rowFn, retireAgeA, retireAgeB)` — a near-duplicate of
  `simulate()` used by the historical-backtest and Monte Carlo views; takes a
  `rowFn(year)` returning actual-historical `[calendarYear, stockReturn,
  inflation, bondReturn]` from an embedded 1928–2025 dataset (or a randomly
  block-bootstrapped path for Monte Carlo).
- `syncControls()` and `syncContributionControls()` — **two separate**
  functions that both push `state` back into the DOM. Which one handles a
  given control isn't obvious from the name — check where sibling/related
  controls already live before adding a new one. The most common bug in this
  codebase is wiring a new field's DOM-sync line into the wrong one of these
  two, so `state` updates correctly but visibility/checked-state doesn't.
- `render()` — the "redraw everything" function called after every input
  change. Expensive collapsible results (tornado chart, Roth/RRSP bracket
  optimizer, cash-flow Sankey) are only computed when their card is open,
  gated inline in `render()` with a matching `toggle` listener.
- `mortgageSchedule()` / `loanSchedules()` — compute a fixed level monthly
  payment via `mortgagePayment(principal, annualRate, years)` from the
  **original** principal and term, never from the current balance and
  years-remaining (a real loan's payment doesn't shrink just because extra
  principal was paid down). Downstream code reads `schedule.payments[year]`/
  `schedule.balances[year]`, never `state.mortgage*`/`loan.term` directly.
- `SENSITIVITY_LEVERS` / `computeSensitivity()` / `renderTornadoChart()` — the
  tornado chart; levers swept are read live from checked `data-lever`
  checkboxes (a display choice, not part of `state`/scenario export).
- `chartView`/`mode`/`logScale`/`mcPathCount`/`chartShiftMode`/
  `chartGapPartner` (declared together near `normalizeState`) are all
  plain closure variables, not `state` fields — chart-display preferences
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
- `computeSankeyFlow()` / `layoutSankeyColumn()` / `renderSankey()` — cash-flow
  Sankey; routes every source through a single neutral hub node rather than
  drawing direct source→expense ribbons (no per-dollar tracking exists).
- MCP tool hooks (`read_fire_projection`, `update_fire_assumptions`) near the
  bottom of the script, registered if `window.mcp` exists. Keep the `execute`
  handler's allow-list in sync with any new `ids`/boolean/enum state field.
- Mobile layout is a pure CSS toggle (`#workspace[data-mobile-view]`), not app
  routing state — it isn't part of `state`/scenario export. Canvas-based
  charts measure their container via `getBoundingClientRect()`, which is
  zero/stale while hidden, so switching to the Dashboard tab always calls
  `render()` again to get a correctly-sized redraw.

See `docs/reference.md` for the full write-ups of the Plan Status Bar, the
sidebar field search, money-field in-place formatting, the "Estimated" field
badges/guided review, the unusual-assumption warnings, and several
`position:sticky` / mobile-viewport bugs (a recurring trap: `overflow-x:hidden`
on an ancestor silently breaks `position:sticky` everywhere on the page — use
`overflow-x:clip` instead, and verify sticky behavior with a real scroll
gesture, not `window.scrollTo()` + an overflow-width check).

## US vs. Canada: same shape, different names, not a find-and-replace

The two planners share overall structure but diverge in ways that make blind
copy-paste silently wrong — always read both files' relevant sections side by
side before porting a feature:

- US: `ssMonthlyA/B` (Social Security) + `filingStatus` (`mfj`/`single`, with
  a `marryLater` transition age) + `rmdDivisor(age)`. Canada: `cppMonthlyA/B` +
  `oasMonthlyA/B` (with `oasClawback()`) + `rrifMinPct(age)`; no MFJ/single
  distinction — Canada always taxes spouses as two individual returns.
- `taxFor(profile, gains, traditionalExtra)` has **3 branches** in US (`mfj` /
  `singlePerson` / a two-separate-filers branch for pre-marriage
  `marryLater`) but only **2** in Canada (`singlePerson` / two individual
  `personTaxCA` calls).
- Canada has pension income splitting (`pensionSplitEnabled`,
  `solvePensionSplit()`) with no US equivalent; US has ACA subsidies, IRMAA,
  and Roth-conversion-ladder MAGI gating with no Canada equivalent (Canada's
  closest analog is the RRSP meltdown ladder, with no income-tested
  healthcare cliff to gate against).
- Both `taxFor()`'s `singlePerson` branch reads **only** the `A`-slot profile
  fields — survivor modeling has to actively remap the surviving partner's
  data into the `A` slot when Partner A died, rather than just flipping
  `profile.singlePerson = true` in place.
- US models a 10% early-withdrawal penalty (`ruleOf55Enabled`,
  `sepp72tEnabledA`/`sepp72tEnabledB`, `singleLifeDivisor(age)`) on
  traditional/bondTraditional withdrawals before 59.5; Canada has no
  equivalent to build, since RRSP/RRIF withdrawals carry no age-based
  penalty at any age (only withholding tax, already captured via
  `taxFor()`) — don't port this feature to Canada.
- `traditional`/`bondTraditional` are one pooled household balance (not
  separate per-partner accounts), but RMDs, the 72(t)/early-withdrawal
  penalty fraction, and 72(t) SEPP sizing all need to know each partner's
  own share of that pool. `state.traditionalSharePctA` (a 0-100 slider,
  default 50) is that assumed ownership split; `traditionalShareA`/
  `traditionalShareB` (computed fresh each loop year in both
  `simulate()`/`simulateHistorical()` from `traditionalBeforeRmd * pctA`/
  `* (1 - pctA)`) replace the old single `traditionalShare` variable
  everywhere RMD/SEPP/penalty math reads it. During survivor period or
  single-person mode, both shares collapse to the full pooled balance
  (ownership stops being split once there's only one living partner) —
  whichever partner's RMD doesn't apply gets zeroed immediately after via
  the existing `isSurvivorPeriod`/`deceasedIsA` guard, same as before this
  feature existed. `sepp72tEnabledA`/`sepp72tEnabledB` are independently
  toggleable (replacing the old single `sepp72tEnabled` boolean, migrated
  in `normalizeState()` for old saved scenarios) since a real 72(t) SEPP
  plan is elected per account, not per household — enabling it for one
  partner doesn't require or affect the other's. Canada has no equivalent
  needing this split (no RMD-style age-based mandatory distribution
  penalty, no 72(t)), so `traditionalSharePctA` is US-only.
- US splits post-retirement healthcare into two separate cost lines —
  `state.healthcare` (pre-65 ACA/retiree premium, gated on `acaEligibleA`/
  `acaEligibleB`: both partners retired AND that partner under 65) and
  `state.medicareYearly` (Part B/D + supplement, gated per-partner on
  `age >= 65`/`ageB >= 65` alone, independent of retirement status or the
  other partner) — because real Medicare eligibility is purely age-based,
  unlike ACA marketplace eligibility. Canada has no equivalent split to
  build: `state.healthcare` there is a flat "supplemental private
  insurance once retired" figure with no age-65 transition at all, because
  provincial coverage (OHIP/MSP) is universal at every age — if anything,
  some provinces' senior drug programs (e.g. Ontario Drug Benefit at 65)
  argue for *lower* supplemental cost at 65, not a new mandatory expense —
  don't port `medicareYearly` to Canada.

## Money-field formatting

Every dollar field has `class="money"` and is runtime-converted from
`type="number"` to `type="text"` so it can show `"$1,850,000"` in place as you
type (`attachMoneyPreview`/`refreshMoneyPreviews`). Any code reading a
`.money` field's `.value` must strip non-digits first
(`.replace(/[^0-9]/g, '')`) before `Number(...)`, or it silently reads `NaN`
and falls back to `|| 0`. A new dollar field needs both: the `class="money"`
attribute, and non-digit stripping at every call site that parses it.

## Versioning

Stable filenames (`Planner_US.html`, `Planner_Canada.html`), no
version-numbered copies. Full history lives in `git log`, not in old files;
`index.html`'s links never go stale.

Each planner's topbar also carries a small hand-maintained version badge
(the `<span>V19</span>`/`<span>V4</span>` inside the `<h1>`) — bump the
relevant file's badge in the same commit as any other user-facing change to
that file. It's the one piece of on-page provenance a person (or a
screenshot sent to Claude) can use to tell which build they're looking at,
and it only stays trustworthy if every batch bumps it, not just some.

## Testing checklist for any change

1. `npm test` (golden math tests — exact-to-the-cent).
2. Run the specific `test_*.js` file(s) relevant to what changed, plus a
   broader sweep if the change touches `simulate()`/`simulateHistorical()`,
   `syncControls()`/`syncContributionControls()`, or the shared per-year loop.
3. Mobile-width check for any new sidebar field or result card (390×844
   viewport): `document.documentElement.scrollWidth >
   document.documentElement.clientWidth` should stay `false`.
4. If the feature has a UI toggle, verify with Playwright that toggling it
   actually changes `window.fireProjectionRows`/the relevant DOM output — not
   just that the checkbox's own `.checked` state is correct.
5. If the feature touches anything `position:sticky`, verify with an actual
   scroll gesture (`page.mouse.wheel(...)`), not `window.scrollTo()`.

## Docs are updated in the same commit as the code change

- User-facing change → update `README.md`'s feature list.
- Architectural change (new shared helper, new US/Canada divergence, new
  gotcha) → update this file and/or `docs/reference.md` in the same batch of
  work, not as a later pass. The repo may exist as multiple independent local
  clones with no shared remote, so these docs — kept current in the repo
  itself — are what let a future session with no memory of this conversation
  pick up accurately from the repo contents alone.
