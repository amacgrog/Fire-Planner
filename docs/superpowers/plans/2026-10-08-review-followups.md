# Branch review follow-ups (cliff plan + IRMAA MAGI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps an independent branch review found at `5eb30fa`: re-base the guard-off anchor, add tests for five code paths no test protects, fix two latent risks (the plan cache ignores the tax year; the line de-duplication can drop a real cliff line), and do the agreed number-neutral cleanups.

**Architecture:** No new subsystem. Tests first (each new test is shown to fail on a one-line mutation of the code it protects, in a scratch copy), then two small root-cause fixes with their failing tests, then cleanups that change no number, then docs and notes.

**Tech Stack:** `Planner_US.html` (one inline `<script>` IIFE), Node + Playwright tests (`tests/*.js`), no build step.

**Spec:** none (a bounded follow-up). The decisions are in `docs/next-batches-plan.md`, section "Branch review of the cliff plan and IRMAA fix (2026-10-08)"; background in the cliff-plan spec `docs/superpowers/specs/2026-10-07-cliff-plan-design.md` and the IRMAA spec `docs/superpowers/specs/2026-10-07-irmaa-magi-design.md`.

## Where the work stands (read this first)

- The cliff plan (US V117-V119) and the IRMAA MAGI fix (V120) are done, accepted by the owner and merged into `claude/batch-3b-penalty-rules` as `5eb30fa`. Their implementation notes are in `docs/next-batches-plan.md` (3C notes: "Cliff plan: implementation (V117-V118)", "Cliff plan: final review and acceptance"; "IRMAA MAGI fix: implementation", "IRMAA MAGI fix: review and acceptance").
- An independent Opus review of `5eb30fa` against `0d6dcf7` found no correctness bug. It confirmed: `apply(choose's plan)` replays `choose` exactly (600 households, 309 intents), rule A holds on the standard projection, the IRMAA inverse is exact (about 81,000 cases), the ACA side is untouched, stale plans cannot reach another household, the MAGI iteration stays safe, and `refreshCliffPlan`'s cache key is complete. What it found is what this plan fixes.
- Recorded decisions this plan must NOT reopen: variants apply the main plan by age; plan losses on some historical / Monte Carlo paths; depleting households keep no steering; `ret 'B'` intents lost to the de-duplication when the partners' lines coincide (Batch 5); lambda's moved sample (Batch 5); live mix per path (Batch 5); this year's vs the charged year's IRMAA tiers; the conversion-cap movers (Batch 5); tax-exempt interest not modeled; the flaky Canada UI snapshot (unscheduled, not here).

## Global Constraints

- Work in a new worktree from the commit that adds this plan (call it BASE_DOCS; it holds the code of `5eb30fa`): `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-followups -b claude/review-followups BASE_DOCS`. Baseline for snapshots and timing: `git -C C:\Users\Alex\code\Fire-Planner worktree add --detach ../fp-followups-base 5eb30fa`. `npm install` in each if `node_modules` is missing.
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and stashes). Never push, never open a PR, never merge.
- No change to any `@@shared` region and no change to `Planner_Canada.html`; `npm run check:shared` passes after every task. Windows CRLF: never run `npm run sync`.
- **Number rule:** every task is number-neutral. After each task `npm test` is green with every snapshot identical to `5eb30fa` (no `npm run snapshot:update`). Task 3's fix is the only one that could move a number (only where a senior or child-tax-credit line coincides within $1 with an ACA or IRMAA line); if any snapshot moves there, stop and report the movers with a dump/compare (`node tests/snapshot.js --root ../fp-followups-base --dump A --update-nothing`, `--dump B`, `--compare A B`).
- **Mutation rule:** every new test in Tasks 1 to 3 must be shown to fail on the specific one-line mutation named with it, applied in a SCRATCH copy (copy the worktree's `Planner_US.html` into a throwaway folder or a detached throwaway worktree; never commit a mutation), and pass on the real tree. Record each (test, mutation, fails/passes) in the task report.
- No heuristic, gate or threshold that this plan does not name. If a test needs a household that cannot be found by the search the step describes, stop and report; do not weaken the assertion.
- Timing (Task 4): `node tests/bench_runs_interleaved.js --base ../fp-followups-base --rounds 21` and `node tests/bench_solver.js --base ../fp-followups-base`: per path at most +5% in every state; the cleanups are expected to be neutral or faster.
- Each commit: `npm test` green; commit only your paths with `git commit -m "..." -- <paths>`, message ending `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-08-review-followups/` inside your worktree (git-excluded).

## Review Focus

1. **A test that cannot fail** (the review's main finding): every new test must be proven against its mutation, not just run green.
2. **The plan cache after the tax year changes** (`__test_setCurrentYear`): a swapped-in state must get a plan made under the current year. Task 2.
3. **Two coinciding lines of different families**: the cliff line survives, the tax line goes; two non-tax lines keep today's choice (the earlier one), so `ret 'B'` behavior is unchanged (Batch 5's). Task 3.
4. **`conversionMagiCeiling` called without a profile**: after Task 4 it must fail loudly in tests, not fall back to a benefit of 0.
5. **The anchor's documented base**: a future run of `tests/plan_off_anchor.js` against the documented base prints all identical. Task 5.

---

### Task 1: Tests for the unprotected paths (tests only; no planner change except test hooks if one is missing)

**Files:** `tests/solver_hooks.js`, `tests/cliff_plan.js`, `tests/irmaa_magi.js` (each new case goes in the file named in its step).

- [ ] **Step 1 (M15, two-return IRMAA lines).** In `tests/solver_hooks.js`, extend the two-return `magiThresholds` case (the call with `ctx({ twoReturns: true, singlePerson: false, ageB: 60, preMagi: 100000, preMagiA: 40000, preMagiB: 60000, profile: { ownerShareA: 0.5 } })`, around line 81) with a SECOND call whose partners are on Medicare and have benefits: `age: 66, ageB: 66, acaEligibleA: false, acaEligibleB: false, irmaa: { filing: 'single', a: true, b: true }, irmaaGrowth: 1, profile: { ownerShareA: 0.5, ssA: 40000, ssB: 20000, dependents: [] }`, `acaEnabled: false`. Expected `irmaa1` lines, computed in the test from the primitives (`window.__test_tax.magiForIrmaaLine`) and the same translation `magiThresholds` uses: A `preMagi + (magiForIrmaaLine(109000, 40000, 'single') - preMagiA) / 0.5`, B `preMagi + (magiForIrmaaLine(109000, 20000, 'single') - preMagiB) / 0.5`; assert both lines exist with `ret` 'A' / 'B', `id` 'irmaa1', and `magi` equal to those values within 1e-6, and that neither equals the untranslated `preMagi + (109000 - preMagiX) / 0.5`. Mutation: replace `magiForIrmaaLine(cap, p.ssA || 0, stA)` and the B call with `cap` in the two-return branch of `magiThresholds`.

- [ ] **Step 2 (M1, lambda's IRMAA step on one return).** In `tests/irmaa_magi.js`, a property case through `window.__test_solver.lambdaEstimate` (check its call shape in `tests/solver_hooks.js`). Two single-person households in Texas (`stateTax: 'tx'`, no state tax), both 70 and retired, life expectancy 85, no children: X with Social Security 40,000 a year (started) and pension P; Y with no Social Security and pension P + 34,000. At every lambda sample X's taxable benefit is at its 85% cap (P large enough: P >= 60,000), so X and Y have the same ordinary income, the same federal tax and the same Medicare MAGI; lambda must be equal: `Math.abs(lambdaX - lambdaY) < 1e-12` for the same `{ tradPool, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1 }`. Choose P and `tradPool` so that X's ENGINE MAGI step (P + 40,000 + RMD, up by 10%) crosses an IRMAA tier edge while the Medicare MAGI step does not (search P from 60,000 upward in 500 steps in the test setup and keep the first P where that holds, computed with the primitives and `IRMAA_TIERS` values from `__test_tax.irmaaSurcharge`; assert one was found). Mutation: in `lambdaEstimate`'s one-return branch, replace both `irmaaMagiOf(...)` calls with their first argument.

- [ ] **Step 3 (M13, the same on two returns).** Same file and idea for an unmarried couple (`singlePerson: false`, `filingStatus: 'single'`, `marryLater: false`), both 70: X with Social Security 40,000 each and pension P each; Y with none and pension P + 34,000 each; lambda equal within 1e-12; the search makes the per-person engine-MAGI step cross the single tier edge while the Medicare one does not. Mutation: the two-return branch's `irmaaMagiOf(mA ...)` / `irmaaMagiOf(mB ...)` replaced with `mA + hs`, `mA`, `mB + hs`, `mB`.

- [ ] **Step 4 (M14, two-return `irmaaAt`).** In `tests/irmaa_magi.js`, through `window.__test_planTrace()` (no `rowFn`: the `choose` trace on the standard projection). An unmarried couple, both 66 and retired, Texas, `acaEnabled: false`, each with pension P and Social Security 40,000 (started), spending set so the year is a withdrawal year (`flow < 0`) with a small traditional draw, guard on. Pick P (search in 500 steps, in the test setup, from 60,000) so that in year 0 each return's ENGINE MAGI divided by `irmaaGrowth2` (the plan's inflation compounded two years) is above the single first tier (109,000) and each return's Medicare MAGI divided by it is at or below. Assert: year 0 has a trace entry with candidates, and the natural candidate's `cliffCost` equals that year's row `healthcare` exactly (no IRMAA estimate: `irmaaAt` returned 0). Mutation: in `irmaaAt`'s two-return branch, replace `irmaaMagiOf(ma, ...)` and `irmaaMagiOf(mb, ...)` with `ma` and `mb`. If no P makes year 0 a withdrawal year with a line in reach, stop and report.

- [x] **Step 5 (M17): DROPPED (owner, 2026-10-08), the line is unreachable today.** The search below found no household (1,553 runs: the 768-household grid in both modes and the 17 `std G` scenarios, conversions on over 58 to 64; no fill candidate at all). Reason (reviewer, from the code): `solveRothConversionTo` sizes the conversion from the profile's income and Social Security only, so a fill trial converts the same as the natural year unless `magiSafeRoom` binds, and a fill only raises the estimated draw, which shrinks that room (the one way it grows, the IRMAA stay-in-tier ceiling, needs a MAGI near an IRMAA edge, while a fill's only target, `acaFloor`, sits under 100% of the poverty line); and a natural conversion puts MAGI at the 10% bracket top plus the deduction or more, above the floor except in very large households. The clamp line stays (defensive); its test moves to Batch 5, when conversion sizing reads the draws. Write nothing for this step. The original text, for Batch 5: In `tests/cliff_plan.js`, find a household where `choose` records a FILL intent in a year whose natural conversion is above 0. Search, in this order, and stop at the first hit: the 768-household grid of `tests/solver_scan.js` (reuse its patch builder) with `rothConvEnabled: true` and a conversion window covering ages 58 to 64, then the `std G` scenarios with `rothConvEnabled: true`. The hit is a year whose `__test_planTrace()` entry has a candidate of `kind: 'fill'` with `ok: true` that is the recorded intent, and whose natural candidate (`kind: 'none'`) has `conversion > 0`. Pin the household's patch in the test with a comment saying how it was found. Assert: the fill candidate's `conversion` is at most the natural candidate's `conversion`. Mutation: delete the line `if (phased && yearPlan.kind === 'fill' && conversionAmount > naturalRec.conversion) conversionAmount = naturalRec.conversion;`. If the search finds no such household, stop and report (do not invent one by hand).

- [ ] **Step 6 (M6, no steering is always a candidate).** In `tests/cliff_plan.js`'s T5.2 loop, add: `report.candidates[0].family === 'none'`, and its `depletedAge` and `value` equal those of `__test_runPlanMode({ planMode: 'off' })` measured the same way (`depletedAge` of the run, `__test_afterTaxEndValueUS` of its `sim`). Mutation (revised 2026-10-08): in `computeCliffPlan`, keep `none` only when `choose` recorded no intent: `const cands = fams.size ? [] : [measure('none', {}, chosen)];`. (The first wording, `none` removed always, leaves `cands` empty for a household with no intent and `render()` throws at page load: a failure, but not of the new assertion. The revised one fails T5.2's own check, `'all' !== 'none'`.)

- [ ] **Step 7: Run and prove.** `npm test` green, snapshots identical. For each of Steps 1 to 4 and 6, apply its mutation in a scratch copy and run the one test file: it fails; restore: it passes. Record the five results in the report.

- [ ] **Step 8: Commit.**
```bash
git commit -m "Review follow-ups 1: tests for the two-return IRMAA lines, lambda's IRMAA step, two-return irmaaAt and the none candidate (each proven on a mutation)" -- tests/solver_hooks.js tests/irmaa_magi.js tests/cliff_plan.js
```

---

### Task 2: `planForState` keys on the tax year (finding 3)

**Files:** `Planner_US.html` (`planForState`, ~line 10707), `tests/cliff_plan.js`.

- [ ] **Step 1: Failing test** (`tests/cliff_plan.js`, next to T6.9; the page clock is pinned to 2026 as in that file). Steps, for a household R:
  1. Set household P (the T6.9 P) and `__test_refreshCliffPlan()`, so P is the planned state.
  2. `__test_replaceState(R)` (no render), then `p1 = __test_planForState()`: R's plan under 2026, now cached.
  3. `__test_setCurrentYear(2027)`, then `p2 = __test_planForState()` (same R object, same JSON).
  4. The expected plan: `p3 = __test_refreshCliffPlan().plan` (R is the current state; the refresh plans under 2027).
  5. Assert `p2` deep-equals `p3`, and `p1` does not deep-equal `p3` (so the test can fail). R: search the `std G` ACA scenarios for the first whose 2026 and 2027 plans differ (the tax year moves the law, the 2027 Medicaid work requirement and the IRMAA edges); pin it with a comment. If none differs, stop and report.
  6. Restore the year (`__test_setCurrentYear(2026)`) and re-plan.
- [ ] **Step 2: Run; it fails** (`p2` comes from the 2026 cache entry: it equals `p1`, not `p3`).
- [ ] **Step 3: Fix.**
```js
  function planForState() {
    if (state === cliffPlanState && cliffPlanYear === currentYear) return cliffPlan;
    if (!state.cliffGuardEnabled) return null;
    const key = JSON.stringify(state);
    if (key === cliffPlanKey && cliffPlanYear === currentYear) return cliffPlan;
    const cacheKey = currentYear + '|' + key;
    if (cliffPlanCache.has(cacheKey)) return cliffPlanCache.get(cacheKey);
    const plan = computeCliffPlan().plan;
    if (cliffPlanCache.size >= CLIFF_PLAN_CACHE_MAX) cliffPlanCache.clear();
    cliffPlanCache.set(cacheKey, plan);
    return plan;
  }
```
  Update its comment (the plan of the projected state under the current tax year). `__test_setCliffPlan` already sets `cliffPlanYear`.
- [ ] **Step 4: Run.** The new test passes; `npm test` green, snapshots identical; the mutation for this test is the fix reverted (record it).
- [ ] **Step 5: Commit.** `git commit -m "Review follow-ups 2: planForState keys its plan on the tax year as refreshCliffPlan does (number-neutral)" -- Planner_US.html tests/cliff_plan.js`

---

### Task 3: The de-duplication keeps the cliff line (finding 4)

**Files:** `Planner_US.html` (`magiThresholds`' de-duplication, ~line 8929), `tests/solver_hooks.js`, `tests/cliff_plan.js`.

- [ ] **Step 1: Failing test** (`tests/solver_hooks.js`, beside the line-66 case `ctx({ age: 66, acaEligibleA: false })`, `acaEnabled: false`, single, tax year 2026): with `irmaaGrowth: 75000.5 / 109000`, the first IRMAA line is 75,000.5 and the senior-deduction line is 75,000 (single, not indexed), within $1. Assert the returned lines contain `{ id: 'irmaa1', family: 'irmaa' }` at 75,000.5 and no line with `family: 'tax'` at 75,000. Also a case where two non-tax lines coincide keeps today's choice: an ACA line and an IRMAA line within $1 (if a context is easy to build; else skip with a comment) keep the first (lower) one.
- [ ] **Step 2: Run; it fails** (the senior line is kept and `irmaa1` dropped).
- [ ] **Step 3: Fix.**
```js
    const deduped = [];
    // Two lines within $1 are one line. Keep the earlier one, except that a cliff line (aca or irmaa family) replaces a
    // tax-family line (senior, ctc): those are priced by taxFor and are never candidates, so an intent must not name one.
    for (const t of out) {
      const last = deduped[deduped.length - 1];
      if (!last || t.magi - last.magi > 1) deduped.push(t);
      else if (last.family === 'tax' && t.family !== 'tax') deduped[deduped.length - 1] = t;
    }
    return deduped;
```
- [ ] **Step 4: Invariant test** (`tests/cliff_plan.js`): over every `std G` scenario and the T6.9 households, no recorded intent has `lineFamily` 'tax' (read `plan.intents` from `__test_refreshCliffPlan()`; a hook for `lineFamily` exists if `tests/cliff_plan.js` already uses one, else compare the id against `senior` / `ctc`).
- [ ] **Step 5: Run.** Both tests pass; `npm test` green with snapshots identical (if any snapshot moves: stop, per the Number rule); mutation for Step 1 is the fix reverted (record it).
- [ ] **Step 6: Commit.** `git commit -m "Review follow-ups 3: line de-duplication keeps the cliff line over a tax-family line (no snapshot change)" -- Planner_US.html tests/solver_hooks.js tests/cliff_plan.js`

---

### Task 4: Number-neutral cleanups and the healthcare callout (V121)

**Files:** `Planner_US.html`, `tests/` only where a removed field was read, `README.md` only if a feature line mentions the callout (it does not today: check).

- [ ] **Step 1: Drop `madeFor`.** In `computeCliffPlan`, `plan: { intents: best.intents, family: best.family }` (no `madeFor`: nothing reads it; it cost a stringify per plan and a state copy per cache entry). Grep `madeFor` in `Planner_US.html` and `tests/`; remove any test assertion on it.
- [ ] **Step 2: `natOf` only where used.** In the phased block of `runProjection`, build `natOf` (or its object) only inside the `intent` branch and the `planMode === 'choose' && lines.length` branch, not every withdrawal year.
- [ ] **Step 3: `conversionMagiCeiling` requires its profile.** Remove the `profile = null` default and the `profile ? irmaaSsOf(profile) : 0` / `profile || NO_PROFILE` fallbacks (use `profile` directly); remove `NO_PROFILE` if nothing else uses it. Confirm the one caller passes `profile`.
- [ ] **Step 4: One taxable-benefit formula.** Make `taxableSocialSecurity(benefits, otherIncome, filing)` read the `SS_BASE` row once and return `taxableSsOnRow(benefits, otherIncome, lower, upper, base)`, so the formula exists once. Keep `taxableSsOnRow`'s arithmetic exactly as it is (bit-identical).
- [ ] **Step 5: The leftover per-call lookups.** After convergence, the three calls (`irmaaSsOf(profile)` twice, `returnStatusA(profile.dependents)` once, at the realized `irmaaMagiHistory` writes and the `irmaaChecks` push) use the per-pass values already computed in the year body (`irmaaSsH`, `irmaaStA`). Keep `returnStatusA` itself (head of household reads the single Social Security bases today, so it changes no number, but it states the return's status where the law reads it).
- [ ] **Step 6: The healthcare callout.** In the US callout "Healthcare, ACA, Medicare & IRMAA" (US-only markup, `Planner_US.html` ~line 709), replace "and household size (1 for single-person, 2 for couples; dependents aren't modeled)" with "and household size (the adults plus qualifying children from the Children list)". Read the sentence first and keep the rest verbatim. US badge V120 -> V121.
- [ ] **Step 7: Run.** `npm test` green with every snapshot identical (the UI snapshot may record the callout text: if `tests/snapshots/ui_us.json` changes ONLY in rendered text for the callout, run `npm run snapshot:update`, restore any file rewritten with no content change, and say so in the commit). Timing per the Global Constraints (21 rounds; record both tables).
- [ ] **Step 8: Commit.** `git commit -m "Review follow-ups 4: drop madeFor, natOf only where used, conversionMagiCeiling requires its profile, one taxable-benefit formula, per-pass IRMAA lookups, healthcare callout names children (V121; no number change)" -- Planner_US.html tests/ [README.md]`

---

### Task 5: Anchor base, docs and notes

**Files:** `tests/plan_off_anchor.js` (header comment only), `CLAUDE.md`, `docs/next-batches-plan.md`.

- [ ] **Step 1: Re-base the anchor.** Run `node tests/plan_off_anchor.js --base ../fp-followups-base` (the `5eb30fa` tree): expected all 543 identical. Header comment: the baseline is any tree at or after `5eb30fa` (V120); `3ebee0e` was the baseline up to `ce5fb56` (the IRMAA fix moved 204 guard-off scenarios by design: 339 identical, 204 different against `3ebee0e`).
- [ ] **Step 2: `CLAUDE.md`.** In the per-year solver bullet, "byte for byte the guard-off year of 3ebee0e" becomes "byte for byte the guard-off year (`tests/plan_off_anchor.js --base` a tree at or after `5eb30fa`; `3ebee0e` up to `ce5fb56`)". In the MAGI-iteration IRMAA sentence, add `Test: tests/irmaa_magi.js.`. In the per-year solver bullet, `planForState`'s description: keyed on the state's JSON and the tax year; the de-duplication rule (a cliff line replaces a tax-family line within $1; otherwise the earlier line stays).
- [ ] **Step 3: Notes.** Under "Branch review of the cliff plan and IRMAA fix (2026-10-08)" in `docs/next-batches-plan.md`, add "##### Review follow-ups: implementation": commits, the mutation table (each test, its mutation, fails on the mutation / passes on the tree), the households the searches found (Task 1 Steps 2 to 4; Step 5 dropped, see the review decision above it), the anchor runs (543 identical against `5eb30fa`), the timing table, anything for the owner.
- [ ] **Step 4: Commit.** `git commit -m "Review follow-ups 5: anchor re-based to 5eb30fa, CLAUDE.md, notes" -- tests/plan_off_anchor.js CLAUDE.md docs/next-batches-plan.md`. Report: branch tip and commits, the mutation table, the snapshot result after each task, the timing, open questions.
