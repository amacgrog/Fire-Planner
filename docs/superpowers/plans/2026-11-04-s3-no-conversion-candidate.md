# Found by S3, item 3: the no-conversion candidate (US V156; Canada untouched)

The follow-up recorded in `docs/next-batches-plan.md` ("Found by S3" item 3, "The all-none candidate at family selection", PR 3
ruling 31, Fable's alternative B). Branch `claude/bold-bassi-e65bb6`, from `origin/main` `8c1ff2d` (PR #71, US V155).

## The problem (recap)

S3 (PR #68) lets a year over the ACA 400% line convert. In a few households the stage-0 family selection then keeps a family of
stay-unders (`all`) only because they suppress those over-the-line conversions, and the sizing pass that starts from that base
cannot get back to main's plan. The rows (scan grid, `2fc43c7` = main before S3 against `6bab805` = S3):

| Row | main | S3 / today |
|---|---|---|
| default `single 62; 500k; 2000k; 130k`, elections none / rule55 / sepp | never / 92, 326,510 | never / 92, 299,408 (-8.30%) |
| default `HoH 58; 500k; 2000k; 130k; rule55` | 91 / 87 | 91 / 86 |
| smooth `HoH 58; 500k; 2000k; 130k; rule55` | 91 / 86 | 90 / 86 |

## What was measured first (scratch, 2026-11-04, Node v24.21.0)

Baseline = this branch's parent `8c1ff2d` (dumps `base-*`). Scratch scripts and dumps are in the session notes folder's
`s3-item3-measurements.md`.

1. **Alternative B as written** (prototype `p1`: at each bracket's stage 0, one `choose` run with `conv: {}` for its
   `cliffConvNone`, then the `none` family with `'none'` at those ages as one more stage-0 candidate; the proposal run memoized for
   the sizing pass). It restores all five rows to main's figures exactly, but on `conversion_sizing`'s 384 rows it makes **4 rows
   earlier than today** (MFJ 52 / 250k+250k / 2000k / 130k none, rule55, sepp: 95 / 89 -> 94 / 88, the rows 8e restored; MFJ 52 /
   300k / 60k sepp home 74 -> 73), 78 rows differ with many end values down, the kept sized plans fall 145 -> 84, and it costs two
   runs per bracket (12 per planning, the `choose` runs with sizing the dear ones). The cause is 8e's lesson again: a candidate that
   competes at stage 0 changes the base the greedy sizing pass starts from, so a household whose pass found a good plan can end on a
   worse one. **Not built.**
2. **Why the rows recover.** Per bracket (`br.mjs`), the `none` family with the proposal's `'none'` ages: for the single 62 household
   every bracket's list is the whole window (62-72), and 326,510 at every bracket; for the HoH 58 rule55 households the brackets whose
   list is the whole window (32, 35; 10 / 12 for smooth) give main's 91 / 87 and 91 / 86, the others not. So what restores the rows
   is the `none` family converting nothing at any window age: one plan, the same at every bracket.
3. **The candidate after the pass** (prototype `p2`, the design below: one `apply` run per planning, tried after the sizing pass,
   kept only by `bracketCandidateBetter` over the final best). Against `8c1ff2d`:
   - `conversion_sizing` (384): 20 rows differ, **0 earlier, 0 down** (17 end values up, the three single 62 rows to 326,510, default
     HoH 58 rule55 home 86 -> 87, i.e. 91 / 87 = main); kept sized plans 145 -> 152.
   - US snapshot (541): **0 differ**.
   - `solver_scan --sizing --conv-only` (960): see the movers table (Task 2).
   - Vitest (US project): no check moves (the one failure is `tax-caches`' known load timeout under the parallel run).
   - A variant that also tries the kept plan's own guard intents / orders / splits with no conversions (`E2`, a second run)
     changed none of the five rows: not built.

## The design

In `computeCliffPlan` (`src/us/core/projection/run-projection.js`), inside `if (sizing && search && sizes)`, after the sizing pass
and the lever fallback (after `sized = pass.report`), before the kept-plan block:

- `noneAll`: `'none'` at every conversion age the sizing pass could size: Partner A's ages from `max(rothConvStartAge, ageA)` to
  `min(rothConvEndAge, ageA + years)`, skipping `convExempt` ages (the loop of `sizingApplies`, shared through a helper
  `sizedConvAges(ctx)`; `sizingApplies` becomes "the guards, then `sizedConvAges(ctx).length > 0`", byte-identical decisions).
- One `apply` run: `makePlan({ bracket: from, bracketFrom: from, mult: useMult, conv: noneAll })` (family `none`, no intents,
  no orders, no splits, the user's own bracket: revision 2, review I3), measured as `measure('none', {}, sim, null, null, noneAll)`;
  skipped when the final best already is that plan (family `none`, no intents, orders or splits, `conv` exactly `noneAll`; review M1).
- It replaces the final best (`pass.best` when the pass is kept, else `best`) only by `bracketCandidateBetter(m, final)`: no earlier
  run-out, no earlier first home draw, and later on either or a score above by max($1, 0.1%). So no row can end earlier or lower
  than today's plan (stronger than the pass's own keep rule, which compares with the unsized base).
- When it is kept it is the plan's best, as a kept sized plan is: appended to `report.candidates`, `keptIndex` names it,
  `keptBracket` becomes the user's bracket and that bracket's `report.brackets` entry is refreshed from it (so the entry shows the
  plan, not that bracket's own selection; `keptBracketOf` is not re-run), `plan.conv` = `noneAll`, `plan.bracket` = `bracketFrom`.
- `report.sized` gains `noConvTried` (false only when skipped) and `noConvKept`, after `offPass` when it is present. **Revision 2
  (review I1, I2):** `kept`, `convIntents` and every other field keep the pass's own figures (so S2 / 8e's invariants, the kept conv's
  size = `accepted + allNoneAges.length`, and `conversion_sizing`'s keep floor, which counts the pass's keeps, are unchanged);
  `noConvKept` says the plan is the candidate instead. `offPass` is unchanged (the candidate runs once, after both passes).
- **The summary (revision 2, review I3; copy for the owner's OK):** with `noConvKept` the conversions clause is one sentence,
  "Conversions: none (tax-aware sizing: not converting does better over the whole plan).", with no bracket clause and no list of
  'none' ages. The bracket card needs nothing: `plan.bracket === bracketFrom`, so `planBracketOverSetting` pins nothing, the user's
  row is the dashboard's run (no conversion) and the other rows their brackets' own runs.

**Why after the pass, not at stage 0** (ruling 1 below): measured, at stage 0 it changes the greedy path (4 rows earlier than today,
many down); after the pass it can only replace the final plan by a better one. **Why only the `none` family**: `E2` adds nothing on
the five rows, and the `none` family with no conversion is the plan that does not depend on the bracket (one run, not one per
bracket). **Why at the kept bracket**: the run converts nothing, so the bracket does not matter to it; the plan carries the kept
bracket so its `bracket` / `bracketFrom` stay those of the search (the summary's bracket clause and the card read them).

**Not in the year loop:** no estimate site, record, replay or snapshot; no module-level mutable (locals of `computeCliffPlan`);
`tests/estimate_sites.js`, `tests/engine-purity.json` and `tests/replay_check.js` unchanged. Canada untouched (US-only module).

**The guarantees.** Never earlier: `bracketCandidateBetter` over the final best. The toggle's guarantee (B0.11.9; review C1): if
the candidate replaces the lever plan it is no earlier on both ages and has no orders or splits. If it does not, toggle off's own
planning may keep it while toggle on keeps a lever plan the partial order does not rank against it (e.g. on 90 / 85, off's sized
plan 88 / 84, the candidate 89 / 86): the guarantee is then held against toggle off's plan before the candidate, as ruling 24's
`leverPassStands` holds it against toggle off's walk plan. Closing it (keep the candidate on toggle on whenever toggle off would and
the lever plan does not stand against it) would let the toggle-on plan run out earlier than today's. **Measured** (`sweep.mjs`, the
768 grid rows planned with the toggle off and on, endValue): 0 rows where toggle on ends earlier than toggle off, on today's tree
and with the candidate under either rule; the open case was never reached (0 of 222 lever plannings). Ruling 6. Optimize: the base planning and the sized re-plannings
run it (they run the pass); the mult trials (`sizing: false`) do not; `rankBetter` sees the planning's result as before. The light
refresh (`search: false`) does not run it (the pass does not run there).

**Cost:** one `apply` run per planning that runs the sizing pass (Optimize: one per sized re-planning). Gates: `bench_planning`
(250 ms off / 350 ms on), `bench_runs_interleaved --warm-analysis --rounds 21` (+5%; the timed runs do not plan, so 0 expected),
`bench_optimize` per planning (+40%), `conversion_sizing` under 60 s.

## Revision 2: the Opus review (2026-11-04) and the added measurements

Findings and what was done: **C1** (the toggle's guarantee): measured, not reached; held as ruling 24 holds it (ruling 6, for the
owner). **I1** (the `kept` / `convIntents` invariants) and **I2** (the keep floor): `kept` and `convIntents` stay the pass's own;
only `noConvKept` reports the candidate. **I3** (a plan that converts nothing naming a bracket): it carries the user's bracket and
the summary has its own sentence. **I4** (measure more): done below and in Task 2. **M1**: the run is skipped when the final plan
already is the candidate (`noConvTried` false). **M2**: `SIZED_KEYS` pins the order. **M3, M4**: in `cliff-plan.md`. **M5**:
`sizedConvAges` is not exported; its comment says why the loop runs to `ageA` plus the longer life. **M6**: `test-inventory.md`
checked in Task 3.

Added measurements (`sweep.mjs`: `computeCliffPlan` in Node on the 768 grid rows, toggle off and on, against `8c1ff2d`):

| Objective, toggle | Differ | Earlier | Later (run-out / home) | Better | Worse |
|---|---|---|---|---|---|
| endValue, off | 26 | 0 | 2 | 24 | 0 |
| endValue, on | 26 | 0 | 2 | 24 | 0 |
| lifetimeCost, off | 4 | 0 | 2 | 2 | 2 (the 2 later rows: a later age outranks the cost) |
| lifetimeCost, on | 4 | 0 | 2 | 2 | 2 |

The candidate ran in all 1,536 endValue plannings and was kept in 52 (36 replace a pass-kept sized plan, 16 the unsized best; 4 of
them lever plannings); lifetimeCost kept 8. Run at the kept bracket instead of the user's, its result is identical in all 1,536
(the bracket does not reach a plan that converts nothing; pinned by a test in Task 3). Historical and Monte Carlo success rates:
`solver_scan`'s figures, in Task 2.

## Tasks

### Task 1: the candidate (Sonnet, from this plan)

**Files:** `src/us/core/projection/run-projection.js` (the helper beside `sizingApplies`; the candidate after the lever fallback; the
comment block above `const sizes`; `report.sized`'s shape comment), `src/us/index.html` (badge V155 -> V156).

- [ ] The code as in "The design". The comment block above it names the follow-up, the measurement (stage 0 tried and refused) and
  the guarantee.
- [ ] `node --check`, `npm run build`, `npx vitest run tests/unit/us/conversion-none.test.js tests/unit/us/conversion-plan.test.js`.
- [ ] Commit, push.

### Task 2: measure, STOP for the owner

- [ ] Dumps on the tip (`tests/snapshot.js --only US --dump`, `conversion_sizing --dump`, `solver_scan --sizing --conv-only --dump`)
  against `8c1ff2d` (the `base-*` dumps) and against `2fc43c7` (S3's `s3-main3-*` dumps; the tools' diff since then only adds
  fields): differ / earlier / later / up / down per set; every row earlier than `2fc43c7` by name with its cause; 0 rows earlier or
  down against `8c1ff2d` (a row earlier or down is a finding). `node tests/snapshot.js --only Canada` 376 exact.
- [ ] The candidate's counts: plannings where it was kept (`noConvKept`), per set.
- [ ] Benches against `8c1ff2d` on a quiet machine: `bench_planning`, `bench_runs_interleaved --warm-analysis --rounds 21`,
  `bench_optimize` (per planning), `conversion_sizing` time.
- [ ] **STOP:** the movers table and the benches to the owner; nothing re-pinned before an OK.

### Task 3: tests and docs (after the owner's OK)

- [ ] `tests/unit/us/conversion-none.test.js`: a new case on default `single 62; 500k; 2000k; 130k; none` (the scan grid's household,
  `scanHouseholds`): the plan's family `none`, no intents, `plan.conv` `'none'` at every window age (62-72), every row of the window
  converts 0, `report.sized.noConvKept` true and `kept` true, `convIntents.none` the window's length, `keptIndex` the last
  candidate, and the kept measure `bracketCandidateBetter` than every other candidate of the report (its `depletedAge`,
  `homeDrawAge`, `value`); `noConvTried` true and `noConvKept` false on the existing NY / gap household cases where it is not kept.
  Hand-computed literals only where a figure is pinned (none expected: comparisons of two runs in one process).
- [ ] `tests/unit/us/conversion-plan.test.js`: `SIZED_KEYS` gains the two keys (done in Task 1: the report shape, no figure);
  a `cliffPlanSummary` case for a kept candidate (the sentence, no bracket clause); the check count updated.
- [ ] `tests/conversion_sizing.js`: print the candidate's kept count beside the kept count (information; the keep floor stays 130
  and still counts the pass's own keeps, `sized.kept`).
- [ ] Docs: `docs/architecture/cliff-plan.md` (a "Then the no-conversion candidate" paragraph after the all-none candidate's, the keep
  rule and `report.sized` bullets, the S3 over-the-line paragraph's "four grid rows still earlier" sentence);
  `docs/next-batches-plan.md` (item 3 marked done with the measurement; item 4's list updated to the rows still earlier than main;
  a "S3 item 3" results note under "Batch 5 follow-ups: results": movers, benches, rulings); `README.md` (the conversions-and-planning
  bullet: "including not converting at all"); `docs/architecture/test-inventory.md` if a test's coverage line changes.
- [ ] `npm test`, `npm run test:ui`; commit, push; open the PR (never auto-merge).

## Rulings (mine, for the owner's review)

1. **Not alternative B as written.** Measured at stage 0 it makes 4 `conversion_sizing` rows earlier than today and costs 12 runs
   per planning; the candidate after the pass restores the same five rows with 0 earlier and 0 down for one run.
2. **The candidate is "no conversion at any sizable age" in the `none` family**, not "the proposal's `'none'` ages": the rows recover
   only where that list is the whole window, and the whole window needs no proposal run.
3. **Kept by `bracketCandidateBetter` over the final best** (the bracket search's rank, with its 0.1% score margin), not
   `greedyAccepts` ($1): it replaces a whole plan (family and levers), as a bracket does, not one age of conv.
4. **The report (revision 2):** `noConvTried` / `noConvKept` only; `kept`, `convIntents` and the rest stay the pass's figures.
5. **Exempt ages** (`rothBracketByAge` / `rothAmountByAge`) stay out of `noneAll`, as the sizing pass leaves them alone.
6. **The toggle's guarantee is held as ruling 24 holds it** (revision 2, review C1): against toggle off's plan before the
   candidate, so a toggle-on plan never ends earlier than today's; the case where this matters was not reached in 222 lever plannings.
7. **The candidate carries the user's bracket and the summary says "Conversions: none (...)"** (revision 2, review I3): the copy
   is for the owner's OK at the STOP.
