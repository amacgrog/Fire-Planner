# IRMAA MAGI (taxable Social Security only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every IRMAA amount, line and cap in the US planner use Medicare's MAGI (AGI plus tax-exempt interest: only the taxable part of Social Security), while the ACA, Medicaid and every steering comparison keep the engine's ACA-definition MAGI.

**Architecture:** Two pure primitives (`irmaaMagiOf`, its exact inverse `magiForIrmaaLine`) next to `irmaaSurcharge`; the IRMAA charge reads a new `irmaaMagiHistory` (and per-return siblings); the solver's IRMAA estimate, the IRMAA lines, the conversion ceiling's IRMAA cap and lambda's IRMAA step convert through the primitives. One MAGI scale for steering: IRMAA edges are translated into it, as two-return lines already are.

**Tech Stack:** a single-file HTML app (`Planner_US.html`, one inline `<script>` IIFE), Node + Playwright test scripts (`tests/*.js`), no build step.

**Spec:** `docs/superpowers/specs/2026-10-07-irmaa-magi-design.md` (read it first). Background: `CLAUDE.md` ("MAGI iteration", "Two-return years", "Per-year solver"), the cliff plan spec `docs/superpowers/specs/2026-10-07-cliff-plan-design.md`.

## Global Constraints

- Start only after the cliff plan (`docs/superpowers/plans/2026-10-07-cliff-plan.md`) is complete and accepted by the owner (accepted 2026-10-08). Base: the V119 badge commit on `claude/3c-cliff-plan` (call it CLIFF_TIP; `git -C ../fp-cliff-plan rev-parse HEAD` right after that commit). The cliff branch is NOT merged first: this branch stacks on it and both merge together later (owner decision 2026-10-08). This fix's user-facing commit takes the badge V119 -> V120. Work in a new worktree: `git worktree add ../fp-irmaa-magi -b claude/irmaa-magi CLIFF_TIP`; baseline worktree for snapshots and timing: `git worktree add --detach ../fp-irmaa-base CLIFF_TIP`. Run `npm install` in each if `node_modules` is missing.
- Never touch `C:\Users\Alex\code\Fire-Planner`'s working tree, its stashes or `.superpowers/`. Never push, never open a PR.
- No change to any `@@shared` region and no change to `Planner_Canada.html`. Every function this plan edits (`taxFor`, `irmaaSurcharge` neighbours, `healthcareCost`, `conversionMagiCeiling`, `magiThresholds`, `lambdaEstimate`, `runProjection`) is US-only at CLIFF_TIP; confirm with the region markers before editing, and stop if one is inside a region. `npm run check:shared` must pass after every task.
- Windows CRLF working tree; never run `npm run sync`.
- Hard rules (stop and report to the owner if any fails):
  - Task 1 changes no number: snapshots identical.
  - Task 2: every snapshot scenario whose household has no Social Security benefit in any year is byte-identical; no standard snapshot scenario runs out earlier than at CLIFF_TIP; every mover re-explained (`node tests/snapshot.js --root ../fp-irmaa-base --dump A --update-nothing`, `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`, a before/after table) with `npm run snapshot:update` in the same commit.
  - The ACA premium, the Medicaid line and the 400%-FPL guard do not change: rows' `magiProxy`, `magiA`, `magiB` are identical in every scenario (Task 2 Step 6 checks it).
  - No heuristic, threshold or gate the spec does not name.
- Timing (Task 3): against CLIFF_TIP, interleaved in one process, medians: per path +5% for no-cliff households and for the ACA early retiree; `tests/bench_plan.js` ratios still at most 5.
- Docs in the user-facing commit (Task 2): `README.md` IRMAA line, `CLAUDE.md`, the US badge (the `<span>V…</span>` in the `<h1>`) +1. Findings go in `docs/next-batches-plan.md` ("IRMAA MAGI fix" notes), never in `docs/reference.md`.
- Each commit: `npm test` green. Commit only the paths you changed: `git commit -m "..." -- <paths>`, message ending with `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.

## Review Focus

1. **A survivor year** (one-person return after a death, filing single or qualifying surviving spouse): the benefit converted is the survivor's (`profile.ssA` after the remap) and the Social Security base is the single column (`qss` reads single bases). Pinned in Task 2, Step 1, case (d).
2. **Two returns with children** (an unmarried couple; A files head of household): A's IRMAA MAGI uses the head-of-household Social Security base column through `returnStatusA`; B's the single one. Pinned in Task 2, Step 1, case (b).
3. **The plan's first two years** without prior entries: the stand-in reads `irmaaMagiHistory[0]`, now IRMAA MAGI; with `irmaaPriorKnown` the user's entries are used as entered (already IRMAA MAGI). Pinned in Task 2, Step 1, case (e).
4. **A cliff-plan IRMAA intent recorded before the fix** cannot exist (plans are recomputed each render), but the intent ids must be unchanged so the summary line and labels still read; pinned by Task 2, Step 1, case (c) (line ids and families unchanged, only the MAGI moves).
5. **Exclusive top-tier bound** (`irmaaTierCeiling` returns cap - 0.01): the inverse of a ceiling one cent under the bound keeps the conversion under the bound in IRMAA MAGI. Pinned in Task 1, Step 1 (round trip at `499999.99`).

---

## File map

- `Planner_US.html`:
  - New, just after `irmaaTierCeiling` (~7105): `irmaaMagiOf`, `magiForIrmaaLine`, `returnStatusA`, `irmaaSsOf`.
  - `taxFor` two-filer branch (~6785): `statusA` via `returnStatusA`.
  - `healthcareCost` (~8468): IRMAA history parameters.
  - `conversionMagiCeiling` (~8610): `profile` argument, IRMAA cap through the primitives.
  - `magiThresholds` (~8790): IRMAA lines through `magiForIrmaaLine`.
  - `lambdaEstimate` (~8861): IRMAA step through `irmaaMagiOf`.
  - `runProjection` year loop (~9747 declarations, ~9976 ceiling call, ~10017 `hcArgs`, ~10050 `irmaaAt`, ~10080 provisional writes, ~10399 realized writes, the `irmaaChecks` push).
  - `window.__test_tax` (after `// @@shared:block end`): export the primitives.
  - The healthcare callout markup (~709, US-only), the badge.
- `tests/irmaa_magi.js` (new, in `npm test` via `package.json`).
- Tests whose IRMAA expectations may move: `tests/irmaa_startup.js`, `tests/two_return_magi.js`, `tests/solver_hooks.js`, `tests/cliff_guard.js`, `tests/cliff_plan.js`, `tests/medicare_enrollment.js`, `tests/irmaa_gating.js`.
- `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`.

---

### Task 1: The primitives (no number change)

**Files:**
- Modify: `Planner_US.html` (new functions after `irmaaTierCeiling`; `taxFor`'s `statusA`; `window.__test_tax`)
- Create: `tests/irmaa_magi.js`
- Modify: `package.json` (add `node tests/irmaa_magi.js` to the `test` script, after `tests/irmaa_startup.js` if it is listed, else at the end)

**Interfaces:**
- Produces: `irmaaMagiOf(magi: number, ss: number, filing: string) -> number`; `magiForIrmaaLine(line: number, ss: number, filing: string) -> number`; `returnStatusA(dependents: Array|undefined) -> 'hoh'|'single'`; `irmaaSsOf(profile) -> number` (`profile.singlePerson ? (profile.ssA || 0) : (profile.ssA || 0) + (profile.ssB || 0)`); all four on `window.__test_tax`.

- [ ] **Step 1: Write the failing test** `tests/irmaa_magi.js` (Task 1 part; Task 2 appends engine cases):

```js
// IRMAA MAGI: Medicare's MAGI is AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), so only the TAXABLE part of
// Social Security counts; the ACA's MAGI (26 U.S.C. 36B(d)(2)(B)) counts all of it. The engine's MAGI is the ACA one;
// irmaaMagiOf converts, magiForIrmaaLine inverts. Spec: docs/superpowers/specs/2026-10-07-irmaa-magi-design.md.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // --- Hand-computed irmaaMagiOf (SS bases: single 25,000 / 34,000 / 4,500; joint 32,000 / 44,000 / 6,000) ---
  const r = await page.evaluate(() => {
    const t = window.__test_tax;
    return {
      // Single, benefit 30,000, no other income: provisional 15,000 <= 25,000, nothing taxable. MAGI 30,000 -> 0.
      lowSingle: t.irmaaMagiOf(30000, 30000, 'single'),
      // Single, benefit 20,000, other 20,000: provisional 30,000; 50% band: min(10,000, 2,500) = 2,500 -> 22,500.
      band50: t.irmaaMagiOf(40000, 20000, 'single'),
      // Single, benefit 40,000, pension 72,000 (MAGI 112,000): provisional 92,000; 85% band hits the cap 34,000 -> 106,000.
      capSingle: t.irmaaMagiOf(112000, 40000, 'single'),
      // Joint, benefit 70,000, other 200,000 (MAGI 270,000): cap 59,500 -> 259,500.
      capJoint: t.irmaaMagiOf(270000, 70000, 'mfj'),
      // Joint, benefit 30,000, other 40,000: provisional 55,000 > 44,000: 0.85 x 11,000 + min(6,000, 15,000) = 15,350
      // (under the cap 25,500) -> 55,350.
      band85: t.irmaaMagiOf(70000, 30000, 'mfj'),
      // Head of household and qualifying surviving spouse read the single bases (FILING 'ss' family): as single.
      hoh: t.irmaaMagiOf(40000, 20000, 'hoh'),
      qss: t.irmaaMagiOf(40000, 20000, 'qss'),
      noBenefit: t.irmaaMagiOf(123456.78, 0, 'mfj'),
      statusKid: t.returnStatusA([{ age: 10, qualifyingChild: true }]),
      statusNone: t.returnStatusA(undefined),
      ssJoint: t.irmaaSsOf({ singlePerson: false, ssA: 1, ssB: 2 }),
      ssOne: t.irmaaSsOf({ singlePerson: true, ssA: 5, ssB: 7 }),
    };
  });
  assert.strictEqual(r.lowSingle, 0, 'nothing taxable below the base');
  near(r.band50, 22500, 1e-9, '50% band');
  near(r.capSingle, 106000, 1e-9, '85% cap, single');
  near(r.capJoint, 259500, 1e-9, '85% cap, joint');
  near(r.band85, 55350, 1e-9, '85% band under the cap');
  near(r.hoh, 22500, 1e-9, 'hoh reads the single SS bases');
  near(r.qss, 22500, 1e-9, 'qss reads the single SS bases');
  assert.strictEqual(r.noBenefit, 123456.78, 'no benefit: the MAGI itself, bit for bit');
  assert.strictEqual(r.statusKid, 'hoh');
  assert.strictEqual(r.statusNone, 'single');
  assert.strictEqual(r.ssJoint, 3);
  assert.strictEqual(r.ssOne, 5);

  // --- The inverse: round trip and monotonicity over a grid (Review Focus 5: the exclusive top bound) ---
  const inv = await page.evaluate(() => {
    const t = window.__test_tax, bad = [];
    for (const filing of ['mfj', 'single', 'hoh', 'qss'])
      for (const ss of [0, 5000, 18000, 40000, 90000]) {
        let prev = -Infinity;
        const lines = [];
        for (let L = 0; L <= 800000; L += 7919) lines.push(L);
        lines.push(109000, 218000, 499999.99, 749999.99);
        lines.sort((a, b) => a - b);
        for (const L of lines) {
          const m = t.magiForIrmaaLine(L, ss, filing);
          if (Math.abs(t.irmaaMagiOf(m, ss, filing) - L) > 1e-6) bad.push({ filing, ss, L, m, back: t.irmaaMagiOf(m, ss, filing) });
          if (m < prev) bad.push({ filing, ss, L, m, prev, why: 'not monotone' });
          if (m < L - 1e-9 || m > L + ss + 1e-9) bad.push({ filing, ss, L, m, why: 'outside [L, L + ss]' });
          prev = m;
        }
      }
    return { bad: bad.slice(0, 5), inf: t.magiForIrmaaLine(Infinity, 40000, 'mfj'), zero: t.magiForIrmaaLine(150000, 0, 'single') };
  });
  assert.deepStrictEqual(inv.bad, [], 'round trip / monotone / bounds');
  assert.strictEqual(inv.inf, Infinity, 'Infinity passes through');
  assert.strictEqual(inv.zero, 150000, 'no benefit: the line itself');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('irmaa_magi: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it; it fails.** `node tests/irmaa_magi.js` -> FAIL (`t.irmaaMagiOf is not a function`).

- [ ] **Step 3: Implement**, just after `irmaaTierCeiling`:

```js
  // IRMAA is assessed on Medicare's MAGI: AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), which counts only the
  // TAXABLE part of Social Security. The engine's MAGI is the ACA's (26 U.S.C. 36B(d)(2)(B): all of Social Security), so
  // IRMAA amounts convert with irmaaMagiOf and IRMAA lines and caps are translated into the engine's MAGI with its exact
  // inverse. `ss` and `filing` are the return's own benefit and filing status in the year the MAGI is earned (irmaaSsOf,
  // returnStatusA). magi - ss is all other income, the otherIncome taxFor passes to taxableSocialSecurity. Tax-exempt
  // interest is not modeled (no input).
  function irmaaMagiOf(magi, ss, filing) {
    return ss > 0 ? magi - ss + taxableSocialSecurity(ss, magi - ss, filing) : magi;
  }
  // The engine MAGI whose IRMAA MAGI is `line`. With x = magi - ss, f(x) = x + taxable(ss, x) is continuous, piecewise
  // linear and strictly increasing (slopes 1, 1.5, 1.85, 1); its kinks are where provisional income (x + ss / 2) reaches
  // the lower base, where the 50% part reaches half the benefit (lower base + ss), the upper base, and where the 85% cap
  // binds. A listed point that is not a kink in this case lies on a straight segment, so interpolation stays exact.
  function magiForIrmaaLine(line, ss, filing) {
    if (!(ss > 0) || !Number.isFinite(line)) return line;
    const [lower, upper, base] = SS_BASE[filingKey(filing, 'ss')],
      h = ss * 0.5,
      f = (x) => x + taxableSocialSecurity(ss, x, filing),
      k1 = lower - h,
      k2 = lower + h,
      k3 = upper - h,
      k4 = upper - h + Math.max(0, 0.85 * ss - Math.min(base, h)) / 0.85,
      kinks = [k1, k2, k3, k4].sort((a, b) => a - b);
    let px = kinks[0],
      pf = f(px);
    if (line <= pf) return line + ss; // at or below the first kink (k1, always the smallest) nothing is taxable: f(x) = x
    for (let i = 1; i < kinks.length; i++) {
      const kx = kinks[i],
        kf = f(kx);
      if (line <= kf) return (kf > pf ? px + ((line - pf) * (kx - px)) / (kf - pf) : kx) + ss;
      px = kx;
      pf = kf;
    }
    return px + (line - pf) + ss; // above the last kink: slope 1
  }
  // The filing status of Partner A's own return in a two-return year (A claims the children), as taxFor's two-filer branch.
  function returnStatusA(dependents) {
    return (dependents || NO_DEPENDENTS).some((d) => d.qualifyingChild) ? 'hoh' : 'single';
  }
  // The benefit on a household or one-person return (the survivor remap puts the survivor's benefit in slot A).
  function irmaaSsOf(profile) {
    return profile.singlePerson ? profile.ssA || 0 : (profile.ssA || 0) + (profile.ssB || 0);
  }
```

(`NO_DEPENDENTS` already exists: `taxFor` uses it. If `SS_BASE`, `filingKey`, `taxableSocialSecurity` or `NO_DEPENDENTS` is declared after this point in a way that is not hoisted at call time, it is still fine: these are called only at run time, after the module has run.) In `taxFor`'s two-filer branch replace `const statusA = (profile.dependents || []).some((d) => d.qualifyingChild) ? 'hoh' : 'single';` with `const statusA = returnStatusA(profile.dependents);`. Add `irmaaMagiOf, magiForIrmaaLine, returnStatusA, irmaaSsOf` to `window.__test_tax`.

- [ ] **Step 4: Run.** `node tests/irmaa_magi.js` passes; `npm test` green with every snapshot identical; `npm run check:shared` passes.

- [ ] **Step 5: Commit.**
```bash
git commit -m "IRMAA MAGI 1: irmaaMagiOf and its exact inverse, returnStatusA (no number change)" -- Planner_US.html tests/irmaa_magi.js package.json
```

---

### Task 2: IRMAA reads Medicare's MAGI everywhere (the intended number change)

**Files:**
- Modify: `Planner_US.html`, `tests/irmaa_magi.js`, test files whose IRMAA expectations move (list each), `tests/snapshots/us.json` (via `npm run snapshot:update`), `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1's four functions.
- Produces: year-loop arrays `irmaaMagiHistory`, `irmaaMagiHistoryA`, `irmaaMagiHistoryB` (the old `magiHistory` removed if it has no other reader); `healthcareCost({ ..., irmaaHistory, irmaaHistoryA, irmaaHistoryB, ... })` (renamed from `magiHistory`, `magiHistoryA`, `magiHistoryB`; `magiA` / `magiB` for the ACA stay); `conversionMagiCeiling({ ..., profile })`.

- [ ] **Step 1: Write the failing engine tests** (append to `tests/irmaa_magi.js`, before the final `errors` check). Use the state-setting pattern of `tests/irmaa_startup.js` (`translateFieldList` + the `set` helper dispatching input/change events) or, where it is simpler, `Object.assign(window.__test_getState(), patch)` followed by `window.__test_simulate()` (the cliff-plan wrapper re-plans for the changed state). Patch fields: `singlePerson`, `ageA`, `retireAgeA`, `lifeExpectancyA`, `incomeA`, `spending`, `ssMonthlyA`, `ssStartAgeA`, `pensionYearlyA`, `pensionStartAgeA`, `pensionCoverage`, `medicareYearly`, `medicalInflation`, `hysaRate`, `dividendYield`, `inflation`, balances through `translateFieldList` (`taxable`, `traditional`, `roth`, `cash`), `stateTax: 'tx'`, `acaEnabled: false`, `rothConvEnabled`. Cases:
  - (a) **The charge.** Single, 70, retired, `stateTax 'tx'`, no investments (`taxable 0, traditional 0, roth 0, cash 0`, `hysaRate 0`, `dividendYield 0`), spending low enough that pension plus Social Security cover it every year (no withdrawals), Social Security 40,000 a year (`ssMonthlyA` 3,333.34, started), pension 72,000 (`pensionYearlyA` 72000, started, `pensionCoverage` that makes A's pension count), `irmaaPriorKnown: false`, `medicalInflation 0`. Year 0: engine MAGI 112,000 (no cash interest, no dividends), IRMAA MAGI 72,000 + 34,000 = 106,000 <= 109,000. Assert: the rows' `healthcare` equal, year by year, those of the same household with `ssMonthlyA` 1,000 (MAGI far under the tier, so no surcharge; Medicare's base premium does not depend on income). Before the fix the first household paid tier 2 (95.7 x 12 a year) from year 0 (the stand-in) on, so the test fails on CLIFF_TIP.
  - (b) **Two returns, A head of household** (Review Focus 2). An unmarried couple (`singlePerson false`, `filingStatus 'single'`, `marryLater false`), both 70, one child born so that the child is 15 at the start (a qualifying child for the whole test window: keep `lifeExpectancyA/B` at 73), each with pension 72,000 and Social Security 40,000; no investments. A's IRMAA MAGI uses the HoH column: single bases (`hoh` reads single), so each is 106,000, under the single first tier 109,000. Assert both partners pay no surcharge (rows' `healthcare` equal to the same couple with `ssMonthlyA/B` 1,000).
  - (c) **Lines** (Review Focus 4). Through `window.__test_solver.magiThresholds` (Task 1 of the cliff plan made the call shape: copy the argument object from `tests/solver_hooks.js`'s line-id case), a single 66-year-old retiree with `profile: { ownerShareA: 1, singlePerson: true, ssA: 40000, dependents: [] }`, `filing: 'single'`, `irmaa: { filing: 'single', a: true, b: false }`, `irmaaGrowth: 1`, `year: 0`, no `lo`/`hi`: the `irmaa1` line's `magi` equals `__test_tax.magiForIrmaaLine(109000, 40000, 'single')` (= 115,000: x + 34,000 = 109,000 at the cap gives x = 75,000; 75,000 + 40,000), its `id` is `'irmaa1'`, `family` `'irmaa'`, `ret` `'H'`; with `ssA: 0` the line is 109,000 exactly.
  - (d) **Survivor** (Review Focus 1). A married couple, both 68 and retired, `survivorEnabled` with A dying at 71 (set `survivorPartner` / `survivorDeathAge` to mean that: read their meaning in `normalizeState` and the markup first), no children, A's pension 0, B's pension 72,000 (`pensionCoverage` that pays B's), both Social Security 40,000 (so the survivor keeps 40,000), no investments; filing single from the year after the death (qss needs a qualifying child: none here). The survivor's IRMAA MAGI is 72,000 + 34,000 = 106,000, under the single first tier. Assert that in the second and later survivor years the survivor pays no surcharge (compare `healthcare` with the same plan at a benefit of 1,000 a month for both, from the third year after the death, when the lookback year is a survivor year).
  - (e) **The stand-in** (Review Focus 3). Case (a)'s household with `irmaaPriorKnown: true`, `irmaaMagiPrior2: 115000`, `irmaaMagiPrior1: 100000`: year 0 pays the tier the entry sets (115,000 > 109,000: 95.7 x 12 more than the no-surcharge household), year 1 pays none. With `irmaaPriorKnown: false`, year 0 pays none (the stand-in is year 0's IRMAA MAGI, 106,000).
  - (f) **Conversion ceiling.** Single, 66, retired, `traditional` 1,000,000, Social Security 40,000 started, pension 50,000, `rothConvEnabled: true`, `rothConvStartAge` 66, `rothConvEndAge` 70, `rothConvBracket` 32 (so the IRMAA cap, not the bracket, binds: the 24% single bracket alone would let MAGI past 109,000), `acaEnabled: false`, `stateTax 'tx'`, `spending` 60,000 (covered by the pension and Social Security, so no withdrawal year and no cliff-plan intent), no other income. Hand numbers: at the cap, IRMAA MAGI = 50,000 + C + 34,000 = 109,000 gives C = 25,000 (engine MAGI 115,000); before the fix the engine MAGI stopped at 109,000 (C = 19,000). Year 0's `conversionAmount` brings the IRMAA MAGI to the first tier: assert `__test_tax.irmaaMagiOf(row0.magiProxy, 40000, 'single')` is within $1 of 109,000 and at or under it (before the fix the engine MAGI, not the IRMAA MAGI, sat at 109,000, so the conversion was 6,000 smaller: 15% of the benefit).
  - (g) **No benefit, no change** (property). Case (f) with `ssMonthlyA` 0: `row0.magiProxy` within $1 of 109,000 (identical to CLIFF_TIP; the snapshot run checks the bits).

- [ ] **Step 2: Run them; (a), (b), (d), (e) second half and (f) fail; (c) fails on the line value; (g) passes.**

- [ ] **Step 3: Implement.**
  1. **History.** In `runProjection` (US) declare `irmaaMagiHistory = []`, `irmaaMagiHistoryA = []`, `irmaaMagiHistoryB = []` beside `magiHistory`. At the provisional write (`magiHistory[year] = magiProxy;`):
```js
        irmaaMagiHistory[year] = irmaaMagiOf(magiProxy, irmaaSsOf(profile), filing);
```
     and in its `if (twoReturns)` block, after `magiHistoryA[year] = magiA; magiHistoryB[year] = magiB;`:
```js
          irmaaMagiHistoryA[year] = irmaaMagiOf(magiA, profile.ssA || 0, returnStatusA(profile.dependents));
          irmaaMagiHistoryB[year] = irmaaMagiOf(magiB, profile.ssB || 0, 'single');
```
     At the realized write after convergence (`magiHistory[year] = realizedMagi;` and the `returnMagis` line), the same three writes from `realizedMagi` and the realized `magiHistoryA[year]` / `magiHistoryB[year]`. Then grep every reader of `magiHistory` (not `magiHistoryA/B`): if `healthcareCost` (through `hcArgs`) is the only one, delete `magiHistory` and its writes; otherwise keep it and list the reader in the commit message.
  2. **`healthcareCost`.** Rename the parameters `magiHistory` -> `irmaaHistory`, `magiHistoryA` -> `irmaaHistoryA`, `magiHistoryB` -> `irmaaHistoryB` (defaults unchanged) and their two uses (`irmaaLookbackSplit(irmaaHistoryA, irmaaHistoryB, twoReturnHistory, year)`, `irmaaLookbackMagi(irmaaHistory, year)`). In `hcArgs`: `irmaaHistory: irmaaMagiHistory, irmaaHistoryA: irmaaMagiHistoryA, irmaaHistoryB: irmaaMagiHistoryB` (drop the old keys).
  3. **`irmaaAt`.** Replace the body's two surcharge lines:
```js
          if (twoReturns) {
            const [ma, mb] = returnMagis(profile, trad, gain);
            return (
              (medA ? irmaaSurcharge(irmaaMagiOf(ma, profile.ssA || 0, returnStatusA(profile.dependents)) / irmaaGrowth2, 'single', year) : 0) +
              (medB ? irmaaSurcharge(irmaaMagiOf(mb, profile.ssB || 0, 'single') / irmaaGrowth2, 'single', year) : 0)
            );
          }
          const s = irmaaSurcharge(irmaaMagiOf(magiBase + trad + gain, irmaaSsOf(profile), filing) / irmaaGrowth2, irmaaFiling2(), year);
```
  4. **`magiThresholds`.** In the IRMAA block, with `const p = c.profile, ssH = irmaaSsOf(p), stA = returnStatusA(p.dependents);` before the branches: two returns `add(toHousehold(magiForIrmaaLine(cap, p.ssA || 0, stA), c.preMagiA, shareA), ...)` and `add(toHousehold(magiForIrmaaLine(cap, p.ssB || 0, 'single'), c.preMagiB, 1 - shareA), ...)`; household `add(magiForIrmaaLine(edge * f * g, ssH, c.filing), 'IRMAA tier', 'irmaa' + ++k, 'H', 'irmaa')`. (`c.filing` is this year's return: the benefit is taxed on it; the tier table keeps `ir.filing`, the charged year's.) Update the block's comment: the edges are IRMAA MAGI, translated into the engine's MAGI.
  5. **`conversionMagiCeiling`.** Add `profile = null` to its parameters and pass `profile` from the year loop. Two returns:
```js
      const p = profile || {},
        stA = returnStatusA(p.dependents),
        irmaaRoom = (m, ss, st) => magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(m, ss, st), 'single', year), ss, st);
      if (!workingA && age >= 63) room = Math.min(room, allow(irmaaRoom(preMagiA, p.ssA || 0, stA), preMagiA, shareA));
      if (!workingB && ageB >= 63) room = Math.min(room, allow(irmaaRoom(preMagiB, p.ssB || 0, 'single'), preMagiB, 1 - shareA));
```
     (`irmaaTierCeiling` keeps the single table on two returns, as today; the benefit's own status is the return's.) Household:
```js
        const ssH = profile ? irmaaSsOf(profile) : 0;
        magiCeiling = Math.min(magiCeiling, magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(preConvMagi, ssH, filing), filing, year), ssH, filing));
```
     Update the function's comment (the cap keeps IRMAA MAGI inside its tier; the ACA line is on the engine's MAGI).
  6. **`lambdaEstimate`.** Two returns: `mA` / `mB` become IRMAA MAGIs: `irmaaSurcharge(irmaaMagiOf(mA + hs, P.ssA, 'single'), 'single', year) - irmaaSurcharge(irmaaMagiOf(mA, P.ssA, 'single'), 'single', year)` and the same for B with `P.ssB`. Household: `irmaaStep = onMedicare * (irmaaSurcharge(irmaaMagiOf(magi + step, P.ssA + P.ssB, P.filing), P.filing, year) - irmaaSurcharge(irmaaMagiOf(magi, P.ssA + P.ssB, P.filing), P.filing, year));` (on a one-person sample `P.ssB` is 0). Update the function's header comment ("IRMAA on Medicare's MAGI").
  7. **`irmaaChecks`.** At the push (`irmaaChecks.push({ y: year + 2, filing: irmaaFiling2(), nat: ..., trial: ... })`): `nat: irmaaMagiOf(naturalRec.realized, irmaaSsOf(profile), filing), trial: irmaaMagiOf(realizedMagi, irmaaSsOf(profile), filing)`.
  8. **Display.** In the US healthcare callout (`<b>Healthcare, ACA, Medicare & IRMAA.</b>`, US-only markup after the shared Sankey region), replace "against household MAGI from two years prior (each year's full realized MAGI, withdrawals included; your own entries for the plan's first two years if you provide them)" with "against Medicare's MAGI from two years prior (adjusted gross income plus tax-exempt interest, which counts only the taxable part of Social Security, unlike the ACA's MAGI, which counts all of it; withdrawals and conversions included; your own entries for the plan's first two years if you provide them)". Read the callout first and keep the rest verbatim. Badge +1.

- [ ] **Step 3b: The ACA side did not move.** Write a throwaway check (scratch, not committed) or extend the movers script: for every snapshot scenario, rows' `magiProxy`, `magiA`, `magiB` are identical between `../fp-irmaa-base` and this tree EXCEPT where a conversion or a draw changed because an IRMAA cap, line or cost moved (then the scenario is a mover and its explanation says so). A scenario whose household is under 63 for the whole plan, or has no Social Security, must be byte-identical. Any other change: stop and report.

- [ ] **Step 4: Run** `node tests/irmaa_magi.js` (all pass), then the existing IRMAA tests: `node tests/irmaa_startup.js`, `node tests/irmaa_gating.js`, `node tests/medicare_enrollment.js`, `node tests/two_return_magi.js`, `node tests/solver_hooks.js`, `node tests/cliff_plan.js`, `node tests/cliff_guard.js`. An expectation that pinned the old charge is changed only with a hand-computed reason in a comment beside it (the benefit, the taxable part, the IRMAA MAGI, the tier); list each in the commit message. Any other failure: fix the code.

- [ ] **Step 5: Movers.**
```bash
node tests/snapshot.js --root ../fp-irmaa-base --dump ../irmaa-dumpA --update-nothing
node tests/snapshot.js --dump ../irmaa-dumpB
node tests/snapshot.js --compare ../irmaa-dumpA ../irmaa-dumpB
```
  Table (scenario | first moved age | sum of `healthcare` over the plan before -> after (the IRMAA change shows here; nothing else in `healthcare` moves) | sum of `conversionAmount` before -> after | depletion before -> after | end total change). The dump files hold the rows; a short node script over `../irmaa-dumpA` / `../irmaa-dumpB` (scratch, not committed) builds the table. Check the hard rules: no `std` scenario depletes earlier than at CLIFF_TIP; no-benefit scenarios identical. One line of explanation per mover group (charge removed, conversion raised, cliff-plan intent moved or dropped).

- [ ] **Step 6: `npm run snapshot:update`**, then `npm test` green; `npm run check:shared` passes.

- [ ] **Step 7: Docs.** `README.md`: the IRMAA feature line says the surcharge uses Medicare's MAGI (only taxable Social Security), the ACA subsidy the ACA's (all of it). `CLAUDE.md`: in "MAGI iteration (both engines)" replace `magiHistory[year]` with `irmaaMagiHistory[year]` and add one sentence: the engine's MAGI is the ACA definition; IRMAA amounts convert with `irmaaMagiOf`, IRMAA lines and caps translate with `magiForIrmaaLine` (one MAGI scale for steering); in "Two-return years" name `irmaaMagiHistoryA/B` beside `magiHistoryA/B` (rows keep the ACA per-return MAGI); in the per-year solver bullet, `magiThresholds`' IRMAA lines are translated edges and `lambdaEstimate`'s IRMAA step uses Medicare's MAGI.

- [ ] **Step 8: Commit** (movers table in the message body or in Task 3's notes; changed test expectations listed):
```bash
git commit -m "IRMAA MAGI 2: IRMAA charge, lines, conversion cap and lambda use Medicare's MAGI (taxable Social Security only) (V+1; snapshot update)" -- Planner_US.html tests/ README.md CLAUDE.md
```

---

### Task 3: Timing and batch notes

**Files:** `docs/next-batches-plan.md` (no code)

- [ ] **Step 1: Timing.**
```bash
node tests/bench_runs.js --root ../fp-irmaa-base
node tests/bench_runs.js
node tests/bench_solver.js --base ../fp-irmaa-base
node tests/bench_plan.js
```
  Gates: per state +5% (`bench_runs`, median of 3), the ACA early retiree +5% (`bench_solver`), planning ratios at most 5. Over: only number-neutral speedups (snapshots identical to Task 2), e.g. computing `irmaaSsOf(profile)` and `returnStatusA(profile.dependents)` once per year in the loop instead of per call; still over: stop and report.

- [ ] **Step 2: Notes.** In `docs/next-batches-plan.md`, under "IRMAA MAGI fix (after the cliff plan, before Batch E)", add "##### IRMAA MAGI fix: implementation": commits; the movers table with one-line explanations; the ACA-side check (Step 3b); test expectations changed and why; the timing table; anything for the owner.

- [ ] **Step 3: Commit:** `git commit -m "IRMAA MAGI 3: batch notes" -- docs/next-batches-plan.md`. Report to the owner: the branch tip, each gate's number, the movers, open questions. Do not push.
