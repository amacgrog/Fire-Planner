# FIRE Planner

Offline, single-file retirement projection tools (FIRE: Financial Independence, Retire Early) for a couple or a
single person, one for the US and one for Canada. Each runs entirely in the browser: no server, no account, no
network, and nothing leaves your device.

The planners show projections from the assumptions you enter. They are planning estimates, not financial, tax or
investment advice; the "Limitations & disclaimer" section in each planner lists what is and isn't modeled.

MIT licensed, see [LICENSE](LICENSE).

## Running it

The latest `main` is hosted at https://amacgrog.github.io/Fire-Planner/ (published by CI). To build your own copy:

```bash
npm ci
npm run build
```

`npm run build` writes `dist/Planner_US.html`, `dist/Planner_Canada.html` and a landing page, `dist/index.html`.
Open any of them in a browser; each planner is one self-contained file. `npm run dev` rebuilds on every save.

Your inputs autosave to the browser's local storage, per site or file location, so the hosted page and a local copy
keep separate data; use scenario export and import to move a plan between copies.

## Features (both planners)

**Household and timeline**
- Couple or single person, each partner with their own age, income, retirement age and planning horizon.
- Lists you add to as needed: income streams, recurring and one-time expenses, one-time income, spending changes
  by age, extra loans and children. Every row of the lists but children takes an optional name (shown in the row header).
  A loan is either fixed-term (amortized from its original principal and term) or a credit card or line of credit: a balance
  and APR paid each month at the larger of the payment you choose and the card's minimum (a percent of the balance with a
  dollar floor), with the payoff time and total interest shown on the row, and a warning when the payment does not cover the
  interest.
- Housing: own (with a mortgage and optional extra payments), rent, or rent then buy; property tax and insurance
  tracked separately.
- Pre- and post-retirement healthcare premiums, optional long-term-care costs, and medical inflation above CPI.

**Investments and withdrawals**
- Separate return assumptions for stocks, bonds and cash; dividends and interest taxed yearly; cost basis tracked on
  the taxable account.
- A bond reserve sized in years of expenses, built before retirement and refilled after it.
- The bond reserve can start held (opt-in): the balances you enter already include the bonds, with nothing sold and no tax, and the reserve is in bonds from the first year, so a crash in the first retired years falls on the stocks only. The default builds it from stocks over the years before retirement (a plan that retires this year: over its first retired years), and says so for a plan that retires this year.
- US: a slider sets how much of the retirement bond reserve sits in traditional accounts and how much in Roth (default all traditional first, as before). It applies to the held reserve, the build before retirement and each refill; when the accounts cannot hold the share, a line under the slider says what the reserve held at retirement.
- A default withdrawal order (taxable, tax-deferred, tax-free, cash, bond reserve, home equity last), with an
  optional proportional mode that draws taxable and tax-deferred together.
- Optional Guyton-Klinger guardrails that adjust spending when the withdrawal rate drifts.
- Optional survivor modeling: one partner dies at a chosen age, with the survivor's benefits, taxes and spending
  following from that. Other loans are paid off in the year of the death and owe nothing after it (the mortgage
  runs on).

**Results and analysis**
- A Market scenario card: design one or more crashes (depth, timing, how much comes back and how fast, with presets from
  real episodes, from the Great Depression with its 1937 second fall to 2022, that can also set the drop and recovery), an
  inflation spell with no crash (inflation, bond and optional stock returns for a run of years from an age, with presets like
  1966–81 and 2021–23; spending and benefits entered in today's dollars rise with it, wages keep the plan's growth), or
  replay real market history from a chosen year and age, preview it against your plan, then run the whole planner inside it,
  optimizers included, and revert with one click.
- A plan verdict card at the top of the results (Comfortable, Tight or Short) with a plain sentence: how long your money
  lasts and how much more a year you could spend (or must cut) and still make it, in today's dollars (with guardrails on,
  how deep they cut instead); a line under it says how the plan fared in historical markets, or names the market scenario
  that is on. The word is judged on both: when the average market alone would read Comfortable but history does not, the
  sentence says so and how many historical starting years ran out, and the status bar reads "Tight (history)". For a
  couple the sentence's ages name the partner whose life expectancy ends the plan ("lasts through B's age 100"), and so do the moves and goal answers. Hover or tap the room figure (or, when the money runs out, the cut figure) for a gauge of your spending against the most the plan supports (not shown
  with guardrails or spending changes by age). Running out at the last age of the plan reads "runs out during the plan's last year". The pinned plan status bar shows the verdict too. A loan or card balance still
  owed at the end of the plan makes the word Tight at best, and the sentence names it ("But $2.4K (today's dollars) of debt is
  still owed at age 100"); the moves card then says to raise its payment, since no move tested there clears a debt. A card
  with a 0% minimum, a $0 floor and no payment is read as a 1% minimum.
- Headline tiles: assets at retirement, FI and FIRE numbers at an adjustable withdrawal rate, and how long the
  portfolio lasts; a plan status bar stays pinned as you scroll.
- A year-by-year table and chart, in today's or future dollars, with CSV export and a printable report. The CSV (in the dollar
  view on screen) has every year's income by source, withdrawals by account, conversions, spending by category, taxes,
  contributions and balances, and in the US each partner's IRA, 401(k), Roth IRA and Roth 401(k); the report adds a
  year-by-year cash-flow table, lifetime taxes and today's balances.
- Chart views: retirement date ±1 or ±3 years, a 0–7% real return sweep, a historical backtest over 1928–2025 S&P
  500, Treasury and CPI data, and a Monte Carlo view built from 5-year blocks of the same history.
- A Cash flow chart view (money in by source, stacked, against spending and taxes each year) in three styles: Bars + lines,
  In / out and Simple; the chosen style is remembered between visits. Both planners.
- A cash-flow diagram for any single year, in five columns: each source (named list rows by their name), its group (earned income, other inflows, retirement income, from savings, any shortfall), the year's total, then the groups out (taxes, essentials, everyday spending, extra & one-time, savings) and each use. Hover or tap a band for its amount and share of the year. A full-screen button opens the diagram over the whole window; on a phone the card shows a "View full screen" button, and full screen shows money in above money out when the phone is upright and all five columns (scrolling sideways) when it is turned.
- Goal answers under the verdict: one short answer per goal you pick (the retirement ages the plan lasts from and is
  Comfortable from, how much you can spend, whether Roth conversions or the RRSP meltdown pay, the ACA years the cliff plan
  steers in the US, owning against renting, a death in the couple, what you leave behind), each with a link to the setting or
  card behind it.
- On a Tight or Short projection, up to four tested moves (retire later, for a partner still working; spend less; turn on a
  feature such as conversions, the withdrawal order, the meltdown, pension splitting or guardrails), fixing moves first, each
  with its measured result and a Try button that previews the change with Keep and Revert.
- Named scenarios with a comparison table and overlay chart, plus JSON export and import.

**Ease of use**
- A guided setup wizard in three steps (the basics, your balances with the Roth basis in the US, then "What are you trying to decide?", where the goals you tick turn on the matching feature and choose what the guidance card asks about first), a field search, short field descriptions with info bubbles, and summaries on collapsed
  sections.
- Markers for fields still at their example values, and a warning for modeling assumptions outside a realistic range.
- Plain statements of what the projection takes on trust: a "Before you rely on this" note on the wizard's first step and
  in the methodology card (you spend and save what you entered and owe nothing you left out), an "Assumptions: what stays
  fixed" section (one rate per holding, the bond reserve, contributions, no rebalancing or glide path, the guardrail rule),
  spending help in the wizard, the spending bubble and the guidance card (12 months of actual spending, irregular costs, cards paid in
  full), and return and inflation bubbles that point to the Market scenario card and the Historical and Monte Carlo views.
  The methodology card's "How this was checked" section says what was verified and what was not: the hand-worked
  tests, a one-year hand check of sample households against the official forms (and the errors it found), every state
  and province traced to its own sources, and the limits (one year's tax, retired households only, the same AI that
  wrote the planner did the checks).
- A guidance card under the verdict: pick your goals (when you can retire, how much you can spend, Roth conversions or the
  RRSP meltdown, health cover before Medicare in the US, the house, a survivor, what you leave behind) and it lists the
  fields still at their example values that matter most for them, each with about how far a realistic error in it moves your
  spending room (or why it matters, for the tax-state or province choice and the US Roth basis). Basics still at their
  example value (ages, retirement ages, income, spending, balances) come first, marked "Still the example value: enter
  yours." The rest are under
  "Everything else". Goals only filter the list, never change the plan, and are saved with it. "Review →" walks the ranked
  list one field at a time; "Next →" confirms the field and moves on.
- Results wait for a pause in the input: a dragged slider redraws once it is still for 150 ms, a typed number 400 ms
  after the last keystroke (at once on Enter, Tab or releasing the slider), so typing 120000 does not redraw per digit.
- Light and dark mode, a mobile layout with Inputs and Dashboard tabs, and keyboard and screen-reader support.
- In-page MCP tools (`read_fire_projection`, `update_fire_assumptions`) for reading and changing the projection
  programmatically.

## US planner

**Taxes**
- Federal brackets for every filing status (joint, single, head of household, surviving spouse), with an optional
  "marry later" age.
- A federal income-tax rate what-if: every bracket rate scaled by a percent (-50% to +50%) from a calendar year on, the
  brackets' income ranges unchanged, with a box (ticked by default) that scales the 15% and 20% capital-gains and
  qualified-dividend rates too; a "Rates rise 20% from 2030" button applies a plain stress test, and with a change on reads
  "Remove the rate change". Payroll tax, the NIIT and state tax are not scaled.
- Income tax for all 50 states and DC from one researched rules table (see `docs/state-tax-rules.md`).
- Standard or itemized deduction, the senior deduction, the Child Tax Credit and Credit for Other Dependents, the
  QBI deduction, payroll taxes including the Additional Medicare Tax, and self-employment tax.

**Accounts and income**
- Four retirement accounts per partner (traditional and Roth 401(k) and IRA), with employer match, profit sharing,
  catch-up contributions, the mega backdoor Roth and the IRS contribution limits. Each partner picks Traditional or
  Roth separately for their own 401(k) and their own IRA contributions.
- The traditional IRA deduction phases out for a partner covered by a workplace plan (IRC 219(g), the 2026 ranges); the
  nondeductible part is still contributed and becomes after-tax basis.
- Traditional IRA after-tax basis per partner (a slider for the share of today's balance, plus the nondeductible
  contributions): draws, RMDs, 72(t) payments and Roth conversions come out pro rata, partly tax-free (Form 8606).
- A backdoor Roth box per partner ("Roll funds over the phase-out limit to Roth"): each year the nondeductible part of that
  partner's traditional IRA contribution is converted to their Roth IRA, taxed pro rata on their whole traditional IRA.
- Roth access rules (basis, five-year conversions, earnings), the 10% early-withdrawal penalty per account,
  Rule of 55 and 72(t) payments, and required minimum distributions.
- Self-employment with a Solo 401(k), W-2 income streams with their own plan contributions, and inherited
  traditional and Roth accounts under the 10-year rule.
- Social Security with a start age per partner (62 to 70, or up to 75 under an "if the law changes" switch for a
  raised earliest claiming age). Each amount is entered either as paid at the start age or as the benefit at full retirement
  age, which the planner adjusts with SSA's claim-age factors (70% at 62 to 124% at 70 for anyone born 1960 or later; full
  retirement age from the age and the tax year); an "already collecting" box per partner, a start age already past read as
  claiming now, and a guided entry for SSA's Quick Calculator.
- A widowed person's survivor benefit on the late spouse's record (single-person plans): enter SSA's quote at full
  retirement age and when it starts (60 to 70; reduced up to 28.5% before the survivor full retirement age); it is paid
  alongside your own benefit as the higher of the two, in either order. An optional earlier SSA quote finds the widow's limit
  when the late spouse had claimed early; check lines compare the planner's figures with SSA's quotes. With survivor modeling
  for a couple, SSA's survivor rules apply when the late partner's amount is entered at full retirement age (their claim and
  delayed credits, the widow's limit, the survivor benefit from the death year or 60, no survivor benefit for an unmarried
  couple).
- SSA's spousal benefit for a couple (with the amounts entered at full retirement age, or 0 for a spouse with no own
  benefit): a spouse whose own amount is under half the other's also gets the difference, from the later of the two start ages
  (deemed filing), 62 and a year of marriage, reduced for the spouse's age then (65% at 62 for anyone born 1960 or later), with
  no delayed credits; a check line under the basis choice shows it.
- A "When to claim Social Security" card for a single person, a couple and a widow(er) (with the amounts entered at full
  retirement age): it runs your plan once for every claiming age, for a couple every pair of start ages (Partner A's by
  Partner B's), and for a widow(er) every survivor start (60 to the survivor full retirement age) by every own start, and ranks
  them (money that never runs out first, then the after-tax end value, then the later run-out age); with the cliff plan on, the
  best few are re-checked with their own cliff plan. A shaded grid, the best choice if the plan ends at 80, 85, 90 or 95 (not
  for a couple: survivor modeling covers the first death), for a couple the best "same age for both" pair, and one-click Apply
  (undoable). Standard projections with guardrails off.
- A Social Security benefit-cut what-if: a percent cut of every benefit (each partner's and the survivor's) from a
  calendar year on, reaching taxes and the ACA and Medicare income tests; a "Use the Trustees' projection" button sets
  the 2026 Trustees Report's 22% from 2033 (the bubble notes the payable share falls to about 62% by 2100, so a long plan
  can test a larger cut); with a cut on, the same button reads "Remove the benefit cut" and sets it back to 0 (with an
  undo). A higher full retirement age is modeled as a cut.

**Healthcare**
- ACA premium tax credit (the 2026 rules, or the enhanced-subsidy bands as an option), Medicaid eligibility, and
  employer coverage of a retired spouse.
- Medicare premiums and IRMAA surcharges, with the two-year income lookback.

**Conversions and planning**
- A Roth conversion ladder that fills ordinary income, the year's own traditional withdrawals included, to the top of a chosen
  federal bracket, capped below the next IRMAA tier and, while the year's income without the conversion is under it, below
  the ACA cliff (with the cliff guard off, below the ACA cliff in every marketplace year, as before).
- The cliff plan (on by default): picks the years to keep income under an ACA, Medicaid or IRMAA line, or to fill
  above one, and, with conversions on, compares the other conversion brackets and per-year conversion sizes, including
  turning a run of over-the-cliff conversions off at once, or not converting at all; it keeps a choice only when the
  projection does not run out sooner. The plan search can also turn a year's conversion off when that helps over the whole run.
  A conversion start-age search (Off / Quick / Thorough, Quick by default) also tries starting the conversions at later ages
  inside the window and keeps a later start only when the plan lasts at least as long and leaves more after-tax money at the end.
  A year whose income before any withdrawal is already over the planned IRMAA tier stays under the next tier instead.
- An optional tax-aware withdrawal order: the cliff plan also picks years to draw traditional money before taxable,
  and, on separate returns, whose accounts to draw first.
- A Roth conversion bracket search card that shows the after-tax end value at each bracket, and with no conversions
  at all (suggested, with a link to the sidebar box, when not converting does better), and the conversion
  schedule of the plan in use. The schedule lists every year of the conversion window, and any other year that converts or was held,
  with the reason for each: the bracket filled, or what held the conversion (the ACA 400% line, an IRMAA tier, the cliff
  plan's stay-under, the whole remaining balance, ...), and for a year that converts nothing, why (stayed under a line, no room
  left in the bracket, locked by the 72(t) payments, nothing left to convert, ...); adjacent $0 years with one reason share a
  row. A line under the bracket table names the bracket rows that run out sooner because they convert in years already over
  the ACA 400% line, where the extra tax buys no premium savings.
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
  the `fire-planner-dist` artifact; on pushes to `main` it publishes that build to GitHub Pages.

The built filenames never change; each planner shows a version badge in its header, and the history is in `git log`.
