# Slim CLAUDE.md: proposed outline (roadmap prep item 1)

Status: proposal for the owner's review. Nothing has moved yet.

Today `CLAUDE.md` is 176,056 bytes. Section sizes: Architecture, per planner file 66.8 KB; US vs. Canada 29.0 KB;
Files 22.4 KB; Add-as-you-go lists 17.6 KB; Modules, the entry point and the tools 12.1 KB; Shared state and country
seams 4.4 KB; Where new code goes 4.0 KB; Where a new test goes 3.9 KB; Commands 3.2 KB; Adding UI code 2.4 KB; the
eight small sections together 8.7 KB.

## Rules for the move

- **Move, not rewrite.** Each feature write-up moves nearly verbatim to one file under `docs/architecture/`. Only
  sentence-level edits: a heading per former bullet, and the cuts listed at the end.
- **One home per fact.** A fact lives in exactly one topic file, or in CLAUDE.md. CLAUDE.md may carry a one-line
  *rule* whose background lives in a topic file (for example "a new mutable ledger goes into the MAGI snapshot
  in the same commit"); that is the only duplication, and every such line names its topic file.
- **Coverage check.** A scratch script splits old CLAUDE.md into sentences (normalized whitespace and backticks)
  and reports each one not found in new CLAUDE.md + `docs/architecture/*.md`. Every reported sentence must be on
  one of three lists I hand you with the result: *cut as history* (below), *condensed into a CLAUDE.md rule* (with
  the rule's text), or *edited in place* (old and new text). The script is not committed.

## New CLAUDE.md (target about 20 KB; estimate 21-23 KB)

| Section | Content | Est. |
|---|---|---|
| What this is | today's section, less the pre-stage-4 `@@shared` history sentence (moves to `module-system.md`) | 1.0 KB |
| Layout | the src/ layout bullets of "Files" (`src/<country>/`, `src/shared/`, styles and partials, `scripts/build.js`, stable filenames, `index.html` landing template, `docs/reference.md`), shortened to the layout facts | 1.5 KB |
| Commands | today's section nearly whole (Node version, `npm test`, `test:unit*`, `analyze`, `build`/`dev`, `dist/` renames identifiers so never regex `dist/`, single-script runs read `dist/`, syntax check, no lint, CI) | 3.0 KB |
| Invariants that cause silent bugs | one line each, with the topic file named: engine reads only `ctx`, takes `ctx` first, never writes its inputs, never imports a store module; **one context shape** (`newRunContext` / `storeRunContext`, never a literal, never a module-level "current context"); variants run on copies, never mutate or deep-copy; module-level mutables in engine modules are registered in `tests/engine-purity.json`; memos keyed on every input, same double; **MAGI snapshot rules** (mutated scalars in `scalarSnapshot`, new ledgers in clone/restore, no `continue`/`break` meant for the year loop, new MAGI readers use `magiBase`); **`seOn`** on every profile that reaches `taxFor`, E1c terms skipped not zeroed; **`needsPerPerson`** for any mechanism reading a per-person source, `stateIncomeTax` keeps nothing from `sources`, state before federal; scratch objects (`BEN`, `PAY`, `OAS_RECOVERY`, `PROV_TAX`, ...) read right after the call; `dependentsInYear` result never mutated, a missing `dependents` is none; survivor remap into slot A; never `filing === 'mfj'`; no historical-only fork of the year loop, add a mode switch; per-year rules go in the matching helper; a draw path honouring `magiCapLeft` adds to `cappableTraditional`; a path that mutates `state` in place calls `render()`; `normalizeState` enum guards and explicit deletion of retired keys; hot paths allocate nothing per year; loan payments from the original principal and term | 5.0 KB |
| State and the sanctioned writes | `assign<Name>` rule; the list of sanctioned `state` writers (from "Who reads the store") | 1.0 KB |
| Where new code goes | today's section | 4.0 KB |
| Adding UI code | today's section, plus: `main.js` only calls; rule 3 (hooks and MCP only from `main.js`); line-1 purpose comment; never reformat a module in a commit that changes it; ordered `compare-builds.js` after a pure move; to add a field: markup + `defaults` + one `FIELDS` entry | 2.8 KB |
| US vs. Canada | the intro and the four general bullets (names, `taxFor` branches, pension splitting vs ACA/IRMAA, singlePerson reads slot A) | 2.0 KB |
| UI traps | money-field parsing; field descriptors and info bubbles (one paragraph); `overflow-x: clip`, test sticky with a real scroll | 1.2 KB |
| Where a new test goes | today's section (the seven Vitest rules stay: exact comparisons, `world()`, counters, `withRuleRow`, Node 22/24) | 3.9 KB |
| Testing checklist | today's section, plus the snapshot rule (only `snapshot:update` for an intended change, say so in the commit) | 1.4 KB |
| Docs and versioning | today's two sections; adds "a change to an area updates its `docs/architecture/` file in the same commit" | 2.0 KB |
| Topic files | one pointer line per file: path, what it covers, when to read it | 1.6 KB |

## Topic files (`docs/architecture/`)

Sizes are of the moved text. "Arch" = section "Architecture, per planner file"; "US/CA" = "US vs. Canada"; "Lists" =
"Add-as-you-go lists".

| File | Moved from | Est. |
|---|---|---|
| `engine.md` (run context and engine) | Arch intro paragraph; Arch `runProjection(ctx, ...)`; Arch Year source and mode; Arch Tax-code hot-path rules (`taxIndexFactor` memo, the context shape measurements, the registry kinds); Arch Per-year helpers; Arch `bal` object; Arch Withdrawals; Lists "Death clamp" | 17 KB |
| `magi-iteration.md` | Arch MAGI iteration, whole: two-return years (3C B1), the third estimate (162(l), decisions 10-12, 8a `seOn`, 9c speed), IRMAA appeal and the lookback's filing status (E3) | 11 KB |
| `cliff-plan.md` | Arch Per-year solver and the cliff plan (hooks, primitives, run modes, planning, test hooks, `planStats`) | 9.3 KB |
| `us-federal-tax.md` | Arch US federal deductions (with QBI and 162(l)); Arch Filing-status table; Arch Child credits | 6 KB |
| `us-state-tax.md` | Arch State income tax (7C, 7D sets one to three); Arch State rows, later additions (7O O3, O4) | 8.9 KB |
| `us-health.md` | Arch Medicaid and the premium-credit floor (7O O1); US/CA "US splits post-retirement healthcare" (ACA vs Medicare gating) | 3.1 KB |
| `us-accounts.md` | Arch Retirement accounts (US) and the account ledger; Arch Contribution limits (E1a); US/CA early-withdrawal penalty (Rule of 55, 72(t)); US/CA pooled traditional balance and per-partner shares | 5.8 KB |
| `self-employment.md` | Arch Self-employment (E1c); Lists "Streams in E1c" | 3.9 KB |
| `inherited-accounts.md` | Lists "Inherited accounts (US, E1e)" | 6.5 KB |
| `lists.md` (add-as-you-go lists) | Lists: generic DYN block, growth, migrations, bridge removal; Income streams (E1b); One-time income (E1d); spending tiers; children and `dependentsInYear`; Arch `mortgageSchedule()` / `loanSchedules()` | 10.5 KB |
| `canada-tax.md` | US/CA Canada federal credits (7J); OAS recovery (7N N1); after-tax estate (N8); Quebec health contributions (N7); low-income reductions (N6); medical expense credit (N5); payroll items and home buyers' amount (N4, N10); spouse, dependant and child amounts (N3); provincial tax (7K) | 17 KB |
| `canada-benefits.md` | US/CA Income-tested benefits (7L, 7M) | 7.5 KB |
| `inputs-and-ui.md` | Arch `defaults`, `normalizeState` (background), `FIELDS`; Arch `syncControls` / `syncContributionControls`; Arch `render()`; Arch tornado; Arch chart preferences; Arch Sankey; Arch MCP tool hooks; Arch mobile layout; the trailing reference.md pointer; US/CA `UNUSUAL_RANGES` parenthetical; First-run wizard; Dashboard tiles and the safe withdrawal rate | 8 KB |
| `module-system.md` (modules, seams, tools) | Shared code between the planners; Shared state and country seams (less the rules kept in CLAUDE.md); Modules, the entry point and the tools, whole (where code lives, `main.js`, rule 3, the seam, UI cycles and the load-time guard, state, module map, data blocks, extraction tool, regroup tool, build comparison); Files bullets: `analyze-closure.js`, inventory folder, extraction tool, regroup / `load-time.js` / `module-graph.js` / `compare-builds.js` | 20 KB |
| `test-inventory.md` | Files: every test, bench and scan bullet (structural guards; `tests/unit/` layout and helpers; stateless-engine checks; golden and tax brackets; state rules and mechanisms; the benches with the noise advice; solver scripts; benefits; deductions to inherited accounts; field registry; legacy state; account ledger; bond refill; historical parity; snapshots and the dump recipe; root `test_*.js`) | 20 KB |

15 files, about 155 KB in all. A test name stays where it is described today (inside its feature write-up) and also
appears in `test-inventory.md` only where the Files section listed it, as today.

## Tooling

- `tests/doc_paths.js`: `docsOf` also reads `docs/architecture/*.md`; new check that every
  `docs/architecture/<name>.md` named in CLAUDE.md exists, and that every file in `docs/architecture/` is named in
  CLAUDE.md (no orphan topic); fixtures for both.
- `scripts/lib/regroup.js`: `OUTSIDE` gains the files of `docs/architecture/` (listed when the tool runs, not
  hard-coded); a fixture case in `tests/regroup_modules.js` showing a rename rewritten in a topic file. Its header
  comment and the module-system text say so.
- No `src/` change, no snapshot or expectation change. Old plans and notes under `docs/` that cite CLAUDE.md
  sections are historical records and stay as they are.

## Cut as obsolete history (proposed; nothing else is deleted)

Each says only how something used to be. I will cut these unless you strike one.

1. Files, `tests/unit/`: "These scripts moved here and no longer exist under `tests/`: `tax_brackets` (...) ... `historical_parity`."
2. Files, Canada benefits tests: "The old `tests/benefits.js` was never in the `npm test` chain, so its 1,419 checks run in CI for the first time through `benefits.test.js`."
3. What this is: "notes written before stage 4 name shared code by its `@@shared` region, and ... region maps say which module now holds it" (kept, moved to `module-system.md`, not cut; listed so you see it leaves CLAUDE.md).
4. Arch, Year source and mode: "the other differences ... were switches that the historical-parity work (Batch 1 ...) turned on and then removed, so" -> keep "Both modes run the detailed rows, the Roth-conversion age key, the safe-MAGI ceiling and the pre-retirement bond ladder."
5. Arch, State income tax: "replacing the old per-state code"; "(the `migrated` status of 7C is gone)"; "the old `FILING.state` family is gone"; "(the household-level kinds of 7C were removed in 7D)".
6. Arch, MAGI iteration (E3): "`irmaaFiling2` is gone."
7. US/CA, Provincial tax: "Nova Scotia's phase-down is gone".
8. Arch, Retirement accounts: "Batch 3B replaces the fractional blend with a per-account status." 3B shipped (`src/us/core/accounts/penalty-status.js`), so this sentence and the "penalty blend" clause before it are stale. Proposed: cut the 3B sentence; keep the blend clause in `us-accounts.md` marked for checking against the code (no rewrite in this PR).
9. US/CA, pooled traditional balance: "the former `state.traditionalSharePctA` slider (0-100, default 50) is gone"; "replace the old single `traditionalShare` variable"; "(replacing the old single `sepp72tEnabled` boolean, migrated in `normalizeState()` for old saved scenarios)" -> keep "migrated in `normalizeState()`"; and "same as before this feature existed". The final sentence "so `traditionalSharePctA` is US-only" names a removed field: cut.
10. Arch, cliff plan run modes: the older `plan_off_anchor.js` bases ("before it `aef6cb2`, E3 Task 1, was the baseline, then `5eb30fa` up to E3 Task 1, and `3ebee0e` up to `ce5fb56`"). Keep "a tree at or after `4834615`". Strike this item if you still compare against older trees.
11. Modules, Where code lives: "Stage 2 moved the first four dependency layers out of the planner IIFE, stage 3 every remaining DOM-free unit, stage 4 the UI layer and every side-effect statement" -> keep the design-doc pointer only.
12. Shared code: "The old `@@shared` regions and `scripts/sync-shared.js` are gone" -> keep "`tests/no_markers.js` keeps `@@shared` markers out of `src/`".

Not cut, though they read like history, because they say why not to undo something: the `LIVE_CTX` measurement
(one context shape), "measured and rejected, do not retry" memos, decision 12 withdrawing decision 11, the Bridge
migration (still in `normalizeLists`), the old-name map of `optimizerState` (old notes use those names).

## Questions for you

1. File split: 15 topic files as above, or fewer and larger (for example fold `us-health.md` into
   `us-federal-tax.md`, `self-employment.md` into `magi-iteration.md`)?
2. CLAUDE.md lands at about 21-23 KB with the invariants section. To reach 20 KB I would move "Where a new test
   goes" rules 1-7 to `test-inventory.md` and keep three lines; I would rather keep them (rule 2, exact
   comparisons, is a silent-bug rule). Your call.
3. The 12 cuts above.
