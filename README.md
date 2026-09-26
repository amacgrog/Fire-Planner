# FIRE Planner

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators for a couple (or single person). Nothing leaves your device — open the file in a browser and it runs entirely client-side, with no server, account, or internet connection required.

MIT licensed — see [LICENSE](LICENSE).

## Files

- `index.html` — landing page linking to both tools
- `Planner_US.html` — US version
- `Planner_Canada.html` — Canada version (Ontario / BC)
- `CLAUDE.md` — architecture notes and gotchas for Claude Code (or any AI assistant) working in this repo

## Shared capabilities

Both tools run on the same underlying engine and share these features:

- **Guided setup wizard**: an optional 2-step modal (launched from the topbar) for getting a first projection running — step 1 asks for the basics (single/partnered, ages, income, retirement age, account balances, spending), step 2 offers a checklist of the features below that make the simulation more or less detailed (LTC, ACA, Roth conversion/RRSP meltdown ladder, mega backdoor Roth, bridge income, additional income, other loans, Guyton-Klinger guardrails). Every wizard field is a live proxy for the real sidebar control, so it never gets out of sync and can be safely skipped entirely
- **"What's driving this" shortfall banner**: when a projection depletes before the end of the plan, a banner explains the likely cause and the smallest change that would fix it. It checks structural causes first (LTC or healthcare costs materially increasing the shortfall) before falling back to the two generic levers everyone has — spending and retirement timing — and for those two, it searches for the minimal cut or delay that actually resolves the shortfall rather than testing one arbitrary fixed amount
- **Couple or single-person mode**, each partner with independent ages, income, retirement date, and a configurable "plan finances through age" (life expectancy, default 100) that sets how many years the projection runs
- **Investment growth**: separate nominal return assumptions for stocks, bonds, and a high-yield savings/cash rate
- **Bond-ladder bucket strategy**: a configurable number of years of expenses held in bonds, ramped up automatically before retirement, drawn down last
- **Housing**, chosen per scenario:
  - **Own**: existing mortgage with an optional extra-principal slider to accelerate payoff
  - **Rent**: monthly rent with its own growth rate
  - **Rent, then buy**: rent until a chosen age, then purchase a home (cash or a new 15/30-year mortgage, with down payment %, closing cost %, and extra-principal slider)
  - **Property tax and home insurance** are separate annual figures (each with its own growth rate, independent of general inflation), so they can be sized to the actual home rather than folded into household spending. Both apply once you own — immediately for "Own," or from the purchase year onward for "Rent, then buy" — and both keep applying after the mortgage is paid off, since they're tracked independently of the mortgage schedule
- **Pre-tax health insurance premium**: a per-paycheck amount (with a paycheck-frequency field: weekly/biweekly/semimonthly/monthly) modeling an employer-sponsored premium deducted from each paycheck while working, reducing taxable wages the same way a 401(k)/RRSP contribution does. This only applies during working years; medications, copays, and other after-tax healthcare costs are expected to be folded into household spending instead. The existing "post-retirement healthcare" field is unchanged in mechanics but now represents the insurance premium only (once retired and under 65) for the same reason
- **Toggleable long-term care costs**: an "Model long-term care costs" checkbox hides/disables the LTC fields entirely rather than requiring them to be zeroed out
- **Up to 5 additional amortizing loans** (auto, personal, etc.) with their own principal, rate, term, and extra payment
- **Up to 5 sequential household spending changes**, each triggered at a chosen age (e.g. mortgage payoff, empty nest, slowing down in your 80s)
- **Bridge / part-time income** per partner, with its own age window, taxed as ordinary income
- **Additional income sources**: up to 3 recurring income streams with their own start/end age, plus up to 3 one-time tax-free lump sums (e.g. an inheritance) at a specific age
- **Long-term care costs** per partner, starting at a chosen age
- **Cash reserve target**, maintained in HYSA; excess flows to brokerage
- **Withdrawal waterfall** in retirement: taxable → tax-deferred → tax-free → cash → bond reserve → home equity (last resort)
- **Cost-basis tracking** on the taxable brokerage account: a starting cost-basis %, with all new contributions added at 100% basis and withdrawals taxed pro-rata on the blended basis/gain ratio
- **Real vs. nominal dollar toggle** for every result
- **Light/dark mode toggle**: defaults to your OS/browser color-scheme preference and can be flipped from the topbar. Not persisted across reloads (consistent with "nothing is saved" below) — it just re-reads your system preference each time the page opens
- **FI#/FIRE# dashboard tiles**: FI number (25× today's household spending) and FIRE number (25× spending in your retirement year), each with a "% funded" figure measured against your current investable assets (taxable + tax-deferred + tax-free + cash, today's balances — not a future projection), plus an estimated early-retirement age (the first age, at your current savings rate, your investable assets would reach the FIRE number if you kept working and saving indefinitely rather than retiring on schedule)
- **Smoothed/proportional withdrawal toggle**: an alternative to the default "drain taxable first" withdrawal order. When enabled, each year's spending need is drawn from taxable and tax-deferred accounts in proportion to their current balances, rather than exhausting taxable completely before touching tax-deferred — this avoids the sharp jump in taxable income that happens the year taxable savings run out. It only changes the ±1yr/±3yr/CAGR views and the summary metrics; the historical backtest and Monte Carlo views keep their own bucket-strategy withdrawal order (taxable → tax-deferred → tax-free → cash → bond reserve), since that ordering is specifically designed for sequence-of-returns protection and isn't a good fit for proportional draws
- **Five chart views**: retirement date ±1 year, ±3 years, a 0–7% real CAGR sweep, a full historical backtest using actual 1928–2025 S&P 500 returns, inflation, and 10-year Treasury bond returns (Damodaran/NYU Stern dataset), and a Monte Carlo simulation. The historical backtest only replays starting years that have enough remaining data to cover the full projection length, so a longer "plan finances through age" setting (or a younger starting age) shrinks the pool of usable starting years, while a shorter one grows it
- **Monte Carlo simulation ("Monte Carlo" chart view)**: runs your choice of 500, 1,000, or 2,000 simulated futures and plots the result as a percentile fan chart (10th/25th/50th/75th/90th), alongside a success-rate metric. Instead of drawing each year's return independently at random (which can produce unrealistic strings of 100 years of straight gains or losses), each simulated path is built from randomly-ordered **5-year blocks of real historical data**, so multi-year trends, mean reversion, and the real correlation between stock returns, inflation, and bond returns are preserved within each block. Each block is drawn from anywhere across the full 1928–2025 dataset regardless of how long the projection runs, so — unlike the historical backtest below — it is not affected by the "plan finances through age" setting. Because it draws from the same 1928–2025 dataset as the historical backtest but recombines it into many more independent paths, its success rate is a different (and complementary) number from the historical backtest's — the historical view retells a small number of overlapping real 20th/21st-century sequences, while Monte Carlo dilutes any single bad era across thousands of randomly recombined paths
- **Hover-to-inspect charts**: mousing over the ±1yr/±3yr/CAGR views shows a crosshair and each series' value at that age (disabled on the historical and Monte Carlo views, which show many paths/bands at once)
- **Collapsible sensitivity analysis ("tornado chart")**: shows how far projected end assets swing when one assumption moves at a time (investment return, retirement age, household spending, inflation, bond return), holding everything else fixed, sorted by impact. Collapsed by default and only computed while expanded, so it never slows down the main dashboard
- **Scenario overlay chart**: once any saved scenario is checked for comparison, a chart appears plotting each checked scenario's total-assets-by-age alongside "Current," so you can see the shape of the difference, not just the summary numbers in the comparison table
- **Guyton-Klinger guardrails (opt-in toggle, off by default)**: a simplified dynamic-spending strategy. Instead of a fixed inflation-adjusted spending amount, household discretionary spending is cut 10% when your withdrawal rate runs materially above your rate at retirement (capital-preservation rule) and raised 10% when it runs materially below it (prosperity rule), so you can toggle it on to see how a dynamic policy changes the outcome versus a fixed one
- **Survivor planning (opt-in toggle, off by default)**: models one partner dying at a chosen age. From that year onward: the household switches to single filing, the survivor keeps the greater of the two Social Security (or CPP + OAS) benefits — a simplified survivor-benefit swap rather than full PIA/FRA or CPP survivor-pension rules — the deceased partner's pension/LTC/healthcare share drops out, the tax-deferred account balance consolidates under the survivor's own RMD/RRIF-minimum schedule, household spending is cut to a configurable percentage, and any "other loans" balance is paid off as a lump sum in the year of death (approximating debts settled through the estate/probate before assets pass to the survivor). The mortgage is untouched, since it's secured by jointly-titled real estate. On the Canada planner, pension income splitting also disables itself for the survivor period, since it requires two living spouses. Intended for a death during retirement; one modeled during a working year may not fully zero out that year's payroll activity
- **Cash-flow Sankey diagram** (collapsible, only computed while expanded): for a single selected year (a slider steps through the whole projection), shows where that year's money comes from (wages, Social Security/CPP+OAS, pension, RMD/RRIF) on the left and where it goes (taxes, housing, healthcare, LTC, loan payments, discretionary spending) on the right, funneled through a single "pooled cash flow" hub in the middle — any gap between income and spending is shown as either a draw from savings or a surplus added to it. Hover (or focus via keyboard) any income source, hub, or spending category for its exact dollar amount
- **Log-scale chart toggle**
- **CSV export** of the full year-by-year projection
- **Print/PDF report**: a formatted, landscape-oriented summary (assumptions, results, and a year-by-year income/expenses/tax table) generated from the current inputs, ready to print or save as a PDF
- **Named scenarios**: save the current inputs as a named snapshot, load any saved scenario back, and check any number of them for a side-by-side **scenario comparison table** (retirement age, investable/net worth at retirement, how long the portfolio lasts, end assets) and **overlay chart** (above) alongside your live "Current" inputs, which updates as you type. Scenarios live in the browser tab only until exported — export any scenario (or all of them at once) to a JSON file to keep past the session or carry into a future update, and re-import it later. Every load path (boot, Load, and import) merges the saved data over the current defaults, so a scenario exported by an older or newer version of the tool still loads correctly: missing fields fall back to today's defaults, and fields that no longer exist are simply dropped — nothing breaks
- **Independently-scrolling sidebar**, so the assumptions panel and the results (chart/table/notes) scroll separately
- **Mobile-responsive layout**: usable on a phone-width screen, with the sidebar/results stacking vertically and chart-view buttons wrapping instead of overflowing
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
- Roth conversion ladder: solves for the annual conversion that fills a chosen federal tax bracket, automatically capped so it never pushes MAGI over the ACA subsidy cliff (400% FPL, when ACA premium tax credits are enabled and not using the enhanced-subsidy option) or into the next Medicare IRMAA tier (once within 2 years of 65, using the 2-year MAGI lookback) — the bracket target becomes a ceiling on the conversion, not a guarantee that the full bracket gets filled. This is US-only, since Canada has no equivalent income-tested healthcare cliff to model (see the RRSP meltdown ladder below for Canada's closest analog)
- **Bracket optimizer** (collapsible, only shown and computed while the ladder is enabled/expanded): re-runs the plan at every available bracket-fill target and reports which one minimizes estimated lifetime tax (income + payroll, summed across the projection in today's dollars), guarding against a recommendation that would shorten how long the portfolio lasts
- MFJ vs. single filing status, with an optional "marry later" age

## Canada-specific (`Planner_Canada.html`)

- Federal tax brackets + provincial tax for all 10 provinces (Ontario, BC, Alberta, Saskatchewan, Manitoba, Quebec, New Brunswick, Nova Scotia, PEI, Newfoundland and Labrador), including Ontario's Health Premium and two-tier surtax, and Quebec's 16.5% federal tax abatement. Territories are not modeled
- RRSP and TFSA accounts, with CRA contribution-room rules
- FHSA (First Home Savings Account): $8,000/year and $40,000 lifetime cap per partner, usable toward a future home purchase (see "Rent, then buy" above), with automatic tax-free rollover of any leftover balance into the TFSA
- CPP (start age 60–70) and OAS (start age 65–70), with OAS recovery tax (clawback) modeled
- RRIF minimum withdrawal rules starting at age 71
- RRSP meltdown ladder: solves for the annual RRSP withdrawal that fills a chosen federal tax bracket, moving proceeds to TFSA
- **Bracket optimizer** (collapsible, only shown and computed while the ladder is enabled/expanded): re-runs the plan at every available bracket-fill target and reports which one minimizes estimated lifetime tax (income + payroll, summed across the projection in today's dollars), guarding against a recommendation that would shorten how long the portfolio lasts
- Pension income splitting between partners (up to 50% of eligible pension/RRIF income), solved to minimize combined household tax

## Versioning

These files use **stable filenames** — always `Planner_US.html` / `Planner_Canada.html`, never version-numbered suffixes. Version/date info can live in the on-page header if useful, but the filename itself never changes. This means:

- `index.html`'s links never go stale.
- Every update is just a `git commit`, not a rename-and-fix-links exercise.
- Full history (what changed, when, why) lives in `git log` instead of a pile of old files.

## Testing

`npm test` runs `tests/golden.js`, which checks the core drawdown and compounding math against hand-verified year-by-year figures to the cent. A GitHub Actions workflow (`.github/workflows/test.yml`) runs this on every push. There is no automated coverage of the UI itself beyond this; changes to interactive behavior are currently verified ad hoc (e.g. with Playwright) rather than via a committed test file.

## Making an update

1. Edit the file (or have Claude edit it).
2. Save it back over the same filename (`Planner_US.html` / `Planner_Canada.html`) — don't create a new versioned copy.
3. If the change adds or changes a user-facing feature, update this README's feature list in the same batch of work. If it changes anything architectural (a new shared helper, a new gotcha, a new divergence between the US and Canada files), update `CLAUDE.md` too.
4. Commit the change with a short message describing what changed.

Keeping README.md and CLAUDE.md current alongside the code (rather than as an occasional separate pass) is what lets a future session — one with no memory of this conversation, possibly running in a different, disconnected copy of this repo — pick up accurately from just the repo contents.

If you're using GitHub Desktop: open the app, you'll see the changed file listed, write a one-line summary in the box at bottom left, click **Commit to main**, then click **Push origin** to sync it to GitHub.
