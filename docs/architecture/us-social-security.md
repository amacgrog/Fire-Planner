# US Social Security

Read before touching `src/us/core/income/social-security.js`, any reader of a Social Security amount (the year loop, the cliff
plan's estimates, the Sankey), or the Social Security inputs.

Related: [engine.md](engine.md), [cliff-plan.md](cliff-plan.md), [inputs-and-ui.md](inputs-and-ui.md),
[us-federal-tax.md](us-federal-tax.md) (Pub. 915), [us-health.md](us-health.md) (the MAGI the ACA and IRMAA read),
[test-inventory.md](test-inventory.md), `docs/superpowers/specs/2026-11-21-ss-claiming-optimizer-design.md` (the claiming-age
optimizer: PR 1, the basis and factors, PR 2, the survivor rules, PR 3, the search, PR 4, the card, and PR 5, the spousal
benefit and couples on the card, are built),
`docs/superpowers/plans/2026-11-21-ss-claiming-pr1-basis-factors.md`, `docs/superpowers/plans/2026-11-21-ss-claiming-pr2-survivor-rules.md`,
`docs/superpowers/plans/2026-11-21-ss-claiming-pr3-search.md`, `docs/superpowers/plans/2026-11-21-ss-claiming-pr4-card.md`,
`docs/superpowers/plans/2026-11-21-ss-claiming-pr5-spousal-couples.md`.

## The inputs

Per partner: `ssMonthlyX` (a money field), `ssStartAgeX` (62-70; 75 under `ssLateStartEnabled`, feedback B1, which only moves
the box's limit; the minimum of 62 is not enforced, `ss-start-age.js`), `ssBenefitBasisX` and `ssCollectingX` (SS PR 1, US V192).
Household: the benefit cut `ssBenefitCutPct` / `ssBenefitCutStartYear` (feedback B2, `ssPaidShare`).

- `ssBenefitBasisX`: `'atClaim'` (the default and every save from before it): the amount is paid as entered from the start age,
  which is everything before PR 1; or `'pia'`: the amount is the benefit at full retirement age (the PIA, today's dollars), and
  the planner applies the claim-age factor. A FIELDS choice (a `<select>`), so `normalizeState` falls an unknown value back to
  `'atClaim'`.
- `ssCollectingX` ("already collecting", default false; true only when `=== true` on load): the start age is when the benefit
  started. Shown in both bases (owner, 2026-11-21): in `'atClaim'` it changes no figure today; the claiming card (PRs 3-4) reads
  it to fix that benefit's axis or hide the card.

A widowed single person (SS PR 2, US V194; read only when `singlePerson && ssWidowed === true`, otherwise ignored):
`ssWidowed` (the switch, `#ssWidowedField`, shown only in single-person mode; its group `#ssWidowedFields` only while on),
`ssSurvivorMonthlyFra` (F, the survivor benefit at the survivor full retirement age as SSA quotes it, a money field),
`ssSurvivorQuoteMonthly` / `ssSurvivorQuoteAge` (Q at age a, SSA's optional earlier quote, default 0 and 60; the engine clamps
the age to 60 through the survivor FRA rounded up), `ssSurvivorStartAge` (`null`, the default, is "at the survivor full
retirement age", resolved in the engine to that age rounded up to a whole year, since the survivor FRA depends on the tax year
and `normalizeState` must stay year-free; otherwise 60-70), `ssSurvivorCollecting` (as `ssCollectingX`). The start age is a
`<select>` wired by hand (`src/us/ui/inputs/ss-survivor-inputs.js`, a FIELDS choice with `manual: true`, `values` `[null,
60..70]`): the shared choice listener would write `Number('') = 0` for the null option. It is not offered over MCP (its schema
would be a string enum); the other five are. An earlier quote is only needed when the late spouse had started a reduced
benefit before their own full retirement age (the widow's limit). The owner's choice (2026-11-21): F always means the amount at
full retirement age, also while collecting; the check line then reads "This pays $X a month now: compare it with your check".

## The one formula

Every Social Security amount is read through `social-security.js`; no other module under `src/us/core/` outside `core/inputs/`
names `ssMonthly` (`tests/unit/us/ss-claim-basis.test.js` scans for it):

- `ssFullRetirementAgeMonths(birthYear)`: SSA's table (POMS RS 00615.003): 65 to 1937, +2 months a year to 66 for 1943-1954,
  +2 months a year to 67 for 1960 and later. The birth year is `ctx.taxYear - inputs.ageX`: the plan stores ages, not birth
  years, so a tax-year change can move a person across a row. The earnings-test warning (`ssBeforeRetirementCase`) reads it
  too; the rows before 1943 (age 84 and older) are new in PR 1 (they read 66 before).
- `ssClaimFactor(fraMonths, claimAge)`: the claim age is clamped to 62-70 (a start below 62 never extrapolates; a start past 70
  under B1's switch gets the factor of 70, since delayed credits stop at 70). Early: 5/9 of 1% a month for the first 36 months,
  5/12 of 1% beyond (POMS RS 00615.101); late: 2/3 of 1% a month (RS 00615.692, 20 CFR 404.313). Counted in whole units of
  1/3600 (20, 15 and 24 a month) and divided once, so 62 with an FRA of 67 is the double nearest 0.7 (`2520 / 3600`), where
  `1 - 0.2 - 0.1` is 0.7000000000000001.
- `ssFactorAge(ctx, p)`: the start age when collecting (and the start age is not after the current age; a later one is read as
  not collecting); otherwise the later of the start age and the current age (`ageX`, year 0): **claims now**, a start age
  already past is a claim this year (spec 7.1). The default start age of 62 for someone older is the usual case.
- `ssOwnFactor(ctx, p)`: 1 in `'atClaim'`; in `'pia'`, `ssClaimFactor` at `ssFactorAge`. The sidebar's check line
  (`src/us/ui/inputs/ss-basis-notes.js`) reads the same factor.
- `ownBenefitYearly(ctx, p, a, factor, paid)`: the partner's own benefit in the year they are `a`. Nothing before the start
  age; `'atClaim'` is `monthly * 12 * factor * paid`, the order every former copy had (so no figure moved in PR 1); `'pia'` is
  `monthly * 12 * ssOwnFactor * factor * paid`. The payment condition is the same in both bases: a start age below the current
  age is paid from year 0.
- `ssSurvivorFraMonths(birthYear)` (PR 2): the survivor full retirement age (20 CFR 404.409(b), POMS RS 00615.003 B.3, read
  2026-11-21): 65 to 1939, +2 months a year to 66 for 1945-1956, +2 months a year to 67 for 1962 and later. The table's 62 for
  births before 1912 is not modeled.
- `ssSurvivorFactor(sfraMonths, x)`: the survivor age factor f(x), 28.5% at most spread evenly over the months from 60 to the
  survivor FRA (POMS RS 00615.301), 1 from it on; a start below 60 reads 60. Counted in units of 1/1000 of 28.5% and divided
  once, `(1000 M - 285 m) / (1000 M)` with M the months from 60 to the survivor FRA, so f(60) for an FRA of 67 is `60060 /
  84000`, the double nearest 0.715.
- `ssSurvivorStartResolved(ctx)` (`null` read as the survivor FRA rounded up) and `ssSurvivorFactorAge(ctx)` (as `ssFactorAge`:
  collecting reads the start, a later start is read as not collecting, otherwise claims now).
- `ssSurvivorQuoteRead(ctx)` returns 0 (no earlier quote), 1 (the quotes agree: no widow's limit), 2 (a widow's limit) or 3
  (they disagree), with P = Q / f(a) the amount at full retirement age that Q implies without a limit: 3 when Q > F or P < F -
  2; 1 when P is within $2 of F either way; 2 when P > F + 2. Why it works: the survivor benefit is min(PIA f(x), max(82.5% of
  PIA, R)) after a reduced claim by the deceased (POMS RS 00615.320), so F is the cap and a quote below it gives the PIA. SSA
  rounds both quotes down, so with no limit P lands within $1 of F either way (PIA 2,001.90: F 2,001, Q 1,431 at 60, P
  2,001.40); a real limit puts P at least about 0.56% of the PIA above F. Code 2 assumes the start is at or after the quote
  age, as the spec does; for a start before it, P is only a lower bound on the PIA when the limit already binds at the quote
  age, so the figure is conservative.
- `widowedSurvivorYearly(ctx)`: today's dollars, from its start: `F * 12 * f(x)`, or under code 2 `min((Q * 12 / f(a)) * f(x),
  F * 12)`. Codes 0, 1 and 3 pay the first.
- `ssSpousalFactor`, `spousalStartAge`, `spousalExcessYearly`, `ssSpousalStart` (PR 5): the spousal benefit, below.
- `paidBenefitYearly(ctx, p, a, factor, paid)`: a living partner's slot outside a survivor period; for a couple, own plus any
  spousal excess (added only when the bases allow one, so every other couple gets exactly `ownBenefitYearly`). For a widowed single person,
  `max(own, survivor)` once each has started (SSA pays the smaller plus the excess of the larger, POMS RS 00615.020; each is
  cut only for the age it starts at, no carry-over reduction, in either order); for anyone else exactly `ownBenefitYearly`, so
  no figure moved in PR 2. The cut (`ssPaidShare`) applies to both.
- `marriedAtYear(ctx, y)`: jointly filing, or past the wedding age of a "start single, then marry" plan; E3's `marriedAtDeath`
  (`run-projection.js`) reads it. Whole years: a death in the wedding year counts as married (SSA asks 9 months).
- `deceasedSurvivorYearly(ctx, deceasedIsA, deathYear, x)`: a couple's survivor amount at survivor start x, today's dollars.
  The deceased "had claimed" when their factor age (`ssFactorAge`) is before their age in the death year (a start in the
  death year itself was never paid, since the whole death year is survivor period). Claimed early: `min(PIA f(x), max(0.825
  PIA, PIA r))`, the widow's limit (never R x f(x)); claimed at or after full retirement age: `PIA r f(x)`; not claimed: the
  PIA with the delayed credits earned to the death year, `PIA max(1, ssClaimFactor(fraD, D)) f(x)` (none before full
  retirement age; the factor's clamp stops them at 70). The deceased's full retirement age from their birth year, f from the
  survivor's.
- `survivorBenefitYearly(ctx, deceasedIsA, deathYear, ageA, ageB, factor, paid)`: after a death. With the deceased's amount
  entered as paid at the start age (`'atClaim'`), today's simplified swap to the bit: the greater of the two own benefits, each
  as if both were alive, married or not. In `'pia'`: the survivor's own benefit, and if the couple was married at the death,
  the higher of that and the survivor benefit, which starts in the death year or at the survivor's 60 if later (spec 5.3,
  owner's option a: no input, not searched), reduced for that age. `lambdaEstimate` passes the death its life expectancies
  imply even with survivor modeling off (`isSurvivorPeriod ? deathYear : firstDeath`), always finite.
- `socialSecurityIncome(ctx, { year, age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA, deathYear })`: the year
  loop's stage (`run-projection.js`) and the Sankey's (`sankey-columns.js`): each living partner's slot from
  `paidBenefitYearly` (own plus any spousal excess), or in the survivor period the survivor's slot from `survivorBenefitYearly` and 0 in the deceased's.

The cliff plan's `benefitIncomeAt` (the bridge check and the lambda walk) and `lambdaEstimate`'s sample profiles call
`paidBenefitYearly` / `survivorBenefitYearly` directly (they had their own copies, `ssAt` and `ssOf`, before PR 1). Since PR 5 no
module outside `social-security.js` calls `ownBenefitYearly`: a living partner read through it would miss the spousal excess
(`ss-spousal.test.js` scans for it). Survivor benefits are Social Security benefits for 26 U.S.C. 86 and the state kinds, so every reader downstream
takes them from the `ssA` / `ssB` slots unchanged.

Whole years: a claim at x pays the whole projection year in which the person is x, and "claims now" pays the whole of year 0,
although a real claim starts in a month. The bias is nearly the same for every claim age, so a comparison barely moves.

## The spousal benefit (PR 5)

Rules read 2026-11-21 (the CFR through law.cornell.edu, POMS directly): the worker entitled, the spouse 62, a marriage of at
least a year (20 CFR 404.330); one-half of the worker's PIA (404.333, POMS RS 00615.201); reduced 25/36 of 1% a month for 36
months before full retirement age and 5/12 of 1% beyond (404.410(b); 156/240 at 62 for an FRA of 67); no delayed credits from
the worker's record (404.313(e)(2)); the full own benefit comes off the full spouse's benefit and the excess is paid on top of
the (reduced) own benefit (RS 00615.020); deemed filing for anyone born 1/2/1954 or later, at any age and in any later month,
not for survivor benefits (GN 00204.035).

- **When there is one.** A couple; the other partner's amount entered at full retirement age (`pia`) and above 0; this partner's
  own PIA known, in `pia` or an amount of 0 in either basis (no own benefit; owner, 2026-11-21); and `0.5 * other - own` above 0
  (exactly half is none). A partner in `atClaim` with an amount above 0 gets none (the amount is not a PIA), so every plan in the
  default basis keeps every figure; the check line then hints to switch it.
- **When it starts** (`spousalStartAge`, a number, `Infinity` when none): the latest of this partner's factor age
  (`ssFactorAge`: the start, "claims now", or a past start while collecting), the other's factor age moved to this partner's
  ages, 62, and the marriage gate: paid in year y only when `marriedAtYear(ctx, y - 1)` (every year under `mfj`, from the year
  after the wedding year of "start single, then marry", never for two single filers). Deemed filing applies to everyone: anyone
  born before 1954 is past 70 in 2026.
- **How much** (`spousalExcessYearly`): `(0.5 * other - own) * 12 * ssSpousalFactor(fra, x) * factor * paid` from x, with
  `ssSpousalFactor` counted in units of 1/3600 (25 and 15 a month; 62 with an FRA of 67 is `2340 / 3600`) and 1 from full
  retirement age on. The benefit cut applies.
- **Where.** Living years only: A's and B's slots through `paidBenefitYearly` (the year loop's stage, the Sankey, the cliff
  plan's `benefitIncomeAt` and `lambdaEstimate`). After a death the survivor gets the higher of their own benefit and the survivor
  benefit on the deceased's own record, never the excess (the spouse's benefit needs a living, entitled worker).
- **The search.** A spouse with no own benefit but an excess has an axis (62-70, the age they file for the spousal benefit);
  every start at or before the other's pays alike and is deduped. The stream key writes a couple's slots as `own|excess`, so two
  choices with one sum and different parts never share a run.
- **The check line** (`ss-basis-notes.js`, through `ssSpousalStart`): "Plus $X a month as a spouse from <x> (half of Partner
  X's amount less your own, reduced for <x>)" ("unreduced" from full retirement age), alone for an amount of 0; the hint for a
  spouse in `atClaim` beside a partner in `pia`.
- No new input: no seed, fingerprint or saved-plan change. A stored plan applied before PR 5 with both amounts in `pia` keeps
  its fingerprint while its figures now include the excess, as with any engine rule change.

## The guided entry

`#ssGuide`, one collapsed panel for both partners (owner, 2026-11-21), quotes SSA's Quick Calculator
(ssa.gov/OACT/quickcalc/, labels read 2026-11-21 in a browser: "Enter your date of birth", "Enter earnings in the current
year", the optional retirement date, "today's dollars", "See the earnings we used"; with no retirement date it shows three
ages). It tells the reader to zero the earnings from their planned retirement on, since the calculator otherwise assumes work
until the claim, which overstates an early retiree's benefit.

## The claiming search (PR 3)

`src/us/core/optimizer/claim-search.js`, an engine module: `claimSearchSteps(ctx, contextFor, planContextFor)` searches the
claiming ages of `ctx.inputs` and `claimSearch(...)` is its drained form. The card (PR 4, below) runs it in timer slices. The rules that name Social Security keys live in `social-security.js`, so
the one-formula scans (`ssMonthly`, `ssSurvivor` named nowhere else in `core/`) hold:

- `ssClaimAxes(ctx)`: the kind (`widowed` needs `ssWidowed` and a survivor amount; else `single` or `couple`) and an axis per
  benefit: the ages a claim can take, or why it is fixed (`'none'` no amount, `'collecting'`, `'past'` nothing left at or below 70,
  read before `'atClaim'`, the age not changing the amount), with `current`, the age the current choice pays from (its factor
  age: a start below the current age, not collecting, "claims now"). Own: `max(62, age) .. 70`; survivor: `max(60, age) ..
  ceil(survivor FRA)`. The maximum is 70 even under the "law changes" switch; a later current start is an extra run.
- `ssClaimVariant(base, axes, cell)`: a shallow copy with only the varied start ages written (the survivor start as a number).
- `ssStreamKey(ctx)`: the yearly benefit of a choice in the living years (factor and paid 1) as a string. Two choices with one
  key run once ("same as"): every engine reader of a start age is in this file and reads it only through the payment test and
  the factor age, both functions of the effective age; a couple's survivor benefit reads the deceased's factor age only when it
  was paid before the death, which two equal streams then share. The solver reads the same functions, so an own plan is one
  plan too.

The search, in order: `claimStatus` refuses before any run (`'none'` and `'collecting'` hide the card, `'atClaim'` asks for the
amount at full retirement age, `'nothing'` when no axis varies or the grid is one cell that is the current choice). The grid
(survivor by own, A by B, or one row) runs each distinct stream once through `contextFor` (the kept plan, in the UI) with
guardrails off, in the earlier-ages order (the smaller sum of the varied ages, then the earlier survivor or A start), so a "same
as" names the earliest cell. A measure is `{ depletedAge, value, today }`: the after-tax end value priced through
`pricingContextFor` and deflated as `objectiveBreakdown` does. `claimBetter` / `claimPick`: never running out beats running out;
then the value higher by more than the cliff plan's $1; between two that run out, the later age; the scan puts the current
choice first, so ties go to it, then to earlier ages. `homeDrawAge` is not ranked. Then the current choice and the top three other
distinct runs are re-measured with `planContextFor(planInputs, runInputs)` (the UI's `(p, r) => ownPlanContextFor(p)(r)`): each
planned as Apply would leave it (the variant with the base's guardrails; the base itself for the current choice, so it keeps the
kept plan) and run with guardrails off; `best` (the headline) and `best.gain` read only those measures; `current.measure` stays
the kept-plan one. Without the cliff plan there is nothing to search and the grid measures stand. Last, for a single or widowed
person, the longevity row: the grid re-run with the life expectancy set to 80, 85, 90 and 95 (the plan's own end age reuses the
grid), on the kept plan. The generator yields `'run'` after every projection and `'plan-next'` / `'plan'` around every own plan.

Costs measured 2026-11-21 (Node 24, a Vitest world): a widowed person of 60 on the default plan, 72 cells, 63 distinct, 319 runs
and 4 own plans in about 0.7 s (most of it the longevity row); a single person, 49 runs in 0.1 s; a couple, 81 cells, 85 runs in
0.2 s; about 2 ms a run. `ownPlanFor`'s cache is shared with the moves card (16 entries since PR 4; it clears when full: searches,
never figures).

Whole years: year 0 is the full tax year, so a claim this year pays 12 months even late in the year, and a claim at x pays the
whole year of x although payment starts in the birthday month; the bias is nearly the same for every choice.

## The card and Apply (PR 4)

`src/us/ui/results/claiming-card.js` draws "When to claim Social Security" (a `<details class="result-card" id="claimingCard">`
after the plan optimizer card in `src/us/index.html`, closed on load like the other analysis cards); its text is built by the
pure functions of `src/us/core/format/claim-text.js` (`tests/unit/us/claim-text.test.js`).

- **Shown or hidden.** Every render (the light one too) reads `claimStatus(ssClaimAxes(...))` with no run: hidden for
  `'none'` and `'collecting'` (couples are shown since PR 5, so the default couple sees the closed card with its `'atClaim'`
  line); `'atClaim'` and `'nothing'` paint their one line at once (`'atClaim'` with a "Go to the field" button that reveals the
  first partner's basis field in `atClaim`; for a couple the line names the partners).
- **When it searches.** `scheduleClaimSearch()` runs from the full render and the deferred pass (after the guidance jobs) and
  from the card's `toggle` on open (which paints and schedules only: no `render()`). Only while the card is open and shown,
  never while `searchPending()`. A job drives `claimSearchSteps` with the goal answers' slice rule (40 ms or 8 steps; a
  `'plan-next'` ends the slice, so a bracket search runs alone), drops itself when the state object or the key changes, parks
  while the card is closed (reopening re-arms it) and, under `__testHoldGuidance`, starts no timer until
  `__test_flushClaimSearch()` (which schedules, then runs the job to its end). The contexts: `stateContextFor()` (the kept plan)
  and `(p, r) => ownPlanContextFor(p)(r)`.
- **The key** (spec 7.3): the tax year, `storedPlanFingerprint(state)` (no list-row names, goals or dismissals: a rename keeps
  the result), the stored plan, the optimizer override maps and the kept cliff plan; memoized on the state's JSON and the
  objects. The results of the last four keys are kept (`keptMemo`), so a Try and its Revert each find their grid; a result for
  an older key is drawn dimmed with "Comparing claiming ages…" until the new one commits.
- **What a cell shows.** A twin ("same as") resolves to its canonical cell first; the current choice and its twins show the
  current choice's own-plan measure (`top[0]`, the same run as its kept-plan one); a re-measured cell (and its twins) its
  own-plan measure, marked with a dot; every other cell its kept-plan measure. The label is the difference from the current
  choice in today's dollars (`compact`, a true minus, `$0` within $1), "out at <age>", "lasts" when the current choice runs out,
  "current", or "same as <ages>" (with a legend under the grid). A hover box that follows the cursor (`claimCellTip`, styled
  as the chart's) and a tap (into a line under the grid) give the after-tax end value in today's dollars when the money lasts,
  or the run-out age (never a $0 end value), the comparison with the current choice, and whose twin a cell is. Shading: green by value among the cells that never run out, red by run-out age among those that
  do. The headline reads `best` (own-plan measures); the longevity row and its sentence follow the grid.
- **Couples** (PR 5): the grid is Partner A's start (rows) by Partner B's (columns), or one row of the varied partner's ages when
  one axis is fixed (with a line naming why); no end-age row (a line says survivor modeling covers the first death); the headline
  names the best pair against the current choice, then the best "same age for both" pair (`claimSameAge` in `claim-text.js`: the
  diagonal's winner by `claimPick`, measured as the grid shows it, named by its diagonal cell and compared by its canonical one)
  with its gap from the best ("about the same" within $1 or below it, or when it runs out no earlier than the best, since the best
  is picked among the re-checked cells; "which pays the same" when its canonical cell is the best's but the best is off the
  diagonal, as for a spouse with no own benefit).
  The ranking lives in `src/us/core/optimizer/claim-rank.js`, shared by the search and the text.
- **Apply** (spec 9): writes the best cell's varied ages, `ssStartAgeA`, `ssStartAgeB` (a couple) and `ssSurvivorStartAge`, the survivor axis's last age
  as `null` ("at full retirement age", which pays the same and stays out of the stored plan's fingerprint), with one undo
  snapshot, then `dismissFirstRunBanner()`, `syncControls()`, `render()`, `saveInputs()`. The button shows only while the drawn
  result is for the live key; it is disabled in market-scenario mode and during a move preview; a click after a change with no
  repaint is refused ("Your inputs changed since these ages were compared; the card is comparing them again."). With the cliff
  plan on, Apply is not always idempotent: the applied ages get their own kept plan, the grid's top three can change and a
  newly re-checked cell can win.
- **Hooks:** `__test_flushClaimSearch()`, `__test_claimingCard()` (the card's view and the drawn result's choices),
  `__test_applyClaim()`. `test_claiming_card.js` covers them; `tests/snapshot_ui.js` flushes the job before it reads the page.

`ownPlanFor`'s cache holds 16 plans (8 before PR 4), so the re-measure and the moves card do not evict each other's.

## Not modeled (known simplifications)

- Delayed credits are 8% a year for everyone; people born before 1943 (84 and older in 2026) earned less a year.
- The January lag of delayed credits; claiming in months rather than whole years.
- The earnings test (the "Worth a second look" warning names it, for each partner's start and, PR 2, for a widowed person's
  survivor start, `ssSurvivorBeforeRetirementCase`). It applies to survivor benefits too and ends at the full retirement age of
  the retirement table, not the survivor table (20 CFR 404.415(a) cites 404.409(a); read 2026-11-21).
- The spousal benefit: the child-in-care spouse, the marriage exceptions of 20 CFR 404.330(a)(2)-(3), the old restricted
  application for births before 1954, the earnings test on the excess (the warning, `ssBeforeRetirementCase`, needs an own
  amount, so it never fires for a spouse with no own benefit who has wages), divorced-spouse benefits; the family maximum.
- Survivor benefits: remarriage (remarrying before 60 ends it; named in the switch's bubble); the disabled widow(er)'s benefit at
  50-59; the child-in-care benefit and child benefits; divorced-spouse benefits; the $255 lump-sum death payment; SSA's 9 months
  of marriage (whole years); a couple's survivor start is a fixed rule, not an input or a search.

## The seed and the fingerprint

`monteCarloSeed` leaves the four keys out by name (as B1's and B2's), so no Monte Carlo figure moves, and with a basis switched
the same seed runs the same market paths. The stored plan's `fingerprintJson` appends each key after the rest only while it is
away from its default (`'atClaim'`, false): no saved plan went stale when they shipped, and a plan applied before a switch to
`'pia'` reads stale (spec 9's rule for every new key of the claiming-age work). The six widowed keys (PR 2) are left out of the
seed by name, and the fingerprint appends them only for a widowed single person (`singlePerson && ssWidowed`, the only time the
engine reads them), each away from its default (`ssWidowed` itself then always).
