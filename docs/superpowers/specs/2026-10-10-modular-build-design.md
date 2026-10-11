# Modular source tree and single-file build: design

Date: 2026-10-10
Status: approved; open items resolved (section 10)

## 1. Goal

Replace the marker-based shared-code sync (`// @@shared:x begin` regions, `shared/`,
`scripts/sync-shared.js`) with real ES module imports in a conventional `src/`
directory tree, and shrink the planner HTML files to small shells. The delivered
artifact is still one self-contained HTML file per planner, produced by a build step
and published to GitHub Pages.

Secondary goal: the calculation engine and tax logic run under plain Node, so they can
be covered by fast Vitest unit tests with no browser.

### Success criteria

- `src/` holds the code; there is no `@@shared` marker and no `sync-shared.js`.
- `npm run build` writes `dist/Planner_US.html` and `dist/Planner_Canada.html`, each a
  single file that works when opened from `file://` with no server and no network.
- Every existing test passes against the built files. The snapshot baselines
  (`tests/snapshots/*.json`) are unchanged by the refactor itself.
- `src/**/core/` can be imported in Node (no `document`, `window` or `localStorage`),
  and a check enforces that.
- GitHub Pages publishes `dist/` from CI. Built files are not committed.
- `CLAUDE.md`, `README.md` and the other living docs describe the new structure.

### Non-goals

- Merging the US and Canada engines. They stay separate (see
  `docs/phase2-refactor-plan.md` section 7, step 4.5). Merging is a later project.
- Any behavior change. Numeric output must not move.
- Adding a framework, TypeScript, or hot reload now (see section 7).

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Bundler | esbuild, driven by `scripts/build.js` | One dependency, no config sprawl, emits a classic IIFE. Webpack and Vite add machinery the single-file output does not use. |
| Output format | Classic IIFE `<script>`, not `type="module"` | Module scripts are blocked on `file://` in some browsers. |
| Built files | `dist/`, gitignored | Avoids committing generated duplicates of the source. |
| Hosting | GitHub Pages, source "GitHub Actions" | Publishes a build artifact, so no committed HTML is needed. |
| Layout | `src/shared/`, `src/us/`, `src/canada/` | Matches the existing conceptual split. Shared holds what is identical today. |
| Shared mutable state | A few small exported singletons (`store`, `ui-prefs`, `dom`) | ES modules cannot share a mutable `let`; explicit singletons replace the closure. |
| Unit tests | Vitest in Node against `core/` | Fast, no browser. Playwright stays for UI and for the built artifact. |
| Hot reload | Deferred; Vite can be layered on later as a dev tool | See section 7. |

## 3. Target layout

```
src/
  shared/
    core/        pure logic identical in both planners
    ui/          DOM code identical in both planners
    styles/      the shared stylesheet
    partials/    shared HTML fragments (replaces shared/html-*.html)
  us/
    core/        engine, tax, rules, data, normalizeState
    ui/          render, sync, charts, wizard
    index.html   shell template
    main.js      entry: wiring, window.__test_* hooks, MCP registration
  canada/        same shape as us/
scripts/
  build.js       esbuild plus HTML assembly
  gen-*.js       emit data modules instead of patching HTML
tests/unit/      Vitest, Node only
tests/           existing Playwright and golden tests, pointed at dist/
dist/            build output (gitignored)
```

### Boundary rules

1. Nothing under `core/` references `document`, `window`, `localStorage` or
   `navigator`. A check (lint rule or a Vitest test that scans imports and globals)
   fails the build if it does.
2. Only `ui/` and `main.js` touch the DOM.
3. `window.__test_*` hooks and the MCP tool registration are assigned only in
   `main.js`, never in `core/`.
4. US and Canada never import from each other. Both import from `shared/`.
5. `src/` stays plain ESM: no esbuild-only features (`define`, loaders that import
   `.html` or `.css` as text). This keeps a Vite dev server possible later.

## 4. Build

`scripts/build.js` does, per planner:

1. Bundle `src/<country>/main.js` with esbuild: `bundle: true`, `format: 'iife'`,
   `target` matching what the planners support today. No minification by default; an
   opt-in flag minifies release builds. Dev builds add inline source maps.
2. Read `src/shared/styles/*.css` and inline it into one `<style>`.
3. Assemble the HTML in a standalone function `assembleHtml({ shell, partials, css, js })`
   that replaces include markers in `src/<country>/index.html` with the shared partials,
   then inlines the CSS and JS. Kept standalone so a Vite plugin could call it later.
4. Escape any `</script` inside the inlined JS.
5. Write `dist/Planner_<Country>.html`, and copy the landing `index.html` into `dist/`.

`npm run dev` is the same build in esbuild watch mode. The build script must work on
Windows and Linux (CI).

### Data generators

`gen-state-rules`, `gen-province-rules` and `gen-benefit-rules` do not patch the
planner HTML. They scrape the `STATE_RULES` / `PROVINCE_RULES` / `BENEFIT_RULES`
block out of the planner script and render `docs/*-rules.md` from it. Stage 0
points them at `src/<country>/main.js` (the markers are unchanged). Once the rules
data lives in its own module (stage 3), they import that module instead of
scraping text, and their `--check` modes stay.

## 5. Tests and CI

- Playwright and golden tests resolve the planner path through one helper that points
  at `dist/`. `npm test` runs the build first.
- Vitest unit tests live in `tests/unit/` and import from `src/**/core` directly. New
  pure-logic tests go here. Existing Playwright tests are not bulk-converted; porting
  them is optional follow-up.
- Snapshot baselines stay untouched by the refactor. `npm run snapshot:update` remains
  reserved for intended behavior changes.
- `.github/workflows/test.yml` builds, runs all tests, and a deploy job (main only)
  uploads `dist/` with `actions/upload-pages-artifact` and `actions/deploy-pages`.
- One-time manual step for the repo owner: Settings, Pages, Source: GitHub Actions.

## 6. Staging

Each stage ends green (`npm test`, snapshot baseline unchanged) and is independently
shippable. Docs for each stage are updated in that stage. Amended 2026-10-11: the
`shared/` fragments are closure code (for example `simulateHistorical` assigns
`histTaxFactors`, declared elsewhere in the closure, and calls the country-specific
`runProjection`; the US planner has about 35 top-level mutable `let`s), so they
cannot become modules until their shared state and country-specific seams have
homes. The stages are therefore reordered, and only stage 0 and the inventory are
planned in detail up front; each later stage is planned from the previous one's
results.

0. **Pipeline.** Split each planner into `src/<country>/{index.html,styles.css,main.js}`,
   build `dist/` with esbuild, run all tests against `dist/`, deploy to Pages. The marker
   sync keeps working, retargeted at the source files. Plan:
   `docs/superpowers/plans/2026-10-11-build-pipeline-and-closure-inventory.md`.
   DONE (merged 2026-10-11).
1. **Inventory and foundations.** A closure analyzer reports every top-level declaration's
   dependencies, mutable bindings, DOM use, cycles and shared-region seams
   (`docs/superpowers/inventory/`; done in stage 0's plan). Then each cross-module mutable
   binding gets a home in a country-agnostic module, and shared code reaches
   country-specific functions through build-time import aliases. Designed in section 12.
2. **Shared fragments become modules**, in the inventory's leaf-first order, retiring the
   markers region by region; delete `sync-shared.js` with the last one.
3. **Peel `core/`.** Tax, per-year helpers, engine, `normalizeState`, `defaults`, rules
   data and the historical dataset. Add Vitest, the purity scan and first unit tests.
4. **Peel `ui/`.** Render, sync, charts, wizard and the MCP wiring move out last.

Stages 1-4 are each expected to split into several smaller steps, each leaving the
suite green.

## 7. Dev tooling: hot reload later

Vite's dev server can serve `src/` directly, so it can be added without changing the
release build, provided the two constraints hold: `src/` stays plain ESM (rule 5), and
HTML assembly stays a standalone function so a small Vite plugin can reuse it.

## 8. Documentation workstream

Docs change in the same stage as the code they describe.

**Rewritten (living docs):**
- `CLAUDE.md`: What this is, Files, Commands, Architecture, "Shared code between the
  planners", the testing checklist, and the versioning rule (the version badge lives in
  the shell template). Remove: stable filenames at the repo root, edit-the-fragment and
  `npm run sync`, one `<script>` per file. Add: the `core/` and `ui/` boundary, where a
  new field or per-year rule goes, "edit `src/`, never `dist/`", Vitest versus
  Playwright, and a line that older plans describe the pre-refactor layout.
- `README.md`: development setup, build, and the Pages URL.
- `package.json` scripts, `.github/workflows/test.yml`, `index.html` links.
- The three `gen-*` scripts and `docs/state-tax-rules.md`, `province-tax-rules.md`,
  `benefits-rules.md`.
- Architecture sections of `docs/reference.md`, `docs/roadmap.md` and
  `docs/phase2-refactor-plan.md` that describe the marker system or inline script.

**Left as historical record:** dated files under `docs/superpowers/specs/` and
`docs/superpowers/plans/`, and the verification-figure docs.

**Memory:** at the end, save project memories for the layout and `core`/`ui` rule and
for the docs-per-stage rule.

## 9. Risks

- **Hoisting and closure assumptions.** Functions used before their definition, or
  names shared implicitly through the IIFE, can break when split across modules. Stage 0
  keeps the closure intact; later stages move one cluster at a time under the full test
  suite.
- **Numeric drift.** The exact-match snapshots flag any change loudly.
- **`file://` behavior.** Tests must run the built single file, not `src/`.
- **Cross-platform build.** The script must run on Windows and Linux.
- **State interface churn.** About 67 `state.*` reads in the engine move to the store
  import (section 10). The live-binding design keeps these edits mechanical; the eight
  or so `state = ...` reassignments become `assignState(...)`.
- **Generator output review noise.** Moving generated data to modules produces a large
  one-time diff; keep that commit separate and mechanical.

## 10. Resolved decisions

- **Store.** `src/shared/core/store.js` exports `state` (a live binding) and
  `assignState(next)`. `state` is reassigned wholesale in about eight places today
  (load, scenario import, undo, backup restore); those become `assignState(...)`, and
  readers keep writing `state.x` unchanged. The shape mirrors Zustand's vanilla API so
  a library could be swapped in later. No state-management library now: input handlers
  mutate `state` in place, so a library's guarantees would not hold without converting
  every write, and Valtio-style proxies would slow the engine's hot path. Tests set
  state with `assignState(normalizeState({...}))`; Vitest isolates each test file.
- **No `inputs` parameter now.** Threading a whole-`state` parameter through the engine
  only moves the global into every signature. See section 11.
- **Purity check.** A Vitest scan (not ESLint; the project has no linter) reads every
  file under `src/**/core/`, strips comments, and fails on `document`, `window`,
  `localStorage`, `navigator`, `requestAnimationFrame` or `alert`. A second test imports
  each `core/` module in plain Node so a top-level DOM reference throws.
- **Minification.** Output is unminified by default: readable stack traces and view
  source, the tests run exactly what ships, and gzip on Pages covers transfer size. A
  `--minify` flag exists in the build script; if it is ever enabled by default, CI runs
  the suite once against the minified build.
- **Directory names.** Group by topic and name files by content, not by the `NN-`
  fragment numbers. Initial grouping, refined in stage 1 when each fragment is opened:
  - `shared/core/`: `store`, `constants`, `housing`, `income`, `withdrawals`,
    `guardrails`, `projection`, `decisions`, `sensitivity`, `taxFactors`, `format`
  - `shared/ui/`: `persistence`, `plan`, `charts`, `table`, `dynamicLists`, `layout`,
    `wizard`, `estimates`

## 11. Future work (not part of this refactor)

- **Stateless engine.** Goal: `runProjection` is a pure function of explicit inputs. It
  does not read the store, does not mutate its inputs, and has no module-level mutable
  state except documented memoization. Stage 3 adds Vitest ratchet tests for what is
  already true: identical inputs give identical output; a deep-frozen `state` does not
  throw; running scenario A then B equals B then A. At the start of stage 3, check
  whether the sensitivity and optimizer code temporarily mutates `state` and restores
  it, since those spots would need work.
- **Precise function inputs via TypeScript.** Instead of passing `state` through the
  engine, each function should take only the data it needs, with types documenting
  that. esbuild strips TypeScript natively, so the build pipeline needs no change and
  files can convert one at a time. Do this after the refactor, starting with `core/`.
- **Centralized writes and subscriptions.** Once input handlers stop mutating `state`
  directly, evaluate Zustand vanilla (or similar) to replace manual `render()` calls and
  `writeStorageNow`.
- **Hot reload.** Vite as a dev-only layer (see section 7).
- **Merging the US and Canada engines.**

## 12. Stage 1 design: country seams and state homes

Decided 2026-10-11 from the closure inventory (`docs/superpowers/inventory/closure-us.md`,
"Shared regions" and "Mutable top-level bindings").

### What the inventory showed

The `(country)` dependencies of the shared fragments are mostly shared state (`state`, `mode`,
`render`, `defaults`, the chart preferences, the storage keys), not real country differences.
About two dozen are genuine seams that shared code must call: `taxFor`, `runProjection`,
`BUCKET_STEP`, `STANDARD_MODE` / `BUCKET_MODE`, `housingForYear`, `FIELDS`, `DYN`,
`DECISION_QUESTIONS`, `SENSITIVITY_LEVERS`, `computeSankeyFlow`, `buildPrintReport`, the MCP
helpers, the Roth-optimizer hooks and a few more. Of the 55 US mutable bindings, roughly 25
cross a region boundary; the rest (timers, tooltip elements, plan-status variables) are written
by one future module only.

### Seam mechanism: build-time import aliases

- A new `src/package.json` declares `"type": "module"` and
  `"imports": { "#country/*": { "us": "./us/*.js", "canada": "./canada/*.js" } }` (exact target
  paths are fixed in the plan; the pattern must resolve relative to `src/package.json`). It lives
  in `src/` because the root `package.json` stays CommonJS for the existing scripts and tests.
- Shared code writes `import { taxFor } from '#country/tax'`. Each country provides the same
  module names exporting the same names.
- `scripts/build.js` passes esbuild `conditions: [country]`. A missing condition fails the
  build (`Could not resolve "#country/tax"`). Plain Node resolves the same imports with
  `--conditions=<country>`, so unit tests can run shared code against either country.
- A contract test compares the two countries' export lists for every `#country/*` module and
  fails when shared code imports a name one country lacks.
- Verified before this design was accepted (throwaway spike, esbuild 0.28, Node 24): resolves
  per condition, fails loudly without one, works in Node.
- Constraint kept from section 3, rule 5: this is standard Node subpath imports plus custom
  conditions, supported by Vite and Vitest, so a later Vite dev server needs no source change.
- Factories (explicit dependency injection) were considered and deferred: they fit better
  after the TypeScript conversion (section 11), when the dependencies can be typed.

### Homes for mutable state

- Cross-module state gets small country-neutral modules under `src/shared/core/`:
  `state` (live binding plus `assignState`), `mode`, the chart preferences (`chartView`,
  `chartShiftMode`, `chartGapPartner`, `chartXAxisMode`, `logScale`, `chartExpanded`,
  `chartToolbarCollapsed`, `mcPathCount`, `lastProjectionView`), `scenarios` and `histTaxFactors`.
  (`taxFactorInflation` is written only inside its own region, so it stays module-private. The
  US-only `currentYear` goes with the other US-only state below. `theme`, `hasPersonalizedData` and
  the `setMobileView` holder are declared and written only inside shared fragments, each with a DOM
  initializer, so they move with those fragments in stage 2.)
- Primitives are exported as live bindings with setters, so readers keep writing `chartView`
  rather than `ui.chartView`; only the owning module assigns. Setters are named
  `assign<Name>` (`assignState`, `assignMode`, ...) because the natural `set<Name>` names are taken by
  UI handlers that do more than assign (`setMode`, `setChartView`, `setMcPathCount`, ...). Objects mutated in place are plain
  exports.
- US-only (modules under `src/us/core/`): the eight `cliffPlan*` variables become one
  `cliffPlanStore` object; the optimizer override maps and the last optimizer run
  (`rothBracketOverrideByAge`, `withdrawalMixOverrideByAge`, `lastMultiLeverRun`,
  `rothPerYearEvalBudget`) become an `optimizerState` object; the test-hook counters and flags
  (`inhTakeCount`, `testInhForce`, `testInhNoNeedAdj`, `inhNoDrawCalls`, `irmaaInYearCalls`)
  become a `testHooks` object, out of the engine's way; `currentYear` becomes a live binding
  with `assignCurrentYear`.
- Module-private rule: a binding written by one future module stays private to it. Those
  move with their region in stage 2; stage 1 extracts only the cross-region ones.
- The big inventory cycle (`FIELDS` / `normalizeState` / the `state` group) is broken by
  starting the store at `null`; `main.js` calls `assignState(normalizeState(null))` at startup.
  The store therefore imports nothing from a country.

### Order and verification

1. Alias plumbing: `src/package.json`, the build condition, the contract test. No code moves.
2. Extract the store and preference modules one group at a time (replace the declaration with
   an import, each assignment with a setter).
3. Extract the US cliff-plan state object and the test-hook object.
4. Re-run `npm run analyze`; the mutable table should shrink to the module-private bindings.

Each step leaves `npm test` green and `tests/snapshots/` untouched; each task is reviewed.

### Not in stage 1

Moving any shared fragment into a module (stage 2), Vitest, the `core/` purity check,
TypeScript.
