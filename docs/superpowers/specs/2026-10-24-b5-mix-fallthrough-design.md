# A withdrawal mix's shortfall falls through to the other stock accounts (US) — design

Date: 2026-10-24. Status: draft for the owner's approval. Area: `src/us/core/withdrawals/strategies.js`
(`drawMixedStockAccounts`, `withdrawStandard`, `BUCKET_STEP.stocks`). Read with
[engine.md](../../architecture/engine.md) ("Withdrawals") and the Batch 5 step 2 notes in
`docs/next-batches-plan.md` (Reading 2), where the defect was recorded.

## Intent

A pre-existing US engine loophole, exposed by Batch 5 step 2 (the objective registry, PR #46): when a mix mode is
active, `withdrawStandard` skips the default taxable -> traditional draw entirely. A mix splits the year's need into
fixed shares, each drawn from its own bucket; a share its bucket cannot cover is not passed to the other stock accounts.
For a one-bucket mix (`roth` = [0,0,1], `taxable` = [1,0,0]) the other stock accounts sit out the year once that
bucket is dry, and the shortfall falls through Roth, cash, the bond reserve and the inherited accounts to
`takeHomeEquity`, a tax-free, cost-free last resort. An after-tax end-value search (the default objective since step 2)
exploits this: it spends the house and leaves the stocks compounding. Measured (step 2 notes): the TX gap case's reference
is `roth` every year 60-84 and ends with 9.9M taxable against 0; NY is `taxable` from 60; the default household's mix
lever alone suggests "Roth only" in 21 of 30 years for +$2.29M, with real end home equity 611,662 -> 281,898. The
multi-lever card can recommend this today, so it must be fixed before any build reaches real users.

## Decisions (the owner's, 2026-10-24)

1. **A mix's shortfall falls through to the other stock accounts, in the default order, before cash, bonds,
   inherited accounts and home equity.** After the mix's shares are drawn, any need left runs the default
   stock-account draws: taxable, then penalty-free traditional (both under the cliff plan's MAGI cap, decision 4), then Roth in
   its existing place. A one-bucket mix thereby means "this bucket first", not "only this bucket".
2. **Home equity stays a free last resort.** No borrowing or sale cost. After decision 1 it is reached only once every
   liquid account is empty, where there is no choice left for a search to exploit. Pricing it is recorded as a later
   modelling question, not part of this fix.
3. **The mix menu is unchanged.** `WITHDRAWAL_MIX_CANDIDATES` keeps `taxable` and `roth`; saved `appliedMixSchedule`
   entries stay valid with no migration.
4. **The fallthrough is cap-aware.** In a year where the cliff plan holds MAGI under a line (`wd.magiCap` set,
   `yearPlan.kind === 'under'`), the fallthrough draws taxable only up to the MAGI room left (a sale whose gain portion
   fits `magiCapLeft(wd)`), then traditional within the room still left, and the rest goes on to Roth, cash and bonds as
   today. `releaseMagiCap` (which lifts the cap before inherited money and home equity) also releases the taxable money
   the cap held back: taxable, then traditional (stocks, then the bond bucket, as now). Why: the cap clamps only
   traditional draws; a taxable sale's gain only counts against the room after the fact. The plan sized the cap from a
   natural run of the same withdrawal mode, so the mix's own taxable share produces the gain the plan counted, but a
   fallthrough taxable sale would be new, unclamped gain that could cross the very ACA / IRMAA line the plan holds.

## Goals

- No year draws home equity (or cash, bonds, inherited money) while penalty-free taxable or traditional stock money is
  left, under any mix mode, in both strategies (`withdrawStandard` and the bucket strategy's `stocks` step).
- Years where the mix covers the need are unchanged to the bit; plans with no mix mode are byte-identical.
- The re-run of `tests/solver_gap.js --objective endValue` and `tests/bench_optimizer.js --objective endValue` shows the
  home-equity columns no longer collapse (reference close to shipped) and the mix lever's end-value gains shrink to
  what a withdrawal order can honestly earn.

## Non-goals

- Pricing home equity; changing the fallback order after the stock step (Roth, cash, bonds, inherited, home; and the
  penalty-aware order of decision 10 of the penalty-aware design); changing the mix menu or the mix weights.
- Canada: its only mix mode is smooth withdrawals (balance-proportional, `drawSmoothStockAccounts`), which cannot strand
  a bucket except in the last-dollar edge below; Canada is left unchanged and recorded as such.
- The optimizer itself (steps 3-5 of Batch 5).

## Anti-goals

- Any change to a no-mix plan's numbers (`npm test`'s golden and snapshot grids must not move for scenarios without a
  mix mode).
- Draining penalized traditional money or Roth earnings early: the fallthrough uses exactly the draws the default
  branch uses, which see only what the tier may use.

## The change

In `withdrawStandard`, today:

```js
if (!drawMixedStockAccounts(wd, ...)) {
  wd.need -= takeTaxable(wd, 'taxable', wd.need);
  if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need));
}
```

becomes "run the mix if one is active, then, if need is left, the fallthrough": a taxable draw (capped under decision 4
when `wd.magiCap` is set and not released; uncapped otherwise, exactly the default `takeTaxable`) and then the default
traditional draw (`takeTraditional`, which already honours the cap and adds to `cappableTraditional`). The bucket
strategy's `stocks` step does the same with its own bisection bracket (`solveTraditionalForNetFromNeed`), and keeps its
Roth step as is (penalty-aware: Roth is its own later step). The rest of both cascades is untouched, except
`releaseMagiCap`, which first draws any taxable left (uncapped, now that the cap is off) and then traditional as now.

**The capped taxable draw.** The gain ratio of a taxable sale is fixed by the bucket (`1 - basis / pool`), so the most
it may sell under the cap is `room / gainRatio` gross (all of it when the gain ratio is 0). Drawing it as a sale from a
pool of that size with basis in the same proportion keeps the gain ratio and lets `drawTaxable` solve the net as
usual. Only the fallthrough's taxable draw is capped: the mix's own taxable share, the default no-mix draw and the live
mix stay as they are (the plan counted their gains).

**No-mix years stay byte-identical.** The default branch draws taxable uncapped until the need is met or taxable is
empty, so in a no-mix year the extra taxable step in `releaseMagiCap` meets an empty taxable account (or no need) and
does nothing. This is checked, not assumed (the snapshot grids and `tests/plan_off_anchor.js`).

**Which mix modes it applies to (builder's call within decision 1, flagged for the owner):**
- an explicit mix (optimizer override `withdrawalMixByAge` or `appliedMixSchedule`): yes, the defect itself;
- smooth withdrawals (`smoothWithdrawals`, and the `smoothed` candidate): yes. Its shares are balance-proportional, so a
  bucket comes up short only in a last-dollar year (the tax gross-up exceeding what is left); the same rule applies so no
  mode can strand a bucket;
- the live mix (`withdrawalMixEnabled`): it already cascades fully between taxable and traditional
  (`pickLiveWithdrawalOrder`), under `min(freeTrad, magiCapLeft)`. Whether the default draws after it are a no-op to the
  bit is measured, not assumed: if they move any live-mix scenario by a bisection residual, the fallthrough skips the
  live mode (it already satisfies decision 1).

The fallthrough must not credit back a bisection overshoot: a mix draw can leave `wd.need` slightly negative; the
default draws run only when `wd.need > 0`, as the default branch does now.

Hot-path rules ([engine.md](../../architecture/engine.md)): no allocation, no new module-level state, no new snapshot
entry (the withdrawal is inside the year body and writes only `bal` fields and `wd` totals that already exist).

## Measuring what moves

On a base tree at `origin/main` (`1ece7f3`) and the fix:
- `npm test`: the golden math and the snapshot grids. Expected: only scenarios with an explicit or smooth mix in a
  short year move. Every moved snapshot scenario is listed (name, mix mode, years affected, end value before/after) in
  the batch notes; the baselines are updated with `npm run snapshot:update` only for those, said so in the commit.
- `node tests/plan_off_anchor.js --base <base dist>`: the count identical / different.
- `tests/penalty_aware_withdrawals.js`, `test_live_withdrawal_mix.js`, `test_apply_optimizer_schedule.js`, the
  multi-lever Vitest suites (`multi-lever-*.test.js`, `objectives.test.js`): the mix and applied-schedule paths. A
  fixed expected value that moves is re-derived by hand, not copied from the run.
- `tests/solver_gap.js --objective endValue` (both lengths) and `tests/bench_optimizer.js --objective endValue`: the
  tables re-recorded in the batch notes beside step 2's, with the home-equity columns and the default household's
  mix-lever-alone figure (step 2's +2,292,391, end home equity 281,898) re-measured.

## Tests

- A new Vitest case (US): a household with a `roth` applied mix in a year whose Roth is empty and taxable is not draws
  from taxable, not from home equity, and its home balance is unchanged; the same with `taxable` and traditional; one
  for the bucket strategy (historical) `stocks` step; one penalty-aware year (penalized traditional untouched, free
  traditional drawn); one capped year (a `thirds` mix with the cap binding: the fallthrough's taxable gain stays within
  the room, the year's MAGI does not exceed the target, and `releaseMagiCap` draws the held-back taxable before home
  equity). Expected values hand-computed or two-run comparisons (CLAUDE.md, Vitest rules); an optimizer whose chosen
  schedule changes is checked by two-run comparison only.
- A no-mix plan is byte-identical before and after (covered by the existing grids).

## Docs and versioning

- `docs/architecture/engine.md`, "Withdrawals": the fallthrough rule; the comment in `mix.js` above
  `pickLiveWithdrawalOrder` (point 2 says a proportional split's shortfall does NOT roll over; it now does) and the
  `drawMixedStockAccounts` comment.
- `docs/next-batches-plan.md`: a "Batch 5 step 2b" (or similar) notes entry with the before/after tables, the moved
  scenarios, and the recorded later question (pricing home equity).
- `README.md` if its feature list describes the mix's fallback; the US version badge bumped (user-facing numbers
  change).

## Builder's calls (flagged for the owner)

- **Mix labels:** "Taxable only", "Traditional only" and "Roth only" (`src/us/ui/results/roth-optimizer.js`, the mix
  label map) become "Taxable first", "Traditional first" and "Roth first", so the UI says what the engine now does.
  The UI snapshot hashes move for that reason too.
- **The smooth and live modes** follow the fallthrough as described above (smooth: yes; live: yes unless it moves a
  live-mix scenario by a bisection residual, in which case it is skipped for live).
- **If the re-measurement does not show the collapse gone** (end home equity of the end-value reference still far below
  the shipped run's, or mix-lever gains still in the millions on the default household): stop and report to the owner
  before widening the fix; do not chase a second route in this PR unasked.
- **One PR**, with the moved scenarios, the live / smooth measurements and any cliff-plan year whose MAGI lands over its
  target recorded in the batch notes for the owner's review.
- Goal 1 reads "under the cap, as the default does": in a capped year, cash and bonds may still be drawn before
  capped stock money (that is the cliff plan's purpose); `releaseMagiCap` guarantees the stocks before home equity.

## Left to the builder

The exact code shape (a flag returned by `drawMixedStockAccounts`, or the default draws called after it); the test
households; the batch-notes headings.
