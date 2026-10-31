# Review of the Batch 5 follow-ups design spec (2026-10-31)

Spec reviewed: `docs/superpowers/specs/2026-10-31-b5-followups-design.md` at `857ef9d` (branch `claude/b5-followups-spec`, parent
`d67ebd3` = `origin/main`). Read-only: no change to `src/` or the spec.

Method: an independent review by a subagent, then every file:line it cited was re-read in this tree by the reviewing session
(one citation corrected, marked below). In addition, the committed fixture `tests/fixtures/dana-and-chris.json` was run through a
fresh `dist/Planner_US.html` (`npm ci && npm run build`, Playwright, clock fixed at 2026-06-15, state loaded with
`__test_replaceState(file.state)`), see section 3. Line numbers are for `857ef9d`.

## 1. Verdict

**Ready with changes.** The diagnosis is right and the order S1 -> S2 -> S3 -> S4 is right. Four points need settling in the spec
before the S1 plan is written:

- H1: S1 needs `estUsed` set for the plain fill. Without it, the years the fix is aimed at run one pass on last year's draw.
- H2: the "drop the `'b<pct>'` candidate" rule should be dropped, or narrowed to years where no limit binds.
- H3: S2's second shortlist entry needs a defined shape and a budget order.
- M1: S4's trigger has to be redefined, and the engine field it relies on confirmed. On the committed fixture the 10% row already
  differs from the others, so the trigger as written would never show the note.

The other findings are spec wording and gate mechanics.

## 2. Findings, ranked

### High

**H1. Under S1 as written, the plain fill is never iterated in years with no ACA premium and no finite ceiling.**
The loop re-runs a pass only when `estUsed` is set (`run-projection.js:1158`
`const unconverged = estUsed && (...) > MAGI_ITER_TOL;`). `estUsed` is set only at :671 (a finite `magiCeiling`), :844 (the sized
path), :932 (the ACA premium), :956 (162(l)) and :1150 (inherited accounts). Nothing sets it for the plain fill (:858-861). So in a
converting year with ACA off, employer coverage, or no finite IRMAA ceiling, the fill counts `estTrad = prevDiscTraditional`
(:507). That is last year's draw, and it is 0 in the first retired year. It runs once and never converges on the year's own
draw. `docs/reference.md:6562` describes today's behavior: a year with no ACA and no ceiling runs once. These are the years
follow-up item 2 says probably overshoot the bracket today. The spec's planned test (a direct call with `drawBelow`) cannot
catch this.
*Fix:* S1 sets `estUsed = true` when the plain fill runs with a non-zero `estTrad`, as :844 does. It adds an engine-level
Vitest case (a no-ACA household whose converting row's conversion plus realized draw lands at or under the bracket top). It also
says that those years now iterate, so the `bench_runs_interleaved --warm-analysis` +5% gate may trip for a legitimate reason;
state how such a trip is judged.

**H2. Dropping the `'b<pct>'` candidate that matches the year's own bracket (sections 4.1 and 7) removes a real option.**
The bracket target is the plain fill *capped by the MAGI ceiling*: :859-860 `conversionCap = Math.min(convertible, ... magiSafeRoom);
conversionAmount = solveRothConversion(...)`, then the phased clamp at :862. The `'b<pct>'` candidate is capped only by the
convertible balance: `conversion-targets.js:13` `Math.min(t.bracketTop(...), t.convertible)`, with `bracketTop` priced at
`drawTrad` (`run-projection.js:1518`). Where the ACA room binds (an under-the-line year), `'b22'` means "cross the line and fill to
22%", a choice sizing exists to price. The spec's premise, that the two differ "only by the convergence error", holds only when no
ceiling and no clamp binds. Where the premise does hold, the rule does nothing: `MAGI_ITER_TOL = 1`
(`engine-state.js:10`), the fill moves dollar for dollar with `drawBelow`, and `convOffered` (`conversion-targets.js:75`,
`Math.abs(c - bracketConv) > 1`) already declines the near-duplicate (`run-projection.js:1561`).
*Fix:* drop the rule, or apply it only when `conversionAmount` equals the uncapped fill (no ceiling bound, no phased clamp, no
`rothAmountByAge`).

**H3. S2's "second entry per age" changes the shortlist's shape, which the spec does not design, and it can displace today's
proposals past the budget.**
The shortlist holds one target per age: `run-projection.js:1619` `convShortlist[age] = short.target;`. `sizePass` walks
`Object.keys(shortlist)` and stops at `CONV_RUN_BUDGET` in age order (:2556-2569). It reports `proposed: ages.length` (:2580).
`tests/unit/us/conversion-choose.test.js:323-324` pins the shortlist with `toStrictEqual` and asserts that no value is `'none'`.
The spec names no change to that test. Because the walk runs in age order, an extra `'none'` at an early age can push a later
age's existing proposal past the budget (`budgetHit`). That falsifies "households where `'none'` does not win the year do not
move" for any household where `'none'` wins somewhere.
*Fix:* state the shape, either `target | [target, 'none']` or a second map. Try the `'none'` entries after all of today's entries,
so today's proposals are reached first inside the budget, or list "budget displacement" as a mover cause. Name the test change.

### Medium

**M1. S4's trigger is defined twice, inconsistently, and does not fire on the fixture that motivated it.**
- Section 4.4 says the note shows "when every row of the card's table has the same conversions". Its Playwright bullet says the
  note shows "for an overriding plan and is absent when the plan keeps the setting". On Dana and Chris the plan *keeps* the
  setting, so these two triggers disagree on the motivating case.
- On today's build the fixture's rows are **not** all identical: 10% gives $336,052 lifetime tax, while 12% through 35% each give
  $336,892 (section 3). An "every row the same" trigger would show no note here.
- Data: `computeRothOptimizer` keeps only `{ bracket, endAssets, afterTaxEnd, score, lifetimeTax, depletedAge }` per row
  (`roth-optimizer.js:58-66`), with no per-year conversions. The rows carry `conversionAmount`, `convChoice` and `cliffChoice` but
  no field naming the limit that bound. So the engine field the spec hedges on ("if the rows do not say") is required, and so is
  keeping each trial's conversions.
- The rows are not like for like: the plan's row runs unpinned and sized, the others pinned and unsized
  (`roth-optimizer.js:30-39, 50-55`).

*Fix:* choose one trigger, for example "the rows for every bracket at or above some bracket are identical", or "the conversions
are the same for all but N rows". Commit to the row field. Test against the real fixture.

**M2. Wrong figures in section 4.4.** "the ACA line capped every bracket's conversion at the same ~$31k at 59-61" and the example
copy ("... at 59-61") come from the analysis's reconstruction with *default* spending, before the fixture existed. The analysis
says so itself at lines 71-72 ("With the inputs given and the default spending ... conversion ~$31K at 59-61") and at 99-100. The
committed fixture on today's build behaves differently (section 3): it converts about $20k at 59, $0 at 60-61 (held by the ACA
brake), $0 at 62-66 ("stayed under ACA 400% line"), and $79k at 67. The subagent's H2 example repeats the ~$31k; it is kept only
as an illustration of the mechanism. *Fix:* replace the figures with the fixture's, and reword the example note.

**M3. S1 undermines the premise of the forced-pick tie rule, which the spec defers to "Later" (group C).**
`run-projection.js:1307-1308`: "in a sized year (`convTarget !== null`) an overpay tie goes to the pass with the smallest drift ...
the conversion moves against the draw there ... Unsized years keep the first." `magi-iteration.md` says the same. After S1, every
converting year's conversion moves against the draw.
*Fix:* S1 either extends the smallest-drift tie to every converting year, or states why not, and reads `magiStats.forced` before
and after (already planned).

**M4. Stored plans saved from V140 to V150 are not covered.** `madeFor` is a fingerprint of the inputs only
(`plan-optimizer.js:174` `candidate.madeFor = storedPlanFingerprint(state)`; the staleness test at :235). The format version is
always 1 (`plan-shape.js:98`). A plan whose `bracket` and `conv` (`'b22'` ...) were chosen under the old fill is applied under the
new fill with no "made for different inputs" flag. Section 2 G settles only plans saved before step 5. (The subagent cited
`plan-shape.js:69/113`, which hold the key list and the objective check; the correct evidence is the lines above.)
*Fix:* state the decision (accept, as on 2026-10-29, or bump `v`) and add it as a mover cause.

**M5. The "never earlier" gate names scan sets that have no per-household compare.** `tests/conversion_sizing.js` keeps `dep` and
`home` per household (:41) but prints only aggregates (:83). `tests/solver_scan.js` has `--json` / `--md` (:49) but no compare.
Only `tests/snapshot.js` has `--dump` / `--compare` (:22-24). "For S3 also against the WIP": the analysis gives figures for two
scenarios plus aggregate counts, so a dump from a WIP worktree is needed.
*Fix:* name the mechanism, for example `--json` on both trees plus a diff script, or a `--dump` added to `conversion_sizing.js`
in S1.

### Low

- **L1.** The section 5 docs list leaves out `engine.md`, whose :276-279 repeats "`solveRothConversion`'s calls with 0 are the
  same doubles".
- **L2.** `tests/plan_off_anchor.js:2-8` names its baseline commit, and S1 moves guard-off runs. "The same way" in section 5 should
  say the header's baseline moves to S1's commit.
- **L3.** After S1, S3's second jump is between 0 and the draw-aware fill, not between 0 and Infinity. Worth stating: it is why S3
  after S1 is safer than the WIP alone. The gate (no more unresolved years) is right.
- **L4. Order.** S1 -> S2 -> S3 -> S4 is right: S1 alone is partly masked by the brake, and S4's copy should describe the final
  behavior. Two additions: (a) run one scratch S1+S3 snapshot compare before S1's baselines are updated, so the owner sees the pair
  once; (b) make S2's scratch measurement after H2 is decided, since the dropped candidate changes the winners.

### Questions the spec leaves to the builder, answered now

- **Double counting in `drawBelow`: none.** The 72(t) payments are added to `rmdA/B` (`distributions.js:162-163`), which enter
  `otherA/B` (`year-stages.js:157-158`). The inherited last-resort estimate is `profile.inhEstA/B` (read by the fill at
  `roth-conversion.js:52/58`). `estTrad` comes from `realizedTrad = traditionalGross - conversionAmount`
  (`run-projection.js:1151`), with `traditionalGross` seeded at the conversion (`draws.js:74`) and the RMD and inherited draws kept
  apart. So it is purely discretionary. The spec's "the builder confirms" can become a statement.
- **Units and two returns:** `estTrad` is a household figure, and the fill is household-level in every branch, including the
  two-return branch, which sums `otherA + otherB` against one bracket (`roth-conversion.js:57-60`, a pre-existing approximation).
  Consistent.
- **Survivor years:** the remap puts the survivor in slot A (`year-stages.js:173-187`), and `estTrad` is the survivor's draw. Fine.
- **The phased fill clamp** (`run-projection.js:862`) only caps from above, so it needs no change.
- **First pass:** `estTrad` is defined (:507) before the conversion block. Fine.

## 3. The fixture on today's build (`857ef9d` = `main` + spec, US V150)

The bracket card (summary: "Your current 22% bracket target already left the highest estimated after-tax end value"):

| Bracket | Lifetime tax | End assets | After-tax end | Lasts |
|---|---|---|---|---|
| 10% | $336,052 | $0 | $0 | Age 95 |
| 12% / 22% (current) / 24% / 32% / 35% | $336,892 | $0 | $0 | Age 95 |

The plan keeps the 22% setting with `conv: null`. The conversion schedule shows two lines: 59, $19,733, and 67, $63,656 (real
dollars). Rows, nominal:

| Age | Conversion | Traditional draw | MAGI proxy | Why |
|---|---|---|---|---|
| 59 | 20,227 | 0 | 86,714 | under the ACA line |
| 60 | 0 | 140,729 | 154,964 | over the line, held at $0 (fault 2) |
| 61 | 0 | 165,095 | 182,508 | same |
| 62-66 | 0 | 36,691-51,413 | 93,382-103,076 | `cliffChoice` "stayed under ACA 400% line" |
| 67 | 79,498 | 134,676 | 280,554 | fills on top of a $135k draw (fault 1, visible today) |

Two notes. Fault 1 already shows at 67 on `main`, a year with no ACA. The 62-66 rows are real "stayed under" `cliffChoice` rows,
so this fixture can serve as the household for S4's `cliffChoice` test (group D) rather than a constructed row.

## 4. Spec claims confirmed

- `solveRothConversion(ctx, profile, maxAvailable, yearIndex, ageKey)` passes 0 (`roth-conversion.js:160/180`).
- Its call sites are at `run-projection.js:855` (the `-1` fallback) and :860. The sized `bracketTop` passes `estTrad` (:852).
  `choose`'s `'b<pct>'` candidates use `drawTrad` (:1518).
- `pickConvTarget`'s `+1` rule (`conversion-targets.js:59`). `resolveConvTarget('none') === 0` (:12). `plan.conv` accepts
  `'none'` (`plan-shape.js:85`).
- `CONV_RUN_BUDGET = 24`. `report.sized.convIntents.none` (:2580). `cliff-plan.md`'s "`none` is always 0".
- `us-health.md`'s "`conversionMagiCeiling` is unchanged". The comment at `roth-conversion.js:29-32`.
- The card's existing copy: "already uses the X% bracket (not your Y% setting)" and "(your setting)" (`roth-optimizer.js:93, 109`).
- The eight test files and `test_conversion_schedule.js` exist.
- `9ab5cad`'s diff matches section 4.3. The "54 of 541 snapshots" figure is in `docs/next-batches-plan.md:2926`.
- The fixture's inputs are as the spec describes. Badges: US V150, Canada V67. `origin/main` is `d67ebd3`.
