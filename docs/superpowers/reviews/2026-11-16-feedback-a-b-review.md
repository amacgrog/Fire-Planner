# Review: first-user feedback, Tiers A and B (2026-11-16)

Reviewed: `main` at bf5c6ba (Tier A #100, B1 #101, B2 #102, B3 #103, the survivor-loans fix #104, and B4 #105, which
was merged on 2026-11-16 while this review was being briefed; its findings are labelled B4). The plan under review is
`docs/superpowers/specs/2026-11-15-first-user-feedback-plan.md`. The review was done by an independent subagent on the
Fable model, which read the copy and behavior on the built `dist/Planner_US.html` in Playwright. The session that
started it re-ran its probes and checked the cited code. No file under `src/` was changed.

## Summary

- Tiers A and B are honest and correctly built. The copy checked against the engine is true: the assumptions list,
  the guardrail rule, and the B1, B2 and B3 bubbles. The unit files for B1-B4 and #104 pass (92 passed, 9 skipped).
  No A or B change makes the planner read rosier than the engine supports.
- The verdict still has one confusing sentence, and it is on the note #1 surface. It predates A/B. The Short
  sentence mixes two age scales: "your money runs out at 103 … to make it to 100" (F1).
- Two small gaps: a card with no minimum and no payment grows to billions while the verdict still reads "lasts
  through age 100" (F2). The wizard's spending field, where a first-time user types the number, carries none of A2's
  "12 months of actual spending" advice (F3).
- For the owner to decide: the verdict reads "Comfortable" at 80-89% historical success, while the dashboard tile on
  the same page paints that same rate red (F5). Monte Carlo has no part in the word.
- Order from here: V1 and a short "How this was checked" paragraph first. Then C3 → C2 → C1 → C5 → C4, then D1. D2
  waits for a scope decision, D3 comes after D2, and D4 is dropped unless users ask for it.

## The notes, one by one

| # | What addresses it now | Verdict | Gap |
|---|---|---|---|
| 1 Never overly optimistic | B4 (Tight when history alone fails, the exact failed count, "in an average market", percents rounded down); B2's one-click Trustees cut (the default household goes Comfortable → Short); the A1 callout | Partly | The Short sentence's ages (F1); Comfortable at 80-89% (F5); the verdict never reads a loan balance left at the end (F2); Monte Carlo has no part in the word; no "how validated" copy (F6) |
| 2 FIRE prerequisites | A1: `beforeYouRely.html` on wizard step 1 and in the method card, in both planners | Addressed | — |
| 3 Expense accuracy | A2: the spending bubble (`src/us/index.html:85`) and the guidance row tip (`guidance.js:28`) | Partly | The wizard spending descriptor (`src/us/index.html:350`) has none of it (F3) |
| 4 Tax-rate changes | Nothing | Not yet | C2 |
| 5 Inflation | A4 inflation bubble; a scenario crash carries its own inflation and bond return; historical and Monte Carlo use real CPI | Partly | No inflation spell without a crash (C3). Under a scenario, salaries, cash and the mortgage stay on plan rates (`market-scenarios.md`, "Known approximations"), and the bubble does not say so |
| 6 Allocation assumptions | A3 `methodAssumptions.html`: one rate per holding, the reserve rule, no rebalancing or glide path. Checked against `growBalances` / `routeSurplus`: true | Addressed (copy) | The engine is unchanged (D2) |
| 7 Returns over time | The Market scenario card (crash age, depth and length; history replay); A4 bubbles name it | Partly | One cash rate for the whole run (C1); the copy says so |
| 8 State moves | Nothing | Not yet | D1 / E4 |
| 9 Monte Carlo beyond returns | Monte Carlo samples 5-year blocks, so bonds and CPI move with stocks; the method card says so | Partly | No income or expense shocks (D3) |
| 10 Responses to markets | Guardrails; A3 states the exact rule (matches `guardrails.js:7-14`) | Partly | C5, D4 |
| 11 Debt | B3 cards and lines of credit (`revolvingSchedule`), the #104 survivor fix, the A1 and "Not modeled" copy updated | Addressed | The no-minimum corner (F2); an APR over 40% is clamped silently (F4) |
| 12 Social Security | B1 start age to 75 (a 72 clamps to 70 with the switch off and stays 72 with it on; rows pay 0 at 70-71 and the benefit from 72); B2 cut (rows and the survivor pay 0.78×; MAGI and Pub. 915 covered by tests) | Partly | Means test (C4); the Trustees figures in the bubble are not yet checked against the report itself (F7) |

## Findings, ranked

The spot-check column says what the starting session re-ran.

**F1 · Medium · CONFIRMED (spot-checked) · existed before A/B, verdict copy.**
`src/shared/ui/results/plan-verdict.js:39` sets `endAge` to the larger of the two life expectancies, each in that
partner's own age. `depletedAge` is Partner A's age (`src/us/core/projection/run-projection.js:1584`, `age` in the
year loop). The run ends when the younger partner reaches their life expectancy, which is past A's. Lines 88-89 print
both ages in one sentence. Scenario: the default US household (A 48, B 43, both to 100) at $70,000 spending reads:
"Retiring at 55, your money runs out at 103. You would need to spend about $1K less a year (today's dollars) to make
it to 100." Here 103 is A's age (B is 98), and 100 is B's life expectancy. "Lasts through age 100" likewise names B's
end age, without saying whose age it is. Fix: name whose age it is, or put both figures on one partner's scale.
Canada shares the module.
Re-run: the reviewer's probe2 printed the sentence above, and the status bar read "Short · runs out at 103".

**F2 · Low · CONFIRMED (spot-checked) · B3 (#103).**
`normalizeLists` allows a minimum of 0% and a $0 floor together with a payment of 0
(`src/shared/core/inputs/lists.js:86-88`). `revolvingSchedule` then pays nothing, and the balance compounds for the
whole run. The verdict reads only `depletedAge`, never `loanBalance`. Scenario: a $10,000 card at 22% with a 0%/$0
minimum and no payment ends the run with a `loanBalance` of about $3.1 billion and a net worth of about −$3.1 billion.
The verdict still reads "Tight · lasts through age 100 · +$5K/yr room". The row's red warning does show ("The first
payment ($0.00) does not cover the month's interest ($183.33)…").
Related, and realistic: at the default 2%/$25 minimum, the same card shows "Paid off in 96 years 6 months". The run
ends with about $2.4K still owed, which nothing in the verdict mentions.
Suggested fix: a floor in the normalizer (a minimum of at least 1% or $1), and a verdict note (or Short) when a loan
balance outlives the plan.

**F3 · Low · CONFIRMED (spot-checked) · Tier A (#100).**
The wizard's `wizardSpending` descriptor (`src/us/index.html:350`) still reads "Everyday living costs only —
groceries, …". It says nothing about 12 months of actual spending or irregular costs. A2's advice appears only in the
sidebar bubble and the guidance tip, but a first-time user enters the figure in the wizard. Canada's wizard is the
same. A few hours.

**F4 · Low · CONFIRMED · B3.**
`lists.js:80` clamps `rate` to 40 (`num(l.rate, 0, 0, 40)`), so a 45% line of credit silently becomes 40% with no
message. Rare. Raise the cap for revolving rows, or say so.

**F5 · Low · CONFIRMED (spot-checked) · an owner judgment.**
At $60,000 spending with a 10% return, the verdict reads "Comfortable · +$17K/yr room · 82% historical", while the
dashboard's historical tile paints the same 82% red (`plan-verdict.js:205`: red under 90%). So 7 of the 41 starting
years fail, and the headline word is still Comfortable. `VERDICT_RULES.minHistSuccess` (0.80,
`spending-room.js:8`) is the owner's earlier decision. The choices: raise it to 0.90 to match the tile, or make the
tile amber at 80-89%. Monte Carlo has no part in the word. A sweep from $60K to $65K found no case where Monte Carlo
alone would flip it (hist/MC 0.829/0.865 … 0.780/0.745), but nothing rules one out.

**F6 · Low · PLAUSIBLE · copy.**
The user asked how the figures were validated, and no on-page copy answers. Add a "How this was checked" paragraph in
the method card: one tax year, three states and Ontario, four bugs found and fixed, the same AI wrote the code and the
checks, and V1/V2 extend the check. State the limit too: one year's tax, not a whole projection. A few hours; it goes
with V1.

**F7 · Low · not verifiable offline · B2 (#102).**
The bubble's Trustees figures (`src/us/index.html:160`, `ss-benefit-cut.js:3-8`: the 2026 report, depletion late in
2032, about 78% payable) came from a CRS summary, because the SSA site refused a fetch. The owner should confirm them
once against the report itself.

**B4 (#105):** no defects found. `historySetsWord` shares `marginOk` with `planVerdict` (`spending-room.js:95-110`),
so the two cannot disagree. Every displayed success percent rounds down. Re-run: at a 10% return and $66,000, the page
reads "Tight (history) · +$11K/yr room · 73% historical", and the sentence ends "But it runs out in 11 of the 41
historical starting years since 1928". One wording nit: "41 historical starting years since 1928" could be read as
every start since 1928. "41 starting years with a full record" is tighter.

**B1 (#101):** correct. The MCP schema still has no min/max for the start ages (noted in the PR).
**B2 (#102):** the cut reaches the survivor swap (at the death age the row pays 0.78 × the survivor benefit), the
cliff plan (`solver.js:371,453`) and the Sankey. The result cache keys cover it through the inputs. It is left out of
the Monte Carlo seed on purpose.
**#104:** confirmed by its test. The follow-up it names, an unclamped `survivorDeathAge`, is still open.

## How to proceed: C, D and validation

### Order

V1, together with the F6 paragraph and the F1 and F3 copy fixes → C3 → C2 → C1 → C5 → C4 → D1 → D2 (after its scope
decision) → D3 → D4 only if asked. Start V2 alongside C2, in PRs of about ten jurisdictions each. It is data and test
work and has no engine conflict with C.

**V1 before C.** It is cheap, carries no engine risk, and is the only direct answer to the user's question about
validation and to note #1. It need not hold up C3 and C2 on the calendar, because the work is different in kind. This
changes the plan's "Suggested order", which puts C1 first and V beside the tiers without a place.

### Each item

- **C3, inflation spell — move it first.** It is the cheapest item and the clearest answer to note #5. The scope is
  right. Engine risk is low: it is a new scenario kind on the crash path's inflation and bond-return override in
  `scenario-source.js`. `taxFactors` already carry it, and the result cache keys on the inputs.
  *Decisions:* does the spell also set a stock return (default: the plan's)? Does it raise the cash rate (say no until
  C1)?
  *Copy to update (add to the spec):* the inflation bubble ("a Market scenario crash sets its own inflation"), the
  scenario card text, and a sentence that salaries stay on plan growth.
- **C2, federal rate what-if — second.** The scope is right: scale the rates, not the thresholds, US first.
  *Risk:* `taxFor` is the hot path. Read the factor once per year, as `ctx.taxFactors` does. A memo goes in
  `engine-purity.json`. Bench with `tests/bench_runs_interleaved.js`. The conversion ladder and the cliff plan fill
  to bracket thresholds, so their targets keep their meaning. `lambdaEstimate` and the plan's scores do see the higher
  rates, so planning and the run must read the same factor.
  *Decisions:* all brackets, or only from some bracket up? Capital-gains rates too? A preset (for example a
  TCJA-sunset shape)?
  *Copy to update (not in the spec yet):* the Taxes bullet ("2026 federal law"), the footer note, and the
  filing-status bubble.
- **C1, cash yield — third.** The switch, off by default, is right. One correction to the spec: `bondYield` is the
  10-year Treasury yield, not a cash rate. Either the bubble says "the 10-year yield less a spread", or a 3-month
  T-bill column is added to `HIST` (a data task). The historical parity test moves only with the switch on.
  *Touches:* `investmentIncome` and `growBalances` in both engines, and the scenario source's yield rule.
  *Copy to update:* the returns item in `methodAssumptions.html` (in the spec), plus the Historical bullet ("Cash and
  mortgage rates stay at your inputs") and the Canada equivalents.
- **C5, flexible guardrails — fourth.** It is the shared module, and its state is snapshotted automatically. Keep
  today's numbers as the defaults. If a graduated cut is to become the default, it goes in a separate commit that says
  it moves projections. One interaction is missing from the spec: `VERDICT_RULES.maxGuardrailCutPct` is a fixed 10,
  so a user who picks a 15% step would always read Tight. The rule must become relative to the chosen step (or to the
  floor).
  *Decisions (already listed in the spec):* which settings are shown and which live only in presets; whether a
  graduated cut becomes the default. *Add:* how the verdict rule above changes.
- **C4, means test — last in C.** Reading the previous year's balances keeps it out of the MAGI iteration, which is
  right. The cliff plan's estimates (`ssAt` / `ssOf`, `solver.js:359-371,453`), however, have no future balances. Use
  the pool at planning time, with the uncut share as a fallback, and say so; otherwise the bridge check turns
  optimistic.
  *Decisions first:* which assets count (liquid only? the home?); the threshold in today's dollars; a cliff or a
  taper; whether it stacks with B2.
  *Copy to update:* the B2 bubble and the "Not modeled" list.
- **D1 (E4), state relocation — next after C.** It is already specified, and the risk is moderate. It reads in four
  modules (`solver.js`, `aca.js`, `federal-tax.js`, `state-tax.js`). The compiled rule caches are per code, so a
  per-year state is cheap. The ACA premium and Medicaid expansion are per state too, so a move should let the user
  enter the new state's premium.
- **D2, glide path and rebalancing.** Decide the scope first. Recommended: put the glide path beside the bond reserve.
  The reserve stays the spending buffer, and the glide path sets the split of the invested pool, which contains the
  blast radius. It still touches both engines, the bucket mode and historical parity. Do not start it before V2 is
  well along.
- **D3, Monte Carlo shocks — after D2.** The new settings must enter the Monte Carlo seed, because they change the
  paths. Every US seed then moves, and the commit must say so. Keep each shock O(1) per year.
- **D4, market responses:** drop it until users ask.
- **V1 / V2:** as specified. V2's cases are literal hand-computed figures (rule 2). The F6 paragraph tells users the
  limit: one year's tax, not a whole projection.

## Owner answers (2026-11-16)

- **1:** the tile turns amber from 80% to under 90%, and 82% stays Comfortable. Monte Carlo does not count toward the
  word.
- **2:** yes, a balance left at the end of the plan (the last surviving partner's end) changes the verdict. The owner
  adds an option for whether a dying partner's debts pass to the spouse. This is recorded as B5 in the plan, with
  its open questions.
- **3:** agreed: V1 before C, and C3 before C1.
- **9:** checked against the SSA's 2026 summary. The figures are right (Q4 2032, 78%), but the payable share falls
  to 62% by 2100; see the plan.
- Still open: items 4-8, and B5's questions.

## Owner decisions needed

1. **F5:** does Comfortable need 90% historical success, to match the red tile, or does the tile turn amber at
   80-89%? Should Monte Carlo count in the word?
2. **F2:** should a loan balance left at the end of the plan change the verdict (to a note, or to Short)?
3. **The order:** V1 and the "How this was checked" paragraph before C, and C3 ahead of C1?
4. **C3:** does the inflation spell set a stock return, or only inflation and bonds?
5. **C2:** which brackets are scaled, are capital gains included, and is there a preset?
6. **C1:** use the 10-year yield less a spread, or add a T-bill series to the data?
7. **C4:** which assets count, a cliff or a taper, and does it stack with B2's cut?
8. **D2:** a glide path beside the bond reserve, or in place of it?
9. **F7:** check B2's Trustees figures against the report itself.
