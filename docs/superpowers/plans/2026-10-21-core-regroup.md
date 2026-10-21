# Core regroup (and ui/ folders): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `core/` and `ui/` directory (shared, US, Canada) is split into topic subfolders of files named by content, with
no behavior change; then every `core/` module has a purpose comment and every `core/` load-time initializer a marker.

**Architecture:** The existing regroup tool (`scripts/regroup-modules.js`, `scripts/lib/regroup.js`) applies committed maps of
renames, merges and single-declaration moves, re-running every structural guard after each operation. The maps are written
by `scripts/plan-regroup.js` from `scripts/extractions/core-regroup-topics.json` and were rehearsed end to end on a throwaway
copy of `main` at `9aece4a` (section "Evidence"). Before they run, the tools get one shared definition of a `ui/` / `core/`
path (open item T17) and three small regroup changes the rehearsals needed.

**Tech Stack:** Node (CommonJS scripts), esbuild, espree / eslint-scope (in the regroup tool), Playwright (in `npm test`).

**Spec:** `docs/superpowers/specs/2026-10-21-core-regroup-design.md` (approved 2026-10-21). Revised after an independent review
(2026-10-21): placements, the data-block move, the committed generator, corrected counts.

**Branch:** `claude/core-regroup`, cut from `origin/main` at `9aece4a`. Two PRs into `main` when the owner asks: Tasks 1-5
(T17 and `core/`), then Task 6 (`ui/`). Do not push or open a PR unless the owner asks. Never `git stash`.

## Global Constraints

- No behavior change. Edits to `src/` are made only by the regroup tool, except Task 4's comments. After every batch,
  `node scripts/compare-builds.js --base <base tree> --ordered` reports `missing from head 0, new in head 0` for both planners
  (US 673 statements, 60 ordered; Canada 461, 55 ordered, on `9aece4a`), and `npm test` exits 0 with the snapshot baselines
  untouched.
- **The maps.** `scripts/extractions/core-regroup-1-us-split.json` (84 operations), `2-canada-split` (18), `3-shared-split` (6),
  `4-us-folders` (32), `5-canada-folders` (20), `6-shared-folders` (18), and `ui-regroup.json` (80 renames), all for `src/` at
  `9aece4a`. If any commit between `9aece4a` and the start of Task 3 touches `src/`, regenerate the core maps:
  `node scripts/plan-regroup.js --topics scripts/extractions/core-regroup-topics.json --out scripts/extractions` (it refuses a
  topic assignment whose files would import each other in a loop, and orders the operations so every intermediate tree is
  loop-free), add any new module to the topics file first, dry-run every map, and record the new operation counts in the
  ledger. If `src/**/ui/` changes before Task 6, add or rename the affected entries of `ui-regroup.json` by hand (it is plain
  renames). Never edit a core map by hand.
- Never hand-edit a module's code; never reformat a module (two-space indentation inside modules stays as it is).
- Seam facades (`src/<country>/core/seam-*.js`, `src/<country>/ui/seam-*.js`) stay where they are; the tool rewrites their
  targets. The state modules stay at the top of their `core/`: shared `store.js`, `chart-prefs.js`, `tax-factors.js`; US
  `tax-year.js`, `cliff-plan-store.js`, `optimizer-state.js`, `test-hooks.js`. `install-test-hooks.js`, `wizard.js` and (shared)
  `mcp-tools.js` stay at the top of their `ui/`.
- No version-badge bump (nothing user-facing). Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Single-script runs read `dist/` as it is: `npm run build` before `node tests/x.js`.

## Why module order cannot change behavior here

`compare-builds.js --ordered` does not compare the order of declaration initializers, and the regroup tool's load-time order
report only covers marked initializers, which `core/` has none of until Task 4. The argument that the order does not matter
(checked by the review of 2026-10-21): `core/` has no top-level statement other than declarations; each of its 33 non-inert
initializers reads only literals, globals, earlier constants of its own file (the tool refuses a forward read) or imports from
modules that are not in a cycle (`LIST_MAX`, the `INH_*` constants); `CURRENT_YEAR` and `currentYear` are separate
`new Date()` calls whose relative order is irrelevant; `taxFactorInflation` moves with its only writer, `taxIndexFactor`. So the
values do not depend on module order.

## Evidence (rehearsals, 2026-10-21)

On a throwaway worktree of `9aece4a` with Task 2's three regroup changes applied by hand, the six core maps were applied one
batch at a time. After each batch: the generators the tool named, `npm run analyze`, `npm run build`,
`compare-builds.js --base <9aece4a tree> --ordered` (US 673 / 673, 60 ordered; Canada 461 / 461, 55 ordered; nothing missing,
nothing new) and `npm test`: exit 0 after batches 1-3; after batches 4-6 only `tests/doc_paths.js` failed, on line 82 of
`stage4-open-items.md`, which writes the path as `src/{us,canada}/core/analyze-shortfall-drivers.js` (the tool rewrites exact path
strings, not brace patterns; Task 2 step 5 writes those paths out). With that line corrected, `npm test` exited 0. The `ui/` map
then applied on top (80 operations, 104 files written), ordered comparison clean, `npm test` exit 0. After the core batches,
84 core modules lacked a purpose comment (all but `src/us/core/optimizer-state.js`) and 33 initializers were unmarked. Without the grouped-export fix the US folder batch is refused (`missing export: ... REACH_GROSS_UP`); without
the open-items rewrite `tests/doc_paths.js` fails on stale paths in `stage4-open-items.md`. A separate reviewer applied the
first version of the maps the same way and found nothing that changes behavior; it also confirmed that the multiset of `//`
comment lines in `core/` is unchanged (no comment is dropped).

Result: `core/` holds 85 modules instead of 132 (shared 22, US 41, Canada 22), plus the 32 facades.

## Review Focus

- A file in a new subfolder escaping a guard because a tool tests a directory's name: `scripts/module-map.js` today requires a
  purpose only when the module's own directory is named `ui`. Task 1's module-map fixture pins it.
- A module placed outside `core/` and `ui/` (or in a `ui/` folder inside `core/`) passing silently. Task 1's `tests/src_paths.js`
  scan and the regroup refusal fixture pin it.
- A grouped declaration (`export const A = 1, B = 2`) losing an export another module needs when a merge makes its first name
  internal; or keeping one when both are internal. Task 2's two fixtures pin it.
- A data block split from its markers or from the comment above it, or a block with two declarations being moved. Task 2's
  block-move fixtures pin it, and `npm run gen:benefits` must still find `BENEFIT_RULES`.
- A `// load-time:` marker that does not count because it is not the first line of the comment block above the declaration,
  or that lands on line 1. Task 4 writes purpose comments first, then markers, and `tests/ui_cycles.js` checks them.

---

### Task 1: One definition of a source path's side (T17)

**Files:**
- Create: `scripts/lib/src-paths.js`, `tests/src_paths.js`
- Modify: `tests/ui_cycles.js:37,40`, `scripts/lib/regroup.js:71-72,620,739-742`, `scripts/lib/extract-units.js:200`,
  `scripts/module-map.js:96`, `scripts/lib/extraction-plan.js:125,192,589,768`, `tests/core_purity.js:21,52`, `package.json`
  (`test` script), `tests/regroup_modules.js`, `tests/module_map.js`

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
  `sideOf` is `null`. Prints `src_paths OK (<n> files)`.
- [ ] **Step 2: Run it.** `node tests/src_paths.js` → FAIL (`Cannot find module '../scripts/lib/src-paths'`).
- [ ] **Step 3: Implement `scripts/lib/src-paths.js`** with the interface above.
- [ ] **Step 4: Run it.** `node tests/src_paths.js` → `src_paths OK (...)`. Add `node tests/src_paths.js` to the `test` script in
  `package.json`, right after `node tests/module_names.js`.
- [ ] **Step 5: Adopt it everywhere a tool decides a side**, same meaning on today's tree:
  - `tests/ui_cycles.js` lines 37 and 40: `isUi(f)`.
  - `scripts/lib/regroup.js` lines 71-72 (`isUi`, `isCore` imported) and line 620 (`target.split('/').includes('ui')` → `isUi(target)`).
  - `scripts/lib/extract-units.js` line 200: `isUiPath` → `isUi`.
  - `scripts/lib/extraction-plan.js` line 125 (`isUi` of the repo-relative path), line 192 (`pathSide = (p) => (isUi(p) ? 'ui' : 'core')`),
    line 589 (`ui: isUi(m.topicPath)`), line 768 (`isCore(p)`).
  - `tests/core_purity.js` lines 21 and 52: `isCore` / `isUi` of the repo-relative path.
  - `scripts/module-map.js` line 96: `isUi(rel) && !isFacade(rel) && purpose === NO_PURPOSE`, with `rel` the module's repo-relative
    path (drop the directory-name test).
  - In `checkTarget` (`scripts/lib/regroup.js` ~739), after the first line:
    `if (sideOf(rel) === null) refuse(`${rel}: a target must be under src/<owner>/core/ or src/<owner>/ui/ (and not in a core/ or ui/ folder below that)`);`
  After this step, `grep -rn "includes('ui')\|includes('core')\|isUiPath" scripts tests` finds only `scripts/lib/src-paths.js` and
  test fixtures' literal strings.
- [ ] **Step 6: Fixtures.** In `tests/regroup_modules.js`, a fixture tree with `src/us/core/a.js` and two maps: a rename to
  `src/us/misc/a.js` and a rename to `src/us/core/ui/a.js`; both refused, the error naming the target. In `tests/module_map.js`, a
  fixture `src/shared/ui/charts/x.js` with no purpose comment is listed as an offender by `--require-purpose` (and the same file
  with a purpose comment is not).
- [ ] **Step 7: Verify.** `npm test` → exit 0 (no `src/` change).
- [ ] **Step 8: Commit.**

```bash
git add scripts/lib/src-paths.js tests/src_paths.js tests/ui_cycles.js tests/core_purity.js scripts/lib/regroup.js scripts/lib/extract-units.js scripts/module-map.js scripts/lib/extraction-plan.js package.json tests/regroup_modules.js tests/module_map.js
git commit -m "T17: one definition of a source path's side (scripts/lib/src-paths.js), used by every tool; regroup refuses a target outside core/ and ui/"
```

### Task 2: Three regroup changes the rehearsals needed

**Files:**
- Modify: `scripts/lib/regroup.js` (the header comment; `OUTSIDE`, line ~50; the merge's export loop, ~874; the move's data-block
  check, ~932), `tests/regroup_modules.js`

- [ ] **Step 1: Fixtures first** (each fails before its fix):
  - *Grouped export, one name external:* `src/us/core/a.js` = `export const A = 1,\n    B = 2;\n`, `src/us/core/b.js` imports `A` from
    `./a.js`, `src/us/core/c.js` imports `B` from `./a.js`; map `{ merge: ['src/us/core/a.js', 'src/us/core/b.js'], to: 'src/us/core/a.js' }`.
    The run succeeds; the merged `a.js` still has `export const A = 1,`; `c.js` still imports `B` from `./a.js`.
  - *Grouped export, both internal:* the same without `c.js`; the merged `a.js` has `const A = 1,` with no `export`.
  - *Data-block move:* `src/us/core/r.js` holds a purpose line, a blank line, `export const X = 1;`, a `// note about Y` line,
    `// Y_RULES:begin`, `export const Y = { a: 1 };`, `// Y_RULES:end`, then `export function f() { return Y.a; }`; map
    `{ move: 'Y', from: 'src/us/core/r.js', to: 'src/us/core/y.js' }`. The run succeeds; `y.js` holds the note line, both markers and
    the declaration in that order; `r.js` keeps `X` and `f`, no marker, and imports `Y` from `./y.js`.
  - *Data-block move refused:* a block holding two declarations; moving one is refused with a message naming the block and
    saying `with other statements`.
  - *Two existing fixtures change meaning* (section "5b. data blocks" of `tests/regroup_modules.js`): "a declaration inside a block
    is refused, whole block or not" (moving `FOO` out of `DB`) and "the BENEFIT_RULES case" (moving `B` out of `MINI`) asserted the
    old refusal. Turn both into positive cases: `FOO` moves with both markers and nothing of `FOO_RULES` is left in `dm.js`; `B`
    moves with `// ---- B section ----`, `// B rows, pure literals.` and its markers, and `A_RULES` stays whole in `rules.js`.
  - *Open items:* extend the existing outside-paths fixture with `docs/superpowers/inventory/stage4-open-items.md` naming a module
    the map renames; the path in it is rewritten.
- [ ] **Step 2: Run them.** `node tests/regroup_modules.js` → FAIL on each new fixture.
- [ ] **Step 3: The grouped export.** In the merge, remove `export` only when every name of the same declaration statement is
  internal:

```js
      for (const [name, d0] of shape0.decls) {
        const siblings = [...shape0.decls].filter(([, x]) => x.st === d0.st).map(([n]) => n);
        if (siblings.every((n) => intraNames.has(n) && !external.has(n))) text = setExport(text, m, name, false);
      }
```

- [ ] **Step 4: The data-block move.** Replace the refusal `a data block does not move` in `move` with: when the declaration lies
  inside a data block, refuse unless every other line of the block (between its markers) is blank or a `//` comment; otherwise
  the moved chunk is the block from its begin marker to its end marker, extended upward over the contiguous `//` lines above the
  begin marker (stopping at another data marker and never taking a purpose comment on line 1), and it is used in place of
  `chunkOf(...)`. The rehearsed code:

```js
    let blockChunk = null;
    if (block) {
      const ls = fromText.split('\n');
      const alone = ls.slice(block.begin, block.end - 1).every((l, k) => { const ln = block.begin + 1 + k; return (ln >= st.loc.start.line && ln <= st.loc.end.line) || /^\s*(\/\/.*)?$/.test(l); });
      if (!alone) refuse(`${name} lies inside the data block ${block.name} in ${from} (lines ${block.begin}-${block.end}) with other statements; a data block moves only with its one declaration`);
      let s0 = block.begin;
      while (s0 > 1 && /^\s*\/\//.test(ls[s0 - 2]) && !DATA_MARK.test(ls[s0 - 2])) s0--;
      if (s0 === 1 && purposeLines(fromText) === 2) s0 = 3;
      blockChunk = { start: s0, end: block.end, lines: ls.slice(s0 - 1, block.end) };
    }
```

  and `const chunk = blockChunk || chunkOf(fromText, from, st, shape.ast);`. Update the header's `move` line to say a data block's
  only declaration moves with its block.
- [ ] **Step 5: Open items.** Add `'docs/superpowers/inventory/stage4-open-items.md'` to `OUTSIDE`; name it in the header's
  "Outside src/" sentence. In `stage4-open-items.md`, write out the brace-form paths of modules the maps move, so the tool can
  follow them: line 82 `src/{us,canada}/core/analyze-shortfall-drivers.js`, line 113 `src/{us,canada}/ui/sensitivity.js` and
  `src/{us,canada}/ui/pension-buttons.js`, line 118 `src/{us,canada}/ui/dynamic-lists.js` (each becomes `src/us/... and
  src/canada/...`; `src/{us,canada}/main.js` does not move). Include this file in the commit.
- [ ] **Step 6: Verify.** `node tests/regroup_modules.js` → passes; `npm test` → exit 0.
- [ ] **Step 7: Commit.**

```bash
git add scripts/lib/regroup.js tests/regroup_modules.js docs/superpowers/inventory/stage4-open-items.md
git commit -m "Regroup: a merge keeps a grouped declaration's export another module needs; a data block's only declaration moves with its block; stage4-open-items.md paths follow renames and merges"
```

### Task 3: Apply the core maps (six batches)

**Files:**
- Modify (by the tool and the generators only): `src/**/core/**`, `tests/state_modules.js`, `CLAUDE.md` (paths),
  `docs/superpowers/inventory/*.md`, `docs/state-tax-rules.md`, `docs/province-tax-rules.md`, `docs/benefits-rules.md`

- [ ] **Step 1: Check the maps still apply.** `git diff --stat 9aece4a HEAD -- src` → empty output. Otherwise regenerate
  (Global Constraints) before going on.
- [ ] **Step 2: Build the base tree.** `git worktree add <scratch>/regroup-base HEAD`, then in it `npm ci && npm run build`.
  `<scratch>` is the session's scratchpad (never inside the repo). Every comparison in Tasks 3-4 uses `--base <scratch>/regroup-base`.
- [ ] **Step 3: For each batch in order** (`core-regroup-1-us-split`, `2-canada-split`, `3-shared-split`, `4-us-folders`,
  `5-canada-folders`, `6-shared-folders`):
  - `node scripts/regroup-modules.js --map scripts/extractions/<batch>.json --dry-run` → last line
    `[dry run] regroup: <ops> operations, ...` with ops 84, 18, 6, 32, 20, 18. Then the same without `--dry-run`.
  - Run every `regenerate: npm run <script>` the tool printed. Expected: batch 2 `gen:benefits` (`BENEFIT_RULES` moves),
    batch 4 `gen:states`, batch 5 `gen:provinces`; batches 1, 3 and 6 none.
  - `npm run analyze`, then `npm run build`.
  - `node scripts/compare-builds.js --base <scratch>/regroup-base --ordered` → both planners `missing from head 0, new in head 0`.
  - `npm test` → exit 0.
  - Commit: `git add -A src tests/state_modules.js CLAUDE.md docs` then
    `git commit -m "Core regroup batch <n>/6: <what> (scripts/extractions/<batch>.json; no behavior change)"` with `<what>`:
    1 "the US mixed modules split by topic", 2 "the Canada ones", 3 "the shared ones", 4-6 "US / Canada / shared core/ modules into
    topic folders".
- [ ] **Step 4: Check the result.** `find src/shared/core src/us/core src/canada/core -name '*.js' ! -name 'seam-*' | wc -l` → 85
  (shared 22, US 41, Canada 22). No `-<digits>.js` module; directly in a `core/` only the state modules of Global Constraints and
  the facades; `src/canada/core/benefits/benefit-rules.js` holds `BENEFIT_RULES` and `npm run gen:benefits -- --check` passes.

### Task 4: Purpose comments and load-time markers for core/

**Files:**
- Modify: every non-facade module under `src/**/core/` (comments only), `scripts/module-map.js`, `tests/ui_cycles.js`,
  `scripts/lib/regroup.js` (~line 707), `tests/module_map.js`

- [ ] **Step 1: Guards first.** `scripts/module-map.js`: the purpose offender test becomes `(isUi(rel) || isCore(rel)) && !isFacade(rel)`;
  its `--require-purpose` message and header say "core/ and ui/ modules". `tests/ui_cycles.js` and `scripts/lib/regroup.js` (~707):
  the load-time check runs on every `core/` module too (`isUi(f) || isCore(f)`; `core/` modules are never in a cycle, so they get
  the non-cycle rule); update `tests/ui_cycles.js`'s header comment. Fixtures: `tests/module_map.js`, a `src/us/core/tax/x.js`
  without a purpose is an offender; `tests/ui_cycles.js`, a `src/us/core/x.js` with `export const v = f();` unmarked is reported,
  and passes with a `// load-time: <reason>` line directly above it.
- [ ] **Step 2: Run the guards.** `npm run analyze; node scripts/module-map.js --check --require-purpose` → FAIL listing the core
  modules without a purpose (expected 84: every core module except `src/us/core/optimizer-state.js`);
  `npm run build && node tests/ui_cycles.js` → FAIL listing 33 core initializers (`not inert and not marked`).
- [ ] **Step 3: Purpose comments (before the markers).** Line 1 of every listed module: `// <one line saying what the module holds>`
  (40-110 characters, the style of the `ui/` modules), line 2 blank. Six state modules (`store.js`, `chart-prefs.js`,
  `tax-factors.js`, `tax-year.js`, `cliff-plan-store.js`, `test-hooks.js`) start with a multi-line header: insert the one-line
  purpose and a blank line above it and keep the header as it is. `projection/engine-state.js`'s purpose names what it holds (the
  MAGI iteration limits, the run counters `magiStats` / `planStats` and the cliff-plan cache). `npm run analyze` then
  `node scripts/module-map.js --check --require-purpose` → passes.
- [ ] **Step 4: Markers.** For each listed initializer, the first line of the contiguous `//` comment block directly above the
  declaration becomes `// load-time: <reason>` (insert it as a new first line of that block; with no block, the marker is the
  block). One marker above a statement covers all its declarators (`SOLO_P` / `SOLO_GOT`, the four `SOURCES_*`). The reason says
  what the initializer computes and that it reads only literals, globals or earlier constants (for example
  `// load-time: freezes a literal list; reads nothing`). Where the comment above sits under a `// NAME:begin` line, the marker
  goes at the top of the block's own comment, never between a data marker and the line after it. Rerun
  `npm run build && node tests/ui_cycles.js` → passes.
- [ ] **Step 5: Verify.** `npm run build`, `node scripts/compare-builds.js --base <scratch>/regroup-base --ordered` (comments are not
  statements: `missing from head 0, new in head 0`), `npm test` → exit 0. Then `git worktree remove <scratch>/regroup-base`.
- [ ] **Step 6: Commit.**

```bash
git add -A src scripts tests docs
git commit -m "Core modules: purpose comments and load-time markers; module map and load-time guard cover core/"
```

### Task 5: Docs for the core regroup (end of the first PR)

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/superpowers/inventory/stage4-open-items.md`

- [ ] **Step 1: CLAUDE.md.**
  - "Modules, the entry point and the tools": replace the sentences about modules named after their first unit and the
    one-unit modules (stage 3's "about 29 of the 38 modules hold one unit") with: `core/` and `ui/` are split into topic folders
    (this regroup, 2026-10); a file is named by content; `scripts/plan-regroup.js` and the regroup tool are how modules move.
  - "Shared state and country seams": the state modules now sit at the top of their `core/` beside the facades; list them
    (Global Constraints) and say every other `core/` module is in a topic folder.
  - A new section `## Where new code goes`, right before `## Adding UI code`: one line per `core/` folder and what belongs in it,
    for shared / US / Canada (read the folders with `find src/*/core -mindepth 1 -maxdepth 1 -type d`): `tax/` (federal rules,
    the tax functions, Social Security taxation, state tax and `STATE_RULES` (US); tax rules, `PROVINCE_RULES` and the tax
    functions (Canada)), `benefits/` (Canada: `BENEFIT_RULES` and `benefitsFor`), `healthcare/` (US: ACA, Medicaid, IRMAA, 162(l)),
    `income/` (the per-year stages: contributions, streams, Social Security / CPP and OAS, pensions, distributions, housing,
    `buildTaxProfile`; Canada's flat `healthcareCost` is in `income/year-stages.js`), `accounts/` (US ledgers, penalty status),
    `withdrawals/`, `cliff-plan/` (US), `projection/` (the engine, year sources and factors, the historical data, guardrails,
    simulate), `optimizer/` (US), `inputs/`, `analysis/`, `format/` (shared). Then the rules: state modules and facades stay at the
    top of `core/`; a new topic gets a new folder only when no existing one fits; no `core` or `ui` folder inside a side
    (`tests/src_paths.js`).
  - "Adding UI code": the "Initializers" bullet also applies to `core/` modules (one sentence); "A new topic" says "in its topic
    folder".
  - `node tests/doc_paths.js` → passes (the tool rewrote the paths).
- [ ] **Step 2: README.md** "Files": `core/` and `ui/` are organized in topic folders; name the `core/` folders in one sentence.
- [ ] **Step 3: Open items.** The tool rewrote the paths in `stage4-open-items.md`, which changes what some lines claim. Reword,
  then move to "Resolved" with the closing commit: both T17 lines (one definition: Task 1; misleading names: gone, `taxFor` is in
  `src/us/core/tax/federal-tax.js` and `newWithdrawal` in `src/canada/core/withdrawals/draws.js`, Task 3) and the T13 near-twin names
  ruling (`estimate-checks.js` and `estimates-and-warnings.js` are merged into `src/shared/core/inputs/estimates.js`). Read every
  other line whose path changed and correct it where the rewrite made it wrong.
- [ ] **Step 4: Verify.** `npm test` → exit 0.
- [ ] **Step 5: Commit.**

```bash
git add CLAUDE.md README.md docs/superpowers/inventory/stage4-open-items.md
git commit -m "Docs: core/ topic folders (where new code goes, state modules), README, T17 and the near-twin names resolved"
```

The first PR ends here (Tasks 1-5).

### Task 6: ui/ topic folders (the second PR)

**Files:**
- Modify (by the tool): `src/**/ui/**`, `CLAUDE.md` (paths), `docs/superpowers/inventory/*.md`; by hand: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Base tree.** As Task 3 step 2, a fresh `<scratch>/regroup-base-ui` worktree of the commit after Task 5, built.
- [ ] **Step 2: Apply.** `node scripts/regroup-modules.js --map scripts/extractions/ui-regroup.json --dry-run` → `regroup: 80 operations`
  (the "import cycles: joined" lines are the render-cycle members reported under their new paths); then without `--dry-run`.
  `npm run analyze`, `npm run build`, `node scripts/compare-builds.js --base <scratch>/regroup-base-ui --ordered` → nothing missing,
  nothing new; `npm test` → exit 0 (the module map now requires a purpose in every `ui/` subfolder; the 80 moved modules keep theirs).
- [ ] **Step 3: Docs.** CLAUDE.md "Where new code goes" gains the `ui/` folders: `charts/`, `inputs/` (the sidebar), `results/` (the
  dashboard), `plans/` (saving and comparing), `layout/` (the app shell), with `install-test-hooks.js`, `wizard.js` and `mcp-tools.js`
  at the top; "Adding UI code" "A new topic" names the folders. README "Files" names the `ui/` folders. Correct any
  `stage4-open-items.md` line the rewrite made wrong. `npm test` → exit 0.
- [ ] **Step 4: Commit and clean up.**

```bash
git add -A src CLAUDE.md README.md docs tests/state_modules.js
git commit -m "ui/ topic folders: charts, inputs, results, plans, layout (scripts/extractions/ui-regroup.json; no behavior change)"
```

  Then `git worktree remove <scratch>/regroup-base-ui`.
