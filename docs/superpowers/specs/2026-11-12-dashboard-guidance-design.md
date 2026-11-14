# Dashboard guidance redesign: "Am I OK? What matters? What should I change?"

Status: design, 2026-11-12. Both planners (US and Canada) together, owner's decision.
Mockups from the brainstorm: `.superpowers/brainstorm/175420-1794449163/content/` (gitignored, local only):
`am-i-ok.html`, `what-matters.html`, `what-to-change.html`.

## Why

Six guidance features were written in the project's first four days (2026-09-25 to 09-28), before the cliff plan,
the conversion and strategy searches, market scenarios, the cash-flow chart, inherited accounts and self-employment
existed, and none has been brought up to date:

| Today | Problem |
|---|---|
| Setup wizard (`src/shared/ui/wizard.js`, US 3 steps, Canada 2) | Never asks for Social Security / CPP / OAS, housing or Roth basis; its optional checkboxes predate most features. |
| "N of your numbers are still estimated · Review →" (`estimate-badges.js`, `estimate-review.js`) | Walks all ~49 estimated fields in sidebar order; Roth basis and home-insurance growth count the same. |
| Sticky status bar (`plan-status-bar.js`) | "Retire 60/55" (each partner's age when the second retires) contradicts the headline's "retiring at 55"; no notion of margin. |
| "On track" headline (`render-plan-headline.js`) | Means only "does not run out"; $1.5M left and $1 left read the same. A third summary next to the bar and tiles. |
| Run-out banner (`shortfall-banner.js`, `shortfall-drivers.js`) | Tests two causes (LTC, post-retirement premiums), then "cut spending N%" or "retire N years later"; knows nothing of conversions, the cliff plan or guardrails. |
| "What do you want to figure out?" (`decision-questions.js`) | Seven buttons, two of which are not comparisons; "What if returns are lower?" does not lower returns and ignores market scenarios. |
| Tornado chart (`tornado.js`) | Measures end assets, which returns dominate, so it nearly always says "returns matter most"; no levers for anything built since September. |

Between them they try to answer three questions, overlapping and contradicting each other. The redesign answers each
once, in order.

**Users:** first the owner's family testers, around 60, whose questions are Roth conversions and a bond bucket; later
Reddit / FIRE users. Wording is pitched at the first group.

## Goals

1. **Am I OK?** One verdict at the top of the dashboard, with a margin a person can act on.
2. **What matters most for me?** A setup that asks what you are deciding, then the few fields worth filling in, ordered
   by how much they move *your* plan.
3. **What should I change?** An answer per goal from the engines that already do the work, and, when the plan is tight
   or short, a ranked list of tested changes.

## Non-goals

- New financial modeling. Every answer comes from an engine that exists today (or from Batch 6, later).
- Social Security / CPP / OAS claiming-age advice. Today the start age does not change the benefit amount, so testing
  it as a move would be wrong. It joins the moves list and goal answers when Batch 6 adds the claiming-age rules.
- Changing the detail cards (conversion bracket search, strategy search, market scenarios, cash-flow chart, Sankey).
  The new pieces link to them; they stay as they are.
- The "Worth a second look" unusual-value warnings (`estimates.js`, `unusual-warnings.js`): unchanged.

## Anti-goals (a failure even if it works)

- A verdict word whose thresholds feel arbitrary or that disagrees with the numbers beside it.
- Advice the engine has not actually tested ("consider Roth conversions" without a run behind it).
- A slower slider. The light render stays as fast as today: everything new that re-runs the engine goes in the
  deferred pass (`renderDeferred()` / `markDeferredStale()`), as the tornado chart does today.
- A Comfortable plan nagged with a to-do list.

## Part 1: the verdict ("Am I OK?")

Brainstorm choice A, with B's gauge on hover/tap.

### What the user sees

At the top of the dashboard, replacing the "On track" headline (`#planHeadlineBanner`) and the run-out banner's
position:

> **Comfortable**
> Retiring at 55, your money lasts past 100. You could spend about **$9,000 more a year** and still make it.
> Held up in 83% of historical markets since 1928 · see the bad ones

- **Verdict word:** Comfortable / Tight / Short (rules below), coloured green / amber / red.
- **Sentence:** retirement age(s), how long the money lasts, and the spending room. For a couple whose partners
  retire at different times it names both ages the same way the "Retire at" tile does (A 55 / B 57), never the
  status bar's "60/55" form. When the plan runs out: "Your money runs out at 91. You would need to spend about
  **$6,000 less a year** to make it to 100."
- **Second line:** the historical success rate (from the existing debounced backtest) with a link, "see the bad
  ones", that opens the historical chart view.
- **Gauge (hover / tap on the spending-room figure):** a bar from $0 through the user's spending, the most the plan
  supports, and the level where it runs out (mockup B).
- **Sticky status bar** (`#planStatusBar`): rewritten to the short form, "**Comfortable** · +$9K/yr room · 83%
  historical". It keeps its click behaviour (scroll to and flash the dashboard, mobile view switch) and the
  "Updated just now" pulse.

### Spending room

The amount by which the household's base spending (`spending`, the "Annual household spending" field, in today's
dollars) could change, with every other input fixed, so that the projection just lasts to the end of the plan
horizon. Positive is room to spare, negative is the cut needed.

- Measured on the normal projection (the fixed-return run the year table shows), through `runSourceFor`, so a market
  scenario in force is respected.
- Shown in today's dollars, per year, rounded conservatively to $1,000 (to $500 below $5,000): a room to spare
  rounds down, a cut needed rounds up (at least $500), so the figure shown always works. *(Changed 2026-11-12 after the
  PR 1 plan review: "nearest" said "$8K more" where $8K runs out.)*
- **Spending tiers:** the change is applied to base spending **and** to every `spendingTiers` row by the same
  today's-dollar amount, so "spend $9K more a year" is true in every retirement year, including the years a tier
  replaces base spending (`baseSpendingNominal`). *(My call.)*
- **Guardrails** (owner's decision): with Guyton-Klinger guardrails on, a plan rarely "runs out", so spending room is
  not the margin. The verdict follows the user's actual run (guardrails on), and the margin shown in its place is the
  deepest guardrail cut: "Guardrails cut your spending by up to **20%** in the worst year." The gauge is not shown.
  This works whatever the guardrail settings are; making those settings adjustable is a separate project that
  follows this one.
- **The US cliff plan:** variants run with the plan the current run uses held fixed (the `contextFor` factory), not a
  fresh bracket search per variant, or the search would multiply its cost. *(My call; the builder confirms the
  difference is small on the default household and an ACA-cliff household.)*
- How the search is done (bisection, bounds, tolerance) is the builder's. It generalises `findMinimalSpendingCut`
  (`src/shared/core/analysis/decisions.js`), which today searches cuts only, in 5% steps.

### Verdict rules *(my call, one table of constants so the owner can tune it)*

| Verdict | Rule |
|---|---|
| **Short** | The projection runs out before the plan horizon (spending room < 0). |
| **Tight** | It lasts, but spending room is under 10% of retirement spending, **or** historical success is under 80%. |
| **Comfortable** | Spending room is at least 10% of retirement spending and historical success is at least 80%. |

"Retirement spending" is the average yearly household spending over the retired years in today's dollars, spending
changes by age included (owner's decision, 2026-11-14; it was base spending, which a spending tier can replace).

With guardrails on, "spending room" in the rules above reads as the deepest cut: **Short** if the plan still runs
out, **Tight** if any year's spending falls below 90% of plan (more than one 10% cut) or historical success is under
80%, otherwise **Comfortable**. *(My call for the 90% line.)*

Until the backtest has finished (500 ms debounce today) the verdict uses spending room alone and shows no historical
line; the line and, if needed, the downgrade to Tight arrive with the backtest.

**Under a market scenario** the backtest ignores the scenario, so in scenario mode the historical line is replaced by
"inside the <scenario> market" and the verdict uses spending room alone. *(My call.)*

## Part 2: setup and "What matters most?"

Brainstorm choice C: goals decide which fields are in scope, impact on the plan decides the order.

### Goals

A fixed list per country, chosen in setup and editable afterwards as chips at the top of the dashboard's guidance
area. Several can be on at once; none is a valid choice (the list then falls back to impact only, over all
estimated fields).

| Goal | US | Canada |
|---|---|---|
| When can I retire? | yes | yes |
| How much can I spend? | yes | yes |
| Should I do Roth conversions? / Should I do an RRSP meltdown? | yes | yes |
| Health cover before Medicare (ACA) | yes | no (no equivalent) |
| Buy, rent or pay off the house | yes | yes |
| What if one of us dies early? | yes (couples) | yes (couples) |
| What I leave behind | yes | yes |

On the dashboard the chips are pure filters: ticking or unticking one changes which fields and answers show, never an
input. Only the setup step turns a feature on for a goal (below). *(My call.)*

The goals are saved with the plan: a new state field (`guidanceGoals`, a list of goal keys) with a guard in
`normalizeState` that drops unknown keys, so it travels with scenarios, autosave and JSON export. The engine never
reads it. `guidanceGoals` has no `FIELDS` entry (it is a list, not a sidebar control, so a `FIELDS` entry would fail
`tests/field_registry.js`; `dismissedEstimates` is the precedent): a deliberate departure from the Constraints line.

### Which fields each goal brings in

Each goal names the inputs its answer depends on. The table below is the starting point; the builder completes it
from the code each answer calls.

| Goal | Fields in scope (besides the always-on basics: ages, retirement ages, income, spending, balances) |
|---|---|
| When can I retire? | Social Security / CPP / OAS amounts and start ages, pensions, pre-65 health premium |
| How much can I spend? | the same as "retire", plus housing costs and loans |
| Roth conversions / RRSP meltdown | traditional / RRSP balances per partner, Roth basis (US), state / province, Social Security / OAS amounts |
| Health cover before Medicare | pre-65 premium, ACA subsidy toggle, income in the years before 65 |
| Buy, rent, pay off | tenure, home value, mortgage rate, balance and term, rent, property tax, insurance |
| One of us dies early | survivor settings, life expectancies, pensions' survivor share |
| What I leave behind | life expectancies, home value, traditional / RRSP balances, state / province |

### The ranked list

"Fill these in next" lists the in-scope fields that are still estimated (the existing estimate badges decide that),
ordered by how much a realistic error in each moves the spending room: "Social Security A — moves your room ±$7K/yr".
Fields with no measurable effect but a goal-critical role (Roth basis for early access, state for conversion tax)
stay in the list with a one-line reason instead of a figure. Everything not in scope is collapsed under "everything
else (N fields)".

- **Realistic error per field** *(my call, one table)*: dollar amounts ±10%, ages ±2 years, rates ±1 percentage point,
  Social Security / CPP / OAS ±10%. The builder may refine individual rows.
- **Cost:** one spending-room search per field per direction is too slow. Suggested: run each nudged variant once,
  and convert its change in end real assets to $/yr using the end-assets-per-$1-of-spending slope that the
  spending-room search already measures. The builder checks this against the exact search on a few fields and picks
  the method.
- Computed in the deferred pass, only for in-scope fields.
- The review walk ("Review →" / "Next →" and the floating "N fields left" pill) walks this list in this order, not
  the whole sidebar.

### The new setup

Replaces the wizard's steps:

1. **The basics** (as today's step 1: single or couple, ages, income, retirement ages, spending).
2. **Your balances** (as today's step 2, plus Roth basis inline in the US instead of the callout that sends users to
   the sidebar).
3. **What are you trying to decide?** The goal checkboxes. This replaces today's optional-feature checkboxes (ACA
   subsidy, LTC, conversions, mega backdoor, guardrails; Canada LTC, meltdown, guardrails). A goal that needs a
   feature turned on (conversions, ACA subsidy) turns it on; the rest stay in the sidebar.
4. **Done** leads to the ranked list, not just a closed overlay.

It still mirrors values into the sidebar controls (`data-wizard-mirror`), still opens only from "Get started" or the
first-run banner, and must pass the 390x844 mobile check.

### What goes

- The tornado card (`#sensitivityCard`, `tornado.js`, `sensitivity-levers.js`, the per-country `sensitivity.js`):
  removed. Its job becomes the "moves your room ±$X/yr" figure.

## Part 3: "What should I change?"

Brainstorm choice C: goal answers always; ranked moves only when the verdict is Tight or Short.

### Goal answers

One short card per chosen goal, under the verdict, each a sentence or two and a link to the detail card that already
exists. Each answer is computed by an existing engine:

| Goal | Answer from | Example |
|---|---|---|
| When can I retire? | retirement-age variants (as today's "retire earlier or later" compare), verdict at each from spending room alone (no backtest per age; *my call*, for cost), labelled "in the projection" | "Comfortable from 53; Tight at 51. Each year earlier costs about $4K/yr of room." |
| How much can I spend? | spending room | "About $69K a year, $9K more than today." |
| Roth conversions (US) | the conversion bracket search and the cliff plan | "Yes, to the top of the 12% bracket, ages 55–64: +$38K after tax at the end; held in 3 ACA years." Link: the schedule. |
| RRSP meltdown (Canada) | the meltdown bracket search, after-tax estate | same shape, in the estate's terms |
| Health cover before Medicare (US) | the cliff plan's ACA years | which years stay under the line and the premium credit it keeps |
| Buy, rent or pay off | today's buy-or-rent and mortgage-payoff compares | the better choice and the difference in room |
| One of us dies early | survivor modeling, each partner in turn | the survivor's verdict |
| What I leave behind | end assets (US), after-tax estate (Canada) | the figure at the plan horizon, in today's dollars |

"What if I live 10 years longer?" is no longer a separate question: the verdict already runs to the plan horizon, and
"How much can I spend?" covers a longer horizon if the user moves it. "What if returns are lower?" becomes the
verdict's "see the bad ones" link (historical view) and, from there, the market-scenarios card.

### Ranked moves (Tight or Short only)

Under the verdict, replacing the run-out banner (`#shortfallBanner`):

> **Tight** — runs out at 91 in the projection.
> Biggest fixes: retire 2 years later (fixes it) · cut spending 6% (fixes it) · turn on Roth conversions (+$3K/yr)

- **Moves tested:** retire later (the smallest delay that fixes it, as `findMinimalRetirementDelay`), cut spending
  (the spending room itself), turn on conversions / the meltdown if off, turn on the tax-aware withdrawal order (US)
  if off, turn on guardrails if off, turn on pension splitting (Canada) if off. Social Security / CPP / OAS timing
  after Batch 6.
- Each shows whether it fixes the plan on its own, or its gain in room. Up to four, best first. "Turn on guardrails"
  is described by its result under the guardrails rule: "lasts to 100, with spending cut by up to 30% in bad years".
- **"Try"** opens a held preview (owner's decision), like market-scenario mode: the plan is run with the move applied,
  a banner names the move with **Keep** and **Revert**, the real settings are kept in a revert snapshot, and nothing
  is autosaved as the user's plan until Keep. Keep writes the move to the inputs (with the normal undo); Revert
  restores the snapshot. This is a new sanctioned write path: it gets its own module beside
  `src/shared/ui/plans/market-scenario-mode.js`, and CLAUDE.md's list of sanctioned writes gains a line. How the two
  modes interact (a Try while a market scenario is running) is the builder's to settle, the simplest being that
  only one preview can be open at a time.
- The two structural "drivers" the banner tests today (LTC, post-retirement premiums) are not moves (nobody can turn
  off long-term care), so they go.

### What goes

- The run-out banner (`shortfall-banner.js`) and both countries' `shortfall-drivers.js`.
- The "What do you want to figure out?" card (`#decisionCard`, `decision-questions.js` in shared and both countries);
  `decision-compare.js` stays if the goal answers reuse its table, otherwise goes.

## Constraints

- Both planners in the same PRs, owner's decision. Canada has no cliff plan, strategy search or ACA, so its goal list
  and moves are shorter; Canada-only pieces (pension splitting, after-tax estate, OAS recovery) appear where the US has
  its own.
- The repository's rules apply: engine functions take the run context first and run variants through a `contextFor`
  factory; new UI code goes in the topic folders (`results/`, `inputs/`); a new field needs `defaults`, a `FIELDS`
  entry and a `normalizeState` guard; `npm run analyze` after adding or removing modules; both version badges bump in
  every user-facing PR; README feature list and `docs/architecture/inputs-and-ui.md` update in the same commit.
- No change to any projection number. `npm test` stays exact; `snapshot_ui` text and layout baselines move on
  purpose, stated in each commit.
- The MCP tools (`read_fire_projection`) may report the verdict and spending room; that is optional.

## Left to the builder

- How the work splits into PRs. Suggested order: verdict first (it has value alone and the other parts need spending
  room), then setup and the ranked list, then goal answers and moves.
- The spending-room search method and its tolerance; the impact approximation, once checked.
- Exact wording of every sentence, within the tone of the mockups and the existing UI.
- Layout of the guidance area and the goal chips on desktop and mobile.
- Which existing tests and root `test_*.js` scripts are rewritten or removed with the pieces they cover.
