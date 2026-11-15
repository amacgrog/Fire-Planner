# Feedback Tier A: copy only (plan, 2026-11-15)

Tier A of `docs/superpowers/specs/2026-11-15-first-user-feedback-plan.md`: four copy changes, one PR, both planners.
No engine, input or number changes. Badges: US V178 → V179, Canada V83 → V84.

## Facts the copy relies on (checked in `src/`)

| Claim | Where |
|---|---|
| Stocks in every account grow at `returnRate`, the bond reserve at `bondReturn`, cash at `hysaRate`, one rate a year | `growBalances`, `src/us/core/projection/balances.js` (Canada's twin the same) |
| Historical and Monte Carlo replace stock and bond returns and inflation with real years; cash and mortgage rates stay at the inputs | the methodology card's "Historical and Monte Carlo views"; `year-sources.js` |
| A surplus fills cash, then the bond reserve, then taxable | methodology card, "Saving and withdrawals" |
| The bond reserve: years of expenses (0-15), built before retirement, kept at size after, refilled from stocks at most one year of expenses a year | `run-projection.js` 1427-1505 (`bondTarget`, `stdBondTarget`, `trimBondReserve`) |
| No rebalancing or glide path | `grep -ri 'rebalanc\|glide' src` finds nothing; the only stock/bond moves are the reserve's build, refill and trim |
| Guardrails: off by default; once retired, last year's withdrawal rate more than 20% above the first retired year's cuts base spending 10%, more than 20% below raises it 10%, held to 0.5x-1.5x, kept until the next trigger | `src/shared/core/projection/guardrails.js`; `guardrailsEnabled: false` in both `defaults.js`; it multiplies `baseSpendingNominal` only (the spending field or the spending change in effect), not housing, healthcare or loans |
| The bucket strategy (down year: cash then bonds) runs in the historical and Monte Carlo views and in market scenario runs unless the scenario's order is "standard" | `mode.bucketStrategy`; `docs/architecture/market-scenarios.md` |
| A market-scenario crash sets its own inflation and bond return for the fall | `msInflation`, `msBondReturn` in `src/shared/partials/marketScenarioCard.html` |
| Home repairs have their own field for an owner ("Annual home maintenance") | `src/shared/partials/medicalInflation.html` |
| The guardrail baseline is the first year after both partners stop working (`working = workingA \|\| workingB`) that draws on savings; US lump years record nothing; the rule is lagged (last year's rate sets this year's spending) | `run-projection.js` `recordOwnNeed` (US), :314 (Canada) |
| Before retirement the reserve is built by moving invested money (`rotateIntoBondLadder`, traditional, Roth, then a taxable sale); the up-year-only refill and trim are bucket mode | `bond-ladder.js`, `run-projection.js` 1434, 1494 |
| Contributions are shares of each yearly limit (`k401PctA`, `iraPctA`, ...; Canada `rrspPctA`, `tfsaPctA`) | both `defaults.js` |
| Under a market scenario the US cliff plan and conversions are re-planned on the scenario path, so taxes and withdrawals react to markets | `market-scenarios.md` 76-81 |
| A scenario's order button: "Bonds first in down years" (default) or "My normal order" | `marketScenarioCard.html` `msOrderBucket` / `msOrderStandard` |
| Revolving debt is not modeled (B3 is later); loans are added with "+ Add a loan" | `src/*/core/inputs/dyn.js` |

## Where each piece goes

**A1 and A3 each live in one shared partial**, so the copy has one home (A3 changes when C5 and D2 land):

- `src/shared/partials/beforeYouRely.html` (new): the A1 callout. Included four times: the end of `#wizardStep1` (after the spending field, where it applies, and so the
  first fields stay above the fold on a phone) in both shells, and right after `#limitationsCallout` in both methodology cards.
- `src/shared/partials/methodAssumptions.html` (new): the A3 section (an `<h3>` and a list). Included in both
  methodology cards right after the A1 callout, before "Contributions and income".
  `docs/architecture/inputs-and-ui.md` gets a line naming both partials and saying A3 is rewritten when C5 (flexible
  guardrails) or D2 (allocation and rebalancing) ships; the feedback spec's C5 and D2 entries get the same pointer.

An `id` cannot repeat in a page, and the A1 partial is used twice per page, so it carries only a class
(`before-you-rely`); tests find it by `#wizardStep1 .before-you-rely` and `.method-body .before-you-rely`.

**A2** (US and Canada):
- The `#spending` info bubble (`data-tip` in each shell): the new sentences appended.
- The guidance card's `spending` row (`src/shared/ui/results/guidance.js`, the `lastRanked.forEach` that builds
  each `li`): when `r.id === 'spending'`, a `<small class="guidance-tip">` on its own line under the row. A one-entry
  `ROW_TIPS` map in `guidance.js`, so the `.guidance-why` text and the existing `test_guidance.js` row regexes are
  unchanged for every other row. CSS: `.guidance-tip{display:block;color:var(--muted)}` in `styles.css`.
- The wizard's spending `<small>` is left as is (A1 sits on the same step and says it).

**A4** (US and Canada): the `#returnRate`, `#bondReturn` and `#inflation` bubbles get one appended sentence each.

## Draft wording (revised after the plan review)

### A1, `beforeYouRely.html` (wizard: at the end of `#wizardStep1`, after the spending field)

```html
<div class="callout before-you-rely"><b>Before you rely on this.</b> The projection assumes you spend what you entered, keep saving what you entered until you retire, and owe nothing you left out. Add every loan other than your mortgage with “+ Add a loan”. A card balance carried month to month is not modeled yet: count what you pay on it each month as spending. Retiring early leaves little room for slippage.</div>
```

### A2, spending bubble (appended to the current text in both shells)

> Base it on the last 12 months of what you actually spent (bank and card statements), not on a budget, and include the
> irregular costs: car repairs, gifts, travel (an owner's home repairs go in Annual home maintenance). A cost every few
> years, like a new car, can go in “+ Add a one-time expense” instead, not both. Count credit cards as paid off in
> full: if you pay only the minimum, the rest is spending you haven't counted.

### A2, guidance row tip (the `spending` row only)

> Use 12 months of actual spending, irregular costs included, with cards paid in full.

### A3, `methodAssumptions.html`

```html
<h3>Assumptions: what stays fixed</h3>
<ul>
  <li>Returns: in the Projection view every year earns the same rates: stocks in every account the investment return, the bond reserve the bond return, cash the HYSA rate, and your home its growth rate. There are no good or bad years unless you turn on a market scenario. The Historical and Monte Carlo views use real years (resampled in Monte Carlo) for stocks, bonds and inflation; cash still earns your HYSA rate.</li>
  <li>The bond reserve is sized in years of expenses. It is built in the years before retirement by moving invested money into bonds, then kept at that size (see “Saving and withdrawals”).</li>
  <li>While you work, each account gets the share of its yearly limit you chose, plus any employer match. Retirement ages and contributions never change with markets.</li>
  <li>No rebalancing and no glide path: apart from keeping the bond reserve at its size, nothing moves between stocks and bonds, and the stock share does not shrink as you age.</li>
  <li>Spending changes with markets only through guardrails, which are off unless you turn them on (they then apply in every view). They are a simplified Guyton-Klinger rule: once everyone in the plan has retired, the first year you draw on savings sets a starting withdrawal rate. If a later year's rate runs more than 20% above it, your everyday spending (the spending field, or the spending change in effect) is cut 10% the next year; more than 20% below, it is raised 10%. It stays between half and 1.5 times your plan, and each change lasts until the next one. Housing, healthcare and loans are not cut.</li>
  <li>Taxes and withdrawals follow your balances, so they do move with markets. In the Historical and Monte Carlo views, and in a market scenario unless you pick “My normal order”, a down year is paid from cash and bonds first.</li>
</ul>
```

### A4, bubbles (appended)

- `#returnRate` and `#bondReturn`: "It is the same every year. To test bad years and when they hit, use the Market
  scenario card (a crash at any age, or a replay of real history), or switch the chart to Historical or Monte Carlo."
- `#inflation`: "It is the same every year. The Historical and Monte Carlo views use each year's real inflation with
  its markets, and a Market scenario crash sets its own inflation for the years of the fall."

### Related fixes in the same PR (review items 9 and 10)

- Both method cards: the guardrails bullet under "Spending and housing" becomes "Optional guardrails that adjust
  spending after good and bad markets (see “Assumptions: what stays fixed”)." so the rule is stated once.
- Both shells, the `#guardrailsEnabled` bubble: "your rate at retirement" becomes "your starting rate (the first
  retired year that draws on savings)", twice ("materially above" and "materially below" it).
- Both method cards, "Not modeled": a new item "Credit-card and other revolving balances (enter what you pay each
  month as spending)."
- The feedback spec's A3 line: "until C4 and D2" becomes "until C5 and D2", and "guardrails are the only response to
  markets" becomes "spending responds to markets only through guardrails".

## Tests

- `test_wizard_accounts.js`: in both planners, `#wizardStep1 .before-you-rely` is visible when the wizard opens and
  its text starts "Before you rely on this."; in the methodology card it is the element right after
  `#limitationsCallout`, and the disclaimer link still opens the card and flashes `#limitationsCallout`.
- `test_info_tips.js`: in both planners, the `#spending` bubble contains "12 months" and "paid off in full"; the
  `#returnRate`, `#bondReturn` and `#inflation` bubbles contain "Market scenario" and "Monte Carlo"; the methodology
  card holds one `.before-you-rely` and an `h3` "Assumptions: what stays fixed" whose list names "Guyton-Klinger",
  "20%", "10%" and "1.5 times"; the `#guardrailsEnabled` bubble says "starting rate" and no longer "rate at retirement".
- `test_guidance.js`: on a fresh page (spending still the example value), the `spending` row's `.guidance-tip` reads
  the A2 line, and no other row has a `.guidance-tip`. The existing row regexes read the whole `li` text, so the first
  and measured-row checks switch to the `.guidance-why` span's text (unchanged for every row).
- `npm run snapshot:update` for the intended text changes only (commit says so); then `npm test` and `npm run test:ui`.
- Mobile 390x844, both planners: the wizard open on step 1 and the methodology card open, `scrollWidth >
  clientWidth` false.

## Docs

README feature list (a line under the methodology / first-run items); `docs/architecture/inputs-and-ui.md` (the two
partials and A3's dependency on C5/D2); the feedback spec's Tier A marked done with the PR.
