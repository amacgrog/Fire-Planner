# Cliff plan: chosen once on the deterministic projection, applied unchanged everywhere (3C redesign): design

Status: approved in brainstorming with the owner, 2026-10-07. Next step: owner review of this spec, then the
implementation plan (`docs/superpowers/plans/2026-10-07-cliff-plan.md`).

Supersedes, in `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md`: section 2 decisions 1 (a policy
followed in every run), 4 (lambda estimated per path from each path's own balances) and 6 (the cliff guard in every
mode, inside every run), and sections 5.4 and 5.5 (where the guard runs). Amendments 13.5 to 13.7 survive as rules of
the chooser (section 4 below); their scans and gates are replaced by section 8. Everything committed up to `3ebee0e`
(B1 per-return MAGI, the B2 hooks, the B3 primitives, B5a/B5b lambda, the B5 refactors, Stage A) stays.

## 1. Why

**The failure.** 3C's cliff guard re-chose each year's withdrawal inside every projection (standard, every historical
path, every Monte Carlo path), scored by lambda estimated from that path's own balances. The owner's hard rule, "guard
on never runs out earlier than guard off", cannot be guaranteed by a year-at-a-time choice: plans end on knife edges,
the engine is discontinuous (conversion ceiling, bond refill), and on historical and Monte Carlo paths the choice
reacted to each path's market noise. Amendments 13 to 13.7 each fixed one scan and the next found a new failure;
Stage 8a stopped on 7 of 1,536 bucket paths running out a year earlier.

**Our design caused it.** Decisions 4 and 6 of the 3C spec put each path's own balances into the decision and ran it
in every engine. No implementation bug; the architecture fought the rule.

**The direction (owner).** The future market is unknown, so the plan is chosen on the fixed assumptions (return,
inflation, bond yield) and on the known future events the inputs already describe (lump expenses such as a car,
one-time income, income streams, extra expenses for a period, spending tiers, rent then buy, loans, children by birth
year, the survivor death age). It is computed once on the deterministic projection and applied unchanged in
historical and Monte Carlo runs, the way `appliedRothSchedule` and `appliedMixSchedule` already are. The policy is
fixed; only its dollars come from each path. Historical and Monte Carlo runs evaluate the plan; they never shape it.

## 2. Decisions (owner, 2026-10-07)

1. **"Never worse than my current settings" (rule A).** Guaranteed on the deterministic projection, by construction:
   no steering is always a candidate and depletion ranks first. In historical and Monte Carlo runs it is reported,
   never used to accept or reject a plan (that would be leakage). Standard snapshot scenarios that run out earlier
   block; historical movers are re-explained.
2. **When the plan is computed: the hybrid.** An automatic quick plan every render (this spec); a deeper search
   behind Optimize -> Apply that stores a plan of the same shape (Batch 5).
3. **Stage 8a and the guard.** 8a is not committed as it stands; its four rules (choose against the converged natural
   year, a stay-under sets the conversion to 0, the real-cliff gate, the largest-cliff line) are ported into the
   once-per-render chooser. Committed 3C code stays. Work happens on a new branch in a new worktree; the owner's
   working tree, the 8a patch and the three stashes are not touched.
4. **Execution on a path: literal, with a fallback (rule (a)).** Section 6.
5. **Keep rule tie-break: ending after-tax value,** with traditional money net of the income tax it carries (option
   (i), computed as ten slices, section 5).
6. **Subsets by line family:** whole plan, ACA family only, IRMAA family only, none.
7. **Variants** (age lines, tornado, sensitivity, rent/own, optimizer card) apply the main plan unchanged by Partner
   A's age; they never re-plan.
8. **Timing gates:** section 8.
9. **Lambda's emptied-pool sample:** defect recorded, measured, deferred to Batch 5 (section 10). The estimator is not
   changed in this batch.
10. **Life events:** E1 to E4 after this redesign, E5 and the Canada province move later, a stated exclusion list
    (`docs/next-batches-plan.md`, "Batch E"). None is part of this redesign.
11. **With/without success rates:** scan only in this batch; Batch 5's Apply card shows both.

## 3. Architecture

**Three run modes**, an argument of `runProjection` (`planMode`), default chosen by the wrappers:
- `off`: no steering. Byte for byte today's guard-off year (`cliffGuardEnabled: false` at `3ebee0e`).
- `choose`: the per-year chooser (section 4). Only ever run on the deterministic projection (`STANDARD_MODE`,
  `standardYearSource()`). Records each year's winning intent.
- `apply`: follows a given plan (section 6). No chooser, no lambda, no score.

Until commit 3 (section 9) the wrappers keep today's in-path guard as a fourth, legacy path so commits 1 and 2 change
no number; commit 3 removes it.

**The plan object** (plain data, so Batch 5 can store one in `state`):
```
{ intents: { [Partner A age]: { kind: 'under' | 'fill', line, ret } },
  family: 'all' | 'aca' | 'irmaa' | 'none',   // which candidate the keep rule kept
  madeFor }                                    // inputs fingerprint: display and debugging only
```
- `line` is a stable id: `medicaid`, `acaFloor`, `aca400` (family `aca`); `irmaa1` ... `irmaa5`, the k-th finite tier
  edge of the year's IRMAA table (family `irmaa`). `magiThresholds` gains `id`, `ret` and `family` on each line it
  returns (number-neutral).
- `ret` is `'H'` (household; joint, single, survivor years) or `'A'` / `'B'` (the return a line belongs to in a
  two-return year).
- Keyed by Partner A's age, as the applied schedules are (both engines already pass `age`).

**Where it is computed.** `refreshCliffPlan()` runs once at the top of `render()`, before anything that projects. With
the guard on, it runs `choose` (which also yields the whole-plan candidate), the family subsets through `apply` when
both families appear, and `off`; keeps the winner by rule A (section 5); stores it in the module-level `cliffPlan`.
With the guard off, `cliffPlan = null`.

**Where it is used.** `runProjection`, called with no `planMode`, runs `apply` with `cliffPlan`, or `off` when it is
null. `simulate()` and `simulateHistorical()` sit in a shared region and are not edited; through them this covers every
call site (83 at `3ebee0e`): the main projection, every variant, historical, Monte Carlo, MCP. `simulate()` never plans.

**Stale plans.** Every place that replaces state outside `render()` (autosave load, scenario import, reset; the
implementer lists the sites) clears `cliffPlan`. Tests change state and call the shared `window.__test_simulate*` hooks
without `render()`; US-only code after the shared hook block redefines those hooks to re-plan first whenever the state
differs from the one the plan was made for (`JSON.stringify(state)`, a test-only cost), so a test always runs the plan
of the state it set, never a stale one. Benchmarks use raw hooks (`__test_simulateRaw`) after one explicit refresh. Test
hook: `window.__test_refreshCliffPlan()` (returns the plan and the keep-rule table).

**Precedence, unchanged.** Applied Roth and mix schedules still set the conversion bracket and the order; the plan's
intents sit on top; a stay-under year sets that year's conversion to 0 (8a rule 2).

## 4. The chooser (`choose`, deterministic run only)

Per withdrawal year (`flow < 0`) with a real cliff in reach, 8a's procedure:
1. **Converge the natural year** (no plan; the MAGI iteration and its forced pass as today). This pass is the baseline.
2. **Candidates**, among the lines inside the reach measured from the natural MAGI (spec 5.2's reach):
   - the nearest line below the natural MAGI whose cliff is real: premium plus IRMAA just over it exceeds just under
     it by more than $1 (`costNear`; 13.7 B);
   - the line below with the largest cliff, if it is not the nearest (13.6; ties to the nearer);
   - the nearest floor above (premium plus IRMAA lower just over than just under), for a fill, only with
     penalty-free traditional money.
   Senior-deduction and child-tax-credit lines are not candidates (13.7 B).
3. **Eligibility.** A stay-under is offered only if the natural MAGI less the natural conversion is over the line
   (13.5 item 2) and the natural year drew traditional money the cap can limit: a new `wd` field records the
   cappable traditional draw, excluding the uncapped bond-reserve draw (fixes the 8a review's finding 3, where
   `realizedTrad` was used). A stay-under sets the year's conversion to 0. A fill keeps
   `min(natural conversion, that pass's ceiling-sized conversion)`.
4. **Trials.** Each candidate is its own converged MAGI iteration with the plan held, seeded from the natural pass's
   realized draw and gains (13.5 item 3), from the natural pass's start-of-year snapshot.
5. **Win rule** (13.7 B). A trial wins only if it meets its plan (realized MAGI at or under the target + $1 for
   under, at or over the target - $1 for fill), leaves no need unmet, lowers this year's healthcare charge plus
   `irmaaAt` by more than $1 against the natural year, and beats the natural score (`afterTaxValue` with lambda, less
   the premium and IRMAA changes) by more than $1, or the best earlier qualifying trial. Otherwise the natural pass is
   kept without a replay.
6. **Record.** The winner becomes `intents[age] = { kind, line, ret }`.

Years with no real cliff in reach run exactly as `off`. Lambda is unchanged (B5a/B5b); it only scores proposals.
`lambdaEstimate` gains a `movedSample` flag (true when the walk emptied the pool before a sample year and the sample
moved), carried in the plan trace (`window.__test_planTrace()`).

## 5. The keep rule and the US ending value

**Candidates.** Both families present: whole plan, ACA only, IRMAA only, `off`. One family: plan and `off`. Empty
plan: nothing to compare (`cliffPlan` is the empty plan, `family: 'none'`).

**Ranking, in order:**
1. Later depletion age wins (never running out beats any age).
2. Same depletion: the higher ending after-tax value by more than $1.
3. Otherwise the candidate with fewer intents (`off` has none). A plan must beat `off` to be kept.
Lifetime real tax plus healthcare is computed for every candidate and reported (summary line, scan), never ranked.

**`afterTaxEndValueUS(sim)`: the ending value, traditional money net of the income tax it carries.**
- `runProjection` attaches the final balances and the last year's tax profile and filing as a non-enumerable
  `estate` property, as Canada does (7N N8); snapshots and row fields are unchanged.
- Face value: Roth (pool and bond), taxable (stocks and bonds; US heirs receive a stepped-up basis, so no gains tax,
  unlike Canada's deemed disposition), cash, home equity.
- Traditional money (pool plus `bondTraditional`), `T`: value `T - 10 x (taxFor(lastProfile + T / 10) -
  taxFor(lastProfile))`, the last year's own return under that year's law and filing status (single after a death).
  One extra `taxFor` call per candidate.
- Not modeled, stated in the docs: heirs' own rates, the federal estate tax, state estate and inheritance taxes,
  healthcare effects of the slices. It is the household's own embedded income tax, not estate planning.
- Every candidate ends in the same year, so values are compared in nominal dollars.

## 6. Execution on a path (`apply`, rule (a))

In a year with an intent for Partner A's age:
1. The year's lines are built on this path (`magiThresholds` with the path's own tax factors; IRMAA lines at the
   charged year's tiers at plan inflation, `irmaaGrowth2`, as decided). The intent's line is found by `id` and `ret`.
   No such line this year: run as `off`.
2. Converge the natural year, exactly as in `choose`.
3. If the natural year is already on the intent's side of the line (stay-under: natural MAGI at or under it; fill:
   at or over it), keep the natural pass. No label.
4. Otherwise, if the intent passes the same eligibility test `choose` applies (section 4 step 3 for a stay-under; the
   fill's penalty-free traditional money and reach), run it as one trial with 8a's rules (stay-under: conversion 0, cap
   at the line; fill: as in section 4), seeded and snapshotted as in `choose`. Not eligible: keep the natural pass, no
   label.
5. If the trial meets its plan with no unmet need, keep it and label the row (`cliffChoice`). Otherwise keep the
   natural pass, no label (a fallback).

No scoring, no lambda, no healthcare-saving test inside a path. Years without an intent run as `off`.

**Replay is exact.** `choose` and `apply` share the natural-year and trial code, and every trial starts from the
natural pass's snapshot, so `apply(choose's plan)` on the deterministic run reproduces the `choose` run on every row
field. The whole-plan candidate therefore costs no extra projection. A test pins this (section 8).

**Cost.** Each plan year on a path pays a converged natural year plus at most one trial; other years cost what `off`
costs. Measured by the per-path gate (section 8).

**Known, accepted.** An IRMAA stay-under on a path targets the line at plan inflation; the path's real charged tier
can differ, so some path stay-unders save $0 (the review measured 27% of bucket IRMAA wins under the in-path guard).
Counted by the scan, not gated (no healthcare test inside a path, decision 4).

## 7. Inputs and display

- **No new input.** `cliffGuardEnabled` keeps its key, default (on) and saved values. Label: "Cliff plan". Info bubble
  (wording from the code): "Chooses, on the plan's own assumptions, the years in which to keep income just under a cost
  line (the ACA 400% cliff, the Medicaid line, an IRMAA tier) or just over a floor, and keeps that plan only if it
  lasts at least as long and leaves more after tax than no steering. Historical and Monte Carlo runs follow the same
  plan; they never re-plan for their own markets." MCP schema and field registry unchanged.
- **Rows.** `cliffChoice` keeps its wording ("stayed under ACA 400% line", "filled to the Medicaid line") in the year
  table's tooltip, in every run where the intent was carried out. Skipped or fallen-back plan years carry no label.
- **Summary line under "More results"**, from `cliffPlan` and the keep-rule table, for example: "Cliff plan: stay under
  the ACA 400% line at 60-64; fill to the Medicaid line at 58. IRMAA stay-unders not used (no gain over the whole
  plan)." Ages are grouped into runs; with the guard off or an empty plan the line says so.
- **Not shown:** with/without success rates (scan only, decision 11).
- **Same commits:** US badge V116 -> V117, README feature line, the `CLAUDE.md` per-year solver section rewritten.

## 8. Testing, measurement, gates

**Hard rules.**
- Standard snapshot scenarios never run out earlier than `off` (by construction; asserted) and never earlier than at
  `3ebee0e`. Either: stop for the owner.
- Historical and Monte Carlo scenarios may move either way; every mover is re-explained with a dump/compare and a
  before/after table, `npm run snapshot:update` in the same commit.
- No shared-region or Canada change. No heuristic or gate this spec does not name.

**Regression anchor.** With `cliffGuardEnabled: false`, every snapshot scenario is byte-identical to the same scenario
with the guard off at `3ebee0e`.

**Tests (new or rewritten):**
- Replay: `apply(choose's plan)` equals the `choose` run on every row field (`Object.is`), on the cliff households.
- Apply semantics, hand-built: already on the right side (natural, no label); trial cannot meet the plan (natural,
  no label); a fill below the floor; a fill without enough penalty-free traditional money; a two-return intent on the
  right return; an intent whose line is absent that year (`off`).
- Keep rule: a household where the IRMAA family loses and the ACA family is kept; a tie that goes to `off`; a later
  depletion that beats a higher value.
- `afterTaxEndValueUS`: hand-computed (ten slices; single filing after a death; taxable and home at face value).
- The cappable-draw field: a bond-reserve draw is not cappable.
- `movedSample`: set exactly when the walk empties the pool before a sample year.
- Stale plans: state replacement clears `cliffPlan`; the test hooks re-plan when the state changed.
- Variants: the +-1-year line applies the main plan by age and never plans.
- `tests/cliff_guard.js` rewritten to these semantics; `tests/historical_parity.js` covers `apply` and `off`; the
  snapshot harness and `tests/historical_rates.js` plan per scenario through the re-planning hooks (no edit needed).

**Scan** (`tests/solver_scan.js`, extended; not in `npm test`). Per household: the family kept; standard depletion,
value and cost against `off`; historical and seeded Monte Carlo success rates with and without the plan; per-path
earlier / later depletion counts (information); skip and fallback counts; Roth used by stay-unders on paths against
the deterministic run; path IRMAA stay-unders with $0 realized saving; `movedSample` years crossed with family
rejections. Exit 1 only if a standard plan runs out earlier than `off`.

**Timing gates** (against `24f6585`, interleaved, one process, medians):
- Per path: one `simulate()` with the plan applied and one historical path. No-cliff households +5% (accepted up to
  +8%, documented); the ACA early retiree (California) +30%.
- Planning: `refreshCliffPlan()` at most 5x one plain `simulate()` of the same household, on the default household,
  the ACA early retiree, Texas with no cliff, and one household where the plan acts.
- A gate missed: number-neutral speedups (snapshots identical) are allowed; still over, stop for the owner.

## 9. Commits and branch

The spec, plan and notes are committed on `claude/batch-3b-penalty-rules` (doc paths only). The implementer cuts
`claude/3c-cliff-plan` from that commit in a new worktree `../fp-cliff-plan`.

1. **Hooks, no number change** (snapshots identical): the `estate` property and `afterTaxEndValueUS`; the cappable
   draw on `wd`; `movedSample`; `id` / `ret` / `family` on `magiThresholds`' lines.
2. **Plan modes, no number change.** `runProjection` gains `off`, `choose`, `apply`; the wrappers keep today's in-path
   guard as the default, so snapshots stay identical. `choose` carries 8a's four rules; `apply` carries rule (a).
   Replay, apply-semantics and keep-rule tests run through test hooks.
3. **The switch** (the intended number change): `refreshCliffPlan()` in `render()`; the wrappers apply `cliffPlan`;
   the in-path guard is removed; stale-plan clearing; harness and scans plan per scenario; movers table, scans,
   timing; label, info bubble, summary line, README, `CLAUDE.md`, badge.
4. **Only if a gate misses:** number-neutral speedups (snapshots identical to commit 3).
5. **Batch notes** in `docs/next-batches-plan.md` (3C notes, a "Cliff plan" subsection): measurements, movers,
   decisions.

Each commit: `npm test` green; README, `CLAUDE.md` and badge with any user-facing or architectural change.

## 10. What Batch 5 owns now

- The deep search behind Optimize -> Apply, storing a plan of this shape in `state` (`normalizeState` guard, legacy
  cases), with a staleness flag and with/without success rates on its card.
- The objective registry; retiring `optimizeMultiLever`; migrating `appliedMixSchedule` / `appliedRothSchedule` into
  the plan.
- The tax-aware order, the two-return draw split and conversion sizing (Notes 1 and 2 of 3C section 13), as plan
  intents chosen by whole-run evaluation on the deterministic projection, never per path. The order may differ by
  age; it is fixed in the plan.
- Lambda's accuracy: the emptied-pool sample (defect below), the multiplier `m`, against the slow reference.

**Lambda's emptied-pool sample (defect, recorded; not changed here).** When the walk empties the traditional pool
before a sample year, the sample moves to the year the pool empties and prices the small remaining draw at about 0%,
pulling lambda low (8a review: two samples at 22% and one at 0, lambda about 0.147). In this design lambda only
proposes and the keep rule decides with real projections, so it can cost value, not standard depletion. This batch
flags it (`movedSample`) and the scan counts it against family rejections; Batch 5 compares against the slow
reference and decides between correcting the sample, tuning `m` and replacing the estimator. It is not changed here
because the semantics of lambda change in this batch; changing the estimator too would confound the movers.

**Known remaining path dependence.** The live-mix toggle (`pickLiveWithdrawalOrder`) still chooses each year on each
path from that path's own tax. It is the order lever, which is Batch 5's (13.3); changing it here would muddy the
movers. Batch 5 replaces it with plan intents.

## 11. Out of scope

Everything in section 10; Canada (4A/4B, which now port the plan machinery rather than an in-path solver); state-law
cliffs as candidates; IRMAA discounting; the life events (Batch E); the with/without rates in the UI.

## 12. Risks

- **Planning cost every render.** One chooser run plus up to three projections; gated at 5x a plain `simulate()`.
- **Replay drift.** If `choose` and `apply` ever diverge in seeding or snapshots, the whole-plan candidate is no longer
  free and rule A's comparison is on the wrong run; the replay test pins it.
- **A plan optimized for one market.** On a boom or crash path an intent can be pointless (skipped) or impossible
  (fallback), and an IRMAA stay-under can use Roth for a tier the path never charges. Rule (a) bounds the harm; the
  scan measures it; a cost bound (option (b) of the brainstorm) comes back to the owner only with numbers.
- **Stale plans** in code paths that change state without `render()`; cleared at every state replacement, and tests
  that never plan run `off`.
