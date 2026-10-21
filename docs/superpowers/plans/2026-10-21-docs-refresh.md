# Docs refresh after the modular build: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The living parts of `docs/reference.md`, `docs/roadmap.md`, `docs/phase2-refactor-plan.md` and
`docs/next-batches-plan.md` stop describing the removed layout (one inline `<script>` per `Planner_*.html` at the repo
root, no build step, `@@shared` regions kept in sync by `scripts/sync-shared.js`) and point at the modular build;
`docs/roadmap.md` and the process sections of `docs/next-batches-plan.md` also get their status brought up to date.

**Architecture:** Docs only; no file under `src/`, `scripts/` or `tests/` changes, so the build output and every
snapshot are untouched. Living sections are corrected; dated, chronological sections stay as history and get at most a
one-line update note, the pattern `docs/reference.md` already uses (see its "The `simulate()` / `simulateHistorical()`
duplication trap": a `> **Update (...):**` blockquote under the heading). Headings are never renamed (CLAUDE.md and other
docs cite them by name).

**Tech Stack:** Markdown.

**Spec:** `docs/superpowers/specs/2026-10-10-modular-build-design.md` section 8 ("Documentation workstream"), whose
"Rewritten (living docs)" list names the architecture sections of `reference.md`, `roadmap.md` and
`phase2-refactor-plan.md`. CLAUDE.md, README.md, `package.json`, CI, `index.html` and the generators were already done in
stages 0-4. The status facts below come from the owner (2026-10-21).

**Branch:** `claude/next-step`, cut from `claude/stage4-ui-impl` (PR amacgrog/Fire-Planner#24). The owner is merging #24
into `main`; if it has merged when execution starts, first `git fetch` and `git rebase origin/main` (the branch holds only
docs commits; never `git stash`). Do not push.

## Global Constraints

- Docs only. If a step seems to need a code change, stop and report it.
- Owner authorization: CLAUDE.md says not to edit `docs/reference.md` per batch "unless the owner asks"; the owner asked
  for this refresh on 2026-10-21. Say so in the commit message of Task 1.
- Do not touch dated history: in `docs/reference.md`, every section after "Testing checklist for any change" that
  describes a past change (feature write-ups, bug postmortems, "ported to `Planner_Canada.html`", line counts) stays as
  written; in `docs/next-batches-plan.md`, every "Batch notes" section and every struck-through item stays as written.
  `Planner_US.html` / `Planner_Canada.html` named as the file a past change was made in is correct history.
- Current names to use: source in `src/<country>/` (`index.html` shell, `main.js` entry) and `src/shared/`, modules under
  `core/` (no DOM) and `ui/`; country code reached from shared code through `#country/core/seam-<name>` (and
  `#country/ui/seam-<name>`); `npm run build` / `npm run dev` write `dist/Planner_US.html` / `dist/Planner_Canada.html`;
  `docs/superpowers/inventory/module-map.md` lists every module; find a function with `grep -rn "function X" src`.
- Point at CLAUDE.md for the current file list and architecture rather than duplicating it (one source of truth).
- Owner facts (2026-10-21), used wherever status is written:
  - Merged into `main`: Batches 1, 2, 3 (3A, 3B, 3C as the cliff plan), 7 (7A-7O and follow-ups), the IRMAA MAGI fix,
    Batch E through E3 (E1a-E1e, E2, E3); US V130 / Canada V60.
  - Then the modular-build refactor, stages 0-4, all done; Stage 4 is merged into `main` by PR #24 (write "merged by
    PR #24" and leave the date to the owner, as the parent design does). Not "in review".
  - Batch E stopped after E3 to do the refactor; E4 (state relocation) is pending.
  - Order from here (owner, 2026-10-21): every refactor item comes before E4. The refactor track, in order: (1) this
    docs refresh, (2) the core regroup, (3) Vitest unit tests for `core/`, then the parent design's section 11 items:
    (4) stateless engine, (5) TypeScript, (6) centralized state writes, (7) Vite hot reload, (8) merging the US and
    Canada engines. Then the feature batches E4 -> 5 -> 4A -> 4B -> 6 -> 8. E5 (real assets) and the Canada province
    move later. Items 4-8 are ordered by dependency (the stateless engine's ratchet tests need Vitest; TypeScript is
    easier on explicit inputs; merging the engines is the largest and goes last); each gets its own design before it
    starts, and the owner may reorder them. Say both of those in the docs.
  - Every PR goes to `main`; work branches are cut from `main`.
- No version-badge bump: nothing user-facing changes.
- Prose style: plain, short sentences, matching the surrounding text.

## Review Focus

- A reader landing in `docs/reference.md` from a search must not follow a recipe that no longer works (the
  `<script>`-regex syntax check, "syntax-check both `.html` files"). Task 1 step 4 greps for both.
- An update note must not contradict CLAUDE.md (for example, claim `runProjection` is shared: the two year loops are
  per-country). Task 1 step 5 compares each note with the CLAUDE.md bullet it summarizes.
- A future batch session reading `docs/next-batches-plan.md` must not be told to sync a `shared/` fragment or to open a PR
  into `claude/tender-meitner-a3bo59`. Task 3 step 3 greps for both.
- `docs/roadmap.md` and `docs/next-batches-plan.md` must agree on the remaining order and on what is done. Task 3 step 4
  compares them.
- A path named in new text must exist on disk; `tests/doc_paths.js` covers only CLAUDE.md and the inventory, so Task 4
  step 2 is the check for these files.

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

### Task 2: `docs/roadmap.md` becomes a status page

`docs/next-batches-plan.md` holds the detailed plan and the live order; the roadmap says what is done, what is open and
where to look, and keeps its Phase 0-2 history.

**Files:**
- Modify: `docs/roadmap.md` (header lines 3-10; "Current plan" lines 12-46; "Phase 2: refactor" lines 77-87; "Phase 3:
  remaining items" lines 89-110; "After Phase 2" lines 112-143)

- [ ] **Step 1: Header (lines 3-10).** Replace the "as of 2026-10-02" status with: as of 2026-10-21, everything listed
  as merged in Global Constraints is on `main` (US V130 / Canada V60); every PR goes to `main`; the detailed plan and the
  live order are `docs/next-batches-plan.md`.

- [ ] **Step 2: "Current plan" (lines 12-46).** Rewrite the body (keep the heading):
  - Drop "one PR into `claude/tender-meitner-a3bo59`"; say each batch or sub-batch is one PR into `main`, reviewed by the
    owner before the next starts.
  - Done: 1, 2, 3A, 3B, 3C (redesigned as the cliff plan, spec `docs/superpowers/specs/2026-10-07-cliff-plan-design.md`),
    7 (7A-7O), the IRMAA MAGI fix, E1-E3. One line each, short.
  - Next, in order: first the refactor track of Global Constraints, items 1-8 (the core regroup with its prerequisites in
    `docs/superpowers/inventory/stage4-open-items.md`, T17; the section 11 items described as in
    `docs/superpowers/specs/2026-10-10-modular-build-design.md` section 11), then E4 (state relocation), 5 (optimizer),
    4A, 4B (Canada), 6 (Social Security and others), 8 (survivor claim optimizer). Keep each batch's existing one-line
    scope.
  - Later, not scheduled: E5 (real assets) and the Canada province move.
  - Keep the documentation paragraph (reference.md updated once after the last batch).
  - "Not modeled by decision": remove "medical" (7O O2 deducts medical expenses over 7.5% of AGI) and change "local income
    taxes" to "local income taxes (except a flat county rate for MD and IN, 7D)". Keep the rest.

- [ ] **Step 3: "Phase 2: refactor" (lines 77-87).** Line 78: "item 4 is shared regions kept in sync by
  `scripts/sync-shared.js`" becomes "item 4 was shared regions kept in sync by `scripts/sync-shared.js`, later replaced by
  the modular build (below)". Item 4 (lines 86-87): append "(superseded by the modular build)". Then add, right after this
  section, `## Modular build (stages 0-4) — done`: two to four lines: the source moved to `src/` with an esbuild build to
  `dist/` and GitHub Pages from CI; no behavior change; specs `docs/superpowers/specs/2026-10-10-modular-build-design.md`
  and `docs/superpowers/specs/2026-10-15-stage4-ui-design.md`; Stage 4 merged by PR #24; follow-ups in "Current plan".

- [ ] **Step 4: "Phase 3: remaining items" and "After Phase 2".** Keep each bullet's text and add a status to its first
  line (`**Done (Batch N).**`, `**Superseded (...)**` or `**Open: Batch N.**`):
  - Phase 3: Medicare enrollment, done (Batch 2); optimizer, open (Batch 5); itemized and age-based deductions, done
    (Batch 2; medical in 7O); state-tax scope, done in part (7C/7D: each state's notes show under the selector; local taxes
    as in Step 2); Social Security, open (Batch 6); HSA, open (Batch 6); Canada: age and pension credits done (7J),
    CPP/OAS claim ages open (Batch 6).
  - After Phase 2: historical parity, done (Batch 1); gradual bond refill, done (Batch 1); penalty-aware mixed
    withdrawals, done (3B); safe-MAGI room on every path, superseded by the cliff plan (3C); Canada mixed withdrawals,
    open (4A).
  - Before writing each status, confirm it with a grep of `docs/next-batches-plan.md` or CLAUDE.md for the named feature
    (for example `grep -n "HSA" docs/next-batches-plan.md`); if the source disagrees with this list, write what the source
    says and report the difference.

- [ ] **Step 5: Verify.**

  Run: `grep -n "tender-meitner\|no build step\|sync-shared\|as of 2026-10-02" docs/roadmap.md`
  Expected: only the Phase 2 history lines from Step 3, each saying it was replaced or superseded.

- [ ] **Step 6: Commit.**

```bash
git add docs/roadmap.md
git commit -m "Docs: roadmap.md is a status page (done, open, next order, the refactor track; PRs go to main)"
```

### Task 3: `docs/next-batches-plan.md` and `docs/phase2-refactor-plan.md`

**Files:**
- Modify: `docs/next-batches-plan.md` (lines 1-6 header, 11-23 "Review gate", 99-137 "Execution order", 160 "Ground
  rules", 189-221 "What the engine looks like now", 2809-2867 Batch 4, ~3782 "Final step", ~7336 "Open items")
- Modify: `docs/phase2-refactor-plan.md` (top of file; section 4 option table, ~line 284)

- [ ] **Step 1: Process sections of `docs/next-batches-plan.md`.**
  - Header (lines 3-6): add one line under it: the branch named there is history; every PR now goes to `main` (owner,
    2026-10-21).
  - "Review gate": replace "one pull request into `claude/tender-meitner-a3bo59`, never into `main`" with one PR into
    `main`; replace the working-branch bullet (reset to the `tender-meitner` tip, `claude/dazzling-thompson-rp3l5j`) with:
    each batch's branch is cut from `main` after the previous PR merges. Keep the other two bullets.
  - "Execution order": add a dated paragraph at the end, `**Revised 2026-10-21 (owner):**`: Batch E stopped after E3 to
    do the modular-build refactor (stages 0-4, merged); the whole refactor track comes next (docs refresh, core
    regroup, Vitest for `core/`, then stateless engine, TypeScript, centralized state writes, Vite, merging the engines;
    see `docs/roadmap.md`), then E4 -> 5 -> 4A -> 4B -> 6 -> 8, with E5 and the Canada move later. Add that merging the
    engines lands before E4, so E4 and later batches are written against the merged engine.
    Leave the earlier paragraphs as the record.

- [ ] **Step 2: Layout fixes in `docs/next-batches-plan.md`.**
  - "Ground rules", line 160: replace the bullet with: shared code lives in modules under `src/shared/core|ui/` and is
    imported by both planners; country code under `src/<country>/core|ui/`, reached from shared code through
    `#country/core/seam-<name>`; edit `src/`, never `dist/`; `npm test` builds first; details in CLAUDE.md ("Modules and
    the extraction tool", "Shared state and country seams").
  - "What the engine looks like now": add an update note under the heading: these facts date from the start of the plan
    (2026-10-03); line numbers and the mode switches listed are gone, and the standard deduction was centralized in
    Batch 2; CLAUDE.md "Architecture, per planner file" is current. Do not rewrite the bullets.
  - Batch 4, lines 2809, 2821, 2827 and 2867: "a `shared/` fragment" becomes "a module under `src/shared/core/`" and
    "can live in `shared/`" becomes "can live in `src/shared/core/`"; where the text says Canada supplies its own hook,
    add that the shared module reaches it through a `#country/core/seam-<name>` facade (CLAUDE.md, "The country seam").
    Change nothing else in Batch 4.
  - "Open items", ~line 7336: "the shared `24-syncContributionControls` number listener" becomes the module that now
    attaches the `rothIraBasisA/B` number input listener (find it: `grep -rn "addEventListener('input'" src/shared/ui`
    and follow the `FIELDS` number wiring; name the file path).
  - "Final step: consolidate into `docs/reference.md`" (~3782): add one line: the intro, "Files", the update notes and the
    testing checklist of `docs/reference.md` were refreshed for the modular build on 2026-10-21
    (`docs/superpowers/plans/2026-10-21-docs-refresh.md`); the consolidation keeps them.

- [ ] **Step 3: `docs/phase2-refactor-plan.md`.** Add one status line under the title: this plan is a record of Phase 2;
  its step 4 (shared regions, option A) was later replaced by option B, a `src/` tree with a bundler, in the modular
  build (`docs/superpowers/specs/2026-10-10-modular-build-design.md`), and `scripts/sync-shared.js` no longer exists. In
  the option table, add to row B's last cell: "(adopted later; see the status note at the top)". Change nothing else.

- [ ] **Step 4: Verify.**

  Run: `grep -n "shared/\` fragment\|sync-shared\|tender-meitner\|24-syncContributionControls" docs/next-batches-plan.md`
  Expected: hits only in "Batch notes" sections, struck-through items, the header's history line, and the "Execution
  order" paragraphs kept as the record (none in "Review gate", "Ground rules", Batch 4 or "Open items").

  Then read the remaining order in `docs/next-batches-plan.md` ("Execution order", the 2026-10-21 paragraph) and in
  `docs/roadmap.md` ("Current plan"). Expected: the same order in both: refactor items 1-8 of Global Constraints, then E4
  first among the feature batches.

- [ ] **Step 5: Commit.**

```bash
git add docs/next-batches-plan.md docs/phase2-refactor-plan.md
git commit -m "Docs: next-batches-plan (PRs to main, order from E4, src/ layout in ground rules and Batch 4) and the Phase 2 plan's status note"
```

### Task 4: Close the documentation workstream

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-modular-build-design.md` (section 8)

- [ ] **Step 1: Mark section 8 done.** Add one line at the end of section 8: the living-doc rewrites were finished on
  2026-10-21 (`docs/reference.md`, `docs/roadmap.md`, `docs/phase2-refactor-plan.md`, plus `docs/next-batches-plan.md`;
  plan `docs/superpowers/plans/2026-10-21-docs-refresh.md`); the memory items are covered by CLAUDE.md (no separate
  memory is needed, since the repo records the layout). Also add one line at the top of section 11: scheduled
  2026-10-21 (owner): all five items run, in the order of `docs/roadmap.md`, after the core regroup and Vitest and before
  feature batch E4; each gets its own design. Leave section 1's non-goals as they are (they scope this refactor, and the
  merge is a later project, which is still true).

- [ ] **Step 2: Path check.** Every path this plan's edits added must exist.

  Run: `BASE=$(git log --format=%H -1 --grep='^Plan: docs refresh')~1; git diff $BASE --unified=0 -- docs ':!docs/superpowers/plans' | grep "^+" | grep -o "\(src\|scripts\|tests\|docs\)/[A-Za-z0-9_./{},-]*" | sort -u`
  Then check each listed path exists (expand `{a,b}`; skip `<country>` / `<name>` placeholders, `core|ui` alternations
  and the generic examples `tests/x.js` / `test_foo.js`).
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
