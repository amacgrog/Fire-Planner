# Per-year Withdrawal and Conversion Solver (Rule of 55 PR + Batch 3C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the per-partner Rule of 55 election (PR 1), then a per-year solver in the US planner that picks each year's MAGI target, stock-account order and (two returns) whose accounts fund the draw, scored by after-tax wealth with traditional dollars valued at `1 - lambda` (PR 2, Batch 3C).

**Architecture:** One function per year, `chooseYearPlan`, dry-runs the year's real withdrawal (the existing 3B primitives) on cloned balances and ledgers for 1 to 6 candidates and keeps the best; the real pass then applies that plan through a MAGI cap in `takeTraditional` or a fill draw. lambda comes from `lambdaEstimate` (three synthetic future years, the real tax functions). The plan (and, in tax-aware mode, the conversion) is chosen on the year's first MAGI pass and held fixed across the later passes, because re-deciding on every pass could stop the iteration converging. This narrows the spec's "one function per MAGI pass" wording, so tell the owner. The MAGI iteration, its forced pass and every existing order stay as they are.

**Tech Stack:** Single-file HTML/JS planner (`Planner_US.html`, one IIFE), Node + Playwright tests (`tests/*.js`, `npm test`), root `test_*.js` Playwright UI scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md` (read it before starting; this plan argues from it).

## Global Constraints

- Two PRs, in order: **PR 1 = Tasks A1-A2** (Rule of 55, no number change); **PR 2 = Tasks B1-B7** (3C). Each PR goes into `claude/tender-meitner-a3bo59`, never `main`; open it only when the owner asks.
- US only. `Planner_Canada.html` is not touched. No `// @@shared:` region may change (`npm run check:shared` must stay green with no `npm run sync`).
- One commit per task. `npm test` passes at the end of every commit.
- Intended number change = before/after table in the commit message, then `npm run snapshot:update` in the same commit, naming the scenarios that moved and why. Never update a snapshot to silence an unexplained diff (`node tests/snapshot.js --dump` / `--compare` against a worktree of the previous commit).
- A pure refactor or default-off change leaves every snapshot byte-identical.
- New fields: one `FIELDS` entry, a `defaults` value, a `normalizeState` path, MCP via `mcp: true`, a `tests/legacy_state.js` case (the baseline is regenerated because every case's state gains the key; say so in the commit).
- Version badge `V112` (`Planner_US.html` line ~276) bumps in every user-facing commit: A1 V113, A2 V114, B1 V115, B4 V116, B5 V117, B6 V118. B2, B3, B7 do not bump.
- README feature list and `CLAUDE.md` move in the same commit as the user-facing or architectural change. `docs/reference.md` is not edited; findings go to the 3C batch notes in `docs/next-batches-plan.md` (Task B7).
- Hot path: no per-call allocation added to `taxFor`, `drawTaxable` or the solvers. Solver work only in years with a withdrawal (`flow < 0`) and the solver switched on.
- Performance gate: `tests/bench_runs.js` within **+5%** for households with no cliff in reach; the ACA early-retiree case and one Monte Carlo run within **+30%** (interleaved, one process).
- Hard rule of the scenario sweep: **no scenario depletes earlier** with the guard on than with it off.
- Windows: the tree is CRLF; commit through git as usual (git normalizes).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Survivor transition years** (joint death year, then one return): never treated as two returns; the plan must leave `tests/survivor_symmetry.js` (A-dies equals B-dies) green with the guard on. Pinned in Task B4 step 1 (case 6).
2. **Marry-later wedding**: the IRMAA lookback reads a two-return year from a joint year; each person is charged on their own lookback MAGI. Pinned in Task B1 (case 5).
3. **No penalty-free traditional money** (age 50, IRA only, no Rule of 55): the fill candidate must never be offered, so the guard never draws penalized money to reach a line. Pinned in Task B4 (case 5).
4. **Ties and repeat runs**: a candidate must beat the natural draw by more than $1 to be chosen, and two runs of one scenario give identical rows. Pinned in Task B4 (case 7).
5. **Bucket engine down year** with the need fully met from cash: the guard is a no-op and the historical run stays finite. Pinned in Task B4 (case 8).

## File Structure

- Modify `Planner_US.html` only (all app code). Regions touched, by task:
  - A1: `syncControls` (~13181), a `REVEAL_BY_ID` map after `FIELDS`.
  - A2: markup at ~539, `defaults` (~911), `FIELDS` (~1238), `normalizeState` (~1358), group state text (~2436), `rule55Applies` / `accountStatuses` (~7307, ~7465), `syncControls`.
  - B1: helpers beside `irmaaLookbackMagi` (~7086), `healthcareCost` (~8413), `conversionMagiCeiling` (~8533), the US year loop in `runProjection` (~9337-9766).
  - B2: new section "Per-year solver (3C)" placed just above `newWithdrawal` (~8683); `window.__test_solver` near the other test hooks (~15043).
  - B3: `newWithdrawal`, `takeTraditional`, `tradGroup`, `withdrawStandard`, `BUCKET_STEP` (not shared), `drawMixedStockAccounts`, year loop.
  - B4-B6: the solver section, `solveRothConversion`, `drawMixedStockAccounts`, year loop, markup for the checkbox (~533), `FIELDS`, `defaults`.
- Tests, new: `test_rule55_sepp_fields.js` (root), `tests/rule55_per_partner.js`, `tests/two_return_magi.js`, `tests/solver_hooks.js`, `tests/solver_primitives.js`, `tests/cliff_guard.js`, `tests/tax_aware.js`, `tests/two_return_split.js`; measurement scripts (not in `npm test`) `tests/solver_scan.js`, `tests/solver_gap.js`, `tests/bench_solver.js`.
- Tests, edited: `tests/penalty_status.js`, `tests/roth_accounts.js`, `tests/traditional_penalty.js`, `tests/account_ledger.js`, `tests/pa_employer_plan.js`, `tests/penalty_aware_withdrawals.js`, `tests/sepp_per_account.js`, `tests/snapshot_scenarios.js`, `tests/legacy_state.js`, `package.json` (test chain).
- Docs: `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`.

Shared test boilerplate used by every new `tests/*.js` file below (copy it verbatim at the top of each):

```js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);

async function openPlanner() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  return { browser, page, errors };
}
// Runs simulate() under a state patch and restores the state afterwards. Returns the rows.
const rows = (page, patch) =>
  page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return JSON.parse(JSON.stringify(window.__test_simulate().rows));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, patch);
// Calls window.__test_tax[fn](...args) under a state patch.
const taxCall = (page, patch, fn, args) =>
  page.evaluate(({ patch, fn, args }) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_tax[fn](...args);
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { patch, fn, args });
```

A base household used by several 3C tests (copy where a test says "BASE"):

```js
const BASE = {
  singlePerson: true, filingStatus: 'single', marryLater: false, survivorEnabled: false, children: [],
  ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 64, lifeExpectancyB: 64,
  inflation: 0, medicalInflation: 0, returnRate: 0, bondReturn: 0, hysaRate: 0, incomeA: 0, incomeB: 0,
  taxable: 0, basisRatio: 100, cash: 3000000, cashReserve: 0, bondYears: 0, spending: 40000,
  tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, rothIraBasisA: 0,
  tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, rothIraBasisB: 0,
  ssMonthlyA: 0, ssMonthlyB: 0, pensionCoverage: 'both', pensionYearlyA: 0, pensionYearlyB: 0, pensionStartAgeA: 0, pensionStartAgeB: 0,
  stateTax: 'tx', acaEnabled: false, acaEnhanced: false, medicaidWhenEligible: true, healthcare: 12000,
  medicareYearly: 0, ltcEnabled: false, irmaaPriorKnown: false, rothConvEnabled: false,
  withdrawalMixEnabled: false, smoothWithdrawals: false, appliedMixSchedule: null, appliedRothSchedule: null,
  guardrailsEnabled: false, incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
  sepp72tIraA: false, sepp72tK401A: false, sepp72tIraB: false, sepp72tK401B: false,
};
```

(`ruleOf55A` / `ruleOf55B` exist from Task A2 and `cliffGuardEnabled` from Task B4; tests written after those tasks add them to their patches.)

---

# PR 1: Rule of 55 per partner, 72(t) field visibility (no number change)

### Task A1: Partner B 72(t) first-payment fields hide when their box is unchecked

**Files:**
- Modify: `Planner_US.html` (`syncControls` ~13205; new `REVEAL_BY_ID` just after the `FIELDS` array closes, before `syncFieldDom` ~1263)
- Test: `test_rule55_sepp_fields.js` (repo root, new)

**Interfaces:**
- Produces: `revealHidden(id) -> boolean` (true when a registry `reveals` entry hides element `id` under the current state).

- [ ] **Step 1: Write the failing test**

Create `test_rule55_sepp_fields.js`:

```js
// The 72(t) first-payment age fields follow their checkbox for both partners, and Partner B's hide in
// single-person mode. Root ad-hoc Playwright script: node test_rule55_sepp_fields.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
  await page.waitForTimeout(300);
  const hidden = (id) => page.evaluate((id) => document.getElementById(id).hidden, id);
  const set = (patch) =>
    page.evaluate((patch) => {
      Object.assign(window.__test_getState(), patch);
      window.__test_syncControls();
    }, patch);
  const fields = [['sepp72tK401A', 'sepp72tK401AAgeField'], ['sepp72tIraA', 'sepp72tIraAAgeField'], ['sepp72tK401B', 'sepp72tK401BAgeField'], ['sepp72tIraB', 'sepp72tIraBAgeField']];

  await set({ singlePerson: false, sepp72tK401A: false, sepp72tIraA: false, sepp72tK401B: false, sepp72tIraB: false });
  for (const [, field] of fields) assert.strictEqual(await hidden(field), true, `${field} hidden while its box is unchecked`);
  await set({ sepp72tK401A: true, sepp72tIraA: true, sepp72tK401B: true, sepp72tIraB: true });
  for (const [, field] of fields) assert.strictEqual(await hidden(field), false, `${field} shown while its box is checked`);
  await set({ singlePerson: true });
  assert.strictEqual(await hidden('sepp72tK401BAgeField'), true, 'B field hidden in single-person mode');
  assert.strictEqual(await hidden('sepp72tIraBAgeField'), true, 'B field hidden in single-person mode');
  assert.deepStrictEqual(errors, []);
  console.log('test_rule55_sepp_fields: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add the hook next to the other test hooks (~line 15064): `window.__test_syncControls = () => syncControls();`

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_rule55_sepp_fields.js`
Expected: FAIL with `sepp72tK401BAgeField hidden while its box is unchecked` (the partner-B loop un-hides it).

- [ ] **Step 3: Write minimal implementation**

Just after the `FIELDS` array (before `function syncFieldDom`), add:

```js
  // Registry reveals by element id, so code that shows or hides a whole group of elements (the partner-B
  // loop in syncControls) does not undo a reveal that hides one of them.
  const REVEAL_BY_ID = new Map();
  FIELDS.forEach((f) => (f.reveals || []).forEach((r) => REVEAL_BY_ID.set(r.id, r.hidden)));
  function revealHidden(id) {
    const fn = REVEAL_BY_ID.get(id);
    return !!fn && fn(state);
  }
```

In `syncControls`, replace

```js
    document
      .querySelectorAll('[data-partner-b]')
      .forEach((el) => (el.hidden = !!state.singlePerson));
```

with

```js
    // Partner B's elements hide in single-person mode, and otherwise only when their own registry reveal
    // hides them (the 72(t) first-payment fields while their box is unchecked).
    document
      .querySelectorAll('[data-partner-b]')
      .forEach((el) => (el.hidden = !!state.singlePerson || revealHidden(el.id)));
```

Bump the badge `V112` -> `V113`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test_rule55_sepp_fields.js` -> `test_rule55_sepp_fields: OK`
Run: `npm test` -> all pass. If `tests/snapshot_ui.js` reports a visibility change only for the two B age fields, that is the intended fix: run `node tests/snapshot_ui.js --update` and say so in the commit.

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html test_rule55_sepp_fields.js tests/snapshots/ui_us.json
git commit -m "Fix: Partner B 72(t) first-payment fields hide while their box is unchecked (US V113)

syncControls un-hid every data-partner-b element after the registry reveals ran. No number change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task A2: Rule of 55 elected per partner

**Files:**
- Modify: `Planner_US.html` (markup ~539, `defaults` ~911, `FIELDS` ~1238, `normalizeState` ~1358, group state ~2436, `rule55Applies`/`accountStatuses`, `syncControls`)
- Modify tests: `tests/penalty_status.js`, `tests/roth_accounts.js`, `tests/traditional_penalty.js`, `tests/account_ledger.js`, `tests/pa_employer_plan.js`, `tests/penalty_aware_withdrawals.js`, `tests/sepp_per_account.js`, `tests/snapshot_scenarios.js`, `tests/legacy_state.js`
- Create: `tests/rule55_per_partner.js`; add it to `package.json` `test` after `tests/penalty_status.js`
- Docs: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `revealHidden` (A1).
- Produces: state keys `ruleOf55A`, `ruleOf55B` (bool, default false); `rule55Applies(working, retireAge, partner)` with `partner` 0 (A) or 1 (B). `ruleOf55Enabled` no longer exists.

- [ ] **Step 1: Write the failing test**

Create `tests/rule55_per_partner.js` (boilerplate from File Structure, then):

```js
// Rule of 55 per partner (PR 1): each partner's box covers that partner's 401(k)s only; an old save's
// household box ticks both; the box is enabled only for a retirement age from 55 to 59.
(async () => {
  const { browser, page, errors } = await openPlanner();
  const statuses = (patch, age, ageB) =>
    page.evaluate(({ patch, age, ageB }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return window.__test_accountStatuses({ age, ageB, isSurvivorPeriod: false, deceasedIsA: false, workingA: false, workingB: false, retireAgeA: st.retireAgeA, retireAgeB: st.retireAgeB });
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch, age, ageB });
  const couple = { singlePerson: false, retireAgeA: 56, retireAgeB: 56 };
  // Slots: [IRA A, 401(k) A, IRA B, 401(k) B].
  let s = await statuses({ ...couple, ruleOf55A: true, ruleOf55B: false }, 57, 57);
  assert.deepStrictEqual(s.map((x) => x.free), [false, true, false, false], 'A only: A 401(k) free');
  s = await statuses({ ...couple, ruleOf55A: false, ruleOf55B: true }, 57, 57);
  assert.deepStrictEqual(s.map((x) => x.free), [false, false, false, true], 'B only: B 401(k) free');
  s = await statuses({ ...couple, retireAgeA: 54, ruleOf55A: true, ruleOf55B: false }, 57, 57);
  assert.deepStrictEqual(s.map((x) => x.free), [false, false, false, false], 'retired at 54: no Rule of 55');

  // Migration: an old save with the household box loads with both partners ticked; the old key is gone.
  const migrated = await page.evaluate(() => window.__test_normalizeState({ ruleOf55Enabled: true }));
  assert.strictEqual(migrated.ruleOf55A, true);
  assert.strictEqual(migrated.ruleOf55B, true);
  assert.strictEqual('ruleOf55Enabled' in migrated, false);
  const off = await page.evaluate(() => window.__test_normalizeState({ ruleOf55Enabled: false }));
  assert.strictEqual(off.ruleOf55A, false);
  assert.strictEqual(off.ruleOf55B, false);

  // The checkbox is enabled only for a retirement age 55-59.
  const enabled = (retireAgeA) =>
    page.evaluate((r) => {
      Object.assign(window.__test_getState(), { retireAgeA: r, ageA: Math.min(r, 50) });
      window.__test_syncControls();
      return !document.getElementById('ruleOf55A').disabled;
    }, retireAgeA);
  assert.strictEqual(await enabled(54), false, 'retire 54: disabled');
  assert.strictEqual(await enabled(55), true, 'retire 55: enabled');
  assert.strictEqual(await enabled(59), true, 'retire 59: enabled');
  assert.strictEqual(await enabled(60), false, 'retire 60: disabled (no penalty to avoid)');
  assert.deepStrictEqual(errors, []);
  console.log('rule55_per_partner: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add hooks (~15079): `window.__test_accountStatuses = accountStatuses;` and `window.__test_normalizeState = normalizeState;` (skip either if it already exists under that name).

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/rule55_per_partner.js`
Expected: FAIL (A only: `[false, true, false, true]`, the household toggle covers both, or `ruleOf55A` undefined).

- [ ] **Step 3: Implement**

Markup: replace the single Rule of 55 field (~539) with:

```html
          <div class="field"><label for="ruleOf55A"><input id="ruleOf55A" type="checkbox"> Partner A Rule of <span class="info-nw">55<button type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="Waives the 10% early-withdrawal penalty on withdrawals from this partner&#x27;s 401(k) (traditional or Roth) from the year they retire through 59½, when they retire at 55 or later. It never covers an IRA. The planner assumes the 401(k) balance entered is the plan of the employer this partner left, not rolled into an IRA. Roth 401(k) earnings stay taxable.">i</button></span><small id="ruleOf55ANote">No 10% penalty on Partner A&#x27;s 401(k) withdrawals from 55 to 59½</small></label></div>
          <div class="field" data-partner-b><label for="ruleOf55B"><input id="ruleOf55B" type="checkbox"> Partner B Rule of <span class="info-nw">55<button type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="Waives the 10% early-withdrawal penalty on withdrawals from this partner&#x27;s 401(k) (traditional or Roth) from the year they retire through 59½, when they retire at 55 or later. It never covers an IRA. The planner assumes the 401(k) balance entered is the plan of the employer this partner left, not rolled into an IRA. Roth 401(k) earnings stay taxable.">i</button></span><small id="ruleOf55BNote">No 10% penalty on Partner B&#x27;s 401(k) withdrawals from 55 to 59½</small></label></div>
```

Under each 401(k) 72(t) checkbox field (A ~541, B ~545), add inside that `.field` div after the `</label>`:

```html
<small id="sepp72tK401ARule55Note" class="field-note" hidden>Rule of 55 already covers this 401(k): the 72(t) changes nothing here</small>
```

(and `sepp72tK401BRule55Note` for B). If `.field-note` does not exist in the stylesheet, use `style="display:block;color:var(--muted)"` inline instead; do not edit the shared stylesheet.

`defaults` (~911): replace `ruleOf55Enabled: false,` with `ruleOf55A: false,` and `ruleOf55B: false,`.

`FIELDS` (~1238): replace the `ruleOf55Enabled` entry with:

```js
    { key: 'ruleOf55A', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tK401ARule55Note', hidden: (s) => !(s.ruleOf55A && s.sepp72tK401A && s.retireAgeA >= 55 && s.retireAgeA < 60) }], mcp: true },
    { key: 'ruleOf55B', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tK401BRule55Note', hidden: (s) => !(s.ruleOf55B && s.sepp72tK401B && s.retireAgeB >= 55 && s.retireAgeB < 60) }], mcp: true },
```

`normalizeState`, just before `['sepp72tEnabled', ...]`:

```js
    // Rule of 55 was one household checkbox before it became a per-partner election: a ticked old box
    // ticks both partners (the engine already required each partner's own retirement age of 55 or more,
    // so the numbers do not move). Deleted because the spread above carries unknown keys through.
    if (raw && raw.ruleOf55Enabled === true && raw.ruleOf55A === undefined && raw.ruleOf55B === undefined) s.ruleOf55A = s.ruleOf55B = true;
    delete s.ruleOf55Enabled;
```

Engine:

```js
  function rule55Applies(working, retireAge, partner) {
    return !!(partner === 0 ? state.ruleOf55A : state.ruleOf55B) && !working && retireAge >= 55;
  }
```

and in `accountStatuses` change the call to `rule55Applies(own[1], own[2], partner)`. Update the comment above `rule55Applies` ("Needs that partner's checkbox").

Group state (~2436): replace both `state.ruleOf55Enabled` with `(state.ruleOf55A || state.ruleOf55B)`.

`syncControls`, after the partner-B loop:

```js
    // Rule of 55 needs retirement at 55 or later and does nothing from 60 (no penalty left to avoid).
    for (const p of ['A', 'B']) {
      const r = state['retireAge' + p],
        box = document.getElementById('ruleOf55' + p),
        note = document.getElementById('ruleOf55' + p + 'Note');
      box.disabled = r < 55 || r >= 60;
      note.textContent =
        r < 55 ? `Needs retirement at 55 or later (now ${r})` : r >= 60 ? 'No penalty to avoid: retires at 60 or later' : `No 10% penalty on Partner ${p}'s 401(k) withdrawals from 55 to 59½`;
    }
```

(`retireAgeA/B` carry `resync: true`, so this runs when the slider moves; confirm by moving the slider in the browser.)

Tests: replace every `ruleOf55Enabled: X` patch with `ruleOf55A: X, ruleOf55B: X` in `tests/roth_accounts.js`, `tests/traditional_penalty.js`, `tests/account_ledger.js`, `tests/pa_employer_plan.js`, `tests/penalty_aware_withdrawals.js`, `tests/sepp_per_account.js`, `tests/snapshot_scenarios.js` (keep each scenario's name, so its snapshot hash is unchanged); in `tests/penalty_status.js` replace `st.ruleOf55Enabled = V;` with `st.ruleOf55A = st.ruleOf55B = V;`. In `tests/legacy_state.js` `US` cases add `'legacy household rule of 55': { ruleOf55Enabled: true }` and `'legacy rule of 55 off': { ruleOf55Enabled: false }`.

Docs: README (Rule of 55 bullet: per partner, 401(k) only, enabled for retirement at 55-59); `CLAUDE.md` (the line naming `ruleOf55Enabled` in the US/Canada list now names `ruleOf55A`/`ruleOf55B`). Badge `V113` -> `V114`.

- [ ] **Step 4: Run tests**

Run: `node tests/rule55_per_partner.js` -> `rule55_per_partner: OK`
Run: `node test_rule55_sepp_fields.js` -> OK
Run: `node tests/legacy_state.js --update` (every case gains the two keys; review that only `ruleOf55A/B` changed and the two legacy cases map as expected), then `node tests/snapshot_ui.js --update` (new controls, MCP schema).
Run: `npm test` -> all pass; `tests/snapshot.js` must pass **without** an update (no number change).
Mobile: load at 390x844 and check `document.documentElement.scrollWidth > document.documentElement.clientWidth` is `false` (add the check to `test_rule55_sepp_fields.js` with `page.setViewportSize({ width: 390, height: 844 })`).

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html README.md CLAUDE.md package.json test_rule55_sepp_fields.js tests/
git commit -m "Rule of 55 elected per partner (US V114)

ruleOf55A/ruleOf55B replace the household ruleOf55Enabled; each covers that partner's 401(k)s, enabled only for a retirement age of 55-59. Old saves with the household box tick both (same numbers). legacy_state and UI baselines regenerated for the new keys; projection snapshots unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# PR 2: Batch 3C, the per-year solver

Before B1: record the baseline numbers once (kept for the batch notes in B7):
`node tests/historical_rates.js > ../3c-rates-before.txt` and `node tests/bench_runs.js > ../3c-bench-before.txt`, and create a worktree of the PR 1 tip for later comparisons: `git worktree add ../fp-3c-base HEAD`.

### Task B1: MAGI per return in two-return years (ACA per tax household, IRMAA per person)

**Files:**
- Modify: `Planner_US.html` (`irmaaLookbackMagi` area, `healthcareCost`, `conversionMagiCeiling`, the year loop)
- Create: `tests/two_return_magi.js`; add to `package.json` after `tests/aca_medicaid.js`
- Docs: `README.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `returnMagis(profile, trad, gain) -> [magiA, magiB]` (two-return split: each partner's `other` and Social Security, half the investment income, the discretionary traditional draw and conversion by `profile.ownerShareA`, half the gains; the two sum to the household MAGI). `irmaaLookbackSplit(magiHistoryA, magiHistoryB, twoReturnHistory, year) -> null | [a, b]`. `healthcareCost` takes extra args `twoReturns, magiA, magiB, magiHistoryA, magiHistoryB, twoReturnHistory`. `conversionMagiCeiling` takes extra args `twoReturns, preMagiA, preMagiB, shareA`. Row fields `magiA`, `magiB` (two-return years only).

- [ ] **Step 1: Write the failing test**

Create `tests/two_return_magi.js` (boilerplate + BASE, then):

```js
// 3C commit 1: two returns (an unmarried couple filing single, or before a marry-later wedding; Partner A
// head of household with a child): the ACA credit is per tax household, IRMAA per person on the single
// tiers. Hand-computed with inflation 0 (2026 figures, factor 1).
(async () => {
  const { browser, page, errors } = await openPlanner();
  const COUPLE = { ...BASE, singlePerson: false, filingStatus: 'single' };

  // 1. ACA: 40,000 of pension each. Per return: 40,000 against a one-person line, half the premium each.
  const aca = { ...COUPLE, acaEnabled: true, pensionYearlyA: 40000, pensionYearlyB: 40000 };
  const r1 = (await rows(page, aca))[0];
  const perReturn = await taxCall(page, aca, 'acaNetCost', [40000, 1, 6000, 0]);
  const household = await taxCall(page, aca, 'acaNetCost', [80000, 2, 12000, 0]);
  assert(Math.abs(2 * perReturn - household) > 500, 'test discriminates old from new');
  near(r1.healthcare, 2 * perReturn, 0.01, 'two returns: each partner priced on their own MAGI and line');
  near(r1.magiA, 40000, 1e-6, 'magiA');
  near(r1.magiB, 40000, 1e-6, 'magiB');

  // 2. Head of household: A's tax household includes the child (size 2), B's does not.
  const kid = { ...aca, children: [{ birthYear: 2015, student: false }] };
  const r2 = (await rows(page, kid))[0];
  const a2 = await taxCall(page, kid, 'acaNetCost', [40000, 2, 6000, 0]);
  near(r2.healthcare, a2 + perReturn, 0.01, 'HoH: the child counts on A only');

  // 3. IRMAA per person: 160,000 and 40,000 at 66; single tiers: 240.4 a month for A, nothing for B.
  const irm = { ...COUPLE, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, lifeExpectancyA: 71, lifeExpectancyB: 71, pensionYearlyA: 160000, pensionYearlyB: 40000 };
  const r3 = await rows(page, irm);
  for (const r of r3) near(r.healthcare, 240.4 * 12, 0.01, `IRMAA per person, year ${r.year}`);

  // 4. Joint returns are unchanged: household 200,000 on the joint tiers is under the first tier.
  const r4 = await rows(page, { ...irm, filingStatus: 'mfj' });
  for (const r of r4) near(r.healthcare, 0, 1e-9, `joint, year ${r.year}`);
  assert.strictEqual(r4[0].magiA, undefined, 'no per-return MAGI on a joint return');

  // 5. Marry-later: two returns at 66 and 67, joint from 68. Year 2 and 3 look back at a two-return year
  //    (per person, single tiers), year 4 at a joint year (household, joint tiers).
  const r5 = await rows(page, { ...irm, marryLater: true, marriageAgeA: 68 });
  near(r5[2].healthcare, 240.4 * 12, 0.01, 'wedding year looks back at a two-return year');
  near(r5[3].healthcare, 240.4 * 12, 0.01, 'year 3 looks back at a two-return year');
  near(r5[4].healthcare, 0, 1e-9, 'year 4 looks back at a joint year');

  // 6. Conversion ceiling per return: A owns all the traditional money, so the conversion lands on A's
  //    return and stops at A's own 400% line (62,600 - 20,000), not the household's (84,600 - 70,000).
  //    Spending 0 so the pensions cover the year and no discretionary draw moves A's MAGI.
  const conv = { ...aca, spending: 0, pensionYearlyA: 20000, pensionYearlyB: 50000, tradIraA: 500000, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 60, rothConvBracket: 35 };
  const r6 = (await rows(page, conv))[0];
  near(r6.traditionalWithdrawn, 0, 1e-9, 'precondition: no discretionary traditional draw');
  near(r6.conversionAmount, 42600, 0.01, 'conversion capped at A’s own ACA line');

  assert.deepStrictEqual(errors, []);
  console.log('two_return_magi: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/two_return_magi.js`
Expected: FAIL at case 1 (`healthcare` equals the household figure; `magiA` undefined).

- [ ] **Step 3: Implement**

Beside `irmaaLookbackMagi`:

```js
  // Two returns (an unmarried couple, or before a marry-later wedding): each partner's own MAGI. `trad` is
  // the year's discretionary traditional draw plus the conversion (split by the traditional-pool share, as
  // taxFor splits it), `gain` the realized gains (half each, as taxFor). The two sum to the household MAGI.
  function returnMagis(profile, trad, gain) {
    const s = profile.ownerShareA === undefined ? 0.5 : profile.ownerShareA,
      inv = ((profile.invOrd || 0) + (profile.invQual || 0)) / 2;
    return [profile.otherA + profile.ssA + inv + trad * s + gain / 2, profile.otherB + profile.ssB + inv + trad * (1 - s) + gain / 2];
  }
  // IRMAA for a year whose lookback year (two years earlier) had two returns: each person's own MAGI from
  // that year, against the single tiers. Null when the lookback year was one return (household rule).
  // The household's own entries for the first two years are split evenly (approximation).
  function irmaaLookbackSplit(magiHistoryA, magiHistoryB, twoReturnHistory, year) {
    const y = Math.max(0, year - 2);
    if (!twoReturnHistory[y]) return null;
    if (year < 2 && state.irmaaPriorKnown) {
      const v = Math.max(0, Number(year === 0 ? state.irmaaMagiPrior2 : state.irmaaMagiPrior1) || 0) / 2;
      return [v, v];
    }
    return [magiHistoryA[y] || 0, magiHistoryB[y] || 0];
  }
```

`healthcareCost`: add the six args to the destructuring (`twoReturns = false, magiA = 0, magiB = 0, magiHistoryA = null, magiHistoryB = null, twoReturnHistory = null`). In the ACA branch:

```js
      if (twoReturns) {
        // Two tax households: A's includes the children A claims; each partner's half of the premium is
        // priced on their own MAGI and poverty line.
        const kids = qualifyingChildCount(taxYearOf(year));
        healthcare =
          acaNetCost(magiA, 1 + kids, inflate(acaEligibleA ? state.healthcare / 2 : 0), year) +
          acaNetCost(magiB, 1, inflate(acaEligibleB ? state.healthcare / 2 : 0), year);
      } else {
        const householdSize = acaHouseholdSize(singlePerson, isSurvivorPeriod, year);
        const grossPremium = sharedCost(state.healthcare, acaEligibleA, acaEligibleB);
        healthcare = acaNetCost(magiProxy, householdSize, grossPremium, year);
      }
      usesMagiEstimate = true;
```

IRMAA lines:

```js
    const split = twoReturnHistory ? irmaaLookbackSplit(magiHistoryA, magiHistoryB, twoReturnHistory, year) : null;
    if (split) {
      if (medicareEligibleA) healthcare += irmaaSurcharge(split[0], 'single', year);
      if (medicareEligibleB) healthcare += irmaaSurcharge(split[1], 'single', year);
    } else {
      const lookbackMagi = irmaaLookbackMagi(magiHistory, year);
      if (medicareEligibleA) healthcare += irmaaSurcharge(lookbackMagi, filing, year);
      if (medicareEligibleB) healthcare += irmaaSurcharge(lookbackMagi, filing, year);
    }
```

Update the `acaEligibility` comment ("The household size and MAGI used for the subsidy stay the whole household's" -> "...the household's on a joint return; per partner with two returns (healthcareCost)").

`conversionMagiCeiling`: add `twoReturns = false, preMagiA = 0, preMagiB = 0, shareA = 0.5` to its args, and at the top:

```js
    if (twoReturns) {
      // Each return keeps under its own lines. A conversion lands on the returns by the traditional-pool
      // share, so return X allows (line - its MAGI) / its share of the household conversion.
      let room = Infinity;
      const kids = qualifyingChildCount(taxYearOf(year)),
        allow = (line, m, frac) => (frac > 0 ? Math.max(0, (line - m) / frac) : Infinity);
      if (state.acaEnabled && !state.acaEnhanced) {
        if (acaEligibleA) room = Math.min(room, allow(fplForHousehold(1 + kids, year) * 4, preMagiA, shareA));
        if (acaEligibleB) room = Math.min(room, allow(fplForHousehold(1, year) * 4, preMagiB, 1 - shareA));
      }
      if (!workingA && age >= 63) room = Math.min(room, allow(irmaaTierCeiling(preMagiA, 'single', year), preMagiA, shareA));
      if (!workingB && ageB >= 63) room = Math.min(room, allow(irmaaTierCeiling(preMagiB, 'single', year), preMagiB, 1 - shareA));
      return preConvMagi + room;
    }
```

(Two returns never occur in the survivor period or single-person mode, so the survivor guards of the household branch are not needed here.)

Year loop: next to `magiHistory = []` add `magiHistoryA = [], magiHistoryB = [], twoReturnHistory = [];`. After `buildTaxProfile`, add `const twoReturns = !profile.singlePerson && !filingRow(filing).joint;`. In the iteration body:

```js
        const preConvMagi = magiBase + estTrad + estGain;
        const [preMagiA, preMagiB] = twoReturns ? returnMagis(profile, estTrad, estGain) : [0, 0];
        const magiCeiling = conversionMagiCeiling({ ...existing args..., twoReturns, preMagiA, preMagiB, shareA: profile.ownerShareA });
```

After `magiHistory[year] = magiProxy;`:

```js
        twoReturnHistory[year] = twoReturns;
        let magiA = 0,
          magiB = 0;
        if (twoReturns) {
          [magiA, magiB] = returnMagis(profile, conversionAmount + estTrad, estGain);
          magiHistoryA[year] = magiA;
          magiHistoryB[year] = magiB;
        }
```

Add `twoReturns, magiA, magiB, magiHistoryA, magiHistoryB, twoReturnHistory` to `hcArgs`. Replace `costAtMagi` with:

```js
        // The cost at another (discretionary traditional + conversion, gains) pair: the forced pass prices
        // the realized one, and 3C's solver prices its candidates.
        const costAt = (trad, gain) => {
          hcArgs.magiProxy = magiBase + trad + gain;
          if (twoReturns) [hcArgs.magiA, hcArgs.magiB] = returnMagis(profile, trad, gain);
          const c = healthcareCost(hcArgs).healthcare;
          hcArgs.magiProxy = magiProxy;
          hcArgs.magiA = magiA;
          hcArgs.magiB = magiB;
          return c;
        };
```

and both `costAtMagi(magiBase + traditionalGross + taxableGainGross)` calls become `costAt(traditionalGross, taxableGainGross)`. After `magiHistory[year] = realizedMagi;`:

```js
        if (twoReturns) [magiHistoryA[year], magiHistoryB[year]] = returnMagis(profile, traditionalGross, taxableGainGross);
```

and after `rows.push(row)` is built (before the push): `if (twoReturns) { row.magiA = magiHistoryA[year]; row.magiB = magiHistoryB[year]; }`.

Docs: `CLAUDE.md` (MAGI iteration paragraph: per-return MAGI history; `healthcareCost`/`conversionMagiCeiling` per return with two returns; the first-two-years split), README (two-return couples priced on each return). Badge `V114` -> `V115`.

- [ ] **Step 4: Run tests and measure**

Run: `node tests/two_return_magi.js` -> `two_return_magi: OK`
Run: `npm test`. Expected: `tests/snapshot.js` fails only for scenarios with two returns and ACA or IRMAA (filingStatus single couples, marry-later before the wedding). List them: `node tests/snapshot.js --root ../fp-3c-base --dump A --update-nothing`, `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`. Any joint, single-person or survivor scenario that moved is a bug: stop and fix.
Before/after table for the commit: one moved scenario's first ACA year and first IRMAA year (healthcare, MAGI), plus `node tests/historical_rates.js` (expect no change: its scenarios are joint).
Then `npm run snapshot:update` and `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html README.md CLAUDE.md package.json tests/two_return_magi.js tests/snapshots/
git commit -m "3C: ACA per tax household and IRMAA per person in two-return years (US V115)

<before/after table; moved scenarios: the filingStatus-single couples and marry-later years with ACA or IRMAA>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B2: Solver hooks: thresholds, lambda estimate, after-tax value (no number change)

**Files:**
- Modify: `Planner_US.html` (new section "Per-year solver (3C)" just above `newWithdrawal`; `window.__test_solver` near the other hooks)
- Create: `tests/solver_hooks.js`; add to `package.json` after `tests/two_return_magi.js`

**Interfaces:**
- Consumes: `returnMagis` (B1).
- Produces:
  - `magiThresholds(c) -> Array<{ magi: number, label: string }>` sorted ascending, deduped within $1. `c = { year, filing, twoReturns, profile, preMagi, preMagiA, preMagiB, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA, workingB, age, ageB }`.
  - `lambdaEstimate(c) -> { lambda: number, tauGain: number }`. `c = { tradPool, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor }`.
  - `afterTaxValue(bal, lambda, tauGain) -> number`.
  - Constants `SOLVER_LAMBDA_MULT = 1`, `REACH_GROSS_UP = 2`, `LAMBDA_MAX = 0.6`, `TAU_GAIN_MAX = 0.5`.
  - `window.__test_solver = { magiThresholds, lambdaEstimate, afterTaxValue, returnMagis }` (later tasks add to it).

- [ ] **Step 1: Write the failing test**

Create `tests/solver_hooks.js` (boilerplate, then):

```js
// 3C hooks, hand-computed (2026 figures, inflation 0).
(async () => {
  const { browser, page, errors } = await openPlanner();
  const call = (patch, fn, arg) =>
    page.evaluate(({ patch, fn, arg }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, { inflation: 0, children: [], acaEnhanced: false, ...patch });
      try {
        return window.__test_solver[fn](arg);
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch, fn, arg });
  const ctx = (o) => ({ year: 0, filing: 'single', twoReturns: false, profile: { ownerShareA: 1 }, preMagi: 0, preMagiA: 0, preMagiB: 0, acaEligibleA: true, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false, workingA: false, workingB: false, age: 60, ageB: null, ...o });
  const magis = (list) => list.map((t) => Math.round(t.magi * 100) / 100);

  // ACA, one person: Texas (no Medicaid for adults) has the 100% floor and the 400% cliff; California adds 138%.
  assert.deepStrictEqual(magis(await call({ acaEnabled: true, stateTax: 'tx' }, 'magiThresholds', ctx({}))), [15650, 62600]);
  assert.deepStrictEqual(magis(await call({ acaEnabled: true, stateTax: 'ca' }, 'magiThresholds', ctx({}))), [15650, 21597, 62600]);
  // IRMAA from 63 (retired), single tiers; senior-deduction phase-out start at 65 through 2028.
  assert.deepStrictEqual(magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 63, acaEligibleA: false }))), [109000, 137000, 171000, 205000, 500000]);
  assert.deepStrictEqual(magis(await call({ acaEnabled: false }, 'magiThresholds', ctx({ age: 66, acaEligibleA: false }))), [75000, 109000, 137000, 171000, 205000, 500000]);
  // Child tax credit phase-out start (joint).
  assert.deepStrictEqual(
    magis(await call({ acaEnabled: false, children: [{ birthYear: 2016, student: false }] }, 'magiThresholds', ctx({ filing: 'mfj', singlePerson: false, ageB: 50, age: 50, acaEligibleA: false }))),
    [400000],
  );
  // Two returns: A's 400% line (62,600) at A-MAGI 40,000, half the traditional draw on A: household 100,000 + 22,600 / 0.5.
  const two = await call({ acaEnabled: true, stateTax: 'tx' }, 'magiThresholds', ctx({ twoReturns: true, singlePerson: false, ageB: 60, preMagi: 100000, preMagiA: 40000, preMagiB: 60000, profile: { ownerShareA: 0.5 } }));
  assert(magis(two).includes(145200), `two-return translation: ${JSON.stringify(magis(two))}`);

  // lambda: single, 70, 1,000,000 traditional, real return 0, Texas, life expectancy 74. Samples 73, 74, 74.
  // RMDs 37,735.85 and 39,215.69; deduction 16,100 + 2,050 + 6,000 senior: taxable income stays in the 12% band
  // with and without the step; gains stay in the 0% band.
  const lam = await call(
    { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false },
    'lambdaEstimate',
    { tradPool: 1000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1 },
  );
  near(lam.lambda, 0.12, 1e-9, 'lambda at 12%');
  near(lam.tauGain, 0, 1e-9, 'gains in the 0% band');
  const big = await call(
    { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false },
    'lambdaEstimate',
    { tradPool: 5000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1 },
  );
  assert(big.lambda > lam.lambda && big.lambda <= 0.6, `larger pool, larger lambda (${big.lambda})`);

  // After-tax value: taxable 100k with 40k gain at 15%, traditional 200k at lambda 0.2, Roth 50k, cash 10k.
  const value = await page.evaluate(() =>
    window.__test_solver.afterTaxValue({ taxable: 100000, taxableBasis: 60000, bondTaxable: 0, bondTaxableBasis: 0, traditional: 200000, bondTraditional: 0, roth: 50000, bondRoth: 0, cash: 10000, home: 0, mortgage: 0 }, 0.2, 0.15),
  );
  near(value, 100000 - 40000 * 0.15 + 200000 * 0.8 + 50000 + 10000, 1e-9, 'after-tax value');
  assert.deepStrictEqual(errors, []);
  console.log('solver_hooks: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/solver_hooks.js`
Expected: FAIL with `Cannot read properties of undefined (reading 'magiThresholds')`.

- [ ] **Step 3: Implement**

New section above `newWithdrawal`:

```js
  // ---- Per-year solver (Batch 3C) ----------------------------------------------------------------------
  // Each year with a withdrawal, the solver may test a few candidates (a MAGI target just under a line or
  // just over a floor, the stock-account order, whose accounts fund the draw) by dry-running the year's
  // real withdrawal, and keeps the one that leaves the most after-tax wealth, with traditional dollars
  // worth (1 - lambda). See docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md.
  const SOLVER_LAMBDA_MULT = 1,
    REACH_GROSS_UP = 2,
    LAMBDA_MAX = 0.6,
    TAU_GAIN_MAX = 0.5;

  // The year's federal MAGI lines, in household MAGI: the ACA floor (100%), the Medicaid line and the 400%
  // cliff for partners on the individual market; the IRMAA tier edges from 63 (retired); the senior-
  // deduction phase-out start (65+, through 2028); the child-tax-credit phase-out start. With two returns
  // each return's line is translated into household MAGI through that return's share of the traditional
  // draw (the solver prices candidates with the real functions, so the translation only places them).
  // State-law cliffs are priced by taxFor but are not candidates (documented gap).
  function magiThresholds(c) {
    const out = [],
      y = c.year,
      taxYear = taxYearOf(y),
      add = (magi, label) => {
        if (Number.isFinite(magi) && magi > 0) out.push({ magi, label });
      },
      toHousehold = (line, m, frac) => (frac > 0 ? c.preMagi + (line - m) / frac : NaN),
      shareA = c.profile.ownerShareA === undefined ? 0.5 : c.profile.ownerShareA,
      acaLines = (fpl, put) => {
        const mcd = medicaidLimit(state.stateTax);
        if (mcd > 0) put(fpl * mcd, 'Medicaid line');
        put(fpl * MEDICAID_RULES.ptcFloor, 'ACA credit floor (100%)');
        if (!state.acaEnhanced) put(fpl * 4, 'ACA 400% line');
      },
      kids = qualifyingChildCount(taxYear);
    if (state.acaEnabled && (c.acaEligibleA || c.acaEligibleB)) {
      if (c.twoReturns) {
        if (c.acaEligibleA) acaLines(fplForHousehold(1 + kids, y), (line, label) => add(toHousehold(line, c.preMagiA, shareA), label));
        if (c.acaEligibleB) acaLines(fplForHousehold(1, y), (line, label) => add(toHousehold(line, c.preMagiB, 1 - shareA), label));
      } else acaLines(fplForHousehold(acaHouseholdSize(c.singlePerson, c.isSurvivorPeriod, y), y), add);
    }
    const irmaaA = !c.workingA && c.age >= 63 && !(c.isSurvivorPeriod && c.deceasedIsA),
      irmaaB = !c.singlePerson && !c.workingB && c.ageB >= 63 && !(c.isSurvivorPeriod && c.deceasedIsB);
    if (irmaaA || irmaaB) {
      if (c.twoReturns) {
        for (const [cap] of irmaaTiers('single', y)) {
          if (irmaaA && cap < Infinity) add(toHousehold(cap, c.preMagiA, shareA), 'IRMAA tier');
          if (irmaaB && cap < Infinity) add(toHousehold(cap, c.preMagiB, 1 - shareA), 'IRMAA tier');
        }
      } else for (const [cap] of irmaaTiers(c.filing, y)) if (cap < Infinity) add(cap, 'IRMAA tier');
    }
    if (taxYear <= SENIOR_DEDUCTION_LAST_YEAR && (c.age >= 65 || (!c.singlePerson && c.ageB >= 65)))
      add(SENIOR_PHASE_START[filingKey(c.twoReturns ? 'single' : c.filing, 'senior')], 'senior deduction phase-out');
    if (dependentsInYear(taxYear).some((d) => d.age <= CTC_MAX_AGE))
      add(CTC_PHASE_START[filingKey(c.twoReturns ? 'single' : c.filing, 'ctc')], 'child tax credit phase-out');
    out.sort((a, b) => a.magi - b.magi);
    const deduped = [];
    for (const t of out) if (!deduped.length || t.magi - deduped[deduped.length - 1].magi > 1) deduped.push(t);
    return deduped;
  }

  // The future tax on one traditional dollar (lambda) and on one dollar of long-term gain (tauGain), read
  // from three synthetic future years: Partner A's first RMD year, a midpoint, and a survivor year (the year
  // after the first death: the survivor-modeling death year, else the earlier life expectancy) or the plan's
  // last year. Each grows today's traditional pool at the plan's real return (no further draws: an
  // overestimate while the household is drawing traditional now), takes that year's RMD on the owner's age,
  // adds Social Security and pensions in this year's dollars, and measures the marginal federal + state tax
  // plus IRMAA over a step of 10% of the RMD (at least $1,000), under this year's tax law and indexing.
  const LAMBDA_PROFILE = { filing: 'single', otherA: 0, otherB: 0, extraIncome: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 0, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: NO_DEPENDENTS };
  function lambdaEstimate({ tradPool, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor }) {
    const real = (1 + pct(state.returnRate)) / (1 + pct(state.inflation)) - 1,
      endYear = singlePerson ? state.lifeExpectancyA - state.ageA : Math.max(state.lifeExpectancyA - state.ageA, state.lifeExpectancyB - state.ageB);
    let firstDeath = Infinity,
      aDiesFirst = false;
    if (!singlePerson && !isSurvivorPeriod) {
      if (deathYear < Infinity) {
        firstDeath = deathYear;
        aDiesFirst = deceasedIsA;
      } else {
        const dA = state.lifeExpectancyA - state.ageA,
          dB = state.lifeExpectancyB - state.ageB;
        if (dA !== dB) {
          firstDeath = Math.min(dA, dB);
          aDiesFirst = dA < dB;
        }
      }
    }
    const y1 = Math.max(year, rmdStartAge(state.ageA) - state.ageA),
      y3 = Math.max(year, firstDeath < endYear ? firstDeath + 1 : endYear);
    const samples = y1 > y3 ? [y3, y3, y3] : [y1, Math.round((y1 + y3) / 2), y3];
    const P = LAMBDA_PROFILE,
      ssOf = (p, a) => (a >= state['ssStartAge' + p] ? state['ssMonthly' + p] * 12 : 0) * factor,
      pensionOf = (p, a) =>
        (state.pensionCoverage === 'both' || state.pensionCoverage === p.toLowerCase() || (p === 'A' && singlePerson)) && a >= state['pensionStartAge' + p] ? state['pensionYearly' + p] * factor : 0;
    let rateSum = 0,
      tauSum = 0;
    for (const ys of samples) {
      const ageAs = state.ageA + ys,
        ageBs = state.ageB + ys,
        survivorIsB = isSurvivorPeriod ? deceasedIsA : ys > firstDeath && aDiesFirst,
        onePerson = singlePerson || isSurvivorPeriod || ys > firstDeath;
      const trad = tradPool * Math.pow(1 + real, Math.max(0, ys - year));
      let ownerAge, startAge;
      if (onePerson && survivorIsB) {
        ownerAge = ageBs;
        startAge = rmdStartAge(state.ageB);
        P.ssA = Math.max(ssOf('A', ageAs), ssOf('B', ageBs));
        P.pensionA = pensionOf('B', ageBs);
        P.ageA = ageBs;
      } else {
        ownerAge = ageAs;
        startAge = rmdStartAge(state.ageA);
        P.ssA = onePerson && !singlePerson ? Math.max(ssOf('A', ageAs), ssOf('B', ageBs)) : ssOf('A', ageAs);
        P.pensionA = pensionOf('A', ageAs);
        P.ageA = ageAs;
      }
      if (onePerson) {
        P.singlePerson = true;
        P.filing = 'single';
        P.ssB = 0;
        P.pensionB = 0;
        P.ageB = null;
        P.ownerShareA = 1;
      } else {
        P.singlePerson = false;
        P.filing = (state.marryLater ? ageAs >= state.marriageAgeA : state.filingStatus === 'mfj') ? 'mfj' : 'single';
        P.ssB = ssOf('B', ageBs);
        P.pensionB = pensionOf('B', ageBs);
        P.ageB = ageBs;
        P.ownerShareA = 0.5;
      }
      P.otherA = P.pensionA;
      P.otherB = P.pensionB;
      P.year = year;
      const rmd = ownerAge >= startAge ? trad / rmdDivisor(ownerAge) : 0,
        step = Math.max(1000, 0.1 * rmd),
        t0 = taxFor(P, 0, rmd),
        t1 = taxFor(P, 0, rmd + step),
        g1 = taxFor(P, step, rmd);
      const magi = P.otherA + P.otherB + P.ssA + P.ssB + rmd,
        onMedicare = (P.ageA >= 65 ? 1 : 0) + (!onePerson && P.ageB >= 65 ? 1 : 0),
        irmaaStep = onMedicare * (irmaaSurcharge(magi + step, P.filing, year) - irmaaSurcharge(magi, P.filing, year));
      rateSum += (t1 - t0 + irmaaStep) / step;
      tauSum += (g1 - t0) / step;
    }
    return {
      lambda: Math.min(LAMBDA_MAX, Math.max(0, (SOLVER_LAMBDA_MULT * rateSum) / 3)),
      tauGain: Math.min(TAU_GAIN_MAX, Math.max(0, tauSum / 3)),
    };
  }

  // What the balances are worth after the taxes still owed on them: traditional at (1 - lambda), embedded
  // taxable gains at tauGain, Roth, cash, bond principal and home equity at face value.
  function afterTaxValue(bal, lambda, tauGain) {
    const gain = Math.max(0, bal.taxable - bal.taxableBasis) + Math.max(0, bal.bondTaxable - bal.bondTaxableBasis);
    return bal.taxable + bal.bondTaxable - gain * tauGain + (bal.traditional + bal.bondTraditional) * (1 - lambda) + bal.roth + bal.bondRoth + bal.cash + bal.home;
  }
```

If `CTC_MAX_AGE`, `CTC_PHASE_START`, `SENIOR_DEDUCTION_LAST_YEAR` or `irmaaTiers` are declared below this section, move the section below `childCredits` instead (all are module-level `const`s, so any placement after their declaration line works; check with the page loading without a `ReferenceError`).

Hooks: `window.__test_solver = { magiThresholds, lambdaEstimate, afterTaxValue, returnMagis };`

- [ ] **Step 4: Run tests**

Run: `node tests/solver_hooks.js` -> `solver_hooks: OK`. If the lambda literal fails, print the three samples' `(rmd, t0, t1)` from a scratch script and compare with the hand computation in the test comment before changing anything.
Run: `npm test` -> green with **no** snapshot change (nothing calls the hooks yet).

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html package.json tests/solver_hooks.js
git commit -m "3C: solver hooks (MAGI lines, lambda estimate, after-tax value), no number change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B3: Withdrawal primitives: MAGI cap, release, fill, clone (no number change)

**Files:**
- Modify: `Planner_US.html` (`newWithdrawal`, `takeTraditional`, `tradGroup`, `withdrawStandard`, `BUCKET_STEP.penalized` and `.home`, `drawMixedStockAccounts` live branch, year loop's withdrawal call)
- Create: `tests/solver_primitives.js`; add to `package.json` after `tests/solver_hooks.js`

**Interfaces:**
- Produces: `wd.magiCap` (`null` | `{ limit: number, off: boolean }`, where `limit` = target MAGI - `magiBase`; room left = `limit - wd.traditionalGross - wd.taxableGainGross`), `wd.onlyPartner` (-1 | 0 | 1), `wd.taxAwareOrder` (`null` | `'taxable'` | `'traditional'`), `magiCapLeft(wd) -> number`, `releaseMagiCap(wd, solver)`, `fillTraditional(wd, gross) -> grossDrawn`, `freeTraditional(wd) -> dollars`, `cloneWithdrawal(wd) -> wd`. In the year loop: `runWithdraw(w)` (the strategy call for this pass).

- [ ] **Step 1: Write the failing test**

Create `tests/solver_primitives.js` (boilerplate, then):

```js
// 3C primitives on a hand-built withdrawal: single, 60, Texas, no other income (2026: deduction 16,100).
(async () => {
  const { browser, page, errors } = await openPlanner();
  const out = await page.evaluate(() => {
    const st = window.__test_getState();
    Object.assign(st, { stateTax: 'tx', inflation: 0, singlePerson: true });
    const S = window.__test_solver;
    const profile = { filing: 'single', otherA: 0, otherB: 0, extraIncome: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [] };
    const r = {};
    // Cap: 50,000 asked, MAGI room 20,000: exactly 20,000 gross; tax on it 10% of (20,000 - 16,100) = 390.
    let wd = S.newTestWithdrawal({ traditional: 500000, cash: 0 }, profile);
    wd.magiCap = { limit: 20000, off: false };
    r.capNet = S.takeTraditional(wd, 'traditional', 50000);
    r.capGross = wd.traditionalGross;
    r.capLeft = S.magiCapLeft(wd);
    // Release: the rest comes out uncapped.
    wd.need = 50000 - r.capNet;
    S.releaseMagiCap(wd, S.solveTraditionalForNet);
    r.releaseNeed = wd.need;
    r.releaseGross = wd.traditionalGross;
    // Fill: 10,000 more gross, under the deduction: all of it lands in cash.
    wd = S.newTestWithdrawal({ traditional: 500000, cash: 1000 }, profile);
    r.fillGross = S.fillTraditional(wd, 10000);
    r.fillCash = wd.bal.cash;
    r.fillTrad = wd.bal.traditional;
    // Clone independence.
    wd = S.newTestWithdrawal({ traditional: 500000 }, profile);
    const c = S.cloneWithdrawal(wd);
    S.takeTraditional(c, 'traditional', 10000);
    r.origTrad = wd.bal.traditional;
    r.origShares = wd.accts.trad.slice();
    r.cloneTrad = c.bal.traditional;
    // onlyPartner: B's slots only; A owns everything here, so nothing is drawn.
    wd = S.newTestWithdrawal({ traditional: 500000 }, profile);
    wd.onlyPartner = 1;
    r.onlyB = S.takeTraditional(wd, 'traditional', 10000);
    return r;
  });
  near(out.capGross, 20000, 1e-6, 'cap: gross stops at the room');
  near(out.capNet, 19610, 0.01, 'cap: net after 390 tax');
  near(out.capLeft, 0, 1e-6, 'cap: no room left');
  assert(out.releaseNeed <= 0.01, `release covers the rest (need ${out.releaseNeed})`);
  assert(out.releaseGross > 20000, 'release draws above the cap');
  near(out.fillGross, 10000, 1e-6, 'fill: gross');
  near(out.fillCash, 11000, 1e-6, 'fill: proceeds in cash, no tax under the deduction');
  near(out.fillTrad, 490000, 1e-6, 'fill: traditional reduced');
  near(out.origTrad, 500000, 1e-9, 'clone: original balance untouched');
  assert.deepStrictEqual(out.origShares, [1, 0, 0, 0], 'clone: original ledger untouched');
  assert(out.cloneTrad < 500000, 'clone drew');
  near(out.onlyB, 0, 1e-9, 'onlyPartner B: A’s accounts are not drawn');
  assert.deepStrictEqual(errors, []);
  console.log('solver_primitives: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/solver_primitives.js`
Expected: FAIL with `S.newTestWithdrawal is not a function`.

- [ ] **Step 3: Implement**

`newWithdrawal` return object: add `magiCap: null, onlyPartner: -1, taxAwareOrder: null,`.

`tradGroup`:

```js
  function tradGroup(wd, penalized) {
    const slots = [0, 1, 2, 3].filter(
      (i) => !wd.seppActive[i] && wd.status[i].free === !penalized && (wd.onlyPartner < 0 || (i < 2 ? 0 : 1) === wd.onlyPartner),
    );
    return { slots, share: slots.reduce((sum, i) => sum + wd.accts.trad[i], 0) };
  }
```

(`hasPenalizedMoney` reads `tradGroup`; it runs before `onlyPartner` is ever set, so its answer is unchanged.)

In the solver section add:

```js
  // MAGI room left under this year's target for MAGI-bearing draws (the conversion and any ladder gain
  // are already inside traditionalGross / taxableGainGross when the withdrawal starts).
  function magiCapLeft(wd) {
    const c = wd.magiCap;
    return !c || c.off ? Infinity : Math.max(0, c.limit - wd.traditionalGross - wd.taxableGainGross);
  }
  // Lifts the cap and takes any remaining need from penalty-free traditional money (stocks, then the bond
  // bucket): runs before penalized money and before home equity, so a target never strands money.
  function releaseMagiCap(wd, solver) {
    if (!wd.magiCap || wd.magiCap.off) return;
    wd.magiCap.off = true;
    if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
    if (wd.need > 0 && wd.bal.bondTraditional > 0)
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
  }
  // Penalty-free traditional dollars available to a discretionary draw this year.
  function freeTraditional(wd) {
    return tradGroup(wd, false).share * (wd.bal.traditional + wd.bal.bondTraditional);
  }
  // "Fill to the line": `gross` more from penalty-free traditional money (stocks, then bonds), the after-tax
  // proceeds kept as cash. Returns the gross drawn.
  function fillTraditional(wd, gross) {
    const { bal } = wd;
    let left = gross;
    for (const bucket of ['traditional', 'bondTraditional']) {
      if (!(left > 0)) break;
      const { slots, share } = tradGroup(wd, false),
        from = Math.min(left, bal[bucket] * share);
      if (!(from > 0)) continue;
      const before = taxFor(wd.profile, wd.taxableGainGross, wd.traditionalGross);
      accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, from);
      bal[bucket] -= from;
      wd.traditionalGross += from;
      wd.traditionalWithdrawn += from;
      bal.cash += from - (taxFor(wd.profile, wd.taxableGainGross, wd.traditionalGross) - before);
      left -= from;
    }
    return gross - left;
  }
  // A withdrawal on copies of the balances and ledgers, for a dry run.
  function cloneWithdrawal(wd) {
    return { ...wd, bal: { ...wd.bal }, rothAccts: rothAccountsClone(wd.rothAccts), accts: accountsClone(wd.accts), magiCap: wd.magiCap ? { ...wd.magiCap } : null };
  }
```

`takeTraditional`: after `cap = bal[bucket] * share;` (make `cap` a `let`):

```js
    if (!penalized && wd.magiCap) cap = Math.min(cap, magiCapLeft(wd));
```

`withdrawStandard`: in the penalty-aware branch, insert `releaseMagiCap(wd, solveTraditionalForNet);` immediately before `takePenalized(wd, solveTraditionalForNet);`; in the other branch, after the `bondRoth` line, insert `releaseMagiCap(wd, solveTraditionalForNet);`. (Home equity stays last.)

`BUCKET_STEP` (not a shared region; check the markers): 

```js
    home: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      if (wd.need > 0) wd.need -= takeHomeEquity(wd, wd.need);
    },
    penalized: (wd) => {
      releaseMagiCap(wd, solveTraditionalForNetFromNeed);
      if (wd.need > 0) takePenalized(wd, solveTraditionalForNetFromNeed);
    },
```

`drawMixedStockAccounts`, live branch: pass `wd.magiCap ? Math.min(freeTrad, magiCapLeft(wd)) : freeTrad` as the traditional balance argument of `pickLiveWithdrawalOrder` (the live mix is replaced in B5; until then it respects the cap at its start).

Year loop: replace the strategy call (the `if (mode.bucketStrategy) ... else withdrawStandard(...)` pair) with:

```js
          const wopts = mode.bucketStrategy
            ? { yearReturn: stockReturn, bondTarget, refillCap: expenses - lumpExpense, age, remainingMagiRoom: incomeRoom(magiSafeRoom, conversionAmount) }
            : { age, remainingMagiRoom: incomeRoom(magiSafeRoom, conversionAmount) };
          const runWithdraw = (w) => {
            if (mode.bucketStrategy) (w.penaltyAware ? withdrawBucketPenaltyAware : withdrawBucket)(w, wopts);
            else withdrawStandard(w, wopts);
          };
          runWithdraw(wd);
```

Hooks: extend `window.__test_solver` with `takeTraditional, releaseMagiCap, fillTraditional, cloneWithdrawal, magiCapLeft, solveTraditionalForNet, newTestWithdrawal` where

```js
    newTestWithdrawal: (balPatch, profile) =>
      newWithdrawal({
        bal: { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 0, roth: 0, cash: 0, home: 0, mortgage: 0, ...balPatch },
        rothAccts: rothAccountsNew(),
        accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
        seppActive: [false, false, false, false],
        profile,
        conversionAmount: 0,
        rmd: 0,
      }),
```

- [ ] **Step 4: Run tests**

Run: `node tests/solver_primitives.js` -> `solver_primitives: OK`
Run: `npm test` -> green, snapshots **unchanged** (no caller sets `magiCap`/`onlyPartner`). Run `npm run check:shared` -> green.
Run: `node tests/bench_runs.js --root ../fp-3c-base` and `node tests/bench_runs.js` -> within +5% (the cap check is one comparison).

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html package.json tests/solver_primitives.js
git commit -m "3C: withdrawal primitives (MAGI cap, release before penalized money and home equity, fill, clone), no number change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B4: Cliff guard in every mode (`cliffGuardEnabled`, on by default)

**Files:**
- Modify: `Planner_US.html` (solver section: `chooseYearPlan`, `NO_PLAN`; year loop; markup near `withdrawalMixEnabled` ~533; `defaults`; `FIELDS`)
- Create: `tests/cliff_guard.js`; add to `package.json` after `tests/solver_primitives.js`
- Modify tests that pin hand-computed numbers unrelated to the guard (see step 4)
- Docs: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: B2 hooks, B3 primitives, `costAt` (B1), `runWithdraw` (B3).
- Produces: `chooseYearPlan(c) -> { kind: 'none'|'under'|'fill', magi, label, order, split, score }` with `c = { wd, need, magiBase, profile, runWithdraw, thresholds, guard, orders, splits, lambdaOf, premiumAt, irmaaAt, hcCharged, trace }`; `NO_PLAN`; state key `cliffGuardEnabled` (bool, default true, `trueUnlessFalse`); row fields `cliffChoice`, `lambda` (only when set). `orders` is `[null]` and `splits` `[-1]` in this task (B5 and B6 widen them).

- [ ] **Step 1: Write the failing test**

Create `tests/cliff_guard.js` (boilerplate + BASE, then):

```js
// 3C cliff guard: stay under a line when the credit saved outweighs the extra value spent; cross when it
// does not; fill to a floor when that removes a premium. Each case finds its spending by scanning, so it does
// not depend on housing defaults.
(async () => {
  const { browser, page, errors } = await openPlanner();
  const G = { ...BASE, ruleOf55A: false, ruleOf55B: false, acaEnabled: true, trad401kA: 600000, rothIraA: 300000, rothIraBasisA: 300000, cash: 0, lifeExpectancyA: 62 };
  const first = async (patch) => (await rows(page, patch))[0];
  async function findSpending(patch, lo, hi, pred) {
    for (let s = 0; s <= 200000; s += 500) {
      const r = await first({ ...patch, spending: s, cliffGuardEnabled: false });
      if (r.magiProxy > lo && r.magiProxy < hi && (!pred || pred(r))) return s;
    }
    throw new Error(`no spending lands MAGI in (${lo}, ${hi})`);
  }

  // 1. Just over the 400% line (62,600): staying under saves most of a 12,000 premium for a small Roth draw.
  const s1 = await findSpending(G, 62600, 64000);
  const off1 = await first({ ...G, spending: s1, cliffGuardEnabled: false });
  const on1 = await first({ ...G, spending: s1, cliffGuardEnabled: true });
  near(off1.healthcare, 12000, 0.01, 'guard off: over the cliff, full premium');
  assert(on1.magiProxy <= 62600, `guard on stays under (${on1.magiProxy})`);
  assert(on1.healthcare < 12000 - 3000, 'guard on keeps the credit');
  assert(/^stayed under ACA 400% line/.test(on1.cliffChoice), `cliffChoice ${on1.cliffChoice}`);
  assert(on1.rothWithdrawn > off1.rothWithdrawn, 'the shortfall came from Roth');
  // This pair is also the mutation check for the MAGI room: removing the cap (guard off) changes the result.

  // 2. Far over the line (about 150,000) with a high lambda: staying under would replace about 87,000 of
  //    traditional (worth 1 - lambda) with Roth (worth 1) to save a credit of about 5,800. That loses when
  //    lambda exceeds this year's marginal rate (24%) by more than 5,800 / 87,000, so crossing wins.
  //    (With lambda 0, as in case 1, staying under always wins: the Roth draw also saves this year's tax.)
  const H = { ...G, trad401kA: 8000000, lifeExpectancyA: 90 };
  const s2 = await findSpending(H, 140000, 160000);
  const on2 = await first({ ...H, spending: s2, cliffGuardEnabled: true });
  assert(on2.lambda > 0.33, `precondition: lambda well above 24% (${on2.lambda})`);
  assert(on2.magiProxy > 62600, 'crossing wins far over the line');
  assert.strictEqual(on2.cliffChoice, undefined);

  // 3. Fill to the Medicaid line: California, Medicaid declined, MAGI under 138% pays the full premium;
  //    just over it pays about 3.1% of income.
  const F = { ...G, stateTax: 'ca', medicaidWhenEligible: false, pensionYearlyA: 8000 };
  const s3 = await findSpending(F, 15650, 21597);
  const on3 = await first({ ...F, spending: s3, cliffGuardEnabled: true });
  assert(/^filled to Medicaid line/.test(on3.cliffChoice), `cliffChoice ${on3.cliffChoice}`);
  assert(on3.magiProxy > 21597, 'MAGI just over the line');
  const expect3 = await taxCall(page, F, 'acaNetCost', [on3.magiProxy, 1, 12000, 0]);
  near(on3.healthcare, expect3, 0.5, 'premium priced at the realized MAGI');

  // 4. Nothing in reach (no ACA, age 50, no children): identical rows with the guard on and off, no lambda.
  const N = { ...G, acaEnabled: false, ageA: 50, retireAgeA: 50, lifeExpectancyA: 54, spending: 50000 };
  const a = await rows(page, { ...N, cliffGuardEnabled: false }),
    b = await rows(page, { ...N, cliffGuardEnabled: true });
  assert.deepStrictEqual(b, a, 'skip path is identical');
  assert(b.every((r) => r.lambda === undefined), 'no lambda computed on the skip path');

  // 5. No penalty-free traditional money (50, IRA only, no Rule of 55): never a fill.
  const P = { ...G, ageA: 50, retireAgeA: 50, lifeExpectancyA: 58, trad401kA: 0, tradIraA: 600000, stateTax: 'ca', medicaidWhenEligible: false, pensionYearlyA: 8000 };
  const pr = await rows(page, { ...P, spending: 5000, cliffGuardEnabled: true });
  assert(pr.filter((r) => r.age < 60).every((r) => !/^filled/.test(r.cliffChoice || '')), 'no fill from penalized money');

  // 6. Survivor transition: A-dies equals B-dies with the guard on (identical partners).
  const SV = { ...G, singlePerson: false, ageB: 60, retireAgeB: 60, lifeExpectancyA: 70, lifeExpectancyB: 70, trad401kB: 600000, survivorEnabled: true, survivorDeathAge: 63, spending: 70000, cliffGuardEnabled: true };
  const dA = await rows(page, { ...SV, survivorPartner: 'A' }),
    dB = await rows(page, { ...SV, survivorPartner: 'B' });
  for (let i = 0; i < dA.length; i++) near(dA[i].total, dB[i].total, 0.01, `survivor symmetry, year ${i}`);

  // 7. Determinism: the same scenario twice gives identical rows.
  assert.deepStrictEqual(await rows(page, { ...G, spending: s1, cliffGuardEnabled: true }), await rows(page, { ...G, spending: s1, cliffGuardEnabled: true }));

  // 8. Bucket engine, a down year paid from cash: finite results.
  const hist = await page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_simulateHistorical(() => [2008, -37, 0, 5]).rows.map((r) => r.total);
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { ...G, cash: 500000, bondYears: 2, spending: s1, cliffGuardEnabled: true });
  assert(hist.every(Number.isFinite), 'historical run finite');

  assert.deepStrictEqual(errors, []);
  console.log('cliff_guard: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/cliff_guard.js`
Expected: FAIL at case 1 (`guard on stays under`).

- [ ] **Step 3: Implement**

Solver section:

```js
  const NO_PLAN = Object.freeze({ kind: 'none', magi: 0, label: '', order: null, split: -1, score: 0 });
  // The year's plan: each candidate is a dry run of the year's real withdrawal (c.runWithdraw) on cloned
  // balances and ledgers, scored by afterTaxValue less the premium it changes this year and the IRMAA it
  // sets two years on (undiscounted, documented). Candidates per (order, split): the natural draw; a cap
  // just under the nearest line at or below the natural MAGI; a fill just over the nearest line above it
  // (only with penalty-free traditional money). Lines count only inside the reach: from the MAGI with no
  // discretionary draw to that plus REACH_GROSS_UP x the need. The first natural candidate is the baseline;
  // another wins only by more than $1.
  function chooseYearPlan(c) {
    const lo = c.magiBase + c.wd.traditionalGross + c.wd.taxableGainGross,
      hi = lo + REACH_GROSS_UP * c.need;
    let inReach = false;
    if (c.guard) for (const t of c.thresholds) if (t.magi > lo && t.magi <= hi) inReach = true;
    if (!inReach && c.orders.length < 2 && c.splits.length < 2) return NO_PLAN;
    const { lambda, tauGain } = c.lambdaOf(),
      share0 = c.profile.ownerShareA,
      list = c.trace ? [] : null;
    const evaluate = (order, split, kind, target, label) => {
      const w = cloneWithdrawal(c.wd);
      w.need = c.need;
      w.taxAwareOrder = order;
      w.onlyPartner = split;
      if (split >= 0) c.profile.ownerShareA = split === 0 ? 1 : 0;
      if (kind === 'under') w.magiCap = { limit: target - c.magiBase, off: false };
      c.runWithdraw(w);
      if (kind === 'fill') {
        const m = c.magiBase + w.traditionalGross + w.taxableGainGross;
        if (m < target) fillTraditional(w, target - m);
      }
      const score =
        afterTaxValue(w.bal, lambda, tauGain) - (c.premiumAt(w.traditionalGross, w.taxableGainGross) - c.hcCharged) - c.irmaaAt(w.traditionalGross, w.taxableGainGross);
      const cand = { kind, magi: kind === 'none' ? c.magiBase + w.traditionalGross + w.taxableGainGross : target, label, order, split, score, ok: w.need <= 1 };
      c.profile.ownerShareA = share0;
      if (list) list.push(cand);
      return cand;
    };
    let base = null,
      best = null;
    // A candidate that leaves need unmet (it would deplete where the baseline does not, or a split whose
    // partner cannot cover the draw) is never chosen; the baseline is kept whatever it does.
    const consider = (cand) => {
      if (!cand.ok) return;
      if (cand.score > best.score + (best === base ? 1 : 0)) best = cand;
    };
    const canFill = freeTraditional(c.wd) > 0;
    for (const order of c.orders)
      for (const split of c.splits) {
        const nat = evaluate(order, split, 'none', 0, '');
        if (!base) base = best = nat;
        else consider(nat);
        if (!inReach) continue;
        let below = null,
          above = null;
        for (const t of c.thresholds) {
          if (t.magi <= nat.magi && t.magi - 1 >= lo) below = t;
          else if (t.magi > nat.magi && t.magi + 1 <= hi && !above) above = t;
        }
        if (below) consider(evaluate(order, split, 'under', below.magi - 1, below.label));
        if (above && canFill) consider(evaluate(order, split, 'fill', above.magi + 1, above.label));
      }
    if (c.trace) {
      c.trace.candidates = list;
      c.trace.chosenScore = best.score;
    }
    return best === base && base.order === null && base.split < 0 ? NO_PLAN : best;
  }
```

Note on the tie rule: `consider` requires a candidate to beat `best` by more than $1 while `best` is still the baseline, and simply be higher afterwards.

Year loop, before the iteration loop (next to `const passLog = [];`): `let yearPlan = NO_PLAN, yearLambda = null;` and `const ownerShareA0 = profile.ownerShareA;`. At the start of each pass (after the restore block): `profile.ownerShareA = ownerShareA0;`.

Move the construction of the healthcare arguments so `costAt` exists before the withdrawal (it already does after B1; nothing to move). In the withdrawal branch, after `wd.penaltyAware = hasPenalizedMoney(wd);` and the `wopts`/`runWithdraw` definitions:

```js
          const guard = !!state.cliffGuardEnabled;
          if (guard && iter === 0 && !forcedPass) {
            // Partners on Medicare two years on (the IRMAA this year's MAGI sets).
            const medA = !(isSurvivorPeriod && deceasedIsA) && age + 2 >= 65 && age + 2 >= retireAgeA,
              medB = !singlePerson && !(isSurvivorPeriod && deceasedIsB) && ageB + 2 >= 65 && ageB + 2 >= retireAgeB;
            const irmaaAt = (trad, gain) => {
              if (!medA && !medB) return 0;
              if (twoReturns) {
                const [ma, mb] = returnMagis(profile, trad, gain);
                return (medA ? irmaaSurcharge(ma, 'single', year) : 0) + (medB ? irmaaSurcharge(mb, 'single', year) : 0);
              }
              const s = irmaaSurcharge(magiBase + trad + gain, filing, year);
              return (medA ? s : 0) + (medB ? s : 0);
            };
            // The return MAGIs including this year's conversion (it lands on the returns by the pool share).
            const convA = conversionAmount * profile.ownerShareA;
            const planTr = planTrace ? {} : null;
            yearPlan = chooseYearPlan({
              wd,
              need: wd.need,
              magiBase,
              profile,
              runWithdraw,
              thresholds: magiThresholds({ year, filing, twoReturns, profile, preMagi: preConvMagi + conversionAmount, preMagiA: preMagiA + convA, preMagiB: preMagiB + conversionAmount - convA, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA, workingB, age, ageB }),
              guard,
              orders: [null],
              splits: [-1],
              lambdaOf: () => yearLambda || (yearLambda = lambdaEstimate({ tradPool: balSnapshot.traditional + balSnapshot.bondTraditional, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor })),
              premiumAt: costAt,
              irmaaAt,
              hcCharged: healthcare,
              trace: planTr,
            });
            if (planTr) planTrace.push({ year, ...planTr });
          }
          if (yearPlan.kind === 'under') wd.magiCap = { limit: yearPlan.magi - magiBase, off: false };
          runWithdraw(wd);
          if (yearPlan.kind === 'fill') {
            const m = magiBase + wd.traditionalGross + wd.taxableGainGross;
            if (m < yearPlan.magi) fillTraditional(wd, yearPlan.magi - m);
          }
```

(`preMagiA/preMagiB` are the pass's pre-conversion return MAGIs from B1, zero on a joint return, where `magiThresholds` does not read them.) Replace the B3 bare `runWithdraw(wd);` with this block.

Plan trace (used by tests from B5 on): give `runProjection` a `planTrace = null` parameter next to `trace`; nothing is allocated when it is `null`. Add the hook now:

```js
  window.__test_planTrace = () => {
    const planTrace = [];
    runProjection({ mode: STANDARD_MODE, source: standardYearSource(), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace });
    return planTrace;
  };
```

Year table (spec 5.8): `renderTable` is the shared region `20-renderTable`, so it is not edited. Add a US-only function and call it from `render()` immediately after the `renderTable(...)` call:

```js
  // 3C: the year table's status cell explains the solver's choice for that year (title tooltip).
  function annotateSolverRows(sim) {
    for (const tr of document.querySelectorAll('#projectionRows tr')) {
      const age = Number(tr.cells[0] && tr.cells[0].textContent),
        r = sim.rows.find((x) => x.age === age),
        cell = tr.querySelector('.table-status');
      if (!r || !cell) continue;
      const parts = [];
      if (r.cliffChoice) parts.push(`Income ${r.cliffChoice}`);
      if (r.mixOrder) parts.push(`${r.mixOrder === 'traditional' ? 'Traditional' : 'Taxable'} drawn first`);
      if (r.drawSplit) parts.push(`Drawn from Partner ${r.drawSplit}'s accounts`);
      if (r.lambda !== undefined) parts.push(`Later tax on a traditional dollar: about ${Math.round(r.lambda * 100)}%`);
      cell.title = parts.join(' · ');
    }
  }
```

(`mixOrder` and `drawSplit` appear from B5/B6; reading an absent field is harmless.)

Row: before `rows.push(row)`:

```js
        if (yearPlan.kind !== 'none') row.cliffChoice = (yearPlan.kind === 'under' ? 'stayed under ' : 'filled to ') + yearPlan.label;
        if (yearLambda) row.lambda = yearLambda.lambda;
```

Field: markup just after the `withdrawalMixEnabled` field (~533):

```html
          <div class="field"><label for="cliffGuardEnabled"><input id="cliffGuardEnabled" type="checkbox"> Cliff <span class="info-nw">guard<button type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="Each year with a withdrawal, the planner also tries keeping income just under the next cost line (the ACA 400% cliff, the Medicaid line, an IRMAA tier, the senior-deduction or child-credit phase-out) by drawing Roth, cash or bonds instead, and tries lifting income just over a line below which the premium is higher (for example declining Medicaid). It keeps whichever leaves the most after-tax wealth, valuing traditional money at what it will cost in tax later. Off: the withdrawal order runs as set, with no line steering.">i</button></span><small>Steer each year's income around cost lines</small></label></div>
```

`defaults`: `cliffGuardEnabled: true,`. `FIELDS`: `{ key: 'cliffGuardEnabled', type: 'bool', sync: 'controls', resync: [], trueUnlessFalse: true, mcp: true },`. `tests/legacy_state.js`: case `'cliff guard explicitly off': { cliffGuardEnabled: false }`.

Docs: README (Cliff guard bullet), `CLAUDE.md` (new "Per-year solver (3C)" paragraph: the section, `chooseYearPlan`, the cap/release/fill primitives, plan chosen on pass 0 and fixed across MAGI passes, `yearLambda` computed lazily from the start-of-year pool, the skip rule, rows carry `cliffChoice`/`lambda` only when set, state cliffs not candidates). Badge `V115` -> `V116`.

- [ ] **Step 4: Run tests and measure**

Run: `node tests/cliff_guard.js` -> `cliff_guard: OK`
Run: `npm test`. Hand-computed tests that are not about the guard and now move (expected candidates: `tests/aca_medicaid.js` engine rows, `tests/aca_magi_iteration.js`, `tests/irmaa_gating.js`, `tests/penalty_aware_withdrawals.js`, `tests/traditional_penalty.js`, `tests/deductions.js`, `tests/golden.js`): add `cliffGuardEnabled: false` to that test's base patch so it keeps testing its own rule, and list each in the commit message. `tests/survivor_symmetry.js` and `tests/historical_parity.js` must pass **with** the guard on; if either fails, it is a bug in this task (a mutation outside the snapshot, or a mode difference), not a test to switch off.
Snapshots: dump and compare against `../fp-3c-base` (B3 tip) as in B1. Expected movers: ACA, IRMAA, senior-deduction-age and child scenarios. Count moved scenarios and how many end higher/lower and deplete later/earlier; **any earlier depletion is a stop-and-fix**.
Before/after table: default scenario, the moved ACA scenario's first moved year, `node tests/historical_rates.js` (seeded).
Timing: `node tests/bench_runs.js --root ../fp-3c-base` vs `node tests/bench_runs.js` (households with nothing in reach: +5%), and `node tests/bench_solver.js --base ../fp-3c-base` (created in B7 step 1; if B7 has not run yet, write `tests/bench_solver.js` now from B7 step 1 and include it in this commit) for the ACA early-retiree case: +30%. If over: first restrict the fill candidate to years where the line above is an ACA line, then re-measure; record what was cut.
Then `npm run snapshot:update`, `node tests/legacy_state.js --update`, `node tests/snapshot_ui.js --update`, `npm test` green. 390x844 overflow check for the new field.

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html README.md CLAUDE.md package.json tests/
git commit -m "3C: cliff guard in every mode, on by default (US V116)

<before/after table; moved scenarios and counts (higher/lower, depletes later/earlier: none earlier); tests given cliffGuardEnabled:false and why; timing>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B5a: lambda's pool path net of expected draws (spec section 13.1)

> Owner decision, 2026-10-07. Build and commit this **before** committing B5. B5's order-only work is uncommitted
> in the tree. Stash it (`git stash push -- Planner_US.html tests/tax_aware.js CLAUDE.md README.md package.json
> tests/golden.js`), do B5a on top of c54ac72 plus the amendment commits, commit it, then `git stash pop` and
> resolve any conflict in the plan call's `lambdaOf` arguments.

**Files:**
- Modify: `Planner_US.html` (`lambdaEstimate`; the `lambdaOf` closure in the year loop)
- Modify: `tests/solver_hooks.js` (one new case)

**Interfaces:**
- Consumes: `lambdaEstimate` (B2); `balSnapshot` and `-flow` in the year loop.
- Produces: `lambdaEstimate(c)` with two more optional inputs, `need` (default 0) and `tradShare` (default 0). With
  both 0 the result is identical to B2's, to the bit.

- [ ] **Step 1: Write the failing test.** Add to `tests/solver_hooks.js`, after the existing lambda cases:

```js
  // Note 1 (spec 13.1): the pool walks forward net of the traditional share of the need. Single, 70,
  // 1,000,000 traditional, real return 0, Texas, life expectancy 74, need 50,000, tradShare 1.
  // Samples 73, 74, 74: pools 850,000 and 800,000; RMDs 32,075.47 and 31,372.55. Deduction 16,100 + 2,050 +
  // 6,000: taxable income 7,925 (+3,208 step) and 7,223 (+3,137), all in the 10% band, so lambda is 0.10.
  const drawn = await call(
    { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false },
    'lambdaEstimate',
    { tradPool: 1000000, year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, need: 50000, tradShare: 1 },
  );
  near(drawn.lambda, 0.1, 1e-9, 'lambda with draws');
  assert(drawn.lambda < lam.lambda, 'draws lower lambda');
```

- [ ] **Step 2: Run it.** `node tests/solver_hooks.js`. Expected: FAIL, `lambda with draws: expected 0.1, got 0.12`.

- [ ] **Step 3: Implement.** In `lambdaEstimate`, destructure `need = 0, tradShare = 0`. Replace the line
  `const trad = tradPool * Math.pow(1 + real, Math.max(0, ys - year));` with a walk:

```js
      // Note 1 (spec 13.1): walk the pool forward net of the traditional share of each year's need. Social
      // Security and pensions that start later take over part of the need (this year's dollars). With need 0
      // this is the plain compounding of B2, so need = 0 must keep the old result exactly.
      let trad = tradPool;
      if (need > 0 && tradShare > 0) {
        const incomeNow = ssOf('A', state.ageA + year) + (singlePerson ? 0 : ssOf('B', state.ageB + year)) + pensionOf('A', state.ageA + year) + (singlePerson ? 0 : pensionOf('B', state.ageB + year));
        for (let y = year + 1; y <= ys; y++) {
          const later = ssOf('A', state.ageA + y) + (singlePerson ? 0 : ssOf('B', state.ageB + y)) + pensionOf('A', state.ageA + y) + (singlePerson ? 0 : pensionOf('B', state.ageB + y));
          trad = Math.max(0, trad * (1 + real) - tradShare * Math.max(0, need - Math.max(0, later - incomeNow)));
        }
      } else trad = tradPool * Math.pow(1 + real, Math.max(0, ys - year));
```

  (Survivor samples already use the survivor's benefits for the sample year's income. The walk uses the
  household's benefits, which is close enough for an estimate. Note this in the comment if you keep it.)

  In the year loop, the `lambdaOf` closure passes the two inputs. `-flow` is the year's need, known when the
  plan is chosen:

```js
              lambdaOf: () =>
                yearLambda ||
                (yearLambda = lambdaEstimate({
                  tradPool: balSnapshot.traditional + balSnapshot.bondTraditional,
                  year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor,
                  need: -flow,
                  tradShare: (() => {
                    const b = balSnapshot,
                      inv = b.taxable + b.bondTaxable + b.traditional + b.bondTraditional + b.roth + b.bondRoth + b.cash;
                    return inv > 0 ? (b.traditional + b.bondTraditional) / inv : 0;
                  })(),
                })),
```

- [ ] **Step 4: Run tests and re-explain the movers.**
  - `node tests/solver_hooks.js` passes; the B2 literal cases are unchanged.
  - `npm test`: movers are only scenarios where the guard computed lambda. Dump and compare against c54ac72: `node tests/snapshot.js --root ../fp-3c-b5base --dump A --update-nothing`, `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`.
  - Write a before/after table. Hard rules: no scenario depletes earlier; guard-on is never earlier than guard-off (`node tests/solver_scan.js`, or the B7 grid scan).
  - Then `npm run snapshot:update` and `npm test` green.

- [ ] **Step 5: Commit.**

```bash
git add Planner_US.html tests/solver_hooks.js tests/snapshots/
git commit -m "3C: lambda walks the traditional pool forward net of expected draws (spec 13.1, Note 1)

<before/after; movers = guard years where lambda was computed; no earlier depletion>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finish B5 on top.** `git stash pop`, then re-run the 384-household scan. If any tax-aware household still depletes earlier than at c54ac72, STOP and report the count and two worked examples; add no heuristic without the owner's decision.

### Task B5b: lambda prices what the walk assumes; two-return IRMAA per person (spec section 13.2)

> Owner decision, 2026-10-07. Build and commit on top of B5a (`0e664d6`), **before** committing B5.
>
> **Setting aside the B5 work.** It is uncommitted in the tree, with `task-B5-wip.patch` and `stash@{0}` as
> backups. Save the current tree's B5 diff first (`git diff > .superpowers/sdd/2026-10-06-per-year-solver-3c/task-B5-wip-post-B5a.patch`,
> then add `tests/tax_aware.js` to it by hand or copy the file aside), then stash it:
> `git stash push -u -m "B5 order-only wip (post-B5a)" -- Planner_US.html tests/tax_aware.js CLAUDE.md README.md package.json tests/golden.js`.
>
> **Restoring it after B5b:** `git stash pop`, resolving the expected conflict in `lambdaEstimate` / `lambdaOf`
> (keep B5b's versions).

**Files:**
- Modify: `Planner_US.html` (`lambdaEstimate`; the `lambdaOf` closure in the year loop)
- Modify: `tests/solver_hooks.js` (update the B5a case; add three cases)

**Interfaces:**
- Consumes: `lambdaEstimate` with `need` / `tradShare` (B5a); `filingRow`, `irmaaSurcharge`, `rmdDivisor`.
- Produces: the same `lambdaEstimate(c) -> { lambda, tauGain }` signature. With `need` 0 or `tradShare` 0 the
  results match B2's to the bit, except for two-return couples (item 1 of 13.2).

- [ ] **Step 1: Write the failing tests.** In `tests/solver_hooks.js`, change B5a's case to expect 0.12:

```js
  // 13.2: each sample prices the draw the walk assumes. Single, 70, 1,000,000, need 50,000, tradShare 1:
  // the samples at 73 and 74 now price 50,000 of income (not the RMD), deduction 24,150, 12% band: lambda 0.12.
  near(drawn.lambda, 0.12, 1e-9, 'lambda prices the draw');
```

  (Delete B5a's `near(drawn.lambda, 0.1, ...)` and `drawn.lambda < lam.lambda` lines.) Then add:

```js
  const S70 = { singlePerson: true, ageA: 70, lifeExpectancyA: 74, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, pensionYearlyA: 0, survivorEnabled: false };
  const ctxL = (o) => ({ year: 0, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deathYear: Infinity, factor: 1, ...o });

  // 13.2 item 2, a draw larger than the RMD: 1,000,000, need 90,000. Samples price 90,000 of income: taxable
  // 66,750 (senior deduction 5,100 while it phases out at 6%), so each step costs 22% x 1.06 = 23.32%. The
  // 9,000 step keeps MAGI under the first IRMAA tier (109,000).
  const big = await call(S70, 'lambdaEstimate', ctxL({ tradPool: 1000000, need: 90000, tradShare: 1 }));
  near(big.lambda, 0.2332, 1e-9, 'draw above the RMD');

  // 13.2 item 2, the pool runs out: 100,000, need 50,000: empty at 72, so every sample moves to 72 and prices
  // 50,000: taxable 25,850 (+5,000 step), 12% band. B5a gave about 0 here (no RMD left in the sample years).
  const out = await call(S70, 'lambdaEstimate', ctxL({ tradPool: 100000, need: 50000, tradShare: 1 }));
  near(out.lambda, 0.12, 1e-9, 'pool runs out: priced at the last draw year');

  // 13.2 item 1, IRMAA per person on two returns: couple filing single, both 70, life expectancy 73, need 0.
  // Every sample is 73: RMD 3,551,000 / 26.5 = 134,000, 67,000 per return, under 109,000 even with the step.
  // Each return: deduction 24,150, taxable 42,850 (+6,700) in the 12% band. The old household-MAGI IRMAA step
  // made it about 0.379.
  const two = await call(
    { singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 70, ageB: 70, lifeExpectancyA: 73, lifeExpectancyB: 73, returnRate: 2.5, inflation: 2.5, stateTax: 'tx', ssMonthlyA: 0, ssMonthlyB: 0, pensionYearlyA: 0, pensionYearlyB: 0, survivorEnabled: false },
    'lambdaEstimate',
    ctxL({ tradPool: 3551000, singlePerson: false }),
  );
  near(two.lambda, 0.12, 1e-9, 'two-return IRMAA per person');
```

- [ ] **Step 2: Run them.** `node tests/solver_hooks.js`. Expected: FAIL at `lambda prices the draw` (0.1).

- [ ] **Step 3: Implement.** In `lambdaEstimate`, add a walk helper before the sample loop:

```js
    // 13.2: walk to sample year ys0 and return [year priced, pool at the start of that year, that year's draw].
    // If the pool runs out first (the year's draw empties it), that year is priced: one more dollar left today
    // would be spent there.
    const incomeAt = (y) => ssOf('A', state.ageA + y) + pensionOf('A', state.ageA + y) + (singlePerson ? 0 : ssOf('B', state.ageB + y) + pensionOf('B', state.ageB + y));
    const incomeNow = incomeAt(year),
      drawIn = (y) => tradShare * Math.max(0, need - Math.max(0, incomeAt(y) - incomeNow));
    const walkTo = (ys0) => {
      let pool = tradPool;
      for (let y = year + 1; y <= ys0; y++) {
        const before = pool * (1 + real),
          d = drawIn(y);
        if (y === ys0 || before <= d) return [y, before, d];
        pool = before - d;
      }
      return [ys0, tradPool, drawIn(year)];
    };
```

  In the loop, rename the loop variable to `ys0` and make its first lines:

```js
    for (const ys0 of samples) {
      const [ys, trad, draw] = need > 0 && tradShare > 0 ? walkTo(ys0) : [ys0, tradPool * Math.pow(1 + real, Math.max(0, ys0 - year)), 0];
```

  Delete B5a's inline walk (the `let trad; if (need > 0 && tradShare > 0) { ... } else ...` block).
  `ageAs`, `ageBs`, `survivorIsB` and `onePerson` already derive from `ys`, so they now follow the clamped year.
  Replace the RMD and pricing lines:

```js
      const rmd = ownerAge >= startAge ? trad / rmdDivisor(ownerAge) : 0,
        // 13.2: the traditional income the walk assumes this year (the RMD alone when there are no draws).
        tradIncome = Math.max(rmd, Math.min(trad, draw)),
        step = Math.max(1000, 0.1 * tradIncome),
        t0 = taxFor(P, 0, tradIncome),
        t1 = taxFor(P, 0, tradIncome + step),
        g1 = taxFor(P, step, tradIncome);
      let irmaaStep;
      if (!onePerson && !filingRow(P.filing).joint) {
        // 13.2 item 1: two returns, IRMAA per person on their own MAGI (half the traditional income each).
        const half = tradIncome / 2,
          hs = step / 2,
          mA = P.otherA + P.ssA + half,
          mB = P.otherB + P.ssB + half;
        irmaaStep =
          (P.ageA >= 65 ? irmaaSurcharge(mA + hs, 'single', year) - irmaaSurcharge(mA, 'single', year) : 0) +
          (P.ageB >= 65 ? irmaaSurcharge(mB + hs, 'single', year) - irmaaSurcharge(mB, 'single', year) : 0);
      } else {
        const magi = P.otherA + P.otherB + P.ssA + P.ssB + tradIncome,
          onMedicare = (P.ageA >= 65 ? 1 : 0) + (!onePerson && P.ageB >= 65 ? 1 : 0);
        irmaaStep = onMedicare * (irmaaSurcharge(magi + step, P.filing, year) - irmaaSurcharge(magi, P.filing, year));
      }
```

  (`Math.max(rmd, Math.min(trad, 0))` returns `rmd` itself, so the no-draw path is bit-identical.) Update the
  function's header comment: the samples price the walk's own traditional income and move to the year the pool
  runs out; IRMAA is per person on two returns.

  In the year loop's `lambdaOf`, change `need: -flow` to `need: Math.max(0, -flow - lumpExpense)`.

- [ ] **Step 4: Run tests and re-explain the movers.**
  - `node tests/solver_hooks.js` passes; the B2 cases are unchanged.
  - `npm test`. Dump and compare against B5a: `git worktree add ../fp-3c-b5abase 0e664d6`, then `node tests/snapshot.js --root ../fp-3c-b5abase --dump A --update-nothing`, `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`.
  - Movers must be guard years where lambda was computed. Write a before/after table.
  - Hard rules: no scenario depletes earlier than at c54ac72 or at B5a; guard-on never earlier than guard-off.
  - Then `npm run snapshot:update` and `npm test` green.

- [ ] **Step 5: Commit.**

```bash
git add Planner_US.html tests/solver_hooks.js tests/snapshots/
git commit -m "3C: lambda prices the walk's own draws and the year the pool runs out; two-return IRMAA per person (spec 13.2)

<before/after; movers = guard years where lambda was computed; no earlier depletion>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finish B5 on top.**
  - Restore the B5 work (`git stash pop`, keeping B5b's `lambdaEstimate` / `lambdaOf`).
  - Re-pin the golden "never worse than default" figures, re-reading **both** the tax-aware and the default figure in this tree.
  - Run the snapshot dump/compare against the B5b commit, and the timing gate against `0e664d6`.
  - Re-run the 768-per-mode scan and report both counts: tax-aware vs c54ac72's tax-aware, and tax-aware vs the default order.
  - If any tax-aware household still depletes earlier than at c54ac72, STOP and report two worked examples, with no heuristic.

### Task B5: Refactors for Batch 5 (no number change)

> **AMENDMENT 2 (owner decision, 2026-10-07, spec section 13.3). It wins over the AMENDMENT block below and over
> all the task text after it.** B5 ships refactors only. The tax-aware order is not reliable enough without
> Batch 5's plan-level check, so it moves to Batch 5.
>
> **Keep from the uncommitted B5 work:**
> - `solveRothConversionTo` (the split-out bracket fill; `solveRothConversion` calls it);
> - the healthcare-cost block moved above the conversion;
> - the lifted `irmaaAt` / `lambdaOf` closures, with B5b's `lambdaOf` arguments.
>
> **Revert to the B5b commit (b5b7878):**
> - the plan's `orders` goes back to `[null]` and its call condition back to `guard` only;
> - the `drawMixedStockAccounts` live branch is the old `pickLiveWithdrawalOrder` call (keep `wd.taxAwareOrder` in
>   `newWithdrawal`; it stays `null`);
> - no `mixOrder` row field;
> - the `withdrawalMixEnabled` label, descriptor and info tip are unchanged;
> - `tests/golden.js` unchanged; no README or `CLAUDE.md` feature text about tax-aware mode;
> - delete the untracked `tests/tax_aware.js` (save a copy beside `task-B5-wip.patch` for Batch 5);
> - no `package.json` change and no badge bump (nothing user-facing).
>
> In `CLAUDE.md`, add one line in the Withdrawals section: `solveRothConversionTo(profile, cap, yearIndex,
> bracketPct)` is the bracket fill, and `solveRothConversion` resolves the bracket (override, applied schedule,
> setting) and calls it.
>
> **Acceptance:**
> - `npm test` green;
> - the snapshot dump against b5b7878 shows **zero** changed scenarios (`--root` a worktree of b5b7878, dump A, dump B, compare);
> - `npm run check:shared` green; the page loads with no pageerror.
>
> **Commit:** "3C: refactors for Batch 5 (solveRothConversionTo, healthcare block before the conversion, lifted
> closures), no number change". Keep `task-B5-wip.patch`, `task-B5-wip-post-B5a.patch`, the saved
> `tests/tax_aware.js` and the stashes; they are Batch 5's starting material.

> **AMENDMENT (owner decision, 2026-10-07): B5 is order-only. Where this block and the task text below disagree, this block wins.** See spec section 13 for why: the conversion sizing as written made five scenarios deplete earlier, and it moves to Batch 5 with two design notes.
>
> **Resume from the first attempt.** Its uncommitted work is in `Planner_US.html` and `tests/tax_aware.js` (also saved as `.superpowers/sdd/2026-10-06-per-year-solver-3c/task-B5-wip.patch`).
>
> **Keep from it:**
> - the `solveRothConversionTo` split (byte-identical);
> - the healthcare-cost block moved above the conversion (byte-identical);
> - the lifted `irmaaAt` / `lambdaOf` closures;
> - plan selection over the two orders, the live branch following `wd.taxAwareOrder`, and the `mixOrder` row field;
> - the test household's `tenure: 'rent', rent: 0` fix.
>
> **Drop:**
> - `chooseTaxAwareConversion` and `CONVERSION_BRACKETS` (delete them; do not leave dead code);
> - the `taxAware && !scheduled` branch of the conversion block and the `yearConversion` variable.
>
> The conversion block goes back to its B4 form in every mode, `conversionAmount = solveRothConversion(profile, Math.min(capNoMagi, magiSafeRoom), year, age)`, now calling the split-out function.
>
> **Interfaces:** Produces `solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct) -> amount` and the row field `mixOrder`. It no longer produces `chooseTaxAwareConversion`. `lambdaOf` is still called by the plan in tax-aware years, so rows carry `lambda` there.
>
> **Tests (`tests/tax_aware.js`).**
> - *Remove* the three conversion cases: `r1` (fill to the 22% top), `r2` (no conversion at lambda 0) and `r3` (applied schedule).
> - *Keep* the order case (`r4`: `mixOrder === 'traditional'`, traditional only) and the plan-trace check (chosen plan scores highest).
> - *Add* two cases:
>   - **(a) Conversions follow the bracket in tax-aware mode.** The same household as the old `conv` case, with `rothConvBracket: 22`: `conversionAmount` equals the guard-off, live-mix-off run of the same household (`withdrawalMixEnabled: false`), to the cent.
>   - **(b) Tax-aware never shortens the plan.** For the snapshot scenario `std R rothConv+aca+live`'s patch (copy it from `tests/snapshot_scenarios.js`), `depletedAge` with tax-aware on is `null` or no earlier than with `withdrawalMixEnabled: false`.
>
> **UI copy.** Label "Tax-aware withdrawals". Info tip: "Each year with a withdrawal, the planner tries drawing taxable money first and traditional money first (and, with the cliff guard on, keeping income just under or just over the nearest cost line), and keeps whichever leaves the most after-tax wealth, valuing a traditional dollar at the tax it will likely cost later (estimated from your RMDs, Social Security and pensions). Roth conversions still follow your bracket setting. Applied optimizer schedules take precedence." Descriptor: "Chooses each year's withdrawal order by later tax".
>
> **Docs.**
> - README: "Tax-aware withdrawals" chooses the order; conversions follow the bracket.
> - `CLAUDE.md`: the live branch follows `wd.taxAwareOrder`; `solveRothConversionTo`; conversion sizing by lambda is Batch 5 work (spec section 13).
> - Badge `V116` -> `V117`.
>
> **Hard stops unchanged.** Snapshot movers must be live-mix scenarios only, and none may deplete earlier than at c54ac72 (compare with `node tests/snapshot.js --root ../fp-3c-b5base --dump A --update-nothing`, then `--dump B`, then `--compare A B`). Also run `npm test`, the timing gate and `tests/solver_scan.js` if it exists; otherwise defer the scan to B7 as planned.
>
> **Commit message:** "3C: tax-aware withdrawals choose the stock-account order; conversions keep the bracket setting (US V117)".

**Files:**
- Modify: `Planner_US.html` (`drawMixedStockAccounts` live branch; `solveRothConversion` split into `solveRothConversionTo`; new `chooseTaxAwareConversion`; year loop; `withdrawalMixEnabled` label and info tip)
- Create: `tests/tax_aware.js`; add to `package.json` after `tests/cliff_guard.js`
- Modify: `test_multi_lever_optimizer.js`, `tests` that pin the old live mix (`grep -l withdrawalMixEnabled: true tests/*.js test_*.js`)
- Docs: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `chooseYearPlan` (B4), `lambdaEstimate` (B2), `costAt` (B1).
- Produces: `solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct) -> amount`; `chooseTaxAwareConversion(c) -> amount` with `c = { profile, cap, year, estTrad, estGain, lambda, premiumAt, irmaaAt, thresholds, preMagi }`; row field `mixOrder` (`'taxable'|'traditional'`, tax-aware years only). The live mix no longer calls `pickLiveWithdrawalOrder` (keep the function and its test hook; `test_*.js` may still call it directly).

- [ ] **Step 1: Write the failing test**

Create `tests/tax_aware.js` (boilerplate + BASE, then):

```js
// 3C tax-aware mode. Lambda cases are hand-computed (2026 law, real return 0, Texas):
//   1,968,000 traditional, single, life expectancy 76: RMDs at 75 and 76 are about 80,000 and 83,038; the
//   senior deduction is still phasing out (6% over 75,000), so each step costs 22% x 1.06 = 23.32%.
(async () => {
  const { browser, page, errors } = await openPlanner();
  const T = { ...BASE, ruleOf55A: false, ruleOf55B: false, cliffGuardEnabled: true, withdrawalMixEnabled: true, ageA: 50, retireAgeA: 50, lifeExpectancyA: 76, returnRate: 2.5, inflation: 2.5, medicalInflation: 0 };
  // Conversion fills to the top of the 22% bracket (105,700 taxable + 16,100 deduction) and no further.
  const conv = { ...T, trad401kA: 1968000, rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 50, rothConvBracket: 10 };
  const r1 = (await rows(page, conv))[0];
  assert(r1.lambda > 0.22 && r1.lambda < 0.24, `lambda between the 22% and 24% rates (${r1.lambda})`);
  near(r1.conversionAmount, 121800, 1, 'converts to the top of the 22% bracket (the 10% bracket setting is ignored)');
  // A small pool: the RMDs fit under the deduction, lambda 0, no conversion.
  const r2 = (await rows(page, { ...conv, trad401kA: 300000 }))[0];
  near(r2.lambda, 0, 1e-9, 'lambda 0');
  near(r2.conversionAmount, 0, 1e-9, 'no conversion');
  // An applied schedule still wins for its ages.
  const r3 = (await rows(page, { ...conv, appliedRothSchedule: { 50: 0 } }))[0];
  near(r3.conversionAmount, 0, 1e-9, 'applied schedule wins');
  // Order: taxable with no gain costs a full dollar per dollar; traditional costs 1 - lambda plus a little tax,
  // so traditional goes first (the old live mix chose taxable: zero incremental tax).
  const mix = { ...T, ageA: 60, retireAgeA: 60, taxable: 500000, basisRatio: 100, trad401kA: 1968000, spending: 20000 };
  const r4 = (await rows(page, mix))[0];
  assert.strictEqual(r4.mixOrder, 'traditional', `order ${r4.mixOrder}`);
  assert(r4.traditionalWithdrawn > 0 && r4.taxableWithdrawn === 0, 'drew traditional only');
  // The chosen plan has the best score among the candidates (trace).
  const best = await page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      const t = window.__test_planTrace();
      return t.filter((y) => y.candidates).every((y) => y.candidates.every((c) => c.score <= y.chosenScore + 1e-6));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, mix);
  assert(best, 'chosen plan scores highest');
  assert.deepStrictEqual(errors, []);
  console.log('tax_aware: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/tax_aware.js`
Expected: FAIL (`lambda` undefined on row 0: no plan is computed when nothing is in reach, or the conversion follows the 10% bracket).

- [ ] **Step 3: Implement**

Split `solveRothConversion`: everything after `if (bracketPct === 0) return 0;` moves into

```js
  function solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct) {
    if (maxAvailable <= 0 || bracketPct === 0) return 0;
    // (the body that was below, unchanged)
  }
```

and `solveRothConversion` ends with `return solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct);`. (Pure refactor; snapshots must not move. Run `npm test` after this sub-step alone.)

Solver section:

```js
  const CONVERSION_BRACKETS = [10, 12, 22, 24, 32, 35];
  // Tax-aware conversion: candidates are 0, the fill of each bracket and the room under each MAGI line above
  // the pre-conversion MAGI; each scores amount x lambda less the tax, premium and later IRMAA it adds on top
  // of this pass's estimated draw. Ties go to the smaller conversion. Priced through taxFor itself, so the
  // conservative deduction of solveRothConversion does not apply here.
  function chooseTaxAwareConversion(c) {
    if (!(c.cap > 0)) return 0;
    const amounts = [0];
    for (const b of CONVERSION_BRACKETS) amounts.push(solveRothConversionTo(c.profile, c.cap, c.year, b));
    for (const t of c.thresholds) if (t.magi - 1 > c.preMagi) amounts.push(Math.min(c.cap, t.magi - 1 - c.preMagi));
    const tax0 = taxFor(c.profile, c.estGain, c.estTrad),
      prem0 = c.premiumAt(c.estTrad, c.estGain),
      irm0 = c.irmaaAt(c.estTrad, c.estGain);
    let best = 0,
      bestScore = 0;
    for (const a of amounts) {
      if (!(a > 0)) continue;
      const score =
        a * c.lambda -
        (taxFor(c.profile, c.estGain, c.estTrad + a) - tax0) -
        (c.premiumAt(c.estTrad + a, c.estGain) - prem0) -
        (c.irmaaAt(c.estTrad + a, c.estGain) - irm0);
      if (score > bestScore + 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && a < best)) {
        best = a;
        bestScore = score;
      }
    }
    return best;
  }
```

Year loop: lift the `irmaaAt` closure and the `lambdaOf` closure out of the withdrawal branch to just after `costAt` is defined (both depend only on values known there; `irmaaAt` is pure). Because `costAt` is defined after the conversion, move the healthcare-argument block (`hcArgs`, `healthcareCost`, `costAt`) **above** the conversion block, building `hcArgs` with the pre-conversion estimate and then setting `hcArgs.magiProxy = magiProxy` (and `magiA/magiB`) once the conversion is known, then calling `healthcareCost(hcArgs)`. Verify with `npm test` that this reordering alone moves nothing.

Then in the conversion block:

```js
        const taxAware = !!state.withdrawalMixEnabled;
        const scheduled =
          (rothBracketOverrideByAge && rothBracketOverrideByAge.has(age)) ||
          (state.appliedRothSchedule && Object.prototype.hasOwnProperty.call(state.appliedRothSchedule, age));
        if (convertsThisYear) {
          const capNoMagi = Math.max(0, traditionalBeforeRmd - rmd - seppLocked);
          if (taxAware && !scheduled) {
            if (iter === 0 && !forcedPass)
              yearConversion = chooseTaxAwareConversion({
                profile,
                cap: capNoMagi,
                year,
                estTrad,
                estGain,
                lambda: lambdaOf().lambda,
                premiumAt: costAt,
                irmaaAt,
                thresholds: magiThresholds({ year, filing, twoReturns, profile, preMagi: preConvMagi, preMagiA, preMagiB, acaEligibleA, acaEligibleB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB, workingA, workingB, age, ageB }),
                preMagi: preConvMagi,
              });
            conversionAmount = Math.min(yearConversion, capNoMagi);
          } else {
            const conversionCap = Math.min(capNoMagi, magiSafeRoom);
            conversionAmount = solveRothConversion(profile, conversionCap, year, age);
          }
        }
```

with `let yearConversion = 0;` declared beside `yearPlan`.

Withdrawal: the plan call uses `orders: taxAware ? ['taxable', 'traditional'] : [null]`, and the plan is computed when `guard || taxAware` (rename the condition: `if ((guard || taxAware) && iter === 0 && !forcedPass)`; pass `guard` as before so lines are only candidates with the guard on). After choosing: `wd.taxAwareOrder = yearPlan.order;`. Row: `if (yearPlan.order) row.mixOrder = yearPlan.order;`. Make `chooseYearPlan` return `best` (not `NO_PLAN`) whenever `best.order !== null`, so a tax-aware year always records its order (the B4 return line already does this).

`drawMixedStockAccounts`, live branch, replaced:

```js
    } else if (state.withdrawalMixEnabled && wd.need > 0) {
      // Tax-aware: the year's plan picked the order (chooseYearPlan); each order cascades fully into the other.
      wd.mixCandidate = 'live';
      const tradFirst = wd.taxAwareOrder === 'traditional';
      if (tradFirst && freeTrad > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
      if (wd.need > 0) wd.need -= takeTaxable(wd, 'taxable', wd.need);
      if (!tradFirst && wd.need > 0 && freeTrad > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
    } else if (state.smoothWithdrawals) {
```

The plan trace and `window.__test_planTrace` exist since B4 (each entry `{ year, candidates, chosenScore }`).

UI copy: the `withdrawalMixEnabled` label becomes "Tax-aware withdrawals", info tip: "Each year with a withdrawal, the planner tries drawing taxable money first and traditional first (and, with the cliff guard on, keeping income just under or just over the nearest cost line), and keeps whichever leaves the most after-tax wealth, valuing a traditional dollar at the tax it will cost later (estimated from your RMDs, Social Security and pensions). With Roth conversions on, it also sizes each year's conversion that way, converting while this year's tax is below that later cost; your bracket setting is not used. Applied optimizer schedules still take precedence." Descriptor: "Chooses each year's order and conversion by later tax". Also update the multi-lever optimizer comment near `computeRothOptimizer` that describes the live mix.

Tests that pin the old live mix: update their expectations only where the test is about the live mix itself, with the reason in the commit; for tests about something else, set `withdrawalMixEnabled: false`.

Docs: README (Tax-aware withdrawals bullet replaces the live mix bullet), `CLAUDE.md` (Withdrawals section: the live branch now follows `wd.taxAwareOrder`; `solveRothConversionTo`; precedence of applied schedules; conversions keep the bracket setting and conversion sizing by lambda is Batch 5 work, spec section 13). Badge `V116` -> `V117`.

- [ ] **Step 4: Run tests and measure**

Run: `node tests/tax_aware.js` -> `tax_aware: OK`
Run: `npm test`; snapshot movers must be only scenarios with `withdrawalMixEnabled: true` (list them). Run `node test_multi_lever_optimizer.js` and `node test_roth_optimizer_per_year.js`; update only expectations that depended on the old live mix, with reasons.
Before/after table: each moved live-mix scenario's ending total and lifetime tax + healthcare; `node tests/historical_rates.js` live-mix rows.
`npm run snapshot:update`, `node tests/snapshot_ui.js --update` (label text), `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html README.md CLAUDE.md package.json tests/ test_*.js
git commit -m "3C: tax-aware withdrawals: order and conversion chosen by the later tax on traditional money (US V117)

<before/after; moved = live-mix scenarios only>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B6: Two-return draw split (pro rata, A first, B first)

> **DEFERRED TO BATCH 5 (owner decision, 2026-10-07, spec section 13.3). Do not build in 3C.** The split lives
> inside tax-aware mode and is scored by the same lambda as the order choice, so it moves with it, behind Batch 5's
> plan-level check. The text below is kept as Batch 5's starting point. Skip to Task B7.

**Files:**
- Modify: `Planner_US.html` (year loop: `splits`; application of `yearPlan.split`; row field)
- Create: `tests/two_return_split.js`; add to `package.json` after `tests/tax_aware.js`
- Docs: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `chooseYearPlan` (B4) with `splits`, `wd.onlyPartner` (B3), `ownerShareA0` (B4).
- Produces: row field `drawSplit` (`'A'|'B'`, only when not pro rata).

- [ ] **Step 1: Write the failing test**

Create `tests/two_return_split.js` (boilerplate + BASE, then):

```js
// 3C two-return split: B has a 90,000 pension (22% bracket on a single return), A has no income. Drawing
// the year's traditional money from A's accounts taxes it at A's 0-12% rates, so A first wins.
(async () => {
  const { browser, page, errors } = await openPlanner();
  const S = { ...BASE, ruleOf55A: false, ruleOf55B: false, cliffGuardEnabled: true, withdrawalMixEnabled: true, singlePerson: false, filingStatus: 'single', ageB: 60, retireAgeB: 60, lifeExpectancyB: 64, pensionYearlyB: 90000, trad401kA: 1000000, trad401kB: 1000000, cash: 0, spending: 120000 };
  const r = (await rows(page, S))[0];
  assert(r.traditionalWithdrawn > 0, 'precondition: the year has a traditional draw');
  assert.strictEqual(r.drawSplit, 'A', `split ${r.drawSplit}`);
  // With a conversion in the year the split is not offered (taxFor splits the conversion by the ledger share).
  const c = (await rows(page, { ...S, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 60 }))[0];
  if (c.conversionAmount > 0) assert.strictEqual(c.drawSplit, undefined, 'no split in a conversion year');
  // Joint returns: never a split.
  const j = (await rows(page, { ...S, filingStatus: 'mfj' }))[0];
  assert.strictEqual(j.drawSplit, undefined, 'no split on a joint return');
  assert.deepStrictEqual(errors, []);
  console.log('two_return_split: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/two_return_split.js`
Expected: FAIL (`split undefined`).

- [ ] **Step 3: Implement**

In the plan call: `splits: taxAware && twoReturns && conversionAmount === 0 ? [-1, 0, 1] : [-1]`. After the plan is chosen, on every pass:

```js
          wd.onlyPartner = yearPlan.split;
          if (yearPlan.split >= 0) profile.ownerShareA = yearPlan.split === 0 ? 1 : 0;
```

(placed right after `wd.taxAwareOrder = yearPlan.order;`; the pass-start reset to `ownerShareA0` from B4 undoes it for the next year.) Row: `if (yearPlan.split >= 0) row.drawSplit = yearPlan.split === 0 ? 'A' : 'B';`.

Why this is consistent: with a split, every discretionary traditional dollar comes from one partner's accounts (the restricted `tradGroup`), and `taxFor` splits `traditionalExtra` by `profile.ownerShareA`, now 1 or 0; with no conversion that year, `traditionalExtra` is the draw alone. A candidate whose partner cannot cover the need (`ok` false) is skipped in `consider`.

Docs: README (two-return couples: whose accounts fund the draw), `CLAUDE.md` (the split and its no-conversion condition). Badge `V117` -> `V118`.

- [ ] **Step 4: Run tests**

Run: `node tests/two_return_split.js` -> `two_return_split: OK`
Run: `npm test`; movers only tax-aware two-return scenarios. Before/after for them; `npm run snapshot:update`; green.

- [ ] **Step 5: Commit**

```bash
git add Planner_US.html README.md CLAUDE.md package.json tests/
git commit -m "3C: two-return draw split in tax-aware mode (US V118)

<before/after; moved = tax-aware two-return scenarios>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task B7: Measurements, performance record, gap table, plan and docs

> **AMENDMENT (owner decision, 2026-10-07, spec section 13.3). It wins over the task text below.** With B5 refactors-only and B6 deferred:
>
> **Scan.** `tests/solver_scan.js` becomes the metrics scan already written for the B5 decision. Take
> `C:\Users\Alex\code\scan-b5-metrics\scan_guard.js` + `analyze_guard.js`, and make them one committed script
> that runs the 768-per-mode grid and prints, for guard on vs off (default order and smooth):
> - value, cost and depletion better / equal / worse;
> - p10 / median / p90 of the differences;
> - the conversions split;
> - exit code 1 if any household depletes earlier with the guard on.
>
> Run it at the B5 commit; the numbers must match the 13.3 table, rows 2 and 3.
>
> **Gap table.** In `tests/solver_gap.js` the "solver" run is the shipped engine with the guard on and the default
> order (`withdrawalMixEnabled: false`, `cliffGuardEnabled: true`), against the slow reference. It records where
> 3C leaves Batch 5.
>
> **Timing.** Run the gate against `c54ac72` (the guard is unchanged since; B5a/B5b only added the lambda walk)
> and against the B5 commit.
>
> **Notes** (`docs/next-batches-plan.md`, 3C batch notes) record:
> - spec sections 13 to 13.3, including the 13.3 table, the B5 tax-aware metrics table (`task-B5-metrics.md`)
>   and the guard tables (`task-B5-guard-metrics.md`);
> - that B6 and the tax-aware order moved to Batch 5, with their acceptance tests;
> - the IRMAA stay-under note;
> - that `remainingMagiRoom` is dead wiring for Batch 5 to remove with `pickLiveWithdrawalOrder`.
>
> The Batch 5 section in that file gets the 13.3 Batch 5 requirements as written in the spec.
>
> **No badge bump; no README change about tax-aware mode.**
>
> **Then:** a whole-branch review of PR 2 (B1-B5, B5a, B5b, B7).

**Files:**
- Create: `tests/bench_solver.js`, `tests/solver_scan.js`, `tests/solver_gap.js` (not in `npm test`)
- Modify: `Planner_US.html` (one test hook: `window.__test_setOptimizerBudget`)
- Modify: `docs/next-batches-plan.md`, `CLAUDE.md` (Files list: the three scripts), `docs/batch-3c-prototype/README.md` (superseded note)

**Interfaces:**
- Produces: `window.__test_setOptimizerBudget(n)` (changes the optimizer's evaluation budget; `ROTH_PER_YEAR_EVAL_BUDGET` becomes the default of a `let rothPerYearEvalBudget` read by `optimizeMultiLever`).

- [ ] **Step 1: Write `tests/bench_solver.js`** (if B4 already created it, skip)

```js
// Interleaved timing of one scenario in two trees, one process (CLAUDE.md: +-10% wall-clock noise between
// runs). Usage: node tests/bench_solver.js --base <worktree> [--rounds 7]
const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const base = path.resolve(args[args.indexOf('--base') + 1]);
const rounds = Number(args.includes('--rounds') ? args[args.indexOf('--rounds') + 1] : 7);
const SCENARIOS = {
  'ACA early retiree (CA)': { retireAgeA: 50, retireAgeB: 50, ageA: 50, ageB: 50, acaEnabled: true, stateTax: 'ca' },
  'default': {},
};
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
  const browser = await chromium.launch();
  const open = async (root) => {
    const page = await browser.newPage();
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + path.join(root, 'Planner_US.html'));
    await page.waitForTimeout(300);
    return page;
  };
  const pages = { base: await open(base), head: await open(path.resolve(__dirname, '..')) };
  for (const [name, patch] of Object.entries(SCENARIOS)) {
    const t = { base: { sim: [], mc: [] }, head: { sim: [], mc: [] } };
    for (let r = 0; r < rounds; r++)
      for (const k of r % 2 ? ['head', 'base'] : ['base', 'head']) {
        const out = await pages[k].evaluate((patch) => {
          Object.assign(window.__test_getState(), patch);
          const t0 = performance.now();
          for (let i = 0; i < 50; i++) window.__test_simulate();
          const sim = (performance.now() - t0) / 50;
          const t1 = performance.now();
          for (let i = 0; i < 20; i++) window.__test_simulateHistorical((y) => [1928 + ((y * 7) % 90), 7 - (y % 5) * 6, 2.5, 4]);
          return { sim, mc: (performance.now() - t1) / 20 };
        }, patch);
        t[k].sim.push(out.sim);
        t[k].mc.push(out.mc);
      }
    const pctOf = (a, b) => ((median(a) / median(b) - 1) * 100).toFixed(1);
    console.log(`${name}: simulate ${median(t.base.sim).toFixed(2)} -> ${median(t.head.sim).toFixed(2)} ms (${pctOf(t.head.sim, t.base.sim)}%), path ${median(t.base.mc).toFixed(2)} -> ${median(t.head.mc).toFixed(2)} ms (${pctOf(t.head.mc, t.base.mc)}%)`);
  }
  await browser.close();
})();
```

Run: `node tests/bench_solver.js --base ../fp-3c-base` (the PR 1 tip) and `node tests/bench_runs.js --root ../fp-3c-base` then `node tests/bench_runs.js`. Gate: ACA early retiree <= +30% (simulate and path), every `bench_runs` state <= +5%. Over the gate: stop and report to the owner with the numbers before changing anything (the spec's first lever is narrowing the candidate set).

- [ ] **Step 2: Write `tests/solver_scan.js` and run it**

```js
// Scenario sweep for the 3C notes: each scenario with the guard off and on (and tax-aware off and on),
// counting how many moved, ended higher/lower (after-tax ending total) and depleted later/earlier.
// Hard rule: no scenario depletes earlier with the guard on. Usage: node tests/solver_scan.js
const { chromium } = require('playwright');
const path = require('path');
const { legacyToAccounts } = require('./legacy_balances');
const grid = [];
for (const filing of ['mfj', 'single-couple', 'single-person', 'hoh'])
  for (const age of [52, 58, 62, 66])
    for (const trad of [500000, 1500000])
      for (const taxable of [300000, 2000000])
        for (const spending of [60000, 130000])
          for (const mode of ['default', 'smooth', 'taxAware'])
            for (const elections of ['none', 'rule55', 'sepp'])
              grid.push({ filing, age, trad, taxable, spending, mode, elections });
const patchOf = (g) => ({
  ...(g.filing === 'mfj' ? { singlePerson: false, filingStatus: 'mfj' } : g.filing === 'single-couple' ? { singlePerson: false, filingStatus: 'single' } : { singlePerson: true }),
  children: g.filing === 'hoh' ? [{ birthYear: 2016, student: false }] : [],
  ageA: g.age, ageB: g.age, retireAgeA: g.age, retireAgeB: g.age, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: g.taxable, spending: g.spending,
  smoothWithdrawals: g.mode === 'smooth', withdrawalMixEnabled: g.mode === 'taxAware',
  ruleOf55A: g.elections === 'rule55', ruleOf55B: g.elections === 'rule55', sepp72tK401A: g.elections === 'sepp',
  ...legacyToAccounts({ traditional: g.trad, roth: 200000 }, { singlePerson: g.filing === 'single-person' || g.filing === 'hoh' }),
});
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const stats = {};
  let earlier = [];
  for (const g of grid) {
    const out = await page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      const run = (guard) => {
        Object.assign(st, saved, patch, { cliffGuardEnabled: guard });
        const s = window.__test_simulate();
        return { end: s.rows.at(-1).total, dep: s.depletedAge };
      };
      try {
        return { off: run(false), on: run(true) };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patchOf(g));
    const k = `${g.mode}/${g.filing}`;
    const s = (stats[k] = stats[k] || { n: 0, moved: 0, higher: 0, lower: 0, later: 0, earlier: 0 });
    s.n++;
    if (Math.abs(out.on.end - out.off.end) > 1000 || out.on.dep !== out.off.dep) s.moved++;
    if (out.on.end - out.off.end > 1000) s.higher++;
    if (out.off.end - out.on.end > 1000) s.lower++;
    const depOn = out.on.dep || Infinity,
      depOff = out.off.dep || Infinity;
    if (depOn > depOff) s.later++;
    if (depOn < depOff) {
      s.earlier++;
      earlier.push(g);
    }
  }
  console.table(stats);
  if (earlier.length) {
    console.error('DEPLETES EARLIER with the guard on:', JSON.stringify(earlier, null, 1));
    process.exitCode = 1;
  }
  await browser.close();
})();
```

Run: `node tests/solver_scan.js`. Exit code 0 is required (no earlier depletion). Keep the table for the notes. If it fails, find the year where the guard-on run first leaves need unmet (`rows` with `depletedAge`) and print that year's plan trace (`window.__test_planTrace`); fix the cause in the solver before continuing, and add the failing scenario to `tests/cliff_guard.js`.

- [ ] **Step 3: Gap table against a slow reference**

Make the optimizer budget adjustable: in `Planner_US.html` add `let rothPerYearEvalBudget = ROTH_PER_YEAR_EVAL_BUDGET;`, use it in place of `ROTH_PER_YEAR_EVAL_BUDGET` inside `optimizeMultiLever`, and add `window.__test_setOptimizerBudget = (n) => { rothPerYearEvalBudget = n; };`. (No behavior change: snapshots and `test_multi_lever_optimizer.js` unchanged.)

Create `tests/solver_gap.js`:

```js
// Gap of the tax-aware solver (m = 1) against a slow reference: the multi-lever coordinate ascent with a
// 200,000-evaluation budget, on short plans (life expectancy 75) so the reference finishes. Objective:
// lifetime real tax + healthcare (the optimizer's own), and ending total. Usage: node tests/solver_gap.js
const { chromium } = require('playwright');
const path = require('path');
const { legacyToAccounts } = require('./legacy_balances');
const CASES = [
  { name: 'early ACA single', p: { singlePerson: true, ageA: 55, retireAgeA: 55, lifeExpectancyA: 75, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 }, acct: { traditional: 1200000, roth: 100000 } },
  { name: 'couple 62 IRMAA', p: { singlePerson: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, lifeExpectancyA: 75, lifeExpectancyB: 75, stateTax: 'ca', spending: 110000, taxable: 800000 }, acct: { traditional: 2500000, roth: 200000 } },
  { name: 'couple 58 trad-heavy', p: { singlePerson: false, ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, lifeExpectancyA: 75, lifeExpectancyB: 75, acaEnabled: true, stateTax: 'ny', spending: 90000, taxable: 200000 }, acct: { traditional: 2000000, roth: 50000 } },
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  for (const c of CASES) {
    const patch = { ...c.p, rothConvEnabled: true, rothConvStartAge: c.p.ageA, rothConvEndAge: 74, ...legacyToAccounts(c.acct, c.p) };
    const out = await page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      const cost = (s) => window.__test_rothScheduleCost(s);
      try {
        Object.assign(st, patch, { withdrawalMixEnabled: true, cliffGuardEnabled: true });
        const solver = window.__test_simulate();
        Object.assign(st, { withdrawalMixEnabled: false });
        const selected = window.__test_simulate();
        window.__test_setOptimizerBudget(200000);
        const t0 = performance.now();
        const ref = window.__test_optimizeMultiLever(selected, { includeRoth: true, includeMix: true, includeSmooth: true });
        const secs = (performance.now() - t0) / 1000;
        window.__test_setOptimizerBudget(8000);
        return { solver: cost(solver), solverEnd: solver.rows.at(-1).total, ref: ref.cost, refEvals: ref.evalCount, refBudget: ref.budgetExhausted, secs };
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patch);
    const gap = ((out.solver / out.ref - 1) * 100).toFixed(2);
    console.log(`${c.name}: solver ${Math.round(out.solver)} vs reference ${Math.round(out.ref)} (gap ${gap}%, reference ${out.refEvals} evals, ${out.secs.toFixed(0)} s${out.refBudget ? ', budget hit' : ''})`);
  }
  await browser.close();
})();
```

Run: `node tests/solver_gap.js` (it can take minutes). Record the table. A positive gap means the solver costs more than the reference; this is the Batch 5 starting point, not a gate. If `__test_rothScheduleCost` is not exposed, add `window.__test_rothScheduleCost = rothScheduleCost;` beside the other optimizer hooks.

- [ ] **Step 4: Rates, optimizer re-run, docs**

Run: `node tests/historical_rates.js > ../3c-rates-after.txt` and compare with `../3c-rates-before.txt`.
Run: `node test_multi_lever_optimizer.js` and record whether the optimizer's schedules still beat the tax-aware solver on the default and an ACA scenario (the spec's "re-run the optimizer once" note).

`docs/next-batches-plan.md`:
- Execution order line and its "Why" paragraph: Rule of 55 PR -> 3C -> 5 -> 4A -> 4B -> 6 -> 8, with the owner's reason (Canada ports the solver and the search together).
- Rewrite the 3C section to point at the spec and summarize what shipped; rewrite the Batch 5 section (outer search over `m`, per-phase Apply refinement always applicable with both success rates, objective registry, retiring coordinate ascent and age-keyed schedules, the gap script as a guard), and the 4A/4B sections (solver core to `shared/`, Canada kinks and lambda inputs, TFSA, pension splitting before scoring; 4A and 4B may merge).
- "Batch 3C notes" (replace "exploration so far" with finished reference text): the decisions list from the spec; the two-return MAGI fix and its before/after; the guard's mechanism and the sweep table; the tax-aware before/after; the gap table; the timing table; the rates before/after; the optimizer re-run result; the Batch 1 open item closed (the MAGI room now has a behavioral test with a mutation check: `tests/cliff_guard.js` case 1); the double-counted room finding (the cap uses the target, not `incomeRoom`); the B5 conversion finding and the owner decision from spec section 13 (the five scenarios that depleted earlier, the two causes, and the two design notes); the second finding and decision from section 13.1 (36 of 768 households depleting earlier with the order choice; Note 1 built in 3C as B5a, with its before/after and the re-run scan); the third from section 13.2 (the two-return IRMAA bug in the estimate, samples priced on the walk's own draws and clamped to the year the pool runs out, lumps left out of the need; B5b's before/after and the re-run scan); Note 2 copied into the Batch 5 section as a requirement for tax-aware conversion sizing.
- Open items: add "IRMAA priced undiscounted in the year that causes it (two-year lag, possible death before it is charged)" and "State-law cliffs are not solver candidates (priced by taxFor only)"; mark the Batch 1 safe-MAGI test item resolved (the conservative conversion deduction item stays open: conversion sizing moved to Batch 5); record the decision that `pickLiveWithdrawalOrder` is no longer used by the engine.
- Cliffs register: note that 3C reads it through `magiThresholds` and which rows are candidates.

`docs/batch-3c-prototype/README.md`: one line at the top: "Superseded by Batch 3C (see the spec and the 3C notes); kept for the record."
`CLAUDE.md` Files list: `tests/solver_scan.js`, `tests/solver_gap.js`, `tests/bench_solver.js` (not in `npm test`, what each prints).

- [ ] **Step 5: Final verification and commit**

Run: `npm test` (green), `npm run check:shared` (green), every new root/`tests` script from this plan once more, and a 390x844 load with no horizontal overflow.

```bash
git add Planner_US.html CLAUDE.md docs/ tests/bench_solver.js tests/solver_scan.js tests/solver_gap.js
git commit -m "3C notes: sweep, gap table, timing and rates; plan order 3C -> 5 -> 4A -> 4B; backlog items

No number change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
