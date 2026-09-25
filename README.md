# FIRE Planner

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators for a couple (or single person). Nothing leaves your device — open the file in a browser and it runs entirely client-side, with no server, account, or internet connection required.

## Files

- `index.html` — landing page linking to both tools
- `Planner_US.html` — US version
- `Planner_Canada.html` — Canada version (Ontario / BC)

## Shared capabilities

Both tools run on the same underlying engine and share these features:

- **Couple or single-person mode**, each partner with independent ages, income, and retirement date
- **Investment growth**: separate nominal return assumptions for stocks, bonds, and a high-yield savings/cash rate
- **Bond-ladder bucket strategy**: a configurable number of years of expenses held in bonds, ramped up automatically before retirement, drawn down last
- **Housing**, chosen per scenario:
  - **Own**: existing mortgage with an optional extra-principal slider to accelerate payoff
  - **Rent**: monthly rent with its own growth rate
  - **Rent, then buy**: rent until a chosen age, then purchase a home (cash or a new 15/30-year mortgage, with down payment %, closing cost %, and extra-principal slider)
- **Up to 5 additional amortizing loans** (auto, personal, etc.) with their own principal, rate, term, and extra payment
- **Up to 5 sequential household spending changes**, each triggered at a chosen age (e.g. mortgage payoff, empty nest, slowing down in your 80s)
- **Bridge / part-time income** per partner, with its own age window, taxed as ordinary income
- **Additional income sources**: up to 3 recurring income streams with their own start/end age, plus up to 3 one-time tax-free lump sums (e.g. an inheritance) at a specific age
- **Long-term care costs** per partner, starting at a chosen age
- **Cash reserve target**, maintained in HYSA; excess flows to brokerage
- **Withdrawal waterfall** in retirement: taxable → tax-deferred → tax-free → cash → bond reserve → home equity (last resort)
- **Cost-basis tracking** on the taxable brokerage account: a starting cost-basis %, with all new contributions added at 100% basis and withdrawals taxed pro-rata on the blended basis/gain ratio
- **Real vs. nominal dollar toggle** for every result
- **Five chart views**: retirement date ±1 year, ±3 years, a 0–7% real CAGR sweep, a full historical backtest using actual 1928–2025 S&P 500 returns, inflation, and 10-year Treasury bond returns (Damodaran/NYU Stern dataset), and a Monte Carlo simulation
- **Monte Carlo simulation ("Monte Carlo" chart view)**: runs your choice of 500, 1,000, or 2,000 simulated futures and plots the result as a percentile fan chart (10th/25th/50th/75th/90th), alongside a success-rate metric. Instead of drawing each year's return independently at random (which can produce unrealistic strings of 100 years of straight gains or losses), each simulated path is built from randomly-ordered **5-year blocks of real historical data**, so multi-year trends, mean reversion, and the real correlation between stock returns, inflation, and bond returns are preserved within each block. Because it draws from the same 1928–2025 dataset as the historical backtest but recombines it into many more independent paths, its success rate is a different (and complementary) number from the historical backtest's — the historical view retells a small number of overlapping real 20th/21st-century sequences, while Monte Carlo dilutes any single bad era across thousands of randomly recombined paths
- **Hover-to-inspect charts**: mousing over the ±1yr/±3yr/CAGR views shows a crosshair and each series' value at that age (disabled on the historical and Monte Carlo views, which show many paths/bands at once)
- **Log-scale chart toggle**
- **CSV export** of the full year-by-year projection
- **Independently-scrolling sidebar**, so the assumptions panel and the results (chart/table/notes) scroll separately
- **In-page MCP tool hooks** (`read_fire_projection`, `update_fire_assumptions`) for programmatic/agentic access to the live projection
- **Nothing is saved or transmitted** — all inputs live only in the page's memory for that session (no localStorage, no server)

## US-specific (`Planner_US.html`)

- Federal tax brackets + all 50 states' income tax rules
- 401(k) and IRA accounts, each selectable as Traditional or Roth, with employer match modeling
- Catch-up contributions (age 50+, enhanced age 60–63), auto-Roth above the SECURE 2.0 wage threshold
- Mega backdoor Roth
- Social Security, with a start-age slider per partner
- Medicare IRMAA surcharge modeling
- ACA premium tax credit (2026 sliding-scale structure, with an option to model the enhanced ARPA/IRA-style subsidy instead)
- Required Minimum Distributions (RMDs)
- Roth conversion ladder: solves for the annual conversion that fills a chosen federal tax bracket
- MFJ vs. single filing status, with an optional "marry later" age

## Canada-specific (`Planner_Canada.html`)

- Federal tax brackets + Ontario or BC provincial tax, including the Ontario Health Premium and Ontario surtax
- RRSP and TFSA accounts, with CRA contribution-room rules
- FHSA (First Home Savings Account): $8,000/year and $40,000 lifetime cap per partner, usable toward a future home purchase (see "Rent, then buy" above), with automatic tax-free rollover of any leftover balance into the TFSA
- CPP (start age 60–70) and OAS (start age 65–70), with OAS recovery tax (clawback) modeled
- RRIF minimum withdrawal rules starting at age 71
- RRSP meltdown ladder: solves for the annual RRSP withdrawal that fills a chosen federal tax bracket, moving proceeds to TFSA
- Pension income splitting between partners (up to 50% of eligible pension/RRIF income), solved to minimize combined household tax

## Versioning

These files use **stable filenames** — always `Planner_US.html` / `Planner_Canada.html`, never version-numbered suffixes. Version/date info can live in the on-page header if useful, but the filename itself never changes. This means:

- `index.html`'s links never go stale.
- Every update is just a `git commit`, not a rename-and-fix-links exercise.
- Full history (what changed, when, why) lives in `git log` instead of a pile of old files.

## Making an update

1. Edit the file (or have Claude edit it).
2. Save it back over the same filename (`Planner_US.html` / `Planner_Canada.html`) — don't create a new versioned copy.
3. Commit the change with a short message describing what changed.

If you're using GitHub Desktop: open the app, you'll see the changed file listed, write a one-line summary in the box at bottom left, click **Commit to main**, then click **Push origin** to sync it to GitHub.
