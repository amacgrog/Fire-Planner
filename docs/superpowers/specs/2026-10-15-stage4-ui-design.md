# Stage 4 design: the UI layer leaves main.js

Date: 2026-10-15
Status: draft for review
Parent design: `docs/superpowers/specs/2026-10-10-modular-build-design.md` (sections 6 and 12-14). This file is the Stage 4
design that section 6 announces in one line ("Peel the remaining `ui/` layers"); it follows the format of sections 12-14 and
is kept in its own file so the parent design is not edited in parallel.

## 1. Goal

Every declaration and every side-effect statement that is still in `src/<country>/main.js` moves into a topic module, the last
`@@shared` regions disappear with `scripts/sync-shared.js`, and `main.js` becomes the entry point the parent design describes
(section 3: "entry: wiring, `window.__test_*` hooks, MCP registration").

**Owner goal for this stage: the UI is easy to update after the refactor.** A person changing the wizard, a chart control, an
info bubble or an MCP tool opens one module whose name says what it holds, and `main.js` reads as the start-up sequence. Each
decision below is judged against this goal as well as against "no behavior change".

### Success criteria

- `main.js` (both planners) holds no declaration: only the import block and, inside the IIFE, calls to wiring functions and
  the short boot sequence (section 5.6).
- No `@@shared` marker in `src/`, no `shared/` directory, no `scripts/sync-shared.js`; `npm test` no longer runs `--check`.
- The built planners compare equal to the pre-stage build (`9405d96`) statement by statement, both as a multiset (stage 3
  method) and, for the side-effect statements, in order (section 6.2).
- `tests/snapshots/` unchanged; `npm test` green; the 19 ad-hoc `test_*.js` scripts no worse than on `9405d96`.
- No module name ends in `-N`; no module is named after an unrelated unit; a generated module map lists every module.
- CLAUDE.md has an "Adding UI code" section (section 9).

## 2. What the data showed

Measured on `9405d96` with `npm run analyze` (the regenerated inventory equals the committed one apart from line endings) and
`node scripts/plan-extraction.js` in report mode, plus throwaway simulations of the planner with options it does not have yet.

### What is left in main.js

| | US | Canada |
|---|---|---|
| lines | 4,840 | 4,092 |
| units | 311 | 231 |
| declarations and functions | 106 (2,749 lines), 81 `ui` | 101 (2,395 lines), 76 `ui` |
| ... inside `@@shared` regions | 88 | 88 |
| ... country only | 18 (`render`, `syncControls`, `DECISION_QUESTIONS`, `initChartHover`, the `set*` button handlers, ...) | 13 |
| side-effect statements | 205 (1,490 lines) | 130 (1,178 lines) |
| ... inside `@@shared` regions | 102 (about 1,090 lines) | 102 |
| ... `window.__test_*` hooks (all at the end of the file) | 73 (lines 4592-4838) | 11 (lines 4079-4090) |
| ... the MCP registration (`if (mc?.registerTool) {...}`) | 1 (line 4543) | 1 (line 4030) |
| `@@shared` regions left | 21 | 21 |
| contiguous runs of statements (by region / country code) | 37 | 33 |

`src/` holds 163 modules plus 20 seam facades; 78 modules have a single top-level statement; 7 names carry a `-2` suffix
(`src/shared/core/{bond-ladder,estimates-and-warnings,lists-and-children,monte-carlo-paths,simulate-at-real-cagr,sweep-excess-cash,year-factors}-2.js`);
some names mislead (`FIELDS` is in `src/us/ui/clamp-profit-sharing.js`, the MCP handle `mc` in `src/shared/ui/first-run-ui.js`).
There are no bare side-effect imports (`import './x.js'`) anywhere in `src/` today.

### What blocks the remaining units

The planner, as it stands, moves 22 US and 21 Canada units (14 modules). Three obstacles, in order of size:

1. **Ten country names that shared UI code calls.** `render`, `syncControls`, `DECISION_QUESTIONS`, `computeRothOptimizer`,
   `FIELDS`, `DYN`, `SENSITIVITY_LEVERS`, `computeSankeyFlow`, `analyzeShortfallDrivers`, `renderDecisionCompareTable` are not
   seam names, so every shared unit that uses one stays. With them added (and `normalizeState`, allowed since stage 3), 48 US
   units become movable before anything else changes.
2. **One unit cycle across the shared/country boundary.** Country `render` -> country `DECISION_QUESTIONS` -> shared
   `setChartView` -> country `render` (with shared `renderDecisionQuestionPreviews`). The planner throws on a cycle across
   owners. `render` is the hub most handlers call, so nothing that calls it moves while this cycle stays. `DECISION_QUESTIONS`
   refers to `setChartView` only inside its handler functions (US line 1125): nothing reads across the cycle while modules
   load. The two other cycles (`renderPlanStatusBar` / `schedulePlanStatusHistRate`, `deleteScenario` / `renderScenarioList`)
   are within one owner and already merge into one module.
3. **The eight UI bindings** (`theme`, `sidebarCollapsed`, `hadSavedState`, `infoBubbleBtn`, `reviewingFieldId`,
   `setMobileView`, `undoSnapshot`, `wizardStep`). They block 44 US and 40 Canada units (counted through their dependents).
   Every one of them, and every unit or statement that reads or writes it, is inside a shared region:

   | binding | declared in region | writers (US lines) |
   |---|---|---|
   | `theme` | 02-CHART_GROUPS | theme-toggle listener (statement @4164, region 27) |
   | `sidebarCollapsed` | 02-CHART_GROUPS | `setSidebarCollapsed`; the startup read of the setting from storage (statement @214) |
   | `hadSavedState` | 03-hadSavedState | the startup load of the saved plan (statement @287, also `assignState(normalizeState(...))`) |
   | `infoBubbleBtn` | 04-isEstimateCountable | `openInfoBubble`, `closeInfoBubble` |
   | `reviewingFieldId` | 04-isEstimateCountable | `jumpToEstimateField`, `renderEstimatedRollup`, the review-close listener (statement @603) |
   | `setMobileView` | 17-renderDecisionQuestionPreviews | the mobile-tabs block (statement @4465, region 29) |
   | `undoSnapshot` | 26-setChartView | `snapshotForUndo`, `hideUndoToast` |
   | `wizardStep` | 28-wizardOverlay | the three wizard listeners (statements @4258, @4263, @4267) |

With the ten seam names, the cycle accepted and the bindings placed, the simulation leaves only a handful of units per planner,
all of them the boot sequence that section 5.6 keeps in `main.js` on purpose; the exact counts come from the rehearsal (section 7).

### Declarations whose initializer runs code

A declaration that moves to a module's top level is initialized when the module loads, before the rest of `main.js` runs. Of
the declarations left, four have initializers that are not inert (a literal, a function, an arrow, a class, or an object or
array of those): `ids` and `MCP_FIELDS` (filter the constant `FIELDS`), `theme` (reads `window.matchMedia`) and
`previousUnusualIds` (`new Set()`). None depends on a statement that runs before it today; section 6.4 adds a guard.

## 3. Decisions

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Side-effect statements | Each contiguous run of statements that goes to one module becomes an exported **wiring function** in that module; `main.js` calls it at the run's position. No bare side-effect imports. | Order is kept by construction; the shared statements leave their regions, so the regions and `sync-shared.js` can go. Moving statements as module top-level code would run them in import order (the tool's known gap). |
| 2 | The cross-owner `render` cycle | Allow import cycles between `ui/` modules when a guard proves no module in the cycle reads a partner's import while loading. | Native ESM hoists function declarations across a cycle and the esbuild bundle is one scope, so it is safe; the bundle does not change. A late-binding hub (`assignRender`) would add a mutable binding, an indirection on every call and a silent no-op if anything ran early. |
| 3 | The eight UI bindings | Each moves into one shared UI module with all its writers, the statements that write it included (inside that module's wiring functions). Related units join the module by topic. No `assign<Name>` modules. | Stage 3's rule 1 extended to statements; no statement text changes; each binding is private to the module that owns it. |
| 4 | Test hooks and MCP registration | Defined in their own modules (`src/<country>/ui/mcp-tools.js`: `registerMcpTools()`; `src/<country>/ui/install-test-hooks.js` and `src/shared/ui/install-test-hooks.js`: `installTestHooks()`), called only from `main.js`, last, where the code runs today. Rule 3 of the parent design is reworded (section 5.7). | One file per concern; without it the US `main.js` would be about 40% test hooks. (`install-test-hooks`, not `test-hooks`: `src/us/core/test-hooks.js` already holds the engine's test counters.) |
| 5 | `sync-shared.js` and Vitest | Deleting `sync-shared.js`, `shared/` and the `sync` / `check:shared` scripts is Stage 4's last code batch. Vitest follows Stage 4 with its own short design. | Decision 1 empties every region, so the marker system guards nothing; Vitest serves `core/`, which this stage does not touch. |
| 6 | Module grouping and names | Stage 4's new modules are grouped by topic as they are made (a topics file, section 5.4). A tidy batch then renames every misleading or `-N` module (the 7 `-2` core modules included) and regroups the existing 29 `ui/` modules by topic with a new tool, `scripts/regroup-modules.js`. Regrouping the one-unit `core/` modules follows Stage 4. A test bans `-N` names; a generated module map lists every module. | The owner goal: a UI change starts by finding the right file. Core regrouping does not serve that goal and fits the later TypeScript work. |
| 7 | Order | Tool changes, rehearsal, extraction batches by depth (leaf UI topics and the eight bindings; the rest of the shared UI; the country hubs and the cycle; country listeners, MCP and test hooks), the tidy batch, the cleanup batch, docs. | Each batch ends green; statements move with their module once everything they use has moved. |
| 8 | Verification | After every batch: `npm test` with unchanged snapshots, the build comparison in both modes against the previous commit, all 19 `test_*.js`, independent review per task. At the end: both comparisons against `9405d96`, `tests/bench_heavy.js` old against new. | Section 6. |

Decision 1, refined under the owner goal: the country-only listeners (US 103 statements outside regions, Canada 28, minus the
hooks and MCP) leave `main.js` too, into their topic modules' wiring functions, so a listener is found next to the code it drives.

## 4. Target shape

```
src/<country>/main.js        imports; IIFE: wiring calls in start-up order, the boot sequence, registerMcpTools(), installTestHooks()
src/shared/ui/<topic>.js     shared UI by topic: theme, sidebar, saved-plan load, info bubble, estimate review, undo, wizard,
                             mobile view, dynamic lists, scenarios, chart controls, Sankey, tornado, plan headline, ...
src/<country>/ui/<topic>.js  country UI: render, syncControls, fields (FIELDS), decision questions, mcp-tools, install-test-hooks, ...
src/<country>/ui/seam-<name>.js   one-line facades for the UI seam names (section 5.2)
```

Topic names are fixed by the rehearsal's topics file and reviewed with the manifest; the list above is indicative.

## 5. The design step by step

### 5.1 Wiring functions

- A **statement** becomes movable. The topics file (section 5.4) assigns it to a module, or to `main` (it stays). A statement
  with no entry goes with the region it sits in (a shared region's module) or, for country code, with the nearest preceding
  unit's module; the rehearsal reviews every default.
- A **run** is a maximal sequence of statements, in `main.js` order, assigned to the same module with no statement assigned
  elsewhere between them. Declarations between them do not break a run (they move to the module's top level). Each run
  becomes one exported function, `export function <name>() { ... }`, whose body is the statements' text, indented two more
  spaces and otherwise byte-identical; `main.js` gets `<name>();` where the run's first statement stood.
- Names come from the topics file (`wire<Topic>`, for example `wireThemeToggle`, `wireInfoBubble`, `loadSavedState`). A
  module with one run may use the default `wire<ModuleName>`; a module with several runs must name each, or the planner fails.
- The applier refuses a statement that cannot live inside a function body unchanged: a top-level `return`, `break`,
  `continue`, `await`, `yield`, or a function or class declaration nested at statement level (none exist today).
- Each wiring function is called exactly once, from `main.js` (checked by the ordered comparison, section 6.2).
- **Statement labels become stable.** The analyzer labels a statement `statement@<line>` today, which shifts with every
  batch. It becomes `stmt:<first 8 hex of sha1 of the whitespace-normalised text>` (plus `#2`, `#3` for identical texts in
  file order), so a manifest written at rehearsal still names the right statements after earlier batches. The inventory
  gains a line-number column instead.

### 5.2 Seam names and UI facades

- The ten names of section 2 join the seam (with `normalizeState`).
- Stage 3's facades are `core/` modules (`src/<country>/core/seam-<name>.js`). A facade for a UI name (`render`,
  `syncControls`, `DECISION_QUESTIONS`, `FIELDS`, `DYN`, `computeSankeyFlow`, `renderDecisionCompareTable`, ...) would make
  a `core/` module import a `ui/` one, which `tests/core_purity.js` forbids. A facade therefore lives under the side of the
  module it re-exports: `src/<country>/ui/seam-<name>.js`, imported as `#country/ui/seam-<name>`. `src/package.json`'s
  pattern (`"#country/*"`) already resolves any subpath, and `tests/country_contract.js` already checks every `#country/...`
  import whatever its directory, so neither changes.

### 5.3 Cycles between UI modules

- The planner no longer throws on a cycle across owners when every unit in it is `ui`: those units get modules of their own
  (as today) and the cycle stays. A cycle that contains a `core` unit still throws.
- The applier's module-cycle check accepts a cycle when every module in it is under `ui/` and the **load-time guard** passes:
  no reference, at module scope (outside any function body), to a binding imported from another module of the same cycle.
  Implemented with `eslint-scope` (a reference whose `from` scope is the module scope).
- The same guard runs in `npm test` as `tests/ui_cycles.js` over the whole `src/` graph: every import cycle must consist of
  `ui/` modules only (seam facades included) and pass the load-time guard. `core/` stays acyclic (`tests/core_import.js`
  keeps its job).

### 5.4 The topics file and the eight bindings

- `scripts/extractions/stage4-topics.json` maps unit labels (declarations by name, statements by stable label) to module
  paths, and runs to wiring-function names. Units not listed fall back to the planner's grouping (a region or a country run).
  The rehearsal writes it; it is reviewed with the manifest.
- **Bindings.** A mutable binding is placed with its writers when all writers (functions and statements) are assigned to one
  module; it is then that module's private state, exported for reading only where another module reads it. A binding whose
  writers would span modules is still reported in `bindings.<country>.needsDecision` and blocks its dependents (none of the
  eight does, by construction of the topics file).
- The eight, by module (names indicative):

  | module (shared `ui/`) | binding | with |
  |---|---|---|
  | `theme.js` | `theme` | `applyTheme`, `wireThemeToggle()` (the toggle listener) |
  | `sidebar.js` | `sidebarCollapsed` | `setSidebarCollapsed`, `loadSidebarPreference()` (statement @214), the collapse-button listener |
  | `saved-plan.js` | `hadSavedState` | `hasPersonalizedData`, `loadSavedState()` (statement @287, called where it runs today, before `syncControls`) |
  | `info-bubble.js` | `infoBubbleBtn` | `infoBubbleAnchor`, `openInfoBubble`, `closeInfoBubble`, `placeInfoBubble`, `wireInfoBubble()` (three document listeners) |
  | `estimate-review.js` | `reviewingFieldId` | `jumpToEstimateField`, `renderEstimatedRollup`, `syncReviewNav`, `advanceReview`, `wireEstimateReview()` |
  | `mobile-view.js` | `setMobileView` | `export let setMobileView = () => {};` and `wireMobileTabs()` (the block that assigns it; until it runs, calls do nothing, as today) |
  | `undo.js` (or joined to `topbar-and-undo.js`) | `undoSnapshot` | `snapshotForUndo`, `showUndoToast`, `hideUndoToast`, `wireUndoButton()` |
  | `wizard.js` | `wizardStep` | `renderWizardStep`, `wireWizard()` (open, next, back, close) |

- The single-writer bindings that stage 3 left for this stage (`activeCategory`, `hasPersonalizedData`, `infoBubbleAnchor`,
  `previousUnusualIds` / `unusualToastArmed` / `unusualToastTimer`, `sankeyTooltipEl`, `lastChart`, `chartTooltipEl`,
  `saveDebounceTimer`, `undoToastTimer`, the plan-status timers, Canada's `lastRothOptimizer`) move with their writer, as in
  stage 3.

### 5.5 Extraction

Unchanged from stage 3 otherwise: the planner computes the movable set as a fixpoint, the applier moves text verbatim, adds
`export` where a name is used outside its module, writes the imports from the analyzer's reference data, stages its writes and
refuses anything it cannot do safely. A shared unit or statement moves only when it is movable in both planners and its text
is identical in both.

### 5.6 What main.js keeps

- The import block.
- Inside the IIFE, in today's order: the wiring calls; the boot sequence that is the plan's start-up logic and reads best in
  one place (US lines 4528 onward: `if (hadSavedState) dismissFirstRunBanner(); syncControls(); syncContributionControls();
  setMode(mode); syncTopbarHeight(); ...`), assigned to `main` in the topics file; then `registerMcpTools();` and
  `installTestHooks();`.
- The IIFE wrapper stays (removing it re-indents the file; a one-commit follow-up).

### 5.7 Rule 3 of the parent design, reworded

"`window.__test_*` hooks and the MCP tool registration are installed only from `main.js`, by calling `installTestHooks()` and
`registerMcpTools()`. They are defined in dedicated `ui/` modules (`install-test-hooks.js`, `mcp-tools.js`), never in `core/`."
The parent design keeps its wording as history; CLAUDE.md states the new rule.

### 5.8 Tidy: names and UI grouping

`scripts/regroup-modules.js --map <file> [--dry-run]` takes a list of renames (`old path -> new path`) and merges (`[paths] ->
new path`), rewrites every import in `src/` (relative paths and seam facades), refuses a merge that creates a `core/` cycle or
a UI cycle that fails the load-time guard, refuses a name clash, and stages its writes like the extraction tool. A merge
concatenates module bodies in dependency order and merges their import lines; it does not change a statement. Fixture tests
cover a rename, a merge, a facade rewrite, a refused cycle and a refused clash.

Applied once, after the extraction batches: every `-N` module and every module named after an unrelated unit gets a topic
name (`FIELDS` gets `src/us/ui/fields.js`; `mc` joins `mcp-tools.js`); the existing `ui/` modules join their topics (for example
the three `update-chart-*-buttons` modules join the chart controls). The rename list is part of the plan, reviewed before it
runs.

### 5.9 Cleanup

Delete `scripts/sync-shared.js`, `shared/`, the `sync` and `check:shared` scripts and the `--check` step in `npm test`; remove
the region and fragment handling from `scripts/lib/extract-units.js` and the analyzer's region-specific inventory section
(or keep them as no-ops if removal is larger than it is worth: the plan decides after reading them); add `tests/no_markers.js`
(no `@@shared` marker anywhere in `src/` or `scripts/`).

## 6. Guards and tests

### 6.1 New tests in `npm test`

- `tests/ui_cycles.js` (section 5.3).
- `tests/no_bare_imports.js`: no `import '<path>';` in `src/`.
- `tests/module_names.js`: no module file name matching `-\d+\.js$`.
- `tests/no_markers.js` (section 5.9, added in the cleanup batch).
- The module map (`docs/superpowers/inventory/module-map.md`: per module, its path, side, exports and a one-line purpose
  taken from its first comment line) is written by `npm run analyze`; `npm test` fails if it is stale (`--check`, like the
  `gen-*-rules` scripts). A module without a leading purpose comment fails the check, so every new module says what it is for.
- Fixture tests for every tool change (`tests/extraction_plan.js`, `tests/extract_units.js`, a new `tests/regroup_modules.js`,
  `tests/compare_builds.js` for the ordered mode).

### 6.2 The build comparison, ordered mode

`node scripts/compare-builds.js --base <dir> [--head <dir>] --ordered`:
1. As today: flatten the IIFEs, split multi-declarator declarations, compare the multisets of statement texts.
2. In the head, find every exported function whose name the base lacks and that the head calls exactly once as a bare
   statement `<name>();`; replace the call with the function's body statements and drop the declaration (a function called
   twice, or a new function called from anywhere else, fails). Then compare multisets again: they must be equal.
3. Ordered: the sequence of top-level statements that are not declarations (after step 2's expansion) must be identical, in
   order, between base and head.
The base is the previous commit, built in a scratch worktree; at the end of the stage also `9405d96`.

### 6.3 Every batch

`npm test` (snapshots unchanged: `git diff --stat tests/snapshots` empty; `tests/snapshot_ui.js` pins each control's wiring,
the MCP schema, a clean load at desktop and phone width with `pageerror` collected, and the rendered results text), both
comparison modes, all 19 `test_*.js` (the rehearsal records which pass on `9405d96`; a script that already fails there is
listed and must not get worse), and an independent review of each task.

### 6.4 Initializers that move earlier

The planner lists every moved declaration whose initializer is not inert (section 2). The manifest carries an allow-list with a
reason per entry (today: `ids`, `MCP_FIELDS`, `theme`, `previousUnusualIds`); a non-inert initializer not on the list fails
the planner.

### 6.5 End of stage

Both comparison modes against `9405d96`; `tests/bench_heavy.js` on `9405d96` and on the head, alternating, three runs each,
medians compared (+5% allowed; noise on this machine is about 10%). The engine does not move, so `bench_runs` and
`bench_solver` are not required.

## 7. Order

1. Tool changes, each with fixture tests: movable statements and wiring functions (5.1), stable statement labels, UI facades
   (5.2), UI cycles and the load-time guard (5.3), the topics file and binding placement (5.4), the initializer allow-list
   (6.4), the ordered comparison (6.2), the new guards (6.1 except `no_markers`), the module map.
2. Rehearsal in a scratch worktree: the manifest `scripts/extractions/stage4.json` and `stage4-topics.json`, the batch and
   module counts, the baseline of the 19 ad-hoc scripts. Committed.
3. Extraction batches by depth (the rehearsal fixes the exact cut): A, leaf UI topics and the eight bindings; B, the rest of
   the shared UI; C, the country hubs, the ten seam names and the cycle; D, the country listeners, `mcp-tools.js` and
   `install-test-hooks.js` (`main.js` reaches its final shape).
4. Tidy: renames and UI regrouping (5.8).
5. Cleanup (5.9).
6. End-of-stage verification (6.5).
7. Docs: CLAUDE.md ("Adding UI code"; rule 3 reworded; the regions section and its CRLF gotcha removed; the modules section
   updated), README's development section, the regenerated inventory and module map, `docs/superpowers/inventory/stage4-region-map.md`
   (where each of the 21 regions went), and, if the owner agrees, one line in section 6 of the parent design pointing here.

## 8. Not in Stage 4

Vitest (its own short design after Stage 4); regrouping the one-unit `core/` modules; removing the IIFE wrapper from
`main.js`; the stateless engine, TypeScript and Vite (parent design sections 7 and 11); any behavior change.

## 9. "Adding UI code" (for CLAUDE.md after Stage 4)

- Markup: `src/<country>/index.html` or a shared partial, as now.
- Behavior on an existing topic: a function in that topic's module. A listener that belongs at an existing point of start-up
  goes inside the module's wiring function; one that needs its own point gets a new wiring function, called from `main.js`
  where it should run.
- UI state: a module-level `let`, assigned only in its module; another module that must write it calls an `assign<Name>`
  function the module exports. Reading it elsewhere is a live import.
- A new topic: a new module under `src/shared/ui/` (both planners) or `src/<country>/ui/`, with a one-line purpose comment
  first (the module map reads it).
- Shared UI code that needs a country UI name imports it from `#country/ui/seam-<name>`.
- The guards: `tests/closure_names.js` (undeclared names), `tests/ui_cycles.js`, `tests/no_bare_imports.js`,
  `tests/module_names.js`, the module-map check. The ordered build comparison is for refactors only; a feature changes the
  statements on purpose.

## 10. Known limits at the end of Stage 4

- `core/` still has many one-unit modules (follow-up, with the same regroup tool).
- `main.js` keeps its IIFE wrapper.
- The load-time guard is static: it proves no module-scope read across a UI cycle, not that a wiring function never runs
  before another one it depends on; the ordered comparison covers that for this stage, review covers it afterwards.
- Real browser ESM is not exercised (only the esbuild bundle); the cycle guard is what keeps a later Vite dev server possible.
- The namespace-import gap of the applier (`import * as`) stays; nothing uses it.
