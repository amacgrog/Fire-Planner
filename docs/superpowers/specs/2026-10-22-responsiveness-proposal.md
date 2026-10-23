# Proposal: responsiveness (seeded Monte Carlo, a result cache, deferred heavy rendering)

**For:** the roadmap in PR #32 (`claude/roadmap-new-path`, `docs/roadmap.md`, "Current plan").
**Ask:** add this as a new prep item, **between item 2 (triage the root `test_*.js` scripts) and item 3 (correctness spot-check)**, renumber the items after it, and record it as below. Docs only in the roadmap PR; the work itself is two code PRs.

## Why

Measured on the built US planner at `8126921` (headless Chrome in a sandbox, so treat the figures as rough). Each slider `input` event runs `render()` synchronously (`src/shared/ui/inputs/field-listeners.js`), so the cost of one render is the cost of one slider step:

| Chart view | Time per slider step |
|---|---|
| Projection (default), result cards closed | ~30 ms |
| Projection, every result card open | ~100-180 ms |
| Historical backtest | ~80 ms |
| **Monte Carlo, 1,000 paths** | **~1,250 ms** |

- In the Monte Carlo view, every step re-runs all paths. The page freezes for over a second per step, and the queued events pile up behind it. A first-time user who drags a slider in that view sees a broken tool.
- **Monte Carlo is unseeded.** `bootstrapReturnSeries` in `src/shared/core/projection/simulate.js` calls `Math.random()`, so every render redraws the paths. The success rate changes whenever anything re-renders, including opening an unrelated card. A user watching that number will reasonably stop trusting it.
- **The default view computes the same projection more than once per render.** `render()` calls `simulate()`, and then `renderPlanStatusBar()` and the chart view call it again. A CPU profile of the default view put about a third of a render in the projection and about two thirds in DOM work:
  - the year table rebuild (`renderTable`),
  - the chart redraw,
  - forced layout reads in `syncPlanStatusOffsets` (`getBoundingClientRect`).
- **The engine itself is not the problem.** One `simulate()` takes about 1-6 ms and has already been tuned (CLAUDE.md lists micro-optimizations that were measured and rejected). The problem is how many times it runs per step.

**Why now (before real users, after the test triage):**
- **Before real users:** a one-second freeze and a jittering success rate are first-impression problems. The real users' main question, Roth conversions, leans on the Monte Carlo view.
- **After the test triage:** PR B changes *when* parts of the page update. The root UI scripts are the tests that would catch a control that no longer refreshes, so they should be running in CI first.

**Why it is safe now:** the stateless engine (PRs #28-31) makes a projection a pure function of its run context (inputs, tax year, plan, overrides). That gives a well-defined cache key, and it is the same property the cliff plan cache already relies on (`cliffPlanCache` in `src/us/core/cliff-plan/planning.js`).

## Scope: two PRs

### PR A: seeded Monte Carlo and a result cache (core and store layer; Vitest-testable)

1. **Seeded Monte Carlo.**
   - Replace `Math.random()` in `bootstrapReturnSeries` with a small PRNG local to the Monte Carlo run. Use mulberry32, the generator `tests/historical_rates.js` already uses.
   - Seed it from a hash of the inputs: the state JSON, the path count and the tax year. The same inputs then always give the same paths and the same success rate.
   - This is an intended behavior change: Monte Carlo output differs from today's random draws.
   - `tests/snapshot_ui.js` pins `Math.random` and hashes the rendered text with every card open, so its baseline will move. Update it with `npm run snapshot:update` and say so in the commit.
   - `tests/snapshot.js` (the engine snapshots) is expected not to move. Confirm it.
   - `tests/historical_rates.js` stubs `Math.random` to seed Monte Carlo. Switch it to the new seed so it keeps measuring something meaningful.
2. **A bounded result cache in the store layer**, the wrappers in `src/shared/core/projection/simulate.js`, never in the engine.
   - **What is cached:** `simulate(a, b)`, `runHistoricalCycles()` and `runMonteCarlo(n)`.
   - **The key** is everything the run reads:
     - the tax year,
     - the state JSON,
     - the plan identity (US: the plan the context applies),
     - the optimizer override maps (US),
     - the call's own arguments (retirement ages, path count).
   - Compute the state JSON once per state change, not per call. `refreshCliffPlan()` already stringifies the state on every render, so reuse that.
   - **Size:** about 16 entries, cleared when full, like `cliffPlanCache`. Register the cache in `tests/engine-purity.json` if the guard sees it, and keep it out of engine modules.
   - **Prerequisite audit:** cached results are shared, so check that no `ui/` caller mutates a result (rows, `paths`, `cycles`). Add a Vitest check that runs the UI's consumers on a deep-frozen result, or freeze results in test builds.
   - **What it buys:** re-renders where no input changed become lookups. That covers opening or closing a card, switching real/nominal, changing the chart view or x-axis, and dragging a slider back over values already visited. The duplicate `simulate()` calls within one render become hits automatically. Pass the render's own `selected` result down where that is simple anyway.
   - **Out of scope:** the analysis and optimizer variants run through `variantContext` / `simulateWith`, not the wrappers, so they are not cached.
3. **Tests:**
   - Vitest: same inputs give an identical Monte Carlo result; changing one input changes the seed; a cache hit returns the identical object; every key field invalidates; the size bound holds.
   - The ratchet test (`tests/unit/shared/engine-ratchet.test.js`) still passes.

### PR B: deferred heavy rendering (UI)

1. **Split `render()`** into an immediate part and a deferred part.
   - **Immediate:** the headline tiles, the plan status bar text, the projection chart and the table.
   - **Deferred:** the Monte Carlo and historical chart views, and the open analysis cards (tornado, Sankey, decision previews, the Roth optimizer card).
2. **Field `input` listeners call `scheduleRender()`**:
   - the immediate part runs coalesced to one per animation frame (`requestAnimationFrame`);
   - the deferred part runs on the field's `change` event (slider released) or after about 250 ms without input.
   - The plan status bar already defers its historical success rate this way (`schedulePlanStatusHistRate`).
   - While deferred work is pending, the affected panels get a "stale" class (dimmed), not a spinner.
3. **Programmatic callers keep a synchronous full `render()`.** These are load, undo, reset, the MCP tool, scenario swaps and the chart view buttons.
4. **Test support:**
   - Add `window.__test_flushRender()`, which runs anything pending synchronously.
   - `snapshot_ui.js` and every Playwright script that dispatches an `input` event and then reads the DOM must call it, or wait for it.
   - The triage in prep item 2 should already have those scripts in CI, so a missed one fails loudly.
5. **Stretch, only if measured worth it:** skip the year-table rebuild while the table is collapsed or off-screen.
6. **Benchmark:** commit the timing script as `tests/bench_input.js` (not in `npm test`), alongside the other bench scripts. It measures the median and p90 per-input time in the projection, historical and Monte Carlo views, with cards closed and all open, so the targets below can be checked and re-checked.

## Acceptance

- **Monte Carlo view while dragging:** each step costs about the same as the projection view (target ≤ 40 ms median). The Monte Carlo result appears within about 1.5 s of release.
- **Projection view:** no slower than today; the duplicate `simulate()` calls are gone.
- **Stability:** the same inputs show the same Monte Carlo success rate across renders. Opening or closing a card or switching the chart view never changes it.
- **Tests:**
  - `npm test` is green.
  - `tests/snapshot.js` is unchanged.
  - `tests/snapshot_ui.js` changes only through the seeded Monte Carlo figures, stated in the PR A commit.
- **Version and docs:**
  - Bump both planners' version badges, since this is user-facing.
  - Add a README line: the Monte Carlo figure is now reproducible.
  - Add a CLAUDE.md rule, in the slimmed file's invariants:
    - field listeners call `scheduleRender()`, never `render()`;
    - tests that dispatch input flush with `__test_flushRender()`;
    - the projection result cache lives in the store layer, and its key must include every field the run reads.

## Not in scope (record in the roadmap)

- **Monte Carlo in a Web Worker:** "Later, not scheduled". The engine is DOM-free and context-driven since the stateless engine, so it can run off the main thread. That would also let the paths split across cores. The single-file offline build would need the worker inlined and started from a Blob URL. That works from `file://` in Chrome, but must be checked in Safari and Firefox. Revisit only if deferral plus the cache are not enough.
- **Dependency-tracked reactivity** (re-running only what an input affects): this stays with "Centralized state writes" in the on-demand refactors. Nearly every engine output depends on nearly every input, and each year depends on the year before, so the engine gains little. Pursue it only if the UI side needs it.
- **Engine micro-optimization:** not the bottleneck.

## Suggested roadmap text (insert as prep item 3, renumber 3-4 to 4-5)

> 3. **Responsiveness** (one to two days; two PRs). Each slider step runs `render()` synchronously: ~30 ms in the default view, but ~1.25 s in the Monte Carlo view (1,000 paths re-run per step), and Monte Carlo is unseeded, so its success rate changes on any re-render. PR A: seed Monte Carlo from the inputs (mulberry32, as `tests/historical_rates.js`), and add a bounded result cache for `simulate` / `runHistoricalCycles` / `runMonteCarlo` in the store layer, keyed on the tax year, the state JSON, the plan, the overrides and the call's arguments (safe since the stateless engine; same pattern as `cliffPlanCache`); `snapshot_ui` moves for the Monte Carlo figures only, stated. PR B: field listeners call `scheduleRender()`: the cheap part once per frame, the Monte Carlo and historical views and the open analysis cards on release or after ~250 ms idle (dimmed while stale); programmatic callers keep a synchronous `render()`; tests flush with `__test_flushRender()`; timing script `tests/bench_input.js`. After item 2 because the root UI scripts are what catch a control that stops refreshing; before real users because a frozen slider and a jittering success rate are first-impression problems. Proposal: [this document].

Also update:
- the prep heading's estimate, from "under a week" to "about a week";
- "Later, not scheduled": add "Monte Carlo in a Web Worker";
- the "Centralized state writes" bullet: add one sentence saying that dependency-tracked recomputation, if ever wanted, belongs there.
