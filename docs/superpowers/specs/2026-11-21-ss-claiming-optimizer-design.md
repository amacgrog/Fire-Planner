# Social Security claiming-age optimizer (US): design

Date: 2026-11-21. Status: design agreed with the owner in a brainstorm and every decision settled (2026-11-21); not started. US only.

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
- `ssSurvivorQuoteMonthly` and `ssSurvivorQuoteAge` (optional): "SSA's quote at an earlier age" and that age (60 up to
  the survivor full retirement age; default 60, or the current age if later: SSA quotes from the current age on). Only
  needed when the late spouse had started a reduced benefit before their own full retirement age (the widow's limit).
- `ssSurvivorStartAge`: the age the survivor benefit starts, 60 to 70. Stored as `null` meaning "at the survivor full
  retirement age" (the default), resolved in the engine: the survivor FRA depends on the tax year, and `normalizeState`
  must stay year-free for the fingerprint memos (`plan-optimizer.js:47-48`). Ages past the survivor FRA pay the same as at it.
- `ssSurvivorCollecting`: "I'm already collecting the survivor benefit" (default false; section 7.1).
- A check line under the inputs: "At <quote age> this is $X a month: compare it with SSA's quote."
- A one-line hint: "SSA quotes survivor amounts by phone (1-800-772-1213) or at an office; ask for the amount now
  and at your full retirement age."

The survivor full retirement age comes from the person's birth year (survivor table, section 12: 67 for anyone born
1/2/1962 or later). Let `f(x)` be the survivor age factor: 1 minus 28.5% x (months from x to survivor FRA) / (months
from 60 to survivor FRA), so 0.715 at 60 and 1 from survivor FRA on. The monthly survivor amount at start age x is:

- without the earlier quote: `F x f(x)`, where F = `ssSurvivorMonthlyFra`;
- with the earlier quote Q at age a: `min((Q / f(a)) x f(x), F)`, for x at or after a (the search's axis starts at the
  current age, so it never needs x before a).

*Why this works (my call, a refinement of the brainstorm's "the spouse was already collecting" box):* the survivor
benefit is min(PIA x f(x), max(82.5% of PIA, the deceased's reduced benefit)) when the deceased took a reduced benefit,
and PIA x f(x) otherwise (POMS RS 00615.320). SSA's quote at full retirement age is the cap L = F. A quote Q at age a is
min(PIA x f(a), F): if Q is below F, then Q = PIA x f(a), so PIA = Q / f(a) and the curve from a on is
min(PIA x f(x), F); if Q equals F, the cap already binds at a and, f being rising, the curve is flat at F from a on,
which the same formula gives. So the two quotes fix the curve from a on, and the user never has to know whether or how
the spouse claimed. (At 60, f = 0.715 < 0.825, so a quote at 60 always gives the PIA.) Without the earlier quote the planner assumes no widow's limit, the real user's case (the spouse had not claimed).
**Tolerance:** SSA rounds each benefit down to the dollar, so Q / f(a) commonly lands about $1 below F with no limit
(PIA $2,003.70: F $2,003, Q at 60 $1,432, Q / 0.715 = $2,002.80). When Q / f(a) is below F by no more than $2, the
quotes are read as "no widow's limit" and `F x f(x)` is used; below that by more, the check line says the two quotes
disagree and the planner uses `F x f(x)`.

Payment: nothing before the earlier start; from each start, that benefit is available; once both have started, the
higher of the two is paid (SSA pays the smaller plus the excess of the larger; POMS RS 00615.020, method B for
"D/W then A" and "A then D/W"). Each benefit is cut only for the age at which it starts: no carry-over reduction in
either order. Survivor benefits are Social Security benefits for 26 U.S.C. 86 and for the state Social Security kinds,
so they go into the `ssA` slot and everything downstream reads them unchanged. B2's `ssPaidShare` applies to both.

### 5.3 Survivor benefit, a couple with a death mid-plan (Batch 6 item 4, simplified)

With survivor modeling on (`survivorEnabled`, `survivorPartner`, `survivorDeathAge`), the deceased's own benefit in the
`pia` basis, and the couple married at the death (`marriedAtDeath`, `run-projection.js:333`; SSA needs 9 months of
marriage), the "keep the greater of the two" swap in `socialSecurityIncome` is replaced by the rule:

- The deceased's base B: if they had claimed at or after full retirement age, their PIA with the delayed credits of
  their claim age; if they had not claimed by the death year, their PIA with delayed credits earned to the death year,
  which stop at 70 (PIA x 1.24 at most for an FRA of 67), and none before full retirement age.
- The survivor benefit at survivor start age x: B x f(x), except when the deceased had claimed before full retirement
  age, where the widow's limit applies: min(PIA x f(x), max(82.5% of PIA, R)), R the deceased's reduced benefit (never
  R x f(x)).
- **The survivor benefit starts in the death year, or at the survivor's age 60 if that is later** (owner, 2026-11-21,
  option a), cut by `f` at that age. No input; this is what most survivors do.
- The survivor is paid the higher of their own benefit (from their own start age, in either basis) and the survivor
  benefit.

*My calls:* when the deceased is in the `atClaim` basis, or the couple was not married at the death, the swap stays as
today in `atClaim` and in `pia` pays the survivor's own benefit only (unmarried: no survivor benefit). In the `atClaim`
basis everything keeps today's operation order, so `npm test` stays exact to the cent. The two `A`-slot rules apply: the
survivor's benefits land on the survivor's slot through the existing remap (`social-security.js:25-27`, then
`year-stages.js:173-189`), and `tests/survivor_symmetry.js` (identical partners, A dies equals B dies) stays green; its
existing case is `atClaim`, so PR 2 adds a `pia`-basis case.

### 5.4 Spousal benefit (Batch 6 item 3; needed before couples get the card)

As scoped in Batch 6: an excess of max(0, 50% of the worker's PIA minus own PIA), reduced for claiming before full
retirement age (25/36 of 1% a month for 36 months, 5/12 of 1% beyond; no delayed credits). **Deemed filing** (everyone
born 1/2/1954 or later, which is every planner user under 72): the spouse files for both at once, so the excess starts at
the later of the spouse's own start age and the worker's start age (and 62), and is reduced for the spouse's age at that
point; a spouse delaying their own benefit to 70 gets no spousal excess before 70. It needs a marriage of at least one
year (`filingStatus` and `marryLater`: none before the wedding age plus one). The couple grid is wrong without it (it is why the lower earner may claim early while the
higher earner waits), so couples are hidden from the card until it lands (section 10).

### 5.5 One formula

Today the benefit formula is copied in the cliff-plan solver: `ssAt` (`solver.js:359-361`), `lambdaEstimate`'s `ssOf`
(`:420`) and its greater-of swap (`:458`, `:464`). The Sankey already calls `socialSecurityIncome`
(`sankey-columns.js:114`) and only copies the death derivation (`:55-62`). The prerequisite PRs put the formula in one
function in `src/us/core/income/social-security.js` that every caller uses, so the card, the table, the solver and the
Sankey can never disagree. It takes the deceased and the death year as arguments rather than reading `survivorEnabled`:
`lambdaEstimate` applies a death implied by the life expectancies even with survivor modeling off (`solver.js:400-413`).
In the `pia` basis the factor clamps a start age below 62 to 62 (the box's minimum is not enforced,
`ss-start-age.js:6-8`), so the reduction never extrapolates.

## 6. What "best" means (owner, 2026-11-21: "Yes")

- **Ranking:** a choice whose plan never runs out beats one that does; among those, the higher after-tax end value
  (the registry's `endValue`, `afterTaxEndValueUS`, which counts the tax still owed on traditional balances; ranked with
  the cliff plan's $1 tolerance); among choices that run out, the later run-out year. Ties go to the current choice,
  then to the earlier claim ages.
- **Runs:** standard (deterministic) projections only, through `runSourceFor` so a market scenario is honored. The
  objective registry already ranks on those and only reports Monte Carlo and historical rates; claiming age changes
  guaranteed income, not market risk.
- **Guardrails off for the ranking** (my call, as the guidance job does, `guidance.js:251`): with guardrails on, an
  early claim can show up as changed spending rather than end value. The card's line says so.
- **The longevity row:** for a single person and a widow(er), the best choice if the plan ends at 80, 85, 90 and 95
  (only ages past the person's current age and up to 100), each the ranking of runs with the person's life expectancy set
  to that age. Reading the full-length run is not exact (`lambdaEstimate` reads the end year from the life expectancy,
  `solver.js:399`, and the estate is priced in the last year), so the row re-runs: at most 4 x 72 = 288 extra runs.
  Instead of a single break-even age (four end ages cannot give one), one sentence reads the row: "If you live to 85 or
  longer, <the 85 choice> wins; to 80, <the 80 choice>." For a couple, the row is left out (their bet is joint, and
  survivor modeling already covers the death); the card says so.

## 7. The search

### 7.1 Axes

- Single: own start age, max(62, current age) to 70: up to 9 choices.
- Widow(er): survivor start age, max(60, current age) to the survivor full retirement age rounded up (60-67 for anyone
  born 1962 or later), by own start age, max(62, current age) to 70: up to 8 x 9 = 72.
- Couple: Partner A's own start age by Partner B's, each max(62, own current age) to 70, each on that partner's own age
  and birth year: up to 81.

**Already collecting** (changed after review: an age rule alone misreads the default start age of 62 for anyone 62 or
older): an explicit per-benefit box, `ssCollectingA/B` ("I'm already collecting my own benefit", default false) and
`ssSurvivorCollecting`. A collecting benefit's axis is fixed at its start age, and in the `pia` basis its factor is the
start age's. A benefit not collecting whose start age is below the current age is read as "claims now": paid from the
current age at the current age's factor, and its axis starts at the current age. An axis with one value collapses the
grid to a row, or to the current choice alone, in which case the card says there is nothing to choose. Whole years:
year 0 is the full tax year, so "claims now" is paid for the whole current year even late in the year, and a claim at x
pays 12 months in the year of x although payment starts in the birthday month; the bias is nearly the same for every
choice, so the ranking barely moves (noted in the topic file).

The start-age maximum is 70 even with B1's "if the law changes" switch on (`ssLateStartEnabled`): delayed credits stop
at 70, so a later start only loses money. *My call; a later start age already set by the user is kept as the current
choice and shown.*

### 7.2 Variants and speed

Each choice is a shallow variant `{ ...base, ssStartAgeA, ssStartAgeB, ssSurvivorStartAge }` run through a `contextFor`
factory from the caller (the UI passes `stateContextFor()`). The stored plan (Plan search's) and the Roth schedule are
replayed as they are, never re-searched per choice; the card says "Re-run Plan search after applying".

**The automatic cliff plan** (found in review): `variantContext` (`store-context.js:29`) gives every variant the base
state's kept plan, whose intents are per-year lines, so a year with no stay-under in the base never gets one in a
variant; after Apply, `renderDeferred` → `refreshCliffPlan` searches a new plan for the new ages. The grid therefore leans
toward the current ages, most for a widow(er) on ACA coverage at 60-64. *Decided (owner, 2026-11-21: "Re-check top cells"):* every cell runs
with the kept plan (fast), then the best three cells and the current choice are re-measured with their own plan
(`ownPlanContextFor`, as the moves card measures a move: a bracket search each), and the headline and Apply use that
re-ranking. The card says the other cells use the current plan.

At about 1-13 ms a run, the grid takes well under a second (the longevity row adds up to 288 runs and the re-measure
four bracket searches). It runs **only while the card is open** (like the other analysis cards, `renderOpenCards`), in the
deferred render (`renderDeferred()` and `markDeferredStale()`), in timer slices like the guidance jobs, never while the
bracket search is pending (`searchPending()`, as `scheduleFieldImpacts` waits, `guidance.js:230-231`), holding under the
test global `__testHoldGuidance` the same way, with a `__test_flushClaimSearch()` hook. **Dedupe:** two choices whose yearly Social Security streams are identical (for example
a survivor start that is never the higher benefit) are run once and shown as "same as <choice>". The search module is an
engine module (`fn(ctx, contextFor, ...)`, no store imports, any memo registered in `tests/engine-purity.json`).

### 7.3 Cache key

The card's result is keyed on `storedPlanFingerprint` of the base state, the tax year, the stored plan and the
optimizer overrides (`rothBracketByAge`, `withdrawalMixByAge`, which are not in `state`), and the kept cliff plan, as
`cliffPlanStore` keys them (`planning.js:221`): `fingerprintJson` drops `storedPlan`, so the fingerprint alone would let
a plan Apply or a Roth optimizer write leave a stale grid that Apply accepts. A change of only a list row's name does not
rerun it.

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
If you live to 90 or longer, claim at 70; to 80, at 62.
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
  (widow(er)). One undo snapshot (`snapshotForUndo`), then `syncControls()` (`render()` does not sync the boxes; undo.js:51
  and move-preview.js:23 do), then `render()`, then the autosave. The card's Apply and the `ssSurvivorStartAge` clamp join
  the sanctioned writes listed in `CLAUDE.md` ("State and the sanctioned writes").
- Refused, with the plan card's stale wording, when the key of section 7.3 changed since the search drawn.
- Refused in market-scenario mode and during a move preview, as the guidance goal chips refuse (a write there is lost on
  Revert and not autosaved); the button shows why.
- A stored plan becomes stale (the start ages are in its fingerprint) and the plan card's existing stale line shows.
- **Fingerprint rule for every new key** (PR 1's `ssBenefitBasisA/B` and guided-entry keys, PR 2's widowed and
  collecting keys, PR 5's): `normalizeState` spreads `defaults` into every state (`normalize-state.js:14`), so each new key
  is left out of `fingerprintJson` while it is at its default, appended after the rest as B2's cut keys are; the widowed
  keys are also left out whenever `singlePerson` is false (the engine ignores them then). So no saved plan goes stale
  when a PR ships.

## 10. Proposed PR breakdown

Each PR gets its own plan, reviewed by an Opus subagent before implementation; each bumps the US version badge and
updates the README and the topic file (a new `docs/architecture/us-social-security.md`, created in PR 1).

1. **Basis and factors** (Batch 6 items 1-2; *built, US V192, plan `docs/superpowers/plans/2026-11-21-ss-claiming-pr1-basis-factors.md`*): `ssBenefitBasisA/B`, full retirement age by birth year, the own-benefit
   factors (clamped at 62), `ssCollectingA/B` and the "claims now" rule (7.1), the guided entry, the one-formula
   consolidation (5.5) with `atClaim` keeping today's operation order, the fingerprint rule for its keys (section 9),
   Vitest suites for the factors at 62, full retirement age and 70, legacy saves staying on `atClaim`, `field_registry`
   and `legacy_state` updates.
2. **Survivor rules** (5.2, 5.3; *built, US V194, plan `docs/superpowers/plans/2026-11-21-ss-claiming-pr2-survivor-rules.md`*): the widowed inputs and the couple rule with the marriage gate, their `FIELDS` entries,
   `normalizeState` guards (the `null` survivor start), `field-meta.js` (a group gated on `ssWidowed`),
   `guidance-fields.js` (`RETIRE_FIELDS` / `NO_FIGURE`), the fingerprint rule, the info bubbles, the solver and Sankey
   through the one formula, the earnings-test warning (`ssBeforeRetirementCase`) extended to the survivor start, Vitest
   cases (71.5% at 60, both orders, the widow's limit from two quotes at 60 and at a later age, the $2 tolerance and the
   disagreeing-quotes fallback, the start in the death year or at 60, delayed credits stopping at 70 for an unclaimed
   deceased, the unmarried couple), a `pia`-basis case in `survivor_symmetry.js`.
3. **The search** (section 7; *built, US V195, plan `docs/superpowers/plans/2026-11-21-ss-claiming-pr3-search.md`*): the `core/optimizer/` module, ranking, dedupe, the longevity row, the re-measure of the
   top cells, Vitest with hand-computed two-year cases where each order wins.
4. **The card and Apply** (sections 8-9; *built, US V196, plan `docs/superpowers/plans/2026-11-21-ss-claiming-pr4-card.md`*): single and widow(er) first; couples hidden until PR 5. A root Playwright
   script (`test_claiming_card.js`, held: `__test_flushRender()` then `__test_flushClaimSearch()`): the grid draws, Apply
   writes the ages, syncs the boxes and undoes, Apply refused in scenario mode, the mobile check; the flush added to any
   existing held script that opens the card; an intended `snapshot_ui` baseline update, said in the commit.
5. **Spousal benefit** (5.4, with deemed filing and the marriage gate), then couples shown on the card (*built, US V197, plan
   `docs/superpowers/plans/2026-11-21-ss-claiming-pr5-spousal-couples.md`*).

Order 1 → 2 → 3 → 4 → 5 gets the widowed user the card before the spousal work (owner, 2026-11-21: "Widowed first").

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
| Spouse's benefit (PR 5) | The worker entitled, the spouse 62, married at least 1 year; one-half of the PIA; reduced 25/36 of 1% a month for 36 months and 5/12 of 1% beyond (35% at 62 for an FRA of 67); no delayed credits from the worker; the full own benefit comes off the full spouse's benefit, the excess paid on top. | 20 CFR 404.330, 404.333, 404.410(b), 404.313(e)(2) (law.cornell.edu, read 2026-11-21); POMS RS 00615.201 (12/07/2023), RS 00615.020 (12/05/2023), read 2026-11-21 |
| Deemed filing (PR 5) | Born 1/2/1954 or later: filing for one of the retirement and spouse's benefits is filing for both, at any age and in any later month; not for survivor benefits. | POMS GN 00204.035 (11/16/2026), read 2026-11-21 |
| Taxation | Survivor benefits are Social Security benefits under 26 U.S.C. 86; base amounts unchanged ($25,000 / $32,000; $34,000 / $44,000). | 26 U.S.C. 86 (ce3b78a) |

## 13. Owner decisions

1. *Decided 2026-11-21:* the automatic cliff plan (section 7.2): the best three cells and the current choice are
   re-measured with their own plan (owner: "Re-check top cells").
2. *Decided 2026-11-21:* PR order 1 → 2 → 3 → 4 → 5, widowed (and single) users get the card before the spousal
   benefit (owner: "Widowed first").
3. *Decided 2026-11-21:* the widow's-limit input is the optional "SSA's quote at an earlier age" (section 5.2).
4. *Decided 2026-11-21:* the longevity row's end ages are 80, 85, 90 and 95, read by one sentence instead of a
   break-even age; couples get no version of it.
5. *Decided 2026-11-21:* the explicit "already collecting" boxes (section 7.1).

All five accepted by the owner on 2026-11-21 ("Accept all three" for 3-5). Nothing is open; next is one plan per PR.

## 15. Review (2026-11-21)

An independent Opus review read the first draft against the code. Folded in: the automatic cliff plan's lean (7.2), the
explicit "already collecting" boxes (7.1), the cache key's missing plan and overrides and the wait for the bracket search
(7.2, 7.3), the earlier quote at any age with a $2 rounding tolerance (5.2), the `null` survivor-start default (5.2),
the deceased's base and delayed credits stopping at 70 (5.3), the marriage gate (5.3, 5.4), deemed filing (5.4), the
corrected list of formula copies (5.5), the fingerprint rule for every new key and `syncControls()` on Apply (9), Apply
refused in scenario mode and move preview (9), guardrails off and the longevity row re-running instead of a break-even
age (6), the card searching only while open (7.2), and the PR gaps (10). The SS rules (survivor factor, widow's limit,
dual entitlement in both orders, the factor fractions) were confirmed.

## 14. Left to the builder

The card's exact place and styling; the shading scale; field ids and labels beyond those named here; the
`contextFor` plumbing; whether the longevity row reads the full run or re-runs (section 6, with the exactness test);
how the slices are sized.
