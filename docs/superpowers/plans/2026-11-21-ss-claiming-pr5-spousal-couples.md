# Social Security claiming-age optimizer, PR 5: the spousal benefit, then couples on the card (plan, 2026-11-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SSA's spousal benefit in the one formula (the excess of half the worker's PIA over the spouse's own, reduced for the
spouse's age when it starts, no delayed credits, deemed filing, a year of marriage), read by the year loop, the cliff plan and
the Sankey alike; then the "When to claim Social Security" card shown for couples: the A-by-B grid, one headline naming the best
pair, the best "same age for both" pair and the current ages with the dollar gaps, no longevity row (and a line saying why), and
Apply writing both start ages.

**Architecture:** One new pure function family in `src/us/core/income/social-security.js` (`ssSpousalFactor`,
`ssSpousalStart`, `spousalExcessYearly`), added inside `paidBenefitYearly` for a couple, which every living-year reader already
calls for Partner A; Partner B's three readers that call `ownBenefitYearly` directly (the year loop's stage, the cliff plan's
`benefitIncomeAt` and `lambdaEstimate`) switch to `paidBenefitYearly`. The survivor period is untouched (the spousal benefit ends
at the worker's death; the survivor benefit replaces it). The search gains a spousal-only axis and a `sameAge` pick; the card's
text gains the couple wording; the card drops its couple gate.

**Tech Stack:** plain ES modules under `src/`, esbuild, Vitest 5 (Node 22.12+), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md`: PR 5 is section 10 item 5, using sections 5.4,
8 (couples) and 9. Model plans: `2026-11-21-ss-claiming-pr1-basis-factors.md` through `-pr4-card.md` (PR 3's "The result" and
PR 4's decisions define what the card reads). US only.
**Base:** PR 4 (amacgrog/Fire-Planner#118) is open, so this branch (`claude/ss-claiming-pr5-a6afc2`) starts from
`origin/claude/ss-claiming-pr4-card` (`8d0a35b0`). It is rebased onto `main` once #118 merges, and the PR is opened against
`main` only after that. Badge: US V196 → the next free number at merge (V197 if nothing else lands first); Canada untouched.

## Global Constraints

- `npm test` stays exact to the cent for everything outside the new rule. No new input key, so no seed, fingerprint,
  `field_registry` or `legacy_state` change (spec 9's rule holds trivially: no saved plan goes stale). Figures move only for a
  couple with Partner X's amount at full retirement age (`pia`) and Partner Y's own amount under half of X's (in `pia`, or 0);
  the default (`atClaim` for both) and every golden case keep every bit: the new term is skipped, not added as a zero, unless
  the bases qualify (`CLAUDE.md`'s hot-path rule).
- Existing Vitest figures that move are the intended ones only; each is listed in Task 1 or 3 with its new hand figure. The
  identical-partner couples of `ss-survivor.test.js`, `ss-claim-basis.test.js`, `claim-search.test.js` and
  `survivor_symmetry.js` (2,000 or 2,500 each) have no excess and keep their figures. `claim-search.test.js:139`'s status moves
  from `'collecting'` to `'ok'` (a spouse with no own benefit now has a spousal axis; Decision 7).
- The one intended baseline move is `tests/snapshots/ui_us.json`: the default couple now shows the card (closed, its `'atClaim'`
  line), so the hidden-id lists lose the card's shown ids and the three text captures (couples) gain the card's summary; the
  commit says so. `ui_canada.json` must not move.
- Engine rules (`CLAUDE.md`): the new functions take `ctx` first, read only `ctx.inputs` / `ctx.taxYear`, allocate nothing,
  keep no module state; `tests/engine_purity.js` green. Every Social Security key is still named only in `social-security.js`
  (`ss-claim-basis.test.js`'s one-formula scan).
- UI rules as PR 4 (`claiming-card.js` keeps its module-level `let`s; `claim-text.js` stays DOM-free and imports only
  `shared/core/format/numbers.js` and the new `us/core/optimizer/claim-rank.js`, which imports nothing; Decision 12). Apply's new write (`ssStartAgeB`) joins the sanctioned-writes line in `CLAUDE.md`.
- Mobile (390 x 844): no sideways page scroll with the couple's 9 x 9 grid open; the grid scrolls inside its `.table-wrap`.
- The repo is public: invented round figures only, no personal details ("a real user").
- Vitest rules 1-7 of `CLAUDE.md` for every new or changed suite (through `world()`, exact comparisons, counted, shuffled, Node
  22 and 24 for the suites that compare engine output).

## Verified rules (read 2026-11-21; POMS and the CFR read directly, the CFR through law.cornell.edu since ecfr.gov redirected)

| Rule | Verified | Source |
|---|---|---|
| Entitlement | The worker must be entitled to old-age (or disability) benefits; the spouse 62 or older throughout a month (or caring for a child, not modeled); the marriage has lasted at least 1 year (exceptions: parents of a child together, or entitled to certain benefits in the month before the marriage; not modeled); the spouse applies; not entitled to an own benefit at or above the full spouse's benefit. | 20 CFR 404.330 (a)(1)-(3), (b)-(d) |
| Amount | One-half of the insured person's PIA. | 20 CFR 404.333; POMS RS 00615.201 B.1.a (12/07/2023) |
| Reduction | 25/36 of 1% for each of the first 36 months before full retirement age, 5/12 of 1% beyond; at 62 with an FRA of 67, 60 months (156/240 of the full rate: a 35% cut). | 20 CFR 404.410(b); POMS RS 00615.201 B.1.a-d, B.2 |
| No delayed credits | The worker's delayed credits do not raise other family members' benefits while the worker lives. | 20 CFR 404.313(e)(2) |
| Dual entitlement | The full own benefit is subtracted from the full spouse's benefit; the excess is reduced for age and paid on top of the (reduced) own benefit. | POMS RS 00615.020 (12/05/2023), method C and its example |
| Deemed filing | For a date of birth of 1/2/1954 or later, filing for one of the retirement and spouse's benefits is filing for both, reduced or unreduced, at any age, and in any later month: when the worker files later, the spouse's benefit starts then. Not for survivor benefits. | POMS GN 00204.035 (11/16/2026) A, B.1-B.4, example E.2 |

## Decisions this plan makes (the spec leaves them to the builder)

1. **When the spousal excess applies** (spec 5.4). Partner Y (the spouse) has an excess on Partner X's (the worker's) record
   in year y when all hold: a couple (`!singlePerson`); X's amount is entered at full retirement age (`ssBenefitBasisX ===
   'pia'`) and is above 0 (the PIA is known); Y's own PIA is known: Y in `pia`, **or Y's amount is 0** (no own benefit, in either
   basis: an own amount of 0 is a PIA of 0; question 1); the excess `0.5 * X - Y` (monthly, today's dollars) is above 0; and year
   y is at or after the spousal start (Decision 2). A Y in `atClaim` with an amount above 0 gets none (the amount is not a PIA),
   so every plan in today's default basis keeps every figure. Only one partner can have an excess (0.5 X > Y and 0.5 Y > X
   cannot both hold).
2. **The spousal start age x, in Y's ages** (deemed filing; GN 00204.035): the latest of Y's filing age `ssFactorAge(ctx, Y)`
   (the start, or the current age for "claims now", or the past start while collecting, all as PR 1), X's filing age moved to
   Y's ages `ageY + (ssFactorAge(ctx, X) - ageX)` (X's own payment year), 62, and the marriage gate's first age (Decision 3).
   The excess is paid in every living year from x (whole years, like every start) at `ssSpousalFactor(fraY, x)`; a past x
   (both collecting) is paid from year 0 at its past factor, as a collecting own benefit is. Deemed filing is applied to
   everyone: anyone born before 1954 is 73 or older in 2026, past 70, and has claimed both (the topic file names the old
   restricted application as not modeled).
3. **The marriage gate** (404.330(a)(1), spec 5.4): the excess is paid in year y only when `marriedAtYear(ctx, y - 1)` (PR 2's
   test: jointly filing, or past the wedding age of "start single, then marry"). So `mfj` pays from year 0 (the marriage is read
   as over a year old), `marryLater` from the year after the wedding year (spec: "none before the wedding age plus one"), and
   two single filers never. Its first age is `ageY + (marriageAgeA - ageA + 1)` under `marryLater`, `-Infinity` under `mfj`,
   `Infinity` for two single filers; x reads the reduction at that age, as SSA's entitlement begins in the first month every
   condition holds. The 404.330(a)(2)-(3) exceptions are not modeled.
4. **The factor** `ssSpousalFactor(fraMonths, x)`: `m = fraMonths - 12 * max(62, x)`; `m <= 0` gives 1 (no delayed credits);
   else `(3600 - 25 * min(m, 36) - 15 * max(0, m - 36)) / 3600`, counted in units of 1/3600 and divided once as PR 1's
   `ssClaimFactor` (62 with an FRA of 67: `2340 / 3600`, the double nearest 0.65). Y's FRA from Y's birth year
   (`ssFullRetirementAgeMonths(taxYear - ageY)`).
5. **The yearly figure and its operation order**, so hand figures match to the bit: `spousalExcessYearly(ctx, p, a, factor,
   paid)` returns `(0.5 * X - Y) * 12 * ssSpousalFactor(fraY, x) * factor * paid` in a paid year and `0` otherwise (Y read as 0
   when its amount is 0). `paidBenefitYearly(ctx, p, a, factor, paid)` for a couple returns `own + excess` when the excess
   applies at all (Decision 1's basis test, done first and cheaply) and exactly `own` otherwise. The cut (`ssPaidShare`) and the
   year's inflation factor apply as to every benefit. The hot path allocates nothing (review 2): `spousalStartAge(ctx, p)` returns
   the number x, or `Infinity` when Decision 1 fails, and `spousalExcessYearly` reads it; `ssSpousalStart(ctx, p)` wraps it as
   `{ x, monthly }` (the reduced monthly excess in today's dollars) or `null` for the check line (Decision 9) and the tests only.
6. **Where it is read.** Living years only: `socialSecurityIncome`'s non-survivor branch takes B's slot from
   `paidBenefitYearly(ctx, 'B', ...)` (today `ownBenefitYearly`); the cliff plan's `benefitIncomeAt` (`solver.js:370`) and
   `lambdaEstimate`'s two-person sample (`solver.js:475`) the same; A's slot already calls `paidBenefitYearly` everywhere. The
   Sankey calls `socialSecurityIncome`. In the survivor period nothing changes: `survivorBenefitYearly` pays the survivor the
   higher of their own benefit (`ownBenefitYearly`, no excess: the spouse's benefit needs a worker entitled to old-age
   benefits, 404.330, so it ends at the death and the survivor benefit replaces it) and the survivor benefit on the deceased's own record
   (the deceased's own PIA, never their spousal excess). `lambdaEstimate`'s walk (`benefitIncomeAt`) already uses the
   household's living benefits past a death (its comment); it keeps doing so, with the excess.
7. **The axes** (spec 7.1). `ownClaimAxis` becomes spousal-aware: an amount of 0 is fixed `'none'` only when Partner p has no
   possible excess (Decision 1's basis test, with the marriage read as possible under `mfj` or `marryLater`); a spouse with no own
   benefit but an excess gets an axis (it is when they file for the spousal benefit), checked for `'collecting'` and `'past'` as
   before and never fixed `'atClaim'` (the age changes the excess in either basis). Its ages run `max(62, age) .. 70`, as every
   own axis (the spec's 9 x 9 grid; starts after Y's full retirement age only lose, and a start at or before X's is deduped:
   question 4). `claimStatus` is unchanged in code: a spousal-only axis is not `'none'`, so a couple with A collecting and B
   with no own benefit now reads `'ok'` (B's filing age varies).
8. **The stream key** (`ssStreamKey`). For a couple each slot is written as `own|excess` (`ownBenefitYearly` and
   `spousalExcessYearly`, factor and paid 1) rather than their sum: the survivor years read the survivor's own benefit alone, so
   two choices with one sum and different own parts must not share a run. The widowed and single keys are unchanged. Every
   reader of a start age is still in this file and reads it through the payment test and the factor ages, so one key is one run
   (PR 3's argument, now with Decision 2's x, a function of the two factor ages).
9. **The check line** (`ss-basis-notes.js`). Under Y's basis choice, while `ssSpousalStart(ctx, Y)` is not null: "Plus $X a
   month as a spouse from <x> (half of Partner X's amount less your own, reduced for <x>)" ("from now" for a past x),
   appended to Y's own line, or alone when Y's own line is '' (an amount of 0); at or after Y's full retirement age it reads
   "(half of Partner X's amount less your own, unreduced)" (review 17). It reads the engine's function, so the sidebar and the
   projection never disagree. **The silent case** (review 13): with X in `pia` and Y in `atClaim` with an amount above 0, Y's
   note reads "Enter this amount at full retirement age too to include any spousal benefit on Partner X's record." (the planner
   cannot tell whether Y's amount is under half of X's, so the hint shows whenever the bases differ that way).
10. **The sidebar copy.** Each start-age info bubble gains one sentence: "With both amounts entered at full retirement age, a
    spouse whose own amount is under half the other's also gets the difference as a spousal benefit: from the later of the two
    start ages (and 62, after a year of marriage), lowered by 25/36 of 1% a month for up to 36 months early and 5/12 of 1% beyond
    (65% at 62 for anyone born 1960 or later), with no delayed credits. A spouse with no own benefit enters 0." No new field.
11. **The couple's choice names** (`claim-text.js`). "Partner A at 70, Partner B at 62"; "both at 67" when equal; one axis fixed:
    "Partner A at 70" / "Partner B at 62". Short (grid "same as", the end of a cell's twin text): "70 / 62" (A / B). The tooltip
    and Apply name: "A at 70, B at 62" ("Apply: A at 70, B at 62"; it wraps at 390 px). The three places that lower-case
    `choiceWho` today (`claimApplyLabel`, `claimCellTitle`'s twin tail at `claim-text.js:118`, `claimCurrentLine` at `:127`) keep
    the capitals for a couple ("same as A at 67, B at 62"; review 3).
12. **The same-age pick** (spec 8: "the best 'same age for both' pair"), one implementation (review 7): the ranking
    (`claimBetter`, `claimPick`) moves to a new DOM-free module `src/us/core/optimizer/claim-rank.js`, re-exported from
    `claim-search.js` (its callers and tests are unchanged) and imported by `claim-text.js` (its import rule widens from
    `numbers.js` alone to `numbers.js` and `claim-rank.js`, which imports nothing). `claimSameAge(r)` in `claim-text.js` returns
    `{ cell, canon, measure } | null`: among the diagonal cells (`a === b`, both axes varied), in the earlier-ages order with the
    current choice's cell first when it is on the diagonal, each measured by `claimShownMeasure` (so the headline and the grid
    show one figure), the `claimPick` winner; `cell` is the diagonal cell (so it is named "both at 67"), `canon` its canonical
    cell (`sameAs ?? cell`, compared with the best's canonical cell; review 5). `null` for a single or widowed person and for a
    couple with a fixed axis (both varied axes end at 70, so a diagonal always exists; review 15). Not in the search result.
13. **The couple's headline** (spec 8: one line), the PR 4 branches for the best and the current choice, then one more sentence:
    - `sameAge === null`: nothing more; `sameAge.canon` the best's canonical cell: "It is also the best age for both of you to
      share." only when the best cell is itself on the diagonal, else nothing more;
    - with g = best − same on `today`: both never run out and g > $1: "Same age for both: best at 67, $Y less than the best."
      (`money(g)`); both never run out and g ≤ $1, **negative included** (the best is picked among the re-measured top four, while
      a diagonal cell can show its kept-plan figure; review 6): "Same age for both: best at 67, about the same as the best.";
    - the same-age runs out and the best does not: "Same age for both: best at 67, which runs out at 88.";
    - the same-age never runs out and the best does (possible only through review 6's mix): "Same age for both: best at 67,
      which lasts the whole plan on the current cliff plan.";
    - both run out: "Same age for both: best at 67, running out at 86 instead of 88."
    The current choice is named in the first sentence (PR 4's "than your current choice (both at 62)").
14. **The grid for a couple:** rows Partner A's start, columns Partner B's (spec 8), the corner "A ↓<br>B →". A fixed axis gives
    **one row** of the varied partner's ages under an "A at" / "B at" header, as a single person's grid (review 4). The search's
    cells are already row-major A by B; `gridHtml` reads the row and column keys from the kind and the fixed axes (`a`/`b` for a
    couple with both varied; `null`/the varied key for one; `survivor`/`a` otherwise). Cells, shading, the current outline, the
    best marker, the re-checked dot, "same as" and the tooltip are PR 4's.
15. **The lines** for a couple: "Uses standard projections with guardrails off and your current plan settings; depends on life
    expectancy (A: 90, B: 88)."; then "No end-age row for a couple: survivor modeling covers the first death." (spec 6 and 8: "the
    card says so"; with survivor modeling off: "No end-age row for a couple: turn on survivor modeling to see a death mid-plan.");
    then PR 4's re-check line, for a couple without "and the end-age row" ("the other cells use the current plan"; review 16),
    and the Plan search line. A fixed axis: "Only Partner A's start is searched: Partner B's benefit is entered as
    paid at its start age; enter it at full retirement age to compare both" (and the `'collecting'`, `'past'`, `'none'` reasons in
    the same pattern, `claimFixedLine`).
16. **Shown or hidden:** `claimingCardVisibility` drops `kind === 'couple'`. So the default plan (a couple, both `atClaim`) shows
    the card, closed, with PR 4's `'atClaim'` line when opened (question 2). "Go to the field" reveals the first partner whose
    axis is fixed `'atClaim'` (`ssBenefitBasisA`, else `ssBenefitBasisB`); for a couple the status line names the partners whose
    axis is `'atClaim'` (review 20): "Enter Partner A's and Partner B's benefits at full retirement age (set “amount entered
    is” to “At full retirement age”) to compare claiming ages." or the same with one partner.
17. **Apply** (spec 9): as PR 4, plus `state.ssStartAgeB = cell.b` when the best cell's `b` is not null; the `kind === 'couple'`
    refusal goes. Undo restores both boxes (one snapshot). The hooks' view (`__test_claimingCard().result`) gains each cell's `b`
    and `sameAge`.
18. **A stored plan** applied before PR 5 with both partners in `pia` keeps its fingerprint (no key changed) while its figures now
    include the excess, as with any engine rule change; the card and the plan card show the new figures. Not flagged stale:
    spec 9's rule is about new keys, and none is added. The PR body says so (review 21).
19. **The one-reader rule** (review 11): after the switch no module outside `social-security.js` calls `ownBenefitYearly`; a scan
    in `ss-spousal.test.js` keeps it so (a future living-year reader through it would silently miss the excess), the unused
    import at `solver.js:11` goes, and `CLAUDE.md` / the topic file say "a living partner's benefit is read through
    `paidBenefitYearly`".

## Review Focus

1. **The formula** (Decisions 1-5): the excess, its reduction and its operation order; deemed filing in both orders and with
   different current ages; the marriage gate under `mfj`, `marryLater` and two single filers; collecting and "claims now"; no
   excess in the survivor period; the benefit cut.
2. **Nothing moves outside the rule:** the skip in `paidBenefitYearly` for every non-qualifying plan, B's three readers, the
   golden cases, the identical-partner suites.
3. **The dedupe** (Decision 8): a key covers the excess, and an own-plus-excess split.
4. **The same-age pick** (Decision 12) agrees with the shown measures; the couple's headline branches (Decision 13).
5. **Apply** writes A and B, one undo; mobile at 390 x 844 with the 9 x 9 grid.

---

### Task 1: The spousal benefit in the one formula, with Vitest

**Files:**
- Modify: `src/us/core/income/social-security.js` (`ssSpousalFactor`, `ssSpousalStart`, `spousalExcessYearly`;
  `paidBenefitYearly` adds the excess for a couple; `socialSecurityIncome` B's slot; `ssStreamKey` (Decision 8); line 1's
  purpose gains "spousal")
- Modify: `src/us/core/cliff-plan/solver.js` (`:370` and `:475`: B through `paidBenefitYearly`; the comment at `:358` names the
  excess)
- Test: `tests/unit/us/ss-spousal.test.js` (new, counted); `tests/survivor_symmetry.js` (a `pia` case with unequal partners:
  A 3,000 and B 1,000 with A dying at 75 must equal the mirrored household, B 3,000 and A 1,000, with B dying at 75)

Fixture `SPOUSAL` (invented): a couple, both 62 in 2026 (born 1964, FRA 67), `mfj`, A 3,000 and B 1,000 a month in `pia`,
both life expectancies 90, survivor modeling off, ZERO_TAX-like balances (claim-search.test.js's couple pattern). Hand figures in units of 1/3600 (own:
62 2520, 64 2880, 67 3600, 70 4464; spousal: 62 2340, 63 2520, 64 2700, 65 3000, 66 3300, 67+ 3600); the excess is 1,500 − 1,000 =
500 a month.

- [ ] **Step 1: Write the failing tests:**
  - `ssSpousalFactor(804, x)`: 62 `2340 / 3600`, 63 `2520 / 3600`, 64 `2700 / 3600`, 65 `3000 / 3600`, 66 `3300 / 3600`, 67, 68,
    70 all 1; 60 reads 62; an FRA of 66 (792) at 62: `(3600 − 900 − 180) / 3600`.
  - The excess at 62 and at full retirement age: A 62, B 62: B's yearly at 62 is `1000 * 12 * (2520 / 3600) + 500 * 12 *
    (2340 / 3600)` through `paidBenefitYearly`, and the row's `ss` is `3000 * 12 * (2520 / 3600) + (1000 * 12 * (2520 / 3600) +
    500 * 12 * (2340 / 3600))`, the engine's own order (`ss = ssA + ssB`, `ssB = own + excess`; never a subtraction; review 9);
    A 67, B 67: B's from 67 `1000 * 12 + 500 * 12 * 1`, nothing before 67.
  - Deemed filing, spouse first: B 62, A 67: B's at 62-66 is the own part alone; from 67 own + `500 * 12 * 1` (x = 67, no
    reduction). Worker first: A 62, B 64: nothing for B before 64; from 64 `1000 * 12 * (2880 / 3600) + 500 * 12 * (2700 / 3600)`.
    Different ages: A 64 and B 62 today, A starting at 66 (year 2): B's excess from B's 64 at `2700 / 3600`.
  - No delayed credits: B 70, A 62: `1000 * 12 * (4464 / 3600) + 500 * 12 * 1` from 70.
  - The marriage gate: `marryLater`, `marriageAgeA` 64 (A 62, both start 62): nothing until year 3, then B's excess at B's 65,
    `500 * 12 * (3000 / 3600)`; two single filers (`filingStatus: 'single'`, no `marryLater`): never; `mfj`: from year 0.
  - Whose PIA is known: B 0 (in `atClaim`) with A 3,000 `pia`: B's excess `1500 * 12 * (2340 / 3600)` from B's start 62; B 1,000
    in `atClaim`: none; A in `atClaim`: none; B 1,500 (exactly half): none; A as the spouse (A 1,000, B 3,000): A's excess, the
    same figures.
  - Collecting: B 65 collecting since 63, A 66 collecting since 64 (B was 63 then): paid from year 0 at `2520 / 3600`.
    "Claims now": both 64, both starts 62, not collecting: from year 0 at `2700 / 3600`.
  - `ssSpousalStart`: `{ x: 67, monthly: 500 }` for A 67 / B 62; `null` when Decision 1 fails.
  - The survivor period (survivor modeling on, A dying at 75): B's slot from 75 equals `survivorBenefitYearly(...)` (no excess),
    and the row before has the excess.
  - The cut and inflation: `ssBenefitCutPct` 22 from 2030 and inflation 3%: B's excess in a cut year is `500 * 12 * (2340 /
    3600) * f * 0.78` with `f` the run's factor (read from the row's `cumFactor`), compared as one run's two parts.
  - The solver agrees: `benefitIncomeAt(ctx, y, false, 1, null)` equals `paidBenefitYearly(A) + paidBenefitYearly(B)` plus the
    pensions (none) for every y; nothing else in `core/` names the new functions' keys (the one-formula scan).
  - Nothing moves outside the rule: the default state's rows and the identical-partner `pia` couple's rows equal a run with
    `spousalExcessYearly` read as 0 (`toStrictEqual` against the same run with B's basis `atClaim` would differ, so the check is
    `paidBenefitYearly === ownBenefitYearly` for those inputs in every year).
  - The stream key: A 67, B 62 vs A 67, B 64 differ (the own parts differ); a spouse with no own benefit and A at 67: B's starts
    62-67 share one key; an own-plus-excess split check (two hand-built contexts whose sums agree in one year but whose own parts
    differ give different keys).
  - Edges (review 18): A starting at 73 under the late-start switch (x = 73, factor 1); `marryLater` with `marriageAgeA` equal
    to `ageA` (paid from year 1) and below it (from year 0); a spouse with no own benefit and the collecting box ticked (start
    at or below the age: paid from year 0 at the factor of the later of that start and A's); the exactly-half case
    (`ss-survivor.test.js:327`'s A 1,000 / B 2,000 keeps its figure because the excess must be above 0: a comment there says so).
  - The one-reader scan (Decision 19): `ownBenefitYearly` named in no `src/us/core/` module but `social-security.js`.
- [ ] **Step 2:** `npx vitest run tests/unit/us/ss-spousal.test.js`: FAIL. **Step 3:** Implement (Decisions 1-6, 8, 19);
  `npm run analyze` (three new exports: the module-map check fails without it; review 10).
- [ ] **Step 4:** PASS alone and shuffled, on Node 22 and 24; `npm run test:unit` (the identical-partner suites unchanged);
  `node tests/engine_purity.js`; `node tests/survivor_symmetry.js` after `npm run build`.
- [ ] **Step 5: Commit** ("SS PR 5: the spousal benefit in the one formula (deemed filing, the marriage gate)").

### Task 2: The sidebar: the check line and the bubbles

**Files:**
- Modify: `src/us/ui/inputs/ss-basis-notes.js` (Decision 9), `src/us/index.html` (Decision 10: both start-age bubbles)
- Modify: `test_ss_basis.js` (a couple, A 3,000 `pia` start 67, B 1,000 `pia` start 62: `#ssBasisNoteB` ends "Plus $500 a month
  as a spouse from 67 (half of Partner A's amount less your own, unreduced)."; B starting at 64 with A at 62: "... from 64 (half
  of Partner A's amount less your own, reduced for 64)."; B 0: the line alone; A in `atClaim`: no spousal part; A in `pia` and B
  1,000 in `atClaim`: the "Enter this amount at full retirement age too ..." hint)
- [ ] **Step 1:** Implement; `npm run build`; `node test_ss_basis.js`: PASS. **Step 2: Commit** ("SS PR 5: the spousal check line
  and the start-age bubbles").

### Task 3: The search for couples (`sameAge`, the spousal-only axis), with Vitest

**Files:**
- Modify: `src/us/core/income/social-security.js` (`ownClaimAxis`, Decision 7), `src/us/core/optimizer/claim-search.js`
  (`claimBetter` / `claimPick` moved out and re-exported, Decision 12)
- Create: `src/us/core/optimizer/claim-rank.js` (purpose: "The claiming search's ranking (SS claiming optimizer PR 5): a strict
  win and the winner of a list, shared by the search and the card's text"); `npm run analyze`
- Modify: `tests/unit/us/claim-search.test.js` (the moved status at `:139`; new cases; `NEW_COUNT`)

Couple fixtures (ZERO_TAX-style, both 62 born 1964, `mfj`, cliff plan off, cash at 0%, inflation 0; yearly Social Security at most
42,912 for the couple (A 29,760, B 5,952 own and 7,200 excess) and 29,760 alone, so provisional income stays under $32,000 joint and
$25,000 single and no tax is due; **both life expectancies stated**: the projection runs to the later one even after a death
(`run-projection.js:349-350`), so the survivor A is paid to B's life expectancy too (review 1); each
case first checks every distinct run pays the same tax and healthcare, as PR 3's do). Sums count one row a year; the own factor in
units of 1/3600 times the years paid, the spousal factor likewise:

- **`LOW_EARLY`** (the lower earner claims early, the higher waits): A 2,000, B 400 (excess 600), survivor modeling on with B
  dying at 75 (`survivorPartner: 'B'`, `survivorDeathAge: 75`), both life expectancies 90. A's own: units x years (91 − k) peak at 70
  (93,744); B's own: units x (75 − k) peak at 62 (32,760, falling every year after); the excess starts at max(kA, kB) and with A at
  70 is 600 x 12 x 5 = 36,000 whatever B's start (at most 70). A's total with B at 62 (own + excess, dollars): 62 548,040; 65
  600,800; 67 633,600; 69 655,680; 70 660,960. **Winner A 70, B 62.** The winner alone does not need the excess (without it the
  answer is the same), so the case also asserts the gaps that do (review 8): the household total of (70, 62) is 704,640 and of
  the current (62, 62) 591,720, so `best.gain` is 112,920; the diagonal (k, k) totals are 591,720; 607,680; 620,040; 642,400;
  659,720; 672,000; 682,848; 689,088; 690,720, so the same-age pick is (70, 70), 13,920 less than the best.
- **`SPOUSAL_MOVES_IT`** (the excess changes the higher earner's answer): A 2,000, both life expectancies 85 (with B's at 90, A
  is paid to 90 and A 70 wins again; review 1), B with no own benefit
  (0, `atClaim`), B dying at 75. A's own `(20/3)` x units x (86 − k): 66 448,000; 67 456,000; 68 466,560; 69 473,280; 70 476,160.
  The excess (1,000 a month) from x = max(kA, kB): `(10/3)` x spousal units x (75 − x): 66 99,000; 67 96,000; 68 84,000; 69
  72,000; 70 60,000. Totals: 66 547,000; 67 552,000; 68 550,560; 69 545,280; 70 536,160. **Winner A 67, B 62** (every B start up to
  67 shares A 67's stream, so the earliest names it). The same household as two single filers (no excess): **A 70**.

- [ ] **Step 1: Write the failing tests:** the axes (a spouse with no own benefit and an excess: 62-70, not `'none'`; no excess
  (A in `atClaim`, or two single filers): `'none'`; collecting and past as before; never `'atClaim'` at an amount of 0); the moved
  status (`{ ...COUPLE, ssCollectingA: true, ssMonthlyB: 0 }` → `'ok'`; with A in `atClaim` too → `'collecting'`); `LOW_EARLY` and
  `SPOUSAL_MOVES_IT` with their hand winners, `LOW_EARLY`'s gain (112,920 in `best.gain`, exact: zero tax, inflation 0) and the
  two-single-filers flip; the dedupe of a spousal-only spouse ("same as" the earliest B start at or below A's); `claimBetter` /
  `claimPick` still reachable from `claim-search.js` (the existing ranking cases unchanged).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS alone and shuffled, Node 22 and 24; `npm run analyze` (the
  export list is unchanged; run it anyway for the purpose line).
- [ ] **Step 5: Commit** ("SS PR 5: couples in the search: the spousal-only axis and the same-age pick").

### Task 4: The card's couple text (`claim-text.js`) with Vitest

**Files:**
- Modify: `src/us/core/format/claim-text.js` (imports `claim-rank.js`; `claimChoice` adds `b`; `claimChoiceText`, `choiceWho`,
  `claimApplyLabel`, `claimCellTitle`, `claimCurrentLine` (the capitals, Decision 11), `claimCellLabel`'s short form,
  `claimSameAge` (Decision 12), `claimHeadline` (Decision 13), `claimFixedLine` (Decision 15), `claimLines` (takes
  `{ lifeExpectancy, lifeExpectancyB, survivorEnabled, storedPlan }`), `claimStatusLine(status, kind)` (Decision 16))
- Modify: `tests/unit/us/claim-text.test.js` (hand-built couple results; `NEW_COUNT`)
- [ ] **Step 1: Write the failing tests:** names (70 / 62, both 67, one axis fixed each way, short "70 / 62", Apply "Apply: A at 70, B at 62": `claimApplyLabel` lower-cases
  `choiceWho` today, so for a couple it keeps the capitals); the headline's four PR 4 branches with a couple name, each with the four same-age tails (Decision 13: none, also best,
  "$Y less", runs out, lasts, both run out, "about the same" at g of 0.4 and of −500); `claimSameAge` (the diagonal winner, a
  diagonal cell that is a twin named "both at 67" with its `canon`, `null` for a fixed axis and a single person, its measure
  equal to `claimShownMeasure` for a re-measured diagonal cell); the cell's "same as 62 / 64" and the tooltips' "same as A at
  67, B at 62"; the fixed lines for each reason and partner; the lines with and without survivor modeling; the couple's status
  line naming one or both partners. One case built by `claimSearch` on `LOW_EARLY` checks the functions accept a real couple
  result and its same-age pick is (70, 70), 13,920 less (the headline's "$13,920 less than the best").
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS alone and shuffled. **Step 5: Commit** ("SS PR 5: the claiming
  card's couple text").

### Task 5: The card shows couples; Apply writes both; the Playwright script

**Files:**
- Modify: `src/us/ui/results/claiming-card.js` (Decisions 14, 16, 17: visibility, `gridHtml`'s keys, the go-to-field target, the
  lines' arguments, Apply's B write and the couple refusal removed, the view's `b` and `sameAge`); `src/us/index.html` (nothing
  new in the markup; the intro sentence names couples: "For a couple: every pair of start ages."); `src/shared/styles/styles.css`
  only if the 9 x 9 grid needs it at 390 px
- Modify: `test_claiming_card.js` (header comment; the couple checks below; the PR 4 "hidden for a couple" checks replaced)
- Modify: `tests/snapshot_ui.js` only if the flush is not reached for the default couple (it is a status line, no job: expected
  no change)

`COUPLE` fixture for the script: `LOW_EARLY` of Task 3 (deterministic, cliff plan off), current choice both at 62.

- [ ] **Step 1: Write the checks:**
  - The default plan (a couple, both `atClaim`): the card shows (closed); opened, the couple's status line and "Go to the field"
    show with no flush; the button reveals `#ssBenefitBasisA`; with A switched to `pia`, the card searches A's axis alone (one row
    under "A at", Decision 14) and "Go to the field" is gone (B's `atClaim` fixed line shows instead).
  - `COUPLE` opened and flushed: a 9 x 9 grid (rows A 62-70, columns B 62-70), the current cell (62, 62) outlined, the best (70, 62)
    marked, the headline names "Partner A at 70, Partner B at 62" and has the same-age sentence, every title "today's dollars",
    no longevity row and the "No end-age row for a couple" line.
  - Apply: `state.ssStartAgeA` 70 and `state.ssStartAgeB` 62, `#ssStartAgeA` / `#ssStartAgeB` read 70 / 62; after the flush
    the headline says the current choice is best and Apply is hidden; Undo: both back (62, 62).
  - A spouse with no own benefit (`SPOUSAL_MOVES_IT`): "same as" cells in the B columns up to A's start; the headline names A 67.
  - Mobile: a 390 x 844 page with `COUPLE` open and flushed: no sideways page scroll; no page errors.
- [ ] **Step 2:** Implement the card changes; `npm run build`; `node test_claiming_card.js` (alone, then through
  `node tests/ui_scripts.js test_claiming_card.js`, held): PASS.
- [ ] **Step 3:** The held-script sweep: scripts that read the default page's result cards or every `details` (grep for
  `result-card`, `details`, `claimingCard`); the default couple now shows a closed card with no job, so none should need a flush;
  `npm run test:ui` in the background: green.
- [ ] **Step 4: Commit** ("SS PR 5: the claiming card for couples, Apply writes both ages").

### Task 6: Docs, badge, baselines, verify, PR

**Files:**
- Modify: `docs/architecture/us-social-security.md` (a "The spousal benefit (PR 5)" section: Decisions 1-6 and 8, the verified
  rules; the one-formula list gains the three functions; "The card" section: couples shown, the grid, the same-age pick, Apply
  writes B; "Not modeled": the spousal line replaced by: the child-in-care spouse, the 404.330(a)(2)-(3) marriage exceptions,
  the old restricted application for births before 1954, the family maximum, the earnings test on the excess (and the warning
  `ssBeforeRetirementCase` never fires for a spouse with no own benefit who has wages; review 19); the related list gains this
  plan; the one-reader rule, Decision 19)
- Modify: the print report's Social Security line, if it describes the benefit, to say a spouse's amount includes any spousal
  benefit (review 19; a grep for its text decides)
- Modify: `docs/architecture/engine.md` / `cliff-plan.md` (one line each where they list the Social Security readers, if they do)
- Modify: `CLAUDE.md` (the sanctioned writes: "the claiming card's Apply writes `ssStartAgeA`, `ssStartAgeB` and
  `ssSurvivorStartAge`"; the invariant that names `ownBenefitYearly` as a reader reads `paidBenefitYearly`, Decision 19);
  `docs/architecture/module-system.md` (the `format/` line: `claim-text.js` imports `claim-rank.js`); `docs/architecture/test-inventory.md` (the new suite, the extended scripts)
- Modify: `README.md` (the Social Security lines: the spousal benefit, and the card's "couples come with the spousal benefit"
  replaced by the couple grid)
- Modify: `docs/next-batches-plan.md` (Batch 6 item 3 marked built; "### Batch 6 notes": "Claiming-age optimizer PR 5 (US V197)":
  the verified-rules table above with its dates, the decisions, the moved test figures, the baseline update, the timings)
- Modify: the spec (section 10 item 5: built, the badge, this plan's path; section 12 gains the spousal rows)
- Modify: `src/us/index.html` (badge V196 → the next free number)
- [ ] **Step 1:** Docs; `node tests/doc_paths.js`.
- [ ] **Step 2:** `npm test` (background): green except `snapshot_ui`'s intended US move; read the diff and accept only these
  (review 12): `claimingCard` and its shown children leave the hidden-id lists, so every US wiring entry's `domHash` changes;
  `hiddenNowVisible` / `hiddenNowHidden` move for the `singlePerson`, `ssBenefitBasisA/B` and `ssMonthlyA/B` toggles; the three
  couple text captures (`snapshot_ui.js:259` opens every `details`) gain the card's summary, its intro, the couple's status line
  and "Go to the field →"; Canada unchanged. Then `npm run snapshot:update`; `npm test` again: green. The commit says the
  baseline update is intended and lists them.
- [ ] **Step 3:** `npm run test:ui` (background): green.
- [ ] **Step 4:** An Opus review of the branch (model opus); fold in; rebase onto `main` once #118 has merged; push; open the PR
  against `main`.

## Not in this PR

The child-in-care spouse's benefit and the 404.330(a)(2)-(3) marriage exceptions; divorced-spouse benefits; the family maximum;
the earnings test on the excess; restricted application for births before 1954; a longevity row for couples (spec 6); searching a
couple's survivor start (spec 2); an MCP tool for the card; Canada.

## Revisions after the Opus review (2026-11-21; folded into the decisions and tasks above)

The review confirmed the SSA rules as modeled (the excess and its strict `>`, the 1/3600 units, no delayed credits, the
deemed-filing start, the marriage gate through `marriedAtYear(ctx, y - 1)`, a worker past 70 under the late-start switch, a worker
dying before filing, collecting, "claims now", the single and widowed paths skipped), that the three B readers are every
living-year reader (IRMAA, the ACA, the tax code, year-stages and the cash-flow parts read `ssA` / `ssB` or `row.ss` downstream),
that the skip path is bit-exact, that the death year is survivor period (B dying at 75 lives 62-74), and every hand figure. Folded in:

1. *(must-fix)* Both life expectancies stated in the couple fixtures: the projection runs to the later one after a death, and with
   B's at 90 `SPOUSAL_MOVES_IT` loses its flip.
2. *(must-fix)* No allocation on the hot path: `spousalStartAge` returns a number; `ssSpousalStart`'s object is for the sidebar and
   tests only.
3. The capitals kept in all three lower-casing sites of `choiceWho`.
4. One orientation for a fixed couple axis: one row.
5. The same-age pick keeps the diagonal cell for its name and its canonical cell for the comparison.
6. A negative or tiny same-age gap reads "about the same as the best"; the "lasts" case defined.
7. One shown-measure implementation: `claimSameAge` in `claim-text.js`, the ranking in a shared `claim-rank.js`.
8. `LOW_EARLY` asserts the gains the excess sets (112,920; 13,920), since its winner alone does not depend on it.
9. Row figures compared in the engine's own order, never by subtraction.
10. `npm run analyze` in Task 1.
11. The one-reader rule and its scan; the unused solver import; `CLAUDE.md`'s reader line.
12. The snapshot diff listed in full.
13. A hint for the silent case (X in `pia`, Y in `atClaim` above 0).
14-21. The zero-tax ceiling corrected (42,912); the impossible "no common age" branch dropped; the re-check line without "end-age
   row" for couples; "unreduced" at full retirement age; the edge tests; the earnings-test and print-report notes; the couple's
   status line names the partners; the PR body names Decision 18.

## Questions for the owner

1. **A spouse with no own benefit** (Decision 1): an amount of 0 counts as an own PIA of 0 in either basis, so that spouse gets
   half the other's amount (reduced for their age) once the other's amount is entered at full retirement age. *Recommended:* yes.
   The alternative (only when both are switched to "At full retirement age") leaves a spouse who never worked at $0 unless they
   switch a box that does nothing for an amount of 0.
2. **The default plan shows the card** (Decision 16): the default couple (both amounts "at the start age") now sees the closed
   card, and opened it asks for the amounts at full retirement age, as a single person's does since PR 4. *Recommended:* show it.
   The alternative hides a couple's card until a basis is switched, which hides the feature from most couples.
3. **No switch for the spousal benefit** (Decision 1): SSA pays it automatically under deemed filing, so there is no input.
   *Recommended:* no switch.
4. **The spousal-only spouse's ages run to 70** (Decision 7), keeping the 9 x 9 grid; ages past their full retirement age only
   lose money and show as such. *Recommended:* 70. The alternative stops that axis at the full retirement age (62-67).
