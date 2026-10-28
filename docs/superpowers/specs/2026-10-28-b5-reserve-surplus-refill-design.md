# Batch 5 step 5b fix: the maintained bond reserve's refill in a surplus year (design outline)

Status: outline for the owner's OK (2026-10-28). The owner asked for this fix before piece 3's re-measure: "Fix the 5b reserve's
surplus-year refill first as its own piece with its own movers; then re-measure piece 3 and stop for me." No code yet.

## 1. The gap

Step 5b (PR #58) keeps the standard projection's bond reserve near `stdBondTarget = reserveSpend * bondYears`.
- `trimBondReserve` runs every year, before the withdrawal, and moves any excess back to stocks.
- `refillBondReserve(w, stdBondTarget, { maxMove: reserveSpend })` runs only in a **deficit year** (`flow < 0`), after
  `withdrawStandard`. It is at `src/us/core/projection/run-projection.js:1114` and at
  `src/canada/core/projection/run-projection.js:306`.
- A **surplus year** (`flow >= 0`) refills only through `routeSurplus`, from the year's spare cash and up to the target.

So when something drains the reserve in a surplus year, nothing moves stocks back into bonds. The reserve then decays while the
target stands.

**The case that exposed it** (piece 3 R3, `docs/next-batches-plan.md`, "R1-R3", finding 2) is the two-return couple at life 100,
sized.
- The sized plan empties stock traditional by 74.
- From 75, the RMDs ($25.7-28.2k a year) can come only from `bondTraditional`. The RMD takes stock traditional first
  (`rmdFromTrad`, `run-projection.js:870`).
- Those years are surplus years, so `routeSurplus` gets $2-4k and cash takes it first.
- The reserve falls from $660k to $323k real by 100, against a target of about $604k.
- The bond share falls by 1.5 points.

Sizing exposes the gap; it does not cause it. Any plan that empties stock traditional before the RMDs behaves the same: a
user's own conversions, a high bracket, a small traditional balance. So can any surplus year whose reserve sits below target
after a bad bond year on a historical path.

## 2. The fix

In the standard projection, a surplus year that holds the reserve (`stdBondTarget !== null`) also calls the refill after
`routeSurplus`, **as a tax-free reallocation only**:
- It moves traditional stocks to `bondTraditional`, then Roth stocks to `bondRoth`, up to `min(deficit, reserveSpend)`. That is
  the same step as the deficit year's.
- It **never sells taxable** in a surplus year.

The reasons for leaving taxable out:
- A surplus year's tax is settled without a draw. A taxable sale there would add a gain the surplus branch never taxes, and a
  MAGI the iteration never saw. This is the open follow-up I1, which this fix does not widen.
- Inside a retirement account the move is a reallocation: no income, no tax, no penalty (`bond-ladder.js:55-66`).

The change:
- `refillBondReserve` gains an option, `{ taxable: false }` (default `true`, today's behaviour). The deficit-year calls are
  unchanged.
- **Both countries.** Canada's standard projection has the same branch (`src/canada/core/projection/run-projection.js:306`)
  and the same gap, so its surplus branch gets the same call. Canada's RRSP / TFSA reallocation is the same tax-free move.
- The bucket strategy is unchanged. Its refill is its own design (up years, `refillCap`), and its buy-year flaw is a separate
  follow-up.
- Order inside the surplus year: `routeSurplus` first, so spare cash fills bonds before any stocks move, then the reallocation.
  So a year whose surplus already reaches the target moves nothing.

## 3. What moves

Only scenarios that hold the standard reserve (`bondYears > 0`, after the ladder build) and have a surplus year below target
can move. In the deterministic projection that is mainly plans whose RMDs reach `bondTraditional`. Historical paths add years
after a bond loss.

Task 1 measures the movers before anything is updated: the US and Canada snapshots, golden, `plan_off_anchor`, and the
legacy-state baseline. Each mover gets before / after:
- depletion;
- first home draw;
- end value;
- the reserve at the last age;
- the first year the refill moved money.

The prediction to check: a standard (shift-0) mover never depletes earlier, because the move is tax-free and only between
assets. Its return changes, though, so on a path with low bond returns a mover can end lower. That gets recorded, not hidden.
Historical movers are classified.

## 4. Where it lands (for the owner)

This is "its own piece": a separate commit series with its own movers list and its own `snapshot:update`.

- **(a) Recommended: on its own branch from main** (`claude/b5-reserve-refill-<id>`, a new worktree), as its own PR (US V147,
  Canada V66). The piece 3 branch then merges that branch locally before its re-measure. Piece 3's badge moves to V148, and its
  movers are listed against a baseline that already has the fix.
- **(b) On the piece 3 branch,** as separate commits before piece 3's R4. This is simpler, but piece 3's PR then carries an
  unrelated behaviour change.

## 5. Tasks (after the OK)

1. **Measure the movers, then stop for the owner** with the movers table.
   - A Vitest case: a household whose stock traditional is empty before its RMDs keeps the reserve at target through the RMD
     years with the fix, and decays without it.
   - The option `{ taxable: false }` never touches taxable.
   - A surplus year that `routeSurplus` already filled moves nothing.
2. **On the OK:**
   - `snapshot:update`, as an intended change;
   - the badges;
   - the README (the maintained reserve's line);
   - `docs/architecture/engine.md` (the reserve) and the batch notes.

   Then run `npm test` and `npm run test:ui`, and an Opus review.
3. **Piece 3's re-measure on top** (B0.11.7: the yardstick, the fill probe, the scan, the gates). Then stop for the owner with
   the figures, including piece 2's bond-share reading on the two-return couple at 100.
