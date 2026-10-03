# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators
for a couple or single person — one for the US, one for Canada. Everything
(markup, CSS, and JS) lives in one `<script>` block per file; there is no build
step needed to run, no bundler, no framework, and no server. Opening the
`.html` file in a browser is the entire deployment. (Code identical in both
planners is kept in sync by the dev-time `scripts/sync-shared.js`; see
"Shared code between the planners".) See `README.md` for the full user-facing
feature list.

## Files

- `Planner_US.html` / `Planner_Canada.html` — the two apps, each fully
  self-contained (~4,500–4,700 lines including the inline `<script>`).
  **Stable filenames**: never rename these or create version-numbered copies
  (`Planner_US_v2.html`, etc.) — every update is a `git commit` to the same
  file, not a rename-and-fix-links exercise.
- `index.html` — a small landing page linking to both tools.
- `tests/golden.js` — hand-verified year-by-year drawdown/compounding math
  checks, run via `npm test` along with the other `tests/*.js` files listed in
  `package.json` (all wired into CI). `tests/tax_brackets.js` covers every tax
  schedule (federal, each state/province, NIIT, OAS clawback) via
  `window.__test_tax`; run it whenever a bracket or tax function changes.
- `tests/field_registry.js` — guards the field registry (see `FIELDS`): every
  sidebar control registered, every entry resolvable, MCP schema == registry.
- `tests/legacy_state.js` — a corpus of old/partial/invalid saved states whose
  `normalizeState()` result is pinned (`tests/snapshots/legacy_state.json`); run it
  when touching `normalizeState`, `normalizeLists`, or an enum guard.
- `tests/snapshot.js` + `tests/snapshot_scenarios.js` + `tests/snapshots/{us,canada}.json`
  — exact-match characterization test of `simulate()`/`simulateHistorical()`
  over ~435 US / ~340 Canada scenarios (standard, retirement-age shifts, and
  historical/Monte-Carlo-style paths); the committed baseline stores hashes.
  `tests/snapshot_ui.js` + `tests/snapshots/ui_*.json` pins field wiring (each
  sidebar control: state change, visibility, reload round trip), the MCP tool
  schema, a clean load at desktop/mobile width, and rendered-results text. Both
  run in `npm test`. **Only run `npm run snapshot:update` for an intended
  behavior change**, and say so in the commit; a pure refactor must leave the
  baseline untouched. To see *what* changed after a failure:
  `node tests/snapshot.js --root <worktree of good ref> --dump A --update-nothing`,
  `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`.
- `test_*.js` (repo root, committed) — ad-hoc Playwright scripts covering
  UI/feature behavior; not run by CI. Run individually with `node test_foo.js`.
- `docs/reference.md` — a much longer, chronological architecture/gotcha log
  (bug postmortems, CSS traps, the full history of specific features). Consult
  it for the deep detail behind anything summarized below before touching that
  area of the code.

## Commands

- `npm test` — runs `tests/golden.js` (requires `playwright`; `npm install`
  first if `node_modules` isn't present). Must stay exact-to-the-cent.
- `node test_foo.js` — run one ad-hoc Playwright UI check (repo root, committed,
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
- **`FIELDS` — the field registry** (just above `normalizeState`). Every sidebar
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
- `runProjection({ mode, source, retireAgeA, retireAgeB })` — the one
  year-by-year drawdown/compounding engine behind everything: almost every
  chart/table/metric is built from its `{ rows, depletedAge, ... }` return. Two
  thin wrappers call it. `simulate(retireAgeA, retireAgeB)` is the standard
  projection (`STANDARD_MODE` + `standardYearSource()`: constant plan return,
  inflation and bond assumptions). `simulateHistorical(rowFn, retireAgeA,
  retireAgeB)` is the historical-backtest / Monte Carlo run (`BUCKET_MODE` +
  `historicalYearSource(rowFn)`, where `rowFn(year)` returns actual
  `[calendarYear, stockReturn, inflation, bondReturn, optional Treasury yield]`
  from the embedded 1928–2025 dataset or a block-bootstrapped path). Called
  many times per render (current settings, ±1yr/±3yr lines, each Monte Carlo
  path, each sensitivity sweep), so it needs to stay cheap — avoid
  per-year allocations that a hot path doesn't need (the bucket-step table is
  built once at module level for that reason).
- **Year source and mode.** A year source supplies each year's market inputs
  (`yearInputs(year)` → stock return, bond return, bond interest yield,
  inflation `factor`; `endOfYear()` advances running inflation). The mode is a
  small object of explicit capability switches — `bucketStrategy`,
  `usesBondLadder`, `usesMagiRoom` (US), `passConversionAge` (US),
  `detailedRows` — that reproduce each way of running the engine exactly. The
  bucket mode's switches are off today only because the historical engine lacked
  those features; the planned historical-parity work turns them on one at a time
  (see `docs/phase2-refactor-plan.md` Appendix A). Do not add a new
  historical-only fork of the year loop; add a mode switch.
- **MAGI iteration (both engines).** ACA subsidy, the ACA/IRMAA
  Roth-conversion ceilings and the IRMAA lookback need THIS year's MAGI,
  which includes this year's discretionary withdrawals, which depend on
  the premium that MAGI sets. Inside each engine's year loop the body is
  wrapped in `for (let iter = 0; ; iter++)`: it snapshots every mutated
  balance (and the Roth ledger) before the first mutation, and if
  `estUsed` (an ACA premium or a finite MAGI ceiling consumed
  `estTrad`/`estGain`) and the realized discretionary traditional
  withdrawals + taxable gains differ from the estimate by more than
  `MAGI_ITER_TOL`, it restores the snapshot, updates the estimate, and
  `continue`s (max `MAGI_ITER_MAX` passes, damped after pass 3). Rules for
  editing a year body: anything that mutates closure state before the
  convergence check must be in the snapshot (`bal` fields are rewound
  automatically; add new scalar `let`s to `scalarSnapshot`; the guardrail state is the `guardrails` object, copied as `guardrailSnapshot`), and never add a `continue`/`break` that is meant for the year
  loop. `prevDiscTraditional`/`prevTaxableGainGross` only seed pass 0.
  `row.magiProxy` is the realized MAGI and `magiHistory[year]` is
  overwritten with it after convergence; the in-body assignment is
  provisional and only read by the plan's first-year IRMAA stand-in.
  Test: `tests/aca_magi_iteration.js`. See `docs/reference.md`.
- **Per-year helpers** (section "Per-year helpers shared by simulate() and
  simulateHistoricalCore()", just above `simulate()`). The year loop is a
  sequence of named stages: `listAmountsForYear`, `retirementContributions`,
  `socialSecurityIncome`/`cppAndOasIncome`, `pensionIncome`,
  `requiredDistributions`, `housingForYear`, `loanPaymentForYear`,
  `filingStatusFor`, `buildTaxProfile`, `conversionMagiCeiling` (US),
  `healthcareCost`, `payrollTax`, then balance mutations (`growBalances`,
  `withdrawRequiredDistributions`, `applyRothConversion`/`applyRrspMeltdown`,
  `sweepExcessCash`, `rotateIntoBondLadder`) and the withdrawal. Add a new
  per-year rule to the matching helper, not inline in an engine.
- **Account balances live in one `bal` object** (`bal.taxable`,
  `bal.taxableBasis`, `bal.bondTaxable`, `bal.bondTaxableBasis`,
  `bal.bondTraditional`, `bal.bondRoth`, `bal.traditional`, `bal.roth`,
  `bal.cash`, `bal.home`, `bal.mortgage`, plus `bal.fhsa` in Canada), not loose
  `let`s. The MAGI-iteration snapshot is `{ ...bal }`, so a new balance field is
  rewound automatically; only scalars (depletedAge, firstWithdrawal) still need
  adding to `scalarSnapshot`; guardrail state lives in a `guardrails` object
  (`newGuardrails`, `guardrailSpendingMultiplier`, `recordGuardrailWithdrawal`).
- **Withdrawals** build a `wd` object (`newWithdrawal`) and run a strategy:
  `withdrawStandard` (simulate: explicit/optimizer mix, live mix, smooth, or
  taxable-then-traditional, then the Roth/cash/bond/home fallback) or
  `withdrawBucket` (simulateHistorical: cash and bonds first in a down year, then
  stocks; in an up year stocks first, then refill the bond reserve). Both are
  built from `takeTaxable`/`takeTraditional`/`takeRoth`/`takeCash`/
  `takeHomeEquity`, which return net cash and leave `wd.need` to the caller
  (the strategies differ on clamping a tiny overshoot to zero).
  `solveTraditionalForNet` and `solveTraditionalForNetFromNeed` bisect from
  different brackets and give slightly different (~1e-7) answers; both are
  kept on purpose until the numerics are unified as a deliberate change.
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
  Button groups (`tenure`, `buyCash`, `k401Type`, `iraType`, `pensionCoverage`,
  `filingStatus`) are still wired by hand (`manual: true`) but registered so
  MCP and `normalizeState` share their value lists.
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
  bottom of the script, registered if `document.modelContext` exists. The input
  schema and the `execute` allow-list are derived from `FIELDS` (every numeric
  field plus each `mcp: true` entry), so a new field needs no MCP edit.
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

## Shared code between the planners (marked regions)

Code that is byte-identical in both planners lives between
`// @@shared:<name> begin` / `end` marker comments, with the canonical copy in
`shared/<name>.js`. Never edit one planner's region alone: edit the fragment
and run `npm run sync`, or edit a planner in place, then
`npm run sync -- --pull Planner_US.html` (copies back to `shared/`) and
`npm run sync` (updates the other file). `npm test` runs
`scripts/sync-shared.js --check` first, so drift fails CI. Not a build step:
the planners stay self-contained and run by opening the file. To make code
shared that currently differs, first remove the difference (see
`docs/phase2-refactor-plan.md` section 7), then wrap it in a new region (add
the markers to both files plus a `shared/` fragment). Marker style picks the
fragment type: `// @@shared:x begin` (JS, `shared/x.js`), `/* @@shared:x begin */`
(CSS) and `<!-- @@shared:x begin -->` (markup). The whole stylesheet is one
shared region, so a CSS change is made once. The two `runProjection` year
loops are deliberately not shared (see plan section 7, step 4.5): put a new
per-year rule in a shared stage helper when it is identical in both
countries, otherwise edit each loop.

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
  Anything summed into the A slot for the household (`extraIncome`) must be
  re-attributed to the survivor in that remap too, and the Canada
  `totalA`/`totalB`/OAS-clawback block keys off `aliveA`/`aliveB`, never off
  `effectiveSingle` alone. `tests/survivor_symmetry.js` (identical partners,
  A-dies must equal B-dies) guards both.
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
  `acaEligibleB` from `acaEligibility()`: that partner retired AND under 65,
  AND either the other partner has also stopped working or that other
  partner's `employerCoversSpouseA/B` flag is off — the flags default to
  true, which is the old "both retired" rule; the same helper feeds the
  400%-FPL conversion guard, so cost and guard can't drift apart) and
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

## Add-as-you-go lists (loans, extra income, extra expenses, one-time items)

`state.loans`, `incomeSources`, `oneTimeIncome`, `extraExpenses`, and
`lumpExpenses` are arrays that **default to `[]`** (cap `LIST_MAX = 10`);
the old fixed slots and the `otherLoansEnabled`/`otherIncomeEnabled` master
flags are gone. All five render from one generic DYN block (specs per list,
`renderDynList(name)`, delegated input/change/click handlers) — add a field
by editing the spec, not by hand-writing HTML. Ids are `<prefix><index><Field>`
(e.g. `extraExp0Amount`, `lumpExp0RepeatEvery`). Growth model: items have
`followGrowth` (true = income growth for income, inflation for expenses) or
their own `growth` %; `itemGrowthFactor()` applies it from today, and the
historical engine substitutes its actual-inflation `factor`. Age windows use
Partner A's age. `lumpExpenseHits(e, age)` handles repeat-every/until.
Lump expenses are subtracted out of guardrail needs, `firstWithdrawal`, and
`bondTarget` sizing. `normalizeLists()` (called from `normalizeState`)
migrates legacy saves: flag present+off → list dropped; flag on → only
configured loans / `enabled` streams kept, legacy income streams pinned to
`followGrowth:false, growth=inflation` so old projections reproduce exactly.
`flat: true` on `oneTimeIncome`/`lumpExpenses` makes `itemGrowthFactor` return
1 (and one-time income skip `factor`) — the amount is exact dollars at that
age; the growth fields hide via `showIf`. The old Bridge / part-time income
section (`bridge*` fields) is removed; `normalizeLists()` converts a saved
`bridgeEnabled` plan into income streams (start clamped to that partner's
retirement age, Partner B's window shifted into Partner A's age) and deletes
every `bridge*` key — note `normalizeState` spreads unknown keys, so any
retired field must be deleted explicitly or it re-migrates on every load.
`state.spendingTiers` is a sixth DYN list (ids `tier<i>…`): amount, startAge,
endAge, followGrowth/growth. `baseSpendingNominal(age, year, factor, incomeFactor)`
is the single place both engines (and `projectedExpense`) read household
spending — the active tier that started latest wins (ties: first in list),
else `state.spending * factor`. Legacy five-slot saves (`enabled`/`age`) are
migrated in `normalizeLists()` as open-ended (end 120) inflation-following
changes, which reproduces the old projections exactly. Additional expenses
(`#extraExpensesGroup`) is `data-cat="spending"`; one-time expenses, other loans and the pre-retirement healthcare group are
also `spending`; additional income is `income`; `extra` keeps survivor planning.
Test: `node test_dynamic_lists.js`, `node test_spending_and_fi_widgets.js`.

## Dashboard tiles and the safe withdrawal rate

The four `.metrics-primary` tiles are Investable at retirement, `#fiNumber`,
`#fireNumber`, and Investments last through; `#dashRetireAge` is a small
`.retire-chip` box at the top-right of `.content` showing `state.retireAgeA/B` (each partner's own retirement age, not the sim's both-retired year), and `#dashHistSuccess` lives in More results.
`state.fiWithdrawalRate` (default 4, clamped 0.5–15 in `normalizeState`) feeds
`fiMultiple()` (= 100 / rate). It is edited via two `.swr-input` boxes (one
per tile) that are synced by hand in `syncControls()` — it is deliberately not
in `ids`, since there is no sidebar element with that id. Funded % compares
`currentInvestable` (liquid accounts only, no home equity) to the number.

## Money-field formatting

Every dollar field has `class="money"` and is runtime-converted from
`type="number"` to `type="text"` so it can show `"$1,850,000"` in place as you
type (`attachMoneyPreview`/`refreshMoneyPreviews`). Any code reading a
`.money` field's `.value` must strip non-digits first
(`.replace(/[^0-9]/g, '')`) before `Number(...)`, or it silently reads `NaN`
and falls back to `|| 0`. A new dollar field needs both: the `class="money"`
attribute, and non-digit stripping at every call site that parses it.

## Field descriptors and info bubbles

A field's `<small>` is a one-line descriptor (aim for under ~70 characters);
anything longer goes in a `<button class="info-tip" data-tip="…">` placed in
the label, which opens the shared `#infoBubble`. Wrap the label's last word
and the button together in `<span class="info-nw">` so the button can't wrap
alone — and note `mainLabelText()` (field search) reads that span's text too.
The button lives inside `<label for>`, so its click handler must
`preventDefault()`. Write tooltip copy from what `simulate()` actually does,
not from older blurbs (see `docs/reference.md`, "Sidebar info bubbles").

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

## Docs are updated with the code change (reference.md excepted during the batch plan)

- User-facing change → update `README.md`'s feature list in the same commit.
- Architectural change (new shared helper, new US/Canada divergence, new
  gotcha) → update this file in the same batch of work, not as a later pass.
- `docs/reference.md`: while the batches in `docs/next-batches-plan.md` are in
  progress, do **not** edit it per batch. Append findings (decisions, verified
  figures with primary-source citations and dates, gotchas, before/after
  tables) to that batch's "Batch notes" section in `docs/next-batches-plan.md`
  in the same PR; one consolidation PR moves them into `docs/reference.md`
  after the last batch. Outside that plan, update `docs/reference.md` in the
  same batch of work as before.
- The repo may exist as multiple independent local clones with no shared
  remote, so these docs — kept current in the repo itself — are what let a
  future session with no memory of this conversation pick up accurately from
  the repo contents alone.
