# The MAGI iteration

Read before editing a year body of either engine, anything that reads or changes this year's MAGI, two-return years, the 162(l) estimate, or the IRMAA lookback and appeal.

Related: [engine.md](engine.md), [self-employment.md](self-employment.md), [us-health.md](us-health.md), [inherited-accounts.md](inherited-accounts.md), [cliff-plan.md](cliff-plan.md), [us-federal-tax.md](us-federal-tax.md), [lists.md](lists.md).

## MAGI iteration (both engines)

- **MAGI iteration (both engines).** ACA subsidy, the ACA/IRMAA
  Roth-conversion ceilings and the IRMAA lookback need THIS year's MAGI,
  which includes this year's discretionary withdrawals, which depend on
  the premium that MAGI sets. Inside each engine's year loop the body is
  wrapped in `for (let iter = 0; ; iter++)`: it snapshots every mutated
  balance (and the Roth and account ledgers) before the first mutation, and if
  `estUsed` (an ACA premium or a finite MAGI ceiling consumed
  `estTrad`/`estGain`) and the realized discretionary traditional
  withdrawals + taxable gains differ from the estimate by more than
  `MAGI_ITER_TOL`, it restores the snapshot, updates the estimate, and
  `continue`s (max `MAGI_ITER_MAX` passes, damped after pass 3; a year whose conversion read the draw steps by a secant, below). Rules for
  editing a year body: anything that mutates closure state before the
  convergence check must be in the snapshot (`bal` fields are rewound
  automatically; add new scalar `let`s to `scalarSnapshot`; the guardrail state is the `guardrails` object, copied as `guardrailSnapshot`), and never add a `continue`/`break` that is meant for the year
  loop. `prevDiscTraditional`/`prevTaxableGainGross` only seed pass 0.
  `row.magiProxy` is the realized MAGI and `irmaaMagiHistory[year]` is
  overwritten with its Medicare MAGI after convergence; the in-body assignment is
  provisional and only read by the plan's first-year IRMAA stand-in.
  The engine's MAGI is the ACA definition (all of Social Security); IRMAA amounts convert with
  `irmaaMagiOf(magi, ss, filing)` (Medicare's MAGI: only the taxable part of Social Security, this year's
  return's benefit and filing status, `irmaaSsOf` / `returnStatusA`), and IRMAA lines and caps translate
  into the engine's MAGI with its exact inverse `magiForIrmaaLine` (one MAGI scale for steering).
  **The forced pass's pick (US).** A year that has not converged after `MAGI_ITER_MAX` passes re-runs, once, the logged pass that
  overpaid the least (`passLog`; its realized cost is at most its charge) with that pass's logged estimates, so it repeats exactly.
  With no premium step in play every pass ties at an overpay of 0 and the strict `<` keeps the first, the seed pass. In a year whose
  conversion read `estTrad` (a sized year, `convTarget !== null`, any target, `'none'` included, Batch 5 step 5b piece 3, spec
  B0.11.10; and since Batch 5 follow-ups S1, spec 4.1 review M3, any year with `convReadEst`: the plain or fallback fill too) an
  exact tie goes to the pass with the smallest `drift` (each `passLog` entry records its pass's drift, the convergence test's own
  measure: the 162(l) terms are in it when `seLive`): the conversion is the fill less `estTrad` and moves against the draw, so the
  seed pass is the least consistent one (`std R everything` at 60 converted the whole 22% fill on top of a 184k draw). Other years
  keep the first pass, byte for byte. Tests: `conversion-apply.test.js` (k) (the sized year on `hist R everything | boom`: since S1's
  secant step the standard run's year converges), `conversion-fill-draw.test.js` (the plain-fill tie).
  The forced pass is an ACA-branch device (`usesMagiEstimate`): S1 left a year with no ACA premium that reaches the cap on
  whatever pass ran last, converged or not (94 such years over $1 from converged in the 960-household scan grid, 20 over $1,000,
  against main's 1,137 and 77; worst a smooth slack-fill period-4 cycle at $50,461).
  **The cap pick (US, Batch 5 follow-ups S2, Task 4b).** Beside the forced pick: a year whose conversion read `estTrad`
  (`convReadEst`) and that priced no premium off an estimate (`!usesMagiEstimate`), still unconverged at the cap, re-runs once the
  logged pass with the smallest `drift` (the first logged on a tie), its estimates and holds restored exactly as the forced pick
  restores them (R1b in the site table), so it repeats exactly. Such a year logs its passes too (the `passLog` push reads
  `(usesMagiEstimate || convReadEst) && !forcedPass && !capPass && !replaying`; with no premium priced off the estimate the entry's
  `realized` is its `charged`, no `costAt` call); no other year logs or allocates anything. The re-run is the kept pass: it takes no
  convergence decision (every guard that skips one on `!forcedPass` reads `!forcedPass && !capPass`: the probe release, the update,
  the 162(l) search and switch, the forced block), charges what it computes (the refund block stays `forcedPass && flow < 0`: no
  premium was estimated, nothing to refund), and is counted in `magiStats.capPicked`, never `forced` or `unresolved`. `capPass` is a
  distinct flag so `magiStats.forced` keeps its meaning: reset with `forcedPass` at every phase start, carried on `natRec` /
  `trialRecs` as `capPicked` and restored with `forcedPass = r.forced` at every replay; like `forcedPass` it is not in
  `scalarSnapshot`. The trace row gains `capPicked`, and its `picked` index also names the cap pick's entry. ACA years keep the forced
  pick unchanged; a year without `convReadEst` is unchanged. A pass that released a hold (rule 2) is marked on its entry
  (`released`) and skipped: re-running it would restore the lower hold and keep the held-at-0 conversion the release exists to undo
  (review I1); with every entry skipped the year keeps its last pass. (The ACA forced pick does not skip it: recorded as a
  follow-up.) The re-run happens even when the pick is the last pass (one pass; the replay check then verifies every cap pick).
  The two picks never mix entries: `usesMagiEstimate` is fixed within a year (`healthcareCost` reads only year-fixed inputs for
  it), so a year's log is all ACA entries or all non-ACA ones. `forcedPick` / `capPick` (test-only reads) reset at each phase
  start, so the trace's `picked` is -1 when a phase cleared the log. The worst case above (smooth `HoH 62; 1500k; 300k; 130k` at 70) now
  keeps its $20,161-drift pass converting $29,281 (was the last pass: drift $50,461, converting 0). Tests:
  `conversion-fill-draw.test.js` (the cap-pick cases).
  **Pass counts are per phase.** Each phase of a year (the natural phase, a stay-under trial, an order or split trial, the sized
  phase) starts its own `MAGI_ITER_MAX` budget (`phasePass = -1` at each trial start), and the trace's `passes` (`iter + 1`) sums
  every phase of the year. So "a year at the 8-pass cap" read from the trace includes phased years whose phases each converged (a
  natural phase of 6 passes plus a 2-pass stay-under trial reads 8); a convergence gate counts kept phases accepted unconverged
  (drift over $1, not forced), not years at 8 (S1 Task 4, the gate restatement in the follow-ups spec section 5).
  **The fill reads the draw (US, Batch 5 follow-ups S1, spec 4.1).** The plain bracket fill (and the sized path's fallback) converts
  only the room above the pass's own draw estimate (`solveRothConversion(..., estTrad)`), so the conversion and the draw depend on
  each other inside a year. `convReadEst` (reset at each pass start) says this pass's conversion was resolved from `estTrad`; the
  plain fill also sets `estUsed` whenever it runs (a non-zero bracket, something to convert), so such a year iterates even with no
  ACA premium and no finite ceiling. The update of `estTrad` in such a year:
  - *No ACA premium* (`!usesMagiEstimate`): the secant step. From the second pass, `estTrad` moves to the fixed point of the line
    through the last two (estimate, realized draw) pairs (`secEst`, `secReal`); the other estimates take the plain undamped step.
  - *The kink jump (Task 2c).* The line holds only while the conversion moves: between `hi = estTrad + conversion` (where a fill
    giving back at most a dollar per dollar of draw reaches 0) and `lo = max(0, estTrad - (convertible - conversion))` (where it
    would reach the convertible balance). A unit slope (within 1e-3: the year's traditional total is fixed, a smooth draw or a draw
    held to a MAGI cap, so the draw takes back each dollar the fill gives up) has no fixed point, and a line fixed point past `hi`
    or `lo` is on the flat side: either steps to that kink (at least the plain step; along a unit slope the MAGI estimate, base +
    `estTrad` + conversion, does not move up to the kink; past it, where the conversion is 0 or at its cap, it moves with the
    estimate) and drops the pair, so the next pass takes the plain step, exact on the flat side. A slope
    above 1 + 1e-3 keeps the plain step (noisy pairs of tiny steps reached slopes near 7).
  - *An ACA year* (option Y, owner 2026-10-31): the damped step, except the kink jump on a unit slope (any premium: up to the kink
    the MAGI estimate does not move) and the clamped secant while the two paired passes were charged the same premium: `healthcare`
    (the pass's charged cost, the `passLog`'s `charged`) exactly equal (`===`) to the previous pass's (`secHc`), so the estimates
    between them crossed no step of the ACA schedule the damping guards against. Here a kink exit goes at least to the kink and never
    further than the damped step (`max(estTrad + w * (realized - estTrad), hi)` and the `min` twin with `lo`): past the kink the
    MAGI estimate moves, and a full plain step there could cross a premium step. A kink already passed bounds nothing: with the
    conversion at 0 (or at the convertible balance) the same-premium secant runs on the flat side unclamped (else the clamp would
    cut every step to the damped one and drop the pair each pass).
  - A pass whose conversion did not read the draw clears the pair (`secEst = secReal = NaN`), so a later pass never pairs with a
    stale point; so do the `seHeld` switch and every phase start (wherever `passLog` / `phasePass` reset).
  `secEst`, `secReal` and `secHc` are iteration bookkeeping like `passLog`, not year state: they are not in `scalarSnapshot`
  (rewinding them each pass would lose the pair the step needs). `passLog` entries also carry the pass's `realizedTrad` (test-only
  reads). Test: `conversion-fill-draw.test.js`.
  **The IRMAA tier holds within a year (US, Batch 5 follow-ups S1 Task 2f, spec 4.1 "The IRMAA tier within a year", owner
  2026-11-01).** The conversion ceiling's IRMAA cap is the top of the tier the pass's `preConvMagi` sits in, and `preConvMagi`
  carries the previous pass's realized gains, which include the sale that paid the previous conversion's tax (about 17-20 cents a
  dollar converted). A seed about 4x the margin under a tier line too low crosses the line on the pass-0 -> 1 step, the year converts
  up to the next tier's line and confirms it; no estimate-update rule can tell that from a real tier change (the Fable path report,
  `.superpowers/sdd/2026-10-31-b5-followups/fable-path-report.md`). The one honest test of the year's tier is a pass that converts
  nothing: its realized MAGI is the year's no-conversion MAGI. So:
  - *The holds.* `irmaaHold` (household) and `irmaaHoldA` / `irmaaHoldB` (per return, the lines `irmaaRoomFor` computes, each in
    its return's MAGI), Infinity at each year's start: the lowest IRMAA line a pass of the phase read. `conversionMagiCeiling` takes
    them and caps at `min(line, hold)` (Infinity: the very double of the ceiling before them) and reports the lines it computed in
    the scratch `CEIL_OUT` (`line`, `lineA`, `lineB`; NaN where none applied), read right after the call (`ceilLine` ...).
  - *The gate (rule 0).* The holds act only on a pass whose conversion is solved under the ceiling (`ceilRead`, reset at each pass
    start): the plain fill (`convertsThisYear`, not a stay-under trial, no `rothAmountByAge` age, something to convert, a non-zero
    bracket; decided before the ceiling call) and the sized path's fallback (`amount < 0`). The ceiling gets the holds on those passes
    and on every sized pass (whose held ceiling only the fallback reads); every other pass gets Infinity, so a year converting
    nothing, a split phase, a stay-under trial, bracket 0 and a conversions-off household compute today's doubles
    (`ctx.test.irmaaHoldOff` turns the holds off for the gate test).
  - *Rule 1.* After the conversion of a `ceilRead` pass, each hold takes the line if lower (a down-move is always taken; a NaN line
    compares false).
  - *Rule 2, the probe release.* A `ceilRead` pass that converted nothing while its hold set the ceiling (Task 2g, owner 2026-11-01:
    `conversionMagiCeiling` reports it in `CEIL_OUT.held`, `irmaaHold < line && irmaaHold <= magiCeiling`, so no lower cap, the ACA
    400% line, set it; per return `CEIL_OUT.heldA` / `heldB`, the hold below its line and that return's held room the final room, a
    tie counting for both; the year loop reads them right after the call as `ceilHeld` / `ceilHeldA` / `ceilHeldB`) realized the
    no-conversion MAGI: `realizedPre`, the pre-settlement realized MAGI (the terms of `realizedMagi`, which a
    held phase's settlement rewrites; two returns: `returnMagis` of the realized draws, the one allocation, only when a per-return
    hold bound). Above the held line the year sits in the higher tier: the hold is released (Infinity) and the pass takes the update
    even when it converged (`released`), so the year converts to the higher line instead of ending at 0. Never on the cap pass, a
    forced pass or a replay. The cost is one pass in a year whose no-conversion MAGI sits a tier above an earlier pass's estimate.
    Before Task 2g "the hold bound" read the IRMAA line only (`irmaaHold < ceilLine`), so a year whose ACA 400% line was the tighter
    cap (an ACA year at 63-64; 74 of 100 converged releases in the Task 4 re-measure) released and re-ran once for nothing; the
    held flags skip that pass and change no row (`conversion-fill-draw.test.js`, "keeps a hold that did not set the ceiling").
    Rule 1 still reads the lines.
  - *Rule 3, the secant pair.* Each update that sets the pair also stores the holds (`secHold`, `secHoldA`, `secHoldB`, reset with
    `secEst`); the secant and the kink logic use the pair only while the holds are the same (`Object.is`): a release or a down-move
    moves the cap and drops the pair (a first binding does not: the cap is `min(line, hold)` on both sides of it).
  - *Rule 4.* The non-draw estimates in a non-ACA secant year take the plain step (weight 1; 90f9e8b's damping from pass 3 is
    gone: it tripled the converting cap years and protected the tier only through one seed path).
  - *Why the holds are carried like an estimate, and not in `scalarSnapshot`.* They are iteration bookkeeping (a rewind each pass
    would erase the line the previous pass found), but an input to the pass (they set the ceiling), so they go everywhere `estTrad`
    goes. The replay argument: a record stores the holds after its final pass's rule 1 (`holdOut = min(holdIn, line)`); a replay
    computes the same line from the same estimates and caps at `min(line, holdOut) = min(line, holdIn)`, the recorded pass's cap. A
    releasing pass always takes the update, so it is never a phase's final pass, nor a record's.
  - *The site table* (every place the estimates are saved, restored or re-seeded; the holds' handling): the records `passLog` (W1),
    `natRec` (W2), `trialRecs` (W3) and the test-only trace row (W4) carry them; the exact replays restore them from the record they
    repeat: the forced pick (R1, `pick`), the cap pick (R1b, `pick`; S2 Task 4b), apply's split pass that drew nothing (R2, `r`), the rejected order phase with no trials (R3,
    `naturalRec`), the split stage's kept non-last record (R4, `best`), apply's fallback (R5, `naturalRec`) and the trial winner (R6,
    `best`); the phases seeded from a record's realized values take its holds (P2 split partner B, P3 split stage start, P5 trial
    start: `naturalRec`); the sized phase (P1, a fresh start from the year's seeds) resets them to Infinity (choose/apply parity:
    apply's first phase of a sized year has no hold); the `seHeld` switch (S1) and the order phase start (P4) keep them (`// hold:
    kept`: the switch continues the phase from realized values that include the conversion's tax; in apply the order start builds no
    `naturalRec`, so a record's holds would be stale). The year start (Y0) declares them; the update (U1) releases them.
  - *The guard and the replay check.* `tests/estimate_sites.js` (in `npm test`) parses `run-projection.js`: every `estTrad = ...`
    site assigns the three holds or says `// hold: kept`, every object literal keyed `estTrad` lists them, every replay block sets
    `replayRec` (the forced block `forcedPick`, the cap block `capPick`), and the counts are the table's (13 sites, 4 literals, 7
    replay blocks): a new site
    fails until the table and the guard change together. `ctx.test.replayCheck` (test-only, `window.__test_replayCheck`,
    `tests/replay_check.js`, not in `npm test`) compares, with `Object.is`, the holds entering every replayed and forced pass with
    its record's and every seeded phase's first pass with its seed's, and every replayed pass's conversion and settled MAGI (the
    forced pass and the cap pick: conversion and `realizedPre`) with its record's, counting `testHooks.replayMismatch` and
    `replayChecked*` per kind (Forced, CapPick, R2-R6, SeedP1-P5, SeedS1). The trace row carries the kept pass's `estGain`, `gainRealized`, the holds, and the year's
    `holdReleases` / `holdReleasesConverged`. Tests: `conversion-fill-draw.test.js`.
  **Two-return years (US, 3C B1):** `twoReturns = !profile.singlePerson && !filingRow(filing).joint` (an
  unmarried couple, or before a marry-later wedding; never the survivor period or single-person mode).
  `returnMagis(profile, trad, gain)` splits the MAGI into `[magiA, magiB]` (each partner's `other` and
  Social Security, half the investment income and gains, `trad` = discretionary draw + conversion by
  `profile.ownerShareA`; the two sum to the household figure) and allocates its 2-array only in those
  years. The year loop keeps `magiHistoryA/B` (rows keep this ACA per-return MAGI), their Medicare MAGIs
  `irmaaMagiHistoryA/B` (A on `returnStatusA`, B single; what `healthcareCost`'s IRMAA reads) and
  `twoReturnHistory` beside `irmaaMagiHistory` (written per pass like it, overwritten with the realized split
  after convergence; rows carry `magiA`/`magiB` in two-return years only). `healthcareCost` prices the ACA premium per tax household (A's includes the
  children, half the premium each, own poverty line) and IRMAA per person on the single tiers whenever
  the lookback year had two returns (`irmaaLookbackSplit`; the entered first-two-years prior MAGI is
  split evenly), else the household rule. `conversionMagiCeiling` keeps each return under its own ACA
  400% line and IRMAA tier, dividing each return's room by its share of the conversion. The forced pass
  prices other draws through `costAt(trad, gain)` (which re-splits the MAGI). Test: `tests/two_return_magi.js`.
  **The split share estimate (US, Batch 5 step 4d).** A split pass (`yearSplit` 0 or 1, [engine.md](engine.md)) draws one partner's
  traditional accounts first, so the share of the year's traditional income on A's return is not the start-of-year ownership share:
  it is realized by the draw. The pass prices each return's premium and conversion ceiling before it draws (`returnMagis` at the
  pass start), so a split pass starts with `profile.ownerShareA = estShareA` (outside a split pass the start-of-year `ownerShareA0`,
  unchanged) and the withdrawal block sets it back to `ownerShareA0` before the draws. `estShareA` converges like `estTrad`: the
  drift gains `|realizedTrad * shareEnd - estTrad * estShareA|` (A's traditional dollars against the estimate), the update is the
  same damped step, under the same `MAGI_ITER_MAX`. It is seeded 1 for A-first and 0 for B-first; a trial from a kept split is
  seeded with the record's realized share (`shareA`). It goes wherever the other estimates go: the `passLog` entries and the forced
  pass's pick (a forced pass repeats the picked pass exactly), the `seHeld` switch's seeding (to the realized share), every record
  (`estShareA`) and every replay (which takes the record's `estShareA`, so it repeats the same pass). A forced pass may end with the
  realized share off its estimate; its lines are then placed with that mixed share (recorded, not corrected).
  **Third estimate (US, E1c).** The self-employed health insurance deduction (162(l)) depends on the year's premium, which depends
  on the MAGI the deduction lowers, so the iteration carries a THIRD estimate beside `estTrad`/`estGain`: `estSeA`/`estSeB` (seeded from
  `prevSeHealthA/B`, the realized deductions of the previous year, written only after convergence, so there is no `scalarSnapshot` entry).
  `magiBase0` is the MAGI before the deduction and `magiBase = magiBase0 - estSeA - estSeB` is rebuilt every pass; each pass puts
  `profile.seHealthA/B` on the profile, prices the premium with `costAt(trad, gain, sa, sb)` (the deduction pair rides as arguments, and
  `lastCost` remembers the pass's cost), and `returnMagis` subtracts `seHealthA/B` from each return's other income. After `healthcareCost`
  the pass runs `seHealthDeduction` (`seRealA/B`), sets `estUsed` when the deduction moved, and removes the realized deduction from the
  medical expense (no double count). The convergence test, the pass log (realized cost on the realized pair), the damped update, the pick
  restore, the forced pass (realized-pair `costAt`, the deduction re-run on `lastCost`), the recorded MAGI (`realizedMagi = magiBase0 -
  (seRealA + seRealB) + draws`) and the cliff plan's phases (natural, fallback replay, trial records, winner replay, trial seed) all carry
  it. A year whose damped iteration does not converge, with a 162(l) deduction allowed (`seAllowA || seAllowB`; 8b, owner
  decision A, refined by decisions 10 and 12), holds a deduction chosen once, as Rev. Proc. 2014-41 section 5 allows: the consistent
  deduction when one exists (a bisection, below), else the alternative calculation (the deduction at the full premiums, `costAt` at a
  MAGI of 1e12, then at the premium after the credit the step-1 MAGI allows). It sets `estSeA/B` to it and `seHeld = true`, and re-runs
  the phase: while `seHeld`, site 7 takes the held pair as the realized pair (the deduction term of the convergence test is 0) and the
  forced pass does not re-price it, so the premium, the draws and the MAGI follow the held deduction. The two methods are one closure,
  `seSearch(trad, gain)` (built on first use in a pass: a pass that never searches allocates nothing), which prices the draws it is
  handed. **Decision 12 (Task 11):** a hold is the year's working estimate, priced on the draws of the pass that failed to converge, and
  is not re-checked inside the year (decision 11's in-year re-hold flipped across the 400% line and deducted more than the premium
  paid). **The settlement (Batch 5 step 1, spec `docs/superpowers/specs/2026-10-23-b5-162l-settlement-design.md`):** every phase whose
  final pass holds a deduction (`seHeld`, forced afterwards or not; a replay recomputes it) files its return at its final draws, in a
  block after `realizedMagi` and before the phase-end block, gated on `seHeld && !ctx.test.seNoSettle`. (1) The coverage kinds the
  pass paid for are captured with `hcArgs.recon = -1` (`ACA_KIND`, reset first: it is filled only on the ACA branch) from the very
  pricing it was charged (the forced pass's realized `costAt`, else `healthcareCost` on the pass's own `hcArgs`); then `recon = 1`
  prices every probe at the return's price (`acaNetCost`'s reconciliation mode: a credited year keeps a credit below 100% and under
  the Medicaid line, a Medicaid year stays $0, an uncredited year claims the credit in 100-400%) until the block resets it to 0.
  (2) `seSearch(trad, gain, true)` runs at the final draws and also records each part's left end (`seLoA/B`), whether it is
  consistent (`seConsA/B`) and section 5.02's (`se502A/B`). (3) A consistent part takes its deduction; otherwise its candidates are
  5.02's (only when it passes the legal bound: D at most the deduction the return's premium at D's MAGI allows, plus $1) and `lo`
  (always legal), each combination priced as its return (`costAt` plus the tax with its own medical deduction) and the lowest
  tax plus premium taken by `settleChoice` (5.02's first, so an exact tie takes it; decision 5); the combinations and the pick are
  the pure `settleCombos` / `settleDecide`. A step-1 deduction of 0 at the return's price settles to 0. In year 0 without entered
  prior MAGIs (IRMAA's lookback stand-in is the year's own MAGI) the pass-local `seStand0` makes every `costAt` of the settlement
  (the search's probes, the bound check, the candidates) write its own MAGI to the year-0 histories first, so a deduction is
  judged at the IRMAA its own MAGI sets (otherwise it could exceed the return's premium). The search's step 1 (the premiums paid,
  priced at a MAGI above every line) is not a return pricing: it never writes the stand-in and reads the pass's own, as the hold does
  (written, it charged the top tier). (4) The settled pair goes on the profile, `realizedMagi` and the histories (`irmaaMagiHistory[year]`,
  two-return `magiHistoryA/B` / `irmaaMagiHistoryA/B`) are written before the final pricing (year 0's IRMAA stand-in is the return's
  MAGI), `healthcareSettled` is `costAt` at the pair, and the appeal fields follow it. (5) `taxSettled` repeats the year's `totalTax`
  expression exactly (an unmoved deduction gives the same double). (6) `seSettle = (healthcare - healthcareSettled) + (totalTax -
  taxSettled)`; `seRealA/B` become the settled pair. The year keeps its draws, paid premium and paid tax (decision 1); the row gains
  `seDeductionA/B`, `healthcareSettled`, `taxSettled` and `seSettlement`, the trace `seSettle`; the kept phase's `seSettle` becomes
  the loop-level `seCarry` (next year's cash, `engine.md`), and next year's seed is the settled pair. The invariant grid in
  `tests/se_health.js` asserts, per settled year, the legal bound, the return's price, the search at the final draws (0 understated:
  before the settlement 422 of 2,310 grid years were, worst $12,699.56), the best candidate, the identity and the carry; base-pinned
  hashes there pin the unheld households and the held year's paid figures against `d8e3cee`. Nothing is held when the
  step-1 deduction is 0 (the Solo plan took the whole net): the pass falls through to the forced pass as it did before the switch.
  `magiStats.seFixed` / `seAlternative` count the kept phase only, through `seKind` (1 consistent, 2 alternative), like `forced` /
  `unresolved`. `seHeld` and `seKind` are reset at a trial start and carried in `naturalRec` / the trial records with
  `estSeA/B`, so the plan's replays restore them. A new reader of the year's MAGI inside the loop must use `magiBase`, not
  `magiBase0`. **`seOn` (8a):** `buildTaxProfile` sets `profile.seOn = seA > 0 || seB > 0`, and `taxFor` reads the self-employment
  fields (`seNet*`, `sePlanNet*`, `seHealth*`, ...) only when it is true (exact zeros otherwise, no number changes), so EVERY profile
  that reaches `taxFor` must carry `seOn` (the lambda, Roth solver and optimizer literals carry `seOn: false`; a test profile with
  self-employment keys needs `seOn: true`, or the keys are ignored). **Decision 10 (9a):** before the alternative calculation the
  block searches for the consistent deduction (D equal to the deduction the premium at D's MAGI allows, within $1) by bisection, holding the
  pass's draws: the deduction the premium allows falls as D rises, so `g(D) = allowed(D) - D` is decreasing on `[0, step-1 deduction]` and
  has at most one crossing (one search on the total on one return, one per return on two; a return's slot of `seHealthDeduction` reads only
  its own MAGI). Found: held (`seHeld`), counted in `magiStats.seFixed`; not found (a jump in `g`, or a non-monotone `g` below 100% of the
  poverty line in a non-expansion state or with `medicaidWhenEligible` off): section 5.02's alternative calculation for that part, counted in
  `magiStats.seAlternative`. The damped 8-pass iteration alone zigzags across the 400% line just below the band, so without the search the
  year charged a premium up to $11,800 too high (single, $18,000 premium, profits 72,750 to 74,000). **9c (speed):** every E1c term is
  skipped, not added as a zero, for a household without self-employment: `taxFor` tests `seOn` once and builds each self-employment term
  inside `if (seOn)` / `seOn ? ... : ...`; the year loop's `seLive` (`profile.seOn` or a deduction carried in from last year) gates the
  162(l) terms of the pass (`magiBase`, the `estUsed` line, the medical expense, the convergence test, `realizedMagi`); the Solo terms of
  `retirementContributions` are added only when `so !== NO_SOLO`; the stream premium factor and the IRMAA cover bits are computed only when
  `ctx.inputs.incomeSources` is not empty. A new E1c term in a hot path must follow the same rule. Tests: `tests/se_health.js` (Task 9a and 10a blocks),
  `tests/unit/us/tax-caches.test.js`.
  **IRMAA appeal and the lookback's filing status (US, E3).** The household lookback charges on the tiers of the lookback
  return's filing status (`irmaaFilingHistory`, written once per year before `hcArgs`; `irmaaLookbackFiling`: years 0 and 1
  read year 0's status, except an entered prior return from before a married partner's death, which is joint), so a survivor's
  D+1 and D+2 are on the joint tiers. `irmaaAppealTable` (per run; `null` for most runs) records each person's usable events by
  first post-event year E (a main-job retirement, the end of a W-2 or self-employed stream, a married spouse's death; covered:
  the owner, the spouse when married in E; kept for a covered person alive in E and 65 by E+1). In `healthcareCost`, a partner
  on Medicare whose window is open (`irmaaAppealWindow`) and whose normal charge is above 0 is charged the lowest of the normal
  charge, this year's MAGI (the pass's estimate, so it sets `usesMagiEstimate` and converges within `MAGI_ITER_TOL`; `costAt`,
  the forced pass, the 162(l) search and the inherited need adjustment price it unchanged) and, in year E+1, last year's
  realized MAGI; year 0 without entered prior MAGIs is skipped. At Medicare ages the IRMAA Roth-conversion ceiling is finite
  and already sets `estUsed`, so the appeal's own `usesMagiEstimate` matters only where that ceiling is infinite. The year loop keeps `appealYrA/B` (set from `hcOut`, and again
  after the forced pass's `costAt`; never read from `lastCost`) for the row's `irmaaAppealYearA/B` / `irmaaAppealKindA/B`, and
  `inYrA/B` for the cliff plan, whose IRMAA lines sit on this year's edges (growth 1, per return through
  `c.irmaaGrowthA/B`) in a year with an in-year candidate. The plan's `irmaaAt`, lines and `irmaaChecks` use this year's
  filing status (the return SSA will read). Test: `tests/irmaa_appeal.js`.
  Test: `tests/aca_magi_iteration.js`. Test: `tests/unit/us/irmaa-magi.test.js` (Vitest, in `npm test`). See `docs/reference.md`.
