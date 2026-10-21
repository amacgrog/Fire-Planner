# Core regroup (and ui/ folders): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `core/` and `ui/` directory (shared, US, Canada) is split into topic subfolders of files named by content, with
no behavior change; then every `core/` module has a purpose comment and every `core/` load-time initializer a marker.

**Architecture:** The existing regroup tool (`scripts/regroup-modules.js`, `scripts/lib/regroup.js`) applies committed maps of
renames, merges and single-declaration moves, re-running every structural guard after each operation. The maps are already
written and were proven end to end on a throwaway copy of `main` at `9aece4a` (section "Evidence" below). Before they run,
the tools get one shared definition of a `ui/` / `core/` path (open item T17) and two small regroup fixes the rehearsal found.

**Tech Stack:** Node (CommonJS scripts), esbuild, espree / eslint-scope (in the regroup tool), Playwright (in `npm test`).

**Spec:** `docs/superpowers/specs/2026-10-21-core-regroup-design.md` (approved 2026-10-21).

**Branch:** `claude/core-regroup`, cut from `origin/main` at `9aece4a`. Two PRs into `main` when the owner asks: Tasks 1-5
(T17 and `core/`), then Task 6 (`ui/`). Do not push or open a PR unless the owner asks. Never `git stash`.

## Global Constraints

- No behavior change. Edits to `src/` are made only by the regroup tool, except Task 4's comments. After every batch,
  `node scripts/compare-builds.js --base <base tree> --ordered` reports `missing from head 0, new in head 0` for both planners
  (673 US / 461 Canada statements on `9aece4a`), and `npm test` exits 0 with the snapshot baselines untouched.
- **The maps are fixed inputs.** `scripts/extractions/core-regroup-1-us-split.json` (68 operations),
  `core-regroup-2-canada-split.json` (14), `core-regroup-3-us-folders.json` (32), `core-regroup-4-canada-folders.json` (20),
  `core-regroup-5-shared-folders.json` (18) and `ui-regroup.json` (80) were generated for `src/` at `9aece4a`. If `src/` has
  changed since (any commit touching `src/` between `9aece4a` and the start of Task 3), stop and report: the maps must be
  regenerated. `scripts/extractions/core-regroup-topics.json` is the human-readable assignment behind them (folder and file per
  source module, with per-name overrides); no tool reads it.
- Never hand-edit a module's code; never reformat a module (two-space indentation inside modules stays as it is).
- Seam facades (`src/<country>/core/seam-*.js`, `src/<country>/ui/seam-*.js`) stay where they are; the tool rewrites their
  targets. The state modules stay at the top of their `core/` (`store.js`, `chart-prefs.js`, `chart-hover.js`, `field-wiring.js`,
  `tax-factors.js`; US `tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`), and `install-test-hooks.js`,
  `wizard.js` and (shared) `mcp-tools.js` at the top of their `ui/`.
- No version-badge bump (nothing user-facing). Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Single-script runs read `dist/` as it is: `npm run build` before `node tests/x.js`.

## Evidence (rehearsal, 2026-10-21)

On a throwaway worktree of `9aece4a` with the Task 2 merge fix applied by hand: all five core maps applied in order
(152 operations, 162 files written; 82 moves, then renames and merges), `npm run gen:states`, `gen:provinces`, `gen:benefits`,
`npm run analyze`, `npm run build`; `compare-builds.js --base <9aece4a tree>`: US 673 / 673, Canada 461 / 461, nothing missing,
nothing new; `npm test` failed only in `tests/doc_paths.js` on 7 paths in `docs/superpowers/inventory/stage4-open-items.md`
(the tool does not rewrite that file; Task 2 makes it), and passed after they were rewritten. Without the merge fix the first
core map is refused at operation 83 (`missing export: ... REACH_GROSS_UP`). The ordered comparison (`--ordered`) also passed
(55 ordered statements identical per planner). The `ui/` map then applied on top (80 operations, 103 files written), ordered
comparison clean; `npm test` failed only in `tests/doc_paths.js` on 24 paths, all in `stage4-open-items.md` (Task 2 again).
Result: `core/` holds 85 modules instead of 132 (shared 23, US 41, Canada 21), plus the 32 facades.

## Review Focus

- A file in a new subfolder escaping a guard because a tool tests the parent directory's name: `scripts/module-map.js` today
  requires a purpose only when the directory itself is named `ui`, so `src/shared/ui/charts/x.js` would be skipped. Task 1's
  module-map fixture pins it.
- A module placed outside `core/` and `ui/` (or in a `ui/` folder inside `core/`) passing silently. Task 1's `tests/src_paths.js`
  scan and the regroup refusal fixture pin it.
- A grouped declaration (`export const A = 1, B = 2`) losing an export that another module needs when a merge makes its first
  name internal. Task 2's fixture pins it.
- A `// load-time:` marker that does not count because it is not the first line of the comment block above the declaration, or
  that replaces a module's purpose comment on line 1. Task 4 step 3's guard run pins it.
- Stale `src/` paths in a doc that a test reads (`CLAUDE.md`, the inventory docs). `tests/doc_paths.js` in every batch's
  `npm test` pins it.

---

### Task 1: One definition of a source path's side (T17)

**Files:**
- Create: `scripts/lib/src-paths.js`, `tests/src_paths.js`
- Modify: `tests/ui_cycles.js:37,40`, `scripts/lib/regroup.js:71-72,739-742`, `scripts/lib/extract-units.js:200`,
  `scripts/module-map.js:96`, `scripts/lib/extraction-plan.js:192,589`, `package.json` (`test` script),
  `tests/regroup_modules.js`, `tests/module_map.js`

**Interfaces:**
- Produces, in `scripts/lib/src-paths.js` (CommonJS):
  - `sideOf(rel: string): 'core' | 'ui' | 'entry' | null`. `rel` is repo-relative; `\` is normalized to `/`.
    `src/<shared|us|canada>/<core|ui>/<...>.js` is that side, unless a directory below that level is itself named `core` or `ui`
    (then `null`); `src/<us|canada>/main.js` and `src/<us|canada>/storage-key.js` are `'entry'`; anything else is `null`.
  - `isUi(rel): boolean`, `isCore(rel): boolean` (`sideOf(rel) === 'ui'` / `'core'`).
  - `isFacade(rel): boolean`: `/^src\/(us|canada)\/(core|ui)\/seam-[^/]+\.js$/` (facades live only at the top of a side).

- [ ] **Step 1: Write `tests/src_paths.js`.** It asserts, with `assert.strictEqual`:
  `sideOf('src/us/ui/charts/x.js') === 'ui'`, `sideOf('src/shared/core/tax/x.js') === 'core'`, `sideOf('src/us/core/x.js') === 'core'`,
  `sideOf('src/us/core/ui/x.js') === null`, `sideOf('src/us/ui/core/x.js') === null`, `sideOf('src/us/main.js') === 'entry'`,
  `sideOf('src/canada/storage-key.js') === 'entry'`, `sideOf('src/shared/main.js') === null`, `sideOf('src/us/misc/x.js') === null`,
  `sideOf('src\\us\\ui\\x.js') === 'ui'`, `isFacade('src/us/core/seam-taxFor.js') === true`,
  `isFacade('src/us/core/tax/seam-taxFor.js') === false`. Then it walks every `.js` under `src/` and fails listing each file whose
  `sideOf` is `null` (`src/package.json` is not `.js`). Prints `src_paths OK (<n> files)`.
- [ ] **Step 2: Run it.** `node tests/src_paths.js` → FAIL (`Cannot find module '../scripts/lib/src-paths'`).
- [ ] **Step 3: Implement `scripts/lib/src-paths.js`** with the interface above.
- [ ] **Step 4: Run it.** `node tests/src_paths.js` → `src_paths OK (...)`. Add `node tests/src_paths.js` to the `test` script in
  `package.json`, right after `node tests/module_names.js`.
- [ ] **Step 5: Adopt it.** Replace each local test with the shared one, same meaning on today's tree:
  `tests/ui_cycles.js` lines 37 and 40 (`f.split('/').includes('ui')` → `isUi(f)`); `scripts/lib/regroup.js` lines 71-72
  (`isUi`, `isCore` imported); `scripts/lib/extract-units.js` line 200 (`isUiPath` → `isUi`); `scripts/lib/extraction-plan.js`
  line 192 (`pathSide = (p) => (isUi(p) ? 'ui' : 'core')`) and line 589 (`ui: isUi(m.topicPath)`); `scripts/module-map.js`
  line 96 (`isUi(rel) && !isFacade(rel) && purpose === NO_PURPOSE`, with `rel` the module's repo-relative path; drop the
  directory-name test). In `checkTarget` (`scripts/lib/regroup.js` ~739), add after the first line:
  `if (sideOf(rel) === null) refuse(`${rel}: a target must be under src/<owner>/core/ or src/<owner>/ui/ (and not in a core/ or ui/ folder below that)`);`
- [ ] **Step 6: Fixtures.** In `tests/regroup_modules.js`, a fixture tree with `src/us/core/a.js` and two maps: a rename to
  `src/us/misc/a.js` and a rename to `src/us/core/ui/a.js`; both refused, the error naming the target. In `tests/module_map.js`, a
  fixture `src/shared/ui/charts/x.js` with no purpose comment is listed as an offender by `--require-purpose` (and the same file
  with a purpose comment is not).
- [ ] **Step 7: Verify.** `npm test` → exit 0 (no `src/` change, so every other check is unchanged).
- [ ] **Step 8: Commit.**

```bash
git add scripts/lib/src-paths.js tests/src_paths.js tests/ui_cycles.js scripts/lib/regroup.js scripts/lib/extract-units.js scripts/module-map.js scripts/lib/extraction-plan.js package.json tests/regroup_modules.js tests/module_map.js
git commit -m "T17: one definition of a source path's side (scripts/lib/src-paths.js), used by every tool; regroup refuses a target outside core/ and ui/"
```

### Task 2: Two regroup fixes found in the rehearsal

**Files:**
- Modify: `scripts/lib/regroup.js` (~line 874, the merge's export loop; the `OUTSIDE` list, line 50), `tests/regroup_modules.js`

**Interfaces:**
- Consumes: Task 1's `src-paths.js` (already imported by `regroup.js`).

- [ ] **Step 1: Fixture for the grouped export.** A tree with `src/us/core/a.js`
  (`export const A = 1,\n    B = 2;\n`), `src/us/core/b.js` (`import { A } from './a.js';\nexport function b() { return A; }\n`) and
  `src/us/core/c.js` (`import { B } from './a.js';\nexport function c() { return B; }\n`); map
  `{ merge: ['src/us/core/a.js', 'src/us/core/b.js'], to: 'src/us/core/a.js' }`. Assert the run succeeds and the merged
  `a.js` still starts its declaration with `export const A = 1,`, and `c.js` still imports `B` from `./a.js`.
- [ ] **Step 2: Run it.** `node tests/regroup_modules.js` → FAIL (`missing export: src/us/core/c.js imports B ...`).
- [ ] **Step 3: Fix the merge.** In the loop that removes `export` from names used only inside the merged module, remove it only
  when every name of the same declaration statement is internal:

```js
      for (const [name, d0] of shape0.decls) {
        const siblings = [...shape0.decls].filter(([, x]) => x.st === d0.st).map(([n]) => n);
        if (siblings.every((n) => intraNames.has(n) && !external.has(n))) text = setExport(text, m, name, false);
      }
```

- [ ] **Step 4: Run it.** `node tests/regroup_modules.js` → passes.
- [ ] **Step 5: Open items follow the paths.** Add `'docs/superpowers/inventory/stage4-open-items.md'` to `OUTSIDE` (exact module
  path strings follow every rename and merge, like CLAUDE.md). Extend the existing outside-paths fixture in
  `tests/regroup_modules.js` with that file (a renamed module's path in it is rewritten). Update the header comment's
  "Outside src/" sentence to name it.
- [ ] **Step 6: Verify.** `npm test` → exit 0.
- [ ] **Step 7: Commit.**

```bash
git add scripts/lib/regroup.js tests/regroup_modules.js
git commit -m "Regroup: a merge keeps the export of a grouped declaration another module needs; stage4-open-items.md paths follow renames and merges"
```

### Task 3: Apply the core maps (five batches)

**Files:**
- Modify (by the tool and the generators only): `src/**/core/**`, `tests/state_modules.js`, `CLAUDE.md` (paths),
  `docs/superpowers/inventory/*.md`, `docs/state-tax-rules.md`, `docs/province-tax-rules.md`, `docs/benefits-rules.md`

- [ ] **Step 1: Check the maps still apply.** `git diff --stat 9aece4a HEAD -- src` → empty output. Otherwise stop (Global
  Constraints).
- [ ] **Step 2: Build the base tree.** `git worktree add <scratch>/regroup-base HEAD`, then in it `npm ci && npm run build`.
  `<scratch>` is the session's scratchpad (never inside the repo). Every comparison in this task uses `--base <scratch>/regroup-base`.
- [ ] **Step 3: For each batch N in order 1-5** (`core-regroup-1-us-split`, `2-canada-split`, `3-us-folders`, `4-canada-folders`,
  `5-shared-folders`):
  - `node scripts/regroup-modules.js --map scripts/extractions/core-regroup-<N>-<name>.json --dry-run` → last line
    `[dry run] regroup: <ops> operations, ...` with ops 68, 14, 32, 20, 18. Then the same without `--dry-run`.
  - Run every `regenerate: npm run <script>` the tool printed (expected: batch 3 prints `gen:states`, batch 4 `gen:provinces`
    and `gen:benefits`; batches 1 and 2 print none and delete no file).
  - `npm run analyze`, then `npm run build`.
  - `node scripts/compare-builds.js --base <scratch>/regroup-base --ordered` → for both planners `missing from head 0, new in head 0`.
  - `npm test` → exit 0.
  - Commit: `git add -A src tests/state_modules.js CLAUDE.md docs` then
    `git commit -m "Core regroup batch <N>/5: <what the batch does> (scripts/extractions/core-regroup-<N>-<name>.json; no behavior change)"`
    (batch 1: "the US grab-bag modules split by topic"; 2: "the Canada ones"; 3-5: "US / Canada / shared core/ modules into
    topic folders").
- [ ] **Step 4: Check the result.** `find src/shared/core src/us/core src/canada/core -name '*.js' ! -name 'seam-*' | wc -l` → 85.
  No `-<digits>.js` module, no module directly in `core/` other than the state modules listed in Global Constraints.
- [ ] **Step 5: Remove the base worktree** (`git worktree remove <scratch>/regroup-base`) after Task 4's comparison has also run.

### Task 4: Purpose comments and load-time markers for core/

**Files:**
- Modify: every non-facade module under `src/**/core/` (line 1 and the 33 marked initializers; comments only),
  `scripts/module-map.js`, `tests/ui_cycles.js`, `scripts/lib/regroup.js` (~line 707), `tests/module_map.js`, `tests/ui_cycles.js`
  fixtures

- [ ] **Step 1: Guards first.** `scripts/module-map.js`: the purpose offender test becomes `(isUi(rel) || isCore(rel)) && !isFacade(rel)`;
  its `--require-purpose` message and header say "core/ and ui/ modules". `tests/ui_cycles.js` and `scripts/lib/regroup.js` (~707):
  the load-time check runs on every `core/` module too (`isUi(f) || isCore(f)`; `core/` modules are never in a cycle, so they get
  the non-cycle rule); update `tests/ui_cycles.js`'s header comment. Fixtures: `tests/module_map.js`, a `src/us/core/tax/x.js`
  without a purpose is an offender; `tests/ui_cycles.js`, a `src/us/core/x.js` with `export const v = f();` unmarked is reported,
  and passes with a `// load-time: <reason>` line directly above it.
- [ ] **Step 2: Run the guards.** `node scripts/module-map.js --check --require-purpose` → FAIL listing 85 core modules;
  `npm run build && node tests/ui_cycles.js` → FAIL listing 33 core initializers (`not inert and not marked`).
- [ ] **Step 3: Write the markers.** For each listed initializer, the first line of the contiguous `//` comment block directly above
  the declaration becomes `// load-time: <reason>` (insert it as a new first line of that block; if there is no block, the marker is
  the block). The reason says what the initializer computes and that it reads only literals, imports that are themselves
  load-time values, or nothing a statement writes (for example `// load-time: freezes a literal list; reads nothing`). Where the
  block above starts with a `// NAME:begin` data marker, put the marker above the declaration's own comment, never between the
  data marker and the block it opens; never on line 1 of a file. Rerun `node tests/ui_cycles.js` → passes.
- [ ] **Step 4: Write the purpose comments.** Line 1 of every non-facade `core/` module: `// <one line saying what the module holds>`
  (40-110 characters, the style of the `ui/` modules), line 2 blank. A module whose line 1 is already a `//` comment followed by a
  blank line keeps it if it is a true purpose; otherwise insert above it. Rerun
  `node scripts/module-map.js --check --require-purpose` after `npm run analyze` → passes.
- [ ] **Step 5: Verify.** `npm run build`, `node scripts/compare-builds.js --base <scratch>/regroup-base --ordered` (comments are not
  statements: `missing from head 0, new in head 0`), `npm test` → exit 0.
- [ ] **Step 6: Commit.**

```bash
git add -A src scripts tests docs
git commit -m "Core modules: purpose comments and load-time markers; module map and load-time guard cover core/"
```

### Task 5: Docs for the core regroup (end of the first PR)

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/superpowers/inventory/stage4-open-items.md`

- [ ] **Step 1: CLAUDE.md.**
  - In "Modules, the entry point and the tools", replace the sentences describing modules named after their first unit and the
    one-unit modules (stage 3's "about 29 of the 38 modules hold one unit") with: `core/` and `ui/` are split into topic folders
    (this regroup, 2026-10); a file is named by content.
  - Add a section `## Where new code goes` right before `## Adding UI code`: one line per `core/` folder, what belongs in it, for
    shared / US / Canada (from the tree Task 3 produced; read it with
    `find src/*/core -mindepth 1 -maxdepth 1 -type d`): `tax/`, `benefits/` (Canada), `healthcare/` (US), `income/`, `accounts/` (US),
    `withdrawals/`, `cliff-plan/` (US), `projection/`, `optimizer/` (US), `inputs/`, `analysis/`, `format/` (shared), plus the rule
    that state modules and facades stay at the top of `core/`, a new topic gets a new folder only when no existing one fits, and a
    folder holds no `core` or `ui` folder of its own (`tests/src_paths.js`).
  - In "Adding UI code", the "Initializers" bullet now applies to `core/` modules too (one sentence), and the "A new topic" bullet
    says "in its topic folder".
  - Paths the tool rewrote are already current; `node tests/doc_paths.js` confirms.
- [ ] **Step 2: README.md** "Files": `core/` and `ui/` are organized in topic folders; name the `core/` folders in one sentence.
- [ ] **Step 3: Open items.** In `stage4-open-items.md`, move both T17 lines and the T13 near-twin names ruling
  (`estimate-checks.js` / `estimates-and-warnings.js`, now merged into `src/shared/core/inputs/estimates.js`) to "Resolved", each
  with the commit that closed it (Task 1, Task 3 batch 1 / batch 5).
- [ ] **Step 4: Verify.** `npm test` → exit 0.
- [ ] **Step 5: Commit.**

```bash
git add CLAUDE.md README.md docs/superpowers/inventory/stage4-open-items.md
git commit -m "Docs: core/ topic folders (where new code goes), README, T17 and the near-twin names resolved"
```

The first PR ends here (Tasks 1-5).

### Task 6: ui/ topic folders (the second PR)

**Files:**
- Modify (by the tool): `src/**/ui/**`, `CLAUDE.md` (paths), `docs/superpowers/inventory/*.md`; by hand: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Base tree.** As Task 3 step 2, a fresh `<scratch>/regroup-base-ui` worktree of the commit after Task 5, built.
- [ ] **Step 2: Apply.** `node scripts/regroup-modules.js --map scripts/extractions/ui-regroup.json --dry-run` → `regroup: 80 operations`
  (the "import cycles: joined" lines are the render-cycle members reported under their new paths); then without `--dry-run`.
  `npm run analyze`, `npm run build`, `node scripts/compare-builds.js --base <scratch>/regroup-base-ui --ordered` → nothing missing,
  nothing new; `npm test` → exit 0.
- [ ] **Step 3: Docs.** CLAUDE.md "Where new code goes" gains the `ui/` folders: `charts/`, `inputs/` (the sidebar), `results/` (the
  dashboard), `plans/` (saving and comparing), `layout/` (the app shell), with `install-test-hooks.js`, `wizard.js` and `mcp-tools.js`
  at the top; "Adding UI code" "A new topic" names the folders. README "Files" names the `ui/` folders. `npm test` → exit 0.
- [ ] **Step 4: Commit and clean up.**

```bash
git add -A src CLAUDE.md README.md docs tests/state_modules.js
git commit -m "ui/ topic folders: charts, inputs, results, plans, layout (scripts/extractions/ui-regroup.json; no behavior change)"
```

  Then `git worktree remove <scratch>/regroup-base-ui`.
