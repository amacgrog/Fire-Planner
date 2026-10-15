# Stage 4 UI Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task:
> one implementer subagent at a time, then a spec reviewer subagent and a code-quality reviewer subagent after each task.
> One task, one report, then stop for review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every declaration and side-effect statement still in `src/<country>/main.js` moves into a topic module; the last
`@@shared` regions disappear with `scripts/sync-shared.js`; `main.js` becomes the entry point (wiring calls, the pinned start-up
statements, the boot sequence, MCP registration, test-hook installers). Owner goal: the UI is easy to update afterwards. No
behavior change.

**Architecture:** The stage 2/3 extraction tool learns to move statements: each run of statements bound for one module becomes
an exported wiring function there, called from `main.js` at the run's position, so start-up order is kept by construction. A
frozen topics file names every statement's module and every wiring function. UI-only import cycles are allowed under a
load-time guard. A new comparison mode proves the built planners run the same statements in the same order. A regroup tool
then renames, merges and splits modules by topic, and the marker system is deleted.

**Tech Stack:** Node 22 (CI) / 24 (local), esbuild 0.28, espree + eslint-scope (analysis only), Playwright (existing tests).

**Spec:** `docs/superpowers/specs/2026-10-15-stage4-ui-design.md` (cited below as "design §N"). Parent design:
`docs/superpowers/specs/2026-10-10-modular-build-design.md`, sections 3, 6, 12-14.

**Not rehearsed.** Unlike the stage 3 plan, this plan was written without running the stage first (the plan author worked
under a docs-only scope; owner decision, 2026-10-15). Consequences:
- Tool tasks (2-9) give the interfaces, the behavior (with design citations) and the fixture cases the tests must contain,
  as concrete inputs and expected results, not finished code. Write each test first, see it fail, then implement.
- Task 10 is the rehearsal: it runs the whole extraction in a scratch worktree and commits the topics file, the manifest, the
  regroup map and `scripts/extractions/stage4-expected.json` (every number the batch tasks check). Batch tasks compare
  against that file, not against numbers printed here. Numbers below that are known today (measured on `9405d96`) are given.
- Two owner checkpoints: after Task 10 (the topics file and regroup map) and after Task 13 step 1 (the final regroup map).

## Global Constraints

- Output is a classic IIFE `<script>`, not `type="module"`. `dist/` is gitignored; edit `src/`, `shared/` and `scripts/`, never
  `dist/`.
- No behavior change: `tests/snapshots/*.json` stay byte-identical. `npm run snapshot:update` is not used anywhere in this plan.
- `src/**/core/` never references `document`, `window`, `localStorage`, `navigator`, calls a DOM method, or imports from a `ui/`
  directory (`tests/core_purity.js`). Wiring functions live only in `ui/` modules (design §5.1).
- US and Canada never import from each other. Shared code reaches country code only through the seam facades
  `#country/core/seam-<name>` and (new) `#country/ui/seam-<name>` (design §5.2).
- `src/` stays plain ESM; no esbuild-only features. No bare side-effect imports (`import './x.js';`) anywhere in `src/`.
- Code moves verbatim. The tools may only: add or remove `export`, write import lines, wrap a run of statements in
  `export function <name>() { ... }` with two more spaces of indentation, replace a run with `<name>();`, and split
  `let x = <init>;` into `let x;` plus `x = <init>;` (design §5.1). No other text change, ever. Comment-only edits are allowed
  only where a task says so.
- Start-up order is sacred: every batch passes `node scripts/compare-builds.js --base <prev> --ordered`.
- `node scripts/sync-shared.js --check` passes at the end of every task until Task 14 deletes it.
- The build runs on Windows and Linux. Every tool normalizes CRLF to LF on read. After any tool writes `src/` files, nothing
  converts line endings by hand: git normalizes on commit (`core.autocrlf=true`).
- Never `--no-verify`. Text files end with a newline. Stop after 3 failed attempts at one step and report.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (second `-m`).
  Commit only the paths the task names. Never push, never open a PR, never merge: the owner decides.
- Shell: Git Bash. If `node` is not on the Git Bash PATH, start with `export PATH="$PATH:/c/Program Files/nodejs"`. Create files
  containing backslashes or regexes with the Write tool, never with heredocs or `sed`. Scratch scripts and logs go in the
  session scratchpad directory, never in the repo. Never `sed -i` a tracked file.
- **`$SCRATCH` below stands for the literal scratchpad path.** Shell variables do not persist between tool calls, so write the
  path out in every command, or start the command with `SCRATCH=<path>;`. Values a later step needs (`START`, the ordered
  counts) are written to `<scratchpad>/s4-notes.md` and read back from it, never kept in a variable.
- Editing `package.json`'s `test` or `analyze` script: use a JSON-aware edit (a short node script that reads, edits the string
  and writes with two-space indentation and a trailing newline), then run
  `node -e "const t=require('./package.json').scripts.test; console.log(/&&node|&& &&/.test(t) ? 'BAD SPACING' : 'ok')"`; it must
  print `ok`.
- Long runs (`npm test` about 5 minutes, the ad-hoc Playwright sweep about 10) run in the background with output to a log in
  `$SCRATCH`; the last line of each log is `exit <code>`.

## Review Focus

Failure modes most likely first; each has a pin.

1. **A start-up order change.** A listener or initialization that runs earlier or later than today. Pinned by the ordered
   comparison (Task 4, every batch), `tests/snapshot_ui.js` (each control's wiring, a clean load with `pageerror` collected) and
   the ad-hoc sweep (Task 11 step 5).
2. **A declaration whose initializer now runs at module load and reads something a statement sets.** `hasPersonalizedData` is
   the known case (design §2). Pinned by the split rule (Task 6), the `// load-time:` marker check (Tasks 3, 6) and the ordered
   comparison's split handling (Task 4).
3. **A UI cycle that reads across itself while loading.** esbuild turns it into a silent `undefined`; native ESM into a TDZ
   error. Pinned by `tests/ui_cycles.js` (Task 3) and the applier's cycle check (Task 8).
4. **Shared text diverging between planners.** A shared module or region must read identically in both. Pinned by the applier's
   identity checks, the union run boundaries (Task 5), and `sync-shared.js --check` until Task 14.
5. **A wiring call or pinned statement misidentified.** `renderScenarioList();` looks like a wiring call. Pinned by recognising
   them only from the manifest's wiring record and the topics file's `main` entries (Tasks 5, 8), never by shape.
6. **Comment fragments left behind.** Pinned by the marker moves (Task 1) and the applier's comment placement (Task 7).

## File Structure

Created:
- `scripts/lib/load-time.js`: inert-initializer test, `// load-time:` marker detection, the module load-time guard (Task 3).
- `scripts/lib/module-graph.js`: the `src/` import graph per country condition, facades as pass-through edges, cycles (Task 3).
- `scripts/module-map.js`: writes and checks `docs/superpowers/inventory/module-map.md` (Task 9).
- `scripts/regroup-modules.js` + `scripts/lib/regroup.js`: rename, merge and move modules (Task 12).
- `tests/ui_cycles.js`, `tests/no_bare_imports.js`, `tests/module_names.js` (Task 3), `tests/compare_builds.js` (Task 4),
  `tests/regroup_modules.js` (Task 12), `tests/no_markers.js` (Task 14).
- `scripts/extractions/stage4-topics.json`, `stage4.json`, `stage4-regroup.json`, `stage4-expected.json`, `stage4-reserved.json`
  (Task 10).
- New modules under `src/shared/ui/`, `src/us/ui/`, `src/canada/ui/`, and facades `src/<country>/ui/seam-<name>.js` (Task 11).
- `docs/superpowers/inventory/module-map.md` (Task 9), `stage4-region-map.md` (Task 16).

Modified: `scripts/analyze-closure.js`, `scripts/lib/extraction-plan.js`, `scripts/plan-extraction.js`,
`scripts/lib/extract-units.js`, `scripts/extract-units.js`, `scripts/compare-builds.js`, `scripts/sync-shared.js` (Task 1; deleted
in Task 14), `tests/closure_analyzer.js`, `tests/extraction_plan.js`, `tests/extract_units.js`, `tests/core_purity.js` (header
comment), `tests/state_modules.js` (paths, Task 13), `package.json`, `src/us/main.js`, `src/canada/main.js`, `shared/*.js`
(shrinking, then deleted), existing `src/**/ui/` modules (Task 13), `CLAUDE.md`, `README.md`, the inventory, the parent design
(one line, owner permitting).

---

### Task 0: Preflight

**Files:** none changed.

- [ ] **Step 1: Branch and clean tree.** Run `git branch --show-current && git status --short && git log --oneline -1`.
  Expected: the implementation branch the owner named (cut from the commit holding this plan), an empty `git status`. Run
  `echo "START=$(git rev-parse HEAD)" >> $SCRATCH/s4-notes.md`; later steps read `START` from that file (if the session changed and the file is
  gone, `START` is the commit before Task 1's: `git log --oneline` shows it).
- [ ] **Step 2: Green baseline.** Run in the background: `npm test > $SCRATCH/s4-baseline.log 2>&1; echo "exit $?" >> $SCRATCH/s4-baseline.log`.
  Expected: last line `exit 0`.
- [ ] **Step 3: The pre-stage tree.** Run:
  ```bash
  git worktree add --detach ../fp-stage4-base 9405d96
  (cd ../fp-stage4-base && npm ci && npm run build)
  npm run build && node scripts/compare-builds.js --base ../fp-stage4-base
  ```
  Expected: `Planner_US.html: base 816 statements, head 816; missing from head 0, new in head 0` and the Canada line with 538.
  `../fp-stage4-base` stays until Task 15.
- [ ] **Step 4: The previous-commit tree** (rebuilt before every batch): `git worktree add --detach ../fp-stage4-prev <START from s4-notes.md> && (cd ../fp-stage4-prev && npm ci)`.
- [ ] **Step 5: Known figures.** Run `node tests/closure_names.js && node tests/core_purity.js && node scripts/sync-shared.js --check && wc -l src/us/main.js src/canada/main.js | head -2`.
  Expected: `closure_names OK (185 files)`, `core_purity OK (152 core files)`, `shared regions OK (21 regions x 2 planners)`,
  4,840 and 4,092 lines (the last line of each file may or may not end with a newline; 4,839 / 4,091 is also correct).

---

### Task 1: Comment-only source edits and the marker check

**Files:**
- Modify: `src/us/main.js`, `src/canada/main.js`, `shared/*.js` (by `--pull`), `src/shared/ui/estimates-and-warnings.js`,
  `src/shared/ui/first-run-ui.js`, `src/shared/ui/storage.js`, `src/shared/ui/topbar-and-undo.js`,
  `src/shared/ui/wizard-overlay.js`, `scripts/sync-shared.js`

Design §5.4, §6.4, §7.1. Comments only: the build comparison must show no difference.

- [ ] **Step 1: The marker check (test first).** In `scripts/sync-shared.js --check`, add: fail with
  `marker between comments: <file>:<line> (<region>)` when a `@@shared` begin or end line has a comment line directly
  above it **and** directly below it, where a **comment line** is a `//` line that is not itself a `@@shared` marker (an end
  marker directly above a begin marker, as at US 281 and 328, is not a comment line). Run `node scripts/sync-shared.js --check`. Expected: it now fails, listing exactly the
  eight lines US 233, 980, 3709, 4580 and Canada 113, 815, 3258, 4067 (if it lists more or fewer, stop and report).
- [ ] **Step 2: Move the four begin markers by hand, in both planners.** For each listed line, cut the marker line and paste it
  directly above the first line of the comment block it splits (the comment line directly above it). Make the identical edit
  in `src/us/main.js` and `src/canada/main.js`. Do not use `--pull` before both files are edited.
- [ ] **Step 3: Move region 20's end marker, in both planners.** `// @@shared:20-renderTable end` (US line 2191, Canada 1785) moves
  to directly below the last line of `function initChartHover() { ... }` (it starts at US 2192, Canada 1786; its text is
  identical in both planners: check with `diff <(sed -n '/^  function initChartHover/,/^  }$/p' src/us/main.js) <(sed -n '/^  function initChartHover/,/^  }$/p' src/canada/main.js)`, no output).
- [ ] **Step 4: The `// load-time:` comments.** Add one comment line directly above each of these declarations (if a comment
  block already sits directly above, the new line becomes the block's **first** line):
  - in `src/us/main.js` and `src/canada/main.js` (inside shared regions `ids`, 02, 04): `const ids = ...`:
    `// load-time: filters FIELDS, an imported constant; reads nothing a statement writes.`; `const MCP_FIELDS = ...`: the same
    text; `let theme = ...`: `// load-time: reads window.matchMedia; reads nothing a statement writes.`;
    `let previousUnusualIds = new Set()` (or the declaration that holds it): `// load-time: an empty Set; reads nothing.`
  - in the six `ui/` initializers of design §2: `estimates-and-warnings.js:11` (`// load-time: creates the bubble element;
    reads nothing a statement writes.`), `first-run-ui.js:19` (`// load-time: reads document.modelContext; ...`), `storage.js`
    (above the existing block that ends at line 13: `// load-time: probes localStorage once; reads nothing a statement
    writes.`), `topbar-and-undo.js:1`, `wizard-overlay.js:1` and `:4` (`// load-time: looks up a static element; reads nothing
    a statement writes.`).
  Make the `main.js` edits in `src/us/main.js` and `src/canada/main.js` identically by hand.
- [ ] **Step 5: Sync and check.** Run `npm run sync -- --pull src/us/main.js && npm run check:shared`. Expected:
  `shared regions OK (21 regions x 2 planners)` and no `marker between comments` line. Then `git diff --stat`: only the files
  listed above, and `git diff src/canada/main.js | grep '^[-+] ' | grep -v '^[-+] *//'` prints nothing (comment lines only).
- [ ] **Step 6: Build comparison.** Run `npm run build && node scripts/compare-builds.js --base ../fp-stage4-base`. Expected:
  816 / 538, `missing from head 0, new in head 0`.
- [ ] **Step 7: Full suite** (background). Expected `exit 0`; `git status --short tests/snapshots` empty.
- [ ] **Step 8: Commit.**
  ```bash
  git add src shared scripts/sync-shared.js
  git commit -m "Stage 4: comment-only edits (load-time comments, four begin markers above their comment blocks, region 20 ends below initChartHover) and the marker-between-comments check" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  ```

---

### Task 2: Stable statement labels

**Files:** Modify `scripts/analyze-closure.js`, `tests/closure_analyzer.js`, `tests/extraction_plan.js`, `tests/extract_units.js`.

Design §5.1 ("Statement labels become stable").

**Interfaces:**
- `analyze(code)` units of kind `statement` get `label = 'stmt:' + sha1(normalized).slice(0, 8)` where `normalized` is the
  statement's source text with every whitespace run replaced by one space and trimmed. Units keep `startLine`/`endLine`.
- Duplicates: if two statements have the same normalized text, the first in its scope keeps the bare label and later ones get
  `#2`, `#3`; the scope is the `@@shared` region the statement sits in, or "outside regions" for the rest. If two units of one
  file still end up with the same label (the same text in two different regions), `analyze` throws `duplicate statement label:
  <label> at lines <a> and <b>` (no such pair exists today; every label must be unique within a file, because the tools key
  their maps by label).
- Two different normalized texts with the same 8-hex prefix: `analyze` throws `statement label collision: <label> at lines
  <a> and <b>`.
- `render()` (the inventory): the mutable-bindings table's "written by" column shows each statement writer as `stmt:<hash> (line
  <n>)`, so statements can still be found by line (the extraction-order table already has a `lines` column).

**Fixture cases (`tests/closure_analyzer.js`; write them first):**
1. A planner with two different statements: labels match `/^stmt:[0-9a-f]{8}$/`; changing whitespace inside a statement
   (an extra space, a CRLF) does not change its label; adding a unit above it does not change it.
2. The same statement text twice in one region: labels `stmt:X` and `stmt:X#2`. The same text once in region `a` and once in
   region `b`: `analyze` throws `duplicate statement label`. Twice outside regions: `stmt:X`, `stmt:X#2`.
3. A collision: monkey-patch the hash function through an exported test hook `__setLabelHash(fn)` (restore after) that returns
   `'deadbeef'` for every text; two different statements: `analyze` throws `statement label collision`.

Update the three existing places that use `statement@<line>` labels to the new form: `tests/extract_units.js:179` (compute
the label with `statementLabel(text)`, exported from `analyze-closure.js`), `tests/extraction_plan.js:90` (the assertion must
check that no planned label starts with `stmt:`; checking `statement@` would now pass vacuously) and
`tests/extraction_plan.js:151` (map writers starting with `stmt:` to `'statement'`).

- [ ] **Step 1:** Write the fixture cases; run `node tests/closure_analyzer.js`. Expected: fails on the label format.
- [ ] **Step 2:** Implement; run `node tests/closure_analyzer.js && node tests/extraction_plan.js && node tests/extract_units.js`. Expected: all three print their `OK` line.
- [ ] **Step 3:** Run `npm run analyze && git diff --stat docs/superpowers/inventory`. Expected: both inventory files change (labels, the new column); `US: 311 units` / `Canada: 231 units` unchanged.
- [ ] **Step 4:** Full suite (background), `exit 0`. Commit:
  ```bash
  git add scripts/analyze-closure.js tests/closure_analyzer.js tests/extraction_plan.js tests/extract_units.js docs/superpowers/inventory
  git commit -m "Analyzer: stable statement labels (stmt:<hash>), scoped duplicate suffixes, collision check" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  ```

---

### Task 3: Load-time guard, module graph and the new structural tests

**Files:**
- Create: `scripts/lib/load-time.js`, `scripts/lib/module-graph.js`, `tests/ui_cycles.js`, `tests/no_bare_imports.js`,
  `tests/module_names.js`
- Modify: `tests/core_purity.js` (header comment only), `package.json` (`test` script)

Design §5.2, §5.3, §6.1, §6.4.

**Interfaces:**
- `scripts/lib/load-time.js`:
  - `isInert(node)`: true for `Literal`, `TemplateLiteral` without expressions, `FunctionExpression`,
    `ArrowFunctionExpression`, `ClassExpression` (with no static field or static block: those count as load time),
    `UnaryExpression` of an inert argument, `ObjectExpression` whose every property is a plain `Property` with an inert value
    (no spread, no computed key), `ArrayExpression` of inert elements (no holes treated as inert; spread is not inert), and a
    missing initializer. Everything else (an `Identifier`, a call, `new`, a member access) is not inert.
  - `loadTimeMarker(lines, declStartLine)`: the contiguous `//` comment block directly above line `declStartLine` (1-based)
    starts with `// load-time:` (after indentation). Returns `{ marked: boolean, reason: string }`.
  - `checkLoadTime(code, { cyclePartners })` for one module's text: returns problems `[{ line, name, why }]` for each top-level
    declaration whose initializer is neither inert nor marked, each top-level statement that is not a declaration, import or
    export declaration (`why: 'top-level statement'`), each `static` field initializer or `static` block of a top-level
    `ClassDeclaration` or class expression that is not inert (`why: 'class static'`), and, when `cyclePartners` (a Set of local import names bound to modules
    of the same cycle) is given, each marked initializer that references one of those names anywhere in its initializer
    (`why: 'reads the cycle'`).
- `scripts/lib/module-graph.js`:
  - `buildGraph(root, country)`: every `.js` file under `src/` (excluding `src/<other country>/`), its import edges resolved:
    relative paths; `#country/<sub>` to `src/<country>/<sub>.js`; a module consisting only of `export { ... } from '...'` lines
    (a facade) is replaced by edges straight to its targets. Returns `{ files, edges: Map<file, Set<file>>, importsOf: Map<file, Map<local, file>> }`; `importsOf` also
    resolves through facades (a name imported from `#country/ui/seam-render` maps to the module holding `render`), so a cycle
    partner reached through a facade is seen as one.
  - `cycles(graph)`: strongly connected components with more than one file (or a self-import).
- `tests/ui_cycles.js`: for `us` and `canada`, every cycle must contain only files under a `ui/` directory (a cycle touching
  `core/` or `main.js` fails), and every file in a cycle must pass `checkLoadTime` with `cyclePartners` = its imports from the
  cycle. Today there are no cycles: it prints `ui_cycles OK (0 cycles)`. Every `ui/` module, in a cycle or not, must also pass
  `checkLoadTime` without `cyclePartners` (design §6.4: the marker covers every `ui/` module).
- `tests/no_bare_imports.js`: no line matching `^\s*import\s+['"]` in any `src/**/*.js`. Prints `no_bare_imports OK (<n> files)`.
- `tests/module_names.js`: no `src/**/*.js` file name matching `-\d+\.js$` except those in the `ALLOWED` array at its top,
  which starts with the seven `src/shared/core/*-2.js` files (design §2); each `-N` module a batch creates is added by that
  batch (Task 11 step 2), never earlier. An entry in `ALLOWED` that no longer exists also fails (`stale allow-list entry`), so
  entries arrive with their file and leave with it in the tidy batch. Prints `module_names OK (<n> allowed)`.

**Fixture cases** (in each test file, against throwaway trees under `os.tmpdir()` like `tests/extraction_plan.js` does):
1. `isInert`: `1`, `'a'`, `` `x` ``, `() => {}`, `function () {}`, `{ a: 1, b: [2, 3] }`, `-1` are inert; `x`,
   `` `${x}` ``, `f()`, `new Set()`, `a.b`, `{ ...a }`, `{ [k]: 1 }`, `class { static x = f(); }` are not.
2. `loadTimeMarker`: a block of three comment lines starting `// load-time: reason` directly above: marked; the same block with
   a blank line before the declaration: not marked; `// other` then `// load-time: x`: not marked.
3. `checkLoadTime`: a module `let a = f();` fails; with the marker it passes; a module with `document.body.append(x);` at top
   level fails (`top-level statement`); a marked `const b = partnerFn();` with `cyclePartners = {partnerFn}` fails
   (`reads the cycle`); `class C { static x = f(); }` fails (`class static`); `class D { m() { f(); } }` passes.
4. `buildGraph`/`cycles`: `src/shared/ui/a.js` imports `#country/ui/seam-r` (a facade re-exporting `./r.js` in
   `src/us/ui/`), and `src/us/ui/r.js` imports `../../shared/ui/a.js`: one cycle `{a, r}` for `us` (the facade is a pass-through,
   not a member). A cycle through a `core/` file is reported with that file.
5. `tests/ui_cycles.js` on the real tree: `ui_cycles OK (0 cycles)`.

- [ ] **Step 1:** Write the libraries' fixture tests (as `tests/ui_cycles.js` sections that run fixtures first, then the real
  tree) and the two other tests; run them. Expected: fail (modules missing).
- [ ] **Step 2:** Implement the two libraries and the three tests. Run
  `node tests/ui_cycles.js && node tests/no_bare_imports.js && node tests/module_names.js`. Expected: `ui_cycles OK (0 cycles)`,
  `no_bare_imports OK (185 files)` (or the current count), `module_names OK (7 allowed)`. Every `ui/` module passes
  `checkLoadTime` because Task 1 marked the six initializers; if one fails, stop and report it (it is a missed initializer).
- [ ] **Step 3:** Update the header comment of `tests/core_purity.js`: replace the bullet saying facades "live in core/ and
  re-export core names only" with: `a country's seam facades live in core/ (core/seam-<name>.js, re-exporting core names) or,
  for a name whose module is ui in either country, in ui/ (ui/seam-<name>.js; stage 4 design section 5.2).` No code change.
- [ ] **Step 4:** Add `node tests/ui_cycles.js && node tests/no_bare_imports.js && node tests/module_names.js` to the `test`
  script directly after `node tests/core_import.js` (JSON-aware edit; check prints `ok`).
- [ ] **Step 5:** Full suite (background), `exit 0`. Commit:
  ```bash
  git add scripts/lib/load-time.js scripts/lib/module-graph.js tests/ui_cycles.js tests/no_bare_imports.js tests/module_names.js tests/core_purity.js package.json
  git commit -m "Guards: load-time guard and module graph libraries, ui_cycles, no_bare_imports and module_names tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  ```

---

### Task 4: The ordered build comparison

**Files:** Modify `scripts/compare-builds.js`; create `tests/compare_builds.js`; modify `package.json` (`test`).

Design §6.2. Keep today's behavior when `--ordered` is absent, except that steps 2-4 below always run (a head with wiring
functions must still compare equal as a multiset).

**Interfaces:** `node scripts/compare-builds.js --base DIR [--head DIR] [--ordered]`. Export the core as
`compareScripts(baseCode, headCode, { ordered })` returning `{ base, head, missing, added, orderedOk, firstOrderDiff }` so
`tests/compare_builds.js` can call it on small scripts without HTML; the CLI part runs only under
`if (require.main === module)`, so requiring the file has no side effect. Output per planner: today's line, plus with `--ordered`
`ordered: <n> statements identical` or `ordered: first difference at #<i>: base <text> | head <text>`.

**Algorithm** (per side): (1) parse, flatten IIFEs, list top-level statements; (2) head only: a top-level
`FunctionDeclaration` whose name does not occur as a declared name anywhere in the base script, and that the head calls
exactly once as an `ExpressionStatement` `<name>()` with no arguments at top level, and references nowhere else, is a wiring
function: replace the call with its body statements and drop the declaration; a new function that does not satisfy this is
left as is (so it shows as `new in head`); (3) head only: a top-level `let`/`var` declarator `x` without initializer, plus
exactly one top-level `ExpressionStatement` `x = <expr>`, where the base declares `x` with initializer text equal to `<expr>`,
become one statement `var x = <expr>` placed at the assignment's position; (4) flatten again, split multi-declarator
declarations, normalize as today; (5) multiset comparison as today; (6) with `--ordered`: the subsequence of statements that
are not declarations (`VariableDeclaration`, `FunctionDeclaration`, `ClassDeclaration`), plus, on both sides, the
declarations of the names step 3 matched (in the base at their own position, in the head at the assignment's), must be equal
element by element.

**Fixture cases** (`tests/compare_builds.js`, plain strings, no build):
1. Identical scripts: equal, ordered ok.
2. Base `a(); b();`; head `function wireX() { a(); b(); } wireX();`: equal, ordered ok.
3. Base `a(); b();`; head `b(); a();`: multiset equal, ordered fails at #0.
4. Base `a(); a();`; head `function wireX() { a(); } wireX(); wireX();` (called twice): not expanded, so `new in head` reports
   `function wireX` and `wireX()` (the lists hold distinct texts, so the call appears once), and `missing from head` reports
   `a()`. The test asserts exactly these entries; do not change how `compare-builds.js` reports to make it pass.
5. Base `let x = y; a();`; head `let x; x = y; a();`: equal, ordered ok. Head `let x; a(); x = y;`: ordered fails (the
   declaration moved after `a()`).
6. Base `(function f() { a(); })();` inside top level; head `function wireX() { (function f() { a(); })(); } wireX();`:
   equal (re-flattened).
7. A head function whose name already exists in the base (`function render() {...}` moved): not treated as wiring.

- [ ] **Step 1:** Write the fixtures; run `node tests/compare_builds.js`. Expected: fail.
- [ ] **Step 2:** Implement. Run `node tests/compare_builds.js` (`compare_builds OK`) and
  `npm run build && node scripts/compare-builds.js --base ../fp-stage4-base --ordered`. Expected: 816 / 538 equal, and
  `ordered: <n> statements identical` for each planner; record both `<n>` values in `$SCRATCH/s4-notes.md` (`<n>` grows by one in the batch that splits `hasPersonalizedData`; the
  rehearsal records the value per batch).
- [ ] **Step 3:** Add `node tests/compare_builds.js` to the `test` script after `node tests/extract_units.js` (JSON-aware edit).
  Full suite (background), `exit 0`. Commit `scripts/compare-builds.js tests/compare_builds.js package.json` with message
  `compare-builds: wiring-function expansion, split declarations, the ordered mode`.

---

### Task 5: Planner, part 1: the topics file, statements, runs and wiring functions

**Files:** Modify `scripts/lib/extraction-plan.js`, `scripts/plan-extraction.js`, `tests/extraction_plan.js`.

Design §5.1, §5.4.

**Interfaces:**
- `planExtraction(root, { ..., topics })` where `topics` is the parsed `stage4-topics.json`:
  ```json
  {
    "shared": { "modules": { "src/shared/ui/theme.js": { "units": ["theme", "applyTheme", "stmt:1a2b3c4d"],
                                                       "wiring": { "stmt:1a2b3c4d": "wireThemeToggle" } } },
                "main": ["stmt:..."] },
    "us":     { "modules": { "src/us/ui/render.js": { "units": ["render"] } }, "main": ["stmt:..."] },
    "canada": { "modules": { ... }, "main": [ ... ] }
  }
  ```
  `units` lists declarations (by label) and statements (by stable label). `wiring` maps a run's **first** statement label to
  the run's function name. Shared modules are listed under `shared`; country modules under their country.
- With `topics`: a declaration listed in a module goes there (overriding the region/run grouping); an unlisted declaration
  keeps today's grouping. **Every** statement must be listed in exactly one module or in a `main` list; an unlisted statement
  fails: `statement <label> (<country> line <n>) has no topics entry`.
- A statement listed in a module is movable when everything it depends on is movable or imported (the existing fixpoint, now
  including statements). A module's statements move in the module's batch; a statement waits if its module does not move.
- Each module gains `wiring: [{ name, statements: { us: [labels], canada: [labels] } }]`: its runs in `main.js` order. A run is
  a maximal sequence of the module's statements with no statement of another module, and no `main` statement, between them
  (declarations between them do not break a run). For a shared module, the run boundaries are the **union** of both planners'
  boundaries (design §5.1): a split in either planner splits the run in both.
- Refusals (each a thrown error naming the label): a statement listed in a `core/` module; a country statement in a shared
  module; a shared statement in a country module; a statement in two places; a shared declaration listed in a country module, or a country
  declaration listed in a shared module; a `main` statement that assigns a top-level
  binding of `main.js`; a module with more than one run whose runs are not all named in `wiring` (only a module with exactly
  one run may use the default `wire<PascalModuleName>`, for example `src/shared/ui/theme.js` -> `wireTheme`; with several runs,
  every run must be named); a wiring name that equals any top-level
  declaration name in `src/shared/` or that country's `src/<country>/` (tool modules included), or in the base bundle names
  passed as `options.reservedNames`; two modules (or two runs) with the same wiring name; a topics module path that already
  exists on disk (extraction creates new modules only; design §5.4).
- `plan-extraction.js`: new options `--topics=<file>`, `--reserved=<file>` (a JSON array of names; Task 10 writes it from the
  base bundles), and `--draft-topics`, which prints a draft topics file instead of a plan: every statement placed by the
  design §5.1 defaults, computed after grouping **every** declaration as if it were movable (the seam names given, statement
  writers counted as writers), so a default never falls on a unit that is only blocked today (shared statement: the module the draft gives the nearest shared unit before it in its region; country
  statement: the module of the nearest preceding country unit, transitively; `"TODO"` where there is no default, and for any
  default that would land in `core/`). The output manifest gains top-level `topics` only when `--topics` is given (otherwise the key is absent, so
  the regression of step 3 stays byte-identical) (the file path, repo-relative with forward slashes, so the
  manifest is the same on every machine) and keeps `seam`,
  `bindings`, `stats`.

**Fixture cases** (`tests/extraction_plan.js`, built with its existing `fixture()` / `write()` helpers, plus a `topics` option):
1. Two country statements `a();` `b();` listed in `src/us/ui/x.js` (one run): the module has `wiring: [{ name: 'wireX', statements: { us: [la, lb] } }]`.
2. `a();` (to `x.js`), `c();` (to `y.js`), `b();` (to `x.js`): `x.js` has two runs; without `wiring` names the planner throws
   `several runs`; with only `{ la: 'wireA' }` it also throws; with `{ la: 'wireA', lb: 'wireB' }` it returns both.
3. A declaration between two statements of the same module does not split the run.
4. Shared statement `s1;` at the end of region `a` and `s2;` at the start of region `b` (regions `a` and `b` adjacent in Canada),
   both listed in one shared module; in the US a country statement sits between the two regions and is placed in another
   module: the shared module gets two runs in **both** planners' `wiring` (union boundaries). (A statement inside a shared
   region is shared by definition, so the split must come from code between two regions.)
5. An unlisted statement throws `has no topics entry`. A statement in `src/us/core/x.js` throws (`core`). A US statement in
   `src/shared/ui/x.js` throws. A shared statement in `src/us/ui/x.js` throws.
6. A `main` statement `n = 1;` where `let n` is a top-level binding of `main.js` throws (`pinned statement assigns`).
7. A wiring name equal to an existing function name in `src/shared/core/` (fixture file) throws (`wiring name clash`); two runs
   given the same name throw; a topics path that exists throws (`already exists`).
8. `--draft-topics` on a fixture (draft mode is tested on fixtures only in this task: on the real tree it first runs in Task 10,
   after Task 6 lets the planner accept the `render` cycle): a country statement after a country function gets that function's module; one after a
   shared region gets `"TODO"`; one whose default is a `core/` module gets `"TODO"`.
9. The existing stage 2/3 fixtures still pass without `topics` (statements stay, as before).

- [ ] **Step 0: Regression baseline (before any edit).** Run
  `node scripts/plan-extraction.js --seam=taxFor,BUCKET_STEP,runProjection,normalizeState,defaults,ESTIMATE_ALWAYS_IDS,ESTIMATE_GATED_GROUPS,TAXABLE_BASIS_KEY,housingForYear,STANDARD_MODE,BUCKET_MODE > $SCRATCH/plan-before.json`
  and `node -e "const p=require(process.argv[1]);console.log(JSON.stringify(p.stats),p.modules.length)" $SCRATCH/plan-before.json`.
  Expected: `{"us":{"units":311,"candidates":98,"movable":26},"canada":{"units":231,"candidates":93,"movable":25}} 16`.
- [ ] **Step 1:** Write the fixtures; run `node tests/extraction_plan.js`; expected: fail.
- [ ] **Step 2:** Implement; `node tests/extraction_plan.js` prints `extraction_plan OK`.
- [ ] **Step 3:** Regression: rerun step 0's command into `$SCRATCH/plan-after.json` and
  `git diff --no-index $SCRATCH/plan-before.json $SCRATCH/plan-after.json`. Expected: no output (without topics the planner
  behaves exactly as before, byte for byte).
- [ ] **Step 4:** Full suite (background), `exit 0`. Commit `scripts/lib/extraction-plan.js scripts/plan-extraction.js tests/extraction_plan.js`:
  `Planner: topics file, movable statements, runs and wiring functions, draft mode`.

---

### Task 6: Planner, part 2: bindings, the split rule, load-time markers, seam sides, UI cycles

**Files:** Modify `scripts/lib/extraction-plan.js`, `tests/extraction_plan.js`.

Design §5.1 (split rule), §5.2, §5.3, §5.4 (bindings), §6.4.

**Behavior:**
- **Bindings.** A mutable binding whose writers (functions **and statements**) all go to one module moves with them into that
  module (`bindings.<country>.colocated` gains `{ declaredIn, module }` entries with statement writers); writers that span
  modules keep it in `needsDecision` (unchanged behavior). The partner rule (`extraction-plan.js` "a colocated declaration and
  its writer function are partners") generalizes to: the declaration and all its writers are movable only together.
- **Load-time initializers.** Every moving declaration with a non-inert initializer (`isInert` from Task 3): if
  `loadTimeMarker` says marked, it moves as is; otherwise, if it is a `let` with one declarator in a `ui/` module, it is
  **split** (the module's entry records `splits: [{ name, label }]`, where `label` is the stable label the assignment
  statement will have, computed from the text `<name> = <init>;`); the assignment is a writer of the binding and joins the
  declaration's module. **When runs are computed, the assignment counts as a statement standing at the declaration's
  position**, so it joins the run of its module that it falls into or next to (with no statement of another module between),
  and keeps that position inside the run body; only if no such run exists does it form a run of its own; otherwise the planner throws
  `non-inert initializer of <name> needs a load-time comment or a split` (a `const`, several declarators, or a `core/` module).
- **Seam sides.** A seam name's **target** in a country is the module the plan gives that unit (for a name not moved yet, such
  as `render`, the module its topics entry or grouping assigns; for a name an earlier stage moved, its current module). For each
  seam name: if its target is a `ui/` module in either country, its facade path is
  `ui/seam-<name>.js` in both (`seamSides: { name: 'ui' | 'core' }` in the manifest). A unit that uses a seam name whose side is
  `ui` is `ui` in both planners (extend `uiUnit`). `importsCountryCode` accepts the new names.
- **UI cycles.** When a strongly connected set of nodes spans owners and every unit in it is `ui`, the planner keeps the
  per-unit modules (the existing `fine` split) and does **not** throw; it records the cycle in `uiCycles: [[paths]]`. `uiCycles` (top level) and `splits` (per module)
  are left out when empty, like `topics`. A cycle
  with a `core` unit still throws as today. Concretely, in `extraction-plan.js`:
  - **Depth and batch:** the strongly connected components stay the unit of depth: every module of one cycle gets the
    cycle's depth and therefore the same batch (`merged` no longer merges an accepted UI cycle into one module, but its members
    share one depth entry).
  - **Rejoining:** the rejoin loop ("Fewer, larger modules") keeps today's count test (`cyclic(trial).length <=
    cyclic(built).length`) and replaces only `crossOwner(trial)` with "the trial has no cross-owner cycle beyond the accepted
    ones, and no cycle containing a `core` unit" (today `crossOwner(trial)` is true for every trial once one accepted cycle
    exists, so nothing would ever rejoin).
  - **Topics modules:** with a topics file, modules keep their topics paths; topics modules of one owner that form a cycle are
    not merged (today they would be): they are accepted as a UI cycle when all their units are `ui`, otherwise the planner
    throws naming the topics entries. Every topics path is added to the planner's `used` set before any module is named, so
    an auto-named module (a unit without a topics entry) never takes a topics path (the applier would refuse `module path used
    twice`).

**Fixture cases:**
0. Split and runs: `s;` (module M), `let x = y;` (M, split: `y` is written by a statement), `t;` (another module): one run of M,
   `[s, x = y]`, named by `s`'s label; `x = y;` is the run's second statement.
1. `let level = 0;` written by function `up()` and by statement `level = 5;`, both listed in `src/shared/ui/l.js`: the binding
   moves; `bindings.us.needsDecision` is empty. With the statement listed in another module: `needsDecision` lists `level`.
2. `let seen = flag;` (`flag` written by a statement) in a `ui/` module, unmarked: the module records a split for `seen`, and the
   assignment's label equals `statementLabel('seen = flag;')`. The same with a `// load-time: x` comment above: no split.
3. `const k = f();` unmarked in a moving `ui/` module: throws `needs a load-time comment or a split`. The same in a `core/`
   module: throws.
4. Seam name `R` whose US target module is `ui` and Canada target `core`: `seamSides.R === 'ui'`; a shared unit using `R` is
   `ui` in both planners (it lands under `src/shared/ui/`).
5. The design §2 cycle in miniature: country `render` (ui) calls shared `setView` (ui), which calls `render` through the seam,
   and a country table `Q` used by `render` refers to `setView` in a function: no throw, `uiCycles` has one entry, and every
   module of the cycle has the same `batch`. Two topics modules of one country that import each other (all `ui`): both keep
   their paths, one batch.
6. The same cycle with one `core` unit: throws `module cycle across owners`.

- [ ] **Step 0:** Before any edit, rerun Task 5 step 0's command into `$SCRATCH/plan-before6.json` (the scratchpad may be a
  new session's; it must equal Task 5's `plan-before.json` if that file still exists).
- [ ] **Step 1:** Fixtures, see them fail. **Step 2:** Implement; `node tests/extraction_plan.js` OK; rerun the command into `$SCRATCH/plan-after6.json`
  and compare it with `$SCRATCH/plan-before6.json` structurally (a scratch script that prints, per module path, added, removed and
  changed fields, plus added top-level keys). Expected, and nothing else (a comparison keyed by path shows
  a moved module as one removed and one changed):
  - `src/shared/core/scenario-helpers-2.js` (`computeScenarioMetrics`, `computeOverlaySeriesFor`, batch 1) is **removed**:
    with the side rule both units are `ui`, so the planner groups them with the other `ui` units of region `21-writeStorageNow`;
  - `src/shared/ui/scenario-export-2.js` now holds all four units (`computeScenarioMetrics`, `computeOverlaySeriesFor`,
    `renderOverlayChart`, `renderScenarioComparison`) and moves from batch 2 to batch 1 (`depth` 2 -> 1);
  - the module count drops from 16 to 15; the order re-sorts (a re-sort alone is not a difference);
  - a top-level `seamSides` key appears;
  - `bindings` is unchanged: without a topics file, `colocated` entries keep their `{ declaredIn, writer }` shape.
   This is design §5.2's fix: the baseline's US `core/seam-normalizeState.js` facade would re-export a `ui/` module. **Step 3:** Full suite (background), `exit 0`. Commit the two files: `Planner: statement writers, the split
  rule, load-time markers, seam sides, UI cycles`.

---

### Task 7: Applier, part 1: wiring functions, comments, the split

**Files:** Modify `scripts/lib/extract-units.js`, `scripts/extract-units.js`, `tests/extract_units.js`.

Design §5.1, §5.5.

**Behavior:**
- For each module of the batch with `wiring`: cut each statement's chunk (the statement plus its carried comment lines, as
  `loadCountry` computes chunks today) out of `main.js`; write, in the module after its declarations, one
  `export function <name>() {` ... `}` per run whose body is the chunks in order, each line indented two more spaces
  (comment lines included, so each statement's comment stays directly above it; blank lines stay empty, with no trailing
  spaces); insert `<name>();` into `main.js` at the line
  where the run's first statement's chunk started (with that chunk's indentation), and add `<name>` to the module's import line
  in `main.js`.
- **Assertion** (design §5.1): refuse a statement that contains, outside nested functions, `return`, `break`, `continue`,
  `await`, `yield`, a label, `var`, or a statement-level function or class declaration, or contains `this` or `arguments`
  outside nested **non-arrow** functions (an arrow does not bind them, so their meaning would change inside a `function`), or
  contains a string or template literal that spans lines (re-indenting would change its value, and the build comparison
  collapses whitespace, so it could not catch it):
  `statement <label> cannot move into a function body: <what>`.
- **Split:** for each `splits` entry, write the declaration in the module as `let <name>;` (its carried comment block stays
  above it) and put the statement `<name> = <init>;` (indented like the rest of the run's body: the declaration's
  indentation plus two) into the run it belongs to.
- **Shared modules:** the module text is built from the US planner; the applier checks that the Canada chunks and run split
  produce byte-identical text (existing identity check, extended to statements and wiring functions).
- **Manifest record:** the report gains `wiring: [{ name, module }]`; `scripts/extract-units.js` prints `wiring functions: <names>`.
- **Lifted refusal and the unit count** (needed by this task's own fixtures): the refusal of side-effect statements
  (`extract-units.js`, "is a side-effect statement") is lifted for statements that appear in a module's `wiring`; it stays for
  all others (no topics, or `main` entries). The final check of `main.js`'s unit count becomes `before - moved + runs` (each run
  leaves one call statement behind).

**Fixture cases** (`tests/extract_units.js`, fixture trees with a manifest that includes `wiring`):
1. Country statements `// note` / `a();` and `b();` in one run to `src/us/ui/x.js`: the module ends with
   `  export function wireX() {` / `    // note` / `    a();` / `    b();` / `  }` (the module keeps the two-space indentation
   its units had in the IIFE; the body gets two more);
   `main.js` has `  wireX();` where `// note` was, and `import { wireX } from './ui/x.js';`.
2. Two runs of one module interleaved with another module's statement: two functions, two calls at their own positions.
3. A statement with `return` in an arrow inside a listener moves (nested function); a statement `for (...) { break; }` moves
   (the `break` belongs to its own loop); a top-level `if (x) return;` is refused; `x.on('e', () => this.y);` is refused (`this` in an arrow); a statement containing a template literal over two lines is
   refused (`multi-line literal`).
4. A split: `let seen = flag;` becomes `let seen;` in the module and `seen = flag;` inside the run, at the declaration's
   position among the run's statements; the build of the fixture
   bundles; `compareScripts` (Task 4) of the before/after bundles is equal and ordered ok.
5. Shared module from two planners whose statement chunks differ by one character: refused (`differs between the two planners`).

- [ ] **Step 1:** Fixtures fail. **Step 2:** Implement; `node tests/extract_units.js` OK. **Step 3:** Full suite, `exit 0`.
  Commit the three files: `Applier: wiring functions, comment placement, the split, the wiring record`.

---

### Task 8: Applier, part 2: UI facades, UI cycles, emptied regions

**Files:** Modify `scripts/lib/extract-units.js`, `scripts/extract-units.js`, `tests/extract_units.js`.

Design §5.2, §5.3, §5.6.

**Interfaces:** `applyModules(root, modules, { dryRun, seam, seamSides, wiringRecord, pinned })`. The CLI builds them from the
manifest and the topics file it names: `seamSides` from the manifest, `wiringRecord` = every `wiring` name of the manifest's
modules with `batch <= N` (with its module path), `pinned` = the labels in the topics file's `shared.main`, `us.main` and
`canada.main`. (The lifted refusal and the unit count are Task 7's.)

**Behavior:**
- **Facades by side:** for a seam name with side `ui`, write `src/<country>/ui/seam-<name>.js` and import it in shared modules as
  `#country/ui/seam-<name>`; the facade-equality check across countries covers both directories.
- **Cycle check:** the module import cycle check accepts a cycle when every module in it is under a `ui/` directory and each
  module's staged text passes `checkLoadTime(text, { cyclePartners })` (Task 3); otherwise it throws as today
  (`module import cycle: ...`), now with the guard's problem list.
- **Emptied regions:** a region whose remaining lines are only blank lines, comments, wiring calls and pinned statements is
  emptied: the markers and fragment are removed and the remaining lines stay in `main.js`, comments included (no longer
  dropped with a warning). A **wiring call** is a statement `<name>();` whose `<name>` is in the cumulative wiring record (all
  manifest modules of batches up to and including this one) and is imported into `main.js` from a `ui/` module; a **pinned
  statement** is one whose label is in the topics file's `main` lists. Shape alone never counts. Before removing the markers,
  check that the remaining text of the region is identical in both planners.

**Fixture cases:**
1. A shared module using seam name `R` with side `ui`: facades written under `ui/` in both countries; the shared module's import
   reads `#country/ui/seam-R`.
2. Two `ui/` modules importing each other, all initializers inert: accepted. One of them with `const k = f();` unmarked:
   refused with `module import cycle` and the guard problem.
3. A region holding, after the batch, `wireX();` (recorded) and a comment: emptied, the comment kept, the fragment deleted.
4. A region holding `renderList();` (a real statement, not recorded): not emptied.
5. A region holding a pinned statement listed in `main`: emptied; the statement stays in `main.js`.

- [ ] **Step 1:** Fixtures fail. **Step 2:** Implement; `node tests/extract_units.js` OK. **Step 3:** Full suite, `exit 0`.
  Commit: `Applier: UI facades, UI cycles under the load-time guard, regions emptied down to wiring calls`.

---

### Task 9: The module map

**Files:** Create `scripts/module-map.js`; modify `package.json` (`analyze`, `test`); create `docs/superpowers/inventory/module-map.md`.

Design §6.1, §5.8 (purpose comment definition).

**Interfaces:** `node scripts/module-map.js [--check] [--require-purpose]`. Writes `module-map.md`: one table per directory
(`src/shared/core`, `src/shared/ui`, `src/us/core`, ...), one row per module: path, exports (from `export` declarations and
`export { } from`), purpose. The purpose is line 1 of the file when it is a `//` comment not starting with `// load-time:` and
line 2 is blank; otherwise `(no purpose comment)`. Seam facades are listed in one row per directory (`seam-*.js: <names>`).
`--check` exits 1 with `module-map.md is stale; run npm run analyze` when the file differs. `--require-purpose` also fails when
a `ui/` module other than a seam facade (`seam-*.js`) has no purpose comment (switched on in Task 13).

- [ ] **Step 1:** Implement; run `node scripts/module-map.js`; open the file: 163 module rows plus facade rows (or the current
  counts), nearly every purpose `(no purpose comment)`.
- [ ] **Step 2:** `analyze` script becomes `node scripts/analyze-closure.js && node scripts/module-map.js`; add
  `node scripts/module-map.js --check` to `test` after `node scripts/gen-benefit-rules.js --check` (JSON-aware edits).
- [ ] **Step 3:** Full suite, `exit 0`. Commit `scripts/module-map.js package.json docs/superpowers/inventory/module-map.md`:
  `Module map: generated list of every module, checked in npm test`.

---

### Task 10: Rehearsal (scratch worktree), then the committed manifest. OWNER CHECKPOINT.

**Files (committed at the end):** `scripts/extractions/stage4-topics.json`, `stage4.json`, `stage4-regroup.json`,
`stage4-expected.json`, `stage4-reserved.json`.

Design §5.1 (defaults), §5.4, §7 step 2. The rehearsal runs the whole extraction in a scratch worktree to fix every placement
and every expected number. Nothing from the scratch worktree is committed except the files above, copied over.

- [ ] **Step 1: Scratch worktrees.** `git worktree add --detach ../fp-stage4-rehearsal HEAD && (cd ../fp-stage4-rehearsal && npm ci)`
  and `git worktree add --detach ../fp-stage4-rehearsal-prev HEAD && (cd ../fp-stage4-rehearsal-prev && npm ci)`. Record
  `REHEARSAL_START=$(git -C ../fp-stage4-rehearsal rev-parse HEAD)` in `$SCRATCH/s4-notes.md`. Work in `../fp-stage4-rehearsal`
  until step 9; never use the implementation's `../fp-stage4-prev` here. **Restart** (whenever a later step says so): 
  `git -C ../fp-stage4-rehearsal reset --hard <REHEARSAL_START> && git -C ../fp-stage4-rehearsal clean -fd -- src` (the reset
  discards committed batches; the clean removes the new, untracked modules of a batch that failed before its commit; it is
  limited to `src` so the untracked topics file in `scripts/extractions/` stays), delete the `batches` entries of
  `stage4-expected.json` (keep `adhocBaseline`), then go back to step 5.
- [ ] **Step 2: Reserved names.** Write `$SCRATCH/reserved.js` that reads `../fp-stage4-base/dist/Planner_US.html` and
  `Planner_Canada.html`, parses each inline script (as `compare-builds.js` does) and writes the sorted union of every declared
  top-level and nested function and variable name to `scripts/extractions/stage4-reserved.json`.
- [ ] **Step 3: Draft topics.** `node scripts/plan-extraction.js --draft-topics --seam=<the 24 names> > $SCRATCH/draft-topics.json`,
  where the seam list is stage 3's eleven (`taxFor,BUCKET_STEP,runProjection,normalizeState,defaults,ESTIMATE_ALWAYS_IDS,ESTIMATE_GATED_GROUPS,TAXABLE_BASIS_KEY,housingForYear,STANDARD_MODE,BUCKET_MODE`)
  plus the thirteen of design §2 (`render,syncControls,DECISION_QUESTIONS,computeRothOptimizer,FIELDS,DYN,SENSITIVITY_LEVERS,computeSankeyFlow,analyzeShortfallDrivers,renderDecisionCompareTable,buildPrintReport,mcpSchemaFor,mcpAccepts`).
- [ ] **Step 4: Write `scripts/extractions/stage4-topics.json`** from the draft, by topic, following the design:
  - The eight bindings and their modules exactly as design §5.4's table (including the `-N` modules for the undo listener and
    the wizard close listener, and `reviewingFieldId`, `theme`, `setMobileView` in their batch-C modules), the single-writer
    bindings with their writers, `chartTooltipEl` + `clearChartHover` + `initChartHover` in a shared chart-hover module.
  - Line numbers in this step and in the design are `9405d96` lines; Task 1 added comment lines, so locate each statement by
    its text or by the inventory's line column.
  - Every `TODO` resolved as design §5.1 lists: US `@752` (now `stmt:` labels: find them by line in the inventory) to a US
    warnings module; `DYN.children` to each country's dynamic-lists module; the wizard-checkbox and `sensLeverToggles`
    listeners to each country's wizard and sensitivity modules; the first country test-hook statement and the hooks after it to
    `src/<country>/ui/install-test-hooks.js` (function `installTestHooks`); the 7 statements of region `block` to
    `src/shared/ui/install-test-hooks.js` (`installSharedTestHooks`); the MCP block to `src/shared/ui/mcp-tools.js`
    (`registerMcpTools`); `makeTableWrapsFocusable();` and its observer to the shared table-focus module (`wireTableFocus`).
  - `main` lists: US `@96`, `@190`, Canada `@70`, and the boot sequence (US lines 4528-4535, Canada 4015-4022) under
    `shared.main` (it is shared code in region 29).
  - Module names by topic, kebab-case, descriptive (the design §4 list); no name may end in `-N` except the batch-C split-offs
    of modules that already exist (each such name added to `ALLOWED` in `tests/module_names.js`).
  - Every module with several runs names each run.
- [ ] **Step 5: Manifest.** `node scripts/plan-extraction.js --topics=scripts/extractions/stage4-topics.json --reserved=scripts/extractions/stage4-reserved.json --seam=<the 24 names> --max-batch=<k> > scripts/extractions/stage4.json`.
  Choose `<k>` so the batches follow design §7 step 3's groups (A: leaf topics and the five batch-A bindings; B: shared UI not
  depending on `render`/`theme`/`setMobileView`; C: the cycle and what depends on it; D: country listeners, MCP, test hooks);
  if the depth order cannot produce that grouping, use the planner's batches as they come and record the mapping. Check:
  `bindings.<country>.needsDecision` is empty in both countries; every statement has a module or `main`; and the units the
  manifest does not move are exactly the statements of the topics file's `main` lists (a scratch script: all unit labels of
  each `main.js` minus the manifest's units minus the `main` labels must be empty, and no `main` label may be in a module).
- [ ] **Step 5b: Ad-hoc baseline.** In `../fp-stage4-base` run every `test_*.js` (Task 11 step 5's loop) and record each file's
  exit code in `stage4-expected.json` under `adhocBaseline` (step 6 compares against it).
- [ ] **Step 6: Apply every batch in the scratch tree.** For each batch `N` in order: point the rehearsal's previous-commit
  tree at the scratch tree's `HEAD` (`git -C ../fp-stage4-rehearsal-prev checkout --detach $(git -C ../fp-stage4-rehearsal rev-parse HEAD) && (cd ../fp-stage4-rehearsal-prev && npm run build)`),
  run Task 11's steps 2-6 with `../fp-stage4-rehearsal-prev` as the base (its `git status` checks accept the untracked
  `?? scripts/extractions/` files the rehearsal keeps), commit the scratch tree, and record in
  `stage4-expected.json` under `batches[N]`: the `extract-units.js` output lines (modules, units moved, regions removed, seam
  names, wiring functions), `closure_names` and `core_purity` counts, `ui_cycles` cycle count and each cycle's member paths (`cycles`; which modules form the `render` cycle), `main.js` line counts, the
  compare-builds lines (both modes, against the previous commit and against `../fp-stage4-base`), and `newDashModules`: every `-N` module path the batch creates (Task 11 step 2 adds them
  to `ALLOWED`). After the last batch, run Task 11's end-state check. If a batch or the end-state check fails, fix the topics
  file (never the tools without going back to their task) and restart.
- [ ] **Step 7: Ad-hoc after.** Run the same loop in the scratch tree after the last batch and record under `adhocAfter`. Any script that passes on the base and fails after is a defect: fix the topics file and restart.
- [ ] **Step 8: Draft regroup map** (`scripts/extractions/stage4-regroup.json`, the format of Task 12) for the scratch tree's
  final layout, following design §5.8 and this list:
  - renames of the seven `-2` core modules: `bond-ladder-2.js` -> `projected-expense.js`; `estimates-and-warnings-2.js` ->
    `estimate-checks.js`; `lists-and-children-2.js` -> `list-normalization.js`; `monte-carlo-paths-2.js` -> `simulate.js`;
    first `simulate-at-real-cagr.js` -> `cagr-colors.js`, then `simulate-at-real-cagr-2.js` -> `simulate-at-real-cagr.js`;
    `sweep-excess-cash-2.js` -> `bond-ladder-rotation.js`; `year-factors-2.js` -> `tax-index-factor.js` (all under
    `src/shared/core/`);
  - `src/us/ui/clamp-profit-sharing.js` -> `src/us/ui/fields.js`;
  - moves out of mixed modules: `mc` -> `src/shared/ui/mcp-tools.js`, `makeTableWrapsFocusable` -> the table-focus module
    (then `first-run-ui.js` is empty and deleted); `undoToastBtnEl` -> the undo module, `syncTopbarHeight` -> the layout
    module (then `topbar-and-undo.js` deleted); `infoBubble` -> `info-bubble.js`, `markUnusualFields` -> the warnings module
    (then `src/shared/ui/estimates-and-warnings.js` deleted);
  - merges: every `-N` module of the batches into its topic module; `wizard-overlay.js` into the wizard module; the three
    `update-chart-*-buttons.js` modules of each country into that country's chart-controls module; and any other `ui/` module
    whose name does not say what it holds (list each with one line of reason).
  Task 12's tool does not exist yet: Task 13 step 1 validates this map.
- [ ] **Step 9: Copy and commit.** Copy the five files under `scripts/extractions/` into the implementation tree (the rehearsal's
  `tests/module_names.js` edits are not copied: Task 11 makes them batch by batch). In the implementation tree, run `node scripts/plan-extraction.js` with step 5's arguments and check
  the output equals the copied `stage4.json` byte for byte (`git diff --no-index`). Commit:
  `Stage 4 rehearsal: topics file, manifest, reserved names, regroup map draft, expected numbers`.
- [ ] **Step 10: STOP for the owner.** Report: the topics file's module list (path, units count, wiring functions), every `TODO`
  decision, the batch mapping, the regroup map, `adhocBaseline` vs `adhocAfter`. Wait for approval before Task 11. Then remove both scratch
  worktrees: `git worktree remove --force ../fp-stage4-rehearsal && git worktree remove --force ../fp-stage4-rehearsal-prev`.

---

### Task 11: Extraction batches (repeat per batch)

**Files:** new modules and facades under `src/**/ui/` (and `core/` only for facades of core seam names), `src/us/main.js`,
`src/canada/main.js`, `shared/*.js` (shrinking or deleted), `tests/module_names.js` only if the rehearsal said so.

For each batch `N` listed in `scripts/extractions/stage4-expected.json`, in order, run steps 1-7. Every expected value comes from
`batches[N]` of that file. One batch = one commit = one report.

- [ ] **Step 1: Previous-commit tree.** `git -C ../fp-stage4-prev checkout --detach $(git rev-parse HEAD) && (cd ../fp-stage4-prev && npm run build)`.
- [ ] **Step 2: Apply.**
  ```bash
  node scripts/extract-units.js --manifest scripts/extractions/stage4.json --batch N --dry-run
  node scripts/extract-units.js --manifest scripts/extractions/stage4.json --batch N
  ```
  Expected: both print the recorded lines (modules, units moved, regions removed, seam names, wiring functions), no `warning:`.
  On `extraction failed, nothing was written: ...`: stop and report; do not edit the manifest. Then add every path in
  `batches[N].newDashModules` to `ALLOWED` in `tests/module_names.js`.
- [ ] **Step 3: Guards.**
  `node scripts/sync-shared.js --check && npm run build && node tests/closure_names.js && node tests/core_purity.js && node tests/core_import.js && node tests/country_contract.js && node tests/ui_cycles.js && node tests/no_bare_imports.js && node tests/module_names.js && wc -l src/us/main.js src/canada/main.js | head -2 && npm run analyze`.
  Expected: the recorded counts. (`npm run analyze` regenerates the inventory and the module map, which the full suite checks.)
- [ ] **Step 4: Both comparisons, against the previous commit and against `9405d96`.**
  `node scripts/compare-builds.js --base ../fp-stage4-prev --ordered` and
  `node scripts/compare-builds.js --base ../fp-stage4-base --ordered`. Expected for each: for both planners `missing from head 0,
  new in head 0` and `ordered: <n> statements identical` with the recorded `<n>`. The second comparison expands every wiring
  function made so far, so a start-up order change shows in the batch that causes it.
- [ ] **Step 5: Ad-hoc sweep** (background):
  `for f in test_*.js; do node "$f" > "$SCRATCH/adhoc-$f.log" 2>&1; echo "$f $?"; done > $SCRATCH/adhoc-N.txt; echo "exit 0" >> $SCRATCH/adhoc-N.txt`.
  Expected: every script that passes in `adhocBaseline` passes (exit 0); report any other difference.
- [ ] **Step 6: Full suite** (background). Expected `exit 0`; `git status --short tests/snapshots` prints nothing.
- [ ] **Step 7: Commit.**
  ```bash
  git add -A src shared docs/superpowers/inventory tests/module_names.js
  git status --short
  git commit -m "Stage 4 batch N: <M> modules (<U> US and <C> Canada units, <W> wiring functions) out of main.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  ```
  `git status` before the commit lists only `src/`, `shared/`, `docs/superpowers/inventory/` and `tests/module_names.js`.

After the last batch, check the end state (design §1, §5.6): `main.js` of each planner holds, inside the IIFE, only wiring calls,
the pinned start-up statements (US: `@96` and `@190`; Canada: `@70`), the boot sequence, `wireTableFocus();`, `registerMcpTools();`, `installSharedTestHooks();`,
`installTestHooks();` (in today's order); `grep -c '@@shared' src/us/main.js src/canada/main.js` prints 0 for both;
the regenerated `docs/superpowers/inventory/closure-us.md` and `closure-canada.md` summaries report 0 functions, 0 const, 0
let, 0 var and 0 classes (only side-effect statements remain), and the topics file's `main` lists plus the wiring calls
account for every one of them.

---

### Task 12: The regroup tool

**Files:** Create `scripts/regroup-modules.js`, `scripts/lib/regroup.js`, `tests/regroup_modules.js`; modify `package.json`.

Design §5.8.

**Interfaces:**
- Map file (`stage4-regroup.json`): `{ "operations": [ { "rename": "<old>", "to": "<new>" }, { "merge": ["<a>", "<b>"], "to": "<new or existing>" }, { "move": "<name>", "from": "<path>", "to": "<path>" } ] }`,
  applied in order.
- `regroup(root, operations, { dryRun })` in `scripts/lib/regroup.js`; `node scripts/regroup-modules.js --map <file> [--dry-run]`
  prints one line per operation and `regroup: <n> operations, <m> files written`. Writes nothing unless every operation and
  every guard passes (staged writes, renamed into place, like `extract-units.js`).
- **Rename:** move the file; rewrite every import of it in `src/` (relative specifiers; facades' `export ... from`); refuse
  if the target exists.
- **Name clashes** (merge and move): refuse when the result would declare one top-level name twice, or when a top-level
  declaration would share its name with an import binding in the same file (`name clash: <name> in <path>`); esbuild would
  otherwise rename one of them silently or fail.
- **Merge:** concatenate the source bodies (imports merged and deduplicated; relative specifiers recomputed for the target's
  directory) in dependency order among the sources; when the sources are in one import cycle, keep the map's order, allowed
  only if every source passes `checkLoadTime` with its cycle partners. Drop the sources' purpose comments; the target (if it
  exists) keeps its own. Rewrite every import of the sources to the target.
- **Move:** cut one top-level declaration (with its contiguous comment block) from `from` and append it to `to` (created if
  missing); add or remove `export` as uses require; rewrite imports in every file that used it; refuse when the name is a
  mutable binding and any of its writers stays behind; refuse a move into `core/` of a declaration that uses a browser global,
  a DOM method, or imports from `ui/`. A source left with no declarations is deleted.
- **After every operation**, on the staged result: `core_purity`'s rules on every `core/` file, no import cycle touching
  `core/` (`module-graph.js`), the UI-cycle guard, the load-time check on every `ui/` module, the facade-side rule (a
  facade's side must match its target's side as in Task 6; a move or rename that changes a seam target's side moves the
  facades in both countries), `closure_names`' undeclared-name check on every touched file. Any failure: refuse with the
  operation's index and the problem.
- **Outside `src/`:** rewrite module paths in `tests/state_modules.js` and in `CLAUDE.md` (exact path strings); print the
  generated rule docs that record a changed source path (`scripts/gen-*-rules.js` print their source path) as
  `regenerate: <npm script>`.
- **Report:** after every operation, the order in which the bundle initializes the `// load-time:` declarations (a dry
  build into a directory from `fs.mkdtempSync(path.join(os.tmpdir(), 'regroup-'))`, removed afterwards, read in output order) compared with the order before; print each change.

**Fixture cases** (`tests/regroup_modules.js`, throwaway trees with a `src/package.json`, two countries and a tiny planner):
1. Rename a shared module imported by both planners and by a facade: every specifier rewritten; the fixture builds.
2. Merge two shared `ui/` modules where one imports the other: one file, dependency order, no self-import, imports merged.
3. Move a function between modules; a third module that imported it from the old place now imports from the new.
4. Rename a module named in `tests/state_modules.js` and `CLAUDE.md` (fixture copies): both rewritten.
5. Refusals: a rename onto an existing path; a merge of two modules that both declare `x`; a move of `x` into a module that
   imports another `x`; a merge that creates a cycle through `core/`; a merge of cycle members with an
   unmarked non-inert initializer; a move of `let n` without its writer function; a move of a `document`-using function into
   `core/`.
6. Purpose comments: merging two modules with purpose comments into a new target keeps neither (the target gets none); into an
   existing target keeps the target's.

- [ ] **Step 1:** Fixtures fail. **Step 2:** Implement; `node tests/regroup_modules.js` prints `regroup_modules OK`.
  **Step 3:** Add it to `test` after `node tests/compare_builds.js` (JSON-aware edit). Full suite, `exit 0`. Commit the four
  files: `Regroup tool: rename, merge and move modules with every structural guard re-run`.

---

### Task 13: Tidy: names, topic grouping, purpose comments. OWNER CHECKPOINT at step 1.

**Files:** `src/**` (renamed, merged, moved), `scripts/extractions/stage4-regroup.json`, `tests/module_names.js`,
`tests/state_modules.js`, `CLAUDE.md` (paths only), generated rule docs if listed, `package.json` (`test`),
`docs/superpowers/inventory/*`.

- [ ] **Step 1: Validate the map** in the implementation tree (a dry run writes nothing):
  `node scripts/regroup-modules.js --map scripts/extractions/stage4-regroup.json --dry-run`. This dry run is design §6.4's check
  that every planned merge is still legal under the load-time guard (the tool re-runs every guard per operation).
  Fix the map until it passes; list every `-N` and misleading name still present (`find src -name '*.js'` against the map) and add
  operations for them. **STOP for the owner** with the final map and the dry-run output. Commit the approved map.
- [ ] **Step 2: Apply** in the implementation tree: `node scripts/regroup-modules.js --map scripts/extractions/stage4-regroup.json`.
  Run every `regenerate:` script it printed. Review the load-time order report: no line may involve two declarations of
  which one reads the other (report any).
- [ ] **Step 3: Purpose comments.** For every `ui/` module (`find src -path '*/ui/*.js' ! -name 'seam-*'`), add line 1 `// <one
  line: what the module holds, by topic>` and line 2 blank, unless it already has one. Comments only.
- [ ] **Step 4: Switch on the checks.** `tests/module_names.js`: empty `ALLOWED`. `package.json` `test`: `node scripts/module-map.js --check`
  becomes `node scripts/module-map.js --check --require-purpose` (JSON-aware edit). `npm run analyze`.
- [ ] **Step 5: Verify.** `git -C ../fp-stage4-prev checkout --detach <the last batch commit> && (cd ../fp-stage4-prev && npm run build)`,
  then `npm run build && node scripts/compare-builds.js --base ../fp-stage4-prev --ordered` and `--base ../fp-stage4-base --ordered`: both equal, ordered identical. Ad-hoc sweep: as `adhocAfter`. Full
  suite, `exit 0`, snapshots untouched.
- [ ] **Step 6: Commit.** `git add -A src scripts/extractions tests package.json CLAUDE.md docs` (only what changed);
  message `Stage 4 tidy: topic names, merged and split UI modules, purpose comments; module_names allow-list emptied`.

---

### Task 14: Cleanup: the marker system goes

**Files:** Delete `scripts/sync-shared.js`, `shared/`; create `tests/no_markers.js`; modify `package.json`,
`scripts/lib/extract-units.js`, `tests/extract_units.js`, `src/us/main.js` / `src/canada/main.js` only if a marker remains.

Design §5.9.

- [ ] **Step 1:** `grep -rn '@@shared' src` must print nothing (Task 11 emptied every region). If it prints anything, strip
  those marker lines by hand in both planners (identical edits) and delete their fragments.
- [ ] **Step 2:** `tests/no_markers.js`: fails on any `@@shared` in `src/**` (not `scripts/`, not `tests/`). Add it to `test`
  in place of the `node scripts/sync-shared.js --check &&` step; remove the `sync` and `check:shared` scripts (JSON-aware edits).
- [ ] **Step 3:** `git rm -r --ignore-unmatch shared scripts/sync-shared.js` (Task 11 may already have deleted every fragment). Keep `scripts/lib/marker-source.js` (data blocks; unrelated).
- [ ] **Step 4:** Remove the region and fragment handling from `scripts/lib/extract-units.js` only (the `regionsOf` /
  fragment-refresh / emptied-region code and the `shared/` writes), with the `tests/extract_units.js` fixtures that build
  `@@shared` regions. Leave the region code in `scripts/lib/extraction-plan.js` and `scripts/analyze-closure.js` as is: with no
  markers in `src/` it finds no regions and does nothing (design §5.9: the plan's decision). Keep data-block handling
  (`// NAME:begin`) everywhere. The applier then refuses a manifest module with `owner: 'shared'`:
  `no shared regions remain; write shared code in src/shared/ directly` (it could only ever be built from region units), with a
  fixture for the refusal.
- [ ] **Step 5:** `npm run build && node scripts/compare-builds.js --base ../fp-stage4-base --ordered` (equal, identical); full
  suite `exit 0`. Commit: `Cleanup: sync-shared.js, shared/ and the region code removed; no_markers test`.

---

### Task 15: End-of-stage verification (no commit)

- [ ] **Step 1:** `npm run build && node scripts/compare-builds.js --base ../fp-stage4-base --ordered`. Expected: 816 / 538
  equal (as the base counts; expansion makes the head counts equal too), ordered identical for both planners.
- [ ] **Step 2: Timing.** Three alternating runs:
  `for i in 1 2 3; do node tests/bench_heavy.js --root ../fp-stage4-base > $SCRATCH/bh-base-$i.txt; node tests/bench_heavy.js > $SCRATCH/bh-head-$i.txt; done`
  (background). For each state and each figure, compare the median of the three head runs with the median of the three base
  runs. Expected: none above +5%; repeat any that is above once with `--states <that state>`, and report it only if it stays
  above.
- [ ] **Step 3:** Ad-hoc sweep equals `adhocAfter`. `git status --short tests/snapshots` empty.
- [ ] **Step 4:** `git worktree remove --force ../fp-stage4-prev && git worktree remove --force ../fp-stage4-base`.

---

### Task 16: Docs

**Files:** `CLAUDE.md`, `README.md`, `docs/superpowers/inventory/*`, create `docs/superpowers/inventory/stage4-region-map.md`,
the design file (status line), and section 6 of
`docs/superpowers/specs/2026-10-10-modular-build-design.md`.

- [ ] **Step 1:** `npm run analyze` (inventory and module map current).
- [ ] **Step 2: Region map.** A scratch script (like stage 3's `region-map.js`) reading `scripts/extractions/stage4.json`
  and `stage4-regroup.json`: for each of the 21 regions, the module(s) that hold its units after the tidy batch. Write
  `stage4-region-map.md` with the same header style as `stage3-region-map.md`.
- [ ] **Step 3: CLAUDE.md.**
  - Replace the section "Shared code between the planners (marked regions)" (including its CRLF gotcha) with a short section
    "Shared code between the planners": shared code lives in `src/shared/`, identical in both planners by construction;
    country code in `src/<country>/`; the region maps in `docs/superpowers/inventory/` say where old regions went. The extraction
    tool no longer makes shared modules (it refuses `owner: 'shared'`): new shared code is written in `src/shared/` directly.
  - Rewrite "Modules and the extraction tool" for stages 2-4: where code lives, `main.js` as the entry point (wiring calls,
    pinned start-up statements, boot sequence, `registerMcpTools()`, `installSharedTestHooks()`, `installTestHooks()`), the
    seam with `core/` and `ui/` facades (design §5.2), UI cycles and the load-time guard, the `// load-time:` comment, the
    module map, the regroup tool, the ordered build comparison.
  - Add "Adding UI code" with the content of design §9.
  - State the reworded rule 3 (design §5.7).
  - Remove every `npm run sync` / `--pull` / `check:shared` instruction; update the `Files` and `Commands` lists (new tests and
    scripts; `sync-shared.js` gone).
  - Update stale module paths (`year-factors-2.js`, `clamp-profit-sharing.js`, `first-run-ui.js`, ...) to the new names.
- [ ] **Step 4: README.md** development section: the module layout, `npm run analyze` writes the module map, no `npm run sync`.
- [ ] **Step 5:** Design status line: `Status: implemented on branch <branch> (the owner adds the merge date when merging)`.
  Parent design section 6: the stage 4 entry already points at this design and plan (added with the owner's agreement in
  `373375e`); append only ` DONE on branch <branch> (the owner adds the merge date when merging).`, as stages 1-3 do.
- [ ] **Step 6:** `grep -n "npm run sync\|check:shared\|@@shared:<name>" CLAUDE.md README.md` prints nothing; full suite `exit 0`.
  Commit `CLAUDE.md README.md docs`: `Docs: stage 4 (UI modules, wiring functions, the entry point, Adding UI code), region map, inventory`.
