# Batch 5 follow-ups: the bracket fill counts the year's draw, and the ACA line over the line (design)

Date: 2026-10-31. US planner only (Canada is untouched). Base: `main` at `d67ebd3` (PR #64 merged; US V150, Canada V67).

Sources: the follow-ups list after the **Status (2026-10-30)** paragraph of "Batch 5: optimizer" in `docs/next-batches-plan.md`;
the analysis `docs/superpowers/reports/2026-10-31-aca-cap-over-line-analysis.md` and the parked WIP `9ab5cad` (both on branch
`claude/aca-cap-over-line`, not merged); the "Batch 5 step 5: results" notes and their "Open items from the reviews";
`docs/architecture/cliff-plan.md`, `engine.md`, `magi-iteration.md`, `us-health.md`.

## 1. Why

The owner tested a couple (Dana and Chris) and found that the bracket search's rows were the same at every bracket. The
analysis found two linked faults behind it:

1. **The plain bracket fill ignores the year's own traditional draw.** `solveRothConversion`
   (`src/us/core/withdrawals/roth-conversion.js`) calls `solveRothConversionTop(..., bracketPct, 0)`: it fills the year's *other*
   income to the top of the bracket as if the discretionary traditional draw were not there. The sized path (`resolveConvTarget`'s
   `bracketTop`, `run-projection.js`) already passes `estTrad` as `drawBelow`. So in a year that draws about $180k from traditional,
   a "10% fill" still converts about $69k, and that conversion is taxed at 22-24% at the margin (federal tax at 60 in
   `std R rothConv+aca+live`: $17.9k -> $37.5k on $69.4k, 28%). The tax is mostly prepaid, not saved (lifetime tax 263k vs 262k),
   and leaves the portfolio 20+ years early.
2. **The ACA 400% line holds a year already over it at $0.** `conversionMagiCeiling` caps a conversion at `Math.max(0, line - MAGI)`
   even when the pre-conversion MAGI is already over the line, where the premium credit is already lost. No document states the $0
   as intended (the IRMAA ceiling beside it keeps a year in its current tier instead). It is an accidental brake, and it was the
   only thing stopping fault 1 from showing in those years. Lifting it alone (`9ab5cad`) moves 54 of 541 US snapshots, mixed
   (2 deplete earlier, 5 later), fails 13 pinned Vitest checks, and moves `std R rothConv+aca+live`'s run-out from 96 to 95 (the owner reported the test
   couple running out at 94 instead of 95 on the WIP; the analysis could not reproduce it, since the couple's full inputs are not
   in the repo).

Per-year sizing already scores converting nothing better in those years (-5,988 and -5,125 at 60 and 61), but the whole-run
shortlist (`cliffConvShortlist`) never holds `'none'`, so `apply` converts anyway.

**The test couple** is now in the repo: `tests/fixtures/dana-and-chris.json`, the owner's saved scenario file exactly as saved
(MA, 58/56, retiring 59/57, $1.19M traditional 401(k), $260k taxable, spending $78k, conversions 59-67 at 22%, ACA on, the mix
and the guard on, life 100). The owner changed its Social Security figures on purpose, and its `k401Type: "roth"` is known to
differ from the real couple; the fixture stays as saved, since that is the run where the owner saw the identical rows and the
95 -> 94 (owner, 2026-10-31). Every PR runs it before and after (load through the scenario loader or `w.setState(file.state)`)
and records its run-out age, its conversions by age and the bracket card's rows in the notes.

Success: a bracket setting means what it says, "fill ordinary income, the year's draws included, to the top of this bracket";
over-the-line years are no longer held at $0 by accident; and no household runs out earlier than today without the owner having
seen and accepted why.

## 2. Scope (triaged with the owner, 2026-10-31)

| Group | Items | Decision |
|---|---|---|
| A. The ACA and bracket-fill pair | A1 the fill counts the draw; A2 `'none'` in the whole-run shortlist; A3 the over-the-line rule; A4 the bracket card says when the plan's bracket overrides the setting | **Build**, in that order |
| B. Optimize speed | the worst household's lifetimeCost over 10 s; a sizing-only entry point for sized trials; cheaper sizing beyond `k`; no de-duplication of a sized trial against base | Later |
| C. Smaller correctness questions (step 5 spec section 7) | lambda's moved-sample correction (F); the `convScore` tie at the bracket top; the R5 M3 survivor bridge need; the unsized forced-pick tie; the reserve target net of guaranteed income (V2); the bucket mode's buy-year flaw | Later |
| D. Test gaps | a floor for `tests/conversion_sizing.js`'s keep count; the untested `cliffChoice` branch of the conversion schedule's why column | **Build**, inside the A PRs |
| E, F. Cleanup and re-measuring | shrinking the `mult` grid (needs a stored-plan migration); the Node 24 / Chromium 141 re-measure; the Node-vs-cloud timing gap | Drop (stay on the list as notes) |
| G. Settled | stored plans saved before step 5 (accepted 2026-10-29); Canada (Batch 4B) | No work |

The B, C, E and F items stay in the follow-ups list of `docs/next-batches-plan.md`, marked "later" or "dropped" with today's date.

## 3. Goals, non-goals, anti-goals

Goals:
- The plain fill and every path that calls it (the flat bracket, the plan's searched bracket, the bracket card's trials, the sized
  path's fallback, `choose`'s bracket target) count the year's estimated discretionary traditional draw below the conversion.
- The whole-run sizing pass can turn a year's conversion off when converting nothing scores better.
- `conversionMagiCeiling`'s ACA line caps a conversion only while the pre-conversion MAGI is at or under the line (household and
  per-return branches), as in `9ab5cad`.
- The bracket card tells the user when the plan's bracket, not their setting, sets the conversions.

Non-goals: Canada; the IRMAA ceiling (unchanged); the stay-under logic of the cliff guard; lambda, `convScore` and the
multiplier; Optimize's speed; any new user setting.

Anti-goals (a failure even if it works):
- A household that runs out of money, or first draws on the house, earlier than on today's `main` with no row in a movers table the
  owner has seen.
- Planning or a plain run slower than the step 5 gates allow.
- A snapshot baseline changed before the owner has seen the movers.
- A second "two regimes" map in the MAGI iteration that leaves more years forced or unresolved without anyone measuring it.

## 4. Design

Four PRs, one per sub-step, each on its own branch from the previous one's merge into `main`, each green on `npm test` and each
with its own version badge bump (US only).

### 4.1 S1: the plain fill counts the year's draw (A1)

- `solveRothConversion(ctx, profile, maxAvailable, yearIndex, ageKey)` takes the draw below the conversion as a new last argument,
  `drawBelow`, and passes it to `solveRothConversionTop` instead of the literal 0. Its two call sites in `run-projection.js` (the
  sized path's `-1` fallback and the plain branch) pass the pass's `estTrad`, the same estimate the sized path's `bracketTop` already
  passes. The test-only `rothAmountByAge` and the `rothBracketByAge` override keep their meaning (the override picks the bracket; the
  fill under it now counts the draw too).
- `choose`'s bracket target (target `null`, the phase's own `conversionAmount`) follows, since it is the plain fill's amount. Its
  `'b10'..'b35'` candidates already use the realized `drawTrad`: unchanged. The `'b<pct>'` candidate at the year's own bracket stays offered (review H2): the
  bracket target is capped by `magiSafeRoom` and the phased clamp, the candidate only by the balance, so where a line binds it is a
  different option ("cross the line and fill"), the one sizing is there to price; where the two really are equal, `convOffered`'s $1
  test (`conversion-targets.js`) already declines it.
- The comment above `solveRothConversionTop` ("calls with 0 are the same doubles as before") is rewritten: the plain path no longer
  passes 0 (a year with `estTrad === 0` still gives the same doubles).
- What is "the draw": `estTrad` is the discretionary traditional draw estimate (spending, tax and premium paid from traditional).
  Before writing code the builder confirms from `run-projection.js` that the RMD, the 72(t) payments and the inherited last-resort
  estimate are already in `profile.otherA/B` (or `inhEstA/B`) at the conversion block, so nothing is counted twice or left out, and
  states the finding in `cliff-plan.md`. (The review read it from the code: RMDs and 72(t) payments are in `otherA/B`, the inherited
  estimate is read separately, so `estTrad` is purely discretionary; two-return and survivor years are consistent; the phased clamp
  needs no change. The builder re-checks it on S1's base.)
- **The pass loop must run (review H1).** A year's passes repeat only when `estUsed` is set (`run-projection.js` ~1158), and today
  nothing sets it for the plain fill. Without it, a converting year with no ACA premium and no finite MAGI limit would run one pass
  and fill against last year's draw (`estTrad = prevDiscTraditional`), or 0 in the first retired year. So the plain branch (and the
  `-1` fallback) set `estUsed = true` whenever the fill runs with a non-zero bracket and a convertible balance above 0, whatever
  `estTrad` is (a `estTrad !== 0` test would leave the first retired year, seeded at 0, on one pass; plan review). A year whose
  draw does not move converges in one pass anyway, so this costs nothing there. This adds passes in years
  that ran one before: a bench cost, measured against the gates (section 5).
- **Convergence (plan review C1; owner decision 2026-10-31: option A, a secant step).** With the draw counted, the draw and the
  conversion depend on each other, and each pass closes only about two-thirds of the gap; from pass 3 the update is halved (kept for
  the ACA cliff). Measured on a minimal S1: every converting year with ACA off ran all 8 passes (`MAGI_ITER_MAX`) where `main` runs 1,
  and the first retired year ended $266 over the bracket top; `magiStats` saw none of it (its counts sit behind `usesMagiEstimate`).
  The fix: in a year whose conversion read the draw (`convReadEst`) and with no ACA premium (`!usesMagiEstimate`), from the second
  pass on, `estTrad` moves to the fixed point of the line through the last two (estimate, realized) pairs instead of the damped
  step; the other estimates take the plain undamped step there. Every year whose conversion did not read the draw keeps today's
  update exactly. Expected: 3-4 passes, within `MAGI_ITER_TOL` ($1).
  **Amended (Task 2c; owner decision 2026-10-31: option Y).** Measured, the secant alone added 8-pass years main did not have: in a
  year whose traditional total is fixed (a smooth draw, or a draw held to a MAGI cap) the draw takes back each dollar the fill gives
  up, the line's slope is 1, it has no fixed point, and rounding sent the step to 0 or $1e8 (or the plain step crawled); and ACA
  years, kept on the damped step, crawled the same way. So: (1) *the kink jump*: a slope within 1e-3 of 1, or a line fixed point
  past the conversion's kink (where it would reach 0, `estTrad + conversion`, or the convertible balance, `estTrad - (convertible -
  conversion)`), steps to that kink (at least the plain step) and drops the pair, so the next pass takes the plain step, exact on
  the flat side; a slope above 1 + 1e-3 keeps the plain step. (2) *ACA years whose fill reads the draw*: the damped step, except the
  kink jump on a unit slope (the MAGI estimate does not move along it) and the clamped secant while the two paired passes were
  charged the same premium (the pass's charged `healthcare`, exactly equal, `===`, to the previous pass's: no step of the ACA
  schedule crossed between them). (3) *The stale pair*: a pass whose conversion did not read the draw clears the pair. Measured
  (`magistats.js`; years at the 8-pass cap / new against `main` / forced / unresolved):

  | Build | Snapshot (541) | `conversion_sizing` grid (384) |
  |---|---|---|
  | `main` | 194 / - / 50 / 2 | 1,114 / - / 84 / 8 |
  | S1 secant only (`31354f0`) | 90 / 2 / 50 / 2 | 396 / 17 / 92 / 5 |
  | + the kink jump (`629763a`) | 88 / 0 / 50 / 2 | 386 / 11 / 92 / 5 |
  | + option Y | 72 / 0 / 35 / 0 | 347 / 9 / 62 / 1 |

  The 9 left are not the fill or the step (an ACA premium loop in years that now convert nothing, a gains drift, and stay-under
  trial passes counted with the natural ones). `bench_solver`'s CA scenario (22% to 74): with option Y the bracket search keeps 22%
  as on `main` (56 / 57 passes, standard / bench path); with the secant only it kept 10% (62 / 70, an 8-pass year at 52). Passes per converting year and years at the cap are
  measured (they are not in `magiStats`); gate: no year at the cap that was not there on `main`, and the bench gates.
  Rejected: (B) stopping early and accepting a few hundred to a few thousand dollars off the bracket top; (C) solving the conversion
  and the draw jointly inside the year.
- **The IRMAA tier within a year (owner decision 2026-11-01; Fable audit finding 3, `fable-path-report.md`).** The conversion
  ceiling's IRMAA cap is "the top of the tier the year already sits in", read from `preConvMagi`. Its `estGain` is the previous pass's
  realized gains, which include the sale that paid the previous conversion's tax, so a seed a few times the margin too low crosses a
  tier line on the first step, the fill converts up to the next tier and every later pass confirms it (measured: `single 52; 500k;
  2000k; 60k` at 68, $34,349 to the next tier where main converts $35). Damping cannot reach that first step (rejected: Task 2d's
  damping, 90f9e8b, which passed the tier case only by its seed path and tripled the converting cap years; and the owner's narrower
  guard, Task 2e, which fails the tier case). The rule: within a year and phase the IRMAA line the ceiling caps at never moves up from
  the lowest line a pass computed (household, and per return in two-return years); a pass that converts nothing measures the year's
  no-conversion MAGI, and if that is over the held line the hold is released (also on a pass that would otherwise end the phase
  converged: it then runs one more pass). The holds are carried like the estimates through every saved, restored and re-seeded
  pass; a structural guard and a replay check prove no site is missed (plan Task 2f). The non-draw estimates in the secant years go
  back to the full step.
- **The forced-pick tie (review M3).** The forced pick gives a tie to the smallest-drift pass only in sized years (`run-projection.js`
  ~1307), because only there did the conversion move against the draw. After S1 every converting year does, so the tie rule extends
  to every year whose conversion read `estTrad` (my call). The unsized forced-pick tie in the follow-ups list (11 of 60 years) is
  settled by this, and its bullet is marked so.
- **The MAGI iteration.** The conversion now moves with `estTrad` inside a year's passes (a larger draw gives a smaller conversion,
  so less tax, so a smaller realized draw: a damping feedback, the same the sized path already has). No new mutable: the conversion is
  recomputed each pass from the pass's estimates, as today. The builder measures `magiStats` (forced and unresolved years) on the US
  snapshot scenarios and the `conversion_sizing` grid before and after, and records both in the notes. *My call:* the gate is "no
  increase in unresolved years; any increase in forced years reported with the households named".
- Movers: many, in years under the ACA line too (any conversion year with a traditional draw). It is an intended behavior change:
  `npm run snapshot:update` only after the owner has seen the movers table (section 5).
- Tests (Vitest, new, `tests/unit/us/conversion-fill-draw.test.js`): direct calls of the fill: a $190k-draw MFJ year with a 10%
  bracket converts 0; a 24% fill converts only the room left in the 24% bracket above the draw (a hand-computed figure); a year with
  no draw converts what it converts today (a comparison of two calls in one process). And an engine-level case, which a direct call
  cannot cover (review H1): a run whose converting year has no ACA premium and no finite limit, where the row's conversion equals the
  fill computed at the row's realized discretionary traditional draw (within the iteration's tolerance, written out), not at last
  year's.
- **Before S1's baselines are updated** (review L4): one scratch build of S1 plus `9ab5cad`, compared with `tests/snapshot.js
  --compare`, so the owner sees the combined direction before the first baseline moves. Recorded in S1's notes.

### 4.2 S2: "convert nothing" in the whole-run shortlist (A2)

- First, a measurement on S1's tree **with `9ab5cad`'s ceiling change applied in a scratch build** (my call: on S1's tree alone
  the ACA brake still holds the motivating years at $0, so the count would say nothing about them): on the US snapshot scenarios with the guard on and on `tests/solver_scan.js --sizing
  --conv-only`, count the years where `choose`'s per-year winner is `'none'` while the kept plan's `apply` run converts more than $0
  in that year. Recorded in the notes either way.
- If the count is 0, S2 closes as that recorded measurement, with no code and no PR of its own (the figures go in S3's notes). *My
  call*, since the analysis lists A2 as optional and S1 may remove the cases.
- Otherwise, as below. `plan.conv` already accepts `'none'` and `resolveConvTarget` gives
  it 0; `greedyAccepts` and `bracketCandidateBetter` still guard each acceptance, so the pass never brings a depletion or first home
  draw earlier on the planning's own measure. `report.sized.convIntents.none` can now be above 0, and `cliff-plan.md`'s "`none` is
  always 0" goes.
- **Replace or add (my call): add, after today's entries (review H3).** `convShortlist` keeps today's shape (one target per age,
  never `'none'`). Beside it the run returns a second list, `cliffConvNone` (non-enumerable, like `cliffConvShortlist`): the ages,
  ascending, whose per-year winner is `'none'` (it beat the bracket target by more than $1, `pickConvTarget`). The whole-run pass
  walks today's shortlist exactly as now, then, with the budget left, the `'none'` ages (each adds `'none'` at that age to cur's
  conv for one `apply` run, accepted only by `greedyAccepts`). So today's proposals and their budget are untouched: a household
  whose shortlist used the whole budget, or with no `'none'` winner, does not move. `report.sized` gains `noneProposed` and
  `noneTried`. `conversion-choose.test.js`'s checks that the shortlist holds one target per age and never `'none'` (~323-324) stay
  true; a new check pins `cliffConvNone`.
- Test: a Vitest case on the `std R rothConv+aca+live` household (or a smaller one with the same shape) where the kept plan's
  `conv` holds `'none'` at an age and that age's row converts 0.

### 4.3 S3: the ACA line caps only a year at or under it (A3)

- `9ab5cad`'s change, rebased: in `conversionMagiCeiling`, the household branch sets `magiCeiling` to the line only when
  `preConvMagi <= line`, and the per-return `room` uses `allowAca` (Infinity for a return already over its own line). Its test
  `tests/unit/us/conversion-aca-ceiling.test.js` comes with it.
- The 13 pinned Vitest checks the WIP failed (`conversion-apply`, `conversion-choose`, `conversion-plan`, `plan-search`,
  `gains-capped`, `order-lever`, `split-order-floor`, `two-return-split`) are re-pinned, each with a one-line stated reason in the
  test; some may already have moved in S1 or S2.
- **The second jump at the line.** The ceiling now jumps between the line and Infinity as the pre-conversion MAGI crosses the line,
  a second two-regime map for the iteration (`magi-iteration.md`). After S1 the conversion itself jumps only between 0 and the
  bracket fill's room above the draw, not between 0 and an uncapped amount (review L3): why S3 after S1 is safer than the WIP alone. Measured as in S1 (`magiStats` forced and unresolved, same sets),
  with the same gate.
- `us-health.md`'s "`conversionMagiCeiling` is unchanged" line and the guard's comment in `roth-conversion.js` are rewritten (the WIP's
  comment text is the starting point).
- The `tests/conversion_sizing.js` keep-count floor (D) lands here, once the numbers have settled: the floor is the count measured
  at S3's tip, minus a margin the builder states (*my call:* 10% of it, rounded down).

### 4.4 S4: the bracket card says which limit holds the conversions (A4), and the `cliffChoice` test (D)

- The card already names an override of the setting by the plan's bracket (`annotateRothOptimizer`,
  `src/us/ui/results/roth-optimizer.js`: "already uses the X% bracket (not your Y% setting)", the "(your setting)" row label). What it
  does not say is why its rows can be all but the same. On Dana and Chris today (the review's run of the fixture on `857ef9d`): the plan
  keeps the 22% setting; it converts $20k at 59, $0 at 60-61 (held by the ACA brake, fault 2), $0 at 62-66 ("stayed under ACA 400%
  line"), and $79k at 67, on top of a $135k draw (fault 1 already shows on `main`). The rows are nearly but not exactly equal (the
  10% row's end value $336,052 against $336,892). (The 62-66 rows are stay-under years, which convert $0 and so never appear in the conversion schedule; plan review C2.)
- **The note (owner, 2026-10-31: a one-line note; trigger and wording approved the same day, after review M1).** It shows
  whenever, in the dashboard's own run (`selected`), a limit other than the bracket held at least one conversion-window year's
  conversion below the bracket fill (a year held at $0 counts). One line under the table names the limit and the ages, for example
  "The ACA 400% line holds your conversions at 60-66, so the bracket setting changes little here." With two or more limits, the line
  names the one that held the most years and adds "mostly". No note when no year was held. The rows need not be identical (on the
  fixture they differ by under $1k), so the trigger does not compare rows.
- **The row field (required, review M1).** No row field today says which limit bound a conversion, and the card keeps no per-year
  conversions. The engine records it on the kept pass of a conversion-window year whose conversion is below the bracket fill: a new
  row field `convHeldBy` (`'aca'`, `'irmaa'`, `'stayUnder'` for a phased stay-under year, `'sized'` for a sizing target, `'balance'`;
  absent when the fill was not held), set only in such a year, the way `convChoice` is. It is read by the card only; no engine path
  reads it. Each value maps to one phrase in the card's copy. The light render dims the line as it dims the card.
- The `cliffChoice` branch of the conversion schedule's why column gets a test. Only "Filled to ..." can appear there: a stay-under
  year skips the conversion block and converts $0, and the schedule lists only rows converting at least $1 (plan review C2). The
  builder finds a phased fill year that converts (the gap cases, the scan grid, or the fixture on S3's tree), else a constructed row
  in a Vitest case, and the notes say so.
- A Vitest check of `convHeldBy` on the fixture's rows, and a Playwright check (`test_conversion_schedule.js` extended, or a new root
  `test_*.js`) that the line shows on the fixture and is absent for a household whose conversions no limit holds, plus the 390x844
  overflow check.

## 5. Gates for every PR

- `npm test` green (it builds). `npm run test:unit`, and `npx vitest run --sequence.shuffle` for every new suite, run alone and
  shuffled; a new suite that compares engine output runs on Node 22 and Node 24.
- **Snapshots:** `tests/snapshot.js` exact, or a movers table shown to the owner *before* `npm run snapshot:update`: each mover with
  its scenario, run-out age before -> after, first home draw before -> after, end value before -> after, and a cause. The commit that
  updates the baselines says it is an intended behavior change. `tests/plan_off_anchor.js` and `tests/snapshot_ui.js` the same way; the baseline commit named in `plan_off_anchor.js`'s header
  comment moves with S1 (review L2).
- **Per-household comparison (review M5).** `tests/snapshot.js` has `--dump` / `--compare`; `tests/conversion_sizing.js` prints only
  totals and `tests/solver_scan.js` has no compare. S1 adds a `--dump <file>` option to both (per household: id, run-out age, first
  home draw age, end value) and a small compare, test tooling only. The WIP comparison for S3 uses dumps from a scratch checkout of
  `9ab5cad`.
- **Never earlier:** for each PR, against its parent and against `main` at `d67ebd3`, no snapshot scenario, `conversion_sizing`
  household or `solver_scan` household depletes or first draws on the house earlier, unless that row is in the movers table and the
  owner has accepted it (owner, 2026-10-31: an earlier run-out is judged row by row in the table; it does not by itself send the
  sub-step back for a redesign, though the owner may reject a row and ask for one). For S3 also against the WIP (`9ab5cad`'s figures in the analysis).
- **Benches** (the step 5 gates, against the PR's parent, on one quiet machine, the environment recorded): `tests/bench_runs_interleaved.js
  --warm-analysis` +5% (noise caveat as in step 5); `tests/bench_solver.js` +30%; `tests/bench_planning.js` 250 ms toggle off, 350 ms
  toggle on; `tests/conversion_sizing.js` under 60 s; `tests/bench_optimize.js` +40%. `tests/yardstick.mjs --jobs 2` and
  `tests/solver_scan.js --sizing --conv-only` before and after, with their deltas in the notes.
- `tests/engine_purity.js`, `tests/cliff_guard.js`: green (no new module-level mutable is expected; one would be registered in
  `tests/engine-purity.json`).
- **Version badge:** US V151 (S1), V152 (S2, if it ships code), then the next number for S3 and S4. Canada stays V67.
- **Branching:** S1 branches from `origin/main` (the local `main` may be stale); each later PR from `origin/main` after the
  previous PR is merged.
- **Docs in the same commit:** the results go in a new "Batch 5 follow-ups: results" section of `docs/next-batches-plan.md` (per PR:
  commits, movers table, `magiStats`, benches); the follow-ups bullet is marked done as each part lands; `cliff-plan.md`
  (the fill's `drawBelow`, the shortlist's `'none'`), `magi-iteration.md` (the conversion's dependence on `estTrad`, the second jump),
  `engine.md` (its "calls with 0 are the same doubles" note, ~276-279, review L1), `us-health.md` (the ceiling), `README.md` (what a bracket setting means; the card line), `docs/architecture/test-inventory.md` (new
  tests). `docs/reference.md` is not edited (batch-plan rule). The bracket field's info bubble copy is checked against the new
  behavior in S1.

### 4.5 Stored plans

Plans applied before S1 (V140-V150) carry on silently under the new fill: their fingerprint covers the inputs only, so the card
still says "Applied plan in use." and the plan's targets run under the new rule. Owner, 2026-10-31: accepted, no format bump and no
compatibility code (no one uses a stored plan yet; review M4). Recorded in the notes.

## 6. Left to the builder

The exact signature order of `solveRothConversion`'s new argument; the Vitest households for S2 and S4; the card line's final copy
within the wording above; which root Playwright script carries S4's check.

## 7. Calls I made (for the owner to check)

- S2 is measured on S1 plus the WIP ceiling in a scratch build, and may close as a measurement only (section 4.2).
- `'none'` is added beside a year's existing shortlist entry, never in place of it (section 4.2).
- The secant step's scope: only years whose conversion read the draw and with no ACA premium (section 4.1). *Superseded by option Y (next line).*
- Task 2c (owner, 2026-10-31, option Y): the kink jump in every year whose fill reads the draw, the clamped secant in ACA years while the paired passes were charged the same premium (exact `===`), and the stale-pair reset (section 4.1).
- Task 2f (owner, 2026-11-01): the IRMAA tier holds within a year, released by a pass that converts nothing (section 4.1); replaces Task 2d's damping (90f9e8b).
- The plain fill sets `estUsed`, and the forced-pick tie extends to every year whose conversion read `estTrad` (section 4.1).
- S2's `'none'` ages are a separate list walked after today's shortlist (section 4.2).
- `--dump` and a compare added to `conversion_sizing.js` and `solver_scan.js` in S1 (section 5).
- The MAGI-iteration gate: no more unresolved years; more forced years reported, not blocking (sections 4.1, 4.3).
- The `conversion_sizing` keep floor at S3's count less 10% (section 4.3).
- A4 ships last, as its own PR, so its copy describes the final behavior.
- The fixture's path, `tests/fixtures/dana-and-chris.json` (committed with this spec).

Owner answers (2026-10-31): the triage in section 2; the fixture as saved; an earlier run-out is a movers-table row the owner accepts
or rejects, not an automatic redesign (section 5); A4 is a one-line note, shown whenever a limit held a conversion, with the
`convHeldBy` row field (section 4.4); stored plans carry on silently (section 4.5); convergence by a secant step, option A (section 4.1).

Independent review: Opus with a Fable agent, report `docs/superpowers/reports/2026-10-31-b5-followups-spec-review.md` on branch
`claude/b5-followups-spec-review` (findings H1-H3, M1-M5, L1-L4, all settled above).
