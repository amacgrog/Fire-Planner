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
- `tests/state_rules.js` — the state-tax table: every jurisdiction present, every field explicit, schema ranges.
  `tests/state_mechanisms.js` — each mechanism on a synthetic jurisdiction `zz` (hand-computed): recapture, step tables,
  every credit kind, per-person exclusions, columns, indexing, and the `taxFor` per-person plumbing.
  `tests/bench_runs.js [--root DIR]` — the timing gate (400 `simulate()` + 120 historical runs, median of 3, per
  state); not in `npm test`; compare a worktree of the previous commit with the working tree (+5% allowed).
  Wall-clock noise between runs is ±10% on this machine, so for a decision compare two trees in ONE process, interleaved
  (load each tree's `Planner_US.html` in its own page, alternate rounds, take medians), and use `bench_runs.js` for the record.
  `tests/bench_heavy.js [--root DIR] [--states ...]` — per state: a slider move with every results card closed, with only
  the tornado card open and with all open, one Monte Carlo run and one per-year Roth optimizer run; uses only hooks that exist
  at the 7C merge so it runs unchanged on an old worktree; not in `npm test`. `tests/tax_caches.js` (in `npm test`) — the
  guard for the tax-code memos and the per-row `needsPerPerson` flag: identical doubles (`Object.is`), never a tolerance.
- `tests/benefit_rules.js` / `tests/gis_tables.js` / `tests/benefits.js` — the Canada income-tested benefit table coverage, every row of the ESDC GIS tables against the fitted knots, and hand-computed benefit cases (see "Income-tested benefits"); `docs/sources/` holds the ESDC tables and the extraction script.
- `tests/deductions.js` — US federal deductions (age-based standard deduction,
  senior deduction through 2028, SALT cap schedule, simplified itemizing, the
  $750,000 mortgage-debt limit), hand-computed, plus engine-level cases with the
  clock pinned. `tests/medicare_enrollment.js` — Medicare/IRMAA start at
  `max(65, retirement age)`.
- `tests/child_dependents.js` — the children list: `normalizeState` cleaning, `dependentsInYear` /
  qualifying-child ages, and the US ACA household size and its effect on the 400%-FPL cliff.
- `tests/aca_medicaid.js` — Medicaid and the premium-credit floor in `acaNetCost` (hand-computed: expansion, non-expansion and
  Wisconsin at several shares of the poverty line, the checkbox, 2026 versus 2027, the child-13 exemption, all 51 codes, engine rows).
  `tests/pa_employer_plan.js` — Pennsylvania's employer-plan exclusion end to end (the engine, per-filer 401(k) shares, hand-computed
  including the 10% early-withdrawal penalty). `tests/state_child_credits.js` — the state child credits (MN, VT, UT, OR, ME, NJ) run
  through each row's real credit literals on a flat-10% synthetic base.
- `tests/field_registry.js` — guards the field registry (see `FIELDS`): every
  sidebar control registered, every entry resolvable, MCP schema == registry.
- `tests/legacy_state.js` — a corpus of old/partial/invalid saved states whose
  `normalizeState()` result is pinned (`tests/snapshots/legacy_state.json`); run it
  when touching `normalizeState`, `normalizeLists`, or an enum guard.
- `tests/account_ledger.js` — the US per-account share ledger (contribution routing,
  conversion order, MAGI-iteration rewind, share invariants); `tests/account_inputs.js` —
  how the eight account inputs, the Roth basis rules, single-person mode and the opening
  ownership ratio feed the engine. `tests/legacy_balances.js` — test helper that turns the old
  pooled vocabulary (`traditional`, `roth`, `traditionalSharePctA`, `rothBasisPct`) into the
  per-partner account fields (`legacyToAccounts` for state patches, `translateFieldList` and
  `setBalance` for DOM-driven tests); the snapshot grid and many older tests still speak the old
  vocabulary through it. `test_wizard_accounts.js` — the three-step US wizard and the
  Retirement accounts group.
- `tests/bond_refill.js` — hand-computed unit test of `refillBondReserve` (cap, order,
  realized gain, never home/cash) plus engine checks of the cap and the surplus path.
- `tests/historical_parity.js` — runs a constant-return historical path (equal to
  the plan's own assumptions, `bondYears: 0`) next to `simulate()` and asserts every
  shared row field agrees year by year; its `ENABLED` groups grow with each Batch 1
  step. `tests/historical_rates.js [--root DIR]` prints the historical and (seeded)
  Monte Carlo success rates for a few scenarios, for before/after tables; not in
  `npm test`.
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
  small object of explicit capability switches. Today it has one,
  `bucketStrategy` (cash/bonds first in a down year, bond reserve refilled in up
  years, instead of the standard cascade); the other differences between the two
  ways of running the engine (detailed rows, Roth-conversion age key, safe-MAGI
  ceiling, pre-retirement bond ladder) were switches that the historical-parity
  work (Batch 1 of `docs/next-batches-plan.md`) turned on and then removed, so
  both modes now run them. Rows and result fields are identical in both modes;
  historical rows additionally carry `cumFactor` and the result carries
  `startYear`. The bond reserve is refilled gradually: `routeSurplus` fills it from
  surplus cash (limited by the surplus and `bondTarget`, no extra cap), and
  `refillBondReserve(wd, bondTarget, { maxMove })` (up years, after the draw)
  moves at most one year of that year's non-lump expenses into bonds:
  traditional, then Roth (no income, no penalty), then taxable last, a real sale
  through `drawTaxable` whose gain goes into `wd.taxableGainGross` (so tax, MAGI
  and the MAGI iteration see it) with the tax paid from the proceeds; never cash
  or home equity. `rotateIntoBondLadder` (the pre-retirement ladder, both
  engines) uses the same source order (traditional, Roth, taxable last); a taxable
  move is a real sale through `drawTaxable` whose gain it returns, and the engine
  adds that to `wd.taxableGainGross` (and to the row's tax/income in a surplus
  year). The stock-account step of the bucket strategy is one grouped step,
  `BUCKET_STEP.stocks`, that delegates to `drawMixedStockAccounts` (US: applied/
  override mix, live mix, smooth) or `drawSmoothStockAccounts` (Canada: smooth
  only), the same code `withdrawStandard` uses, with the bucket's own bisection
  bracket (`solveTraditionalForNetFromNeed`); with no mix mode on it runs the
  original taxable -> traditional -> Roth steps. Cash and the bond buckets keep
  their place in the down/up-year orders. The pre-retirement ladder is sized once from the plan's assumed
  inflation (`source.inflation`) in both engines. Do not add a new
  historical-only fork of the year loop; add a mode switch.
- **MAGI iteration (both engines).** ACA subsidy, the ACA/IRMAA
  Roth-conversion ceilings and the IRMAA lookback need THIS year's MAGI,
  which includes this year's discretionary withdrawals, which depend on
  the premium that MAGI sets. Inside each engine's year loop the body is
  wrapped in `for (let iter = 0; ; iter++)`: it snapshots every mutated
  balance (and the Roth and account ledgers) before the first mutation, and if
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
- **Medicaid and the premium-credit floor (US, `MEDICAID_RULES`, 7O O1).** A pure-literal table just above `fplForHousehold`
  (`MEDICAID_RULES:begin/end`; not a `STATE_RULES` column): `expansionLimit` (1.38 of FPL: 133% plus the 5-point disregard),
  `nonExpansion` (ten states), `adultCoverage` (Wisconsin 1.0), `ptcFloor` (1.0) and `workRequirement` (`fromYear` 2027,
  `exemptChildMaxAge` 13). `acaNetCost` applies it before the credit schedule, so `healthcareCost` and the 400% guard still share one function:
  at or under the state's Medicaid line the cost is $0 (checkbox `medicaidWhenEligible`, default on) or the full premium (checkbox off, or from
  2027 a household with no child 13 or younger fails the work requirement, which also bars the credit); under 100% of FPL there is no credit.
  A MAGI of 0 is no longer a free pass. `medicaidLimit(code)` is cached per code and `hasChildAtMost` loops the children list in place, so the
  path allocates nothing. `conversionMagiCeiling` is unchanged: the new cliffs (the floor, the 138% line, the 2027 start) are priced by the cost
  and listed in the plan's cliffs register; 3C decides the policy. Tests: `tests/aca_medicaid.js`.
- **US federal deductions** (just above `ordinaryTax`): `standardDeduction(filing,
  yearIndex, ages)` (base + the 65+ additional amount per filer), `seniorDeduction`
  (the temporary $6,000, zero after `SENIOR_DEDUCTION_LAST_YEAR = 2028`; revisit if
  Congress extends it), `saltCap` (explicit year table to 2029, `SALT_CAP_LAST_YEAR`),
  `itemizedDeduction` (min(SALT cap, state tax + property tax) + mortgage interest,
  nothing else) and `federalDeduction` (max of standard and itemized, plus senior).
  `itemizedDeduction` and `federalDeduction` also take the year's medical expenses (7O O2): the part over 7.5% of AGI
  (`MEDICAL_FLOOR_PCT`) is added to the itemized total. The engine sets `profile.medicalExpense = healthcare + ltc` each MAGI pass,
  right after `healthcareCost` (premium after the credit, Medicare, IRMAA and the long-term-care cost); `taxFor` and the lagged
  federal pass read it (`|| 0`), the two-filer branch splits it 50/50, and the itemizing branch is entered only when `medical` exceeds
  the floor, so ordinary Medicare years add nothing to the hot path. `solveRothConversion` and the optimizer's profile literals carry no
  medical term (conservative).
  The tax year is `currentYear + yearIndex` in both engines (historical runs replay
  returns, not tax law). `taxFor()` computes each return's deduction itself from its
  own income (AGI stands in for MAGI), the state tax it just computed, and the
  `profile.propertyTax` / `profile.mortgageInterest` that `housingForYear()` supplies
  (interest already limited to $750,000 of original debt); `ordinaryTax` and
  `longTermGainTax` take it as an optional last argument. The two-single-filers
  branch splits housing deductions 50/50. `solveRothConversion` uses a conservative
  lower bound (age-adjusted standard, or property tax + interest if larger; no
  senior deduction, no state tax). `mortgageSchedule()` and `buildDeferredMortgage()`
  (shared fragment `07-mortgagePayment`) now also return a per-year `interest` array.
  Canada has no equivalent in this batch. The Annual property tax field line sits
  between two shared markup regions (`html-medicalInflation` ends before it,
  `html-propertyTaxGrowth` starts after it) so each planner can word its label
  differently; keep it outside the shared regions.
- **Filing-status table (US, `FILING`, just above `standardDeduction`).** Each status row names, per
  parameter family (brackets, deduction, extraAge, gains, ss, niit, medicare, irmaa, senior, ctc), which
  data row it reads (`ORDINARY_BRACKETS`, `STD_DEDUCTION`, `STD_EXTRA_65`, `GAIN_BANDS`, `SS_BASE`,
  `NIIT_THRESHOLD`, `IRMAA_TIERS`, `SENIOR_PHASE_START`), plus a `joint` flag for the structural branch in
  `taxFor`/`solveRothConversion`. Read through `filingKey(filing, family)` / `filingRow(filing)`; an unknown
  status reads as single. Never write `filing === 'mfj'` in new code; add a row or a family instead.
  Statuses: `mfj`, `single`, `hoh` and `qss`. `filingStatusFor` (US) picks the year's status: unmarried with a
  qualifying child that year is `hoh`, else `single`; a survivor of a married couple is `mfj` in the death year,
  `qss` for the next two tax years while a qualifying child exists, then as unmarried. `qss` mixes families (joint
  brackets, deduction and gain bands and the NIIT, single Social Security bases, Additional Medicare Tax, IRMAA and
  senior phase-out). An unmarried couple (marry-later before the wedding, or `filingStatus: single`) keeps household
  status `single`; the two-filer branch of `taxFor` gives Partner A (who claims the children) `hoh`. `taxFor`
  branches on `filingRow(f).joint`, then `profile.singlePerson` (single, hoh or qss), then two filers.
- **State income tax (US, `STATE_RULES`, just above `stateIncomeTax`; Batch 7C).** One data row per jurisdiction (the
  50 states and DC, matching the `#stateTax` options) and one generic evaluator, `stateIncomeTax(sources, filing,
  yearIndex)`, replacing the old per-state code. A row declares every field explicitly (`tests/state_rules.js` fails on
  a missing field or a state missing from the table): `status` (always `researched`: `source` URL + `asOf` year; the `migrated` status of 7C is gone), `indexing` (one boolean per family: `bracketsIndexed`, `standardDeductionIndexed`, `personalExemptionIndexed`, `creditAmountsIndexed`,
  `creditThresholdsIndexed`, `retirementExclusionIndexed`, never one switch for the whole state: CA indexes its brackets, deduction and credits but not
  its $1 million surcharge, NY indexes nothing, WA indexes the deduction but not its $1 million tier; each `additions` entry has its own `indexed`;
  a true flag scales that family by `taxIndexFactor`), `statusAs` (which column `mfj`/`single`/`hoh`/`qss` read: HoH falls back to the
  single column and QSS to the joint one unless the row has its own `hoh` column; the old `FILING.state` family is gone),
  `tax` (`none`, `flat`, or `graduated` with `[start, rate]` columns), `surtax`, `base` (ordinary income yes/no, share
  of gains included, Social Security `exempt`/`taxed`/subtraction), `standardDeduction`, `exemption`, `retirementExclusion`
  (kinds in `stateRetirementExclusion`: `perPerson` and `agiPhasedShare`; the household-level kinds of 7C were removed in 7D),
  `credits`, `federalTaxSubtraction`, `localTax` (local income taxes are an accepted, documented gap) and `notes`. Mechanisms
  (all data, evaluator in `stateIncomeTax`): `additions` (a threshold surtax, an AGI step table, NY's `benefitRecapture`),
  `exemptionPhaseOut` and `dependentExemption`, the AGI-tested Social Security kind, per-person retirement kinds
  (`perPerson`, `agiPhasedShare`), and `credits` of kind `exemptionCredits`, `renterCredit`, `childCredit`,
  `propertyTaxCredit`, `taxForgiveness`, `agiStepFraction` (a nonrefundable credit is capped by the tax; a `refundable` one
  can take the state tax negative, as the ACTC can). Step tables are `[[lowerBound, value], ...]` per column. The state
  inputs come from `taxFor`'s `sources`: besides the household sums it carries per-person pensions and traditional draws
  (`pensionA/B`, `retirementA/B`; the discretionary draw is split by `profile.ownerShareA`, the account-ledger share, 0.5 if
  absent), `ssBenefits` (plus per-person `ssBenefitsA/B` and the taxable part split in proportion, `taxableSSA/B`; a one-person return reads slot A), `dependents`, `propertyTax` and `rent` (`housingForYear` now returns `rent`). `taxFor` does not build
  `sources` at all for a no-tax state: that path stays as fast as before. For a taxing state it refills four module-level
  scratch objects (`SOURCES_JOINT/SINGLE/A/B`, one per return, same shape, `newStateSources`) instead of allocating, and
  writes the per-person fields (`pensionA/B`, `retirementA/B`, `ssBenefitsA/B`, `taxableSSA/B`) only when the row's
  `needsPerPerson` flag is set (`compileRow`: a per-person retirement kind or the age-and-AGI-tiered Social Security kind;
  `compileStateRule` ORs in the scheduled variants), so **a new mechanism that reads a per-person field must set that flag**
  (`tests/tax_caches.js` runs every state with the flag forced on for all rows and fails on a difference, and pins which rows
  carry it). `stateIncomeTax` and its credit helpers must keep nothing from `sources` (it is reused on the next call). Each
  row is resolved once per state code into flat arrays (`compileStateRule`, cached), and the factor is applied inside
  `graduatedTax`, so the hot path allocates nothing. Order of evaluation is fixed, state first, federal second: the state
  tax feeds the federal SALT deduction, so a state base must never read a federal deduction or federal tax (a state that
  deducts federal tax gets one lagged pass, 7D). 7D mechanisms (all data, evaluator in `stateIncomeTax`, hand-computed cases in `tests/state_mechanisms.js`): `schedule` (year-effective
  rule sets: `[{ fromYear, baseYear?, ...overrides }]`, each building on the one before; a scheduled family holds statutory dollars of its
  base year and indexes from there, `base / taxIndexFactor(baseYear - currentYear)`; only unconditional enacted changes, never revenue
  triggers), `standardDeductionPhase` (`stepDown` / `linear` by state AGI), `seniorExemption` (per filer, optional AGI phase-out),
  `dependentExemption` as a number or an AGI-tiered table, `federalConformity` (the state deducts the federal standard deduction, optionally
  with the 65+ add-on and the senior deduction), additions with a `threshold` per column, and the per-person `perPerson` retirement kind
  now carries `applies` (pension / traditional), `tiers` (age-tiered caps), `reducedBy` (the filer's Social Security subtraction or all
  benefits received uses up the same cap) and `share` (an AGI step share). Second set: Social Security kinds `ageAgiTiered` (per filer by age, with an AGI limit and a cap over it),
  `agiShare` and `agiPhaseOut`; credits `incomeTestedCredit` and `ssCredit`; `base.gainsRate` / `gainsDeduction` (gains taxed separately or reduced by a dollar
  exclusion); `federalTaxSubtraction` as `{ kind: 'lagged', placement, cap, phase }` (taxFor runs one extra federal pass with state tax zero, only for a row that
  deducts federal tax: `rule.lagged`, `federalLiabilityForState`; the liability excludes NIIT, payroll tax and the ACTC; the small SALT-feedback
  inconsistency is accepted and named in the row); and `localTax: { kind: 'flat', rate }` (MD and IN only, a flat county rate on the state taxable income, which
  feeds the federal SALT deduction like the state tax). Third set: `exemptionPhaseOut` kind `linear` (every exemption, the filers' and `dependent` per child, loses `rate` x the federal AGI over `start`), `dependentExemption` `{ kind: 'afterFirst', amount }`, a `seniorExemption` phase-out with a rate per column and `basis: 'federal'`, and credit kind `childStepCredit` (per qualifying child, from a step table of the federal AGI). Circuit-breaker credits are deliberately not built (owner decision). The block between the `STATE_RULES:begin` / `end` comments is pure
  literals so `scripts/gen-state-rules.js` can evaluate it. Rows are `researched` (the six reference states CA, NY, PA, CT, WA, TX with tests in
  `tests/state_reference.js`; the 7D states with hand-computed households in `tests/state_7d_households.js`) and now all 51 rows are researched. Rows follow the
  state's real indexing (`none` for NY, PA and CT; `cpi` for CA and WA), HoH and QSS columns, and income tests; their `notes` text is what the
  planner shows under the selector. The generator also lists every parameter of the researched rows. Evaluating it: that script writes `docs/state-tax-rules.md` (the owner's review
  artifact: one row per jurisdiction with every rule and its source; `npm run gen:states`), and `npm test` fails if the file is
  stale. After changing a row, regenerate and commit the file. Not shared with Canada (US only).
- **State rows, later additions (7O O3, O4).** The per-person retirement kind's `applies` takes an optional `employerPlanAfterRetirement: true` (Pennsylvania only,
  7O O3): below the traditional minimum age a retired filer's 401(k) part of their traditional draw is excluded at any age.
  `buildTaxProfile` puts `k401FracA/B` on the profile (the filer's 401(k) share of their own traditional accounts from the account ledger at the start
  of the year, zero while they work; a single person or survivor: the pool's 401(k) share) and `taxFor` fills `sources.retirement401kA/B` (draw x fraction,
  only when `needsPerPerson`); the draw is assumed pro rata, which the penalty-aware draw order and 72(t) payments can depart from. `childCredit` also
  takes `phaseOut.measure` ('stateAgi' | 'income'), `phaseOut.rate` (a straight line), `maxChildren` and `fixed` (unindexed whatever the row flags say), and
  `childStepCredit` takes `maxAge` and `measure: 'income'` (7O O4: MN, VT, ME, NJ, OR, UT).
- **Child credits (US, `childCredits`, just above `taxFor`).** `childCredits(dependents, filing, yearIndex, magi,
  federalTax, earnedIncome)` returns `{ nonrefundable, refundable }`: the Credit for Other Dependents ($500, a qualifying
  child with `age >= 17`, nonrefundable, not indexed, shares the phase-out; the reduction comes off the CTC part first and
  the tax absorbs the ODC first) and the CTC ($2,200 per child with `age <= 16`,
  indexed by `taxIndexFactor`; phase-out $50 per $1,000 over the `ctc` family threshold, not indexed), limited to the
  federal income tax (ordinary + gains tax, not state/NIIT/payroll), plus the ACTC (min of the unused credit, $1,700
  per child indexed, 15% of earned income over $2,500). `taxFor` subtracts both from the federal tax, so a tax can
  be negative (only through the ACTC). Earned income is `profile.wageA (+ wageB)`, already net of pre-tax
  contributions; extra income streams are not earned income. The no-children path returns a shared constant and
  leaves the float order of the sum untouched (snapshot-exact). The two-filer branch puts the credits on Partner A.
- **Tax-code hot-path rules (7D part 2).** `taxFor` is the hottest function (a withdrawal solve probes it 25 to 50 times
  per year), so: `taxIndexFactor(yearIndex)` (shared fragment `06-histTaxFactors`) remembers the plan's own factor per whole
  year index while `state.inflation` is the value it was computed for (`Math.pow` was a fifth of a projection; the historical
  path still reads its own per-run array first); `drawTaxable`'s bisection computes the no-draw `taxFor` once, not per probe
  (the other solvers already did). Measured and rejected, do not retry: a memo inside `standardDeduction`, a conformity-
  deduction cache, and a 4-slot memo of the federal pass (the lagged pass reused by the main pass) all cost as much to look up as
  they save. A memo must be keyed on every input it reads (so it never needs clearing) and give the very double the uncached
  path gives; verify with `tests/tax_caches.js` and the snapshots.
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
- **Retirement accounts (US).** Four accounts per partner: `tradIraA/B`, `trad401kA/B`,
  `rothIraA/B`, `roth401kA/B` (all `.money`), plus `rothIraBasisA/B` (dollars; **0 means "not entered"**
  and the engine assumes `ROTH_BASIS_ASSUMED_PCT` = 50% of the balance, enter 1 for none) and
  `roth401kBasisPctA/B` (slider, default 50). The snapshot grid and `tests/historical_rates.js` use the
  planner's own basis defaults (so they run at 50%); hand-computed tests pin 100% through
  `translateFieldList` / `pinBasis`. `openingAccounts()` reads them (Partner B's are zero in
  single-person mode: B's balances are ignored, not summed); `bal.traditional/roth` start as the sums.
  The old pooled `traditional`, `roth`, `traditionalSharePctA` and `rothBasisPct` are retired and **not
  migrated** (owner decision): `normalizeState` deletes them, so an old save opens with default
  accounts. Under the pooled `bal.traditional + bal.bondTraditional` and `bal.roth + bal.bondRoth` sits
  the **account ledger** (`accts`, `accountsNew/Contribute/Convert/Clone/Restore`): each account's
  SHARE of its pool in `ACCOUNT_SLOTS` order `[IRA A, 401(k) A, IRA B, 401(k) B]` (Roth pool: Roth IRA A,
  Roth 401(k) A, Roth IRA B, Roth 401(k) B). Growth, ladder/refill moves and draws are pro rata and
  leave shares alone; only a contribution (to the owner's account; employer match to the traditional
  401(k), mega-backdoor to the Roth 401(k)) or a Roth conversion (IRAs first, then 401(k)s, into the
  same partner's Roth IRA) changes them. The ledger is cloned/restored with the MAGI-iteration snapshot
  (`accountsClone/Restore`, next to `rothLedgerClone/Restore`): a new mutable ledger must be added
  there in the same commit. `window.__test_accountTrace` returns per-year account balances.
  The engine reads the ledger: RMD and 72(t) sizing use `accountsOwnerShareA(accts.trad)` (A's
  current share of the pool), the penalty blend uses the traditional share for traditional draws and
  the Roth share (`accountsOwnerShareA(accts.roth)`) for `rothPenaltyFraction`, and a partner's RMD /
  72(t) amount is drawn from that partner's own accounts (`accountsDraw`; a single person or the
  survivor owns everything, so the draw is pro rata and no share moves). Roth conversions come from the
  IRAs first. Batch 3B replaces the fractional blend with a per-account status.
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
countries, otherwise edit each loop. **Windows gotcha:** the working tree is CRLF
(`core.autocrlf=true`), and `npm run sync` rewrites the planner HTML files with LF while
the `shared/` fragments stay CRLF, so `--check` then fails on every region. After a sync,
convert the two planners back to CRLF (e.g. `content.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')`
in a one-line node script) and re-run `npm run check:shared`; git normalizes both on commit.

## US vs. Canada: same shape, different names, not a find-and-replace

(Shared warnings: `UNUSUAL_RANGES` lives in the `04-isEstimateCountable` region and accepts an item with `check()` and `message()` instead of a
range; the US pushes its Social Security-before-retirement items onto it just after the region ends (7O O5), so the region stays identical in both files.)

The two planners share overall structure but diverge in ways that make blind
copy-paste silently wrong — always read both files' relevant sections side by
side before porting a feature:

- US: `ssMonthlyA/B` (Social Security) + `filingStatus` (`mfj`/`single`, with
  a `marryLater` transition age) + `rmdDivisor(age)`. Canada: `cppMonthlyA/B` +
  `oasMonthlyA/B` (the recovery tax, `oasClawback()`, is charged inside `personTaxCA`, 7N N1) + `rrifMinPct(age)`; no MFJ/single
  distinction — Canada always taxes spouses as two individual returns.
- `taxFor(profile, gains, traditionalExtra)` has **3 branches** in US (`mfj` /
  `singlePerson` / a two-separate-filers branch for pre-marriage
  `marryLater`) but only **2** in Canada (`singlePerson` / two individual
  `personTaxCA` calls; Canada's `taxFor` is `incomeTaxCA` minus the income-tested benefits, see "Income-tested benefits" below).
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
- **Canada federal credits (7J).** `federalTaxCA(income, yearIndex, extraCreditBase)` takes the basic personal amount as a 14% credit (`FED_CREDIT_RATE`; $16,452 phasing to $14,829 over `FED_BPA_PHASE_START`-`FED_BPA_PHASE_END`, keyed on net income), never as a deduction at the marginal rate, floored at zero. `personTaxCA(ordinary, gains, yearIndex, dtcBase, age, pensionIncome)` computes the age amount (65+, 15% clawback over the threshold, both indexed) and the pension income amount ($2,000, **not indexed**) in `ageAndPensionCreditBase` and passes the sum as `extraCreditBase`; Quebec's 0.835 abatement applies after them. Per-person data comes from `buildTaxProfile` (`ageA/B`, `penA/B` = eligible pension income after the split transfer; from `RRIF_PENSION_AGE` = 71 `taxFor` adds the discretionary RRSP/RRIF draw as RRIF income: an RRSP withdrawal is not pension income before the RRIF conversion, 7K); a profile without them reads as under 65. `solvePensionSplit(..., ageA, ageB)` sees the credits and, with a 65+ partner, scans a 48-cell grid, refines inside the best cell and also tries the equal-income transfer (combined tax is non-convex through the clawback; under 65 it is the original ternary search). Brackets apply to income itself, so `solveMeltdown` fills to the bracket cap with no BPA term.
- **OAS recovery tax (Canada, 7N N1).** `personTaxCA(..., partnerPool, oas)` takes the OAS the person received and charges the recovery tax on the return's full net income: 15% over `OAS_RECOVERY_THRESHOLD` (95,323, indexed), up to the OAS. As on the T1 the repayment is deducted from net income first (line 23500, so the brackets and the age amount see the lower figure) and added to the tax payable (line 42200); credits do not reduce it and Quebec's abatement does not touch it. `incomeTaxCA` passes `profile.oasA/oasB` (already on the profile since 7L; the survivor remap puts the survivor's OAS in slot A) and leaves each return's recovery in the module scratch `OAS_RECOVERY.a/.b` (written only when a return has OAS; read it right after the `taxFor` call whose income you want). Because Canada `taxFor` is the net cost, every draw solver prices the 15% with no solver change. `solvePensionSplit(..., ageA, ageB, oasA, oasB)` carries the OAS so the kink is inside its objective. In the year loop the cash flow starts from GROSS OAS and `tax` includes the recovery; the row keeps `ss` (CPP plus OAS, a field name inherited from the US planner) net of the recovery, adds `oasClawback`, and reports `tax` WITHOUT the recovery (as `benefits` is added back), so tables and the Sankey show each amount once. Tests: `tests/oas_recovery.js` (engine), the OAS section of `tests/tax_brackets.js`, the high-income scenario of `tests/survivor_symmetry.js`. `tests/bench_canada.js --base DIR` is the Canada timing gate (interleaved, one process).
- **After-tax estate (Canada, 7N N8; display only).** `runProjection` attaches the final balances as a NON-ENUMERABLE `estate` property (`traditional`, `taxable`, `taxableBasis`, `roth`, `cash`, `homeEquity`), so the result's own fields and every snapshot are unchanged. `afterTaxEstate(sim)` = last row's total less the tax the RRSP/RRIF and the deemed gains (50% inclusion) add to one final return (stacked on the last survivor's share of the last year's income, via `personTaxCA`) less `probateFee(rule, taxable + cash + home equity)`; registered accounts and the TFSA are assumed to pass by beneficiary designation (outside probate). Row family `probate` per province (`steps` flat fees up to a limit, `base` the fee above the last step, `bands` marginal rates per $1,000 or part: Ontario 15 over 50,000, BC 6 and 14, Alberta steps to 525, Saskatchewan 7, Manitoba and Quebec none, New Brunswick, Nova Scotia, PEI, Newfoundland and Labrador per their statutes). Shown beside End assets in the printed report; `computeRothOptimizer` ranks by the highest after-tax estate among the plans that do not shorten the portfolio (it used to minimize lifetime tax; lifetime tax stays in the table); `renderRothOptimizer` is a SHARED region (both planners' text must stay identical), so the Canada-only `annotateRothOptimizer`, called right after it from `render()` and fed by `lastRothOptimizer`, rewrites the summary and the five-column rows. Tests: `tests/estate.js`.
- **Quebec health contributions (Canada, 7N N7).** Row family `healthContributions` (Quebec only). `incomeTaxCA` (Quebec only) adds, per return, the Health Services Fund contribution `quebecHsf(non-employment income)` (net income less wages, OAS and the dividend gross-up; 1% from the first threshold to 150, flat, then 1% from the second to 1,000; caps unindexed) and the RAMQ premium `quebecRamq(family income, couple, kids, yearIndex)` for each partner with no wages this year (every retired adult; owner decision), and adds the premium to the medical expenses. The premium table is the 2025 Schedule K scaled by 777.48 / 755 to the 2026 calendar maximum; the income at which it reaches the maximum is cached (`RAMQ_CAP`) so a household above it costs one comparison. Cost: not per call but call volume (the extra 1,900 of yearly need pushes more years into two-account draws); see the 7N notes. Tests: `tests/quebec_health.js`.
- **Low-income provincial tax reductions (Canada, 7N N6).** Row family `lowIncomeReduction` (null in AB, SK, MB and QC, whose forms have none), figures from the CRA 2025 provincial forms (British Columbia: the 2026 T4127 figures). `kind: 'perReturn'` (Ontario: `multiplier x (basic + child x redKids)` less the tax, off the tax) and `kind: 'income'` (British Columbia: `basic - rate x (net income - base)`) run inside `provincialTaxCA` after the dividend credit and before Ontario's health premium (`redKids` = children born in the last 18 years, claimed by the higher-income partner); `kind: 'family'` (NB, NL, NS, PE) is one household reduction worked out in `incomeTaxCA` by `lowIncomeFamilyReduction` (basic, spouse or eligible dependant, children, PEI age amounts, less a rate on adjusted family income over a base, limited to the sum of both returns' provincial tax, which each `provincialTaxCA` call leaves in the scratch `PROV_TAX.last`). Nova Scotia's 1,000 age tax credit is per return. Amounts index with the BPA flag. `solvePensionSplit` mirrors Ontario's children through `pay.rk`; the family reduction is not in its objective. Not built: Ontario's dependants with an impairment and the LIFT credit (Schedule ON428-A). Tests: the N6 block of `tests/tax_brackets.js`.
- **Medical expense credit (Canada, 7N N5).** `profile.medical` is the year's eligible expenses: the private health premium plus the WHOLE LTC cost (`healthcareCost` now runs before `buildTaxProfile`; owner decision: nursing-home care). One claim a household: `medicalClaimToB(netA, netB, yearIndex)` names the preferred claimant (the lower net income unless that partner is under the basic personal amount), and `incomeTaxCA` and `solvePensionSplit` price the other partner too, keeping the cheaper, only when the preferred return had no federal or provincial tax left for the credit (read from `PROV_TAX.fed` / `PROV_TAX.pre`, written by every `personTaxCA` call) and the other return has some; in Ontario with a 70+ spouse both claimants are always priced on tax less the Seniors Care at Home credit, whose floor depends on the claimant (keep that test a plain `state.province` comparison: reading the rule row in this hot function measured 1.2 to 1.35x slower in every province) (a 65+ partner owes nothing up to about 27,700, so the preferred claim could be wasted; 7N review fix; the low-income reduction and surtax interplay is not priced). `personTaxCA(..., provDeduction, medical)` adds `max(0, medical - min(3% of net income, FED_MEDICAL_THRESHOLD x factor))` to the federal credit base; `provincialTaxCA(..., extraCredit, medical)` does the same from the row family `medical: { threshold, familyIncome }` (Quebec: no dollar floor, 3% of family income). Ontario's refundable Seniors Care at Home credit (`careAtHome` row family; `careAtHomeCredit`) is subtracted in `incomeTaxCA` (net tax can be negative). `solvePensionSplit(..., kids, pay)` mirrors the claimant through `pay.med`. Not built: the federal top-up tax credit, Quebec's refundable medical credit. Tests: the N5 block of `tests/tax_brackets.js`, `tests/medical_credit.js`.
- **Payroll items and the home buyers' amount (Canada, 7N N4 and N10).** `payrollItems(wages, yearIndex)` fills the scratch object `PAY` (read it right after the call; the test hook returns a copy): `cash` (CPP or QPP, CPP2, EI at `payroll.eiRate`, QPIP), `fedCredit` (base CPP/QPP = `pensionRate` less the 1% first additional, plus EI, QPIP and the $1,501 Canada employment amount), `provCredit` (the same without the employment amount; zero in Quebec, which gives no credit for them), `deduction` (the enhanced CPP/QPP: 1% on the band plus the 4% second tier; a deduction from income federally, provincially and in Quebec) and `provDeduction` (Quebec's workers deduction, 6% to $1,450, provincial only). It is computed once a year in `buildTaxProfile` (never inside the solvers): the deduction lowers `otherA/B`, the credit bases ride on the profile as `fedCreditA/B`, `provCreditA/B`, `provDedA/B` (the survivor remap moves B's into slot A) and `personTaxCA(..., childKids, fedCredit, provCredit, provDeduction)` applies them; `solvePensionSplit(..., kids, pay)` takes the same numbers as one object so the split sees them. `payrollTax` returns `cash` for both earners (the cash cost reaches the engine through it). The home buyers' amount is a flat non-refundable credit base in the `rentThenBuy` purchase year (`housingYear.homeValue !== null`): the federal 10,000 and the row's `homeBuyer.amount` (Saskatchewan 15,000, Quebec 10,000; every other province none), on the higher-income partner's return. Not built: Quebec's tax credit for access to homeownership (up to 5,875), the EI/CPP effects of a person who works past 70. Tests: the N4/N10 block of `tests/tax_brackets.js`, `tests/payroll_credits.js` (engine, including the purchase-year plumbing).
- **Spouse, eligible-dependant and child amounts (Canada, 7N N3).** Federal: `federalTaxCA(income, yearIndex, extraCreditBase, claimMinus)` adds `max(0, bpa - claimMinus)` to the credit base, where `bpa` is the claimant's own phased basic personal amount (16,452 to 14,829) and `claimMinus` is the spouse's net income (0 for a dependant child; -1 means no claim). Provincial: each `PROVINCE_RULES` row has `spouse: { amount, threshold }` (CRA TD1 forms 2026; `null` for Quebec) and `childAmount` (Saskatchewan only: 8,358 for each child under 18 besides the one claimed as the eligible dependant); the credit amount is `clamp(amount + threshold - spouse net income, 0, amount)` and indexes with the BPA flag (Manitoba frozen). Quebec has no spouse amount, and its additional amount for a person living alone (single-parent family; 2,681 for 2026) is NOT built: the primary rule (Revenu Quebec guide line 361) gives it only to someone living with a child 18 or over in post-secondary studies who is not entitled to the Family Allowance, so a parent of a minor child gets nothing (the living-alone amount already covers a single parent). `personTaxCA(..., oas, spouseNet, depKids, childKids)`: `spouseNet >= 0` is a spouse claim, `depKids > 0` a single claimant's eligible dependant (one child; the rest are child-amount children), `childKids` the children whose child amount this return claims. `incomeTaxCA` decides who claims: the higher-income partner claims the spouse amount (A on a tie) and the lower-income parent the children (A on a tie); a single person or survivor claims the dependant. `solvePensionSplit(..., oasA, oasB, kids)` mirrors the same rule on the post-transfer incomes (a test that re-prices the split must mirror it too: `claimNets` in `tests/tax_brackets.js`). Children under 18 come from `profile.dependents` (`countKids(deps, 0, 17)`). Not built: the transfer of a spouse's unused amounts. Tests: the N3 block of `tests/tax_brackets.js`, `tests/dependant_amounts.js` (engine), the child scenarios of `tests/survivor_symmetry.js`.
- **Provincial tax (Canada, `PROVINCE_RULES`, 7K).** One data row per province (the 10; no territories) between the `// PROVINCE_RULES:begin` / `end` comments (pure literals, read by `scripts/gen-province-rules.js`, which writes `docs/province-tax-rules.md`; `npm run gen:provinces`; `npm test` fails if it is stale and runs `tests/province_rules.js`, the coverage test). A row declares every field: `creditRate` (the lowest bracket rate: every non-refundable amount is worth that), `brackets`, `bpa` (amount, optional `phase` down to a floor: Manitoba only in 2026; Nova Scotia's phase-down is gone), `age` (amount, threshold, 15% reduction rate, optional unreduced `supplement`: Saskatchewan), `pension` (the provincial maximum), `pooled` (Quebec: age, retirement-income (the lesser of $3,541 and 1.25 times the pension or RRIF income) and living-alone amounts, reduced together by 18.75% of family income over $42,955; a couple's two pools are added and reduced once, each spouse taking a share in proportion to their own amounts: `quebecPoolAmount` and the `partnerPool` argument), `payroll` (CPP or QPP rate and Quebec's QPIP premium; `cppContribution` reads it), `dividend.eligible`, Ontario's `surtax` and `healthPremium`, `indexing` (one boolean per family: Manitoba's schedule is frozen; AB, ON and NS pension amounts are indexed, the flat $1,000 ones are not) and `verified` (primary or secondary per family). `compileProvince` splits each row once per code; `provincialTaxCA(income, yearIndex, dtcBase, age, pensionIncome, familyIncome, partnerPool, spouseNet, depKids, childKids)` allocates nothing: tax on the brackets, less credits at `creditRate` (floored at zero), then Ontario's surtax on that, then the eligible dividend credit against provincial tax only (federal and provincial dividend credits are floored separately; Ontario's surtax comes before its dividend credit, as on form ON428), then the Health Premium (on taxable income, not reduced by credits). `familyIncome` is read only by Quebec: a number for a couple (built in `taxFor` and `solvePensionSplit`), `null` for a single filer or survivor (own income, lives alone). Quebec's 16.5% abatement applies after the federal credits, the dividend credit included. **Not modeled:** a spouse's transfer of unused amounts, non-eligible Canadian dividends (taxed like interest), the Ontario LIFT credit (low-income tax reductions are built in 7N N6 for ON, BC, NB, NL, NS and PE; AB, SK, MB and QC have none). The paid benefits and the Ontario property-tax/rent credit are modeled in 7L (`BENEFIT_RULES`, below). To add a family, add the field to every row, the coverage test and the generator. Verification status and the backlog are in the 7K notes in `docs/next-batches-plan.md`.
- **Income-tested benefits (Canada, `BENEFIT_RULES`, 7L).** One pure-literal data row per program between the `// BENEFIT_RULES:begin` / `end` comments (read by `scripts/gen-benefit-rules.js`, which writes `docs/benefits-rules.md`; `npm run gen:benefits`; `npm test` fails if it is stale and runs `tests/benefit_rules.js`, the coverage test). Row kinds: `gisAllowance` (the six ESDC household situations as `[income, annual benefit]` knots fitted to tables 1 to 5, interpolated by `interpKnots` / `gisAnnual`, scaled with the plan inflation factor), `oasPension` (the 75-plus factor 1.10 and the recommended 2026 amount: **update for 2027**, quarterly-indexed), `familyCredit` (CGEB, Ontario Sales Tax Credit), `childSchedule` (CCB, Ontario Child Benefit, BC Family Benefit, ACFB, Quebec Family Allowance), `seniorSupplement` (Alberta Seniors Benefit), `occupancyCredit` (from rent or property tax: Ontario Energy and Property Tax Credit and senior homeowners grant; 7M adds the New Brunswick property tax allowance, the Nova Scotia seniors property tax rebate, which reads `BEN.gis` and `BEN.allowance`, and the Manitoba homeowners credit, seniors school tax rebate and renters credit, the Manitoba figures are those of the 2025 Form MB479 and scale with plan inflation, the renters credit is limited by the rent paid and the seniors rebate by the tax left after the homeowners credit, the others are unindexed; the coverage test allows scope `on`, `mb`, `ns`, `nb`; the Manitoba homeowners credit proxies school taxes by the whole property tax) and `quebecCredit` (solidarity credit, work premium). Each row has `source`, `asOf`, `retrieved`, `verified` per family (primary or secondary), `indexing` and `dependsOn`. `benefitsFor(profile, gains, traditionalExtra)` fills the module-level scratch object `BEN` (read with `getBenefits()`; the next call overwrites it), allocation-free, in a fixed order (GIS and Allowance first, then the child and credit programs by `state.province`), with an early exit for a household with no children above 125,000 (skipped for Manitoba, whose homeowners and renters credits have no income test). **Net-tax design:** Canada `taxFor` is `incomeTaxCA(...) - benefitsFor(...)` (the benefits are tax-free cash, so net cash is identical to a separate inflow), which lets the shared `drawTaxable` and the Canada solvers price lost benefits as a cost of withdrawing without editing the shared region; rows keep `tax` gross and add `benefits` plus one field per line (`benefitGis`, `benefitAllowance`, `benefitCcb`, `benefitCgeb`, `benefitProvChild`, `benefitProvSenior`, `benefitProvCredit`). Profile fields for it: `oasA/B`, `earnedA/B`, `survivor`, `dependents` (from `dependentsInYear`), `rentPaid`, `propertyTaxPaid` (from `housingForYear`). Same-year income stands in for the prior-year return (an engine convention). `gisIncomeRoom` is the hook the Canada mixed-withdrawal batch (4A) reads. Step cliffs (7M): the New Brunswick allowance tiers and the Nova Scotia rebate (which stops when GIS stops, up to 800) drop in a step, which used to leave the net at the top of the `drawTaxable` bracket (`need * 3 + 1`) below the need and return a negative net (measured: Nova Scotia, single 70, property tax 3,000, other income 32,212, need 100: net -563). `drawTaxable` and the two Canada RRSP solvers (`solveTraditionalForNet`, `solveTraditionalForNetFromNeed`) now widen the bracket (doubling, at most 12 times, up to the pool) only when the net at its top is short of the need, so every draw that did not need it is bit-identical (the snapshots did not move) and the extra cost is one tax evaluation per call (measured +3 to +7 percent, ten percent noise). At a cliff the net is not monotone, so the result is a valid draw, not necessarily the smallest sale. Test: `tests/benefits.js`, "Step cliffs and the withdrawal solvers". Known approximation: where a benefit phases IN as income rises (the CGEB single supplement at 2 percent, later the ACFB and work premium), the net of a taxable sale can exceed the gross, and the shared `drawTaxable` bisection (which starts at the amount needed) over-sells by up to that phase-in amount. 7M completes the ten provinces: the child benefits, family and low-income credits and seniors programs of SK (Low-Income Tax Credit, Income Plan), MB (Child Benefit, 55 PLUS junior component), NS (Child Benefit, Affordable Living Tax Credit), NB (Child Tax Benefit, Working Income Supplement, School Supplement, HST credit, Low-Income Seniors Benefit), NL (Child Benefit, Income Supplement, Seniors Benefit) and PEI (Child Benefit, Island Essentials Benefit) are `childSchedule`, `familyCredit` and `seniorSupplement` rows with a `case` each in `benefitsFor`. Helpers: `countKids(kids, minAge, maxAge)` and `familyCreditCA(R, f, fam, couple, n)` (the CGEB shape: adult, spouse or eligible dependant, per child with an optional `childCap`, reduced over a threshold; `indexing.amountsAndThresholds` decides whether `f` applies). `BEN_NO_EXIT` lists the provinces whose programs pay at any income, which skip the 125,000 early exit: Manitoba (the homeowners and renters credits; the Child Benefit and 55 PLUS are income-tested) and PEI (the Island Essentials Benefit pays at least 175 at any income). Several shapes are readings and are marked secondary in their rows: the Saskatchewan Seniors Income Plan follows its regulation (RRS c S-25.1 Reg 3 s. 5(2), read from the consolidation through SR 39/2023): the maximum falls by 1.90, 2.10 or 6.55 dollars per dollar of base GIS reduction, which is a straight line from the maximum at no income to the published nil point for a single person, a couple and a spouse on the Allowance (190 bands of 24 and 155 bands of 48 reproduce 4,560 and 7,440), and flat at the maximum to income 9,184 then to the published 11,568 for a pensioner whose spouse is not a pensioner (the regulation formula alone gives about 11,822) and the Manitoba Child Benefit is a straight line between the published full-benefit income and the published nil point, the Saskatchewan credit rate is derived from the published maximum and nil income, the Manitoba 55 PLUS senior component (Regulation 65/90 tables by household type) and the NL Nutrition Supplement (150 a month a child under five, with the Child Benefit) are built from their primary pages, the NL Income Supplement phases IN with family income between 15,000 and 20,000 (the known `drawTaxable` phase-in limitation; the NB Working Income Supplement phases in on earned income, which a withdrawal does not change), the Manitoba 55 PLUS junior component is not paid to someone who receives the Allowance (an OAS Act benefit), and the Saskatchewan single-parent amount (eligible dependant plus child amounts) is a reading. Not built: the CSV export has no benefit columns (the export is a shared region); the NL pregnancy and birth parts of the Nutrition Supplement; the PEI provincial property tax credit (needs the assessed value), Manitoba Rent Assist and the Nova Scotia heating rebate (inputs we do not have); disability benefits; low-income tax reductions; the prior-year lookback. Tests: `tests/benefit_rules.js`, `tests/gis_tables.js` (every row of the ESDC tables, from `docs/sources/gis-tables-2026q4.json`), `tests/benefits.js` (hand-computed cases citing the page or statute).
- US models a 10% early-withdrawal penalty (`ruleOf55Enabled`,
  `sepp72tEnabledA`/`sepp72tEnabledB`, `singleLifeDivisor(age)`) on
  traditional/bondTraditional withdrawals before 59.5; Canada has no
  equivalent to build, since RRSP/RRIF withdrawals carry no age-based
  penalty at any age (only withholding tax, already captured via
  `taxFor()`) — don't port this feature to Canada.
- `traditional`/`bondTraditional` are one pooled household balance (not
  separate per-partner accounts), but RMDs, the 72(t)/early-withdrawal
  penalty fraction, and 72(t) SEPP sizing all need to know each partner's
  own share of that pool. Since Batch 3A that share comes from the account
  inputs (see "Retirement accounts (US)" above); the former
  `state.traditionalSharePctA` slider (0-100, default 50) is gone, and the text below
  describes how the shares are used; `traditionalShareA`/
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
  `age >= 65 && !working` (Medicare starts at `max(65, that partner's
  retirement age)`: a partner still working at 65 stays on the employer plan and
  enrolls the year they stop, no late-enrollment penalty modeled; independent of
  the other partner), and IRMAA follows the same gate) — unlike ACA marketplace
  eligibility, which also depends on the spouse. Canada has no equivalent split to
  build: `state.healthcare` there is a flat "supplemental private
  insurance once retired" figure with no age-65 transition at all, because
  provincial coverage (OHIP/MSP) is universal at every age — if anything,
  some provinces' senior drug programs (e.g. Ontario Drug Benefit at 65)
  argue for *lower* supplemental cost at 65, not a new mandatory expense —
  don't port `medicareYearly` to Canada.

## Add-as-you-go lists (loans, extra income, extra expenses, one-time items)

`state.loans`, `incomeSources`, `oneTimeIncome`, `extraExpenses`,
`lumpExpenses` (and `children`, below) are arrays that **default to `[]`** (cap `LIST_MAX = 10`);
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
`state.children` is a seventh DYN list (ids `child<i>BirthYear` / `child<i>Student`; group `#childrenGroup`,
`data-cat="profile"`, inside the shared `html-spendingTiersGroup` markup region; its copy lives in each
planner's `DYN.children` spec, so Canada's note says it feeds the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child benefits). A row is `{ birthYear, student }`;
`normalizeLists` (shared) clamps the year to the **fixed** bounds `CHILD_BIRTH_YEAR_MIN/MAX` (1950-2100, never
relative to the clock, so a saved year cannot drift on reload), drops rows without a usable year, and keeps
`student` only when literally `true`. Nothing is adjusted for children automatically (spending stays the
user's). `dependentsInYear(taxYear)` (shared, in the `01-LIST_MAX` fragment, takes a CALENDAR year; the US
engines pass `taxYearOf(yearIndex)`) returns `{ age, student, qualifyingChild }` per child born by then, with
`age = taxYear - birthYear` (a birth year counts as age 0 for the whole year). `qualifyingChild` is the
federal rule: `age <= 18`, or `age <= 23` for a full-time student; each credit applies its OWN cutoff to `age`
(the Child Tax Credit is `age <= 16`; the child-care credit would be `age <= 12`). Qualifying relatives and
disabled-at-any-age children are not modeled. `dependentsInYear` returns a shared frozen empty array when there
are no children (hot path; do not mutate the result). **US plumbing:** `buildTaxProfile` puts
`profile.dependents` on every profile (including the survivor remap: children stay with the surviving
parent), and `acaHouseholdSize(singlePerson, isSurvivorPeriod, yearIndex)` (adults plus qualifying children)
feeds both `acaNetCost` (via `healthcareCost`) and the 400%-FPL guard in `conversionMagiCeiling`, so cost and
guard cannot drift apart. Profiles built elsewhere (the Roth solver and optimizer literals) have no
`dependents`: a consumer must treat a missing list as none. Canada reads it through `dependentsInYear(CURRENT_YEAR + year)` for the income-tested
benefits (7L: the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child
benefits); no Canadian tax credit uses it. Tests: `tests/child_dependents.js` (in `npm test`), `test_children.js`.
Test: `node test_dynamic_lists.js`, `node test_spending_and_fi_widgets.js`.

## First-run wizard

`#wizardModal` is a list of `[data-wizard-step]` panels in document order, each carrying its own
`data-title` and `data-note` (the shared `28-wizardOverlay` fragment adds "Step i of N"). The US wizard
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
- `docs/reference.md`: Batch 1 was consolidated into it early (2026-10-03, at the
  owner's request; see its "Batch 1" section). For the remaining batches in
  `docs/next-batches-plan.md`, do **not** edit it per batch unless the owner asks.
  Append findings (decisions, verified
  figures with primary-source citations and dates, gotchas, before/after
  tables) to that batch's "Batch notes" section in `docs/next-batches-plan.md`
  in the same PR; one consolidation PR moves them into `docs/reference.md`
  after the last batch. Outside that plan, update `docs/reference.md` in the
  same batch of work as before.
- The repo may exist as multiple independent local clones with no shared
  remote, so these docs — kept current in the repo itself — are what let a
  future session with no memory of this conversation pick up accurately from
  the repo contents alone.
