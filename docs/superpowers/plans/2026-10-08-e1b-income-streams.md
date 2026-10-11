# E1b: income stream owner, W-2 kind and stream contributions (US); salary stops at death (both) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each income stream an owner (Partner A / B) and a kind (not earned / W-2 wages), let a W-2 stream pay
payroll tax, count as earned income, land on its owner's return and fund that owner's 401(k) and IRA; and stop a
deceased partner's salary at death in both planners.

**Architecture:** One pure function, `streamAmountsForYear`, splits the active streams into per-owner, per-kind sums
(plus the household total that stays the cash figure, bit-identical). `buildTaxProfile`, `taxFor` and `payrollTax`
read the split; a second pure function, `streamPlanContributions`, fills the contributing streams' deferrals, match,
after-tax money and IRA after the salary, against per-person and per-employer rooms. The death fix clamps the
deceased's effective retirement age to the death age at the top of each `runProjection`.

**Tech Stack:** `Planner_US.html`, `Planner_Canada.html` (one inline `<script>` IIFE each, no build), `shared/*.js`
fragments synced by `scripts/sync-shared.js`, Node + Playwright tests (`tests/*.js`, `test_*.js`).

**Spec:** `docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md` (read it first; this plan argues from it).
Background: `CLAUDE.md` ("Shared code between the planners", "Add-as-you-go lists", "Retirement accounts (US)",
"Contribution limits and profit sharing (US, E1a)", "Testing checklist"), and the E1a plan
`docs/superpowers/plans/2026-10-08-e1a-plan-contribution-limits.md` for the test-file boilerplate.

## Global Constraints

- Worktrees: `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-e1b -b claude/e1b-income-streams PLAN_COMMIT`
  (PLAN_COMMIT = the commit that adds this plan; its code is `71451fd`'s), baseline
  `git -C C:\Users\Alex\code\Fire-Planner worktree add --detach ../fp-e1b-base 71451fd`. `npm install` in each if
  `node_modules` is missing.
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and
  stashes). Never push, open a PR or merge.
- **Canada:** only Task 1 (the death fix) and Task 2's synced `23-dynFieldHtml` region touch `Planner_Canada.html`.
- **Shared regions:** only `23-dynFieldHtml` changes (Task 2). Edit `shared/23-dynFieldHtml.js`, run `npm run sync`, then
  convert both planners back to CRLF:
  `node -e "for (const f of ['Planner_US.html','Planner_Canada.html']) { const fs=require('fs'); fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')); }"`
  then `npm run check:shared` must print OK. Never run `npm run sync` in any other task.
- `npm test` green at every commit.
- **Snapshots:** `tests/snapshots/us.json` and `canada.json`: Task 1 is the only commit that changes an existing entry.
  Tasks 3 and 4 add new entries only; every existing entry stays byte-identical (prove it: `git diff` of the json shows
  only added lines, or a dump/compare against the base shows no existing scenario differs). UI snapshot
  (`ui_us.json`) and legacy corpus (`legacy_state.json`) change only where a task says so, and the commit message says so.
- **Number rule (Task 1):** expected mover `std R work past 65 survivor` (US) and its historical runs. Any other mover:
  list it with the reason in the report (it must be a scenario where a partner dies before their retirement age). A
  standard scenario that runs out earlier: stop and report (scenario, ages, the salary removed); the owner decides.
- No heuristic, gate or threshold the spec does not name.
- **Timing** (Tasks 1 and 4): `node tests/bench_runs_interleaved.js --base ../fp-e1b-base --rounds 21` (at most +5% per
  path) and `node tests/bench_solver.js --base ../fp-e1b-base --rounds 31` (recorded as measured; single runs sit on a
  0.05 ms timer grain). Report both tables verbatim.
- Each commit: only your paths, `git commit -m "..." -- <paths>` (`git add` new files first), message ending
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-08-e1b/` inside the worktree (git-excluded).
- Shell: never put Markdown backticks inside a double-quoted shell string; write text to a file and insert it with a
  small node script. The tree is CRLF.

## Review Focus

1. **Un-normalized stream objects** (tests and `tests/snapshot.js` assign `state.incomeSources` directly, bypassing
   `normalizeState`): a stream with no `owner` / `kind` must behave exactly as owner A, not earned, never as B or W-2.
   Task 3, Step 1 (case `missing keys`).
2. **A W-2 stream switched back to Not earned while `contribute` is still true** (the panel hides but the keys stay):
   no contribution may be made. Task 4, Step 1 (case `kind other ignores the panel`).
3. **The death year itself, and a death age at or below the current age:** the deceased's salary and W-2 streams are
   counted through the year before `deathYear` and are zero from `deathYear` on, including `deathYear <= 0` (no salary
   at all). Task 1, Step 1 (cases `death year`, `already dead`) and Task 3, Step 1 (case `survivor W-2`).
4. **Single-person mode with a stored owner B:** the stream counts for A, on A's age window, into A's accounts, and the
   owner select is hidden. Task 3, Step 1 (case `single with stored B`), Task 4, Step 1 (case `single stored B`), Task 2
   Step 1 (UI).
5. **The survivor owns a W-2 stream:** it continues after the partner's death (only the dead owner's W-2 stops). Task 3,
   Step 1 (case `survivor's own W-2`).

---

### Task 1: Salary stops at death (both planners; the number change)

**Files:**
- Modify: `Planner_US.html` (`runProjection` ~line 9944-9953: after `deathYear`, before `retirementYear`; badge line 276)
- Modify: `Planner_Canada.html` (`runProjection` ~line 5698-5707, same place; badge line 276)
- Create: `tests/survivor_salary.js`
- Modify: `package.json` (`test`: add `node tests/survivor_salary.js` right after `node tests/survivor_symmetry.js`)
- Modify: `tests/snapshot_scenarios.js` (one new Canada scenario)
- Update (allowed): `tests/snapshots/us.json`, `tests/snapshots/canada.json`

**Interfaces:**
- Produces: inside each `runProjection`, `retireAgeA` / `retireAgeB` are the effective retirement ages
  (`min(retirement age, survivorDeathAge)` for the partner who dies). Nothing else changes signature.

- [ ] **Step 1: Write `tests/survivor_salary.js`** (boilerplate as `tests/contribution_limits.js`: chromium, clock
  pinned 2026-06-15, `pageerror` collected, one page per planner). Per planner, set state through
  `window.__test_getState()` (assign the fields, then call `window.__test_simulate()`; for Canada use the same hooks if
  present, else `window.__test_simulateRaw`; check the names with a grep before writing). Base:
  `{ singlePerson: false, ageA: 60, ageB: 58, retireAgeA: 68, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92, incomeA: 100000, incomeB: 50000, incomeGrowth: 0, inflation: 0, healthPremiumA: 0, healthPremiumB: 0, survivorEnabled: true, incomeSources: [] }`
  (Canada has no health premium fields: skip those keys there; verify every key exists in that planner's `defaults`).
  Cases (`rows[y].wages`, `rows[y].workingA/B`):
  - `death year`: `survivorPartner: 'A', survivorDeathAge: 67` → `rows[6].wages === 150000` (A 66, both work),
    `rows[7].wages === 50000` and `rows[7].workingA === false` (A's death year), `rows[8].wages === 0` (B 66 retired).
  - `mirror`: `survivorPartner: 'B', survivorDeathAge: 64` → `rows[5].wages === 150000`, `rows[6].wages === 100000`,
    `rows[6].workingB === false`.
  - `already dead`: `survivorPartner: 'A', survivorDeathAge: 59` (below today's 60) → `rows[0].wages === 50000`,
    `rows[0].workingA === false`.
  - `death after retirement`: `survivorPartner: 'A', survivorDeathAge: 80` → `rows[7].wages === 150000` (unchanged).
  - `contributions stop` (US only): the `death year` case plus `k401PctA: 100, catchupPctA: 0, iraPctA: 0, matchA: 0,
    profitSharingPctA: 0, megaBackdoor: false, returnRate: 0, bondReturn: 0, hysaRate: 0, bondYears: 0`:
    `const tr = window.__test_accountTrace()`: `tr[6].trad[1] - tr[5].trad[1] === 24500` (A contributes at 66) and
    `tr[7].trad[1] === tr[6].trad[1]` (nothing in the death year; B still works, so the household draws nothing).
  End with `assert.deepStrictEqual(errors, [])` and `console.log('survivor_salary: all passed')`.
- [ ] **Step 2: Run it; it fails** on `death year` (`rows[7].wages` is 150000) in both planners.
- [ ] **Step 3: The clamp, US.** Right after the `deathYear` const in `runProjection`:
```js
    // A partner who dies before their retirement age stops working at death (E1b): every rule keyed on the
    // retirement age (wages, contributions, health premiums, the both-retired year, the bond ladder) follows.
    if (deceasedIsA) retireAgeA = Math.min(retireAgeA, state.survivorDeathAge);
    if (deceasedIsB) retireAgeB = Math.min(retireAgeB, state.survivorDeathAge);
```
  Then list every use of `retireAgeA` / `retireAgeB` inside `runProjection` (grep the function's line range; at
  `71451fd` they are ~9952-9953 `retirementYear`, 9957 `makeProjectedExpense`, 9967-9968 `workingA/B`, 10001-10002
  `requiredDistributions`, 10200-10201 the Medicare lookback, 10352 `statusCtx`) and write in the report, for each, why
  the clamped value is right (the deceased's Medicare is excluded by the survivor test; after death the survivor owns
  the pools). If one must keep the raw age, keep a `rawRetireAgeA/B` for it and say why.
- [ ] **Step 4: The same clamp, Canada**, after its `deathYear` const (~line 5704), and the same list of uses (~5706-5707,
  5711, 5720-5721, and any other in the function) in the report.
- [ ] **Step 5: Run** `node tests/survivor_salary.js`: passes. `node tests/survivor_symmetry.js`: passes.
- [ ] **Step 6: New Canada scenario** in `tests/snapshot_scenarios.js`, Canada standard list (after `R survivor+loans`):
  `['R death before retirement', { ...R, ageA: 60, ageB: 58, retireAgeA: 68, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92, incomeA: 90000, incomeB: 60000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 64, survivorSpendingPct: 70 }]`.
- [ ] **Step 7: Movers.** `node tests/snapshot.js --root ../fp-e1b-base --dump A --update-nothing`,
  `node tests/snapshot.js --dump B`, `node tests/snapshot.js --compare A B`. Report a table: scenario, kind
  (std / historical), first differing year and field, end total before -> after, depletion age before -> after. Hand
  check for `std R work past 65 survivor`: the removed cash in A's death year equals A's wage that year (A dies at 67,
  retires at 68: one year of salary) and the year's contribution and premium stop with it. Apply the number rule.
- [ ] **Step 8: Update** `npm run snapshot:update` (both baselines; the new Canada entry is added). Badges: US `V122` ->
  `V123`, Canada `V58` -> `V59`. `npm test` green.
- [ ] **Step 9: Timing** (Global Constraints), both tables in the report (the change is two `Math.min` per projection).
- [ ] **Step 10: Commit.**
```bash
git add tests/survivor_salary.js
git commit -m "E1b 1: a partner who dies before retiring stops working at death (both planners; snapshot:update: std R work past 65 survivor moves; US V123, Canada V59)" -- Planner_US.html Planner_Canada.html tests/survivor_salary.js package.json tests/snapshot_scenarios.js tests/snapshots/us.json tests/snapshots/canada.json
```

---

### Task 2: Select field kind (shared); stream owner, kind and contribution panel inputs (US; no number change)

**Files:**
- Modify: `shared/23-dynFieldHtml.js` (then sync: both planners' `23-dynFieldHtml` region)
- Modify: `Planner_US.html` (`DYN.incomeSources` ~line 13942; `normalizeState` right after its `normalizeLists` call;
  `syncControls()` ~line 14243)
- Modify: `tests/legacy_state.js` (US cases, after the E1a ones ~line 65)
- Create: `test_income_streams.js`
- Update (allowed): `tests/snapshots/legacy_state.json`, `tests/snapshots/ui_us.json`

**Interfaces:**
- Produces:
  - list field `{ key, kind: 'select', label, short?, tip?, options: [[value, label], ...], showIf? }`, rendered as
    `<select id="<prefix><i><Key>" data-dyn-i data-dyn-k>`; the change handler stores `el.value` (a string).
  - stream keys (normalized): `owner: 'A'|'B'`, `kind: 'other'|'wages'`, `contribute: boolean`,
    `deferralType: 'traditional'|'roth'`, `deferralPct`, `matchPct`, `afterTaxPct`, `personalPct` (numbers 0-100).
  - `function normalizeUsStreams(s, raw)` (US-only).

- [ ] **Step 1: Write `test_income_streams.js`** (repo root, Playwright, boilerplate as `test_contribution_limits.js`).
  Part 1 (this task):
  - click `[data-dyn-add="incomeSources"]`: `#incSrc0Owner` and `#incSrc0Kind` are `<select>`s with values `A` and
    `other`; `state.incomeSources[0]` has `owner 'A', kind 'other', contribute false, deferralType 'traditional'` and
    the four percentages 0;
  - `#incSrc0Contribute`'s wrapper is hidden; select `wages` (`page.selectOption('#incSrc0Kind', 'wages')`): it shows,
    and `state.incomeSources[0].kind === 'wages'`; the panel fields (`#incSrc0DeferralType`, `#incSrc0DeferralPct`,
    `#incSrc0MatchPct`, `#incSrc0AfterTaxPct`, `#incSrc0PersonalPct`) are hidden until `#incSrc0Contribute` is
    checked, then shown; back to `other`: the checkbox and panel hide;
  - tick `#singlePerson` (through its change event): the owner field's wrapper is hidden; untick: shown;
  - `page.selectOption('#incSrc0Owner', 'B')`, reload: still `'B'` (autosave round trip);
  - 390 x 844: `document.documentElement.scrollWidth > clientWidth` is `false` with the panel open;
  - no page errors; print `test_income_streams: part 1 passed`; leave `// Part 2 (Task 3)` and `// Part 3 (Task 4)`
    markers.
- [ ] **Step 2: Run it; it fails** (`#incSrc0Owner` does not exist).
- [ ] **Step 3: Shared renderer.** In `shared/23-dynFieldHtml.js`:
  - in `dynFieldHtml`, before the money/number return:
```js
    if (f.kind === 'select') {
      const opts = f.options
        .map(([v, l]) => `<option value="${escapeHtml(v)}"${String(item[f.key]) === v ? ' selected' : ''}>${escapeHtml(l)}</option>`)
        .join('');
      return `<div ${wrapAttrs}><label for="${id}">${dynLabel(f.label, f.tip)}${small}</label><select id="${id}" data-dyn-i="${i}" data-dyn-k="${f.key}">${opts}</select></div>`;
    }
```
  - in `apply`: `if (f.kind === 'check') item[f.key] = el.checked; else if (f.kind === 'select') item[f.key] = el.value; else if (f.kind === 'money') ...`
  - the `change` listener: `if ((e.target.matches('input[data-dyn-k]') && e.target.type === 'checkbox') || e.target.matches('select[data-dyn-k]')) apply(e.target);`
  - `dynApplyVisibility`'s query `[data-dyn-i="${i}"][data-dyn-k="${f.key}"]` already matches a select; no change.
  Then `npm run sync`, the CRLF one-liner, `npm run check:shared` (OK). Canada declares no select: its output is
  unchanged.
- [ ] **Step 4: `DYN.incomeSources` (US).** `tip`: drop "Taxed as ordinary income attributed to Partner A." and say
  "Choose who receives it and whether it is W-2 wages." `fresh`:
```js
      fresh: () => ({
        amount: 0, startAge: 65, endAge: 75, followGrowth: true, growth: defaults.incomeGrowth,
        owner: 'A', kind: 'other', contribute: false, deferralType: 'traditional',
        deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0,
      }),
```
  `fields`, in this order:
```js
        { key: 'owner', kind: 'select', label: 'Owner', options: [['A', 'Partner A'], ['B', 'Partner B']], showIf: () => !state.singlePerson },
        {
          key: 'kind', kind: 'select', label: 'Kind', options: [['other', 'Not earned'], ['wages', 'W-2 wages']],
          tip: "W-2 wages: pay from an employer. It pays Social Security and Medicare tax (sharing the owner's wage base with their salary), counts as earned income for the child tax credit, is taxed on the owner's return, and can fund the owner's 401(k) and IRA (tick Contribute to retirement accounts). It does not change Medicare or ACA eligibility or the main job's contributions. It stops in the owner's death year. Not earned (rent, an annuity, alimony): no payroll tax; it continues to the survivor.",
        },
        { ...the existing amount field... },
        { key: 'startAge', kind: 'num', label: 'Starts at age', short: "Owner's age", min: 18, max: 100, step: 1 },
        { key: 'endAge', kind: 'num', label: 'Ends at age', short: "Owner's age; last year received", min: 18, max: 100, step: 1 },
        ...DYN_GROWTH_FIELDS('income'),
        { key: 'contribute', kind: 'check', label: 'Contribute to retirement accounts', short: "From this job's pay", showIf: (it) => it.kind === 'wages' },
        { key: 'deferralType', kind: 'select', label: '401(k) type', options: [['traditional', 'Traditional'], ['roth', 'Roth']], showIf: (it) => it.kind === 'wages' && it.contribute },
        {
          key: 'deferralPct', kind: 'num', label: '401(k) contribution', short: 'Share of the deferral room left, %', min: 0, max: 100, step: 1, showIf: (it) => it.kind === 'wages' && it.contribute,
          tip: "100% fills the yearly 401(k) deferral limit (and the age-50 catch-up) that this person has left after their main job's contribution, up to this job's pay. The limit is per person across all jobs; the main salary is filled first.",
        },
        {
          key: 'matchPct', kind: 'num', label: 'Employer match', short: "% of this job's pay", min: 0, max: 100, step: 0.1, showIf: (it) => it.kind === 'wages' && it.contribute,
          tip: "Added to the owner's traditional 401(k). It uses this employer's own annual limit ($72,000 in 2026, never more than this job's pay, less the deferral); only pay up to the compensation limit ($360,000 in 2026) counts.",
        },
        {
          key: 'afterTaxPct', kind: 'num', label: 'After-tax (mega backdoor) Roth', short: "Share of this employer's room left, %", min: 0, max: 100, step: 1, showIf: (it) => it.kind === 'wages' && it.contribute,
          tip: "Share of the room left under this employer's annual limit after the deferral and the match, and never more than this job's pay less the deferral and catch-up. Goes to the owner's Roth 401(k).",
        },
        {
          key: 'personalPct', kind: 'num', label: 'IRA contribution', short: 'Share of the IRA room left, %', min: 0, max: 100, step: 1, showIf: (it) => it.kind === 'wages' && it.contribute,
          tip: "100% fills the IRA limit this person has left after their main job's IRA contribution, up to their total pay. Traditional or Roth follows the IRA type chosen above.",
        },
```
  (Keep the existing `amount` field object verbatim in its place; `DYN_GROWTH_FIELDS` as today.)
- [ ] **Step 5: `normalizeUsStreams(s, raw)`** (US-only, just below `normalizeLists`, outside every shared
  region), called in `normalizeState` right after `normalizeLists(s, raw);` (~line 1331).
  `normalizeLists` (shared) rebuilds each stream from named keys only (`{ amount, startAge, endAge, followGrowth, growth }`),
  so the new keys must be read from `raw`. Its index alignment: when the save is not legacy (`'otherIncomeEnabled' in raw`
  is false), `s.incomeSources[i]` comes from the i-th object of `raw.incomeSources` (non-objects filtered out, first
  `LIST_MAX` kept); streams appended by the legacy bridge migration sit after those and have no raw counterpart. A legacy
  save's streams carry none of the new keys, so they take the defaults.
```js
  // E1b: income stream owner, kind and retirement-contribution panel (US; Canada carries none of these keys until E1-CA).
  // normalizeLists (shared) keeps only the common stream keys, so these are read from the raw save, aligned the way
  // normalizeLists filtered it. Unknown values fall back to the legacy meaning: Partner A, not earned, no contribution.
  function normalizeUsStreams(s, raw) {
    const legacy = !!raw && 'otherIncomeEnabled' in raw,
      src = !legacy && Array.isArray(raw?.incomeSources) ? raw.incomeSources.filter((x) => x && typeof x === 'object') : [],
      pct0 = (v) => (v !== '' && v !== null && Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : 0);
    s.incomeSources = s.incomeSources.map((x, i) => {
      const r = src[i] || {};
      return {
        ...x,
        owner: r.owner === 'B' ? 'B' : 'A',
        kind: r.kind === 'wages' ? 'wages' : 'other',
        contribute: r.contribute === true,
        deferralType: r.deferralType === 'roth' ? 'roth' : 'traditional',
        deferralPct: pct0(r.deferralPct),
        matchPct: pct0(r.matchPct),
        afterTaxPct: pct0(r.afterTaxPct),
        personalPct: pct0(r.personalPct),
      };
    });
  }
```
  Read `normalizeLists` first and confirm the alignment claim above (the `rows` filter, the `slice(0, LIST_MAX)`, the
  bridge `concat`); if it differs, stop and report rather than guess.
- [ ] **Step 6: Legacy cases** in `tests/legacy_state.js` US block:
  `'stream owner kind': { incomeSources: [{ amount: 10000, startAge: 60, endAge: 70, owner: 'B', kind: 'wages', contribute: true, deferralType: 'roth', deferralPct: 50, matchPct: 4, afterTaxPct: 0, personalPct: 100 }] }`,
  `'stream junk': { incomeSources: [{ amount: 10000, startAge: 60, endAge: 70, owner: 'C', kind: 'self', contribute: 'yes', deferralType: 'x', deferralPct: 400, matchPct: -3, afterTaxPct: 'q' }] }`,
  `'stream no keys': { incomeSources: [{ amount: 10000, startAge: 60, endAge: 70 }] }`,
  `'stream stored B single': { singlePerson: true, incomeSources: [{ amount: 10000, startAge: 60, endAge: 70, owner: 'B' }] }`.
  Assert the exact normalized values of `stream junk` in `test_income_streams.js` part 1 by loading it through
  `window.__test_replaceState` (A, other, false, traditional, 100, 0, 0, 0) and of `stream stored B single` (owner `'B'` kept).
- [ ] **Step 7: Owner field on single-person toggle.** In `syncControls()` (US, not shared), after the single-person
  lines: `dynApplyVisibility('incomeSources');`.
- [ ] **Step 8: Run.** `node test_income_streams.js` part 1 passes. `npm test`: expected failures only in
  `tests/legacy_state.js` (US cases that have streams, plus the new cases) and possibly `tests/snapshot_ui.js` (US; the
  default state has no streams, so its DOM map may not change; if it fails, confirm the diff is only stream controls). Legacy proof:
  a scratch script (not committed) loads every US corpus case on the base and on the working tree and shows that the
  normalized states are equal after deleting the eight new stream keys from every stream; Canada's cases are unchanged.
  Then `node tests/legacy_state.js --update` and, only if it failed, `node tests/snapshot_ui.js --update`; restore `ui_canada.json` if it was
  rewritten with no content change. `us.json` / `canada.json` untouched. `npm test` green.
- [ ] **Step 9: Commit.**
```bash
git add test_income_streams.js
git commit -m "E1b 2: select list fields (shared 23-dynFieldHtml); income stream owner, kind and contribution panel inputs (US; legacy and UI snapshots updated for the new stream keys; no number change)" -- shared/23-dynFieldHtml.js Planner_US.html Planner_Canada.html tests/legacy_state.js test_income_streams.js tests/snapshots/legacy_state.json tests/snapshots/ui_us.json
```

---

### Task 3: The engine reads owner and kind (US; existing snapshots byte-identical)

**Files:**
- Modify: `Planner_US.html`: `listAmountsForYear` (~line 9708), the year loop (~9972-10030 and `payrollTax` call ~10273),
  `buildTaxProfile` (~8466-8580), `taxFor` (~6655-6900), `payrollTax` (~8814), `LAMBDA_PROFILE` (~9010), the `trace.push`
  entry (~10635), US-only test hooks (after `// @@shared:block end`)
- Modify: `tests/state_extra_income.js`, `tests/cliff_guard.js` (~line 278), `tests/solver_primitives.js` (~line 50):
  profile literals `extraIncome` -> `extraA` / `extraB`
- Create: `tests/income_streams.js`
- Modify: `package.json` (`test`: add `node tests/income_streams.js` right after `node tests/contribution_limits.js`)
- Modify: `tests/snapshot_scenarios.js` (three new US scenarios), `test_income_streams.js` (part 2)
- Update (allowed, new entries only): `tests/snapshots/us.json`

**Interfaces:**
- Consumes: Task 2's stream keys.
- Produces:
  - `const STREAM_OUT = { total: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0, contrib: { n: 0, items: [...] } }`
    (module scratch; `items` is `LIST_MAX` preallocated objects `{ owner: 0, pay: 0, stream: null }`, owner 0 = A,
    1 = B).
  - `function streamAmountsForYear(streams, ctx, out)` with `ctx = { ageA, ageB, deadA, deadB, single, year, factor, incomeFactor }`; returns `out`.
  - profile fields `extraA`, `extraB` (replacing `extraIncome`).
  - `payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, filing, year, streamWagesA = 0, streamWagesB = 0 })`.
  - `buildTaxProfile({ ..., streamWagesA = 0, streamWagesB = 0, streamOtherA = 0, streamOtherB = 0, streamWageCutA = 0, streamWageCutB = 0 })`
    (the cuts are 0 until Task 4).
  - trace entries gain `profile` (a copy) and `ficaTax`.
  - hooks: `window.__test_streamAmountsForYear(streams, ctx)` (returns a plain copy of `out`, `contrib` as an array of
    `{ owner, pay }`), `window.__test_payrollTax = payrollTax`.

- [ ] **Step 1: Write `tests/income_streams.js`** (boilerplate as `tests/contribution_limits.js`; clock 2026-06-15).
  `S = (o) => ({ amount: 10000, startAge: 50, endAge: 70, followGrowth: false, growth: 0, owner: 'A', kind: 'other', ...o })`,
  `ctx0 = { ageA: 60, ageB: 55, deadA: false, deadB: false, single: false, year: 0, factor: 1, incomeFactor: 1 }`.
  Pure function:
  - `owner's age`: `S({ owner: 'B', startAge: 56 })` at `ctx0` (B 55) → nothing; at `ageB: 56` → `otherB 10000`.
  - `kinds`: `[S({ kind: 'wages' }), S({ owner: 'B', kind: 'wages', amount: 5000 }), S({ amount: 3000 })]` → `wagesA 10000, wagesB 5000, otherA 3000, total 18000`.
  - `missing keys`: `{ amount: 10000, startAge: 50, endAge: 70, followGrowth: false, growth: 0 }` → `otherA 10000`, all else 0.
  - `dead owner`: `deadA: true`: `S({ kind: 'wages' })` → nothing (total 0); `S({})` → `otherB 10000` (to the survivor).
  - `survivor's own W-2`: `deadA: true`, `S({ owner: 'B', kind: 'wages' })` → `wagesB 10000`.
  - `single with stored B`: `single: true, ageB: null`, `S({ owner: 'B', startAge: 60 })` → `otherA 10000` (A's age 60 in window).
  - `total exactness`: a mixed list of five streams with growth (`followGrowth: true` and own `growth: 2.7`) at
    `year: 7, factor: 1.21, incomeFactor: 1.3`: `Object.is(out.total, oldTotal)` where `oldTotal` is today's expression
    computed in the test page: `streams.filter(active on A's age).reduce((sum, s) => sum + s.amount * growthFactor, 0)`
    with every stream owned by A and not earned (so the windows agree).
  - `contrib list`: `S({ kind: 'wages', contribute: true })` → `contrib` `[{ owner: 0, pay: 10000 }]`; same with
    `kind: 'other'` → `[]`; dead owner → `[]`.
  Payroll (`__test_payrollTax`, year 0, filing `'mfj'`):
  - `{ wageA: 100000, wageB: 150000, healthPremiumA: 0, healthPremiumB: 0, filing: 'mfj', year: 0, streamWagesB: 50000 }`
    → `7650 + (184500 * 0.062 + 200000 * 0.0145) + (300000 - 250000) * 0.009` = 7,650 + 14,339 + 450 = **22,439**
    (B's Social Security part capped at the 184,500 wage base: 11,439).
  - same without the stream → 7,650 + 11,475 = **19,125** (combined 250,000: no Additional Medicare Tax).
  ACTC (`__test_tax.taxFor`, `state.stateTax = 'tx'`, a profile literal like `tests/state_extra_income.js`'s with
  `filing: 'mfj', ageA: 60, ageB: 60, year: 0, extraA: 0, extraB: 0, dependents: [{ age: 5, student: false, qualifyingChild: true }]`):
  - W-2: `wageA: 10000, otherA: 10000` → **-1,125** (no federal tax under the deduction; ACTC = min(2,200, 1,700,
    15% x (10,000 - 2,500) = 1,125)).
  - not earned: `wageA: 0, otherA: 10000, extraA: 10000` → **0**.
  Two returns (synthetic flat-10% state `zzx` as in `tests/state_extra_income.js`, but with `standardDeduction: { single: 10000, mfj: 0, hoh: 10000 }`):
  - `filing: 'single', singlePerson: false, wageA: 20000, otherA: 20000, otherB: 30000, extraB: 30000` → state tax
    **3,000** (A 1,000 + B 2,000; with the extra on A's return it would be 4,000).
  Engine (`window.__test_accountTrace(...)` after setting state; `trace[y].profile`, `trace[y].ficaTax`). Base for every
  engine case: `{ singlePerson: false, ageA: 60, ageB: 58, retireAgeA: 60, retireAgeB: 58, incomeA: 0, incomeB: 0, inflation: 0, incomeGrowth: 0, healthPremiumA: 0, healthPremiumB: 0, stateTax: 'tx' }`:
  - unmarried couple (`filingStatus: 'single'`), both retired (`ageA 60, ageB 58, retireAgeA 60, retireAgeB 58`),
    `incomeSources: [S({ owner: 'B', kind: 'wages', amount: 40000, startAge: 50 })]`, `inflation: 0`: year 0
    `profile.wageB === 40000`, `profile.otherB >= 40000`, `profile.wageA === 0`, `ficaTax === 40000 * 0.0765` (3,060);
  - `survivor W-2`: couple, `survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 62` (A 60 today),
    streams `[S({ kind: 'wages', amount: 20000 }), S({ amount: 5000 })]`: year 1 `profile.wageA` includes 20,000 (A
    alive) via `ficaTax === 20000 * 0.0765`; year 2 (death year) `ficaTax === 0`, the remapped profile's `otherA`
    includes 5,000 and its `extraA === 5000`, and `rows[2].wages` lacks the 20,000 (is 5,000 with no other wages);
  - `B dies`: `survivorPartner: 'B'`, `survivorDeathAge: 60` (B 58 today), `S({ owner: 'B', amount: 5000 })`: year 2
    profile `extraA === 5000` and `otherA` includes it (single branch reads slot A);
  - `legacy identical`: the scenario `R incomeSources` shape (`incomeSources: [{ amount: 20000, startAge: 55, endAge: 66, followGrowth: true, growth: 3 }]`)
    vs the same with `owner: 'A', kind: 'other'` added: `JSON.stringify(rows)` equal.
  End with the error check and `console.log('income_streams: all passed')`.
- [ ] **Step 2: Run it; it fails** (`__test_streamAmountsForYear is not a function`).
- [ ] **Step 3: `streamAmountsForYear`** just above `listAmountsForYear`:
```js
  // E1b: this year's income streams split by owner and kind. Pure (reads no state): owner A in single-person mode, else
  // the stored owner (anything but 'B' is A); the window is tested on the owner's age. W-2 wages stop once the owner is
  // dead; income that is not earned moves to the survivor. `total` is one running sum in list order (the old
  // extraIncome expression, bit for bit). Contributing W-2 streams are listed for streamPlanContributions (E1b 5.4).
  const STREAM_OUT = {
    total: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0,
    contrib: { n: 0, items: Array.from({ length: LIST_MAX }, () => ({ owner: 0, pay: 0, stream: null })) },
  };
  function streamAmountsForYear(streams, ctx, out) {
    out.total = 0; out.wagesA = 0; out.wagesB = 0; out.otherA = 0; out.otherB = 0; out.contrib.n = 0;
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i],
        b = !ctx.single && s.owner === 'B',
        age = b ? ctx.ageB : ctx.ageA;
      if (!(age >= s.startAge && age <= s.endAge)) continue;
      const amount = s.amount * itemGrowthFactor(s, ctx.year, 'income', ctx.factor, ctx.incomeFactor),
        dead = b ? ctx.deadB : ctx.deadA;
      if (s.kind === 'wages') {
        if (dead) continue;
        if (b) out.wagesB += amount; else out.wagesA += amount;
        if (s.contribute === true) {
          const it = out.contrib.items[out.contrib.n++];
          it.owner = b ? 1 : 0; it.pay = amount; it.stream = s;
        }
      } else if (b !== dead) out.otherB += amount; // B alive and owner, or A dead and owner A: B's bucket
      else out.otherA += amount;
      out.total += amount;
    }
    return out;
  }
```
  Check the `total` order against today's `filter(...).reduce((sum, s) => sum + ...)`: the reduce starts at `0` and adds
  each active stream in list order, as this loop does; a W-2 stream of a dead owner is excluded from both (intended). The
  `b !== dead` line: owner B alive -> B; owner B dead -> A; owner A alive -> A; owner A dead -> B. Note `dead` is the
  OWNER's flag. Write it out readably if you prefer, with the same four outcomes.
  `listAmountsForYear({ age, ageB, year, factor, incomeFactor, deadA, deadB, single })` calls it with
  `streamAmountsForYear(state.incomeSources, { ageA: age, ageB, deadA, deadB, single, year, factor, incomeFactor }, STREAM_OUT)`
  (reuse one module-level ctx object to avoid an allocation per year) and returns `extraIncome: STREAM_OUT.total`
  as today plus `streams: STREAM_OUT`.
- [ ] **Step 4: Year loop.** `ageB` for the ctx is `singlePerson ? null : state.ageB + year` (already computed);
  `deadA = deceasedIsA && year >= deathYear`, `deadB = deceasedIsB && year >= deathYear`. Pass
  `streamWagesA/B: streams.wagesA/wagesB`, `streamOtherA/B: streams.otherA/otherB` to `buildTaxProfile`, and
  `streamWagesA/B` to `payrollTax`. `wages` (cash) keeps `+ extraIncome`. `retirementContributions` unchanged in this task.
- [ ] **Step 5: `buildTaxProfile`.** Replace the `extraIncome` parameter by the four stream parameters (and
  `streamWageCutA/B = 0`). Then:
```js
    const profileWageA = Math.max(0, wageA - traditionalContribA - healthPremiumA) + Math.max(0, streamWagesA - streamWageCutA),
      profileWageB = Math.max(0, wageB - traditionalContribB - healthPremiumB) + Math.max(0, streamWagesB - streamWageCutB);
    const otherA = profileWageA + pensionA + rmdA + streamOtherA,
      otherB = profileWageB + pensionB + rmdB + streamOtherB;
```
  (move the `profileWage` lines above `otherA/B`; today's `otherA` is `max(...) + pensionA + rmdA + extraIncome`: with a
  zero stream wage, `max(...) + 0` is the same double, and `streamOtherA` stands where `extraIncome` stood. For B today
  is `max(...) + pensionB + rmdB`; `+ 0` leaves it exact.) Profile: `extraA: streamOtherA, extraB: streamOtherB` in the
  normal branch; in the A-deceased remap `otherA: otherB` (no `+ extraIncome`: A's not-earned streams are already in B's
  bucket), `extraA: streamOtherB, extraB: 0`, `wageA: profileWageB`. Update the comment that says household streams
  ride in Partner A's slot. `LAMBDA_PROFILE`: replace `extraIncome: 0` by `extraA: 0, extraB: 0`.
  Exactness check for the remap with legacy streams (owner A, not earned) and A dead: today `otherA = otherB_base + extraIncome`;
  now `otherA = otherB = otherB_base + streamOtherB` with `streamOtherB` the same sum: same double.
- [ ] **Step 6: `taxFor`.** Replace `extra = profile.extraIncome || 0` by
  `extraA = profile.extraA || 0, extraB = profile.extraB || 0`. Joint branch: `const extra = extraA + extraB;` and
  keep `sources.wages = profile.wageA + profile.wageB + invOrd + extra;`. Single branch: `+ extraA`. Two-filer branch:
  `sourcesA.wages = profile.wageA + invA + extraA;`, `sourcesB.wages = profile.wageB + invB + extraB;`. Update the
  comment ("Income streams ... ride in Partner A's slot") to say the not-earned streams ride in their owner's slot.
- [ ] **Step 7: `payrollTax`.**
```js
  function payrollTax({ wageA, wageB, healthPremiumA, healthPremiumB, filing, year, streamWagesA = 0, streamWagesB = 0 }) {
    const taxableWagesA = Math.max(0, wageA - healthPremiumA) + streamWagesA,
      taxableWagesB = Math.max(0, wageB - healthPremiumB) + streamWagesB;
```
- [ ] **Step 8: Trace and hooks.** In the `trace.push({...})` entry add `profile: { ...profile }, ficaTax` (trace is
  only passed by test hooks). Hooks after `// @@shared:block end`:
```js
  window.__test_streamAmountsForYear = (streams, ctx) => {
    const o = streamAmountsForYear(streams, ctx, STREAM_OUT);
    return {
      total: o.total, wagesA: o.wagesA, wagesB: o.wagesB, otherA: o.otherA, otherB: o.otherB,
      contrib: o.contrib.items.slice(0, o.contrib.n).map((it) => ({ owner: it.owner, pay: it.pay })),
    };
  };
  window.__test_payrollTax = payrollTax;
```
- [ ] **Step 9: Profile literals in tests.** `tests/state_extra_income.js`: `extraIncome: 20000` -> `extraA: 20000`
  (its header comment: the field is `profile.extraA` / `extraB`, each on its owner's return); `tests/cliff_guard.js` and
  `tests/solver_primitives.js`: `extraIncome: 0` -> `extraA: 0, extraB: 0`. Grep `extraIncome` in `tests/` and
  `test_*.js`: no profile literal may still use it.
- [ ] **Step 10: Run.** `node tests/income_streams.js` passes; `node tests/state_extra_income.js`,
  `node tests/survivor_symmetry.js`, `node tests/two_return_magi.js`, `node tests/child_credits.js` pass.
  `node tests/snapshot.js` passes with the committed baseline (existing entries byte-identical: this is the exactness
  gate; if any differs, stop and find the changed sum order, do not update).
- [ ] **Step 11: New scenarios** (US standard list, after `R incomeSources`):
  - `['R incomeSources B wages', { ...R, incomeSources: [{ amount: 30000, startAge: 52, endAge: 60, followGrowth: true, growth: 3, owner: 'B', kind: 'wages' }] }]`
  - `['R incomeSources B other two returns', { ...R, filingStatus: 'single', incomeSources: [{ amount: 40000, startAge: 50, endAge: 70, followGrowth: true, growth: 3, owner: 'B', kind: 'other' }] }]`
  - `['R survivor streams', { ...R, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 58, incomeSources: [{ amount: 25000, startAge: 52, endAge: 65, followGrowth: true, growth: 3, owner: 'A', kind: 'wages' }, { amount: 15000, startAge: 52, endAge: 90, followGrowth: true, growth: 3, owner: 'A', kind: 'other' }] }]`
  `npm run snapshot:update`; `git diff tests/snapshots/us.json` shows only the three added entries.
- [ ] **Step 12: `test_income_streams.js` part 2:** a W-2 stream owned by B (couple, both retired) raises
  `window.fireProjectionRows[0].tax` against the same stream marked Not earned (payroll tax), and changing the owner
  from A to B with `filingStatus: 'single'` changes `fireProjectionRows[0].tax`. Run it.
- [ ] **Step 13: `npm test` green. Commit.**
```bash
git add tests/income_streams.js
git commit -m "E1b 3: income streams by owner and kind (payroll tax, ACTC earned income, the owner's return; W-2 stops at the owner's death); existing snapshots byte-identical, three new scenarios" -- Planner_US.html tests/income_streams.js tests/state_extra_income.js tests/cliff_guard.js tests/solver_primitives.js package.json tests/snapshot_scenarios.js tests/snapshots/us.json test_income_streams.js
```

---

### Task 4: Retirement contributions from W-2 streams (US; existing snapshots byte-identical)

**Files:**
- Modify: `Planner_US.html`: new `streamPlanContributions` just above `retirementContributions` (~line 8122);
  `retirementContributions` (~8123-8225); the year loop's call and its `buildTaxProfile` call; the
  `__test_retirementContributions` hook; badge `V123` -> `V124`
- Create: `tests/stream_contributions.js`
- Modify: `package.json` (`test`: add `node tests/stream_contributions.js` right after `node tests/income_streams.js`)
- Modify: `tests/snapshot_scenarios.js` (one new US scenario), `test_income_streams.js` (part 3)
- Update (allowed, new entry only): `tests/snapshots/us.json`

**Interfaces:**
- Consumes: `STREAM_OUT.contrib` (`{ n, items: [{ owner: 0|1, pay, stream }] }`), `STREAM_OUT.wagesA/B` (Task 3);
  `allocatePlanRoom`, `PLAN_LIMITS`, `pct` (E1a).
- Produces:
  - `const STREAM_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employer: 0, employeeTrad: 0, employeeRoth: 0, wageCut: [0, 0] }`
  - `function streamPlanContributions(list, rooms, limits, personalPretax, out)`: `list` as `STREAM_OUT.contrib`;
    `rooms = { deferral: [A, B], catchUp: [A, B], personal: [A, B] }` (dollars left after the salary; mutated);
    `limits = { annualAdditions, compensation, rothCatchUpWages }` (dollars this year); `personalPretax` boolean
    (household IRA type is traditional). Returns `out`.
  - `retirementContributions({ wageA, wageB, age, ageB, singlePerson, limitFactor, streamList = NO_STREAM_LIST, streamWagesA = 0, streamWagesB = 0 })`
    additionally returns `streamWageCutA`, `streamWageCutB`; its `traditionalContrib`, `rothContrib`, `acct`,
    `employerContrib` include the stream amounts.
  - hook `window.__test_streamPlanContributions(items, rooms, limits, personalPretax)` (builds a list from plain items,
    returns a copy of `out` and of `rooms`).

- [ ] **Step 1: Write `tests/stream_contributions.js`** (boilerplate as `tests/contribution_limits.js`). Pure function,
  `L = { annualAdditions: 72000, compensation: 360000, rothCatchUpWages: 150000 }`,
  `item = (o) => ({ owner: 0, pay: 30000, stream: { kind: 'wages', contribute: true, deferralType: 'traditional', deferralPct: 100, matchPct: 0, afterTaxPct: 0, personalPct: 0, ...o.s }, ...o })`
  (`spc(items, rooms, pretax = false)` calls the hook). Slots: `trad[1]` 401(k) A, `roth[1]` Roth 401(k) A, `roth[0]` Roth IRA A, `trad[3]` 401(k) B.
  - `no room`: rooms `{ deferral: [0, 0], catchUp: [0, 0], personal: [0, 0] }` (salary deferred 24,500 at 45) → all 0.
  - `half room`: deferral `[12250, 0]` → `trad[1] 12250`, `wageCut[0] 12250`, `employeeTrad 12250`.
  - `catch-up shared, Roth`: at 55 salary used 24,500 and 4,000 of 8,000 catch-up: rooms deferral `[0,0]`, catchUp
    `[4000, 0]`, stream `deferralType: 'roth'` → `roth[1] 4000`, `trad[1] 0`, `wageCut[0] 0`.
  - `Roth catch-up line`: rooms deferral `[24500, 0]`, catchUp `[8000, 0]`, pay 200,000, traditional → `trad[1] 24500`
    (base), `roth[1] 8000` (catch-up, pay over 150,000), `wageCut[0] 24500`.
  - `match limited by own room`: pay 20,000, rooms deferral `[24500,0]`, `matchPct 50` → deferral 20,000, room
    `20000 - 20000 = 0`, match 0: `trad[1] 20000`, `employer 0`. With `deferralPct 50`: deferral 10,000, match 10,000:
    `trad[1] 20000`, `employer 10000`.
  - `after-tax capped`: pay 40,000, rooms deferral `[24500,0]` catchUp `[8000,0]`, `afterTaxPct 100` → deferral 32,500
    (24,500 + 8,000, traditional, pay under 150,000), room `40000 - 24500 = 15500`, after-tax
    `min(15500, 40000 - 32500) = 7500`: `trad[1] 32500`, `roth[1] 7500`.
  - `IRA by comp`: rooms personal `[5000, 0]` (the caller's `min(7,500 - 0, 5,000 - 0)` for a person with 5,000 of
    pay), `personalPct 100`, pretax false → `roth[0] 5000`; pretax true → `trad[0] 5000`, `wageCut[0] 5000`.
  - `two streams in order`: items pay 15,000 then 30,000, deferral `[24500, 0]` → `trad[1] 24500` (15,000 + 9,500),
    rooms after `deferral[0] 0`.
  - `owner B`: `owner: 1` → `trad[3]`, `wageCut[1]`.
  Rooms through `retirementContributions` (`__test_retirementContributions(patch, args)` with
  `args.streamList` built by the hook from plain items, `streamWagesA`):
  - `salary then stream`: patch `{ k401Type: 'traditional', k401PctA: 50, catchupPctA: 0, iraPctA: 60, iraType: 'roth', megaBackdoor: false, matchA: 0, profitSharingPctA: 0 }`,
    args `{ wageA: 100000, age: 45, wageB: 0, ageB: null, singlePerson: true, limitFactor: 1, streamWagesA: 30000, streamList: [item({ s: { personalPct: 100 } })] }`
    → `acct.trad[1] 24500` (12,250 + 12,250), `acct.roth[0] 7500` (salary IRA 4,500 + stream 3,000), `streamWageCutA 12250`,
    `traditionalContrib === 12250 + 12250`.
  - `kind other ignores the panel`: through `__test_accountTrace` (Step 8 below) with a stream `kind: 'other', contribute: true, deferralPct: 100`:
    no change in any `acct` slot versus `contribute: false`.
  Engine (`__test_accountTrace`; both retired at 45 / 43 so no catch-up applies: `ageA: 45, ageB: 43, retireAgeA: 45,
  retireAgeB: 43`; `inflation: 0, returnRate: 0, bondReturn: 0, hysaRate: 0, bondYears: 0, rothConvEnabled: false`, and
  `taxable: 2000000, spending: 50000` so the year's need is drawn from taxable, never from the traditional pool):
  - `lands and cuts`: A's W-2 stream 50,000, `contribute: true, deferralType: 'traditional', deferralPct: 100, matchPct: 4`:
    year 0 `trace[0].trad[1] - state.trad401kA === 24500 + 2000` (no growth, no draw), `trace[0].profile.wageA === 25500`,
    `trace[0].ficaTax === 50000 * 0.0765`.
  - `single stored B`: `singlePerson: true`, the same stream with `owner: 'B'`: dollars land in slot 1 (`trad[1]`), slot 3 unchanged.
  End with the error check and `console.log('stream_contributions: all passed')`.
- [ ] **Step 2: Run it; it fails** (`__test_streamPlanContributions is not a function`).
- [ ] **Step 3: `streamPlanContributions`** just above the `PLAN_REQ` lines:
```js
  // E1b: retirement contributions from contributing W-2 income streams, after the salary. Pure (rooms, limits and rates
  // passed in; country-neutral names; no allocation). The deferral and IRA rooms are per person and are what the salary
  // left (IRC 402(g), 219(b)); each stream is its own employer for the annual-additions room (415(c)) and the
  // compensation limit. Order per stream: deferral (base, then catch-up), the match, after-tax money; then the IRA.
  // Slots: ACCOUNT_SLOTS order (IRA A, 401(k) A, IRA B, 401(k) B).
  const STREAM_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employer: 0, employeeTrad: 0, employeeRoth: 0, wageCut: [0, 0] },
    STREAM_REQ = [0],
    STREAM_GOT = [0],
    NO_STREAM_LIST = { n: 0, items: [] };
  function streamPlanContributions(list, rooms, limits, personalPretax, out) {
    for (let k = 0; k < 4; k++) { out.trad[k] = 0; out.roth[k] = 0; }
    out.employer = 0; out.employeeTrad = 0; out.employeeRoth = 0; out.wageCut[0] = 0; out.wageCut[1] = 0;
    for (let i = 0; i < list.n; i++) {
      const it = list.items[i], s = it.stream, o = it.owner, pay = it.pay,
        plan = o * 2 + 1, ira = o * 2;
      if (s.kind !== 'wages' || s.contribute !== true) continue;
      const want = Math.min(pay, rooms.deferral[o] + rooms.catchUp[o]) * pct(s.deferralPct),
        base = Math.min(want, rooms.deferral[o]),
        cu = want - base;
      rooms.deferral[o] -= base;
      rooms.catchUp[o] -= cu;
      const baseRoth = s.deferralType === 'roth',
        cuRoth = baseRoth || pay > limits.rothCatchUpWages;
      if (baseRoth) out.roth[plan] += base; else { out.trad[plan] += base; out.wageCut[o] += base; }
      if (cuRoth) out.roth[plan] += cu; else { out.trad[plan] += cu; out.wageCut[o] += cu; }
      STREAM_REQ[0] = Math.min(pay, limits.compensation) * pct(s.matchPct);
      const left = allocatePlanRoom(Math.min(pay, limits.annualAdditions) - base, STREAM_REQ, STREAM_GOT),
        match = STREAM_GOT[0],
        afterTax = Math.min(left, Math.max(0, pay - base - cu)) * pct(s.afterTaxPct);
      out.trad[plan] += match;
      out.employer += match;
      out.roth[plan] += afterTax;
      const personal = rooms.personal[o] * pct(s.personalPct);
      rooms.personal[o] -= personal;
      if (personalPretax) { out.trad[ira] += personal; out.wageCut[o] += personal; } else out.roth[ira] += personal;
      out.employeeTrad += (baseRoth ? 0 : base) + (cuRoth ? 0 : cu) + (personalPretax ? personal : 0);
      out.employeeRoth += (baseRoth ? base : 0) + (cuRoth ? cu : 0) + afterTax + (personalPretax ? 0 : personal);
    }
    return out;
  }
```
- [ ] **Step 4: `retirementContributions`.** Add the three parameters. After the salary's `megaA/megaB` lines, build the
  rooms in a module scratch `STREAM_ROOMS = { deferral: [0, 0], catchUp: [0, 0], personal: [0, 0] }` and
  `STREAM_LIMITS = { annualAdditions: 0, compensation: 0, rothCatchUpWages: 0 }` (no allocation):
```js
    STREAM_ROOMS.deferral[0] = Math.max(0, baseLimitA - kBaseA);
    STREAM_ROOMS.deferral[1] = singlePerson ? 0 : Math.max(0, baseLimitB - kBaseB);
    STREAM_ROOMS.catchUp[0] = Math.max(0, catchupBaseA - kCatchupA);
    STREAM_ROOMS.catchUp[1] = Math.max(0, catchupBaseB - kCatchupB);
    STREAM_ROOMS.personal[0] = Math.max(0, Math.min(iraLimitA - iraA, wageA + streamWagesA - iraA));
    STREAM_ROOMS.personal[1] = Math.max(0, Math.min(iraLimitB - iraB, wageB + streamWagesB - iraB));
    STREAM_LIMITS.annualAdditions = annualAdditionLimit;
    STREAM_LIMITS.compensation = compLimit;
    STREAM_LIMITS.rothCatchUpWages = rothCatchupThreshold;
    const sp = streamPlanContributions(streamList, STREAM_ROOMS, STREAM_LIMITS, state.iraType === 'traditional', STREAM_PLAN);
```
  Then add the stream terms AFTER today's expressions, never inside them:
  `traditionalContrib = traditionalContribA + traditionalContribB + sp.employeeTrad`,
  `rothContrib = rothContribA + rothContribB + sp.employeeRoth`, each `acct.trad[k]` / `acct.roth[k]` as
  `(today's expression) + sp.trad[k]` / `+ sp.roth[k]`, `employerContrib: matchA + matchB + profitA + profitB + sp.employer`,
  and return `streamWageCutA: sp.wageCut[0], streamWageCutB: sp.wageCut[1]`. `traditionalContribA/B` stay salary-only
  (they feed the salary's taxable wage). Exactness: every added term is an exact 0 for a legacy save.
  Confirm before relying on it that `traditionalContrib` and `rothContrib` are what the year loop subtracts from cash
  (~line 10290) and that `employerContrib` is the loop's `employerMatch`: the employee's stream money then leaves cash
  and the match does not.
- [ ] **Step 5: Year loop.** Pass `streamList: streams.contrib, streamWagesA: streams.wagesA, streamWagesB: streams.wagesB`
  to `retirementContributions` (its call comes after `listAmountsForYear`), and `streamWageCutA/B` from its result to
  `buildTaxProfile`.
- [ ] **Step 6: Hooks.** `__test_streamPlanContributions(items, rooms, limits, personalPretax)` builds
  `{ n: items.length, items }`, deep-copies `rooms`, calls the function with `STREAM_PLAN`, returns
  `{ out: JSON.parse(JSON.stringify(STREAM_PLAN)), rooms }`. `__test_retirementContributions`: if `args.streamList` is
  an array, convert it to `{ n, items }` before the call.
- [ ] **Step 7: Run** `node tests/stream_contributions.js` (passes); `node tests/contribution_limits.js`,
  `node tests/account_ledger.js`, `node tests/account_inputs.js` pass; `node tests/snapshot.js` passes with the
  committed baseline (exactness gate; stop on any difference).
- [ ] **Step 8: Scenario** (US standard list, after Task 3's):
  `['R stream contributions', { ...R, incomeSources: [{ amount: 60000, startAge: 52, endAge: 62, followGrowth: true, growth: 3, owner: 'A', kind: 'wages', contribute: true, deferralType: 'roth', deferralPct: 100, matchPct: 5, afterTaxPct: 50, personalPct: 100 }] }]`.
  `npm run snapshot:update`; the json diff shows only the added entry.
- [ ] **Step 9: `test_income_streams.js` part 3:** ticking `#incSrc0Contribute` with `#incSrc0DeferralPct` 100 on a W-2
  stream lowers `fireProjectionRows[0].tax` (traditional) and raises the next row's `traditional`. Run it.
- [ ] **Step 10: Badge** US `V123` -> `V124`. **Timing** (Global Constraints) on the tip, both tables in the report.
  `npm test` green.
- [ ] **Step 11: Commit.**
```bash
git add tests/stream_contributions.js
git commit -m "E1b 4: retirement contributions from W-2 income streams (deferral and IRA rooms shared with the salary, per-employer match and after-tax room); existing snapshots byte-identical, one new scenario; US V124" -- Planner_US.html tests/stream_contributions.js package.json tests/snapshot_scenarios.js tests/snapshots/us.json test_income_streams.js
```

---

### Task 5: Docs and the implementation notes

**Files:**
- Modify: `README.md` (US: stream owner, kind and contributions; both: a partner who dies before retiring stops working)
- Modify: `CLAUDE.md` ("Add-as-you-go lists": stream owner and kind, the windows on the owner's age, the `select` field
  kind; "Retirement accounts (US)" / "Contribution limits": `streamPlanContributions`; the profile's `extraA/extraB`
  replacing `extraIncome` in the `taxFor` / survivor notes; `runProjection`: the clamped retirement age; the tests list:
  `tests/income_streams.js`, `tests/stream_contributions.js`, `tests/survivor_salary.js`)
- Modify: `docs/next-batches-plan.md`: a new `##### E1b: implementation (US V122 -> V124, Canada V58 -> V59)` block right
  after the E1b design block (before `---` / `## Batch 5`), in the E1a block's shape: commits with hashes, the
  failing-then-passing table, the Task 1 movers table and hand check, the legacy proof, the snapshot notes (which
  entries were added), both timing tables per measured task, and "For the owner" items.

- [ ] **Step 1:** Write the three edits (text to a file, then insert with a node script; keep CRLF).
- [ ] **Step 2:** `npm test` green (docs only).
- [ ] **Step 3: Commit.**
```bash
git commit -m "E1b 5: README, CLAUDE.md and implementation notes (docs only)" -- README.md CLAUDE.md docs/next-batches-plan.md
```

Report to the owner: the branch tip, each commit's hash and one-line summary, the Task 1 movers table, both timing
tables for Tasks 1 and 4, and anything that did not go as planned.
