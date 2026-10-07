Superseded by Batch 3C (see the spec, `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md`, and the
3C notes in `docs/next-batches-plan.md`); kept for the record.

# Batch 3C prototype (throwaway, not part of the app)

Scratch work from the 3C exploration, kept so a new session can reproduce the numbers in
`docs/next-batches-plan.md` (now "Batch 3C notes", "Exploration findings"). Not wired into `npm test`.

- `safe-magi-cap.diff`: a patch against `Planner_US.html` at 65704ca (V92). Adds `window.__ROOMFIX`
  (corrected draw room: `ceiling - magiBase - conversionAmount`) and `window.__CAP` (cap the
  non-penalized traditional draw at that room; last uncapped traditional pass before home equity).
  Standard engine only; the bucket engine, penalty-aware paths and live mix are not done. Apply to a
  scratch worktree, never to the working tree: `git worktree add ../scratch-3c HEAD && cd ../scratch-3c &&
  git apply ../Fire-Planner/docs/batch-3c-prototype/safe-magi-cap.diff`.
- `scan.js <worktree-root>`: runs 972 US scenarios (live/smooth/default, ACA on) with the cap off and on and
  prints, per mode, how many moved and how many ended higher/lower and depleted later/earlier. Run it from
  the repo root so `playwright` and `tests/legacy_balances` resolve (`node docs/batch-3c-prototype/scan.js <root>`).
