# Docs refresh after the modular build: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The living parts of `docs/reference.md`, `docs/roadmap.md` and `docs/phase2-refactor-plan.md` stop describing
the removed layout (one inline `<script>` per `Planner_*.html` at the repo root, no build step, `@@shared` regions kept
in sync by `scripts/sync-shared.js`) and point at the modular build instead.

**Architecture:** Docs only; no file under `src/`, `scripts/` or `tests/` changes, so the build output and every
snapshot are untouched. Living sections are corrected; dated, chronological sections stay as history and get at most a
one-line update note, the pattern `docs/reference.md` already uses (see its "The `simulate()` / `simulateHistorical()`
duplication trap": a `> **Update (...):**` blockquote under the heading). Headings are never renamed (CLAUDE.md and other
docs cite them by name).

**Tech Stack:** Markdown.

**Spec:** `docs/superpowers/specs/2026-10-10-modular-build-design.md` section 8 ("Documentation workstream"), whose
"Rewritten (living docs)" list names the architecture sections of these three files. CLAUDE.md, README.md,
`package.json`, CI, `index.html` and the generators were already done in stages 0-4.

**Branch:** `claude/next-step` (stacked on `claude/stage4-ui-impl`, PR amacgrog/Fire-Planner#24, unmerged). Do not push.

## Global Constraints

- Docs only. If a step seems to need a code change, stop and report it.
- Owner authorization: CLAUDE.md says not to edit `docs/reference.md` per batch "unless the owner asks"; the owner asked
  for this refresh on 2026-10-21. Say so in the commit message of Task 1.
- Do not touch dated history: in `docs/reference.md`, every section after "Testing checklist for any change" that
  describes a past change (feature write-ups, bug postmortems, "ported to `Planner_Canada.html`", line counts) stays as
  written. `Planner_US.html` / `Planner_Canada.html` named as the file a past change was made in is correct history.
- Current names to use: source in `src/<country>/` (`index.html` shell, `main.js` entry) and `src/shared/`, modules under
  `core/` (no DOM) and `ui/`; `npm run build` / `npm run dev` write `dist/Planner_US.html` / `dist/Planner_Canada.html`;
  `docs/superpowers/inventory/module-map.md` lists every module; find a function with `grep -rn "function X" src`.
- Point at CLAUDE.md for the current file list and architecture rather than duplicating it (one source of truth).
- No version-badge bump: nothing user-facing changes.
- Prose style: plain, short sentences, matching the surrounding text.

## Review Focus

- A reader landing in `docs/reference.md` from a search must not follow a recipe that no longer works (the
  `<script>`-regex syntax check, "syntax-check both `.html` files"). Task 1 step 4 greps for both.
- An update note must not contradict CLAUDE.md (for example, claim `runProjection` is shared: the two year loops are
  per-country). Task 1 step 5 compares each note with the CLAUDE.md bullet it summarizes.
- `docs/roadmap.md` must not read as if the refactor is still open or as if "no build step" is still a constraint.
  Task 2 step 3 greps for it.
- A path named in new text must exist on disk. Task 3 step 2 checks every `src/`, `scripts/`, `tests/` and `docs/` path
  added by this plan.
- `tests/doc_paths.js` covers only CLAUDE.md and the inventory, so it does not protect these files; Task 3 step 2 is
  the substitute.

---

### Task 1: `docs/reference.md`

**Files:**
- Modify: `docs/reference.md` (lines 1-37 intro, "What this is", "Files"; line 38 "Architecture, per planner file";
  ~836-878 duplication trap step 3; ~3473 "Testing checklist for any change" item 2; ~6684 "Phase 2 step 4: shared
  regions between the planners")

- [ ] **Step 1: Intro paragraph (lines 3-6).** Keep it; add one sentence: sections are chronological, so file names and
  layout in older sections describe the code as it was then; the current layout is in CLAUDE.md ("Files", "Modules and
  the extraction tool").

- [ ] **Step 2: Replace "What this is" and "Files" (lines 8-37).** "What this is": same first sentence, then the current
  facts (source in `src/`, esbuild build to one self-contained file per planner in `dist/`, no server or network at
  runtime, GitHub Pages from CI) and "see `README.md` for features, CLAUDE.md for the layout". "Files": a short list
  that defers to CLAUDE.md's "Files" for the full list, keeping only what this file adds: `test_*.js` at the repo root are
  ad-hoc Playwright scripts, not in `npm test` or CI, that open the built `dist/*.html` from `file://` and assert against
  live DOM/state; add or extend one with each feature and run it (keep that advice, drop "the only test wired into CI").

- [ ] **Step 3: Update notes.** Add a `> **Update (modular build, stages 0-4, 2026-10):**` blockquote under each heading:
  - "Architecture, per planner file" (line 38): each planner is no longer one IIFE; the units below now live in modules
    under `src/<country>/core|ui/` and `src/shared/core|ui/`, `main.js` only calls the start-up functions; find a unit
    with `grep -rn "function X" src` or `docs/superpowers/inventory/module-map.md`; the descriptions of what each unit
    does still hold unless a later section says otherwise; CLAUDE.md's "Architecture, per planner file" is current.
    Change "Each planner is one big IIFE." to past tense ("Each planner was one big IIFE.") so the body is not read as
    current.
  - Duplication trap, step 3 (the `new Function` snippet): add the note directly above the snippet: it applies to the old
    single-file layout; today use `node --check` on a plain-JS source file (`node --check src/us/main.js`), or
    `npm run build` (esbuild fails on a syntax error), then load the built file in Playwright and watch `pageerror`.
    Leave the snippet itself as history.
  - "Phase 2 step 4: shared regions between the planners": superseded; the regions were dissolved into modules in
    stages 2-4, and `scripts/sync-shared.js` and the last marker were removed in Stage 4; `tests/no_markers.js` keeps
    markers out of `src/`; see `docs/superpowers/specs/2026-10-10-modular-build-design.md`. The engine decision in that
    section (the two `runProjection` year loops stay per-country) still holds: say so.

- [ ] **Step 4: "Testing checklist for any change" (~line 3473).** Replace item 2 ("Syntax-check both `.html` files (see
  snippet above)") with "`npm test` builds first; for a single-script run, `npm run build` first (or keep `npm run dev`
  running), since `node tests/x.js` and `node test_foo.js` read whatever `dist/` holds." Then verify:

  Run: `grep -n "Syntax-check both\|matchAll(/<script>" docs/reference.md`
  Expected: only the snippet line inside the duplication trap, with the Step 3 note directly above it.

- [ ] **Step 5: Consistency read.** Re-read each note against the CLAUDE.md bullet it summarizes ("Files", "Shared code
  between the planners", "Modules and the extraction tool", "Commands"). Expected: no contradiction (the year loops
  stay per-country; tests must never regex-match `dist/*.html` source text).

- [ ] **Step 6: Commit.**

```bash
git add docs/reference.md
git commit -m "Docs: reference.md describes the modular build (intro, files, update notes, testing checklist); edited at the owner's request outside the batch-notes rule"
```

### Task 2: `docs/roadmap.md` and `docs/phase2-refactor-plan.md`

**Files:**
- Modify: `docs/roadmap.md` (line 78, lines 86-87, new section after "Phase 2: refactor")
- Modify: `docs/phase2-refactor-plan.md` (top of file; section 4 option table, ~line 284)

- [ ] **Step 1: `docs/roadmap.md`.**
  - Line 78: "item 4 is shared regions kept in sync by `scripts/sync-shared.js`" becomes "item 4 was shared regions kept
    in sync by `scripts/sync-shared.js`, later replaced by the modular build (below)".
  - Item 4 (lines 86-87, "files stay self-contained; no build step"): append "(superseded: the source is now modules
    built into one self-contained file per planner; see below)".
  - New section right after "Phase 2: refactor", headed `## Modular build (stages 0-4) — done`: two to four lines:
    the source moved to `src/` with an esbuild build to `dist/` (spec
    `docs/superpowers/specs/2026-10-10-modular-build-design.md`, Stage 4 spec
    `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`); no behavior change; follow-ups in order: the core regroup
    (prerequisites in `docs/superpowers/inventory/stage4-open-items.md`, T17), Vitest unit tests for `core/`, then the
    parent design's section 11 future work. Do not mark Stage 4 merged; write "Stage 4 in review (PR #24)" and leave the
    merge date to the owner, as the parent design does.
  - Leave the rest of the roadmap (the batch list and its status) alone: refreshing the feature plan is out of scope.

- [ ] **Step 2: `docs/phase2-refactor-plan.md`.** Add one status line under the title: this plan is a record of Phase 2;
  its step 4 (shared regions, option A) was later replaced by option B, a `src/` tree with a bundler, in the modular
  build (`docs/superpowers/specs/2026-10-10-modular-build-design.md`), and `scripts/sync-shared.js` no longer exists. In
  the option table, add to row B's last cell: "(adopted later; see the status note at the top)". Change nothing else.

- [ ] **Step 3: Verify.**

  Run: `grep -n "no build step\|sync-shared" docs/roadmap.md docs/phase2-refactor-plan.md`
  Expected: every hit is either inside the record of Phase 2 or on a line that now says it was replaced or superseded.

- [ ] **Step 4: Commit.**

```bash
git add docs/roadmap.md docs/phase2-refactor-plan.md
git commit -m "Docs: roadmap and Phase 2 plan point at the modular build"
```

### Task 3: Close the documentation workstream

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-modular-build-design.md` (section 8)

- [ ] **Step 1: Mark section 8 done.** Add one line at the end of section 8: the living-doc rewrites were finished on
  2026-10-21 (`docs/reference.md`, `docs/roadmap.md`, `docs/phase2-refactor-plan.md`; plan
  `docs/superpowers/plans/2026-10-21-docs-refresh.md`); the memory items are covered by CLAUDE.md (no separate memory
  is needed, since the repo records the layout).

- [ ] **Step 2: Path check.** Every path this plan's edits added must exist.

  Run: `git diff origin/claude/stage4-ui-impl --unified=0 -- docs ':!docs/superpowers/plans' | grep "^+" | grep -o "\(src\|scripts\|tests\|docs\)/[A-Za-z0-9_./{},-]*" | sort -u`
  Then check each listed path exists (expand `{a,b}`; skip `<country>` placeholders, `core|ui` alternations and the
  generic examples `tests/x.js` / `test_foo.js`).
  Expected: all exist.

- [ ] **Step 3: Suite.** Run `npm ci` if `node_modules` is missing, then `npm test`.
  Expected: exit 0 (docs-only change; this confirms `tests/doc_paths.js` and the generators' `--check` modes still pass).

- [ ] **Step 4: README check (no edit expected).** `README.md` "Files" and "Making an update" already describe `src/`,
  `dist/` and the modules. Run `grep -n "sync-shared\|@@shared\|npm run sync\|no build step" README.md`.
  Expected: no output. If there is output, fix that line and include it in this commit.

- [ ] **Step 5: Commit.**

```bash
git add docs/superpowers/specs/2026-10-10-modular-build-design.md
git commit -m "Docs: modular build design section 8 (documentation workstream) done"
```
