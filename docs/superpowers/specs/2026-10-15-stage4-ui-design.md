# Stage 4 design: the UI layer leaves main.js

Date: 2026-10-15
Status: draft; review rounds 1 (findings 1-14), 2 (findings 1-10), 3 (findings 1-13), 4 (findings 1-7), 5 (findings 1-8) and 6 (findings 1-8) adopted, owner-approved 2026-10-15
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

- `main.js` (both planners) holds no declaration: only the import block and, inside the IIFE, calls to wiring functions, the
  start-up statements pinned to `main` (US `statement@96` and `@190`, Canada `@70`) and the short boot sequence (section 5.6).
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
| contiguous runs of statements (by region / country code; declarations between statements do not break a run) | 20 | 18 |

`src/` holds 163 modules plus 20 seam facades; 78 modules have a single top-level statement; 7 names carry a `-2` suffix
(`src/shared/core/{bond-ladder,estimates-and-warnings,lists-and-children,monte-carlo-paths,simulate-at-real-cagr,sweep-excess-cash,year-factors}-2.js`);
some names mislead (`FIELDS` is in `src/us/ui/clamp-profit-sharing.js`, the MCP handle `mc` in `src/shared/ui/first-run-ui.js`).
There are no bare side-effect imports (`import './x.js'`) anywhere in `src/` today.

### What blocks the remaining units

The planner, as it stands, moves 22 US and 21 Canada units (14 modules). Three obstacles, in order of size:

1. **Thirteen country names that shared UI code uses.** Shared declarations call `render`, `syncControls`,
   `DECISION_QUESTIONS`, `computeRothOptimizer`, `FIELDS`, `DYN`, `SENSITIVITY_LEVERS`, `computeSankeyFlow`,
   `analyzeShortfallDrivers` and `renderDecisionCompareTable`; shared statements also use `buildPrintReport` (the print-button
   listener, US statement @3054, Canada @2631, region 24) and `mcpSchemaFor` / `mcpAccepts` (the MCP block, US @4543, Canada
   @4030, region 29, imported from `./core/mcp-schema-for.js`). None is a seam name, so every shared unit that uses one stays.
   With the first ten added (and `normalizeState`, allowed since stage 3), 48 US and 47 Canada units become movable before
   anything else changes. (`initChartHover`, a country unit called by the boot sequence, needs no seam: the boot stays in
   `main.js`.)
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

With the thirteen seam names, the cycle accepted and the bindings placed, what stays is the boot sequence that section 5.6
keeps in `main.js` on purpose (and the calls to the wiring functions); the exact counts come from the rehearsal (section 7).

### Declarations whose initializer runs code

A declaration that moves to a module's top level is initialized when the module loads, before the rest of `main.js` runs.
**Inert** initializers are literals (and template literals without expressions), function, arrow and class expressions,
unary operators on those, and object and array literals of inert values; a reference to another name is **not** inert. Five
of the declarations left have initializers that are not inert:

- `ids` and `MCP_FIELDS` filter `FIELDS`, an imported constant; `theme` reads `window.matchMedia`; `previousUnusualIds` is
  `new Set()`. They do not depend on anything that runs before them in `main.js`, so running them at load time is safe
  (they get the `// load-time:` comment of section 6.4).
- `let hasPersonalizedData = hadSavedState;` (US line 307, Canada 187) reads the binding the saved-plan load (statement
  @287 / @167) sets just before it. Run at load time it would always be `false`; today the boot's
  `if (hadSavedState) dismissFirstRunBanner()` sets it to `true` and the 250 ms save debounce hides the difference, but a
  `pagehide` during start-up would skip a returning visitor's save (`writeStorageNow`, line 2330). It is handled by the split
  rule of section 5.1.

Six initializers that run code already sit in `ui/` modules from stages 2 and 3: `src/shared/ui/estimates-and-warnings.js:11`
(`document.createElement`), `first-run-ui.js:19` (`mc = document.modelContext`), `storage.js:14` (an IIFE that writes and
removes a probe key in `localStorage`), `topbar-and-undo.js:1` and `wizard-overlay.js:1,4` (`document.getElementById` /
`querySelectorAll`). They read nothing a statement writes. With the four safe ones above they get the `// load-time:` comment
of section 6.4.

## 3. Decisions

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Side-effect statements | Each contiguous run of statements that goes to one module becomes an exported **wiring function** in that module; `main.js` calls it at the run's position. No bare side-effect imports. | Order is kept by construction; the shared statements leave their regions, so the regions and `sync-shared.js` can go. Moving statements as module top-level code would run them in import order (the tool's known gap). |
| 2 | The cross-owner `render` cycle | Allow import cycles between `ui/` modules when a guard proves nothing in them runs across the cycle while modules load (every top-level initializer of a module in a cycle is inert, or marked `// load-time:` and reads nothing from the cycle; section 5.3). | Native ESM hoists function declarations across a cycle and the esbuild bundle is one scope, so it is safe; the bundle does not change. A late-binding hub (`assignRender`) would add a mutable binding, an indirection on every call and a silent no-op if anything ran early. |
| 3 | The eight UI bindings | Each moves into one shared UI module with all its writers, the statements that write it included (inside that module's wiring functions). Related units join the module by topic. No `assign<Name>` modules. | Stage 3's rule 1 extended to statements; no statement text changes; each binding is private to the module that owns it. |
| 4 | Test hooks and MCP registration | Defined in their own modules and called only from `main.js`, last, where the code runs today: `src/shared/ui/mcp-tools.js` (`registerMcpTools()`; the MCP block is shared code in region 29, so it is written once; the `mc` handle joins it in the tidy batch); `src/shared/ui/install-test-hooks.js` (`installSharedTestHooks()`, the 7 statements of region `block`) and `src/<country>/ui/install-test-hooks.js` (`installTestHooks()`), called in that order because the US hooks redefine four shared ones (`__test_simulate`, `__test_simulateHistorical`, `__test_runHistoricalCycles`, `__test_runMonteCarlo`, US lines 4605-4608). Rule 3 of the parent design is reworded (section 5.7). | One file per concern; without it the US `main.js` would be about 40% test hooks. (`install-test-hooks`, not `test-hooks`: `src/us/core/test-hooks.js` already holds the engine's test counters.) |
| 5 | `sync-shared.js` and Vitest | Deleting `sync-shared.js`, `shared/` and the `sync` / `check:shared` scripts is Stage 4's last code batch. Vitest follows Stage 4 with its own short design. | Decision 1 empties every region, so the marker system guards nothing; Vitest serves `core/`, which this stage does not touch. |
| 6 | Module grouping and names | Stage 4's new modules are grouped by topic as they are made (a topics file, section 5.4). A tidy batch then renames every misleading or `-N` module (the 7 `-2` core modules included) and regroups the existing 29 `ui/` modules by topic with a new tool, `scripts/regroup-modules.js`. Regrouping the one-unit `core/` modules follows Stage 4. A test bans `-N` names; a generated module map lists every module. | The owner goal: a UI change starts by finding the right file. Core regrouping does not serve that goal and fits the later TypeScript work. |
| 7 | Order | Tool changes, rehearsal, extraction batches (topic labels; the planner's depth order decides: leaf UI topics and the six bindings that do not reach `render`; the shared UI that does not reach it; the country hubs, the cycle and everything that reaches `render`; country listeners, MCP and test hooks), the tidy batch, the cleanup batch, docs. | Each batch ends green; statements move with their module once everything they use has moved. |
| 8 | Verification | After every batch: `npm test` with unchanged snapshots, the build comparison in both modes against the previous commit, all 19 `test_*.js`, independent review per task. At the end: both comparisons against `9405d96`, `tests/bench_heavy.js` old against new. | Section 6. |

Decision 1, refined under the owner goal: the country-only listeners (US 103 statements outside regions, Canada 28, minus the
country test hooks) leave `main.js` too, into their topic modules' wiring functions, so a listener is found next to the code it drives.

## 4. Target shape

```
src/<country>/main.js        imports; IIFE: wiring calls in start-up order, the pinned start-up statements (US @96, @190;
                             Canada @70), the boot sequence, registerMcpTools(), installSharedTestHooks(), installTestHooks()
src/shared/ui/<topic>.js     shared UI by topic: theme, sidebar, saved-plan load, info bubble, estimate review, undo, wizard,
                             mobile view, dynamic lists, scenarios, chart controls, Sankey, tornado, plan headline,
                             mcp-tools, install-test-hooks (shared hooks), ...
src/<country>/ui/<topic>.js  country UI: render, syncControls, fields (FIELDS), decision questions, install-test-hooks, ...
src/<country>/ui/seam-<name>.js   one-line facades for the UI seam names (section 5.2)
```

Topic names are fixed by the rehearsal's topics file and reviewed with the manifest; the list above is indicative.

## 5. The design step by step

### 5.1 Wiring functions

- A **statement** becomes movable. **Every statement's placement is an explicit entry in the topics file** (section 5.4): a
  module, or `main` (it stays, pinned). From the rehearsal on, the planner reads only the topics file and fails on a
  statement without an entry, so placements cannot drift as earlier batches remove units from `main.js`.
- **Defaults are a drafting aid at the rehearsal only**, computed once on the `9405d96` layout to propose the entries:
  - a shared statement: the module that the topics file gives the shared unit nearest before it in its region (a region can be
    split across several topic modules; region 27 alone holds 23 units of many topics);
  - a country statement: the module of the nearest preceding country unit, declaration or statement, transitively (a run of
    country listeners follows its first one);
  - no default (the rehearsal must decide): a country statement whose nearest preceding unit is in a shared region, is placed
    in `main`, or does not exist; and any statement whose default would land in a `core/` module (wiring functions never
    live there).
  The rehearsal reviews every proposed entry and writes them all down. Today the statements with no default are, with their
  homes:
  - US `statement@752` (the Social Security entries pushed onto `UNUSUAL_RANGES`, right after region 04): a US warnings module
    under `src/us/ui/`, as a wiring function;
  - `DYN.children = {...}` (US @2741, Canada @2335): a children-list wiring function in each country's `ui/` dynamic-lists
    module;
  - the wizard-checkbox listeners (US @4212, Canada @3761, right after region 27) and the `sensLeverToggles` listener (US
    @4302, Canada @3849, after region 28): each country's wizard and sensitivity topic modules;
  - the first country test-hook statement (US @4600, Canada @4087, right after region `block`): the country
    `install-test-hooks.js` (decision 4), with the hooks that follow it;
  - US `statement@96` (`FIELDS.forEach(... REVEAL_BY_ID.set ...)`, no preceding unit), Canada `statement@70`
    (`assignState(normalizeState(null))`, right after region `ids`) and US `statement@190` (the same statement, after
    `normalizeState`, whose module is `src/us/ui/normalize-state.js` because it imports US `FIELDS` from a `ui/` module; its
    default would be a wiring function there): `main` (start-up).
  One shared statement also gets a named home: `makeTableWrapsFocusable();` and its `new MutationObserver(...)` (US lines
  4537-4541, region 29) become `wireTableFocus()` in the shared table-focus module under `src/shared/ui/` (with
  `makeTableWrapsFocusable`, which the tidy batch moves out of `first-run-ui.js`), called at the same position.
- **Targets that do not move yet, or already exist.** A statement whose module does not move in this batch waits for a
  later batch (not a failure). A module that already exists (its declarations moved in an earlier batch) cannot be appended
  to (the applier creates new modules only), so the topics file names a `<module>-N` module for the statement (covered by the
  `module_names` allow-list) with an explicit wiring-function name, and the tidy batch merges it into its topic.
- **Recognising wiring calls and pinned statements.** Neither is recognised by its shape: real statements such as
  `renderScenarioList();` and `applyTheme();` (region 27, US lines 4163 and 4168) or the boot's `syncControls();` look like
  wiring calls. Instead, each batch's manifest records the wiring functions it created (`wiring: [{ name, module }]`), and the
  record accumulates across batches (`scripts/extractions/stage4.json` holds every batch's list). A **wiring call** is a
  statement `<name>();` whose `<name>` is in that record and is imported into `main.js` from a `ui/` module. A **pinned
  statement** is one whose stable label is in the topics file's `main` entries. The planner and the applier's emptied-region
  check read only these two sources.
- **Pinned to `main`.** Wiring calls and pinned statements (the boot sequence, the three start-up statements above) stay in
  `main`: a later plan never moves a wiring call into another wiring function. The planner refuses a topics entry that puts a
  statement in a `core/` module, a country statement in a shared module, or a shared statement anywhere but a shared `ui/`
  module or `main`, and refuses a pinned statement that
  assigns a module-level binding (it would keep its `let` in `main`; none does today: the boot calls `setMode(mode)` and
  `@190` uses `assignState`).
- **Wiring functions live only in `ui/` modules, never in `core/`** (and `main.js` declares none: its statements are calls and
  pinned statements).
- A **run** is a maximal sequence of statements, in `main.js` order, assigned to the same module with no statement assigned
  elsewhere between them. Declarations between them do not break a run (they move to the module's top level). Each run
  becomes one exported function, `export function <name>() { ... }`, whose body is the statements' text, indented two more
  spaces and otherwise byte-identical; `main.js` gets `<name>();` where the run's first statement stood. Each statement's
  leading comment (the comment lines the applier carries with a unit) goes inside the body, directly above that statement, so
  an explanation stays next to the code it explains (for example the theme comment of region 02, the test-hook header at US
  lines 4579-4591).
- **Shared modules split their runs the same way in both planners.** Runs are found per planner, and a shared module that
  gathers statements from several regions (for example `sidebar.js`: statement @214 in region 02 and the collapse listener
  in region 27) could be cut differently in the US and Canada, giving two module texts. The planner therefore splits a shared
  module's statements at the union of both planners' run boundaries; every wiring call stands at its own first statement's
  position (never moved up next to another call), so two calls are adjacent in one planner only because everything between
  them moved away, and a region's remaining text stays identical in both planners.
- **The split rule for initializers.** A moving declaration whose initializer is not inert (section 2) and has no
  `// load-time:` comment (section 6.4) is split: the module gets the declaration without its initializer (`let x;`), and the assignment
  `x = <initializer>;` becomes a statement at the declaration's original position. The assignment is a writer of `x`, so it
  always goes to the declaration's module (an assignment to an import is a build error), in the run it falls into when that
  run belongs to the same module, otherwise as a run of its own. The value is then computed at the same point of start-up as today. Today this applies to
  `hasPersonalizedData` only (it joins `loadSavedState()`). The comment block above the declaration stays with the
  declaration (for `hasPersonalizedData`, US lines 296-306). The planner refuses to split a `const` (none needs it), a
  declaration with several declarators that are not all split, and a declaration whose module is under `core/` (its
  assignment would need a wiring function there).
- Names come from the topics file (`wire<Topic>`, for example `wireThemeToggle`, `wireInfoBubble`, `loadSavedState`). A
  module with one run may use the default `wire<ModuleName>`; a module with several runs must name each, or the planner fails.
  A wiring-function name must be unique within one bundle: across every top-level declaration of `src/shared/` and one
  country's `src/<country>/`, and of that country's base bundle (the previous commit, and `9405d96` for the end-of-stage
  comparison). The planner checks it per country, so esbuild never renames a function to resolve a clash and the comparison's "a name the base lacks" test
  (section 6.2) stays reliable: the shared and country test-hook installers, for example, are `installSharedTestHooks` and
  `installTestHooks`.
- The applier keeps a cheap assertion that every moved statement can live inside a function body unchanged (no top-level
  `return`, `break`, `continue`, `await`, `yield`, label, `var`, `this`, `arguments`, or statement-level function or class
  declaration). None of these occurs in a statement today; the assertion guards later edits.
- Each wiring function is called exactly once, from `main.js` (checked by the ordered comparison, section 6.2).
- **Statement labels become stable.** The analyzer labels a statement `statement@<line>` today, which shifts with every
  batch. It becomes `stmt:<first 8 hex of sha1 of the whitespace-normalised text>`, so a manifest written at rehearsal still
  names the right statements after earlier batches. No two statements share a text today; if they ever do, the suffix
  (`#2`, `#3`) is numbered within the statement's region, or within the country's statements outside regions (a shared
  statement gets the same suffix in both planners), not across the file, so moving an earlier copy does not renumber a later one. Two units of one file with the same label (the same text in two regions) also fail: the tools key their maps by label (plan review). The analyzer fails on two different texts with
  the same 8-hex hash. The inventory gains a line-number column instead.

### 5.2 Seam names and UI facades

- The thirteen names of section 2 join the seam (with `normalizeState`).
- Stage 3's facades are `core/` modules (`src/<country>/core/seam-<name>.js`). A facade for a UI name (`render`,
  `syncControls`, `DECISION_QUESTIONS`, `computeRothOptimizer`, `computeSankeyFlow`, `buildPrintReport`, `FIELDS`, ...; the
  rehearsal fixes the list from the analyzer) would make
  a `core/` module import a `ui/` one, which `tests/core_purity.js` forbids. Such a facade lives under `ui/`:
  `src/<country>/ui/seam-<name>.js`, imported as `#country/ui/seam-<name>`. The side is chosen per name, not per country:
  **a name's facade is under `ui/` in both countries if either country's target is a `ui/` module** (`FIELDS` is in
  `src/us/ui/clamp-profit-sharing.js` but `src/canada/core/fields.js`; both facades go to `ui/`), because shared code imports
  one specifier for both countries. A unit that uses a seam name whose facade is under `ui/` is itself `ui` in both planners
  (the planner's side rule, `uiUnit = u.ui || importsUi`, does not see a seam name as a `ui/` import today; for example
  `computeScenarioMetrics` and `computeOverlaySeriesFor` in region 21 use `normalizeState`, whose US module is
  `src/us/ui/normalize-state.js`). Names that are `core/` in both countries keep `core/` facades: `DYN`,
  `SENSITIVITY_LEVERS`, `analyzeShortfallDrivers`, `renderDecisionCompareTable`, `mcpSchemaFor`, `mcpAccepts`. A facade under `ui/` that re-exports a `core/` module is allowed (`ui/` may import
  `core/`). The header comment of `tests/core_purity.js`, which says facades live in `core/`, is updated. `src/package.json`'s
  pattern (`"#country/*"`) already resolves any subpath, and `tests/country_contract.js` already checks every `#country/...`
  import whatever its directory, so neither changes.

### 5.3 Cycles between UI modules

- The planner no longer throws on a cycle across owners when every unit in it is `ui`: those units get modules of their own
  (as today) and the cycle stays. A cycle that contains a `core` unit still throws.
- The applier's module-cycle check accepts a cycle when every module in it is under `ui/` and the **load-time guard** passes.
  The guard is deliberately simple, because a reference check alone is not transitive (a module-scope call to a local
  function that reads a cycle partner's import passes it, and would be a TDZ error in native ESM): **every top-level
  initializer of a module in a UI cycle must be inert** (section 2's definition), except one marked `// load-time:` (section
  6.4) that reads nothing from the cycle, and the module may hold no top-level statement other than declarations (its
  statements are in wiring functions, which run from `main.js` after every module has loaded). Class static fields and static
  blocks count as load time (`eslint-scope` files them under their own scopes, so the guard checks them explicitly; there are
  no classes today).
- The graph the guard uses resolves `#country/...` with each condition (`us`, `canada`) and treats a facade's
  `export { x } from '...'` as a pass-through edge to the module it re-exports.
- The same guard runs in `npm test` as `tests/ui_cycles.js` over the whole `src/` graph: every import cycle must consist of
  `ui/` modules only (seam facades included) and pass the load-time guard. `core/` stays acyclic (`tests/core_import.js`
  keeps its job).

### 5.4 The topics file and the eight bindings

- `scripts/extractions/stage4-topics.json` has a `shared` section and one section per country (`us`, `canada`); each maps
  unit labels (declarations by name, statements by stable label) to module paths, and runs to wiring-function names. Country
  units with the same label in both planners (`render`, `syncControls`, identical country statement texts) are placed in
  each country's section separately. Declarations not listed fall back to the planner's grouping (a region or a country run); every statement must be listed (section 5.1).
  The rehearsal writes it; it is reviewed with the manifest.
- **Bindings.** A mutable binding is placed with its writers when all writers (functions and statements) are assigned to one
  module; it is then that module's private state, exported for reading only where another module reads it. A binding whose
  writers would span modules is still reported in `bindings.<country>.needsDecision` and blocks its dependents (none of the
  eight does, by construction of the topics file).
- The eight, by module (names indicative; the batch each can move in is in section 7, step 3):

  | module (shared `ui/`) | binding | with |
  |---|---|---|
  | `theme.js` (batch C) | `theme` | `applyTheme`, `wireThemeToggle()` (the toggle listener; `applyTheme` calls `render`) |
  | `sidebar.js` | `sidebarCollapsed` | `setSidebarCollapsed`, `loadSidebarPreference()` (statement @214), the collapse-button listener |
  | `saved-plan.js` | `hadSavedState`, `hasPersonalizedData` | `loadSavedState()` (statement @287 and the split assignment `hasPersonalizedData = hadSavedState;`, called where they run today, before `syncControls`), `dismissFirstRunBanner` (the other writer of `hasPersonalizedData`) |
  | `info-bubble.js` | `infoBubbleBtn` | `infoBubbleAnchor`, `openInfoBubble`, `closeInfoBubble`, `placeInfoBubble`, `wireInfoBubble()` (three document listeners) |
  | `estimate-review.js` (batch C) | `reviewingFieldId` | `jumpToEstimateField` (calls `setMobileView`), `renderEstimatedRollup`, `syncReviewNav`, `advanceReview`, `wireEstimateReview()` (the review buttons and close listener; they reach `render`) |
  | `mobile-view.js` (batch C) | `setMobileView` | `export let setMobileView = () => {};` and `wireMobileTabs()` (the block that assigns it; until it runs, calls do nothing, as today) |
  | `undo.js` | `undoSnapshot` | `snapshotForUndo`, `showUndoToast`, `hideUndoToast` (batch A); `wireUndoButton()` (the undo listener, US @3665, reaches `render`) moves in batch C to an `undo-N.js` module that the tidy batch merges into `undo.js` |
  | `wizard.js` | `wizardStep` | `renderWizardStep` and `wireWizard()` (open, next, back; batch A); the close listener (US @4271, calls `setMobileView`) moves in batch C to a `wizard-N.js` module, with its own wiring function, merged by the tidy batch |

- The single-writer bindings that stage 3 left for this stage (`activeCategory`, `infoBubbleAnchor`,
  `previousUnusualIds` / `unusualToastArmed` / `unusualToastTimer`, `sankeyTooltipEl`, `lastChart`, `chartTooltipEl`,
  `saveDebounceTimer`, `undoToastTimer`, the plan-status timers, Canada's `lastRothOptimizer`) move with their writer, as in
  stage 3. `chartTooltipEl` needs a marker edit first: it is the last line of region 20 (US line 2190, Canada 1784) and its only
  writer, `initChartHover` (US 2192, Canada 1786, identical text), sits just below the end marker, and the planner moves a
  binding with its writer only when both have the same owner. The tool-changes batch moves region 20's end marker below
  `initChartHover` in both planners; `chartTooltipEl`, `clearChartHover` and `initChartHover` then move together into a
  shared chart-hover `ui/` module, and the boot imports `initChartHover` from it. `hasPersonalizedData` gains a second writer through the split rule and is placed as the table says.
- **Extraction creates new modules only.** The applier refuses a path that exists (`extract-units.js`, "already exists"),
  and several topics already have a module (`src/shared/ui/wizard-overlay.js`, `estimates-and-warnings.js`,
  `topbar-and-undo.js`, ...). The batches create new topic modules; the tidy batch (section 5.8) merges them with the
  existing ones of the same topic. No append mode is added to the applier.

### 5.5 Extraction

Unchanged from stage 3 otherwise: the planner computes the movable set as a fixpoint, the applier moves text verbatim, adds
`export` where a name is used outside its module, writes the imports from the analyzer's reference data, stages its writes and
refuses anything it cannot do safely. A shared unit or statement moves only when it is movable in both planners and its text
is identical in both.

### 5.6 What main.js keeps

- The import block.
- Inside the IIFE, in today's order: the wiring calls; the pinned start-up statements (US `statement@96` and `@190`,
  Canada `@70`, section 5.1); the boot sequence that is the plan's start-up logic and reads best in
  one place: US lines 4528-4535, `if (hadSavedState) dismissFirstRunBanner();` through `initChartHover();` (`syncControls();
  syncContributionControls(); setMode(mode); syncTopbarHeight(); syncPanelMaxHeight(); syncKeyboardInset();`), and Canada
  lines 4015-4022, assigned to `main` in the topics file; then `wireTableFocus();` (section 5.1); then `registerMcpTools();`,
  `installSharedTestHooks();` and `installTestHooks();`.
- **Regions that hold only wiring calls count as emptied.** A run's call `<name>();` stands where the run's first statement
  stood, which is often inside a shared region, and the boot statements sit inside region `29-dismissFirstRunBanner`. The
  applier treats a region whose remaining content is wiring calls, comments and statements pinned to `main` (recognised
  as section 5.1 says, never by shape) as emptied: it removes the markers and the fragment, and what remains, comments that
  belong to no statement included (they are kept, not dropped with a warning as today), becomes ordinary `main.js` text in
  each planner (identical in both,
  checked before the markers go). So every region disappears in the batch that empties it; the cleanup batch strips any
  marker that is still there (none expected).
- The IIFE wrapper stays (removing it re-indents the file; a one-commit follow-up).

### 5.7 Rule 3 of the parent design, reworded

"`window.__test_*` hooks and the MCP tool registration are installed only from `main.js`, by calling `registerMcpTools()`,
`installSharedTestHooks()` and `installTestHooks()`, in that order. They are defined in dedicated `ui/` modules
(`src/shared/ui/mcp-tools.js`, `src/shared/ui/install-test-hooks.js`, `src/<country>/ui/install-test-hooks.js`), never in
`core/`. The country installer runs last because it redefines some shared hooks."
The parent design keeps its wording as history; CLAUDE.md states the new rule.

### 5.8 Tidy: names and UI grouping

`scripts/regroup-modules.js --map <file> [--dry-run]` takes a list of renames (`old path -> new path`), merges (`[paths] ->
new path`) and moves (`move <name> from <path> -> <path>`: one top-level declaration, with its comments, moved verbatim into
another module, new or existing; exports and imports rewritten everywhere), rewrites every import in `src/` (relative paths and seam facades), refuses a name clash, and stages its writes like the extraction tool. **After every
operation (rename, merge or move) it re-runs, on the result, every structural guard:** `core/` purity
(`tests/core_purity.js`'s rules), no import cycle that touches `core/`, the UI cycle guard of section 5.3, the initializer
check of section 6.4 and the facade-side rule of section 5.2 (a move that changes which side a seam name's target is on
moves its facades too, or is refused); it refuses the operation if one fails. It refuses to move a mutable binding without
all its writers (an assignment to an import is a build error), and a declaration that uses UI code into `core/`. A merge
concatenates module bodies in dependency order and merges their import lines; it does not change a statement. Inside an
import cycle there is no dependency order, so a merge of cycle members keeps the order of the map and is allowed only when
every member passes the load-time guard of section 5.3 (inert initializers, or marked ones that read nothing from the
cycle), which makes the order irrelevant. Outside `src/` it also rewrites the paths that name modules:
`tests/state_modules.js` (which loads modules by path) and the module paths in CLAUDE.md, and it lists the generated rule
docs whose recorded source path changed (`scripts/gen-*-rules.js` print it), which the batch then regenerates with
`npm run gen:states` / `gen:provinces` / `gen:benefits`. A module's **purpose comment** is line 1 of the file: a `//` line that does not start with `load-time:`, followed by a blank
line (so it never joins the comment block of the first unit). `move` and merge drop the purpose comments of their source
modules; the target keeps its own. Fixture tests cover a rename, a merge, a move, a facade rewrite, a path outside `src/`, a
refused cycle, a refused clash, a refused move of a binding without its writers and a refused move into `core/`. After every operation the tool also reports any change in the order in
which the `// load-time:` initializers run in the bundle (module order changes with a merge); the batch reviews the report.

Applied once, after the extraction batches: every `-N` module and every module named after an unrelated unit gets a topic
name (`FIELDS` gets `src/us/ui/fields.js`); modules that hold two topics are split with `move` (`mc` moves to
`src/shared/ui/mcp-tools.js` and `makeTableWrapsFocusable` to its topic, out of `first-run-ui.js`; `undoToastBtnEl` to the undo
module and `syncTopbarHeight` to the layout module, out of `topbar-and-undo.js`; `infoBubble` to `info-bubble.js` and
`markUnusualFields` to the warnings module, out of `ui/estimates-and-warnings.js`); the new topic modules of the batches
merge with the existing modules of the same topic, and the existing `ui/` modules join their topics (for example the three
`update-chart-*-buttons` modules join the chart controls). The same batch, after all moves and merges, writes a purpose comment at the top of every
`ui/` module (by the definition above nearly every module lacks one today; comments are outside the statement comparison).
`core/` modules get theirs with the core regrouping after Stage 4; the module map shows "(no purpose comment)" for them. The rename list is part of
the plan, reviewed before it runs.

### 5.9 Cleanup

Strip any `@@shared` markers that remain (every remaining region; none is expected after section 5.6's rule) and delete
their fragments;
delete `scripts/sync-shared.js` and `shared/`; remove every caller of the region checker: the `node scripts/sync-shared.js
--check` step inside the `test` script, the `sync` and `check:shared` scripts in `package.json`, and the CLAUDE.md passages that
tell people to run `npm run sync` or `--pull`; keep `scripts/lib/marker-source.js`, which finds the `// NAME:begin` data blocks
(`STATE_RULES`, ...) for the generators and has nothing to do with `@@shared`; remove
the region and fragment handling from `scripts/lib/extract-units.js` and the analyzer's region-specific inventory section
(or keep them as inert code if removal is larger than it is worth: the plan decides after reading them; the tools' marker
regexes and the fixtures in `tests/closure_analyzer.js`, `tests/extract_units.js` and `tests/extraction_plan.js` go or stay
with that code); add `tests/no_markers.js` (no `@@shared` marker anywhere in `src/`; `scripts/` and `tests/` are not scanned,
because the tools and their fixtures may still name the marker).

## 6. Guards and tests

### 6.1 New tests in `npm test`

- `tests/ui_cycles.js` (section 5.3).
- `tests/no_bare_imports.js`: no `import '<path>';` in `src/`.
- `tests/module_names.js`: no module file name matching `-\d+\.js$`. Added with the tool changes, with an allow-list holding
  the seven existing `-2` modules and any `-N` name the planner makes in batches A-D; the tidy batch empties the list, and an
  empty list is then required.
- `tests/no_markers.js` (section 5.9, added in the cleanup batch).
- The module map (`docs/superpowers/inventory/module-map.md`: per module, its path, side, exports and a one-line purpose
  taken from its purpose comment, line 1, section 5.8) is written by `npm run analyze` from the tool-changes batch on, and checked for
  staleness in `npm test` (`--check`, like the `gen-*-rules` scripts). The purpose-comment requirement (a `ui/` module without a
  purpose comment fails; `core/` modules are exempt until the core regrouping) is switched on in the tidy batch, which writes the missing comments; from then on every new
  module says what it is for.
- Fixture tests for every tool change (`tests/extraction_plan.js`, `tests/extract_units.js`, a new `tests/regroup_modules.js`,
  `tests/compare_builds.js` for the ordered mode).

### 6.2 The build comparison, ordered mode

`node scripts/compare-builds.js --base <dir> [--head <dir>] [--ordered]`. The steps, on each side:
1. Flatten the IIFEs and list the top-level statements, as today.
2. **Expand the wiring functions (head).** In the bundle the `export` keyword is gone, so a wiring function is recognised as a
   top-level function declaration whose name the base lacks and that the head calls exactly once, as a bare statement
   `<name>();`, at top level. The call is replaced by the function's body statements and the declaration dropped. A new
   function that is called twice, or called from anywhere else, fails the comparison (it is not a wiring function, and a
   refactor adds no other function).
3. **Undo the split rule (head).** A declaration without initializer whose name the base declares with one, together with the
   single top-level assignment `x = <same text>;`, compares as the base's declaration; for the ordered step the base's
   declaration takes the position of the assignment.
4. **Flatten again**: the expanded bodies can contain IIFEs (for example `(function setupFieldSearch(){...})()`), which are
   flattened as in step 1. Split multi-declarator declarations.
5. **Multiset**: the multisets of statement texts must be equal (the stage 3 check, now after expansion).
6. **Ordered** (with `--ordered`): the sequence of top-level statements that are not declarations, plus the declarations of
   step 3, must be identical, in order, between base and head.
The base is the previous commit, built in a scratch worktree; at the end of the stage also `9405d96`. Fixture tests
(`tests/compare_builds.js`) cover each step, including a reordered pair of statements, a wiring function called twice, and a
split declaration moved to the wrong position.

### 6.3 Every batch

`npm test` (snapshots unchanged: `git diff --stat tests/snapshots` empty; `tests/snapshot_ui.js` pins each control's wiring,
the MCP schema, a clean load at desktop and phone width with `pageerror` collected, and the rendered results text), both
comparison modes, all 19 `test_*.js` (the rehearsal records which pass on `9405d96`; a script that already fails there is
listed and must not get worse), and an independent review of each task.

### 6.4 Initializers that move earlier

A non-inert top-level initializer (section 2's definition: a plain reference to another name is not inert) in a `ui/` module, or
moving out of `main.js`, is allowed to run at load only when the contiguous comment block directly above it starts with
`// load-time: <reason>` (a reason may continue on the following comment lines), and the reason says why it reads nothing
that a statement or another function writes. The rule covers `ui/` modules only: about 33 non-inert initializers in `core/`
modules (for example `src/shared/core/spending-and-loans.js:194`, `src/us/core/new-state-sources.js:17`,
`src/canada/core/ramq-cap.js:13`) are pure data built at load and are left unmarked; core regrouping (after Stage 4)
decides whether to mark them. The comment lives at the declaration, so it moves with the unit (the
tool carries the comments above a unit) and stays where a person editing the module sees it. The planner, the regroup tool
and `tests/ui_cycles.js` all read this one marker; there is no separate allow-list. The tool-changes batch adds the comment to
the ten safe initializers of section 2 (`ids`, `MCP_FIELDS`, `theme`, `previousUnusualIds` in each `main.js`, and the six in
`ui/` modules); these are comment-only edits, outside the build comparison. Those in `main.js` sit in shared regions (`ids`, 02, 04), so
the step edits a planner and runs `npm run sync -- --pull src/us/main.js` then `npm run sync`, and `npm run check:shared`
must pass. Where a comment block already sits above a declaration (`storage.js:7-13`), the `// load-time:` line becomes its
first line. Every other non-inert initializer of a moving
declaration is split (section 5.1; today `hasPersonalizedData`); the planner fails on one that is neither marked nor
splittable, and `tests/ui_cycles.js` fails on an unmarked one in a cycle. The rehearsal records which modules end up in the
`render` cycle and checks that every merge planned for the tidy batch is still legal under the guard.

### 6.5 End of stage

Both comparison modes against `9405d96`; `tests/bench_heavy.js` on `9405d96` and on the head, alternating, three runs each,
medians compared (+5% allowed; noise on this machine is about 10%). The engine does not move, so `bench_runs` and
`bench_solver` are not required.

## 7. Order

1. Tool changes, each with fixture tests, and three comment-only source edits, outside the build comparison:
   - the `// load-time:` comments of section 6.4 (inside regions: made in the US planner, then `npm run sync -- --pull
     src/us/main.js` and `npm run sync`);
   - the four `@@shared` `begin` markers that split a comment block move above the block's first line (US lines 233, 980,
     3709, 4580; Canada 113, 815, 3258, 4067), so no comment line is left behind in `main.js` as a fragment;
   - region 20's end marker moves below `initChartHover` (section 5.4).
   Marker moves are made **by hand, as the same edit in both planners** (a `--pull` from one planner would copy the line into
   the fragment and `sync` would then duplicate it in the other planner, unflagged), then `npm run sync -- --pull
   src/us/main.js` and `npm run check:shared`. `scripts/sync-shared.js --check` gains a check that fails on a marker between
   two comment lines; it retires with the script in the cleanup batch.
   The tool changes: movable statements and wiring functions with shared run boundaries, the split rule
   and unique wiring names (5.1), stable statement labels, UI facades chosen per name (5.2) and the planner rule that a unit using a seam name whose facade is under `ui/` is `ui` in
   both planners (so `computeScenarioMetrics` and `computeOverlaySeriesFor`, which use `normalizeState`, never put a `ui/`
   import into `core/`), UI cycles and the load-time guard
   (5.3), the topics file and binding placement (5.4), the `// load-time:` comments and their check (6.4), the ordered comparison (6.2), the new
   guards (6.1: `module_names` with its allow-list; not `no_markers`), the module map (purpose comments not yet required).
2. Rehearsal in a scratch worktree: the manifest `scripts/extractions/stage4.json` and `stage4-topics.json`, the batch and
   module counts, the baseline of the 19 ad-hoc scripts. Committed.
3. Extraction batches. The letters are topic labels; the planner's depth order decides what can move when, and the
   rehearsal fixes the exact cut. The thirteen seam names are in the manifest's `seam` list from batch A on (the 48 US and 47
   Canada units of section 2 need them). Nothing that reaches `render` can move before the cycle does (section 2: 54 of the
   190 shared units in each planner reach it, among them the writers of `theme`, through `applyTheme`, and of
   `setMobileView`). The test is "depends, directly or transitively, on `render`, `theme` or `setMobileView`" (the last two move with the cycle).
   So: A, leaf UI topics, `sidebarCollapsed`, `hadSavedState` and `infoBubbleBtn`, and `undoSnapshot` and `wizardStep` with
   their writer functions only (their listeners that reach batch-C code wait, section 5.4); B, the shared UI that depends on
   none of the three; C, the country hubs, the cycle, `theme`, `mobile-view`, `reviewingFieldId` (its writer
   `jumpToEstimateField` calls `setMobileView`), the undo, review and wizard-close listeners (to `-N` modules), and
   everything else that depends on the three; D, the country listeners, `src/shared/ui/mcp-tools.js` and the two `install-test-hooks.js` modules
   (`main.js` reaches its final shape; every region is gone).
4. Tidy: renames, merges into the existing topic modules, UI regrouping and purpose comments (5.8); the `module_names`
   allow-list is emptied and the purpose-comment check switched on.
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
- A new topic: a new module under `src/shared/ui/` (both planners) or `src/<country>/ui/`, whose line 1 is a one-line purpose
  comment followed by a blank line (the module map reads it).
- Shared UI code that needs a country UI name imports it from `#country/ui/seam-<name>`.
- In a `ui/` module, a module-level initializer that computes something (anything but literals, functions, arrows, classes,
  and object or array literals of those) runs when the module loads. It needs a comment block directly above it that starts
  with `// load-time: <reason>`, saying why it
  reads nothing a statement or another function writes; otherwise compute it inside a wiring function. In a module that is
  part of an import cycle, a marked initializer must also read nothing from the cycle (`tests/ui_cycles.js` checks both).
- The guards: `tests/closure_names.js` (undeclared names), `tests/ui_cycles.js`, `tests/no_bare_imports.js`,
  `tests/module_names.js`, the module-map check. The ordered build comparison is for refactors only; a feature changes the
  statements on purpose.

## 10. Known limits at the end of Stage 4

- `core/` still has many one-unit modules (follow-up, with the same regroup tool), and about 33 non-inert `core/`
  initializers carry no `// load-time:` comment (the rule covers `ui/` only), and `core/` modules have no purpose comment yet.
- `main.js` keeps its IIFE wrapper.
- The load-time guard is static: it proves that nothing in a UI cycle runs code while modules load (inert initializers
  only), not that a wiring function never runs before another one it depends on; the ordered comparison covers that for this stage, review covers it afterwards.
- The ordered comparison leaves declarations out, so the order in which `// load-time:` initializers run is not compared;
  the regroup tool reports changes to it (section 5.8). Harmless today: none of them depends on another.
- Real browser ESM is not exercised (only the esbuild bundle); the cycle guard is what keeps a later Vite dev server possible.
- The namespace-import gap of the applier (`import * as`) stays; nothing uses it.
