# First real-user feedback: plan, easiest to hardest (2026-11-15)

Notes from a first real user of the US planner (written 2026-11-09, on about V175), plus one item from the owner
(revolving debt, 2026-11-15). The user's recurring theme: let a person test a wider range of futures, and make sure
the planner never looks rosier than it should. This file orders the work by how hard it is to build, not by value.
Each item names the feedback point it answers (#1-#12 in the user's numbering) and what already exists.

Sizes: **hours** (copy only), **a day**, **2-4 days**, **a batch** (a week or more, its own spec). Every item that
adds an input defaults to the current behavior, so no existing projection or snapshot moves unless stated.

## Already covered: say so, don't build

Answer these in the reply to the user and in the UI copy (tier 1), not with new features:

- **#7 timing of losses, losing streaks:** the Market scenario card (a crash at any age, its depth, how long the fall
  lasts and how much comes back, presets from 1929 to 2022, or a replay of real history from a chosen year).
- **#5 inflation, partly:** the historical backtest and Monte Carlo use each year's real CPI with its stocks and bonds,
  and a scenario crash already takes its own inflation and bond return for the years of the fall (`msInflation`,
  `msBondReturn`; `scenario-source.js`). What is missing is an inflation spell with no crash (C3).
- **#9 Monte Carlo, partly:** it samples 5-year blocks of history, so inflation and bond returns vary with stocks.
- **#10, partly:** Guyton-Klinger guardrails cut spending after bad markets.
- **#11 amortized debt:** the "+ Add a loan" list. Revolving debt is not covered (B3).

## Tier A: copy only (hours each; one PR for all four)

- **A1. FIRE prerequisites (#2).** A short "Before you rely on this" block: the projection assumes you spend what you
  enter, keep saving what you enter, and carry no debt you left out; FIRE needs that discipline. Put it on the wizard's
  first step and in the Limitations section. Text only.
- **A2. Expense accuracy (#3).** The spending field's info bubble and the guidance card's spending line: base it on 12
  months of actual spending, including irregular costs (car, home repairs, gifts, travel), not on a budget; and count
  the full card payoff, not the minimum payment (this links to B3). Text only.
- **A3. What stays fixed (#6, #10).** An "Assumptions" paragraph: each asset class has one return for the whole run;
  the bond reserve is sized in years of expenses, built before retirement and refilled after; contributions go to the
  accounts as entered; there is no rebalancing or glide path; guardrails are the only response to markets; cash earns
  one rate. Text only, until C4 and D2 change it.
- **A4. Point to the stress tests (#5, #7, #9).** The inflation and return fields' info bubbles name the Market
  scenario card and the historical and Monte Carlo views. Text only.

Version badge bump; `snapshot_ui` text hashes move (stated in the commit).

## Tier B: small input and engine changes (about a day each; one PR each)

- **B1. Social Security start age past 70 (#12).** The benefit is already used as entered from the start age
  (`src/us/core/income/social-security.js`), so this is the field's `max` (70 to 75), its clamp in
  `normalizeState`, and the info bubble: past 70 there are no further delayed credits under current law, so a later
  age only models a raised retirement age; enter the benefit you expect then. Check the wizard and `guidance-fields`
  for a 70 assumption. Add a Vitest case at 72.
- **B2. Social Security benefit cut (#12).** Batch 6, item 5, already specified in `docs/next-batches-plan.md`
  (`ssBenefitCutPct`, `ssBenefitCutStartYear`, a "Use the Trustees' projection" button that sets 22% from 2033).
  Pull it forward on its own; it needs none of the rest of Batch 6. The cut must reach the taxable-benefit calculation
  (Pub. 915) and the MAGI the ACA and IRMAA read, which happens automatically if it is applied where the benefit is
  computed. Survivor symmetry still holds.
- **B3. Revolving debt (#11, owner).** A loan row gets a type: amortized (today) or revolving (a credit card or line
  of credit): balance, APR, and the payment. **Open decision (owner):** the payment is a fixed amount you choose; the
  card's minimum (a percent of the balance with a dollar floor); or the larger of the two. Interest accrues monthly
  on the balance as in `loanSchedules()` (`src/shared/core/income/spending-and-loans.js`), and the row returns the
  same `{ payments, balances }` schedule, so nothing downstream changes. A warning when the payment does not cover the
  first month's interest. Both planners (the list is shared). Needs a `type` guard in `normalizeLists`, `showIf` for
  the fields of each type, and the guidance and Sankey labels. Variable rate: one APR for the whole run (a schedule of
  rates is out of scope; say so in the bubble).
- **B4. Lead with the cautious figure (#1).** The verdict already carries a line about how the plan fared in
  historical markets. Decide with the owner which figure leads: the average-market verdict (today), or the share of
  historical start years that last, with the average beneath it. UI and wording only; the historical cycles already
  run in the deferred render. **Open decision (owner):** which figure leads, and whether the verdict's Comfortable /
  Tight / Short label is judged on it.

## Tier C: medium (2-4 days each; one PR each, a short design first)

- **C1. Cash rate over time (#7).** In historical, Monte Carlo and history-replay years the cash account earns the
  year's Treasury yield (the data already carries it: `bondYield` in `year-sources.js` / `scenario-source.js`)
  instead of the fixed `hysaRate`, minus a spread the user sets. A switch, default off, so no number moves until it is
  turned on. Touches `investmentIncome` and `growBalances` in both engines, and historical parity
  (`tests/unit/us/historical-parity.test.js`).
- **C2. Federal tax-rate what-if (#4).** "Federal income tax rates up N percent from year Y" (and a preset for a
  named change if the owner wants one). Scale the bracket *rates*, not the thresholds, so the conversion bracket
  targets and the cliff plan's bracket fills keep their meaning. It reads only `ctx.inputs`, so the result cache keys
  it with no change. Hot path: the scale is a per-year factor read once, not per bracket call; time it with
  `tests/bench_runs_interleaved.js`. US first; Canada's federal table takes the same switch later. State tax is out of
  scope (point the bubble at E4 for state).
- **C3. An inflation spell without a crash (#5).** A Market scenario kind "Inflation spell": inflation N percent for
  K years from an age, with its own bond return and an optional stock return, built on the crash path's existing
  `c.inflation` / `c.bondReturn` handling. Everything that follows inflation (spending, benefits, brackets, limits) moves
  through the scenario's `taxFactors` path already. The user's "hold expenses fixed" point: spending entered in
  today's dollars rises with inflation by design; say so in the scenario's description.
- **C4. Social Security means test (#12).** "Cut Social Security by X percent in a year when liquid assets were over
  $Y (today's dollars)." Read the *previous* year-end balances, so the test does not enter the MAGI iteration (a
  same-year test would, and every new estimate there has the snapshot rules of `magi-iteration.md`). Builds on B2's
  cut path. Default off.

## Tier D: a batch each (a week or more; own spec, per-PR plans, reviews)

- **D1. State relocation (#8).** Batch E4, already specified in `docs/next-batches-plan.md`: a "+ Add a move" list,
  one state per year, read by `stateIncomeTax`, `taxFor`'s no-tax fast path, the Medicaid line, `magiThresholds` and
  `lambdaEstimate`.
- **D2. Asset allocation over time and rebalancing (#6, #10).** A target stock share by age (a glide path), with
  rebalancing toward it each year, in place of today's fixed stocks plus a bond reserve. Touches every account's
  growth, the bond reserve and refill, the withdrawal order, the bucket mode of market scenarios, historical parity,
  and both engines. The largest item here; decide first whether it replaces the bond reserve or sits beside it.
- **D3. Monte Carlo beyond returns (#9).** Seeded random shocks: a job loss before retirement (a gap in earned income
  with a yearly probability), an expense shock (a one-time cost), and optionally income growth drawn around its mean.
  Cost: Monte Carlo runs 1,000 paths, so each shock must stay cheap; the result cache key must cover the new settings.
- **D4. Responses to markets beyond guardrails (#10).** For example, delay retirement a year or move to a more
  conservative allocation after a drawdown. Needs D2 for the allocation response. Last, and only if users ask after
  seeing the guardrails.

## Suggested order

A (one PR) → B1 → B2 → B3 (after the owner's payment decision) → B4 (after the owner's decision) → C1 → C2 → C3 → C4
→ D1 (E4, already next on the roadmap after Batch 5) → D2 → D3 → D4.

Value can reorder this: B2, B3 and B4 answer the user's "too rosy" worry most directly and are cheap, so they could go
before A. D1 is already scheduled in `docs/roadmap.md`; the rest of tier D goes there only once the owner picks it.
