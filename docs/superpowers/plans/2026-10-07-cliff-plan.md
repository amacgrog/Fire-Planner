# Cliff Plan (3C redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3C's in-path cliff guard with a plan chosen once per render on the deterministic projection and applied unchanged in every other run (variants, historical, Monte Carlo).

**Architecture:** `runProjection` (US only, not shared) gains a `planMode` (`off`, `choose`, `apply`, and until Task 6 a temporary `legacy` = today's in-path guard). `choose` runs Stage 8a's phased year (converged natural year, then trials) and records each winning year as an intent; `apply` runs one intent per year with a literal fallback. `refreshCliffPlan()` (top of `render()`) runs `choose`, the family subsets and `off`, keeps the best by rule A, and stores `cliffPlan`; `runProjection` applies it by default. `simulate()` and the `__test_simulate*` hooks are in shared regions and are NOT edited.

**Tech Stack:** a single-file HTML app (`Planner_US.html`, one inline `<script>` IIFE), Node + Playwright test scripts (`tests/*.js`), no build step.

**Spec:** `docs/superpowers/specs/2026-10-07-cliff-plan-design.md` (read it first). The spec's commit 1 is Tasks 1-2, its commit 2 is Tasks 3-5, its commit 3 is Tasks 6-7 (two user-facing commits, so V117 then V118), its commits 4 and 5 are Tasks 9 and 10; Task 8 adds the scripts. Background: `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md` sections 13.5 to 13.7, and the 3C notes in `docs/next-batches-plan.md` ("Stage 8a block ..." and "Redesign: the cliff plan").

## Global Constraints

- Work in a new worktree: `git worktree add ../fp-cliff-plan -b claude/3c-cliff-plan <the commit that added this plan>`; run `npm install` there if `node_modules` is missing. Never touch `C:\Users\Alex\code\Fire-Planner`'s working tree (it holds the owner's uncommitted Stage 8a work), its stashes, or `.superpowers/`. Read-only use of `C:\Users\Alex\code\Fire-Planner\.superpowers\sdd\2026-10-06-per-year-solver-3c\task-B8-stage8a-wip.patch` is expected (it is not in git; read it by that absolute path).
- Never push, never open a PR.
- Reference worktrees (read-only, already exist): `../fp-3c-A` = `3ebee0e` (the snapshot and behaviour baseline), `../fp-3c-pre` = `24f6585` (the timing base).
- No change to any `@@shared` region and no change to `Planner_Canada.html`. `simulate()`, `simulateHistorical()`, `runHistoricalCycles()`, `runMonteCarlo()` and the `window.__test_simulate*` / `__test_runHistoricalCycles` / `__test_runMonteCarlo` assignments are inside shared regions: hook in at `runProjection` and with US-only code placed after `// @@shared:block end`. `npm run check:shared` must pass after every task.
- Windows CRLF: the working tree is CRLF. Write files with CRLF or let git normalize; never run `npm run sync` (no shared region changes).
- Hard rules (stop and report to the owner if any fails):
  - No standard snapshot scenario runs out earlier than at `3ebee0e`, and none runs out earlier than its own `off` run.
  - Every intended number change is re-explained with `node tests/snapshot.js --root ../fp-3c-A --dump A --update-nothing`, `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B` and a before/after table, with `npm run snapshot:update` in the same commit. Tasks 1 to 5 change no number: snapshots identical.
  - No heuristic, gate, threshold or tuned number that the spec does not name. If one seems needed, stop and report.
  - The lambda estimator's numbers are not changed (only the `movedSample` flag is added).
- Timing gates (Task 8): per path, no-cliff households +5% against `24f6585` (accepted up to +8%, documented), the ACA early retiree (California) +30%; planning: `refreshCliffPlan()` at most 5x one `off` `simulate()` of the same household. Over: number-neutral speedups only (Task 9), then stop for the owner.
- Docs: `README.md` feature line, the `CLAUDE.md` per-year solver section, and the US badge (`<span>V116</span>` in the `<h1>`) in the same commit as any user-facing change. Findings go in `docs/next-batches-plan.md` (3C notes, a new "Cliff plan: implementation" subsection), never in `docs/reference.md`.
- Each commit: `npm test` green. Commit only the paths you changed: `git commit -m "..." -- <paths>`, message ending with `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.

## Review Focus

1. **State replaced while a plan exists** (scenario import, undo, reset, autosave load): the next projection must not apply the old household's plan. Pinned in Task 6, Step 9.
2. **The guard toggled off and back on in the UI:** off must equal the `off` run exactly; on must re-plan. Pinned in Task 7, Step 1, case (f).
3. **A variant where an intent's age becomes a working or surplus year** (the +3-year retirement line): no trial runs (`flow >= 0`), the year runs as `off`, nothing throws. Pinned in Task 4, Step 1 (case "variant").
4. **A marry-later household** (two returns, then joint): intents recorded with `ret` 'A'/'B' before the wedding and 'H' after; replay stays exact across the switch. Pinned in Task 4, Step 1 (case "marry-later replay").
5. **An intent whose line is out of reach on a path** (a boom path whose MAGI floor is above the line): counted as `absent`, the year runs as `off`. Pinned in Task 4, Step 1 (case "absent").

---

## File map

- `Planner_US.html` (all engine and UI changes):
  - `newWithdrawal` / `takeTraditional` (~line 9134 / 9208): `cappableTraditional`.
  - `lambdaEstimate` (~8850): `movedSample`.
  - `magiThresholds` (~8782): `id`, `ret`, `family` on each line.
  - Per-year solver section (~8760-9130): `yearPlanCandidates` (from the 8a patch), `lineFamily`, `planStats`; `chooseYearPlan`, `cloneWithdrawal`, `NO_PLAN` legacy pieces removed in Task 6.
  - `runProjection` (~9722-10374): `planMode` / `plan` arguments, the phased year, intents, `estate`.
  - New, just after `runProjection` (US-only, before `// @@shared:13-simulate begin`): `afterTaxEndValueUS`, `planCandidateBetter`, `refreshCliffPlan`, `cliffPlan`, `cliffPlanKey`, `cliffPlanReport`, `cliffPlanSummary`.
  - `render()` (~10446): refresh at the top; summary line.
  - State replacement sites (~1537, 12985, 13014, 13128, 14642): clear the plan.
  - `annotateSolverRows` (~12467).
  - Test hooks (after `// @@shared:block end`, ~15676): new US-only hooks and wrappers.
  - Markup: the `cliffGuardEnabled` label and info bubble (~534); a summary element under "More results".
- `tests/solver_primitives.js`, `tests/solver_hooks.js`: Task 1 cases.
- `tests/end_value_us.js` (new, in `npm test`): Task 2.
- `tests/cliff_plan.js` (new, in `npm test`): Tasks 3 to 6.
- `tests/plan_off_anchor.js` (new, not in `npm test`): guard-off equality with `3ebee0e`.
- `tests/cliff_guard.js`, `tests/historical_parity.js`: rewritten / extended in Task 6.
- `tests/solver_scan.js` (extended), `tests/bench_plan.js` (new), `tests/bench_runs.js`, `tests/bench_solver.js` (raw-hook fallback): Task 8.
- `package.json`: add the two new `npm test` files.
- `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`.

---

### Task 1: Solver hooks (no number change)

**Files:**
- Modify: `Planner_US.html` (`newWithdrawal`, `takeTraditional`, `lambdaEstimate`, `magiThresholds`, `window.__test_solver`)
- Test: `tests/solver_primitives.js`, `tests/solver_hooks.js`

**Interfaces:**
- Produces: `wd.cappableTraditional` (number; traditional drawn through `takeTraditional` with `penalized === false && uncapped === false`); `lambdaEstimate(...)` returns `{ lambda, tauGain, movedSample }` (`movedSample`: true if any of the three samples was priced at a year before its own because the walk emptied the pool); each `magiThresholds` line is `{ magi, label, id, ret, family }` with `id` in `medicaid | acaFloor | aca400 | irmaa1..irmaa5 | senior | ctc`, `ret` in `H | A | B`, `family` in `aca | irmaa | tax`.

- [ ] **Step 1: Write the failing tests.**

In `tests/solver_primitives.js`, next to the existing `takeTraditional` cases (they use `window.__test_solver.newTestWithdrawal(balPatch, profile)`), add:

```js
// Cliff plan, Task 1: only the draw a MAGI cap can limit counts as cappable.
{
  const r = await page.evaluate(() => {
    const S = window.__test_solver;
    const w = S.newTestWithdrawal({ traditional: 100000, bondTraditional: 50000 }, null);
    S.takeTraditional(w, 'bondTraditional', 10000, undefined, false, true); // the bond reserve's uncapped draw
    const afterReserve = w.cappableTraditional;
    S.takeTraditional(w, 'traditional', 10000); // a capped stock-account draw
    return { afterReserve, after: w.cappableTraditional, gross: w.traditionalWithdrawn };
  });
  assert.strictEqual(r.afterReserve, 0, 'reserve draw is not cappable');
  assert(r.after > 0 && Math.abs(r.after - (r.gross - (r.gross - r.after))) < 1e-9, 'stock draw is cappable');
}
```

If `takeTraditional` is not exported on `window.__test_solver`, add it there (US-only hook object, not shared).

In `tests/solver_hooks.js`, add two `movedSample` cases and one line-id case, using the file's existing `lambdaEstimate` call helper (copy the argument object it already uses for the B5b "walk empties the pool" case):

```js
// movedSample: the walk empties a small pool before the first RMD sample.
{
  const out = await page.evaluate(() => window.__test_solver.lambdaEstimate({ tradPool: 30000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, need: 50000, tradShare: 1 }));
  assert.strictEqual(out.movedSample, true, 'pool emptied before a sample');
}
{
  const out = await page.evaluate(() => window.__test_solver.lambdaEstimate({ tradPool: 30000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1 }));
  assert.strictEqual(out.movedSample, false, 'no draws: no sample moves');
}
// Line ids: an MFJ household on the ACA at 62 sees aca400 / acaFloor / medicaid with ret 'H'.
{
  const lines = await page.evaluate(() => {
    const S = window.__test_solver;
    return S.magiThresholds({ year: 0, filing: 'mfj', twoReturns: false, profile: { ownerShareA: 0.5 }, preMagi: 50000, preMagiA: 25000, preMagiB: 25000,
      acaEligibleA: true, acaEligibleB: true, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
      workingA: false, workingB: false, age: 62, ageB: 62 });
  });
  for (const l of lines) assert(l.id && l.ret === 'H' && l.family, 'every line carries id/ret/family: ' + JSON.stringify(l));
  assert(lines.some((l) => l.id === 'aca400' && l.family === 'aca'), 'aca400 present');
}
```

Run the state patch the file uses for its other `magiThresholds` cases (ACA on, enhanced off, a Medicaid-expansion state) so the three ACA lines exist; adjust the patch, not the assertions.

- [ ] **Step 2: Run them; they fail.** `node tests/solver_primitives.js` and `node tests/solver_hooks.js`. Expected: FAIL on `cappableTraditional` undefined, `movedSample` undefined, `id` undefined.

- [ ] **Step 3: Implement.**

`newWithdrawal`: add `cappableTraditional: 0,` next to `traditionalWithdrawn`.

`takeTraditional`, after `wd.traditionalWithdrawn += fromTrad;`:
```js
    if (!penalized && !uncapped) wd.cappableTraditional += fromTrad;
```
`cloneWithdrawal` / `adoptWithdrawal` copy every scalar field already; nothing else to change.

`lambdaEstimate`: declare `let moved = false;` beside `rateSum`; in the sample loop, after `const [ys, trad, draw] = ...`, add `if (ys !== ys0) moved = true;`; return `{ lambda: ..., tauGain: ..., movedSample: moved }`.

`magiThresholds`: change `add` to take `(magi, label, id, ret, family)` and push `{ magi, label, id, ret, family }`. `acaLines(fpl, put)` passes ids: `put(fpl * mcd, 'Medicaid line', 'medicaid')`, `put(fpl * MEDICAID_RULES.ptcFloor, 'ACA credit floor (100%)', 'acaFloor')`, `put(fpl * 4, 'ACA 400% line', 'aca400')`; the callers pass `ret` and `family: 'aca'`: two returns A -> `'A'`, B -> `'B'`, otherwise `'H'`. IRMAA: number the finite edges 1..n in table order (`'irmaa' + k`), family `'irmaa'`, ret `'A'` / `'B'` on two returns, else `'H'`. Senior and CTC lines: ids `'senior'` / `'ctc'`, family `'tax'`, ret `'H'`. Dedup and sort are unchanged (the first of two lines within $1 is kept, as today).

- [ ] **Step 4: Run.** The two files pass; `npm test` passes with every snapshot identical (`tests/snapshot.js` prints no change).

- [ ] **Step 5: Commit.**
```bash
git commit -m "Cliff plan 1: cappable traditional draw, lambda movedSample flag, line ids (no number change)" -- Planner_US.html tests/solver_primitives.js tests/solver_hooks.js
```

---

### Task 2: The US ending after-tax value (no number change)

**Files:**
- Modify: `Planner_US.html` (end of `runProjection`; new `afterTaxEndValueUS` after it; a test hook)
- Create: `tests/end_value_us.js`; add `node tests/end_value_us.js` to the `test` script in `package.json` after `tests/cliff_guard.js`.

**Interfaces:**
- Produces: `sim.estate` (non-enumerable) `{ traditional, roth, taxable, cash, homeEquity, profile, lastGain, lastTrad }`; `afterTaxEndValueUS(sim) -> number` (standard runs only: it reads `taxIndexFactor`, which a historical run's per-path factors no longer feed once `simulateHistorical` returns); `window.__test_afterTaxEndValueUS(sim)`.

- [ ] **Step 1: Write the failing test** `tests/end_value_us.js` (open the planner like `tests/cliff_guard.js` does, clock pinned to 2026-06-15):

```js
// Cliff plan (spec section 5): the ending value counts traditional money net of the income tax it carries, as ten
// slices of the balance on the last year's own return. Hand-computed, 2026 law, inflation 0 (index factor 1).
// Single, 60 -> 61, Texas, 1,000,000 in a traditional IRA, 1,000,000 taxable at 100% basis (spending comes from it,
// no gains), no Social Security, pension, dividends, healthcare or Medicare.
// One slice: 100,000 of ordinary income; standard deduction 16,100 (under 65: no add-on, no senior deduction);
// taxable 83,900; tax 10% x 12,400 + 12% x 38,000 + 22% x 33,500 = 1,240 + 4,560 + 7,370 = 13,170. Ten slices: 131,700.
const PATCH = { singlePerson: true, filingStatus: 'single', marryLater: false, survivorEnabled: false, children: [],
  ageA: 60, retireAgeA: 60, lifeExpectancyA: 61, inflation: 0, medicalInflation: 0, returnRate: 0, bondReturn: 0, hysaRate: 0,
  incomeA: 0, taxable: 1000000, basisRatio: 100, cash: 0, cashReserve: 0, bondYears: 0, spending: 20000,
  tradIraA: 1000000, trad401kA: 0, rothIraA: 0, roth401kA: 0, rothIraBasisA: 0, ssMonthlyA: 0, pensionYearlyA: 0,
  stateTax: 'tx', acaEnabled: false, healthcare: 0, medicareYearly: 0, ltcEnabled: false, rothConvEnabled: false,
  withdrawalMixEnabled: false, smoothWithdrawals: false, guardrailsEnabled: false, cliffGuardEnabled: false,
  tenure: 'rent', rent: 0, incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [], loans: [] };
```
Assertions (evaluate under the patch, restore after, like `rows()` in `tests/cliff_guard.js`):
- `Object.keys(sim).includes('estate') === false` (non-enumerable);
- `sim.estate.traditional === 1000000`, `sim.estate.lastTrad === 0`, `sim.estate.lastGain === 0`;
- `afterTaxEndValueUS(sim) === sim.estate.roth + sim.estate.taxable + sim.estate.cash + sim.estate.homeEquity + 1000000 - 131700` (exact, or within 0.01 if the bracket code yields a float).
Before asserting 131,700, confirm the brackets and deduction in the file (`ORDINARY_BRACKETS.single`, `STD_DEDUCTION.single`) and any dividend-yield input (see `tests/dividend_income.js` for its key; set it to 0 in the patch). If a figure differs, fix the hand computation in the comment and the expected number, never the code.
- A second case, the survivor: the same patch as a couple (`singlePerson: false, filingStatus: 'mfj'`, `ageB: 60, retireAgeB: 60, lifeExpectancyB: 61`, B's accounts 0) with `survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 60` (check the field names in `defaults`): `sim.estate.profile.filing === 'single'` and the value equals the single case's value.

- [ ] **Step 2: Run; it fails** (`estate` undefined).

- [ ] **Step 3: Implement.** In the year loop, after the row is pushed, keep the last year's tax inputs:
```js
        if (year === projectionYears) endTax = { profile: { ...profile }, lastGain: wd.taxableGainGross, lastTrad: wd.traditionalGross };
```
(`let endTax = null;` beside `depletedAge`; `wd` is in scope at row time in both the surplus and the withdrawal branch.) Before `return result;`, as Canada does:
```js
    // The final balances and the last year's tax inputs, for afterTaxEndValueUS (cliff plan, spec section 5): not
    // enumerable, so the result's own fields and every snapshot stay as they were.
    Object.defineProperty(result, 'estate', {
      value: {
        traditional: bal.traditional + bal.bondTraditional,
        roth: bal.roth + bal.bondRoth,
        taxable: bal.taxable + bal.bondTaxable,
        cash: bal.cash,
        homeEquity: Math.max(0, bal.home - bal.mortgage),
        profile: endTax ? endTax.profile : null,
        lastGain: endTax ? endTax.lastGain : 0,
        lastTrad: endTax ? endTax.lastTrad : 0,
      },
    });
```
After `runProjection`:
```js
  // The plan's ending value (cliff plan, spec section 5): Roth, taxable (US heirs get a stepped-up basis: no gains tax),
  // cash and home equity at face value; traditional money net of the income tax it carries, priced as ten slices of the
  // balance, each added to the last year's own return (its law, its filing status: single after a death). Not modeled:
  // heirs' own rates, the federal estate tax, state estate and inheritance taxes. Standard runs only (a historical run's
  // per-path tax factors are gone once simulateHistorical returns).
  function afterTaxEndValueUS(sim) {
    const e = sim.estate;
    if (!e || !e.profile) return 0;
    const T = e.traditional;
    let tax = 0;
    if (T > 0) tax = 10 * (taxFor(e.profile, e.lastGain, e.lastTrad + T / 10) - taxFor(e.profile, e.lastGain, e.lastTrad));
    return e.roth + e.taxable + e.cash + e.homeEquity + T - Math.max(0, tax);
  }
```
Test hook after `// @@shared:block end`: `window.__test_afterTaxEndValueUS = afterTaxEndValueUS;`.

- [ ] **Step 4: Run.** `node tests/end_value_us.js` passes; `npm test` green, snapshots identical.

- [ ] **Step 5: Commit.**
```bash
git commit -m "Cliff plan 2: US ending after-tax value (ten slices on the last return; no number change)" -- Planner_US.html tests/end_value_us.js package.json
```

---

### Task 3: Plan modes, part 1: the phased year and `choose` (no number change)

**Files:**
- Modify: `Planner_US.html` (`runProjection`; the per-year solver section; test hooks)
- Create: `tests/cliff_plan.js`; add `node tests/cliff_plan.js` to `npm test` after `tests/end_value_us.js`.

**Interfaces:**
- Consumes: Task 1's `cappableTraditional`, `movedSample`, line `id`/`ret`/`family`.
- Produces:
  - `runProjection({ ..., planMode, plan })`: `planMode` in `'legacy' | 'off' | 'choose' | 'apply'`; when `undefined`, `state.cliffGuardEnabled ? 'legacy' : 'off'` (this task). `plan` is `{ intents: { [age]: { kind, line, ret } } }` (read only in `apply`, Task 4).
  - `result.cliffIntents` (non-enumerable, `choose` only): `{ [Partner A age]: { kind: 'under' | 'fill', line, ret } }`.
  - `lineFamily(id) -> 'aca' | 'irmaa' | 'tax'`.
  - `yearPlanCandidates(c)` as in the 8a patch, plus `id`, `ret` copied onto each candidate, and `c.natTrad` fed from `wd.cappableTraditional`.
  - `window.__test_runPlanMode({ planMode, plan, rowFn, planTrace })` -> `{ rows, depletedAge, intents, sim }` (`rowFn` given: the bucket engine with `histTaxFactors` saved and restored as `simulateHistorical` does; else the standard engine; `planTrace: true` returns the trace array as `trace`).
  - `window.__test_yearPlanCandidates = yearPlanCandidates`.

- [ ] **Step 1: Write the failing tests** in `tests/cliff_plan.js`. Households come from the committed snapshot corpus so they are known to act:

```js
const { scenarios } = require('./snapshot_scenarios');
const { legacyToAccounts } = require('./legacy_balances');
const ALL = scenarios(true);
const household = (name) => { const s = ALL.find((x) => x.name === name); if (!s) throw new Error('no scenario ' + name); return s; };
// Runs runProjection in a plan mode under a scenario's patch (translated as tests/snapshot.js does) and restores state.
const runMode = (page, sc, planMode, plan = null, series = null) => page.evaluate(({ patch, planMode, plan, series }) => {
  const st = window.__test_getState(), saved = JSON.parse(JSON.stringify(st));
  try {
    Object.assign(st, patch);
    const rowFn = series ? window.__test_rowFnFor(series) : null;
    const r = window.__test_runPlanMode({ planMode, plan, rowFn });
    return JSON.parse(JSON.stringify({ rows: r.rows, depletedAge: r.depletedAge, intents: r.intents }));
  } finally { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, saved); }
}, { patch: legacyToAccounts(sc.patch, { singlePerson: !!sc.patch.singlePerson }), planMode, plan, series });
```
(`window.__test_rowFnFor(series)` is a new US-only test hook, added in this task after `// @@shared:block end`: a verbatim copy of `tests/snapshot.js`'s `rowFnFor` and its `mulberry32`, taking the same series objects (`SERIES` entries of `tests/snapshot_scenarios.js`). Every later task uses it.)

Cases for this task:
1. **`off` equals `legacy` with the guard off**, row for row (`JSON.stringify` equality), for every `std G ...` scenario and `std default`, each with `cliffGuardEnabled: false`.
2. **`choose` records intents** for `std G hoh 62 aca smooth`, `std G single 62 aca smooth`, `std G mfj 62 aca 400% default`, `std G two returns 66 irmaa default`: `Object.keys(intents).length > 0`; every intent has `kind` in under/fill, a `line` id from Task 1's list and a `ret`; no intent has a `tax`-family line.
3. **Rows label only intents:** in each `choose` run, a row has `cliffChoice` exactly when `intents[row.age]` exists, and no row has a `lambda` field.
4. **Stay-under years convert nothing:** every row whose age has an `under` intent has `rothConversion === 0` (use the row's conversion field name; check `renderTable`).
5. **`yearPlanCandidates` unit cases** ported from the 8a patch's `tests/cliff_guard.js` additions (patch lines 494-675, the `__test_yearPlanCandidates` cases): real-cliff gate, largest-cliff line, fill to the nearest floor, eligibility with `natTrad = 0`.

- [ ] **Step 2: Run; it fails** (`__test_runPlanMode` undefined).

- [ ] **Step 3: Implement `yearPlanCandidates` and the phased year.** Port the 8a patch (absolute path in Global Constraints) hunk by hunk into the current `Planner_US.html`, with these exact differences:
  - Keep `chooseYearPlan`, `cloneWithdrawal`, `adoptWithdrawal`, `NO_PLAN` and today's in-path guard block in the loop untouched: they are the `legacy` path until Task 6. Add `yearPlanCandidates` and `NO_PLANS` beside them (8a patch lines 80-198). In `underOf` and the fill object, copy `id: t.id, ret: t.ret` onto the candidate.
  - Add `function lineFamily(id) { return id.startsWith('irmaa') ? 'irmaa' : id === 'senior' || id === 'ctc' ? 'tax' : 'aca'; }`.
  - Add `planStats` beside `magiStats`: `const planStats = { intentYears: 0, applied: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0, absent: 0, rothShift: 0, irmaaStayUnders: 0, irmaaZeroSaving: 0 };` (filled in Task 4) and add `planMissed: 0` to `magiStats` (8a patch line 13).
  - `runProjection` signature: `function runProjection({ mode, source, retireAgeA, retireAgeB, trace = null, planTrace = null, planMode, plan = null })`, then `if (planMode === undefined) planMode = state.cliffGuardEnabled ? 'legacy' : 'off';` and `const phased = planMode === 'choose' || planMode === 'apply', intents = planMode === 'choose' ? {} : null;`.
  - The 8a phase variables (patch lines 230-241) and the per-pass `phasePass++` (line 250) are added for every mode; `profile.ownerShareA = ownerShareA0` stays (the legacy path needs it).
  - The conversion rule (patch lines 258-265): `if (convertsThisYear && !(phased && yearPlan.kind === 'under'))`, and the fill clamp only when `phased`.
  - The withdrawal (patch lines 268-320): when `phased`, run 8a's version (plan held on every pass: the cap, the draw, the fill); when `planMode === 'legacy'`, today's block exactly; when `off`, today's block with `guard` false (it already skips the plan).
  - The convergence edits (patch lines 323-359): `!replaying` guards and `phasePass` in place of `iter`; `magiStats.unresolved` / `forced` counted through `phaseUnresolved` / the kept phase (patch lines 351, 359, 436-438). With no phases (`off`, `legacy`) these reduce to today's behaviour: verify with case 1 and the snapshots.
  - The end-of-phase block (patch lines 372-435) runs only `if (phased && !replaying)`, with `guardOn` replaced by `phased`, and these differences:
    - natural record: `natTrad: wd.cappableTraditional` (not `realizedTrad`; 8a review finding 3) in the `yearPlanCandidates` call, and add `roth: rothWithdrawn` to `naturalRec` and to each trial record;
    - `choose` only: the candidate/score/win logic exactly as in the patch; when the final `best` is a trial, set `intents[age] = { kind: best.plan.kind, line: best.plan.id, ret: best.plan.ret }` once (before the replay `continue` if the winner needs a replay, or after the last trial if it is the last);
    - trace: as in the patch, plus `planTr.movedSample = yearLambda ? yearLambda.movedSample : false` and `planTr.intent = intents[age] || null`.
  - The seeding (patch lines 440-441), the trace push (442) and the label rule (patch lines 450-456) apply when `phased`; `legacy` keeps today's lines. `row.lambda` is set only when `planMode === 'legacy'`.
  - After the year loop, `if (intents) Object.defineProperty(result, 'cliffIntents', { value: intents });` (before the `estate` property).
  - Test hooks after `// @@shared:block end`:
```js
  // Cliff plan: one run in a given plan mode (tests and scans). rowFn: the bucket engine on that path.
  window.__test_runPlanMode = ({ planMode, plan = null, rowFn = null, planTrace = false }) => {
    const tr = planTrace ? [] : null;
    let sim;
    if (!rowFn) sim = runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode, plan, planTrace: tr });
    else {
      const prev = histTaxFactors;
      histTaxFactors = [];
      try {
        sim = runProjection({ mode: BUCKET_MODE, source: historicalYearSource(rowFn), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode, plan, planTrace: tr });
      } finally {
        histTaxFactors = prev;
      }
    }
    return { rows: sim.rows, depletedAge: sim.depletedAge, intents: sim.cliffIntents || null, trace: tr, sim };
  };
  window.__test_yearPlanCandidates = yearPlanCandidates;
  window.__test_planStats = planStats;
```

- [ ] **Step 4: Run.** `node tests/cliff_plan.js` passes; `node tests/cliff_guard.js` passes unchanged (the legacy path); `npm test` green with every snapshot identical.

- [ ] **Step 5: Commit.**
```bash
git commit -m "Cliff plan 3: plan modes off/choose with the 8a phased year (legacy guard still default; no number change)" -- Planner_US.html tests/cliff_plan.js package.json
```

---

### Task 4: Plan modes, part 2: `apply` and exact replay (no number change)

**Files:**
- Modify: `Planner_US.html` (`runProjection` end-of-phase block)
- Test: `tests/cliff_plan.js`

**Interfaces:**
- Consumes: Task 3's phased year, `yearPlanCandidates`, `planStats`, `lineFamily`.
- Produces: `planMode: 'apply'` with `plan.intents`; `planStats` counters filled (cumulative; tests reset them by assigning 0 to each key).

- [ ] **Step 1: Write the failing tests** (append to `tests/cliff_plan.js`):
  1. **Exact replay:** for each of the four Task 3 households and for `std G hoh 66 1966 household` and `std G mfj 58 aca default`, `apply` with `{ intents: choose.intents }` gives rows `JSON.stringify`-equal to `choose`, and `depletedAge` equal.
  2. **Marry-later replay** (Review Focus 4): `std G two returns 62 aca smooth` patched with `marryLater: true, marriageAgeA: 64` (check the field names in `defaults`): `choose` records at least one intent; intents before 64 that are on a return carry `ret` 'A' or 'B', later ones 'H'; replay exact.
  3. **Already on the right side:** take a `choose` plan with an `under` intent at age x; build a plan whose only intent is that one, run `apply` on the same household with spending lowered 30% (natural MAGI now under the line): the row at x has no `cliffChoice`, `planStats.skippedSide` rose by 1, rows equal `off`'s rows with the same patch.
  4. **Cannot meet the plan (fallback):** the same intent, run with `rothIraA`, `roth401kA`, `cash` and `taxable` set to 0 (nothing to switch to): row x unlabelled; `planStats.fallback` or `planStats.skippedIneligible` rose (eligibility needs a cappable draw and room); rows equal `off`.
  5. **Absent** (Review Focus 5): a hand-built plan whose only intent names a line that does not exist that year (`{ kind: 'under', line: 'irmaa1', ret: 'H' }` at an age under 63, when no IRMAA line is built), on the standard engine and on the bucket engine with the `boom` series: `planStats.absent` rose by 1 per run and the rows equal the `off` rows.
  6. **Fill:** `std G single 58 aca default` with `medicaidWhenEligible: false` (a floor at the Medicaid line): if `choose` records a `fill` intent, `apply` replays it exactly; an `apply` run with spending raised so the natural MAGI is already over the floor counts `skippedSide`.
  7. **Variant** (Review Focus 3): `apply` with the plan of `std G hoh 62 aca smooth` through `__test_runPlanMode` after setting `retireAgeA` 3 years later than the plan's household: no exception, years in which the household now works have no `cliffChoice`.

- [ ] **Step 2: Run; they fail** (`apply` falls through to `off`).

- [ ] **Step 3: Implement `apply` in the end-of-phase block** (the `trialIdx < 0`, `flow < 0` branch), beside `choose`:
```js
            const intent = planMode === 'apply' && plan && plan.intents ? plan.intents[age] : null;
            if (planMode === 'apply' && intent) {
              planStats.intentYears++;
              // lines exactly as choose builds them (same lo / hi from the converged natural year)
              const t = lines.find((l) => l.id === intent.line && l.ret === intent.ret);
              let trial = null;
              if (!t) planStats.absent++;
              else if (intent.kind === 'under') {
                if (t.magi > realizedMagi) planStats.skippedSide++;
                else if (!(wd.cappableTraditional > 0 && realizedMagi - conversionAmount > t.magi && t.magi - 1 >= lo)) planStats.skippedIneligible++;
                else trial = { kind: 'under', magi: t.magi - 1, label: t.label, id: t.id, ret: t.ret };
              } else {
                if (t.magi <= realizedMagi) planStats.skippedSide++;
                else if (!(freeTraditional(wd) > 0 && t.magi + 1 <= hi)) planStats.skippedIneligible++;
                else trial = { kind: 'fill', magi: t.magi + 1, label: t.label, id: t.id, ret: t.ret };
              }
              if (trial) {
                naturalRec = { plan: NO_PLAN, estTrad, estGain, forced: forcedPass, unresolved: phaseUnresolved, realizedTrad, gain: taxableGainGross, conversion: conversionAmount, realized: realizedMagi, roth: rothWithdrawn, ok: true };
                trials = [trial];
                trialRecs = [];
                next = 0;
              }
            }
```
The `lines` call must be the same `magiThresholds(...)` call `choose` makes (same arguments, same `lo` / `hi`), so on the deterministic run the intent's line is the very line `choose` chose. The eligibility tests are the ones `yearPlanCandidates` applies (`offerUnder`, `canFill`, the reach bounds); keep them in one place: if you can, call small helpers shared by both (`underEligible(t, c)`, `fillEligible(t, c)`) rather than duplicating the expressions.

In the trial-done branch, for `apply`:
```js
              const met = yearPlan.kind === 'under' ? realizedMagi <= yearPlan.magi + 1 : realizedMagi >= yearPlan.magi - 1,
                ok = met && wd.need <= 1;
              if (ok) {
                planStats.applied++;
                if (yearPlan.kind === 'under') planStats.rothShift += rothWithdrawn - naturalRec.roth;
                if (yearPlan.kind === 'under' && lineFamily(yearPlan.id) === 'irmaa' && yearPlan.ret === 'H')
                  irmaaChecks.push({ y: year + 2, filing: irmaaFiling2(), nat: naturalRec.realized, trial: realizedMagi });
              } else {
                planStats.fallback++;
                // replay the natural year's final pass, exactly as choose replays a non-last winner
                yearPlan = NO_PLAN; estTrad = naturalRec.estTrad; estGain = naturalRec.estGain;
                forcedPass = naturalRec.forced; phaseUnresolved = naturalRec.unresolved; replaying = true;
                continue;
              }
```
No lambda, no score, no healthcare test in `apply` (spec section 6). After the year loop (still inside `runProjection`, where a historical run's tax factors are complete):
```js
    // Cliff plan scan measure (spec 6, "Known, accepted"): a path stay-under under an IRMAA line saves nothing when the
    // path's own charged tier puts both MAGIs in the same tier.
    for (const c of irmaaChecks) {
      if (c.y > projectionYears) continue;
      planStats.irmaaStayUnders++;
      if (irmaaSurcharge(c.nat, c.filing, c.y) === irmaaSurcharge(c.trial, c.filing, c.y)) planStats.irmaaZeroSaving++;
    }
```
(`const irmaaChecks = [];` beside `rows`.)

- [ ] **Step 4: Run.** `node tests/cliff_plan.js` passes; `npm test` green, snapshots identical (`legacy` is still the default).

- [ ] **Step 5: Commit.**
```bash
git commit -m "Cliff plan 4: apply mode (literal, with fallback) and exact replay (no number change)" -- Planner_US.html tests/cliff_plan.js
```

---

### Task 5: The keep rule and `refreshCliffPlan` (no number change)

**Files:**
- Modify: `Planner_US.html` (new functions after `afterTaxEndValueUS`; test hooks)
- Test: `tests/cliff_plan.js`

**Interfaces:**
- Consumes: Tasks 2 to 4.
- Produces:
  - `let cliffPlan = null, cliffPlanKey = null, cliffPlanReport = null;` (module level, beside `magiStats`).
  - `refreshCliffPlan()` sets all three. `cliffPlan`: `null` when the guard is off; else `{ intents, family: 'all' | 'aca' | 'irmaa' | 'none', madeFor: cliffPlanKey }`. `cliffPlanKey = JSON.stringify(state)` at the time of the refresh (also when the guard is off). `cliffPlanReport`: `{ candidates: [{ family, intents: count, depletedAge, value, cost }], kept: family }`.
  - `planCandidateBetter(a, b) -> boolean` (rule A).
  - `window.__test_refreshCliffPlan()` -> `{ plan: cliffPlan, report: cliffPlanReport }`.

- [ ] **Step 1: Write the failing tests** (append):
  1. **Rule A ordering** (pure, through a hook `window.__test_planCandidateBetter`): `{dep: null, value: 0, n: 3}` beats `{dep: 90, value: 9e6, n: 0}`; `{dep: 90, value: 100, n: 2}` beats `{dep: 89, ...}`; same depletion, value higher by 2 wins, by 1 does not; equal value, fewer intents wins; `off` (n 0) is never beaten by a tie.
  2. **The kept plan is never worse than `off`** on the standard projection for every `std G ...` scenario: from `__test_refreshCliffPlan()`, the kept candidate's `depletedAge` is never earlier than `off`'s, and when equal its value is at least `off`'s.
  3. **Family subsets:** for a household whose `choose` plan has both an `aca`-family and an `irmaa`-family intent (search the `std G` scenarios and the 768-household grid's patches from `tests/solver_scan.js` until one is found; record which in a comment), the report lists four candidates (`all`, `aca`, `irmaa`, `none`); a household with one family lists two.
  4. **Guard off:** `cliffGuardEnabled: false` gives `plan === null`.
  5. **The `all` candidate costs no projection:** the report's `all` entry equals an `apply` run of the same intents (depletion, value, cost), i.e. it was taken from the `choose` run.

- [ ] **Step 2: Run; they fail.**

- [ ] **Step 3: Implement** after `afterTaxEndValueUS`:
```js
  // Cliff plan (spec sections 3 and 5): chosen once per render on the deterministic projection. Candidates: the chooser's
  // whole plan (its own run: apply would reproduce it exactly), the ACA-family and IRMAA-family subsets when both families
  // appear, and no steering. Rule A: later depletion first, then the ending after-tax value by more than $1, then fewer
  // intents. Lifetime real tax plus healthcare is reported, never ranked.
  let cliffPlan = null,
    cliffPlanKey = null,
    cliffPlanReport = null;
  function planCandidateBetter(a, b) {
    const da = a.depletedAge == null ? Infinity : a.depletedAge,
      db = b.depletedAge == null ? Infinity : b.depletedAge;
    if (da !== db) return da > db;
    if (a.value > b.value + 1) return true;
    if (b.value > a.value + 1) return false;
    return a.n < b.n;
  }
  function refreshCliffPlan() {
    cliffPlanKey = JSON.stringify(state);
    cliffPlan = null;
    cliffPlanReport = null;
    if (!state.cliffGuardEnabled) return;
    const run = (planMode, plan) =>
      runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planMode, plan });
    const infl = pct(state.inflation);
    const measure = (family, intents, sim) => {
      let cost = 0;
      for (const r of sim.rows) cost += (r.tax + r.healthcare) / Math.pow(1 + infl, r.year);
      return { family, intents, n: Object.keys(intents).length, depletedAge: sim.depletedAge, value: afterTaxEndValueUS(sim), cost };
    };
    const chosen = run('choose', null),
      all = chosen.cliffIntents,
      pick = (fam) => Object.fromEntries(Object.entries(all).filter(([, i]) => lineFamily(i.line) === fam));
    const cands = [measure('none', {}, run('off', null))];
    const fams = new Set(Object.values(all).map((i) => lineFamily(i.line)));
    if (fams.size > 1)
      for (const fam of ['aca', 'irmaa']) {
        const sub = pick(fam);
        cands.push(measure(fam, sub, run('apply', { intents: sub })));
      }
    if (fams.size) cands.push(measure('all', all, chosen));
    let best = cands[0];
    for (const c of cands.slice(1)) if (planCandidateBetter(c, best)) best = c;
    cliffPlan = { intents: best.intents, family: best.family, madeFor: cliffPlanKey };
    cliffPlanReport = { candidates: cands.map(({ intents, ...rest }) => rest), kept: best.family };
  }
```
(`r.tax` and `r.healthcare` are the fields `tests/solver_scan.js` already sums; keep the same definition.) Test hooks: `window.__test_refreshCliffPlan = () => { refreshCliffPlan(); return JSON.parse(JSON.stringify({ plan: cliffPlan, report: cliffPlanReport })); };` and `window.__test_planCandidateBetter = planCandidateBetter;`.

- [ ] **Step 4: Run.** Passes; `npm test` green, snapshots identical (nothing calls `refreshCliffPlan` yet except the hook).

- [ ] **Step 5: Commit.**
```bash
git commit -m "Cliff plan 5: keep rule (rule A) and refreshCliffPlan with family subsets (no number change)" -- Planner_US.html tests/cliff_plan.js
```

---

### Task 6: The switch (the intended number change)

**Files:**
- Modify: `Planner_US.html`, `tests/cliff_guard.js`, `tests/historical_parity.js`, `tests/solver_primitives.js` (only where they reference removed legacy pieces), `tests/snapshots/us.json` (via `npm run snapshot:update`), `README.md`, `CLAUDE.md`
- Create: `tests/plan_off_anchor.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `runProjection` default `planMode = cliffPlan ? 'apply' : 'off'` with `plan = cliffPlan`; US-only wrappers redefining `window.__test_simulate`, `__test_simulateHistorical`, `__test_runHistoricalCycles`, `__test_runMonteCarlo`, `__test_accountTrace` to call `ensureTestPlan()` first; raw hooks `window.__test_simulateRaw = simulate`, `window.__test_simulateHistoricalRaw = simulateHistorical`; `window.__test_planTrace(rowFn)`: standard `choose` trace without `rowFn`, an `apply` trace on that path with it.

- [ ] **Step 1: Write the off-anchor script** `tests/plan_off_anchor.js --base DIR`: open `DIR/Planner_US.html` and this tree's in two pages (clock pinned as in `tests/snapshot.js`); for every US scenario in `tests/snapshot_scenarios.js` run it with the scenario patch plus `{ cliffGuardEnabled: false }` through `__test_simulate` / `__test_simulateHistorical` (translate with `legacyToAccounts` as the snapshot harness does; reuse its `resetState` and `rowFnFor` code); compare `JSON.stringify` of canonical rows (copy `canon` from `tests/snapshot.js`) and print the count identical / different; exit 1 on any difference. Run it now against `../fp-3c-A`: expected all identical.

- [ ] **Step 2: Switch the default and remove the legacy path.**
  - `if (planMode === undefined) { planMode = cliffPlan ? 'apply' : 'off'; plan = cliffPlan; }`.
  - Delete the legacy in-path block (the `guard && iter === 0 && !forcedPass` plan context, `planWinner`, `adoptWithdrawal` use), `chooseYearPlan`, and any of `cloneWithdrawal` / `adoptWithdrawal` / `NO_PLAN` fields left unused; remove their test exports and the `tests/solver_primitives.js` cases that only tested them (8a patch lines 695-722 show which). `row.lambda` is gone everywhere (the trace keeps lambda).
  - `render()`: first line `refreshCliffPlan();`.
  - State replacement: right after each `state = normalizeState(...)` / `state = {` at the sites listed in the File map, add `cliffPlan = null; cliffPlanKey = null;` (render follows each of them; the clear is the safety net, spec section 3).
  - After `// @@shared:block end` (US only):
```js
  // Cliff plan in tests: a test changes state and calls a shared hook without render(), so the hooks plan for the state
  // they see (production plans in render()). Benchmarks use the raw hooks after one explicit refresh.
  const ensureTestPlan = () => {
    if (JSON.stringify(state) !== cliffPlanKey) refreshCliffPlan();
  };
  window.__test_simulateRaw = simulate;
  window.__test_simulateHistoricalRaw = simulateHistorical;
  window.__test_setCliffPlan = (p) => { cliffPlan = p; cliffPlanKey = JSON.stringify(state); }; // scans: run a path with no plan
  window.__test_simulate = (...a) => (ensureTestPlan(), simulate(...a));
  window.__test_simulateHistorical = (...a) => (ensureTestPlan(), simulateHistorical(...a));
  window.__test_runHistoricalCycles = (...a) => (ensureTestPlan(), runHistoricalCycles(...a));
  window.__test_runMonteCarlo = (...a) => (ensureTestPlan(), runMonteCarlo(...a));
```
  and wrap the existing `window.__test_accountTrace` the same way. `ensureTestPlan` must not be called from production code.

- [ ] **Step 3: Run the anchor and the new tests.** `node tests/plan_off_anchor.js --base ../fp-3c-A` (all identical: guard-off is untouched); `node tests/cliff_plan.js` (all pass; Task 3 case 1 now compares `off` with the default guard-off run).

- [ ] **Step 4: Rewrite `tests/cliff_guard.js` to the plan semantics.** Keep every household it builds; change what is asserted from "the guard chose X this year" to: `__test_refreshCliffPlan()` keeps a plan with intent X at that age (or keeps `none`, with the report showing why), and `__test_simulate` rows label it. The mutation check of case 1 (removing the cap changes the result) stays, run through `apply`. Delete cases that tested only the legacy dry run; list them in the commit message.

- [ ] **Step 5: `tests/historical_parity.js`.** Its parity groups run with the plan applied (the hooks plan); add a check that `apply` with an empty plan equals `off` on the standard and the bucket engine for the parity households. Update its source-wiring checks for the removed legacy code (8a patch lines 676-694 show the shape).

- [ ] **Step 6: Run the whole suite and dump the movers.**
```bash
node tests/snapshot.js --root ../fp-3c-A --dump A --update-nothing
node tests/snapshot.js --dump B
node tests/snapshot.js --compare A B
```
Build the movers table (scenario | first moved age | depletion before -> after | end value change), as in the "Stage A result" list in the 3C notes. Check the hard rules: no `std` scenario depletes earlier than at `3ebee0e`; for every `std` scenario the kept plan's depletion is not earlier than `off`'s (Task 5 case 2 covers the `std G` set; also run `__test_refreshCliffPlan` over every `std` scenario in a short loop and assert it). Historical movers may move either way: explain each depletion change in one line (which intent, which year, the path's market). If any `std` scenario depletes earlier: stop and report.

- [ ] **Step 7: `npm run snapshot:update`**, then `npm test` green. Also run the root scripts that drive the optimizer and the mix: `node test_apply_optimizer_schedule.js`, `node test_live_withdrawal_mix.js`, `node test_multi_lever_optimizer.js`, `node test_roth_optimizer_per_year.js`; fix only test expectations that pinned legacy-guard numbers, and list them.

- [ ] **Step 8: Docs and badge.** US badge V116 -> V117; `README.md`: the cliff-guard feature line becomes the cliff plan (chosen on the plan's assumptions, applied unchanged in historical and Monte Carlo runs, kept only if it lasts at least as long and leaves more after tax than no steering); `CLAUDE.md`: rewrite the "Per-year solver (3C, US ...)" bullet to the plan (modes, `refreshCliffPlan`, rule A, `apply` semantics, `ensureTestPlan` for tests, `estate` / `afterTaxEndValueUS`, `planStats`, the scripts) and remove what no longer exists (`chooseYearPlan`, the dry runs, `row.lambda`).

- [ ] **Step 9: Stale-plan test** (Review Focus 1), in `tests/cliff_plan.js`: load a scenario whose plan has intents, call `__test_refreshCliffPlan()`, then replace the state through the app's import path (find the function behind the `state = normalizeState(scenarioState)` sites; drive it the way `test_*.js` scripts import a scenario, or call it through a test hook you add) with a household that has no line in reach; assert the next `__test_simulateRaw()` (no auto-plan) gives rows equal to that household's `off` run.

- [ ] **Step 10: Commit** (snapshot update in the same commit, with the movers table in the message body or in the batch notes of Task 10, and the cliff_guard cases removed listed):
```bash
git commit -m "Cliff plan 6: the switch: plan chosen once per render, applied everywhere; in-path guard removed (V117; snapshot update)" -- Planner_US.html tests/ README.md CLAUDE.md
```

---

### Task 7: Label, info bubble, summary line, row tooltip (user-facing, no number change)

**Files:**
- Modify: `Planner_US.html` (markup ~534; "More results" card; `render()`; `annotateSolverRows`)
- Test: `tests/cliff_plan.js`, `tests/snapshot_ui.js` baseline (`npm run snapshot:update` covers the UI snapshot only if it moves: say so in the commit)

**Interfaces:**
- Consumes: `cliffPlan`, `cliffPlanReport`.
- Produces: `cliffPlanSummary(plan, report) -> string`; `#cliffPlanSummary` element.

- [ ] **Step 1: Write the failing tests:** `cliffPlanSummary` for (a) guard off -> "Cliff plan: off."; (b) an empty plan -> "Cliff plan: no steering helps this plan."; (c) intents `{60: under aca400, 61: under aca400, 62: under aca400, 58: fill medicaid}` with report kept `aca` and an `irmaa` candidate present -> "Cliff plan: stay under the ACA 400% line at 60-62; fill to the Medicaid line at 58. IRMAA stay-unders not used (no gain over the whole plan)."; (d) after a render the element's text equals `cliffPlanSummary(cliffPlan, cliffPlanReport)`; (e) a row with `cliffChoice` gets the tooltip `Income stayed under ACA 400% line` and nothing about lambda, order or split; (f) on a household whose plan keeps intents, unchecking `#cliffGuardEnabled` through the DOM (click, then wait for the render) makes `window.fireProjectionRows` equal the `off` rows (`__test_runPlanMode({ planMode: 'off' })`), and checking it again restores the labelled rows and a non-empty summary line.

- [ ] **Step 2: Run; they fail.**

- [ ] **Step 3: Implement.**
  - Label: "Cliff plan"; `<small>`: "Steer income around cost lines, planned once"; `data-tip`: the spec section 7 text verbatim.
  - `cliffPlanSummary`: group consecutive ages with the same `kind` + `line` into runs ("60-62", single ages "58"); line names: `aca400` "the ACA 400% line", `acaFloor` "the ACA credit floor", `medicaid` "the Medicaid line", `irmaa<k>` "IRMAA tier <k>", with "(Partner A's return)" / "(Partner B's return)" when `ret` is A / B; verbs "stay under" / "fill to"; then, for each family that had a candidate in the report but was not kept: "ACA stay-unders not used" / "IRMAA stay-unders not used" + " (no gain over the whole plan)".
  - Markup: a `<p id="cliffPlanSummary" class="hint">` at the top of the "More results" card body; `render()` sets its text.
  - `annotateSolverRows`: `cliffChoice` only (drop the `mixOrder`, `drawSplit` and `lambda` parts).
  - Badge V117 -> V118 (a second user-facing commit).

- [ ] **Step 4: Run** the tests, `npm test`, and the mobile check: at 390x844, `document.documentElement.scrollWidth > document.documentElement.clientWidth` is `false` with a long summary line (use a household with intents in both families).

- [ ] **Step 5: Commit.**
```bash
git commit -m "Cliff plan 7: label, info bubble, plan summary line, row tooltip (V118)" -- Planner_US.html tests/cliff_plan.js tests/snapshots/ README.md
```

---

### Task 8: Scan, timing, measurements (scripts only; no number change)

**Files:**
- Modify: `tests/solver_scan.js`, `tests/bench_runs.js`, `tests/bench_solver.js`
- Create: `tests/bench_plan.js`

- [ ] **Step 1: Benches use the raw hooks.** In `bench_runs.js` and `bench_solver.js`, after the state is set: `if (window.__test_refreshCliffPlan) window.__test_refreshCliffPlan();` once, then time `(window.__test_simulateRaw || window.__test_simulate)` and `(window.__test_simulateHistoricalRaw || window.__test_simulateHistorical)`. Both still run unchanged on `../fp-3c-pre`.

- [ ] **Step 2: `tests/bench_plan.js`** (planning gate, one tree): for the default household, the ACA early retiree in California (the `bench_solver.js` household), Texas with no cliff in reach (`stateTax: 'tx', acaEnabled: false`, age 66, spending 60k) and one household where the plan keeps intents (from Task 5 case 3): median of 15 interleaved rounds of `__test_refreshCliffPlan()` and of one `__test_runPlanMode({ planMode: 'off' })`; print the ratio; exit 1 if any ratio is over 5.

- [ ] **Step 3: Extend `tests/solver_scan.js`** (the grid and patches stay). Per household and mode, replace the guard on/off pair with:
  - `plan = __test_refreshCliffPlan()`: the kept family and the report;
  - standard: `__test_simulateRaw()` (plan applied) vs `__test_runPlanMode({ planMode: 'off' })`: depletion, value (`__test_afterTaxEndValueUS`), cost; exit 1 if the plan run depletes earlier than `off` (cannot happen by construction; the scan asserts it);
  - historical (all start years, `runHistoricalCycles` through the raw path with the plan, then with `cliffPlan` cleared through a hook `__test_setCliffPlan(null)`) and seeded Monte Carlo (200 paths, fixed seed: build the paths with the snapshot harness's `mulberry32` + block bootstrap and run them through `__test_runPlanMode({ planMode: 'apply', plan, rowFn })` and `planMode: 'off'`): success rates with and without the plan; per-path earlier / later depletion counts (information only);
  - `planStats` deltas over the historical and Monte Carlo runs: `intentYears`, `applied`, `skippedSide`, `skippedIneligible`, `fallback`, `absent`, `rothShift` (compare with the standard run's own `rothShift`), `irmaaStayUnders`, `irmaaZeroSaving`;
  - from `__test_planTrace()`: the years with `movedSample`, and whether the family containing those years was rejected by the keep rule; report the count of households where a family with moved-sample years was rejected, and where it was kept.
  Print the tables in the same markdown style; keep `--json` and `--md`.

- [ ] **Step 4: Run and record.**
```bash
node tests/plan_off_anchor.js --base ../fp-3c-A
node tests/solver_scan.js --md ../fp-cliff-plan-scan.md
node tests/bench_runs.js --root ../fp-3c-pre
node tests/bench_runs.js
node tests/bench_solver.js --base ../fp-3c-pre
node tests/bench_plan.js
node tests/historical_rates.js --root ../fp-3c-A
node tests/historical_rates.js
```
Compare `bench_runs` per state against `24f6585` (median of 3; the gate is +5%, +8% accepted and documented); `bench_solver` for the ACA early retiree (+30%). Any gate over: Task 9; still over after Task 9: stop and report with the numbers.

- [ ] **Step 5: Commit** the scripts (no planner change):
```bash
git commit -m "Cliff plan 8: scan with/without rates, path counters, moved-sample cross; planning bench; raw hooks in benches" -- tests/solver_scan.js tests/bench_runs.js tests/bench_solver.js tests/bench_plan.js
```

---

### Task 9 (only if a timing gate missed): number-neutral speedups

- [ ] Allowed, each verified by `npm test` with snapshots identical to Task 7 and `tests/plan_off_anchor.js` still identical: reuse the kept candidate's run as `render()`'s `selected` instead of calling `simulate()` again (identical by the replay test); skip building `lines` in an `apply` year with no intent; avoid allocations in the phase records on the `off` path. Not allowed: any new threshold, skip rule or gate. Re-run Task 8 Step 4's benches; commit with the before/after timings in the message. Still over: stop and report.

---

### Task 10: Batch notes

**Files:** `docs/next-batches-plan.md`

- [ ] Add "##### Cliff plan: implementation (V117-V118)" after "Redesign: the cliff plan" in the 3C notes: commits and what each did; the off-anchor result; the movers table with one-line explanations; the scan tables (kept families, standard value/cost/depletion vs `off`, historical and Monte Carlo success with/without, path counters, IRMAA zero-saving share, moved-sample cross); the timing table (per state, ACA, planning ratios); any test expectations changed and why; anything the owner must decide. Update the "3C" status line in the Batch 3 section to "cliff plan implemented on `claude/3c-cliff-plan`".
- [ ] Commit: `git commit -m "Cliff plan 10: batch notes" -- docs/next-batches-plan.md`. Then report to the owner: the branch tip, every gate's number, the movers, and open questions. Do not push.
