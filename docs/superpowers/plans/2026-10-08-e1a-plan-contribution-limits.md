# E1a: employer-plan contribution limits and profit sharing (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit each partner's employer-plan contributions the way the law does (catch-ups outside the 415(c) limit,
the 401(a)(17) compensation limit, one annual-additions room filled in plan order), add employer profit sharing, and
make the income inputs typed fields with no $350,000 cap.

**Architecture:** Limits move into a pure-literal table `PLAN_LIMITS`; a pure, country-neutral `allocatePlanRoom`
fills a room in order (shared-ready for Canada, E1-CA); the US `retirementContributions` computes the room and the
requests, calls the allocator and returns the limited match and profit sharing, which the year loop adds to the
traditional 401(k) as it adds the match today. US only.

**Tech Stack:** `Planner_US.html` (one inline `<script>` IIFE, no build), Node + Playwright tests (`tests/*.js`,
`test_*.js`).

**Spec:** `docs/superpowers/specs/2026-10-08-e1a-plan-contribution-limits-design.md` (read it first; this plan argues
from it). Background: `CLAUDE.md` ("Retirement accounts (US)", "Money-field formatting", the field registry `FIELDS`,
"Testing checklist").

## Global Constraints

- Worktrees: `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-e1a -b claude/e1a-contribution-limits PLAN_COMMIT`
  (PLAN_COMMIT = the commit that adds this plan; its code is `4df6e02`'s), baseline
  `git -C C:\Users\Alex\code\Fire-Planner worktree add --detach ../fp-e1a-base 4df6e02`. `npm install` in each if
  `node_modules` is missing.
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and
  stashes). Never push, open a PR or merge.
- US only: no change to `Planner_Canada.html` and no change to any `@@shared` region; `npm run check:shared` passes after
  every task. Windows CRLF: never run `npm run sync`.
- `npm test` green at every commit. Snapshots (`tests/snapshots/us.json`, `canada.json`) identical to `4df6e02` after
  Tasks 1 and 2; Task 3 is the only intended number change. UI snapshot (`ui_us.json`) and legacy corpus
  (`legacy_state.json`) updates are allowed only where a task says so, and the commit message says so.
- **Number rule (Task 3):** every mover must fall in the spec's groups (a) catch-up, (b) compensation limit, (c) match
  cut to the room. A mover outside them: stop and report. A standard scenario that runs out earlier: stop and report
  (scenario, ages, the employer money removed); the owner decides.
- No heuristic, gate or threshold the spec does not name.
- Timing (Task 3): `node tests/bench_runs_interleaved.js --base ../fp-e1a-base --rounds 21` and
  `node tests/bench_solver.js --base ../fp-e1a-base`, at most +5% per path; report both tables.
- Each commit: only your paths, `git commit -m "..." -- <paths>` (`git add` new files first), message ending
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-08-e1a/` inside the worktree (git-excluded).
- Shell: never put Markdown backticks inside a double-quoted shell string.

## Review Focus

1. **A wizard or MCP income above $350,000** must survive a reload and a sidebar edit of another field (the field no
   longer clamps it). Task 1, Step 1.
2. **A retired partner, and B in single-person mode,** get no match, no profit sharing and no mega backdoor, even with
   percentages entered. Task 3, Step 1 (cases `retired`, `single`).
3. **Junk saved values for the new keys** (`profitSharingPctA: 'x'`, `-5`, `400`) normalize to 0 / 0 / 25 and never reach
   the engine as `NaN`. Task 3, Step 1 (legacy corpus cases) and Step 3 (`normalizeState` clamp).
4. **Employer money is untaxed now:** a profit-sharing percentage must not change that year's `tax`, `wages`,
   `magiProxy` or payroll tax. Task 3, Step 1 (engine case).
5. **Historical / Monte Carlo runs** use the path's own `limitFactor` (`cumFactor`); the limits must scale with it there
   too. Covered by the indexing case (the function takes `limitFactor` as given) plus the snapshot's historical
   scenarios; no extra test.

---

### Task 1: Income inputs become money fields (no number change)

**Files:**
- Modify: `Planner_US.html` (markup `#incomeA` ~line 357 and `#incomeB` ~line 358; `FIELDS` entries ~line 1145-1146)
- Modify: `test_info_tips.js` (~lines 68-73: it uses `#incomeA` as "a slider with an info tip")
- Create: `test_contribution_limits.js`
- Update (allowed): `tests/snapshots/ui_us.json`

**Interfaces:**
- Produces: `#incomeA` / `#incomeB` as `<input type="number" class="money" min="0" step="1000">` inside a `.field`;
  `FIELDS` entries `{ key: 'incomeA', type: 'number' }`, `{ key: 'incomeB', type: 'number' }`.

- [ ] **Step 1: Write the failing UI check** `test_contribution_limits.js` (repo root; Playwright; same boilerplate as
  `tests/irmaa_magi.js`: launch, `page.on('pageerror')`, `goto file://.../Planner_US.html`, `waitForTimeout(200)`):
  - type into Partner A income: `await page.fill('#incomeA', '500000'); await page.dispatchEvent('#incomeA', 'input');`
    then `state.incomeA === 500000` (`window.__test_getState()`), and `window.fireProjectionRows[0].wages` is larger than
    with `incomeA` 100000 (set the same way first and record it);
  - reload the page (the autosave keeps state): `state.incomeA === 500000` and `#incomeA` shows `$500,000`;
  - set `state.incomeA = 600000` via `page.evaluate(() => { const s = window.__test_getState(); s.incomeA = 600000; })`,
    then edit another field (`#spending` to 70000 via fill + input event): `state.incomeA` is still 600000;
  - at 390 x 844 (`page.setViewportSize`), `document.documentElement.scrollWidth > clientWidth` is `false`;
  - no page errors; print `test_contribution_limits: part 1 passed`.
  Leave a marked place for Task 3's part 2 (`// Part 2 (Task 3): profit sharing`).
- [ ] **Step 2: Run it; it fails.** `node test_contribution_limits.js`: the range input caps the value at 350,000.
- [ ] **Step 3: Change the markup** of both income controls. Keep the label text, the `info-tip` button, its `data-tip`
  and the `<small>` descriptor verbatim; replace the `.range-field` / `.range-head` wrapper and `range-value` span with
  the `.field` pattern used by `#spending` (~line 384):
  `<div class="field"><label for="incomeA">…same label content…</label><input id="incomeA" type="number" class="money" min="0" step="1000"></div>`
  (Partner B's keeps `data-partner-b` on the wrapper). The money conversion (`attachMoneyPreview`) and the `FIELDS`
  input listener's digit stripping (~line 14290) apply to every `.money` input automatically.
- [ ] **Step 4: `FIELDS`.** `{ key: 'incomeA', type: 'number' }` and `{ key: 'incomeB', type: 'number' }` (drop `out`,
  `outSync`, `resync`). Grep `incomeAOut` / `incomeBOut` in `Planner_US.html` and tests: no other reference may remain.
- [ ] **Step 5: `test_info_tips.js`.** Section 3 needs a slider whose label has an info tip. Point it at
  `label[for="megaPctA"] .info-tip` / `#megaPctA` if that range is visible at that point of the test (it is gated by
  `megaBackdoor`; turn it on first with the checkbox if needed), otherwise at the first `.range-field` whose label holds an
  `.info-tip` (query it in the page). Keep the assertions as they are.
- [ ] **Step 6: Run.** `node test_contribution_limits.js` passes; `node test_info_tips.js` passes; `npm test`: only
  `tests/snapshot_ui.js` fails, on the income controls (state round trip / rendered text). Read its diff and confirm it is
  only the two income controls, then `node tests/snapshot_ui.js --update`; restore `tests/snapshots/ui_canada.json` if it
  was rewritten with no content change (`git checkout -- tests/snapshots/ui_canada.json`). `npm test` green; `us.json` and
  `canada.json` untouched.
- [ ] **Step 7: Commit.**
```bash
git add test_contribution_limits.js
git commit -m "E1a 1: Partner A/B income as money fields (no 350,000 cap; UI snapshot updated for the two controls; no number change)" -- Planner_US.html test_info_tips.js test_contribution_limits.js tests/snapshots/ui_us.json
```

---

### Task 2: `PLAN_LIMITS`, `allocatePlanRoom`, test hooks, tests of today's math (no number change)

**Files:**
- Modify: `Planner_US.html` (just above `retirementContributions` ~line 8073; its body ~8078-8160; US-only test hooks
  after `// @@shared:block end` ~line 16060)
- Create: `tests/contribution_limits.js`
- Modify: `package.json` (`test` script: add `node tests/contribution_limits.js` right after `node tests/account_inputs.js`)

**Interfaces:**
- Produces:
  - `const PLAN_LIMITS = { deferral, catchUp50, catchUp60to63, annualAdditions, compensation, rothCatchUpWages, ira, iraCatchUp }` (numbers, 2026 dollars).
  - `function allocatePlanRoom(room, amounts, out)` → number (room left); writes `out[i]`.
  - `window.__test_allocatePlanRoom = (room, amounts) => { const out = []; const left = allocatePlanRoom(room, amounts, out); return { out, left }; }`
  - `window.__test_retirementContributions = (patch, args) => { … }`: copies `state`, `Object.assign(state, patch)`,
    returns `retirementContributions(args)`, restores `state` in `finally` (delete every key, then assign the copy back,
    as `tests/irmaa_magi.js` does with `__test_getState()`).

- [ ] **Step 1: Write `tests/contribution_limits.js`** (boilerplate as `tests/irmaa_magi.js`; clock pinned to
  2026-06-15). A helper `rc(patch, args)` calls `window.__test_retirementContributions(patch, { wageB: 0, ageB: null, singlePerson: true, limitFactor: 1, matchA: 0, matchB: 0, ...args })`.
  Base patch `P0 = { k401Type: 'traditional', iraType: 'roth', k401PctA: 100, catchupPctA: 100, iraPctA: 0, megaBackdoor: true, megaPctA: 100, matchA: 0 }`.
  Cases that hold on TODAY's math (`acct.trad[1]` is 401(k) A traditional, `acct.roth[1]` 401(k) A Roth):
  - under 50, no catch-up: `rc(P0, { wageA: 200000, age: 40 })` → `acct.trad[1] === 24500`, `acct.roth[1] === 47500`;
  - indexing: same at `limitFactor: 1.1` → `acct.trad[1]` within 1e-9 of 26950, `acct.roth[1]` of 52250;
  - IRA: `rc({ ...P0, iraPctA: 100, megaBackdoor: false }, { wageA: 200000, age: 55 })` → `acct.roth[0] === 8600`;
    at 40 → 7500;
  - pay below the deferral limit: `rc({ ...P0, megaBackdoor: false }, { wageA: 20000, age: 40 })` → `acct.trad[1] === 20000`;
  - allocator: `__test_allocatePlanRoom(100, [30, 50, 40])` → `out` `[30, 50, 20]`, `left` 0;
    `(100, [30, 20])` → `[30, 20]`, `left` 50; `(0, [10])` → `[0]`, `left` 0; `(-5, [10])` → `[0]`, `left` 0;
    negative request `(50, [-10, 20])` → `[0, 20]`, `left` 30;
  - Canada-shaped list (comment: an employer DPSP contribution and a group-RRSP match ahead of the employee's RRSP in one
    yearly room; nothing in the allocator is US-specific): `(33810, [10000, 5000, 25000])` → `[10000, 5000, 18810]`, left 0.
  End with `assert.deepStrictEqual(errors, [])` and `console.log('contribution_limits: all passed')`.
- [ ] **Step 2: Run; it fails** (`window.__test_retirementContributions is not a function`).
- [ ] **Step 3: Add the table and the allocator** just above the comment block of `retirementContributions`:
```js
  // IRS limits for employer plans and IRAs, 2026 values (IRS Notice 2025-67 and News Release IR-2025-111); every one is
  // indexed by limitFactor. Pure literals.
  const PLAN_LIMITS = {
    deferral: 24500, // IRC 402(g): elective deferrals
    catchUp50: 8000, // IRC 414(v): catch-up from age 50 (also 64 and over)
    catchUp60to63: 11250, // SECURE 2.0 section 109: the larger catch-up at ages 60 to 63
    annualAdditions: 72000, // IRC 415(c)(1)(A): all annual additions, also at most 100% of pay; catch-ups are outside it
    compensation: 360000, // IRC 401(a)(17): the most pay a percentage-of-pay contribution can count
    rothCatchUpWages: 150000, // SECURE 2.0 section 603: catch-ups must be Roth over this prior-year FICA wage
    ira: 7500, // IRC 219(b)(5)(A)
    iraCatchUp: 1100, // IRC 219(b)(5)(B), indexed since 2024
  };
  // Fills `room` with amounts[0], amounts[1], ... in that order: out[i] is what amounts[i] gets (a negative amount gets
  // 0). Returns the room left. Pure and country-neutral (no state, no US names): Canada's port moves it into a shared
  // fragment (E1-CA). The caller passes reusable arrays; this runs every projection year.
  function allocatePlanRoom(room, amounts, out) {
    let left = room > 0 ? room : 0;
    for (let i = 0; i < amounts.length; i++) {
      const want = amounts[i] > 0 ? amounts[i] : 0,
        got = want < left ? want : left;
      out[i] = got;
      left -= got;
    }
    return left;
  }
```
- [ ] **Step 4: Read the limits from the table** in `retirementContributions`, keeping every expression's arithmetic
  order (so every double is unchanged): `11250 * limitFactor` → `PLAN_LIMITS.catchUp60to63 * limitFactor`, `8000` →
  `PLAN_LIMITS.catchUp50`, `24500` → `PLAN_LIMITS.deferral`, `150000` → `PLAN_LIMITS.rothCatchUpWages`,
  `(7500 + (age >= 50 ? 1100 : 0)) * limitFactor` → `(PLAN_LIMITS.ira + (age >= 50 ? PLAN_LIMITS.iraCatchUp : 0)) * limitFactor`
  (and B's), `72000` → `PLAN_LIMITS.annualAdditions`. No literal limit stays in the body. Nothing else changes.
- [ ] **Step 5: Hooks** after `// @@shared:block end` (beside `window.__test_penalty`):
```js
  window.__test_allocatePlanRoom = (room, amounts) => {
    const out = [];
    const left = allocatePlanRoom(room, amounts, out);
    return { out, left };
  };
  window.__test_retirementContributions = (patch, args) => {
    const saved = JSON.parse(JSON.stringify(state));
    try {
      Object.assign(state, patch);
      return retirementContributions(args);
    } finally {
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, saved);
    }
  };
```
- [ ] **Step 6: Run.** `node tests/contribution_limits.js` passes; `npm test` green with `us.json`, `canada.json`,
  `ui_*.json` and `legacy_state.json` untouched.
- [ ] **Step 7: Commit.**
```bash
git add tests/contribution_limits.js
git commit -m "E1a 2: PLAN_LIMITS table, allocatePlanRoom (country-neutral), test hooks and tests of today's contribution math (no number change)" -- Planner_US.html tests/contribution_limits.js package.json
```

---

### Task 3: The limit math and profit sharing (V122; the intended number change)

**Files:**
- Modify: `Planner_US.html`: `retirementContributions` (~8078); the year loop (~9908-9921: `matchA`/`matchB`/`employerMatch`);
  `defaults` (~line 806, after `matchB`); `FIELDS` (after `matchB`, ~line 1148); `normalizeState` (~line 1314);
  `ESTIMATE_ALWAYS_IDS` (~line 1663); markup after `#matchA` (~363) and `#matchB` (~367); the match and mega-backdoor
  tooltips (~363, 367, 373, 374, and Partner B's mega slider); the badge (`V121` → `V122`, ~line 276)
- Modify: `tests/contribution_limits.js`, `tests/legacy_state.js`, `test_contribution_limits.js`
- Update (allowed, said in the commit): `tests/snapshots/us.json` (`npm run snapshot:update`), `tests/snapshots/ui_us.json`,
  `tests/snapshots/legacy_state.json`

**Interfaces:**
- Consumes: `PLAN_LIMITS`, `allocatePlanRoom`, `__test_retirementContributions` (Task 2).
- Produces: `retirementContributions({ wageA, wageB, age, ageB, singlePerson, limitFactor })` returning
  `{ traditionalContribA, traditionalContribB, traditionalContrib, rothContrib, acct, matchA, matchB, profitA, profitB, employerContrib }`
  (`employerContrib = matchA + matchB + profitA + profitB`); state keys `profitSharingPctA`, `profitSharingPctB` (numbers, 0-25).

- [ ] **Step 1: Write the failing cases** in `tests/contribution_limits.js` (after Task 2's; `rc` and `P0` as there; the
  `matchA`/`matchB` args are ignored after the fix). Comment each with its hand computation:
  - catch-up outside the limit (spec 2.1): `rc(P0, { wageA: 200000, age: 55 })`: deferral 24,500 (traditional); catch-up
    8,000, Roth because pay 200,000 > 150,000; room 72,000 − 24,500 = 47,500, all mega →
    `acct.trad[1] === 24500`, `acct.roth[1] === 55500` (today 47,500: room 72,000 − 32,500). At 61: catch-up 11,250 →
    `acct.roth[1] === 58750`.
  - compensation limit: `rc({ ...P0, k401PctA: 0, megaBackdoor: false, profitSharingPctA: 10 }, { wageA: 500000, age: 40 })`
    → `profitA === 36000`, `acct.trad[1] === 36000`; same with `matchA: 10, profitSharingPctA: 0` in the patch →
    `matchA === 36000`.
  - order: `rc({ ...P0, matchA: 6, profitSharingPctA: 25 }, { wageA: 300000, age: 40 })`: room 47,500; match 18,000;
    profit sharing min(75,000, 29,500) = 29,500; mega 0 → `matchA === 18000`, `profitA === 29500`, `acct.roth[1] === 0`,
    `acct.trad[1] === 72000`, `employerContrib === 47500`.
  - match cut to the room (100% of pay): `rc({ ...P0, megaBackdoor: false, matchA: 50 }, { wageA: 20000, age: 40 })`:
    deferral 20,000 fills pay, room 0 → `matchA === 0`, `acct.trad[1] === 20000`.
  - indexing: `rc({ ...P0, k401PctA: 0, megaBackdoor: false, profitSharingPctA: 10 }, { wageA: 1000000, age: 40, limitFactor: 1.1 })`
    → `profitA` within 1e-9 of 39,600.
  - retired: `rc({ ...P0, matchA: 6, profitSharingPctA: 10 }, { wageA: 0, age: 66 })` → `matchA`, `profitA`, `acct.roth[1]`,
    `acct.trad[1]` all 0.
  - single: `rc({ ...P0, matchB: 6, profitSharingPctB: 10, k401PctB: 100 }, { wageA: 100000, age: 40, wageB: 0, ageB: null, singlePerson: true })`
    → `matchB === 0`, `profitB === 0`, `acct.trad[3] === 0`, `acct.roth[3] === 0`.
  - engine (Review Focus 4): a working household (state patch: `singlePerson: true`, `ageA: 40`, `retireAgeA: 60`,
    `incomeA: 150000`, `bondYears: 0`, `profitSharingPctA: 0`); run `window.__test_simulate(60)` and
    `window.__test_accountTrace()`; then the same with `profitSharingPctA: 10`. Assert `rows[0].tax`, `rows[0].wages`,
    `rows[0].magiProxy` identical (`Object.is`), and year 0's `trace[0].trad[1]` (401(k) A) higher by 15,000 within 0.01,
    with `trace[0].trad[0]` (IRA A) identical. (Set the patch on `__test_getState()` and restore it after, as
    `tests/irmaa_magi.js` does.)
  - legacy corpus, in `tests/legacy_state.js` `US`: `'profit sharing junk': { profitSharingPctA: 'x', profitSharingPctB: 400 }`,
    `'profit sharing negative': { profitSharingPctA: -5 }`, `'income above the old slider cap': { incomeA: 500000 }`;
    and in `tests/contribution_limits.js` the exact values: load the page with each as the autosave (the
    `page.addInitScript` pattern of `tests/legacy_state.js`, storage key `fireCouplePlanner.massachusettsOffline.v1`,
    value `JSON.stringify({ state: raw, mode: 'real' })`) and assert `profitSharingPctA` 0 / 0, `profitSharingPctB` 25,
    `incomeA` 500000.
- [ ] **Step 2: Run; the new cases fail** (`node tests/contribution_limits.js`): record each failure (catch-up 47,500 vs
  55,500, profit sharing 0 vs 36,000, and so on) for the report.
- [ ] **Step 3: State, field and markup.**
  - `defaults`: `profitSharingPctA: 0, profitSharingPctB: 0,` after `matchB`.
  - `FIELDS`, after `matchB` (strictly 0 to 25 while typing: the `input` listener stores the number, then `onInput` runs):
```js
    { key: 'profitSharingPctA', type: 'number', onInput: () => clampProfitSharing('profitSharingPctA') },
    { key: 'profitSharingPctB', type: 'number', onInput: () => clampProfitSharing('profitSharingPctB') },
```
    with, beside `clampLifeExpectancyB` (just above `FIELDS`, outside the shared region):
```js
  // Employer profit sharing, % of pay, strictly 0 to 25; the box is rewritten only when the typed value was out of range.
  const clampProfitSharing = (key) => {
    const v = Math.min(25, Math.max(0, state[key]));
    if (v !== state[key]) {
      state[key] = v;
      document.getElementById(key).value = v;
    }
  };
```
  - `normalizeState`, after the `fiWithdrawalRate` line:
```js
    // Employer profit sharing, % of pay: 0 to 25 (the employer's deduction limit, and the usual ceiling for an owner).
    for (const k of ['profitSharingPctA', 'profitSharingPctB']) s[k] = Math.min(25, Math.max(0, Number(s[k]) || 0));
```
  - `ESTIMATE_ALWAYS_IDS`: add `'profitSharingPctA', 'profitSharingPctB'` after `'matchA', 'matchB'`.
  - Markup, right after the `#matchA` field (and the same for B after `#matchB`, with `data-partner-b` on the wrapper and
    "Partner B"):
```html
          <div class="field"><label for="profitSharingPctA">Partner A employer profit <span class="info-nw">sharing<button type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="An employer contribution as a percentage of your pay, added to your traditional (pre-tax) 401(k). Only pay up to the IRS compensation limit counts ($360,000 in 2026, rising with inflation). It shares the plan&#x27;s total annual limit ($72,000 in 2026; catch-up contributions are outside it) with your own 401(k) contributions, the match and any after-tax money, and is reduced when they would exceed it. 25% is the most an employer can deduct across its payroll, and the usual ceiling when you own the company. To estimate it, divide last year&#x27;s employer profit-sharing (nonelective) contribution on your 401(k) statement by that year&#x27;s pay; if it varies, use a typical year. If you own the company, it is your choice.">i</button></span><small>Employer contribution to the traditional 401(k)</small></label><input id="profitSharingPctA" type="number" min="0" max="25" step="0.5"></div>
```
  - Match tooltip (A and B): append " Only pay up to the IRS compensation limit counts ($360,000 in 2026, rising with
    inflation), and the match shares the plan&#x27;s total annual limit ($72,000 in 2026) with your own contributions,
    profit sharing and after-tax money."
  - Mega-backdoor checkbox tooltip and the two `megaPct` slider tooltips: "the room left under the plan's total annual
    contribution limit after your 401(k) contribution and employer match" becomes "the room left under the plan's total
    annual limit ($72,000 in 2026, and never more than your pay) after your own 401(k) contribution (catch-up
    contributions do not use it), the employer match and profit sharing". Keep the rest verbatim; HTML-escape the
    apostrophes as the file does (`&#x27;`).
  - Badge `V121` → `V122`.
- [ ] **Step 4: The math.** Replace `retirementContributions` with the version below (the deferral, catch-up, Roth
  catch-up and IRA lines are Task 2's, unchanged; only the employer and mega part and the return change):
```js
  const PLAN_REQ = [0, 0],
    PLAN_GOT = [0, 0]; // allocatePlanRoom scratch: [match, profit sharing]
  function retirementContributions({ wageA, wageB, age, ageB, singlePerson, limitFactor }) {
    // ... Task 2's lines, unchanged, from `const catchupBaseA =` through `const traditionalContrib = ...` ...
    // The annual-additions room (IRC 415(c)): the lesser of the limit and 100% of pay, less the deferrals; catch-ups are
    // outside it. A plan in operation fills it in this order: deferrals as elected, the match, profit sharing, then
    // after-tax (mega backdoor) money. A percentage-of-pay contribution counts pay only up to the compensation limit.
    const annualAdditionLimit = PLAN_LIMITS.annualAdditions * limitFactor,
      compLimit = PLAN_LIMITS.compensation * limitFactor;
    const compA = Math.min(wageA, compLimit),
      compB = Math.min(wageB, compLimit);
    PLAN_REQ[0] = compA * pct(state.matchA);
    PLAN_REQ[1] = compA * pct(state.profitSharingPctA);
    const leftA = allocatePlanRoom(Math.min(wageA, annualAdditionLimit) - kBaseA, PLAN_REQ, PLAN_GOT);
    const matchA = PLAN_GOT[0],
      profitA = PLAN_GOT[1];
    PLAN_REQ[0] = compB * pct(state.matchB);
    PLAN_REQ[1] = compB * pct(state.profitSharingPctB);
    const leftB = allocatePlanRoom(Math.min(wageB, annualAdditionLimit) - kBaseB, PLAN_REQ, PLAN_GOT);
    const matchB = PLAN_GOT[0],
      profitB = PLAN_GOT[1];
    const megaA = state.megaBackdoor ? leftA * pct(state.megaPctA) : 0,
      megaB = state.megaBackdoor ? leftB * pct(state.megaPctB) : 0;
    // ... rothContribA / rothContribB / rothContrib unchanged ...
    // acct: as today, with the employer money (match and profit sharing) in each partner's traditional 401(k):
    //   trad[1]: ... + matchA + profitA      trad[3]: ... + matchB + profitB
    return {
      traditionalContribA, traditionalContribB, traditionalContrib, rothContrib, acct,
      matchA, matchB, profitA, profitB, employerContrib: matchA + matchB + profitA + profitB,
    };
  }
```
  Remove the old `megaRoomA` / `megaRoomB` expressions and the `matchA, matchB` parameters. Update the comment above the
  function (limits from `PLAN_LIMITS`; the room and its order). `wageB` is already 0 for B in single-person mode and for
  a retired partner, so every pay-based amount is 0 there.
- [ ] **Step 5: The year loop** (~9908): delete the `matchA`, `matchB` and `employerMatch` lines from the wage `const`
  statement; call `retirementContributions({ wageA, wageB, age, ageB, singlePerson, limitFactor })` and destructure
  `employerContrib: employerMatch` with the other returns, so every later use of `employerMatch` (`routeSurplus`,
  `bal.traditional += traditionalContrib + employerMatch`) is unchanged. Grep `matchA` / `matchB` in the loop: no other
  use may remain.
- [ ] **Step 6: Part 2 of `test_contribution_limits.js`**: set `#profitSharingPctA` to 10 (fill + input event) with
  Partner A working: `state.profitSharingPctA === 10` and `window.fireProjectionRows` at the last working age has a larger
  `traditional` than at 0; partner B's field is hidden in single-person mode (`#profitSharingPctB` not visible after
  ticking single-person); typing 40 into `#profitSharingPctA` gives `state.profitSharingPctA === 25` and the box shows 25,
  typing -3 gives 0; no horizontal scroll at 390 x 844 with the new fields; no page errors.
- [ ] **Step 7: Run the unit tests.** `node tests/contribution_limits.js` and `node test_contribution_limits.js` pass.
- [ ] **Step 8: Movers.** In the worktree:
  `node tests/snapshot.js --root ../fp-e1a-base --dump A --update-nothing`, `node tests/snapshot.js --dump B`,
  `node tests/snapshot.js --compare A B`. Classify every mover into (a) catch-up, (b) compensation limit, (c) match cut to
  the room (expected: `default megaBackdoor+match`, which enters `matchA: 5000, matchB: 3000`, i.e. 50x and 30x pay),
  by the first year that differs and which contribution changed there (add `__test_retirementContributions` output for
  that year if needed). Table: group, count (standard / historical), largest end-total change, depletion ages before
  and after. **Stop and report** on any mover outside (a)-(c) or any standard scenario that runs out earlier.
- [ ] **Step 9: Legacy corpus.** `node tests/legacy_state.js` fails on every US case (two new keys in every normalized
  state) and the three new cases. Prove the only difference is the new keys: a scratch script (not committed) that loads
  each US case on both trees (`LEGACY_ROOT` pattern) and compares the normalized states with `profitSharingPctA` /
  `profitSharingPctB` deleted: every pre-existing case equal. Then `node tests/legacy_state.js --update`.
- [ ] **Step 10: Snapshots and the full suite.** `npm run snapshot:update`; `node tests/snapshot_ui.js --update` (the new
  controls and the MCP schema's two new properties; confirm the diff is only those and the tooltip text); restore
  `ui_canada.json` / `canada.json` if rewritten with no content change. `npm test` green.
- [ ] **Step 11: Timing** per the Global Constraints (21 rounds; record both tables).
- [ ] **Step 12: Commit.**
```bash
git commit -m "E1a 3: contribution limits (catch-ups outside 415(c), the 401(a)(17) compensation limit, one room in plan order) and employer profit sharing (V122; snapshot:update: movers (a) catch-up, (b) compensation limit, (c) match cut to the room; UI and legacy snapshots for the two new fields)" -- Planner_US.html tests/contribution_limits.js tests/legacy_state.js test_contribution_limits.js tests/snapshots/us.json tests/snapshots/ui_us.json tests/snapshots/legacy_state.json
```

---

### Task 4: Docs and notes

**Files:** `README.md`, `CLAUDE.md`, `docs/next-batches-plan.md`, `tests/cliff_plan.js` (one comment)

- [ ] **Step 1: README.** In the feature list's contributions entry: Partner income is typed (no cap); employer profit
  sharing per partner; contributions follow the IRS limits (the $72,000 annual limit with catch-ups outside it, the
  $360,000 compensation limit, filled in the order deferrals, match, profit sharing, after-tax).
- [ ] **Step 2: `CLAUDE.md`**, "Retirement accounts (US)": one paragraph: `PLAN_LIMITS` (2026 values, indexed by
  `limitFactor`), `allocatePlanRoom(room, amounts, out)` (pure, country-neutral, moves to `shared/` at E1-CA),
  `retirementContributions` returning the limited `matchA/B`, `profitA/B` and `employerContrib` (the loop's
  `employerMatch`), the order, `profitSharingPctA/B` (0-25, `normalizeState` clamp), income as money fields;
  `tests/contribution_limits.js`. Add `tests/contribution_limits.js` to the Files list next to `tests/account_inputs.js`.
- [ ] **Step 3: Notes.** In `docs/next-batches-plan.md`, under "Batch E: life events", replace the E1 bullet's heading
  line with a pointer: "E1 is split (owner, 2026-10-08) into E1a (contribution limits and profit sharing; spec
  `docs/superpowers/specs/2026-10-08-e1a-plan-contribution-limits-design.md`), E1b (stream owner and W-2 kind), E1c (full
  self-employment, main income and streams), E1d (one-time income treatments), and E1-CA (the Canada port, later, near the
  province move); see the E1a spec section 1." Keep the existing E1 text below it as the source for E1b to E1d. Then add
  "##### E1a: implementation" at the end of the Batch E section: commits, the failing-then-passing cases (Step 2's
  failures), the movers table, the legacy proof, the timing tables, anything for the owner.
- [ ] **Step 4: The carried comment.** In `tests/cliff_plan.js`, the comment above the "Review follow-up 3 invariant"
  block: replace "Every std G household, plus the plan refreshCliffPlan stores for each." with "Every std G household's
  `choose` intents." No code change.
- [ ] **Step 5: Run** `npm test` (green, nothing moved). **Commit.**
```bash
git commit -m "E1a 4: README, CLAUDE.md, notes (E1 split; E1a implementation), cliff_plan comment" -- README.md CLAUDE.md docs/next-batches-plan.md tests/cliff_plan.js
```
  Report: branch tip and commits, the failing-then-passing table, the movers table, the legacy proof, timing, open
  questions.

---

### Task 5: Review fixes (owner decisions, 2026-10-08, after the Task 1-4 review at `9ba26fc`)

The reviewer re-checked `9ba26fc` (`npm test` exits 0; the one mover `default megaBackdoor+match`, never depleting; the
UI snapshot's DOM hashes all change because the sidebar gained two fields; code as planned). Owner decisions:
1. **Employee money never exceeds pay.** Two rules bind a partner's contributions: the annual-additions limit
   (deferral + match + profit sharing + after-tax <= min(limit, pay); catch-ups outside), which Task 3 enforces, and the
   employee's own money (deferral + catch-up + after-tax) coming out of pay, so at most pay (IRC 414(v)(2) also limits the
   catch-up to pay less the other deferrals). Task 3 enforces only the first: at 55 on $40,000 the employee puts in
   24,500 + 8,000 + 15,500 = $48,000. Fix: cap the mega backdoor at pay less deferral and catch-up.
2. **Three snapshot scenarios** so groups (a), (b) and the cap have engine-level coverage (today only unit tests).
3. **MCP keeps profit sharing strictly 0 to 25**: `mcpAccepts` (US-only, ~line 1312, outside every shared region)
   rejects a number outside a field's `min` / `max`. The MCP `execute` (inside shared region `29-dismissFirstRunBanner`)
   is not touched.
4. Recorded, no change: the match has no clamp, now harmless (the engine limits any match to the room); the UI
   snapshot's `histSuccess` text is timing-flaky (the committed dash is the stable value); the E1 pointer's placement in
   the notes stays.

**Files:** `Planner_US.html` (`retirementContributions` mega lines; `FIELDS` profit-sharing entries; `mcpAccepts`),
`tests/contribution_limits.js`, `tests/snapshot_scenarios.js`, `tests/snapshots/us.json` (new entries only),
`tests/snapshots/ui_us.json` only if the MCP schema records `min` / `max` (it should not: the schema is built from the
key list), `CLAUDE.md`, `docs/next-batches-plan.md`.

**Interfaces:** `retirementContributions` unchanged in signature and return; `FIELDS` entries gain optional `min` / `max`
(numbers) read only by `mcpAccepts`.

- [ ] **Step 1: Failing tests** in `tests/contribution_limits.js` (hand computation in a comment):
  - pay cap: `rc(P0, { wageA: 40000, age: 55 })`: deferral 24,500 (traditional); catch-up min(40,000 - 24,500, 8,000) =
    8,000 (traditional: pay under 150,000); room 40,000 - 24,500 = 15,500; employee money left 40,000 - 24,500 - 8,000 =
    7,500 -> mega 7,500: `acct.trad[1] === 32500`, `acct.roth[1] === 7500` (today 15,500).
  - pay cap with a match: `rc({ ...P0, matchA: 10 }, { wageA: 40000, age: 55 })`: match 4,000 (room 15,500 -> 11,500 left);
    mega min(11,500, 7,500) = 7,500: `matchA === 4000`, `acct.roth[1] === 7500`, `acct.trad[1] === 36500`.
  - the cap does not bind when the room is smaller: `rc({ ...P0, matchA: 30 }, { wageA: 40000, age: 55 })`: match 12,000
    (room 15,500 -> 3,500); mega min(3,500, 7,500) = 3,500: `acct.roth[1] === 3500`.
  - unchanged above it: the Task 3 catch-up cases (200,000 at 55 and 61) still give 55,500 and 58,750.
  - MCP bounds: through `document.modelContext` if the test page registers the tool, else a hook
    `window.__test_mcpAccepts = (key, v) => mcpAccepts(FIELDS.find((f) => f.key === key), v)`: `('profitSharingPctA', 26)`
    false, `(…, -1)` false, `(…, 25)` true, `(…, 0)` true, `('matchA', 5000)` true (no bounds on the match).
  Run: they fail (mega 15,500; no hook or `true` for 26).
- [ ] **Step 2: The cap.** In `retirementContributions`, the employee's own deferral and catch-up are already `kA` / `kB`
  (Task 2's constants, unused since Task 3). Replace the mega lines with:
```js
    // After-tax money is the employee's own, like the deferral and catch-up, so it comes out of pay: at most the pay left
    // after them (the room above already keeps annual additions within 100% of pay; catch-ups sit outside that room).
    const megaA = state.megaBackdoor ? Math.min(leftA, Math.max(0, wageA - kA)) * pct(state.megaPctA) : 0,
      megaB = state.megaBackdoor ? Math.min(leftB, Math.max(0, wageB - kB)) * pct(state.megaPctB) : 0;
```
- [ ] **Step 3: MCP bounds.** The two profit-sharing `FIELDS` entries get `min: 0, max: 25`. `mcpAccepts`:
```js
  const mcpAccepts = (field, v) =>
    field.type === 'number'
      ? Number.isFinite(v) && (field.min === undefined || v >= field.min) && (field.max === undefined || v <= field.max)
      : field.type === 'bool'
        ? typeof v === 'boolean'
        : field.values.includes(v);
```
  Add `window.__test_mcpAccepts` (Step 1) beside the other US-only hooks if the test needs it. Confirm
  `tests/field_registry.js` accepts the new optional keys (extend its allowed-option list if it checks one).
- [ ] **Step 4: Snapshot scenarios.** In `tests/snapshot_scenarios.js`, `usStd()`, right after
  `'default megaBackdoor+match'`:
```js
    ['default megaBackdoor 50+', { ...D, megaBackdoor: true, ageA: 52, ageB: 51, retireAgeA: 60, retireAgeB: 60 }],
    ['default pay over comp limit+match', { ...D, incomeA: 500000, matchA: 6, profitSharingPctA: 10 }],
    ['default low pay 55 megaBackdoor', { ...D, singlePerson: true, ageA: 55, retireAgeA: 62, incomeA: 40000, megaBackdoor: true }],
```
- [ ] **Step 5: Run.** `node tests/contribution_limits.js` passes. `node tests/snapshot.js` fails only on the new
  scenarios being absent. Check against `4df6e02`'s tree is not possible for new names, so: run
  `node tests/snapshot.js --root ../fp-e1a-base --dump A --update-nothing` and `--dump B` on this tree, `--compare A B`:
  every scenario present in both is identical except `default megaBackdoor+match` as already accepted (the cap must move
  no existing scenario; if one moves, stop and report). Then `npm run snapshot:update` and confirm with
  `git diff tests/snapshots/us.json` that only the new entries were added. `npm test` green; restore `canada.json` /
  `ui_canada.json` if rewritten with no content change.
- [ ] **Step 6: Timing** as in the Global Constraints (`bench_runs_interleaved.js` 21 rounds; `bench_solver.js` with
  `--rounds 21`, since its default 7 rounds proved too noisy in Task 3).
- [ ] **Step 7: Docs.** `CLAUDE.md` ("Retirement accounts (US)" E1a paragraph): the after-tax money is capped at pay less
  deferral and catch-up; `FIELDS` `min` / `max` bound MCP input. `docs/next-batches-plan.md`, "E1a: implementation": a
  "Review fixes" paragraph with these decisions, the new cases, the snapshot result and timing.
- [ ] **Step 8: Commit.**
```bash
git commit -m "E1a 5: after-tax (mega backdoor) money capped at pay less deferral and catch-up; MCP bounds for profit sharing; three snapshot scenarios (new entries only; no existing number change)" -- Planner_US.html tests/contribution_limits.js tests/snapshot_scenarios.js tests/snapshots/us.json CLAUDE.md docs/next-batches-plan.md
```
  Report: the commit, the failing-then-passing cases, the compare result, timing, open questions.
