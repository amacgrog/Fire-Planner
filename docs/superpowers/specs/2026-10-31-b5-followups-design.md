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
  `'b10'..'b35'` candidates already use the realized `drawTrad`: unchanged, except one (my call): the `'b<pct>'` candidate whose
  `pct` is the bracket the year's fill used (the plan's bracket, the override's, or the setting) is not offered. After S1 it is the
  same fill priced at `drawTrad` instead of `estTrad`, so it differs from the bracket target only by the convergence error and
  would get past `convOffered`'s $1 test as a near-duplicate, adding sized phases and `apply` runs for nothing. This can move
  `choose` results; those movers go in S1's table with this cause.
- The comment above `solveRothConversionTop` ("calls with 0 are the same doubles as before") is rewritten: the plain path no longer
  passes 0 (a year with `estTrad === 0` still gives the same doubles).
- What is "the draw": `estTrad` is the discretionary traditional draw estimate (spending, tax and premium paid from traditional).
  Before writing code the builder confirms from `run-projection.js` that the RMD, the 72(t) payments and the inherited last-resort
  estimate are already in `profile.otherA/B` (or `inhEstA/B`) at the conversion block, so nothing is counted twice or left out, and
  states the finding in `cliff-plan.md`.
- **The MAGI iteration.** The conversion now moves with `estTrad` inside a year's passes (a larger draw gives a smaller conversion,
  so less tax, so a smaller realized draw: a damping feedback, the same the sized path already has). No new mutable: the conversion is
  recomputed each pass from the pass's estimates, as today. The builder measures `magiStats` (forced and unresolved years) on the US
  snapshot scenarios and the `conversion_sizing` grid before and after, and records both in the notes. *My call:* the gate is "no
  increase in unresolved years; any increase in forced years reported with the households named".
- Movers: many, in years under the ACA line too (any conversion year with a traditional draw). It is an intended behavior change:
  `npm run snapshot:update` only after the owner has seen the movers table (section 5).
- Test (Vitest, new, `tests/unit/us/conversion-fill-draw.test.js`): a $190k-draw MFJ year with a 10% bracket converts 0; a 24% fill
  converts only the room left in the 24% bracket above the draw (a hand-computed figure); a year with no draw converts what it
  converts today (a comparison of two calls in one process).

### 4.2 S2: "convert nothing" in the whole-run shortlist (A2)

- First, a measurement on S1's tree **with `9ab5cad`'s ceiling change applied in a scratch build** (my call: on S1's tree alone
  the ACA brake still holds the motivating years at $0, so the count would say nothing about them): on the US snapshot scenarios with the guard on and on `tests/solver_scan.js --sizing
  --conv-only`, count the years where `choose`'s per-year winner is `'none'` while the kept plan's `apply` run converts more than $0
  in that year. Recorded in the notes either way.
- If the count is 0, S2 closes as that recorded measurement, with no code and no PR of its own (the figures go in S3's notes). *My
  call*, since the analysis lists A2 as optional and S1 may remove the cases.
- Otherwise: `'none'` becomes eligible for a year's shortlist entry. The entry stays one per age (the best-scoring candidate other
  than the bracket target, the bridge's drops excluded, ties to the earlier in the scan order, as today), so the pass's run count
  and `CONV_RUN_BUDGET` (24) are unchanged in kind; a year whose only candidate better than the others is `'none'` now has an entry
  where it had none, so the shortlist can grow (inside the budget). `plan.conv` already accepts `'none'` and `resolveConvTarget` gives
  it 0; `greedyAccepts` and `bracketCandidateBetter` still guard each acceptance, so the pass never brings a depletion or first home
  draw earlier on the planning's own measure. `report.sized.convIntents.none` can now be above 0, and `cliff-plan.md`'s "`none` is
  always 0" goes.
- **Replace or add (my call): add.** A year keeps today's entry unchanged; when that year's per-year winner is `'none'` (it beat
  the bracket target by more than $1, `pickConvTarget`), `'none'` is added as a second entry for that age, tried after the first.
  So no proposal made today is dropped, households where `'none'` does not win the year do not move, and the shortlist grows only by
  the ages where `'none'` wins. Each entry costs one `apply` run inside `CONV_RUN_BUDGET`; the order of ages stays ascending.
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
  a second two-regime map for the iteration (`magi-iteration.md`). Measured as in S1 (`magiStats` forced and unresolved, same sets),
  with the same gate.
- `us-health.md`'s "`conversionMagiCeiling` is unchanged" line and the guard's comment in `roth-conversion.js` are rewritten (the WIP's
  comment text is the starting point).
- The `tests/conversion_sizing.js` keep-count floor (D) lands here, once the numbers have settled: the floor is the count measured
  at S3's tip, minus a margin the builder states (*my call:* 10% of it, rounded down).

### 4.4 S4: the bracket card says why every bracket gives the same result (A4), and the `cliffChoice` test (D)

- The card already names an override of the setting by the plan's bracket (`annotateRothOptimizer`,
  `src/us/ui/results/roth-optimizer.js`: "already uses the X% bracket (not your Y% setting)", the "(your setting)" row label). What it
  does not say is why its rows can all be the same. That is what the owner saw on Dana and Chris before any fix: the plan kept the
  setting, and the ACA line capped every bracket's conversion at the same ~$31k at 59-61.
- **The note (owner, 2026-10-31: a one-line note).** When every row of the card's table has the same conversions (so the same
  lifetime tax, end value and run-out), one line under the table names the limit that holds them all and the ages, for example
  "Every bracket converts the same here: the ACA 400% line caps each year's conversion at 59-61." The limit comes from the run's
  rows (which ceiling bound the conversion in each converting year: the ACA line, an IRMAA tier, the convertible balance, or
  sizing's own target). If the rows do not say which ceiling bound, the engine records it on the row (a small field, set only in a
  conversion year, the same way `convChoice` is); the builder says which in the notes. With mixed causes, the line names the most
  frequent one and says "mostly". No note when the rows differ. The light render dims it as it dims the card.
- The `cliffChoice` ("filled to" / "stayed under") branch of the conversion schedule's why column gets a test: the builder searches
  the gap cases and the scan grid on S3's tree for a household with such a row; if none exists, a Vitest case drives the row
  formatting with a constructed row, and the notes say so.
- A Playwright check (`test_conversion_schedule.js` extended, or a new root `test_*.js`) that the line shows for an overriding plan
  and is absent when the plan keeps the setting, plus the 390x844 overflow check.

## 5. Gates for every PR

- `npm test` green (it builds). `npm run test:unit`, and `npx vitest run --sequence.shuffle` for every new suite, run alone and
  shuffled; a new suite that compares engine output runs on Node 22 and Node 24.
- **Snapshots:** `tests/snapshot.js` exact, or a movers table shown to the owner *before* `npm run snapshot:update`: each mover with
  its scenario, run-out age before -> after, first home draw before -> after, end value before -> after, and a cause. The commit that
  updates the baselines says it is an intended behavior change. `tests/plan_off_anchor.js` and `tests/snapshot_ui.js` the same way.
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
  `us-health.md` (the ceiling), `README.md` (what a bracket setting means; the card line), `docs/architecture/test-inventory.md` (new
  tests). `docs/reference.md` is not edited (batch-plan rule). The bracket field's info bubble copy is checked against the new
  behavior in S1.

## 6. Left to the builder

The exact signature order of `solveRothConversion`'s new argument; the Vitest households for S2 and S4; the card line's final copy
within the wording above; which root Playwright script carries S4's check.

## 7. Calls I made (for the owner to check)

- S2 is measured on S1 plus the WIP ceiling in a scratch build, and may close as a measurement only (section 4.2).
- `'none'` is added beside a year's existing shortlist entry, never in place of it (section 4.2).
- `choose` no longer offers the `'b<pct>'` candidate that equals the year's own fill (section 4.1).
- The MAGI-iteration gate: no more unresolved years; more forced years reported, not blocking (sections 4.1, 4.3).
- The `conversion_sizing` keep floor at S3's count less 10% (section 4.3).
- A4 ships last, as its own PR, so its copy describes the final behavior.
- The fixture's path, `tests/fixtures/dana-and-chris.json` (committed with this spec).

Owner answers (2026-10-31): the triage in section 2; the fixture as saved; an earlier run-out is a movers-table row the owner accepts
or rejects, not an automatic redesign (section 5); A4 is a one-line note (section 4.4).
