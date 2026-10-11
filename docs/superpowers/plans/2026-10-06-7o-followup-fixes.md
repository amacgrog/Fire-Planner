# 7O Follow-up Fixes (F1-F7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three child-credit errors found in review (Oregon, Vermont, Maine), the Maine dependent-exemption error, the O1 MAGI-iteration instability at the Medicaid / 100% cliffs, and (conditionally) the Pennsylvania Roth-conversion approximation, then clean up the minor items, as one PR that re-introduces Batch 7O with the fixes on top.

**Architecture:** The US planner is one self-contained HTML file (`Planner_US.html`, one IIFE). State-tax data is a pure-literal table (`STATE_RULES`) read by one evaluator (`stateCreditAmount` in `stateIncomeTax`). The year loop (`runProjection`) re-runs each year from a snapshot until the ACA premium and the MAGI it depends on agree (`MAGI_ITER_MAX`). Every fix is data or a small optional-key extension of an existing mechanism, with hand-computed Playwright tests.

**Tech Stack:** Vanilla JS/HTML (no build step), Node + Playwright for tests (`npm test`), `gh` for the PR.

**Spec:** `docs/next-batches-plan.md`, section "#### 7O follow-up fixes (review findings, 2026-10-06)" (findings with quoted statute text, owner decisions, candidate designs). Read it first; this plan implements it. Owner decisions already made: **do not model the Oregon 2029 sunset; F5 = design A now (design B goes to 3C); F6 only if the PA guide clearly exempts a retiree's 401(k)-to-Roth conversion; the F6 profile fields are internal (no `FIELDS` entry).**

## Global Constraints

- Read `CLAUDE.md` first. Key rules: stable filenames; one `<script>` block; the working tree is **CRLF** (`core.autocrlf=true`).
- **Never run `sed -i` on `Planner_US.html` or `Planner_Canada.html`** (it flipped the US file to LF once and broke the shared-region check). Edit planners with the Edit tool or a `node` script that detects the file's line ending. After any `npm run sync`, convert both planners back to CRLF (`content.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')`) and run `npm run check:shared`.
- Shared regions (`// @@shared:... begin/end`) must stay byte-identical in both planners. None of these tasks edits a shared region.
- Hot paths stay allocation-free and give **identical doubles** when the new options do not apply (`tests/tax_caches.js`, the snapshots). `npm test` takes about 5 minutes; run the targeted test named in a step first.
- Only run `npm run snapshot:update` for an intended behavior change, and say so in the commit message. A pure data/option change that leaves every snapshot untouched must leave the baseline untouched.
- Every figure is checked against a primary source (decision 15). The findings in the spec are already verified (retrieved 2026-10-06); do not re-derive them, but re-read a statute if a number in a test does not match.
- Expected values in tests are **hand-computed in a comment beside the case**, never read back from the evaluator.
- One commit per task; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The US badge (`<span ...>V105</span>` in the `<h1>`) is bumped once per user-facing commit (V106 for F1, V107 F2, V108 F3, V109 F4, V110 F5, V111 F6 if built, V112 F7). Bump with a `node` script, not `sed`.
- Every number-changing task needs: a before/after table (the stock scenario plus one that exercises the fix), seeded success rates (`node tests/historical_rates.js [--root <worktree of the previous commit>]`, 2,000 paths, seed 7), the README feature line, the 7O follow-up notes in `docs/next-batches-plan.md` (not `docs/reference.md`), and `npm run gen:states` + commit of `docs/state-tax-rules.md` whenever `STATE_RULES` changes.
- Do not mention or edit unrelated files. Do not push to `claude/batch-3b-penalty-rules`; the PR is opened, not merged, and the owner reviews.

## Review Focus

Failure modes the spec implies but a naive task's tests would miss, most likely first (each has a test in the task that owns the code):

1. **F5 fallback must not touch converged or ACA-off years** (identical doubles; an ACA-off household and every converging ACA household must keep their exact rows). Test: snapshot hash of every non-ACA scenario unchanged; the sweep asserts the forced pass runs only in non-converging years.
2. **F5 cash accounting** after the forced pass: the premium refund goes to cash, cash never goes negative, and `row.healthcare === acaNetCost(row.magiProxy)` for every row. Test: the sweep plus a conservation check on one year.
3. **More than one child** in Oregon (cap of five, share of the capped total) and Vermont (per child, three or more children): the old one-child tests passed by accident. Tests use 2, 3 and 6 children.
4. **Credit edge ages and years**: a child exactly 6 at year end gets Maine's single amount, a child of 5 the doubled one; the Oregon credit is still paid in 2029+ (no sunset modeled); Maine indexing at year index 10.
5. **PA conversion before 59½ with SEPP-locked or exhausted IRAs** (F6): conversion from the 401(k) part when IRAs are empty, and a profile with no conversion fields (optimizer literals) behaving exactly as before.

---

## File Structure

| File | Responsibility in this plan |
|---|---|
| `Planner_US.html` | Evaluator options (`stateCreditAmount`), OR/VT/ME rows in `STATE_RULES`, the MAGI loop in `runProjection`, `taxFor` per-person sources, `accountsConvert401kPart`, badge |
| `tests/state_child_credits.js` | Hand-computed child-credit cases through each row's real credit literals |
| `tests/state_mechanisms.js` | Synthetic-row (`zz`) cases for each new evaluator option |
| `tests/state_7d_households.js` | The Maine family household expectation (moves in F3 and F4) |
| `tests/aca_medicaid.js` | The F5 sweep (consistency at the cliffs) and the pass-stats assertions |
| `tests/pa_employer_plan.js` | F6 conversion cases |
| `tests/roth_accounts.js` | F7 comment fix |
| `docs/next-batches-plan.md`, `README.md`, `CLAUDE.md`, `docs/state-tax-rules.md` | Notes, feature lines, architecture lines, generated state table |

---

### Task 0: Branch setup and the plan document

The 7O merge was reverted on `claude/batch-3b-penalty-rules` (`a7c9d27`). A new PR from `claude/batch-7o` would show nothing (its commits are ancestors of the base), so the work goes on a new branch that first re-applies 7O by reverting the revert.

**Files:**
- Modify: `docs/next-batches-plan.md` (the follow-up section is already edited in the working tree of `claude/batch-7o`, uncommitted)
- Create: `docs/superpowers/plans/2026-10-06-7o-followup-fixes.md` (this file)

**Interfaces:**
- Produces: branch `claude/batch-7o-fixes` containing all of 7O (V105) plus the uncommitted plan edits; a green `npm test` baseline.

- [ ] **Step 1: Carry the uncommitted plan edits over**

```bash
cd /c/Users/Alex/code/Fire-Planner
git status --short            # expect: M docs/next-batches-plan.md and ?? docs/superpowers/
git stash push --include-untracked -m "7o-followup-plan-docs"
git fetch origin
git switch -c claude/batch-7o-fixes origin/claude/batch-3b-penalty-rules
git log --oneline -3          # expect a7c9d27 Revert "Merge pull request #18 ..." on top
```

- [ ] **Step 2: Re-apply 7O by reverting the revert**

```bash
git revert --no-edit a7c9d27
git stash pop                  # applies the plan docs; expect no conflicts
git status --short             # expect only docs/next-batches-plan.md modified and docs/superpowers/ untracked
```

- [ ] **Step 3: Baseline**

Run: `npm test`
Expected: exit 0. Also confirm the badge: `grep -c 'vertical-align:middle">V105</span>' Planner_US.html` prints `1`.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/next-batches-plan.md docs/superpowers/plans/2026-10-06-7o-followup-fixes.md
git commit -m "Plan: 7O follow-up fixes (F1-F7) with verified findings and an implementation plan

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: F1 Oregon Kids Credit, a share-of-total phase-out (US V106)

**Root cause:** `childCredit` only knows "cut `per` dollars per `width` of income from the household total" or a fixed dollars-per-dollar `rate`. ORS 315.273(4) reduces the whole credit by a percentage `(income - start) / 5,000` of the credit "otherwise available", so the credit ends at the same income for any child count. The 0.21 rate was one child's slope.

**Files:**
- Modify: `Planner_US.html` (evaluator `case 'childCredit'` in `stateCreditAmount`; the `or:` row's Oregon Kids Credit entry and notes; badge)
- Test: `tests/state_child_credits.js` (the Oregon block), `tests/state_mechanisms.js` (synthetic `share` cases)
- Docs: `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`, `docs/state-tax-rules.md` (regenerated)

**Interfaces:**
- Consumes: `cr.phaseOut = { start, measure?, rate?, width?, per?, share? }`, `cr.maxChildren`, `cr.fixed` (7O O4).
- Produces: new optional `cr.phaseOut.share = { width: number, round?: number }`. When present the credit is `total x (1 - pct)`, `pct = min(1, round(over / width))`, `over = measure - start x ct` (the `width` is NOT indexed), `total` the capped sum of the tiers. `rate` and `per`/`width` keep their meaning; no existing row uses `share`.

- [ ] **Step 1: Write the failing tests (Oregon block)**

In `tests/state_child_credits.js` replace the whole Oregon section (from `// --- Oregon:` to the line before `// --- Maine:`) with:

```js
  // --- Oregon: 1,050 per child under six (at most five); the credit is cut by the share (state AGI - 26,550) / 5,000 of the
  // WHOLE credit (rounded to two decimals as on the OR-40 worksheet), so it is gone at 31,550 for any number of children ---
  const orc = (w, kids, f = 'single', yi = 0) => run('or', w, kids, f, yi, 'Oregon Kids Credit');
  near(orc(0, [kid(2), kid(4), kid(6)], 'mfj'), -2100, 'OR: two children under six (the child of six does not count)');
  near(orc(28000, [kid(2), kid(4)], 'mfj'), 2800 - 1491, 'OR 28,000, two children: 1,450 / 5,000 = 0.29; 2,100 x 0.71 = 1,491');
  near(orc(28000, [kid(2)], 'single'), 2800 - 745.5, 'OR 28,000, one child: 1,050 x 0.71 = 745.50 (unchanged from the straight line)');
  near(orc(30000, [kid(1), kid(2), kid(3)], 'mfj'), 3000 - 976.5, 'OR 30,000, three children: 3,450 / 5,000 = 0.69; 3,150 x 0.31 = 976.50');
  near(orc(27000, [kid(0), kid(1), kid(2), kid(3), kid(4), kid(5)], 'mfj'), 2700 - 4777.5, 'OR 27,000, six children: capped at five first (5,250), 450 / 5,000 = 0.09; 5,250 x 0.91 = 4,777.50');
  near(orc(28123, [kid(2), kid(4)], 'mfj'), 2812.3 - 1449, 'OR 28,123: 1,573 / 5,000 = 0.3146 rounds to 0.31; 2,100 x 0.69 = 1,449 (unrounded 1,439.34)');
  near(orc(31549, [kid(2), kid(4)], 'mfj'), mnTax(31549), 'OR 31,549: 4,999 / 5,000 = 0.9998 rounds to 1.00: nothing');
  near(orc(31550, [kid(2)], 'single'), mnTax(31550), 'OR: nothing at 31,550');
  near(orc(26550, [kid(2), kid(4)], 'mfj'), 2655 - 2100, 'OR at 26,550: full');
  // 2029 and later: the statute ends the credit for tax years from 2029; the planner does NOT model that (owner decision).
  near(orc(0, [kid(2)], 'single', 3), -1050, 'OR 2029 (year index 3): still paid, no sunset modeled');
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    // The amount and the start index; the 5,000 divisor is a share, not a dollar amount, so it stays fixed.
    near(orc(26550 * f + 2500, [kid(2)], 'single', 10), mnTax(26550 * f + 2500) - (1050 * f) / 2, 'OR indexed, one child: 2,500 over the indexed start = half the indexed credit');
    near(orc(26550 * f + 2500, [kid(2), kid(4)], 'mfj', 10), mnTax(26550 * f + 2500) - (2100 * f) / 2, 'OR indexed, two children: still half (0.50 exactly)');
  }
  st.inflation = 0;
```

In `tests/state_mechanisms.js`, after the line `near(run(emp, { ...trad(40000, 40000), pension: 5000, pensionA: 5000, ages: [52] }), 0, ...);` (the O3 block) add a synthetic-row block for the new option (the helpers `cols`, `kid`, `run`, `near` already exist in that file):

```js
  // --- Mechanism 4c (7O follow-up F1): a phase-out as a share of the whole credit ------------------------------
  // Flat 10% tax. Credit 1,000 per child of five or younger, refundable; start 20,000; the share is (income - 20,000) / 4,000.
  const share = (round) => ({ credits: [{ kind: 'childCredit', label: 'c', refundable: true, tiers: [[5, 1000]], phaseOut: { start: cols(20000), share: { width: 4000, round } } }] });
  near(run(share(2), { wages: 20000, dependents: [kid(3), kid(3)] }), 2000 - 2000, 'share: at the start the credit is whole (tax 2,000 less 2,000)');
  near(run(share(2), { wages: 21000, dependents: [kid(3), kid(3)] }), 2100 - 1500, 'share: 1,000 / 4,000 = 0.25; 2,000 x 0.75 = 1,500');
  near(run(share(2), { wages: 21500, dependents: [kid(3), kid(3)] }), 2150 - 1240, 'share rounded: 1,500 / 4,000 = 0.375 rounds to 0.38; 2,000 x 0.62 = 1,240');
  near(run(share(undefined), { wages: 21500, dependents: [kid(3), kid(3)] }), 2150 - 1250, 'share not rounded: 2,000 x 0.625 = 1,250');
  near(run(share(2), { wages: 24000, dependents: [kid(3), kid(3)] }), 2400, 'share: 4,000 / 4,000 = 1; nothing left');
  near(run(share(2), { wages: 21000, dependents: [kid(3), kid(3), kid(3)] }), 2100 - 2250, 'share: three children, 3,000 x 0.75 = 2,250');
  near(run({ credits: [{ kind: 'childCredit', label: 'c', refundable: true, tiers: [[5, 1000]], maxChildren: 2, phaseOut: { start: cols(20000), share: { width: 4000, round: 2 } } }] }, { wages: 21000, dependents: [kid(3), kid(3), kid(3)] }), 2100 - 1500, 'share with maxChildren 2: the cap comes first, 2,000 x 0.75');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/state_child_credits.js; node tests/state_mechanisms.js`
Expected: both FAIL (the Oregon two- and three-child cases and every `share` case: `share` is ignored, the row still has `rate: 0.21` / the zz row has no `width`).

- [ ] **Step 3: Implement the evaluator option**

In `Planner_US.html`, in `stateCreditAmount`, `case 'childCredit'`, replace

```js
          cut = over > 0 ? (po.rate !== undefined ? po.rate * ca * over : Math.ceil(over / (po.width * ct)) * po.per * ca) : 0;
```

with

```js
          cut = po.share !== undefined ? 0 : over > 0 ? (po.rate !== undefined ? po.rate * ca * over : Math.ceil(over / (po.width * ct)) * po.per * ca) : 0;
```

and replace the final `return Math.max(0, total - cut);` of that case (the one directly before `case 'propertyTaxCredit': {`) with

```js
        if (po.share !== undefined) {
          // A percentage of the whole credit (Oregon, ORS 315.273(4)): the income over the start divided by a fixed width
          // (a divisor, not a dollar amount, so it is not indexed), rounded as the state's worksheet does, applied to the
          // capped total.
          const raw = over > 0 ? over / po.share.width : 0,
            f = po.share.round === undefined ? 0 : Math.pow(10, po.share.round);
          return total * (1 - Math.min(1, f ? Math.round(raw * f) / f : raw));
        }
        return Math.max(0, total - cut);
```

Also extend the comment block above the case: after `` `maxChildren` (a cap on the children counted) `` add `` `phaseOut.share` ({ width, round }: a percentage of the whole credit, Oregon) ``.

- [ ] **Step 4: Change the Oregon row**

In the `or:` row, replace

```js
          phaseOut: { start: { single: 26550, mfj: 26550, hoh: 26550, qss: 26550 }, measure: 'stateAgi', width: 1, per: 0, rate: 0.21 },
```

with

```js
          phaseOut: { start: { single: 26550, mfj: 26550, hoh: 26550, qss: 26550 }, measure: 'stateAgi', share: { width: 5000, round: 2 } },
```

In the same row's `notes`, replace the sentence that begins `Oregon Kids Credit (ORS 315.273 and the Department of Revenue 2025 amounts, primary):` through its closing `.` with:

```
Oregon Kids Credit (ORS 315.273 and the 2025 Form OR-40 worksheet, primary): $1,050 for each dependent under six (at most five, counted first), refundable, full at Oregon AGI up to $26,550 and then reduced by the share of the whole credit equal to the income over $26,550 divided by $5,000 (rounded to two decimals as on the worksheet), so nothing is left at $31,550 for any number of children. The statute sets $1,000 and $25,000, indexes the amount and the start (the divisor is fixed) and applies to tax years before 2029 (2023 c.538 section 11); the 2025 values stand for 2026 and the credit is modeled in every year (owner decision; recheck yearly).
```

(No apostrophes inside the notes string: the generator evaluates the block as a literal.)

- [ ] **Step 5: Run the tests to verify they pass, regenerate the table**

Run: `node tests/state_child_credits.js && node tests/state_mechanisms.js && node tests/state_rules.js && npm run gen:states`
Expected: all three print their `passed` line; `wrote docs\state-tax-rules.md`.

- [ ] **Step 6: Prove nothing else moved**

Run: `node tests/snapshot.js && node tests/tax_caches.js`
Expected: US and Canada snapshot tests pass (no Oregon household with children in the corpus), `tax_caches` passes (identical doubles for MN, UT, NY, NM).

- [ ] **Step 7: Before/after and success rates**

Before/after (credit only, 2026, inflation 0; these are the same values the tests assert): 2 children at 28,000: 1,795.50 to 1,491.00; 3 children at 30,000: 2,425.50 to 976.50; 2 children at 31,000: 1,165.50 to 231.00; 1 child unchanged. Seeded rates: `git worktree add "$SP/wt_prev" HEAD~0 -f` before editing (or `git stash`), then compare `node tests/historical_rates.js --root "$SP/wt_prev"` with `node tests/historical_rates.js`; expected unchanged for every scenario (record the run in the commit message).

- [ ] **Step 8: Docs, badge, commit**

1. Badge: `node -e "const fs=require('fs');let h=fs.readFileSync('Planner_US.html','utf8');h=h.replace('vertical-align:middle\">V105</span>','vertical-align:middle\">V106</span>');fs.writeFileSync('Planner_US.html',h)"`.
2. `README.md`: in the "State child credits" sentence replace `Oregon Kids Credit ($1,050 under 6, up to five, refundable)` with `Oregon Kids Credit ($1,050 under 6, up to five, refundable, cut by the share of the whole credit over $26,550 to nothing at $31,550)`.
3. `CLAUDE.md`: in the "State rows, later additions" bullet, after `` `fixed` (unindexed whatever the row flags say) `` add `` , `phaseOut.share` ({ width, round }: a percentage of the whole credit, Oregon) ``.
4. `docs/next-batches-plan.md`: in the O4 table, replace the OR row's credit text with `1,050 per dependent under six, at most five, refundable; the whole credit is cut by (Oregon AGI - 26,550) / 5,000, rounded to two decimals, nothing at 31,550 for any number of children` and its source cell with `ORS 315.273 and the 2025 Form OR-40 worksheet; 1,000 and 25,000 indexed, the divisor fixed; applies to tax years before 2029 (not modeled, owner decision)`. In "#### 7O follow-up fixes", at the head of F1 add a line `**Built (V106).**`.
5. Commit:

```bash
git add Planner_US.html tests README.md CLAUDE.md docs/next-batches-plan.md docs/state-tax-rules.md
git commit -m "7O fix F1: Oregon Kids Credit phase-out is a share of the whole credit (US V106)

ORS 315.273(4) cuts the credit by (income - start) / 5,000 of the amount otherwise
available, so it ends at 31,550 for any number of children; the row took one
child's slope off the household total. New optional phaseOut.share { width, round }
(width not indexed, rounded to two decimals as on the OR-40 worksheet). The 2029
sunset is recorded, not modeled (owner decision). Snapshots unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: F2 Vermont, the phase-out per child (US V107)

**Root cause:** 32 V.S.A. 5830f(b) reduces "the amount of the credit per child" by $20 per $1,000 or fraction over $125,000; the 2025 IN-112 table gives a per-child amount. The evaluator cuts the household total once, so two or more children keep part of the credit above $175,000 and a two-child household is cut half as much.

**Files:**
- Modify: `Planner_US.html` (evaluator; the `vt:` row and notes; badge)
- Test: `tests/state_child_credits.js` (the Vermont block), `tests/state_mechanisms.js`
- Docs: `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`, `docs/state-tax-rules.md`

**Interfaces:**
- Consumes: the F1 evaluator (`share` branch returns early).
- Produces: optional `cr.phaseOut.perChild: true`: the cut (`ceil(over / (width x ct)) x per x ca`, or `rate x ca x over`) comes off each counted child's tier amount, each floored at zero, and the credit is the sum. Other rows unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/state_child_credits.js`, after the existing Vermont cases (the line `near(run('vt', 125000, [kid(1), kid(5), kid(6)], 'mfj'), mnTax(125000) - 3000, 'VT three young children');`) add:

```js
  // Per child (32 V.S.A. 5830f(b), the IN-112 table is per child): each child's 1,000 loses 20 per 1,000 or fraction over 125,000.
  near(run('vt', 150000, [kid(6), kid(2)], 'mfj'), mnTax(150000) - 1000, 'VT 150,000, two children: each 1,000 - 25 x 20 = 500, total 1,000');
  near(run('vt', 170000, [kid(6), kid(2)], 'mfj'), mnTax(170000) - 200, 'VT 170,000, two children: each 1,000 - 45 x 20 = 100, total 200');
  near(run('vt', 174001, [kid(6), kid(2)], 'mfj'), mnTax(174001), 'VT 174,001: 49,001 over = 50 steps, 1,000 off each: nothing');
  near(run('vt', 125001, [kid(1), kid(5), kid(6)], 'mfj'), mnTax(125001) - 2940, 'VT 125,001, three children: 3 x 980');
  near(run('vt', 190000, [kid(0), kid(1), kid(2), kid(3)], 'mfj'), mnTax(190000), 'VT 190,000, four children: gone for every child count');
  near(run('vt', 150000, [kid(7), kid(6)], 'single'), mnTax(150000) - 500, 'VT 150,000: the child of 7 never counts, the child of 6 gets 500');
```

In `tests/state_mechanisms.js`, directly after the F1 `share` block add:

```js
  // --- Mechanism 4d (7O follow-up F2): the cut comes off each child, floored at zero --------------------------------
  // Tiers 1,000 (age 5 or younger) and 500 (age 6 to 10); a cut of 600 (60 steps of 10 over the start of 20,000, width 1,000).
  const perKid = (extra) => ({ credits: [{ kind: 'childCredit', label: 'c', refundable: true, tiers: [[5, 1000], [10, 500]], phaseOut: Object.assign({ start: cols(20000), width: 1000, per: 10, perChild: true }, extra) }] });
  near(run(perKid(), { wages: 80000, dependents: [kid(3), kid(8)] }), 8000 - 400, 'perChild: the cut of 600 takes 600 off the 1,000 child (400) and all of the 500 child (0)');
  near(run({ credits: [{ kind: 'childCredit', label: 'c', refundable: true, tiers: [[5, 1000], [10, 500]], phaseOut: { start: cols(20000), width: 1000, per: 10 } }] }, { wages: 80000, dependents: [kid(3), kid(8)] }), 8000 - 900, 'without perChild the same cut is taken once from the total (1,500 - 600 = 900)');
  near(run(perKid({ width: undefined, per: undefined, rate: 0.1 }), { wages: 28000, dependents: [kid(3), kid(8)] }), 2800 - 200, 'perChild with a straight line: 0.1 x 8,000 = 800 cut: 200 + 0');
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/state_child_credits.js; node tests/state_mechanisms.js`
Expected: both FAIL (Vermont two-child cases: 1,500 instead of 1,000; `perChild` ignored).

- [ ] **Step 3: Implement**

In `case 'childCredit'` of `stateCreditAmount`, change the loop line

```js
              if (cr.maxChildren === undefined || counted < cr.maxChildren) total += cr.tiers[t][1] * ca;
```

to

```js
              if (cr.maxChildren === undefined || counted < cr.maxChildren) total += po.perChild === true ? Math.max(0, cr.tiers[t][1] * ca - cut) : cr.tiers[t][1] * ca;
```

and change the last line of the case to

```js
        return po.perChild === true ? total : Math.max(0, total - cut);
```

(`cut` is already the per-unit cut; for every row without `perChild` the expressions are unchanged, so MN, UT, NY, NM, ME, AL, MA stay bit-identical.) Add `` `phaseOut.perChild` (the cut comes off each child) `` to the comment above the case.

- [ ] **Step 4: Change the Vermont row**

Replace in the `vt:` row

```js
          phaseOut: { start: { single: 125000, mfj: 125000, hoh: 125000, qss: 125000 }, width: 1000, per: 20 },
```

with

```js
          phaseOut: { start: { single: 125000, mfj: 125000, hoh: 125000, qss: 125000 }, width: 1000, per: 20, perChild: true },
```

and in the row's `notes` replace `reduced by $20 for each $1,000 or fraction of AGI over $125,000 (not indexed).` with `reduced by $20 for each $1,000 or fraction of AGI over $125,000, taken off each child (the statute reduces the amount per child; gone at $175,000 for any number of children; not indexed).`

- [ ] **Step 5: Run to verify they pass**

Run: `node tests/state_child_credits.js && node tests/state_mechanisms.js && node tests/state_7d_households.js && npm run gen:states`
Expected: all pass (the 7D Vermont family has one child, so it does not move).

- [ ] **Step 6: Prove nothing else moved**

Run: `node tests/snapshot.js && node tests/tax_caches.js`
Expected: pass.

- [ ] **Step 7: Before/after, docs, badge, commit**

Before/after (credit only): 2 children at 150,000: 1,500 to 1,000; at 170,000: 1,100 to 200; at 174,001: 1,000 to 0; 3 children at 125,001: 2,980 to 2,940; 1 child unchanged. Rates: expected unchanged (record the `historical_rates` run). Badge V106 to V107 (same `node -e` as F1). README: Vermont `($1,000 age 6 and under, refundable)` becomes `($1,000 age 6 and under, refundable, phased out per child to nothing at $175,000)`. CLAUDE.md: add `` `phaseOut.perChild` `` to the same options bullet. Notes: update the VT row of the O4 table (`per child` wording, source cell adds `IN-112 table is per child`) and mark F2 `**Built (V107).**`.

```bash
git add Planner_US.html tests README.md CLAUDE.md docs/next-batches-plan.md docs/state-tax-rules.md
git commit -m "7O fix F2: Vermont child credit phase-out is per child (US V107)

32 V.S.A. 5830f(b) reduces the amount of the credit per child by 20 per 1,000
or fraction over 125,000 (the IN-112 table is per child); the row cut the household
total once, so two or more children kept part of the credit above 175,000. New
optional phaseOut.perChild. Snapshots unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: F3 Maine, the under-six doubling, the indexing (US V108)

**Root cause:** 36 M.R.S. 5219-SS(5) doubles the credit for each child under six for tax years from 2025 with no end date (the 7O note said 2025 only), and 36 M.R.S. 5403(9) and (10) index the credit amount and the phase-out thresholds (the row said not indexed and used $300). The 2025 Maine Revenue Services worksheet uses $305 and $610.

**Files:**
- Modify: `Planner_US.html` (the `me:` row: tiers, the two indexing flags, notes; badge)
- Test: `tests/state_child_credits.js` (the Maine block), `tests/state_7d_households.js` (the Maine family)
- Docs: `README.md`, `docs/next-batches-plan.md`, `docs/state-tax-rules.md`

**Interfaces:**
- Consumes: `tiers` take the first matching age (`age = taxYear - birthYear`; "has not attained 6 years of age before the end of the taxable year" is `age <= 5`).
- Produces: no evaluator change. ME `tiers: [[5, 610], [200, 305]]`, `creditAmountsIndexed: true`, `creditThresholdsIndexed: true` (the row has no other credit, so the flags touch only this one).

- [ ] **Step 1: Write the failing tests**

In `tests/state_child_credits.js` replace the whole Maine block (from `// --- Maine:` to the line before `// --- New Jersey:`) with:

```js
  // --- Maine: 305 per dependent, 610 for a child under six (5219-SS(5), no end date), refundable; 20 per 500 (or fraction)
  // of Maine AGI over 100,000 single / 125,000 head of household / 150,000 joint, taken off the household total; the
  // amounts and the thresholds are indexed (5403(9) and (10)); the 2025 worksheet values stand for 2026 -------------------
  const MECR = 'Dependent exemption tax credit';
  const mec = (w, kids, f = 'single', yi = 0) => run('me', w, kids, f, yi, MECR);
  near(mec(0, [kid(5)]), -610, 'ME: a child of 5 has not attained six: 610');
  near(mec(0, [kid(6)]), -305, 'ME: a child of 6 gets 305');
  near(mec(90000, [kid(5), kid(10)]), mnTax(90000) - 915, 'ME: 610 + 305');
  near(mec(100001, [kid(5), kid(10)]), mnTax(100001) - 895, 'ME 100,001: one fraction of 500, 20 off 915');
  near(mec(110000, [kid(5), kid(10)]), mnTax(110000) - 515, 'ME 110,000: 20 steps = 400 off 915');
  near(mec(125000, [kid(5), kid(10)]), mnTax(125000), 'ME single 125,000: 50 steps = 1,000 off 915, nothing left');
  near(mec(130000, [kid(3)], 'hoh'), mnTax(130000) - 410, 'ME head of household 130,000: 610 - 10 x 20');
  near(mec(160000, [kid(2), kid(4)], 'mfj'), mnTax(160000) - 820, 'ME joint 160,000: 1,220 - 20 x 20 = 820');
  near(mec(0, [kid(18)]), -305, 'ME: a dependent of 18 counts, 305');
  near(mec(0, [kid(19, { qualifyingChild: false })]), 0, 'ME: 19 and not a student is not a qualifying child here');
  near(mec(0, [kid(21, { student: true })]), -305, 'ME: a student of 21 counts, 305');
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    near(mec(0, [kid(3)], 'single', 10), -610 * f, 'ME indexed amount: 610 x f');
    near(mec(100000 * f + 1000, [kid(3)], 'single', 10), mnTax(100000 * f + 1000) - (610 * f - 2 * 20 * f), 'ME indexed: the start 100,000 x f and the 20 per step scale with f (1,000 over = 2 steps)');
  }
  st.inflation = 0;
```

In `tests/state_7d_households.js` replace the two Maine comment/expectation lines (the `// O4 (7O): the dependent exemption credit ...` comment and the `{ code: 'me', retiree: 0, family: 4238.425, ... }` entry) with:

```js
  // 7O fixes F3 (and O4): the dependent exemption credit for two children of 6 and 9 is 2 x 305 = 610 (AGI 132,000 is under the 150,000 joint start): 4,838.425 - 610
  { code: 'me', retiree: 0, family: 4228.425, why: 'pension deduction reduced by benefits received; dependent credit 610' },
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/state_child_credits.js; node tests/state_7d_households.js`
Expected: both FAIL (305/610 expected, 300 produced; family 4,238.425 produced).

- [ ] **Step 3: Change the Maine row**

Use this script (it edits only the `me:` row; run from the repo root):

```bash
node -e "
const fs=require('fs');let h=fs.readFileSync('Planner_US.html','utf8');const nl=h.includes('\r\n')?'\r\n':'\n';
const a=h.indexOf(nl+'    me: {'+nl);const m=h.slice(a+10).search(/\r?\n    [a-z]{2}: \{\r?\n/);const b=a+10+m;let s=h.slice(a,b);
function sub(x,y){if(s.split(x).length!==2)throw new Error('count: '+x.slice(0,50));s=s.replace(x,()=>y);}
sub('tiers: [[200, 300]],','tiers: [[5, 610], [200, 305]],');
sub('creditAmountsIndexed: false,','creditAmountsIndexed: true,');
sub('creditThresholdsIndexed: false,','creditThresholdsIndexed: true,');
h=h.slice(0,a)+s+h.slice(b);fs.writeFileSync('Planner_US.html',h);"
```

Then in the same row's `notes` replace the sentence beginning `Dependent exemption tax credit (36 M.R.S. 5219-SS, primary):` through `not other dependents.` with:

```
Dependent exemption tax credit (36 M.R.S. 5219-SS, primary): $300 for each dependent from 2026, doubled for each child under six for tax years from 2025 on with no end date (subsection 5), refundable, reduced by $20 for each $500 or fraction of Maine AGI over $100,000 single, $125,000 head of household and $150,000 joint; the amounts and the thresholds are indexed (36 M.R.S. 5403, subsections 9 and 10). The row uses the 2025 Maine Revenue Services worksheet figures ($305 and $610) for 2026 until the 2026 worksheet is published; the round-downs to $5 and $50 are not modeled. The planner counts the children in its list, not other dependents.
```

- [ ] **Step 4: Run to verify they pass**

Run: `node tests/state_child_credits.js && node tests/state_7d_households.js && node tests/state_rules.js && npm run gen:states`
Expected: all pass.

- [ ] **Step 5: Prove nothing else moved**

Run: `node tests/snapshot.js && node tests/tax_caches.js`
Expected: pass (no Maine household with children in the corpus).

- [ ] **Step 6: Before/after, docs, badge, commit**

Before/after (credit, 2026, inflation 0): one child of 3 at 90,000 single 300 to 610; children of 3 and 10 600 to 915; at 110,000 single 200 to 515. The O4 household (couple, children born 2023 and 2025, joint, AGI under 150,000): the credit goes from 600 to 1,220 a year while both are under six (2026-2028), 915 in 2029-2030, 610 from 2031; regenerate the O4 table's Maine row with the script in Task 4 Step 6 after F4 (the table moves again there). Rates: expected unchanged. Badge V107 to V108. README: `Maine ($300 a dependent, refundable)` becomes `Maine ($305 a dependent, $610 under six, refundable, indexed)`. Notes: update the ME row of the O4 table (`305 per dependent, 610 for a child under six, indexed amount and thresholds`) and correct "2025 was doubled" wherever it appears; mark F3 `**Built (V108).**`.

```bash
git add Planner_US.html tests README.md docs/next-batches-plan.md docs/state-tax-rules.md
git commit -m "7O fix F3: Maine dependent credit doubles under six every year and is indexed (US V108)

36 M.R.S. 5219-SS(5) doubles the credit for each child under six from tax year
2025 with no end date (the 7O note said 2025 only), and 5403(9)-(10) index the amount
and the thresholds. Row: tiers 610 / 305 (the 2025 MRS worksheet figures stand for 2026),
both credit indexing flags on. The 7D Maine family moves by 10 (610 vs 600).
Snapshots unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: F4 Maine, no personal exemption for dependents (US V109)

**Root cause:** 36 M.R.S. 5126-A(1) gives the personal exemption deduction to the filer (and a second one to a joint filer); dependents have been handled through the 5219-SS credit since 2018. The row has `dependentExemption: 5300`, so each child also lowers Maine taxable income by 5,300 (about 307 to 379 of tax). The 7D research copied the federal-style rule.

**Files:**
- Modify: `Planner_US.html` (the `me:` row: `dependentExemption`, notes; badge)
- Test: `tests/state_child_credits.js` (a real-row diff test), `tests/state_7d_households.js`
- Docs: `README.md` (none needed unless it mentions the exemption), `docs/next-batches-plan.md`, `docs/state-tax-rules.md`

**Interfaces:**
- Consumes: Task 3's ME credit.
- Produces: ME `dependentExemption: 0`; the Maine family household = 4,943.925.

- [ ] **Step 1: Write the failing tests**

In `tests/state_child_credits.js`, directly after the Maine block add (this one uses the REAL `me` row, so any dependent exemption shows up):

```js
  // 7O follow-up F4: Maine gives no personal exemption for a dependent (36 M.R.S. 5126-A(1)), only the credit. One child of 5 on
  // a single return at 80,000 (AGI under 100,000, so the full 610): the household with the child pays exactly 610 less.
  st.stateTax = 'me';
  {
    const kids = [kid(5)],
      base = { wages: 80000, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40], propertyTax: 0, rent: 0 };
    near(t.stateIncomeTax({ ...base, dependents: kids }, 'single', 0) - t.stateIncomeTax({ ...base, dependents: [] }, 'single', 0), -610, 'ME real row: a child changes the tax only by the 610 credit, no 5,300 exemption');
  }
```

In `tests/state_7d_households.js` update the Maine line written in F3 to:

```js
  // 7O fix F4: no personal exemption for dependents: taxable 132,000 - 31,400 - 10,600 = 90,000; 54,850 x 5.8% = 3,181.30 + 35,150 x 6.75% = 2,372.625 = 5,553.925; less the 610 credit
  { code: 'me', retiree: 0, family: 4943.925, why: 'pension deduction reduced by benefits received; dependent credit 610, no dependent exemption' },
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/state_child_credits.js; node tests/state_7d_households.js`
Expected: FAIL (difference is about -610 - 5,300 x the bracket rate; family 4,228.425).

- [ ] **Step 3: Change the row**

```bash
node -e "
const fs=require('fs');let h=fs.readFileSync('Planner_US.html','utf8');const nl=h.includes('\r\n')?'\r\n':'\n';
const a=h.indexOf(nl+'    me: {'+nl);const m=h.slice(a+10).search(/\r?\n    [a-z]{2}: \{\r?\n/);const b=a+10+m;let s=h.slice(a,b);
function sub(x,y){if(s.split(x).length!==2)throw new Error('count: '+x.slice(0,50));s=s.replace(x,()=>y);}
sub('dependentExemption: 5300,','dependentExemption: 0,');
sub('personal exemption \$5,300 per filer and dependent,','personal exemption \$5,300 per filer and none for dependents (36 M.R.S. 5126-A: dependents get the dependent exemption tax credit instead),');
h=h.slice(0,a)+s+h.slice(b);fs.writeFileSync('Planner_US.html',h);"
```

(If the `sub` for the notes fails because the dollar signs were eaten by the shell, apply the same replacement with the Edit tool: old `personal exemption $5,300 per filer and dependent,` new `personal exemption $5,300 per filer and none for dependents (36 M.R.S. 5126-A: dependents get the dependent exemption tax credit instead),`.)

- [ ] **Step 4: Run to verify they pass**

Run: `node tests/state_child_credits.js && node tests/state_7d_households.js && node tests/state_rules.js && npm run gen:states`
Expected: all pass.

- [ ] **Step 5: Prove nothing else moved**

Run: `node tests/snapshot.js && node tests/tax_caches.js`
Expected: pass.

- [ ] **Step 6: Before/after, docs, badge, commit**

Regenerate the O4 household table's Maine row with the scratch script used for O4 (couple 40 and 38, children born 2023 and 2025, 400,000 taxable, 100,000 cash, 1,500,000 Roth, spending 70,000; `window.__test_simulate()` rows 0-5 `tax`), once on a worktree of the previous commit and once now, and paste both lines into the notes. Expect Maine's tax to rise by about 2 x 5,300 x the marginal rate (614.80 to 715.50) a year in the taxed years and the credit to be 1,220 while both children are under six. Rates: record `historical_rates.js` (no Maine scenario: unchanged) and the MN/NJ scenarios unchanged. Badge V108 to V109. Notes: mark F4 `**Built (V109).**`.

```bash
git add Planner_US.html tests docs/next-batches-plan.md docs/state-tax-rules.md
git commit -m "7O fix F4: Maine gives no personal exemption for dependents (US V109)

36 M.R.S. 5126-A(1): the exemption is the filer's (and a joint spouse's); dependents get the
5219-SS credit. The row also deducted 5,300 per child (about 307 to 379 of tax each).
dependentExemption is now 0; the 7D Maine family moves to 4,943.925. Snapshots unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: F5 O1 MAGI iteration at the Medicaid / 100% cliffs, design A (US V110)

**Root cause (confirmed by pass logs, reproduced twice):** at the new cliffs the ACA cost STEPS DOWN as MAGI rises (full premium below the line, small premium above it: non-expansion under 100%, Medicaid declined, or a retired adult with no child 13 or younger from 2027). A pass that assumes low MAGI is charged the full premium, so it draws more and lands above the line; a pass that assumes high MAGI is charged the small premium, draws less and lands below. There is **no** fixed point, so the loop runs to `MAGI_ITER_MAX` and keeps whichever pass came last (WA 2027, spending 9,250: charged 12,000 at MAGI 21,822, where 772 is right). The 400% cliff never does this (cost rises with income).

**Design A (owner decision):** when a year ends the loop unconverged and some pass OVERPAID (its realized-MAGI cost is at or under its charge), re-run exactly that pass once ("forced"), then charge the realized cost and put the refund in cash. Every row then satisfies `healthcare === acaNetCost(row MAGI)`. It is a stopgap that overdraws on the conservative side, not a policy; filling to the line is 3C's design B.

**Files:**
- Modify: `Planner_US.html` (`magiStats` counters near `MAGI_ITER_MAX`; the year loop in `runProjection`: the `healthcareCost` call, `expenses`, the convergence block; a `window.__test_magiStats` hook; badge)
- Test: `tests/aca_medicaid.js` (the sweep and the stats assertions), `tests/roth_accounts.js` (no change here; F7)
- Docs: `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`

**Interfaces:**
- Consumes: `healthcareCost(args)` (one object argument; must keep taking one object), `acaNetCost(magi, size, gross, yearIndex)`, `MAGI_ITER_MAX`, `MAGI_ITER_TOL`.
- Produces: `magiStats = { forced, unresolved }` counters (module-level; `forced` = years finished by the forced pass, `unresolved` = years that hit the cap with no overpaying pass); `window.__test_magiStats` returns the object.

- [ ] **Step 1: Write the failing test (the sweep)**

In `tests/aca_medicaid.js`, before the final `assert.deepStrictEqual(errors, []);` add:

```js
  // 7O follow-up F5: at the cliffs that step the cost DOWN as MAGI rises (the full premium below a line, the credit above it) the
  // MAGI iteration has no fixed point. Every row before 65 must still charge exactly acaNetCost of its own MAGI, in the standard
  // and the historical engine, across a sweep of spending, and the cap must never be left unresolved.
  const sweep = await page.evaluate(() => {
    const t = window.__test_tax;
    const s = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(s));
    const base = {
      singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 64, returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0,
      dividendYield: 0, medicalInflation: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0, tenure: 'rent', rent: 0, rentGrowth: 0,
      incomeA: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, tradIraA: 1000000, trad401kA: 0, rothIraA: 0, roth401kA: 0,
      tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, acaEnabled: true, acaEnhanced: false, healthcare: 12000,
      medicaidWhenEligible: true, children: [], rothConvEnabled: false, incomeSources: [],
    };
    const out = { bad: [], rows: 0, stats: null };
    const before = { ...window.__test_magiStats };
    try {
      for (const code of ['wa', 'tx', 'ca', 'wi']) {
        for (let spending = 8000; spending <= 30000; spending += 1000) {
          Object.assign(s, base, { stateTax: code, spending });
          for (const [label, rows] of [
            ['std', window.__test_simulate().rows],
            ['hist', window.__test_simulateHistorical((y) => [1970 + y, 0, 0, 0]).rows],
          ]) {
            for (const r of rows) {
              if (r.age >= 65) continue;
              out.rows++;
              const want = t.acaNetCost(r.magiProxy, 1, 12000, r.year);
              if (Math.abs(r.healthcare - want) > 1.5) out.bad.push(`${label} ${code} spending ${spending} year ${r.year}: charged ${r.healthcare.toFixed(2)}, acaNetCost(MAGI ${r.magiProxy.toFixed(2)}) = ${want.toFixed(2)}`);
            }
          }
        }
      }
    } finally {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, saved);
    }
    const after = window.__test_magiStats;
    out.stats = { forced: after.forced - before.forced, unresolved: after.unresolved - before.unresolved };
    return out;
  });
  assert.deepStrictEqual(sweep.bad.slice(0, 5), [], `rows whose cost is not the cost at their own MAGI (${sweep.bad.length} of ${sweep.rows}): ${sweep.bad.slice(0, 5).join('; ')}`);
  assert(sweep.stats.forced > 0, 'the sweep reaches non-converging years, so the forced pass runs');
  assert.strictEqual(sweep.stats.unresolved, 0, 'no year is left at the cap with no overpaying pass');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/aca_medicaid.js`
Expected: FAIL with `TypeError` (`window.__test_magiStats` undefined) or, once the hook exists, hundreds of inconsistent rows (before the fix: 684 of 1,780 on the standard engine; the review's examples: WA 9,250 in 2027 charged 12,000 at MAGI 21,822, TX 12,000 in 2026 charged 408 at MAGI 12,408).

- [ ] **Step 3: Add the counters and the test hook**

Next to `const MAGI_ITER_MAX = 8, MAGI_ITER_TOL = 1;` add:

```js
  // Years that ended the MAGI iteration through the forced pass (7O follow-up F5), and years that hit the cap with no pass to force.
  const magiStats = { forced: 0, unresolved: 0 };
```

Next to the existing `window.__test_tax = {...}` line add `window.__test_magiStats = magiStats;`.

- [ ] **Step 4: Refactor the `healthcareCost` call (no behavior change)**

In the year loop replace

```js
        const { healthcare, ltc, usesMagiEstimate } = healthcareCost({
          acaEligibleA,
          ...
          magiProxy,
          magiHistory,
          filing,
        });
```

with (same keys, one object built once per pass so the hot path allocates what it did before):

```js
        const hcArgs = {
          acaEligibleA,
          acaEligibleB,
          singlePerson,
          isSurvivorPeriod,
          deceasedIsA,
          deceasedIsB,
          workingA,
          workingB,
          factor,
          year,
          age,
          ageB,
          magiProxy,
          magiHistory,
          filing,
        };
        const hcOut = healthcareCost(hcArgs);
        let healthcare = hcOut.healthcare;
        const ltc = hcOut.ltc,
          usesMagiEstimate = hcOut.usesMagiEstimate;
        // The cost at some other MAGI (the forced pass below prices the realized one).
        const costAtMagi = (m) => {
          hcArgs.magiProxy = m;
          const c = healthcareCost(hcArgs).healthcare;
          hcArgs.magiProxy = magiProxy;
          return c;
        };
```

and change `const expenses = baseSpend + healthcare + ...` to `let expenses = ...` (same expression).

Run `node tests/snapshot.js` here: expected **pass** (pure refactor; if it fails the keys list differs from the original, fix before going on).

- [ ] **Step 5: Add the pass log and the forced pass**

Directly before `for (let iter = 0; ; iter++) {` (after `const acctSnapshot = accountsClone(accts);`) add:

```js
        // Passes of this year that priced the premium off an estimate: what each estimated, what it was charged and what the
        // realized MAGI would have cost (the cost steps DOWN at the Medicaid and 100%-of-FPL lines, so there may be no fixed point).
        const passLog = [];
        let forcedPass = false;
```

Replace the convergence block

```js
        const realizedTrad = traditionalGross - conversionAmount;
        if (
          estUsed &&
          iter < MAGI_ITER_MAX - 1 &&
          Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain) > MAGI_ITER_TOL
        ) {
          // Damp after a few passes so a step in the subsidy schedule near the
          // 400%-FPL cliff can't make the estimate flip-flop between two values.
          const w = iter >= 3 ? 0.5 : 1;
          estTrad += w * (realizedTrad - estTrad);
          estGain += w * (taxableGainGross - estGain);
          continue;
        }
```

with

```js
        const realizedTrad = traditionalGross - conversionAmount;
        const unconverged =
          estUsed && Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain) > MAGI_ITER_TOL;
        if (usesMagiEstimate && !forcedPass)
          passLog.push({ estTrad, estGain, charged: healthcare, realized: costAtMagi(magiBase + traditionalGross + taxableGainGross) });
        if (unconverged && !forcedPass && iter < MAGI_ITER_MAX - 1) {
          // Damp after a few passes so a step in the subsidy schedule near the
          // 400%-FPL cliff can't make the estimate flip-flop between two values.
          const w = iter >= 3 ? 0.5 : 1;
          estTrad += w * (realizedTrad - estTrad);
          estGain += w * (taxableGainGross - estGain);
          continue;
        }
        if (unconverged && !forcedPass && usesMagiEstimate) {
          // No consistent answer (the cost steps down as MAGI rises past a Medicaid / 100% line): re-run the pass that overpaid the
          // least (its realized MAGI costs no more than it was charged), once. Its inputs are the logged estimate, so the pass
          // repeats exactly; the realized cost is charged below and the refund goes to cash.
          let pick = null;
          for (const p of passLog)
            if (p.realized <= p.charged + 1e-9 && (pick === null || p.charged - p.realized < pick.charged - pick.realized)) pick = p;
          if (pick !== null) {
            estTrad = pick.estTrad;
            estGain = pick.estGain;
            forcedPass = true;
            continue;
          }
          magiStats.unresolved++;
        }
        if (forcedPass && flow < 0) {
          // Charge the cost at the realized MAGI, return the difference to cash, and re-price the tax (the medical deduction follows the
          // premium). The cash can only rise: the refund is larger than the tax the lower deduction adds.
          const realizedCost = costAtMagi(magiBase + traditionalGross + taxableGainGross),
            refund = healthcare - realizedCost;
          healthcare = realizedCost;
          expenses -= refund;
          profile.medicalExpense = healthcare + ltc;
          const taxAfter = ficaTax + taxFor(profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty;
          bal.cash += refund + (totalTax - taxAfter);
          totalTax = taxAfter;
          magiStats.forced++;
        }
```

- [ ] **Step 6: Run to verify it passes**

Run: `node tests/aca_medicaid.js && node tests/aca_magi_iteration.js`
Expected: both pass. If the sweep still reports rows, print `sweep.bad` and check, in order: (1) `forcedPass && flow < 0` never true because the year was a surplus year (then the instability is elsewhere: stop and report); (2) `pick` null (the `unresolved` assertion catches it); (3) the pass log order (`passLog.push` must be before the `continue`s).

- [ ] **Step 7: Intended-number-change protocol**

1. `node tests/snapshot.js` will report moved ACA scenarios. List them (count first), and for each moved family compare against a worktree of the previous commit exactly as `CLAUDE.md` describes (`node tests/snapshot.js --root <worktree> --dump A --update-nothing`, `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`). Every non-ACA scenario must be unchanged; ACA scenarios may move only in years that reached the cap (rows move toward a consistent cost, more cash, a little more tax). If a non-ACA scenario moved, stop.
2. `npm run snapshot:update` (the commit message says why).
3. Seeded rates before/after for the two low-MAGI scenarios (CA, TX) in `tests/historical_rates.js` and the default: record both runs.
4. Timing: `node tests/bench_runs.js --root <worktree> --states tx,ca,wa` before/after (ACA off: unchanged), and an interleaved one-process comparison for an ACA-on household near the line (single 60, IRA 1,000,000, spending 12,000, TX, 400 `simulate()`, median of 7): within +5%.

- [ ] **Step 8: Docs, badge, commit**

Badge V109 to V110. README: after the Medicaid sentence add `Where the premium steps down as income rises (the Medicaid and 100% lines) the year has no consistent answer; it is finished by charging the cost at the realized income and returning the difference to cash (a conservative stopgap).` CLAUDE.md: in the "Medicaid and the premium-credit floor" bullet add `At the step-down cliffs the MAGI iteration has no fixed point: after the cap the pass that overpaid the least is re-run once (\`forcedPass\`), the cost at the realized MAGI is charged and the refund goes to cash (\`magiStats\`, 7O follow-up F5; filling to the line is 3C).` Notes: correct the O1 text (`two consistent answers` becomes `no consistent answer`) and mark F5 `**Built (V110): design A.**`; add the before/after rows, rates and timing.

```bash
git add Planner_US.html tests README.md CLAUDE.md docs/next-batches-plan.md
git commit -m "7O fix F5: finish MAGI-iteration years that have no fixed point at the Medicaid and 100% cliffs (US V110)

The cost steps down as MAGI rises, so a pass that assumes low MAGI is charged the full
premium, draws more and lands above the line, and the reverse: no fixed point, and the year
kept whichever pass came last (684 of 1,780 probe rows charged a cost that is not the cost at
their own MAGI). After the cap the pass that overpaid the least is re-run once, the cost at
the realized MAGI is charged and the refund goes to cash. Intended number change: ACA-on
snapshot scenarios that reached the cap moved (npm run snapshot:update); ACA-off and
converging years are identical.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: F6 Pennsylvania, the Roth-conversion share of the 401(k) exemption (CONDITIONAL, US V111)

**Gate (do this first; the code is built only if the answer is clear):** does Pennsylvania exempt a retiree's 401(k)-to-Roth conversion? Read the PA Personal Income Tax Guide (Gross Compensation, and the retirement/rollover and Roth conversion sections) and 61 Pa. Code 101.6 in the built-in browser (`mcp__Claude_Browser__navigate`, then `get_page_text`). The Guide is `https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/gross-compensation`.

- [ ] **Step 1: Research and decide**

Record the quote and the verdict in `docs/next-batches-plan.md` under F6. **If the Guide clearly says a conversion of employer-plan money by a retiree is exempt** (it is a distribution from an employer plan after retirement), build the fix below with the `+ conv401k` term. **If the Guide says a conversion is taxable, or is silent or unclear**, do not build the code: keep approximation (2) in the PA notes, mark F6 `**Not built: documented approximation (owner)**`, commit the doc only, and skip to Task 7. (A conversion that comes from IRA money is taxable either way, which is what the code below fixes; but the owner decision is to skip the whole change unless the 401(k) part is clear, because the exemption of the 401(k) part is what makes the helper necessary.)

**Root cause (if built):** `taxFor` splits the whole `traditionalExtra` (draw plus conversion) between the partners by ownership share and then exempts `k401Frac` of it. The engine converts from the IRAs first (`accountsConvert`: both IRAs pro rata, then both 401(k)s), so for a PA filer under 59.5 with IRA and 401(k) money the conversion is partly exempted although it came from IRA money; PA tax is understated by 3.07% x conversion x the 401(k) fraction.

**Files:**
- Modify: `Planner_US.html` (`accountsConvert401kPart` beside `accountsConvert`; `profile.conversionAmount` / `profile.conversion401k` set each pass after `solveRothConversion`; the four per-person blocks of `taxFor`; test hook; badge)
- Test: `tests/pa_employer_plan.js`
- Docs: `README.md` (none), `CLAUDE.md`, `docs/next-batches-plan.md`

**Interfaces:**
- Consumes: `accountBalances(a.trad, pool)` (dollars per slot `[IRA A, 401(k) A, IRA B, 401(k) B]`), `seppActive` (per-slot booleans or null, the same `excluded` argument `accountsConvert` takes), `profile.k401FracA/B`, `profile.ownerShareA`.
- Produces: `accountsConvert401kPart(a, tradPool, amount, excluded = null) -> number` (the 401(k) part of a conversion of `amount`, in the order `accountsConvert` uses; moves nothing); profile fields `conversionAmount` (the pass's conversion) and `conversion401k` (its 401(k) part), both 0 when absent. Internal only: no `FIELDS` entry, no MCP property, nothing saved.

- [ ] **Step 2: Write the failing tests**

In `tests/pa_employer_plan.js`, before `assert.deepStrictEqual(errors, []);` add (the page already has the clock pinned to 2026-06-15; `near` is defined at the top):

```js
  // 7O follow-up F6: the Roth-conversion part of the traditional draw. A conversion comes from the IRAs first, so it is exempt only
  // when it came out of 401(k) money.
  const pa = await page.evaluate(() => {
    const t = window.__test_tax;
    const s = window.__test_getState();
    const saved = s.stateTax;
    s.stateTax = 'pa';
    const prof = (o) => Object.assign({ wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 52, ageB: 50, singlePerson: true, filing: 'single', ownerShareA: 1, k401FracA: 0.6, k401FracB: 0 }, o);
    const old = t.taxFor(prof({}), 0, 30000);
    // Single 52, IRA 200,000 and 401(k) 300,000 (a 0.6 401(k) share), a conversion of 30,000 that came wholly from the IRA.
    const fromIra = t.taxFor(prof({ conversionAmount: 30000, conversion401k: 0 }), 0, 30000);
    // The same conversion once the IRAs are empty: it came from the 401(k).
    const from401k = t.taxFor(prof({ conversionAmount: 30000, conversion401k: 30000 }), 0, 30000);
    // A 20,000 draw plus a 30,000 IRA conversion: the draw keeps the 0.6 exemption.
    const mixed = t.taxFor(prof({ conversionAmount: 30000, conversion401k: 0 }), 0, 50000);
    const mixedOld = t.taxFor(prof({}), 0, 50000);
    s.stateTax = saved;
    return { old, fromIra, from401k, mixed, mixedOld, helper: window.__test_accountsConvert401kPart ? [window.__test_accountsConvert401kPart([0.4, 0.6, 0, 0], 500000, 30000), window.__test_accountsConvert401kPart([0.4, 0.6, 0, 0], 500000, 250000), window.__test_accountsConvert401kPart([0.4, 0.6, 0, 0], 500000, 600000), window.__test_accountsConvert401kPart([0.4, 0.6, 0, 0], 500000, 250000, [true, false, false, false])] : null };
  });
  // PA tax is 3.07% of the taxed part; the federal tax is the same in both (the same 30,000 of ordinary income).
  near(pa.fromIra - pa.old, PA * 30000 * 0.6, 0.01, 'IRA-sourced conversion: PA taxes the 18,000 that the pro rata share had exempted (3.07% x 18,000 = 552.60)');
  near(pa.from401k - pa.old, -PA * 30000 * 0.4, 0.01, 'a 401(k)-sourced conversion is fully exempt: 3.07% x 12,000 = 368.40 less than the pro rata treatment');
  near(pa.mixed - pa.mixedOld, PA * 30000 * 0.6, 0.01, 'a draw plus an IRA-sourced conversion: only the conversion changes (552.60)');
  assert(pa.helper, 'accountsConvert401kPart is exposed');
  // Pool 500,000, shares IRA A 0.4 (200,000) and 401(k) A 0.6 (300,000): the IRAs go first.
  near(pa.helper[0], 0, 1e-9, 'a 30,000 conversion is all IRA money');
  near(pa.helper[1], 50000, 1e-9, 'a 250,000 conversion takes the 200,000 IRA and 50,000 of the 401(k)');
  near(pa.helper[2], 300000, 1e-9, 'a 600,000 conversion is capped at the pool: the whole 401(k) part, 300,000');
  near(pa.helper[3], 250000, 1e-9, 'with the IRA locked in a 72(t) plan the whole 250,000 comes from the 401(k)');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node tests/pa_employer_plan.js`
Expected: FAIL (`accountsConvert401kPart is exposed`, and `fromIra - old` is 0 because the fields are unread).

- [ ] **Step 4: Implement the helper and the profile fields**

Beside `accountsConvert` add:

```js
  // The 401(k) part of a conversion of `amount` out of the traditional pool `tradPool`, in the order accountsConvert takes it (IRAs
  // first, then 401(k)s), never from an account under a running 72(t) plan (`excluded`). Moves nothing. Used to tell the tax code how
  // much of the year's conversion is employer-plan money (Pennsylvania exempts that part after retirement).
  function accountsConvert401kPart(a, tradPool, amount, excluded = null) {
    if (!(amount > 0)) return 0;
    const d = accountBalances(a.trad, tradPool),
      ok = (i) => (excluded && excluded[i] ? 0 : d[i]),
      ira = ok(0) + ok(2),
      k401 = ok(1) + ok(3);
    return Math.max(0, Math.min(amount, ira + k401) - ira);
  }
```

Next to `window.__test_tax = ...` add `window.__test_accountsConvert401kPart = (shares, pool, amount, excluded) => accountsConvert401kPart({ trad: shares }, pool, amount, excluded);`.

In the year loop, directly after `conversionAmount = solveRothConversion(profile, conversionCap, year, age);` (inside `if (convertsThisYear) {...}`) leave as is, and directly after that `if` block add:

```js
        // The year's conversion and its 401(k) part for the state tax (Pennsylvania exempts employer-plan money after retirement).
        profile.conversionAmount = conversionAmount;
        profile.conversion401k = conversionAmount > 0 ? accountsConvert401kPart(accts, bal.traditional + bal.bondTraditional, conversionAmount, seppActive) : 0;
```

(Check that `seppActive` is declared before this point in the year body; it is the same variable `applyRothConversion` receives. If it is declared later, move its declaration up, not the other way round.)

- [ ] **Step 5: Use it in the four per-person blocks of `taxFor`**

At the top of `taxFor`, after `const invOrd = ...` add `const conv = profile.conversionAmount || 0, conv401k = profile.conversion401k || 0;`. Replace the four `retirement401k` assignments:

- joint (`sources.retirement401kA` / `B`):

```js
          sources.retirement401kA = Math.max(0, sources.retirementA - conv * shareA) * (profile.k401FracA || 0) + conv401k * shareA;
          sources.retirement401kB = Math.max(0, sources.retirementB - conv * (1 - shareA)) * (profile.k401FracB || 0) + conv401k * (1 - shareA);
```

- single (`sources.retirement401kA`; B is 0):

```js
          sources.retirement401kA = Math.max(0, sources.retirementA - conv) * (profile.k401FracA || 0) + conv401k;
```

- two filers, A (`sourcesA.retirement401kA`):

```js
        sourcesA.retirement401kA = Math.max(0, sourcesA.retirementA - conv * shareA) * (profile.k401FracA || 0) + conv401k * shareA;
```

- two filers, B (`sourcesB.retirement401kA`, B's own return reads slot A):

```js
        sourcesB.retirement401kA = Math.max(0, sourcesB.retirementA - conv * (1 - shareA)) * (profile.k401FracB || 0) + conv401k * (1 - shareA);
```

(These run only when the row's `needsPerPerson` is set, so every non-per-person state keeps its exact path.)

- [ ] **Step 6: Run to verify it passes, then the guards**

Run: `node tests/pa_employer_plan.js && node tests/tax_caches.js && node tests/state_mechanisms.js && node tests/snapshot.js`
Expected: all pass (no PA scenario in the snapshot corpus; `tax_caches` proves the fields are read only under `needsPerPerson`).

- [ ] **Step 7: Docs, badge, commit**

Badge V110 to V111. CLAUDE.md: extend the PA sentence with `The year's Roth conversion rides on the profile (\`conversionAmount\`, \`conversion401k\` from \`accountsConvert401kPart\`, internal) so only its 401(k) part is exempt; draws stay pro rata.` Notes: mark F6 `**Built (V111).**` with the PA Guide quote and approximation (2) updated; the PA notes in the row say `a conversion is exempt only for the part that came from 401(k) money (the IRAs are converted first)`; `npm run gen:states`.

```bash
git add Planner_US.html tests CLAUDE.md docs/next-batches-plan.md docs/state-tax-rules.md
git commit -m "7O fix F6: Pennsylvania exempts only the 401(k) part of a Roth conversion (US V111)

The engine converts from the IRAs first, but taxFor exempted the conversion at the pro rata
401(k) share. The year's conversion and its 401(k) part now ride on the profile
(accountsConvert401kPart, internal), so IRA-sourced conversions are taxed. No snapshot moves.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: F7 Minor items and the note corrections (US V112, or no badge bump if only docs and test comments change)

**Files:**
- Modify: `tests/roth_accounts.js` (comment), `Planner_US.html` (the Maine row note), `docs/next-batches-plan.md`
- Docs: `docs/state-tax-rules.md` (regenerated if the Maine note changes)

- [ ] **Step 1: Fix the stale `roth_accounts.js` comment**

In `tests/roth_accounts.js`, case 8, replace the comment lines

```js
  // 8. The MAGI iteration rewinds the ledgers. ACA makes each year iterate (the premium depends on the
  //    realized MAGI): 3,000 of taxable stock with no basis is sold first (its gain differs from the
```

with

```js
  // 8. The MAGI iteration rewinds the ledgers. With the ACA on, each year iterates while its estimate of the
  //    discretionary income differs from what the draws realized (the household is on Medicaid here, so the premium
  //    itself is 0; the re-run comes from the estimate): 3,000 of taxable stock with no basis is sold first (its gain differs from the
```

(keep the following comment lines and the case unchanged). Run `node tests/roth_accounts.js`: expected `roth accounts tests passed`.

- [ ] **Step 2: Decide the O5 field note (document, do not change)**

The "Unusual value" note fires on `focusout` of an `UNUSUAL_RANGES` field, so for the Social Security item it appears only when the person leaves `ssStartAgeA/B`. The list item and the field marker appear whatever triggered the item. Decision (matches the range items; YAGNI): keep it, and say so in the O5 notes. Add to the O5 section of `docs/next-batches-plan.md`: `The field note (a brief "Unusual value" under the field) shows only after leaving the Social Security start-age field, as for the range items; the list item and the marker follow the condition whatever field changed it.`

- [ ] **Step 3: Correct the 7O notes**

In `docs/next-batches-plan.md`, with the Edit tool:
1. O1 "Behavior": replace `in the work-requirement years the iteration shows two consistent answers for a household near the line, a low-MAGI year with the full premium or a MAGI just over the line with the credit)` with `in the work-requirement years and at the 100% line a household near the line has no consistent answer: the cost steps down as MAGI rises; F5 finishes such years, filling to the line is 3C)`.
2. O4 table: the VT, ME and OR rows already corrected in Tasks 1 to 3; check that no row still says `not indexed` for Maine or `doubled 2025` anywhere (`grep -n "2025 was doubled\|Maine.*not indexed" docs/next-batches-plan.md`; expected: only the quoted findings in the follow-up section).
3. The "Not modeled" paragraph of O4: add `Maine's credit is for any dependent by statute; the planner counts the children in its list.`

- [ ] **Step 4: Maine personal-exemption phase-out note**

The Maine row note says the exemption phase-out starts above `$125,000 single / $250,000 joint of AGI`. 36 M.R.S. 5126-A(2) says the applicable amounts are $266,700 (single), $293,350 (head of household) and $320,000 (joint, surviving spouse), indexed under 5403(8), with a denominator of $125,000 ($62,500 married filing separately). Read the 2025 Form 1040ME instructions (`https://www.maine.gov/revenue/` forms page, built-in browser) for the 2025 applicable amounts, then replace in the `me:` row notes the clause `its phase-out above $125,000 single / $250,000 joint of AGI and` with `the personal exemption phase-out (a share of the exemption equal to the AGI over $266,700 single, $293,350 head of household or $320,000 joint, indexed, divided by $125,000; 36 M.R.S. 5126-A(2)) and`. Do not model it (it applies only above about $267,000). Run `node tests/state_rules.js && npm run gen:states`.

- [ ] **Step 5: Re-read the Minnesota and Utah texts**

Open Schedule M1CWFC (`https://www.revenue.state.mn.us/sites/default/files/2026-07/m1cwfc-25.pdf`, lines 8 to 14) and Utah Code 59-10-1047 (`https://le.utah.gov/xcode/Title59/Chapter10/59-10-S1047.html`, built-in browser). Confirm the reduction is off the household total in both (MN line 14 `Multiply line 12 by line 13` off line 9; UT subsection (4) `the tax credit ... shall be reduced`). Record the one-line quote of each in the follow-up section. If either says per child, stop and report (it would be another F2).

- [ ] **Step 6: Verify and commit**

Run: `node tests/roth_accounts.js && node tests/state_rules.js && npm run gen:states && npm run check:shared`
Expected: all pass. If the Maine row note changed, bump the badge V111 (or V110 if F6 was not built) to the next number; if only the test comment and docs changed, do not bump.

```bash
git add tests/roth_accounts.js docs/next-batches-plan.md Planner_US.html docs/state-tax-rules.md
git commit -m "7O fixes F7: test comment, note corrections, Maine exemption phase-out note

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification and the pull request

**Files:** none changed.

- [ ] **Step 1: Full verification**

Run: `npm test`
Expected: exit 0 (about 5 minutes). Then `npm run check:shared` (`shared regions OK`), `git status --short` (clean), and `grep -c 'vertical-align:middle">V11[0-9]</span>' Planner_US.html` equals `1` with the highest badge you built.

- [ ] **Step 2: Mobile and timing spot checks**

Run the interleaved timing script for (a) the default couple, (b) MN with two young children, (c) an ACA-on household near the Medicaid line (F5) against a worktree of `origin/claude/batch-3b-penalty-rules` (the pre-7O base is `995ac9d`; for the fix-only delta use the 7O tip `44f5173`). Expected: the F5 household within +5% of `44f5173`; no change for ACA-off. A 390x844 overflow check is only needed if any sidebar markup changed (none here).

- [ ] **Step 3: Push and open the PR (do not merge)**

```bash
git push -u origin claude/batch-7o-fixes
gh pr create --base claude/batch-3b-penalty-rules --head claude/batch-7o-fixes --title "Batch 7O (re-applied) with review fixes F1-F7" --body-file <path to a body file listing the original 7O items, the fixes F1-F7, the owner decisions, and "not merged: owner reviews">
```

The PR body must say: this PR re-applies 7O (the revert `a7c9d27` is itself reverted in its first commit) and adds the fixes; the Oregon sunset is not modeled (owner decision); F5 is design A with B left to 3C; F6 built or not built (say which and why). Then stop and report the PR URL; do not merge.

- [ ] **Step 4: Clean up**

Remove every scratch worktree created with `git worktree add` (`git worktree list` shows them; `git worktree remove --force <path>`), and any `tests/_*.js` scratch file.

---

## Self-Review

**Spec coverage:** F1 (Task 1, the share option, rounding, no sunset), F2 (Task 2), F3 (Task 3), F4 (Task 4), F5 design A (Task 5, with the sweep, cash accounting, stats, snapshot protocol), F6 (Task 6, gated on the PA guide), F7 (Task 7: roth_accounts comment, O5 field note decision, 7O note corrections, Maine exemption phase-out note, MN/UT re-read), PR (Task 8), branch mechanics so the PR is not empty (Task 0). Owner decisions are in the header and in the tasks they affect. The O4 household table and README lines are updated per task.

**Placeholder scan:** every code step has the code; the two places that say "regenerate with the scratch script" (Task 4 Step 6, the O4 household table) refer to a script the implementer can recreate from `tests/historical_rates.js`'s patch style: the O4 table's exact scenario is listed in the same step. `<path to a body file ...>` in Task 8 is an instruction to write that file, not a hidden step.

**Type/name consistency:** `phaseOut.share` / `perChild` / `maxChildren` / `fixed` / `measure` / `rate` (Tasks 1-2); `magiStats.{forced,unresolved}`, `window.__test_magiStats`, `passLog`, `forcedPass`, `costAtMagi`, `hcArgs` (Task 5); `accountsConvert401kPart`, `window.__test_accountsConvert401kPart`, `profile.conversionAmount`, `profile.conversion401k`, `conv`, `conv401k` (Task 6). Badge numbers V106 to V111 in order; F6 may be skipped, in which case F7 takes the next free number.

**Review Focus coverage:** (1) Task 5 Step 4 (snapshot after the pure refactor) and Step 7 (non-ACA scenarios unchanged); (2) Task 5 Step 1 (consistency sweep, `unresolved` 0) and the cash comment; (3) Task 1 and 2 tests with 2, 3 and 6 children; (4) Task 3 tests (ages 5, 6, 18, 19, 21 student, year index 10) and Task 1 (2029 still paid); (5) Task 6 tests (IRAs empty, SEPP-locked IRA, no conversion fields).
