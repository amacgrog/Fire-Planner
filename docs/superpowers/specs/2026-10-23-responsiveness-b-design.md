# Design: responsiveness PR B (deferred heavy rendering)

**Roadmap:** prep item 3, PR B (`docs/roadmap.md`, "Current plan"). **Proposal:**
`docs/superpowers/specs/2026-10-22-responsiveness-proposal.md` (PR B section). **PR A:**
`docs/superpowers/specs/2026-10-23-responsiveness-a-design.md` (merged as #37: seeded Monte Carlo, the result cache).

## 1. Baseline (main at `ad78cf2`, after PR A)

`tests/bench_input.js` (new, section 6) in headless Chromium at 1280x900, a fresh page per row (the result cache starts
empty), the slider `k401PctA` (US) / `rrspPctA` (Canada), every value new. "Step" is the synchronous time of one `input`
event (median / p90 of 8); "drag" is 20 `input` events, one per animation frame: the median and the longest frame gap, and
the drag's total time (20 frames at 60 Hz is about 330 ms). All figures in milliseconds.

| Planner | View | Cards | Step median | Step p90 | Drag gap median | Drag gap max | Drag total |
|---|---|---|---|---|---|---|---|
| US | Projection | closed | 18.5 | 20.0 | 20.1 | 30.3 | 408 |
| US | Projection | open | 48.6 | 56.5 | 46.8 | 70.1 | 984 |
| US | Historical | closed | 70.4 | 107.0 | 63.5 | 76.9 | 1,282 |
| US | Historical | open | 99.0 | 165.8 | 101.0 | 175.1 | 2,167 |
| US | Monte Carlo | closed | 909.8 | 935.5 | 912.2 | 1,228.6 | 18,747 |
| US | Monte Carlo | open | 960.5 | 1,012.1 | 929.3 | 1,075.8 | 18,587 |
| Canada | Projection | closed | 12.9 | 17.7 | 16.2 | 20.7 | 331 |
| Canada | Projection | open | 38.4 | 43.4 | 38.8 | 47.3 | 799 |
| Canada | Historical | closed | 42.1 | 85.3 | 44.5 | 54.9 | 897 |
| Canada | Historical | open | 67.1 | 110.0 | 69.3 | 77.4 | 1,387 |
| Canada | Monte Carlo | closed | 656.3 | 746.7 | 628.6 | 656.2 | 12,587 |
| Canada | Monte Carlo | open | 706.8 | 908.3 | 686.9 | 708.3 | 13,750 |

Read: only the projection view with the cards closed keeps up with a drag (about one frame per step). Opening the cards
costs about 25-30 ms a step; the historical view 25-50 ms more; the Monte Carlo view freezes for 0.65-0.95 s a step, so a
20-step drag takes 13-19 s to play out.

## 2. What changes for the user

- Dragging a slider (or typing in a number field) updates the headline tiles, the plan status bar, the projection chart
  (including the ±1 / ±3 yrs and CAGR lines), the year table and the warnings at once, as today.
- The **historical and Monte Carlo chart views** and the **open analysis cards** (sensitivity tornado, Roth optimizer,
  Sankey, decision-question previews) keep their last picture, dimmed, while the slider moves. They catch up when the
  slider is released, or after 250 ms without input (a typed number, a held arrow key).
- Everything else (buttons, toggles, selects, checkboxes, load, undo, reset, the MCP tool, scenario swaps, the chart view
  and card toggles) still redraws everything at once, as today.

## 3. The scheduler

A new module `src/shared/ui/results/render-scheduler.js`:

- `scheduleRender()`: runs the **light** render now (`render({ light: true })`), marks the deferred panels stale, and
  (re)starts a 250 ms timer for the deferred part.
- `flushRender()`: if a deferred pass is pending, cancels the timer and runs it now (`renderDeferred()`); otherwise does
  nothing.
- A full `render()` cancels a pending deferred pass (it does that work itself) and clears the stale marks.

Callers:

| Caller | Today | After |
|---|---|---|
| number field `input` (`field-listeners.js`) | `render()` | `scheduleRender()` |
| the same field's `change` (slider released, text field blurred or Enter) | none | `flushRender()` |
| add-as-you-go list text/number `input` (`dynamic-list-editing.js`) | `render()` | `scheduleRender()`, `change` flushes |
| the safe-withdrawal-rate box on the FI tiles (`headline-tiles.js`) | `render()` | `scheduleRender()`, `change` flushes |
| select / checkbox `change` fields, buttons, list add / remove, everything programmatic | `render()` | unchanged (full, synchronous) |

**The light render runs synchronously in the `input` event, not on the next animation frame** (a change from the
proposal; owner decision, section 8). Reasons:
- Chromium and Firefox already deliver pointer-driven `input` events at most once per frame (mouse moves are aligned to
  animation frames), and keyboard auto-repeat is about 30 per second, so coalescing to a frame would rarely merge
  anything. The drag figures in section 7 measure this.
- About 35 test scripts set a field and read the DOM right after. A synchronous light render keeps every one of them
  valid; a frame-deferred one would make them depend on timing.
- The light render costs about one frame (section 1 and 7), so it does not fall behind.

**`renderDeferred()`** (per country, beside `render()` in `results/render.js`, reached from shared code through a new seam
facade `seam-renderDeferred.js` in each country) takes `simulate()` (a cache hit since PR A) and runs the deferred parts:
- the chart view, when it is historical or Monte Carlo (`renderChartView(selected)`);
- each open card: `renderTornadoChart`, `renderRothOptimizer` (Canada: plus `annotateRothOptimizer`), `renderSankey`,
  `renderDecisionQuestionPreviews`.

`render()` calls the same function at the point where it runs those parts today, so the full render's order and output
are unchanged; with `{ light: true }` it skips them and marks them stale instead.

**Stays in the light render** (cheap, or cache hits; section 7 checks it): the projection chart views, the table and its annotations,
the plan headline, the shortfall banner, the unusual-assumption warnings, the scenario comparison (its runs are cache
hits) and the plan status bar. The status bar's historical success rate keeps its own 500 ms debounce
(`schedulePlanStatusHistRate`).

## 4. Stale marks

- A `stale` class on the chart wrapper and the visible success card (`#histSuccessCard` / `#mcSuccessCard`) when the view
  is historical or Monte Carlo, and on the body of each open deferred card; `aria-busy="true"` on the same elements.
- CSS: `opacity: .5` with a short transition, in `src/shared/styles/styles.css`. No spinner, no text change.
- Removed by `renderDeferred()` and by every full `render()`.

## 5. Tests

- **Hook:** `window.__test_flushRender()` (shared `install-test-hooks.js`) runs any pending deferred pass.
- **New root script** `test_deferred_render.js` (both planners, page clock installed):
  - in the Monte Carlo view, a slider `input` leaves the success rate unchanged and the panel stale; `__test_flushRender()`
    updates it to the figure a full `render()` gives and clears the mark;
  - the field's `change` event does the same; so does 250 ms of idle (`page.clock.runFor`);
  - a second `input` within 250 ms restarts the timer;
  - a full render (a chart-view click) while pending clears the mark and runs the deferred work once;
  - with the tornado card open in the projection view, the same for the tornado;
  - the projection chart, tiles and `window.fireProjectionRows` update synchronously on `input`.
- **`test_result_cache.js`:** its slider round trip in the Monte Carlo view would compare the old (stale) text with
  itself; it flushes after the nudge so the check keeps meaning something. No expectation changes.
- **Every other script and `tests/snapshot_ui.js`:** expected to pass unchanged (`snapshot_ui` advances its page clock by
  400 and 600 ms after each `input`, so the 250 ms pass runs before its capture). Any script that needs a flush is listed in
  the commit with the reason.
- `npm test` and `npm run test:ui` green.

## 6. Benchmark

`tests/bench_input.js` (committed, not in `npm test`; listed in `docs/architecture/test-inventory.md`): step, drag and
release timings per planner, chart view (projection, historical, Monte Carlo) and card setting (all closed, all open),
`--root DIR` to time another build.

## 7. Measured after

(Filled in after the implementation, same script, same machine.)

## 8. Decisions for the owner

1. **Light render synchronous, not once per animation frame** (section 3). **Decided (owner, 2026-10-23):** the cost per
   step is the problem, not how often the page redraws; the light part keeps following the slider live, one redraw per
   `input` event, and no throttle is added.
2. **250 ms idle**, flush on `change`, as the roadmap says.

## 9. Docs, version and commits

- Version badges: US V131 → V132, Canada V61 → V62.
- `README.md`: a feature-list line (the Monte Carlo and historical views and the analysis cards update when the slider is
  released, so dragging stays smooth).
- `CLAUDE.md`, "Inputs" invariants: field `input` listeners call `scheduleRender()`, never `render()`; programmatic callers
  call `render()`; a test that dispatches `input` and reads a deferred panel calls `__test_flushRender()` first.
- `docs/architecture/inputs-and-ui.md` (the render paragraph), `module-system.md` (the new seam name, 27),
  `test-inventory.md` (the script, the bench, the hook), `docs/reference.md` (short entry), `docs/roadmap.md` (PR A done).
- `npm run analyze` for the new module and seam.
