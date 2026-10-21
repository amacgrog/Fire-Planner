# Stage 4: open items

Deferred minors and rulings from the Stage 4 implementation (tasks 1-14 of `docs/superpowers/plans/2026-10-15-stage4-ui-extraction.md`),
kept as a running list during the work and regrouped here by kind. One line per item: task | file | what it is | why deferred or
how it was ruled. Paths are those of the final tree (after the tidy's renames); line numbers are approximate. **Limits** are
behavior a later change could trip over (each is also listed in section 10 of `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`);
**Tidiness** are code cleanups nobody depends on; **Resolved** are items closed by an owner decision or fixed by a later commit.

## Limits

- T2 | scripts/analyze-closure.js | Statement labels are a hash of the text: a repeat inside one scope (a region, or the code outside regions; with no region left, the whole `main.js`) gets `#2`, `#3`; the same label in two scopes, or two texts with one hash prefix, throws `duplicate statement label`. | Intended: the tools key their maps by label, which must be unique per file.
- T3 (ruling) | scripts/lib/load-time.js | A class `extends` expression, a computed key, a static field or a static block counts as load time (the class expression is not inert). | Stricter guard; a real class added to a ui/ module would need a `// load-time:` comment.
- T3 | scripts/lib/load-time.js | A `"use strict"` directive at module top is reported as a top-level statement. | Not present in src/; a module that adds one fails the guard.
- T3 | scripts/lib/module-graph.js | An unresolved relative or `#country/` import throws, also a relative import into the other country's tree. | Fails loudly; none exists.
- T3 | scripts/lib/module-graph.js | `facadeTargets` caches results computed with a non-empty `seen` set (latent for cyclic facade chains, untested). | No facade re-exports another facade.
- T4 (ruling) | scripts/compare-builds.js | `--ordered` does not compare the order of declaration initializers other than split-matched names (`var a = f(); g();` and `g(); var a = f();` both pass). | Plan as written: declarations move between modules by design; ui/ and core/ initializers are both covered by the load-time guard (core/ since core regroup Task 4). Already in design section 10.
- T4 | scripts/compare-builds.js | Wiring expansion repeats to a fixed point (nested wiring functions expand), a superset of the plan's single pass. | Harmless; fixture added.
- T4 | scripts/compare-builds.js | `ALLOWED_DROPS` matches by substring; a short entry could mask a real missing statement. | The list is empty.
- T5 (ruling) | scripts/lib/extraction-plan.js | For a topics module that already exists only declaration labels are verified; a mistyped statement label there is accepted silently and a `wiring` entry on it is never validated. | Moved statements cannot be verified once gone.
- T5 | scripts/lib/extraction-plan.js | Unknown topics-file keys (a misspelt section name, `unit` for `units`) are ignored. | Cheap whitelist check deferred.
- T5 | scripts/lib/extraction-plan.js | A topics file can split a `// NAME:begin/end` data block across modules; nothing checks that the block moves whole. | Not hit by any topics file.
- T5 | scripts/plan-extraction.js | `--draft-topics` together with `--topics` ignores the topics. | The draft is used alone.
- T6 (ruling) | scripts/lib/extraction-plan.js | The load-time / split rule runs only when a topics file is given (`topics && !draft`). | No-topics output had to stay unchanged and the stage 2-3 fixtures would throw.
- T6 | scripts/lib/extraction-plan.js | The seam-side rule is not transitive: only shared units that use a ui-side seam name become ui; a country unit calling it directly is not forced to ui. | Matches `importsUi`; no core-to-ui edge on the tree. If `tests/core_purity.js` fails after a plan, check this first.
- T6 | scripts/lib/extraction-plan.js | `bindings.colocated` keeps `{ declaredIn, writer }` for a split declaration; the applier takes splits from the module's `splits` entry. | Nothing else reads `colocated`.
- T6 | scripts/lib/extraction-plan.js | The seam-side recompute (up to 3 rounds; `seam sides do not settle` throws) is untested and never entered on the tree; `nodeAllUi` judges by the data block's side while path naming uses the unit's side. | Fails loudly; rare.
- T7 | scripts/lib/extract-units.js | The wiring-name clash check covers top-level declarations and imports, not free globals. | The planner reserves names (`stage4-reserved.json`).
- T7 | scripts/lib/extract-units.js | A whitespace-only source line inside a moved chunk keeps its trailing spaces. | No such line exists.
- T7 | scripts/lib/extract-units.js | `functionBodyProblem` passes a statement when its syntax node is not found (a second copy of the IIFE-finding logic). | Cannot happen today.
- T7 | scripts/lib/extract-units.js | The unit-count mismatch check is unreachable from the fixtures. | Guards a future rewrite bug.
- T9 | scripts/module-map.js | A UTF-8 BOM on line 1 reads as `(no purpose comment)`; a `///` line counts as a purpose and renders as `/ text`; a `/* */` line 1 is not a purpose. | The purpose is defined literally as a `//` line 1 and a blank line 2.
- T10fixB | scripts/lib/extraction-plan.js | Without a topics file the cross-owner cycle test stays per unit (`nodeAllUi`); with one, only topics modules are judged by path, so an unlisted plain `let` grouped into a cross-owner ui cycle still throws. | Conservative and asymmetric; refuses rather than accepts.
- T10 | process (compare-builds) | The ordered count of `compare-builds.js --ordered` against the previous commit is not comparable between batches (the previous tree's own wiring functions are not expanded); only the count against the pre-stage base (220 US / 145 Canada) is stable. | Documented.
- T11b1 | src/shared/ui/saved-plan.js | `export let hasPersonalizedData;` is `undefined` until `loadSavedState()` runs (the split rule; the original declared it assigned). | Equivalent at start-up (the call stands where the declaration ran); a reader added before that call would see `undefined`.
- T11b3 | esbuild bundling | esbuild turns `let` into `var` in the flat bundle scope and orders modules by dependency; in an import cycle a wrong order gives a silent `undefined`, not a TDZ error. | Safety rests on `tests/ui_cycles.js` (inert or marked-and-global-only initializers, no top-level calls in cycle modules).
- T11b4 | ui/ modules outside cycles | Load-time safety of acyclic modules rests on esbuild putting dependencies first; no test asserts it, and a marker's reason ("reads nothing a statement writes") is not machine-checked outside cycles. `MCP_FIELDS` (`src/shared/ui/mcp-tools.js`) and `ids` (`src/shared/ui/field-ids.js`) read `FIELDS`, which initializes earlier in both bundles and is never mutated. | A start-up statement that mutated `FIELDS`, or a marked initializer reading something assigned later, would pass every guard (core/ shares the guard and the caveat since core regroup Task 4).
- T12 | scripts/lib/regroup.js | Namespace imports (`import * as ns`) and `export *` are not tracked: a merge may drop an `export`, a move ignores namespace users, and esbuild runs with `logLevel: 'silent'`, so `ns.name` would quietly become `undefined`. | src/ has no namespace or default imports; refuse one if it is ever added.
- T12 | scripts/lib/regroup.js | Writes are always LF, CLAUDE.md included, on a CRLF checkout ("LF will be replaced" warnings until git normalizes on commit). | Same as the other tools.
- T12 | scripts/lib/regroup.js | Staged writes: a `renameSync` failure midway (a Windows file lock) leaves a partial application and `.regroup-tmp` files. | git recovers; a "partial apply" message would help. Same pattern in extract-units.js.
- T12 | scripts/lib/regroup.js | The in-file TDZ check does not see through hoisted functions (a marked `const v = f()` whose `f` reads a later `const`), class static fields or `export default <expr>`. | Dependency ordering and the cycle rule cover the realistic cases.
- T12 | scripts/lib/regroup.js | The writer check covers `let`/`var` only (reassigning a function or class binding is not checked). | esbuild's assign-to-import error catches it in reachable code.
- T12 | scripts/lib/load-time.js | The cycle rule is conservative: any module-level name in a marked initializer of a cycle module (even through a shadowing parameter) is flagged. | Refuses rather than accepts.
- T12fix1 | scripts/lib/regroup.js, scripts/analyze-closure.js, scripts/lib/extract-units.js | `DATA_MARK` is `^\s*// ([A-Z][A-Z_]*):(begin|end)\s*$`: a data-block name with a digit or hyphen (`E1_RULES`) would not be recognised. | No such name exists; widen all three together.

## Tidiness

- T2 | scripts/analyze-closure.js | `const label = (u) => u.label` is a pass-through. | Harmless.
- T2 | tests/extract_units.js ~179 | `labelOf` hashes a whole fixture line; it breaks if a trailing comment is added to that line. | Fails loudly.
- T3 | scripts/lib/module-graph.js, tests/no_bare_imports.js, tests/module_names.js | The `allJs` / `walk` file walker is written three times. | Small.
- T3 | scripts/lib/load-time.js | Dead `ClassExpression` branch for `export default`. | Harmless.
- T4 | scripts/compare-builds.js | `it.src` assigned in three loops; `--head` / `--base` followed by a flag reads the flag as a path. | Cosmetic.
- T5 | scripts/lib/extraction-plan.js | `addWiring` defined after `return` (hoisting); `topLevelNames` re-parsed per call; `IDENT` accepts reserved words; the `module cycle across owners` message names no unit. | Cosmetic.
- T5 | tests | No CLI test for `--topics` / `--reserved`. | Covered at library level.
- T6 | scripts/lib/extraction-plan.js | Dead `|| !compAllUi` term in `crossOwnerBeyondAccepted`; the recompute comment overclaims. | Harmless.
- T6 | tests/extraction_plan.js | Fixture 5's `cyc.length >= 2` is loose; no fixtures for several splits, another module's split breaking a run, a shared split whose text differs, a split binding with a function writer elsewhere, `var` / multi-declarator `let` in core/, the seam recompute round. | Probed by the reviewer; all behaved.
- T7 | scripts/lib/extract-units.js | `report.wiring` is ordered by planner (US, then Canada). | Cosmetic.
- T7 | tests/extract_units.js | The `break` / `continue` fixtures call `functionBodyProblem` directly instead of going through the applier. | A top-level `break` does not parse in a tree.
- T8 | scripts/extract-units.js | The CLI is only smoke-tested; no fixture runs it (the repository root is fixed in the CLI). | Library-level fixtures cover the applier.
- T9 | scripts/module-map.js | A parse error prints a full stack trace; `--check` with `--require-purpose` works together only because failures accumulate (uncommented); facade rows list the union of a directory's seam exports. | Cosmetic.
- T10fixA | tests/ui_cycles.js | Fixtures (b)-(f) also pass on the code before the fix (they guard against over-skipping, not a revert); no CRLF marker fixture; a marker in the middle of a comment block still counts as marked. | Test strength only.
- T10fixB | scripts/lib/extraction-plan.js ~490 | The comment overstates: automatic paths use `uiUnit` while `nodeAllUi` uses `sideOf`, so a data unit split alone can be ui by `sideOf` yet get a core/ path (the applier would refuse the plan). | One predicate in both places would close it.
- T10fixB | scripts/lib/extraction-plan.js ~589 | Duplicates `pathSide` inline; one place tests `/\/core\//`, the other `includes('ui')`, so `src/us/core/ui/x.js` is core to one and ui to the other. | Topics paths are not checked to name exactly one of ui/ or core/.
- T10fixB | tests/extraction_plan.js | Fixture 6c's error check uses an alternation for module order. | Pin it if the order is deterministic.
- T10 | naming | Suggestions the regroup map did not take: `render-plan-headline.js` + `shortfall-banner.js` as one topic; modules named after one function (`compute-sankey-flow.js`, `render-group-summaries.js`, `sync-contribution-controls.js`, `normalize-state.js`, `state-tax-treatment-note.js`); shared `roth-optimizer-card.js` beside country `roth-optimizer.js`; `cagr-colors.js` is display data in core/. | Not in the map.
- T10, T11b5 | src/us/ui/install-test-hooks.js | One 291-line `installTestHooks` with 66 independent `window.__test_*` assignments; a split by topic would be safe except one ordering dependency (`__test_inherited.sourcesInh` must follow the line that defines it). Also `chart-toolbar.js` and `info-bubble.js` hold many units; US chart controls have two wiring functions where Canada has one. | Rule 3 allows one installer; flags only.
- T11b0 | src/us/ui/wizard.js:4 | The carried comment says "a two-step guided setup"; the US wizard has three steps (stale in the original). | Comment only.
- T11b0 | src/shared/ui/install-test-hooks.js:9-16 | The carried comment refers to "already used above for the MCP tool hooks" and "this closure", code that moved. | Comment only.
- T11b0, T11b1, T11b4, T11b5 | src/*/main.js, src/canada/ui/chart-view.js, install-test-hooks.js, chart-controls.js, pension-buttons.js, src/us/ui/chart-view.js | Import blocks are ordered differently per country and new imports were appended rather than grouped (generator order). | Cosmetic.
- T11b1 | src/shared/ui/saved-plan.js | Holds both the saved-plan load and the first-run banner; the name covers both but the module is broad. | Fine as is.
- T11b3 | src/shared/ui/decision-questions.js:55, mobile-view.js:6-9, estimate-badges.js:31, unusual-warnings.js:19 | Carried comments still point at the old main.js layout ("the three toggle listeners above", "the 'open' questions below", "elsewhere in this file", "this file's own ... note"). | Comment pass later.
- T11b3 | src/shared/ui/estimate-review.js:22 | `typeof setActiveCategory === 'function'` is always true now (an import). | Drop it with a behavior-neutral edit.
- T11b3 | src/us/ui/unusual-warnings.js | `addSocialSecurityWarnings` beside `src/shared/ui/unusual-warnings.js`; consider a clearer name. | Naming.
- T11b4 | src/shared/ui/theme.js:7, wizard.js:77, chart-toolbar.js:26 and :89, src/us/ui/roth-optimizer-controls.js:13 | Positional comments that point at code now elsewhere ("unlike state/mode below", "see the CSS note above", "chartToolbarCollapsed's declaration" now in `src/shared/core/chart-prefs.js`, "tryEnterLandscapeFullscreen above" now in `landscape-fullscreen.js`, "this card's own re-simulation above"). | Comment pass later.
- T11b5 | src/shared/ui/money-format.js:18 | `attachMoneyPreview` is exported but imported nowhere (used only in its own module); predates Stage 4. | Drop the `export`.
- T11b5 | scripts/extractions/names.json | Still names modules of removed regions (`topbar-and-undo`, `first-run-ui`, ...). | History of stages 2-3; harmless.
- T12 | scripts/lib/regroup.js | Merged import specifiers keep encounter order; the load-time order report prints every inverted pair; several lines over 200 characters. | Cosmetic.
- T12fix1 | tests/regroup_modules.js | `made.reverse()` mutates `made` (runs once, in `finally`). | Harmless.
- T13, T13fix | src/shared/ui/input-gestures.js:1, disclaimer-link.js:1 | The purpose lines are long (about 230 and 118 characters; typical 40-110). | Cosmetic.
- T13 | src/shared/core/projection/year-factors.js | The indexing comment (US and Canada texts) sits above the memo comment, not directly above `taxIndexFactor` (line numbers dropped by the core regroup). | Cosmetic.
- T13 | src/us/core/analysis/shortfall-drivers.js and src/canada/core/analysis/shortfall-drivers.js ~9 | A moved comment ends mid-sentence ("... simulateAtRealCagr(). These"), truncated in the base and moved verbatim. | Comment pass later.
- T14 | scripts/analyze-closure.js:27, 324; scripts/lib/load-time.js:36, 43; scripts/lib/extraction-plan.js:15; scripts/lib/extract-units.js:37; tests/closure_analyzer.js, tests/extraction_plan.js | `@@shared` region handling stays, inert (no marker remains in src/); the fixtures still use markers. | By the plan: removal larger than it is worth.
- T14 | tests/no_markers.js | No committed red fixture (`--root DIR` makes one easy). | Optional self-test.
- T14fu | scripts/lib/extract-units.js | The header example uses a `src/shared` path with a country owner; section comments jump from 1 to 3; single-element leftovers (`[m.owner]`); `seamSides` is only validated (no effect) and its comment, and the CLI's, overstate it. | Cosmetic.

## Resolved

- T5 (ruling) | scripts/lib/extraction-plan.js | Step 0 baseline movable 29 / 28, not the plan's 26 / 25 (Task 1 moved region 20's end marker below `initChartHover`). | Owner accepted; the plan was corrected (`324ac08`).
- T8 | scripts/lib/extract-units.js | `wiringRecord[].module` never read; `pinned` merged the three `main` lists. | Both options dropped (`aa66c0f`).
- T8 | scripts/lib/extract-units.js | `seamSides` trusted: a ui-side name missing from it would get a core/ facade importing ui/. | The applier no longer creates facades (Task 14); it compares the facades on disk.
- T8 | scripts/lib/extract-units.js | A region emptiable in one planner only gave a misleading message; the "dropped comment lines" warning was gone; the emptied-region block-comment classifier was untested. | The region code was removed in Task 14 (`affe8b3`).
- T8 | scripts/extract-units.js | A missing or unparsable topics file threw outside the `try`. | The CLI no longer reads the topics file (`aa66c0f`).
- T9 | scripts/module-map.js | `--require-purpose` was not in `npm test`, and its seam-facade skip in ui/ was never exercised. | Switched on in the tidy (`1d61e44`); ui/ facades now exist (`src/<country>/ui/seam-*.js`).
- T10 | scripts/lib/extraction-plan.js | A cross-owner cycle was accepted only if every unit was `ui`, rejecting the render cycle. | Owner ruling: accepted when every module has a ui/ path (`785ffcc`).
- T10 | scripts/lib/load-time.js | A `// @@shared:<name> begin` line above a `// load-time:` comment hid the marker. | `loadTimeMarker` skips marker lines (`87ef087`); no marker remains.
- T10fixA | scripts/lib/load-time.js | `SHARED_MARKER` should name `sync-shared.js`'s MARK. | `sync-shared.js` was deleted (Task 14); the regex is inert.
- T10fixB | scripts/lib/load-time.js | Only direct reads of a cycle partner were caught (an indirect read through a local function passed). | Closed in Task 12 (`6cafd34`): a marked initializer in a cycle module may use only globals (browser globals and ES built-ins such as `Set`) and literals.
- T10fixB | tests/extraction_plan.js | The fix-round-1 fixture's `g` moved to `src/us/core/b.js` so it still tests a refusal. | Recorded; no action.
- T10 | src/{us,canada}/main.js | Orphan comments and blank runs left in the IIFE. | Owner decision: Task 13 step 2b moved or deleted them (`1d61e44`, `01172a6`); `main.js` holds none.
- T10 | plan Task 12 | No fixtures for a rename onto a path an earlier operation freed, or an existing merge target among its own sources. | Fixtures 7 and 8 in `tests/regroup_modules.js` (Task 12).
- T10, T12 | regroup map | The chart-controls merges widen the render cycle from 11 to 13 modules per country; `layout-metrics.js` instead of "the layout module". | Owner: topic over cycle size; `layout-metrics.js` confirmed; `layout.js` renamed `layout-listeners.js` (map op 25).
- T10 | process | A driver grep for "warning:" false-positived on `wireUnusualWarnings`. | Fixed in later batches.
- T11b0 | src/shared/ui/table-focus.js | Imported `makeTableWrapsFocusable` from `first-run-ui.js`. | Moved into `table-focus.js` by the regroup (op 10).
- T11b0 | src/shared/ui/wizard.js | `wireWizard` and `wireWizardDismiss` split by the wizard-close listener in another module. | `wizard-overlay.js`, `wizard.js` and `wizard-2.js` merged (op 17); three wiring functions in one module.
- T11b0 | src/shared/ui/input-gestures.js | An orphan line from the base and a wrong purpose line. | Fixed (`01172a6`).
- T11b0 | naming, indentation | `add…` names for `addChildrenList` / `addSocialSecurityWarnings`; modules keep the IIFE's two-space indentation. | Ruled: defensible; by design (code moves verbatim).
- T11b1, T11b2, T11b3, T11b4 | src/*/main.js | Stale `@@shared` region names around moved code; the inline test hooks and the reset listener still in US `main.js`. | Batch 5 (`a10df25`) and Task 14 (`affe8b3`): no region or marker remains.
- T11b1 | src/us/main.js | `seHealthDeduction`, `lumpAmountsForYear`, `selfEmploymentTax` imported but unused. | Used by `src/us/ui/install-test-hooks.js` since batch 5; no unused import remains.
- T11b2 | src/shared/ui/autosave.js | The module's description sat above `writeStorageNow` only. | The tidy wrote a purpose comment on line 1.
- T11b3 | plan Task 12 | The cycle rule had to allow ES built-ins (`new Set()` in `unusual-warnings.js`). | Plan `ae8fc8f`, implemented in Task 12.
- T11b3 | seam sides | `seam-syncControls` did not exist yet; `SENSITIVITY_LEVERS` and `renderDecisionCompareTable` are core-side. | Created in batch 4; recorded.
- T11b4 (owner ruling) | src/us/ui/sensitivity.js and src/canada/ui/sensitivity.js (byte-identical) and src/us/ui/pension-buttons.js and src/canada/ui/pension-buttons.js (identical bodies) | Stay out of Stage 4. | Candidates to become shared modules later (a seam change, not a regroup operation).
- T11b5, T12fix1, T13, T14 | process | The implementer staged before the full suite finished (the controller re-ran it, `exit 0`); one `sed -i` on a test file and two logs in /tmp (no repo impact); a report misplaced one copy of the Real-CAGR comment (end state correct); generator docs rewritten without `--check` and reverted. | Process notes; no code impact.
- T12 | real map dry run | Verbose load-time order report for ops 9, 11 and 17 (marked document lookups and literals only). | Reviewed in Task 13 step 2.
- T13 (owner ruling) | `dyn-field-html.js` (now `src/shared/core/inputs/dyn-fields.js`), `field-wiring.js`; `chart-hover.js` and `money-format.js` in core/ and ui/ (as of Task 13; later merged or moved: only `src/shared/ui/chart-hover.js` and `src/shared/ui/money-format.js` remain) | Names kept: they describe what they hold, and the core/ui pairs are the intended split of one topic. src/shared/core has no `decision-questions.js` (only shared/ui, us/ui and canada/ui do). | Owner ruling at the Task 13 checkpoint.
- T13 (owner ruling) | src/us/ui/dynamic-lists.js:1 and src/canada/ui/dynamic-lists.js:1 | Purpose wording ("The children list: adds its rows to the sidebar") left as is. | Owner ruling.
- T13 | src/shared/ui/disclaimer-link.js:1 | The purpose line was vague. | Reworded (`01172a6`); its length is under Tidiness.
- T13 | src/us/ui/fields.js:1 | The purpose line covers `FIELDS` only; the module also holds `clampProfitSharing` (a `FIELDS` `onInput`). | Reviewer: fine as is.
- T14 | scripts/lib/extract-units.js | Dead `owner === 'shared'` branches and the unreachable wrong-side facade check. | Removed (`aa66c0f`).
- T14 | tests/extract_units.js | About 250 lines of region fixtures removed with the region code. | Live behavior keeps its tests; facade-equality fixtures restored (`44bded5`).
- T17 (prerequisite for the core regroup) | tests/ui_cycles.js, scripts/lib/regroup.js, scripts/lib/extract-units.js, scripts/module-map.js | Four separate tests of what a ui/ path is, and nothing refused a module outside both core/ and ui/. | One definition (`scripts/lib/src-paths.js`, `sideOf`) and the refusal (`tests/src_paths.js`), core regroup Task 1.
- T17 (prerequisite for the core regroup) | src/us/core/tax/federal-tax.js, src/canada/core/withdrawals/draws.js | Misleading module names (the US `taxFor` in `standard-deduction.js`, the Canada `newWithdrawal` in `taxable-basis-key.js`, each named after its first unit). | Gone: `taxFor` is in `src/us/core/tax/federal-tax.js` and `newWithdrawal` in `src/canada/core/withdrawals/draws.js` (core regroup Task 3; modules are named by content).
- T13 (owner ruling) | `estimate-checks.js`, `estimates-and-warnings.js` | Near-twin names with different contents. | Merged into `src/shared/core/inputs/estimates.js` by the core regroup.
