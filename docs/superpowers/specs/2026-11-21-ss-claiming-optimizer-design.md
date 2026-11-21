# Social Security claiming-age optimizer (US): design

Date: 2026-11-21. Status: design agreed with the owner in a brainstorm; not started. US only.

## 1. Intent

Help a household choose when to claim Social Security, and write the choice into the plan with one click. One results
card covers three households:

- **a single person**: their own retirement benefit, claimed at 62 to 70;
- **a couple**: each partner's own retirement benefit, claimed independently at 62 to 70;
- **a widow(er)**, already widowed: a survivor benefit on the late spouse's record (from 60) and their own retirement
  benefit (from 62), taken in either order, switching to the larger one when it starts.

**Why now.** A real user, widowed at 59½ and already retired, faces exactly the third choice: take the survivor benefit
at 60 and switch to their own at up to 70, or take their own at 62 and switch to the survivor benefit later (up to its
full retirement age, 67). The planner cannot describe this person today: a widowed user can only be entered as a single
person, with nowhere to put the late spouse's record, and the entered benefit is paid as-is from whatever start age is
set, so moving the age changes when the money arrives but not how much. SSA's own tools show benefit amounts by age;
what this planner adds is the effect on taxes, healthcare (ACA, IRMAA), the portfolio and the run-out year.

**Success.** The widowed user enters the two figures SSA quoted on the phone and their own benefit at full retirement
age, and the card names the best order and ages, shows how the answer changes with how long they live, and applies it.

## 2. Goals, non-goals, anti-goals

Goals:
- A results card that searches claiming ages with the full projection, ranks them, and applies the winner.
- Survivor benefits modeled by SSA's rules (age reduction, switching, the widow's limit), both for a person who is
  already widowed and for a couple whose survivor modeling has one partner die mid-plan.
- The longevity bet made visible: the best choice if the plan ends at 80, 85, 90 or 95.

Non-goals (named in one line on the card or in the README):
- the earnings test (owner, 2026-11-21: "we can model working during claiming later"; today's warning stays);
- remarriage (remarrying before 60 ends the survivor benefit; noted in the input's info bubble);
- the disabled widow(er)'s benefit at 50-59, the child-in-care benefit, child benefits and the family maximum;
- divorced-spouse benefits; the $255 lump-sum death payment;
- the January lag of delayed credits; claiming in months rather than whole years;
- searching the survivor's start age for a couple whose partner dies mid-plan (owner, 2026-11-21, option a: a fixed rule,
  section 5.3). Once a death has happened, the user switches to the widowed input and the card searches it for real;
- Monte Carlo or the historical view as the ranking (they are not used to choose; section 6);
- Canada (section 11).

Anti-goals:
- A card that ranks claiming ages while the benefit amount does not depend on the age (the `atClaim` basis): it would
  name a "best" age that is only a timing artifact. The card refuses that case (section 7.4).
- "Best" silently tied to one life-expectancy guess.
- A search slow enough to make typing stutter.

## 3. Relation to Batch 6 and Batch 8 (owner, 2026-11-21: "first option")

Batch 6 was scoped on 2026-11-05 in commit `ce3b78a` on the local branch `claude/batch6-social-security-85bbad`
(`docs/next-batches-plan.md`, "Batch 6" items 1-7, "Owner decisions", "Batch 6 notes"); it was never pushed, so the
parts this design needs are restated here. Item 5 (the trust-fund cut) has since been built as feedback B2
(`ssPaidShare`, `src/us/core/income/social-security.js`).

This card **replaces** Batch 6 item 7 (the 9 x 9 claiming-age table) and Batch 8 (the survivor-claim optimizer). It comes
**after** Batch 6's basis and factors (item 2) and survivor rules (item 4), and after the spousal benefit (item 3) for
couples. Batch 6's owner decisions stand: keep the full scope; guided entry from SSA's Quick Calculator; the full
retirement age derived from the age input and the tax year; the plan stores ages, not birth years; ages move
independently, not tied; "current plan" means current settings (no re-optimizing per choice).

When the Batch 6 scoping commit is brought to `main`, its items 7 and Batch 8 are marked as replaced by this spec.

## 4. Approaches (owner picked 1, 2026-11-21)

1. **A search module that runs the projection once per choice** (picked). A new `core/optimizer/` module runs variants
   through a `contextFor` factory, ranks with the objective registry, and feeds a US results card with Apply. It catches
   everything a claiming age touches (taxable Social Security, IRMAA, ACA premium credits, the cliff plan's room, the
   run-out year) and follows the rules the plan optimizer already follows.
2. A "move" in the guidance moves card: the try-and-apply machinery exists, but a move tests one change; a 72- or
   81-cell grid and the longevity row do not fit it.
3. A benefits-only break-even formula with no projection runs: instant, but it ignores taxes, ACA, IRMAA and the
   portfolio, which is what the planner adds over SSA's tools.

## 5. Benefit rules

Verified rules are in section 12. Whole years throughout: "claims at 62" means the benefit is paid for the whole
projection year in which the person is 62 (today's year model).

### 5.1 Own retirement benefit (Batch 6 item 2; a prerequisite)

Per person, `ssBenefitBasis` = `atClaim` (today: the entered monthly amount is paid as-is from the start age; the default
and every saved plan, so nothing moves) or `pia` (the amount is the benefit at full retirement age, the PIA, in today's
dollars, and the planner applies the claim-age factor). Factor: minus 5/9 of 1% a month for the first 36 months early,
5/12 of 1% beyond; plus 2/3 of 1% a month after full retirement age to 70. Full retirement age by birth year from the
age input and the tax year (67 for anyone born 1960 or later). Guided entry per Batch 6 item 1.

### 5.2 Survivor benefit, already widowed (new inputs)

For a single person only (`singlePerson`), a switch **"I'm widowed: show my late spouse's record"** (`ssWidowed`,
default false). Under it:

- `ssSurvivorMonthlyFra`: "Survivor benefit at your full retirement age, as SSA quotes it" (monthly, today's dollars,
  a money field). Required while widowed.
- `ssSurvivorMonthly60` (optional): "SSA's quote at 60", blank by default. Only needed when the late spouse had
  started a reduced benefit before their own full retirement age (the widow's limit).
- `ssSurvivorStartAge`: the age the survivor benefit starts, 60 to 70 (default the survivor full retirement age, rounded
  up to a whole year; ages past it pay the same as at it).
- A check line under the inputs: "At 60 this is $X a month: compare it with SSA's quote."
- A one-line hint: "SSA quotes survivor amounts by phone (1-800-772-1213) or at an office; ask for the amount at 60
  and at your full retirement age."

The survivor full retirement age comes from the person's birth year (survivor table, section 12: 67 for anyone born
1/2/1962 or later). Let `f(x)` be the survivor age factor: 1 minus 28.5% x (months from x to survivor FRA) / (months
from 60 to survivor FRA), floored at 71.5% at 60 and capped at 1 from survivor FRA on. The yearly survivor amount at
start age x is:

- without the 60 quote: `F x f(x)`, where F = `ssSurvivorMonthlyFra`;
- with the 60 quote Q: `min((Q / 0.715) x f(x), F)`.

*Why this works (my call, a refinement of the brainstorm's "collected early" box):* the survivor benefit is
min(PIA x f(x), max(82.5% of PIA, the deceased's reduced benefit)) when the deceased took a reduced benefit, and
PIA x f(x) otherwise (POMS RS 00615.320). At 60, f = 0.715 and 0.715 < 0.825, so SSA's quote at 60 is always
0.715 x PIA, and SSA's quote at full retirement age is the cap. The two quotes therefore fix the whole curve, and the user
never has to know whether or how the spouse claimed. Without the 60 quote the planner assumes no widow's limit, the
real user's case (the spouse had not claimed). If Q / 0.715 is below F the inputs are inconsistent and the check line
says so; the planner then uses `F x f(x)`.

Payment: nothing before the earlier start; from each start, that benefit is available; once both have started, the
higher of the two is paid (SSA pays the smaller plus the excess of the larger; POMS RS 00615.020, method B for
"D/W then A" and "A then D/W"). Each benefit is cut only for the age at which it starts: no carry-over reduction in
either order. Survivor benefits are Social Security benefits for 26 U.S.C. 86 and for the state Social Security kinds,
so they go into the `ssA` slot and everything downstream reads them unchanged. B2's `ssPaidShare` applies to both.

### 5.3 Survivor benefit, a couple with a death mid-plan (Batch 6 item 4, simplified)

With survivor modeling on (`survivorEnabled`, `survivorPartner`, `survivorDeathAge`) and both own benefits in the `pia`
basis, the "keep the greater of the two" swap in `socialSecurityIncome` is replaced by the rule:

- The deceased's base: their benefit as paid at death, including delayed credits; if they had not claimed, their PIA
  plus delayed credits earned to the death year (none before full retirement age). If they had claimed before full
  retirement age, the widow's limit applies: min(base PIA x f(x), max(82.5% of PIA, their reduced benefit)).
- **The survivor benefit starts in the death year, or at the survivor's age 60 if that is later** (owner, 2026-11-21,
  option a), cut by `f` at that age. No input; this is what most survivors do.
- The survivor is paid the higher of their own benefit (from their own start age) and the survivor benefit.

In the `atClaim` basis the swap stays as today. The two `A`-slot rules apply: the survivor's benefits land on the
survivor's slot through the existing remap, and `tests/survivor_symmetry.js` (identical partners, A dies equals B dies)
must stay green.

### 5.4 Spousal benefit (Batch 6 item 3; needed before couples get the card)

As scoped in Batch 6: an excess of max(0, 50% of the worker's PIA minus own PIA), reduced for claiming before full
retirement age (25/36 of 1% a month for 36 months, 5/12 of 1% beyond; no delayed credits), payable once the worker has
claimed and the spouse is 62. The couple grid is wrong without it (it is why the lower earner may claim early while the
higher earner waits), so couples are hidden from the card until it lands (section 10).

### 5.5 One formula

Today the benefit formula is copied in `socialSecurityIncome`, the cliff-plan solver (`ssAt`, `lambdaEstimate`'s `ssOf`)
and `src/us/core/income/sankey-columns.js`. The prerequisite PRs put all of it in one function in
`src/us/core/income/social-security.js` that every caller uses, so the card, the table, the solver and the Sankey can
never disagree.

## 6. What "best" means (owner, 2026-11-21: "Yes")

- **Ranking:** a choice whose plan never runs out beats one that does; among those, the higher after-tax end value
  (the registry's `endValue`, `afterTaxEndValueUS`, which counts the tax still owed on traditional balances; ranked with
  the cliff plan's $1 tolerance); among choices that run out, the later run-out year. Ties go to the current choice,
  then to the earlier claim ages.
- **Runs:** standard (deterministic) projections only, through `runSourceFor` so a market scenario is honored. The
  objective registry already ranks on those and only reports Monte Carlo and historical rates; claiming age changes
  guaranteed income, not market risk.
- **The longevity row:** for a single person and a widow(er), the best choice if the plan ends at 80, 85, 90 and 95
  (only ages past the person's current age and up to 100), and the break-even line: "Waiting past <earliest> pays off if
  you live past <age>", the first end age at which a later choice's value passes the earliest choice's. For a couple, the
  row is left out (their bet is joint, and survivor modeling already covers the death); the card says so.
  *Builder's call:* each end age is the ranking of runs with the plan's life expectancy set to that age. Reading the
  after-tax value at that year from the full-length run is allowed only if a test proves it gives the very double the
  shortened run gives; otherwise the row re-runs (at most 4 x 72 = 288 extra runs, still in slices).

## 7. The search

### 7.1 Axes

- Single: own start age, max(62, current age) to 70: up to 9 choices.
- Widow(er): survivor start age, max(60, current age) to the survivor full retirement age rounded up (60-67 for anyone
  born 1962 or later), by own start age, max(62, current age) to 70: up to 8 x 9 = 72.
- Couple: Partner A's own start age by Partner B's, each max(62, own current age) to 70, each on that partner's own age
  and birth year: up to 81.

**Already collecting:** a start age at or below the person's current age is read as "already collecting" and that axis
is fixed at it (SSA does not let a plan claim retroactively in a way this planner models). An axis with one value
collapses the grid to a row, or to the current choice alone, in which case the card says there is nothing to choose.

The start-age maximum is 70 even with B1's "if the law changes" switch on (`ssLateStartEnabled`): delayed credits stop
at 70, so a later start only loses money. *My call; a later start age already set by the user is kept as the current
choice and shown.*

### 7.2 Variants and speed

Each choice is a shallow variant `{ ...base, ssStartAgeA, ssStartAgeB, ssSurvivorStartAge }` run through a `contextFor`
factory from the caller (the UI passes `stateContextFor()`). The stored cliff plan and the Roth schedule are replayed as
they are, never re-searched per choice; the card says "Re-run Plan search after applying". At about 1-13 ms a run, the
grid takes well under a second. It runs in the deferred render (`renderDeferred()` and `markDeferredStale()`), in timer
slices like the guidance jobs, holding under the test global `__testHoldGuidance` the same way, with a
`__test_flushClaimSearch()` hook. **Dedupe:** two choices whose yearly Social Security streams are identical (for example
a survivor start that is never the higher benefit) are run once and shown as "same as <choice>". The search module is an
engine module (`fn(ctx, contextFor, ...)`, no store imports, any memo registered in `tests/engine-purity.json`).

### 7.3 Cache key

The card's result is keyed on `storedPlanFingerprint` of the base state plus the tax year, so a change to any input
reruns it and a change of only a list row's name does not.

### 7.4 When the card does not search

- Every own benefit the card would vary is in the `atClaim` basis and there is no widowed survivor axis: the card shows
  one line, "Enter your benefit at full retirement age (switch the basis) to compare claiming ages", with a button that
  scrolls to the field.
- A widow(er) whose own benefit is in `atClaim`: only the survivor axis is searched; the own axis is fixed and a line
  says why.
- No Social Security entered, or everyone already collecting: the card is hidden.

## 8. What the card shows (owner, 2026-11-21: "that looks good")

Single:

```
When to claim Social Security
Best: claim at 70.  After-tax end value $X more than your current age, 62.
own age   62   63   64   65   66   67   68   69   70     (shaded by result; current choice outlined)
If the plan ends at   80     85     90     95
Best age              62     66     70     70
Waiting past 62 pays off if you live past 81.
[Apply: claim at 70]
```

- **Widow(er):** the grid is survivor start age (rows, 60-67) by own start age (columns, 62-70). Headline in words:
  "Best: survivor benefit at 60, then your own at 70." Deduplicated cells show "same as ...".
- **Couple:** the 9 x 9 grid of Partner A's age by Partner B's. One line names the best pair, the best "same age for
  both" pair and the current ages, with the dollar gaps.
- **Every household:** a line "Uses standard projections with your current plan settings; depends on life expectancy";
  the cell tooltip gives the after-tax end value in today's dollars and the run-out year, if any.
- The card's place: in the results column beside the plan optimizer card (the builder picks the exact spot); collapsed
  state remembered like the other analysis cards. Mobile width (390 x 844) must not scroll sideways: the grid scrolls
  inside the card if needed.

## 9. Apply

- Writes the best choice's ages: `ssStartAgeA` (single, widow(er)), `ssStartAgeB` (couple), `ssSurvivorStartAge`
  (widow(er)). One undo snapshot (`snapshotForUndo`), then `render()`, then the autosave. The card's Apply joins the
  sanctioned writes listed in `CLAUDE.md` ("State and the sanctioned writes").
- Refused, with the plan card's stale wording, when the inputs changed since the search drawn.
- A stored plan becomes stale (the start ages are in its fingerprint) and the plan card's existing stale line shows. The
  new keys follow B2's pattern in `fingerprintJson`: `ssWidowed` and its three fields are left out while `ssWidowed` is
  false, so no saved plan goes stale when this ships.

## 10. Proposed PR breakdown

Each PR gets its own plan, reviewed by an Opus subagent before implementation; each bumps the US version badge and
updates the README and the topic file (a new `docs/architecture/us-social-security.md`, created in PR 1).

1. **Basis and factors** (Batch 6 items 1-2): `ssBenefitBasis` per person, full retirement age by birth year, the
   own-benefit factors, the guided entry, the one-formula consolidation (5.5), Vitest suites for the factors at 62,
   full retirement age and 70, legacy saves staying on `atClaim`.
2. **Survivor rules** (5.2, 5.3): the widowed inputs and the couple rule, with their `FIELDS` entries and
   `normalizeState` guards, the fingerprint rule (section 9), the info bubbles, Sankey and solver through the one formula,
   Vitest cases (the 71.5% at 60, both orders, the widow's limit from two quotes, the inconsistent-quote fallback, the
   start in the death year or at 60), `survivor_symmetry.js`.
3. **The search** (section 7): the `core/optimizer/` module, ranking, dedupe, the longevity row and break-even, Vitest
   with hand-computed two-year cases where each order wins.
4. **The card and Apply** (sections 8-9): single and widow(er) first; couples hidden until PR 5. A root Playwright
   script (`test_claiming_card.js`): the grid draws, Apply writes the ages and undoes, the mobile check.
5. **Spousal benefit** (5.4), then couples shown on the card.

Order 1 → 2 → 3 → 4 → 5 gets the widowed user the card before the spousal work (an open decision, section 13).

## 11. Canada

Nothing in this work. CPP and OAS timing is Batch 6's separate Canada item (an `at65` basis: CPP minus 0.6% a month
before 65 and plus 0.7% after; OAS plus 0.6% a month after 65), and a Canada claiming card could reuse this card's
layout and search module later. Listed as a follow-up.

## 12. Verified rules

Read 2026-11-21 in Chrome (www.ssa.gov answers HTTP 403 to automated fetches) and directly for POMS and the CFR; the
2026-11-05 recon of commit `ce3b78a` is carried over where marked.

| Rule | Verified | Source |
|---|---|---|
| Survivor eligibility | 60 or older, or 50-59 with a disability; married at least 9 months; did not remarry before 60 (50 if disabled). | ssa.gov/survivor/eligibility (2026-11-21); 20 CFR 404.335(c), (e) |
| Survivor amount | Starts at 71.5% of the spouse's benefit and rises to 100% at the survivor's full retirement age (66-67). If eligible for two benefits, the higher is paid, not both; the person can switch later, for example survivor first, then retirement at 70. $255 lump-sum death payment. | ssa.gov/survivor/amount (2026-11-21) |
| Survivor reduction | Maximum 28.5% for all widow(er)s, spread over the months from 60 to survivor FRA (19/56 of 1% a month for born 1/2/1962 or later, survivor FRA 67). Survivor FRA: 66 for 1/2/1945-1/1/1957, +2 months a year to 67 for 1/2/1962 and later. | POMS RS 00615.301 (12/05/2023, read 2026-11-21); RS 00615.003 (ce3b78a) |
| Widow's limit | Only if the deceased was ever entitled to a reduced benefit: limited to the larger of 82.5% of the PIA or the deceased's reduced benefit. Delayed credits applied as though the deceased had lived (deaths 5/83 and later). | POMS RS 00615.320 (12/14/2023, read 2026-11-21) |
| Switching, both orders | A widow(er) can receive reduced benefits on one record and later file on another for a higher benefit. Deemed filing does not apply to survivor benefits; the claimant may restrict to the survivor benefit and delay the retirement benefit. Dual entitlement "A then D/W" and "D/W then A": both reduced independently, the smaller paid plus the excess of the larger (method B). | POMS RS 00615.301 A.1-A.2; GN 00204.035 B (11/16/2026); RS 00615.020 (12/05/2023), all read 2026-11-21 |
| Own early reduction | 5/9 of 1% a month for 36 months, 5/12 of 1% beyond; at 62, 70% for born 1960 or later (30% cut). Spouse at 62: 35% cut. | ssa.gov/benefits/retirement/planner/agereduction.html (2026-11-21); POMS RS 00615.101 (ce3b78a) |
| Delayed credits | 2/3 of 1% a month (8% a year) to 70, for born 1/2/1943 or later. | POMS RS 00615.692, 20 CFR 404.313 (ce3b78a) |
| Full retirement age | 67 for born 1/2/1960 or later; 1 January birthdays count as the prior year. | agereduction.html (2026-11-21); POMS RS 00615.003 (ce3b78a) |
| Earnings test (not modeled) | Only below full retirement age; applies to survivor benefits too. 2026: $24,480 ($1 per $2 over), $65,160 in the year of FRA ($1 per $3, months before FRA); 2027: $25,560 and $67,920. Withheld benefits raise the benefit permanently from FRA. | ssa.gov/oact/cola/rtea.html (2026-11-21); 20 CFR 404.415, 404.430 |
| Taxation | Survivor benefits are Social Security benefits under 26 U.S.C. 86; base amounts unchanged ($25,000 / $32,000; $34,000 / $44,000). | 26 U.S.C. 86 (ce3b78a) |

## 13. Open owner decisions

1. PR order: widowed users get the card before the spousal benefit (1 → 2 → 3 → 4 → 5), or spousal first so the card
   ships for all households at once.
2. The widow's-limit input: the optional "SSA's quote at 60" (section 5.2) instead of the brainstorm's "the spouse was
   already collecting early" box with the amount they were paid.
3. The longevity row's end ages (80, 85, 90, 95) and whether couples get any version of it.

## 14. Left to the builder

The card's exact place and styling; the shading scale; field ids and labels beyond those named here; the
`contextFor` plumbing; whether the longevity row reads the full run or re-runs (section 6, with the exactness test);
how the slices are sized.
