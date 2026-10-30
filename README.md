# FIRE Planner

Offline, single-file retirement projection tools (FIRE: Financial Independence, Retire Early) for a couple or a
single person, one for the US and one for Canada. Each runs entirely in the browser: no server, no account, no
network, and nothing leaves your device.

The planners show projections from the assumptions you enter. They are planning estimates, not financial, tax or
investment advice; the "Limitations & disclaimer" section in each planner lists what is and isn't modeled.

MIT licensed, see [LICENSE](LICENSE).

## Running it

```bash
npm ci
npm run build
```

`npm run build` writes `dist/Planner_US.html`, `dist/Planner_Canada.html` and a landing page, `dist/index.html`.
Open any of them in a browser; each planner is one self-contained file. `npm run dev` rebuilds on every save.

Your inputs autosave to the browser's local storage, per file location; use scenario export and import to move a
plan between copies.

## Features (both planners)

**Household and timeline**
- Couple or single person, each partner with their own age, income, retirement age and planning horizon.
- Lists you add to as needed: income streams, recurring and one-time expenses, one-time income, spending changes
  by age, extra loans and children.
- Housing: own (with a mortgage and optional extra payments), rent, or rent then buy; property tax and insurance
  tracked separately.
- Pre- and post-retirement healthcare premiums, optional long-term-care costs, and medical inflation above CPI.

**Investments and withdrawals**
- Separate return assumptions for stocks, bonds and cash; dividends and interest taxed yearly; cost basis tracked on
  the taxable account.
- A bond reserve sized in years of expenses, built before retirement and refilled after it.
- A default withdrawal order (taxable, tax-deferred, tax-free, cash, bond reserve, home equity last), with an
  optional proportional mode that draws taxable and tax-deferred together.
- Optional Guyton-Klinger guardrails that adjust spending when the withdrawal rate drifts.
- Optional survivor modeling: one partner dies at a chosen age, with the survivor's benefits, taxes and spending
  following from that.

**Results and analysis**
- Headline tiles: assets at retirement, FI and FIRE numbers at an adjustable withdrawal rate, and how long the
  portfolio lasts; a plan status bar stays pinned as you scroll.
- A year-by-year table and chart, in today's or future dollars, with CSV export and a printable report.
- Chart views: retirement date ±1 or ±3 years, a 0–7% real return sweep, a historical backtest over 1928–2025 S&P
  500, Treasury and CPI data, and a Monte Carlo view built from 5-year blocks of the same history.
- A sensitivity (tornado) chart showing how end assets move when one assumption changes.
- A cash-flow diagram for any single year.
- "What do you want to figure out?" questions that compare the current plan against alternatives (retire earlier,
  buy or rent, pay down the mortgage, live longer, and others).
- A banner that names the likely cause when a projection runs out, and the smallest spending cut or retirement
  delay that would change that outcome in the projection.
- Named scenarios with a comparison table and overlay chart, plus JSON export and import.

**Ease of use**
- A guided setup wizard, a field search, short field descriptions with info bubbles, and summaries on collapsed
  sections.
- Markers for fields still at their example values, and a warning for modeling assumptions outside a realistic range.
- Light and dark mode, a mobile layout with Inputs and Dashboard tabs, and keyboard and screen-reader support.
- In-page MCP tools (`read_fire_projection`, `update_fire_assumptions`) for reading and changing the projection
  programmatically.

## US planner

**Taxes**
- Federal brackets for every filing status (joint, single, head of household, surviving spouse), with an optional
  "marry later" age.
- Income tax for all 50 states and DC from one researched rules table (see `docs/state-tax-rules.md`).
- Standard or itemized deduction, the senior deduction, the Child Tax Credit and Credit for Other Dependents, the
  QBI deduction, payroll taxes including the Additional Medicare Tax, and self-employment tax.

**Accounts and income**
- Four retirement accounts per partner (traditional and Roth 401(k) and IRA), with employer match, profit sharing,
  catch-up contributions, the mega backdoor Roth and the IRS contribution limits.
- Roth access rules (basis, five-year conversions, earnings), the 10% early-withdrawal penalty per account,
  Rule of 55 and 72(t) payments, and required minimum distributions.
- Self-employment with a Solo 401(k), W-2 income streams with their own plan contributions, and inherited
  traditional and Roth accounts under the 10-year rule.
- Social Security with a start age per partner.

**Healthcare**
- ACA premium tax credit (the 2026 rules, or the enhanced-subsidy bands as an option), Medicaid eligibility, and
  employer coverage of a retired spouse.
- Medicare premiums and IRMAA surcharges, with the two-year income lookback.

**Conversions and planning**
- A Roth conversion ladder that fills a chosen federal bracket, capped below the ACA cliff and the next IRMAA tier.
- The cliff plan (on by default): picks the years to keep income under an ACA, Medicaid or IRMAA line, or to fill
  above one, and, with conversions on, compares the other conversion brackets and per-year conversion sizes; it
  keeps a choice only when the projection does not run out sooner.
- An optional tax-aware withdrawal order: the cliff plan also picks years to draw traditional money before taxable,
  and, on separate returns, whose accounts to draw first.
- A Roth conversion bracket search card that shows the after-tax end value at each bracket and the conversion
  schedule of the plan in use.
- A Plan optimizer card that searches whole cliff plans for the objective you choose and can apply the plan it
  finds; an applied plan is used only while it still beats the automatic plan on your current inputs.

## Canada planner

- Federal tax and all 10 provinces (see `docs/province-tax-rules.md`), including the federal and provincial
  credits, the Ontario Health Premium and Quebec's abatement and health contributions.
- RRSP, TFSA and FHSA accounts with contribution room, RRIF minimums from 71, and CPP or QPP and EI while working.
- CPP (start 60–70) and OAS (start 65–70), with the OAS recovery tax.
- Income-tested benefits: GIS and the Allowance, the Canada Child Benefit, the Groceries and Essentials Benefit,
  and provincial benefit programs (see `docs/benefits-rules.md`).
- Pension income splitting between partners, solved for the lowest combined tax.
- An RRSP meltdown ladder that fills a chosen bracket and moves the proceeds to the TFSA, with a bracket search card
  that shows the after-tax estate at each bracket.
- An after-tax estate figure that includes the tax on the RRSP/RRIF, deemed gains and provincial probate fees.

## Development

The source is in `src/`: `src/us/` and `src/canada/` for each planner and `src/shared/` for code both use. Edit
`src/`, never `dist/`. `CLAUDE.md` holds the development rules, and `docs/architecture/` explains each area of the
code.

- `npm test` builds `dist/`, then runs the structural checks, the Vitest unit tests and the golden math tests
  (exact to the cent).
- `npm run test:ui` builds and runs the Playwright UI scripts (`test_*.js` at the repo root).
- CI (`.github/workflows/test.yml`) runs both on every push and pull request to `main` and keeps the built `dist/` as
  the `fire-planner-dist` artifact.

The built filenames never change; each planner shows a version badge in its header, and the history is in `git log`.
