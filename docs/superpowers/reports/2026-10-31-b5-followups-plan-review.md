# Review of the Batch 5 follow-ups implementation plan (2026-10-31)

Plan reviewed: `docs/superpowers/plans/2026-10-31-b5-followups.md` at `6a9c0c2` (branch `claude/b5-followups-spec`), against the
settled spec at the same commit. Read-only: no change to `src/`, the spec or the plan. Line numbers are for `6a9c0c2`; the engine
equals `main` `d67ebd3`, since the commits after it touch docs only.

**Method.** A Fable subagent did an independent review. The reviewing session then re-read every file:line it cited. One claim was
wrong and is dropped (its M10: `convOffered` *is* in `src/shared/core/withdrawals/conversion-targets.js`), and one line reference
was wrong and is corrected (M1). Separately, the reviewing session ran an experiment. It made a scratch worktree of `6a9c0c2` with
a minimal S1 patch: the fill passes `estTrad`, and `estUsed` is set when the fill runs with `convertible > 0`. It built that tree
and ran Task 2 Step 4's household through `__test_accountTrace` / `__test_simulate`, on both builds (section 3). That run produced
finding C1.

## 1. Verdict

**Not ready yet.** Its structure is right:
- every spec requirement has a task;
- an owner STOP comes before every baseline change in all four PRs;
- S1's per-household dumps against `main` and the WIP can be used.

But three things block S1 or S4 as written:
- **C1.** S1 makes the converting years with no ACA run to the eight-pass cap without converging. Neither the plan's `magiStats`
  gate nor any test sees it, and it is a large bench cost. This is a design question for the owner before Task 2.
- **C2.** Task 11's "Stayed under" schedule check cannot be built.
- **C3.** Task 2's engine test names fields that do not exist and a tolerance that fails after the change.

Four hook and name errors (I1, I2, I5, I7) would stall a builder. The rest are one-line corrections.

Answers to the six questions:

1. **Coverage:** yes, except that the never-earlier check against `main` is missing in PRs 2 and 4 (I8), `tests/cliff_guard.js`
   is in no task (M6), and PR 4 has no fixture before/after (M7).
2. **One way to build each step:** no. See C2, C3, I1-I5 and I7.
3. **Names, lines, hooks and options:** mostly right (M1 lists what checks out). Wrong: `__test_simulateFresh` (I2), the
   `planTrace` route for `choose` with sizing (I1), "the row's convertible" (C3, I7), the schedule's age-range formatter (I4), and
   the resolved bracket at the call site (I5).
4. **CLAUDE.md:** no hard breach. The intermediate commits with red unit tests and no docs need a squash note (M4). Re-pinned
   engine literals need runs on Node 22 and 24 (M5).
5. **Gating:** an owner STOP is present before every `snapshot:update`, `plan_off_anchor` and `snapshot_ui` change (Tasks 4, 7, 9,
   10, 11). The comparisons are per household in Tasks 1, 4 and 9. Tasks 7, 10 and 11 omit the dumps and the `main` compare (I8).
6. **Task 2's engine test:** at 22% it fails on `main` and passes after, but only trivially: after the change the fill is 0, so it
   checks 0 = 0. At 24%, which is the meaningful case, it fails both before *and* after, because the first retired year misses the
   fill by $266 at the pass cap (C1, C3).

## 2. Findings, ranked

### Critical

**C1. After S1, every converting year with no ACA iterates to `MAGI_ITER_MAX` (8) without converging, and nothing reports it.**
*(Found by the reviewing session's scratch run; the subagent predicted the first-year miss by arithmetic.)*

Task 2 Step 4's household was run on `main` and on the scratch S1 tree, at 22% and at 24%. The household: single, 60, retired at
60, TX, ACA off, no Social Security, $1.5M traditional, spending $120k, conversions 60-62, guard and mix off, `bondYears` 0. The
column "sum" is the conversion plus the discretionary draw; the 24% fill target is 201,775 + 16,100 = 217,875 in year 0, indexed
after.

| Build | Bracket | Age 60: conv / sum / passes | Age 61 | Age 62 |
|---|---|---|---|---|
| main | 24% | 218,174 / 531,760 / 1 | 223,322 / 544,245 / 1 | 228,905 / 557,359 / 1 |
| S1 | 24% | 13,078 / **218,141** / **8** | 13,417 / 223,318 / **8** | 13,963 / 228,900 / **8** |
| main | 22% | 122,099 / 383,952 / 1 | 124,845 / 392,742 / 1 | 127,966 / 402,069 / 1 |
| S1 | 22% | 0 / 200,516 / 3 | 0 / 205,235 / 2 | 0 / 210,082 / 2 |

Every S1 year at 24% hits the pass cap. The first retired year ends $266 over the fill target (218,141 against 217,875).

Why: the feedback contracts slowly. A $1 larger estimate converts $1 less, which cuts the tax about 0.24, which cuts the gross draw
about 0.32. From pass 3 the update is damped to `w = 0.5` (`run-projection.js:1166` `const w = phasePass >= 3 ? 0.5 : 1;`), which
was added for ACA-cliff flip-flops. Even a later year's seed, off by the ~2.5% inflation step (about $5k), does not get within
`MAGI_ITER_TOL` = 1 in eight passes.

None of this reaches `magiStats`. The forced pick and the `unresolved` mark both sit inside
`if (unconverged && !forcedPass && !replaying && usesMagiEstimate)` (:1303; the `phaseUnresolved = true` at :1327 is inside it).
With ACA off, `usesMagiEstimate` is never set (`src/us/core/healthcare/aca.js:196`
`if (ctx.inputs.acaEnabled && (acaEligibleA || acaEligibleB))`). So the plan's gate ("no more unresolved years; forced reported")
reads 0 while converting years cost 8x the passes. The spec's "a year whose draw does not move converges in one pass anyway, so this
costs nothing there" (4.1) does not hold for any converting year with a draw.

The scratch patch is minimal and the builder's may differ (for example, setting `estUsed` only with a non-zero bracket), but the
contraction rate comes from the tax arithmetic, not from the patch.

*Fix:* before Task 2, take this to the owner as a design point:
- **Options:** no damping when `!usesMagiEstimate` (the damping exists for the ACA steps); a better seed; or solving the fill's
  fixed point directly (the fill with the draw's gross-up).
- **Measure pass counts:** Task 4 Step 1 records the per-year `trace[i].passes` distribution and the converting years that hit
  the cap without converging, before and after, alongside `magiStats`.
- **Count the miss:** add a cap-hit counter, test-only or in `magiStats` (registered), so the gate can see it.
- **Benches:** Task 4 Step 4 expects the +5% `bench_runs_interleaved` gate to be at risk and says how a trip is judged.

**C2. Task 11 Step 1's "Stayed under ..." check in the schedule's why column cannot be built.**
A phased `under` year skips the conversion block (`run-projection.js:836`
`if (convertsThisYear && !(phased && yearPlan.kind === 'under')) {`, with `let conversionAmount = 0;` at :638). The schedule lists
only converting rows (`src/us/ui/results/roth-optimizer.js:121` `converting = selected.rows.filter((r) => r.conversionAmount >= 1);`).
So a "stayed under" `cliffChoice` can never reach the why column; only "filled to" (a phased `fill` year) can. The fixture shows
this: its 62-66 stay-under rows are absent from the schedule (only 59 and 67 are listed).

This also corrects the earlier spec review (its section 3 note, and the spec's 4.4 sentence taken from it): the fixture does *not*
cover the D test.

*Fix:* D tests the reachable "Filled to ..." branch (a phased `fill` year from the grid, or a constructed row in a Vitest case). The
notes say that "stayed under" is unreachable in the schedule by construction, and that those years are covered by
`convHeldBy: 'stayUnder'` and the card's line (Task 10). Amend spec 4.4's D bullet to match.

**C3. Task 2 Step 4's engine test is under-specified and, as written, fails after the change.**
- (a) **"the row's convertible" does not exist.** The row build (:2117-2160) has no `convertible` or `traditionalBeforeRmd`. The
  trace record (:2211-2240) has `trad, roth, tradShares, rothShares, profile, guardrails, rothBasis, rothConv, inherited,
  inhLastResortA/B, passes, taxable, taxableBasis, seSettle`, and no `convertible` or `estTrad`. `convertible` is a block `const`
  (:840).
- (b) **The tolerance derivation is wrong.** The engine bisects from `hi = maxAvailable` (`roth-conversion.js:65`) in 24 steps
  (:67), so one step is `convertible / 2^24` (≈0.09 at $1.5M, not 1e6 / 2^24), and two separate bisections can differ by two steps.
  *(Reasoning from the code, not run.)*
- (c) **The draw error is not bounded by `MAGI_ITER_TOL` in the first retired year:** confirmed by the run in C1, which misses by
  $266. At 22% the case degenerates: after the change the fill is 0, so the test checks 0 = 0.

*Fix:*
- Add test-only `estTrad` and `convertible` fields to the `trace` record (inside `if (trace)`, :2208, so the hot path is
  untouched).
- Assert `row.conversionAmount` `toBe` `solveRothConversionTop(ctx, trace[i].profile, trace[i].convertible, i, 24,
  trace[i].estTrad)`. That is a two-call comparison in one process, which rule 6 allows; say so in the test header.
- Assert `trace[0].passes > 1` (the first retired year iterated).
- For the draw-consistency check, use a tolerance written out only after C1 is settled.
- Use the 24% bracket, or lower spending, so the fill is non-zero.

### Important

- **I1. Task 5 names a hook that never prices conversions.** `planTrace`'s `conv.winner` is written only when `convChooseOn`
  (`run-projection.js:162` `convChooseOn = planMode === 'choose' && plan !== null && plan.conv != null && ...`). But
  `window.__test_planTrace` runs `storeContext({ planMode: 'choose', plan: null })` (`src/us/ui/install-test-hooks.js:313`).
  *Fix:* name the run `sizePass` makes (:2557): `__test_runPlanMode({ planMode: 'choose', plan: <kept plan with conv: {}>,
  planTrace: true })` per household, compared with the kept plan's `apply` rows.
- **I2. Task 4 Step 1's `__test_simulateFresh` does not exist.** The hooks are `__test_simulateRaw = simulateFresh` (no plan,
  `install-test-hooks.js:82`) and `__test_simulate = (...a) => (ensureTestPlan(), simulateFresh(...a))` (:126).
  `__test_magiStats` (:309) is the shared cumulative object (`engine-state.js:15`), and planning's own runs bump it too.
  *Fix:* plan first with `__test_simulate()`, zero the keys, then measure with `__test_simulateRaw()`.
- **I3. Task 11's "no limit holds" household shows the line.** It has "low traditional", so `'balance'` binds (Task 10 defines
  `'balance'` as a hold kind). And at 66 the IRMAA ceiling is always finite (`roth-conversion.js:142-145`: `age >= 63`).
  *Fix:* use a large traditional balance, and either stay under 63 with ACA off or check that the fill sits under the first
  IRMAA tier.
- **I4. No age-range formatter exists.** The schedule prints one row per age (`roth-optimizer.js:126`), and
  `grep -rn "ageRanges\|formatAgeRanges\|rangesOf" src/` finds nothing. *Fix:* specify a new helper (consecutive ages collapse to
  `a-b`, joined with ", ") and its unit test.
- **I5. Task 2 Step 3's "when the resolved bracket is non-zero" cannot be seen at the call site.** The bracket is resolved inside
  `solveRothConversion` (`roth-conversion.js:174-179`) and not returned, and Task 10 needs the same value. *Fix:* export a
  `resolveConvBracket(ctx, ageKey)` (override, then plan, then setting) used by both. State that the condition must not be
  `conversionAmount > 0`: a later year's first pass, seeded with last year's draw, can convert 0 while the converged pass
  converts more.
- **I6. Task 1's dump `id` (an index in `scanHouseholds(...)` plus the mode) is fragile.** `solver_scan.js` filters the grid with
  `--conv-only` (:536) and appends 96 RI/PA copies (:538-539). *Fix:* key the rows by the household `name` (unique, and it
  carries the state) plus the mode.
- **I7. Task 10: `convertible` is out of scope at the row build** (a block `const` at :840; `magiSafeRoom` is a pass `let` at
  :641). *Fix:* hoist it to a per-pass `let` (a reset value, not a rewound one, so it needs no snapshot); C3's trace field reads it
  too. (`"scratch"` is an existing kind in `tests/engine-purity.json`, :93, so `CEIL_OUT`'s registration is right.)
- **I8. The never-earlier check against `main` is missing after PR 1.** Spec 5 asks for it "for each PR, against its parent and
  against `main` at `d67ebd3`". Task 7 says "against PR 1's merge" only. Task 10 Step 3 proves that the snapshots differ only by
  `convHeldBy` but runs no `conversion_sizing` or `solver_scan` dump compare. Task 11 names only `snapshot_ui`. *Fix:* add "the
  three dumps against the parent's and the `main-*` dumps" to each.
- **I9. Task 3's household search needs ACA on and one phase.** `passLog.push` (:1160) and the forced pick (:1303) are gated on
  `usesMagiEstimate`. `accountTrace()` plans first (`tests/unit/helpers/engine.js:37`, `ensureTestPlan()`), and phases clear
  `passLog` (:1298, 1639, 1886, 1944, 1968, 2068). *Fix:* say ACA on, and the guard off (or no plan), so the traced `passLog` is the
  year's only phase. Also, after C1, the forced pick is not the only issue in those years.

### Minor

- **M1. Line references.** `roth-conversion.js` ends at line 181, so the plan's "160-183" should read 160-181. The plan's
  `conversion-choose.test.js:~323-324` is **right** (the subagent's 324-325 was wrong). These check out: `:514`, `:635`,
  `:836-861`, `:1303-1312`, `:1616-1621`, `:2278`, `sizePass` `:2556-2591`, the trace at `:2211-2240`, `conversionMagiCeiling`
  `:86`, `engine.md:276-279`, `us-health.md:16`, `plan_off_anchor.js:1-10`. Also confirmed: `snapshot.js`'s options (`--root`,
  `--only`, `--dump DIR`, `--compare A B`, `--update-nothing`); `solver_scan.js`'s `--root`, `--sizing`, `--conv-only`;
  `__test_runPlanMode({ endValue: true })`; `scanHouseholds({ conversions, mode })`; `ctx.test.convRunBudget`;
  `MAGI_ITER_TOL = 1`; the federal 2026 figures (MFJ 24% top 403,550, standard deduction 32,200, the 65+ add-on only at
  `a >= 65`); badge V150. `conversion_sizing.js` has no `--root` today (`ROOT` at :13), and `tests/helpers/planner-path.js`
  already supports one.
- **M2.** `solveRothConversionTop` with `maxAvailable` Infinity returns 0 (`ordinaryAt(Infinity)` fails the :66 test, and the
  bisection keeps `lo = 0`), so Task 10 is right to forbid it.
- **M3.** The WIP dumps are comparable. `9ab5cad`'s parent `b57def0` differs from `d67ebd3` only in `docs/next-batches-plan.md`, so
  the tools on this branch can measure it with `--root`.
- **M4.** Task 2 Step 6 and Task 3 Step 5 commit source with a red `npm run test:unit` and no topic-file docs. CLAUDE.md asks for
  docs in the same commit. *Fix:* say the PR is squash-merged, or fold those commits into Task 4's.
- **M5.** Rule 6 covers the re-pins too (Task 4 Step 6, Task 9 Step 3): the re-pinned literals are engine output, so run those
  suites on Node 22 and 24.
- **M6.** `tests/cliff_guard.js` (a spec 5 gate) appears in no task. Only Task 10 names `engine_purity.js` (plan :301). *Fix:* add
  both to Task 4 Step 8 and to Tasks 7, 9 and 10.
- **M7.** PR 4 has no fixture before/after (spec 1: "every PR runs it"). *Fix:* add it to Task 11 Step 3.
- **M8.** Task 2's two-return direct-call case: state the single 12% figure (50,400 + 16,100 = 66,500), so the draw is chosen
  above it.

Dropped: the subagent's M10 (`convOffered` "not in `conversion-targets.js`"). It is at
`src/shared/core/withdrawals/conversion-targets.js:74-76`.

## 3. The scratch experiment

- **Worktree:** `git worktree add` of `6a9c0c2`, outside the repo.
- **The patch:** `solveRothConversion(..., ageKey, drawBelow = 0)` passes `drawBelow` to `solveRothConversionTop`. At
  `run-projection.js:855` and :860 both calls pass `estTrad`; :855 sets `estUsed = true`, and :860 sets it when `convertible > 0`.
- **Build and run:** `node scripts/build.js`, then the household in C1 loaded with `__test_replaceState`, rows from
  `__test_simulate()`, and pass counts from `__test_accountTrace()[i].passes`. The discretionary draw is
  `traditionalWithdrawn - rmd - inheritedDraw`.
- **Status:** not committed, and the worktree is outside the repo.
